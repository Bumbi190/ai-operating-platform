# Source-to-Export Map — Omnira Mobile Intelligence & Device Control

**Canonical Edition v1.0 — APPROVED, utgåva r3** · godkänd av André Hultgren 2026-07-30

## Godkännande

| | |
|---|---|
| Status | APPROVED |
| Godkänd av | André Hultgren |
| Godkännandedatum | 2026-07-30 |
| Godkänd grund | r2-leveransen |

## Kedjan i sex led

```
Sources/Working-Drafts/            35 filer, OFÖRÄNDRADE, bevaras som proveniens
        │
        │  22 terminologikorrigeringar + filhygien (namn, metadata, rubrikhierarki)
        ▼
Sources/Canonical-Source-Set-v1.0/ 34 filer, canonical källa för r2
        │
        │  sammanslagning, front matter, delsidor, appendix
        ▼
Exports/…-r2/  Canonical Edition DOCX  ──▶  PDF   (review candidate, bevarad)
        │
        │  låsningspass: endast status- och paketmetadata
        ▼
Exports/Canonical-Edition-v1.0-APPROVED/  ──▶  DOCX + PDF (bevarad)
        │
        │  statusharmonisering: 35 statusrader
        ▼
Exports/Canonical-Edition-v1.0-APPROVED-r2/  ──▶  DOCX + PDF (bevarad)
        │
        │  BL-06 + BL-07: 2 stycken
        ▼
Exports/Canonical-Edition-v1.0-APPROVED-r3/  ──▶  DOCX + PDF (1 314 s)
                     │
                     ├──▶ Requirement Register v1.0.xlsx
                     ├──▶ Requirement-to-Architecture Traceability Matrix v1.0.xlsx
                     ├──▶ Requirement-to-Implementation Traceability Matrix v1.0.xlsx
                     ├──▶ Verification Matrix v1.0.xlsx
                     ├──▶ Canonical Glossary v1.0.docx
                     ├──▶ Editorial Review Report v1.0.docx
                     └──▶ Atlas-Knowledge-Edition-v1.0/  (Markdown + JSONL)
```

## Led 1 — Working-Drafts till Canonical Source Set

