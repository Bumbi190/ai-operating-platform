# Omnira — Fas 0: PR-/implementeringssekvens (Isolation-härdning + Tenancy guard)

_Byggbacklog. Ingen kod — endast sekvens, scope, verifiering. Grundat i `packages/db/full_schema_run_in_supabase.sql`, `supabase/migrations/*`, `apps/web/lib/*`. Bryter ner §1 + §2 ur `OMNIRA_GRUNDHARDNING_PLAN.md`._

---

## 0. Officiell riktning — låsta principer (styr varje PR nedan)

1. **Project Isolation är högsta prioritet i hela Omnira.** Vi accepterar att tappa veckor nu hellre än att senare upptäcka cross-project-läckage. Ingen PR som försvagar isolation får mergas.
2. **Approval-grinden är obligatorisk före all verklig autonom delegering.** Ingen agent får publicera, spendera pengar, deploya eller göra externa förändringar utan att workflowet kan stoppas i ett tydligt approval-steg. _(Fas 1 — men låst nu; Fas 0 får inte bygga något som förutsätter autonomi utan grind.)_
3. **Global Atlas får aldrig rå åtkomst till projektdata.** Endast summeringar + delegering till Project Atlas-instanser. _(Fas 1 — låst nu.)_
4. **Browser Agent och Desktop Agent byggs ovanpå samma isolation-principer.** Ingen specialväg runt tenancy guard eller approval-systemet. _(Senare — låst nu.)_
5. **Familje-Stunden, extra regel:** innan automatisk publicering av socialt innehåll aktiveras genererar systemet **EN bild i taget → QA → review → godkännande → därefter publicering**. Ingen batchgenerering eller autopublicering förrän hög tillit finns i hela kedjan. _(Fas 1-konfiguration av approval-grinden — låst nu så den inte glöms.)_

> **Bär-framåt-konsekvens för Fas 0:** dessa fem regler ändrar inte vad Fas 0 _gör_, men de förbjuder genvägar. Varje datatillgång vi rör i Fas 0 ska sluta i ett tillstånd där §3–§5 kan byggas ovanpå utan undantag.

---

## 1. Tenant-tabell-inventering (sanningskälla för §1)

Detta är arbetslistan. **PR-0 ersätter denna handgjorda tabell med ett genererat, auktoritativt utdrag** (se nedan) — tills dess gäller:

| Tabell | RLS på? | Owner-policy? | `project_id` | Åtgärd | Migration/källa |
|---|---|---|---|---|---|
| projects, agents, workflows, runs, run_logs, outputs, memories | ✓ | ✓ | NOT NULL | — (referensmönster) | `full_schema` 232–283 |
| approvals, evaluations | ✓ | ✓ (via run/approval) | via FK | verifiera marknads-rader | `full_schema`, `marketing_engine_foundation` |
| manager_tasks, agent_messages | ✓ | ✓ | **NULLABLE** ⚠️ | **PR-2: NOT NULL + backfill** | `full_schema` 240–241, 276–277 |
| leads, campaigns, revenue_events | ✓ | **✗** | kolumn finns | **PR-1A: lägg policy** | `20260601_business_metrics.sql` |
| media_insights | ✓ | **✗** | verifiera | **PR-1A: lägg policy** | `20260601_media_insights.sql` |
| campaign_plans, campaign_briefs, draft_posts, guard_reports | ✓ | **✗** | kolumn finns | **PR-1B: lägg policy** | `20260603_marketing_engine_foundation.sql` |
| account_snapshots, opportunities | ✓ | **✗** | kolumn finns | **PR-1C: lägg policy** | `20260602_atlas_growth_*` |
| revenue_snapshots | ✓ | **✗** | kolumn finns | **PR-1C: lägg policy** | `20260602_stripe_intelligence_*` |
| platform_tokens | ✓ | **✗** | ✓ (per projekt) | **PR-1D: policy + härda** | `20260602_g1_multitenant_platform_tokens.sql` |
| media_scripts | ? | ? | verifiera | **PR-0 fastställer** | `pipeline_retry.sql` |
| platform_config | ✓ | läs-only auth | global singleton | **lämna globalt (avsiktligt)** | `20260528_pass_a_safeguards.sql` |

