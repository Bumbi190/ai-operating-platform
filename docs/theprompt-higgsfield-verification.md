# Higgsfield read-only implementation: verification and decisions

2026-10-22. Base main 139a45c. Branch codex/theprompt-video-design-20261022. Isolated Windows worktree, Node 22.22.3, SDK @modelcontextprotocol/client 2.3.1.

## Delivered scope

Project-owned encrypted OAuth and a vNext Settings panel that reads balance, model parameters and one fixed price quote. No generator registered, no media cron, SimpleNewsReel, social-token or provider-registry changes. No production migration, deployment, paid generation or real-account inspection was performed.

## Evidence

- Focused seven-file Higgsfield Vitest suite: **68/68 PASS** after review fixes. Includes official SDK OAuth against a synthetic HTTP provider, real Next route handlers, cryptography, store adapter, tool allowlist, lifecycle and UI controller/SSR.
- Typecheck: **PASS**, npm run typecheck --workspace=apps/web, exit 0 after fixes.
- SQL: **PASS**, migration and apps/web/supabase/tests/higgsfield_mcp_readonly.sql applied to fresh isolated PostgreSQL 17 database higgsfield_final. Covers denied anon/authenticated CRUD/RPC, RLS, SECURITY INVOKER, actor/state expiry/replay, version CAS, active/expired refresh leases and disconnect.
- UI: **PASS**, actual compiled React panel in Chromium, desktop 1100x750 and mobile 390x844; no mobile overflow, explicit project request, zero balance, and unavailable backend. Stubbed API; not live consent.
- Build before review fixes: **PASS** with process-local nonsecret public Supabase placeholders pointing at an unused localhost port. First attempt without public configuration compiled but failed prerendering existing forgot-password/update-password pages. Final post-fix rebuild also **PASS**, exit 0 (65.02 seconds), using the same process-local public placeholders. No production secrets were read.
- Whole web suite: **FAIL**, 127 failed / 526 passed / 35 skipped files; 421 failed / 13552 passed / 1397 skipped tests, 679.46 seconds. Command: npm test --workspace=apps/web -- --maxWorkers=1 --minWorkers=1. Ran before final review fixes. Full failing-name inventory: [theprompt-higgsfield-full-suite-failures.md](theprompt-higgsfield-full-suite-failures.md). Windows/POSIX command failures, missing fixtures and stale baselines are present; this is not a base comparison, so no assertion that all failures predate this branch. Broad CI/triage remains a merge gate.
- Local SQL checks replace hosted schema advisors for this unapplied migration. Hosted advisors were not claimed run.
- Live Clerk callback, authenticated tool schema compatibility and unchanged credit balance: **NOT TESTED**. Runbook requires reviewed deployment/configuration and operator consent before smoke.

## Independent review

One fresh whole-branch review of 139a45c..98ca1cd. A transient model-capacity error interrupted the review; the same review resumed, without a second review of fixes. No Critical findings. Two Important findings fixed in one TDD pass:

1. SDK auth recovery logged raw provider error_description and retried the code. Actual-driver invalid_grant and invalid_client sentinel tests failed first, then passed. Rejected token/registration responses now stop at a sanitized HTTP boundary before SDK parsing; exactly one exchange and no console warning.
2. Fetch abort did not settle an SDK request reading hanging SSE. Actual SDK hanging-stream and shared refresh/open deadline tests failed first, then passed. Inspection now carries one absolute 20-second provider deadline through refresh, initialization and requests, with SDK request cancellation and transport closure.

Deferred minors:
- A 401 during tools/list bypasses readiness refresh normalization. Inspection can report unavailable; reconnect may be required.
- A transient inspection failure disables another inspect until reload/reconnect.

## Rulings, in decision order

1. Bundled task-start/task-done/sdd-workspace and writing-good-tests helper resources were unavailable. Equivalent manual ledger with bases/commands/results used. Cost if wrong: reconstruct bookkeeping from git/test evidence.
2. Resource metadata advertises Clerk while root metadata advertises a proxy. Pin the resource-bound Clerk issuer. Cost if wrong/provider changes: refuse connection until reviewed.
3. Add a server-only pending-state project peek to recheck ownership before consuming state. Cost if wrong: callback refusal.
4. Generated Database types omit the unapplied migration. Use a narrow nine-name typed RPC port, without weakening shared types. Cost if wrong: runtime RPC mismatch; local adapter/SQL checks provide coverage.
5. Expired abandoned refresh leases must permit a new OAuth save, while active leases exclude it. The SQL regression failed first, then passed. Cost if wrong: overwrite a live refresh; active-lease tests cover exclusion.
6. Leave reviewer-declined live callback/schema/credit behavior explicitly untested because configuration, deployment and consent are outside this delivery. Cost if wrong: provider compatibility remains unknown until smoke.
7. Validate the unapplied schema with real isolated PostgreSQL ACL/RLS/invoker tests rather than hosted advisors. Cost if wrong: advisor findings may remain for deployment review.
8. Deliver the already-authorized draft PR with exact broad-suite failures, without merge, following the approved plan rather than the finishing skill's green-suite integration menu. Cost if wrong: additional CI/triage is required before merge readiness.

The per-plan ignored test workspace is disposable after this evidence is committed. The feature worktree and branch remain for PR follow-up.
