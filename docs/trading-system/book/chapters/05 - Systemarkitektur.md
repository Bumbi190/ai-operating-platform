# Kapitel 5 – Systemarkitektur

Omnira Trading System ska inte byggas som en enda bot som både analyserar marknaden, bestämmer risk och skickar order.

Systemet ska istället bestå av flera tydligt separerade lager med olika ansvar och olika auktoritet.

Den grundläggande arkitekturen är:

```
Market Data
→ Strategy Engine
→ AI Analysis
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
→ Approval / Automation Policy
→ Execution Gateway
→ Execution Runtime
→ Futures Execution Provider
→ Broker / Prop Firm
→ Journal & Analytics
```

Denna separation är en av systemets viktigaste säkerhetsprinciper.

Ingen enskild komponent ska ha större auktoritet än den behöver.

## Trading som egen domän i Omnira

Trading ska vara en tydligt isolerad domän inom Omnira.

Tradingdomänen ska äga sina egna:

- konton
- brokers
- instrument
- strategier
- strategy versions
- market data
- setups
- trade proposals
- riskprofiler
- prop firm-profiler
- orders
- positions
- trades
- journal
- analytics
- approvals
- execution state
- audit logs
Atlas ska kunna läsa och arbeta med denna information genom tydliga Trading APIs och events.

Tradinglogik ska inte spridas genom andra generella delar av Omnira.

Det ska göra systemet lättare att testa, säkra, versionshantera och senare bygga ut med flera strategier eller flera konton.

## Market Data Layer

Market Data Layer är systemets första tekniska lager.

Dess uppgift är att:

- läsa market data
- normalisera data
- kontrollera timestamps
- kontrollera instrument
- kontrollera timeframes
- upptäcka stale eller saknad data
- leverera kontrollerad data vidare till Strategy Engine
För den första strategin behövs framför allt:

- NQ eller MNQ
- ES
- 1m
- 5m
- 15m
- 4H
Data ska i möjligaste mån kunna komma från flera framtida providers utan att Strategy Engine måste byggas om.

Market Data Layer ska därför fungera som en adapter mellan externa datakällor och Omniras interna format.

## Datakvalitet före analys

Strategy Engine får inte arbeta vidare som om allt är normalt om kritisk data saknas eller är osäker.

Exempel på problem är:

- bars saknas
- candles kommer i fel ordning
- timestamp är fel
- market data är för gammal
- fel instrument används
- fel timeframe används
- duplicate bars
- data source är disconnected
Vid kritiska dataproblem ska systemet som standard:

**FAIL CLOSED**

Det innebär att analys kan markeras som osäker, men ingen exekverbar trade proposal får skapas.

## Strategy Engine

Strategy Engine ansvarar för själva strategin.

Den första strategin är:

**Omnira Liquidity Manipulation – Canonical v1.0**

Strategy Engine ska bland annat:

- identifiera relevant 4H-open
- identifiera liquidity
- identifiera FVG
- vänta på manipulation
- upptäcka iFVG
- upptäcka CISD
- utvärdera SMT
- grade setup
- beräkna entry
- definiera technical stop loss
- hitta target
- beräkna initial R:R
- skapa Strategy Signal
Strategy Engine ska vara deterministisk.

Om exakt samma strategy version får exakt samma market data och configuration ska samma resultat produceras.

## Strategy Signal är inte en order

Detta är en central princip.

När Strategy Engine producerar:

**STRATEGY_SIGNAL**

betyder det:

Strategins regler är uppfyllda.

Det betyder inte:

Skicka en order.

Strategy Signal går vidare till nästa lager för ytterligare granskning.

Detta skiljer systemet från enklare tradingbots där signal och execution ofta är samma steg.

## Strategy Plugin Model

Omnira ska inte byggas specifikt runt endast en strategi.

Den första strategin ska fungera som Strategy #1, men systemarkitekturen ska stödja flera framtida strategier.

Exempel:

**Strategy A – Omnira Liquidity Manipulation**

## Strategy B – framtida trendstrategi

## Strategy C – framtida mean reversion

Alla strategier ska implementera samma principiella kontrakt.

Exempel:

- required data
- detect setup
- evaluate setup
- calculate entry
- calculate invalidation
- calculate targets
- grade setup
- explain signal
Detta gör att Risk Engine, execution, journal, analytics och Atlas Market View inte behöver byggas om när en ny strategi introduceras.

## Strategy Versioning

Varje strategi ska versionshanteras.

Exempel:

**Omnira Liquidity Manipulation v1.0**

