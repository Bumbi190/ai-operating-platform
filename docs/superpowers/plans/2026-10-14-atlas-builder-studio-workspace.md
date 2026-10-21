# Atlas Builder Studio Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ge Omnira en direkt byggstudio för nya och befintliga projekt, med samma Atlas-chatt, preview och återställbar projektlivscykel.

**Architecture:** En ägarverifierad studio-loader och atomära RPC:er binder projekt, konversation och begärd lokal koppling. Den befintliga conversation controllern driver text/röst och plan/byggkvitton; ett explicit studio-läge visar arbetsytan före första bygget. Lifecycle återanvänder projektets stop authority och behandlar externa resurser separat.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/Postgres, Vitest, Playwright/Chromium. Native-metoden är redan vald.

**Spec:** docs/superpowers/specs/2026-10-14-atlas-builder-studio-workspace-design.md. Överordnad: docs/superpowers/specs/2026-10-14-atlas-builder-studio-design.md.

## Global Constraints
- Canonical URL /build; label Bygg med Atlas; Omniras befintliga designvariabler.
- Ingen butik skapas. Inga bildjobb, desktopar eller nya providerskrivningar aktiveras i denna del.
- Nya projekt: atlas-web-builder-v1, claude-sonnet-4-6, config.max_tokens 6000; egna projekt-/agentidentiteter och saknad budget tills ägaren väljer den.
- Desktopflikar Webbplats, Desktop, Filer, Uppgifter; mobilflikar Chatt, Webbplats, Desktop; verifiera 390/980/1440 px.
- Befintliga projektmappar behåller sin struktur. Begärd koppling är pending_runner; den innebär aldrig verklig filåtkomst.
- Full projektmappsåtkomst för alla ägarens anslutna projekt är godkänd målbild, inte begränsad till nya/generated-filer.
- Röst blir redigerbar text före Skicka. En composer och samma AtlasConversationController.
- Owner-only writes; främmande/obefintligt projekt ger samma 404; autentisering före admin-läsning; privata svar med no-store.
- Tillämpade migrationer, gamla kodarbetsförbud, budgets/spend gates och normala PR-skydd förblir giltiga.
- Arkiv/papperskorg är återställbart. Inga lokala filer, providers eller livesidor raderas.

## Review Focus
1. Förlorat create-svar och samtidig dubbelklickning: samma nyckel ger samma projekt/konversation och högst en första chattdispatch (Task 1/3).
2. URL med session/konversation från ett annat ägarprojekt: servern vägrar kombinationen även när användaren äger båda (Task 2).
3. Projektbyte medan tal/HTTP-svar pågår: gammalt utkast eller svar får inte hamna i nya projektet (Task 3).
4. Arkivering medan verklig worker når claim/commit: SQL och checkpoints stoppar nya writes utan att återställning återupplivar jobbet (Task 4).
5. Befintlig Windows-rot eller förändrad standardförälder: bevara exakt vald rot och visa pending_runner; ingen påstådd lokal fil (Task 2/5).

