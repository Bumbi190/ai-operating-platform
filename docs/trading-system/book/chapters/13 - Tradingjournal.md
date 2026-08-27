# Kapitel 13 – Tradingjournal

Tradingjournalen är minnet i Omnira Trading System.

Den ska inte bara svara på:

Vann eller förlorade traden?

Den ska kunna svara på:

- vad såg Strategy Engine?
- vilken marknadskontext fanns?
- varför blev setupen giltig?
- vilken strategy version användes?
- vad analyserade Atlas?
- vad beslutade Risk Engine?
- vad beslutade Prop Firm Rules Engine?
- blev traden godkänd?
- hur exekverades den?
- vad gjorde marknaden efteråt?
- hur bra var själva beslutet?
- vad kan systemet lära sig?
Den centrala principen är:

Omnira ska journalföra hela beslutsprocessen, inte bara resultatet.

## Journalen som systemets historiska minne

Varje viktig tradinghändelse ska lämna ett spår.

Det gäller inte bara exekverade trades.

Omnira ska också journalföra:

- setups som aldrig blev färdiga
- setups som blev invalid
- Strategy Signals
- Trade Proposals
- nekade trades
- expired proposals
- break-even trades
- manual trades
- technical incidents
- compliance failures
- missed executions
Detta gör journalen användbar både för audit och self-improvement.

## Varför bara vinnare och förlorare inte räcker

Om systemet endast sparar exekverade trades förlorar vi stora delar av informationen.

Exempel:

En A+-setup kan identifieras men nekas på grund av daily stop.

Om den inte journalförs kan Atlas aldrig senare analysera:

Hur såg de nekade A+-setuperna ut?

eller:

Hur hade de utvecklats counterfactually?

Det betyder att även ett korrekt DENY är värdefull data.

## Journal Entity

Tradingjournalen ska bygga på strukturerade dataobjekt.

Ett journalobjekt kan exempelvis länka till:

- TradingAccount
- StrategyVersion
- MarketContext
- StrategySetup
- StrategySignal
- AIAnalysis
- RiskDecision
- PropDecision
- TradeProposal
- Approval
- ExecutionIntent
- Order
- Fill
- Position
- Trade
- MarketSnapshot
- ChartSnapshot
Journalen blir därmed en sammanhängande vy över flera tradingobjekt.

## Correlation ID

Hela beslutsflödet ska kunna följas via ett gemensamt correlation ID.

Exempel:

SETUP-001

```
→
```

SIGNAL-001

```
→
```

RISK-001

```
→
```

PROP-001

```
→
```

PROPOSAL-001

```
→
```

EXECUTION-001

```
→
```

TRADE-001

Det ska vara möjligt att från slutresultatet gå hela vägen tillbaka till den första marknadsobservationen.

## Journal för varje Setup

Varje identifierad setup ska få ett eget ID.

Exempel:

SETUP-2026-000124

Setupen ska kunna finnas även om någon trade aldrig tas.

## Setup Data

Journalen ska minst kunna registrera:

- strategy
- strategy version
- account
- instrument
- direction
- selected 4H-open
- session
- setup start
- setup end
- current state
- setup grade
- final status
## Market Context

Vid setupens start ska relevant market context sparas.

Exempel:

- current price
- 4H-open
- session
- volatility
- relevant liquidity
- FVG
- market regime
- news state
Detta gör senare jämförelser möjliga.

## Liquidity Journal

Om Strategy Engine identifierar liquidity ska journalen veta vilken typ det var.

Exempel:

- swing high
- swing low
- equal highs
- equal lows
- previous session high
- previous session low
- previous 4H high
- previous 4H low
- previous day high
- previous day low
- intermediate liquidity
Det ska inte bara stå:

liquidity present

## FVG Journal

För varje relevant FVG ska systemet kunna spara:

- timeframe
- direction
- upper boundary
- lower boundary
- creation time
- touch time
- status
Detta gör det möjligt att analysera om vissa FVG-typer fungerar bättre än andra.

## Manipulation Event

När manipulationen blir complete ska ett explicit event journalföras.

Exempel:

```
MANIPULATION_CONFIRMED
```

med:

- timestamp
- liquidity/FVG source
- direction
- price
- relevant context
Det ska gå att se exakt varför systemet gick vidare till 1m entryfas.

## 1m Entry Context

När systemet går ner på 1m ska följande kunna sparas:

- relevant 1m liquidity
- sweep status
- iFVG state
- CISD state
- SMT state
- confirmation candle
- confirmation time
Detta är viktigt eftersom entrylogiken är central för Strategy v1.0.

## Setup Grade

Journalen ska spara exakt grade.

Exempel:

A+

A

B

C

och vad som skapade graden.

Exempel:

iFVG = true

CISD = true

SMT = false

```
→
```

Grade A

På detta sätt kan Atlas senare mäta performance per komponent.

## Strategy Signal

När Strategy Engine producerar signal ska journalen spara:

- signal time
- direction
- entry
- SL
- target
- R:R
- grade
- strategy version
- rule evaluation
Strategy Signal är den rena strategidelen innan AI och risk.

## AI Analysis

Atlas analys ska sparas separat.

Det kan innehålla:

- summarized thesis
- supporting factors
- contradicting factors
- market regime assessment
- historical comparison
- uncertainty
- AI confidence där sådan används
- model version
- prompt/policy version
AI-texten ska inte ersätta strukturerade strategiobjekt.

## Risk Decision

Risk Engine-resultatet ska journalföras.

Minst:

- PASS/DENY
- risk per trade
- quantity
- daily loss used
- daily loss remaining
- open positions
- attempts used
- rule-by-rule result
- RiskProfile version
## Risk Denial

Om Risk Engine säger DENY ska setupen fortfarande följas.

Exempel:

DENY_REASON = DAILY_STOP

eller:

DENY_REASON = MINIMUM_POSITION_EXCEEDS_RISK

Detta ger värdefull rejected-trade-data.

## Prop Decision

Prop Firm Rules Engine ska journalföras separat.

Det ska kunna visa:

- ruleset version
- result
- failed rule
- headroom
- current account state
En prop denial ska inte blandas ihop med intern risk denial.

## Trade Proposal

Om setupen går vidare ska Trade Proposal sparas.

Exempel:

- proposed entry
- proposed SL
- proposed TP
- quantity
- risk
- R:R
- expiry
- proposal state
## Proposal Status

Proposal kan få state såsom:

- CREATED
- PENDING_APPROVAL
- APPROVED
- DENIED
- EXPIRED
- CANCELLED
- EXECUTED
State transitions ska journalföras.

## Human Approval

När human approval används ska journalen spara:

- decision
- user
- timestamp
- proposal version
- approval latency
Det ska gå att mäta hur approval påverkar execution quality.

## Automation Approval

I Demo Automation eller senare Controlled Live Automation ska journalen istället spara:

- automation policy
- policy version
- decision
- timestamp
Det ska aldrig stå bara:

approved automatically

utan vilken policy som gav behörighet.

## Execution Intent

När execution startar ska journalen länka till:

- execution ID
- proposal
- account
- symbol
- quantity
- requested SL
- requested TP
- execution mode
- timestamp
## Order

Orderobjektet ska lagra broker request/result.

Exempel:

- broker order ID
- requested quantity
- requested price
- order type
- status
- rejection reason
## Fill

Actual fill ska journalföras separat.

Minst:

- fill price
- fill quantity
- timestamp
- commission
- fees
- slippage
- broker deal ID
## Planned Entry vs Actual Fill

Båda ska bevaras.

Exempel:

**Planned Entry**

24,120.25

## Actual Fill

24,121.00

## Slippage

+0.75

Detta ska inte skrivas över till ett enda entryfält.

## Position Journal

När positionen är öppen ska systemet journalföra position management.

Exempel:

- initial SL
- initial TP
- current SL
- current TP
- break-even state
- current unrealized P/L
- MFE
- MAE
## Management Events

Varje viktig positionändring ska bli ett event.

Exempel:

