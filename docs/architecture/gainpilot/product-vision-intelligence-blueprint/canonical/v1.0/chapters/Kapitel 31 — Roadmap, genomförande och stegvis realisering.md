# Kapitel 31 — Roadmap, genomförande och stegvis realisering

GainPilot ska inte försöka realisera hela sin långsiktiga vision i en enda implementation.

Boken beskriver ett omfattande framtida system med:

- intelligent onboarding,

- träningsplanering,

- kostplanering,

- progression,

- återhämtning,

- minne,

- Arnold,

- Atlas,

- Hermes,

- flera träningsdomäner,

- coach- och organisationsfunktioner,

- kommersiella modeller,

- observability,

- autonomi,

- juridisk styrning,

- och full Omnira-integration.

Alla dessa delar är viktiga för den långsiktiga produkten.

De behöver inte byggas samtidigt.

GainPilot ska i stället realiseras genom en stegvis roadmap där varje etapp:

- skapar ett användbart resultat,

- bevarar den canonical arkitekturen,

- begränsar risk,

- ger verifierbart lärande,

- och förbereder nästa steg utan att låsa produkten i en tillfällig återvändsgränd.

Roadmapen ska inte reduceras till en lista över funktioner.

Den ska beskriva utvecklingen av hela GainPilot-systemet genom flera samtidiga spår:

- användarvärde,

- domänmodell,

- produktupplevelse,

- data,

- intelligens,

- säkerhet,

- autonomi,

- Omnira-integration,

- kommersiell validering,

- drift,

- och governance.

En funktion är inte färdig enbart därför att:

- UI:t finns,

- koden har mergats,

- en AI-agent kan demonstrera den,

- eller den fungerar för grundaren i ett lyckat test.

En capability ska betraktas som realiserad först när relevanta delar av följande kedja är uppfyllda:

Vision

→ canonical kontrakt

→ avgränsat scope

→ domänmodell

→ implementation

→ test

→ användarflöde

→ säkerhet

→ integritet

→ observability

→ rollback

→ dokumentation

→ ägarskap

→ produktionsverifiering

→ och effektuppföljning.

GainPilot ska börja litet men arkitektoniskt korrekt.

Det betyder inte att den första versionen ska innehålla:

- full multi-tenant-plattform,

- avancerad organisationsbilling,

- alla träningsdomäner,

- full agentautonomi,

- eller internationell marknad.

Det betyder att de funktioner som byggs ska använda rätt grundprinciper från början.

Exempel:

Den första träningsplanen behöver inte stödja alla idrotter.

Den ska ändå ha:

- stabil programidentitet,

- versionshantering,

- användarscope,

- tydlig provenance,

- och möjlighet att ersättas utan att skriva över historiken.

Den första Arnold-versionen behöver inte kunna agera autonomt.

Den ska ändå:

- ha tydlig agentidentitet,

- använda strukturerade capabilities,

- respektera permissions,

- och inte få direkt obegränsad databasåtkomst.

Den första kostfunktionen behöver inte skapa fulla veckomenyer.

Den ska ändå:

- skilja preferens från allergi,

- ha tydligt datasyfte,

- och undvika medicinska påståenden.

Den första kommersiella modellen behöver inte stödja tio abonnemang.

Den ska ändå:

- skilja entitlement från permission,

- vara transparent,

- och hantera betalningshändelser idempotent.

Roadmapen ska därför följa principen:

Minsta användbara produkt, men inte minsta ansvarstagande arkitektur.

GainPilot ska samtidigt undvika motsatsen:

att bygga en stor intern plattform utan att användaren får verkligt värde.

Omnira-integration, agentsystem, minneslager och governance ska endast realiseras i den omfattning som behövs för att stödja konkreta GainPilot-flöden.

Produkten ska inte lägga flera månader på:

- generiska agentregister,

- omfattande visualiseringar,

- generell multi-agentorkestrering,

- eller abstrakt enterprisearkitektur

utan att kunna hjälpa en användare genomföra ett bättre träningspass.

Den första centrala värdekedjan ska vara tydlig:

Användaren onboardas

→ ett relevant mål och nuläge förstås

→ ett träningsupplägg skapas

→ dagens pass visas

→ passet kan genomföras och loggas

→ resultatet påverkar nästa planering

→ Arnold förklarar och hjälper

→ användaren behåller kontrollen.

När denna kedja fungerar kan GainPilot utökas genom:

- kost,

- djupare progression,

- återhämtning,

- fler träningsdomäner,

- automation,

- coachfunktion,

- kommersiell skalning,

- och bredare Omnira-intelligens.

Roadmapen ska vara outcome-baserad.

En etapp ska inte endast heta:

Bygg kalender.

Den ska beskriva vilket resultat som ska uppnås.

Exempel:

Användaren ska kunna se sin aktuella träningsvecka, flytta ett pass utan att förlora programlogik och förstå hur förändringen påverkar resten av veckan.

Detta skapar ett verifierbart produktutfall.

Roadmapen ska också vara kontraktsmedveten.

Varje implementeringsetapp ska ange:

- vilka kapitel den realiserar,

- vilka GP-kontrakt som berörs,

- vilka kontrakt som ännu endast förbereds,

- och vilka delar som uttryckligen ligger utanför scope.

GainPilot ska inte hävda att en hel bokdel är implementerad om endast en demonstration finns.

Systemet ska skilja mellan:

- envisioned,

- specified,

- designed,

- implemented,

- tested,

- production-ready,

- released,

- verified,

- och canonical-in-production.

Dessa statusar ska användas för att beskriva hur långt en capability faktiskt har kommit.

Roadmapen ska tillåta förändring.

Boken är normerande för:

- principer,

- gränser,

- ansvar,

- och långsiktig riktning.

Den ska inte tvinga GainPilot att behålla en teknisk lösning som senare visar sig vara sämre.

Implementation kan förändras när:

- ny evidens finns,

- tekniken utvecklas,

- användarbehov blir tydligare,

- eller en enklare lösning kan uppfylla samma kontrakt.

Canonical kontrakt får däremot inte kringgås tyst.

Om ett kontrakt behöver ändras ska detta ske genom:

- dokumenterad avvikelse,

- analys,

- beslut,

- versionsuppdatering,

- och kontrollerad canonical revision.

Roadmapen ska också skydda GainPilot från splittrad utveckling.

Nya idéer kommer att uppstå.

Användare, modeller, agenter, konkurrenter och partners kommer att föreslå:

- fler funktioner,

- fler integrationer,

- fler träningsformer,

- fler analyser,

- och fler kommersiella möjligheter.

Alla idéer ska inte bli roadmaparbete.

GainPilot ska använda en tydlig prioriteringsmodell.

Varje initiativ ska bedömas mot:

- användarvärde,

- strategisk passform,

- säkerhet,

- risk,

- kostnad,

- återanvändbarhet,

- tekniskt beroende,

- lärandevärde,

- och påverkan på roadmapens kritiska kedja.

Atlas ska kunna hjälpa till att analysera initiativ.

Atlas ska inte ensam ändra roadmapen.

Grundaren eller utsedd produktägare ska fatta det slutliga beslutet.

Grundprincipen är:

GainPilot ska realiseras stegvis från en liten men verkligt användbar coachprodukt till en full intelligent Omnira-domän. Varje fas ska skapa användarvärde, uppfylla definierade kontrakt, producera verifierbar evidens och lämna systemet säkrare och mer förberett för nästa steg. Roadmapen ska styra fokus utan att bli stel, och ingen framtidsvision får användas som ursäkt för att bygga mer komplexitet än produkten för tillfället behöver.

31.1 ROADMAPENS SYFTE

Roadmapen ska skapa en gemensam förståelse för:

- vad GainPilot bygger,

- varför,

- i vilken ordning,

- med vilka beroenden,

- och hur framgång verifieras.

31.2 ROADMAP ÄR INTE EN KALENDER

Roadmapen ska inte endast vara datum och deadlines.

Den ska beskriva:

- produktutfall,

- riskreduktion,

- lärande,

- och mognad.

31.3 ROADMAP ÄR INTE ETT LÖFTE OM EXAKT DATUM

Tidiga estimat ska uttryckas med osäkerhet.

Ett datum ska inte presenteras som säkert när scope eller beroenden är olösta.

31.4 ROADMAP ÄR ETT BESLUTSVERKTYG

Roadmapen ska hjälpa GainPilot välja:

- vad som görs nu,

- vad som förbereds,

- vad som väntar,

- och vad som aktivt väljs bort.

31.5 DEN CANONICAL ROADMAPMODELLEN

GainPilot ska ha en canonical modell för roadmapinitiativ.

Modellen ska minst kunna representera:

- initiative_identity,

- title,

- problem_statement,

- intended_outcome,

- target_users,

- strategic_theme,

- related_capabilities,

- related_contracts,

- dependencies,

- assumptions,

- risks,

- scope,

- out_of_scope,

- evidence_required,

- success_metrics,

- guardrails,

- owner,

- stage,

- target_window,

- confidence,

- status,

- decision_history,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

31.6 INITIATIVIDENTITET

Varje initiativ ska ha stabil identitet.

Namnändring ska inte förlora:

- historik,

- beslut,

- eller koppling till implementation.

31.7 PROBLEMSTATEMENT

Initiativet ska börja med ett problem.

Exempel:

Användaren förlorar sin träningsstruktur när vardagen förändras.

31.8 INTE FEATURE FÖRST

Formuleringen:

Bygg drag-and-drop-kalender

är inte tillräckligt problemstatement.

31.9 AVSETT UTFALL

Initiativet ska beskriva vilket användar- eller verksamhetsutfall som önskas.

31.10 MÅLGRUPP

Det ska vara tydligt vem utfallet är till för.

31.11 STRATEGISKT TEMA

Initiativet ska kopplas till ett strategiskt tema.

Exempel:

- core coaching,

- adherence,

- intelligence,

- safety,

- commercial validation,

- eller scale.

31.12 KONTRAKTSKOPPLING

Initiativet ska ange vilka GP-kontrakt som:

- implementeras,

- berörs,

- eller medvetet skjuts fram.

31.13 BEROENDEN

Tekniska, domänmässiga och organisatoriska beroenden ska vara synliga.

31.14 ANTAGANDEN

Roadmapen ska dokumentera antaganden.

Exempel:

- användaren vill logga set,

- ett träningsprogram kan uttryckas med nuvarande modell,

- eller en extern tjänst stöder nödvändig export.

31.15 ANTAGANDE ÄR INTE FAKTA

Obekräftade antaganden ska inte presenteras som användarbehov.

31.16 EVIDENS

Varje viktigt antagande ska ha plan för hur det kan verifieras.

31.17 RISKKLASS

Initiativ ska riskklassificeras.

31.18 HÖGRISKINITIATIV

Exempel:

- automatisk belastningsökning,

- allergibaserad kostplan,

- datadelning till coach,

- betalning,

- eller production deployment.

31.19 LÅGRISKINITIATIV

Exempel:

- förbättrad navigering,

- tydligare övningsförklaring,

- eller lokal filterfunktion.

31.20 SCOPE

Scope ska vara explicit.

31.21 OUT OF SCOPE

Det som inte ingår ska också dokumenteras.

31.22 SCOPE CREEP

Nya önskemål ska inte tyst läggas till under implementation.

31.23 ÄNDRAT SCOPE

Scopeförändring ska:

- dokumenteras,

- riskbedömas,

- och godkännas.

31.24 OWNER

Varje initiativ ska ha ansvarig ägare.

31.25 INGEN OWNER

Initiativ utan ägare ska inte betraktas som aktivt åtagande.

31.26 ROADMAPSTATUS

Initiativ ska kunna ha status:

- idea,

- exploring,

- candidate,

- approved,

- planned,

- in_progress,

- validating,

- released,

- measuring,

- completed,

- paused,

- cancelled,

- eller superseded.

31.27 IDEA

Idea innebär att förslaget finns men inte är analyserat.

31.28 EXPLORING

Exploring innebär att GainPilot undersöker:

- problem,

- användare,

- risk,

- och möjliga lösningar.

31.29 CANDIDATE

Candidate innebär att initiativet kan prioriteras men ännu inte är godkänt.

31.30 APPROVED

Approved innebär att produktägaren har godkänt:

- problem,

- mål,

- och övergripande scope.

Det innebär inte att implementation kan ske utan teknisk plan.

31.31 PLANNED

Planned innebär att initiativet har:

- beroenden,

- plan,

- ägare,

- och målperiod.

31.32 IN PROGRESS

In progress innebär att arbete faktiskt pågår.

31.33 VALIDATING

Validating innebär att implementationen finns men ännu verifieras.

31.34 RELEASED

Released innebär att capabilityn har gjorts tillgänglig för definierad målgrupp.

31.35 MEASURING

Measuring innebär att GainPilot följer verklig effekt.

31.36 COMPLETED

Completed ska kräva uppfyllda closurekriterier.

31.37 PAUSED

Paused ska ange:

- varför,

- vad som krävs för återstart,

- och vad som händer med pågående material.

31.38 CANCELLED

Cancelled innebär att initiativet aktivt avslutas.

31.39 SUPERSEDED

Superseded innebär att ett annat initiativ ersatt det.

31.40 PRODUKTMOGNAD

Capabilitymognad ska skiljas från roadmapstatus.

31.41 DEN CANONICAL MOGNADSMODELLEN

En capability ska kunna ha mognadsstatus:

- envisioned,

- specified,

- designed,

- prototyped,

- implemented,

- tested,

- production_ready,

- released,

- verified,

- mature,

- eller deprecated.

31.42 ENVISIONED

Envisioned innebär att funktionen finns i visionen.

31.43 SPECIFIED

Specified innebär att beteende och gränser är dokumenterade.

31.44 DESIGNED

Designed innebär att arkitektur och användarflöde har utformats.

31.45 PROTOTYPED

Prototyped innebär att en demonstration eller experimentell version finns.

31.46 IMPLEMENTED

Implemented innebär att kod finns.

Det betyder inte automatiskt:

- testad,

- säker,

- eller produktionsklar.

31.47 TESTED

Tested innebär att definierade tester har passerat.

31.48 PRODUCTION READY

Production ready innebär att relevanta krav för:

- säkerhet,

- drift,

- rollback,

- observability,

- och support

är uppfyllda.

31.49 RELEASED

Released innebär tillgänglig i definierad miljö och population.

31.50 VERIFIED

Verified innebär att produktionen visar förväntat beteende och effekt.

31.51 MATURE

Mature innebär att capabilityn:

- är stabil,

- förstådd,

- välövervakad,

- och har fungerande governance.

31.52 DEPRECATED

Deprecated innebär att capabilityn ska ersättas eller avvecklas.

31.53 INGEN STATUSINFLATION

GainPilot ska inte kalla en prototype:

production-ready.

31.54 DEMO ÄR INTE PRODUKT

En lyckad demonstration ska inte användas som bevis för:

- robusthet,

- säkerhet,

- eller skalbarhet.

31.55 STAGE-MODELL

GainPilots övergripande realisering ska organiseras i större stages.

31.56 STAGE 0 — CANONICAL FOUNDATION

Stage 0 omfattar:

- vision,

- böcker,

- kontrakt,

- canonical begrepp,

- och arkitekturbeslut.

31.57 STAGE 0:S SYFTE

Syftet är att skapa en gemensam målbild före omfattande implementation.

31.58 STAGE 0 ÄR INTE SLUTPRODUKT

Dokumentation skapar inte användarvärde utan implementation.

31.59 STAGE 1 — CORE GAINPILOT

Stage 1 ska skapa den första sammanhängande GainPilot-produkten.

31.60 STAGE 1:S KÄRNVÄRDE

Användaren ska kunna:

- onboardas,

- få ett träningsupplägg,

- se dagens pass,

- logga resultat,

- följa grundläggande progression,

- och prata med Arnold om sitt upplägg.

31.61 STAGE 1:S PRINCIP

Stage 1 ska vara liten men arkitektoniskt korrekt.

31.62 STAGE 1:S ANVÄNDARE

Första användaren kan vara grundaren.

Därefter kan en liten intern eller nära testgrupp användas.

31.63 STAGE 1:S TRAINING SCOPE

Stage 1 bör fokusera på:

- styrketräning,

- hypertrofi,

- generell fysisk träning,

- och grundläggande kondition där det passar.

31.64 STAGE 1:S KOSTSCOPE

Kost kan i Stage 1 vara begränsad till:

- energimål,

- proteinmål,

- enkla måltidsprinciper,

- och manuell logg eller grundläggande planering.

31.65 STAGE 1:S ARNOLD

Arnold ska huvudsakligen arbeta i:

- explain,

- recommend,

- och prepare.

Verkliga förändringar ska normalt kräva approval.

31.66 STAGE 1:S ATLAS

Atlas ska främst användas internt för:

- roadmap,

- kvalitet,

- kostnad,

- och produktanalys.

31.67 STAGE 1:S HERMES

Hermes ska säkerställa:

- projektscope,

- rätt användare,

- minimerad kontext,

- och tydlig provenance.

31.68 STAGE 1:S AUTONOMI

Autonomi ska vara låg.

Lågriskautomation kan endast införas efter verifierad användning.

31.69 STAGE 1:S COMMERCIAL SCOPE

Kommersiell validering kan börja genom:

- pilot,

- waitlist,

- manuellt erbjudande,

- eller första enkla abonnemang.

31.70 STAGE 1:S MULTI-TENANCY

Arkitekturen ska vara tenantmedveten.

Full organisationsprodukt behöver inte vara implementerad.

31.71 STAGE 1:S EXPLICIT OUT OF SCOPE

Följande kan ligga utanför Stage 1:

- full CrossFit-motor,

- avancerad calisthenicsprogression,

- marketplace,

- arbetsgivarprodukt,

- full API-plattform,

- global lansering,

- och hög agentautonomi.

31.72 STAGE 1 EXIT CRITERIA

Stage 1 ska inte avslutas förrän:

- core user journey fungerar,

- data bevaras korrekt,

- centrala permissions fungerar,

- Arnold håller sina gränser,

- och användaren får återkommande värde.

31.73 STAGE 2 — ADAPTIVE COACHING

Stage 2 ska göra GainPilot mer adaptivt.

31.74 STAGE 2:S FUNKTIONER

Stage 2 kan omfatta:

- kalenderanpassning,

- substitutionsmotor,

- djupare progression,

- återhämtningssignaler,

- veckosammanfattningar,

- och förbättrad kostplanering.

31.75 STAGE 2:S MEMORY

Personligt GainPilot-minne kan bli mer utvecklat.

31.76 STAGE 2:S AUTONOMI

Arnold kan få begränsad L4-authority för:

- tidigare godkända övningsbyten,

- passflytt inom veckan,

- och andra reversibla lågriskhandlingar.

31.77 STAGE 2:S OBSERVABILITY

Agentbeslut, dataflöden och användarkorrigeringar ska mätas djupare.

31.78 STAGE 2:S COMMERCIAL VALIDATION

GainPilot ska börja förstå:

- betalningsvilja,

- retention,

- usage,

- AI-kostnad,

- och supportbehov.

31.79 STAGE 2 EXIT CRITERIA

Stage 2 ska visa att adaptiv coachning:

- förbättrar användarvärdet,

- inte skapar osäkerhet,

- och kan levereras ekonomiskt.

31.80 STAGE 3 — DOMAIN EXPANSION

Stage 3 ska utöka GainPilot till fler tränings- och kostdomäner.

31.81 STAGE 3:S DOMÄNER

Exempel:

- bodybuilding,

- styrkelyftsnära träning,

- CrossFit,

- calisthenics,

- löpning,

- och andra framtida områden.

31.82 DOMÄNEXPANSION SKA ÅTERANVÄNDA KÄRNAN

Nya domäner ska använda:

- samma identitet,

- programmodell,

- minne,

- permissions,

- Arnold,

- och observability

där detta är lämpligt.

31.83 DOMÄNSPECIFIKA KONTRAKT

Varje ny domän ska få:

- egna regler,

- risker,

- progression,

- och testfall.

31.84 INGEN YTLIG CHECKBOX

En träningsdomän ska inte markeras som stödd enbart därför att några övningar lagts till.

31.85 STAGE 3:S CONTENT

Övningsbibliotek, demos och instruktioner ska utökas systematiskt.

31.86 STAGE 3 EXIT CRITERIA

Varje lanserad domän ska fungera:

- domänmässigt,

- tekniskt,

- säkerhetsmässigt,

- och kommersiellt.

31.87 STAGE 4 — PROFESSIONAL AND ORGANIZATIONAL

Stage 4 ska introducera professionella relationer.

31.88 COACHMODELL

Coachrelationen ska ha:

- identity,

- client scope,

- permissions,

- approvals,

- och ansvar.

31.89 ORGANISATIONSMODELL

Organisationer ska få:

- tenantstruktur,

- roller,

- aggregerad data,

- billing,

- och governance.

31.90 INDIVIDEN FÖRE ORGANISATIONEN

Organisationens betalning får inte upphäva individens integritet.

31.91 STAGE 4 EXIT CRITERIA

Professionella flöden ska vara verifierade för:

- ansvar,

- data,

- ekonomi,

- support,

- och verkligt användarvärde.

31.92 STAGE 5 — PLATFORM AND SCALE

Stage 5 ska göra GainPilot till en bredare plattform.

31.93 STAGE 5 KAN OMFATTA

- API,

- integrationsmarknad,

- licensiering,

- marketplace,

- fler språk,

- fler länder,

- och avancerad multi-tenant-governance.

31.94 STAGE 5 KRÄVER MOGNAD

Plattformsexpansion ska inte ske före stabil kärnprodukt.

31.95 STAGE 5 EXIT CRITERIA

GainPilot ska kunna skala utan att:

- kvalitet,

- isolering,

- support,

- eller marginal

försämras oproportionerligt.

31.96 TVÄRGÅENDE SPÅR

Stages ska kompletteras med tvärgående spår.

31.97 PRODUKTSPÅR

Produktspåret omfattar:

- onboarding,

- planering,

- aktivt pass,

- återkoppling,

- och Arnold-upplevelsen.

31.98 DOMÄNSPÅR

Domänspåret omfattar:

- träningslogik,

- kost,

- progression,

- återhämtning,

- och träningsformer.

31.99 DATASPÅR

Dataspåret omfattar:

- canonical modeller,

- provenance,

- versioner,

- import,

- export,

- retention,

- och kvalitet.

31.100 INTELLIGENCE-SPÅR

Intelligensspåret omfattar:

- Arnold,

- Atlas,

- Hermes,

- modellrouting,

- verktyg,

- och evaluation.

31.101 GOVERNANCESPÅR

Governancespåret omfattar:

- permissions,

- authority,

- approvals,

- audit,

- och canonical kontroll.

31.102 DRIFTSPÅR

Driftspåret omfattar:

- observability,

- SLO,

- incidenter,

- backup,

- restore,

- och recovery.

31.103 COMMERCIAL-SPÅR

Det kommersiella spåret omfattar:

- erbjudande,

- pricing,

- billing,

- unit economics,

- och tillväxt.

31.104 COMPLIANCE-SPÅR

