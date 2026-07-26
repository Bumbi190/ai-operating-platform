# VISUAL QA REPORT — Candidate v2

**Generated:** 2026-07-14 · **Renders:** all 1,740 pages → `Renders/Pages/` (PNG, 85 dpi);
whole-book contact sheets → `Renders/Contact Sheets/` (40 pages/sheet).

## 1. Widow / orphan full-book analysis (measured on the actual built pages)

| Metric | Count | Notes |
|---|---|---|
| Widows (single last line alone on a page) | **0** | |
| Orphans (single first line alone at page bottom) | **0** | |
| Paragraphs split across a page break | **0** | canonical paragraphs are short; keep-together keeps them whole |
| Headings at page bottom without following text | **0** | after the keep-with-next / keep-together fix |
| Near-empty tail pages | **1** | page 454 — see §2 |
| Chapter-opening boilerplate | **0** | Option B; boilerplate removed |

Target of **zero real widow/orphan defects met**: no widows, no orphans, no split paragraphs, no stranded
headings across all 1,677 body pages.

## 2. The single flagged exception (documented, not a widow/orphan defect)

**Page 454 — end of Chapter 11 (Decision Ledger).** The page carries the chapter's genuine two-line
closing sentence ("That chain is how Omnira stops repeating decisions and starts building institutional
judgment.") before Chapter 12 opens. This is a **complete** closing block, not a split paragraph, widow,
orphan, or stranded heading. It is a short chapter-tail page. Eliminating it would require pulling the
block back onto the preceding (full) page or reflowing earlier content, which risks introducing a defect
elsewhere; it is therefore left as-is and disclosed here. Reason: the chapter's final canonical block is a
short closing statement that lands after an otherwise-full page.

## 3. Pages inspected

Whole-book coverage via 44 contact sheets (40 pages each). Full-resolution inspection included:

- **Cover** (marked "PRODUCTION CANDIDATE v2 — NOT FINAL RELEASE") and **title/metadata** page.
- **Front matter** (Canonical Doctrine Notice, Implementation Scope, How to Read, Terminology Guide).
- **Table of Contents** (2 pages).
- **All 10 Part dividers** and a sample of **chapter openings** across the book (Option B verified: number,
  exact canonical title, verbatim excerpt, no boilerplate).
- **All 17 diagram pages** (via contact sheets) plus full-resolution checks of the priority items below.
- **Representative body pages** from every part of the book (contact sheets 1–44).
- **Page 454** (flagged near-empty tail) and the **book end** (Chapter 32 final pages).

## 4. Priority visual checks

| Item | Result |
|---|---|
| D04 contrast (p153) | **PASS** — all four boundary labels bright and legible, including the two previously-dark inner labels (Least Privilege · Authority Narrowing; Isolated Project). |
| D12 L0–L6 (p852) | **PASS** — all seven autonomy levels shown with complete horizontal labels; no rotation, no truncation. |
| D03 / D15 panel headers (p107 / p1303) | **PASS** — "PORTFOLIO EXECUTIVE" / "PROJECT EXECUTIVE" and "OPERATING GRAPH" / "INTELLIGENCE GRAPH" render in full. |
| D17 Crisis / Emergency Brake (p1439) | **PASS** — severity ladder C0–C4 and Crisis Mode vs Emergency Brake distinction legible. |
| D14 present anywhere | **ABSENT** — no D14 page; diagram sequence runs D01–D13, D15–D18. |
| Chapter-opening boilerplate | **ABSENT** — Option B excerpt on every opening. |
| Old Candidate v1 diagrams used by mistake | **NONE** — kept diagrams (D01, D02, D10, D11, D18) match the approved Candidate v1 renderings; corrected diagrams are the Phase 3.3.1 assets; D04 is the contrast-fixed version. |

## 5. Diagram background note

Corrected/rebuilt diagrams and D01 render as dark full-page plates; the kept light diagrams (D02, D10,
D11, D18) render on white with a page-number footer — matching their approved Candidate v1 appearance.
This mixed treatment is intentional (it reproduces each diagram's human-approved asset).

## 6. Conclusion

Candidate v2 passes visual QA: zero widows/orphans/split-paragraphs/stranded-headings, one documented
short chapter-tail (p454), all approved diagrams present and legible with the D04 contrast fix and D14
removal, Option B chapter openings throughout, and no proof/review artifacts in the book.
