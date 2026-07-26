# Executive Intelligence — Professional Edition v1.0
## HUMAN DESIGN DECISION — Pagination & Chapter Opening (locked)

> This document records approved **design decisions** made after human review of pagination proofs
> A, B, and C. It is a design-decision record, **not new architecture doctrine** and not a change to
> Canonical v1.0. These decisions are locked for a future Candidate v2 but **Candidate v2 is not yet
> authorized.**

**Decision date:** 2026-07-14
**Basis:** Human review of `Correction Proof/Pagination/Pagination Proof — Layout {A,B,C}.pdf`
and the two chapter-opening options, plus `PAGINATION_COMPARISON_REPORT.md`.

---

## 1. Production baseline — APPROVED: Layout C (Reference Optimized)

**Layout C** is approved as the new production baseline. Locked values:

| Parameter | Locked value |
|---|---|
| Page size | US Letter |
| Body font | DejaVu Serif 10.5 pt |
| Leading | 14.0 pt |
| Paragraph space-after | 2.4 pt |
| List space-after | 1.5 pt |
| Heading space before / after | 9 / 4 pt |
| Top / bottom margin | 1.19″ / 0.97″ |
| Horizontal margins | 1.15″ / 1.00″ (unchanged, locked design system) |
| Keep-with-next | ON |
| Widow / orphan control | ON |
| Keep-together | blocks up to 4 lines |

Rationale (as assessed): Layout C gives the best balance of premium feel, readability, vertical rhythm,
reviewability, practical page count (≈1,733 pp, −9.2% vs Candidate v1), and protection against
widow/orphan problems (0 widows / 0 orphans across the full-book measurement).

## 2. Chapter opening — APPROVED: Opening Option B (Canonical Excerpt)

The chapter opening must contain:

- chapter number,
- the exact canonical chapter title,
- the beginning of the chapter's actual first canonical section,
- no boilerplate,
- no invented intro,
- no rewriting.

The generic Candidate v1 line "The chapter continues with its actual first section on the following page."
is **removed** and must not appear in Candidate v2 or the final edition.

## 3. Rejected and reserved options

- **Layout A — REJECTED.** Must not be used for Candidate v2 (carries the known widow/orphan and
  stranded-heading defects).
- **Layout B — RESERVE.** Retained only as a documented reserve baseline (max page reduction option).
- **Opening Option A — RESERVE.** Retained only as a documented proof alternative.

## 4. Status of downstream work (not yet authorized)

- **Candidate v2 is not yet authorized.** No Candidate v2 has been built.
- **Final release format is still pending a final human decision** (single-volume master vs master +
  per-Part multi-volume vs multi-volume only — see `PAGINATION_COMPARISON_REPORT.md` §8).
- **The corrected diagrams await human visual review** via the `Diagram Review Package/` in this folder.
  No diagram has been merged into any candidate.

---

*This is a design-decision record only. It introduces no new model, relationship, risk class, authority
rule, or autonomy level. Canonical v1.0 remains the sole source of doctrine and is unchanged.*
