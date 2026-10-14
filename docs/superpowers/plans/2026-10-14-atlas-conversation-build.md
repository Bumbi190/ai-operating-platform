# Atlas Conversation Build — Implementation Plan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the preserved Native execution method. Implement task-by-task; keep the approved design beside this plan.

**Goal:** Make Atlas text/voice conversations lead through a reviewed architecture plan into the existing live website preview, with Omnira's visual identity and honest integration guidance, including Strato first for domains.

**Architecture:** Keep the durable static website worker, feedback queue and isolated preview. Add project-bound plan revisions and operator decisions, a shared conversation controller and typed workspace effects. Connection guides read real metadata; execution adapters for terminal, Vercel, Supabase and Strato writes remain separate deliveries B/C.

**Tech Stack:** Existing Next.js 14.2.29 App Router, React 18.3.1, TypeScript, Supabase Postgres/RLS, Vitest 2.1.9, Playwright 1.64.0, existing design tokens and browser speech/TTS runtime. No new product dependencies.

**Spec:** docs/superpowers/specs/2026-10-14-atlas-conversation-build-design.md — approved 2026-10-14 with Strato addition.

**Execution:** Native, preserved from the existing task. This plan is a review artifact; no product changes have been made by writing it.

## Global Constraints

- ”Återanvänd Omniras befintliga yt-, text-, kant-, accent-, typografi- och fokusvärden. Skapa ingen ny palett för byggvyn.”
- ”Alla nya starter måste passera planrevisionens beslut.”
- ”Befintliga byggsessioner fungerar utan att påhittade retroaktiva plangodkännanden skapas.”
- ”En giltig tidigare tillåtelse används inom sin omfattning; fråga inte igen för varje tangenttryckning.”
- ”Hemligheter skrivs i en separat säker inställningsyta eller hos leverantören. De går inte genom modellprompt, chatthistorik, preview, Git eller användarsynliga loggar.”
- ”Namn och tillgänglighet kontrolleras först via Stratos domänsökning.”
- ”Köp sker genom användarens befintliga Strato-konto.”
- Preserve existing 8-page, 1 MiB artifact, 64-behaviors/page, 8000-character brief, 4000-character feedback and 65536-byte request limits.
- New plan content is at most 32768 UTF-8 bytes, serializes to a build brief at most 8000 characters and has at most 8 preview pages. Reject oversized input before persistence/model dispatch.
- Owner/executor scope is not expanded to collaborator display scope. Client project/session/visible-plan fields never establish authority.
- Applied migration files are immutable. New migrations are created with Supabase CLI and verified against the canonical constraints/ledger.
- Domain search is not account inventory; broker identity is not terminal availability; platform hosting is not an Atlas provider connection.
- Existing stop/budget/run admission, leases/fences, HTML/CSS containment, sandbox/CSP and immutable artifact hashes remain in force.
- A delivers static preview and connection guidance. B delivers a real development runner; C delivers provider writes/publication/DNS/HTTPS. Never label all three complete after shipping A.

## Review Focus

1. A delayed start/retry arrives after a newer plan revision: return the original session for an already committed intent, or reject an unstarted stale decision; never build the newer plan with old approval. Task 2.
2. Voice and text switch conversation while an SSE stream is open: stale events cannot switch the current panel or pollute another conversation's history. Task 5.
3. The user is viewing an old preview or a still-loading revision: feedback binds the actually rendered revision, not the newest selected id. Task 6.
4. A Strato search result or declared ownership is mistaken for verified account access: preserve separate availability/ownership/connection/DNS evidence and show a manual next step. Task 7.
5. A migrated or historical session has no plan, and another project is visible to a collaborator: allow the owner's historical static feedback but never grant new start/write authority. Tasks 2/3/8.

## File and interface map

New bounded units live under apps/web/lib/website-build/planning and apps/web/lib/website-build/connections. Conversation state lives under apps/web/lib/atlas/conversation. Server database/auth code does not enter client-safe contracts.

