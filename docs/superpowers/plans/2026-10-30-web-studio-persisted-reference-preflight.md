# Web Studio persisted reference preflight Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this authorized first delivery.

**Goal:** Verify selected private reference images against an actual persisted user message before a future governed multimodal dispatch.
**Architecture:** Extend the existing reference seam in PR #368. Read the exact conversation_messages row through an inner owner/project conversation join before and after private image resolution. No transport activation.
**Tech Stack:** Existing TypeScript, Supabase query interface and Vitest; no added dependencies.
**Spec:** C:/Users/Andre/Projects/Omnira/Docs/OMNIRA_WEB_STUDIO_MASTERPLAN_V05_2026-10-30.md; accompanying handoff; existing 2026-10-17 reference slice.

## Global Constraints
- Continue codex/atlas-builder-references-20261017 / PR #368, baseline 4bf8843.
- No production, SQL migration, provider call, cost, credentials or parallel worktree modification.
- Keep ATLAS_REFERENCE_UPLOAD_ENABLED OFF by default.
- A validated read receipt is NOT durable attachment persistence, turn freshness proof, execution authority or a model invocation.
- The future transport must obtain active.turnId from its completed server insert, never from a client selector/history. Current chat route still lacks this wiring.

## Inventory and reuse
| Part | Observed | Next use / risk |
|---|---|---|
| Studio UI, chat and preview | Present | Reuse; test fixtures do not prove authenticated live provider flow |
| Three layout choices and operator approval | Present | Reuse; CSS/HTML layouts are not image-generated mockups |
| Static build worker and versioned feedback | Present | Reuse for initial slice; cannot execute arbitrary React/WebGL |
| Private reference upload/read | PR #368 draft | Continue here; missing persisted message binding and multimodal transport |
| Creative tools | #450 draft, later security worktrees | Reuse reviewed contracts later; never activate an interactive-account worker implicitly |
| Repository catalogue | #605 draft | Future project binding; not live repository creation |
| Campus / Blender POC | Existing isolated 3D worktree and temp assets | Later quality/resource-controlled adapter, not a customer-ready engine |
| Design skills | Worker explicitly composes design-taste-frontend and impeccable | Reuse existing registry, no reinstall |
| model-viewer | Apache-2.0, active upstream | Later isolated comparison with existing Three.js path |
| spindle | MIT, small upstream | Later evaluate accessibility/mobile vs own small viewer |
| REA morluto/rea | MIT, active upstream | Defer install; no need for binary analysis in this slice |

## Delivery order
1. This delivery: persisted-message preflight with negative/regression tests.
2. Server-generated chat message identity, durable immutable attachment manifest, retries and real authenticated test.
3. Governed image-capable model input + budget receipt; explicit UI attachment selection.
4. Reference-informed desktop/mobile mockups and approved functional scope; preserve existing approvals.
5. Complete initial static build -> chat edit -> tested preview, rollback and acknowledged cancellation.
6. Separate React/3D execution adapter; fictional car dealer and clearly distinct photo-360 / GLB / video.
7. Per-site private repository and staging; explicit production authorization later.

## Review Focus
- Foreign/missing parent conversation must deny before image reads.
- A tool/assistant message or changed text must deny.
- Parent/message may change while storage awaits: recheck before returning.
- Database failure must deny without leaking rows or content.
- Receipt hashes must bind owner, project, conversation, message ID, exact text and ordered image provenance.

### Task 1: Persisted-message validation
**Files:** Modify apps/web/lib/website-build/assets/turn-references.ts; create persisted-turn-references.test.ts beside it.
**Consumes:** Existing prepareReferenceTurn, active server turn identity and ProjectAccessOk.
**Produces:** preparePersistedReferenceTurn(db, owner, raw, active) -> PreparedReferenceTurn & {bindingSha256:string}.
- [ ] Write tests for real scoped row lookup, expected hash, missing/foreign/user-role/text checks, DB errors, mid-read revocation, switched scope and feature OFF.
- [ ] Run new test RED because export is absent.
- [ ] Implement shared early scope checks, two bounded exact-row reads and hash receipt.
- [ ] Run new tests GREEN, reference suites and all website-build tests with one worker.
- [ ] Typecheck if resource budget permits; record limitations. Review and commit only scoped files.

