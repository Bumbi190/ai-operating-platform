# PHASE 4 — FORWARD MIGRATION APPROVAL REVIEW

**`media_job_lifecycle_repairs`** — review only. Nothing applied, no migration
file created, production unmodified, nothing committed.

SQL under review:
[`PHASE4_PROPOSED_FORWARD_MIGRATION.sql`](./PHASE4_PROPOSED_FORWARD_MIGRATION.sql)
(**revision 2**).

> ## The draft I gave you last turn had a hole. Task 3 is what found it.
>
> Revision 1 detected the FK cascade purely by the SHAPE of the change —
> `asset_id` going NULL with `version`/`state` unchanged. That is **exactly what
> a plain `update media_jobs set asset_id = null` looks like**, so any
> application statement could have taken the exemption and cleared an asset
> binding at will. It failed the very requirement Task 3 states: *"provider/job
> code cannot use the FK exception as a general bypass."*
>
> Revision 2 adds two independently-measured discriminators and proves the hole
> is closed (proof A2 below). Do not approve revision 1.

---

## 1. The complete proposed SQL

Verbatim in
[`PHASE4_PROPOSED_FORWARD_MIGRATION.sql`](./PHASE4_PROPOSED_FORWARD_MIGRATION.sql)
(201 lines). Forward-only: three `CREATE OR REPLACE FUNCTION` statements, one
`REVOKE`, one `GRANT`, one `COMMENT`. **It does not edit the applied migration,
alter any table, or touch any row.**

## 2. Every DDL statement, classified

| # | Object | Why | Fixes | Normal writes change? | Cascades only? | Rewrites rows? | Lock |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `public.media_jobs_guard()` — replace | add a narrow FK-cascade exemption as the first branch; every other rule byte-identical | F4-01 | **No** | **Yes** | No | `ACCESS EXCLUSIVE` on the *function*, not the table; no table rewrite |
| 2 | `public.reject_media_reconciliation_mutation()` — replace | permit only the DELETE a parent cascade issues | F4-02 | **No** | **Yes** | No | as above |
| 3 | `public.media_job_record_reconciliation(...)` — create | atomic ledger-insert + CAS | F4-03 | New capability | n/a | No | none |
| 4 | `REVOKE … FROM public, anon, authenticated` | smallest privilege surface | F4-03 | n/a | n/a | No | none |
| 5 | `GRANT EXECUTE … TO service_role` | the only caller | F4-03 | n/a | n/a | No | none |
| 6 | `COMMENT ON FUNCTION` | documentation | — | No | n/a | No | none |

`CREATE OR REPLACE FUNCTION` takes a lock on the function's `pg_proc` row only.
No `ALTER TABLE`, no index build, no constraint validation — so nothing scans or
rewrites `media_jobs`. **Every statement is safe with zero rows, and equally safe
with many.** No unrelated cleanup is included.

## 3. F4-01 — the asset delete fix

### How PostgreSQL distinguishes the cascade, measured

I built a throwaway two-table fixture and printed `pg_trigger_depth()` and
parent-visibility from a row trigger on both paths:

| Path | `pg_trigger_depth()` | Referenced parent row visible? |
| --- | --- | --- |
| direct application `UPDATE … SET fk = NULL` | **1** | **yes** |
| FK cascade `ON DELETE SET NULL` | **2** | **no** |
| direct application `DELETE` | **1** | — |
| FK cascade `ON DELETE CASCADE` | **2** | — |

Two independent signals, and they fail differently:

- **Depth is a mechanism fact.** A referential action is *always* executed nested
  inside the statement that triggered it, so it can never run at depth 1.
- **Parent-absence is a semantic fact.** During `ON DELETE SET NULL` the
  referenced row is already gone from this command's snapshot; for an
  application UPDATE it is still there.

The exemption requires **both**, plus seven column-level conditions:

```sql
if pg_trigger_depth() > 1
   and old.asset_id is not null
   and new.asset_id is null
   and not exists (select 1 from public.assets a where a.id = old.asset_id)
   and new.version = old.version and new.state = old.state
   and new.remote_operation_id  is not distinct from old.remote_operation_id
   and new.dispatch_observation is not distinct from old.dispatch_observation
   and new.project_id = old.project_id
   and new.reconciliation_required = old.reconciliation_required
then return new; end if;
```

