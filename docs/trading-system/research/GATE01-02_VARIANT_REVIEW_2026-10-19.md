# GATE-01 och GATE-02 – empirisk kandidatrevision, INTE canonical

**Datum:** 2026-10-19
**Status:** RESEARCH, GODKÄNDA SYNTETISKA ENHETSTESTER, INGEN STRATEGIPROMOTION
**Branch:** `codex/trading-phase3-gates-review-20261018`
**Tillhör:** `FAS3_GATE01-04_OCH_HISTORIK_READINESS_2026-10-18.md`
**Ändrar inte:** Strategy Specification Canonical v1.0, Risk Engine, exekveringsgrindar, produktionskod eller aktiv strategi.

## Resultat som faktiskt har uppmätts

En separat Node.js-körning på den anslutna Windows-datorn (i en tempmapp, utan att ändra det pågående Omnira-arbetsträdet) körde:

```
node --test pattern-candidates.test.mjs pattern-candidates-mirror.test.mjs
# tests 16
# pass  16
# fail   0
```

Detta är **16/16 syntetiska tester**, inte 16 historiskt vinnande trades och inte ett backtest. Inga verkliga priser, exchange-kalendrar eller API-kostnader ingår. PR/CI/TypeScript/produktionsdeployment har inte körts och får inte framstå som godkända.

## Utredningsfynd 1 – vad betyder iFVG?

Här finns en grundläggande terminologisk risk: i vissa traderguider står **iFVG** för *inversion fair value gap*, i andra för *implied fair value gap*. De bygger på olika mönster. Detta måste beslutas innan ett detektionskontrakt kan låsas.

För **inversion** har research-harnessen två alternativa bekräftelser. Den basala FVG:n definieras som gapet mellan candle 1 och candle 3 från **tre stängda** 1m-bars:

- Bearish base FVG: `low[1] > high[3]`, zon `[high[3], low[1]]`; en bullish invertering kan föreslås.
- Bullish base FVG: `high[1] < low[3]`, zon `[high[1], low[3]]`; en bearish invertering kan föreslås.

Två alternativa utlösare undersöks:

| Variant | Bullish invertering | Bearish invertering | Researchbedömning |
|---|---|---|---|
| `CLOSE_BEYOND_FAR_EDGE` | Senare stängd candle **close > zonens övre kant** | Senare stängd candle **close < zonens nedre kant** | Mer reproducerbar kandidat för close-entry; inte godkänd |
| `WICK_BEYOND_FAR_EDGE` | Senare candles high > övre kant | Senare candles low < nedre kant | Konsekvenskänslig; kan markera tidigare än faktisk close-genombrott |

**Konstruerat fall IFVG-02:** ett bearish gap är `[100,104]`. Candle kl 14:04 UTC har `high 105, close 103`: wick-varianten markerar kandidat; close-varianten gör det inte. Nästa candle kl 14:05 har `close 105` och close-varianten markerar först då. Det är alltså möjligt att samma historik ger olika bekräftelsetider.

**Ytterligare olöst val:** om den ursprungliga FVG:n får ha skapats innan manipulationen avslutades (`formation:ANY`) eller måste uppstå efteråt (`formation:AFTER_MANIPULATION`). Testerna visar att även detta ändrar antalet kandidater.

**Rekommenderad forskningsinriktning, inte canonical-beslut:** definiera först *inversion* explicit som ordets betydelse, använd candle-**close** bortom zonens bortre kant, och behåll en separat jämförelse med wick-modellen för att mäta skillnaden. Inga exit-, volume-, size- eller displacementfilter bör införas utan ett eget explicit beslut.

## Utredningsfynd 2 – CISD-referensen

CISD definieras ofta som ett candle-close-genombrott tillbaka genom opening-priset för en motriktad leveransrörelse. Men traderresurser och indikatorer är inte konsekventa om **vilken** candle/open och **vilket extrem** som bestämmer referensen.

Harnessen jämför därför, enbart som isolerad forskning:

| Variant | Long efter bearish run | Short efter bullish run | Status |
|---|---|---|---|
| `FIRST_RUN_OPEN` | close > öppningen i **första** bear-candlen i senaste run | close < öppningen i **första** bull-candlen | Inte godkänd |
| `LAST_RUN_OPEN` | close > öppningen i **sista** bear-candlen | close < öppningen i **sista** bull-candlen | Inte godkänd |

**Konstruerat fall CISD-01:** två bearish candles öppnar på `104` och `102`. Nästa uppgång stänger på `103`: `LAST_RUN_OPEN` ger kandidat vid den candlens close, medan `FIRST_RUN_OPEN` väntar tills senare close `105`. Testerna verifierar symmetriskt resultat på short-sidan.

**Väsentlig begränsning:** senaste run i forskningskoden är inte bevisat vara *leveransrörelsen som skapade manipulationens yttersta swing*. Run-koppling, giltig extrempunkt, ålder, flera kandidater, doji, eventuell displacement och tidpunkt efter manipulation är ännu **inte** canonical. Harnessen blockerar därför doji istället för att gissa.

**Rekommenderad forskningsinriktning:** prioritera analys av den första motriktade run-candlens OPEN eftersom det är en tydligt testbar nivå i flera utbildningskällor; definiera sedan exakt hur en run väljs och bind dess identitet till manipulationens swing. Lås inte reglerna enbart för att ett källmaterial anger dem.

## Obligatoriska beslut före GATE-01/02 kan stängas

1. **Namnbeslut:** iFVG = inversion FVG eller implied FVG, eller två separata namn/regler? Inga två olika definitioner bakom samma signaltyp.
2. **iFVG:** FVG-formation, close-vs-wick, strict-vs-inclusive jämförelse, base-gap före/efter manipulation, invalidering, maxålder, samtidigt aktiva zoner och entydigt tie-break.
3. **CISD:** referensrun som faktiskt skapar aktuell extrem, första/sista öppning, doji, close-vs-wick, maxålder, eventdeduplicering, simultana runs.
4. **Golden data:** verkliga, tidsstämplade NQ/MNQ-exempel som användaren själv tycker uppfyller eller INTE uppfyller regeln. Manuella TradingView-bilder kan hjälpa till att förstå avsikten, men foton får inte ersätta versionerad prisdata och komplett candle-sekvens.
5. **Governance:** skapa separata machine-readable detection-versioner, testresultat och granskad promotion i canonical register. Bygg först därefter gemensam implementation för backtest/replay/forward.

## Källor för terminologisk jämförelse, inte lönsamhetsbevis

- [IFVG som inverterad FVG (ICT Trading Concepts)](https://ictradingconcepts.com/ict/ifvg/)
- [Skillnaden mellan implied och inversion FVG (ICT Traders)](https://icttraders.net/ict-implied-fvg-ifvg-hidden-fair-value-gap/)
- [CISD och motriktad candleseries första openingpris (LiquidityScan, 2026-06-12)](https://liquidityscan.io/blog/what-is-cisd-change-in-state-of-delivery-ict)
- [Alternativ CISD-beskrivning med sweep candle/marknadsstruktur (GrandAlgo, 2026-04-16)](https://grandalgo.com/blog/what-is-change-in-state-of-delivery)

**Källa till vad Omnira får exekvera är alltid det godkända `SOURCE_OF_TRUTH.md` / canonical-strategin, aldrig dessa externa sidor.**

## Nästa tekniska leverans

När GATE-01/02:s detaljer godkänts: skriv en *versionerad* separat detection-specifikation med tydliga `INPUT`, `STATE`, `OUTPUT` och `REASON_CODE`, gör golden fall för både giltig och ogiltig setup, och kör samma implementation i ett framtida isolerat backtest- och replay-test. Parallellt kan GATE-03/04 utredas, utan att blockera rent read-only marknadsdataarbete.

**Låsningar:** fortfarande `GATE-01 OPEN`, `GATE-02 OPEN`, `GATE-03 OPEN`, `GATE-04 OPEN`. Jev skjuts upp. All execution kvar blockerad.
