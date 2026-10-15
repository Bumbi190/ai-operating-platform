# Atlas local platform knowledge pilot

This bounded extension lets the existing Atlas chat recall path read a separately published platform corpus. It does not change production configuration, operational authority, the project publication CLI, or M4 storage.

## Admission before retrieval

The chat route obtains the principal through Supabase `auth.getUser()`. It derives internal knowledge access with the existing `isExplicitlyAuthorizedInternalPrincipal(user.email)` policy; request JSON cannot supply that decision.

Every platform read additionally requires:

- an exact `on` or `shadow` platform mode;
- an explicit UUID in `ATLAS_OPENVIKING_PLATFORM_USER_ID` matching that authenticated user;
- the existing configured pilot project UUID/slug and fresh server project allow-list;
- an absent active project view, or a view matching the pilot slug;
- a valid independent platform artifact and independent endpoint/credential.

An internally authorized collaborator or operational platform operator receives no platform recall unless the explicit pilot-user gate also matches. Reading a knowledge note grants no action, spending, delegation, or workflow permission.

## Configuration

All new settings are server-only. Defaults contribute no platform knowledge and make no platform request.

| Variable | Meaning |
| --- | --- |
| `ATLAS_OPENVIKING_PLATFORM_MODE` | Unset/off: disabled; `shadow`: search and metadata-only diagnostics; `on`: inject validated original evidence. |
| `ATLAS_OPENVIKING_PLATFORM_USER_ID` | Exact authenticated UUID admitted to the local pilot; missing/invalid fails closed. |
| `ATLAS_OPENVIKING_PLATFORM_URL` | Independent HTTPS endpoint, or HTTP loopback during local testing. |
| `ATLAS_OPENVIKING_PLATFORM_API_KEY` | Independent platform-account user credential. No fallback to the project key. |
| `ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS` | Existing knowledge allow-list. Configure only the verified pilot owner in the private local preview. |

The existing internal policy also recognizes `BREVO_ADMIN_EMAIL`. The explicit pilot UUID still applies. `PLATFORM_OPERATOR_EMAILS` governs operational authority and is not used to grant knowledge access.

The existing `ATLAS_RECALL_PROJECT_ID`, `ATLAS_RECALL_PROJECT_SLUG`, project knowledge mode, and M4 flags retain their roles. A platform failure does not remove valid project evidence or M4 recall.

## Artifact and index

`apps/web/data/openviking/platform-corpus.json` is an empty checked-in default. Approved internal note bodies and credentials are kept outside this public repository.

A platform artifact uses `scope: { kind: 'platform' }`, the existing `knowledge-projection-v1` manifest, and exact normalized `documentsJsonl` bytes. The runtime repeats hash, snapshot, count, path, classification, canonical-pointer, and duplicate checks. Every row must have exactly platform scope. Project envelopes and mixed/ambiguous envelopes are rejected.

The existing project parser remains project-only. Do not relabel a platform note as a project note to make it pass. The existing project prepare/sync CLIs remain project-only; this increment consumes an explicitly prepared platform snapshot from the existing generic eligibility/projection pipeline.

Platform resources use:

`viking://resources/omnira/platform/knowledge/<snapshotId>/<documentId>.md/<documentId>.md`

The local operator indexes only the approved originals, verifies each explicit destination and completed processing task, and checks the platform-account reader, foreign-account isolation, and unauthenticated denial before enabling runtime use. Account names do not grant application access.

The remote service selects exact identifiers. Atlas renders text only from the validated deployed artifact. Remote bodies, summaries, stale snapshots, and project namespace hits cannot add platform text.

## Bounds and failure behavior

Project and platform searches run concurrently with the existing 1200 ms per-request deadline. M4 keeps its independent 750 ms bound.

Both knowledge corpora share at most eight excerpts and 6000 content characters, with at most 1200 characters per excerpt. Selection alternates scopes while preserving the service's ordering within each scope; scores from different corpora are not compared. Provenance stays in distinct project and platform blocks. These limits cover source content; JSON metadata and precedence instructions are additional prompt overhead.

Shadow evidence does not consume the injection budget. Missing configuration, invalid publications, denied principals, HTTP errors and timeouts add no platform context. Diagnostic logs contain scope, pilot project, snapshot and hit count, never source text or keys.

Related search hits are not proof that the requested fact exists. The prompt requires explicit uncertainty for unsupported facts and precedence for current live/canonical evidence over historical summaries.

## Rollback

Set `ATLAS_OPENVIKING_PLATFORM_MODE=off` in the private preview. Project recall and existing M4 flags continue independently. Use a fresh chat to test current retrieval, since prior messages remain part of their existing conversation history.

The local hardware watch remains 30 minutes, 80 C GPU core, 94 percent VRAM, and stop on monitoring loss. No model, API ceiling, process budget, production deployment, or operational operator permission is changed by this extension.


## Verified local result (2026-10-15)

- Thirty new cases passed. The focused HTTP/recall/route selection passed 69/69.
- Focused TypeScript (changed runtime modules, chat route and new tests with imports) and focused ESLint passed. The custom lint check permits existing intentional constant loops; its initial stricter setting reported the unchanged response-reading loop in client.ts.
- The complete isolated application test command ran on the exact pre-change commit and final code: 12,578 passed / 205 failed / 1,184 pending before, and 12,608 passed / 205 failed / 1,184 pending after. The named failure sets and eleven SQL-fixture setup errors are identical. No new failing test remains. This is not a claim of a green whole-application suite or whole-app typecheck. [Named baseline failures and environment](./atlas-openviking-platform-test-results.json).
- The first broad run exposed two exhaustive importer-list failures caused by the new QA fixtures. Only those two QA paths were registered; the runtime/vault/authority graph restrictions remain intact.
- Independent review and follow-up found no blocking concern. Suggestions for short-document count, valid stale-hit fields and concurrent stalled searches were added.
- Four fresh authenticated Brave conversations passed their stated checks: platform catalog semantics and the three risk scales with canonical citations, explicit uncertainty about an unsupported production cost, and the original shortcut/duration/GPU-limit project answer with its source. These are four development smoke tests, not a general accuracy estimate.
- The operational catalog tool still denied operator authority; Atlas answered from the approved published evidence without receiving operational rights.
- The separate accounts rejected cross-scope reads in both directions; anonymous platform search returned 401. Internal originals, full answers and screenshots remain in private local evidence.
- GPU core reached 44 C. The existing watcher stopped the two owned model services after verification. The preview launcher was not explicitly restarted and provider/budget settings were unchanged.
- Repository project and platform defaults remain empty, and this branch is unmerged. The last inspected hosted build blocker remains documented in the parent pilot; no current-head hosted-build success is claimed.

[Compact validation receipt](../../infra/openviking/validation-platform-pilot-20261015.json).