### Can application SQL invoke it?

**No, and this is proven rather than argued** (proofs A and A2):

- From the top level, application SQL runs at depth 1 → fails signal 1.
- Even from *inside another trigger* (depth ≥ 2), the referenced asset is still
  present → fails signal 2.
- To make signal 2 true, the caller must first delete the asset — but that
  delete *is* the cascade, which already NULLs the column. There is nothing left
  to exploit.
- Any attempt that also changes state, version, project, remote id, observation
  or the reconciliation flag falls straight through to the ordinary rules.

### What is preserved

| Requirement | Held? | Proof |
| --- | --- | --- |
| caller cannot arbitrarily clear `asset_id` | ✅ | A, **A2** |
| `asset_id` write-once through ordinary UPDATE | ✅ | A |
| version successor still required | ✅ | C |
| FK exception is not a general bypass | ✅ | A2 (the revision-1 hole, now closed) |

**A perfectly narrow distinction is achievable here**, and the proposal uses it.
No correctness was traded.

## 4. F4-02 — the cascade delete fix

```sql
if tg_op = 'DELETE'
   and pg_trigger_depth() > 1
   and not exists (select 1 from public.media_jobs j where j.id = old.media_job_id)
then return old; end if;
raise exception 'media_job_reconciliations is append-only (attempted %)', tg_op …
```

| Requirement | Held? | Proof |
| --- | --- | --- |
| direct `DELETE` from the ledger rejected | ✅ | E |
| `UPDATE` rejected — unconditionally, no exemption at all | ✅ | D |
| cascade from the parent job succeeds | ✅ | F |
| project deletion succeeds | ✅ | G |
| no user write policy added | ✅ | L (0 non-SELECT policies) |
| service code cannot issue a direct ledger DELETE | ✅ | E — depth 1 **and** parent present |

Service code cannot bypass this even with `BYPASSRLS`: the trigger is not RLS. A
direct delete runs at depth 1 with a live parent and is refused. The only way to
remove a ledger row is to remove the job or project it belongs to — which is the
intended semantics, not a bypass.

## 5. F4-03 — the reconciliation RPC

Signature matches the existing `RecordReconciliationInput` port shape, with one
deliberate reduction:

```sql
media_job_record_reconciliation(
  p_job_id uuid, p_expected_version integer,
  p_result text, p_blocker text, p_detail jsonb,
  p_observed_at timestamptz, p_resolves_to text
) returns public.media_jobs
```

**`project_id`, `provider` and `remote_operation_id` are NOT parameters.** They
are derived from the locked job row, so a caller cannot supply a provider
payload's idea of a project, cannot bind evidence to an operation the job does
not own, and the ledger's binding trigger is satisfied by construction rather
than by trust. That removes an entire class of error rather than validating it.

Order: lock `FOR UPDATE` → existence check → version check → **INSERT evidence**
→ (if `p_resolves_to` is null, return; the job does not move and `version` is not
advanced) → **CAS UPDATE** → return.

The function does not dispatch a provider, touch `assets`, touch spend data,
accept any SQL identifier, or bypass the lifecycle guard — the guard still runs
on its UPDATE, which is exactly how illegal transitions are still refused.

## 6. Security model

| Property | Value |
| --- | --- |
| Volatility / security | `SECURITY DEFINER` |
| `search_path` | pinned `''`; every object schema-qualified |
| `EXECUTE` for `PUBLIC` | **revoked** |
| `anon` | **cannot invoke** (revoked) |
| `authenticated` | **cannot invoke** (revoked) |
| `service_role` | granted — the only caller |
| Project authority | derived from the locked job row, never a parameter |
| Remote operation id as a handle | **not accepted at all**, so it cannot target another project's job |

`SECURITY DEFINER` is required and justified: the function writes an append-only
ledger and moves a guarded row, and both guards are themselves `SECURITY
DEFINER`. Running as invoker would make the operation's success depend on the
caller's RLS, which for a lifecycle write derived from a provider response is the
wrong authority. The privilege surface is then made small by revoking `PUBLIC`
and granting exactly one role. **This is not a generic mutation RPC** — it takes
no table name, no column, no predicate.

