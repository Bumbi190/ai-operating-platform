# Atlas OpenViking pilot

This branch adds a read-only integration. It does not activate a production server or modify production environment variables.

## Components and ownership

- M4 remains the operational event/memory source; its existing event writers and SQL are unchanged.
- Obsidian remains curated knowledge. Private M4 memory is never copied into the vault.
- OpenViking selects document identifiers. Atlas renders text from the deployed, hash-verified publication artifact, never from remote summaries.
- The central chat consumes the recall block only on its full-context path. Fast/static conversation paths are unchanged.
- The local vault adapter and operator projection source remain unreachable from the runtime graph.

Target API contract: OpenViking v0.5.0. Confirm API compatibility and the selected release license before production. No package code is copied into Omnira and no npm dependency is added.

## Server-side environment

| Variable | Default / meaning |
|---|---|
| ATLAS_RECALL_PROJECT_ID | Required canonical UUID for the single pilot project. |
| ATLAS_RECALL_PROJECT_SLUG | Required canonical slug matching that project and the publication. |
| ATLAS_CHAT_MEMORY | OFF; only the exact value 1 enables chat M4 reads. |
| ATLAS_MEMORY_RECALL | Existing M4 flag; must equal 1 for actual recall. |
| ATLAS_MEMORY_INJECT | Existing M4 flag; must equal 1 for M4 text to reach the chat. |
| ATLAS_OPENVIKING_MODE | OFF; shadow searches without injecting, on searches and injects. Other values are OFF. |
| ATLAS_OPENVIKING_URL | Private HTTPS endpoint, or loopback HTTP for local testing. No credentials/query in URL. |
| ATLAS_OPENVIKING_API_KEY | User-scoped server credential, never a public browser variable or root-management key. |

The configured pilot project never grants access. The existing fresh allowedProjectIds is checked on every request. A different active project view suppresses this pilot recall. No cross-request result cache is introduced.

Keep the knowledge server private and use account/credential boundaries appropriate for the pilot. A directory prefix is not an OpenViking authorization policy. In a shared OpenViking deployment, configure the project's account/ACL as well as Omnira's runtime checks.

## Set up an actual service

Use a separately managed, persistent OpenViking server. The official Python installation can be version-pinned with:

    uv tool install openviking==0.5.0
    openviking-server init

Select the embedding and processing model providers explicitly. These may send data outside the server and incur usage charges. Set the provider spending ceiling before importing real documents. Do not assume that local storage means local model inference.

For server deployment and user-key setup, use the release-matched official guides:
- https://docs.openviking.ai/en/guides/03-deployment
- https://docs.openviking.ai/en/guides/04-authentication
- https://github.com/volcengine/OpenViking/releases/tag/v0.5.0

The checked-in publication is deliberately empty. Merely enabling an environment variable cannot upload the vault.

## Prepare an approved publication

Work on an isolated branch. Obtain project slug/UUID mapping from the canonical project registry and put the trusted map in a local JSON file, for example under this task's .superpowers workspace.

The vault must be its own clean Git working tree. Do not change status, scope or classification to make more documents qualify. Preparation refuses dirty/unversioned vaults, unreadable sources, source drift and invalid output. Every included note must belong to the captured Git commit and match its Git-normalized content; eligible ignored notes cause refusal. Ineligible ignored notes are still evaluated by the exhaustive policy pipeline.

From the repository root:

    npm run openviking:prepare --workspace=apps/web -- --vault=<absolute-vault-root> --project-map=<absolute-map.json> --project=<canonical-slug>

The default output, relative to apps/web, is data/openviking/corpus.json. An explicit --out may be used for a candidate copy. Output inside the vault is forbidden.

Only approved, public/internal, explicitly project-scoped, secret-scanned records belonging to that project are included. Platform notes and other projects are omitted. More than 128 records or an oversized corpus is an explicit error, never a silently truncated export.

