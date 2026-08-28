# Omnira Trading System

## Systemarkitektur v0.1

Dokumentspråk: Svenska
Status: Fas 0 – Arkitekturförslag för granskning
System: Omnira Trading System
Primär strategi: Omnira Liquidity Manipulation – Canonical v1.0

## 1. Syfte

Detta dokument definierar den tekniska grundarkitekturen för Omnira Trading System.

Arkitekturen ska säkerställa att systemet kan utvecklas stegvis från:

- analys
- read-only broker integration
- backtesting
- demo trading
- manual approval
- controlled live trading
- eventuell framtida autonom exekvering
utan att behöva bygga om systemets säkerhetsmodell eller kärnarkitektur.

Prioriteringsordningen är:

**säkerhet → testbarhet → datakvalitet → risk → strategi → automation → skalning**

## 2. Arkitekturprincip

Omnira Trading ska bestå av separata lager med tydligt avgränsat ansvar.

Canonical pipeline:

Market Data

```
↓
```

Strategy Engine

```
↓
```

AI Analysis

```
↓
```

Risk Engine

```
↓
```

Prop Firm Rules Engine

```
↓
```

Trade Proposal

```
↓
```

Approval / Automation Policy

```
↓
```

Execution Gateway

```
↓
```

Windows Execution Runner

```
↓
```

MetaTrader 5

```
↓
```

Broker / Prop Firm

```
↓
```

Journal & Analytics

Ingen komponent får kringgå ett efterföljande säkerhetslager.

## 3. Separation of Authority

Systemet ska använda strikt separation mellan:

- observation
- strategi
- AI-bedömning
- riskbedömning
- prop firm-regler
- approval
- execution
En Strategy Signal är inte en order.

En AI-rekommendation är inte ett risktillstånd.

Ett Risk PASS är inte execution approval.

Ett Trade Proposal är inte en skickad order.

Execution ska vara en separat privilegierad handling.

## 4. Trading Domain

Trading ska implementeras som en tydligt isolerad domän inom Omnira.

Domänen ska äga sina egna:

- accounts
- brokers
- instruments
- strategies
- strategy versions
- market data
- setups
- proposals
- risk profiles
- prop firm profiles
- orders
- positions
- trades
- journal
- analytics
- approvals
- execution state
- audit logs
Tradinglogik ska inte spridas genom generella Atlas-komponenter.

Atlas ska konsumera Trading-domänens APIs och events.

## 5. Strategy Engine

Strategy Engine ansvarar endast för strategi-logik.

Den ska:

- konsumera normaliserad market data
- köra en specificerad strategy version
- identifiera setup states
- beräkna entry
- definiera teknisk SL
- definiera target
- beräkna initial R:R
- skapa Strategy Signal
- förklara vilka strategiregler som passerade
Strategy Engine får inte:

- bestämma slutlig position size
- kringgå Risk Engine
- skicka order
- ändra prop firm-regler
- improvisera regler med AI
## 6. Strategy Plugin Model

Systemet ska byggas så att flera strategier kan användas utan att kärnsystemet byggs om.

Varje strategy implementation ska följa ett gemensamt kontrakt.

Exempel på ansvar:

```
required_data()
initialize_context()
detect_setup()
evaluate_setup()
calculate_entry()
calculate_invalidation()
calculate_targets()
grade_setup()
explain_signal()
```

Varje signal ska returneras i ett standardiserat format.

Detta möjliggör framtida strategier utan att förändra:

- Risk Engine
- MT5 integration
- journaling
- approvals
- analytics
- execution
- prop firm-regler
## 7. Strategy Versioning

Varje signal och trade ska vara knuten till:

- strategy_id
- strategy_version
En materiell strategiförändring ska skapa en ny version.

Gamla trades får aldrig automatiskt räknas som resultat för en ny strategiversion.

Systemet ska kunna köra flera strategy versions parallellt i analys eller backtest utan att deras data blandas ihop.

## 8. Market Data Layer

Market Data Layer ansvarar för att ta emot, validera och normalisera marknadsdata.

Initialt behövs minst:

- OHLCV bars
- ticks när tillgängligt
- bid
- ask
- spread
- timestamps
- instrument metadata
- trading session data
För Omnira Liquidity Manipulation behövs initialt:

- NQ/MNQ
- ES
- 1m
- 5m
- 15m
- 4H
Data ska normaliseras innan Strategy Engine använder den.

## 9. Time Handling

