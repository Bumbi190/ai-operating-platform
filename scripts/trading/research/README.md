# Offline pattern-candidate harness — NOT production trading

**Scope:** Research only. No Strategy Engine import, no API, no market feed, no Risk Engine, no broker connection, no proposal, no order execution.

These scripts investigate unresolved **GATE-01 (iFVG)** and **GATE-02 (CISD)**. Every returned object is marked `NON_CANONICAL_RESEARCH`; any candidate explicitly carries `entryPermitted:false`. A passing test means that a specific **interpretation** is consistent on synthetic examples. It does **not** mean the interpretation is correct, profitable, or permitted for live strategy code.

## Run locally (no npm install or billable providers)

```bash
node --test scripts/trading/research/pattern-candidates.test.mjs scripts/trading/research/pattern-candidates-mirror.test.mjs
```

The implementation accepts only `source: 'SYNTHETIC'`, `calendar: 'SYNTHETIC_CONTIGUOUS'`, `settled:true`, fully complete minute candles and exact decimal *strings*. Real exchange gaps must not be shoehorned into this synthetic-contiguity assumption: production data needs the canonical ContractCalendar, SessionCalendar and actual 1m observation-source contract.

## Explicit alternatives; neither is approved

- **Inversion FVG:** a standard three-closed-candle gap (wick boundaries); a *later* candle either CLOSES strictly beyond the opposite far edge (`CLOSE_BEYOND_FAR_EDGE`) or merely WICKS past it (`WICK_BEYOND_FAR_EDGE`). The two can disagree by a bar or more. Whether the base gap may predate the manipulation is separately tested with `ANY` vs `AFTER_MANIPULATION`.
- **CISD:** the last opposing-color candle run uses either its FIRST or LAST candle open as the crossing reference. The first reference is not interchangeable with the last. This harness does **not** prove that the selected run is the correct swing/leg entering the manipulated extreme.
- Inversions from more than one active FVG on the same candle are **ambiguous**; the harness does not choose whichever yields a better trade.
- Unresolved doji interpretation blocks CISD synthetic evaluation rather than guessing.
- Research-only lookahead resistance: a candle contributes only when marked complete, events receive its close timestamp, and prefix tests ensure that future events cannot appear in an earlier replay prefix.

## Strong limitations before ANY promotion

1. Decide whether *iFVG* here means **inversion** FVG (assumed for comparison) or *implied* FVG. These are different concepts which sometimes share the same abbreviation.
2. Canonicalize formation/invalidation, cross boundary, zone selection/expiry, manipulation ordering, and explicit tie-breaks.
3. Canonicalize CISD reference run based on market structure, wick versus close, handling of doji/gaps, expiry and event identity.
4. Implement independent review + separate canonical spec versions; then real session/calendar/contract data verification and golden cases.
5. Never import this code into `apps/web/lib/trading/` as if it were a reviewed detection rule. No claim of backtest/live parity is made until BOTH paths run the SAME promoted implementation with actual data.

See `docs/trading-system/research/GATE01-02_VARIANT_REVIEW_2026-10-19.md`, `docs/trading-system/reviews/Open Implementation Gates v1.0.md`, and `docs/trading-system/SOURCE_OF_TRUTH.md`.


## GATE-03 and GATE-04 synthetic comparison experiments (2026-10-19)

`equal-smt-candidates.mjs` compares explicit **research variants** for tick-distance-matched confirmed swing highs/lows and NQ/ES SMT. This is not a provider adapter or canonical detector. It accepts only complete, synthetic candles and explicit reference pairs; no automatic swing correspondence or live chart connection is claimed.

Run the new suite:

```bash
node --test scripts/trading/research/equal-smt-candidates.test.mjs
```

Run **all offline research suites** without npm, brokers or billable services:

```bash
node --test scripts/trading/research/*.test.mjs
```

Test outcomes: GATE-01/02 16 synthetic tests, GATE-03/04 18 synthetic tests; **34 research-unit tests total** on the first recorded runs. This is neither a backtest nor a measure of profit. The number is only valid after re-running the exact code being assessed.

Key unapproved choices demonstrated in tests: 1 tick inclusive vs exclusive gives a different equal-high answer; wick vs close gives different SMT observations; a 0-minute vs 1-minute matching allowance changes whether a reference pair may be considered. `UNKNOWN` must be preserved for missing/unsettled/misaligned candles or references. Outputs cannot grant any order or upgrade a setup grade.

For unresolved decisions, assumptions and limitations read `docs/trading-system/research/GATE03-04_VARIANT_REVIEW_2026-10-19.md`. All GATE-01/02/03/04 remain **OPEN** and the pending-gate JSON remains intentionally unapproved.

## Joint decision matrix for GATE-01–04 (2026-10-19)

`pattern-decision-matrix.mjs` uses the actual pure research functions above to compare **seven different synthetic choice points** across all four OPEN gates: iFVG inversion crossing / formation order, CISD opposing-candle anchor, equal-high inclusive/exclusive tick boundary, SMT wick/close, SMT allowed pair confirmation delta, and missing ES data.

Each decision is `UNDECIDED`, `approvedVariant:null`, `eligibleForStrategy:false`; all four `gateStatus` fields remain `OPEN`, `approvals` are null, and `tradingEnabled:false`. This is an **operator review aid**, not a strategy, grade, provider or trade backtest. `pattern-gates-pending-v0.1.json` and canonical detection specs have **not** been changed.

To re-run all four research suites including the 11 decision-matrix regressions (45 tests total):

```bash
node --test scripts/trading/research/pattern-candidates.test.mjs scripts/trading/research/pattern-candidates-mirror.test.mjs scripts/trading/research/equal-smt-candidates.test.mjs scripts/trading/research/pattern-decision-matrix.test.mjs
```

To inspect the machine-readable review matrix entirely offline (no provider/API dependencies):

```bash
node --input-type=module -e "import {buildPatternDecisionMatrix} from './scripts/trading/research/pattern-decision-matrix.mjs'; console.log(JSON.stringify(buildPatternDecisionMatrix(),null,2))"
```

Actual recorded run on Windows Node v22.22.3: **45 PASS, 0 FAIL** (34 prior + 11 new). Read `docs/trading-system/research/PATTERN_GATE_DECISION_REVIEW_2026-10-19.md` before asking for a human decision. Do not copy a candidate variant into the Strategy Engine merely because the synthetic case produced an observation.


## iFVG formation feedback – user-relayed contact reply (2026-10-19)

The user shared a reply saying **both** FVG creation before and after manipulation can occur, but **after-manipulation formation (B) is usually more common**. This is qualitative feedback, not verified market frequency or authorization to reject A. The research matrix and pending-gate register now capture the remark separately, while `creationVsManipulationOrder` remains `null`, GATE-01 remains `OPEN`, and no numerical frequency, eligibility age, automatic tie-break or version promotion is invented.

Run all four GATE-01–04 research suites: **52/52 tests passed** on the Windows desktop after adding three formation-feedback guards. This includes the previous 49 tests. No live market data, CI, broker, API or order operations.

