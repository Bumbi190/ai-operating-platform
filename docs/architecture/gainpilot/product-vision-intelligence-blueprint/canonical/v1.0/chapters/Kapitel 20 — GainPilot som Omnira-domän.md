# Kapitel 20 — GainPilot som Omnira-domän

GainPilot ska inte utvecklas som en fristående träningsapp som senare försöker kopplas till Omnira genom ett antal lösa integrationer.

GainPilot ska vara en fullvärdig domän inom Omniras operativsystem.

Det innebär att GainPilot ska:

- äga sin tränings- och kostspecifika produktlogik,

- använda Omniras gemensamma identitets- och säkerhetsgrund,

- kommunicera genom definierade kontrakt,

- arbeta genom Atlas, Arnold och Hermes enligt tydliga roller,

- använda gemensamma system för minne, approvals, agentsamordning och observability,

- och samtidigt förbli isolerat från andra projekt där isolering krävs.

Omnira ska fungera som kontrollplanet.

GainPilot ska fungera som en specialiserad produkt- och verksamhetsdomän.

Atlas ska vara den centrala intelligensen som kan förstå:

- användaren,

- GainPilot,

- andra godkända Omnira-projekt,

- verksamhetens mål,

- och relationerna mellan systemen.

Arnold ska vara GainPilots synliga coach och huvudsakliga användargränssnitt för:

- träning,

- kost,

- planering,

- progression,

- motivation,

- och säker användardialog.

Hermes ska vara minnes-, data- och kontextgränsen som styr:

- vad Arnold får veta,

- vad Atlas får kombinera,

- vilken information som får delas mellan projekt,

- hur länge kontexten får användas,

- och om resultatet får sparas.

GainPilot ska inte vara ett passivt verktyg under Atlas.

Domänen ska ha:

- egen produktidentitet,

- egen canonical datamodell,

- egna verksamhetsmål,

- egna användarupplevelser,

- egna domänagenter,

- egna risker,

- egna säkerhetsregler,

- egna mätetal,

- och eget implementationsansvar.

Samtidigt ska GainPilot inte duplicera sådant som Omnira redan ansvarar för.

GainPilot ska normalt inte bygga separata och inkompatibla system för:

- användaridentitet,

- autentisering,

- behörigheter,

- approvals,

- hemlighetshantering,

- agentgovernance,

- minnestransport,

- auditering,

- incidenthantering,

- eller global projektstyrning.

Relationen ska därför bygga på följande princip:

Omnira tillhandahåller den gemensamma styrningen, infrastrukturen och intelligenssamordningen. GainPilot tillhandahåller tränings-, kost- och coachdomänens specialiserade kunskap, produktlogik och användarupplevelse.

GainPilot ska kunna fungera även när vissa centrala Omnira-funktioner tillfälligt är otillgängliga.

Ett aktivt träningspass ska exempelvis inte behöva avbrytas för att:

- Atlas inte svarar,

- ett tvärdomänminne inte kan hämtas,

- eller en extern integrationsmotor är offline.

Domänen ska därför ha:

- tydliga beroenden,

- lokala reservlägen,

- degraderad funktion,

- återhämtning,

- synkronisering,

- och verifierade gränser för autonomi.

Grundprincipen är:

GainPilot ska vara självständigt inom sin domän men styrt inom Omnira. Plattformen ska kunna utveckla och driva GainPilot som en sammanhängande produkt utan att förlora säkerhet, isolering, användarkontroll eller den gemensamma intelligens som gör Omnira värdefullt.

20.1 OMNIRA SOM OPERATIVSYSTEM

Omnira ska fungera som ett operativsystem för AI-drivna produkter och verksamheter.

Operativsystemet ska tillhandahålla gemensamma förmågor som:

- identitet,

- projektmodell,

- tenantisolering,

- agentsamordning,

- minne,

- approvals,

- säkerhet,

- policy,

- observability,

- schemaläggning,

- integrationsstyrning,

- incidenthantering,

- och Executive Intelligence.

Omnira ska inte behöva känna till varje detalj i GainPilots träningslogik.

Det ska känna till:

- vilka förmågor GainPilot erbjuder,

- vilka risknivåer de har,

- vilka resurser de får använda,

- vilka agentsystem som ansvarar,

- och vilka kontrakt som gäller.

20.2 GAINPILOT SOM PRODUKTDOMÄN

GainPilot ska vara en avgränsad produktdomän inom Omnira.

Domänen ska äga:

- träningsmodellen,

- kostmodellen,

- övningsgrafen,

- programlogiken,

- substitutionsmotorn,

- coachupplevelsen,

- progressionsanalysen,

- träningssäkerheten,

- och sina domänspecifika integrationer.

Omnira ska inte direkt skriva träningsprogram genom generell plattformslogik.

Alla träningsbeslut ska gå genom GainPilots godkända domänkontrakt.

20.3 DOMÄNIDENTITET

GainPilot ska ha en stabil domänidentitet.

Exempel:

domain_identity:

gainpilot

Domänidentiteten ska användas i:

- behörigheter,

- minnesscope,

- event,

- kommandon,

- integrationskontrakt,

- audit,

- kostnadsfördelning,

- och observability.

Visningsnamn och varumärke kan förändras.

Den tekniska identiteten ska förbli stabil.

20.4 DOMÄNVERSION

GainPilot ska ha en versionerad domändefinition.

Domänversionen ska kunna beskriva:

- aktiva capabilities,

- canonical schema,

- policyversioner,

- agentversioner,

- integrationskontrakt,

- och migrationsstatus.

En produktrelease och en domänversion behöver inte vara samma sak.

20.5 DOMÄNSTATUS

GainPilot ska kunna ha operativ status som:

- planning,

- development,

- internal,

- pilot,

- active,

- restricted,

- maintenance,

- degraded,

- hibernated,

- eller retired.

Statusen ska påverka:

- tillåtna agentåtgärder,

- schemalagda workflows,

- externa integrationer,

- användarkommunikation,

- och resursanvändning.

20.6 HIBERNATION

GainPilot ska kunna placeras i hibernation utan att:

- användardata raderas,

- historik förloras,

- minnesdomänen blandas med andra projekt,

- eller framtida återstart omöjliggörs.

Hibernation kan innebära att:

- proaktiv utveckling pausas,

- icke-kritiska workflows stoppas,

- marknadsföring pausas,

- vissa integrationer avaktiveras,

- och kostnader minimeras.

Säkerhet, dataskydd och nödvändigt underhåll ska fortsätta.

20.7 ÅTERAKTIVERING

Återaktivering ska vara en kontrollerad process.

Den ska minst kontrollera:

- aktuell kodversion,

- migrationsstatus,

- hemligheter,

- integrationer,

- policyversioner,

- modellversioner,

- säkerhetsvarningar,

- och dataintegritet.

Ett hibernerat projekt ska inte automatiskt återgå till full autonomi.

20.8 DEN CANONICAL OMNIRA-DOMÄNMODELLEN

GainPilot ska registreras i Omnira genom en canonical domänmodell.

Modellen ska minst kunna representera:

- domain_identity,

- tenant_identity,

- owner_identity,

- product_identity,

- domain_version,

- lifecycle_status,

- operating_mode,

- capabilities,

- services,

- agents,

- workflows,

- memory_scopes,

- data_classes,

- permissions,

- authority_levels,

- integrations,

- dependencies,

- budgets,

- risk_classes,

- approvals,

- observability_targets,

- incident_policies,

- deployment_targets,

- and governance_owner.

Exakta tekniska fältnamn definieras senare.

Modellen ska kunna svara på:

- Vad är GainPilot?

- Vem äger domänen?

- Vilka förmågor finns?

- Vilka agenter får agera?

- Vilka data får användas?

- Vilka externa system är anslutna?

- Vilka risker finns?

- Vilket autonomimandat gäller?

- Och hur stoppas eller återställs domänen?

20.9 TENANT

GainPilot ska vara tenantmedvetet från början.

Även om den första versionen endast används av grundaren ska arkitekturen inte anta:

- en enda användare,

- en enda organisation,

- eller obegränsad intern åtkomst.

Varje relevant resurs ska kunna kopplas till:

- tenant,

- användare,

- projekt,

- och scope.

20.10 PROJEKT OCH TENANT

Ett Omnira-projekt och en tenant är inte samma sak.

Tenant beskriver den säkerhets- och ägandegräns där resurser tillhör en organisation eller kund.

Projekt beskriver ett operativt arbetsområde.

GainPilot kan därför vara:

- ett projekt inom grundarens Omnira-tenant,

- en produkt som betjänar många kundtenants,

- och en domän med egna interna delprojekt.

20.11 INTERN OCH EXTERN PRODUKTYTA

GainPilot ska skilja mellan:

1. Intern produktyta.

2. Kundprodukt.

Den interna produktytan kan innehålla:

- roadmap,

- utvecklingsagenter,

- produktanalys,

- supportverktyg,

- affärsdata,

- och interna beslut.

Kundprodukten innehåller:

- Arnold,

- användarens tränings- och kostdata,

- program,

- historik,

- och användarinställningar.

Interna agenter får inte automatiskt läsa kundernas fullständiga data.

20.12 KUNDISOLERING

Varje användares och kunds data ska isoleras.

Isoleringen ska omfatta:

- databasfrågor,

- minne,

- cache,

- filer,

- media,

- embeddings,

- sökindex,

- köer,

- loggar,

- och modellkontext.

En korrekt användaridentitet i gränssnittet är inte tillräckligt om underliggande sökning kan hämta data från fel tenant.

20.13 DOMÄNGRÄNS

GainPilots domängräns ska vara explicit.

Inom gränsen ligger exempelvis:

- program,

- träningspass,

- måltidsplaner,

- övningar,

- recept,

- progression,

- coachdialog,

- och domänspecifik analys.

Utanför gränsen ligger exempelvis:

- global autentisering,

- Omniras projektregister,

- global approvalmotor,

- hemlighetsvalv,

- central incidentsamordning,

- och andra projekts privata data.

20.14 BOUNDED CONTEXT

GainPilot ska behandlas som ett bounded context.

Det innebär att begrepp får ha GainPilot-specifik betydelse.

Exempel:

Program

kan inom GainPilot betyda:

- träningsprogram,

- kostprogram,

- eller kombinerad plan.

I ett annat Omnira-projekt kan program betyda något helt annat.

Domänbegrepp ska därför inte delas genom otydliga generella objekt.

20.15 GEMENSAMT SPRÅK

GainPilot ska ha ett gemensamt domänspråk som används av:

- produkt,

- kod,

- agenter,

- dokumentation,

- tester,

- support,

- och analytics.

Begrepp som:

- session,

- plan,

- programblock,

- substitution,

- skillstatus,

- måltidsstruktur,

- och följsamhet

ska ha canonical definitioner.

20.16 ÖVERSÄTTNING TILL OMNIRA

När GainPilot kommunicerar med Omnira ska domänbegrepp översättas till gemensamma kontrakt.

Exempel:

GainPilot-begrepp:

Träningspass genomfört.

Omnira-event:

domain_activity_completed.

Eventet kan innehålla en domänspecifik referens utan att exponera hela passets känsliga innehåll.

20.17 ANTI-CORRUPTION-LAGER

GainPilot ska använda anti-corruption-lager mot:

- andra Omnira-domäner,

- externa träningsplattformar,

- betalningssystem,

- wearables,

- och generella AI-tjänster.

Ett externt systems datamodell ska inte direkt bli GainPilots interna sanning.

20.18 CAPABILITY-MODELL

GainPilot ska beskriva sina funktioner som capabilities.

Exempel:

- create_training_program,

- import_training_program,

- start_workout_session,

- record_training_result,

- generate_meal_plan,

- substitute_exercise,

- substitute_meal,

- analyze_progress,

- communicate_with_user,

- and export_user_data.

Varje capability ska ha:

- identitet,

- riskklass,

- tillåten aktör,

- erforderliga data,

- approvalkrav,

- och auditnivå.

20.19 CAPABILITY ÄR INTE GRÄNSSNITTSKNAPP

En capability beskriver vad domänen kan göra.

Den är inte bunden till:

- viss skärm,

- viss agent,

- viss API-endpoint,

- eller viss teknisk implementation.

Samma capability kan användas genom:

- Arnold,

- användargränssnitt,

- API,

- import,

- eller godkänt workflow.

20.20 CAPABILITY-ÄGARE

Varje capability ska ha en ansvarig ägare.

Ägaren kan vara:

- GainPilot-domänen,

- en specifik tjänst,

- eller en definierad agentfunktion.

Det ska inte finnas kritiska capabilities utan tydligt ansvar.

20.21 DOMÄNTJÄNSTER

GainPilot kan delas upp i domäntjänster.

Exempel:

- User Profile Service,

- Training Planning Service,

- Workout Execution Service,

- Exercise Graph Service,

- Nutrition Service,

- Progress Intelligence Service,

- Coaching Communication Service,

- Safety Service,

- och Import Service.

Tjänsteindelningen ska följa verkliga ansvar.

Den ska inte skapas enbart för att maximera antalet mikrotjänster.

20.22 MODULÄR MONOLIT FÖRE ONÖDIGA MIKROTJÄNSTER

GainPilot kan initialt implementeras som en modulär monolit.

Det innebär:

- tydliga modulgränser,

- separata kontrakt,

- isolerad affärslogik,

- och gemensam deployment där det är praktiskt.

Mikrotjänster ska införas när det finns verkliga behov som:

- separat skalning,

- säkerhetsisolering,

- olika tillgänglighetskrav,

- eller oberoende utveckling.

20.23 INGEN DISTRIBUTION FÖR DISTRIBUTIONENS SKULL

