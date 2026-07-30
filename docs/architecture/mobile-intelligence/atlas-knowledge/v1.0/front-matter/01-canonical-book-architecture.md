---
document: "Canonical Book Architecture and Chapter Plan v1.0"
book: "Omnira — Mobile Intelligence & Device Control"
edition: "Canonical Edition v1.0"
status: "APPROVED"
approved: true
approval_date: "2026-07-30"
approved_by: "André Hultgren"
source_file: "Exports/Canonical-Edition-v1.0-APPROVED-r3/Canonical-Chapters/01 — Canonical Book Architecture and Chapter Plan v1.0.docx"
source_sha256: "8a62d661a27fbbd609fa45eeb01ad9395251628d9ea780999f34bfab1b67ec16"
generated: "2026-07-30"
derived: true
---

# Canonical Book Architecture and Chapter Plan v1.0


*Dokumentstatus: Canonical Edition v1.0 — APPROVED*


*Dokumentklass: Normerande bokarkitektur och redaktionellt kontrakt*


*Ägare: André Hultgren*


*System: Omnira*

Central intelligens: Atlas

Bokområde: Mobile Intelligence, Device Control, multi-device orchestration, governance, privacy, security och framtida mobil autonomi


## 1. Dokumentets syfte

Detta dokument definierar den fullständiga arkitekturen för den kanoniska boken:

Omnira — Mobile Intelligence & Device Control

Dokumentet fastställer:

- bokens syfte,
- dess normativa status,
- målgrupper,
- terminologi,
- redaktionella principer,
- delstruktur,
- kapitelordning,
- beroenden mellan kapitlen,
- obligatoriska ämnen,
- kapitelkontrakt,
- valideringskrav,
- planerade slutleveranser.
Detta dokument är inte implementation, kod, roadmap eller teknisk tasklista.

Det är ett styrande redaktionellt kontrakt för hur den framtida boken ska skrivas.


## 2. Bokens officiella namn

Svenskt arbetsnamn

Omnira — Mobile Intelligence & Device Control

Rekommenderad undertitel

Canonical Governance, Architecture and Authority Model for Mobile Nodes, Device Operations and Human-Controlled Autonomy

Undertiteln ska användas i den slutliga samlade boken om inget annat beslutas under canonicalization.


## 3. Bokens status och funktion

Boken ska samtidigt fungera som:


### 3.1 Vision

Den ska beskriva vad Omniras framtida mobilintegration ska kunna bli.


### 3.2 Normerande målarkitektur

Den ska definiera hur Mobile Intelligence ska struktureras, styras och avgränsas.


### 3.3 Canonical governance-kontrakt

Den ska styra framtida implementation och granskning.

Claude, Codex, ChatGPT, Atlas och framtida utvecklingsagenter ska kunna använda boken för att avgöra:

- vad som får implementeras,
- vad som inte får implementeras,
- vilken authority som krävs,
- när approval krävs,
- hur data ska isoleras,
- vilka verifieringskrav som gäller,
- hur failure och rollback ska hanteras,
- när en capability måste stoppas,
- när ny governance krävs.
Boken ska inte beskriva en viss Android-appversion som den enda möjliga implementationen.

Den ska definiera stabila kontrakt som kan överleva förändringar i:

- operativsystem,
- enheter,
- modeller,
- leverantörer,
- API:er,
- gränssnitt,
- organisationsstruktur,
- Omniras interna implementation.

## 4. Primär målgrupp

Boken skrivs primärt för:

- Omniras ägare,
- Atlas,
- arkitekter,
- utvecklare,
- Claude,
- Codex,
- ChatGPT,
- framtida implementation agents,
- säkerhetsgranskare,
- governance-granskare,
- framtida projekt- och organisationsägare.
Boken ska vara tekniskt och normativt exakt utan att förutsätta att läsaren känner till hela Omniras kodbas.


## 5. Produktmässig utgångspunkt

Mobile Intelligence ska optimeras för André och hans egna projekt först.

Arkitekturen ska samtidigt vara utformad så att den senare kan stödja:

- andra privatpersoner,
- flera användare,
- familjer,
- team,
- företag,
- separata organisationer,
- olika roller,
- flerpersonsgodkännande,
- multi-tenant-drift.
Boken ska tydligt skilja mellan:

- första privata installationen,
- generell produktarkitektur,
- framtida enterprise-capabilities,
- capabilities som definieras men inte ska implementeras initialt.

