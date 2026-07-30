# Correction Proposal — Normativ terminologistandardisering

**Omnira — Mobile Intelligence & Device Control** · Canonical Edition v1.0 — APPROVED · 2026-07-30

> **Status: TILLÄMPAD OCH GODKÄND.** Korrigeringarna ingår i Canonical Edition v1.0, godkänd av
> André Hultgren 2026-07-30.
> `Sources/Working-Drafts/` är oförändrad och bevarad som proveniens.
> Boken är godkänd som **Canonical Edition v1.0 — APPROVED**.

---

## 1. Rättelse av antal

Slutrapporten för r1 angav **21** avvikande requirements. Det var en summeringsmiss från min sida:
20 förekomster av `ÄR FÖRBJUDEN/-ET/-NA` redovisades felaktigt som 19.

En fullständig omsökning av samtliga 8 920 krav ger:

| Avvikande form | Antal |
|---|---|
| `SKA INTE` | 2 |
| `ÄR FÖRBJUDEN` / `ÄR FÖRBJUDET` / `ÄR FÖRBJUDNA` | 20 |
| **Totalt** | **22** |

Sökningen kontrollerade även `EJ TILLÅTET`, `OTILLÅTET`, `ALDRIG`, `MÅSTE INTE` och `SKALL` — noll träffar.
Samtliga 22 är korrigerade. Det korrekta antalet är alltså 22, inte 21.

## 2. Korrigeringsregler

| Regel | Från | Till | Antal |
|---|---|---|---|
| **R1** | `SKA INTE` | `FÅR INTE` | 2 |
| **R2** | `ÄR FÖRBJUDEN` / `-ET` / `-NA` | `FÅR INTE förekomma` | 20 |

**R1** är ett rent tokenbyte. Ingen övrig ordföljd ändras.

**R2** ersätter en predikativ adjektivkonstruktion med bokens kanoniska modalkonstruktion.
Ett neutralt verb, `förekomma`, krävs eftersom `FÅR INTE` är ett modalt hjälpverb som behöver ett
huvudverb. `förekomma` valdes därför att det är det mest innehållsneutrala alternativet: det säger
att något inte får inträffa eller existera, vilket är exakt vad `ÄR FÖRBJUDEN` uttrycker. Samma verb
används i alla 20 fall så att transformationen är enhetlig och maskinellt granskningsbar.

**Ingen korrigering ändrar förbudets materiella innebörd.** Före och efter är båda absoluta förbud
med identisk räckvidd, identiskt subjekt och identiska villkor.

## 3. Rad-för-rad correction proposal

