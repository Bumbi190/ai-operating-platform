# Kapitel 9 – Futures Execution Integration

Omnira Trading System handlar NQ och MNQ. Det är futures, och integrationen ska därför
vara futures-native.

Ingen specifik execution provider är vald. Kapitlet definierar den provider-neutrala
integrationsarkitekturen: vad Omnira kräver av en extern execution-miljö, och var
gränsen mellan Omnira och den miljön går. En eller flera **Execution Provider
Adapters** kan senare implementeras mot den gränsen.

> **Rättelse 2026-08-28.** Tidigare version av detta kapitel antog MetaTrader 5 som
> execution-plattform. Det var ett felaktigt implementation-specifikt antagande för en
> futures-strategi. Se Canonical Amendments v1.0, Beslut D. Tradingstrategin och
> riskreglerna är oförändrade.

Integrationen ska byggas stegvis.

Den första fasen är strikt:

**READ ONLY**

Ingen orderläggning ska vara tekniskt möjlig innan read-only-flödet är verifierat.

Det innebär att systemet först måste kunna läsa och synkronisera:

- konto
- balance
- equity
- instruments
- market data
- active orders
- open positions
- historical orders
- historical deals
innan trading requests får aktiveras.

Den centrala principen är:

Omnira ska först lära sig att observera providern korrekt innan systemet får rätt att påverka den.

## Ansvarsfördelningen mot providern

En Futures Execution Provider är bryggan mellan Omnira Trading System och det faktiska
handelskontot hos broker, FCM eller prop firm.

Providern ansvarar för den externa tradingmiljön:

- brokeranslutning
- account state
- symboler
- priser
- orders
- positions
- fills
- trade history
Omnira ansvarar istället för:

- strategi
- AI-analys
- risk
- prop firm-regler
- approvals
- journal
- analytics
- UI
- governance
Providern ska alltså inte bli Omniras intelligenslager.

## Execution Runtime — deployment-beroende

Om integrationen kräver en separat process eller host beror på vald provider och
driftsmodell. Det är **inte** en universell arkitekturinvariant, och ingen
executionplattform är låst. Se Systemarkitektur v0.2 §2.1 och §18, samt GATE-17.

Flödet när ett separat runtime **behövs**:

**Omnira**

↕

## Secure Trading API

↕

## Execution Runtime

↕

## Execution Provider Adapter

↕

## Futures Execution Provider

↕

## Broker / FCM / Prop Firm

När providern kan nås direkt och säkert från Omnira faller runtime-ledet bort och
Execution Gateway talar direkt med adaptern. Adaptergränsen finns i båda fallen.

Adaptern är den enda komponent som får känna till en specifik providers API.

## Varför providern inte kopplas direkt till frontend

Ingen tradingfunktion ska kommunicera:

**Web UI → Provider**

direkt.

Det skulle göra behörigheter, auditing och riskkontroll betydligt svagare.

Alla provideroperationer ska gå genom serverkontrollerade tradinglager.

Frontend ska endast:

- visualisera state
- visa proposal
- ta emot explicit approval
- visa execution-resultat
## Provider API-integration

Ingen provider och inget SDK är valt. Se GATE-15 och GATE-16.

Oavsett provider ska integrationen exponera separata kapabiliteter för exempelvis:

- connection
- account information
- symbol information
- bars
- ticks
- active orders
- open positions
- historical orders
- historical deals
och **separat** funktionalitet för trading requests.

Den separationen är ett krav på providern, inte en tillfällighet: read-kapabilitet och
execution-kapabilitet ska kunna aktiveras och behörighetsstyras var för sig. En provider
som inte tillåter den uppdelningen är svårare att göra säker, och det ska vägas in i
providervalet.

## Connection Lifecycle

Adaptern ska hantera provideranslutningen som ett explicit state.

Exempel:

```
DISCONNECTED
→
INITIALIZING
→
CONNECTED
→
ACCOUNT_VERIFIED
→
SYNCHRONIZING
→
READY
```

Runnern får inte behandlas som execution-ready bara för att Pythonbiblioteket lyckats ansluta till terminalen.

## Terminal Verification

Efter anslutning ska runnern kontrollera:

- provider endpoint tillgänglig
- terminal version
- connection state
- trading permission state
- active account
- server
- environment
- terminal path när relevant
Fel terminal eller fel account ska stoppa processen.

