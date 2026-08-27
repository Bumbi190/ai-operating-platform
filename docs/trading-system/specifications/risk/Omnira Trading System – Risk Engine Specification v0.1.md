> # ⚠ HISTORISKT DOKUMENT
>
> Detta är **v0.1**. Det är inte aktiv source of truth.
>
> Aktiv version:
> `specifications/risk/Omnira Trading System – Risk Engine Specification – Canonical v1.0.md`
>
> De åtta `OPEN-RISK`-punkterna i §84 nedan är **samtliga stängda** i Canonical v1.0.
> De står kvar här som revisionsspår, inte som öppna frågor.
>
> §51 (öppen position vid daily breach) är **ersatt**: den interna dagsregeln
> tvångsstänger inte en öppen position. Se Canonical v1.0 avsnitt 3.7 och 4.
>
> Allt i v0.1 som Canonical v1.0 inte uttryckligen ändrar gäller fortfarande normativt.

---

# Omnira Trading System

## Risk Engine Specification v0.1

Dokumentspråk: Svenska
Status: Fas 0 – Riskmodell för granskning
System: Omnira Trading System
Primär strategi: Omnira Liquidity Manipulation – Canonical v1.0
Riskprincip: Risk Engine har absolut veto över trading

## 1. Syfte

Detta dokument definierar Risk Engine för Omnira Trading System.

Risk Engine ska skydda:

- tradingkapital
- konto
- daily risk budget
- drawdown
- execution safety
- systemintegritet
- framtida prop firm-konton
Risk Engine ska vara oberoende av AI och Strategy Engine.

En perfekt strategi-signal får stoppas av Risk Engine.

Ett Risk DENY får aldrig överstyras av AI-confidence, setup grade eller användarvänlig UI-logik.

## 2. Canonical Risk Principle

Den centrala riskprincipen är:

Risk Engine står över Strategy Engine och AI.

Systemets beslutskedja är:

Strategy Signal

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

Risk Engine har veto.

## 3. Determinism

Risk Engine ska vara deterministisk.

Samma:

- account state
- market state
- strategy signal
- risk profile
- timestamp
- configuration
ska producera samma riskbeslut.

AI får inte användas för att avgöra hard risk limits.

## 4. Fail Closed

Om Risk Engine saknar tillräcklig information ska resultatet vara:

```
DENY
```

inte:

```
ALLOW
```

Exempel:

- stale account data
- saknad equity
- okänd position
- okänd instrumentmetadata
- saknad tick value
- osäker daily-loss state
- Risk Engine unavailable
- corrupted configuration
- okänd news state där newsregel krävs
Osäkerhet får aldrig tolkas som riskfrihet.

## 5. Risk Engine Outputs

Initialt ska Risk Engine stödja:

**ALLOW**

Trade får fortsätta till nästa kontrollager.

**DENY**

Trade stoppas.

## Framtida: ALLOW_REDUCED_SIZE

Kan införas senare där position size kan reduceras utan att teknisk stop loss ändras.

Detta resultat är inte nödvändigt för första MVP.

## 6. Reason Codes

Alla beslut ska innehålla machine-readable reason codes.

Exempel:

```
RISK_ALLOWED
MAX_RISK_PER_TRADE_EXCEEDED
DAILY_LOSS_LIMIT
MAX_POSITION_LIMIT
MINIMUM_CONTRACT_TOO_LARGE
MAX_ATTEMPTS_REACHED
SPREAD_TOO_HIGH
STALE_ACCOUNT_DATA
STALE_MARKET_DATA
UNKNOWN_POSITION
KILL_SWITCH_ACTIVE
NEWS_BLOCK
SESSION_BLOCK
INVALID_INSTRUMENT_STATE
EXECUTION_HEALTH_FAILURE
```

Reason codes ska vara stabila och versionsstyrda.

## 7. Risk Profile

Riskgränser ska ligga i ett RiskProfile.

RiskProfile ska minst definiera:

- profile ID
- version
- account scope
- environment
- max risk per trade
- daily loss limit
- total drawdown limit
- max open positions
- max trades eller attempts
- instrument exposure limits
- correlation limits
- spread limits
- news policy
- session policy
- cooldown policy
- kill-switch policy
Riskregler ska inte hårdkodas i Strategy Engine.