och senare:

**Omnira Liquidity Manipulation v1.1**

Om en regel ändras ska tidigare performance fortfarande höra till den version som faktiskt användes.

En ändring av exempelvis:

- entry
- SL
- TP
- minimum R:R
- news policy
- setup grade
- break-even
- session
får inte i efterhand blandas ihop med resultat från en tidigare strategy version.

## AI Analysis

AI Analysis ligger efter Strategy Engine.

Atlas ska alltså inte primärt sitta och titta på rå chart och fritt bestämma om en trade ska tas.

Strategy Engine ska först skapa en strukturerad signal.

Därefter kan Atlas analysera:

- setupen
- market context
- setup grade
- market regime
- historisk performance
- liknande setups
- eventuella osäkerheter
AI ska vara ett beslutsstöd.

AI får inte själv skapa hard risk limits eller kringgå deterministic rules.

## Atlas roll

Atlas ska fungera som det intelligenta lagret ovanpå de deterministiska komponenterna.

Atlas ska kunna:

- förklara varför en setup finns
- beskriva vad Strategy Engine väntar på
- sammanfatta marknadsförhållanden
- jämföra mot historiska setups
- visa riskstatus
- visa prop firm-headroom
- identifiera osäkerheter
- skapa ett begripligt trade proposal
- analysera historiska resultat
- hjälpa till med self-improvement
Atlas ska däremot inte kunna säga:

Jag är 95 % säker, därför ignorerar vi daily stop.

Hard limits gäller oavsett AI-bedömning.

## Risk Engine

Risk Engine är ett separat deterministiskt säkerhetslager.

Det ansvarar bland annat för:

- max risk per trade
- daily loss
- max öppna positioner
- max attempts
- position sizing
- minimum contract risk
- kill switches
- account health
- market data health
- execution health
Risk Engine kan returnera:

**ALLOW**

eller:

**DENY**

Risk Engine har veto.

## Prop Firm Rules Engine

Prop Firm Rules Engine är separat från intern risk.

Anledningen är att en prop firm kan använda andra regler än Omniras egna.

Exempel:

- equity-based daily drawdown
- static maximum loss
- trailing drawdown
- minimum trading days
- consistency rules
- news restrictions
- weekend holding
- instrument restrictions
- account-specific limits
Varje prop firm-profil ska vara versionsstyrd.

Ingen generell prop firm-regel ska hårdkodas globalt i systemet.

## Den striktaste regeln vinner

En trade måste passera både:

**Internal Risk Engine**

och:

**Prop Firm Rules Engine**

Om intern risk säger:

**ALLOW**

men prop firm säger:

**DENY**

blir slutresultatet:

**DENY**

Samma gäller åt andra hållet.

När två risklager har olika praktiska gränser ska den striktaste tillåtna gränsen vinna.

## Trade Proposal

När en strategy signal har analyserats och de relevanta kontrollagren passerats kan Omnira skapa ett Trade Proposal.

Trade Proposal ska kunna innehålla:

- instrument
- direction
- strategy
- strategy version
- setup grade
- entry
- stop loss
- take profit
- R:R
- quantity
- risk i dollar
- risk i procent
- Atlas analys
- Risk Engine-resultat
- Prop Firm-resultat
- proposal expiry
- status
Trade Proposal är fortfarande inte en order.

## Approval och automation modes

Omnira Trading ska kunna arbeta i flera olika operation modes.

## Analysis Only

Systemet analyserar marknaden.

Ingen broker execution är tillåten.

## Read Only

Systemet läser konto- och market data från providern.

Orderläggning är tekniskt avstängd.

## Demo Manual Approval

Omnira skapar Trade Proposal.

Användaren måste godkänna.

## Demo Automation

Systemet får automatiskt exekvera godkända strategisignaler på demo.

## Live Manual Approval

Live trade kräver explicit mänsklig approval.

## Controlled Live Automation

Tillåts endast efter senare definierade performance- och safety-gates.

Systemet får aldrig automatiskt höja sin egen autonomy level.

## Execution Gateway

Execution Gateway fungerar som säkerhetsgränsen mellan Omnira och providermiljön.

Gateway ska verifiera:

- proposal ID
- approval
- expiry
- kill switch
- account
- duplicate execution
- current risk state
- current prop firm state
Först därefter får ett Execution Intent skapas.

## Execution Intent

Execution Intent är den strukturerade instruktionen till execution-runnern.

Det kan innehålla:

