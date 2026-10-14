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
