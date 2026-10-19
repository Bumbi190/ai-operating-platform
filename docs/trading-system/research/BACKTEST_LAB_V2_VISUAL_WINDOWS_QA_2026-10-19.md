# Omnira Backtest Lab v2 – Visuell entry/exit och trade-story

**Datum:** 2026-10-19  
**Status:** LOKAL WINDOWS-PREVIEW VERIFIERAD · SYNTHETIC ONLY · EJ PR/MERGE/PRODUKTION  
**Feature-branch:** `feat/trading-backtest-lab-v2-visual-20261019`  
**Förälder:** `feat/trading-backtest-lab-fixture-20261019`  
**Miljö:** separat Windows-testkopia vid `C:\Users\Andre\Projects\Omnira\Previews\BacktestLab-20261019`, Next.js dev `http://127.0.0.1:3107/trading/backtest-lab`.

## Genomförd förändring

Uppdaterade endast den redan godkända, helt fristående HTML-fixturen inuti `apps/web/lib/backtest-lab/approved-fixture-demo.ts`:

- **Grafen:** `LONG IN`-triangel, `TP HIT +1.5R`, `SL HIT -1R`, `OSÄKERT ?` med färgkodade exit-cirklar. En grön transparent target-zon, en röd stop-zon och en turkos entry-nivå med tydliga konturlinjer ritas för **redan öppnade** hypotetiska trades. Prisaxeln inkluderar risknivåerna **först efter entry**, inte innan.
- **Ny "Vad händer just nu?"-panel:** signal → entry → exit med aktivt steg, prisfält för entry/stop/target, tydlig vinstrad/förlustrad/osäkert utfall samt diskreta animationer (respekterar `prefers-reduced-motion`).
- **Ingen framtidsläcka i UI:** först när den författade `entryIndex` nås visas entry/stop/target i statuspanelen och tabellen; exit och resultat visas först när `exitIndex` nåtts.
- **Fortfarande en syntetisk fixture:** 45 författade 1m-bars, 3 författade testsignaler och samma utfall (+1.5R / -1R / intrabar ambiguous). Inga iFVG/CISD/SMT-regler, inga verkliga NQ/ES-priser, inga fees/slippage, ingen orderexekvering, inget API.

Fortsatt oförändrat: Next-rutten `/trading/backtest-lab`, autentiseringsflödet i repo, iframe-sandbox `allow-scripts` och den vanliga `AtlasMarketView`. Ingen `main`-kod har modifierats.

## Körda tester i Windows

- **Normal Vitest 2.1.9**, två testsviter `lib/qa/trading-backtest-lab-fixture.test.ts` + nya `lib/qa/trading-backtest-lab-v2-visual.test.ts`: **15/15 PASS** med den **verkliga, orörda autentiseringslayouten** i separat QA-kopia. Den direkt körande localhost-designkopia använder avsiktligt en annan preview-only authshim, så authtesterna körs isolerat – **inte** mot denna shim.
- **Node fixture och parity:** `first-fixture-backtest.test.mjs` + `first-fixture-backtest-ui-parity.test.mjs`: **16/16 PASS**; HTML:ets candles, entry/exit och R-tal matchar exakt den fristående deterministiska forskningsmotorn.
- **Strikt TypeScript `tsc --noEmit`**, scoped till HTML-fixturemodulen och båda QA-testerna: **PASS**.
- **Windows localhost Next.js v14.2.29**: `/trading/backtest-lab` ger HTTP **200**, innehåller `tradeLive`, `TP HIT` och de nya grafzonerna. Servern lyssnar bara på `127.0.0.1:3107`.
- **Riktig Chromium 155 headless-CDP mot den körande Next.js-rutten** testade 11 replaypositioner `0,8,9,10,20,21,22,32,33,34,44`. Väntande signal saknar framtida entrypris, entry visar `LONG IN`, respektive exit visar `TP HIT`, `SL HIT` eller `OSÄKERT UTFALL`. Exakt författat illustrativt slutresultat är **45/45**, **50%** för de två entydiga testutfallen, **+0.50 R**; tredje osäkra resultatet ger inget bokfört R. Play från slutet startar om till början och avancerar.
- **CDP mobilviewport 420×950** vid candle 35/45: iframe `innerWidth=394`, `documentElement.scrollWidth=379`, `body.scrollWidth=379` och singelkolumn; ingen horisontell överströmning. Alla tre statussteg och `OSÄKERT UTFALL` visas. En separat headless screenshot bekräftade desktop-layout, markörer, target/stop-boxar och statuspanel.

## Viktig säkerhetsgräns i användarens lokala förhandsvisning

På Windows ligger en **separat, utcheckad testkopia** bredvid den vanliga repoarbetskopian. För att visa den utan riktiga Supabase-nycklar har **endast testkopian** ersatt `apps/web/middleware.ts` och `apps/web/app/(platform)/layout.tsx` med lokal `127.0.0.1` preview-only authshim. Dessa ändringar får **aldrig** pushas eller deployas. GitHub-branchen innehåller Omniras riktiga authkedja oförändrad.

**Ingen verklig login-test** har körts under v2. Auth/regressionsviten visar att route-filerna ärver befintlig struktur; inte en faktisk inloggningssession. Den befintliga Next.js-versionen är den installerade `14.2.29`; den uppdateras inte oavsiktligt inom detta rent visuella arbete.

**Ingen PR, merge, Vercel-preview eller GitHub Actions-körning startades.** Ingen betald börsdata laddades ned. Hela projektets övriga tradingstrategigates förblir OPEN.

## Vad användaren testar nu

Öppna Chrome på **stationära**: `http://127.0.0.1:3107/trading/backtest-lab`. Tryck F5 om den gamla vyn ligger kvar. Testa Play, spola till bar **10–11** för LONG/TP, **22–23** för LONG/SL och **34–35** för den tvetydiga affären. Bekräfta att entry/exit och trade-zonerna känns begripliga.

Nästa steg efter UX-godkännande: oberoende review och beslutad CI-budget före PR. Sedan verkliga historiska NQ/ES-kontrakt, licens, kalender, giltiga pattern-regler och en separat korrekt backtest-motor. **De illustrativa +0.50R är inte strategiresultat eller prognos.**
