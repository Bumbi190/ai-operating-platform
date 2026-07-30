# Omnira — Mobile Intelligence & Device Control

Denna katalog innehåller det versionsstyrda **dokumentationspaketet** för Omniras
mobilintelligens- och enhetskontrollarkitektur. Det är en kunskaps- och doktrinkälla — **inte
runtime**. Inget här exekveras och inget här ger exekveringsrätt. Repository, databasschema,
migrationer, runtime-kod och deployment är de enda auktoritativa källorna för vad som faktiskt är
implementerat.

## Vad boken är

Omnira — Mobile Intelligence & Device Control är den canonical governance- och arkitekturdoktrinen
för mobila noder, enhetsoperationer och människokontrollerad autonomi inom Omnira. Boken omfattar
**32 kapitel** i **8 delar** och fastställer **8 920 normerande kontrakt (MI-01-001–MI-32-350)**.
Den beskriver den *avsedda* arkitekturen och är inte bevis för att någon funktion är byggd.

Undertitel: *Canonical Governance, Architecture and Authority Model for Mobile Nodes, Device
Operations and Human-Controlled Autonomy*.

## Status och version

- **Version:** v1.0
- **Status:** `Canonical Edition v1.0 — APPROVED`
- **Godkänd av:** André Hultgren
- **Godkännandedatum:** 2026-07-30
- **Dokumentägare:** André Hultgren / Omnira
- **Utgåva i detta repo:** APPROVED r3

Boken är godkänd och låst. Ändringar kräver ett nytt godkänt ändringsbeslut och en ny version.

## Canonical fullbok

Fullboken finns i två format under `canonical/v1.0/full-book/`:

- `… Canonical Edition v1.0 (APPROVED).pdf` — typsatt, mänskligt läsbar fullbok, **1 314 sidor A4**.
- `… Canonical Edition v1.0 (APPROVED).docx` — redigerbar fullbok.

PDF:en är den primära referensartefakten. Den maskinläsbara representationen av hela boken finns i
Atlas Knowledge Edition (se nedan), där varje kapitel är en Markdown-fil och varje kontrakt en rad
i `requirements.jsonl`.

## Struktur

```
mobile-intelligence/
  README.md
  .gitignore
  canonical/v1.0/
    full-book/      # fullbok (docx, pdf)
    contracts/      # kontraktsregister MI-01-001–MI-32-350 (md, csv, json) + requirement register (xlsx)
    traceability/   # requirement-to-architecture, requirement-to-implementation, verification (xlsx)
    glossary/       # canonical glossary (docx)
    editorial/      # editorial review, change log, correction proposal
    validation/     # validation report
    manifest/       # manifest + source-to-export map
    checksums/      # SHA-256SUMS.txt
  atlas-knowledge/v1.0/
    README.md       # läs- och beslutsregler för agenter
    chapters/       # 32 kapitel (md) med YAML-provenance
    front-matter/   # decision register, book architecture and chapter plan (md)
    index/          # chapters.json, parts.json, requirements.jsonl
```

## Kontraktsregistret

Registret i `canonical/v1.0/contracts/` listar samtliga MI-kontrakt med `contract_id`,
`contract_title`, `full_contract_text`, `chapter_number`, `chapter_title`, `section_reference`,
`normative_term`, `category_derived_non_canonical`, `canonical_version` och `status`. Det finns som
`contract-registry.md` (läsbart), `contract-registry.csv` och `contract-registry.json`
(maskinläsbart, sökbart). Serien är MI-01-001–MI-32-350, **8 920 unika kontrakt**, sammanhängande
inom varje kapitel, utan luckor eller dubbletter.

`normative_term` är canonical och följer vokabulären i Canonical Book Architecture and Chapter Plan
v1.0 §7: SKA, FÅR, FÅR INTE, BÖR, KAN. `contract_title` är **derived** — det är sektionsrubriken som
styr kontraktet, inte en canonical kontraktstitel. `category_derived_non_canonical` är
**derived classification / non-canonical metadata** och påverkar inte kontraktens ID eller text.

| Normativ term | Antal |
|---|---|
| SKA | 5 886 |
| FÅR INTE | 2 602 |
| BÖR | 210 |
| FÅR | 207 |
| KAN | 6 |
| (beskrivande, ingen term) | 9 |

## Atlas Knowledge Edition

`atlas-knowledge/v1.0/` är den maskinstrukturerade kunskap som härleds ur den godkända boken: 32
kapitel-Markdown med YAML-provenance, front matter, samt index i `chapters.json`, `parts.json` och
`requirements.jsonl` med 8 920 poster. Varje post bär `source_file`, `markdown_anchor`, `section`,
`section_title`, `normative_term`, `implementation_status`, `verification_status`, `approved: true`,
`approval_date` och `approved_by`.

Paketet **ger ingen exekveringsrätt**. `implementation_status` och `verification_status` är
`not assessed` för samtliga 8 920 kontrakt.

## Bok kontra kunskapspaket kontra runtime

| Lager | Vad det är | Auktoritet |
|---|---|---|
| Canonical v1.0 | Författad arkitekturdoktrin | Beskriver avsedd arkitektur; inte bevis för implementation |
| Atlas Knowledge Edition v1.0 | Strukturerad, sökbar kunskap | Endast kunskap — ger inga exekveringsrättigheter |
| Repository och runtime | Faktisk implementation | Enda auktoritet för vad som är byggt |

## Verifiering

| Kontroll | Resultat |
|---|---|
| Kapitel | 32/32 |
| Delar | 8 (PART I–VIII) |
| Numrerade sektioner | 2 885 på nivå 2, 8 på nivå 3 |
| Kontrakt | 8 920 unika, 0 dubbletter, 0 luckor, 0 utan kravtext |
| PDF | 1 314 sidor, 0 tomma sidor, 0 änkerubriker, 0 felaktiga tecken |
| Innehållsförteckningens sidnummer | 45/45 verifierade mot faktisk sidposition |
| SHA-256-summor i slutpaketet | 154 verifierade |
| Blockerande fel | 0 |

Fullständiga rapporter finns i `canonical/v1.0/validation/` och `canonical/v1.0/editorial/`.
Checksummor för denna katalog finns i `canonical/v1.0/checksums/SHA-256SUMS.txt`.

## Redaktionell historik före godkännande

| Steg | Omfattning |
|---|---|
| Normativ terminologistandardisering | 22 kontrakt standardiserade till `FÅR INTE` |
| Statusharmonisering | 35 status- och dokumentstatusrader |
| BL-06 och BL-07 | 2 stycken där godkännandet var formulerat som framtida villkor |
| Andra materiella textändringar | 0 |

Se `canonical/v1.0/editorial/Change Log v1.0 (APPROVED).md` och
`canonical/v1.0/editorial/Correction Proposal — Normative Terminology v1.0.md`.

## Öppen v1.1-backlog

| # | Punkt |
|---|---|
| BL-01 | Decision-to-Chapter Traceability Matrix |
| BL-02 | Chapter Dependency Matrix |
| BL-03 | Semantisk granskning av 34 grupper med identiska kontraktstexter (100 kontrakt) |
| BL-04 | Explicita definitioner för 7 glossarybegrepp |

BL-05, BL-06 och BL-07 är stängda.

## Vad denna leverans INTE innehåller

Denna leverans levererar **endast dokumentation**. Den implementerar **inte** Mobile Intelligence
Stage 1 och ändrar **inte** runtime, databaser, migrationer, applikationskod, agentsystem eller
produktionsmiljö. Stage 1 är inte påbörjad.
