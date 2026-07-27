# Kapitel 27 — Drift, observability, incidenter och återhämtning

GainPilot ska fungera när användaren faktiskt behöver tjänsten.

Det räcker inte att systemet:

- fungerar i utvecklingsmiljö,

- klarar automatiska tester,

- har en mergad pull request,

- eller svarar på en enkel health check.

GainPilot ska fungera under verkliga förhållanden:

- när nätverket är instabilt,

- när en extern tjänst ligger nere,

- när en modell svarar långsamt,

- när events levereras flera gånger,

- när en mobil går offline mitt under ett träningspass,

- när data kommer i fel ordning,

- när en migration bara genomförs delvis,

- när ett approval löper ut under en pågående handling,

- och när en autonom agent börjar bete sig annorlunda än förväntat.

GainPilot ska därför byggas som ett observerbart och återhämtningsbart system.

Observability ska göra det möjligt att förstå:

- vad systemet gjorde,

- varför det gjorde det,

- vilken version som användes,

- vilken data och policy som påverkade beslutet,

- vad som lyckades,

- vad som misslyckades,

- vad som fortfarande är osäkert,

- och vilken användarpåverkan som uppstod.

Observability ska inte reduceras till:

- serverloggar,

- CPU-grafer,

- eller en generell dashboard med gröna och röda indikatorer.

GainPilot behöver observability genom hela kedjan:

Användarintention

→ Arnold

→ capabilityval

→ permissionkontroll

→ Hermes-kontekstpaket

→ specialistagent eller domänmotor

→ verktygsanrop

→ event

→ lagring

→ synkronisering

→ användarresultat

→ effektuppföljning.

Om användaren säger:

Jag avslutade passet men resultatet försvann,

ska GainPilot kunna avgöra:

- om passet sparades lokalt,

- om sync påbörjades,

- om servern tog emot resultatet,

- om requesten fick timeout efter lyckad skrivning,

- om samma resultat skickades igen,

- om dubbletten deduplicerades,

- om eventet hamnade i fel ordning,

- om projektionen uppdaterades,

- och vad användaren nu ser.

Systemet ska inte svara:

Något gick fel, försök igen,

om ett nytt försök riskerar att skapa:

- dubbla pass,

- dubbla kalenderhändelser,

- flera publiceringar,

- extra kostnader,

- eller motstridiga programversioner.

GainPilot ska skilja mellan:

- känt misslyckande,

- känt lyckat resultat,

- delvis lyckat resultat,

- degraderat resultat,

- och unknown outcome.

Unknown outcome är särskilt viktigt.

En timeout betyder inte automatiskt att handlingen misslyckades.

Det betyder att avsändaren inte säkert vet vilket resultat som uppstod.

GainPilot ska därför verifiera utfallet innan retry.

Systemet ska bygga återhämtning genom:

- stabila identiteter,

- idempotency keys,

- checkpoints,

- versionshanterade tillstånd,

- outbox och inbox där relevant,

- deduplicering,

- retries med gränser,

- dead-letter-hantering,

- compensation,

- backup,

- restore,

- och verifierad recovery.

Incidenthantering ska vara användarcentrerad.

En incident är inte endast ett tekniskt fel.

En incident kan vara att:

- ett program blev felaktigt aktiverat,

- ett träningsresultat försvann,

- en användares data visades för fel person,

- Arnold genomförde en handling utanför mandatet,

- en kostmotor skapade olämpliga måltider,

- en permissioncache fortsatte tillåta återkallad åtkomst,

- eller ett produktionssystem rapporterades som friskt trots att centrala användarflöden var brutna.

GainPilot ska klassificera incidenter efter verklig påverkan.

Systemet ska kunna prioritera:

1. Människors säkerhet.

2. Tenant- och användarisolering.

3. Förhindrande av fortsatt skada.

4. Bevarande av data och bevis.

5. Återställning av centrala funktioner.

6. Tydlig kommunikation.

7. Full orsaksanalys.

8. Långsiktig förbättring.

Incidentrespons ska inte börja med att dölja problemet eller återställa dashboards till grönt.

Målet är att:

- stoppa fortsatt påverkan,

- förstå det faktiska tillståndet,

- skydda användarna,

- återställa systemet,

- och säkerställa att samma problem inte återkommer på samma sätt.

Grundprincipen är:

GainPilot ska vara byggt för att observera verkligt beteende, upptäcka avvikelser, begränsa skada och återhämta sig verifierbart. Systemet ska aldrig ersätta okänt tillstånd med falsk säkerhet, och ingen incident ska betraktas som avslutad förrän användarpåverkan, data, capabilities, authority och framtida skydd har verifierats.

27.1 DRIFT SOM PRODUKTFÖRMÅGA

Drift ska behandlas som en del av produkten.

Drift omfattar:

- tillgänglighet,

- tillförlitlighet,

- prestanda,

- datakorrekthet,

- säkerhet,

- integritet,

- kostnad,

- och återhämtning.

En tekniskt fungerande tjänst kan fortfarande vara produktmässigt otillgänglig.

27.2 OPERATIVT ANSVAR

Varje kritisk GainPilot-capability ska ha:

- operativ ägare,

- teknisk ägare,

- domänägare,

- incidentkontakt,

- och dokumenterad återhämtningsmodell.

27.3 DEN CANONICAL DRIFTMODELLEN

GainPilot ska ha en canonical modell för operativ status.

Modellen ska minst kunna representera:

- service_identity,

- capability_identity,

- tenant_scope,

- environment,

- deployed_version,

- dependency_status,

- health_status,

- degradation_status,

- current_incidents,

- data_freshness,

- queue_status,

- error_budget,

- last_verified_at,

- recovery_status,

- owner,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

27.4 SERVICEIDENTITET

Varje driftkomponent ska ha stabil identitet.

Exempel:

- Arnold conversation service,

- training plan engine,

- workout logging service,

- Hermes gateway,

- approval service,

- notification service,

- analytics pipeline,

- och deployment controller.

27.5 CAPABILITYFOKUSERAD DRIFT

Driftstatus ska kunna beskrivas per capability.

Exempel:

- passvisning fungerar,

- träningsloggning fungerar lokalt,

- molnsynk är degraded,

- och extern kalenderwrite är stoppad.

Systemet ska inte endast visa:

GainPilot är nere.

27.6 MILJÖ

Status ska skilja mellan:

- development,

- test,

- preview,

- staging,

- production,

- och local/offline.

27.7 VERSION

Det ska gå att se vilken:

- kodversion,

- modellversion,

- promptversion,

- policyversion,

- schemaversion,

- och capabilityversion

som är aktiv.

27.8 KONFIGURATION

Konfigurationsversion ska vara observerbar.

Två instanser med samma kod men olika konfiguration kan bete sig olika.

27.9 FEATURE FLAGS

Aktiva feature flags ska kunna kopplas till:

- tenant,

- användargrupp,

- capability,

- och incident.

27.10 DEPENDENCIES

Varje kritisk tjänst ska deklarera beroenden.

Exempel:

Arnold kan bero på:

- autentisering,

- Hermes,

- modellrouting,

- GainPilot-domändata,

- och eventlagring.

27.11 KRITISKT BEROENDE

Ett kritiskt beroende är ett beroende vars fel stoppar eller gör capabilityn osäker.

27.12 ICKE-KRITISKT BEROENDE

Ett icke-kritiskt beroende kan misslyckas utan att hela capabilityn måste stoppas.

Exempel:

En extern analyticsleverantör ska inte behöva stoppa aktiv träningsloggning.

27.13 DEGRADERING

GainPilot ska kunna fungera i degraderat läge.

Degradering ska vara:

- avsiktlig,

- dokumenterad,

- observerbar,

- och säker.

27.14 SÄKER DEGRADERING

Exempel på säker degradering:

- visa redan hämtat träningspass,

- logga resultat lokalt,

- köa synkronisering,

- använda en godkänd reservmodell,

- eller erbjuda manual mode.

27.15 OSÄKER DEGRADERING

GainPilot ska inte degradera genom att:

- hoppa över permissionkontroll,

- ignorera säkerhetsbegränsningar,

- använda stale medicinsk information,

- eller låta en agent gissa när nödvändig data saknas.

27.16 FAIL OPEN

Fail open innebär att handlingen tillåts när kontrollen misslyckas.

Det ska normalt förbjudas för:

- authorization,

- tenantisolering,

- känslig datadelning,

- köp,

- radering,

- och agentauthority.

27.17 FAIL CLOSED

Fail closed innebär att osäker handling blockeras.

Det ska vara standard för högriskcapabilities.

27.18 FAIL SAFE

Fail safe ska inte alltid betyda total blockering.

Det kan innebära att systemet:

- växlar till read-only,

- sparar lokalt,

- skapar utkast,

- eller väntar på verifiering.

27.19 HEALTH

Health ska bedömas på flera nivåer.

Exempel:

- process health,

- dependency health,

- capability health,

- data health,

- user-flow health,

- och business health.

27.20 PROCESS HEALTH

Process health visar om tjänsten körs.

Det säger inte att den fungerar korrekt.

27.21 DEPENDENCY HEALTH

Dependency health visar om nödvändiga beroenden är tillgängliga.

27.22 CAPABILITY HEALTH

Capability health visar om en verklig förmåga kan genomföras säkert.

27.23 USER-FLOW HEALTH

User-flow health verifierar centrala användarresor.

Exempel:

- öppna dagens pass,

- logga set,

- avsluta pass,

- spara resultat,

- och se uppdaterad historik.

27.24 DATA HEALTH

Data health ska omfatta:

- korrekthet,

- fullständighet,

- aktualitet,

- konsistens,

- provenance,

- och isolering.

27.25 AGENT HEALTH

Agent health ska kunna beskriva:

- modellstatus,

- tool availability,

- policyefterlevnad,

- outputvaliditet,

- correction rate,

- och drift.

27.26 HERMES HEALTH

Hermes health ska omfatta:

- retrieval,

- minimering,

- tenantfilter,

- policybeslut,

- context package generation,

- och revocation.

27.27 PERMISSION HEALTH

Permission health ska omfatta:

- policy engine,

- grant store,

- approvalstatus,

- cache freshness,

- tokenrevocation,

- och audit.

27.28 DRIFTTILLSTÅND

En capability ska kunna ha status som:

- healthy,

- degraded,

- partially_available,

- paused,

- blocked,

- incident,

- recovering,

- verifying,

- eller unavailable.

27.29 HEALTH ÄR INTE BINÄRT

Grönt eller rött räcker inte.

Status ska visa:

- vad som fungerar,

- vad som inte fungerar,

- och vilken risk som finns.

27.30 OBSERVABILITY

Observability är förmågan att förstå internt tillstånd genom systemets externa och interna signaler.

Den ska byggas in från början.

27.31 TRE GRUNDPILARE

Traditionell observability omfattar ofta:

- logs,

- metrics,

- och traces.

GainPilot ska dessutom använda:

- events,

- audit,

- domain signals,

- agent decisions,

- och user-impact signals.

27.32 LOGGAR

Loggar ska beskriva relevanta tekniska händelser.

De ska vara:

- strukturerade,

- tidsstämplade,

- scopeade,

- och korrelerbara.

27.33 STRUKTURERADE LOGGAR

Betydelsefulla loggar ska använda strukturerade fält.

Exempel:

- timestamp,

- severity,

- service,

- capability,

- environment,

- tenant_reference,

- user_reference,

- trace_identity,

- operation_identity,

- status,

- error_code,

- och version.

27.34 INGEN FULL PERSONDATA I LOGG

Loggar ska normalt inte innehålla:

- fullständiga namn,

- e-post,

- träningshistorik,

- kroppsmått,

- privata dialoger,

- progressionsbilder,

- tokens,

- eller secrets.

27.35 REFERENS FÖRE PAYLOAD

Loggen ska prioritera:

- identifierare,

- klassificering,

- och referens

framför full payload.

27.36 REDACTION

Känsliga fält ska redigeras före loggning.

27.37 LOGGSEVERITY

GainPilot ska ha definierade nivåer.

Exempel:

- debug,

- info,

- notice,

- warning,

- error,

- critical,

- och security.

27.38 DEBUG

Debugloggar ska vara begränsade i produktion.

De får inte aktiveras globalt med känslig payload utan kontroll.

27.39 INFO

Info ska beskriva normalt relevant systembeteende utan överdriven volym.

27.40 WARNING

Warning ska signalera avvikelse som ännu inte innebär bekräftad incident.

27.41 ERROR

Error ska visa en misslyckad operation eller ett brutet kontrakt.