## Filkarta
Create:
- lib/website-build/studio/{types,preset,store,loader,api}.ts — kontrakt, servermall, RPC-gräns, loader, HTTP.
- lib/website-build/studio/{store,loader,api}.test.ts och test-fixture.ts — riktig SQL och isolerade auth/route-doubles.
- lib/project/lifecycle/{types,store}.ts samt store.test.ts — ägarens lifecycle och stop-fences.
- lib/atlas/conversation/use-composer-draft.ts — projektbundet redigerbart text/röstutkast.
- components/platform/vnext/AtlasConversationComposer.tsx — befintlig composer extraherad utan ny transport.
- components/website-build/{AtlasBuilderStudio,StudioProjectPicker,StudioEmptyPreview,StudioLifecycleActions}.tsx samt AtlasBuilderStudio.module.css.
- app/(platform)/build/page.tsx; app/api/website-build/studio/route.ts.
- app/api/website-build/studio/workspace-request/route.ts.
- app/api/projects/by-id/[projectId]/lifecycle/route.ts.
- e2e/atlas-builder-studio.spec.ts; playwright.atlas-builder-studio.config.ts.
- docs/skills/ATLAS_BUILDER_STUDIO_WORKSPACE_VALIDATION_20261014.md.
Modify:
- components/platform/vnext/{AtlasBuildSurface,AtlasChatConversation}.tsx — explicit studio-läge och gemensam composer.
- lib/website-build/planning/{settings,settings-types}.ts och components/platform/vnext/ProjectWebsiteBuilderSettings.tsx — skilj ny rot från exakt befintlig rot.
- lib/nav/{registry,vnext-nav,legacy-nav}.ts och lib/atlas/workspace-registry.ts — canonical ingång.
- app/(platform)/projects/[slug]/build/page.tsx och build/[sessionId]/page.tsx — ägarkontrollerad övergång till studion.
- lib/atlas/home-view-model.ts och app/api/projects/route.ts — aktiva projekt som normal lista; explicit arkiv/papperskorg-vy utan att ändra ownership-allowlist.
- e2e/website-build-{fixture,fixture-client,fixture-db,fixture-navigation}.ts och website-build-server.mjs — verkliga komponenter i den befintliga isolerade browserharnessen.
- tests/isolation/{schema-security.json,route-manifest.json} — endast verkliga nya schema/route-gränser; använd repositoryts format.
All paths above are relative to apps/web except docs/. MigrationFile is the single new file produced by the actual CLI in Task 1; record its exact name immediately.

## Gemensamma typer
Define these in studio/types.ts (lifecycle types are re-exported from lifecycle/types.ts):
- Db = ReturnType<typeof createAdminClient>; Principal = BuildPrincipal.
- StudioSelection = { projectSlug?: string; conversationId?: string; sessionId?: string }.
- EnsureStudioInput = ({ kind:'new'; name:string } | { kind:'existing'; projectId:string }) & { idempotencyKey:string }.
- StudioWorkspaceRef = { projectId:string; projectSlug:string; conversationId:string }.
- WorkspaceRequestInput = { projectId:string; targetId:string|null; mode:'new'|'existing_git'|'existing_folder'; root:ProjectRoot; idempotencyKey:string }.
- WorkspaceRequestView = WorkspaceRequestInput & { requestId:string; generation:number; state:'pending_runner'; requestedAt:string }.
- StudioProject = { id:string; slug:string; name:string; lifecycle:ProjectLifecycleView; builderAgentId:string|null; workspaceRequest:WorkspaceRequestView|null }.
- StudioView = { operatorId:string; projects:StudioProject[]; selected:StudioProject|null; conversation:ChatConversationModel|null; plan:PlanView|null; session:BuildSessionView|null; state:'ok'|'error' }.
- ProjectLifecycleState = 'active'|'archived'|'trashed'.
- ProjectLifecycleView = { projectId:string; state:ProjectLifecycleState; version:number; executionPaused:boolean; stopping:boolean }.
- ChangeLifecycleInput = { projectId:string; expectedVersion:number; action:'archive'|'trash'|'restore'; idempotencyKey:string }.
Unknown JSON is validated at API/RPC boundaries; these types are not a casting shortcut.

---

### Task 1: Atomärt nytt/befintligt studio-workspace
**Files:** Create studio/types.ts, preset.ts, store.ts, test-fixture.ts, store.test.ts; create MigrationFile through CLI; modify real SQL fixture/schema registry.

**Interfaces:**
- Consumes createAdminClient(), BuildPrincipal, validateBuildUuid(), existing project/agent/conversation schema.
- Produces ensureStudioWorkspace(db:Db,p:Principal,input:EnsureStudioInput):Promise<StudioWorkspaceRef>.
- Produces ATLAS_WEB_BUILDER_PRESET: {version:'atlas-web-builder-v1';model:'claude-sonnet-4-6';maxTokens:6000;skillIds:readonly string[];systemPrompt:string}.
- Produces createStudioFixture(): {db:Db;owner:Principal;foreign:Principal;projectId:string;otherProjectId:string;countOwnedProjects():number;builder(projectId:string):Promise<{id:string;projectId:string;model:string;maxTokens:number}>;reset():void}.
- RPC website_build_studio_ensure(p_principal jsonb,p_input jsonb,p_preset jsonb) returns StudioWorkspaceRef. Server-owned preset only; service_role EXECUTE only.

