# Approved managed host + Strato B1 release — 2026-10-17

Owner approved both plans in conversation. Implementation completed inline, with one fresh independent reviewer and one regression fix pass per increment. Review reports record all effect grades, declined judgements and rulings. No Critical findings; all five Important findings fixed. One deferred Minor: already-open host panel lacks periodic refresh; Atlas reads current server state.

Final full suite14925 total,13191 passed,401 failed,1329 pending. Exact401 failed identities match the08b3e0c baseline recheck; no new failure. This is baseline equivalence, not an all-green repository. Scoped sales/security359 passed before final pass; seal/schema/guard117 passed after fix. Real DB/API/Python3/3, Windows Python58/58, Node crypto1/1, typecheck0, desktop/mobile plus browser regressions4/4. Frozen aafa3b9 component replay demonstrated both final UI findings RED; current source GREEN. No further re-review.

Live migration apply:
- sales_managed_host: ledger20261017151718; exact canonical SHA256a258d7fc159632564747c9a49c5b48037c8c75726b26859892301127dfbf832a.
- sales_strato_connection: ledger20261017151722; exact canonical SHA2562e3301eb992694901c15904899c586093632dfb2acf91db2474c8447c6243b1e.
- Three scoped tables observed RLS ON; host events and setups zero policies/client grants, connection owner authenticated SELECT only. Service grants exactly bounded; client mutation false; no service DELETE/TRUNCATE.
- All new RPCs empty search_path and service-only; only cleanup-ready predicate SECURITY DEFINER. Unsafe function count0.
- Unique cron omnira-sales-mailbox-expiry-v1 active, postgres/current database, */5 * * * *, exact command select public.sales_mailbox_expire_setups(); cleanup-ready true; direct real cleanup returned0.
- Security WARN counts20/7/8/1 and performance auth_initplan40 unchanged. New unindexed-FK/unused-index notices are INFO.
- Public tables135; branch registry134 classified rows after scoped addition. Difference is unrelated live handlarborsen_candidate_inbox, observed RLS ON/zero policy/client grants/service reachability, outside this branch migration corpus. Ruling: do not import another workstream's migration/classification or pretend a full registry refresh. Cost if wrong: separate registry reconciliation. Existing capture dates unchanged.
- HB jobs0; no contacts, offers, customer jobs, actual mailbox probes, model calls or emails created by these increments.

Real Windows Credential Manager verified with a disposable own namespace: Unicode byte roundtrip, oversize refusal and exact deletion. No general secret search.

Pending concrete release receipts: exact protected preview, pin-complete installation, disposable real grant/adopt/rotate/revoke, chosen host adoption and owned startup, repeated heartbeat, old temporary host STOP, scheduler execution proof. Production flags remain OFF, PR remains draft and unmerged. Actual mailbox authentication awaits owner entry in the secure form; this does not complete B2 inbox or C sending.

Integration ruling after real build failure: deployment2a985f0 failed closed on unknown already-applied handlarborsen_candidate_inbox_v1. Merged current main ea5f02ac50888e6395af4ae34d6693576e90d6a8 into this branch, preserving its voice/collaborator changes. The exact already-applied SQL was read from ledger20261017151021 and reconciled as canonical20261017151021_handlarborsen_candidate_inbox_v1.sql, SHA256e7f3efe782086aa8f818ab071dab7c96ccadde95ec58320e30048bd487fe663c. Diff from main's independently reviewed proposal is only its first comment. No DDL reapplied and no feature flags changed. Added exact-hash/body-equivalence regression and observed135th table classification; guard133/119 with156 actual ledger names passes, no unknown/duplicate names and frozen14/30 sets unchanged. Supersedes earlier decision to leave that source reconciliation separate because actual release evidence proved it blocks this build. Cost if wrong: rebuild reproduces already-present schema, covered by existing proposal fixture and exact body proof. Main-integrated broad-suite rerun pending.
Actual cron scheduler executed own cleanup at2026-10-17T15:20:00Z, status succeeded, end15:20:00.456Z. No synthetic production setup was inserted.