- execution ID
- proposal ID
- account
- instrument
- direction
- quantity
- order type
- SL
- TP
- expiry
- approval reference
Execution Intent ska vara idempotent.

Om samma request skickas två gånger på grund av nätverksproblem får detta inte kunna skapa två trades.

## Execution Runtime

Den första executionmiljön ska vara en dedikerad Windows-dator.

Den stationära datorn kan användas som 24/7-rigg i den första fasen.

Runnern ansvarar för:

- kommunikation med Omnira
- kommunikation med providern
- read-only account sync
- framtida order execution
- broker response
- position updates
- heartbeat
- reconciliation
Runnern ska vara så enkel och deterministisk som möjligt.

Den ska inte innehålla självständig strategi-AI.

## Varför execution separeras från Omnira

Att lägga providern execution i en separat runner ger flera fördelar.

Omnira kan fortsätta vara ansvarig för:

- logik
- risk
- UI
- Atlas
- approvals
- historik
- analytics
medan Windows-miljön ansvarar för själva providerintegrationen.

Det gör det senare möjligt att flytta execution från stationär dator till VPS utan att hela Omnira behöver byggas om.

## Initial 24/7-rigg

Den första Windows-riggen ska minst ha:

- sleep avstängt
- stabil internetanslutning
- automatisk startup
- provideranslutning autostart
- Execution Runner autostart
- korrekt systemtid
- health monitoring
- loggning
- diskövervakning
- kill switch
- reconciliation efter restart
Om riggen förlorar kontakt med Omnira ska standardläget vara:

**inga nya trades**

Befintliga broker-native SL och TP ska fortsätta skydda redan öppna positioner.

## VPN och nätverk

Executionmiljön ska vara flexibel.

Den ska kunna stödja exempelvis:

- direct connection
- approved VPN
- static VPN
- VPS
Men systemet får inte anta att VPN alltid är tillåtet.

Broker- och prop firm-regler ska kunna avgöra vilken network policy som är godkänd för ett specifikt konto.

## Execution Provider Adapter

providerintegrationen ska delas upp i två logiska delar.

## Read Adapter

Ansvarar för att läsa:

- account info
- balance
- equity
- quotes
- bars
- ticks
- orders
- positions
- historical trades
## Execution Adapter

Ansvarar senare för:

- order pre-check
- order submission
- modification
- close
- broker response
Read-only ska implementeras och verifieras innan Execution Adapter aktiveras.

## Pre-Execution Revalidation

Även om ett Trade Proposal redan har godkänts ska systemet kontrollera läget igen direkt före execution.

Exempel på saker som kan ha förändrats:

- pris
- R:R
- spread
- daily risk
- open position
- news state
- kill switch
- prop firm headroom
- broker health
Om trade conditions inte längre är giltiga ska execution stoppas.

## Fail Closed

Alla kritiska systemfel ska leda till:

**ingen ny trade**

Det gäller exempelvis:

- Risk Engine offline
- Runner offline
- stale data
- broker disconnected
- invalid account
- reconciliation failure
- unknown position
- expired proposal
- auth failure
Trading ska aldrig fortsätta på antagandet att allt förmodligen är okej.

## Reconciliation

Omnira och providern måste kunna återställa gemensam state efter exempelvis:

- restart
- nätverksfel
- runner crash
- Omnira outage
Vid startup ska systemet kontrollera:

- open positions
- pending orders
- account state
- senaste execution
- senaste known Omnira state
Om states inte matchar ska ny trading blockeras tills discrepancy är löst.

## Unknown Position

Om providern visar en öppen position som Omnira inte känner igen ska den markeras som:

**UNKNOWN_POSITION**

Ny execution ska blockeras.

Systemet ska inte automatiskt anta att positionen tillhör Omnira.

## Atlas Market View

Omnira Trading ska innehålla en central TradingView-liknande marknadsvy.

Detta är den visuella representationen av vad Atlas och Trading System ser.

Vyn ska kunna visa:

- candles
- 4H-open
- liquidity
- FVG
- manipulation
- iFVG
- CISD
- SMT
- entry
- stop loss
- take profit
- setup grade
- R:R
- strategy state
- riskstatus
- prop firm-status
- trade proposal
- approval
- open position
- break-even
- trade result
Målet är att användaren ska kunna öppna Omnira Trading och snabbt förstå:

Vad ser Atlas?

Vad väntar Strategy Engine på?

Finns en setup?

Var planeras entry?

Var ligger SL och TP?

Vad säger Risk Engine?

Vad säger Prop Firm Engine?

Varför tas eller nekas traden?