- planning/types.ts, validation.ts: serializable plan/decision/ref types, canonical hash input and deterministic static brief.
- planning/store.ts, planning/api.ts: real SQL RPC boundary and session-bound HTTP writes/reads.
- planning/chat-tools.ts: draft/read tools and owner-authorized start integration; no model tool that approves a plan.
- planning/operator-intent.ts: exact user confirmation handling against a visible current plan ref.
- conversation/controller.ts, conversation/provider.tsx, conversation/stream-effects.ts: one active conversation and request stream for text/voice consumers.
- connections/types.ts, catalog.ts, readiness.ts: bounded metadata, reviewed guides and server adapter status.
- AtlasPlanCard.tsx, AtlasBuildSurface.tsx, BuildPreviewPane.tsx, BuildConnectionCards.tsx: plan review, shared conversation layout, existing preview presentation and guide cards.
- ProjectWebsiteBuilderSettings.tsx: owner-only explicit builder assignment; no automatic paid agent creation.
- Existing AtlasChatConversation/Launcher, AtlasRuntimeProvider, BuildStart/Workspace, chat-shared, /api/chat and settings surfaces remain integration points. Avoid unrelated refactoring.

Commands below run from apps/web unless stated otherwise. Real-SQL commands use the owned labeled Docker fixture described in docs/skills/ATLAS_BUILD_WORKSPACE_VALIDATION_20261014.md, never production. Each implementation task uses RED → minimal implementation → GREEN and a focused commit.

### Task 1: Validated plan content and deterministic brief

**Files:** Create lib/website-build/planning/{types,validation}.ts and validation.test.ts; modify lib/website-build/types.ts only for additive plan refs.

**Interfaces:** Export PlanRef {projectId, planId}; PlanRevisionRef extends PlanRef {revisionId, sha256}; PlanContent {title, purpose, audience, pages, design, features, architecture, steps, domain}; PlanView {ref, conversationId, currentRevision, approvedDecision, activeSessionId, budget:{state:'configured'|'missing'|'unknown',monthlySek:number|null}}; PlanDecision {id, revisionRef, approvedBy, scope:'static_preview', builderAgentId, startIntentId, sessionId|null}. domain contains registrar:'strato', requestedName|null. Feature requirements explicitly distinguish preview_demo from live_required with provider needs.

Produce validatePlanContent(input:unknown):PlanContent, hashPlanContent(content:PlanContent):string and compileStaticBrief(content:PlanContent):string. Deterministic compilation includes all agreed requirements and clearly marks unmet live features as demos; no silent truncation, tokens, executable scripts or fabricated URLs.

- [ ] Write tests: stable hash despite input object property order; changed design/domain changes hash; more than 8 pages, >32768 UTF-8 bytes, unknown fields and >8000-character compiled brief are rejected; live_required is described as unmet; registrar is Strato.
- [ ] Run: npm test -- lib/website-build/planning/validation.test.ts. Expect meaningful RED on missing/new contract.
- [ ] Implement these types and functions with canonical ordered fields and existing UUID/WebsiteBuildError conventions. Introduce INVALID_PLAN and PLAN_TOO_LARGE codes.
- [ ] Run the same tests and npm run typecheck. Expect GREEN without weakening existing website artifact validation.
- [ ] Commit: feat: define bounded website plan revisions.

### Task 2: Atomic plan decisions, builder configuration and start fencing

**Files:** Create a CLI-named migration with suffix website_build_planning_v1.sql; create planning/store.ts and store.test.ts; modify website-build/test-db.ts and test fixture setup to apply the new migration to a newly owned fixture.

**Interfaces:** planning/store.ts exports readWebsitePlan(db,principal,ref):Promise<PlanView>, saveWebsitePlanRevision(db,principal,input):Promise<PlanView>, approveWebsitePlan(db,principal,input):Promise<PlanDecision>, startApprovedWebsitePlan(db,principal,input):Promise<BuildSessionView>, readProjectWebsiteBuilder(db,principal,projectId):Promise<BuilderSetting>, setProjectWebsiteBuilder(db,principal,{projectId,agentId|null}):Promise<BuilderSetting>. SavePlanInput {projectId,conversationId,planId?:string,expectedRevisionId:string|null,content:PlanContent,idempotencyKey}; ApprovePlanInput {projectId,planId,revisionId,sha256,idempotencyKey}; StartApprovedPlanInput {projectId,planId,revisionId,decisionId}. BuilderSetting {projectId,builderAgentId:string|null,domainRegistrar:'strato'}. Actor identity only comes from BuildPrincipal. Read the authorized project's project_budgets.monthly_sek for the card; missing/error is never unlimited/zero. This read creates no budget reservation and does not confer spend authority.