27.42 CRITICAL

Critical ska användas för allvarlig tjänste- eller användarpåverkan.

27.43 SECURITY

Säkerhetsrelevanta loggar ska kunna hanteras separat.

27.44 LOGGIDENTITET

Logghändelser ska kunna kopplas till:

- operation,

- trace,

- event,

- approval,

- grant,

- deployment,

- och incident.

27.45 LOGGRETENTION

Olika loggtyper ska ha olika retention.

Obegränsad retention ska inte vara standard.

27.46 LOGGINTEGRITET

Audit- och säkerhetsloggar ska skyddas mot:

- obehörig ändring,

- radering,

- och efterhandskonstruktion.

27.47 LOGGVOLYM

Överloggning kan:

- öka kostnad,

- dölja viktiga signaler,

- och skapa integritetsrisk.

Loggning ska optimeras för användbarhet.

27.48 SAMPLING

Sampling kan användas för högvolymhändelser.

Fel, säkerhetshändelser och kritiska flöden ska inte samplas bort på olämpligt sätt.

27.49 METRICS

Metrics ska visa kvantitativa tillstånd över tid.

De ska kunna omfatta:

- latency,

- throughput,

- errors,

- saturation,

- ködjup,

- kostnad,

- datafreshness,

- och domain outcomes.

27.50 TEKNISKA METRICS

Tekniska metrics kan omfatta:

- request rate,

- response time,

- timeout rate,

- retry rate,

- memory,

- CPU,

- storage,

- och network.

27.51 DOMÄNMETRICS

Domänmetrics kan omfatta:

- misslyckad workout save,

- dubbla resultat,

- programkonflikter,

- substitutionsfel,

- säkerhetsstopp,

- och felaktig progression.

27.52 AGENTMETRICS

Agentmetrics kan omfatta:

- invalid structured output,

- tool failure,

- denied capability,

- hallucinated status,

- correction rate,

- och model fallback.

27.53 PERMISSIONMETRICS

Permissionmetrics kan omfatta:

- denied requests,

- expired approvals,

- false allow,

- false deny,

- time to revoke,

- och break-glass.

27.54 HERMESMETRICS

Hermesmetrics kan omfatta:

- context package size,

- retrieval latency,

- over-retrieval,

- policy denial,

- stale memory use,

- och reduced signal usage.

27.55 SLO

Service Level Objective ska beskriva en önskad tillförlitlighetsnivå.

Exempel:

Minst 99,9 procent av godkända workout-save-operationer ska nå ett verifierat terminalt tillstånd inom definierad tid.

27.56 SLI

Service Level Indicator är det mått som används för att bedöma SLO.

27.57 SLA

Service Level Agreement kan vara ett externt eller avtalsmässigt åtagande.

SLO och SLA ska inte blandas.

27.58 CAPABILITY-SLO

GainPilot ska i första hand skapa SLO per viktig capability.

Exempel:

- läsa aktiv plan,

- logga träningsresultat,

- synka offlinepass,

- och återkalla permission.

27.59 SÄKERHETS-SLO

Vissa skydd ska ha nolltolerans eller särskilda mål.

Exempel:

- cross-tenant data exposure,

- obehörig radering,

- eller köp utan mandat.

27.60 ERROR BUDGET

Error budget ska beskriva hur mycket avvikelse som kan accepteras innan utvecklings- eller releaseprioritering ändras.

27.61 ERROR BUDGET ÄR INTE SKADERÄTT

Ett error budget innebär inte att säkerhets- eller integritetsincidenter är acceptabla.

27.62 BUDGETFÖRBRUKNING

När error budget förbrukas snabbt ska GainPilot kunna:

- pausa riskfyllda releaser,

- prioritera stabilitet,

- och öka reviewkrav.

27.63 TRACES

Tracing ska följa en operation genom flera komponenter.

27.64 TRACEIDENTITET

En operation ska ha en stabil trace identity.

27.65 SPAN

Varje betydelsefullt steg kan representeras som span.

Exempel:

- Arnold receives intent.

- Hermes builds context.

- Permission engine checks grant.

- Training engine adapts workout.

- Result is persisted.

- Notification is sent.

27.66 TRACE CONTEXT

Trace context ska propageras genom:

- API,

- köer,

- events,

- workflows,

- och agentverktyg.

27.67 ASYNKRONA FLÖDEN

Tracing ska stödja asynkrona flöden.

En operation kan fortsätta långt efter den ursprungliga requesten.

27.68 TRACE OCH PRIVAT DATA

Traces ska minimera payload och använda referenser.

27.69 AUDIT

Audit ska visa vem eller vad som fattade och genomförde ett betydelsefullt beslut.

27.70 LOGG OCH AUDIT

Logg och audit är inte samma sak.

Logg beskriver tekniskt beteende.

Audit beskriver ansvar, mandat och betydelsefull effekt.

27.71 DOMAIN EVENTS

Domain events ska beskriva verkliga tillståndsförändringar.

Exempel:

- WorkoutCompleted.

- ProgramActivated.

- ApprovalRevoked.

- ContextPackageIssued.

- CapabilityPaused.

- IncidentDeclared.

27.72 EVENTIDENTITET

Varje event ska ha stabil identitet.

27.73 EVENTVERSION

Events ska ha schemaversion.

27.74 EVENTPROVENANCE

Eventet ska ange:

- producer,

- tenant,

- användarscope,

- tid,

- operation,

- och källa.

27.75 EVENTTID

Systemet ska skilja mellan:

- occurred_at,

- recorded_at,

- received_at,

- och processed_at.

27.76 SEN LEVERANS

Ett event kan komma sent.

Systemet ska inte automatiskt tolka mottagningstid som händelsetid.

27.77 FEL ORDNING

Events kan levereras i annan ordning än de inträffade.

Konsumenter ska ha definierad orderingmodell.

27.78 DUBBEL LEVERANS

Distribuerade system ska anta att meddelanden kan levereras mer än en gång.

27.79 IDEMPOTENT KONSUMTION

Konsumenter ska hantera samma event flera gånger utan dubbla side effects.

27.80 OUTBOX

Outbox-mönster ska användas där systemet behöver säkerställa relationen mellan:

- lokal dataskrivning,

- och publicerat event.

27.81 INBOX

Inbox eller motsvarande ska kunna registrera redan processade meddelanden.

27.82 DEDUPLICERING

Deduplicering ska använda stabil identitet.

Liknande innehåll är inte alltid samma operation.

27.83 IDEMPOTENCY KEY

Känsliga writes ska använda idempotency key eller motsvarande.

Exempel:

- workout completion,

- program activation,

- kalenderwrite,

- köp,

- och extern publicering.

27.84 IDEMPOTENCYSCOPE

Nyckeln ska vara scopead till:

- aktör,

- capability,

- resurs,

- och relevant tidsfönster.

27.85 IDEMPOTENCYRESULTAT

Systemet ska kunna returnera tidigare känt resultat för samma operation.

27.86 RETRY

Retries ska vara kontrollerade.

De ska ha:

- maxförsök,

- backoff,

- jitter,

- timeout,

- och stopcondition.

27.87 EXPONENTIAL BACKOFF

Exponentiell backoff kan minska belastning på felande tjänst.

27.88 JITTER

Jitter ska motverka att många klienter försöker samtidigt.

27.89 RETRYABLE ERROR

GainPilot ska klassificera vilka fel som kan retryas.

27.90 NON-RETRYABLE ERROR

Exempel på normalt icke-retrybara fel:

- invalid permission,

- permanent schemafel,

- avvisat approval,

- och förbjuden capability.

27.91 RETRY BUDGET

Retries ska ha egen budget.

Ett felande beroende får inte skapa obegränsad:

- trafik,

- kostnad,

- eller köbelastning.

27.92 RETRY STORM

Systemet ska kunna upptäcka och stoppa retry storms.

27.93 CIRCUIT BREAKER

Circuit breaker kan användas för att stoppa upprepade anrop till ett felande beroende.

27.94 OPEN CIRCUIT

När circuit är open ska systemet använda:

- säker fallback,

- kö,

- eller tydligt degraderat svar.

27.95 HALF-OPEN

Half-open ska testa om beroendet åter fungerar med begränsad trafik.

27.96 BULKHEAD

Bulkhead-isolering ska begränsa att ett felande område tar ned hela GainPilot.

27.97 KÖER

Asynkrona köer ska ha:

- identitet,

- retention,

- maxålder,

- retry policy,

- dead-letter policy,

- och ägare.

27.98 KÖDJUP

Ködjup ska övervakas.

27.99 KÖÅLDER

Äldsta väntande meddelande kan vara viktigare än totalt antal.

27.100 BACKPRESSURE

Systemet ska kunna bromsa inflöde när downstream inte hinner med.

27.101 DEAD-LETTER QUEUE

Meddelanden som inte kan behandlas efter definierade försök ska kunna flyttas till dead-letter-hantering.

27.102 DLQ ÄR INTE ARKIV

Dead-letter queue ska ha:

- ägare,

- alert,

- triage,

- reparationsprocess,

- och retention.

27.103 REPLAY

Replay ska vara en kontrollerad operation.

Det ska kräva:

- scope,

- dedupliceringskontroll,

- påverkan,

- och approval när risk kräver det.

27.104 INGEN BLIND REPLAY

Alla DLQ-meddelanden ska inte skickas om samtidigt utan förståelse.

27.105 UNKNOWN OUTCOME

Unknown outcome ska vara ett explicit tillstånd.

Det ska användas när systemet inte säkert vet om handlingen:

- genomfördes,

- inte genomfördes,

- eller delvis genomfördes.

27.106 TIMEOUT ÄR INTE FAILURE

Timeout ska inte automatiskt klassificeras som failure.

27.107 VERIFIERING EFTER UNKNOWN OUTCOME

Systemet ska kontrollera:

- operation identity,

- resursversion,

- downstreamstatus,

- eventhistorik,

- och side effects.

27.108 RETRY EFTER VERIFIERING

Retry får endast ske när verifieringen visar att:

- operationen inte genomfördes,

- eller att samma idempotenta operation kan återanvändas säkert.

27.109 PARTIELLT RESULTAT

En operation kan lyckas i vissa steg och misslyckas i andra.

Exempel:

- GainPilot-programmet uppdaterades,

- men kalenderhändelsen misslyckades.

27.110 SAGA

Flerstegsoperationer ska kunna använda saga eller motsvarande koordinering.

27.111 ORCHESTRATION

En orchestrator kan styra stegen och compensation.

27.112 CHOREOGRAPHY

Domänevents kan samordna steg utan central orchestrator.

Modellen ska väljas medvetet.

27.113 COMPENSATION

Compensation ska försöka neutralisera en tidigare effekt.

Compensation är inte alltid samma sak som rollback.

27.114 COMPENSATIONSEXEMPEL

Exempel:

- återställa tidigare programversion,

- ta bort felaktig kalenderhändelse,

- återkalla delning,

- eller skapa återbetalning.

27.115 IRREVERSIBEL HANDLING

Vissa effekter kan inte göras ogjorda.

Exempel:

- extern mottagare har redan sett information,

- eller notis har redan skickats.

Systemet ska då:

- stoppa fortsatt påverkan,

- dokumentera,

- informera,

- och begränsa skada.

27.116 CHECKPOINT

Långvariga workflows ska skapa checkpoints.

27.117 CHECKPOINTINNEHÅLL

Checkpoint ska kunna visa:

- slutförda steg,

- pending steps,

- resursversioner,

- approvals,

- budget,

- och senaste verifierade tillstånd.

27.118 RESUME

Återupptagning ska ske från senaste verifierade checkpoint.

27.119 INGEN BLIND RESUME

Före resume ska systemet kontrollera att:

- mandatet gäller,

- context är aktuellt,

- och externa tillstånd inte förändrats.

27.120 CANCEL

Workflow ska kunna avbrytas.

27.121 CANCELLATION

Cancellation ska vara:

- idempotent,

- observerbar,

- och kopplad till compensation där relevant.

27.122 ZOMBIE WORKFLOW

Systemet ska upptäcka workflows som:

- inte gör framsteg,

- saknar ägare,

- eller väntar på utgånget approval.

27.123 LEASE

Distribuerade workers kan använda leases för att äga arbete tillfälligt.

27.124 LEASE EXPIRY

Om worker dör ska lease löpa ut.

27.125 FENCING TOKEN

Fencing token ska kunna förhindra att en gammal worker fortsätter skriva efter att ny worker tagit över.

27.126 SPLIT BRAIN

