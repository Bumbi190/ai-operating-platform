# OMNIRA MEDIA RUNTIME — PHASE 3 RESULT

**Provider Job Lifecycle + Reconciliation**

Branch `feat/omnira-media-job-lifecycle` · worktree `.worktrees/omnira-media-job-lifecycle`
Based on `origin/main` **e2e9819a01548a8c68710633d8b78179b0897152**

**Verdict: GO**, with one gate: MuAPI stays undispatchable until the schema in
§14 is approved and applied. The lifecycle is built, tested and complete; the
thing that blocks it is a decision, not engineering.

> **SUPERSEDED IN PART BY PHASE 4** (see [`PHASE4_RESULT.md`](./PHASE4_RESULT.md)).
> The §14 schema was approved and **applied to production on 2026-09-03** as
> `media_job_lifecycle`, and the durable adapter now exists in
> `lib/media/job/store-supabase.ts`. Two statements below are therefore out of
> date and are corrected here rather than silently edited away:
>
> * §14 says "there is deliberately no Supabase implementation". There is one now.
> * §14's proposal became the applied file. Running it against a real postgres
>   found two defects — `ON DELETE SET NULL` and `ON DELETE CASCADE` were both
>   blocked by this design's own guards. **Both are now fixed** by the
>   forward-only `media_job_lifecycle_repairs` (`20260903070644`), which also
>   added the atomic reconciliation RPC. The original migration is unmodified
>   and provably so. See PHASE4_RESULT.md §11.
>
> `DURABLE_MEDIA_JOB_STORE_AVAILABLE` is still `false`, so every statement below
> about MuAPI being undispatchable remains true.

---

## 1. Pre-flight

