# Omnira Liquidity Manipulation

## Trading Strategy Specification – Canonical v1.0

Dokumentspråk: Svenska
Status: Canonical – strategispecifikation låst för implementation och validering
Primär marknad för validering: NQ / MNQ
Tradingstil: Scalping / Intraday
System: Omnira Trading System

## 1. Syfte

Detta dokument definierar den första formella tradingstrategin för Omnira Trading System.

Strategin ska kunna användas identiskt i:

- historisk backtesting
- market replay
- forward testing
- analysläge
- demo trading
- manual approval
- controlled live trading
- framtida autonom exekvering
Strategin får identifiera och föreslå trades.

Strategin får inte kringgå Risk Engine, Prop Firm Rules Engine eller exekveringsbehörigheter.

## 2. Strategins grundidé

Strategin söker efter en manipulation från en utvald ny 4H-candle mot tidigare identifierad liquidity eller Fair Value Gap på 5–15 min timeframe.

Efter manipulationen analyseras 1 min timeframe efter reversal-confirmation genom:

- iFVG
- CISD
- eller iFVG + CISD
SMT mellan NQ och ES används som ytterligare confirmation men är inte ett krav för trade.

Den grundläggande hypotesen är:

Efter att priset manipulerar mot identifierad 5–15m liquidity eller FVG och därefter producerar definierad reversal-confirmation på 1m kan en trade i motsatt riktning mot manipulationen ha positiv expectancy mot nästa giltiga liquidity target.

Detta är en hypotes som ska testas, inte ett antagande om garanterad edge.

## 3. Primär marknad

Första valideringen ska genomföras på:

- Nasdaq-100 futures, NQ
- Micro E-mini Nasdaq-100 futures, MNQ
Strategin är avsedd att senare kunna generaliseras till andra marknader.

Ingen annan marknad får betraktas som validerad innan den har genomgått separat backtesting och forward testing.

## 4. Timeframes

Strategin använder tre huvudsakliga analysnivåer.

**4.1 4H**

Används för den övergripande trading-idén och för att definiera relevanta liquidityområden från tidigare 4H-struktur.

Endast två utvalda 4H-opens används.

## 4.2 5–15 minuter

Används för:

- liquidity
- FVG
- manipulation
- marknadsstruktur
Både 5m och 15m får användas.

## 4.3 1 minut

Används för:

- entry
- liquidity confirmation
- iFVG
- CISD
- trade management
- break-even-struktur
## 5. Timezone

All strategi- och sessionslogik ska uttryckas i:

America/New_York

Systemet får inte använda en permanent UTC-4-offset.

Detta säkerställer att strategin följer New York local time även när daylight saving time ändras.

## 6. Trading windows

Endast två trading windows är tillåtna.

## 6.1 London

02:00–05:00 America/New_York

## 6.2 New York

10:00–12:00 America/New_York

Endast de två tillhörande 4H-opens används.

Alla andra 4H-opens ignoreras av denna strategiversion.

En ny position måste öppnas inom ett giltigt trading window.

## 7. Higher-Timeframe Context

Vid en giltig 4H-open ska Strategy Engine identifiera potentiella liquidity- och FVG-targets på 5–15m.

## 7.1 Long thesis

För en potentiell long ska det finnas:

- giltig 5–15m liquidity under aktuellt pris
- eller giltig 5–15m FVG under aktuellt pris
Systemet väntar sedan på manipulation nedåt till denna liquidity eller FVG.

## 7.2 Short thesis

För en potentiell short ska det finnas:

- giltig 5–15m liquidity över aktuellt pris
- eller giltig 5–15m FVG över aktuellt pris
Systemet väntar sedan på manipulation uppåt till denna liquidity eller FVG.

## 8. Giltig liquidity

Följande får användas som 5–15m liquidity:

- swing highs
- swing lows
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
## 9. Swing-definition

## 9.1 Swing high

En swing high existerar när den mittersta candle har:

- högre high än candle direkt före
- högre high än candle direkt efter
Konceptuellt:

High[i] > High[i-1] AND High[i] > High[i+1]

## 9.2 Swing low

En swing low existerar när den mittersta candle har:

- lägre low än candle direkt före
- lägre low än candle direkt efter
Konceptuellt:

Low[i] < Low[i-1] AND Low[i] < Low[i+1]

En swing är inte bekräftad förrän efterföljande candle finns tillgänglig.

## 10. Intermediate Liquidity

Intermediate liquidity definieras som interna swing highs och swing lows inom den aktuella marknadsstrukturen.

De behöver inte samtidigt vara:

- previous day high/low
- session high/low
- previous 4H high/low
## 11. Fair Value Gap

