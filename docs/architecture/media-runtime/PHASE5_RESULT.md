# OMNIRA MEDIA RUNTIME — PHASE 5 RESULT

**Governed Provider Dispatch**

**Branch:** `feat/omnira-media-governed-dispatch` · **Worktree:** `.worktrees/omnira-media-governed-dispatch`
**Originally based on:** `origin/main` @ `1ebaf42098f6694e2ebe6e4ac2d3794f4a7737ef` (PR #171)
**Integrated onto:** `origin/main` @ `d31ae938ca177d15f4341f894c5f0a53d2df11cb` (PRs #172, #173 — trading and workflow-bundle, disjoint)
**Date:** 2026-09-03

---

## Result

**PASS for architecture. NO-GO for activation.**

The execution seam Phase 4 named is built: a `MediaProvider` is now wired into
`runMediaJob` with `withGovernedSpend` around the dispatch alone. Nothing is
switched on. **This merge does not activate MuAPI**, and two independent
blockers keep it that way — a missing credential and an unproven price. They
need different fixes and neither is a code change.

| Check | Outcome |
| --- | --- |
| Typecheck (`tsc --noEmit`) | clean |
| Full suite (`vitest run`) | **230 files, 6964 tests, all passing** |
| New tests | **58** (`lib/qa/media-governed-dispatch.test.ts`) |
| Migration authored or applied | **none** |
| Credential configured or added | **none** |
| Live or sandbox provider call | **none** |
| Credits spent | **0** — MuAPI balance unchanged at $0.00 USD |
| `DURABLE_MEDIA_JOB_STORE_AVAILABLE` | **false** (unchanged) |
| `MEDIA_GENERATION_AUTONOMOUS_EXECUTION` | **false** (unchanged) |
| Licence status / autonomy level | **draft / L0** (unchanged) |
| `media_orchestrator` prerequisite | **still unmet** |

---

## What was built

`apps/web/lib/media/dispatch/governed-dispatch.ts` — `runGovernedProviderJob()`.

```
orchestrator selects a candidate (+ its concrete model)
     ↓
┌──────────── withGovernedSpend ────────────┐
│  provider.generateImage() → MediaJobRef   │   ← the only billable act
└───────────────────────────────────────────┘
     ↓ classified into MediaDispatchResult
runMediaJob → durable record → poll → QC → Phase 1 admission
```

It creates no second abstraction. Every primitive is imported: `MediaProvider`,
`MediaDispatchResult`, `runMediaJob`, `MediaJobStore`, `pollMediaJob`,
`checkTerminalResult`, `admitAssetFromUrl`, `withGovernedSpend`.

### Why it does not live in `lib/media/job/`

`media-job-lifecycle.test.ts` guards that directory with an exact rule: no
lifecycle module may name a spend boundary, a retry wrapper, or a provider
constructor. The first draft of this adapter was placed there and failed that
guard. The guard is right — the lifecycle's value is that it decides an ORDER
and cannot decide a PAYMENT — so the **file moved**; the guard was not relaxed.

---

## Model identity

`apps/web/lib/media/providers/resources.ts` — a closed list of **two** MuAPI
resources, selected by `MUAPI_IMAGE_MODEL`.

- **`muapi:unspecified` is not executable.** A candidate without a concrete
  resource is `dispatch.supported: false` and is rejected before ranking.
- **There is no default model.** An unset selector refuses. A default model is a
  default spend.
- **The env var selects, it cannot define.** An unknown or path-like value
  (`../../etc/passwd`) is refused, never posted.
- **Not a global Model Registry.** Provider-local, no ranking, no quality score,
  no cross-provider entry. Two resources only — `flux-schnell`, `flux-dev`.
- **No descriptor claims reference support.** Both are `false`, sourced from the
  vendor's own `Text to Image` vs `Image to Image` category split.
- The actual provider and model reach `asset_provenance` and the run result.

### Vendor facts and where they came from

`GET https://api.muapi.ai/api/v1/models` — public, unauthenticated, read
2026-09-03. 655 models. Two properties were verified across **all** of them:

- `endpoint === "/api/v1/" + name`, zero exceptions — which is what makes the
  adapter's existing path construction correct rather than assumed.
- `cost_currency` is USD throughout.

---

## Cost governance

**Paid MuAPI execution is refused.** Both shipped resources carry
`costRateKey: null`, so a billable candidate is rejected before ranking under a
new eligibility rule, `cost_governance_unavailable`.

The vendor lists `flux-schnell` at 0.003 USD and `flux-dev` at 0.015 USD, and
marks both `dynamic_pricing: true` — the vendor stating that the listed number is
not the charge. The authoritative figure comes from
`/api/v1/models/{name}/estimate-cost`, which needs a credential Omnira does not
hold. **No price was invented, and no `cost_rates` row was added.** The listed
figures are recorded as `listedUsdPerImage` for evidence and are read by exactly
one thing: the text of the refusal message.

**Sandbox uses zero, truthfully.** When the runtime provider status reports
`billable: false`, the estimate is `0` with basis `non_billable_sandbox`. That is
the true figure — a sandbox key returns mock output and is never charged, and
`config.ts` structurally cannot hand a test-mode caller the production key. The
reservation is still taken, so **project resolution and the G3C-1 stop check bind
a free generation exactly as they bind a paid one**.

A billable path is deliberately **not** a branch in `estimateImageSek`: that
function's shape is `rate ?? <constant>`, and a MuAPI branch would have required
a fabricated fallback constant.

### One defect found and fixed during this phase

The first implementation resolved MuAPI configuration **twice** — once through
the router, once locally — which can disagree. A test caught it. `describe()`
now surfaces `billable`, which `decideMediaExecution` had always computed and
thrown away. One evaluation, one answer; `resolveMuapiConfig`/
`decideMediaExecution` are called only by the provider itself.

---

## Dispatch and UNKNOWN

Exactly **one** provider create call site exists in all runtime source, and a
runtime invariant check throws if a single job ever dispatches more than once.

| Failure | Classification | Job state | Budget |
| --- | --- | --- | --- |
| proven never sent | `definitely_failed` / `not_dispatched` | FAILED | released |
| vendor 4xx | `definitely_failed` / `remote_rejected` | FAILED | released |
| socket reset, timeout, 5xx | `unknown` / `response_lost` | **UNKNOWN** | **settled** |
| 2xx, id unusable/missing | `unknown` / `confirmed_evidence_failed` | **UNKNOWN** | **settled** |

`ECONNRESET` and generic 5xx are **never** assumed safe. Ambiguity is not a
refund. UNKNOWN never redispatches: it is terminal, `reconciliationRequired` is
set, and `classifyMediaRetry('UNKNOWN')` is `RECONCILE`.

### The spend-refusal ordering

If `withGovernedSpend` refuses before `run()` — a budget refusal or a stop — the
adapter does **not** throw out of `dispatch()`. A throw would escape
`runMediaJob` between its `DISPATCHING` transition and its outcome transition,
stranding the row in the one state meaning "a request is outstanding" for a call
that provably never happened. Instead the refusal is classified as
`not_dispatched`, the row lands correctly in FAILED, and the original
`SpendRefusedError` / `ExecutionStoppedError` is then re-thrown to the caller so
the reason is not lost. Both directions are tested.

---

## Boundaries proven structurally

The `withGovernedSpend(...)` call in `governed-dispatch.ts` encloses exactly one
thing. Counted inside the wrapper: 1 × `generateImage`, and **zero** of
`getStatus`, `pollMediaJob`, `runMediaJob`, `admitAsset*`, `recordReconciliation`,
`checkTerminalResult`, or any store write. The module does not import
`lib/media/retry`.

Required reference remains fail-closed (PR #164): every MuAPI candidate is
excluded under `reference_unsupported` when `referenceRequirement: 'required'`,
an empty eligible set refuses, and there is no cross-provider failover on any
path. A provider still cannot choose the project, asset id, bucket or path.

---

## Structural guards

Two guards were extended **narrowly**, and both got stronger:

- `execution-contract-propagation` — sanctioned `withGovernedSpend` callers 4 → 5.
  Still an exact closed list asserted with `toEqual`; a sixth caller fails.
- `muapi-media-provider` — "no call sites exist" became "**exactly one** governed
  module calls a generation method", plus two new assertions: no route/cron
  caller, and the create sits inside the spend wrapper while `getStatus` does not.
  One test became three.

Both were falsified during review: a planted second caller fails 3 assertions
across the two files; removing it restores green.

---

## What this phase does NOT do

- Does **not** activate MuAPI. The runtime gate stays closed.
- Does **not** flip `DURABLE_MEDIA_JOB_STORE_AVAILABLE`. That flag means "may be
  dispatched **in this deployment**", and Phase 4 wrote its flip condition as
  "the adapter exists **and can be exercised**". The adapter exists; it cannot be
  exercised, because no MuAPI credential is configured in any Omnira environment
  — not in `apps/web/.env.local`, and not in Vercel production, preview or
  development. The blocker text was rewritten to say so; the old text claimed no
  adapter existed, which is now false and would send someone to build one twice.
- Ships **no semantic QC**. `assessSemanticQuality()` still returns
  `not_implemented`. Technical QC only.
- Ships **no webhook observation**. Polling only.
- Adds **no migration**, **no credential**, and makes **no provider call**.

---

## `media_orchestrator` prerequisite — still UNMET

Against its canonical definition ("model selection across ~765 endpoints, job
lifecycle across polling or webhooks, and the retry/QC loop"):

| Component | State after Phase 5 |
| --- | --- |
| Model selection | **Partial** — operator-configured choice among 2 of 655. No intent→model mapping. |
| Job lifecycle | Polling: **yes**. Webhooks: **no**. |
| Retry / QC loop | **Partial** — retry classification and technical QC. No semantic QC, and no QC→regeneration loop (deliberately prohibited). |

`MEDIA_GENERATION_UNMET_PREREQUISITES` is unchanged. Nothing became met.

---

## Phase 5B activation blockers

1. **No MuAPI credential in any Omnira environment.** An operator act. Until
   then the provider gate resolves `disabled` and refuses every outbound call,
   including a health check.
2. **No authoritative MuAPI price.** Needs a real figure plus a `cost_rates` row
   plus a `costRateKey` on the descriptor. Until then paid dispatch is refused by
   `cost_governance_unavailable`, independently of blocker 1.
3. **`lib/article/hero-image.ts` wraps `orchestrateImageGeneration` in
   `withRetry({attempts: 2})`.** Its default permanence heuristic matches HTTP
   status digits in the message text, so a `MediaJobError` carrying
   `failure: 'dispatch_unknown'` would not be seen as permanent and the whole
   orchestration would run a **second time** — a second job and a second
   dispatch for a generation that may already exist and may already have been
   billed.

   **Unreachable today**, because the provider-layer candidate is never selected
   while `DURABLE_MEDIA_JOB_STORE_AVAILABLE` is false, and the bridge adapters
   are synchronous and produce no UNKNOWN state. It becomes reachable the moment
   that flag flips, so it is recorded here rather than fixed opportunistically in
   this PR. **It must be closed before the flag flips.**