Compliance-spåret omfattar:

- juridik,

- etik,

- integritet,

- tillgänglighet,

- och marknadsgates.

31.105 INGET SPÅR FÅR IGNORERAS

En release med stark produktfunktion men utan:

- säkerhet,

- drift,

- eller ansvar

är inte komplett.

31.106 SPÅREN MOGNAR OLIKA SNABBT

Alla spår behöver inte vara lika avancerade i varje stage.

De ska vara tillräckliga för aktuell risk och population.

31.107 KRITISK VÄRDEKEDJA

Roadmapen ska identifiera den kritiska värdekedjan.

31.108 FÖRSTA KRITISKA VÄRDEKEDJAN

Den första kedjan är:

Onboarding

→ mål och nuläge

→ program

→ planerat pass

→ aktivt genomförande

→ loggning

→ återkoppling

→ nästa anpassning.

31.109 KEDJAN FÖRE SIDOFUNKTIONER

Sidofunktioner ska inte prioriteras över en trasig kärnkedja.

31.110 VÄRDEKEDJANS INVARIANTS

Kedjan ska bevara:

- rätt användare,

- rätt programversion,

- rätt pass,

- korrekt logg,

- och förklarbar anpassning.

31.111 END-TO-END-TEST

Kärnkedjan ska testas sammanhängande.

31.112 INGEN ENHETSTESTAD FRAGMENTERING

Enskilda komponenter kan fungera samtidigt som produkten är trasig.

31.113 VERTICAL SLICE

GainPilot ska föredra vertikala slices.

En vertical slice ska omfatta tillräckligt av:

- UI,

- domän,

- data,

- agent,

- säkerhet,

- och observability

för att skapa verkligt värde.

31.114 HORISONTELL PLATTFORMSFÄLLA

GainPilot ska undvika att först bygga alla generiska lager fullständigt utan produktflöde.

31.115 TUNN MEN HEL KEDJA

En tunn end-to-end-kedja är bättre än många halvfärdiga subsystem.

31.116 TEKNISK ROADMAP

Teknisk roadmap ska följa produktroadmapens behov.

31.117 MODULAR MONOLITH FIRST

GainPilot ska börja med en modulär arkitektur utan onödig tidig mikroserviceuppdelning.

31.118 MODULGRÄNSER

Moduler ska följa bounded contexts och capabilities.

31.119 SERVICEEXTRAKTION

En modul ska endast extraheras när det finns tydlig grund.

Exempel:

- separat skalning,

- säkerhetsisolering,

- deploymentbehov,

- eller organisatoriskt ägarskap.

31.120 INGEN MIKROSERVICE SOM STATUSSYMBOL

Mikroservices ska inte användas för att produkten ska verka större eller mer avancerad.

31.121 SCHEMA FÖRE SPRAWL

Canonical dataobjekt ska stabiliseras innan många integrationskopior skapas.

31.122 MIGRATIONER

Datamigrationer ska planeras som del av roadmapen.

31.123 BAKÅTKOMPATIBILITET

Versionerade klienter och events ska hanteras där det behövs.

31.124 TEKNISK SKULD

Roadmapen ska ha en modell för teknisk skuld.

31.125 AVSIKTLIG SKULD

Viss skuld kan accepteras medvetet för att lära snabbare.

31.126 SKULDREGISTER

Betydelsefull skuld ska ha:

- ägare,

- orsak,

- risk,

- och reviewpunkt.

31.127 INGEN DOLD SKULD

Tillfälliga lösningar ska inte presenteras som canonical slutarkitektur.

31.128 SKULDBUDGET

Varje stage ska begränsa hur mycket kritisk skuld som får ackumuleras.

31.129 REFAKTORERING

Refaktorering ska kopplas till:

- risk,

- hastighet,

- kostnad,

- eller produktbehov.

31.130 INGEN OÄNDLIG STÄDNING

Teknisk perfektion utan användarvärde ska inte dominera roadmapen.

31.131 REPOSITORYSTRUKTUR

GainPilots kod och dokumentation ska ha tydlig struktur.

31.132 CANONICAL KNOWLEDGE

Canonical böcker ska finnas i en Atlas-anpassad och versionsstyrd kunskapsstruktur.

31.133 KÄLLMATERIAL

Källor, research och arbetsmaterial ska skiljas från canonical beslut.

31.134 PROOFS

Tester, reviews, checksummor och valideringsrapporter ska bevaras som proofs.

31.135 PRODUKTIONSARTEFAKTER

Färdiga leveranser ska ligga separat från:

- utkast,

- källor,

- och arkiv.

31.136 ARKIV

Ersatta versioner ska arkiveras, inte tyst raderas.

31.137 INGEN RADERING FÖRE VERIFIERING

Meningsbärande material ska inte raderas innan:

- final version,

- säker kopia,

- checksummor,

- och repositorystatus

har verifierats.

31.138 BRANCHSTRATEGI

Varje avgränsat initiativ ska använda separat branch eller worktree när implementation sker.

31.139 REN BASLINJE

Arbete ska normalt börja från:

- rätt repository,

- rätt branch,

- uppdaterad bas,

- och känd arbetsstatus.

31.140 ORELATERADE ÄNDRINGAR

Förbefintliga orelaterade ändringar ska inte blandas in.

31.141 STOPP VID OSÄKER BAS

Om arbetsytan är osäker ska agenten:

- fortsätta read-only-audit där det är säkert,

- men inte stagea eller committa orelaterat material.

31.142 IMPLEMENTATIONSPLAN

Före kodändring ska en plan definiera:

- scope,

- filer,

- kontrakt,

- tester,

- risk,

- och rollback.

31.143 MINSTA ÄNDRING

Implementation ska använda minsta ändring som uppfyller kontraktet.

31.144 INGEN ORELATERAD REFAKTORERING

Ett featurearbete ska inte samtidigt skriva om stora orelaterade delar.

31.145 AGENTDRIVEN UTVECKLING

Utvecklingsagenter ska kunna genomföra avgränsade uppgifter.

31.146 ATLAS OCH UTVECKLINGSUPPGIFT

Atlas kan:

- definiera uppdrag,

- välja specialistagent,

- och följa resultat.

Atlas ska inte kringgå repositorygovernance.

31.147 SPECIALISTAGENT

Specialistagenten ska använda de resurser som behövs inom tilldelat mandat.

31.148 GRANSKNING FÖRE ATLAS SLUTKONTROLL

Agentresultat ska genomgå relevant:

- teknisk,

- domänmässig,

- säkerhetsmässig,

- eller dokumentationsmässig review

innan Atlas slutgranskar helheten.

31.149 MÄNSKLIG GATE

Mänsklig approval ska behållas för:

- större scope,

- kritiska changes,

- merge,

- och deployment

tills särskilt mandat beviljats.

31.150 COMMIT

Commit ska vara:

- avgränsad,

- begriplig,

- och kopplad till uppgiften.

31.151 PULL REQUEST

Pull request ska beskriva:

- problem,

- lösning,

- scope,

- tester,

- risk,

- och återställning.

31.152 REVIEW

Review ska bedöma mer än kodstil.

31.153 REVIEWDIMENSIONER

Review kan omfatta:

- produkt,

- domän,

- arkitektur,

- säkerhet,

- integritet,

- tillgänglighet,

- drift,

- och juridik.

31.154 MERGE

Merge ska ske först när definierade gates passerats.

31.155 DEPLOYMENT

Merge innebär inte automatiskt deployment.

31.156 RELEASE

Release ska ha:

- target population,

- feature flag,

- canary,

- observability,

- och rollback.

31.157 POST-RELEASE VERIFICATION

Efter release ska GainPilot verifiera:

- tekniskt tillstånd,

- användarflöde,

- data,

- permissions,

- och effekt.

31.158 DEFINITION OF READY

Ett initiativ är ready när:

- problem och användare är kända,

- scope är avgränsat,

- beroenden är förstådda,

- risk är bedömd,

- och evidensplan finns.

31.159 DEFINITION OF DONE

Ett initiativ är done när:

- godkänt scope är implementerat,

- tester passerar,

- dokumentation är uppdaterad,

- release är verifierad,

- och mätningen har startat.

31.160 DONE ÄR INTE FULL EFFEKT

Långsiktig effekt kan kräva fortsatt uppföljning efter att implementationen är klar.

31.161 CLOSURE

Initiativet ska ha closurebeslut.

31.162 KVARVARANDE ARBETE

Kända begränsningar ska dokumenteras vid closure.

31.163 PRODUCT DISCOVERY

GainPilot ska bedriva discovery före större build.

31.164 DISCOVERYMETODER

Exempel:

- användarintervjuer,

- prototyper,

- conciergeflöden,

- dataanalys,

- observation,

- och pilot.

31.165 CONCIERGE

Manuellt genomförd tjänst kan användas för att lära innan automation byggs.

31.166 WIZARD OF OZ

Delar av upplevelsen kan testas manuellt bakom gränssnittet.

Användaren ska inte vilseledas om viktiga risk- eller datadelar.

31.167 PROTOTYP

En prototyp ska ha tydligt status.

Den ska inte behandla verklig högriskdata utan rätt kontroll.

31.168 DESIGN PARTNERS

Tidiga användare kan hjälpa GainPilot utvecklas.

Deras feedback ska inte automatiskt bli generell sanning.

31.169 KVALITATIV OCH KVANTITATIV EVIDENS

Roadmapbeslut ska använda båda typerna.

31.170 ENSTAKA ANEKDOT

Ett enskilt önskemål kan vara viktigt.

Det är inte automatiskt bevis för bred efterfrågan.

31.171 PRODUKTSIGNAL

Signal ska beskriva:

- vem,

- vilket problem,

- frekvens,

- konsekvens,

- och nuvarande workaround.

31.172 PRIORITERING

GainPilot ska använda en explicit prioriteringsmodell.

31.173 DEN CANONICAL PRIORITERINGSMODELLEN

Prioriteringen ska minst väga:

- user_value,

- strategic_alignment,

- safety_impact,

- learning_value,

- reach,

- confidence,

- effort,

- dependency_value,

- revenue_or_cost_impact,

- reversibility,

- and opportunity_cost.

31.174 ANVÄNDARVÄRDE

Initiativ som förbättrar den kritiska värdekedjan ska få hög vikt.

31.175 STRATEGISK PASSFORM

En populär idé ska inte prioriteras om den drar GainPilot bort från sin kärna.

31.176 SÄKERHETSVÄRDE

Riskreduktion kan prioriteras även när den inte skapar synlig ny funktion.

31.177 LÄRANDEVÄRDE

Ett litet experiment kan prioriteras om det besvarar en avgörande fråga.

31.178 REACH

Reach ska bedöma hur många relevanta användare som påverkas.

31.179 CONFIDENCE

Osäkerhet ska påverka prioritering.

31.180 EFFORT

Effort ska omfatta:

- utveckling,

- review,

- migration,

- drift,

- support,

- och compliance.

31.181 DEPENDENCY VALUE

En grundcapability kan prioriteras därför att den öppnar flera senare initiativ.

31.182 OPPORTUNITY COST

Varje ja innebär att något annat väntar.

31.183 INGEN FORMEL SOM AUTOPILOT

En poängmodell ska stödja beslut, inte fatta det automatiskt.

31.184 ATLAS PRIORITERINGSROLL

Atlas kan:

- sammanställa signaler,

- beräkna scenarier,

- upptäcka beroenden,

- och rekommendera ordning.

31.185 ATLAS FÅR INTE SKAPA EGEN ROADMAP

Atlas ska inte aktivera initiativ utan rätt produktmandat.

31.186 ROADMAPREVIEW

Roadmapen ska granskas regelbundet.