| Ursprunglig fil | Ny fil | Namnändring | Textändring |
|---|---|---|---|
| `00 — Omnira — Mobile Intelligence & Device Control — Canonical Decision Register v1.0.docx` | `00 — Canonical Decision Register v1.0.docx` | Ja | Ingen |
| `01 — Omnira — Mobile Intelligence & Device Control — Canonical Book Architecture and Chapter Plan v1.0.docx` | `01 — Canonical Book Architecture and Chapter Plan v1.0.docx` | Ja | Ingen |
| `Chapter 01 — Mobile Intelligence as an Omnira System Domain.docx` | `Chapter 01 — Mobile Intelligence as an Omnira System Domain.docx` | Nej | Ingen |
| `Chapter 02 — Vision, Product Scope and Evolution Path.docx` | `Chapter 02 — Vision, Product Scope and Evolution Path.docx` | Nej | 1 krav korrigerade: MI-02-063 |
| `Chapter 03 — System Actors, Roles and Trust Relationships.docx.docx` | `Chapter 03 — System Actors, Roles and Trust Relationships.docx` | Ja | Ingen |
| `Chapter 04 — Core Principles, Invariants and Absolute Prohibitions.docx.docx` | `Chapter 04 — Core Principles, Invariants and Absolute Prohibitions.docx` | Ja | 4 krav korrigerade: MI-04-036, MI-04-046, MI-04-049, MI-04-093 |
| `Chapter 05 — Authority Model L0–L6.docx` | `Chapter 05 — Authority Model L0–L6.docx` | Nej | Ingen |
| `Chapter 06 — Scope Architecture and Capability Grants.docx` | `Chapter 06 — Scope Architecture and Capability Grants.docx` | Nej | Ingen |
| `Chapter 07 — Approval Architecture and Mandate Lifecycle.docx` | `Chapter 07 — Approval Architecture and Mandate Lifecycle.docx` | Nej | Ingen |
| `Chapter 08 — Project Isolation, Tenant Boundaries and Atlas Global View.docx.docx` | `Chapter 08 — Project Isolation, Tenant Boundaries and Atlas Global View.docx` | Ja | Ingen |
| `Chapter 09 — Privacy Architecture and Private-by-Default Boundaries.docx.docx` | `Chapter 09 — Privacy Architecture and Private-by-Default Boundaries.docx` | Ja | 3 krav korrigerade: MI-09-020, MI-09-066, MI-09-070 |
| `Chapter 10 — Communication Channels, Accounts and Content Access.docx.docx` | `Chapter 10 — Communication Channels, Accounts and Content Access.docx` | Ja | 1 krav korrigerade: MI-10-012 |
| `Chapter 11 — Outbound Communication, Brand Identity and Human Representation.docx.docx` | `Chapter 11 — Outbound Communication, Brand Identity and Human Representation.docx` | Ja | Ingen |
| `Chapter 12 — Notifications, Attention and Priority Governance.docx.docx` | `Chapter 12 — Notifications, Attention and Priority Governance.docx` | Ja | Ingen |
| `Chapter 13 — Device Control Capability Model.docx` | `Chapter 13 — Device Control Capability Model.docx` | Nej | 2 krav korrigerade: MI-13-135, MI-13-174 |
| `Chapter 14 — Sensitive Applications and Human-Presence Requirements.docx.docx` | `Chapter 14 — Sensitive Applications and Human-Presence Requirements.docx` | Ja | 1 krav korrigerade: MI-14-218 |
| `Chapter 15 — File Operations, Project Storage and Quarantine.docx.docx` | `Chapter 15 — File Operations, Project Storage and Quarantine.docx` | Ja | Ingen |
| `Chapter 16 — Image, Video, Camera and Microphone Governance.docx.docx` | `Chapter 16 — Image, Video, Camera and Microphone Governance.docx` | Ja | 3 krav korrigerade: MI-16-054, MI-16-069, MI-16-140 |
| `Chapter 17 — Location, Geofencing and Physical Context.docx.docx` | `Chapter 17 — Location, Geofencing and Physical Context.docx` | Ja | 1 krav korrigerade: MI-17-092 |
| `Chapter 18 — Local Processing, Cloud Processing and Data Egress.docx.docx` | `Chapter 18 — Local Processing, Cloud Processing and Data Egress.docx` | Ja | Ingen |
| `Chapter 19 — Provider Routing, Cost, Quality and Resilience.docx.docx` | `Chapter 19 — Provider Routing, Cost, Quality and Resilience.docx` | Ja | 1 krav korrigerade: MI-19-169 |
| `Chapter 20 — Memory Architecture and Knowledge Boundaries.docx.docx` | `Chapter 20 — Memory Architecture and Knowledge Boundaries.docx` | Ja | 1 krav korrigerade: MI-20-239 |
| `Chapter 21 — Retention, Deletion, Backup and Recoverability.docx.docx` | `Chapter 21 — Retention, Deletion, Backup and Recoverability.docx` | Ja | Ingen |
| `Chapter 22 — Identity, Credentials and Account Recovery.docx.docx` | `Chapter 22 — Identity, Credentials and Account Recovery.docx` | Ja | Ingen |
| `Chapter 23 — Omnira Nodes and Execution Roles.docx.docx` | `Chapter 23 — Omnira Nodes and Execution Roles.docx` | Ja | Ingen |
| `Chapter 24 — Control Surfaces, Execution Surfaces and Data Locality.docx.docx` | `Chapter 24 — Control Surfaces, Execution Surfaces and Data Locality.docx` | Ja | Ingen |
| `Chapter 25 — Node Selection, Work Placement and Provider Continuity.docx.docx` | `Chapter 25 — Node Selection, Work Placement and Provider Continuity.docx` | Ja | 1 krav korrigerade: MI-25-314 |
| `Chapter 26 — Workflow Ownership, Concurrency and Duplicate Prevention.docx.docx` | `Chapter 26 — Workflow Ownership, Concurrency and Duplicate Prevention.docx` | Ja | Ingen |
| `Chapter 27 — Offline Operation, Synchronization and Canonical State.docx.docx` | `Chapter 27 — Offline Operation, Synchronization and Canonical State.docx` | Ja | Ingen |
| `Chapter 28 — Verification, Evidence and Unknown Outcomes.docx.docx` | `Chapter 28 — Verification, Evidence and Unknown Outcomes.docx` | Ja | 1 krav korrigerade: MI-28-215 |
| `Chapter 29 — Failure Handling, Rollback, Compensation and Emergency Stop.docx.docx` | `Chapter 29 — Failure Handling, Rollback, Compensation and Emergency Stop.docx` | Ja | Ingen |
| `Chapter 30 — Audit, Explainability, Accountability and Continuous Learning.docx.docx` | `Chapter 30 — Audit, Explainability, Accountability and Continuous Learning.docx` | Ja | 1 krav korrigerade: MI-30-283 |
| `Chapter 31 — Versioning, Testing, Rollout and Capability Expansion.docx.docx` | `Chapter 31 — Versioning, Testing, Rollout and Capability Expansion.docx` | Ja | 1 krav korrigerade: MI-31-037 |
| `Implementation Contract.docx.docx` | `Chapter 32 — Mobile Experience, Daily Operations and Canonical Implementation Contract.docx` | Ja | Ingen |
| `RECOVERY_PROVENANCE_INDEX.md` | — | Ej överförd | Metadokument, ej bokinnehåll. Bevarad i Working-Drafts. |