## 8. Initial Risk Baseline

För den första manuella strategibaslinjen gäller:

Max risk per trade = $150

Max daily drawdown = $450

Max attempts per 4H thesis = 3

Max open positions = 1

Dessa värden ska vara konfigurerbara.

De representerar initial baseline och inte en universell riskmodell för alla framtida konton.

## 9. Separation mellan Strategy Risk och Account Risk

Strategin definierar:

- teknisk entry
- teknisk stop loss
- target
- minimum R:R
- setup validity
Risk Engine definierar:

- om kontot har råd att ta traden
- hur stor position som är tillåten
- om dagens riskbudget är förbrukad
- om annan exposure blockerar traden
- om executionförhållanden är acceptabla
Strategy Engine får aldrig flytta SL för att få en trade genom Risk Engine.

## 10. Position Sizing

Risk Engine ska beräkna maximal tillåten quantity utifrån:

- entry price
- technical stop loss
- stop distance
- instrument tick size
- tick value
- contract specification
- account risk budget
- minimum quantity
- quantity step
Konceptuellt:

```
risk_per_unit = stop_distance × instrument_value
```

och:

```
max_quantity = allowed_risk / risk_per_unit
```

Den faktiska positionen ska alltid avrundas nedåt till en giltig handlingsbar quantity.

Risk får inte avrundas uppåt.

## 11. Technical Stop Integrity

Stop loss kommer från Strategy Engine.

Risk Engine får:

- acceptera stoppen
- neka traden
Risk Engine får inte:

- flytta SL närmare entry
- skapa en artificiell SL
- minska stop distance för att få större position
- ignorera stop distance
Om technical SL leder till för hög risk med minsta handlingsbara position:

```
DENY
```

## 12. Minimum Tradable Quantity

Om:

```
minimum_quantity × risk_per_unit > max_risk_per_trade
```

ska traden nekas.

Exempelprincip:

minimum contract risk = $172

allowed risk = $150

Resultat:

```
DENY
```

Systemet får inte ta traden med $172 risk bara för att skillnaden är liten.

## 13. Max Risk per Trade

Initial canonical baseline för strategins riskprofil:

$150

Riskberäkningen ska baseras på faktisk initial risk från:

- entry
- initial SL
- quantity
- instrument specification
Beräknad risk ska inkludera lämplig säkerhetsmarginal där kostnader eller execution deviation kan öka faktisk risk.

Exakt marginalmodell låses senare under execution calibration.

## 14. Risk i procent

Systemet ska även beräkna:

```
risk_percentage
```

även när riskregeln primärt anges i dollar.

Det möjliggör jämförelse mellan olika account sizes.

Exempel:

```
risk_amount = $150
equity = $50,000
risk_percentage = 0.30%
```

Dollarvärde och procent ska journalföras separat.

## 15. Daily Loss Limit

Initial baseline:

$450

När daily risk limit är nådd får inga nya trades öppnas.

Risk Engine ska exponera:

- daily_loss_used
- daily_loss_remaining
- daily_limit
- daily_state
Exempel:

```
daily_limit = $450
daily_loss_used = $300
daily_loss_remaining = $150
```

## 16. Daily Loss – kritisk definition

Det återstår i Fas 0 att låsa exakt intern beräkningsmetod för daily loss.

Möjliga komponenter är:

- realized P/L
- unrealized P/L
- commissions
- fees
- swaps där relevant
Den interna Omnira-riskmodellen och en prop firms daily-loss-modell får inte antas vara samma sak.

Därför ska beräkningsmetod vara explicit och versionsstyrd.

## OPEN-RISK-01: Internal Daily Loss Calculation Method

## 17. Daily Reset

Riskprofilen ska definiera:

- vilken timezone som används
- när tradingdagen börjar
- när daily risk reset sker
- vilken balance/equity baseline som används
Detta får inte implicit antas från serverns lokala klocka.

## OPEN-RISK-02: Internal Daily Risk Reset Policy

