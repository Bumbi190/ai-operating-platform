# Atlas OpenViking pilot integration

Date: 2026-10-15
Authorization: André requested implementation now, on an isolated branch and worktree.
Base: 910376b2eb485f136e1b36073f08e7788f0be2d6.
Status: implementation specification for this branch; production activation remains separate.

## Outcome

Atlas can receive project-scoped M4 recall and use OpenViking to select approved Obsidian knowledge. The existing event store remains authoritative for operational memory. The vault remains curated knowledge. No automatic session capture, model-generated decision promotion, or vault writes are introduced.

## Boundaries

- Work only on codex/atlas-openviking-integration-20261015 in its dedicated worktree.
- No schema migration, production variable change, merge, or production deployment.
- No new npm dependency.
- All runtime features default OFF, with exact opt-in values.
- One configured pilot project UUID and canonical slug; access comes from the existing server-resolved allowedProjectIds on every request.
- A client view can narrow scope but cannot widen it.
- M4 writes and existing recall/injection flags remain unchanged. Add a chat-specific opt-in. Historical decision text remains evidence and never grants authority.
- OpenViking is a search index. Render original approved documents from a versioned publication artifact; never trust remote summaries, supplied bodies, metadata or source authority.
- Production imports may reach a runtime corpus reader, but must not reach the local vault walker/provider or operator projection source.
- Existing publication eligibility and secret gates apply before any network request.
- A source removed from the deployed artifact cannot be recalled even if a stale remote index returns it.
- Timeout, malformed response, missing configuration and empty scope return no additional context. Do not fail the chat or log private content.

## Publication artifact

Use the existing knowledge-projection-v1 manifest and exact documents.jsonl bytes in a project-scoped corpus artifact. Preserve its snapshot identity and verify hashes, count, record shape and scope at runtime. Empty artifact is the checked-in default.

The operator preparation command requires an explicit vault root, trusted project map and selected project slug. It lists through the existing exhaustive projection source, revalidates the documents it reads, refuses changed/unreadable sources, and writes only eligible records for that project. It never alters metadata or the vault. Output is a generated deployment artifact, not a new canonical original.

Remote resource URIs include the project UUID, snapshot ID and path-derived record ID. OpenViking returns identifiers and scores only. The runtime maps exact identifiers back to the validated publication artifact and applies bounded excerpts and aggregate budgets.

## Transport

Dependency-free authenticated HTTP client, HTTPS except loopback development, no URL credentials or redirects, bounded response sizes and deadlines. Use the documented find endpoint with an exact snapshot subtree, resource context and detail level. No user-provided URL or URI is accepted.

Operator sync uploads only prepared artifact documents, uses explicit destinations and checks the returned destination. It follows task IDs to completion; queue acceptance is not readiness. Sync is explicit and never runs during an Atlas request. Superseded resources are cleaned using an explicit prior-artifact receipt, never a broad unbounded delete.

Target external contract: OpenViking v0.5.0. Validate against that release; documentation on main is not proof of release compatibility.

## Runtime

A small chat recall module combines independently bounded M4 and knowledge blocks. It checks the server allow-list before either read, uses a bounded deadline, renders data with provenance and precedence instructions, and is called only in the existing full-context chat path. Fast/static conversation behavior is preserved.

OpenViking supports off, shadow and on. Shadow may retrieve but contributes no prompt text. M4 chat injection additionally requires ATLAS_CHAT_MEMORY=1 and existing ATLAS_MEMORY_RECALL/ATLAS_MEMORY_INJECT gates. Configured project identity is independent of OpenViking availability, so the two paths can fail independently.

## Validation

Tests must cover default off, unauthorized/empty/revoked scope, a different active project, malicious or stale URIs, untrusted remote content, corrupt artifact, blocked classification, canonical pointers, duplicate results, budgets, timeout, failed ingestion and the real chat call site. Preserve authority and filesystem boundaries with explicit graph tests.

Use a real local HTTP fixture for the connector rather than mocking its implementation. Run the relevant memory/knowledge regression suites, typecheck and lint, then the project suite. Record baseline failures separately. A live semantic quality improvement is not claimed without a real embedding-backed evaluation.

## Activation handoff

Document environment variables, preparation, sync, readiness, rollback and deletion. A production operator must select the endpoint, credentials, model provider and spending ceiling and review the selected release license before live activation. This branch can be completed and reviewed without creating paid infrastructure.