```
BREAK_EVEN_TRIGGERED
SL_MODIFICATION_SENT
SL_MODIFICATION_CONFIRMED
NEWS_EXIT_TRIGGERED
TIME_EXIT_TRIGGERED
POSITION_CLOSED
```

## Break-Even

Canonical break-even-regeln ska journalföras exakt.

För long:

- nearest confirmed 1m swing high efter entry
- price takes swing
- BE trigger
- SL moved to entry
För short:

motsvarande swing low.

Journalen ska veta både trigger och broker confirmation.

## Break-Even Failure

Om systemet skickar BE modification men broker nekar ska det journalföras som technical incident.

Tradens data ska visa att intended state och actual state skiljde sig.

**MFE**

Maximum Favorable Excursion ska sparas.

MFE visar den största positiva rörelsen traden nådde innan exit.

Det ska normalt sparas i både:

- points/ticks
- R
där möjligt.

**MAE**

Maximum Adverse Excursion ska också sparas.

Detta gör det möjligt att analysera entry quality och stop behavior.

## Exit

När positionen stängs ska journalen innehålla:

- exit time
- exit price
- quantity
- fees
- reason
- final P/L
- final R
## Exit Reason

Exit reason ska vara strukturerad.

Exempel:

- TAKE_PROFIT
- STOP_LOSS
- BREAK_EVEN
- NEWS_EXIT
- TIME_EXIT
- EMERGENCY_CLOSE
- MANUAL_CLOSE
- PROP_PROTECTION
- UNKNOWN
## Final R

Trade performance ska alltid kunna uttryckas i R.

Exempel:

+2.18R

-1.00R

0.00R

Det gör jämförelser lättare mellan accounts och riskprofiler.

## Dollar Result

Parallellt ska actual dollar-resultat sparas.

Det ska baseras på:

- fills
- commissions
- fees
inte enbart theoretical price movement.

## Gross och Net

Journalen ska kunna skilja:

**Gross Result**

från:

**Net Result**

Detta gör execution costs synliga.

## Winner, Loser och Break-Even

Trade outcome ska kunna klassificeras:

- WIN
- LOSS
- BREAK_EVEN
Men denna enkla klassifikation ska aldrig ersätta final R.

## Decision Quality

Efter traden ska systemet kunna bedöma decision quality separat från outcome.

Exempel:

En -1R trade kan ha:

DECISION_QUALITY = VALID

om alla regler följdes.

En +2R trade som togs i strid med policy kan ha:

DECISION_QUALITY = INVALID

Resultat och beslutskvalitet är olika.

## Rule Adherence

Journalen ska kunna svara:

Följde systemet strategy v1.0 exakt?

Exempel:

- correct session
- correct manipulation
- correct confirmation
- correct grade
- correct entry
- correct SL
- correct TP
- correct news handling
- correct attempts
## Technical Quality

Separat ska systemet mäta technical execution quality.

Exempel:

- expected fill
- actual fill
- latency
- slippage
- modification success
- broker errors
Detta gör det möjligt att skilja Strategy Problem från Execution Problem.

## Manual Notes

Användaren ska kunna lägga till manuella anteckningar.

Dessa ska ligga som ett eget lager och inte skriva över systemdata.

Exempel:

Tyckte setupen visuellt såg ovanligt stökig ut.

Det kan senare bli researchinput.

## Atlas Post-Trade Review

Efter trade close ska Atlas kunna skapa en standardiserad review.

Exempel:

**Setup**

Grade A, New York.

## Execution

Fill 0.5 points över planned entry.

## Management

Break-even aktiverades efter närmaste 1m swing high.

## Outcome

+2.04R net.

## Decision Quality

Alla canonical rules följdes.

## Observation

Liknande setups ska jämföras mot tidigare 15m FVG-manipulationer.

## Atlas ska inte skriva om historiken

Om Atlas senare gör en ny analys ska originalanalysen bevaras.

Ny analys:

```
→ nytt analysis object.
```

Historisk text ska inte ersättas.

Det gör det möjligt att se hur Atlas analysförmåga förändras över tid.

## Chart Snapshot

Vid viktiga tradingstadier ska systemet kunna skapa chart snapshots.

