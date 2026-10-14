# Atlas build workspace validation

Implementation in progress; no activation or production migration.

## Baseline before runtime implementation

436 files; 72 failing files; 367 failed tests; 12022 passed; 1110 pending. Full suite was run on this exact clean feature worktree before new artifact implementation. Windows FIND/path/CRLF failures and other existing fixture failures are not silently excluded.

- apps/web/lib/qa/activity-stream.test.ts
- apps/web/lib/qa/admission-inventory.test.ts
- apps/web/lib/qa/analysis-draft-sql.test.ts
- apps/web/lib/qa/atlas-chat.test.ts
- apps/web/lib/qa/atlas-knowledge-boundary.test.ts
- apps/web/lib/qa/atlas-knowledge-snapshot.test.ts
- apps/web/lib/qa/atlas-launcher-vnext.test.ts
- apps/web/lib/qa/atlas-memory-dream-producers.test.ts
- apps/web/lib/qa/atlas-memory-emit-durability.test.ts
- apps/web/lib/qa/atlas-memory-terminal-outcomes.test.ts
- apps/web/lib/qa/autonomy-bind-guards.test.ts
- apps/web/lib/qa/autonomy-license.test.ts
- apps/web/lib/qa/autonomy-runtime-foundation.test.ts
- apps/web/lib/qa/autonomy-trace-guards.test.ts
- apps/web/lib/qa/budget-scopes.test.ts
- apps/web/lib/qa/canonical-evidence-pin.test.ts
- apps/web/lib/qa/cl-shadow.test.ts
- apps/web/lib/qa/content-center.test.ts
- apps/web/lib/qa/delegation-mission-activation.test.ts
- apps/web/lib/qa/desktop-commander-unlicensed.test.ts
- apps/web/lib/qa/execution-contract-propagation.test.ts
- apps/web/lib/qa/executive-brief-apex.test.ts
- apps/web/lib/qa/executive-intelligence-schema-activation.test.ts
- apps/web/lib/qa/external-dispatch-guards.test.ts
- apps/web/lib/qa/global-auth-retired.test.ts
- apps/web/lib/qa/global-design-tokens.test.ts
- apps/web/lib/qa/leads-dual-accept.test.ts
- apps/web/lib/qa/leads-legacy-auth-removed.test.ts
- apps/web/lib/qa/legacy-v1-api-removed.test.ts
- apps/web/lib/qa/licensed-bind-m4b-guards.test.ts
- apps/web/lib/qa/marketing-review.test.ts
- apps/web/lib/qa/media-orchestration-retry-authority.test.ts
- apps/web/lib/qa/media-token-authority.test.ts
- apps/web/lib/qa/memory-vnext.test.ts
- apps/web/lib/qa/mission-brief-v1.test.ts
- apps/web/lib/qa/mobile-chrome-contract.test.ts
- apps/web/lib/qa/money-overview.test.ts
- apps/web/lib/qa/monthly-release-v2.test.ts
- apps/web/lib/qa/muapi-media-provider.test.ts
- apps/web/lib/qa/platform-credential-events.test.ts
- apps/web/lib/qa/project-api-credentials.test.ts
- apps/web/lib/qa/project-command-center.test.ts
- apps/web/lib/qa/project-workspace-vnext.test.ts
- apps/web/lib/qa/release-gate-proof-workflow.test.ts
- apps/web/lib/qa/review-queue.test.ts
- apps/web/lib/qa/run-bound-provider-spend.test.ts
- apps/web/lib/qa/schema-security-invariant.test.ts
- apps/web/lib/qa/scoped-read-isolation.test.ts
- apps/web/lib/qa/sdf1b2-code-work-operator-plane.test.ts
- apps/web/lib/qa/sdf1c-broker-claim-credential.test.ts
- apps/web/lib/qa/sdf1c-trusted-broker.test.ts
- apps/web/lib/qa/sdf1c2-broker-control-channel.test.ts
- apps/web/lib/qa/sdf1c3-isolation-integration.test.ts
- apps/web/lib/qa/sdf1c3-isolation-substrate.test.ts
- apps/web/lib/qa/session-only-routes.test.ts
- apps/web/lib/qa/social-credentials.test.ts
- apps/web/lib/qa/spend-financial-decoupling.test.ts
- apps/web/lib/qa/stop-authority-authorization.test.ts
- apps/web/lib/qa/survival-funding-sql.test.ts
- apps/web/lib/qa/survival-history-sql.test.ts
- apps/web/lib/qa/system-health.test.ts
- apps/web/lib/qa/vnext-intelligence-graph.test.ts
- apps/web/lib/qa/vnext-settings.test.ts
- apps/web/lib/qa/workflows-definition-familje-stunden.test.ts
- apps/web/lib/qa/youtube-project-oauth.test.ts
- apps/web/lib/architecture-knowledge/architecture-knowledge.test.ts
- apps/web/lib/architecture-knowledge/executive-knowledge.test.ts
- apps/web/lib/trading/market-data/import-discipline.test.ts
- apps/web/lib/trading/market-view/import-discipline.test.ts
- apps/web/lib/trading/provider-normalization/recorded-adapter.test.ts
- apps/web/lib/trading/replay/import-discipline.test.ts
- apps/web/lib/trading/session-calendar/import-discipline.test.ts

## Task 1

Artifact tests: observed 29 failures before implementation, then 29/29 pass. Typecheck exit 0. Multi-page files, UTF-8 export, immutable hash, hostile markup rejection, interaction runtime, CSP, and non-delivering form notice covered. Browser behavior remains to be verified in tasks 5/6.
