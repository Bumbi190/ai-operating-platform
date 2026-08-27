# Kapitel 19 – Kriterier för uppskalning

Uppskalning i Omnira Trading System betyder att systemet får hantera större ekonomisk exponering eller högre grad av autonomi.

Det kan exempelvis innebära:

- högre risk per trade
- större account size
- fler accounts
- fler prop firm-konton
- fler tillåtna instruments
- fler StrategyVersions
- övergång från Live Manual till Controlled Live Automation
Uppskalning får aldrig ske enbart därför att systemet har haft en bra vecka eller några stora vinnare.

Den centrala principen är:

Risk och autonomi ska öka först efter dokumenterad evidens, inte efter kortsiktig framgång.

## Två typer av uppskalning

Omnira ska skilja mellan två huvudsakliga dimensioner.

## Kapitaluppskalning

Det innebär att systemet får riskera mer kapital.

Exempel:

- större risk per trade
- större funded account
- fler konton
- större sammanlagd exposure
## Autonomiuppskalning

Det innebär att systemet får fatta och genomföra fler beslut utan mänsklig approval.

Exempel:

LIVE MANUAL

```
→
```

CONTROLLED LIVE AUTO

Dessa två dimensioner ska inte automatiskt följa varandra.

## Högre autonomi betyder inte högre risk

Det ska vara möjligt att köra:

CONTROLLED LIVE AUTO

med mycket låg risk.

Det ska också vara möjligt att köra:

LIVE MANUAL

på ett större account.

Autonomy och capital risk är separata controls.

## Uppskalning är en promotion

Varje scale-up ska behandlas som en promotion mellan definierade system states.

Exempel:

```
RISK_TIER_1
→
RISK_TIER_2
```

eller:

```
LIVE_MANUAL
→
CONTROLLED_LIVE_AUTO
```

Promotion kräver PASS på definierade gates.

## Ingen implicit scaling

Systemet får aldrig använda logik såsom:

Kontot är upp 10 %, därför dubblar vi risken.

Riskökning kräver explicit ny RiskProfile version.

## RiskProfile-versionering

Exempel:

LIVE-RISK-v1

```
max_risk_per_trade = $50
```

senare:

LIVE-RISK-v2

```
max_risk_per_trade = $75
```

eller annan framtida nivå.

Varje förändring ska:

- dokumenteras
- motiveras
- granskas
- aktiveras explicit
## Canonical Risk är inte samma som Initial Live Risk

Den interna strategy/risk-baslinjen kan vara:

$150 per trade

men första live deployment kan använda lägre risk.

Detta är inte en StrategyVersion-förändring.

Det är en RiskProfile-fråga.

## Varför börja mindre

Den första liveperioden har osäkerheter som demo inte fullt ut kan simulera.

Exempel:

- live slippage
- fees
- broker behavior
- prop firm enforcement
- nätverk
- execution timing
- verkliga account states
Mindre initial risk begränsar kostnaden om någon antagelse visar sig vara fel.

## Första scaling-gaten

Innan risk får ökas från den första live-nivån ska systemet minst ha bevisat:

- stabil live execution
- korrekt risk
- korrekt SL/TP
- korrekt reconciliation
- inga zero-tolerance incidents
- relevant trade sample
- acceptabel performance
- acceptabel drawdown
- stabilitet över tid
## Profit ensam är inte en gate

Exempel:

Systemet är:

+15R

men har haft:

- en duplicate order
- två SL-verification failures
- en wrong-account incident
Resultat:

**NO SCALE**

Safety dominerar profit.

## Zero-Tolerance Incidents

Vissa incidenter ska blockera uppskalning oavsett P/L.

Exempel:

- wrong account execution
- unintended duplicate order
- wrong quantity
- trade i fel environment
- execution utan giltigt Risk PASS
- execution utan giltigt Prop PASS
- unprotected live position orsakad av systemet
- bypassad kill switch
## Incident-Free Window