GainPilot ska inte delas upp i distribuerade tjänster enbart för att arkitekturen ska se avancerad ut.

Distribution skapar:

- nätverksfel,

- versionskonflikter,

- okända utfall,

- observabilitybehov,

- och större driftskostnad.

Varje distribuerad gräns ska motiveras.

20.24 DOMÄNKONTRAKT

Kommunikation mellan GainPilot och Omnira ska ske genom versionerade kontrakt.

Kontrakten kan vara:

- kommandon,

- queries,

- events,

- signals,

- approvals,

- och data envelopes.

Kontrakten ska innehålla:

- schemaidentitet,

- version,

- avsändare,

- mottagare,

- tenant,

- correlation identity,

- idempotency identity,

- och relevant policyinformation.

20.25 KOMMANDON

Ett kommando uttrycker en begäran om att någonting ska göras.

Exempel:

- create_training_program,

- pause_gainpilot_project,

- export_user_training_data,

- revoke_coach_access,

- eller start_domain_recovery.

Kommandot ska ha tydlig mottagare och auktorisation.

20.26 QUERIES

En query hämtar information utan att själv förändra domäntillstånd.

Exempel:

- get_current_training_plan,

- get_user_progress_summary,

- get_active_gainpilot_capabilities,

- eller get_domain_health.

Queries ska följa:

- tenantisolering,

- scope,

- och dataminimering.

20.27 EVENTS

Ett event beskriver någonting som redan har hänt.

Exempel:

- workout_session_completed,

- training_program_activated,

- meal_plan_updated,

- user_memory_corrected,

- eller gainpilot_domain_hibernated.

Event får inte formuleras som en dold order.

20.28 SIGNALS

En signal beskriver en observation som kan behöva analys.

Exempel:

- adherence_declining,

- repeated_pain_feedback,

- integration_unhealthy,

- unusual_cost_growth,

- eller product_friction_detected.

En signal ska inte automatiskt skapa en åtgärd.

20.29 APPROVAL REQUEST

En approval request ska innehålla:

- föreslagen åtgärd,

- anledning,

- effekt,

- risk,

- kostnad,

- alternativ,

- och återställningsmöjlighet.

Användaren ska inte godkänna en ogenomskinlig formulering som:

Låt Atlas optimera GainPilot.

20.30 DOMÄNEVENTENS DATAINNEHÅLL

GainPilot-event ska använda minsta nödvändiga data.

Ett event om genomfört pass kan exempelvis innehålla:

- anonymiserad domänreferens,

- status,

- tidpunkt,

- och analysbehov.

Det behöver normalt inte innehålla:

- samtliga set,

- kroppsvikt,

- smärtanteckningar,

- eller full coachdialog.

20.31 REFERENS FÖRE KOPIA

När ett annat system behöver fördjupad data ska eventet normalt bära:

- en säker referens,

- inte en full kopia.

Mottagaren ska därefter begära data genom Hermes med rätt scope.

20.32 CANONICAL DATA ENVELOPE

All betydelsefull data som passerar domängränsen ska använda ett canonical envelope.

Envelope ska minst kunna innehålla:

- envelope_identity,

- schema_identity,

- schema_version,

- tenant_identity,

- user_identity where allowed,

- project_identity,

- domain_identity,

- producer,

- created_at,

- classification,

- purpose,

- provenance,

- retention_policy,

- permission_scope,

- integrity_reference,

- and payload_reference.

Exakta fältnamn fastställs i implementationen.

20.33 DATACLASSIFICERING

GainPilot-data ska klassificeras.

Exempel:

- public,

- internal,

- confidential,

- sensitive_personal,

- health_related,

- highly_restricted,

- och derived_aggregate.

Klassificeringen ska påverka:

- lagring,

- loggning,

- delning,

- modellåtkomst,

- och retention.

20.34 HÄLSORELATERAD DATA

Tränings-, kost- och återhämtningsdata kan vara hälsorelaterad även när den inte är medicinsk journaldata.

GainPilot ska behandla exempelvis:

- vikt,

- kroppsmått,

- smärta,

- medicinska begränsningar,

- kostrestriktioner,

- puls,

- och progressionsbilder

med förhöjd integritet.

20.35 DATASYFTE

Dataåtkomst ska ha definierat syfte.

Exempel:

Tillåtet syfte:

Anpassa dagens träningspass efter en aktiv begränsning.

Inte automatiskt tillåtet:

Använda samma uppgift i marknadsföring eller global modellträning.

20.36 SYFTESBEGRÄNSNING

Data som samlats in för coachning får inte automatiskt användas för:

- reklam,

- försäljning,

- extern profilering,

- eller generell modellträning.

Nytt syfte ska kräva separat grund och relevant användarkontroll.

20.37 DATAÄGANDE

Användaren ska behålla kontrollen över sin personliga GainPilot-data.

GainPilot äger inte användarens:

- träningshistorik,

- kroppsmått,

- privata bilder,

- kostlogg,

- eller coachdialog

på ett sätt som hindrar export eller radering.

20.38 PRODUKTKUNSKAP OCH ANVÄNDARDATA

GainPilot ska skilja mellan:

- produktens canonical kunskap,

- användarens privata data,

- användarens härledda profil,

- och aggregerade produktinsikter.

En privat användaruppgift ska inte bli canonical träningskunskap.

20.39 MINNESDOMÄN

GainPilot ska ha en egen minnesdomän.

Den kan innehålla:

- träningsmål,

- träningshistorik,

- kostpreferenser,

- utrustning,

- övningspreferenser,

- aktiva begränsningar,

- coachningspreferenser,

- och GainPilot-beslut.

Minnesdomänen ska isoleras från andra projekt.

20.40 DELAD ANVÄNDARPROFIL

Vissa uppgifter kan tillhöra en godkänd delad Omnira-profil.

Exempel:

- hur användaren vill bli tilltalad,

- övergripande kommunikationsstil,

- språk,

- godkända arbetstider,

- och vissa generella tillgänglighetssignaler.

Delad profil ska innehålla endast uttryckligt godkända uppgifter.

20.41 PRIVAT GAINPILOT-MINNE

Följande ska normalt förbli GainPilot-privat:

- kroppsvikt,

- kroppsmått,

- progressionsbilder,

- träningsprestationer,

- kostdetaljer,

- smärtanteckningar,

- och privata coachdialoger.

Atlas ska inte få full åtkomst enbart för att Atlas är central intelligens.

20.42 HERMES-GATEWAY

Hermes ska vara den kontrollerade vägen mellan:

- GainPilot-minne,

- Atlas,

- Arnold,

- andra Omnira-domäner,

- och externa tjänster.

Direkt databasåtkomst mellan domäner ska undvikas.

20.43 MINNESLÄSNING

En minnesläsning ska minst ange:

- aktör,

- användare,

- domän,

- syfte,

- datatyper,

- tidsperiod,

- detaljnivå,

- och om resultatet får sparas.

Hermes ska neka för breda förfrågningar.

20.44 MINNESSKRIVNING

En minnesskrivning ska följa GainPilots minnespolicy.

Flödet kan vara:

Observation

→ kandidat

→ klassificering

→ riskbedömning

→ bekräftelse där det krävs

→ skrivning

→ versionering

→ audit.

Arnold ska inte skriva varje konversationsdetalj till långtidsminnet.

20.45 TVÄRDOMÄNANALYS

Atlas kan genomföra tvärdomänanalys när:

- syftet är definierat,

- användaren tillåter det,

- Hermes minimerar datan,

- och resultatet ligger inom Atlas mandat.

Exempel:

Tillåten reducerad analys:

Användarens tillgänglighet har minskat under en period, vilket kan påverka träningsplanens genomförbarhet.

Atlas behöver normalt inte få:

- mötestitlar,

- privata meddelanden,

- eller namn på familjemedlemmar.

20.46 DOMÄNRELATIONER

GainPilot kan ha kontrollerade relationer till andra Omnira-projekt.

Exempel:

- Kalenderdomän för planering.

- Voice-domän för röststyrning.

- Mobile Intelligence för enhetsfunktioner.

- Executive Intelligence för produkt- och verksamhetsanalys.

- Commerce för abonnemang.

- Content-system för utbildningsmaterial.

Varje relation ska ha eget kontrakt.

20.47 INGEN IMPLICIT DELNING

Att två projekt finns inom samma Omnira-installation innebär inte att de får dela data.

All delning ska kräva:

- definierad relation,

- tillåten capability,

- rätt tenant,

- rätt användare,

- rätt syfte,

- och relevant approval.

20.48 DOMÄNKATALOG

Omnira ska ha en katalog över aktiva domäner.

GainPilot-posten ska kunna visa:

- identitet,

- status,

- version,

- ansvarig,

- capabilities,

- beroenden,

- riskklass,

- och driftstatus.

Katalogen ska inte exponera privata användardata.

20.49 SERVICEKATALOG

GainPilots interna tjänster ska registreras.

Katalogen ska minst innehålla:

- tjänsteidentitet,

- ansvar,

- ägare,

- API- eller eventkontrakt,

- beroenden,

- dataägande,

- SLO,

- och incidentväg.

20.50 AGENTKATALOG

Alla agenter som kan agera i GainPilot ska registreras.

Exempel:

- Arnold.

- Program Planning Agent.

- Nutrition Planning Agent.

- Progress Analysis Agent.

- Safety Review Agent.

- Import Validation Agent.

- Product Analysis Agent.

- Support Agent.

Varje agent ska ha:

- identitet,

- version,

- capabilities,

- förbjudna åtgärder,

- authority level,

- och ansvarig ägare.

20.51 ARNOLD SOM DOMÄNAGENT

Arnold ska tillhöra GainPilot-domänen.

Han ska kunna använda andra Omnira-förmågor genom kontrakt.

Arnold ska inte vara en global superagent med obegränsad åtkomst.

20.52 ATLAS SOM CENTRAL INTELLIGENS

Atlas ska ligga ovanför enskilda produktdomäner som central intelligens och samordnare.

Atlas ska kunna:

- förstå GainPilots mål,

- analysera produktstatus,

- föreslå utveckling,

- samordna godkända agentsystem,

- och koppla GainPilot till Omniras större strategi.

Atlas ska inte ersätta Arnold i vanlig användarcoachning.

20.53 ATLAS FÅR INTE BLI GENVEG

Atlas får inte användas för att kringgå:

- GainPilots säkerhetsregler,

- domänvalidering,

- användarapproval,

- eller Hermes-isolering.

En central roll innebär större ansvar, inte färre begränsningar.

20.54 MANAGER- OCH ORKESTRERINGSROLLER

Omnira kan använda manageragenter för:

- arbetsfördelning,

- uppföljning,

- beroenden,

- och sammanställning.

Manageragenten ska inte automatiskt få utföra domänens specialistarbete.

20.55 AGENTDELEGERING

När Atlas delegerar en uppgift till en GainPilot-agent ska uppgiften innehålla:

- mål,

- scope,

- tillåtna verktyg,

- datagränser,

- budget,

- riskklass,

- approvalpunkter,

- och stoppvillkor.

20.56 DELEGERING SKAPAR INTE NY BEHÖRIGHET

En agent får inte större behörighet bara för att uppgiften kommer från Atlas.

Den effektiva behörigheten ska vara den minsta av:

- Atlas delegation,

- agentens egen policy,

- GainPilot-domänens policy,

- användarens mandat,

- och systemets säkerhetsregler.

20.57 AUTHORITY LEVELS

GainPilot ska använda Omniras authority levels.

Ett exempel på nivåmodell är:

L0 — Observera.

L1 — Analysera.

L2 — Föreslå.

L3 — Förbereda en reversibel åtgärd.

L4 — Utföra godkända lågriskåtgärder.

L5 — Utföra bredare bounded autonomy inom explicit mandat.

L6 — Särskilt styrd hög autonomi för definierade områden.

Exakt nivådefinition ska följa Omniras canonical governance.

20.58 AUTHORITY PER CAPABILITY

Authority ska inte ges globalt till en agent.

Den ska ges per:

- capability,

- projekt,

- användare,

- datatyp,

- integration,

- enhet,

- och tidsperiod.

Arnold kan exempelvis få:

L4 för att uppdatera nästa träningsbelastning enligt godkänd regel.

Han kan samtidigt ha:

L2 för att ändra användarens långsiktiga energimål.

20.59 EARNED BOUNDED AUTONOMY

GainPilot ska använda förtjänad och begränsad autonomi.

Autonomi ska kunna höjas när en capability visar:

- stabil kvalitet,

- låg felfrekvens,

- god återställningsförmåga,

- tydlig observability,

- och frånvaro av allvarliga incidenter.

Autonomi ska kunna sänkas direkt.

20.60 AUTONOMI ÄR INTE PERMANENT

Autonomi ska kunna:

- löpa ut,

- pausas,

- begränsas,

- återkallas,

- och omprövas.

En agent som tidigare fungerat väl ska inte behålla mandat efter:

- modellbyte,

- policyändring,

- incident,

- eller nytt riskscope.

20.61 APPROVALS

GainPilot ska använda Omniras approvalmotor för betydelsefulla åtgärder.

Approval kan krävas för:

- aktivering av nytt program,

- större kostförändring,

- ny integration,

- delning med coach,

- extern publicering,

- utgift,

- eller höjd agentautonomi.

20.62 APPROVALNIVÅER

Approval ska vara proportionerligt.

Exempel:

Lågrisk:

Bekräfta ett övningsbyte i aktivt pass.

Medelrisk:

Aktivera ett nytt träningsblock.

Högrisk:

Ge extern coach bred dataåtkomst.

Kritisk:

Förändra säkerhetsregler eller använda hälsodata för nytt syfte.

