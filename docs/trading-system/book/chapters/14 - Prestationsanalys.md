# Kapitel 14 – Prestationsanalys

Prestationsanalys är lagret där Omnira Trading System går från enskilda trades till faktisk kunskap om hur strategin beter sig över tid.

Tradingjournalen beskriver vad som hände.

Prestationsanalysen försöker besvara:

- hur bra är strategin?
- hur stabil är performance?
- var kommer edge ifrån?
- när fungerar strategin sämre?
- hur mycket risk krävs för avkastningen?
- vilka setup grades bidrar?
- vilka attempts förstör eller förbättrar resultatet?
- påverkar session, liquiditytyp eller SMT utfallet?
- håller edge över flera marknadsregimer?
- är resultatet statistiskt trovärdigt eller kan det vara brus?
Den centrala principen är:

Performance ska bedömas som ett system av flera mått, inte genom en enda snygg siffra.

## Prestationsanalysens roll

Analytics Layer ska ligga ovanpå Trading Journal och standardiserad performance-data.

Flödet är:

```
Trading Events
→ Journal
→ Performance Records
→ Analytics
→ Atlas Interpretation
→ Research Findings
→ Candidate Hypotheses
```

Analytics ska kunna användas i:

- backtest
- forward test
- demo
- controlled live
- prop firm simulation
Samma grundläggande metrics ska användas genom hela systemet.

## Resultat måste alltid ha kontext

Ett värde såsom:

Profit Factor = 1.62

är inte tillräckligt i sig.

Systemet måste också kunna visa:

- strategy version
- environment
- period
- number of trades
- instrument
- session
- cost model
- risk profile
- prop profile
- data quality
Performance utan kontext är lätt att misstolka.

## Strategy Version

All analytics ska grupperas efter strategy version.

Resultat från:

Omnira Liquidity Manipulation v1.0

får inte automatiskt blandas med:

v1.1

En materiell strategyändring skapar ny statistikserie.

## Environment

Performance ska också separeras efter environment.

Exempel:

- BACKTEST
- SHADOW
- DEMO
- LIVE
Dessa får jämföras.

De får inte blandas ihop som om de representerar samma typ av evidens.

## Gross och Net Performance

Systemet ska kunna visa:

**Gross performance**

före execution costs.

och:

**Net performance**

efter:

- commissions
- fees
- slippage
Net performance är den viktigaste ekonomiska bilden.

Gross performance är fortfarande användbar för att skilja strategy quality från execution quality.

## R som primär jämförelseenhet

R ska vara ett centralt performanceformat.

Exempel:

+2R

-1R

0R

Det gör det möjligt att jämföra trades mellan:

- olika account sizes
- olika position sizes
- demo
- live
- backtest
Dollarresultat ska finnas parallellt.

## Trade Count

Varje performancevärde ska visas tillsammans med trade count.

Exempel:

Expectancy = +0.48R

baserat på:

12 trades

är betydligt svagare evidens än samma expectancy efter:

800 trades.

Atlas ska ta hänsyn till detta när resultat presenteras.

## Setup Count

Trade count är inte alltid tillräckligt.

Systemet ska också kunna visa antal:

- detected setups
- Strategy Signals
- risk denials
- prop denials
- expired proposals
- actual executions
Detta gör det möjligt att analysera hela strategy funnel.

## Win Rate

Win rate definierar andelen vinnande trades.

Exempel:

Wins / Total Trades

Men win rate ska aldrig användas ensam för att bedöma edge.

En låg win rate kan kombineras med stora vinnare.

En hög win rate kan kombineras med stora förluster.

## Loss Rate

Loss rate ska också visas.

Break-even ska kunna behandlas som separat outcome.

Det gör att:

Win Rate + Loss Rate

inte nödvändigtvis behöver vara exakt 100 % om BE klassificeras separat.

## Break-Even Rate

Canonical Strategy v1.0 använder break-even management.

Därför är:

BE Rate

en viktig metric.

Vi vill veta:

- hur ofta BE aktiveras
- hur ofta BE-positioner sedan hade nått TP
- hur mycket risk BE reducerar
- hur mycket potentiell avkastning BE eventuellt kostar
## Expectancy

Expectancy är ett av de viktigaste måtten i systemet.

En praktisk R-baserad definition är:

Average realized R per trade

Exempel:

Efter 500 trades:

