# Controlled first outreach — PR #386

## Mandate and scope
Andre approved continuing the single-message first-send flow after explaining that unknown older history must not permanently exclude a lead. The workflow retains unknown/gap as evidence and requires a separate per-message decision accepting that gap. This is development authorization, not live mail, schema application, policy installation, host activation, autonomy, newsletter subscription or production release authorization.

## Architecture
Use a separate initial-send policy, queue and event lineage referencing sales_draft_revisions. Never insert initial drafts into reply tables or change the editorial-only snapshot. Reuse the receipt-first worker and fixed Strato transport via a version-2 initial envelope with no fabricated reply source or reply headers. Existing version-1 replies remain unchanged.

One operator-installed, default-disabled policy binds owner/project/mailbox/worker, normalized recipient, contact, offer, verified entity/branch key, history-gap permission, version and expiry. No model policy writer. No policy seeded by migration. Server and local initial-send flags default off.

## Authority
The owner confirmation pins current approved revision/hash, current contact/offer, fresh history/rule IDs, mailbox generation, policy version and explicit history-gap acknowledgement. It accepts no body/address override. Exact replay returns the same job; an altered replay conflicts. A new key or new draft cannot duplicate an active/accepted/uncertain recipient or verified entity. Cancelled/pre-dispatch-failed authority is not a permanent contact exclusion; an exact used revision cannot send twice.

All three source channels must be present, checked within the current rule (at most 900 seconds), unchanged and not failed. Unknown older/retention history is allowed only under explicit policy plus owner acceptance. Any observed contact event, incoming reply, suppression, exclusion, contact/offer mismatch, failed/stale/changed/missing source, pause/revocation or competing send refuses. Never manufacture an absence attestation. No automatic reminder or campaign loop.

Confirm and dispatch acquire the existing project eligibility advisory lock before source/job locks, re-read authority, and pin the same history/rule/contact/mailbox/policy. New history, incoming mail or policy/offer/contact changes fence unsent authority. All lock ordering and concurrent negative cases must be tested in real disposable PostgreSQL.

## Transport and output
Immutable v2 snapshot binds contact/history/rule/policy/source identity plus approved envelope. No sourceMessageId, In-Reply-To or References for initial mail. Durable dispatch intent precedes SMTP MAIL/RCPT/DATA; at most one DATA. Lost receipt or crash after intent is delivery_unknown and never automatically retries. SMTP acceptance is not delivery. Stop before dispatch is enforced; no recall promised afterwards.

UI shows the exact approved envelope already on the card, current history and gaps, separate acknowledgement and a separate send action only when the feature is enabled. Absent migration/disabled policy yields readable unavailable state. GET never creates authority. Private content stays out of analytics and generic logs. Atlas has no send/approve/policy tool.

## Alternatives
Reusing the reply FK or fabricating reply sources is rejected. Relaxing ordinary history globally is rejected. Separate initial authority with one explicit gap decision preserves evidence and existing reply isolation; this follows the owner's requested direction.

## Verification and rollout
Synthetic transport/API/browser plus real SQL authorization, duplicate and race tests; full affected Sales and worker suites and typecheck. One independent whole-increment review, one important-finding fix pass. Additive canonical migration only, strict build guard and frozen histories unchanged. Prepare source hashes/impact/rollback and leave migration unapplied until a concrete owner release decision. No paid service or model invocation needed. Disable new feature/policy to stop future dispatch; uncertain jobs cannot be reset to retry.
