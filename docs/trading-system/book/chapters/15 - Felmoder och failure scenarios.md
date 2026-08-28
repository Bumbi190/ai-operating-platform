# Kapitel 15 – Felmoder och failure scenarios

Omnira Trading System ska byggas utifrån antagandet att saker förr eller senare kommer att gå fel.

Inte kanske.

Förr eller senare.

Det kan vara:

- felaktig marknadsdata
- avbrott i nätverk
- providern som tappar anslutningen
- fel konto aktivt
- stale account state
- duplicate execution requests
- felaktig symbol mapping
- broker rejection
- stop loss som inte aktiveras
- news-data som saknas
- Prop Firm Rules Engine som inte kan fastställa aktuell state
- Atlas som tolkar något fel
- runner crash
- Omnira outage
- restart mitt i en öppen position
Målet med failure handling är därför inte att skapa ett system där inget kan gå fel.

Målet är:

När något går fel ska systemet falla på ett kontrollerat, synligt och så säkert sätt som möjligt.

Den grundläggande säkerhetsprincipen är:

**UNKNOWN ≠ SAFE**

Om systemet inte vet om det är säkert att fortsätta ska ny trading stoppas.

## Failure handling är en del av arkitekturen

Failure scenarios får inte hanteras som något vi lägger till efter att tradingbotten fungerar.

De ska byggas in från början.

Varje viktig komponent ska kunna svara på:

- Vad händer om jag inte får data?
- Vad händer om datan motsäger tidigare state?
- Vad händer om nästa komponent inte svarar?
- Vad händer om samma request kommer två gånger?
- Vad händer om processen dör efter halva operationen?
- Hur återställer vi korrekt state?
## Fail Closed

För exekveringskritiska beslut ska standardprincipen vara:

**FAIL CLOSED**

Exempel:

Om Risk Engine inte kan svara:

```
UNKNOWN
```

ska det inte tolkas som:

```
ALLOW
```

Det ska tolkas som:

NO NEW TRADE

Samma princip gäller bland annat:

- Prop Firm Rules
- market data health
- account state
- execution state
- account identity
- kill switch state
## Failure Severity

Alla problem är inte lika allvarliga.

Systemet bör kunna klassificera incidents exempelvis som:

**INFO**

Ingen direkt tradingpåverkan.

**WARNING**

Degraded state men ingen omedelbar kapitalrisk.

**BLOCKING**

Ny execution förbjuden.

**CRITICAL**

Aktiv position eller account safety kan vara hotad.

**EMERGENCY**

Omedelbar skyddsåtgärd kan krävas enligt explicit policy.

## Analysis Failure vs Execution Failure

Systemet ska skilja mellan problem som påverkar analys och problem som påverkar faktisk trading.

Exempel:

Atlas AI är offline.

Strategy Engine kan fortfarande fungera.

Detta kan vara:

```
AI_ANALYSIS_UNAVAILABLE
```

Det behöver inte automatiskt betyda att broker-native SL på en redan öppen position påverkas.

Däremot:

```
ACCOUNT_STATE_UNKNOWN
```

är execution-critical.

## Market Data Stale

Scenario:

Realtime market data slutar uppdateras.

Systemet kanske fortfarande har senaste candle.

Men den är gammal.

Expected behavior:

```
MARKET_DATA_STALE
→
```

ingen ny executable Strategy Signal.

Atlas Market View ska visa att data är stale.

Systemet får inte fortsätta som om priset fortfarande befinner sig på senaste observerade nivå.

## Missing Candles

Scenario:

1m-serien innehåller:

10:01

10:02

10:04

men saknar:

10:03

Expected:

```
INCOMPLETE_SERIES
```

Strategy Engine ska inte fortsätta entry logic på antagandet att datan är komplett.

## Duplicate Market Data

Scenario:

Samma 1m candle levereras två gånger.

Without protection kan systemet skapa dubbla events.

Market Data Layer ska deduplicera.

Samma candle ska inte kunna skapa:

- två manipulation events
- två Strategy Signals
- två Trade Proposals
## Out-of-Order Data

Scenario:

10:04

anländer före:

10:03

Systemet ska inte processa dem blint i arrival order.

Det ska antingen:

- reorder inom definierad buffer
- eller markera serien invalid
beroende på implementation.

## Provider Disagreement

Scenario:

Primary provider och fallback provider rapporterar olika priser eller candles.

Systemet får inte automatiskt välja det värde som bäst passar setupen.

Expected:

```
DATA_SOURCE_CONFLICT
```

