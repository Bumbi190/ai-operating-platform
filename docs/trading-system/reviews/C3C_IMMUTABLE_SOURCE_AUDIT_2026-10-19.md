# C3C – separat säkerhetsgranskning: accepterade candles får inte ändras efter validering

**Datum:** 2026-10-19  
**Status:** KODFEL REPRODUCERAT OCH RÄTTAT; SYNTHETISKA TESTER GODKÄNDA; MERGE/PR EJ STARTAD  
**Branch:** `review/trading-c3c-pr-ready-20261019`  
**Ansvar:** intern teknisk review – **inte** ett oberoende mänskligt godkännande eller en signering av canonical market data.

## Verifierat fynd: muterbara leverantörsreferenser

`buildContractCandleSegment` kopierar sedan tidigare bara candle-**arrayen**, medan varje `MarketCandle`-**objekt** är referensdelat. Det är dokumenterad semantik i den befintliga konstruktorn och är korrekt på dess nivå.

C3C-källgränsen överlämnade däremot tidigare just leverantörens egna objekt till konstruktorn. Efter att C3C kontrollerat exakt pris, OHLC-geometri, täckning, kontrakt och `sourceState` kunde ett anropande bibliotek senare mutera `raw.candles[0].high`, `close` eller `openTime`. Då ändrades **den godkända segmentcandle** utan ny validering, trots att `ObservedMinutes.minuteOpenTimes` redan hade skapats och frysts från det ursprungliga tidsvärdet.

Risk: datakonflikt mellan accepted candle och tidsunderlag, icke-reproducerbar lokal analys samt möjlighet att föra in efterhandsändrade priser i nästa valideringssteg.

### Red-green-bevis

1. Två nya oberoende Node-tester lades till i `historical-contract-source.node-check.mjs`.
2. **Före rättning:** 27 av 29 PASS; **två nya mutationstester FAIL**, vilket bevisade referensläckaget.
3. **Efter rättning:** 29 av 29 PASS på den anslutna Windows-datorn med Node v22.22.3, inklusive de tidigare 27 regressionerna.
4. Två motsvarande Vitest-kontroller tillagda i `historical-contract-source.test.ts`, en för att mutera providerobjekt **efter** acceptans och en för att verifiera avsaknad av delad identitet.
5. **Mac, isolerad kopia med giltiga underlag från lokala repositoryt:** hela `lib/trading`-testgruppen, **48 testfiler och 1474 av 1474 PASS** efter ändringen. Avgränsad strikt `tsc --noEmit` för berörda C3C- och historical-evidence-filer: **PASS**.

### Kodändring

`inspectHistoricalContractResult` skapar efter fullständig OHLCV-validering en **egen immutabel värdekopia** för varje accepterad candle:

```ts
Object.freeze({
  openTime: candle.openTime,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume,
})
```

Den lämnas till `buildContractCandleSegment`, som fortsätter vara oförändrad och behåller tidigare kontrakt, felkoder, ordnings- och kalendergränser. Providerägt original kan förändras av sitt bibliotek men kan inte skriva över redan accepterat OHLCV. Godkända objects kan heller inte muteras från läsande nedströms kod. Både pris- och tidssträngars ursprungliga **värden** bevaras oförändrade.

**Avgränsning:** detta är en lokal immutabilitetsgaranti i minnet. Det är **inte** ett rådataarkiv, bevis på authenticiteten hos marknadsdata, en historisk fil-snapshot för replay eller en lösning på `HISTORICAL DATA SNAPSHOT / REPLAY GAP`. Dessa frågor är fortfarande öppna.

## GitHub Actions / kostnadsbeslut

Kontroll av aktuella workflows på `main` visar **ofilterade `pull_request`-triggers** bland annat i:

- `.github/workflows/trading-canon-integrity.yml`
- `.github/workflows/atlas-project-isolation.yml`
- `.github/workflows/migration-guard-integrity.yml`

Den första gör ett litet Node-baserat integritetstest; de två senare använder `npm ci` och kan konsumera mer CI-tid. Även en draft PR kan starta dem. **Ingen PR skapas automatiskt**, eftersom användaren vill hålla omkostnaderna nere och granskningen kan dokumenteras på branch utan CI-jobb. En framtida PR/merge behöver ett separat uttryckligt godkännande när CI-budgeten och branch policies är accepterade.

## Fortfarande öppna hinder

- Ingen faktisk leverantörsanslutning, betald marknadsdata eller licensbekräftelse för NQ/MNQ/ES.
- Faktiska `ContractCalendar` och `SessionCalendar` saknas för production.
- GATE-01–04 saknar signerade maskinläsbara mönsterregler, och GATE-08 är fortsatt delvis öppen.
- Ingen verklig historisk backtest, ingen orderrouting, ingen autonom handel.
- Den utförda kontrollen är ett nytt test- och kodgranskningsvarv inom samma projekt, **inte en extern oberoende reviewers signoff**.
- `main` och användarens pågående Omnira-arbetskopior ska förbli orörda tills explicit mergebeslut.

**Slutsats:** C3C-branchens read-only-källa har ytterligare härdats med negativt regressionstest och immutabilitetsgaranti för accepterade candle-värden. PR avvaktar CI-kostnadsbeslut och separat review.
