# Omnira Trading – Fas 3: beslutsunderlag för GATE-01–04 och historisk data

**Status:** RESEARCH / EJ CANONICAL / INTE GODKÄND FÖR STRATEGISIGNALER
**Datum:** 2026-10-18
**Repo-bas:** `main` @ `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`
**Syfte:** förbereda verklig, reproducerbar testning av Liquidity Manipulation v1.0 utan att fatta tradingbeslut å ägarens vägnar.

> Detta dokument låser **inga** tradingregler, stänger **inga** gates och ger **ingen** exekveringsauktoritet. Beslut måste först fattas av människa, granskas oberoende, få egen versionsidentitet och registreras via Canonical Amendments. Jev/extra beslutsmodell är uttryckligen utanför denna leverans.

## 0. Verifierad utgångspunkt

- `docs/trading-system/README.md` och `SOURCE_OF_TRUTH.md` kräver att mönsterreglerna är deterministiska i backtest, replay och live. Strategy Engine får inte implementeras innan GATE-01–04 är lösta.
- `specifications/strategy/…Canonical v1.0.md` har redan låst handelsfönster, 4H-hypotes, 5–15m liquidity/FVG, 1m confirmation, grade A+/A/B/C, minimum R:R och riskbegränsningar. Dessa får inte justeras i detta arbete.
- `apps/web/app/(platform)/trading/page.tsx` är utveckling/read-only och `AtlasMarketView` läser genererade fixtures. Detta är **inte** riktig CME-marknadsdata.
- `lib/trading/market-data`, `contract-calendar`, `session-calendar`, `candle-aggregation`, `provider-*` och `replay` ger bra mekanisk grund. De bevisar inte att historisk datakälla, operativa kalendrar eller strategi är klara.
- `specifications/market-data/…Contract-Scoped Historical Candle Source Result – Canonical v1.0.md` låser historikporten: konkret `ResolvedContract`, endast 1m på strategigränsen, halvöppet intervall, prefix-täckning, `SETTLED|UNKNOWN`, inga chart-`hasMoreBefore`-antaganden. C3C-runtime behöver implementeras och bevisas separat.

## 1. Besluten som MÅSTE fattas före Fas 3

Varje rad är fortfarande OPEN. Alternativen nedan är forskningshypoteser, **inte** föreskrivna canonical regler.

### GATE-01 – iFVG på 1m

**Redan låst:** minst en giltig 1m iFVG eller CISD efter manipulation; confirmation-candle CLOSE som entrytrigger; strategin får inte läsa framtida candles.

**Kräver explicit beslutad definition:**
1. Hur en ursprunglig 1m FVG skapas (tre-candle wick/body-gränser, strikt jämförelse vid lika nivå, hantering av delvis stängd bar).
2. Vilken riktning på den ursprungliga FVG:n som kan inverteras för long respektive short.
3. Exakt inversionshändelse: wick-penetration, close över närliggande zonkant eller close genom bortre zonkant? Alla tre ger olika träffar.
4. Får FVG skapas före manipulation och behållas? Vilken tidsmässig ordning mellan creation, manipulation och inversion krävs?
5. Hur länge en FVG är aktiv; när den invalidieras; hur flera samtidiga FVG:er väljs utan att välja den bästa i efterhand.
6. Om minsta gapstorlek, displacement, body-krav eller volymkrav existerar; annars uttryckligen **inga** sådana filter.
7. Bekräftelsetidpunkt och prisets exakta jämförelse (strict `>`, `<` eller inklusive gräns).

**Forskningskandidat att granska:** tre **stängda** 1m-candles skapar standard-FVG med wick-gränser; inverse-confirmation sker först på en **senare stängd** 1m-candle genom motsatt zonkant. Detta är inte en bestämd regel förrän ovanstående val är låsta och signerade.

### GATE-02 – CISD på 1m

**Redan låst:** CISD räcker ensamt för grade C och kan tillsammans med iFVG ge A/A+; entry på confirmation-candlens close.

**Kräver explicit beslutad definition:**
1. Vilken reference-candle/kursnivå identifierar föregående leveransriktning (t.ex. den sista motriktade candlens OPEN, en uppmätt range eller ett strukturswing)? Välj exakt en regel.
2. Vad innebär riktningsbyte: en intrabar touch, candle CLOSE över/under nivån, eller displacement med ytterligare fast definierade villkor?
3. Hur behandlas doji, lika öppning/stängning, gap, flera motriktade candles och reclaims?
4. Vilken sekvens gäller relativt manipulation, när CISD uppstår och när setupen förfaller?
5. Hur hanteras flera samtidiga kandidater, omsignalering och event-identity så replay/live inte dubblar confirmation?
6. Beroende till 1m swing/struktur och om en framtida bar krävs för bekräftelse.