Strategin använder en standardiserad tre-candle FVG.

FVG-zonen är gapet mellan candle 1 och candle 3.

För en bullish FVG finns ett prisgap mellan relevant high från candle 1 och low från candle 3.

För bearish FVG används motsvarande inverterade struktur.

FVG får identifieras på:

- 5m
- 15m
## 12. Manipulation

Efter den relevanta 4H-open väntar systemet på manipulation mot tidigare identifierad liquidity eller FVG.

## 12.1 Liquidity manipulation

Manipulation mot liquidity är genomförd när priset har handlats över eller under den definierade liquidity-nivån.

## 12.2 FVG manipulation

Manipulation mot FVG är genomförd när priset har touchat den definierade 5–15m FVG-zonen.

Liquidity och FVG fungerar som alternativa manipulationstriggers.

Det krävs alltså inte att båda inträffar.

## 13. Övergång till 1m Entry Phase

När manipulationen är genomförd övergår setupen till 1m Entry Phase.

En 1m liquidity sweep är:

**Preferred, men inte obligatorisk.**

Entry kräver däremot minst en giltig:

- iFVG
- eller CISD
## 14. iFVG och CISD

iFVG och CISD är kärnconfirmation för entry.

Den exakta programmeringsdefinitionen av respektive pattern ska dokumenteras som separata deterministiska detection rules innan Strategy Engine implementeras.

Ingen AI-modell får själv tolka vad som "ser ut som" en iFVG eller CISD.

Samma definition ska användas i:

- backtest
- replay
- live analysis
- execution
**15. SMT**

SMT används mellan:

- NQ
- ES
SMT analyseras på:

- 1m
- 5m
- 15m
SMT föreligger när ett instrument tar relevant liquidity medan det andra inte gör det.

SMT är confirmation, inte ett obligatoriskt entrykrav.

SMT får endast höja setupens grade från A till A+.

SMT får inte ensam skapa en trade.

## 16. Setup Grades

Strategin använder följande grades:

**A+**

iFVG + CISD + SMT

**A**

iFVG + CISD

**B**

iFVG only

**C**

CISD only

Alla fyra grades är giltiga i nuvarande strategi.

Minimum grade ska vara en konfigurerbar parameter så att senare tester exempelvis kan jämföra:

- A+ only
- A+ och A
- A+ till B
- alla grades
Den canonical grundkonfiguration som motsvarar den nu definierade strategin accepterar A+, A, B och C.

## 17. Entry

När samtliga föregående krav är uppfyllda sker entry på 1m.

## 17.1 iFVG

Entry sker direkt på close av confirmation candle.

**17.2 CISD**

Entry sker direkt på close av confirmation candle.

Ingen obligatorisk retrace eller retest krävs efter confirmation.

## 18. Stop Loss

## Long

Stop loss placeras under manipulationens senaste giltiga swing low.

## Short

Stop loss placeras över manipulationens senaste giltiga swing high.

Stoppen definieras av marknadsstrukturen.

Stop loss får inte flyttas närmare entry enbart för att få positionen att passa riskbudgeten.

Om minsta möjliga position överskrider tillåten risk ska Risk Engine neka traden.

## 19. Take Profit

Take profit sätts mot nästa giltiga liquidity target som erbjuder minst:

2.0R

Liquidity targets som ligger närmare än 2R får inte användas som slutligt TP för denna strategiversion.

Om flera liquidity targets finns väljs:

första giltiga target som uppfyller minst 2R.

Senare targets prioriteras inte framför den första giltiga.

## 20. Minimum Risk/Reward

En trade måste vid entry erbjuda minst:

Risk/Reward = 1:2

Om inget giltigt liquidity target ger minst 2R är setupen ogiltig.

## 21. Break-Even

Strategin använder break-even.

## Long

När priset tar närmaste bekräftade 1m swing high efter entry flyttas stop loss till entry price.

## Short

När priset tar närmaste bekräftade 1m swing low efter entry flyttas stop loss till entry price.

Swing high/low använder samma bekräftade swing-definition som anges i avsnitt 9.

Efter att break-even-triggern har uppfyllts:

SL = entry price

## 21.1 Window-close break-even — London

Utöver den swing-baserade triggern ovan gäller för London-sessionen en obligatorisk
window-close break-even.

Om positionen fortfarande är öppen exakt när London entry-window stänger
05:00 America/New_York:

```
SL → entry price
```

Denna action inträffar **även om** den swing-baserade break-even-triggern ännu inte har
uppfyllts. Den ersätter inte swing-triggern — den är en andra, tidsbaserad trigger för
samma break-even-action.

