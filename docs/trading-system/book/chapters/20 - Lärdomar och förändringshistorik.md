# Kapitel 20 – Lärdomar och förändringshistorik

Omnira Trading System ska inte bara komma ihåg vilka trades som togs.

Det ska också komma ihåg varför systemet ser ut som det gör.

Varje större regel, arkitekturförändring, riskbeslut, incident och strategy revision ska kunna spåras över tid.

Detta är viktigt eftersom ett trading-system som utvecklas under flera år annars lätt tappar bort:

- varför en regel infördes
- varför en regel togs bort
- vilka problem som ledde till en arkitekturförändring
- vilka candidate strategies som redan testats
- vilka hypoteser som visade sig fel
- vilka incidenter som redan inträffat
- vilka lessons learned som blev permanenta systemprinciper
Den centrala principen är:

Omnira ska inte bara versionshantera vad som ändrades. Systemet ska också bevara varför det ändrades.

## Förändringshistorik som permanent del av systemet

Change History ska vara en förstaklassad del av Omnira Trading.

Den ska kunna dokumentera förändringar i:

- Strategy
- Risk
- Prop Firm Rules
- Execution
- Market Data
- AI Analysis
- Security
- Infrastructure
- Analytics
- Learning Layer
- UI
- Operational policy
På så sätt blir utvecklingshistoriken en del av själva systemets kunskap.

## Versioner ska ha mening

En version ska inte bara vara ett nummer.

Exempel:

Strategy v1.0

ska representera ett specifikt regelverk.

Om strategy senare ändras till:

v1.1

ska det vara möjligt att förstå:

- vad som ändrades
- varför det ändrades
- vilken evidens som låg bakom
- vilka tester som genomfördes
- vem som godkände
- när den aktiverades
## Semantic Versioning som princip

En förenklad versioneringsmodell kan användas.

Exempel:

v1.0

för första canonical productionversion.

v1.1

för en kompatibel men materiell strategiändring.

v2.0

för större förändring av strategy logic eller architecture.

Exakta regler kan senare standardiseras.

## Candidate Versions

Förbättringar ska först finnas som candidate.

Exempel:

v1.1-candidate-01

Den är inte canonical.

Den representerar en hypotes under test.

## Candidate Lifecycle

En candidate ska kunna gå genom:

```
PROPOSED
→
BACKTESTING
→
OOS_TESTING
→
FORWARD_TESTING
→
REVIEW
→
APPROVED
```

eller:

```
REJECTED
```

Först efter approval får den bli canonical.

## Rejected Candidates ska bevaras

En candidate som inte fungerar ska inte raderas.

Exempel:

v1.1-candidate-03

visar sämre out-of-sample-resultat.

Status:

```
REJECTED
```

Detta är fortfarande värdefull kunskap.

## Varför negativa resultat är viktiga

Om rejected research försvinner kan Atlas senare föreslå exakt samma idé igen.

Genom att spara den kan systemet istället veta:

Den här hypotesen testades redan mot dataset X och misslyckades.

Det minskar onödigt arbete och selection bias.

## Research Registry

Alla större hypotheses ska kunna lagras i ett Research Registry.

Exempel:

HYP-0042

Hypothesis:
Blockera Grade C under New York.

Reason:
Preliminary negative expectancy.

Tested against:
Strategy v1.0 dataset.

Result:
No robust improvement OOS.

Status:
REJECTED.

## Finding → Hypothesis

Atlas Learning Layer ska skilja mellan:

**Finding**

och:

**Hypothesis**

Exempel:

Finding:

Attempt 3 visar lägre expectancy.

Hypothesis:

Max attempts bör kanske sänkas från 3 till 2.

Finding beskriver data.

Hypothesis föreslår en möjlig förklaring eller förändring.

## Hypothesis är inte Rule

Det är viktigt att systemet aldrig omvandlar:

interesting observation

direkt till:

production rule

Det är exakt detta governance-lagret ska förhindra.

## Change Proposal

En förändring som är mogen för riktig evaluation ska få ett formellt Change Proposal.

Exempel:

CHANGE-STRAT-0012

Det kan innehålla:

- affected component
- current version
- proposed version
- reason
- supporting findings
- expected benefit
- known risks
- validation plan
## Change Classification

Förändringar kan klassificeras efter typ.

Exempel:

**Strategy Change**

Ändrar tradingregler.

## Risk Change

Ändrar kapital- eller exposure policy.

## Prop Change

Ändrar firm-specific compliance logic.

## Execution Change

Ändrar order/management behavior.

## Infrastructure Change

Ändrar runner, VPS, provider eller deployment.

## Security Change

Ändrar permissions, auth eller safety.

## Material vs Non-Material Change

Inte alla kodförändringar kräver ny strategy version.

Exempel:

UI text correction:

icke-material.

Men:

ändrad iFVG detection:

material.

Systemet ska kunna skilja mellan:

**behavior-preserving change**

och:

**behavior-changing change**

## Strategy Behavior Change

Om en kodändring kan förändra:

- vilka setups som identifieras
- entry
- SL
- TP
- grade
- re-entry
- news handling
ska den behandlas som strategy behavior change.

## Risk Behavior Change

Om en förändring påverkar:

- allowed quantity
- daily stop
- risk calculation
- exposure
krävs ny RiskProfile eller Risk Engine version där relevant.

## Execution Behavior Change

Ändringar i:

- order type
- slippage policy
- retry
- fill handling
- SL/TP submission
ska dokumenteras och verifieras separat.

## Reason for Change

Varje materiell förändring ska ha en tydlig anledning.

Exempel:

Attempt 3 produced persistent negative expectancy across backtest, OOS and forward testing.

Det är starkare än:

Vi ville testa något nytt.

## Evidence Reference

Change Proposal ska kunna länka till:

- Finding IDs
- BacktestRuns
- ForwardTestRuns
- live metrics
- incidents
- external rule changes
## No Evidence Change

Ibland kan en förändring ändå behövas utan performance evidens.

Exempel:

- security vulnerability
- broker API change
- prop firm rule change
Då ska reason anges som exempelvis:

```
SECURITY_REQUIRED
```

eller:

```
COMPLIANCE_REQUIRED
```

## Change Approval

Materiella productionändringar kräver explicit approval.

Approval ska kunna dokumentera:

- approver
- timestamp
- version
- evidence reviewed
## Atlas får föreslå

Atlas får skapa:

- Finding
- Hypothesis
- Candidate
- Change Proposal draft
Atlas får inte ge sig själv final approval.

## Canonical Promotion

När en candidate passerat samtliga gates ska den kunna promoveras.

Exempel:

v1.1-candidate-04

```
→
```

Canonical v1.1

Promotion ska vara ett explicit event.

## Promotion Record

Promotion ska dokumentera:

- old canonical version
- new canonical version
- tests
- approval
- activation date
- rollback plan
## Canonical betyder Active Truth

Canonical betyder:

Detta är den officiellt godkända definitionen som systemet ska implementera i relevant production scope.

Det betyder inte:

Denna version är perfekt för alltid.

## Deprecation

När ny canonical version aktiveras ska gammal version kunna markeras:

```
DEPRECATED
```

men historiken ska bevaras.

## Historical Trades behåller sin Version

En trade från v1.0 ska alltid fortsätta vara:

StrategyVersion = v1.0

även efter att v1.1 blivit active.

Annars förstörs analytics integrity.

## Rollback

Om en ny canonical version orsakar problem ska systemet kunna återgå till tidigare verifierad version.

Rollback ska dokumenteras som ett eget event.

## Rollback är inte Delete

v1.1 försvinner inte bara för att systemet går tillbaka till v1.0.

Den kan markeras:

```
ROLLED_BACK
```

med reason.

## Rollback Reason

Exempel:

Forward-to-live divergence exceeded expected range.

eller:

Execution bug introduced in v1.1.

Detta blir värdefull learning.

## Incident Learning

Technical incidents ska kunna skapa lessons learned.

Exempel:

Incident:

SL verification failed after reconnect

Lesson:

Reconciliation must verify broker-native protective orders before returning runner to READY.

Detta kan sedan skapa:

- code fix
- regression test
- architecture rule
## Incident → System Principle

Vissa incidents kan bli permanenta designprinciper.

Exempel:

Ett duplicate order incident kan leda till principen:

No execution without persistent idempotency state.

Detta är hur systemet mognar.

## Postmortem

Större incidents ska få ett postmortem.

Det ska minst innehålla:

- what happened
- impact
- timeline
- root cause
- contributing factors
- recovery
- corrective actions
- prevention
## No Blame

Postmortem ska fokusera på systemförbättring.

Målet är inte att hitta någon att skylla på.

Det viktiga är:

Hur gör vi detta svårare att upprepa?

## Lessons Learned Registry

Systemet ska kunna ha ett separat register över permanenta lessons.

Exempel:

LESSON-0017

Broker response is not sufficient proof that SL is active; actual position state must be verified.

## Severity

Lessons kan klassificeras:

- INFO
- OPERATIONAL
- IMPORTANT
- SAFETY_CRITICAL
## Safety-Critical Lessons

En safety-critical lesson ska kunna skapa obligatoriska:

- tests
- policies
- controls
## External Changes

Systemet måste också kunna dokumentera förändringar som kommer utifrån.

Exempel:

- prop firm ändrar drawdown rule
- broker ändrar symbol mapping
- MT5 API ändras
- news provider ändrar schema
Dessa kan kräva ny internal version.

## Prop Firm Rule Change History

Exempel:

PropProfile v3

ersätts av:

PropProfile v4

på grund av ny official provider rule.

Historiska account decisions ska fortsätta referera till v3 där det var den aktiva versionen.

## Rule Effective Date

Extern regeländring ska ha:

- discovered_at
- effective_from
- verified_at
- source
## Unknown Historical Rules

Om vi inte säkert vet vilken external rule som gällde historiskt ska systemet markera osäkerheten.

Det ska inte skriva om historiken med dagens regel.

## Market Data Provider Changes

Byter vi provider ska detta registreras.

Det kan påverka:

- candles
- FVG
- swing detection
- backtest comparisons
Därför är provider change inte alltid trivial.

## Data Migration History

Om historiska datasets korrigeras eller migreras ska gamla testresultat fortfarande veta vilken data de använde.

## Detection Logic History

Exakta detectionalgoritmer ska versionshanteras.

Exempel:

SWING-DETECT-v1

FVG-DETECT-v1

IFVG-DETECT-v1

CISD-DETECT-v1

SMT-DETECT-v1

Detta är särskilt viktigt för reproducibility.

## Pattern Definition Changes

Om vi senare förbättrar definitionen av CISD ska detta inte göras tyst.

Det kan förändra strategy behavior.

Ny detection/strategy candidate krävs.

## AI Layer History

AI-lagret ska också ha förändringshistorik.

Exempel:

- model updated
- analysis prompt updated
- market regime classifier updated
- explanation policy updated
Det gör det möjligt att utvärdera om Atlas blivit bättre.

## AI Model Change är inte automatiskt Strategy Change

Om Atlas endast förklarar bättre men Strategy Engine är oförändrad behöver strategy version inte ändras.

Men AI analysis version ska ändras.

## AI Decision-Support Change

Om AI senare får en formell roll i någon gate måste en modell/policyändring behandlas betydligt striktare.

## Learning Layer Evolution

Self-improvement-systemet självt ska också utvecklas.

Exempel:

Learning Engine v1

kan senare ersättas av:

v2

med bättre statistical validation.

Vi ska kunna mäta om den nya versionen producerar bättre candidates.

## Learn from Learning

Atlas ska alltså även kunna lära sig:

Vilka typer av hypotheses tenderar att hålla OOS?

Det är meta-learning.

## Failed Hypothesis Rate

Learning Layer ska mäta hur stor andel candidates som:

- failar backtest
- failar OOS
- failar forward
- blir canonical
Om nästan allt blir canonical är governance sannolikt för svag.

## Research Discipline

Att många hypotheses blir rejected är normalt.

Det är ett tecken på att testsystemet faktiskt filtrerar.

## Change Frequency