## 6. Redaktionella grundprinciper

Varje kapitel ska vara:

- sammanhängande,
- normerande,
- tekniskt begripligt,
- arkitekturorienterat,
- spårbart till canonical beslut,
- tydligt med förbud och gränser,
- uttryckligt om failure modes,
- uttryckligt om authority,
- uttryckligt om verifiering,
- uttryckligt om projektisolering,
- framtidssäkert utan att bli abstrakt.
Boken ska inte fyllas med lösa produktidéer som saknar governancekonsekvens.

Den ska inte bli en lista av funktioner utan sammanhängande systemarkitektur.


## 7. Normativt språk

Följande termer ska användas konsekvent:

SKA — obligatoriskt canonical krav.

FÅR — tillåtet under angivna villkor.

FÅR INTE — uttryckligt förbjudet.

BÖR — rekommenderad standard som kräver motivering för avvikelse.

KAN — arkitekturen stödjer möjligheten men kräver inte aktivering.

INITIALT — gäller första installationen eller första authority-fasen.

SENARE — capability är arkitektoniskt tillåten men inte initial standard.

CANONICAL — styrande tills ett godkänt ändringsbeslut ersätter det.


## 8. Obligatoriska begrepp

Boken ska definiera och använda minst följande begrepp konsekvent:

Mobile Intelligence

Mobile Node

Device Control

Atlas

Project Agent

Control Surface

Execution Surface

Canonical State

Capability

Authority

Mandate

Approval

Delegation

Scope

Project Isolation

Credential Isolation

Device Identity

Trusted Device

Recovery Device

Workflow

Action

Step

Checkpoint

Verification

Unknown Outcome

Rollback

Compensation

Quarantine

Audit

Retention

Local Processing

Cloud Processing

Provider Routing

Notification Priority

Emergency Stop

Safe Failure

Human Override

Governance Version

Capability Expansion


## 9. Bokens makrostruktur

Boken ska bestå av 32 kapitel, organiserade i åtta delar.

PART I   — DOMAIN, VISION AND CANONICAL FOUNDATIONS

PART II  — AUTHORITY, GOVERNANCE AND PROJECT BOUNDARIES

PART III — PRIVACY, COMMUNICATION AND HUMAN ATTENTION

PART IV  — DEVICE CONTROL, FILES, MEDIA AND LOCAL CONTEXT

PART V   — MEMORY, DATA, PROVIDERS AND SECURITY

PART VI  — MULTI-DEVICE ORCHESTRATION AND DISTRIBUTED EXECUTION

PART VII — VERIFICATION, AUDIT, FAILURE AND LIFECYCLE CONTROL

PART VIII — EXPERIENCE, ADOPTION AND CANONICAL IMPLEMENTATION GOVERNANCE

PART I — DOMAIN, VISION AND CANONICAL FOUNDATIONS

Kapitel 1 — Mobile Intelligence as an Omnira System Domain

Syfte

Definiera Mobile Intelligence som ett eget arkitektur- och governanceområde inom Omnira.

Kapitlet ska fastställa

varför mobilen ska bli en fullvärdig Omnira-node,

skillnaden mellan mobilapp och Mobile Intelligence,

Atlas roll i mobilarkitekturen,

relationen mellan mobil, backend, dator och server,

varför device control inte får reduceras till UI-automation,

varför governance måste föregå implementation,

bokens canonical status.

Centrala frågor

Vad är Mobile Intelligence?

Vad är det inte?

Vad innebär det att mobilen är en fullvärdig nod?

Vilka systemgränser gäller?

Vem är systemets ägare?

Hur ska boken användas av implementation agents?

Canonical output

En tydlig domändefinition och systemgräns.

Kapitel 2 — Vision, Product Scope and Evolution Path

Syfte

Beskriva den långsiktiga visionen och den stegvisa produktutvecklingen.

Kapitlet ska fastställa

André-first-principen,

framtida stöd för privatpersoner och företag,

första kärnomfattningen,

senare capabilities,

skillnaden mellan capability availability och capability authority,

utvecklingen från assistans till kontrollerad autonomi.

Mognadssteg

Observation

Rekommendation

Human approval

Lågriskautomation

Authority-baserad autonomi

Capability expansion efter governance

Canonical output

En normerande evolution path utan implementationsroadmap.

Kapitel 3 — System Actors, Roles and Trust Relationships

Syfte

Definiera systemets aktörer och deras relationer.

