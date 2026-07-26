# Executive Intelligence — Professional Edition v1.0

## Structural PDF QA Report — PRODUCTION CANDIDATE v1

File: `Production/Candidate/Omnira — Executive Intelligence — Professional Edition Candidate v1.pdf`

## 1. Automated structural checks

| Check | Result |
|---|---|
| PDF opens | PASS |
| `qpdf --check` | PASS — no syntax or stream errors |
| Page count | 1,908 |
| Page size uniform Letter (612×792 pt) | PASS (all pages) |
| Unintended blank pages | 0 (full-book render scan: 46 dark feature pages, 1,862 light pages, 0 blank) |
| Fonts embedded or documented-safe | PASS — DejaVu Serif/Sans/Mono embedded & subset; one unused `Helvetica` base-14 reference (0 glyphs drawn) = documented safe |
| Missing glyphs | None observed |
| Text outside page area | None (after fix — see Corrections) |
| Overlapping text | None observed |
| Table rows clipping text | None (dynamic row heights; Damage Severity table verified) |
| Diagrams render | PASS — all 18 render |
| TOC page numbers correct | PASS (resolved from page map; spot-checked) |
| Internal links functional | PASS — 61 link annotations |
| Bookmarks functional | PASS — 67 outline entries (front matter, each Part, each chapter with exact canonical title, major diagrams) |
| Metadata correct | PASS (see §2) |
| Text extractable | PASS |
| Page numbering contiguous | PASS — "Page X of Y", 1…1908 |
| Canonical status present | PASS ("Approved and locked"; Canonical Doctrine Notice) |
| Candidate status in metadata | PASS ("PRODUCTION CANDIDATE v1 — not yet final professional release") |
| Review markings | None (`DRAFT FOR REVIEW`, `NOT YET CANONICAL` absent) |
| Proof-only pages / proof page-15 text / proof explanations | None (checked and absent) |

## 2. Metadata

- Title: Omnira — Executive Intelligence — Professional Edition Candidate v1 (PRODUCTION CANDIDATE — not final release)
- Author: André Hultgren
- Subject: Canonical Architecture and Operating Doctrine — Professional Edition PRODUCTION CANDIDATE v1
- Keywords: … PRODUCTION CANDIDATE v1, not final release, Canonical v1.0
- Creator: Omnira Publishing Systems — build_professional_edition.py (ReportLab)
- Language: en-US

## 3. First visual QA pass (production pass, not final release QA)

The full book was rendered to PNG (`Production/Renders/Pages/`, 1,908 pages) and contact sheets
(`Production/Renders/Contact Sheets/`, 40 sheets). A first visual pass covered the front matter,
TOC, every Part divider and chapter opening in overview, representative body spreads across the
book, and all 18 diagram pages individually.

Findings: headers/footers consistent; no header collisions; no clipped chapter titles; dark
openings balanced; page numbering contiguous; no unnecessary near-empty pages; the book closes
cleanly on Chapter 32 with no stray or proof pages.

## 4. Corrections during production

1. **Sparse diagrams** — the section-title diagrams (D03–D09, D13, D15–D17) initially rendered
   with only 2–3 nodes, leaving near-empty pages. Node density was increased to use up to
   ~8 canonical section titles per chapter, filling the pages meaningfully. Rebuilt.
2. **Diagram footnote overflow** — the additive diagram footnote did not wrap and ran off the
   right edge on the Stage-1 diagram (page 1864). `_dia_note` was changed to wrap within the
   text measure. Rebuilt and re-verified: overflow scan of all 18 diagram pages = none.

Both corrections were deterministic layout fixes; no canonical text was affected. The candidate
was rebuilt from source after each.

## 5. Open items for full human QA

A page-by-page human visual QA over 1,908 pages remains outstanding (this Phase 3.3 pass is a
production pass, not the final release QA). Recommended focus: fine widow/orphan control on
body pages, chapter-opening balance, and diagram legibility at print scale.
