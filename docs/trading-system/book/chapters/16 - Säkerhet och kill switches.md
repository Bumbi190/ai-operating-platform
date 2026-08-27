# Kapitel 16 – Säkerhet och kill switches

Säkerhet i Omnira Trading System handlar inte endast om att skydda lösenord eller API-nycklar.

Det handlar om att begränsa vad varje komponent får göra, hur ett beslut får förvandlas till en order och hur systemet stoppas när något inte längre är säkert.

Ett trading-system som kan exekvera orders måste betraktas som ett privilegierat system.

Därför ska säkerhetsarkitekturen bygga på:

- least privilege
- explicit authorization
- environment separation
- account verification
- allowlists
- immutable audit
- fail closed
- kill switches
- recovery och reconciliation
Den centrala principen är:

Ingen komponent ska få större behörighet än den behöver för sin uppgift.

## Säkerhet som authority architecture

Omnira Trading ska inte bygga säkerheten kring en enda stor:

AUTHORIZED = true

Istället ska authority vara uppdelad.

Exempel:

Strategy Engine får:

- läsa market data
- skapa Strategy Signal
Atlas får:

- läsa trading state
- skapa analys
- skapa explanations
- föreslå hypotheses
Risk Engine får:

- bedöma risk
- neka trade
Prop Firm Rules Engine får:

- bedöma compliance
- neka trade
Execution Gateway får:

- verifiera execution authority
- skapa Execution Intent
Execution Runner får:

- läsa MT5
- exekvera endast godkända intents
Ingen komponent ska ensam kunna gå från idé till broker-order.

## Least Privilege

Varje service ska endast ha den behörighet den behöver.

Exempel:

Analytics behöver inte kunna skicka orders.

Atlas Learning Layer behöver inte ha MT5 credentials.

Frontend behöver inte ha broker access.

Strategy Engine behöver inte ha order submission capability.

Execution Runner behöver inte kunna ändra strategy rules.

Detta minskar blast radius om en komponent innehåller:

- bug
- kompromettering
- felkonfiguration
## Separation of Duties

Systemet ska använda flera kontrollpunkter.

Exempel:

**Strategy Engine**

säger:

VALID SETUP

Risk Engine säger:

```
ALLOW
```

Prop Firm Engine säger:

```
ALLOW
```

Approval Policy säger:

```
AUTHORIZED
```

Execution Gateway säger:

VALID INTENT

Runner verifierar:

VALID ACCOUNT + VALID ENVIRONMENT

Först därefter får broker request skapas.

## Atlas får inte ha broker credentials

Atlas ska aldrig behöva känna till:

- MT5 login password
- broker API secrets
- execution secrets
- signing keys
AI-systemet ska få strukturerade tradingobjekt.

Inte credentials.

## Secrets ska hållas utanför prompts

Credentials får inte skickas i:

- AI prompts
- logs
- frontend state
- analytics payloads
- screenshots
Atlas behöver exempelvis veta:

```
account = PROP_ACCOUNT_01
```

inte dess faktiska login password.

## Secret Storage

Secrets ska lagras i en dedikerad secret storage-mekanism.

Exakt teknik beslutas vid implementation.

Kraven är:

- encrypted storage
- access control
- environment separation
- rotation capability
- audit
- inga secrets i Git
## Git och Credentials

Inga credentials får committas.

Det gäller:

- .env
- config files
- example scripts
- test fixtures
- screenshots
- logs
Repository scanning ska senare kunna leta efter möjliga secrets.

## Demo och Live isoleras

Demo och live ska behandlas som separata security domains.

De ska ha separata:

- accounts
- credential references
- environment configuration
- execution permissions
- audit context
En demo deployment får inte kunna falla tillbaka till live credentials.

## Default Environment

Default ska vara:

```
NON_LIVE
```

Ny installation eller ny runner ska alltså inte få live execution capability automatiskt.

## Live Enablement

Live execution ska kräva explicit activation.

Denna activation ska vara separat från att koden råkar innehålla en Execution Adapter.

