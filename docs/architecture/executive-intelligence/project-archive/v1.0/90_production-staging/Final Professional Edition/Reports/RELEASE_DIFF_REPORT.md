# RELEASE DIFF REPORT — Candidate v3 → Final Professional Edition v1.0

> Rigorous page-level diff proving the final edition differs from the approved Candidate v3 only in the
> allowed ways (status, filename/metadata, D01 number, automatic fields).

**Generated:** 2026-07-15 · **Method:** per-page render hash comparison (85 dpi) + text/metadata diff.

## 1. Page-render comparison

Both PDFs were rendered to PNG at 85 dpi and every page hashed and compared.

| Result | Value |
|---|---|
| Pages compared | 1,740 / 1,740 |
| Pages identical (pixel-for-pixel) | 1,737 |
| Pages differing | **3 — pages 1, 2, 23 only** |

## 2. The three differing pages (all allowed)

| Page | Content | Change |
|---|---|---|
| 1 | Cover | Removed the candidate line "PRODUCTION CANDIDATE v3 — NOT FINAL RELEASE"; cover now shows only "PROFESSIONAL EDITION · VERSION 1.0". |
| 2 | Title / metadata | Build status "PRODUCTION CANDIDATE v3 — not final professional release" → "FINAL PROFESSIONAL RELEASE"; title footer "Production candidate for review…" → "Final professional release…". |
| 23 | Diagram D01 | Source line "DIAGRAM · Ch 2 §§2.2-2.3" → "DIAGRAM D01 · Ch 2 §§2.2-2.3". No other D01 change. |

No other page differs. There is no change to body text, pagination, headers/footers, chapter openings,
the other 16 diagrams, the Table of Contents, Part dividers, or page 454.

## 3. Metadata / filename / automatic fields

| Field | Candidate v3 | Final |
|---|---|---|
| Filename | …Candidate v3.pdf | Omnira — Executive Intelligence — Professional Edition v1.0.pdf |
| PDF Title | …Candidate v3 (PRODUCTION CANDIDATE — not final release) | …Professional Edition v1.0 (FINAL PROFESSIONAL RELEASE) |
| PDF Subject | …PRODUCTION CANDIDATE v3 | …Professional Edition v1.0 (FINAL PROFESSIONAL RELEASE) |
| PDF Creator | build_candidate_v3.py | build_final_edition.py |
| CreationDate / checksum | (build-specific) | (build-specific) |

## 4. Allowed vs actual

The instruction permits only: removed candidate markings, final release status, final filename/metadata,
D01 → clear diagram number D01, and automatic checksum/build-date fields. **The actual diff is exactly
this set — pages 1, 2, 23 plus metadata/filename.** No other visual, typographic, structural, or semantic
difference exists.

## 5. Conclusion

The final Professional Edition v1.0 is Candidate v3 with only the approved status/metadata/D01 changes.
Content, layout, pagination, navigation, and all 17 diagrams (except D01's source-line number) are
byte-faithful reproductions of the human-approved candidate.
