# Independent whole-branch review — Atlas / Handlarbörsen test-data cleanup

Reviewed 2026-10-17. **Changes required: four Important findings.** No Critical or Minor findings.

## Scope and method

Read-only review of the approved spec, plan, all 51 recorded rulings, changed production source and relevant tests/contracts, including existing conversation lifecycle and notification producers. No source edits, migrations, database/browser suites, production access, deployment, credential inspection or external messages were performed.

- **H:** C:\Users\Andre\Projects\Handlarborsen\.worktrees\atlas-test-data-20261017
  Base ec1cdbfee9272a7a603c42a5a8cde900702baa0a → HEAD bdf3f4e1046ce4589bd2bfab80ae85a8d24cd71a.
- **O:** C:\Users\Andre\Projects\Omnira\.worktrees\atlas-voice-recovery-20261016
  Current-main base f0b52e16e424658993624194f0155bee83ad3c82 → HEAD ec97db4333c9de7be3e5d8576b877e3eb3dbc8b6.

Paths below are relative to the indicated repository. Findings are demonstrated by source control flow and SQL predicates; the trigger scenarios were **not executed** during this review. The implementation receipt and coordinator-reported successful final integrated O build are supporting evidence, not substitutes for these checks. Previously disclosed O baseline suite failures, focused rather than full O SQL replay, unavailable O lint, H Windows Turbopack limitation and the earlier local dblink incident remain disclosed limitations; this report does not claim full O validation or production readiness.

## Strengths

- Protected real-company UUIDs are enforced independently of names and mutable classification. Shared identities are not disabled by organisation quarantine.
- Human review, project/operator/conversation authority, durable one-use dispatch claims and H's exact JSONB package comparison form distinct checks. Model confirmation does not grant authority, and uncertain jobs reconcile the existing execution rather than resend mutations.
- H retains original business data and separate receipts/markers; service privileges are narrow. The fixed signed transport is bounded and separated from metrics credentials. Metrics v1 history remains distinguishable from v2, with comparison suppression across definition or exclusion-count changes.
- The O delta preserves current-main local-text/inbox imports and routing; no voice-engine or microphone-lifetime change was found.

## Critical

None.

## Important

### I1 — Metadata-owned admin notifications and push deliveries are absent from the closed graph

**Location:** H `supabase/migrations/20261017171220_atlas_test_data_activity_guards.sql:772` and `:790`; H `supabase/migrations/20261017163317_atlas_test_data_packages.sql:231-232`.

**Concrete trigger:** A test dealer sends a platform-organisation message to an independently authorised platform admin. The existing normal producer in H `supabase/migrations/20261005131213_admin_communication_pilot_polish.sql:116-121` inserts an `admin_conversation_message_created` notification with **NULL organization_id** and the test organisation/conversation only in metadata. H `supabase/migrations/20261006095032_admin_operations_communication_safety.sql:964-975` enqueues its opted-in admin push delivery. The recipient admin is not a member/registration owner of the test organisation.

The final graph selects notifications/deliveries only by the direct organisation column or a subject-profile recipient. Consequently these legitimate metadata-owned rows are absent, even though `atlas_business_row_orgs` resolves their metadata for dispatch checks. The processing-delivery blocker repeats the same incomplete predicate. A push claim/preflight can commit, followed by quarantine while the provider request is still in flight: the delivery's changed state neither changes the package fingerprint nor produces a blocker. The coordination lock cannot repair that omission after the claim transaction releases it.

**Actual effect:** The promised in-flight external-work barrier is bypassed for this normal admin push path. A pending admin push also is not recorded in the immutable retained-object snapshot; after a separately reviewed restore, a still-live queued delivery can become dispatchable again. This conflicts with the approved closed-graph, in-flight blocking and no-resend restoration requirements, including ruling 30.

**Recommended change/test:** Select dependencies using the resolved owning-organisation relationship consistently, including metadata/parent edges for notifications, push deliveries and analogous email dependencies. Derive processing blockers from the same resolved graph rather than repeating a narrower selection. Add a SQL regression with an admin recipient outside target memberships and NULL notification organisation: assert exact manifest inclusion/provenance, processing delivery blocking (including claim after preparation), and pending delivery suppression after quarantine plus restore. Do not add the admin identity itself to the quarantine target.

### I2 — Preparing a review permanently prevents normal conversation deletion

**Location:** O `apps/web/supabase/migrations/20261017192903_handlarborsen_test_data_integration.sql:14` and `:37-47`.

**Concrete trigger:** Prepare any eligible package in a conversation, then use the existing delete-conversation action. The review row references `public.conversations(id)` with default NO ACTION, is non-null, and cannot be deleted or rebound because of its immutable trigger. This applies even when the user rejects the package, never approves it, or lets it expire.

