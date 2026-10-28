# Omnira – avstämning av redan applicerad SCB-migration

**Datum:** 2026-10-28
**Typ:** Versionsstyrd produktionsledger-avstämning, INTE en ny databasoperation.
**Isolerad branch:** `fix/omnira-scb-applied-ledger-reconcile-20261028`.
**Källa:** ren lokal owner-arbetsgren `feat/hb-leadfinder-scb-20261027`, commit `7a6cc5f`.

## Varför detta krävs
Vercel Preview-byggen för bland annat Atlas PR #577 (formaterade svar) och #580
(källkvalitetsvarningar) stoppas **korrekt** av migrationsskyddet. Produktions-
journalen innehåller redan `20261028072659_handlarborsen_scb_review_only_candidates`,
men SQL-källfilen och uppdaterade policy-/testförväntningar saknas i `main`.

Lösningen är att lägga till precis den redan applicerade SQL-källan och låta
fail-closed-spärren kontrollera samma verklighet, inte att sänka spärren.

## Skrivskyddade kontroller mot produktions-Supabase
Projekt: `AI Operating Platform` (`eu-west-1`).

- `supabase_migrations.schema_migrations` innehåller version `20261028072659`
  med namn `handlarborsen_scb_review_only_candidates`, exakt en journalrad.
- Journalens statement-text (utan filens kommentarheader och sista radbrytning)
  har MD5 `1f2ac10b5380bff29aabf64b27bf7a71`. Samma MD5 fås för den
  lokala owner-filens motsvarande SQL-kropp. Detta är en
  **innehållslikhetskontroll**, inte en säkerhets- eller funktionstestning.
- Tabellen `public.hb_lead_candidates` existerar och innehöll **0 rader**
  vid kontrollen. Ingen import eller utskick har gjorts.
- RLS aktiverad. `anon` saknar SELECT. `authenticated` har endast SELECT,
  med policy `hb_lead_candidates_owner_read` där
  `projects.owner_id = auth.uid()`. `authenticated` saknar INSERT och UPDATE.
- `service_role` har INSERT enligt redan tillämpade rättigheter. Denna PR
  förändrar inte de rättigheterna eller applikationens skrivvägar.

## Exakt scope för releaseändringen
1. Kopiera samma fil
   `apps/web/supabase/migrations/20261028072659_handlarborsen_scb_review_only_candidates.sql`.
2. Uppdatera `EXPECTED_CANONICAL_SQL_COUNT`: 162 → 163.
3. Uppdatera `EXPECTED_ENFORCED_COUNT`: 148 → 149.
4. Justera migrationsvaktens testfixtures för **186** nu kända journalposter
   (tidigare 185) och ge den nya migrationen krav på exakt en förekomst.
5. Lägg till `public.hb_lead_candidates` i det befintliga, fail-closed
   schema-säkerhetsregistret som `TENANT_RLS` med **en** owner-scopad
   authenticated-SELECT-policy, noll anon-behörighet, oförändrad service-role.
   Registret uppdateras med just denna scoped observation: 183 → 184 kända rader.
   Det är **inte** ett påstående att hela produktionskatalogen återinventerats.
6. Utöka det befintliga schema-invariant-testet med samma observerade klass.
   Detta löser tre röda säkerhetskontroller genom sanningsenlig klassificering,
   inte genom allowlist-undantag eller sänkta säkerhetskrav.

**Ingen förändring** av frozen grandfather/legacy-allowlists, behörigheter,
Supabase-databasen, scheduler, marknadsföring, mejlutskick, live SCB-API,
lead-import eller Handlarbörsens operativa pipeline.

## Särskild säkerhetsavgränsning
Den separata SCB-arbetskopian innehåller fler opublicerade implementerings-
commits. De följer **inte med** detta avstämningspaket och worktreen har
inte ändrats.

Den första PR-testkörningen passerade migrationsgrinden och Vercels preview,
men Atlas Project Isolation stoppade rätteligen en **oklassificerad ny tabell**.
Den nya registry-posten krävs därför före nytt grönt totalresultat.

Byggtester på GitHub och Vercel krävs mot exakt slut-HEAD; **merge till main
först efter verifierat godkänt release-test**. Vercels build-migrationscheck
ska köras som vanligt med korrekt produktionjournal och ska inte kringgås.

Migrationsfilen är redan tillämpad: den får **inte köras en andra gång**
manuellt för att få ett grönt bygge.
