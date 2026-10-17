# Atlas Handlarbörsen Test Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atlas can inventory, prepare, quarantine and restore explicitly verified test organisations in Handlarbörsen through one reviewed package, while real organisations and their data remain protected.

**Architecture:** Handlarbörsen owns classification, dependency checks, durable packages and atomic execution. Omnira authenticates the operator, binds a review card to one immutable package, and calls a fixed signed integration. Quarantine is reversible, affects central access and metrics, and never means company closure or physical deletion.

**Tech Stack:** Handlarbörsen Next.js 16.3.5 / React 19 / PostgreSQL 17 / Supabase / Vitest 5 / pgTAP / Playwright; Omnira Next.js 14.2.29 / React 18 / Supabase / Vitest 2 / Playwright. Reuse installed versions; no package upgrades.

**Spec:** `docs/superpowers/specs/2026-10-17-atlas-handlarborsen-test-data-design.md` (approved 2026-10-17, including the two protected companies).

## Global Constraints

- Protect `23b45965-71f8-4e95-a4eb-32872234664d` (familje-stunden AB) and `d679116a-fc8f-4f80-85c5-1dbecfff8257` (Bromölla kylteknik) by ID. Neither can be classified as test or included in cleanup, regardless of name or stale registry data. All other existing organisations start unknown, not test.
- Project identity is exactly `8f673c09-1c8f-4d78-876e-4c14bf1c89b3` / `handlarborsen`. Observer permission allows inventory only. Mutation needs a separate explicit operation grant.
- Fixed HTTPS base `https://www.handlarborsen.se/api/internal/atlas-test-data`; no redirects, user-supplied hosts, SQL, table names or credentials. Existing metrics credential remains read-only.
- Prepared packages expire after ten minutes. Exact IDs, graph fingerprint, classification revision, operator, project and human approval are bound together. Block the whole package if any target is ineligible.
- No Auth/Storage deletion, company closure, subscription cancellation, external messages, provider billing calls or automatic mutation retry. Timeout means unknown until receipt reconciliation.
- Preserve Anders, approved microphone/stream/VAD/cost behaviour and conversation lifetime. No extra inventory call on ordinary turns. Use local fake audio/providers only in development tests.
- Protected production data is not edited by this plan or its implementation tests. First live classification and cleanup need a separately reviewed exact package. No approval of this plan classifies the remaining eight companies.
- Do not broaden existing service-role table grants, generic approval permissions, workflow/autonomy authority or collaborator rights. Classification is a platform-admin operation; the model cannot grant it to itself.

## Review Focus

1. A protected company is renamed or incorrectly marked test: ID protection still blocks it (Task 1).
2. A user belongs to both a test organisation and a real one: quarantine cannot disable that identity or their real membership (Tasks 2/4).
3. Two tabs approve, the network drops after commit, or a fresh request ID repeats the command: exactly one durable result, no blind replay (Tasks 3/6/7).
4. A bid or queued delivery races the review: execution detects changed dependencies; claimed external work prevents quarantine until resolved (Tasks 3/4).
5. The user navigates away, signs out or switches threads while a package card is open: stale UI cannot approve another package; microphone lifetime stays unchanged (Task 7).

## Repositories and execution preparation

H = `Bumbi190/handlarborsen`, O = `Bumbi190/ai-operating-platform`. Paths in each task are relative to that repository. Plan-only work is in O branch `codex/atlas-test-data-design-20261017`; implementation starts from freshly fetched main in isolated clean workspaces. Preserve H's unrelated local change in `app/app/organisation/abonnemang/page.tsx`.

Reviewed main refs: H `ec1cdbfee9272a7a603c42a5a8cde900702baa0a`; O advanced to `ea5f02ac50888e6395af4ae34d6693576e90d6a8` during planning. Refresh relevant files at execution; preserve the inbox work and other concurrent features. Read H `AGENTS.md`, canonical security/lifecycle docs and installed `node_modules/next/dist/docs/` before implementation. Consult current Supabase docs/changelog before schema changes.

