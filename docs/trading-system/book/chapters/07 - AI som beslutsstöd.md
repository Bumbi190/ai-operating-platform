# Kapitel 7 – AI som beslutsstöd

AI i Omnira Trading System ska inte fungera som en fristående trader som fritt försöker förutsäga marknaden.

Atlas ska istället fungera som ett intelligent beslutsstöd ovanpå ett deterministiskt trading-system.

Det innebär att Strategy Engine först identifierar vad strategin ser.

Risk Engine avgör vad som är tillåtet.

Prop Firm Rules Engine avgör vad externa regler tillåter.

Atlas använder därefter strukturerad information för att:

- förstå
- förklara
- jämföra
- analysera
- sammanfatta
- upptäcka mönster
- hjälpa användaren att fatta informerade beslut
Den centrala principen är:

AI får förbättra förståelsen av ett beslut, men får inte ersätta de regler som skyddar systemet.

## Atlas som intelligent lager

Atlas ska ligga ovanpå Trading Domains strukturerade data.

Atlas ska inte behöva gissa hela marknadsstrukturen utifrån en skärmbild.

Istället ska Atlas kunna få tillgång till objekt såsom:

- StrategySetup
- StrategySignal
- MarketContext
- LiquidityLevel
- FVGZone
- SMTObservation
- RiskDecision
- PropDecision
- TradeProposal
- Position
- TradeJournalEntry
- PerformanceRecord
Detta gör att AI:n kan resonera kring samma data som resten av systemet använder.

## Deterministisk logik före AI

Strategy Engine ska först avgöra exempelvis:

- relevant 4H-open
- liquidity
- FVG
- manipulation
- iFVG
- CISD
- SMT
- setup grade
- entry
- stop loss
- target
- R:R
Atlas ska därefter kunna förklara dessa signaler.

AI ska alltså inte få skapa en egen parallell strategi i bakgrunden.

Om Strategy Engine säger:

```
SETUP_INVALID
```

ska Atlas inte själv omklassificera den till en giltig trade.

## Vad Atlas får göra

Atlas får exempelvis:

- förklara varför setupen identifierades
- beskriva vad marknaden har gjort hittills
- sammanfatta den aktuella 4H-thesisen
- presentera relevanta liquiditynivåer
- förklara vilken FVG som används
- beskriva manipulationen
- visa varför entry confirmation är giltig
- beskriva SMT
- förklara setup grade
- jämföra mot historiskt liknande setups
- beskriva rådande market regime
- lyfta osäkerheter
- presentera riskbeslutet
- presentera prop firm-beslutet
- skapa en begriplig trade thesis
- hjälpa till med journal och efteranalys
## Vad Atlas aldrig får göra

Atlas får inte:

- kringgå Strategy Engine
- kringgå Risk Engine
- kringgå Prop Firm Rules Engine
- ändra technical SL för att få bättre position size
- höja risk baserat på confidence
- aktivera live automation själv
- kringgå kill switch
- ignorera news-regler
- skapa en order utan korrekt approval
- ändra canonical strategi-regler live
- ändra riskprofil live
- ändra prop firm-regler live
## AI Confidence

Om Atlas producerar ett confidence-värde ska det behandlas som analysmetadata.

Exempel:

AI confidence = 91%

är inte samma sak som:

Trade probability = 91%

och är inte samma sak som:

Risk permission = ALLOW

Confidence får aldrig användas för att mjuka upp hard limits.

Exempel:

Strategy Engine: PASS

Atlas Confidence: 96%

Risk Engine: DENY

Slutresultat:

**NO TRADE**

## Explainability

En av Atlas viktigaste roller är att göra trading-systemet begripligt.

Användaren ska inte bara se:

```
LONG
```

utan exempelvis:

