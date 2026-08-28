# Kapitel 1 – Vision

Omnira Trading System är visionen om ett trading-system där strategi, AI, risk, exekvering och lärande arbetar tillsammans i en sammanhängande och kontrollerad arkitektur.

Målet är inte att bygga en bot som bara hittar en signal och skickar en order.

Målet är att bygga ett system som kan:

- observera marknaden 
- identifiera en definierad strategi 
- förklara vad det ser 
- kontrollera risk 
- kontrollera prop firm-regler 
- skapa en tydlig trade proposal 
- exekvera endast när rätt behörighet finns 
- dokumentera hela processen 
- mäta resultat 
- lära från varje beslut 
- förbättras över tid utan att själv skriva om sina produktionsregler 
Den långsiktiga ambitionen är att Omnira ska kunna gå från analysverktyg till kontrollerad autonom trading utan att säkerhetsmodellen behöver byggas om längs vägen. Arkitekturen är därför redan från början uppdelad i separata lager med tydliga ansvarsområden. 

Den centrala visionen är:

Omnira Trading ska kunna bli mer intelligent och mer autonom över tid utan att bli mindre kontrollerbart.

## Från tradingbot till trading-system

En traditionell tradingbot kan förenklat beskrivas som:

```
Signal
→ Order
```

Omnira Trading ska medvetet vara mer avancerat än så.

Den canonical pipeline som systemet bygger på är:

```
Market Data
→ Strategy Engine
→ AI Analysis
→ Risk Engine
→ Prop Firm Rules Engine
→ Trade Proposal
→ Approval / Automation Policy
→ Execution Gateway
→ Execution Runner
→ Futures Execution Provider
→ Broker / Prop Firm
→ Journal & Analytics
```

Varje steg har ett eget ansvar och inget lager får hoppa över nästa säkerhetslager. 

Det innebär bland annat att:

En Strategy Signal inte är en order.

En AI Analysis är inte ett risktillstånd.

Ett Risk PASS är inte execution approval.

Ett Trade Proposal är inte en broker-order.

Execution är en separat privilegierad handling. 

## Atlas som tradingpartner

Atlas ska vara det intelligenta lagret ovanpå Omnira Trading.

Atlas ska inte vara en fristående AI-trader som fritt tittar på en chart och bestämmer vad som ska köpas eller säljas.

Istället ska Atlas få tillgång till strukturerade objekt från Trading Domain, exempelvis:

- market context 
- identified liquidity 
- FVG 
- Strategy Setup 
- Strategy Signal 
- Risk Decision 
- Prop Decision 
- Trade Proposal 
- position state 
- journal 
- performance 
Atlas kan därefter hjälpa användaren att förstå vad systemet ser och varför.

AI:n får förklara, sammanfatta, jämföra och analysera. Den får däremot inte kringgå Strategy Engine, Risk Engine eller Prop Firm Rules Engine. 

## Ett transparent system

Omnira Trading ska inte vara en svart låda.

Användaren ska kunna se:

- vad systemet bevakar 
- vilken 4H-thesis som är aktiv 
- vilken liquidity som är relevant 
- vilka FVG-zoner som används 
- om manipulation har inträffat 
- vilken 1m-confirmation som saknas eller finns 
- setup grade 
- planerad entry 
- technical stop loss 
- target 
- R:R 
- risk 
- prop firm-status 
- execution-status 
- aktuell position 
- break-even-status 
- slutresultat 
Denna transparens ska visualiseras genom en TradingView-liknande Atlas Market View.

Chart UI är dock endast en visualisering.

Tradinglogiken ska ligga i backendens strukturerade systemstate och inte återskapas av chart-komponenten. 

## Vad Atlas ser

En av visionens viktigaste delar är att användaren ska kunna se samma tradingstruktur som Strategy Engine använder.

Om systemet exempelvis identifierar:

- selected 10:00 4H-open 
- liquidity under price 
- en aktiv 15m FVG 
- manipulation nedåt 
- iFVG + CISD på 1m 
- ingen SMT 
ska användaren kunna se dessa objekt direkt i Atlas Market View.

Atlas ska sedan kunna förklara:

Manipulationen mot 15m FVG är genomförd. iFVG och CISD har bekräftats på 1m. SMT saknas, vilket ger setup grade A. Technical stop ligger under manipulationens senaste giltiga swing low och första giltiga liquidity target erbjuder minst 2R.

Detta är den typ av interaktion som ska göra Atlas till en faktisk tradingpartner snarare än bara ett generiskt AI-chattfönster. 

## Den första strategin

Den första canonical strategin i systemet är:

**Omnira Liquidity Manipulation – Canonical v1.0**

Den första valideringen ska ske på:

- NQ 
- MNQ 
med ES som comparison instrument för SMT. 

Strategin söker efter manipulation från utvalda 4H-candles mot tidigare identifierad liquidity eller Fair Value Gap på 5–15 minuter.

Efter manipulationen söker systemet reversal-confirmation på 1m genom:

- iFVG 
- CISD 
- eller båda 
SMT mellan NQ och ES används som extra confirmation men är inte obligatoriskt för en giltig trade. 

Detta är den första strategin.

Arkitekturen ska däremot stödja flera framtida strategier utan att Risk Engine, execution, journal eller övriga kärnlager måste byggas om. 

## Strategin är en hypotes

Canonical betyder inte att strategin är bevisat lönsam.

Canonical betyder att reglerna är tillräckligt låsta för att implementeras och testas konsekvent.

Strategins grundhypotes är att en manipulation mot relevant liquidity eller FVG, följd av definierad reversal-confirmation, kan ha positiv expectancy mot nästa giltiga liquidity target.

Detta måste bevisas eller förkastas genom data. 

Därför är Omnira Trading inte byggt kring antagandet:

Strategin fungerar.

Systemet ska istället fråga:

Kan vi visa att strategin fungerar tillräckligt robust för att förtjäna större authority och större kapitalrisk?

## Risk före automation

Omnira Trading ska prioritera:

```
säkerhet
→ testbarhet
→ datakvalitet
→ risk
→ strategi
→ automation
→ skalning
```

Den prioriteringsordningen är en del av systemarkitekturen. 

Det innebär att systemet inte får börja med automation och därefter försöka lägga till säkerhet.

Safety måste finnas före execution.

## Risk Engine som självständigt veto

Risk Engine ska vara deterministisk och stå över Strategy Engine och Atlas.

En setup kan vara:

A+

och Atlas kan bedöma den som mycket stark.

Men om Risk Engine säger:

```
DENY
```

blir slutresultatet:

**NO TRADE**

Risk får inte mjukas upp av AI-confidence eller subjektiv optimism. 

## Den första riskbaslinjen

Den första definierade riskbaslinjen innehåller:

Max risk per trade: $150

Max daily loss: $450

Max open positions: 1

Max attempts per 4H-thesis: 3

Technical stop loss får inte flyttas för att pressa in en trade i riskbudgeten.

Om minsta handlingsbara position innebär större risk än tillåtet ska traden nekas. 

Riskreglerna ska ligga utanför Strategy Engine och kunna versionshanteras separat.

## Prop firm som separat kontrollager

Ett av Omnira Tradings viktigaste framtida användningsområden är prop firm-trading.

Därför räcker det inte med intern risk.

Prop firm-regler ska ligga i ett separat:

**Prop Firm Rules Engine**

Detta lager ska kunna modellera externa regler såsom:

- daily loss 
- maximum loss 
- trailing drawdown 
- static drawdown 
- minimum trading days 
- consistency 
- position limits 
- news restrictions 
- holding restrictions 
- instrument restrictions 
- nätverks-/VPS-/VPN-policy där relevant 
Varje prop firm-program ska representeras som en separat versionsstyrd profil eftersom olika program kan ha helt olika regler. 

Om intern Risk Engine säger ALLOW men Prop Firm Engine säger DENY blir resultatet:

**NO TRADE**

## Fail Closed

En av de viktigaste säkerhetsprinciperna i hela systemet är:

**UNKNOWN ≠ SAFE**

Om systemet inte vet om en kritisk state är säker ska nya trades blockeras.

Exempel:

- stale market data 
- stale account state 
- Risk Engine unavailable 
- unknown position 
- unknown prop state 
- fel konto 
- runner unavailable 
- news state unknown 
ska inte tolkas som tillstånd att handla. 

## Marknadsdata före beslut

