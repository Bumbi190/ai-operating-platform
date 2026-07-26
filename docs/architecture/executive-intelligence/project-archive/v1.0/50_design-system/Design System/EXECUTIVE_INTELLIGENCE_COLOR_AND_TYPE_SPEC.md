# Executive Intelligence — Professional Edition v1.0

## Color & Type Specification (LOCKED — Phase 3.2)

## 1. Color system — "Executive Gold" (LOCKED)

| Role | Name | HEX |
|---|---|---|
| Dark primary background | Deep Petrol Night | `#0E1A26` |
| Light body background | Paper White | `#FFFFFF` |
| Primary text on light | Ink | `#14202B` |
| Primary text on dark | Warm Paper | `#F4F1EA` |
| Secondary text | Slate | `#5A6672` |
| Primary accent | Executive Gold | `#C8A24B` |
| Structural accent | Blueprint Navy | `#1F3B57` |
| Table header / petrol | Petrol | `#183850` |
| Warning / damage | Damage Red | `#B4442E` |
| Future / not implemented | Ghost Grey | `#8A939D` |

### Gold discipline (LOCKED)

Executive Gold is used sparingly. It primarily marks: executive judgment, important
decisions, chapter numbers, authority, approved control points, and central diagram nodes.
Gold is never used as general decoration on every page. On any given body page gold appears
in at most a chapter number, a rule accent, or a single emphasized control marker.

## 2. Typography (LOCKED — installed fonts only)

No fonts are downloaded, installed, copied, or shared. All three families are already present
in the production environment (verified via `fc-list`) and embed cleanly.

| Use | Family |
|---|---|
| Body text | DejaVu Serif |
| Headings & navigation | DejaVu Sans |
| Technical labels & diagram metadata | DejaVu Sans Mono |

### Exact typographic values (proof baseline)

| Element | Font | Size | Leading | Tracking | Space before / after |
|---|---|---|---|---|---|
| Body text | DejaVu Serif | 10.5 pt | 14.5 pt | 0 | 0 / 5 pt |
| Chapter eyebrow ("CHAPTER 16") | DejaVu Sans Mono | 8.5 pt | 12 pt | +2.2 pt (letterspaced) | 0 / 4 pt |
| Chapter title (H1) | DejaVu Sans Bold | 26 pt | 30 pt | 0 | 0 / 10 pt |
| Section heading (H2, e.g. "16.1") | DejaVu Sans Bold | 12.5 pt | 16 pt | 0 | 12 pt / 4 pt |
| Sub-heading (H3) | DejaVu Sans Bold | 10.5 pt | 14 pt | +0.3 pt | 8 pt / 2 pt |
| List item | DejaVu Serif | 10.5 pt | 14.5 pt | 0 | 0 / 3 pt |
| Table header text | DejaVu Sans Bold | 9 pt | 12 pt | +0.4 pt | — |
| Table body text | DejaVu Serif | 9.5 pt | 12.5 pt | 0 | — |
| Callout label | DejaVu Sans Mono Bold | 8 pt | 11 pt | +2.5 pt (letterspaced) | — |
| Callout body | DejaVu Serif | 10 pt | 13.5 pt | 0 | — |
| Diagram node label | DejaVu Sans | 8.5–10 pt | — | 0 | — |
| Diagram metadata / legend | DejaVu Sans Mono | 7.5–8 pt | — | +0.3 pt | — |
| Running header | DejaVu Sans | 7.5 pt | — | +1.2 pt (letterspaced) | — |
| Footer page number | DejaVu Sans | 8.5 pt | — | 0 | — |
| Part divider title | DejaVu Sans Bold | 30 pt | 36 pt | 0 | — |

### Readability rationale

Body is set at 10.5 pt on 14.5 pt leading — inside the 10.5–11 pt / 14–15 pt target — with a
constrained measure (see layout spec) so that thousands of numbered sections remain readable
over hundreds of pages. Readability is prioritized over maximum page compression. The proof
confirms the final exact size before full production.

## 3. Notes

Georgia (the Blueprint's intended face) is not installed in this environment and is therefore
not used; DejaVu Serif is the installed serif substitute and is consistent with how the
Blueprint PDF itself already renders. Any future switch to a licensed brand face would require
explicit authorization and font installation in the production environment.
