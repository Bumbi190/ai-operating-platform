# Kapitel 10 – Backtesting

Backtesting är den första riktiga prövningen av om Omnira Liquidity Manipulation faktiskt har en mätbar edge.

Strategin är nu formellt definierad.

Riskreglerna är definierade.

Arkitekturen är definierad.

Men inget av detta bevisar att strategin tjänar pengar.

Backtesting ska därför inte användas för att bekräfta att strategin fungerar.

Backtesting ska användas för att försöka hitta när, varför och hur strategin inte fungerar.

Den centrala principen är:

En backtest ska försöka motbevisa edge, inte bekräfta en önskad slutsats.

## Vad backtesting ska svara på

Backtesting ska bland annat kunna svara på:

- har strategin positiv expectancy?
- hur stabil är performance över tid?
- fungerar den i både London och New York?
- fungerar A+, A, B och C lika bra?
- ger SMT faktiskt mervärde?
- fungerar 5m och 15m FVG lika bra?
- hur påverkar re-entry resultatet?
- hur många trades behövs innan resultaten börjar stabiliseras?
- vilka market regimes fungerar bäst?
- vilka market regimes fungerar sämst?
- hur stor drawdown kan strategin skapa?
- hur långa losing streaks förekommer?
- hur påverkar commissions och slippage?
- fungerar strategin fortfarande när reglerna testas out-of-sample?
## Strategy Specification är source of truth

Backtestmotorn får inte skapa en förenklad variant av strategin.

Den ska testa:

**Omnira Liquidity Manipulation – Canonical v1.0**

med samma regler som senare används live.

Det betyder bland annat:

- samma sessions
- samma 4H-opens
- samma liquidity definitions
- samma FVG-definition
- samma manipulation rule
- samma iFVG/CISD detection
- samma SMT-logik
- samma setup grades
- samma entry
- samma stop loss
- samma target
- samma minimum 2R
- samma break-even
- samma re-entry
- samma news policy
- samma riskmodell där relevant
Om en regel behöver ändras för backtestet ska detta skapa en ny candidate strategy version.

## Samma Strategy Engine i Backtest och Live

Om möjligt ska backtest använda samma Strategy Engine som live.

Skillnaden ska främst vara:

**Live:**

Realtime Market Data Adapter

## Backtest:

Historical Data Adapter

Strategy Engine ska inte veta om datan kommer från historik eller live.

Detta minskar risken för att strategin fungerar annorlunda i test än i produktion.

## Event-Driven Backtesting

Backtestmotorn bör byggas event-driven.

Historiska marknadsdata ska spelas fram kronologiskt.

Exempel:

09:59 candle

```
→ process
```

10:00 candle

```
→ process
```

10:01 candle

```
→ process
```

Strategy Engine får endast se data som hade varit tillgänglig vid den aktuella tidpunkten.

Detta gör simulationen mer lik live trading.

## Look-Ahead Bias

Look-ahead bias är ett av de största hoten mot ett trovärdigt backtest.

Det uppstår när systemet använder information från framtiden för att fatta ett historiskt beslut.

Exempel:

En swing high kräver en efterföljande candle för att bli bekräftad.

Backtestet får därför inte behandla swing high som känt innan nästa candle faktiskt har existerat.

Samma princip gäller:

- candle close
- FVG confirmation
- CISD
- iFVG
- SMT
- liquidity sweeps
- market regime
- targets
Om framtida data smyger in blir resultatet artificiellt bra.

## Candle Close Integrity

Om entry enligt Strategy v1.0 sker på confirmation candle close måste backtestet vänta tills candle är stängd.

Det får inte anta att close-priset var känt under candle.

Entry kan först simuleras efter att confirmation är bekräftad.

## Intrabar Ambiguity

OHLC-data visar:

- open
- high
- low
- close
men inte alltid exakt ordning mellan high och low.

Det kan skapa problem.

Exempel:

Under samma 1m-candle kan både:

- stop loss
- take profit
ha träffats.

Med endast OHLC går det inte alltid att veta vilken som träffades först.

Backtestmotorn får då inte automatiskt välja det mest lönsamma resultatet.

## Conservative Intrabar Policy

När intrabar-sekvens är okänd ska systemet använda:

- tickdata
- lägre timeframe
- eller en konservativ executionregel
Det ska dokumenteras vilket alternativ som används.

