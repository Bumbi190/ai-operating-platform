# OMNIRA MEDIA RUNTIME — PHASE 4 RESULT

**Durable Persistence + First MuAPI Sandbox Proof**

Branch `feat/omnira-media-job-lifecycle` · worktree `.worktrees/omnira-media-job-lifecycle`
`origin/main` **e2e9819a…** at start → **ef2a757a7b22d4ad733e919fb5d464b6324fa0f0** at finish
(PR #169, governance post-claim checkpoint — workflow files only, no migrations,
zero overlap; fast-forwarded and fully re-validated)

**Verdict: GO for durable persistence. NO-GO for the sandbox proof**, which is
blocked by an unconfigured provider rather than by anything in the architecture.

Two migrations are applied and verified. The durable store is complete, including
atomic reconciliation. Both defects found by running the first migration are
fixed, forward-only.

> ## Phase 4 in two migrations
>
> | | Name | Ledger version | State |
> | --- | --- | --- | --- |
> | 1 | `media_job_lifecycle` | `20260903062550` | applied, **immutable, unmodified** |
> | 2 | `media_job_lifecycle_repairs` | `20260903070644` | applied — **Revision 2 only** |
>
> **Revision 1 of the correction was rejected and never applied.** Its FK-cascade
> exemption matched on the SHAPE of the change alone, which ordinary application
> SQL could reproduce — `update media_jobs set asset_id = null` would have taken
> it. Revision 2 adds two signals application SQL cannot produce. The rejected
> draft's exact statement is kept as a permanent regression test.
>
> **`DURABLE_MEDIA_JOB_STORE_AVAILABLE` is still `false`** — but for a new and
> narrower reason (§18), and the operator-facing blocker text was corrected so it
> no longer points at a database that is now correct.

---

## 1. Pre-flight

| Check | Result |
| --- | --- |
| `origin/main` start / end | `e2e9819a…` / `e2e9819a…` — **did not move** |
| Branch HEAD / merge-base | `e2e9819a…` / `e2e9819a…`, 0 ahead 0 behind |
| New commits to inspect for overlap | **none** |
| Repo migration files (before) | 74 · enforced 60 · grandfathered 14 |
| Remote ledger (before) | 97 entries |
| **Enforced repo migrations missing from ledger** | **ZERO — no drift** |
| Working tree | Phase 3 work only, no migration-dir changes |

Drift was computed the way the guard computes it: strip `^\d+_` and `.sql` from
every file in `apps/web/supabase/migrations/`, subtract the frozen
`GRANDFATHERED` set, and check each remainder against
`public.omnira_applied_migrations()`. Empty result ⇒ the guard would pass.

## 2. Production target verification

Verified from the platform, not from a repo comment:

| Field | Value |
| --- | --- |
| ref / name | `iboepohjwrhtgshrqaol` / **AI Operating Platform** |
| status / region | `ACTIVE_HEALTHY` / `eu-west-1` |
| Phase 1 tables | `assets`, `asset_provenance` present, **0 rows each** |
| Phase 4 tables (before) | `media_jobs`, `media_job_reconciliations` **absent** |
| Conflicting `media_job%` functions | 0 |

Two further facts checked rather than assumed, because the RLS design depends on
them: Supabase default privileges already grant new public tables to
`anon`/`authenticated`/`service_role` (so RLS, not GRANTs, is the control), and
`service_role` carries `BYPASSRLS` while `anon`/`authenticated` do not.

## 3–4. Migration identity and ledger safety

Name **`media_job_lifecycle`**. Re-checked immediately before apply: not in the
ledger, no similar name, ledger stable at 97, neither table present, `main`
unmoved.

The frozen DDL was verified against the approved semantics before apply — 20
required properties present, 6 forbidden constructs absent (no spend column, no
`brief_hash` UNIQUE, no user write policy, no ALTER of an existing table, no
backfill, no invented orchestration id), exactly 4 indexes.

