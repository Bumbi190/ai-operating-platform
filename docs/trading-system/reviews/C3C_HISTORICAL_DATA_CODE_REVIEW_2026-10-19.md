# Omnira Trading – C3C Historical Data Code Review

**Datum:** 2026-10-19  
**Status:** REVIEW-READY, EJ MERGAD, EJ CANONICAL DATAKÄLLA, INGEN EXEKVERING  
**Integrationsbranch:** `review/trading-c3c-pr-ready-20261019`  
**Bas:** `main` @ `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`  
**Avgränsning:** C3C `HistoricalContractCandleSource`, validering och `historical-evidence`-orkestrering. Ingen Databento-prototyp eller vendoradapter ingår.

## Viktiga granskade fynd och rättningar

**Fynd 1 – OHLC-inkonsistens accepterades tidigare.** Källgränsen verifierade att de sex candlefälten hade giltiga strängar men inte att `low <= open,close <= high` eller `low <= high`. En källa som utgav sig för att vara `SETTLED` kunde få en ogiltig OHLC-candle accepterad och senare bedömd för `BarCompleteness`. Vi lade till regressioner som först **FAILADE**, och implementerade `validOhlcvGeometry` med Omniras **befintliga** `parseDecimal` och `compareDecimal` – **inga JS-floatkonverteringar**.

**Fynd 2 – negativ volym accepterades tidigare.** `volume:'-1'` var en välformad `PriceText`, men semantiskt ogiltig som rapporterad handelsvolym. Nu vägras negativa volymer före kanoniskt segment; `0` och `null` förblir olika giltiga representationssätt.

**Kedjan testades genom två nivåer:** C3C-resultatvalidering samt hela `source → ContractCandleSegment → SessionCalendar → BucketEvidence`. Felaktiga OHLC och negativa volymer ger `INVARIANT_VIOLATION/MALFORMED_SOURCE_RESULT` respektive `BLOCKED/SOURCE_INVARIANT`, och ingen `evidence` exponeras från den senare grinden.

`market-data/import-discipline.test.ts` har en explicit tillåten import av den kanoniska domänmodulen `../decimal`. Ingen session- eller authority-brandvägg har försvagats; `market-data` importerar fortfarande inte `sessionExpectation` eller `evaluateBucketEvidence`. En separat `historical-evidence`-modul ansvarar för sammansättningen.

## Verifiering, utförd 2026-10-19

| Kontroll | Observerat resultat |
|---|---|
| Före rättning – isolerat Node C3C test | 25 av 27 PASS; två nya tester FAIL på OHLC-geometri och negativ volym – felet bekräftat |
| Efter rättning – isolerat Windows Node 22, faktisk TS source | **27/27 PASS** |
| Berörda 9 Vitest-sviter + kanoniska importgränser (Mac) | **248/248 PASS** |
| Hela `lib/trading`-testsamlingen i isolerad Mac-kopia | **48 testfiler, 1472/1472 PASS** |
| TypeScript `strict` scoped till source/reviews/tests | **PASS** |
| Övriga omnira-processer och pågående icke-tradingändringar | **Orörda** |
| Github Actions, Vercel, dataleverantör, API-debitering | **Ej körda** |

Testkörningen skedde i en separat temporär kopia av tradingkoden. Beroenden, docs och komponenter lästes från den lokalt tillgängliga Omnira-repon via read-only-symlänkar när testerna krävde dem. Dessa originalfiler ändrades inte. Testerna är inte en fullständig Next.js-build eller oberoende mänsklig kodgranskning.

Denna rena branch skapades därefter från `main` och innehåller **exakt de granskade produktionsfilerna och deras tester**. Data-preflight- och forskningsskripten i `scripts/trading/research` är uttryckligen separata. PR har ännu **inte** skapats, för att inte omedelbart utlösa kostsamma Actions-jobb.

## Vad resultatet inte bevisar

- **Ingen riktig börshistorik har köpts, hämtats, avkodats eller backtestats.**
- **Ingen operativ provider**, giltig CME-licens eller signerad kommersiell/non-display-kategorisering är verifierad.
- **Inget versionerat realt `ContractCalendar` eller `SessionCalendar`** har införts; testkalendrarna är syntetiska.
- Mönstergates **GATE-01 iFVG, GATE-02 CISD, GATE-03 equal highs/lows och GATE-04 SMT** är fortsatt `OPEN`. Ingen Strategy Engine är auktoriserad att använda forskningsmönstren.
- Den nya orkestreringen ger `BucketEvidence` och antal observationer, **inte** ett auktoritativt råprisarkiv, den faktiska dataprovideradaptern eller backtests reproducerbara OHLCV-korpus.
- Inga signaler, `TradeProposal`, `ApprovalGrant`, `ExecutionIntent`, orders, dataköp, cron-jobb eller produktionsändringar har gjorts.

## Rekommenderad beslutsordning före merge

1. Oberoende kodgranskning av denna **rena** branch (9 tradingfiler + detta dokument), inklusive C3C-källor, felbeteenden och beroendegränser.
2. Om användaren vill integrera: skapa en **draft PR** mot main, bevaka eller minimera CI-kostnader; godkänn inte merge utan godkänd review och nödvändiga tester.
3. Bedöm historikproviderns rättigheter/offert separat. Kör ingen extern datanedladdning utan förhandspris och uttryckligt godkännande.
4. Fastställ GATE-01–04 som separata godkända detection-specifikationer med golden fixtures innan någon strategi-backtest uppges vara giltig.
5. Fortsätt med en explicit testad rådatadekoder, filchecksummor, kontrakts-ID/proveniens, verkliga kalenderdata och transaktionskostnader innan performanceanalys.

**Slutsats:** Testad och isolerad **infrastruktur för kommande marknadsdata**, inte ett färdigt autonomt handelssystem.
