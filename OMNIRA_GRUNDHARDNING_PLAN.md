# Omnira — Grundhärdningsplan (Fas 0–1)

_Planeringsdokument. Ingen kod. Grundat i faktisk kod: `packages/db/full_schema_run_in_supabase.sql`, `supabase/migrations/*`, `apps/web/lib/{atlas,ai,supabase,business,os}/*`._

**Låst princip (denna plan kodifierar den):** Ingen browser-agent, desktop-agent eller annan cross-system-automation byggs innan isolation-härdningen är planerad, genomförd och **bevisbart tät**. Mark förblir inspirationskälla för Browser/Desktop Agent — senare.

**Den hårda invarianten:** Familje-Stunden, GainPilot, The Prompt och framtida projekt delar **aldrig** minne, embeddings, secrets, canon eller arbetsyta. Cross-project endast via Global Atlas som broker.

**Komplexitet:** S (dagar) · M (1–2 v) · L (3–5 v).

---

## 1. Isolation-härdning

### Nuvarande implementation
- **Kärntabellerna är korrekt skyddade.** `full_schema_run_in_supabase.sql` (rad 232–283) slår på RLS **och** definierar owner-policies för `projects, agents, workflows, runs, run_logs, outputs, memories, approvals, manager_tasks, agent_messages, evaluations, conversations, sprints, planning_items, daily_notes`. Mönstret är genomgående: `project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())` (rad 268–283).
- **Senare migrationer bryter mönstret.** Tabeller som lagts till i separata migrationer har RLS **påslaget men saknar policies** → default-deny för vanliga klienter, men **service-role ser allt**:
  - `leads`, `campaigns`, `revenue_events` — `20260601_business_metrics.sql`
  - `media_insights` — `20260601_media_insights.sql`
  - `campaign_plans`, `campaign_briefs`, `draft_posts`, `guard_reports` — `20260603_marketing_engine_foundation.sql`
  - `account_snapshots`, `opportunities` — `20260602_atlas_growth_*`
  - `revenue_snapshots` — `20260602_stripe_intelligence_*`
  - `platform_tokens` — RLS på, ingen policy (numera per-`project_id`)
  - `platform_config` — global singleton (avsiktligt global)
- **Appen kör service-role och kringgår RLS.** `apps/web/lib/supabase/admin.ts` (`createAdminClient`, dess egen docstring varnar "bypasses RLS… NEVER expose… without careful auth checks") används brett: `business/store.ts`, `cost/track.ts`, `ai/manager.ts`, `ai/memory/*`, `bugscanner/*`.
- **Värsta mönstret:** `os/business.ts` → `fetchBusinessSnapshots` hämtar **alla rader** från `leads/revenue_events/campaigns` (utan `where`) och filtrerar per projekt **i minnet**. Isolation hänger då helt på att appkoden inte brister.

### Målimplementation
- **RLS-policy på 100% av tenant-tabeller**, samma owner-mönster som kärnan. Inga tenant-tabeller med "RLS på, policy saknas".
- **Service-role blir undantag, inte regel.** Användarinitierade läsningar går via RLS-skyddad klient (auth-kontext). Service-role reserveras för bakgrundsmotorn (run-drainer, cron) och måste **alltid själv scopa `project_id` i SQL**.
- **Inga "hämta-allt-och-filtrera-i-minnet".** Varje query bär `project_id` i `where`-satsen.
- **`project_id` blir NOT NULL** på tenant-tabeller där det idag är nullable (t.ex. `manager_tasks`, `agent_messages` är `NULL`-tillåtande) — en rad utan projekt är en isolationsläcka.

### Exakta filer/tabeller som påverkas
- **Nya migrationer (policies):** lägg `CREATE POLICY …_owner` för `leads, campaigns, revenue_events, media_insights, campaign_plans, campaign_briefs, draft_posts, guard_reports, account_snapshots, opportunities, revenue_snapshots, platform_tokens`.
- **Migration (NOT NULL + backfill):** `manager_tasks.project_id`, `agent_messages.project_id` (idag `ON DELETE SET NULL`/nullable).
- **App:** `apps/web/lib/os/business.ts` (`fetchBusinessSnapshots` → projekt-scopad query), `apps/web/lib/business/store.ts`, `apps/web/lib/supabase/admin.ts` (lägg en kommentar/guard-konvention), samtliga `createAdminClient`-callsites i `cost/track.ts`, `ai/manager.ts`, `ai/memory/*`.

