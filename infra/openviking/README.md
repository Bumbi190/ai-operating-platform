# Local OpenViking pilot

Real **vectors-only and semantic-and-vectors** probes passed on 2026-10-15. Production remains OFF. The owner selected local testing first; the separate Atlas preview now uses the first owner-approved internal Obsidian note and the existing login. The original probes used synthetic fixtures.

## Measured result

OpenViking v0.5.0 and Ollama 0.40.4 ran on the owner's RTX 3060. The probe used three synthetic Swedish notes in its own account, not real vault or production data.

| Check | Result |
|---|---|
| Explicit upload and completed vector indexing | pass |
| New colleague account-access question | correct first hit, 103 ms |
| Data recovery question | correct first hit, 87 ms |
| Support escalation question | correct first hit, 29 ms |
| Real Atlas prompt construction | 1,551 characters, trusted original text and snapshot provenance |
| Empty allowed-project list | no injection |
| No API key | HTTP 401 |
| Foreign account key | no access to probe evidence |
| Revoked publication | empty result |
| Explicit fixture snapshot pruning | pass |

Warmup took 195 ms on the final run; the final complete probe took 2.47 seconds with loaded models. The initial vector indexing run included approximately 56 seconds of cold startup/queue wait. These are small-fixture observations, not a production benchmark or a comparison against the previous retrieval system.

### Real API contract correction

The real server returned a leaf URI of `<snapshot>/<id>.md/<id>.md`, while its ingestion receipt's `root_uri` was `<snapshot>/<id>.md`. The earlier HTTP fixtures modeled the receipt URI as the leaf. Runtime retrieval now accepts only the exact observed leaf for each approved document; it still rejects the parent URI, arbitrary descendants, stale snapshots and foreign sources. An independent regression reproduced the mismatch before correction and passed afterward.

### Semantic processing resolution

The initial `qwen3:4b` probe exceeded the 240-second ingestion deadline. A minimal diagnostic reproduced unwanted reasoning text even with OpenAI `reasoning_effort=none` and native `think=false`: a request for the single word KLAR consumed the 128-token budget and ended at the length limit.

Changing only the processing model to `qwen3:4b-instruct` produced exactly KLAR, no reasoning text, and a normal stop. Full semantic processing then completed all three documents in **56,355 ms**, without increasing the ingestion deadline or request budgets. The final queries returned their expected first hits in **191 / 101 / 100 ms**.

The strengthened live probe also read real L0/L1 artifacts for all three document directories: abstracts contained 109 / 216 / 227 characters and overviews 2,700 / 2,602 / 2,692 characters. It rejects missing/placeholder summaries and raw thinking tags. This checks artifact readiness, not factual quality across a production corpus. Atlas still renders only approved original publication text.

The successful semantic run used a fresh `state_semantic` volume, enabled L0/L1 generation, and retained the two loaded-model slots. Earlier vector and semantic volumes were preserved. The runtime search deadline stays 1.2 seconds.

## Code validation

The relevant Atlas/OpenViking regression selection passed: 375 tests, with the explicit live probe skipped by default. Worktree TypeScript checking and targeted ESLint passed. Compose syntax passed; the default service selection is empty without the `local-gpu` profile.

The complete archive suite remains red. Against base `910376b2eb485f136e1b36073f08e7788f0be2d6`, the same harness reported 54 failed files / 207 failed tests; the implementation reported 53 failed files / 204 failed tests. Comparison of the complete failure entries found no added failures and three removed golden-fixture failures. The final suite had 12,529 passed tests and 1,183 skipped tests. This comparison does not claim the full suite is green. Archive TypeScript checking lacked nested workspace dependencies; the separate check from the installed worktree passed.

The initial vector/suite receipt is recorded in [validation-20261015.json](./validation-20261015.json). Its semantic-mode limitation describes that earlier run; the successful follow-up is recorded in [validation-semantic-20261015.json](./validation-semantic-20261015.json). The follow-up passed 39 regular tests with the live test skipped by default, the explicit semantic probe, a separate manual-preview recall/authentication probe, worktree TypeScript and targeted ESLint checks.