Aktörer

användare,

kontoägare,

Atlas,

projektagent,

specialiserad agent,

mobilagent,

worker,

approval-enhet,

notifieringsenhet,

recovery-enhet,

organisation,

extern tjänst,

modellprovider,

credential vault.

Kapitlet ska skilja mellan

användaridentitet,

projektidentitet,

agentidentitet,

enhetsidentitet,

extern avsändaridentitet,

intern exekveringsidentitet.

Canonical output

En fullständig actor model och trust map.

Kapitel 4 — Core Principles, Invariants and Absolute Prohibitions

Syfte

Samla bokens viktigaste invariants och förbjudna beteenden.

Obligatoriska principer

least privilege,

human authority before autonomy,

explicit project scope,

revocable access,

auditability,

local processing where practical,

safe failure,

no hidden surveillance,

no fake device state,

no credential exposure,

no silent privilege expansion,

no invisible project mixing.

Absoluta förbud

Kapitlet ska normera hela listan från Decision Register, inklusive:

- dold mikrofon,
- dold kamera,
- generell privat meddelandeläsning,
- klartextlösenord,
- falsk framgång,
- automatisk authority-höjning,
- okänd appvy som behandlas som validerad,
- irreversibel action utan mandat.
Canonical output

Bokens övergripande safety constitution.

PART II — AUTHORITY, GOVERNANCE AND PROJECT BOUNDARIES

Kapitel 5 — Authority Model L0–L6

Syfte

Definiera authority-nivåerna som styr all mobil exekvering.

Kapitlet ska innehålla

definition av L0–L6,

tillåtna handlingar per nivå,

förbjudna handlingar per nivå,

skillnaden mellan observation, recommendation och execution,

authority elevation,

authority downgrade,

earned autonomy,

emergency suspension,

hur authority relaterar till capability och workflow.

Viktigt krav

Authority ska aldrig vara global och obegränsad enbart genom ett nivånummer.

Canonical output

Ett normerande authority contract.

Kapitel 6 — Scope Architecture and Capability Grants

Syfte

Definiera den kombinerade scope-modellen.

Canonical scope

Projekt + capability + app eller tjänst + datatyp + enhet + tidsperiod.

Utökade dimensioner

workflow,

konto,

kanal,

mapp,

mottagare,

avsändare,

precision,

geografiskt område,

kostnad,

riskklass,

provider.

Kapitlet ska beskriva

grant,

deny,

override,

expiry,

inheritance,

delegation,

conflict resolution,

default deny,

scope reduction,

scope revocation.

Canonical output

En behörighetsmodell som kan implementeras konsekvent.

Kapitel 7 — Approval Architecture and Mandate Lifecycle

Syfte

Definiera approvals och hur de utvecklas till mandat.

Approvalformer

approve once,

approve action,

approve workflow,

approve project,

approve for time period,

approve within budget,

approve capability,

reject,

postpone,

request modification,

revoke.

Mandatets livscykel

proposed,

pending,

approved,

active,

suspended,

expired,

revoked,

violated,

completed.

Kapitlet ska även täcka

approval fatigue,

mandate bundles,

human-readable approvals,

riskbaserad detaljnivå,

irreversibility warnings,

automatic stop conditions,

approval evidence.

Canonical output

Ett fullständigt approval- och mandate contract.

Kapitel 8 — Project Isolation, Tenant Boundaries and Atlas Global View

Syfte

Definiera projektisolering som arkitekturkrav.

Kapitlet ska fastställa

projektdata får inte blandas,

projektminnen är isolerade,

credentials är projektbundna,

costs och audit är scoped,

projektagenter har inte global åtkomst,

Atlas får ha global vy,

tvärprojektdelning kräver explicit handling,

personlig data tillhör användaren,

framtida tenantgränser.

Särskilt viktigt

Isolering ska inte baseras på namnkonventioner eller UI-kontext.

Canonical output

Ett bindande project- och tenant-isolation contract.

PART III — PRIVACY, COMMUNICATION AND HUMAN ATTENTION

Kapitel 9 — Privacy Architecture and Private-by-Default Boundaries

Syfte

Definiera hur privat data skyddas innan innehåll behandlas.

Kapitlet ska täcka

appblocklistor,

privata meddelandeappar,

privata bank- och identitetsappar,

metadata kontra innehåll,

kontoseparation,

lokala klassificeringar,

framtida användarinställningar,

privat data kontra projektdata,