Run the current CLI's `migration new --help` before creating migrations. Use `npx --no-install supabase migration new atlas_test_data_<suffix>` in H; record the generated filename under the named task. Do not invent timestamps or modify old migrations. SQL changes are developed and tested only against the isolated local database. The verified installed CLI accepts `test db --local <path...>`; never substitute `--linked` or production URLs.

Before coding, record the clean baseline for each targeted suite below. Full suite failures outside scope require a reproduced baseline; do not silently repair them. Native browser suites run sequentially, workers 1 / retries 0. Each task follows RED → meaningful failure → implementation → GREEN → focused reviewable commit. Do not activate the mutation capability before Tasks 1–7 all pass.

## Shared contract and file boundaries

H `lib/atlas-test-data/contracts.ts` owns schema v1. O `apps/web/lib/atlas/handlarborsen-test-data/contracts.ts` mirrors it with shared JSON fixtures tested in both repositories; do not create a new workspace dependency between repos.

`Classification = 'unknown' | 'real' | 'verified_test'`; `Operation = 'quarantine' | 'restore'`; `Outcome = 'prepared' | 'blocked' | 'nothing_to_do' | 'applied' | 'needs_new_review' | 'unknown'`.

`PackageView = {packageId, projectId, conversationId, operatorBindingId, operation, organisationIds: string[], classificationRevision, graphSha256, expiresAt, counts: Record<string, number>, blockers: {code: string, organisationId: string}[], status: Outcome}`. `ReceiptView = {packageId, executionId, operation, outcome, beforeSha256, afterSha256, counts, committedAt: string|null}`. Runtime decoders reject extra authority fields, invalid UUIDs, invalid timestamps, duplicate IDs, inconsistent counts and unrecognised versions. Package fingerprint is a SHA-256 of canonical JSON with sorted IDs/rows and explicit contract version; database state, not LLM output, supplies its contents.

Additional DTOs defined in Task 1: `ClassificationView = {organisationId: string, classification: Classification, revision: number, evidenceRef: string|null}`; `InventoryOrganisationView = {organisationId: string, name: string, classification: Classification, revision: number, counts: Record<string, number>, blockers: {code: string, organisationId: string}[]}`; `InventoryView = {schemaVersion: 1, observedAt: string, organisations: InventoryOrganisationView[], nextCursor: string|null}`. Timestamps are finite ISO UTC strings. Counters/revisions are non-negative safe integers, identifiers are UUIDs and fingerprints are lowercase 64-hex SHA-256. Contracts contain no secret material.

Task 1 server-only `VerifiedPlatformAdmin` is `Awaited<ReturnType<typeof requirePlatformAdmin>>`, produced by the existing guard. Task 6 server-only `VerifiedCleanupOperator = {userId: string, projectId: string, conversationId: string, operatorBindingId: string, allowedOperations: readonly Operation[]}` is returned only after `resolveCleanupOperator` verifies those values. Decoding that shape cannot grant authority. H's integration principal derives its permitted operator/project binding from its private stored principal after signature verification.

Task 6 defines `IntegrationRequest` as a closed discriminated union: `{action:'inventory', cursor?: string}`, `{action:'prepare', organisationIds: string[], operation: Operation, conversationId: string}`, `{action:'execute', packageId: string, approvalRef: string, executionId: string, idempotencyKey: string}`, or `{action:'receipt', executionId: string}`. `IntegrationResponse` is the corresponding versioned InventoryView/PackageView/ReceiptView response or a redacted stable error. Server authority fields are never model arguments; the signed envelope binds the operator outside the model-controlled payload. Empty preparation returns `nothing_to_do`; duplicate or over-25 target lists are rejected before graph traversal. Inventory uses pages of 25 and an opaque server cursor. A cursor never expands an approved package.

