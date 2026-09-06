# Omnira Trading System – Contract-Scoped Historical Candle Source Result

**Status:** Canonical v1.0
**Beslut:** N
**Datum:** 2026-09-05
**Auktoritet:** Kanonisk. Runtime i TypeScript är mekanisk transkription av denna text.
**Föregångare:** Market Data & Contract Lifecycle Canonical v1.0 (Beslut I), Contract
Selection Reason Code Canonical v1.0 (Beslut J), Contract Selection Decision
Materialisation Canonical v1.0 (Beslut K), Contract Selection Decision Recording & Replay
Canonical v1.0 (Beslut L), Recorded-First Contract Selection Orchestration Canonical v1.0
(Beslut M)

**Stänger:** GATE-08C-3A SOURCE-RESULT-SHAPE GAP, SOURCE-TECHNICAL-FAILURE STYLE
CONFLICT, OBSERVATION-SOURCE-STATE PRODUCER GAP (historisk C3C)

---

## §1. Varför detta dokument finns

Canonical v1.0 §13 namnger `HistoricalContractCandleSource` som den framtida
provider-neutrala, kontraktsskopade historikkällan. Canonical v1.0 §24 räknar upp vad
historik och live **delar** — `MarketCandle`, `ResolvedContract`,
`ContractSelectionDecision`, `ContractCandleSegment`, `BarCompleteness`, proveniens,
timeframe-regler — och säger sedan uttryckligen vad de **inte** delar:

> *"Inte gemensamt: paginering, uttömning, prenumerationslivscykel, backpressure."*

Paginering och uttömning är alltså kanoniskt **öppna med avsikt**, inte förbisedda. Ett
symmetriskt gemensamt gränssnitt är förbjudet. Ingen text har hittills avgjort hur ett
kontraktsskopat, intervallavgränsat historiskt anrop redovisar täckning, uttömning,
tomhet och fel.

En stängningsrevision inför C3C fann att det mesta redan var låst. `HistoricalContractRequest`
finns och är fullständig. Intervallsemantik, 1m-låsning, `PriceText`, volymnullbarhet,
`openTime`-identitet, kuvertburen kontraktsidentitet, rolloverdelning, SessionCalendar-
ägarskap och continuous-brandväggen är alla redan kanoniska.

Det som saknades var **resultatet**. Detta dokument låser det, och ingenting annat.

Revisionen fann också två fakta som gjorde besluten enklare. `ObservationSourceState`
med exakt `SETTLED | UNKNOWN` **finns redan** i completeness-lagret, och ingenting i
repositoryt producerar den — bryggan var byggd men omatad. Och den enda befintliga
historikkällan dokumenterar sitt eget uttömningsfält som *"A hint, not a promise"*, vilket
duger för ett diagram och diskvalificerar sig självt som strategibevis.

---

## §2. Vad detta dokument INTE gör

Det definierar **ingen** live-källa, ingen prenumerationslivscykel, ingen backpressure,
ingen återanslutning, inga sekvensnummer och ingen strömbuffring.

Det ändrar **ingen** befintlig runtime-fil. Det upphäver ingen befintlig regel, byter
inte innebörd på något befintligt fält och tolkar inte om Beslut I, J, K, L eller M.

Det implementerar ingenting. **C3C-runtime existerar inte i kod.**

```
LIVE CONTRACT CANDLE SOURCE — SEPARAT FRAMTIDA GRÄNS
```

---

## §3. Ärvda låsningar som inte öppnas

`HistoricalContractRequest` är **oförändrad** av Beslut N:

```
HistoricalContractRequest = {
  contract:   ResolvedContract
  timeframe:  '1m'
  from:       Timestamp        // inklusiv
  to:         Timestamp        // exklusiv
}
```

Förfrågan har **inget root-fält**. Den har ingen providersymbol, inget
`providerContractId`, ingen `limit`, ingen `cursor`, ingen `calendarVersion`, inget
`decisionId` och inget providerkapacitetsfält. Ingenting av detta tillförs här.

`CANONICAL_OBSERVATION_TIMEFRAME` förblir `'1m'`. En providervänd
strategiauktoritativ förfrågan accepterar **endast** den kanoniska basobservationen
(§11, §12).

Intervallet förblir **halvöppet** `[from, to)`: `from` inklusiv, `to` exklusiv,
`from < to` strikt. All jämförelse sker med instantsemantik genom befintlig
`Timestamp`-hantering, **aldrig** lexikalisk ordning.

