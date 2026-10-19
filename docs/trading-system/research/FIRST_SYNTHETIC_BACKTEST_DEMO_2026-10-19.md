# Första replay/backtest-demonstrationen – syntetisk och offline

**Datum:** 2026-10-19  
**Status:** FUNGERANDE SYNTHETIC REPLAY DEMO; **inte** en verklig eller canonical NQ/ES-backtest  
**Researchbranch:** `research/trading-first-fixture-backtest-20261019`  
**Bas:** `main` @ `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`

## Vad vi verifierat

Omnira har redan `AtlasMarketView`, `ReplayControls`, `createFixtureReplayTimelineSource`, grafvy och valbara syntetiska testscenarier. **`PerformanceSection` är avsiktligt `Ej tillgänglig i Stage 1`** eftersom det saknas en verklig journal över stängda affärer. Vi ska **inte** byta ut det mot konstgjorda siffror eller kalla de för riktiga backtesting-resultat.

En separat researchmotor har därför skapats för att kunna demonstrera hela UX-flödet utan att bryta vyns informationsärlighet:

- `scripts/trading/research/first-fixture-backtest.mjs`
- `scripts/trading/research/first-fixture-backtest.test.mjs`

Motorn skapar 45 **författade** 1m-candles (14:00–14:44 UTC på ett valt testdatum), märker tre **författade** triggers och illustrerar en långposition vid nästa candles öppning. Den använder 8 ticks som illustrativ stop och 12 ticks som illustrativ take-profit, vilket **inte** är Omniras kanoniska setupdetektion eller riskbudget.

### Reproducerbart fixtureutfall

| ID | Inträde (syntetisk candle) | Utgång | Resultat R |
|---|---:|---|---:|
| SYN-W | 9 | TARGET på candle 11 | +1,5 R |
| SYN-L | 21 | STOP på candle 23 | −1,0 R |
| SYN-? | 33 | Samma candle träffar både stop och target | OKÄNT / ingen R bokförs |

I samtliga fall är scenarioutfallet **medvetet skrivet in i prisbanan** för att testa fel- och presentationslogik. 2 utfall är deterministiskt klassificerbara, 1 är tvetydigt. Netto bland de två är +0,5 R, med 50 % fixture-winrate och 1 R maximum nedgång. Detta får **aldrig** användas som skattning av expectancy, winrate eller profitrisk för riktig Liquidity Manipulation.

### Vad 'live idag' betyder

Vi har genererat en **fristående interaktiv HTML-demonstration** som öppnas lokalt utan server, konto, nycklar eller externa bibliotek. Den har candle-graf, tidsreglage, play/pause/step, 1×/3×/8×, författade signalmarkörer, stegvis equity och journal som endast visar händelser när replay-cursorn nått deras tidpunkt. Den har kontrollerats i headless Chromium vid 1366px och 390px utan JS-fel eller mobil överflöd; vid sista candlen visade den de förväntade resultaten.

Den färdiga HTML-filen är bifogad i den pågående ChatGPT-konversationen, inte införd i Omniras publika webbapp. Researchmotorns källkod och Node-tester är versionerade här; HTML-gränssnittet är ännu inte integrerat som en Omnira-route. Grafen är en demonstration, inte en operativ tjänst.

**Windows Node 22.22.3:** `node --test scripts/trading/research/first-fixture-backtest.test.mjs` gav **12/12 PASS**, 0 misslyckade. Testerna täcker syntetisk prisgeometri, exakta ticks, determinism, utfallssekvens, tvetydiga candles, R-utveckling och avsaknad av API/order.

## Säkerhetsgrindar och tydliga blockerare

1. GATE-01 iFVG, GATE-02 CISD, GATE-03 equal highs/lows, GATE-04 SMT är öppna. Ingen verklig trade-selection-strategi kördes.
2. GATE-08: ingen köpt/licensierad real NQ/ES-historik, inga autentiserade ContractCalendar- eller SessionCalendar-uppgifter och ingen operativ Databento-C3C-adapter finns.
3. Den syntetiska replayen antar hypotetiskt fill exakt på nästa candles open, **inga avgifter eller slippage** och ignorerar verklig market microstructure.
4. En 1m-bar som innehåller både SL och TP betraktas som **`AMBIGUOUS_INTRABAR` och får ingen PnL**, eftersom intrabarordningen inte kan härledas.
5. `tradeExecutionPermitted:false`, `financialNetUSD:null`, `usesCanonicalLiquidityManipulation:false`. Ingen Order ID eller RiskClearance eller ApprovalGrant produceras.
6. Ingen produktionsfil under `apps/web`, ingen PR, ingen merge, inget brokerkonto, ingen deployment och ingen billable-provider åtkomst har ändrats av denna branch.

## Nästa realistiska etapp

Vi kan förbättra en separerad fixture-**Backtest Lab**-vy i Omnira, med tydlig TESTDATA-stämpel, *efter* att användaren provat den fristående demon. Den riktiga historikmodulen behöver ett godkänt konkret kontrakt, exchange-årskalender, bestyrkta datarättigheter och en dokumenterad input-snapshot. Mönstergates måste dessutom stängas av människan med separata goldentestfall innan vi kan skatta strategiresultat eller föreslå ett live-/paper-körningsläge.

**Ingen automatisk handel är möjlig i denna demonstration.**
