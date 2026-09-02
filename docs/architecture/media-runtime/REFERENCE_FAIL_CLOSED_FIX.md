# REFERENCE FAIL-CLOSED FIX

**Branch:** `fix/hero-reference-fail-closed` · **Worktree:** `.worktrees/hero-reference-fail-closed`
**Base:** `origin/main` @ `1aa4ccebb8a2af690affb569574806189a0ab413`
**Date:** 2026-09-02

One defect, one production file, one new test file. No schema change, no
migration, no deploy, no merge.

---

## Defect

`generateWithReference()` in `apps/web/lib/ai/runner.ts` is semantically
*"generate this image **using this character reference**"*. When the reference
could not be retrieved it returned `null`, and every caller treated `null` as
"try again without the reference":

```ts
imageData = await generateWithReference(…, imgRef)
  ?? await generateWithRetry(coloringPrompt, '1024x1024', `färgläggning bild ${i + 1} (utan ref)`)
```

So a reference-constrained request silently became an unconstrained one. The
result was still pushed into `urls` and reported as a success.

For Familje-Stunden's recurring characters (Nova & Pling) that is not a degraded
image — it is *different characters*, published as though they were canon.

**This was not hypothetical.** `content/familje-stunden/canon/canon.meta.json`
records `binary_assets.status: "pending_import"` for both canonical character
images, so the references are not in storage. Every generation on this path was
already taking the fallback.

**It also had no test coverage.** `lib/qa/h1-executor.test.ts` mocks `runStep`
wholesale, so nothing exercised `runImageStep` at all.

Canon names the anti-pattern directly — Intelligence Fabric §6.254 *Hidden
Feature Loss*: *"Adapters must not ignore requested Features silently. If
character references are unsupported, the mapping must report incompatibility or
degradation."*

---

## Previous Behavior

```
fetchReferenceBuffer(name)
  ├─ no NEXT_PUBLIC_SUPABASE_URL → return null   (silent)
  ├─ HTTP not ok                 → console.warn, return null
  └─ network throw               → console.warn, return null
        ↓
generateWithReference(...)
  └─ if (!refBuffer) return null
        ↓
caller: … ?? generateWithRetry(prompt, …, '(utan ref)')
        ↓
  openAIImageGenerate  ← a NEW, BILLABLE, UNREFERENCED generation
        ↓
  urls.push(...)       ← reported as success
```

Four distinct failures all collapsed to `null`, and `null` meant "proceed
without the thing the call was for".

---

## Corrected Behavior

```
fetchReferenceBuffer(name)
  ├─ invalid name          → throw MissingReferenceError
  ├─ no base URL configured→ throw MissingReferenceError
  ├─ HTTP not ok           → throw MissingReferenceError (status in message)
  ├─ network throw         → throw MissingReferenceError (cause in message)
  └─ zero bytes            → throw MissingReferenceError
        ↓
generateWithReference(...)
  ├─ constrained call fails / returns no image → throw ReferenceGenerationError
  └─ (no null branch, and no `??` at any call site any more)
        ↓
  runImageStep's EXISTING per-image catch
        ↓
  consecutiveFailures++ ; errors.push('Bild N misslyckades: …')
        ↓
  no url, no upload, NO provider call of any kind
```

Three properties, stated precisely:

1. **No UNREFERENCED provider call ever follows a required-reference failure.**
   On retrieval failure, neither `openAIImageEdit` nor `openAIImageGenerate` is
   reached at all. On constrained-generation failure, `openAIImageEdit` has run
   (with the reference) and nothing follows it.
2. **The failure is reported, not swallowed.** It lands in the step's `errors[]`
   and is returned to the caller, using the contract that already existed.
3. **It is scoped to one image, not the step.** A later image with a working
   reference still generates. Fail-closed means "this request is refused", not
   "the run is poisoned".

### THE LOCKED CONTRACT

> **A REQUIRED REFERENCE MUST NEVER DEGRADE TO UNREFERENCED GENERATION.**

`generateWithReference` returns an image that was actually produced *with* the
reference, **or it throws**. There is no third outcome, and the return type is no
longer nullable — `?? somethingElse` cannot be written against it.

Every one of these throws, and treating them identically is the point:

| Failure | Error | Provider call made? |
| --- | --- | --- |
| Reference could not be retrieved | `MissingReferenceError` | none |
| Reference invalid (bad name, 0 bytes) | `MissingReferenceError` | none |
| Constrained provider request failed | `ReferenceGenerationError` | **one**, constrained |
| Provider returned 2xx with no image data | `ReferenceGenerationError` | **one**, constrained |
| All rate-limit retries exhausted | `ReferenceGenerationError` | N, **all constrained** |

