# Atlas OpenViking – project-only retrieval foundation (inactive, P1)

**Scope:** isolated, read-only source validation and identifier-only retrieval library. **Not a live Atlas memory connection.**

OpenViking's old [draft PR #343](https://github.com/Bumbi190/ai-operating-platform/pull/343) spans 62 files and an outdated October base across chat, model providers, cost controls and memory. The first five-note project relevance evaluation reported **11/20** correct first sources for OpenViking versus **16/20** for the lexical baseline. A separate eight-note platform set reported a better but non-transferable result. A wholesale merge or runtime activation would be unjustified.

## What is now staged

- `apps/web/lib/atlas/openviking/corpus.ts` verifies the existing, immutable `knowledge-projection-v1` manifest and exact JSONL bytes. It accepts only one canonical **project** UUID/slug, validates hash/count/path/classification/scope and rejects mixed platform/foreign project envelopes, duplicates, stale/tampered contents and disallowed folders.
- `apps/web/lib/atlas/openviking/client.ts` defines only one network operation: `POST /api/v1/search/find` against a trusted HTTPS endpoint (HTTP allowed only on loopback). A server-side setting `ATLAS_OPENVIKING_MODE=read` and an API key are required for a future caller to obtain a connection config. No arbitrary URI/method write endpoint is exposed.
- `apps/web/lib/atlas/openviking/retrieve.ts` additionally requires the caller's **fresh server-verified** authorized project IDs before querying. The remote index response is used **only for exact known identifiers**, never remote document bodies, arbitrary cross-project links, agent instructions or stale snapshot references. Evidence text comes exclusively from the verified corpus, capped at eight excerpts / 1,200 characters each / 6,000 characters aggregate.
- `apps/web/lib/qa/atlas-openviking-project-readonly.test.ts` and the dedicated CI workflow: deterministic offline evidence tests without real credentials, anti-skip assertion and whole-web TypeScript check.

## Deliberately not delivered

- **No Atlas chat integration or M4 import**. No new tools available to the model.
- No publication, upload, indexing, cron job, file writes, delete/restore, Notion sync or Obsidian vault crawl.
- No cross-project or platform-wide retrieval; platform scope remains a separate security decision.
- No actual OpenViking server, API key, endpoint or paid model configured in Vercel.
- No automatic fallback to stale memory or a different project when remote search fails.
- No claim that a green mocked HTTP test proves compatibility with the latest OpenViking server version.

## Separate approval sequence before use

1. Prepare an **approved, project-specific corpus** through the existing Knowledge Projection Policy v1 (human editorial approval, secret scan, explicit scope, canonical project UUID and pinned source revision). No raw Notion or arbitrary chat history should be published merely because it is readable.
2. On a separate isolated service, validate the OpenViking version and actual `/api/v1/search/find` response format. Do not broaden URI acceptance to deal with an unsupported response: pin the reviewed server release and update its explicit test contract. Official reference: <https://docs.openviking.ai/en/api/06-retrieval>.
3. Evaluate **first-source correctness and abstention** against the lexical provider on a representative held-out set that includes named companies, cross-project collisions, ambiguous asks and revoked documents. Do not replace the lexical provider while source correctness remains worse.
4. Review project identity/ACL, networking, secret handling and licensing separately; require exact-head GitHub safety workflows and an operator-approved cutover. User-facing excerpts must remain source-attributed and action-inert.
5. Only then propose a new, explicitly gated runtime consumer in a separate PR. This P1 code cannot affect production answers by itself.

**Safe rollback:** No flags were enabled and no deployment resources were created by this PR; revert its code if needed. Existing Notion P1 remains the active knowledge connector, while M4 operational events and Graphify code relationships remain separate systems.
