# Kapitel 6 – Marknadsdata

Marknadsdata är den faktiska verklighet som Omnira Trading System bygger alla sina beslut på.

Strategin kan vara korrekt definierad.

Risk Engine kan vara perfekt implementerad.

Atlas kan ha tillgång till avancerade analysmodeller.

Men om marknadsdatan är fel, fördröjd, ofullständig eller tidsmässigt inkonsekvent kan hela systemets beslutsprocess ändå bli fel.

Därför ska datakvalitet behandlas som en säkerhetsfråga och inte bara som ett tekniskt integrationsproblem.

Den grundläggande principen är:

Om systemet inte kan lita på datan får systemet inte lita på beslutet som bygger på datan.

## Marknadsdata som source of truth

Market Data Layer ska vara Omniras canonical källa för normaliserad tradingdata.

Strategy Engine ska inte själv kommunicera direkt med olika externa providers och försöka tolka deras format.

Istället ska flödet vara:

```
External Data Source
→ Market Data Adapter
→ Validation
→ Normalization
→ Canonical Market Data
→ Strategy Engine
```

Detta ger en tydlig gräns mellan externa datakällor och intern strategi-logik.

## Varför ett separat Market Data Layer behövs

Olika providers kan representera samma information på olika sätt.

Skillnader kan exempelvis finnas i:

- symbolnamn
- timestamps
- timezone
- candle boundaries
- volume
- spread
- tick format
- contract naming
- session definitions
- historical availability
Strategy Engine ska inte behöva känna till dessa skillnader.

Den ska exempelvis kunna begära:

```
MNQ
```

1m

och få samma interna datamodell oavsett vilken godkänd provider som levererar datan.

## Primära instrument

Den första valideringen av Omnira Liquidity Manipulation ska ske på:

- NQ
- MNQ
ES används som comparison instrument för SMT.

Det betyder att systemet initialt behöver tillförlitlig data för:

**NQ / MNQ**

och:

**ES**

Strategins första edge ska inte antas fungera på andra instrument innan dessa testats separat.

## NQ och MNQ

NQ och MNQ följer samma underliggande Nasdaq-100-marknad men är separata futureskontrakt med olika kontraktsstorlek.

Det innebär att systemet ska kunna skilja mellan:

- marknadsanalys
- instrument
- execution contract
En analys kan exempelvis göras utifrån Nasdaq-strukturen samtidigt som execution sker i MNQ för att kunna använda mindre position size.

Instrumentens metadata måste därför lagras separat från strategy logic.

## ES som SMT-instrument

ES används inte primärt som executioninstrument i Strategy v1.0.

ES används för SMT-confirmation mot NQ.

Systemet behöver därför kunna synkronisera relevanta marknadsstrukturer mellan:

- NQ
- ES
på:

- 1m
- 5m
- 15m
SMT får endast användas när båda instrumentens data är tillräckligt färsk och tidsmässigt jämförbar.

Om ES-data saknas får systemet inte låtsas att:

SMT = false

Det korrekta tillståndet är istället exempelvis:

SMT = UNKNOWN

Eftersom SMT inte är obligatoriskt för entry kan setupen fortfarande existera om övriga strategiregler tillåter det.

Men systemet får inte felaktigt ge A+ grade när comparison data saknas.

## Timeframes

Omnira Liquidity Manipulation använder:

- 4H
- 15m
- 5m
- 1m
Varje timeframe har ett specifikt ansvar.

**4H**

Används för:

- relevanta 4H-opens
- övergripande thesis
- tidigare 4H highs/lows
## 15m

Används för:

- liquidity
- FVG
- manipulation
- struktur
## 5m

Används för samma huvudsakliga syften som 15m men med högre detaljnivå.

## 1m

Används för:

- liquidity
- iFVG
- CISD
- entry
- break-even
- exakt trade management
## Timeframe consistency

Systemet ska känna till vilken 1m-data som bygger en 5m-, 15m- eller 4H-candle när aggregation används.

Candle boundaries måste vara reproducerbara.

En 15m-candle får inte skapas på ett sätt i backtest och ett annat sätt live.

Det skulle kunna skapa olika:

- FVG
- swing points
- liquidity levels
- manipulation events
och därmed olika trades.

## Canonical timezone

Alla canonical timestamps ska lagras i:

**UTC**

Strategiregler ska därefter utvärderas mot:

**America/New_York**

Detta innebär att systemet tydligt skiljer mellan:

**storage time**

och:

**trading context time**