no hidden surveillance.

Canonical output

En privacy boundary model.

Kapitel 10 — Communication Channels, Accounts and Content Access

Syfte

Definiera hur Atlas får läsa kommunikationsdata.

Kanaler

e-post,

sociala medier,

projektinboxar,

notifieringar,

privata konversationer,

projektkanaler,

mappar och etiketter.

Kapitlet ska fastställa

godkända projektkonton,

privata konton,

historisk åtkomst,

metadataåtkomst,

conversation-level grants,

workflow access,

account ownership,

data minimization.

Canonical output

Ett communication-access contract.

Kapitel 11 — Outbound Communication, Brand Identity and Human Representation

Syfte

Definiera när Atlas och projektagenter får kommunicera externt.

Kapitlet ska täcka

project identity,

brand voice,

Atlas som intern hjärna,

Nova, Pling och Arnold,

The Prompt-undantaget,

standardsvar,

kundservice,

sociala kommentarer,

missnöjda kunder,

marknadsföring,

myndighetskontakt,

privata meddelanden,

impersonation,

röst och signatur,

bindande uttalanden.

Canonical output

Ett outbound identity and communication contract.

Kapitel 12 — Notifications, Attention and Priority Governance

Syfte

Definiera när Atlas får störa användaren.

Prioriteter

P0

P1

P2

P3

Kapitlet ska täcka

neutral förstavy,

känsligt innehåll,

låsskärm,

missed notifications,

escalation,

focus mode,

sleep,

driving,

family time,

briefings,

“Vad behöver jag göra nu?”,

när Atlas ska vänta.

Canonical output

En attention-governance model.

PART IV — DEVICE CONTROL, FILES, MEDIA AND LOCAL CONTEXT

Kapitel 13 — Device Control Capability Model

Syfte

Definiera device control som capability-system.

Kapitlet ska klassificera

öppna appar,

stänga appar,

navigera,

skriva,

läsa skärm,

trycka,

ändra inställningar,

Wi-Fi,

stör ej,

restart,

lock,

screenshots,

installationer,

appbehörigheter.

Riskdimensioner

reversibilitet,

external effect,

sensitivity,

verification,

user presence,

app trust,

unknown UI.

Canonical output

En riskklassad device-control model.

Kapitel 14 — Sensitive Applications and Human-Presence Requirements

Syfte

Definiera hantering av känsliga appar.

Appar

bank,

BankID,

password manager,

authenticator,

vård,

myndigheter,

privata meddelanden,

privata bilder.

Kapitlet ska definiera

specific-case approval,

human presence,

biometric requirement,

final confirmation,

no silent execution,

session scope,

device unlock,

app lock boundaries.

Canonical output

Ett sensitive-application contract.

Kapitel 15 — File Operations, Project Storage and Quarantine

Syfte

Definiera hur Atlas läser, skapar, flyttar och tar bort filer.

Kapitlet ska täcka

projektmappar,

privata mappar,

downloads,

documents,

media,

cloud-synced files,

rename,

copy,

move,

convert,

upload,

archive,

quarantine,

restore,

permanent deletion.

Karantänkrav

projektseparerad,

återställningsbar,

verifierbar,

tidsstyrd,

auditkopplad.

Canonical output

Ett file lifecycle contract.

Kapitel 16 — Image, Video, Camera and Microphone Governance

Syfte

Definiera hantering av bilder, video, kamera och mikrofon.

Kapitlet ska täcka

manuellt valda bilder initialt,

kamerarullsklassificering senare,

projektmedia,

privata bilder,

osäker klassificering,

ansiktsdetektering,

inga bestående ansiktsprofiler,

masking,

cloud analysis approval,

meeting transcription,

user-initiated microphone,

no passive listening.

Canonical output

Ett media- och sensor-governance contract.

Kapitel 17 — Location, Geofencing and Physical Context

Syfte

Definiera begränsad och nyttobaserad platsanvändning.

Precision

G0–G4.

Kapitlet ska täcka

G1 som standard,

exakt plats endast vid behov,

geofenced reminders,

workflow triggers,

resväg,

event retention,

no full location history,

no automatic movement profile,

driving context,

MC-läge,

user correction,

uncertainty language.

Canonical output

Ett location and context contract.

PART V — MEMORY, DATA, PROVIDERS AND SECURITY

Kapitel 18 — Local Processing, Cloud Processing and Data Egress

Syfte

