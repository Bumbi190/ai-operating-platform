# Kapitel 8 – Exekvering

Exekvering är den del av Omnira Trading System där ett analyserat och godkänt tradingbeslut förvandlas till en faktisk order hos broker eller prop firm.

Det är också den punkt där ett tekniskt fel kan få direkt ekonomisk konsekvens.

Därför ska exekveringslagret vara:

- enkelt
- deterministiskt
- auditerbart
- idempotent
- återhämtningsbart
- isolerat från strategi-AI
Den centrala principen är:

Execution Runner ska inte tänka. Den ska verifiera och exekvera exakt det den har fått tillstånd att exekvera.

## Från Trade Proposal till order

En trade ska inte gå direkt från Strategy Signal till broker.

Den ska först passera hela kontrollkedjan:

```
Strategy Signal
→ AI Analysis
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
→ Approval / Automation Policy
→ Execution Gateway
→ Execution Intent
→ Windows Execution Runner
→ MetaTrader 5
→ Broker / Prop Firm
```

Varje steg har ett separat ansvar.

## Trade Proposal är inte execution

Trade Proposal beskriver vad systemet vill göra.

Det kan exempelvis innehålla:

- instrument
- direction
- entry
- stop loss
- take profit
- position size
- risk
- R:R
- setup grade
- strategy version
- Risk Engine-resultat
- Prop Firm-resultat
Men ett Trade Proposal får inte i sig själv skapa en order.

Det måste först få rätt execution authority.

## Approval

Under tidiga systemfaser ska användaren själv godkänna Trade Proposal.

Ett approval ska vara explicit.

Det ska inte räcka att:

- öppna en proposal
- klicka någonstans i chartet
- lämna UI:t öppet
Approval ska vara en tydlig handling.

Exempel:

APPROVE TRADE

Approval ska lagras som ett separat objekt.

## Approval ska kunna expire

Ett tradingbeslut är tidskänsligt.

Ett Trade Proposal som var korrekt vid:

10:21:02

kan vara helt irrelevant några minuter senare.

Approval ska därför ha:

- created_at
- decided_at
- expires_at
När approval är expired krävs ny evaluation.

## Automation Policy

När Omnira senare går från manual approval till demo automation ska approval istället kunna komma från en explicit automation policy.

Det betyder inte att kontrollstegen försvinner.

Det betyder endast att:

Human Approval

ersätts av:

Approved Automation Policy

Strategy Engine, Risk Engine och Prop Firm Engine måste fortfarande passera.

## Execution Gateway

Execution Gateway är den säkerhetsmässiga gränsen mellan Omnira och executionmiljön.

Gateway ska kontrollera:

- att proposal finns
- att proposal är aktuell
- att rätt account används
- att proposal har giltigt approval
- att proposal inte expired
- att kill switch inte är aktiv
- att samma proposal inte redan exekverats
- att rätt environment används
Först därefter får ett Execution Intent skapas.

## Execution Intent

Execution Intent ska vara en fullständigt strukturerad instruktion.

Exempel på data:

- execution_id
- proposal_id
- account_id
- instrument
- side
- quantity
- order type
- expected entry
- allowed deviation
- stop loss
- take profit
- expiry
- approval reference
- strategy version
- risk decision reference
- prop decision reference
Execution Runner ska inte behöva tolka naturligt språk.

## Ingen AI-prompt till MT5

Execution ska aldrig fungera genom instruktioner såsom:

Köp ungefär två MNQ här och sätt stoppen under senaste low.

Detta är för tvetydigt.

Runnern ska istället få strukturerade värden:

```
symbol = MNQ
side = BUY
quantity = 1
```

SL = 24105.50

TP = 24151.00

```
execution_id = ...
```

Exekveringslagret ska vara maskinprecist.

## Idempotency

Idempotency är ett av de viktigaste säkerhetskraven i execution.

Anta att Omnira skickar ett orderrequest.

Runnern skickar ordern till MT5.

Sedan försvinner nätverket innan Omnira får svar.

Om Omnira bara försöker igen utan skydd kan resultatet bli:

**två positioner**

Det får inte vara möjligt.

Varje execution ska därför använda ett unikt:

```
idempotency_key
```

eller:

```
execution_id
```

Samma execution får endast kunna utföras en gång.

## Duplicate Protection

Execution Runner ska kunna svara:

```
ALREADY_PROCESSED
```

om samma execution intent skickas igen.

Detta ska gälla även efter processrestart när det är tekniskt möjligt.

Idempotency-state måste därför vara persistent eller kunna rekonstrueras.

