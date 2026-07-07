# Omnira — PR-0: Route-enumerering (vektor 4) + Project Kill Switch

_Planeringsdokument. Ingen kod. Grundat i faktisk kod: **93 `route.ts` under `apps/web/app/api/`** (73 använder `createAdminClient`/service-role, 58 cookie/RLS-klient, 10 auth.getUser), och dagens globala paus `platform_config.automation_paused` (`20260528_pass_a_safeguards.sql`) som endast 3 routes honorerar._

---

## DEL A — Låsta principer (uppdaterade)

1. **Autonomy Levels = officiell princip** (L0 Analys → L1 Rekommendation → L2 Utkast → L3 Utför-efter-godkännande → L4 Begränsad → L5 Delegerad). Varje projekt/agent bär en registrerad nivå. _Låst._
2. **(Ny) Project Kill Switch.** Varje projekt ska kunna stoppas **individuellt** utan att påverka övriga. Pausas Familje-Stunden ska GainPilot, The Prompt och andra fortsätta normalt. _Låst (se Del B)._
3. **Familje-Stunden är strikt L3** med en-bild-i-taget-regeln **tills QA-, review- och approval-kedjan bevisat fungerat stabilt över tid.** Ingen uppgradering till L4+ förrän dess.
4. **Isolation före autonomi.** Vi accepterar långsammare bygge för en grund som håller när fler projekt/agenter kopplas på. Ingen genväg förbi RLS, Tenancy Guard, approval-grind eller kill switch.
5. Tidigare lås kvarstår: PR-0 är mätgrunden; leak-testet är ett säkerhetstest (brott failar CI); Tenancy Guard är officiell dataväg; Global Atlas aldrig rå projektdata; approval-grind före autonom delegering.

---

## DEL B — Project Kill Switch (ny styrande regel)

### Nuläge
- **Global paus, inte per projekt.** `platform_config` (`id=1`-singleton) har `automation_paused`, `paused_at`, `paused_reason`. Det stoppar **allt eller inget**.
- **Honoreras inte överallt.** Endast `media/cron/{reply-comments,publish,autonomous}` + `lib/media/safeguards.ts` kollar pausen. De andra ~50 automationsvägarna struntar i den.
- Konsekvens: idag kan man inte pausa Familje-Stunden utan att antingen stoppa hela plattformen eller missa flöden som inte kollar flaggan.

### Målimplementation
- **Per-projekt pausläge.** Ett `paused`-tillstånd per projekt (`projects.paused`/`paused_reason`/`paused_at`, eller en liten `project_status`-tabell). Pausen är **projekt-lokal**: påverkar bara det projektets runs, cron, agenter och publicering.
- **Enforcement på lägsta nivå (kan inte glömmas bort).** Precis som tenancy guard: den durable drainern/`claim_runs` **exkluderar pausade projekts runs**, så ingen enskild route kan kringgå pausen genom att glömma kolla. Varje cron-route filtrerar bort pausade projekt; approval→exekvering vägrar starta för pausat projekt; framtida browser/desktop-agenter ärver samma spärr (princip 4 i tidigare lås — ingen specialväg).
- **Global paus kvarstår** som org-nödstopp (behåll `platform_config`), men **per-projekt** är den dagliga, granulära kontrollen.
- **Hör ihop med Autonomy Levels:** en paus sätter effektivt projektet till L0 (read-only) tills den lyfts.

### Exakta filer/tabeller
- **Tabell:** `projects` (lägg `paused`/`paused_reason`/`paused_at`) eller ny `project_status`.
- **DB-funktion:** `claim_runs(int,int)` i `20260603_durable_runs.sql` → exkludera pausade projekt.
- **App:** alla `apps/web/app/api/**/cron/*`-routes, `/api/runs/drain`, approval→exekvering, `lib/media/safeguards.ts` (generalisera från global → per projekt).

### Risker
- **Halv-honorerad paus = falsk trygghet.** Måste enforced i drainer/`claim_runs`, inte route-för-route. Annars samma problem som idag.
- **Cron som spänner över projekt** måste loopa per projekt och hoppa pausade — inte allt-eller-inget.
- **Test:** en integrationstest-kategori "pausa B → endast B stoppas, A fortsätter" (läggs i PR-0:s harness, Del C.5).