Alla timestamps ska lagras i UTC som canonical storage format.

Tradingregler ska kunna utvärderas i relevant IANA timezone.

För den första strategin används:

America/New_York

Systemet får inte basera sessionslogik på statiska UTC-offsets.

## 10. Data Quality Gate

Strategy Engine får inte utvärdera en setup om kritisk marknadsdata är:

- saknad
- för gammal
- duplicerad
- ur ordning
- tidsmässigt inkonsekvent
- från fel instrument
- från fel timeframe
Vid osäker datakvalitet ska systemet:

FAIL CLOSED

och inte skapa en exekverbar trade proposal.

Datakvalitetsfel ska loggas.

## 11. AI Analysis Layer

AI Analysis ska ligga efter Strategy Engine.

AI ska konsumera:

- Strategy Signal
- marknadskontext
- journaldata
- relevant historisk statistik
- market regime-data
AI får:

- förklara setup
- sammanfatta kontext
- identifiera osäkerheter
- jämföra med historiska setups
- presentera Atlas thesis
- hjälpa till med market regime classification
AI får inte ändra deterministic Strategy Signal i smyg.

AI-bedömningen ska lagras separat från Strategy Engine-resultatet.

## 12. Risk Engine

Risk Engine ska vara deterministisk.

Risk Engine har veto över alla trades.

Initiala regelkategorier ska stödja:

- max risk per trade
- max daily loss
- max total drawdown
- max samtidiga positioner
- max trades/attempts
- exposure limits
- instrument limits
- correlation limits
- spread limits
- session restrictions
- news restrictions
- cooldown
- account state
- minimum tradable position size
- kill switch
Risk Engine ska returnera exempelvis:

```
ALLOW
DENY
```

eller i framtida fall:

```
ALLOW_REDUCED_SIZE
```

Varje beslut ska innehålla machine-readable reason codes.

## 13. Risk Authority

Risk Engine får aldrig modifieras av AI under runtime.

AI-confidence får inte höja en riskgräns.

Exempel:

AI confidence = 97%

Daily loss limit exceeded = TRUE

Resultat:

```
DENY
```

AI confidence är irrelevant för hard limits.

## 14. Prop Firm Rules Engine

Prop Firm Rules Engine ska vara separat från generell Risk Engine.

Detta lager ansvarar för externa kontoregler såsom:

- daily loss
- maximum loss
- trailing drawdown
- static drawdown
- minimum trading days
- prohibited holding periods
- news restrictions
- weekend restrictions
- consistency rules
- lot/exposure limits
- instrument restrictions
- VPN/VPS/IP rules när relevanta
- challenge-specific rules
Regelprofiler ska vara:

- versionsstyrda
- kontoanknutna
- konfigurerbara
- auditerbara
Ingen prop firm-logik får hårdkodas globalt.

## 15. Trade Proposal

En Trade Proposal skapas endast när Strategy Engine producerat en giltig signal.

Proposal ska minst innehålla:

- instrument
- direction
- strategy
- strategy version
- setup grade
- entry
- SL
- TP
- R:R
- proposed size
- risk %
- risk i pengar
- Strategy result
- AI analysis
- Risk result
- Prop Firm result
- proposal expiry
- reasoning
- status
Exempel på status:

```
WATCHING
READY
RISK_DENIED
PROP_DENIED
AWAITING_APPROVAL
APPROVED
EXPIRED
EXECUTED
```

## 16. Approval Policy

Approval ska vara ett separat lager.

Systemet ska stödja minst:

**Mode 0 – Analysis Only**

Ingen orderläggning är tekniskt tillåten.

## Mode 1 – Read Only

MT5-data får läsas.

Orderläggning är avstängd.

## Mode 2 – Demo Manual Approval

Trade Proposal kräver explicit mänskligt godkännande.

## Mode 3 – Demo Automation

Godkända systemregler får exekvera automatiskt på demo.

## Mode 4 – Live Manual Approval

Live-order kräver explicit mänsklig approval.

## Mode 5 – Controlled Live Automation

Endast efter särskilda performance- och safety-gates.

Systemet får aldrig byta mode automatiskt utan auktoriserad konfigurationsändring.

## 17. Execution Gateway

Execution Gateway ska vara gränsen mellan Omnira och den externa executionmiljön.

Gateway ska:

- verifiera proposal ID
- verifiera approval
- verifiera proposal expiry
- kontrollera att proposal inte redan exekverats
- kontrollera kill switch
- skapa execution intent
- signera eller autentisera request
- logga hela händelsen
Gateway ska inte implementera Strategy Engine-logik.