## Hardware and lifecycle

The owner noticed loud fan noise. Both services were immediately stopped; GPU utilization then measured 1%. After the owner authorized continued testing with temperature monitoring, the GPU had cooled to 44 C.

The monitored retry sampled every two seconds and stopped the task's own services if core temperature reached 80 C, VRAM reached 94%, monitoring failed, or the ten-minute test window ended. Its observed maximum over the complete monitored window was 70 C, below the 80 C stop threshold. No clocks or hardware power limits were changed. The watch script is a separate, manually armed safeguard; Compose alone does not enforce a temperature limit.

The subsequent successful semantic run reached a measured maximum of 76 C, below the same 80 C stop threshold. Its services were stopped after verification. The manual preview uses a separately armed 30-minute watch with the same temperature/VRAM/failure guards. At expiry it stops these OpenViking/model services; it is not an always-on production deployment. Both Compose services require the explicit `local-gpu` profile and have no automatic restart policy.

## Private configuration

The existing installation's private `ov.conf`, account credentials, canonical project map, thermal monitor and probe receipt are under:

    C:\Users\Andre\AppData\Local\Omnira\OpenViking\pilot-20261015

This directory has owner/SYSTEM access and is outside Git. Both model clients point at the local Ollama container. No paid model credential is used by OpenViking, and Ollama cloud use is disabled. The separate Atlas preview retains the application's existing Anthropic provider for chat answers. The local OpenAI-compatible VLM client uses the documented ignored `ollama` compatibility key; it is not an OpenAI cloud connection.

Images are digest-pinned in `compose.yaml`. The model API has no host port. OpenViking binds the host only at `127.0.0.1:19330`; data APIs require a tenant key. Persistent models and server state use separate Docker volumes.

Check syntax without starting services:

    $env:OPENVIKING_LOCAL_CONFIG = '<private-absolute-ov.conf-path>'
    docker compose -f infra/openviking/compose.yaml --profile local-gpu config --quiet

After deliberately arming local temperature monitoring, an operator can start the pilot with:

    docker compose -f infra/openviking/compose.yaml --profile local-gpu up -d

Stop only these services with:

    docker compose -f infra/openviking/compose.yaml --profile local-gpu stop

Runtime uses a USER key; the root key is for administration. Never publish credentials or copy the full existing Omnira environment into the pilot.

## Reproduce the real-service probe

`apps/web/lib/qa/atlas-openviking-live.test.ts` is skipped in normal CI. It creates a temporary clean Git vault, uses the existing preparation CLI, tests retrieval and the Atlas seam, and prunes only its own synthetic snapshot on success. A failed run may leave synthetic jobs/documents in the isolated probe account.

Provide these variables for an explicit run:

- `ATLAS_OPENVIKING_LIVE_APPLY=1`
- `ATLAS_OPENVIKING_LIVE_VECTORS_ONLY=1` for the vector-only mode; omitting it exercises the now-verified semantic mode
- `ATLAS_OPENVIKING_LIVE_URL`: private endpoint reachable from the process
- `ATLAS_OPENVIKING_LIVE_CREDENTIALS`: private JSON with `omnira-pilot-probe` and `omnira-foreign-probe`, each containing `operator_key` and `reader_key`
- `ATLAS_OPENVIKING_LIVE_REPORT`: successful metadata receipt path

From `apps/web`:

    npx vitest run lib/qa/atlas-openviking-live.test.ts --maxWorkers=1 --minWorkers=1

The existing Vitest server-only alias supplies the Next module environment. Plain Node cannot import that request-time marker directly. No new dependency was added.

## Actual knowledge and production status

Before the owner's note approval, the real vault was clean at `a2a9ae4`, with six tracked Markdown files and no eligible approved project notes. The owner-approved publication below adds exactly one new project note on its own vault branch; existing platform notes were not relabeled and private M4 content was not exported. The canonical registry was read without modification and its mapping saved privately.

