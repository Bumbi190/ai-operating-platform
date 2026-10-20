# Calendar social worker: claim source-revision prototype

Status: DRAFT TEST CANDIDATE ONLY. No live migration, social-provider API call, dispatch activation or autonomous weekly calendar approval.

## Source definitions and preserved behavior

The production-source function social_schedule_claim(jsonb) comes from apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. It validates worker input, returns null for dryRun, enumerates up to 50 due candidates, skips locked project and job rows, checks provider/lease state, enforces social_schedule_authority and then either claims, blocks, marks missed or recovers prior provider state. An in-flight creating/publishing publication is marked uncertain rather than being blindly sent to the provider again.

The candidate apps/web/lib/calendar/social-worker-claim-revision-candidate.sql preserves the original claim function body. It adds:

- A service-role-only SECURITY DEFINER helper which derives the project owner from the database, verifies the owner/project revision exists and takes FOR UPDATE SKIP LOCKED on that source revision BEFORE the existing project/job row locks. Busy source revisions are skipped to allow other projects to progress; missing revisions fail closed.
- An atomic revision increment on each of the four actual state mutation exits: lease recovery, missed, blocked, and claimed. Dry-run, skipped row or no matching job does not advance the revision.
- Existing original SQL checks and event/audit writes, including the rule that creating/publishing is moved to uncertain rather than retried without a provider receipt.
- Execution of worker helpers and social_schedule_claim restricted to service_role, not authenticated clients. Service role alone is not a proof of an authorized real-world actor.

The source-parity tests compare the candidate against the original SQL body with only those additions removed.

## Isolated PostgreSQL evidence

- Eight state/authority tests: execution ACL, dry-run, missing revision fail-closed, single queued claim/idempotent lease, expired/missed event, revoked/blocked event, uncertain recovery of an in-flight claim, and owner/project revision isolation.
- Two deterministic concurrent SQL tests against the isolated weekly batch:
  - A week booking for project A holds the source revision; a worker skips A and claims eligible B without waiting. Project A's pending social job is unchanged.
  - A worker claim updates A's source revision first. A weekly batch with the old expected version waits and then fails with STALE_SOURCE without inserting a stale calendar event.
- Three source parity/order tests verify that the candidate preserves the original claim branches and that source locks precede project/job locks with exactly one bump on each mutating exit.

Total: 13 targeted tests green in the isolated PostgreSQL fixture.

## Important limits

The social-worker-claim-source-fixture.sql is a deliberately simplified representation. Its social_schedule_authority stub checks only the existing approval/revocation and due time, NOT real content/media account-binding, provider authorization, monthly release access, RLS or worker authentication. It cannot establish end-to-end safe publication or a real provider POST policy.

Remaining work before production:
1. Extend the common calendar revision-first protocol to social_schedule_locked_claim, social_schedule_step, social_schedule_recover_checkpoint, publication reconciliation and direct row mutations.
2. Validate the real checkpoint/evidence and provider-in-flight safety rules using final SQL definitions after all migration overlays; a requested cancellation cannot undo a published/uncertain provider side-effect.
3. Build the complete source/project/job/worker/platform-stop lock graph and multi-session races; the candidate keeps source locks when it skips a later busy project row, so lock footprint/fairness should also be measured.
4. Review full-schema RLS, service_role and SECURITY DEFINER restrictions. A privileged caller can forge JSON worker parameters; use trusted server authorization and do not expose helper functions to ordinary clients.
5. Safely initialize and monitor owner/project revision state; fail-closed missing versions need recovery and alerting, not silent drops.
6. Bind every source read and the final weekly calendar write to one explicitly human-approved exact plan, including recurrence and stale-source refusal.
7. Design a reviewed reversible migration with full-schema, CI, staging and production smoke tests.

Do not merge or deploy these candidate SQL functions to main or production. They are tests/proofs only.
