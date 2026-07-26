# Executive Intelligence — Professional Edition v1.0

## Full Book Build Report — PRODUCTION CANDIDATE v1

> PRODUCTION CANDIDATE v1 — NOT YET FINAL PROFESSIONAL RELEASE.
> Requires separate full visual QA and human approval before it may be marked as the final
> Professional Edition.

## 1. What was built

A complete, professionally designed book candidate covering all 32 canonical chapters, built
deterministically from the locked Canonical v1.0 text. Output:
`Production/Candidate/Omnira — Executive Intelligence — Professional Edition Candidate v1.pdf`
— **1,908 pages**, US Letter (612×792 pt).

The design baseline is the approved Proof v2: Executive Gold palette, dark/light hybrid,
DejaVu Serif/Sans/Mono, Letter format, part dividers, dark chapter openings, header/footer
system, callout system, table aesthetic, and diagram visual language.

## 2. Pipeline (deterministic, reproducible)

Source text is read only from the locked Canonical v1.0 DOCX via `python-docx` (never PDF
extraction). `parse_canonical.py` produces `content_map.json` (every canonical block, in
order), `navigation_map.json` (the ten approved non-canonical navigational Parts), and
`diagram_source_map.json` (18 diagrams).

`build_professional_edition.py` lays out the whole book with a deterministic engine and emits
the PDF. A layout (measure) pass computes the page map (`build_pagemap.json`) used to resolve
final page numbers, the table of contents, PDF bookmarks, and clickable internal links; the
render pass draws the pages. The candidate can be rebuilt from source with no manual page
layout and no manual PDF editing.

## 3. Page architecture

Dark feature pages (46 total): cover, title page, 10 part dividers, 32 chapter openings, and 2
dark full-page system diagrams. All other pages are light body pages for sustained reading.
Every chapter begins on a new dark opening (chapter number + exact canonical title) and
continues with its actual first canonical section on the following light page — no invented
introductions or summaries.

## 4. Front matter

Canonical title and metadata, Canonical Doctrine Notice, Implementation Scope and Maturity,
How to Read This Book, and Terminology Guide — all reproduced verbatim. A live, multi-page
Table of Contents follows, listing all ten Parts, all 32 chapters, and the 18 diagrams with
final page numbers and clickable links.

## 5. Additive presentation layers

Diagrams (18), callouts (8 canonical-triggered types), and one canonical Damage Severity table
are additive only. No canonical text is replaced, summarised, shortened, merged, or moved.
Callouts are applied by exact-match on specific canonical paragraphs, so the text still appears
exactly once and unchanged, styled as a callout where the wording clearly supports the label.

## 6. Determinism & rebuild

`BUILD_MODE=measure` → page map; `BUILD_MODE=full OUT=<path>` → candidate PDF. Fonts are the
installed DejaVu family (embedded/subset). Nothing was downloaded or installed.

## 7. Corrections made during production

See `STRUCTURAL_PDF_QA_REPORT.md` §"Corrections". Two deterministic layout issues were found in
the first visual QA pass and fixed before finalising: (a) sparse section-title diagrams were
made dense with canonical section-title nodes; (b) a non-wrapping diagram footnote that ran off
the right edge on the Stage-1 diagram was made to wrap. The book was rebuilt after each fix.

## 8. Status

This is a review candidate. It is not the final release and is not named
`Omnira — Executive Intelligence — Professional Edition v1.0.pdf` (that filename is reserved for
the approved release). Awaiting full human page-by-page visual QA.
