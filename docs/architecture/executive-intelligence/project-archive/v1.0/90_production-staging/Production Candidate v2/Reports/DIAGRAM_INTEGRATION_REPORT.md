# DIAGRAM INTEGRATION REPORT — Candidate v2

> How the human-approved diagram set was integrated into Candidate v2. 17 diagrams included; D14 removed.
> Every node/label/relation is traceable to Canonical v1.0; no new doctrine was introduced.

**Generated:** 2026-07-14 · **Module:** `Source/diagrams_v2.py` (+ `diagrams_toolkit.py`).

## 1. Integration summary

| Disposition | Diagrams | Renderer |
|---|---|---|
| Kept unchanged (as approved in Candidate v1) | D01, D02, D10, D11, D18 | ported verbatim from the Candidate v1 builder |
| Corrected / rebuilt (Phase 3.3.1 assets) | D03, D05, D06, D07, D08, D09, D12, D13, D15, D16, D17 | Phase 3.3.1 corrected drawers |
| Corrected — contrast fix only | D04 | Phase 3.3.1 drawer + contrast fix |
| **Removed** | **D14** | not rendered; excluded from sequence, TOC, bookmarks, links, count |

Total included: **17**.

## 2. D04 — contrast fix (in-book)

D04 keeps its approved model, structure, geometry, labels, and relationships. The only change is a
**visual contrast correction**: the two innermost boundary labels — "Least Privilege (§6.8) · Authority
Narrowing (§6.40)" and "Isolated Project (§6.4 Boundary Model)" — are now drawn in high-contrast warm
(cream) text with brighter ring frames (Executive Gold palette members RED / GOLD / GHOST / GOLD only).
No label text, relationship, geometry, or doctrine was changed beyond legibility. Verified in-book at
page 153.

## 3. D14 — removal (REDUNDANT WITH D01)

Per the human decision "REMOVE FROM PROFESSIONAL EDITION — REDUNDANT WITH D01":

- D14 is excluded from the diagram sequence (no diagram page for Chapter 25's former D14 anchor).
- D14 is absent from the Table of Contents, the PDF bookmarks/outline, and the internal navigation links.
- The diagram count is updated to 17; bookmarks fall from 67 (v1) to 66.
- Chapter text is unchanged.
- **No merge with D01 was performed.**
- D14 assets are preserved as historical proof/archive material in
  `Correction Proof/Diagrams/` and the `Diagram Review Package/` (not deleted).

## 4. Page placement (Candidate v2)

| Diagram | Page | Canonical source | Status |
|---|---|---|---|
| D01 Omnira Intelligence Position Model | 23 | Ch 2 §§2.2–2.3 | kept |
| D02 Executive · Manager · Workforce | 45 | Ch 3 §3.2 | kept |
| D03 Portfolio Executive vs Project Executive | 107 | Ch 4 §4.4 · Ch 5 §5.4 | rebuilt |
| D04 Project Isolation & Executive Boundaries | 153 | Ch 6 §§6.4–6.8, 6.40–6.43 | contrast fix |
| D05 Leadership Loop — Executive Operating Cadence | 209 | Ch 7 §7.4, §§7.8–7.70 | rebuilt |
| D06 Decision Lifecycle | 349 | Ch 10 §§10.3–10.85 | rebuilt |
| D07 Decision Ledger — Status States | 396 | Ch 11 §§11.48–11.60 | rebuilt |
| D08 Prioritization Classes & Opportunity Cost | 608 | Ch 14 §§14.50–14.55 · Ch 15 | rebuilt |
| D09 Governance Layers & Authority Gradient | 658 | Ch 16 §§16.6–16.31 | rebuilt |
| D10 Damage Severity & Boundary States | 720 | Ch 17 §§17.100–17.119 | kept |
| D11 Autonomy Licensing Model | 781 | Ch 18 · Terminology Guide | kept |
| D12 Trust Score & Autonomy Progression | 852 | Ch 19 · Terminology Guide L0–L6 | corrected (label fix) |
| D13 Executive Mission Delegation Flow | 974 | Ch 21 §§21.6–21.12 · Ch 20 §20.3 | rebuilt |
| D15 Operating Graph vs Intelligence Graph | 1303 | Ch 26 §§26.3–26.5, 26.14–26.26, 26.58–26.76 | rebuilt |
| D16 Approval Flow — Status Lifecycle | 1366 | Ch 27 §§27.43–27.59 | rebuilt |
| D17 Crisis Mode & Emergency Brake | 1439 | Ch 28 §§28.3–28.5, 28.28–28.32, 28.71–28.73 | rebuilt |
| D18 Stage 1 vs Future Target Architecture | 1700 | Front matter — Implementation Scope | kept |

(D14 — no page; removed.)

## 5. No-new-doctrine confirmation

Every diagram node and relationship in Candidate v2 is drawn from the cited Canonical v1.0 section text.
No new model, relationship, risk class, authority rule, or autonomy level was introduced. The kept
diagrams reproduce the human-approved Candidate v1 renderings; the corrected diagrams reproduce the
Phase 3.3.1 assets approved in the Corrected Diagrams Review Pack; D04 differs only by contrast.
