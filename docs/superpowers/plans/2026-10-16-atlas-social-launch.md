# Atlas Social Launch — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Sequential native execution keeps context/CI costs down; independently review the final branch before merge.

**Goal:** Let an operator and Atlas save and review a six-channel plan for each project, with truthful account/adapter readiness and links to the existing connection controls.

**Architecture:** Keep intended channels separate from canonical verified social account bindings and publishing authority. Reuse existing project access and settings metadata; save immutable plan revisions and operator decisions through server-only routes. This increment makes no provider calls and cannot publish or generate paid media.

**Tech Stack:** Next.js App Router, TypeScript/React, Supabase Postgres/RLS, Vitest and Playwright.

**Spec:** docs/superpowers/specs/2026-10-16-atlas-social-launch-design.md

## Global Constraints

- Supported channel catalogue: youtube, facebook, instagram, linkedin, x, pinterest.
- A proposed channel, a verified account connection and permission to publish are separate facts.
- A channel selection never creates an account, grants authority, changes credentials or dispatches publishing.
- Keep project budgets unchanged. No paid model/image/video tests, credit purchases, new subscriptions or budget increases.
- Existing Lumvy preview and its approved three-page plan are preserved.
- Names are display labels, never authorization. Resolve existing project UUIDs through authorized project access.
- Run shared-DB suites sequentially.

## Review Focus

- A changed project/conversation during an in-flight read must not show or save the previous project's choices (Tasks 2–4).
- Unreadable binding or health data must not become a missing/healthy/connected account (Tasks 1, 3).
- A proposed revision or model-supplied approval must not become an operator decision (Tasks 2, 4).
- Selecting LinkedIn/X/Pinterest must not imply an adapter, account connection, publication or price has been verified (Tasks 1, 3).
- Stale concurrent edits and retried requests must preserve the newer revision without duplicates or silent overwrites (Tasks 2, 3).

## Task 1: Six-channel catalogue and pure readiness contract

**Files:**
- Create apps/web/lib/social-launch/types.ts
- Create apps/web/lib/social-launch/catalog.ts
- Test apps/web/lib/social-launch/catalog.test.ts

**Interfaces:**
- Produces SocialLaunchChannelId (the six exact channel IDs), SocialLaunchChoice, SocialLaunchRevision and SocialLaunchView.
- Produces parseSocialLaunchChoices(input:unknown):SocialLaunchChoice[] and describeSocialLaunchReadiness(input:SocialLaunchReadinessInput):SocialLaunchReadiness.
- Readiness input contains plan selection, source readability, existing binding/credential health and actually implemented adapter capabilities; no secrets.

- [ ] Write failing tests: six channels exactly, reject TikTok/unknown/duplicate channels and excessive text; selected Pinterest without an adapter is planned/unavailable, never connected; unreadable source remains unreadable; existing verified Instagram binding does not imply publication authority.
- [ ] Run from apps/web: npx vitest run lib/social-launch/catalog.test.ts; verify expected RED.
- [ ] Implement the closed catalogue and readiness mapper. Labels: YouTube, Facebook, Instagram, LinkedIn, X, Pinterest. Pinterest guidance names Familje-Stunden as intended first project; LinkedIn guidance names Handlarbörsen and company Page, without choosing/authorizing a project by its name.
- [ ] Run the same tests, verify GREEN and commit.

## Task 2: Owned project plans, immutable revisions and operator decisions

**Files:**
- Create apps/web/lib/social-launch/store.ts
- Test apps/web/lib/social-launch/store.test.ts
- Create a migration via Supabase CLI: social_launch_plans_v1 (use generated filename).
- Update existing migration/schema integrity metadata through the repository's documented procedure.

**Interfaces:**
- Consumes Task 1 types/parser.
- Produces readSocialLaunchPlan(db,principal,{projectId,conversationId}):Promise<SocialLaunchView>.
- Produces proposeSocialLaunchPlan(db,principal,{projectId,conversationId,expectedRevisionId,idempotencyKey,choices}):Promise<SocialLaunchView>.
- Produces decideSocialLaunchPlan(db,principal,{projectId,revisionId,sha256,decision:'approve'|'reject',idempotencyKey}):Promise<SocialLaunchView>.
- Principal is authenticated server user plus allowedProjectIds; never supplied by a model/client.

- [ ] Write failing isolation/concurrency tests using the existing owned-project SQL fixture pattern: unauthorized project, foreign conversation, immutable revision, stale expectedRevisionId conflict, duplicate intent returns same revision, decision binds exact SHA, and unapproved revisions remain proposals.
- [ ] Run the targeted SQL tests alone; verify meaningful RED. Do not run concurrently with website worker/browser SQL suites.
- [ ] Add server-only tables for project plan roots, immutable revisions and immutable decisions. Enable RLS; revoke client access and expose only bounded server-side operations. No credential columns, no changes to social_account_bindings, no publishing side effects.
- [ ] Implement store validation and stable closed errors: NOT_FOUND, INVALID_BODY, REVISION_CONFLICT, PLAN_UNAVAILABLE.
- [ ] Run targeted SQL tests and migration integrity checks, verify GREEN and commit.

