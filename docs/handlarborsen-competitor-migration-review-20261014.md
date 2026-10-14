# Handlarbörsen P2 – granskningsklar migrationskandidat (2026-10-14)

**LÄGE: EJ APPLICERAD, EJ PUBLICERAD SOM PR, EJ MERGAD.** Detta är ett isolerat lokalt review-arbete. Ingen produktionstabell har skapats och `HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED` är fortsatt avstängd.

## Exakt migrationsförslag
- Canonical SQL: `apps/web/supabase/migrations/20261014143000_handlarborsen_competitor_observations_v1.sql`.
- Ett nytt projektskopat register med 6 fasta källor, per-UTC-dag-unik nyckel, lagrad kort sidtitel med sha256-kontroll och explicit status utan titel vid misslyckad kontroll.
- RLS = ON, FORCE RLS = ON, noll client policies, `anon` och `authenticated` helt återkallade. `service_role` har endast SELECT och INSERT; varken UPDATE, DELETE eller TRUNCATE.
- ON DELETE CASCADE på projekt-FK så projektborttagning kan radera dess observationer; verksamhetsrätten att radera själva projektet styrs av tidigare projektsäkerhet.
- Förslagets status är manuell, inte autonom. Databasen lagrar enbart offentliga titelmetadata, inga konton, rå HTML eller trafikdata.

## Bevis från lokal miljö
- Isolerad PostgreSQL 16: RLS, FORCE RLS, minst privilegium, felaktig källa, fel digest, fel datum, fel status/titel – PASS.
- Åtta parallella kompletta insert-batcher på samma UTC-dag: exakt sex poster med titlar från samma vinnande insättning, inga överskrivningar – PASS.
- Canonical SQL inuti transaktion + ROLLBACK lämnade inga tabeller eller index – PASS.
- Migration Guard v2: lokalt uppdaterad till 116 canonical / 102 enforced och 25/25 tester PASS. Saknat `handlarborsen_competitor_observations_v1` i ledger avvisas uttryckligen. Om detta migreringsutkast skulle deployas nu bör byggningen FAIL CLOSED tills operatören godkänner och applicerar migrationen.
- Separata funktionsgrenen `codex/hb-competitor-history-core-20261014`: 132/132 riktade tester PASS och TypeScript PASS efter säkerhetstillägg.

## Utestående grindar (får inte kringgås)
1. Säkerhetsreview av SQL och migrationsstegen mot exakt aktuell Supabase-produktion (kontrollera katalog- och ledgerstatus).
2. Isolerad full migration replay mot befintligt schemas ursprung (inte endast reducerad fixture), inklusive schema inventory och migration guard. Nuvarande `schema-security.json` avser en äldre faktisk produktionssnapshot och får inte påstås ha ny tabell förrän den finns.
3. Separat användargodkännande för att applicera det nya schemat i produktion. Uppdatera då migrationsledger, revisionell schema-security inventering och main-koden enligt befintlig apply-before-merge-process.
4. Testa en skyddad Preview med `HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED=true` först efter schemaapply, med ägarinloggning, databasrättigheter och icke-ägarkontroll. Starta aldrig insamlingen automatiskt.
5. Definition av bevarande- och raderingsrutin: 30 dagar är **läsfönster**, inte fysisk retention i DB. Beslut om faktisk retention måste dokumenteras innan återkommande automation.
6. Verifiera första riktiga sparningen av sex källor. En förändring får visas först efter två giltiga observationer olika UTC-dagar.

## Kostnad och parallellt arbete
- Ingen ny GitHub Actions-körning, PR, deployment eller Supabase-förändring i den här migration-grenen.
- Ingen aktivering av cron, köparekontakt, agentexekvering eller andra projekt.
- Den tidigare säkra förhandsversionen är fortfarande åtkomlig från separat funktionsgren och har historiken OFF.

## Slutlig preflightkontroll 2026-10-14

- Supabase-produktion kontrollerad **enbart med SELECT**: PostgreSQL 17.6, Handlarbörsens projekt-ID och slug matchar exakt, 99 aktuella public-bastabeller, nya konkurrenttabellen saknas, nya ledgernamnet saknas. Atlas andra arbetsgren har redan tillfört `website_build_sessions` till produktionsledgern men ännu inte till main; dess PR måste landa innan vi försöker ny vanlig Preview från äldre kod.
- Lokalt PostgreSQL 16: constraints, RLS + FORCE RLS, noll policies, anon/authenticated utan SELECT/INSERT och service_role med enbart SELECT+INSERT bekräftat. 8 samtidiga batcher gav sex unika vinnarrader. Rollback lämnade inga tabeller eller index. **Lokala tester gäller PostgreSQL 16, inte full versionstrogen replay på produktions-17.6.**
- Läsbart, **read-only**, operatörsverifieringsskript `docs/sql/handlarborsen_competitor_observations_p2_postapply_verify.sql` är provkört i isolerad PG16 med en explicit **syntetisk** migrationsledger. Verifierar även projektets slug, RLS, grants, constraints och ett enda ledgernamn.
- Schema-inventeringen klassar nya `handlarborsen_competitor_observations` i `_meta.created_not_live` som `SERVER_ONLY` och **saknas fortfarande från livedatabaskartan**. Ingen falsk live-klassning. Ett Windows-sökvägsfel i inventeringstestet korrigerades utan att ändra någon RLS-kontroll. Schema + guard: 101/101 tester passerar.
- Efter godkänd produktionstillämpning måste `_meta.created_not_live` för denna tabell tas bort och faktisk `public`-katalog inventeras till tabellkartan. Enbart att uppdatera antal är inte likvärdigt med schemaaudit.
- **Full återspelning av samtliga historiska migrationer är fortfarande blockerad** av tidigare dokumenterat arv: den separata mediagrundens `media_insights`-tabell saknas i den begränsade replay-ordningen (se `docs/atlas-analytics-p1-replay-recovery-20261013.md`). Detta P2-paket gör inga påståenden om full migration-replay PASS.
- Framgång i isolerad fixture innebär inte automatiskt godkännande av produktion. Aktiv migrationsprocess, live-katalog- och ledgerkontroll, separat operatörsbeslut, samt senare ägarinloggad Preview krävs.

