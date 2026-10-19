# Omnira Trading – C3C kontraktsskopad historisk datagräns

**Datum:** 2026-10-19  
**Scope:** endast read-only / provider-neutral TypeScript-source result och konsumtionsvalidering.  
**Status:** **KODIMPLEMENTATION FÖR GRÄNSEN GENOMFÖRD, FORTFARANDE EJ PROD-RELEASE**.  
**Bas:** `main` @ `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`.  
**Arbetsbranch:** `feat/trading-c3c-historical-source-boundary-20261019`.  
**Authority:** `specifications/market-data/Omnira Trading System – Contract-Scoped Historical Candle Source Result – Canonical v1.0.md` (Beslut N), utan ändring av den kanoniska specifikationen.

## Vad som är implementerat

- `apps/web/lib/trading/market-data/historical-contract-source.ts`: `HistoricalContractCandleSource.read()` asynkron port för exakt **ett** konkret `ResolvedContract` och kanoniska `1m`-request-DTO:n. Ingen provider anges eller anropas i detta steg.
- Resultatfamiljer `OBSERVATIONS`, `NO_DATA`, `REFUSED / SOURCE_REQUEST_UNAVAILABLE`, `INVARIANT_VIOLATION`. `OBSERVATIONS` kräver minst en candle; `NO_DATA` bär ingen candlelista alls.
- `SETTLED` och `UNKNOWN` är ordagrant källans observationsstatus; de härleds aldrig ur antal bars. `UNKNOWN` blir inte `SETTLED` vid slutet av ett intervall.
- För lyckat resultat kontrolleras *ekat konkret kontrakt* och *prefix-täckning* via befintliga `parseResolvedContract`, `sameContract`, `isTimestamp`, `toEpochMs`. Ingen lexikografisk tidsjämförelse.
- Strukturfel på `MarketCandle` avvisas, utan flyttalskonvertering eller ändring av prissträngar. **Själva `buildContractCandleSegment` är fortsatt den enda ägaren till ordnings-/grid-/intervalldubblettvalidering.**
- Endast efter godkänd validering byggs `ContractCandleSegment` och `ObservedMinutes` med samma `sourceState`. `evaluateBucketEvidence` och SessionCalendar måste fortfarande köras nedströms; detta arbete **beräknar inte** `BarCompleteness`.
- Fönsterfortsättning använder exakt accepterade `coverage.to` till originalbegärans `to`. Ingen pagingcursor, ingen sidstorlek, inget `hasMoreBefore` och ingen automatisk rollover.
- Tekniska fel **rejectar Promise** och förvandlas inte till `NO_DATA`, `UNKNOWN` eller provider-vägran.
- `apps/web/lib/trading/market-data/index.ts` exponerar typer/funktioner för C3C, inte via den breda `@/lib/trading` authority-barrelen.
- `market-data/import-discipline.test.ts` uppdaterat med `../market-price` för återanvändning av kanonisk exakt decimalparser, inte en ny numerisk implementation.

## Verifierade tester (faktiska körningar, inte antagna)

**Windows / Node v22.22.3:** Nodens TypeScript-strip + resolverhook, isolerad temporär kopia av tradingbiblioteket och nya källfilerna: **24 / 24 PASS** för `historical-contract-source.node-check.mjs` (ursprungligen tillfälligt namngiven `*.node.test.mjs`, sedan utanför Vitest-discovery).

**Mac / Vitest 2.1.9:** isolerad temporär kopia med nuvarande trading dependencies och de nya filerna; ordinarie två sviter: `historical-contract-source.test.ts` **11 / 11 PASS**, `import-discipline.test.ts` **28 / 28 PASS**, totalt **39 / 39 PASS**.

**Mac / TypeScript:** separat `tsc --noEmit --strict` med ES2020/Bundler/Node-typer mot nya C3C-source och Vitest-test samt beroendeimports: **PASS**.

Testmiljöerna var små temporära kopior. Ingen aktiv arbetsbranch eller data hos användaren ändrades. Tempmappar städades efter Mac-körning; Windows tempmapp är endast en isolerad testkopia och kan städas separat.

**Avgränsning:** En grön avgränsad Vitest-körning/TypeScript-kontroll ersätter inte en full Omnira-webbbuild, hela Vitest-sviten, en oberoende kodgranskning eller anslutning till faktiskt historiskt marknadsdata.

## Säkerhets- och källavgränsning

Detta är **inte** en adapter som hämtar NQ/MNQ/ES-priser. Den väljer inte provider, skapar inte betalkonto, köper inga marknadsdata, rör inte Supabase, Vercel, CRON, live-kalender eller broker-API. Inga API-nycklar, orders, riskbeslut eller handelssignaler kan skapas från detta lager.

Ett `ACCEPTED` från denna gräns betyder **enbart** att källrapporten får passera till existerande downstream validerings- och fullständighetslager. Det är **inte** ett bevis för korrekt market data, tillåtelse att handla eller statistisk edge.

**Öppna beroenden:** GATE-08:s faktiska dataprovider/avtal, fysiskt populerade ContractCalendar och SessionCalendar, historiskt source replay/snapshot-problem; GATE-01/02/03/04 pattern-definitioner för Strategy Engine. Jev uppskjuten.

## Föreslagen nästa arbetssekvens

1. Oberoende granskning av C3C-kod och testfall mot Beslut N; vid godkännande skapa minimal PR/merge utan provider-hook eller schemaändringar.
2. Research kring licensierad, faktiska NQ/MNQ/ES-kontraktsspecifik historisk 1m-data och avtalens rätt att lagra/använda för egna backtest; verifiera total kostnad före eventuell aktivering.
3. Implementera en **fixture/mock källa** genom just denna C3C-port och kör end-to-end `source → segment → ObservedMinutes → SessionCalendar evidence` med separata verkliga kalenderfixturer innan någon verklig adapter byggs.
4. Först efter dessa steg kan historik-backtest för den mänskligt godkända och versionerade strategin testas på rätt data. Resultat måste inkludera kostnader, out-of-sample och anti-lookahead.

## Körkommandon när repo-dependencies finns

```bash
# scoped Vitest, från apps/web
npx vitest run lib/trading/market-data/historical-contract-source.test.ts lib/trading/market-data/import-discipline.test.ts

# fristående Node >=22, från repo-roten
node --experimental-strip-types --test apps/web/lib/trading/market-data/historical-contract-source.node-check.mjs
```

**Ingen PR/merge skapad här för att inte utlösa onödiga GitHub Actions-kostnader.** Inga canonical tradingregler har ändrats.
