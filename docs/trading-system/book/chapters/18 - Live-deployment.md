# Kapitel 18 – Live-deployment

Live-deployment är den punkt där Omnira Trading System för första gången får påverka verkligt kapital.

Detta är inte bara nästa tekniska steg.

Det är en förändring av systemets risknivå.

Från och med denna fas kan:

- implementation bugs
- brokerproblem
- dataproblem
- konfigurationsfel
- felaktig riskberäkning
- mänskliga misstag
få verklig ekonomisk konsekvens.

Därför ska live-deployment ske gradvis och under strikt kontroll.

Den centrala principen är:

Live är en ny valideringsfas, inte slutmålet.

## Live börjar inte med full automation

Den första livefasen ska vara:

**LIVE MANUAL APPROVAL**

Inte:

**FULLY AUTONOMOUS LIVE**

Det innebär att Strategy Engine, Risk Engine, Prop Firm Engine och Execution Layer fungerar som i demo, men varje trade kräver explicit mänskligt godkännande.

## Progression från Demo till Live

Rekommenderad progression:

```
Demo Auto – PASS
→
```

```
Live Read Only
→
```

```
Live Manual Approval
→
```

```
Controlled Live Automation
→
```

## Gradvis uppskalning

Varje steg ska ha separat sign-off.

## Live Read Only

Innan systemet får skicka första liveordern ska det först ansluta till det riktiga kontot i:

```
READ_ONLY
```

Vi ska verifiera:

- account identity
- broker/server
- account balance
- equity
- margin
- symbols
- positions
- orders
- deal history
- relevant market data
- prop profile mapping
Ingen liveorder ska skickas i denna fas.

## Varför Live Read Only behövs

Demo och live kan skilja sig.

Exempel:

- symbols
- contract naming
- account permissions
- broker server
- tick values
- market data
- fees
- execution settings
Live Read Only gör att dessa skillnader upptäcks innan kapital riskeras.

## Live Account Verification

Det första livekontot ska bindas explicit till:

- TradingAccount
- broker
- environment = LIVE
- RiskProfile
- PropFirmProfile där relevant
- approved instruments
- approved strategy versions
- approved runner
Ingen implicit mapping är tillåten.

## Live Account Allowlist

Runnern ska endast få exekvera mot exakt godkända live accounts.

Om ett annat account är aktivt:

```
ACCOUNT_MISMATCH
→
```

**NO EXECUTION**

## Live Instrument Allowlist

För den första livefasen ska execution surface hållas liten.

Om den faktiska execution-strategin använder MNQ kan allowlist initialt begränsas till:

```
MNQ
```

Det minskar blast radius.

## Strategy Version Lock

Live ska endast använda en explicit godkänd canonical strategy version.

Exempel:

Omnira Liquidity Manipulation – Canonical v1.0

Candidate-versioner får inte kunna exekveras live.

## Detection Version Lock

Alla strategy-critical detection rules måste också vara versionsbundna.

Det gäller särskilt:

- liquidity detection
- FVG
- swing detection
- iFVG
- CISD
- SMT
Live ska använda exakt samma detectionversion som den version som passerat validation.

## Risk Profile Lock

Det livekonto som aktiveras ska ha en specifik:

RiskProfileVersion

Det får inte använda:

latest

som dynamisk pointer.

En profiländring ska kräva separat activation.

## Prop Firm Profile Lock

Om account är prop firm-baserat ska det också bindas till en verifierad:

PropFirmProfileVersion

Profilen ska baseras på aktuell dokumentation för det faktiska programmet.

## Prop Rule Verification före första live-trade

Innan ett prop account aktiveras ska användaren manuellt verifiera:

- provider
- program
- account size
- drawdownmodell
- daily loss-regel
- reset policy
- position limits
- news rules
- holding rules
- relevant network/VPN/VPS-regler
Datum för verifiering ska sparas.

## Ingen Rule Guessing

Om en prop firm-regel är oklar:

```
UNKNOWN
```

ska inte tolkas som:

```
ALLOWED
```

Regeln måste verifieras innan live automation.

## Live Deployment Sign-Off

Innan live capability aktiveras ska en formell sign-off genomföras.

Den ska minst kontrollera:

**Strategy**

- canonical version
- backtest PASS
- forward evidence
- demo evidence
## Risk

- active RiskProfile
- daily stop
- position sizing
- max attempts
- kill switches
## Prop Firm

