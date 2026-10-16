# Atlas Social Content Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Sequential native implementation, one independent whole-branch review.

**Goal:** Save and review exact project content, reuse media and prepare a calendar while real account activation waits.
**Architecture:** Add server-only content roots/revisions/decisions, reuse owned project/channel plan and canonical assets/bindings, surface preparation in existing social workspace and Atlas tools. No publisher or paid provider call.
**Tech Stack:** Next.js App Router, TypeScript/React, Supabase Postgres, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-16-atlas-social-content-design.md

## Global Constraints
- Six existing channels only; no TikTok.
- No actual account connections, public posts, paid generation, budget changes, subscriptions or The Prompt authority changes.
- Immutable exact-content decisions are editorial review only; publicationReady and dispatchEnabled remain false.
- Use owned-project SQL and canonical server-derived assets/binding metadata, private/no-store responses.
- Run shared-DB suites sequentially.

## Review Focus
- Changed account, media or channel plan after drafting invalidates effective readiness.
- Concurrent/stale UI requests retain latest state and never cross project scopes.
- Retried saves or decisions return latest state without creating duplicate or resurrected content.
- Missing assets and impossible/ambiguous Stockholm times remain explicit blockers.
- Model input cannot become an operator decision or dispatch authority.

## Task 1: Content contract, dates and SQL store
Files: apps/web/lib/social-launch/content/{types,validate,store,test-db}.ts and tests; generated social_content_preparation_v1 migration.
Interfaces: parseSocialContent(input:unknown):SocialContentInput; stockholmToUtc(local:string):string; readSocialContent(db,principal,{projectId,conversationId?}); proposeSocialContent(db,principal,SocialContentProposal); decideSocialContent(db,principal,SocialContentDecision).
- [x] Add independent literal tests for strict fields, HTTPS, channel/media formats, Stockholm DST and future bounds; observe RED.
- [x] Add real SQL tests for ownership/conversation/asset/binding, revision conflicts, exact review, idempotency, immutable evidence, stop and zero runs; observe RED.
- [x] Implement validators, additive server-only tables/RPCs and server store; verify GREEN.
- [x] Reconcile migration guard/security metadata by canonical repository procedure; commit.

## Task 2: API and Atlas preparation tools
Files: content/api.ts, content/atlas-tools.ts, tests; app/api/social-content/route.ts; app/api/social-content/media/route.ts; app/api/chat/route.ts.
Interfaces: socialContentApi(request):Promise<Response>; socialContentMedia(request):Promise<Response>; SOCIAL_CONTENT_TOOLS/GUIDE/NAMES and handleSocialContentTool.
- [x] Test auth, CSRF, closed/bounded request fields, false model decisions, owned conversation, actual review link and private media access; observe RED.
- [x] Implement read/propose/decide API and read/propose-only Atlas tools; retain existing publishing boundaries.
- [x] Verify affected chat/isolation tests and typecheck; commit.

## Task 3: Existing social workspace and calendar
Files: components/social-launch/SocialContentPanel.tsx and module.css; SocialLaunchPanel.tsx; e2e/social-content fixture/spec/config.
Interfaces: panel receives {projectId,projectName,workspaceUrl}; loads one project, edits/proposes content and reviews exact receipts.
- [x] Browser tests cover create/edit/review/calendar, mobile390px, failed-save draft retention, project switch during request and dirty review gate; observe RED.
- [x] Implement project content navigation, canonical asset selectors/previews, explicit Stockholm time and preparation-only status; verify GREEN.
- [x] Verify existing channel/connection/browser regressions and typecheck; commit.

## Task 4: Review and ship
- [ ] Final branch review against spec and Review Focus; reproduce/fix blockers.
- [ ] CI exact final head, reviewed additive migration, locked merge and production READY/alias verification.
- [ ] Report preparation deliverables and external activation still pending; never claim actual posts.
