# SPARSE PAGE AUDIT REPORT — Candidate v3

> Full-book audit of light body pages for sparse/near-empty typography. Intentional low-text pages
> (cover, title, TOC, Part dividers, chapter openings, diagrams) are excluded.

**Generated:** 2026-07-14 · **Scope:** all 1,677 light body pages.

## 1. Method

Each light body page was measured from the actual laid-out page objects: extracted word count and used
text-area fill (rendered text lines × 14.0 pt leading ÷ usable text height ≈ 630.5 pt). A page is flagged
if it has **fewer than 45 words** OR **less than ~20% used text area**, or if only a short closing block
sits at the top of an otherwise-empty page (near-empty chapter tail).

## 2. Widow / orphan / tail results (full book)

| Metric | Count |
|---|---|
| Widows | 0 |
| Orphans | 0 |
| Paragraphs split across a page break | 0 |
| Headings at page bottom without following text | 0 |
| Near-empty chapter-tail pages | 0 |

The Candidate v2 near-empty tail (page 454) is resolved by the chapter-tail cohesion rule (Blocker A).

## 3. Flagged sparse pages

| Page | Chapter | Words | Fill % | Lines | Decision |
|---|---|---|---|---|---|
| 454 | Ch 11 — Decision Ledger (chapter end) | 44 | 28.9% | 13 | **Reviewed — accepted.** Genuine chapter ending. |

**Page 454 detail.** This is the final page of Chapter 11. After Blocker A, it now carries a coherent
closing block: "With a Decision Ledger, every material decision can become part of a continuous chain:"
followed by the canonical chain (Evidence → Recommendation → Authority → Decision → Mission → Action →
Outcome → Review → Learning) and the closing sentence "That chain is how Omnira stops repeating decisions
and starts building institutional judgment." It occupies 13 lines at 28.9% used text area — comfortably
above the 20% area threshold. It is flagged only because the word count is 44 (one below the 45-word
threshold), a consequence of the closing section being composed of short canonical list items and
sentences. Visual inspection confirms a proper, professional chapter-end page (not a stray-line page).
No further reflow is applied, because pulling additional content back would either split the closing
chain or shorten a preceding full page without visual benefit. **This is the genuine end of the chapter,
not a layout defect.**

## 4. Comparison to Candidate v2

| | Candidate v2 | Candidate v3 |
|---|---|---|
| Near-empty tails | 1 (p454, 2 lines) | 0 |
| Sparse body pages flagged | — | 1 (p454, 13 lines / 28.9% — accepted chapter end) |

## 5. Conclusion

No real sparse/near-empty typographic defects remain. The single flagged page is a genuine chapter ending
that now presents a full, meaningful closing block rather than a stray sentence.
