# Source Provenance — Atlas Knowledge Edition v1.0

This file records the provenance of the integrated package: what it was built from, what was
integrated, and the explicit limits of what this integration verifies.

## Upstream sources (read-only inputs, referenced by hash)

- **Canonical v1.0** — *Omnira — Executive Intelligence — Canonical Architecture and
  Operating Doctrine*
  - SHA-256: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`
  - Verified UNCHANGED before and after packaging.
- **Final Professional Edition v1.0** — `Omnira — Executive Intelligence — Professional
  Edition v1.0.pdf`
  - SHA-256: `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2`
  - Verified UNCHANGED before and after packaging.

Neither upstream binary was modified by this integration.

## Integrated package

- **Package status:** ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN
- **Independently verified before integration:**
  - 74 files · 73 manifest-listed files all match SHA-256 · no unlisted delivery files
  - no `__pycache__` · no `*.pyc` · no `Build/__deltest.txt`
  - 32 chapter files · 6,705 section records · 55,840 block records
  - 17 active diagrams · D14 actively absent
  - 56/56 actual retrieval tests pass · deterministic router present
  - no embeddings · no vector database · no Claude session paths · no local `/Users/...`
    paths inside the package files
  - `implementation_status = unknown_not_verified_in_this_package` for all records

- **Clean package source path (outside repo):**
  ```
  /Users/andrehultgren/Documents/Omnira-Cowork/executive-intelligence/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean
  ```

- **Repo integration branch:** `docs/executive-intelligence-atlas-knowledge-v1`

- **Repo target path:**
  ```
  docs/architecture/executive-intelligence/atlas-knowledge/v1.0/package/
  ```

## Nature of this integration

This is a **controlled copy of an approved package**. The package was copied byte-for-byte;
its manifest checksums were re-verified against the repo copy after copying (73/73 match, 74
files total, no unlisted files). The package content was **not modified semantically** during
integration.

## What is explicitly NOT verified here

This integration does **not** verify actual runtime implementation. The claim
`implementation_status = unknown_not_verified_in_this_package` stands. The repository, schema,
migrations, runtime, and deployment — not this document knowledge — determine what is actually
implemented.