---

## §4. N1 — Resultatets täckningsform

`HistoricalContractCandleSource` använder ett **intervall-chunk-resultat**.

Ett lyckat resultat bär:

```
{
  contract:     ResolvedContract      // ekot, se §31
  coverage: {
    from:       Timestamp             // inklusiv
    to:         Timestamp             // exklusiv
  }
  sourceState:  ObservationSourceState
  ...                                 // observationsmaterial eller uttalad frånvaro
}
```

Detta är provider-neutral **intervalltäckning**.

Ingen cursor exponeras. Ingen `count` eller `limit` exponeras. Ingen providersidas
pagineringstoken exponeras. Det finns **inget `hasMoreBefore`**.

---

## §5. Täckning är ett prefix

För en förfrågan `[from, to)` får ett lyckat data- eller frånvaroresultat täcka
`[coverage.from, coverage.to)`, med kraven:

```
coverage.from  motsvarar  request.from
coverage.from  <  coverage.to
coverage.to    <=  request.to
```

Den returnerade täckningen **måste vara ett prefix** av det begärda intervallet.

En godtycklig mittskiva är otillåten: för förfrågan `[a, z)` får ett resultat inte
returnera `[m, q)` utan att `[a, m)` först har täckts.

Skälet är konkret. Utan cursor kräver deterministisk fortsättning **en enda kanonisk
progressionsriktning**. Nästa förfrågan börjar vid `coverage.to` och behåller det
ursprungliga `request.to`.

---

## §6. Täckningsjämförelse

Täckningens inneslutning och ordning avgörs med **instantsemantik**. Lexikalisk
`Timestamp`-jämförelse är förbjuden: `Timestamp` tillåter ett valfritt millisekundfält,
och som text sorterar `'.'` före `'Z'`, så `…T00:00:00Z` och `…T00:00:00.500Z` ordnas
fel.

`Timestamp`-text normaliseras **aldrig**. Förfrågans text förblir anroparägd, och
täckningsgränsens text bevaras exakt som den lämnades.

Ingen ny tidsrepresentation införs.

---

## §7. Ingen cursor

Beslut N v1 **avvisar** cursor-baserad paginering på källporten.

Inget `cursor`, `nextCursor`, `before`, `after`, `pageToken`, `continuationToken`,
`offset` eller `providerCursor` förekommer i den kanoniska porten.

En provideradapter **får** internt använda vilken pagineringsmekanism dess provider
kräver. Den implementationsdetaljen får inte läcka ut genom källporten.

---

## §8. Ingen limit

`count`, `limit`, `pageSize` och `maxBars` tillförs **inte** `HistoricalContractRequest`.

Providergränser är adapterimplementation. Källporten exponerar **sanna täckta
intervall**, inte providerns lagringsmekanik.

---

## §9. N2 — Uttömning

Det finns **inget `hasMoreBefore`** och ingen hint-baserad uttömning.

**Ett resultats täckningsintervall är ett löfte, inte en gissning.**

Uttömning får **aldrig** härledas ur `candles.length`, ur `candles.length < limit`, ur
providerns sidstorlek, ur en tom sida eller ur den äldsta returnerade candlen.

Stage 1.9B:s `hasMoreBefore` förblir prejudikat **endast** för diagram- och
historiknavigering och ärvs uttryckligen inte.

---

## §10. Full täckning av förfrågan

För den ursprungliga förfrågan `[from, to)` har intervallets slut nåtts först när en
sanningsenlig resultatkedja har fört täckningen fram till:

```
coverage.to  ==  request.to          (instantsemantik)
```

Ingen separat `EXHAUSTED`-flagga införs för att upprepa samma faktum. Inget `hasMore`,
`isLastPage`, `done` eller `completePage`. **Täckningen äger progressionen.**

---

## §11. Settled täckning kontra nådd slutpunkt

Dessa är **skilda frågor**.

Ett resultat får nå `coverage.to == request.to` medan `sourceState` är `UNKNOWN`. Det
ger **ingen** strategiauktoritativ fullständighet.

Omvänt betyder `sourceState = SETTLED` för ett prefix **inte** att hela den ursprungliga
förfrågan är täckt.

```
1. Hur långt har resultatet progredierat?      → coverage
2. Kan källan intyga att observationsmängden
   för DEN täckningen är avslutad?             → ObservationSourceState
```

---

## §12. N4 — `ObservationSourceState` återanvänds exakt