Den valda 10:00 4H-candlen har manipulerat ned i en aktiv 15m FVG. På 1m har ett iFVG och CISD bekräftats. SMT mot ES saknas, vilket ger setup grade A istället för A+. Entry planeras på confirmation close. Technical SL ligger under manipulationens senaste swing low och första liquidity target ger 2.6R.

Detta är betydligt mer användbart än en svart låda.

## Atlas Market View

AI-lagret ska vara nära integrerat med Atlas Market View.

När användaren öppnar Trading-projektet ska Atlas kunna förklara det som visas på chartet.

Exempel:

**Aktuell status:**

```
WAITING_FOR_MANIPULATION
```

Atlas kan då förklara:

Jag bevakar liquidity under aktuellt pris. Ingen giltig manipulation har ännu genomförts och därför letar jag inte efter entry på 1m.

Senare:

```
WAITING_FOR_CONFIRMATION
```

Atlas kan säga:

15m FVG har touchats. Manipulationen är därför giltig. Jag väntar nu på iFVG eller CISD på 1m innan någon trade proposal kan skapas.

## Planned Entries

Atlas Market View ska kunna visa vad systemet planerar.

Om en setup är nära färdig ska användaren kunna se:

- direction
- potential entry
- technical stop
- target
- current R:R
- setup grade
- missing confirmation
- risk estimate
- state
Det ska tydligt framgå om nivåerna är:

- observation
- preliminary
- confirmed
- proposed
- approved
- executed
## AI ska inte hitta på saknade data

Om SMT-data saknas ska Atlas inte säga:

Ingen SMT finns.

Det korrekta svaret kan vara:

SMT kan inte utvärderas eftersom ES-data saknas.

På samma sätt ska Atlas skilja mellan:

```
FALSE
```

och:

```
UNKNOWN
```

Detta är viktigt för hela systemets integritet.

## Market Regime Classification

Atlas kan senare hjälpa till att klassificera market regime.

Exempel på möjliga kategorier:

- trending
- ranging
- high volatility
- low volatility
- expansion
- compression
- news-driven
- abnormal conditions
Market regime är initialt ett analysfält.

Det ska inte automatiskt bli ett hard strategy filter.

Först när historisk data visar robust effekt kan en regime-regel föreslås som kandidatversion.

## Historisk jämförelse

Atlas ska kunna jämföra en aktuell setup mot historiskt liknande observationer.

Exempel:

De senaste 214 A-setups under New York-sessionen hade en expectancy på +0.31R.

eller:

CISD-only setups efter intermediate liquidity har historiskt haft lägre expectancy än setups efter 15m FVG-touch.

Sådana uppgifter ska alltid baseras på faktisk journal- och analyticsdata.

Atlas får inte hitta på historiska statistikvärden.

## Sample Size

Atlas ska alltid ta hänsyn till sample size.

Exempel:

5 trades

är inte samma evidensnivå som:

500 trades

AI ska därför inte presentera små dataset som robust edge.

Systemet ska senare kunna använda miniminivåer för när analytics får betecknas som:

- insufficient
- preliminary
- moderate evidence
- strong evidence
Exakta thresholds definieras senare.

## Performance Context

När Atlas presenterar performance ska den helst visa mer än win rate.

Exempel:

- trade count
- win rate
- expectancy
- average R
- profit factor
- max drawdown
- losing streak
- sample size
- period
- strategy version
En strategi med hög win rate kan fortfarande ha dålig expectancy.

## AI Analysis Object

AI Analysis ska sparas som ett eget dataobjekt.

Det gör att systemet i efterhand kan jämföra:

- vad Strategy Engine såg
- vad AI:n sa
- vad Risk Engine gjorde
- vad marknaden sedan gjorde
Detta blir viktigt för att kunna utvärdera om AI-lagret faktiskt tillför värde.

## AI-versionering

AI Analysis ska kunna kopplas till:

- model
- model version
- prompt version
- analysis policy version
Om Atlas beteende förändras ska vi kunna se vilken version som producerade tidigare analyser.

