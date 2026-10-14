# Handlarbörsen – säker konkurrenthistorik P2

Status 2026-10-14: lokal, ren analysmotor för sex fastlåsta offentliga källor. Ingen DB-installation, nätverksläsning, cron, Atlas-exekvering eller ändring i produktion.

## Datakontrakt

- Sex fasta källa-ID:n: tre Handlarbudet-nyheter samt AutoProff, BCA Sverige och AUTO1.com. Ingen fri URL från klienten.
- Högst en oföränderlig observation per UTC-dag och källa. Titel och tid normaliseras före lagring; okänd eller nekad källa sparas som status utan titel.
- Maximalt 30 dagar och 180 poster läses per begäran. Ogiltiga tider, dubbel dag/källa, olistad källa, osäker titel och framtidsdatum nekas.
- Skillnad betyder endast att två efterföljande, framgångsrika observationer av samma källa har olika rubriker. Ett fel mellan dem bryter jämförelsen. Ingen automatisk slutsats om pris, produktlansering eller ändrad tjänst.
- För grafer: endast datum med riktiga observationer. Saknade dagar fylls inte med nollor. Antalet jämförbara par visas bredvid antalet ändrade rubriker.
- Atlas förslag är käll- och tidsbundna, review_only och executable:false. De kräver manuell kontroll och pilotfeedback.

## Databasgrind – inte utförd

Tidigare draft-PR #306 innehåller en prototyp för endast tre Handlarbudet-källor. Den måste utökas och verifieras separat innan den kan appliceras. Före schemaändring krävs:

1. Stäm av produktionsledgern och Oscars redan mergade migrationsfiler. Inget undantag från Omniras migration-guard.
2. Projektlåst tabell med exakta källa-ID/status; RLS och FORCE RLS, inga anon/authenticated grants, service role endast SELECT/INSERT och skydd mot UPDATE/DELETE.
3. Isolerat PostgreSQL-test av rättigheter, hash, tidsstämplar, idempotens vid samtidighet, rollback och 30-dagarsfrågor.
4. Separat godkänd migration; därefter owner-gatad serverläsning och explicit användar-POST med Origin/CSRF, budget, audit och begränsad frekvens.
5. End-to-end-verifiering med verkliga observationer över minst två UTC-dagar innan någon förändringsgraf kan hävda skillnader.

## Autonom bevakning – fortfarande låst

ATLAS_ROADMAP_SV.md kräver verifierad Cost Governance i både Preview och produktion före autonom exekvering. Schemaläggning behöver separat godkännande, budgettak, robots/terms-kontroller, rate limit, kill switch, audit och återkallning. Denna etapp aktiverar inget av detta.

Inga GitHub Actions-körningar, migrationsändringar, behörigheter eller produktionstokens ingår i P2-kärnan.


## P2.5 – owner-gatad lagringsadapter (kodkandidat)

- Servermiljöflagga HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED måste vara exakt true. Default är av. Ingen produktion/Preview-flagga är aktiverad i denna kodetapp.
- Den befintliga RLS-klienten och owner-scope kontrollerar inloggad ägare, Handlarbörsens fasta projekt-ID, live owner_id och slug innan admin-DB-anrop och extern scanning. Medarbetare med enbart läsbehörighet kan inte anropa sparningen.
- En POST till /api/projects/handlarborsen/competitors/history kräver exakt Origin, rätt slug, tom request-body och inga URL-parametrar. Den ger inte klienten möjlighet att välja källor, domän, tid, SQL eller agent-åtgärd.
- Skanningen är manuell (efter ägarens klick) och sker först efter en lyckad databasläsning. Finns redan dagens uppsättning görs inga fler externa anrop. Max sex fastlåsta källor skrivs med ON CONFLICT DO NOTHING. Returvärdet räknar faktiskt insatta rader, inte planerade rader.
- Tidsstämplar från PostgREST normaliseras säkert från RFC3339-offset till kanonisk UTC; titelns SHA256 jämförs vid läsning innan diagrammet visas.
- Historiken visas server-renderad först efter owner-gatad, framgångsrik läsning. Vid fel visas ett tydligt saknas/otillgänglig-läge. Den manuella Spara-knappen visas endast om owner + DB-läsning är verifierad.
- Regressionstester för default-off, origin/body/slug, owner-scope, live owner-ID, idempotens, sex fasta källor, felaktig digest, tidsformat, avsaknad av DB och exakta lagrade antal.

**Kvarstående säkerhetsgrindar innan produktion:** godkänn och applicera föreslagen schemafil via ordinarie migrationsprocess med uppdaterat guard/inventory; bevisa rollback och samtidiga POST-försök med race; granska rättigheter på riktig Supabase; verifiera Preview med flagga och separat testkonto; definiera retention/operatörsrensning. Inga schemalagda kontroller eller automatiska Atlas-åtgärder. Flagga får inte aktiveras förrän samtliga granskningar är godkända.

### Säkerhetskomplettering 2026-10-14 – utfört lokalt

- Idempotens och samtidighet kontrollerad i isolerad PostgreSQL 16: 8 parallella kompletta sexkälls-INSERT med ON CONFLICT DO NOTHING gav exakt 6 rader och en enda fullständig vinnande uppsättning titlar. Container stängd efteråt.
- Om en sparad UTC-dag bara har en del av de sex källorna avbryter tjänsten utan ny skanning; ingen falsk lyckad-dag-status.
- Scan som korsar midnatt UTC avvisas utan DB-skrivning; sex källor kan inte delas på två datum.
- En saknad jämförelse renderas som "Ingen jämförelse", inte som ett nollvärde.
- Föreslagen FK använder ON DELETE CASCADE så att historik inte låser projektradering och tas bort när projektet raderas. Fönstret som API:t läser är 30 UTC-dagar; faktisk fysisk retention i DB är **inte** satt än och kräver separat policy.
- Docker-fixture: docs/sql/handlarborsen_competitor_observations_p2_local_fixture.sql; parallell race-fixture: docs/sql/handlarborsen_competitor_observations_p2_concurrency.sql. Ingen produktionsmigration körd.

**Kvar:** Review av full canonical-migration, produktionsledger och schema inventory samt explicit beslut före Supabase-apply. Separat drift-/retentionstrategi krävs innan automatisk bevakning.
