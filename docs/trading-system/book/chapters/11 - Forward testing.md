# Kapitel 11 – Forward testing

Forward testing är steget där Omnira Trading System lämnar den rena historiska simulationen och börjar möta verklig marknadsdata i realtid.

Detta är en avgörande fas.

En strategi kan se stark ut i backtest men ändå misslyckas när den möter:

- verklig latency
- verkliga spreads
- verkliga brokerförhållanden
- realtidsdata
- MT5-synkronisering
- marknadsförändringar
- execution delays
- tekniska avbrott
- faktisk operationell komplexitet
Forward testing ska därför inte ses som en formalitet efter ett lyckat backtest.

Det är en ny och separat bevisfas.

Den centrala principen är:

Forward testing ska bevisa att det system vi faktiskt byggt fungerar i verklig drift, inte bara att strategin såg bra ut historiskt.

## Vad forward testing ska validera

Forward testing ska validera både:

**Strategin**

och:

**Systemet runt strategin**

Det innebär att vi ska testa:

- realtime Market Data
- Strategy Engine
- Atlas Analysis
- Risk Engine
- Prop Firm Rules Engine
- Trade Proposal
- Approval flow
- Windows Execution Runner
- MT5 synchronization
- Journal
- Analytics
- Reconciliation
- Kill switches
- Failure handling
En strategi kan vara bra samtidigt som systemet runt den är dåligt.

Båda måste fungera.

## Forward Test är inte Live Trading

Forward testing ska initialt ske utan verklig kapitalrisk.

De första miljöerna är:

- Analysis Only
- Shadow Mode
- Demo / Paper Trading
Live trading kommer senare.

## Analysis Only

I Analysis Only får systemet:

- läsa realtime market data
- identifiera setups
- skapa Strategy Signals
- köra AI Analysis
- köra Risk Engine
- köra Prop Firm Rules Engine
- skapa hypotetiska Trade Proposals
- journalföra allt
Ingen order skickas.

Detta är den säkraste första realtime-fasen.

## Shadow Mode

Shadow Mode innebär att systemet beter sig som om det skulle handla men inte exekverar.

Systemet ska registrera:

- planned entry
- planned quantity
- planned SL
- planned TP
- expected execution time
- expected costs
- expected result
Därefter följer systemet marknaden och beräknar hur traden hade utvecklats.

Shadow Mode är särskilt värdefullt innan demo execution eftersom det testar:

- realtime strategy behavior
- timing
- state transitions
- logging
- UI
- analysis
utan brokerexecution.

## Demo Trading

Efter att Shadow Mode fungerar stabilt får systemet gå vidare till demo.

I demo kan Omnira:

- skapa riktiga orders i MT5 demo
- läsa actual fills
- mäta latency
- mäta slippage
- testa SL/TP
- testa break-even
- testa news exit
- testa time exit
- testa reconciliation
- testa restart recovery
Ingen riktig kapitalrisk ska finnas.

## Forward Test Modes

En lämplig progression är:

```
Mode 1 – Analysis Only
→
```

```
Mode 2 – Shadow Mode
→
```

```
Mode 3 – Demo Manual Approval
→
```

## Mode 4 – Demo Automation

Varje mode ska ha egna acceptance criteria.

Ingen fas ska hoppas över bara för att tidigare backtest såg bra ut.

## Realtime Market Data

Forward test ska använda samma typ av realtime-data som senare production.

Detta gör att vi kan upptäcka skillnader mellan:

- historical data
- MT5 data
- broker timestamps
- current contracts
- session boundaries
Strategy Engine ska få canonical data genom Market Data Layer.

## Data Freshness

Forward testing ska aktivt mäta:

- senaste market timestamp
- ingestion latency
- missing bars
- duplicates
- reconnects
- stale events
Om realtime data inte är healthy ska systemet inte producera executable state.

## Time Handling

Forward testing är en viktig kontroll av timezone-logiken.

Systemet ska verifiera att:

- 02:00 New York öppnar rätt trading window
- 05:00 stänger rätt London-entry window
- 10:00 öppnar New York-window
- 12:00 stänger New York-entry window
- daylight saving transitions fungerar
- daily risk reset sker rätt
Dessa regler ska testas i faktisk realtime-drift.

## Realtime Strategy State

Atlas Market View ska visa Strategy Engine state live.

Exempel:

```
WAIT_FOR_4H_OPEN
→
IDENTIFY_TARGETS
→
WAIT_FOR_MANIPULATION
→
MANIPULATION_CONFIRMED
→
WAIT_FOR_CONFIRMATION
→
STRATEGY_SIGNAL
```