_Prioritet: hör hemma i Fas 0/1-gränssnittet. Schemat + `claim_runs`-exkludering kan göras tidigt (lågrisk, hög trygghet); full route-täckning landar med tenancy-guard-migreringen._

---

## DEL C — Route-enumerering för PR-0 (vektor 4: API-routes)

Mål: göra "vilka routes ska leak-testet täcka?" till en **uttömmande, klassificerad, CI-bevakad** lista — inte ett stickprov.

### C.1 — Klassificering (alla 93 routes → 5 klasser)

| Klass | Auth-modell | Datatillgång | Leak-test-krav |
|---|---|---|---|
| **U — User-data** | cookie/RLS (`server.ts`) + `auth.getUser` | Returnerar tenant-data per slug/id | **A med B:s slug/id → 403/404/tomt, aldrig B:s data**; listor → aldrig B:s rader |
| **S — System/cron** | `CRON_SECRET`/authorization-header, service-role | Spänner över projekt by design | **401 utan secret**; intern bearbetning projekt-scopad; **honorerar kill switch** |
| **W — Webhook** | extern signatur (Meta/Stripe) | Routar inkommande till rätt projekt | Signatur krävs; payload för B routas **endast** till B |
| **A — Admin/farlig** | måste vara låst | Migrate/seed | **Ej användarexponerad**; kräver admin-secret; ej i prod-runtime |
| **X — Extern API (v1)** | API-nyckel/auth | Tenant-data via API | Auth krävs; svar scopat till nyckelns projekt |

### C.2 — Inventering per klass

**Klass U — User-data (testas individuellt, högsta prioritet):**
`/api/projects` · `/api/projects/by-slug/[slug]` · `/api/projects/[slug]/agents` · `/api/projects/[slug]/agents/[id]` · `/api/projects/[slug]/workflows` · `/api/projects/[slug]/workflows/[id]` · `/api/projects/[slug]/dream` · `/api/runs` · `/api/runs/[id]` · `/api/runs/[id]/{resume,stream,ebook,monthly-pdf,mp3-manus}` · `/api/runs/execute` · `/api/outputs/[id]` · `/api/approvals` · `/api/approvals/[id]` · `/api/conversations` · `/api/conversations/[id]` · `/api/leads` · `/api/business/{campaigns,leads,revenue}` · `/api/marketing/{plans,plans/[id]/generate-drafts,plans/generate,drafts,drafts/generate,drafts/return,approvals,guard,guard/validate}` · `/api/memory/patterns` · `/api/evaluate` · `/api/manager` · `/api/chat` · `/api/chat/tts` · `/api/media/{scripts,scripts/[id],scripts/[id]/regenerate,scripts/from-run,news,news/[id],news/from-run,news/hunt,images/generate,music/generate,voice,token,insights/check,render-input/[scriptId],render/start,render/status/[renderId]}` · `/api/fix-image-agent` · `/api/actions/resume-failed` · `/api/bugscanner/run`

**Klass S — System/cron (testas på mönster: secret + scope + kill switch):**
alla `/api/media/cron/*` (step1–4, publish, autonomous, insights, account-snapshot, competitors, heartbeat, morning-briefing, pipeline-retry, refresh-tokens, reply-comments, token-health, warmup, youtube) · `/api/media/news/cron` · `/api/media/pipeline/{daily,full,intro}` · `/api/media/render/complete` · `/api/media/research/{query,scrape}` · `/api/media/publish/instagram` · `/api/media/debug/subscribe-webhooks` · `/api/runs/drain` · `/api/briefing/cron` · `/api/business/cron/stripe-snapshot`

**Klass W — Webhooks:** `/api/webhooks/instagram` · `/api/webhooks/stripe`

**Klass A — Admin/farlig:** `/api/migrate` · `/api/seed`

**Klass X — Extern API:** `/api/v1/runs` · `/api/v1/runs/[id]` · `/api/v1/workflows`

### C.3 — Assertion-matris (vad leak-testet kräver per klass)

