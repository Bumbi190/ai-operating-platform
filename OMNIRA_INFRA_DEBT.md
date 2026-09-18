# OMNIRA — Infrastrukturskuld

## INFRA-1 — Native Supabase branching kan inte reproducera Omniras fulla schema
**Upptäckt:** 2026-06-14 (under H1.P5 staging Tier 1-uppsättning).
**Status:** öppen — adresseras i framtida Tier 2-spår.

### Fynd
En native Supabase preview-branch (`create_branch`) gav ett **tomt schema** (`MIGRATIONS_FAILED`, 0 tabeller, 0 migrationer applicerade). Branch-instansen var healthy men kunde inte återskapa schemat.

### Root cause
1. **Migrationssökväg:** branching letar migrationer i repo-rotens `supabase/migrations` (+ `config.toml`). Omniras ligger i `apps/web/supabase/migrations` (monorepo).
2. **Pre-ledger foundational-schema:** de grundläggande tabellerna (`runs`, `outputs`, `approvals`, `projects`, `workflows`, `agents`) skapades *innan* ledgern (`supabase_migrations.schema_migrations`) började spåra (ledgerns äldsta = `20260601`; dessa tabeller är äldre). De finns inte som replaybara migrationsfiler på den plats branching läser.

→ Native branching kan därför inte reproducera prod-schemat från migrationshistoriken.

### Påverkan
- Tier 1-staging fick byggas som ett **scoped subset** (verbatim prod-DDL för `runs`/`outputs`/`approvals` + `claim_runs`/`reap_stuck_runs`), inte full paritet. Tillräckligt för H1.P5 RPC/fencing/cancel/idempotens-test (verifierad exakt paritet på de objekten).
- Full-paritets-branching (önskvärt för återkommande migrations-/governance-/Band 2-arbete) är **inte** tillgängligt förrän detta åtgärdas.

### Åtgärd (framtida Tier 2-spår)
1. **Baseline-schema-migration:** generera en `pg_dump --schema-only` av prod som en `00000000000000_baseline.sql` i `apps/web/supabase/migrations` så att hela schemat (inkl. pre-ledger foundational) blir replaybart från filer.
2. **Branching-konfiguration:** `supabase/config.toml` som pekar på rätt migrations-katalog (monorepo) så native branching hittar och kör dem.
3. **Verifiera:** en frisk `create_branch` ger `MIGRATIONS_PASSED` + full schema-paritet.

Tills dess: scoped-subset-branchar per behov (som i H1.P5), eller manuell DDL-replay av de objekt ett givet arbete rör.

## INFRA-2 — Migration Guard v2 verifierar mängdintegritet, inte ordnad historik
**Upptäckt:** 2026-09-18 (Guard v2-reconciliation).
**Status:** delvis åtgärdad — okänd ledger-drift och dubbletter blockeras; ordnad historik återstår.

### Nuvarande kontrakt
Migration Guard v2 låser den kanoniska korpusen till 93 SQL-filer: 14 frysta
grandfathered namn och 79 enforced namn. Produktionsledgern får dessutom innehålla
exakt 30 dokumenterade legacy-only namn. Av dessa fanns 29 i ledgern innan den
ursprungliga guarden infördes; det trettionde namnet har kvar sin deklarativa källa
i repo-rotens legacy-katalog. Listorna är explicita och frysta — inga prefix eller
wildcards accepteras, och framtida migrationer ska läggas i den kanoniska katalogen.

Guarden stoppar nu saknade enforced migrationer, okända produktionsnamn, dubbletter
i både repo och ledger samt oavsiktlig ändring av de fastlåsta antalen/listorna.
Den skriver aldrig till databasen och försöker inte reparera historik.

### Kvarvarande skuld
RPC:n exponerar bara migrationsnamn. Därför bevisar Guard v2 inte appliceringsordning,
ledger-versioner, SQL-innehållshash eller att hela schemat kan spelas upp från noll.
EI-S1.6A:s 79-räknare behålls som ett äldre, oberoende companion-test; Guard v2 äger
den repoövergripande count-tripwiren.

### Framtida åtgärd
Inför först när produkt- och authoritybeslut finns en ordnad, read-only ledgerprojektion
med version/tidsordning och deklarerad innehållsidentitet. Den förändringen kräver en
separat RPC-/migrationsleverans och får inte smygas in i Guard v2.
