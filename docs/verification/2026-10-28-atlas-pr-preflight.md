# Omnira – rule to reuse an existing PR before creating a Git branch (2026-10-28)

Owner decision: before a new code project, development branch, isolated ordinary worktree, or GitHub PR, Atlas and coding agents must determine whether the task already has a relevant active PR/branch. Continue the existing safe PR when appropriate; avoid one PR per micro-task.

## Durable policy sources
- [Enabled Notion rule](https://app.notion.com/p/4077b977c5b881a0b2ace8ec4091b245) and [existing development standard](https://app.notion.com/p/4017b977c5b881fe85a3c8d0cc3db23c).
- [Notion Memory – Git/PR preflight](https://app.notion.com/p/4077b977c5b8819bac84e7ad77f8b711).
- Repository-root `AGENTS.md` and `CLAUDE.md` teach new agent sessions the same rule.
- [GitHub #565](https://github.com/Bumbi190/ai-operating-platform/issues/565) tracks ongoing PR hygiene.

## Technical helper and outputs
The read-only script `scripts/atlas/pr-preflight.mjs` inspects origin GitHub identity,
checks that the local `origin/main` matches GitHub, lists up to 500 open PRs,
observes local worktree branch names/locks and compares task-specific terms
and stable Work-ID fields (not merely project names).

It returns a machine-readable receipt:
- `reuse_existing` — explicit chosen open PR, no new branch (exit 2)
- `review_required` — relevant PR/worktree overlap or insufficient documented reason, no new branch (exit 2)
- `new_branch_approved` — no candidate, specific reason provided, proceed to normal approved isolated branch workflow (exit 0)
- `blocked_error` — GitHub/remote/missing data/error, stop (exit 3).

A receipt is written with exclusive create (`--receipt`) so an older preflight cannot silently be overwritten. The helper does not create branches or alter remote state.

### Example

```powershell
git fetch --no-tags origin main
node scripts/atlas/pr-preflight.mjs --repo Bumbi190/ai-operating-platform --project Omnira --work-id ISSUE-565 --task "Atlas Git PR preflight branch reuse policy" --branch codex/example-preflight-branch --reason "Different scope from prior PRs and no safe existing branch" --receipt C:\Temp\omnira-pr-preflight-receipt.json
```

Use the exit status and inspect the candidate list before creating anything. If a matching open PR exists, update that PR; **do not use a reason string to bypass a matching candidate**. Check file diffs and active agent ownership manually. Never modify another task's dirty/locked worktree.

## Source protection
SDF-1 code broker security relies on a unique signed/pinned UUID worktree for each work ID. Reuse project-level PR/task ownership upstream, **never** another broker sandbox. This implementation deliberately does not alter `apps/code-broker/src/isolation/worktree.ts`, token policy, leases, or approval semantics.

## Honest enforcement limitations
This is a **repository instruction plus a callable decision gate** and a test-only CI workflow. It is not yet a universal Git hook, GitHub ruleset, or gate in the autonomous code-work admission path. A caller who ignores `AGENTS.md` and uses raw `git switch -c` can still create a branch. Integrating the read-only admission check into all actual Atlas code-work entrypoints requires a separate code/security review; report that status explicitly rather than claiming universal enforcement.

The GitHub/PR metadata classifier is intentionally conservative and cannot prove patch identity. Stop on ambiguity and inspect related PR diffs manually. No production deployment, migrations, social publishing, private secrets or customer data belong to this change.