och vid execution-critical discrepancy:

**NO NEW TRADE**

## Provider Switch Mid-Setup

Scenario:

En setup startar på provider A.

Provider A faller bort.

Provider B finns tillgänglig.

Systemet ska inte tyst fortsätta setupen som om datan vore identisk.

Ett source transition event ska skapas.

Om consistency inte kan verifieras ska setupen blockeras eller invalidated enligt policy.

## Clock Drift

Scenario:

Windows-runnerns systemklocka är fel.

Det kan påverka:

- session windows
- proposal expiry
- news exits
- latency
- daily resets
Clock drift ska därför monitoreras.

För stor drift ska bli blockerande.

## Timezone Failure

Scenario:

Systemet tolkar New York som permanent UTC-4 trots daylight saving.

Det kan öppna strategy window en timme fel.

Detta är inte ett kosmetiskt fel.

Det är ett strategy integrity failure.

Time conversion ska därför testas runt DST transitions.

## News Data Missing

Scenario:

Economic calendar provider är unavailable.

Systemet kan inte avgöra om high-impact USD event finns.

Expected:

```
NEWS_STATE_UNKNOWN
```

I execution-enabled mode:

**NO NEW TRADE**

## News Data Stale

Att kalendern laddades för flera dagar sedan är inte samma sak som att den är aktuell.

News-data ska ha freshness state.

Stale calendar i execution mode ska blockera nya entries där news-regeln kräver korrekt information.

## News Time Changed

Ekonomiska events kan i vissa fall uppdateras.

Systemet måste därför kunna hantera att scheduled timestamp förändras.

Aktuell policy ska alltid använda senaste verifierade event state.

Historisk audit ska fortfarande visa vilken kalenderstate som användes tidigare.

## Atlas Hallucination

Scenario:

Strukturerad data säger:

SMT = UNKNOWN

men Atlas säger:

SMT är bekräftad.

Expected behavior:

- canonical structured state ändras inte
- AI discrepancy loggas
- UI ska prioritera structured source of truth
- incident kan markeras som AI quality issue
AI-text får aldrig skriva över Strategy Engine state.

## Atlas Unavailable

Scenario:

AI-tjänsten är offline.

Systemet ska tydligt skilja:

```
AI_UNAVAILABLE
```

från:

```
TRADING_SYSTEM_UNAVAILABLE
```

Beroende på operation mode kan deterministic analysis eventuellt fortsätta.

Men ingen komponent får låtsas att AI Analysis genomförts.

## Strategy Engine Crash

Scenario:

Strategy Engine kraschar mitt i en session.

Ny Strategy Signal ska stoppas.

När motorn startar om ska den återuppbygga state från:

- market data
- persisted setup state
- events
innan den får fortsätta.

## Strategy State Corruption

Scenario:

Systemet kan inte avgöra om setupen står i:

```
WAIT_FOR_CONFIRMATION
```

eller:

```
SIGNAL_CREATED
```

Expected:

```
STRATEGY_STATE_UNKNOWN
```

Ingen ny execution från denna thesis.

State ska reconcileras eller setupen invalidated på ett kontrollerat sätt.

## Duplicate Strategy Signal

Scenario:

En bug producerar samma Strategy Signal två gånger.

Signal identity ska göra dessa detekterbara.

Duplicate signal får inte skapa flera exekverbara proposals.

## Risk Engine Unavailable

Scenario:

Strategy PASS.

Risk Engine svarar inte.

Final:

**NO TRADE**

Risk är obligatorisk gate.

## Risk State Stale

Scenario:

Risk Engine har account snapshot från flera minuter sedan.

Under tiden kan en annan position ha öppnats eller P/L förändrats.

Risk evaluation får inte göras på arbiträrt gammal state.

Critical account state behöver definierad freshness.

## Daily Loss State Mismatch

Scenario:

Omnira tror:

realized daily loss = $150

men providerns history visar:

$300

Expected:

```
RISK_RECONCILIATION_FAILURE
```

Ny execution blockeras.

## Daily Stop Breach

Canonical intern regel:

$450 realized daily loss

När gränsen nås:

- inga nya trades
- eventuell öppen position stängs direkt enligt riskpolicyn
- state låses fram till daily reset
- incident och risk event loggas
Daily reset får inte kunna kringgås genom runner restart.

## Attempt Counter Lost

Scenario:

Process restart gör att systemet glömmer att två attempts redan tagits på samma 4H-thesis.

Attempt state ska därför vara persistent.

Efter restart ska:

```
attempts_used = 2
```

fortfarande gälla.

## Prop Firm Engine Unavailable

Scenario:

Internal Risk = PASS.

Prop Engine svarar inte.

Final:

**NO TRADE**

Prop firm-compliance är obligatorisk på account där sådan profil är aktiv.

## Prop Rule State Unknown

Scenario:

Systemet vet inte aktuell trailing drawdown floor.

Expected:

```
PROP_STATE_UNKNOWN
```

Ny execution blockeras.

Det är bättre att missa en trade än att riskera challenge breach på okänd state.

## Outdated Prop Rules

Scenario:

Systemets ruleset kan vara gammalt och provider har ändrat programmet.

Om profilens freshness-policy kräver review ska state kunna bli:

```
RULESET_REVIEW_REQUIRED
```

Live automation ska inte fortsätta blint med potentiellt utdaterade hard rules.

## Prop Firm Breach

Scenario:

En regel har redan brutits.

Systemet ska:

- markera account PROP_BLOCKED
- stoppa nya trades
- logga breach
- visa exakt vilken regel som bröts
Systemet får inte försöka trade sig ur ett compliance breach.

## Wrong Account Active

Scenario:

Runnern förväntar sig ett demo-account.

Providern har ett live-account aktivt.

Expected:

```
ACCOUNT_MISMATCH
```

och:

**NO EXECUTION**

Detta är ett av de viktigaste safety scenarios.

## Wrong Environment

Scenario:

Execution Intent säger:

```
DEMO
```

men runnern är konfigurerad mot:

```
LIVE
```

Expected:

```
ENVIRONMENT_MISMATCH
```

Request ska nekas.

## Wrong Symbol Mapping

Scenario:

Canonical:

```
MNQ
```

mappas av misstag till fel futureskontrakt eller annat symbolnamn.

Runner ska verifiera:

- symbol
- contract metadata
- instrument mapping
- allowlist
innan execution.

Osäker mapping:

**NO TRADE**

## Wrong Quantity

Scenario:

Risk Engine godkänner:

1 MNQ

men execution request innehåller:

2 MNQ

Runnern ska jämföra quantity mot approved intent.

Mismatch:

```
EXECUTION_INTEGRITY_FAILURE
```

Ingen order.

## Position Size Rounding Error

Om broker volume step kräver avrundning ska systemet aldrig avrunda upp om det ökar risk över godkänd nivå.

Kan quantity inte representeras säkert:

**DENY**

## Proposal Expired

Scenario:

Trade Proposal godkändes men execution sker för sent.

Expected:

```
PROPOSAL_EXPIRED
```

Ingen order skickas.

Ny evaluation krävs.

## Price Moved Before Execution

Scenario:

Proposal skapades med giltigt 2.4R.

När ordern ska skickas återstår bara 1.7R.

Pre-execution revalidation ska stoppa traden.

## Risk Changed Before Execution

Scenario:

En annan position har just stängts med loss och daily risk headroom har minskat.

Pre-execution riskkontroll ska få sista aktuella state.

Tidigare Risk PASS är inte ett permanent tillstånd.

## Prop State Changed Before Execution

Samma princip gäller Prop Firm Engine.

Aktuell headroom ska verifieras direkt före execution.

## Duplicate Execution Request

Scenario:

Nätverket orsakar retry.

Samma Execution Intent kommer två gånger.

Expected:

**exakt en broker-order**

Runner ska svara:

```
ALREADY_PROCESSED
```

för duplicate idempotency key.

## Runner Crash Before Submission

Scenario:

Runner tar emot intent men kraschar innan broker request skickas.

Efter restart ska reconciliation visa:

- ingen order
- intent ej exekverad
Systemet kan därefter besluta om proposal fortfarande är giltig eller expired.

Ingen automatisk gissning.

## Runner Crash After Submission

Detta är betydligt farligare.

Scenario:

Runner skickar broker request.

Providern tar emot den.

Runner kraschar innan local confirmation sparas.

Efter restart vet Omnira inte om ordern exekverades.

Expected:

```
UNKNOWN_EXECUTION_STATE
→ reconciliation mot providern
```

innan någon retry får ske.

## Network Lost Before Broker Response

Samma princip.

Systemet får aldrig anta:

no response = no order

Det måste kontrollera actual broker state.

## Broker Rejection

Scenario:

Ordern nekas.

Exempel:

- invalid volume
- invalid stops
- market closed
- insufficient resources
Systemet ska:

- registrera raw response
- skapa strukturerad reason
- inte anta att position öppnats
- reconcila state där relevant
## Partial Fill

Scenario:

Order quantity fylls endast delvis.

Position state ska baseras på actual fills.

Risk och SL/TP måste utvärderas mot den verkliga positionen.

Systemet får inte låtsas att full quantity exekverats.

## Unexpected Fill Price

Scenario:

Slippage blir större än planerat.

Efter actual fill måste systemet beräkna verklig:

- risk
- R:R
- exposure
Om fill skapar säkerhetsproblem ska explicit post-fill protection policy användas.

Det får inte improviseras av AI.

## Stop Loss Missing

Ett av systemets mest kritiska scenarios.

Scenario:

Position öppnas.

Förväntad broker-native SL finns inte.

Expected:

```
CRITICAL_EXECUTION_INCIDENT
```

Systemet ska:

- upptäcka mismatch
- försöka applicera skydd enligt explicit recovery policy
- blockera nya trades
- varna omedelbart
- eskalera om skydd inte kan verifieras
En position får aldrig visas som skyddad när broker state säger motsatsen.

## Wrong Stop Loss

Samma princip gäller om SL finns men ligger på fel nivå.

EXPECTED_SL != BROKER_SL

ska behandlas som execution discrepancy.

## Take Profit Missing

TP är mindre kritisk än SL ur kapitalkontrollperspektiv men fortfarande ett executionfel när plan kräver broker-native TP.

Mismatch ska loggas och hanteras.

## Break-Even Modification Failure

Scenario:

Canonical BE-trigger inträffar.

Omnira skickar modification.

Broker nekar.

Systemet ska visa:

```
BE_NOT_CONFIRMED
```

Inte:

```
POSITION_AT_BE
```

Actual broker state vinner.

## News Exit Failure

Scenario:

T-15m inträffar.

Systemet försöker stänga.

Broker request misslyckas.

Detta är ett critical management incident.

Systemet ska:

- retrya endast enligt säker policy
- monitorera actual position
- eskalera
- journalföra all action
## Time Exit Failure

Samma princip för New York 4h exit.

## Provider Client Closed

Scenario:

Windows lever.

Runner lever.

Men providern är stängt.

Expected:

```
PROVIDER_DISCONNECTED
```

Ny execution stoppas.

Runner ska inte betraktas som healthy execution host.

## Provider Connected but Broker Offline

Terminalprocessen kan vara igång utan fungerande broker connection.

Systemet ska skilja dessa states.

## Broker Market Closed

Strategy Engine ska normalt redan förstå relevant session, men broker kan ändå neka trading.

Broker state är sista praktiska execution boundary.

Ingen blind retry.

## Windows Sleep

Scenario:

Windows-riggen går i sleep mitt under trading window.

Detta är ett deployment configuration failure.

Riggens health checks ska upptäcka olämplig power state.

Produktionsmiljön ska ha sleep avstängt.

## Windows Restart

Efter OS-restart ska autostart kunna starta:

- runner
- providern där konfigurationen tillåter
Men trading får inte börja förrän startup reconciliation är klar.

## Disk Full

Scenario:

Runner kan inte skriva journal eller local state.

Detta kan påverka audit och idempotency.

Disk capacity ska monitoreras.

Kritisk diskbrist kan behöva blockera ny execution.

## Database Unavailable

Scenario:

Omnira kan inte lagra Trade Proposal eller audit events.

Ett system som inte kan skapa tillförlitlig audit ska inte fortsätta live execution som vanligt.

Expected behavior ska vara fail closed för nya trades när critical persistence saknas.

## Event Bus Failure

Om realtime events inte når UI är detta inte automatiskt samma sak som att backend state saknas.

Systemet ska skilja:

```
UI_UPDATE_FAILURE
```

från:

```
TRADING_STATE_FAILURE
```

Men om downstream safety components faktiskt inte får events krävs blockering.

## UI Crash

UI är inte source of truth.

Om browsern kraschar ska:

- broker-native protection finnas kvar
- backend state finnas kvar
- runner fortsätta enligt policy
Men användaren kan förlora visibility.

Det ska tydligt återställas när UI reconnectar.

## UI Shows Stale State

UI ska visa freshness.

En gammal chart eller riskstatus ska inte se identisk ut med live state.

## User Double Clicks Approve

Scenario:

Användaren trycker approval två gånger.

Approval/idempotency-logik ska göra att detta inte kan skapa två executions.

## Manual External Trade

Scenario:

Användaren öppnar MNQ manuellt i providern.

