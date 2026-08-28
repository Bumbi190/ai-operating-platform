# Kapitel 3 – Strategispecifikation

Omnira Trading System behöver en strategi som går att beskriva så exakt att samma beslut kan reproduceras i:

- historisk backtesting 
- market replay 
- forward testing 
- Analysis Only 
- demo trading 
- manual approval 
- Controlled Live Trading 
- framtida autonom execution 
Den första strategin är:

**Omnira Liquidity Manipulation – Canonical v1.0**

Strategispecifikationen definierar vad Strategy Engine ska leta efter, hur en setup går från marknadskontext till entry och vilka villkor som måste vara uppfyllda innan en Strategy Signal får skapas.

Strategin är låst som canonical baseline för implementation och validering, men den är ännu inte bevisad lönsam. Canonical innebär här att reglerna är tillräckligt definierade för att kunna implementeras och testas konsekvent, inte att positiv expectancy redan är bevisad. 

Den centrala principen är:

Strategy Engine identifierar en tradingmöjlighet. Den bestämmer inte ensam om traden får tas.

## Strategins grundidé

Omnira Liquidity Manipulation bygger på en hypotes om hur pris beter sig runt liquidity och inefficiencies.

Strategin söker efter att priset, efter en utvald 4H-open, manipulerar mot tidigare identifierad:

- liquidity 
- eller Fair Value Gap 
på:

- 5m 
- 15m 
Efter manipulationen analyseras 1m efter reversal-confirmation genom:

- iFVG 
- CISD 
- eller båda 
SMT mellan NQ och ES används som ytterligare confirmation.

SMT är dock inte ett obligatoriskt entrykrav.

Den grundläggande hypotesen är att en manipulation mot relevant 5–15m liquidity eller FVG, följd av definierad 1m reversal-confirmation, kan skapa positiv expectancy mot nästa giltiga liquidity target. 

## Hypotes – inte marknadslag

Det är viktigt att skilja mellan:

**Strategy Definition**

och:

**Strategy Edge**

Definitionen säger:

Om dessa conditions inträffar skapas en signal.

Edge-frågan är:

Producerar dessa signals faktiskt positiv expectancy över tillräckligt mycket data?

Det senare måste besvaras genom:

- backtest 
- out-of-sample 
- forward test 
- demo 
- senare controlled live-data 
Strategin får alltså inte betraktas som bevisad enbart för att reglerna nu är tydligt dokumenterade.

## Primär marknad

Den första valideringen ska göras på:

**Nasdaq-100 Futures – NQ**

och:

**Micro E-mini Nasdaq-100 Futures – MNQ**

NQ och MNQ används som strategi- och executionmarknad beroende på setup och riskprofil.

ES används som comparison instrument för SMT.

Strategin kan i framtiden testas på andra instrument, men inget annat instrument ska betraktas som validerat förrän det genomgått egen backtesting och forward testing. 

## NQ och MNQ

NQ och MNQ följer samma underliggande Nasdaq-100-marknad men har olika kontraktsstorlek.

Det gör att systemet kan skilja mellan:

**Market Analysis**

och:

**Execution Contract**

Exempelvis kan marknadsstrukturen analyseras i Nasdaq-futures medan actual execution sker i MNQ för att position sizing ska passa RiskProfile.

Strategy Engine ska därför arbeta med canonical market/instrument-representationer och inte hårdkoda broker-specifika contracts.

**ES**

ES används initialt inte som primary execution instrument för Strategy v1.0.

Dess roll är framför allt:

**SMT comparison**

mot NQ.

SMT analyseras på:

- 1m 
- 5m 
- 15m 
Detta kräver att NQ- och ES-data är tidsmässigt jämförbara.

## Timeframe-struktur

Strategin använder tre huvudsakliga analysnivåer.

**4H**

4H används för:

- övergripande thesis 
- selected 4H opens 
- tidigare 4H highs/lows 
- kontext 
## 5m och 15m

Dessa används för:

- liquidity 
- FVG 
- manipulation 
- market structure 
## 1m

1m används för:

