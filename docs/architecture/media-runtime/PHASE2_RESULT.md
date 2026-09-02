# OMNIRA MEDIA RUNTIME — PHASE 2 RESULT

**Canonical Media Orchestrator**

**Branch:** `feat/omnira-media-orchestrator` · **Worktree:** `.worktrees/omnira-media-orchestrator`
**Base:** `origin/main` @ `55274c3eacc968d229472b85c2ecdd941ca8bf65`
**Date:** 2026-09-02

Foundation-completing, not provider-adding. No new provider, no schema change,
no migration, nothing deployed, nothing committed.

---

## 1. Pre-flight

| Reading | Value |
| --- | --- |
| `origin/main` | `55274c3eacc968d229472b85c2ecdd941ca8bf65` |
| local `main` | `ef48afb` (behind; not used — branched from `origin/main`) |
| Branch HEAD at start | `55274c3` |
| `git status` | clean |
| PR #164 (`9e0c81b`) on main | **present** |
| PR #166 (`55274c3`) on main | **present** |
| `feat/omnira-media-runtime` after merge | still exists, local and remote (merged, not deleted) |
| `feat/omnira-media-orchestrator` | did not exist — created |
| Disk | 8.3 GB free |

---

## 2. Current media execution map

Every live image path, traced from source before any code was written.

| # | Path | Entry | Provider reached | Class |
| --- | --- | --- | --- | --- |
| 1 | **Article hero (brief-driven)** | `lib/article/hero-image.ts` | Ideogram via `image-client` | **B → now orchestrated** |
| 2 | Article hero (writer fallback) | same file, `generateNewsImage` | Ideogram | B — spend-governed, Asset-admitted, **not** orchestrated |
| 3 | Scene images | `/api/media/images/generate` → `lib/media/ideogram.ts` | Ideogram | **C + D** |
| 4 | Media pipeline intro | `app/api/media/pipeline/intro/route.ts:163` | Ideogram, direct | **C + D** |
| 5 | Familje saga / activity / coloring | `lib/ai/runner.ts` | OpenAI edit + generate, Ideogram legacy | **C + D** |
| 6 | MuAPI provider layer | `lib/media/providers/router.ts` | MuAPI | **B** — allowed in principle, **not dispatchable**; excluded before ranking |
| 7 | Voice / audio | `lib/media/elevenlabs.ts` | ElevenLabs | E — out of scope |
| 8 | Remotion video | `lib/media/lambda-render.ts` | composition, not generation | E — out of scope |

*A = provider-layered · B = provider-layered but not orchestrated · C = direct
provider call · D = not canonically Asset-admitted · E = legacy / out of scope.*

### Candidate classification (hardening review)

Every candidate that can reach the filter, before and after:

| Candidate | Before hardening | After hardening |
| --- | --- | --- |
| **Ideogram** (`url`) | A — eligible, dispatchable, admittable | **A**, unchanged |
| **OpenAI** (`url`) | A | **A**, unchanged |
| **OpenAI** (`b64_json`, its *normal* output) | **C — selectable, then rejected as `PROVIDER_RESULT_INVALID`** | **A** — decoded and admitted as bytes |
| **MuAPI** (provider layer) | **B — described as eligible-if-enabled, then undispatchable** | **B**, and now *rejected before ranking* as `execution_not_supported` |

Both defects were real. Before hardening, MuAPI was rejected only as
`not_configured`; the moment someone enabled it, it would have passed eligibility,
won ranking, and failed at dispatch — after a selection had been made. And
OpenAI's *normal* response shape was a knowingly-rejected representation.

**Neither B nor C is called eligible any more.**

### The finding that shaped this phase

> **The existing provider router has zero production consumers and can only ever
> reach MuAPI, which is disabled by default. The two providers that actually
> generate images — Ideogram and OpenAI — are not `MediaProvider`s at all.**

Verified, not assumed: `grep` for `media/providers/` across runtime source returns
only a status-read in `media-generation.ts` and two doc comments. Nothing calls
`resolveProviderFor`. `describeMediaGenerationCapability` has no callers either.

So an orchestrator that selected *only* through `resolveProviderFor()` would see
exactly one candidate, find it disabled, and fail closed on every request —
correct for an empty eligible set, and useless as a proof, because it would also
break the live article-hero path.

---