Exempel:

- setup detected
- manipulation confirmed
- entry signal
- execution
- exit
Snapshot ska visa samma canonical objects som Atlas Market View.

## Screenshot är inte Source of Truth

Chart snapshot är mänskligt användbart.

Men analys ska primärt bygga på strukturerad data.

En PNG-bild ska inte vara enda beviset på vad systemet såg.

## Market Snapshot

Market Snapshot ska kunna innehålla maskinläsbar state.

Exempel:

- candles
- swings
- liquidity
- FVG
- SMT
- session
- current price
- news
- StrategyState
Detta gör replay möjligt.

## Reconstructible Trade

Målet är att en viktig trade ska kunna rekonstrueras.

Vi ska kunna fråga:

Visa exakt vad systemet visste två sekunder innan Strategy Signal skapades.

Detta kräver både tidsstämplad data och versionsinformation.

## Rejected Trades

Alla nekade Trade Proposals ska journalföras.

Denial reason kan exempelvis vara:

- RISK_DENY
- PROP_DENY
- NEWS
- RR_TOO_LOW
- MAX_ATTEMPTS
- OPEN_POSITION
- STALE_DATA
- EXECUTION_UNAVAILABLE
## Follow Rejected Trades

När möjligt ska systemet fortsätta följa marknaden efter en denied setup.

Detta skapar counterfactual research.

Exempel:

Actual Decision = DENY

Hypothetical Outcome = +2R

Det betyder inte att beslutet var fel.

## Missed Setups

Journalen ska också kunna registrera setups som aldrig blev trade på grund av:

- no confirmation
- setup expired
- invalidation
- session ended
- target no longer ≥2R
Detta är viktigt för strategy funnel analysis.

## Strategy Funnel

Omnira ska kunna mäta:

4H Contexts

```
→ Manipulations
→ 1m Confirmation
→ Strategy Signals
→ Risk Pass
→ Prop Pass
→ Proposals
→ Executions
→ Winners
```

Detta visar var trades filtreras bort.

## Attempt Tracking

Varje thesis ska veta:

- attempt 1
- attempt 2
- attempt 3
Efter loss kan nästa attempt länkas till samma thesis.

Efter winner eller BE ska inga nya attempts tillåtas enligt Strategy v1.0.

Journalen måste göra denna relation synlig.

## Thesis ID

Varje selected 4H-open kan skapa ett:

```
THESIS_ID
```

Exempel:

NQ-2026-08-27-1000-LONG

Samtliga attempts kan sedan länkas till samma thesis.

## Session Analytics

Journalen ska göra det möjligt att analysera:

- London
- New York
separat.

Det gäller både setups och trades.

## Grade Analytics

A+, A, B och C ska kunna jämföras.

Journalen måste därför spara grade även för denied/missed setups.

Annars får self-improvement ett snedvridet dataset.

## Direction Analytics

Long och short ska kunna jämföras.

## Liquidity Analytics

Systemet ska kunna analysera performance per liquiditytyp.

Exempel:

- previous day
- previous session
- 4H
- equal highs/lows
- intermediate
## FVG Analytics

Performance per:

- 5m FVG
- 15m FVG
ska kunna mätas.

## SMT Analytics

Journalen ska skilja mellan:

- SMT true
- SMT false
- SMT unknown
Detta är viktigt.

UNKNOWN får inte lagras som FALSE.

## Market Regime

När regime classification finns ska den lagras med setupen.

Exempel:

```
HIGH_VOLATILITY
```

Det gör senare segmentanalys möjlig.

## News Context

Journalen ska lagra:

- nearest relevant event
- time to event
- blackout state
- news provider
- policy version
Detta behövs för att bevisa att newsregler följdes.

## Risk History

Daily risk state ska journalföras över tid.

Exempel:

09:00 = $0 loss

10:30 = -$150

11:15 = -$300

```
12:04 = -$450 → DAILY_STOP
```

Det gör riskincidenter rekonstruerbara.

## Prop Firm History

Samma gäller prop firm headroom.

Exempel:

- equity
- maximum-loss floor
- daily loss
- consistency
- position limits
Systemet ska kunna visa varför en trade var tillåten eller förbjuden vid exakt den tidpunkten.

## Imported Historical Trades

Trades som importeras från MT5 men inte skapats av Omnira ska markeras tydligt.

Exempel:

ORIGIN = IMPORTED

eller:

```
MANUAL_EXTERNAL
```

De får inte automatiskt räknas som Strategy v1.0-resultat.

## Demo och Live separeras

Journaldata ska alltid innehålla environment.

Exempel:

- BACKTEST
- SHADOW
- DEMO
- LIVE
Performance från dessa miljöer ska inte blandas omedvetet.

## Strategy Version separeras

Trade från:

v1.0

och:

v1.1

ska analyseras separat.

En strategy update får inte retroaktivt ändra gamla trade labels.

## Risk Version separeras

Även RiskProfile version ska lagras.

Det gör att Atlas kan analysera hur riskförändringar påverkade resultat.

## Prop Profile Version separeras

Samma gäller PropFirmProfile.

## Data Version

Viktiga researchresultat ska kunna kopplas till data/provider version.

Detta stärker reproducerbarheten.

## Code Version

När möjligt ska journalen även kunna referera till relevant code/build version.

Det gör debugging enklare.

## Incident Journal

Technical incidents ska finnas i samma övergripande auditmiljö.

Exempel:

- runner disconnect
- duplicate prevention triggered
- SL modification failed
- data outage
- wrong account
- reconciliation mismatch
## Trading Loss vs System Incident

Journalen ska tydligt skilja:

**Market Loss**

från:

**System Failure**

Detta är avgörande för kvalitetsanalys.

## Compliance Incident

Prop firm-regelbrott ska klassificeras separat.

Det ska betraktas som:

```
COMPLIANCE_INCIDENT
```

inte bara dålig trade performance.

## Immutable Journal

Historiska journalhändelser ska i princip vara append-only.

Om något behöver korrigeras ska ett correction event skapas.

Originalet ska finnas kvar.

## Correction

Exempel:

Felaktig tidigare label:

Grade B

korrigeras senare till:

Grade A

Journalen ska visa:

- original value
- corrected value
- reason
- who/what corrected
- timestamp
Detta är viktigare än att historiken ser "ren" ut.

## Audit Trail

För varje live-trade ska systemet kunna skapa en komplett audit trail.

Det ska kunna användas för:

- debugging
- governance
- prop firm review
- performance analysis
- strategy research
## Searchable Journal

Atlas ska kunna söka i journalen strukturerat.

Exempel:

Visa alla Grade A New York long setups efter 15m FVG där SMT saknades.

eller:

Visa alla trades där attempt 2 gav bättre outcome än attempt 1.

Detta kräver strukturerade fields, inte bara fritext.

## Journal UI

Omnira Trading ska ha en tydlig journalvy.

Användaren ska kunna filtrera efter:

- date
- instrument
- session
- grade
- direction
- strategy version
- outcome
- environment
- denial reason
## Trade Detail View

En trade ska kunna öppnas som en timeline.

Exempel:

**10:00:00**

4H thesis started

## 10:14:00

15m FVG touched

## 10:21:00

Manipulation confirmed

## 10:24:00

iFVG + CISD

## 10:24:01

Strategy Signal

## 10:24:02

Risk PASS

## 10:24:02

Prop PASS

## 10:24:03

Proposal created

## 10:24:08

Approved

## 10:24:09

Execution sent

## 10:24:09

Filled

## 10:41:00

Break-even activated

## 11:06:00

Take Profit

Detta gör hela systemet transparent.

## Atlas Journal Summary

Atlas ska kunna sammanfatta dagen.

Exempel:

Idag identifierades 7 setups. Tre nådde Strategy Signal. En nekades på daily risk och två exekverades. Resultatet blev +1.05R netto. Båda exekverade trades följde canonical rules utan technical incidents.

## Weekly Review

Atlas ska senare kunna skapa strukturerad veckoreview.

Exempel:

- total setups
- executed trades
- denied trades
- expectancy
- grades
- sessions
- largest drawdown
- incidents
- emerging findings
## Monthly Review

Månadsreview kan dessutom inkludera:

- statistical stability
- strategy drift
- regime changes
- execution degradation
- research hypotheses
## Learning Dataset

Journalen blir den viktigaste källan till Atlas Trading Learning & Improvement Layer.

Learning Layer ska inte behöva läsa ostrukturerade screenshots och försöka förstå allt från början.

Journalen ska redan ha gjort beslutet maskinläsbart.

## Lär från alla beslut

Atlas ska lära från:

- taken
- denied
- expired
- missed
- invalidated
Detta minskar selection bias.

## Counterfactual Dataset

Denied och missed setups kan skapa ett separat counterfactual dataset.

Det ska hållas tydligt separerat från actual realized performance.

## Research Finding

Atlas kan exempelvis skapa finding:

Grade C producerade negativ expectancy i 312 historiska och 67 forward setups.

Finding ska innehålla:

- source sample
- strategy version
- date range
- methodology
- result
- confidence
## Hypothesis

Finding kan därefter skapa:

```
HYPOTHESIS
```

Exempel:

Testa candidate där Grade C inte är execution-eligible.

Den går vidare till separat validation.

## Journalen ändrar inte strategin

Journal och analytics beskriver vad som hänt.

De ändrar inte productionregler.

Detta bevarar separationen mellan:

**Observation**

och:

**Authority**

## Datakvalitet i Journalen

Journalposten ska kunna markera om data quality vid beslutet var:

- VALID
- SUSPECT
- DEGRADED
En trade från dålig data ska inte utan vidare räknas tillsammans med normal performance.

## Missing Journal Data

Om kritiska fields saknas i live mode ska detta kunna flaggas.

Ett system som tjänar pengar men inte kan förklara sina trades är inte redo för högre autonomi.

## Journal Completeness

Omnira ska senare kunna mäta:

journal completeness score

inte som trading signal utan som operational metric.

Målet för live should vara mycket nära fullständig auditability.

## Privacy och Secrets

Journalen får inte innehålla:

- account passwords
- API secrets
- privata credentials
Account IDs kan pseudonymiseras i exporter där det behövs.

## Export

Journaldata ska senare kunna exporteras för:

- research
- backup
- human review
- external analysis
Export ska behålla versionsmetadata.

## Backup

Tradingjournalen är affärskritisk data.

Den ska därför ingå i backup- och recovery-plan.

En förlorad journal innebär inte bara förlorad historik.

Det innebär förlorad tränings- och auditdata för hela systemet.

## Retention

Live trade records, audit events och relevanta snapshots ska bevaras långsiktigt.

Stora råa tickdatasets kan ha separat retentionpolicy.

## Journalens roll i autonomi

Ju mer autonomt systemet blir, desto viktigare blir journalen.

När människan inte längre godkänner varje trade måste det ändå i efterhand gå att förstå:

- varför beslutet skapades
- vilka regler som gällde
- om safety gates passerades
- vad som exekverades
- vad resultatet blev
Autonomi får inte minska transparensen.

Den ska öka kraven på den.

## Den centrala journalprincipen

Omnira ska följa:

If it influenced a trading decision, it should be observable later.

Det betyder inte att varje teknisk byte måste sparas för alltid.

Men varje meningsfullt beslut, state transition och säkerhetskontroll ska kunna rekonstrueras.

## Kapitelstatus

Kapitel: 13 – Tradingjournal

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Journalmodell: Strukturerad och eventbaserad

Exekverade trades: Journalförs

Nekade trades: Journalförs

Missade/invalidated setups: Journalförs

MFE/MAE: Obligatoriskt för analys där data stödjer det

Decision Quality: Separat från Outcome

Strategy/Risk/Prop versions: Bevaras

Snapshots: Strukturerade + visuella

Audit trail: Obligatorisk

Self-improvement source: Tradingjournalen är primär datakälla

Tradingjournalen ska göra varje viktig tradingprocess till ett analyserbart, sökbart och reproducerbart historiskt objekt.