- entry phase 
- liquidity events 
- iFVG 
- CISD 
- SMT när relevant 
- entry 
- break-even 
- trade management 
Det är alltså inte en strategy där alla beslut tas från samma timeframe.

## Top-Down Flow

Strategins grundläggande progression är:

```
4H Context
→ 5–15m Target / Manipulation
→ 1m Confirmation
→ Entry
```

Detta är en viktig del av strategy identity.

1m ska inte användas för att leta fristående setups utan relevant higher-timeframe context.

## Canonical Timezone

All strategy- och sessionslogik ska använda:

**America/New_York**

Systemet får inte använda en permanent:

UTC-4

-offset.

Anledningen är daylight saving time.

New York local time förändrar relationen till UTC under året, medan strategy windows fortfarande ska motsvara samma lokala tider.

Canonical timestamps kan lagras i UTC, men strategy context ska beräknas i IANA-timezone:

America/New_York

## Trading Windows

Strategy v1.0 har endast två tillåtna entry windows.

## London

## 02:00–05:00 America/New_York

## New York

## 10:00–12:00 America/New_York

En ny position måste öppnas inom något av dessa windows. 

## Selected 4H Opens

Strategin använder endast de 4H-opens som hör till:

**02:00**

och:

**10:00**

New York-tid.

Övriga 4H-opens kan finnas i marknadsdatan men ska inte användas som strategy triggers i Canonical v1.0.

Detta är viktigt eftersom strategin inte är:

Trade varje 4H-candle.

Den är byggd runt två särskilt definierade sessionskontexter.

## Entry Window vs Position Management

Trading window definierar när en ny position får öppnas.

Det betyder inte automatiskt att en redan öppen trade måste stängas när entry-window tar slut.

För London gäller däremot en obligatorisk window-close break-even vid 05:00: positionen
stängs inte, men stop loss flyttas till entry price.

Detta hanteras separat för London och New York senare i strategin.

## Higher-Timeframe Context

När relevant selected 4H-open har inträffat ska Strategy Engine identifiera potentiella:

- liquidity targets 
- FVG-zoner 
på 5–15m.

Detta skapar den potentiella riktningen för manipulationen.

## Long Thesis

För en potentiell long ska relevant target context finnas:

- under aktuellt pris 
Det kan vara:

- giltig 5–15m liquidity 
- eller giltig 5–15m FVG 
Systemet väntar därefter på att priset manipulerar nedåt till denna struktur.

Efter den nedåtgående manipulationen söker systemet reversal-confirmation för long.

## Short Thesis

För potentiell short gäller motsatsen.

Relevant:

- liquidity 
- eller FVG 
ska finnas över aktuellt pris.

Systemet väntar därefter på manipulation uppåt.

Efter denna manipulation söker systemet bearish reversal-confirmation.

## Giltig Liquidity

Canonical Strategy v1.0 tillåter följande liquiditytyper:

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
- intermediate swing highs 
- intermediate swing lows 
Dessa ska representeras strukturerat i systemet snarare än endast som visuella chartmarkeringar. 

## Swing High

En canonical swing high definieras genom tre candles.

Den mittersta candle måste ha:

High[i] > High[i-1]

och:

High[i] > High[i+1]

Den måste alltså ha högre high än candle direkt före och direkt efter.

## Swing Low

Motsvarande:

Low[i] < Low[i-1]

och:

Low[i] < Low[i+1]

Den mittersta candle måste ha lägre low än båda sina direkta grannar.

## Swing Confirmation

En swing kan inte betraktas som confirmed förrän den efterföljande candle finns.

Detta är särskilt viktigt i:

- live 
- replay 
- backtest 
annars skulle systemet använda information från framtiden.

## Intermediate Liquidity

Intermediate liquidity är interna swing highs eller swing lows inom aktuell market structure.

De behöver inte samtidigt vara:

- previous day high/low 
- previous session high/low 
- previous 4H high/low 
De representerar mindre intern liquidity som fortfarande kan vara relevant för strategy flow.

## Fair Value Gap

Strategy v1.0 använder en standardiserad:

**tre-candle FVG**

FVG-zonen definieras av gapet mellan candle 1 och candle 3.

För bullish FVG finns ett gap mellan relevant high från candle 1 och low från candle 3.