Tables: website_build_project_settings (project PK, builder_agent_id, domain_registrar='strato'); website_build_plans (project, owner, conversation, current revision, active session); website_build_plan_revisions (immutable number/content/hash/compiled brief); website_build_plan_decisions (actor, revision/hash, static scope, selected builder, unique start intent, optional committed session). Cross-project relationships use explicit composite constraints and RPC validation, not UUID existence alone.

RPCs: website_build_plan_save/view/approve/start and website_build_builder_get/set, SECURITY INVOKER, empty search_path, service_role execution only. Owner-scoped authenticated SELECT; no anon access or client writes. Approval/current-revision validation and session/run insertion occur in one transaction under the plan lock.

- [ ] Add real-SQL tests for foreign project/conversation/agent, collaborator, immutable revision, current-revision race, duplicate approval/start, mismatched intent payload and null/missing builder. Two connections must prove concurrent starts produce one session/run.
- [ ] Prepare the owned fixture and run npm test -- lib/website-build/planning/store.test.ts --maxWorkers=1 --minWorkers=1. Expect RED from absent schema or missing gate.
- [ ] Run npx supabase migration new website_build_planning_v1; implement tables/RPCs/store. Replace website_build_create in this NEW migration with a guarded core that requires the stored decision, locks/verifies the referenced current plan, derives agent/brief/start key from server rows and preserves the canonical run/context insertion and constraints. website_build_plan_start delegates to this guarded core; it is not a second insertion algorithm. Do not expose a bypassing legacy start helper. An already committed exact start intent returns its original session even if a later plan exists; an unstarted stale decision returns PLAN_STALE.
- [ ] Run SQL tests plus existing website-build/store, worker and schema-security tests on the new fixture. Prove runs.idempotency_key remains null for website work and context.websiteBuildIdempotencyKey remains the canonical key. Expect GREEN and no anonymous/authenticated RPC EXECUTE.
- [ ] Commit: feat: persist approved website plans and fence build starts.

### Task 3: Operator API and explicit project builder settings

**Files:** Create app/api/website-build-plans/route.ts, [planId]/route.ts, [planId]/approve/route.ts, [planId]/start/route.ts and app/api/website-build-settings/route.ts; create planning/api.ts, api.test.ts and components/platform/vnext/ProjectWebsiteBuilderSettings.tsx. Modify website-build/api.ts/store.ts start entry and SettingsSurface.tsx/server settings model as needed.

**Interfaces:** websitePlanApi(action:'save'|'get'|'approve'|'start',request,params):Promise<Response>; websiteBuilderSettingsApi(request):Promise<Response>. Save input uses expectedRevisionId (null for creation), content and idempotencyKey. Approve uses revisionId, sha256 and idempotencyKey; start uses approved decision id/ref. Responses carry the actual PlanView/PlanDecision/BuildSessionView, private no-store and structured error codes. Builder setting accepts only an existing, owned, project-bound compatible text agent.

- [ ] Add tests for unauthenticated 401, wrong owner/project 404, cross-origin writes, >65536-byte body, malformed IDs, extra authority/credential fields, stale approval 409, old unplanned create → PLAN_REVIEW_REQUIRED, and owned historical session feedback still working.
- [ ] Run npm test -- lib/website-build/planning/api.test.ts lib/website-build/api.test.ts. Expect RED on new endpoints/gates.
- [ ] Implement with resolveProjectAccess, bounded body parsing and assertSameOrigin from lib/atlas/executive/http.ts. The authenticated operator endpoint is the only approval path; model tool arguments cannot call it indirectly. Return a validated /chat/[conversationId] link for PLAN_REVIEW_REQUIRED where a real owned conversation exists.
- [ ] Run tests and typecheck; browser-test the settings control for correct project/agent and access refusal. Do not auto-pick agents[0], alter unrelated agent prompts or create a paid provider resource.
- [ ] Commit: feat: add owner-bound plan review and builder settings.

