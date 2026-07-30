# Change Log — Omnira Mobile Intelligence & Device Control

**Canonical Edition v1.0 — APPROVED, utgåva r3** · godkänd av André Hultgren 2026-07-30

---

## v1.0 APPROVED r3 — korrigering av framtida godkännandevillkor (2026-07-30)

Exakt **2 stycken** ändrade. Båda formulerade godkännandet som ett framtida villkor trots att boken
är godkänd. Omformulerade till historisk och uppfylld status.

| # | Plats | Före | Efter |
|---|---|---|---|
| BL-06 | Book Architecture and Chapter Plan §21 | `Det blir inte Canonical Approved förrän André uttryckligen godkänner:` | `Canonical approval beviljades 2026-07-30 efter att André uttryckligen godkänt:` |
| BL-07 | Decision Register, Slutstatus | `Dokumentet får inte klassificeras som Canonical Approved förrän André har granskat och uttryckligen godkänt det.` | `Dokumentet granskades och godkändes uttryckligen av André 2026-07-30 och är klassificerat som Canonical Approved.` |

BL-07 upptäcktes under arbetet och godkändes separat av André innan den tillämpades. Uppräkningen
efter BL-06-stycket är oförändrad och läser nu korrekt som det som faktiskt godkändes.

### Verifiering

| Kontroll | Resultat |
|---|---|
| Stycken totalt, före → efter | 53 012 → 53 012 |
| Stycken med skillnad | **2** |
| Skillnader som matchar BL-06 eller BL-07 | **2 av 2** |
| Andra materiella textdiffar | **0** |
| Requirements | 8 920, bit-identiska med r2 |
| Ändrade requirement-ID | **0** |
| Kvarvarande motsägelse mot framtida godkännandevillkor | **0** |
| Kapitel | 32/32 |
| Sidantal | 1 314 — oförändrat |
| Innehållsförteckningens sidnummer | 45/45 verifierade |
| Tomma sidor, änkerubriker, felaktiga tecken | 0 / 0 / 0 |

### Inte ändrat

Requirements, requirement-ID, authoritymodell, privacygränser, absoluta förbud, glossary,
traceability och Stage 1-scope. Requirement register, tre matriser, glossary och editorial review
kopierades byte-identiskt från r2.

### Backlog efter r3

| # | Punkt | Status |
|---|---|---|
| BL-01 | Decision-to-Chapter Traceability Matrix | Öppen |
| BL-02 | Chapter Dependency Matrix | Öppen |
| BL-03 | Semantisk granskning av 34 grupper identiska requirementtexter | Öppen |
| BL-04 | Explicita definitioner för 7 glossarybegrepp | Öppen |
| BL-05 | Harmonisering av statusrader | Stängd i r2 |
| BL-06 | Villkorssats i Chapter Plan §21 | **Stängd i r3** |
| BL-07 | Villkorssats i Decision Register Slutstatus | **Stängd i r3** |

---

## v1.0 APPROVED r2 — statusharmoniseringspass (2026-07-30)

Strikt statuskorrigering. Exakt 35 statusrader i kapitel- och dokumenttext harmoniserades till den
redan fastställda statusformuleringen. **Noll andra textändringar.**

### Ändrat

| # | Före | Efter | Antal | Placering |
|---|---|---|---|---|
| S-01 | `Kapitelstatus: Canonical Review Candidate v1.0` | `Kapitelstatus: Canonical Edition v1.0 — APPROVED` | 32 | Sista stycket i kapitel 1–32 |
| S-02 | `Dokumentstatus: Canonical Review Candidate` | `Dokumentstatus: Canonical Edition v1.0 — APPROVED` | 2 | Decision Register och Book Architecture |
| S-03 | `Canonical Review Candidate v1.0` | `Canonical Edition v1.0 — APPROVED` | 1 | Chapter Plan §21 Godkännandestatus |
| | | **Totalt** | **35** | |

Matchningen skedde på **hela stycket exakt**, inte som delsträngsersättning. Det gör det tekniskt
omöjligt att oavsiktligt ha träffat brödtext.

### Regenererat

Full canonical DOCX, full PDF, 34 separata canonical kapitelfiler, Atlas Knowledge Edition,
validation report, manifest, changelog, checksumlista och source-to-export map.

### Kopierat oförändrat från APPROVED r1

