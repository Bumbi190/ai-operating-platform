# PHASE 3 — SCHEMA APPROVAL REVIEW

**Media Job Lifecycle durable persistence.** Review only. No migration created,
nothing applied, nothing committed.

SQL under review: [`PHASE3_PROPOSED_SCHEMA.sql`](./PHASE3_PROPOSED_SCHEMA.sql)
(revision 2). Derived from the code that already exists in
`apps/web/lib/media/job/` and passed Phase 3's 70 tests. Phase 3 is not
redesigned.

> **Two changes from the revision shown at the end of Phase 3.** Deriving the
> schema strictly from the port surfaced a defect and a gap. Both are in §1 and
> §11; the headline is that **revision 1's trigger was unsatisfiable** — it
> required a reconciliation row that no port method can write.

---

## 1. Table model

Two tables. `media_jobs` (18 columns) and `media_job_reconciliations` (10).

### `public.media_jobs`

Column ↔ `MediaJobRecord` field is 1:1 except where noted.

| # | Column | Type | Null | Default | Meaning | Who sets it | Mutable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` PK | NOT NULL | **none** | canonical local job identity | **Omnira**, `newMediaJobId()`, pre-dispatch | never |
| 2 | `project_id` | `uuid` | NOT NULL | — | owning project | caller (`RunMediaJobInput.projectId`) | never |
| 3 | `provider` | `text` | NOT NULL | — | `MediaProviderId` | caller | never |
| 4 | `model` | `text` | NOT NULL | — | vendor model/resource | caller | never |
| 5 | `state` | `text` | NOT NULL | `'PENDING_DISPATCH'` | lifecycle state | lifecycle only | yes, guarded |
| 6 | `remote_operation_id` | `text` | NULL | — | vendor's operation handle | vendor, via `acceptRemoteOperationId` | **write-once** |
| 7 | `dispatch_observation` | `text` | NULL | — | what the dispatch **proved** | lifecycle, from `observationForDispatch()` | set once at dispatch |
| 8 | `simulated` | `boolean` | NOT NULL | `false` | ran on a sandbox credential | caller | never |
| 9 | `brief_hash` | `text` | NOT NULL | — | sha256 of the canonical brief | caller | never |
| 10 | `asset_id` | `uuid` FK | NULL | — | the admitted canonical Asset | lifecycle, post-admission | **write-once** |
| 11 | `last_failure_code` | `text` | NULL | — | typed failure code | lifecycle | yes |
| 12 | `last_failure_detail` | `text` | NULL | — | redacted detail | lifecycle | yes |
| 13 | `reconciliation_required` | `boolean` | NOT NULL | `false` | a human must resolve this | lifecycle | yes |
| 14 | `created_at` | `timestamptz` | NOT NULL | `now()` | row minted | database | never |
| 15 | `dispatch_started_at` | `timestamptz` | NULL | — | ambiguity window entered | lifecycle | set once |
| 16 | `remote_confirmed_at` | `timestamptz` | NULL | — | vendor acknowledged | lifecycle | set once |
| 17 | `terminal_at` | `timestamptz` | NULL | — | reached a terminal state | lifecycle | set once |
| 18 | `version` | `integer` | NOT NULL | `1` | CAS guard | lifecycle | yes, must advance |

`id` has **no default** on purpose: a job whose id the database invented would be
a job the dispatching process could not name if the insert's own response were
lost — the same failure the whole design exists to survive.

**Nothing else is on the row.** No spend id (§8), no orchestration id (below), no
retry counter (`attempts` belongs to `runs`' claim/lease model, which this table
does not have), no polling counter (not a durable fact).

### The two requested fields that do **not** exist, and why

| Requested | Verdict |
| --- | --- |
| **orchestration / request identity** | **Not added.** No such identity exists anywhere in the codebase. Phase 2's `MediaGenerationBrief` carries no request id, and `runMediaJob` receives none. `brief_hash` (col 9) is the closest real thing and is already stored — two identical requests are recognisable by it. Inventing an orchestration id here would be a field nothing populates, which §1 forbids. |
| **dispatch observation** | **Added** (col 7) — and this is a change from revision 1. |

### Why `dispatch_observation` earned its column

It is **not** a new fact: `run.ts` already computes it (`observationForDispatch(result)`)
and revision 1 discarded it, keeping only a prose fragment inside
`last_failure_detail`. Persisting it is required by §4, because `state` alone is
too coarse for the operator's decision:

| state | observation | What the operator must do |
| --- | --- | --- |
| `FAILED` | `not_dispatched` | nothing was sent or billed — redispatch is free |
| `FAILED` | `remote_rejected` | vendor said no and did no work — the request must change |
| `UNKNOWN` | `response_lost` | may or may not exist — check the vendor |
| `UNKNOWN` | `confirmed_evidence_failed` | vendor answered 2xx: it **almost certainly exists and was billed** |