Market Data Layer ska vara systemets canonical källa för normaliserad tradingdata.

Strategy Engine ska inte direkt kommunicera med flera providers och försöka tolka olika format.

Flödet ska istället vara:

```
External Data Source
→ Market Data Adapter
→ Validation
→ Normalization
→ Canonical Market Data
→ Strategy Engine
```

Det gör datakvalitet till en explicit safety boundary. 

Om kritisk data är fel, stale eller ofullständig får systemet inte skapa exekverbart state.

## Samma verklighet i backtest och live

En central vision är att samma Strategy Engine i möjligaste mån ska kunna användas i:

- backtest 
- replay 
- realtime analysis 
- demo 
- live 
Skillnaden ska huvudsakligen ligga i data- och execution adapters.

Backtest ska alltså inte innehålla en förenklad “snällare” version av strategin. 

Detta gör att vi senare kan fråga:

Vad hade Strategy v1.0 faktiskt beslutat här, med endast den information som fanns vid den tidpunkten?

## No Look-Ahead

Systemet får aldrig använda framtida information för historiska beslut.

En swing som kräver nästa candle för confirmation får inte existera innan den efterföljande candle faktiskt är tillgänglig.

Samma princip gäller entrykritiska patterns och candle closes. 

Detta är avgörande för att backtestresultat ska vara trovärdiga.

## Forward testing som verklighetskontroll

Efter historisk testing måste systemet möta tiden framåt.

Forward testing ska bevisa både:

**strategin**

och:

**systemet runt strategin**

i realtime. 

Den första progressionen är:

```
Analysis Only
→ Shadow Mode
→ Demo Manual Approval
→ Demo Automation
```

Ingen av dessa faser ska hoppas över bara för att backtestet ser starkt ut. 

## Analysis Only först

Det första realtime-målet är inte att skicka orders.

Målet är att visa att Omnira kan observera marknaden, följa Canonical Strategy v1.0, dokumentera varje beslut och producera reproducerbart beteende utan execution. 

Detta är viktigt eftersom vi först måste kunna lita på vad systemet ser innan vi låter det påverka ett konto.

## Futures Connectivity (Read Only) först

Samma filosofi gäller providern.

Omnira ska först kunna läsa:

- account 
- balance 
- equity 
- market data 
- orders 
- positions 
- historical orders 
- deals 
innan orderläggning aktiveras. 

Principen är:

Omnira ska först lära sig att observera providern korrekt innan systemet får rätt att påverka providern.

## Execution separeras från intelligens

Execution Runner ska vara liten och deterministisk.

Den ska inte tänka.

Den ska:

- verifiera 
- exekvera 
- rapportera 
- reconcila 
Den ska endast acceptera strukturerade Execution Intents som redan passerat systemets authority chain. 

Strategy Engine ska aldrig direkt kalla providerns orderfunktioner.

Atlas ska aldrig själv formulera en naturlig språkinstruktion till brokern.

## Initial executionmiljö

Den första executionmiljön ska vara en separat Execution Runtime kopplad till providern.

Arkitekturen ska vara location-agnostic så att runnern senare kan flyttas till en VPS utan att Strategy Engine, Risk Engine eller Omnira UI behöver byggas om. 

Den initiala Windows-miljön är alltså en deploymenttarget.

Den är inte en permanent arkitekturbegränsning.

## Broker state är verklig exposure

När execution väl aktiveras ska Omnira skilja mellan:

**Expected State**

och:

**Observed Broker State**

Om Omnira tror att inga positions finns men providern visar en position ska systemet inte gissa.

Det ska gå till:

```
RECONCILIATION_REQUIRED
```

och blockera ny execution. 

Detta är avgörande eftersom brokern är source of truth för faktisk market exposure.

## Journalen som systemets minne

Omnira Trading ska inte bara spara vinnare och förlorare.

Systemet ska dokumentera hela beslutskedjan.

Det inkluderar:

- setups 
- signals 
- AI analysis 
- riskbeslut 
- prop firm-beslut 
- proposals 
- approvals 
- execution intents 
- orders 
- fills 
- positions 
- management events 
- exits 
- technical incidents 
- denied trades 
- missed setups 
Tradingjournalen ska göra det möjligt att förstå varför systemet fattade ett visst beslut. 

## Nekade trades är också data

