# Kapitel 17 – Demofas

Demofasen är den första fas där Omnira Trading System får exekvera riktiga orders genom providern, men utan att verkligt kapital står på spel.

Detta är en avgörande övergång.

Fram till denna punkt har systemet främst bevisat att det kan:

- förstå strategy rules
- läsa market data
- skapa signals
- analysera risk
- simulera trades
- hantera historik
- genomföra backtest
- genomföra forward test utan verklig kapitalrisk
Demofasen ska bevisa att hela kedjan fungerar tillsammans i faktisk drift.

Den centrala principen är:

Demo är inte en lekplats. Demo är en verifieringsmiljö för samma system som senare kan få live authority.

## Demofasen i systemets progression

Den rekommenderade ordningen är:

```
Analysis Only
→
```

```
Shadow Mode
→
```

```
Demo Manual Approval
→
```

## Demo Automation

Först därefter får Controlled Live övervägas.

## Analysis Only

Analysis Only är den första realtime-fasen.

Systemet får:

- läsa market data
- identifiera setups
- skapa Strategy Signals
- köra AI Analysis
- köra Risk Engine
- köra Prop Firm Rules Engine
- skapa hypotetiska Trade Proposals
- journalföra hela processen
Men:

**ingen order får skickas.**

## Målet med Analysis Only

Målet är att verifiera att Strategy Engine i realtime gör samma sak som vi förväntar oss från dokumentation och backtest.

Vi ska kunna kontrollera:

- rätt 4H-open
- rätt session
- rätt liquidity
- rätt FVG
- rätt manipulation
- rätt 1m confirmation
- rätt setup grade
- rätt entry
- rätt SL
- rätt TP
- rätt R:R
- rätt news policy
- rätt re-entry state
## Analysis Only Acceptance Criteria

Fasen ska inte betraktas som godkänd förrän systemet konsekvent kan:

- använda korrekt timezone
- identifiera rätt trading windows
- hantera realtime candles
- undvika duplicate signals
- journalföra state transitions
- visa samma state i Atlas Market View
- hantera stale/missing data korrekt
- undvika look-ahead
- producera reproducerbara signals
## Shadow Mode

Shadow Mode är nästa steg.

Systemet beter sig som om det skulle exekvera, men skickar fortfarande ingen order.

Det ska skapa:

- planned entry
- planned quantity
- planned SL
- planned TP
- simulated fill
- simulated result
Shadow Mode gör det möjligt att testa hela pre-execution pipeline utan broker risk.

## Shadow Mode ska vara realistiskt

Shadow Mode ska inte anta perfekt execution.

Det bör kunna använda:

- realtime bid/ask
- current price
- simulated latency
- estimated slippage
- commissions
- fees
Det gör jämförelsen mot senare demo fills mer relevant.

## Shadow Mode Acceptance Criteria

Shadow Mode ska bland annat verifiera:

- correct proposal generation
- correct RiskDecision
- correct PropDecision
- correct quantity
- correct expiry
- correct simulated entry
- correct simulated position management
- correct break-even
- correct news exit
- correct time exit
- correct journal
## Manual Verification mot Chart

Under Analysis och Shadow Mode ska systemets interpretation regelbundet jämföras med mänsklig chart review.

Detta gäller särskilt:

- liquidity
- swing structure
- FVG
- manipulation
- iFVG
- CISD
- SMT
Syftet är inte att låta människan ersätta Strategy Engine.

Syftet är att verifiera att implementationen matchar Canonical Specification.

## Detection Rules måste vara deterministiska

Innan Demofasen når faktisk execution måste entrykritiska patterns ha exakta machine-readable detection rules.

Det gäller särskilt:

- iFVG
- CISD
Strategy Engine får inte vara beroende av att Atlas visuellt gissar dessa patterns.

Samma detection logic måste användas i:

- backtest
- replay
- forward
- demo
- live
## Demo Manual Approval

När Shadow Mode fungerar stabilt aktiveras:

**DEMO MANUAL**

Detta är första gången systemet får skicka en riktig broker order genom providern.