- **U:** (1) oautentiserad → 401/redirect. (2) som A med **B:s** slug/id → 403 eller 404, aldrig B:s data. (3) list-endpoints som A → innehåller **0** av B:s rader. (4) routen använder RLS-klient **eller** går genom tenancy-guarden — en U-route som kör rå service-role utan projekt-scope = **fel**.
- **S:** (1) utan `CRON_SECRET` → 401. (2) bearbetar endast icke-pausade projekt (kill switch). (3) all intern DB-åtkomst scopad per projekt (ingen "hämta-allt-och-agera").
- **W:** (1) ogiltig signatur → avvisas. (2) händelse kopplad till projekt B uppdaterar endast B:s rader.
- **A:** (1) ej anropbar utan admin-secret. (2) markerad som icke-prod/locked.
- **X:** (1) utan API-auth → 401. (2) svar innehåller endast nyckelns projekt.

### C.4 — Hur route-leak-testet byggs

- **Ramverk:** vitest (`apps/web/tests/isolation/routes.test.ts`), ovanpå två-ägare-fixturen från PR-0-grundspecen (owner A/B, projekt A/B, seedade rader för B).
- **Anropsmodell:** testa route-handlers (Next.js Route Handlers) genom att invoka dem med konstruerade `Request` + A:s auth-context (cookie-session) och B:s slug/id som mål. Service-role-klienten används endast för seed/teardown.
- **Datadriven täckning:** en **route-manifest** (se C.5) listar varje route + dess klass; testet itererar manifestet och kör rätt assertion-set per klass. **Nya routes utan manifest-post failar** (ingen route slinker förbi).
- **Kill-switch-test:** pausa projekt B → kör S-routes → verifiera att B:s arbete uteblir men A:s körs; verifiera att `claim_runs` inte plockar B:s runs.
- **Negativt självtest:** en avsiktligt oscopead U-route ska få sviten att **faila** (bevisar att testet biter).
- **Status i PR-0:** rapporterande (visar nuvarande röda routes, särskilt de 73 service-role-routerna), blockerande i PR-6.

### C.5 — CI-regel: route-class-manifest + drift

- **Route-manifest** (deklarativ): varje `/api/*`-route måste ha en post `{path, class: U|S|W|A|X, auth, scoped_by}`.
- **`route-drift`-CI-jobb:** failar om (a) en route saknas i manifestet, (b) en U/X-route deklarerar service-role utan guard/projekt-scope, (c) en S-route saknar `CRON_SECRET`-kontroll, (d) en route ändrat klass utan granskning. Detta gör route-ytan lika mätbar som tabell-ytan (`inventory-drift` i grundspecen).
- Kompletterar de tidigare CI-grindarna (`security-isolation`, `inventory-drift`, lint mot rå `createAdminClient`/osäker `select('*')`).

---

## DEL D — Tillägg till PR-0:s acceptanskriterier

PR-0 räknas som klar (route-delen) när:
1. ✅ Alla 93 routes är klassificerade i manifestet (U/S/W/A/X), inga oklassade.
2. ✅ `routes.test.ts` itererar manifestet och kör assertion-matrisen (C.3) per klass, med grönt negativt självtest.
3. ✅ Kill-switch-testet finns (pausa B → endast B stoppas).
4. ✅ `route-drift`-jobbet kör i CI (blockerar oklassade/nya routes).
5. ✅ En körning visar **faktisk röd lista**: vilka routes (sannolikt bland de 73 service-role) som idag läcker eller saknar scope — utgångsläget för §1/§2-PR:erna.

**Hur resten av Fas 0 mäts mot route-delen:** PR-3B (scopa service-role-queries) och PR-5A–C (guard-migrering) vänder U/X-routes från röd→grön i `routes.test.ts`; kill-switch-enforcement vänder S-routes gröna; PR-6 gör `routes.test.ts` + `route-drift` blocking.

---

### Referensfiler
`apps/web/app/api/**/route.ts` (93 st) · `apps/web/lib/supabase/{admin,server,client}.ts` (klientroller) · `supabase/migrations/20260528_pass_a_safeguards.sql` (`platform_config`, global paus) · `supabase/migrations/20260603_durable_runs.sql` (`claim_runs` — kill-switch-exkludering) · `apps/web/lib/media/safeguards.ts` (befintlig paus-check att generalisera) · `apps/web/app/api/media/cron/{publish,autonomous,reply-comments}/route.ts` (enda som honorerar paus idag) · _(ny)_ `apps/web/tests/isolation/routes.test.ts`, route-manifest, `.github/workflows/route-drift`.
