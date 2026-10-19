# Omnira Trading – första observationsstatistiken för iFVG B-only

**Datum:** 2026-10-19  
**Status:** OFFLINE SYNTHETIC RESEARCH / INGEN VERKLIG HISTORISK BACKTEST  
**Branch:** `research/trading-ifvg-b-observation-stats-20261019`, bas `research/trading-ifvg-b-only-evaluation-20261019`.

## Syfte

Ägaren bad oss fortsätta **samla statistik innan finjustering**. Detta steg bygger därför ett deterministiskt, reproducerbart observations- och rapporteringsflöde för den tidigare prövade **B-only forskningsprofilen**, utan att påstå att syntetiska QA-scenarier representerar marknadsdagar eller strategi-edge.

**Profil B:** ursprungs-FVG:s tredje candle är färdigbildad efter manipulationens explicit givna `manipulationCompleteAt`; en inverterad FVG måste därefter bekräftas genom en *färdig 1m candle-close strikt förbi bortre gränsen*. Detta är inte en slutligt godkänd detektor, eftersom frågan om **alla tre ursprungliga FVG-candles** måste infalla efter manipulationen och övriga regler fortfarande är öppna.

**Kontroll:** `formation:'ANY'`, dvs ursprungligt gap kan vara bildat före manipulationen; samma close-krav som B.

## Resultat – 12 avsiktligt konstruerade QA-scenarier

| Observation | B-only | A+B |
|---|---:|---:|
| Antal författade scenarier | 12 | 12 |
| Giltiga syntetiska scenarier | 9 | 9 |
| Ogiltig/osäker data (stoppas) | 3 | 3 |
| Forskningskandidater totalt | **3** | **5** |
| LONG-kandidater | 2 | 3 |
| SHORT-kandidater | 1 | 2 |
| Candles med flera samtidiga möjliga gap, ingen automatisk kandidat | 1 | 1 |
| Scenarier där åtminstone en kandidat observerats | 3 | 5 |
| Genomsnittlig syntetisk lag till bekräftelse efter manuell manipulation | 2,667 min | 2,000 min |

B-only tog bort två forskningskandidater i två manuellt konstruerade fall med äldre FVG. Det filtrerade inte bort nybildade LONG/SHORT-exempel. I ett specialfall där FVG:s tre candles sträcker sig över manipulationen godtar nuvarande B-profil zonen, eftersom endast **den tredje candlens stängning** krävs efter cutoff. Detta är en öppet dokumenterad semantisk begränsning.

**Tolkning är strikt begränsad:** talen ovan anger vad de handskrivna *enhetstestfallen* innehåller. De får **inte** uttryckas som faktiska signaler per session, marknadsfrekvenser, hit rates, strategiresultat eller statistiska estimat. De 12 exemplen är inte oberoende observationer från CME och har avsiktligt konstruerats för att testa olika undantag. Genomsnittstiderna är testvärden, inte verkliga väntetider.

Vi har avsiktligt **inga** värden för:
- win rate eller affärsantal på historisk börsdata;
- expectancy i R, profit factor, max drawdown eller faktisk PnL;
- provision/slippage, realistisk fill-prioritet eller out-of-sample.

Samtliga dessa mätfält är `null` eller explicit `false` i JSON eftersom riktig data och en godkänd fullständig trading- och exitmotor ännu saknas.

## Nya filer och kört testunderlag

- `scripts/trading/research/ifvg-observation-statistics.mjs` – räknar kandidatobservationer, riktning, indeterminate, ambiguous och bekräftelsefördröjning på **12 explicit syntetiska fall**, med exakt samma `inspectIfvg` i båda profilerna.
- `scripts/trading/research/ifvg-observation-statistics.test.mjs` – 12 nya regressionskontroller.
- `scripts/trading/research/ifvg-observation-report.mjs` – offline-rapport i **HTML, JSON och CSV**; den innehåller inga exekveringsknappar, fjärrscripts, nätverksanrop eller autentisering.
- `scripts/trading/research/ifvg-observation-report.test.mjs` – ytterligare 7 tester som hindrar rapporten från att felaktigt presentera finansiell strategi-prestanda.

**De 19 nya statistikkontrollerna passerade på användarens stationära Windows-dator, Node 22.22.3.** En riktad GUI-kontroll av den genererade HTML-rapporten gjordes även i headless Chrome. Inga API-anrop till Databento, börsen, brokers eller externa AI-modeller har körts.

**Rapporter skapade lokalt på stationära:**

```text
C:\Users\Andre\Projects\Omnira\Previews\TradingStats-20261019\
  iFVG_B_Statistik_Syntetisk.html
  iFVG_B_Statistik_Syntetisk.json
  iFVG_B_Statistik_Syntetisk.csv
```

HTML-rapporten har även öppnats i Chrome. Denna lokala mapp är inte en GitHub-branch eller publikt hostingutrymme.

## Nästa steg mot faktiskt användbar strategi-statistik

1. Fastställ vilka historiska data användaren lagligen får analysera, kostnadsuppskattning och exakta kontrakt. Inget dataköp utan pris/licensbeslut.
2. Bygg en rådatasnapshot med checksumma och entydig källa/kontrakt/sessionskalender som matar read-only C3C. Researchkod får inte förväxla reala session-gap med de här syntetiska sammanhängande fixturerna.
3. Granska och godkänn resterande GATE-01 (formation, mitigation, multiple FVG, expiry) och GATE-02 CISD, risk/entry/SL/TP/exit, plus GATE-03/04 innan vi rapporterar verkliga win rates.
4. Använd samma godkända regler i replay och riktig historisk out-of-sample-backtest, med kostnader och explicit osäkra intrabarutfall.

**Status:** Alla fyra pattern gates OPEN, ingen godkänd detection-version, ingen licensierad riktig data importerad, ingen strategi-edge verifierad, och all orderexekvering fortfarande avstängd. Ingen PR, merge eller deployment.
