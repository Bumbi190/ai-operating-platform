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

**Executive Intelligence v1.0 is ACTIVE as an Architecture Knowledge source** (EI-S1.1). It is
the fourth active source in the Architecture Knowledge Runtime, alongside Intelligence Fabric
v1.0, Intelligence Graph v1.0 and Mobile Intelligence v1.0. See
[`atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md`](atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md)
for the authoritative statement of what that does and does not mean.

What activation means:

- The canonical package is normalized, chunked and lexically indexed into the committed
  Architecture Knowledge artifact, and is retrievable with server-minted citations.
- Canonical front matter FM.1–FM.4 is ingested alongside the numbered chapters. FM.2 —
  *Implementation Scope and Maturity* — is the canonical Stage 1 boundary and is retrievable.
- Every record's primary canonical identity is the canonical v1.0 book registered in this
  repository (`ee85a1a0…f555b8`), re-verified against the file on disk at build time.

What activation does **not** mean:

- Architecture Knowledge remains **shadow-only**. No knowledge text enters the live model
  prompt, and there is no user-visible grounding surface.
- Canonical book knowledge grants **no execution authority**. Human authority, governance,
  approval gates and project isolation continue to apply unchanged.
- **This is not "Executive Intelligence Stage 1 complete".** Activating the knowledge source is
  the first subphase of canonical Stage 1 (FM.2), not Stage 1 itself.
- No embeddings, no vector database, no external retrieval service, and no Memory ingestion of
  canonical books.

Canonical FM.2 Stage 1 requires Executive Context, Daily Executive Brief, Decision Ledger V1,
Executive Mission Brief V1, explicit human authorization, safe Manager/Workforce handoff,
project-scoped status and evidence, and basic traceability and review.

**Delivered by EI-S1.2:** the apex `executive_brief` producer (canonical §13.1 five-section
shape), and retirement of the legacy `lib/atlas/executive.ts` path from every live surface. The
Atlas page now reads the conformant artifact through a principal-scoped server-side boundary.
No new execution authority was added — the apex brief recommends, it never acts.

**Still open, tracked for later EI-S1 increments:** Decision Ledger V1, Executive Mission Brief
V1, the explicit Stage 1 authorization object, the Manager/Workforce handoff artifacts, the
remaining principal-scoped read hardening on the internal `CRON_SECRET` intelligence route, and
the final FM.2 conformance review.

**Executive Intelligence Stage 1 is still NOT complete.**
