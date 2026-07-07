# Omnira — PR-0 Detaljspec + Autonomy Levels (Governance-lås)

_Planeringsdokument. Ingen kod. PR-0 är mät-grunden för hela Fas 0: kan vi inte mäta isolation kan vi inte bevisa isolation. Grundat i faktisk kod: tre Supabase-klienter (`apps/web/lib/supabase/{admin,server,client}.ts`), testramverk **vitest** (`apps/web` `"test": "vitest run"`), **ingen befintlig CI** (`.github/workflows` saknas → PR-0 etablerar den)._

---

## DEL A — Låsta principer (officiella)

Dessa gäller över hela Omnira och får inte kringgås av någon PR, agent eller bekvämlighet:

1. **PR-0 är grunden för allt.** Ingen isolation-PR mergas innan PR-0:s mätinstrument finns. Mätbarhet före åtgärd.
2. **Leak-testet är ett säkerhetstest, inte ett vanligt test.** Ett medvetet isolationsbrott ska **faila CI**. Det körs som en obligatorisk security-gate, inte en valfri svit.
3. **Tenancy Guard är den officiella vägen till data.** RLS = första försvarslinjen (DB), Tenancy Guard = andra (app). All datatillgång går genom guarden; service-role naket är förbjudet utanför den.
4. **Global Atlas får aldrig en genväg till rå projektdata** — inte ens om det vore enklare. Endast summeringar + delegering till Project Atlas.
5. **Approval-grinden är ett hårt krav** innan någon verklig autonom delegering aktiveras.
6. **(Ny) Autonomy Levels styr vad varje projekt/agent får göra** (se Del B). Inget projekt eller agent opererar utan en explicit, registrerad nivå.

---

## DEL B — Autonomy Levels (ny låst princip)

En **explicit nivåstege** som varje projekt **och** varje agent/verktyg bär. Nivån avgör vad som får ske utan människa. Den binder direkt till approval-grinden (§5) och senare till tool-registryts capability/consent.

| Nivå | Namn | Får göra | Får INTE göra | Krävd grind | Beviljas av |
|---|---|---|---|---|---|
| **L0** | **Analys** | Läsa, observera, summera (read-only) | Skriva annat än loggar; extern handling | RLS + guard (read-scope) | Default för alla |
| **L1** | **Rekommendation** | Föreslå/ranka åtgärder; skapa rekommendations-rader | Skapa utkast eller utföra | Som L0 | Project Atlas |
| **L2** | **Utkast** | Generera interna utkast (innehåll, planer); köra QA | Något lämnar systemet | QA-gate; inget externt | Project Atlas |
| **L3** | **Utför efter godkännande** | Verklig/extern handling (publicera, spendera, deploya, skicka) **per åtgärd efter hård approval** | Agera utan godkännande per åtgärd | **Approval-grind per åtgärd** | Operatör |
| **L4** | **Begränsad autonomi** | Utföra inom en förgodkänd envelope (vitlistade åtgärdstyper, budget-/rate-tak) utan per-åtgärd-godkännande | Gå utanför envelope; högrisk utan grind | Envelope + post-hoc audit + circuit breaker; högrisk → fortf. L3-grind | Operatör |
| **L5** | **Delegerad autonomi** | Planera + utföra fleras­tegs­mål, sub-delegera till projekt-agenter inom envelope | Korsa projekt-isolation; kringgå kill-switch | Global Atlas-supervision + audit + kill-switch | Operatör (explicit) |

**Bindande regler för stegen:**
- **Isolation gäller på alla nivåer** — även L5 kan aldrig korsa projektgräns annat än via Global Atlas-broker.
- **Inget projekt/agent över L2 får aktiveras före Fas 0 exit-gate + approval-grinden (Fas 1).** Fram till dess är taket L2.
- **Familje-Stunden börjar på L3** med en-bild-i-taget-regeln som approval-grindens första konfiguration (en bild → QA → review → godkännande → publicering; ingen batch/autopublicering).
- Nivå lagras per projekt och per agent/verktyg (framtida fält, t.ex. `autonomy_level` på projekt + capability-manifest); approval-grinden läser nivån för att avgöra om en åtgärd kräver per-åtgärd-godkännande (L3) eller ryms i envelope (L4/L5).

_Implementeras i Fas 1 (kopplat till approval-grind + tool-registry). Låses nu som riktning så varje senare beslut kan referera en nivå._

---

## DEL C — PR-0 detaljspec

Mål: ett mätinstrument som gör resten av Fas 0 **objektivt mätbart**. PR-0 ändrar **ingen** affärslogik och **inget** schema — den bara mäter, rapporterar och etablerar CI.

### C.1 — Vilka tabeller ska enumereras

**Datadrivet, inte handlistat.** Harnessen klassificerar varje tabell i tre klasser genom att läsa katalogen, inte en statisk lista:

- **TENANT** = tabell med en `project_id`-kolumn (direkt scope) **eller** en FK-kedja till en tenant-tabell (indirekt scope, t.ex. `run_logs→runs`, `evaluations→approvals→runs`, `conversation_messages→conversations`).
- **GLOBAL** = avsiktligt ej projekt-scopad (idag endast `platform_config`, `id=1`-singleton). Måste stå på en **explicit allowlist** i harnessen — annars behandlas en oscopead tabell som fel.
- **SYSTEM** = interna/cron/migrations-tabeller utan användardata.

**Enumeration sker mot katalogen** (via en read-only SQL/RPC som admin-klienten kör):
- **Tenant-set:** `information_schema.columns` → alla tabeller med kolumn `project_id` (+ den manuellt deklarerade FK-indirekta listan i en harness-config).
- **RLS av/på:** `pg_catalog.pg_class.relrowsecurity` (eller `pg_tables.rowsecurity`).
- **Policy finns:** `pg_catalog.pg_policies` → tabeller med ≥1 policy.
- **Nullability:** `information_schema.columns.is_nullable` för `project_id`.
- **Index:** `pg_indexes` → finns index på `project_id`.

**Förväntad konkret tenant-lista** (harnessen bekräftar/utökar): `projects, agents, workflows, runs, run_logs, outputs, memories, approvals, manager_tasks, agent_messages, evaluations, conversations, conversation_messages, sprints, planning_items, daily_notes, leads, campaigns, revenue_events, media_insights, campaign_plans, campaign_briefs, draft_posts, guard_reports, account_snapshots, opportunities, revenue_snapshots, platform_tokens, platform_memory, media_scripts`.

**Output:** en genererad **inventeringsrapport** per tabell: `{tabell, klass, rls_på, policy_finns, project_id_nullable, project_id_index}`. Rapporten är facit som §1-PR:erna betar av. **Regel:** varje TENANT-tabell måste sluta på `rls_på=true ∧ policy_finns=true ∧ nullable=false`; varje icke-allowlistad tabell utan scope = **fel**.

### C.2 — Vilka läckagevägar ska testas

Sju vektorer. Varje vektor är en testkategori; alla körs för projekt **A** (ägare A) vs projekt **B** (ägare B):

1. **Direkt tabell-läsning via RLS-klient.** A:s session (`server.ts`, cookie-auth) `select` på varje tenant-tabell → måste returnera **0** av B:s rader. (Anon-klient `client.ts` → 0 rader utan session.)
2. **FK-indirekt läsning.** A läser barn-tabeller vars policy beror på förälder (`run_logs, evaluations, conversation_messages`) → 0 av B:s rader.
3. **RPC/function-vägar.** Säkerhetsdefinierade funktioner, särskilt `claim_runs(int,int)` (service_role) och reaper — verifiera att drain-/claim-vägen inte exponerar B:s runs i A:s kontext; att `claim_runs` (efter §4) blir projekt-scopad.
4. **App-API-routes.** Enumerera `/api/*`-routes som läser tenant-data; för var och en: anrop som A får aldrig returnera B:s rader. (Routes som använder service-role utan auth-scope flaggas.)
5. **Aggregat/dashboard-vägar.** Specifikt `os/business.ts fetchBusinessSnapshots` (hämtar allt) → A:s dashboard innehåller aldrig B:s leads/revenue/campaigns.
6. **Secrets / embeddings / canon.** `platform_tokens`: A kan ej läsa B:s tokens via någon väg. Embeddings/canon: testkategorin **finns från dag ett som stub** (inga embeddings än) så att framtida pgvector-/canon-lager föds med läcktest.
7. **Cache-läckage.** Verifiera att svar inte delas över projekt-scope via Next.js/Vercel Data Cache (admin.ts tvingar redan `no-store` p.g.a. en tidigare token-cache-incident — gör cross-tenant-cache till en uttrycklig testkategori).

### C.3 — Hur leak-testet byggs

- **Ramverk:** vitest (redan i `apps/web`). Ny svit `apps/web/tests/isolation/`.
- **Fixtur — två ägare, två projekt:** seed `owner_A`/`owner_B` (auth users) + projekt A/B, och minst en rad per tenant-tabell för B. Skapas/rivs i `beforeAll`/`afterAll` mot en **isolerad test-databas/Supabase-branch** (aldrig prod).
- **Tre klient-roller per assertion** (matchar de faktiska klienterna):
  - `admin` = `createAdminClient()` (service-role) — används bara för **seed/teardown** och för att verifiera att SYSTEM-vägar är medvetet scopade.
  - `userA` = `server.ts`-klient med A:s session — den **RLS-respekterande** vägen; huvudverktyget för läcktest.
  - `anon` = `client.ts` — ska se 0 av allt utan session.