Sessionslogik får inte byggas utifrån en permanent UTC-offset eftersom New York använder daylight saving time.

## Trading date

Varje relevant event ska kunna kopplas till en trading date.

Systemet behöver exempelvis kunna avgöra att:

2026-08-26 02:15 America/New_York

hör till rätt trading session och daily risk period.

Detta är viktigt för:

- London session
- New York session
- daily reset
- journal
- analytics
- news
- prop firm-regler
## Selected 4H Opens

Strategy v1.0 använder endast de relevanta 4H-opens som hör till:

**02:00 New York**

och:

**10:00 New York**

Market Data Layer måste därför kunna leverera korrekt 4H-context kring dessa tider.

Övriga 4H-opens får fortfarande finnas i market data, men Strategy v1.0 ska ignorera dem som strategy triggers.

Det är Strategy Engines ansvar.

## OHLC-data

Varje bar ska minst kunna innehålla:

- instrument
- timeframe
- open time
- close time
- open
- high
- low
- close
- volume när relevant
- source
- completion state
Systemet ska kunna skilja mellan:

**open candle**

och:

**confirmed closed candle**

Detta är kritiskt för exempelvis swing-definitioner där en efterföljande candle måste finnas innan swing point är bekräftad.

## Candle finality

Strategy Engine får inte använda framtida information.

Om ett pattern kräver candle close får det inte betraktas som bekräftat innan candle faktiskt stängt.

Detta gäller särskilt:

- swing highs/lows
- iFVG
- CISD
- entry confirmation
Backtestmotorn måste följa samma regel.

Annars uppstår look-ahead bias.

## Tick Data

Tick data är inte nödvändigt för alla delar av Strategy v1.0.

Men systemarkitekturen ska stödja tick data eftersom den senare är viktig för:

- precise execution simulation
- bid/ask
- spread
- slippage
- order timing
- fill quality
- intrabar sequencing
Tick data kan därför bli betydligt viktigare i execution- och backtestingfaserna än i första analys-MVP:n.

## Bid, Ask och Last

Systemet ska där källan stödjer det kunna skilja mellan:

- bid
- ask
- last traded price
Detta är viktigt eftersom chart price och faktisk execution price inte alltid är samma sak.

En long kan exempelvis exekveras mot ask medan chartdata huvudsakligen visar last eller bid beroende på provider.

Dessa skillnader ska senare inkluderas i realistiska executionmodeller.

## Spread

Strategy v1.0 använder inget hard spread-filter.

Det innebär inte att spread ska ignoreras.

Systemet ska fortfarande mäta och journalföra spread vid:

- setup
- signal
- proposal
- execution
- fill
Detta gör det möjligt för Atlas Trading Learning & Improvement Layer att senare analysera om hög spread påverkar:

- win rate
- expectancy
- slippage
- execution quality
Om data senare visar ett robust samband kan Atlas föreslå ett framtida spread-filter som kandidatregel.

Atlas får inte lägga till filtret automatiskt.

## Volume

Volume ska lagras när källan tillhandahåller det.

Det är inte ett canonical entrykrav för Strategy v1.0.

Det kan däremot bli användbart för:

- forskning
- market regime classification
- future strategies
- self-improvement
Data som inte används i strategin idag kan fortfarande ha forskningsvärde senare.

## Instrument Metadata

Varje instrument ska ha metadata såsom:

- canonical symbol
- broker symbol
- tick size
- tick value
- contract size
- minimum quantity
- quantity step
- exchange
- currency
- trading hours
Risk Engine ska använda denna metadata för korrekt position sizing.

Strategy Engine ska inte hårdkoda exempelvis MNQ:s tick value.

## Futures Contract Mapping

Futures använder kontraktsmånader.

Därför behöver Omnira kunna skilja mellan:

**canonical market**

och:

**active contract**

Exempel:

```
MNQ
```

kan representera den canonical marknaden medan den faktiska broker-symbolen representerar ett specifikt futureskontrakt.

Market Data Layer och Execution Layer måste veta vilket kontrakt som är aktivt.

Strategin ska inte innehålla hårdkodade kontraktsnamn.

## Contract Rollover

Futureskontrakt byts över tid.

Systemet behöver därför senare hantera rollover på ett kontrollerat sätt.

Detta påverkar:

- historical data
- chart continuity
- prices
- backtesting
- execution symbols
Rollover får inte ske genom att ett gammalt kontrakt plötsligt börjar representera ett nytt utan metadata.

## Continuous Futures Data

För lång historisk analys kan continuous futures-data vara användbar.

