# Familje-Stunden — hård gräns för högst ett betalt AI-försök per vecka

Datum: 2026-10-28. Omnira-worktree:
\`feat/family-weekly-autoprep-20261028\`.

**Status: förbättrad säkerhets- och körningskod i isolerad PR, ej live.**
All SQL är förslag under \`docs/sql\` och är INTE installerad i Omnira.
Inget Cron, ingen Vercel-route för autonom körning och ingen AI-kreditanvändning
har aktiverats.

## Varför detta krävs

Omniras generella \`public.runs\`-jobb kan återgå till \`pending\` efter en lease/reaper,
och även ett lyckat nätverksanrop kan sakna kvitto. Vanlig jobb-idempotens eller
\`max_attempts=1\` är därför **inte ensamt bevis** på att en betald modell inte
kommer anropas två gånger. Den nya, ytterligare spärren skapar en permanent
\`may_have_incurred_cost\`-post **innan** modellen får anropas.

## Implementerad kod

- \`paid-attempt.ts\`: validerar en originalkällestyrd admission med exakt
  \`ownerId\`, \`projectId\`, \`runId\`, \`claimId\`, \`conversationId\`,
  \`weekStart\`, \`eventId\` och ett nytt \`attemptId\`, samt
  \`publicationAuthority=false\`. Inget lyckat modellanrop får infereras
  från en nätverksfelstyp eller ett ofullständigt databasresultat.
- \`paid-attempt-db.ts\`: snäv serveradapter till två föreslagna,
  \`service_role\`-endast RPC:er. Ingen direkt INSERT, ingen SMTP,
  ingen cron och ingen ny extern provider.
- \`review-pipeline.ts\`: kontrollerar verifierad fakta/bild/veckoplan
  **före** det betalda engångsanspråket. Utan exakt accepterat SQL-kvitto
  anropas ingen modell. Bara den atomärt skyddade
  \`family_weekly_save_editorial_if_current\` får spara utkast;
  ett osäkert slutkvitto skapar ingen falsk granskningsavisering.
- Befintlig \`auto-draft-model.ts\` använder fortfarande bara
  Omniras \`runStep\` och \`withGovernedSpend\` under en verklig
  \`RUN_BOUND\`-claim, med en \`gpt-4o-mini\`-körning och max 1800 token
  i svar. Ingen automatisk modellfallback/retry.
- Granskningsaviseringar skrivs endast efter faktiskt sparade
  \`editorial_review_required\`-utkast och deduplikerar på \`preparation_id\`.

## Föreslagen SQL — EJ applicerad

\`docs/sql/20261028_family_weekly_once_only_model_attempt_proposed.sql\`:

1. \`family_weekly_model_attempts\` med exakt \`UNIQUE(project_id,week_start)\`.
   Inga UPDATE/DELETE-grants, inga klient-RLS-policyer.
2. \`family_weekly_authority_current\` verifierar ägarrelation,
   rätt projektkonversation och ett **verkligt** pågående \`public.runs\`-jobb
   med aktuellt claim-ID, lease, \`max_attempts=1\`, specifik
   \`kind\` och veckobunden \`idempotency_key\`. Samma senaste aktiva
   operatörs \`eventId\` krävs.
3. \`family_weekly_admit_once\` accepterar tidigast söndag 2027-01-03
   kl. 15.00–15.59 Europe/Stockholm och endast måndagen efter som
   målvecka. Avvikande tid/ägare/claim/avbrott leder till nej.
   \`INSERT ... ON CONFLICT DO NOTHING\` returnerar inget nytt kvitto på
   andra försöket.
4. \`family_weekly_save_editorial_if_current\` tar samma transaktionslås
   som den föreslagna owner-consent INSERT-triggern. Antingen hinner
   återkallelsen före sparandet och detta avslås, eller sparandet hinner
   före återkallelsen. Den inbyggda \`social_weekly_save\` behåller
   sin granskade källa, bild, schema-, hash- och dubblettlogik.

**Begränsning:** Ett AI-anrop som redan är iväg kan fortfarande hinna kosta
något om ägaren klickar Återkalla under exakt det nätverksintervallet.
Vi lovar inte retroaktiv återkallelse av ett redan påbörjat providercall.

## PostgreSQL 16 verifiering — ISOLERAD på lokala datorn

Verifierade på ett engångskärl \`postgres:16\`, med Docker
\`--network none\`, **utan** portar/volymer och utan
koppling till produktions-Supabase:

- Förslagens alla 3 SQL-dokument är giltiga PostgreSQL-DDL, tillsammans
  med ett isolerat minimalt schema.
- Ägarens autentiserade RLS-session kan INSERT/SELECT sina egna
  consent-events, främmande roll kan inte skriva eller läsa.
- En verklig, syntetisk \`public.runs\`-claim kan verifieras;
  falskt \`claim_id\` nekas.
- Försök före 2027-01-03 kl. 15.00 nekas; inget betalt tillstånd skapas.
- Max ett sparat \`model_attempt\` per projekt/vecka; dubblett nekas av
  PostgreSQL unique constraint även när run-ID skiljer sig.
- Redaktionellt sparande fungerar endast när verklig owner-run-claim och
  senaste grant gäller (testet använder en minimal, explicit
  \`social_weekly_save\`-stub).
- Privat notis kräver ägarens verifierade sparade redaktionella
  förberedelse och är unik på \`preparationId\`.
- En ägaråterkallelse gör tidigare \`eventId\` ogiltigt för nytt sparande;
  append-only consent och notisavtal kan inte ändras via UPDATE/DELETE.

Output från testet:
\`FAMILY_WEEKLY_SYNTHETIC_PG_ROLE_AND_CLAIM_TESTS_PASS\`,
exit-kod 0. Källorna:
\`docs/verification/fixtures/family-weekly-pg-smoke-setup.sql\` och
\`docs/verification/fixtures/family-weekly-pg-smoke-assert.sql\`.

**Detta är inte ett fullständigt Omnira end-to-end-/pgTAP-test**:
Den riktiga \`social_weekly_save\`, faktiska kundkonton,
privilegieringskonfigurationer och direkt samtidiga nätverksanrop
måste fortfarande testas i en fullständig icke-produktionsmiljö
med alla riktiga Omnira-migrationer. Testets dubblettscenario
använder databasunikhet och syntetiska poster eftersom dagens datum
inte kan autentiskt uppfylla 2027 års söndagsfönster.

## Fortsatt releasegrind

- Stäm av SQL med migrationspolicy och säkerhetsinventeringen;
  inga nya tabeller i Canonical innan SCB-ledgeravvikelsen är löst.
- Riktig operator-session verifierar consent; annan användare nekas;
  verklig run-claim via Atlas generella workflow-system byggs och testas.
- Schemaläggning installeras först efter ägargodkännande, budgetgrind,
  pålitlig notis och godkänd Preview-/produktionsgranskning.
- Kanalerna Facebook/Instagram publicerar först efter SEPARAT
  native \`Godkänn och schemalägg veckans inlägg\`.


## Extra modellgrind och beständigt aviseringskvitto

En ytterligare kodgranskning stängde två risker före PR-uppladdning:

1. Den exporterade textgeneratorn \`generateReviewOnlyWeeklyDrafts\` kräver numera
   **själv** ett fullständigt, giltigt \`PaidAttemptReceipt\`. Om ett annat
   anropsställe försöker hoppa över \`review-pipeline.ts\` nekas modellen
   direkt utan provideranrop. Den matchar även den ägarverifierade
   \`conversationId\` och samtyckets specifika \`eventId\`.
2. Efter ett verifierat \`social_weekly_save\`-kvitto anropar
   pipeline nu det befintliga \`recordWeeklyReviewNotice\` genom en
   ägarkontrollerad \`noticeWriter\`. Endast ett sparat
   \`preparationId\` kan registreras; SQL-ledgret har unikhet på detta ID.
   Om aviseringen inte kan sparas blir status
   \`review_ready\` med \`noticeStored=false\` i stället för att
   starta om/återdebiterar AI-körningen eller ljuga om att inget sparats.
   Det är **en intern notis**, inte e-post, push eller en publicering.

Lokala resultat efter denna sista ändring:
**112/112 Familje-Stunden-veckotester PASS** och scoped TypeScript **PASS**.
Det särskilt isolerade PostgreSQL 16-testet för anspråk,
ägarkontroll, RLS, unikhet, återkallelse och noticekvittot var PASS.
Testcontainern var därefter **stoppad och borttagen**, utan bind mounts
eller öppna nätverksportar.

### Begränsningar och godkännande

Det finns fortfarande inget fullt införlivat av dessa SQL-förslag i
Omniras migrationsledger, inget faktiskt kört 2027-söndagsanspråk,
ingen ny cron-route/cron-registrering och ingen live-operatörsklickad
enrollment. Kodändringarna ligger enbart i PR #581. Vid framtida
aktivering måste befintlig \`runs/drain\`-motor uttryckligen stödja
\`family_weekly_editorial_drafts\` och faktiskt skapa ett unikt,
\`max_attempts=1\`-jobb med origin/projekt/konversation/ägare inlästa
från betrodda källor, inte från modellens output eller ett oskyddat API.


## Fas 5 – verifierad Atlas-jobbskapare och separat RUN_BOUND-hanterare

**Ej aktiverad / förslag i PR.**

### Korrigering mot produktionens verkliga runs-schema

En read-only kontroll av \`pg_constraint\` i Omniras verkliga projekt visade
att \`runs_action_binding_complete\` kräver \`idempotency_key IS NULL\`
när \`workflow_instance_id IS NULL\`, och
\`runs_idempotency_key_sha256\` bara accepterar 64 små hextecken när
nyckeln väl används. Våra tidigare planeringsanteckningar med en
läsbar \`family_weekly_drafts:YYYYMMDD\` direkt i
\`runs.idempotency_key\` hade alltså blivit nekade i produktion.

Den nya, föreslagna
\`docs/sql/20261028_family_weekly_run_creator_proposed.sql\` skapar
i stället \`family_weekly_run_plans\` med en **permanent unik
\`(project_id,week_start)\`**, och ett faktiskt \`public.runs\`-jobb
med \`workflow_id=NULL\`, \`workflow_instance_id=NULL\`,
\`idempotency_key=NULL\`, \`kind=family_weekly_editorial_drafts\`,
\`max_attempts=1\`, inga action-/schema-/publiceringsrättigheter.

Ägaren är inte klient-/modellstyrd: \`family_weekly_enqueue_once()\`
utan argument läser **nuvarande** \`projects.owner_id\`, kontrollerar
\`execution_paused=false\`, senaste aktiva append-only consent-event
och en verklig projektbunden konversation som ägs av personen.
Den får bara skriva söndag kl 15.00–15.59 Europe/Stockholm från och
med 2027-01-03, med kommande måndag som målvecka.
Redan köade, redan förberedda eller återkallade veckor går inte igenom.
Inget cron-schema registreras i detta steg.

\`family_weekly_authority_current()\` i det tidigare
\`once_only_model_attempt_proposed.sql\` kräver nu även att
den permanenta körningsplanen faktiskt motsvarar det aktuella
\`runId\`, ägaren, \`conversationId\`, \`weekStart\`, samtyckets
\`eventId\` och ett verkligt \`claim_id\` som fortfarande lever.
Alla fyra SQL-dokumenten är **förslag**, inte kanoniska migreringar.

### Kod (avstängd som standard)

- \`run-creator.ts\` och \`run-creator-db.ts\`: snäv
  \`family_weekly_enqueue_once()\`-adapter med exakt DB-kvitto.
- \`/api/social-weekly-automation/cron\`: separat Bearer
  \`CRON_SECRET\`-skyddad GET-ingång. Kräver **både**
  \`FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED=true\` och
  \`FAMILY_WEEKLY_ENQUEUE_ENABLED=true\`. Båda är
  default OFF/inte satta i produktion. Inga klientparametrar för
  ägare, vecka, modell eller bolag accepteras.
- \`claimed-run-worker.ts\`: validerar de verkliga fälten i en
  redan hämtad \`public.runs\`-rad, kräver runtime ON, kontrollerar
  ägarskap/run-claim/vecka via service-role DB-RPC, återanvänder
  befintliga \`getWeeklyContext\`, \`runStep\`, governed spend,
  engångsanspråk, atomärt \`social_weekly_save\` och ägarprivat
  in-app-granskningsnotis.
- \`/api/runs/drain\` har nu en **egen, uttrycklig**
  \`family_weekly_editorial_drafts\`-gren så sådana jobb aldrig
  faller vidare till generic workflow/marknadsföring. Avslag
  terminaliseras claim-bundet och misslyckad avisering triggar
  varken nytt modell-anrop eller ny schemapublicering.
- Ingen ändring har gjorts i Familje-Stundens befintliga
  november/december-socialkö, SCB-grenen eller Strato-PR:n.

### Verifierat

- 44/44 riktade Vitest-tester för cronbehörighet, exakt datum,
  dubbel kö, jobbformat, drift OFF, förfalskat claim och
  fail-closed arbetshanterare godkända.
- Avgränsad TypeScript-kontroll PASS inklusive
  \`app/api/runs/drain/route.ts\`.
- Riktig, lokal PostgreSQL 16 med \`--network none\`,
  inga portar/volymer och syntetiska konton:
  - \`normal\`: RLS, dubbletter, DB-signaturer, spärr före
    januarifönstret, återkallelse och editorial-only: PASS.
  - \`simulated-sunday\`: en **endast i Docker-fixturens
    minneskopia** simulerad lokal söndag 2027-01-03 kl 15.10,
    lyckad och exakt 1 native \`runs\`-INSERT och unik
    \`family_weekly_run_plans\`-post; andra försöket blockerades.
    Den då claimade körningen kunde göra exakt en betald
    modell-admission, andra försöket blockerades; rätt
    granskningskvitto skapades, en senare ägaråterkallelse
    spärrade vidare godkännande.
  - Båda resultat gav exit 0:
    \`FAMILY_WEEKLY_SYNTHETIC_PG_ROLE_AND_CLAIM_TESTS_PASS\`
    respektive
    \`FAMILY_WEEKLY_SYNTHETIC_SUNDAY_QUEUE_ONCE_AND_MODEL_ONCE_PASS\`.
  - Båda testcontainrarna stoppades och togs bort.

Reproducerbart via
\`docs/verification/fixtures/run-family-weekly-pg-smoke.ps1\`
med valfri \`-Mode normal\` eller \`-Mode simulated-sunday\`.
Det här är ett **isolerat syntetiskt** Postgres-test, inte
full migration-replay med Omniras riktiga \`social_weekly_save\`
eller något aktiverat januarischema. Fullständigt, inloggat
Preview-acceptanstest och migrations-/RLS-revision återstår
innan produktion.


## Fas 6 – Atlas native jobbskapare, cron-adapter och kodregression

### Implementerat i isolerad PR-gren, avstängt tills release

- Ny **föreslagen och icke-applicerad** SQL:
  \`docs/sql/20261028_family_weekly_run_creator_proposed.sql\`.
  Den innehåller en permanent, unik \`family_weekly_run_plans\` för en
  Familje-Stunden-vecka och \`family_weekly_enqueue_once()\` utan
  användarinmatning. SQL väljer projektets befintliga ägare och en av
  den ägarens faktiska projektbundna konversationer, kontrollerar
  \`execution_paused=false\`, senaste aktiva consent-event och lokal
  söndag 15:00–15:59 från januari 2027 innan ett review-only-jobb
  får skapas i **befintliga** \`public.runs\`. En redan sparad
  förberedelse eller veckokö gör omförsök till no-op.
- **Verklig produktionsschemainkompatibilitet åtgärdad:** read-only
  inspektion av \`pg_constraint\` visade att ett obundet \`runs\`-jobb
  måste ha \`idempotency_key=NULL\`, trots att bundna workflow-actions
  accepterar SHA-256. Därför använder denna nya arbetsström en egen
  \`UNIQUE(project_id,week_start)\`-tabell i stället för att skriva en
  läsbar veckonyckel till \`runs.idempotency_key\`. Detta har
  bekräftats i en isolerad fixture med motsvarande DB-constraints.
- \`run-creator.ts\` + \`run-creator-db.ts\` är fail-closed
  enqueue-adaptrar. Den skyddade \`GET
  /api/social-weekly-automation/cron\` kräver exakt server-side
  \`CRON_SECRET\` och **båda** oberoende flaggorna
  \`FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED=true\` och
  \`FAMILY_WEEKLY_ENQUEUE_ENABLED=true\`. Alla flaggor är OFF
  som standard; ingen \`vercel.json\`-registrering, \`pg_cron\`
  eller annan timer har skapats i denna PR.
- \`claimed-run-worker.ts\` har en egen verifierad jobbtyp
  \`family_weekly_editorial_drafts\`, med samma \`RUN_BOUND\`
  \`claim_id\` som den existerande \`runs/drain\`-motorn.
  Den får aldrig skapa egna claims eller en ny identitet.
  Funktionen accepterar bara aktuell status \`running\`,
  \`attempts=max_attempts=1\`, rätt familjeprojekt,
  obundet workflow, och en fullständig DB-verifierad
  projektkonversation, ägare, consent-event och målvecka
  via \`family_weekly_authority_current\`.
- En liten uttrycklig gren i \`app/api/runs/drain/route.ts\`
  hindrar jobbtypen från att falla vidare till generic
  agent-/marketing-/site-builder-flöden. Om en kontroll fallerar
  terminaliseras det ägda jobbet utan betalt modell-anrop;
  endast ett verifierat redaktionellt resultat kan slutföras.
- Kostnadsstyrd textgenerering, exact-once-admission,
  atomär slutkontroll mot återkallat consent,
  \`social_weekly_save\`, och unik intern granskningsnotis
  återanvänder de föregående PR-etapperna. Ett misslyckat
  notiskvitto startar **aldrig** en ny AI-generering.
  Native separat owner-approval krävs fortfarande för
  all schemaläggning och publicering.

### Verifiering

- **44/44** riktade nya testfall för cron-gate, verklig
  run-claim-koppling, fel vecka, fel ägare, tidigare consent,
  falsk claim-ID, och offentlig route som inte anropar DB
  om en flagga/CRON_SECRET saknas.
- **383/383** relevanta Vitest-testfall gröna: hela
  Familje-Stunden weekly-sviten + Migration Guard v2
  + Schema Security Invariant + Migration Security Gate.
- Avgränsad TypeScript-kontroll **PASS**, inklusive hela
  \`app/api/runs/drain/route.ts\` och den skyddade cron-routen.
- Reproducerbar lokal PostgreSQL 16:
  \`run-family-weekly-pg-smoke.ps1 -Mode normal\` **PASS**,
  \`-Mode simulated-sunday\` **PASS**. Januariklockan simuleras
  **endast genom ersättning i minnet när SQL strömmas till
  en helt isolerad Docker-instans**; produktionskoden innehåller
  inget testklock-undantag. Kontrollerade riktig run-INSERT
  med NULL idempotency-key, ägarkoppling, en plan per vecka,
  en paid-attempt, claim-rotation, post-save-kvitto och revoke.
  Alla Docker-testcontainrar är stoppade och borttagna.
- \`lib/qa/website-build-drain.test.ts\` kunde inte samlas
  i denna arbetsyta eftersom den kräver en särskild
  \`WEBSITE_BUILD_TEST_DATABASE_NAME\`-fixture. Den är
  inte en del av ovanstående 383 gröna tester och anges
  **inte** som godkänd. Ingen sådan fixture fabricerades
  eller ärvd testdatabas användes.

### Kvarvarande release-gates

1. SCB-arbetsströmmens parallella migrationsledgeravvikelse
   måste lösas i sin egen PR, inte kopieras in här.
2. Alla **fyra** föreslagna SQL-filer för samtycke,
   avisering, veckokö och betalt modellanspråk ska
   granskas/tillämpas genom normal migreringspolicy,
   med full PostgreSQL/pgTAP-role replay samt RLS
   mot Omniras riktiga migrationsuppsättning.
3. Skyddad Preview med ägarens autentiserade session
   och kanonisk \`social_weekly_save\` måste testas.
   Den riktiga söndagskörningen 2027-01-03 är ännu
   **inte** installerad eller aktiv.
4. Ägaren behöver klicka ett uttryckligt, tidsbegränsat
   consent i Omnira. Om en körning aktiveras senare
   förbereder den **bara** utkast; faktiska sociala
   publiceringar har sin separat godkända kö.

PR:n ska stanna **DRAFT** tills dessa grindar är klara.


## Fas 7 – Native SQL-kontrakt och uppdatering till aktuell main

2026-10-28, 14:30 svensk tid. Den här etappen korrigerar ett konkret
integrationsglapp mellan AI-utkast och den **faktiska** produktionsfunktionen
\`public.social_weekly_save(jsonb,jsonb)\`, utan någon produktionsskrivning.

### Native-save-kontrakt verifierat läsbart i produktion

\`pg_get_functiondef\` och den kanoniska migrationen
\`apps/web/supabase/migrations/20261026090516_family_weekly_preparation.sql\`
bekräftar att varje enskilt utkast måste ha exakt nyckeluppsättning:

\`slotKey, channel, assetId, text, title, sourceReferences, scheduledAt\`.

Den textstyrda modellen får avsiktligt inte välja tider och returnerar
**inte** \`scheduledAt\`. Föregående review-pipeline skickade därför ett
utanpåliggande \`WeeklySave\` utan detta obligatoriska fält genom vår nya
atomära editor-RPC. Det hade inte fungerat mot den kanoniska
\`social_weekly_save\` trots att syntetisk SQL-stub hade passerat.

\`paid-attempt-db.ts\` härleder nu \`scheduledAt\` från
\`slotKey\` med samma \`resolveStockholmSchedule\` som den gamla,
godkända \`prepareWeeklyDrafts\`. Endast vanligt format
\`YYYY-MM-DDT17:00:ordinary\` respektive \`...T20:30:ordinary\`
är giltigt; explicit modellstyrd tid skrivs alltid över. Alla tidigare
verktygskontrakt (ägare, context-hash, komplett Facebook/Instagram-par,
dubbletter, källreferenser) kontrolleras fortsatt i native SQL.

Läsbar kontroll mot den verkliga produktionsfunktionen
\`social_schedule_resolve_minute\` bekräftade:

- Tisdag 2027-01-05 17:00 Stockholm = 16:00 UTC.
- Fredag 2027-01-08 20:30 Stockholm = 19:30 UTC.
- Tisdag 2027-07-06 17:00 Stockholm = 15:00 UTC.

\`service_role\` har också \`EXECUTE\` på
\`public.social_weekly_save(jsonb,jsonb)\`. Inga produktionsfunktioner
anropades med muterande innehåll.

### SCB-samordning utan övertramp

Den tidigare SCB migration-filen
\`apps/web/supabase/migrations/20261028072659_handlarborsen_scb_review_only_candidates.sql\`
har kommit in i \`origin/main\`. Denna branch har
samordnats med aktuell \`origin/main\` via en vanlig merge,
**utan konflikt, branch-omskrivning, force-push eller ändring i den
parallella SCB-worktreen**.

### Verifiering av sammanlagd kod

- **386/386** relevanta Vitest-tester PASS i 17 suites för
  Familje-Stunden weekly + migrationssäkerhet + schema-invarianter.
- Scoped TypeScript inklusive \`runs/drain\`,
  \`paid-attempt-db.ts\` och den skyddade cron-routen PASS.
- Lokalt \`node scripts/check-migrations.mjs\` returnerar 0
  men med besked **"not on Vercel — skipping"**; därför betraktas
  detta inte som kontroll av produktions-ledger.
- Nästa obligatoriska verifiering är en **färsk Vercel Preview
  för exakt uppdaterad branch-commit**.
- Fyra nya SQL-förslag kvarstår i \`docs/sql\`; de är ännu
  **inte** produktionsmigrationer. Ingen automatisk körning,
  publicering eller avisering har aktiverats.


## Fas 8 – Verifierad Preview, produktionsschema och stoppgrindar (2026-10-28)

**Verifiering före denna etapps ändringar:** Exakt commit
`527c6e1af7d357d2e0c343443a92be3b8a254a67` har Vercel Preview
`READY` (`dpl_DaUbFLfJDFUJXtPNWcA3Qyq7NysU`), GitHub/Vercel status
`success` och åtta avslutade GitHub Actions-workflows med `success`.
SCB-migrationsledgern blockerar inte längre denna Preview. PR #581
är fortfarande DRAFT och inte mergad. En ny kodcommit kräver egen CI/Preview.

**Läsbar verklig databasverifiering:** Omniras Supabase/PostgreSQL 17
innehåller de kanoniska funktionerna `social_weekly_context`,
`social_weekly_save`, `social_content_active` och
`social_schedule_resolve_minute`. `runs` kräver NULL
`idempotency_key` på obundna jobb. Familje-Stunden har en godkänd
kanalplan, ägardata och 20 beskrivna bilder; Facebook/Instagram-bindningarna
är `provider_attested` och inte blockerade. Veckan 4–10 januari 2027
har inga befintliga schemalagda jobb eller sparade veckoförberedelser.
Ingen skrivning eller muterande funktion anropades i produktionsdatabasen.

**Ny identifierad skyddslucka och avgränsad kodrättning:**
De föreslagna RPC:erna kontrollerade inte samtliga stoppvillkor i
kanonisk `social_content_active` innan jobbkön eller kostnadsanspråket.
`family_weekly_enqueue_once`, `family_weekly_run_plan_guard` och
`family_weekly_authority_current` kräver nu att
`projects.execution_paused=false`, att ingen inaktiv
`project_lifecycle` finns och att `platform_config.automation_paused`
inte är satt. Samma källa används i de existerande editorflödena.

**Isolerad PostgreSQL-verifiering:** Både normalt roll-/RLS-/claim-test
och simulerad söndag 3 januari 2027 har PASS, inklusive projektstopp,
globalt STOP, inaktiv livscykel och globalt STOP mellan RUN-claim och
betalt modellanspråk. Dockercontainrarna har stoppats och tagits bort.
Regressionstester låser även sommartidskonvertering till 15:00 UTC
för tisdag 6 juli 2027 kl. 17:00 Stockholm, oavsett modellens fält.

**Kvarstående grindar:** En autentiserad ägarsession kunde inte
öppnas via Vercels skyddade Preview; den direkta läskontrollen returnerade
401. E2E för UI och full kanonisk `social_weekly_save` med riktig
schema-replay i en skyddad separat testmiljö återstår. Våra isolerade
PostgreSQL-tester använder uttryckligen en stub för native save och
får inte beskrivas som ett godkänt end-to-end-test mot riktig
`social_weekly_save`. Ingen SQL har installerats i Supabase, ingen
cron är aktiverad, inga AI-modellanrop har betalats och inget har
publicerats. Alla flaggor ska fortsätta vara OFF tills separata
granskningar och uttryckligt ägargodkännande är klara.

**Fas 8 verifierad testmatris:** 17/17 relevanta Vitest-sviter,
387/387 testfall PASS efter säkerhetsskärpningen; fullständig
`npm run typecheck` i `apps/web` PASS (exit 0); `git diff --check`
PASS. Den tidigare Website Build-testrutinen utan sin särskilda
databasfixture ingår inte i dessa testresultat.


## Fas 9 – Canonical native social_weekly_save i isolerad PostgreSQL (2026-10-28)

Efter Fas 8 genomfördes en ytterligare **skrivskyddad gentemot alla riktiga
Supabase-projekt** integrationstestning. En tredje runner-mode,
`-Mode native-editorial`, startar endast en tillfällig PostgreSQL 16 i
Docker med `--network none` och utan externa portar, mounts eller volymer.
Den läser **exakt den kanoniska funktionskroppen**
`public.social_weekly_save(jsonb,jsonb)` från
`apps/web/supabase/migrations/20261026090516_family_weekly_preparation.sql`
och installerar en lokal `CREATE OR REPLACE`-kopia ovanpå den äldre
syntetiska test-stubben. Den faktiska funktionen är därmed under test,
medan beroende-funktioner (`social_weekly_context`,
`social_content_save`, källa/profil/asset- och granskningsunderlag)
uttryckligen är isolerade testdubletter. Detta **är inte en full replay
av hela produktionsschemat eller full E2E**.

Native PostgreSQL-test: **PASS**. Verifierar explicit att saknat
`scheduledAt` får fel av den riktiga funktionen; komplett Facebook-
och Instagram-par på tisdag kl. 17.00 Stockholm respektive fredag
kl. 20.30 sparar fyra redaktionella utkast med noll
publiceringsbehörighet; samma kvitto/antal poster återkommer vid
idempotent återupprepning; ägarprivat notis knyts till verkligt
`preparationId`; efter ett återkallat consent får inget nytt sparande
ske. Alla operationer gjordes i den tillfälliga testdatabasen, som
stoppats och tagits bort.

Det befintliga normala PostgreSQL- och simulerade söndagstestet kvarstår
som separata modes. Testverktygets Docker-cleanup inväntar nu asynkron
`--rm`-städning efter `docker stop` utan att röra andra containrar.

Verifierat för commit `88517e0`: alla åtta GitHub Actions-workflows
**success** och exakt Vercel Preview **READY**. Fas 9 är en ny,
ännu ej CI-verifierad kodändring fram till egen push och ny Preview.

## Fas 10 – Kanonisk content-writer och negativa behörighetsfall (2026-10-28)

Ny isolerad runner-mode: `-Mode native-content`. Utgår från samma
ofarliga PostgreSQL 16-container (`--network none`, inga publika portar,
volymer eller mounts) som övriga modes. Kör fyra **föreslagna, ej
produktinstallerade** Family SQL-filer i enbart testdatabasen.

Förutom den redan kanoniska `social_weekly_save` läses nu även
**ordagrann SQL-kod från den kanoniska migrationen**
`20261016100941_social_content_preparation_v1.sql` för
`social_content_posts`, `social_content_revisions`,
`social_content_decisions`, `social_content_validate`,
`social_content_requirements`, `social_content_read` och
`social_content_save`. De kanoniska tabell- och funktionsutdragen laddas
utan att reimplementera affärslogiken. Övriga beroenden (identitetsfixture,
projekt, godkänd kanalplan, kontobindningar, en ägd JPEG och
`social_weekly_context`) är uttryckligen testdubletter, inte en dump
eller replay av hela produktionsdatabasen.

`native-content` har PASS för 4 sparade riktiga revisioner under
4 redaktionella inlägg, rätt Facebook-/Instagram-kontobindningar,
bild-SHA, godkänd plan, Stockholmstider, en idempotent
veckoförberedelse, en kopplad intern avisering och ingen automatisk
ägarattest. Fyra **negativa** kanoniska writer-kontroller passerade:
främmande ägare, oägd bild, spärrad kontobindning och saknat
plangodkännande. De avslås utan ytterligare inlägg eller revisioner.

Testerna är **inte** full-schema-replay, riktigt Supabase-RLS med
autentiserad ägarsession, kundpublicering, leverans, externa konton,
eller betald AI-generering. Dessa steg är fortfarande RELEASE GATES.
Ingen produktionstabell har skapats, ingen cron är på, inget AI-anrop
har gjorts och inget har publicerats.

## Fas 11 – UI-kvitto, återkallelse och isolerad webbläsargranskning (2026-10-28)

Den befintliga `SocialWeeklyAutomationControls` hade ett viktigt fel:
när `POST /api/social-weekly-automation` misslyckades eller kvittot
tappades, sade gränssnittet att ingen ändring hade sparats. Ett POST kan
dock redan ha committats innan dess HTTP-svar går förlorat. Det var en
felaktig och säkerhetskänslig slutsats för både opt-in och återkallelse.

Gränssnittet behandlar nu ett tvetydigt POST-kvitto som **osäkert**:
inga nya opt-in-/revoke-knappar visas och inget POST upprepas
automatiskt. Ägaren måste först välja **Kontrollera sparad status**,
vilket gör en separat, ej cachad, autentiserad GET-läsning och
återställer knapparna först när ett strikt review-only-svar har
verifierats. Även ett felaktigt GET-svar låser beslutsytan till nästa
bekräftade statuskontroll. Ingen status får påstå
`canSchedule=true` eller `canPublish=true`.

Ägaren får fortfarande återkalla ett tidigare godkännande även när den
separata schemapanelen är disabled/under omläsning; samma
serverstyrda project-owner-, operator-, same-origin- och session-RLS-
kontroller gäller vid själva POST-anropet. Att granskningslänken i
panelens notice-lista nu är en fast **relativ** projektsökväg håller
läsgranskning inom aktuell Preview/produktionsorigin utan att navigera
till en annan deployment. Främmande projekt renderar inte kontrollen
och anropar inte API:et.

Testad i Chromium med befintlig isolerad
`playwright.weekly-preparation.config.ts` och Vite-fixture;
**9/9 Playwright PASS** inklusive explicit opt-in/revoke, osäkert kvitto,
återläsning utan dubbla POST, disabled schemapanel, projektgräns,
notislänk, felaktigt GET-svar, korrupta granskningsaviseringar och befintlig oberoende
innehålls-/schemagranskning. Veckosviten **137/137 Vitest PASS**
(inklusive ett nytt server-API-test där INSERT kan lyckas före att den
efterföljande läsningen misslyckas). Hela
`npm --prefix apps/web run typecheck` **PASS**.

**Begränsning:** Playwright testade riktiga React-komponenter men
API-svaren var uttryckliga testdubletter. Det är inte ett inloggat
ägartest mot Vercels skyddade Preview och inte ett fullschema
Supabase/Postgres end-to-end-test. Inga API-flaggor, cron, SQL-migrationer,
AI-anrop eller publiceringsjobb har aktiverats.

## Fas 12 – Skydd mot framtida regressioner i GitHub CI (2026-10-28)

De 137 veckorelaterade Vitest-testerna och 9 isolerade Chromium/
Playwright-testerna kördes tidigare lokalt men saknades som **obligatoriskt
exekverade steg** i den befintliga GitHub-workflowen
`Atlas Studio Responsive UI`.

`.github/workflows/atlas-studio-ui.yml` anropar nu
`npx vitest run lib/social-launch/weekly` och
`npx playwright test --config=playwright.weekly-preparation.config.ts`
i samma redan existerande UI-jobb efter installation av Chromium.
Workflowens filfilter täcker nu veckans React-fixtures, API-rutter,
den centrala runs/drain-vägen, Playwright-konfigurationen, berörda
SQL-förslag och SQL-testfixtures. Denna ändring skapar ingen ny
arbetskö, ingen produktionscron och ger ingen publiceringsbehörighet.

**Verifikationsgrind:** körning och slutlig status för den exakta nya
committen i GitHub Actions måste kontrolleras efter push; lokal
testpassning ensam räcker inte som CI-bevis.

## Fas 14 – Riktigt kanoniskt claim_runs i isolerad PostgreSQL (2026-10-28)

Efter CI-integrationen av de fyra tidigare testlägena har vi lagt till
ett femte: `-Mode native-claim`. Den befintliga testköraren laddar
**exakt den kanoniska funktionen** `public.claim_runs(integer,integer)`
från `apps/web/supabase/migrations/20261015041654_atlas_builder_studio_workspace.sql`
i enbart en disposable PostgreSQL 16-container med `--network none`,
utan volymer eller publika portar. Funktionen har även granskats läsbart
mot Omniras aktiva Supabase/PostgreSQL 17-definition.

En extra minimal fixture tillför `platform_config.id=1`,
`runs.created_at/claimed_at/started_at` och
`project_lifecycle.version` som **faktiska dependency-kolumner**,
utan att ändra Omniras produktionsschema eller beröra andra Dockercontainrar.
Endast de föreslagna veckofunktionernas lokala söndagsklocka ersätts
i minnet med 3 januari 2027 kl. 15:10 Stockholm.

Detta test använder **den faktiska `claim_runs`-uppdateringen**, inte
en manuell `UPDATE runs SET status='running'`. Det kräver att
Familje-Stundens native köpost skapas en gång med
`idempotency_key=NULL`, att projektstopp och globalt STOP blockerar
claim, att riktiga `claim_id`, lease, försök och körstatus skapas,
att ett andra claim inte hittar ett redan taget jobb, och att
`family_weekly_authority_current` godtar just det verifierade
native-jobbet. Globalt STOP mellan claim och betalt anspråk blockerar
kostnad, därefter tillåts högst ett betalt anspråk per vecka.
Utgången lease och ett separat autentiserat owner-revoke tar bort
auktoriteten utan att radera permanenta kö-/kostnadsledgern.

**Windows-test: PASS**, exitkod 0. Temporary container stoppades
och avlägsnades. Det nya läget är tillagt i den befintliga
`Atlas Studio Responsive UI`-workflowens separata disposable
PostgreSQL-jobb. Ny commit kräver egen verifierad GitHub CI/Preview.

**Viktig begränsning:** Detta är verklig kanonisk `claim_runs` med
isolerade, noggrant begränsade beroendetabeller – inte en full replay
av alla 163 migrationsfiler, en riktig Supabase Auth-session eller
en fullständig publiceringskedja. Ingen cron, produktionsmigration,
AI-kostnad eller automatisk postning har aktiverats.

## Fas 15 – PostgreSQL 17 och produktionens parent-RLS (2026-10-28)

Första verifiering mot Omniras produktions-PostgreSQL gjordes
**enbart läsbart**: `pg_policies` visade
`projects_owner`, `conversations_owner` och `runs_owner`
som `FOR ALL TO PUBLIC` med owner-principaler via `auth.uid()`
och ägda projekt. Testsviten kompletterades med
`family-weekly-pg-parent-rls.sql` som aktiverar RLS på de syntetiska
parent-tabellerna och återger **deras faktiskt observerade
RLS-predikat**. En autentiserad ägare får läsa sitt projekt,
sin konversation och sitt jobb; främmande inloggad användare får
noll rader trots SELECT-behörighet; service_role ser fixturedata.
`platform_config` och `project_lifecycle` får också RLS i fixture
(utan att ge vanligt inloggade användare egna policies).

Testköraren accepterar endast `postgres:16` eller
`postgres:17-alpine` via en ny explicit `-PostgresImage`-parameter.
`--pull=never` och `docker image inspect` hindrar oplanerad
nedladdning och diskförbrukning på stationära datorn.
Samtliga fem isolerade testlägen **PASS lokalt på PostgreSQL 17**:
`normal`, `simulated-sunday`, `native-editorial`,
`native-content` och `native-claim`. Därtill är
`normal` PASS på PostgreSQL 16 med parent-RLS påslagen.
Varje container stoppades och avlägsnades automatiskt.

Den befintliga GitHub-jobbkön verifierar nu alla fem lägen på
PostgreSQL 16 och kompletterar med `normal`, `native-claim`
och `native-content` på PostgreSQL 17. GitHub ska kontrollera
slutresultat för exakt ny commit innan CI kallas grönt.

**Avgränsning:** Parent-RLS-reglerna hämtades från riktiga
`pg_policies`, men de underliggande testtabellerna och vissa
beroendefunktioner är fortfarande smala testdubletter.
Detta är ännu **inte** replay av hela produktionsschemat med 163
migrationsfiler, RLS under riktig autentiserad Vercel Preview-session
eller någon faktisk social publicering. Inga Supabase-skrivningar,
produktnycklar, cronaktiveringar eller betalda modellkörningar gjordes.

## Fas 16 – Kanoniska runs-bindnings- och kostnadsbegränsningar (2026-10-28)

Ytterligare en **läsbar produktionsgranskning** via
`pg_get_constraintdef` av `public.runs` identifierade att
den tidigare syntetiska `runs_action_binding_complete` bara
modellerade två kolumner och därför inte kunde avslöja
felaktiga, icke-tomma action-proveniensfält på obundna jobb.

Den isolerade fixturen `family-weekly-pg-runs-constraints.sql`
lägger nu till samma relevanta action-kolumner och återskapar de
faktiskt observerade CHECK-villkoren för:
`runs_action_binding_complete`,
`runs_action_class_vocabulary`,
`runs_idempotency_key_sha256` (redan i grundtabellen),
`runs_material_actions_single_attempt`,
`runs_unauthorized_action_is_read_only` och
`runs_status_check`. Negativa tester förkastar obunden
action-proveniens, idempotency_key på obundet jobb, icke tillåten
status och ett material/finansiellt jobb med flera försök.

**Lokalt PASS** med dessa skärpta villkor: PostgreSQL 17
`normal`, `native-claim` och `native-content`, samt
PostgreSQL 16 `normal` och `native-claim`. Alla kördes i redan cachade
engångscontainrar utan nätverk; samtliga containrar togs bort.

**Kvarstår:** detta återskapar ett avgränsat urval av kanoniska
CHECK-constraints, inte alla triggers, FK-beroenden, fullständig
Supabase Auth-miljö eller samtliga produktionsmigrationsfiler.
Inget test får betraktas som ett produktionsgodkännande. Samtliga
Family SQL-förslag är fortsatt oinstallerade och automatiken OFF.
