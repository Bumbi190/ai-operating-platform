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
