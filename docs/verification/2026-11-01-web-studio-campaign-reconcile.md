# Web Studio — campaign/main reconciliation

Date: 2026-11-01. Baseline7601f9eee3354ba60ef30b664aaf9bfe3edb5d0c; pinned maincb909318ea820a92aa30324caa09d9ab42041d75. Existing branch/worktree/PR368 retained.

## Scope and authority
The owner approved continuation of the proposed combined integration and CI/preview round. Integration is main INTO this feature branch only. Same draft PR and existing protected test/preview jobs; no main update, production/schema/flag changes, paid model call or publishing. No new branch, dependency, cloud test database or protection bypass.

## Reconciliation
Both text conflicts were in migration-guard-policy.mjs and migration-guard-v2.test.ts. The exact pinned-main versions retain both prior exact-claim and newly applied social_campaign_preparation history. Source169/enforced155; frozen14/30 sets and evaluation algorithms unchanged. Historical190/191-name snapshots remain immutable and are now explicitly expected to fail as incomplete; current192-name observation is separate.
Read-only hosted aggregate at2026-11-01T07:22:54.252595Z:192 rows/distinct names; ordered-name MD5540830b1a6f3dadca18bbd1e8abd0392. The prior191-name list plus the single campaign name exactly matches that count/digest. The current snapshot is honestly labelled reconstructed/digest-matched, not a fresh full-array extraction.
Upstream canonical campaign filename20261101062259_social_campaign_preparation.sql differs from hosted registration20261101062748 by upstream design; do not rename or apply it again. Exact LF SHA2561c2606bbb98cb3192b4a240b017fc6452a005e93d81183ae8373e11c97367aa1 matches the reviewed source.

## Preserved boundaries
The showroom/component/template/assets/worker/compiler, month-to-date revenue fix, existing showroom/browser specs and all package/lock files are unchanged from baseline. Campaign/drain/checkpoint/provider-policy sources and security registry exactly match pinned main. The chat auto-merge retains Studio's explicit reference-save early path, original reference restrictions and internal-principal context, alongside the campaign tools. Campaign enablement still requires explicit flag, enforced spend gate and allowed project; no configuration or live invocation was performed.

## RED/GREEN
- Four new reconciliation tests first failed before source integration: missing source, unknown live name and historic ledger incorrectly still accepted. They now pass and retain missing/duplicate/unknown checks.
- Initial merged69-source cases:65 passed/4 failed old expectations. Updated historical-versus-current assertions without changing old evidence.
- Combined364 contract cases:363 passed/1 failed Studio prompt length9039 against existing9000. Shortened three planning sentences by107 characters without changing any approval/staleness/secrets/page-scope requirements or test limit.
- Final campaign/Studio subset:504/504 passed, no pending.
- Final references/guard subset:185/185 passed, no pending. Actual anti-skip JS accepts the full report and rejects one missing the new four-case suite. Existing workflow triggers, permissions, concurrency, job count and timeout unchanged; the already-merged upstream campaign workflow is preserved, not newly designed here.
- Full actual Studio UI/HTTP/PostgreSQL/worker run: **25/25 passed**, zero skipped/flaky/unexpected cases, no retries. Auth/model responses are fixtures, not real GoTrue login or inference. Runc547e7f3-004d-4b39-b0f4-9e31b7a3b2ad; owned temporary container removed. Desktop/mobile revised showroom screenshots visually inspected. Global unrelated-container inventory before/after: 42/42; difference {"removed": [], "added": []}.

## Review and remaining proof
A deliberate manual second pass verifies source hashes, preserved protected paths, exact upstream campaign code, frozen policy, historical evidence and early reference-save separation. This is not independent review or a penetration test.
Full TypeScript is deferred to the existing Linux CI path rather than repeating earlier host OOM under memory pressure. Prior successful baseline7601 Linux typecheck is historical and not evidence for this merged tree. Full repository tests remain previously known red at mission-brief-v1:384; this integration does not claim a broad green suite. Real Auth/browser login, real model quality and production release are separate gates; the local Studio fixture uses synthetic auth identities and deterministic model output.
Remote results for the eventual commit must be checked independently and recorded in the project handoff. A source/ledger snapshot is not proof that a protected Vercel deployment has built or that main has not changed since capture.

## Evidence
Plan: docs/superpowers/plans/2026-11-01-web-studio-campaign-reconcile.md
Scratch: .superpowers/sdd/2026-11-01-web-studio-campaign-reconcile/ (preflight, red, merge, contracts, references, anti-skip and manual review).
Observation: docs/verification/2026-11-01-web-studio-campaign-observation.json.

Immediately before planned protected push: read-only ledger at2026-11-01T07:35:03.688463Z still192distinct, same ordered-name digest; GitHub main still pinnedcb909318. These are point-in-time observations, not locks. No production modifications.
