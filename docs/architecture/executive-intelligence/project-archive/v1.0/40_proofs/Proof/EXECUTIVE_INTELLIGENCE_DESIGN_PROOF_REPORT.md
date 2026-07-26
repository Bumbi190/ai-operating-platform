# Executive Intelligence — Professional Edition v1.0

## Design Proof Report (Phase 3.2)

## 1. Purpose

This report documents the limited visual design proof produced in Phase 3.2. The proof exists
so a human can approve the locked design system before any full-book production begins. It is
not the book. It is a 15-page representative sample sufficient to judge the cover, typography,
color, rhythm, readability, tables, callouts, diagrams, dark/light balance, and navigation.

## 2. Sources used

| Source | Role | SHA-256 |
|---|---|---|
| Executive Intelligence — Canonical Edition v1.0.docx | Only canonical text source (READ-ONLY) | `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8` |
| Omnira Business Blueprint - Volume I.pdf | Visual reference (READ-ONLY) | `fdad5e22d5b47595c4ebe04969532517196ec83930e027d3ead54eec29e9efec` |
| Omnira Business Blueprint - Volume I.docx | Layout reference (READ-ONLY) | `457a77ac42a91433d13b668b8432bb0f13f5734fada09635ec2673e0f27e4943` |

All three checksums were verified identical before and after the work.

## 3. Page-by-page description and canonical sections used

| Pg | Surface | Content | Canonical section (verbatim) |
|---|---|---|---|
| 1 | Dark | Cover — Omnira Architecture Series, Executive Intelligence, Canonical Architecture and Operating Doctrine, Professional Edition v1.0 | Front matter title block |
| 2 | Dark | Title page — full metadata, canonical status, owner, version, approval date | Front matter metadata (paras 5–11) |
| 3 | Light | Document Control table + Canonical Doctrine Notice | "Canonical Doctrine Notice" (verbatim) |
| 4 | Light | Live TOC — Part grouping, chapter/diagram entries, page numbers, clickable links | Navigational grouping (non-canonical) |
| 5 | Dark | Part divider — PART V — GOVERNANCE, DAMAGE & AUTONOMY, Chapters 16–19 | Navigational grouping (non-canonical) |
| 6 | Dark | Chapter opening — Chapter 16 — Governance & Policy Engine, §16.1 begins | Ch 16 §16.1 (verbatim) |
| 7 | Light | Body page — §16.1 text, governance-engine question list | Ch 16 §16.1 (verbatim) |
| 8 | Light | High-density page — §25.1 lead, 12-metric grid, body, purpose line | Ch 25 §25.1 (verbatim) |
| 9 | Light | Callout system — all 8 callout types with verbatim canonical bodies | see §7 below |
| 10 | Light | Table — Damage Severity D0–D4 with canonical responses | Ch 17 §17.100–17.104 (verbatim) |
| 11 | Dark | Diagram — Omnira Intelligence Layer Stack | Ch 2 §2.2 (verbatim layer labels) |
| 12 | Light | Diagram — Executive · Manager · Workforce | Ch 3 §3.2 (verbatim role labels & questions) |
| 13 | Light | Diagram — Damage Boundary severity bands | Ch 17 §17.100–17.104, §17.119 |
| 14 | Light | Diagram — Stage 1 vs Future Target | Front matter "Implementation Scope and Maturity" (verbatim scope lists) |
| 15 | Light | Chapter transition & navigation (header/footer/track) | Navigational only |

### Callout sources (page 9), all verbatim canonical text

- `CANONICAL DOCTRINE` — Canonical Doctrine Notice.
- `STAGE 1 BOUNDARY` — Implementation Scope and Maturity.
- `FUTURE TARGET ARCHITECTURE` — Implementation Scope and Maturity.
- `EXECUTIVE DECISION` — Ch 16 §16.1.
- `DAMAGE BOUNDARY` — Ch 17 §17.1.
- `AUTONOMY LICENSE` — Ch 17.
- `ANTI-PRINCIPLE` — Ch 3 §3.3.
- `EXAMPLE` — Ch 25 §25.1.

## 4. Design components implemented

Dark cover, dark title page, light Document Control with Blueprint-style Petrol table, live TOC
with PDF bookmarks and clickable internal links, dark Part divider, dark chapter opening, light
body page, high-density page, the eight-type callout system, Blueprint-related table aesthetic,
four reproducible vector diagrams, running header, footer with "Page X of Y", chapter track,
the locked visual-language conventions (solid = hard boundary, dashed = conditional/licensed,
solid fill = Stage 1, ghost/dashed = future target), and the reusable legend.

## 5. Typographic values (as built)