Det ska inte gå:

deploy code

```
→
```

live trading accidentally enabled

## Environment Verification

Execution Runner ska verifiera environment mot account.

Exempel:

Intent:

```
DEMO
```

Account:

```
LIVE
```

Resultat:

```
ENVIRONMENT_MISMATCH
→
DENY
```

## Environment Lock

När en runner är provisionerad för en viss environment bör dess permissions begränsa vilka accounts den kan använda.

Exempel:

Runner DEMO-01

får endast använda demo accounts.

Detta är starkare än att förlita sig på en runtime flag.

## Account Allowlist

Varje runner ska ha en explicit allowlist.

Exempel:

```
allowed_accounts = [ACCOUNT_01]
```

Om MT5 visar:

```
ACCOUNT_02
```

Resultat:

```
ACCOUNT_NOT_ALLOWED
```

Ingen execution.

## Account Identity Verification

Account verification ska ske:

- vid startup
- efter reconnect
- före execution
- när account state förändras oväntat
Systemet ska aldrig anta att samma MT5-terminal alltid har samma account aktivt.

## Instrument Allowlist

Execution ska också kunna begränsas till vissa instrument.

I första fasen kan allowlist exempelvis vara:

```
MNQ
```

Det innebär att ett felaktigt execution intent för:

```
BTCUSD
```

eller:

ES

inte kan exekveras även om brokern erbjuder instrumentet.

## Contract Allowlist

För futures räcker inte alltid canonical instrument.

Systemet ska kunna verifiera rätt:

- exchange
- contract
- expiry
Det skyddar mot fel rollover mapping.

## Strategy Allowlist

En live runner kan också begränsas till specifika StrategyVersion IDs.

Exempel:

Omnira Liquidity Manipulation v1.0

En candidate:

v1.1-candidate

ska inte kunna exekveras i live environment.

## Candidate är inte Production

Candidate versions ska tekniskt behandlas som icke-produktionsgodkända.

De får användas i:

- backtest
- research
- shadow
- forward test
men inte live execution innan canonical promotion.

## Risk Profile Binding

Varje live account ska ha explicit aktiv RiskProfile version.

Execution får inte använda:

latest risk profile

dynamiskt.

Den ska använda:

approved risk profile version X

## Prop Profile Binding

Samma princip gäller PropFirmProfile.

Live-account ska referera till en specifik versionsstyrd profil.

## Signed Execution Intents

Execution Intent bör autentiseras så att runnern kan verifiera:

- att requesten kommer från rätt Omnira-miljö
- att innehållet inte ändrats
- att requesten är aktuell
Det kan göras genom kryptografisk signering eller motsvarande autentiserad mekanism.

Exakt implementation beslutas senare.

## Intent Integrity

Runnern ska kunna verifiera kritiska fields såsom:

- execution ID
- account
- instrument
- quantity
- direction
- SL
- TP
- expiry
- environment
Om payload förändrats efter authorization ska requesten nekas.

## Intent Expiry

Även en korrekt signerad request ska kunna vara för gammal.

valid signature

är inte samma sak som:

valid trade

Expiry måste verifieras separat.

## Replay Protection

En tidigare korrekt Execution Intent får inte kunna spelas upp senare.

Protection ska använda:

- unique ID
- idempotency
- expiry
- processed state
## Authentication

Runner och Omnira ska endast kommunicera via autentiserade channels.

En lokal process eller extern klient ska inte kunna skicka trading requests utan korrekt identity.

## Authorization

Authentication besvarar:

Vem är du?

Authorization besvarar:

Vad får du göra?

Båda behövs.

En autentiserad Analytics-service får fortfarande inte ha rätt att skicka orders.

## Transport Security

Kommunikation mellan Omnira och runner ska vara krypterad.

Detta gäller särskilt om runnern senare körs:

- på annan dator
- över internet
- på VPS
## Local Network är inte automatiskt Trusted

Även om runnern initialt står i samma hemnätverk ska systemet inte förlita sig på:

Den som är på LAN får handla.