Om vi inte kan avgöra om TP eller SL träffades först ska testet hellre underskatta än överskatta performance.

## Tick Data för Execution Precision

Första strategy research kan genomföras med bars där reglerna tillåter det.

Men när vi ska validera:

- entries
- stop loss
- TP
- break-even
- slippage
behöver tickdata eller tillräckligt detaljerad intrabar-data användas när bar-data inte räcker.

Detta blir särskilt viktigt på 1m.

## Historical Dataset

Varje backtest ska veta exakt vilket dataset som användes.

Minst:

- provider
- instrument
- contract
- date range
- timeframes
- timezone treatment
- data version
- quality status
- continuous eller actual contract data
Backtest-resultat utan identifierbar datasetversion är svåra att reproducera.

## Futures Rollover

NQ och MNQ är futures.

Historiska tester måste därför hantera contract rollover.

Systemet ska skilja mellan:

- actual contract data
- continuous futures data
Continuous data är användbar för research men kan innehålla price adjustments som aldrig varit verkligt handlingsbara.

Execution-simulering ska därför vara extra försiktig när continuous data används.

## Contract-by-Contract Validation

När möjligt bör kritisk strategy validation även göras på faktiska kontrakt.

Detta gör att vi kan kontrollera:

- verkliga prices
- gaps
- liquidity
- contract transitions
- execution economics
Rolloverperioder ska kunna analyseras separat.

## In-Sample och Out-of-Sample

Data ska delas upp.

Exempel:

**In-Sample**

används för:

- utveckling
- debugging
- initial research
## Out-of-Sample

hålls undan.

Den får inte användas för att justera strategy rules.

Först när candidate strategy är låst testas den på out-of-sample-data.

## Holdout Data

Holdout-data ska fungera som ett verkligt prov.

Om vi tittar på holdout-resultatet och därefter ändrar strategin baserat på det har datasetet inte längre samma värde som holdout.

Det måste då behandlas som development data och nytt holdout behövs.

## Walk-Forward Testing

Utöver enkel train/test-split kan systemet senare använda walk-forward testing.

Exempel:

- utveckla på period A
- testa på period B
- rulla fram
- utveckla på B
- testa på C
Detta visar bättre hur strategin hade fungerat när tiden faktiskt går framåt.

## Ingen Parameter Hunting

Systemet ska inte testa tusentals kombinationer tills en fantastisk equity curve hittas.

Exempel:

- 1.85R
- 1.86R
- 1.87R
- 1.88R
- 1.89R
och sedan välja exakt den bästa.

Detta ökar risken för overfitting.

Parametrar ska ha tradingmässig motivering och robusthet över ett rimligt intervall.

## Robust Parameter Region

En parameter är mer trovärdig om närliggande värden också fungerar.

Exempel:

Om:

minimum RR = 2.0

fungerar bra,

och:

1.9

samt:

2.1

också ger rimliga resultat,

är modellen mer robust än om endast exakt:

2.03

fungerar.

## Strategy v1.0 ska testas först

Vi ska först testa strategy baseline som den faktiskt är definierad.

Inte optimera direkt.

Initial fråga:

Har Canonical v1.0 edge över huvud taget?

Först därefter börjar candidate research.

## Sample Size

En liten mängd trades kan ge missvisande resultat.

Exempel:

20 trades

kan se fantastiska ut av slump.

Vi ska därför alltid visa sample size tillsammans med performance.

Ingen universal miniminivå är ännu låst, men statistik med små sample ska tydligt märkas som preliminär.

## Trade Count per Segment

När performance delas upp på:

- session
- setup grade
- SMT
- market regime
minskar sample size snabbt.

Atlas ska därför inte säga:

Grade A+ under London är bäst

om slutsatsen endast bygger på exempelvis fem trades.

## Core Metrics

Backtest ska minst mäta:

- trade count
- win rate
- loss rate
- break-even rate
- expectancy
- average R
- median R
- gross P/L
- net P/L
- profit factor
- maximum drawdown
- average drawdown
- longest losing streak
- longest winning streak
- MFE
- MAE
## Expectancy

Expectancy är en av de viktigaste metrics.

I R kan den konceptuellt uttryckas som:

Expectancy = average R per trade

Exempel:

Om strategin över många trades har:

+0.24R

i genomsnitt per trade,

har den positiv historisk expectancy.

