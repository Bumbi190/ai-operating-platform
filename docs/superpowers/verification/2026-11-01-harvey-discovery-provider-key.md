# Harvey discovery provider credential support — 2026-11-01

Existing Draft PR #386. This change prepares the already-reviewed bounded discovery adapter for overpass.ch without activating a provider account, source configuration, paid plan, customer outreach, background host or model job.

## Change

- Production discovery still requires an explicit HTTPS provider URL.
- `api.overpass.ch` is accepted only at the fixed `/v1/interpreter` endpoint and only when `ATLAS_SALES_DISCOVERY_OVERPASS_KEY` is present and syntactically safe.
- The provider key is sent only as `X-API-Key`; it is never embedded in the URL or Overpass query body.
- The public community endpoint remains rejected in production and remains only a local/manual development proof source.
- Missing or malformed provider credentials surface as `DISCOVERY_SOURCE_NOT_CONFIGURED`; saved discovery results remain reviewable through the existing API behavior.

## Evidence

A bounded Malmö car-dealer query against the public community Overpass endpoint timed out after the existing 27-second client limit. That result is retained as a failed manual connectivity proof and is not used as provider qualification.

Current overpass.ch public documentation states that a free account and API key can be created without a credit card for evaluation/development. Current terms state that commercial production use on new accounts requires a paid plan. No account, key, purchase or Vercel environment variable was created by this change.

## Local verification on Hultgren

- `sales-discovery.test.ts` + `sales-discovery-api.test.ts`: **44/44 passed**.
- Full TypeScript: **passed**.
- Broader affected security/discovery suite: **379/379 passed** across 7 files.
- `git diff --check`: passed.
- No runtime provider secret was available or used; all key tests use a synthetic value.

Next operational step requires a real free development key (account creation/confirmation) before a small live provider query can be qualified. Commercial subscription selection remains a separate owner decision.