- active ruleset
- rule source
- verified date
## Execution

- runner healthy
- providern verified
- account verified
- symbol mapping verified
- idempotency verified
- reconciliation verified
## Security

- credentials protected
- environment separation
- allowlists
- auth
- audit
## Live Release Candidate

Den kod och configuration som ska användas live bör först behandlas som en release candidate.

Exempel:

Omnira Trading Runtime – Live RC1

RC1 ska motsvara den version som slutligen kördes i Golden Demo Run.

## No Last-Minute Changes

Efter Golden Demo Run bör inga materiella strategy-, risk- eller executionförändringar göras utan ny relevant verification.

Annars är det inte samma system som testades.

## Deployment Freeze Window

Inför första liveperioden bör critical configuration frysas.

Det innebär att vi inte samtidigt:

- byter strategy
- ändrar risk
- byter market provider
- byter runner
- ändrar providern integration
om det inte är absolut nödvändigt.

För många samtidiga förändringar gör root-cause analysis svårare.

## Initial Live Risk

Den första livefasen ska använda mycket liten kapitalrisk.

Målet är inte att maximera profit.

Målet är att bevisa att:

Systemets demoresultat och tekniska beteende överförs till verklig execution.

Risk ska därför hållas på den lägsta praktiskt användbara nivån som fortfarande låter strategin exekveras korrekt.

## Technical SL ska inte ändras

Även när live-risken reduceras ska position size anpassas.

Technical SL ska fortfarande bestämmas av strategy structure.

Om minsta kontrakt ger för hög risk:

**NO TRADE**

## Live Manual Approval

Den första liveexecutionen ska kräva explicit human approval.

Användaren ska se:

- LIVE
- account
- instrument
- direction
- quantity
- planned entry
- SL
- TP
- initial R:R
- risk $
- risk %
- daily risk
- prop headroom
- strategy version
- setup grade
## Live UI måste vara omisskännligt

LIVE-mode ska vara visuellt mycket tydligt.

Det ska inte vara möjligt att enkelt tro att användaren befinner sig i demo.

## First Live Trade

Den första live-traden ska behandlas som ett systemtest.

Vi vill verifiera:

- proposal
- approval
- execution intent
- runner receipt
- order submission
- actual fill
- SL
- TP
- journal
- position sync
Profit eller loss är sekundärt.

## First Live Fill Review

Efter första fill ska systemet direkt jämföra:

**Planned Entry**

mot:

**Actual Fill**

och:

**Planned Risk**

mot:

**Actual Risk**

Detta visar om demo execution assumptions var realistiska.

## Broker-Native SL Verification

Ingen liveposition ska betraktas som korrekt skyddad innan broker-native SL verifierats.

Om SL inte kan verifieras:

CRITICAL LIVE INCIDENT

## Initial Live Monitoring

De första live-trades ska övervakas extra noggrant.

Vi ska följa:

- fill latency
- slippage
- commissions
- SL
- TP
- break-even
- trade close
- reconciliation
Detta skapar live execution baseline.

## Manual Approval och 1m Strategy

Eftersom strategy entry sker på 1m kan manual approval försämra execution.

Detta ska mätas.

Om live manual approval regelbundet leder till:

- missed entries
- R:R under 2
- hög slippage
ska systemet inte kringgå regeln.

Det ska istället skapa evidens för varför Controlled Live Automation senare kan behövas.

## No Forced Entry after Approval Delay

Om priset har rört sig för långt när user approve:ar ska Pre-Execution Revalidation stoppa traden.

Live FOMO får aldrig överstyra strategy rules.

## Live Risk Engine

Risk Engine ska använda riktig account state.

Canonical baseline:

- $150 max risk/trade
- $450 realized daily loss
- max 1 open position
- max 3 attempts per thesis
Den faktiska Controlled Live Risk Profile kan senare sättas lägre under första livevalidationen genom explicit versionerad profil.

## Lägre Live Risk är tillåtet

Canonical strategy regler behöver inte ändras för att vi använder lägre live risk.

RiskProfile är separat från StrategyVersion.

Detta är viktigt.

## Ingen automatisk Risk Increase

Om första tio trades går bra får Atlas inte höja risk.

Riskökning kräver en separat scaling gate.

## Daily Stop i Live

Daily stop måste vara aktiv från första live-traden.

När canonical aktiva RiskProfile gräns nås:

- inga nya trades
- öppen position hanteras enligt riskpolicy
- status låses
- audit event skapas
## Kill Switch före första trade

Före första liveexecutionen ska användaren själv ha testat var:

**Global Kill**

och relevant:

**Account Kill**

finns och fungerar.

Man ska inte behöva lära sig detta under en incident.

## Human Emergency Procedure

En enkel första incidentprocedur ska finnas:

- Stoppa nya trades.
- Kontrollera faktisk providern-position.
- Kontrollera broker-native SL.
- Använd Emergency Close endast när det verkligen behövs.
- Reconcile systemet.
- Dokumentera incidenten.
## Live providern Reconciliation

Broker state är source of truth för actual exposure.

Live-systemet ska kontinuerligt jämföra:

- account
- orders
- positions
- deals
mot Omniras expected state.

## Reconciliation Mismatch

Vid mismatch:

LIVE EXECUTION BLOCKED

tills problemet är löst.

## Manual External Position

Under early live bör manuella positions helst undvikas på samma account.

Om de ändå uppstår måste Omnira upptäcka dem och inkludera exposure i risk.

## One System per Account

Under första livevalidationen är det säkrast om samma konto inte används samtidigt av flera tradingbots.

Det reducerar ambiguity.

## Account State Freshness

Risk och Prop checks måste baseras på färsk live account data.

En gammal account snapshot får inte användas för ny execution.

## Prop Firm Headroom

För prop account ska UI visa aktuell headroom.

Exempel:

**Daily Loss Headroom**

## Maximum Loss Headroom

## Position Limit

## Rule Status

Detta ska vara synligt före approval.

## Prop Firm Safety Buffer

När relevant kan en separat operational buffer användas ovanför firmans absoluta limit.

Exakt värde ska:

- definieras
- testas
- versioneras
inte improviseras under live.

## Live News Data

News source måste vara healthy.

Om relevant news state är:

```
UNKNOWN
```

ska:

**NO NEW LIVE TRADE**

## Live News Exit

T-15m news exit ska först ha testats på demo.

I live ska trigger och execution loggas noggrant.

## News Exit Outage

Om systemet förlorar connection nära T-15m finns residual risk.

Detta är en av anledningarna till att liveövervakning och framtida VPS kan vara viktiga.

## Live Break-Even

BE modification ska verifieras mot broker state på samma sätt som i demo.

Det ska inte räcka att systemet skickade requesten.

## Live Time Exit

New York max fyra timmar ska följas och verifieras.

## Live Slippage

Actual live slippage ska analyseras separat från demo.

Demo slippage kan vara mer idealiserad än live.

## Live Fees

Actual commissions och fees ska användas i performance analytics.

## Actual Risk Overrun

Om actual fill gör att trade riskerar mer än planerat ska överrun mätas.

Exempel:

Planned = 1.00R

Actual = 1.07R

Detta ska ingå i execution quality.

## Critical Risk Overrun

Om slippage skapar en betydande breach av godkänd risk ska detta bli Risk/Execution Incident.

Exakt policy definieras innan liveautomation.

## Live Manual Phase Duration

Live Manual ska inte avslutas efter ett fåtal trades bara för att de fungerade.

Det krävs relevant:

- trade sample
- execution sample
- market regime coverage
- incident-free drift
Exakta promotion thresholds definieras i scaling/gate-kapitlen.

## Strategy Performance i Live

Vi ska jämföra:

- Backtest
- Forward
- Demo
- Live
Det viktiga är om live beter sig rimligt nära den tidigare evidence-profilen.

## Technical Performance i Live

Parallellt mäts:

- runner uptime
- providern availability
- slippage
- order rejection
- reconciliation incidents
- SL/TP incidents
- latency
## Live Performance Decay

En viss försämring från backtest/demo kan vara normal.

Men systemet ska mäta den.

Exempel:

Backtest expectancy = +0.30R

Demo = +0.25R

Live = +0.17R

Då behöver vi förstå varför.

## Controlled Live Automation

Först när Live Manual har tillräcklig teknisk och tradingmässig evidens får Controlled Live Automation övervägas.

Det innebär att human approval per trade tas bort.

## Controlled betyder begränsad

Controlled Live Automation ska inte betyda:

Atlas får göra vad den vill.

Automation ska vara begränsad till explicit:

- account
- strategy
- strategy version
- instrument
- risk profile
- prop profile
- session
- execution policy
## Automation Policy