GainPilot ska skydda mot två samtidiga aktiva ägare av samma kritiska operation.

27.127 OFFLINE

Aktivt träningspass ska kunna fungera med begränsad offlineförmåga.

27.128 OFFLINEPAKET

Offlinepaket kan innehålla:

- aktivt program,

- aktuellt pass,

- godkända övningsdata,

- relevanta säkerhetsbegränsningar,

- och lokala loggningsregler.

27.129 OFFLINEMINIMERING

Endast nödvändiga data ska lagras lokalt.

27.130 OFFLINEIDENTITET

Lokala operationer ska få stabil identitet före synk.

27.131 OFFLINESYNK

Vid återanslutning ska synk:

- vara idempotent,

- kontrollera versioner,

- och hantera konflikter.

27.132 KONFLIKT

Konflikt uppstår när lokal och central version förändrats oberoende.

27.133 AUTOMATISK KONFLIKTLÖSNING

Automatisk lösning får användas för tydliga lågriskfall.

27.134 MANUELL KONFLIKTLÖSNING

Betydelsefulla konflikter ska visas begripligt.

Exempel:

Du ändrade passet offline samtidigt som programmet uppdaterades på en annan enhet.

27.135 LAST WRITE WINS

Last-write-wins ska inte vara universell konfliktmodell.

27.136 MERGE

Vissa data kan mergeas.

Exempel:

- separata setresultat,

- eller oberoende anteckningar.

27.137 IMMUTABLE EVENTS

Historiska träningshändelser kan bevaras som append-only events med separata korrigeringar.

27.138 KORRIGERING

En korrigering ska inte skriva om historien utan spår.

27.139 BACKUP

GainPilot ska ha dokumenterad backupstrategi.

27.140 BACKUPTYPER

Backup kan omfatta:

- databas,

- objektlagring,

- konfiguration,

- secretsmetadata,

- och canonical artefakter.

27.141 BACKUPFREKVENS

Frekvens ska baseras på:

- datavärde,

- förändringstakt,

- och återhämtningskrav.

27.142 RPO

Recovery Point Objective anger hur mycket dataförlust som högst kan accepteras.

27.143 RTO

Recovery Time Objective anger önskad tid till återställning.

27.144 CAPABILITYSPECIFIK RPO OCH RTO

Olika capabilities kan ha olika krav.

27.145 BACKUP ÄR INTE RESTORE

En backup är inte bevisad förrän restore har testats.

27.146 RESTORETEST

Restore ska testas återkommande.

27.147 RESTOREMILJÖ

Testrestore ska ske i isolerad miljö.

27.148 RESTOREVERIFIERING

Efter restore ska systemet verifiera:

- schema,

- datakonsistens,

- tenantisolering,

- filer,

- index,

- och centrala user flows.

27.149 RADERAD DATA

Restore får inte återaktivera data som användaren begärt raderad.

27.150 TOMBSTONES

Raderingsmarkörer eller motsvarande ska kunna återappliceras efter restore.

27.151 SECRETS

Backup och restore av secrets ska följa separat säker modell.

27.152 CANONICAL BOKMATERIAL

GainPilots canonical bok, manifest, checksummor och godkända artefakter ska ingå i dokumenterad bevarandestrategi.

27.153 DISASTER RECOVERY

GainPilot ska ha en disaster recovery-plan.

27.154 DR-SCENARIER

Planen ska omfatta:

- primär databas otillgänglig,

- regionfel,

- korrupt schema,

- komprometterat konto,

- förlorade secrets,

- felaktig deployment,

- och leverantörsbortfall.

27.155 DR-ÄGARE

Disaster recovery ska ha tydlig ägare.

27.156 DR-ÖVNING

Planen ska övas.

27.157 TABLETOP

Tabletop-övningar kan användas för att gå igenom scenarier utan verklig produktionspåverkan.

27.158 GAME DAY

Kontrollerade game days kan testa verklig återhämtningsförmåga i säkra miljöer.

27.159 CHAOS TESTING

Chaos testing kan användas selektivt för:

- dependency failure,

- latency,

- queue delay,

- och worker loss.

Det ska inte användas oansvarigt i känsliga flöden.

27.160 INCIDENT

En incident är en händelse som påverkar eller hotar:

- användarsäkerhet,

- integritet,

- tillgänglighet,

- datakorrekthet,

- ekonomi,

- eller systemkontroll.

27.161 INCIDENTIDENTITET

Varje incident ska ha stabil identitet.

27.162 DEN CANONICAL INCIDENTMODELLEN

Incidentmodellen ska minst kunna representera:

- incident_identity,

- detected_at,

- declared_at,

- severity,

- affected_capabilities,

- affected_tenants,

- affected_users,

- data_classes,

- safety_impact,

- privacy_impact,

- financial_impact,

- technical_impact,

- current_status,

- commander,

- responders,

- containment,

- recovery,

- communication,

- evidence,

- root_cause_status,

- follow_up_actions,

- and closure_status.

27.163 DETECTION

Incidenten kan upptäckas genom:

- alert,

- användarrapport,

- support,

- agent,

- säkerhetskontroll,

- dashboard,

- eller extern part.

27.164 DECLARATION

Incident declaration ska vara en uttrycklig handling.

27.165 TID TILL DEKLARATION

Systemet ska mäta hur lång tid det tar från första signal till incident declaration.

27.166 SEVERITY

GainPilot ska ha en tydlig severitymodell.

27.167 SEV-0

SEV-0 kan användas för existentiell eller systemomfattande kritisk incident.

Exempel:

- omfattande cross-tenant-läcka,

- okontrollerad produktionsagent med bred write,

- eller systemisk förlust av kontroll över användardata.

27.168 SEV-1

SEV-1 kan omfatta:

- stor säkerhets- eller integritetspåverkan,

- omfattande dataförlust,

- eller centrala capabilities otillgängliga för stor del av användarna.

27.169 SEV-2

SEV-2 kan omfatta betydande men begränsad påverkan.

27.170 SEV-3

SEV-3 kan omfatta mindre eller lokalt problem med tydlig workaround.

27.171 SEV-4

SEV-4 kan omfatta låg påverkan eller förbättringsärende utan pågående skada.

27.172 SEVERITY ÄR INTE ENDA PRIORITET

Brådska ska även påverkas av:

- pågående skada,

- antal användare,

- irreversibilitet,

- och möjlighet till snabb containment.

27.173 INCIDENT COMMANDER

Allvarliga incidenter ska ha incident commander.

27.174 COMMANDERROLL

Incident commander ska:

- samordna,

- prioritera,

- fördela ansvar,

- och hålla gemensam status.

Commander behöver inte själv felsöka allt.

27.175 TECHNICAL LEAD

Technical lead ska styra den tekniska undersökningen.

27.176 DOMAIN LEAD

Domain lead ska bedöma användar- och domänpåverkan.

27.177 SECURITY OCH PRIVACY LEAD

Säkerhets- och integritetsroller ska delta när relevant.

27.178 COMMUNICATION LEAD

Kommunikationsansvarig ska säkerställa tydliga interna och externa uppdateringar.

27.179 SCRIBE

En scribe kan dokumentera:

- tidslinje,

- beslut,

- hypoteser,

- och åtgärder.

27.180 INCIDENTKANAL

Incidenten ska ha en tydlig samarbetsyta.

27.181 SINGLE SOURCE OF TRUTH

Incidentstatus ska ha en canonical källa.

27.182 TIDSLINJE

Alla viktiga händelser ska registreras med tid.

27.183 HYPOTESER

Felsökningshypoteser ska skiljas från bekräftade fakta.

27.184 BEVIS

Bevis ska bevaras innan destruktiva åtgärder.

27.185 CONTAINMENT

Containment ska stoppa eller begränsa fortsatt påverkan.

27.186 CONTAINMENTEXEMPEL

Containment kan vara:

- stoppa en capability,

- frysa writes,

- återkalla token,

- stänga extern integration,

- rulla tillbaka feature flag,

- eller isolera tenant.

27.187 MINSTA BLAST RADIUS

Containment ska vara så granulärt som möjligt.

27.188 SÄKERHET FÖRE TILLGÄNGLIGHET

Vid konflikt ska GainPilot prioritera:

- användarsäkerhet,

- tenantisolering,

- och dataskydd

framför full funktionalitet.

27.189 BEVARA DATA

Incidentrespons får inte radera relevant data eller bevis utan kontroll.

27.190 FÖRBJUDEN PANIKSTÄDNING

Systemet ska inte:

- rensa loggar,

- skriva över disk,

- eller radera branches

för att snabbt återställa ett grönt tillstånd.

27.191 DIAGNOS

Diagnos ska identifiera:

- symptom,

- påverkade komponenter,

- startpunkt,

- och möjliga orsaker.

27.192 ROOT CAUSE

Root cause ska inte anges innan tillräcklig evidens finns.

27.193 BIDRAGANDE FAKTORER

Incidenter har ofta flera bidragande faktorer.

Exempel:

- otydligt scope,

- saknat test,

- för bred permission,

- stale cache,

- och bristande alert.

27.194 TRIGGER

Trigger är den händelse som startade incidenten.

Trigger och root cause kan vara olika.

27.195 RECOVERY

Recovery ska återställa säkra capabilities.

27.196 RECOVERYORDNING

Återställning ska ske i prioriterad ordning.

Exempel:

1. Stoppa dataläcka.

2. Verifiera tenantisolering.

3. Återställa read-only.

4. Återställa lokal loggning.

5. Återställa molnsynk.

6. Återställa automation.

27.197 GRADVIS RECOVERY

Återställning ska kunna ske:

- internt,

- per tenant,

- per capability,

- eller per användargrupp.

27.198 RECOVERY CHECKLIST

Varje kritisk capability ska ha verifieringschecklista.

27.199 RECOVERY ÄR INTE CLOSURE

Att tjänsten åter svarar innebär inte att incidenten är avslutad.

27.200 DATAREPARATION

Incidenten kan kräva:

- deduplicering,

- replay,

- rekonstruktion,

- korrigering,

- eller användarbekräftelse.

27.201 DATAREPARATIONSSCOPE

Reparation ska vara scopead och förhandsgranskad.

27.202 DRY RUN

Datareparationsverktyg ska kunna köras i dry-run.

27.203 REPAIR MANIFEST

En reparationskörning ska beskriva:

- vilka poster,

- vilken förändring,

- förväntat resultat,

- och rollback eller compensation.

27.204 REPAIR IDENTITET

Varje reparationskörning ska ha unik identitet.

27.205 IDEMPOTENT REPAIR

Reparation ska vara idempotent där möjligt.

27.206 VERIFIERING EFTER REPAIR

Resultatet ska verifieras genom:

- queries,

- invariants,

- och användarflöden.

27.207 ANVÄNDARKORRIGERING

När systemet inte säkert kan avgöra korrekt data ska användaren kunna hjälpa till att lösa konflikten.

27.208 KOMMUNIKATION

Incidentkommunikation ska vara:

- sann,

- begriplig,

- aktuell,

- och proportionerlig.

27.209 INGEN FALSK SÄKERHET

GainPilot ska inte säga:

Allt är löst

innan detta verifierats.

27.210 INTERN STATUS

Intern status ska visa:

- vad som är känt,

- vad som är osäkert,

- vad som görs,

- och nästa uppdatering.

27.211 ANVÄNDARSTATUS

Användare ska få information när incidenten påverkar deras:

- data,

- träning,

- kost,

- delning,

- eller betalning

på ett relevant sätt.

27.212 STATUS PAGE

GainPilot kan ha status page för större tjänstepåverkan.

27.213 PRIVAT INCIDENTINFORMATION

Status page ska inte avslöja:

- persondata,

- säkerhetsdetaljer,

- eller information som förvärrar incidenten.

27.214 DIREKTANVÄNDARINFORMATION

Berörda användare kan behöva direkt information.

27.215 INNEHÅLL I ANVÄNDARINFORMATION

Meddelandet ska kunna beskriva:

- vad som påverkades,

- tidsperiod,

- vad GainPilot gjort,

- vad användaren behöver göra,

- och var mer information finns.

27.216 INGEN SKULDBELÄGGNING

Användaren ska inte skuldbeläggas för systemfel.

27.217 SUPPORT

Support ska få:

- aktuell incidentstatus,

- godkända svar,

- och eskaleringsväg.

27.218 SUPPORT FÅR INTE GISSA

Support ska inte hitta på orsaker eller recoverytid.

27.219 ETA

Tidsestimat ska uttryckas försiktigt.

Ett osäkert estimat ska inte presenteras som löfte.