The last two are both `UNKNOWN` and demand different urgency. Without the column
they are indistinguishable in the row — which is precisely what §4 forbids.

**Port delta required:** `transition()` gains one optional field,
`dispatchObservation?: DispatchObservation | null`. One line, no redesign.

---

## 2. Identity invariants

| Identity | Canonical authority | Where it lives | Conflation prevented by |
| --- | --- | --- | --- |
| **MediaJob ID** | **Omnira** — `newMediaJobId()`, pre-dispatch | `media_jobs.id` | branded `MediaJobId`; no default in SQL |
| **Remote operation ID** | **the vendor** | `media_jobs.remote_operation_id` | branded `RemoteOperationId`; separate column; write-once; shape CHECK |
| **Asset ID** | **the database**, at admission (§21.4) | `assets.id`, referenced by `media_jobs.asset_id` | branded `AssetId`; minted by `assets` default; FK, not a copy |
| **Orchestration/request ID** | **does not exist** | — | represented by `brief_hash`; no column claims to be one |
| **Spend reservation ID** | **`spend_reservations`** via `withGovernedSpend` | **not in this schema at all** (§8) | absence |

Three distinct SQL types/columns for three distinct authorities, plus one FK. No
column is ever populated from a second authority's value. The compile-time echo
(`RemoteOperationIdIsNeverAnAssetId`) is asserted in `identity.ts`; the runtime
guarantee is that Phase 1 mints the asset id *in the database* and derives the
bucket from `visibility`, so a provider has no argument that could name either.

**The remote id is never a storage path** — `run.ts` passes only
`storagePath` (caller-built) to admission, and a Phase 3 test asserts the path
contains no vendor string.

---

## 3. State storage

Canonical names are the implementation's (`MEDIA_JOB_STATES`), stored verbatim as
`text` under a CHECK:

`PENDING_DISPATCH` · `DISPATCHING` · `QUEUED` · `RUNNING` · `SUCCEEDED` ·
`FAILED` · `UNKNOWN`

### Legal transitions

```
PENDING_DISPATCH → DISPATCHING                       (before the wire)
DISPATCHING      → QUEUED | FAILED | UNKNOWN         (what the dispatch proved)
QUEUED ⇄ RUNNING → SUCCEEDED | FAILED                (observation)
UNKNOWN          → SUCCEEDED | FAILED | RUNNING | QUEUED
                                                     ONLY with recorded evidence
SUCCEEDED, FAILED                                    absorbing
```

`RUNNING → QUEUED` is permitted, not refused: a vendor whose queue reports out of
order is describing its own scheduling, and refusing it would turn a cosmetic
quirk into a frozen job. Nothing rewinds below `DISPATCHING`.

### Enforcement: **C, minimally** — and the smallest sufficient mechanism, argued

CHECK constraints cannot see `OLD`. Exactly five rules need it, and each is
load-bearing:

| Rule | Why a trigger is unavoidable |
| --- | --- |
| `version` must advance | a CAS that writes the same version lets the next reader double-write |
| no rewind past `DISPATCHING` | `PENDING_DISPATCH` is the only state where redispatch is safe |
| terminal is absorbing | otherwise `SUCCEEDED` can be rewritten to `FAILED` |
| `UNKNOWN` exits only on evidence | **the central Phase 3 invariant** |
| `remote_operation_id`, `asset_id` write-once | prevents rebinding a paid generation |

Everything else is a CHECK (§14). This is **not** a general state machine: legal
forward movement is unconstrained in SQL and decided by
`isLegalMediaJobTransition`. The trigger is the same size and shape as PR9d's
`runs_action_outcome_guard`, which made the identical call for the identical
reason — the application is one caller; the database is the invariant.

Option B alone (CHECKs only) would be sufficient for **concurrency** — CAS does
that work — but would leave "an UNKNOWN may not be cleared by hand" as a
convention. Given that an UNKNOWN represents money that may have been spent, that
is the one rule worth a trigger.

---

## 4. UNKNOWN durability

The durable representation of *"dispatch may have succeeded but the remote
operation's identity/state cannot be proven"*:

```
state                   = 'UNKNOWN'
dispatch_observation    = 'response_lost' | 'confirmed_evidence_failed' | 'partially_applied'
remote_operation_id     = NULL            ← the unreconcilable case
reconciliation_required = true            ← CHECK-enforced, not a convention
dispatch_started_at     = <timestamp>     ← proof the window was entered
terminal_at             = <timestamp>
last_failure_code       = 'MEDIA_DISPATCH_UNKNOWN'
project_id, provider, model, brief_hash   ← the evidence a human reconciles against
```

**Survives** request termination, serverless restart, worker restart, redeploy —
it is a committed row, written **before** the wire (`create` then
`transition → DISPATCHING`, both before `dispatch()` is called).