Omnira expected:

0 positions

Provider observed:

1 position

Expected:

- detect manual/unknown origin
- account risk uppdateras
- ny Omnira execution blockeras enligt position-limit/reconciliation policy
Systemet ska inte ignorera positionen för att den skapades utanför Omnira.

## Manual Modification

Scenario:

Användaren flyttar SL direkt i providern.

Omnira ska upptäcka att actual broker state har förändrats.

Detta ska journalföras som:

```
MANUAL_EXTERNAL_MODIFICATION
```

Systemet får inte fortsätta visa gammal SL som aktuell.

## Manual Close

Samma sak om användaren stänger positionen manuellt.

Omnira ska reconcila och journalföra origin för exit.

## Unknown Position

Om origin inte kan fastställas:

```
UNKNOWN_POSITION
```

Ny trading blockeras tills state hanterats.

## Orphan Order

Broker visar pending/active order som Omnira inte känner igen.

Samma princip:

```
RECONCILIATION_REQUIRED
```

## Kill Switch Activation

När kill switch aktiveras ska systemet tydligt veta scope.

Exempel:

```
GLOBAL
ACCOUNT
STRATEGY
INSTRUMENT
RUNNER
```

Ny relevant execution ska stoppas omedelbart.

## Kill Switch State Unknown

Om systemet inte kan läsa aktuell kill-switch state får det inte anta:

```
OFF
```

Unknown ska blockera execution.

## Kill Switch Does Not Equal Emergency Close

Vanlig kill switch stoppar nya trades.

Den ska inte automatiskt stänga alla öppna positions om inte explicit emergency policy säger det.

Detta minskar risken för destruktiva automationseffekter.

## Emergency Close Failure

Om emergency close används men broker inte bekräftar ska systemet fortsätta betrakta positionen som öppen.

Det ska aldrig visa:

```
CLOSED
```

förrän broker state verifierat det.

## Omnira Backend Outage

Scenario:

Omniras centrala backend går ner.

Runnern ska inte börja fatta egna strategybeslut.

Expected:

- inga nya trades
- öppna broker-native protections kvar
- local runner state bevaras
- reconciliation efter återkomst
## Runner Isolated from Omnira

Scenario:

Runner har kontakt med providern men inte Omnira.

Runnern ska som standard:

**inte skapa nya trades**

Detta är en viktig authority boundary.

## Full Internet Outage

Om Windows-riggen tappar internet:

- broker connection kan falla
- Omnira connection faller
- active management kan påverkas
Broker-native SL/TP är därför centrala.

När internet återkommer krävs reconciliation.

## Power Failure

Scenario:

Windows-datorn stängs av helt.

Local software kan inte göra något.

Detta är ytterligare skäl till:

- broker-native protection
- framtida VPS
- startup reconciliation
Operational uptime ska mätas.

## VPS Failure

Att senare flytta till VPS eliminerar inte failure.

Samma recoverymodell ska fungera även där.

Infrastructure host får bytas utan att safety assumptions förändras.

## Broker Outage

Broker kan vara unavailable även när internet fungerar.

Om broker inte kan ta emot orders:

- inga nya trades
- position state kan bli osäkert
- systemet ska monitorera reconnect
- reconciliation krävs
## Exchange Halt

Marknaden kan stoppas eller hamna i ovanliga trading conditions.

Strategy Engine får inte anta normal execution.

Market/broker state ska kunna markera abnormal conditions.

## Extreme Slippage

Canonical risk gäller planned risk.

I extrema marknader kan actual loss bli större.

Systemet ska därför mäta:

risk overrun

Exempel:

Planned loss = -1R

Actual loss = -1.34R

Detta är viktigt för tail-risk-analys.

## Gap Through Stop

Broker-native SL garanterar inte alltid exakt stop price.

Gap risk är residual market risk.

Det ska dokumenteras, inte låtsas bort.

## Commission Changes

Om broker ändrar fees kan actual expectancy påverkas.

Execution/analytics ska upptäcka förändrad cost profile.

Detta är inte nödvändigtvis ett safety failure men kan skapa:

```
PERFORMANCE_REVIEW_REQUIRED
```

## Contract Rollover Error

Scenario:

Omnira fortsätter handla gammalt futureskontrakt.

Systemet ska använda explicit contract mapping och rollover checks.

Mismatch ska blockera execution.

## Liquidity Detection Bug

Scenario:

Strategy Engine identifierar liquidity fel på grund av kodbugg.

Golden tests och regression suite ska försöka upptäcka detta före deployment.