## Task 3: Project social planning surface and truthful connection handoff

**Files:**
- Create apps/web/app/(platform)/projects/[slug]/social/page.tsx
- Create apps/web/app/api/social-launch/route.ts
- Create apps/web/components/social-launch/SocialLaunchPanel.tsx
- Create apps/web/components/social-launch/SocialLaunchPanel.module.css
- Modify apps/web/components/platform/vnext/SettingsSurface.tsx (project-specific planning link only).
- Create apps/web/e2e/social-launch.spec.ts and a provider-free UI fixture/config.

**Interfaces:**
- Consumes read/propose/decide operations from Task 2.
- GET reads one owned project's plan and safe current connection metadata.
- POST accepts a closed operation body for propose/decide; server resolves actor and ownership again.
- Produces workspaceUrl /projects/<authorized-slug>/social.
- Existing IG/FB/YouTube connection actions remain at their canonical settings controls. New adapter setup requirements are displayed honestly.

- [ ] Write browser/API tests: save channel choices, approve exact revision, reject stale revision, retain unsaved choices after failed save, delayed response after project switch cannot cross scopes, mobile controls fit 390px, and unsupported adapters cannot display a connect-success state.
- [ ] Run tests and observe expected RED.
- [ ] Implement the panel with selection, purpose/format/cadence, explicit proposal/review status and separate connection readiness. No credential inputs in chat and no publish button in this increment.
- [ ] Test failed metadata reads and authentication/ownership errors without provider calls.
- [ ] Run targeted browser/API tests plus relevant settings regressions, typecheck and diff check; commit on GREEN.

## Task 4: Atlas can discuss/read/propose the project's channel plan

**Files:**
- Create apps/web/lib/social-launch/atlas-tools.ts
- Test apps/web/lib/social-launch/atlas-tools.test.ts
- Modify apps/web/app/api/chat/route.ts (register tools and dispatch through the owned conversation context).
- Update relevant chat-tool/static-conversation QA tests.

**Interfaces:**
- Consumes Task 2 read/propose operations and Task 3 workspaceUrl.
- Produces SOCIAL_LAUNCH_TOOLS, SOCIAL_LAUNCH_TOOL_NAMES, SOCIAL_LAUNCH_GUIDE and handleSocialLaunchTool.
- Tools: get_social_launch_plan and propose_social_launch_plan. Neither tool approves, connects accounts, spends on media, schedules or publishes.
- Conversation/project are server-authorized and must match. Model arguments cannot impersonate a decision or change credentials.

- [ ] Write tests for owned conversation success, wrong project/conversation refusal, unexpected publish/approve fields rejected, unavailable source reported accurately and returned review link points to the real authorized project.
- [ ] Verify RED, implement tool registration/dispatch and guide, then verify GREEN.
- [ ] Guide must distinguish proposed/approved/connected/publishable and explicitly keep existing run_media_step limited to its current pipeline.
- [ ] Run chat/static conversation boundary tests and typecheck; commit on GREEN.

## Task 5: Review and ship Increment 1

- [ ] Check every delivered behavior against the spec and mark which facts are selected, verified or unavailable.
- [ ] Independent review of exact base/head; fix blockers and repeat affected tests.
- [ ] CI on exact final head, locked merge, identical merge tree, production READY and correct app/queue aliases.
- [ ] Read current cost before final reporting. No paid model/image tests or live social posts.
- [ ] Report this increment as channel planning/readiness, not six working connections or universal publishing.

## Following increments — separate plans before implementation

### Increment 2: Real six-channel account connections

First audit all canonical SQL/type constraints and health/audit readers. Reuse IG/FB/YouTube flows and add LinkedIn company Page, X user account and Pinterest account/board adapters behind provider-verified identity, operator ownership, OAuth replay protection and write-only credential storage. Existing app configuration/access must be checked as presence/metadata, never printed. Provider app review and X pricing/cap are activation prerequisites, not assumptions. Do not change The Prompt's publisher authority.

### Increment 3: Reviewed content and governed publication

Add reusable brand assets and format-specific content drafts, exact approval binding, durable scheduled delivery and provider receipts. Reconcile ambiguous writes and partial success before retries; enforce stops and verified project spend limits before every side effect. Initial mode requires content review; autonomous standing policy is separate. Test with provider fixtures, not public test posts.

### After social launch

Return to builder polish and verify Atlas's real supported execution paths through brief, plan, mockup, build, review and launch. Preserve the approved three-page example and avoid paid trial-and-error loops.
