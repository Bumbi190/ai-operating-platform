# Atlas Social Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, native inline execution with one independent whole-branch review.

**Goal:** Connect verified project accounts through operator consent and explicit destination selection, with X runtime calls blocked by the existing cost constraint.
**Architecture:** Reuse canonical identity/credential tables, add server-only transient connection intents, and fence every commit against owner, approved plan and current binding. Keep providers, SQL/store, HTTP and UI separate.
**Tech Stack:** Next.js/TypeScript, Supabase Postgres/RLS, Vitest, Chromium Playwright.
**Spec:** docs/superpowers/specs/2026-10-16-atlas-social-connections-design.md

## Global Constraints
- No paid model/media/provider tests, credit purchases, subscriptions, budget changes, public test posts or publisher dispatch.
- Six selected channels only; Pinterest first Familje-Stunden, LinkedIn company Page first Handlarbörsen, no automatic project selection.
- Canonical one-project-per-external-account invariant remains. Legacy IG/FB/YouTube behavior and The Prompt publisher restriction remain.
- New runtime X network requests are blocked without approved enforced provider spend policy; environment flags/client arguments cannot bypass this.
- Browser/model/read models never receive tokens, client secrets, PKCE verifiers or raw provider errors.
- Fixed callbacks https://app.omniraos.se/api/social-connections/<provider>/callback,10-minute single-use state.
- Shared local database suites run sequentially. Preserve Lumvy three-page preview and100SEK budget.

## Review Focus
- Ownership/plan/binding changes while provider requests are in flight cannot commit or attest a new account (Tasks2–4).
- OAuth success is not destination approval: multiple accounts/boards require an explicit proven selection (Tasks1–4).
- New platform rows cannot fall into legacy YouTube/Meta dispatch, or make all settings unreadable (Tasks2–3).
- Partial network/token/SQL failures retain no usable false binding, and retries never silently rotate/rebind (Tasks1–3).
- Missing configuration, provider app/tier restrictions and X cost gates remain visible; no client field can declare them approved (Tasks1,3–4).

## Task1: Provider contracts and fixture-tested OAuth/identity
Files: apps/web/lib/social-connections/types.ts, providers.ts, providers.test.ts; apps/web/vitest.config.ts.
Interfaces:
- Provider='linkedin'|'pinterest'|'x'; Candidate={key,accountId,accountLabel,destinationId,destinationLabel}.
- Grant={accessToken,refreshToken,scopes,expiresAt,refreshExpiresAt,candidates}.
- providerConfig(provider): client credentials or null; connectionSetup(provider): safe setup metadata.
- authorizationUrl(provider,config,state,challenge):string; exchangeAndDiscover(provider,config,{code,verifier},fetcher?):Promise<Grant>.
- attestDestination(provider,config,accessToken,candidate,fetcher?):Promise<void>.
- ConnectionError carries closed code only; no provider response text.
- [ ] Write tests asserting exact LinkedIn/Pinterest/X OAuth endpoints, registered redirects and minimal scopes; S256 for X; LinkedIn introspection and organization-admin proof; Pinterest stable id and owned board; missing scope/id, ambiguous pagination overflow, expiry,401/403/429/errors and X runtime guard before fetch.
- [ ] Run npx vitest run lib/social-connections/providers.test.ts; Expected: meaningful RED.
- [ ] Implement transport with fixed origins,8-second timeout, bounded response and candidate count100, no automatic retries, token/label validation. LinkedIn version202604. Build X transport fixture coverage but enforce runtime denial at public entry.
- [ ] Same tests Expected: GREEN. Commit feat: verify social OAuth provider identities.