Execution requests ska fortfarande autentiseras.

## Network Exposure

Runnerns attack surface ska hållas så liten som möjligt.

Den ska inte exponera:

- onödiga ports
- debug interfaces
- admin endpoints
mot internet.

**VPN**

VPN kan användas om broker/prop policy tillåter det.

Men VPN är inte i sig en säkerhetsmodell.

Application-level authentication och authorization krävs fortfarande.

**VPS**

Samma princip gäller framtida VPS.

En VPS kan öka uptime men skapar också en internetansluten host som måste skyddas.

## Operating System Hardening

Windows-runnern ska senare ha en deployment baseline.

Exempel:

- uppdaterat OS
- minimerade onödiga services
- firewall
- restricted user account
- disk encryption där lämpligt
- automatic security updates enligt kontrollerad policy
## Dedicated Trading Host

Den initiala executiondatorn bör så långt det är praktiskt användas som dedikerad tradinghost när execution aktiveras.

Ju fler okontrollerade program som körs på samma host, desto större risk för:

- crashes
- malware
- resource exhaustion
- accidental interference
## Administrator Privileges

Runnern ska inte köras med full administrator authority om detta inte krävs.

Least privilege gäller även på operativsystemsnivå.

## MT5 Credentials

MT5 credentials ska endast finnas där de faktiskt behövs.

Idealt är det runner/terminalmiljön.

Omnira frontend, Strategy Engine och Learning Layer behöver inte ha tillgång till dem.

## Credential Rotation

Systemet ska stödja rotation av credentials utan att strategy eller journalhistorik påverkas.

Accounts refereras internt genom stable account IDs, inte credentials.

## Credential Revocation

Om credentials misstänks vara komprometterade ska de kunna revokeras och ersättas.

Execution ska blockeras tills account access åter verifierats.

## Kill Switch Architecture

Kill switch är en explicit säkerhetsmekanism som blockerar execution.

Omnira ska stödja flera scopes:

- GLOBAL
- ACCOUNT
- STRATEGY
- INSTRUMENT
- RUNNER
Detta gör att ett problem kan isoleras utan att alltid slå ut hela systemet.

## Global Kill Switch

Global kill betyder:

**ingen ny execution någonstans i Omnira Trading**

Den används vid systemövergripande problem.

Exempel:

- critical security incident
- corrupted risk state
- major platform incident
## Account Kill Switch

Account kill blockerar endast ett specifikt account.

Exempel:

Ett prop account behöver utredas.

Övriga demo environments kan fortfarande fungera.

## Strategy Kill Switch

Strategy kill blockerar en specifik StrategyVersion.

Exempel:

Ett allvarligt detection bug upptäcks i Strategy v1.0.

Andra framtida strategier behöver inte automatiskt blockeras.

## Instrument Kill Switch

Instrument kill kan stoppa exempelvis:

```
MNQ
```

utan att påverka andra framtida markets.

Det kan vara relevant vid:

- contract mapping issue
- abnormal market
- corrupted feed
## Runner Kill Switch

Runner kill blockerar execution genom en specifik execution host.

Exempel:

Windows-host har instabil MT5 connection.

## Kill Switch Evaluation

Varje execution ska kontrollera alla relevanta scopes.

Exempel:

Global:

```
OFF
```

Account:

```
OFF
```

Strategy:

```
OFF
```

Instrument:

ON

Resultat:

**DENY**

## Kill Switch är Hard Gate

Atlas får inte resonera sig förbi kill switch.

A+ setup

eller:

high AI confidence

spelar ingen roll.

Aktiv relevant kill switch:

**NO NEW TRADE**

## Persistent Kill Switch

Kill switch state ska överleva:

- service restart
- runner restart
- UI reconnect
En restart får inte automatiskt återaktivera trading.

## Secure Default after Failure

Efter vissa critical failures kan systemet automatiskt sätta ett scope till:

```
BLOCKED
```

eller motsvarande kill state.

Exempel:

