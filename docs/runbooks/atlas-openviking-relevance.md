# Local relevance diagnostic and next corpus proposal

Date: 2026-10-15. Integration branch: codex/atlas-openviking-integration-20261015. Reviewed source revision for this diagnostic: e0c6c753ab604d1d064c2d2eb2354b52c45e696b. Production remains OFF.

## What was measured

The existing local Obsidian provider (createVaultKnowledgeProvider / scoreDocument) and the current OpenViking runtime retrieval (findKnowledge) searched the same single owner-approved project note. The provider's project-filtered source IDs and normalized original body were checked against the deployed publication first. The vault remained clean at c1980d493be6fd3fa8039340d71dae7da4ef6c0b, and the active snapshot remained 88113d0204f2abd58c3ff72d1d3acedd122442329a163a026d0a271aefb99d7c.

Twelve questions were declared before measurement: eight answerable and four without an answer in the source. Each ran three times per method, alternating method order. Both methods used a maximum of eight results; OpenViking retained its 1,200 ms deadline. No answer model was called. This compares retrieval with the existing operator-only vault provider, not a previous production Atlas chat path. Native excerpt limits differ, so answer quality and prompt efficiency are not compared.

| Observation | Existing lexical provider | OpenViking |
|---|---:|---:|
| Answerable questions with correct first source on all three runs | 8/8 | 8/8 |
| Unanswerable questions still returning the source on all three runs | 4/4 | 4/4 |
| Retrieval runs | 36 | 36 |
| Median measured latency | 8 ms | 41 ms |
| Nearest-rank p95 | 13 ms | 368 ms |
| Maximum | 14 ms | 471 ms |

The diagnostic completed successfully; this is **not a successful relevance gate**. One document cannot measure discrimination among competing sources. Questions were authored after reading it, so this is not a blind benchmark. A source returned on an unanswerable question is a retrieval false positive; it does not prove the chat fabricated an answer.

OpenViking's lowest answerable score was about 0.578 and its highest unanswerable score about 0.645. A single threshold cannot separate these measured cases without losing a relevant hit. No threshold, query rewriting, deadline or production behavior was changed to fit this small set.

The independent hardware watch remained active. At measurement completion, the GPU measured 38 C; the existing manual session's maximum was 53 C against its 80 C guard.

Receipt with predeclared queries and all measured results: [validation-relevance-20261015.json](../../infra/openviking/validation-relevance-20261015.json).

## Concrete next corpus, awaiting owner approval

Four short source descriptions are prepared below. They describe the actual pilot's documented behavior at the reviewed branch revision, retaining canonical repository precedence. They are **drafts in this application worktree**, not additions to the actual vault or active publication.

| Proposed note | Intended vault path | Topic |
|---|---|---|
| [Publicering](./atlas-openviking-next-corpus/publicering.md) | 60 Memory/omnira-selftest-publicering.md | Updated sources, completed indexing and revocation |
| [Minneslager](./atlas-openviking-next-corpus/minneslager.md) | 60 Memory/omnira-selftest-minneslager.md | M4, curated knowledge and source authority |
| [Felsökning](./atlas-openviking-next-corpus/felsokning.md) | 60 Memory/omnira-selftest-felsokning.md | Correct local environment, warmup and new conversations |
| [Projektåtkomst](./atlas-openviking-next-corpus/projektatkomst.md) | 60 Memory/omnira-selftest-projektatkomst.md | Fresh project access, modes and bounded fallback |

The proposed approval is limited to these exact four bodies, editorial status approved, classification internal and project scope omnira-selftest, for the guarded local pilot. Each candidate currently says status: draft. Approval would allow copying them to the existing dedicated vault branch, committing a clean revision, preparing and reviewing a five-source publication, synchronizing it with the hardware guard active, and selecting it only in the local preview. It does not authorize a production change or merge.

The actual vault's VAULT_POLICY.md section 4 says: “Only the owner promotes status.” Section 6.7 requires explicit owner authorization before changing status, classification or scope. The previous approval covered the original single note; it did not cover these four new bodies. Existing curated notes and their metadata remain unchanged.

## Acceptance after that approval

- Lock expected source sets for questions about publication, architecture, troubleshooting and project access before inspecting candidate results. Allow multiple valid sources where the original overview overlaps.
- Measure top-source relevance and recall over the same five documents and the same questions with both methods. Keep the current retrieval budget.
- Keep separate questions whose answer is absent, and report irrelevant injection rather than counting every returned document as success.
- Recheck original-text provenance, stale-source exclusion, another project, revoked membership and off/shadow modes.
- Repeat the authenticated local chat check with citations and a new conversation. A production quality claim needs a larger representative corpus and owner questions that were not used to tune retrieval.
- Choose and verify a production-reachable private endpoint before considering deployment. The stationary PC's loopback endpoint is still local only.