Efter en critical incident ska systemet behöva bevisa stabil drift igen.

Ett problem som fixades igår är inte automatiskt tillräckligt för scale-up idag.

Exakt incident-free window definieras senare.

## Performance Gate

Performance ska bedömas med flera metrics.

Minst:

- trade count
- expectancy
- Profit Factor
- maximum drawdown
- losing streak
- win/loss/BE distribution
- stability över tid
- execution costs
## Expectancy

Risk får inte ökas om actual live expectancy är tydligt negativ.

Ett positivt account-resultat kan ändå vara slump om sample är litet.

## Sample Size

Varje scalingbeslut ska visa antal live trades.

Exempel:

+8R efter 7 trades

är mycket svag evidens.

Det ska inte behandlas som robust edge.

## Minimum Sample är Strategy-Specific

Det finns ingen universell siffra som automatiskt gör en strategi statistiskt bevisad.

Trade frequency, return distribution och market regime spelar roll.

Därför ska vi definiera scaling thresholds först när vi har faktisk Strategy v1.0-data.

## Time Requirement

Sample size ensam räcker inte heller.

Exempel:

200 trades under samma mycket speciella marknadsperiod kan ge mindre robust evidens än ett mer varierat sample över längre tid.

Därför ska både:

- antal trades
- elapsed time
vägas in.

## Regime Coverage

Scale-up ska helst bygga på performance över flera marknadsförhållanden.

Exempel:

- trend
- range
- high volatility
- low volatility
Systemet behöver inte vara lika bra i alla regimes.

Men vi ska förstå dess svagheter.

## Session Coverage

Eftersom Strategy v1.0 använder:

- London
- New York
ska båda sessionerna ingå i scaling review.

Om nästan all live-data kommer från en session ska detta markeras.

## Grade Coverage

A+, A, B och C ska analyseras.

Om exempelvis C grade visar negativ live expectancy ska detta vara känt innan risk ökas.

Det behöver inte automatiskt förändra Canonical v1.0.

Det kan däremot blockera scale-up eller skapa candidate research.

## Attempt Coverage

Attempt 1, 2 och 3 ska analyseras separat.

Detta är viktigt eftersom senare attempts kan påverka drawdown oproportionerligt.

## Long och Short

Båda riktningarna ska granskas.

Om live edge endast finns på long ska vi inte låtsas att hela strategy är lika bevisad i båda riktningar.

## Backtest-to-Live Consistency

Scale-up kräver inte identiska resultat mellan backtest och live.

Men behavior ska vara rimligt kompatibelt.

Exempel:

Backtest:

+0.30R expectancy

Demo:

+0.25R

Live:

+0.21R

kan vara logiskt.

Men:

Backtest:

+0.30R

Live:

-0.24R

kräver utredning innan scaling.

## Forward-to-Live Consistency

Samma jämförelse ska göras mellan forward/demo och live.

## Execution Quality Gate

Scale-up ska endast ske om execution är stabil.

Metrics kan inkludera:

- average slippage
- worst slippage
- order rejection
- latency
- missed executions
- modification failures
## Slippage Stability

Om större quantity påverkar fills kan tidigare execution data inte automatiskt extrapoleras.

Detta blir viktigare när systemet skalar upp i kontrakt.

## Capacity

Strategin kan ha en praktisk execution capacity.

För MNQ är små positioner enkla.

Vid större size eller flera accounts kan:

- liquidity
- slippage
- fill behavior
förändras.

Scale-up ska därför ske stegvis.

## One Variable at a Time

När möjligt bör vi inte samtidigt:

- dubbla risk
- byta VPS
- byta strategy
- byta broker
- aktivera automation
Det gör det svårt att förstå vad som orsakade en förändring.

## Controlled Scaling Steps

Scale-up bör ske i små steg.

Exempel konceptuellt:

Tier 1

```
→ validation
```