Requirement register, Requirement-to-Architecture Matrix, Requirement-to-Implementation Matrix,
Verification Matrix, Canonical Glossary, Editorial Review Report och Correction Proposal.
Dessa innehåller inga av de 35 statusraderna. Endast Correction Proposal fick en rättad rubrikrad.

### Inte ändrat

- Requirements — 8 920, bit-identiska.
- Requirement-ID — 8 920 unika, oförändrade.
- Brödtext utöver de 35 statusraderna — 0 ändringar.
- Authoritymodellen L0–L6, privacygränser, absoluta förbud — oförändrade.
- Glossary och traceabilitytolkningar — oförändrade.
- Stage 1-scope — oförändrat. Stage 1 ej påbörjad.

### Verifiering

| Kontroll | Resultat |
|---|---|
| Stycken totalt, före → efter | 53 012 → 53 012 |
| Stycken med skillnad | **35** |
| Skillnader som matchar godkänd statuskorrigering | **35 av 35** |
| Oväntade textändringar | **0** |
| Requirements identiska med föregående utgåva | Ja |
| `Canonical Review Candidate` i hela paketet | **0** |
| `EJ GODKÄND` i hela paketet | **0** |
| Kapitelstatusrader med APPROVED i PDF | 32/32 |
| Sidantal | 1 314 — oförändrat |
| Innehållsförteckningens sidnummer verifierade | 45/45 |
| Tomma sidor, änkerubriker, felaktiga tecken | 0 / 0 / 0 |

### Ny backlog-punkt

**BL-06** — Chapter Plan §21 innehåller efter statusraden meningen „Det blir inte Canonical Approved
förrän André uttryckligen godkänner: …”. Den är brödtext och fick inte ändras i detta pass, vilket
gör stycket något motsägelsefullt. Kräver separat innehållsbeslut.

**BL-05** — Harmonisering av statusrader: **genomförd i denna utgåva**.

### Bevarade artefakter

| Sökväg | Status |
|---|---|
| `Sources/Working-Drafts/` | Oförändrad |
| `Sources/Canonical-Source-Set-v1.0/` | Oförändrad |
| `Exports/Canonical-Edition-v1.0-Review-Candidate/` | Oförändrad |
| `Exports/Canonical-Edition-v1.0-Review-Candidate-r2/` | Oförändrad |
| `Exports/Canonical-Edition-v1.0-APPROVED/` | Oförändrad |

---

## v1.0 APPROVED — låsnings- och statuspass (2026-07-30)

Godkännandet avser r2-leveransen. Detta pass ändrade **endast status-, godkännande- och
paketmetadata**. Noll materiella textändringar.

### Ändrat

| # | Objekt | Från | Till |
|---|---|---|---|
| L-01 | Omslag | Canonical Edition — Review Candidate | Canonical Edition — APPROVED |
| L-02 | Omslagets statusrad | EJ GODKÄND — final review candidate | GODKÄND av André Hultgren 2026-07-30 |
| L-03 | Dokumentmetadatasida | Godkännandestatus: EJ GODKÄND | APPROVED + Godkänd av + Godkännandedatum + Godkänd grund |
| L-04 | Sidhuvud, 1 314 sidor | Canonical Review Candidate v1.0 | Canonical Edition v1.0 — APPROVED |
| L-05 | DOCX-kärnmetadata | Comments: EJ GODKÄND | Comments: APPROVED, André Hultgren 2026-07-30 |
| L-06 | PDF-metadata | saknades efter sammanfogning | Title, Author, Subject, Keywords med APPROVED |
| L-07 | Requirement register | Status: Review Candidate | APPROVED + fyra godkännanderader |
| L-08 | Tre matriser | Status: Review Candidate | APPROVED + fyra godkännanderader |
| L-09 | Glossary, Editorial Review | Review Candidate, EJ GODKÄND | APPROVED + godkännandenotis |
| L-10 | Atlas Knowledge Edition YAML | status: EJ GODKÄND | status: APPROVED, approved: true, approval_date, approved_by |
| L-11 | requirements.jsonl, 8 920 poster | approved: false | approved: true + status, approval_date, approved_by |
| L-12 | 34 canonical kapitelfiler | Comments: EJ GODKÄND | Comments: APPROVED (endast kärnmetadata) |
| L-13 | Innehållsförteckning | fältbaserad | statisk, 45 poster, samtliga sidnummer verifierade |

### Inte ändrat