31.187 REVIEWRYTM

Review kan ske:

- veckovis operativt,

- månadsvis produktmässigt,

- och kvartalsvis strategiskt

när verksamheten kräver det.

31.188 VECKOVIS REVIEW

Veckovis review ska fokusera på:

- aktivt arbete,

- blockerare,

- risk,

- och nästa steg.

31.189 MÅNADSVIS REVIEW

Månadsvis review ska fokusera på:

- användarsignaler,

- effekt,

- kapacitet,

- och prioritering.

31.190 STRATEGISK REVIEW

Strategisk review ska bedöma:

- stage,

- positionering,

- ekonomi,

- risk,

- och om roadmapens riktning fortfarande är rätt.

31.191 INGEN KONSTANT OMPRIORITERING

Roadmapen ska inte ändras varje gång en ny idé uppstår.

31.192 SKYDDAD FOKUSPERIOD

Aktivt initiativ ska få tillräcklig arbetsro.

31.193 URGENT

Urgent ska reserveras för:

- säkerhet,

- allvarlig drift,

- juridisk deadline,

- eller betydande användarskada.

31.194 INGEN FALSK URGENCY

Kommersiell entusiasm eller en enskild idé ska inte automatiskt bryta fokus.

31.195 INTERRUPT BUDGET

GainPilot ska begränsa hur mycket oplanerat arbete som får störa ett stage.

31.196 RESERVKAPACITET

Viss kapacitet ska kunna reserveras för:

- incidenter,

- support,

- och nödvändigt underhåll.

31.197 PARALLELLT ARBETE

Flera spår kan pågå samtidigt när de inte skapar konflikt.

31.198 BEGRÄNSAD WORK IN PROGRESS

För många samtidiga initiativ ska undvikas.

31.199 WIP LIMIT

Varje team eller agentgrupp ska ha rimlig WIP-gräns.

31.200 STARTA INTE MER — AVSLUTA

Roadmapen ska gynna slutförd verifierad leverans framför många påbörjade projekt.

31.201 BEROENDEKEDJA

Initiativ ska visualisera kritiska beroenden.

31.202 BLOCKERAD

Blockerad status ska ange:

- blockerare,

- ägare,

- och nästa beslutspunkt.

31.203 EXTERNT BEROENDE

Leverantörs- eller regelberoende ska ha alternativplan.

31.204 STOPPREGEL

Initiativ ska kunna stoppas när:

- värdet inte verifieras,

- risk blir för hög,

- kostnaden växer,

- eller antagandet faller.

31.205 SUNK COST

Tidigare investering ska inte ensam motivera fortsatt arbete.

31.206 PIVOT

Initiativ kan ändra lösning om problemet kvarstår men vald metod inte fungerar.

31.207 CANCEL

Att avbryta ett svagt initiativ ska ses som ett legitimt beslut.

31.208 LÄRANDE FRÅN AVBRUTET ARBETE

Resultat, prototyper och lärdomar ska bevaras.

31.209 RELEASESTRATEGI

GainPilot ska använda stegvis release.

31.210 INTERN RELEASE

Första release kan ske till:

- grundaren,

- utvecklingsteam,

- eller intern testtenant.

31.211 ALPHA

Alpha kan användas för ett litet antal informerade användare.

31.212 BETA

Beta ska ha:

- definierad population,

- tydliga begränsningar,

- feedbackkanal,

- och support.

31.213 GENERAL AVAILABILITY

General availability ska kräva betydligt högre mognad.

31.214 FEATURE FLAG

Nya capabilities ska där relevant ligga bakom feature flag.

31.215 FLAGGÄGARE

Varje flagg ska ha:

- owner,

- målgrupp,

- expiry,

- och removal plan.

31.216 FLAGGSKULD

Gamla feature flags ska inte ligga kvar permanent.

31.217 CANARY

Canary ska börja med liten och kontrollerad population.

31.218 INTERN TENANT FÖRST

Högriskfunktioner ska normalt börja internt.

31.219 GRADVIS EXPANSION

Population ska ökas först när:

- metrics,

- kvalitet,

- support,

- och guardrails

är acceptabla.

31.220 STOP CONDITION

Varje utrullning ska ha tydliga stoppvillkor.

31.221 ROLLBACK

Rollback ska vara förberett före release.

31.222 ROLLBACK ÄR INTE ALLTID NOG

Datamigration eller extern effekt kan kräva compensation.

31.223 RELEASE MANIFEST

Varje release ska kunna beskriva:

- version,

- changes,

- schema,

- flags,

- models,

- policies,

- och rollback.

31.224 CHANGELOG

Användarrelevant förändring ska dokumenteras begripligt.

31.225 INTERN CHANGELOG

Tekniska och governanceförändringar ska också dokumenteras.

31.226 MODELLRELEASE

Modellbyte ska behandlas som produktrelease.

31.227 PROMPTRELEASE

Betydande prompt- eller agentpolicyändring ska versioneras och testas.

31.228 KNOWLEDGE RELEASE

Uppdaterad canonical kunskap ska ha:

- version,

- källa,

- build,

- och verifiering.

31.229 CONTRACT COVERAGE

GainPilot ska mäta vilka GP-kontrakt som har:

- implementation,

- test,

- evidens,

- och production verification.

31.230 INGEN FALSK 100 PROCENT

Kontrakttäckning ska inte räknas genom att endast länka ett kontrakt till en kodfil.

31.231 EVIDENSPAKET

Varje stage ska skapa ett evidenspaket.

31.232 EVIDENSPAKETETS INNEHÅLL

Det kan omfatta:

- scope,

- architecture decision,

- implementation,

- tests,

- security review,

- privacy review,

- screenshots,

- metrics,

- user feedback,

- och release verification.

31.233 STAGE MANIFEST

Varje stage ska ha ett manifest över:

- levererat,

- kvarvarande,

- avvikelse,

- risk,

- och nästa rekommendation.

31.234 ACCEPTANCE

Stage acceptance ska vara ett uttryckligt beslut.

31.235 INGEN TYST STAGEÖVERGÅNG

GainPilot ska inte börja nästa stage endast därför att tiden gått.

31.236 PARALLELL FÖRBEREDELSE

Nästa stage kan förberedas utan att föregående har accepterats.

Kritiska beroenden får inte antas färdiga.

31.237 ROADMAP OCH BUDGET

Varje stage ska ha budgetram.

31.238 KOSTNADSSPÅRNING

Kostnad ska följas för:

- modeller,

- infrastruktur,

- verktyg,

- människor,

- support,

- och externa experter.

31.239 BUDGETAVVIKELSE

Avvikelse ska skapa review.

31.240 INGEN AUTOMATISK FORTSÄTTNING

Ett stage som kräver mycket mer budget än väntat ska omprövas.

31.241 KAPACITET

Roadmapen ska ta hänsyn till faktisk kapacitet.

31.242 AGENTKAPACITET

AI-agenter kan öka genomförandekapacitet.

De tar inte bort behovet av:

- review,

- beslut,

- och fokus.

31.243 MÄNSKLIG FLASKHALS

Mänsklig review, domänkompetens och approval kan bli kritiska beroenden.

31.244 REVIEWKAPACITET

Roadmapen ska inte starta mer agentarbete än vad som kan granskas.

31.245 AUTOMATIONSSKULD

Snabb agentproduktion utan review kan skapa större skuld än manuell utveckling.

31.246 KVALITET FÖRE VOLYM

Antal skapade filer, commits eller funktioner är inte framgångsmått.

31.247 ROADMAPMÅTT

GainPilot ska följa roadmapens kvalitet.

31.248 DELIVERY LEAD TIME

Tid från approved till verified release kan mätas.

31.249 CYCLE TIME

Tid för ett avgränsat initiativ ska följas.

31.250 BLOCKED TIME

Blockerad tid kan visa dåliga beroenden.

31.251 REWORK

Omfattande omarbete kan visa:

- otydligt scope,

- svag discovery,

- eller bristande review.

31.252 ESCAPED DEFECTS

Fel som når användare ska följas.

31.253 CONTRACT DEFECT

En implementation kan fungera tekniskt men bryta ett canonical kontrakt.

31.254 ADOPTION

Användning ska följas efter release.

31.255 VALUE REALIZATION

Det ska mätas om användaren faktiskt får avsett värde.

31.256 TIME TO VALUE

Tid från onboarding till första relevanta värdehändelse ska följas.

31.257 STAGE VELOCITY

Stage velocity ska inte maximeras på bekostnad av kvalitet.

31.258 PREDICTABILITY

Roadmapen ska bli bättre på att:

- estimera,

- identifiera risk,

- och förstå beroenden.

31.259 INGEN VELOCITYMANIPULATION

Mått får inte förbättras genom att:

- dela upp trivialt,

- skjuta quality work,

- eller undvika svåra problem.

31.260 LEARNING RATE

GainPilot ska mäta hur snabbt avgörande osäkerhet reduceras.

31.261 ROADMAPDRIFT

Roadmapen ska övervakas för drift.

31.262 FEATURE DRIFT

Ett initiativ kan gradvis ändra syfte.

31.263 STAGE DRIFT

Ett stage kan bli mycket större än avsett.

31.264 PLATFORM DRIFT

GainPilot kan börja bygga generell plattform utan tydligt produktbehov.

31.265 COMMERCIAL DRIFT

Kommersiella möjligheter kan dra roadmapen bort från användarvärde.

31.266 AGENT DRIFT

Agenter kan börja utföra fler eller bredare uppgifter än uppdraget anger.

31.267 GOVERNANCE DRIFT

Förkortade processer kan gradvis bli norm.

31.268 DRIFTREVIEW

Roadmapreview ska kontrollera:

- ursprungligt problem,

- aktuellt scope,

- kontrakt,

- kostnad,

- och kvarvarande värde.

31.269 KANONISK AVVIKELSE

Avvikelse från boken ska dokumenteras.

31.270 AVVIKELSEMODELL

Avvikelsen ska minst ange:

- berört kontrakt,

- orsak,

- alternativ,

- risk,

- tillfällighet,

- ägare,

- expiry,

- och föreslagen canonical hantering.

31.271 TILLFÄLLIG AVVIKELSE

Tillfällig avvikelse ska ha slutdatum eller reviewpunkt.

31.272 PERMANENT FÖRÄNDRING

Permanent förändring ska kräva canonical revision.

31.273 INGEN TYST OMDEFINITION

Implementation ska inte ändra betydelsen av ett kontrakt utan dokumentation.

31.274 CANONICAL REVISION

Revision ska skapa:

- ny version,

- changelog,

- beslut,

- migrationseffekt,

- och kommunikation.

31.275 BAKÅTKOMPATIBILITET FÖR GOVERNANCE

Aktiva system och grants kan behöva migreras när kontrakt ändras.

31.276 ROADMAP OCH BOKEN

Boken ska fungera som:

- normativ målbild,

- kontraktskälla,

- och arkitekturreferens.

31.277 BOKEN ÄR INTE ISSUE TRACKER

Operativa uppgifter ska hanteras i roadmap- och repositorysystem.

31.278 KNOWLEDGE COMPILATION

Canonical bokinnehåll ska kunna kompileras till:

- agentinstruktioner,

- policies,

- schemas,

- checklists,

- och tester.

31.279 INGEN DIREKT PROMPTKOPIA

Hela boken ska inte alltid läggas i varje agentprompt.

31.280 RELEVANT KNOWLEDGE PACKAGE

Agenten ska få den minsta relevanta canonical kontexten.

31.281 KONTRAKT SOM TEST

Vissa GP-kontrakt ska kunna översättas till automatiska eller halvautomatiska tester.

31.282 KONTRAKT SOM REVIEWCHECKLISTA