Expectancy = +0.27R

Det betyder historiskt att varje trade i genomsnitt producerat +0.27 gånger initial risk.

## Expectancy per Setup

Systemet ska också kunna mäta expectancy per setupkategori.

Exempel:

**A+**

+0.46R

**A**

+0.31R

**B**

+0.08R

**C**

-0.14R

Detta kan bli mycket viktigt för framtida candidate versions.

## Expected Dollar Value

Om risk per trade är konstant kan expectancy också omvandlas till förväntat dollarvärde.

Exempel:

Expectancy = +0.25R

och:

1R = $150

ger historiskt:

+$37.50 per trade

före eventuella andra faktorer.

Detta ska alltid ses som historisk statistik, inte garanti.

## Average Winner

Systemet ska mäta:

Average Winning R

Exempel:

+2.18R

Det gör det lättare att förstå relationen mellan win rate och expectancy.

## Average Loser

På samma sätt:

Average Losing R

Canonical SL gör att många fulla losses kan ligga kring:

-1R

men actual losses kan avvika på grund av:

- slippage
- manual close
- emergency exit
- fees
## Payoff Ratio

Systemet kan mäta:

Average Winner / Average Loser

Det ger information om strategy payoff structure.

## Median R

Average kan påverkas kraftigt av extrema trades.

Median R ska därför också finnas.

Skillnaden mellan median och average kan avslöja att resultatet drivs av ett litet antal extrema observations.

## Profit Factor

Profit Factor ska beräknas som:

Gross Profit / Gross Loss

Exempel:

PF = 1.50

betyder historiskt att $1.50 i gross profit producerades för varje $1 i gross loss.

Profit Factor ska bedömas tillsammans med sample size och drawdown.

## Gross Profit

Total vinst från vinnande trades före relevanta nettokostnader där definitionen kräver det.

## Gross Loss

Total absolut förlust från losing trades.

## Net Profit

Net Profit ska inkludera faktiska trading costs där de finns.

För live är detta den ekonomiskt relevanta bilden.

## Maximum Drawdown

Maximum Drawdown är en av systemets viktigaste riskmetrics.

Den visar största peak-to-trough-fallet i performance curve.

Den ska kunna uttryckas i:

- dollar
- R
- procent där lämpligt
## Drawdown Duration

Djup är inte allt.

Systemet ska även mäta hur länge drawdownperioder varar.

En strategi som återhämtar sig från -8R på två dagar beter sig annorlunda än en som behöver tre månader.

## Recovery Time

Atlas ska kunna analysera hur lång tid strategin historiskt behöver för att återhämta drawdowns.

Detta är särskilt relevant för prop firm-challenges och användarens riskupplevelse.

## Average Drawdown

Maximum Drawdown visar värsta historiska observationen.

Average Drawdown kan ge en bättre bild av typiskt beteende.

## Underwater Curve

Analytics ska senare kunna visa hur långt equity ligger under tidigare peak över tid.

Det gör drawdown duration visuellt tydlig.

## Consecutive Losses

Systemet ska mäta längsta losing streak.

Exempel:

Max Consecutive Losses = 8

Detta är viktigt även om den dagliga Risk Engine stoppar efter tre fulla $150-förluster samma dag.

Förluster kan fortsätta över flera dagar.

## Consecutive Wins

Längsta winning streak ska också mätas.

Det ska dock inte användas för att motivera automatisk riskökning.

## Streak Distribution

Vi vill inte bara känna till den värsta streaken.

Analytics ska kunna visa frekvensen av:

- 2 losses i rad
- 3 losses
- 4 losses
- 5+
Detta ger bättre riskförståelse.

## Daily Performance

Systemet ska mäta performance per tradingdag.

Exempel:

- average daily R
- best day
- worst day
- winning days
- losing days
- flat days
Detta är särskilt relevant för prop firm analysis.

## Session Performance

London och New York ska analyseras separat.

Exempel:

**London**

- setups
- trades
- expectancy
- PF
- max DD
- win rate
## New York

samma.

Det gör det möjligt att upptäcka om endast en session faktiskt driver strategins edge.

## Long vs Short

Long och short ska analyseras separat.

Exempel:

Long expectancy = +0.34R

Short expectancy = +0.09R

Asymmetri är viktig information.

Den ska inte automatiskt ändra strategy rules.

## Setup Grade Analysis