### Risker
- **Att slå på policies kan tysta befintliga flöden** som omedvetet förlitar sig på service-role-bypass → testa i staging/branch först (Supabase branches finns).
- **`NOT NULL`-migration kan faila** om det finns historiska rader utan `project_id` → kräver backfill + default-projekt-beslut innan constraint.
- **Prestanda:** `project_id IN (SELECT …)`-subquery per rad — verifiera index på `project_id` (finns på kärntabeller, `idx_*_project`; lägg på nya).
- **Falsk trygghet:** policy finns men appen kör ändå service-role → isolation måste verifieras med test (se §2).

### Prioritetsordning (inom området)
1a. Policies på alla saknade tenant-tabeller (**P0, M**). 1b. Stoppa `fetchBusinessSnapshots`-mönstret + scopa alla service-role-queries (**P0, M**). 1c. `NOT NULL` + backfill på `project_id` (**P0, S**).

---

## 2. Tenancy guard layer

### Nuvarande implementation
- **Ingen central tenancy-guard.** Isolation upprätthålls ad hoc: `business/store.ts` har `resolveProjectId()` + manuell kontroll, och `qa/cca/d2.ts` har en **lokal vakt** `params.project_id === input.projectId` (rad ~127) som kastar fel vid mismatch. Det är rätt idé — men finns bara på ett ställe.
- Det finns alltså ett bevisat mönster (D2-vakten) men ingen plattformsbred mekanism som **varje** datafunktion tvingas gå igenom.

### Målimplementation
- **Ett obligatoriskt tenancy-guard-lager** mellan all affärslogik och databasen. Varje läsning/skrivning sker genom en projekt-scopad accessor som:
  1. kräver ett explicit `projectId` (aldrig implicit/global),
  2. injicerar `project_id` i query/insert,
  3. avvisar varje försök att blanda två projekt i samma operation (generalisera D2-vakten),
  4. loggar projekt-scope för audit.
- **Service-role-klienten exponeras aldrig naket** för affärslogik — den wrappas av guarden så att "admin = bypass RLS" alltid paras med "guard = framtvinga project_id".
- Resultat: även om en RLS-policy skulle saknas eller service-role används, kan koden **strukturellt inte** läcka mellan projekt.

### Exakta filer/tabeller som påverkas
- **Ny modul:** `apps/web/lib/tenancy/*` (guard/scoped-client-konvention) — arkitektoniskt, ej i denna plan implementerad.
- **Refaktor-callsites:** allt som idag gör `createAdminClient()` direkt → går via guarden: `business/store.ts`, `os/business.ts`, `cost/track.ts`, `ai/manager.ts`, `ai/memory/{memory-store,feedback-store}.ts`, `bugscanner/*`.
- **Mönster att lyfta:** `qa/cca/d2.ts` (befintlig vakt) blir referensimplementation.
- **Tabeller:** inga schemaändringar; detta är ett applager.

### Risker
- **Stor refaktor-yta** (många callsites) → gör inkrementellt, en domän i taget (börja med `business`/`memory`, känsligast).
- **Risk för dubbelt arbete** om det görs före §1 → §1 (RLS) och §2 (guard) är komplementära försvarslager (defense-in-depth); guarden får inte bli ursäkt för att hoppa över RLS.
- **Bakgrundsjobb** (cron/drainer) som legitimt spänner över projekt (t.ex. `claim_runs`) måste ha en **explicit, auditbar "system-scope"-väg** genom guarden — annars bryts de.

### Prioritetsordning
2a. Definiera guard-kontrakt + scoped-client (**P0, S**). 2b. Migrera känsligaste domäner: `memory`, `business`, `tokens` (**P0, M**). 2c. Migrera resten + lägg isolationstest "projekt A kan aldrig läsa projekt B via någon väg" i CI (**P0, M**).