- [ ] Write tests for concurrent same-key creation, different-payload conflict, foreign project, missing user, existing-project preservation and rollback on agent failure. Use the real owned PostgreSQL fixture, not an in-memory substitute.
```ts
const f=createStudioFixture();
const input={kind:'new',name:'Min hemsida',idempotencyKey:'same-create'} as const;
const [a,b]=await Promise.all([ensureStudioWorkspace(f.db,f.owner,input),ensureStudioWorkspace(f.db,f.owner,input)]);
expect(a).toEqual(b);
expect(f.countOwnedProjects()).toBe(3); // two fixture projects + exactly one new project
const builder=await f.builder(a.projectId);
expect(builder).toMatchObject({projectId:a.projectId,model:'claude-sonnet-4-6',maxTokens:6000});
await expect(ensureStudioWorkspace(f.db,f.owner,{...input,name:'Annan'})).rejects.toMatchObject({code:'CONFLICT'});
await expect(ensureStudioWorkspace(f.db,f.foreign,{kind:'existing',projectId:a.projectId,idempotencyKey:'foreign'})).rejects.toMatchObject({code:'NOT_FOUND'});
```
- [ ] Run RED from repository root: `npm test --workspace=apps/web -- lib/website-build/studio/store.test.ts --maxWorkers=1 --minWorkers=1`. Expected: failing new contract assertions; no paid provider call.
- [ ] Run `npx supabase migration new atlas_builder_studio_workspace --workdir apps/web`; record MigrationFile. Implement validated store/preset and RPC with owner+idempotency locks, canonical input fingerprint and one transaction for project+own agent+conversation+builder setting. Pin skillIds to design-taste-frontend and impeccable; record their generated manifest digests with the preset version. Map maxTokens to agent.config.max_tokens. Do not insert budgets or copy account bindings.
- [ ] Add the three owner-rooted tables and owner SELECT policies; private service mutations only. Declare empty lifecycle defaults active/version 0 for old projects. No client INSERT/UPDATE/DELETE or RPC EXECUTE; service_role gets table SELECT only plus reviewed RPC EXECUTE, so direct admin table writes cannot skip the RPC invariants.
- [ ] Run GREEN with the same command and real SQL RLS tests for authenticated foreign/observer/anon roles. Expected: all pass; partial failure leaves no orphan project/agent.
- [ ] Commit only Task 1 files: `git commit -m "feat: create owner scoped Atlas studio workspaces"`.

### Task 2: Scoped loader, HTTP and requested project roots
**Files:** studio/loader.ts, api.ts and tests; studio/workspace-request route, studio route, settings/settings-types/ProjectWebsiteBuilderSettings; MigrationFile receives only this unapplied branch's additive functions.

**Interfaces:**
- Consumes Task 1 types/store, resolveProjectAccess(), readConversationWorkspace(db,p,conversationId,preferredSessionId?), loadChatConversation(id), validateProjectRoot(input), readOperatorProjectRoot(db,p).
- Produces loadStudioView(selection:StudioSelection, include:'active'|'archived'|'trashed'='active'):Promise<StudioView|null>.
- Produces requestStudioWorkspace(db:Db,p:Principal,input:WorkspaceRequestInput):Promise<WorkspaceRequestView>.
- HTTP GET /api/website-build/studio?project=slug&conversation=UUID&session=UUID&include=active|archived|trashed; POST accepts EnsureStudioInput.
- HTTP POST /api/website-build/studio/workspace-request accepts WorkspaceRequestInput. Exact existing root is stored verbatim after canonical validation; new mode derives a child root using bindProjectLocation.
- RPC website_build_workspace_request(p_principal jsonb,p_input jsonb) returns WorkspaceRequestView; ownership/idempotency/generation checked in SQL.

