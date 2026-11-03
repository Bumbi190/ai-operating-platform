# Owner-approved initial-send schema applied — 3 November 2026

The owner explicitly approved the exact schema proposal after reviewing the development result. The normal Supabase migration API applied `sales_initial_sending` once, ledger version **20261103082558**, using local 5-second lock and 60-second statement limits. Approved source SHA256 remains `9fc16dd5406ed097cd6bbcb2740c9a6eb235202a3aa5cb9433d45a436f32658c`; the canonical migration is unchanged. Session limits precede those exact bytes in the runner payload.

Post-apply live verification: all **15 function bodies** match the source; invoker/empty search path and service-only EXECUTE; all three tables have RLS, zero client policies/grants; events sequence is client-revoked; immutable-authority trigger and recipient/entity duplicate indexes are present. The ledger-stored runner payload MD5 also matches the exact session-limit prefix plus approved source. After the catalog reconciliation, 272 schema/security/migration-inventory tests pass (exit0); no runtime source or migration SQL was edited. The table registry now records the three scoped live observations as SERVER_ONLY rather than created_not_live; other classifications are unchanged.

All **25 existing Sales business-table fingerprints are byte-equivalent before/after**. New policies/jobs/events are **0/0/0**, enabled policies0. A read-only Carstore preview returns `canConfirm=false`, no policy and no job. Security advisor WARN findings are unchanged; only three expected INFO no-policy notices were added for these deliberately server-only tables. Exact evidence: [schema receipt](2026-11-03-sales-initial-schema-receipt.json).

Production ledger grows194→195; source counts172/158 and frozen14/30 sets are unchanged. The development head's14 GitHub Actions had passed before application. Preview after registry reconciliation is recorded in the PR/Notion handoff. No initial flag/policy installation, host/package activation, new model call, customer email, main merge or production application release is included in this schema-only execution. The prior pending-schema description below is historical and superseded by this approved application.

---

# Controlled initial outreach — verified development, pending schema decision

## Result and scope

Continues the owned Draft PR #386 from `469bec982887fe35fca955536c690dcc871e8982`. Adds a separate default-off first-outreach policy, queue/events, exact-version owner confirmation, worker API, version-2 envelope and separate worker journals. No reply source is fabricated. No model policy/approval/send tool is added. Unknown older/external history stays unknown; a per-message decision may accept that disclosed gap only under an explicit operator policy. All current contact, event, source, rule, approval, mailbox, worker and pause gates remain.

The duplicate boundary covers both normalized recipient and operator-verified entity/branch within a project. A used revision always returns its original job; queued, dispatched, accepted and uncertain lineages prevent another first send. Cancelled/proven pre-send failures may proceed only with a separately reviewed new revision. Lost SMTP acceptance or receipt/restart never automatically repeats DATA. Central timing reads both send queues. SMTP acceptance is not inbox delivery.

This increment does not apply production SQL, seed/activate any policy, change deployed/local flags, select a new installed package, start a host, send customer mail, merge main or release production. Autonomous recruitment, campaign goal/limits, pilot-count definition, follow-up execution and separately opted-in newsletters remain later work. Existing promised 6/12-month offers must remain attached to their recipients if a future campaign changes to two months.

## Verification

All commands ran in the same owned Windows continuation. Evidence directory: `C:\Users\Andre\Projects\Omnira\Temp\harvey-resume-20261101`.

| Check | Result / evidence |
| --- | --- |
| Affected Sales + schema security + migration guard | 822 passed across 59 files; 9 environment-gated integrations skipped here (`initial-web-final`, exit 0) |
| Full Python worker suite | 192 passed (`initial-worker-full`, exit 0); local Linux suite also passed |
| Browser desktop/mobile | 42 passed after the review correction (`initial-browser-final`, exit 0) |
| TypeScript | `tsc --noEmit`, exit 0 (`initial-tsc-reviewed`) |
| Whitespace | `git diff --check`, exit 0 (`initial-whitespace`) |
| Real disposable PostgreSQL and source races | Positive/negative initial authority, three-channel freshness, changed history/contact/policy, foreign owner, text approval, immutable envelope, separate queue and new-revision duplicate tests pass |
| Real concurrency | Eight parallel confirmation keys yield one job; ten parallel dispatch requests yield one permit/nine fences; committed incoming mail and cancel operations block stale permits |
| SQL → actual Next worker API → fresh Python | Nine suites passed again after the review fix, including 13 initial-transport modes and post-acceptance credential rotation (`initial-full-reviewed`, exit 0). SMTP/IMAP/socket are synthetic and refuse real networking |