A+, A, B och C ska alltid kunna analyseras individuellt.

Det är en av de första analyserna vi kommer vilja göra eftersom Canonical v1.0 tillåter samtliga grades.

## SMT Analysis

SMT ska kunna jämföras.

Exempel:

**iFVG + CISD + SMT**

mot:

**iFVG + CISD utan SMT**

Detta gör det möjligt att mäta om SMT faktiskt tillför edge eller främst fungerar som visuell confirmation.

## Unknown SMT

SMT = UNKNOWN

ska analyseras separat från:

SMT = FALSE

Annars kan data availability skapa falska slutsatser.

## Entry Confirmation Analysis

Performance ska kunna jämföras mellan:

- iFVG only
- CISD only
- iFVG + CISD
- iFVG + CISD + SMT
Detta ligger nära den canonical grade-modellen.

## Liquidity Type

Atlas ska kunna analysera manipulation mot olika typer av liquidity.

Exempel:

- previous day high/low
- previous session
- previous 4H
- equal highs/lows
- intermediate liquidity
- FVG
Detta kan avslöja att vissa contexttyper är mer värdefulla.

## FVG Timeframe

5m och 15m FVG ska analyseras separat.

Det ska även gå att analysera kombinationer där båda finns.

## Attempt Performance

Attempt 1, 2 och 3 ska mätas var för sig.

Exempel:

**Attempt 1**

+0.32R expectancy

## Attempt 2

+0.18R

## Attempt 3

-0.11R

Ett sådant resultat skulle skapa en tydlig research hypothesis.

Det skulle inte automatiskt ändra Canonical v1.0.

## Re-entry Contribution

Systemet ska kunna beräkna:

Hur stor del av total performance kommer från re-entrys?

Det ska även kunna jämföra strategin counterfactually med endast första attempt.

## Break-Even Performance

Break-even-regeln ska analyseras separat.

Systemet ska kunna mäta:

- BE frequency
- loss reduction
- missed eventual winners
- net impact på expectancy
- net impact på drawdown
## Target Analysis

Canonical target är första relevanta liquidity target som erbjuder minst 2R.

Analytics ska kunna mäta:

- planned R
- realized R
- MFE after exit
- distance to next liquidity
Detta hjälper framtida target research.

## R:R Distribution

Alla trades behöver inte ha exakt samma initial R:R.

Systemet ska kunna visa fördelningen.

Exempel:

- 2.0–2.49R
- 2.5–2.99R
- 3.0R+
Det kan senare visa om högre theoretical R:R faktiskt leder till bättre realized expectancy.

## MFE Analysis

MFE ska användas för att förstå hur långt vinnande och förlorande trades rör sig positivt.

Det kan exempelvis avslöja:

Många BE trades når +1.5R innan de återvänder.

Det är värdefull researchdata.

## MAE Analysis

MAE ska användas för att förstå adverse movement.

Det kan exempelvis visa:

Vinnande Grade A-setups går sällan mer än -0.35R innan expansion.

Sådana findings ska valideras innan de får påverka SL eller entry.

## Time in Trade

Analytics ska mäta:

- average duration
- median duration
- duration per outcome
- duration per session
Detta hjälper till att förstå strategi- och executionbehavior.

## Time to MFE

Systemet kan senare mäta hur lång tid det tar innan MFE uppstår.

Detta kan ge bättre förståelse för trade progression.

## Entry Time Analysis

Performance ska kunna analyseras inom sessionen.

Exempel:

- 02:00–03:00
- 03:00–04:00
- 04:00–05:00
och:

- 10:00–11:00
- 11:00–12:00
Detta är research, inte canonical filter.

## Day-of-Week Analysis

När sample size är tillräcklig kan performance delas upp efter veckodag.

Atlas ska vara försiktig med att dra slutsatser eftersom segmenteringen snabbt skapar små samples.

## Monthly och Seasonal Analysis

Samma princip gäller månad och kvartal.

Seasonality ska ses som exploratory analytics tills robust evidens finns.

## Market Regime Analysis

När Market Regime Layer finns ska performance kunna analyseras per regime.

Exempel:

- trending
- ranging
- high volatility
- low volatility
- expansion
- compression
Det kan bli en av Atlas viktigaste framtida researchdimensioner.

## Regime Stability

Det räcker inte att en strategy totalt har positiv expectancy.

Vi vill veta om den:

- fungerar i många regimes
- eller är extremt beroende av en särskild miljö
En smal edge kan fortfarande vara användbar.

Men vi måste veta att den är smal.

## Volatility Analysis

Volatility state kan jämföras mot:

- outcome
- slippage
- stop distance
- trade duration
Detta kan hjälpa både strategy research och execution analysis.

## Execution Quality Metrics

Prestationsanalysen ska ha ett separat executionområde.

Minst:

- average slippage
- median slippage
- worst slippage
- commissions
- average latency
- order rejection rate
- missed executions
- modification failures
## Strategy vs Execution Performance

Systemet ska kunna estimera:

**Theoretical Strategy Result**

och:

**Actual Execution Result**

Skillnaden är:

**Execution Drag**

Detta är centralt för att förstå var förbättringar ska göras.

## Approval Latency

När human approval används ska systemet mäta hur mycket latency det tillför.

Det kan analyseras mot:

- fill degradation
- R:R degradation
- missed trades
## Data Quality Segmentation

Trades från perioder med degraded data ska kunna analyseras separat.

De ska inte utan vidare blandas med healthy execution.

## Technical Incident Impact

Analytics ska kunna visa hur technical incidents påverkade performance.

Exempel:

- missed winners
- unexpected losses
- increased slippage
- failed exits
Det gör teknisk stabilitet mätbar ekonomiskt.

## Prop Firm Analytics

När Prop Firm Engine används ska systemet även mäta:

- maximum-loss headroom
- daily-loss usage
- breach count
- near-breach events
- consistency state
- challenge pass/fail
- days to target
## Challenge Pass Rate

Genom simulationer kan Omnira uppskatta hur ofta strategin klarar ett specifikt program under definierade antaganden.

Detta ska alltid kopplas till exakt PropFirmProfile version.

## Strategy Profitability vs Challenge Suitability

En lönsam strategi är inte automatiskt optimal för en prop firm.

Exempel:

En strategi kan ha stark long-term expectancy men:

- djupa korta drawdowns
- många losing streaks
- hög intraday variance
Det kan göra den olämplig för vissa drawdownmodeller.

## Sharpe Ratio

Sharpe kan användas som kompletterande riskjusterat mått där datastrukturen gör det meningsfullt.

Det jämför i grunden excess return mot total variation.

För vår intraday strategy ska Sharpe inte behandlas som ett universellt huvudmått.

Resultatet påverkas av:

- vald tidsperiod
- return aggregation
- risk-free-rate-antagande
- icke-normal return distribution
Det ska därför användas tillsammans med mer direkt tradingstatistik.

## Sortino Ratio

Sortino liknar Sharpe men fokuserar på downside variation.

Det kan vara mer intuitivt relevant för trading eftersom positiv variation inte behandlas som samma typ av risk.

Även Sortino ska ses som kompletterande.

## Risk-Adjusted Metrics är inte Edge Proof

En hög Sharpe eller Sortino i ett litet backtest är inte bevis på robust edge.

Sample size och out-of-sample-resultat är fortfarande kritiska.

## Calmar-Liknande Analysis

Systemet kan senare använda relationen mellan avkastning och maximum drawdown som ytterligare riskjusterad analys.

Exakt metric implementation ska standardiseras om den används.

## Variance och Standard Deviation

Distributionen av trade returns ska kunna analyseras.

Hög variance betyder att resultatet är mer ojämnt.

Detta kan vara relevant för risk och challenge survival.

## Distribution of R

Vi vill se hela outcome-distributionen.

Exempel:

- -1R
- BE
- +2R
- +2.5R
- +3R+
En histogramliknande analys kan visa om strategin har:

- många små outcomes
- få stora vinnare
- stark asymmetri
## Skew

Return distribution kan vara positivt eller negativt skev.

Detta är relevant eftersom två strategier med samma expectancy kan ha mycket olika riskprofil.

## Tail Risk

Systemet ska leta efter extrema negativa outcomes.

Canonical SL reducerar normal risk men actual fills kan ändå påverkas av exempelvis:

- gaps
- extreme volatility
- broker issues
Tail observations ska granskas separat.

## Confidence Intervals

När sample size tillåter ska systemet kunna uppskatta osäkerhetsintervall kring viktiga statistics.

Exempel:

Estimated expectancy = +0.28R

men med ett intervall som visar att den verkliga långsiktiga expectancyn är osäker.

