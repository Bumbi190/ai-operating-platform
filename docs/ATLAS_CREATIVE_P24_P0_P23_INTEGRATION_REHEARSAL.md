# Atlas Creative P24 — P0 + P23 frozen integration rehearsal

Date: 2026-10-21
Integration branch: `feat/atlas-creative-p24-p0-integration`
Base: P23 `bc9087b5ca17e5ac666645886fbfde43481ea383` (Draft PR #493)
Other parent: P0 GitHub PR #450 head
`8f55a7c2210323a5da62026ff8e21534aec8b312`.

## Why this branch exists

P5 was originally branched from an earlier P0 revision. After P0
continued gaining Windows media-worker staging and reviewer safeguards,
the checked-out current P0 head was NOT an ancestor of P5, while PR #457
(P5) was reported nonmergeable against P0 by GitHub.

Rather than overwriting or rebasing the concurrently active P0 worktree,
this branch freezes GitHub P0 at its reviewed SHA and creates a completely
separate local integration rehearsal based on P23. This is NOT a merge
to `main` and does not resolve any active PR for production.

```text
P0 GitHub 8f55a7c --                   >-- isolated P24 integration candidate (Draft)
P5 ... P23 bc9087b/
```

## Actual conflict and chosen policy

`git merge-tree --write-tree --name-only` showed **one merge-conflicted
path**:

`scripts/creative-tools/worker-stage-binaries.ps1`

The legacy P5 chain had an initial tri-state `targetExists` /
`targetVisibility` access-denial guard. Newer P0 replaces the same
lines with `Inspect-Target` and a stricter `targetInspection` flow.
More importantly, P0 adds trust checks before reading a privileged
source, including:

- Require elevated Apply to execute only from the protected control tree.
- Require protected ACL owner and ACL inheritance/ACE verification.
- Require pinned release imports to be verified in the elevated session.
- Revalidate worker account remains DISABLED and safe target visibility.
- Refuse writable worktree-to-elevated-trust paths.

**Resolution:** preserve the entire newer P0 version of
`worker-stage-binaries.ps1` at the frozen SHA. Do not reintroduce
legacy P5 staging guards or weaken the P0 trust boundary.

A new `p24-integration-guard.test.mjs` checks the presence and ordering
of the protected elevated trust guard, reviewer/audit modules, canonical
UUID approval proof, and that execution/production routes remain OFF.

## Validated locally on Hultgren

- **285/285** creative Node tests passed in one serial combined run
  (`node --experimental-strip-types --test --test-concurrency=1
  scripts/creative-tools/*.test.mjs`).
- **48/48** synthetic, read-only Windows ACL/archive/approval-ledger
  scenarios passed in three PowerShell test scripts (14 + 17 + 17).
- Integrator-specific 4/4 checks are included in the 285.
- One conflicting Windows staging file was resolved; no other unmerged
  files or Git whitespace errors remained.
- `omnira-media-worker` remains DISABLED. No worker was enrolled
  or activated, no PhotoCraft/FilmCraft executable was launched,
  and no Supabase migration was applied.

### Deferred / not claimed

- Full PGlite DB tests were not rerun on the combined merge because the
  workstation had only ~470–535 MB free RAM during integration.
  Previous P23 tests passed, but are NOT evidence for the P24 merged tree.
- P0's optional PostgreSQL authority sub-suite, if present on the other
  chat's still-moving LOCAL branch, is not included in the frozen GitHub
  P0 snapshot used here. The integration uses only commit `8f55a7c`.
- Full Next.js install/typecheck/build and production-like Supabase
  schema/permission verification remain pending.
- These are syntax/unit/fixture checks, NOT proof of real Windows OS/network
  isolation, actual human operator approval or safe media execution.

## Next review gates

1. Coordinate with the P0 owner. If PR #450 advances, recreate the
   integration comparison against the new head. Do NOT force-push, rebase,
   merge or edit the other worktree.
2. Review P0/P5 staging compatibility and the full P0 protected elevated
   source chain independently.
3. Run all PGlite, PostgreSQL 17, PowerShell, CI and Next builds on a
   resource-appropriate integration machine after P0 stabilizes.
4. Check canonical approval registry ownership and operator decision
   authorizations against actual authenticated Supabase project scope.
5. Keep all merged functionality unactivated; separately approve worker
   enrollment, OS isolation and a synthetic private PhotoCraft run.

This merge rehearsal is **Draft only**, not a recommendation to merge the
P24 branch to `main` or to make external network or media changes.