## 7. CAS semantics

```sql
update public.media_jobs
   set state = p_resolves_to, reconciliation_required = false,
       terminal_at = case when p_resolves_to in ('SUCCEEDED','FAILED','UNKNOWN')
                          then coalesce(terminal_at, p_observed_at) else terminal_at end,
       version = j.version + 1
 where id = p_job_id and version = p_expected_version
```

Outcomes are **not** collapsed — each maps to a distinct refusal in the existing
`MediaJobWriteRefusal` vocabulary:

| Case | Behaviour | Port refusal |
| --- | --- | --- |
| job missing | raises `no_data_found`, before any insert | `not_found` |
| stale version | raises `restrict_violation`, before any insert | `version_conflict` |
| illegal transition | `media_jobs_guard` raises; INSERT rolls back with it | `illegal_transition` |
| evidence invalid / cross-project | ledger binding trigger raises; all rolls back | `write_failed` |
| `STILL_UNKNOWN` | evidence recorded, job unmoved, **version not advanced** | `ok` |
| resolves | evidence recorded, state moved, version +1 exactly once | `ok` |

Wrong project cannot arise: the project is read from the job, not supplied.

## 8. Trigger/RPC interaction, from transaction semantics

**Successful resolve.** The function body runs inside the caller's transaction
(PL/pgSQL has no independent transaction). The INSERT becomes visible to
subsequent statements *in that same transaction*, so when the UPDATE fires
`media_jobs_guard`, its `select count(*) … where result <> 'STILL_UNKNOWN'` sees
the row just inserted. The guard passes, the UPDATE commits with the INSERT.
Proof **H**: `state=SUCCEEDED version=4 reconciliation_required=f ledger=1`.

**Stale CAS.** The version check raises before the INSERT, so nothing is written.
Even if it were reached later, a `RAISE` inside PL/pgSQL propagates and aborts
the statement — and every statement in PostgreSQL is atomic — so the INSERT is
undone. This is why every refusal **raises rather than returns**: a normal return
after an insert would commit an evidence row claiming a resolution that never
happened. Proof **I**: raised; **I2**: ledger rows before/after `0 / 0`; **I3**:
the job stays `UNKNOWN`.

## 9. Production data impact

Re-confirmed from the live database just now:

| | |
| --- | --- |
| `media_jobs` rows | **0** |
| `media_job_reconciliations` rows | **0** |
| `assets` rows | **0** |
| Ledger entries | **98** (unchanged) |
| `media_job_lifecycle` applied SQL md5 | `070386a3f8ae49fc99f98cfa8f82125e` — **identical to apply time** |
| Forward RPC present remotely | **0** |
| Forward migration applied | **0** |

The forward migration **rewrites no data, backfills nothing, repairs no rows, and
touches no `assets`, `projects`, `runs` or workflow data.** It is structural only
— three function bodies and two grants.

## 10. The adjacent PR9d defect

`public.workflow_action_reconciliations` pairs the same `on delete cascade` with
the same unconditional append-only trigger, so **`public.runs` rows carrying
reconciliations cannot be deleted today** — and neither can their projects, by
the same chain. That is a live production defect, not a theoretical one.

**Deliberately NOT fixed here.** The media fix does not require it, and folding it
in would put a workflow-governance change inside a media migration where no
reviewer of either would expect it.

Recommendation: **a separate issue and its own forward migration**, owned by
workflow governance rather than media. The fix is the same two-signal shape, so
this review is reusable evidence for it. It is not urgent — nothing deletes those
rows today — but it should not stay undocumented.

## 11. Local proof

Throwaway local PostgreSQL only. Applied (1) the real
`20260903062550_media_job_lifecycle.sql`, then (2) the proposed forward
migration. Database created per-process and dropped afterwards. **Production was
not touched.**

**16 assertions, 16 pass, 0 fail:**