Det är mer informativt än win rate ensam.

## Win Rate är inte Edge

En strategi kan ha:

35% win rate

och ändå vara mycket lönsam om vinnarna är tillräckligt stora.

En annan kan ha:

80% win rate

och ändå vara dålig om förlusterna är stora.

Atlas ska därför aldrig presentera win rate ensam som bevis på kvalitet.

## Profit Factor

Profit factor ska mätas som relationen mellan:

- gross profits
- gross losses
Det ger ytterligare information om hur mycket vinst strategin producerar relativt förlust.

Den ska alltid tolkas tillsammans med:

- sample size
- drawdown
- expectancy
## Drawdown

Backtestet ska mäta maximum drawdown.

Det ska också kunna visa:

- duration
- recovery time
- depth
- frequency
En strategi med god avkastning men extrem drawdown kan vara opraktisk för prop firm-konton.

## Losing Streak

Losing streak är särskilt viktig för den aktuella riskmodellen.

Med:

$150 risk/trade

och:

$450 daily stop

är sekvenser av förluster direkt relevanta.

Systemet ska därför mäta:

- max consecutive losses
- frequency of 2-loss streaks
- frequency of 3-loss streaks
- recovery after streaks
## R-Based Performance

Alla trades ska kunna analyseras i R.

Det gör resultatet mer jämförbart oberoende av account size.

Exempel:

+2R

-1R

0R

Detta ska finnas parallellt med dollarresultat.

**MFE**

Maximum Favorable Excursion visar hur långt traden gick i positiv riktning innan exit.

Det kan hjälpa Atlas analysera:

- om targets är för korta
- om break-even sker för tidigt
- om vinnare ofta lämnar mycket potential
MFE är researchdata.

Det ska inte automatiskt ändra target-regler.

**MAE**

Maximum Adverse Excursion visar hur långt priset gick mot positionen innan exit.

Det kan användas för att förstå:

- stop placement
- setup quality
- entry timing
Även detta är researchdata.

## Performance per Session

London och New York ska analyseras separat.

Exempel:

**London**

- trade count
- expectancy
- drawdown
- win rate
## New York

samma metrics.

Om sessionerna fungerar olika ska detta synliggöras.

## Performance per Setup Grade

A+, A, B och C ska analyseras separat.

Det är viktigt eftersom alla grades är tillåtna i Canonical v1.0.

Vi vill senare kunna avgöra om exempelvis C faktiskt tillför positiv expectancy.

## SMT Analysis

Systemet ska mäta:

- A med SMT
- A utan SMT
- performance per SMT direction
- sample size
Detta gör att vi kan avgöra om SMT verkligen förbättrar resultat.

## Liquidity Type Analysis

Performance ska kunna delas upp efter manipulation target.

Exempel:

- previous day high/low
- session liquidity
- previous 4H
- equal highs/lows
- intermediate liquidity
- FVG
Detta kan avslöja vilka setupfamiljer som faktiskt driver edge.

## FVG Timeframe

5m och 15m FVG ska kunna analyseras separat.

Om performance skiljer sig kraftigt ska detta bli research finding.

## Entry Confirmation Analysis

Systemet ska kunna jämföra:

- iFVG only
- CISD only
- iFVG + CISD
- iFVG + CISD + SMT
Detta följer direkt av setup grades.

## Attempt Analysis

Re-entry attempts ska journalföras separat.

Exempel:

- attempt 1
- attempt 2
- attempt 3
Atlas ska kunna mäta expectancy för varje attempt.

Det kan senare visa om attempt 3 faktiskt är värdefull eller bara ökar drawdown.

## Break-Even Analysis

Backtest ska mäta effekten av canonical break-even-regeln.

Vi ska kunna se:

- hur många trades gick till BE
- hur många BE-trades hade senare nått TP
- hur mycket drawdown BE minskade
- hur mycket profit BE eventuellt kostade
- fördelningen mellan swing-baserad BE och London window-close BE
- hur London window-close BE påverkade utfallet separat
Canonical regeln ska inte ändras i samma test.

Detta blir input till candidate research.

## News Filter Analysis

Canonical v1.0 använder:

```
No entry T-1h → T+4h
```

och:

Existing trade close T-15m

Backtest ska följa dessa regler.

Separat research kan senare jämföra andra blackout windows.

## Trading Costs

Backtesting ska inkludera realistiska kostnader.