20.63 APPROVALFÖNSTER

En approval kan vara:

- engångsbaserad,

- sessionsbaserad,

- tidsbegränsad,

- återkommande,

- eller giltig inom ett mandat.

Användaren ska se giltighetstiden.

20.64 APPROVAL FÅR INTE VARA OBEGRIPLIGT

Approvalgränssnittet ska beskriva:

- vad som händer,

- varför,

- vilka data som används,

- eventuell kostnad,

- risk,

- och hur åtgärden återställs.

Formuleringen:

Godkänn förbättring

är inte tillräcklig.

20.65 BUDGET

GainPilot ska ha en egen budgetmodell inom Omnira.

Budgeten kan omfatta:

- AI-anrop,

- bild- och videogenerering,

- lagring,

- externa API:er,

- marknadsföring,

- verktyg,

- och agenter.

Atlas ska kunna ge råd.

Utgifter ska följa användarens mandat.

20.66 KOSTNADSTILLSKRIVNING

Kostnader ska kunna tillskrivas:

- tenant,

- GainPilot,

- capability,

- workflow,

- agent,

- användare,

- och extern leverantör.

Det ska gå att förstå varför kostnaden uppstod.

20.67 KOSTNADSGRÄNSER

GainPilot ska kunna ha:

- daglig gräns,

- månatlig gräns,

- capabilitygräns,

- agentgräns,

- och nödstopp.

En agent får inte kringgå kostnadsgränsen genom att dela upp uppgiften i många mindre anrop.

20.68 RESURSPLANERING

Omnira ska kunna prioritera resurser mellan projekt.

GainPilot ska inte automatiskt förbruka all tillgänglig:

- AI-kapacitet,

- lagring,

- GPU-tid,

- eller utvecklingstid.

Prioritering ska baseras på projektstatus och godkänd strategi.

20.69 GAINPILOT I ACTIVE MODE

När GainPilot är active kan följande tillåtas:

- normal användardrift,

- schemalagd analys,

- godkänd produktutveckling,

- support,

- och bounded autonomy.

Active innebär inte obegränsad agentaktivitet.

20.70 GAINPILOT I OBSERVER MODE

Observer mode kan tillåta:

- datainsamling,

- analys,

- rapportering,

- och förslag.

Systemet ska inte genomföra större produktförändringar eller proaktiv verksamhet.

20.71 GAINPILOT I HIBERNATE MODE

Hibernate mode ska minimera aktivitet.

Tillåtna funktioner kan vara:

- säkerhetsövervakning,

- dataintegritet,

- export,

- användaråtkomst till historik,

- och kritiskt underhåll.

Nya automatiska utvecklingsprojekt ska inte startas.

20.72 OPERATING MODE PER SUBSYSTEM

Olika GainPilot-delar kan ha olika operating mode.

Exempel:

Kundappen:

Active.

Produktutvecklingsagent:

Observer.

Marknadsföring:

Hibernate.

Research:

Limited active.

Detta ska vara explicit.

20.73 WORKFLOW-MODELL

GainPilot ska registrera sina workflows i Omnira.

Exempel:

- onboarding workflow,

- program creation workflow,

- weekly adaptation workflow,

- workout execution workflow,

- meal planning workflow,

- safety escalation workflow,

- och user data export workflow.

Varje workflow ska ha version.

20.74 WORKFLOWTILLSTÅND

Ett workflow ska kunna ha status som:

- planned,

- awaiting_input,

- awaiting_approval,

- running,

- paused,

- blocked,

- completed,

- failed,

- compensated,

- cancelled,

- eller unknown_outcome.

Statusen ska vara spårbar.

20.75 WORKFLOWÄGARE

Varje workflow ska ha:

- verksamhetsägare,

- teknisk ägare,

- agentansvar,

- och incidentväg.

Kritiska workflows ska inte vara ägarlösa.

20.76 WORKFLOW OCH SESSION

En användarsession och ett backend-workflow är inte samma sak.

Ett träningspass kan vara en användarsession.

Bakom den kan flera workflows hantera:

- synkronisering,

- analys,

- minnesskrivning,

- och sammanfattning.

Dessa ska hållas åtskilda.

20.77 IDEMPOTENS

Betydelsefulla GainPilot-workflows ska vara idempotenta där det är möjligt.

Exempel:

Ett träningsresultat ska inte registreras två gånger på grund av:

- nätverksfel,

- omkörning,

- eller dubbla event.

20.78 UNKNOWN OUTCOME

När ett distribuerat anrop får okänt utfall ska GainPilot inte automatiskt anta:

- framgång,

- eller misslyckande.

Systemet ska:

- verifiera tillståndet,

- använda idempotency identity,

- och undvika dubbla åtgärder.

20.79 RETRIES

Retries ska vara:

- begränsade,

- klassificerade,

- och anpassade efter felet.

Systemet ska inte återförsöka:

- permanent behörighetsfel,

- användaravslag,

- eller säkerhetsblockering

som om det vore tillfälligt nätverksfel.

20.80 COMPENSATION

Vissa GainPilot-workflows ska kunna kompenseras.

Exempel:

Om ett nytt program aktiveras men kalenderuppdateringen misslyckas kan systemet:

- pausa aktiveringen,

- återställa tidigare kalender,

- eller begära användarbeslut.

Compensation är inte alltid exakt rollback.

20.81 LOKAL TRANSAKTION

Inom samma domänmodul ska GainPilot använda lokal transaktion när det är rimligt.

Det ska inte använda distribuerad workflowlogik för operationer som kan genomföras säkert i en transaktion.

20.82 OUTBOX

När en lokal förändring ska publicera ett event bör GainPilot använda transactional outbox eller motsvarande mönster.

Det minskar risken att:

- databasändringen lyckas,

- men eventet försvinner.

20.83 INBOX

Mottagande tjänster ska kunna använda inbox- eller dedupliceringsmönster.

Samma event ska inte skapa samma effekt flera gånger.

20.84 SCHEDULING

GainPilot ska använda Omniras schemaläggning för:

- veckosammanfattningar,

- programutvärdering,

- integrationssynkronisering,

- och andra bakgrundsuppgifter.

Schemalagda körningar ska följa:

- tenant,

- tidszon,

- operating mode,

- och budget.

20.85 VILLKORSSTYRDA WORKFLOWS

Vissa workflows ska starta när ett villkor uppfylls.

Exempel:

- programblock avslutat,

- integration återställd,

- användaren har godkänt coachdelning,

- eller dataraderingens ångerperiod har löpt ut.

Villkoret ska verifieras vid exekvering.

20.86 INGA DOLDA CRONJOBB

Alla betydelsefulla schemalagda uppgifter ska vara registrerade och synliga.

GainPilot ska inte ha okända bakgrundsjobb som:

- förbrukar kostnad,

- skriver data,

- eller kontaktar användaren.

20.87 DEPENDENCIES

GainPilot ska deklarera sina beroenden.

Exempel:

- autentisering,

- Hermes,

- Atlas,

- databaser,

- filmedia,

- modellleverantörer,

- betalning,

- pushnotiser,

- och externa träningsintegrationer.

Varje beroende ska ha en kritikalitetsklass.

20.88 HÅRDA OCH MJUKA BEROENDEN

Ett hårt beroende krävs för funktionen.

Ett mjukt beroende förbättrar funktionen men får inte stoppa grundflödet.

Exempel:

Hårt:

Lokal träningsdata för att visa dagens pass.

Mjukt:

Atlas långsiktiga tvärdomänanalys.

20.89 DEGRADERAT LÄGE

GainPilot ska kunna fungera i degraderat läge.

Exempel:

Om Atlas är otillgängligt kan användaren fortfarande:

- öppna sitt program,

- genomföra passet,

- logga resultat,

- och använda lokala säkerhetsregler.

Djupare analys kan vänta.

20.90 OFFLINE-FIRST FÖR AKTIVA PASS

Aktiva träningspass ska ha starkt offline-stöd.

Lokalt ska minst kunna finnas:

- passstruktur,

- övningsinstruktioner,

- timers,

- resultatregistrering,

- säkerhetsinformation,

- och synkroniseringskö.

20.91 CENTRAL INTELLIGENS FÅR INTE VARA SINGLE POINT OF FAILURE

Atlas ska tillföra värde.

Atlas får inte vara ett absolut krav för varje:

- repetition,

- timer,

- måltidsvisning,

- eller lokalt användarval.

Grundfunktioner ska kunna fortsätta säkert.

20.92 CIRCUIT BREAKERS

GainPilot ska använda circuit breakers eller motsvarande skydd mot felande externa beroenden.

Systemet ska inte fortsätta skicka tusentals misslyckade anrop till:

- modellleverantör,

- wearable,

- eller integration.

20.93 TIMEOUTS

Alla externa och distribuerade anrop ska ha definierade timeouts.

Avsaknad av svar ska inte låsa användarens aktiva session obegränsat.

20.94 FALLBACK

Fallback ska vara definierat.

Exempel:

Om avancerad substitutionsanalys är otillgänglig kan GainPilot visa:

- tidigare godkända alternativ,

- eller be användaren välja manuellt.

Fallback får inte skapa ny risk genom en sämre men ogenomskinlig modell.

20.95 RECOVERY

Efter återställning ska GainPilot kunna:

- synkronisera lokala resultat,

- verifiera okända utfall,

- återuppta säkra workflows,

- och rapportera eventuella konflikter.

Systemet ska inte tyst kasta bort offlinehistorik.

20.96 SERVICE LEVEL OBJECTIVES

GainPilot ska definiera SLO för viktiga användarflöden.

Exempel:

- öppna dagens pass,

- spara ett träningsresultat,

- starta timer,

- visa säkerhetsinstruktion,

- och exportera användardata.

Alla funktioner behöver inte ha samma tillgänglighetskrav.

20.97 KRITISKA FLÖDEN

Kritiska flöden kan vara:

- åtkomst till aktivt pass,

- resultatsparning,

- säkerhetsstopp,

- radering,

- och behörighetsåterkallelse.

Produktanalys i realtid kan ha lägre kritikalitet.

20.98 OBSERVABILITY

GainPilot ska vara observerbart genom Omnira.

Observability ska omfatta:

- metrics,

- logs,

- traces,

- events,

- workflowstatus,

- agentbeslut,

- integrationer,

- kostnader,

- och säkerhetssignaler.

20.99 DOMÄNMETRIK

GainPilot ska ha domänspecifika driftmått.

Exempel:

- program creation success,

- workout save latency,

- duplicate result rate,

- substitution correction rate,

- failed memory access,

- safety escalation rate,

- och integration health.

20.100 LOGGNING

Loggar ska vara strukturerade.

De ska normalt innehålla:

- teknisk identitet,

- correlation identity,

- tenant,

- domän,

- status,

- felklass,

- och tidsstämpel.

De ska minimera:

- coachdialog,

- kroppsmått,

- kostdetaljer,

- och annan känslig data.

20.101 DISTRIBUTED TRACING

Distribuerade flöden ska kunna spåras över:

- Arnold,

- GainPilot-tjänster,

- Hermes,

- Atlas,

- och externa integrationer.

Tracing ska inte innebära att hela känsliga payloads kopieras.

20.102 CORRELATION IDENTITY

Varje betydelsefullt flöde ska kunna ha en correlation identity.

Exempel:

Ett programförslag kan följas från:

- användarens begäran,

- till Arnold,

- till planeringsagent,

- till approval,

- till aktivering.

20.103 AUDIT

Audit ska registrera betydelsefulla beslut.

Exempel:

- agent fick utökat mandat,

- program aktiverades,

- coach fick åtkomst,

- minne delades med Atlas,

- data exporterades,

- eller domänen sattes i hibernation.

20.104 AUDIT ÄR INTE DEBUGLOGG

Audit ska vara:

- långsiktigt begriplig,

- integritetsskyddad,

- svår att manipulera,

- och kopplad till verksamhetsbeslut.

Debuglogg kan ha kortare retention och annan detaljnivå.

20.105 SÄKERHETSHÄNDELSER

Säkerhetshändelser ska kunna skickas till Omniras centrala incidentfunktion.

Exempel:

- åtkomstförsök över tenantgräns,

- fel användardata i coachkontext,

- läckt secret,

- eller otillåten agentåtgärd.

20.106 DOMÄNINCIDENTER

GainPilot ska ha egen incidentklassificering.

Exempel:

- träningsresultat förloras,

- felaktigt program aktiveras,

- privat bild exponeras,

- substitutionsmotorn ger riskfyllt val,

- eller användaren får fel kostplan.

20.107 CENTRAL OCH LOKAL INCIDENTHANTERING

GainPilot ska kunna hantera domänincidenter lokalt.

Om incidenten berör:

- identitet,

- flera projekt,

- central minnesinfrastruktur,

- eller större säkerhet

ska Omniras centrala incidentledning aktiveras.

20.108 NÖDSTOPP

GainPilot ska ha:

- globalt nödstopp,

- domänspecifikt nödstopp,

- capabilitystopp,

- agentstopp,

- workflowstopp,

- och integrationsstopp.

Stoppen ska kunna användas utan att hela Omnira stängs ned.

20.109 SÄKER AVSTÄNGNING

När en capability stoppas ska systemet:

- stoppa nya åtgärder,

- hantera pågående arbete,

- bevara tillstånd,

- och tydligt visa vad som är pausat.

Ett aktivt träningspass ska inte förlora användarens lokala logg.

20.110 ÅTERSTART EFTER NÖDSTOPP

Återstart ska kräva:

- orsak identifierad,

- risk bedömd,

- berörd version känd,

- kompensation genomförd där relevant,

- och kontrollerad aktivering.

Systemet ska inte återstarta automatiskt en högriskcapability enbart för att tjänsten svarar igen.

