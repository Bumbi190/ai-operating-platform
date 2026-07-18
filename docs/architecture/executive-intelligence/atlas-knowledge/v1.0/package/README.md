# Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2

Status: **ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN** (not repo-integrated, not production-ingested).

A machine-readable, traceable, retrieval-optimized representation of the locked **Canonical v1.0** text.
Not a new book, not new doctrine. Grants no execution authority.

- canonical_book_sha256: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`
- final_pdf_sha256: `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2`
- 32 chapters · 6705 sections · 55840 blocks · 4 front-matter sections · 17 active diagrams · 10 Parts
- Retrieval tests: 56 run against the real router `Build/query_atlas.py`, 56 passed.

## Absolute knowledge rules

- Canonical target architecture is not the same as implemented runtime.
- Repository, schema, runtime, and deployment are authoritative for what is actually implemented.
- Documents, Memory, Knowledge, graph objects, or model outputs never create authority.
- Human authority, governance, approval gates, and project isolation still apply.
- A recommendation does not automatically become a decision.
- A decision does not automatically become an approval.
- An approval does not automatically become reusable policy or autonomy.
- Knowledge is evidence and context, not execution authority.
- The Atlas Knowledge Edition never grants Atlas the right to act outside existing runtime authority.

## Hash schema (one meaning per field, identical for chapters and front matter):
- `canonical_book_sha256` — ALWAYS the compiled canonical book: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`.
- `canonical_source_file_sha256` — the chapter's separate canonical source-file SHA-256; `null` for front matter
  (front matter has no separate source file).
- `record_text_sha256` — SHA-256 of this record's exact canonical text.
- `section_text_sha256` (sections) / `block_text_sha256` (blocks) — documented aliases of `record_text_sha256`.
The ambiguous field `canonical_sha256` from Candidate 1 is removed.

## Reproducible build
```
python3 Build/build_atlas.py --workspace-root "<path>/executive-intelligence" --output-dir "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean"
python3 Build/query_atlas.py --package-root "<path>/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean" "Who has ultimate authority?"
```
No embeddings, no vector database, no model, no git, no network. Requires system `pdftotext`.

Every `Build/*.py` sets `sys.dont_write_bytecode = True`, so running the runner/router creates no
`__pycache__/`. The package contains no transient test files, no `__pycache__/`, and no `*.pyc`.

## Layout
`01_Canonical_Knowledge/` (chapters + JSONL) · `02_Indexes/` · `03_Relationships/` · `04_Governance/` ·
`05_Retrieval/` (schema, lexicon, routing, citation) · `06_Source_References/` · `07_Validation/` ·
`Build/` (build_atlas.py, query_atlas.py, run_retrieval_tests.py, test_fixtures.jsonl) · `ATLAS_KNOWLEDGE_EDITION_MANIFEST.md`

Every canonical section carries `implementation_status: unknown_not_verified_in_this_package`.