Men continuous series kan innehålla justeringar som inte motsvarar faktiska handlingsbara priser.

Därför ska systemet skilja mellan:

**research/continuous data**

och:

**actual contract execution data**

En backtestmodell måste veta vilken typ av data som används.

## Historical Data

Backtesting kräver historisk market data.

Historiska datasets ska versionshanteras eller åtminstone identifieras tydligt.

Ett BacktestRun ska kunna referera till:

- dataset
- provider
- date range
- instruments
- timeframes
- data version
- quality status
Om data senare korrigeras ska det gå att förstå vilken version ett tidigare resultat byggde på.

## Realtime Data

Live analysis kräver realtime eller tillräckligt nära realtime-data.

Systemet ska kunna mäta:

```
data_age
```

Skillnaden mellan:

- aktuell systemtid
- senaste market timestamp
Om data blir för gammal ska systemet markera:

```
STALE_DATA
```

och blockera execution där färsk data krävs.

## Data freshness

Olika datatyper kan ha olika freshness requirements.

Exempelvis kan:

- 1m entry data
- account state
- 4H historical context
behöva olika thresholds.

Freshness ska därför vara explicit konfigurerad.

Det ska inte finnas en generell regel som behandlar alla datatyper identiskt.

## Missing Data

Om bars saknas mitt i en serie ska systemet kunna upptäcka detta.

Exempel:

10:01

10:02

10:04

saknar:

10:03

Strategy Engine får inte tyst anta att serien är komplett.

Systemet ska kunna markera:

```
INCOMPLETE_SERIES
```

## Duplicate Data

Duplicerade bars eller ticks ska identifieras.

Det ska inte vara möjligt att oavsiktligt skapa två separata strategy events från samma market event på grund av duplicate ingestion.

Canonical identifiers och timestamps ska användas för deduplicering.

## Out-of-Order Data

Realtime events kan tekniskt anlända i fel ordning.

Market Data Layer ska kunna upptäcka detta.

Strategy Engine ska inte basera state transitions på en tidsserie som den tror är kronologisk om datan inte är det.

## Corrected Data

En provider kan i vissa fall korrigera historisk data.

Systemet ska kunna skilja mellan:

- original observation
- corrected data
Historiska systembeslut ska inte skrivas om bara för att en provider senare korrigerar sin feed.

Audit trail ska visa vilken data systemet faktiskt såg när beslutet fattades.

## Data Quality States

Market data ska kunna klassificeras som exempelvis:

**VALID**

**STALE**

**INCOMPLETE**

**DUPLICATE**

**OUT_OF_ORDER**

**SUSPECT**

**CORRECTED**

Strategy Engine och Risk Engine ska kunna läsa denna state.

## Data Quality Gate

Före en exekverbar Strategy Signal ska kritisk data passera Data Quality Gate.

Exempel:

NQ 1m = VALID

NQ 5m = VALID

NQ 15m = VALID

NQ 4H = VALID

ES comparison = VALID

Om kritisk NQ-data är invalid:

**BLOCK**

Om endast optional SMT-data är unavailable ska systemet istället kunna fortsätta utan SMT, men tydligt registrera att confirmation saknades på grund av data availability.

## Data Provenance

Varje viktig datapunkt ska kunna spåras tillbaka till sin källa.

Systemet bör kunna svara på:

Vilken provider gav denna candle?

När mottogs den?

Var den korrigerad?

Vilken adapter normaliserade den?

Vilken data version användes i backtestet?

Detta är särskilt viktigt när olika providers ger små skillnader.

## Multi-Source Data

Arkitekturen ska stödja flera providers i framtiden.

Men systemet får inte blanda data från olika feeds godtyckligt mitt i en setup.

Det ska finnas regler för:

- primary source
- fallback source
- source transition
- validation
Om source byts ska detta vara ett explicit systemevent.

## Data Source Failure

Om primary market-data source faller bort ska systemet inte automatiskt anta att en fallback är identisk.

Fallback kan tillåtas först när systemet verifierat:

- symbol mapping
- timestamp alignment
- data freshness
- price consistency
I execution-enabled mode ska tveksam data leda till:

**NO NEW TRADE**

## Account Data är också tradingdata

Market Data Layer och Account Data Layer är tekniskt separata concerns, men båda behövs för ett tradingbeslut.

Från providern behöver Omnira exempelvis kunna läsa:

- balance
- equity
- margin
- free margin
- positions
- orders
- historical deals
Risk Engine ska inte använda gammal account state samtidigt som Strategy Engine använder färsk market data.

