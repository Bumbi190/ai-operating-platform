# Handlarbörsen Atlas P1 – focused consolidation review (2026-10-27)

## Scope
This is a review-only port of PR #317 onto `main` at `d2368b2a1053f7c1c742d6e0ce7e311eba6895c4`.
Historical source commit: `bc3cc285f5e553f31d31c6c3e6115d176a401dbe`.

Only the deterministic **paper-only** workflow-preview feature is carried forward.
No workflow instance is created. No execution, approval, publishing, scheduling, third-party API, model call, database migration, RLS update or production configuration is added.

The previous UI alternatives #316/#319 are not reintroduced. PR #318's combined stack remains unmerged.

## Conflict resolution
Cherry-picking #317 produced one conflict in
`apps/web/components/platform/vnext/HandlarborsenOverview.tsx`.
The resolution preserves the current main structure: candidate-review notices, executive summary,
marketplace traffic, saved analysis review links and the expandable deep-dive section.

`HandlarborsenWorkflowDrafts` is rendered inside the existing deep-dive immediately
after current Atlas evidence when the report model is normal.
When the report is unavailable, the bounded blocked-only draft notices appear after
the status notice and existing analysis history link. Both paths reuse the already
authorized MarketplaceReport and explicit evaluation clock.

## Verification and release hold
- Initial isolated Git cherry-pick produced exactly one conflict; resolved with current-main structure.
- `git ls-files -u`: no unresolved conflicts after staging.
- `git diff --cached --check`: clean at preparation time.
- Imported tests and original PR documentation describe **historical** 2026-10-12
  results; those results **do not certify this new main-based integration**.
- A new main-based exact-HEAD CI run, TypeScript check, targeted
  `handlarborsen-overview` and `handlarborsen-workflow-drafts` tests,
  project authorization and security checks are required before merge.
- Verify the preview visually in an authorized test session.
- **No merge, deployment to production, production data write or scheduling/publication activation** authorized by this branch.

## Closure dependency
Track this review in issue #565.
Keep #316, #317 and #318 and their branches until this replacement is reviewed,
tested and explicitly approved for main; close them later with replacement SHA/PR
links and no branch deletions.
Memory tooling PRs are out of scope and being handled in another conversation.