Tier 2

```
→ validation
```

Tier 3

```
→ validation
```

inte:

tiny

```
→
```

maximum

## Risk Tier

Varje Risk Tier ska ha explicit definition.

Exempel:

- risk per trade
- account scope
- max exposure
- environment
- effective date
## Scaling Hold Period

Efter riskökning ska den nya nivån köras tillräckligt länge för att verifiera att behavior fortfarande är stabilt.

Under denna tid ska ingen ytterligare riskökning ske.

## Scale-Up behöver nytt baslinjedataset

När risk eller execution size förändras blir den nya nivån en egen operational baseline.

Det gäller särskilt om quantity ökar.

## Scale-Down

Uppskalning måste alltid vara reversibel.

Systemet ska kunna:

- sänka risk
- sänka autonomy
- blockera konto
- återgå till tidigare RiskProfile
## Automatic Scale-Down

Det kan senare vara tillåtet för safety policy att automatiskt sänka risk/autonomy vid definierade conditions.

Exempel:

- technical incidents
- performance degradation
- prop headroom stress
Men en sådan policy måste vara explicit definierad och testad.

## Ingen automatisk Scale-Up

Detta är en viktig asymmetri.

Automatiskt:

```
HIGHER → LOWER
```

kan senare tillåtas.

Automatiskt:

```
LOWER → HIGHER
```

ska inte ske utan governance.

## Drawdown Gate

Scale-up ska ta hänsyn till actual drawdown.

Exempel:

En strategy kan ha god expectancy men mycket större live drawdown än historiskt.

Det kan vara tecken på:

- regime shift
- execution degradation
- underestimated variance
Risk ska då inte höjas.

## Drawdown Relative to Historical Distribution

Vi ska inte endast fråga:

Är drawdown under en godtycklig procent?

Vi ska fråga:

Ligger current drawdown inom vad Strategy v1.0 historiskt har visat som rimligt?

## Drawdown Stress Testing

Innan risk ökas ska systemet kunna simulera hur den nya risken påverkar tidigare drawdowns.

Exempel:

Historisk max DD:

-10R

Vid:

$150/R

motsvarar detta:

-$1,500

Om account/prop limits inte klarar motsvarande stress finns ingen scale rationale.

## Monte Carlo före Riskökning

När sample size är tillräckligt kan Monte Carlo-liknande simulation användas för att uppskatta distributionen av:

- drawdown
- losing streak
- challenge failure
under föreslagen nya risknivå.

## Risk of Ruin / Breach

Vi ska särskilt uppskatta risken att:

- internal limits
- prop maximum loss
- trailing drawdown
nås under realistiska trade sequences.

## Prop Firm Headroom

Prop firm-scaling måste ta hänsyn till reglerna för varje account.

Större account betyder inte automatiskt proportionellt större säker risk.

## Prop Firm Account Scaling

När en challenge är passerad kan nästa scalingsteg vara:

- större account
- ytterligare account
- nytt funded program
Varje nytt account ska ha egen deployment och ruleset verification.

## Flera Prop Accounts

Om Omnira senare hanterar flera prop accounts uppstår portfolio-level risk.

Exempel:

Samma MNQ trade kan exekveras på fem accounts samtidigt.

Det innebär större sammanlagd ekonomisk exposure även om varje konto följer sin egen limit.

## Global Exposure Layer

Vid multi-account behöver Risk Engine därför senare stödja global exposure.

Exempel:

Total live risk across accounts

Detta blir ett nytt scalingkrav.

## Copy Trading

Om samma Trade Proposal används på flera accounts ska execution fortfarande vara account-specifik.

Varje konto kan ha:

- olika headroom
- olika quantity
- olika prop rules
Ett account kan PASS medan ett annat DENY.

## No All-or-Nothing Multi-Account Assumption

Om fem accounts är kopplade och två inte får ta traden ska de två avstå.