Ingen ny settledness-uppräkning införs. Den befintliga används oförändrad:

```
ObservationSourceState = 'SETTLED' | 'UNKNOWN'
```

Inga källsidiga alternativ som `COMPLETE`, `PARTIAL`, `INCOMPLETE`, `EXHAUSTED`, `FINAL`
eller `PENDING`.

Den saknade producenten av `ObservationSourceState` **är** det historiska
kontraktskällresultatet. Lyckade källutfall bär den direkt. Det stänger
`OBSERVATION-SOURCE-STATE PRODUCER GAP` för historisk C3C.

---

## §13. Betydelsen av `SETTLED`

`SETTLED` betyder:

> källan intygar att den observationsmängd den rapporterar, för det angivna
> täckningsintervallet, är **fullständigt uppräknad enligt den källan**.

Det betyder **inte**:

```
varje förväntad handelsminut har en candle
den kanoniska bucketen är COMPLETE
börsen var öppen
marknaden handlade
strategin får fortsätta
```

Dessa slutsatser tillhör den senare kanoniska fullständighetsbedömningen.

---

## §14. Betydelsen av `UNKNOWN`

`UNKNOWN` betyder:

> källan kan inte sanningsenligt intyga att observationsmängden för det angivna
> täckningsintervallet är avslutad.

Data **kan ändå finnas**.

`UNKNOWN` betyder **inte** noll barer, providerfel, stängd marknad eller `PARTIAL`.

En strategiauktoritativ pipeline ska faila closed nedströms genom den befintliga
fullständighetsmaskinen.

---

## §15. `BarCompleteness` förblir separat

`HistoricalContractCandleSource` returnerar **aldrig** `BarCompleteness`, och aldrig
`COMPLETE`, `PARTIAL` eller `UNKNOWN` som en fullständighetsklassificering.

Källan tillhandahåller **endast** `ObservationSourceState` plus observationsmaterial.

Det befintliga completeness-lagret förblir auktoritativt för `COMPLETE`, `PARTIAL`,
`UNKNOWN`, `NO_CANONICAL_CANDLE` och `sessionTruncated`.

---

## §16. `ObservedMinutes`-bryggan

Beslut N låser den konceptuella bryggan:

```
accepterat källobservationsresultat
  → candlarnas openTime
  → ObservedMinutes { sourceState, minuteOpenTimes }
  → evaluateBucketEvidence(bucket, expectation, observed)
```

Den logiken dupliceras **inte** inuti källan. Källan får **inte** självcertifiera
kanonisk `BarCompleteness`.

---

## §17. N3 — Tomsemantik

En naken `candles: []` duger **inte** som mångtydigt lyckat utfall.

Beslut N skiljer två **lyckade** källutfall:

```
OBSERVATIONS   — en eller flera MarketCandle-observationer
NO_DATA        — inga candle-observationer
```

Båda bär `contract`, `coverage` och `sourceState`.

---

## §18. Betydelsen av `NO_DATA`

`NO_DATA` betyder **endast**:

> källan returnerade inga candle-observationer för det angivna täckningsintervallet.

Det betyder i sig **inte**: stängd marknad, noll förväntade handelsminuter, helgdag,
sessionslucka, att ingen handel skedde, att providern saknar historik för alltid, att
ingen kanonisk candle får existera, eller någon `BarCompleteness`-klassificering.

De tolkningarna tillhör `SessionCalendar` + `ObservedMinutes` + `evaluateBucketEvidence`.

---

## §19. `NO_DATA` + `SETTLED`

Betyder att källan sanningsenligt intygar att **inga** observationer rapporterades av
den källan för det täckta intervallet.

Nedströms blir `minuteOpenTimes = []`, och fullständighetslagret avgör innebörden:

```
noll förväntade minuter   → kan bli NO_CANONICAL_CANDLE
förväntade minuter > 0    → kan bli PARTIAL
```

Dessa slutsatser kodas **inte** in i källresultatet.

---

## §20. `NO_DATA` + `UNKNOWN`

Betyder att noll observationer returnerades **och** att källan inte kan intyga att detta
är en avslutad observationsmängd.

Fullständigheten nedströms förblir fail-closed. Det får **inte** uppgraderas till
avslutad frånvaro.

---

## §21. Minimal tomvokabulär

Källsidiga tomorsaker som `MARKET_CLOSED`, `HOLIDAY`, `NO_TRADES`, `SESSION_GAP` eller
`ZERO_EXPECTED_MINUTES` införs **inte**, eftersom källan inte äger `SessionCalendar`-
sanning.