---

## 3. Global Atlas vs Project Atlas

### Nuvarande implementation
- **Ett enat Atlas.** `atlas/identity.ts` (`BUSINESS_PROFILES`, "Executive Chief of Staff for the company group"), `atlas/context.ts` (`gatherAtlasContext` bygger **en** snapshot över alla projekt), `atlas/operations.ts` (`getOperations` spänner över The Prompt + Familje-Stunden + GainPilot i ett anrop), `ai/manager.ts` (`getManager()` singleton).
- Konsekvens: den agent som resonerar har **rå kontext från alla projekt samtidigt** → strukturellt oförenligt med invarianten.

### Målimplementation
- **Tre tiers, två agent-roller:**
  - **Global Atlas** (supervisor): äger **org-minne**, ser bara **redigerade summeringar** per projekt, delegerar nedåt, broker:ar mellan projekt. Får **aldrig** ett projekts råa minne/secrets/canon.
  - **Project Atlas** (per projekt): `manager.ts`/Atlas-kärnan **instansierad per `project_id`** — egen kontext, egna secrets (`platform_tokens` per projekt), eget minne, eget verktygs-set. Två projekt = två isolerade instanser, aldrig en delad.
- **Kontextmontering blir projekt-scopad:** `gatherAtlasContext`/`getOperations` tar ett `projectId` och returnerar endast det projektets data; Global Atlas anropar dem aldrig med "alla projekt", utan konsumerar bara summeringar.

### Exakta filer/tabeller som påverkas
- **App:** `atlas/context.ts` (`gatherAtlasContext` → kräver `projectId`), `atlas/operations.ts` (`getOperations` → per projekt), `atlas/identity.ts` (dela i org-identitet vs projekt-identitet), `ai/manager.ts` (`getManager` → `getProjectManager(projectId)` + ny `GlobalAtlas`-roll).
- **Tabeller:** ny **org-minnestabell** (global, ägs av Global Atlas); befintligt `platform_memory`/`memories` förblir **per projekt** (rör ej). `agent_messages` återanvänds som transport mellan tiers (har redan `from_agent/to_agent/handoff/approval_request`).

### Risker
- **Regression i nuvarande "company-group"-vy** som operatören använder idag → Global Atlas måste återskapa helhetsbilden, men **via summeringar**, inte rå data. Kräver tydlig summeringskontrakt.
- **Dubblerad kontextkostnad** (per-projekt-instanser) → mät token/cost (cost-tracking finns redan).
- **Läckage via summeringar:** en slarvig summering kan bära PII/secrets uppåt → summeringssteget måste redigeras/policy-kontrolleras (kopplar till §5/broker).

### Prioritetsordning
3a. Gör `gatherAtlasContext`/`getOperations` projekt-scopade (**P1, M**). 3b. Inför `getProjectManager(projectId)` (Project Atlas) (**P1, M**). 3c. Inför Global Atlas-roll + org-minne + summeringskontrakt (**P1, L**).

---

## 4. Stängd delegeringsloop (manager_tasks → durable runs)

### Nuvarande implementation
- **Delegering skapar bara rader.** `ai/manager.ts` `planTasks(goal, projectId)` (rad ~356–398) genererar tasks och **INSERT:ar i `manager_tasks`** med `status='pending'`. Inget exekverar dem.
- **Den durable motorn finns men är frånkopplad.** `runs` har `attempts/max_attempts/lease_until` (`20260603_durable_runs.sql`); `claim_runs(p_limit, p_lease_seconds)` plockar pending runs atomiskt (SKIP LOCKED) och cron `omnira_runs_drain` driver `/api/runs/drain` varje minut; reaper återställer fastnade. **Men `manager_tasks` är en separat tabell utan koppling till `runs`/`workflows`** → delegerade tasks når aldrig motorn.
- **`claim_runs` saknar projekt-scope** (plockar alla pending runs oavsett projekt).