Systemet får inte kringgå regler för att hålla accounts synkroniserade.

## Correlated Risk

Flera accounts som tar samma MNQ trade representerar i praktiken korrelerad risk.

Det ska behandlas som sådan.

## Multiple Strategies

När framtida Strategy #2 introduceras ska scale-up även ta hänsyn till korrelation mellan strategies.

Två strategies kan se diversifierade ut men ändå förlora samtidigt i samma market regime.

## Portfolio Risk

Det framtida Risk Engine-lagret ska därför kunna hantera:

- account risk
- strategy risk
- instrument risk
- portfolio risk
Men initial Strategy #1 kan börja enklare.

## Autonomy Scaling

Separat från kapitalrisk ska systemet kunna gå:

LIVE MANUAL

```
→
```

CONTROLLED LIVE AUTO

Detta kräver sin egen promotion gate.

## Controlled Live Automation Gate

Innan human approval per trade tas bort ska systemet minst ha visat:

- stabil live Strategy behavior
- stabil risk
- stabil Prop Engine
- stabil execution
- inga zero-tolerance incidents
- komplett audit
- fungerande alerts
- fungerande kill switches
- fungerande auto-downgrade
- relevant live sample
## Manual Approval Performance

Om manual approval fungerar bra finns inget krav att ta bort den.

Automation ska ge tydlig nytta.

Exempel:

- minskad latency
- färre missed trades
- mer konsekvent execution
utan att safety försämras.

## Automation Benefit Analysis

Vi ska kunna jämföra:

**Live Manual**

mot:

**simulated/observed automatic execution**

och fråga:

- hur mycket latency sparas?
- hur mycket R:R förbättras?
- hur många trades fångas?
- ökar technical risk?
## Automation är inte en belöning

Controlled Live Auto ska inte aktiveras som en medalj för bra performance.

Det ska aktiveras när det är den mest rationella executionmodellen.

## Automation Scope

Första Controlled Live Auto bör ha smal scope.

Exempel:

- ett account
- ett instrument
- en strategy
- en RiskProfile
- ett begränsat operation mode
## No Immediate Multi-Account Auto

När första account klarar automation ska vi inte automatiskt ge alla framtida accounts samma permission.

## Autonomy Rollback

Vid problem ska systemet snabbt kunna gå:

CONTROLLED LIVE AUTO

```
→
```

LIVE MANUAL

eller:

```
READ_ONLY
```

## Performance Degradation Gate

Om rolling performance tydligt försämras ska scale-up pausas.

Beroende på framtida policy kan automation också pausas.

## Statistical Thresholds

Exakta numeric thresholds för scaling ska inte hittas på innan systemet har verklig data.

Exempel på framtida thresholds kan beröra:

- minimum trade count
- minimum forward/live duration
- positive expectancy
- max tolerated drawdown
- incident-free window
Men dessa ska kalibreras mot Strategy v1.0.

## Varför vi inte låser siffrorna nu

Att idag säga:

Risk får öka efter exakt 100 trades.

skulle ge en falsk precision.

Om strategin endast tar några trades per vecka eller har hög variance kan 100 vara otillräckligt.

Om den producerar mycket fler oberoende observations kan andra kriterier vara mer relevanta.

## Evidence Scorecard

Varje framtida scale proposal bör ha ett scorecard.

Exempel:

**Strategy**

- expectancy
- PF
- drawdown
- sample
- regime stability
## Execution

- slippage
- latency
- incidents
- uptime
## Risk

- daily stop behavior
- headroom
- risk overruns
## Prop

- breach simulations
- actual compliance
## Safety

- zero-tolerance incidents
- reconciliation
- kill switch
## Scale Proposal

Riskökning ska behandlas som ett objekt.

Exempel:

SCALE-PROP-001

Det ska innehålla:

- current tier
- proposed tier
- reason
- evidence
- expected effect
- stress test
- approval
## Atlas Roll i Scaling