New persistent data: private H classification/provenance register, protected-ID registry, integration principals, consumed request nonces, prepared packages, execution receipts and quarantine markers. O stores conversation/operator-bound review records and a durable outbound execution identifier. Schema migrations and generated types belong to their owning repo. Public RPCs expose only narrow contracts, explicit grants and redacted errors; base tables remain private.

### Task 1: Classification and protected IDs (H)

**Files:** Create `lib/atlas-test-data/contracts.ts`, `lib/atlas-test-data/protected-organisations.ts`, `lib/atlas-test-data/classification.ts`, `actions/admin-test-data.ts`, `app/admin/testdata/page.tsx`, `components/admin/test-data-classification.tsx`, `tests/unit/atlas-test-data-classification.test.ts`, `supabase/tests/database/atlas_test_data_registry_test.sql`. Modify `components/admin/admin-navigation.tsx` and generated `types/database.types.ts` via `scripts/database-types.mjs`. Migration suffix: `registry`.

**Interfaces:** `isProtectedOrganisation(id: string): boolean`; server `classifyOrganisation(input: {organisationId, classification, expectedRevision, evidence}, principal: VerifiedPlatformAdmin): Promise<ClassificationView>`. The server derives `VerifiedPlatformAdmin` through existing `requirePlatformAdmin` / DB authority, never from form/model fields. Produce registry revision and ID-bound provenance used by Task 2; no Atlas tool can call classification.

- [ ] Write failing tests `protected_id_survives_rename`, `protected_id_cannot_be_verified_test`, `unknown_is_default`, `dealer_and_viewer_cannot_classify`, `stale_classification_revision_is_rejected`. Assert both exact protected UUIDs reject test classification and `unknown` does not become test on name match.
- [ ] Run `npx vitest run tests/unit/atlas-test-data-classification.test.ts` and `npx --no-install supabase test db --local supabase/tests/database/atlas_test_data_registry_test.sql`; require failures from missing feature assertions, not missing test infrastructure.
- [ ] Implement contracts, private registry and ID-protection constraints; classification requires explicit evidence and current admin identity. Add the admin view with separate real/test/unknown choices, dependency warnings and no automatic bulk selection. Mark the two protected IDs real when introducing registry protection, without touching their organisations or business rows.
- [ ] Re-run both commands and existing `supabase/tests/database/phase23b_privilege_invariants_test.sql`. Generate/check local database types using existing scripts, verify only expected schema changes, then commit `feat: classify test organisations with protected real identities`.

Pinned Task 1 assertions: `expect(isProtectedOrganisation('23b45965-71f8-4e95-a4eb-32872234664d')).toBe(true)`; `expect(isProtectedOrganisation('d679116a-fc8f-4f80-85c5-1dbecfff8257')).toBe(true)`. DB classification of either ID as verified_test must raise permission denial and leave revision unchanged.

### Task 2: Dependency inventory and immutable preparation (H)

**Files:** Create `lib/atlas-test-data/inventory.ts`, `lib/atlas-test-data/packages.ts`, `tests/unit/atlas-test-data-packages.test.ts`, `supabase/tests/database/atlas_test_data_inventory_test.sql`. Migration suffix: `packages`.

**Interfaces:** `inspectTestData(principal, cursor?: string): Promise<InventoryView>`; `prepareTestDataPackage({organisationIds, operation, conversationId, operatorBindingId}, principal): Promise<PackageView>`. The authoritative DB preparation stores sorted exact IDs, provenance revisions, affected-object fingerprints, blocker list and DB-clock expiry of creation + interval '10 minutes'. Empty target list returns `nothing_to_do`; duplicates and protected/unknown/real IDs are rejected.