- wrong account
- reconciliation failure
- unprotected position
- unknown execution state
Återaktivering ska kräva verifierad recovery.

## Kill Switch Audit

Varje ändring ska journalföras.

Exempel:

- who/what activated
- timestamp
- scope
- reason
- previous state
- new state
## Human Kill Switch

Användaren ska ha en mycket tydlig möjlighet att stoppa trading.

Den ska vara snabb att nå i Omnira Trading UI.

## UI Confirmation

För att aktivera kill switch bör minimalt friktion användas.

Att stoppa trading ska vara enkelt.

Att återaktivera trading kan däremot kräva mer verifiering.

Detta är en avsiktlig asymmetri.

## Stop Easy, Restart Harder

Princip:

Det ska vara lätt att göra systemet säkrare och svårare att göra det farligare.

Därför kan:

```
KILL
```

vara ett enkelt explicit action.

Men:

RE-ENABLE LIVE AUTOMATION

bör kräva health checks och eventuellt mänsklig approval.

## Kill Switch vs Emergency Close

Kill switch och emergency close är två olika funktioner.

Kill switch:

STOP NEW TRADES

Emergency Close:

CLOSE EXISTING EXPOSURE

De ska inte blandas.

## Varför de separeras

Om användaren upptäcker en bugg i nya entries men har en korrekt skyddad position öppen kan det vara säkrare att låta den följa sin plan.

Ett generellt kill-kommando ska därför inte automatiskt göra en market close om det inte uttryckligen valts.

## Emergency Close

Systemet ska stödja en separat privilegierad:

**EMERGENCY CLOSE**

Den ska användas när öppen exposure behöver avvecklas snabbt enligt definierad policy eller human action.

## Emergency Close Authority

Eftersom emergency close påverkar riktiga positions är det en privilegierad action.

Den ska kräva:

- authenticated user/system authority
- explicit account/position scope
- audit
## Emergency Close All

En framtida:

CLOSE ALL

funktion kan vara värdefull men är mycket kraftfull.

Den ska:

- vara tydligt märkt
- visa environment
- visa affected positions
- journalföras
## Automated Emergency Protection

Vissa safety conditions kan senare få explicit automation.

Exempel:

Canonical riskbeslutet säger att en öppen position ska stängas när intern realized daily loss når $450.

Detta är inte Atlas discretion.

Det är fördefinierad Risk Policy.

## Prop Emergency Protection

Samma sak kan senare definieras för imminent hard prop breach.

Men sådan policy måste dokumenteras och testas innan live.

## Stop Loss som säkerhetsbarriär

Broker-native stop loss är en central riskkontroll.

Det är inte samma sak som kill switch.

SL skyddar den enskilda positionen även om Omnira eller runnern går offline.

## SL Verification

Efter entry ska systemet verifiera:

expected broker-native SL

mot:

actual broker SL

Om detta inte matchar ska det behandlas som critical safety incident.

## No Unprotected Position Assumption

Systemet får aldrig anta att SL finns bara för att den skickades i requesten.

Broker state är source of truth.

## Take Profit

TP är inte samma säkerhetsnivå som SL men ska också verifieras om planen kräver broker-native TP.

## Active Management Residual Risk

Break-even, news exit och time exit kräver aktiv runtime.

Detta innebär residual risk om:

- Omnira går ner
- runner går ner
- network går ner
Denna risk ska dokumenteras.

## Independent Broker Protection

Ju mer protection som kan ligga broker-native utan att förstöra strategy behavior, desto bättre resilience får systemet.

## Fail-Closed Execution

Execution Gateway ska neka request om någon kritisk dependency är:

- unavailable
- stale
- unknown
- inconsistent
Exempel:

Risk Decision missing

```
→ DENY
```

Prop Decision missing

```
→ DENY
```

Account unknown

```
→ DENY
```

Kill state unknown

```
→ DENY
```

## No Default Allow

Systemet får inte implementera mönstret:

try:

```
verify_risk()
```

except:

```
continue_trade()
```

Safety exceptions ska inte omvandlas till permission.