## Task2: Atomic SQL intents and canonical vocabulary
Files: CLI-generated migration social_project_connections_v1; lib/social-connections/store.ts,store.test.ts,test-db.ts; canonical lib/media/social-bindings.ts; migration/schema integrity metadata.
Interfaces:
- beginConnection(db,principal,{projectId,provider,planRevisionId,expectedBindingId,stateHash,verifier}):Promise<{intentId}>.
- consumeConnection(db,principal,{provider,stateHash}):Promise<ConsumedIntent>.
- stageConnection(db,principal,{intentId,grant}):Promise<ConnectionView>.
- readConnection(db,principal,{projectId,intentId}):Promise<ConnectionView> (safe candidates/status only).
- commitConnection(db,principal,{projectId,intentId,candidateKey}):Promise<ConnectionView>.
- ConnectionView={intentId,projectId,provider,status:'awaiting_selection'|'connected',candidates,bindingId,selectedKey,expiresAt}; no secrets.
- [ ] Real SQL tests first: unapproved/stale/foreign plan, actor/project scope, exact expected binding, state expiry/replay, staged token never in safe read, duplicate commit, changed choice conflict, concurrent account change, cross-project same account and all-or-nothing failure. Expected RED.
- [ ] Supabase CLI migration new social_project_connections_v1. Extend canonical constraints for new3 with token_type oauth_user, required binding fence/scopes/expiry; keep legacy token types and YouTube-only state table.
- [ ] Add RLS/server-only intents and bounded INVOKER RPCs. Serialize on project then intent/current binding, recheck owner/approval/CAS, clear transient secrets on commit. Canonical bind/token/audit/health write in one transaction.
- [ ] SQL suite plus migration-security/integrity Expected GREEN. Record local registry provenance, reconcile actual production before merge. Commit feat: persist atomic project social connections.

## Task3: Secure HTTP, metadata and health integration
Files: lib/social-connections/api.ts,api.test.ts,readiness.ts,credentials.ts; app/api/social-connections/[provider]/start/route.ts,callback/route.ts; app/api/social-connections/route.ts; lib/media/credential-health.ts and affected refresh/insight loops; route manifest.
Interfaces:
- socialConnectionStart(request,{provider}):Response, socialConnectionCallback(request,{provider}):Response, socialConnectionApi(request):Response.
- Safe setup/readiness loader consumes actual canonical metadata, env presence and operator capability. Existing social-launch page model gains connections and optional current intent.
- [ ] Tests first: no session/operator, foreign project, same-origin, unknown fields, invalid state/intent, no secret echo, missing config and X guard before DB/network, staged choices but no bind, stale health fencing and legacy explicit dispatch. Expected RED.
- [ ] Start POST accepts projectId,planRevisionId,expectedBindingId only; server generates state. Callback GET accepts bounded code/state/error with no reflection, consumes once and stages provider-attested grant then redirects to authorized project/social?connection=<intentId>. GET/POST /api/social-connections read/commit safe intent with server principal.
- [ ] Metadata reads select only labels/ids/scope names/expiry/binding/health. New expired credentials require explicit reconnect; no blind rotation. Health checks verify exact destination and SQL-fence persistence. Runtime X provider access always denied. Register new routes in security manifest.
- [ ] API/health/isolation and relevant legacy settings/social credentials tests Expected GREEN; typecheck. Commit feat: expose governed social account consent flows.

## Task4: Mobile destination choice and truthful setup
Files: components/social-launch/SocialConnectionControls.tsx,CSS; SocialLaunchPanel.tsx; lib/social-launch/loader.ts/types.ts/catalog.ts; project social page; provider-free e2e/social-connections fixture/config/spec.
Interfaces consume Task3 safe connections+intent; POST begin navigates to server-returned fixed provider URL; commit exact candidate key; no token inputs.
- [ ] Browser tests first: config missing, plan unapproved, multiple candidate choice required, successful commit shows provider account and board, failed commit retains selection, delayed response/project switch ignored,390px fit, X has no usable connect action. Expected RED.
- [ ] Implement connect/reconnect and safe setup instructions. Keep separate identity/plan/publication statuses. Existing three channels hand off to Settings; new2 connect only with actual configured app/operator/approved plan. X cost policy required.
- [ ] Mobile tests, pure readiness regressions, typecheck and diff check Expected GREEN. Add provider-free CI coverage. Commit feat: review project social account destinations.

## Task5: Independent review and release
- [ ] Whole-branch independent review against spec, exact base/head. Fix Important/Critical via RED→GREEN and complete affected suite.
- [ ] Apply reviewed additive migration; inspect real ACL/RLS/functions and existing bindings without provider calls or seeded connections. Update observed registry provenance.
- [ ] Final-head CI, locked merge, identical tree, READY app/queue aliases; HTTP auth smoke and real current cost read.
- [ ] Report actual setup/activation gaps honestly. No live paid/social publishing tests, no new provider app/credit purchase by default.