- Kapiteltext — oförändrad, 0 diffar mot Canonical-Source-Set-v1.0.
- Requirements och requirement-ID — 8 920, oförändrade.
- Authoritymodellen L0–L6, privacygränser, absoluta förbud, Stage 1-scope — oförändrade.
- Glossarydefinitioner och traceabilitytolkningar — oförändrade.
- De 35 statusraderna i kapitel- och dokumenttext — medvetet oförändrade, se nedan.

### Sidantal 1 315 → 1 314

Innehållsförteckningen kunde inte byggas om som fält inom miljöns tidsgräns för denna
dokumentstorlek och sattes därför som statisk text med samma 45 poster. Den statiska varianten tar
något mindre vertikalt utrymme, vilket kortar front matter med en sida. Skiftet börjar vid Canonical
Decision Register; sidorna 1–3 är oförändrade och allt därefter förskjuts med exakt −1. Samtliga 45
innehållsförteckningsposter är verifierade mot faktisk sidposition — 45/45 korrekta. Ingen
innehållspåverkan.

### Känd oförändrad avvikelse

35 förekomster av „Canonical Review Candidate” finns kvar i brödtexten: 32 kapitelstatusrader, 2
dokumentstatusrader och 1 rad i Chapter Plan §21. Dessa är kapitel- och dokumenttext, inte
paketmetadata, och låsningspasset fick inte ändra kapiteltext. Auktoritativ status är
Canonical Edition v1.0 — APPROVED. Harmonisering är registrerad som v1.1-punkt.

### Bevarade artefakter

| Sökväg | Status |
|---|---|
| `Sources/Working-Drafts/` | Oförändrad, 35 filer |
| `Sources/Canonical-Source-Set-v1.0/` | Oförändrad, 34 filer |
| `Exports/Canonical-Edition-v1.0-Review-Candidate/` | Oförändrad, r1 |
| `Exports/Canonical-Edition-v1.0-Review-Candidate-r2/` | Oförändrad, r2 |

### Icke-blockerande v1.1-backlog

| # | Punkt | Varför uppskjuten |
|---|---|---|
| BL-01 | Decision-to-Chapter Traceability Matrix | Kräver tolkning av vilka CDR-beslut som styr vilka kapitel |
| BL-02 | Chapter Dependency Matrix | Härledbar ur Chapter Plan §20 men kräver bedömning |
| BL-03 | Semantisk granskning av 34 grupper identiska requirementtexter (100 krav) | Kräver innehållsbeslut om delade krav |
| BL-04 | Explicita definitioner för 7 glossarybegrepp | Kräver att definitioner författas |
| BL-05 | Harmonisering av 35 statusrader i kapiteltext | Innebär textändring, kräver separat beslut |

Ingenting i v1.0 har ändrats för dessa punkter.

---

## r2 — Kontrollerad pre-canonical pass

### A. Normativ terminologikorrigering — 22 krav

Fullständig omsökning av samtliga 8 920 krav efter avvikande förbudsformer.

| Regel | Från | Till | Antal |
|---|---|---|---|
| R1 | `SKA INTE` | `FÅR INTE` | 2 |
| R2 | `ÄR FÖRBJUDEN` / `-ET` / `-NA` | `FÅR INTE förekomma` | 20 |
| | | **Totalt** | **22** |

**Antalskorrigering:** r1-rapporten angav 21. Det var en summeringsmiss — 20 `ÄR FÖRBJUDEN`-fall
redovisades som 19. Korrekt antal är 22, samtliga korrigerade.

Rad-för-rad-redovisning finns i `Correction Proposal — Normative Terminology v1.0.md`.

