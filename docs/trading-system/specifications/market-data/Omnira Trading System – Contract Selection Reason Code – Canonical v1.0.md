# Omnira Trading System – Contract Selection Reason Code

**Nivå:** Trading Core — reason code-vokabulär
**Version:** Canonical v1.0
**Datum:** 2026-09-03
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST vokabulär. Prospektiv verkan.
**Föregångare:** Ingen. Detta är den första kontraktsvalskoden.
**Moderauktoritet:** Market Data & Contract Lifecycle Canonical v1.0 §9–§10
**Ersätter:** Ingenting. Ingen befintlig kod ändras, byter namn eller får ny innebörd.

> **Detta dokument är provider-neutralt.** Det innehåller inga providernamn, inga
> symbolkonventioner, inga månadskoder och ingen front month-logik.

---

## §1. Varför detta dokument finns

Market Data & Contract Lifecycle Canonical v1.0 §9 kräver att ett
`ContractSelectionDecision` bär `reasons: readonly Reason[]`.

Registret i `reason-codes.ts` innehöll ingen sann **positiv** kod för att förklara
varför ett konkret kontrakt valdes. Varje befintlig kod beskriver antingen en
riskbedömning, en bruten auktoritetskedja eller en providerobservation. Ingen av dem
betyder "Omnira valde detta kontrakt ur sin egen kalender".

Konsekvensen var konkret och medveten: GATE-08C-1 lät bli att materialisera
`ContractSelectionDecision`, och GATE-08C-3A lät bli det igen, båda gångerna med
motiveringen att en beslutspost byggd på en orelaterad befintlig kod vore en
**falsk journalrad**. En tom `reasons`-lista vore samma fel tystare.

Detta dokument stänger exakt den vokabulärluckan. Det gör ingenting annat.

---

## §2. Koden

```
CONTRACT_SELECTED_BY_CANONICAL_CALENDAR
```

Exakt stavning. Låst.

Den registreras i `CORE_REASON_CODES`, inte i `RISK_REASON_CODES`: kontraktsval är
strukturell härkomst i auktoritetskedjan och marknadsdata, aldrig en riskbedömning.

---

## §3. Betydelse

> Omnira valde detta `ResolvedContract` **deterministiskt** ur en auktoritativ,
> explicit versionerad `ContractCalendar`, under den aktiva kanoniska
> kontraktsvalspolicyn.

Koden betyder **inte** något av följande, och får aldrig läsas så:

- att en provider valde kontraktet
- att en providers front month valde det
- att volym valde det
- att open interest valde det
- att en börssymbol tolkades fram
- att en månadskod härleddes
- att en människa godkände det
- att risk godkände det
- att exekvering är tillåten
- att marknadsdatan är komplett
- att ett nytt försök bör göras

Den är en **förklarande journalorsak**. Den skapar noll auktoritet.

---

## §4. Providerbevis får aldrig utlösa koden

Canonical v1.0 §9 tillåter att `evidence` innehåller providerobservationer — en
front month-etikett, observerad volym, open interest. Samma paragraf säger vad de är:
**bevis, aldrig utlösare.**

Därför:

Providerbevis **får** registreras bredvid ett val.

Providerbevis får **aldrig**:

- orsaka
- ändra
- åsidosätta
- rangordna
- eller mynta

`CONTRACT_SELECTED_BY_CANONICAL_CALENDAR`.

Koden rättfärdigas enbart av kalender- och policyupplösningen. Om det enda stödet för
ett val är en providerobservation har inget kanoniskt val skett.

---

## §5. Endast framgång

Koden är **positiv valhärkomst och ingenting annat**.

Saknar `ContractCalendar` auktoritativ täckning gäller §7.2 oförändrat:

```
resolve(root, T)  →  REFUSE
```

Då myntas **inget** `ContractSelectionDecision`, och därmed heller ingen orsak.

Detta dokument inför därför **ingen** av följande, och de får inte uppfinnas som
symmetri:

```
CONTRACT_SELECTION_FAILED
CONTRACT_SELECTION_REFUSED
CONTRACT_SELECTION_NO_COVERAGE
CONTRACT_SELECTION_UNKNOWN
```

Resolverns lokala vägran (`NO_AUTHORITATIVE_COVERAGE`) förblir **lokal**
anropskontraktsvalidering. Den befordras inte till journalkod här. En framtida
kanonisk text får besluta annorlunda; tills dess är den inte en `ReasonCode`.

---

## §6. `reasons` får inte vara tom

För ett nymyntat kanoniskt `ContractSelectionDecision` gäller:

`reasons` **MÅSTE** vara icke-tom och innehålla minst den kanoniska valorsaken.

Förväntad v1-lista:

```
[ reason('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR') ]
```

Fältet är plural därför att framtida kanonisk text kan lägga till fler orsaker.
**Pluralformen är inget krav på fler än en.**

För v1 gäller dessutom:

- lägg **inte** till providerobservationsorsaker
- kopiera **inte** `evidence` in i `reasons`
- koda **inte** in `calendarVersion` eller `policyVersion` i orsakstexten som en
  andra maskinsanning — de har egna fält på beslutet

`detail` är mänsklig text: icke-normativ, aldrig parsad, får ändras fritt.
**Koden är kontraktet.**

---

## §7. Historisk replay

Canonical v1.0 §10 gäller oförändrat.

Finns ett inspelat `ContractSelectionDecision`:

- **läs det**
- räkna **inte** om det
- mynta **inte** om dess orsak
- skriv **inte** om dess `reasons`

Finns inget tidigare beslut och en historisk körning **pinnar en explicit historisk
`ContractCalendar`-version**, får en framtida implementation mynta ett **nytt
oföränderligt** beslut. Det beslutet bär
`CONTRACT_SELECTED_BY_CANONICAL_CALENDAR`, eftersom valet kom ur den pinnade
kanoniska kalendern.

Utan pinnad kalenderversion: `REFUSE`. Inget beslut. Ingen positiv orsak.

---

## §8. Ingen auktoritet

Koden får aldrig läsas som `RiskClearance`, `PropClearance`, `ApprovalGrant`,
`ExecutionIntent` eller någon annan förmåga.

Ett `ContractSelectionDecision` svarar på:

> **VILKET KONTRAKT, OCH VARFÖR**

Det svarar inte på:

> huruvida en order får skickas

Ingen rangordning av `ReasonCode`. Ingen retry-policy. Ingen allvarlighetsgrad.

---

## §9. Prospektiv verkan

Koden gäller **framåt**.

Historiska rader skrivs aldrig om. En äldre rad som saknar koden är inte ogiltig och
får inte omtolkas. Koden är tillgänglig för `ContractSelectionDecision`-poster som
skapas efter att detta tillägg trätt i kraft.

---

## §10. Vad detta dokument stänger — och inte

**Stänger:**

```
GATE-08C REASON-CODE GAP — STÄNGD
```

Vokabulären finns nu och är sann.

**Stänger inte:**

- `C3B RUNTIME` — **EJ IMPLEMENTERAD.** Registret *känner* koden; ingenting *använder*
  den. Ingen `ContractSelectionDecision`, ingen `decisionId`, ingen `decidedAt`, inget
  beslutsregister och ingen replaylagring existerar.
- `GATE-08C-3A SOURCE-RESULT-SHAPE GAP` — **ÖPPEN.** Detta dokument säger ingenting om
  paginering, uttömning, prenumerationslivscykel eller backpressure.
- `GATE-08C-2A DST-BOUNDARY GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B UNEXPECTED-MINUTE GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B VOLUME POLICY` — **HÄRLEDD**, inte kanoniserad här.

```
GATE-08 — FORTSATT DELVIS STÄNGD
```

Detta dokument utvidgar inte GATE-08:s stängning. Det tillför ett ord till ett
register, med en låst betydelse och en uttalad gräns för vad ordet inte betyder.
