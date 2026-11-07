# Web Studio isolated SQL roundtrip

> Execute inline on existing PR #368 under the accepted Web Studio v0.5 plan. Baseline 89286a6. No new branch, push, hosted schema or paid inference.

## Goal and boundaries
Prove that explicit visual preferences survive actual PostgreSQL save/read, mockup review, approved build pinning and a subsequent versioned feedback change. Reuse the canonical website fixture/migrations and worker. Provider output is deterministic test data, not a real AI generation claim. Synthetic auth identities/SQL roles are not a GoTrue/browser-login proof.

Ruling: The real Auth/Storage four-service stack remains Linux/CI only. The current host has >2GiB free and a cached postgres:17-alpine image. Run just ONE new resource-capped PostgreSQL container, network=none, no ports, no host mounts, tmpfs storage and fresh identity; never reuse/restart the old fixed-name fixture or any existing services. This is a narrower SQL proof, not a replacement for full Auth CI. Abort if resources or identity cannot be verified. Remove only this run's verified container afterwards.

## Work and tests
1. Test-first helper for existing legacy test target versus explicit unique run-bound target. Reject incomplete/invalid IDs, arbitrary container names, wrong ownership, exposed ports/host mounts, unbounded memory. Preserve existing default behavior.
2. Reuse helper in test-only DB scripts/transport. Add a bounded runner for exactly the integration test and existing mockup tests. No production code, dependencies or migrations are modified. No catch-and-skip success.
3. Add real-SQL integration: palette/font persistence and canonical hash; three retained mockups; approval gates; stale selection denial after a color revision; immutable old version; cross-owner read denial; initial build then color-only feedback producing two correct version receipts and unchanged page scope.
4. Run negative controls for the new assertions by mutating test fixtures or omitting visual data before the boundary, never weakening production checks. Run actual SQL tests. If a fixture issue is found, identify its cause and fix only test infrastructure.
5. Run focused regressions, web TypeScript and broad npm test with stop-on-first-failure (the full Windows suite is already known red). Label unrun/blocked boundaries accurately. Manual second-pass review unless an independent reviewer is actually invoked. Local commit and handoff only.

## Evidence
Preflight: `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/preflight.json` returned reuse_existing / explicit_existing_pr. Old fixture `omnira-website-build-test-20261014` exists stopped and must remain untouched.
Record each run/command, assertions, resource lifecycle and failures in the verification report. No success claim for live Auth, model quality, complete production migrations, deployment or broad all-tests-green.

## Execution ledger
- Reused existing linked worktree at 89286a6; read repo/Notion rules and live PR; preflight reuse_existing.
- Guard tests initially failed on missing target helper; implementation passes six guard/opt-in cases. No new production feature was required to make the SQL roundtrip pass: the prior visual metadata change is now verified against real PostgreSQL.
- First real run: 16/16 (four new flow cases plus 12 existing mockup checks), bootstrap SQL checks passed and new container removed.
- Expanded run: 53/53 across visual flow, mockup approvals, bootstrap and the entire existing worker suite. Existing cancellation/fencing/recovery/idempotency checks included. Owned resources removed, all 42 pre-existing container IDs/names retained.
- 147 focused code regressions passed; full web TypeScript passed. Broad npm test --bail=1 stops at unchanged mission-brief-v1 public-status-list assertion; no broad-green claim.
- Test-only changes; no packages, hosted schema, real Auth stack, external model call, branch push, merge, deploy or customer effect. Real session/login and model quality are NOT established by these SQL fixtures.
- Second manual review performed; no separate independent reviewer invoked. Retain owned evidence and worktree; do not restart the old stopped fixture.