Det är mer ärligt än att behandla sample average som exakt sanning.

## Statistical Significance

Om Atlas hittar ett samband ska den inte endast fråga:

Är skillnaden positiv?

utan också:

Kan skillnaden rimligen vara slump?

Exakt statistisk metod beror på metric och datastruktur.

Systemet ska inte använda p-värden mekaniskt som enda beslutskriterium.

## Practical Significance

En skillnad kan vara statistiskt detekterbar men ekonomiskt ointressant.

Exempel:

En regel förbättrar expectancy med:

+0.01R

men:

- minskar trades kraftigt
- gör strategy mer komplex
- ökar parameter sensitivity
Det kanske inte är en meningsfull förbättring.

## Economic Significance

Atlas ska därför också bedöma:

- net expectancy gain
- drawdown change
- execution impact
- opportunity cost
- complexity cost
## Sample Size Tiers

Systemet bör senare definiera evidensnivåer.

Exempel konceptuellt:

- INSUFFICIENT
- PRELIMINARY
- MODERATE
- STRONG
Exakta thresholds ska inte låsas förrän vi analyserat strategy frequency och statistikmodellen.

## Small Sample Warning

När sample är litet ska Atlas automatiskt uttrycka försiktighet.

Exempel:

A+ visar +0.61R expectancy, men resultatet bygger endast på 18 trades och ska betraktas som preliminärt.

## Segment Explosion

Om vi delar datasetet efter:

- session
- direction
- grade
- liquidity
- regime
- weekday
kan vi snabbt skapa hundratals små grupper.

Analytics ska aktivt motverka falska slutsatser från sådan segmentering.

## Multiple Hypothesis Testing

Atlas Learning Layer kommer över tid kunna testa många idéer.

Ju fler hypoteser som testas, desto större risk att något ser bra ut av slump.

Research Registry ska därför registrera:

- number of hypotheses
- test history
- successful and failed findings
Negativa resultat ska bevaras.

## Stability Over Time

Edge ska analyseras över tid.

Exempel:

**2024**

+0.34R

## 2025

+0.29R

## 2026

+0.31R

ser mer stabilt ut än:

**2024**

+1.10R

## 2025

-0.42R

## 2026

+0.18R

även om total average kanske är positiv.

## Rolling Metrics

Systemet ska kunna beräkna rolling performance.

Exempel:

- rolling 20 trades
- rolling 50 trades
- rolling 100 trades
Det gör strategy degradation lättare att upptäcka.

## Rolling Expectancy

Rolling expectancy kan visa om edge gradvis försvagas.

Det är viktigt för framtida live monitoring.

## Rolling Drawdown

Även drawdown behavior kan följas över tid.

## Strategy Drift

Strategy drift innebär att faktisk performance förändras från den historiskt validerade profilen.

Exempel:

- expectancy sjunker
- slippage ökar
- setup distribution förändras
- regime distribution förändras
Atlas ska kunna upptäcka sådan drift.

## Performance Degradation Alert

När performance avviker kraftigt från förväntad range kan systemet skapa:

```
PERFORMANCE_REVIEW_REQUIRED
```

Det ska inte automatiskt innebära att strategin stängs om ingen separat policy säger det.

## Safety Trigger vs Research Alert

Det är viktigt att skilja:

**Hard Safety Trigger**

från:

**Analytics Alert**

Analytics får säga:

Performance har försämrats.

Risk Engine bestämmer om trading måste stoppas enligt explicit safety policy.

## Out-of-Sample Performance

Out-of-sample-statistik ska visas separat.

Det är en av de starkaste signalerna på om research findings generaliserar.

## Backtest vs Forward

Analytics ska jämföra:

- backtest
- forward
- demo
- live
Om results divergerar ska Atlas försöka identifiera orsaken.

## Backtest-to-Live Decay

Det är normalt att actual performance är något sämre än idealiserat backtest.

Systemet ska mäta denna skillnad.

Exempel:

Backtest +0.34R

Forward +0.27R

Live +0.21R

Denna decay kan bli en viktig forecasting input.

## Benchmarking Candidate Versions

Candidate Strategy v1.1 ska jämföras mot canonical v1.0.

Det ska ske med samma relevanta:

- dataset
- costs
- risk profile
- execution assumptions
Jämförelsen ska vara så rättvis som möjligt.

