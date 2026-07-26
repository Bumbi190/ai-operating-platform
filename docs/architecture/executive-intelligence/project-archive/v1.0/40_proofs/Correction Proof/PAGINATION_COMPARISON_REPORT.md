# Executive Intelligence — Professional Edition v1.0
## PAGINATION COMPARISON REPORT — Phase 3.3.1

> Three comparative layout proofs built from **identical verbatim canonical text**, plus a measured
> full-book page-count projection for each layout and an assessment of release-format options.
> No canonical text is added, removed, shortened, or rewritten in any layout. This is a decision
> aid — **no final layout or release decision is made here.**

**Generated:** 2026-07-12 (UTC)
**Proofs:** `Correction Proof/Pagination/Pagination Proof — Layout {A,B,C}.pdf`
**Page renders:** `Correction Proof/Pagination/Pagination Proof Pages/Layout {A,B,C}/` (PNG, inspected).

---

## 1. Proof text selection (identical across A / B / C)

The same canonical blocks are typeset in all three layouts, so differences are purely typographic.

| Source | Sections | Blocks | Words | Character of the text |
|---|---|---|---|---|
| Chapter 1 — Executive Intelligence Manifesto | §§1.1–1.9 | 167 | 1,328 | normal doctrine, many short paragraphs and a list |
| Chapter 17 — Damage Boundary | §§17.1–17.12 | 150 | 697 | governance, callouts, boundary language |
| Chapter 25 — Executive Performance Intelligence Integration | §§25.1–25.10 | 167 | 588 | dense performance text and long lists |
| **Total** | | **484** | **2,613** | |

All text is reproduced verbatim from Canonical v1.0 via `content_map.json` (itself parsed from the locked
DOCX). Both chapter-opening options are demonstrated on real chapter openings (1, 17, 25) in every proof.

---

## 2. Exact layout values

| Parameter | Layout A — Current Baseline | Layout B — Controlled Compact | Layout C — Reference Optimized |
|---|---|---|---|
| Page size | US Letter 612×792 pt | US Letter 612×792 pt | US Letter 612×792 pt |
| Body font | DejaVu Serif 10.5 pt | DejaVu Serif 10.5 pt | DejaVu Serif 10.5 pt |
| Leading | 14.5 pt | 14.5 pt | 14.0 pt |
| Paragraph space-after | 3.5 pt | 1.6 pt | 2.4 pt |
| List space-after | 2.5 pt | 1.1 pt | 1.5 pt |
| Heading space before / after | 12 / 5 pt | 7 / 3 pt | 9 / 4 pt |
| Top / bottom margin | 1.25″ / 1.00″ | 1.17″ / 0.94″ | 1.19″ / 0.97″ |
| Horizontal margins | 1.15″ / 1.00″ (locked) | 1.15″ / 1.00″ (locked) | 1.15″ / 1.00″ (locked) |
| Keep-with-next | off | on | on |
| Widow / orphan control | off | on | on |
| Keep-together (≤ n lines) | — | ≤ 3 | ≤ 4 |
| Colour & heading hierarchy | locked Executive Gold | unchanged | unchanged |

Layout A reproduces the Candidate v1 body layout as a control group; its widow/orphan flaws are **not**
silently corrected. B changes only spacing and break control (font, size, colour, hierarchy untouched).
C additionally tightens leading to the 13.8–14.2 pt reference band (14.0 pt) for a more efficient vertical
rhythm while keeping generous margins.

---

## 3. Proof measurements (this 484-block / 2,613-word selection)

| Metric | Layout A | Layout B | Layout C |
|---|---|---|---|
| Proof pages (incl. info + 6 opening pages) | 25 | 23 | 23 |
| Widows | 2 | **0** | **0** |
| Orphans | 2 | **0** | **0** |
| Heading at page bottom | 2 | 1 | **0** |
| Near-empty tail pages | 1 | 0 | **0** |

The identical selection is used in all three (the ≈24–36-page target is met by the identical-selection
alternative permitted by the brief; Layout A lands at 25 pages).

---

## 4. Full-book page-count projection (measured, not guessed)

The three layout engines were run over the **entire** canonical body (front matter + all 32 chapters,
each chapter resetting to a fresh body page, exactly as the production builder does). Layout A was
calibrated against Candidate v1's known body-page count (1,844 body pages / 1,908 total); the same
64 structural pages (cover, title, TOC, 10 part dividers, 32 chapter openings, 18 diagram pages) are
constant across layouts and added back.

| Measure | Layout A | Layout B | Layout C |
|---|---|---|---|
| Words per page | 119 | 136 | 132 |
| Canonical blocks per page | 30.5 | 34.8 | 33.7 |
| Projected **full-book total pages** | **1,908** | **≈1,677** | **≈1,733** |
| Δ vs Candidate v1 (1,908) | 0.0% | **−12.1%** | **−9.2%** |
| Full-book widows | 39 | **0** | **0** |
| Full-book orphans | 39 | **0** | **0** |
| Headings stranded at page bottom | 215 | 27 | 24 |
| Paragraphs split across a page break | 43 | 1 | 0 |
| Near-empty tail pages | 4 | 2 | 1 |