Om Risk Engine nekar en A+-setup är det fortfarande värdefull information.

Systemet ska kunna analysera:

Hur utvecklades setups som vi korrekt nekade?

Detta skapar counterfactual research utan att skriva om det faktiska beslut som togs. 

## Performance handlar om mer än profit

Omnira Trading ska inte utvärdera systemet enbart med:

Hur mycket pengar tjänade vi?

Analytics ska bland annat mäta:

- expectancy 
- Profit Factor 
- R 
- maximum drawdown 
- losing streak 
- MFE 
- MAE 
- session 
- setup grade 
- attempt 
- liquidity type 
- SMT 
- execution quality 
- slippage 
- latency 
- sample size 
Performance ska alltid visas tillsammans med relevant kontext och strategy version. 

## Edge före skalning

En snygg equity curve är inte tillräcklig.

Systemet ska försöka avgöra om resultatet är:

- robust 
- reproducerbart 
- stabilt 
- out-of-sample-kompatibelt 
- realistiskt efter costs 
- rimligt över flera market regimes 
Backtesting ska därför försöka motbevisa edge snarare än bekräfta den. 

## Self-Improvement

Den långsiktiga visionen är att Atlas inte bara ska analysera dagens trade.

Systemet ska kunna lära från historiken.

Journal och Analytics ska kunna skapa:

```
Findings
→ Hypotheses
→ Candidate Versions
```

Atlas ska exempelvis kunna upptäcka:

Attempt 3 har betydligt lägre expectancy.

och föreslå:

Testa en candidate med max två attempts.

Men detta är endast research.

Productionregeln ändras inte automatiskt.

## Learning får vara snabbare än deployment

En central framtida governanceprincip är att Atlas ska kunna lära kontinuerligt utan att production förändras lika snabbt.

En candidate ska kunna gå genom:

```
Hypothesis
→ Backtest
→ Out-of-Sample
→ Forward Test
→ Review
→ Approval
→ Canonical
```

innan den får påverka live trading.

Rejected candidates ska också bevaras så att systemet inte glömmer vilka idéer som redan testats. 

## Atlas ska kunna utveckla kunskap – inte ge sig själv authority

AI får skapa:

- observations 
- findings 
- hypotheses 
- candidateförslag 
- explanations 
AI får inte själv:

- höja risk 
- ändra canonical Strategy 
- ändra Prop rules 
- aktivera live automation 
- kringgå kill switches 
- ge sig själv execution permission 
Detta är en grundläggande boundary för framtida autonomi.

## Autonomi är ett privilegium

Omnira ska inte starta i autonomt läge.

Autonomi ska förtjänas genom dokumenterade gates.

Systemet ska kunna röra sig genom tydliga operation modes, från analysis och read-only till demo, manual live och slutligen Controlled Live Automation. 

Högre autonomi innebär inte automatiskt högre risk.

## Live är inte slutmålet

När Omnira når live trading börjar en ny valideringsfas.

Den första livefasen ska vara:

**Live Read Only**

och därefter:

**Live Manual Approval**

innan Controlled Live Automation övervägs. 

Den första live-traden ska behandlas som ett systemtest, inte som starten på maximal kapitalanvändning.

## Minimal risk först

Live deployment ska börja med mycket liten praktisk kapitalrisk.

Målet är att bevisa att:

- real fills fungerar 
- real SL/TP fungerar 
- risk fungerar 
- prop compliance fungerar 
- journal fungerar 
- reconciliation fungerar 
- infrastructure är stabil 
innan större risk används. 

## Skalning måste förtjänas

Omnira ska aldrig automatiskt höja risk efter en winning streak eller en bra månad.

Uppskalning ska ske efter dokumenterad evidens.

Kapitaluppskalning och autonomiuppskalning ska dessutom behandlas som två separata dimensioner. 

Systemet ska kunna bli mer autonomt utan att öka risk.

Och det ska kunna öka kapital under fortsatt manual approval.

## Safety före profit

Ett system kan vara lönsamt och ändå vara tekniskt farligt.

Exempel:

+20R

men:

- duplicate orders 
- wrong account 
- missing SL 
är inte ett godkänt system.

Zero-tolerance safety failures ska kunna blockera vidare scaling oavsett profit. 

## Kill switches