Definiera när data behandlas lokalt eller skickas vidare.

Kapitlet ska täcka

local-first vid integritetsbehov,

sensitive masking,

cloud justification,

approved workflow transfer,

ad hoc approval,

provider disclosure,

retention,

model-training conditions,

external data processing,

minimal payload.

Canonical output

Ett data-egress contract.

Kapitel 19 — Provider Routing, Cost, Quality and Resilience

Syfte

Definiera hur Atlas väljer modell, API eller leverantör.

Urvalskriterier

kvalitet,

kostnad,

hastighet,

integritet,

kommersiella rättigheter,

availability,

multimodalitet,

data sensitivity,

fallback.

Kapitlet ska fastställa

global provider approval,

project-level routing,

budget mandates,

no single-provider dependency,

fallback,

provider failure,

provider condition changes,

local-model substitution.

Canonical output

Ett provider-routing and resilience contract.

Kapitel 20 — Memory Architecture and Knowledge Boundaries

Syfte

Definiera vad Atlas får minnas och hur minnen klassificeras.

Minnesklasser

global user memory,

project memory,

operational state,

audit-derived lesson,

temporary context,

sensitive personal memory,

workflow memory.

Kapitlet ska täcka

memory proposal queue,

editing,

approval,

source,

effect,

project scope,

cross-project sharing,

personal ownership,

future user controls,

Obsidian/knowledge vault as canonical long-term layer.

Canonical output

Ett memory-governance contract.

Kapitel 21 — Retention, Deletion, Backup and Recoverability

Syfte

Definiera datans hela livscykel.

Kapitlet ska täcka

retention per datatype,

active deletion,

cache,

embeddings,

backup rotation,

external provider deletion,

verified deletion,

quarantine,

restore,

project deletion,

account deletion,

cooling-off period,

recovery levels.

Canonical output

Ett data lifecycle and recovery contract.

Kapitel 22 — Identity, Credentials and Account Recovery

Syfte

Definiera autentisering, credential isolation och recovery.

Kapitlet ska täcka

OAuth,

token,

API keys,

vault,

no plaintext passwords,

device sessions,

suspicious login,

verified email,

SMS,

one-time codes,

recovery device,

no universal master password,

logout all sessions,

account takeover handling.

Canonical output

Ett identity and credential-security contract.

PART VI — MULTI-DEVICE ORCHESTRATION AND DISTRIBUTED EXECUTION

Kapitel 23 — Omnira Nodes and Execution Roles

Syfte

Definiera noderna och deras roller.

Noder

mobil,

laptop,

stationär,

privat serverrigg,

molnserver,

klocka,

bil,

recovery-enhet.

Roller

worker,

control surface,

approval surface,

notifier,

admin node,

read-only,

recovery.

Canonical output

En node-role model.

Kapitel 24 — Control Surfaces, Execution Surfaces and Data Locality

Syfte

Definiera skillnaden mellan var användaren styr och var arbetet körs.

Kapitlet ska täcka

control surface,

execution surface,

data locality,

device presence,

mobile-required steps,

desktop-required review,

server-based work,

user-facing continuity,

no unnecessary workflow migration.

Canonical output

Ett execution-placement contract.

Kapitel 25 — Node Selection, Work Placement and Provider Continuity

Syfte

Definiera hur Atlas väljer exekveringsyta.

Kriterier

performance,

battery,

cost,

network,

local files,

privacy,

installed apps,

availability,

latency,

user policy.

Kapitlet ska täcka

laptop/desktop initialt,

private rig later,

dynamic routing,

sensitive local jobs,

cloud substitution,

user node restrictions,

explanations on request.

Canonical output

Ett work-placement contract.

Kapitel 26 — Workflow Ownership, Concurrency and Duplicate Prevention

Syfte

Förhindra dubbelarbete och motstridiga handlingar.

Kapitlet ska täcka

one active execution owner,

leases,

fencing,

idempotency,

duplicate suppression,

action identity,

race conditions,

double publishing,

same-message handling,

canonical action state.

Canonical output

Ett distributed execution-safety contract.

Kapitel 27 — Offline Operation, Synchronization and Canonical State

Syfte

Definiera hur systemet beter sig när noder är offline eller disagreerar.

Kapitlet ska täcka

offline work,

queued actions,

expired mandates,

reconnect,

state reconciliation,

canonical sources,

stale actions,

conflict resolution,

mobile local state,

backend governance state,

project data state,

