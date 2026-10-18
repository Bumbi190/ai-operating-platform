# The Prompt review packet: independent review and fix evidence

One fresh read-only review inspected scoped implementation `3dd6942..f3f3a9f` against the complete approved spec/plan. It returned **changes requested: no Critical findings, three Important findings**. The executor then made one fix pass. No independent second review of those fixes is claimed.

| Finding | Fix | Actual regression proof |
| --- | --- | --- |
| Buffered bytes and reopened input pathname could differ | ffprobe and full ffmpeg decode now inspect a private temporary snapshot written from the exact verified buffer subsequently admitted; cleanup runs in finally | `replacement_of_original_path_cannot_certify_unmeasured_bytes` substitutes the original pathname after buffering, and refuses the unmeasured invalid bytes |
| Transaction-start now() could remain fresh after a lock wait crossed 48 hours | Requirements capture one clock_timestamp() after acquiring input locks and use it for source age/future boundaries and review timestamps | `wall_clock_expiry_after_project_lock_wait_refuses_prepare` and `..._approve` use independent sessions and verify zero new decisions / no preparation after expiration |
| Approval did not retain locks on mutable source/media/account evidence | Shared ordered input-lock helper runs inside prepare and approval before authoritative revalidation | Independent sessions verify source, asset and existing binding mutations time out while the approving transaction holds its locks |

The new failure cases were executed before implementation: **6 failed / 5 passed** across admission and race suites. After fixes: **11/11 PASS**, no skips. Full post-fix scoped/typecheck/cold-schema results are recorded in [validation](the-prompt-news-review-validation.md).

## Existing protection verified, privileges preserved

The absent-binding case already passed before the fix: `social_account_bindings.project_id` references `projects(id)`, so the existing projects FOR UPDATE lock serializes binding insertion through FK KEY SHARE. `approval_holds_absent_binding_mutation_until_transaction_end` proves this using two real connections. No global binding mutex or unrelated-project authority change was added.

The lifecycle relation grants service_role SELECT only. A trial extra lifecycle row lock correctly hit that real ACL; rather than expanding privileges, the final helper relies on the existing `project_lifecycle_change` protocol, which already locks projects FOR UPDATE before changing lifecycle. Platform stop and current plan rows are locked using existing grants.

## Review exclusions and executor rulings

- Production installation, advisors, preview and authenticated browser behavior remain unverified until separately authorized/applied. Local results are not production parity.
- Final regression reporting, PR and Notion are handoff work completed separately; they do not substitute for runtime evidence.
- Unrelated already-main Atlas, sales and Family scheduling work was outside the feature review. The branch synchronization preserved its UI imports.
- Future video transports, release authority, DST scheduling, trial activation and metric collection remain explicitly deferred.
- Usage/QA documents record attributable owner review; this change provides no legal or perceptual authenticity guarantee.
- Generic asset ownership/storage policy redesign remains outside scope, except the narrow reserved-producer guard required here.
- Storage and SQL have no distributed transaction. Exact downloaded bytes are rechecked; external objects are not frozen by SQL row locks.
- The reviewer did not execute tests or inspect the base64 fixture's contents. The executor's real ffprobe/decode and SQL results are reported separately.
- The global Database type bridge stays generated from its canonical target; the unapplied feature uses scoped RPC types.
- The independent verdict applies to the reviewed commit. Later fixes have the executor's regression evidence, without an independent re-review claim.