Production strategy ska inte förändras så ofta att systemet aldrig hinner samla stabil evidens.

För hög change frequency skapar:

- version fragmentation
- små samples
- svår analytics
- hög overfitting risk
## Stable Evaluation Windows

När en canonical version går in i forward/live validation bör den få tillräckligt stabil evaluationperiod.

Vi ska inte ändra den efter varje förlust.

## Emergency Changes

Ibland krävs snabb production change.

Exempel:

critical security problem.

Emergency change ska ändå dokumenteras.

Efteråt krävs full review och test där relevant.

## Emergency Change Status

Exempel:

```
EMERGENCY_PATCH
```

kan användas tills normal canonical process slutförts.

## Hotfix vs Strategy Change

En bugfix som återställer systemet till dokumenterad canonical behavior behöver inte nödvändigtvis vara ny strategyversion.

Men fixen måste dokumenteras.

## Example

Canonical säger:

Minimum R:R = 2.0

Kodbugg tillåter:

1.8

Att fixa detta till 2.0 är en implementation correction.

Det är inte en ny strategyregel.

## Implementation Bug Registry

Det ska finnas historik över buggar som påverkade eller kunde påverka trading behavior.

## Backfill

Om ett implementationfel hittas ska vi kunna analysera tidigare data och fråga:

Vilka historical decisions påverkades?

Detta kan kräva corrected analytics.

## Correction får inte skriva om Raw History

Original systemevent bevaras.

En ny interpretation kan läggas ovanpå.

## Historical Reclassification

Exempel:

En setup journalfördes som Grade B på grund av bug.

Efter fix kan research markera:

corrected grade = A

Original grade ska fortfarande finnas i audit.

## Change Log

Varje release bör ha en tydlig changelog.

Exempel:

**v1.1**

## Changed

- max attempts reduced 3 → 2
## Reason

- negative expectancy attempt 3 across OOS + forward
## Evidence

- FIND-0042
- BT-00124
- FT-00018
## Approved

- date
- actor
## Human-Readable + Machine-Readable

Change history ska finnas både som:

- strukturerade records
- mänskligt läsbar sammanfattning
Atlas kan generera den läsbara versionen från strukturerade data.

## Boken som Canonical Context

Denna bok ska fungera som den högre nivån av arkitektur- och governancekunskap.

Den ska senare kunna uppdateras när systemet når nya canonical milestones.

Men den ska inte ersätta machine-readable versionsobjekt.

## Book Versioning

Själva boken bör också versionshanteras.

Exempel:

Omnira Trading System – Canonical Book v1.0

senare:

v1.1

när större godkända förändringar införts.

## Bokförändring efter Systemförändring

Systemförändring ska först vara:

- beslutad
- testad
- godkänd
därefter uppdateras canonical bok där det behövs.

Boken ska inte göra oprövade hypotheses till officiell arkitektur.

## Change History Appendix

En framtida canonical bok kan innehålla ett appendix med:

- version
- date
- major changes
- reason
Det ger snabb historisk överblick.

## Atlas Knowledge Graph

På längre sikt kan change history kopplas till Omniras Intelligence Graph.

Exempel:

Strategy v1.1

linked to:

- Finding
- Backtest
- Forward Test
- Incident
- Approval
- Deployment
Det gör systemets kunskap navigerbar.

## Why Graph Relations Matter

Då kan Atlas svara:

Varför ändrade vi max attempts till 2?

och följa:

Rule

```
→ Change
→ Finding
→ Evidence
→ Approval
```

istället för att gissa från gamla chattexter.

## Decision Record

Större arkitekturbeslut bör kunna sparas som:

**Architecture Decision Records**

Exempel:

ADR-TRADING-007

Decision:
Execution Runner ska vara separerad från Strategy Engine.

Reason:
Least privilege, MT5 isolation, VPS migration, lower blast radius.

Status:
Accepted.

## Superseded Decisions

När ett beslut senare ändras ska gammalt ADR kunna markeras:

SUPERSEDED BY ADR-X

inte raderas.

## Why Matters

Detta gör att framtida utvecklare eller Atlas kan förstå:

Det här var inte en slumpmässig kodstruktur.

Det fanns en säkerhetsmässig anledning.

## Decision Debt

Om vi tillfälligt gör en kompromiss ska detta kunna registreras.

Exempel:

Initial market data provider används som single source under MVP. Multi-source validation postponed.

Detta blir:

KNOWN LIMITATION

istället för bortglömd teknisk skuld.

## Known Limitations Registry

Systemet ska ha en lista över sådant vi vet ännu inte är perfekt.

Exempel:

- active management outage risk
- no redundant execution runner yet
- initial news provider dependency
- limited regime classifier
Detta gör roadmap mer verklighetsbaserad.

## Technical Debt

Teknisk skuld ska kunna prioriteras efter:

- safety impact
- operational impact
- performance impact
- developer cost
Safety debt ska prioriteras högst.

## Unresolved Questions

Systemet ska också kunna bevara öppna designfrågor.

Exempel:

- exact scale thresholds
- AI fallback policy
- future VPS redundancy
Open Questions ska inte behandlas som beslut.

## Status Taxonomy

En bra knowledge model ska kunna skilja:

```
CANONICAL
CANDIDATE
HYPOTHESIS
FINDING
REJECTED
DEPRECATED
OPEN_QUESTION
KNOWN_LIMITATION
```

Detta är centralt för att Atlas inte ska blanda ihop kunskapsnivåer.

## Confidence in Knowledge

Research findings kan också ha:

- sample size
- confidence
- evidence quality
Canonical rules behöver däremot inte betyda att de är statistiskt perfekta.

Canonical betyder att det är den aktiva beslutade policyn.

## Strategy Evolution

Den långsiktiga evolutionen ska kunna se ut så här:

```
Canonical v1.0
→ Observation
→ Learning
→ Finding
→ Hypothesis
→ v1.1 Candidate
→ Backtest
→ OOS
→ Forward
→ Review
→ Canonical v1.1
→ Live Deployment
→ Observation
```

och därefter fortsätter cykeln.

## Evolution utan Chaos

Detta gör att systemet kan utvecklas kontinuerligt utan att production blir ett ständigt experiment.

## Self-Improvement Constitutional Rule

Den viktigaste regeln för systemets framtida lärande är:

Atlas får utveckla kunskap snabbare än systemet får utveckla production authority.

Learning kan ske kontinuerligt.

Productionförändring ska vara långsammare och mer kontrollerad.

## Why This Matters

Ett autonomt system som kan förändra sig själv snabbare än vi kan validera förändringarna är svårt att kontrollera.

Därför separeras:

**Learning Speed**

från:

**Deployment Speed**

## Historical Baselines

Canonical versions ska fungera som historiska baselines.

Atlas ska alltid kunna jämföra:

v1.1

mot:

v1.0

och fråga:

Blev systemet faktiskt bättre?

## Improvement Must Be Measured

En ny version är inte bättre bara för att den är ny.

Den ska utvärderas mot föregående baseline.

## Regression Detection

Om ny version försämrar:

- execution
- drawdown
- stability
- compliance
ska detta kunna upptäckas.

## No Sunk Cost

Om en candidate krävt mycket utvecklingsarbete men data visar att den är sämre ska den kunna rejected.

Utvecklingskostnad är inte bevis på edge.

## Strategy Retirement

En strategy kan på längre sikt få status:

```
RETIRED
```

om edge försvinner eller en bättre strategy ersätter den.

Historiken ska ändå bevaras.

## Re-Activation

En retired strategy ska inte återaktiveras utan ny validation mot aktuell market environment.

## Prop Program Retirement

Samma princip kan gälla prop profiles om ett program stängs eller ändras.

## Knowledge Retention

Även gamla strategy failures är värdefulla.

De kan hjälpa framtida Atlas förstå vilka idéer som inte fungerat.

## Atlas Questions History Should Answer

Systemet ska på sikt kunna svara:

Varför använder vi 2R minimum?

Varför har vi max tre attempts?

Varför stängs positioner T-15 före news?

Varför kör vi Read Only innan execution?

När infördes denna RiskProfile?