Bearish FVG använder motsvarande inverterad struktur.

FVG får identifieras på:

- 5m 
- 15m 
## FVG är strukturerad data

En FVG ska inte endast finnas som en färgad rektangel på chartet.

Systemet ska kunna känna till:

- direction 
- timeframe 
- upper bound 
- lower bound 
- formation time 
- touch state 
- active state 
Det gör att samma FVG kan användas av:

- Strategy Engine 
- Atlas 
- Journal 
- Backtest 
- Market View 
## Manipulation

När relevant higher-timeframe target har identifierats väntar systemet på manipulation.

Det finns två alternativa canonical triggers.

## Liquidity Manipulation

Manipulation mot liquidity är complete när priset har handlats:

- över relevant liquidity för ett upside sweep 
- eller under relevant liquidity för ett downside sweep 
Det krävs alltså att nivån faktiskt tas.

## FVG Manipulation

Manipulation mot FVG är complete när priset touchat relevant 5–15m FVG-zone.

## Liquidity och FVG är alternativa triggers

Strategin kräver inte:

**Liquidity sweep + FVG touch**

samtidigt.

Canonical regel är:

**Liquidity manipulation OR FVG manipulation**

kan föra setupen vidare till 1m Entry Phase. 

## Övergång till 1m

När manipulationen är complete övergår setupen till:

**1m Entry Phase**

Systemet börjar då leta efter reversal-confirmation.

## 1m Liquidity Sweep

En 1m liquidity sweep är:

**preferred**

men inte obligatorisk.

Detta är viktigt.

Strategin kräver inte att alla valid trades först måste sweepa ytterligare 1m liquidity.

Det som är obligatoriskt är istället confirmation genom:

- iFVG 
- eller CISD 
## iFVG och CISD

iFVG och CISD är kärnan i Strategy v1.0:s entry confirmation.

En trade kräver minst en av dem.

Canonical Strategy Specification låser deras roll, men den säger samtidigt att deras exakta programmeringsdefinitioner ska dokumenteras som separata deterministiska detection rules innan Strategy Engine implementeras.

Atlas får alltså inte själv titta på chartet och avgöra vad som “ser ut som” iFVG eller CISD.

Samma detection logic måste senare användas i:

- backtest 
- replay 
- analysis 
- demo 
- live execution. 
## Varför detta är viktigt

Om iFVG definieras på ett sätt i backtest men en människa eller AI använder en annan definition live får vi i praktiken två olika strategier.

Det skulle göra performance-resultaten svåra att lita på.

Strategispecifikationen definierar därför konceptet.

Den separata detection specificationen ska definiera exakt machine behavior.

## iFVG

iFVG är en giltig standalone confirmation i Canonical v1.0.

Om iFVG uppstår utan CISD kan setupen fortfarande vara tradable.

Den får då Grade B.

**CISD**

CISD kan också fungera som standalone confirmation.

Om CISD uppstår utan iFVG kan setupen vara tradable.

Den får Grade C.

## iFVG + CISD

När båda finns får setupen starkare canonical grade.

Det ger:

**Grade A**

innan eventuell SMT-upgrade.

**SMT**

SMT jämför:

**NQ**

mot:

**ES**

på:

- 1m 
- 5m 
- 15m 
Canonical definition på övergripande nivå är att ett instrument tar relevant liquidity medan det andra inte gör det.

SMT fungerar som:

**extra confirmation**

inte som en egen trade trigger.

## SMT kan inte skapa en trade

Om systemet ser SMT men saknar:

- iFVG 
- CISD 
får ingen Strategy Signal skapas.

SMT får aldrig användas för att skapa en trade ensam.

## SMT och Grade

SMT kan endast uppgradera:

**A**

till:

**A+**

Det innebär att SMT inte höjer:

```
B → A
```

eller:

```
C → B
```

Canonical setup grade är explicit kopplad till confirmationkombinationen.

**SMT = UNKNOWN**

Om ES-data saknas eller inte kan verifieras ska systemet inte behandla detta som:

SMT = FALSE

Det korrekta tillståndet ska vara:

SMT = UNKNOWN