Beslut N v1 använder därför `NO_DATA` med `SETTLED | UNKNOWN` som den minsta
sanningsenliga källsidiga tomdistinktionen. **Ingen åttavägs tomorsaksuppräkning.**

---

## §22. Källvägran

En källa kan veta att en strukturellt giltig förfrågan inte kan betjänas av just den
konfigurerade källan. Det är **inte** `NO_DATA`.

En provider-neutral lokal källvägran låses:

```
SOURCE_REQUEST_UNAVAILABLE
```

Betydelse: den konfigurerade historikkällan kan inte sanningsenligt betjäna denna
förfrågan. Exempel **kan** inkludera implementationsspecifika begränsningar i
behörighet, retention eller kapacitet. **Den kanoniska koden påstår inte varför.**
Providerspecifika skäl tillhör diagnostik och proveniens senare.

---

## §23. Vägran är inte tekniskt fel

`SOURCE_REQUEST_UNAVAILABLE` är en **semantisk** källvägran.

Den representerar **inte** timeout, återställd anslutning, HTTP 500, WebSocket-fel,
DNS-fel, processundantag, parserkrasch eller oväntat transportfel. Sådant följer §28.

---

## §24. Resultatfamiljer

Beslut N kräver konceptuellt dessa källresultatfamiljer:

```
OBSERVATIONS           lyckat, med observationsmaterial
NO_DATA                lyckat, utan candles
REFUSED                bär SOURCE_REQUEST_UNAVAILABLE
INVARIANT_VIOLATION    källgränsens säkerhetsutfall, inte en providervägran
```

Exakt TypeScript-stavning låses inte utöver vad semantisk tydlighet kräver; repositoryts
konvention får avgöra resten.

---

## §25. `MarketCandle`-material

`OBSERVATIONS` använder den befintliga `MarketCandle`-vokabulären.

Provider-nativa candle-typer tillförs **inte** den kanoniska porten. Avkodning och
normalisering av provider-nativ payload sker bakom adapter-/källimplementationens gräns.
Provider-nativ rå payload blir **aldrig** den kanoniska publika resultatformen.

Kanonisk acceptans sker fortfarande nedströms.

---

## §26. Källan returnerar inte `ContractCandleSegment`

`HistoricalContractCandleSource` returnerar **inte** ett `ContractCandleSegment`. Den
returnerar material ur vilket det kanoniska lagret får konstruera ett.

Skälet: `buildContractCandleSegment` är den **validerande konstruktorn**. Att hålla den
konstruktionen utanför providerkällan hindrar kanonisk acceptans från att gömmas bakom
en providergräns.

---

## §27. Segmentvalidering förblir auktoritativ

Beslut N flyttar och duplicerar **inte** ordningsvalidering, dubblettvalidering,
utanför-intervall-validering, fönstervalidering eller segmentvalidering.

Sortering, deduplicering, reparation, klampning eller filtrering tillförs **inte** kanon
för att få källutdata att passera. Källutdata **repareras inte**.

Befintliga konstruktorer och vägranskoder förblir auktoritativa, oförändrade:
`UNORDERED_INPUT`, `DUPLICATE_DISAGREEMENT`, `DUPLICATE_CANDLE_INSTANT`,
`CANDLE_BEFORE_WINDOW`, `CANDLE_AT_OR_AFTER_WINDOW` och övriga segmentregler.

---

## §28. N5 — Tekniskt fel

`HistoricalContractCandleSource` är asynkron.

**Förväntade semantiska källutfall resolvar normalt. Tekniskt fel och
infrastrukturfel avvisar löftet (rejects).**

Tekniskt fel omvandlas **inte** till domänutfall som `ERROR`, `UNAVAILABLE`,
`NETWORK_ERROR`, `SOURCE_ERROR`, `INFRA_ERROR` eller `UNKNOWN_ERROR`.

Detta är den nyaste husregeln, densamma som Beslut M §34 låste för orkestreringen.

---

## §29. Stage 1.9B sätter inget prejudikat här

Den befintliga root-orienterade `HistoricalCandleSource` fortsätter använda
`UNAVAILABLE` och `ERROR` för sitt diagram- och navigeringskontrakt. Den källan är
redan kanoniskt **aldrig strategiauktoritativ** (§13).