## Explicit ALLOW

Execution får ske först när systemet har explicit:

```
ALLOW
```

från samtliga obligatoriska gates.

Avsaknad av DENY är inte samma sak som ALLOW.

## Approval Security

Human approval ska vara bundet till exakt proposalversion.

Om proposal ändras efter approval ska tidigare approval bli invalid.

## What You See Is What Gets Executed

Approval UI ska visa de parametrar som faktiskt blir signerade/godkända.

Exempel:

- account
- instrument
- side
- quantity
- SL
- TP
- risk
Det får inte visas 1 MNQ men exekveras 2 MNQ.

## Proposal Mutation

Efter approval ska critical execution fields vara immutable.

Behöver de förändras:

```
→ ny proposal
→ ny approval
```

## Automation Policy Security

Demo/Live automation ska använda explicit policy version.

Exempel:

AUTO_POLICY-v1

Policyn ska beskriva:

- environment
- accounts
- strategies
- allowed risk
- execution windows
## No Self-Escalation

Atlas får aldrig ändra:

Live Manual

till:

Live Automated

på eget initiativ.

Autonomy level är governance state.

## Autonomy Capability

Operation mode ska vara explicit.

Exempel:

```
ANALYSIS_ONLY
READ_ONLY
DEMO_MANUAL
DEMO_AUTO
LIVE_MANUAL
CONTROLLED_LIVE_AUTO
```

En component får endast använda capabilities som mode tillåter.

## Mode Downgrade

Systemet ska kunna sänka autonomy automatiskt vid problem.

Exempel:

```
DEMO_AUTO
→
READ_ONLY
```

vid critical execution incident.

Att gå tillbaka upp ska däremot kräva ny verification.

## One-Way Safety Bias

Detta är en generell säkerhetsprincip:

Automatiskt:

```
MORE AUTONOMY → LESS AUTONOMY
```

kan vara tillåtet.

Automatiskt:

```
LESS AUTONOMY → MORE AUTONOMY
```

ska inte vara tillåtet.

## Audit Logging

Alla security-sensitive actions ska skapa audit event.

Exempel:

- live execution enabled
- kill switch changed
- credential rotated
- account binding changed
- automation policy activated
- risk profile activated
- prop profile activated
- emergency close used
## Append-Only Audit

Audit history ska i största möjliga mån vara append-only.

Historiska events ska inte kunna raderas för att dölja misstag.

## Actor Identity

Audit event ska veta vem eller vad som gjorde action.

Exempel:

- USER
- RISK_ENGINE
- PROP_ENGINE
- SYSTEM_RECOVERY
- EXECUTION_RUNNER
## Atlas är inte Audit Authority

Atlas kan sammanfatta audit logs.

AI:n får inte skriva om eller radera dem.

## Security Events

Security events ska hållas separata från vanliga strategy events.

Exempel:

```
AUTH_FAILURE
UNAUTHORIZED_EXECUTION_ATTEMPT
SECRET_EXPOSURE
INVALID_INTENT_SIGNATURE
```

## Failed Authentication

Repeated auth failures mot runnern ska monitoreras.

Systemet ska kunna skapa security incident.

## Rate Limiting

Privilegierade endpoints bör skyddas mot onormalt många requests.

Detta gäller särskilt execution endpoints.

## Execution Volume Guard

Utöver trading Risk Engine kan systemet ha tekniska sanity checks.

Exempel:

Om Strategy v1.0 normalt endast får 1 öppen position och max 3 attempts per thesis men runnern plötsligt får hundratals intents:

Detta ska behandlas som systemfel eller attack, inte som normal trading.

## Circuit Breakers

Systemet kan använda technical circuit breakers.

Exempel:

N execution failures within X time

```
→
```

runner execution block.

Exakta thresholds definieras senare.

## Duplicate Order Circuit Breaker

Om duplicate anomaly någonsin observeras ska live automation kunna stoppas omedelbart.

Duplicate unintended execution är zero-tolerance.

## Wrong Account Circuit Breaker

