# Local OpenViking pilot

Real **vectors-only and semantic-and-vectors** probes passed on 2026-10-15. Production remains OFF. The owner selected local testing first; a separate Atlas preview uses synthetic project knowledge and the existing login.

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

## Actual knowledge and production remain pending

The real vault was clean at `a2a9ae4`, with six tracked Markdown files. Its approved material has platform scope; no approved project-scoped notes qualify for the single-project pilot. No status, classification or scope was changed and no private M4 content was exported. The canonical registry was read without modification and its mapping saved privately.

The local endpoint cannot serve the hosted production application. Before production activation, select the production host/private-network route, obtain eligible owner-approved project knowledge and evaluate relevance on that actual corpus. No production environment, migration, merge or private vault import was performed.

Sources: release-matched OpenViking configuration/authentication and Ollama OpenAI-compatibility documentation; [official Qwen3 instruct model](https://ollama.com/library/qwen3:4b-instruct) and the [upstream thinking-control issue](https://github.com/ollama/ollama/issues/12022).

## Manual local Atlas test

The private preview is an archive of reviewed branch commit `a0f3c9a`, with its own dependencies, build cache and environment. Production source and the branch's empty checked-in corpus are unchanged. Its login is the existing Omnira login; the app uses the existing backend and model provider. Treat this as an authenticated application copy, not an isolated database sandbox.

On the stationary PC open:

    http://127.0.0.1:3015/projects/omnira-selftest

Only this local preview receives the synthetic `minnespilot-test.md` publication for canonical project `omnira-selftest`. Its separate clean test vault is under the private pilot directory; no note in the actual Obsidian vault was promoted or modified.

1. Open a new Atlas conversation while viewing `omnira-selftest`. Ask: **Vilken kontrollkod har minnespiloten och var ligger testlådan? Ange anteckningens namn.**
2. Expect **NORDLJUS-7426**, **hylla C7**, and `minnespilot-test.md` (or its title).
3. Open another new conversation and paraphrase the question. The same original source should support the answer.
4. Switch to a different project and start another new conversation. Ask the same question. The pilot source must not be injected. Reusing an old conversation can retain the old answer in normal chat history and is not an isolation test.

The desktop shortcut **Atlas minnestest** runs the private `start-local-pilot.ps1` with its browser option. The launcher starts the guarded services, waits for health, warms the actual published search, and opens the local preview. Cold model loading was observed around 50 seconds with the local RAM limit; startup warmup allows 90 seconds, while the application's 1.2-second query budget is unchanged. Models are kept loaded for up to 30 minutes to fit the guarded manual window. The manual window lasts 30 minutes. A thermal stop or expiry makes OpenViking unavailable and Atlas falls back without this evidence. Restart the guarded session before testing again. Localhost is reachable only from this PC.

The app's normal authentication and project-access checks remain in effect. This step must be completed interactively by the owner; backend retrieval and prompt construction are verified separately by the live probe.