- [ ] Add loader/API tests: anonymous 401/no admin call, unreadable data error, foreign 404, observer mutation denied, two owned projects with swapped conversation/session denied, private no-store, unknown keys/body limits refused. Pin requested vs verified state:
```ts
const request=await requestStudioWorkspace(f.db,f.owner,{projectId:f.projectId,targetId:null,mode:'existing_folder',root:{os:'windows',root:'C:\\Projects\\Current',targetId:null},idempotencyKey:'bind-current'});
expect(request.root.root).toBe('C:\\Projects\\Current');
expect(request.state).toBe('pending_runner');
expect(request).not.toHaveProperty('physicalDirectoryCreated');
```
Also test root/targetId mismatch, traversal/reserved Windows names and later default-parent change retaining the previous request.
- [ ] Run RED: `npm test --workspace=apps/web -- lib/website-build/studio/loader.test.ts lib/website-build/studio/api.test.ts --maxWorkers=1 --minWorkers=1`. Expected: missing loader/request boundary or new assertions fail.
- [ ] Implement loader/API functions with session-derived principal, explicit parent linkage for every child, and owner database predicates. No provider requests, shell or filesystem access. Add settings controls Ny projektmapp/Befintligt git-projekt/Befintlig projektmapp; show Begärd — väntar på datoranslutning.
- [ ] Run GREEN with the same command and planning/settings regression tests. Expected: owned historical data loads, incompatible children fail, requested existing root stays exact.
- [ ] Commit: `git commit -m "feat: load Atlas studio and request project folder bindings"`.

### Task 3: Gemensam chatt och preview från första öppningen
**Files:** /build/page.tsx, AtlasBuilderStudio/StudioProjectPicker/StudioEmptyPreview + CSS, AtlasConversationComposer, use-composer-draft, AtlasChatConversation, AtlasBuildSurface, controller.test.ts, new browser spec/config and existing fixture harness.

**Interfaces:**
- Consumes Task 2 StudioView/loader/API, controller.activateConversation(), controller.sendTurn(), useOptionalAtlas().captureUtterance().
- Produces AtlasBuilderStudio({model:StudioView}):React.JSX.Element.
- Produces AtlasConversationComposer({value,onChange,onSend,disabled,capturing,onVoice,onStopSpeech}:{value:string;onChange:(value:string)=>void;onSend:()=>void;disabled:boolean;capturing:boolean;onVoice:()=>void;onStopSpeech:()=>void}):React.JSX.Element.
- Produces useComposerDraft({draftKey,capture}:{draftKey:string;capture:((onTranscript:(text:string)=>void)=>()=>void)|null}):{text:string;inputSource:'text'|'voice';capturing:boolean;setText:(value:string)=>void;toggleCapture:()=>void;clear:()=>void}.
- AtlasBuildSurface gains mode?:'conversation'|'studio' (default conversation). AtlasChatConversation gains the same explicit mode; studio replaces only its empty-state suggestions/header.
- New draft ensure -> load -> activate -> send is one awaited client sequence. Maintain the same idempotencyKey while recovering a lost ensure response. A creation failure keeps the draft; never auto-replay a paid /api/chat request after an ambiguous response.

