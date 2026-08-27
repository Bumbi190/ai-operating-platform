# Kapitel 4 – Riskhantering

Omnira Trading System är byggt utifrån principen att en tradingstrategi aldrig får stå över riskkontrollen.

Strategin kan identifiera en setup. Atlas kan analysera den. Systemet kan bedöma att sannolikheten ser god ut. Men inget av detta innebär att traden får tas.

Risk Engine har alltid sista ordet.

Detta är en central säkerhetsprincip i hela Omnira Trading System.

## Risk Engine står över AI och strategi

Risk Engine är deterministisk och regelstyrd.

Den ska inte försöka förutsäga marknaden och den ska inte påverkas av AI-confidence, känslor, winning streaks eller tidigare förluster.

Om Strategy Engine exempelvis identifierar en A+-setup och Atlas bedömer marknadskontexten som mycket stark, men Risk Engine upptäcker att dagens tillåtna risk redan är förbrukad, ska resultatet alltid vara:

**TRADE DENIED**

Ingen AI-modell får kunna kringgå detta beslut.

## Initial riskmodell

Den första versionen av Omnira Trading använder följande interna riskbaseline:

- max risk per trade: $150
- max daily drawdown: $450
- max öppna positioner: 1
- max tre attempts per 4H-thesis
- ingen extra losing-streak-regel
- ingen separat max trades-per-day
- inget spread-filter
- ingen separat intern total drawdown-gräns
- ingen separat margin utilization-gräns
Dessa regler är inte avsedda att vara universella för alla framtida konton.

Riskparametrarna ska vara konfigurerbara och versionsstyrda.

## Risk per trade

Den tekniska stop lossen bestäms av strategin.

Risk Engine får därefter använda:

- entry
- stop loss
- tick size
- tick value
- contract specification
- minsta handlingsbara position
för att beräkna hur stor position som är tillåten.

Risk Engine får aldrig flytta den tekniska stop lossen närmare entry enbart för att få positionen att passa riskbudgeten.

Om den minsta möjliga positionen riskerar mer än $150 ska traden nekas.

Principen är:

Anpassa positionen efter risken. Anpassa aldrig den tekniska risken efter önskad position.

## Daily drawdown

Den interna Omnira-regeln är:

**max $450 realiserad förlust per tradingdag.**

Detta innebär att den interna daily loss-beräkningen baseras på realiserade förluster.

Floating P/L används inte som den interna Omnira daily-loss-mätaren.

Detta ska inte förväxlas med regler hos en prop firm.

En prop firm kan exempelvis använda equity-baserad drawdown och därmed inkludera öppna förluster.

Prop Firm Rules Engine hanterar dessa regler separat.

En trade måste därför kunna passera både:

**Internal Risk Engine**

och:

**Prop Firm Rules Engine**

Om något av systemen nekar traden får den inte exekveras.

## Reserved risk

Att dagsmätaren är realiserad betyder inte att en ny trade får ta hela den återstående
budgeten i anspråk utan kontroll.

Innan en ny trade tillåts ska dess möjliga initiala risk reserveras mot återstående
dagsbudget:

```
realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

Exempel:

```
realized_daily_loss = $300
daily_loss_limit    = $450
daily_remaining     = $150