**Distinguishable from all three dangerous look-alikes:**

| Confusable with | Distinguished by |
| --- | --- |
| never dispatched | `dispatch_started_at IS NOT NULL`, and `state ≠ 'PENDING_DISPATCH'`; the trigger forbids returning there |
| definitely failed | `state = 'UNKNOWN'`, never `'FAILED'`; the two are separate values, not a flag on one |
| safe to retry | `classifyMediaRetry('UNKNOWN') = RECONCILE, automatic: false`; `mayAutomaticallyDispatch` is `false`; and the trigger blocks any exit without a ledger row |

**User retry** cannot produce a duplicate: a fresh `runMediaJob` mints a *new*
`id` and creates a *new* row, so the UNKNOWN row is never overwritten or reused —
it stays in `listUnresolved` until a human resolves it. The schema does not
prevent a human from deliberately starting a second generation; it guarantees the
first one's ambiguity is never erased by doing so.

---

## 5. Compare-and-set / concurrency

The exact operation behind `transition()` and `recordAdmission()`:

```sql
update public.media_jobs
   set state = $3,
       version = version + 1,
       remote_operation_id = coalesce(remote_operation_id, $4),
       dispatch_observation = coalesce($5, dispatch_observation),
       last_failure_code = coalesce($6, last_failure_code),
       last_failure_detail = coalesce($7, last_failure_detail),
       reconciliation_required = case when $3 = 'UNKNOWN' then true
                                      when $8 then false
                                      else reconciliation_required end,
       dispatch_started_at = case when $3 = 'DISPATCHING' then $9 else dispatch_started_at end,
       remote_confirmed_at = coalesce(remote_confirmed_at,
                                      case when $3 in ('QUEUED','RUNNING') then $9 end),
       terminal_at = case when $3 in ('SUCCEEDED','FAILED','UNKNOWN')
                          then coalesce(terminal_at, $9) else terminal_at end
 where id = $1
   and version = $2
returning *;
```

- **Version increments** in the `SET`, and the trigger *requires* `new.version =
  old.version + 1`, so a caller cannot write a stale or equal version.
- **Zero affected rows** means one of two things, and the store must distinguish
  them with a follow-up `select`: the row does not exist (`not_found`) or the
  version moved (`version_conflict`). Both already exist in
  `MediaJobWriteRefusal`.
- **Races.** A poller, a reconciler and (if ever built) a webhook are all just
  *observers*. Each reads a version and writes conditionally. The first commits;
  the rest get zero rows, re-read, and find the job already where it needs to be.
  `run.ts` already treats this as expected and benign on the polling path.
- **Two terminal transitions are prevented twice over**: the CAS lets only one
  writer past a given version, and the trigger makes terminal states absorbing so
  even a correctly-versioned second attempt is refused.
- **Unique constraints involved:** two, and both are safety nets rather than the
  concurrency mechanism — `(provider, remote_operation_id)` and `(asset_id)`,
  each partial. They turn "two jobs claim one paid generation" from a silent
  corruption into a write error.

**No exactly-once claim.** Remote execution is at-most-once *locally terminal*
over at-least-once *observations*. Omnira cannot promise exactly-once at a vendor
that offers no idempotency key.

---

## 6. Remote operation ID

| Question | Answer |
| --- | --- |
| Nullable before acknowledgement? | **Yes** — and a permanent NULL on an `UNKNOWN` row *is* the unreconcilable case |
| Provider scoped? | Yes — meaningless without `provider` |
| Unique globally or per provider? | **Per provider**: `unique (provider, remote_operation_id) where … is not null`. Two vendors may legitimately mint the same string |
| May two local jobs share one remote operation? | **No.** That would mean two rows claiming one paid generation. The unique index makes it a write error |
| Malformed IDs bounded? | `^[A-Za-z0-9._:-]+$`, length ≤ 200 — mirroring `acceptRemoteOperationId` exactly. Refused, never escaped |
| May it contain sensitive data? | Treated as opaque and non-secret. It is owner-readable under RLS, is never logged with credentials, and `MediaProviderError` redaction applies to any message carrying it |
| Used as a storage path? | **Never.** `run.ts` passes only the caller-built `storagePath` to admission; `/` and `..` cannot appear in an accepted id anyway |

---

## 7. Request / idempotency identity

**There is no canonical client correlation/request ID, and none is proposed.**

For MuAPI specifically, from repository evidence (`MUAPI_LIFECYCLE`):

| Question | Answer |
| --- | --- |
| Can a correlation id be sent to the provider? | **No.** `POST /api/v1/{model}` takes model fields; no key parameter is documented or sent |
| Can the provider later be queried by one? | **No.** `lookupByCorrelationId: false`, `lookupByHistory: false` |
| So what is it? | **Local-only evidence.** `brief_hash` + `project_id` + `model` + `dispatch_started_at` is what a human matches against a vendor dashboard |