27.220 REGULATORISK OCH AVTALSMÄSSIG KOMMUNIKATION

Säkerhets- och integritetsincidenter kan kräva särskilda notifieringsprocesser.

Dessa ska ägas av behörig funktion.

27.221 POST-INCIDENT REVIEW

Betydelsefulla incidenter ska följas av post-incident review.

27.222 BLAMELESS

Review ska vara systemorienterad och inte bygga på förenklad skuld.

Det betyder inte att ansvar försvinner.

27.223 REVIEWINNEHÅLL

Review ska minst omfatta:

- sammanfattning,

- påverkan,

- tidslinje,

- detection,

- containment,

- recovery,

- trigger,

- root cause,

- bidragande faktorer,

- vad som fungerade,

- vad som inte fungerade,

- och förbättringar.

27.224 FEM VARFÖR

Metoder som fem varför kan användas.

De ska inte stoppa vid en individhandling när systemiska faktorer finns.

27.225 VARFÖR SAKNADES SKYDDET

Review ska fråga:

- Varför kunde felet ske?

- Varför upptäcktes det inte tidigare?

- Varför begränsades inte påverkan?

- Varför var recovery svår?

- Och varför kunde samma klass av fel återkomma?

27.226 ACTION ITEMS

Förbättringsåtgärder ska ha:

- ägare,

- prioritet,

- deadline,

- scope,

- och verifiering.

27.227 INGEN OÄNDLIG ÅTGÄRDSLISTA

Action items ska vara:

- relevanta,

- prioriterade,

- och genomförbara.

27.228 PREVENT

Vissa åtgärder ska minska sannolikheten för återkomst.

27.229 DETECT

Vissa åtgärder ska förbättra upptäckt.

27.230 CONTAIN

Vissa åtgärder ska minska blast radius.

27.231 RECOVER

Vissa åtgärder ska förbättra återställning.

27.232 LEARN

Vissa åtgärder ska förbättra dokumentation, utbildning och testning.

27.233 REGRESSIONSTEST

Ett verifierat fel bör skapa regressionstest där det är möjligt.

27.234 RUNBOOK

Incidentlärande ska uppdatera runbooks.

27.235 POLICY

Incidenten kan kräva ändrad policy.

Policyändring ska följa normal governance.

27.236 AUTHORITYREVIEW

Agent- eller serviceauthority ska omprövas när incidenten beror på för bred autonomi.

27.237 MODELLREVIEW

Agentmodell ska omprövas vid:

- hallucinerad tool use,

- förändrad säkerhetsbedömning,

- eller policybrott.

27.238 DEPENDENCYREVIEW

Leverantör eller dependency ska omprövas när dess fel skapat oproportionerlig påverkan.

27.239 CLOSURE

Incidenten ska endast stängas när definierade closurekriterier är uppfyllda.

27.240 CLOSUREKRITERIER

Kriterier kan omfatta:

- fortsatt påverkan stoppad,

- system återställt,

- data verifierad,

- berörda informerade,

- action items registrerade,

- och ägare accepterat closure.

27.241 CLOSED OCH RESOLVED

Resolved och closed ska kunna skiljas.

Resolved kan betyda att aktiv påverkan upphört.

Closed kan kräva full review och uppföljning.

27.242 REOPEN

Incident ska kunna återöppnas om:

- problemet återkommer,

- data visar fortsatt påverkan,

- eller orsaksanalysen var fel.

27.243 RUNBOOKS

Kritiska capabilities ska ha runbooks.

27.244 RUNBOOKINNEHÅLL

Runbook ska kunna innehålla:

- symptom,

- dashboards,

- kontroller,

- containment,

- recovery,

- verifiering,

- rollback,

- och escalation.

27.245 RUNBOOKTEST

Runbooks ska testas och hållas aktuella.

27.246 AUTOMATISERAD RUNBOOK

Vissa säkra steg kan automatiseras.

27.247 INGEN OBEGRÄNSAD AUTO-REMEDIATION

Auto-remediation ska ha:

- explicit scope,

- stoppregler,

- och audit.

27.248 AUTO-REMEDIATIONEXEMPEL

Lågriskexempel kan vara:

- starta om en stateless worker,

- öppna circuit breaker,

- eller pausa en kökonsument.

27.249 HÖGRISKREPARATION

Följande ska normalt kräva approval:

- dataradering,

- replay i stor skala,

- permissionändring,

- schemareparation,

- och secretrotation med bred påverkan.

27.250 ON-CALL

GainPilot ska ha en on-call-modell när produkten kräver det.

27.251 ON-CALLANSVAR

On-call ska veta:

- vilka alerts som kräver handling,

- vilka runbooks som gäller,

- och hur escalation sker.

27.252 ALERT

Ett alert ska vara handlingsbart.

27.253 ALERTINNEHÅLL

Alertet ska kunna visa:

- symptom,

- påverkan,

- capability,

- severity,

- tid,

- och första kontroll.

27.254 ALERTFATIGUE

För många irrelevanta alerts försämrar säkerheten.

27.255 ALERTDEDUPLICERING

Liknande alerts ska grupperas.

27.256 ALERTSUPPRESSION

Alerts kan tillfälligt undertryckas under:

- känd maintenance,

- eller aktiv incident.

Suppression ska vara tidsbegränsad.

27.257 MAINTENANCE WINDOW

Planerat underhåll ska ha:

- scope,

- tid,

- förväntad påverkan,

- owner,

- och rollback.

27.258 CHANGE FREEZE

GainPilot ska kunna frysa förändringar under:

- allvarlig incident,

- känslig period,

- eller instabil huvudlinje.

27.259 CHANGE FREEZE ÄR INTE TOTALT STOPP

Kritiska säkerhetsfixar kan fortfarande behöva genomföras genom särskild process.

27.260 OPERATIV DASHBOARD

Driftdashboard ska visa:

- centrala capabilities,

- aktiva incidenter,

- SLO,

- error budget,

- dependencies,

- köer,

- deployments,

- och datafreshness.

27.261 DOMÄNDASHBOARD

Domändashboard ska visa verkliga GainPilot-risker.

Exempel:

- workout-save failure,

- programkonflikter,

- säkerhetsstopp,

- och substitutionskorrigeringar.

27.262 EXECUTIVE DASHBOARD

Executive Intelligence ska få minimerade operativa signaler.

Atlas behöver normalt inte fulla tekniska loggar.

27.263 USER-FACING STATUS

Användaren ska kunna se relevant lokal status.

Exempel:

Ditt pass är sparat på telefonen och väntar på säker synkronisering.

27.264 INGEN TEKNISK FELKOD SOM ENDA SVAR

Användaren ska få begriplig information och säkert nästa steg.

27.265 COST OBSERVABILITY

Drift ska även följa kostnad.

27.266 KOSTNAD PER CAPABILITY

Kostnad ska kunna kopplas till:

- Arnold-svar,

- programgenerering,

- research,

- media,

- och datahantering.

27.267 KOSTNADSINCIDENT

En oväntad kostnadsökning kan vara incident.

27.268 KOSTNADSSTOPP

Systemet ska kunna stoppa icke-kritisk kostnadsdrivande automation.

27.269 SÄKERHET FÅR INTE STÄNGAS AV FÖR KOSTNAD

Kritisk säkerhet och dataskydd ska inte stoppas enbart för att kostnadsbudget förbrukats.

27.270 CAPACITY

GainPilot ska planera kapacitet.

27.271 SATURATION

Systemet ska övervaka mättnad i:

- CPU,

- databas,

- kö,

- connections,

- rate limits,

- modellkapacitet,

- och support.

27.272 RATE LIMITING

Rate limiting ska skydda:

- system,

- användare,

- leverantörer,

- och budget.

27.273 USER-FAIRNESS

En enskild tenant eller agent ska inte kunna förbruka all gemensam kapacitet.

27.274 PRIORITERING UNDER BELASTNING

Vid hög belastning ska GainPilot prioritera:

1. Säkerhet och permission.

2. Aktiva träningspass och databevarande.

3. Centrala användarflöden.

4. Kritisk kommunikation.

5. Bakgrundsanalys.

6. Lågriskresearch och icke-kritisk media.

27.275 LOAD SHEDDING

Icke-kritiska uppgifter ska kunna skjutas upp.

27.276 MODELLFALLBACK

GainPilot kan använda reservmodell.

Fallback ska vara godkänd per capability.

27.277 MODELLKVALITET

Billigare eller snabbare fallback får inte användas där den saknar tillräcklig säkerhet eller domänkapacitet.

27.278 LEVERANTÖRSFEL

Externa leverantörer ska ha dokumenterad failure model.

27.279 MULTI-PROVIDER

Flera leverantörer kan minska beroende.

Det ökar samtidigt:

- komplexitet,

- testbehov,

- och dataskyddsfrågor.

27.280 PORTABILITET

GainPilot ska undvika onödig leverantörslåsning i kritiska capabilities.

27.281 STATUS FRÅN EXTERN LEVERANTÖR

Leverantörens status page är en signal.

GainPilot ska verifiera sin egen användarpåverkan.

27.282 SCHEDULED JOBS

Schemalagda jobb ska ha:

- identity,

- owner,

- cadence,

- timeout,

- retry,

- och last successful run.

27.283 MISSED RUN

Missad körning ska vara observerbar.

27.284 DUBBEL KÖRNING

Scheduled jobs ska vara idempotenta eller skyddade mot överlapp.

27.285 CRON HEARTBEAT

Kritiska schemalagda jobb ska kunna ge heartbeat.

27.286 STALE HEARTBEAT

Avsaknad av heartbeat ska skapa relevant signal.

27.287 DATAFRESHNESS

Projektioner och dashboards ska visa när data senast uppdaterades.

27.288 STALE DATA

Stale data ska inte visas som aktuell utan markering.

27.289 CACHE

Cache ska ha:

- owner,

- TTL,

- invalidation,

- scope,

- och consistency model.

27.290 CACHE INCIDENT

Stale eller cross-tenant-cache ska behandlas som allvarligt.

27.291 CACHE STAMPEDE

Systemet ska skydda mot många samtidiga cachemissar.

27.292 DATABASE

Databasen ska övervakas för:

- connections,

- locks,

- slow queries,

- replication lag,

- storage,

- och errors.

27.293 SCHEMA INVARIANTS

Databasen ska ha invariants som skyddar:

- tenantrelation,

- uniqueness,

- version,

- och kritiska tillstånd.

27.294 PROJECTION

Projektioner ska kunna byggas om från canonical källa där arkitekturen tillåter det.

27.295 REBUILD

Rebuild ska vara scopead och verifierad.

27.296 DRIFT AV AGENTSYSTEM

Agentdrift ska övervaka mer än teknisk tillgänglighet.

27.297 BEHAVIORAL BASELINE

Varje agent ska ha baseline för:

- tool use,

- kontextstorlek,

- denial rate,

- kostnad,

- och resultatstruktur.

27.298 BEHAVIORAL DRIFT

Drift kan innebära:

- fler verktygsanrop,

- bredare kontext,

- längre svar,

- fler permissionsförfrågningar,

- eller högre korrigeringsgrad.

27.299 MODEL DRIFT

Modellbeteende kan förändras utan kodändring.

Därför ska leverantörs- och modellversion följas.

27.300 PROMPT DRIFT

Prompt- och systeminstruktioner ska versioneras och övervakas.

27.301 TOOL DRIFT

Ett verktyg kan ändra:

- schema,

- side effects,

- eller felbeteende.

Agenten ska inte anta stabilitet.

27.302 POLICY DRIFT

Faktisk enforcement ska jämföras med canonical policy.

27.303 KNOWLEDGE DRIFT

Agentens kunskapsindex kan bli inaktuellt relativt repository och bok.

27.304 DRIFTINCIDENT

Betydelsefull drift ska kunna skapa incident eller authoritysänkning.

27.305 AUTOMATISK AUTHORITYSÄNKNING

Vid tydlig kvalitetssänkning kan systemet automatiskt:

- gå från execute till propose-only,

- pausa capability,

- eller kräva approval.

Detta ska vara policybestämt.

27.306 INGEN AUTOMATISK AUTHORITYHÖJNING

Återställd kvalitet ska inte automatiskt höja authority fullt ut.

27.307 OBSERVABILITY FÖR APPROVAL

Systemet ska kunna se:

- requested,

- viewed,

- approved,

- expired,

- executed,

- failed,

- och unknown outcome.

27.308 APPROVAL BOTTLENECK

Många väntande approvals kan skapa operativ risk.

27.309 APPROVAL ESCALATION