## Validation limits
Unit tests inject a DB query double and image reader. They prove adapter behavior, not real SQL/RLS, signed-in browser behavior or actual model consumption. No whole-product completion claim.

## Progress

### Session evidence, 30 October 2026
- Existing isolated worktree verified: git-dir differs from common-dir; no superproject; clean baseline 4bf8843. Canonical worktree's unrelated changes preserved.
- Baseline reference assets: **37/37 PASS** in 6 files.
- New persisted-message tests: **19/19 observed RED** (missing export), then **19/19 GREEN**.
- Current reference assets regression: **56/56 PASS** in 7 files, exit 0.
- Website-build subtree: **220 PASS / 40 FAIL / 102 SKIP**, 24 passing and 18 failing files, exit 1. All reported failures originate from the unprepared isolated SQL fixture (WEBSITE_BUILD_TEST_DATABASE_NAME / missing task3-db-setup.log). No other project's container/database was reused.
- Failing website-build suites: api, worker, connections/api, planning/api, planning/build-context, planning/chat-tools, planning/concurrency, planning/conversation-workspace, planning/export-pinning, planning/mockup-store, planning/store, chat-tools, test-db-bootstrap, studio/api, studio/budget, studio/loader, studio/output-allowance, studio/store.
- Full project npm test was also attempted with one worker. It showed additional failures outside this change and was stopped after approximately three minutes; **NO full-suite pass/count is claimed**. Vitest/node test processes were confirmed absent after termination. The first DC termination response was ambiguous, so absence was verified separately.
- Full web tsc with a deliberately bounded 1024 MiB heap hit OOM (exit 134). **Not a successful whole-app typecheck.**
- Targeted tsc using a temporary config extending the real web tsconfig and including the changed source/test plus their dependency graph: **PASS, exit 0**, 768 MiB heap, empty diagnostic log.
- Fresh read-only code review: **no Critical/Important findings**, approved the bounded unwired seam. Reviewer checked generated schema and the conversation FK as well as scope predicates.
- Deferred minors: add regression cases for rejected query promises and mutation of caller inputs while I/O awaits. Existing paths were inspected; neither is a release blocker for this unwired seam.
- git diff --check: PASS (Windows LF/CRLF notices only).
- No live SQL, secret access, model calls, package install, image generation, hosting or production change.

### Rulings
- Reuse PR #368 rather than merge unrelated #450/#605 or create a new PR. This preserves branch ownership and avoids a new PR chain; live integration still needs current-main reconciliation.
- This delivery verifies a stored message by read; it intentionally does not pretend to have durably persisted the image-message association. Next delivery needs a server-created current-turn identity, immutable manifest/idempotency and authenticated database tests before multimodal dispatch.
- Keep whole-product release blocked rather than alter unrelated failed suites or borrow the historical SQL container. Cost: browser/live build-loop validation remains pending.

### Upstream checks (read-only)
- google/model-viewer: Apache-2.0, not archived, pushed 2026-10-23. Candidate for later GLB orbit/hotspots; existing custom Three.js path remains relevant.
- tegos/spindle: MIT, not archived, pushed 2026-06-02. Small project; mobile/accessibility/security audit still required before import.
- morluto/rea package.json at observed blob 177a2a62f8cdb9a3e7e6c1b8afae700ac055bea8: version 6.8.0, MIT, engines ^22.23.4 || ^24.22.1 || >=26.12.1. Hultgren Node v22.22.3 is **below** this current floor. Do not install reflexively.
- These metadata checks are a shortlist comparison, NOT a completed dependency/security audit. No candidate installed.
