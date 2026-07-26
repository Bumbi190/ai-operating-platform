# Omnira — Executive Intelligence — Professional Edition
## PRODUCTION CANDIDATE v2 — BUILD REPORT (Phase 3.3.2)

> PRODUCTION CANDIDATE v2 — NOT FINAL PROFESSIONAL RELEASE.

**Generated:** 2026-07-14 · **Builder:** `Source/build_candidate_v2.py` (ReportLab, deterministic).

## 1. What was built

A complete rebuild of the Professional Edition from the locked Canonical v1.0 text, applying the
human-approved design decisions and the human diagram decision. Candidate v1 was **not** overwritten;
Candidate v2 lives in its own `Production Candidate v2/` tree.

| Field | Value |
|---|---|
| Output | `Candidate/Omnira — Executive Intelligence — Professional Edition Candidate v2.pdf` |
| Size | 3,148,079 bytes |
| SHA-256 | `14f1bea848bcf0edc5f13ac7317db7bb8b26b2c27899038425028b97d3e04a62` |
| Pages | 1,740 |
| Page size | US Letter (612×792 pt), uniform |
| Chapters | 32 (exact canonical order) |
| Navigational Parts | 10 |
| Diagrams | 17 (D14 removed) |
| Canonical section identifiers | 6,705 |
| Bookmarks (outline) | 66 |
| Internal TOC links | 60 |
| Build status | PRODUCTION CANDIDATE v2 — not final release |

Page composition: cover 1 · title 1 · TOC 2 · part dividers 10 · chapter openings 32 · diagram pages 17 ·
body 1,677 = **1,740**.

## 2. Locked design decisions applied

**Layout C — Reference Optimized** (locked): US Letter · DejaVu Serif 10.5 pt · 14.0 pt leading ·
paragraph space-after 2.4 pt · list space-after 1.5 pt · heading space before/after 9 / 4 pt ·
top/bottom margin 1.19″ / 0.97″ (horizontal margins 1.15″/1.00″ unchanged) · keep-with-next ON ·
widow/orphan control ON · keep-together for blocks up to 4 lines.

**Opening Option B — Canonical Excerpt** for all 32 chapters: chapter number, exact canonical title, and
the verbatim beginning of the chapter's first canonical section. The generic line "The chapter continues
with its actual first section on the following page." does not appear (verified: 0 occurrences).

## 3. Diagram decision applied

17 diagrams included; **D14 removed** (REMOVE FROM PROFESSIONAL EDITION — REDUNDANT WITH D01) from the
sequence, TOC, bookmarks, internal links, and the diagram count. **D04 contrast-fixed.** The other 15
per approved assets (5 kept as in Candidate v1, 10 corrected/rebuilt). Detail: `DIAGRAM_INTEGRATION_REPORT.md`.

## 4. Page-count vs Candidate v1

| | Candidate v1 | Candidate v2 | Δ |
|---|---|---|---|
| Total pages | 1,908 | 1,740 | −168 (−8.8%) |
| Diagrams | 18 | 17 | −1 (D14) |
| Bookmarks | 67 | 66 | −1 (D14) |

The reduction is driven by Layout C's tighter vertical rhythm plus the removal of the D14 diagram page.

## 5. Text integrity

Every canonical body block is emitted exactly once, in canonical order (the builder iterates the locked
`content_map.json` blocks directly). No canonical text was summarised, rewritten, shortened, merged,
reordered, or replaced by a diagram/callout/table. Diagrams, callouts, and the Ch 17 additive table are
additive presentation layers. Full verification: `CONTENT_COMPLETENESS_REPORT.md`.

## 6. Reserved filename

The reserved final-release filename `Omnira — Executive Intelligence — Professional Edition v1.0.pdf`
was **not** created. This is a review candidate only.

## 7. Corrections made during production

- Keep-with-next / keep-together interaction that stranded 2 headings at page bottoms was fixed
  (a block immediately following a heading no longer triggers a keep-together page break). After the fix:
  0 stranded headings across the full book.
- No other deterministic production errors were found requiring correction.