En setup kan fortfarande vara giltig eftersom SMT inte är obligatorisk.

Men systemet får då inte felaktigt ge A+.

## Setup Grades

Canonical v1.0 använder fyra grades.

**A+**

## iFVG + CISD + SMT

**A**

## iFVG + CISD

**B**

## iFVG only

**C**

## CISD only

Alla fyra är giltiga i canonical baseline. 

## Minimum Grade

Minimum allowed grade ska vara konfigurerbar så att framtida research kan testa exempelvis:

- A+ only 
- A+ och A 
- A+ till B 
- alla grades 
Men canonical grundkonfiguration för Strategy v1.0 accepterar:

**A+, A, B och C**

Det är viktigt att framtida analytics inte i efterhand låtsas att bara A/A+ alltid var strategy.

## Grade är data

Setup grade ska alltid journalföras.

Det gör att systemet senare kan analysera:

- expectancy A+ 
- expectancy A 
- expectancy B 
- expectancy C 
utan att skriva om historiska trades.

## Entry

När samtliga tidigare strategy requirements passerat sker entry på 1m.

Entry sker:

**direkt på close av confirmation candle**

Det gäller både:

- iFVG 
- CISD 
## Ingen obligatorisk Retest

Canonical v1.0 kräver inte:

- retrace 
- retest 
- limit-order tillbaka till pattern 
efter confirmation.

Entry planeras direkt efter confirmation close.

Detta är särskilt viktigt för backtest- och live-paritet.

## Confirmation Close måste vara verklig

Systemet får inte känna till candle close innan candle faktiskt stängt.

I backtest måste alltså event chronology respekteras.

Annars uppstår look-ahead.

## Entry Price och verklig Fill

Strategy Engine definierar strategy entry.

Actual execution kan senare ske något annorlunda på grund av:

- bid/ask 
- latency 
- slippage 
Därför ska systemet skilja mellan:

**Strategy Entry**

och:

**Actual Fill**

Execution Gateway ska dessutom kunna neka traden om price movement gör att strategy rules inte längre håller.

## Stop Loss

Stop loss är strategy-defined.

## Long

SL placeras:

**under manipulationens senaste giltiga swing low**

## Short

SL placeras:

**över manipulationens senaste giltiga swing high**

## Technical Stop

Detta är:

**Technical Stop Loss**

Den kommer från market structure.

Risk Engine får använda den för position sizing.

Risk Engine får inte ändra den för att få en trade att passa.

## Stop Integrity

Om minsta handlingsbara position med korrekt technical SL överskrider RiskProfile:

**TRADE DENIED**

Vi flyttar alltså inte stoppen närmare.

Vi avstår istället traden.

## Take Profit

TP ska sättas mot:

**första giltiga liquidity target som ger minst 2.0R**

Det innebär att systemet först identifierar liquidity targets i tradens riktning.

Targets som ligger närmare än 2R får inte användas som slutligt TP i Canonical v1.0.

## Första giltiga target

Om flera liquidity targets erbjuder minst 2R används:

**den första giltiga**

Vi hoppar inte automatiskt över en närmare giltig target för att försöka få exempelvis 5R istället för 2.5R.

## Minimum Risk/Reward

En setup måste erbjuda minst:

**1:2**

vid entry.

Om inget giltigt liquidity target erbjuder minst:

2.0R

är setupen invalid.

## R:R är strategy validity

Minimum 2R är alltså inte bara analytics.

Det är en faktisk entry gate.

Exempel:

1.93R

```
→ INVALID
```

2.00R

```
→ kan passera denna regel.
```

## Break-Even

Strategy v1.0 använder break-even-management.

Break-even-triggern är explicit definierad.

## Long

Efter entry identifieras närmaste bekräftade 1m swing high.

När priset tar denna nivå:

```
SL → Entry Price
```

## Short

Närmaste bekräftade 1m swing low efter entry används.

När priset tar nivån:

```
SL → Entry Price
```

Denna regel är canonical. 

## Window-close Break-Even — London

Utöver den swing-baserade triggern ovan har London-sessionen en andra, tidsbaserad
break-even-trigger.