Andra kontrakt ska verifieras genom mänsklig review.

31.283 KONTRAKT SOM POLICY

Permissions-, safety- och datakontrakt ska där möjligt bli policy som kod.

31.284 KONTRAKT SOM MÄTVÄRDE

Vissa kontrakt kräver långsiktig produktmätning.

31.285 FULL TÄCKNING KRÄVER FLERA BEVISTYPER

Ett kontrakt kan kräva:

- kod,

- test,

- review,

- audit,

- och användarevidens.

31.286 ROADMAPENS MÄNSKLIGA ÄGARE

Roadmapen ska ha mänsklig produktägare.

31.287 ATLAS SOM EXECUTIVE INTELLIGENCE

Atlas ska kunna:

- sammanställa roadmapstatus,

- upptäcka blockerare,

- jämföra scenarier,

- följa kontrakt,

- och rekommendera nästa prioritering.

31.288 ARNOLDS ROADMAPROLL

Arnold ska bidra med:

- användarsignaler,

- korrigeringar,

- friktionspunkter,

- och coachrelaterade behov.

31.289 HERMES ROADMAPROLL

Hermes ska säkerställa att produktanalys använder:

- minimerad,

- rätt scopead,

- och tillåten data.

31.290 AGENTERS FÖRSLAG

Agenter ska kunna föreslå initiativ.

Förslaget ska vara:

- separat från beslut,

- märkt som rekommendation,

- och kopplat till evidens.

31.291 INGEN AGENTSKAPAD PRIORITET GENOM VOLYM

En agent ska inte få större roadmapinflytande genom att generera många liknande förslag.

31.292 MÄNSKLIGT SLUTBESLUT

Produktägaren ska besluta:

- stage,

- prioritet,

- riskacceptans,

- budget,

- och lansering.

31.293 KONTROLLERAD ROADMAPUTVECKLING

Förändringar ska följa:

Signal

→ problemdefinition

→ användarevidens

→ kontraktskoppling

→ risk och beroenden

→ prioriteringsanalys

→ mänskligt beslut

→ avgränsat initiativ

→ separat branch eller worktree

→ implementation

→ tester och review

→ shadow eller intern release

→ canary

→ verifierad release

→ effektmätning

→ roadmapuppdatering.

31.294 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för roadmap, genomförande och stegvis realisering.

**Kontrakt GP-631 — GainPilot ska realiseras stegvis**

Den fulla visionen får inte implementeras som ett enda odelat projekt; varje stage ska skapa ett användbart, verifierbart och arkitektoniskt hållbart resultat.

**Kontrakt GP-632 — Första versionen ska vara liten men arkitektoniskt korrekt**

Stage 1 får begränsa funktioner och målgrupper men ska använda stabil identitet, versionering, scope, provenance, permission och spårbar förändring där dessa behövs.

**Kontrakt GP-633 — Roadmapinitiativ ska beskriva problem och utfall**

Arbete får inte prioriteras enbart som en featurelista utan ska ange målgrupp, problem, avsett värde, evidens och guardrails.

**Kontrakt GP-634 — Roadmapen ska vara kontraktsmedveten**

Varje betydelsefullt initiativ ska kopplas till berörda GP-kontrakt och tydligt ange vilka delar som implementeras, förbereds eller ligger utanför scope.

**Kontrakt GP-635 — Capabilitymognad ska beskrivas ärligt**

Prototype, implementation, test, production readiness, release och verifierad effekt ska vara separata statusar och får inte användas som synonymer.

**Kontrakt GP-636 — Kärnvärdekedjan ska prioriteras**

Onboarding, program, planerat pass, aktivt genomförande, loggning, återkoppling och nästa anpassning ska fungera sammanhängande före omfattande sidofunktioner.

**Kontrakt GP-637 — GainPilot ska föredra vertikala slices**

Nya produktförmågor ska där möjligt levereras genom en tunn men komplett kedja över UI, domän, data, agent, säkerhet och observability.

**Kontrakt GP-638 — Omnira-komplexitet ska följa verkligt produktbehov**

Generiska agent-, plattforms- och enterprise-capabilities får inte byggas långt före det GainPilot-flöde som behöver dem.

**Kontrakt GP-639 — Roadmapen ska begränsa work in progress**

GainPilot ska prioritera verifierad completion framför många samtidiga halvfärdiga initiativ.

**Kontrakt GP-640 — Stageövergång ska kräva explicit acceptans**

Nästa mognadsstage får inte anses påbörjad eller den föregående avslutad enbart därför att tid gått eller en demo genomförts.

**Kontrakt GP-641 — Varje stage ska producera evidens**

Scope, implementation, tester, reviews, release, användarfeedback, metrics, avvikelser och kvarvarande risk ska samlas i ett verifierbart stagepaket.

**Kontrakt GP-642 — Roadmapbeslut ska hantera antaganden och osäkerhet**

Obekräftade behov, estimat och prognoser ska märkas och få en plan för validering innan de behandlas som stabil grund.

**Kontrakt GP-643 — Prioritering ska väga mer än intäkt och popularitet**

Användarvärde, strategisk passform, säkerhet, lärande, beroenden, kostnad, reversibilitet och opportunity cost ska vägas i roadmapbeslut.

**Kontrakt GP-644 — En prioriteringsmodell får inte fatta beslut autonomt**

Poäng, analyser och Atlas-rekommendationer ska stödja men inte ersätta ansvarig produktägares bedömning.

**Kontrakt GP-645 — Repositoryarbete ska vara isolerat och spårbart**

Varje avgränsad implementation ska använda rätt baslinje, separat branch eller worktree, avgränsade commits, pull request, review och verifierad merge.

**Kontrakt GP-646 — Orelaterade ändringar får inte blandas**

Förbefintligt eller orelaterat material ska redovisas och lämnas orört om det inte uttryckligen ingår i godkänt scope.

**Kontrakt GP-647 — Agentproduktion ska begränsas av reviewkapacitet**

GainPilot får inte starta mer agentdrivet arbete än vad relevanta människor och kontrollsystem kan granska och verifiera.

**Kontrakt GP-648 — Merge är inte samma sak som release**

Kodmerge, deployment, featureaktivering, användarlansering och verifierad effekt ska vara separata kontrollerade steg.

**Kontrakt GP-649 — Release ska vara gradvis och återställningsbar**

Nya capabilities ska där relevant använda intern release, feature flag, canary, stoppvillkor, rollback eller compensation och post-release-verifiering.

**Kontrakt GP-650 — Modell-, prompt- och knowledge-förändringar är releaser**

Förändringar i agentbeteende eller canonical kunskapsunderlag ska versioneras, testas, observeras och kunna återställas på samma sätt som kod.

**Kontrakt GP-651 — Teknisk skuld ska vara synlig och ägd**

Avsiktliga förenklingar och temporära lösningar ska ha risk, ägare och reviewpunkt och får inte tyst bli permanent canonical arkitektur.

**Kontrakt GP-652 — Meningsbärande material ska bevaras före städning**

Canonical böcker, källor, proofs, branches, worktrees och artefakter får inte raderas innan finala versioner, checksummor och säkra kopior har verifierats.

**Kontrakt GP-653 — Avvikelse från canonical kontrakt ska vara explicit**

Implementation får inte tyst omdefiniera eller kringgå ett GP-kontrakt; avvikelse ska dokumenteras, riskbedömas, tidsbegränsas eller leda till canonical revision.

**Kontrakt GP-654 — Canonical kunskap ska kompileras selektivt**

Agenter ska få relevant och minimerad kunskapskontext, inte automatiskt hela bokserien i varje uppgift.

**Kontrakt GP-655 — Roadmapeffekt ska mätas efter release**

Initiativ ska följas för adoption, användarvärde, säkerhet, kvalitet, kostnad och oavsiktliga effekter innan de betraktas som fullt verifierade.

**Kontrakt GP-656 — Atlas får analysera men inte ensam styra roadmapen**

Atlas ska kunna sammanställa signaler och rekommendera prioritering men stage, budget, riskacceptans och lansering ska beslutas av behörig mänsklig ägare.

**Kontrakt GP-657 — Roadmap- och implementationssystemet ska följa full governance**

Initiativ, stages, branches, releases, kontraktsavvikelser och canonical revisioner ska hanteras genom definierat scope, tester, review, canary, evidens och explicit beslut.

31.295 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- försöka bygga hela framtidsvisionen samtidigt,

- förväxla lång bok med färdig produkt,

- bygga full plattform före fungerande användarflöde,

- göra Stage 1 till en miniatyr av alla framtida funktioner,

- göra Stage 1 arkitektoniskt ogenomtänkt,

- kalla en featurelista roadmap,

- börja med lösning utan definierat problem,

- använda vaga mål som förbättra upplevelsen,

- sakna målgrupp,

- sakna out-of-scope,

- låta scope växa tyst,

- behandla antaganden som fakta,

- sakna evidensplan,

- låta initiativ sakna ägare,

- kalla idé för approved,

- kalla prototype för implemented,

- kalla implemented för production-ready,

- kalla released för verified,

- markera stage klart efter demo,

- gå vidare endast därför att kalenderdatum passerat,

- prioritera sidofunktion före trasig kärnkedja,

- bygga onboarding utan fungerande nästa steg,

- bygga agentchat utan strukturerade capabilities,

- bygga avancerad analytics utan pålitlig grunddata,

- bygga marketplace före kärnprodukt,

- bygga enterprise före verifierad konsument- eller coachnytta,

- markera en träningsdomän stödd efter några övningar,

- skapa separat produktkärna för varje mål,

- ignorera tvärgående drift- och säkerhetsspår,

- kräva full enterprisegovernance för första interna test,

- hoppa över nödvändig miniminivå av governance,

- bygga alla horisontella plattformslager före vertical slice,

- skapa mikroservices för status,

- extrahera tjänster utan tydlig grund,

- skapa många dataschemakopior före canonical modell,

- ignorera migrationsbehov,

- dölja teknisk skuld,

- beskriva temporär lösning som slutarkitektur,

- låta refaktorering dominera utan produktvärde,

- låta produktfunktion dominera trots kritisk skuld,

- blanda canonical material med utkast,

- radera äldre versioner utan arkiv,

- radera Mac-, SSD- eller lokal kopia innan repository och moln verifierats,

- radera branches eller worktrees före checksummor och final leverans,

- börja implementation på okänd eller smutsig bas,

- stagea orelaterade ändringar,

- göra bred refaktorering i en liten feature-PR,

- låta agenten utöka scope själv,

- låta Atlas kringgå branch- och PR-flöde,

- låta specialistagent mergea sin egen kritiska ändring,

- skapa commits med många orelaterade förändringar,

- skriva PR utan test- och riskbeskrivning,

- begränsa review till kodstil,

- automatiskt deploya varje merge,

- lansera globalt direkt,

- sakna feature flag där risk kräver det,

- låta feature flags ligga kvar utan ägare,

- sakna rollback,

- använda rollback där compensation krävs,

- ändra modell utan releaseprocess,

- ändra systemprompt direkt i produktion,

- uppdatera knowledge index utan versionskontroll,

- räkna kontrakttäckning genom länkar utan bevis,

- sakna stage manifest,

- börja nästa stage utan acceptans,

- ignorera budgetavvikelse,

- anta att AI-agenter ger obegränsad kapacitet,

- skapa mer agentarbete än människor kan granska,

- mäta framgång i antal genererade filer,

- göra discovery till ursäkt för att aldrig bygga,

- göra build till ersättning för discovery,

- vilseleda användare i Wizard-of-Oz-test,

- använda en anekdot som full marknadsevidens,

- låta poängmodell välja roadmap automatiskt,

