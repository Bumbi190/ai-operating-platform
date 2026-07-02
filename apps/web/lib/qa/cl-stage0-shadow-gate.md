# CL Stage 0 — Runtime shadow gate (fixed, reviewable artifact)

> Roadmap §4/§6: Stage 0 is **in_progress** until this checklist passes on runtime
> evidence. Code gates already green (tsc 0 · build 51/51 · CL suites 82/82).
> Versions under test: assembler `cl-v1.0-stage0` · allocation policy `v1`.

## 1. Preconditions

- [ ] Stage 0 commits (CL 1–6) merged to the Preview branch.
- [ ] Preview env: `ATLAS_CTX_ASSEMBLER=shadow` (Development/Preview ONLY — Production stays unset).
- [ ] `ATLAS_VIEW_AWARENESS=1` on Preview (needed for the ③ fidelity check).
- [ ] Confirm rollback: unsetting the one flag disarms everything.

## 2. Fixed prompt set (run in order, same conversation where noted)

| # | Prompt | Mode | Purpose |
|---|---|---|---|
| P1 | "Hur går det idag?" | chat | baseline ①② |
| P2 | Same, repeated within 45s | chat | cache-hit path |
| P3 | "Vad ser jag just nu?" from `/approvals?state=pending` | chat + view | ③ fidelity |
| P4 | "Vad gjorde du nyss?" (after any delegation exists) | chat | ② ledger fidelity |
| P5 | "Hur går det idag?" | voice | voice modality |
| P6 | A content/fast-path prompt (e.g. "skriv en LinkedIn-post om X") | chat | must emit NO shadow line |

## 3. Validate every `[ctx-shadow]` line

Structural
- [ ] Exactly one line per P1–P5 turn; **zero** lines for P6 (fast path) and zero once the flag is unset.
- [ ] `versions == { assembler: "cl-v1.0-stage0", allocationPolicy: "v1" }` on every line.
- [ ] `structural.assembled` ⊇ `["operational","activeWork"]`; includes `"view"` on P3.
- [ ] `structural.legacyOnly == ["[BESLUT"]` — nothing else. (Expected until Stage 1; anything additional = a reader failed.)
- [ ] `structural.assembledOnly == []`.
- [ ] `blocksDropped == []` (①②③ run un-deadlined; anything here = reader contract breach).

Fidelity
- [ ] P3: `fidelity.view == "identical"` (byte-equal ③). P1/P2/P5: `"absent"`.
- [ ] `fidelity.actionLedger ∈ {"identical-prefix","absent"}`; P4 must be `"identical-prefix"`. Any `"divergent"` → investigate before gate.

Tokens (plausibility, not equality)
- [ ] `tokens.operational ≤ tokens.legacyLive` (legacy live includes the extra slices that fold in at Stage 1 — the gap is the Commit-7 work, note its size).
- [ ] `tokens.activeWork ≥ tokens.legacyAction` (② adds [PÅGÅENDE KÖRNINGAR]).
- [ ] P3: `tokens.view == tokens.legacyView`.
- [ ] Token counts stable (±10%) across P1 vs P2.

Latency / cache
- [ ] P1: `cacheHits == []`; P2: `cacheHits == ["operational","activeWork"]`.
- [ ] `shadowMs` recorded on every line (any value — it is off the live path).
- [ ] Live first-token latency on P1–P5 within normal range vs a flag-off baseline run (no regression).
- [ ] Voice (P5): `modality == "voice"`; response unaffected.

Containment
- [ ] Zero `[ctx-shadow] error` lines across the run.
- [ ] Responses (content/quality/tools) indistinguishable from flag-off behavior.

## 4. Rollback verification (flag-only reversibility — roadmap §2 "reversible, defaults safe")

Run AFTER the two clean passes, on the same Preview deploy:

- [ ] Unset `ATLAS_CTX_ASSEMBLER` (or set `off`) and redeploy/restart Preview.
- [ ] Re-run P1, P3 and P6: **zero** `[ctx-shadow]` lines and zero `[ctx-shadow] error` lines appear.
- [ ] Responses on P1–P5 are indistinguishable from the flag-on run (the shadow never influenced behavior, so disabling it must change nothing either).
- [ ] Live first-token latency unchanged vs both prior runs.
- [ ] Confirm this required **no code rollback**: same commit SHA deployed, flag change only. Record the SHA below.

## 5. Declaration

- [ ] Full prompt set passes **twice** (separate deploys or separate days).
- [ ] Rollback verification (§4) passes.
- [ ] Findings recorded below; any `divergent`/drop/error resolved and re-run.
- [ ] Operator sign-off → Stage 0 **complete**; only then may Stage 1 (Commit 7) begin.

## 6. Findings log

| Date | Deploy (SHA) | Flag state | Result | Notes |
|---|---|---|---|---|
|  |  |  |  |  |
