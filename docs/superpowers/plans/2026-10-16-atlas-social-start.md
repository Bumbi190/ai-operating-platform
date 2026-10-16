# Social start and reusable project profile Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one fresh whole-branch review. Prior user instruction and developer authorization permit continuous execution without repeated approval prompts.

**Goal:** Make the social workspace understandable and let Atlas reuse project-owned working context.
**Architecture:** Keep immutable server-only profile revisions beside existing social plans and posts. Add a shared workspace guide and lazy profile panel; reuse assets and owned chat dispatch.
**Tech Stack:** Next.js/React/TypeScript, Supabase SQL, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-16-atlas-social-start-design.md

## Global Constraints
No account connection, public post, paid generation, budget change, The Prompt alteration or global brand defaults. No seeded business facts. Profile saved context is not editorial/publishing approval. Existing approved posts are not rewritten. Keep parallel work intact. Local SQL suites run sequentially against the owned fixture.

## Review Focus
- Late GET/save responses must not overwrite newer state or dirty input (Task2 browser held-response test).
- Profile saved in one project/conversation cannot appear or mutate another (Task1 SQL/API and Task2 browser switch).
- Duplicate requests and a stale retry cannot create extra versions or roll back the head (Task1 real SQL).
- An unreadable asset/account cannot be presented as ready (Task1 asset and Task2 guide tests).
- Existing post decisions and publisher boundaries stay unchanged (Task2 social/chat regressions).

## Task 1: Profile contract, database, API and Atlas
Files: lib/social-launch/profile/{types,validate,store,api,atlas-tools,test-db}.ts and their tests; app/api/social-profile/route.ts; generated migration social_project_profiles_v1; app/api/chat/route.ts; route/schema and migration integrity metadata.
Interfaces: parseSocialProfile(unknown):SocialProfileInput; readSocialProfile(db,principal,{projectId,conversationId?}):Promise<SocialProfileView>; saveSocialProfile(db,principal,{projectId,conversationId?,expectedRevisionId,idempotencyKey,profile}):Promise<SocialProfileView>; socialProfileApi(Request):Promise<Response>; handleSocialProfileTool(name,input,principal,conversationId,db?).
- [x] Tests first: reject unknown/missing fields, invalid HTTPS/UUID/control bytes/limits. Observe RED, implement validation, GREEN.
- [x] Real SQL/API tests first: owned save/read, foreign user/project/conversation refusal, exact repeat/current-head replay, changed-key conflict, concurrent single writer, inactive asset refusal, stop/archive, RLS and immutable history. Observe RED, implement generated SQL and store. GREEN.
- [x] Register get_social_profile and propose_social_profile in existing chat; test unknown approval/secret/publication fields, no-conversation denial and project-scoped review link.
- [x] Run profile, current social/chat and migration checks; commit.

## Task 2: Actionable guide and retained profile editor
Files: components/social-launch/{SocialStartGuide,SocialProfilePanel}.tsx and css; SocialLaunchPanel.tsx; SocialContentPanel.tsx; lib/social-launch/content/atlas-tools.ts; e2e social profile fixture/config/spec; relevant CI workflow.
Interfaces: SocialProfilePanel({projectId,projectName,onSaved?}); SocialStartGuide({model,onPlan,onContent,onProfile}); SocialContentPanel optional onPlanRequested callback.
- [x] Browser RED: missing plan→direct action opens channel plan; save/approve plan then content can be prepared without connecting accounts.
- [x] Browser RED: save profile, refresh persists, failed save retains values/key, tab changes retain draft, held GET never overrides dirty/saved input, project switch does not leak.
- [x] Implement desktop/mobile panels with current theme, labeled next steps and plain-language states. Read profile context before Atlas content proposals.
- [x] Run new browser tests plus existing social launch/content/connection, relevant chat, typecheck, diff checks; inspect mobile/desktop screenshots; commit.

## Task 3: Independent verification and coordinated release
- [x] Record verification and hand over to separate manual publication plan; never imply posting works early.
- [x] One whole-branch review after both independent plans; fix important findings via reproduced regressions.
- [ ] Additive schema preflight/apply exact SQL, record stored digest and scoped security metadata. Exact-head CI; locked merge; identical merge tree; production READY/domain checks.