Detta gör det möjligt att manuellt kontrollera att systemet verkligen följer strategin.

## Visual Verification

Under tidig forward testing ska användaren kunna jämföra:

- vad Atlas Market View visar
- vad en erfaren trader ser på TradingView eller annan referenschart
Detta är särskilt viktigt för:

- liquidity
- FVG
- swing points
- manipulation
- iFVG
- CISD
- SMT
Avvikelser ska dokumenteras.

## Golden Realtime Cases

Precis som i backtesting ska vissa realtime setups markeras som särskilt värdefulla exempel.

När systemet identifierar en tydlig drömsetup kan den sparas som:

```
FORWARD_GOLDEN_CASE
```

Den kan senare användas som regressionstest.

## Negative Realtime Cases

Vi ska även spara situationer där systemet korrekt avstår.

Exempel:

- news blackout
- R:R under 2
- saknad confirmation
- fel session
- max attempts nådd
- position redan öppen
- risk denied
Dessa är viktiga bevis på att systemet respekterar reglerna.

## Forward Test Journal

Varje realtime setup ska journalföras med samma struktur som senare live.

Det innebär minst:

- setup
- strategy version
- session
- market context
- liquidity
- FVG
- manipulation
- confirmations
- setup grade
- planned entry
- planned SL
- planned TP
- risk
- AI analysis
- RiskDecision
- PropDecision
- result
Forward test-data ska inte behandlas som tillfälliga utvecklingslogs.

Det är researchdata.

## Shadow Fill Model

I Shadow Mode måste systemet använda en tydlig executionmodell.

Det ska inte bara anta:

```
fill = strategy entry
```

Vi kan simulera:

- current bid/ask
- commission
- slippage
- latency
Detta gör Shadow Mode mer realistiskt.

## Demo Fill Data

I Demo Mode ska faktisk MT5 fill användas.

Systemet ska jämföra:

**Planned Entry**

mot:

**Actual Demo Fill**

Skillnaden journalförs som execution slippage.

## Manual Approval Forward Test

Demo Manual Approval ska testa hela människan-i-loopen-processen.

Användaren ska se Trade Proposal och aktivt godkänna.

Systemet ska mäta:

- signal time
- proposal time
- approval time
- execution time
- fill time
Detta gör det möjligt att mäta human latency.

## Human Latency

Manual approval kan påverka en snabb 1m-strategi.

Det måste mätas istället för att antas vara acceptabelt.

Exempel:

Om median approval tar:

37 sekunder

och detta regelbundet försämrar R:R eller entry quality kan manual approval visa sig vara olämplig för vissa setups.

Det är ett faktiskt systemfynd.

## Approval Expiry

Trade Proposal ska expire om marknaden förändrats för mycket eller om proposal blivit för gammal.

Forward testing ska hjälpa till att kalibrera en realistisk expiry-policy.

Den ska inte väljas enbart teoretiskt.

## Demo Automation

När manual demo execution fungerar stabilt kan systemet aktivera Demo Automation.

I detta läge behövs ingen explicit human approval per trade.

Alla andra lager måste fortfarande passera.

Det innebär:

**Strategy PASS**

## Risk PASS

## Prop Firm PASS

```
Automation Policy PASS
→
```

Execution

## Demo Automation är en stor gate

Demo Automation är första gången hela tradingkedjan får arbeta självständigt.

Det ska därför kräva att systemet redan bevisat:

- korrekt strategy detection
- korrekt risk
- korrekt account sync
- korrekt MT5 execution
- duplicate protection
- reconciliation
- kill switch
- logging
- position management
## Ingen Live direkt från Shadow Mode

Systemet får inte gå:

Shadow Mode

```
→
```

Live

bara för att strategin ser bra ut.

Demo execution behövs för att testa den verkliga executionkedjan.

## Realtime Risk Engine

Risk Engine ska köras på riktig realtime account state under demo.

Det innebär att vi ska verifiera:

- $150 risk
- $450 daily stop
- 1 position max
- 3 attempts max
- minimum contract risk
- daily reset
- active position state
Riskregler ska inte endast testas i unit tests.

De ska även verifieras i verklig demo-drift.

## Daily Stop Test

Vi ska aktivt testa daily stop.

På demo kan systemet medvetet sättas upp så att threshold nås under kontrollerade former.

Vi ska verifiera att:

- nya trades blockeras
- status visas korrekt
- öppen position hanteras enligt policy
- reset sker korrekt
- state överlever restart
## Prop Firm Simulation

