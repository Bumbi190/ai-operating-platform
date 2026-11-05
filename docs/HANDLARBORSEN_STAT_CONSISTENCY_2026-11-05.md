# Handlarbörsen: consistent classified statistics

Work ID: HB-STAT-CONSISTENCY-20261105.
Scope: the owner marketplace report and registration journey use the classified v3 population introduced by merged PR #626. Historical snapshots remain historical; no conversion rate is calculated.

## Cause and acceptance

The project overview already read v3, but its registration journey still selected v2 snapshots. The dedicated marketplace page presented test-inclusive v1 totals without a prominent definition warning. A zero delta immediately next to a total could also read as a concatenated number in accessible text.

- Reuse the fixed-host aggregate v3 reader after the existing RLS project resolution and marketplace permission gates.
- Pass the same owner v3 result into the registration journey and its deterministic review brief.
- Explicit missing, invalid, future or stale v3 data never falls back to v1/v2, and never becomes an invented zero.
- Show source scope and exact observation time. Keep traffic and cumulative population separate.
- Preserve the collaborator view, which does not receive v3 credentials or a new provider read.
- Show stored snapshots in a closed historical audit disclosure, with their own definitions and history. Never compare them to v3.
- Preserve all database rows, collectors, historical definitions, credentials and outreach state.

## Preflight and branch reuse

The repository preflight was executed on 2026-11-05 at 12:33 UTC against origin/main e5099d2ff77b38ad5a3d758bb3a0e1352bef495d. It inventoried 123 open PRs and 249 worktrees and returned review_required / matching_local_branch, naming feat/hb-registration-journey-overview-20261104. The original machine receipt is ../hb-stat-consistency-preflight-20261105.json.

Manual scope review found no open PR modifying the marketplace report, registration journey, growth brief or v3 reader. The named registration branch was clean and unlocked. Its PR #616 had merged on 2026-11-04 at 19:47:28 UTC, so there was no open PR to update. The original v3 follow-up PR #626 was also already merged.

Decision: reuse the existing registration branch and worktree; create no new branch. It was reconciled with current main in local merge 32ad69a. Three conflicts were obsolete copies of files already superseded in main; these were resolved to the exact origin/main versions. The reconciled tree had zero diff against origin/main before this task's edits.

A new review PR on this reused branch is a follow-up to merged #616 and #626, not a duplicate of an open PR. No other worktree, branch, security sandbox or production state is modified.

## Validation

Seven initial regression cases failed on the old implementation for the expected incorrect populations / missing historical warning, then passed after the changes. The first focused run passed 16/16 tests across statistics consistency, registration journey and growth brief.

Final focused validation: 93/93 tests across eight suites (statistics consistency, route authorization, registration journey, growth brief, v3 reader, v3 dashboard, marketplace report and overview). Full TypeScript command `tsc --noEmit --incremental false --project apps/web/tsconfig.json` exited 0.

Broader Handlarbörsen regression: 81 files, 1,070 passed / 21 failed out of 1,091 tests. The four failing suites are handlarborsen-daily-collection.test.ts (8), handlarborsen-chat.test.ts (7), handlarborsen-visual-pulse.test.ts (5), and handlarborsen-owner-brief.test.ts (1). All four were independently rerun on the untouched pre-change v3 worktree: the same 21 failures, with 51 passes. Relevant baseline files have zero diff against current main. These existing failures are not fixed or suppressed by this task; the full Handlarbörsen suite is not green.

Local logs: Omnira/Temp/hb-stat-consistency-{focused,regression,baseline,final,tsc}.log. Git whitespace check passed. Separate read-only code review is in progress; no production activation is authorized by this document.