## 18. Reserved Risk

När en position är öppen ska dess återstående möjliga förlust räknas som reserverad risk.

Systemet ska inte behandla hela daily risk budget som fri bara för att förlusten ännu inte realiserats.

Exempel:

daily loss used = $150

open position risk = $150

daily limit = $450

Available risk får inte behandlas som $300 utan hänsyn till öppen position.

## 19. Break-Even Risk

När SL verifierat har flyttats till break-even ska initial risk inte längre betraktas som full aktiv downside-risk.

Risk Engine ska dock beakta:

- commissions
- slippage
- gap risk
- broker execution
Därför kan praktisk remaining risk vara större än exakt $0.

Risk accounting och performance accounting ska hållas separata.

## 20. Max Open Positions

Initial regel:

```
max_open_positions = 1
```

Risk Engine ska verifiera både:

- Omniras expected position state
- faktisk broker/MT5 position state
Om någon position redan är öppen:

```
DENY
```

för ny strategy execution.

## 21. Unknown Positions

Om broker/MT5 rapporterar en position som Omnira inte känner igen:

```
UNKNOWN_POSITION
```

Trading på kontot ska pausas.

Ny execution får inte ske innan reconciliation är klar.

## 22. Manual External Positions

Manuella positioner ska räknas i account risk även om de inte skapades av Omnira.

Om strategin tillåter en position men ett manuellt innehav redan existerar kan Risk Engine neka trading.

Risk Engine skyddar kontot, inte bara Omniras egna trades.

## 23. Max Attempts per Thesis

För Omnira Liquidity Manipulation v1.0 gäller:

max_attempts_per_4H_thesis = 3

Attempts räknas endast enligt strategy-specifikationens regler.

Efter en förlust kan ett nytt attempt tillåtas.

Efter winner eller break-even avslutas re-entry för den aktuella thesisen enligt strategy-regeln.

Risk Engine verifierar attempt count innan ny execution.

## 24. Daily Loss vs Attempts

Max tre attempts innebär inte att tre trades alltid får tas.

Risk Engine ska kontrollera riskbudgeten före varje attempt.

Exempel:

Attempt 1:

-$150

Attempt 2:

-$150

Daily used:

$300

Attempt 3 signal risk:

$175

Daily remaining:

$150

Resultat:

```
DENY
```

även om attempt count fortfarande är under 3.

## 25. Max Trades per Day

Risk Engine ska stödja separat:

```
max_trades_per_day
```

även om första strategin primärt använder max attempts per thesis.

Detta behövs för framtida:

- flera sessions
- flera instrument
- flera strategier
Initialt behöver inget extra värde låsas om strategins övriga begränsningar redan styr volymen.

## OPEN-RISK-03: Optional Max Trades Per Day

## 26. Total Drawdown

Risk Engine ska stödja:

```
max_total_drawdown
```

separat från daily loss.

Total drawdown kan beräknas mot exempelvis:

- initial balance
- high-water mark
- static threshold
- trailing threshold
Metoden ska uttryckligen definieras av RiskProfile.

Ingen generell total drawdown-gräns är ännu låst för det första personliga/demo-kontot.

## OPEN-RISK-04: Internal Maximum Total Drawdown

## 27. Prop Firm Drawdown Separation

Prop Firm Rules Engine kan ha en helt annan drawdownmodell.

Exempel:

- static
- trailing
- end-of-day trailing
- balance based
- equity based
Risk Engine ska inte försöka ersätta Prop Firm Engine.

Båda måste passera.

## 28. Risk Headroom

Omnira UI ska kunna visa risk headroom.

Exempel:

Per-trade remaining: $150

Daily remaining: $300

Total DD remaining: $1,800

Positions: 0 / 1

Attempts: 1 / 3

Detta ska baseras på Risk Engines data.

## 29. Spread Filter

Risk Engine ska stödja en maximal spreadregel.

En trade ska kunna nekas om:

```
current_spread > allowed_spread
```

Spreadtröskeln ska vara:

- instrumentspecifik
- konfigurerbar
- mätbar
- versionsstyrd
Ingen slutlig MNQ/NQ-tröskel är ännu låst.

