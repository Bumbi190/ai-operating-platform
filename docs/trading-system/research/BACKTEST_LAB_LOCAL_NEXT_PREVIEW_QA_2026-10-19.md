# Omnira Backtest Lab – Local Next.js Preview QA

**Datum:** 2026-10-19  
**Branch:** `feat/trading-backtest-lab-fixture-20261019`  
**Status:** **Lokal Next.js-rutt verifierad**, men **inte inloggnings- eller produktionsverifierad**.  
**Miljö:** MacBook Air, macOS, Node 22.22.3, Next.js 14.2.29, Google Chrome 155, isolerad klon av exakt feature-branch.

## Vad som faktiskt testats

Vi skapade en separat, ren lokal klon från den befintliga Omnira-repon och hämtade feature-branchen. Den pågående arbetskopian under `~/Projects/Omnira/Code/ai-operating-platform` ändrades **inte**. Installerade `node_modules` återanvändes via symlänkar; inget `npm ci`, ingen betald API-förfrågan, ingen Vercel-deployment och ingen GitHub Actions-körning.

Next.js 14.2.29 startades endast på Macens loopbackgränssnitt:

```text
http://127.0.0.1:3107/trading
http://127.0.0.1:3107/trading/backtest-lab
```

Båda sidorna returnerade **HTTP 200**; den första innehöll länken till labbet, den andra en sandboxad `iframe` med `sandbox="allow-scripts"`, godkända demot, svenska varningsetiketter och status.

### Viktig begränsning för lokal förhandsvisning

Den riktiga plattformens `(platform)/layout.tsx` och `middleware.ts` gör Supabase-baserad inloggning/autentisering. Eftersom denna klon med avsikt saknar kontouppgifter gav **första körningen HTTP 500** från Supabase-middleware på saknad URL/nyckel.

För visuell lokal QA ersattes **enbart i den temporära klonen** dessa två filer med en explicit markerad preview-only layout/middleware. De körs endast lokalt på `127.0.0.1`, utan Supabase, användarsession eller handels-API. **Detta är inte ett bevis på att riktig login/authorization fungerar. Dessa preview-bypassfiler får ALDRIG pushas eller deployas.** GitHub-feature-branchen och `main` innehåller fortfarande den riktiga auth-kedjan oförändrad.

### Mobil- och interaktionstest i Chrome DevTools

Med Chrome CDP och faktisk sandboxad `about:srcdoc`-iframe, mobil emulering `420×950`, mättes:

```text
iframe innerWidth:              394 CSS px
documentElement.scrollWidth:    394 CSS px
body.scrollWidth:               394 CSS px
layout grid:                    370px, en enda kolumn
```

Ingen horisontell överströmning i **äkta mobil emulering**. En tidigare screenshot med desktop Chrome `--window-size=420` såg horisontellt klippt ut, men hade **inte** mobil emulering aktiverad och var därför ingen tillförlitlig mobiltest. Den riktiga mobil-CDP-kontrollen klarade testet utan CSS-/designändring.

**Interaktioner gjorda mot den körande Next.js-rutten i Chrome:**

- `next` ändrade progress från `1 / 45` till `2 / 45`.
- `play` och `pause` kördes: progress avancerade till `3 / 45`.
- `seek` till slutet gav `45 / 45`, `winrate: 50%` och `sumR: +0.50 R`.
- Efter återställning av Chrome desktop viewport till `1440×900` visades tvåkolumnslayout och samma författade testresultat.

Detta verifierar återuppspelning, progressiva demodata och layout i en äkta Next-route under simulerad mobil- och desktopviewport. Alla tre signaler är **författade**, inga strategidetekterade eller verkligt handlade utfall. Ingen order-/brokerport, nätverksdatakälla eller statistisk strategi-edge är ansluten.

## Säkerhets- och integrationsstatus

- Sidan ligger i den verkliga Next.js App Router-gruppen `app/(platform)/trading/backtest-lab/page.tsx`, på en **isolerad** feature-branch.
- Normal `(platform)`-auth-layout och middleware är fortfarande oförändrade i GitHub. Den validerades bara via tidigare **statisk** auth-/sandbox-test, inte genom inloggning under detta lokala QA-pass.
- `sandbox="allow-scripts"` gör det inbäddade `srcDoc` till separat opaque origin; ingen `allow-same-origin`, popup, navigation eller forms.
- Inga `APPROVED_FIXTURE_DEMO_HTML`-filer skrivs i publik `public/`-katalog.
- Integrationstester på branchens code sedan tidigare: **7/7** auth/sandbox/fixed demo tester; **16/16** Node-fixture/parity. Tester bekräftar att det godkända HTML:ets candles, authored trades och R-tal matchar den deterministiska researchmotorn.
- Extra Next.js-localhost-länk kan endast nås på Macen medan den temporära lokala dev-servern körs; är **inte** en publik preview-URL.

## Kvar innan PR/merge

1. Ingen riktig auth-inloggningskontroll i Next preview och ingen Next production build med riktiga produktionskonfigurationer.
2. Ingen kontroll av live CSP som eventuellt kan blockera inline-skript i `srcDoc`.
3. Ingen extern reviewer-signoff eller beslut om de ofilterade GitHub Actions-workflows som kör på PR.
4. Inga reala NQ/MNQ/ES data, licenser eller canonical iFVG/CISD/equal-high-low/SMT-regler.
5. Ingen faktiskt historisk backtest; `+0.50 R` och `50%` är endast **illustrativa fixture-mätvärden**.

**Rekommendation:** använd nu den lokala URL:en på Macen för UX-godkännande; fortsätt sedan med separat auth/production-CSP-granskning och uttryckligt godkänd CI-budget innan PR och merge. Inga deployment- eller dataköp görs här.