## Uppföljande preflight – Supabase PostgreSQL 17.6 (2026-10-14)

**Miljö:** cachad lokal Supabase-image `public.ecr.aws/supabase/postgres:17.6.1.167`, container `hb-competitor-pg176-review-20261014`, isolerad testdatabas med syntetisk `projects` och syntetisk `supabase_migrations`-ledger. Ingen anslutning till produktionens databas behövdes för testskrivning.

### Reproducerbara lokala SQL-filer

- `apps/web/supabase/migrations/20261014143000_handlarborsen_competitor_observations_v1.sql`: exakt SQL-kandidat.
- `docs/sql/handlarborsen_competitor_observations_p2_pg17_fixture.sql`: initierar isolerat Supabase 17.6-schemat med befintliga `anon`, `authenticated`, `service_role`, testar RLS och grants.
- `docs/sql/handlarborsen_competitor_observations_p2_concurrency.sql`: en av åtta parallella identiska sexkälls-batcher, men med unika titlar per samtidig anropare; `ON CONFLICT DO NOTHING`.
- `docs/sql/handlarborsen_competitor_observations_p2_pg17_rollback.sql`: canonical SQL + `ROLLBACK` i en separat ren lokal databas.
- `docs/sql/handlarborsen_competitor_observations_p2_postapply_verify.sql`: read-only SQL för produktion efter ett eventuellt godkänt apply.

### Verifierade utfall

- Supabase-image rapporterar `PostgreSQL 17.6`. Canonical migration + RLS `ON`, `FORCE`, noll policies och låsta source/status/title/UTC-kontrakt PASS.
- `anon` nekas SELECT, `authenticated` nekas SELECT och INSERT, `service_role` tillåts SELECT men nekas UPDATE. Direkta `SET ROLE`-anrop med `ON_ERROR_STOP=1` gav väntade behörighetsfel.
- Åtta parallella batcher gav exakt sex poster, sex olika `source_id` och **en** unik batchtitel. Detta är ett konkret race-test, inte matematiskt bevis för alla möjliga samtidiga tidsscheman; tjänsten avvisar därefter partiella utfall.
- `ROLLBACK` tog bort ny tabell, index och lokal projekttesttabell utan restobjekt.
- Postapply-verifiering på lokalt Supabase 17.6 med syntetiskt migrationsledger gav ett ledgernamn, rätt referenskontrakt, noll policies och endast service-rollen SELECT/INSERT.
- Isolerad lokal testcontainer stängs efter avslutade tester.

### Produktionskatalog – enbart läsning

- PostgreSQL 17.6, 99 `public` bastabeller, Handlarbörsens exakta projekt-ID + slug finns, **konkurrenttabellen och migrationsnamnet saknas**. Ingen produktion-SQL har ändrats.
- De 99 bastabellerna har alla RLS aktiverat; inga public-tabeller hittades som kombinerar RLS OFF med anon SELECT/INSERT. Detta bevisar inte att individuella RLS-policies är korrekta.
- Den repo-pinnade `schema-security.json` innehåller 94 live-klassade tabeller och är äldre än produktionen: fem ytterligare **live**-tabeller är `atlas_analysis_drafts`, `atlas_analysis_draft_events`, `website_build_feedback`, `website_build_sessions`, `website_preview_revisions`. Alla fem har RLS ON och anon SELECT/INSERT nekas. De tre website-tabellerna har authenticated SELECT via policy, så de får inte felaktigt klassas som SERVER_ONLY. De två Atlas-analystabellerna ligger fortfarande i gammal `created_not_live` trots att de nu finns live.
- Produktionsledgern innehåller `website_build_sessions`, men `main` gör det ännu inte eftersom Atlas PR #337 fortfarande är öppen. Denna gren får inte kringgå migrationsskyddet eller hitta på nytt ledger-tillstånd.

### Release-grind

**Ingen produktionsinstallation eller funktionsaktivering är godkänd.** Innan produktionsdatabasen ändras krävs Atlas-migrationssynk, genomgång av exakt schema-/ledgerdiff, ny effektiv schema-inventering som inte kolliderar med parallellt arbete, operatörsbeslut, därefter read-only postapply-verifikation och en begränsad ägar-Preview. Full historisk migrationsreplay är fortfarande separat blockerad av legacy media-schema; ovanstående är en *målversionstrogen isolerad schematest*, inte full replay.