Account mismatch ska alltid blockera execution.

Ingen retry tills account är verifierat.

## Data Integrity Security

Security handlar också om att skydda beslutsdata från otillåtna förändringar.

Strategy config, Risk Profile och Prop Profile ska versionshanteras och endast ändras genom kontrollerad process.

## Canonical Rule Integrity

Canonical rule-dokument och aktiva machine-readable configs ska ha tydlig relation.

Systemet ska kunna verifiera:

active strategy config = approved canonical version

## Configuration Signing / Hashing

På sikt kan kritiska config artifacts ha checksum/hash eller signing för att upptäcka oavsiktliga förändringar.

## No Silent Configuration Drift

Om live-runnern använder annan config än backend förväntar sig ska execution blockeras.

## Version Handshake

Omnira och runner bör kunna utbyta versionsinformation.

Exempel:

- runner version
- intent schema
- active capabilities
Incompatible versions:

NO EXECUTION

## Deployment Security

Production deployment ska skilja mellan:

- code deploy
- config activation
- live authorization
Ett nytt code build ska inte automatiskt ändra trading authority.

## Deployment Sign-Off

Större säkerhetskritiska deployment changes ska senare ha verifieringschecklist.

Exempel:

- tests pass
- demo verified
- migration verified
- runner compatible
- rollback available
## Rollback

Om en ny version har fel ska systemet kunna återgå till tidigare verifierad version där tekniskt möjligt.

Rollback får inte förstöra broker reconciliation.

## Open Position During Deployment

Deployment med öppen live position ska betraktas som särskilt riskfyllt.

Default policy bör vara att undvika onödiga deployments under active exposure.

Exakta regler definieras senare.

## Database Access

Services ska inte alla ha full write-access till hela tradingdatabasen.

Access bör begränsas efter responsibility när arkitekturen implementeras.

## Frontend Access

Frontend ska aldrig direkt kunna skriva:

- broker order
- RiskDecision
- PropDecision
Frontend requests ska gå genom backend authority layers.

## CSRF / Session Security

Human approval måste skyddas som en känslig action.

En webbsida ska inte kunna trigga approval utan giltig användarsession och rätt security controls.

Exakt webbsäkerhetsimplementation definieras när UI/backend byggs.

## Human Factors

Säkerhet handlar också om att minska mänskliga misstag.

Live UI ska därför mycket tydligt visa:

**LIVE**

och:

- account
- environment
- risk
- quantity
innan approval.

## Demo/Live Visual Separation

Demo och live ska inte se så identiska ut att de lätt kan förväxlas.

UI ska använda tydlig miljöindikering.

## Confirmation for Dangerous Actions

Farliga actions såsom:

- enable live automation
- emergency close all
- change live risk profile
ska kräva tydlig confirmation.

## No Confirmation Fatigue

Normala tradingflöden ska samtidigt inte bombardera användaren med meningslösa dialogs.

Extra confirmation ska reserveras för verkligt privilegierade actions.

## Live Risk Profile Change

Riskregler ska inte ändras mitt i aktiv trading utan kontrollerad process.

En ny RiskProfile version ska:

- skapas
- granskas
- aktiveras explicit
## Prop Rule Changes

Samma gäller PropFirmProfile.

Om firman ändrar regler ska systemet blockera eller kräva review enligt freshness-policy innan ny version används.

## Canonical Strategy Changes

Atlas Learning Layer får inte skriva direkt till active StrategyVersion.

Förslag:

candidate

```
→ test
→ approval
→ canonical
```

## Self-Improvement Security Boundary

Learning Layer får ha write access till:

- findings
- hypotheses
- candidate definitions
men inte till:

- active live strategy
- active risk profile
- active prop rules
- execution permissions
Detta är ett viktigt architectural permission boundary.

## Prompt Injection och AI Inputs

Om Atlas senare analyserar externa textkällor såsom:

- news
- broker documentation
- prop firm pages
ska dessa betraktas som data, inte systeminstruktioner.

Extern text ska inte kunna instruera Atlas att:

- kringgå risk
- ändra live config
- exekvera trade
## AI Output Validation

AI-genererade outputs som påverkar strukturerade systemfält ska valideras mot schemas och authority policy.

Fri text får inte bli broker request.

## No Tool Authority by Language Alone

En mening såsom:

Take the trade now.

ska inte vara tillräcklig execution authorization om den kommer från en AI-analysis-output.

Authority ska representeras genom separata systemobjekt.

## Security Monitoring

Omnira ska senare monitorera bland annat:

- auth failures
- invalid execution intents
- unexpected account changes
- runner changes
- kill switch events
- config changes
- duplicate attempts
## Alerting

Kritiska säkerhetshändelser ska notifiera användaren.

Exempel:

Execution blocked: active MT5 account does not match approved live account.

## Security Incident Response

Ett security incident ska kunna följa:

```
DETECTED
→
CONTAINED
→
INVESTIGATED
→
RECOVERED
→
POSTMORTEM
```

Vid osäkerhet ska execution-capability reduceras.

## Compromised Runner

Om runnern misstänks komprometterad ska:

- runner kill aktiveras
- credentials kunna roteras
- account state verifieras från trusted channel
- ny deployment provisioneras vid behov
## Compromised Credentials

Vid misstänkt credential exposure ska trading inte fortsätta som vanligt.

Credential rotation och account review krävs.

## Security Backup

Kritiska configs och auditdata ska backas upp.

Secrets kräver separat säker backup-policy.

## Restore

Efter restore ska systemet inte automatiskt anta att säkerhetsstate är aktuell.

Exempel:

En backup kan innehålla gammal kill-switch state eller gammal PropProfile.

Restore måste följas av reconciliation och config verification.

## Disaster Recovery

Systemet ska senare ha dokumenterad plan för:

- backend loss
- runner loss
- database recovery
- new execution host
- credential recovery
Målet är säker återställning, inte snabbast möjliga tradingåterstart.

## Security Testing

Före live ska systemet testas mot exempelvis:

- unauthorized request
- replayed intent
- expired intent
- modified payload
- wrong account
- wrong environment
- disallowed instrument
- duplicate request
- killed service
- stale kill-switch state
## Negative Security Tests

Det räcker inte att testa att rätt request fungerar.

Vi måste också bevisa att fel request inte fungerar.

## Penetration och Dependency Review

När systemet närmar sig riktig live automation bör det genomgå separat säkerhetsreview.

Det kan inkludera:

- dependency vulnerabilities
- network exposure
- auth configuration
- secret handling
- privilege review
## Third-Party Risk

Systemet är beroende av komponenter såsom:

- broker
- MT5
- data providers
- VPS
- AI provider
- news provider
Dessa har egen risk.

Omnira ska minimera hur mycket authority ett fel i extern tjänst får.

## AI Provider Outage

AI outage ska inte ge execution authority till något annat system av misstag.

Det ska endast skapa den fallback som definierats för operation mode.

## Market Data Provider Compromise

Om data ser orimlig ut eller integrity checks faller ska execution stoppas.

Risk Engine kan inte skydda mot en strategi som matas med helt fel prisdata om datakvaliteten inte kontrolleras först.

## Supply Chain Security

Dependencies och packages som används i runner/backend ska hållas kontrollerade.

Security updates ska hanteras genom normal engineeringprocess.

## Audit Export

Vid behov ska säkerhets- och tradingaudit kunna exporteras för granskning.

Det ska hjälpa vid:

- debugging
- prop firm incident
- external security review
## Zero-Trust Principle

Omnira Trading ska i praktiken följa en förenklad zero-trust-princip:

Verifiera varje privilegierad handling utifrån aktuell identity, state och policy.

Att något var korrekt igår betyder inte automatiskt att det är korrekt idag.

## Security och Performance

Säkerhetskontroller får skapa viss latency.

För den första versionen är det acceptabelt.

Vi optimerar inte bort:

- account verification
- risk revalidation
- signature checks
för att spara några millisekunder utan evidens att det behövs.

## Safety vs Speed

Prioritet:

```
Safety
→ Correctness
→ Auditability
→ Reliability
→ Performance
```

Execution speed optimeras senare inom dessa gränser.

## Kill Switch Dashboard

Atlas Market View ska tydligt visa:

Global Kill: OFF

Account Kill: OFF

Strategy Kill: OFF

Instrument Kill: OFF

Runner Kill: OFF

Execution State: READY

Om någon ändras:

**EXECUTION BLOCKED**

ska vara omedelbart synligt.

## Live Safety Header

I live mode bör Trading UI alltid visa en kompakt safety header:

- LIVE
- account
- runner
- MT5
- Risk Engine
- Prop Firm
- kill switch
- reconciliation
Detta ger snabb mänsklig situationsbild.

## Atlas och säkerhet

Atlas ska kunna förklara säkerhetsstate.

Exempel:

Trading är blockerad eftersom execution-runnern återanslöt till MT5 och ännu inte har klarat reconciliation.

Det är en lämplig AI-roll.

Atlas ska inte kunna säga:

Det verkar nog okej, vi kör ändå.

## Safety Governance

Säkerhetskritiska policyförändringar ska versionshanteras.

Exempel:

- autonomy policy
- emergency close policy
- risk profile
- execution policy
Det ska gå att se vilken policy en live trade använde.

## Security as Code

Där det är praktiskt ska säkerhetsregler vara:

- explicit
- testbara
- maskinläsbara
inte bara finnas som text i boken.

Boken definierar avsikten.

Kod och konfiguration implementerar den.

Tester bevisar beteendet.

## Golden Safety Tests

Systemet ska ha automatiserade säkerhetsfall såsom:

```
Wrong account
→ DENY
```

```
Wrong environment
→ DENY
```

```
Kill active
→ DENY
```

```
Expired intent
→ DENY
```

```
Replay
→ DENY
```

```
Unknown Risk state
→ DENY
```

```
Unknown Prop state
→ DENY
```

```
Disallowed symbol
→ DENY
```

```
Duplicate intent
→ exakt en execution
```

## Safety Sign-Off

Före Controlled Live ska safety test suite vara en explicit gate.

Ett känt critical failing test innebär:

**NO LIVE**

## Säkerhetens relation till autonomi

Autonomi är inte att ta bort säkerhetskontroller.

Autonomi betyder att fler normala beslut kan ske utan mänskligt klick medan samma eller starkare controls ligger kvar.

Ju högre autonomi:

desto högre krav på:

- authentication
- monitoring
- audit
- recovery
- fail closed
- kill switches
## Den centrala säkerhetsprincipen

Omnira Trading ska byggas utifrån frågan:

Om denna komponent går fel eller komprometteras, hur mycket kan den faktiskt göra?

Det bästa svaret är inte:

Förhoppningsvis går den aldrig fel.

Det bästa svaret är:

Dess behörighet är begränsad, nästa lager verifierar den, och systemet kan stoppas innan felet växer.

Det är grunden för säker autonom trading.

## Kapitelstatus

Kapitel: 16 – Säkerhet och kill switches

Bok: Omnira Trading System – Från strategi till autonom exekvering

Status: Baseline dokumenterad

Security model: Least privilege + separation of duties

Default environment: Icke-live

Live authority: Explicit

Account allowlist: Obligatorisk

Instrument allowlist: Obligatorisk

Strategy version binding: Obligatorisk

Execution intent integrity: Obligatorisk

Replay/idempotency protection: Obligatorisk

Kill switch scopes: Global, Account, Strategy, Instrument, Runner

Emergency Close: Separat från Kill Switch

Secrets in AI/frontend/Git: Förbjudet

Self-improvement direct production write: Förbjudet

Unknown critical security state: Fail closed

Live safety testing: Obligatoriskt före aktivering

Omnira Trading ska göra det lätt att stoppa trading och svårt att oavsiktligt starta eller förändra privilegierad live execution.
