# Handlarbörsen – beständigt kandidatminne P1 (förgranskning 2026-10-15)

## Mål och scope
Separat historik för upptäckta, källverifierade konkurrentkandidater, skild från sexkällors oföränderliga konkurrentskanning. En nyupptäckt kandidat i Omnira är inte ett nybildat företag. Granskningssignal, inte affärsbeslut.

## Gjort i kod (bakom AV-flagga)
- HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED är frånvarande i Preview/produktion och default OFF.
- Föreslagen SQL: docs/sql/handlarborsen_competitor_candidates_p1_proposed.sql. Inte installerad och inte en canonical migration. Inga driftinställningar ändrade av P1.
- Serverläsning och explicit ägarstyrd POST accepterar inga kandidatnamn, fria URL:er, timestamps eller externa API-resultat från klienten.
- Endast första redaktionellt källgranskade TradingSolutions D2D-leaden kan skrivas i P1. Postens (project_id,host) är unik. Dubbletter ignoreras utan UPDATE; gamla underlag är immutabla.
- first_seen_at skapas av databasen. Både server och schema kontrollerar projekt, värdefält, HTTPS-källa, stabil domän och SHA256 för textunderlaget.
- Läsning av minnet visas endast på projektets server-renderade sida efter samma owner-kontroll; ingen Data API-åtkomst från klientroller.
- Projektbunden granskningssignal på sidan baseras på beständigt lagrade kandidatrader när flaggan är ON. Det är inte pushnotis, mejl, arbetsorder eller exekveringsrätt.
- Fel, korruption, schemafrånvaro, utomstående användare och partiell läsning får inte skapa fiktiva poster eller framgångsstatus.

## Verifiering 2026-10-15
- 49/49 riktade Vitest-tester och TypeScript typecheck passerade lokalt.
- Isolerad Supabase PostgreSQL 17.6 (Docker): föreslagen DDL installerad framgångsrikt med RLS, FORCE RLS och minsta möjliga grants.
- Första insertionen gav 1 rad, upprepad insertion 0 rader. Felaktig SHA256 avvisades.
- Negativt behörighetsbevis: anon SELECT, authenticated INSERT och service_role UPDATE nekades av PostgreSQL.
- En enda korrekt datarad fanns efter testerna; den isolerade containern stoppades och avlägsnades.
- Testerna ändrade inte Omniras riktiga Supabase-projekt eller Vercel-flaggor.

## Fortfarande EJ gjort
1. SQL-filen kräver isolerade PG17.6-tester, säkerhetsgranskning och separat godkänt produktionsbeslut. När den appliceras: skapa canonical fil via CLI, uppdatera Migration Guard och schema-security inventory med aktuellt ledger-bevis. Följ branch protection.
2. Sätt P1-flaggan först i ägarautentiserad, skyddad Preview och bevisa riktig insert, idempotent dubbelklick, RLS och 403 för en separat icke-ägarsession. Aktivera i produktion först efter godkänt Preview.
3. Utred källa/API-avtal före återkommande sökning; tillfälliga sökträffar är inte fria att arkivera. Lagra enbart egen oberoende kontroll av officiella källor med tillåten åtkomst.
4. Skapa separata, idempotenta Atlas-notifikationer/meddelandeinställningar (in-app, eventuellt senare e-post) med användarstyrda kanaler, och explicita beslut för nya skanningskällor.
5. Verifiera Cost Governance i Preview och produktion, totalbudget och HTTP-tak, lease/idempotens, audit, projektbehörighet, global/projektstopp och robots/terms innan autonom schemaläggning.

## Viktigt
Den manuella sexkällors historik och PostHog fortsätter som tidigare. Oscars kontobehörigheter, Atlas generell minnesarkitektur och andra projekt påverkas inte. Inga cron-, kostnads-, RLS-, migrations- eller utgående notisändringar i P1-implementationen.

## Skyddad CI-grind
- PR:n måste passera normala obligatoriska GitHub Actions-kontroller före merge. Ingen skip-ci eller policyundantag.