Totalt 34 DOCX in, 34 DOCX ut.
26 filnamn hade dubbel ändelse och är rättade.

## Led 2 — Canonical Source Set till sammanslagen bok

| Källfil | Destination i boken | PDF-sidor |
|---|---|---|
| `00 — Canonical Decision Register v1.0.docx` | Front matter, avsnitt „Canonical Decision Register v1.0” | 5–27 |
| `01 — Canonical Book Architecture and Chapter Plan v1.0.docx` | Front matter, avsnitt „Canonical Book Architecture and Chapter Plan v1.0” | 28–58 |
| `Chapter 01 — Mobile Intelligence as an Omnira System Domain.docx` | Kapitel 1, PART I | 60– |
| `Chapter 02 — Vision, Product Scope and Evolution Path.docx` | Kapitel 2, PART I | 83– |
| `Chapter 03 — System Actors, Roles and Trust Relationships.docx` | Kapitel 3, PART I | 100– |
| `Chapter 04 — Core Principles, Invariants and Absolute Prohibitions.docx` | Kapitel 4, PART I | 126– |
| `Chapter 05 — Authority Model L0–L6.docx` | Kapitel 5, PART II | 149– |
| `Chapter 06 — Scope Architecture and Capability Grants.docx` | Kapitel 6, PART II | 174– |
| `Chapter 07 — Approval Architecture and Mandate Lifecycle.docx` | Kapitel 7, PART II | 204– |
| `Chapter 08 — Project Isolation, Tenant Boundaries and Atlas Global View.docx` | Kapitel 8, PART II | 233– |
| `Chapter 09 — Privacy Architecture and Private-by-Default Boundaries.docx` | Kapitel 9, PART III | 265– |
| `Chapter 10 — Communication Channels, Accounts and Content Access.docx` | Kapitel 10, PART III | 295– |
| `Chapter 11 — Outbound Communication, Brand Identity and Human Representation.docx` | Kapitel 11, PART III | 327– |
| `Chapter 12 — Notifications, Attention and Priority Governance.docx` | Kapitel 12, PART III | 361– |
| `Chapter 13 — Device Control Capability Model.docx` | Kapitel 13, PART IV | 397– |
| `Chapter 14 — Sensitive Applications and Human-Presence Requirements.docx` | Kapitel 14, PART IV | 434– |
| `Chapter 15 — File Operations, Project Storage and Quarantine.docx` | Kapitel 15, PART IV | 466– |
| `Chapter 16 — Image, Video, Camera and Microphone Governance.docx` | Kapitel 16, PART IV | 508– |
| `Chapter 17 — Location, Geofencing and Physical Context.docx` | Kapitel 17, PART IV | 543– |
| `Chapter 18 — Local Processing, Cloud Processing and Data Egress.docx` | Kapitel 18, PART V | 580– |
| `Chapter 19 — Provider Routing, Cost, Quality and Resilience.docx` | Kapitel 19, PART V | 620– |
| `Chapter 20 — Memory Architecture and Knowledge Boundaries.docx` | Kapitel 20, PART V | 670– |
| `Chapter 21 — Retention, Deletion, Backup and Recoverability.docx` | Kapitel 21, PART V | 721– |
| `Chapter 22 — Identity, Credentials and Account Recovery.docx` | Kapitel 22, PART V | 764– |
| `Chapter 23 — Omnira Nodes and Execution Roles.docx` | Kapitel 23, PART VI | 814– |
| `Chapter 24 — Control Surfaces, Execution Surfaces and Data Locality.docx` | Kapitel 24, PART VI | 860– |
| `Chapter 25 — Node Selection, Work Placement and Provider Continuity.docx` | Kapitel 25, PART VI | se innehållsförteckning |
| `Chapter 26 — Workflow Ownership, Concurrency and Duplicate Prevention.docx` | Kapitel 26, PART VI | se innehållsförteckning |
| `Chapter 27 — Offline Operation, Synchronization and Canonical State.docx` | Kapitel 27, PART VI | se innehållsförteckning |
| `Chapter 28 — Verification, Evidence and Unknown Outcomes.docx` | Kapitel 28, PART VII | se innehållsförteckning |
| `Chapter 29 — Failure Handling, Rollback, Compensation and Emergency Stop.docx` | Kapitel 29, PART VII | se innehållsförteckning |
| `Chapter 30 — Audit, Explainability, Accountability and Continuous Learning.docx` | Kapitel 30, PART VII | se innehållsförteckning |
| `Chapter 31 — Versioning, Testing, Rollout and Capability Expansion.docx` | Kapitel 31, PART VII | 1208– |
| `Chapter 32 — Mobile Experience, Daily Operations and Canonical Implementation Contract.docx` | Kapitel 32, PART VIII | 1264– |