Rate-limit retries are kept — they re-send *with* the reference, so they satisfy
the requirement rather than dropping it. What was removed is the tier that
dropped it.

A future Media Runtime orchestration may retry against a **different provider or
model that also satisfies the reference requirement**. It may not remove the
requirement.

### The amendment: escape 2 is now closed

The first pass fixed retrieval failure only and left this documented as an open
product decision. That decision is now made, and the code follows it:

```diff
- imageData = await generateWithReference(…, imgRef)
-   ?? await generateWithRetry(coloringPrompt, '1024x1024', 'färgläggning bild N (utan ref)')
+ imageData = await generateWithReference(…, imgRef)
```

All three `?? generateWithRetry(… 'utan ref')` clauses are gone. The string
`utan ref` no longer appears in any code path.

That fallback was also incoherent on its own terms: every one of those prompts
opens with *"Use the reference image as a strict style and character guide"*,
while `generateWithRetry` attaches no image. It asked the model to follow a
reference it was never given.

### Why a named error, and why it is not a second error system

`MissingReferenceError extends Error` sits beside the file's existing
`IdeogramHttpError` precedent. It is caught by the same `try/catch`, formatted by
the same `err instanceof Error ? err.message : String(err)`, and reported through
the same `errors[]`. Nothing new handles it. It exists so the condition is
greppable and so tests assert on identity rather than on prose.

---

## Call Sites

`runImageStep` has **four** image branches. Three call `generateWithReference`;
the fourth never has. Reclassified from source, not assumed:

| # | Branch | What the reference represents | Required? | Behaviour on failure (before → after) |
| --- | --- | --- | --- | --- |
| 1 | `isSagaMode` (`runner.ts:804`) | Nova/Pling character + style guide for the gpt-image-1 tier | **REQUIRED** | `null` → unreferenced paid call → **throws, image skipped** |
| 2 | `isActivityMode` (`runner.ts:851`) | same | **REQUIRED** | same |
| 3 | coloring, `else` (`runner.ts:858`) | same; this is the *only* generation path for coloring pages | **REQUIRED** | same |
| 4 | `isCoverMode` (`runner.ts:751`) | — none — | **N/A** | never called `generateWithReference`; **untouched** |

**All three callers of `generateWithReference` require it.** Each prompt opens
with *"Use the reference image as a strict style and character guide"* and names
both characters. None takes a flag, parameter or config that would make the
reference optional. **No call site genuinely allowed optional degradation**, so
per the review instruction there was nothing to stop and report — the `??` was
the defect, not an optional-reference contract.

### An important nuance: this does not strand saga or activity

Branches 1 and 2 have a **primary tier that never used a reference at all**:

```
saga / activity:
  1. generateWithIdeogram(prompt)   ← prompt-only, NO reference, + vision-QA gate   ← UNCHANGED
  2. generateWithReference(ref)     ← only when Ideogram is unavailable             ← now fail-closed
  3. generateWithRetry('utan ref')  ← REMOVED
```

Tier 1 is untouched. It is not a degraded reference request — it is a different
strategy that pursues character consistency through detailed prompt description
(`NOVA_DESC`, `PLING_DESC`) and then *gates the result on vision QA*. Removing
tier 3 removes only the tier that claimed a reference it did not attach.

Branch 4 (`isCoverMode`) is the explicit no-reference contract, commented in
source as *"Ingen referensbild"*. It calls `generateWithRetry` directly and is
covered by its own regression tests so this fix cannot quietly reach it.

### What changed at the call sites

All three `?? await generateWithRetry(… 'utan ref')` clauses were **removed**.
The first pass had left them, reasoning they still covered constrained-generation
failure; the locked decision makes that reasoning wrong, so they are gone.

`fetchReferenceBuffer` has exactly one caller, so its contract change
(`Buffer | null` → `Buffer`-or-throw) is contained.

### Exhaustive unreferenced-path audit

Every provider entry point in `runner.ts`, and who can reach it:

| Entry point | Reference? | Reachable from |
| --- | --- | --- |
| `openAIImageEdit` (`:184`) | **yes** | `generateWithReference` only |
| `openAIImageGenerate` (`:701`) | no | `generateWithRetry` only — **one call site**, the cover branch |
| `generateIdeogramLegacy` (`:292`) | no | `generateWithIdeogram` — saga/activity tier 1, QA-gated |

`await generateWithRetry(` appears **exactly once** in the file, and it is
`imageData = await generateWithRetry(coverPrompt, …)`. Both facts are asserted by
tests, so a reintroduced fallback fails the build.

---

## Spend Behavior

**No spend infrastructure was modified, and none needed to be.**

The governed boundary on this path is `openAIImageEdit` / `openAIImageGenerate`
in `lib/ai/openai-client.ts`; both wrap `withGovernedSpend`, which owns project
resolution, estimate, reservation, refusal and settlement.