- [ ] Add browser assertions against the actual components: empty studio already has Preview region, one composer, studio suggestions, new/existing selector, no intermediate Starta Atlas-chatt. Cover response loss/double click, editable voice before creation and no auto-send, project switch during capture/ensure, focus/keyboard resizing and draft preservation after failure.
```ts
await page.goto('/build');
await expect(page.getByRole('region',{name:'Preview'})).toBeVisible();
await expect(page.getByLabel('Meddelande till Atlas')).toHaveCount(1);
await expect(page.getByRole('button',{name:'Starta Atlas-chatt'})).toHaveCount(0);
await expect(page.getByText('Vad behöver min uppmärksamhet idag?')).toHaveCount(0);
```
At 390/980/1440 px assert document.scrollWidth <= innerWidth; at mobile switch tabs then return to unchanged draft. Starting/build receipt must not steal the chat tab. Fixture capture supplies transcript; it is not proof of a physical microphone.
- [ ] Run RED from apps/web: `npx playwright test --config playwright.atlas-builder-studio.config.ts`. Expected: empty studio assertions fail before implementation. Create config from existing surface harness, one worker, a free local port and output under this plan's SDD directory.
- [ ] Extract existing composer and draft/capture behavior. Add explicit studio layout/empty preview/status tabs; ordinary chat behavior remains. Cancel capture and fence late results on draftKey/project changes. Authenticate page before loading project data.
- [ ] Run GREEN: new browser suite, `npm test --workspace=apps/web -- lib/atlas/conversation/controller.test.ts lib/website-build/planning/conversation-workspace.test.ts --maxWorkers=1 --minWorkers=1`. Expected: one composer, draft isolated, existing exact approval/rendered-revision behavior passes.
- [ ] Commit: `git commit -m "feat: open Atlas chat and preview together in the builder studio"`.

### Task 4: Arkiv, papperskorg och återställning med verklig stop authority
**Files:** lifecycle/types.ts/store.ts/store.test.ts, lifecycle route, StudioLifecycleActions, active list loaders, MigrationFile; real SQL fixture and new browser lifecycle cases.

**Interfaces:**
- Consumes Task 1 Principal/Db and lifecycle types; existing stop_set_project_execution(p_project_id,p_paused,p_actor,p_reason), checkpointClaimedRun(), claim_runs(), static-build commit RPC.
- Produces readProjectLifecycle(db:Db,p:Principal,projectId:string):Promise<ProjectLifecycleView>.
- Produces changeProjectLifecycle(db:Db,p:Principal,input:ChangeLifecycleInput):Promise<ProjectLifecycleView>.
- RPC project_lifecycle_change(p_principal jsonb,p_input jsonb) locks project/lifecycle, validates expectedVersion and owner, calls stop authority in the same transaction for archive/trash and returns new state/version/stopping. Restore retains execution_paused and never schedules work.
- GET/POST /api/projects/by-id/[projectId]/lifecycle: POST body omits projectId; path id is the sole target. Method result has private no-store.

- [ ] Write real SQL tests for archive vs claim, archive vs commit, stale lifecycle version, same-key replay, restore after an unrelated pause, foreign/observer denial, history preserved and original external bindings unchanged.
```ts
const archived=await changeProjectLifecycle(f.db,f.owner,{projectId:f.projectId,expectedVersion:0,action:'archive',idempotencyKey:'archive'});
expect(archived).toMatchObject({state:'archived',version:1,executionPaused:true});
const restored=await changeProjectLifecycle(f.db,f.owner,{projectId:f.projectId,expectedVersion:1,action:'restore',idempotencyKey:'restore'});
expect(restored).toMatchObject({state:'active',version:2,executionPaused:true});
```
Use an actual claimed static run and both transaction orderings to assert no revision can be committed after archive wins. Verify restore creates zero runs and preserves source assets/conversation/provider references.
- [ ] Run RED: `npm test --workspace=apps/web -- lib/project/lifecycle/store.test.ts --maxWorkers=1 --minWorkers=1`. Expected: new lifecycle contract fails; stateful SQL tests execute serially.
- [ ] Implement owner/CAS/idempotent RPC and server wrapper, lifecycle consequence dialog and active/archive/trash selector. Keep ownership allowlists unchanged so restoration/history are reachable. stopping is derived from running/unsettled leased writers, excluding jobs merely queued behind a pause; show Avslutar arbete until their fenced stop is acknowledged.
- [ ] In the new migration, extend website_build_lock_writer(p_writer jsonb,p_allow_pause boolean default false) without removing any existing run/claim/lease/generation checks: lock the project row first FOR UPDATE, then run/session in that order, and reject inactive lifecycle with WEBSITE_WRITER_FENCED/40001 even when p_allow_pause=true. This serializes archive against candidate/interpretation/stage/commit writes; cleanup uses the existing cancellation reaper rather than reviving a writer. Verify both transaction orderings and no deadlock with claim/control/reaper.
- [ ] Verify all existing execution admission/resume paths still observe archive/trash: append a new migration guard to stop_set_project_execution so p_paused=false refuses an inactive project. New studio plan/create/binding writes check active lifecycle; owner history reads stay available.
- [ ] Run GREEN: Task 4 SQL tests, existing execution-stop/website worker tests, new browser archive/trash/restore cases. Expected: inactive projects stay stopped after other resume actions, restore does not revive a job, no permanent-delete UI.
- [ ] Commit: `git commit -m "feat: archive and restore Atlas projects without deleting resources"`.

