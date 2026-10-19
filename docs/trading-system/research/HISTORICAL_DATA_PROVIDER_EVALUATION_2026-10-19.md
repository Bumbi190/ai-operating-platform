# Omnira Trading – Historical Market Data Provider Evaluation

**Datum:** 2026-10-19 (Europe/Stockholm)  
**Status:** PROVIDER RESEARCH / INTE CANONICAL / INGET DATAKÖP GODKÄNT  
**Basbranch:** `feat/trading-c3c-session-evidence-20261019` @ `d3ca4b9e41eaa75d141e9390b681f81404e3e94f`  
**Researchbranch:** `feat/trading-historical-provider-research-20261019`

> Denna utvärdering väljer **inte** operativ dataleverantör och stänger **inte** GATE-08. Alla budgetvärden är villkorade av offert och användningsklass. Ingen extern marknadsdatatjänst har anslutits, debiterats eller laddats ned. De fyra strategigates GATE-01/02/03/04 är fortfarande öppna.

## Rekommendation, 2026-10-19

**Databento Historical – Usage-based / `GLBX.MDP3` / `ohlcv-1m` är prioriterad KANDIDAT** för första avgränsade historiska testet av ett specifikt NQ-kontrakt och ett explicit ES-jämförelsekontrakt. Först när datakällans pris och licensklass är verifierade kan en person godkänna hämtningen. MNQ undersöks samtidigt för instrumentmetadata/exekveringsparitet.

Varför: Databento dokumenterar historiska 1m OHLCV, explicit kontrakts-/instrumentidentifiering, pay-as-you-go utan abonnemang för historik, metadata och symboluppslag utan datakostnad samt `metadata.get_cost` före köpet. Databento anger **125 USD i datakrediter för nya berättigade teamkonton, giltiga i sex månader**; detta är inte ett bevis för att användarens konto har krediter. Ingen definitiv offert har hämtats. Aktuella abonnemangsplaner för Live/Standard är separat prissatta, publicerat **199 USD/månad** efter juni 2026; vi behöver inte det för första historiska forskningssteget.

### Konkret jämförelse

| Kandidat | Relevans | Verifierat | Ej bekräftat | Beslut |
|---|---|---|---|---|
| Databento Historical usage-based | **Förstahandskandidat för historiska 1m-bars** | GLBX.MDP3, `ohlcv-1m`, explicit symbolhantering, prisfråga via `metadata.get_cost`, ingen historikprenumeration krävs | faktisk NQ/MNQ/ES-offert, licensvillkor för Omniras exakta verksamhet, cache/retention/rätt till lagring och AI-bruk | **Research**, ingen API-key |
| Rithmic R\|Protocol | Teknisk närhet till framtida exekvering | Officiell API- och historiesida beskriver tickdata, bars och historiskt material tillbaka till dec. 2011, med veckoallokering | faktisk Rithmic Test-historik, API/FCM-access, avtal och kostnader | **Behåll som execution-target**, historik inte förutsatt |
| CME DataMine | Officiell alternativ historikkälla | CME listar DataMine som sin historiska self-service-kanal | passande 1m NQ/MNQ/ES-dataset, leveransformat, pris, rättigheter | Reserv; jämför senare offert |

**Varning om licens:** CME:s policy skiljer display, non-display, historisk distribution och särskild användning i AI-lösningar. Databentos abonnentklass för *personal* kontra *commercial* och non-display bestäms av faktiskt användningsfall. Att en lokal app genererar analys/agentbeslut är INTE automatiskt samma sak som privat diagramvisning. För historisk data måste leverantör/avtal verifiera om intern analys, lagring, modellträning eller framtida kundprodukt kräver annan licens. Även om en historikplan saknar månadsabonnemang kan separata avtalsvillkor gälla.

## Dataformat och tekniskt ansvar

Enligt Databentos officiella schema:
- `ts_event` på `ohlcv-1m` identifierar **minutens öppningsinstans**; 1m-rekord är inte ett bevis för att hela marknadskalendern är färdig.
- Databento publicerar normalt ingen OHLCV-bar alls för en minut **utan affärer**. Frånvaro får inte fyllas som `0` eller ”marknad stängd”; Omniras kanoniska SessionCalendar och completeness-klassificering avgör detta.
- `open`, `high`, `low`, `close` är skalade heltal: **1e-9 pris per heltalsenhet**. Konverteringen måste vara exakt, inte genom lossy JS-float.
- `volume` är separat uint64. `0` (rapporterad nollvolym) får inte förväxlas med null/okänd volym.
- `instrument_id` och `publisher_id` kräver verifierad point-in-time metadata; symboler kan ommappas. `parent`- eller `continuous`-symboler får inte automatiskt gå in som en enda konkret `ResolvedContract`.
- Databentos sammanfattande 1m OHLCV ger inte tillräcklig intrabarsekvens för att avgöra samtidiga SL- och TP-träffar. För execution-precision kan trade/tickdata behövas senare. Förenklade 1m-backtests ska redovisa denna osäkerhet.

### Källgräns och ordningskrav

```
Licensed historical dataset (NOT connected)
  -> point-in-time definition + explicit resolved contract
  -> provenance and exact schema/field verification
  -> approved, cost-bounded ingestion and immutable raw snapshot (NOT implemented)
  -> C3C HistoricalContractCandleSource, only honest coverage + SETTLED/UNKNOWN
  -> ContractCandleSegment / ObservedMinutes / SessionCalendar evidence (coded in prior branch)
  -> identical 1m baseline for future approved pattern detection and backtests
```