- **Assertion-mönster (data-drivet):** loopa över inventeringens TENANT-lista (C.1) → för varje tabell + varje vektor (C.2): `expect(userA.read(table)).not.toContain(B-rader)`; `expect(count)===0`. Nya tenant-tabeller fångas **automatiskt** (testet itererar över katalogen, inte en handlista) → en framtida oscopead tabell failar direkt.
- **Negativt självtest:** ett medvetet "broken"-fall (en avsiktligt oscopead query) ska få sviten att **faila** — bevisar att testet verkligen fångar läckor (annars är gröna prickar värdelösa).
- **Stub-kategorier:** embeddings/canon/cache-vektorerna finns som test-skelett nu och fylls när respektive lager byggs.
- **Status i PR-0:** sviten körs **rapporterande** (visar nuvarande röda vektorer) men blockerar inte än — den blir blocking i PR-6 när §1+§2 gjort den grön.

### C.4 — Vilka CI-regler ska blockera merge

PR-0 skapar `.github/workflows/` (CI finns inte idag). Jobb och grindar:

1. **`security-isolation` (leak-test-jobb).** Kör isolation-sviten mot en ephemeral test-DB/branch. **Required check** — men i PR-0 tillåts den vara "rapporterande"; **PR-6 gör den blocking** (princip 2: säkerhetstest, brott failar CI). Markeras tydligt som security-gate.
2. **`inventory-drift`.** Kör katalog-enumereringen och **failar** om någon TENANT-tabell har `policy_finns=false`, `nullable=true`, eller om en icke-allowlistad tabell saknar scope. Detta är grinden som gör att §1 kan mätas objektivt — och som stoppar **nya** migrationer som inför en tenant-tabell utan RLS+policy.
3. **Lint: förbjud rå service-role.** Statisk regel (ESLint/custom + grep-fallback) som **flaggar nya `createAdminClient`-import/-anrop utanför `lib/tenancy/*`** och en explicit allowlist (bakgrundsmotor/cron). Varning i PR-0 → **blocking i PR-6**.
4. **Lint: förbjud osäker `select('*')`.** Flagga `.select('*')` mot tenant-tabeller utan `.eq('project_id', …)`/guard-anrop. Varning → blocking i PR-6.
5. **Migrations-regel.** Varje ny migration som skapar en tabell med `project_id` måste i samma migration slå på RLS **och** policy — verifieras av `inventory-drift` mot branchen.
6. **`build` + `vitest run` + `next lint`** som baslinje-checks (finns inga CI-checks idag → etableras här).

**Required-checks-policy (branch protection):** `inventory-drift` blockerar omedelbart (lågrisk, faktabaserat). `security-isolation` och de två lint-reglerna sätts som required vid PR-6 när grunden gjort dem gröna — annars vore main rött från dag ett.

---

## DEL D — PR-0 acceptanskriterier (definition of done för själva PR-0)

PR-0 är klar när:
1. ✅ Katalog-enumereringen kör och producerar inventeringsrapporten (ersätter den handgjorda tabellen i `OMNIRA_FAS0_PR_SEKVENS.md`).
2. ✅ Leak-sviten finns i `apps/web/tests/isolation/`, itererar datadrivet över TENANT-tabeller, täcker alla sju vektorer (embeddings/canon/cache som stubs), och har ett grönt **negativt självtest**.
3. ✅ CI-pipelinen finns (`.github/workflows/`) med jobben `security-isolation`, `inventory-drift`, lint-grindarna och baslinjen — körande, med `inventory-drift` blocking.
4. ✅ En körning visar den **faktiska röda listan** (vilka tabeller/vektorer som läcker idag) — utgångsläget allt annat mäts mot.

## DEL E — Hur resten av Fas 0 mäts mot PR-0

Varje senare PR har ett **objektivt, mätbart kvitto** i PR-0:s instrument:

| PR | Vänder dessa mätpunkter röd→grön |
|---|---|
| PR-1A/B/C/D | `inventory-drift`: `policy_finns=true` för respektive tabellgrupp; vektor 1/2/6 grön för dem |
| PR-2 | `inventory-drift`: `nullable=false` för `manager_tasks`/`agent_messages` |
| PR-3A | Vektor 5 (dashboard/aggregat) grön; lint: inga osäkra `select('*')` kvar |
| PR-3B | Vektor 4 (API-routes) grön; service-role-queries scopade |
| PR-4/5A-C | Vektor 3/4/6 gröna genom guarden; lint: råa `createAdminClient` → 0 utanför guard |
| PR-6 | `security-isolation` + lint-grindar blir **blocking**; negativt brott failar CI |

**Fas 0 exit-gate = hela PR-0-instrumentet grönt + blocking.** Först då öppnar Fas 1 (§3 Global/Project Atlas, §5 approval-grind), och autonomi över L2 aktiveras aldrig före approval-grinden.

---

### Referensfiler
`apps/web/lib/supabase/{admin,server,client,types}.ts` (de tre klientrollerna) · `apps/web/package.json` (`vitest`) · `packages/db/full_schema_run_in_supabase.sql` (RLS-mönster 232–283) · `supabase/migrations/20260603_durable_runs.sql` (`claim_runs` — vektor 3) · `apps/web/lib/os/business.ts` (`fetchBusinessSnapshots` — vektor 5) · `apps/web/lib/qa/cca/d2.ts` (guard-referens) · _(ny)_ `apps/web/tests/isolation/*`, `.github/workflows/*`.