## 18. Windows Execution Runner

Initial executionmiljö ska vara en dedikerad Windows-dator.

Execution Runner ska:

- kommunicera med Omnira
- kommunicera lokalt med MetaTrader 5
- läsa MT5-status
- skicka tillåtna orderrequests
- rapportera fills
- rapportera positionsstatus
- rapportera broker errors
- skicka heartbeat
Runnern ska vara så liten och deterministisk som möjligt.

Den ska inte självständigt skapa tradingstrategier.

## 19. Initial Deployment Target

Första deployment target:

Dedicated Windows Workstation

Den stationära datorn kan initialt fungera som 24/7 execution-rigg.

Krav:

- sleep avstängt
- stabil internetanslutning
- automatisk återstart
- runner auto-start
- MT5 auto-start
- health monitoring
- korrekt systemtid
- loggning
- diskövervakning
- tydlig kill switch
Arkitekturen ska vara location-agnostic så att samma runner senare kan flyttas till VPS.

## 20. VPS Migration

Execution Runner får inte vara beroende av specifik lokal hårdvara.

På sikt ska den kunna migreras till:

- Windows VPS
- broker-near VPS
- annan godkänd execution host
utan att Strategy Engine, Risk Engine eller Omnira UI behöver ändras.

MetaTrader erbjuder själv 24/7 virtual hosting och beskriver låg latency mot broker-servern som en central fördel med att välja en närliggande server.

## 21. Network Policy

Executionmiljön ska stödja konfigurerbar nätverkspolicy.

Exempel:

direct

```
approved_vpn
static_vpn
approved_vps
```

Systemet ska inte anta att VPN alltid är tillåtet.

Broker- och prop firm-regler ska avgöra vilken network policy som får användas för ett visst konto.

## 22. MetaTrader 5 Bridge

MT5-integrationen ska delas upp logiskt i:

**Read Adapter**

Ansvarar för:

- account info
- balance
- equity
- symbols
- quotes
- bars
- ticks
- open orders
- open positions
- order history
- deal history
## Execution Adapter

Ansvarar för:

- order pre-check
- order creation
- modification
- close
- execution result
- broker rejection
Read och Execution ska ha separata behörighetsgränser i Omnira.

## 23. MT5 Read-Only First

Första MT5-integrationen ska vara strikt read-only.

Systemet ska först bevisa att det stabilt kan läsa:

- account state
- market data
- positions
- historical deals
innan order_send eller motsvarande execution-funktion aktiveras.

## 24. Execution Intent

Execution Runner ska endast acceptera strukturerade execution intents.

Ett intent ska exempelvis innehålla:

- unique execution ID
- proposal ID
- account ID
- instrument
- side
- quantity
- order type
- entry constraints
- SL
- TP
- expiry
- creation timestamp
- approval reference
Execution ID måste vara idempotent.

Samma execution intent får aldrig kunna skapa två positioner på grund av retry eller nätverksfel.

## 24.1 Bounded Authority Lifetime

Låst 2026-08-27. Se Canonical Amendments v1.0, Beslut C.

Ett ExecutionIntent får aldrig skapas redan utgånget, och får aldrig leva längre
än något upstream authority-objekt som krävdes för att skapa det.

Konkret gäller minst:

```
intent.expiresAt > now
intent.expiresAt <= proposal.expiresAt
intent.expiresAt <= approval.expiresAt
```

Motivet är att expiry är en säkerhetsgräns, inte en bekvämlighet. Ett intent som
överlever sin proposal eller sin approval skulle innebära att execution sker på
ett tillstånd som redan upphört att gälla — precis det som avsnitt 25 och
Risk Engine Specification v0.1 §32 finns för att förhindra.

Om ytterligare upstream authority-objekt senare får egen expiry ska samma
konservativa bounded-authority-princip utvärderas genom governance. Den får
inte antas gälla automatiskt.

Detta är en **execution safety-invariant**, inte strategilogik. Den påverkar
inte entry, SL, TP, break-even, sessioner eller riskgränser.

## 25. Pre-Execution Revalidation

Direkt före orderläggning ska systemet kontrollera igen:

- approval fortfarande giltig
- proposal inte expired
- kill switch av
- account korrekt
- instrument korrekt
- ingen förbjuden position redan öppen
- spread inom gräns
- risk fortfarande giltig
- prop firm-regler fortfarande giltiga
- relevant news state fortfarande giltigt
Om resultatet förändrats:

```
EXECUTION_DENIED
```

## 26. Fail Closed

Alla kritiska fel ska som standard leda till:

**ingen ny trade**

Exempel:

- Omnira unreachable
- Risk Engine unavailable
- stale account data
- stale market data
- auth failure
- clock drift
- unknown prop rule state
- duplicated execution ID
- invalid proposal
- expired approval
Systemet får inte anta att frånvaro av information betyder att trading är tillåten.

## 27. Kill Switch

Systemet ska ha flera kill-switch-nivåer.

Minst:

**Global Kill Switch**

Stoppar all ny execution.

## Account Kill Switch

Stoppar trading på ett specifikt konto.

## Strategy Kill Switch

Stoppar en viss strategy version.

## Instrument Kill Switch

Stoppar ett specifikt instrument.

## Runner Kill Switch

Execution Runner accepterar inga nya intents.

Kill switch-status ska vara synlig i Omnira UI.

## 28. Heartbeat och Health

Execution Runner ska regelbundet skicka heartbeat.

Omnira ska kunna se:

- runner online/offline
- MT5 connected/disconnected
- broker connected/disconnected
- account synchronized
- latest market-data timestamp
- latest heartbeat
- runner version
- execution mode
Förlorad heartbeat ska blockera ny execution.

## 29. Journal & Event Log

Systemet ska använda en append-oriented audit trail.

Följande ska kunna återskapas i efterhand:

- vilken data systemet såg
- vilken strategy version som kördes
- vilka regler som passerade
- AI:s bedömning
- riskbeslut
- prop firm-beslut
- approval
- execution intent
- broker response
- fill
- position management
- exit
- slutresultat
Tradinghistoriken ska inte bara bestå av vinnare och förlorare.

Systemets beslutsprocess ska kunna granskas.

## 30. Atlas Market View

Omnira Trading UI ska innehålla en TradingView-liknande Market View.

Den ska visualisera backendens state och får inte själv bestämma tradinglogik.

Market View ska kunna visa:

- chart
- 4H-open
- liquidity
- FVG
- manipulation
- iFVG
- CISD
- SMT
- strategy state
- entry
- SL
- TP
- R:R
- setup grade
- Atlas analysis
- Risk Engine-resultat
- Prop Firm-resultat
- approval status
- position
- trade management
- execution events
Målet är att användaren visuellt ska kunna förstå:

Vad ser Atlas?

Vad väntar systemet på?

Vilken trade planeras?

Varför får eller får den inte tas?

## 31. UI Separation

Chart UI får aldrig vara source of truth.

Source of truth ska ligga i backend.

UI ska rendera exempelvis:

LiquidityZone

FVGZone

SetupState

TradeProposal

RiskDecision

från Trading APIs eller realtime events.

Om UI stängs ska systemets analysstate fortfarande vara korrekt.

## 32. Realtime Events

Tradingdomänen ska kunna publicera events såsom:

```
MARKET_DATA_UPDATED
SETUP_CREATED
MANIPULATION_CONFIRMED
ENTRY_CONFIRMATION_DETECTED
STRATEGY_SIGNAL_CREATED
RISK_DENIED
PROP_RULE_DENIED
PROPOSAL_CREATED
PROPOSAL_APPROVED
EXECUTION_REQUESTED
ORDER_FILLED
POSITION_UPDATED
TRADE_CLOSED
KILL_SWITCH_ACTIVATED
```

Detta möjliggör realtime UI utan att koppla UI direkt till Strategy Engine.

## 33. Environment Separation

Minst följande miljöer ska hållas separata:

- development
- backtest
- demo
- live
Demo- och live-credentials får aldrig blandas.

Systemet ska visuellt markera vilken environment som används.

Live ska ha tydligare safety gates än demo.

## 34. Credential Security

Broker- och MT5-credentials ska:

- aldrig ligga i frontend
- aldrig finnas i strategy config
- aldrig skrivas till vanliga logs
- lagras som secrets
- endast vara tillgängliga för nödvändig runtime
Execution Runner ska använda minsta möjliga behörighet.

## 35. Observability

Systemet ska logga tekniska metrics såsom:

- data latency
- API latency
- execution latency
- broker response time
- reconnects
- dropped events
- stale data events
- proposal count
- risk denial count
- execution errors
Teknisk systemhälsa ska hållas separat från trading performance.

## 36. Replayability

