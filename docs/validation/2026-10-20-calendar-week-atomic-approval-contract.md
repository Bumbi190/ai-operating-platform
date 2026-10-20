# Omnira calendar: atomic weekly approval contract (design gate)

**Status:** specification only. No approval endpoint, DB RPC, or migration is enabled.

## Verified current state

- `calendar_event_apply` provides per-event idempotency using `(owner_user_id,idempotency_key)` and checks event versions for updates.
- It does **not** check scheduled-event interval overlap and does **not** batch multiple events atomically.
- `readCalendarWeek` assembles personal events, social schedules, workflows, and manager tasks from separate reads. A previously displayed read is NOT an authorization or an atomic schedule snapshot.
- The preview and preflight functions (#413–417) are read-only, and cannot grant booking authority.

## Required write boundary

1. A separately authenticated, same-origin, rate-limited user action approves an **exact, canonical proposal**: owner, week, project/task ID, title, proposed UTC start/end, and request idempotency key. No implicit Atlas approval.
2. Server rechecks actor/project membership, task state, all-source availability and truncation, and the exact approved proposal. Unknown, stale, completed or foreign tasks fail closed. Report conflicts without modifying data.
3. A single owner-scoped transaction serializes batch approvals against every other write capable of changing this owner's calendar events. The existing single-event writer **must participate in the same serialization scheme**; locking only batch approvals is insufficient.
4. Read all existing scheduled owner events under the lock; compare intervals, including multi-day/all-day meetings, repeating occurrences, same-batch intervals, and explicitly defined point-event buffers. DB checks must not rely on stale browser data.
5. Social/workflow reads currently live outside that transactional boundary. Before shipping, establish a defensible snapshot/version or synchronization contract for each source, or refuse to treat them as hard-conflict-protected. Do not claim full no-overlap guarantees merely because one app query succeeded.
6. Validate Europe/Stockholm local time, ambiguous/skipped DST minutes and week membership. Keep storage UTC.
7. Insert **all** approved blocks and one immutable receipt, or **none**. Replays of the same canonical payload return the original receipt; reuse of its key with different payload fails.
8. Fail closed on DB errors, missing source data, access changes or race. No external side-effect, social publication, trading execution or agent delegation is authorized by approving a calendar plan.

## Mandatory tests before deployment

- Parallel approvals by one owner; concurrent ordinary `calendar_event_apply`; stale private meeting created between preview and approval.
- Same-key retry, same-key different payload, two different keys for same plan, injected failure on later insert (rollback all), ownership change and task completion.
- Crossing midnight, all-day and recurring events, DST gap and fold, a project-source outage, source truncation, and month/year boundaries.
- Real SQL/RLS tests with authenticated and foreign roles, transaction isolation, no partial receipt, and smoke test after migration.

## Release separation

No production migration or enabled booking button until this contract is implemented and tested. Parent UI/preview PRs remain read-only.
