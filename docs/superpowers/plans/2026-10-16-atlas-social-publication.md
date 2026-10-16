# Reviewed manual social publication Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The final independent review covers this plan and the preceding social-start plan before one coordinated release.

**Goal:** Let a project owner/operator explicitly publish one approved Facebook/Instagram post with a durable receipt and no duplicate write.
**Architecture:** Add private publication state/events and CAS admission RPCs. A small server orchestrator reuses canonical account identity and exact media; a bounded capability serves only the approved JPEG. UI is separate from the planning-only calendar.
**Tech Stack:** Next.js, TypeScript, PostgreSQL, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-16-atlas-social-publication-design.md

## Global Constraints
No real connections/posts/provider/model calls in development. No budgets/standing autonomous policies/The Prompt changes. Only supported manual formats from spec; no dated draft dispatch. Exact saved text/media/account must survive review unchanged. Store no secrets/provider bodies. Shared SQL suites --no-file-parallelism. Use one final review/release for both plans.

## Review Focus
- Two concurrent HTTP requests/CAS transitions cannot both POST (Task2 concurrent admission).
- Provider write success followed by timeout or receipt persistence failure never becomes retryable send (Task2 failure fixtures).
- Stops/rebind/media/plan/revision changes during processing refuse the next write (Task1 SQL and Task2 orchestration).
- Public image capability cannot expose other assets, survive expiry/terminal receipt or serve modified bytes (Task3 API).
- Late responses after project/post change cannot show/send the previous post; dirty content cannot publish (Task4 rendered tests).

## Task1: Publication contract and durable state
Files lib/social-launch/publication/{types,validate,store,test-db}.ts and tests; CLI-generated social_manual_publication_v1 migration.
Interfaces: publicationRead(db,p,{projectId,postId}):Promise<PublicationView>; publicationPrepare(db,p,input:PublicationRequest):Promise<PublicationRecord>; publicationStep(db,p,{publicationId,expectedVersion,action,capabilityHash?,containerId?,providerId?,permalink?,failureCode?}):Promise<{changed:boolean,record:PublicationRecord}>; private publicationMediaLookup(db,{publicationId,keyHash}).
- [ ] Write pure format/eligibility and SQL tests first; observe RED.
- [ ] Implement states/invariants, exact approved references and one-post uniqueness with serialized preparation/CAS step, immutable events, owner/stops/current inputs, private safe read and capability lookup.
- [ ] Verify concurrent claims, changed snapshots, exact replay, RLS/client denial and events; commit.

## Task2: Fixed-host provider adapters and bounded orchestrator
Files lib/social-launch/publication/{provider,dispatch,media}.ts and tests.
Interfaces: checkManualFormat(post):blocker[]; verifyPublicationImage(db,asset):Promise<verified JPEG>; dispatchPublication(db,p,input,deps):Promise<PublicationView>. Deps are explicit identity resolvers, fixed provider fetch and clock for fixture tests; default production dependencies perform no work until explicit authorized POST.
- [ ] RED exact Facebook/Instagram body/header contracts; authority/media refusal produces zero writes.
- [ ] Implement Facebook /feed or /photos and Instagram create/status/publish/permalink with8s timeout and64KiB bounded JSON; never retry POST.
- [ ] RED lost response, corrupt provider data, DB receipt failure, double request, processing resume, stop/rebind before publish, PUBLISHED confirmation without known permalink. GREEN; commit.

## Task3: Authenticated API and bounded public image capability
Files app/api/social-publications/route.ts, app/api/social-publication-media/route.ts, lib/social-launch/publication/api.ts/tests and manifest.
Interfaces: socialPublicationApi(Request); socialPublicationMedia(Request). Request fields from spec; GET cannot call provider. Anonymous capability endpoint serves only exact verified JPEG for live admitted request.
- [ ] API RED unauthorized/foreign/nonoperator/same-origin/bounds/authority injection and token expiry/scope/checksum/stop/streaming.
- [ ] Implement private no-store safe errors, operator resolution and bounded capability handler. Verify zero external calls on denial; commit.

## Task4: Exact manual confirmation and receipt UI
Files components/social-launch/SocialPublicationPanel.tsx/css, SocialContentPanel.tsx, provider-free fixture/spec/config; CI workflow.
Interfaces: SocialPublicationPanel({projectId,post,disabled}); keyed revision, GET/load sequence fence, confirmation checkbox.
- [ ] Browser RED explicit exact-account confirmation, no dispatch from mount/approval/calendar, success receipt, uncertain no-send action, processing completion and switched-post responses.
- [ ] Implement compact UI with clear supported-format/account prerequisites and separate manual action. Existing calendar remains planning-only.
- [ ] Run new and existing social browser suites, relevant SQL/API/chat/type/security checks; inspect mobile/desktop; commit.

## Task5: Coordinated review and deployment
- [ ] Reconcile all new routes, schema classes and canonical migration counts without weakening gates.
- [ ] Independent exact-base/head whole-branch review; fix important findings with regressions. No repeated review loop.
- [ ] Verify/additively apply exact reviewed SQL, confirm stored hash, RLS/function ACL/search_path and unchanged existing data/advisor categories.
- [ ] One pushed PR/CI, locked merge, exact merge tree, production READY/domains and unauthenticated route denial. Report actual account/first-post test as later joint work.