**MuAPI provides no idempotency guarantee of any kind**
(`clientIdempotency: false`). Nothing in this schema implies one. In particular
`brief_hash` is **not** an idempotency key and carries no unique constraint —
generating the same brief twice is a legitimate act, and constraining it would
silently deduplicate two deliberate generations.

`withGovernedSpend`'s `idempotencyKey` parameter remains dormant and unused, as
its own documentation requires.

---

## 8. Spend relationship

**No spend column. No FK. No cost metadata. Nothing.**

| Option | Verdict |
| --- | --- |
| `spend_reservation_id` FK | **No** — `withGovernedSpend` settles the reservation *before* `run()` returns, so by the time the job row is updated post-dispatch the id names a closed reservation. And nothing exposes it: `withGovernedSpend` does not return it to the caller, so the column would be one nothing can populate — a field added "because it may be useful someday", which §1 forbids |
| governed operation identity | **No** — `provider` + `model` already record what was called |
| cost metadata (amounts) | **No** — `cost_events` is the ledger; duplicating amounts creates a second one |

**Relation to `withGovernedSpend`:** deliberately none, in the direction that
matters. The wrapper encloses **the dispatch only** (Phase 3 §19); the job row is
written before and after it and never participates in it. This is what guarantees
**UNKNOWN cannot cause a reservation release**: release happens only for
`ProviderNotDispatchedError`, thrown only where an adapter can prove nothing was
sent, and an ambiguous dispatch is *not* that error — every other throw settles.
No schema element can change that, because no schema element is involved.

The link that does exist is Phase 1's, one hop away and only on success:
`media_jobs.asset_id → assets.id → asset_provenance.cost_event_id`.

> **Unresolved concern (see §20).** A job that goes `UNKNOWN` settles spend but
> produces no asset, therefore no provenance row, therefore no link between the
> money and the job. Correlating an unresolved UNKNOWN with its `cost_events` row
> today means matching on provider + operation + timestamp. Adding a column now
> would be speculative; the honest fix is a Phase 4 decision about whether
> `withGovernedSpend` should return its reservation id. **Flagged, not silently
> accepted, and not silently added.**

---

## 9. Asset relationship

A Media Job is not an Asset. The relationship is one nullable FK.

```sql
asset_id uuid references public.assets(id) on delete set null
```

| Question | Answer |
| --- | --- |
| Nullable? | **Yes**, and null for most of the job's life |
| `ON DELETE` | **`set null`**, not cascade. Deleting an asset must not delete the evidence that a paid generation happened. Matches the existing `website_content.hero_asset_id … on delete set null` precedent |
| Is `SUCCEEDED` allowed without `asset_id`? | **Yes — and this is load-bearing.** It is exactly how "provider produced bytes, admission failed" is represented. A CHECK requiring an asset on success would make that state unrepresentable and force the code to report `FAILED`, destroying the fact that the bytes exist and were paid for |
| Reverse constraint? | **Yes:** `asset_id IS NULL OR state = 'SUCCEEDED'`. An asset may only be bound by a job the provider actually completed |
| Uniqueness | `unique (asset_id) where asset_id is not null` — one asset, at most one producing job |

Sequence, enforced by the above: job exists with no asset → provider executes →
result validates (QC) → **admission succeeds and the database mints the AssetId**
→ only then `recordAdmission` binds it, write-once.

Phase 1 canonical Asset identity is untouched: the job references the asset, never
the reverse, and never supplies its id, bucket or path.

---

## 10. Provenance relationship

| Fact | Home | Why |
| --- | --- | --- |
| provider, model, `provider_request_id`, brief/request hashes, reference asset ids, `simulated`, `cost_event_id` | **`asset_provenance`** (Phase 1, unchanged) | durable properties of the *asset*, true forever once written |
| lifecycle state and its changes, dispatch observation, reconciliation flag, failure codes, the four timestamps | **`media_jobs`** | mutable properties of an *attempt*, meaningless once resolved |
| reconciliation attempts | **`media_job_reconciliations`** | append-only facts about asking |

The rule: **provenance answers "what is this asset and what made it";
`media_jobs` answers "what happened to that attempt".** Provenance is written
once, at admission, and never updated — turning it into a polling log would make
it mutable, and a mutable provenance record is one that can be rewritten after
the fact.

Deliberate, minimal duplication: `provider`, `model` and the remote id appear in
both. That is not drift — a job may exist with no asset (every UNKNOWN), and an
asset must be explicable without its job row (which may be deleted with a
project). Each must stand alone.

The only link from provenance back to the lifecycle is
`provider_metadata.mediaJobId`, already written by `run.ts`.

---

## 11. History / events decision

