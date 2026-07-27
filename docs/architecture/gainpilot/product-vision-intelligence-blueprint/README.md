# GainPilot — Product Vision & Intelligence Blueprint

Denna katalog innehåller det versionsstyrda **dokumentationspaketet** för GainPilots produktvision
och intelligence-arkitektur inom Omnira. Det är en kunskaps- och doktrinkälla — **inte runtime**.
Inget här exekveras och inget här ger exekveringsrätt. Repository, databasschema, migrationer,
runtime-kod och deployment är de enda auktoritativa källorna för vad som faktiskt är implementerat.

## Vad boken är

GainPilot — Product Vision & Intelligence Blueprint är den canonical produktvisions- och arkitekturdoktrinen för GainPilot. Boken omfattar
**32 kapitel** och fastställer **690 normerande designkontrakt (GP-1–GP-690)**. Den beskriver den
*avsedda* produkten och arkitekturen och är inte bevis för att någon funktion är byggd.

## Status och version

- **Version:** v1.0
- **Status:** Canonical Review Candidate  (ännu **inte** *Canonical Approved*)
- **Dokumentägare:** André Hultgren / GainPilot / Omnira
- **Sammanställningsdatum:** 2026-07-26

Status höjs till *Canonical Approved* först efter uttrycklig ägargranskning och godkännande.

## Canonical fullbok

Den primära canonical fullboken finns i tre format under `canonical/v1.0/full-book/`:

- `GainPilot — Product Vision & Intelligence Blueprint — Canonical Review Candidate v1.0.pdf` — typsatt, mänskligt läsbar fullbok (2 676 sidor).
- `GainPilot — Product Vision & Intelligence Blueprint — Canonical Review Candidate v1.0.docx` — redigerbar fullbok.
- `GainPilot — Product Vision & Intelligence Blueprint — Canonical Review Candidate v1.0.md` — innehållsmässigt komplett, **maskinläsbar** representation av hela boken.

PDF:en är den primära referensartefakten.

## Struktur

```
product-vision-intelligence-blueprint/
  README.md
  canonical/v1.0/
    full-book/    # fullbok (docx, pdf, md)
    chapters/     # 32 finaliserade separata kapitel (md), = fullbokens kapitel
    contracts/    # kontraktsregister GP-1–GP-690 (md, csv, json)
    manifest/     # MANIFEST.md + manifest.json
    validation/   # VALIDATION_REPORT.md
    checksums/    # SHA-256SUMS.txt
    proofs/       # fullbok kontra kapitel
    editorial/    # changelog, canonicalization notes
  sources/        # proveniens: de 32 ursprungliga käll-DOCX (oförändrade)
  archive/        # arkiverade tidigare statusartefakter
```

## Kontraktsregistret

Registret i `canonical/v1.0/contracts/` listar samtliga GP-kontrakt med `contract_id`,
`contract_title`, `full_contract_text`, `chapter_number`, `chapter_title`, `section_reference`,
`category`, `canonical_version` och `status`. Det finns som `contract-registry.md` (läsbart),
`contract-registry.csv` och `contract-registry.json` (maskinläsbart, sökbart). Serien är
GP-1–GP-690, 690 unika kontrakt, sammanhängande, med GP-690 som avslutar Kapitel 32.

## Vad denna leverans INTE innehåller

Denna PR/leverans levererar **endast dokumentation**. Den implementerar **inte** GainPilot Stage 1
och ändrar **inte** runtime, databaser, migrationer, applikationskod, agentsystem eller
produktionsmiljö.
