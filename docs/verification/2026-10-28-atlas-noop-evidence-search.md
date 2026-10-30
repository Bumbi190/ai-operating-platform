# Atlas: explicit noOp evidence without losing top-eight search results

**2026-10-28 · Read-only source search · No third-party execution**

## Reproduced issue
A real, authenticated Atlas request asked for noOp placeholders among
Handlarbörsen follow-up workflow references. The actual tool call used
`query = "lead email follow-up placeholder structure metadata"` and
`project = "handlarborsen"`, returning eight normal search hits.
The model accurately reported no observed `noOp` *among those eight*,
but the five-file structure audit already contained three different,
pinned email JSON examples with **6, 12 and 15** noOp nodes. They were
not among the top eight relevance matches.

This is a search/ranking/answer-coverage limitation, not proof that
those other workflows are functional, or that every workflow was reviewed.

## Narrow solution
- The existing `search_external_workflow_references` tool retains the
  same three public inputs (`query`, optional `project`, optional `limit`)
  and the ordinary capped `matches` list (1–8 results, same ranking).
- When the authenticated operator actually asks about `noOp`,
  `platshållare` or `placeholder`, the server supplies
  `includeNoOpAuditExamples:true` to the read-only lookup.
  Model-controlled keyword rewriting cannot accidentally discard the
  operator's stated quality-evidence intent.
- The lookup also accepts those terms directly in a query. The
  supplemental `auditedNoOpExamples` list is only created for such
  requests, and is assembled from the FIVE exact filenames already
  recorded in `source-audit.mjs` at pinned SHA
  `94007c1445d9258a7da116646b79473e7c7c3282`.
- Exactly THREE examples currently qualify; each includes a pinned
  source URL, observed noOp count, full existing `qualityAssessment`,
  `reviewState = unreviewed_reference_only` and
  `runnableInOmnira = false`.
- `auditedNoOpEvidenceScope = five_pinned_json_files_only_not_full_catalog`
  forces the answer to distinguish the known five-file spot check from
  2,060 searchable metadata paths and upstream marketing claims.
- Normal searches have no extra audit payload; the catalog remains
  static, metadata-only, offline at runtime, operator-gated, capped
  and free of credentials, executable workflow JSON or mail actions.

## Tests / deployment gates
- Pure search Vitest tests verify ordinary 8-result cap, supplemented
  audited counts **6/12/15**, exact pinned source URLs, unknown/invalid
  SHA fail-closed behavior, server-side user-intent provenance,
  preservation of `runnableInOmnira=false` and no expansion for
  an unrelated YouTube search.
- The existing offline smoke suite also validates this with only
  local pinned metadata. The existing GitHub CI anti-skip minimum for
  the reference test file is raised (not weakened).
- No new backend permission, subscription, cron, API provider, database
  migration, contact data read, n8n installation or workflow execution.
- PR starts as DRAFT; hosted CI, Vercel and review must pass before
  any merge. After deployment, re-ask the exact previous question.
  The resulting Atlas answer should separate the 8 keyword matches
  from the additional three pinned noOp examples.

**Important:** A noOp count is only a structural warning. It does not
prove that the surrounding JSON flow is safe, licensable, production-
ready or able to send an email.