Även innan ett verkligt prop firm-konto används kan forward test använda en virtuell Prop Firm Profile.

Exempel:

50k challenge simulation

Det gör att systemet kan utvärdera:

- max loss
- daily limits
- challenge survival
- rule headroom
utan att riskera en riktig challenge.

## News Forward Test

News policy måste verifieras mot riktig kalenderdata i realtid.

Systemet ska kunna demonstrera att:

- ny trade blockeras T-1h
- blackout kvarstår till T+4h
- befintlig position stängs T-15m
- calendar state är korrekt
- timezone är korrekt
Detta är en viktig production gate.

## News Provider Failure

Forward testing ska även inkludera scenario där news-data försvinner.

Expected behavior:

```
NEWS_STATE_UNKNOWN
```

och:

**NO NEW EXECUTION**

Systemet ska visa detta tydligt.

## Break-Even Testing

Canonical break-even-regeln ska testas på demo.

Vi ska verifiera att:

- rätt 1m swing identifieras
- trigger sker vid rätt tid
- SL modification skickas
- MT5 bekräftar ändringen
- journal uppdateras
- Atlas Market View visar rätt state
## Break-Even Failure

Vi ska även simulera eller fånga fall där broker nekar modification.

Systemet ska då:

- inte anta att SL är flyttad
- visa incident
- uppdatera actual broker state
- blockera felaktiga assumptions
## Time Exit Testing

New York-positioner ska testas mot:

max 4 timmar

Vi ska verifiera att systemet stänger korrekt och journalför:

```
TIME_EXIT
```

## London Position Testing

London-trades kan fortsätta längre.

Forward test ska kontrollera att systemet inte felaktigt stänger dem bara för att entry-window har stängt.

## Re-entry Testing

Max tre attempts per thesis ska testas live/demo.

Systemet måste hålla korrekt attempt count även efter:

- restart
- reconnect
- loss
- re-entry
Attempt count får inte återställas av processrestart.

## Opposite Setup Testing

När position är öppen ska motsatt setup ignoreras enligt Strategy v1.0.

Forward testing ska bekräfta detta.

Systemet ska gärna journalföra den observerade motsatta setupen för research utan att exekvera den.

## Reconciliation Testing

Demo är rätt plats att utsätta reconciliation för riktiga fel.

Exempel:

- starta om runner
- starta om MT5
- bryt nätverk
- reconnect
- skapa manual demo position
Systemet ska återställa korrekt state innan ny trading.

## Manual Position Test

En manuell demo-position kan öppnas direkt i MT5.

Omnira ska då upptäcka:

```
MANUAL_EXTERNAL
```

eller:

```
UNKNOWN_POSITION
```

och följa definierad riskpolicy.

Detta är ett viktigt säkerhetstest.

## Duplicate Execution Test

Systemet ska aktivt försöka skicka samma execution intent flera gånger i testmiljö.

Resultat ska vara:

**exakt en order**

Detta är en obligatorisk gate före live.

## Network Failure Test

Forward testing ska inkludera:

- Omnira disconnect
- runner disconnect
- MT5 disconnect
- broker disconnect
Vi ska dokumentera vad som händer med:

- nya trades
- öppna positions
- reconciliation
- journal
## Restart Test

Runnern ska kunna startas om medan en demo-position är öppen.

Efter restart ska systemet:

- identifiera position
- verifiera SL/TP
- återställa state
- återuppta övervakning
utan duplicate execution.

## Outage med Broker-Native Protection

Testerna ska demonstrera värdet av broker-native SL/TP.

Om Omnira försvinner ska dessa protections fortfarande ligga hos broker.

Active management kan däremot pausas.

Detta ska dokumenteras som residual risk.

## Residual Risk

Ingen architecture eliminerar all risk.

Forward testing ska identifiera kvarvarande risker.

Exempel:

- gap genom SL
- broker outage
- internet outage nära news exit
- MT5 malfunction
- execution slippage
- unavailable calendar
- corrupted provider data
Dessa ska dokumenteras.

## Technical Incidents

Forward Test ska skilja mellan:

**Trading Loss**

och:

**Technical Incident**

Exempel:

En korrekt exekverad -1R trade är en trading loss.

En trade med fel quantity är ett technical incident.

Dessa får inte blandas ihop.

## Incident Log

Technical incidents ska registreras med:

- type
- severity
- timestamp
- affected component
- affected trade
- root cause
- resolution
- recurrence prevention
Systemet måste visa att incidentfrekvens minskar innan live.

## Performance Metrics

Forward testing ska använda samma grundmetrics som backtest:

