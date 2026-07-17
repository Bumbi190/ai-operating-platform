# Integration Notes — Atlas Knowledge Edition v1.0

## Why this package is integrated

The Atlas Knowledge Edition is the structured, machine-retrievable form of the Executive
Intelligence doctrine (Canonical v1.0 / Professional Edition v1.0). Integrating it into the
repository as a versioned knowledge source gives the team a single, hash-verified, reviewable
home for that knowledge: chapter markdown, section/block records, indexes, relationships,
governance rules, a deterministic retrieval router, source references, and validation
reports. Versioning it in the repo makes provenance auditable and future ingestion work
reviewable through normal PR flow.

## What this integration does

- Places the approved **Validation Candidate 2 Clean** package under
  `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/package/` as a controlled,
  byte-identical copy.
- Adds wrapper documentation: this file, `README.md`, `RUNTIME_INGESTION_STATUS.md`,
  `SOURCE_PROVENANCE.md`, and `REPO_INTEGRATION_MANIFEST.md`.
- Re-verifies package integrity from the repo copy (checksums, file count, retrieval tests).

## What this integration explicitly does NOT do

- Does **not** activate runtime ingestion.
- Does **not** create embeddings.
- Does **not** create or connect a vector database.
- Does **not** activate a production retrieval pipeline.
- Does **not** change Atlas runtime code, permissions, or authorization.
- Does **not** change schema, migrations, Supabase, Vercel, or deployment.
- Does **not** modify Canonical v1.0, the Final Professional Edition, the SSD archive, or the
  Cowork Candidate/Clean packages.
- Does **not** assert that any described capability is implemented;
  `implementation_status` remains `unknown_not_verified_in_this_package`.

## Future steps required before Atlas runtime uses this package

Runtime consumption of this knowledge is a **separate future phase**, gated behind its own
pull request(s) and review. At minimum, that future work must:

1. Design the ingestion approach (what runtime reads, when, and under what isolation) as an
   explicit architecture decision.
2. Decide embeddings vs. the existing deterministic router; if embeddings/vector DB are
   introduced, specify storage, refresh, and provenance.
3. Define the retrieval pipeline's production activation, guardrails, and observability.
4. Preserve the authority model: retrieval must grant **no** execution rights; human
   authority, governance, approval gates, and project isolation continue to apply.
5. Keep `implementation_status` honest — only claim implementation that is actually verified
   in the runtime.
6. Land as a distinct, reviewed PR/phase separate from this documentation integration.

Until such a PR is merged, this directory is documentation only.
