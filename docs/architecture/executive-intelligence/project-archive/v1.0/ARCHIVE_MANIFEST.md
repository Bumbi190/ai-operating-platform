# Executive Intelligence — Project Archive v1.0 — Manifest

**Skapad:** 2026-07-26 (Phase 5C.2 — Recovery Material Integration)
**Status:** Ostagade filer i working tree. Ingen `git add`, commit, push eller PR utförd.
**Branch:** `docs/executive-intelligence-project-archive-v1`
**Bas-commit:** `6f51206f9a139c11a3ade846f8de8da718070829` (= `github-safe/main`)

## Syfte
Fullständig, permanent kopia av det meningsbärande Executive Intelligence-projektmaterialet, integrerat i repot som vanlig Git (ingen Git LFS, inga tar.gz-arkiv). GitHub blir därmed den externa permanenta kopian.

## Provenance
- **Recovery source:** `/Users/andrehultgren/Projects/Project-Recovery-2026-07-24/05_BOOKS/02_EXECUTIVE_INTELLIGENCE` (+ recovery-notes från `04_OMNIRA`).
- Den tidigare externa SSD:n (`/Volumes/2T_SSD_AI`) är havererad och användes inte.
- Varje fil kopierades content-only och verifierades med SHA-256 (source = destination).

## Integrationsklassificering
| Klass | Antal | Åtgärd |
|-------|-------|--------|
| NEW_FILE | 272 | kopierade hit (detta arkiv) |
| ALREADY_PRESENT_VERIFIED | 85 | INTE dupliserade; ligger redan i repot, SHA-256-verifierade |
| CONFLICT_DIFFERENT_CONTENT | 0 | — |
| **Meningsbärande totalt** | **357** | unmapped = 0 |

De 85 redan-närvarande utgörs av 53 filer identiska med Atlas-paketet (PR #50) och 32 Omnira-arkitekturdocs som redan är committade. Dessa lämnades orörda.

## Innehåll (NEW_FILE per mapp)
| Mapp | Filer |
|------|-------|
| 00_source-and-build/ (omnira-notes) | 3 |
| 10_canonical-edition/ | 39 |
| 20_professional-edition/ | 1 |
| 30_candidates/ | 6 |
| 40_proofs/ (inkl. 128 render-PNG öppet) | 154 |
| 50_design-system/ | 16 |
| 60_editorial-history/ | 4 |
| 80_atlas-knowledge-history/ | 1 |
| 90_production-staging/ | 48 |
| **Summa** | **272** |

## Filtyper
png 132 · md 50 · docx 34 · pdf 31 · py 15 · json 7 · zip 3. Största enskilda fil: 5,81 MB. Total storlek: ~55,7 MB.

## Integritet
- Alla ändringar ligger under `docs/architecture/executive-intelligence/project-archive/v1.0/`.
- Atlas-paketet (`atlas-knowledge/v1.0/package`) och `professional-edition/v1.0/` är orörda (ingen diff).
- Inga `.DS_Store`, `__pycache__` eller `*.pyc` medföljde.
- Per-fil-checksummor: se `CHECKSUMS.sha256` (272 poster, sökvägar relativa till denna mapp).

## Ej gjort (per fasregler)
git add · commit · push · PR · Git LFS · tar.gz · deployment · ändring av befintliga paket.