En historisk setup ska i möjligaste mån kunna replayas genom samma Strategy Engine som används live.

Det ska göra det möjligt att fråga:

Vad hade Strategy v1.0 beslutat vid exakt denna tidpunkt med endast den information som fanns då?

Detta ska skydda mot look-ahead bias.

## 37. Determinism

Samma:

- strategy version
- input data
- configuration
- timestamp context
ska producera samma deterministic Strategy Engine-resultat.

AI Analysis kan vara probabilistisk.

Strategy Engine och Risk Engine får inte vara det där hard rules används.

## 38. Backtest Architecture

Backtestmotorn ska mata historisk data genom samma strategigränssnitt som live-systemet.

Backtest ska inte ha en separat förenklad strategy implementation.

Skillnader mellan live och backtest ska begränsas till data-/execution adapters.

## 39. Execution Simulation

Demo/backtest ska kunna simulera:

- spread
- commissions
- slippage
- partial fills där relevant
- rejected orders
- latency
Resultat utan tradingkostnader ska inte behandlas som tillräcklig live-validering.

## 40. Recovery

Execution Runner och Omnira ska kunna återhämta sig efter omstart.

Vid startup ska systemet först göra reconciliation:

- vilket konto är aktivt?
- vilka orders finns?
- vilka positions finns?
- vad tror Omnira är öppet?
- matchar states?
Ingen ny trade får skickas innan reconciliation är klar.

## 41. Orphan Position Protection

Om MT5 visar en öppen position som Omnira inte känner till ska systemet markera:

```
UNKNOWN_POSITION
```

och stoppa ny trading på kontot tills tillståndet är granskat eller reconciled.

Systemet får inte automatiskt anta ägarskap över en okänd live-position.

## 42. Manual Trading

Systemet måste kunna identifiera att en position kan ha skapats manuellt utanför Omnira.

Manuella trades får inte blandas ihop med Omnira-strategins performance.

Journalen ska kunna skilja:

- Omnira generated
- manual external
- imported historical
## 43. Initial Architecture Boundary

Fas 1 ska inte implementera full execution automation.

Initial arkitektur ska däremot redan göra plats för den.

Första implementationen ska prioritera:

- datamodell
- strategy contracts
- journal
- risk rule definitions
- account/broker/instrument models
- architecture boundaries
## 44. Fas 2 Boundary

MT5 Read Only får endast aktivera funktioner som behövs för att läsa och synkronisera data.

MT5:s officiella Python-interface exponerar separat funktionalitet för bland annat bars, ticks, orders, positions och history samt en separat order_send()-funktion för trading requests. Detta stödjer arkitekturens uppdelning mellan read och execution.

## 45. Future Autonomy

Autonom trading är inte ett tekniskt standardläge.

Det är ett privilegium som endast får aktiveras efter dokumenterade gates.

Exempel på framtida gates:

- strategy canonical
- backtest pass
- out-of-sample pass
- forward-test pass
- demo execution pass
- risk engine validation
- failure testing pass
- reconciliation pass
- kill-switch pass
- prop rules validation
- controlled live performance
Autonomi ska kunna återkallas om performance eller systemhälsa försämras.

## 46. Canonical Architectural Principle

Den viktigaste arkitekturregeln är:

Ingen komponent ska ha större auktoritet än den behöver.

Strategy Engine hittar trades.

AI förklarar och analyserar.

Risk Engine skyddar kapital.

Prop Firm Engine skyddar externa regler.

Approval Policy bestämmer behörighet.

Execution Runner exekverar exakt det den fått rätt att exekvera.

Journalen dokumenterar allt.

Atlas ger användaren en begriplig helhetsbild.

## Dokumentstatus

Dokument: Omnira Trading System – Systemarkitektur

Version: v0.1

Revision: 2026-08-27 – nytt avsnitt 24.1, bounded authority lifetime för
ExecutionIntent. Additiv execution safety-invariant. Inget befintligt avsnitt
ändrat. Se Canonical Amendments v1.0, Beslut C.

Status: Fas 0 – Första arkitekturbaslinje

Strategy: Canonical v1.0 finns

Risk Engine: Ej fullständigt specificerad

Prop Firm Engine: Ej fullständigt specificerad

Datamodell: Nästa Fas 0-del

MT5 implementation: Ej påbörjad

Execution: Förbjuden

Live trading: Förbjuden

Detta dokument ska granskas och utvecklas vidare innan det blir Canonical Architecture v1.0.