20.111 SECRETS

GainPilot ska inte lagra:

- API-nycklar,

- lösenord,

- access tokens,

- eller privata certifikat

i kod, prompts, dokumentation eller användarminne.

Secrets ska hanteras genom Omniras godkända valv.

20.112 SECRET-SCOPE

Ett secret ska vara begränsat till:

- tenant,

- projekt,

- integration,

- miljö,

- och capability.

En token för en träningsintegration ska inte kunna användas av ett annat Omnira-projekt.

20.113 TOKENROTATION

Integrationstokens ska kunna:

- roteras,

- återkallas,

- och ersättas

utan att användardata förstörs.

Systemet ska kunna identifiera vilka workflows som påverkas.

20.114 MILJÖER

GainPilot ska skilja mellan:

- local,

- development,

- test,

- staging,

- preview,

- och production.

Produktionsdata ska inte kopieras till testmiljö utan särskild process.

20.115 TESTDATA

Testdata ska vara:

- syntetisk,

- anonymiserad,

- eller särskilt godkänd.

Utvecklingsagenter ska inte få full kunddata för att felsöka vanliga problem.

20.116 PREVIEW-MILJÖER

Pull requests kan skapa preview-miljöer.

Preview ska:

- använda isolerad data,

- ha begränsade integrationer,

- och inte kontakta verkliga användare.

20.117 DEPLOYMENT

GainPilot-deployment ska vara versionerad och reproducerbar.

Deployment ska kunna visa:

- commit,

- build,

- schema,

- policyversion,

- agentversion,

- och aktiva feature flags.

20.118 FEATURE FLAGS

Feature flags kan användas för:

- begränsad utrullning,

- experiment,

- domänaktivering,

- och snabb avstängning.

Feature flags ska ha:

- ägare,

- syfte,

- målgrupp,

- slutdatum,

- och borttagningsplan.

20.119 INGEN PERMANENT FLAGGSKULD

Tillfälliga flags ska inte ligga kvar utan kontroll.

Gamla flags kan skapa:

- otydligt beteende,

- säkerhetsluckor,

- och svårtestad kod.

20.120 MIGRATIONER

GainPilots datamigrationer ska vara:

- versionerade,

- testade,

- återstartbara,

- och observerbara.

Migration ska inte anta att alla användare har samma dataversion.

20.121 BAKÅTKOMPATIBILITET

Domänkontrakt ska stödja rimlig bakåtkompatibilitet.

En mobilapp som ännu inte uppdaterats ska inte omedelbart förlora all funktion vid en backendrelease.

20.122 SCHEMAVERSIONERING

Schemaändringar ska klassificeras som:

- bakåtkompatibla,

- additiva,

- deprecating,

- eller breaking.

Breaking changes ska ha migrationsplan.

20.123 DEPRECATION

En funktion eller kontraktsversion ska inte försvinna utan:

- användningsanalys,

- kommunikation,

- migreringsväg,

- och slutdatum.

Säkerhetsrisker kan kräva snabbare avveckling.

20.124 ROLLBACK

GainPilot ska kunna rulla tillbaka:

- kod,

- agentmodell,

- policy,

- feature flag,

- domänpaket,

- och integration

när det är säkert.

Datamigrationer kan kräva framåtriktad reparation i stället för enkel rollback.

20.125 RELEASE GOVERNANCE

En release ska klassificeras efter risk.

Exempel:

Låg risk:

Textförbättring.

Medelrisk:

Ny statistikvy.

Hög risk:

Förändrad programgenerator.

Kritisk:

Ny säkerhetsmodell eller bredare dataåtkomst.

20.126 FYRAÖGONSPRINCIP

Högriskförändringar ska kunna kräva:

- teknisk granskare,

- domängranskare,

- säkerhetsgranskare,

- eller produktägare.

Samma agent ska inte ensam:

- föreslå,

- implementera,

- godkänna,

- och produktionssätta

en kritisk förändring.

20.127 REPOSITORY

GainPilot-koden kan finnas i Omniras huvudrepository eller i ett separat repository.

Valet ska inte försvaga:

- governance,

- spårbarhet,

- testkrav,

- och versionskoppling.

Domängränser ska vara tydliga oavsett repositorystruktur.

20.128 MAPSTRUKTUR

GainPilot ska ha en tydlig och stabil mappstruktur.

Den kan skilja mellan:

- application,

- domain,

- infrastructure,

- agents,

- workflows,

- policies,

- tests,

- migrations,

- documentation,

- och generated artifacts.

Canonical böcker ska inte blandas med tillfälliga arbetsfiler.

20.129 CANONICAL KUNSKAP I REPOSITORYT

Efter redaktionellt godkännande ska GainPilot-boken kunna integreras i repositoryt som versionerad kunskap.

Den ska placeras i en struktur som Atlas kan använda utan att:

- arbetsutkast,

- gamla versioner,

- och canonical edition

blandas samman.

20.130 KUNSKAPSNIVÅER

GainPilot-dokumentation ska kunna klassificeras som:

- working draft,

- editorial review,

- approved,

- canonical,

- implementation guidance,

- deprecated,

- eller archived.

Agenter ska veta vilken nivå som får styra implementation.

20.131 BOK ÄR INTE KÖRBAR POLICY

Den canonical boken ska vara normerande arkitekturkunskap.

Körbara policies, schema och regler ska samtidigt finnas i tekniskt validerbara format.

En agent ska inte behöva tolka hundratals sidor fri text vid varje beslut.

20.132 KNOWLEDGE COMPILATION

Canonical bokinnehåll kan kompileras till:

- policyregister,

- kontraktskatalog,

- decision records,

- testkrav,

- domänordlista,

- och agentinstruktioner.

Den kompilerade kunskapen ska kunna spåras tillbaka till kapitlet.

20.133 ARKITEKTURBESLUT

Betydelsefulla implementationstolkningar ska dokumenteras som architecture decision records.

Varje beslut ska ange:

- kontext,

- alternativ,

- beslut,

- konsekvenser,

- status,

- och relation till canonical kontrakt.

20.134 INGEN TYST AVVIKELSE FRÅN BOKEN

Om implementationen behöver avvika från canonical vision ska avvikelsen dokumenteras.

Processen ska kunna vara:

Avvikelse identifierad

→ konsekvensanalys

→ beslut

→ godkännande

→ uppdaterad implementation

→ eventuell bokrevision.

Agenter får inte tyst ignorera kontrakt.

20.135 PRODUCT ROADMAP

GainPilot ska ha en roadmap som kopplar:

- produktmål,

- canonical kapitel,

- capabilities,

- implementation stages,

- och mätbara framgångskriterier.

Roadmapen ska inte endast vara en lista över funktioner.

20.136 STAGE-IMPLEMENTATION

GainPilot ska implementeras i kontrollerade stages.

En stage ska ha:

- scope,

- beroenden,

- capabilities,

- säkerhetskrav,

- exkluderade funktioner,

- tester,

- och exitkriterier.

Stage 1 ska inte tyst växa till full vision.

20.137 STAGE 1

Stage 1 ska prioritera en användbar och säker kärna.

Den kan omfatta:

- grundläggande onboarding,

- användarprofil,

- träningsprogram,

- träningspass,

- resultatloggning,

- enkel substitutionsmotor,

- grundläggande koststöd,

- Arnold-dialog,

- och minimerad Omnira-integration.

Avancerad autonomi ska normalt vänta.

20.138 STAGE 1 OCH OMNIRA

Stage 1 ska ändå använda rätt arkitekturgrund.

Det innebär minst:

- tenantmedveten identitet,

- GainPilot-domänscope,

- Hermes-gräns,

- capabilitymodell,

- approvals,

- audit,

- och branchbaserad utveckling.

En MVP får vara liten.

Den får inte vara arkitektoniskt ansvarslös.

20.139 PROGRESSIVE DELIVERY

GainPilot ska använda progressiv leverans.

Flödet kan vara:

- lokalt,

- test,

- preview,

- staging,

- intern användare,

- begränsad pilot,

- och bredare produktion.

Varje steg ska ha verifiering.

20.140 INTERNAL FIRST

Grundaren kan vara den första interna användaren.

Detta ger möjlighet att:

- validera träningsflöden,

- identifiera friktion,

- testa Arnold,

- och bygga verklig historik.

Intern användning får inte ersätta säkerhets- och kvalitetstestning.

20.141 DOGFOODING

GainPilot-teamet kan använda produkten själv.

Dogfooding ska dokumentera:

- verkliga problem,

- felaktiga antaganden,

- och förbättringsförslag.

Grundarens preferenser får inte automatiskt bli universella standardvärden för alla kunder.

20.142 PRODUKTANALYS

GainPilot ska kunna analysera:

- onboarding,

- programaktivering,

- genomförande,

- substitution,

- kostfunktion,

- kommunikation,

- retention,

- och användarnytta.

Analysen ska skilja mellan:

- produktkvalitet,

- användarresultat,

- och affärsresultat.

20.143 EXECUTIVE INTELLIGENCE

Omniras Executive Intelligence ska kunna följa GainPilot som verksamhet.

Det kan omfatta:

- produktstatus,

- användning,

- säkerhet,

- kostnader,

- utvecklingshastighet,

- abonnemang,

- support,

- och strategiska risker.

Executive Intelligence ska använda aggregerad data där det räcker.

20.144 INGA DIREKTA PRODUKTBESLUT FRÅN DASHBOARDMETRIK

Ett mätetal ska skapa:

- signal,

- analys,

- och eventuellt förslag.

Det ska inte direkt ändra produktens:

- pris,

- coachton,

- programlogik,

- eller säkerhet.

20.145 PLATTFORMSIGNALER

GainPilot kan skicka minimerade signaler till Executive Intelligence.

Exempel:

- onboarding completion declining,

- workout save incidents increasing,

- subscription conversion changing,

- eller AI cost above budget.

Signalen ska inte innehålla onödiga personuppgifter.

20.146 BESLUTSLOGG

Strategiska GainPilot-beslut ska dokumenteras.

Exempel:

- prioritera Android före iOS,

- använda hybridmodell för övningsanimationer,

- börja med styrketräning före bred multidomänlansering,

- eller pausa en kostfunktion.

Beslutet ska ha källa och ansvarig.

20.147 PRODUKT- OCH DOMÄNMANDAT

Atlas kan rekommendera produktförändringar.

Det är GainPilot-domänens ägare som ska bevilja mandat för:

- större strategiförändringar,

- affärsmodell,

- målgrupp,

- säkerhetsposition,

- och omfattande investeringar.

20.148 AGENTDRIVEN UTVECKLING

GainPilot ska stödja agentdriven produktutveckling.

Agenter kan hjälpa till med:

- audit,

- analys,

- kod,

- tester,

- dokumentation,

- migrationsplan,

- och review.

De ska arbeta inom en kontrollerad utvecklingsprocess.

20.149 UTVECKLINGSFLÖDE

Canonical utvecklingsflöde ska vara:

Observation

→ analys

→ förslag

→ godkänt scope

→ branch

→ implementation

→ tester

→ dokumentation

→ pull request

→ review

→ merge

→ deployment

→ uppföljning.

20.150 INGEN DIREKTÄNDRING I MAIN

Agenter får inte genomföra vanliga produktförändringar direkt i main.

Undantag för akuta incidenter ska ha:

- särskild process,

- dokumentation,

- eftergranskning,

- och minimal ändring.

20.151 ARBETSTRÄD

Parallellt agentarbete ska använda:

- separata branches,

- worktrees,

- eller motsvarande isolering.

En agent ska inte skriva över en annan agents orelaterade arbete.

20.152 REN ARBETSYTA

Före förändring ska agenten kontrollera:

- aktuell branch,

- repository,

- worktree,

- upstream,

- status,

- och orelaterade ändringar.

Orelaterade användarändringar ska inte stageas eller raderas.

20.153 SCOPEKONTROLL

En implementation ska endast ändra filer inom godkänt scope.

Om agenten upptäcker behov utanför scope ska den:

- dokumentera behovet,

- och begära nytt mandat.

20.154 TESTKRAV

Varje GainPilot-förändring ska ha proportionerliga tester.

Exempel:

- enhetstester,

- kontraktstester,

- integrationstester,

- säkerhetstester,

- användarflöden,

- och regressionsscenarier.

20.155 DOMÄNTESTER

Tränings- och kostlogik ska testas som domänlogik.

Det räcker inte att API-endpointen returnerar status 200.

Testet ska verifiera:

- rätt programfunktion,

- säker substitution,

- korrekt progressionsregel,

- och rätt användarscope.

20.156 CONTRACT TESTING

Kontrakt mellan GainPilot och Omnira ska testas.

Tester ska verifiera:

- schema,

- version,

- tenant,

- behörighet,

- idempotens,

- och felhantering.

20.157 POLICYTESTER

GainPilot ska ha tester som verifierar att:

- Arnold inte får förbjuden data,

- Atlas inte kringgår Hermes,

- agentauthority följs,

- och approvals krävs där de ska.

20.158 SECURITY TESTING

Säkerhetstester ska omfatta:

- tenantisolering,

- åtkomstkontroll,

- injection,

- secretläckage,

- felaktiga tokens,

- filuppladdning,

- och agentverktyg.

20.159 PRIVACY TESTING

Integritetstester ska verifiera:

- dataminimering,

- radering,

- export,

- retention,

- och att känslig data inte hamnar i loggar eller prompts.

20.160 COST TESTING

Agent- och modellflöden ska testas för kostnad.

Ett tekniskt korrekt workflow kan vara olämpligt om det:

- gör onödigt många modellkall,

- läser för stor kontext,

- eller genererar dyr media utan mandat.

