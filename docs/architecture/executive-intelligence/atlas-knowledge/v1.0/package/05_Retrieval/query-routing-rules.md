# Query Routing Rules (deterministic) — ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN

Implemented by `Build/query_atlas.py`. Deterministic token/phrase scoring over the indexes and the
documented term lexicon (`term-lexicon.json`). No embeddings, no vector DB, no model.

## Scoring weights

| Signal | Weight |
|---|---|
| query token in section TITLE | 4.0 each |
| concept phrase present in title | 10.0 |
| lexicon title-term in title | 6.0 |
| lexicon canonical anchor section | 9.0 |
| concept-index posting membership | 3.0 |
| project-index posting membership | 4.0 |
| authority-class alignment | 2.0 |
| query token in body (≥4 chars) | 0.25 each (cap 2.0) |
| chapter target boost | 3.0 |
| "Purpose of This Chapter" (non-purpose query) | −3.5 |

Exact section-ID (e.g. `18.80`, `FM.2`) short-circuits to that record. Ties break by canonical order.
`min_confidence = 6.0` → `no_confident_match`; top-2 within `1.5` across different chapters → `ambiguous`.

## Warning-flag rules

| Query tag | Flag |
|---|---|
| always | `IMPLEMENTATION_STATUS_UNVERIFIED` |
| authority | `AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED` |
| external_action | `EXTERNAL_ACTION_NOT_EXECUTION_AUTHORITY` |
| autonomy | `AUTONOMY_NOT_SELF_GRANTED` |
| approval | `APPROVAL_GATE_APPLIES` |
| maturity | `CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED` |
| stage_scope | `STAGE_SCOPE_IS_ARCHITECTURAL_TARGET` |
| emergency | `EMERGENCY_CONTROL_HUMAN_GOVERNED` |
| knowledge_evidence | `KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY` |