## Account Information

Read-only-integrationen ska kunna läsa aktuell account information.

Minst:

- external account ID
- broker/server
- account currency
- balance
- equity
- margin
- free margin
- leverage
- trading permissions
Account state ska normaliseras till Omniras interna TradingAccount och AccountSnapshot-modeller.

## Account Identity

Kontot som providern faktiskt rapporterar måste matcha det konto Omnira förväntar sig.

Exempel:

```
expected_account = PROP_DEMO_01
```

men terminalen rapporterar:

```
PERSONAL_LIVE_01
```

Resultat:

**ACCOUNT_MISMATCH**

och:

**NO EXECUTION**

Detta gäller även om båda kontona tekniskt är giltiga.

## Read-Only Mode

Read-only är ett explicit operation mode.

I detta läge får runnern läsa:

- account info
- terminal info
- symbols
- quotes
- bars
- ticks
- orders
- positions
- history
Men all funktionalitet som kan skapa eller ändra en trade ska blockeras på Omnira-nivå.

Det ska inte bara vara en UI-regel.

## Execution Capability Flag

Runnern ska ha explicit capability state.

Exempel:

```
READ_ONLY
```

eller:

```
EXECUTION_ENABLED
```

Default ska vara:

```
READ_ONLY
```

Execution får endast aktiveras genom senare godkänd deployment configuration.

## Defense in Depth

Orderläggning ska blockeras på flera nivåer under read-only-fasen.

Exempel:

- Omnira operation mode
- Execution Gateway
- runner capability
- account environment
- allowlists
Det ska alltså inte räcka att någon av misstag anropar en orderfunktion.

## Symbol Discovery

Providern erbjuder ett stort antal symbols beroende på broker.

Omnira ska kunna läsa symbolinformationen och skapa mappings mellan:

**Canonical Instrument**

och:

**Broker Symbol**

Exempel:

```
MNQ
```

kan behöva mappas till ett brokerspecifikt kontraktsnamn.

Denna mapping får inte gissas vid execution.

## Symbol Metadata

För varje relevant symbol behöver systemet minst känna till:

- broker symbol
- tick size
- contract size
- volume minimum
- volume maximum
- volume step
- trading status
- currency
- execution-related metadata
Risk Engine ska använda normaliserad instrumentmetadata.

## Futures Contract Resolution

NQ och MNQ är futures och kontraktet förändras över tid.

Execution Provider Adapter måste därför kunna identifiera vilket providersymbolnamn som representerar rätt aktivt futureskontrakt.

Strategy Engine ska arbeta med canonical instrument.

Execution Adapter ansvarar för broker mapping.

## Market Data via providern

Adaptern ska kunna läsa bars och ticks från providern när providern används som market-data source.

Bars ska kunna begäras för relevanta timeframes:

- 1m
- 5m
- 15m
- 4H
Providerdata ska därefter gå genom Market Data Layer innan Strategy Engine använder den.

## Providerdata är inte automatiskt trusted data

Att data kommer från providern betyder inte att validation kan hoppas över.

Omnira ska fortfarande kontrollera:

- timestamps
- freshness
- missing bars
- duplicates
- ordering
- symbol
- timeframe
Providern är datakälla.

Omniras Market Data Layer är validation boundary.

## Tick Data

Integrationen ska kunna läsa tickdata där det behövs.

Tickdata kan senare användas för:

- current bid
- ask
- last
- spread
- execution timing
- slippage analysis
- detailed backtesting
Första read-only-MVP:n behöver inte lagra obegränsad tick history.

## Current Price

När systemet visar aktuellt pris ska källan vara explicit.

Exempel:

- bid
- ask
- last
Atlas Market View får inte presentera ett enda anonymt "price" om skillnaden är viktig för aktuell analys eller execution.

## Active Orders

Read Adapter ska kunna läsa aktiva orders.

Dessa ska synkroniseras till Omniras interna state.

Om providern rapporterar en order som inte finns i Omnira ska systemet kunna markera:

```
UNKNOWN_ORDER
```

## Open Positions

Read Adapter ska kunna läsa samtliga relevanta öppna positions.

Minst:

- broker position ID
- symbol
- direction
- quantity
- entry
- SL
- TP
- current P/L
- open time
Providerns state är source of truth för vad brokern faktiskt håller öppet.

## Expected State och Observed State

Omnira ska skilja mellan:

**Expected State**

och:

**Observed Broker State**

Exempel:

Omnira expected:

0 positions

Provider observed:

1 MNQ long

Resultat:

```
RECONCILIATION_REQUIRED
```

Ny execution blockeras.

## Historical Orders

Integrationen ska kunna läsa orderhistorik.

Detta behövs för:

- audit
- restart recovery
- reconciliation
- execution debugging
Order history är inte samma sak som trade performance.

## Historical Deals

Providerns deal history representerar faktiska execution events.

Den ska användas för att rekonstruera:

- fills
- opens
- closes
- partial fills
- commissions
- broker deal IDs
Omnira ska kunna länka deals tillbaka till sina egna ExecutionIntent och Trade-objekt när positionen skapats av Omnira.

## Orders, Deals och Positions är olika saker

Systemet måste hålla dessa begrepp separata.

En order är en instruktion.

Ett deal/fill är en faktisk execution.

En position är det resulterande öppna marknadsexponeringen.

Dessa får inte lagras som samma generiska objekt.

## Historical Import

När Fas 2 – Futures Connectivity (Read Only) aktiveras kan Omnira importera tidigare tradinghistorik.

Denna historik ska märkas exempelvis:

```
IMPORTED_HISTORICAL
```

och inte automatiskt betraktas som trades från Strategy v1.0.

Detta gör det möjligt att använda gammal data utan att förorena systemets validerade strategy performance.

## Manual Trades

Om en användare tar en trade manuellt hos providern ska Omnira kunna upptäcka detta.

Origin:

```
MANUAL_EXTERNAL
```

Dessa trades kan journalföras och påverka account risk men får inte räknas som automatiskt Strategy v1.0-resultat.

## Unknown Origin

Om systemet inte säkert kan avgöra positionens ursprung ska den märkas:

```
UNKNOWN
```

Unknown position ska vara en blockerande state tills reconciliation genomförts.

## Sync Loop

Runnern ska kontinuerligt synkronisera relevant broker state.

Exempel:

```
Account
→ Orders
→ Positions
→ Recent Deals
→ Health
```

Synkintervall ska anpassas efter datatyp.

Execution-critical state behöver högre freshness än exempelvis lång historik.

## Snapshot och Event

Omnira ska använda både:

**Snapshots**

och:

**Events**

Snapshot beskriver aktuellt tillstånd.

Event beskriver vad som hände.

Exempel:

Snapshot:

position currently open

Event:

position filled at 10:24:03

Båda behövs för robust reconciliation.

## Heartbeat

Runnern ska skicka heartbeat till Omnira.

Heartbeat ska inte enbart säga:

I'm alive

utan även kunna inkludera:

- provider connected
- broker connected
- active account
- environment
- read capability
- execution capability
- reconciliation state
- latest successful sync
## Runner State

Exempel på runner states:

```
OFFLINE
STARTING
PROVIDER_DISCONNECTED
ACCOUNT_MISMATCH
SYNCING
RECONCILING
READ_ONLY_READY
EXECUTION_READY
BLOCKED
```

Atlas Market View ska kunna visa relevant state.

## Startup

Vid start ska runnern inte gå direkt till ready.

Flödet ska exempelvis vara:

```
START
→ INITIALIZE PROVIDER
→ VERIFY TERMINAL
→ VERIFY ACCOUNT
→ SYNC ACCOUNT
→ SYNC ORDERS
→ SYNC POSITIONS
→ SYNC RECENT HISTORY
→ RECONCILE
→ READY
```

## Restart Recovery

Runnern ska kunna startas om utan att Omnira förlorar kontroll över account state.

Efter restart ska historical deals och current positions kunna användas för att återuppbygga execution state.

Ny execution blockeras tills detta är klart.

## Last Error

Providerintegrationens tekniska fel ska översättas till strukturerade Omnira error states.

Råa felkoder får lagras för debugging.

Atlas och UI ska däremot kunna visa begriplig status.

Exempel:

```
PROVIDER_CONNECTION_FAILED
SYMBOL_NOT_FOUND
ACCOUNT_MISMATCH
ORDER_REJECTED
```

## Read Adapter

Read Adapter ska vara separat från Execution Adapter.

Read Adapter ansvarar för:

- connection
- terminal metadata
- account data
- symbols
- market data
- orders
- positions
- history
Read Adapter ska kunna köras även när Execution Adapter är avstängd.