- [ ] Write failing `mixed_graph_blocks_entire_package`, `unverified_child_blocks_package`, `shared_real_membership_blocks_cleanup`, `stripe_link_blocks_cleanup`, `pending_external_dispatch_blocks_cleanup`, `empty_selection_has_no_package_effect`, `ttl_is_exactly_ten_minutes` tests. Assert no package is executable when one target has an unknown/real buyer, shared real membership or unverified child.
- [ ] Run `npx vitest run tests/unit/atlas-test-data-packages.test.ts` and `npx --no-install supabase test db --local supabase/tests/database/atlas_test_data_inventory_test.sql`; record RED.
- [ ] Implement a closed graph walker over organisations, members, invitations, vehicles and their images/reports/damages/service/tires, auctions, bids, interests, offers, deals, conversations/messages, notifications, admin/risk history, subscriptions and pending external deliveries. Record exact ID-bound origins in the private provenance register; classify no child implicitly from a parent. Historical audit rows remain preserved references. Unknown external dependencies or a schema dependency not covered by the walker block preparation.
- [ ] Return only names/IDs, classifications, counts and stable blocker codes to inventory; no contact details, VIN, messages, passwords or payment identifiers. Fingerprint includes existing lifecycle state and all graph revisions; restore preparation binds the original applied receipt and current marker revision.
- [ ] Re-run both suites GREEN and commit `feat: prepare exact test cleanup packages from verified dependencies`.

Pinned Task 2 assertions: `expect(mixedPackage.status).toBe('blocked')`; `expect(emptyPreparation.status).toBe('nothing_to_do')`; `expect(Date.parse(prepared.expiresAt) - createdAtMs).toBe(600000)`. Preparation creates no quarantine markers.

### Task 3: Transactional quarantine, restoration and receipts (H)

**Files:** Create `lib/atlas-test-data/execution.ts`, `supabase/tests/database/atlas_test_data_execution_test.sql`, `supabase/tests/database/atlas_test_data_concurrency_test.sql`. Migration suffix: `execution`.

**Interfaces:** `executeTestDataPackage({packageId, approvalRef, executionId, idempotencyKey}, principal): Promise<ReceiptView>`; `readTestDataReceipt({executionId}, principal): Promise<ReceiptView|null>`. Approval binds every PackageView authority field. `restore` consumes a separately approved restore package; no operation accepts replacement target IDs.

- [ ] Write SQL tests `stale_graph_has_zero_changes`, `expired_package_has_zero_changes`, `classification_revocation_blocks_execution`, `one_blocker_rolls_back_whole_batch`, `same_key_same_package_returns_same_receipt`, `same_key_other_package_is_rejected`, `restore_preserves_later_manual_status`, and two-connection races for new bids/members/vehicles and concurrent packages. Assert actual row/marker/audit effects, not function source strings.
- [ ] Run the two task pgTAP files with `npx --no-install supabase test db --local supabase/tests/database/atlas_test_data_execution_test.sql supabase/tests/database/atlas_test_data_concurrency_test.sql`; require RED. Use pgTAP's separate dblink connections for lock tests, with bounded lock/statement timeouts; always clean up owned connections.
- [ ] Implement package-first, sorted-organisation locking; recheck live principal/operation grant, ten-minute expiry, protected IDs, full graph and classification revision under lock. Atomically insert quarantine markers, immutable receipt and audit. Do not update original company/vehicle/deal statuses, Auth, Storage or subscriptions. Grant no remote execution access until Task 4's guards pass.
- [ ] Implement restore as marker transition referencing the original receipt; preserve later manual changes and deny reopening closed organisations. Same-key calls reconcile an existing result; transaction failure leaves no partial markers. Read-only receipt lookup supports timeout recovery.
- [ ] Run GREEN plus existing organisation close/concurrency tests; commit `feat: atomically quarantine and restore approved test packages`.

Pinned Task 3 assertions: `expect(staleReceipt.outcome).toBe('needs_new_review')`; `expect(secondReceipt.executionId).toBe(firstReceipt.executionId)`; transaction tests compare before/after protected-row and membership digests for equality.

### Task 4: Central product boundaries and background work (H)