Men varje trade kräver explicit mänskligt approval.

## Varför Manual Approval först

Human approval ger en extra kontrollpunkt medan execution-infrastrukturen fortfarande valideras.

Det gör det möjligt att inspektera:

- account
- instrument
- direction
- quantity
- risk
- entry
- SL
- TP
- R:R
- Strategy status
- Risk status
- Prop status
innan ordern skickas.

## Demo Account Only

Demo Manual får endast använda explicit godkänt demo-account.

Runnern ska verifiera:

```
environment = DEMO
```

och:

```
account = approved demo account
```

före varje execution.

## Live Credentials ska inte behövas

Under Demofasen ska systemet kunna fungera utan live execution credentials.

Detta minskar risken att fel environment används av misstag.

## Demo Manual Execution Flow

Den fulla kedjan är:

```
Realtime Market Data
→ Strategy Engine
→ AI Analysis
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
→ Human Approval
→ Execution Gateway
→ Execution Intent
→ Execution Provider Adapter
→ Futures Execution Provider (demo)
→ Broker Demo Environment
→ Journal
```

## Trade Proposal Review

Före approval ska användaren kunna se minst:

- environment
- account
- instrument
- direction
- setup grade
- strategy version
- planned entry
- SL
- TP
- R:R
- quantity
- risk $
- risk %
- daily risk state
- Prop Firm state
- expiry
## Approval Integrity

Approval ska vara bundet till exakt proposal.

Om critical values förändras efter approval:

- price
- quantity
- SL
- TP
- R:R
ska tidigare approval inte längre vara giltigt.

## Pre-Execution Revalidation

Efter approval men före order submission ska systemet kontrollera allt igen.

Minst:

- proposal still valid
- current price
- R:R
- risk
- account
- open position
- attempt count
- news
- prop state
- kill switches
- runner state
- providern state
## Demo Order

När alla gates passerar får systemet skicka order till providerns demomiljö.

Ordern ska därefter verifieras mot actual broker state.

## Fill Verification

Efter order submission ska systemet kontrollera:

- actual fill
- actual quantity
- actual position
- actual SL
- actual TP
Det räcker inte att providern returnerade ett positivt request response.

## Broker-Native SL

En demoposition ska inte räknas som korrekt etablerad förrän systemet verifierat att stop loss verkligen finns hos broker.

Om SL saknas:

CRITICAL DEMO INCIDENT

Detta ska behandlas som om felet hade inträffat live.

## Broker-Native TP

TP ska också verifieras där strategy plan kräver det.

## Break-Even på Demo

Demofasen ska bevisa hela canonical break-even-flödet.

För long:

- nearest confirmed 1m swing high efter entry identifieras
- pris tar swing high
- BE event triggas
- SL modification skickas
- broker bekräftar SL = entry
Short motsvarande med swing low.

## Ingen falsk BE-status

Om providern nekar modification ska UI och journal visa:

```
BREAK_EVEN_FAILED
```

inte:

```
BREAK_EVEN_ACTIVE
```

## Stop Loss Testing

Vi ska aktivt samla demoexempel där SL träffas.

Detta verifierar:

- stop placement
- broker execution
- trade close detection
- final P/L
- final R
- attempt counter
## Take Profit Testing

På samma sätt ska TP-flödet verifieras.

## News Exit Testing

Canonical Strategy v1.0 kräver att öppen position stängs:

T-15m

före relevant high-impact USD-news.

Demo ska användas för att verifiera hela flödet:

- NewsEvent
- countdown
- exit trigger
- close request
- actual broker close
- journal reason = NEWS_EXIT
## News Blackout Testing

No new entry:

```
T-1h → T+4h
```

ska också verifieras.

Vi ska särskilt testa boundary cases.

Exempel:

T-60m exakt

T+4h exakt

## Time Exit Testing

New York-positioner ska stängas senast fyra timmar efter entry enligt Strategy v1.0.

Demo ska verifiera:

```
TIME_EXIT
```

hela vägen till actual broker close.

## London Position Management