vault state.

Canonical output

Ett synchronization and canonical-state contract.

PART VII — VERIFICATION, AUDIT, FAILURE AND LIFECYCLE CONTROL

Kapitel 28 — Verification, Evidence and Unknown Outcomes

Syfte

Definiera hur systemet vet att något faktiskt lyckades.

Verifieringsnivåer

V0

V1

V2

V3

Kapitlet ska täcka

visual verification,

read-back,

API confirmation,

independent evidence,

dependency stopping,

unknown outcome,

no blind retries,

external actions,

explicit uncertainty.

Canonical output

Ett verification and evidence contract.

Kapitel 29 — Failure Handling, Rollback, Compensation and Emergency Stop

Syfte

Definiera hur systemet minskar skada och återhämtar sig.

Kapitlet ska täcka

retry,

safe retry,

rollback,

compensation,

quarantine,

partial completion,

incident action,

stop publishing,

pause workflow,

project emergency stop,

global emergency stop,

controlled restart.

Canonical output

Ett failure and recovery contract.

Kapitel 30 — Audit, Explainability, Accountability and Continuous Learning

Syfte

Definiera spårbarhet utan audit-brus.

Auditnivåer

health audit,

extended audit,

full audit.

Kapitlet ska täcka

who did what,

for whom,

project,

workflow,

mandate,

node,

model,

cost,

result,

verification,

error,

rollback,

decision explanation,

root-cause analysis,

learning from mistakes,

canonical lessons.

Canonical output

Ett audit and accountability contract.

Kapitel 31 — Versioning, Testing, Rollout and Capability Expansion

Syfte

Definiera säker förändring över tid.

Kapitlet ska täcka

automatic updates,

security updates,

new permission approval,

workflow compatibility,

simulation,

test,

shadow mode,

approval production,

canary,

test node,

regression tests,

rollback,

provider fallback,

version traceability,

new capability governance.

Blockerande tester

credential isolation,

project isolation,

private app blocking,

authority enforcement,

approval enforcement,

emergency stop,

duplicate prevention,

verification,

rollback,

safe failure.

Canonical output

Ett lifecycle and release-governance contract.

PART VIII — EXPERIENCE, ADOPTION AND CANONICAL IMPLEMENTATION GOVERNANCE

Kapitel 32 — Mobile Experience, Daily Operations and Canonical Implementation Contract

Syfte

Avsluta boken genom att förena governance med den faktiska användarupplevelsen.

Kapitlet ska täcka

Omnira-appen som första yta,

Atlas-chatten,

voice interaction,

natural interruption,

morning briefing,

evening briefing,

“Vad behöver jag göra nu?”,

approvals,

ordinary language,

visible uncertainty,

desktop handoff,

missed notifications,

accessibility,

user adaptation,

no hidden monitoring,

future enterprise configuration.

Kapitlets sista del ska fastställa

hur boken används vid implementation,

hur avvikelser identifieras,

hur nya beslut tillkommer,

hur Claude och Codex ska granska mot canonical källa,

att implementation sker separat,

att boken inte själv godkänner kodändringar,

att ny capability kräver separat governance.

Canonical output

Det slutliga canonical implementation contractet.


## 10. Kapitelkontrakt

Varje färdigt kapitel ska innehålla följande strukturella element där de är relevanta:

Kapitelrubrik


## Kapitelmandat

Syfte

Omfattning

Systemgräns

Normativa definitioner

Canonical principer

Arkitekturmodell

Authority och approval

Data- och projektscope

Security och privacy

Failure modes

Verifiering

Audit

Recovery eller rollback

Förbjudna beteenden

Framtida expansion

Canonical kravsammanfattning

Kapitelberoenden

Slutlig normativ slutsats

Alla kapitel behöver inte använda exakt samma underrubriker, men samma materiella krav måste täckas.


## 11. Numreringsmodell för normativa kontrakt

Varje kapitel ska innehålla numrerade normativa kontrakt.

Rekommenderad form:

<a id="MI-01-001"></a>
> **MI-01-001** — MI-01-002

<a id="MI-01-002"></a>
> **MI-01-002** — MI-01-003

<a id="MI-01-003"></a>
> **MI-01-003** — Där:

- MI betyder Mobile Intelligence,
- första talet är kapitelnummer,
- sista talet är kontraktsnummer.
Exempel:

MI-07-014 — Ett aktivt mandat får inte fortsätta efter att dess sluttid passerat.