⚠️ Osäkerhet hanteras ärligt: **PR-0 producerar den faktiska listan** så vi inte gissar.

---

## 2. PR-sekvens — översikt

Tre spår, körs i ordning. Varje PR är **självständigt mergebar**, **icke-big-bang**, och DB-PRs körs **i Supabase-branch + staging-verify först**.

| PR | Spår | Titel | Storlek | Risk | Beror på |
|---|---|---|---|---|---|
| **PR-0** | Mät | Isolations-harness + CI-grindar (inventering, leak-test, lint mot service-role/`select('*')`) | M | Låg | — |
| **PR-1A** | §1 DB | RLS-policies: affärstabeller (leads, campaigns, revenue_events, media_insights) | S | Låg | PR-0 |
| **PR-1B** | §1 DB | RLS-policies: marketing (campaign_plans, campaign_briefs, draft_posts, guard_reports) | S | Låg | PR-0 |
| **PR-1C** | §1 DB | RLS-policies: atlas/stripe (account_snapshots, opportunities, revenue_snapshots) | S | Låg | PR-0 |
| **PR-1D** | §1 DB | RLS-policy + härdning: platform_tokens (secrets) | S | Medel | PR-0 |
| **PR-2** | §1 DB | `project_id` NOT NULL + backfill (manager_tasks, agent_messages, ev. fler) | M | Medel | PR-1*, PR-0 |
| **PR-3A** | §1 App | Döda "hämta-allt-filtrera-i-minnet" (`fetchBusinessSnapshots` m.fl.) | M | Medel | PR-1* |
| **PR-3B** | §1 App | Scopa kvarvarande service-role-queries på `project_id` (cost, manager, memory) | M | Medel | PR-3A |
| **PR-4** | §2 | Tenancy-guard-kontrakt + scoped client + explicit system-scope-väg | M | Låg | PR-0 |
| **PR-5A** | §2 | Migrera känsligaste domäner genom guarden: memory + tokens | M | Medel | PR-4 |
| **PR-5B** | §2 | Migrera business + cost genom guarden | M | Medel | PR-5A |
| **PR-5C** | §2 | Migrera resterande callsites (manager, bugscanner, atlas-data) | M | Medel | PR-5B |
| **PR-6** | Lås | Förbjud rå `createAdminClient` utanför guarden (CI blocking) + gör leak-testet obligatoriskt | S | Låg | PR-5C |

---

## 3. PR-detaljer

### PR-0 — Isolations-harness + CI-grindar _(byggs först, mäter allt annat)_
- **Mål:** göra isolation mätbar och regressionssäker innan vi rör något.
- **Innehåll (3 delar):**
  1. **Inventerings-utdrag:** ett skript/test som listar varje tabell med `project_id`-koppling och dess RLS-/policy-/nullability-status → ersätter §1-tabellen ovan med fakta.
  2. **Leak-test:** ett integrationstest som skapar projekt A och B (olika `owner_id`) och bevisar att A:s identitet **inte** kan läsa B:s rader via (a) RLS-respekterande klient och (b) varje app-dataväg. Startar som **rapporterande** (icke-blockerande).
  3. **Lint-grindar:** CI-flagga för nya `createAdminClient()`-callsites och `.select('*')` utan projekt-`where` (varning nu, blockerande i PR-6).
- **Påverkar:** ny `tests/isolation/*` + CI-config. Inga schema-/appändringar.
- **Verifiering:** harnessen kör grönt i CI och producerar inventeringslistan.
- **Rollback:** trivialt (endast test/CI).
- **Risk:** Låg.

### PR-1A/1B/1C — RLS owner-policies på saknade tenant-tabeller
- **Mål:** stänga default-deny-glappet; varje tenant-tabell får samma owner-policy som kärnan.
- **Innehåll:** en migration per grupp som lägger `CREATE POLICY "<tabell>_owner" … USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))`. Säkerställ index på `project_id` för varje tabell.
- **Påverkar (tabeller):** 1A: `leads, campaigns, revenue_events, media_insights`. 1B: `campaign_plans, campaign_briefs, draft_posts, guard_reports`. 1C: `account_snapshots, opportunities, revenue_snapshots`.
- **Verifiering:** harnessens inventering visar policy ✓; leak-test grönt för dessa tabeller; rök-test att appens befintliga (service-role) flöden är opåverkade (service-role kringgår RLS → ingen funktionsregression väntas).
- **Rollback:** `DROP POLICY` per migration; Supabase-branch gör detta ofarligt.
- **Risk:** Låg (service-role-appen bryts inte; policyn skyddar framtida auth-klientvägar). _Kontroll:_ verifiera att ingen användarvänd route förlitade sig på den tidigare "deny-all"-effekten.

