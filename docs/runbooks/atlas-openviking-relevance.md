# Local relevance diagnostic and approved five-source publication

Date: 2026-10-15. Integration branch: codex/atlas-openviking-integration-20261015. Source proposals were reviewed at 07b8e68e4b41a6af9402fadf819eb5beba73ce9b. Production remains OFF.

## Current publication

The owner approved the exact four proposed bodies, approved editorial status, internal classification and project scope omnira-selftest at **14:43:13 Europe/Stockholm**. They were added to the existing dedicated vault branch, alongside the original approved note.

- Vault branch: codex/atlas-openviking-approved-note-20261015.
- Vault commit: b6b7c848b30208018c433fb9a4efff48b7c2abc3; clean.
- Vault main remains a2a9ae428ac84227ae845dd96456f0abc99b61ad.
- Active local snapshot: e320719db950c432e2f85f49d3ec2a5079790ebc944937285e1c33fbdaf04de2.
- Five eligible approved internal sources; no existing curated note was relabeled.
- The prior one-note snapshot 88113d02... remains indexed and its publication is retained privately for rollback.
- The application's checked-in default corpus remains empty. No production flags, migration or merge changed.

| Approved source record | Actual vault path | Topic |
|---|---|---|
| [Publicering](./atlas-openviking-next-corpus/publicering.md) | 60 Memory/omnira-selftest-publicering.md | Updates, completed indexing and revocation |
| [Minneslager](./atlas-openviking-next-corpus/minneslager.md) | 60 Memory/omnira-selftest-minneslager.md | M4, curated knowledge and source authority |
| [Felsökning](./atlas-openviking-next-corpus/felsokning.md) | 60 Memory/omnira-selftest-felsokning.md | Local environment, warmup and new conversations |
| [Projektåtkomst](./atlas-openviking-next-corpus/projektatkomst.md) | 60 Memory/omnira-selftest-projektatkomst.md | Fresh access checks, modes and fallback |

The record files retain their historical next-corpus directory name. Their approved bytes match the normalized committed vault sources, with hashes in the [publication receipt](../../infra/openviking/publication-five-source-20261015.json). The original fifth source is recorded in [the first approved note](./atlas-openviking-obsidian-draft.md).

## Five-source retrieval comparison

The existing operator-only Obsidian provider (createVaultKnowledgeProvider / scoreDocument) and current OpenViking retrieval (findKnowledge) searched exactly the same five source IDs and normalized original bodies. This does not compare against a former production Atlas chat path.

Twenty answerable questions and four unanswerable questions, with expected source sets, were locked **before indexing**. Multiple valid sources were allowed where the original overview overlaps a specialized note. Each question ran three times per method, alternating method order. Both used a limit of eight results; OpenViking kept its 1,200 ms deadline. No answer model was called, and native excerpt budgets differ, so answer quality and prompt efficiency are not compared.

| Observation | Existing lexical provider | OpenViking |
|---|---:|---:|
| Answerable questions with an accepted first source on all three runs | 16/20 | 11/20 |
| Answerable questions with an accepted source anywhere in results on all three runs | 20/20 | 20/20 |
| Unanswerable questions still returning sources on all three runs | 4/4 | 4/4 |
| Retrieval runs | 72 | 72 |
| Median measured latency | 12 ms | 36 ms |
| Nearest-rank p95 | 16 ms | 83 ms |
| Maximum | 17 ms | 145 ms |

**The relevance gate did not pass.** OpenViking ranked below the existing lexical provider on this diagnostic. For example, a temperature-limit question ranked the project-access note ahead of the note containing the actual 80 C guard. All needed originals were available in the current small result sets, but this does not establish good ranking, useful abstention or improved generated answers.

These five short descriptions all concern the local pilot. Questions were authored after reading them, so this is not a blind or general project benchmark. A returned source for an unanswerable question is a retrieval false positive, not proof of a fabricated chat answer. No threshold, query rewrite, model, request budget or runtime ranking was changed to fit these cases.

Full expected sets, all scores/timings and twenty prompt checks: [five-source validation](../../infra/openviking/validation-five-source-20261015.json).

## Publication, scope and hardware checks

Synchronization completed in vectors-only mode before the artifact was atomically selected locally. Automatic L0/L1 was temporarily disabled during synchronization; the original private semantic configuration was restored after verification. Generated summaries were not evaluated in this run.

All twenty answerable queries passed the actual Atlas prompt seam: approved original text, a relevant source present, canonical pointers and the current snapshot, within the existing aggregate text budget. Denied membership, another project, missing identity, off mode, shadow injection, unavailable service and an empty valid publication all contributed no knowledge. The prior snapshot remained separately searchable but was absent from current prompts. Login returned 200; unauthenticated chat returned 401.

The hardware watch remained active and reached a maximum of **38 C**, below the unchanged 80 C guard. The two GPU services were stopped after this automated run and the original semantic configuration restored. A subsequent manual session, if started, has its own existing thirty-minute watch; this receipt describes the completed automated run.

The owner confirmed an authenticated answer for the earlier one-note snapshot at 14:17. A five-source authenticated UI answer has not yet been observed. Start Atlas minnestest and use a **new** local Atlas conversation. Ask: **Vad skiljer M4-minnen från kunskapen i Obsidian, och kan en anteckning godkänna åtgärder eller ändra budgeten? Ange källan.** Expect the memory-layers note and current snapshot prefix e320719d.

## Earlier one-source diagnostic

Before this approval, one source was active. Twelve questions ran three times per method: both methods found the source for 8/8 answerable questions and returned it for 4/4 unanswerable questions. Median latency was 8 ms versus 41 ms; p95 13 ms versus 368 ms. That diagnostic could not measure selection among competing documents and established no quality improvement.

OpenViking's answerable and unanswerable scores overlapped, so a single threshold could not separate those measured cases without dropping a relevant hit. Historical receipt: [one-source comparison](../../infra/openviking/validation-relevance-20261015.json). The [draft eligibility receipt](../../infra/openviking/validation-next-corpus-20261015.json) records the pre-approval state of the four new sources; it is not their current status.

## Next relevance work and production gate

Ranking and unsupported-query handling need improvement before recommending production enablement. Evaluate a proposed ranking change against separately locked questions, with a larger representative owner-approved corpus and owner-authored questions that were not used to tune retrieval. Keep the same original-text authority, fresh access checks and request budgets.

The production host/private-network route is still undecided and unverified. The stationary PC's loopback endpoint remains local only. No production activation or merge is authorized by this publication.