London-positioner ska inte automatiskt få samma 4h time exit.

Demo ska verifiera att session-specifik management fungerar korrekt.

## Re-entry på Demo

Re-entrylogiken ska testas med actual demo trades.

Efter loss:

- thesis behålls
- nytt valid setup kan tas
- attempt count ökar
Max:

3 attempts

Efter:

- winner
- break-even
ska inga fler re-entrys tas på samma thesis.

## Persistence av Attempt Count

Runner eller Omnira restart får inte återställa attempts.

Detta ska aktivt testas.

## One Position Rule

Demo ska verifiera att systemet aldrig öppnar en andra Omnira-position när en position redan är öppen.

## Opposite Setup

Om motsatt setup identifieras medan position är öppen ska Strategy v1.0 ignorera den för execution.

Den kan fortfarande journalföras för research.

## Daily Risk

Demo ska använda den canonical interna Risk Profile:

- $150 max risk/trade
- $450 realized daily loss
- max 1 open position
- max 3 attempts per thesis
## Daily Reset

Daily risk reset ska verifieras vid:

00:00 America/New_York

Det ska testas även runt daylight saving transitions.

## Daily Stop Test

Demo ska aktivt testa att:

realized daily loss >= $450

leder till:

- block new trades
- close existing position enligt canonical risk policy
- persistent daily stop
- correct UI state
- correct reset nästa tradingdag
## Minimum Quantity Denial

Vi behöver ett test där technical SL gör att minsta möjliga contract size överskrider riskbudget.

Expected:

```
RISK_DENY
```

Runner får aldrig flytta technical SL för att skapa en tillåten trade.

## Demo Prop Firm Profile

Även om demoaccount inte är en riktig challenge kan ett simulerat PropFirmProfile appliceras.

Detta verifierar compliance engine samtidigt med execution.

## Prop Firm Denial Test

Vi ska aktivt skapa ett test där:

Risk PASS

men:

Prop DENY

Expected:

**ingen order**

## Unknown Prop State

Om prop engine inte kan avgöra state:

**ingen demo order**

Detta verifierar fail-closed-beteende.

## Duplicate Execution Test

Ett av Demofasens viktigaste test är att samma Execution Intent skickas flera gånger.

Expected:

**exakt en providern-order**

## Approval Double-Click Test

Samma gäller om användaren dubbelklickar approval.

Det ska fortfarande bli:

**en trade**

## Runner Crash Before Order

Vi ska testa:

- intent mottaget
- runner crash före submission
- restart
- reconciliation
Expected:

ingen duplicate trade.

## Runner Crash After Order

Vi ska också testa den svårare varianten:

- order skickas
- runner crash innan confirmation sparas
Efter restart:

- read providern positions/orders/deals
- reconcile
- hitta actual trade
- inte skicka om
## Provider Restart

Provideranslutningen ska medvetet startas om under demo.

Runnern ska:

- upptäcka disconnect
- blockera execution
- reconnecta
- resynca
- reconcila
- återgå till ready
## Windows Restart

Hela Windows-host ska kunna startas om.

Efter startup:

- runner start
- providern start
- account verification
- position sync
- reconciliation
Ingen trade före READY.

## Network Disconnect

Nätverket ska medvetet brytas under:

- ingen position
- öppen position
Vi ska verifiera skillnaden mellan:

- new execution
- existing broker-native protection
- active management outage
## Open Position under Outage

Om en position har verifierad broker-native SL och TP ska dessa skydd kvarstå när Omnira går offline.

Demo ska användas för att kontrollera detta praktiskt.

## Active Management Outage

Break-even, news exit och time exit kan kräva aktiv runtime.

Demo ska hjälpa oss förstå residual risk om systemet är unavailable precis när sådan action krävs.

## Manual providern Trade

Vi ska manuellt öppna en position direkt i demo-providern.

Omnira ska upptäcka:

```
MANUAL_EXTERNAL
```

eller:

```
UNKNOWN_POSITION
```

Ny Omnira execution ska blockeras enligt aktuell policy.

## Manual providern Modification