## Execution Adapter

Execution Adapter introduceras först i en senare fas.

Den ansvarar för:

- broker pre-check
- order request construction
- order submission
- order result
- position modification
- position close
Execution Adapter ska aldrig innehålla strategy logic.

## Order Pre-Check

Innan en trading request skickas kan providerns pre-check-funktionalitet, där den finns, användas för att kontrollera om requesten är tekniskt acceptabel.

Det kan bland annat ge information om huruvida requesten kan utföras med aktuell account state.

Detta är defense-in-depth.

Ett lyckat broker pre-check betyder inte att Omniras Strategy-, Risk- eller Prop Firm-regler automatiskt är uppfyllda.

## Order Submission

Trading requests ska senare skickas genom den separata execution-funktionen.

Denna capability ska betraktas som privilegierad.

I Analysis och Read Only ska denna väg vara blockerad.

När den senare aktiveras får den endast nås genom:

```
Approved ExecutionIntent
→ Pre-Execution Revalidation
→ Execution Adapter
```

## Ingen direkt order submission från Strategy Engine

Det ska arkitektoniskt vara omöjligt för Strategy Engine att göra:

```
submitOrder()
```

Strategy Engine känner endast till:

```
STRATEGY_SIGNAL
```

Detta minskar blast radius om strategy-kod innehåller ett fel.

## Broker Pre-Check är inte Risk Engine

Det är viktigt att skilja dessa.

Providern kan exempelvis godkänna att kontot tekniskt har tillräcklig margin för en order.

Men Omnira kan ändå säga:

```
DENY
```

på grund av:

- $150 risk limit
- daily stop
- position limit
- prop firm drawdown
- news
- kill switch
Broker permission är inte Omnira permission.

## Market Order Request

När Strategy v1.0 senare exekveras ska execution request innehålla exakta parametrar.

Exempel:

- action
- symbol
- quantity
- order direction
- execution parameters
- stop loss
- take profit
- unique identifier
- comment/correlation metadata där möjligt
Exakt request-format ska definieras under implementation och verifieras på demo.

## Magic / Strategy Identifier

När providern stödjer identifierande metadata ska Omnira använda en konsekvent identifierare för sina orders.

Det ska göra det lättare att skilja:

- Omnira-generated
- manual trades
- andra automatiska system
Identifieraren ska inte ensam användas som security boundary.

## Broker Response

Alla broker responses ska registreras.

Resultat ska kunna skilja mellan exempelvis:

- request accepted
- filled
- partially filled
- rejected
- invalid stops
- invalid volume
- market unavailable
- insufficient resources
- unknown failure
Rå providerresponse ska bevaras där det är säkert och relevant.

## Submission är inte Fill

Att providern accepterar en request betyder inte automatiskt att den slutliga executionen blev exakt som planerat.

Systemet måste kontrollera actual resulting state.

Detta innebär att Omnira efter submission ska läsa:

- resulting orders
- resulting deals
- resulting position
## Actual Fill

Efter execution ska Omnira registrera:

- actual fill price
- actual quantity
- broker deal ID
- fill timestamp
- slippage
- commissions
- fees
Strategins theoretical entry ska inte skrivas över.

Båda ska bevaras.

## Stop Loss Verification

Efter att positionen öppnats ska systemet verifiera att actual broker position har korrekt SL.

Det ska inte räcka att requesten innehöll rätt värde.

Om actual SL saknas eller är fel:

```
CRITICAL_EXECUTION_INCIDENT
```

## Take Profit Verification

Samma kontroll ska genomföras för TP när canonical trade-plan kräver broker-native TP.

## Position Modification

När Strategy v1.0 triggar break-even ska Execution Adapter senare modifiera positionen.

För long:

SL flyttas till entry efter canonical 1m swing-high-trigger.

För short:

SL flyttas till entry efter canonical 1m swing-low-trigger.

Providerresultatet måste verifieras.

## Closing Position

Systemet ska senare kunna stänga en position genom Execution Adapter vid exempelvis:

- news exit
- time exit
- emergency close
Resultatet ska verifieras genom broker state.

## News Exit

Strategy v1.0 kräver:

Existing Position Exit = T-15m

inför relevant high-impact USD-news.

Runnern måste därför ha tillgång till aktuell execution instruction i tid.