### Task 5: Meny, historiska länkar och sammanhängande verifiering
**Files:** nav registry/vnext/legacy, workspace registry, project build pages, nav tests, e2e specs/config, schema/route registry and validation report.

**Interfaces:**
- Consumes Tasks 2–4 loaders and real studio surface.
- Produces DestinationId 'build', resolveDestination('build') -> {id:'build',label:'Bygg med Atlas',href:'/build'}, desktop/mobile menu item and command palette entry.
- Owned legacy /projects/[slug]/build and /build/[sessionId] open canonical /build query after the loader validates parent linkage; do not redirect foreign ids into a usable studio.
- Future contracts remain explicit pending_runner/not_implemented; no capability flags become true merely from UI coverage.

- [ ] Add navigation and browser tests for menu/command palette, owner project return, historical session reopen, anonymous login redirect, foreign query denial, original palette variables and ordinary chat starters still present. Assert existing-root requests stay pending after revisiting and default-parent edits.
- [ ] Run RED: `npm test --workspace=apps/web -- lib/nav/registry.test.ts lib/qa/vnext-nav-model.test.ts lib/qa/legacy-nav-contract.test.ts lib/qa/navigation-closure.test.ts --maxWorkers=1 --minWorkers=1`. Expected: new build destination/menu expectations fail.
- [ ] Implement canonical navigation and validated old-link transitions; adjust only obsolete nav expectation values while keeping route/auth/isolation invariants enforced.
- [ ] Run focused GREEN unit/SQL suites serially, the new Playwright suite plus atlas-entry, atlas-build-surface and atlas-conversation-build configs, `npm run typecheck --workspace=apps/web`, `node apps/web/scripts/check-migrations.mjs`. Expected: all affected checks pass; report any unrelated platform failures honestly.
- [ ] Inspect 390/980/1440 screenshots and verify all new routes return auth/private cache behavior. Fixture tests are not a signed-in production/browser/microphone proof.
- [ ] Record exact source SHA, migration name/hash, tests and which capabilities remain absent in the validation report. Commit: `git commit -m "feat: connect Atlas builder studio navigation and verify project lifecycle"`.
- [ ] Native whole-branch review: exactly one fresh reviewer after implementation, as executing-plans requires. Resolve every finding with a failing behavior test where warranted; run only affected checks after fixes.
- [ ] Create a concrete PR with full scope and validation, then use normal required CI/protected merge and separately verify actual migration/deployment evidence under the session's existing release authorization. Never use admin bypass, fabricated green checks or claim deployment from a preview harness.

## Self-review result
All requirements in this focused spec map to Tasks 1–5. Each Review Focus condition has a named behavioral/SQL/browser test above. Interface names are shared rather than duplicated; the only generated path is MigrationFile, resolved by the repository CLI. Desktop execution, actual image input/generation, workforce and live maintenance belong to the other delivery packages in the rollout index, not hidden claims of this first release.

## Execution handoff
Native remains selected. This written plan is the new reviewable artifact; await its human review before implementation, then use superpowers:executing-plans in the existing clean linked worktree. Do not present the method menu again.