- trade count
- win rate
- expectancy
- average R
- profit factor
- drawdown
- losing streak
- MFE
- MAE
Men dessutom tekniska metrics:

- execution latency
- slippage
- rejection rate
- runner uptime
- data outages
- reconciliation errors
## Backtest vs Forward Test

Atlas ska kunna jämföra:

**Backtest**

och:

**Forward Test**

Exempel:

Backtest expectancy = +0.31R

Forward expectancy = +0.28R

Det kan vara rimligt.

Om forward istället visar:

-0.19R

måste skillnaden undersökas.

## Performance Degradation

En viss försämring från backtest till forward test är förväntad.

Orsaker kan vara:

- costs
- slippage
- latency
- changing market conditions
- data differences
Systemet ska försöka förklara degradation.

## Forward Test ska inte optimeras medan det kör

När en forward test-version startas ska strategy och risk configuration låsas.

Om vi ändrar regler mitt i testet är det inte längre samma test.

En materiell ändring ska starta:

New ForwardTestRun

## ForwardTestRun

Varje forward test ska ha:

- test ID
- strategy version
- config version
- risk profile
- prop profile
- environment
- start
- end
- mode
- account
- runner version
- code version
Detta gör testet reproducerbart och auditerbart.

## Minimum Duration

Vi ska inte godkänna forward test efter några få bra dagar.

Exakt minimum ska beslutas senare baserat på:

- trade frequency
- sample size
- market regimes
- strategy behavior
Både tid och antal trades är relevanta.

## Sample Size

Forward test ska tydligt visa sample size.

Om systemet bara fått:

17 trades

ska Atlas inte kalla resultatet robust.

## Regime Coverage

Testperioden ska helst innehålla flera olika marknadsförhållanden.

Exempel:

- trend
- range
- high volatility
- low volatility
Detta kan kräva längre testtid än vi först hoppas.

## Session Coverage

Både London och New York ska få tillräcklig forward-testdata innan full strategy approval.

Annars kan en session vara relativt oprövad.

## Grade Coverage

A+, A, B och C ska följas separat även i forward test.

Vi ska se om backtestens relation mellan grades kvarstår i realtime.

## Attempt Coverage

Attempt 1, 2 och 3 ska följas separat.

Om attempt 3 beter sig helt annorlunda forward än historiskt ska det analyseras.

## Execution Cost Validation

Demo och senare controlled live ska användas för att verifiera om cost-modellen från backtest var realistisk.

Exempel:

expected slippage

mot:

observed slippage

Skillnaden används för att förbättra framtida simulation.

## Self-Improvement under Forward Test

Atlas Learning Layer får samla och analysera data under forward test.

Den får skapa:

- findings
- hypotheses
- candidate versions
Men den aktiva testversionen ska förbli låst.

Detta hindrar att testet förändras medan det mäts.

## Candidate Discovery

Atlas kan exempelvis upptäcka:

B-grade har hittills stark forward expectancy medan C-grade fortsätter underprestera.

Detta är ett finding.

Det betyder inte att C stängs av mitt i testet.

## Test Integrity

För att forward test ska ha värde måste vi kunna säga:

Den här versionen kördes oförändrad under testperioden.

Detta är lika viktigt som performance.

## Shadow vs Demo Comparison

När både shadow och demo finns ska vi kunna jämföra:

- theoretical fill
- demo fill
- outcome difference
Detta hjälper oss kalibrera simulation.

## Manual vs Automated Demo

Systemet ska senare kunna jämföra:

**Manual Approval Demo**

mot:

**Automated Demo**

Skillnader kan finnas i:

- latency
- slippage
- missed trades
- performance
Detta blir viktig evidens inför automation.

## Forward Testing av Atlas

AI-lagret ska också utvärderas.

Vi ska mäta:

- kvalitet på explanations
- consistency
- hallucination rate
- unknown handling
- market regime classification
- historical comparison correctness
Atlas ska inte gå till live decision support bara för att Strategy Engine fungerar.

## AI Hallucination Incident

Om Atlas påstår att:

SMT confirmed

när strukturerad data säger:

SMT = UNKNOWN

är detta ett AI quality incident.

Det ska loggas.

UI source of truth ska fortfarande visa canonical state.

## Forward Testing av Prop Firm Engine

Virtual eller demo Prop Firm Profile ska användas för att verifiera:

- headroom
- resets
- drawdown calculations
- denials
- UI explanation
Det är särskilt viktigt innan en betald challenge används.

## Challenge Simulation

