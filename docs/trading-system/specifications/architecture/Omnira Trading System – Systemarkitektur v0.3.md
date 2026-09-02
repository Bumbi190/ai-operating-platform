# Omnira Trading System

## Systemarkitektur v0.3

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

Execution Provider Adapter

```
↓
```

Futures Execution Provider

```
↓
```

Journal & Analytics

Ingen komponent får kringgå ett efterföljande säkerhetslager.

## 2.1 Deployment-beroende noder

Kedjan ovan anger den **logiska** auktoritetsordningen. Två av leden är obligatoriska
oavsett hur systemet driftsätts:

- **Execution Gateway** — gränsen där auktoritet kontrolleras
- **Execution Provider Adapter** — gränsen mot en specifik extern provider

Ett separat **Execution Runtime / Runner** är däremot **deployment-beroende**. Om en
egen process eller host krävs beror på vald provider och driftsmodell. När den behövs
placeras den mellan Gateway och Adapter:

```
Execution Gateway
→ Execution Runtime / Runner
→ Execution Provider Adapter
```

Ett runtime-lager är alltså inte en universell invariant och får inte modelleras som
obligatorisk arkitektur. Ingen executionplattform — Windows eller annan — är låst.

Bakom `Futures Execution Provider` kan det finnas broker, FCM eller prop
firm-infrastruktur beroende på uppsättning. Extern faktisk account-, order-, position-
och fill-state förblir source of truth för faktisk exponering.

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
- provider integration
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

Providerdata får läsas.

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

## 18. Execution Runtime (deployment-beroende)

Ett separat Execution Runtime är **inte** en universell arkitekturinvariant. Om en egen
process eller host krävs beror på vald Futures Execution Provider och driftsmodell.

Ingen executionplattform är låst. Windows är inte längre ett arkitekturantagande — det
var en konsekvens av ett tidigare MT5-antagande som är korrigerat i Beslut D.

R|Protocol är WebSocket och Protocol Buffers, språk- och OS-oberoende och lämpat för
cloud- och backendsystem. Ett obligatoriskt lokalt eller Windows-bundet terminalrunner är
därför **inte förväntat**. Om Omnira ändå använder en dedikerad providertjänst för
isolation är det ett deploymentbeslut, inte ett arkitekturkrav. GATE-17 är fortfarande
öppen.

När ett separat runtime **behövs** ska det:

- kommunicera med Omnira
- hosta eller anropa Execution Provider Adapter
- vidarebefordra tillåtna orderrequests
- rapportera fills
- rapportera positionsstatus
- rapportera provider errors
- skicka heartbeat
Runtime ska vara så litet och deterministiskt som möjligt.

Det ska inte självständigt skapa tradingstrategier och inte innehålla strategilogik.

När providern kan nås direkt och säkert från Omnira utan mellanliggande host får
kedjan gå direkt från Execution Gateway till Execution Provider Adapter. Se avsnitt 2.1.

Val av runtime-topologi är en öppen fråga. Se GATE-17.

## 19. Initial Deployment Target

Deployment target är **inte låst**. Det följer av vald provider och av om ett separat
Execution Runtime alls krävs. Se avsnitt 2.1, avsnitt 18 och GATE-17.

Om ett kontinuerligt driftande runtime behövs gäller följande krav oavsett plattform:

- sleep avstängt
- stabil internetanslutning
- automatisk återstart
- runtime auto-start
- health monitoring
- korrekt systemtid
- loggning
- diskövervakning
- tydlig kill switch
Arkitekturen ska vara location-agnostic så att runtime senare kan flyttas.

## 20. Host Migration

Ett Execution Runtime får inte vara beroende av specifik lokal hårdvara eller ett
specifikt operativsystem.

Det ska kunna migreras till:

- provider-nära host
- annan godkänd execution host
- managed runtime där providern stödjer det
utan att Strategy Engine, Risk Engine eller Omnira UI behöver ändras.

Latency mot providerns endpoint är en relevant faktor vid hostval, men får aldrig
motivera att ett säkerhetslager kringgås.

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

## 22. Execution Provider Adapter

Integrationen mot en Futures Execution Provider ska delas upp logiskt i:

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

Adaptern är den enda plats som får känna till en specifik providers API, autentisering,
ordermodell och symbolformat. Ingenting ovanför adaptern i kedjan får innehålla
providerspecifik kunskap.

Flera adaptrar ska kunna existera.

## 22.2 Vald första provider

Låst 2026-08-28. Se Canonical Amendments v1.0, Beslut E.

**Första implementationsmål: Rithmic R|Protocol API**, utvecklat mot Rithmic Test.
**Planerad andra adapter: Tradovate.**

Rithmic är **första implementationsmål, inte permanent exklusiv provider**. Arkitekturen
förblir multi-provider capable, och ingen providerspecifik kunskap får hårdkodas i Trading
Core eller någonstans ovanför adaptergränsen.

TradeSea är **inte** ett execution provider-mål. Det är en front-end ovanpå Rithmic eller
motsvarande infrastruktur, och ligger arkitektoniskt på samma nivå som Omnira själv.

Provider-valet innebär **inte** att produktionscredentials finns, att en broker- eller
FCM-relation finns, att prop firm-kompatibilitet är löst, att market data-licensiering är
löst eller att conformance är passerad. Se avsnitt 22.3.

## 22.3 Provider-neutralt adapterkontrakt

Adaptergränsytan är låst i ett eget dokument:

```
specifications/execution-provider/
  Omnira Trading System – Execution Provider Adapter
  – Level 1 Read Only – Canonical v1.0.md
```

Level 1 är **read only** och deklarerar noll execution-metoder. Providerskillnader uttrycks
deterministiskt genom:

- `ProviderCapabilities` med `CapabilityState` — SUPPORTED / UNSUPPORTED / CONDITIONAL / UNKNOWN
- `Available<T>` för fältillgänglighet — PRESENT / UNAVAILABLE / UNKNOWN
- `FillHistory.completeness` — COMPLETE / TRUNCATED / UNKNOWN
- `CredentialMode` — READ_ONLY_ENFORCED / READ_WRITE_CAPABLE / UNKNOWN
- normaliserade `ReasonCode`

**Säkerhetsregel:** endast `SUPPORTED` uppfyller ett säkerhetskritiskt capability-krav.
`CONDITIONAL` och `UNKNOWN` fail closed. Dessa states får aldrig kollapsas till boolean.

**Auktoritetsgräns:** en provider-observation är ett record och kan aldrig minta
`RiskClearance`, `PropClearance`, `ApprovalGrant` eller `ExecutionIntent`. Fas 1-invarianten
*authority is issued, not derived from data* gäller oförändrat.

## 22.1 Contract Resolution

En futures-provider handlar kontrakt, inte generiska symboler. Adaptern ansvarar för att
översätta Omniras instrumentidentitet till providerns kontraktsidentitet, inklusive
vilket kontrakt som är aktuellt.

Rollover-policy hör till marknadsdata- och kontraktsserielagret och är sedan
2026-09-02 låst i `specifications/market-data/Omnira Trading System – Market Data &
Contract Lifecycle – Canonical v1.0.md` (Beslut I). GATE-08 är därmed delvis
stängd: arkitekturen är avgjord, operativt providerval kvarstår.

Kedjan från canonical root till Strategy Engine är:

```
root  →  ContractCalendar-resolver  →  ResolvedContract
      →  kontraktsskopad marknadsdatakälla
      →  kanonisk 1m-normalisering
      →  Omnira-aggregering (5m / 15m / 4H)
      →  ContractCandleSegment  →  Strategy Engine
```

Root-upplösning sker **före** varje providervänd konkret kontraktsdataförfrågan.
Ingen källa avgör internt vilket kontrakt en root motsvarar. Providernativa
symboler och kontraktsidentifierare stannar under providergränsen och blir
aldrig canonical identitet.

## 23. Read-Only First

Första integrationen mot en ny provider ska vara strikt read-only.

Systemet ska först bevisa att det stabilt kan läsa:

- account state
- market data
- positions
- historisk orderhistorik
innan någon orderfunktion aktiveras.

Detta är innehållet i **Fas 2 – Futures Connectivity (Read Only)**, vars första
implementationsmål är Rithmic R|Protocol mot Rithmic Test. Se avsnitt 22.2.

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
- provider connected/disconnected
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

Provider- och brokercredentials ska:

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

Om providern visar en öppen position som Omnira inte känner till ska systemet markera:

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

Fas 2 – Futures Connectivity (Read Only) får endast aktivera funktioner som behövs för
att läsa och synkronisera data.

En provider exponerar typiskt separat funktionalitet för bars, ticks, orders, positions
och history, skilt från de anrop som skickar trading requests. Adaptern ska spegla den
uppdelningen: read-kapabilitet och execution-kapabilitet ska vara separat behörighetsstyrda
och separat aktiverbara, oavsett vilken provider som senare väljs.

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

Version: v0.3

Revision: 2026-08-27 – nytt avsnitt 24.1, bounded authority lifetime för
ExecutionIntent. Additiv execution safety-invariant. Inget befintligt avsnitt
ändrat. Se Canonical Amendments v1.0, Beslut C.

Version 0.3, 2026-08-28 – första execution provider vald (Rithmic R|Protocol, avsnitt
22.2) och provider-neutralt Level 1-adapterkontrakt låst (avsnitt 22.3). Evidens om
runtime-topologi tillagd i avsnitt 18. GATE-15 och GATE-16 stängda; GATE-17, GATE-08 och
GATE-09 fortsatt öppna. Ingen strategiregel och ingen riskregel ändrad. Se Canonical
Amendments v1.0, Beslut E.

Version 0.2, 2026-08-28 – futures-native, provider-neutral execution-arkitektur.
MetaTrader 5 var ett felaktigt implementation-specifikt antagande för en NQ/MNQ
futures-strategi och är borttaget som arkitekturberoende. Ändrade avsnitt: 2 (kedjan),
nytt 2.1 (deployment-beroende noder), 18 (runtime, ej längre Windows-bundet),
19–20 (deployment/host), 22 (Execution Provider Adapter), nytt 22.1
(contract resolution), 23 (read-only first). Se Canonical Amendments v1.0, Beslut D.
Ingen strategiregel och ingen riskregel ändrad.

Status: Fas 0 – Första arkitekturbaslinje

Strategy: Canonical v1.0 finns

Risk Engine: Ej fullständigt specificerad

Prop Firm Engine: Ej fullständigt specificerad

Datamodell: Nästa Fas 0-del

Provider adapter implementation: Ej påbörjad. Första provider: Rithmic R|Protocol (GATE-15 stängd 2026-08-28)

Execution: Förbjuden

Live trading: Förbjuden

Detta dokument ska granskas och utvecklas vidare innan det blir Canonical Architecture v1.0.