## 3. Chosen orchestrator seam

**`apps/web/lib/media/orchestrator/`** — the Phase 0 hypothesis, re-verified
against current main and confirmed. `lib/atlas/capability/media-generation.ts`
has listed `media_orchestrator` in `MEDIA_GENERATION_UNMET_PREREQUISITES` since
it was written; this is that entry.

```
lib/media/orchestrator/
  types.ts        the brief, the result, the closed rule and failure sets
  candidates.ts   what Omnira can actually reach today
  eligibility.ts  filterEligible(...) → rankEligible(...)
  orchestrate.ts  the sequence
```

### Why a bridge instead of wrapping Ideogram/OpenAI as `MediaProvider`s

Considered and rejected, for a reason that survives inspection:
`governance-provider-boundary.test.ts` locks the set of files permitted to name a
provider hostname to **exactly four**, and asserts the list is exactly those four.
A `MediaProvider` implementation for Ideogram would either need that guard
widened — weakening a deliberately locked G1 invariant — or would delegate
straight back to `image-client.ts` anyway.

The delegation is the honest minimum, so `candidates.ts` does it directly and says
so. `family: 'bridge'` is expected to shrink to zero: each adapter that moves
behind `MediaProvider` deletes one entry, and the day it is empty that file
becomes a thin read of the router.

**It is not a second router.** For the `MediaProvider` family it *asks*
`describeMediaProviders()` and reports what the router and `gate.ts` already
decided. It adds no provider, credential, endpoint, or capability.

---

## 4. Responsibility boundaries

The orchestrator owns exactly one thing: **the order in which existing
authorities are consulted, and the guarantee that ranking never widens what they
allowed.**

| Concern | Owner | Orchestrator's role |
| --- | --- | --- |
| Spend / budget | `withGovernedSpend`, inside the adapters | calls an adapter; never reserves |
| Stop authority | `ExecutionContract`, resolved by those adapters | passes it through, never defaults it |
| Provider gate | `lib/media/providers/gate.ts` via the router | reads the answer |
| Capability licence | `lib/atlas/capability/media-generation.ts` | reads it as the outermost rule |
| Asset admission | `lib/media/asset/admission.ts` (Phase 1) | calls it; never writes storage itself |
| Storage placement | `BUCKET_FOR_VISIBILITY` (Phase 1) | passes a path; **cannot pass a bucket** |

`withGovernedSpend` is not imported by any file in the directory — asserted by a
test on imports, not on prose.

---

## 5. Orchestration input

`MediaGenerationBrief`. Note what it **cannot** express: no endpoint, no
credential, no bucket, no asset id, no budget override, no "skip approval".

| Field | Why it earns its place |
| --- | --- |
| `projectId`, `execution` | required by every governed adapter already; never defaulted |
| `invocation` | **REQUIRED.** `mission` (licence applies, in full) or `internal-application` with a caller from a **closed union**. A classification, not a waiver — see §6 |
| `mediaType`, `operation`, `agent` | `operation` is already required for `cost_events` attribution |
| `brief: { instruction, avoid }` | §20.28 — a Brief is not a prompt. Two fields every current caller already produces |
| `aspectRatio`, `visibility` | real, used by the proof path; `visibility` defaults to `internal` |
| `referenceAssetIds` | **canonical ids only** — never a URL, never a bucket/path |
| `referenceRequirement` | makes reference support an *eligibility* constraint |
| `quality`, `providerPreference` | ranking hints; neither widens eligibility |
| `storagePath` | stem only — no bucket, no extension |
| `providerOptions` | per-candidate escape hatch, same name/shape as `MediaRequestBase.providerOptions` |
| `sourceBrief` | hashed into provenance; payload never stored |

`providerOptions` is **keyed by candidate** deliberately: a flat record would send
Ideogram's `style_type` to OpenAI the moment ranking picked a different winner.
It reaches the provider request *body* only — the governance context is assembled
from the brief's own fields, which a test proves by attempting to forge
`project`, `execution` and `operation` through it.

---

## 6. Authority model

```
Atlas says WHAT            Omnira decides WHO MAY           Router picks WHICH
─────────────────          ──────────────────────           ──────────────────
purpose, brief,       →    licence, media type,        →    preference, quality,
dimensions, visibility,    reference support,               stable order
references, quality,       credential presence,
preference                 provider gate
                           ↓
                     ELIGIBLE SET ONLY
```