Delsidor infogade på PDF-sidorna 59, 148, 264, 396, 579, 813, 1050 och 1261. Texten är hämtad
ordagrant ur Chapter Plan §9.

## Led 3 — Bok till härledda register och stöddokument

| Destination | Härledning | Poster |
|---|---|---|
| Requirement Register v1.0.xlsx | Fristående `MI-KK-NNN`-stycke + omedelbart följande stycke | 8 920 |
| Requirement-to-Architecture Traceability Matrix | Krav + del/kapitel/sektion ur Chapter Plan §9 | 8 920 |
| Requirement-to-Implementation Traceability Matrix | Krav + tomma implementationsfält, status `not assessed` | 8 920 |
| Verification Matrix | Krav + verifieringsklass härledd ur normativ term | 8 920 |
| Canonical Glossary | 39 begrepp ur Chapter Plan §8, definitioner ordagrant citerade | 39 |
| Editorial Review Report | Statistisk och redaktionell analys av kapiteltexten | — |
| Atlas Knowledge Edition | Markdown per kapitel med YAML-provenance + `requirements.jsonl` | 32 + 8 920 |
| Appendix A i boken | Kapitel, rubrik, kravantal, ID-intervall | 32 rader |

## Vad som INTE följde med

| Objekt | Skäl |
|---|---|
| `RECOVERY_PROVENANCE_INDEX.md` | Metadokument om återställningen, inte bokinnehåll |
| De 9 krav som saknar §7-term | Beskrivande satser, ingen normativ term avsedd. Orörda. |
| Working-Drafts som canonical källa | Ersatt av Canonical-Source-Set-v1.0, men bevarad oförändrad som proveniens |