Ordering inside `generateWithReference`:

```
1. await fetchReferenceBuffer(refFilename)   ← throws here
2. for (attempt …)
3.   await openAIImageEdit(...)              ← withGovernedSpend starts here
```

The reference fetch is strictly **upstream of the reservation**. On failure:

- no reservation is created, so there is nothing to release or refund;
- `releaseSpend` / `settleSpend` semantics are untouched — they are never
  entered;
- the "ambiguity is not a refund" rule in `governed-spend.ts` is unaffected,
  because no dispatch was attempted.

This is the safest possible failure point: not *refunded after* spend, but
*before* spend exists.

### Class B — the reference loaded, the constrained call failed

`openAIImageEdit` was entered, so `withGovernedSpend` ran and applied its own
settlement rules before rethrowing. **Those semantics are untouched** — this fix
changes only what happens *after* the error leaves `openAIImageEdit`:

| | Before | After |
| --- | --- | --- |
| Inside `withGovernedSpend` | estimate → reserve → dispatch → settle/release | **identical** |
| After it throws | caught → `null` → **a second, paid, unreferenced call** | rethrown; **no second call** |

The "ambiguity is not a refund" rule in `governed-spend.ts` still decides settle
vs release for the constrained attempt. This change neither refunds nor re-settles
anything; it stops a *new* reservation being taken for a request that had already
lost its requirement.

**Proved directly:** the test *"exactly ONE paid attempt: a failed constrained
call triggers no second call"* asserts
`editCalls.length + generateCalls.length === 1`. Those two functions are the only
ones on this path that enter `withGovernedSpend`, so counting them counts
billable attempts.

Rate-limit retries do re-enter the boundary — but every one of them carries the
reference (asserted: `editCalls.every(c => c.hasImage)`), so no retry is an
unreferenced spend.

Also asserted by source: this fix introduced no
`withGovernedSpend`/`reserveSpend`/`releaseSpend`/`settleSpend` reference of its
own.

A secondary benefit: the pre-existing fail-fast comment in `runImageStep` —
*"för att inte slösa API-krediter på ett redan trasigt steg"* — now also protects
against a run whose references are all missing, because each refusal increments
`consecutiveFailures` and three in a row stop the step.

---

## Security / Input Validation

**No fetching behaviour was broadened.** The URL is still built as
`${JUNI_REF_BASE}/${filename}`, where the base comes from
`NEXT_PUBLIC_SUPABASE_URL`. No new host, scheme, filesystem path or provider
bypass was added.

**One rule was strengthened.** `filename` is validated against
`/^[A-Za-z0-9._-]+$/` before it reaches URL concatenation. All three callers pass
generated names (`saga-${i+1}.png`), so this changes nothing today — but the name
is a *parameter* that becomes part of a URL, and a future caller passing anything
model- or user-derived could otherwise use `../` or a scheme to redirect the
fetch. Validating here makes the rule independent of the caller.

**Zero-byte responses are now rejected.** A truncated or empty upload previously
became a valid-looking `Buffer` and was attached as a reference. That is the same
unbounded-generation outcome by a quieter route.

---

## Tests

`apps/web/lib/qa/image-reference-fail-closed.test.ts` — **24 tests** (was 15).

Drives the *real* `runStep` → `runImageStep`. `fetch`, the OpenAI client and
Supabase storage are mocked — **a test for this must not be able to spend**.

| # | Requirement | How it is proven |
| --- | --- | --- |
| 1 | missing reference → no provider call | 4 arrangements (404, 500, network throw, unconfigured base); `editCalls` and `generateCalls` both empty |
| 2 | invalid / zero-byte reference → no provider call | 0-byte response rejected; name validation asserted |
| 3 | valid reference + success → generates | `openAIImageEdit` called once **with the image attached**; url produced and uploaded |
| 4 | constrained provider failure → **no unreferenced fallback** | `editCalls` 1, `generateCalls` **0**, no url, error surfaced |
| 5 | malformed constrained result → no fallback | 2xx with empty `data` → `ReferenceGenerationError`, `generateCalls` 0 |
| 6 | no second paid call after constrained failure | `editCalls.length + generateCalls.length === 1` |
| 7 | all required-reference call sites obey it | source assertions: exactly 3 `await generateWithReference(`, none followed by `?? … generateWithRetry`, `utan ref` absent from code |
| 8 | genuinely no-reference paths unchanged | COVER mode still generates via `generateWithRetry`, calls no reference path, fetches nothing — and is unaffected by a missing reference store |
| 9 | negative control | below |

Plus: rate-limit retries stay constrained then fail closed; one bad reference
does not stop a later good one; `await generateWithRetry(` appears exactly once
and only in the cover branch.