Om Omnira är unavailable ska systemets framtida outage-policy avgöra hur en sådan aktiv managementregel hanteras.

Detta ska testas före live.

## Native Protection vs Active Management

SL och TP bör där möjligt ligga broker-native.

Break-even, time exit och news exit kräver däremot active management events.

Det innebär att systemets riskmodell måste förstå skillnaden mellan:

**Protection that survives Omnira outage**

och:

**Management that requires active runtime**

## Connection Loss

Om runtime/adaptern tappar provideranslutningen ska den:

- markera connection unhealthy
- stoppa nya execution requests
- försöka återansluta enligt kontrollerad policy
- genomföra reconciliation efter reconnect
Den får inte fortsätta anta att gamla position states är aktuella.

## Reconnect

Efter reconnect:

```
READ ACCOUNT
→ READ POSITIONS
→ READ ORDERS
→ READ RECENT DEALS
→ RECONCILE
→ READY
```

Execution får inte återaktiveras innan reconciliation passerat.

## Broker Server och VPN

Runnern ska kunna köras via en godkänd network policy.

Detta kan exempelvis vara:

- direct
- approved VPN
- VPS
Men nätverkskonfigurationen ska inte ligga i Strategy Engine.

Prop Firm Profile och deployment policy ska styra vad som är tillåtet.

## Latency Monitoring

Runnern ska kunna mäta relevant latency.

Exempel:

- Omnira → Runner
- Runtime → Provider
- request → broker response
- signal → actual fill
Detta hjälper senare vid VPS-beslut.

## Stationär dator som första rigg

Deployment target är inte låst och följer av providervalet. Se GATE-17.

Miljön ska användas för:

- provideranslutning
- runtime om ett sådant krävs
- demo
- read-only verification
- system health tests
Den ska inte betraktas som permanent infrastruktur.

Arkitekturen ska göra VPS-migration enkel senare.

## VPS Migration

När systemet behöver högre tillgänglighet eller lägre latency ska runnern kunna flyttas.

Omnira ska inte behöva bygga om:

- Strategy Engine
- Risk Engine
- Prop Firm Engine
- Atlas Market View
- journal
- analytics
Endast execution host och deployment config ska förändras.

## Credentials

Providercredentials ska behandlas som secrets.

De ska:

- inte lagras i frontend
- inte skickas till AI
- inte skrivas i vanliga logs
- inte ligga i Git
- inte finnas i strategy config
Runnern får endast tillgång till de credentials den behöver.

## Separate Demo och Live Credentials

Demo och live ska använda separata credential references.

En deployment får inte automatiskt välja live credentials när demo credentials saknas.

Fail closed gäller.

## Account Allowlist

Runnern ska bara få arbeta med explicit godkända accounts.

Om providern ansluter till ett konto utanför allowlist:

```
BLOCKED
```

## Symbol Allowlist

Under första implementationen bör tillåtna execution-symboler begränsas.

Exempel:

```
MNQ
```

Det minskar risken för att fel symbol exekveras.

## Logging och Audit

Execution Provider Adapter ska logga systemevents som:

- initialized
- connected
- account verified
- sync completed
- position discovered
- order discovered
- deal imported
- reconnect
- execution requested
- execution result
- modification result
- reconciliation result
Secrets ska aldrig hamna i log payload.

## Data Precision

Providerdata måste normaliseras med korrekt instrumentprecision.

Priser, volume och quantity ska respektera broker-symbolens faktiska steg.

Omnira får inte anta att alla instruments använder samma decimalprecision.

## Error Recovery

Olika typer av fel ska behandlas olika.

Exempel:

**Transient:**

- temporary network failure
kan retryas kontrollerat.

## State-uncertain:

- connection lost efter order submission
kräver reconciliation före retry.

## Permanent config error:

- wrong symbol
- wrong account
ska inte retryas automatiskt.

## No Blind Retry

Trading request får aldrig skickas om blint.

Om systemet är osäkert på om den första requesten exekverades ska det först fråga providern om verkligt state.

Detta är kritiskt för duplicate protection.

## Testing Strategy

Providerintegrationen ska testas stegvis.

## Testnivå 1 – Offline Contract Tests

Testa adapters mot mockade responses.

## Testnivå 2 – Local Provider Read Only

Verifiera riktig provideranslutning.

## Testnivå 3 – Demo Account Sync

Verifiera account, symbols, orders, positions och history.