Detta gör det möjligt för:

- Codex att hänvisa till exakta krav,
- Claude att granska implementation,
- Atlas att koppla policy till arkitektur,
- tester att referera till canonical regler,
- changelog att beskriva exakt vad som ändrats.

## 12. Spårbarhet till Decision Register

Samtliga beslut i:

00 — Omnira — Mobile Intelligence & Device Control — Canonical Decision Register v1.0.md

ska representeras i minst ett bokkapitel.

Decision Register ska inte kopieras mekaniskt ord för ord.

Boken ska:

- utveckla besluten,
- förklara deras systemkonsekvenser,
- normera arkitekturen,
- identifiera edge cases,
- definiera interaktioner mellan besluten,
- göra kraven implementerbara och verifierbara.
Inget canonical beslut får försvinna genom redaktionell förenkling.


## 13. Bokens språk

Bokens huvudspråk ska vara svenska.

Engelska tekniska termer får användas när de är etablerade eller mer exakta, exempelvis:

- authority,
- approval,
- capability,
- workflow,
- rollback,
- safe failure,
- canonical state,
- device control,
- credential vault,
- unknown outcome.
Begreppen ska definieras på svenska första gången de introduceras.


## 14. Stil och tonalitet

Boken ska vara:

- professionell,
- normativ,
- konkret,
- framtidsorienterad,
- tekniskt stringent,
- begriplig,
- fri från marknadsföringsöverdrifter.
Den ska undvika:

- onödiga slogans,
- vaga AI-påståenden,
- ogrundade säkerhetslöften,
- implementationsdetaljer som snabbt blir inaktuella,
- överdriven juridisk formulering,
- antagandet att AI alltid lyckas,
- antagandet att användaren alltid är tillgänglig.

## 15. Krav på säkerhetsrealism

Boken ska konsekvent utgå från att:

- modeller kan ha fel,
- appar kan förändras,
- enheter kan vara offline,
- nätverk kan vara osäkra,
- credentials kan komprometteras,
- leverantörer kan försvinna,
- workflows kan krascha,
- externa actions kan få unknown outcome,
- användaren kan missa notifieringar,
- ett system kan bli hackat trots god säkerhet.
Arkitekturen ska begränsa skadan genom dataminimering, isolering, verifiering och reversibilitet.


## 16. Krav på framtida företagsanvändning

Enterprise-funktioner behöver inte implementeras i första versionen.

Boken ska ändå möjliggöra:

- organisationsroller,
- security owner,
- governance administrator,
- project owner,
- approval ansvarig,
- read-only,
- external consultant,
- flerpersonsgodkännande,
- organisation policies,
- employee offboarding,
- company-owned data separation,
- private user data separation.
Andrés privata standard får inte tvingas på framtida användare.


## 17. Krav på framtida implementation agents

När Claude, Codex eller annan agent senare arbetar med implementation ska agenten:

- identifiera relevanta kapitel,
- identifiera relevanta MI-kontrakt,
- kartlägga nuvarande implementation,
- redovisa avvikelser,
- visa berörda filer,
- visa migrationspåverkan,
- redovisa risk,
- beskriva testbevis,
- undvika implementation som strider mot canonical krav,
- stoppa och fråga vid verklig governancekonflikt.
Boken ska inte användas som ursäkt för att automatiskt ändra kod.


## 18. Planerade bokleveranser

När samtliga kapitel är skrivna och godkända ska bokpaketet minst innehålla:

00 — Canonical Decision Register

01 — Canonical Book Architecture and Chapter Plan

Chapter 01–32 — Canonical Chapter Manuscripts

Canonical Contract Index

Glossary

Decision-to-Chapter Traceability Matrix

Chapter Dependency Matrix

Canonical Requirements Index

Validation Report

Editorial Review Report

Change Log

Manifest

Complete Canonical Book DOCX

Complete Canonical Book PDF

Canonical Source Markdown Package


## 19. Rekommenderade framtida stödregister

Följande dokument ska skapas senare, inte före kapitelproduktionen:


### 19.1 Canonical Contract Index

Lista över samtliga MI-XX-XXX-kontrakt.


### 19.2 Decision Traceability Matrix

Koppling mellan CDR-beslut och bokkapitel.


### 19.3 Implementation Verification Matrix

Koppling mellan canonical krav och framtida tester.


### 19.4 Glossary

Canonical definitioner för centrala begrepp.


### 19.5 Change Log