**Files:** Create `lib/atlas-test-data/activity-gate.ts`, `tests/unit/atlas-test-data-dispatch.test.ts`, `supabase/tests/database/atlas_test_data_access_test.sql`, `tests/e2e/atlas-test-data.spec.ts`. Modify `lib/dealer/access.ts`, `lib/dealer/product-access.ts`, `lib/marketplace/data.ts`, `lib/notifications/load.ts`, `lib/push/dispatch.ts`, `lib/email/admin-alerts.ts`, `lib/billing/seat-sync.ts`, `lib/server/auction-settlement.ts`, `lib/server/vehicle-purge.ts` only at the central owning boundaries. Migration suffix: `activity_guards`.

**Interfaces:** SQL private `is_organisation_quarantined(uuid)` and `assert_organisations_active(uuid[])` with stable sorted locks. Server `checkTestDataDispatch(targetOrganisationIds: string[]): Promise<'allowed'|'quarantined'|'unknown'>`; unknown is not permission. Central read and mutation functions consume these rather than independently inferring testness.

- [ ] Write failing `direct_vehicle_link_denied`, `old_session_cannot_trade`, `real_identity_keeps_real_membership`, `quarantined_data_hidden_from_search`, `queued_delivery_not_dispatched`, `claimed_delivery_blocks_quarantine`, `restored_test_history_keeps_original_status` tests. Assert actual access denial with authenticated dealer contexts and provider mocks called zero times for blocked delivery.
- [ ] Run task unit/pgTAP/browser files individually (`npx vitest run ...`, `npx --no-install supabase test db --local ...`, `npx playwright test tests/e2e/atlas-test-data.spec.ts --workers=1 --retries=0`), against isolated local test services, and record RED.
- [ ] Add new migration replacements for latest `private.is_active_organization_member_for_auth_context`, `private.is_active_organization_member`, `private.is_dealer_admin`, `private.has_marketplace_access`, `private.can_read_vehicle`, `private.can_manage_vehicle`, marketplace search/filter/seller readers and conversation access readers. Preserve platform-admin historical inspection. Inspect latest definitions, not old migration versions.
- [ ] Add stable organisation-locking guards to current vehicle/publication/member/invitation/trade/message mutation entry points and dependent INSERT/UPDATE triggers. Cover `buy_fixed_price_vehicle`, auction settlement, bidding, interests/offers/deals and new membership creation. Central guards must also protect service-role RPC paths. Guards add no writes during ordinary reads and preserve all existing checks.
- [ ] Make dispatch/settlement/purge claim and final-dispatch paths respect quarantine. Acquire dispatch leases using the same organisation lock; an outstanding external lease blocks cleanup until reconciled. Prevent a check-then-send race: no new lease can appear after quarantine commit. Do not cancel genuine billing or purge original retained test assets. Keep local mail/Stripe/provider credentials disabled in tests.
- [ ] Run task suites GREEN plus `organization_close_*`, `rls_marketplace_vehicle_test.sql`, `dealer_workspace_invitation_*`, push/billing privilege and lifecycle suites. Commit `feat: enforce test quarantine across access commerce and dispatch`.

Pinned Task 4 assertions: `expect(sendEmailMock).toHaveBeenCalledTimes(0)`; `expect(sendPushMock).toHaveBeenCalledTimes(0)`; `expect(stripeMock).toHaveBeenCalledTimes(0)` for quarantined work. Existing real-organisation access still succeeds in the same authenticated fixture.

### Task 5: Versioned production metrics and honest history (H + O)

**Files H:** Modify `lib/server/atlas-metrics.ts`, `app/api/internal/atlas-metrics/route.ts`, `docs/ATLAS_METRICS_API.md`; create `supabase/tests/database/atlas_marketplace_metrics_v2_test.sql`, `tests/unit/atlas-metrics-v2.test.ts`. Migration suffix: `metrics_v2`.
**Files O:** Modify `apps/web/lib/atlas/collectors/handlarborsen-marketplace.ts`, `apps/web/lib/atlas/project-analytics/handlarborsen-marketplace-report.ts`, `handlarborsen-marketplace-source.ts` and `handlarborsen-trends.ts` in that directory; create `apps/web/lib/qa/handlarborsen-metrics-v2.test.ts`; add generated migration `handlarborsen_metrics_definition` under `apps/web/supabase/migrations` using the existing repo migration workflow.

