# Kapitel 12 – Prop firm-regler

Prop firm-läget är en central del av Omnira Trading System eftersom ett prop firm-konto inte bara kräver en lönsam strategi.

Systemet måste också förstå och följa externa regler som kan skilja sig kraftigt mellan:

- olika prop firms
- olika challenge-typer
- funded-konton
- olika account sizes
- olika programversioner
- olika payout-modeller
En strategi kan vara lönsam och ändå misslyckas med en challenge om systemet bryter mot:

- drawdown
- daily loss
- consistency
- max position size
- minimum trading days
- news restrictions
- holding restrictions
- andra programregler
Den centrala principen är:

Prop Firm Rules Engine ska behandla varje konto som ett separat regelstyrt kontrakt och aldrig anta att två prop firm-program använder samma regler.

## Prop Firm Rules Engine

Prop firm-regler ska hanteras i ett separat lager:

```
Strategy Engine
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
```

Prop Firm Rules Engine ska inte ersätta Omniras interna Risk Engine.

Båda lagren måste passera.

## Varför intern risk och prop firm-risk separeras

Omniras interna Risk Engine definierar hur mycket risk vi själva accepterar.

Exempel på den första interna baslinjen:

- max $150 risk per trade
- max $450 realiserad daily loss
- max en öppen position
- max tre attempts per 4H-thesis
En prop firm kan däremot använda helt andra beräkningsmetoder.

Det kan exempelvis finnas:

- equity-based daily drawdown
- trailing maximum loss
- static maximum loss
- end-of-day trailing loss
- consistency requirements
Därför får dessa två regeltyper inte blandas ihop.

## Den striktaste regeln vinner

Anta:

**Internal Risk Engine**

tillåter:

$150

i ny risk.

Men Prop Firm Rules Engine beräknar att account headroom endast tillåter:

$90

Resultatet får då aldrig bli $150.

Systemet ska använda den striktaste praktiskt tillåtna gränsen.

Om minsta handlingsbara kontrakt riskerar mer än $90:

**TRADE DENIED**

## Regelprofiler

Varje prop firm-program ska representeras genom en versionsstyrd:

**PropFirmProfile**

Profilen ska kunna innehålla:

- provider
- program
- account size
- account type
- rule version
- effective date
- daily loss
- maximum loss
- drawdown calculation
- reset policy
- profit target
- minimum days
- consistency rules
- position limits
- instrument restrictions
- news restrictions
- holding restrictions
- payout rules
- network/VPN/VPS policy
## Inga globala hårdkodade regler

Omnira får inte innehålla logik såsom:

```
all_prop_firms_daily_loss = 5%
```

Det vore fel.

Regler förändras dessutom över tid.

Samma firma kan samtidigt ha flera olika program med olika modeller.

## Exempel på verklig regelvariation

Aktuella prop firm-program visar varför regelmotorn måste vara generell.

FTMO:s 2-Step-program använder exempelvis en Maximum Daily Loss där equity inklusive öppna positioners P/L, swaps och commissions påverkar beräkningen, medan deras Maximum Loss i 2-Step är statisk. FTMO:s 1-Step använder däremot en annan daily-loss-procent och en end-of-day trailing Maximum Loss-modell.

Topsteps aktuella Trading Combine använder istället en Maximum Loss Limit som är trailing och baseras på end-of-day balance-utveckling. För ett $50K Trading Combine är Maximum Loss Limit initialt $2,000 under startbalansen.

Detta är exakt varför Omnira inte ska ha en enda generell "drawdown"-variabel.

## Rule Types

Prop Firm Rules Engine ska minst kunna modellera följande typer av regler.

## Daily Loss

Daily loss kan skilja sig mellan program.

Det kan baseras på:

- balance
- equity
- realized P/L
- unrealized P/L
- commissions
- swaps
- start-of-day balance
- initial capital
Profilen måste därför definiera en exakt:

```
calculation_method
```

## Daily Reset

Reset-tid ska vara explicit.

Exempelvis använder FTMO aktuell CE(S)T-midnatt för vissa daily-loss-beräkningar.

Omnira får inte anta att prop firmens tradingdag använder:

America/New_York

bara för att vår strategi gör det.

## Maximum Loss

Maximum Loss kan vara:

- static
- trailing
- end-of-day trailing
- intraday trailing
- equity based
- balance based
Dessa är fundamentalt olika regler.

## Static Drawdown

Static drawdown innebär konceptuellt att en fast lägstanivå definieras från account start.

Exempel:

Initial Balance = $50,000

Maximum Loss = $2,000

Hard Floor = $48,000

