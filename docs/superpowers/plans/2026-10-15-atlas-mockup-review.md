# Atlas Mockup Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with one independent whole-branch review.

**Goal:** Agree the brief, compare three mockups, approve one and build against its immutable reference.

**Architecture:** Extend existing plan/store/API and static compiler. Immutable mockup drafts and operator decisions are scoped to a plan revision; SQL pins a reference into each new build session and rejects unsupported workers.

**Tech Stack:** Existing TypeScript, React, Next.js, Supabase SQL, Vitest and Playwright. No new runtime dependency.

**Spec:** docs/superpowers/specs/2026-10-15-atlas-mockup-review-design.md

## Global Constraints
- No paid provider tests, top-ups, budget changes or Lumvy recovery reactivation.
- Preserve all approved pages and existing previews;100 SEK monthly budget.
- Ordinary queue/worker only; never force a claim or bypass stop/lifecycle rules.
- User has authorized correction, testing, review, merge and publication.

## Review Focus
- A stale tab or changed plan must not approve or build against another revision.
- A foreign project, mockup id or fabricated hash must not disclose or approve a reference.
- Refresh, retry and duplicate clicks must not create duplicate decisions or runs.
- An old deployment must fail before dispatch instead of ignoring the design reference.
- Mobile comparison must remain usable without losing the chat draft or hiding stop/cost controls.

### Task1: Deterministic reviewed design drafts and optional design knowledge
**Files:** new planning/mockups.ts and mockups.test.ts; design registry, bundle builder/lock and pinned skill materials.
**Interfaces:** createWebsiteMockups(content:PlanContent) returns three canonical drafts with stable keys, labels, summaries and SHA256; validateMockupReference verifies canonical bytes and strict compilation.
- [ ] Write tests for deterministic distinct responsive drafts, full page list, escaped hostile text, no invented facts, no external resources and tampered references.
- [ ] Run Vitest: expected feature failures RED.
- [ ] Implement renderer/validation. Add pinned UI UX Pro Max knowledge without executing upstream installers.
- [ ] Run renderer, artifact and skill suites: expected pass. Commit.

### Task2: Durable operator design review and build-reference pinning
**Files:** migration20261015210000_website_mockup_review.sql; planning/types.ts, store.ts, API routes; types.ts, store.ts, prompt.ts, worker.ts; SQL fixture wiring/tests.
**Interfaces:** read/preparePlanMockups returns private revision-bound records; approveWebsiteMockup accepts exact plan ref, mockupId, sha256 and intent; PlanView.designReview reports required, options and approved; BuildSnapshot.designReference carries canonicalDraft and sha256.
- [ ] Write SQL tests that current code allows approval without design review, and worker tests that reference is absent/unsupported workers are accepted. Observe RED without provider calls.
- [ ] Add immutable mockup records/decisions with RLS and service-only RPCs; grandfather only pre-existing revisions. Add SQL decision/session pinning and designVersion writer fence.
- [ ] Wire APIs and worker validated reference. Retain existing pause/cancel/budget/recovery logic.
- [ ] Run new SQL tests plus planning, worker, isolation and migration tests serially: expected pass. Commit.

### Task3: Plan agreement and mockup comparison UI
**Files:** AtlasPlanCard.tsx, AtlasBuildSurface.tsx, new WebsiteMockupReview.tsx/CSS, planning/chat-tools.ts, controller integration, fixture routes and browser tests.
**Interfaces:** preview proposals in the existing studio Preview surface; approval refreshes the exact plan state without a model turn; ordinary plan approval stays blocked until the receipt exists.
- [ ] Add browser regression for three proposals, mobile comparison, explicit selection before build, stale selection, persisted approval after reload and unchanged chat draft. Observe RED.
- [ ] Implement responsive proposal gallery and approval. Update planning guidance and UI wording to distinguish visual proposals from ready websites.
- [ ] Run studio/UI/browser and typecheck serially where SQL is shared. Inspect screenshots. Commit.

### Task4: Review and release
- [ ] Run repository-required checks; report existing unrelated failures accurately.
- [ ] Independent exact-head whole-branch review; resolve material findings with RED/GREEN evidence.
- [ ] Push PR, check exact-head CI and merge with locked head SHA.
- [ ] Apply reviewed additive migration in production before new-code activation, preserving old live builds. Verify ACLs.
- [ ] Verify READY merge deployment and both domain aliases, current session/preview and project cost. No new paid generation.
