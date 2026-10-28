# Nova project source inspection – Issue #576, Stage B1

Status: Code and deterministic mocked API tests only. Feature OFF by default. No GitHub App installation, production deployment, paid dispatch, browser visit, code execution or database migration.

## Scope

- Handlarbörsen is the ONLY admitted project, bound to the independently verified numeric GitHub repository ID 1374257653 (Bumbi190/handlarborsen), owner ID 158544361 and main branch.
- A new dedicated GitHub App installation must provide a single-repo token with Contents: Read only and mandatory Metadata: Read. A separate App prevents confusing ChatGPT's GitHub connector or the Familje-Stunden App with Nova's server permissions. Never use an account-wide classic PAT.
- Nova's source chat intent offers ONE read-only tool. It does not present any unrelated workflow/code-action tools in that turn. The handler revalidates operator session, same origin, project ownership and exact tool input before provider dispatch.
- A second invocation within that turn is refused. Executable instructions embedded in source files are treated as UNTRUSTED DATA, never commands.
- Every GitHub read verifies numeric repo/owner identity and resolves a full immutable commit SHA. To prevent GitHub's Contents API from dereferencing a symlink, the reader now walks the commit's Git tree one directory at a time. Every ancestor must be an actual tree (040000) and the final file a regular blob (100644/100755). Symlinks (120000), submodules (160000), wrong/incomplete tree responses and unexpected modes are denied before content is read. Only then does it fetch the pinned raw Git blob and independently validate its SHA-1 from the exact bytes.
- Only safe relative paths under selected code/doc roots, maximum 32 KiB and 240 numbered lines, are exposed. Exact source URL and SHA are returned. GitHub calls share a 23-second overall deadline under the 30-second route limit.
- Private source text is not persisted in the chat's tool history; only an evidence receipt with repo ID, SHA, file path, URL and line count. The authorized session can see the current tool result.
- Source files with likely secret material are refused entirely. Regex-based secret checks are conservative, NOT proof that all secrets can be identified.

## Continued security and long-file inspection checks (28 October 2026)

- The conservative whole-file secret detector now refuses additional inline database URLs with userinfo, JSON/YAML assignments to credential-like keys, camelCase tokens, HTTP Basic/Bearer authorization, JWT-like strings and common service/payment tokens. These heuristic checks are deliberately fail-closed and may reject harmless code; they DO NOT replace an independent secrets audit.
- A verified example from the canonical Handlarbörsen repo is `app/page.tsx` (390 lines, about 16 KiB). This is the real homepage location, not `src/app/page.tsx`.
- Each read still exposes at most 240 numbered lines. First page returns `startLine: 1`, `nextStartLine: 241` and an exact commit SHA. To read subsequent lines, submit `action: read_file`, the same path, `startLine: 241` and `expectedSha` equal to that **exact previous commit SHA**. The provider resolves main again and refuses the continuation with `source_changed` (HTTP 409) if the commit moved. Start again from line 1; NEVER combine fragments from two commits.
- No source byte limits or operator/project isolation gates have been relaxed. Only response metadata (`startLine`, `nextStartLine`, SHA, URL) persists in chat tool-history receipts. The actual source lines are delivered only in the authorized live tool result.
- Verified 28 October 2026: the new GitHub Actions security boundary passed 164/164 tests (six suites) and full web TypeScript in a clean Ubuntu runner on commit `1a85b87`. After adding a genuine `/api/chat` route-level synthetic integration suite, **177/177 focused tests passed locally across eight suites**; the new full-chat route suite contributes eight tests, including the OpenAI economy-profile chat path. The eighth suite is the existing five-case `atlas-openai-chat.test.ts` wire-adapter test. The Github Actions security gate now requires all eight suites (177 total), without skipped tests. It checks authorized source-only tool routing, exact SHA receipt, omitted private source content in durable tool rows, forged write tools, duplicate source requests, foreign operators/projects, wrong origin, and production-off behavior. The route is exercised with fake Anthropic/GitHub results, never live credentials, external network or paid provider calls. CI is extended to require all seven suites and will supply the authoritative clean-run verification after the next push.
- No GitHub App has been installed; feature flag, production and article/social workflows remain unchanged. Require fresh CI and an independent security review before an owner-approved live pilot.
## Disabled release gates

The new POST endpoint is /api/atlas/source-inspection. It is permanently unavailable in Production in this tranche. Preview also requires all of these server-side settings, currently NOT installed:

- ATLAS_SOURCE_INSPECTION_MODE=pilot
- NOVA_SOURCE_GITHUB_APP_ID
- NOVA_SOURCE_GITHUB_INSTALLATION_ID
- NOVA_SOURCE_GITHUB_APP_PRIVATE_KEY

The GitHub App must be installed only on the reviewed Handlarbörsen repo. Its runtime token request narrows permissions and repository ID again, and rejects an overly broad token receipt, including repository_selection other than selected. The in-memory token cache is keyed by repository ID as well as app and installation IDs. No anonymous or broader credential fallback exists. All outbound calls have bounded duration/response sizes, no redirect following and no secret-bearing error logs.

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