### Licence handling — the waiver is gone

An earlier cut of Phase 2 took an `allowUnlicensed: true` option. The hardening
review was right to treat that as an authority bug, and tracing it showed the
error was upstream of the flag:

The Atlas media capability licence governs **whether a MISSION may declare
`media.generate` among its tools** — `mediaGenerationAvailability` is a
`MissionCapabilityAvailability`, and `MEDIA_GENERATION_TOOL_BOUND` is a mission
tool bound. The article hero is an operator-triggered application route with no
mission and no declared tool set. **It was never the thing that licence gates.**

So applying the mission licence to it and then adding a flag to undo that was
solving a self-inflicted problem. The fix is to state the classification instead:

```ts
invocation:
  | { kind: 'mission'; missionId: string }                    // licence applies
  | { kind: 'internal-application'; caller: InternalMediaCaller }  // not a mission
```

- **Required, with no default** — no caller silently inherits either treatment.
- The `mission` branch has **no parameter that could skip the licence**.
- `InternalMediaCaller` is a **closed union** (`'article-hero'`), so adding a
  caller is a type change a reviewer sees, not a value someone passes.
- **Every other rule still applies to both branches** — spend, stop, provider
  gate, credentials, reference support, dispatchability.

A test asserts the string `allowUnlicensed` appears nowhere in the orchestrator or
its callers, with comments stripped.

**Residual, stated plainly:** a future caller *could* classify itself as
`internal-application`. That is true of any code-level classification, and it is
materially different from a boolean waiver — it is auditable, closed, and the
mission path remains fully gated. It is not a god-mode flag.

**Ranking cannot widen eligibility, structurally.** `rankEligible` takes the
*output* of `filterEligible` and has no access to the full candidate list. A
preference for a rejected candidate matches nothing, because ranking never sees
it. That is a property of the signature, not a check someone could delete.

---

## 7. Eligibility logic

Five rules, a closed set, each rejection carrying the rule that caused it so
"nothing was eligible" can always be explained.

| Rule | FACT or NEW | Enforced by |
| --- | --- | --- |
| `capability_licence` | **FACT** | `MEDIA_GENERATION_AUTONOMOUS_EXECUTION` |
| `media_type_unsupported` | **NEW** | candidate's declared media types |
| `reference_unsupported` | **NEW** | candidate model's `supportsReferenceImages` |
| `not_configured` | **FACT** | credential presence, read as a boolean only |
| `provider_gate_refused` | **FACT** | `gate.ts`, surfaced via the router |
| `execution_not_supported` | **NEW** (hardening) | the candidate's declared `dispatch` support |

Three rules are genuinely new; the rest ask an authority that already exists.

### The dispatchability invariant

> **ELIGIBLE means allowed AND completable by this orchestrator.**

`MediaCandidate.dispatch` is a discriminated union — `{ supported: true;
representations }` or `{ supported: false; reason }` — read by exactly one rule,
checked **last among the per-candidate rules and always before ranking**. Last
because it is the only rule that is not an authority's refusal: the candidate is
permitted, and Phase 2 simply cannot finish the job. Keeping it separate means
"we are not allowed to" never reads as "we cannot yet".

Provider-layer metadata is **not deleted** — MuAPI stays discoverable through
`describeMediaCandidates()` with its model and gate state intact. It simply never
enters the eligible set.

Proven by a **negative control**: the test reconstructs the pre-hardening filter
(every rule except dispatchability), shows it admits MuAPI and would rank it
first, then shows the real filter rejects it.

**Spend and stop are deliberately NOT re-checked here.** They are enforced at
dispatch by the adapter that owns them, and a pre-check would be a second answer
to a question that already has one — the exact duplication Governance G1 deleted
from this directory once already.

`allowUnlicensed` waives **only** the mission capability licence, for
operator-triggered work that was never a mission. It cannot waive spend, stop,
the gate, credentials, or reference rules — the orchestrator has no code path
that could.

---

## 8. Provider selection

Deterministic, and no LLM is consulted. Three signals, all of which exist today:

1. **`providerPreference`** — honoured only if already eligible.
2. **`quality: 'premium'`** — prefers a reference-capable model, the one real
   quality signal the repository has. Never *requires* one.
