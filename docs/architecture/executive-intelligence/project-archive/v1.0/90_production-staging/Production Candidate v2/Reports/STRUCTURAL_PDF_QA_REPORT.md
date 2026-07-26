# STRUCTURAL PDF QA REPORT — Candidate v2

**Generated:** 2026-07-14 · **Tools:** pdfinfo, pdffonts, qpdf 10.6.3, pypdf 6.13.1 (poppler 22.02.0).

## 1. Document structure

| Check | Result |
|---|---|
| Pages | 1,740 |
| Page size | 612 × 792 pt (US Letter) — **uniform across all 1,740 pages** (1 unique size) |
| Page rotation | 0 |
| PDF version | 1.4 |
| Encrypted | No |
| qpdf `--check` | **No syntax or stream encoding errors found** |
| Text extractable | Yes (253,328 tokens via pdftotext) |

## 2. Metadata (candidate status embedded)

| Field | Value |
|---|---|
| Title | Omnira — Executive Intelligence — Professional Edition Candidate v2 (PRODUCTION CANDIDATE — not final release) |
| Author | André Hultgren |
| Subject | Canonical Architecture and Operating Doctrine — Professional Edition PRODUCTION CANDIDATE v2 |
| Creator | Omnira Publishing Systems — build_candidate_v2.py (ReportLab) |
| Keywords | …PRODUCTION CANDIDATE v2, not final release, Canonical v1.0, Layout C |
| Language | en-US |

## 3. Fonts

| Font | Embedded | Subset | Unicode |
|---|---|---|---|
| DejaVuSerif | yes | yes | yes |
| DejaVuSerif-Italic | yes | yes | yes |
| DejaVuSans | yes | yes | yes |
| DejaVuSans-Bold | yes | yes | yes |
| DejaVuSansMono | yes | yes | yes |
| DejaVuSansMono-Bold | yes | yes | yes |
| Helvetica (base-14) | no | — | — |

All DejaVu fonts used for visible text are embedded and subset. The single non-embedded **Helvetica**
entry is the unused ReportLab base-14 default (no visible glyphs drawn with it) — the same known-safe
artifact recorded for Candidate v1. No broken or missing glyphs were observed in the page renders.

## 4. Navigation

| Check | Result |
|---|---|
| Outline bookmarks | 66 (cover, title, front matter, 10 parts, 32 chapters, 17 diagrams, TOC) |
| Internal TOC links | 60 link annotations |
| Bookmark/link targets in range 1–1,740 | **all valid** (0 invalid targets) |
| D14 in bookmarks / links / TOC | **absent** |
| Page-number footers | continuous "Page n of 1740" |

Bookmarks and internal links were rebuilt against the new pagination; all destinations resolve to valid
pages.

## 5. Page-integrity checks

- **No unintended blank pages:** page composition accounts for all 1,740 pages (1 cover + 1 title + 2 TOC
  + 10 parts + 32 chapter openings + 17 diagrams + 1,677 body). Every page carries content (background +
  header/footer/text or a full-page diagram).
- **No proof pages** (no proof/review scaffolding leaked in — verified in content report).
- **No cut headers / cut diagram labels:** verified in the visual QA (D03/D08/D15 panel headers full;
  D12 L0–L6 full). See `VISUAL_QA_REPORT.md`.

## 6. Conclusion

Candidate v2 is structurally sound: uniform Letter pages, correct candidate metadata, embedded subset
fonts, extractable text, clean qpdf check, continuous pagination, and working bookmarks and internal
links with no dangling or D14 references.