Om detection logic ändras utan strategy/detection version update ska CI kunna falla.

## iFVG/CISD Detection Error

Eftersom dessa patterns är entrykritiska måste deras exakta detection rules implementeras deterministiskt.

En visuell eller AI-baserad improvisation får inte vara production source of truth.

Fel i denna logik är strategy integrity incidents.

## SMT Comparison Failure

Scenario:

NQ-data är live men ES-feed är stale.

Systemet får inte ge:

SMT = FALSE

utan:

SMT = UNKNOWN

A+ får inte delas ut på saknad comparison data.

## Detection Version Mismatch

Scenario:

Live Strategy Engine använder detection v1.1 men backtest-resultaten byggdes med v1.0 utan att detta framgår.

Detta är ett reproducibility failure.

Detection versions ska vara explicit bundna till StrategyVersion/test runs.

## Configuration Drift

Scenario:

Två runners eller environments använder olika risk config trots att båda säger v1.0.

Config ska vara immutable/versioned så att samma version betyder samma regler.

## Secret Exposure

Scenario:

Providercredentials råkar loggas.

Detta är ett security incident.

Secrets ska:

- inte skrivas i logs
- inte skickas till AI
- inte exponeras i frontend
- inte committas i Git
Incident ska behandlas separat från trading failure.

## Unauthorized Execution Request

Scenario:

En falsk eller obehörig request når runnern.

Runnern ska verifiera:

- authentication
- authorization
- allowed environment
- account
- intent identity
Unauthorized request:

```
REJECT
```

och security incident.

## Replay Attack

En gammal legitim execution request försöker skickas igen.

Idempotency + expiry ska förhindra att den exekveras.

## Corrupted Execution Intent

Scenario:

Payload är ofullständig eller har ogiltig signatur/integritet.

Runnern ska neka hela requesten.

Ingen partial execution.

## Version Incompatibility

Scenario:

Omnira backend skickar en execution intent-version som runnern inte förstår.

Expected:

```
UNSUPPORTED_INTENT_VERSION
```

Ingen trade.

## Deployment During Open Position

Koddeploy medan position är öppen är ett särskilt riskområde.

Production deployment policy ska senare definiera om och hur detta tillåts.

Systemet ska åtminstone kunna:

- bevara position state
- verifiera runner compatibility
- reconcile efter restart
## Migration Failure

Vid databas- eller schemaändringar får trade-critical data inte förloras.

Migrationer ska kunna verifieras och rollbackas där möjligt.

## Journal Failure

Om systemet exekverar trade men inte kan journalföra den korrekt är detta ett audit incident.

Execution state ska rekonstrueras från broker history.

## Analytics Failure

Om analytics pipeline är trasig betyder det inte automatiskt att Risk Engine är trasig.

Dessa concerns ska hållas separata.

Systemet ska kunna trade säkert utan att performance dashboard fungerar, om operation policy tillåter det.

## Learning Layer Failure

Atlas Trading Learning & Improvement Layer är aldrig i hard execution path.

Om den går ner ska canonical strategy inte förändras.

Detta är en av fördelarna med separationen.

## Bad Self-Improvement Hypothesis

Scenario:

Atlas föreslår en strategiändring som ser fantastisk ut på historiken men är överfit.

Det får ingen productioneffekt förrän candidate passerat:

- backtest
- OOS
- forward test
- review
Governance är failure protection mot dåliga förbättringar.

## Unauthorized Self-Modification

Scenario:

En AI-komponent försöker skriva om canonical Strategy/Risk/Prop rules direkt.

Arkitekturen ska inte ge den sådan behörighet.

Detta ska betraktas som policy/security violation.

## Performance Collapse

Scenario:

Live expectancy faller kraftigt.

Analytics ska kunna skapa:

```
PERFORMANCE_REVIEW_REQUIRED
```

En separat performance stop policy kan senare avgöra om automation ska pausas.

Atlas får inte improvisera förändringar.

## Strategy Edge Disappears

Det är möjligt att strategin helt enkelt slutar fungera.

Systemets uppgift är inte att försvara strategin emotionellt.

Om:

- OOS
- forward
- live
visar bestående negativ expectancy ska systemet kunna rekommendera suspension och research.

Canonical status är inte samma sak som evig lönsamhet.

## Correlated Failures

Flera failures kan ske samtidigt.

Exempel:

- high-impact news
- extreme volatility
- market data degradation
- broker latency
Systemet ska inte anta att failures alltid sker isolerat.

