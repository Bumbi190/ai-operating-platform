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
- Verified 28 October 2026: the new GitHub Actions security boundary passed 164/164 tests (six suites) and full web TypeScript in a clean Ubuntu runner on commit `1a85b87`. After adding a genuine `/api/chat` route-level synthetic integration suite, **177/177 focused tests passed locally across eight suites**; the new full-chat route suite contributes eight tests, including the OpenAI economy-profile chat path. The eighth suite is the existing five-case `atlas-openai-chat.test.ts` wire-adapter test. The Github Actions security gate now requires all eight suites (177 total), without skipped tests. It checks authorized source-only tool routing, exact SHA receipt, omitted private source content in durable tool rows, forged write tools, duplicate source requests, foreign operators/projects, wrong origin, and production-off behavior. The route is exercised with fake Anthropic/GitHub results, never live credentials, external network or paid provider calls. The dedicated GitHub Actions run [#40758745238](https://github.com/Bumbi190/ai-operating-platform/actions/runs/40758745238) PASSED 177/177 tests, all eight suites without skipped tests, and a full web TypeScript check on clean CI. Vercel Preview for commit `0818e27` was READY.
- No GitHub App has been installed; feature flag, production and article/social workflows remain unchanged. Require independent security review before an owner-approved live pilot.

## Source-only model context quarantine (28 October 2026)

The first security-review pass identified a distinct exposure: although the source tool was read-only, the normal `/api/chat` model system prompt still included Omnira-wide live/project context, action/tool memory, and view awareness. Previously completed user/assistant conversation turns could also accompany untrusted repository content into the same model request.

Mitigation: on an explicit authorized source read turn, REPLACE the accumulated Atlas system prompt with a minimal dedicated Nova source-only system prompt, and pass ONLY the current explicit user question to the model. The verified GitHub result and its provenance may join that isolated conversation after the single read. No previous conversation text, project-wide live context, tool/action memory or other project data are included in the provider request on this route. Ordinary non-source chat is unchanged.

Requests carrying an image, a visible website plan or an active website build context do not enter source-only mode, so the source path does not silently discard those inputs. The existing operator, same-origin, owner, one-tool/one-read and disabled-by-default protections remain in place.

Added two integration cases for both the Claude and OpenAI economy chat profiles; each submits a preceding synthetic private-other-project conversation, then proves the model receives only the current source question and the narrow system prompt, with no cross-project-history marker. **10/10 source-chat integration tests passed locally; 179/179 focused tests also passed locally across eight suites**. This new HEAD has NOT yet completed the clean GitHub CI run; require the workflow's zero-skip test check and clean TypeScript verification after pushing. Local Windows TSC remains affected only by the previously documented three unrelated `@remotion/lambda/client` cache errors.

## Concurrent main changes – CI and merge hold (28 October 2026)

After PR #598 was created, `origin/main` advanced from its original base `bdf1943` to `32e58e7` through separate Handlarbörsen communications work (PR #599 and #562). A read-only `git merge-tree` inspection shows overlapping edits in `apps/web/app/api/chat/route.ts` (tool selection and dispatch). GitHub marks PR #598 as **not mergeable** until the shared chat route is reconciled.

**No merge, rebase, reset, force-push, production deployment or edit in the other agent's worktree was performed.** Reconciliation must preserve both the newly added communications tools and Nova's source-only authorization/isolation logic, with both domains' tests rerun. Never choose one conflicting side blindly.

GitHub documents that `pull_request` workflows do not trigger while a PR has merge conflicts. A narrowly scoped `push` trigger on the EXISTING `feat/nova-source-inspection-issue576` branch was added to `.github/workflows/nova-source-inspection-boundary.yml` to prove this HEAD's tests without merging/rebasing. It has `contents:read`, no persisted checkout tokens or external secrets, and uses the same zero-skips test gates and TypeScript check. Remove that temporary trigger after the conflict is resolved safely. A green branch-only CI proves its own branch, **not** compatibility with merged `main`.

Authoritative reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

## Reconciled in Nova's isolated test branch (29 October 2026)

The earlier section describes the historic conflict. In the subsequent reconciliation, `origin/main` at `32e58e7` was merged **into `feat/nova-source-inspection-issue576` only**. `main`, the other PRs and their worktrees remain untouched. Exactly two conflicting blocks in `apps/web/app/api/chat/route.ts` were resolved deliberately:

- The Handlarborsen `stratoInboxReadIntent`, two read-only Strato tools, forced Strato routing, operator scope and existing mailbox privacy checks were preserved.
- Nova's exclusive `sourceReadTurn`, single GitHub inspection, SHA-pinned source reader, minimal model prompt and cross-project conversation isolation were preserved.
- The `executeTool` handler now checks `sourceReadTurn` as a server-derived parameter, not just user text, before a GitHub source tool can run. A model-forged tool in an ordinary or Strato turn cannot escalate to GitHub even when the current question mentions code.
- Two negative cross-routing tests verify Strato and Nova tool selection with both Preview flags enabled, including a mixed inbox/code question where the forged GitHub tool MUST be denied.
- Existing structural tests for Strato, Notion and external references were updated to expect the added server-derived routing parameter, without weakening their behavioral checks.

Local acceptance before merge commit: **343/343 focused tests PASSED across 18 suites**. This includes Nova, Strato, Handlarborsen communications, Notion, external references, operator permissions, GitHub transport and SDF-1 policy. One earlier 5-second Windows startup timeout reran green when using `--testTimeout=20000`. CI now includes named Nova and Strato suites with a zero-skip floor. The temporary branch-specific `push` trigger was removed once this conflict was resolved; regular PR CI must validate the resulting merge SHA.

Local full TypeScript is still affected by the three known shared dependency-cache errors in `lib/media/lambda-render.ts` relating to missing `@remotion/lambda/client`. A clean GitHub CI `tsc --noEmit` pass is therefore required; the local run is not a green full typecheck.

This is a branch-only merge, NOT a merge of PR #598 into production. It does not install the new GitHub App, activate Preview or Production, change Supabase, send email, publish or authorize code modification. PR #598 stays Draft until separate approval.

## Subsequent security and migration-source verification (29 October 2026)

- A second read-intent audit found that explicit negations, such as 'Nova, visa inte Handlarbörsens GitHub-kod', were misclassified as positive source requests because the original classifier matched only keywords. The new conservative Unicode-aware negation guard refuses direct 'do not read/show/inspect', 'visa inte', 'läs aldrig', 'inte att Nova läser', and 'utan att läsa' requests. A negative request cannot trigger an approved source turn. Clear positive reads with 'ändra inte' remain eligible because refusing code modification is not refusing a read.
- Added one policy regression and one real `/api/chat` route-level regression proving no GitHub source dispatch under negated read intent. This does not add a new repo, permission, model, workflow, or secret.

- The unrelated Vercel migration guard failure has a **known exact source** in the existing Handlarbörsen Lead Finder work branch `feat/hb-leadfinder-review-20261028`, associated with Draft PR #584: local commit `0eacfc4` adds `apps/web/supabase/migrations/20261029065156_handlarborsen_owner_review_archive_20261029.sql`, and local `921287b` updates the guard/test counts from 163/149 to 164/150. Neither commit had been published to PR #584 at the read-only comparison point (its remote HEAD was `2060dd63`). **Do not copy or cherry-pick this feature's migration into Nova PR #598.**
- A read-only production Supabase query found the applied ledger entry `version=20261029065156`, `name=handlarborsen_owner_review_archive_20261029` with one SQL statement. Its 420 lexical SQL tokens match the exact local canonical source's 420 tokens after removing comments and irrelevant whitespace. This is strong source correspondence but is not a proof of complete database replay or that the owning PR has passed its own release gates. No production data or migration ledger was changed.
- **Release sequencing:** let PR #584's owning work complete its own migration guard reconciliation, independent review, and approved merge to `main`. After that, sync the current Nova branch with updated main, rerun Nova/Handlarbörsen security CI and verify the actual Vercel build. Do not add a migration-guard override, create a ledger placeholder, or turn on any feature before approved release.

## Independent GitHub App installation identity check (29 October 2026)

GitHub's official REST contract distinguishes the **App installation's** `repository_selection` from the newly minted **installation token's** `repository_selection`. A caller may narrow a token using `repository_ids`, so a `repository_selection=selected` token receipt **does not prove** its parent installation is not account-wide.

Before minting an installation token, the server now makes an authenticated App-JWT **GET `/app/installations/{installation_id}`** and refuses if any of the following differ from the approved Handlarbörsen binding: numeric installation ID, numeric App ID, owner account ID/login/type, installation target ID/type, `repository_selection=selected`, exactly `Contents:read` and `Metadata:read` with no additional permissions, no event subscriptions and an unsuspended installation. Only then may it request the already narrowed single-repo read-only token. A failed check yields `identity_unverified` before token issuance, never broadens the token.

An installation can be `selected` for MORE THAN ONE repository. The narrow runtime token and repo ID revalidation still prevent Nova reading another repo, but this GET alone cannot prove the installation contains exactly one repository. **The owner must inspect the GitHub App installation screen and verify only `Bumbi190/handlarborsen` is selected.** Do not mint an unscoped/broad token just to enumerate the installation. This is a remaining explicit setup and acceptance gate.

Deterministic negative tests now cover the parent App being installed on ALL repositories despite the token being `selected`, a foreign installation owner, wrong App ID/installation ID/target, elevated permissions, subscribed events and suspension. A positive mocked read and long-file pagination still pass. The tests do not contact GitHub with a real App credential.

Source: https://docs.github.com/en/rest/apps/apps#get-an-installation-for-the-authenticated-app and https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app

## GitHub App – owner setup prepared, NOT installed (28 October 2026)

GitHub supports registration links that prefill permission and account settings. This is an owner checklist, not authority for an assistant to create or install an app.

Owner-only app registration (opens a prefilled form, does NOT submit or install):
https://github.com/settings/apps/new?name=omnira-nova-source-read&description=Private%20read-only%20GitHub%20source%20inspection%20for%20Omnira%20Nova%20%28Handlarborsen%20pilot%20only%29&url=https%3A%2F%2Fomniraos.se&contents=read&public=false&webhook_active=false&request_oauth_on_install=false

Verify the actual settings on the GitHub form before creating the app:

1. Owner: personal account controlling `Bumbi190/handlarborsen`. Proposed app name `omnira-nova-source-read` may require adjustment if unavailable. Homepage is the existing `https://omniraos.se`.
2. Visibility: **Only on this account** (`public=false`). OAuth on installation **OFF**. No callback URL or device flow. Webhooks **OFF**. No events subscribed.
3. Permissions: **Contents: Read-only** and GitHub's automatic **Metadata: Read**. ALL other repository, organization and account permissions **No access**. No Actions, Pull requests, Administration, Checks or Deployments permissions.
4. After registering, choose **Install App** > **Only select repositories** > select exactly `Bumbi190/handlarborsen` > review and explicitly confirm. Never choose **All repositories**. Verify the actual installation selection afterward; the connected ChatGPT GitHub installation is broader and must NOT be reused.
5. Use GitHub's **numeric App ID**, not Client ID. The numeric **Installation ID** appears in the installation settings/URL after installation. Generate the App's private key from the GitHub App settings.
6. **Do not paste the downloaded PEM private key into chat, Notion, GitHub issues/PRs, code, browser URLs or terminal command arguments.** Do not create a classic personal access token. Deliver the private key only into Vercel's server-side secret settings through an owner-approved secure flow.

After independent security review and separate explicit owner approval, enter the following **branch-scoped Preview-only** environment variables in the Omnira Vercel web project:

- `NOVA_SOURCE_GITHUB_APP_ID`: numeric GitHub App ID
- `NOVA_SOURCE_GITHUB_INSTALLATION_ID`: numeric installation ID for this selected-repo installation
- `NOVA_SOURCE_GITHUB_APP_PRIVATE_KEY`: PEM in the Vercel secure server environment; literal newlines or escaped `\n` are supported
- `ATLAS_SOURCE_INSPECTION_MODE=pilot`: enable only after all three values have been configured and reviewed

Never add `NEXT_PUBLIC_` prefixes. Production is blocked by code (`VERCEL_ENV !== preview`) even if a pilot flag is copied there. Do not enable the flag to debug missing credentials. A real owner-authenticated Preview session must be used for acceptance.

Preview acceptance after owner approval:

1. Ask Nova for Handlarbörsen's repository status. Verify exact numeric repo ID `1374257653`, immutable 40-char commit SHA and observed timestamp. An error is not an observed status.
2. Read `README.md` and `app/page.tsx` first page, limited to 240 numbered lines. Verify source URL pinned to the same commit and continuation cursor.
3. Read `app/page.tsx` beginning at `startLine=241` with the exact `expectedSha` returned previously; expect the rest of the 390 lines and no mixed Git versions. A wrong or stale SHA must fail closed.
4. Prove denials for wrong owner/project/origin, dotfiles, symlinks, oversize/binary content, and forged write tools. No publishing, execution or editing should be available.
5. Log only a redacted evidence receipt with commit, path, denial codes and timestamp. Never copy private code or secrets into PR comments or Notion.

Authoritative references:
- https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app

Status: **not created, not installed, not enabled, not merged**. Do not treat registration-form preparation as real GitHub authorization.

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