Om positionen fortfarande är öppen exakt när London entry-window stänger
05:00 America/New_York:

```
SL → Entry Price
```

Detta sker även om den swing-baserade triggern ännu inte har inträffat.

Har swing-triggern redan flyttat SL till entry price gör window-close-triggern ingenting.

## Confirmed Swing gäller även BE

BE-trigger använder samma swingdefinition som tidigare.

Nivån måste alltså vara confirmed.

Systemet får inte använda en framtida swing som ännu inte existerade vid beslutstidpunkten.

## Ingen fortsatt Trailing

Efter break-even:

SL = Entry

och ligger normalt kvar där.

Strategy v1.0 använder ingen kontinuerlig trailing stop.

## Partial Profits

Strategy v1.0 använder:

**inga partial profits**

Positionen reduceras alltså inte stegvis vid olika targets.

## Nästan träffat TP

Om priset nästan når TP och sedan vänder gör strategin inte någon discretionary exit.

TP ändras inte.

Systemet tar inte partial profit.

Positionen fortsätter enligt sin definierade management mot:

- TP 
- BE 
- news exit 
- time exit 
- annan explicit systemexit 
## Max en öppen position

Strategy v1.0 tillåter endast:

**1 öppen position**

åt gången.

Ingen ny Strategy v1.0-position får öppnas medan en befintlig strategy position fortfarande är öppen.

Risk Engine och broker reconciliation förstärker denna regel.

## Motsatt Setup

Om en valid opposite setup uppstår medan en position är öppen ska den:

**ignoreras för execution**

Systemet ska inte automatiskt:

- hedge 
- reverse 
- close current trade 
- öppna opposite position 
Den observerade setupen kan däremot journalföras för research.

## Re-entry

Re-entry får endast ske efter:

**förlorande trade**

Efter en loss får ett nytt attempt ske när en ny fullständigt giltig setup uppstår inom samma 4H-thesis.

Ingen normal strategy cooldown krävs.

## Max tre Attempts

Canonical gräns:

**max 3 attempts per 4H thesis**

Det betyder:

Attempt 1

```
→ loss
```

Attempt 2 kan bli möjlig.

```
→ loss
```

Attempt 3 kan bli möjlig.

Efter tre attempts är thesisen färdig för execution.

Risk Engine kan stoppa trading tidigare.

## Re-entry efter Winner

Efter en vinnande trade:

**ingen ytterligare re-entry på samma thesis**

## Re-entry efter Break-Even

Samma gäller efter BE.

Break-even avslutar fortsatt re-entry för denna thesis.

## Re-entry är inte Revenge Trading

Ett nytt attempt kräver:

**en helt ny valid setup**

Det räcker alltså inte att föregående trade stoppades.

## Risk Baseline

Canonical strategy-dokumentet refererar till den initiala manuella riskbaslinjen:

Max risk/trade: $150

Max daily drawdown: $450

Max attempts/4H thesis: 3

Riskvärdena är dock separata RiskProfile-parametrar och ska inte hårdkodas inne i Strategy Engine. 

## Strategy och Risk separeras

Strategy Engine svarar:

Är setupen giltig?

Risk Engine svarar:

Får kontot ta den?

En setup kan därför vara:

```
STRATEGY_PASS
```

men:

```
RISK_DENY
```

Det är ett korrekt systemresultat.

## News Policy

Strategy v1.0 har en egen explicit news policy.

Den gäller relevant:

**high-impact USD-news**

och inkluderar bland annat:

- FOMC 
- CPI 
- NFP 
## New Entries runt News

Inga nya entries tillåts från:

**T-1 timme**

till:

**T+4 timmar**

kring relevant high-impact USD-event.

## Existing Position före News

Om en position redan är öppen ska den stängas:

**T-15 minuter**

före relevant high-impact USD-news.

Detta är en explicit canonical exitregel.

Atlas får inte välja att hålla positionen genom eventet därför att den “ser stark ut”. 

## News-regler ska vara strukturerade

News policy får inte bero på att Atlas läser en rubrik och subjektivt bedömer:

Den här nyheten verkar inte så viktig.

Systemet ska använda strukturerade NewsEvents och definierad impact classification.

