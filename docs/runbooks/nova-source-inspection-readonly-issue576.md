# Nova project source inspection – Issue #576, Stage B1

Status: Code and deterministic mocked API tests only. Feature OFF by default. No GitHub App installation, production deployment, paid dispatch, browser visit, code execution or database migration.

## Scope

- Handlarbörsen is the ONLY admitted project, bound to the independently verified numeric GitHub repository ID 1374257653 (Bumbi190/handlarborsen), owner ID 158544361 and main branch.
- A new dedicated GitHub App installation must provide a single-repo token with Contents: Read only and mandatory Metadata: Read. A separate App prevents confusing ChatGPT's GitHub connector or the Familje-Stunden App with Nova's server permissions. Never use an account-wide classic PAT.
- Nova's source chat intent offers ONE read-only tool. It does not present any unrelated workflow/code-action tools in that turn. The handler revalidates operator session, same origin, project ownership and exact tool input before provider dispatch.
- A second invocation within that turn is refused. Executable instructions embedded in source files are treated as UNTRUSTED DATA, never commands.
- Every GitHub read verifies numeric repo/owner identity and resolves a full immutable commit SHA before requesting a file at that SHA. Only safe relative paths under selected code/doc roots, maximum 32 KiB and 240 numbered lines, are exposed. Exact source URL and SHA are returned.
- Private source text is not persisted in the chat's tool history; only an evidence receipt with repo ID, SHA, file path, URL and line count. The authorized session can see the current tool result.
- Source files with likely secret material are refused entirely. Regex-based secret checks are conservative, NOT proof that all secrets can be identified.

## Disabled release gates

The new POST endpoint is /api/atlas/source-inspection. It is permanently unavailable in Production in this tranche. Preview also requires all of these server-side settings, currently NOT installed:

- ATLAS_SOURCE_INSPECTION_MODE=pilot
- NOVA_SOURCE_GITHUB_APP_ID
- NOVA_SOURCE_GITHUB_INSTALLATION_ID
- NOVA_SOURCE_GITHUB_APP_PRIVATE_KEY

The GitHub App must be installed only on the reviewed Handlarbörsen repo. Its runtime token request narrows permissions and repository ID again, and rejects an overly broad token receipt. No anonymous or broader credential fallback exists. All outbound calls have bounded duration/response sizes, no redirect following and no secret-bearing error logs.

## Remaining acceptance gates

1. Obtain independent security review for the App scopes, route and chat dispatch.
2. Set up the ONE-repo read-only GitHub App and Preview-only server environment, with explicit owner approval; keep Production disabled.
3. In a real authenticated owner session, ask Nova to inspect Handlarbörsen GitHub status, then one named safe source file such as README.md. Confirm the actual SHA, URL, line numbers, source provenance, read-only outcome and no fabricated access.
4. Deny a second user, a cross-project request, bad origin, malformed path, file containing secrets and a forged tool call before any provider/network access.
5. Verify social workflows, voice, SDF-1 code worker and Claude's The Prompt task continue unchanged. No merge or production activation until the user's Preview review.

## Development evidence

Read-only Git preflight receipt saved locally:
C:\Users\Andre\Projects\Omnira\Docs\preflight-ISSUE576-source-inspection-20261028.json

Decision: new_branch_approved; 122 open PRs checked; origin/main bdf1943b07681befdacf9e48b458bc303a4002b1.

Branch: feat/nova-source-inspection-issue576
Worktree: C:\Users\Andre\Projects\Omnira\.worktrees\nova-source-inspection-issue576
Issue: https://github.com/Bumbi190/ai-operating-platform/issues/576

This tranche is distinct from Nova voice PR #578 and all Claude/The Prompt work.
