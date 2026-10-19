# GATE-03 / GATE-04 – Equal highs/lows och SMT, offline kandidatrevision

**Datum:** 2026-10-19  
**Status:** RESEARCH ONLY; samtliga fyra pattern gates är fortsatt OPEN.  
**Repo:** `Bumbi190/ai-operating-platform`  
**Branch:** `codex/trading-phase3-gates-review-20261018`  
**Omfattning:** syntetiska, deterministiska experiment – **inte** en godkänd tradingstrategi eller en riktig marknadsdataintegration.

## 1. Genomförd kodning och test

Isolerade filer:
- `scripts/trading/research/equal-smt-candidates.mjs`
- `scripts/trading/research/equal-smt-candidates.test.mjs`

Resultat från en separat Node.js-körning på den anslutna Windows-datorn: **18 tester, 18 PASS, 0 FAIL**, utan npm-installation, API-anrop, produktionsserver, orderväg eller externa priser. Den tidigare GATE-01/02-researchsviten gav 16/16; tillsammans **34 enhetstester** på syntetiska exempel, ännu **inte** historiska backtests.

Researchfunktionerna exporterar endast:
- `compareEqualPivots(...)` → `EQUAL_RESEARCH`, `DIFFERENT_RESEARCH` eller `UNKNOWN`
- `inspectSmtPair(...)` → `DIVERGENCE_RESEARCH`, `NO_DIVERGENCE_OBSERVED_RESEARCH` eller `UNKNOWN`

Alla utfall märks `NON_CANONICAL_RESEARCH` och `tradePermitted: false`. Funktionerna finns **inte** i `apps/web/lib/trading`, skapar ingen `StrategySignal`, ingen setup-grade, ingen `TradeProposal` och ingen execution authority.

## 2. GATE-03: det testade och det som ännu är öppet

Omniras canonical strategi definierar en high-swing som en candle med **strikt högre high än både föregående och efterföljande candle** (low-spegeln motsvarande). En swing blir alltså känd först efter den efterföljande candlens färdigställande. Det är redan fastställt och forskningskoden reproducerar detta.

Två uttryckligen alternativa forskningsparametrar:
1. **Ticktolerans**, inmatad i heltal (`toleranceTicks`), aldrig hårdkodad som en handelspolicy. Syntetisk tickstorlek ges som en **sträng** i fixturen och måste passa samtliga syntetiska OHLC-priser.
2. **Gränsinklusion** (`inclusive: true/false`), där jämförelsen är `abs(levelA - levelB) <= toleranceTicks*tickSize` respektive strikt `<`. Jämförelsen sker via `BigInt` med 12 decimalers precision, inte JS-flyttal.

**Praktiskt konstruerat exempel:** På ett syntetiskt 5m-chart är två bekräftade swing-highs `101` och `101.25` och experimentets syntetiska tickstorlek `0.25`. Differensen är exakt **1 tick**. Med `toleranceTicks=1` och inklusiv gräns blir resultatet `EQUAL_RESEARCH`; med strikt gräns blir det `DIFFERENT_RESEARCH`. Ingen av reglerna är vald åt ägaren.

**Testade spärrar:** obekräftad framtida pivot, plateau/equal peak som bryter strikt swingdefinition, saknad/ogiltig tickmetadata, otillåtna floatpriser, fel kontrakt, 1m istället för 5m/15m, missad candle, dålig tid, ofullständiga bars och real source i ett synthetic-only-flöde → `UNKNOWN`.

**Återstående beslut:** ticktolerans och gränsinklusion, vilka pivots som ska paras, lookback/tidsavstånd, separata 5m/15m-zoner, livscykel/klustergrupper och om/var en berörd likviditetsnivå förfaller efter sweep. Ingen definition av dessa finns kanoniserad här.

## 3. GATE-04: det testade och det som ännu är öppet

Canon kräver **NQ och ES**, samma tillgängliga/användbara data, SMT som kompletterande bekräftelse och endast uppgradering **A → A+**. Den extra uppgraderingen ska bara bli aktuell när strategin själv redan funnit en giltig A-setup. Denna forskningskod utför **ingen** sådan uppgradering.

I researchprototypen matar testet själv in ett explicit referenspar (`pairId`, `confirmedAt`, levelpris, kontrakt och timeframe på båda marknaderna). Därmed **antas** correspondencen för att isolera tids- och sweepregler. Prototypen kan inte själv hitta vilka verkliga swingpunkter som hör ihop; just den frågan är fortfarande **öppen**.