## Unknown News State

I execution-enabled mode ska okänd critical news state inte tolkas som:

```
SAFE
```

Systemets generella fail-closed-princip ska gälla.

## London Trade Management

London entry window är:

**02:00–05:00 America/New_York**

En trade måste öppnas inom detta window.

Om positionen fortfarande är öppen exakt 05:00 America/New_York gäller obligatorisk
window-close break-even:

```
SL → Entry Price
```

Detta gäller även om den swing-baserade break-even-triggern ännu inte har inträffat.

Efter denna action:

```
SL = Entry Price
```

Positionen får därefter fortsätta.

London trades har:

**ingen explicit fyratimmarsgräns**

De fortsätter tills en annan explicit canonical exitregel inträffar, exempelvis:

- TP 
- SL 
- BE 
- relevant news exit 
- emergency- eller safety-exit 
- annan explicit canonical exitregel 

Window-close break-even är deterministisk och tidsstyrd. Den får inte hoppas över av AI,
UI eller operatör.
## New York Trade Management

New York entry window är:

**10:00–12:00 America/New_York**

En position får fortsätta efter 12:00 om den redan öppnats korrekt.

Men för New York trades gäller:

**Max trade duration = 4 timmar från entry**

förutsatt att relevant news inte kräver tidigare exit.

## Time Exit

Om en New York trade fortfarande är öppen fyra timmar efter entry ska den stängas enligt strategy time-exit.

Detta ska journalföras separat från:

- TP 
- SL 
- BE 
- news exit 
## Strategy Invalidation före Entry

En setup ska betraktas som invalid om något av följande gäller:

- entry utanför trading window 
- required confirmation saknas 
- R:R under 2.0 
- relevant news blackout aktiv 
- annan position redan öppen 
- max attempts nått 
Utöver detta kan Risk Engine och Prop Firm Rules Engine neka en annars giltig setup. 

## Invalid betyder inte Risk Denied

Det är viktigt att skilja:

**STRATEGY_INVALID**

från:

**RISK_DENIED**

Exempel:

R:R = 1.7

är Strategy Invalid.

Men:

R:R = 2.4
Risk required = $170
Max risk = $150

kan vara:

Strategy PASS

Risk DENY.

Dessa resultat måste journalföras separat.

## Strategy State Machine

Strategy v1.0 ska kunna representeras genom en deterministisk state machine.

Den canonical ordningen är:

```
WAIT_FOR_4H_OPEN
↓
```

```
IDENTIFY_5_15M_TARGETS
↓
```

```
WAIT_FOR_MANIPULATION
↓
```

```
MANIPULATION_CONFIRMED
↓
```

```
ENTER_1M_CONFIRMATION_PHASE
↓
```

```
WAIT_FOR_IFVG_OR_CISD
↓
```

```
EVALUATE_SMT
↓
```

```
GRADE_SETUP
↓
```

```
CALCULATE_ENTRY
↓
```

```
CALCULATE_TECHNICAL_SL
↓
```

```
FIND_FIRST_VALID_TARGET_GE_2R
↓
```

```
STRATEGY_VALIDATION
↓
```

**STRATEGY_SIGNAL**

## Varför State Machine behövs

State machine gör strategin:

- reproducerbar 
- testbar 
- auditerbar 
- visualiserbar 
Atlas Market View kan exempelvis visa:

```
WAIT_FOR_MANIPULATION
```

och förklara:

Relevant 15m FVG finns under price men har ännu inte touchats.

Eller:

```
WAIT_FOR_IFVG_OR_CISD
```

och förklara:

Manipulationen är complete men 1m confirmation saknas fortfarande.

## Strategy Signal

När samtliga strategy requirements är uppfyllda skapas:

**STRATEGY_SIGNAL**

Signal kan bland annat innehålla:

- strategy version 
- thesis 
- instrument 
- direction 
- grade 
- entry 
- technical SL 
- target 
- R:R 
- relevant confirmation 
- timestamps 
## Strategy Signal är inte en Trade

Detta är en av systemets viktigaste boundaries.

Strategy Engine slutar sin authority vid:

**Strategy Signal**

