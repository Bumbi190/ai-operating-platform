# Omnira — Executive Intelligence — Professional Edition v1.0
## FINAL PROFESSIONAL EDITION — MANIFEST

> FINAL PROFESSIONAL RELEASE. Built only inside `Final Professional Edition/`. All candidate versions
> (v1, v2, v3) are preserved unchanged as audit lineage.

**Generated:** 2026-07-15T06:01:40Z

## 1. Final book

| Field | Value |
|---|---|
| Path | `Final Professional Edition/Book/Omnira — Executive Intelligence — Professional Edition v1.0.pdf` |
| Size (bytes) | 3143849 |
| SHA-256 | `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2` |
| Pages | 1740 |
| Page size | US Letter (612×792 pt), uniform |
| Chapters | 32 |
| Parts | 10 |
| Diagrams | 17 (dark family; D14 excluded) |
| Canonical section identifiers | 6705 |
| Bookmarks | 66 |
| Internal links | 60 |
| Layout | Layout C — Reference Optimized (locked) |
| Chapter openings | Opening Option B |
| Status | FINAL PROFESSIONAL RELEASE |

## 2. Exact diff from Candidate v3 (only allowed changes)

- Removed candidate status markings from cover and title page.
- Set final status: cover "PROFESSIONAL EDITION · VERSION 1.0"; title build status "FINAL PROFESSIONAL RELEASE".
- Final filename `Omnira — Executive Intelligence — Professional Edition v1.0.pdf` and final PDF metadata.
- D01 diagram source line normalised to "DIAGRAM D01 · Ch 2 §§2.2-2.3".
- Automatic build-date/checksum fields.

Page-render comparison (85 dpi) vs Candidate v3: **only pages 1 (cover), 2 (title), 23 (D01) differ**; the
other 1,737 pages are pixel-identical. No other visual, typographic, structural, or semantic change.

## 3. Read-only sources (verified unchanged before AND after)

| Item | SHA-256 | Status |
|---|---|---|
| Canonical Edition v1.0.docx | `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8` | unchanged ✓ |
| Professional Edition Candidate v1.pdf | `fa5f733084271d56a778c40ea87e05613154e3e35d62b31d279983fdb18485f6` | unchanged ✓ |
| Professional Edition Candidate v2.pdf | `14f1bea848bcf0edc5f13ac7317db7bb8b26b2c27899038425028b97d3e04a62` | unchanged ✓ |
| Professional Edition Candidate v3.pdf | `5db47d82e3744bca9f624fb818a92bf6f6c0fd45b9a87ed5a9d26c2818aa672d` | unchanged ✓ |

## 4. Build inputs (data maps, read-only)

| Item | SHA-256 |
|---|---|
| content_map.json | `74ff02ce0adeaaf5605063b678f302ea6494b556f19bc7256acaa877e16a4f7e` |
| navigation_map.json | `6efe4662530075cd2163048ea43703b3e5e05e1c4553f6a7d4a650b9e2b4622d` |
| diagram_source_map.json | `938eefaa524b5689699ed72a03deabf13b561a8cf3b61dc05a86c5a086b868e9` |

## 5. Final source scripts (`Final Professional Edition/Source/`)

| Bytes | SHA-256 | File |
|---|---|---|
| 1857 | `4d69f284eba9742cd95f3f47de2b9c5c3dc3df089926555e5240dcbc13549183` | analyze.py |
| 27131 | `b543697bace8ddf97bbac34f4678407d4f60fabb3f5fbcb49225017c3c3be101` | build_final_edition.py |
| 32390 | `cea444753d02e609d80ec5fb4a0735aeac18e99bfaac07649cf6bdccce06e83c` | diagrams_final.py |
| 11472 | `fe4db89140cb9bf052106e3271f6912236f8be10b4b5979a8b6f9c21b8a1bfee` | diagrams_toolkit.py |
| 13807 | `4475a6e1c2448bc430a564a9e044a9069fed8a09b9c1c24133342e64933aa040` | build_pagemap_final.json |

Candidate v3 build scripts were not overwritten; the final edition uses `build_final_edition.py` and `diagrams_final.py`.

## 6. Render sets (aggregate SHA-256, name-ordered)

| Set | Files | Aggregate SHA-256 |
|---|---|---|
| Renders/Pages/ | 1740 | `c6a13d39e6e3a2ee022afc5817ec618db28b6de6ff53bb404c75843a15480151` |
| Renders/Contact Sheets/ | 44 | `fddec1f629eee4a74c8d010eec175b99519f9ccbef99d62efea06c8199dfa870` |

## 7. Tools & versions

Python 3.10.12, reportlab 4.5.1, pypdf 6.13.1, pdfplumber 0.11.9, Pillow 12.2.0, poppler 22.02.0, qpdf 10.6.3, ImageMagick montage. No dependencies installed.

## 8. Build commands

```
cd 'Final Professional Edition/Source'
BUILD_MODE=measure python3 build_final_edition.py
BUILD_MODE=candidate OUT='../Book/Omnira — Executive Intelligence — Professional Edition v1.0.pdf' python3 build_final_edition.py
```

## 9. QA summary

| Check | Result |
|---|---|
| Canonical tokens matched in order | 228,356 / 228,356 |
| Chapters / front matter / section IDs / blocks | 32 / 4 / 6705 / 55,840 |
| Candidate / QA / boilerplate markers in book | 0 |
| D14 occurrences | 0 |
| D01 source line | "DIAGRAM D01 · Ch 2 §§2.2-2.3" |
| Diagrams (dark family) | 17 |
| Pages | 1740 (unchanged) |
| qpdf --check | clean |
| Fonts embedded (DejaVu) | yes |
| Release diff vs v3 | pages 1, 2, 23 only |

## 10. Confirmations

- Final Professional Edition created inside `Final Professional Edition/` only. Candidate v1/v2/v3 unchanged.
- Canonical v1.0, all candidates, Proof v1/v2, Design References unchanged (checksums identical).
- Final filename is exactly `Omnira — Executive Intelligence — Professional Edition v1.0.pdf`.
- All candidate markings removed; status is FINAL PROFESSIONAL RELEASE. D01 correctly numbered. D14 absent.
- No Atlas Knowledge Edition, no multi-volume edition; nothing copied to SSD or Omnira repo; no Git action; no dependency install.
