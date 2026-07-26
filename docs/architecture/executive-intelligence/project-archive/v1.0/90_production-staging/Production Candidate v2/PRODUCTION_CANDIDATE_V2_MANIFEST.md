# Omnira — Executive Intelligence — Professional Edition
## PRODUCTION CANDIDATE v2 — MANIFEST

> PRODUCTION CANDIDATE v2 — NOT FINAL PROFESSIONAL RELEASE. Built only inside `Production Candidate v2/`.
> Candidate v1 and all locked sources were not modified.

**Generated:** 2026-07-14T11:51:34Z

## 1. Candidate v2

| Field | Value |
|---|---|
| Path | `Production Candidate v2/Candidate/Omnira — Executive Intelligence — Professional Edition Candidate v2.pdf` |
| Size (bytes) | 3148079 |
| SHA-256 | `14f1bea848bcf0edc5f13ac7317db7bb8b26b2c27899038425028b97d3e04a62` |
| Pages | 1740 |
| Page size | US Letter (612×792 pt), uniform |
| Chapters | 32 |
| Parts (navigational) | 10 |
| Diagrams | 17 (D14 removed) |
| Canonical section identifiers | 6705 |
| Bookmarks (outline) | 66 |
| Internal TOC links | 60 |
| Layout | Layout C — Reference Optimized (locked) |
| Chapter openings | Opening Option B — Canonical Excerpt |
| Fonts | DejaVu Serif/Sans/Mono (embedded, subset); unused Helvetica base-14 (safe) |
| Build status | PRODUCTION CANDIDATE v2 — not final release |

## 2. Read-only source inputs (verified unchanged before AND after)

| Item | SHA-256 | Status |
|---|---|---|
| Canonical Edition v1.0.docx | `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8` | unchanged ✓ |
| Professional Edition Candidate v1.pdf | `fa5f733084271d56a778c40ea87e05613154e3e35d62b31d279983fdb18485f6` | unchanged ✓ |
| Design Proof v1.pdf | `072736e54c0c4784bb79b4c3aa18981774b1c66069a27053cfc424b7886356fd` | unchanged ✓ |
| Design Proof v2.pdf | `01b307ee82c4ff16f68d58b3529c9ed936d34b8f393ef18d01b82fe3a819ef1a` | unchanged ✓ |
| Blueprint Volume I.pdf | `fdad5e22d5b47595c4ebe04969532517196ec83930e027d3ead54eec29e9efec` | unchanged ✓ |
| Blueprint Volume I.docx | `457a77ac42a91433d13b668b8432bb0f13f5734fada09635ec2673e0f27e4943` | unchanged ✓ |
| v1 build_professional_edition.py | `bb98e329c1995269c3f5d77d9582c7105584159cc87266442a668b94f3872dd0` | unchanged ✓ |

Candidate v1 checksum re-verified against `Production/Reports/PRODUCTION_CANDIDATE_MANIFEST.md` = `fa5f7330…b18485f6`. Canonical master SHA-256 = `ee85a1a0…0fa555b8`. All read-only sources identical before and after the v2 build.

## 3. Build inputs (data maps, read-only — shared with Candidate v1 Source)

| Item | SHA-256 |
|---|---|
| content_map.json | `74ff02ce0adeaaf5605063b678f302ea6494b556f19bc7256acaa877e16a4f7e` |
| navigation_map.json | `6efe4662530075cd2163048ea43703b3e5e05e1c4553f6a7d4a650b9e2b4622d` |
| diagram_source_map.json | `938eefaa524b5689699ed72a03deabf13b561a8cf3b61dc05a86c5a086b868e9` |

## 4. Candidate v2 source scripts (`Production Candidate v2/Source/`)

| Bytes | SHA-256 | File |
|---|---|---|
| 1857 | `4d69f284eba9742cd95f3f47de2b9c5c3dc3df089926555e5240dcbc13549183` | analyze.py |
| 25431 | `bf135c5efae5e28141c020eec5b80f3adcf1236d4b2c9e5054042535f7d6541d` | build_candidate_v2.py |
| 11576 | `5c4ec8cf33f8ed94c486efc89526857dcc40a7006a968e930b36c163354ee1cd` | diagrams_toolkit.py |
| 24107 | `83e3e1a9b9b199833aa56a3f2b64ef6980854fb7342c4d8f6afd16041a297af5` | diagrams_v2.py |
| 10325 | `5803619b26121f9489e819311fc2774996da4e12f3e3fff0bd36662d368b5a46` | layout_engine_ref.py |
| 13807 | `4475a6e1c2448bc430a564a9e044a9069fed8a09b9c1c24133342e64933aa040` | build_pagemap_v2.json |