Eskalering ska ske utan att tyst godkänna.

27.310 OBSERVABILITY FÖR BUDGET

Systemet ska kunna se:

- förbrukning,

- prognos,

- avvikelse,

- och stoppade actions.

27.311 INCIDENTSIMULERING

GainPilot ska simulera relevanta incidentscenarier.

27.312 SIMULERINGSEXEMPEL

Exempel:

- modellleverantör ligger nere,

- permissioncache är stale,

- workout save får timeout efter lyckad write,

- två enheter redigerar samma program,

- och deployment har unknown outcome.

27.313 TEST AV MÄNSKLIGA PROCESSER

Incidentövningar ska även testa:

- roller,

- kommunikation,

- beslut,

- och escalation.

27.314 TEST AV DOKUMENTATION

Runbooks ska verifieras mot verkliga verktyg och system.

27.315 TEST AV NÖDSTOPP

Projekt-, capability-, agent- och globalt nödstopp ska testas.

27.316 TEST AV ÅTERSTART

Gradvis återstart ska testas.

27.317 TEST AV BACKUP

Backupintegritet ska testas.

27.318 TEST AV RESTORE

Restore ska genomföras praktiskt.

27.319 TEST AV RPO OCH RTO

Övningen ska visa om kraven kan uppfyllas.

27.320 TEST AV EXTERN BEROENDEFÖRLUST

GainPilot ska kunna visa säkert degraderat beteende.

27.321 TEST AV DATALÄCKA

Tenant- och användarisolering ska testas med adversarial scenarios.

27.322 TEST AV UNKNOWN OUTCOME

Systemet ska verifiera resultat före retry.

27.323 TEST AV DLQ

Dead-letter-hantering och replay ska testas.

27.324 TEST AV COMPENSATION

Saga-compensation ska verifieras.

27.325 TEST AV OFFLINEKONFLIKT

Flera enheter och stale versioner ska testas.

27.326 TEST AV AGENTDRIFT

Nya eller förändrade agentbeteenden ska upptäckas.

27.327 SHADOW MODE

Nya drifts-, detektions- och recoveryregler ska kunna köras i shadow mode.

27.328 SHADOW ALERT

Shadow alert får inte störa on-call men ska utvärderas.

27.329 PARALLELL JÄMFÖRELSE

Aktiv och ny alertregel ska jämföras för:

- precision,

- recall,

- latency,

- och handlingsbarhet.

27.330 CANARY

Ny recoveryautomation ska börja i lågriskområde.

27.331 INGEN FÖRSTA CANARY PÅ DESTRUKTIV REPAIR

Dataradering eller bred replay ska inte vara första canary.

27.332 OBSERVABILITY-AS-CODE

Dashboards, alerts och SLO ska där möjligt versionsstyras.

27.333 RUNBOOK-AS-CODE

Körbara och verifierbara runbooks kan versionsstyras.

27.334 INCIDENT-AS-DATA

Incidenter ska kunna analyseras strukturerat över tid.

27.335 INCIDENTMÅTT

GainPilot ska kunna följa:

- incident count,

- severity,

- time to detect,

- time to declare,

- time to contain,

- time to recover,

- och recurrence.

27.336 MTTR

Mean Time to Recovery kan användas.

Definitionen ska vara tydlig.

27.337 MTTD

Mean Time to Detect ska följas.

27.338 MTTA

Mean Time to Acknowledge kan följas.

27.339 TIME TO CONTAIN

Tid till containment ska följas särskilt vid säkerhets- och dataincidenter.

27.340 REOPEN RATE

Andel återöppnade incidenter kan visa för tidig closure.

27.341 RECURRENCE RATE

Återkommande incidentklass ska följas.

27.342 USER IMPACT MINUTES

Användarpåverkan kan mätas genom:

- antal användare,

- tid,

- och capabilitykritikalitet.

27.343 DATA IMPACT

Incidenter ska kunna kategoriseras efter:

- lost,

- delayed,

- duplicated,

- corrupted,

- exposed,

- eller unavailable data.

27.344 AGENT IMPACT

Agentincidenter ska kunna kategoriseras efter:

- wrong recommendation,

- unauthorized action,

- hallucinated status,

- tool abuse,

- eller data overreach.

27.345 ACTION ITEM COMPLETION

Post-incident actions ska följas till verifierad completion.

27.346 INTE STÄNGD GENOM TICKETCLOSE

En action item är inte klar enbart för att ärendet stängts.

Effekten ska verifieras.

27.347 MÄNSKLIGT ANSVAR

Drift, incidenter och recovery ska ha mänskliga ägare.

27.348 ATLAS ROLL

Atlas ska kunna:

- sammanställa operativa signaler,

- identifiera riskmönster,

- föreslå prioritering,

- och följa action items.

Atlas ska inte själv deklarera closure för allvarlig incident utan rätt ägare.

27.349 ARNOLDS ROLL

Arnold ska:

- ge användaren begriplig status,

- skydda aktivt träningsflöde,

- använda safe mode,

- och inte gissa om data.

27.350 HERMES ROLL

Hermes ska säkerställa att incidentanalys får:

- minimerad,

- scopead,

- och auditerad data.

27.351 UTVECKLINGSAGENTERS ROLL

Utvecklingsagenter kan hjälpa till med:

- diagnos,

- reproduktion,

- fix,

- tester,

- och dokumentation.

De ska följa incident- och repositorygovernance.

27.352 INGEN OBEGRÄNSAD INCIDENTACCESS

En incident ska inte automatiskt ge alla agenter full:

- produktionsdata,

- secrets,

- eller repositoryaccess.

27.353 KONTROLLERAD DRIFTUTVECKLING

Förändringar ska följa:

Signal

→ operativ analys

→ riskbedömning

→ godkänt scope

→ separat branch

→ implementation

→ fault injection och recoverytest

→ security- och privacytest

→ shadow mode

→ pull request

→ operativ review

→ canary

→ kontrollerad merge

→ produktionverifiering

→ uppföljning.

27.354 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för drift, observability, incidenter och återhämtning.

**Kontrakt GP-526 — Drift ska bedömas per capability**

GainPilot får inte beskriva hela produkten som frisk eller nere utan att kunna visa vilka användarförmågor, beroenden och datavägar som fungerar, är degraderade eller stoppade.

**Kontrakt GP-527 — Process health är inte produkthälsa**

En svarande tjänst eller grön infrastrukturkontroll får inte användas som enda bevis för att centrala GainPilot-flöden fungerar korrekt och säkert.

**Kontrakt GP-528 — Observability ska följa hela beslutskedjan**

Användarintention, agent, Hermes, permission, capability, verktyg, event, lagring och användarresultat ska kunna korreleras genom stabila identiteter och spårbar provenance.

**Kontrakt GP-529 — Loggar ska vara strukturerade och minimerade**

Produktionloggar och traces ska ge tillräcklig diagnostik utan att lagra full privat användardata, secrets eller onödiga agentpayloads.

**Kontrakt GP-530 — Domän- och användarsignaler ska komplettera tekniska metrics**

Tillgänglighet, latency och error rate ska kompletteras med mått för datakorrekthet, programfunktion, träningsloggning, permission, agentkvalitet och verklig användarpåverkan.

**Kontrakt GP-531 — SLO ska definieras per kritisk capability**

GainPilot ska ha mätbara mål för centrala förmågor och får inte förlita sig enbart på en generell tjänsteuptime.

**Kontrakt GP-532 — Unknown outcome ska vara ett explicit tillstånd**

Timeout, avbrutet workflow eller osäker downstreamrespons får inte automatiskt klassificeras som failure eller success.

**Kontrakt GP-533 — Retry får endast ske efter säker klassificering**

Systemet ska verifiera operation, side effects, idempotency identity och resursversion innan en osäker handling görs om.

**Kontrakt GP-534 — Side effects ska vara idempotenta eller deduplicerade**

Workout-save, programaktivering, kalenderwrite, köp, publicering och andra betydelsefulla writes ska skyddas mot dubbla effekter.

**Kontrakt GP-535 — Asynkrona meddelanden ska tåla dubblering och fel ordning**

Events, queues och consumers ska ha stabil identitet, version, provenance, deduplicering och definierad orderingmodell.

**Kontrakt GP-536 — Degradering får inte kringgå skydd**

Safe mode och fallback får aldrig hoppa över tenantisolering, permission, säkerhetsbegränsning, dataminimering eller kritisk domänkontroll.

**Kontrakt GP-537 — Offlinearbete ska bevaras och synkas säkert**

Lokala träningsresultat och andra offlinewrites ska ha stabil identitet, versionskontroll, konfliktmodell och idempotent synkronisering.

**Kontrakt GP-538 — Backup ska bevisas genom restore**

Backupstatus får inte betraktas som tillräckligt skydd förrän data, tenantisolering, radering och centrala flöden har verifierats efter återställning.

**Kontrakt GP-539 — Restore får inte återaktivera raderad data**

Användarraderingar, revocations och andra skyddstillstånd ska återappliceras och verifieras efter backuprestore.

**Kontrakt GP-540 — Incidenter ska klassificeras efter verklig påverkan**

Severity ska ta hänsyn till säkerhet, integritet, data, användare, ekonomi, blast radius och pågående skada — inte endast tekniskt felantal.

**Kontrakt GP-541 — Containment ska prioriteras före kosmetisk återställning**

Incidentrespons ska först stoppa fortsatt påverkan, skydda data och begränsa blast radius innan dashboards, automation eller full funktion återställs.

**Kontrakt GP-542 — Bevis och projektmaterial ska bevaras**

Loggar, data, branches, worktrees, artefakter och andra incidentbevis får inte raderas eller skrivas över innan påverkan har analyserats och säker kopia verifierats.

**Kontrakt GP-543 — Recovery ska vara gradvis och verifierad**

Capabilities, agentsystem, writes och autonomy ska återstartas stegvis efter kontroller, tester och relevant approval.

**Kontrakt GP-544 — Incidentkommunikation ska skilja fakta från hypotes**

Intern och extern status får inte presentera osäkra orsaker, estimat eller full recovery som verifierade fakta.

**Kontrakt GP-545 — Incident closure ska kräva mer än återställd tjänst**

Aktiv påverkan, data, användarkommunikation, root-cause-status, action items och ansvarig acceptans ska bedömas innan incidenten stängs.

**Kontrakt GP-546 — Auto-remediation ska vara begränsad och auditerad**

Automatisk återställning får endast utföra tydligt definierade, testade och säkra steg med stoppregler och utan att skapa bredare mandat.

**Kontrakt GP-547 — Agentdrift ska kunna sänka authority**

Försämrad kvalitet, bredare databruk, avvikande tool use eller högre korrigeringsgrad ska kunna pausa capability eller återföra agenten till propose-only.

**Kontrakt GP-548 — Operativa skydd ska testas genom realistiska fel**

GainPilot ska regelbundet testa timeout, dependency failure, stale permission, duplicate events, unknown outcome, offlinekonflikt, backuprestore, nödstopp och gradvis återstart.

**Kontrakt GP-549 — Drift- och recoveryförändringar ska följa full governance**

Alerts, SLO, retries, runbooks, auto-remediation, backup, restore, incidentflöden och recoveryautomation ska ändras genom separat branch, feltester, review, shadow mode, canary och verifierad utrullning.

27.355 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- behandla serveruptime som full produkthälsa,

- använda en enda global grön indikator,

- kalla systemet healthy när centrala användarflöden är brutna,

- dölja degraderade capabilities,

- hoppa över säkerhet vid fallback,

- använda fail open för authorization,

- använda stale känslig data när källa saknas,

- låta extern analytics stoppa aktiv träningsloggning,

- sakna service- och capabilityägare,

- sakna versionsinformation i drift,

- glömma aktiva feature flags,

- behandla process health som capability health,

- använda endast logs utan metrics och traces,

- logga fulla privata dialoger,

- logga kroppsmått utan behov,

- logga secrets eller tokens,

- använda ostrukturerade fritextloggar som enda diagnostik,

- behålla debugpayload i produktion permanent,

- sampla bort kritiska säkerhetshändelser,

- använda tekniska metrics utan domänmått,

- definiera uptime utan användarflöde,

- behandla error budget som tillåten dataläcka,

- sakna trace över asynkrona flöden,

- lagra full agentkontext i traces,

- blanda teknisk logg och governanceaudit,

- skapa events utan identitet,

- skapa events utan schemaversion,

- anta exakt en leverans,

- anta korrekt eventordning,

- skapa icke-idempotenta consumers,

- retrya alla fel,

- retrya avvisat approval,

