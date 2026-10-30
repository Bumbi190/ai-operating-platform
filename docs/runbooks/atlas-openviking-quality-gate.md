# Atlas OpenViking – quality gate and historical replay (28 October 2026)

**Status: Evaluation-only; OpenViking is OFF in the running Atlas chat.**
No automatic publication, recurring indexer, Notion ingestion, cloud reranker,
Atlas M4 writer, new model or OpenViking credentials are introduced here.

## Why this is necessary

The isolated read-only project parser and identifier-only search foundation
were merged in [#590](https://github.com/Bumbi190/ai-operating-platform/pull/590).
The old broad [#343](https://github.com/Bumbi190/ai-operating-platform/pull/343)
cannot be merged wholesale and did not pass its original retrieval-quality gate.

A frozen October 15 receipt was previously captured against **the same five
approved local source IDs and original bodies**: 20 answerable and 4 unsupported
queries, repeated three times for each method. Neither an answer model nor
current production chat participated.

| Historical retrieval measurement | Existing lexical provider | OpenViking |
|---|---:|---:|
| Accepted first source on all 3 runs | 16/20 | 11/20 |
| Accepted source anywhere on all 3 runs | 20/20 | 20/20 |
| Unsupported questions returning some source | 4/4 | 4/4 |
| Median search duration | 12 ms | 36 ms |
| P95 search duration | 16 ms | 83 ms |

OpenViking's first-source accuracy was **25 percentage points lower** and its
median retrieval latency **three times higher**. Returning a source for an
unsupported question is a false-positive retrieval signal; it does not by
itself establish whether the language model would hallucinate an answer.

**This is NOT an independent holdout:** the questions were authored after
reading the pilot sources. The small, same-topic set is not representative
of three separate Omnira products. Server versions, network paths and
production access from that old local run have not been reverified.

Canonical original evidence, retained on the unmerged pilot branch:
`infra/openviking/validation-five-source-20261015.json` from #343.

## Safe, reproducible comparison

The `apps/web/lib/qa/fixtures/atlas-openviking-five-source-history.json`
fixture is derived directly from the historical receipt by replacing
all source paths with deterministic `doc-XX` aliases and replacing all
queries with `case-XX` IDs. It contains only the expected aliases, ordered
ranked aliases and latencies for each recorded run. **No note body, search
question, absolute vault path, customer information or credentials** are copied
into the current main branch. Replaying these already-observed ranks is not a
new live retrieval benchmark.

To reproduce the historical verdict in an operator checkout from `apps/web`:

```bash
node --import tsx scripts/openviking-quality-evaluate.ts \
  --input=lib/qa/fixtures/atlas-openviking-five-source-history.json \
  --report-only
```

The command prints aggregate metrics and explicit blocker codes, without
source titles/text or original queries. The default (no `--report-only`)
exits non-zero if the evidence fails the gate. The dedicated
`Atlas OpenViking Project Read-Only Boundary` CI checks that this historical
result **remains NO-GO** and that both exact test suites ran without skips.

## Minimum criteria for a NEW owner-reviewed candidate

The pure evaluator (not a runtime router) requires all of the following,
declared before a new benchmark is run:

- Same reviewed, immutable original source snapshot for BOTH lexical and
  OpenViking; publication and project-authorization gates remain independent.
- A held-out set of independently authored, predeclared questions (not
  questions used to tune an OpenViking embedding or ranking rule).
- Current OpenViking search protocol/version independently tested; an
  old mocked response is not a protocol verification.
- At least **8 reviewed source IDs**, **30 answerable questions**,
  **10 unsupported questions** and **8 foreign-project rejection cases**.
  Every query must have exactly three recorded runs for each provider.
- OpenViking accepted first-source correctness on every repetition must be
  **at least 85% and no lower than lexical**. Accepted source anywhere in the
  results must be no worse than lexical.
- **Zero** unsupported cases returning evidence and **zero** foreign-project
  cases returning evidence. OpenViking P95 retrieval duration cannot exceed
  **1,200 ms** in the evaluated operating conditions.
- Unrecognized source IDs, changed labels, missing runs, skipped cases,
  invalid timings or unsupported schema make the entire receipt invalid.

The thresholds above are an explicit **pilot quality review policy**, not a
claim that they are a universal scientific standard or statistically sufficient
for safe generated answers. Reevaluate thresholds only in a separate, reviewed
design change, never after seeing a failure on the same hidden test questions.

Passing all of these creates
`qualityEligibleForManualReview: true`, **never**
`runtimeActivationAuthorized: true`. Real runtime activation requires
independent owner signoff, permission/revocation testing and answer-level
attribution tests (especially Kareby Bil vs EVExperten).

## Future operator-held-out receipt

Use a **local, private** evaluation workspace for original approved notes and
questions. Export only stable, anonymous source IDs, matched expected IDs,
three ranked response lists and latency values per query with a project
authorization fixture. Never export raw Obsidian/Notion text, customer email
threads, tokens, entire private knowledge JSONL or confidential metadata.

The dataset schema is implemented in
`apps/web/lib/atlas/openviking/quality-evaluation.ts`.
The operator can run:

```bash
node --import tsx scripts/openviking-quality-evaluate.ts \
  --input=<local-review-only-receipt.json>
```

No new remote model request or local GPU process is implied by this command.
Until a new representative blind comparison passes, **keep the existing
Notion reader and lexical baseline, and leave OpenViking unattached to Atlas
chat**. Rollback of this gate affects only offline evaluation artifacts.
