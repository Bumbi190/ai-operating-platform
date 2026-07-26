# Omnira — Executive Intelligence — Professional Edition
## PRODUCTION CANDIDATE v3 — MANIFEST

> PRODUCTION CANDIDATE v3 — NOT FINAL PROFESSIONAL RELEASE. Built only inside `Production Candidate v3/`.
> Candidate v1 and Candidate v2 are preserved unchanged as audit versions.

**Generated:** 2026-07-14T17:47:51Z

## 1. Candidate v3

| Field | Value |
|---|---|
| Path | `Production Candidate v3/Candidate/Omnira — Executive Intelligence — Professional Edition Candidate v3.pdf` |
| Size (bytes) | 3143953 |
| SHA-256 | `5db47d82e3744bca9f624fb818a92bf6f6c0fd45b9a87ed5a9d26c2818aa672d` |
| Pages | 1740 |
| Page size | US Letter (612×792 pt), uniform |
| Chapters | 32 |
| Parts | 10 |
| Diagrams | 17 (all dark family; D14 removed) |
| Canonical section identifiers | 6705 |
| Bookmarks | 66 |
| Internal TOC links | 60 |
| Layout | Layout C — Reference Optimized (locked, unchanged) |
| Chapter openings | Opening Option B (QA line removed) |
| Build status | PRODUCTION CANDIDATE v3 — not final release |

## 2. Corrections from Candidate v2 → v3

- **Blocker A:** Chapter-tail cohesion added — no chapter ends on a stray-sentence page (v2 page 454 fixed). No text change, no section-ID reorder.
- **Blocker B:** Removed the chapter-opening line "Opening excerpt is verbatim canonical text — no boilerplate, no rewrite." from all 32 openings.
- **Blocker C:** Removed the diagram footnote "Additive presentation layer … no new doctrine introduced." from all diagrams (canonical source line retained).
- **Blocker D:** Rebuilt D02, D10, D11, D18 in the dark Executive Gold template so all 17 diagrams form one family. Content/labels/levels/categories/colours unchanged.
- Candidate status updated to v3 (cover, title, metadata, filename, reports, manifest).

## 3. Read-only sources (verified unchanged before AND after)

| Item | SHA-256 | Status |
|---|---|---|
| Canonical Edition v1.0.docx | `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8` | unchanged ✓ |
| Professional Edition Candidate v1.pdf | `fa5f733084271d56a778c40ea87e05613154e3e35d62b31d279983fdb18485f6` | unchanged ✓ |
| Professional Edition Candidate v2.pdf | `14f1bea848bcf0edc5f13ac7317db7bb8b26b2c27899038425028b97d3e04a62` | unchanged ✓ |
| Design Proof v1.pdf | `072736e54c0c4784bb79b4c3aa18981774b1c66069a27053cfc424b7886356fd` | unchanged ✓ |
| Design Proof v2.pdf | `01b307ee82c4ff16f68d58b3529c9ed936d34b8f393ef18d01b82fe3a819ef1a` | unchanged ✓ |
| Blueprint Volume I.pdf | `fdad5e22d5b47595c4ebe04969532517196ec83930e027d3ead54eec29e9efec` | unchanged ✓ |

Candidate v2 = `14f1bea8…d3e04a62`, Candidate v1 = `fa5f7330…b18485f6`, Canonical = `ee85a1a0…0fa555b8` — all identical before and after.

## 4. Build inputs (data maps, read-only — shared with Candidate v1/v2 Source)

| Item | SHA-256 |
|---|---|
| content_map.json | `74ff02ce0adeaaf5605063b678f302ea6494b556f19bc7256acaa877e16a4f7e` |
| navigation_map.json | `6efe4662530075cd2163048ea43703b3e5e05e1c4553f6a7d4a650b9e2b4622d` |
| diagram_source_map.json | `938eefaa524b5689699ed72a03deabf13b561a8cf3b61dc05a86c5a086b868e9` |

## 5. Candidate v3 source scripts (`Production Candidate v3/Source/`)

| Bytes | SHA-256 | File |
|---|---|---|
| 1857 | `4d69f284eba9742cd95f3f47de2b9c5c3dc3df089926555e5240dcbc13549183` | analyze.py |
| 27322 | `8ca741ec8213b424fa73bd3f1518d95a06a79abc88dd4b87ec1e455bbefb41b6` | build_candidate_v3.py |
| 11472 | `fe4db89140cb9bf052106e3271f6912236f8be10b4b5979a8b6f9c21b8a1bfee` | diagrams_toolkit.py |
| 32248 | `15e64a535cf5678e411e5a143a528e51e659583e88a24d66a5d67801530410af` | diagrams_v3.py |
| 13807 | `4475a6e1c2448bc430a564a9e044a9069fed8a09b9c1c24133342e64933aa040` | build_pagemap_v3.json |

Candidate v1 and v2 build scripts were not overwritten; v3 uses `build_candidate_v3.py` and `diagrams_v3.py`.

## 6. Render sets (aggregate SHA-256, name-ordered)

| Set | Files | Aggregate SHA-256 |
|---|---|---|
| Renders/Pages/ | 1740 | `3d7511570eaecbd002503643031d610f6d965cb5dae1a159e8ffc7538c117bff` |
| Renders/Contact Sheets/ | 44 | `dbc1078480613a3987d9b633ad6bd65433f383414cff8b262fd206db17b25382` |

## 7. Tools & versions

Python 3.10.12, reportlab 4.5.1, pypdf 6.13.1, pdfplumber 0.11.9, Pillow 12.2.0, poppler 22.02.0, qpdf 10.6.3, ImageMagick montage. No dependencies installed.

## 8. Build commands

```
cd 'Production Candidate v3/Source'
BUILD_MODE=measure   python3 build_candidate_v3.py
BUILD_MODE=candidate OUT=<candidate v3.pdf> python3 build_candidate_v3.py
pdftoppm -png -r 85 <candidate v3.pdf> Renders/Pages/p
```

## 9. QA summary

| Check | Result |
|---|---|
| Canonical tokens matched in order | 228,356 / 228,356 (complete) |
| Chapters / front matter / section IDs / blocks | 32 / 4 / 6705 / 55,840 |
| Widows / orphans / split paragraphs / stranded headings | 0 / 0 / 0 / 0 |
| Near-empty tail pages (chapter ends) | 0 |
| Sparse body pages (<45 words or <20% area) | 1 (p454, reviewed — 13 lines / 28.9% fill, acceptable chapter end) |
| Chapter-opening QA line / diagram QA footnote | 0 / 0 |
| D14 occurrences | 0 |
| Diagrams dark family | 17 / 17 |
| qpdf --check | clean |
| Fonts embedded (DejaVu) | yes |

## 10. Confirmations

- Only files under `Production Candidate v3/` were created. Candidate v1 and v2 and their trees are unchanged.
- Canonical v1.0, Candidate v1, Candidate v2, Proof v1/v2, Design References unchanged (checksums identical).
- D14 absent from Candidate v3; D14 assets preserved in Correction Proof as archive.
- All 17 diagrams use the dark family; D02/D10/D11/D18 rebuilt dark with identical content; no new relations/doctrine.
- Reserved final filename `Omnira — Executive Intelligence — Professional Edition v1.0.pdf` was NOT created.
- No final edition, no Atlas edition, no multi-volume; nothing copied to SSD or Omnira repo; no Git action; no dependency install.