## Proveniensgaranti

`Sources/Working-Drafts/` är oförändrad. Samtliga 35 filer har identiska SHA-256-summor som vid
r1-leveransen, och de 14 filer som `RECOVERY_PROVENANCE_INDEX.md` listar matchar sina
recovery-original 14/14.

## Led 4 — Låsning till APPROVED

| Objekt | Källa | Destination | Ändring |
|---|---|---|---|
| Sammanslagen bok | r2 body-XML, byte-identisk | `…APPROVED/…Canonical Edition v1.0 (APPROVED).docx` | Endast omslag, metadatasida, sidhuvud, statisk innehållsförteckning |
| PDF | Ovanstående DOCX | `…APPROVED/…Canonical Edition v1.0 (APPROVED).pdf` | 1 314 sidor, exporterad i tre sidintervall och sammanfogad |
| 34 canonical kapitelfiler | `Sources/Canonical-Source-Set-v1.0/` | `…APPROVED/Canonical-Chapters/` | Endast DOCX-kärnmetadata |
| Requirement register | r2 | `…APPROVED/…(APPROVED).xlsx` | Endast statusrader |
| Tre matriser | r2 | `…APPROVED/…(APPROVED).xlsx` | Endast statusrader |
| Glossary, Editorial Review | r2 | `…APPROVED/…(APPROVED).docx` | Endast status och godkännandenotis |
| Validation Report | Nyskriven | `…APPROVED/Validation Report v1.0 (APPROVED).docx` | Låsningsrapport |
| Atlas Knowledge Edition | r2-struktur, samma brödtext | `…APPROVED/Atlas-Knowledge-Edition-v1.0/` | YAML och JSONL: approved true |

Brödtexten är oförändrad i samtliga led. 0 materiella textdiffar mot `Sources/Canonical-Source-Set-v1.0/`.

## Led 5 — Statusharmonisering till APPROVED r2

| Objekt | Källa | Ändring |
|---|---|---|
| Sammanslagen bok | APPROVED r1 body + 35 statusrader | 35 stycken, inget annat |
| PDF | Ovanstående DOCX | 1 314 sidor, exporterad i tre sidintervall och sammanfogad |
| 34 separata canonical kapitelfiler | Regenererade ur samma stycken | 35 statusrader |
| Atlas Knowledge Edition | Regenererad | 35 statusrader, provenance pekar på APPROVED-r2 |
| Requirement register, tre matriser, glossary, editorial review | APPROVED r1 | Kopierade byte-identiskt — innehåller inga statusrader |
| Correction Proposal | APPROVED r1 | Endast rubrikraden statusrättad |
| Validation report, manifest, changelog, map, checksums | Nyskrivna | Dokumenterar harmoniseringen |

Requirements är bit-identiska genom hela kedjan: 8 920 ID med oförändrad kravtext.

## Led 6 — BL-06 och BL-07 till APPROVED r3

| Objekt | Källa | Ändring |
|---|---|---|
| Sammanslagen bok | APPROVED r2 + 2 stycken | 2 stycken, inget annat |
| PDF | Ovanstående DOCX | 1 314 sidor, tre sidintervall sammanfogade |
| 34 separata canonical kapitelfiler | Regenererade | 2 stycken (Decision Register och Book Architecture) |
| Atlas Knowledge Edition | Regenererad | 2 stycken, provenance pekar på APPROVED-r3 |
| Requirement register, tre matriser, glossary, editorial review, correction proposal | APPROVED r2 | Byte-identiskt kopierade |
| Validation report, manifest, changelog, map, checksums | Nyskrivna | Dokumenterar r3 |

Requirements är bit-identiska genom hela kedjan: 8 920 ID med oförändrad kravtext.
