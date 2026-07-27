# Visuell och strukturell layout-gate — GainPilot — Product Vision & Intelligence Blueprint

Version v1.0 · Canonical Review Candidate · 2026-07-26

## Sammanfattning

Fullboken inspekterades kvantitativt (per-sida-textanalys av alla 2 692 sidor) och visuellt
(renderade nyckelsidor). Den **första** genereringen (2 676 sidor) hade komplett och korrekt
innehåll men **systematiska presentationsbrister**: ingen titelsida, inga kapitelvisa sidbrytningar
(kapitel började mitt på sidan), inga sidnummer och ingen paginerad innehållsförteckning. Dessa
rättades och **DOCX och PDF regenererades**. Den nuvarande versionen är **PASS**.

## Begärda mätvärden

- **Helt tomma sidor:** 0
- **Nästan tomma sidor:** 0
- **Sidantal:** 2 692 (efter regenerering med titelsida + kapitelbrytningar). Bedöms **rimligt** —
  boken har 71 291 stycken (≈ 27 stycken/sida) och 690 kontraktsblock; sidantalet drivs av det
  verkliga stycke- och kontraktsantalet, inte av felaktig konvertering. (Kontroll: mediantäthet
  ca 840 tecken/sida, 0 tomma sidor, 73 737 svenska tecken och 0 mojibake-tecken bevarade.)
- **Formatteringsproblem funna:** i första versionen — saknad titelsida, saknade kapitelbrytningar,
  saknade sidnummer, opaginerad TOC. **Åtgärdade.**
- **Behövde DOCX/PDF regenereras:** **Ja** — utfört.

## 15-punktskontroll

| # | Kontroll | Utfall |
|---|---|---|
| 1 | Titelblad | PASS — egen titelsida (s. 1) med titel, undertitel, versionsblad, statusförklaring, governance |
| 2 | Versionsblad | PASS — på titelsidan; version v1.0, status Canonical Review Candidate, ägare, datum |
| 3 | Innehållsförteckning | PASS — egen sida (s. 2–3), 32 kapitel + 3 slutavsnitt med sidnummer |
| 4 | Första sidan i Kapitel 1 | PASS — Kapitel 1 börjar överst på s. 4; förspelet borttaget; inleds "GainPilot ska vara mer än en träningsapp…" |
| 5 | Kapitel från varje huvuddel | PASS — kap 8 (s. 288), 16 (s. 943), 24 (s. 1789) börjar överst på egen sida |
| 6 | Kapitel 29–32 | PASS — 29 (s. 2294), 30, 31, 32 (s. 2594) börjar överst på egen sida |
| 7 | Bokens sista sidor | PASS — kontraktsöversikt, versionshistorik, artefaktförklaring renderas korrekt sist |
| 8 | Inga systematiskt tomma sidor | PASS — 0 tomma, 0 nästan tomma |
| 9 | Ingen rad-per-sida / onormalt styckeavstånd | PASS — median ~840 tecken/sida, normalt styckeavstånd |
| 10 | Rubriker inte ensamma längst ned | PASS — kapitelrubriker har page-break-before (börjar överst); keep-with-next på rubrikstil |
| 11 | Listor, kontraktsblock, sektioner begripliga | PASS — punktlistor och fetmarkerade kontraktsrubriker renderar korrekt |
| 12 | Sidhuvud/sidfot/sidnummer/marginaler | PASS — konsekvent sidfot ("Sida N av 2692" + boktitel + status) på alla sidor |
| 13 | Innehållsförteckningen pekar rätt | PASS — TOC-sidhänvisningar verifierade mot faktiska kapitelsidor (kap 1/8/16/24/32 exakt match) |
| 14 | Tecken/bindestreck/svenska bokstäver intakta | PASS — 73 737 åäö, 4 140 em-dash, **0 mojibake** |
| 15 | Fullbokens text motsvarar Markdown | PASS — proofs: fullbok = separata kapitel = mellanmodell (32/32) |

## Genomförd åtgärd

DOCX och PDF regenererades med: (a) egen titelsida, (b) paginerad innehållsförteckning på egen sida,
(c) page-break-before på varje kapitel och slutavsnitt, (d) löpande sidnummer i sidfoten. PDF:en
byggdes via delkonvertering (LibreOffice), sammanfogning, statisk paginerad TOC och sidnummerstämpling,
samt Ghostscript-optimering (5,7 MB, text bevarad). Manifest, checksummor, fullbok-vs-kapitel-proof och
valideringsrapport kördes om efter regenereringen — inga FAIL.