20.161 PERFORMANCE TESTING

Viktiga flöden ska testas för:

- latency,

- concurrency,

- batterianvändning,

- offlinebeteende,

- och synkronisering.

Aktivt pass ska prioriteras framför bakgrundsanalys.

20.162 REVIEW

Pull requests ska granskas utifrån:

- funktion,

- arkitektur,

- säkerhet,

- domänkorrekthet,

- integritet,

- kostnad,

- och dokumentation.

En grön testsvit ersätter inte kvalificerad review.

20.163 MERGE

Merge ska ske först när:

- scope är uppfyllt,

- tester är godkända,

- kritiska kommentarer är lösta,

- och deploymentplan finns.

Agenten som skapade förändringen ska inte ensam godkänna högriskmerge.

20.164 POST-MERGE

Efter merge ska GainPilot kunna verifiera:

- deployment,

- migration,

- feature flag,

- observability,

- och faktisk produktfunktion.

Arbetet är inte färdigt enbart för att PR:n är mergad.

20.165 DOCUMENTATION DRIFT

När implementationen förändras ska relevant dokumentation uppdateras.

Det ska finnas skydd mot att:

- kod,

- kontrakt,

- policies,

- och canonical kunskap

driver isär.

20.166 GRAPHIFY OCH KODKUNSKAP

GainPilot kan använda kodgraf- och kunskapssystem för att minska behovet av att agenter läser hela repositoryt.

Sådana system ska:

- vara versionerade,

- kunna uppdateras,

- och inte betraktas som ofelbar källa.

Agenten ska verifiera kritiska påståenden mot faktisk kod.

20.167 KONTEXTBUDGET

Agenter ska använda kontext effektivt.

De ska prioritera:

- relevanta kontrakt,

- berörda moduler,

- aktuell branch,

- och testresultat.

De ska inte automatiskt läsa hela GainPilot- och Omnira-kodbasen för varje liten ändring.

20.168 KUNSKAPSGRAF

GainPilot kan representeras i Omniras Intelligence Graph.

Grafen kan innehålla:

- domäner,

- capabilities,

- agenter,

- workflows,

- tjänster,

- data,

- kontrakt,

- risker,

- beslut,

- och dokumentation.

Grafen ska inte ersätta koden eller databasen.

20.169 GRAFENS PROVENANCE

Varje betydelsefull grafrelation ska ha:

- källa,

- version,

- och uppdateringstid.

En gammal grafrelation får inte styra ny implementation utan verifiering.

20.170 DOMÄNHEALTH

Omnira ska kunna beräkna GainPilots domänhealth.

Health ska inte vara en ogenomskinlig poäng.

Den kan bestå av separata signaler för:

- availability,

- security,

- data integrity,

- workflow health,

- cost,

- user experience,

- och development status.

20.171 HEALTHSTATUS

GainPilot kan ha status som:

- healthy,

- degraded,

- at_risk,

- incident,

- maintenance,

- eller unknown.

Unknown ska vara ett legitimt tillstånd när observability saknas.

20.172 INGEN FALSK GRÖN STATUS

Systemet får inte visa healthy enbart för att servern svarar.

Domänhealth ska kunna påverkas av:

- trasig resultatsparning,

- felaktig agent,

- ökande säkerhetsfel,

- eller dataförlust.

20.173 SUPPORT

GainPilot ska ha en supportdomän eller tydlig supportfunktion.

Support ska kunna se:

- tekniska fel,

- användarens godkända ärendekontext,

- och relevant audit.

Support ska inte automatiskt få full coach- och hälsodata.

20.174 SUPPORTÅTKOMST

Supportåtkomst ska vara:

- tidsbegränsad,

- ärendebunden,

- loggad,

- och återkallelig.

Användaren ska kunna informeras om känslig åtkomst.

20.175 IMPERSONATION

Om support behöver se produktupplevelsen som användaren ska det ske genom säker impersonation eller preview.

Systemet ska:

- visa att supportläge är aktivt,

- blockera högriskåtgärder,

- och logga sessionen.

20.176 INTERN ADMINISTRATION

GainPilot ska ha ett separat adminlager.

Adminfunktioner kan omfatta:

- domänstatus,

- feature flags,

- integrationshealth,

- support,

- användarhantering,

- och incidentåtgärder.

Adminverktyg ska inte byggas in som dolda användarfunktioner.

20.177 ROLLBASERAD ÅTKOMST

Intern åtkomst ska baseras på roller och capabilities.

Exempel:

- support,

- developer,

- security,

- domain expert,

- product owner,

- och finance.

Ingen intern roll ska automatiskt få allt.

20.178 JUST-IN-TIME-ÅTKOMST

Känslig intern åtkomst bör där det är möjligt vara just-in-time.

Det innebär:

- explicit begäran,

- begränsad tid,

- tydligt syfte,

- och audit.

20.179 PRODUKTIONSÅTKOMST

Direkt produktionsåtkomst ska vara begränsad.

Vanliga utvecklingsuppgifter ska ske genom:

- verktyg,

- dashboards,

- migrationssystem,

- och kontrollerade workflows.

Manuella databasändringar ska undvikas.

20.180 DATAKORRIGERING

När data behöver korrigeras ska GainPilot använda:

- versionerad korrigeringsoperation,

- audit,

- användaridentitet,

- och konsekvensanalys.

Support ska inte tyst skriva om träningshistorik.

20.181 USER SELF-SERVICE

Användaren ska själv kunna hantera så mycket som möjligt.

Exempel:

- korrigera träningsresultat,

- exportera data,

- ändra minnen,

- återkalla integration,

- och radera konto.

Det minskar behovet av intern åtkomst.

20.182 INTEGRATIONSKATALOG

Alla GainPilot-integrationer ska registreras.

Katalogen ska visa:

- leverantör,

- datatyper,

- riktning,

- scope,

- tokenstatus,

- risk,

- användning,

- och ägare.

20.183 INTEGRATIONSSTATUS

En integration kan ha status som:

- configured,

- active,

- degraded,

- paused,

- revoked,

- expired,

- eller failed.

Status ska inte döljas för användaren när den påverkar datan.

20.184 READ OCH WRITE

GainPilot ska skilja mellan:

- read access,

- write access,

- sync access,

- och action access.

Att få läsa träningsdata innebär inte rätt att skriva tillbaka eller genomföra åtgärder.

20.185 INTEGRATIONSAUTONOMI

En integration ska inte få större autonomi än:

- användarens mandat,

- GainPilot-policyn,

- och Omniras systemgräns.

Extern leverantör får inte diktera intern agentbehörighet.

20.186 WEBHOOKS

Webhooks ska:

- autentiseras,

- verifieras,

- dedupliceras,

- och valideras.

Extern payload ska behandlas som osäker input.

20.187 API-KONTRAKT

API:er ska vara:

- versionerade,

- dokumenterade,

- autentiserade,

- och tenantmedvetna.

API-användare ska få minsta nödvändiga scope.

20.188 RATE LIMITING

GainPilot ska använda rate limiting för:

- API,

- autentisering,

- media,

- AI-funktioner,

- och känsliga operationer.

Begränsningen ska skydda både säkerhet och kostnad.

20.189 EXTERN AI

Externa AI-leverantörer ska behandlas som integrationer.

GainPilot ska kontrollera:

- vilken data som skickas,

- retention,

- region,

- leverantörspolicy,

- kostnad,

- och fallback.

20.190 MODELLROUTING

Omnira kan hjälpa GainPilot välja modell efter uppgift.

Exempel:

- liten modell för klassificering,

- större modell för komplex analys,

- specialmodell för vision,

- och lokalt system för känslig behandling.

Modellval ska följa dataklassificering.

20.191 INGEN MODELL FÅR ALL DATA

GainPilot ska inte skicka hela användarprofilen till en modell bara för att uppgiften blir enklare att formulera.

Hermes ska skapa minimerade uppgiftspaket.

20.192 MODELLREGISTER

Alla modeller som används av GainPilot ska registreras.

Registret ska omfatta:

- modellidentitet,

- leverantör,

- version,

- användningsområde,

- dataklasser,

- kostnad,

- teststatus,

- och fallback.

20.193 MODELLBYTE

Ett modellbyte ska behandlas som produktförändring.

Det ska testas för:

- kvalitet,

- säkerhet,

- ton,

- kostnad,

- latency,

- och regressionsrisk.

20.194 LOKALA MODELLER

Lokala modeller kan användas för:

- integritetskänsliga uppgifter,

- offlinefunktioner,

- kostnadskontroll,

- och snabb respons.

Lokal körning ska inte automatiskt betraktas som säkrare om modellen eller enheten är oskyddad.

20.195 DATARESIDENCY

GainPilot ska kunna stödja krav på var data lagras och behandlas.

Det kan påverka:

- tenant,

- region,

- leverantör,

- backup,

- och modellrouting.

20.196 BACKUP

GainPilot-data ska säkerhetskopieras enligt dataklass.

Backup ska vara:

- krypterad,

- verifierad,

- återställningstestad,

- och kopplad till retention.

20.197 RADERING OCH BACKUP

Raderad data kan finnas kvar i backup under begränsad tid.

Detta ska vara:

- dokumenterat,

- tidsbegränsat,

- och skyddat från vanlig återanvändning.

20.198 DISASTER RECOVERY

GainPilot ska ha disaster recovery-plan.

Planen ska omfatta:

- data,

- identitet,

- secrets,

- tjänster,

- köer,

- media,

- och integrationsstatus.

Återställning ska testas.

20.199 RECOVERY POINT OCH RECOVERY TIME

Kritiska datatyper ska ha definierade mål för:

- acceptabel dataförlust,

- och återställningstid.

Ett aktivt träningsresultat kan ha andra krav än anonym produktanalys.

20.200 DATAINTEGRITET

GainPilot ska kunna verifiera:

- att data inte förvanskats,

- att relationer är giltiga,

- och att imports eller migrationer inte skapat inkonsekvens.

Checksummor och integritetsreferenser kan användas där det är relevant.

20.201 EXIT OCH PORTABILITET

GainPilot ska kunna lämna Omnira eller flyttas till annan driftmiljö utan att användardata blir obrukbar.

Domänen ska inte vara beroende av odokumenterade interna genvägar.

20.202 LÖS KOPPLING

GainPilot ska vara integrerat men löst kopplat.

Det innebär:

- tydliga kontrakt,

- minimerade direkta beroenden,

- och möjlighet att ersätta interna komponenter.

Lös koppling får inte betyda otydligt ansvar.

20.203 OMNIRA-FÖRDELEN

GainPilot ska dra nytta av Omnira genom:

- gemensam identitet,

- Atlas,

- Hermes,

- agentgovernance,

- approvals,

- Executive Intelligence,

- integrationsregister,

- och central säkerhet.

Detta ska minska duplicering och öka kvalitet.

20.204 GAINPILOT FÅR INTE FÖRLORA PRODUKTFOKUS

Integrationen med Omnira får inte göra GainPilot till ett internt arkitekturprojekt som saknar en enkel användarupplevelse.

För användaren ska produkten fortfarande kännas som:

- en sammanhängande coach,

- ett tydligt träningsprogram,

- ett fungerande koststöd,

- och en begriplig historik.

Omniras komplexitet ska huvudsakligen ligga bakom produkten.

20.205 ARNOLD SKA VARA DEN SAMMANHÄNGANDE YTAN

Användaren ska normalt inte behöva förstå:

- Atlas,

- Hermes,

- workflowmotor,

- eventbus,

- eller authority levels.

Arnold ska översätta systemets intelligens och styrning till tydliga val.

20.206 TRANSPARENS VID BEHOV

Användaren ska ändå kunna se:

- varför en åtgärd föreslås,

- vilken data som användes,

- vilken agent som agerade,

- och vilket mandat som gällde.

Enkel upplevelse får inte innebära ogenomskinlighet.

20.207 DOMÄNSPECIFIK PRODUKTIDENTITET

GainPilot ska ha egen:

- visuell identitet,

- produktton,

- coachpersonlighet,

- onboarding,

- och värdeproposition.

Omnira ska vara plattformen bakom.

GainPilot ska inte behöva se ut som ett generellt adminsystem.

20.208 MULTITENANT FRAMTID

När GainPilot öppnas för fler användare ska samma arkitektur kunna stödja:

- privatpersoner,

- coacher,

- gym,

- företag,

- och framtida partners.

Varje modell ska ha separat:

- ägande,

- behörighet,

- och datadelning.

20.209 B2C-TENANT

En privat användare kan ha:

- egen profil,

- eget GainPilot-minne,

- egna program,

- och egna integrationer.

Användaren ska vara sin egen primära dataägare.

20.210 COACH-TENANT

En coachorganisation kan ha:

- coacher,

- klienter,

- programmallar,

- och organisationspolicy.

Klientens privata data ska inte automatiskt ägas av coachorganisationen.

20.211 GYM-TENANT

Ett gym kan ha:

- utrustningsprofil,

- klasser,

- coacher,

- och gemensamma program.

Gymmet ska inte få full tillgång till medlemmarnas privata GainPilot-profiler.

20.212 FÖRETAGSTENANT

En arbetsgivare kan erbjuda GainPilot som förmån.

Arbetsgivaren ska normalt endast få:

- aggregerad,

- minimerad,

- och integritetsskyddad information.

Individens vikt, kost och träningshistorik ska inte delas.

20.213 TENANTPOLICY

Varje tenant kan ha policy för:

- datalagring,

- coachåtkomst,

- integrationer,

- region,

- och tillåtna funktioner.

Tenantpolicy får inte ta bort grundläggande användarskydd.

20.214 POLICYARV

GainPilot ska kunna använda policyarv.

