# Atlas Creative P26 — full current-main reconciliation on a separate Draft branch

Date: 2026-10-21
Branch: `feat/atlas-creative-p26-main-reconciliation`
First parent: Creative P25 `3386be7d09251f8351024ca7352b828f3cab2756`
Second parent: main snapshot `11b7433c259829c64857fa609a738ef8163889b1`

## The concrete remaining P25 deployment blocker

P25 PR #495 corrected **five unapplied creative SQL** migrations being
mistakenly included in the canonical Supabase production migration root.
This made the earlier GitHub Migration Guard and Atlas Project Isolation
checks pass without changing their security policies.

Vercel then revealed the next, independent blocker: the older creative
stack had only 101 canonical production migration files while the live
production ledger already included
`survival_threshold_status_canonical`.

We verified the corresponding original file actually exists in current
`origin/main`:

```text
apps/web/supabase/migrations/20261004090000_survival_threshold_status_canonical.sql
```

But `origin/main` had **151** canonical migrations and Guard v2 expected
151 canonical / 137 enforced. Between P25 and main there were
approximately **524 main-only commits**. Adding that single migration to
a frozen 101/87 stack would be an unsafe partial compatibility patch.

## Change

- Created a **new isolated P26 worktree** from P25. Did not modify main
  or other chats' feature worktrees.
- `git merge-tree --write-tree --name-only P25 origin/main` produced an
  unconflicted virtual merge; an actual `git merge --no-ff --no-edit
  origin/main` then succeeded in P26 with two explicit parents.
- Result contains the **actual current main Guard v2 policy and 151
  canonical production SQL files** (137 enforced), while all five
  creative P7/P10/P13/P15/P18 draft SQL files remain in
  `apps/web/supabase/creative-drafts`, outside migrations.
- Updated **only the P25 isolation test** to verify the reviewed current
  main Guard v2 constants (151/137), rather than hardcoding obsolete
  101/87. The actual Guard v2 policy, registry, SQL migrations, grants,
  P0 protected staging controls and disabled creative routes were NOT
  modified to bypass checks.

This is a LARGE forward compatibility merge with current main, so
conflict-free text merging by itself is NOT proof of correctness.

## Tests and limitations

- P26 creative draft isolation 3/3 passed, verifying 151/137 canonical
  guard integrity and byte-exact quarantine for five unchanged draft SQL
  files.
- **288/288** combined serial creative Node suite passed.
- Full PGlite migration tests and Next.js typecheck/build on the merged
  P26 tree were NOT run locally; Hultgren was memory-constrained, with
  under ~1 GB free RAM. GitHub CI and Vercel must verify real build and
  project-isolation compatibility independently.
- No database changes in Supabase, no worker account enablement, no
  privileged media process, no production deployment and no new paid
  services. `omnira-media-worker` remains disabled.

## CI investigation of parent P25

At P25, Migration Guard Integrity and Atlas Project Isolation both
passed, plus the general Trading, Memory and Atlas workflows. One
SDF-1C Docker integration test timed out at the existing 5-second limit
(361/362 tests passed); it must not be silently skipped or allowed more
time just to make the check green without an independent stability
investigation. The P25 Vercel failure was the old migration-history
mismatch detailed above.

P26 addresses *only* branch history compatibility with current main.
It makes no claim to fix a resource-related SDF-1C timeout.

## Required before any real operation

1. Verify new GitHub CI and Vercel build results. Do not infer approval
   from a mergeable Draft branch; investigate any new failures.
2. Independently review compatibility of P0 worker controls, SDF-1C
   isolation and creative review authorization with the latest main.
3. Run creative PGlite and real PostgreSQL 17 fixtures plus
   production-matching Supabase staging permissions; the P7–P18 SQL
   remains intentionally unapplied.
4. Perform a protected OS/network worker isolation audit, explicit
   human authorization and one synthetic private PhotoCraft job.
5. Keep all creative PRs Draft until separate reviews and approvals.

No future service, worker or production behavior is enabled by P26.