Om regeln verkligen är static ändras floor inte när kontot går upp.

## Trailing Drawdown

Trailing drawdown följer account performance enligt firmans definierade metod.

Det innebär att risken kan bli striktare när kontot tjänar pengar.

Systemet måste därför kontinuerligt beräkna aktuell:

```
drawdown_floor
```

inte enbart läsa startvärdet.

## End-of-Day Trailing

I en end-of-day trailing-modell justeras gränsen vid definierade dagsgränser snarare än efter varje tick.

Topsteps aktuella Maximum Loss Limit är ett exempel där gränsen stiger när end-of-day balance växer och aldrig flyttas ned igen.

Detta kräver separat state över dagar.

## Equity-Based Rules

En equity-baserad regel innebär att floating P/L kan orsaka regelbrott innan positionen är stängd.

Det är särskilt viktigt eftersom Omniras interna första daily-riskmodell använder realiserade förluster.

Prop Firm Engine måste därför kunna blockera eller framtvinga riskåtgärder tidigare än Internal Risk Engine.

## Balance-Based Rules

Andra regler kan vara balance-baserade.

Omnira måste veta skillnaden.

balance

och:

equity

får aldrig behandlas som samma fält.

## Profit Target

Challenge-profiler kan ha profit target.

Systemet ska kunna lagra:

- target amount
- target percentage
- calculation basis
- completion requirements
Profit target är ett objective.

Det får inte användas som argument för att öka risk.

## Minimum Trading Days

Vissa program kräver ett minsta antal tradingdagar.

FTMO:s aktuella 2-Step har exempelvis ett krav på minst fyra tradingdagar i challenge- och verification-faserna.

Omnira ska kunna följa:

- trading days completed
- required days
- qualification state
Systemet ska inte ta onödiga trades bara för att uppfylla ett dagkrav om de inte är giltiga enligt strategin.

## Consistency Rules

Vissa prop firms använder consistency-regler.

Topsteps aktuella Trading Combine använder exempelvis ett consistency target kopplat till hur stor andel av det relevanta profitmålet som kommer från den bästa tradingdagen.

Andra program kan ha helt andra modeller.

Consistency måste därför representeras som formel, inte bara boolean.

## Payout Consistency

Consistency kan även finnas först i funded/payout-fasen.

Topsteps nuvarande Express Funded Account Consistency använder exempelvis en 40%-modell där den största vinnande dagen jämförs med total net profit.

Det visar att samma provider till och med kan ha flera consistency-modeller.

## Maximum Position Size

Prop firms kan begränsa hur många contracts som får hållas samtidigt.

Topsteps Trading Combine använder exempelvis account-size-specifika contract limits och en definierad micro-to-mini ratio.

Omnira måste därför kunna kontrollera:

- requested quantity
- existing quantity
- micro/mini equivalence
- account-level maximum
före execution.

## Scaling Plans

Vissa funded-program kan förändra tillåten position size baserat på performance.

Detta innebär att max position size inte alltid är ett statiskt accountfält.

Profilen ska kunna representera:

- tier
- threshold
- active days
- current allowed quantity
## Dynamic Risk Programs

Prop firm-regler kan även förändras med performance.

Topstep beskriver exempelvis ett aktuellt Dynamic Live Risk Expansion-program där Daily Loss Limit och maximum position size kan förändras när vissa performance- och active-day-villkor uppfylls.

Omnira måste därför kunna modellera stateful regler.

## Stateful Rules

En stateful regel beror på historik.

Exempel:

- highest EOD balance
- largest winning day
- days completed
- current scaling tier
- previous payout
- current payout cycle
Prop Firm Engine kan därför inte endast evaluera en trade isolerat.

Den behöver korrekt account history.

## News Restrictions

Prop firms kan ha egna regler kring news.

Dessa kan skilja sig mellan:

- challenge
- funded
- account type
Omnira Liquidity Manipulation har redan sin egen striktare strategy news-policy.

Prop Firm Engine måste ändå kontrollera firmans separata regel.

Om någon regel blockerar:

**NO TRADE**

## Holding Restrictions

Program kan reglera:

- overnight holding
- weekend holding
- news holding
Om en strategy position riskerar att gå in i en förbjuden period måste systemet känna till detta före entry.

## Instrument Restrictions

PropFirmProfile ska kunna definiera:

- allowed instruments
- prohibited instruments
- contract limits
- asset classes
- market hours
Ett brokerinstrument som tekniskt går att handla behöver inte vara tillåtet enligt firmans regler.

## Trading Hours

Prop firmens definierade trading hours kan skilja sig från Strategy Engines entry windows.