Effektiv policy kan komma från:

- Omnira global,

- tenant,

- GainPilot-domän,

- organisation,

- användare,

- och sessionsscope.

Den mest restriktiva tillämpliga regeln ska normalt vinna.

20.215 POLICYKONFLIKT

När policies står i konflikt ska systemet:

- identifiera konflikten,

- välja säker standard,

- och förklara varför åtgärden stoppades.

Agenten får inte själv välja den mest tillåtande tolkningen.

20.216 COMPLIANCE

GainPilot ska kunna mappa sina kontroller mot relevanta:

- dataskyddskrav,

- säkerhetskrav,

- konsumentkrav,

- och framtida branschstandarder.

Compliance ska inte reduceras till dokumentation utan faktisk teknisk kontroll.

20.217 JURIDISK OCH PRODUKTMÄSSIG GRÄNS

GainPilot ska tydligt skilja mellan:

- vad lagen kräver,

- vad produkten lovar,

- och vad Omniras interna governance kräver.

Intern policy får vara striktare än minimikraven.

20.218 DATA PROCESSING REGISTER

GainPilot ska kunna dokumentera:

- vilka personuppgifter som behandlas,

- varför,

- var,

- av vem,

- hur länge,

- och med vilka leverantörer.

Registret ska hållas uppdaterat.

20.219 LEVERANTÖRSRISK

Externa leverantörer ska bedömas för:

- säkerhet,

- integritet,

- stabilitet,

- kostnad,

- lock-in,

- och exitmöjlighet.

En populär leverantör ska inte automatiskt godkännas.

20.220 SUPPLY CHAIN

GainPilot ska skydda sin mjukvaruförsörjningskedja.

Det omfattar:

- dependencies,

- actions,

- containers,

- packages,

- modeller,

- datafiler,

- och byggsystem.

20.221 DEPENDENCY GOVERNANCE

Nya dependencies ska bedömas för:

- behov,

- licens,

- underhåll,

- säkerhet,

- storlek,

- och alternativ.

Agenter ska inte lägga till paket utan motivering.

20.222 LICENSER

GainPilot ska kunna följa licenser för:

- kod,

- övningsmedia,

- recept,

- träningsprogram,

- modeller,

- och externa dataset.

Licensstatus ska vara spårbar.

20.223 OPEN SOURCE

Open source kan användas när:

- licensen är kompatibel,

- koden granskas,

- underhållet är rimligt,

- och säkerhetsrisken accepteras.

Open source betyder inte riskfritt eller kostnadsfritt.

20.224 BYGG ELLER KÖP

GainPilot ska fatta build-versus-buy-beslut utifrån:

- strategiskt värde,

- kontroll,

- kostnad,

- tid,

- säkerhet,

- och leverantörsberoende.

Domänens kärnintelligens bör inte utan eftertanke låsas till en enda extern leverantör.

20.225 DOMÄNENS KÄRNA

Följande är kandidater för GainPilots strategiska kärna:

- användarmodell,

- träningsintelligens,

- kostintelligens,

- övningsgraf,

- substitutionsmotor,

- progressionsmodell,

- och Arnoldrelationen.

Infrastruktur runt kärnan kan oftare köpas eller integreras.

20.226 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilot som Omnira-domän.

**Kontrakt GP-357 — GainPilot är en fullvärdig Omnira-domän**

GainPilot ska ha egen produktlogik, datamodell, riskmodell, agenter och verksamhetsstyrning samtidigt som gemensamma Omnira-förmågor återanvänds.

**Kontrakt GP-358 — Omnira är kontrollplan, inte domänersättning**

Omnira ska tillhandahålla styrning, identitet, minnesgränser, approvals och agentsamordning utan att skriva över GainPilots specialistlogik.

**Kontrakt GP-359 — Explicit bounded context**

GainPilot-begrepp, data och beslut ska ha en tydlig domängräns och får inte blandas med andra projekt genom generella otypade objekt.

**Kontrakt GP-360 — Tenant- och användarisolering**

All GainPilot-data, alla minnen, filer, index, köer, loggar och agentkontexter ska vara tenant- och användarscopeade.

**Kontrakt GP-361 — Capabilitybaserad integration**

Omnira, Atlas, Arnold och andra agenter ska agera genom identifierade GainPilot-capabilities med explicit risk, behörighet och approval.

**Kontrakt GP-362 — Versionerade domänkontrakt**

Kommandon, queries, events, signals, approvals och data envelopes mellan GainPilot och Omnira ska vara versionerade och tenantmedvetna.

**Kontrakt GP-363 — Minimerad domänöverskridande data**

Data som passerar GainPilots gräns ska vara syftesbunden, klassificerad och minimerad, med säkra referenser i stället för fullständiga kopior där möjligt.

**Kontrakt GP-364 — Hermes är obligatorisk minnesgräns**

Atlas, Arnold, andra domäner och externa system får inte läsa eller skriva GainPilot-minne utanför Hermes godkända scope.

**Kontrakt GP-365 — Central intelligens utan central genväg**

Atlas får samordna och analysera GainPilot men får inte kringgå domänregler, approvals, säkerhetskontroller eller användarens mandat.

**Kontrakt GP-366 — Delegering skapar inte behörighet**

Den effektiva behörigheten ska alltid begränsas av agentens, domänens, tenantens, användarens och systemets mest restriktiva tillämpliga policy.

**Kontrakt GP-367 — Authority ska beviljas per capability**

Autonomi får inte ges som ett globalt agentprivilegium utan ska scopeas till funktion, projekt, datatyp, integration, användare och tidsperiod.

**Kontrakt GP-368 — Förtjänad bounded autonomy**

Agentautonomi ska höjas genom verifierad kvalitet och kunna löpa ut, pausas eller återkallas efter incident, modellbyte eller policyförändring.

**Kontrakt GP-369 — Degraderad självständighet**

GainPilots kritiska användarflöden ska kunna fortsätta säkert när Atlas, externa modeller eller mjuka Omnira-beroenden är otillgängliga.

**Kontrakt GP-370 — Idempotenta och återhämtningsbara workflows**

Betydelsefulla GainPilot-workflows ska hantera retries, dubbletter, unknown outcome, compensation och verifierad återhämtning.

**Kontrakt GP-371 — Observerbar domän**

GainPilots tjänster, agenter, workflows, kostnader, integrationer, beslut och säkerhetssignaler ska vara observerbara utan att känsliga payloads kopieras i onödan.

**Kontrakt GP-372 — Domänspecifikt nödstopp**

GainPilot ska kunna stoppa en agent, capability, integration eller workflow utan att hela Omnira eller användarens lokala grundfunktioner måste stängas ned.

**Kontrakt GP-373 — Secrets ska förbli i valv**

Lösenord, tokens, API-nycklar och certifikat får inte lagras i kod, prompts, dokumentation, användarminnen eller agentkontext.

**Kontrakt GP-374 — Miljö- och produktionsisolering**

Utveckling, test, preview, staging och produktion ska vara tydligt separerade, och produktionsdata får inte återanvändas okontrollerat.

**Kontrakt GP-375 — Canonical kunskap ska vara versionsstyrd**

Godkänd GainPilot-arkitektur ska integreras som spårbar kunskap, medan körbara policies, schema och tester ska kompileras till tekniskt validerbara format.

**Kontrakt GP-376 — Ingen tyst avvikelse från canonical vision**

Implementation som avviker från godkända GainPilot-kontrakt ska dokumenteras, konsekvensbedömas och godkännas.

**Kontrakt GP-377 — Agentdriven utveckling kräver isolerat arbetsflöde**

Alla normala förändringar ska ske genom godkänt scope, ren arbetsyta, separat branch eller worktree, tester, pull request och review.

**Kontrakt GP-378 — Multitenant utan arbetsgivarinsyn**

Framtida coach-, gym- och företagstenants får endast tillgång till explicit delad eller aggregerad data och aldrig automatisk full åtkomst till individens privata GainPilot-profil.

**Kontrakt GP-379 — Portabel och lös koppling**

GainPilot ska kunna exportera användardata, ersätta leverantörer och i princip flyttas från Omnira utan att domänhistoriken blir obrukbar.

**Kontrakt GP-380 — Produktupplevelsen före plattformskomplexiteten**

Omniras interna arkitektur ska ge GainPilot större intelligens och säkerhet utan att användaren tvingas förstå eller hantera plattformens tekniska komplexitet.

20.227 ANTI-PRINCIPER

GainPilot ska inte:

- utvecklas som en isolerad app utan Omnira-kontrakt,

- behandlas som en enkel feature under Atlas,

- låta Atlas skriva tränings- eller kostlogik direkt,

- duplicera Omniras identitets-, approval- eller secretssystem utan behov,

- använda en enda global databasåtkomst för alla projekt,

- anta att en användare eller tenant alltid kommer vara den enda,

- blanda intern produktdata med kundernas privata profiler,

- låta interna agenter läsa full kunddata som standard,

- dela data mellan projekt enbart för att de finns i samma Omnira-installation,

- använda otypade generella objekt över domängränser,

- göra externa datamodeller direkt canonical,

- låta andra domäner skriva direkt i GainPilots databas,

- exponera fulla känsliga payloads i events,

- kopiera data när säker referens räcker,

- använda tränings- eller kostdata för nytt syfte utan separat grund,

- göra privata användaruppgifter till canonical produktkunskap,

- ge Atlas obegränsad minnesåtkomst,

- låta Arnold fungera som global superagent,

- ge en agent global authority för hela GainPilot,

- tolka delegation från Atlas som ny behörighet,

- bevilja permanent autonomi utan omprövning,

- använda otydliga approvaltexter,

- låta agenter kringgå budget genom många små anrop,

- starta utvecklingsworkflows i hibernation,

- anta att active mode innebär obegränsad aktivitet,

- ha dolda cronjobb,

- använda retries för permanenta fel eller användaravslag,

- anta framgång efter unknown outcome,

- registrera samma träningsresultat flera gånger,

- förlora event efter lyckad databasändring,

- göra Atlas till single point of failure,

- kräva nätverk för varje aktiv träningsfunktion,

- kasta bort offlinehistorik,

- använda fallback som är farligare än originalfunktionen,

- visa healthy bara för att servern svarar,

- logga full coachdialog eller kroppsinformation utan behov,

- använda debugloggar som enda auditspår,

- stänga ned hela Omnira för ett lokalt GainPilot-fel,

- återstarta högriskfunktion automatiskt efter incident,

- lagra tokens i repositoryt,

- återanvända tokens mellan projekt,

- använda produktionsdata fritt i utveckling,

- låta preview-miljö kontakta verkliga användare,

- göra otestade breaking schemaändringar,

- lämna permanenta feature flags utan ägare,

- ta bort kontraktsversioner utan migrationsväg,

- rulla tillbaka data blint när framåtriktad reparation krävs,

- låta samma agent ensam föreslå, implementera och godkänna kritisk förändring,

- ändra main direkt för vanlig produktutveckling,

- stagea eller radera orelaterade användarändringar,

- utöka implementationens scope tyst,

- betrakta status 200 som tillräckligt domäntest,

- hoppa över kostnads- och integritetstester,

- betrakta mergad PR som färdig produktion,

- låta kod och canonical dokumentation driva isär,

- behandla kodgraf eller AI-sammanfattning som ofelbar kodsanning,

- läsa hela repositoryt utan behov för varje agentuppgift,

- använda en kunskapsgraf utan provenance,

- ge support full dataåtkomst,

- tillåta ologgad supportimpersonation,

- göra manuella produktionsändringar till normal arbetsmetod,

- tyst korrigera användarhistorik,

- ge externa integrationer write scope när read räcker,

- lita på webhookpayload utan verifiering,

- skicka hela användarprofilen till externa AI-modeller,

- byta modell utan regressionstest,

- anta att lokal modell automatiskt är säker,

- skapa backup utan återställningstest,

- låta raderad backupdata återgå till aktiv produktdata,

- bygga odokumenterad hård lock-in till Omnira,

- låta plattformsarkitekturen dominera användarupplevelsen,

- exponera Atlas, Hermes och workflowmotor som onödiga användarkrav,

- ge arbetsgivare individuell tränings-, vikt- eller kostdata,

- låta tenantpolicy ta bort grundläggande integritet,

- välja den mest tillåtande policyn vid konflikt,

- behandla compliance som enbart dokumentation,

- lägga till dependencies utan licens- och säkerhetsbedömning,

- eller utveckla GainPilot utanför branch-, test-, review- och governanceprocessen.

20.228 KANONISKA BESLUT FRÅN KAPITEL 20

Följande beslut etableras:

1. GainPilot ska vara en fullvärdig produktdomän inom Omnira.

2. Omnira ska fungera som GainPilots kontrollplan.

3. GainPilot ska äga sin tränings-, kost- och coachlogik.

4. Omnira ska tillhandahålla gemensam identitet, säkerhet, approvals och agentgovernance.

5. GainPilot ska ha stabil domänidentitet.

6. GainPilot ska ha versionerad domändefinition.

7. Domänen ska kunna ha flera lifecycle-statusar.

8. Hibernation ska bevara data och säkerhet.

9. Återaktivering ska vara kontrollerad.

10. GainPilot ska registreras i Omniras canonical domänmodell.

11. Arkitekturen ska vara tenantmedveten från början.

12. Tenant och projekt ska hållas som separata begrepp.

13. Intern produktverksamhet ska skiljas från kundprodukten.

14. Kunddata ska isoleras genom hela teknikstacken.

15. GainPilots domängräns ska vara explicit.

16. GainPilot ska vara ett bounded context.

17. Domänen ska ha ett gemensamt canonical språk.

18. Domänbegrepp ska översättas genom kontrakt.