Minst:

- commissions
- fees
- spread där relevant
- slippage
Resultat ska visas:

**gross**

och:

**net**

## Slippage

Slippage ska inte alltid antas vara exakt noll.

Systemet ska senare kunna testa flera executionmodeller.

Exempel:

- optimistic
- expected
- conservative
En strategi som endast fungerar vid perfekt fills är inte robust.

## Commission Model

Commission ska motsvara den account/broker setup som testet försöker simulera.

Om exakta historiska avgifter saknas ska modellen dokumenteras.

Atlas ska inte presentera net performance utan att kunna säga vilken cost model som användes.

## Execution Latency

När strategin exekverar på 1m kan latency påverka resultat.

Backtest ska därför senare kunna simulera:

- instant execution
- liten latency
- större manual approval latency
Detta kan bli särskilt viktigt när vi jämför manual approval med demo automation.

## Manual Approval Simulation

Under tidig livefas krävs human approval.

Backtest/replay bör därför kunna analysera:

Hur mycket påverkar en realistisk approval-delay strategy performance?

Det kan hjälpa oss förstå om strategin är för snabb för manual live approval.

## Prop Firm Simulation

Backtesting ska senare kunna köras med Prop Firm Rules Engine aktiv.

Då kan systemet mäta:

- challenge survival
- rule breaches
- drawdown headroom
- probability of passing challenge
- number of trading days
- daily loss interactions
Strategy profitability och prop firm suitability är inte exakt samma sak.

## Internal Risk Simulation

Backtest ska kunna köras med:

$150 risk/trade

$450 daily stop

max 3 attempts/thesis

max 1 open position

Det gör simulationen mer realistisk för den första deploymenten.

## Strategy-Only vs Full-System Test

Systemet ska kunna visa två nivåer.

## Strategy-Only

Hur signalerna hade presterat utan account risk constraints.

## Full-System

Hur faktiskt tillåtna trades hade presterat med:

- Risk Engine
- Prop Firm Engine
- news
- execution costs
- position limits
Båda är värdefulla men svarar på olika frågor.

## Rejected Trade Simulation

Nekade trades ska kunna följas counterfactually.

Exempel:

Risk Engine:

```
DENY
```

Backtest research kan ändå registrera:

Den hypotetiska traden hade blivit +2R.

Det betyder inte att riskbeslutet var fel.

Det betyder att datan kan användas för forskning.

## Survivorship Bias

När fler marknader senare testas får vi inte bara välja marknader som fortfarande är populära eller som vi redan vet fungerade bra.

Data selection ska dokumenteras.

## Regime Bias

Vi får heller inte endast testa exempelvis starka trendår om strategin senare ska köras i alla marknadsförhållanden.

Data ska täcka olika typer av perioder.

## Market Regime Analysis

När regime classification finns ska backtest kunna analysera exempelvis:

- trend
- range
- high volatility
- low volatility
- expansion
- compression
Detta kan bli viktigt för Atlas self-improvement.

## Bull och Bear Perioder

Strategin ska testas under både:

- stigande marknadsmiljö
- fallande marknadsmiljö
- sidledes perioder
Long och short ska också analyseras separat.

## Long vs Short

Performance ska segmenteras på:

- long
- short
Det kan avslöja asymmetri.

En strategi behöver inte ha samma edge i båda riktningar.

## Seasonal Analysis

När datasetet är tillräckligt stort kan Atlas analysera:

- månad
- kvartal
- dag i veckan
Men seasonal findings ska betraktas försiktigt.

Ju fler segment vi testar, desto större risk att något ser bra ut av slump.

## Multiple Testing Problem

Om Atlas testar hundratals möjliga samband kommer några av dem statistiskt se fantastiska ut av slump.

Learning Layer ska därför registrera hur många hypoteser som testats och vara konservativ med slutsatser.

Detta är viktigt för self-improvement.

## Candidate Strategy Testing

När Atlas senare föreslår:

Strategy v1.1-candidate

ska den testas mot v1.0.

Jämförelsen ska använda samma:

- dataset
- costs
- execution model
- risk model
så långt det är möjligt.

## Baseline Comparison

Canonical v1.0 ska fungera som baseline.

En candidate ska inte godkännas bara för att den tjänar pengar.

Den ska visa att den sannolikt är bättre än baseline på relevanta mått.