Vi ska manuellt ändra SL eller TP i terminalen.

Omnira ska upptäcka discrepancy och uppdatera actual broker state.

## Manual providern Close

Om positionen stängs manuellt ska journalen visa att exit inte kom från normal strategy management.

## Wrong Account Test

Runnern ska medvetet möta fel demoaccount.

Expected:

```
ACCOUNT_MISMATCH
```

**NO EXECUTION**

Detta är obligatoriskt före nästa fas.

## Wrong Environment Test

Ett testintent för fel environment ska nekas.

## Wrong Symbol Test

Execution Intent med instrument utanför allowlist ska nekas.

## Wrong Quantity Test

Ett modifierat intent med annan quantity än RiskDecision ska nekas.

## Expired Proposal Test

En gammal proposal ska aldrig kunna exekveras.

## Kill Switch Testing

Varje kill switch-scope ska testas på demo:

- GLOBAL
- ACCOUNT
- STRATEGY
- INSTRUMENT
- RUNNER
Aktiv relevant kill:

**NO NEW EXECUTION**

## Persistent Kill Switch

Vi ska starta om systemet medan kill switch är aktiv.

Efter restart ska den fortfarande vara aktiv.

## Emergency Close Testing

Separat emergency close ska testas på demo.

Vi ska verifiera:

- explicit action
- correct account
- correct position
- close result
- audit
- reconciliation
## Kill Switch ska inte automatiskt Emergency Close

Vi ska också verifiera att vanlig kill switch inte stänger befintlig position om sådan policy inte explicit begär det.

## Data Failure Testing

Under demo ska vi simulera:

- stale data
- missing bars
- ES SMT data missing
- news data missing
Systemet ska reagera enligt canonical fail-closed-policy.

## AI Failure Testing

Atlas ska kunna stängas av.

Vi ska verifiera att:

- canonical Strategy state förblir korrekt
- AI-unavailable state visas
- systemet följer operation-mode-policy
- inga hallucinerade AI-resultat används som execution permission
## AI Contradiction Test

Test:

Structured state:

SMT = UNKNOWN

Mockad AI analysis:

SMT confirmed

Expected:

canonical state förblir UNKNOWN.

Execution får aldrig baseras på AI-felaktigheten.

## Journal Completeness

Varje demo trade ska kunna rekonstrueras.

Målet är:

- signal
- decisions
- approval
- execution
- fills
- management
- exit
- final metrics
utan luckor.

## Audit Completeness

Privilegierade actions ska också finnas.

Exempel:

- demo execution enabled
- kill switch changes
- emergency close
- account binding
## Technical Incident Threshold

Demo ska inte betraktas som godkänd om critical execution incidents fortfarande inträffar återkommande.

Exempel på blockerande problem:

- duplicate unintended order
- wrong account execution
- incorrect quantity
- missing SL
- unreconciled position
- silent data corruption
## Incident Rate

Det räcker inte att fixa ett problem en gång.

Systemet ska visa stabilitet över tillräcklig driftstid.

## Demo Manual Performance

Vi ska mäta både:

**Strategy performance**

och:

**Operational performance**

under Demo Manual.

Strategy metrics:

- expectancy
- R
- PF
- drawdown
Operational metrics:

- latency
- slippage
- execution failures
- uptime
- reconciliation failures
## Human Approval Latency

Demo Manual är rätt fas för att mäta hur användarens approval påverkar entry.

Om delay regelbundet gör att:

- R:R faller under 2
- trades missas
- slippage blir stor
ska detta dokumenteras.

Det kan bli argument för Demo Automation.

## Manual Approval ska inte kringgå Rules

Användaren ska inte kunna välja:

Execute Anyway

på ett Risk DENY eller Prop DENY.

Approval gäller endast en proposal som redan passerat hard gates.

## Demo Automation

När Demo Manual är stabil kan:

**DEMO AUTO**

aktiveras.

Nu tas människan bort från per-trade approval.

Detta är första gången Omnira genomför hela tradingkedjan självständigt.

## Vad Demo Automation inte förändrar

Följande finns kvar:

- Strategy Engine
- Data Quality Gate
- AI policy
- Risk Engine
- Prop Firm Engine
- proposal
- pre-execution revalidation
- Execution Gateway
- idempotency
- runner checks
- kill switches
Endast human approval ersätts av en explicit automation policy.

## Automation Policy

Demo Automation ska ha en versionsstyrd policy.

Den kan exempelvis begränsa:

- accounts
- environment
- strategy
- instruments
- risk profile
- sessions
## Ingen automatisk Live-promotion

Demo Automation får aldrig själv ändra:

```
DEMO
```

till:

```
LIVE
```

även efter stark performance.

Live är en separat human-governed promotion.

## Demo Automation Acceptance Criteria

Innan Demo Automation kan betraktas som godkänd ska systemet visa:

- zero unintended duplicate orders
- zero wrong-account orders
- zero wrong-environment orders
- correct quantity
- reliable broker-native SL
- reliable TP
- correct BE
- correct news exits
- correct time exits
- correct daily stop
- correct attempt handling
- stable reconciliation
- stable restart recovery
- working kill switches
- complete journal
- complete audit
## Performance är också relevant

Teknisk perfektion räcker inte om strategin inte uppvisar tillräcklig edge.

Demo Automation måste därför också producera en relevant performance sample.

## Men Profit ensam räcker inte

En lönsam demo med technical incidents är inte live-ready.

Exempel:

+20R

men:

2 duplicate orders

är:

**FAIL**

ur safety-perspektiv.

## Safety dominerar Promotion

En enda kritisk kategori såsom wrong-account execution kan blockera promotion oavsett P/L.

## Minimum Demo Duration

Exakt minimum ska definieras senare utifrån:

- strategy frequency
- trade count
- market regime coverage
- operational uptime
Demofasen får inte avslutas efter några bra dagar.

## Sample Size

Demo-resultat ska alltid visa antal:

- setups
- signals
- executed trades
## Regime Coverage

Demo bör få möta flera typer av marknadsförhållanden.

Om alla trades råkar ske under en enda lugn period är systemet mindre bevisat.

## Session Coverage

Både:

- London
- New York
ska valideras.

## Grade Coverage

A+, A, B och C ska följas.

Det krävs inte nödvändigtvis stort sample i varje grade före första tekniska sign-off, men performance coverage ska tydligt dokumenteras.

## Prop Simulation Coverage

Om första riktiga målet är prop firm ska relevant PropFirmProfile simuleras under en betydande del av demofasen.

## Demo vs Backtest

Atlas ska jämföra:

- backtest expectancy
- forward/shadow expectancy
- demo expectancy
och försöka förstå skillnader.

## Demo vs Shadow Fills

Shadow fill model ska jämföras med actual demo fills.

Detta hjälper oss förbättra framtida backtest realism.

## Slippage Calibration

Actual demo slippage ska sparas per:

- session
- volatility
- entry type
Det kan senare förbättra cost model.

## Demo Commission Calibration

Om demo environment simulerar fees tillräckligt realistiskt ska dessa jämföras mot backtest assumptions.

## Technical Performance Dashboard

Omnira ska senare kunna visa exempelvis:

Mode: DEMO AUTO

Runner Uptime: 99.9%

Orders: 124

Duplicate Orders: 0

Account Mismatches: 0

SL Verification Failures: 0

Reconciliation Failures: 0

Average Execution Latency: X

Average Slippage: Y

## Strategy Dashboard

Parallellt:

Trades: 124

Expectancy: +0.24R

PF: 1.43

Max DD: -7.1R

Win Rate: 42%

BE Rate: 15%

## Incident Dashboard

Alla incidents ska vara synliga.

Exempel:

Critical: 0

Blocking: 1

Warnings: 7

Det gör go/no-go review enklare.

## Demo Promotion Review

När vi anser Demofasen färdig ska en formell review genomföras.

Den ska granska:

**Strategy**

Har v1.0 fortfarande edge?

## Risk

Följs alla canonical limits?

## Prop

Fungerar regelmotorn?