| # | ID | Kap | Före | Efter |
|---|---|---|---|---|
| 1 | `MI-02-063` | 2 | Första versionen SKA INTE försöka maximera mobilåtkomst på bekostnad av tydliga systemgränser. | Första versionen FÅR INTE försöka maximera mobilåtkomst på bekostnad av tydliga systemgränser. |
| 2 | `MI-04-036` | 4 | Dold mikrofon- och kameraaktivering ÄR FÖRBJUDEN. | Dold mikrofon- och kameraaktivering FÅR INTE förekomma. |
| 3 | `MI-04-046` | 4 | Oannonserad extern dataöverföring ÄR FÖRBJUDEN. | Oannonserad extern dataöverföring FÅR INTE förekomma. |
| 4 | `MI-04-049` | 4 | Påstådd framgång utan verifiering ÄR FÖRBJUDEN. | Påstådd framgång utan verifiering FÅR INTE förekomma. |
| 5 | `MI-04-093` | 4 | Universellt master password ÄR FÖRBJUDET. | Universellt master password FÅR INTE förekomma. |
| 6 | `MI-09-020` | 9 | Generell läsning av privata meddelanden ÄR FÖRBJUDEN. | Generell läsning av privata meddelanden FÅR INTE förekomma. |
| 7 | `MI-09-066` | 9 | Dold kameraaktivering ÄR FÖRBJUDEN. | Dold kameraaktivering FÅR INTE förekomma. |
| 8 | `MI-09-070` | 9 | Passiv kontinuerlig lyssning ÄR FÖRBJUDEN. | Passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 9 | `MI-10-012` | 10 | Generell läsning av privata kommunikationskanaler ÄR FÖRBJUDEN. | Generell läsning av privata kommunikationskanaler FÅR INTE förekomma. |
| 10 | `MI-13-135` | 13 | Dold kamera, dold mikrofon och passiv kontinuerlig lyssning ÄR FÖRBJUDNA. | Dold kamera, dold mikrofon och passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 11 | `MI-13-174` | 13 | Blind retry efter unknown outcome ÄR FÖRBJUDEN. | Blind retry efter unknown outcome FÅR INTE förekomma. |
| 12 | `MI-14-218` | 14 | Credential-, OTP-, PIN- och biometrisk data ÄR FÖRBJUDEN i vanligt minne. | Credential-, OTP-, PIN- och biometrisk data FÅR INTE förekomma i vanligt minne. |
| 13 | `MI-16-054` | 16 | Dold kameraaktivering ÄR FÖRBJUDEN. | Dold kameraaktivering FÅR INTE förekomma. |
| 14 | `MI-16-069` | 16 | Passiv kontinuerlig lyssning ÄR FÖRBJUDEN. | Passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 15 | `MI-16-140` | 16 | Vilseledande deepfake av verklig person ÄR FÖRBJUDEN. | Vilseledande deepfake av verklig person FÅR INTE förekomma. |
| 16 | `MI-17-092` | 17 | Gångkontext FÅR påverka presentation men SKA INTE sänka authoritykrav. | Gångkontext FÅR påverka presentation men FÅR INTE sänka authoritykrav. |
| 17 | `MI-19-169` | 19 | Blind retry efter unknown outcome ÄR FÖRBJUDEN. | Blind retry efter unknown outcome FÅR INTE förekomma. |
| 18 | `MI-20-239` | 20 | Credentialvärden ÄR FÖRBJUDNA i vanligt minne. | Credentialvärden FÅR INTE förekomma i vanligt minne. |
| 19 | `MI-25-314` | 25 | Blind reassignment ÄR FÖRBJUDEN när samma task kan skapa duplicerad publicering, betalning, deletion, meddelande eller kostnad. | Blind reassignment FÅR INTE förekomma när samma task kan skapa duplicerad publicering, betalning, deletion, meddelande eller kostnad. |
| 20 | `MI-28-215` | 28 | En generell “success = HTTP 200” policy ÄR FÖRBJUDEN för materiella workflows. | En generell “success = HTTP 200” policy FÅR INTE förekomma för materiella workflows. |
| 21 | `MI-30-283` | 30 | Direkt hopp från observation till broad activation ÄR FÖRBJUDET för materiell behaviorförändring. | Direkt hopp från observation till broad activation FÅR INTE förekomma för materiell behaviorförändring. |
| 22 | `MI-31-037` | 31 | Fri productionredigering av canonical prompt utan review ÄR FÖRBJUDEN. | Fri productionredigering av canonical prompt utan review FÅR INTE förekomma. |

**Bekräftelser:** den enda förändringen är standardisering till `FÅR INTE`. Förbudens materiella
innebörd är oförändrad. Inget requirement-ID, subjekt, objekt, villkor eller undantag har ändrats.

### B. Canonical filhygien

Utförd i nytt source-set `Sources/Canonical-Source-Set-v1.0/`. Working-Drafts orört.