Systemet ska ha flera nivåer av kill switch:

- Global 
- Account 
- Strategy 
- Instrument 
- Runner 
Aktiv relevant kill switch ska stoppa ny execution. 

Kill switch ska däremot hållas separat från Emergency Close.

Att stoppa nya trades och att tvångsstänga befintlig exposure är två olika actions.

## Security by design

Trading-systemet ska byggas enligt least privilege.

Atlas behöver inte broker credentials.

Analytics behöver inte orderbehörighet.

Strategy Engine behöver inte kunna exekvera.

Frontend ska inte kunna tala direkt med providern.

Execution Runner ska endast kunna göra det den explicit auktoriserats att göra. 

Ju mindre authority varje komponent har, desto mindre skada kan ett enskilt fel orsaka.

## Failure är förväntat

Omnira ska designas utifrån att:

- nätverk kommer falla 
- providern kommer disconnecta
- providers kommer ge problem 
- processer kommer krascha 
- brokers kan neka orders 
- data kan vara stale 
- AI kan ha fel 
Systemets kvalitet avgörs därför inte endast när allt fungerar.

Det avgörs också av hur systemet beter sig när något går fel. 

## Recovery före återstartad trading

Efter failure ska progressionen vara:

```
FAILURE DETECTED
→ BLOCK
→ RECONNECT / RESTART
→ RESYNC
→ RECONCILE
→ VERIFY
→ READY
```

Inte:

```
FAILURE
→ RESTART
→ TRADE
```

Detta är en central safetyprincip.

## Omnira Trading som lärande system

När alla dessa delar kombineras blir Omnira mer än en executionbot.

Systemet får ett långsiktigt minne genom:

- Trading Journal 
- Analytics 
- Research Registry 
- Incident Registry 
- Change History 
Det ska kunna komma ihåg både:

- vad som fungerade 
- vad som inte fungerade 
- vad som nekades 
- vad som ändrades 
- varför det ändrades 
Detta är grunden för ansvarsfull self-improvement.

## Den långsiktiga målbilden

Den långsiktiga målbilden är ett system där användaren kan öppna Omnira Trading och direkt förstå:

**Vad ser Atlas?**

## Vilken marknadsstruktur bevakas?

## Finns en giltig setup?

## Vad saknas?

## Vilken trade planeras?

## Hur stor är risken?

## Tillåter prop firm-reglerna traden?

## Vad har hänt tidigare i liknande situationer?

## Vilka systemhälsoproblem finns?

och när systemet väl är tillräckligt validerat:

**Får Omnira exekvera detta automatiskt?**

## Från information till handling

Visionen kan sammanfattas som:

```
Observe
→ Understand
→ Validate
→ Control Risk
→ Authorize
→ Execute
→ Measure
→ Learn
→ Improve
```

Det är den cykel som Omnira Trading System ska bygga.

## Vad framgång betyder

Framgång för projektet är inte bara:

Systemet tjänade pengar.

Ett framgångsrikt Omnira Trading System ska också kunna visa att:

- strategin har mätbar edge 
- risk är kontrollerad 
- prop firm-regler följs 
- execution är tillförlitlig 
- systemfel upptäcks 
- trades är auditerbara 
- performance är reproducerbar 
- förbättringar testas innan production 
- autonomi kan stoppas 
- historiken kan förklaras 
Detta är en högre standard än för en vanlig tradingbot.

Det är också den standard som behövs om systemet senare ska få större authority över verkligt kapital.

## Kapitelstatus

Kapitel: 1 – Vision

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Systemmål: Kontrollerad utveckling från analys till autonom execution

Primär strategi: Omnira Liquidity Manipulation – Canonical v1.0

Primär valideringsmarknad: NQ / MNQ

AI: Beslutsstöd och learning, inte självständig execution authority

Risk: Separat deterministiskt veto

Prop Firm Rules: Separat compliance-veto

Execution: Isolerad och privilegierad

Journal: Hela beslutsprocessen

Self-improvement: Tillåten research, förbjuden direkt production self-modification

Autonomi: Förtjänas genom dokumenterade gates

Live: Inte godkänt utan föregående validation

Omnira Trading System ska byggas för att kunna bli mer autonomt över tid utan att förlora kontroll, transparens eller säkerhet.