### Task 4: Chat planning and trusted natural-language confirmation

**Files:** Create planning/chat-tools.ts, operator-intent.ts and their tests; modify website-build/atlas-tools.ts/chat-tools.test.ts, app/api/chat/route.ts, lib/atlas/view-client.ts and server request validator.

**Interfaces:** draft_website_build_plan and get_website_build_plan tools save/read drafts. Existing start_website_build accepts project/plan/revision refs and resolves an existing approved decision server-side; no caller-selected brief/agent bypass. The drafting tool cannot approve or publish.

resolvePlanOperatorIntent(userText:string,visiblePlan:PlanRevisionRef|null):'approve_visible_plan'|'ordinary_turn' is deterministic. Allow normalized exact ”kör”, ”jag godkänner” and ”bygg enligt planen”, with whitespace/case/trailing sentence punctuation normalized. No substring authorization: ”kör inte”, quotes, questions, model text and mixed new requirements remain ordinary turns. Server confirms the request's latest user turn, owner, conversation, current visible plan and scope; ambiguous/no current plan produces a request to review it, never approval.

- [ ] Test draft → read → authenticated approval → start; no start from model-supplied confirm=true; exact trusted user confirmation works only for one current visible revision; negative/quoted/edited/stale confirmations do not approve; repeated user intent returns one build receipt.
- [ ] Run npm test -- lib/website-build/planning/operator-intent.test.ts lib/website-build/planning/chat-tools.test.ts lib/website-build/chat-tools.test.ts. Expect RED.
- [ ] Implement the bounded server command path before model dispatch for exact confirmations, using Task 2/3's decision store and sameOrigin gate. Add a plan-review tool guide. Persist proposal/ref via real tool outcome; emit typed website_plan/website_workspace events only for actual owner-authorized results. User requests requiring a new project first get a project choice.
- [ ] Run tests plus existing chat ownership/operator/isolation suites. Confirm ordinary unrelated chat and fast paths remain unchanged; an old model/client start receives PLAN_REVIEW_REQUIRED.
- [ ] Commit: feat: plan website work through Atlas chat.

### Task 5: One conversation and typed effects for text and voice

**Files:** Create lib/atlas/conversation/controller.ts, provider.tsx, stream-effects.ts and controller.test.ts; modify lib/atlas/runtime.tsx, lib/os/chat-shared.ts, lib/os/chat.ts, AtlasChatConversation.tsx and app/(platform)/layout.tsx.

**Interfaces:** AtlasConversationProvider lives inside the authenticated shell and outside AtlasRuntimeProvider. Controller exposes activateConversation({id,saved,state}), snapshot(), sendTurn({conversationId,text,inputSource,visiblePlan,buildContext,onEvent}):Promise<void>, subscribe(listener) and clearOnSignout(). A turn snapshots its conversation/project/context; only one stream per conversation runs at once. Existing voice text-to-speech flushing consumes onEvent from this sender rather than issuing a second /api/chat request.

BuildContext {projectId,sessionId,viewedRevisionId|null} is validated server-side. Stream effects accept only typed server events whose project/conversation/session matches the active server-loaded context; no open-by-model-URL behavior. History for model requests stays text-only; saved tool records are restored separately as plan/build UI state. A failed history read still disables sending.

- [ ] Test text→voice→text shares one history/id; switching conversations midstream ignores stale effects; repeated/malformed/cross-project workspace events never open a panel; incomplete SSE has no success claim; secret-bearing arbitrary result fields never enter context; failed hydration stays blocked.
- [ ] Run npm test -- lib/atlas/conversation/controller.test.ts lib/qa/atlas-chat.test.ts. Expect RED for new shared behavior.
- [ ] Implement the controller/provider and adapt consumers without rewriting speech capture, latency/TTS or action-orb execution. Reuse server conversation ownership reads. Preserve the released pending mic cancellation/late callback protections and editable transcription before a voice build instruction is sent.
- [ ] Run new tests, voice capture tests and the released playwright.atlas-entry.config.ts regression suite. Expect GREEN; microphone closing and playback stopping remain distinct from build controls.
- [ ] Commit: feat: share Atlas build context across text and voice.

### Task 6: Conversation-first plan and preview surface