| # | Ändring | Omfattning |
|---|---|---|
| H-01 | Dubbla filändelser `.docx.docx` rättade | 26 filer |
| H-02 | Kapitel 32 omdöpt från `Implementation Contract.docx.docx` till `Chapter 32 — Mobile Experience, Daily Operations and Canonical Implementation Contract.docx` | 1 fil |
| H-03 | Front matter omdöpt till `00 — Canonical Decision Register v1.0.docx` och `01 — Canonical Book Architecture and Chapter Plan v1.0.docx` | 2 filer |
| H-04 | `Title`-metadata satt per fil | 34 filer, var 0 |
| H-05 | `Subject`, `Author`, `Category`, `Keywords`, `Comments` satta | 34 filer |
| H-06 | Rubrikhierarki Heading 1–3 tillämpad i källfilerna | 34 filer, var 0 |
| H-07 | Listformatering, monospace för diagram, egen stil för requirement-ID och statusrader | 34 filer |

### C. Regenererade artefakter

Full canonical DOCX, full PDF, requirement register, validation report, manifest, changelog,
checksumlista och source-to-export map är regenererade från det nya source-setet.

### D. Nya härledda stöddokument

| Dokument | Karaktär |
|---|---|
| Canonical Glossary v1.0 | Härlett — definitioner ordagrant citerade ur boken med proveniens |
| Requirement-to-Architecture Traceability Matrix v1.0 | Härlett — mekanisk mappning |
| Requirement-to-Implementation Traceability Matrix v1.0 | Härlett — samtliga krav `not assessed` |
| Verification Matrix v1.0 | Härlett — verifieringsklass föreslagen ur normativ term |
| Editorial Review Report v1.0 | Härlett — redaktionell granskning, 4 observationer |
| Atlas Knowledge Edition v1.0 (Markdown) | Härlett — 32 kapitel med YAML-provenance + `requirements.jsonl` |

Inget av dessa dokument inför nya arkitekturkrav eller ändrar någon canonical bestämmelse.

### E. Ändringar som INTE gjorts

- Ingen ny systemprincip införd.
- Inget materiellt innehåll borttaget, komprimerat eller sammanfattat.
- Authoritymodellen L0–L6 oförändrad.
- Privacygränserna oförändrade.
- Absoluta förbudens räckvidd oförändrad — endast deras formulering standardiserad.
- Stage 1-scope oförändrat. Stage 1 ej påbörjad.
- Inga requirements sammanslagna, delade, omnumrerade, tillagda eller borttagna. 8 920 före och efter.
- De 9 krav som saknar §7-term lämnades orörda — beskrivande satser där normativ term inte är avsedd.
- `Sources/Working-Drafts/` rördes inte.
- Inga mappar städades, flyttades eller raderades.
- Boken markerades inte som canonicalt godkänd.

### F. Verifiering av r2

| Kontroll | Resultat |
|---|---|
| Stycken kapitel 1–32, före → efter | 50 949 → 50 949 |
| Stycken med skillnad | 22 |
| Skillnader som matchar godkänd korrigering | 22 av 22 |
| Oväntade materiella textändringar | 0 |
| Kapitel | 32/32 |
| Requirement-ID | 8 920 unika, 0 dubbletter, 0 luckor |
| Kvarvarande `SKA INTE` | 0 |
| Kvarvarande `ÄR FÖRBJUD*` | 0 |
| `FÅR INTE` totalt | 2 580 → 2 602 |
| PDF-sidor | 1 315, 0 tomma, 0 blockerande fel |
| Working-Drafts oförändrad | 35/35 identiska SHA-256 |

---

## r1 — Första sammanställda utgåva

Se `../Canonical-Edition-v1.0-Review-Candidate/Change Log v1.0.md`. Tolv formatterande ändringar
(C-01–C-12), inga materiella textändringar, 5 observationer identifierade.

---

## Versionshistorik

| Version | Datum | Händelse |
|---|---|---|
| v1.0 rc r1 | 2026-07-30 | Första sammanställda canonical utgåva. Validering, 0 blockerande fel, 5 observationer. EJ godkänd. |
| v1.0 rc r2 | 2026-07-30 | Kontrollerad pre-canonical pass. 22 terminologikorrigeringar, filhygien, 6 härledda stöddokument. EJ godkänd. |
| **v1.0 APPROVED** | **2026-07-30** | **Låsnings- och statuspass. Endast status- och paketmetadata. Godkänd av André Hultgren.** |
| **v1.0 APPROVED r2** | **2026-07-30** | **Statusharmonisering. 35 statusrader. Noll andra textändringar.** |
| **v1.0 APPROVED r3** | **2026-07-30** | **BL-06 och BL-07. 2 stycken med framtida godkännandevillkor omformulerade till uppfylld status.** |
