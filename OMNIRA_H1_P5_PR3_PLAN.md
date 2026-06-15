# OMNIRA H1.P5 / PR3 — Reliability closure: idempotency · fencing · cancel · legacy unification

> Status: **PLAN — ingen kod skrivs förrän godkänd.** Ultra Code-disciplin (verifiera kod/schema/risk/migration/rollback före rekommendation).
> Baseline: main efter H1.P4 (gate live, OFF). Supabase-projekt `iboepohjwrhtgshrqaol`.
> Mål: **stänga reliability-bandet helt** innan nya större initiativ. Inga nya minnessystem (Band 3 låst), ingen autonomi-aktivering.
> Datum: 2026-06-14.

---

## 0. Verifierade preconditions (kod + DB, inte minne)

| Fakta | Verifierat värde | Påverkan |
|---|---|---|
| `outputs` unik nyckel | endast `outputs_pkey` (på `id`); **ingen unik på `run_id`** | idempotens är check-then-insert → race. Unik möjlig: **0 dubbletter** på run_id (17 rader), 0 null run_id. |
| `outputs`-writers | 2: `workflow-runner.ts:68` (legacy `runSteps`) + `workflow-executor.ts:304` (`executeRunSteps`) | båda skriver **en** output/run → unik(run_id) säker; båda måste tåla `ON CONFLICT`. |
| `runs` fencing-kolumner | endast `claimed_at`, `lease_until`; **ingen `claim_id`**, **ingen `cancel_requested`** | fencing + cancel = greenfield (inga kod-referenser). |
| `claim_runs()` | `RETURNS SETOF runs`, claimar `pending AND attempts<max`, sätter `running`+lease, `returning r.*` | claim_id kan läggas additivt; drain får det gratis via `r.*`. |
| `reap_stuck_runs()` | uppdaterar `status='running' AND lease_until<now()` → pending/failed, nollar `claimed_at`/`lease_until` | reaper är reclaim-mekanismen som fencing måste samverka med. |
| Nuvarande fencing-skydd | lease `320s` > `maxDuration 300s` (Codex #2) | tids-heuristik: reaper reclaimar aldrig en *levande* invocation. Fencing-token gör det till en **hård** garanti. |
| Drain run-writes | 3 `from('runs').update` (done / awaiting_approval / catch-retry/failed) | alla måste fencas. |
| Per-steg context-write | `workflow-executor.ts:217` `update({context}).eq('id',runId)` | måste fencas. |
| `runs.status` CHECK | innehåller redan `'cancelled'` (H1.P1) | cancel kräver **ingen** CHECK-ändring. |
| Legacy `executeWorkflow` | TVÅ def: `workflow-runner.ts:80` (aktiv, anropad av `/api/runs/execute`) + `workflow-executor.ts:338` (**död**, ej importerad, har `.eq('id',runId)`-mejlbugg) | PR3: enqueue:a execute-routen, ta bort båda, behåll `runSteps`. |
| `/api/runs/execute` callers | endast routens egen fil; **ingen UI/cron/chat** (verifierat tidigare). I `route-manifest.json:78` (class S, risk High, verified=false) | säkert att enqueue:a; uppdatera manifest-testet. |
| Migration guard | filnamn `<digits>_<name>.sql`, applicera via `apply_migration(name='<name>')`, grandfathered-set fryst | varje NY migration måste appliceras i ledgern före deploy. |
| Cron guardian | `omnira_cron_guardian` (`*/5`) → `ensure_core_schedules()` återställer core-cron | påverkar inte funktionsdefs; men cron-pauser hålls ≤5 min — relevant för verifieringsmetoden. |

**Slutsats:** alla fyra arbetsdelar är genomförbara additivt. De känsligaste ytorna är de **live RPC:erna** (`claim_runs`, `reap_stuck_runs`) — högst blast radius (se R1).

---

## 1. Scope

**In:** unik `outputs(run_id)` + DB-tvingad idempotent insert; `claim_id`-fencing över alla run-writes; `cancel_requested`-flöde (cooperative + direkt); borttagning av båda `executeWorkflow` + `/api/runs/execute`→enqueue; uppdaterat route-manifest-test.

**Ute:** DAG/branching (Intelligence), kostnadsgrind (Band 2 — separat spår), observability-konsolidering, nya minnessystem. Behåll `runSteps` som flag-off-fallback (`H1_UNIFIED_EXECUTOR=0`).

---

## 2. Migrationer (additiva, guard-skyddade)

Tre små migrationer för granulär revert/ledger-spårbarhet:

```
-- 20260614_h1p5_outputs_run_id_unique.sql
-- Partiell unik: en output per run. Partiell → framtida null-run_id-outputs bryts ej.
create unique index if not exists outputs_run_id_uniq
  on public.outputs (run_id) where run_id is not null;
```
```
-- 20260614_h1p5_runs_claim_id.sql  (fencing-token)
alter table public.runs add column if not exists claim_id uuid;
-- claim_runs: stämpla en ny claim-token per claim
create or replace function public.claim_runs(p_limit int, p_lease_seconds int default 280)
returns setof public.runs language plpgsql security definer set search_path to '' as $$
begin
  return query
  update public.runs r set
    status='running', claimed_at=now(), started_at=coalesce(r.started_at,now()),
    lease_until=now()+make_interval(secs=>p_lease_seconds),
    attempts=r.attempts+1,
    claim_id=gen_random_uuid()            -- NYTT
  where r.id in (select id from public.runs
                 where status='pending' and attempts<max_attempts
                 order by created_at for update skip locked limit p_limit)
  returning r.*;
end $$;
-- reaper: rotera bort claim_id vid reclaim → in-flight zombie fencas
create or replace function omnira_cron.reap_stuck_runs() returns integer
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.runs set
    status = case when attempts>=max_attempts then 'failed' else 'pending' end,
    error  = case when attempts>=max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts>=max_attempts then now() else finished_at end,
    claimed_at=null, lease_until=null, claim_id=null     -- NYTT: nolla token
  where status='running' and lease_until is not null and lease_until < now();
  get diagnostics n = row_count; return n;
end $$;
```
```
-- 20260614_h1p5_runs_cancel_requested.sql
alter table public.runs add column if not exists cancel_requested boolean not null default false;
```

Alla additiva, back-compat. `claim_runs`/reaper-ändringarna är **idempotenta** (`create or replace`) och bakåtkompatibla: gammal drain-kod ignorerar `claim_id` → fortsätter fungera (token sätts men oanvänd). **Ordning: applicera i ledgern FÖRE kod-deploy** (annars RED-blockar guarden om filen finns ocommittad-applicerad; och kod-före-schema bryter).

---

## 3. Commit-indelning (strikt ordning)

### Commit 1 — Idempotens: unik `outputs(run_id)` + DB-tvingad insert
- Migration A (unik index).
- `executeRunSteps` (`workflow-executor.ts:304`) och `runSteps` (`workflow-runner.ts:68`): byt check-then-insert → `insert ... on conflict (run_id) do nothing` (Supabase: `.upsert(row,{onConflict:'run_id',ignoreDuplicates:true})`). Ta bort den föregående `select existingOutput`-läsningen (racen försvinner; DB är sanning).
- **Beteende:** oförändrat utom att samtidiga/återinträdande inserts inte kan dubbla.
- **Verifiering:** enhetstest (andra insert → 0 rader, inget kast); `dup_run_ids=0` bevarat.

### Commit 2 — Fencing-token (`claim_id`)
- Migration B (claim_id + claim_runs + reaper).
- `drain/route.ts`: läs `run.claim_id`; villkora **alla tre** run-writes med `.eq('id',run.id).eq('claim_id',run.claim_id)`. Om en terminal-write returnerar 0 rader → logga `fenced: run reclaimed` och hoppa (skriv inte vidare).
- `executeRunSteps`: ta emot `claimId`; villkora per-steg context-write (`:217`) på `claim_id`; om 0 rader → kasta `fenced: run <id> reclaimed (claim rotated)` så zombie-invocationen **avbryter** (ingen vidare LLM-kostnad/skrivning).
- Behåll lease>maxDuration (defense-in-depth). Fencing = hård garanti, lease = första linjen.
- **Verifiering:** concurrency-test: simulera reaper-reclaim (rotera claim_id) → zombie-write träffar 0 rader och avbryter.

### Commit 3 — `cancel_requested`-flöde
- Migration C (cancel_requested bool).
- **Ny route** `POST /api/runs/[id]/cancel` (ownership-gated via `resolveProjectAccess`/`assertProjectAllowed`):
  - `pending` → direkt `cancelled` (`.eq('status','pending')`, idempotent).
  - `awaiting_approval` → direkt `cancelled` (+ se öppet beslut D1 om den väntande approvalen).
  - `running` → sätt `cancel_requested=true` (cooperative; executorn fångar vid stegsgräns).
  - terminal (done/failed/rejected/cancelled) → no-op.
- `executeRunSteps`: före varje steg, kontrollera cancel (läs `cancel_requested` för run-id, fenced på claim_id) → om true: skriv `status='cancelled'` (fenced) och returnera utan fler steg.
- `drain`: vid claim, om `run.cancel_requested` redan true → kör inga steg, sätt `cancelled` direkt.
- **Flagga:** `H1_CANCEL` (default OFF) runt cooperative-checken — inert tills påslagen, instant rollback. (Cancel-routen kan landa men checken gör inget förrän flaggan på.)
- **Verifiering:** state-machine-test (pending/awaiting/running/terminal → korrekt utfall); cooperative-stopp mellan steg.

### Commit 4 — Unifiera bort legacy `executeWorkflow` + `/api/runs/execute`→enqueue
- Ta bort **död** `executeWorkflow` i `workflow-executor.ts` (inkl. `.eq('id',runId)`-buggen). Behåll `executeRunSteps`.
- `/api/runs/execute`: ändra från inline `executeWorkflow` → **enqueue** (sätt run `pending` via samma snapshot-mönster som `buildAgentRunInsert`/resume, returnera 202). Ta bort `executeWorkflow` i `workflow-runner.ts`. Behåll `runSteps` (drain flag-off-fallback).
- Uppdatera `tests/isolation/route-manifest.json` (rad 78: `/runs/execute` blir `scope: enqueue`, `verified: true`) + `routes.test.ts`.
- **Verifiering:** `tsc` fångar borttagna symboler; route-manifest-test grönt; grep bekräftar noll kvarvarande `executeWorkflow`-referenser.

### Commit 5 — Tester + preview-verifiering (RED→GREEN)
- Hela sviten grön; preview-fall (se §6); diff-genomgång att flag-off-vägen (`runSteps`) är oförändrad.

---

## 4. Rollback-plan

| Lager | Åtgärd |
|---|---|
| Flagga | `H1_CANCEL=0` stänger cooperative cancel direkt (Commit 3). |
| Fencing | Fencing är additivt; en revert av Commit 2-koden återgår till lease-heuristiken. `claim_id`-kolumnen + RPC kan lämnas (oskadliga). |
| Idempotens | `on conflict do nothing` är strikt säkrare än check-then-insert; revert vid behov via kod. Unik index kan droppas om något oväntat skriver flera outputs/run (osannolikt; verifierat 0). |
| Legacy-unifiering | Revert av Commit 4 återställer `/api/runs/execute` inline-beteende. |
| Migrationer | Alla additiva → behöver ej rullas tillbaka. Index/kolumner kan droppas sist om man avvecklar. |
| RPC | `claim_runs`/reaper: `create or replace` tillbaka till föregående def (spara nuvarande def före ändring — finns i denna plan §0). |

**Rollback-triggers:** (a) drain-throughput sjunker/fel efter RPC-ändring, (b) fenced-aborter inträffar på *legitima* körningar (fel claim_id-hantering), (c) cancel transitionerar fel state.

---

## 5. Riskanalys

| # | Risk | S | K | Mitigering |
|---|---|---|---|---|
| R1 | **Live RPC-ändring** (`claim_runs`/reaper) — hög blast radius på all draining. | Med | Hög | Additivt + bakåtkompatibelt; testa på **Supabase branch-DB** först (kopplar till CTO-risk #2 isolering); RED→GREEN; behåll föregående def för instant `create or replace`-revert. |
| R2 | **Unik `outputs(run_id)`** bryter om någon väg skriver flera outputs/run. | Låg | Med | Verifierat 0 dubbletter + bara 2 writers (båda en/run). Partiell index. Codex-checkpoint C1. |
| R3 | **Fencing-falskpositiv** — 0-rads-write tolkas som fenced fast det var en legitim no-op. | Med | Med | Skilj terminal-write (förväntar 1 rad) från idempotenta no-ops; fenced-abort endast vid claim_id-mismatch på en run vi tror oss äga. Enhetstest. |
| R4 | **Cancel-race**: cancel mellan stegsgräns och terminal-write. | Låg | Låg | Cooperative check + fenced terminal-write; cancel på `running` sätter bara flagga, executorn äger övergången. |
| R5 | **Orphan-approval** vid cancel av `awaiting_approval`. | Med | Låg | Öppet beslut D1 (resolva approvalen till `returned`/egen status, eller lämna + UI-filtrera). |
| R6 | **Legacy-borttagning bryter dold caller.** | Låg | Med | Verifierat: enda caller är `/api/runs/execute`; död variant ej importerad. `tsc` + grep som checkpoint. |
| R7 | **Migration-ordning / env-deploy** (PR2-lärdomar). | Låg | Med | Ledger-först; färsk git-deploy för flaggor (ej dashboard-redeploy av gammal build); pausa parallella merges under verifiering. |
| R8 | **Cron guardian** återställer cron mitt i verifiering. | Låg | Låg | Verifiera via manuell `call_vercel`-trigger inom guardian-fönstret, eller pausa guardian temporärt. |

---

## 6. Verifieringsplan

**Enhetstester (Vitest):**
- Idempotent output-insert: andra insert → 0 nya rader, inget kast.
- Fencing: write med fel `claim_id` → 0 rader → executor kastar `fenced`; write med rätt → 1 rad.
- Cancel state-machine: `pending`→`cancelled`; `awaiting_approval`→`cancelled`; `running`→`cancel_requested=true` (+ cooperative stopp → `cancelled`); terminal → no-op.
- Legacy: route-manifest-testet grönt med ny `/runs/execute`-form.

**Concurrency/invariant:**
- Simulerad reaper-reclaim (rotera `claim_id`) → zombie terminal-write fencas (0 rader), ingen dubbel `done`.
- `claim_runs` sätter unik `claim_id` per claim; två claims → olika tokens.
- Unik index: parallella outputs-inserts för samma run → exakt en rad.

**Preview RED→GREEN (samma disciplin som Migration Guard):**
1. Deploy med migrationerna **oapplicerade** → guard RED (bevisar kontraktet) → applicera → GREEN.
2. Kontrollerad drain (seed-run + `call_vercel`, cron pausad/guardian-medveten):
   - normal run → `done`, exakt **en** output.
   - fencing: konstruera reclaim (sätt lease utgången + kör reaper) → verifiera zombie-write fencad.
   - cancel `running` (flagga på) → `cancelled` vid nästa stegsgräns.
   - cancel `pending`/`awaiting_approval` → `cancelled` direkt.
3. Diff-genomgång: flag-off `runSteps`-vägen byte-för-byte oförändrad.

**Definition of Done:** `tsc` + `vitest` gröna (de 3 historiska nav-felen oförändrade); migrationer i ledgern; preview-fall avbockade; noll `executeWorkflow`-referenser; `H1_CANCEL` OFF i prod vid merge.

---

## 7. Codex-review checkpoints

- **C1 (Commit 1):** unik index partiell + båda outputs-writers använder `on conflict`; ingen kvarvarande check-then-insert; verifiera inga andra outputs-writers.
- **C2 (Commit 2):** **varje** run-write (3 i drain + context i executor + gate-flip + approval-PATCH-flip) är fencad; fenced-abort skiljs korrekt från idempotent no-op; lease behållen.
- **C3 (Commit 3):** cancel-checkens placering (stegsgräns, fenced), `awaiting_approval`-hantering + orphan-approval (D1), `H1_CANCEL` default OFF, ownership-gate på cancel-routen.
- **C4 (Commit 4):** noll `executeWorkflow`-referenser kvar; `/api/runs/execute` enqueue:ar korrekt (sätter `policy_class`/`steps_snapshot` via snapshot-mönstret); route-manifest-test uppdaterat; `runSteps` orörd.
- **C5:** full diff mot main; legacy/flag-off-väg oförändrad; migration-ledger synkad.

---

## 8. Öppna beslut innan kod

- **D1 — Cancel av `awaiting_approval` med väntande approval.** Alt: (a) sätt approvalen `returned` (kräver inget schema — finns i CHECK), (b) lämna `pending` + filtrera bort i UI när run är `cancelled`, (c) ny approval-status `cancelled` (CHECK-vidgning). *Rekommendation:* (a) `returned` — minst yta, ingen migration.
- **D2 — Cancel-flagga.** Ship cooperative-checken bakom `H1_CANCEL` (default OFF) eller ogrindat (inert tills cancel begärs)? *Rekommendation:* flagga (konsekvent med P2/P4, instant rollback).
- **D3 — RPC-test på branch-DB.** Givet enda delad prod-DB: kör `claim_runs`/reaper-ändringarna mot en Supabase **branch-DB** först? *Rekommendation:* ja om branch-DB kan skapas snabbt; annars extra noggrann RED→GREEN + sparad föregående RPC-def för revert.

**Ingen kod skrivs förrän planen + D1–D3 är godkända.**