The SQL fixtures verify that pending/uncertain first sends remain visible to central timing; accepted/uncertain/queued lineages cannot be bypassed with a new draft, and safe cancelled/failed-before-send outcomes do not permanently exclude a lead. A second address for the same entity cannot bypass its unique lineage index. Tests do not establish real-world source completeness or branch identity.

RED evidence: missing initial SQL/API/worker API functions/modules; initial envelope refused before transport implementation; missing initial host cycle; absent separate browser send section; central timing failed to see the new queue; review regression allowed consent against a different displayed history. Each implementation followed its observed failure. Stale guard-count fixture failures were corrected by updating synthetic future counts/historical exclusions only; captured ledgers, frozen 14 grandfathered/30 legacy histories and guard algorithm remain unchanged.

## Independent review and one fix pass

One fresh-context, read-only review found zero Critical, one Important and one Minor issue. Important: independently polled history H2 could be accepted while the workspace still displayed H1 or no matching evidence. The browser regression now changes substantive gap details, proves acknowledgement stays disabled against stale displayed evidence, then verifies matching refreshed evidence is visible before consent/send. The send component validates rendered history/rule/contact-version identity and displays that evidence next to the decision. The regression failed before correction and all 42 browser cases pass after it.

Minor: `rotateAccepted` existed in assertions but was missing from the new integration loop. Added to the final expanded run. No second independent review of fixes is claimed.

Declined-to-judge rulings: live schema/config/activation are outside this development mandate; real provider/inbox delivery needs a later live acceptance; evidence completeness/entity provenance requires trusted source/operator verification; the reviewer inspected source/tests and did not independently rerun the root's remote results. These limits are retained, not treated as passing release evidence.

## Exact schema proposal

Canonical file: `apps/web/supabase/migrations/20261103074241_sales_initial_sending.sql`.

SHA-256 of exact UTF-8 LF bytes (38,743 bytes): `9fc16dd5406ed097cd6bbcb2740c9a6eb235202a3aa5cb9433d45a436f32658c`.

Impact: creates `sales_initial_send_policies`, `sales_initial_send_jobs`, `sales_initial_send_events`, their indexes/constraints, immutable-authority trigger, service-only invoker RPCs with empty search path, and replaces central `sales_timing_evaluate` so both queues participate. RLS enabled, zero client policies/grants; service role is the server writer. The events sequence is revoked from clients. No data seed, backfill, customer send, scheduler, network call, vendor provisioning or model invocation. With an empty initial queue the additional central checks have no initial-send outcome to report.

Repository inventory is now 172 canonical / 158 enforced. The three new tables are only `created_not_live` / SERVER_ONLY, not falsely claimed in the live-catalog table map. The production guard must refuse a ledger without exactly one `sales_initial_sending`; no exception or override is introduced. A passing synthetic post-apply fixture is not a production apply.

A later explicit schema approval should authorize only these exact bytes through the normal Supabase migration runner, in one transaction, with proposed local 5-second lock/60-second statement limits. DDL may wait on schema/function locks; timeout rolls back and is investigated rather than blindly retried. Check resulting functions/RLS/ACLs/indexes and unchanged business rows after commit. No active policy, flag, worker or email is included in that schema-only decision.

## Rollback and stop

Before commit: transactional rollback. After commit: retain compatible schema, immutable decisions and receipts. Keep `ATLAS_SALES_INITIAL_SEND_ENABLED` absent/false and local `initialSendEnabled` false/absent; disable any subsequently approved initial policy to fence new permits. Reverting application code is compatible with an empty dormant initial queue. Already issued dispatch intent cannot be recalled; uncertain jobs must never be reset or deleted for retry. Do not drop tables/history or rewrite migration ledger. A needed SQL correction uses a new reviewed migration.

## Read-only live post-check

Observed during this development: migration absent and initial queue table absent; 167 contacts; one old reply-send job/four old send events; one initial preparation job, three draft revisions with one current, one model attempt and 89 history revisions. Carstore's current revision `0870e31d-aaf8-4d53-8716-02a3cfb0133d`, hash `f87d42d24f4254deeecc66826184cd583e1b54acbbd3effce0b52cf79cbe9f9f`, remains text-approved. No business write was performed by this increment. The morning audit is not a fresh source check at send time; all three channels must be refreshed before any later permit.

## Final expanded integration and remote release evidence

Final expanded disposable database run passed: 9/9 SQL/API/Python suites, including all13 initial-transport recovery/fence modes, exit0 (`initial-full-reviewed`). Fixture database cleanup completed. Remote push/check/deployment receipts are recorded in the linked PR/Notion handoff after this source commit. Previous READY Preview/head and old CI results do not qualify the new head. The new exact-head build remains subject to the real unapplied-migration guard.