3. **Candidate order** — a stable tie-break.

No hardcoded winner. There is no quality score, latency measurement or live cost
lookup in this repository, so a weighted formula over them would be fabricating
inputs.

---

## 9. Proof path

**The article hero, brief-driven branch** — verified rather than assumed:
already spend-governed, already Asset-admitted (Phase 1), one call site, 27 tests.

```diff
- const result = await withRetry(() => generateArticleHeroImage(brief, execution))
- const { asset } = await admitAssetFromUrl({ provider: 'ideogram', … })
+ const result = await withRetry(() => orchestrateImageGeneration({ … }, { allowUnlicensed: true }))
+ const asset = result.asset
```

**The branch no longer names a provider.** It states what it needs; the
orchestrator picks an eligible candidate, dispatches through that candidate's
existing governed adapter, and admits the result.

A small refactor made this possible without duplication:
`buildArticleHeroRenderInput(brief)` was extracted from `generateArticleHeroImage`
as a pure function. Both paths now derive byte-identical inputs and cannot drift;
`generateArticleHeroImage` still calls it, so its 16 tests pass unchanged.

### The provider that proves the complete contract

**Ideogram, through the article hero**, proves every link end to end:

```
EditorBrief → buildArticleHeroRenderInput → orchestrator
  → eligibility (Ideogram passes; MuAPI rejected execution_not_supported)
  → deterministic selection
  → generateIdeogramV3 (withGovernedSpend)
  → retrievable URL
  → admitAssetFromUrl  → canonical Asset + Provenance
  → hero_asset_id persisted, delivery URL derived
```

**OpenAI now also proves it**, in its *normal* representation: `b64_json` decodes
into `admitAssetBytes`. Before hardening it could be selected and then rejected —
the proof stopped at dispatch for the shape that provider actually returns.

Both live adapters therefore complete the loop. No selectable candidate has a
knowingly-broken result path.

**Not migrated, deliberately:** the writer-fallback branch (its prompt comes from
a Claude photo-direction step inside `generateNewsImage`), and all of
`lib/ai/runner.ts`. One proof path, not five.

---

## 10. Asset admission

Generation and admission are one step. The caller is told nothing until Phase 1
admission has retrieved, validated, checksummed, stored and recorded provenance
(§21.5).

The result carries `asset`, `provenance` and `selection` — and **no URL**. A test
serialises the whole result and asserts it contains no `http`. Delivery URLs stay
a separate, deliberate derivation (`publicDeliveryUrl` / `signedAssetUrl`).

The provider URL is used to *retrieve* and then discarded — asserted by checking
it does not appear in the provenance record.

### Two representations, one admission

| Provider output | Path | Validation |
| --- | --- | --- |
| `url` | `admitAssetFromUrl` | retrieve → MIME → magic number → size → checksum |
| `bytes` | `admitAssetBytes` | **identical**, minus the retrieval |

The base64 adapter owns only what nothing else can:

- **strict decode** — `Buffer.from(s, 'base64')` silently drops invalid
  characters, so the result is re-encoded and compared (padding normalised). A
  payload that does not round-trip is refused rather than stored as whatever
  survived.
- **empty refused** — zero bytes is not an image.
- **type identified from the BYTES**, never from the provider's word: candidate
  MIMEs are tried against `bytesMatchMime`, and admission's own magic-number
  check still runs afterwards.

Everything else — the allowlist, the 32 MB `MAX_BYTES.image` ceiling, checksum,
bucket-from-visibility, extension-from-validated-MIME — is Phase 1's, unchanged.
**No second size limit and no second validator were introduced.** The raw base64
never becomes canonical state, and no temporary public URL is minted.

`provider_metadata.resultRepresentation` records which door the result came
through.

---

## 11. Provenance

Phase 1's `asset_provenance`, unchanged. No parallel evidence table, no new
columns.

| Field | Source |
| --- | --- |
| `provider`, `model` | the selected candidate — provider and model stay separate |
| `brief` → `brief_hash` | `sourceBrief`, hashed |
| `request` → `request_hash` | instruction + aspect ratio, hashed |
| `reference_asset_ids` | validated ids |
| `provider_metadata` | operation, candidate family, ranked eligible set |

Spend is **not** duplicated here: `cost_events` remains the only ledger, and the
hero path still links `assetId` through the existing metadata field.