Efter detta börjar kontrollkedjan.

## Authority Chain

Efter signal går processen:

```
Strategy Engine
→ AI Analysis
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
→ Approval / Automation Policy
→ Execution
→ Futures Execution Provider
```

Strategy Engine får inte skicka orders direkt. 

## AI:s roll i strategin

Atlas får:

- förklara setup 
- sammanfatta structure 
- beskriva manipulation 
- visa confirmation 
- förklara grade 
- jämföra historik 
- uttrycka osäkerhet 
Atlas får inte:

- skapa egna entryregler 
- flytta technical SL 
- kringgå news 
- kringgå Risk 
- kringgå Prop 
- exekvera själv 
## Atlas Market View

Strategin ska vara visuellt transparent.

Atlas Market View ska kunna visa:

- NQ/MNQ chart 
- selected 4H opens 
- 5m/15m liquidity 
- FVG 
- swing highs/lows 
- intermediate liquidity 
- manipulation 
- 1m structure 
- iFVG 
- CISD 
- SMT 
- proposed entry 
- SL 
- TP 
- R:R 
- grade 
- strategy state 
- Risk status 
- Prop status 
- proposal 
- position 
- BE state 
- final result 
UI:t ska visa strategy state.

Det ska inte skapa strategy state.

## Journal

Varje relevant setup ska kunna journalföras även om ingen trade tas.

Detta ska bland annat göra det möjligt att analysera:

- rejected setups 
- invalid setups 
- grades 
- attempts 
- liquidity types 
- SMT 
- execution 
- performance 
Strategispecifikationen kräver därför betydligt mer historik än en vanlig lista över closed trades. 

## Backtesting

Backtesting ska testa strategin exakt som definierad.

Vi får inte i efterhand förändra regler och fortfarande kalla resultatet:

Strategy v1.0

En materiell förändring kräver ny version.

## Strategy Versioning

Ändringar av exempelvis:

- entry 
- confirmation 
- SL 
- TP 
- grades 
- sessions 
- news policy 
- BE 
- re-entry 
- duration 
- filters 
ska versionshanteras.

## Candidate Strategy

Exempel:

Canonical:

v1.0

Atlas upptäcker senare att C-grade verkar svag.

Vi testar:

v1.1-candidate

som endast tillåter B eller högre.

Detta är en ny candidate.

Historiska v1.0-trades behåller sin ursprungliga classification.

## Performance per komponent

Systemet ska kunna mäta strategyresultat efter:

- A+ 
- A 
- B 
- C 
- session 
- long/short 
- SMT 
- confirmation type 
- target type 
- timeframe 
- market regime 
- attempt 
- fees/slippage 
På så sätt kan strategin utvecklas utifrån data istället för magkänsla.

## Rejected Trade Analytics

Även trades som inte genomförs ska kunna analyseras.

Exempel:

```
STRATEGY_PASS
RISK_DENY
```

eller:

```
STRATEGY_FAIL
RR_BELOW_2
```

Detta gör att Atlas senare kan göra counterfactual research utan att historiska beslut ändras.

## Strategy Baseline Safety Principle

Strategin bygger på fyra separata begrepp:

**Strategy Signal**

= observation att strategy conditions är uppfyllda.

## Trade Proposal

= strukturerad plan som kan presenteras.

## Risk/Prop Approval

= tillstånd från kontrollagren.

## Execution

= faktisk extern handling.

Dessa får aldrig behandlas som samma sak.

## Vad Canonical v1.0 låser

Canonical v1.0 låser bland annat:

- NQ/MNQ som primär validering 
- ES för SMT 
- selected 02:00 och 10:00 4H opens 
- London 02:00–05:00 
- New York 10:00–12:00 
- 5m/15m liquidity/FVG context 
- manipulation via liquidity sweep eller FVG touch 
- 1m confirmation 
- iFVG eller CISD minimum 
- SMT som extra confirmation 
- A+/A/B/C grades 
- direct confirmation-close entry 
- technical structure SL 
- första liquidity target ≥2R 
- minimum 2R 
- canonical BE trigger 
- inga partials 
- ingen continuous trailing 
- en position 
- max tre attempts efter losses 
- ingen re-entry efter winner/BE 
- news blackout T-1h → T+4h 
- existing position news exit T-15m 
- London position management 
- New York max fyra timmar 
Detta är Strategy v1.0.