Har swing-triggern redan flyttat SL till entry price är window-close-triggern en no-op.

Se avsnitt 31.

Efter break-even används ingen ytterligare trailing stop.

Denna regel är canonical för Strategy v1.0.

## 22. Partial Profit

Strategin använder inte partial profits.

Positionen ska inte reduceras stegvis på väg mot TP.

## 23. Trailing Stop

Ingen kontinuerlig trailing stop används.

Stop loss kan endast hanteras enligt break-even-regeln.

Efter att positionen har flyttats till break-even ska SL normalt ligga kvar där tills:

- TP
- BE
- news exit
- time exit
- annan explicit systemexit
## 24. Nästan träffat TP

Om priset nästan når TP men sedan vänder:

- ingen manuell vinst tas
- target ändras inte
- traden får fortsätta
Positionen går därefter mot:

- TP
- break-even
- eller annan explicit exitregel
## 25. Position Limit

Endast:

1 öppen position

är tillåten åt gången för strategin.

Ingen ny position får öppnas medan en annan strategy position är öppen.

## 26. Motsatt setup

Om en motsatt giltig setup uppstår medan en position redan är öppen:

den motsatta setupen ignoreras.

Systemet ska inte:

- hedga
- stänga befintlig position på grund av den nya signalen
- reversera automatiskt
- öppna motsatt position
## 27. Re-entry

Re-entry får endast ske efter en förlorande trade.

En ny entry får ske direkt när en ny fullständigt giltig setup uppstår.

Ingen obligatorisk cooldown krävs från strategin.

Max:

3 trade attempts per 4H thesis

Re-entry används inte efter:

- vinnande trade
- break-even trade
Risk Engine kan stoppa attempts tidigare om riskgränser nås.

## 28. Risk Baseline

Nuvarande manuella baseline:

Max risk per trade = $150

Max daily drawdown = $450

Max attempts per 4H thesis = 3

Dessa värden ska vara konfigurerbara riskparametrar och ska inte hårdkodas i Strategy Engine.

Risk Engine står över Strategy Engine.

En giltig strategi-signal är inte automatiskt en godkänd trade.

## 29. Minimum Contract Risk

Om minsta handlingsbara position innebär större faktisk risk än tillåten risk:

TRADE DENIED

Systemet får inte manipulera teknisk SL för att få riskberäkningen att passa.

## 30. News Policy

Strategin undviker high-impact USD-news.

## 30.1 New Entries

Inga nya entries tillåts från:

T - 1 timme

till:

T + 4 timmar

kring relevant high-impact USD-event.

Samma initiala blackout gäller för:

- FOMC
- CPI
- NFP
Blackout-värden ska vara konfigurerbara och versionsstyrda för framtida tester.

## 30.2 Existing Position

En redan öppen trade ska stängas:

T - 15 minuter

före relevant high-impact USD-news.

Detta gäller även:

- FOMC
- CPI
- NFP
Atlas får inte själv välja att hålla positionen genom ett relevant high-impact event.

Denna regel är canonical för Strategy v1.0.

## 31. London Session Trade Management

En trade måste öppnas inom:

02:00–05:00 America/New_York

Om positionen fortfarande är öppen exakt när entry-window stänger
05:00 America/New_York gäller obligatorisk window-close break-even:

```
SL → entry price
```

Denna action inträffar även om den swing-baserade break-even-triggern i avsnitt 21 ännu
inte har uppfyllts.

Efter denna action:

```
SL = entry price
```

Positionen får därefter fortsätta.

London-trades har ingen explicit fyratimmarsgräns.

De fortsätter tills en annan explicit canonical exitregel inträffar, exempelvis:

- TP
- BE
- relevant news exit
- emergency- eller safety-exit
- annan explicit canonical exitregel

Window-close break-even är deterministisk och tidsstyrd. Den är inte discretionary och får
inte hoppas över av AI, UI eller operatör.

## 32. New York Session Trade Management

En trade måste öppnas inom:

10:00–12:00 America/New_York

En redan öppnad position får fortsätta efter 12:00.

För New York-trades gäller:

Max trade duration = 4 timmar från entry

förutsatt att high-impact news inte framtvingar tidigare exit.

## 33. Strategy Invalidation Before Entry

Setupen är ogiltig om något av följande gäller:

- entry sker utanför giltigt trading window
- minimum confirmation saknas
- R:R är under 2.0
- relevant news blackout är aktiv
- annan position redan är öppen
- max attempts för aktuell 4H thesis är nådd
Utöver detta kan Risk Engine eller Prop Firm Rules Engine neka en i övrigt giltig setup.