## OPEN-RISK-05: Spread Threshold

## 30. Slippage Guard

Risk Engine/Execution Gateway ska stödja maximal acceptabel execution deviation.

Om marknaden flyttar sig så mycket mellan signal och execution att:

- risk ökar över limit
- R:R faller under strategi-minimum
- entry blir ogiltig
ska execution stoppas.

Systemet får inte tänka:

Proposal var godkänd för fem sekunder sedan, så vi kör ändå.

## 31. Revalidation at Execution

Alla hard risk-regler ska utvärderas igen precis före order submission.

Risk PASS från proposal creation är inte permanent.

Följande kan ha ändrats:

- equity
- daily P/L
- spread
- price
- quantity risk
- open positions
- news state
- kill switch
- account health
Execution kräver färskt Risk PASS.

## 32. Proposal Expiry

Trade Proposal ska ha expiry.

Efter expiry krävs ny strategi- och riskutvärdering.

En gammal approval får inte användas för att exekvera en trade mot en marknad som redan förändrats.

## 33. Session Filter

Risk Engine ska kunna verifiera att entry sker inom tillåten session.

För Strategy v1.0:

- London: 02:00–05:00 America/New_York
- New York: 10:00–12:00 America/New_York
Strategy Engine har redan sessionsregeln.

Risk Engine kan ändå använda den som defense-in-depth inför execution.

## 34. News Filter

News blackout är en strategy-/riskkritisk regel.

För Strategy v1.0 gäller:

No new entry: T-1h till T+4h

Relevant öppen position:

Close at T-15m

Risk Engine ska kunna neka ny trade om canonical NewsEvent-state säger att blackout är aktiv.

News-data måste vara färsk och verifierad.

## 35. News Data Failure

Om strategin kräver news-filter men ekonomisk kalender är:

- unavailable
- stale
- malformed
- tidsmässigt osäker
ska resultatet i execution-enabled modes vara:

```
DENY
```

Analysis mode kan fortsätta med tydlig varning:

```
NEWS_STATE_UNKNOWN
```

## 36. Cooldown Support

Risk Engine ska stödja cooldown-regler.

Exempel:

- efter X förluster
- efter viss drawdown
- efter execution error
- efter abnormal slippage
- efter broker reconnect
Strategy v1.0 kräver inte normal cooldown mellan giltiga re-entrys efter förlust.

Risk Engine kan ändå framtvinga safety cooldown vid system- eller riskincident.

## 37. Consecutive Loss Protection

Risk Engine ska kunna mäta:

```
consecutive_losses
```

Det ska vara möjligt att senare aktivera regler som:

- reducerad risk efter X losses
- trading pause efter X losses
- human review required
Ingen sådan extra regel är ännu canonical.

## OPEN-RISK-06: Losing-Streak Protection

## 38. Exposure Limits

Risk Engine ska stödja:

- per-instrument exposure
- gross exposure
- net exposure
- asset-class exposure
För första strategin är detta enkelt eftersom:

```
max_open_positions = 1
```

Men modellen ska fungera när fler instrument eller strategier introduceras.

## 39. Correlation Risk

När flera instrument senare tillåts ska systemet kunna behandla högkorrelerade positioner som gemensam risk.

Exempel:

NQ long + ES long kan ekonomiskt vara betydligt närmare en större gemensam equity exposure än två helt oberoende trades.

Correlation risk ska därför finnas i arkitekturen även om den inte är aktiv i första enpositions-MVP:n.

## 40. Strategy-Level Risk Budget

Risk Engine ska kunna sätta separata riskbudgetar per strategy version.

Det gör det möjligt att senare köra:

- Strategy A
- Strategy B
utan att båda automatiskt får använda hela kontots riskbudget.

## 41. Instrument-Level Risk Budget

Systemet ska kunna begränsa risk per instrument.

Exempel:

NQ/MNQ risk budget

kan skilja sig från en framtida:

XAUUSD risk budget

Ingen global regel ska anta att alla instrument har samma tick size, volatility eller contract mechanics.

## 42. Environment Risk Profiles