**Answer: B, but narrowly** — a mutable current-state row **plus one**
append-only table, and that table records *reconciliations only*, not transitions.

| Requirement | Needs an event table? |
| --- | --- |
| Concurrency | **No** — CAS on `version` does this entirely |
| Debugging | **No** — four timestamps + `dispatch_observation` + failure code cover the shape of what happened |
| Provider callbacks | **No** — not built (Phase 3 §13); a webhook would be another CAS observer |
| **UNKNOWN investigation** | **Yes** |
| **Reconciliation evidence** | **Yes** |
| **Auditability of ambiguity** | **Yes** |

The justification is specific rather than general: a reconciliation is *repeated*,
and each attempt is a **distinct fact**. "We asked three times over two days and
still cannot tell" is materially different from "we have not asked", and a
mutable `last_reconciliation_result` column would collapse them. Polling state
flips (`QUEUED → RUNNING`) produce no such fact and are deliberately not logged —
that would be the speculative event sourcing to avoid.

Second, structural reason: the ledger is what makes *"UNKNOWN may only be
resolved by evidence"* enforceable in the database at all. Without a row to
count, the trigger has nothing to check and the invariant drops back to a
convention.

**Schema:** `media_job_reconciliations`, 10 columns, append-only by trigger, with
a binding guard asserting the row matches its job's project/provider/operation —
so a reconciliation naming the wrong job cannot clear an unrelated ambiguity.
`(result = 'STILL_UNKNOWN') ⟺ (blocker IS NOT NULL)` is CHECK-enforced.

**Retention:** same as the job — permanent, cascading with the project, no sweep.
A reconciliation is the audit trail for money.

### ⚠️ The defect this section found

**Revision 1 of the schema was unsatisfiable.** Its trigger required a
reconciliation row before `UNKNOWN` could be resolved — but the Phase 3 store
port has **no method that writes one**. `reconcile.ts` builds a
`MediaReconciliationRecord`, *returns* it to the caller, and calls
`store.transition({ hasConfirmedReconciliation: true })` directly. Against
revision 1's trigger, **every legitimate resolution would have been refused.**

Resolution — the required Phase 4 port delta, specified but **not written**:

```ts
recordReconciliation(input: {
  id: MediaJobId
  expectedVersion: number
  record: MediaReconciliationRecord
  resolvesTo: MediaJobState | null
  at: string
}): Promise<MediaJobWriteResult>
```

**Transaction requirement: the ledger INSERT and the CAS UPDATE must be one
transaction, insert first.** The trigger reads the ledger during the update, so
a separate-statement implementation would race with itself. `reconcile.ts` then
calls this instead of `store.transition`. This is a blocking prerequisite: it
must land with the migration, before `DURABLE_MEDIA_JOB_STORE_AVAILABLE` flips.

---

## 12. RLS / project isolation

Reuses the **existing** convention verbatim. The repository has **no**
project-access helper function — verified by search; every project-scoped policy
(`assets_owner`, `asset_provenance_owner`) inlines the same subquery. Inlining it
here is reuse; adding a helper would be the second authorization framework §12
warns against.

```sql
alter table public.media_jobs                enable row level security;
alter table public.media_job_reconciliations enable row level security;

create policy "media_jobs_owner_read" on public.media_jobs
  for select using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );
-- identical policy on media_job_reconciliations
```

