# Valideringsrapport — GainPilot — Product Vision & Intelligence Blueprint

Version: v1.0 · Status: Canonical Review Candidate · Datum: 2026-07-26 · Ägare: André Hultgren / GainPilot / Omnira

## Resultat

| Kontroll | Utfall | Detalj |
|---|---|---|
| Exakt 32 kapitel | **PASS** | 32 |
| Kapitelordning 1..32 | **PASS** | sekventiell |
| Kapitelrubriker konsekventa | **PASS** | normaliserade |
| GP-kontrakt unika | **PASS** | 690 unika |
| GP-serie sammanhängande GP-1..GP-690 | **PASS** | inga luckor |
| Sista kontrakt GP-690 i kap 32 | **PASS** | GP-690 |
| Inga dubblerade kontraktsnummer | **PASS** | 0 |
| Kontraktsregister CSV = 690 rader | **PASS** | 690 |
| Kontraktsregister JSON = 690 poster | **PASS** | 690 |
| Fullbok = separata kapitel (proofs) | **PASS** | 32/32 |
| DOCX finns och öppnas | **PASS** | 71291 stycken; titelsida + kapitelbrytningar + sidnummer (verifierat) |
| PDF renderad | **PASS** | 2692 sidor; titelsida, paginerad TOC, kapitelbrytningar, sidnummer (layout-gate PASS) |
| Layout-gate (visuell/strukturell) | **PASS** | 0 tomma sidor, TOC-sidhänvisningar matchar, 0 mojibake, tecken intakta |
| Maskinläsbar fullbok (Markdown) | **PASS** | 2562270 B |
| Manifest genererat | **PASS** | json+md |
| SHA-256-checksummor | **PASS** | 47 filer |
| Icke-canonical temp/lock/test-filer | **WARNING** | 5 filer kan ej raderas från sandbox; uteslutna via `.gitignore` och manifest; hanteras manuellt i källmappen |
| Kapitel 1: borttaget konversationsförspel (17 st) | **PASS** | Godkänt av ägaren 2026-07-26; text bevarad ordagrant i editorial changelog; källa oförändrad |
| Kapiteltitlar: versalnormalisering | **PASS** | Godkänt (BESLUT 2); endast presentation; betydelse oförändrad; INCIDENTer→Incidenter |
| Kontraktskategorier | **PASS** | Godkänt (BESLUT 3); märkta 'derived classification / non-canonical metadata'; ID/titel/text oförändrade |

## Korrigering av tidigare audit-fel

Första auditen använde `GP-\d{3}` och matchade endast tresiffriga nummer; den missade GP-1–GP-99 och rapporterade felaktigt 591 kontrakt (start GP-100). Ny kontroll med `Kontrakt GP-<n>` verifierade **GP-1–GP-690 (690 kontrakt)**, sammanhängande och unik. Efter ägarbeslut är detta canonical. Inga kontrakt omnumrerade, skapade, raderade eller omskrivna.

## Sammanfattning

- PASS: 16 kontroller + 3 ägargodkända editoriella beslut
- WARNING: 1 (icke-raderbara temp/lock/test-filer — uteslutna från leverans)
- FAIL: 0

**Inga FAIL. Paketet är redo för ägargranskning inför Fas 8.**