När Prop Firm Engine är klar ska historiska eller forward trades kunna köras genom en challenge simulation.

Vi ska kunna uppskatta:

- pass rate
- fail reason
- days to target
- drawdown breaches
- risk efficiency
## Go/No-Go Gate

Varje forward-testfas ska avslutas med ett explicit beslut:

**PASS**

**FAIL**

eller:

**INCONCLUSIVE**

**PASS**

Forward test PASS betyder att den aktuella fasens definierade kriterier är uppfyllda.

Det betyder inte automatiskt att nästa fas är live.

**FAIL**

FAIL ska dokumenteras.

Systemet ska inte försöka dölja tekniska eller tradingmässiga problem.

Efter fix krävs ny testversion där det är relevant.

**INCONCLUSIVE**

Exempel:

- för få trades
- för kort tid
- för homogen market regime
- data outage
- stora systemförändringar under testet
Då behöver testet fortsätta eller startas om.

## Demo Automation Gate

Innan Demo Automation får aktiveras ska minst följande vara verifierat:

- Analysis Mode stable
- Shadow Mode stable
- MT5 Read Only stable
- strategy detection verified
- Risk Engine verified
- Prop Firm Engine verified
- manual demo execution stable
- duplicate protection
- reconciliation
- restart recovery
- SL/TP handling
- break-even
- news exit
- time exit
- kill switch
## Controlled Live är senare

Även ett starkt Demo Automation-resultat ska följas av en separat Controlled Live-process.

Live innebär nya risker:

- riktiga pengar
- verklig psykologi
- prop firm enforcement
- live broker behavior
Det behandlas i ett senare kapitel.

## Dokumenterad Evidens

Varje promotion mellan modes ska stödjas av dokumenterad evidens.

Inte:

Det känns stabilt nu.

Utan:

- test IDs
- trade count
- uptime
- incident count
- performance
- failure tests
- acceptance criteria
## Atlas Forward Test Dashboard

Omnira ska senare kunna visa en central forward-test dashboard.

Exempel:

Strategy: v1.0
Mode: Demo Manual Approval
Days: 34
Trades: 87
Expectancy: +0.24R
Profit Factor: 1.41
Max DD: -6.2R
Execution incidents: 1
Duplicate orders: 0
Reconciliation failures: 0

Status: RUNNING

Det gör utvecklingen transparent.

## Forward Test Timeline

Systemet ska kunna visa progressionen:

```
Analysis
→ Shadow
→ Demo Manual
→ Demo Auto
```

med:

- startdatum
- slutdatum
- version
- outcome
- sign-off
## Forward Test och boken

Större resultat och lärdomar ska dokumenteras i projektets bok.

Boken ska därför fungera även som utvecklingsjournal.

Exempel:

Strategy v1.0 klarade Shadow Mode men manual approval producerade för stor entry latency. Demo Automation introducerades därför som nästa experiment efter separat safety validation.

På så sätt bevaras varför arkitekturval gjordes.

## Första Forward Test-målet

Det första forward-testmålet är inte att tjäna pengar.

Målet är att visa:

Omnira kan observera marknaden i realtid, följa Canonical Strategy v1.0 konsekvent, dokumentera varje beslut och reproducera förväntat beteende utan att skicka en order.

Detta är Analysis Only / Shadow Gate.

## Andra Forward Test-målet

Nästa mål är:

Omnira kan genomföra samma beslut genom ett MT5 demo-konto med korrekt risk, execution och reconciliation.

Detta är Demo Manual Gate.

## Tredje Forward Test-målet

Därefter:

Omnira kan själv genomföra samma pipeline på demo utan human approval och utan att bryta strategy-, risk-, prop-, execution- eller safety-regler.

Detta är Demo Automation Gate.

## Forward Testing Principle

Den viktigaste principen är:

Forward testing ska mäta skillnaden mellan hur vi tror att systemet fungerar och hur det faktiskt fungerar när tiden går framåt.

Backtest ger historisk evidens.

Forward test ger operationell evidens.

Båda krävs.

## Kapitelstatus

Kapitel: 11 – Forward testing

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Första mode: Analysis Only

Andra mode: Shadow Mode

Tredje mode: Demo Manual Approval

Fjärde mode: Demo Automation

Live: Ej tillåtet

Strategy: Canonical v1.0

ForwardTestRun: Planerad

Acceptance criteria: Ska konkretiseras inför implementation

Self-improvement: Aktiv forskning tillåten

Self-modification under test: Förbjuden

Forward testing ska bevisa både strategy behavior och teknisk drift innan Omnira får närma sig verklig kapitalrisk.