19. Anti-corruption-lager ska användas mot andra system.

20. GainPilot ska beskriva funktioner som capabilities.

21. Capabilities ska vara oberoende av specifika UI-knappar.

22. Varje capability ska ha ägare.

23. GainPilot får delas i domäntjänster efter verkliga ansvar.

24. Modulär monolit ska vara tillåten.

25. Mikrotjänster ska kräva verklig motivering.

26. Alla domänkontrakt ska versioneras.

27. Kommandon ska ha tydlig mottagare.

28. Queries ska vara tenant- och scopekontrollerade.

29. Events ska beskriva inträffade fakta.

30. Signals ska inte automatiskt bli åtgärder.

31. Approval requests ska beskriva effekt, risk och alternativ.

32. Eventdata ska minimeras.

33. Säkra referenser ska prioriteras framför fulla kopior.

34. Domängränsdata ska använda canonical envelopes.

35. GainPilot-data ska klassificeras.

36. Hälsorelaterad produktdata ska ha förhöjt skydd.

37. Dataåtkomst ska ha syfte.

38. Nytt datasyfte ska kräva separat grund.

39. Användaren ska kontrollera sin personliga data.

40. Produktkunskap och användardata ska hållas åtskilda.

41. GainPilot ska ha en egen minnesdomän.

42. Endast godkända uppgifter ska finnas i delad Omnira-profil.

43. Känslig tränings- och kostdata ska normalt förbli GainPilot-privat.

44. Hermes ska vara gateway för minnesdelning.

45. Minnesläsning ska vara aktörs-, syftes- och scopespecificerad.

46. Minnesskrivning ska följa kontrollerat flöde.

47. Atlas ska kunna göra godkänd tvärdomänanalys.

48. Tvärdomänanalys ska använda reducerade signaler.

49. Domänrelationer ska ha egna kontrakt.

50. Ingen implicit projektdelning ska tillåtas.

51. Omnira ska ha en domänkatalog.

52. GainPilot ska ha en tjänstekatalog.

53. GainPilot ska ha ett agentregister.

54. Arnold ska vara GainPilot-domänagent.

55. Atlas ska vara central intelligens och samordnare.

56. Atlas får inte användas som policygenväg.

57. Manageragenter ska samordna men inte automatiskt utföra specialistarbete.

58. Agentdelegering ska innehålla tydligt scope.

59. Delegering ska inte skapa behörighet.

60. GainPilot ska använda Omniras authority levels.

61. Authority ska ges per capability.

62. GainPilot ska använda earned bounded autonomy.

63. Autonomi ska kunna löpa ut och återkallas.

64. Omniras approvalmotor ska användas.

65. Approval ska vara proportionerligt mot risk.

66. Approval ska kunna vara tids- och sessionsbegränsat.

67. Approvaltext ska vara begriplig.

68. GainPilot ska ha egen budgetmodell.

69. Kostnader ska kunna tillskrivas agent och workflow.

70. Kostnadsgränser ska kunna stoppa aktivitet.

71. Omnira ska kunna prioritera resurser mellan projekt.

72. Active mode ska vara definierat.

73. Observer mode ska begränsa åtgärder.

74. Hibernate mode ska minimera aktivitet.

75. Operating mode ska kunna skilja mellan delsystem.

76. GainPilot-workflows ska registreras.

77. Workflows ska ha strukturerade tillstånd.

78. Workflows ska ha ansvariga ägare.

79. Användarsession och backend-workflow ska hållas isär.

80. Betydelsefulla workflows ska vara idempotenta.

81. Unknown outcome ska verifieras.

82. Retries ska vara felklassificerade.

83. Compensation ska användas där exakt rollback inte är möjlig.

84. Lokala transaktioner ska prioriteras när de räcker.

85. Outbox ska användas vid kritisk eventpublicering.

86. Inbox eller deduplicering ska användas hos mottagare.

87. Schemaläggning ska följa tenant, tidszon och budget.

88. Villkor ska verifieras vid workflowexekvering.

89. Dolda bakgrundsjobb ska förbjudas.

90. GainPilot ska deklarera beroenden.

91. Hårda och mjuka beroenden ska skiljas.

92. Domänen ska kunna fungera i degraderat läge.

93. Aktiva pass ska ha offline-first-egenskaper.

94. Atlas får inte vara single point of failure.

95. Circuit breakers ska skydda externa beroenden.

96. Distribuerade anrop ska ha timeouts.

97. Fallback ska vara definierad och säker.

98. Återhämtning ska bevara offlinehistorik.

99. Kritiska flöden ska ha SLO.

100. GainPilot ska definiera vilka flöden som är kritiska.

101. Domänen ska vara observerbar.

102. GainPilot ska ha domänspecifika driftmått.

103. Loggning ska vara strukturerad och minimerad.

104. Distribuerade flöden ska kunna spåras.

105. Correlation identity ska användas.

106. Betydelsefulla beslut ska auditeras.

107. Audit ska skiljas från debuglogg.

108. Säkerhetshändelser ska kunna eskaleras centralt.

109. GainPilot ska ha domänspecifik incidentmodell.

110. Lokal och central incidentledning ska samverka.

111. Nödstopp ska finnas på flera nivåer.

112. Avstängning ska bevara säkert tillstånd.

113. Återstart ska kräva verifiering.

114. Secrets ska lagras i godkänt valv.

115. Secrets ska scopeas per projekt och integration.

116. Tokens ska kunna roteras och återkallas.

117. Miljöer ska vara separerade.

118. Testdata ska vara syntetisk eller skyddad.

119. Preview-miljöer ska vara isolerade.

120. Deployments ska vara reproducerbara.

121. Feature flags ska ha ägare och slutdatum.

122. Permanenta övergivna flags ska avvecklas.

123. Migrationer ska vara versionerade och återstartbara.

124. Bakåtkompatibilitet ska planeras.

125. Schemaändringar ska klassificeras.

126. Deprecation ska ha migrationsväg.

127. Rollback ska vara möjlig där det är säkert.

128. Releases ska riskklassificeras.

129. Högriskändringar ska kunna kräva fyraögonsprincip.

130. Repositoryval får inte försvaga governance.

131. GainPilot ska ha tydlig mappstruktur.

132. Canonical bokkunskap ska senare integreras i repositoryt.

133. Dokumentation ska klassificeras efter status.

134. Boken ska inte ensam vara körbar policy.

135. Canonical innehåll ska kunna kompileras till tekniska artefakter.

136. Architecture decision records ska dokumentera implementationstolkningar.

137. Avvikelser från canonical vision ska vara explicita.

138. Roadmapen ska koppla mål till capabilities och stages.

139. Implementation ska ske i definierade stages.

140. Stage 1 ska vara liten och användbar.

141. Stage 1 ska ändå använda rätt Omnira-grund.

142. Leverans ska vara progressiv.

143. Grundaren kan vara första interna användare.

144. Dogfooding ska användas utan att generalisera personliga preferenser.

145. Produktanalys ska skilja produkt-, användar- och affärsresultat.

146. Executive Intelligence ska kunna följa GainPilot.

147. Dashboardmetrik ska inte direkt ändra produkten.

148. GainPilot ska skicka minimerade plattformssignaler.

149. Strategiska beslut ska dokumenteras.

150. Atlas ska rekommendera men inte ensamt bevilja strategiskt mandat.

151. GainPilot ska stödja agentdriven utveckling.

152. Utvecklingsflödet ska vara canonical.

153. Vanliga förändringar får inte ske direkt i main.

154. Parallellt arbete ska isoleras.

155. Arbetsytan ska kontrolleras före ändring.

156. Orelaterade ändringar ska skyddas.

157. Scope ska följas.

158. Förändringar ska ha proportionerliga tester.

159. Domänlogik ska testas som domänlogik.

160. Omnira-kontrakt ska kontraktstestas.

161. Agent- och datapolicies ska testas.

162. Säkerhet och integritet ska testas.

163. Kostnad ska testas.

164. Kritiska flöden ska prestandatestas.

165. Pull requests ska kvalificerat granskas.

166. Merge ska kräva uppfyllda villkor.

167. Post-merge-verifiering ska ske.

168. Dokumentationsdrift ska motverkas.

169. Kodgraf kan användas som stöd.

170. Kritiska kodpåståenden ska verifieras mot faktisk kod.

171. Agentkontext ska budgeteras.

172. GainPilot ska kunna representeras i Intelligence Graph.

173. Grafrelationer ska ha provenance.

174. GainPilot ska ha domänhealth.

175. Unknown ska vara giltig healthstatus.

176. Falsk grön status ska förhindras.

177. GainPilot ska ha supportfunktion.

178. Supportåtkomst ska vara tids- och ärendebunden.

179. Impersonation ska vara säker och auditerad.

180. Adminfunktioner ska vara separerade.

181. Intern åtkomst ska vara capabilitybaserad.

182. Känslig åtkomst bör vara just-in-time.

183. Direkt produktionsåtkomst ska begränsas.

184. Datakorrigering ska vara versionerad.

185. User self-service ska prioriteras.

186. Integrationer ska registreras.

187. Integrationsstatus ska vara synlig.

188. Read-, write-, sync- och action-scope ska skiljas.

189. Integrationer ska följa GainPilots autonomigränser.

190. Webhooks ska verifieras.

191. API:er ska vara versionerade och tenantmedvetna.

192. Rate limiting ska användas.

193. Externa AI-modeller ska behandlas som leverantörsintegrationer.

194. Modellrouting ska följa uppgift och dataklass.

195. Ingen modell ska få all användardata.

196. GainPilot ska ha modellregister.

197. Modellbyte ska testas som produktförändring.

198. Lokala modeller ska kunna användas.

199. Lokal körning ska fortfarande säkerhetsgranskas.

200. Dataresidency ska kunna stödjas.

201. Backup ska vara krypterad och återställningstestad.

202. Backupretention efter radering ska vara begränsad.

203. Disaster recovery ska dokumenteras och testas.

204. Kritiska data ska ha recovery-mål.

205. Dataintegritet ska kunna verifieras.

206. Användardata ska vara portabel.

207. GainPilot ska vara löst kopplat till Omnira.

208. Omnira ska ge verklig plattformsfördel.

209. GainPilot ska behålla produktfokus.

210. Arnold ska vara den sammanhängande användarytan.

211. Systemets beslut ska kunna förklaras.

212. GainPilot ska ha egen produktidentitet.

213. Arkitekturen ska stödja framtida multitenancy.

214. Privatpersoner ska kontrollera sina data.

215. Coacher ska endast få explicit klientdata.

216. Gym ska inte få full medlemsprofil.

217. Arbetsgivare ska inte få individuell tränings- eller hälsodata.

218. Tenantpolicy ska vara scopead.

219. Policyarv ska använda restriktiv effektiv policy.

220. Policykonflikter ska stoppas säkert.

221. Compliance ska motsvaras av tekniska kontroller.

222. Databehandling ska dokumenteras.

223. Leverantörer ska riskbedömas.

224. Mjukvaruförsörjningskedjan ska skyddas.

225. Dependencies ska kräva motivering.

226. Licenser ska följas.

227. Open source ska granskas.

228. Build-versus-buy ska vara strategiskt beslut.

229. GainPilots kärnintelligens ska identifieras och skyddas.

230. GainPilot ska fungera som en självständig men Omnira-styrd produktdomän.

20.229 IMPLEMENTERINGSORDNING

GainPilot som Omnira-domän ska implementeras stegvis.

Fas 1 — Domänregistrering

Implementera:

- domain_identity,

- ägare,

- status,

- operating mode,

- version,

- tenant,

- och governance owner.

Fas 2 — Domängräns

Definiera:

- GainPilots bounded context,

- ägda datatyper,

- externa beroenden,

- och förbjudna direktåtkomster.

Fas 3 — Capabilityregister

Implementera:

- capability identity,

- ansvarig tjänst,

- riskklass,

- tillåtna aktörer,

- authority,

- och approvalkrav.

Fas 4 — Tenant- och användarscope

Implementera:

- tenant identity,

- user identity,

- project identity,

- row-level isolation,

- filscope,

- cache- och indexscope,

- och agentkontext.

Fas 5 — Canonical kontrakt

Implementera:

- commands,

- queries,

- events,

- signals,

- approval requests,

- och data envelopes.

Fas 6 — Hermes-gräns

Implementera:

- GainPilot-minnesdomän,

- purpose-bound reads,

- kontrollerade writes,

- delad profil,

- och tvärdomänpaket.

Fas 7 — Arnoldregistrering

Implementera:

- Arnold identity,

- capabilities,

- förbjudna åtgärder,

- memory scope,

- model registry,

- och authority level.

Fas 8 — Atlasintegration

Implementera:

- domänöversikt,

- minimerade signaler,

- analysförfrågningar,

- rekommendationer,

- och förbud mot direkt domänskrivning.

Fas 9 — Approvalmotor

Implementera:

- åtgärdsbeskrivning,

- risk,

- effekt,

- kostnad,

- alternativ,

- giltighet,

- och återkallande.

Fas 10 — Operating modes

Implementera:

- active,

- observer,

- hibernate,

- degraded,

- och subsystem-specific modes.

Fas 11 — Workflowregister

Implementera:

- workflow identity,

- version,

- status,

- ägare,

- approvalpunkter,

- retries,

- och stoppvillkor.

Fas 12 — Idempotens och återhämtning

Implementera:

- idempotency identities,

- outbox,

- inbox,

- unknown outcome,

- retry policy,

- compensation,

- och verifierad recovery.

Fas 13 — Offline- och degraderat läge

Implementera:

- lokal passdata,

- timer,

- resultatkö,

- fallback,

- beroendestatus,