Calibration check: the Layout A engine reproduces 1,844 body pages (vs the candidate's 1,844) to within
0.6% before calibration, so the B/C projections are trustworthy. The residual "heading at page bottom"
count in B/C (27/24) is almost entirely **consecutive-heading chapter boundaries** (a section heading
immediately followed by a subsection heading); it can be driven to ~0 in the final build with a
heading-to-heading keep-group, and is noted here for the human decision.

---

## 5. Widow / orphan rules implemented in Layout B and C

Both B and C enforce, and the proofs were inspected to confirm:

1. **No single word alone on a new page** — trailing-line pull-down: if a break would leave exactly one
   line of a paragraph, one earlier line is carried over so at least two lines move together.
2. **No single end-line alone on a page** — same rule (widow control), verified 0 across the full book.
3. **No heading at the bottom of a page without following text** — keep-with-next reserves the heading
   plus its first two body lines (now including the heading's after-space, so the following block cannot be
   bumped away).
4. **At least two body lines after a heading** — guaranteed by the keep-with-next reservation.
5. **At least three lines of a split paragraph per page where technically avoidable** — orphan control plus
   keep-together (≤3 lines B, ≤4 lines C); full-book split-paragraph count falls from 43 (A) to 1 (B) / 0 (C).
6. **No near-empty tail page carrying only a paragraph tail** — reduced from 4 (A) to 2 (B) / 1 (C).

Layout A intentionally implements none of these, so the reviewer can see the baseline defects directly
(e.g., proof pages showing a stranded heading and a near-empty transition page).

---

## 6. Chapter-opening options (demonstrated in every proof)

The generic Candidate v1 line **"The chapter continues with its actual first section on the following
page."** is not canonical book text and is absent from both options.

- **Option A — Clean Chapter Opening:** dark page with chapter number, exact canonical title, gold rule,
  and a quiet edition footer. No boilerplate, no invented intro, no summary.
- **Option B — Canonical Opening Excerpt:** dark page with chapter number, exact canonical title, then the
  **verbatim** beginning of the chapter's real first canonical section (e.g., Ch 1 §1.1 "Executive
  Intelligence is the leadership layer of Omnira. It exists because an AI Operating System cannot scale
  through isolated agents…"). No rewriting, no shortening that changes the text.

Both options are rendered for chapters 1, 17, and 25 in each layout PDF (pages labelled "OPENING OPTION A"
and "OPENING OPTION B").

---

## 7. Readability / premium / navigability / reviewability assessment

| Dimension | Layout A | Layout B | Layout C |
|---|---|---|---|
| Readability | Generous but loose; frequent stranded headings and near-empty tails interrupt reading. | Comfortable; tightest spacing but 14.5 pt leading keeps lines airy. | Best balance; 14.0 pt leading with moderate spacing gives an even, book-like rhythm. |
| Premium feel | Baseline; the widow/orphan defects read as unfinished. | Clean and controlled; risks looking slightly dense in list-heavy chapters. | Strongest; disciplined vertical rhythm without looking cramped or report-like. |
| Navigability | 1,908 pp — heaviest to page through. | ≈1,677 pp — lightest. | ≈1,733 pp — nearly as light as B. |
| Reviewability | Defects make review noisier. | Excellent (0 widows/orphans). | Excellent (0 widows/orphans, 0 split paragraphs, 1 near-empty tail). |
| Risk | Ships known defects — not acceptable as final. | Very low; watch density in the longest list chapters (11, 14, 27). | Very low; the safest premium result. |

---

## 8. Release-format options (assessed, not produced)

Assessment only — **nothing is produced**, and chapter order is never changed. Volume boundaries follow the
**ten navigational Parts** already defined in `navigation_map.json`.

**Option 1 — Single-volume master (all 32 chapters, one PDF).**
At ≈1,677–1,733 pp (B/C) the file remains a single ~3–3.5 MB PDF. Pros: one canonical artifact, one TOC,
one set of bookmarks, easiest to checksum and cite; ideal for digital review and full-text search. Cons:
a ~1,700-page print binding is impractical as a single physical volume; scrolling to a late chapter is slow.

**Option 2 — Master PDF + multi-volume edition (recommended shape to evaluate).**
Keep the single-volume master as the canonical, checksummed source of truth, and additionally split into
per-Part volumes for reading/printing. Pros: preserves one authoritative master while making each Part a
comfortable stand-alone book; version control stays anchored to the master's SHA-256; each volume can carry
a local TOC plus a pointer to the master manifest. Cons: must guarantee the concatenation of volumes is
byte-faithful to the master's page stream, and the manifest must track both.

**Option 3 — Multi-volume only.**
Per-Part volumes with no single master. Pros: smallest files, simplest to distribute. Cons: **no single
complete canonical artifact** to checksum or cite; cross-Part references and global navigation weaken;
higher risk of the volumes drifting out of sync. Not advisable for a canonical edition.

**Suggested logical volume boundaries (ten Parts, order unchanged) — for the human to confirm:** the ten
navigational Parts map cleanly onto ten volumes; Parts with the longest chapters (the Decision Ledger,
Prioritization, Approval Inbox, and Crisis chapters) will dominate their volumes' page counts, which is the
main thing to weigh when deciding whether to group adjacent short Parts.

---

## 9. Recommendation (decision remains with the human)

- **Layout:** **Layout C — Reference Optimized** is recommended as the strongest balance of premium feel,
  readability, and reviewability: it eliminates all widows and orphans, produces zero split paragraphs and a
  single near-empty tail across the whole book, and lands at **≈1,733 pages (−9.2%)** without looking cramped.
  **Layout B** is the recommended fallback if maximum page reduction (**≈1,677 pp, −12.1%**) is prioritised
  over C's slightly more generous rhythm. **Layout A must not ship** — it carries the known widow/orphan and
  stranded-heading defects.
- **Chapter openings:** both options are clean and canonical; **Option B (canonical excerpt)** gives a more
  substantial, book-like opening, while **Option A (clean)** is the safer minimalist choice. Recommend
  choosing one project-wide.
- **Release format:** evaluate **Option 2 (master + per-Part multi-volume)** first; it preserves a single
  canonical checksummable master while giving readable per-Part volumes.

These are recommendations only. The final layout, chapter-opening, and release-format decisions are left to
human design and pagination review.
