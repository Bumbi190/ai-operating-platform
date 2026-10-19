# Omnira Trading — C3C async request immutability audit

**Datum:** 2026-10-19  
**Status:** RED → GREEN verifierad; oberoende mänsklig kodgranskning återstår. Ingen PR, merge, datakälla eller livehandel.  
**Integrationsbranch:** `review/trading-c3c-pr-ready-20261019`

## Fynd — TOCTOU för historisk förfrågan

Det tidigare `readHistoricalContractChunk(source, request)` vidarebefordrade anroparens `request` **direkt** till den asynkrona källan och validerade sedan resultatet mot **samma referens** efter `await`:

```ts
const raw = await source.read(request)
return inspectHistoricalContractResult(request, raw)
```

TypeScripts `readonly` är inte en runtime-immutabilitetsgaranti. Om ett anroparägt objekt ändrade `request.from` efter anropets start, exempelvis under en väntande nätverksförfrågan, kunde efterkontrollen använda det *nya* intervallet. Det möjliggjorde godkänd `coverage` som **inte** täckte den ursprungligen begärda perioden. Det är en reell dataintegritets-/time-of-check-to-time-of-use-risk även innan någon API-adapter kopplats in.

### Negativa testbevis

Två nya testfall i `apps/web/lib/trading/market-data/historical-contract-source.node-check.mjs` kördes mot tidigare implementation på isolerad Windows-kopia:

- Källan skulle få en låst/validerad `HistoricalContractRequest`, inklusive `contract` och `cycle`: **FAIL** (källan fick den mutable originalreferensen).
- Anroparen ändrade `from` under ett väntande asynkront källanrop, och källan returnerade bara ett nytt suffix: **FAIL** (resultatet blev tidigare felaktigt `ACCEPTED`).

Utfallet var **29/31 PASS**, med båda nya testerna röda. Felet är reproducerat, inte bara hypotetiskt.

### Rättning

Nu validerar `readHistoricalContractChunk` först hela anroparens förfrågan med **befintliga** `buildHistoricalContractRequest`: konkret `ResolvedContract`, kanonisk `1m`, välformat icke-tomt halvöppet intervall. Den frysa/strukturellt kopierade `request` som byggaren returnerar används **både** som källans indata och som efterkontrollens ursprungliga referens.

```ts
const built = buildHistoricalContractRequest({
  contract: request?.contract,
  timeframe: request?.timeframe,
  from: request?.from,
  to: request?.to,
})
if (!built.ok) return violation('INVALID_REQUEST')
const original = built.request
const raw = await source.read(original)
return inspectHistoricalContractResult(original, raw)
```

Tekniskt fel från `source.read()` fortsätter att **rejecta Promise**; det omvandlas aldrig till en välformad, settled eller tom källrapport. Själva bygget och source-kontraktet är provider-neutralt, utan konto eller nätverk.

Två motsvarande Vitest-testfall har lagts till i `historical-contract-source.test.ts`. Ingenting i SessionCalendar, Risk Engine, orderväg eller canonical strategi har ändrats.

## Verifierad integration och versionsskydd

- Efter rättning, Windows Node 22.22.3 med riktig TypeScript-source och test-harness: **31/31 PASS**.
- Efter rättning, isolerad Mac-kopia från exakt uppdaterade branch-filer, med lästa lokala beroenden: `apps/web/lib/trading` **48 sviter, 1 476/1 476 PASS**.
- Separat avgränsad strikt TypeScript-kompilering (`tsc --noEmit`, ES2020, Bundler, Node-typer): **PASS**.
- `main` har inte ändrats. Ingen PR, CI, dependency-installation, Vercel-deployment eller billable data-/brokeranrop under granskningen.
- En framtida PR aktiverar ofilterade GitHub Actions, bland annat `trading-canon-integrity.yml`, `atlas-project-isolation.yml` och `migration-guard-integrity.yml`, och kan därmed ge CI-kostnader. Ingen draft PR skapad automatiskt.

## Fortsatt begränsning

En immutable in-memory request och candle är **inte** ett bevis på faktisk dataäkthet, historisk raw snapshot, versionerad CME-license, riktig kontraktskalender, giltig sessiontabell eller backtest-paritet. Den här branchen måste oberoende kodgranskas inför merge. GATE-01–04 och den operativa delen av GATE-08 är fortsatt öppna, och inga live-tradingautoriseringar skapas.

**Nästa milstolpe:** separat granskare/verifierat PR-beslut med CI-budget, därefter rättighets- och kostnadsgranskning av verklig historisk 1m-data innan någon provideradapter får utföra ett debiterbart anrop.