Riskprofiler ska skilja mellan:

- development
- backtest
- demo
- live
Demo får inte automatiskt ärva live-autonomi.

Live ska kunna ha hårdare gränser än demo.

## 43. Controlled Live Risk

När systemet i framtiden når Controlled Live ska risk kunna reduceras separat från strategins testbaseline.

Exempel:

En strategi kan ha testats med viss nominal risk men live starta med betydligt lägre kapitalrisk.

Ingen automatisk uppskalning får ske bara för att kortsiktig performance är positiv.

## 44. Risk Scaling

Framtida uppskalning ska kräva en explicit RiskProfile-version.

Risk får aldrig ändras dynamiskt av AI baserat på:

- “confidence”
- winning streak
- känsla av stark setup
- förväntad news reaction
Eventuell risk scaling ska vara deterministisk, versionsstyrd och governance-godkänd.

## 45. No Martingale

Risk Engine ska inte stödja automatisk höjning av risk efter förlust som default.

Ingen martingale-logik får introduceras implicit genom re-entry.

Varje nytt attempt ska respektera den aktuella riskprofilens max risk.

## 46. No Revenge Logic

En tidigare förlust får aldrig höja tillåten risk på nästa trade.

Re-entry betyder:

ny giltig strategi-signal under samma thesis

inte:

försök vinna tillbaka förlusten.

## 47. Positive P/L Does Not Expand Hard Limits

Vinst tidigare under dagen ska inte automatiskt öka max risk per trade om RiskProfile inte uttryckligen säger det.

Exempel:

Daily realized P/L = +$600

ska inte automatiskt göra:

max risk per trade = $300

om baseline fortfarande är $150.

## 48. Kill Switch Architecture

Risk Engine ska respektera minst följande kill switches:

- global
- account
- strategy
- instrument
- runner
Aktiv relevant kill switch ger:

```
DENY
```

utan vidare trade evaluation.

## 49. Automatic Kill Conditions

Systemet ska kunna aktivera eller rekommendera kill switch vid exempelvis:

- daily loss limit hit
- total drawdown limit hit
- unknown position
- reconciliation failure
- repeated execution errors
- abnormal broker state
- stale market data
- stale account data
- monitoring outage
- severe clock drift
- corrupted risk configuration
Vilka conditions som automatiskt aktiverar permanent respektive temporär switch ska versionsstyras.

## 50. Daily Stop Behaviour

När daily loss limit är nådd ska:

- alla nya trade proposals nekas
- aktuell riskstatus visas som blocked
- Atlas tydligt förklara varför
- runner inte acceptera nya execution intents
En daily stop ska inte kunna “resetas” manuellt genom att bara refresha UI.

## 51. Open Position at Daily Limit

Om daily-lossgränsen nås på grund av en redan öppen position måste systemet ha en explicit policy för om positionen:

- fortsätter enligt strategy management
- eller tvångsstängs
Detta är inte ännu definierat i strategikällmaterialet.

## OPEN-RISK-07: Open Position Behaviour at Daily Loss Breach

Tills detta låses får systemet inte anta en exitregel.

## 52. Account Health Gate

Risk Engine ska kräva färsk account state.

Minst:

- balance
- equity
- realized P/L
- unrealized P/L
- open positions
- account trading status
- last sync timestamp
Account state ska ha explicit freshness threshold.

## 53. Market Data Health Gate

Risk evaluation ska kräva färsk relevant market data.

Data ska kontrolleras för:

- freshness
- ordering
- completeness
- correct instrument
- correct timeframe
- timestamp consistency
Fel:

```
DATA_QUALITY_DENY
```

## 54. Clock Health

Trading-systemets klocka är säkerhetskritisk.

Systemet ska kontrollera runner/server clock drift.

Större drift än tillåten threshold ska blockera execution eftersom den kan påverka:

- sessions
- news blackout
- proposal expiry
- daily reset
- broker reconciliation
## 55. Execution Health Gate

Trading kräver en healthy Execution Runner.

Minst:

- runner online
- MT5 connected
- broker connected
- correct account
- reconciliation complete
- execution mode correct
- no critical runner error
Annars:

```
DENY
```

## 56. Broker Tradeability Gate

Före execution ska systemet verifiera att instrumentet faktiskt är tradeable.

Exempel:

- market open
- symbol enabled
- trading permission active
- sufficient margin
- valid quantity
- valid price increment
Broker rejection ska inte betraktas som normal strategi-förlust.

## 57. Margin Protection

Risk Engine ska kontrollera att ordern inte skapar oacceptabel margin utilization.

Systemet ska stödja:

- minimum free margin
- maximum margin utilization
Initial threshold är ännu inte låst.

## OPEN-RISK-08: Margin Limits

## 58. Execution Cost Awareness

Riskbedömningen ska kunna inkludera:

- spread
- commissions
- expected slippage
- fees
Risk före costs och risk efter estimated costs ska kunna visas separat.

Detta är särskilt viktigt vid små stop distances.

## 59. Risk Decision Object

Varje evaluation ska skapa ett immutabelt RiskDecision.

Minst:

- risk_decision_id
- signal_id
- account_id
- risk_profile_id
- risk_profile_version
- evaluated_at
- result
- proposed_quantity
- stop_distance
- risk_amount
- risk_percentage
- daily_loss_used
- daily_loss_remaining
- total_drawdown_remaining
- open_position_count
- attempt_count
- failed_rules
- warnings
- reason_codes
- input_state_reference
## 60. Rule-by-Rule Evaluation

Alla hard rules ska kunna visas separat.

Exempel:

```
max_risk_per_trade → PASS
daily_loss → PASS
max_positions → PASS
attempt_limit → PASS
spread → FAIL
```

Resultat:

```
DENY
```

Det gör riskbeslutet förklarbart i Atlas Market View.

## 61. Risk Warning vs Risk Failure

Risk Engine får skilja:

```
WARNING
```

från:

```
FAIL
```

Warning blockerar inte automatiskt trade.

Fail gör det.

Exempel på framtida warning:

daily risk 80% consumed

Hard failure:

daily loss limit reached

Warnings får aldrig användas för att mjuka upp hard limits.

## 62. Risk Engine and Atlas

Atlas får läsa och förklara RiskDecision.

Atlas får exempelvis säga:

Setup A har passerat strategin men nekas eftersom endast $92 av dagens riskbudget återstår och minsta MNQ-position med teknisk SL kräver $128 risk.

Atlas får inte ändra resultatet.

## 63. Atlas Market View

Risk ska visualiseras direkt i Trading UI.

Minst:

- risk amount
- risk %
- position size
- daily loss used
- daily loss remaining
- drawdown headroom
- positions used / allowed
- attempts used / allowed
- spread state
- news state
- kill switch
- Risk Engine result
Trade proposal ska tydligt visa:

STRATEGY: PASS

men exempelvis:

RISK: DENY

som två separata states.

## 64. Risk Timeline

Journalen ska kunna visa risk state över tradens livscykel:

Signal

```
→ Initial Risk Evaluation
→ Approval
→ Pre-Execution Revalidation
→ Position Open
→ Break-Even
→ Exit
```

Det ska gå att se hur risk förändrades.

## 65. Backtest Risk Engine

Backtesting ska använda samma riskregler där det är relevant.

Backtest får inte anta obegränsat kapital eller ta trades som Risk Engine skulle nekat live om målet är realistisk systemsimulering.

Systemet ska kunna jämföra:

- strategy-only performance
- strategy + risk-engine performance
## 66. Risk Simulation

Backtest ska kunna simulera:

- position sizing
- daily stop
- losing streak
- drawdown
- commissions
- spread
- slippage
Det gör det möjligt att mäta vad Risk Engine faktiskt gör med strategy expectancy och drawdown.

## 67. Counterfactual Risk Analysis

Nekade trades ska kunna analyseras i efterhand.

Exempel:

Hur hade performance sett ut utan daily stop?

Vad händer vid $100 jämfört med $150 risk?

Vad händer med 2 istället för 3 attempts?

Resultaten får inte ändra historiska live-beslut.

## 68. Risk Profile Versioning