Båda måste respekteras.

Strategy:

10:00–12:00 NY

kan vara giltig.

Men om firmans konto är blockerat eller marknaden enligt programmet måste vara flat tidigare:

Prop Firm Engine kan neka.

## Flat-by-Time Rules

Systemet ska kunna stödja regler såsom:

all positions must be closed by X

Detta är separat från strategy time exit.

Prop firmens tidigare deadline vinner.

## Network Policy

Vissa firms kan ha policies kring:

- VPN
- VPS
- geographic location
- IP changes
Därför ska executionmiljön ha en konfigurerbar:

```
network_policy
```

Detta är särskilt relevant när den initiala Windows-riggen senare flyttas till VPS.

## Rule Source

Varje viktig prop firm-regel ska ha en källa.

Exempel:

- official rules page
- terms
- account dashboard
- provider documentation
Profilen bör lagra:

```
source_reference
```

och:

```
verified_at
```

## Regelverifiering

Prop firm-regler förändras.

Därför ska en gammal regelprofil inte antas vara korrekt för alltid.

Systemet ska kunna markera:

```
RULESET_REVIEW_REQUIRED
```

om reglerna inte verifierats inom lämplig tid eller om programmet ändrats.

## Versioning

Exempel:

Topstep Trading Combine Rules v2026-07

senare:

v2026-10

Historiska trades ska fortsätta referera till den regelversion som gällde när de togs.

## Effective Dates

Varje profil ska kunna ha:

- effective_from
- effective_until
Detta gör att historisk prop compliance kan rekonstrueras korrekt.

## Account Binding

Varje TradingAccount ska vara kopplat till exakt relevant PropFirmProfile.

Det ska inte räcka att account metadata säger:

```
provider = X
```

Eftersom samma provider kan ha många program.

## Challenge vs Funded

Challenge och funded ska behandlas som olika account states eller profiler.

Reglerna kan förändras efter att challenge passerats.

Omnira får inte automatiskt kopiera challenge-regler till funded-kontot.

## Account Lifecycle

Ett prop account kan konceptuellt gå genom:

```
CHALLENGE
→
VERIFICATION
→
FUNDED
→
PAYOUT_CYCLE
```

eller andra provider-specifika states.

Profilen ska kunna representera denna lifecycle.

## PropDecision

Varje exekverbar setup ska skapa ett separat:

**PropDecision**

Det ska innehålla:

- account
- ruleset version
- evaluation timestamp
- result
- failed rules
- warnings
- current headroom
- relevant state
Resultat:

```
ALLOW
```

eller:

```
DENY
```

## Rule-by-Rule Result

Omnira ska kunna visa:

```
Daily Loss → PASS
Maximum Loss → PASS
Position Limit → PASS
Consistency → PASS
Trading Hours → PASS
News → FAIL
```

Final:

```
DENY
```

Det gör beslutet auditerbart.

## Headroom

Prop Firm Engine ska beräkna hur mycket utrymme som återstår.

Exempel:

Maximum Loss Floor: $48,000
Current Equity: $48,620
Headroom: $620

Atlas kan sedan förklara:

Strategin är giltig, men aktuell technical SL med 1 MNQ skulle använda för stor del av återstående prop firm-headroom.

## Safety Buffer

Omnira bör senare kunna använda en intern safety buffer ovanför firmans absoluta breachnivå.

Exempel:

Prop rule:

breach at $48,000

Omnira operational floor:

$48,200

Detta kan skydda mot:

- slippage
- fees
- latency
- sudden price moves
Exakt buffer ska vara konfigurerbar och testad.

Det ska inte hittas på av AI.

## Hard Rule vs Objective

Prop Firm Engine ska skilja mellan:

**Hard Rule**

och:

**Objective**

Hard Rule kan innebära att account failar.

Objective kan exempelvis vara:

- profit target
- minimum days
Ett objective behöver inte blockera en trade på samma sätt som en breachregel.

## Rule Severity

Varje regel ska kunna klassificeras som exempelvis:

- hard_breach
- execution_block
- objective
- warning
- informational
Det gör motorn mer generell.

## Challenge Optimization

Atlas får senare analysera hur strategin fungerar inom en challenge.

Exempel:

- estimated pass probability
- expected days to target
- drawdown usage
- rule pressure
Men challenge optimization får inte innebära att Strategy Engine börjar ta trades som annars är ogiltiga.

## Ingen Forced Trading

Om minsta trading days krävs får Atlas inte skapa en falsk setup för att fylla en dag.

Om ingen giltig trade finns:

**NO TRADE**