### Målimplementation
- **Brygga `manager_tasks` → `runs`.** En task som godkänts (se §5) konverteras till en **durable run** (eller en sekvens av runs) som drainern redan kör. Project Atlas kör **bounded autonomy** inom sina capability-grants; resultat/fel skrivs tillbaka till `manager_tasks` (`status: in_progress→done/failed`, `result`) och loggas i `agent_messages` (återkopplingsloop).
- **Projekt-scopad exekvering:** `claim_runs` (eller drain-lagret) blir projekt-medvetet så att en projekt-worker bara kör sitt projekts runs — stänger en cross-project-läcka i motorn.
- **Supervisor:** Global Atlas övervakar utfall via summeringar, inte via rå run-data.

### Exakta filer/tabeller som påverkas
- **Tabeller:** `manager_tasks` (lägg koppling: `run_id`/`workflow_id` + utökad `status`-enum), `runs` (källa via `claim_runs`).
- **DB-funktion:** `claim_runs(int,int)` i `20260603_durable_runs.sql` → projekt-scopad variant.
- **App:** `ai/manager.ts` (`planTasks` → emit durable run vid godkännande; `updateTask`/`getActiveTasks` kopplas till run-status), `ai/workflow-runner.ts`/`workflow-executor.ts`/`resume.ts` (mottar task-härledda runs), `/api/runs/drain` (projekt-scope).

### Risker
- **Autonom exekvering utan grind = farligt.** Loopen får **inte** stängas innan §5 (approval som hård grind) finns — annars kör delegerade tasks skarpt utan kontroll. **Hård beroendeordning: §5 före skarp §4.**
- **Dubbelkörning/idempotens:** task→run-konvertering måste vara idempotent (idempotency-key) så en task inte ger flera runs.
- **`claim_runs`-ändring påverkar befintlig mediepipeline** (delad motor) → noggrann test, branch först.

### Prioritetsordning
4a. Koppla `manager_tasks` ↔ `runs` (schema + idempotent konvertering) (**P1, M**). 4b. Projekt-scopa `claim_runs`/drain (**P1, M**). 4c. Aktivera autonom exekvering — **endast efter §5** (**P1, M**).

---

## 5. Approval som hård grind

### Nuvarande implementation
- **Bra grund, men rådgivande — inte spärr.** `ai/workflow-executor.ts` (rad ~259–283) skapar efter lyckade steg en `approvals`-rad (`status='pending'`) + skickar e-post. `manager.ts evaluateOutput` (Claude-scoring) och `marketing/guard.ts evaluateGuard` (verdict `approved/warning/rejected`) ger omdömen — men inget **stoppar** en run i state-maskinen. `runs.status` rör sig `pending→running→done/failed`; det finns **inget `awaiting_approval`-tillstånd**.
- Resultat: godkännande är ett sidospår, inte en grind handling måste passera.

### Målimplementation
- **Hård grind i den durable run-state-maskinen.** Inför tillstånd `awaiting_approval` (run pausar, lämnar inte `running` vidare till publicering/spend/send/deploy/delete förrän beslut). Drainern hoppar över runs i `awaiting_approval`.
- **Risk-tiering:** grinden triggas för `risk ≥ medium`-actions (kopplas senare till tool-registry-manifestets `consent`-fält; tills dess en explicit action-lista).
- **Per-projekt policy:** Familje-Stunden kan kräva strängare grindar (t.ex. allt innehåll med barn) än The Prompt.
- **Befintliga QA-omdömen blir input till grinden, inte ersättning:** `evaluateGuard` + `evaluateOutput` + golden-checklist/CCA D2 matar grinden; beslut (människa eller policy) släpper/avvisar.

### Exakta filer/tabeller som påverkas
- **Tabeller:** `runs` (`status`-enum + `awaiting_approval`; ev. `blocked_reason`), `approvals` (koppla beslut → run-fortsättning; säkerställ `project_id` finns — lades till i `20260603_marketing_engine_foundation.sql`).
- **DB-funktion:** `claim_runs` (exkludera `awaiting_approval`), reaper (rör ej pausade).
- **App:** `ai/workflow-executor.ts` (skapa grind/paus istället för auto-fortsätt), `ai/resume.ts` (återuppta efter godkännande), `marketing/guard.ts` + `manager.ts evaluateOutput` (matar grinden), e-post/notis-lagret.