## Förbättring betyder mer än Profit

En candidate kan ha högre total profit men vara sämre genom:

- högre drawdown
- längre losing streak
- sämre stability
- mindre sample
- extrem parameter sensitivity
Därför ska Atlas använda en bredare performancebild.

## Out-of-Sample Gate

En candidate som ser bättre ut in-sample men sämre out-of-sample ska normalt inte uppgraderas.

Out-of-sample-resultatet är en central gate.

## Forward-Test Gate

Backtest räcker inte för production activation.

En candidate måste senare gå genom forward testing.

Detta behandlas i nästa kapitel.

## Monte Carlo Analysis

När det finns tillräckligt med trades kan Monte Carlo-liknande simuleringar användas för att förstå variation i resultat.

Exempel:

Samma historiska trades kan ordnas i olika sekvenser för att uppskatta möjliga:

- drawdowns
- losing streaks
- equity paths
Det hjälper till att förstå path risk.

## Bootstrap och Robustness

Systemet kan senare använda statistiska resampling-metoder för att uppskatta hur känsliga resultaten är för enskilda trades.

Om all lönsamhet kommer från två extrema vinnare ska detta synas.

## Sensitivity Testing

Viktiga parametrar ska stress-testas.

Exempel:

- slippage
- commission
- latency
- break-even behavior
- data quality
Om strategin kollapsar vid mycket små realistiska förändringar är edge:n svagare än equity curve antyder.

## Missing Trade Simulation

Systemet ska kunna simulera att en del trades missas.

Detta kan hända live på grund av:

- network outage
- approval latency
- broker rejection
- runner downtime
En robust strategi bör inte vara helt beroende av att exakt varje historisk vinnare fångas.

## Failure Costs

Backtest/replay kan senare inkludera sällsynta tekniska fel.

Exempel:

- större slippage
- missed break-even
- failed entry
- delayed close
Målet är inte att förutsäga alla tekniska problem.

Målet är att förstå hur känsligt systemet är.

## Reproducibility

Varje BacktestRun ska kunna reproduceras.

Det ska minst registrera:

- strategy version
- strategy configuration
- dataset
- date range
- instrument
- code version
- detection version
- execution model
- cost model
- risk profile
- prop profile när relevant
- random seed där simulation använder randomness
## Backtest ID

Varje körning ska få ett unikt ID.

Exempel:

BT-2026-00124

Det ska göra det möjligt att referera till exakt test i:

- journal
- Atlas findings
- candidate proposals
- boken
- development logs
## Immutable Results

Ett färdigt backtestresultat ska inte redigeras för att passa en ny strategi.

Ny strategi:

```
→ nytt BacktestRun
```

Ändrad cost model:

```
→ nytt BacktestRun
```

Ändrat dataset:

```
→ nytt BacktestRun
```

Historiska testresultat ska bevaras.

## Atlas Backtest Analysis

Atlas ska kunna analysera ett färdigt test.

Exempel:

Canonical v1.0 producerade positiv expectancy totalt, men nästan hela fördelen kom från London A/A+ setups. C-grade hade negativ expectancy i båda sessionerna.

Atlas ska alltid stödja slutsatsen med faktisk testdata.

## Atlas ska leta efter Problem

Atlas ska inte endast sammanfatta det positiva.

Den ska aktivt leta efter:

- koncentrerad edge
- svaga perioder
- drawdown clusters
- parameter sensitivity
- dåliga setup grades
- dåliga regimes
- execution sensitivity
- data anomalies
AI-lagret ska fungera som kritisk reviewer.

## Backtest Report

Varje större backtest ska kunna generera en standardiserad rapport.

Rapporten ska exempelvis innehålla:

**Test Configuration**

- strategy
- version
- dataset
- period
- costs
- risk model
## Performance

- trade count
- expectancy
- profit factor
- drawdown
- win rate
## Segmentation

- session
- grade
- direction
- SMT
- liquidity type
- market regime
## Robustness

- out-of-sample
- sensitivity
- execution assumptions
## Conclusion

- PASS
- FAIL
- INCONCLUSIVE
## PASS betyder inte Live

Ett lyckat backtest innebär inte att live trading är godkänd.

Ett backtest PASS betyder endast att strategin har klarat den definierade historiska testgaten.

Nästa steg är forward testing.

**FAIL**