Body DejaVu Serif 10.5 pt / 14.5 pt leading; chapter title DejaVu Sans Bold 24–26 pt; section
heading DejaVu Sans Bold 12.5 pt; chapter eyebrow DejaVu Sans Mono letterspaced; callout label
DejaVu Sans Mono Bold 8 pt; table header DejaVu Sans Bold 9 pt; table body DejaVu Serif 9.5 pt;
running header DejaVu Sans 7 pt; footer DejaVu Sans 8.5 pt; measure ~6.35 in, single column,
left-aligned. Full values in `Design System/EXECUTIVE_INTELLIGENCE_COLOR_AND_TYPE_SPEC.md`.

## 6. Color values (as built)

Dark bg `#0E1A26`, paper `#FFFFFF`, ink `#14202B`, warm text `#F4F1EA`, secondary `#5A6672`,
Executive Gold `#C8A24B`, Blueprint Navy `#1F3B57`, Petrol `#183850`, Damage Red `#B4442E`,
Ghost Grey `#8A939D`. Gold is used sparingly (chapter number, single accents, key control
markers, central diagram nodes only).

## 7. PDF features

Title, author, subject, keywords, creator/producer set; document language `en-US`; 12 PDF
bookmarks (outline); 6 clickable internal TOC links; correct page order; 15 pages; page size
612 × 792 pt (Letter); all DejaVu fonts embedded and subsetted; text extractable on all pages;
no clipped or off-page text detected.

## 8. QA results

- PDF opens and passes `qpdf --check` (no syntax or stream errors).
- Pages: 15. Page size: uniform 612 × 792 pt (Letter).
- Fonts: all six DejaVu faces embedded/subset. One `Helvetica` reference is present but **unused**
  (0 glyphs drawn on any page); it is a PDF base-14 standard font and is therefore documented safe.
- No empty/accidental pages. No edge overflow. All diagrams and vector elements render.
- Bookmarks resolve; internal TOC links resolve.
- Metadata correct; text extractable on every page.
- Canonical status present ("Approved and locked" / "CANONICAL").
- No `DRAFT FOR REVIEW`, no `NOT YET CANONICAL`, no review watermarks. The only occurrence of the
  token "Draft" is the verbatim canonical **Source lineage** value ("Phase 1.2 Editorial Review
  Draft") on the title page — provenance metadata, not a review marking.
- All 15 pages rendered to PNG in `Proof/Proof Pages/` and inspected visually.

## 9. Known limitations

- Georgia (the Blueprint's intended face) is not installed; DejaVu Serif is used as the installed
  substitute, consistent with how the Blueprint PDF itself renders.
- One unused Helvetica base-14 reference remains in the PDF resource table (harmless, see §8).
- `Design Proof Source.pdf` is intentionally omitted: the ReportLab pipeline writes the final PDF
  directly and has no meaningful separate source-PDF stage.
- Final exact body size (10.5 vs 11 pt) and full-book page count are confirmed only in Phase 3.3.
- Diagram zone groupings (e.g. low-risk / approval-required / forbidden) are presentational
  groupings over the canonical D0–D4 severity classes; no new risk categories were introduced.

## 10. Points requiring human visual approval

1. Cover and dark feature-surface treatment (depth of `#0E1A26`, gold discipline).
2. Body typography at 10.5 pt / 14.5 pt — accept or request 11 pt.
3. Callout system look and the eight labels.
4. Diagram visual language and the reusable legend.
5. Dark/light balance across the sample.
6. Running header/footer wording and the chapter track.
7. TOC treatment and Part naming (non-canonical navigational grouping).

## 11. Version status (updated in Phase 3.2.1)

This report documents proof **v1** (`…Design Proof v1.pdf`), which was human-reviewed and whose
overall design direction was approved but which was **not** approved for full-book production.
A correction pass produced proof **v2** (`…Design Proof v2.pdf`), retaining v1 unchanged as the
audit version. The six mandatory corrections (Stage 1 maturity language, Intelligence Layer
diagram rebuilt from Ch 2 §§2.2–2.3, exact Damage Severity responses, split Damage Severity vs
Boundary State panels, Executive/Manager/Workforce legend, and TOC order) are documented in full
in `EXECUTIVE_INTELLIGENCE_DESIGN_PROOF_V2_CORRECTION_REPORT.md`. **Proof v2 is the current proof
and is awaiting human visual approval before full-book production.**

| Version | SHA-256 | Status |
|---|---|---|
| v1 | `072736e54c0c4784bb79b4c3aa18981774b1c66069a27053cfc424b7886356fd` | Retained, unchanged (audit) |
| v2 | `01b307ee82c4ff16f68d58b3529c9ed936d34b8f393ef18d01b82fe3a819ef1a` | Corrected — awaiting approval |
