# Windows Worktree Configuration Compatibility — approved addendum

Status: APPROVED by André 2026-10-19 08:04 Europe/Stockholm; execution authorized by “Bästa jag godkänner :)”. Written 2026-10-19. Extends docs/superpowers/plans/2026-10-18-windows-workspace-sandbox.md only where its blanket worktreeConfig refusal blocks the actual registered repository. Preserve the selected Native method and its single fresh whole-range review after all required proofs pass.

## Observed blocker

The real fixed-profile request c435e423-d964-428b-b5c0-4060d89ce3c6 returned refused/unsafe_git_config, workspaceRetained=false. The common config has extensions.worktreeConfig=true. Main .git/config.worktree is currently absent. Target, branch and registration were independently confirmed absent. No real proof worktree exists. The refusal is intentional under the approved policy, not evidence of a successful prepare.

## Proposed bounded change

Support the Windows repository's per-worktree configuration by auditing and retaining each applicable configuration file, rather than changing the repository's shared settings. Existing POSIX policy and all other unsafe config refusals stay unchanged.

1. Write failing native fixtures with the extension enabled: harmless/absent main config.worktree must prepare; unsafe hooks, includes, filters, credentials, fsmonitor, changed core.worktree/bare and conflicting remotes must refuse before add. Prove both shared and per-worktree configs independently; include postflight drift and retained uncertainty tests. Keep actual sentinel helpers untouched.
2. Extend the internal closed Git grammar only with a read of the fixed main config.worktree and the derived new registration's config.worktree. No caller path or raw argv. Lease each existing file through all uses, audit with includes disabled, and recheck bytes/identity. Hold and validate the parent directories; explicitly account for absent-file evidence. Reject newly appearing, disappearing, redirected or contradictory config. No includes or arbitrary effective-config import.
3. Allow the extension flag in the Windows-specific preparation policy only when this complete per-worktree audit is active. Default/common audit and existing POSIX parity vectors continue to refuse it. No public allow-unsafe flag. Before any new-worktree status/head command, validate its reciprocal registration/config and ensure it cannot redirect the worktree or introduce unsafe helpers. Keep the fixed neutral environment, tool pins, hooks/fsmonitor overrides and finite command grammar.
4. Reconcile the saved refused request again: confirm same base pin and no target/branch/registration. Reuse the SAME saved workId/request, never silently replace the pin or allocate a second proof ID. Invoke once only after the new policy and synthetic gates are verified. Record actual before/after status/ref/config, retain and lock the successfully created proof. Any uncertainty stays retained and blocks completion.
5. Run the full original 12-file required gate and both typechecks. Run one fresh gpt-6-astra high whole-range review from original BASE9192559 through the final source HEAD, including this addendum and all rulings. One material RED→GREEN fix pass; no second reviewer. Finish report, Notion and only then owned scratch cleanup.

## Constraints and acceptance

No edit to shared Git config, other worktrees, tool pins, ACLs, Docker context or installed dependencies. No live code jobs, models, routes, enrollment, UI, push, merge or deployment. No further image pull. Required real proof may not pass by skip, cached refusal or substituted synthetic fixture. If the installed Git behavior cannot meet the retained-config and no-helper guarantees, stop with a concrete finding; do not bypass the audit.

## Approval boundary

This changes an explicit security refusal in the previously approved plan. Its Global Constraints require rejection of ambiguous Git identity, and its implementation rejects extensions.worktreeConfig=true. The executing-plans skill says a security-sensitive action is a stop. Approval is now recorded above; no further confirmation is needed for the extension or remaining original plan steps.

Primary references checked: https://git-scm.com/docs/git-worktree and https://git-scm.com/docs/git-config (per-worktree config is read after common config when enabled). Documentation alone is not sufficient proof; native fixtures above must establish installed-tool behavior.