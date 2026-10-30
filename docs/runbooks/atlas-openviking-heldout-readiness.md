# Atlas OpenViking – privately prepared held-out retrieval cohort (readiness P3)

**Default: BLOCKED. This stage does not collect retrieval runs, index a source,
contact OpenViking, activate chat tools or export private question contents.**

This operator-only follow-up to [#590](https://github.com/Bumbi190/ai-operating-platform/pull/590)
and [#593](https://github.com/Bumbi190/ai-operating-platform/pull/593)
prepares the **next** genuinely independent quality evaluation. It is not a
retroactive pass of the 2026-10-15 five-note result (OpenViking 11/20 first
sources versus lexical 16/20). The former pilot [#343](https://github.com/Bumbi190/ai-operating-platform/pull/343)
remains a separate conflicted draft, not a candidate to merge wholesale.

## Review prerequisites

1. **Use one approved project corpus** with at least eight distinct
   editorially approved, remotely permitted project notes. The
   `scope: platform` notes are **NOT interchangeable** with
   `scope: project` notes and must never be relabelled to meet a count.
2. Have the operator create a private `knowledge-projection-v1` artifact via
   the existing pinned, approved Knowledge Projection pipeline. Its manifest
   must be independently checked (including source checksum, project mapping,
   classification and secret scan). `parseCorpus` proves consistency of its
   bytes; **it does not independently prove the owner's permission**.
3. A separate person or process not involved in source authoring/tuning must
   write/label a locked question set, with **at least 30 answerable,
   10 unsupported and 8 foreign-project** cases. Use source IDs and explicit
   expected source IDs. Unsupported and foreign cases require **empty**
   expected source IDs. No question may duplicate another question by
   normalized case/whitespace.
4. Record the question digest **before any retrieval**, along with source
   snapshot ID and explicit owner label review. Digest matching only detects
   later content changes; without independent operator records it cannot
   prove question independence, chronology, publication authority, or authorship.
5. **Do not upload** the private plan, publication corpus or original Markdown
   to a public GitHub PR, Notion shared team page, model chat, public Vercel
   storage or an unspecified connector.

## Private input contract

Store the **private** files in an owner-controlled directory outside the
public app checkout, outside the Obsidian Git vault and outside shared folders.
Example (do not commit these files):

- `<operator-private-root>/approved-corpus.json` – validated, already
  operator-reviewed project corpus; may contain private original document text.
- `<operator-private-root>/heldout-plan.json` – exact schema
  `atlas-openviking-heldout-plan-v1` with source IDs, labelled questions,
  explicit attestations and a lock digest. Keep the questions private.
- An independent audit note with the approval and lock timestamp; not a claim
  that hashes alone establish signed authorization.

A project plan is structurally checked against the immutable corpus:
`projectId`, `projectSlug`, `snapshotId` and the **complete exact source
ID set** must match. A changed source, invalid question, duplicate, extra
field, mismatched lock or unreviewed label blocks readiness. The evaluation
module returns **only** `readyForOperatorCaptureReview`, blocker codes,
aggregate counts and a digest; it never emits question text or note contents.

The pure code is `apps/web/lib/atlas/openviking/heldout-readiness.ts`,
with regression tests `apps/web/lib/qa/atlas-openviking-heldout-readiness.test.ts`.
No runtime code imports it.

## Read-only CLI

From the private operator's `apps/web` working directory, with Node.js and
existing repository dependencies available:

```powershell
node --import tsx scripts/openviking-heldout-readiness.ts `
  --private-root="C:/path/to/private-evaluation" `
  --plan="C:/path/to/private-evaluation/heldout-plan.json" `
  --corpus="C:/path/to/private-evaluation/approved-corpus.json" `
  --report-only
```

- In normal mode, a failed check exits **2**; an exactly validated plan can
  exit 0 for **operator capture review only**, never live activation.
- `--report-only` is an explicit local diagnostic allowing a blocked
  candidate to exit 0. The resulting JSON still says
  `readyForOperatorCaptureReview:false`. It cannot toggle a feature.
- The CLI refuses missing inputs, relative paths, oversized JSON and input
  directories overlapping the public Git checkout. It canonicalizes paths to
  reject symlink escapes and does not write any output file.
- No OpenViking access tokens are read; there are no network requests.

## Why further review is essential

The current quality gate [#593](https://github.com/Bumbi190/ai-operating-platform/pull/593)
requires a separate captured receipt containing **three runs of the same
question through BOTH methods** with the same approved snapshot. This P3
readiness tool deliberately does not fabricate result rankings, performance
measurements, labels or `independentlyAuthoredQuestions=true`.
The independent evaluation will only be meaningful after the project has
at least eight real, approved and genuinely distinct sources and the original
questions are locked.

A ready-for-capture decision is **NOT a quality PASS**. The later offline
quality decision `qualityEligibleForManualReview` also never authorizes
runtime activation (`runtimeActivationAuthorized:false`). After a new
representative cohort passes, any live integration still needs separate
review of fresh project authorization, revocation and source attribution
(e.g. Kareby Bil and EVExperten), and explicit owner approval.

## Git/PR preflight and parallel-work safety

Before this separate operator-only task, the repository's read-only
`scripts/atlas/pr-preflight.mjs` was executed on the owner's connected
computer. A first broad wording produced false-positive matches with
unrelated The Prompt and Calendar work; after reviewing these actual PR
scopes, the precise work ID `OV-HELDOUT-20261028` returned
`new_branch_approved` for
`codex/atlas-openviking-heldout-runner-20261028`. The private receipt remains
outside the public checkout. The original checkout had uncommitted changes
and hundreds of parallel worktrees; **none was modified** by this branch.

No more than one purpose-scoped PR is used for this readiness phase. Future
real data collection should continue the same work item where practical,
without writing into an existing agent's dirty/locked worktree.

**Rollback:** Remove this unused operator-only gate from the repository if
required. Atlas Notion and all other runtime memory remain unchanged.