**Interfaces:** Preserve v1 unchanged. Explicit `?schema_version=2` returns the existing eleven metric keys plus `schema_version:2`, `data_scope:'production_excluding_quarantined_test'`, `excluded_test_organisations`, `definition_id:'handlarborsen-production-v2'`, `observed_at` and existing null/unavailable semantics. Default endpoint remains v1 until coordinated consumer switch. O snapshots store definition/scope; historical rows are tagged legacy, not rewritten.

- [ ] Write `v1_still_counts_closed_and_quarantined`, `v2_excludes_every_quarantined_counterparty`, `real_company_counts_unchanged`, `restore_reverses_only_exclusion`, `failed_query_is_null_not_zero`, `mixed_definition_history_has_no_growth_delta` tests with real/test fixtures and exact expected counts for all eleven metrics.
- [ ] Run H's task suites and O `npx vitest run lib/qa/handlarborsen-metrics-v2.test.ts` from `apps/web`; record RED.
- [ ] Implement a distinct service-role-only aggregate RPC for v2, explicit API negotiation and strict O decoder. Scope both sides of transactional counts; don't grant row access through metrics. Persist definition metadata and show a Swedish definitions-change marker instead of growth across versions. Old snapshots and v1 consumers remain intact.
- [ ] Run GREEN, existing metric/collector/report/trend contracts and the migration guard; commit each repo separately with compatible producer-first behaviour.

Pinned Task 5 assertions: `expect(v2.schema_version).toBe(2)`; `expect(v2.data_scope).toBe('production_excluding_quarantined_test')`; `expect(mixedHistory.growthDelta).toBeNull()`. The report model defines nullable growthDelta for definition boundaries; never synthesize zero growth.

### Task 6: Signed integration and durable reconciliation (H + O)

**Files H:** Create `lib/atlas-test-data/request-auth.ts`, `app/api/internal/atlas-test-data/route.ts`, `tests/unit/atlas-test-data-route.test.ts`, `supabase/tests/database/atlas_test_data_principal_test.sql`; migration suffix `integration_principals`.
**Files O:** Create `apps/web/lib/atlas/handlarborsen-test-data/contracts.ts`, `client.ts`, `authority.ts`, `service.ts`, `apps/web/lib/qa/handlarborsen-test-data-client.test.ts`, `handlarborsen-test-data-authority.test.ts`; create cross-repo identical JSON fixtures under each repo's task test fixtures. New credentials/feature flags are documented by names only in owning integration docs, never values.

**Interfaces:** `callHandlarborsenTestData(request: IntegrationRequest, principal: VerifiedCleanupOperator): Promise<IntegrationResponse>` only POSTs the fixed endpoint; action is one of inventory/prepare/execute/receipt. Read/prepare and execute/restore use distinct capability credentials. `resolveCleanupOperator()` derives verified session, project ownership, platform operator status, owned conversation and explicit operation grant on the server; no model-supplied principal is trusted.