## Pre-Execution Revalidation

Ett tidigare godkänt Trade Proposal betyder inte att ordern fortfarande är säker vid submission.

Direkt före orderläggning ska systemet kontrollera igen:

- current price
- technical SL
- R:R
- quantity
- actual account state
- daily risk
- open positions
- attempt count
- news state
- prop firm-state
- kill switches
- broker connection
- runner health
Om något relevant förändrats ska execution stoppas.

## Price Movement

Anta att setupen skapades med:

Entry = 24,120

SL = 24,100

TP = 24,165

och godkändes med ett giltigt R:R.

Om priset redan står på:

24,140

när execution ska ske kan samma plan vara helt förändrad.

Systemet får då inte skicka order bara för att proposal tidigare var godkänd.

## Slippage Guard

Execution ska ha stöd för maximal tillåten deviation.

Om actual entry innebär att:

- risken ökar över tillåten risk
- R:R faller under strategy minimum
- entry ligger utanför tillåten range
ska ordern inte skickas eller godkännas.

Exakta toleranser ska kalibreras senare.

## Market Order och framtida Order Types

Den första implementationen behöver inte stödja alla ordertyper.

Arkitekturen ska dock kunna hantera exempelvis:

- market
- limit
- stop
Strategy v1.0 använder entry direkt på confirmation close, vilket gör market execution till en naturlig första kandidat.

Den faktiska implementationen ska valideras mot brokerbeteende och slippage.

## Position Size Integrity

Quantity ska komma från Risk Engine.

Runnern får inte:

- avrunda upp
- öka size
- ändra size för att matcha en brokerpreferens
- välja ett större kontrakt
Om broker kräver annan quantity än godkänd ska execution nekas.

## Instrument Integrity

Runnern ska verifiera att:

- instrument finns
- symbol mapping är korrekt
- contract är rätt
- symbol är tradeable
- tick size är korrekt
- quantity step är korrekt
Fel futureskontrakt får inte exekveras bara för att symbolnamnen liknar varandra.

## Account Integrity

Execution Intent ska vara kopplat till ett specifikt konto.

Runnern ska kontrollera att det MT5-konto som faktiskt är aktivt motsvarar:

```
account_id
```

i execution intent.

Om fel konto är inloggat:

**NO EXECUTION**

Detta är en kritisk safety gate.

## Environment Integrity

Demo och live ska hållas isär.

Ett execution intent för:

```
environment = demo
```

får inte exekveras på:

live

och tvärtom.

Miljön ska vara explicit verifierad.

## MetaTrader 5

MetaTrader 5 är den initiala executionplattformen.

Omnira ska inte låta Strategy Engine kommunicera direkt med MT5.

Kommunikationen ska gå genom execution-lagret.

Det skapar ett säkerhetsmässigt mellanrum där alla kontroller kan göras innan order submission.

## Windows Execution Runner

Den första runnern ska köras på en dedikerad Windows-miljö.

Initialt kan detta vara användarens stationära dator.

Runnerns ansvar är begränsat till:

- kommunikation med Omnira
- kommunikation med MT5
- read operations
- execution requests
- order status
- position status
- heartbeat
- reconciliation
Runnern ska inte innehålla fri AI.

## 24/7 Drift

Execution Runner ska kunna köras kontinuerligt.

Den initiala workstation-miljön behöver därför minst:

- sleep avstängt
- stabil nätverksanslutning
- auto-start
- MT5 auto-start
- runner auto-start
- korrekt systemtid
- health monitoring
- log retention
- diskövervakning
Om datorn startar om ska systemet inte omedelbart börja handla.

Reconciliation måste först genomföras.

## Heartbeat

Runnern ska regelbundet rapportera att den lever.

Heartbeat kan innehålla:

- runner status
- MT5 connection
- broker connection
- active account
- environment
- latest sync
- runner version
- execution enabled
Om heartbeat försvinner ska Omnira markera runnern som unavailable.

Ingen ny execution ska skickas.

## Broker Connection

Runnern ska skilja mellan:

- MT5-process running
- terminal connected
- broker connected
- account tradeable
Att MT5-programmet är öppet betyder inte automatiskt att execution är möjlig.

## Order Pre-Check

Innan faktisk submission ska runnern eller relevant adapter använda de kontroller som broker/MT5 erbjuder när detta är möjligt.

Pre-check kan upptäcka exempelvis:

- invalid volume
- invalid stops
- insufficient margin
- closed market
- symbol restrictions
Pre-check ersätter inte Omniras Risk Engine.

Det är ytterligare defense-in-depth.