**Varning:** `CISD` används med varierande detaljer i tradingmaterial. En modell får inte välja en definition genom att tolka ett diagram.

### GATE-03 – equal highs / equal lows

**Redan låst:** bekräftad swing high är `high[i] > high[i-1] && high[i] > high[i+1]`; för swing low motsvarande strikta `<`; framtida `i+1` är inte känd förrän candlen stängts.

**Kräver explicit beslutad definition:**
1. Absolut tolerans och enhet: exakt antal **ticks** från verifierad instrumentmetadata, **prispoäng** eller definierad adaptiv regel. Inga påhittade 0.25-konstanter i strategilogik.
2. Vilka pivots får jämföras: bekräftade swing highs/lows på samma timeframe (5m/15m separat?) och inom vilken maximal lookback?
3. Jämförelsens gräns: `abs(levelA-levelB) <= tolerance` eller strikt `<`.
4. Kvalitetsfall: tickstorlek saknas, priset kan inte normaliseras till tick-grid, pivot kommer från delvis stängd candle eller skilda kontrakt kring rollover. **UNKNOWN/BLOCKED**, inte falskt `equal`.
5. Hur identiteten hos en equal-high/low-grupp uppstår och när den inte längre gäller efter sweep.

**Testkandidater – ej beslut:** jämför 1, 2 och 4 ticks *endast i separat research* efter att officiell instrumentmetadata har verifierats. Ändra inte aktiv strategi utifrån bästa backtest.

### GATE-04 – SMT NQ mot ES

**Redan låst:** jämför NQ och ES på 1m/5m/15m; SMT är inte ett entrykrav, kan **bara** höja A till A+, aldrig ensam skapa trade; saknad eller osynkron ES-data är `SMT=UNKNOWN`, inte `FALSE`.

**Kräver explicit beslutad definition:**
1. Vilka liquidity-levels/swing-par motsvarar varandra mellan NQ och ES? Ange identitets- och jämförelsekriterier.
2. Vilka timeframe-par jämförs och prioriteras, t.ex. samma timeframe eller en uttryckligt definierad hierarki.
3. Exakt tillåten tidsdifferens: antal stängda bars eller absoluta sekunder i ET/UTC; inte en implicit `nearest` utan gräns.
4. Sweep-kriterium: wick över/under referensnivå, krav på stängning, tolerans och eventordning.
5. När ett par är `TRUE`, `FALSE` respektive `UNKNOWN`; särskilt vid saknad enskild 1m-bar, ofullständig SessionCalendar, olika kontrakts- eller rolloverhändelser.
6. Vilket SMT-event som får höja en *redan giltig* A-setup, och hur sent det får anlända.

**Säkerhetsregel att testa:** att marknadsdata för NQ och ES är `SETTLED` separat räcker inte utan tidsmässigt jämförbara, fullständiga observationsintervall. `UNKNOWN` får aldrig konverteras till `FALSE` och definitivt inte till `TRUE`.

## 2. Referensfall som måste få entydigt svar

| Fall | Input | Acceptanskrav före promotion |
|---|---|---|
| IFVG-01 | Stängd 1m FVG och senare tydlig inversion | Exakt signal-candle/timestamp och orsak |
| IFVG-02 | Wick penetrerar men candle stänger inte på beslutad nivå | Ingen tidig confirmation |
| IFVG-03 | Ofullständig confirm-candle eller saknad 1m-bar | Ingen signal |
| IFVG-04 | Två FVG-zoner aktiva samtidigt | Identiskt deterministiskt zonval |
| CISD-01 | En motriktad reference-candle och stängd reversalcandle | Exakt signal-candle/timestamp |
| CISD-02 | Doji/equal-price och konkurrerande reference-candles | Ingen implicit tie-break |
| CISD-03 | Look-ahead: referenspunkt ej ännu bekräftad | Ingen signal |
| EQUAL-01 | Två bekräftade pivots exakt på vald toleransgräns | Samma resultat på varje körning |
| EQUAL-02 | Pivots just utanför vald tolerans | Ingen equal-match |
| EQUAL-03 | Saknad tick metadata eller oklart kontrakt | BLOCKED/UNKNOWN |
| SMT-01 | NQ tar high, ES gör inte det, jämförbar komplett data | SMT-resultat enligt låst korrespondens |
| SMT-02 | Båda tar high inom valt fönster | Ingen felaktig divergence |
| SMT-03 | ES-data saknas eller är stale | SMT=UNKNOWN, aldrig A+ |
| SMT-04 | Fördröjda bars, blandade timeframes, kontraktsbyte | Ingen fabricerad SMT |
| PARITY-01 | Exakt samma observationssekvens via backtest och replay | Byte-identiska signaler/orsakskoder |
| PARITY-02 | Prefix av historik innan framtida bekräftelse | Får inte ändra historiskt förflutet |