- [ ] Write failing `metrics_token_cannot_mutate`, `wrong_project_denied`, `viewer_denied`, `observer_without_operation_grant_denied`, `forged_operator_body_denied`, `revoked_principal_denied`, `replayed_signature_denied`, `redirect_denied_without_forwarding_secret`, `timeout_only_reads_existing_receipt` tests. Assert zero upstream mutation calls for denied authority, zero redirect following, no credential in returned/logged errors.
- [ ] Run H/O task Vitest suites and principal pgTAP file; record RED.
- [ ] Implement HMAC-SHA256 over canonical method/path/body hash, principal/key ID, execution/request ID and signed timestamp. Enforce a two-minute transport timestamp window separately from ten-minute package expiry, consume nonces atomically and compare signatures in constant time. Read/prepare credentials cannot call execute. H checks the stored, revocable operator/project binding; UUIDs are not assumed equal across apps.
- [ ] Persist O outbound execution ID before dispatch. Repeated calls with fresh request IDs reconcile the same approved package; never dispatch an unknown outcome as a new job. Fixed 10-second network timeout, bounded 64-KiB body and schema validation. After network timeout expose unknown and use read-only receipt reconciliation; don't auto-resend the mutation. No secrets in browser bundles or tooling results.
- [ ] Run GREEN with in-process HTTP mocks and independent signature fixtures in both repos; preserve other integrations, then commit separately. Feature flag `ATLAS_TEST_DATA_MUTATIONS_ENABLED` remains false on both servers.

Pinned Task 6 assertions: `expect(fetchMock).toHaveBeenCalledTimes(0)` after authority denial; a timeout permits only an action=receipt follow-up with the existing executionId, never another action=execute.

### Task 7: Conversation-bound review card and Atlas tools (O)

**Files:** Create `apps/web/lib/atlas/handlarborsen-test-data/atlas-tools.ts`, `review-store.ts`, `stream-effect.ts`, `apps/web/components/platform/os/AtlasTestDataReviewCard.tsx`, `AtlasTestDataReviewCard.module.css`, `apps/web/app/api/atlas/handlarborsen/test-data/[packageId]/review/route.ts`, `apps/web/lib/qa/handlarborsen-test-data-review.test.ts`, `handlarborsen-test-data-tools.test.ts`, `apps/web/e2e/atlas-test-data-review.spec.ts`. Modify `apps/web/app/api/chat/route.ts`, `apps/web/lib/os/chat-shared.ts`, `apps/web/lib/atlas/conversation/controller.ts`, `apps/web/components/platform/os/AtlasVoicePanel.tsx`, `apps/web/components/platform/vnext/AtlasChatConversation.tsx`. Migration name `handlarborsen_test_data_reviews` through the existing O workflow.

**Interfaces:** Tools exactly `inspect_handlarborsen_test_data`, `prepare_handlarborsen_test_cleanup`, `execute_handlarborsen_test_cleanup`, `get_handlarborsen_test_cleanup_receipt`. O review record binds user/project/conversation/package/fingerprint/expiry and decision. New validated stream event `handlarborsen_test_data_review` supplies only a server-produced PackageView to a dedicated decoder; tool-result prose and arbitrary URLs never create authority. `ReviewCard({packageView, decisionState, onReview})` submits only approve/reject plus the bound reference to the dedicated server route.

- [ ] Write failing `llm_confirm_true_has_no_authority`, `loose_voice_yes_does_not_approve`, `other_conversation_card_cannot_approve`, `two_tabs_make_one_decision`, `signout_revokes_review`, `expired_card_requires_new_review`, `navigation_preserves_call_and_correct_card`, `receipt_required_for_success_copy` tests. Assert no generic approval route is used, false model claims aren't shown as receipts, and an ordinary voice question makes zero integration calls.
- [ ] Run O task Vitest and isolated review browser harness RED. Add the new review spec to a dedicated local-only Playwright config/server based on the existing messenger/voice harness; do not run paid speech or database services.
- [ ] Implement strict review decoder and conversation-owned state. Reuse platform-operator and project-authority predicates, not `/api/approvals/[id]`, which requires a workflow run and has different authority. Dedicated review RPC atomically transitions pending → approved/rejected only for the exact unexpired package. Add a server-only outbox/claim tied to that decision so double-clicks and model repeated execution cannot double-dispatch. No generic workflow/autonomy policy is relaxed.
- [ ] Render the same card in full chat and global voice panel; minimize, navigate and reopen without a second voice engine. Show Swedish outcomes: `Testdata undanlagd`, `Inga testposter att lägga undan`, `Ny granskning behövs`, `Utfallet kontrolleras`, plus blocked reason. Restore requires its own clearly named package/card. Approved server work continues if the microphone is stopped; a deliberate thread switch never transfers the card's authority.
- [ ] Run GREEN plus controller, operator/project-isolation and relevant shared-voice lifecycle suites sequentially. Run `npx tsc --noEmit --incremental false` from `apps/web`, then commit `feat(atlas): review and execute verified test cleanup during conversations`.