## Broker-Native Stop Loss

Kritisk stop loss ska så långt som möjligt skickas till broker tillsammans med eller omedelbart kopplat till positionen.

SL ska inte endast finnas som:

Omnira remembers to close later

Om Omnira eller internet försvinner ska broker-native SL fortfarande kunna skydda positionen.

## Broker-Native Take Profit

Samma princip gäller TP där executionmodellen tillåter det.

Broker-native TP minskar systemets beroende av att Omnira hela tiden är online för normal exit.

## Break-Even Modification

När canonical break-even-trigger inträffar ska Omnira kunna skicka en position modification:

```
SL → entry price
```

Även denna förändring ska:

- identifieras
- auditeras
- verifieras
- få broker response
Systemet får inte bara ändra UI-markeringen utan att bekräfta att brokerpositionen faktiskt uppdaterats.

## Stop Modification Failure

Om systemet försöker flytta SL till break-even men brokern nekar ändringen ska detta behandlas som ett executionproblem.

Atlas och riskmonitorering ska kunna visa:

```
BREAK_EVEN_MODIFICATION_FAILED
```

Systemet ska inte anta att positionen är skyddad när den inte är det.

## News Exit

För Strategy v1.0 ska en öppen position stängas:

T - 15 minuter

före relevant high-impact USD-news.

Execution Layer ska kunna exekvera denna stängning.

Detta är en systemexit och ska loggas som:

```
NEWS_EXIT
```

inte som strategy TP eller SL.

## Time Exit

New York-positioner får ligga öppna maximalt:

4 timmar från entry

om ingen tidigare exitregel har aktiverats.

Execution Layer ska kunna genomföra denna exit och logga:

```
TIME_EXIT
```

## London-positioner

London-positioner har ingen generell fyratimmarsgräns i Strategy v1.0.

De kan fortsätta utanför entry window så länge andra exitregler inte triggas.

Execution Layer ska därför skilja mellan:

- entry window
- position management window
Att entry-fönstret stänger innebär inte automatiskt att positionen ska stängas.

## Closing Orders

När en position ska stängas ska systemet veta varför.

Exempel:

- SL
- TP
- BE
- news exit
- time exit
- emergency close
- manual close
- prop rule emergency
- reconciliation action
Exit reason ska alltid journalföras.

## Partial Fills

Även om första MNQ-execution ofta är liten ska datamodellen stödja partial fills.

En order kan tekniskt få:

- full fill
- partial fill
- multiple fills
- rejection
Position state ska baseras på faktiska fills.

## Fill Data

Varje fill ska kunna lagra:

- requested price
- fill price
- quantity
- timestamp
- commission
- fees
- slippage
- broker deal ID
Detta behövs för att analysera execution quality.

## Strategy Price vs Fill Price

Systemet ska skilja mellan:

**Strategy Entry**

och:

**Actual Fill**

Skillnaden ska mätas.

Exempel:

Strategy entry = 24,120.25

Actual fill = 24,121.00

Slippage:

+0.75 points

Detta påverkar faktisk risk och R:R.

## Execution Quality

Execution Layer ska senare kunna analyseras separat från strategy performance.

En strategi kan ha positiv theoretical expectancy men dålig faktisk performance om execution costs är för höga.

Därför ska Omnira mäta:

- average slippage
- commissions
- rejection rate
- fill latency
- missed trades
- modification failures
- reconnects
## Latency

Latency ska mätas på flera nivåer när möjligt.

Exempel:

```
signal_time
→ proposal_time
→ approval_time
→ execution_request_time
→ runner_receive_time
→ broker_submit_time
→ fill_time
```

Detta gör att systemet kan identifiera var fördröjningar uppstår.

## Manual Approval Latency

Under manual approval kan användaren själv vara den största latency-källan.

Det är inte ett tekniskt fel.

Men systemet ska fortfarande kunna mäta hur lång tid approval tog.

Det hjälper senare att jämföra manual mode med automation.

## Proposal Expiry

En proposal ska ha en begränsad livslängd.

När den expirerar ska status bli:

```
EXPIRED
```

En expired proposal får inte återanvändas.

Ny strategy evaluation krävs.

## Retry Policy

Retries ska vara extremt försiktiga i execution.

Network request får ibland retryas.

Broker-order får inte blint retryas om systemet inte vet om den första submissionen lyckades.

Detta är ytterligare en anledning till:

- idempotency
- broker order reconciliation
- execution state machine
## Unknown Execution State

Om Omnira inte vet om en order skickades eller fylldes ska state vara:

```
UNKNOWN_EXECUTION_STATE
```

Systemet får inte skicka en ny order för att “vara säker”.

Trading på kontot ska pausas tills reconciliation visar verkligt broker state.

## Reconciliation

Reconciliation innebär att Omniras förväntade state jämförs med MT5:s verkliga state.

Systemet ska exempelvis jämföra:

- expected orders
- actual orders
- expected positions
- actual positions
- quantities
- SL
- TP
- account
- latest fills
Discrepancies ska loggas.

## Startup Reconciliation

Efter runner restart ska följande ske:

```
START
→ CONNECT MT5
→ VERIFY ACCOUNT
→ READ ORDERS
→ READ POSITIONS
→ READ RECENT DEALS
→ COMPARE WITH OMNIRA
→ RECONCILED
```

Först efter:

```
RECONCILED
```

får ny execution tillåtas.

## Unknown Position

Om MT5 har en position som Omnira inte känner igen ska den markeras:

```
UNKNOWN_POSITION
```

Ny trading ska blockeras.

Användaren kan exempelvis ha öppnat positionen manuellt.

Omnira får inte automatiskt stänga en okänd position utan explicit emergency policy.

## Manual Trades

Systemet ska kunna skilja:

```
OMNIRA_GENERATED
```

från:

```
MANUAL_EXTERNAL
```

En manuellt öppnad trade ska inte räknas som performance för Omnira Liquidity Manipulation.

Men positionen måste fortfarande påverka account risk.

## Orphan Orders

Samma princip gäller orders som finns hos broker men saknas i Omnira state.

De ska identifieras och reconcileras innan ny execution.

## Kill Switch

Execution Runner ska respektera kill switches.

Exempel:

- global kill
- account kill
- strategy kill
- instrument kill
- runner kill
Aktiv relevant switch betyder:

NO NEW EXECUTION

## Kill Switch och öppna positioner

Att stoppa nya trades och att stänga befintliga trades är två olika funktioner.

En vanlig kill switch ska minst stoppa:

**NEW EXECUTION**

Emergency close ska hanteras separat.

Detta förhindrar att en safety switch oavsiktligt gör något destruktivt med en redan skyddad position.

## Emergency Close

Systemet kan senare stödja en särskild emergency close.

Den kan exempelvis användas vid:

- broker anomaly
- corrupted strategy state
- severe risk incident
- user emergency action
Emergency close ska vara:

- explicit
- auditerad
- tydligt markerad
- separerad från normal strategy exit
## Network Failure

Om nätverket mellan Omnira och runnern går ner:

- inga nya trades
- inga nya re-entrys
- inga nya discretionary modifications
Redan broker-native SL/TP ska fortsätta skydda positionen.

Det är en central anledning till att critical protection ska ligga hos broker där möjligt.

## Omnira Outage

Samma princip gäller om Omnira-processen går ner.

Execution Runner ska inte börja skapa egna trades.

Den ska som default sluta acceptera nya execution instructions tills kontrollsystemet är tillbaka.

## Runner Outage

Om runnern är offline ska Omnira tydligt visa:

EXECUTION UNAVAILABLE

Strategy Engine kan eventuellt fortsätta analysera beroende på operation mode.

Men inga executable proposals får behandlas som om execution finns tillgänglig.

## MT5 Outage

Om MT5-processen eller broker connection försvinner ska execution blockeras.

Systemet ska kunna skilja detta från att hela runnern är offline.

## Logging

Varje execution event ska loggas.

Exempel:

- intent created
- intent dispatched
- runner received
- precheck started
- precheck passed
- order submitted
- broker acknowledged
- fill received
- SL confirmed
- TP confirmed
- modification requested
- modification confirmed
- close requested
- close filled
- reconciliation performed
## Immutable Execution History

Historiska execution events ska inte redigeras i efterhand.

Om exempelvis en tidigare broker response tolkats fel och senare korrigeras ska systemet skapa ett nytt correction event.

Audit trail ska visa båda.

## Execution Correlation ID

Hela executionkedjan ska kunna följas via ett gemensamt correlation ID.

Det ska gå att gå från:

Trade

bakåt till:

Fill

```
→ Order
→ ExecutionIntent
→ TradeProposal
→ RiskDecision
→ StrategySignal
→ StrategySetup
```

Detta är kritiskt för debugging och audit.

## Security

Execution Runner är en privilegierad komponent.

Den ska därför använda:

- autentiserad kommunikation
- krypterad transport
- minimal behörighet
- secret storage
- explicit account allowlist
- environment restrictions
MT5-credentials får inte exponeras till frontend eller AI-promptar.