Varje materiell riskändring ska skapa ny RiskProfile-version.

Exempel:

Risk Profile v1.0

Risk Profile v1.1

Ändringar som kräver versionering inkluderar:

- risk/trade
- daily loss
- total drawdown
- position limits
- spread threshold
- cooldown
- correlation
- margin rule
- kill conditions
## 69. No Silent Risk Changes

Atlas, Claude eller annan agent får inte ändra riskprofil i bakgrunden.

Varje riskändring ska vara:

- explicit
- versionsstyrd
- auditerbar
- kopplad till authority/approval
## 70. Human Override

För hard risk DENY gäller:

**ingen normal human override för att tvinga igenom traden.**

Om användaren vill förändra en riskregel ska RiskProfile ändras genom korrekt governance.

Det är säkrare än en knapp:

Trade anyway

som i praktiken skulle göra Risk Engine frivillig.

## 71. Emergency Position Control

Kill switch för nya trades och emergency management av befintliga positioner är två olika funktioner.

Global execution stop ska som minimum stoppa:

NEW EXECUTION

En separat emergency-close-funktion kan senare tillåtas för att minska risk.

Emergency close ska vara starkt auditerad och inte användas som vanlig trade management.

## 72. Restart Safety

Efter restart får Risk Engine inte återgå till “zero daily loss”.

State ska rekonstrueras från:

- broker history
- open positions
- account snapshot
- journal
- trading date
Ny trading blockeras tills riskstate är reconciled.

## 73. Network Failure

Vid kommunikationsfel mellan Omnira och Runner:

- inga nya orders
- inga automatiska re-entrys
- ingen riskregel får antas passera
Befintliga broker-native SL/TP ska fortsätta skydda positionen där de redan är placerade.

## 74. Broker-Native Protection

När en trade exekveras ska kritisk protection såsom SL och TP så långt möjligt finnas hos broker/MT5 och inte enbart i Omnira-processens minne.

Det minskar risken vid:

- Omnira outage
- runner crash
- internet failure
Exakt MT5 executionmodell specificeras i senare integrationsdokument.

## 75. Prop Firm Interaction

En trade måste passera både:

Internal Risk Engine

och:

Prop Firm Rules Engine

Exempel:

Internal Risk:

```
ALLOW
```

Prop Firm:

```
DENY
```

Final:

```
DENY
```

Omvänt gäller samma sak.

Ingen trade får tas om något veto-lager nekar.

## 76. Conservative Rule Resolution

Om två giltiga risklager har olika tillåtna gränser ska den striktaste praktiskt tillämpliga gränsen vinna.

Exempel:

Internal risk remaining:

$150

Prop firm safe headroom:

$90

Max tillåten faktisk risk:

$90

förutsatt att minsta quantity kan hålla sig inom $90.

Annars:

```
DENY
```

## 77. Autonomy Boundary

Högre autonominivå får aldrig innebära högre riskgränser automatiskt.

Övergång:

```
Manual Approval → Demo Automation → Controlled Live
```

förändrar execution authority.

Den förändrar inte implicit RiskProfile.

## 78. Monitoring

Risk Engine ska övervaka minst:

- risk decisions
- denial rate
- daily risk consumption
- drawdown
- open exposure
- execution deviations
- risk calculation errors
- stale state
- kill-switch activations
Risk Engine health är en egen systemmetric.

## 79. Risk Incidents

En RiskIncident ska kunna skapas vid exempelvis:

- hard limit breach
- order större än approved quantity
- missing SL
- wrong instrument
- duplicate execution
- broker state mismatch
- unexpected position
- failure to enforce daily stop
Riskincident är separat från trading loss.

En korrekt stoppad förlust är inte ett systemfel.

## 80. Safety Tests

Risk Engine ska senare ha automatiserade tester för minst:

- exakt riskgräns
- en cent över riskgräns
- minsta contract för stort
- daily remaining exakt lika med trade risk
- daily remaining under trade risk
- 0 open positions
- 1 open position
- max attempts reached
- stale account data
- stale market data
- active kill switch
- unknown position
- invalid instrument metadata
- duplicate evaluation
- timezone/reset boundary
- news blackout boundary
Boundary testing är obligatoriskt.