## News Data

Ekonomiska nyheter är också en kritisk datakälla för Strategy v1.0.

Systemet behöver kunna representera:

- event
- currency
- impact
- scheduled time
- event type
- status
För Strategy v1.0 gäller:

**No new entry: T-1h till T+4h**

och:

**Existing position exit: T-15m**

Därför är felaktig news timestamp en faktisk risk.

## News Data Failure

Om systemet inte kan avgöra om ett relevant high-impact USD-event finns ska execution-enabled modes inte anta att kalendern är tom.

Resultatet ska vara:

```
NEWS_STATE_UNKNOWN
```

och:

**ingen ny trade**

tills state är verifierad.

Analysis Mode kan fortsätta med tydlig varning.

## Market Snapshot

Vid viktiga strategy events ska systemet kunna skapa en Market Snapshot.

Exempel:

- 4H thesis start
- manipulation detected
- entry confirmation
- Strategy Signal
- Trade Proposal
- execution
- exit
Snapshot kan innehålla:

- candles
- liquidity
- FVG
- SMT
- current price
- spread
- session
- news state
- strategy state
Detta gör senare analys och debugging betydligt starkare.

## Chart Snapshot

Omnira kan dessutom skapa en visuell chart snapshot.

Den visuella bilden är användbar för:

- mänsklig review
- journal
- Atlas explanations
- jämförelser
Men bilden är inte source of truth.

Den strukturerade market-data representationen ska vara source of truth.

## Atlas Market View

Atlas Market View ska rendera samma marknadsobjekt som Strategy Engine arbetar med.

När Strategy Engine identifierar:

LiquidityLevel

ska UI:t kunna visa exakt samma nivå.

När Strategy Engine identifierar:

FVGZone

ska UI:t visa exakt samma zon.

Det ska alltså inte finnas:

**Atlas liquidity**

och:

**UI liquidity**

som två olika tolkningar.

Det ska finnas en canonical representation.

## Vad Atlas ska kunna se

Atlas ska kunna konsumera strukturerad data såsom:

- CandleSeries
- SwingPoint
- LiquidityLevel
- FVGZone
- SMTObservation
- ManipulationEvent
- StrategyState
- MarketSnapshot
Atlas kan därefter förklara denna information för användaren.

AI:n ska inte behöva visuellt gissa var liquidity ligger om Strategy Engine redan identifierat den deterministiskt.

## Historisk och live data ska tala samma språk

En av de viktigaste arkitekturprinciperna är att:

**backtest**

och:

**live**

ska använda samma canonical market-data format.

Historiska candles kan komma från en dataset adapter.

Live candles kan komma från providern.

Men Strategy Engine ska få samma interna objekt.

Detta reducerar risken att strategin fungerar annorlunda mellan testing och production.

## Replay

Market data ska stödja replay.

Replay innebär att historisk data spelas fram kronologiskt som om den vore live.

Strategy Engine får endast se information som hade varit tillgänglig vid den aktuella tidpunkten.

Replay ska kunna användas för:

- strategy validation
- debugging
- demonstration
- Atlas Market View
- regression tests
## Look-Ahead Bias

Systemet ska aktivt designas för att undvika look-ahead bias.

Exempel på förbjudet beteende är:

- använda candle high innan candle stängt
- veta att en swing point blir bekräftad innan nästa candle existerar
- använda framtida FVG-status
- använda framtida news outcome
- välja liquidity target baserat på vad priset senare gjorde
Backtestresultat som innehåller look-ahead bias är inte tillförlitliga.

## Survivorship och Data Selection Bias

När systemet senare testas på flera marknader ska datasets väljas på ett sätt som inte enbart inkluderar marknader eller perioder där strategin råkar fungera.

Atlas Learning Layer ska inte få välja endast positiva perioder och kalla det robust edge.

Dataurval ska dokumenteras.

## Data och Self-Improvement

Atlas Trading Learning & Improvement Layer ska kunna analysera market data tillsammans med trade-resultat.

Det kan exempelvis identifiera samband mellan:

- volatility
- session
- setup grade
- liquidity type
- FVG type
- SMT
- spread
- entry timing
- MFE
- MAE
- outcome
Detta kan skapa hypoteser såsom:

A-setups efter 15m FVG-touch fungerar bättre än efter intermediate liquidity under vissa market regimes.

Detta är en hypotes.

Den får inte automatiskt bli en ny tradingregel.

## Feature Extraction

