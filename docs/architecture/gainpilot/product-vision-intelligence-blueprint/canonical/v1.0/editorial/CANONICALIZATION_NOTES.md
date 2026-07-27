# Canonicalization notes — GainPilot — Product Vision & Intelligence Blueprint

Version v1.0 · Canonical Review Candidate · 2026-07-26

## Process

1. **Read-only audit** av de 32 käll-DOCX: kapitelantal, ordning, rubriker, kontraktsnumrering.
2. **Editorial audit**: terminologikonsekvens (GainPilot, Omnira, Atlas, Arnold, Hermes; capability,
   authority, permission, approval, entitlement, operating mode), dubbletter, kontraktsintegritet.
3. **Extraktion**: canonical text extraherad icke-destruktivt ur DOCX till en mellanmodell
   (`canonical_model.json`) som alla artefakter härleds från. Detta garanterar att fullbok och
   separata kapitel är identiska (verifierat i `proofs/`).
4. **Produktion**: fullbok (md/docx/pdf), 32 separata kapitel, kontraktsregister, manifest,
   checksummor, valideringsrapport.

## Fastställda canonical fakta

- 32 kapitel, ordning 1–32.
- 690 kontrakt, GP-1–GP-690, sammanhängande, unika, GP-690 sist (Kapitel 32).
- Källkontraktstext och kontrakts-ID oförändrade.

## Kända begränsningar

- **Sandbox kan inte radera filer på den monterade disken.** Fyra LibreOffice temp/lock-filer i
  `full-book/` (från tidiga konverteringsförsök) kan inte tas bort härifrån. De är listade i
  manifestet som uteslutna och fångas av `.gitignore`; de får inte committas.
- PDF genererades genom delkonvertering (LibreOffice) och sammanfogning, då fullbokens storlek
  översteg en enskild konverteringstidsgräns. Innehållet är komplett (2 676 sidor).
