# Local OpenViking pilot

The real **vectors-only** probe passed on 2026-10-15. The local models are stopped after verification; production remains OFF. Full semantic processing is still not validated.

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

### Semantic processing limit

The earlier `semantic_and_vectors` probe exceeded its 240-second ingestion deadline. Slow embedding calls were observed while one loaded-model slot was shared with semantic generation. That mode has not passed and is not claimed ready.

The successful retry used a fresh state volume, `vectors_only`, disabled L0/L1 generation and two available model slots. The earlier semantic volume was preserved. This isolates the working vector/transport/prompt path; it does not prove generated summaries work. The application search deadline stays 1.2 seconds.

## Code validation

The relevant Atlas/OpenViking regression selection passed: 375 tests, with the explicit live probe skipped by default. Worktree TypeScript checking and targeted ESLint passed. Compose syntax passed; the default service selection is empty without the `local-gpu` profile.

The complete archive suite remains red. Against base `910376b2eb485f136e1b36073f08e7788f0be2d6`, the same harness reported 54 failed files / 207 failed tests; the implementation reported 53 failed files / 204 failed tests. Comparison of the complete failure entries found no added failures and three removed golden-fixture failures. The final suite had 12,529 passed tests and 1,183 skipped tests. This comparison does not claim the full suite is green. Archive TypeScript checking lacked nested workspace dependencies; the separate check from the installed worktree passed.

The metadata receipt, suite summaries, failure comparison and thermal result are recorded in [validation-20261015.json](./validation-20261015.json).

## Hardware and lifecycle

The owner noticed loud fan noise. Both services were immediately stopped; GPU utilization then measured 1%. After the owner authorized continued testing with temperature monitoring, the GPU had cooled to 44 C.

The monitored retry sampled every two seconds and stopped the task's own services if core temperature reached 80 C, VRAM reached 94%, monitoring failed, or the ten-minute test window ended. Its observed maximum over the complete monitored window was 70 C, below the 80 C stop threshold. No clocks or hardware power limits were changed. The watch script is a separate, manually armed safeguard; Compose alone does not enforce a temperature limit.

The private monitor script and receipt are in the local state directory below. Models are stopped after verification. Both Compose services require the explicit `local-gpu` profile and have no automatic restart policy.

## Private configuration

The existing installation's private `ov.conf`, account credentials, canonical project map, thermal monitor and probe receipt are under:

    C:\Users\Andre\AppData\Local\Omnira\OpenViking\pilot-20261015

This directory has owner/SYSTEM access and is outside Git. Both model clients point at the local Ollama container. No paid model credential was used, and Ollama cloud use is disabled. The local OpenAI-compatible VLM client uses the documented ignored `ollama` compatibility key; it is not an OpenAI cloud connection.

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
- `ATLAS_OPENVIKING_LIVE_VECTORS_ONLY=1` for the verified mode; omitting it exercises the unverified semantic mode
- `ATLAS_OPENVIKING_LIVE_URL`: private endpoint reachable from the process
- `ATLAS_OPENVIKING_LIVE_CREDENTIALS`: private JSON with `omnira-pilot-probe` and `omnira-foreign-probe`, each containing `operator_key` and `reader_key`
- `ATLAS_OPENVIKING_LIVE_REPORT`: successful metadata receipt path

From `apps/web`:

    npx vitest run lib/qa/atlas-openviking-live.test.ts --maxWorkers=1 --minWorkers=1

The existing Vitest server-only alias supplies the Next module environment. Plain Node cannot import that request-time marker directly. No new dependency was added.

## Actual knowledge and production remain pending

The real vault was clean at `a2a9ae4`, with six tracked Markdown files. Its approved material has platform scope; no approved project-scoped notes qualify for the single-project pilot. No status, classification or scope was changed and no private M4 content was exported. The canonical registry was read without modification and its mapping saved privately.

The local endpoint cannot serve the hosted production application. Before activation, select the production host/private-network route, obtain eligible owner-approved project knowledge and validate the intended processing mode. No production environment, migration, merge or private vault import was performed.

Sources: release-matched OpenViking configuration/authentication and Ollama OpenAI-compatibility documentation.