Stress testing ska inkludera kombinationer.

## Failure Cascades

Ett litet fel kan skapa större problem.

Exempel:

stale market data

```
→ fel Strategy Signal
→ fel Trade Proposal
→ fel execution
```

Data Quality Gate ska stoppa kedjan tidigt.

Systemarkitekturen ska försöka fånga problem så nära källan som möjligt.

## Blast Radius

Varje komponent ska ha minimal authority.

Detta begränsar hur mycket skada ett fel kan göra.

Exempel:

Strategy Engine kan skapa signal.

Den kan inte skapa broker-order.

Atlas kan skapa analys.

Den kan inte ändra risk.

Execution Runner kan skicka godkänd order.

Den kan inte skapa strategy thesis.

## Graceful Degradation

Vissa failures kan tillåta reducerad funktion.

Exempel:

AI unavailable:

Strategy visualisering kan fortfarande fungera.

Analytics unavailable:

Riskkontroll kan fortfarande fungera.

Men execution-critical dependencies ska inte degraderas på ett sätt som gör safety osäker.

## Degraded Mode

Systemet kan senare ha explicit:

```
DEGRADED
```

state.

Det ska vara tydligt vilka funktioner som fortfarande är tillåtna.

Exempel:

Analysis available

Execution blocked

Det är bättre än ett binärt "online/offline".

## Recovery är inte samma som Restart

Att starta om en process betyder inte att problemet är löst.

Efter failure krävs ofta:

- state verification
- broker sync
- data sync
- reconciliation
innan component blir READY.

## Recovery State Machine

Ett generellt mönster är:

```
FAILURE_DETECTED
→
BLOCK
→
```

RECONNECT / RESTART

```
→
RESYNC
→
RECONCILE
→
VERIFY
→
READY
```

Inte:

```
FAILURE
→
RESTART
→
TRADE
```

## Reconciliation som central recoverymekanism

Broker state är avgörande för verklig exposure.

Efter execution-relaterade fel ska systemet läsa actual:

- account
- orders
- positions
- deals
innan det återgår till normal drift.

## Incident Lifecycle

Varje viktig incident ska kunna gå genom:

```
OPEN
→
INVESTIGATING
→
CONTAINED
→
RESOLVED
→
POSTMORTEM_COMPLETE
```

Detta gör technical quality mätbar.

## Incident ID

Exempel:

INC-2026-0041

Incidenten ska kunna länkas till:

- runner
- trade
- execution
- account
- relevant logs
## Root Cause

Postmortem ska försöka skilja:

- symptom
- root cause
Exempel:

Symptom:

duplicate proposal

Root cause:

event consumer processed same event twice without deduplication

Åtgärd ska adressera root cause.

## Corrective Action

Incident review ska dokumentera:

- immediate fix
- permanent fix
- tests added
- monitoring added
- version released
## No Blame Data

Incidenter ska ses som systemdata.

Målet är inte att dölja problem.

Målet är att göra samma problem mindre sannolikt nästa gång.

## Failure Injection

Systemet ska aktivt utsättas för fel före live.

Exempel:

- disconnect network
- kill runner process
- close providern
- duplicate execution request
- corrupt test payload
- create manual position
- remove news provider
- delay market data
- simulate broker rejection
- simulate failed SL modification
Detta är en del av validation.

## Chaos Testing

När systemet mognar kan kontrollerad chaos testing användas i demo/staging.

Målet är att bevisa att systemet inte bara fungerar under perfekta förhållanden.

## Golden Failure Tests

Precis som vi har golden trades ska vi ha golden failure scenarios.

Exempel:

```
Wrong account → execution must be blocked
Duplicate intent → exactly one order
News state unknown → no new trade
Unknown position → reconciliation required
```

Dessa ska ligga i regression suite.

## Failure Regression

När ett incident har inträffat bör ett automatiserat test läggas till där möjligt.

Princip:

Ett känt failure ska helst bli ett permanent test.

## Safety Metrics

Systemet ska kunna mäta:

- duplicate orders
- unknown positions
- reconciliation failures
- account mismatches
- SL verification failures
- stale-data blocks
- broker rejections
- technical incidents
- uptime
## Zero-Tolerance Metrics

Vissa metrics ska ha mål:

Duplicate unintended orders = 0

Wrong-account executions = 0

Unprotected positions caused by Omnira = 0

Preventable prop breaches = 0

Detta är viktigare än hög win rate i tidiga deploymentfaser.

**MTTR**

Systemet kan senare mäta:

**Mean Time To Recovery**

