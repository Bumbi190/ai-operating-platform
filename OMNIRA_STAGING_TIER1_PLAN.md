# OMNIRA — Staging Tier 1 (Supabase preview-branch) — uppsättnings- & verifieringsplan

> Status: **PLAN — ingen branch skapas, ingen H1.P5-kod skrivs förrän godkänd.**
> Syfte: en isolerad test-DB för att avriska H1.P5:s RPC-/migrations-/fencing-/cancel-arbete **utan att röra prod**.
> Låsta beslut: D1 = approval→`returned` vid cancel · D2 = `H1_CANCEL` (default OFF) · D3 = staging Tier 1 först.
> Datum: 2026-06-14.

## 0. Verifierade fakta
- Org `andre hultgren` (`xqzyuvpgyrdnhlwxiamm`) = **Pro** → branching tillgängligt.
- Branch-kostnad: **$0,01344/timme** (API-bekräftat).
- Prod-projekt: `iboepohjwrhtgshrqaol`. Default-branch finns; nya branches seedas från **schema/migrationer, ej prod-data** (`with_data:false`).
- Disciplin behålls: migrationer appliceras via `apply_migration` mot **branchens** project_ref; Migration Guard rör endast **prod**-ledgern (branchen påverkar den inte).

---

## 1. Exakta `create_branch`-steg

MCP kräver kostnadsbekräftelse före skapande. Exakt sekvens:

1. `get_cost(type='branch', organization_id='xqzyuvpgyrdnhlwxiamm')` → bekräftar **$0,01344/h** (redan kört).
2. `confirm_cost(type='branch', recurrence='hourly', amount=0.01344)` → returnerar ett `confirmation_id`.
3. `create_branch(project_id='iboepohjwrhtgshrqaol', name='h1p5-staging', confirm_cost_id='<confirmation_id>')`.
   - Detta provisionerar en **isolerad Postgres** (eget `project_ref`, eget API-URL + service-key) seedad från prod-projektets migrationshistorik.
   - Vänta tills `list_branches` visar branchen `ACTIVE_HEALTHY` / `status` klar.
4. Notera branchens `project_ref` (kalla den `BRANCH_REF`) — alla efterföljande `apply_migration`/`execute_sql` riktas mot **`BRANCH_REF`**, aldrig prod.

> Namnval `h1p5-staging` gör syftet uppenbart. Branchen är **persistent under H1.P5** och tas bort efteråt (§5).

---

## 2. Migrations-replay till branchen

Supabase seedar branchen från migrationshistoriken vid skapande. Eftersom vi sett repo↔ledger-drift tidigare (t.ex. `create_website_content_system_a` som återställdes), **antar vi inte** automatisk paritet — vi verifierar och reconcilar:

1. `list_migrations(project_id=BRANCH_REF)` → jämför mot prod `list_migrations(iboepohjwrhtgshrqaol)`.
2. Om någon migration saknas i branchen: applicera den via `apply_migration(project_id=BRANCH_REF, name='<exakt namn>', query=<DDL från repo-filen>)` i ledger-ordning.
3. När H1.P5-migrationerna byggs appliceras de **först mot `BRANCH_REF`** (aldrig prod) för test.

> Branchen blir alltså = prod-schema + H1.P5-migrationer, helt isolerat.

---

## 3. Schema-paritetsverifiering (branch ↔ prod)

Kör samma introspektion mot båda `project_ref` och diffa. Minsta meningsfulla parisitetskontroll:

```sql
-- (kör mot prod OCH mot BRANCH, jämför utfall)
-- a) tabeller
select table_name from information_schema.tables
 where table_schema='public' order by 1;
-- b) kritiska kolumner på runs/outputs/approvals
select table_name, column_name, data_type, is_nullable
 from information_schema.columns
 where table_schema='public' and table_name in ('runs','outputs','approvals')
 order by 1,2;
-- c) constraints vi bryr oss om
select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid)
 from pg_constraint
 where conrelid in ('public.runs'::regclass,'public.outputs'::regclass,'public.approvals'::regclass)
 order by 1,2;
-- d) RPC-definitioner (måste matcha innan vi ändrar dem)
select proname, pg_get_functiondef(p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname='claim_runs')
    or (n.nspname='omnira_cron' and p.proname='reap_stuck_runs');
-- e) ledger
select version, name from supabase_migrations.schema_migrations order by version;
```

**Definition av paritet:** (a)–(e) identiska mellan branch och prod **före** H1.P5-ändringar. Avvikelser åtgärdas per §2 innan testmatrisen körs. Detta är även ett kvitto på att `apply_migration`-flödet reproducerar prod rent (värdefullt i sig).

---

## 4. RPC-testmatris (körs mot BRANCH efter H1.P5-migrationerna applicerats där)

Alla tester är rena SQL-scenarier mot branchen — de speglar exakt de skrivmönster H1.P5-koden kommer att använda, så vi validerar RPC-/schema-beteendet **innan** TS-koden ens deployas.

### 4.1 `claim_runs` (ny: stämplar `claim_id`)
| # | Setup | Förväntat |
|---|---|---|
| C1 | 1 `pending`-run | claim_runs(1) → 1 rad, `status='running'`, `claim_id` NOT NULL, `lease_until>now()`, `attempts`+1 |
| C2 | runs i `awaiting_approval`/`rejected`/`done` | claim_runs → claimar **ingen** av dem |
| C3 | `pending` med `attempts>=max_attempts` | ej claimad |
| C4 | 2 `pending` | två rader, **distinkta** `claim_id` |
| C5 | parallella claims (två sessioner) | SKIP LOCKED → ingen dubbel-claim av samma rad |

