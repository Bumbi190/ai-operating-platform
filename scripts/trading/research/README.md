# Databento Historical Candidate — offline preflight only

**Status: NON_CANONICAL_RESEARCH.** For provider comparison and tests, not production market data, not a connector, not a real backtest, not an execution adapter.

Run from the repo root without installing anything:

```bash
node --test scripts/trading/research/databento-historical-preflight.test.mjs
```

20 synthetic Node.js cases passed on Windows Node v22.22.3 (2026-10-19). No remote data, network, API key, subscription, quote or download.

`databento-historical-preflight.mjs` deliberately has **no** HTTP client or API method implementation. It returns a cost-quote descriptor, NOT a live call. The returned `downloadAllowed` value is always false, including after a human-reviewed synthetic quote. Prices are handled from exactly specified integer nanounits (1e-9) using BigInt, never number floats.

The OHLCV inspector accepts a self-authored **normalized** representation (`ts_event_ns`, `open_nano`, `high_nano`, `low_nano`, `close_nano`, `volume`, `rtype`, `instrument_id`, `publisher_id`). It does not parse Databento's actual DBN or HTTP JSON payload, prove a source stream is SETTLED, validate exchange calendars, or assert that the hardcoded synthetic instrument definition is real. Such a parser and the actual C3C adapter require separate independent testing and licensed data access.

Read the complete provider evaluation and official source links at `docs/trading-system/research/HISTORICAL_DATA_PROVIDER_EVALUATION_2026-10-19.md`.

Do not move this module to `apps/web/lib/trading` or allow it to drive a trading signal: GATE-08 and GATE-01–04 remain open.

## Offline normalized-batch audit (2026-10-19)

The earlier 20-test preflight now rejects Databento's `UNDEF_PRICE` sentinel and constrains `instrument_id` to unsigned 32-bit, `publisher_id` to unsigned 16-bit. Added `databento-normalized-batch-audit.mjs` with **16 additional** tests. It accepts self-supplied **normalized synthetic records** only, checks order, duplicates, contract identity and requested-window containment, and reports a deterministic digest of normalized field-tuples plus candidate unobserved minutes. None of this proves raw-provider authenticity, a market-data entitlement, an actual exchange session or source `SETTLED` state.

Run both suites locally with Node (no npm packages, API keys or data downloads):

```bash
node --test scripts/trading/research/databento-historical-preflight.test.mjs scripts/trading/research/databento-normalized-batch-audit.test.mjs
```

Recorded result: **36/36 PASS** on Windows Node 22.22.3. This is not a true historical backtest or provider integration. In particular, Databento's CSV/JSON pretty-price output must never be passed as raw 1e-9 integer fields without a separately reviewed format decoder.

See `docs/trading-system/research/DATABENTO_OFFLINE_INTAKE_AUDIT_2026-10-19.md`.