The local endpoint cannot serve the hosted production application. Before production activation, select the production host/private-network route and evaluate relevance on representative owner-approved project knowledge. Exactly one owner-approved vault note has been imported into the local pilot; production environments, migrations and merges are unchanged.

Sources: release-matched OpenViking configuration/authentication and Ollama OpenAI-compatibility documentation; [official Qwen3 instruct model](https://ollama.com/library/qwen3:4b-instruct) and the [upstream thinking-control issue](https://github.com/ollama/ollama/issues/12022).

## Manual local Atlas test

The private preview is an archive of reviewed branch commit a0f3c9a with its own dependencies, cache and environment. Later branch commits add validation/docs, with no further request-time runtime change. The preview uses the existing Omnira login, backend and Anthropic provider; it is not a separate database sandbox.

Start the desktop shortcut **Atlas minnestest**, then open http://127.0.0.1:3015/projects/omnira-selftest on the stationary PC. The guarded launcher waits for health and warms the current publication. Cold startup may take about a minute. The query budget remains 1.2 seconds and the manual test window is 30 minutes.

The active publication now contains the owner-approved internal note **Lokal minnespilot för omnira-selftest**, from the actual vault at commit c1980d4. It replaces the old synthetic control-code publication. The old artifact/index remain privately available for rollback, but their text is excluded by the active snapshot.

1. Start a **new Atlas conversation** while viewing omnira-selftest.
2. Ask: **Hur startar jag minnespiloten, hur länge kör testpasset och vilken temperaturgräns gäller? Ange källan.**
3. Expect **Atlas minnestest**, **30 minuter**, **80 °C**, and the note title or path 60 Memory/omnira-selftest-local-memory-pilot.md.
4. In another new conversation, paraphrase the question.
5. Switch projects and start another new conversation. The pilot note must not be injected. Existing chat history can retain an earlier answer.

The launcher now warms the title of the currently deployed source and validates its exact indexed leaf. It no longer reports the retired synthetic control code as the expected answer. Localhost is reachable only from this PC. At thermal stop or expiry, the two GPU services stop and Atlas falls back without this evidence; start a new guarded session with the shortcut.

The owner confirmed the earlier synthetic UI retrieval at 12:31 Europe/Stockholm. After this note's 13:46 approval, the automated actual-source/paraphrase/provenance/project/off/authentication probe passed against the restored preview. At 14:17 Europe/Stockholm, the owner supplied the authenticated local Atlas answer for the approved note: correct shortcut, 30-minute window, 80 C guard, note/canonical paths and snapshot prefix 88113d02. This confirms end-to-end use of this source; it is not a general relevance benchmark.

## Lifecycle follow-up and Obsidian candidate

The explicit lifecycle acceptance passed against a fresh, isolated vectors-only server volume with automatic L0/L1 generation disabled. It used the real preparation CLI, clean temporary Git vault revisions, USER retrieval and the actual Atlas prompt seam. Request checks retained the normal 1.2-second runtime budget.

| Scenario | Verified result |
|---|---|
| Deploy changed revision B while A remains indexed | New original text and B provenance; no A text |
| Deploy C without one note while A/B remain indexed | Removed source excluded; retained source still injected |
| Empty deployed publication before index pruning | No knowledge injection |
| Revoked membership or another project view | No knowledge injection |
| Prune only snapshot A | B, C and another project's source remain retrievable |
| Clean disposable fixtures | Test snapshots removed; manual publication preserved |

The successful test took 8.81 seconds; indexing the four fixture revisions took 1,414 / 1,065 / 281 / 533 ms. Its guarded session, including original-server restoration and preview revalidation, reached a maximum of 52 C. The original semantic server volume/container and private configuration were restored; both GPU services were stopped at completion. Seven synthetic snapshots from interrupted earlier attempts were also individually removed from their two reserved test-project roots. No account, whole project or actual vault was deleted.

The earlier semantic lifecycle attempt reached the 80 C guard and stopped before the foreign fixture completed. A vectors-only retry against that mixed semantic state reached its post-prune preservation checks but did not pass; independent queries still found both newer snapshots and the other project in 157 / 93 / 79 ms. Server logs contained model-runner failures, and that session subsequently reached the thermal guard too. The exact mixed-load assertion failure was not isolated. The successful fresh-volume run proves the data lifecycle under the stated conditions, not stability under simultaneous semantic background load. The earlier successful three-note semantic-readiness probe remains separate evidence. No thermal limit, model memory limit or application deadline was increased.

Final checks: **86 regular tests passed**, both explicit real-service tests skipped by default, worktree TypeScript passed, targeted ESLint passed, and the restored manual preview's original-source/paraphrase/project/off/authentication probe passed. Login returned 200 and unauthenticated chat returned 401. The complete suite was not repeated; the earlier baseline differential and its red-suite limits still apply.

Receipt: [validation-lifecycle-20261015.json](./validation-lifecycle-20261015.json). The explicit test is `apps/web/lib/qa/atlas-openviking-lifecycle.test.ts`, enabled with `ATLAS_OPENVIKING_LIFECYCLE_APPLY=1`. It uses the original probe's LIVE_URL/LIVE_CREDENTIALS variables and `ATLAS_OPENVIKING_LIFECYCLE_REPORT` for its private receipt. To reproduce the isolated mode, also set `ATLAS_OPENVIKING_LIVE_VECTORS_ONLY=1` and disable automatic L0/L1 on a separate server volume. Preserve existing service data; a failed run may leave synthetic fixtures.

The [Obsidian note](../../docs/runbooks/atlas-openviking-obsidian-draft.md) was subsequently explicitly approved by the owner and published locally as recorded below. The original candidate and lifecycle receipt describe their earlier review state.

## Owner-approved local publication

At 13:46 Europe/Stockholm the owner approved the concrete note and its status/classification/project scope. Exactly one actual vault source was committed on codex/atlas-openviking-approved-note-20261015 (c1980d4); vault main remains a2a9ae4. No existing note metadata was changed.

The publication snapshot is 88113d0204f2abd58c3ff72d1d3acedd122442329a163a026d0a271aefb99d7c. The operator waited for completed vectors-only indexing before replacing the local preview artifact. Automatic L0/L1 was disabled during synchronization to limit background work; the original private semantic configuration was restored afterward.

Two paraphrased questions produced the approved original text with note path, canonical path and current snapshot provenance in **116 / 169 ms**. The retained synthetic snapshot remained separately searchable but its control code, location and snapshot were absent from the new prompt. Different-project, denied-membership and mode-off checks returned empty; login was 200 and unauthenticated chat was 401.

The guarded session reached **74 C**, below the 80 C stop threshold. Both GPU services were stopped after validation; start the shortcut for another session. The mixed semantic-load limits above still apply. The code branch's checked-in corpus is unchanged and empty; production remains OFF and no merge was performed.

Receipt: [validation-approved-note-20261015.json](./validation-approved-note-20261015.json). The vault commit and normalized source hash are recorded without credentials or private M4 data.

## Relevance diagnostic and proposed next corpus

The existing lexical vault provider and OpenViking were measured over the same approved note on 2026-10-15: both found it for 8/8 answerable questions and returned it for 4/4 unanswerable questions, each repeated three times. Median measured retrieval was 8 ms versus 41 ms. This is a completed diagnostic, not a passed relevance gate or an answer-quality comparison. No retrieval threshold or runtime behavior was tuned from it.

Four short draft source descriptions are prepared in the integration worktree for a subsequent five-source local test. They are not in the actual vault or active publication and require the owner's explicit editorial approval. See [method, results and concrete proposed notes](../../docs/runbooks/atlas-openviking-relevance.md), [measured receipt](./validation-relevance-20261015.json) and [draft validation](./validation-next-corpus-20261015.json). Production remains OFF.