- och konfliktlösning.

Fas 14 — Observability

Implementera:

- metrics,

- logs,

- traces,

- correlation identities,

- workflowstatus,

- agentbeslut,

- och kostnader.

Fas 15 — Audit och incidenter

Implementera:

- audit events,

- incidentklassificering,

- central eskalering,

- capabilitystopp,

- domännödstopp,

- och återstartsprocess.

Fas 16 — Secrets och integrationer

Implementera:

- valv,

- projektscope,

- tokenrotation,

- integrationsregister,

- webhookverifiering,

- och återkallande.

Fas 17 — Miljöer och deployment

Implementera:

- development,

- test,

- preview,

- staging,

- production,

- reproducerbara builds,

- och deploymentmetadata.

Fas 18 — Schema och migrationer

Implementera:

- schemaversioner,

- migrationsstatus,

- bakåtkompatibilitet,

- deprecation,

- och reparationsflöden.

Fas 19 — Repository-governance

Implementera:

- tydlig GainPilot-struktur,

- branchpolicy,

- worktrees,

- scopekontroll,

- PR-mallar,

- och reviewkrav.

Fas 20 — Canonical knowledge integration

Efter godkänd bok:

- integrera canonical edition,

- skapa manifest,

- versionsmärk kontrakt,

- skapa ADR-länkar,

- och kompilera relevanta policy- och testartefakter.

Fas 21 — Stage 1-grund

Implementera en begränsad men korrekt kärna:

- onboarding,

- profil,

- program,

- aktivt pass,

- resultat,

- Arnold,

- Hermes,

- approval,

- och audit.

Fas 22 — Executive Intelligence

Implementera:

- domänstatus,

- kostnad,

- utvecklingsstatus,

- produktsignaler,

- risker,

- och strategiska rekommendationer.

Fas 23 — Support och administration

Implementera:

- supportärenden,

- tidsbegränsad åtkomst,

- säker impersonation,

- adminroller,

- och user self-service.

Fas 24 — Modell- och leverantörsregister

Implementera:

- modellidentitet,

- användningsområde,

- dataklass,

- kostnad,

- fallback,

- leverantörsrisk,

- och exitplan.

Fas 25 — Multitenant foundation

Implementera:

- B2C-tenant,

- coachrelation,

- gymrelation,

- organisationspolicy,

- och explicit datadelning.

Fas 26 — Backup och disaster recovery

Implementera:

- krypterad backup,

- retention,

- restore test,

- recovery mål,

- och domänåterställning.

Fas 27 — Full domängovernance

Implementera:

- capabilityrevision,

- authority review,

- policyarv,

- compliance mapping,

- supply-chain-kontroll,

- och återkommande domänaudit.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- enhetstester,

- kontraktstester,

- tenanttester,

- policytester,

- säkerhetstester,

- integritetstester,

- kostnadsgranskning,

- dokumentationsuppdatering,

- pull request,

- kvalificerad review,

- kontrollerad merge,

- deploymentverifiering,

- och resultatuppföljning.

20.230 FRAMGÅNGSKRITERIER

Kapitel 20:s vision är framgångsrikt realiserad när:

- GainPilot är registrerat som en självständig Omnira-domän,

- domänen har stabil identitet och version,

- lifecycle-status och operating mode är explicita,

- GainPilot kan sättas i hibernation utan dataförlust,

- återaktivering är kontrollerad,

- tenant och användare finns i alla relevanta scopes,

- kunddata är isolerad i databas, filer, cache, index och agentkontext,

- GainPilot har ett tydligt bounded context,

- domänspråket är canonical,

- externa modeller inte blir intern sanning,

- capabilities är registrerade,

- varje capability har ägare och riskklass,

- Omnira och GainPilot kommunicerar genom versionerade kontrakt,

- events använder minimerade data,

- känslig data klassificeras,

- användningssyfte är explicit,

- GainPilot har en isolerad minnesdomän,

- Hermes är obligatorisk gateway,

- Atlas kan analysera utan full minnesåtkomst,

- Arnold är GainPilot-agent och inte global superagent,

- delegering inte skapar nya behörigheter,

- authority beviljas per capability,

- autonomi kan återkallas,

- approvals är begripliga och proportionerliga,

- kostnader kan tillskrivas rätt projekt och workflow,

- operating mode styr verkligt beteende,

- workflows är registrerade och versionerade,

- dubbletter förhindras,

- unknown outcomes verifieras,

- retries och compensation fungerar,

- dolda cronjobb saknas,

- kritiska flöden fungerar i degraderat läge,

- aktiva träningspass fungerar offline,

- Atlas inte är single point of failure,

- externa beroenden har timeouts och circuit breakers,

- offlinehistorik synkroniseras säkert,

- GainPilot har definierade SLO,

- metrics, logs och traces är tillgängliga,

- känslig information inte läcker i observability,

- beslut och behörighetsförändringar auditeras,

- säkerhetsincidenter kan eskaleras till Omnira,

- domänen kan stoppas utan att hela plattformen stängs ned,

- aktiva lokala pass inte förlorar användarens data vid nödstopp,

- secrets endast finns i godkänt valv,

- tokens är projekt- och integrationsscopeade,

- utvecklings- och produktionsmiljöer är isolerade,

- preview-miljöer inte kontaktar verkliga användare,

- deployments är reproducerbara,

- migrationer är versionerade,

- kontrakt har bakåtkompatibilitet eller migrationsväg,

- högriskreleaser kräver flera granskare,

- GainPilot har en tydlig repositorystruktur,

- canonical bokkunskap kan integreras efter godkännande,

- körbara regler kan spåras till canonical kontrakt,

- implementationens avvikelser dokumenteras,

- Stage 1 förblir begränsad men arkitektoniskt korrekt,

- agentutveckling sker på separata branches eller worktrees,

- orelaterade användarändringar skyddas,

- domänlogik testas och inte endast API-status,

- policy-, säkerhets-, integritets- och kostnadstester finns,

- merge följs av deploymentverifiering,

- kod och dokumentation hålls synkroniserade,

- support endast får ärendebunden åtkomst,

- användaren kan korrigera, exportera och radera data själv,

- integrationer har tydliga read- och write-scope,

- externa AI-modeller får minimerade kontextpaket,

- modeller är registrerade och versionshanterade,

- backup kan återställas,

- disaster recovery är testad,

- GainPilot-data förblir portabel,

- framtida coach-, gym- och företagstenants kan isoleras,

- arbetsgivare inte får individuell tränings- eller hälsodata,

- policykonflikter löses säkert,

- leverantörer och dependencies riskbedöms,

- GainPilots strategiska kärna förblir under domänens kontroll,

- Omniras plattformskomplexitet inte försämrar användarupplevelsen,

- och Arnold fortfarande känns som en sammanhängande, personlig och begriplig coach.

20.231 SAMMANFATTNING

GainPilot ska vara en fullvärdig domän inom Omnira.

Det innebär att GainPilot ska vara:

- självständigt nog att äga sin produkt,

- specialiserat nog att förstå träning och kost,

- isolerat nog att skydda användaren,

- och integrerat nog att dra nytta av Omniras gemensamma intelligens.

Omnira ska tillhandahålla:

- identitet,

- tenants,

- projektstyrning,

- agentsamordning,

- authority,

- approvals,

- minnesgränser,

- secrets,

- observability,

- incidenthantering,

- och Executive Intelligence.

GainPilot ska tillhandahålla:

- användarmodell,

- träningsintelligens,

- kostintelligens,

- program,

- träningspass,

- substitutionsmotor,

- övningsgraf,

- progressionsanalys,

- coachning,

- och domänspecifik säkerhet.

Atlas ska förstå GainPilot som:

- produkt,

- verksamhet,

- domän,

- och del av Omniras större ekosystem.

Atlas ska kunna:

- analysera,

- samordna,

- föreslå,

- och stödja utveckling.

Atlas ska inte kunna:

- kringgå GainPilots regler,

- läsa allt privat minne,

- eller direkt genomföra strategiska och högriskmässiga förändringar utan mandat.

Arnold ska vara GainPilots synliga coach.

Han ska möta användaren genom:

- enkel dialog,

- tydliga träningspass,

- praktisk kosthjälp,

- begriplig statistik,

- och respektfull kommunikation.

Användaren ska normalt inte behöva förstå:

- domänkataloger,

- eventkontrakt,

- authority levels,

- workflowstatus,

- eller minnesgateways.

Den tekniska komplexiteten ska göra produkten:

- säkrare,

- intelligentare,

- stabilare,

- och mer personlig.

Den ska inte göra den svårare att använda.

Hermes ska vara gränsen som gör det möjligt för GainPilot att dra nytta av Omnira utan att användaren blir genomskinlig för hela systemet.

Hermes ska säkerställa att:

- Arnold får rätt träningskontext,

- Atlas får minimerade analysunderlag,

- andra projekt endast får uttryckligt godkänd information,

- och känsliga GainPilot-minnen förblir isolerade.

GainPilot ska byggas tenantmedvetet från början.

Även när grundaren är den enda användaren ska data alltid kunna kopplas till:

- rätt tenant,

- rätt användare,

- rätt projekt,

- rätt domän,

- och rätt syfte.

Detta gör att GainPilot senare kan stödja:

- privatpersoner,

- coacher,

- gym,

- företag,

- och partners

utan att arkitekturen behöver byggas om från grunden.

En coach ska kunna få:

- valda träningsdata,

- program,

- resultat,

- och användarfeedback.

Coachen ska inte automatiskt få:

- full kosthistorik,

- privata Omnira-samtal,

- kroppsbilder,

- eller andra projekts data.

Ett gym ska kunna erbjuda:

- klasser,

- utrustningsprofil,

- och programmering.

Gymmet ska inte äga hela medlemmens privata GainPilot-profil.

En arbetsgivare ska kunna erbjuda GainPilot som förmån.

Arbetsgivaren ska normalt endast få aggregerad information och aldrig individens privata:

- vikt,

- kost,

- träning,

- eller coachdialog.

GainPilot ska vara capabilitybaserat.

Det ska vara tydligt vem eller vad som får:

- skapa program,

- ändra program,

- byta övningar,

- uppdatera kostmål,

- läsa minnen,

- kontakta användaren,

- eller dela data.

Authority ska inte ges globalt.

Arnold kan ha hög autonomi inom:

- lågriskmässiga och verifierade passanpassningar.

Han kan samtidigt behöva användarapproval för:

- större programförändringar,

- kostmål,

- coachdelning,

- och nya integrationer.

Autonomi ska förtjänas genom:

- kvalitet,

- stabilitet,

- testning,

- observability,

- och säkra återställningar.

Den ska kunna återkallas efter:

- incident,

- modellbyte,

- policyförändring,

- eller försämrad kvalitet.

GainPilot ska inte vara helt beroende av Atlas eller molnet för varje handling.

Användaren ska även i degraderat eller offline läge kunna:

- öppna dagens pass,

- se övningar,

- använda timer,

- registrera resultat,

- och följa grundläggande säkerhetsregler.

När anslutningen återkommer ska systemet:

- synkronisera idempotent,

- verifiera okända utfall,

- lösa konflikter,

- och bevara användarens historik.

GainPilots workflows ska vara:

- versionerade,

- observerbara,

- återhämtningsbara,

- och begränsade av operating mode.

Systemet ska hantera:

- retries,

- dubbletter,

- unknown outcome,

- compensation,

- och externa beroenden

utan att användaren behöver förstå den distribuerade arkitekturen.

GainPilot ska ha flera nivåer av nödstopp.

Det ska gå att stoppa:

- en agent,

- ett workflow,

- en integration,

- en capability,

- eller hela domänen.

Ett lokalt problem ska inte automatiskt stoppa hela Omnira.

Ett centralt problem ska inte behöva förstöra ett aktivt lokalt träningspass.

GainPilot ska utvecklas genom en kontrollerad process:

Observation

→ analys

→ förslag

→ godkänt scope

→ separat branch eller worktree

→ implementation

→ tester

→ dokumentation

→ pull request

→ kvalificerad review

→ merge

→ deployment

→ uppföljning.

Ingen agent ska normalt:

- ändra main direkt,

- stagea orelaterade filer,

- utöka scope utan mandat,

- eller betrakta en mergad PR som fullständig produktverifiering.

Canonical böcker ska senare integreras i GainPilot- och Omnira-repositoryt som versionerad kunskap.

Där ska det vara tydligt vad som är:

- arbetsutkast,

- godkänt innehåll,

- canonical edition,

- implementation guidance,

- och arkiv.

Boken ska kunna kompileras till:

- kontraktsregister,

- policies,

- testkrav,

- ordlistor,

- architecture decision records,

- och agentinstruktioner.

Implementation som avviker från canonical vision ska dokumenteras.

Agenter får inte tyst välja bort arkitekturkontrakt för att en snabbare lösning är enklare.

Stage 1 ska vara liten.

Den behöver inte implementera hela bokens vision.

Den ska däremot bygga på rätt grund:

- GainPilot som domän,

- tenantmedveten identitet,

- Arnold som begränsad agent,

- Hermes som minnesgräns,

- Atlas som central men kontrollerad intelligens,

- capabilitybaserade permissions,

- approvals,

- audit,

- och branchbaserad utveckling.

Kapitel 20 etablerar därmed följande kärnprincip:

GainPilot ska inte vara en träningsapp som råkar ansluta till Omnira. GainPilot ska vara en självständig, säker och versionerad produktdomän som använder Omnira som sitt intelligenta kontrollplan — så att Arnold kan ge användaren en enkel och personlig coachupplevelse samtidigt som Atlas, Hermes, agentsystemen och den tekniska plattformen arbetar kontrollerat bakom den.
