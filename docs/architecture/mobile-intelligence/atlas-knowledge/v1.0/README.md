# Atlas Knowledge Edition — Omnira Mobile Intelligence & Device Control

**Canonical Edition v1.0 — APPROVED** · godkänd av André Hultgren 2026-07-30

> Detta är en **härledd läskopia** för maskinell konsumtion av Atlas, Claude, Codex, ChatGPT och
> framtida implementation agents. Den auktoritativa utgåvan är
> `Omnira — Mobile Intelligence & Device Control — Canonical Edition v1.0 (APPROVED).pdf/.docx`.
> Vid avvikelse gäller DOCX/PDF.
>
> **Boken är godkänd. Stage 1 är inte påbörjad och får inte påbörjas utan separat beslut.**

## Godkännande

| | |
|---|---|
| Status | APPROVED |
| Godkänd av | André Hultgren |
| Godkännandedatum | 2026-07-30 |
| Utgåva | Canonical Edition v1.0 |
| Godkänd grund | r2-leveransen (Sources/Canonical-Source-Set-v1.0) |

## Så ska detta paket användas

1. Läs `index/parts.json` för bokens åtta delar och deras kapitel.
2. Läs `index/chapters.json` för kapitelmetadata inklusive `source_sha256`.
3. Läs `index/requirements.jsonl` för samtliga 8 920 godkända kontrakt, ett JSON-objekt per rad.
4. Slå upp enskilt krav via `markdown_anchor`, exempelvis `chapters/ch01.md#MI-01-001`.
5. Läs alltid ett krav tillsammans med dess `section_title` — flera krav är avsiktligt mycket korta
   och förutsätter sin sektionskontext.

## Beslutsregler för agenter

| Situation | Regel |
|---|---|
| Kravet innehåller `FÅR INTE` | Absolut förbud. Implementera inte, kringgå inte, tolka inte bort. |
| Kravet innehåller `SKA` | Obligatoriskt canonical krav. |
| Kravet innehåller `BÖR` | Rekommendation. Avvikelse kräver dokumenterad motivering. |
| Kravet innehåller `FÅR` | Tillåtet endast under angivna villkor. |
| Kravet innehåller `KAN` | Arkitekturen stödjer möjligheten men kräver inte aktivering. |
| `approved: true` | Kravet är canonicalt godkänt och styrande. |
| `implementation_status: not assessed` | Ingen bedömning gjord. Anta inte att något är implementerat. |
| `verification_status: not assessed` | Ingen verifiering utförd. Hävda inte att kravet är uppfyllt. |
| Kravet saknas i detta paket | Slå upp i Canonical Edition DOCX/PDF. Gissa aldrig. |

## Struktur

```
Atlas-Knowledge-Edition-v1.0/
├── README.md
├── front-matter/
│   ├── 00-canonical-decision-register.md
│   └── 01-canonical-book-architecture.md
├── chapters/
│   └── ch01.md … ch32.md          32 kapitel med YAML front matter
└── index/
    ├── parts.json                 8 delar och deras kapitel
    ├── chapters.json              kapitelmetadata och källchecksummor
    └── requirements.jsonl         8 920 godkända krav, ett JSON-objekt per rad
```

## Kapitelöversikt

| Kap | Del | Titel | Krav | Sektioner | Ord |
|---|---|---|---|---|---|
| 1 | PART I | Mobile Intelligence as an Omnira System Domain | 69 | 32 | 4 568 |
| 2 | PART I | Vision  Product Scope and Evolution Path | 67 | 28 | 3 342 |
| 3 | PART I | System Actors  Roles and Trust Relationships | 115 | 55 | 4 397 |
| 4 | PART I | Core Principles  Invariants and Absolute Prohibitions | 141 | 55 | 3 928 |
| 5 | PART II | Authority Model L0–L6 | 144 | 56 | 4 618 |
| 6 | PART II | Scope Architecture and Capability Grants | 181 | 70 | 5 118 |
| 7 | PART II | Approval Architecture and Mandate Lifecycle | 164 | 74 | 4 893 |
| 8 | PART II | Project Isolation  Tenant Boundaries and Atlas Global View | 190 | 68 | 5 129 |
| 9 | PART III | Privacy Architecture and Private-by-Default Boundaries | 193 | 65 | 5 174 |
| 10 | PART III | Communication Channels  Accounts and Content Access | 213 | 70 | 5 379 |
| 11 | PART III | Outbound Communication  Brand Identity and Human Representation | 221 | 74 | 5 710 |
| 12 | PART III | Notifications  Attention and Priority Governance | 225 | 80 | 6 196 |
| 13 | PART IV | Device Control Capability Model | 241 | 76 | 6 205 |
| 14 | PART IV | Sensitive Applications and Human-Presence Requirements | 225 | 67 | 5 708 |
| 15 | PART IV | File Operations  Project Storage and Quarantine | 317 | 91 | 7 189 |
| 16 | PART IV | Image  Video  Camera and Microphone Governance | 231 | 69 | 5 762 |
| 17 | PART IV | Location  Geofencing and Physical Context | 263 | 82 | 6 755 |
| 18 | PART V | Local Processing  Cloud Processing and Data Egress | 285 | 87 | 6 800 |
| 19 | PART V | Provider Routing  Cost  Quality and Resilience | 349 | 107 | 8 049 |
| 20 | PART V | Memory Architecture and Knowledge Boundaries | 361 | 110 | 8 836 |
| 21 | PART V | Retention  Deletion  Backup and Recoverability | 325 | 101 | 7 889 |
| 22 | PART V | Identity  Credentials and Account Recovery | 399 | 116 | 9 191 |
| 23 | PART VI | Omnira Nodes and Execution Roles | 365 | 110 | 8 361 |
| 24 | PART VI | Control Surfaces  Execution Surfaces and Data Locality | 336 | 103 | 8 139 |
| 25 | PART VI | Node Selection  Work Placement and Provider Continuity | 370 | 108 | 8 744 |
| 26 | PART VI | Workflow Ownership  Concurrency and Duplicate Prevention | 465 | 137 | 10 206 |
| 27 | PART VI | Offline Operation  Synchronization and Canonical State | 405 | 121 | 8 906 |
| 28 | PART VII | Verification  Evidence and Unknown Outcomes | 373 | 122 | 9 045 |
| 29 | PART VII | Failure Handling  Rollback  Compensation and Emergency Stop | 462 | 156 | 10 238 |
| 30 | PART VII | Audit  Explainability  Accountability and Continuous Learning | 402 | 133 | 9 602 |
| 31 | PART VII | Versioning  Testing  Rollout and Capability Expansion | 473 | 166 | 10 150 |
| 32 | PART VIII | Mobile Experience  Daily Operations and Canonical Implementation Contract | 350 | 104 | 8 840 |
| | | **Totalt** | **8920** | **2893** | **223 067** |

## Genereringsinformation

| | |
|---|---|
| Källa | `Exports/Canonical-Edition-v1.0-APPROVED-r3/Canonical-Chapters/` |
| Genererad | 2026-07-30 |
| Kapitel | 32 |
| Krav | 8920 |
| Utgåva | Canonical Edition v1.0 |
| Godkänd | Ja — André Hultgren 2026-07-30 |
| Innehåller nya arkitekturkrav | Nej — helt härlett ur godkända canonical källor |
