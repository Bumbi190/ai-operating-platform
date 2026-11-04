# PostHog approved dashboard read release
User approved production activation. Baseline: main 17e0e563ae49552ec3c37afb7f2861d957cad5d6, the latest READY production commit.

## Scope
- Authenticated owner-only /analytics/posthog review UI. Prepare an exact request, grant through canonical Authorization V1 for five minutes, then explicitly read dashboards.
- Purpose-scoped POST /api/analytics/posthog/authorization derives all authority/target fields on the server. Unknown input fields and stale hashes are rejected. It creates a pending request only, never grants.
- POST /api/analytics/posthog/dashboards enforces exact current unconditional human grant, durable quotas (3/minute,20/day), append-only audit, bounded EU provider read, and post-fetch authorization recheck.
- Only dashboard IDs and titles. No traffic metrics, query jobs, session replay, autonomous Nova execution or PostHog writes.

## Applied schema reconciliation
PostHog migration 20261104135920 is already applied to iboepohjwrhtgshrqaol.
Four previously applied migration sources are brought into canonical history only; no SQL is re-applied and no parallel feature runtime code is copied:
| Name | Remote version | Normalized source SHA256 |
| --- | --- | --- |
| handlarborsen_scb_live_preview_candidates | 20261102070352 | cf12468800265c9b54f42fdaa5f27f2eadb9357eb6ede833d95b5f3a0a3f26b7 |
| sales_editorial_only_drafts | 20261102095321 | 072897c68f1ed2d85b0f84bed1f5214bb56f9290170b58e8d3c284012e5d7ec1 |
| sales_initial_sending | 20261103082558 | 9fc16dd5406ed097cd6bbcb2740c9a6eb235202a3aa5cb9433d45a436f32658c |
| project_total_allowance | 20261104104329 | 3522149a5519af153655c1f7fbb5348063306af13311edfb344ac8db8ed979e2 |

Source comparison against actual schema_migrations.statements passed for all four after line-ending normalization and stripping only surrounding transaction/session timeout wrappers. Sources were copied unchanged from atlas-builder-references-20261017. Main's historical ledger fixtures remain unchanged; current synthetic fixtures explicitly include these five release names.

## Verification
- 40/40 PostHog Node tests passed, including denied/stale/forged purpose-scoped requests.
- 46/46 migration guard Vitest tests passed.
- Focused PostHog TypeScript graph (including review UI and routes) passed.
- Actual production guard passed: 160/160 enforced, 197 known unique ledger names; frozen grandfathered 14 / legacy-only 30 lists unchanged. No override.
- Broad local typecheck is not green using reused isolated dependencies: missing @omnira/local-text-contract, @vercel/functions and Playwright dependencies cause unrelated errors. It is not evidence of a full app pass.
- Remote SQL/REST verified RLS/ACL and denial without a grant. Private key diagnostic previously returned one dashboard. Full authenticated UI/provider read remains to be checked on deployment.

## Operations
Only POSTHOG_* server environment settings are added. Private key is sensitive, never public or committed. Old production code is unchanged until release.
Disable POSTHOG_APPROVED_READ_ENABLED and redeploy to stop future reads; every read still needs a current exact grant.
Rollback candidate: dpl_CDyRm9XbMH8LBu8jJBrUfB89nfmV.