- prioritera hög reach med låg strategisk passform,

- prioritera intäkt som skapar säkerhetsrisk,

- låta ny idé avbryta varje fokusperiod,

- kalla allt urgent,

- sakna interrupt budget,

- starta för många parallella initiativ,

- låta blockerade initiativ sakna ägare,

- fortsätta på grund av sunk cost,

- betrakta avbrutet arbete som värdelöst,

- lansera beta utan support,

- kalla intern alpha för general availability,

- sakna stop condition,

- sakna release manifest,

- använda teknisk changelog som enda användarinformation,

- optimera velocity genom att skjuta kvalitet,

- manipulera roadmapmått,

- ignorera rework,

- mäta adoption utan värde,

- mäta delivery utan säkerhet,

- låta stage drift fortsätta,

- låta plattformsarbete växa utan produktbehov,

- låta stor kund kapa strategin,

- låta kommersiell möjlighet kringgå kontrakt,

- göra förkortad governance till normal process,

- ändra canonical betydelse i kod,

- låta tillfällig avvikelse sakna expiry,

- skriva om boken automatiskt efter implementation,

- använda boken som issue tracker,

- lägga hela bokserien i varje agentprompt,

- anta att varje kontrakt kan testas på samma sätt,

- låta Atlas aktivera initiativ genom egen rekommendation,

- låta agentförslagens volym styra roadmap,

- eller ändra roadmap-, stage- och releasegovernance direkt i produktion utan analys, review och verifiering.

31.296 KANONISKA BESLUT FRÅN KAPITEL 31

Följande beslut etableras:

1. GainPilot ska realiseras stegvis.

2. Hela visionen ska inte implementeras samtidigt.

3. Varje stage ska skapa verkligt användarvärde.

4. Varje stage ska bevara canonical riktning.

5. Första versionen ska vara liten men arkitektoniskt korrekt.

6. Omnira-komplexitet ska följa produktbehov.

7. Kärnvärdekedjan ska prioriteras.

8. Roadmapen ska vara outcome-baserad.

9. Featurelistor ska inte ersätta problemdefinition.

10. Roadmapinitiativ ska ha stabil identitet.

11. Problemstatement ska vara obligatoriskt.

12. Målgrupp ska anges.

13. Strategiskt tema ska anges.

14. GP-kontrakt ska kopplas till initiativ.

15. Beroenden ska dokumenteras.

16. Antaganden ska vara synliga.

17. Antaganden ska ha evidensplan.

18. Risk ska klassificeras.

19. Scope ska vara explicit.

20. Out-of-scope ska vara explicit.

21. Scopeförändring ska godkännas.

22. Varje initiativ ska ha ägare.

23. Roadmapstatus ska vara strukturerad.

24. Idé, candidate och approved ska skiljas.

25. Planned och in progress ska skiljas.

26. Released och completed ska skiljas.

27. Capabilitymognad ska ha separat modell.

28. Envisioned ska inte betyda implementerad.

29. Prototype ska inte betyda produktionsklar.

30. Implemented ska inte betyda testad.

31. Released ska inte betyda verifierad.

32. Stage 0 ska vara canonical foundation.

33. Stage 1 ska skapa core GainPilot.

34. Stage 1 ska stödja onboarding.

35. Stage 1 ska skapa träningsprogram.

36. Stage 1 ska stödja aktivt pass.

37. Stage 1 ska logga resultat.

38. Stage 1 ska ha grundläggande progression.

39. Stage 1 ska ha Arnold.

40. Arnold ska börja med låg authority.

41. Atlas ska först användas internt.

42. Hermes ska finnas som datagräns.

43. Stage 1 ska vara tenantmedvetet.

44. Full organisationsprodukt ska inte krävas i Stage 1.

45. Stage 1 ska ha explicit out-of-scope.

46. Stage 1 ska ha exit criteria.

47. Stage 2 ska skapa adaptiv coachning.

48. Kalenderanpassning ska kunna införas i Stage 2.

49. Substitutionsmotor ska kunna införas i Stage 2.

50. Djupare progression ska införas stegvis.

51. Lågriskautonomi ska kräva verifiering.

52. Kommersiell validering ska börja tidigt.

53. Stage 2 ska verifiera värde och kostnad.

54. Stage 3 ska utöka domäner.

55. Nya domäner ska återanvända kärnan.

56. Varje domän ska ha egna kontrakt och tester.

57. Ytlig domain support ska förbjudas.

58. Stage 4 ska stödja coacher och organisationer.

59. Coachrelation ska ha permissions.

60. Organisationens intresse ska inte överordnas individen.

61. Stage 5 ska stödja plattform och skala.

62. Plattformsexpansion ska kräva mogen kärna.

63. Produkt-, domän-, data-, intelligence-, governance-, drift-, commercial- och compliance-spår ska finnas.

64. Tvärgående spår ska inte ignoreras.

65. Spår får mogna olika snabbt.

66. Första kritiska värdekedjan ska definieras.

67. Kärnkedjan ska testas end-to-end.

68. Vertical slices ska prioriteras.

69. Tunn hel kedja ska föredras framför fragment.

70. Teknisk roadmap ska följa produktroadmap.

71. Modular monolith ska föredras initialt.

72. Serviceextraktion ska kräva grund.

73. Mikroservices ska inte användas som status.

74. Canonical schema ska stabiliseras före integrationsexplosion.

75. Migrationer ska ingå i roadmap.

76. Teknisk skuld ska registreras.

77. Avsiktlig skuld ska ha reviewpunkt.

78. Dold skuld ska förbjudas.

79. Refaktorering ska kopplas till värde eller risk.

80. Repositorystruktur ska vara tydlig.

81. Canonical kunskap ska versionsstyras.

82. Källmaterial och canonical beslut ska skiljas.

83. Proofs ska bevaras.

84. Produktionsartefakter ska separeras.

85. Ersatta versioner ska arkiveras.

86. Inget meningsbärande material ska raderas före verifiering.

87. Varje implementation ska använda rätt baslinje.

88. Separat branch eller worktree ska användas.

89. Orelaterade ändringar ska lämnas orörda.

90. Osäker arbetsyta ska stoppa writes.

91. Implementationsplan ska finnas före ändring.

92. Minsta tillräckliga diff ska eftersträvas.

93. Orelaterad refaktorering ska undvikas.

94. Agentdriven utveckling ska stödjas.

95. Atlas ska kunna delegera uppdrag.

96. Specialistagent ska arbeta inom mandat.

97. Resultat ska granskas före Atlas slutkontroll.

98. Mänsklig gate ska behållas för kritiska steg.

99. Commits ska vara avgränsade.

100. Pull requests ska beskriva risk och test.

101. Review ska vara multidimensionell.

102. Merge ska kräva gates.

103. Merge och deployment ska skiljas.

104. Release ska vara gradvis.

105. Post-release-verifiering ska krävas.

106. Definition of Ready ska finnas.

107. Definition of Done ska finnas.

108. Done ska inte betyda att långsiktig effekt är bevisad.

109. Closure ska vara explicit.

110. Kvarvarande begränsningar ska dokumenteras.

111. Discovery ska ske före större build.

112. Intervjuer och prototyper ska kunna användas.

113. Concierge ska kunna användas för lärande.

114. Wizard-of-Oz ska inte vilseleda i viktiga frågor.

115. Prototyper ska märkas tydligt.

116. Design-partnerfeedback ska inte generaliseras automatiskt.

117. Kvalitativ och kvantitativ evidens ska kombineras.

118. Produktsignaler ska struktureras.

119. Prioriteringsmodell ska vara explicit.

120. Användarvärde ska väga tungt.

121. Strategisk passform ska bedömas.

122. Säkerhetsvärde ska prioriteras när relevant.

123. Lärandevärde ska kunna prioriteras.

124. Reach ska bedömas.

125. Confidence ska påverka beslut.

126. Effort ska inkludera hela leveranskostnaden.

127. Dependency value ska bedömas.

128. Opportunity cost ska synliggöras.

129. Poängmodell ska inte fatta beslut.

130. Atlas ska kunna analysera prioritering.

131. Atlas ska inte skapa egen aktiv roadmap.

132. Roadmapen ska reviewas regelbundet.

133. Operativ, produktmässig och strategisk review ska skiljas.

134. Konstant omprioritering ska undvikas.

135. Fokusperioder ska skyddas.

136. Urgent ska reserveras för verkligt brådskande arbete.

137. Interrupt budget ska kunna användas.

138. Reservkapacitet ska finnas för incidenter.

139. Parallellt arbete ska begränsas.

140. WIP limits ska användas.

141. Completion ska prioriteras.

142. Blockerare ska ha ägare.

143. Externa beroenden ska ha alternativ.

144. Initiativ ska ha stoppregler.

145. Sunk cost ska inte styra.

146. Pivot ska kunna göras.

147. Cancel ska vara legitimt.

148. Lärande från avbrutet arbete ska bevaras.

149. Release ska börja internt.

150. Alpha och beta ska ha definierade populationer.

151. General availability ska kräva högre mognad.

152. Feature flags ska ha ägare och expiry.

153. Flaggskuld ska städas.

154. Canary ska användas.

155. Högriskfunktion ska börja i intern tenant.

156. Population ska ökas gradvis.

157. Utrullning ska ha stop conditions.

158. Rollback ska förberedas.

159. Compensation ska användas när rollback inte räcker.

160. Release manifest ska finnas.

161. Changelog ska finnas.

162. Modellbyte ska vara release.

163. Promptförändring ska vara release.

164. Knowledgeförändring ska vara release.

165. Kontrakttäckning ska mätas med evidens.

166. Falsk kontrakttäckning ska undvikas.

167. Varje stage ska skapa evidenspaket.

168. Stage manifest ska finnas.

169. Stage acceptance ska vara explicit.

170. Nästa stage får förberedas parallellt.

171. Beroenden får inte antas färdiga.

172. Stage ska ha budgetram.

173. Kostnad ska följas.

174. Budgetavvikelse ska skapa review.

175. Faktisk kapacitet ska styra roadmapen.

176. Agentkapacitet ska inte överdrivas.

177. Mänsklig review kan vara flaskhals.

178. Agentarbete ska begränsas av reviewkapacitet.

179. Kvalitet ska prioriteras över outputvolym.

180. Delivery lead time ska mätas.

181. Cycle time ska följas.

182. Blocked time ska följas.

183. Rework ska analyseras.

184. Escaped defects ska följas.

185. Contract defects ska följas.

186. Adoption ska följas.

187. Value realization ska följas.

188. Time to value ska följas.

189. Velocity ska inte optimeras isolerat.

190. Predictability ska förbättras.

191. Learning rate ska följas.

192. Roadmapdrift ska upptäckas.

193. Feature drift ska upptäckas.

194. Stage drift ska upptäckas.

195. Platform drift ska upptäckas.

196. Commercial drift ska upptäckas.

197. Agent drift ska upptäckas.

198. Governance drift ska upptäckas.

199. Roadmapreview ska jämföra med ursprungligt problem.

200. Canonical avvikelse ska vara dokumenterad.

201. Avvikelse ska ha ägare och expiry.

202. Permanent förändring ska kräva canonical revision.

203. Kontrakt får inte omdefinieras tyst.

204. Canonical revision ska versionsstyras.

205. Governanceförändring ska kunna migreras.

206. Boken ska vara normativ referens.

207. Boken ska inte vara issue tracker.

208. Canonical kunskap ska kunna kompileras.

209. Hela boken ska inte läggas i varje prompt.

210. Agenten ska få minsta relevanta knowledge package.

211. Kontrakt ska kunna bli tester.

212. Kontrakt ska kunna bli reviewchecklistor.

213. Kontrakt ska kunna bli policy som kod.