**Files:** Create components/platform/vnext/AtlasPlanCard.tsx, components/platform/vnext/AtlasBuildSurface.tsx and components/website-build/BuildPreviewPane.tsx; modify components/website-build/BuildStart.tsx, BuildWorkspace.tsx, BuildConversation.tsx, AtlasChatLauncher.tsx, AtlasChatConversation.tsx, /projects/[slug]/build pages and their styles. Modify AtlasChat.module.css/BuildWorkspace.module.css using existing tokens only.

**Interfaces:** AtlasPlanCard({plan,onApprove,onEdit}) renders the exact server revision/hash and its pending decision state. AtlasBuildSurface({conversationModel,plan,initialSession|null}) hosts one conversation with an optional plan/preview panel. BuildPreviewPane({session,onRenderedRevision}) reports the artifact actually rendered; it retains existing BuildPreview, revision/page selector and private ZIP behavior. Historical build routes resolve the session's real conversation and render this same surface.

- [ ] Add UI/browser cases for reviewed plan start, automatically opened preview, same conversation after feedback, missing builder action, 390 px/980 px/desktop layout, panel close/reopen, and feedback while selected revision is still loading.
- [ ] Run the relevant fixture cases to observe RED: current separate form/dropdown and own palette must fail.
- [ ] Replace BuildStart with a project-bound chat launcher. Render plan first; open preview only after real session receipt. The shared feedback transcript uses actual durable feedback ids/statuses once; remove the competing separate composer/history. Keep last good preview, split resize, mobile tabs, versions/export and existing isolated rendering.
- [ ] Run UI tests and existing website-build browser suite. Visually inspect at all three widths; verify focus, reduced motion and display scale. No manually selected News Hunter; no empty disabled start form; no clipping from sticky/scroll containers.
- [ ] Commit: feat: build websites in the Atlas conversation.

### Task 7: Real readiness, reviewed guides and Strato domain path

**Files:** Create website-build/connections/{types,catalog,readiness}.ts and tests; app/api/website-build-readiness/route.ts; components/website-build/BuildConnectionCards.tsx; integrate cards into plan/build surface and chat read tools.

**Interfaces:** readWebsiteBuildReadiness(db,principal,{projectId,planId}):Promise<ReadinessView>. IntegrationNeed providers are terminal/vercel/supabase/strato/form_delivery. Each item separates adapterAvailability:'implemented'|'not_implemented' from connectionStatus:'connected'|'missing'|'unknown'|'expired'|'denied', permissions, checkedAt and safe nextAction. Unknown project/account/runner ids are never inferred from Omnira's own deployment or ChatGPT tools.

getConnectionGuide({provider,verifiedTarget|null,os:'windows'|'macos'|'linux'|'unknown',need}):GuideCard produces reviewed URLs, named fields and optional non-secret commands. Copy commands contain no token values. Prefer setting the actual named app secret in a protected field; local CSPRNG recipe writes directly to a new ignored file, never prints into chat/logs and refuses overwrite. No fabricated API-key generator.

- [ ] Test a simple site has no unnecessary Supabase requirement; unimplemented adapter remains unavailable despite env/broker presence; read failure is unknown; owned target deep links stay project-bound; malformed/foreign URL targets are rejected; secrets cannot be serialized into readiness/cards.
- [ ] Test Strato is first for desired domain names and the user's purchase route; public domain search does not imply owned inventory; missing account access gives official link + manual step; no registrar transfer/Vercel purchase CTA; DNS guide does not hardcode old A/CNAME targets or alter mail records.
- [ ] Run npm test -- lib/website-build/connections. Expect RED on missing guide/status contract.
- [ ] Implement metadata adapters only for capabilities truly callable by Omnira. Explicitly mark terminal execution, generated-site provider deployment/database writes and Strato account/DNS automation not_implemented unless separately proven. Add Strato search URL from the approved spec; account-specific link only if verified, otherwise official customer-login entry and exact menu path from the DNS guide. Manual ownership declarations remain unverified.
- [ ] Run tests and render cards in browser with connected/missing/unknown/expired/denied/unimplemented fixtures. Confirm links, why-needed copy and ”Kontrollera igen” work; unavailable functionality has no execute button. Commit: feat: guide project connections and Strato domains.