### Risker
- **Deadlock/svält:** runs som väntar på godkännande som aldrig kommer → inför timeout/eskalering + tydlig kö-vy.
- **Bakåtkompatibilitet:** befintliga auto-publicerande flöden (The Prompts 2×/dag) får inte brytas oavsiktligt → grind aktiveras selektivt per risk/projekt, inte big-bang.
- **Reaper-krock:** pausade runs får inte tolkas som "stuck" av reapern → uttrycklig exkludering.

### Prioritetsordning
5a. `runs`-state `awaiting_approval` + claim/reaper-exkludering (**P1, M**). 5b. Grind i workflow-executor + återuppta-väg (**P1, M**). 5c. Risk-tiering + per-projekt policy (**P1, S**, växer med tool-registry senare).

---

## Samlad prioriterings- & beroendeordning

```
FAS 0 — Lås huset (P0, måste vara klart före all agent-förändring)
  ① §1 Isolation-härdning      (M)  — RLS-policies + stoppa fetch-all + project_id NOT NULL
  ② §2 Tenancy guard layer     (S→M)— centralt scoped-access-lager + isolationstest i CI
        └─ §2 beror på §1 (defense-in-depth, görs tätt efter)

FAS 1 — Hierarki, loop, grind (P1, i denna ordning)
  ③ §3 Global/Project Atlas    (M→L)— projekt-scopad kontext + Project Atlas-instanser + Global-roll
        └─ beror på §1+§2 (annars instansieras Atlas på oisolerad data)
  ④ §5 Approval som hård grind  (M) — INNAN autonom exekvering aktiveras
        └─ beror på §3
  ⑤ §4 Stängd delegeringsloop  (M) — manager_tasks→durable runs, skarp körning
        └─ beror HÅRT på §5 (ingen autonomi utan grind) och §3
```

**Kritiska beroenden (läs detta):**
- **§2 efter §1** — guarden ersätter inte RLS; båda lagren behövs.
- **§3 efter §1+§2** — instansiera aldrig Atlas (Global eller Project) ovanpå oisolerad data.
- **§5 före skarp §4** — delegeringsloopen får aldrig köra autonomt utan en hård approval-grind. Detta är den enskilt viktigaste sekvenssäkringen.

**Definition of done för Fas 0 (grunden räknas som "tät"):**
1. Varje tenant-tabell har en owner-policy (ingen "RLS på, policy saknas").
2. Ingen affärslogik läser data utan `project_id` i SQL; inga hämta-allt-och-filtrera-i-minnet kvar.
3. All datatillgång går genom tenancy-guarden; service-role är wrappad.
4. Automatiskt CI-test bevisar: projekt A:s identitet kan inte läsa projekt B:s rader via någon väg (RLS-klient **och** admin-väg).
5. Först när 1–4 är gröna öppnar vi Fas 1 — och först efter §5 aktiverar vi autonom delegering. Browser/Desktop Agent (Mark-inspirerade) ligger kvar bakom hela denna grund.

---

### Referensfiler
`packages/db/full_schema_run_in_supabase.sql` (RLS-mönster rad 232–283) · `supabase/migrations/{20260601_business_metrics, 20260601_media_insights, 20260603_marketing_engine_foundation, 20260602_atlas_growth_*, 20260602_stripe_intelligence_*, 20260602_g1_multitenant_platform_tokens, 20260528_pass_a_safeguards, 20260603_durable_runs, 20260603_pipeline_retry}.sql` · `apps/web/lib/supabase/admin.ts` · `apps/web/lib/{business/store.ts, os/business.ts, cost/track.ts}` · `apps/web/lib/ai/{manager.ts, runner.ts, workflow-executor.ts, workflow-runner.ts, resume.ts}` · `apps/web/lib/ai/memory/{memory-store,feedback-store}.ts` · `apps/web/lib/atlas/{identity,context,operations}.ts` · `apps/web/lib/qa/cca/d2.ts` (referensvakt) · `apps/web/lib/marketing/guard.ts`.
