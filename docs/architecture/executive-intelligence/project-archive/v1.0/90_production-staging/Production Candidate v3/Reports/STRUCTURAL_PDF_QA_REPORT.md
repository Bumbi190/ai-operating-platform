# STRUCTURAL PDF QA REPORT — Candidate v3

**Generated:** 2026-07-14 · **Tools:** pdfinfo, pdffonts, qpdf 10.6.3, pypdf 6.13.1 (poppler 22.02.0).

## 1. Structure

| Check | Result |
|---|---|
| Pages | 1,740 |
| Page size | 612 × 792 pt (US Letter) — uniform (1 unique size) |
| Page rotation | 0 |
| qpdf `--check` | No syntax or stream encoding errors found |
| Text extractable | Yes |

## 2. Metadata (candidate status)

| Field | Value |
|---|---|
| Title | Omnira — Executive Intelligence — Professional Edition Candidate v3 (PRODUCTION CANDIDATE — not final release) |
| Subject | …Professional Edition PRODUCTION CANDIDATE v3 |
| Creator | Omnira Publishing Systems — build_candidate_v3.py (ReportLab) |
| Keywords | …PRODUCTION CANDIDATE v3, not final release, Canonical v1.0, Layout C |
| Language | en-US |

## 3. Fonts

DejaVuSerif, DejaVuSerif-Italic, DejaVuSans, DejaVuSans-Bold, DejaVuSansMono, DejaVuSansMono-Bold —
all **embedded and subset**. The single non-embedded **Helvetica** base-14 entry is the unused ReportLab
default (no visible glyphs) — the same known-safe artifact as Candidate v1/v2. No broken glyphs observed.

## 4. Navigation

| Check | Result |
|---|---|
| Outline bookmarks | 66 |
| Diagram bookmarks | 17 |
| Internal TOC links | 60 |
| D14 in bookmarks / links / TOC | absent |
| Bookmark/link targets in 1–1,740 | all valid |
| Page-number footers | continuous "Page n of 1740" |

TOC, bookmarks, and internal links were rebuilt against the v3 pagination; all destinations resolve.

## 5. Page integrity

- No unintended blank pages (page composition accounts for all 1,740 pages).
- No proof/review pages.
- No cut headers or cut diagram labels (verified in `VISUAL_QA_REPORT.md`; D03/D08/D15 panel headers full,
  D12 L0–L6 full, all four rebuilt dark diagrams full-label).

## 6. Conclusion

Candidate v3 is structurally sound: uniform Letter pages, correct v3 candidate metadata, embedded subset
fonts, extractable text, clean qpdf check, continuous pagination, working bookmarks and internal links,
no dangling or D14 references.