Forskningsparametrar som testas:
- `maxReferenceDeltaMinutes = 0/1/2` – tydlig tidsgräns för ett redan inmatat referenspar, **inte** en bestämd production-policy.
- `crossing = WICK/CLOSE` – en high/liquidity-nivå kan betraktas som tagen när high gått strikt över, alternativt när close har gått strikt över (low-spegeln motsvarande).

**Praktiskt konstruerat exempel:** Båda instrumenten är på 1m med syntetiskt kompletta data. NQ har referenshigh `104` och ES referenshigh `52`. NQ får en wick till `105` men stänger på `103`; ES når högst `51.5`. `WICK`-varianten observerar då `NQ_ONLY` SMT, medan `CLOSE`-varianten ser `NO_DIVERGENCE_OBSERVED_RESEARCH`. Skillnaden är tekniskt verifierad, inte lönsamhetsvaliderad.

**Testade spärrar:** missande ES-data, ofullständig 1m-bar, `settled=false`, fel root (MNQ i stället för ES), olika timeframes, reference pair-ID/kontrakt som inte matchar, gammal/otillräcklig evalueringstid eller bruten synkronisering mellan NQ och ES → `UNKNOWN`; aldrig ett påhittat `FALSE` eller `TRUE`.

**Viktigt för tolkning:** `NO_DIVERGENCE_OBSERVED_RESEARCH` betyder **inte** bevisad frånvaro av SMT för all framtid. När observationens fönster växer kan båda marknaderna hinna ta nivån. Ett framtida canonical kontrakt måste specificera observationens livstid och slutpunkt samt om och när en observerad SMT upphör att gälla.

**Återstående beslut:** faktisk automatisk mapping mellan NQ- och ES-pivots, eventkorrespondens, vald timeframe-kombination, tidsfönster, wick/close, kalendersynk, osäkerhetsstatus, hur länge SMT är giltig för en A-setup, och eventuell uppgradering före entry – utan att AI:n får hitta på statistik.

## 4. Tekniska begränsningar som måste fortsätta gälla

1. Endast `source: SYNTHETIC`, `settled: true`, kompletta sammanhängande testcandles och syntetiskt `contractId` accepteras. Riktig börsdata har sessionsbrott/rollover som kräver Omniras officiella `ContractCalendar`, `SessionCalendar` och kontraktsskopade historikprotokoll.
2. Testerna täcker avsedda parametrar och negativa fall; de bevisar **inte** att `nqRef` / `esRef` verkligen är motsvarande marknadsswings eller att datakällan ger korrekt faktisk execution-kvalitet.
3. Versionslåst strategi + riskgränser är fortfarande oförändrade. Researchkoden är inte importbar som auktoritativ tradinglogik och ska aldrig integreras innan beslut, oberoende kodgranskning och promotion.
4. Synthetic-only-kalender är inte en korrekt ersättning för börssessionerna; använd inte testfallens minutsekvenser som bevis för riktig NQ/ES-handel.
5. **Ingen** backtest mot historisk CME-data, out-of-sample-utvärdering, paper trading, CI-helkörning, Supabase-write eller deployment är gjord i denna del.

## 5. Rekommenderad fortsatt sekvens

1. Granska fem centrala användarbeslut: tolerans i ticks, gränsinklusion, pivotparning/lookback, SMT-pivotkorrespondens, samt wick-vs-close/tidsfönster. Lås därefter även resterande expiry/eventregler.
2. Skapa fyra separata versionerade **candidate detection specs**, inte en enda okontrollerad stor strategiförändring.
3. Skriv human-verifierade golden fixtures från prisdata, både fall där pattern uppstår och där systemet ska avstå.
4. Använd samma rena godkända detection-logik i replay/backtest. Stäng GATE-01–04 först när canonical promotion skett.
5. Implementera riktig historisk kontraktsskopad data via den redan definierade Beslut N-porten; verifiera källa, licenser, kalender och reproducerbarhet innan prestandapåståenden.

**Slutsats:** Det går nu att visa tekniskt **varför** olika tolkningsval ger olika observationer. Ännu saknas underlag för att fastslå vilka val som ger en reproducerbar eller lönsam tradingstrategi. Jev och live-exekvering är parkerade.