## Vad som fortfarande måste bli machine-readable före implementation

Canonical Strategy Specification definierar uttryckligen att de exakta programmeringsdefinitionerna av:

- iFVG 
- CISD 
ska dokumenteras som separata deterministic detection rules innan Strategy Engine implementeras. 

Detta innebär inte att strategy direction eller tradingprincipen är olåst.

Det betyder att den tekniska detektorn måste definieras exakt nog för kod.

Vi ska inte fylla detta gap genom att låta Claude, Atlas eller utvecklaren improvisera under implementation.

## Samma Definition Everywhere

När detection specificationen väl är låst ska samma definition användas i:

**Historical Backtest**

= samma.

## Replay

= samma.

## Forward

= samma.

## Demo

= samma.

## Live

= samma.

Detta är nödvändigt för att Strategy v1.0 verkligen ska vara samma strategy i alla environments.

## Den fullständiga Strategy Flow

Canonical Strategy v1.0 kan sammanfattas som:

```
Selected 4H Open
↓
```

```
Identifiera 5–15m Liquidity / FVG
↓
```

```
Vänta på Manipulation
↓
```

```
Liquidity Sweep eller FVG Touch
↓
```

```
1m Entry Phase
↓
```

```
Optional 1m Liquidity
↓
```

```
iFVG / CISD
↓
```

```
SMT om tillgänglig
↓
```

```
Setup Grade
↓
```

```
Entry på Confirmation Close
↓
```

```
Technical SL bakom Manipulation Swing
↓
```

```
Första Liquidity Target ≥2R
↓
```

```
Strategy Signal
↓
```

```
Risk Engine
↓
```

```
Prop Firm Rules Engine
↓
```

```
Trade Proposal
↓
```

```
Approval / Automation
↓
```

```
Execution
↓
```

## Journal & Analytics

## Strategins filosofi i praktiken

Strategin försöker alltså inte förutsäga varje rörelse i Nasdaq.

Den väntar på en specifik process:

```
Context
→ Manipulation
→ Confirmation
→ Defined Risk
→ Defined Target
```

Om processen inte uppstår:

**NO TRADE**

Det är ett korrekt strategy outcome.

## Kapitelstatus

Kapitel: 3 – Strategispecifikation

Bok: Omnira Trading System – Från strategi till autonom exekvering

Strategi: Omnira Liquidity Manipulation – Canonical v1.0

Status: Bokbaseline dokumenterad

Primär marknad: NQ / MNQ

SMT comparison: ES

Timezone: America/New_York

London entry: 02:00–05:00

New York entry: 10:00–12:00

Selected 4H opens: 02:00 och 10:00

HTF context: 5m / 15m Liquidity och FVG

Manipulation: Liquidity sweep OR FVG touch

1m liquidity sweep: Preferred, inte obligatorisk

Mandatory confirmation: iFVG OR CISD

Grades: A+, A, B, C

Entry: Confirmation candle close

Technical SL: Bakom senaste giltiga manipulation swing

TP: Första giltiga liquidity target ≥2R

Minimum R:R: 2.0R

Partial profits: Nej

Trailing: Nej, utöver canonical BE

Break-even: När närmaste confirmed 1m swing efter entry tas, samt obligatoriskt vid London window-close 05:00

Max positioner: 1

Re-entry: Endast efter loss

Max attempts: 3 per 4H thesis

Re-entry efter winner/BE: Nej

```
News entry blackout: T-1h → T+4h
```

Existing position news exit: T-15m

London max duration: Ingen explicit 4h-limit

New York max duration: 4 timmar

iFVG/CISD programming definitions: Separat deterministic detection specification krävs före Strategy Engine implementation

Strategy Signal: Inte execution authority

Omnira Liquidity Manipulation v1.0 är därmed den definierade tradingbaseline som resten av Omnira Trading System ska implementera, testa, försöka motbevisa och – endast om evidensen håller – senare få rätt att exekvera.