Beslut N ärver uttryckligen **inte** dess tekniska felform. **Ingen ändring av Stage
1.9B-runtime ingår i detta beslut.**

---

## §30. Tekniskt fel failar closed

Ett avvisat källöfte betyder att **inget kanoniskt källresultat existerar**. Inga
candlar från den misslyckade operationen får fortsätta som strategibevis.

Det kanoniska kompositionslagret får **inte** fånga-och-omvandla tekniskt fel, om inte
en senare uttrycklig gräns äger den omvandlingen.

---

## §31. N6 — Kontraktseko

Lyckade resultat — både databärande och frånvaro — **måste** eka `ResolvedContract`.

Resultatets `contract` ska motsvara förfrågans `contract`.

Detta är avsiktligt trots att anroparen redan äger förfrågan. Skälet: **ett svar för fel
kontrakt får inte maskera sig som observationer för det begärda kontraktet.**

---

## §32. Kontraktsjämförelse

Kontraktslikhet är **strukturell och explicit**:

```
root
cycle.year
cycle.quarterMonth
```

`JSON.stringify`, canonical JSON, hash, providersymbolsjämförelse och objektidentitet är
**inte** auktoritativa för denna kontroll.

---

## §33. `CONTRACT_MISMATCH`

Ekar ett lyckat källresultat ett annat kontrakt: **faila closed** — före
`ContractCandleSegment`-konstruktion, före `ObservedMinutes`-konstruktion, före
aggregering och före strategi-/detektorindata.

```
CONTRACT_MISMATCH — lokal källgränsinvariant
```

Det är **inte** en `ReasonCode`, `EventType`, incident, riskavslag, propavslag eller
providervägran.

---

## §34. `INVALID_COVERAGE`

Den kanoniska konsumenten ska validera returnerad täckning **innan** candlematerial
accepteras. Faila closed minst när:

```
coverage.from motsvarar inte request.from
coverage.from >= coverage.to
coverage.to > request.to
det returnerade intervallet gör ingen framåtprogression
```

```
INVALID_COVERAGE — lokal källgränsinvariant
```

Ingen klampning. Ingen härledd reparation. Ingen sortering av intervall.

---

## §35. Progression ersätter uttömningsflaggan

Den deterministiska fortsättningsregeln är:

```
next.from  =  accepterad coverage.to
next.to    =  ursprunglig request.to
```

Källan exponerar ingen cursor. Nås `request.to` av accepterad täckning har förfrågans
intervallgräns uppnåtts. **Detta är den enda uttömnings- och progressionsregeln i v1.**

---

## §36. Härled aldrig ur barantal

Uttrycklig förbudsregel: **antalet candlar bär noll information** om täckning,
settledness, uttömning eller förväntad-minut-fullständighet.

```
1 candle    kan täcka ett stort settled intervall med glesa observationer
1000 candlar kan tillhöra UNKNOWN täckning
0 candlar   kan vara SETTLED eller UNKNOWN
```

Källtillstånd härleds **aldrig** ur en arraylängd.

---

## §37. Rollover förblir anroparägd

En `HistoricalContractRequest` = **ett** konkret `ResolvedContract`.

En källa delar **aldrig** automatiskt över en rollgräns. Anroparen utfärdar separata
förfrågningar för separata konkreta kontrakt (§14). Ingen continuous-contract-
sammanfogning.

---

## §38. Continuous-contract-brandvägg

Ingen `continuous: false`-flagga tillförs.

Det befintliga `contract: ResolvedContract` gör redan continuous- och root-endast-
identitet **ospråkbar** för denna port. En redundant flagga skulle antyda att typen inte
räckte.

---

## §39. SessionCalendar-brandvägg

`HistoricalContractCandleSource` tar **inte** emot `SessionCalendar`.

```
källan          rapporterar observationer
SessionCalendar rapporterar förväntan
completeness    kombinerar dem senare
```

Dessa auktoriteter slås inte samman. Källan äger **inte** noll-förväntade-minuter-
semantiken; den tillhör fullständighetslagret (§18.1, §25).

---

## §40. Pris, kvantitet och volym

Oförändrat och inte återöppnat: `PriceText` för `open`, `high`, `low`, `close`; ingen
JS-float; `volume: PriceText | null` utan default `0`. Ingen `tradeCount`, ingen
bid/ask-volym, inget open interest.

---

## §41. Barens öppningsinstans