ny trade risk = $128  → passerar denna regel
ny trade risk = $151  → DENY
```

Reserved risk är en **pre-entry-kontroll**. Den ändrar inte definitionen av realiserad
daily loss, och den skriver inte in något i dagsmätaren. Den avgör bara om en ny trade
får öppnas.

Reservationen frisläpps när traden stängs. Det faktiska utfallet, vinst eller förlust,
bokförs då mot den realiserade mätaren.

## Daily reset

Den interna daily risk-budgeten återställs vid:

**00:00 America/New_York**

Detta är den canonical tradingdagen för den interna riskmodellen.

Systemet får inte använda serverns lokala timezone som implicit daily-reset.

## Daily stop

När:

```
realized_daily_loss >= $450
```

ska följande gälla:

- inga nya trades tillåts
- risk state blir **BLOCKED / DAILY_STOP**
- execution av nya intents blockeras
- state är persistent över restart
- trading förblir blockerad till nästa canonical reset
- ett audit event skapas

Risk Engine ska visa kontot som blockerat för nya entries fram till nästa daily reset.

En daily stop ska inte kunna återställas genom att ladda om UI:t.

Detta är en explicit riskregel och inte en frivillig rekommendation.

## Ingen intern floating force-close

Den interna dagsregeln stänger **inte** en redan öppen position.

Eftersom Omniras interna mätare endast räknar realiserade förluster, och strategin tillåter
högst en öppen position, kan den interna gränsen inte brytas av en position som fortfarande
är öppen. Att införa en intern tvångsstängning baserad på floating P/L skulle motsäga
realized-only-modellen.

En redan öppen position hanteras därför vidare genom sina övriga giltiga regler:

- teknisk stop loss
- take profit
- canonical break-even
- London window-close break-even 05:00
- news exit
- New York time exit
- emergency- och safety-kontroller
- Prop Firm Rules

Om ett aktivt PropFirmProfile använder equity-, floating- eller trailingbaserade gränser och
kräver en tidigare skyddsåtgärd gäller den striktare prop-regeln. Intern risk och prop
firm-risk hålls fortsatt separata.

Att stoppa nya trades och att tvångsstänga befintlig exponering är två olika actions.

## Max tre attempts per 4H-thesis

Omnira Liquidity Manipulation tillåter maximalt tre attempts på samma 4H-thesis.

Detta betyder inte att tre trades alltid är tillåtna.

Varje attempt måste fortfarande passera Risk Engine.

Exempel:

Attempt 1 förlorar $150.

Attempt 2 förlorar $150.

Dagens realiserade förlust är då $300.

Om nästa giltiga setup kräver mer än återstående $150 i tillåten daily risk ska traden nekas, även om det fortfarande är det tredje möjliga attemptet.

Attempt-limit och risk-budget är två separata regler.

Båda måste passera.

## Re-entry är inte martingale

Re-entry efter en förlust innebär inte att risk ska höjas.

Varje nytt attempt använder samma riskregler.

En tidigare förlust får aldrig automatiskt motivera större position size på nästa trade.

Omnira Trading ska inte använda martingale som standardprincip.

## En öppen position åt gången

Den första strategiversionen tillåter endast en öppen position åt gången.

Detta förenklar:

- riskberäkning
- exposure
- reconciliation
- journaling
- prop firm-kontroll
Om MT5 visar en position som Omnira inte känner till ska systemet behandla detta som en säkerhetsincident.

Ny trading ska blockeras tills positionen har identifierats och systemets state är reconciled.

## Hard limits och mänsklig override

Ett Risk DENY ska inte ha en vanlig:

**Trade anyway**

-knapp.

Om en riskregel ska förändras ska själva Risk Profile ändras genom en kontrollerad och versionsstyrd process.

Detta säkerställer att Risk Engine inte reduceras till en rekommendation som kan ignoreras när användaren känner starkt för en trade.

## Fail closed

När Risk Engine inte kan avgöra om en trade är säker ska standardresultatet vara:

**DENY**

Exempel:

- account data är gammal
- market data är gammal
- instrumentmetadata saknas
- tick value är okänd
- position state är okänd
- riskkonfigurationen är felaktig
- kill switch är aktiv
- execution runner är offline
- broker connection är osäker
Systemet får aldrig tolka avsaknad av information som att trading är tillåten.

## Kill switch

Omnira Trading ska stödja flera nivåer av kill switch:

- global
- konto
- strategi
- instrument
- execution runner
Aktiv kill switch blockerar ny execution.

Kill switch ska vara synlig i Omnira Trading UI.

## Risk i Atlas Market View

Risk Engine ska vara visuellt tydligt inne i Omnira.

Användaren ska kunna se exempelvis:

- risk per trade
- risk i procent
- quantity
- daily loss used
- daily loss remaining
- attempts used
- max attempts
- öppna positioner
- kill switch-status
- Risk Engine-resultat
En setup kan därför visuellt visa:

**Strategy Engine: PASS**

## Risk Engine: DENY

Det ska direkt gå att förstå varför systemet inte får ta traden.

## Prop firm-risk är separat

Omnira ska inte hårdkoda en enda prop firms regler som systemets globala riskmodell.

Varje prop firm och challenge ska kunna ha en egen versionsstyrd regelprofil.

Exempel på regler som Prop Firm Rules Engine senare måste kunna hantera är:

- daily loss
- maximum loss
- static drawdown
- trailing drawdown
- equity-based drawdown
- reset-tider
- challenge-regler
- news restrictions
- holding restrictions
- consistency rules
Den striktaste tillåtna gränsen mellan intern risk och prop firm-risk ska vinna.

## Risk och self-improvement

Atlas ska kunna analysera Risk Engines historiska beslut.

Det innebär bland annat att systemet senare kan mäta:

- hur många trades som nekats
- varför trades nekats
- hur nekade trades senare utvecklades
- hur olika riskprofiler hade påverkat performance
- hur risk påverkat drawdown och expectancy
Atlas får därefter skapa hypoteser och föreslå förbättringar.

Atlas får inte själv ändra riskprofilen live.

Ett förbättringsförslag måste behandlas som en ny kandidatversion som testas och godkänns innan den kan bli canonical.

## Den centrala riskprincipen

Risk Engine finns inte för att maximera vinsten.

Risk Engine finns för att begränsa skadan när något annat i systemet har fel.

Strategin kan ha fel.

Atlas kan ha fel.

Market data kan ha fel.

Execution kan misslyckas.

Marknaden kan bete sig på ett sätt som aldrig tidigare observerats.

Därför ska systemet byggas utifrån antagandet att fel förr eller senare kommer att inträffa.

Risk Engine ska begränsa konsekvenserna när de gör det.

## Kapitelstatus

Kapitel: 4 – Riskhantering

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Revision: 2026-08-27 – reserved risk och daily stop gjorda explicita, intern floating force-close borttagen

Max risk per trade: $150

Intern daily loss: $450, realized only

Daily reset: 00:00 America/New_York

Reserved risk: Pre-entry-kontroll, ändrar inte realiserad mätare

Intern floating force-close: Finns inte

Max öppna positioner: 1

Max attempts per 4H-thesis: 3

Human override av hard risk DENY: Finns inte

Prop firm-risk: Separat lager, striktaste gräns vinner