---

## 12. Spend handling

**One reservation per orchestrated request.** One selected candidate, one adapter
call, no fallback loop. A silent second attempt against a different provider is
how a request acquires a second charge — and, for a reference request, how the
requirement gets quietly lost.

Proven: `ideogramCalls.length + openaiCalls.length === 1`. Those two functions are
the only ones on this path that enter `withGovernedSpend`, so counting them counts
billable attempts.

- Provider failure → **no failover**, exactly one paid call.
- Admission failure after a paid call → reported as `ASSET_ADMISSION_FAILED` with
  `providerDispatched: true`, and **not regenerated**: the bytes exist; the
  problem is that Omnira could not take ownership of them.
- `SpendRefusedError` / `ExecutionStoppedError` / `ProviderNotDispatchedError`
  pass through **unwrapped** — callers need to tell "cannot afford" from
  "provider broke".

No exactly-once claim is made anywhere.

---

## 13. Reference semantics

PR #164 guaranteed a required reference never degrades *once a provider is
chosen*. Phase 2 guarantees an unsuitable provider is **never chosen**.

```
required reference
  → candidates whose model cannot be conditioned are FILTERED OUT
  → if the eligible set is then empty → NO_ELIGIBLE_PROVIDER, zero paid calls
  → a preference for a non-reference provider still cannot win
```

Grounded in a real capability difference, not a placeholder: `generateIdeogramV3`
posts to the text-to-image endpoint and carries no image, so
`supportsReferenceImages: false`; `openAIImageEdit` takes an `image` parameter,
so `true`.

References are validated **by identity, before any spend** — non-existent and
cross-project both refuse with zero provider calls. A URL passed as a reference id
is looked up and not found, so it is refused; it is never fetched.

---

## 14. Failure semantics

A closed set of five, deliberately not a universal framework. Failures that
already have an owner keep it.

| Code | Meaning | Paid call made? |
| --- | --- | --- |
| `NO_ELIGIBLE_PROVIDER` | everything filtered out; carries per-candidate reasons | no |
| `REFERENCE_INVALID` | reference missing or cross-project | no |
| `PROVIDER_EXECUTION_FAILED` | the selected adapter failed | yes |
| `PROVIDER_RESULT_INVALID` | unusable result — no image, malformed base64, empty payload, unrecognised format | yes |
| `ASSET_ADMISSION_FAILED` | bytes produced, could not become an Asset | yes |

`providerDispatched` is on the error so a caller can tell whether money may
already have moved. **Success is never reported before admission succeeds.**

---

## 15. Security

| Threat | Control |
| --- | --- |
| Arbitrary provider endpoint | not expressible; endpoints are hardcoded in the adapters. Asserted: no hostname or SDK construction in the directory |
| Credentials in the brief | not expressible; adapters read their own |
| Caller-chosen bucket/path | `storage` accepts a **path only**; bucket derived from visibility. Tested with a forced bucket via cast |
| External URL as reference identity | refused — references are looked up as asset ids, never fetched |
| Reference retrieval | Phase 1 `assertSourceUrlTrusted` (https, no IP literals, no private hosts) |
| Response size / MIME | Phase 1 admission — magic-number verified, size-bounded |
| Private asset becoming public | placement derived from visibility, enforced both directions (Phase 1) |
| Provider overriding project | governance ctx built from the brief; forging via `providerOptions` tested and fails |
| Provider injecting an asset id | admission is given no id field; the id comes from the database |
| New SSRF surface | none — no new fetch destination is introduced |

---

## 16. Tests

`lib/qa/media-orchestrator.test.ts` — **61 tests** (40 + 21 from hardening), all
mocked, no live paid generation.