## Candidate Scorecard

En candidate ska inte bedömas på total profit ensam.

Scorecard kan innehålla:

- expectancy
- PF
- max DD
- losing streak
- stability
- OOS performance
- forward performance
- execution sensitivity
- sample size
## Robustness

En strategyförändring ska betraktas starkare om förbättringen syns:

- över flera perioder
- i OOS
- i forward
- över flera närliggande parameter-värden
än om den endast fungerar i ett specifikt historiskt segment.

## Sensitivity Analysis

Systemet ska kunna stressa viktiga antaganden.

Exempel:

- högre slippage
- högre commissions
- delayed entry
- small data errors
- different parameter values
Edge som överlever stress är mer robust.

## Monte Carlo

När trade sample är tillräckligt stort kan Monte Carlo och resampling användas för att uppskatta möjliga future paths.

Det kan ge distributioner för:

- drawdown
- final result
- losing streak
- challenge failure
Detta är betydligt mer informativt än en enda historical equity curve.

## Risk of Ruin

På längre sikt kan systemet uppskatta risk-of-ruin-liknande metrics under givna riskmodeller.

För prop firms kan motsvarande fråga vara:

Hur stor simulerad sannolikhet finns att maximum loss breachas innan target nås?

Detta kan bli mycket värdefullt.

## Probability är modellberoende

Sådana sannolikheter ska aldrig presenteras som säker framtid.

De beror på:

- historisk distribution
- stationarity-antaganden
- sample size
- simulation method
Atlas ska alltid förklara detta.

## Atlas Performance Analyst

Atlas ska kunna fungera som en analytiker ovanpå dessa metrics.

Exempel:

Canonical v1.0 är fortsatt positiv totalt, men rolling 50-trade expectancy har sjunkit från +0.29R till +0.08R. Förändringen sammanfaller främst med Grade C och tredje attempts. A/A+ är fortfarande positiva. Sample är ännu för litet för en canonical ändring men motiverar en research hypothesis.

Detta är den typ av analys vi vill ha.

## Atlas ska inte jaga siffror

AI:n ska inte optimera mot en enda metric såsom:

- maximum profit
- highest Sharpe
- highest win rate
Målet är robust riskjusterad edge.

## Multi-Metric Evaluation

En strategyförändring ska därför bedömas på flera dimensioner samtidigt.

Exempel:

**Candidate A**

Högre profit men högre drawdown.

## Candidate B

Lite lägre profit men lägre drawdown och bättre stability.

Vilken som är bäst beror på systemmål och prop constraints.

## Findings

Analytics kan skapa strukturerade findings.

Exempel:

FIND-0042

Observation:
Attempt 3 visar negativ expectancy.

Sample:
287 third-attempt observations.

Strategy:
v1.0

Result:
-0.14R expectancy.

Status:
Research finding.

## Hypothesis Generation

Atlas kan skapa:

HYP-0042

Testa candidate där max attempts per thesis = 2.

Det är ett experiment.

Canonical v1.0 ändras inte.

## Findings måste kunna motbevisas

Varje finding ska kunna gå vidare till:

- independent dataset
- OOS
- forward test
Om resultatet inte replikerar ska hypotesen kunna avslås.

## Research Memory

Både bekräftade och avslagna findings ska bevaras.

Det hindrar Atlas från att testa samma dåliga idé om och om igen utan att minnas tidigare resultat.

## Self-Improvement Scorecard

Atlas Trading Learning & Improvement Layer ska utvärdera sina egna rekommendationer.

Vi ska kunna mäta:

Hur många candidateförslag blev faktiskt bättre OOS?

Om Atlas ständigt producerar överfit candidates är Learning Layer själv dåligt kalibrerat.

## Prediction Calibration

Om Atlas senare ger probabilistiska eller confidence-baserade predictions ska de kunna kalibreras mot verkligt outcome.

Confidence ska inte få vara dekorativt.

## Performance Dashboard

Omnira Trading ska senare kunna ha en central analyticsvy.

Exempel:

Strategy: Omnira Liquidity Manipulation v1.0

Environment: Forward Demo

Trades: 524

Expectancy: +0.26R

Profit Factor: 1.48

Win Rate: 43.7%

Average Win: +2.21R

Average Loss: -0.98R

Max Drawdown: -8.6R

Longest Losing Streak: 7

Status: VALIDATION RUNNING