Challenge tar hellre längre tid än att systemet bryter strategy integrity.

## Ingen Risk Chasing

När profit target nästan är nått får systemet inte automatiskt höja risk.

Samma RiskProfile gäller tills den explicit ändras.

## Ingen Recovery Gambling

Om account närmar sig maximum-loss-gränsen ska systemet inte höja risk för att försöka rädda challenge.

Det är exakt när riskdisciplinen är viktigast.

## Prop Firm Kill Switch

Om Prop Firm Engine upptäcker att account inte längre kan handlas säkert ska account kunna sättas:

```
PROP_BLOCKED
```

Alla nya trades stoppas.

## Breach Detection

Om en prop firm-regel redan har brutits ska systemet inte fortsätta trading.

State ska vara:

```
RULE_BREACH
```

eller motsvarande.

Atlas ska tydligt visa vilken regel som bröts.

## Near-Breach State

Systemet ska också kunna visa:

```
NEAR_LIMIT
```

innan faktisk breach.

Detta kan ge användaren tydlig riskinformation utan att ändra canonical strategy.

## Reset Handling

När prop firmens daily rule reset sker måste Prop Firm Engine beräkna om state korrekt.

Reset får inte ske utifrån Omniras interna daily-reset om firmans regel använder en annan timezone.

## Day Boundary Testing

Prop Firm Engine måste testas hårt kring:

- sekunden före reset
- exakt reset
- sekunden efter reset
Time-zone bugs kan annars orsaka challenge failure.

## Fees och Commissions

När prop firmens drawdown definition inkluderar commissions eller andra costs måste dessa inkluderas.

Omnira får inte använda gross P/L när regeln faktiskt baseras på net/equity.

## Floating P/L

Om regeln inkluderar unrealized P/L måste Risk/Prop Engine följa detta kontinuerligt.

Det räcker då inte att kontrollera reglerna endast vid entry.

## Continuous Monitoring

Vissa prop-regler måste utvärderas medan positionen är öppen.

Flödet är därför inte bara:

Pre-Trade Prop Check

utan även:

Open Position Monitoring

## Forced Protective Action

Om en öppen position närmar sig en hård prop firm breach kan framtida riskpolicy tillåta skyddsåtgärd.

Exempel:

- emergency close
Detta måste definieras i policy innan live.

Atlas får inte spontant bestämma sådan exit.

## Internal Risk vs Prop Breach

En situation kan exempelvis vara:

Internal daily loss:

$150 used of $450

men:

Prop maximum-loss headroom:

$80

Internal Risk Engine kanske fortfarande skulle säga ALLOW.

Prop Firm Engine säger:

```
DENY
```

Final:

```
DENY
```

## Challenge Simulation

Prop Firm Engine ska kunna användas i:

- backtest
- forward test
- demo
- live
Detta gör att samma strategy history kan simuleras mot flera prop firm-program.

## Prop Firm Backtesting

Vi ska kunna fråga:

Hur hade Strategy v1.0 klarat ett 50K-program med dessa exakta regler?

Systemet ska kunna mäta:

- pass/fail
- days to target
- breach reason
- maximum headroom usage
- consistency status
- drawdown path
## Program Comparison

När flera prop firms senare övervägs kan Atlas jämföra deras strukturella fit mot strategin.

Exempel:

Strategy v1.0 passar bättre med Program A än Program B eftersom dess normala intraday drawdown ofta ligger nära Program B:s trailing limit.

Detta kan bli värdefullt beslutsstöd.

## Jämförelse får inte baseras på marknadsföring

Atlas ska utgå från:

- faktiska regler
- fees
- payout conditions
- historical strategy behavior
inte endast account size eller annonserat profit target.

## Prop Firm Analytics

Systemet ska kunna mäta:

- challenge attempts
- pass rate
- breach rate
- average days to pass
- most common breach reason
- risk used
- payout eligibility
- performance per program
## Learning Layer

Atlas Trading Learning & Improvement Layer ska även lära från prop firm-resultat.

Exempel:

Strategin är lönsam totalt men 38 % av simulerade challenges misslyckas på trailing drawdown efter re-entry attempt 3.

Det kan skapa en research hypothesis.

Det får inte automatiskt förändra strategin.

## Candidate Prop Profiles

Atlas kan senare föreslå:

- annan internal safety buffer
- annan account risk profile
- annan challenge mode
Men prop firmens faktiska hard rules får aldrig ändras av Omnira.

## Compliance Knowledge

Atlas ska kunna bygga strukturerad kunskap om:

- provider
- program
- rule versions
- common failure modes
- strategy fit
Denna knowledge ska alltid kunna spåras till regelkälla och aktuell version.

## Rule Freshness

Eftersom regler förändras ska Atlas inte använda flera år gammal prop firm-information som om den vore aktuell.

Varje aktiv live-profil ska ha en definierad freshness-policy.

## Manual Verification före Live

Innan ett riktigt prop account används ska användaren kunna granska:

- provider
- program
- account size
- exact rules
- source links
- verified date
och explicit godkänna profilen.

## Prop Firm Profile Lock

Efter att en live-session börjat ska profileversionen inte ändras tyst.

Om firman ändrar regler krävs:

- new profile version
- impact review
- testing
- activation
## Atlas Market View

Trading UI ska kunna visa prop firm-state bredvid Risk Engine.

Exempel:

**Internal Risk**

```
PASS
```

## Prop Firm

```
PASS
```

## Maximum Loss Headroom

$1,284

## Consistency

36% / 50%

## Position Limit

1 / 5

## Status

```
SAFE
```

## Denial Example

Atlas ska kunna förklara:

Setup A+ är giltig och Internal Risk Engine tillåter $150 risk. Prop Firm Rules Engine nekar däremot traden eftersom en full SL skulle kunna föra equity under aktuell trailing maximum-loss-gräns.

Detta gör externa regler begripliga.

## Regelbrott är inte Trading Loss

Om en challenge failar för att systemet bryter en prop firm-regel är detta inte en vanlig strategy loss.

Det är:

**Compliance Failure**

och ska behandlas som en system-/policyincident.

## Prop Firm Incident Log

Incidenter ska kunna inkludera:

- rule violated
- ruleset version
- account state
- trigger event
- root cause
- prevention action
Målet ska vara:

**zero preventable prop rule breaches**

före Controlled Live Automation.

## Testing

Prop Firm Rules Engine ska ha boundary tests för:

- exact daily limit
- one tick/cent över limit
- trailing updates
- EOD reset
- equity movement
- commissions
- open positions
- position limits
- consistency thresholds
- minimum days
- news boundaries
- trading time boundaries
## Golden Rule Cases

För varje stödjad PropFirmProfile bör vi skapa officiella exempel från firmans dokumentation och verifiera att Omnira producerar samma resultat.

Detta blir golden compliance tests.

## Unknown Rule State

Om en aktiv regel inte kan utvärderas på grund av:

- missing account data
- stale firm configuration
- uncertain calculation
- unknown reset state
ska resultatet vara:

```
PROP_STATE_UNKNOWN
```

I execution-enabled mode:

**DENY**

## Prop Firm Mode

När systemet kör ett prop-konto ska Prop Firm Mode vara tydligt synligt.

Exempel:

**PROP MODE – ACTIVE**

Provider: Topstep
Program: Trading Combine
Profile: Version X
Account: 50K
Environment: Simulation / Funded enligt konto

Det ska vara svårt att glömma vilket regelverk systemet arbetar under.

## Första Prop Firm-profil

Den första faktiska PropFirmProfile ska väljas när vi vet vilken challenge eller provider som ska användas först.

Vi ska då inte kopiera generella exempel från denna bok.

Vi ska läsa firmans aktuella officiella regler och skapa en separat versionsstyrd profile specification.

## Varför vi väntar med exakt profil

Detta kapitel definierar motorn.

Det definierar inte ännu vår första firm-specifika implementation.

Det är avsiktligt.

Prop firms kan ändra:

- program
- regler
- account sizes
- payout conditions
- limits
Därför ska firm-specifika värden inte byggas in i systemarkitekturens kärna.

## Prop Firm Constitutional Principle

Den viktigaste principen är:

Omnira ska förstå prop firmens regler bättre än den behöver förstå dess marknadsföring.

En challenge är ett regelstyrt system.

Omnira ska kunna räkna reglerna exakt, följa dem kontinuerligt och säga nej till en trade innan den riskerar kontot.

## Kapitelstatus

Kapitel: 12 – Prop firm-regler

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Prop Firm Rules Engine: Specificerad på arkitekturnivå

Firm-specifik första profil: Ej vald

Internal Risk Engine: Separat

Rule versioning: Obligatoriskt

Rule source tracking: Obligatoriskt

Unknown prop state: Fail closed

Challenge simulation: Planerad

Live prop execution: Förbjuden tills separat profile verification och senare safety gates är godkända

Prop Firm Rules Engine ska göra det möjligt för Omnira Trading att anpassa samma trading-system till flera challenge- och funded-program utan att den underliggande strategin eller riskarkitekturen byggs om.