Two **non-semantic** deltas from the reviewed artifact, stated rather than
slipped in: `media_job_reconciliations` is now created *before* the guard that
reads it, and `reject_media_reconciliation_mutation` gained
`set search_path to ''` (it references no objects, so this is pure hardening —
and it is why that function does **not** appear in the advisor's mutable-search
path list while the repo's older equivalent does).

## 5. Remote apply

| | |
| --- | --- |
| Applied | 2026-09-03, one operation, `apply_migration(name='media_job_lifecycle')` |
| Ledger version | **`20260903062550`** |
| Result | `{"success": true}` |
| Ledger after | 98 entries |

**The SQL and the name are now immutable.** Every correction below is a forward
migration.

## 6. Remote verification

Structure — all matched the design exactly:

- `media_jobs` **18 columns**, types/nullability/defaults as designed (`id` with
  no default, `state` defaulting `PENDING_DISPATCH`, `version` defaulting 1).
- 15 constraints on `media_jobs`, 6 on the ledger; 2 PKs, 3 FKs, 9 CHECKs.
- 4 declared indexes + 2 PK indexes.
- 3 triggers; RLS enabled on both tables; **2 policies, both `SELECT`, zero
  write policies**.
- `assets` 0 rows, `asset_provenance` 0 rows, `runs` 1301 rows — **untouched**.

**Twelve negative structural proofs, all PASS**, run inside a block that raises
at the end so every test row rolled back (production kept 0 media job rows):

| | Proof | |
| --- | --- | --- |
| P1 | invalid lifecycle state rejected | ✅ |
| P2 | **duplicate `brief_hash` allowed** | ✅ |
| P3 | `UNKNOWN` without `reconciliation_required` rejected | ✅ |
| P4 | CAS with a stale version affects **0 rows** | ✅ |
| P5 | an update that does not advance `version` is refused | ✅ |
| P6 | no rewind past the dispatch boundary | ✅ |
| P7 | `UNKNOWN` cannot be resolved without evidence | ✅ |
| P8 | a `STILL_UNKNOWN` row is **not** evidence | ✅ |
| P9 | cross-project reconciliation refused | ✅ |
| P10 | ledger is append-only | ✅ |
| P11 | path-traversal shaped remote id refused | ✅ |
| P12 | `asset_id` may not bind to a non-`SUCCEEDED` job | ✅ |

**Advisors.** Two new WARNs, both `SECURITY DEFINER function callable via RPC`,
identical to the pre-existing `runs_action_outcome_guard` /
`runs_action_binding_guard` entries. Checked rather than waved away: both new
guards **refuse direct invocation** with SQLSTATE `0A000` (a trigger function
cannot be called as an RPC), so the warning is not exploitable.

## 7. Repo migration

Committed **only after** remote verification, as
`20260903062550_media_job_lifecycle.sql` — the version prefix matches the ledger
so `migrationNameFromFile()` derives `media_job_lifecycle` exactly.

Content identity was **proven, not assumed**: the applied text and the repo file
have the same whitespace-normalised md5 (`659985ac10dc76a2d6d677030ffc4531`,
19 139 chars). The only difference found was a trailing newline.

**The real guard was run with real credentials:**

```
migration-guard: build env — service_role=true url=true
migration-guard: ✓ all 61 enforced migration(s) applied.
GUARD EXIT: 0
```

## 8. Generated types

Regenerated via the Supabase type generator into
`apps/web/lib/supabase/database.types.ts`.

**133 insertions, 0 deletions. The only tables added are `media_jobs` and
`media_job_reconciliations`.** Zero unrelated drift, no hand edits, and no
`as any` was added anywhere to bypass schema typing.

## 9–10. Supabase store and CAS

`lib/media/job/store-supabase.ts` implements the existing port. **No signature
changed to suit SQL** — the database serves the lifecycle, not the reverse.

CAS is genuinely in the database:

```sql
update media_jobs set …, version = <expected + 1>
 where id = $1 and version = <expected>
```

`version = expected + 1` is sent as a literal because PostgREST cannot express
`version + 1`; that is equivalent under the predicate, and the trigger
independently refuses unless `new.version = old.version + 1`, so a caller that
miscomputed the successor is rejected rather than trusted. **Zero affected rows
is a CAS conflict and nothing else** — mapped to `version_conflict` /
`not_found`, never to "retry the dispatch".

`transition` does read the row first, and the module says plainly why: three
columns are set-once and PostgREST cannot express `coalesce(col, $n)`. That read
supplies **field values only**; the authority remains the `version` predicate, so
a row that moves in between simply produces the conflict it would have anyway.

## 11. The two defects, and the forward migration that fixed them

Running the real migration against a real postgres — which is what that suite is
for — surfaced two problems invisible to TypeScript, plus the atomicity gap
already known from the schema review.

| | Defect | Effect before the fix |
| --- | --- | --- |
| **F4-01** | `assets … ON DELETE SET NULL` unreachable: the cascade's internal UPDATE neither advances `version` nor may NULL a write-once column | **an asset referenced by a media job could not be deleted** |
| **F4-02** | the append-only trigger refused *every* DELETE, including `ON DELETE CASCADE`'s | **a project with any reconciliation row could not be deleted** |
| **F4-03** | the ledger INSERT and the CAS UPDATE must commit together; PostgREST cannot | `recordReconciliation` had to refuse |

### How a cascade is distinguished from application SQL

Measured, not assumed, with a throwaway fixture printing trigger context:

| Path | `pg_trigger_depth()` | Referenced parent visible? |
| --- | --- | --- |
| direct application `UPDATE … SET fk = NULL` | **1** | **yes** |
| FK cascade `ON DELETE SET NULL` | **2** | **no** |
| direct application `DELETE` | **1** | — |
| FK cascade `ON DELETE CASCADE` | **2** | — |

Both exemptions require **both** signals, plus seven column-level equalities for
F4-01. Depth is a *mechanism* fact — a referential action always runs nested.
Parent-absence is a *semantic* fact that application SQL cannot arrange without
first performing the cascade it is imitating.

### ⚠️ Regression-sensitive schema invariant

**`pg_trigger_depth()` is not a reusable security primitive and must not be
generalised into an application abstraction.** It is accepted here only as part
of the multi-signal condition proven by the local matrix.

`lib/qa/media-job-lifecycle-sql.test.ts` MUST be re-run if any of these change:
a trigger is added to or reordered on `public.media_jobs`; the `media_jobs.asset_id`
FK action changes; asset deletion semantics change; reconciliation cascade
semantics change. A new trigger on `media_jobs` would raise the depth for
*ordinary* writes — which is exactly why signal 2 exists and why neither may be
dropped. The contract is asserted by a test, not only written here.

### F4-03 — atomic reconciliation

`media_job_record_reconciliation()` — `SECURITY DEFINER`, `search_path` pinned to
`''`, every object schema-qualified, `EXECUTE` revoked from `PUBLIC`/`anon`/
`authenticated` and granted only to `service_role`.

It locks the job `FOR UPDATE`, checks existence and version, **inserts the
evidence, then performs the CAS**, and **raises on every refusal** — because a
normal return after the insert would commit an evidence row claiming a resolution
that never happened. PL/pgSQL runs inside the caller's transaction, so the raise
undoes the insert with it.

**Identity is derived, never accepted.** `project_id`, `provider` and
`remote_operation_id` come from the locked job row and are not parameters at all,
so a caller cannot name another project's job or bind evidence to an operation
the job does not own.

Refusals map to distinct contract values — `not_found`, `version_conflict`,
`requires_reconciliation`, `illegal_transition`, `write_failed` — and **none of
them is ever "dispatch again"**.

## 12. Project isolation

`project_id` comes from `RunMediaJobInput` and never from a provider response —
asserted by a test that feeds a hostile `projectId` in the provider payload and
checks admission still receives the job's own. `listUnresolved` is
project-scoped. A remote operation id is not a key, appears in no policy, and
authorizes nothing. RLS is `SELECT`-only with **no write policy at all**, proven
in SQL (`cmd` is `SELECT` for every policy; count of non-SELECT policies is 0).

## 13–15. MuAPI lifecycle, polling, reconciliation

Unchanged from Phase 3 and still green: dispatch classification (connect-stage ⇒
`not_dispatched`; reset/timeout/5xx ⇒ `response_lost`; 4xx ⇒ `remote_rejected`;
2xx-with-no-usable-id ⇒ `confirmed_evidence_failed`), bounded polling with an
injected clock, and reconciliation that refuses to invent a lookup MuAPI does not
have.

**New in Phase 4:** `dispatch_observation` is now **persisted** rather than
discarded, so an `UNKNOWN` that may not exist is distinguishable in the row from
one the vendor answered 2xx for. And `reconcile.ts` now records **inconclusive**
attempts too — "we asked three times and still cannot tell" is a fact, and only a
ledger can hold it.

**Not done:** the `withGovernedSpend`-wrapped MuAPI dispatch adapter. It is
downstream of the gate below and would need a MuAPI rate in `cost_rates` plus a
real model choice; starting it while the store cannot reconcile would be building
on a known gap.

## 16. Spend boundary

Unchanged and re-confirmed: `withGovernedSpend` wraps **dispatch only**. Polling,
reconciliation and admission take no reservation, and a guard test asserts that
no module under `lib/media/job/` imports `withGovernedSpend`, `reserveSpend`,
`settleSpend`, `releaseSpend` or `budget-gate`. `UNKNOWN` still settles — ambiguity
is not a refund. **No spend column was added to either table.**

## 17. Asset admission

Unchanged: remote terminal success is not local success. The `asset_id IS NULL OR
state = 'SUCCEEDED'` constraint permits **SUCCEEDED without an asset**, which is
precisely how "provider produced bytes, admission failed" stays representable —
and the SQL suite proves the database accepts that row.

## 18. Eligibility gate

**`DURABLE_MEDIA_JOB_STORE_AVAILABLE` remains `false`, and the reason changed.**

The original blocker is CLOSED: the durable store exists, works, and is proven.
What is still missing is a different thing — **no governed dispatch adapter
connects a `MediaProvider` to `runMediaJob`**. `orchestrate.ts` still refuses
provider-layer candidates at dispatch, so flipping the flag alone would let
eligibility select a candidate that then fails at the moment of spending, which
is precisely the ordering Phase 2 built `dispatch.supported` to prevent.

The operator-facing blocker string was rewritten accordingly. A stale reason is
worse than none — it would have sent someone to fix a database that is already
correct.

Building that adapter was NOT attempted, and the reason is §19: with no MuAPI
credential in this environment it could not be exercised at all. Writing an
unexercised governed-spend path and then opening the gate in front of it would be
producing code to close a task rather than to make something work.

## 19–20. Sandbox decision — **SANDBOX BLOCKED — BILLING NOT PROVEN SAFE**

**No provider call of any kind was made.**

MuAPI is not configured in this environment. Checked directly (presence only, no
values read):

| Variable | State |
| --- | --- |
| `MUAPI_ENABLED` | **absent** |
| `MUAPI_MODE` | **absent** |
| `MUAPI_TEST_API_KEY` | **absent** |
| `MUAPI_PROD_API_KEY` | **absent** |
| `MUAPI_PRODUCTION_ENABLED` | **absent** |

`resolveMuapiMode()` therefore returns `disabled`, and `gate.ts` refuses every
outbound call — generation, polling, model listing and health check alike.

So non-billability could not be established from actual account or API behaviour,
because the account cannot be reached at all. Per the brief: **if free status
cannot be proven, do not call it.** No balance was read, and there is no
before/after balance to report.

This does **not** make the Phase 4 architecture fail. It is a configuration fact
about this environment, not a defect in the lifecycle.

## 21–22. Tests

```
lib/qa/media-job-lifecycle.test.ts       70 passed   in-memory lifecycle
lib/qa/media-job-lifecycle-sql.test.ts   26 passed   BOTH real migrations, real postgres
lib/qa/media-job-store-durable.test.ts   17 passed   the durable adapter's request shapes
Full repository suite          226 files, 6831 passed, 0 failed  (×3 consecutive)
tsc --noEmit                   clean
migration-guard (real creds)   ✓ all 62 enforced migration(s) applied
```

Three suites, each proving what the others structurally cannot: the lifecycle
against a fake store, the DATABASE by running the real migration files, and the
ADAPTER's request shapes. The single most important assertion in the third is
negative — `recordReconciliation` issues **one RPC and zero insert/update calls**.

One full-suite run immediately after the fast-forward onto PR #169 reported 12
failures across 2 files. It did NOT reproduce in three subsequent full runs
(6831/6831 each) or in four concurrent runs of every SQL suite (244/244 each).
That log was not captured, so the cause is unidentified rather than explained —
recorded here as an observed one-off instead of being quietly dropped.

**All 12 corrected regressions from the approval brief pass**, plus the Revision 1
exploit shape (rejected), plus five F4-03 atomicity tests and the trigger-depth
contract test.

Of Task 22's original 30 durable proofs, the six previously blocked are now
covered: UNKNOWN survives a fresh store instance, `dispatch_observation`
round-trips both ambiguous values distinctly, CAS is database-backed, two writers
at one version produce exactly one winner, reconciliation is atomic, and a stale
CAS leaves no ledger row.

## 23. Exact diff

**Applied to production:** two migrations, nothing else.
`media_job_lifecycle` (`20260903062550`) and `media_job_lifecycle_repairs`
(`20260903070644`). The first is **unmodified** — its stored SQL md5 still equals
the value recorded at apply time.

**New files**

| File | Purpose |
| --- | --- |
| `apps/web/supabase/migrations/20260903062550_media_job_lifecycle.sql` | applied migration 1 |
| `apps/web/supabase/migrations/20260903070644_media_job_lifecycle_repairs.sql` | applied migration 2, Revision 2 |
| `apps/web/lib/media/job/store-supabase.ts` | durable adapter, DB-side CAS, atomic reconciliation |
| `apps/web/lib/qa/media-job-lifecycle-sql.test.ts` | 26 tests, both real migrations |
| `apps/web/lib/qa/media-job-store-durable.test.ts` | 17 tests, adapter request shapes |
| `docs/architecture/media-runtime/PHASE4_RESULT.md` | this file |
| `docs/architecture/media-runtime/PHASE4_FORWARD_REVIEW.md` | the approval review |
| `docs/architecture/media-runtime/PHASE4_PROPOSED_FORWARD_MIGRATION.sql` | Revision 2 as applied |

**Modified**

| File | Change |
| --- | --- |
| `apps/web/lib/supabase/database.types.ts` | regenerated twice: both tables, then the RPC. 171 added, 0 tables removed |
| `apps/web/lib/media/job/store.ts` | `dispatchObservation` on record + transition; `recordReconciliation` on the port; corrected blocker text |
| `apps/web/lib/media/job/run.ts` | persists `dispatchObservation` |
| `apps/web/lib/media/job/reconcile.ts` | uses `recordReconciliation`; records inconclusive attempts |
| `apps/web/lib/qa/media-job-lifecycle.test.ts` | inconclusive-path assertions |
| `apps/web/lib/qa/executive-intelligence-schema-activation.test.ts` | migration tripwire 60 → 62, both entries documented |

Plus the Phase 3 files, still uncommitted.

**Not committed. No PR. No merge. No deploy.**

## 24. Limitations

1. **No governed dispatch adapter** connects a `MediaProvider` to `runMediaJob`.
   This is now the only thing between the lifecycle and a working MuAPI path.
2. **MuAPI is unconfigured in this environment** — no enable flag, no mode, no
   credential — so nothing on that path can be exercised, and no sandbox claim
   can be made.
3. **`DURABLE_MEDIA_JOB_STORE_AVAILABLE` is `false`.** MuAPI stays unselectable.
4. **No MuAPI rate in `cost_rates`** and no chosen model.
5. **An id-less ambiguous dispatch stays unreconcilable** — MuAPI offers no
   correlation lookup. Unchanged, and unchangeable from Omnira's side.
6. **No link from an unresolved UNKNOWN to its settled spend** (schema review
   §20 concern 1), unchanged.
7. **The cascade exemptions are regression-sensitive** (§11). A new trigger on
   `media_jobs` raises the depth for ordinary writes; signal 2 is what keeps the
   exemption closed, and the SQL suite must be re-run.
8. **`STILL_UNKNOWN` does not advance `version`**, by design — an observation is
   not a state change — so concurrent inconclusive reconciliations do not
   conflict. They are append-only facts, so this is correct.

## KNOWN ADJACENT DEFECT — OUT OF SCOPE

**`public.workflow_action_reconciliations` (PR9d)** pairs the same
`on delete cascade` with the same unconditional append-only trigger that caused
F4-02. **`public.runs` rows carrying reconciliations cannot be deleted today**,
and neither can their projects, by the same chain. This is a live production
defect, not a theoretical one.

Deliberately **not fixed** in Phase 4. The media fix did not require it, and
folding it in would put a workflow-governance change inside a media migration
where no reviewer of either would expect it.

Recommendation: **its own issue and its own forward migration**, owned by
workflow governance. The two-signal fix in `media_job_lifecycle_repairs` is a
working template, and §11's measurements are reusable evidence. Not urgent —
nothing deletes those rows today — but it should not stay undocumented.

## 25. `media_orchestrator` prerequisite

**Unchanged — still unmet. Do not remove it.** Job lifecycle and retry loop are
built and now durable at the schema level; technical QC is built; **model
selection is still `muapi:unspecified`** and semantic QC is a declared boundary
only. `MEDIA_GENERATION_UNMET_PREREQUISITES` is untouched.

## 26. Phase 5 recommendation

**Phase 5 — Governed MuAPI dispatch, then the sandbox proof.** The persistence
work is done; what remains is the provider seam and a credential.

1. Provision a MuAPI **sandbox** credential (`is_test: true`) and set
   `MUAPI_ENABLED=1`, `MUAPI_MODE=test`, `MUAPI_TEST_API_KEY`. Production stays
   off — it needs two switches and a licence decision.
2. Prove non-billability from the account: record balance, call `healthCheck()`,
   re-read balance. Balance delta, never `last_used_at`.
3. Add a MuAPI entry to `cost_rates` and choose ONE real image model — the
   smallest honest step, not a Model Registry.
4. Build the governed dispatch adapter: `withGovernedSpend` around the MuAPI
   submit **only**, feeding `runMediaJob`. Polling and reconciliation stay
   ungoverned.
5. Wire it into `orchestrate.ts` so a provider-layer candidate is genuinely
   dispatchable, then flip `DURABLE_MEDIA_JOB_STORE_AVAILABLE`.
6. Prove Phase 2 eligibility changes **naturally** from declared capability — no
   special-casing MuAPI into the ranker.
7. **Then** one controlled sandbox generation end-to-end, with a zero balance
   delta required for the free-sandbox claim.
8. Separately: raise the PR9d defect above.

Still out of scope: webhooks, semantic QC, video/audio, a Model Registry,
cross-provider failover, new providers.

# GO — durable persistence complete · sandbox blocked on configuration

Two migrations applied, verified by twelve negative proofs in production plus 26
SQL regressions locally, and committed in the safe order with the real guard
green at 62. The durable store is complete, with database-side CAS and an atomic
reconciliation RPC. Both defects found by running the first migration are fixed
forward-only; the first migration is provably unmodified.

Revision 1 was rejected and never applied, and the exact statement it would have
allowed is now a permanent regression test.

What is not done is honest and narrow: no governed dispatch adapter, and no MuAPI
credential to exercise one with. **SANDBOX BLOCKED — BILLING NOT PROVEN SAFE**,
because the account cannot be reached at all — a configuration fact, not an
architectural failure.