## Segment Dashboard

Användaren ska kunna välja exempelvis:

```
New York → A+ → Long → Attempt 1
```

och se relevant performance.

Systemet ska samtidigt visa sample size tydligt.

## Equity Curve

Analytics UI ska kunna visa:

- gross curve
- net curve
- drawdown curve
Kurvor ska kunna filtreras efter version och environment.

## R Curve

En R-baserad cumulative curve ska också finnas.

Det gör strategy behavior lättare att jämföra mellan olika account sizes.

## Prop Firm Dashboard

Prop Mode ska kunna visa:

- current headroom
- simulated challenge survival
- pass/fail history
- average days to target
- common breach reasons
## Atlas Daily Brief

Atlas ska senare kunna sammanfatta aktuell trading performance.

Exempel:

De senaste 50 trades har expectancy +0.19R, lägre än långtidsbaslinjen +0.27R. Försämringen kommer huvudsakligen från Grade C. Execution metrics är stabila och slippage ligger inom normal range.

## Weekly Performance Review

En veckoreview kan innehålla:

- setups
- trades
- R
- expectancy
- execution quality
- risk usage
- prop state
- anomalies
- research findings
## Monthly Strategy Review

Månadsreview ska fokusera mer på:

- rolling statistics
- regime shifts
- segment stability
- candidate hypotheses
- forward vs historical performance
## Promotion Gates

Performance metrics ska senare användas för att definiera konkreta promotion gates.

Exempel:

**Backtest → Forward**

kräver historisk edge och robustness.

## Forward → Demo Auto

kräver både strategy och technical performance.

## Demo Auto → Controlled Live

kräver ännu striktare criteria.

Exakta thresholds låses senare.

## Ingen godtycklig Performance Gate

Vi ska inte välja thresholds enbart därför att de låter bra.

Exempel:

Win Rate > 60%

är meningslöst om strategin inte är designad för sådan win rate.

Gates ska utgå från strategy behavior och riskkrav.

## Performance Stop Policy

När live väl finns kan en separat policy senare definiera när kraftig degradation kräver:

- review
- risk reduction
- automation suspension
Detta ska vara explicit policy.

Atlas får inte själv ändra risk live bara för att en metric försämras.

## Datakvalitet före slutsats

Ingen analyticsmodell är bättre än datan den använder.

Innan Atlas producerar en stark slutsats ska den kunna bedöma:

- completeness
- quality
- sample size
- version consistency
## Inga fabricerade metrics

Om data saknas ska Atlas säga:

Cannot calculate

inte gissa.

Det gäller särskilt:

- fees
- slippage
- MFE
- MAE
- historical sample
## Analytics Reproducibility

Varje större rapport ska kunna reproduceras.

Den ska referera till:

- query/filter
- dataset
- strategy version
- date range
- analytics version
## Analytics Versioning

Om en metric senare beräknas annorlunda ska analytics logic versionshanteras.

Historiska rapporter ska kunna förstås enligt den metod som användes då.

## Source of Truth

Raw Journal och Performance Records är source of truth.

Atlas-generated prose är tolkning.

Om Atlas summerar fel ska originalmetrics fortfarande finnas kvar.

## Den centrala prestationsprincipen

Omnira ska aldrig fråga endast:

Tjänade strategin pengar?

Den ska fråga:

Tjänade den pengar på ett robust, reproducerbart och riskmässigt acceptabelt sätt som sannolikt representerar edge snarare än slump?

Det är en mycket högre standard.

Det är också den standard som krävs innan systemet får större autonomi.

## Kapitelstatus

Kapitel: 14 – Prestationsanalys

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Primärt performanceformat: R + net dollar

Core metrics: Expectancy, Profit Factor, Drawdown, Win/Loss/BE, MFE/MAE, streaks

Risk-adjusted metrics: Sharpe/Sortino som kompletterande analys där relevant

Segmentation: Session, grade, direction, attempt, liquidity, FVG, SMT, regime

Sample size: Ska alltid exponeras

Out-of-sample: Central evidens

Rolling performance: Planerad

Candidate comparison: Versionsstyrd

Self-improvement: Analytics skapar findings och hypotheses

Automatisk canonical ändring: Förbjuden

Prestationsanalysen ska omvandla tradinghistorik till mätbar kunskap utan att förväxla historisk korrelation med bevisad framtida edge.