## Signerade Execution Intents

På sikt bör execution intents kunna autentiseras eller signeras så att runnern kan verifiera att request verkligen kommer från rätt Omnira-miljö.

Runnern ska inte acceptera godtyckliga lokala network requests som kan skapa orders.

## Account Allowlist

Runnern bör explicit veta vilka konton den får arbeta med.

Om ett okänt account identifieras ska execution blockeras.

## Instrument Allowlist

Samma princip kan användas för instrument.

Under första valideringen kan execution exempelvis begränsas till:

- MNQ
även om MT5-kontot erbjuder hundratals andra symbols.

## Environment Banner

Omnira Trading UI ska tydligt visa:

**ANALYSIS**

**DEMO**

eller:

**LIVE**

Live-miljö ska vara visuellt omöjlig att förväxla med demo.

Detta är en human-factors-säkerhetsregel.

## Manual Approval UI

Trade Proposal ska visa hela planen före approval.

Minst:

- account
- environment
- instrument
- direction
- entry
- SL
- TP
- quantity
- risk
- R:R
- strategy
- setup grade
- Risk Engine
- Prop Firm Engine
- proposal expiry
Användaren ska förstå exakt vad som kommer skickas.

## Atlas och Execution

Atlas ska kunna förklara execution state.

Exempel:

Trade Proposal är godkänd. Pre-execution revalidation pågår.

eller:

Execution stoppades eftersom priset har flyttat sig och R:R nu är 1.74, under strategins minimum 2.0.

eller:

Ordern fylldes 0.5 points över planerad entry. Actual initial risk är fortfarande inom tillåten gräns.

Atlas beskriver execution.

Atlas utför inte broker-logiken själv.

## Execution och Self-Improvement

Execution-data ska användas av Atlas Trading Learning & Improvement Layer.

Systemet ska exempelvis kunna lära:

- vilka sessions som har mest slippage
- vilka entrytyper som är känsligast för latency
- om manual approval försämrar fill quality
- om vissa market regimes ger större execution costs
- om vissa broker-tider ger fler rejections
Detta kan leda till förbättringsförslag.

Det får inte automatiskt förändra live execution policy.

## Execution Candidate Improvements

Atlas kan exempelvis föreslå:

Candidate execution policy: sätt max allowed slippage till X under normal volatility.

Eller:

Limit execution gav bättre fills än market execution i historisk simulering.

Sådana förändringar ska behandlas som versionsstyrda kandidater och testas separat.

## Demo före Live

Execution Layer ska först bevisa stabilitet på demo.

Vi ska kunna verifiera:

- inga duplicate orders
- korrekt quantity
- rätt account
- rätt symbol
- korrekt SL/TP
- korrekt break-even
- korrekt news exit
- korrekt time exit
- korrekt reconciliation
- korrekt restart recovery
- korrekt kill switch
Först därefter får live manual approval övervägas.

## Failure Injection

Execution ska aktivt testas mot fel.

Exempel:

- network disconnect
- MT5 restart
- broker rejection
- duplicate request
- stale proposal
- wrong account
- wrong environment
- partial fill
- SL modification failure
- unknown position
- runner crash efter submission
Systemet ska visa säkert beteende i varje scenario.

## Success betyder inte bara fill

En lyckad execution är inte bara:

ORDER FILLED

Den ska också innebära att:

- rätt account användes
- rätt instrument användes
- rätt quantity användes
- risk låg inom gräns
- SL är korrekt
- TP är korrekt
- journalen är uppdaterad
- state är reconciled
## Exekveringens huvudprincip

Den viktigaste principen i execution-lagret är:

Gör exakt det som har godkänts, högst en gång, på rätt konto, med rätt risk, och bevisa efteråt vad som faktiskt hände.

Detta är viktigare än att ordern skickas några millisekunder snabbare under de första utvecklingsfaserna.

Robusthet kommer före hastighet.

## Kapitelstatus

Kapitel: 8 – Exekvering

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Initial executionmiljö: Windows workstation

Framtida miljö: VPS-kompatibel

Initial platform: MetaTrader 5

Execution authority: Separat från Strategy Engine och AI

Idempotency: Obligatoriskt

Pre-execution revalidation: Obligatoriskt

Broker-native SL/TP: Prioriterat

Reconciliation: Obligatoriskt

Execution implementation: Ej påbörjad

Live execution: Förbjuden tills senare gates är uppfyllda

Execution Layer ska betraktas som en säkerhetskritisk del av Omnira Trading System.
