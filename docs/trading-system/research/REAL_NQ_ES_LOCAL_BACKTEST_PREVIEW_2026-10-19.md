# Omnira Trading – första riktiga NQ/ES-historiken och separat Backtest-graf

**Datum:** 2026-10-19  
**Branch:** `feat/trading-real-history-backtest-20261019`  
**Status:** LOKAL WINDOWS-PREVIEW FUNGERAR – INTE MERGAD, INTE DEPLOYAD, INGEN LIVEHANDEL

## Användargodkänt scope och faktisk nedladdning

Användaren godkände hämtning av exakt 2026-10-15 (UTC) med Databento `GLBX.MDP3` `ohlcv-1m` för `NQZ6` och `ESZ6` inom tidigare offert om cirka **0.010076165 USD**. Kontot har enligt användaren **125 USD i startkrediter**.

Användaren matade lokalt in sin Databento-API-nyckel via ett dolt Windows PowerShell-fönster. Nyckeln sparades **inte** i koden, GitHub, Next, loggar eller chatten.

Det verifierade lokala manifestet redovisade:
- NQZ6 · kontrakts-ID `261401` · **1380 1m-candles** · råfil 324319 bytes.
- ESZ6 · kontrakts-ID `10252` · **1380 1m-candles** · råfil 317734 bytes.
- `REAL_HISTORICAL_BAR_FILES_READY_UNVERIFIED_SESSION`, `paidRequestsInitiated:2`.
- Prisomkontroll före köp: **0.0100761652 USD** total estimerad Databento-kostnad, enligt provider-metadata. **Slutlig faktisk kreditdebitering har inte kontrollerats mot Billing.**
- Original `*.raw.jsonl`, parservaliderad `*.bars.json` och manifest med SHA-256 på råfiler finns endast **privat på Windows**, under:
  `C:\Users\Andre\Projects\Omnira\PrivateMarketData\Databento-NQ-ES-2026-10-15-FIRST-IMPORT`

Databento tar betalt baserat på faktiska bytes, så metadataoffert är inte en fakturagaranti. Inget nytt data- eller liveanrop ska göras automatiskt när appen öppnas.

## Avsiktlig separation på tradingsidan

- **Trading / Live & Paper-workspace:** befintlig `/trading` behålls som den visuella Atlas Market View, men den är fortfarande en read-only syntetisk/development-vy. Ingen broker, paper- eller liveorder är aktiverad. Den får en separat länk till historisk backtest.
- **Backtest – riktig historik:** ny autentiserad (plattformslayout) `/trading/backtest-data`. Grafen använder endast lokal verifierad Databento-historik via serverläsning när `OMNIRA_HISTORICAL_DATA_DIR` pekar på privat mapp. Läget har NQ/ES-växling, 1m candles med volym, hög/låg/volym/gaps/rörelse för synlig replaydel, tidskontroll, hastighet och zoom. Statistik räknas **endast med candles före eller vid replay-cursorn**.
- **Backtest Lab – syntetisk design-demo:** `/trading/backtest-lab` finns kvar oförändrad, med tidigare godkänd UI-fixture inklusive hypotetiska TP/SL, tydligt skild från riktig historik.

Vi visar **inte** några falska iFVG/CISD-trades, win rates, profit factor, drawdown eller PnL som riktig statistik. Det krävs separat godkännande av GATE-01–04, sessionskalender, fulla entry/SL/TP/exitregler, replaytest, order-fill och kostnadsmodell samt out-of-sample.

## Datasäkerhet

- Inga privata prisfiler har committats, skickats till Supabase eller deployats på Vercel.
- Servermodulen `apps/web/lib/trading/historical/local-history.ts` läser endast explicit konfigurerad lokal katalog och fasta filnamn; den validerar manifest/status, förväntad symbol/ID, SHA256 på rå JSONL, barantal, kronologi, OHLC och tickstorlek.
- I produktion, där `OMNIRA_HISTORICAL_DATA_DIR` inte är satt, visar sidan endast en lugn `NOT_CONFIGURED`-placeholder och gör inga API-anrop.
- Lokal separat preview använder **endast lokalt** två gamla auth-bypass-filer kopierade från tidigare Backtest Lab-designpreview för att kunna testa utan produktionsinloggning. Dessa lokala bypassfiler är **INTE committade**, får aldrig pushas eller deployas. Den riktiga branchens plattformslayout och middleware har fortfarande autentisering.

## Tester och graf-QA på stationära

**Import:** 9/9 Node tester PASS för offert, exakt kontraktsidentitet, riktig JSONL, tickstorlek, icke-kontinuerliga barer, fail closed, stopp mot dubbelkreditering, att ingen automatisk retry av debiterbara API-anrop förekommer, samt checksumma och privat manifest.

**Graf-QA:** lokal Next.js 14 dev på loopback `http://127.0.0.1:3108/trading/backtest-data`. HTTP 200; SSR-dokumentet innehöll riktig NQ-data (inte `NOT_CONFIGURED` eller `FAILED_INTEGRITY`). Headless Chrome visade riktig candlestickgraf med volym. CDP kontrollerade React-interaktion:
- NQ-scrubber flyttades till index 649 och sidan visade **650/1380 candles**.
- Efter ES-knappval visade sidan **ESZ6 1/1380 candles** och ES-knappen `aria-pressed=true`.
- Både med NQ och ES står resultat i tradingstatistiken kvar som **Ej beräknat**.

**TypeScript:** helprojektets `tsc` rapporterar äldre, orelaterade fel i bl.a. UI-generation-QA; första körningen hittade två nya implicita `any` i canvas-funktioner. Dessa är korrigerade i commit `9afdca4df155332a522bc94f943b87bf98f495b8`. Fullt helprojektstest får inte rapporteras PASS utan att övriga baselinefel granskats.

## Körs lokalt utan extra datakostnad

- Kod-förhandsvisning: `C:\Users\Andre\Projects\Omnira\Previews\RealHistory-20261019`, **separat Git worktree**, inte användarens aktiva smutsiga repo.
- Server kan startas lokalt med miljövariabel `OMNIRA_HISTORICAL_DATA_DIR` till den privata data-mappen och Next dev på **127.0.0.1:3108**.
- Besök i browser på samma dator: `http://127.0.0.1:3108/trading/backtest-data`.
- Lokal port är inte publicerad externt. Ingen extra nedladdning sker vid läsning av sidan.

**Nästa steg:** granska godkänd lokal UI för Backtest vs Live/Paper, besluta saknade CISD/inversion-regler och knyt ren historisk kandidatobservation till verkliga data utan att ge order-/PnL-auktoritet. Fullständig backtest efter låst entry/exit, kalender och kostnadsmodell.