## UI är inte source of truth

TradingView-liknande UI ska endast visualisera systemets state.

Chart-komponenten får inte själv implementera strategi-regler.

Source of truth ska ligga i backend.

Om användaren stänger UI:t ska Strategy Engine fortfarande ha exakt samma state.

## Realtime Events

Tradingdomänen ska kunna publicera events såsom:

- SETUP_CREATED
- MANIPULATION_CONFIRMED
- ENTRY_CONFIRMATION_DETECTED
- STRATEGY_SIGNAL_CREATED
- RISK_DENIED
- PROP_DENIED
- PROPOSAL_CREATED
- PROPOSAL_APPROVED
- EXECUTION_REQUESTED
- ORDER_FILLED
- POSITION_UPDATED
- TRADE_CLOSED
- KILL_SWITCH_ACTIVATED
Atlas Market View kan använda dessa events för realtime-uppdatering.

## Journal och Analytics

Journalen ska inte endast lagra trade-resultatet.

Systemet ska kunna återskapa hela beslutsprocessen.

Det innebär att journalen bland annat ska veta:

- vilken strategy version användes
- vilken market data fanns
- vilken setup identifierades
- vad Atlas analyserade
- vad Risk Engine beslutade
- vad Prop Firm Engine beslutade
- vem som godkände
- vad Execution Runner skickade
- vad providern svarade
- vilket fill som erhölls
- varför traden stängdes
- slutligt resultat
## Replayability

En historisk trade eller setup ska i möjligaste mån kunna replayas genom samma Strategy Engine som används live.

Systemet ska kunna fråga:

Vad hade Strategy v1.0 sett vid denna tidpunkt, med endast information som fanns tillgänglig då?

Detta är viktigt för att motverka look-ahead bias.

## Backtest och Live ska dela logik

Backtestmotorn ska använda samma Strategy Engine-kontrakt som live-systemet.

Det ska inte finnas en separat förenklad strategi som endast används i backtest.

Skillnader ska främst ligga i:

- data adapter
- execution adapter
Detta gör testresultaten mer relevanta för verklig drift.

## Atlas Trading Learning & Improvement Layer

Omnira Trading ska innehålla ett separat lager för kontinuerligt lärande och förbättring.

Detta lager ska analysera:

- alla setups
- vinnande trades
- förlorande trades
- break-even trades
- nekade trades
- setups som aldrig nådde entry
- setup grades
- sessions
- SMT
- market regimes
- MFE
- MAE
- spread
- slippage
- execution quality
- risk decisions
- prop firm decisions
Målet är att Atlas över tid ska bygga bättre förståelse för vilka kombinationer som faktiskt har positiv expectancy.

## Self-Improvement är inte Self-Modification

Atlas får:

- upptäcka mönster
- jämföra performance
- hitta svaga market regimes
- identifiera starka setupkombinationer
- skapa hypoteser
- föreslå parameterförändringar
- föreslå ny strategy version
- föreslå ny Risk Profile-version
Atlas får inte själv ändra canonical produktionregler.

Förbättringsflödet ska vara:

```
Observe
→ Measure
→ Detect Pattern
→ Create Hypothesis
→ Candidate Version
→ Backtest
→ Out-of-Sample Test
→ Forward Test
→ Review / Approval
→ Ny Canonical Version
```

På detta sätt kan systemet bli smartare utan att samtidigt bli okontrollerbart.

## Arkitekturens långsiktiga mål

Den långsiktiga visionen är inte bara en bot som tar trades.

Målet är ett trading-system där:

- Strategy Engine identifierar edge
- Atlas förstår och förklarar kontext
- Risk Engine begränsar skada
- Prop Firm Engine skyddar externa regler
- Execution Runner utför exakt godkända instruktioner
- Journalen dokumenterar allt
- Analytics mäter verklig performance
- Learning Layer hittar förbättringar
- användaren kan se hela processen visuellt
Autonomi är den sista delen av denna kedja, inte den första.

## Den centrala arkitekturprincipen

Omnira Trading ska följa principen:

Ingen komponent ska ha större auktoritet än den behöver.

Strategy Engine får identifiera trades.

Atlas får analysera.

Risk Engine får skydda kapital.

Prop Firm Engine får skydda externa regler.

Approval Policy får bestämma behörighet.

Execution Runner får exekvera explicit godkända instruktioner.

Journalen ska dokumentera vad som hände.

Learning Layer får lära sig av resultatet.

Ingen av dessa roller ska i hemlighet ta över de andras ansvar.