214. Kontrakt ska kunna bli produktmått.

215. Flera bevistyper ska kunna krävas.

216. Roadmapen ska ha mänsklig ägare.

217. Atlas ska vara executive intelligence för roadmapen.

218. Arnold ska bidra med användarsignaler.

219. Hermes ska minimera analysdata.

220. Agenter ska kunna föreslå initiativ.

221. Agentförslag ska vara separata från beslut.

222. Förslagsvolym ska inte skapa prioritet.

223. Produktägaren ska fatta slutligt beslut.

224. Roadmapförändringar ska följa full governance.

225. GainPilot ska bygga rätt sak i rätt ordning med verifierat värde.

31.297 IMPLEMENTERINGSORDNING

GainPilots roadmap- och genomförandeförmåga ska implementeras stegvis.

Fas 1 — Canonical inventory

Samla:

- bokkapitel,

- GP-kontrakt,

- canonical begrepp,

- beslutad terminologi,

- och aktuella artefakter.

Fas 2 — Bevarandekontroll

Verifiera:

- lokala kopior,

- repository,

- molnkopior,

- checksummor,

- och att inget meningsbärande material raderas.

Fas 3 — Capabilityregister

Skapa register över:

- envisioned capabilities,

- ägare,

- stage,

- kontrakt,

- mognad,

- och risk.

Fas 4 — Roadmapregister

Implementera:

- initiative identity,

- problem,

- outcome,

- scope,

- owner,

- dependencies,

- status,

- och decision history.

Fas 5 — Stage definition

Fastställ:

- Stage 0,

- Stage 1,

- Stage 2,

- Stage 3,

- Stage 4,

- och Stage 5

med tydliga entry- och exitkriterier.

Fas 6 — Stage 1 scope

Lås den första användbara produktkedjan:

- onboarding,

- träningsprogram,

- kalender/vecka,

- aktivt pass,

- loggning,

- grundprogression,

- och Arnold.

Fas 7 — Stage 1 out-of-scope

Dokumentera uttryckligen vilka framtida funktioner som inte byggs ännu.

Fas 8 — Kritisk värdekedja

Modellera och testa:

Onboarding

→ program

→ pass

→ logg

→ återkoppling

→ nästa anpassning.

Fas 9 — Vertical slice 1

Implementera en tunn full kedja för en intern användare.

Fas 10 — Canonical data foundation

Implementera stabil identitet och versionering för:

- user,

- goal,

- program,

- workout,

- exercise,

- set result,

- och progression event.

Fas 11 — Arnold foundation

Implementera:

- agent identity,

- explain,

- recommend,

- prepare,

- capability calls,

- och tydliga begränsningar.

Fas 12 — Hermes boundary

Implementera:

- rätt användarscope,

- minimerad context package,

- provenance,

- och project isolation.

Fas 13 — Permissions foundation

Implementera:

- default deny,

- capability grants,

- approval för verkliga ändringar,

- och audit.

Fas 14 — Core observability

Implementera:

- logs,

- metrics,

- traces,

- operation identities,

- och user-flow verification.

Fas 15 — Repository workflow

Standardisera:

- clean base,

- worktree eller branch,

- implementation plan,

- commit,

- PR,

- review,

- merge,

- och post-merge verification.

Fas 16 — Definition of Ready och Done

Gör kriterierna obligatoriska för aktiva initiativ.

Fas 17 — Stage manifest

Implementera manifest för:

- levererat,

- tester,

- kontrakt,

- avvikelse,

- risk,

- och återstående arbete.

Fas 18 — Evidence packages

Skapa standardiserade evidenspaket för varje release och stage.

Fas 19 — Product discovery loop

Implementera:

- signal capture,

- interview notes,

- hypothesis,

- experiment,

- och decision.

Fas 20 — Prioritization model

Implementera en tydlig men rådgivande modell för:

- value,

- risk,

- learning,

- effort,

- confidence,

- och strategic fit.

Fas 21 — WIP control

Inför:

- WIP limits,

- protected focus,

- blocker ownership,

- och interrupt budget.

Fas 22 — Release maturity model

Implementera:

- internal,

- alpha,

- beta,

- canary,

- general availability,

- och verified.

Fas 23 — Feature flag governance

Implementera:

- owner,

- population,

- expiry,

- stop condition,

- och removal.

Fas 24 — Contract coverage

Koppla GP-kontrakt till:

- implementation,

- automated test,

- manual review,

- audit,

- eller product metric.

Fas 25 — Canonical deviation workflow

Implementera:

- deviation record,

- risk,

- owner,

- expiry,

- och revision proposal.

Fas 26 — Technical debt registry

Implementera:

- debt identity,

- reason,

- risk,

- owner,

- cost,

- och review date.

Fas 27 — Roadmap review cadence

Inför:

- veckovis operativ review,

- månadsvis produktreview,

- och strategisk stage-review.

Fas 28 — Atlas roadmap intelligence

Implementera minimerade inputs för:

- status,

- blockers,

- cost,

- contract coverage,

- user signals,

- och scenarios.

Fas 29 — Arnold feedback signals

Implementera strukturerade signaler för:

- user corrections,

- friction,

- rejected recommendations,

- och unmet needs.

Fas 30 — Stage 1 acceptance

Genomför full kontroll av:

- användarvärde,

- core flow,

- data,

- Arnold,

- permissions,

- drift,

- och kända begränsningar.

Fas 31 — Stage 2 planning

Planera adaptiv coachning först när Stage 1 har accepterats.

Fas 32 — Full roadmapgovernance

Implementera:

- portfolio visibility,

- capacity planning,

- budget,

- stage gates,

- release gates,

- canonical revision,

- och forbidden agent self-prioritization.

Varje fas ska levereras genom:

- definierat problem,

- avsett resultat,

- kontraktskoppling,

- explicit scope,

- separat branch eller worktree,

- implementation,

- relevanta tester,

- review,

- evidens,

- intern release eller canary,

- post-release-verifiering,

- och mänskligt beslut om nästa steg.

31.298 FRAMGÅNGSKRITERIER

Kapitel 31:s vision är framgångsrikt realiserad när:

- GainPilot har en tydlig stage-modell,

- Stage 1 har ett avgränsat värde,

- första produkten inte försöker göra allt,

- första produkten ändå använder rätt identiteter och gränser,

- kärnvärdekedjan är definierad,

- kärnvärdekedjan fungerar end-to-end,

- roadmapinitiativ börjar med problem,

- avsett utfall är verifierbart,

- målgrupp är tydlig,

- GP-kontrakt är kopplade,

- antaganden är synliga,

- antaganden kan testas,

- scope och out-of-scope är dokumenterade,

- scope creep upptäcks,

- initiativ har ägare,

- roadmapstatus är ärlig,

- capabilitymognad är ärlig,

- prototype inte kallas färdig produkt,

- released inte kallas verified,

- stageövergång kräver acceptans,

- Stage 1 fokuserar på core GainPilot,

- Arnold börjar med låg authority,

- Atlas används som intern intelligens,

- Hermes bevarar datagränser,

- låg risk-autonomi införs först efter evidens,

- Stage 2 bygger på Stage 1-resultat,

- nya träningsdomäner återanvänder kärnan,

- varje ny domän har riktig domänlogik,

- professionella flöden kommer efter fungerande individprodukt,

- plattformsexpansion sker efter mognad,

- produkt-, data-, intelligence-, governance-, drift-, commercial- och compliance-spår följs,

- ingen tvärgående risk glöms,

- vertical slices används,

- en tunn hel kedja prioriteras,

- teknisk roadmap stödjer produkten,

- modular monolith används innan onödig serviceuppdelning,

- teknisk skuld är synlig,

- temporära lösningar har ägare,

- canonical kunskap är strukturerad,

- källor, proofs, produktion och arkiv är separerade,

- inget meningsbärande material raderas före verifiering,

- repositoryarbete börjar från känd bas,

- orelaterade ändringar inte blandas,

- agentuppgifter har definierat scope,

- specialistresultat granskas,

- Atlas gör slutlig helhetskontroll utan att kringgå governance,

- mänsklig gate finns för kritiska steg,

- commits och PR:er är avgränsade,

- review omfattar relevanta dimensioner,

- merge och release skiljs,

- deployment är kontrollerad,

- feature flags har ägare,

- canary och stop conditions används,

- rollback eller compensation finns,

- modell-, prompt- och knowledge-releaser versioneras,

- contract coverage bygger på bevis,

- varje stage har manifest,

- evidenspaket skapas,

- Stage acceptance är explicit,

- budget och kapacitet följs,

- agentarbete inte överstiger reviewkapacitet,

- discovery sker före större build,

- användarsignaler struktureras,

- prioritetsbeslut väger värde, risk och effort,

- poängmodeller inte fattar autonoma beslut,

- roadmapen reviewas regelbundet,

- fokus skyddas,

- WIP begränsas,

- blockerare har ägare,

- svaga initiativ kan stoppas,

- sunk cost inte styr,

- lärande bevaras,

- releasepopulation ökas gradvis,

- general availability kräver mognad,

- post-release-effekt mäts,

- adoption skiljs från värde,

- roadmapdrift upptäcks,

- canonical avvikelser dokumenteras,

- avvikelser har expiry,

- permanent förändring skapar canonical revision,

- boken används som normativ källa,

- boken inte används som operativ tasklista,

- agenter får minimerade knowledge packages,

- kontrakt översätts till rätt bevistyp,

- Atlas sammanställer och rekommenderar,

- Arnold bidrar med användarsignaler,

- Hermes skyddar analysdata,

- produktägaren fattar slutbeslut,

- och varje initiativ går från signal till verifierad effekt genom en spårbar, testad och kontrollerad process.

31.299 SAMMANFATTNING

GainPilot har en stor vision.

Produkten ska på sikt kunna:

- förstå användaren,

- skapa tränings- och kostupplägg,

- anpassa planeringen,

- följa progression,

- samordna Arnold, Atlas och Hermes,

- stödja flera träningsformer,

- arbeta med coacher och organisationer,

- och fungera som en full intelligent domän inom Omnira.

Denna vision ska inte byggas i ett enda steg.

GainPilot ska börja med en liten men komplett kärna.

Den första versionen ska göra några få saker verkligt bra:

1. Förstå användarens grundläggande mål och nuläge.

2. Skapa ett begripligt träningsupplägg.

3. Visa dagens eller veckans pass.

4. Låta användaren genomföra och logga träningen.

5. Använda resultatet för grundläggande progression.

6. Låta Arnold förklara upplägget och hjälpa användaren vidare.

Denna kedja ska fungera från början till slut.

GainPilot ska inte först bygga:

- full marketplace,

- global organisationsplattform,

- avancerad agentorkestrering,

- alla träningsdomäner,

- eller obegränsad autonomi.

Sådana funktioner ska komma när den föregående produktnivån:

- skapar värde,

- är verifierad,

- och har tillräcklig teknisk och organisatorisk mognad.

Stage 1 ska därför vara:

Core GainPilot.

Stage 1 ska fokusera på:

- individuell användare,

- styrke- och hypertrofinära mål,

- grundläggande träningsplan,

- loggning,

- progression,

- och Arnold.

Arnold ska i början huvudsakligen:

- förklara,

- rekommendera,

- och förbereda.

Han ska inte automatiskt göra stora förändringar.

Atlas ska främst arbeta internt med:

- roadmap,

- kvalitet,

- risk,

- och affärsanalys.

Hermes ska säkerställa:

- rätt användare,

- rätt projekt,

- rätt minnesdomän,

- och minsta nödvändiga kontext.

Stage 1 ska vara tenantmedvetet men behöver inte erbjuda full organisationsprodukt.