### PR-1D — platform_tokens (secrets) policy + härdning
- **Mål:** secrets får aldrig korsa projekt; redan per-`project_id`, men utan policy.
- **Innehåll:** owner-policy + bekräfta unikt index `(project_id, platform, token_type)`; dokumentera att endast guard/system-scope läser tokens.
- **Påverkar:** `platform_tokens`.
- **Verifiering:** leak-test specifikt för tokens (projekt A kan ej läsa B:s tokens via någon väg).
- **Risk:** Medel (token-läsning är kritisk väg — testa medie-/postningsflödet i staging).

### PR-2 — `project_id` NOT NULL + backfill
- **Mål:** en rad utan projekt = isolationsläcka; eliminera nullbarhet på tenant-FK.
- **Innehåll:** backfilla historiska NULL-rader (beslut: tilldela rätt projekt eller arkivera/radera), sedan `SET NOT NULL`. Kandidater: `manager_tasks.project_id`, `agent_messages.project_id` (idag `ON DELETE SET NULL`/nullable). PR-0-inventeringen avgör om fler finns.
- **Påverkar:** `manager_tasks`, `agent_messages` (+ ev. fler enligt PR-0).
- **Verifiering:** migration faller inte; harness visar NOT NULL ✓; inga föräldralösa rader kvar.
- **Rollback:** `DROP NOT NULL` (data behålls).
- **Risk:** Medel (kan faila på historiska NULL → backfill måste vara klar och granskad först).

### PR-3A — Döda "hämta-allt-och-filtrera-i-minnet"
- **Mål:** ta bort det mönster som faktiskt kan läcka (kodbug → fel filter).
- **Innehåll:** refaktorera `os/business.ts` `fetchBusinessSnapshots` (hämtar `leads/revenue_events/campaigns` utan `where`) till **projekt-scopade queries**; sök upp varje `.select('*')` utan projekt-filter.
- **Påverkar:** `apps/web/lib/os/business.ts`, ev. dashboard-callers.
- **Verifiering:** lint-grinden (PR-0) hittar inga kvarvarande osäkra `select('*')`; leak-test grönt; dashboard visar samma siffror som före (per projekt).
- **Risk:** Medel (UI-data får inte ändras oavsiktligt — jämför före/efter per projekt).

### PR-3B — Scopa kvarvarande service-role-queries
- **Mål:** varje service-role-query bär `project_id` i SQL.
- **Innehåll:** gå igenom `cost/track.ts`, `ai/manager.ts`, `ai/memory/{memory-store,feedback-store}.ts`, `business/store.ts` och säkerställ explicit projekt-scope (memory-store filtrerar redan på `project_id` — bekräfta och dokumentera).
- **Påverkar:** ovan filer.
- **Verifiering:** lint-grind grön; leak-test grönt.
- **Risk:** Medel.

### PR-4 — Tenancy-guard-kontrakt + scoped client
- **Mål:** ett obligatoriskt lager som strukturellt omöjliggör cross-project-tillgång, även med service-role.
- **Innehåll:** definiera guard-kontraktet (kräver explicit `projectId`, injicerar `project_id`, avvisar blandning av två projekt i en operation — generalisera vakten i `qa/cca/d2.ts`), wrappa `createAdminClient`, och definiera en **explicit, auditbar system-scope-väg** för legitima cross-projekt-jobb (cron, `claim_runs`-drainer). Inga callsites migreras ännu.
- **Påverkar:** ny `apps/web/lib/tenancy/*`; referens: `qa/cca/d2.ts`, `supabase/admin.ts`.
- **Verifiering:** enhetstest av guarden (avvisar saknad/blandad `projectId`; system-scope kräver explicit flagga + loggas).
- **Risk:** Låg (additiv; inga beteendeändringar förrän PR-5).

