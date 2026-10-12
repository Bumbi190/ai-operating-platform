# Handlarbörsen Atlas P1: paper workflow drafts

This local slice derives at most three unsaved manual proposals from the authorized
MarketplaceReport and deterministic P0 insights: review company status, check bid
activity, and review data quality. It makes no queries, writes, model calls or
provider calls. It creates no workflow instance, run, approval, schedule or job.
The closed paper kinds are not executable workflow action kinds or permissions.
LinkedIn is not connected by this slice; no publishing or results are claimed.

Draft identity binds project ID, paper rule version and the exact P0 insight ID.
Ordering is quality, company status, bid activity; duplicate kinds are removed.
No persistence, supersession or durable deduplication is claimed. The UI receives
the same authorized report and explicit evaluation time as the evidence section.
It shows aggregate facts, snapshot references, P0 provenance and manual steps via
native keyboard-accessible disclosure, with no execution or approval controls.

Statuses are only `preview_only` and `blocked`; both are non-executable. Stale,
invalid, failed or unknown source/audit cannot yield an unblocked business draft.
Unknown required metrics suppress the affected proposal and remain null in quality
evidence. A single snapshot or calendar gap cannot support a trend. Registered
minus verified is not awaiting verification: the population may include closed
companies. Zero new bids does not establish lack of demand or any traffic cause.
The bid checklist asks for verified comparable windows and known published supply.
Quality review remains blocked until the underlying limitations are resolved.

Before future persistence: separately authorize and review the storage contract,
migration/RLS, project isolation, retention, durable evidence identity and fake-store
dedup/supersession replay. Before any approval/execution slice: bind exact content,
evidence, rule version, project/account, expiry, schedule and budget; test edits,
revocation, stop, races and unknown outcomes with fake adapters. Verify official
provider onboarding and granted scopes separately. This implementation authorizes
none of those steps and does not change the action registry or Atlas mode.

Validation is local/offline: focused Vitest (including authorized overview route
isolation), TypeScript and targeted lint. Run outcomes are reported by the task;
these checks are not deployment or production evidence.

Local results (2026-10-12): **PASS**, 4 Vitest files / 90 tests (drafts,
insights, overview including route isolation, marketplace report); **PASS**,
`tsc --noEmit --incremental false`; **PASS**, targeted ESLint with
`next/core-web-vitals`, 0 errors / 0 warnings. The default Vitest config loader
was blocked by parent-directory access and its default cache write was denied;
the installed programmatic runner passed with equivalent aliases and cache
disabled. Next lint requested configuration; the installed ESLint API passed
using an in-memory override without writing configuration. Git status was
blocked by ownership checks; no safe-directory settings were changed.
