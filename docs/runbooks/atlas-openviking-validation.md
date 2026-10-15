# Atlas OpenViking validation — 2026-10-15

Implementation: `7c8a0758a8df766cad64807ad06fd1ede8a2f56f`.
Base: `910376b2eb485f136e1b36073f08e7788f0be2d6`.
Branch: `codex/atlas-openviking-integration-20261015`.
Draft PR: https://github.com/Bumbi190/ai-operating-platform/pull/343

The integration is implemented for review. It is default OFF and has not been activated against a live OpenViking service.

## Verification

- 38 new tests across the OpenViking retrieval, publication and project-recall suites pass.
- 334 tests across ten relevant memory/knowledge/OpenViking suites pass.
- All 40 Dream producer tests pass, including the updated read-only chat boundary. Together these are 374 passing relevant tests across 11 suites.
- `npm run typecheck --workspace=apps/web` passes.
- Targeted ESLint passes using the installed Next core-web-vitals configuration and `--no-eslintrc`. This includes every changed TypeScript file; no lint configuration or dependency was added.
- `git diff --check` passes.

Tests ran in a dedicated Node 22 Docker container. npm dependencies were installed with `npm ci --ignore-scripts`. No production credentials or real model calls were used. Transport tests use actual loopback HTTP servers, and publication tests use temporary Git vaults.

## Whole-suite differential

Command, from the repository root:

    npm test --workspace=apps/web -- --maxWorkers=2 --minWorkers=1

The baseline and final branch were each exported with `git archive` and tested from a Linux filesystem using the same dependency installation. This avoids Windows checkout line endings changing raw-source hash tests. These archive copies do not include Git history or external SQL/artifact setup.

| Result reported by Vitest | Base | Final implementation |
|---|---:|---:|
| Failed files | 54 | 53 |
| Passed files | 406 | 410 |
| Skipped files | 33 | 33 |
| Failed tests | 207 | 204 |
| Passed tests | 12,487 | 12,528 |
| Skipped tests | 1,182 | 1,182 |

The full suite is **not green**. Comparing every reported FAIL entry found zero added failures. The final failure set is a subset of the baseline: the three knowledge-snapshot golden-byte failures are absent. Remaining failures include missing isolated website-build SQL fixtures and existing architecture/artifact/hash/source-scan contracts. SQL suites that require `ATLAS_SQL_TEST_URL` explicitly skip when it is unavailable. This report does not claim those systems passed.

The initial whole-branch run also exposed an old Dream test that required the entire chat graph to contain no memory reader. It was updated to allow exactly the existing M4 read-only bridge and recall module, while continuing to prohibit the Dream producer and memory writer. The corrected test and the final whole-suite comparison both pass their relevant assertions.

## Review findings resolved

A separate read-only review found three material issues. Each was independently reproduced with a failing regression before correction:

1. Returned and thrown M4 RPC errors could print private text. Recall now logs fixed diagnostics; both sentinel cases pass.
2. Git cleanliness alone allowed eligible ignored notes absent from the reported vault commit. Every included source must now match its captured Git blob using checkout filters. The CLI rejects eligible unversioned notes while allowing ineligible ignored notes and legitimate CRLF checkouts.
3. An output inside the vault created directories before refusal. Lexical and nearest-existing-real-ancestor checks now run before directory creation. Direct and symlink containment cases pass.

Additional tests cover nested processing failures in completed task reports, exact destination receipts, bounded waits, revoked/foreign scope, stale identifiers, remote-text rejection and long chat messages retaining independent M4 recall.

## Isolation and activation

This task did not edit the original Omnira checkout; its branch and nine pre-existing pending paths were preserved when checked. Only the feature branch was pushed. No merge or push to main was performed. Main advanced independently after the recorded baseline; those later changes were not incorporated into this branch or its validation. No schema migration, production environment change or private vault import was performed.

Before activation, configure the private OpenViking service and its model providers, obtain the canonical pilot project mapping, prepare and review the approved corpus, synchronize it to completed readiness, and evaluate shadow retrieval. Real embedding relevance, production connectivity and production memory volumes remain unverified.

Operational instructions: [atlas-openviking.md](atlas-openviking.md).