- retrya forbidden permission,

- sakna maxförsök,

- skapa retry storm,

- använda circuit breaker utan säker fallback,

- låta en felande tjänst ta ned hela systemet,

- låta köer växa utan owner eller maxålder,

- behandla DLQ som passivt arkiv,

- replaya hela DLQ blint,

- tolka timeout som failure,

- skapa dubbletter efter unknown outcome,

- beskriva partial execution som full success,

- använda rollback när compensation krävs,

- anta att alla externa effekter kan göras ogjorda,

- återuppta workflow utan contextkontroll,

- låta zombie workflows fortsätta,

- låta gamla workers skriva efter lease expiry,

- använda last-write-wins för alla offlinekonflikter,

- skriva över historiska events utan spår,

- kalla backup färdig utan restoretest,

- återställa backup som återaktiverar raderad data,

- sakna RPO och RTO,

- ha disaster recovery-plan som aldrig övats,

- köra chaos testing oansvarigt mot känsliga produktionsflöden,

- låta tekniskt alert automatiskt bli kritisk incident,

- vänta för länge med incident declaration,

- sakna incident commander,

- låta incident commander felsöka allt själv,

- blanda hypotes och bekräftad orsak,

- radera loggar under incident,

- göra panikstädning av branches eller disk,

- fastställa root cause utan evidens,

- blanda trigger och root cause,

- återställa full autonomy direkt,

- göra bred datareparation utan dry-run,

- köra ad hoc-repair utan manifest,

- informera användaren med falsk säkerhet,

- ge support obekräftad ETA,

- skuldbelägga användaren,

- avsluta incident när tjänsten svarar,

- skriva postmortem som endast pekar på mänskligt misstag,

- skapa action items utan ägare,

- skapa hundratals lågprioriterade action items,

- sakna regressionstest efter verifierat fel,

- automatisera högriskrepair utan approval,

- skapa alerts som ingen kan agera på,

- acceptera alert fatigue,

- undertrycka alerts utan expiry,

- ta bort säkerhetskontroller för att minska kostnad,

- låta en tenant förbruka all kapacitet,

- prioritera bakgrundsresearch före aktiv träningsdata,

- använda reservmodell utan capabilitytest,

- lita enbart på leverantörens status page,

- låta cronjobb köras dubbelt utan idempotens,

- visa stale data som aktuell,

- dela cache mellan tenants,

- använda cache utan revocationmodell,

- bygga om projektioner utan scope och verifiering,

- ignorera modell- och promptdrift,

- låta agent behålla authority under allvarlig behavioral drift,

- höja authority automatiskt när metrics återhämtas,

- tolka många väntande approvals som automatiskt godkända,

- testa endast tekniska system och inte mänskliga incidentprocesser,

- hoppa över nödstoppstest,

- hoppa över restoretest,

- göra destruktiv repair till första canary,

- behandla ticket closure som verifierad förbättring,

- låta Atlas ensam stänga allvarlig incident,

- ge incidentagenter obegränsad produktionsaccess,

- eller ändra observability, incident- och recoverylogik direkt i produktion utan branch, feltester, review och kontrollerad utrullning.

27.356 KANONISKA BESLUT FRÅN KAPITEL 27

Följande beslut etableras:

1. Drift ska vara en del av GainPilot-produkten.

2. Varje kritisk capability ska ha operativ ägare.

3. Driftstatus ska beskrivas per capability.

4. Miljö och version ska vara observerbara.

5. Konfiguration och feature flags ska kunna spåras.

6. Kritiska beroenden ska deklareras.

7. GainPilot ska stödja säkert degraderat läge.

8. Degradering får inte kringgå skydd.

9. Fail open ska förbjudas för högriskkontroller.

10. Fail closed ska vara standard när osäker handling är farlig.

11. Safe fallback ska bevara användbarhet där möjligt.

12. Health ska mätas på flera nivåer.

13. Process health ska skiljas från capability health.

14. User-flow health ska verifieras.

15. Data health ska vara en egen dimension.

16. Agent health ska vara en egen dimension.

17. Hermes health ska vara en egen dimension.

18. Permission health ska vara en egen dimension.

19. Driftstatus ska vara mer detaljerad än grönt och rött.

20. Observability ska byggas in från början.

21. Logs, metrics och traces ska kompletteras med events och audit.

22. Loggar ska vara strukturerade.

23. Loggar ska minimera persondata.

24. Känsliga fält ska redigeras.

25. Loggseverity ska vara definierad.

26. Debugloggning i produktion ska begränsas.

27. Loggar ska ha korrelationsidentiteter.

28. Loggretention ska vara typbaserad.

29. Säkerhets- och auditloggar ska integritetsskyddas.

30. Sampling ska vara riskmedveten.

31. Metrics ska omfatta teknik, domän och agentkvalitet.

32. Permissions och Hermes ska ha egna driftmått.

33. SLO ska definieras per capability.

34. SLI och SLA ska hållas åtskilda.

35. Error budget ska kunna påverka releaseprioritering.

36. Error budget får inte legitimera säkerhetsincidenter.

37. Traces ska följa distribuerade flöden.

38. Trace context ska propageras asynkront.

39. Audit och logs ska hållas separata.

40. Domain events ska ha stabil identitet.

41. Events ska ha schemaversion.

42. Eventprovenance ska bevaras.

43. Händelsetid och mottagningstid ska skiljas.

44. Sen och felordnad leverans ska hanteras.

45. Dubbla events ska vara förväntade.

46. Consumers ska vara idempotenta.

47. Outbox ska användas där write och event måste hållas samman.

48. Inbox eller deduplicering ska registrera processade meddelanden.

49. Känsliga writes ska ha idempotency identity.

50. Retry ska vara begränsad.

51. Retryable och non-retryable fel ska skiljas.

52. Retry budget ska finnas.

53. Retry storms ska upptäckas.

54. Circuit breakers ska kunna användas.

55. Bulkhead-isolering ska användas där relevant.

56. Köer ska ha owner och policy.

57. Ködjup och köålder ska följas.

58. Backpressure ska stödjas.

59. DLQ ska ha triage och repairprocess.

60. Replay ska vara kontrollerat.

61. Unknown outcome ska vara explicit.

62. Timeout ska inte automatiskt vara failure.

63. Resultat ska verifieras före retry.

64. Partial execution ska vara synligt.

65. Flerstegsoperationer ska ha saga- eller motsvarande modell.

66. Compensation ska definieras.

67. Irreversibel påverkan ska skadebegränsas.

68. Långvariga workflows ska ha checkpoints.

69. Resume ska kontrollera aktuellt context.

70. Cancellation ska vara idempotent.

71. Zombie workflows ska upptäckas.

72. Leases ska kunna användas.

73. Fencing tokens ska skydda mot gamla workers.

74. Split brain ska förhindras.

75. Aktivt pass ska kunna fungera offline.

76. Offlinepaket ska minimeras.

77. Lokala operationer ska ha stabil identitet.

78. Offlinekonflikter ska hanteras explicit.

79. Last-write-wins ska inte vara universell lösning.

80. Historiska händelser ska kunna korrigeras spårbart.

81. GainPilot ska ha backupstrategi.

82. Backupfrekvens ska vara riskbaserad.

83. RPO och RTO ska definieras.

84. Backup ska verifieras genom restore.

85. Restore ska ske isolerat.

86. Tenantisolering ska verifieras efter restore.

87. Raderad data får inte återaktiveras.

88. Disaster recovery-plan ska finnas.

89. DR ska ha ägare.

90. DR-planen ska övas.

91. Tabletop och game days ska kunna användas.

92. Chaos testing ska användas selektivt.

93. Incident ska ha stabil identitet.

94. Incidentmodell ska vara strukturerad.

95. Detection och declaration ska skiljas.

96. Severity ska bedöma verklig påverkan.

97. Incidenter ska ha tydliga roller.

98. Incident commander ska samordna.

99. Tidslinje ska dokumenteras.

100. Hypoteser ska hållas separata från fakta.

101. Bevis ska bevaras.

102. Containment ska begränsa fortsatt påverkan.

103. Containment ska vara granulärt.

104. Säkerhet ska prioriteras före full tillgänglighet.

105. Panikstädning ska förbjudas.

106. Trigger och root cause ska skiljas.

107. Bidragande faktorer ska identifieras.

108. Recovery ska ske i prioriterad ordning.

109. Recovery ska vara gradvis.

110. Recovery ska verifieras med checklistor.

111. Återställd tjänst ska inte automatiskt stänga incidenten.

112. Datareparation ska vara scopead.

113. Repair ska kunna köras i dry-run.

114. Repair ska ha manifest och identitet.

115. Repair ska vara idempotent där möjligt.

116. Användaren ska kunna hjälpa vid olöslig datakonflikt.

117. Incidentkommunikation ska vara sann och begriplig.

118. Osäker orsak ska märkas.

119. Berörda användare ska informeras när relevant.

120. Status page ska minimera känslig information.

121. Support ska få canonical incidentstatus.

122. Support ska inte gissa ETA.

123. Regulatorisk kommunikation ska ha behörig ägare.

124. Betydelsefull incident ska ha post-incident review.

125. Review ska vara systemorienterad.

126. Action items ska ha ägare och deadline.

127. Åtgärder ska täcka prevent, detect, contain och recover.

128. Produktionsfel ska skapa regressionstest där möjligt.

129. Runbooks ska uppdateras.

130. Authority ska omprövas efter agentincident.

131. Modell och dependency ska kunna omprövas.

132. Incidentclosure ska ha kriterier.

133. Resolved och closed ska kunna skiljas.

134. Incidenter ska kunna återöppnas.

135. Kritiska capabilities ska ha runbooks.

136. Runbooks ska testas.

137. Auto-remediation ska vara scopead och auditerad.

138. Högriskrepair ska kräva approval.

139. On-call-modell ska införas när produkten kräver det.

140. Alerts ska vara handlingsbara.

141. Alert fatigue ska motverkas.

142. Alerts ska dedupliceras.

143. Suppression ska ha expiry.

144. Maintenance ska planeras.

145. Change freeze ska kunna aktiveras.

146. Operativ dashboard ska vara capabilityorienterad.

147. Domändashboard ska visa GainPilot-specifik påverkan.

148. Atlas ska få minimerade operativa signaler.

149. Användaren ska få begriplig lokal status.

150. Kostnad ska vara observerbar.

151. Kostnadsincident ska kunna deklareras.

152. Icke-kritisk kostnadsautomation ska kunna stoppas.

153. Säkerhet ska inte stoppas för kostnadsbesparing.

154. Capacity och saturation ska följas.

155. Rate limiting ska användas.

156. Gemensam kapacitet ska fördelas rättvist.

157. Kritiska flöden ska prioriteras under belastning.

158. Load shedding ska skjuta upp lågprioriterat arbete.

159. Modellfallback ska vara capabilitygodkänd.

160. Externa beroenden ska ha failure models.

161. Leverantörsportabilitet ska övervägas.

162. Schemalagda jobb ska ha identity och heartbeat.

163. Dubbla cron-körningar ska vara säkra.

164. Datafreshness ska visas.

165. Cache ska ha scope och invalidation.

166. Cross-tenant-cache ska vara allvarlig incident.

167. Databasstatus ska övervakas.

168. Kritiska invariants ska skyddas.

169. Projektioner ska kunna verifieras eller byggas om.

170. Agentdrift ska följas beteendemässigt.

171. Modell-, prompt-, tool-, policy- och knowledge drift ska följas.

172. Drift ska kunna sänka authority.

173. Authority ska inte automatiskt höjas efter recovery.

174. Approvalstatus ska vara observerbar.

175. Budgetstatus ska vara observerbar.

176. Incidentscenarier ska simuleras.

177. Mänskliga processer ska övas.

178. Nödstopp och återstart ska testas.

179. Backup och restore ska testas praktiskt.

180. Unknown outcome ska testas.

181. DLQ och replay ska testas.

182. Compensation ska testas.

183. Offlinekonflikter ska testas.

184. Agentdrift ska testas.

185. Nya alert- och recoveryregler ska köras i shadow mode.

186. Canary ska börja med låg risk.

187. Destruktiv repair ska inte vara första canary.

188. Observability och runbooks ska versionsstyras.

189. Incidenter ska analyseras strukturerat.

190. Time to detect, contain och recover ska mätas.

191. Återöppning och recurrence ska följas.

192. User impact ska mätas.

193. Datapåverkan ska klassificeras.

194. Agentpåverkan ska klassificeras.

195. Action items ska följas till verifierad effekt.