Candidate v1 build scripts were not overwritten; v2 uses its own builder (`build_candidate_v2.py`) and diagram modules (`diagrams_v2.py`, `diagrams_toolkit.py`).

## 5. Reports (`Production Candidate v2/Reports/`)

| Bytes | SHA-256 | File |
|---|---|---|
| 3641 | `3ac96c157f7e2641737f7ac3981cdabf01e019fcd5090488cc05563c5b3e0627` | CANDIDATE_V2_BUILD_REPORT.md |
| 3131 | `0390bf4482f9240494496e183195cecba69cde99eadcfa6eaf3e53404f5479a1` | CONTENT_COMPLETENESS_REPORT.md |
| 4190 | `81a3b37f099274cc8cff41a10fc30a6434c8c5875d5c9df876689677fc57cd2e` | DIAGRAM_INTEGRATION_REPORT.md |
| 2956 | `10ad09bde3ef4339b203aaeb988525e1b0dd524170310cc6f9dac32dcab2a588` | STRUCTURAL_PDF_QA_REPORT.md |
| 4241 | `db1af99bf0912795203afeb9759c0a8c718ef1182c7ef7ea8fe0b8dcd9b6513e` | VISUAL_QA_REPORT.md |

## 6. Render sets (aggregate SHA-256 = hash of concatenated per-file SHA-256 in filename order)

| Set | Files | Aggregate SHA-256 |
|---|---|---|
| Renders/Pages/ | 1740 | `acee80d1ac9710f8359ff039052def20a57d2edc863a9d6d081fd386184fec7e` |
| Renders/Contact Sheets/ | 46 | `deca84cb1c74dcafee2ec24a0b88d8a199009d877ba5771f31b14be6720a3a41` |

## 7. Tools & versions

Python 3.10.12, reportlab 4.5.1, pypdf 6.13.1, pdfplumber 0.11.9, Pillow 12.2.0, poppler 22.02.0 (pdftoppm/pdfinfo/pdffonts/pdftotext), qpdf 10.6.3, ImageMagick montage. No dependencies were installed.

## 8. Build commands

```
cd 'Production Candidate v2/Source'
BUILD_MODE=measure   python3 build_candidate_v2.py            # page map + totals
BUILD_MODE=candidate OUT=<candidate.pdf> python3 build_candidate_v2.py   # single-pass build
pdftoppm -png -r 85 <candidate.pdf> Renders/Pages/p           # page renders
montage … Renders/Contact\ Sheets/…                          # contact sheets
```

## 9. QA results (summary)

| Check | Result |
|---|---|
| Canonical tokens matched in order | 228,356 / 228,356 (complete subsequence) |
| Chapters / front-matter sections / section IDs | 32 / 4 / 6705 |
| Widows / orphans / split paragraphs / stranded headings | 0 / 0 / 0 / 0 |
| Near-empty tail pages | 1 (p454, Ch 11 closing sentence — documented) |
| Chapter-opening boilerplate | 0 |
| D14 occurrences | 0 |
| Review/proof markers in book | 0 |
| qpdf --check | clean |
| Page size uniform | yes (Letter) |
| Fonts embedded (DejaVu) | yes (subset) |

## 10. Confirmations

- Only files under `Production Candidate v2/` were created. Candidate v1 and its Production tree were not touched.
- Canonical v1.0, Candidate v1, Proof v1/v2, Design References (Blueprint), and the v1 build script are byte-for-byte unchanged.
- D14 is absent from Candidate v2 (sequence, TOC, bookmarks, links, count); D14 assets preserved in Correction Proof as archive.
- D04 is contrast-fixed; all other diagrams per approved assets. No new diagram relationships or doctrine.
- The reserved final-release filename `Omnira — Executive Intelligence — Professional Edition v1.0.pdf` was NOT created.
- No final Professional Edition, no Atlas Knowledge Edition, no multi-volume edition.
- Nothing copied to the SSD original or the Omnira repo; no Git action; no deployment; no dependency install.