| | Check | Result |
| --- | --- | --- |
| A | app clears `asset_id` (with version bump) | **REJECTED** ✅ |
| A2 | app clears `asset_id` — the revision-1 bypass shape | **REJECTED** ✅ |
| B | asset FK `ON DELETE SET NULL` | **SUCCEEDED**, `asset_id=NULL`, version stayed 4 ✅ |
| C | version bypass | **REJECTED** ✅ |
| D | direct ledger `UPDATE` | **REJECTED** ✅ |
| E | direct ledger `DELETE` | **REJECTED** ✅ |
| F | parent job delete cascades ledger rows | remaining **0** ✅ |
| G | project delete | `media_jobs=0 ledger=0` ✅ |
| H | atomic resolve | `state=SUCCEEDED version=4 reconciliation_required=f ledger=1` ✅ |
| H2 | `STILL_UNKNOWN` | `state=UNKNOWN version=3 ledger=1` — evidence kept, job unmoved, version unchanged ✅ |
| I | stale CAS | **RAISED** (`version conflict`) ✅ |
| I2 | ledger rows before / after the stale attempt | **0 / 0** ✅ |
| I3 | state after the failed attempt | **UNKNOWN** ✅ |
| J | UNKNOWN resolved without evidence | **REJECTED** ✅ |
| K | duplicate `brief_hash` | **ALLOWED** ✅ |
| L | non-SELECT policies on the media job tables | **0** ✅ |

One earlier probe run failed on an illegal `SUCCEEDED → UNKNOWN` transition. That
was my test script reusing a finished job, and the guard correctly refusing it —
the script was fixed, not the migration.

## 12. Migration immutability

- `media_job_lifecycle` (`20260903062550`) **is unchanged**: its stored SQL md5
  still matches the value recorded at apply time.
- The repo file `apps/web/supabase/migrations/20260903062550_media_job_lifecycle.sql`
  is untouched, and the migrations directory still contains **only** it.
- The correction carries a **new name**, `media_job_lifecycle_repairs`.
- Once applied, **both** become immutable; any further correction is a third
  migration.
- Repo files must continue to match remote ledger semantics exactly — the same
  normalized-checksum check used for the first migration applies.

## 13. Eventual apply order — **not executed**

1. `git fetch`; inspect `origin/main`; rebase if it moved.
2. Re-verify **zero** migration drift, the way the guard computes it.
3. Verify target `iboepohjwrhtgshrqaol` / AI Operating Platform.
4. Verify `media_jobs = 0` and that the current schema still matches §9.
5. `apply_migration(name='media_job_lifecycle_repairs')` — **remote first**.
6. Verify remotely: all three functions replaced/created, grants correct, ledger
   entry present; re-run the negative proofs.
7. **Then** add the identical repo migration file.
8. Run `check-migrations.mjs` with real credentials — must pass.
9. Regenerate `database.types.ts`; expect only the new function.
10. Implement `recordReconciliation` against the RPC in `store-supabase.ts`.
11. Un-pin `F4-01` / `F4-02` in `media-job-lifecycle-sql.test.ts` and assert the
    corrected behaviour.
12. Durable store tests.
13. Full validation: typecheck, full suite, guard.
14. **Only then** consider `DURABLE_MEDIA_JOB_STORE_AVAILABLE`.

## 14. Remaining concerns

1. **`pg_trigger_depth()` is a mechanism signal.** It is stable and documented,
   but it is not a first-class "am I in a referential action" API — PostgreSQL
   exposes none. The proposal therefore never relies on it alone; the
   parent-absence check is an independent semantic signal, and both must hold.
2. **A future trigger on `media_jobs` could raise the depth** for ordinary
   application writes. It would still have to defeat parent-absence, so the
   exemption stays closed — but the interaction is worth remembering before
   adding another trigger to that table.
3. **The PR9d defect (§10) remains open**, by choice.
4. **`STILL_UNKNOWN` does not advance `version`.** Intentional — an observation
   is not a state change — but it means concurrent inconclusive reconciliations
   do not conflict with each other. They are append-only facts, so this is
   correct, and it is stated so nobody later reads it as a missing guard.
5. **The unresolved-UNKNOWN-to-spend link** (schema review §20) is still absent
   and still out of scope.

---

# FORWARD MIGRATION GO

Conditional on approving **revision 2** — revision 1 must not be applied; its
cascade exemption was invocable from application SQL, and proof A2 exists
specifically to keep that closed.

Nothing has been applied, no migration file was created, production is
unmodified, and nothing was committed or merged.