The established handler at O `apps/web/app/api/conversations/[id]/route.ts:78-84` physically deletes the conversation and returns HTTP 500 on the resulting foreign-key violation. There is no review-aware lifecycle integration.

**Actual effect:** A routine chat operation stops working indefinitely merely because the new feature was used. An expired/rejected card leaves the same permanent restriction as an applied cleanup; the UI offers no supported resolution. This is a compatibility regression, not a necessary consequence of retaining audit evidence.

**Recommended change/test:** Keep immutable conversation identity in audit records while supporting the existing user-facing deletion lifecycle, for example by decoupling that audit identifier from the live-row foreign key or implementing a compatible tombstone lifecycle. Preserve fresh owned-conversation checks for all subsequent review/dispatch operations; never cascade away receipts or create authority in another thread. Add lifecycle tests covering deletion with pending, rejected, expired, applied and unknown reviews, retained audit data, and denial of later approval from deleted conversations.

### I3 — Definitive non-execution outcomes become permanent “checking” states

**Location:** O `apps/web/lib/atlas/handlarborsen-test-data/service.ts:30-37`; O `apps/web/lib/atlas/handlarborsen-test-data/review-api.ts:39-48`; O `apps/web/lib/atlas/handlarborsen-test-data/stream-effect.ts:19-20`.

**Concrete trigger:** Approve near the ten-minute expiry. The outbox is claimed, but the client preflight or H approval registration rejects the now-expired package with `needs_new_review` before execution. H's registration refusal at `app/api/internal/atlas-test-data/route.ts:60` produces no execution receipt. O nevertheless sends every non-receipt result through `finish(...p_receipt:null)`, marking the job unknown. Every later attempt only requests an absent receipt. A second concrete route is approval committed before process interruption, with the still-pending outbox expiring before its first claim: the resulting `needs_new_review` is also discarded by the review route.

**Actual effect:** The card reports “Utfallet kontrolleras” indefinitely for known non-execution, and after expiry disables the continue button. Expiry is checked only after the unconditional approved-state message. The operator is not told to prepare a new review even though no future receipt can resolve the known refusal. The same collapse obscures explicit disabled/denied outcomes. This conflicts with the approved `needs_new_review` behavior and the recorded undispatched-outbox recovery ruling.

**Recommended change/test:** Persist and expose bounded, definitive no-execution outcomes separately from actual H receipts and uncertain sends. Return a truthful next step for expired undispatched/explicitly rejected jobs; retain receipt-only reconciliation for genuine dispatch uncertainty and require a real applied receipt for success. Test expiry between approval/claim/client/H registration, pending-outbox expiry, explicit disabled/revoked refusal, and contrast them with timeout-after-commit reconciliation. No new mutation ID or automatic resend should be introduced.

### I4 — Returning to a cached thread cannot recover a review that arrived while away

**Location:** O `apps/web/lib/atlas/conversation/controller.ts:179-219`, especially `:183` and `:212-214`; related event gate `:392-394`.

**Concrete trigger:** Start preparing a package in thread A, switch to thread B before the typed review event arrives, then return to A with the server-saved message containing that review. A's snapshot already exists. The stream intentionally ignores review effects when A is not current, while `savedTestDataReviews` is used only when constructing a new snapshot. Even the existing authoritative-history rehydration branch refreshes only history/entries, never `testDataReviews`.

**Actual effect:** The actionable review card remains absent from that conversation despite its durable saved review, until a full reload creates a fresh controller. A user following the supported navigation/conversation flow cannot approve the prepared package and may create redundant packages. This does not transfer authority to another thread, but it breaks recovery and shared chat/voice continuity.

**Recommended change/test:** Merge validated saved review effects into an existing cached conversation on authoritative activation/refresh, preserving package/review/conversation binding and avoiding downgrade of newer local decisions or receipts by older saved pending views. Add a delayed-stream test that switches away before the review frame, returns with the saved effect, and obtains exactly one card; also test another-tab saved review and refresh after a locally applied receipt. Existing tests cover navigation only after a card has already arrived.

## Minor

None. No speculative issue is promoted to a finding.

## Declined to judge

None. No implementation behavior examined was set aside for an unrecorded coordinator ruling. Production activation, live cleanup and rerunning validation suites were outside this read-only review's authorised scope, rather than deferred judgments about these findings.

## Readiness

**Changes required.** Address I1–I4 and validate their concrete regressions in the coordinator's single fix pass. The current source provides strong protections for target authority and idempotency, but the dispatch-graph omission and three normal lifecycle/recovery failures should be corrected before the implementation is considered ready. This assessment is for the exact frozen HEADs above and does not approve production activation or target cleanup.
