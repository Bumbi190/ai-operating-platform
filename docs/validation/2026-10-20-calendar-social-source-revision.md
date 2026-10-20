# Calendar social scheduling: first source-revision integration prototype

Status: **isolated SQL and real PostgreSQL tests only**, not deployed or an enabled weekly approval.

## Source-derived behavior

The original public.social_schedule_monthly_rule_save(p_principal,p_input) is defined in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. It validates the exact monthly rule (day 1, 20:30, Europe/Stockholm, Facebook and Instagram, enabled boolean), locks a projects row FOR UPDATE, saves social_monthly_release_rules and appends a social_schedule_events audit entry.

The existing scheduling store in apps/web/lib/social-launch/scheduling/store.ts uses the admin database connection with a server-supplied principal. The SQL social_launch_assert_owner checks both the project owner and the principal's allowedProjectIds. Caller identity must be verified by the trusted server layer; neither JSON principal alone nor a checksum is proof of real-user authorization.

## Isolated revision-first candidate

The original monthly function body is preserved in apps/web/lib/calendar/social-monthly-rule-revision-candidate.sql with three additions.

1. A service-role-only SECURITY DEFINER helper checks owner/project scope and locks the existing owner/project source revision row FOR UPDATE. No missing revision is treated as an acceptable version.
2. The revision lock is acquired **before** the original project row FOR UPDATE, avoiding the obvious project/revision lock-order inversion with the isolated calendar batch.
3. A second restricted helper increments the revision after the monthly rule and audit row are saved, in the same transaction. A failed transaction rolls back the entire write and revision.

The monthly function remains SECURITY INVOKER with service_role-only EXECUTE. Its fixture permissions are limited to the local test database, not a migration.

## Real PostgreSQL verification

- Service-only execution; authenticated clients cannot invoke the monthly RPC or the definer helper.
- Missing source revision fails closed without writing a monthly rule or evidence.
- Valid monthly rule plus event plus incrementing source version commit together.
- A foreign/out-of-scope principal and an invalid monthly rule are refused.
- Another owner's project revision remains unchanged.
- An injected late failure rolls back the monthly rule, its evidence and the version.
- Controlled two-session race: batch commits first, social writer waits for its revision lock, then succeeds.
- Reverse race: monthly social rule commits first, and a weekly batch with the stale expected source revision fails with STALE_SOURCE, adding no extra calendar event.

Result: 8 of 8 targeted tests green, using isolated PostgreSQL and no real social accounts, platform workers, provider APIs or production changes.

## Remaining blockers

1. The full SQL functions social_schedule_propose, social_schedule_approve and social_schedule_revoke must follow the same revision-first contract, including no-op/idempotent replay semantics. This prototype covers monthly_rule_save only.
2. Examine social_schedule_claim, social_schedule_step, social_schedule_recover_checkpoint, content changes, reconciliation, cron, and direct table updates for calendar-visible mutations. Final SQL definitions after all migration overlays are authoritative.
3. Verify lock order among source revision, projects, schedule jobs, publications and calendar events. A revision-bump trigger that executes after a project/job lock could reintroduce deadlocks.
4. Review the complete SECURITY DEFINER / service-role / RLS boundary; in particular, privileged callers can forge the principal unless server authentication controls their invocations.
5. Ensure atomic source reads, recurrence expansion, exact-plan human approval, and revised-source validation remain bound to the final calendar commit.
6. Full-schema migration tests, revision-row bootstrap and recovery, operational monitoring, and rollback/forward migration strategies are still required.

Do not merge or deploy this candidate to production. Next: approve/revoke/propose SQL test candidates and cross-source races.