| # | Requirement-ID | Kap | Sektion | Regel | Nuvarande ordalydelse | Föreslagen ordalydelse |
|---|---|---|---|---|---|---|
| 1 | `MI-02-063` | 2 | 2.23 Icke-mål för första versionen | R1 | Första versionen SKA INTE försöka maximera mobilåtkomst på bekostnad av tydliga systemgränser. | Första versionen FÅR INTE försöka maximera mobilåtkomst på bekostnad av tydliga systemgränser. |
| 2 | `MI-04-036` | 4 | 4.13 Ingen dold övervakning | R2 | Dold mikrofon- och kameraaktivering ÄR FÖRBJUDEN. | Dold mikrofon- och kameraaktivering FÅR INTE förekomma. |
| 3 | `MI-04-046` | 4 | 4.16 Förklarad dataöverföring | R2 | Oannonserad extern dataöverföring ÄR FÖRBJUDEN. | Oannonserad extern dataöverföring FÅR INTE förekomma. |
| 4 | `MI-04-049` | 4 | 4.17 Ingen falsk device state | R2 | Påstådd framgång utan verifiering ÄR FÖRBJUDEN. | Påstådd framgång utan verifiering FÅR INTE förekomma. |
| 5 | `MI-04-093` | 4 | 4.33 Recovery utan bakdörr | R2 | Universellt master password ÄR FÖRBJUDET. | Universellt master password FÅR INTE förekomma. |
| 6 | `MI-09-020` | 9 | 9.7 Privata meddelanden | R2 | Generell läsning av privata meddelanden ÄR FÖRBJUDEN. | Generell läsning av privata meddelanden FÅR INTE förekomma. |
| 7 | `MI-09-066` | 9 | 9.19 Kamera | R2 | Dold kameraaktivering ÄR FÖRBJUDEN. | Dold kameraaktivering FÅR INTE förekomma. |
| 8 | `MI-09-070` | 9 | 9.20 Mikrofon | R2 | Passiv kontinuerlig lyssning ÄR FÖRBJUDEN. | Passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 9 | `MI-10-012` | 10 | 10.5 Privata meddelandeappar | R2 | Generell läsning av privata kommunikationskanaler ÄR FÖRBJUDEN. | Generell läsning av privata kommunikationskanaler FÅR INTE förekomma. |
| 10 | `MI-13-135` | 13 | 13.37 Sensor activation | R2 | Dold kamera, dold mikrofon och passiv kontinuerlig lyssning ÄR FÖRBJUDNA. | Dold kamera, dold mikrofon och passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 11 | `MI-13-174` | 13 | 13.49 Retry | R2 | Blind retry efter unknown outcome ÄR FÖRBJUDEN. | Blind retry efter unknown outcome FÅR INTE förekomma. |
| 12 | `MI-14-218` | 14 | 14.59 Memory | R2 | Credential-, OTP-, PIN- och biometrisk data ÄR FÖRBJUDEN i vanligt minne. | Credential-, OTP-, PIN- och biometrisk data FÅR INTE förekomma i vanligt minne. |
| 13 | `MI-16-054` | 16 | 16.15 Kameraaktivering | R2 | Dold kameraaktivering ÄR FÖRBJUDEN. | Dold kameraaktivering FÅR INTE förekomma. |
| 14 | `MI-16-069` | 16 | 16.19 Mikrofonaktivering | R2 | Passiv kontinuerlig lyssning ÄR FÖRBJUDEN. | Passiv kontinuerlig lyssning FÅR INTE förekomma. |
| 15 | `MI-16-140` | 16 | 16.38 Deepfake och identitetsmanipulation | R2 | Vilseledande deepfake av verklig person ÄR FÖRBJUDEN. | Vilseledande deepfake av verklig person FÅR INTE förekomma. |
| 16 | `MI-17-092` | 17 | 17.27 Gång och fysisk aktivitet | R1 | Gångkontext FÅR påverka presentation men SKA INTE sänka authoritykrav. | Gångkontext FÅR påverka presentation men FÅR INTE sänka authoritykrav. |
| 17 | `MI-19-169` | 19 | 19.47 Retry | R2 | Blind retry efter unknown outcome ÄR FÖRBJUDEN. | Blind retry efter unknown outcome FÅR INTE förekomma. |
| 18 | `MI-20-239` | 20 | 20.71 Credentials | R2 | Credentialvärden ÄR FÖRBJUDNA i vanligt minne. | Credentialvärden FÅR INTE förekomma i vanligt minne. |
| 19 | `MI-25-314` | 25 | 25.87 Unknown outcome | R2 | Blind reassignment ÄR FÖRBJUDEN när samma task kan skapa duplicerad publicering, betalning, deletion, meddelande eller kostnad. | Blind reassignment FÅR INTE förekomma när samma task kan skapa duplicerad publicering, betalning, deletion, meddelande eller kostnad. |
| 20 | `MI-28-215` | 28 | 28.71 Verification per effect type | R2 | En generell “success = HTTP 200” policy ÄR FÖRBJUDEN för materiella workflows. | En generell “success = HTTP 200” policy FÅR INTE förekomma för materiella workflows. |
| 21 | `MI-30-283` | 30 | 30.91 Continuous improvement loop | R2 | Direkt hopp från observation till broad activation ÄR FÖRBJUDET för materiell behaviorförändring. | Direkt hopp från observation till broad activation FÅR INTE förekomma för materiell behaviorförändring. |
| 22 | `MI-31-037` | 31 | 31.12 Promptversion | R2 | Fri productionredigering av canonical prompt utan review ÄR FÖRBJUDEN. | Fri productionredigering av canonical prompt utan review FÅR INTE förekomma. |

## 4. Bekräftelser

För samtliga 22 korrigeringar bekräftas följande:

- **Den enda förändringen är standardisering till `FÅR INTE`.** Inget annat ord, ingen annan
  ordföljd, ingen interpunktion och inget requirement-ID har ändrats.
- **Förbudets materiella innebörd är oförändrad.** Subjekt, objekt, villkorssatser, räckvidd och
  undantag är identiska före och efter.
- **Ingen ny systemprincip har införts.** Ingen authoritygräns, privacygräns eller Stage 1-avgränsning
  har påverkats.
- **Inget requirement har slagits samman, delats, omnumrerats, lagts till eller tagits bort.**
  Antalet krav är 8920 före och efter.

## 5. Maskinell diff-verifiering

Det nya canonical source-setet diffades stycke för stycke mot ursprungskällan:

| Kontroll | Resultat |
|---|---|
| Stycken i kapitel 1–32, före | 50 949 |
| Stycken i kapitel 1–32, efter | 50 949 |
| Stycken med skillnad | **22** |
| Skillnader som matchar en godkänd korrigering | **22 av 22** |
| Oväntade materiella textändringar | **0** |
| Kvarvarande `SKA INTE` i krav | 0 |
| Kvarvarande `ÄR FÖRBJUD*` i krav | 0 |
| `FÅR INTE` totalt i krav, före → efter | 2 580 → 2 602 (+22) |
| Krav utan §7-term, före → efter | 29 → 9 |

## 6. Vad som inte gjordes

- `Sources/Working-Drafts/` rördes inte. Samtliga 35 filer har oförändrade SHA-256-summor.
- Inga andra formuleringar justerades, inte heller de 9 kvarvarande krav som saknar §7-term.
  Dessa är beskrivande eller uppräknande satser där normativ term inte är avsedd.
- Boken markerades inte som godkänd.
- Stage 1 påbörjades inte.