Atlas ska kunna förbereda analysen.

Exempel:

De senaste 184 live trades har expectancy +0.24R, inga critical execution incidents har inträffat under 73 dagar och observed max drawdown ligger inom historical simulation range. Candidate scale from Risk Tier 1 to Tier 2 kan därför granskas.

Atlas får föreslå.

Atlas får inte aktivera.

## Atlas ska även argumentera emot

Atlas ska aktivt söka motbevis.

Exempel:

Total performance är positiv men 61 % av vinsten kommer från två extrema trades och New York expectancy är negativ. Jag rekommenderar inte scaling ännu.

Detta är en viktig del av beslutsstödet.

## Self-Improvement och Scaling

Learning Layer får hitta förbättringar parallellt.

Men risk ska inte höjas samtidigt som en oprövad candidate strategy introduceras.

Vi ska helst veta vad vi skalar.

## Stable Canonical Period

Scale-up bör baseras på en stabil canonical version.

Om strategy rules precis har ändrats behöver den nya versionen egen evidens.

## Version Reset

Ny major strategy version kan innebära att vissa scaling assumptions måste omvärderas.

Autonomy och risk permission ska inte automatiskt ärvas.

## Risk Scaling och Edge Decay

Även en historiskt stark strategy kan tappa edge.

Därför ska scaling aldrig bli permanent i betydelsen:

När vi nått $X risk går vi aldrig ner.

Risknivå ska kunna omprövas.

## Periodic Scale Review

Även utan incident ska systemet regelbundet reviewa om nuvarande risk fortfarande är motiverad.

## Scaling och Withdrawal/Payout

Prop firm payout får inte automatiskt skapa högre risk.

Ekonomisk framgång ska inte förändra RiskProfile utan separat beslut.

## Scaling och Profit Cushion

Ett större profit cushion kan förändra prop firm headroom.

Det kan göra högre risk tekniskt möjlig.

Men det är inte samma sak som att högre risk är statistiskt motiverad.

## No House Money Effect

Systemet ska undvika resonemanget:

Vi handlar bara med vinsten nu.

Kapital som ligger på account är fortfarande kapital som riskeras.

## Scaling och Psychology

En systematisk tradingmotor ska minska psykologisk risk.

Det innebär bland annat att inte:

- öka risk efter vinnare av eufori
- öka risk efter förlust för recovery
- minska strategy discipline nära challenge target
## Scaling efter Losing Streak

Risk ska inte automatiskt höjas för att vinna tillbaka.

En längre losing streak kan snarare trigga:

```
REVIEW
```

## Scaling efter Winning Streak

Samma sak åt andra hållet.

Winning streak är inte automatiskt bevis på förbättrad edge.

## Scaling och Technical Capacity

När quantity blir större ska vi kontrollera om systemets execution fortfarande fungerar lika bra.

Exempel:

- fills
- slippage
- partial fills
En ny quantity tier kan därför kräva egen demo/live validation.

## Scale Test

Innan full riskökning kan ett litet intermediate tier användas.

Det fungerar som controlled experiment.

## Multi-Account Rollout

När flera accounts senare används bör rollout ske ett account i taget eller i små grupper.

Det minskar blast radius.

## Global Kill Switch blir ännu viktigare

När systemet skalar över flera accounts måste användaren snabbt kunna stoppa all ny execution.

## Portfolio Dashboard

Omnira ska senare kunna visa:

- total live exposure
- total risk
- accounts
- prop headroom
- strategies
- correlated exposure
Detta blir viktigt vid större scale.

## Scale-Down Triggers

Framtida explicit policy kan inkludera triggers som:

- critical incident
- abnormal drawdown
- persistent negative rolling expectancy
- prop rule changes
- execution degradation
Dessa kan resultera i:

- risk reduction
- automation suspension
- read-only
## Scale Freeze

Vid osäkerhet kan systemet sätta:

```
SCALING_FROZEN
```

Trading kan eventuellt fortsätta på nuvarande nivå.

Men ingen ytterligare riskökning får ske.

## Freeze är inte Kill

Detta skiljer sig från kill switch.

```
SCALING_FROZEN
```

betyder:

Nuvarande godkända risk fortsätter, men ingen promotion till högre risk får ske.

## Governance Review

Varje större scale-up bör avslutas med explicit:

**APPROVE**

eller:

**REJECT**

eller:

**DEFER**

**DEFER**

DEFER betyder exempelvis:

Resultaten är lovande men sample size är ännu för liten.

Det är ett fullt legitimt beslut.

## Documentation

Varje scale-up ska dokumenteras i:

- audit
- RiskProfile
- performance report
- change history
## Rollback Criteria

När scale-up godkänns ska vi också definiera vad som skulle få oss att backa.

Detta förhindrar att vi bara tänker på uppsidan.

## Scaling History

Systemet ska kunna visa:

Tier 1

startdatum

```
→ result
→ promotion
```

Tier 2

startdatum

```
→ result
```

och så vidare.

## Atlas Market View

I UI ska aktuell risk/autonomy tier vara tydlig.

Exempel:

Live Mode: Controlled Auto

Risk Tier: 2

Risk per Trade: $X

Scale Status: VALIDATING

Next Tier: LOCKED

## No Hidden Scaling

Användaren ska aldrig upptäcka i efterhand att systemet ökat risk.

Alla ändringar ska vara explicita och synliga.

## Scale Governance och Self-Improvement

Atlas kan säga:

Data stödjer att vi testar högre risk.

Men Risk Scaling är inte en learning output som automatiskt går till production.

Det följer samma princip som strategy evolution:

```
Observe
→ Measure
→ Propose
→ Test
→ Review
→ Approve
```

## Långsiktigt mål

Målet är inte maximalt riskutnyttjande.

Målet är att hitta en nivå där:

- edge är bevisad
- drawdown är acceptabel
- prop constraints respekteras
- infrastructure är stabil
- risk of failure är rimlig
- systemet går att övervaka
## Skalning och företagsekonomi

När systemet senare hanterar verklig kapitalallokering ska beslut också kunna ta hänsyn till:

- prop challenge fees
- payouts
- account replacement cost
- infrastructure cost
- expected return
- failure probability
Det gör trading-systemet till ett kapitalallokeringssystem, inte bara en strategy bot.

## Scale Efficiency

Atlas ska kunna mäta om högre risk faktiskt ger proportionell förbättring i net outcome.

Om större execution size skapar betydligt högre slippage kan scaling efficiency sjunka.

## Optimal är inte Maximum

Den högsta möjliga risknivån behöver inte vara den bästa.

Systemets mål är robust långsiktig expectancy med kontrollerad downside.

## Scaling Principle

Den viktigaste principen är:

Risk ska förtjänas genom evidens.

Varje högre risknivå innebär att samma systemfel eller losing streak kostar mer.

Därför ska högre risk kräva starkare bevis än lägre risk.

## Kapitelstatus

Kapitel: 19 – Kriterier för uppskalning

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Scaling dimensions: Kapital + autonomi

Automatic risk increase: Förbjuden

Automatic autonomy increase: Förbjuden

Scale-down: Ska vara möjlig

Safety incidents: Kan blockera scaling oavsett profit

Performance gates: Multi-metric

Sample size: Obligatoriskt men exakta thresholds definieras senare

Regime/time coverage: Krävs

RiskProfile versioning: Obligatoriskt

Multi-account risk: Framtida portfolio layer

Atlas: Får rekommendera scaling, inte aktivera den

Rollback: Ska definieras vid varje större scale-up

Omnira Trading ska aldrig skala för att systemet känner sig framgångsrikt.

Det ska skala först när systemet kan visa varför högre risk är rationell.