Om Canonical v1.0 visar negativ expectancy ska vi inte försöka dölja resultatet genom att genast optimera bort alla förlorare.

Resultatet ska dokumenteras.

Vi kan därefter forska fram en candidate v1.1.

Men v1.0-resultatet ska finnas kvar.

**INCONCLUSIVE**

Ett test kan också vara:

```
INCONCLUSIVE
```

Exempel:

- för få trades
- dålig datakvalitet
- otillräcklig period
- osäker execution simulation
Det är bättre att säga att vi inte vet än än att låtsas ha bevis.

## Backtesting och Self-Improvement

Backtestmotorn är den första stora experimentmiljön för Atlas Learning Layer.

Atlas ska kunna:

- skapa hypothesis
- definiera candidate
- köra eller begära test
- jämföra resultat
- mäta robustness
- dokumentera finding
Men production-regler får inte ändras direkt.

## Research Registry

Varje self-improvement hypothesis bör senare kunna lagras med:

- hypothesis ID
- reason
- supporting data
- candidate change
- test plan
- test results
- conclusion
- status
Exempel:

HYP-0041

Testa om Grade C bör blockeras under New York-sessionen.

Det gör systemets lärande auditerbart.

## No Cherry Picking

Atlas får inte kassera testresultat bara för att de inte stödjer hypotesen.

Negativa resultat är också kunskap.

## Wisdom från Backtesting

Över tid ska Atlas kunna bygga findings såsom:

Re-entry attempt 3 försämrar expectancy men minskar inte antalet vinnande dagar tillräckligt för att motivera extra drawdown.

eller:

SMT förbättrar A-setups tydligt under New York men har liten effekt under London.

Dessa findings är:

**Research Knowledge**

inte automatiskt:

**Canonical Rules**

## Första Backtestmålet

Den första stora backtesten ska inte försöka optimera strategin.

Dess mål är att besvara:

Har Omnira Liquidity Manipulation – Canonical v1.0 positiv historisk expectancy på NQ/MNQ när reglerna implementeras exakt och realistiska kostnader inkluderas?

Detta är den första riktiga edge-gaten.

## Minimikrav före godkänt Backtestprogram

Innan vi litar på testresultat ska följande vara verifierat:

- strategy rules implemented
- no look-ahead
- timezones correct
- session boundaries correct
- swing detection correct
- FVG detection correct
- iFVG/CISD detection correct
- SMT logic correct
- entry timing correct
- SL/TP correct
- break-even correct
- news policy correct
- re-entry correct
- realistic costs
- reproducible data
## Golden Trades

Några manuellt verifierade historiska trades bör användas som golden test cases.

För varje sådan trade vet vi ungefär vad strategin borde identifiera.

Backtestmotorn ska kunna reproducera:

- context
- manipulation
- entry
- SL
- TP
- outcome
Golden trades används för implementation verification.

De ska inte användas som statistiskt bevis på edge.

## Negative Golden Cases

Vi behöver också exempel där systemet inte ska ta trade.

Exempel:

- under 2R
- news blackout
- fel session
- saknad confirmation
- max attempts reached
- position redan öppen
Dessa är minst lika viktiga som vinnande exempel.

## Regression Suite

När Strategy Engine ändras ska samma golden dataset köras igen.

Om tidigare canonical behavior förändras utan medveten versionsändring ska testet falla.

## Backtesting som Safety Gate

Backtesting är inte endast research.

Det är också en säkerhetsgate.

Systemet ska bevisa att implementationen:

- gör vad dokumentationen säger
- inte använder framtida data
- inte skapar oväntade positions
- respekterar riskregler
innan demo automation får övervägas.

## Kapitelstatus

Kapitel: 10 – Backtesting

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Primär strategy: Omnira Liquidity Manipulation – Canonical v1.0

Primär marknad: NQ / MNQ

Comparison instrument: ES

Backtestmotor: Ej implementerad

Historical dataset: Ej slutligt vald

Golden test cases: Ska samlas

Out-of-sample: Obligatoriskt

Forward test: Krävs efter backtest

Look-ahead bias: Förbjudet

Realistic costs: Obligatoriskt

Backtest PASS: Ger inte live-godkännande

Ett snyggt historiskt resultat är inte målet.

Målet är att skapa tillräckligt stark evidens för att vi ska våga fortsätta försöka motbevisa strategin i nästa testfas.
