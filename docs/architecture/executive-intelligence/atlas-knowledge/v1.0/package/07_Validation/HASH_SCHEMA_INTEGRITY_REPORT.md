# Hash Schema Integrity Report — ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN

Hash schema (one meaning per field, identical for chapters and front matter):
- `canonical_book_sha256` — ALWAYS the compiled canonical book: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`.
- `canonical_source_file_sha256` — the chapter's separate canonical source-file SHA-256; `null` for front matter
  (front matter has no separate source file).
- `record_text_sha256` — SHA-256 of this record's exact canonical text.
- `section_text_sha256` (sections) / `block_text_sha256` (blocks) — documented aliases of `record_text_sha256`.
The ambiguous field `canonical_sha256` from Candidate 1 is removed.

## Verification
- `canonical_book_sha256` constant across all section/block/front-matter records: OK
- `canonical_source_file_sha256` is null for ALL front-matter records/blocks: OK
- `canonical_source_file_sha256` equals the chapter source-file SHA for ALL section records: OK
- `record_text_sha256`/`block_text_sha256` equal SHA-256 of the exact text: OK
- The ambiguous field `canonical_sha256` is not present in any record.

No hash field changes meaning between front matter and chapters.
