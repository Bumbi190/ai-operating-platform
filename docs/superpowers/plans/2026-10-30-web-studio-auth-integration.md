# Web Studio authenticated reference integration plan

> For agentic workers: use superpowers:executing-plans inline; existing owner authorization and execution method continue. One fresh read-only review at the end.

**Goal:** exercise actual Studio server handlers through real local Auth sessions, PostgREST, private Storage and PostgreSQL, including immutable chat persistence and cross-user denial.
**Architecture:** isolated four-service cached-image Docker fixture, fresh random credentials/network/tmpfs, loopback-only gateway and capped resources. Vitest supplies only the Next request cookie context; Supabase clients, authorization, routes, normalizer, storage admission and SQL run unchanged.
**Tech Stack:** existing Node22/Vitest/Supabase SSR+JS/sharp, PostgreSQL17, cached GoTrue2.197.0/PostgREST16.5/Storage1.79.36.
**Spec:** existing 2026-10-30 main-reconciliation/security follow-up plans and OMNIRA_WEB_STUDIO_MASTERPLAN_V05_2026-10-30.md.

## Constraints and rulings

Same DraftPR368/worktree; no main merge, production config/SQL, hosted test branch, customer data, paid provider or new image pull. Min2GiB host free before start; service caps384+128+96+384MiB, no swap. Local RAM dropped below1GiB, so the actual stack runs in the existing GitHub CI workflow; pinned image pulls occur only on that ephemeral runner. Stop/clean owned resources only. No existing container/database reuse. No real credentials loaded.
This server integration is a necessary step toward browser E2E; it does not claim Next middleware/router, actual browser login or production schema migration replay. The fixture application schema is explicitly synthetic; exact proposed ticket/binding SQL and canonical asset migration are reused where possible.

## Review focus

- A malformed session must not be accepted because the test chose a user ID.
- A second real user cannot issue/finalize/read/bind another owner's reference.
- Signed tokens cannot upload another path, overwrite a staged object or read privately.
- Exact retries preserve one message/manifest; altered retries fail.
- Setup/assertion failure cleans all uniquely labelled test resources and never touches others.

### Task 1: bounded isolated stack and fixture safety
Files: scripts/reference-local-stack.mjs, scripts/reference-local-stack.test.mjs, assets/fixtures/reference-auth-bootstrap.sql.
- [ ] Write guard tests: no opt-in/nonloopback/invalid port refused, valid fixture accepted; run RED for missing implementation.
- [ ] Implement opt-in guard, cached-image startup, readiness, fresh keys, private gateway, SQL helper, labelled cleanup and memory limits.
- [ ] Apply minimal app schema after real Auth/Storage migrations; apply exact ticket and binding SQL, canonical asset schema.
- [ ] Run guard tests GREEN and real health checks; inspect cleanup on failure.

### Task 2: real authenticated handler integration
Files: lib/qa/website-reference-auth.integration.test.ts, vitest.reference-auth.config.ts, scripts/reference-auth-local-test.mjs.
Consumes: startReferenceStack() -> {url,anonKey,serviceKey,sql(),close()}.
- [ ] Real admin creates two synthetic users; SSR password sign-in yields cookie sessions. Next headers adapter returns that request's cookie jar only.
- [ ] Assert anonymous/tampered cookies401, real owner ticket201, wrong user404, valid signed upload then canonical WebP/private read.
- [ ] Assert wrong path/replay/public/anonymous Storage denial; rejected bytes and stopped project denied.
- [ ] Actual chat POST202, exact retry same receipt and one SQL row/manifest, changed text409, foreign-user/context denied, no remote provider traffic.
- [ ] Run integration serially at512MiB, then relevant regression/browser/type checks and broad test command; report all failures.
- [ ] Fresh reviewer, fix Important findings with RED/GREEN, commit/push same PR and verify exact-SHA CI; update PR and Notion.