### 4.2 `reap_stuck_runs` (ny: nollar `claim_id`)
| # | Setup | Förväntat |
|---|---|---|
| R1 | `running`, `lease_until<now()`, `attempts<max` | → `pending`, `claim_id=null`, `claimed_at/lease_until=null` |
| R2 | `running`, `lease_until<now()`, `attempts>=max` | → `failed`, `error` satt, `claim_id=null` |
| R3 | `running`, `lease_until>now()` (giltig lease) | **ej** reapad |
| R4 | `awaiting_approval` / `done` | **ej** reapad (selektiv på `running`) |

### 4.3 `claim_id`-fencing (skrivmönstret H1.P5-koden använder)
| # | Setup | Förväntat |
|---|---|---|
| F1 | claim run (claim_id=X); simulera reclaim: reaper nollar → ny claim (claim_id=Y) | `update runs ... where id=run and claim_id=X` (stale) → **0 rader** (fencad) |
| F2 | samma run, write med `claim_id=Y` (aktuell) | **1 rad** (lyckas) |
| F3 | terminal-write på fortfarande-ägd run med rätt claim_id | 1 rad; verifierar att normalvägen inte fencas av misstag |

### 4.4 `cancel_requested` (ny kolumn + flöde, D1/D2)
| # | Setup | Förväntat |
|---|---|---|
| X1 | `pending`, cancel | `status='cancelled'` (villkorat `status='pending'`) |
| X2 | `awaiting_approval` + `pending` approval, cancel | run→`cancelled` **och** approval→`returned` (D1) |
| X3 | `running`, cancel | `cancel_requested=true`, status kvar `running` |
| X4 | (X3) + simulerad cooperative-check vid stegsgräns | → `status='cancelled'` (fencad på claim_id) |
| X5 | terminal (`done`/`failed`/`rejected`/`cancelled`), cancel | **no-op** (0 rader) |
| X6 | cancel två gånger på `pending` | andra = no-op (idempotent) |

**Acceptans:** alla C/R/F/X gröna mot branchen → RPC-/schema-delen av H1.P5 (R1-risken) är avriskad innan något rör prod.

---

## 5. Städning av branchen efter verifiering

1. När H1.P5 är verifierad på branchen och migrationerna applicerats mot **prod** (separat, kontrollerat) + git mergad: kör `delete_branch(branch_id='<branch-id från list_branches>')`.
2. `list_branches(iboepohjwrhtgshrqaol)` → bekräfta att `h1p5-staging` är borta.
3. Kostnaden upphör vid radering. (Branchen är isolerad → ingen påverkan på prod när den tas bort.)

> Om vi vill behålla en stående staging för Band 2/governance senare: lämna branchen (löpande kostnad, §6) eller återskapa per behov.

---

## 6. Kostnad & driftpåverkan
- **Kostnad:** $0,0134/h. Persistent dygnet runt ≈ **$9,7/mån**; skapa/radera per ~8h-session ≈ **$0,11/session**. För H1.P5 (några dagars arbete) → någon enstaka dollar om vi raderar efteråt.
- **Driftpåverkan på prod:** **ingen** — branchen är en separat Postgres-instans med egna API-nycklar; vi kör inga drains mot den i Tier 1 (ren SQL-testning), så prod-cron/guardian berörs ej.
- **Risk:** låg. Enda fallgropen är disciplin: rikta alltid `apply_migration`/`execute_sql` mot `BRANCH_REF`, aldrig prod. Branchens egna ev. cron rör inte prod.

---

## 7. Git- & arbetsflöde framåt (bygg mot branch, flytta sedan till prod)

1. **Git-branch:** `feat/h1-p5-reliability-closure` (från main).
2. **Schema/RPC mot Supabase-branch:** applicera varje H1.P5-migration via `apply_migration(project_id=BRANCH_REF, ...)`; kör testmatrisen §4 på branchen.
3. **TS-kod** skrivs på git-branchen; SQL-beteende valideras mot Supabase-branchen; `tsc`/`vitest` lokalt.
4. **Promotion till prod (efter grön branch-verifiering):**
   a. Applicera **samma** migrationer mot **prod** via `apply_migration(project_id=iboepohjwrhtgshrqaol, ...)` — ledger-synkat (annars RED-blockar guarden).
   b. Du (operatören) committar/pushar git-branchen; PR → preview READY + guard grön.
   c. Merge till main → prod-deploy (färsk deploy för ev. flaggor, ej dashboard-redeploy — PR2-lärdom).
   d. `H1_CANCEL` förblir **OFF** i prod vid merge (D2).
5. **Cleanup:** `delete_branch` (§5).

**Viktigt:** vi använder Supabase-branchen som **sandlåda** — vi förlitar oss INTE på `merge_branch` för att flytta schema till prod (det skulle kringgå er apply_migration+guard-disciplin). Prod uppdateras alltid via `apply_migration` mot prod, precis som hittills.

---

## Beslut innan vi skapar branchen
- Bekräfta branch-namn `h1p5-staging` och att persistent-under-H1.P5 + radera-efteråt är ok (kostnad någon dollar).
- Bekräfta att Tier 1 = **SQL-only** verifiering räcker för H1.P5 (deployad E2E körs kontrollerat mot prod som för gaten), och att Tier 2 (Vercel-staging) skjuts upp.

**Ingen branch skapas och ingen H1.P5-kod skrivs förrän detta godkänts.**