för technical incidents.

Det hjälper till att förbättra operational maturity.

## Availability

Runner uptime och broker connection uptime ska mätas.

Men hög uptime får aldrig prioriteras över fail-closed safety.

Det är bättre att vara säkert offline än osäkert "online".

## Human Alerting

Kritiska incidents ska kunna ge användaren tydlig notification.

Exempel:

CRITICAL: MNQ-position är öppen men broker-native SL kan inte verifieras.

Alert ska innehålla:

- vad som hänt
- account
- position
- system action
- vad som kräver mänsklig attention
## Alert Fatigue

Alla mindre warnings ska inte skickas som emergency alerts.

Severity och notification policy ska minska risken att användaren börjar ignorera varningar.

## Atlas under Incident

Atlas kan hjälpa till att:

- sammanfatta incident
- förklara state
- visa relevant timeline
- föreslå felsökningssteg
Atlas får inte hitta på att incident är löst.

```
RESOLVED
```

ska komma från verifierad systemstate.

## Incident Timeline

Atlas ska kunna visa:

10:24:09 Order filled

10:24:10 SL verification failed

10:24:10 Account execution blocked

10:24:11 Recovery modification attempted

10:24:12 Broker confirmed SL

10:24:13 Position protected

Det gör händelsen begriplig.

## Audit

Alla safety-relevanta failures ska kunna granskas i efterhand.

Historiken ska visa:

- trigger
- state
- system reaction
- broker reality
- recovery
- final outcome
## Failure Data och Self-Improvement

Learning Layer ska kunna analysera technical failures.

Exempel:

74 % av execution incidents inträffar efter network reconnect.

Det kan skapa engineering hypothesis.

Self-improvement gäller alltså inte bara strategin.

Systemet kan även förbättra:

- execution
- operations
- monitoring
- data quality
## Technical Candidate Improvement

Exempel:

HYP-OPS-014

Inför längre reconciliation lock efter providern reconnect.

Detta ska testas precis som andra systemförändringar.

## Safety First

Om en förbättring ökar execution speed men gör failure handling mindre robust ska den normalt inte accepteras.

I tidiga faser är prioriteringen:

```
säkerhet
→ korrekthet
→ reproducerbarhet
→ stabilitet
→ hastighet
```

## Residual Risk Register

Alla risks kan inte elimineras.

Systemet ska därför ha ett register över kända residual risks.

Exempel:

- gap through SL
- broker outage
- internet outage före active news exit
- extreme slippage
- exchange halt
För varje risk ska vi kunna dokumentera:

- likelihood
- potential impact
- mitigations
- remaining exposure
## Accepted Risk

Vissa residual risks kommer senare behöva accepteras.

Det ska ske explicit.

Inte genom att vi glömt dem.

## Live Readiness

Live ska inte godkännas förrän de viktigaste failure scenarios har testats på demo.

Det gäller särskilt:

- duplicate execution
- wrong account
- runner crash
- providerklient restart
- network loss
- unknown position
- SL failure
- news failure
- reconciliation
- kill switch
## Autonomy ökar kraven

När systemet senare går från manual approval till automation ökar kraven på failure handling.

Människan är då inte längre med i varje beslut.

Det betyder att systemets:

- monitoring
- audit
- kill switches
- recovery
- alerts
måste vara ännu starkare.

## Failure Principle

Den viktigaste principen i detta kapitel är:

Ett trading-system är inte robust för att det fungerar när allt går rätt. Det är robust när det beter sig förutsägbart när något går fel.

Omnira Trading ska därför designas så att:

- osäker state är synlig
- osäker state inte tolkas som säker
- nya trades stoppas tidigt vid kritiska problem
- broker reality verifieras efter execution
- recovery alltid följs av reconciliation
- incidents bevaras som lärdom
Det är denna disciplin som gör framtida autonomi möjlig.

## Kapitelstatus

Kapitel: 15 – Felmoder och failure scenarios

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Primary safety behavior: FAIL CLOSED

Unknown critical state: NO NEW TRADE

Recovery: Reconnect + Resync + Reconcile + Verify

Duplicate execution protection: Obligatorisk

Wrong account protection: Obligatorisk

Broker SL verification: Säkerhetskritisk

Incident journal: Obligatorisk

Failure injection: Obligatorisk före live

Residual risk register: Ska etableras

Live deployment: Ej tillåten innan critical failure gates är verifierade

Omnira ska inte byggas på förhoppningen att fel inte inträffar.

Det ska byggas för att överleva dem.