## 81. Property-Based Testing

Position sizing och money calculations bör kompletteras med property-based tests.

Exempel på invariant:

Beräknad tillåten quantity får aldrig ge högre initial risk än hard limit efter instrumentanpassad avrundning.

Detta är särskilt viktigt när flera instrument introduceras.

## 82. Numeric Precision

Riskberäkningar ska använda kontrollerad decimalprecision.

Money, price, quantity och tick calculations får inte förlita sig på godtycklig binary floating-point där avrundningsfel kan påverka hard limits.

När systemet ligger exakt på en riskgräns ska resultatet vara reproducerbart.

## 83. Risk Audit

För varje exekverad trade ska följande kunna bevisas i efterhand:

- vilken riskprofil gällde
- vilken version
- account state
- stop distance
- quantity
- risk amount
- daily headroom
- vilka regler utvärderades
- resultat
- pre-execution revalidation
- eventuella warnings
Ingen live-trade ska sakna RiskDecision.

## 84. Open Decisions Before Canonical v1.0

Följande är ännu inte låsta:

**OPEN-RISK-01**

Intern daily-loss calculation:
realized/equity/fees-modell.

**OPEN-RISK-02**

Intern daily reset policy.

**OPEN-RISK-03**

Separat max trades per day.

**OPEN-RISK-04**

Max total drawdown för första interna riskprofilen.

**OPEN-RISK-05**

Instrument-specifika spread thresholds.

**OPEN-RISK-06**

Extra losing-streak protection utöver daily stop.

**OPEN-RISK-07**

Vad som händer med redan öppen position om daily-loss limit bryts intraday.

**OPEN-RISK-08**

Margin utilization limits.

Dessa frågor ska avgöras innan Risk Engine Specification kan uppgraderas till Canonical v1.0.

## 85. Initial Canonical Baseline Already Known

Följande är redan låst från strategiarbetet och ska inte öppnas igen utan versionsändring:

Max risk per trade = $150

Max daily drawdown = $450

Max open positions = 1

Max attempts per 4H thesis = 3

Technical SL får inte flyttas för riskanpassning

Minimum tradable position över riskbudget = DENY

Risk Engine har veto

## 86. Canonical Risk Flow

Riskkedjan ska principiellt vara:

```
Strategy Signal
→ Load Account State
→ Load RiskProfile
→ Validate Data Freshness
→ Check Kill Switch
→ Check Existing Positions
→ Check Attempts
→ Calculate Technical Stop Risk
→ Calculate Maximum Quantity
→ Check Per-Trade Risk
→ Check Daily Risk
→ Check Total Drawdown
→ Check Exposure
→ Check Spread
→ Check News / Session Defense-in-Depth
→ Check Account / Runner Health
→ Generate RiskDecision
```

Resultat:

**ALLOW**

eller:

**DENY**

Vid ALLOW fortsätter processen till Prop Firm Rules Engine.

## 87. Risk Engine Constitutional Rule

Den slutliga styrprincipen är:

Risk Engine finns inte för att förbättra win rate.
Risk Engine finns för att begränsa skadan när strategin, marknaden, datan, execution eller systemet har fel.

En strategi kan ha fel.

AI kan ha fel.

Market data kan ha fel.

Execution kan misslyckas.

Risk Engine ska anta att alla dessa scenarier förr eller senare kommer inträffa och begränsa konsekvensen när de gör det.

## Dokumentstatus

Dokument: Omnira Trading System – Risk Engine Specification

Version: v0.1

Status: Fas 0 – Första riskmodell

Strategi: Canonical v1.0

Systemarkitektur: v0.1

Datamodell: v0.1

Initial risk/trade: $150

Initial daily drawdown: $450

Max open positions: 1

Max attempts/4H thesis: 3

Öppna riskbeslut: 8

Risk Engine implementation: Ej påbörjad

Execution: Förbjuden

Live trading: Förbjuden

Dokumentet ska granskas och de åtta öppna riskbesluten ska lösas innan det kan uppgraderas till Canonical Risk Engine Specification v1.0.