| # | Requirement | Proven by |
| --- | --- | --- |
| 1 | deterministic selection | 5 identical runs → 1 distinct outcome |
| 2 | ineligible cannot be selected | gate-refused + unconfigured candidates |
| 3 | no eligible → fail closed | `NO_ELIGIBLE_PROVIDER`, zero paid calls |
| 4 | required reference cannot pick a non-reference provider | + preference cannot override it |
| 5 | preference cannot bypass eligibility | ineligible preferred candidate loses |
| 6 | result is admitted as a canonical Asset | admission called with the retrieved URL |
| 7 | caller receives an Asset ID, not a URL | full result serialised, contains no `http` |
| 8 | provider cannot choose the asset id | no id field reaches admission |
| 9 | provider/caller cannot choose bucket/path | `storage` keys are exactly `['path']` |
| 10 | private request admits privately | default `internal` |
| 11 | public request follows public placement | `visibility: 'public'` |
| 12 | malformed result fails before Asset success | b64-only → `PROVIDER_RESULT_INVALID`, nothing admitted |
| 13 | admission failure ≠ generation success | `ASSET_ADMISSION_FAILED`, exactly 1 paid call, no regeneration |
| 14 | no duplicate spend wrapper | import-level assertion across all four files |
| 15 | article hero still correct | 27/27, incl. a new complement test |
| 16 | PR #164 regression green | 24/24 |
| 17 | no-reference path not converted | omitted requirement stays permissive; premium prefers ≠ requires |

### Hardening tests (21 more)

| Requirement | Proven by |
| --- | --- |
| non-dispatchable cannot enter ranking | allowed+configured+gate-clear candidate rejected `execution_not_supported` |
| …not even as a stated preference | preference for MuAPI still loses to Ideogram |
| …and an undispatchable-only set fails closed | `NO_ELIGIBLE_PROVIDER`, zero paid calls |
| **every eligible candidate has a dispatch path** | invariant asserted over all candidate/reference combinations |
| **negative control** | pre-hardening filter admits MuAPI and ranks it first; real filter rejects it |
| the real router-derived MuAPI candidate is undispatchable | reads `describeMediaCandidates()` |
| base64 admitted as bytes | `admitAssetBytes` receives the decoded PNG; no `sourceUrl` |
| MIME identified from bytes | `image/png` derived, not taken from the provider |
| raw base64 never canonical | absent from result and provenance |
| malformed / empty / non-image base64 | all three fail closed, nothing admitted |
| size ceiling is Phase 1's | admission refuses; attributed `ASSET_ADMISSION_FAILED`, 1 paid call |
| no second generation after a byte failure | `paidCalls() === 1`, Ideogram untouched |
| provider cannot choose bucket/path/id on the byte path | `storage` keys are exactly `['path']` |
| `allowUnlicensed` does not exist | string absent from orchestrator and callers, comments stripped |
| internal caller list is closed | `['article-hero']` |
| Atlas draft / L0 / autonomy unchanged | licence, level, execution flag, availability refusal |
| `media_orchestrator` still unmet | asserted present in the prerequisite list |

---

## 17. Files changed — 8

**New (5):**
```
apps/web/lib/media/orchestrator/types.ts
apps/web/lib/media/orchestrator/candidates.ts
apps/web/lib/media/orchestrator/eligibility.ts
apps/web/lib/media/orchestrator/orchestrate.ts
apps/web/lib/qa/media-orchestrator.test.ts                40 tests
```

**Modified (4):**
```
apps/web/lib/article/hero-image.ts          the ONE proof path
apps/web/lib/media/ideogram.ts              extracted buildArticleHeroRenderInput (pure, behaviour-neutral)
apps/web/lib/qa/article-hero-image.test.ts  mocks updated + 1 new complement test
apps/web/lib/atlas/capability/media-generation.ts   comment only — see below
```

### `MEDIA_GENERATION_UNMET_PREREQUISITES` — removal reverted

The first cut removed `media_orchestrator` because `lib/media/orchestrator/` now
exists. **That was inference from a directory name, and it is reverted.**

The list is *"hard prerequisites for ANY license above L0"*, and the canonical
description of this entry
(`docs/architecture/muapi-media-provider.md:220`) is:

> "Owns model selection (which of ~765 endpoints serves this intent), **job
> lifecycle across polling or webhooks**, and the **retry/QC loop**."

Phase 2 ships **none of those three**. Provider-layer candidates are described and
ranked out, not dispatched; there is no job lifecycle and no retry/QC loop. What
Phase 2 does provide is the eligibility → selection → governed execution →
canonical Asset sequence for two already-integrated adapters. Real, and not yet
this prerequisite.

So the file's **only** net change is the explanatory comment. The list is
byte-identical to main, and no other prerequisite was touched.

**Not touched:** no schema, no migration, no n8n, no trading, no new provider, no
Model Registry, no `lib/ai/runner.ts`, no `lib/cost/*`, no `lib/governance/*`,
no `/api/outputs/[id]`.

