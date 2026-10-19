# Omnira Backtest Lab – godkänd syntetisk demo integrerad på testbranch

**Datum:** 2026-10-19  
**Branch:** `feat/trading-backtest-lab-fixture-20261019`  
**Status:** FRISTÅENDE TESTVY KODAD OCH ISOLERAT TESTAD – EJ MERGAD, EJ PUBLICERAD  
**Baserad på:** `research/trading-first-fixture-backtest-20261019` från `main`.  
**User approval:** Den mobila demodesignen som användaren provade och uttryckligen gillade behålls i princip oförändrad.

## Vad som levereras

1. `apps/web/lib/backtest-lab/approved-fixture-demo.ts` innehåller **samma godkända HTML/CSS/JavaScript-demofil** som tidigare testats i webbläsare. Sparas server-side, **inte** som en öppen fil i `public/`. Det är påhittad market data och författade trade-exempel.
2. `apps/web/app/(platform)/trading/backtest-lab/page.tsx` är en Next.js App Router-sida på `/trading/backtest-lab`. Den ärver befintlig autentisering i `(platform)/layout.tsx`, inklusive redirect till `/login` för oinloggade. Den visar den godkända demon i en iframe via `srcDoc`, med endast `sandbox="allow-scripts"` (ingen same-origin, forms, popups eller top navigation); `referrerPolicy="no-referrer"`.
3. `apps/web/app/(platform)/trading/page.tsx` får en tydligt märkt länk till Backtest Lab. Befintlig `AtlasMarketView` och dess replaymotor, risk- och beslutsytor ändras **inte**.
4. `apps/web/lib/qa/trading-backtest-lab-fixture.test.ts`: 7 regressionskontroller för auth-route, isolering, testmiljömärkning, schemat och avsaknad av riktiga resultat.
5. `scripts/trading/research/first-fixture-backtest-ui-parity.test.mjs`: 4 tester som jämför den inbäddade HTML:ens alla 45 bars och författade trades med den deterministiska Node-fixturemotorn, samt kontroll av resultat och varningsmärkning.

## Verifierade tester (inga påståenden om marknadsprestation)

- Windows Node v22.22: **16/16 PASS** (12 från fixturmotorn + 4 UI/data-paritet). Inga beroendeinstallationer eller API-anrop.
- Mac, isolerad kopia, Vitest 2.1.9: **7/7 PASS** i nya QA-sviten.
- Mac, avgränsad `tsc --noEmit --strict` av nya routes, HTML-resurs, QA-test och beroendeimports: **PASS**.
- Chromium (headless) med fristående HTML inuti **samma sandboxed iframe-läge** som i route: två viewports, **420px och 1440px**. Från `1 / 45` gick nästa-candle till `2 / 45` och tidsreglaget till `45 / 45`; slutvärden var 2 avgjorda, 50 % i påhittade exempel, +0,50R och max drawdown 1,00R. **0 JavaScript-fel**. Testet använde en lokal simulering av route-embedding; **hela Next.js appen har ännu inte startats eller byggts som en komplett produktionsbuild**.
- Fixture-policy: `SYNTHETIC_DEMONSTRATION_ONLY`, `marketData=SYNTHETIC`, `tradeExecutionPermitted=false`, `usesCanonicalLiquidityManipulation=false`, `financialNetUSD=null`. Tredje affären har `AMBIGUOUS_INTRABAR` och resultat `null`.
- Tester fastställer att demot inte innehåller extern script-src, `fetch`, `WebSocket` eller `XMLHttpRequest`, och det står tydligt att riktig backtest, data och regler saknas.

## Vad som fortfarande saknas

- Ingen PR, merge, GitHub Actions CI-körning, Vercel preview eller produktionsdeploy har startats, eftersom användaren vill undvika nya kostnader under utvecklingen.
- `/trading/backtest-lab` **finns ännu endast på feature-branchen**. Den är inte åtkomlig på den publicerade Omnira-domänen innan en framtida granskad merge/deployment.
- Inga autentiska futurespriser, fullständiga `ContractCalendar` eller `SessionCalendar`, ingen godkänd historical-data-licens och inga färdiga iFVG/CISD/equal-high-low/SMT-regler.
- Den illustrativa 50 %-siffran är ingen observation av historisk lönsamhet; de tre tradeutfallen skrevs in för att demonstrera UI-kontroller, och tredje utfallet är osäkert.
- Inbäddningen via `srcDoc` medger endast javascript i ett isolerat iframe-dokument. Om en framtida produktion inför strikt CSP som blockerar srcDoc-inline scripts måste den sidan testas och eventuellt få en separat scriptstrategi – aldrig genom att ge iframen `allow-same-origin`.

## Rekommenderat fortsättningsarbete

1. Oberoende slutgranska route-, sandbox- och auth-beteende mot verklig Omnira runtime, samt testa i Next dev/preview innan integration.
2. När CI-budget är okej: eventuell draft PR och merge med mänsklig gate, utan att röra befintliga handelsmoduler.
3. När Backtest Lab-vyn är godkänd: bygg en **separat real-data-källa bakom C3C**, komplettera verkliga versionsstyrda kalendrar och historikproveniens samt få de fyra kanoniska mönstergates godkända.
4. Först då kan ett faktiskt, statistiskt och kostnadskorrigerat NQ/ES-backtest beräknas i samma användargränssnitt.

**Inget försök att få fixtur-demo att framstå som riktig handel eller vinstdata är tillåtet.**