I framtiden kan systemet skapa strukturerade features från market data.

Exempel:

- volatility state
- distance from 4H open
- FVG size
- manipulation depth
- time since session open
- number of liquidity sweeps
- SMT state
- stop distance
- target distance
Features kan användas för:

- analytics
- market regime classification
- research
- AI analysis
Features ska vara reproducerbara där de används för forskning.

## Raw Data och Derived Data

Systemet ska skilja mellan:

**Raw Data**

och:

**Derived Data**

Raw Data kan exempelvis vara:

- candle
- tick
- bid
- ask
Derived Data kan vara:

- swing
- liquidity
- FVG
- SMT
- market regime
- volatility state
Det ska gå att förstå hur derived data skapats från raw data.

## Versionering av Detection Logic

Om algoritmen som identifierar exempelvis FVG eller swing points ändras ska versionen dokumenteras.

Annars kan två backtests på samma candles generera olika setups utan att det syns varför.

Detection logic är därför en del av systemets reproducerbarhet.

## Datamängd och lagring

Högupplöst market data kan bli mycket omfattande.

Systemet ska därför senare skilja mellan:

- hot realtime data
- operational history
- research datasets
- archived tick data
Men kostnadsoptimering får inte förstöra möjligheten att reproducera viktiga tradingbeslut.

## Retention

Trade-relaterade Market Snapshots ska bevaras långsiktigt.

Full tick history kan senare få en separat retention policy beroende på lagringskostnad och backtestbehov.

Data som krävs för audit av en live-trade ska prioriteras för bevarande.

## Databas är inte chart

Systemet ska inte behandla chart-rendering som datalagring.

TradingView-liknande UI är en presentation.

Den canonical representationen ska ligga i strukturerad data.

Det innebär att Omnira senare kan:

- byta chart library
- skapa mobil vy
- generera journalbilder
- bygga replay UI
utan att ändra strategy logic.

## Testning av Market Data Layer

Market Data Layer ska ha automatiserade tester för exempelvis:

- timezone conversion
- daylight saving transitions
- missing candles
- duplicate candles
- out-of-order bars
- wrong timeframe
- wrong instrument
- stale data
- candle close boundaries
- futures rollover
- provider disconnect
- source switch
Time handling ska betraktas som säkerhetskritisk kod.

## Regression Testing

När Market Data Layer ändras ska systemet kunna köra tidigare kända testserier igen.

Exempel:

En given historisk dataserie ska producera samma:

- candles
- swing points
- FVG
- liquidity
- strategy events
så länge ingen relevant algorithm version medvetet ändrats.

## Observability

Systemet ska kunna mäta Market Data Layers tekniska hälsa.

Exempel på metrics:

- latest data timestamp
- ingestion latency
- missing bars
- duplicate events
- reconnects
- source failures
- validation failures
- clock drift
- backlog
Atlas och UI ska kunna visa när marknadsdatan inte är healthy.

## Market Data och Execution

Det är viktigt att skilja:

**analysis data**

från:

**execution reality**

Strategy Engine kan identifiera en entry på en candle close.

Execution sker därefter mot broker price.

Därför måste systemet senare registrera:

- strategy expected entry
- actual requested entry
- broker fill
- slippage
Skillnaden ska journalföras.

## Execution Quality

Om en strategi ser lönsam ut före execution costs men förlorar efter:

- spread
- commission
- slippage
har systemet inte bevisat live edge.

Datamodellen måste därför göra det möjligt att mäta execution quality separat från strategy quality.

## Data Principle för Omnira Trading

Den viktigaste dataprincipen är:

Omnira ska aldrig behöva gissa vilken data ett historiskt beslut baserades på.

För varje viktigt beslut ska systemet i efterhand kunna rekonstruera:

- vilken data som fanns
- från vilken källa
- vid vilken tid
- med vilken quality state
- vilken strategy version som använde den
Det är grunden för:

- robust backtesting
- säker live trading
- debugging
- audit
- Atlas self-improvement
- framtida autonomi
## Kapitelstatus

Kapitel: 6 – Marknadsdata

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Primära instrument: NQ / MNQ

SMT comparison: ES

Canonical storage timezone: UTC

Strategy timezone: America/New_York

Timeframes: 1m, 5m, 15m, 4H

Market Data implementation: Ej påbörjad

Historisk dataset: Ej vald

Realtime provider: Ej slutligt vald

Execution data: Ej implementerad

Marknadsdata ska valideras och normaliseras innan den får påverka ett exekverbart tradingbeslut.