Review the generated diff and keep the metadata receipt, including the vault commit. The existing knowledge-projection-v1 identity is preserved. Source bodies are publication copies; canonical repository files retain authority.

## Synchronize and confirm readiness

Set the private endpoint and user key in the operator process without putting the key into a command argument. Then:

    npm run openviking:sync --workspace=apps/web -- --apply

For an explicitly selected candidate artifact:

    npm run openviking:sync --workspace=apps/web -- --apply --corpus=<absolute-candidate.json>

A temporary upload and explicit destination are used for each document. The command polls its task to completed. Acceptance or queue submission is not success. A changed destination, failed job, timeout or malformed response exits nonzero and emits no readiness receipt.

The default processing mode generates semantics and vectors. --vectors-only explicitly skips VLM semantic processing for a limited retrieval/transport probe; it is not a test of generated summaries.

A successful receipt contains snapshotId, documents and ready=true. Preserve it with the reviewed artifact. Runtime requires the same snapshot ID and exact document URI; unrecognized or stale hits are discarded.

## Shadow and limited activation

1. Deploy the reviewed artifact and branch integration through the normal release process.
2. Configure the pilot identity and private endpoint/key.
3. Start with ATLAS_OPENVIKING_MODE=shadow. Logs report only project ID, snapshot ID and hit count, not source text.
4. Compare retrieval against the same corpus using the existing approach. Use the same generation model, prompts and context budget.
5. After a positive evaluation, change the mode to on for the pilot.
6. Enable ATLAS_CHAT_MEMORY=1 only with the existing M4 recall/injection flags and verified event data.

Knowledge retrieval and M4 reads are independent. OpenViking network reads have a 1.2-second deadline; M4 contribution has a 750-ms wait budget. Failure contributes no extra prompt text and does not fail the chat.

## Corrections, removal and cleanup

Changing a source requires a new reviewed artifact and synchronization. Local file imports do not continuously watch Obsidian.

Deploying an artifact without a source prevents its text from being served even if the old remote index returns it. An empty valid publication revokes all knowledge for the pilot.

After the replacement is deployed, an explicit previous artifact can authorize cleanup of exactly the previous snapshot subtree:

    npm run openviking:sync --workspace=apps/web -- --apply --prune-previous=<absolute-previous-corpus.json>

The command refuses a previous artifact belonging to another project. It never deletes the whole account, project or vault. Keep other applications on separate resource roots and credentials.

## Rollback

Set ATLAS_OPENVIKING_MODE=off and ATLAS_CHAT_MEMORY=0, or roll back the branch deployment. Existing chat history, action memory and live data remain usable. Rollback does not delete canonical M4 events or edit the vault.

## Local service verification

An explicit real-server vectors-only probe passed on 2026-10-15 using local Qwen3 embeddings and three synthetic Swedish notes. It verified completed indexing, expected first hits, original-text injection through the Atlas seam, denied project scope, HTTP 401 without a key, foreign-account isolation and cleanup. The real v0.5.0 leaf is <snapshot>/<id>.md/<id>.md; the ingestion root receipt names its parent folder. Runtime whitelists only the exact leaf.

See [local pilot evidence and operating limits](../../infra/openviking/README.md). The initial semantic-processing probe exceeded its deadline; switching the processing model to qwen3:4b-instruct resolved unwanted reasoning output. A strengthened semantic-and-vectors probe then completed indexing and verified readable L0/L1 artifacts for all three synthetic documents. Local model inference requires an explicit GPU profile and a manually armed hardware watch. The owner's separate local Atlas preview has a 30-minute guarded test window and does not activate production.

## Validation limits

Regular CI uses loopback HTTP fixtures and temporary vaults. The optional live-service test is skipped unless explicitly enabled. The successful three-note vector probe is not a production relevance benchmark or proof of improvement over the prior retrieval system. Production connectivity, eligible approved project knowledge, active production flags and production memory volumes remain unverified. Those checks precede activation.