En enskild syntetiskt avkodad OHLCV-bar får aldrig automatiskt ge `SETTLED`; källan måste intyga intervalltäckning separat. Ingen kortgenväg via chartens root-baserade `hasMoreBefore`.

## Genomförd kod i denna branch – helt offline

`scripts/trading/research/databento-historical-preflight.mjs` innehåller tre rena forskningsfunktioner:

1. `prepareHistoricalQuote`: bygger **endast en beskrivning** av parametrar till Databentos kostnadsfråga `metadata.get_cost` för **ett explicit verifierat** kontrakt, en minutjusterad period, `GLBX.MDP3`, `ohlcv-1m`, `raw_symbol` och ett verifierat instrument-ID. Ingen URL, autentisering, nätverksanrop eller datanerladdning.
2. `reviewHistoricalQuote`: kräver en explicit kostnadsoffert, budgetgräns, matchande evidence-ID och licensbedömning. Även när alla är uppfyllda blir resultatet endast **`READY_FOR_HUMAN_REVIEW_ONLY`, med `downloadAllowed:false` och `purchaseAllowed:false`**.
3. `inspectNormalizedOhlcv1m`: granskar en redan **normaliserad, konstruerad**, inte faktisk vendor-payload. Validerar dataset/schema/rtype=33, nanosekunds-timestamp som minutöppning, instrument/publisher-ID, exakta skalade int64-priser, uint64-volume och OHLC-struktur. Returnerar kandidatobjekt med **`sourceState:'UNKNOWN'` och `canBecomeStrategyEvidence:false`**. Detta är inte en komplett DBN- eller JSON-avkodare; den separationen är avsiktlig.

Dessutom: `scripts/trading/research/databento-historical-preflight.test.mjs`. **20 av 20 offline-testfall godkända** i en isolerad Windows Node v22.22.3-testkörning. Ingen npm-installation, API-nyckel, Databento-anrop, exchange-data, kodändring i aktivt Omnira-arbetsträd eller debitering. Detta är **kodfunktionstester**, inte trading-backtests. Ett av testerna granskar även forskningskoden för nätverksanrop, credentials och orderfunktioner.

## Prisgrindar innan första verkliga hämtning

1. **Bekräfta licensklass:** historisk intern analys för Omnira/Atlas med möjlig automatiserad strategi, användning via företag respektive privatperson, lagringstid, rätt till AI-träning och om visning/distribution ändrar avtalet. Använd inte nya användares kredit som dispens från avtalsvillkor.
2. **Metadata utan dataköp:** verifiera konkret `NQ`, `MNQ`, `ES` `ResolvedContract` med Databento definition/symbology-data; spara symbol, instrument-ID, expiry och källa. Låt Omniras eget ContractCalendar avgöra rollovers; inga automatiska backadjusted continuous prices.
3. **Förhandskostnad:** beräkna via `metadata.get_cost` med `GLBX.MDP3`, `ohlcv-1m`, `stype_in=raw_symbol` och ett **mycket smalt** research-intervall. Det är en informationsfråga, INTE en hämtning. Undvik `ALL_SYMBOLS`.
4. **Kostnadsgränser:** ange separat hård maxkostnad i Databentos användarportal (historisk användningsgräns) och inuti Omniras framtida provider-adapter. Databento säger att metadata/symbolhantering är kostnadsfri och att debiterade batchnedladdningar kan laddas om i 30 dagar utan ny datadebitering. Repetitiva streaming-requests kan debiteras igen.
5. **Manuellt köpbeslut:** exakt tidsintervall, symboler, schema, pris, kreditstatus, licens och beviljad summa måste granskas innan en enda request som faktiskt levererar prisdata får köras.
6. **Efter köp:** säkra rådata, checksum, licens/proveniens, normalisering och negativ datakvalitetsgranskning. Utvärdera verklig OHLCV mot kalendern; gå inte direkt till live/självstyrd trading.

## Saknas, utan att överdriva klar-status

- Inget konto, ingen verifierad $-offert, ingen köpt/hämtad historik och ingen API-/symbology-koppling till Omnira.
- Inga historiska CME-dataset, licenser, faktiska session-/kontraktskalendrar eller godkända pattern-detection-specifikationer.
- Ingen riktig C3C-dataadapter; researchmodulen är separat från `apps/web/lib/trading`.
- Ingen historisk backtest, performancevalidering eller live/paper exekvering.
- Ingen PR eller merge, inga produktions- eller GitHub Actions-körningar har startats.

## Officiella verifieringskällor (lästa 2026-10-19)

- Databento pricing: https://databento.com/pricing
- Databento historik API, `metadata.get_cost`: https://databento.com/docs/api-reference-historical
- Databento OHLCV-schemas: https://databento.com/docs/schemas-and-data-formats/ohlcv
- Databento symbology och point-in-time: https://databento.com/docs/standards-and-conventions/symbology
- Databento instrument definitions: https://databento.com/docs/examples/futures/futures-introduction/special-conventions-for-futures-on-databento
- Databento credits/usage: https://databento.com/docs/faqs/usage-pricing-and-data-credits
- Databento licensing/account security: https://databento.com/docs/portal
- Rithmic APIs/history: https://www.rithmic.com/apis
- CME licensing policy hub: https://www.cmegroup.com/market-data/license-data/market-data-policy-education-center.html

**Nästa tekniska gate:** först verklig offert och licensklass enligt ovan; sedan kan en separat, granskningsbar och explicit debiteringsspärrad historisk Databento-adapter föreslås. Ingen provider får anslutas automatiskt.