**Observera:** för positiva fall är önskat resultat **ännu inte ifyllt** eftersom det skulle välja en öppen handelsregel. Golden fixtures skapas först efter godkänt beslutsregister. Negativa fail-closed-fall kan forskningsprovas utan att öppna gaten.

## 3. Historik innan backtesting (GATE-08 / C3C)

1. **Dataägare och rättigheter:** jämför framtida källor för faktiska NQ/MNQ/ES 1m-kontrakt inklusive tillåten lagring, historiklicens, API/tillgång och reell kostnad. Rithmic är vald som **första execution provider**, inte automatiskt som marknadsdata-leverantör. Varken API, licens eller CME-kostnader får antas gratis.
2. **Kontraktsidentitet:** data ska vara `ResolvedContract`-specifik; inga justerade continuous-futures som exekveringsbevis. Fyll `ContractCalendar` med faktiskt källunderlag, `SessionCalendar` med faktiska sessioner och specialdagar.
3. **Källa:** implementera `HistoricalContractCandleSource` enligt Beslut N, `1m` och `[from,to)`, prefix-täckning och `ObservationSourceState`. Återanvänd **inte** chartens `HistoricalCandleSource.hasMoreBefore` som strategibevis.
4. **Kvalitetsgates:** avvisa eller märk UNKNOWN för oregelbundna/duplikata/out-of-order timestamps, otillräcklig intervalltäckning, kontraktsmismatch, ofullständiga candles och otillförlitligt kalenderrutnät. Ett legitimt session break är inte automatiskt ett datafel – använd SessionCalendar, inte aritmetiska antaganden.
5. **Datasetmanifest:** spara provider, avtalsreferens, root, resolved contract, date range, källversion, rådata-checksum, kalender- och reglernas versioner. Detta behövs för att kunna återköra exakt samma backtest.
6. **Testprogression:** syntetiska/paritets-fixtures → verkliga historiska 1m-bars i avgränsad research → baseline-backtest → out-of-sample → forward shadow → demo. **Ingen livehandel** innan separat godkända gates.

## 4. Ordning för kodarbete

- **Nästa PR A – Pattern contract review:** välj och granska alla punkter i §1, skriv varsin machine-readable Canonical Detection Rule med versionsnummer. Uppdatera manifest och Canonical Amendments korrekt, stäng respektive gate först efter godkännande.
- **PR B – Pure pattern detection:** implementera GATE-01–04 som rena, deterministiska funktioner över kompletta tidssorterade 1m-observationer och metadata; märk UNKNOWN separat från FALSE; ingen nätverks-, broker- eller AI-beroende kod. Kör golden cases och paritets/anti-look-ahead-test.
- **PR C – C3C historisk källa:** implementera intervallport, täckning/fel, kontrakts-/sessionsvalidering och recorded replay i eget isolerat steg. Ingen spekulation om provider.
- **PR D – Research backtest:** kör först canonical baseline v1.0 med verklig, versionerad historik, redovisa trade count, expectancy efter kostnader, drawdown, sample size, slippageantaganden och holdout. En positiv modellconfidence får inte användas som sannolikhet att vinna.
- **Senare:** Jev kan *forskas på* som sekundärt analyslager. Den får inte försvaga risk eller skapa signaler ur ogiltiga setups.

## 5. Definition of Done för Fas 3

- [ ] GATE-01, 02, 03 och 04 har **separat** godkända detection versions och signerade beslut.
- [ ] Positiva och negativa golden fixtures har kompletta prisserier, väntat resultat och signalens *earliest-available timestamp*.
- [ ] Exakt samma implementation konsumeras av backtest och replay; framtida bars kan aldrig läcka in.
- [ ] SMT saknas/UNKNOWN påverkar bara A→A+, ingen entry-auktoritet.
- [ ] Data-kontrakt, kalender och periodtäckning är uttryckligt verifierade innan verkliga backtestresultat markeras trovärdiga.
- [ ] Kodgranskare oberoende av implementerare har kontrollerat definitionsparitet, risk/isolation och testdata.
- [ ] Inga API-avgifter, orders, CRON-jobb, Supabase-migrationer eller deployments har skett som bieffekt av detta researchpaket.

**Governance:** Ingen `main`-merge och ingen promotion av en candidate utan explicit review/godkännande. Detta researchdokument har inte företräde framför befintlig canonical source.