---

## 18. Known limitations

Two of the original seven are **resolved** by the hardening review and are no
longer listed as blockers.

| # | Limitation | Impact |
| --- | --- | --- |
| ~~L1~~ | ~~Provider-layer candidates rankable but not dispatchable~~ | **RESOLVED** — rejected before ranking as `execution_not_supported`. MuAPI stays discoverable; it is never selectable |
| L2 | `family: 'bridge'` is a migration artifact | Two architectures still coexist. Shrinks to zero as adapters move behind `MediaProvider` |
| L3 | Only the article-hero brief path is orchestrated | Paths 2–5 in §2 still call providers directly and are not Asset-admitted |
| ~~L4~~ | ~~OpenAI b64 rejected as invalid~~ | **RESOLVED** — decoded and admitted through `admitAssetBytes` |
| L5 | No quality, latency or cost signal exists | Ranking uses the three signals that are real. A richer policy needs data the repo does not collect |
| ~~L6~~ | ~~generic `allowUnlicensed` waiver~~ | **RESOLVED** — replaced by a required `invocation` classification with a closed caller union |
| L6′ | A caller could still classify itself `internal-application` | True of any code-level classification. Auditable, closed, and the mission path stays fully gated — but it is the residual worth naming |
| L7 | Model representation is a descriptor, not a registry | Deliberate — a registry for three fixed strings would be inventing structure ahead of the decision |
| L8 | MuAPI is still not dispatchable | Unchanged as a *capability* gap, but no longer an *eligibility* defect. It is Phase 3's first item |

**Flaky test, not mine:** `components/platform/trading/market-view-render.test.ts`
failed once with a 10 s hook timeout during an earlier full run, then passed in
isolation (5.5 s) and on every subsequent full run, including the final one. Zero
trading files are touched by this branch. Reported, not fixed.

---

## 19. Phase 3 recommendations

1. **Make the provider layer dispatchable** (closes L8) — the `MediaProvider`
   async job lifecycle (submit → poll `getStatus` / webhook), then MuAPI in **test
   mode** as the second genuinely eligible candidate. That is the first point at
   which ranking has a real trade-off to make, and the first item that moves
   `media_orchestrator` toward being satisfied.
2. **The retry/QC loop** — the other half of the canonical `media_orchestrator`
   definition, and the natural home for the designed-but-unbuilt CCA.
3. **Model Registry** (canon ch7) — only once ≥2 candidates are dispatchable.
   Until then a descriptor is honest and a registry is speculation.
4. **Migrate a second path** — scene images (`uploadSceneImage`, 8 call sites) are
   the largest remaining class C+D group.
5. **Then, and only then, the licence conversation** — `output_quality_control`
   and `autonomy_license` remain genuinely unmet, and `media_orchestrator` stays
   unmet until 1 and 2 land.

**Not Phase 3:** local runtimes. The hardware question from Phase 0 is unchanged.

---

## 20. GO / NO-GO

### GO — hardened, and the two reported defects are closed.

Typecheck clean. **217 files, 6529 tests, all passing.** 9 files changed, no
schema, no migration, no new provider, no deploy, nothing committed.

Both issues the review raised were real, and both were fixed rather than
documented around:

- **Eligibility now means allowed AND completable.** A candidate that cannot be
  dispatched is rejected before ranking, with a negative control proving the
  old filter would have selected it.
- **No selectable candidate has a knowingly-broken result path.** OpenAI's normal
  base64 output is admitted through the existing Phase 1 byte path — a decode, not
  a redesign.
- **The waiver is gone**, replaced by a required classification whose caller list
  is a closed union.
- **`media_orchestrator` is restored** as unmet, on the evidence of its own
  canonical definition.

**What a reviewer should still weigh** — one judgement call, down from two:

- **The bridge (§3).** It makes two architectures visible in one union rather
  than unifying them. Deliberate and reversible, but a compromise: if the
  preference is to wrap Ideogram/OpenAI as `MediaProvider`s first, this phase
  should be re-scoped rather than merged and then undone.

The residual on `invocation` (L6′) is named rather than hidden: a caller can still
classify itself, as with any code-level classification. It is auditable and
closed, and the mission path is fully gated.

Nothing was committed. All changes are in the working tree for review.