Ett exempel kan vara:

CONTROLLED_LIVE_AUTO-v1

som endast tillåter:

- specific account
- MNQ
- Omnira Liquidity Manipulation v1.0
- specific RiskProfile
- specific PropFirmProfile
- canonical sessions
## No Cross-Account Autonomy

Att ett account godkänts för automation innebär inte att andra accounts automatiskt får samma permission.

Autonomy är account-scoped.

## No Strategy Autonomy Inheritance

När framtida Strategy v2 skapas får den inte automatiskt ärva liveautomation från v1.

Ny strategy kräver egen validation.

## Automation Kill Switch

Controlled Live Auto ska alltid kunna stoppas omedelbart.

En user action ska kunna sänka mode till exempelvis:

```
LIVE_MANUAL
```

eller:

```
READ_ONLY
```

## Automatic Safety Downgrade

Critical events ska kunna sänka autonomy.

Exempel:

```
CONTROLLED_LIVE_AUTO
→
READ_ONLY
```

vid:

- reconciliation failure
- account mismatch
- repeated execution incident
- unknown prop state
## Ingen automatisk Re-enable

Efter safety downgrade ska systemet inte själv återgå till full automation bara för att connection återkommer.

Verifiering krävs.

## Live Incident Policy

En zero-tolerance-incident ska kunna stoppa automation.

Exempel:

- unintended duplicate order
- wrong account
- wrong quantity
- unverified SL
- unknown position efter execution
## Incident-free Window

Promotion och fortsatt automation ska kräva stabil drift.

Det räcker inte att ett problem fixats fem minuter tidigare.

## Rollback

Om en ny live runtime-version orsakar problem ska systemet kunna:

- stoppa execution
- återgå till verifierad version där möjligt
- reconcila
- verifiera account
Rollback är inte klar förrän broker state är korrekt.

## Live Deployment under Open Position

Undvik onödiga deployment changes med öppen position.

Om en kritisk fix måste deployas krävs särskild procedure och position awareness.

## Monitoring

Live operation ska ha en tydlig health dashboard.

Minst:

- Omnira backend
- market data
- news data
- Risk Engine
- Prop Engine
- runner
- providern
- broker connection
- reconciliation
- kill switches
## Alerts

Kritiska live alerts ska prioriteras.

Exempel:

**CRITICAL**

Live MNQ-position saknar verifierad broker-native SL.

Detta ska inte drunkna bland vanliga tradingnotiser.

## Live Daily Review

I början ska varje live tradingdag kunna reviewas.

Atlas kan sammanfatta:

- setups
- proposals
- approvals
- trades
- risk
- execution
- incidents
- discrepancies
## First 10 / 25 / 50 Trade Reviews

Early live kan ha särskilda review checkpoints.

Exempel:

- efter 10 trades
- efter 25
- efter 50
Dessa siffror är reviewpunkter, inte ännu färdiga statistical promotion gates.

Vid varje checkpoint granskas både:

- strategy behavior
- technical behavior
## Learning Layer i Live

Atlas Trading Learning & Improvement Layer får analysera live data från första dagen.

Det får skapa:

- findings
- hypotheses
- candidate versions
Men får fortfarande inte ändra live canonical rules.

## Live Findings

Exempel:

Actual live slippage är systematiskt högre mellan 10:00–10:05 än i demo.

Det kan skapa en execution research hypothesis.

## No Live Experimentation

Production account ska inte användas för okontrollerade experiment.

Candidate strategy/risk/execution changes ska testas utanför live först.

## A/B Testing

Om framtida A/B testing används får den inte introduceras utan egen governance och riskmodell.

Det är inte del av initial live deployment.

## Live Data som högsta evidensnivå

Live performance är viktig evidens eftersom den inkluderar:

- verkliga fills
- verkliga fees
- verklig infrastructure
- verkliga prop rules
Men även live sample kan vara litet eller regime-specific.

Det är inte automatiskt sanningen om framtiden.

## Psychological Separation

Systemet ska minska risken att kortsiktiga live outcomes leder till emotionella regeländringar.

Exempel:

Fem losses i rad ska inte leda till:

Höj risk för att vinna tillbaka.

Canonical governance finns just för detta.

## Manual Override

Människan ska kunna:

- stoppa trading
- sänka autonomy
- emergency close
Men ska inte ha en enkel knapp:

IGNORE RISK DENY

Safety-regler måste behålla sin integritet även live.

