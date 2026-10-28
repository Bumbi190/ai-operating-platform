# Omnira – repository agent instructions

These instructions apply to Atlas, Codex, Claude, and other coding assistants working in this repository. Always preserve parallel developers' state and the repository's security boundaries.

## Read project context at the start

1. Read the project handoff, relevant architecture/security instructions, and current Git state. If the Notion connection is available, retrieve the user's enabled Notion Skills at session start, especially [Omnira – autonom utvecklingsstandard](https://app.notion.com/p/4017b977c5b881fe85a3c8d0cc3db23c) and [Git/PR-preflight – återanvänd befintligt kodarbete](https://app.notion.com/p/4077b977c5b881a0b2ace8ec4091b245) and the [saved Notion decision](https://app.notion.com/p/4077b977c5b8819bac84e7ad77f8b711).
2. Before creating a new local branch, worktree, or GitHub pull request, **check for a reusable existing PR or branch for the same task**. Inspect open PR titles, descriptions, head/base, scope, PR stacks, local/remote branches, and `git worktree list --porcelain`; do not rely on a title match alone.
3. Run the repository's read-only preflight, supplying a stable work ID, specific task, proposed branch and reason:
   ```bash
   node scripts/atlas/pr-preflight.mjs --repo Bumbi190/ai-operating-platform --project Omnira --work-id ISSUE-565 --task "Atlas Git PR preflight branch reuse policy" --branch codex/example-policy-branch --reason "No safe existing branch or PR for this separate policy change" --receipt ../omnira-pr-preflight-ISSUE-565.json
   ```
   Treat the script's `reuse_existing`, `review_required`, or `blocked_error` as **do not create a new branch**. A `new_branch_approved` receipt is a prerequisite for the normal branch-creation workflow; do not fabricate a receipt or silently skip the check.
4. If an existing PR fits, continue that PR. If scope/ownership is ambiguous, document and review before branching. If no matching PR exists, one purpose-specific branch is allowed with the receipt linked in the new PR description. Never create one new PR per micro-task by default.
5. Never write into an active, dirty or locked worktree belonging to another task or agent, never force-push/reset or delete their branches, and never treat one agent's authorization as permission for another.

## Critical isolation exception

The SDF-1 Code Broker uses **one pinned, locked UUID branch and isolated worktree per work ID** as a security guarantee. Do **not** reuse or disable those sandboxes, modify `prepareIsolatedWorktree` to accept arbitrary branch names, or break approval, lease, no-execution and explicit-cleanup-only protections. Reuse the *project-level task/PR* at the planning/admission boundary when appropriate, not a security-isolated sandbox.

## Honest boundaries

The preflight script is a read-only decision gate, not a Git server hook. It checks PR metadata and local worktree names; it does not prove that two patches are identical or prevent a person from invoking raw Git commands. If GitHub/Notion is unavailable, fail closed for starting an ordinary new branch and report the missing check. Do not claim universal technical enforcement before the real job-admission integration is reviewed and deployed.

Track backlog: https://github.com/Bumbi190/ai-operating-platform/issues/565