## Testnivå 4 – Demo Execution

Först efter read-only sign-off.

## Testnivå 5 – Failure Testing

Testa disconnects, restarts och reconciliation.

## Testnivå 6 – Live Manual Approval

Endast efter senare gates.

## Read-Only Acceptance Criteria

Fas 2 ska inte betraktas som färdig förrän systemet konsekvent kan:

- connecta till providern
- verifiera rätt account
- läsa account state
- läsa relevanta symbols
- läsa NQ/MNQ/ES-data
- läsa open orders
- läsa open positions
- läsa history
- identifiera manuella/okända positions
- reconnecta
- reconcila efter restart
- rapportera health till Omnira
utan att kunna skicka en live-order.

## Execution Acceptance Criteria

När Execution Adapter senare aktiveras på demo ska systemet bland annat verifiera:

- rätt account
- rätt symbol
- rätt quantity
- exakt en order
- correct SL
- correct TP
- broker response captured
- fill captured
- position reconciled
- break-even modification
- news exit
- time exit
- duplicate protection
- restart recovery
## Atlas Market View och providern

Atlas Market View ska kunna visa både:

**Omnira State**

och:

**Broker State**

Exempel:

Planned entry:

24,120.25

Actual fill:

24,120.75

Planned SL:

24,105.50

Broker SL:

24,105.50

Status:

POSITION VERIFIED

Det gör execution transparent.

## Driftindikatorer i UI

Trading-projektet ska kunna visa:

- Runner Online
- Provider Connected
- Broker Connected
- Account Verified
- Data Fresh
- Reconciled
- Read Only / Execution Enabled
- Demo / Live
- Last Heartbeat
Användaren ska inte behöva öppna terminalen för att veta om integrationskedjan är healthy.

## Atlas och providerfel

Atlas ska kunna översätta strukturerade tekniska fel.

Exempel:

Execution är blockerad eftersom runtime rapporterar att providern är ansluten men fel account är aktivt.

eller:

Positionen öppnades korrekt men broker verifierar inte planerad stop loss. Kontot har därför satts i execution-blocked state.

AI:n ska inte försöka dölja tekniska fel med optimistiskt språk.

## Providerdata och Self-Improvement

Providerdata blir även en viktig källa för Atlas Trading Learning & Improvement Layer.

Systemet kan över tid analysera:

- slippage
- fill latency
- broker rejections
- commissions
- execution time
- missed execution
- position modification success
Detta gör det möjligt att förbättra execution utan att blanda ihop execution quality med strategy quality.

## Strategy Quality vs Execution Quality

Om en trade hade:

Theoretical +2R

men actual fill och execution costs resulterar i betydligt sämre performance måste systemet kunna identifiera orsaken.

Det kan vara:

- strategy problem
- latency problem
- slippage
- broker costs
- implementation problem
Execution Provider Adapter ska ge tillräcklig data för att göra denna separation.

## Ingen live-aktivering genom koddeploy

Att Execution Adapter finns i kodbasen betyder inte att live execution automatiskt är tillåten.

Live authority ska vara separat konfiguration och governance.

Detta minskar risken att en ny deployment av misstag börjar handla riktiga pengar.

## Säker standard

Den initiala standarden för alla nya providerintegrationsmiljöer ska vara:

```
READ_ONLY
```

En ny runner, nytt account eller ny deployment måste explicit kvalificeras innan execution får aktiveras.

## Kapitelstatus

Kapitel: 9 – Futures Execution Integration

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Revision: 2026-08-28 – kapitlet omskrivet provider-neutralt (Beslut D). Filnamn och rubrik ändrade från MetaTrader 5-integration. Struktur och resonemang bevarade.

Initial integration: Ingen provider vald (GATE-15). Adapterkontrakt ej låst (GATE-16)

Initial host: Ej låst. Runtime är deployment-beroende (GATE-17)

Initial capability: READ ONLY

Account sync: Planerad

Market data sync: Planerad

Positions/history sync: Planerad

```
Order pre-check: Framtida execution defense-in-depth
Order submission: Förbjuden under Read Only
```

Demo execution: Ej aktiverad

Live execution: Förbjuden

Host migration: Arkitekturen ska stödja den

Omnira ska först bevisa att systemet korrekt kan observera, synkronisera och reconcila den externa providern innan det får rätt att skicka en enda tradingorder.
