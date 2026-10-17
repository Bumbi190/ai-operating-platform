# Managed sales host verification — 2026-10-17

Current release state and subsequent measured gates are recorded in [2026-10-17-sales-release.md](2026-10-17-sales-release.md). This file preserves evidence at its increment/review checkpoint.


Implementation base: 08b3e0c544fabb5009e501d2527fc9ae10297489. Production release is separate.

Verified before independent review:
- Real disposable PostgreSQL lifecycle, idempotent adoption/rotation, one concurrent rotation winner, stale-generation refusal, owner transfer, revocation and immutable event ACL/triggers.
- Real PostgreSQL → Next handler → Python ManagedConnection private-pipe integration. Three lost rotation receipts recover the same operation; Atlas pause/resume and revoke work. Zero model, SMTP or IMAP calls.
- 322 scoped TypeScript/security/migration tests passed; two database-dependent tests separately passed against real PostgreSQL.
- Windows Python worker suite 40/40, with credential recovery, single-instance locking, manifest checks, interrupted-dispatch refusal and protected-preview transport secrecy.
- TypeScript typecheck passed.
- Playwright desktop 1440px/mobile390px: drafts/reload/editorial approval plus actual pause control and absence of token handoff.
- Windows Task Scheduler in-memory XML roundtrip and foreign action/principal rejection passed. No scheduled task registered yet.
- Full repository test command running; the prior documented baseline is 401 failures. This is not a whole-repository green claim.

Rulings:
- Existing Windows worktree and explicit ledger replace unavailable skill shell helpers; same task/test/commit gates retained. Cost if wrong: bookkeeping correction.
- Added owner-only host status/list helpers for Atlas without exposing credential columns. Cost if wrong: bounded API adjustment.
- Added protected-preview transport based on the already proven owner-authenticated Vercel CLI path; tokens stay in stdin, no redirects or protection weakening. Cost if wrong: preview unavailable, production transport unchanged.
- Crypto-only work for the separately approved Strato increment can proceed while broad host tests run; no mailbox API or real credential collection is activated before host release gates. Cost if wrong: dependent code must be adjusted.
- Revocation now appends an audit event. Task Scheduler default settings are explicit after the real scheduler normalized the original XML; the exact ownership comparison remains strict.
- Before real activation, a disposable owner/project-scoped registration will prove renewal and revocation. The selected permanent registration must remain usable, so it will not be irreversibly revoked as an installation test. Cost if wrong: weaker evidence than revoking the final registration itself.

Pending release gates: fresh independent review and regression fix pass, final suite baseline comparison, exact reviewed migration apply/catalog/advisors, pinned preview deployment, owner grant/adoption/rotation proof, owned startup installation, old23h-host replacement and repeated actual heartbeat. No mail read/send or new paid model qualification calls.
