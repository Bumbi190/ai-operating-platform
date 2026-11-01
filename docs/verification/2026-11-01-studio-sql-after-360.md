# Web Studio — SQL/Studio verification after dealer 360 assets

Date: 2026-11-01
Branch: `codex/atlas-builder-references-20261017`
Scope: update test contracts for the intentionally expanded premium-dealer asset set (5 base assets + 12 governed spin frames = 17). No production DB, hosted migration, paid model call or customer data.

## First isolated SQL run
Runner: `WEBSITE_SQL_ROUNDTRIP=isolated-local node apps/web/scripts/run-website-sql-roundtrip.mjs`

- Fresh UUID-bound PostgreSQL 17 container, network=none, no host port/bind, tmpfs, 192 MiB memory, one CPU.
- Bootstrap/canonical SQL: PASS.
- Integration: 55/56 PASS.
- Only failure: `planning/starter-roundtrip.test.ts` still asserted the historical 5-asset contract while the approved showroom draft now carries 17 governed assets.
- Cleanup: `OWNED_SQL_REMOVED=true`.

This was a stale test expectation, not a database/RLS/worker failure.

## Corrected contract and second isolated SQL run
Updated the SQL starter roundtrip to require:
- model request assets: 17,
- compiled image occurrences: 21 (9 existing showroom/catalog uses + 12 spin frames),
- unique image payloads: 17,
- feedback rebuild request assets: 17.

Fresh isolated run:
- bootstrap: PASS,
- integration: **56/56 PASS**,
- scope: real PostgreSQL + canonical RPC/worker, synthetic auth identities/provider fixture,
- owned fixture cleanup: **PASS / `OWNED_SQL_REMOVED=true`**,
- receipt: `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs/8b5bb559-298d-4522-ba90-bf319dfdb9a6/receipt.json` (local ignored evidence).

## Full Studio journey retry
The `--studio` runner initially reached the same stale 5-asset assertion in `e2e/website-build-fixture-provider.ts`; that fixture contract was updated to 17.

A fresh local retry was then refused **before starting resources** by the runner's explicit safety gate:
`AssertionError: Need 2GiB free; no resources started`.

At that moment Windows reported ~1.96 GiB free of 15.83 GiB. No owned SQL containers or website test processes remained. The test gate was not bypassed and user applications were not terminated.

Therefore:
- SQL/worker roundtrip: verified green on the new 17-asset contract.
- Full local Studio browser+SQL rerun after the second fixture correction: **not locally claimed green** due host-memory admission refusal.
- GitHub CI on the next exact pushed head is the required proof for that Studio journey.