Oförändrat och inte återöppnat: `MarketCandle` nycklas på `openTime`. Ingen ny
`closeTime`, inget `receivedAt` som candle-identitet, ingen `Timestamp`-normalisering.

---

## §42. Proveniens — uppskjuten

Beslut N skapar **inte** `providerName`, `providerSymbol`, `providerContractId`,
`receivedAt`, `requestId` eller `transportId` i det kanoniska resultatet.

Skälet: `NONEMPTY-EVIDENCE VOCABULARY GAP` är fortsatt öppen/uppskjuten, så proveniens
saknar kanonisk destination. Kontraktsekot är en **säkerhetsgräns**, inte fullständig
proveniens.

```
SOURCE PROVENANCE FIELDS — UPPSKJUTNA
```

---

## §43. `receivedAt` och klockan

`receivedAt` krävs **inte**. Ingen väggklocka läses för att konstruera källsanning.

En framtida transportobservationstid får finnas som **proveniens endast**. Den får
aldrig påverka acceptans, täckning, settledness, kontraktsval eller `BarCompleteness`.

---

## §44. Cache

Ingen cachesemantik i v1: ingen cachenyckel, ingen TTL, inget färskhetsfönster, inget
cache-hit-tillstånd. Cache får finnas senare **bakom** källporten.

---

## §45. Providerkapacitet

`ExecutionProviderAdapter`-kapaciteter importeras och återanvänds **inte** i
marknadsdatakanon. Kapacitetssemantik får skjutas upp.

En källa som inte kan betjäna förfrågan svarar `REFUSED / SOURCE_REQUEST_UNAVAILABLE`
utan att en ny delad providerkapacitetsarkitektur införs.

---

## §46. Historisk kontra live

Den kanoniska separationen bevaras. Detta dokument definierar **endast**
`HistoricalContractCandleSource`.

Ett symmetriskt gemensamt historik/live-gränssnitt förblir **förbjudet** (§24).

---

## §47. Auktoritetsövergång

Utdata från `HistoricalContractCandleSource` är **inte omedelbart
strategiauktoritativt**. Det är endast **behörigt att inträda** i den kanoniska
validerings- och fullständighetskedjan:

```
historiskt kontraktskällresultat
  → kontrakts- och täckningsvalidering
  → ContractCandleSegment-konstruktion
  → ObservedMinutes
  → evaluateBucketEvidence
  → accepterat kanoniskt 1m-bevis
  → aggregering
  → detektorer / strategi
```

**Inget källresultat kringgår fullständigheten.**

---

## §48. Vad detta dokument stänger — och inte

**Stänger:**

```
GATE-08C-3A SOURCE-RESULT-SHAPE GAP           — STÄNGD
SOURCE-TECHNICAL-FAILURE STYLE CONFLICT       — STÄNGD
OBSERVATION-SOURCE-STATE PRODUCER GAP         — STÄNGD för historisk C3C
```

**Stänger inte:**

- `HISTORICAL DATA SNAPSHOT / REPLAY GAP` — **ÖPPEN / UPPSKJUTEN.** Detta dokument
  avgör inte om providerns candle-payload i sig ögonblicksbildas för replay. Inspelad
  `ContractSelectionDecision`-auktoritet medför **inte** tyst auktoritet över
  candledata-ögonblicksbilder. **Ingen C3C-blockerare.**
- `GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP` — **ÖPPEN / UPPSKJUTEN.**
- `GATE-08C-3B DECISION-RECORDED-AT GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- `GATE-08C-3B DECISION-STORE ORDERING GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- **`EFFECTIVE-TO NULL GENERAL SEMANTICS`** — **RESERVERAD.**
- `GATE-08C-2A DST-BOUNDARY GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B UNEXPECTED-MINUTE GAP` — **ÖPPEN / FAIL-CLOSED.**
- **`LIVE CONTRACT SELECTION ORCHESTRATION`** — **SEPARAT FRAMTIDA GRÄNS.**
- **`LIVE CONTRACT CANDLE SOURCE`** — **SEPARAT FRAMTIDA GRÄNS.**

**C3C-runtime är INTE implementerad.** Detta dokument beskriver semantiken; ingen
TypeScript-fil ändras av det. Ingen historisk kontraktskälla existerar i kod.

```
GATE-08 — FORTSATT DELVIS STÄNGD
```

Detta dokument utvidgar inte GATE-08:s stängning. Det låser källresultatsemantik så att
ett kommande lager kan transkriberas mekaniskt i stället för att uppfinna kanon i kod.
