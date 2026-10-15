# Atlas OpenViking Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. André authorized implementation in this session.

Goal: Connect read-only project recall and approved knowledge retrieval to Atlas on an isolated feature branch.
Architecture: M4 stays authoritative; a separately published, hash-verified knowledge corpus is searched through OpenViking and rendered locally. Operator publication is separate from request-time reads.
Tech Stack: TypeScript, existing Vitest and Node fetch/FormData, existing snapshot projection, Next.js chat route.
Spec: docs/superpowers/specs/2026-10-15-atlas-openviking-design.md

## Global Constraints

- Dedicated branch/worktree only; no production changes, merge or schema migration.
- No new dependency; features default OFF.
- One explicit pilot project; fresh server allow-list on every request.
- Runtime cannot read the vault or operator projection source.
- Remote results select identifiers only; trusted corpus supplies text and provenance.
- Preserve publication, authority and memory/knowledge separation.
- Follow ingestion to completed, not accepted.

## Review Focus

- A stale index must not reintroduce a removed source.
- An imported path or remote result must not widen project scope.
- An error message must not print private source text or credentials.
- Slow or stuck services must not hold the request open indefinitely.
- Pipeline state must distinguish artifact preparation, queue acceptance and readiness.

### Task 1: Validated corpus and read-only HTTP retrieval

Files:
- Create apps/web/lib/atlas/openviking/corpus.ts
- Create apps/web/lib/atlas/openviking/client.ts
- Create apps/web/lib/atlas/openviking/retrieve.ts
- Create apps/web/data/openviking/corpus.json
- Test apps/web/lib/qa/atlas-openviking.test.ts

Interfaces:
- parseCorpus(input: unknown): PublishedCorpus | null
- findKnowledge(config, corpus, query, signal): Promise<KnowledgeEvidence[]>
- Context evidence includes id, title, path, canonicalPath, snapshotId and bounded content.

- [ ] Write behavior tests for corpus integrity, scope, identifiers, HTTP contract, remote-content rejection and time limits.
- [ ] Run new tests and observe missing-feature failures.
- [ ] Implement the three small modules and an empty default artifact.
- [ ] Run new tests and existing memory/knowledge regressions.
- [ ] Commit the implementation and update the execution ledger.

### Task 2: Operator preparation and synchronization

Files:
- Create apps/web/scripts/openviking-prepare.ts
- Create apps/web/scripts/openviking-sync.ts
- Create apps/web/lib/atlas/openviking/publish.ts (operator-only)
- Test apps/web/lib/qa/atlas-openviking-publication.test.ts
- Modify apps/web/package.json
- Modify apps/web/lib/qa/atlas-knowledge-boundary.test.ts

Interfaces:
- Preparation consumes the existing KnowledgeProjectionSource and builds the existing snapshot format.
- Publication consumes a validated corpus and explicit HTTP configuration, and returns a receipt only after completed tasks.

- [ ] Write failing tests using temporary vaults and an actual local HTTP server.
- [ ] Implement policy-preserving preparation and explicit upload/polling.
- [ ] Test unreadable/drifting documents, scope, denied metadata, failed jobs and bounded waits.
- [ ] Update graph boundaries to permit only the specific operator importers.
- [ ] Commit and record test evidence.

### Task 3: Atlas chat integration and handoff

Files:
- Create apps/web/lib/atlas/context/project-recall.ts
- Modify apps/web/lib/atlas/intelligence/memory-context.ts
- Modify apps/web/app/api/chat/route.ts
- Modify apps/web/lib/qa/atlas-memory-boundary.test.ts
- Modify apps/web/lib/qa/atlas-knowledge-boundary.test.ts
- Test apps/web/lib/qa/atlas-project-recall.test.ts
- Create docs/runbooks/atlas-openviking.md

Interfaces:
- buildProjectRecall(args): Promise<string> accepts the already-resolved identity, allowed project IDs, query, optional view project and DB.
- An optional DB handle is forwarded through the existing M4 bridge for the current request.
- Only the full chat path consumes the resulting data block.

- [ ] Write failing tests for strict gates, denied/revoked scope, shadow mode, fallback and rendered evidence.
- [ ] Add the narrowly scoped integration and explicitly replace the old unwired-chat guard with read-only/authority/opt-in guards.
- [ ] Run targeted tests, typecheck, lint and the whole project suite.
- [ ] Review the whole branch, fix material findings and commit.
- [ ] Push only the feature branch and open a draft PR with exact validation and activation limits.