## Prop Challenge Discipline

Om account är challenge-baserat ska systemet inte jaga target.

En nästan klar challenge ska fortfarande följa:

- Strategy
- Risk
- Prop rules
## Funded Account Discipline

När en challenge passerats är funded inte ett läge där riskregler kan lättas automatiskt.

Det nya accountet får sin egen verifierade profile och deployment gate.

## Payout State

När relevant ska payout-cycle och funded-specific rules hanteras av Prop Firm Engine.

Trading Strategy ska inte ändras för att en payout närmar sig om ingen versionsstyrd policy säger det.

## Live Security

Live runnern ska vara hårdare skyddad än demo.

Minst:

- least privilege
- secrets
- auth
- allowlist
- environment lock
- network security
- auditing
## Dedicated Execution Host

När riktig kapitalrisk finns blir det ännu viktigare att execution-host är stabil och kontrollerad.

Initialt kan Windows-riggen användas.

Men systemet ska kontinuerligt mäta:

- uptime
- outages
- latency
för att avgöra när VPS blir motiverat.

## VPS Migration Gate

Flytt till VPS ska betraktas som deploymentförändring.

Det kräver:

- environment verification
- broker/prop policy check
- providern verification
- runner verification
- read-only test
- demo eller controlled verification där relevant
## No Architecture Rewrite for VPS

Strategy, Risk, Prop, Journal och Atlas ska inte behöva ändras.

Endast execution host/deployment layer ska flyttas.

## Disaster Recovery

Live-deployment ska ha en plan för att återställa:

- runner
- providern
- account binding
- configurations
- database
- audit
Efter restore:

**READ ONLY**

tills reconciliation passerat.

## Backup är inte Live State

En backup kan vara gammal.

Broker state måste alltid läsas på nytt efter restore.

## Live Deployment Checklist

Inför varje ny live activation ska checklistan minst omfatta:

- correct code release
- correct strategy version
- correct RiskProfile
- correct PropFirmProfile
- correct account
- correct environment
- correct symbol mapping
- correct runner
- healthy market data
- healthy news
- reconciliation PASS
- kill switches OFF men verifierade
- audit active
- no unresolved critical incident
## Go / No-Go

Slutbeslutet är:

**GO**

eller:

**NO-GO**

Om någon safety-critical gate är osäker:

**NO-GO**

## Live Does Not Mean Done

Efter live start fortsätter utvecklingen.

Systemet går från:

**Build**

till:

**Operate + Learn + Improve**

Det innebär:

- monitoring
- analytics
- incident review
- research
- controlled evolution
## Controlled Evolution

Live strategy ska förändras långsamt och genom versioner.

Exempel:

Canonical v1.0

```
→ data
→ candidate v1.1
→ backtest
→ OOS
→ forward
→ review
→ canonical v1.1
→ separat live deployment
```

## Live Roll Forward

En ny canonical version ska behandlas som en ny deployment candidate.

Den är inte säker bara för att föregående version var det.

## Scaling är separat

Att systemet är live-ready betyder inte att risk ska maximeras.

Riskuppskalning är nästa separata problem.

Det behandlas i kapitlet:

**Kriterier för uppskalning**

## Live Deployment Principle

Den viktigaste principen är:

Första live-traden ska vara början på en ny testfas, inte slutet på utvecklingen.

Systemet ska först bevisa:

- correct real execution
- correct real risk
- correct real prop compliance
- stable infrastructure
- consistent strategy behavior
med minimal praktisk risk.

Först när detta håller över tid får större autonomi och större kapital övervägas.

## Kapitelstatus

Kapitel: 18 – Live-deployment

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Första live mode: READ ONLY

Första execution mode: LIVE MANUAL APPROVAL

Full live automation: Inte tillåten initialt

Controlled Live Automation: Kräver separat gate

Initial kapitalrisk: Ska hållas mycket låg

Canonical StrategyVersion: Explicit låst

RiskProfile: Explicit låst

PropFirmProfile: Explicit låst där relevant

Broker-native SL verification: Obligatorisk

Kill switch: Obligatorisk och verifierad före live

Reconciliation: Obligatorisk

Automatic autonomy increase: Förbjuden

Live self-modification: Förbjuden

Live data: Används för fortsatt validation och learning

Live-deployment ska genomföras som en kontrollerad och reversibel övergång från bevisad demo-drift till minimal verklig kapitalrisk.