196. Driftgovernance ska ha mänskliga ägare.

197. Atlas ska rekommendera och sammanställa men inte ensam stänga kritisk incident.

198. Arnold ska ge begriplig status och använda safe mode.

199. Hermes ska minimera incidentdata.

200. Utvecklingsagenter ska följa incidentgovernance.

201. Incident får inte skapa obegränsad agentaccess.

202. Alla drift- och recoveryförändringar ska gå genom branch, tester, review och kontrollerad utrullning.

203. GainPilot ska kunna återhämta sig utan att förlora sanningen om vad som faktiskt hände.

27.357 IMPLEMENTERINGSORDNING

GainPilots drift-, observability-, incident- och recoveryförmåga ska implementeras stegvis.

Fas 1 — Service- och capabilityregister

Implementera:

- service identity,

- capability identity,

- owner,

- dependencies,

- criticality,

- och environment.

Fas 2 — Versionsinventering

Implementera observerbar status för:

- code,

- schema,

- model,

- prompt,

- policy,

- configuration,

- och feature flags.

Fas 3 — Strukturerad loggning

Implementera:

- log schema,

- severity,

- correlation identities,

- redaction,

- retention,

- och access control.

Fas 4 — Grundläggande metrics

Implementera:

- latency,

- error rate,

- throughput,

- saturation,

- queue depth,

- och data freshness.

Fas 5 — Capability health

Implementera health för:

- active program read,

- workout logging,

- offline save,

- sync,

- Hermes retrieval,

- permission check,

- och approval execution.

Fas 6 — User-flow synthetic tests

Implementera säkra syntetiska flöden för:

- login,

- open workout,

- save result,

- sync,

- och verify history.

Fas 7 — Tracing

Implementera:

- trace identity,

- spans,

- async propagation,

- queue relation,

- och agent tool relation.

Fas 8 — Domain events

Implementera:

- event identity,

- version,

- provenance,

- occurred time,

- och processing status.

Fas 9 — Idempotency

Implementera för:

- workout results,

- program activation,

- calendar writes,

- approvals,

- notifications,

- och kostnadsskapande actions.

Fas 10 — Outbox och inbox

Implementera där lokal write och eventpublicering måste hållas samman.

Fas 11 — Retry och circuit breaker

Implementera:

- retry classification,

- max attempts,

- exponential backoff,

- jitter,

- retry budget,

- och circuit state.

Fas 12 — Queue governance

Implementera:

- queue identity,

- owner,

- max age,

- retention,

- dead-letter,

- och replay process.

Fas 13 — Unknown outcome

Implementera:

- explicit status,

- verification query,

- operation identity,

- side-effect inspection,

- och safe retry.

Fas 14 — Workflow checkpoints

Implementera:

- completed steps,

- pending steps,

- approval state,

- resource versions,

- resume,

- cancel,

- och compensation.

Fas 15 — Offline workout mode

Implementera:

- encrypted local package,

- local operation identity,

- append-only logging,

- sync,

- conflict detection,

- och user resolution.

Fas 16 — Backup

Implementera:

- database backup,

- object backup,

- configuration backup,

- retention,

- encryption,

- och monitoring.

Fas 17 — Restoretest

Implementera:

- isolated restore,

- schema validation,

- tenant validation,

- deletion tombstones,

- och user-flow checks.

Fas 18 — RPO och RTO

Definiera och validera krav per kritisk capability.

Fas 19 — Disaster recovery

Implementera plan för:

- database failure,

- region failure,

- secret compromise,

- provider outage,

- och corrupted deployment.

Fas 20 — Incidentregister

Implementera:

- identity,

- severity,

- affected capabilities,

- users,

- status,

- commander,

- timeline,

- och evidence.

Fas 21 — Incidentroller

Implementera:

- commander,

- technical lead,

- domain lead,

- security/privacy lead,

- communication lead,

- och scribe.

Fas 22 — Containment

Implementera:

- capability stop,

- write freeze,

- token revoke,

- tenant isolation,

- circuit breaker,

- och feature flag rollback.

Fas 23 — Recoverychecklistor

Implementera per capability:

- dependencies,

- invariants,

- smoke test,

- data verification,

- och gradual restart.

Fas 24 — Datarepair

Implementera:

- dry-run,

- repair manifest,

- scope,

- idempotency,

- query verification,

- och audit.

Fas 25 — Incidentkommunikation

Implementera:

- internal updates,

- user messaging,

- support brief,

- status page,

- och next-update time.

Fas 26 — Post-incident review

Implementera:

- timeline,

- trigger,

- root cause,

- contributing factors,

- lessons,

- action items,

- och closure criteria.

Fas 27 — Runbooks

Implementera för:

- workout-save failure,

- sync outage,

- Hermes outage,

- permission incident,

- agent drift,

- deployment failure,

- och data corruption.

Fas 28 — Alerts

Implementera:

- actionable alert rules,

- deduplication,

- routing,

- escalation,

- suppression expiry,

- och owner.

Fas 29 — SLO och error budgets

Implementera per capability:

- SLI,

- target,

- measurement window,

- budget,

- och release response.

Fas 30 — Capacity och rate limits

Implementera:

- tenant limits,

- agent limits,

- provider limits,

- load shedding,

- och priority classes.

Fas 31 — Agentdrift

Implementera baseline och övervakning för:

- tool use,

- context size,

- cost,

- output validity,

- corrections,

- och authority response.

Fas 32 — Incidentövningar

Genomför:

- tabletop,

- restore drill,

- provider outage,

- unknown outcome,

- stale permission,

- offline conflict,

- och global emergency stop.

Fas 33 — Shadow mode

Kör nya:

- alerts,

- anomaly detection,

- authority reduction,

- och recoveryautomation

utan faktisk side effect.

Fas 34 — Canary för auto-remediation

Börja med:

- stateless worker restart,

- circuit breaker,

- och låg risk-köpaus.

Fas 35 — Operativ dashboard

Implementera vyer för:

- operations,

- technical,

- security,

- privacy,

- domain,

- executive,

- och user-facing local status.

Fas 36 — Full driftgovernance

Implementera:

- periodic SLO review,

- backup audit,

- restore audit,

- runbook review,

- incident action tracking,

- authority review,

- och forbidden self-modification.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- unit- och integrationstester,

- failure injection,

- domain validation,

- säkerhets- och integritetstest,

- offline- och conflict-test,

- backup- och restoretest,

- incidentövning,

- shadow mode,

- pull request,

- operativ review,

- canary,

- kontrollerad merge,

- produktionsverifiering,

- och effektuppföljning.

27.358 FRAMGÅNGSKRITERIER

Kapitel 27:s vision är framgångsrikt realiserad när:

- varje kritisk service och capability har ägare,

- driftstatus kan visas per capability,

- aktiv version och konfiguration är kända,

- feature flags är spårbara,

- kritiska dependencies är registrerade,

- GainPilot kan fungera säkert i degraded mode,

- fail open inte används för högriskkontroller,

- process health skiljs från user-flow health,

- centrala träningsflöden testas syntetiskt,

- data health visas,

- agent-, Hermes- och permissionhealth visas,

- loggar är strukturerade,

- privata payloads inte hamnar i logg,

- secrets redigeras,

- loggretention är definierad,

- tekniska metrics kompletteras med domänmått,

- SLO finns per central capability,

- error budget kan stoppa riskfylld release,

- traces följer agent- och eventkedjan,

- audit visar mandat och ansvar,

- events har stabil identitet och version,

- dubbla och felordnade events hanteras,

- consumers är idempotenta,

- outbox och inbox används där relevant,

- workout saves har idempotency protection,

- retryable och non-retryable fel skiljs,

- retries har budget och backoff,

- retry storms kan stoppas,

- circuit breaker och bulkhead finns,

- köer har ägare och maxålder,

- DLQ har aktiv triage,

- replay är scopeat,

- unknown outcome synliggörs,

- timeout inte feltolkas,

- resultat verifieras före retry,

- partial execution visas,

- saga och compensation används där relevant,

- workflows har checkpoints,

- resume verifierar mandat och context,

- zombie workflows upptäcks,

- leases och fencing skyddar kritiskt arbete,

- träningspass kan loggas offline,

- lokala operationer har stabil identitet,

- offlinekonflikter kan lösas,

- historik inte skrivs över tyst,

- backupstrategi finns,

- RPO och RTO är definierade,

- restore har testats praktiskt,

- raderad data inte återkommer efter restore,

- disaster recovery-plan finns och har övats,

- incidenter har strukturerad identitet och severity,

- detection och declaration mäts,

- allvarliga incidenter får incident commander,

- fakta och hypotes hålls isär,

- bevis bevaras,

- containment är granulärt,

- writes kan frysas,

- säkerhet prioriteras före full funktion,

- panikstädning inte sker,

- root cause bygger på evidens,

- recovery sker gradvis,

- varje capability har recoverychecklista,

- datarepair kan köras i dry-run,

- reparationskörningar är auditerade,

- incidentkommunikation är sann och begriplig,

- berörda användare informeras,

- support får canonical status,

- post-incident review genomförs,

- action items har ägare och deadline,

- regressionsskydd skapas,

- runbooks uppdateras,

- agentauthority omprövas efter relevant incident,

- incidenten inte stängs för tidigt,

- runbooks testas,

- auto-remediation är begränsad,

- alerts är handlingsbara,

- alert fatigue begränsas,

- maintenance och change freeze stöds,

- operativa dashboards visar verklig användarpåverkan,

- användaren kan se när lokal data väntar på synk,

- kostnadsavvikelser upptäcks,

- kapacitet och saturation övervakas,

- aktiva träningsflöden prioriteras under belastning,

- fallbackmodeller är capabilitygodkända,

- schemalagda jobb har heartbeat,

- stale data markeras,

- cache är tenant- och revocationmedveten,

- databasens kritiska invariants övervakas,

- agentdrift upptäcks,

- authority kan sänkas automatiskt enligt policy,

- full authority inte återkommer automatiskt,

- approvals och budget är observerbara,

- realistiska incidentövningar genomförs,

- nödstopp och återstart testas,

- backup och restore testas,

- unknown outcome och compensation testas,

- nya alertregler körs i shadow mode,

- destruktiv repair inte lanseras som första canary,

- observability och runbooks är versionsstyrda,

- time to detect, contain och recover följs,

- återkommande incidenter identifieras,

- user impact och data impact mäts,

- action items följs till verifierad effekt,

- Atlas inte ensam stänger kritiska incidenter,

- Arnold ger användaren säker och begriplig status,

- Hermes minimerar incidentdata,

- utvecklingsagenter inte får obegränsad incidentaccess,

- och alla drift- och recoveryförändringar genomförs genom separat branch, realistiska feltester, review, shadow mode och kontrollerad utrullning.

27.359 SAMMANFATTNING

GainPilot ska fungera i verkligheten.

Det betyder att systemet måste kunna hantera mer än det förväntade lyckade flödet.

GainPilot ska kunna fortsätta säkert när:

- nätverket försvinner,

- en modellleverantör ligger nere,

- en kö växer,

- ett event levereras två gånger,

- en databas svarar långsamt,

- en mobil återansluter efter flera timmar,

- eller ett approval löper ut mitt under ett workflow.

Systemet ska inte kräva perfekta förhållanden.

Det ska däremot vägra ersätta osäkerhet med falsk säkerhet.

Observability ska göra det möjligt att följa en verklig handling från början till slut.

Exempel:

Användaren avslutar ett träningspass.

GainPilot ska kunna se:

- att passet avslutades lokalt,

- vilken operation identity som skapades,

- om resultatet skrevs till lokal lagring,

- om sync skickades,

- om servern tog emot requesten,

- om write lyckades,

- om svaret försvann i timeout,

- om ett nytt försök deduplicerades,

- om WorkoutCompleted-eventet publicerades,

- om projektionen uppdaterades,

- och vad användaren slutligen ser.

Om systemet inte vet om servern sparade resultatet ska status vara:

unknown outcome.

GainPilot ska då verifiera.

Det ska inte automatiskt skicka samma handling igen och riskera att skapa två pass.

Känsliga writes ska därför använda:

- stabil operation identity,

- idempotency key,

- deduplicering,

- och versionskontroll.

Detta gäller bland annat:

- avslutade träningspass,

- programaktivering,

- kalenderhändelser,

- approvals,

- köp,

- meddelanden,

- och extern publicering.

GainPilot ska anta att distribuerade meddelanden kan:

- komma sent,

- komma i fel ordning,

- levereras flera gånger,

- eller inte kunna behandlas direkt.

Events ska ha:

- identitet,

- version,

- provenance,

- och tydlig tid.

Consumers ska vara idempotenta.

Köer ska ha:

- ägare,

- maxålder,

- retry policy,

- dead-letter-process,

- och kontrollerad replay.

Dead-letter queue ska inte vara en plats där problem glöms bort.

Varje meddelande som fastnar ska kunna:

- klassificeras,

- repareras,

- omspelas,

- eller avslutas med dokumenterad orsak.

Retries ska vara begränsade.

GainPilot ska inte fortsätta anropa en felande tjänst obegränsat.

Systemet ska använda:

- retry classification,

- backoff,

- jitter,

- circuit breaker,

- bulkhead,

- och retry budget.

Permission denial, avvisat approval och permanent schemafel ska normalt inte retryas.

Timeout måste behandlas särskilt.

En timeout säger bara att avsändaren inte fick ett säkert svar i tid.

Handlingen kan ha:

- lyckats,

- misslyckats,

- eller delvis lyckats.

GainPilot ska därför kontrollera operationens verkliga tillstånd.

Flerstegsoperationer ska ha tydlig recovery.

Om Arnold flyttar ett pass kan operationen exempelvis omfatta:

1. Uppdatera GainPilot-programmet.

2. Uppdatera kalendern.

3. Schemalägga notis.

Om programmet uppdateras men kalendern misslyckas ska systemet inte beskriva hela handlingen som lyckad.

Det ska visa:

- vilket steg som lyckades,

- vilket steg som misslyckades,

- om retry är säker,

- och om compensation behövs.

Compensation kan innebära:

- återställa programmet,

- ta bort en kalenderhändelse,

- återkalla en delning,

- eller skapa återbetalning.

Alla effekter kan inte göras ogjorda.

En redan skickad notis eller exponerad information kan inte alltid tas tillbaka.

Då ska GainPilot:

- stoppa fortsatt påverkan,

- informera,

- dokumentera,

- och begränsa skadan.

Aktiva träningspass ska kunna fungera offline.

Offlinepaketet ska endast innehålla det som behövs:

- aktuellt pass,

- relevanta övningsinstruktioner,

- aktiva säkerhetsbegränsningar,

- och lokal loggningsmodell.

Varje offlinehandling ska få stabil identitet.

När mobilen återansluter ska synk vara:

- idempotent,

- versionsmedveten,

- och konfliktkontrollerad.

GainPilot ska inte använda last-write-wins för allt.

Om samma program ändras på två enheter ska användaren vid betydelsefull konflikt kunna se:

- vad den lokala versionen innehåller,

- vad serverversionen innehåller,

- och vilka val som finns.

Observability ska omfatta mer än serverloggar.

GainPilot ska använda:

- strukturerade logs,

- metrics,

- traces,

- domain events,

- audit,

- agentbeslut,

- och user-impact signals.

Loggar ska inte bli ett nytt privat dataarkiv.

De ska använda:

- referenser,

- scopes,

- felkoder,

- versioner,

- och korrelationsidentiteter.

Fulla:

- träningshistoriker,

- kostloggar,

- kroppsmått,

- dialoger,

- tokens,

- och secrets

ska normalt inte loggas.

GainPilot ska mäta health på flera nivåer.

En process kan vara uppe samtidigt som:

- Hermes returnerar fel användarkontext,

- workout save inte fungerar,

- permissioncache är stale,

- eller history-projektionen inte uppdateras.

Systemet ska därför skilja mellan:

- process health,

- dependency health,

- capability health,

- data health,

- agent health,

- och user-flow health.

Kritiska capabilities ska ha egna SLO.

Exempel:

- läsa dagens pass,

- spara träningsresultat,

- synka offlinepass,

- återkalla permission,

- och aktivera program.

Error budget ska kunna visa när systemets tillförlitlighet försämras så mycket att ny utveckling behöver pausas till förmån för stabilitet.

Error budget får inte användas som argument för att acceptera:

- dataläckor,

- obehöriga köp,

- eller säkerhetsbrott.

GainPilot ska ha backup.

Backup ska inte betraktas som verkligt skydd förrän restore har testats.

Restoreövningen ska verifiera:

- schema,

- datakonsistens,

- tenantisolering,

- filer,

- index,

- och centrala användarflöden.

Restore får inte återaktivera data som användaren tidigare begärt raderad.

Raderingsmarkörer och andra skydd måste kunna återappliceras.

GainPilot ska definiera:

- RPO,

- hur mycket dataförlust som kan tolereras,

- och RTO,

- hur snabbt capabilityn ska kunna återställas.

Kraven ska kunna skilja sig mellan olika funktioner.

Aktiv workout-data kan ha striktare krav än:

- gammal anonymiserad produktanalys,

- eller genererade previewartefakter.

Incidenter ska klassificeras efter verklig påverkan.

Ett tekniskt litet fel kan vara kritiskt om det:

- visar fel användares data,

- tillåter ett köp utan mandat,

- eller ändrar ett träningsprogram på ett farligt sätt.

Ett stort antal errors kan samtidigt vara mindre allvarligt om de endast påverkar:

- en valfri bakgrundsanalys,

- utan användarpåverkan.

Severity ska därför ta hänsyn till:

- säkerhet,

- integritet,

- datakorrekthet,

- antal användare,

- blast radius,

- irreversibilitet,

- kostnad,

- och pågående skada.

Allvarliga incidenter ska ha tydliga roller:

- incident commander,

- technical lead,

- domain lead,

- security/privacy lead,

- communication lead,

- och scribe.

Incident commander ska samordna.

Rollen ska inte behöva genomföra all felsökning själv.

Incidentstatus ska ha en canonical källa.

Tidslinjen ska skilja mellan:

- observation,

- hypotes,

- bekräftat faktum,

- beslut,

- och åtgärd.

Incidentrespons ska först fokusera på containment.

GainPilot ska kunna:

- stoppa en capability,

- frysa writes,

- återkalla token,

- isolera en tenant,

- pausa en agent,

- öppna circuit breaker,

- eller slå av feature flag.

Systemet ska använda minsta möjliga blast radius.

Ett fel i automatisk övningssubstitution ska inte kräva att:

- användaren förlorar tillgång till sitt program,

- passhistoriken stängs,

- eller hela Omnira går ned.

Read-only och säkra manuella funktioner ska fortsätta där det är möjligt.

Incidentrespons får inte förstöra bevis.

GainPilot ska inte:

- rensa loggar,

- skriva över data,

- radera worktrees,

- eller ta bort branches

för att snabbt göra miljön ren.

Meningsbärande material ska bevaras tills:

- påverkan förståtts,

- säker kopia verifierats,

- och cleanup godkänts.

Recovery ska ske gradvis.

Systemet ska exempelvis kunna återställa:

1. Tenantisolering.

2. Read-only.

3. Lokal träningsloggning.

4. Molnsynk.

5. Agentförslag.

6. Lågriskautomation.

7. Högre autonomi.

Att en tjänst åter svarar ska inte automatiskt återställa:

- full write,

- agentauthority,

- eller alla tidigare grants.

Datareparation ska vara kontrollerad.

Ett reparationsverktyg ska kunna visa dry-run:

- vilka poster som påverkas,

- vilken förändring som görs,

- och vilka invariants som ska verifieras.

Reparationen ska ha:

- identitet,

- scope,

- owner,

- audit,

- och idempotens där möjligt.

Om systemet inte säkert kan avgöra rätt resultat ska användaren kunna hjälpa till att lösa konflikten.

Incidentkommunikation ska vara sann.

GainPilot ska kunna säga:

Vi har identifierat att vissa träningsresultat inte visas korrekt. Resultaten är fortfarande sparade, och vi arbetar med att återställa visningen.

Systemet ska inte säga:

Allt är löst,

innan det har verifierats.

Support ska använda samma canonical status.

Support ska inte gissa:

- root cause,

- omfattning,

- eller recoverytid.

Berörda användare ska få begriplig information om:

- vad som påverkades,

- under vilken period,

- vad GainPilot gjort,

- vad användaren behöver göra,

- och hur nästa uppdatering kommer.

Post-incident review ska vara systemorienterad.

Review ska inte stanna vid:

En utvecklare gjorde ett misstag.

Den ska fråga:

- Varför kunde misstaget nå produktion?

- Varför stoppades det inte av test?

- Varför upptäcktes det inte av observability?

- Varför blev blast radius så stor?

- Varför var recovery svår?

- Och vilket skydd saknades?

Action items ska kunna förbättra:

- prevention,

- detection,

- containment,

- recovery,

- och learning.

Varje action item ska ha:

- ägare,

- prioritet,

- deadline,

- scope,

- och verifieringskriterium.

Incidenten ska inte betraktas som fullt avslutad bara för att ett ticket stängts.

GainPilot ska ha runbooks för centrala scenarier.

Exempel:

- workout-save failure,

- molnsynk ligger nere,

- Hermes är otillgängligt,

- permissionincident,

- agentdrift,

- deployment failure,

- och datakorruption.

Runbooks ska testas.

Auto-remediation får användas för tydliga och säkra steg.

Exempel:

- starta om en stateless worker,

- öppna circuit breaker,

- eller pausa en felande kökonsument.

Auto-remediation får inte få obegränsat mandat att:

- radera data,

- ändra permissions,

- replaya stora mängder events,

- eller skriva om schema.

GainPilot ska övervaka agentsystemets beteende.

En agent kan tekniskt svara samtidigt som dess beteende försämras.

Drift kan visa sig genom:

- fler tool calls,

- större kontextpaket,

- bredare databruk,

- fler nekade permissions,

- högre korrigeringsgrad,

- eller hallucinerad status.

Vid tydlig drift ska systemet kunna:

- sänka authority,

- växla till propose-only,

- pausa capability,

- eller kräva ny approval.

Återställd kvalitet ska inte automatiskt återställa full authority.

Det ska kräva:

- omtest,

- shadow mode,

- review,

- och relevant beslut.

GainPilot ska öva incidenter.

Övningar ska omfatta:

- extern modell ligger nere,

- permissioncache är stale,

- workout save får timeout efter lyckad write,

- två enheter skapar konflikt,

- ett event levereras dubbelt,

- backup måste återställas,

- nödstopp aktiveras,

- och gradvis återstart genomförs.

Övningen ska testa både teknik och människor:

- roller,

- kommunikation,

- beslut,

- runbooks,

- och escalation.

Nya alert-, recovery- och auto-remediationregler ska först köras i shadow mode.

Systemet ska jämföra:

- vad den gamla regeln gjorde,

- vad den nya hade gjort,

- false positives,

- false negatives,

- kostnad,

- och användarpåverkan.

Canary ska börja med lågriskområden.

Bred replay, dataradering och kritisk permissionrepair ska inte vara första canary.

Atlas ska kunna använda operativa signaler för att:

- identifiera mönster,

- prioritera stabilitetsarbete,

- följa action items,

- och skapa beslutsunderlag.

Atlas ska normalt få:

- aggregerad capabilitystatus,

- severity,

- kostnad,

- risk,

- och trend.

Atlas behöver inte få:

- fulla användarloggar,

- privata dialoger,

- eller varje teknisk payload.

Arnold ska skydda användarupplevelsen.

Vid synkproblem ska Arnold kunna säga:

Ditt pass är sparat säkert på telefonen. Jag väntar med att skicka det igen tills jag har verifierat serverstatus, så att resultatet inte blir dubbelt.

Detta är bättre än att:

- dölja problemet,

- gissa,

- eller be användaren trycka spara flera gånger.

Alla förändringar av:

- logs,

- metrics,

- traces,

- events,

- retries,

- queuepolicy,

- backup,

- restore,

- alerts,

- runbooks,

- incidentflöden,

- och auto-remediation

ska ske genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- realistiska failure tests,

- security- och privacytester,

- offline- och conflict tests,

- backup- och restoretest,

- shadow mode,

- pull request,

- operativ review,

- canary,

- kontrollerad merge,

- produktionsverifiering,

- och effektuppföljning.

Kapitel 27 etablerar därmed följande kärnprincip:

GainPilot ska inte endast vara byggt för att lyckas när allt fungerar. Systemet ska vara byggt för att förstå, begränsa och återhämta sig när något går fel. Varje handling ska kunna spåras, varje osäkert utfall ska verifieras, varje incident ska prioritera användarens säkerhet och data, och varje återstart ska ske gradvis och med bevis. Tillförlitlighet är inte frånvaro av fel — det är förmågan att upptäcka fel, bevara sanningen och återställa rätt funktion utan att skapa en större skada.