Vilket test ledde till Strategy v1.2?

Har vi testat att ta bort SMT tidigare?

Om svaren finns strukturerat behöver vi inte lita på mänskligt minne.

## Human Review

Atlas ska hjälpa till att hitta historiken.

Men större ändringar ska fortfarande kunna reviewas av användaren.

## Change Summary

Vid ny release ska Atlas kunna skapa en enkel sammanfattning:

v1.2 ändrar endast re-entry behavior. Inga ändringar görs i entry, SL, TP eller news policy. Förändringen baseras på 742 historical observations, OOS PASS och 81 forward trades.

Det gör release review effektiv.

## No Hidden Changes

Ingen materiell strategy-, risk- eller executionförändring ska gömmas inne i:

refactor

eller:

cleanup

Den ska identifieras explicit.

## Code Review and Tests

Material changes ska kunna verifieras genom:

- diff
- automated tests
- golden cases
- regression suite
Documentation och code måste stämma överens.

## Documentation Drift

Om code och canonical specification skiljer sig ska detta betraktas som:

DOCUMENTATION / IMPLEMENTATION DRIFT

Det måste lösas.

## Machine-Readable Canonical Config

På längre sikt ska centrala canonical regler finnas som versionsstyrd config som Strategy Engine använder direkt där detta är möjligt.

Det reducerar risken att bok och implementation glider isär.

## Human-Readable Canonical Specification

Boken och strategy specification förklarar:

- intention
- rationale
- definitions
- architecture
Machine config implementerar reglerna.

De kompletterar varandra.

## Atlas Governance Review

Atlas kan periodiskt sammanfatta:

- active canonical versions
- open candidates
- unresolved hypotheses
- recent incidents
- pending rule reviews
- known limitations
Detta blir en trading governance dashboard.

## Quarterly / Periodic Review

På längre sikt kan större systemreview genomföras periodiskt.

Den ska inte automatiskt ändra någonting.

Den ska identifiera:

- stale configs
- unresolved debt
- declining strategy
- new research
- security issues
## No Change is also a Decision

Om review visar att v1.0 fortfarande fungerar väl kan beslutet vara:

NO CHANGE

Detta ska kunna dokumenteras.

Kontinuerlig förbättring betyder inte kontinuerlig förändring.

## Stable Systems are Valuable

I ett system med verkligt kapital kan stabilitet vara mer värdefullt än konstant experimentation.

## Timeline

Omnira ska kunna visa en kronologisk trading-system timeline.

Exempel:

**2026-08**

Strategy v1.0 canonical

## 2026-10

Backtest baseline completed

## 2026-12

Demo RC1

## 2027-01

First Controlled Live

## 2027-05

v1.1 candidate rejected

## 2027-08

v1.2 promoted

Datumen ovan är endast exempel på hur en framtida timeline kan se ut, inte en planerad tidslinje.

## System Memory

Change History blir tillsammans med:

- Journal
- Analytics
- Research Registry
- Incident Registry
systemets långsiktiga tradingminne.

## Från Data till Wisdom

Flödet är:

```
Market Data
→ Events
→ Journal
→ Analytics
→ Findings
→ Lessons
→ Canonical Knowledge
```

Det är denna kedja som gör att Omnira blir bättre över tid.

## Den långsiktiga visionen

På lång sikt ska en ny utvecklare eller framtida Atlas kunna öppna Omnira och förstå:

- hur systemet fungerar idag
- hur det fungerade tidigare
- varför det förändrades
- vilka idéer som testades
- vilka incidenter som format architecture
- vilken evidens som stödjer aktuella rules
utan att behöva rekonstruera flera års historia från gamla chattar och lösa dokument.

## Systemet ska kunna förklara sig självt

Målet är att Atlas ska kunna svara:

Varför ser Trading System ut så här?

med ett svar som bygger på faktisk versionerad historik.

Inte på spekulation.

## Bokens roll efter v1.0

När denna bok är färdig fungerar den som grundläggande systemkonstitution.

Den definierar:

- vision
- strategy
- risk
- architecture
- data
- AI
- execution
- MT5
- testing
- prop firm
- journal
- analytics
- failure handling
- security
- deployment
- scaling
- evolution
Framtida canonical förändringar ska kunna uppdatera boken kontrollerat.

## Vad boken inte är

Boken är inte:

- bevis på att strategy är profitable
- tillstånd att gå live
- ersättning för tests
- ersättning för Risk Engine
- ett automatiskt mandate för Atlas
Den är systemets definierade grund.

Evidensen byggs därefter genom implementation och validation.

## Från bok till system

Efter boken går projektet vidare från:

**Design**

till:

**Implementation**

Men implementation ska fortfarande ske phase-gated.

Vi bygger inte allt på en gång.

## Canonical Implementation Order

Den övergripande ordningen är:

**Fas 0**

Specifications och architecture

```
→
```

## Fas 1

Trading Core

```
→
```

## Fas 2

MT5 Read Only

```
→
```

## Fas 3

Strategy Engine

```
→
```

## Fas 4

AI Analysis

```
→
```

## Fas 5

Risk Engine

```
→
```

## Fas 6

Manual Approval

```
→
```

## Fas 7

Demo Automation

```
→
```

## Fas 8

Backtest + Forward Validation

```
→
```

## Fas 9

Prop Firm Mode

```
→
```

## Fas 10

Controlled Live

Varje fas kräver verification innan nästa.

## Viktiga kvarvarande Specifications

Även med boken färdig finns detaljer som måste låsas innan relevant implementation.

Särskilt viktiga är:

- exakt deterministic iFVG detection
- exakt deterministic CISD detection
- equal-high/equal-low tolerance
- SMT correspondence rules där ytterligare precision krävs
- första market-data provider
- första news-data provider
- första faktiska PropFirmProfile
- exact promotion thresholds
- exact live safety policies
Dessa ska inte gissas inne i koden.

## Pattern Detection Specification

Entrykritiska visuella begrepp behöver ett eget machine-readable specificationarbete innan Strategy Engine implementeras.

Det gäller framför allt:

**iFVG**

och:

**CISD**

Detta är en kvarvarande implementation gate.

## Architecture Canonicalization

De separata Fas 0-dokumenten ska senare genomgå en contradiction review.

Vi ska då kontrollera att:

- Strategy
- Architecture
- Data Model
- Risk
- Prop
- Learning
- Security
inte motsäger varandra.

Först därefter ska architecturepaketet låsas som canonical.

## Trading Book Canonical Review

Även boken ska få en slutlig review.

Den ska kontrollera:

- chapter consistency
- terminology
- rule consistency
- version references
- unresolved questions
- accidental contradictions
## Canonical v1.0 Book Release

När review passerat kan hela boken paketeras som:

**Omnira Trading System – Från strategi till autonom exekvering – Canonical v1.0**

Den blir då den övergripande dokumentationsbasen inför implementation.

## Evolution efter Canonical v1.0

Canonical v1.0 är startpunkten för systemets faktiska evidenshistorik.

Därefter kommer:

- code
- tests
- data
- failures
- improvements
att avgöra hur framtida versioner ser ut.

## Den sista principen

Omnira Trading ska aldrig bli ett system som förändras utan minne.

Det ska vara ett system som:

```
Observerar
→ Dokumenterar
→ Mäter
→ Lär
→ Testar
→ Förändrar kontrollerat
→ Kommer ihåg varför
```

Det är skillnaden mellan en bot som bara exekverar trades och ett trading-system som kan utvecklas ansvarsfullt över många år.

## Kapitelstatus

Kapitel: 20 – Lärdomar och förändringshistorik

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Change history: Obligatorisk

Rejected candidates: Bevaras

Research Registry: Planerad

Incident lessons: Bevaras

Canonical promotion: Explicit och versionsstyrd

Rollback: Bevarar historik

Atlas self-improvement: Tillåtet

Atlas self-modification i production: Förbjudet

Boken: Grund för framtida Canonical v1.0

Nästa huvudsteg: Slutreview av boken och Fas 0-specifikationerna innan implementation

Omnira Trading System ska kunna bli bättre utan att förlora förståelsen för hur, när eller varför det förändrades.
