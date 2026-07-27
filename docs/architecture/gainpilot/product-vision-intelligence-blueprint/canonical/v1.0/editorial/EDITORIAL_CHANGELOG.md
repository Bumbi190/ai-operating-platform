# Editorial changelog — GainPilot — Product Vision & Intelligence Blueprint

Version v1.0 · Canonical Review Candidate · 2026-07-26

Alla korrigeringar nedan gäller **endast de finaliserade artefakterna**. De 32 ursprungliga
käll-DOCX är oförändrade och bevaras som proveniens.

## 1. Kontraktsserien — rättelse av auditfel (viktigast)

Den första auditen använde sökmönstret `GP-\d{3}`, som endast matchade tresiffriga
kontraktsnummer och därför **missade GP-1–GP-99**. Den rapporterade felaktigt 591 kontrakt med
start vid GP-100. En ny kontroll med mönstret `Kontrakt GP-<n>` verifierade den fullständiga serien
**GP-1–GP-690 (690 kontrakt)**, sammanhängande och unik, med GP-690 som sista kontrakt i Kapitel 32.
Efter uttryckligt ägarbeslut är GP-1–GP-690 den fastställda canonical serien. Inga kontrakt har
omnumrerats, skapats, raderats eller skrivits om.

## 2. Kapitel 1 — borttaget konversationsförspel (GODKÄNT AV ÄGAREN 2026-07-26)

Artefakten visade sig vara **17 sammanhängande stycken** ([0]–[16]) — en konversation om mappnamn,
ett katalogträd och raden "Här kommer hela uppdaterade kapitlet från början till slut." Det verkliga
kapitlet börjar därefter vid "Kapitel 1 / GainPilots uppdrag". **Ägaren har uttryckligen godkänt
(2026-07-26) att samtliga 17 förspelsstycken tas bort** från de finaliserade artefakterna; den
canonical texten för Kapitel 1 börjar vid "Kapitel 1 / GainPilots uppdrag". Originalkällan är
oförändrad. Den fullständiga borttagna texten återges nedan (bevarad ordagrant):

> Absolut xD Vi gör det ordentligt så du slipper försöka pussla ihop sektionerna själv.
> Jag tycker att huvudmappen ska heta:
> GainPilot — Product Vision & Intelligence Blueprint
> På datorn eller i projektmappen kan du använda ett mer tekniskt namn utan specialtecken:
> gainpilot-product-vision-intelligence-blueprint
> En bra första struktur är:
> gainpilot-product-vision-intelligence-blueprint/
> ├── 01-chapters/
> │   └── Chapter-01-GainPilots-Mission.docx
> ├── 02-editorial-review/
> ├── 03-canonical/
> ├── 04-research-and-sources/
> ├── 05-diagrams-and-assets/
> ├── 06-validation/
> └── README.md
> Eftersom vi fortfarande skriver och granskar boken ska Kapitel 1 tills vidare ligga i 01-chapters. Vi flyttar eller kopierar det inte till 03-canonical förrän hela boken har genomgått slutlig granskning och blivit godkänd.
> Här kommer hela uppdaterade kapitlet från början till slut.

## 3. Kapiteltitlar — versalnormalisering

Källtitlarna i kapitel 5–32 stod i VERSALER; kapitel 2–4 i gemener. För konsekvens presenteras alla
kapiteltitlar i gemen/mening-form (t.ex. "KOSTINTELLIGENS" → "Kostintelligens"). Betydelsen är
oförändrad. Ett uppenbart typografiskt fel rättades: kapitel 27:s "INCIDENTer" → "Incidenter".

## 4. Filnamn (BESLUT 5)

De finaliserade separata kapitlen har konsekvent namngivning `Kapitel NN — Titel.md`. Detta rättar
källornas blandade konventioner (`Kapitel` vs `KAPITEL`), kapitel 1:s dubbla `.txt.docx`, kapitel 9:s
avhuggna filnamn och kapitel 32:s avslutande blanksteg. Källfilernas namn är oförändrade.

## 5. Kontraktsformatering

Kontraktsdeklarationer (`Kontrakt GP-n — Titel`) är fetmarkerade i finalen för läsbarhet.
Kontraktstexten är oförändrad. Kategoriseringen i registret är en härledd, nyckelordsbaserad
klassificering och påverkar inte kontraktstexten.
