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