Kostdelen kan börja begränsat.

Det är bättre att erbjuda:

- tydligt energimål,

- proteinmål,

- enkla måltidsprinciper,

- och säker grundplanering

än att skapa en stor men opålitlig kostplattform.

När kärnan fungerar kan Stage 2 göra GainPilot mer adaptivt.

Stage 2 kan införa:

- smart passflytt,

- övningssubstitution,

- djupare progression,

- återhämtningssignaler,

- veckosammanfattningar,

- och begränsad lågriskautonomi.

Arnold kan då få mandat att exempelvis:

- byta till ett tidigare godkänt övningsalternativ,

- eller flytta ett pass inom samma vecka.

Detta ska endast ske efter:

- tillräcklig historik,

- låg korrigeringsgrad,

- tydliga riskgränser,

- och användarens approval.

Stage 3 kan utöka träningsdomänerna.

CrossFit, calisthenics, löpning och andra områden ska inte bara få några nya övningar.

Varje domän behöver:

- egna mål,

- progression,

- periodisering,

- säkerhetsregler,

- tester,

- och innehåll.

De ska samtidigt återanvända GainPilots gemensamma kärna.

Stage 4 kan introducera:

- coacher,

- gym,

- team,

- och organisationer.

Dessa flöden ska bygga på stark:

- tenantisolering,

- individpermissions,

- ansvar,

- billing,

- och dataminimering.

Stage 5 kan utveckla GainPilot till bredare plattform med:

- API,

- licensiering,

- marketplace,

- fler språk,

- fler länder,

- och större multi-tenant-skala.

Plattformen ska komma efter produkten.

Roadmapen ska inte endast lista funktioner.

Varje initiativ ska beskriva:

- vilket problem som finns,

- vem som har problemet,

- vilket resultat GainPilot vill skapa,

- vilka kontrakt som berörs,

- vilka antaganden som görs,

- vilken risk som finns,

- och vilken evidens som krävs.

Ett initiativ ska inte heta:

Bygg kalender.

Det ska exempelvis heta:

Gör det möjligt för användaren att flytta ett träningspass inom samma vecka utan att förlora programmets belastningslogik eller skapa dubbla kalenderhändelser.

Detta ger:

- tydligt problem,

- tydligt resultat,

- och tydliga tester.

Roadmapen ska skilja mellan:

- idé,

- kandidat,

- godkänt initiativ,

- planerat arbete,

- aktiv implementation,

- validering,

- release,

- mätning,

- och avslut.

Capabilitymognad ska beskrivas separat.

En funktion kan vara:

- envisioned i boken,

- specified genom kontrakt,

- designed i arkitektur,

- prototyped i UI,

- implemented i kod,

- tested,

- production-ready,

- released,

- och slutligen verified.

Dessa statusar får inte blandas.

En snygg prototyp är inte en färdig produkt.

En mergad PR är inte en verifierad release.

En release är inte bevis på användarvärde.

GainPilot ska arbeta genom vertical slices.

En slice ska vara tillräckligt komplett för att skapa verkligt värde.

Exempel:

Första workout-slicen ska inte endast innehålla en snygg passida.

Den ska även ha:

- rätt programdata,

- rätt användarscope,

- setloggning,

- persistens,

- operation identity,

- återkoppling,

- och relevant observability.

Det är bättre att skapa ett enkelt pass som fungerar hela vägen än tio avancerade skärmar utan sammanhängande system.

Tekniken ska stödja produktroadmapen.

GainPilot ska börja modulärt.

Det behöver inte delas i många mikroservices från början.

Tjänster ska extraheras när det finns tydliga behov som:

- separat skalning,

- starkare säkerhetsisolering,

- eller självständig deployment.

Teknisk skuld ska vara synlig.

En tillfällig lösning kan vara legitim.

Den ska då dokumenteras med:

- varför den valdes,

- vilken risk den skapar,

- vem som äger den,

- och när den ska omprövas.

GainPilot ska samtidigt undvika att bygga ett perfekt internt system utan användare.

Roadmapen ska balansera:

- produktvärde,

- arkitektonisk kvalitet,

- säkerhet,

- lärande,

- och hastighet.

Repositoryarbetet ska vara kontrollerat.

Varje initiativ ska normalt använda:

- rätt baslinje,

- separat branch eller worktree,

- avgränsad implementation,

- tester,

- pull request,

- review,

- merge,

- release,

- och post-release-verifiering.

Orelaterade ändringar ska inte blandas.

Om arbetsytan redan är smutsig ska agenten inte:

- stagea,

- committa,

- eller städa bort material

utan uttryckligt beslut.

Agentdriven utveckling ska användas med tydliga roller.

Atlas kan säga:

Den här capabilityn ska implementeras.

Atlas kan därefter delegera till en specialistagent.

Specialistagenten använder de resurser som krävs inom scope.

Resultatet ska därefter gå genom relevant review.

Atlas gör sedan en slutlig helhetskontroll.

Mänsklig ägare behåller gate för:

- större scope,

- kritiska risker,

- merge,

- och deployment

tills annat uttryckligen beviljats.

GainPilot ska inte starta mer agentarbete än vad som kan granskas.

AI kan producera kod, dokument och förslag mycket snabbt.

Om reviewkapaciteten inte följer med skapas:

- dold skuld,

- motstridiga implementationer,

- osäkra förändringar,

- och falsk känsla av framsteg.

Framgång ska inte mätas i:

- antal filer,

- antal commits,

- antal kapitel,

- eller antal genererade funktioner.

Framgång ska mätas i:

- fungerande värdekedjor,

- verifierade kontrakt,

- användarvärde,

- säkerhet,

- stabilitet,

- och lärande.

Varje stage ska skapa ett evidenspaket.

Paketet ska kunna visa:

- vad som byggdes,

- vad som inte byggdes,

- vilka kontrakt som uppfylldes,

- vilka tester som genomfördes,

- vilka avvikelser som finns,

- vilken risk som kvarstår,

- och vilket nästa steg som rekommenderas.

Stageövergång ska vara ett uttryckligt beslut.

GainPilot ska inte gå vidare endast därför att roadmapen säger att ett kvartal är slut.

Nästa stage kan förberedas.

Det ska inte aktiveras fullt innan kritiska beroenden är verifierade.

Prioritering ska vara strukturerad.

Varje initiativ ska bedömas utifrån:

- användarvärde,

- strategisk passform,

- säkerhet,

- lärandevärde,

- reach,

- confidence,

- effort,

- beroenden,

- ekonomi,

- reversibilitet,

- och opportunity cost.

En poängmodell kan hjälpa.

Den ska inte fatta beslut automatiskt.

Atlas ska kunna säga:

Det här initiativet har hög potentiell intäkt men låg strategisk passform, stort compliancebehov och blockerar kärnprogrammets stabilisering. Rekommendationen är att vänta.

Produktägaren ska fatta beslutet.

Roadmapen ska skydda fokus.

GainPilot ska inte ändra riktning varje gång:

- en ny AI-modell lanseras,

- en konkurrent visar en funktion,

- en användare lämnar ett önskemål,

- eller en ny kommersiell idé uppstår.

Signalen ska samlas.

Den ska analyseras.

Arbete som redan är aktivt ska få rimlig möjlighet att slutföras.

Säkerhet, allvarlig drift, juridisk deadline eller betydande användarskada kan avbryta fokus.

Allt annat ska gå genom ordinarie prioritering.

GainPilot ska begränsa work in progress.

Det är bättre att:

- avsluta,

- verifiera,

- och mäta

än att starta många parallella områden.

Initiativ ska också kunna stoppas.

Om en pilot visar:

- lågt värde,

- hög risk,

- orimlig kostnad,

- eller fel målgrupp

ska GainPilot kunna avbryta.

Tidigare investering ska inte tvinga fortsatt arbete.

Lärandet ska bevaras.

Release ska ske gradvis.

En vanlig ordning kan vara:

1. Lokal utveckling.

2. Automatiska tester.

3. Preview eller staging.

4. Intern tenant.

5. Shadow mode.

6. Begränsad alpha.

7. Canary.

8. Beta.

9. Gradvis expansion.

10. General availability.

Alla funktioner behöver inte använda exakt varje steg.

Risknivån ska avgöra kontrollen.

Modell-, prompt- och knowledge-förändringar ska behandlas som releaser.

Arnold kan förändras betydligt även om ingen vanlig kod ändrats.

Därför ska GainPilot versionera:

- modell,

- systeminstruktion,

- capabilityschema,

- policy,

- och knowledge package.

Canonical böcker ska bevaras i en strukturerad kunskapsmodell.

Böckerna ska senare kunna kompileras till:

- agentinstruktioner,

- testchecklistor,

- policies,

- schemas,

- och implementation guidance.

Hela boken ska inte skickas till varje agent vid varje uppgift.

Agenten ska få:

- rätt kapitel,

- rätt kontrakt,

- rätt scope,

- och minsta nödvändiga sammanhang.

Kontrakten ska bevisas på olika sätt.

Ett kontrakt om idempotency kan få automatiskt test.

Ett kontrakt om begripligt språk kan kräva användartest.

Ett kontrakt om ansvar kan kräva review och dokumentation.

Ett kontrakt om långsiktigt användarvärde kräver produktmått.

Kontrakttäckning ska därför inte vara en enkel checkbox.

Avvikelser från boken ska vara möjliga.

De ska aldrig vara tysta.

En avvikelse ska beskriva:

- vilket kontrakt som berörs,

- varför,

- vilken risk som skapas,

- om avvikelsen är tillfällig,

- vem som äger den,

- och när den ska omprövas.

Om implementation visar att ett canonical kontrakt behöver ändras ska boken få en kontrollerad revision.

Kod ska inte tyst skriva om visionen.

Boken ska inte heller blockera förbättring när ny evidens finns.

Atlas ska fungera som GainPilots executive roadmap intelligence.

Atlas ska kunna:

- sammanställa stage-status,

- upptäcka blockerare,

- se kontraktsluckor,

- följa budget,

- analysera användarsignaler,

- jämföra scenarier,

- och rekommendera nästa prioritering.

Arnold ska bidra med signaler från användarupplevelsen:

- vad användaren inte förstår,

- vilka förslag som avvisas,

- vilka korrigeringar som görs,

- och var coachningen skapar friktion.

Hermes ska säkerställa att analysen använder:

- minimerad,

- tillåten,

- och projektspecifik data.

Atlas ska inte själv starta roadmaparbete.

Agenter ska kunna skapa förslag.

Produktägaren ska fatta beslut om:

- stage,

- scope,

- budget,

- riskacceptans,

- och lansering.

Alla roadmapförändringar ska därmed följa:

Signal

→ problem

→ användarevidens

→ kontraktskoppling

→ risk

→ beroenden

→ prioritering

→ mänskligt beslut

→ avgränsad implementation

→ tester

→ review

→ intern release eller shadow mode

→ canary

→ verifierad produktion

→ effektmätning

→ och uppdaterad roadmap.

Kapitel 31 etablerar därmed följande kärnprincip:

GainPilot ska inte byggas genom att maximera mängden funktion, kod eller AI-arbete. Produkten ska byggas genom en serie verifierade värdekedjor där varje stage löser ett verkligt problem, uppfyller tydliga kontrakt och skapar evidens för nästa steg. Visionen ska vara stor, men det aktiva scopet ska vara litet nog att slutföras. Atlas ska hjälpa GainPilot se helheten, specialistagenter ska genomföra avgränsade uppdrag och människor ska behålla ansvar för riktning, risk och lansering. GainPilot är färdigt för nästa stage först när det föregående inte bara har byggts — utan förståtts, testats och verifierats i verkligheten.