## 34. Strategy State Machine

Strategin ska kunna representeras deterministiskt som:

```
WAIT_FOR_4H_OPEN
↓
IDENTIFY_5_15M_TARGETS
↓
WAIT_FOR_MANIPULATION
↓
MANIPULATION_CONFIRMED
↓
ENTER_1M_CONFIRMATION_PHASE
↓
WAIT_FOR_IFVG_OR_CISD
↓
EVALUATE_SMT
↓
GRADE_SETUP
↓
CALCULATE_ENTRY
↓
CALCULATE_TECHNICAL_SL
↓
FIND_FIRST_VALID_TARGET_GE_2R
↓
STRATEGY_VALIDATION
↓
STRATEGY_SIGNAL
```

Strategy Engine avslutar sin auktoritet vid Strategy Signal.

## 35. Separation of Authority

Efter Strategy Signal ska följande ordning användas:

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

Execution Provider Adapter

```
↓
```

Futures Execution Provider

Strategy Engine får inte skicka en order direkt.

AI Analysis får inte kringgå Risk Engine.

Risk Engine har veto.

Prop Firm Rules Engine har veto.

Okänd eller misslyckad riskutvärdering ska fail closed.

## 36. AI:s roll

AI ska vara rådgivande.

AI får:

- förklara setupen
- sammanfatta marknadsstrukturen
- beskriva identifierad manipulation
- presentera confirmation
- visa setup grade
- identifiera osäkerhet
- jämföra setup med historiska resultat
- hjälpa till att klassificera market regime
- presentera trade proposal
AI får inte:

- skapa egna riskgränser
- flytta teknisk stop loss för att öka position size
- kringgå news-regler
- kringgå daily drawdown
- kringgå prop firm-regler
- exekvera utan korrekt behörighet
## 37. Atlas Market View

Omnira Trading ska innehålla en TradingView-liknande marknadsvy som visar vad Atlas och Strategy Engine ser.

Vyn ska kunna visualisera:

- aktuell NQ/MNQ-chart
- relevanta 4H-opens
- 5–15m liquidity
- FVG-zoner
- swing highs/lows
- intermediate liquidity
- manipulation
- 1m liquidity
- iFVG
- CISD
- SMT
- planerad entry
- stop loss
- take profit
- R:R
- setup grade
- strategy state
- riskstatus
- prop firm-status
- trade proposal
- denial reasons
- öppen position
- break-even-status
- trade-resultat
UI:t är endast en visualisering av systemets beslut.

Tradinglogik får inte ligga i chart-komponenten.

## 38. Journaling Requirements

Varje identifierad setup ska kunna journalföras oavsett om traden tas eller nekas.

Minst följande ska sparas:

- strategy ID
- strategy version
- instrument
- contract
- direction
- session
- 4H thesis
- timeframe
- identifierad liquidity
- identifierad FVG
- manipulation
- 1m liquidity event
- iFVG
- CISD
- SMT
- setup grade
- entry
- SL
- TP
- initial R:R
- position size
- risk i pengar
- risk i procent
- attempt number
- Strategy Engine result
- Risk Engine result
- Prop Firm Engine result
- denial reason
- timestamps
- news state
- market regime när tillgängligt
- fill price
- spread
- fees
- slippage
- MFE
- MAE
- break-even trigger type (SWING | WINDOW_CLOSE)
- exit
- exit reason
- slutligt R-resultat
- chart snapshot eller rekonstruerbar chart-data
Även nekade setups ska sparas när det är tekniskt rimligt.

## 39. Backtesting Principle

Backtesting ska testa strategin som definierad.

Systemet får inte retroaktivt förändra regler för att förbättra historisk performance utan att skapa en ny strategy version.

Exempel:

Omnira Liquidity Manipulation v1.0

och:

Omnira Liquidity Manipulation v1.1

ska kunna jämföras separat.

## 40. Performance Metrics

Strategin ska senare utvärderas med minst:

- antal setups
- antal trades
- win rate
- loss rate
- break-even rate
- expectancy
- average R
- median R
- profit factor
- max drawdown
- losing streak
- MFE
- MAE
- performance per session
- performance per setup grade
- performance med/utan SMT
- performance per entry confirmation
- performance per target type
- performance per timeframe
- performance per market regime
- performance före/efter fees och slippage
Sharpe och Sortino kan användas när datamängd och avkastningsserie gör dem relevanta.

## 41. Strategy Grade Analytics

Systemet ska separat kunna mäta:

- A+
- A
- B
- C
Detta gör det möjligt att senare avgöra om exempelvis:

CISD only

har positiv eller negativ expectancy utan att ändra historiska resultat.