Pinned Task 7 assertions: `expect(executeMock).toHaveBeenCalledTimes(1)` after two approvals of one package; `expect(ordinaryTurnIntegrationCalls).toBe(0)`; an old-thread card remains unable to approve after a thread switch.

### Task 8: End-to-end verification and coordinated delivery (H + O)

**Files:** Create H `docs/ATLAS_TEST_DATA_API.md` and O `docs/architecture/atlas-test-data/2026-10-17-verification.md`; extend the H/O task test files with the integrated local scenario. Record generated migration names, commit SHAs, exact commands and actual outcomes in the verification receipt.

- [ ] Run the local scenario with both protected companies, an unknown company, a synthetic all-test graph and a test/real mixed graph. Classification, inventory, one card approval, quarantine, hidden direct links, blocked commerce, metrics v2, durable receipt, restore and historical marker must all match actual DB state. Compare protected row/membership/business digests before and after; require exact equality.
- [ ] Exercise timeout-after-commit, duplicate card approval, stale package, revocation, concurrent activity and dispatch leases. Reconcile only by execution receipt. Assert zero mail, push, Stripe and paid speech calls throughout the suite.
- [ ] Run H `npm run typecheck`, task unit/e2e suites, full local `npm run test:db`, local database-types check and build. Run O typecheck, task suites, affected voice/messenger regressions and build/migration guard. Clearly separate unchanged baseline failures from passing scoped checks. Obtain an independent whole-branch review before merging; address concrete findings and re-run only affected checks.
- [ ] Prepare reviewable PRs and a producer-first release receipt. Keep new mutation flags false and credentials unset until reviewed deployment/activation. Deploy compatible H schema/API then O consumer; verify exact SHA/host and no paid-call production smoke. Public unauthenticated mutation endpoints must deny access. No rollback by deleting data or resetting the database.
- [ ] First live use is authenticated read-only inventory and deliberate classification of owner-confirmed exact targets. Neither today's ten organisations nor the remaining eight are implicitly approved. Protected companies are already non-targets. Enable only the narrow operation after the reviewed implementation, and require the owner's exact package approval for any cleanup.
- [ ] Rollback disables both mutation flags/grants and reconciles any in-flight execution by ID; already quarantined data remains recoverable with its receipt. Do not rewrite historical snapshots, reverse unrelated releases or claim restore if it has not run. Handoff includes what was built, what is live, what was tested and any remaining manual/phone checks.

## Self-review and execution handoff

Coverage: classification/protection → 1; provenance/packages → 2; atomic apply/restore/timeout/idempotency → 3/6; central access/background races → 4; versioned metrics/history → 5; fixed scoped transport → 6; one human approval and persistent conversation → 7; end-to-end receipt and rollout → 8. All five Review Focus items are assigned explicit tests above.

No product tests have been run as part of writing this plan; all test commands above describe required implementation work, not completed verification. Plan/spec-only checks are whitespace, protected-ID/expiry consistency, existing-reference verification and absence of unresolved placeholders. Migration timestamps are intentionally generated by the installed CLI at execution.

Recommended execution: Native via `superpowers:executing-plans`, sequentially through the shared interfaces with an independent whole-branch reviewer before merging. This avoids independent implementers guessing across the two apps' security boundaries. The owner reviews this plan and selects Native or Subagent-driven before implementation begins.