Versionsstyrd redovisning av ändringar.


## 20. Kapitelordning och beroenden

Kapitlen ska normalt skrivas i numerisk ordning.

Särskilt viktiga beroenden:

Kapitel 5–8 bygger på Kapitel 1–4.

Kapitel 9–12 bygger på authority och scope.

Kapitel 13–17 bygger på privacy, approval och project isolation.

Kapitel 18–22 bygger på data scope och credential governance.

Kapitel 23–27 bygger på canonical state, credentials och project isolation.

Kapitel 28–31 bygger på hela tidigare arkitekturen.

Kapitel 32 sammanför samtliga tidigare delar till användarupplevelse och implementation contract.

Ett senare kapitel får inte omdefiniera ett tidigare canonical begrepp utan uttryckligt ändringsbeslut.


## 21. Godkännandestatus

Detta dokument är:

Canonical Edition v1.0 — APPROVED

Canonical approval beviljades 2026-07-30 efter att André uttryckligen godkänt:

- boktitel,
- 32-kapitelsstrukturen,
- delindelningen,
- kapitelordningen,
- kapitelmandaten,
- kontraktsnumreringen,
- slutleveransplanen.

## 22. Nästa arbetssteg

När denna bokarkitektur är godkänd ska arbetet fortsätta med:

Chapter 01 — Mobile Intelligence as an Omnira System Domain.md

Kapitlet ska sparas direkt i:

05_BOOKS/07_MOBILE_INTELLIGENCE/

Den tillfälliga huvudmappen ska användas tills hela bokfamiljen är färdig och en kontrollerad slutstädning genomförs.

Inga befintliga rekonstruktions-, arkitektur- eller manusmappar får raderas eller skrivas över under produktionen.

Slutlig bokarkitektur

PART I — DOMAIN, VISION AND CANONICAL FOUNDATIONS


## 01. Mobile Intelligence as an Omnira System Domain


## 02. Vision, Product Scope and Evolution Path


## 03. System Actors, Roles and Trust Relationships


## 04. Core Principles, Invariants and Absolute Prohibitions

PART II — AUTHORITY, GOVERNANCE AND PROJECT BOUNDARIES


## 05. Authority Model L0–L6


## 06. Scope Architecture and Capability Grants


## 07. Approval Architecture and Mandate Lifecycle


## 08. Project Isolation, Tenant Boundaries and Atlas Global View

PART III — PRIVACY, COMMUNICATION AND HUMAN ATTENTION


## 09. Privacy Architecture and Private-by-Default Boundaries


## 10. Communication Channels, Accounts and Content Access


## 11. Outbound Communication, Brand Identity and Human Representation


## 12. Notifications, Attention and Priority Governance

PART IV — DEVICE CONTROL, FILES, MEDIA AND LOCAL CONTEXT


## 13. Device Control Capability Model


## 14. Sensitive Applications and Human-Presence Requirements


## 15. File Operations, Project Storage and Quarantine


## 16. Image, Video, Camera and Microphone Governance


## 17. Location, Geofencing and Physical Context

PART V — MEMORY, DATA, PROVIDERS AND SECURITY


## 18. Local Processing, Cloud Processing and Data Egress


## 19. Provider Routing, Cost, Quality and Resilience


## 20. Memory Architecture and Knowledge Boundaries


## 21. Retention, Deletion, Backup and Recoverability


## 22. Identity, Credentials and Account Recovery

PART VI — MULTI-DEVICE ORCHESTRATION AND DISTRIBUTED EXECUTION


## 23. Omnira Nodes and Execution Roles


## 24. Control Surfaces, Execution Surfaces and Data Locality


## 25. Node Selection, Work Placement and Provider Continuity


## 26. Workflow Ownership, Concurrency and Duplicate Prevention


## 27. Offline Operation, Synchronization and Canonical State

PART VII — VERIFICATION, AUDIT, FAILURE AND LIFECYCLE CONTROL


## 28. Verification, Evidence and Unknown Outcomes


## 29. Failure Handling, Rollback, Compensation and Emergency Stop


## 30. Audit, Explainability, Accountability and Continuous Learning


## 31. Versioning, Testing, Rollout and Capability Expansion

PART VIII — EXPERIENCE, ADOPTION AND CANONICAL IMPLEMENTATION GOVERNANCE


## 32. Mobile Experience, Daily Operations and Canonical Implementation Contract

Status: Ready for owner review.