| Fact | Value |
| --- | --- |
| `origin/main` at start | `0d9f32fd28460804e91d311c00c41c310da367b4` (PR #168, Phase 2) |
| `origin/main` at finish | `e2e9819a01548a8c68710633d8b78179b0897152` |
| Local `main` | `900d600` (2 behind at start; untouched) |
| Working tree | clean; 55 pre-existing worktrees, none for media job work |
| Branch/worktree pre-existing? | No. Both created fresh. |
| Phase 3 work already present? | None. |

Ancestry verified on `origin/main`:

- PR **#164** `9e0c81b3` — reference fail-closed ✓
- PR **#166** `55274c3e` — Phase 1 canonical Asset ✓
- PR **#168** `0d9f32fd` — Phase 2 orchestrator ✓ (commit `098999ac` ✓)

**`origin/main` moved during implementation** — PR #170
(`fix/trading-market-data-instant-ordering`, commits `65ec78b`, `e2e9819`). It
touches five files, all under `lib/trading/`; overlap with this branch is
**zero**. Fast-forwarded (`merge --ff-only`), full suite re-run green afterwards.

Production Supabase (`iboepohjwrhtgshrqaol`) confirmed read-only: `assets`,
`asset_provenance`, `runs` and `workflow_action_reconciliations` all exist.
Phase 1's `media_asset_foundation` is applied. **No migration was applied by this
phase.**

### The pre-flight finding that changed the plan

`apps/web/scripts/check-migrations.mjs` runs inside `next build` on Vercel and
**fails the build, fail-closed**, for any migration in
`apps/web/supabase/migrations/` whose name is absent from the Supabase ledger.
Only a frozen grandfathered set is exempt.

So a "proposed but unapplied" migration file placed in the canonical directory
would break every production deploy until it was applied — converting a design
review into an outage. The proposed DDL therefore lives at
[`PHASE3_PROPOSED_SCHEMA.sql`](./PHASE3_PROPOSED_SCHEMA.sql), in `docs/`, where
it is inert.

---

## 2. Repository lifecycle audit

Searched for every existing concept of job, run, operation, execution, polling,
webhook, reconciliation, retry, idempotency, correlation id, UNKNOWN/PARTIAL,
timeout and cancellation — across Atlas, workflows, executive, connectors,
trading, background jobs and the media pipeline. What actually exists:

| Concept | Where | State |
| --- | --- | --- |
| Ambiguity semantics (`UNKNOWN`, dispatch boundary, retry policy) | `lib/workflows/action-outcome.ts` | **Canonical, pure, mature** |
| Reconciliation ledger + resolution rules | `lib/workflows/reconciliation.ts`, `20260830_action_failure_model.sql` | Canonical, workflow-bound |
| Durable run table, claim/lease/reaper | `public.runs`, `claim_runs`, `reap_stuck_runs` | Canonical, workflow-bound |
| Governed provider spend | `lib/cost/governed-spend.ts` | Canonical, already ambiguity-aware |
| Async remote job (Remotion Lambda) | `lib/media/lambda-render.ts`, `api/media/render/*` | Legacy, unsafe to copy |
| Blind timeout retry | `lib/media/retry.ts` | Legacy, unsafe around a dispatch |
| Async provider contract (`MediaJobRef`, `getStatus`) | `lib/media/providers/types.ts` | **Already async-shaped** |
| Webhook receipt/dedup infrastructure | — | **Does not exist** (Instagram + Stripe only, both vendor-specific) |

The decisive discovery is that Omnira has **already answered the hard question
once**. PR9d established that `FAILED` is a positive claim a timeout cannot
support, that `UNKNOWN` is first-class and terminal, and that an ambiguous
outcome is never retried. That is precisely the question a paid media generation
asks. Phase 3 therefore had a reuse decision to make, not a design to invent.

---

## 3. Provider async audit

Established **from repository evidence only** — the adapter's own code and
`docs/architecture/muapi-media-provider.md`. No live call was made and no
provider credit was spent.

**MuAPI** (`lib/media/providers/muapi.ts`), the only registered `MediaProvider`:

| Question | Answer | Evidence |
| --- | --- | --- |
| Dispatch shape | `POST /api/v1/{model}` → `{ request_id }` | `submit()` |
| Status shape | `GET /api/v1/predictions/{id}/result` → `{ status, outputs }` | `getStatus()` |
| Remote states | queued, pending, processing, completed, failed, cancelled → 4 normalized | `STATUS_MAP` |
| Result delivery | polling only | no webhook anywhere in adapter, config or docs |
| Client idempotency key | **none** | request body is model fields only; no key documented |
| Lookup by correlation id | **none** | no such endpoint integrated |
| Request/operation history | **none** | no such endpoint integrated |
| Cancellation | **none** | `cancelled` is a status found, not an action taken |
| Response typing | untyped upstream (`{}` in the OpenAPI doc) | adapter header |
| Dispatch idempotent? | **No, and unprovable** | no key, no correlation lookup |

Declared in code as `MUAPI_LIFECYCLE`, so the facts are checkable rather than
narrated, and asserted by test.

**The consequence, stated rather than engineered around:** if the response to
`POST /api/v1/{model}` is lost before a `request_id` is read, Omnira cannot name
the operation, and MuAPI offers no other way to find it. That dispatch is
**unreconcilable against the provider API**. §11 says what Phase 3 does instead.

If MuAPI's HTTP API *does* expose an operation-history endpoint, that is a fact
this repository does not contain. Establishing it needs the vendor's API
documentation; flipping `lookupByHistory` without that evidence would make a
control out of a guess.

**Other providers.** Ideogram and OpenAI are synchronous and reached through the
Phase 2 bridge — unchanged by this phase. Higgsfield and OpenArt appear in
`MediaProviderId` and in no registry; explicitly out of scope.

---

## 4. Reused infrastructure

**`DispatchObservation` from `lib/workflows/action-outcome.ts` — reused
verbatim, as a type-only import.**

This is the central reuse decision and it is deliberately partial:

- **Reused:** the vocabulary and the reasoning. `not_dispatched`,
  `remote_rejected`, `response_lost`, `remote_confirmed`, `partially_applied`,
  `confirmed_evidence_failed` mean here exactly what they mean there. The
  import being type-only means the vocabulary **cannot drift** — adding an
  observation upstream breaks this build via an exhaustive switch — while
  nothing from the workflow authority layer is pulled in at runtime.
- **Not reused:** the machinery. See §5.

Also reused, unchanged:

| Reused | For |
| --- | --- |
| `lib/media/asset/admission.ts` (Phase 1) | every byte that becomes an asset |
| `lib/media/asset/validate.ts` | MIME allowlist, magic numbers, size, SSRF |
| `lib/media/providers/gate.ts` | whether any outbound call may happen |
| `lib/media/orchestrator/eligibility.ts` | whether a candidate may be selected |
| `lib/cost/governed-spend.ts` | all spend (called by the adapter, never by the lifecycle) |
| `lib/workflows/reconciliation.ts` | the ledger's **shape** (append-only, binding-guarded, `STILL_UNKNOWN` → null) |

---

## 5. Rejected reuse candidates

| Candidate | Class | Why |
| --- | --- | --- |
| **`public.runs`** for media job rows | **C — incompatible authority** | `runs_action_binding_complete` is all-or-nothing: the ambiguity guard requires `workflow_instance_id`, `workflow_def_hash`, `workflow_from_state`, `action_kind`, `action_class`, `target_version_hash`, **`authorization_id`**, `idempotency_key`, `attempt_group` and `authorized_at`, all non-null. An article hero image has none. Supplying them would forge a human authorization in the ledger. |
| `public.runs` with `workflow_instance_id = NULL` | **C — actively unsafe** | Three independent reasons. (1) `runs_action_outcome_guard` returns early for such rows ("legacy run, untouched") — no outcome guard at all. (2) `reconciliation_binding_guard` **refuses** a reconciliation for them outright. (3) `reap_stuck_runs()` branch (b) **requeues** an expired running row — for a dispatched generation, a second paid call. |
| `ACTION_REGISTRY` / `createWorkflowActionRun` | **C** | The registry is closed and every entry is placed in a workflow definition + state, validated against vendored definitions. Media generation is not a workflow state. |
| `withGovernedSpend`'s `idempotencyKey` | **B — pattern, dormant** | Documented as deliberately unused: every retry wrapper sits *outside* the boundary, so a key would turn a retryable 503 into a spend refusal. Phase 3 does not activate it. |
| `lib/media/retry.ts` | **C — unsafe** | Blind timeout/backoff retry. Correct for an idempotent read, catastrophic around a paid creation. Guard-tested as un-importable from the lifecycle. |
| Remotion Lambda render lifecycle | **B — pattern only, with a warning** | A real async lifecycle, but ungoverned, un-admitted, with no UNKNOWN state, and its status route takes `bucketName` **from the query string** — the exact "caller supplies the result location" anti-pattern §21 forbids. Not copied. |
| Webhook infrastructure | **D — does not exist** | Only Instagram and Stripe, both vendor-specific. See §13. |

The summary: **reuse the reasoning, not the machinery.** Media borrows Omnira's
answer about ambiguity and none of the workflow authority wrapped around it.

---

## 6. Canonical job state machine

`lib/media/job/lifecycle.ts` — pure: no database, no clock, no network.

```
PENDING_DISPATCH ──► DISPATCHING ──┬──► QUEUED ──► RUNNING ──► SUCCEEDED
   (redispatch          ▲          │                      └──► FAILED
    is safe)            │          ├──► FAILED     (not_dispatched | remote_rejected)
                        │          └──► UNKNOWN    (response_lost | confirmed_evidence_failed
              THE AMBIGUITY                          | partially_applied)
                BOUNDARY
                                    UNKNOWN ──► SUCCEEDED | FAILED | RUNNING | QUEUED
                                        ONLY via a recorded reconciliation
```

Seven states, and the count is argued:

- `PENDING_DISPATCH` / `DISPATCHING` are separate because the boundary between
  them is the only thing that makes ambiguity decidable. Before it, a failure
  proves nothing was sent. After it, silence proves nothing at all.
- `QUEUED` / `RUNNING` have no workflow analogue — a workflow action is one
  call, a media job has a remote life — which is why this is a separate state
  set rather than a re-export.
- **No `RECONCILING`.** That describes what an operator is doing, not what the
  job is. A job under investigation is still `UNKNOWN`, and a second word for
  "we do not know" is one every reader has to remember.
- **No `PARTIAL`.** One image generation produces one output. `PARTIAL` is real
  for a multi-object workflow action; the case that could justify it here is
  `count > 1`, which Phase 3 does not dispatch (§18 refuses it at the QC
  boundary). A provider *claiming* partial creation maps to `UNKNOWN` — we
  cannot prove what exists, which is the definition.

Terminal states are absorbing. `SUCCEEDED` cannot become `FAILED`: a remote
success is a fact about the vendor, and later trouble is Omnira's problem,
reported as itself rather than by rewriting history. Nothing rewinds across the
boundary.

---

## 7. Operation identities

`lib/media/job/identity.ts`. Five identities, kept apart by the compiler.

| Identity | Minted by | Role |
| --- | --- | --- |
| `MediaJobId` | **Omnira, before any network call** | the durable handle |
| `RemoteOperationId` | the vendor | opaque, echoed, never parsed |
| `AssetId` | the database, at admission | canonical asset identity (§21.4) |
| orchestration/brief id | the caller | request correlation (Phase 2) |
| reservation id | `governed-spend` | spend identity |

`MediaJobId` and `RemoteOperationId` are branded types, as `AssetId` already is.

**Why the local id exists.** Keying a job on the vendor's `request_id` fails in
exactly the case this phase is about: when the response is lost there *is* no
vendor id, and the job still has to be recorded. A job Omnira cannot name is a
job Omnira cannot reconcile.

**The remote id is recorded, never routed on.** It reaches
`asset_provenance.provider_request_id` and nothing else. It never becomes an
asset id, a bucket, a path or a project. That is structural, not policed: Phase 1
mints the asset id *in the database* and derives the bucket from `visibility`, so
there is no argument a provider could supply that would name either.

`acceptRemoteOperationId` bounds it at 200 characters and refuses anything
outside `[A-Za-z0-9._:-]`. It **refuses rather than escapes** — an id needing
escaping is an id Omnira does not understand — which is the second, independent
layer behind `encodeURIComponent` against a vendor answer steering the status URL.

---

## 8. Dispatch semantics

`lib/media/job/dispatch.ts`. Four outcomes, as a discriminated union rather than
"a job ref or an exception" — the ambiguous case is a **result to persist**, not
an error to throw past, and modelling it as a throw is how it lands in a generic
catch beside the failures it must never join.

| | Outcome | Observation | State |
| --- | --- | --- | --- |
| A | `accepted` | `remote_confirmed` | `QUEUED` |
| B | `completed_inline` | `remote_confirmed` | `SUCCEEDED` |
| C | `definitely_failed` | `not_dispatched` \| `remote_rejected` | `FAILED` |
| D | `unknown` | `response_lost` \| `confirmed_evidence_failed` \| `partially_applied` | `UNKNOWN` |

Variant B exists so a genuinely synchronous provider is not dressed up as a
remote job with an invented id.

### The classification, and its asymmetry

The cost of being wrong is asymmetric: calling an ambiguous failure ambiguous
costs one manual check; calling it safe costs a duplicated paid generation and an
orphaned remote asset. So the allowlist is of failures that **prove** no
connection carried data, and **everything else defaults to ambiguous** —
including failures that are probably harmless.

| Signal | Verdict | Reasoning |
| --- | --- | --- |
| `ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, `EHOSTUNREACH`, `ENETUNREACH`, `ERR_INVALID_URL`, TLS handshake failures | **not sent** | every one is raised while establishing the connection, before a byte of body can be written |
| `ECONNRESET`, `ETIMEDOUT` | **unknown** | a reset can arrive during the handshake *or* after the request was written; nothing in the error distinguishes them |
| `AbortError` / deadline | **unknown** | the deadline fires on *our* side; the vendor has usually already received the request |
| HTTP 4xx (429 included) | `remote_rejected` | the vendor answered: it parsed the request and did no work |
| HTTP 5xx | **unknown** | a 502/504 usually comes from a gateway *in front of* a service that may already have accepted and begun billing |
| HTTP 2xx, unreadable/absent id | `confirmed_evidence_failed` | the vendor accepted it; what was lost is our ability to name it |

The strongest signal is **position, not inspection**: a refusal raised before
`fetch` is called — gate refusal, missing credential, unsupported capability — is
structurally pre-send. `classifyTransportFailure` covers only the narrow window
in which `fetch` itself throws.

---

## 9. UNKNOWN semantics

`UNKNOWN` means: **Omnira cannot prove whether a remote operation exists or what
state it is in.**

- It is **not** `FAILED`. `FAILED` is a positive claim that no output was
  produced; silence cannot support it.
- It is **terminal** — nothing automatic moves it.
- Its **only** exit is a recorded reconciliation, enforced in TypeScript
  (`isLegalMediaJobTransition`) and, in the proposal, in SQL (`media_jobs_guard`).
- It sets `reconciliation_required`, which the schema makes a CHECK constraint
  rather than a convention a caller can forget.
- **It never triggers a second generation.** Proven by test: the dispatch counter
  stays at 1.

An UNKNOWN dispatch leaves durable evidence even when the vendor never named the
operation: project, provider, model, brief hash, and `dispatch_started_at`. That
record is what a human reconciles against.

---

## 10. Retry classification

Four classes, because collapsing them is the bug — `catch (timeout) → dispatch
again` is a second paid generation.

| Class | Meaning | Automatic? |
| --- | --- | --- |
| `SAFE_REDISPATCH` | the remote operation definitely does not exist | only from `PENDING_DISPATCH` |
| `STATUS_RETRY` | retry the **read**, never the creation | yes |
| `RECONCILE` | creation may have succeeded; recover state, never dispatch | no |
| `UNSAFE_REDISPATCH` | any repetition could duplicate a paid generation | no |

| State | Class | Automatic |
| --- | --- | --- |
| `PENDING_DISPATCH` | `SAFE_REDISPATCH` | ✅ |
| `DISPATCHING` | `UNSAFE_REDISPATCH` | ❌ |
| `QUEUED` / `RUNNING` | `STATUS_RETRY` | ✅ |
| `SUCCEEDED` | `UNSAFE_REDISPATCH` | ❌ |
| `FAILED` | `SAFE_REDISPATCH` | ❌ — a **decision** |
| `UNKNOWN` | `RECONCILE` | ❌ |

`FAILED` is safe to redispatch in principle but is not automatic: the vendor
refused or the request never left, and in both cases something about the world
has to change first. Making it non-automatic is what stops a rejected prompt
becoming a retry loop that never succeeds and always bills.

`mayAutomaticallyDispatch()` is phrased as a positive permission, not a negative
check — `if (!isBlocked)` is the shape that acquires an exception, and an
exception here is a duplicated charge.

---

## 11. Reconciliation

`lib/media/job/reconcile.ts`. Read-only by construction: it asks one question,
records the answer, and never repairs, retries or deletes. It imports nothing
that could generate, and that is guard-tested.

| Result | Resolves to |
| --- | --- |
| `CONFIRMED_SUCCEEDED` | `SUCCEEDED` |
| `CONFIRMED_FAILED` | `FAILED` |
| `CONFIRMED_RUNNING` | `RUNNING` |
| `CONFIRMED_NOT_CREATED` | `FAILED`, and the only result permitting a fresh dispatch |
| `STILL_UNKNOWN` | **null** — the job does not move |

### The limitation, surfaced rather than hidden

Reconciliation needs a question the vendor can answer. MuAPI has exactly one, and
it requires the `request_id`:

- **Dispatch failed *after* an id was read** → **reconcilable**. The id is
  durable; the status endpoint can be asked.
- **Dispatch failed *before* an id was read** → **unreconcilable against the
  provider API.** `lookupByCorrelationId: false`, `lookupByHistory: false`,
  `clientIdempotency: false`.

In that case reconciliation returns `STILL_UNKNOWN` with blocker
`no_remote_identity` and **does not even call the provider** — there is no
question that could be asked. The job stays `UNKNOWN`, the durable evidence
stands, and a human decides.

This is a real, accepted limitation. Hiding it behind an automatic regeneration
would convert an operator's five-minute check into a duplicated charge plus an
orphaned remote asset — the precise outcome this phase exists to prevent.

What would remove it, in order of preference: a vendor idempotency key on create;
a lookup-by-correlation endpoint; an operation-history endpoint. All three are
vendor-side.

---

## 12. Polling

`lib/media/job/poll.ts`. Bounded **three ways at once**, with no path bounded by
none of them: a wall-clock deadline, a consecutive-read-failure budget, and an
abort signal. (Deadline only spins against a dead endpoint; failure budget only
waits forever on a stuck job.)

Defaults: 1.5 s initial delay (an image accepted 5 ms ago is never finished),
2 s interval growing ×1.5 to a 10 s cap, 90 s deadline, 4 consecutive read
failures. Backoff is gentle rather than exponential because these jobs finish in
tens of seconds and doubling would spend the budget asleep after the job was done.

`now` and `sleep` are injected, so every timing rule is asserted with a fake
clock rather than waited for.

**Four ways observation ends, and none of them is "failed":**

| Outcome | Meaning |
| --- | --- |
| `terminal` | the vendor gave a terminal answer — the only one that decides anything |
| `deadline_exceeded` | Omnira stopped waiting. The job is still running, still paid for |
| `aborted` | a caller cancelled the *wait*. Cancelling a poll cannot un-submit anything |
| `unobservable` | too many consecutive reads failed. The job is almost certainly fine |

Reporting the last three as failed generations is what would invite the "so retry
it" reflex. They surface as `timeout_waiting_for_terminal_state`,
`observation_cancelled` and `status_temporarily_unavailable`, all flagged
`resumable: true`.

A transient read failure never touches the job. Proven: two failed reads then a
success still yields exactly **one** dispatch.

---

## 13. Webhook decision

**Not implemented, and not scaffolded.**

1. **No evidence MuAPI supports one.** Nothing in the adapter, config or
   documentation mentions a callback. Building a receiver for a delivery that may
   not exist would be inventing a capability.
2. **No generic webhook infrastructure exists.** Only Instagram and Stripe, both
   vendor-specific. A MuAPI webhook is new infrastructure, not a small addition.
3. **Polling is sufficient to prove the lifecycle**, which is what this phase owes.

The lifecycle is nonetheless **webhook-ready**, and that cost nothing: a webhook
is just another *observer*. It would call `store.transition` with the same
compare-and-set the poller uses, so a duplicate delivery is a `version_conflict`
and a webhook racing a poller is the ordinary two-observer case already tested.

If one is ever built, the contract is fixed now: verify vendor origin per the
real contract; deduplicate; map to a local job **by stored remote id, never by
payload-supplied project or asset**; the payload chooses no asset id, no bucket,
no path; it cannot mark success before result validation and admission; repeated
delivery is safe. No unauthenticated endpoint.

---

## 14. Persistence decision — **required, and gated**

**Durable persistence is unavoidable.** The reasoning:

- Vercel functions end. That is the platform, not a failure mode.
- An `UNKNOWN` held only in a process is erased by the next cold start.
- Erased is indistinguishable from "never asked" — which is exactly the condition
  under which the next request regenerates and pays twice.
- Therefore the state that *most* needs to survive is the one an in-memory
  design loses first.

Polling across requests and any future webhook correlation need the same row.

`lib/media/job/store.ts` defines the port, with the concurrency rules encoded in
the interface (every state change is a compare-and-set) and an in-memory adapter
the tests drive. **There is deliberately no Supabase implementation** — a store
writing to a table that does not exist would fail in exactly the situation it
protects.

The DDL proposal is [`PHASE3_PROPOSED_SCHEMA.sql`](./PHASE3_PROPOSED_SCHEMA.sql):
`media_jobs` + append-only `media_job_reconciliations`, with state vocabulary and
ambiguity CHECK constraints, a `media_jobs_guard` trigger mirroring PR9d's
discipline (version must advance; no rewind past the boundary; terminal absorbing;
`UNKNOWN` exits only on a recorded reconciliation; remote id and asset binding
write-once), a binding guard on the ledger, owner-scoped **read-only** RLS with
service-role writes, and **no automatic retention** (an unresolved `UNKNOWN` is a
financial fact).

**Nothing has been applied. `DURABLE_MEDIA_JOB_STORE_AVAILABLE` is `false`, and
flipping it is the last step of enabling async media generation, not the first.**

---

## 15. Provider job interface

Three minimal changes. No second provider architecture; no new method beside
every existing one.

1. **`MEDIA_DISPATCH_UNKNOWN`** joins the closed error list.
2. **`MediaProviderErrorShape.dispatchObservation`** — what a failure *proves*
   about the remote side, for a call that creates something; `null` for reads.
   Carried on the failure that already travels rather than via a parallel
   `dispatchX()` beside every `generateX()`, which would be two ways to do one
   thing and would leave the old way silently unsafe. `retryable` answers "might
   the same call work next time" (about the network); this answers "may the same
   call be made again at all" (about money).
3. **`MediaProvider.lifecycle?: MediaLifecycleProfile`** — declared async facts.
   **Its absence is the discriminator for a synchronous provider**, so a sync
   provider is never dressed up as a remote job and never declares async methods
   it throws from.

`MediaProviderError`'s constructor **forces** `retryable: false` for
`MEDIA_DISPATCH_UNKNOWN` rather than trusting every construction site — a 5xx on
a create would otherwise derive `retryable: true` from its status and hand a
caller permission to pay twice.

---

## 16. Proof provider

**MuAPI is the correct proof provider**, and it proves four of the five things:

| Requirement | Status |
| --- | --- |
| dispatchable | ✅ `POST /api/v1/{model}` |
| observable | ✅ `GET /api/v1/predictions/{id}/result` |
| terminally resolvable | ✅ six vendor statuses → four normalized → three states |
| result-admittable | ✅ URL → Phase 1 `admitAssetFromUrl` |
| **ambiguity-reconcilable** | ⚠️ **only when an id was read** (§11) |

No new provider was added. MuAPI's genuine free sandbox (`is_test: true`, mock
outputs, never billed) means the lifecycle can be proven live at zero cost when
the store exists.

**MuAPI remains undispatchable** — but the reason has changed, and the change is
the deliverable. Phase 2 said "the async job lifecycle is not implemented". It is
implemented. `candidates.ts` now reports the actual blocker: no durable store.
Those have different fixes — one was engineering, the other is a decision — and
an operator reading the refusal is told which.

---

## 17. Asset admission

Unchanged from Phase 1 and Phase 2, and that is the point: `admitAssetFromUrl` is
the only way bytes become an asset, guard-tested.

**A provider's `completed` is not success.** Success requires: terminal vendor
success → output resolved → QC passed → admission succeeded → provenance
recorded. Only then does the caller hear success.

Provider success + admission failure surfaces as `asset_admission_failed` with
`dispatched: true`, and **is not regenerated** — the bytes exist; the problem is
ownership. The vendor's success stays recorded (`state = SUCCEEDED`,
`asset_id = null`), because rewriting the vendor's fact to describe Omnira's
problem would lose both.

The provider supplies a URL and nothing else: not the bucket (derived from
`visibility`), not the path (caller-built, re-validated), not the asset id
(minted by the database), not the project. Asserted directly against the
admission call.

---

## 18. QC boundary

`lib/media/job/qc.ts` defines the boundary and builds only the technical half.

**Technical validation (built):** output exists; expected media kind; exactly the
requested output count; retrievable `https` URL. Phase 1 owns everything after —
MIME allowlist, magic numbers, size ceiling, checksum, SSRF.

More outputs than requested is **refused, never trimmed**: silently taking the
first of three would mean Omnira paid for three generations, recorded one, and
left two orphaned remotely.

**Semantic/creative QC (declared, unimplemented, unable to act).**
`assessSemanticQuality()` returns `{ assessed: false }`. The contract is fixed now
while it is cheap: a semantic verdict is advisory in this phase, may not fail a
job, may not cause a dispatch, must not be the model that produced the output, and
runs *after* admission — Omnira must own the bytes before forming an opinion, or a
rejected opinion means a paid generation nobody kept.

---

## 19. Spend semantics — **no gap found**

Traced `withGovernedSpend`. Every Phase 3 question already has a correct answer:

| Question | Answer |
| --- | --- |
| When is spend reserved? | Before dispatch, by the adapter |
| Before dispatch? | Reserve → **fresh** stop check → dispatch. Nothing between the check and the call |
| Dispatch UNKNOWN? | **Settles.** Any throw that is not `ProviderNotDispatchedError` settles — "ambiguity is not a refund" |
| While polling? | Nothing. Polling is a read and is never wrapped |
| Provider reports failure? | Already settled at dispatch. MuAPI accepted and may have charged |
| Admission fails? | Already settled. Correct — the generation happened |
| Settlement basis | Provider **acknowledgement**, not local asset success |
| Can UNKNOWN release? | **No**, and must not |

**`withGovernedSpend` already represents UNKNOWN safely.** Its default for an
unrecognised failure is to settle, and only `ProviderNotDispatchedError` — a
claim an adapter has to be able to defend — releases. No stop gate fired.

**The new answer Phase 3 supplies is the boundary's shape for an async provider:
the governed wrapper encloses the dispatch only.** Polling must never be wrapped
— that would take a fresh reservation per status check, dozens per image, any of
which could refuse and abandon a generation already paid for. `run.ts` receives
`dispatch` already governed and `observe` ungoverned, and the types say so.

Guard-tested: no lifecycle module imports `withGovernedSpend`, `reserveSpend`,
`settleSpend`, `releaseSpend` or `budget-gate`. **No second spend system.**

### Adjacent finding (pre-existing, not fixed here)

`generateIdeogramV3` and `generateIdeogramLegacy` wrap `fetch` in
`catch (e) → ProviderNotDispatchedError('never reached the provider')`. A `fetch`
rejection does **not** prove that: a reset after the body was written throws
identically. The claim is over-broad, so a possibly-billed call can release its
headroom. Bounded (over-spend against budget, not a duplicate charge), on a
*synchronous* adapter, and out of Phase 3's scope — but it is the exact
anti-pattern this phase removed from MuAPI, and it is recorded here rather than
silently carried.

---

## 20. Concurrency semantics

Claimed: **at most one local terminal transition, over potentially at-least-once
observations.** Not exactly-once — nothing here can promise that.

Every state change is a compare-and-set on `version`. Two observers reading the
same version: one write succeeds, the other gets `version_conflict`, re-reads and
finds the job already terminal. No lock, no lease, no coordination — and
deliberately **no in-memory mutex**, which in serverless code is a comment that
looks like a control.

Threat-modelled and covered by test:

| Scenario | Behaviour |
| --- | --- |
| Two pollers on one job | one terminal transition wins; the loser conflicts |
| Webhook + poller together | same case (webhook would use the same CAS) |
| Duplicate admission | second, different asset id → `already_admitted`; the first binding stands |
| Rebinding a remote id | write-once; a later different id is ignored |
| User retries while UNKNOWN | `classifyMediaRetry` → `RECONCILE`, non-automatic |
| Crash mid-poll | every observed state change is persisted as it happens |
| Crash mid-dispatch | the `DISPATCHING` row was written **before** the wire |

The in-memory adapter cannot be mistaken for production: it holds a `Map`, so on
Vercel every invocation starts empty — which is why the candidate stays
undispatchable until the durable store exists.

---

## 21. Security

| Threat | Control |
| --- | --- |
| Forged / hostile remote id | bounded to 200 chars, `[A-Za-z0-9._:-]` only, **refused not escaped**; second layer behind `encodeURIComponent` |
| Remote id → path traversal | `/` and `..` cannot appear; the adapter builds the status URL from a route template |
| Arbitrary status/result endpoint | callers pass **no URL**. The adapter constructs `/api/v1/predictions/{id}/result` |
| Cross-project job access | jobs are project-owned; `listUnresolved` is project-scoped; RLS owner-scoped |
| Provider payload claiming a project | admission is told the *job's* project; a provider-supplied `projectId` is ignored (tested) |
| Provider choosing asset id | id is minted in the database; no argument could name it |
| Provider choosing bucket/path | bucket derived from `visibility`; path is caller-built and re-validated |
| SSRF via result URL | Phase 1 `assertSourceUrlTrusted` before the fetch; QC additionally requires `https` |
| Oversized response | Phase 1 `MAX_BYTES` per kind; 30 s retrieval timeout |
| Malicious MIME | allowlist + magic-number match; extension derived from validated bytes |
| Secret leakage | `MediaProviderError` redacts in its constructor; route templates not URLs; only hashes persisted |
| Third-party text as instruction | brief payload never persisted — only `brief_hash` (tested) |
| Owner clearing an UNKNOWN by hand | RLS is `for select` only; all writes service-role |

`api.muapi.ai` is not in the `governance-provider-boundary` FORBIDDEN list, so no
sanctioned-file allowlist needed widening. The lifecycle names no hostname and
constructs no provider — guard-tested.

`MUAPI_BASE_URL` remains env-overridable (pre-existing). Operator-controlled, not
caller-controlled; noted, not changed.

---

## 22. Observability

The durable record *is* the observability surface: local job id, project,
provider, model, state, remote operation id, `simulated`, brief hash, asset id,
failure code + redacted detail, `reconciliation_required`, and four timestamps
(`created_at`, `dispatch_started_at`, `remote_confirmed_at`, `terminal_at`).

The reconciliation ledger adds attempt count, result, blocker and structured
detail.

Deliberately absent: credentials, raw provider responses, base64 payloads, prompt
or brief text. `detail` is "structured and safe by contract — ids, counts,
states", the same rule PR9d applied to `side_effect_summary`.

---

## 23. Tests

`lib/qa/media-job-lifecycle.test.ts` — **70 tests**. No network, no Supabase, no
provider. Dispatch is a counted fake, so "how many times did Omnira try to create
something" is asserted, not trusted. Polling uses an injected clock.

All 25 required proofs:

| # | Proof | Result |
| --- | --- | --- |
| 1 | async dispatch stores a canonical local job identity | ✅ (+ it exists *before* the wire) |
| 2 | remote operation id ≠ asset id | ✅ all three identities distinct |
| 3 | queued → running → succeeded maps correctly | ✅ |
| 4 | remote failure maps correctly | ✅ no admission |
| 5 | completed + invalid result ≠ success | ✅ empty / wrong kind / bad URL / wrong count |
| 6 | completed + admission failure ≠ success | ✅ and not regenerated |
| 7 | polling read failure ⇏ redispatch | ✅ dispatch count stays 1 |
| 8 | definite pre-send failure retryable only if proven | ✅ only connect-stage codes |
| 9 | ambiguous dispatch → UNKNOWN | ✅ reset/timeout/abort/5xx/2xx-no-id |
| 10 | UNKNOWN ⇏ second generation | ✅ dispatch count stays 1 |
| 11 | reconciliation recovers UNKNOWN | ✅ → SUCCEEDED / FAILED / RUNNING |
| 12 | unresolved UNKNOWN stays unresolved | ✅ and the provider is not even asked |
| 13 | duplicate observation ⇏ duplicate admission | ✅ `already_admitted` |
| 14 | two workers ⇏ conflicting terminal transitions | ✅ exactly one wins |
| 15 | required-reference invariant fail-closed | ✅ PR #164 intact |
| 16 | provider cannot choose asset id | ✅ |
| 17 | provider cannot choose bucket/path | ✅ |
| 18 | cross-project job access rejected | ✅ |
| 19 | arbitrary status/result URL rejected | ✅ non-https refused; caller passes no URL |
| 20 | no duplicate spend wrapper | ✅ source-scan guard + regression |
| 21 | no automatic cross-provider failover | ✅ no provider construction in the lifecycle |
| 22 | synchronous Phase 2 providers still work | ✅ bridge untouched |
| 23 | article hero proof path green | ✅ |
| 24 | Phase 1 asset tests green | ✅ |
| 25 | PR #164 regression suite green | ✅ 24/24 |

**Results**

```
lib/qa/media-job-lifecycle.test.ts     70 passed
Full repository suite         220 files, 6697 passed, 0 failed
tsc --noEmit                  clean
```

### Two Phase 1 assertions were deliberately inverted

Both in `muapi-media-provider.test.ts`, and both are the safety fix rather than a
regression:

1. *"a 2xx without request_id is a typed response error"* asserted
   `MEDIA_PROVIDER_RESPONSE_INVALID` — "the vendor sent junk", which reads as a
   caller-side fault and invites a retry. It is the opposite: a 2xx means MuAPI
   **accepted** the request. Now `MEDIA_DISPATCH_UNKNOWN` /
   `confirmed_evidence_failed`. A companion test keeps the original assertion for
   the **read** path, where the question does not arise.
2. *"a network throw becomes a retryable typed error"* asserted
   `retryable: true` for a generation. That was the most expensive default in the
   adapter: a reset can arrive after the body was written, so "retry me" is
   permission to pay twice. Retryability now splits by what the call *does* —
   still `true` for a read, `false` for an ambiguous creation, `true` for a
   connect-stage failure that proves nothing was sent.

---

## 24. Exact files changed

**New — the lifecycle (8 files, `apps/web/lib/media/job/`)**

| File | Purpose |
| --- | --- |
| `lifecycle.ts` | state machine, dispatch→state, retry classification (pure) |
| `identity.ts` | the five identities; remote-id acceptance (pure) |
| `dispatch.ts` | dispatch result union; transport/status classification (pure) |
| `poll.ts` | bounded observation, injected clock (pure) |
| `qc.ts` | technical QC; semantic boundary declared only (pure) |
| `store.ts` | durable store port, CAS rules, in-memory adapter, availability flag |
| `reconcile.ts` | read-only ambiguity resolution + MuAPI's declared capability |
| `run.ts` | the sequence: record → dispatch → classify → observe → validate → admit |

**New — tests and docs**

- `apps/web/lib/qa/media-job-lifecycle.test.ts` (70 tests)
- `docs/architecture/media-runtime/PHASE3_RESULT.md` (this file)
- `docs/architecture/media-runtime/PHASE3_PROPOSED_SCHEMA.sql` (**not** a migration)

**Modified (5 files, +287 −27)**

| File | Change |
| --- | --- |
| `lib/media/providers/types.ts` | `MEDIA_DISPATCH_UNKNOWN`; `dispatchObservation` on the error shape; `MediaLifecycleProfile` |
| `lib/media/providers/errors.ts` | carry `dispatchObservation`; force ambiguous creations non-retryable |
| `lib/media/providers/muapi.ts` | `creates: true` classification on the create path; `MUAPI_LIFECYCLE`; 2xx-no-id → UNKNOWN |
| `lib/media/orchestrator/candidates.ts` | dispatch reason derived from store availability, not a stale sentence |
| `lib/qa/muapi-media-provider.test.ts` | two assertions inverted (above) + 3 new |

**No migration applied. No production change. No deploy. No provider credit spent.**

---

## 25. Known limitations

1. **An id-less ambiguous dispatch is unrecoverable against MuAPI's API.** The
   central limitation (§11). Mitigated by durable evidence and a human, never by
   regeneration.
2. **MuAPI is still not dispatchable.** Blocked on §14's schema approval.
3. **No Supabase store implementation.** Deliberate — see §14.
4. **No webhook.** No evidence MuAPI supports one (§13).
5. **No cancellation.** Not integrated, and `cancelled` is a status found, not an
   action taken.
6. **No Model Registry.** `modelHintFor()` still returns `muapi:unspecified`; a
   real model choice is a spend decision this phase does not make.
7. **Multi-output (`count > 1`) is refused, not supported.** Refusing is correct
   for now; supporting it would need `PARTIAL`.
8. **Reference support unchanged.** MuAPI candidates still declare
   `supportsReferenceImages: false`, so PR #164 fails closed against them —
   correct, and it stays that way until a specific model is proven capable.
9. **Ideogram's `ProviderNotDispatchedError` over-claim** (§19), pre-existing.
10. **Redirects are not re-validated** during admission retrieval — Phase 1's
    known gap, unchanged.

---

## 26. Relationship to the `media_orchestrator` prerequisite

**Do not remove it. The prerequisite is closer, not satisfied.**

The canonical definition requires model/resource selection, job lifecycle across
polling and/or webhooks, and a retry/QC loop.

| Component | Before | After |
| --- | --- | --- |
| model/resource selection | ❌ `muapi:unspecified` | ❌ unchanged |
| job lifecycle (polling) | ❌ | ✅ **built and tested** |
| job lifecycle (webhooks) | ❌ | ➖ ready, not built (§13) |
| retry loop | ❌ | ✅ **built** — four classes, ambiguity never retried |
| QC loop | ❌ | ◐ technical built; semantic declared only (§18) |

Phase 3 closed the job-lifecycle portion, as intended. Model selection is
untouched and semantic QC is a boundary, not an implementation.
`MEDIA_GENERATION_UNMET_PREREQUISITES` is unchanged in this branch.

---

## 27. Phase 4 recommendation

**Phase 4 — Durable Media Job Persistence + First Sandbox Proof.** Small,
bounded, and the only thing standing between this lifecycle and a working one:

1. Approve §14's schema; create the migration and apply it **in one motion** (the
   build guard makes any other order an outage).
2. Implement the Supabase `MediaJobStore` against the existing port — the
   interface and its concurrency rules are already proven.
3. Wire `withGovernedSpend` around the MuAPI dispatch **only**, with a MuAPI rate
   in `cost_rates`.
4. Choose one real MuAPI image model (the smallest honest Model Registry).
5. Flip `DURABLE_MEDIA_JOB_STORE_AVAILABLE`; prove the whole path end-to-end **in
   MuAPI test mode** — free, mock outputs, never billed. Verify via balance delta,
   not `last_used_at`.
6. Add an operator surface for unresolved jobs (`listUnresolved` already exists).

Explicitly **not** Phase 4: webhooks, semantic QC, video/audio, a general Model
Registry, cross-provider failover, new providers.

---

## 28. GO / NO-GO

### GO

No stop gate fired:

- ✅ A remote migration was **not** required for meaningful progress — the
  lifecycle is complete and tested behind a port.
- ✅ Spend semantics **already** represent UNKNOWN safely; no change needed.
- ✅ MuAPI **can** distinguish ambiguous dispatch outcomes sufficiently for safe
  retry — because the safe answer is "never retry automatically", which is
  implemented and tested. Its reconciliation *limit* is surfaced, not hidden.
- ✅ PR #164 not weakened — verified by its own 24-test suite.
- ✅ No provider-architecture rewrite: 3 minimal contract additions, no new method.
- ✅ Reuse decision resolved on structural evidence, not taste.
- ✅ No provider was live-called; no credit spent; no secret exposed.

**Task 22 classification: B** — local persistence required, implemented and
tested without a remote migration.

Stopped before commit and merge, as instructed. **Awaiting approval of §14 before
any database change.**