Setup grade ska därför alltid lagras som data även om systemets minimum grade senare ändras.

## 42. Rejected Trade Analytics

Systemet ska även kunna analysera setups som inte exekverades.

Exempel:

```
STRATEGY_PASS
RISK_DENY
reason = daily_loss_limit
```

eller:

```
STRATEGY_FAIL
reason = RR_BELOW_2
```

Detta gör det möjligt att i efterhand utvärdera alternativa regler utan att blanda ihop dem med faktisk live-performance.

## 43. Baseline Safety Principle

En strategi-signal är en observation.

En trade proposal är en rekommendation.

Ett riskgodkännande är ett tillstånd.

En execution är en separat extern handling.

Dessa fyra steg får aldrig behandlas som samma sak.

## 44. Versioning

Varje materiell ändring av:

- entry
- confirmation
- SL
- TP
- setup grades
- sessions
- news-regler
- break-even
- re-entry
- trade duration
- strategy filters
ska skapa en ny versionsidentifierare.

Gamla resultat får aldrig automatiskt räknas som resultat för den nya versionen.

## 45. Canonical Status

De två implementationdetaljer som var öppna i v1.0-RC1 är nu låsta, och en ytterligare
tvetydighet som upptäcktes vid canonical documentation review 2026-08-27 är nu explicit
stängd (CLOSED-03).

## CLOSED-01 — Break-even trigger

Long:

närmaste bekräftade 1m swing high efter entry

Short:

närmaste bekräftade 1m swing low efter entry

När nivån tas:

```
SL → entry price
```

## CLOSED-02 — Existing trade news exit

En befintlig position stängs:

T - 15 minuter

före relevant high-impact USD-news.

## CLOSED-03 — London window-close break-even

Upptäckt vid canonical documentation review 2026-08-27. Den tidigare formuleringen
"positionen skyddas genom break-even-regeln" tillät två olika implementationer.

Canonical betydelse:

```
London-position fortfarande öppen 05:00 America/New_York
→ SL = entry price
```

Detta gäller även om den swing-baserade triggern i avsnitt 21 ännu inte har inträffat.
Positionen får därefter fortsätta. Ingen fyratimmarsgräns tillkommer för London.

Detta är inte en ny regel. Det är den explicita maskinläsbara tolkningen av det redan
tidigare fattade beslutet att en trade som fortsätter efter trading window ska skyddas
med stop loss på break-even.

Se avsnitt 21.1 och 31.

Det finns därmed inga kvarvarande öppna strategiimplementationer som blockerar canonical status.

## 46. Canonical Strategy Flow

Den slutliga strategiordningen är:

```
Selected 4H Open
→ Identifiera 5–15m Liquidity / FVG
→ Vänta på manipulation
→ Liquidity sweep eller FVG touch
→ 1m Entry Phase
→ Optional 1m liquidity
→ iFVG / CISD
→ SMT confirmation om tillgänglig
→ Setup Grade
→ Entry på confirmation close
→ SL bakom manipulation swing
→ Första liquidity target ≥2R
→ Strategy Signal
→ Risk Engine
→ Prop Firm Rules
→ Trade Proposal
→ Approval / Automation
→ Execution
→ Journal & Analytics
```

## Dokumentstatus

Dokument: Omnira Liquidity Manipulation – Trading Strategy Specification

Version: Canonical v1.0

Revision: 2026-08-27 — CLOSED-03 (London window-close break-even). Explicit
disambiguering av redan fattat beslut. Ingen versionsbump enligt avsnitt 44, eftersom
ingen materiell regel har ändrats — endast en tvetydig formulering har gjorts entydig.

Revision: 2026-08-28 — endast avsnitt 35:s referens till den externa execution-noden
uppdaterad från MetaTrader 5 till Execution Provider Adapter / Futures Execution
Provider, efter Beslut D. **Ingen strategiregel är ändrad.** Entry, SL, TP, break-even,
grades, sessioner, re-entry, news-regler och R:R är oförändrade. Ingen versionsbump
enligt avsnitt 44 — strategin förblir Canonical v1.0.

Strategisk status: Låst baseline för implementation och validering

Kodstatus: Ej implementerad

Backtest-status: Ej validerad

Forward-test-status: Ej validerad

Live-status: Ej godkänd

Autonom trading: Förbjuden tills senare dokumenterade gates är uppfyllda

Canonical v1.0 innebär att strategins regler nu är tillräckligt definierade för att implementeras och testas konsekvent.

Canonical v1.0 innebär inte att strategin har bevisad positiv expectancy.

Strategins edge ska bevisas eller förkastas genom data.