| Proof obligation | How it is met |
| --- | --- |
| A cannot **read** B's jobs | the `select` policy filters by `project_id ∈ {A's projects}` |
| A cannot **mutate** B's jobs | **no insert/update/delete policy exists**, so RLS denies every non-service write — A cannot mutate its *own* jobs either |
| Provider payload cannot choose `project_id` | `project_id` comes from `RunMediaJobInput`, never from a provider response. Asserted by a Phase 3 test that feeds a hostile `projectId` in the provider payload and checks admission still receives the job's own |
| Remote operation ID alone cannot authorize access | it is not a key, not unique across the table without `provider`, and appears in no policy. Every read is filtered by project first |

**`for select` only — the one deliberate departure from `assets_owner`**, which
is `for all`. A user legitimately manages their own assets. A media job's state is
derived from what a *provider* said; an owner who could `UPDATE` one could move a
job out of `UNKNOWN` by hand, clearing an unresolved financial ambiguity with no
reconciliation — exactly what the trigger exists to prevent.

**Service-role bypass:** all lifecycle writes, via `createAdminClient()`. Justified
because these rows are derived from provider responses, not user intent, and the
same client already performs Phase 1 asset admission. The trigger and CHECK
constraints still apply to service-role writes — they are not RLS.

---

## 13. Indexes

Three, plus the PK. Each names the query that requires it.

| Index | Query that requires it |
| --- | --- |
| `media_jobs_pkey (id)` | `read(id)`, and every CAS `where id = $1 and version = $2` |
| `media_jobs_unresolved_idx (project_id, created_at) where reconciliation_required` | `listUnresolved(projectIds)` — the operator queue, oldest first |
| `media_jobs_remote_operation_uniq (provider, remote_operation_id) where … not null` | reconciliation lookup by vendor id **and** the one-job-per-operation invariant |
| `media_jobs_asset_uniq (asset_id) where … not null` | the one-job-per-asset invariant |
| `media_job_reconciliations_job_idx (media_job_id, created_at desc)` | the trigger's evidence count, and "how many times have we asked" |

**Deliberately not proposed:** an index for "active jobs awaiting polling" or
"stale jobs past deadline". `MediaJobStore` has exactly five methods and none
queries for them, so such an index would be speculative. It becomes necessary
only if Phase 4 adds a resumption worker, and it should be added *with* that
worker — `(state, dispatch_started_at) where state in ('QUEUED','RUNNING')`.

---

## 14. Constraints

### `media_jobs`

| Kind | Constraint | Invariant protected |
| --- | --- | --- |
| PK | `id` | one row per local job identity |
| FK | `project_id → projects(id) ON DELETE CASCADE` | jobs are project-owned and die with the project |
| FK | `asset_id → assets(id) ON DELETE SET NULL` | deleting an asset must not erase evidence of spend |
| UNIQUE | `(provider, remote_operation_id)` partial | one remote operation, at most one local job |
| UNIQUE | `(asset_id)` partial | one asset, at most one producing job |
| NOT NULL | `id, project_id, provider, model, state, simulated, brief_hash, reconciliation_required, created_at, version` | every row is attributable and classifiable |
| CHECK | `state IN (…7…)` | closed vocabulary, mirrors `MEDIA_JOB_STATES` |
| CHECK | `dispatch_observation IS NULL OR IN (…6…)` | closed vocabulary, mirrors `DispatchObservation` |
| CHECK | `state <> 'UNKNOWN' OR reconciliation_required` | ambiguity always demands a human |
| CHECK | `state = 'PENDING_DISPATCH' OR dispatch_started_at IS NOT NULL` | the ambiguity window is always evidenced |
| CHECK | `state NOT IN (terminal) OR terminal_at IS NOT NULL` | a finished job says when |
| CHECK | `asset_id IS NULL OR state = 'SUCCEEDED'` | only a completed generation may bind an asset |
| CHECK | `remote_operation_id ~ '^[A-Za-z0-9._:-]+$' AND length ≤ 200` | path safety + DoS bound; mirrors `acceptRemoteOperationId` |
| CHECK | `brief_hash ~ '^[0-9a-f]{64}$'` | a hash, not a payload |
| CHECK | `length(provider) 1..64`, `length(model) 1..200` | these reach logs and audit rows |

On bounded lengths: the repository does **not** generally bound text, so this
departs from convention for exactly three columns — the ones a provider response
can influence. An unbounded model or remote id is an unbounded log line.

### `media_job_reconciliations`

| Kind | Constraint | Invariant |
| --- | --- | --- |
| PK | `id` | — |
| FK | `media_job_id → media_jobs(id) ON DELETE CASCADE` | evidence dies with its job |
| FK | `project_id → projects(id) ON DELETE CASCADE` | project isolation |
| NOT NULL | `media_job_id, project_id, provider, result, detail, observed_at, created_at` | every fact is attributable |
| CHECK | `result IN (…5…)` | closed vocabulary |
| CHECK | `blocker IS NULL OR IN (…3…)` | closed vocabulary |
| CHECK | `(STILL_UNKNOWN ⟺ blocker IS NOT NULL)` | an inconclusive answer must say why; a conclusive one must not pretend |
| TRIGGER | append-only (reject UPDATE/DELETE) | facts are not edited |
| TRIGGER | binding guard (project/provider/operation must match the job) | a row naming the wrong job cannot clear an unrelated ambiguity |

---

## 15. Retention

**Permanent. No automated cleanup job in this phase.**

An unresolved `UNKNOWN` is a financial fact about money that may have been spent;
a retention sweep would erase the only evidence an operator has. Rows carry
hashes, not payloads, so volume is not a pressure worth that trade.

**On project deletion** (`ON DELETE CASCADE` throughout):

| Object | Fate |
| --- | --- |
| `media_jobs` rows | deleted with the project |
| `media_job_reconciliations` rows | deleted (cascade from both job and project) |
| `assets` | deleted — Phase 1's existing choice, unchanged |
| `asset_provenance` | deleted (cascade from asset) — unchanged |
| `cost_events` | **unaffected.** The billing record survives, as it must |

The consequence, stated plainly: deleting a project discards its unresolved
ambiguities. That is acceptable because the project they belonged to is gone, and
the money is still recorded in `cost_events` — but it is a deliberate choice, not
an oversight.

If retention is ever wanted: archive `SUCCEEDED`/`FAILED` older than N months,
and **never** touch `reconciliation_required = true`.

---

## 16. Migration form

Full SQL is [`PHASE3_PROPOSED_SCHEMA.sql`](./PHASE3_PROPOSED_SCHEMA.sql)
(revision 2, ~330 lines), presented as a document only.

**It is not in `apps/web/supabase/migrations/`, `apply_migration` was not called,
and the remote database is unchanged.** Proposed eventual name:
`media_job_lifecycle` → file `<YYYYMMDDHHMMSS>_media_job_lifecycle.sql`, so the
ledger name derived by `migrationNameFromFile()` matches exactly.

---

## 17. Store port mapping

Against the **actual** `MediaJobStore` interface. Five methods exist; one must be
added (§11).

| Port method | SQL | Transaction | Concurrency semantics |
| --- | --- | --- | --- |
| `create(CreateMediaJobInput)` | `insert into media_jobs (id, project_id, provider, model, brief_hash, simulated) values (…) returning *` | single statement | Caller-supplied PK. A duplicate id raises `23505` → `write_failed`. Committed **before** the wire |
| `read(id)` | `select * from media_jobs where id = $1` | none | Plain read; RLS-bypassing service role |
| `transition({id, expectedVersion, to, remoteOperationId?, dispatchObservation?, failureCode?, failureDetail?, at})` | the conditional `UPDATE … where id = $1 and version = $2 returning *` from §5 | **single statement — atomic by itself** | 0 rows ⇒ follow-up `select` distinguishes `not_found` from `version_conflict`. Trigger maps `restrict_violation` → `illegal_transition` |
| `recordAdmission({id, expectedVersion, assetId, at})` | `update media_jobs set asset_id = $3, version = version + 1 where id = $1 and version = $2 and (asset_id is null or asset_id = $3) returning *` | single statement | The extra predicate makes re-binding the same asset idempotent and a *different* asset 0-row → `already_admitted`. Backed by the trigger's write-once rule and the unique index |
| `listUnresolved(projectIds)` | `select * from media_jobs where project_id = any($1) and reconciliation_required order by created_at asc` | none | Read-only; served by `media_jobs_unresolved_idx` |
| **`recordReconciliation(…)`** — **new, required** | `insert into media_job_reconciliations (…)` **then** the §5 `UPDATE` with `hasConfirmedReconciliation` | **BEGIN … COMMIT — both statements, insert first** | The trigger reads the ledger during the update, so a non-transactional implementation races itself. Best expressed as one `SECURITY DEFINER` RPC |

`transition()` gains one optional field (`dispatchObservation`). **No other
signature changes. The schema serves the code that passed Phase 3's tests.**

The two `MediaJobWriteRefusal` values not produced by SQL directly —
`requires_reconciliation` and `illegal_transition` — are both mapped from the
trigger's `restrict_violation` by inspecting the message, the same technique
`recordReconciliation` in `lib/workflows/reconciliation.ts` already uses.

---

## 18. Negative design review

| Rejected | Evidence |
| --- | --- |
| **`public.runs`** | `runs_action_binding_complete` is all-or-nothing: the ambiguity guard needs 10 non-null columns including a human `authorization_id`. A hero image has none; supplying them forges authorization |
| **`public.runs` with `workflow_instance_id = NULL`** | Three independent failures: `runs_action_outcome_guard` returns early ("legacy run, untouched") — no guard; `reconciliation_binding_guard` refuses such rows outright — no reconciliation possible; `reap_stuck_runs()` branch (b) **requeues** an expired running row — a second paid call |
| **`asset_provenance` as job storage** | Provenance is written once at admission and must stay immutable. A job exists **before** any asset (every UNKNOWN has none), so there is no row to write to at the moment it matters most |
| **`assets` as job storage** | An asset is the *outcome*. A failed or unknown job has none. Storing attempts there would mean rows that are not assets, in the table whose entire purpose is canonical asset identity (§21.4) |
| **In-memory persistence** | Vercel functions end. An in-memory UNKNOWN is erased, and erased is indistinguishable from "never asked" — the condition under which the next request pays twice |
| **A generic workflow execution table** | The generic table *is* `runs`; see above. Building a second generic one would be the third execution system, and Phase 3's own guard tests forbid a second spend/asset/router system for the same reason |

---

## 19. Migration safety plan

The guard checks **file → ledger only**, never ledger → file. So an applied
migration with no committed file is invisible and harmless; a committed file with
no applied migration is a **build outage**. That asymmetry dictates the order:
**apply first, commit second.**

| # | Step | Guards against |
| --- | --- | --- |
| 1 | `git fetch`; record `origin/main` SHA; rebase the branch if it moved | starting from a stale base |
| 2 | List repo migrations vs `omnira_applied_migrations` — confirm the set is already consistent **before** touching anything | inheriting someone else's drift and blaming this change |
| 3 | Confirm target project is `iboepohjwrhtgshrqaol` ("AI Operating Platform") | applying to the wrong database |
| 4 | **Apply** the reviewed SQL via `apply_migration(name='media_job_lifecycle')` | — |
| 5 | **Immediately verify:** `to_regclass` for both tables; both triggers present; ledger contains `media_job_lifecycle` | a partial apply that later fails the guard |
| 6 | Add the **byte-identical** SQL as `<ts>_media_job_lifecycle.sql`. Name must equal the ledger name after `migrationNameFromFile()` | guard failure from a renamed file |
| 7 | Regenerate `apps/web/lib/supabase/database.types.ts` (it exists and is tracked) | type drift |
| 8 | Land the §11 port delta + the Supabase `MediaJobStore` **in the same PR** | code depending on schema that exists, but a trigger the code cannot satisfy |
| 9 | Full suite + typecheck; only then flip `DURABLE_MEDIA_JOB_STORE_AVAILABLE` | enabling dispatch before the store is proven |
| 10 | Merge | — |

**Step 4→6 is the window.** Between applying and committing, the repo is safe
(no new file) and production is safe (the table is unused — MuAPI is
undispatchable). Keep it short, but it is not dangerous.

**If `main` advances with another migration mid-flight** — which happened during
Phase 3 itself (PR #170, though it carried no migration) — the guard is
*additive*: it validates every file in the directory against the ledger. Another
team's migration is their responsibility and their apply. The only real
interaction is step 2's baseline: if that check shows pre-existing drift, **stop
and resolve it first**, because otherwise this change inherits the blame for a
build failure it did not cause. Re-run step 2 immediately before step 6.

**Once applied remotely, the migration name and its SQL are immutable.** A
correction is a new migration, never an edit — the ledger records the name, and
editing an applied file makes the repo and the database disagree silently.

**Rollback** is a new migration dropping both tables. Safe while unused; the
`DURABLE_MEDIA_JOB_STORE_AVAILABLE` flag is the real kill switch and it is a code
change, not a schema one.

---

## 20. Final schema verdict

| Question | Answer |
| --- | --- |
| Proposed table count | **2** — `media_jobs`, `media_job_reconciliations` |
| Proposed column count | **28** — 18 + 10 |
| Event table required? | **Yes, narrowly** — reconciliations only, not transitions (§11) |
| Additive only? | **Yes** |
| Existing data touched? | **None** |
| Backfill needed? | **No** — `assets` and `asset_provenance` both hold 0 rows |
| Existing tables altered? | **No.** Two new tables, two new functions, four new triggers, five new indexes. `runs`, `assets`, `asset_provenance`, `projects` are untouched |
| RLS enabled? | **Yes** — owner-scoped `for select`; **no** write policy, so all writes are service-role |
| CAS DB-enforced? | **Yes** — conditional `UPDATE … where version = ?` plus a trigger requiring `version` to advance |
| UNKNOWN survives restart? | **Yes** — committed before the wire; `state`, `dispatch_observation`, `reconciliation_required` and `dispatch_started_at` are all durable |
| Schema permits automatic duplicate dispatch? | **No.** It cannot dispatch anything. It makes duplicates *detectable* (two unique indexes) and makes clearing an UNKNOWN without evidence *impossible* (trigger). The no-auto-retry rule itself lives in `classifyMediaRetry`, where it is tested |

### Unresolved concerns

1. **No link from an unresolved UNKNOWN to its settled spend** (§8). A job that
   goes UNKNOWN settles a reservation but produces no asset and therefore no
   provenance row, so correlating it with `cost_events` means matching on
   provider + operation + timestamp. Adding a column now would be speculative
   because `withGovernedSpend` does not expose its reservation id. **Phase 4
   decision:** either expose it and store a pointer (consistent with
   `asset_provenance.cost_event_id`), or accept timestamp correlation and say so.
2. **Project deletion discards unresolved ambiguities** (§15). Deliberate and
   consistent with Phase 1's cascade for assets, but it means a deleted project's
   open financial questions vanish while their `cost_events` remain.
3. **The §11 port delta is a blocking prerequisite**, not optional. Applying this
   migration without `recordReconciliation` would leave every `UNKNOWN`
   permanently unresolvable, because the trigger would refuse the exit.

---

# SCHEMA GO

Conditional on three things landing **together**, in the §19 order:

1. the migration, applied before the file is committed;
2. the `recordReconciliation` port method with its single-transaction
   requirement (§11/§17);
3. the one-field `transition()` delta for `dispatch_observation` (§1).

`DURABLE_MEDIA_JOB_STORE_AVAILABLE` flips **last**, after the full suite passes.

Nothing further has been done: no migration file, no `apply_migration`, no
database change, no commit, no merge.