### Task 8: Full joined-flow proof and regression boundary

**Files:** Create e2e/atlas-conversation-build.spec.ts, fixture server/adapters and playwright.atlas-conversation-build.config.ts; extend real-SQL planning tests; add docs/skills/ATLAS_CONVERSATION_BUILD_VALIDATION_20261014.md.

**Interfaces:** Browser fixture mounts real AtlasConversationProvider, AtlasRuntimeProvider, AtlasChatConversation and AtlasBuildSurface. Only framework routing/auth transport and external voice/model responses are adapted; do not create a lookalike UI that tests itself. SQL proof remains independently real, using the owned labeled fixture and actual migrations.

- [ ] Write failing joined cases: text idea→plan edit→approval→queued→preview1→feedback→preview2; voice transcript review→same conversation; stream lost after committed start→reload→same session; older rendered revision; foreign project/collaborator refusal; historical session; unimplemented terminal/provider status; Strato-first guide.
- [ ] Run npx playwright test --config=playwright.atlas-conversation-build.config.ts with one worker and zero retries. Capture meaningful RED before final fixes.
- [ ] Fix only failures introduced or exposed in the modified boundary. Preserve baseline reporting; do not weaken ownership, canonical SQL, confirmations, artifact security or assertion requirements.
- [ ] Run targeted Vitest planning/connections/conversation plus impacted existing website/chat/voice/isolation tests, npm run typecheck, the new joined browser suite and released website/entry suites. Record exact counts, real vs mocked evidence and limitations. Arrange a real owner-session generation/voice check only through an already-authorized usable session; do not bypass sign-in or re-request an aborted login.
- [ ] Commit: test: prove Atlas plan-to-preview conversation flow.

### Task 9: Controlled release of A and provider execution handoff

**Files:** Update validation record, migration inventory/guard metadata using the repository's actual workflow, and the approved spec status after activation. Read existing docs/skills/ATLAS_ENTRY_VOICE_FIX_20261014.md for release evidence.

**Interfaces:** New schema gates all new starts; historical reads/feedback continue. Deploy includes the new plan endpoints/chat UI together. If UI activation fails after schema application, keep new starts gated, repair/redeploy A; do not reopen unplanned creation or weaken database constraints. B/C execution functionality is never activated by this rollout.

- [ ] Check git diff --check, scoped file list, isolated real SQL checks and canonical migration guard; refresh main once and resolve actual concurrent changes. Frozen/applied files stay byte-identical.
- [ ] Complete Native's single whole-branch review according to its execution skill; fix findings with observed regression evidence. No review seat or review CI repeats without a material reason.
- [ ] Open a concrete PR with problem/result/scope/evidence. Preserve normal protected-main merge and exactly the repository's required contexts; no --admin, forged check status or workflow_dispatch substitution. Avoid redundant nonrequired CI spending.
- [ ] Apply the new migration only after final review/necessary checks and existing user activation authority are satisfied; deploy the matching app, verify exact SHA, aliases, required migration guard and anonymous/foreign-owner access probes. Report migration-first window honestly if no seamless staged rollout exists.
- [ ] Verify the real owner assignment of the intended project builder through the setting API with explicit selected agent. Verify approved plan→actual model artifact→feedback revision on the authorized target where possible; report remaining user-session/mic proof accurately. Record A live only with matching evidence and give B/C concrete runner/provider prerequisites.

## Coverage and handoff

Spec requirements map as follows: intent/alternatives/scope to all tasks; visual identity and form replacement to 6; plan/agent/decision/retry contract to 1–4; shared voice/history and validated navigation to 5–6; connections/keys/files/Strato to 7; containment/historical/collaborator/feedback regression to 2/3/6/8; release/authority/cost limits to 9.

This plan implements delivery A. The full goal remains A+B+C. B needs a separately designed runnable Windows/cloud development substrate; C needs real scoped provider connections, protected secret transport, deployment/database/DNS writes and live HTTPS evidence. Their existing unavailable states are implemented honestly by Task 7, not represented as delivered execution.

User review of this written plan is the next gate. Native remains selected; do not ask the execution-method question again. After that review, read superpowers:executing-plans and carry the work through implementation, checks and the authorized release.
