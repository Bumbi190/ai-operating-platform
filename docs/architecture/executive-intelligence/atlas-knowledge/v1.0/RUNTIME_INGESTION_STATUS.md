# Runtime Ingestion Status — Atlas Knowledge Edition v1.0

**Status: ACTIVE ARCHITECTURE KNOWLEDGE SOURCE — SHADOW-ONLY RETRIEVAL.**

This file is the authoritative statement of what the Atlas Knowledge Edition does and does not
do at runtime. It was updated by **EI-S1.1** (Executive knowledge activation), which superseded
the earlier "repo-integrated, not runtime-ingested" state.

## What is true

- Executive Intelligence v1.0 is **registered and ACTIVE** in the Architecture Knowledge
  Registry (`docs/architecture/knowledge-runtime/registry.v1.json`), as the fourth active
  source next to Intelligence Fabric v1.0, Intelligence Graph v1.0 and Mobile Intelligence v1.0.
- The package is **deterministically normalized** into the committed Architecture Knowledge
  artifact: 32 numbered chapters, 6,705 numbered canonical sections, and 4 canonical
  front-matter records (FM.1–FM.4), which are counted and cited as **distinct record classes**.
- Retrieval is **deterministic lexical (BM25-like)**. There are **no embeddings**, **no vector
  database**, and **no external retrieval service**.
- Retrieval is **SHADOW-ONLY**. Architecture knowledge is reached exclusively through
  `runContextShadow` behind `ATLAS_CTX_ASSEMBLER=shadow`; the assembled block is diffed, logged
  and discarded. **No knowledge text enters the live model prompt.**
- There is **no user-visible grounding surface**, no source cards, and no UI activation.
- **No Memory ingestion** of canonical books. The Memory → `recallMemories()` → Context Request
  boundary is unchanged by this activation.
- **No Atlas runtime permission or authorization** is changed. Document knowledge grants **no
  execution authority**.
- The **repository, runtime, schema, and deployment remain authoritative** for what is actually
  implemented.

## Provenance and integrity

- Primary canonical identity for every record is the canonical Executive v1.0 book registered in
  this repository, checksum `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`,
  re-verified against the file on disk at build time. A record can therefore always be traced
  back to a repository-resolvable canonical artifact.
- The package's per-chapter source-file digests are preserved as **secondary** audit provenance
  only. They are never used as the canonical identity for source validation or citation binding.
- The source adapter fails closed and names the invariant it failed. It executes — rather than
  merely advertises — canonical book checksum verification, book-SHA consistency across records,
  per-record canonical text checksums, the 32-chapter / 6,705-section / 4-front-matter contract,
  unique canonical and front-matter identifiers, chapter range, and stable ordering.
- The artifact verifier enforces a **generic** eligibility invariant: no source may appear in the
  artifact unless it is registered, byte-identical to its registry row, and independently
  eligible (active, current, approved/verified, cloud-eligible). No book is special-cased.

## Implementation status of the knowledge

Every record in this package still carries:

```
implementation_status = unknown_not_verified_in_this_package
```

Activation does **not** change that. Retrievability is not evidence that a described capability
exists in the runtime. The package describes *intended* architecture; it does not certify
implementation. Every retrieval result is labelled `authorityKind = canonical_target`.

## What this is NOT

**Knowledge activation is not, by itself, Executive Intelligence Stage 1.** That was and remains
true of *this activation*: registering and indexing the canonical package is the first subphase of
canonical Stage 1 (FM.2), not the target.

Canonical Stage 1 is defined by FM.2 (*Implementation Scope and Maturity*) and requires
Executive Context, Daily Executive Brief, Decision Ledger V1, Executive Mission Brief V1,
explicit human authorization, safe Manager/Workforce handoff, project-scoped status and
evidence, and basic traceability and review.

### HISTORICAL — as written at EI-S1.2 (2026-08-18)

*Preserved verbatim rather than rewritten, so the record shows what was true when this file was
established and what has since changed.*

> EI-S1.2 closed two of the runtime gaps established by the EI-S1.0 audit: the apex
> `executive_brief` producer now exists, and the legacy `lib/atlas/executive.ts` path no longer
> powers any live surface. Still open: Decision Ledger V1, Executive Mission Brief V1, the Stage 1
> authorization object, the Manager/Workforce handoff artifacts, the remaining principal-scoped
> read hardening on the internal `CRON_SECRET` intelligence route, and the final FM.2 conformance
> review.

### CURRENT — Stage 1 completed through EI-S1.6

Every item on that "still open" list has since shipped. This file was not updated at the time and
stated a superseded position until this reconciliation; the authoritative record is
[`../../README.md`](../../README.md), *Current canonical status*.

| FM.2 Stage 1 capability | Status |
|---|---|
| Executive Context | SHIPPED |
| Daily Executive Brief (apex, canonical §13.1 shape) | SHIPPED — EI-S1.2 |
| Decision Ledger V1 | SHIPPED |
| Executive Mission Brief V1 | SHIPPED |
| Explicit human authorization | SHIPPED |
| Safe Manager/Workforce handoff | SHIPPED |
| Project-scoped status and evidence | SHIPPED |
| Basic traceability and review | SHIPPED |
| Principal-scoped read hardening (internal `CRON_SECRET` route) | SHIPPED — EI-S1.5A; no `CRON_SECRET`-only read surface exists |
| Final FM.2 conformance review | **PASS** — all ten required capabilities proven |

**Executive Intelligence Stage 1 is COMPLETE.**

Two boundaries this does not move, and they are the reason this file exists:

- **Architecture Knowledge itself remains SHADOW-ONLY.** Stage 1 completion is a statement about
  the Executive *runtime*, not about this package. No knowledge text enters the live model prompt,
  there is still no user-visible grounding surface, and every record still carries
  `implementation_status = unknown_not_verified_in_this_package`.
- **Stage 1 complete does not mean the full long-term Executive architecture is implemented.**
  It means the FM.2 Stage 1 boundary is met. Later epics — including the triage gate, the unified
  deviation/significance model and the full Attention model — are not claimed complete here.

Carried debts adjudicated `NON_BLOCKING_BEFORE_STAGE_2` in the final review are recorded in the
README and are carried, not resolved.

Everything on the canonical FM.2 exclusion list — Full Approval Inbox, full policy engine,
Damage Boundary engine, Trust Score, Autonomy Licensing, automatic autonomy progression, full
Executive Graph interfaces, full Performance Intelligence, Crisis Mode, Emergency Brake, L4–L6
autonomy, autonomous spending, autonomous publishing expansion, autonomous project-mode changes,
self-improvement and self-granted authority — remains future architecture and is not authorized
by this change.

## Authority reminder

This package is knowledge, not authority. Retrieval grants no execution rights. Human authority,
governance, approval gates, and project isolation always apply.