### PR-5A/5B/5C — Migrera callsites genom guarden (domän för domän)
- **Mål:** all datatillgång går genom guarden; service-role aldrig naket i affärslogik.
- **Ordning (känsligast först):** 5A `memory` + `tokens`; 5B `business` + `cost`; 5C `manager`, `bugscanner`, atlas-data-lager.
- **Påverkar:** respektive `apps/web/lib/*`-moduler; inga schemaändringar.
- **Verifiering:** per domän: leak-test grönt; funktionsrök-test; lint visar färre råa `createAdminClient`.
- **Risk:** Medel (stor yta → inkrementellt, en domän per PR, lätt att rulla tillbaka enskild domän).

### PR-6 — Lås grunden
- **Mål:** göra det omöjligt att regressa.
- **Innehåll:** CI **blockerar** nya råa `createAdminClient` utanför guarden och osäkra `select('*')`; gör leak-testet **obligatoriskt/required** för merge.
- **Påverkar:** CI-config.
- **Verifiering:** PR som medvetet bryter isolation **failar** i CI (negativt test).
- **Risk:** Låg.

---

## 4. Branch- & verifieringsstrategi

- **DB-PRs (1A–2):** körs i **Supabase-branch**, verifieras mot staging-data, leak-test grönt, _sedan_ merge till prod-migrationer. Aldrig direkt mot prod.
- **App-PRs (3–5):** Vercel preview-deploy per PR; jämför per-projekt-siffror före/efter.
- **Ordningsregel:** policies (1A–1D) före NOT NULL (2) före query-scoping (3) före guard-migrering (5). Guard-kontraktet (4) kan byggas parallellt efter PR-0.
- **Varje PR:** måste lämna `main` i ett deploybart, icke-regresserat läge (ingen halv-migrerad domän som läcker).

---

## 5. Fas 0 exit gate (när Fas 1 får öppnas)

Grunden räknas som **bevisbart tät** — och först då öppnar §3 (Global/Project Atlas), §5 (approval-grind), §4 (delegeringsloop) — när **allt** nedan är grönt:

1. ✅ Varje tenant-tabell har owner-policy (PR-0-inventering: noll "RLS på, policy saknas").
2. ✅ Inget `project_id`-nullbart på tenant-tabeller; inga föräldralösa rader.
3. ✅ Ingen affärslogik läser utan `project_id` i SQL; inga "hämta-allt-och-filtrera-i-minnet" kvar.
4. ✅ All datatillgång går genom tenancy-guarden; service-role är wrappad; system-scope är explicit + auditad.
5. ✅ Leak-testet är **obligatoriskt** och bevisar: projekt A:s identitet kan inte läsa projekt B via någon väg (RLS-klient **och** admin-väg). Ett medvetet brott failar CI.

**Först när 1–5 är gröna** börjar Fas 1 — och även då aktiveras autonom delegering (§4 skarpt) **endast efter** att approval-grinden (§5) finns. Browser/Desktop Agent ligger kvar bakom hela denna grund och ärver guard + approval utan undantag (princip 4). Familje-Stundens en-bild-i-taget-regel (princip 5) implementeras som approval-grindens första konfiguration i Fas 1.

---

### Referensfiler
`packages/db/full_schema_run_in_supabase.sql` (RLS-mönster 232–283) · `supabase/migrations/{20260601_business_metrics, 20260601_media_insights, 20260603_marketing_engine_foundation, 20260602_atlas_growth_*, 20260602_stripe_intelligence_*, 20260602_g1_multitenant_platform_tokens, 20260528_pass_a_safeguards}.sql` · `apps/web/lib/supabase/admin.ts` · `apps/web/lib/os/business.ts` (`fetchBusinessSnapshots`) · `apps/web/lib/business/store.ts` · `apps/web/lib/cost/track.ts` · `apps/web/lib/ai/manager.ts` · `apps/web/lib/ai/memory/{memory-store,feedback-store}.ts` · `apps/web/lib/qa/cca/d2.ts` (guard-referens).