Detta är särskilt viktigt om AI senare används som en del av beslutsstödet i live trading.

## AI får inte vara enda beslutsgrund

Om en trade endast existerar därför att en språkmodell säger:

Detta ser bra ut.

har systemet lämnat den arkitektur som definierats för Omnira Trading.

Alla exekverbara trades ska först ha en strukturerad Strategy Signal.

AI kan lägga till kontext.

AI får inte ensam skapa själva tradingmöjligheten.

## Osäkerhet

Atlas ska uppmuntras att uttrycka osäkerhet.

Exempel:

Setupen uppfyller de formella reglerna, men historisk data för denna specifika regime är begränsad.

Det är bättre än att AI:n överdriver precision.

Osäkerhet ska vara en del av analysen, inte något som döljs.

## Contradicting Factors

AI Analysis bör kunna innehålla:

- supporting factors
- contradicting factors
Exempel:

**Supporting:**

- iFVG + CISD
- clean manipulation
- historical session edge
## Contradicting:

- ingen SMT
- ovanligt hög volatility
- få historiska jämförelser
Detta gör analysen mer balanserad.

## Trade Proposal Explanation

Atlas ska kunna generera en standardiserad sammanfattning för varje Trade Proposal.

Exempel:

Direction: LONG
Strategy: Omnira Liquidity Manipulation v1.0
Setup Grade: A
Entry: 24,120.25
SL: 24,105.50
TP: 24,151.00
R:R: 2.08R
Risk: $147.50

Strategy: PASS
Risk: PASS
Prop Firm: PASS

Atlas Thesis:
15m FVG har touchats under den valda 4H-open. Pris har därefter producerat iFVG och CISD på 1m. SMT saknas. Technical SL ligger under manipulationens senaste swing low. Första giltiga liquidity target ger mer än 2R.

## Denial Explanation

Atlas ska också kunna förklara när en trade nekas.

Exempel:

Strategin är giltig men Risk Engine nekar traden eftersom endast $95 av dagens riskbudget återstår och minsta MNQ-position med aktuell technical SL kräver $136 risk.

Detta är bättre än ett generiskt:

```
ERROR
```

## AI och News

Atlas kan förklara news context men hard news-regler ska komma från strukturerad kalenderdata.

Atlas får inte läsa en rubrik och själv avgöra att:

Den här nyheten verkar nog inte så viktig.

Canonical NewsEvent och policy avgör hard restrictions.

## AI och Prop Firm-regler

Atlas kan hjälpa användaren att förstå prop firm-regler.

Exempel:

Denna trade hade passerat intern risk men nekas eftersom prop firm-kontot endast har $72 equity headroom kvar före maximum-loss-gränsen.

Själva beräkningen ska komma från Prop Firm Rules Engine.

## AI och Execution

Atlas ska kunna följa execution state.

Exempel:

```
PROPOSAL_APPROVED
→
EXECUTION_DISPATCHED
→
ORDER_ACKNOWLEDGED
→
FILLED
```

Atlas kan då presentera för användaren vad som händer.

AI ska inte själv kommunicera direkt med broker utan executionkontrollerna.

## AI och Journal

Efter en trade ska Atlas kunna skapa en strukturerad efteranalys.

Exempel:

- vilken thesis användes
- vilken setup grade
- vilken entry confirmation
- om SMT fanns
- hur MFE/MAE utvecklades
- om break-even aktiverades
- varför traden stängdes
- slutligt R
- eventuella execution issues
Journalen ska fortfarande innehålla rå strukturerad data som source of truth.

AI-texten är ett analyslager ovanpå den.

## Post-Trade Review

Atlas ska kunna genomföra konsekvent post-trade review.

Den ska inte bara analysera förlorare.

Vinnare ska också granskas.

En vinnande trade kan ha varit dåligt exekverad.

En förlorande trade kan ha varit perfekt enligt reglerna.

Systemet ska därför skilja mellan:

**Decision Quality**

och:

**Outcome**

## Decision Quality vs Outcome

Detta är en viktig princip.

En trade som:

- följde Strategy v1.0
- passerade risk
- exekverades korrekt
- och sedan förlorade
är inte automatiskt ett dåligt systembeslut.

På samma sätt är en regelöverträdelse som råkar vinna inte ett bra beslut.

Atlas ska lära sig denna skillnad.

## Self-Improvement

Atlas Trading Learning & Improvement Layer ska använda historisk data från hela beslutsprocessen.

Det innebär att Atlas ska kunna lära från:

- alla setups
- alla signals
- nekade trades
- exekverade trades
- winners
- losers
- break-even
- sessions
- liquidity types
- FVG types
- setup grades
- SMT
- market regimes
- execution quality
- risk decisions
- prop decisions
Målet är att skapa bättre kunskap över tid.

## Wisdom Layer

Self-improvement ska inte bara samla statistik.

Atlas ska kunna bygga en högre nivå av sammanställd kunskap, eller wisdom.

Exempel:

A+ setups har generellt stark expectancy, men förbättringen jämfört med A är liten under London och betydligt större under New York.

eller:

Re-entry attempt 3 har historiskt negativ expectancy även om attempt 1–2 är positiva.

Sådan kunskap ska kunna sparas som strukturerade findings med:

- evidence
- sample size
- period
- strategy version
- confidence
- status
## Hypothesis Generation

Atlas får skapa hypoteser.

Exempel:

Candidate hypothesis: blockera C-grade under low-volatility regime.

Hypotesen ska inte aktiveras live.

Den ska gå vidare till Research & Validation.

## Candidate Versions

Ett förbättringsförslag som ändrar materiella regler ska skapa en candidate version.

Exempel:

**Omnira Liquidity Manipulation v1.1-candidate**

Den ska testas separat mot:

**Canonical v1.0**

Det ska gå att jämföra:

- expectancy
- drawdown
- profit factor
- stability
- sample size
- different regimes
- out-of-sample
## Anti-Overfitting

Atlas ska inte optimera strategin genom att välja regler som råkar passa historiken perfekt.

Förbättringsförslag ska därför testas på:

- training period
- holdout data
- out-of-sample data
- forward test
Parametrar ska även kunna stress-testas.

En regel som endast fungerar på exakt ett parameter-värde är mindre robust än en regel som fungerar över ett rimligt område.

## Self-Improvement Governance

Flödet ska vara:

```
Observe
→ Measure
→ Learn
→ Hypothesis
→ Candidate Version
→ Backtest
→ Out-of-Sample
→ Forward Test
→ Review
→ Approval
→ Canonical Version
```

Atlas får inte hoppa över dessa steg när ändringen påverkar production trading.

## Canonical Knowledge

Atlas ska alltid kunna skilja mellan:

**Canonical Rule**

och:

**Research Finding**

och:

**Candidate Hypothesis**

Exempel:

**Canonical:**

Minimum R:R = 2.0

## Research Finding:

Trades mellan 2.0R–2.2R har hittills haft lägre expectancy

## Candidate Hypothesis:

Testa minimum R:R = 2.3

Detta förhindrar att analysdata långsamt förvandlas till regler utan ett explicit beslut.

## Learning from Rejected Trades

Nekade trades är viktiga.

Om Risk Engine nekar en setup ska systemet fortfarande kunna följa vad marknaden gjorde efteråt.

Atlas kan då analysera:

Hur hade traden gått om den hade tagits?

Detta får användas för forskning.

Det får inte användas för att i efterhand säga att Risk Engine hade fel.

Risk Engine bedöms på riskkontroll, inte på om en enskild nekad trade senare blev vinnare.

## Learning from Missed Setups

Systemet ska även kunna studera setups som:

- nästan blev giltiga
- invalidated
- expired
- saknade confirmation
Detta kan hjälpa till att förstå vilka delar av strategy funnel som producerar edge.

## Counterfactual Analysis

Atlas ska senare kunna utföra frågor som:

Vad hade hänt om vi endast tradat A och A+?

Vad hade hänt utan SMT?

Vad hade hänt om max attempts varit 2?

Vad hade hänt med annan news blackout?

Counterfactual analysis ska göras på forskningens kopia av reglerna.

Canonical live-history får aldrig skrivas om.

## AI Performance Evaluation

AI-lagret självt ska också mätas.

Vi ska kunna fråga:

Gav Atlas analysis faktiskt någon information som förbättrade beslutsförståelsen?

Identifierade Atlas risks eller regimes korrekt?

Var confidence kalibrerad?

AI får inte automatiskt betraktas som värdefull bara för att AI används.

## Confidence Calibration

Om Atlas använder confidence ska vi senare kunna mäta om confidence korrelerar med faktiska observationer.

Exempel:

Om setups med:

90–100% confidence

inte presterar bättre än:

60–70%

är confidence-värdet sannolikt inte särskilt användbart.

Då ska systemet ändra hur det används eller helt sluta exponera det.

## AI Fallback

Om AI-tjänsten är unavailable ska det deterministiska trading-systemet fortfarande kunna fungera i de modes där policy tillåter det.

Strategy Engine och Risk Engine ska alltså inte vara tekniskt beroende av att en språkmodell svarar.

Beroende på operation mode kan AI outage:

- visa varning
- stoppa Trade Proposal
- eller låta deterministic pipeline fortsätta
Den slutliga policyn definieras senare.

AI får inte bli en single point of failure för broker-native protection.

## Human Oversight

Atlas ska göra det enklare för människan att granska systemet.

Särskilt under:

- Analysis Mode
- Demo Manual Approval
- Live Manual Approval
ska användaren kunna se hela decision chain innan approval.

Det inkluderar:

- vad strategin såg
- vad Atlas analyserade
- vad riskmotorn sa
- vad prop firm-motorn sa
- vad systemet planerar att göra
## Ingen dold reasoning krävs

Omnira behöver inte spara eller visa en språkmodells privata interna resonemang.

Det viktiga är att systemet sparar:

- strukturerade inputs
- beslut
- relevanta factors
- sammanfattad motivering
- outputs
- versionsmetadata
Explainability ska komma från systemets explicit dokumenterade data och regler.

## Atlas som tradingpartner

Målet är att Atlas över tid ska fungera mindre som en enkel chatbot och mer som en intelligent tradingpartner.

Atlas ska kunna säga:

Den här setupen är giltig enligt Strategy v1.0. Den är Grade B eftersom endast iFVG finns. Liknande B-setups under denna session har hittills lägre expectancy än A-setups. Risk Engine tillåter positionen, men vi har bara 33 % av dagens riskbudget kvar.

Det är en mycket mer värdefull användning av AI än:

Jag tror Nasdaq går upp.

## Långsiktig vision

På lång sikt ska Atlas kunna kombinera:

- realtidsdata
- strategy state
- risk
- prop firm-regler
- historik
- analytics
- market regime
- execution quality
- learning findings
och presentera en sammanhängande bild av trading-systemet.

Men den grundläggande maktfördelningen ska förbli densamma.

AI blir smartare.

Riskgränserna blir inte frivilliga.

## Kapitelstatus

Kapitel: 7 – AI som beslutsstöd

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Atlas roll: Beslutsstöd och explainability

Strategy authority: Deterministisk

Risk authority: Absolut veto

Self-improvement: Tillåtet

Self-modification i produktion: Förbjudet

Candidate strategy generation: Tillåtet

Canonical activation: Kräver testning och approval

AI implementation: Ej påbörjad

Atlas ska bli bättre på att förstå och förklara trading över tid utan att få obegränsad rätt att förändra systemet den styr.
