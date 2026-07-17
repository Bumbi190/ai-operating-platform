# Executive Intelligence — Architecture Knowledge Base

This directory holds the versioned **documentation and knowledge** artifacts for Omnira
Executive Intelligence. It is a knowledge source, not runtime. Nothing here is executed by
the Atlas runtime, and nothing here grants execution authority. The repository, database
schema, migrations, runtime code, and deployment remain the sole authorities for what is
actually implemented.

## What lives here

### 1. Canonical v1.0 (the source doctrine)
- **Title:** Omnira — Executive Intelligence — Canonical Architecture and Operating Doctrine
- **Status:** Approved and locked — Canonical v1.0
- **SHA-256:** `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`
- **Shape:** 32 chapters · 6,705 section IDs · 4 front-matter sections
- The canonical book itself is the authored architecture doctrine. It is the upstream
  source both the Professional Edition and the Atlas Knowledge Edition derive from. The
  canonical book binary is **not** copied into this repo; it is referenced by hash.

### 2. Professional Edition v1.0 (the book)
- **File:** `Omnira — Executive Intelligence — Professional Edition v1.0.pdf`
- **SHA-256:** `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2`
- **Shape:** 1,740 pages · 32 chapters · 10 Parts · 17 active diagrams
- **Status:** FINAL PROFESSIONAL RELEASE
- The typeset, human-readable book. Reference and provenance only — see
  [`professional-edition/v1.0/PROFESSIONAL_EDITION_REFERENCE.md`](professional-edition/v1.0/PROFESSIONAL_EDITION_REFERENCE.md).
  The PDF binary is intentionally **not** committed (large-binary policy); it is referenced
  by hash and its out-of-repo location is documented.

### 3. Atlas Knowledge Edition v1.0 (the knowledge package)
- **Status:** ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN
- **Shape:** 32 chapter files · 6,705 section records · 55,840 block records · 17 active
  diagrams · 56/56 retrieval tests pass · deterministic router · no embeddings · no vector DB
- The machine-structured knowledge derived from Canonical v1.0 and the Professional Edition:
  chapter markdown, section/block JSONL, indexes, relationships, governance rules, a
  deterministic retrieval router, source references, and validation reports.
  See [`atlas-knowledge/v1.0/`](atlas-knowledge/v1.0/).

## Book vs. knowledge package vs. runtime

| Layer | What it is | Authority |
|---|---|---|
| Canonical v1.0 | Authored architecture doctrine (source of truth for *intended* design) | Describes intended architecture; not proof of implementation |
| Professional Edition v1.0 | Typeset book of the doctrine | Human reference only |
| Atlas Knowledge Edition v1.0 | Structured, retrievable knowledge package | Knowledge only — grants no execution rights |
| **Repository / schema / migrations / runtime / deployment** | The actual running system | **Authoritative for what is implemented** |

Document knowledge (including everything under this directory) describes the *intended*
Executive Intelligence architecture. It is **not** evidence that any capability is
implemented. Every record in the Atlas Knowledge Edition carries
`implementation_status = unknown_not_verified_in_this_package`.

## Runtime status

The Atlas Knowledge Edition is repo-integrated as a versioned knowledge source **only**. It
is **not** runtime-ingested: no embeddings, no vector database, no retrieval pipeline active
in production, and no change to Atlas runtime permissions. See
[`atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md`](atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md).