### Negative control

**Both** escapes are reconstructed in-place and shown to violate the properties
this suite pins:

- **Escape 1** — `null` on retrieval failure, then `?? unreferenced`. Runs, and
  produces an image via an unreferenced call. The suite's
  `expect(generateCalls).toEqual([])` is then asserted to **throw** against it.
- **Escape 2** — reference loads, constrained call fails, `null`, then
  `?? unreferenced`. Also produces an image, and breaks **both** the
  "no unreferenced call" and the "exactly one paid attempt" invariants.

A third test runs the same two arrangements against the *real* code path and
shows it refuses both. Without this, a green suite would prove only that the
current code passes — not that it would notice the old behaviour returning.

## Validation

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| Focused suite | **24/24** |
| AI / media / governance guards | **173/173** (`image-reference-fail-closed`, `h1-executor`, `governance-provider-boundary`, `muapi-media-provider`, `article-hero-image`, `external-dispatch-stop`) |
| **Full repository suite** | **212 files, 6311 tests, all passing** |
| Deployed | no |
| Merged | no |
| Migrations applied | none — this change contains no migration |

---

## Files Changed

**Modified (1):**

```
apps/web/lib/ai/runner.ts
```

- `MissingReferenceError` (new, exported) — retrieval/validation failure
- `ReferenceGenerationError` (new, exported) — constrained-generation failure
- `SAFE_REFERENCE_NAME` filename guard
- `fetchReferenceBuffer` — returns `Buffer` or throws, with a diagnostic reason
- `generateWithReference` — return type **no longer nullable**; throws on
  provider failure, on a 2xx with no image data, and on exhausted retries;
  rate-limit retries preserved
- **three call sites** — `?? await generateWithRetry(… 'utan ref')` removed

**New (2):**

```
apps/web/lib/qa/image-reference-fail-closed.test.ts       24 tests
docs/architecture/media-runtime/REFERENCE_FAIL_CLOSED_FIX.md
```

**Not touched:** `generateWithRetry` itself, `generateWithIdeogram`, the
`isCoverMode` branch, `lib/cost/*`, `lib/governance/*`, `lib/ai/openai-client.ts`,
any schema, any migration, the Media Runtime Asset foundation, n8n.

---

## Remaining Risks

| # | Item | Type | Impact |
| --- | --- | --- | --- |
| R1 | ~~Case 2 still falls back~~ | **RESOLVED** | Closed by this amendment. Constrained-generation failure now throws; all three `?? … 'utan ref'` clauses removed |
| R2 | ~~Fallback prompt referenced an unattached image~~ | **RESOLVED** | The incoherent tier no longer exists |
| R7 | Saga/activity lose their third tier | FACT | If Ideogram is unavailable **and** the reference fails, those images now fail instead of producing an unreferenced one. Intended. Tier 1 (Ideogram, QA-gated) is unchanged, so this bites only when both upstream options are already broken |
| R8 | Fewer images returned per run when references are missing | FACT | A direct consequence of fail-closed, amplified by the pre-existing 3-consecutive-failure cutoff. With canon references still `pending_import`, expect coloring runs to return zero images until they are uploaded — loudly, rather than with the wrong characters |
| R3 | Familje canon references are still `pending_import` | FACT | With this fix, that state now **fails loudly** instead of silently producing wrong characters. Expect these paths to start erroring until the canonical images are uploaded — that is the fix working, but it is a visible behaviour change |
| R4 | `JUNI_REF_BASE` is module-scope | FACT | A deploy missing `NEXT_PUBLIC_SUPABASE_URL` disables references for the whole process. Now fails closed rather than degrading; a test covers it on a fresh module |
| R5 | Reference naming is convention-only (`saga-N.png`) | FACT | Not asset-backed. Media Runtime Phase 1's `reference_asset_ids` is the durable fix; unrelated to this branch and not depended on by it |
| R6 | Only the coloring branch is driven end-to-end | INFERENCE | All three branches call the same function with the same shape, so the fix is common to them. Driving saga/activity would add Ideogram and vision-QA mocking for no additional proof of *this* defect |

---

## Merge Independence

This branch is **independently mergeable**. It is based on current `origin/main`
(`1aa4cce`), touches one production file, shares no file with
`feat/omnira-media-runtime`, adds no schema and no migration, and needs nothing
applied to any database before it can ship.

One thing to know before merging **the other** branch: `origin/main` has since
taken `c168f12 chore(governance): record migration 58 -> 59 in the schema
ledger`. The Media Runtime Phase 1 branch also claims 58 → 59 for
`media_asset_foundation`, so that branch now needs a rebase to 59 → 60. It does
not affect this fix.