## Execution

Är orderflödet korrekt?

## Reliability

Klarar systemet restarts och outages?

## Security

Fungerar auth, allowlists och kill switches?

## Audit

Kan varje trade rekonstrueras?

**PASS**

Om samtliga definierade gates uppfylls:

DEMO PHASE = PASS

Det betyder:

Systemet är kandidat för Controlled Live evaluation.

Det betyder inte:

Full autonom live trading är godkänd.

**FAIL**

Om kritiska problem återstår:

DEMO PHASE = FAIL

Problemen ska fixas.

Relevant testsektion ska upprepas.

**INCONCLUSIVE**

Om exempelvis sample size eller market coverage är för liten:

```
INCONCLUSIVE
```

Testet fortsätter.

## No Schedule Pressure

Demofasen ska inte godkännas för att vi blivit otåliga.

Marknaden bestämmer hur snabbt relevant sample samlas.

## Dokumenterade Gates

Promotion ska baseras på:

- test IDs
- logs
- metrics
- incidents
- performance
- regression suite
inte endast känslan:

Det verkar fungera.

## Demo Release Candidate

När Demo Auto är stabil kan systemet få en release candidate-version.

Exempel:

Omnira Trading Runtime – Demo RC1

RC-versionen ska köras oförändrad under slutlig demo validation.

## Freeze före Sign-Off

Under slutlig sign-off bör kritiska rules och runtime code vara låsta.

Om code ändras materiellt måste relevant verification köras om.

## Golden Demo Run

En slutlig verifieringsperiod kan behandlas som:

GOLDEN DEMO RUN

Den ska använda exakt den configuration som senare föreslås gå till Controlled Live.

## Self-Improvement under Demo

Atlas Learning Layer får fortsätta:

- analysera
- skapa findings
- skapa hypotheses
- skapa candidates
Men den aktiva demo strategy versionen får inte förändras mitt i en valideringsrun.

## Candidate Testing parallellt

Det går att fortsätta forska på candidate v1.1 parallellt.

Men production candidate för live ska fortfarande kunna vara Canonical v1.0 tills en ny version separat bevisats bättre.

## Ingen Optimization-by-Demo

Vi ska inte ändra strategy efter varje demoförlust.

Det skulle förstöra testintegriteten.

## Demofasen som generalrepetition

Demofasen ska behandlas som generalrepetition för live.

Skillnaden är kapitalet.

Arkitektur, controls, journal och execution ska däremot vara så nära den framtida livekedjan som möjligt.

## Vad demo inte kan bevisa

Demo kan inte fullständigt bevisa:

- real-money broker behavior
- live prop firm enforcement
- verklig slippage
- psychological pressure
- payout behavior
- alla live-specific restrictions
Därför behövs Controlled Live efteråt.

## Vad demo ska bevisa

Demo ska däremot ge mycket stark evidens för att:

Omnira kan köra hela tradingprocessen autonomt utan att bryta sina egna regler under normal och testad abnormal drift.

## Säkerhetsprincip före Live

Före första riktiga kapitalrisken ska vi kunna säga:

Vi har medvetet försökt få systemet att göra fel på demo och verifierat att de kritiska safety gates stoppar det.

Det är en mycket högre standard än att bara konstatera att botten kan placera en order.

## Kapitelstatus

Kapitel: 17 – Demofas

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

```
Progression: Analysis Only → Shadow → Demo Manual → Demo Auto
```

Demo account: Obligatoriskt före live

Human approval: Första executionfas

Demo automation: Första fullständiga autonoma executionfas

Failure injection: Obligatoriskt

Daily risk verification: Obligatoriskt

Prop simulation: Planerad

Kill switch verification: Obligatoriskt

Restart/reconciliation: Obligatoriskt

Critical execution incidents vid sign-off: Ska vara noll i definierade zero-tolerance-kategorier

Demo PASS: Krävs före Controlled Live

Demofasen ska behandlas som den sista stora tekniska säkerhetsprövningen innan Omnira Trading System får möjlighet att påverka verkligt kapital.
