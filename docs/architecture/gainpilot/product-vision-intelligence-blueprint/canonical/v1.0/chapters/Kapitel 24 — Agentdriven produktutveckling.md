# Kapitel 24 — Agentdriven produktutveckling

GainPilot ska kunna utvecklas med omfattande stöd från AI-agenter.

Agenter ska kunna hjälpa till med:

- produktanalys,

- arkitektur,

- research,

- implementation,

- kodgranskning,

- testning,

- dokumentation,

- migrationer,

- felsökning,

- incidentanalys,

- och uppföljning.

Agentdriven utveckling ska göra det möjligt att:

- arbeta snabbare,

- hantera en större kod- och kunskapsbas,

- hålla dokumentation och implementation närmare varandra,

- automatisera repetitiva kvalitetskontroller,

- och låta specialiserade agenter arbeta parallellt.

Detta betyder inte att GainPilot ska låta en generell agent förändra produkten fritt.

En agent som kan skriva kod kan också:

- missförstå domänen,

- ändra fel filer,

- skriva över användarens arbete,

- kringgå arkitekturgränser,

- skapa säkerhetsproblem,

- lägga till onödiga dependencies,

- generera stora kostnader,

- eller leverera en tekniskt fungerande men produktmässigt felaktig lösning.

En agent kan dessutom skapa övertygande rapporter om arbete som inte faktiskt har:

- testats,

- committats,

- pushats,

- deployats,

- eller verifierats i produktion.

GainPilot ska därför bygga agentdriven utveckling som ett styrt produktionssystem.

Den canonical utvecklingskedjan ska vara:

Observation

→ problemformulering

→ analys

→ förslag

→ beslut om scope

→ riskklassificering

→ arbetsmiljö

→ implementation

→ automatiska tester

→ specialistgranskning

→ pull request

→ review

→ mergebeslut

→ deployment

→ produktionsverifiering

→ effektuppföljning

→ dokumenterat lärande.

Varje steg ska ha en tydlig ansvarig.

En agent ska inte automatiskt få utföra nästa steg bara för att den utförde det föregående.

Exempel:

En analysagent kan identifiera att substitutionsmotorn skapar för många korrigeringar.

Det innebär inte att agenten automatiskt får:

- skriva om substitutionsalgoritmen,

- ändra träningsgrafen,

- uppdatera säkerhetsregler,

- och deploya till produktion.

Analysen ska först bli ett avgränsat förslag.

Förslaget ska bedömas för:

- användarvärde,

- domänpåverkan,

- säkerhet,

- integritet,

- teknisk risk,

- kostnad,

- och beroenden.

Därefter ska ett tydligt implementationsscope godkännas.

GainPilot ska kunna använda olika agentroller.

Exempel:

- Product Analysis Agent.

- Architecture Agent.

- Domain Expert Agent.

- Research Agent.

- Implementation Agent.

- Test Agent.

- Security Review Agent.

- Privacy Review Agent.

- Performance Agent.

- Documentation Agent.

- Migration Agent.

- Release Agent.

- Incident Analysis Agent.

- och Atlas som central samordnare.

Dessa roller ska inte vara kosmetiska namn för samma agent med obegränsad behörighet.

Varje agent ska ha:

- en stabil identitet,

- ett definierat ansvar,

- ett begränsat capabilityscope,

- tillåtna verktyg,

- förbjudna handlingar,

- en kostnadsbudget,

- och ett tydligt resultatformat.

Atlas ska kunna samordna agentdriven utveckling.

Atlas ska exempelvis kunna:

- identifiera ett problem,

- föreslå ett arbetsområde,

- skapa ett genomförandeförslag,

- välja lämpliga specialistagenter,

- följa status,

- samla resultat,

- och presentera ett beslut till GainPilot-ägaren.

Atlas ska inte automatiskt få:

- skapa branch,

- ändra kod,

- godkänna sin egen implementation,

- mergea sin egen pull request,

- och deploya till produktion

som en enda sammanhängande obegränsad handling.

Agentdriven utveckling ska använda samma grundprinciper som all annan GainPilot-governance:

- minsta nödvändiga behörighet,

- explicit scope,

- separerade roller,

- spårbarhet,

- återställningsbarhet,

- mänskligt ansvar,

- och säker standard vid osäkerhet.

Grundprincipen är:

GainPilot ska använda AI-agenter som specialiserade och kontrollerade produktionsresurser — inte som självständiga ägare av produkten. Agenter ska kunna analysera, föreslå, implementera och verifiera inom tydliga mandat, medan scope, arkitektur, säkerhet, merge, deployment och strategiskt ansvar förblir explicit styrda.

24.1 AGENTDRIVEN UTVECKLING SOM SYSTEM

Agentdriven utveckling ska behandlas som ett eget operativt system.

Systemet ska omfatta:

- uppgiftsintag,

- analys,

- agentval,

- kontextbyggnad,

- behörigheter,

- arbetsmiljö,

- kodändringar,

- tester,

- review,

- merge,

- deployment,

- och uppföljning.

Det räcker inte att ge en agent repositoryåtkomst och be den:

Förbättra GainPilot.

24.2 UTVECKLINGSAGENT

En utvecklingsagent är en agent som kan bidra till produkt- eller systemförändring.

Den kan arbeta med:

- kod,

- konfiguration,

- schema,

- policy,

- dokumentation,

- tester,

- infrastruktur,

- eller releaseartefakter.

Agenten ska vara registrerad i GainPilots agentkatalog.

24.3 DEN CANONICAL UTVECKLINGSUPPGIFTEN

Varje betydelsefull agentuppgift ska ha en canonical modell.

Modellen ska minst kunna representera:

- task_identity,

- initiating_actor,

- task_owner,

- repository_identity,

- project_identity,

- tenant_identity,

- approved_scope,

- excluded_scope,

- objective,

- acceptance_criteria,

- risk_class,

- affected_domains,

- affected_capabilities,

- allowed_files,

- prohibited_files,

- allowed_tools,

- prohibited_actions,

- branch_strategy,

- worktree_identity,

- starting_commit,

- budget,

- time_limit,

- test_requirements,

- review_requirements,

- delivery_format,

- stop_conditions,

- status,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

24.4 UPPGIFTSIDENTITET

Varje utvecklingsuppgift ska ha unik identitet.

Identiteten ska användas i:

- branches,

- worktrees,

- commits,

- pull requests,

- tester,

- agentloggar,

- kostnad,

- och Executive Intelligence.

24.5 UPPGIFTSÄGARE

Varje uppgift ska ha en identifierad ägare.

Ägaren ansvarar för att:

- scope är begripligt,

- acceptanskriterier är tillräckliga,

- beslut fattas vid konflikter,

- och leveransen faktiskt motsvarar behovet.

En agent får inte vara den enda ägaren av en kritisk uppgift.

24.6 PROBLEMFORMULERING

Före implementation ska problemet beskrivas.

En bra problemformulering ska ange:

- vad som inte fungerar,

- vem som påverkas,

- vilken evidens som finns,

- varför problemet är viktigt,

- och vad som inte ännu är känt.

En önskad lösning ska inte förväxlas med problemformuleringen.

24.7 LÖSNINGSHYPOTES

En uppgift kan innehålla en lösningshypotes.

Exempel:

Om substitutionsmotorn väger användarens tidigare godkända alternativ högre kan korrigeringsgraden minska.

Hypotesen ska kunna:

- testas,

- ändras,

- eller avvisas.

24.8 ACCEPTANSKRITERIER

Varje implementation ska ha tydliga acceptanskriterier.

Kriterierna kan omfatta:

- funktionellt beteende,

- domänregler,

- säkerhet,

- integritet,

- prestanda,

- tillgänglighet,

- testresultat,

- dokumentation,

- och migrationsstatus.

Formuleringen:

Det ska fungera bättre

är inte tillräcklig.

24.9 EXKLUDERAT SCOPE

Uppgiften ska ange vad som inte ingår.

Exempel:

Ingår:

- förbättrad ranking av tidigare godkända övningsbyten.

Ingår inte:

- ny träningsgraf,

- ändrad smärtpolicy,

- ny användarprofil,

- eller förändrad programgenerator.

Exkluderat scope skyddar mot okontrollerad expansion.

24.10 SCOPEEXPANSION

Om agenten upptäcker att uppgiften kräver arbete utanför scope ska den:

1. Stoppa det berörda arbetet.

2. Dokumentera behovet.

3. Beskriva konsekvensen.

4. Föreslå nytt scope.

5. Vänta på godkännande.

Agenten får inte tyst utöka uppgiften.

24.11 RISKKLASSIFICERING

Utvecklingsuppgifter ska riskklassificeras.

Exempel:

Låg risk:

- textändring,

- dokumentationsförtydligande,

- intern analysvy.

Medelrisk:

- nytt användarflöde,

- ändrad statistik,

- ny integration i read-only-läge.

Hög risk:

- programgenerator,

- substitutionsmotor,

- kostlogik,

- behörigheter,

- minnesåtkomst.

Kritisk risk:

- tenantisolering,

- medicinsk säkerhetsgräns,

- radering,

- autentisering,

- agentauthority,

- eller produktionens secrets.

24.12 RISKKLASSENS EFFEKT

Riskklassen ska påverka:

- tillåtna agenter,

- modellval,

- testkrav,

- antal granskare,

- deploymentstrategi,

- rollbackkrav,

- och mänsklig approval.

24.13 REVERSIBILITET

Uppgiften ska bedömas efter reversibilitet.

Exempel på hög reversibilitet:

- feature flag,

- begränsad intern dashboard,

- eller isolerad textförändring.

Exempel på låg reversibilitet:

- destruktiv datamigration,

- ändrad användardelning,

- eller permanent borttagning av data.

24.14 AGENTROLLER

GainPilot ska kunna använda flera utvecklingsagentroller.

Rollerna ska väljas efter uppgiftens behov.

Alla uppgifter behöver inte använda alla roller.

24.15 PRODUCT ANALYSIS AGENT

Product Analysis Agent ska kunna:

- analysera signaler,

- beskriva problem,

- identifiera berörda användarflöden,

- föreslå hypoteser,

- och definiera möjliga effektmått.

Agenten ska normalt inte skriva produktionskod.

24.16 ARCHITECTURE AGENT

Architecture Agent ska kunna:

- kartlägga berörda moduler,

- kontrollera bounded contexts,

- identifiera kontrakt,

- analysera beroenden,

- och föreslå en arkitektonisk lösning.

Agenten ska inte automatiskt godkänna sin egen arkitektur.

24.17 DOMAIN EXPERT AGENT

Domain Expert Agent ska granska om förslaget är korrekt inom:

- träning,

- kost,

- CrossFit,

- calisthenics,

- minne,

- analytics,

- eller annan GainPilot-domän.

En AI-baserad domänagent ska inte ersätta mänsklig expertis där risken kräver sådan.

24.18 RESEARCH AGENT

Research Agent ska kunna:

- söka källor,

- värdera evidens,

- sammanställa alternativ,

- och identifiera kunskapsluckor.

Research ska inte direkt bli implementation.

24.19 IMPLEMENTATION AGENT

Implementation Agent ska kunna:

- ändra kod,

- skapa tester,

- uppdatera konfiguration,

- och dokumentera implementationen

inom godkänt scope.

Agenten ska inte själv besluta att scope ska breddas.

24.20 TEST AGENT

Test Agent ska kunna:

- läsa acceptanskriterier,

- skapa testplan,

- köra tester,

- identifiera luckor,

- och rapportera reproducerbara fel.

Testagenten ska inte endast bekräfta att implementeringsagentens egna tester passerar.

24.21 SECURITY REVIEW AGENT

Security Review Agent ska kunna granska:

- autentisering,

- authorization,

- secrets,

- injection,

- dataexfiltration,

- tenantisolering,

- dependencies,

- och verktygsbehörigheter.

24.22 PRIVACY REVIEW AGENT

Privacy Review Agent ska kunna granska:

- dataminimering,

- ändamålsbegränsning,

- retention,

- radering,

- användarinsyn,

- delning,

- och modellrouting.

24.23 PERFORMANCE AGENT

Performance Agent ska kunna analysera:

- latency,

- minne,

- CPU,

- batteri,

- nätverk,

- databasfrågor,

- cache,

- och kostnad.

Prestandaoptimering får inte försvaga korrekthet eller säkerhet.

24.24 DOCUMENTATION AGENT

Documentation Agent ska kunna uppdatera:

- teknisk dokumentation,

- agentmanifest,

- kontrakt,

- ADR,

- release notes,

- och användardokumentation.

Dokumentationsagenten ska skilja mellan:

- canonical vision,

- implementation guidance,

- och faktisk implementerad funktion.

24.25 MIGRATION AGENT

Migration Agent ska kunna:

- skapa schemaförändringar,

- backfillplan,

- verifieringsfrågor,

- rollback- eller reparationsplan,

- och migrationsdokumentation.

Destruktiva migrationer ska kräva stark kontroll.

24.26 RELEASE AGENT

Release Agent ska kunna:

- verifiera build,

- sammanställa releaseartefakter,

- kontrollera migrationsstatus,

- hantera feature flags,

- och skapa deploymentförslag.

Agenten ska inte automatiskt deploya högriskförändringar utan mandat.

24.27 INCIDENT ANALYSIS AGENT

Incident Analysis Agent ska kunna:

- samla tidslinje,

- identifiera påverkade system,

- analysera möjliga orsaker,

- och föreslå korrigerande arbete.

Incidentanalys ska inte dölja osäkerhet.

24.28 ATLAS SOM UTVECKLINGSORKESTRERARE

Atlas ska kunna samordna utvecklingsagenter.

Atlas ska kunna:

- skapa arbetsplan,

- fördela uppgifter,

- följa beroenden,

- sammanställa resultat,

- och uppmärksamma beslutspunkter.

Atlas ska inte få kringgå repository- och mergegovernance.

24.29 MANAGERAGENT

En särskild manageragent kan hantera:

- agentkö,

- uppgiftsstatus,

- beroenden,

- tidsgränser,

- och leveranssammanställning.

Manageragenten ska inte automatiskt få skriva kod.

24.30 SPECIALISERING FÖRE GENERALISERING

GainPilot ska föredra rätt specialist för rätt uppgift.

En agent som är stark på kodgenerering är inte automatiskt stark på:

- träningsfysiologi,

- dataskydd,

- UX,

- eller incidentledning.

24.31 KOMPETENSREGISTER

Varje utvecklingsagent ska ha ett kompetensregister.

Det ska kunna visa:

- stödda tekniker,

- domäner,

- risknivåer,

- teststatus,

- modellversion,

- och kända begränsningar.

24.32 KOMPETENSKRAV

Uppgiften ska ange nödvändig kompetens.

Exempel:

En ändring i CrossFit-scaling kan kräva:

- GainPilot-arkitektur,

- CrossFit-domänmodell,

- substitutionsmotor,

- säkerhet,

- och relevant testkompetens.

24.33 KOMPETENSGAP

Om nödvändig kompetens saknas ska agenten:

- stoppa,

- redovisa luckan,

- och föreslå mänsklig eller annan specialistgranskning.

Den ska inte fylla luckan med självsäker generering.

24.34 AGENTVAL

Agentval ska baseras på:

- kompetens,

- risk,

- dataåtkomst,

- verktygsbehov,

- kostnad,

- latency,

- och tidigare kvalitet.

Lägsta kostnad ska inte alltid vinna.

24.35 MODELLVAL

Modell ska väljas efter uppgift.

Exempel:

- liten modell för klassificering,

- stark kodmodell för implementation,

- större analysmodell för arkitektur,

- och lokal modell för känslig information.

Modellvalet ska vara observerbart.

24.36 MODELLBYTE

Ett modellbyte ska behandlas som en förändring i utvecklingssystemet.

Det ska testas för:

- kodkvalitet,

- instruktionsefterlevnad,

- verktygsanvändning,

- säkerhet,

- kostnad,

- och hallucinerad statusrapportering.

24.37 REPOSITORYIDENTITET

Varje uppgift ska ange exakt repository.

Agenten ska verifiera:

- repository path,

- remote,

- aktuell branch,

- och projektidentitet.

Ett liknande mappnamn är inte tillräckligt.

24.38 ARBETSMILJÖ

Utveckling ska ske i:

- rätt repository,

- rätt branch,

- rätt worktree,

- rätt miljö,

- och rätt dependencyversion.

Agenten ska redovisa arbetsmiljön före betydelsefull förändring.

24.39 REN ARBETSYTA

Före implementation ska agenten kontrollera:

- git status,

- branch,

- upstream,

- HEAD,

- orelaterade ändringar,

- och eventuell divergence.

En oren arbetsyta är inte automatiskt ett stopp för all läsande analys.

Den är däremot ett stopp för okontrollerad staging och commit.

24.40 ORELATERADE ÄNDRINGAR

Agenten ska skydda orelaterade användarändringar.

Den får inte:

- stagea dem,

- ändra dem,

- flytta dem,

- återställa dem,

- eller radera dem

utan uttryckligt mandat.

24.41 SEPARAT BRANCH

Varje normal produktförändring ska ske på separat branch.

Branchens namn ska koppla till:

- uppgift,

- feature,

- fix,

- dokumentation,

- eller incident.

24.42 WORKTREE

Parallellt arbete bör använda separata worktrees eller motsvarande isolering.

Det minskar risken för:

- filkonflikt,

- oavsiktlig staging,

- och sammanblandade commits.

24.43 STARTCOMMIT

Uppgiften ska registrera startcommit.

Det gör det möjligt att:

- verifiera diff,

- förstå nya upstreamändringar,

- och reproducera arbetet.

24.44 UPSTREAM

Agenten ska kontrollera:

- vilken branch som är upstream,

- om branchen är före eller efter,

- och om remote har förändrats.

Den ska inte anta att lokal main är aktuell.

24.45 UPPDATERING AV BAS

Om basbranchen behöver uppdateras ska agenten följa definierad strategi.

Exempel:

- merge,

- rebase,

- eller ny branch från aktuell main.

Agenten ska inte välja metod utan hänsyn till repositorypolicy.

24.46 INGEN DIREKT MAIN

Vanlig utveckling får inte ske direkt i main.

Akut incidentarbete kan ha en särskild process.

Även då ska:

- ändringen minimeras,

- dokumenteras,

- granskas i efterhand,

- och kopplas till incidenten.

24.47 FILSCOPE

Uppgiften ska kunna ange tillåtna filer eller mappar.

Agenten ska flagga om ändringar utanför området krävs.

24.48 GENERATED FILES

Genererade filer ska hanteras enligt repositorypolicy.

Agenten ska förstå om en fil:

- ska ändras manuellt,

- byggas från källa,

- eller inte committas.

24.49 BINARY FILES

Binära filer ska inte ändras utan behov.

Agenten ska kunna redovisa:

- källa,

- format,

- och reproduktionsmetod.

24.50 DEPENDENCIES

Nya dependencies ska kräva motivering.

Motiveringen ska omfatta:

- behov,

- alternativ,

- licens,

- säkerhet,

- underhåll,

- storlek,

- och leverantörsrisk.

24.51 INGEN DEPENDENCY AV BEKVÄMLIGHET

Agenten ska inte lägga till ett stort paket för en liten funktion om:

- standardbibliotek,

- befintlig dependency,

- eller enkel intern lösning

är tillräcklig.

24.52 LOCKFILES

Lockfiles ska uppdateras kontrollerat.

Agenten ska undvika att skapa stora orelaterade dependencyförändringar.

24.53 SUPPLY CHAIN

Agentdriven utveckling ska skydda försörjningskedjan.

Det omfattar:

- paket,

- actions,

- containers,

- binaries,

- modeller,

- kodgeneratorer,

- och externa scripts.

24.54 EXTERNA SCRIPTS

Agenten får inte köra godtyckliga externa scripts utan:

- granskning,

- källa,

- och rätt mandat.

24.55 SECRETS

Agenter får inte läsa eller exponera secrets om uppgiften kan utföras utan dem.

Secrets ska användas indirekt genom godkända verktyg.

24.56 MILJÖVARIABLER

Agenten ska inte skriva:

- tokens,

- lösenord,

- eller produktionsvärden

i kod, logg, dokumentation eller testfixtures.

24.57 PRODUKTIONSDATA

Utvecklingsagenter ska normalt inte använda full produktionsdata.

Felsökning ska i första hand använda:

- syntetiska data,

- anonymiserade exempel,

- reproducerbara fixtures,

- och minimerad incidentkontext.

24.58 KÄNSLIG FELSÖKNING

När känslig data krävs ska åtkomsten vara:

- tidsbegränsad,

- ärendebunden,

- auditerad,

- och minimerad.

24.59 KONTEXTPAKET FÖR KODAGENT

Kodagenten ska få ett uppgiftsspecifikt kontextpaket.

Paketet kan innehålla:

- berörda kontrakt,

- relevanta filer,

- repositorypolicy,

- acceptanskriterier,

- testkommandon,

- och kända begränsningar.

Agenten behöver inte läsa hela Omnira.

24.60 KONTEXTBUDGET

Varje utvecklingsuppgift ska ha en kontextbudget.

Budgeten kan begränsa:

- antal filer,

- dokument,

- tokens,

- retrievalsteg,

- och verktygsanrop.

Budgeten ska kunna utökas genom motiverat beslut.

24.61 KODGRAF

GainPilot kan använda kodgraf, repositoryindex eller Graphify-liknande verktyg.

De kan hjälpa agenten förstå:

- moduler,

- beroenden,

- referenser,

- och påverkan

utan att läsa hela kodbasen.

24.62 KODGRAF ÄR INTE KÄLLKOD

Kodgrafen kan vara:

- ofullständig,

- föråldrad,

- eller felindexerad.

Kritiska påståenden ska verifieras mot faktisk kod.

24.63 CANONICAL KUNSKAP

Utvecklingsagenten ska kunna få relevant canonical kunskap från:

- GainPilot-boken,

- Omnira-böcker,

- kontraktsregister,

- ADR,

- policies,

- och testkrav.

Kunskapens status ska vara tydlig.

24.64 KUNSKAPSPRIORITET

Vid konflikt ska agenten prioritera:

1. Aktiva säkerhets- och systempolicies.

2. Godkända canonical kontrakt.

3. Aktuell implementation och schema.

4. Godkända ADR.

5. Implementation guidance.

6. Arbetsutkast.

Konflikten ska rapporteras.

24.65 BOKEN OCH KODEN

Den canonical boken ska styra arkitekturriktning.

Den ska inte användas som bevis för att en funktion redan finns.

Agenten ska verifiera implementationen.

24.66 DOKUMENTATIONSDRIFT

Om kod och canonical dokumentation skiljer sig ska agenten:

- identifiera drift,

- beskriva vilken källa som är aktuell,

- och föreslå korrigering.

Den ska inte tyst välja det enklaste alternativet.

24.67 PLAN FÖRE ÄNDRING

Vid medel-, hög- och kritisk risk ska agenten normalt skapa en kort implementationsplan före kodändring.

Planen ska visa:

- berörda filer,

- arkitektur,

- teststrategi,

- risker,

- och rollback.

24.68 PLANEN ÄR INTE OÅTERKALLELIG

Agenten får justera planen när faktisk kod visar nya förhållanden.

Ändringen ska dokumenteras om den påverkar scope eller risk.

24.69 MINSTA NÖDVÄNDIGA ÄNDRING

Agenten ska föredra minsta förändring som uppfyller acceptanskriterierna.

Detta minskar:

- regressionsrisk,

- reviewkostnad,

- och rollbackkomplexitet.

24.70 INGEN KOSMETISK ÖVERARKITEKTUR

Agenten ska inte:

- skapa abstraktioner utan behov,

- dela upp enkla moduler i många tjänster,

- eller införa komplexitet för att lösningen ska verka avancerad.

24.71 DOMÄNLOGIK

Domänlogik ska ligga i rätt GainPilot-modul.

Den ska inte döljas i:

- UI-komponenter,

- prompts,

- databastriggers,

- eller integrationskod

om den behöver vara canonical och testbar.

24.72 PROMPTLOGIK

Promptar får stödja agentbeteende.

Kritisk affärs-, säkerhets- eller behörighetslogik ska inte endast finnas i prompttext.

24.73 STRUKTURERADE KONTRAKT

Agentutdata som ska styra kod eller systemåtgärd ska där möjligt vara strukturerade.

Exempel:

- schema,

- diffplan,

- testresultat,

- riskrapport,

- eller release manifest.

24.74 KODKVALITET

Agentgenererad kod ska följa samma eller högre krav som mänskligt skriven kod.

Den ska vara:

- begriplig,

- testbar,

- underhållbar,

- typad där relevant,

- och anpassad till repositoryts stil.

24.75 INGA PÅHITTADE API:ER

Agenten ska verifiera:

- biblioteksversion,

- API,

- funktioner,

- och interna interfaces

mot faktisk kod eller officiell dokumentation.

Den får inte anta att ett sannolikt API finns.

24.76 FELHANTERING

Agenten ska implementera felhantering efter risk.

Den ska inte:

- svälja fel,

- returnera falsk framgång,

- eller ersätta okända utfall med godtyckligt standardvärde.

24.77 OBSERVABILITY I NY KOD

Ny betydelsefull funktion ska ha proportionerlig:

- loggning,

- metrics,

- tracing,

- och audit

utan onödig känslig data.

24.78 IDEMPOTENS

Nya workflows och integrationsoperationer ska bedömas för idempotens.

Retries får inte skapa:

- dubbla program,

- dubbla träningsresultat,

- dubbla meddelanden,

- eller dubbla kostnader.

24.79 MIGRATIONER

Datamigrationer ska vara:

- versionerade,

- testade,

- återstartbara,

- och observerbara.

Agenten ska inte anta att migrationen alltid körs exakt en gång.

24.80 BACKFILL

Backfill ska ha:

- scope,

- batchstrategi,

- checkpoint,

- kostnadsbedömning,

- och verifiering.

Backfill får inte låsa kritiska användarflöden utan plan.

24.81 DESTRUKTIV ÄNDRING

Destruktiva ändringar ska kräva:

- backup eller export,

- verifierad påverkan,

- approval,

- och återställnings- eller reparationsplan.

24.82 DATAKORRIGERING

Agenten ska inte ändra användardata direkt genom ad hoc-script utan:

- identifierad incident eller uppgift,

- audit,

- preview,

- och verifiering.

24.83 FEATURE FLAGS

Nya funktioner kan skyddas av feature flags.

Flaggen ska ha:

- ägare,

- målgrupp,

- riskklass,

- startdatum,

- slutdatum,

- och borttagningsplan.

24.84 FLAGGSKULD

Agenten ska inte lämna gamla flags utan:

- uppföljning,

- dokumentation,

- och borttagning.

24.85 TESTSTRATEGI

Teststrategin ska följa risk och domän.

Den kan omfatta:

- enhetstest,

- kontraktstest,

- integrationstest,

- end-to-end-test,

- säkerhetstest,

- integritetstest,

- migrationstest,

- prestandatest,

- och manuellt scenario.

24.86 TEST FÖRE FÄRDIGRAPPORT

Agenten får inte rapportera uppgiften som färdig innan obligatoriska tester har:

- körts,

- avslutats,

- och dokumenterats.

24.87 TESTRESULTAT

Testresultat ska ange:

- kommando,

- miljö,

- resultat,

- antal tester,

- fel,

- skips,

- och eventuella begränsningar.

24.88 INGEN DOLD TESTSKIP

Agenten ska redovisa:

- hoppade tester,

- otillgängliga testmiljöer,

- och tester som inte kunde köras.

Den får inte beskriva testsviten som fullständigt godkänd om kritiska tester saknas.

24.89 ENHETSTESTER

Enhetstester ska verifiera isolerad logik.

De är inte tillräckliga för:

- tenantisolering,

- integrationer,

- migrationsflöden,

- eller full användarupplevelse.

24.90 KONTRAKTSTESTER

Kontraktstester ska verifiera:

- schema,

- version,

- behörighet,

- fel,

- och kompatibilitet

mellan GainPilot och andra system.

24.91 DOMÄNTESTER

Domäntester ska kontrollera verklig betydelse.

Exempel:

Ett övningsbyte ska inte bara ha rätt JSON-form.

Det ska:

- bevara träningsfunktion,

- följa begränsningar,

- och ge rätt progressionspåverkan.

24.92 SÄKERHETSTESTER

Säkerhetstester ska anpassas efter förändringen.

De kan omfatta:

- authorization,

- injection,

- secret exposure,

- tenant leakage,

- file handling,

- webhook validation,

- och agent tool abuse.

24.93 INTEGRITETSTESTER

Integritetstester kan omfatta:

- minimering,

- retention,

- radering,

- do-not-share,

- extern modellrouting,

- och loggning.

24.94 MIGRATIONSTESTER

Migrationer ska testas för:

- tom databas,

- realistisk datamängd,

- äldre version,

- avbrott,

- omkörning,

- och verifiering.

24.95 PRESTANDATEST

Prestandatest ska användas när förändringen kan påverka:

- aktivt pass,

- stora databasmängder,

- mobilbatteri,

- modellkostnad,

- eller skalning.

24.96 SNAPSHOT- OCH GOLDEN-TESTER

Snapshot eller golden tests kan användas där de ger värde.

De får inte accepteras blint efter stora agentgenererade diffar.

24.97 TESTDATA

Testdata ska vara:

- syntetisk,

- anonymiserad,

- eller särskilt godkänd.

Personuppgifter ska inte kopieras till fixtures av bekvämlighet.

24.98 TESTOBEROENDE

När risken är hög ska någon annan än implementeringsagenten granska eller skapa centrala tester.

Det minskar risken att samma missförstånd finns i både kod och test.

24.99 ADVERSARIAL REVIEW

Högriskförändringar ska kunna granskas genom adversarial review.

Granskaren ska aktivt försöka hitta:

- missade edge cases,

- policygenvägar,

- scopebrott,

- och felaktiga antaganden.

24.100 CODE REVIEW AGENT

En Code Review Agent ska kunna granska:

- korrekthet,

- begriplighet,

- arkitektur,

- testtäckning,

- och diffens fokus.

Agenten ska inte själv mergea efter sin review om policyn kräver separation.

24.101 REVIEWKOMMENTARER

Reviewkommentarer ska klassificeras som:

- blocker,

- required,

- suggestion,

- question,

- eller note.

Det ska vara tydligt vad som måste lösas.

24.102 REVIEWRESOLUTION

Agenten ska svara på kommentarer genom:

- kodändring,

- förklaring,

- eller motiverat avvisande.

Den ska inte markera kommentarer lösta utan faktisk behandling.

24.103 MÄNSKLIG REVIEW

Mänsklig review ska krävas för vissa riskklasser.

Exempel:

- säkerhet,

- användardata,

- kostlogik,

- medicinska gränser,

- agentauthority,

- och kritiska migrationer.

24.104 DOMÄNREVIEW

Kod som förändrar tränings- eller kostbeteende ska kunna kräva domänreview.

Teknisk review räcker inte alltid.

24.105 FYRAÖGONSPRINCIP

Kritiska förändringar ska kräva minst två oberoende kontrollroller.

Samma agent eller människa ska inte ensam:

- föreslå,

- implementera,

- granska,

- godkänna,

- och deploya.

24.106 PULL REQUEST

Alla normala produktförändringar ska levereras genom pull request.

PR:n ska minst innehålla:

- problem,

- scope,

- ändringar,

- testresultat,

- risk,

- migration,

- screenshots eller bevis där relevant,

- och rollback.

24.107 PR-STORLEK

Pull requests ska vara så små som praktiskt möjligt.

En agent ska inte samla många orelaterade förbättringar i samma PR.

24.108 PR-TITEL

PR-titeln ska beskriva förändringen.

Den ska inte använda vaga formuleringar som:

Update app

eller:

Improve system.

24.109 PR-BESKRIVNING

PR-beskrivningen ska skilja mellan:

- vad som ändrats,

- varför,

- vad som inte ändrats,

- och hur det verifierats.

24.110 BEVIS

Vid UI-, integration- eller driftförändring kan PR:n behöva:

- screenshots,

- loggutdrag,

- testreport,

- queryresultat,

- eller previewlänk.

Beviset ska motsvara verkligt tillstånd.

24.111 AUTOMATISKA CHECKS

PR:n ska kunna kräva automatiska checks som:

- lint,

- typecheck,

- unit tests,

- integration tests,

- security scan,

- migration validation,

- och build.

24.112 CHECKSTATUS

Agenten ska verifiera faktisk checkstatus.

Den får inte anta att checks passerat för att lokala tester gjorde det.

24.113 BRANCH PROTECTION

Main ska skyddas genom repositorypolicy.

Skydd kan omfatta:

- PR-krav,

- status checks,

- reviews,

- signed commits,

- och begränsad mergebehörighet.

24.114 MERGEBESLUT

Merge är ett separat beslut.

En färdig implementation innebär inte automatiskt rätt att mergea.

24.115 MERGESTRATEGI

Repositoryt ska definiera tillåtna strategier som:

- squash,

- merge commit,

- eller rebase merge.

Agenten ska följa policyn.

24.116 INGEN MERGE MED OKÄNT TILLSTÅND

Merge ska inte ske när:

- checks pågår,

- konflikter finns,

- required review saknas,

- scope är oklart,

- eller repositorystatus är osäker.

24.117 COMMITKVALITET

Commits ska vara:

- fokuserade,

- begripliga,

- och fria från orelaterade filer.

Commitmeddelanden ska beskriva verklig förändring.

24.118 INGEN FALSK COMMITRAPPORT

Agenten ska inte säga:

Committed and pushed

utan att ha verifierat:

- commit identity,

- branch,

- remote,

- och pushstatus.

24.119 PUSH

Push ska ske till rätt remote och branch.

Agenten ska inte exponera secrets eller privata filer i remotehistorik.

24.120 PR-SKAPANDE

Om agenten har mandat att skapa PR ska den:

- verifiera branch,

- push,

- base,

- title,

- body,

- och checks.

Den ska inte skapa flera dubblett-PR:er vid retry.

24.121 IDEMPOTENT PR-FLÖDE

PR-skapande ska använda:

- branchidentitet,

- task identity,

- och befintlig PR-kontroll.

Unknown outcome ska verifieras.

24.122 REVIEWSTATUS

Agenten ska skilja mellan:

- PR skapad,

- checks passerade,

- review godkänd,

- mergebar,

- mergad,

- och deployad.

Dessa är olika tillstånd.

24.123 MERGE ÄR INTE DEPLOYMENT

En mergad PR behöver inte vara i produktion.

Agenten ska inte beskriva funktionen som live utan deploymentbevis.

24.124 DEPLOYMENTPLAN

Förändringar som ska deployas ska ha plan för:

- miljö,

- migrationsordning,

- feature flags,

- health checks,

- rollback,

- och kommunikation.

24.125 PREVIEW

Preview-miljö ska kunna användas för:

- UI,

- integrationsflöden,

- och användartest.

Preview ska vara isolerad från produktion.

24.126 STAGING

Staging ska så långt möjligt spegla produktion utan att använda oskyddad produktionsdata.

24.127 CANARY

Högre riskförändringar ska kunna lanseras genom canary.

Canary ska ha:

- målgrupp,

- mätvärden,

- stoppregel,

- och rollback.

24.128 FEATURE FLAG-UTRULLNING

Feature flags ska kunna begränsa lansering efter:

- tenant,

- användargrupp,

- plattform,

- eller capability.

24.129 DEPLOYMENTAPPROVAL

Högriskdeployment ska kräva separat approval.

Att PR:n är godkänd är inte alltid tillräckligt.

24.130 MIGRATIONSORDNING

Vid schemaförändring ska deploymentplanen ange:

- schema först eller kod först,

- kompatibilitetsperiod,

- backfill,

- och cleanup.

24.131 EXPAND AND CONTRACT

Breaking schemaändringar bör där det är möjligt använda:

1. Expand.

2. Dubbelkompatibilitet.

3. Migrera.

4. Verifiera.

5. Contract.

Agenten ska inte ta bort gamla fält innan konsumenterna migrerat.

24.132 PRODUKTIONSVERIFIERING

Efter deployment ska systemet verifiera:

- health,

- centrala användarflöden,

- logs,

- metrics,

- migrationsstatus,

- och feature flag-status.

24.133 SMOKE TEST

Smoke tests ska köras mot relevant miljö.

De ska verifiera de viktigaste funktionerna utan att skapa skadlig produktionsdata.

24.134 SYNTHETIC MONITORING

Kritiska flöden kan använda syntetisk övervakning.

Testkonton ska vara tydligt separerade från riktiga användare.

24.135 USER IMPACT

Efter release ska GainPilot följa:

- användarproblem,

- korrigeringar,

- support,

- säkerhet,

- och skyddsmått.

24.136 ROLLBACKTRIGGER

Rollback ska kunna utlösas av:

- säkerhetsproblem,

- tenantproblem,

- dataförlust,

- stor funktionsregression,

- eller definierade canarymått.

24.137 ROLLBACK

Rollback kan omfatta:

- kod,

- flagg,

- modell,

- prompt,

- policy,

- eller integration.

Datamigrationer kan kräva framåtriktad reparation.

24.138 STOPP FÖRE AUTOMATISK ROLLBACK

Automatisk rollback ska inte användas blint om den kan:

- skapa ytterligare dataförlust,

- återinföra känd säkerhetsrisk,

- eller göra schema inkompatibelt.

24.139 HOTFIX

Hotfix ska ha:

- incidentreferens,

- minsta möjliga scope,

- test,

- review där möjligt,

- och efterföljande normalisering.

24.140 EFTERGRANSKNING

En akut ändring ska följas av:

- full review,

- dokumentation,

- testkomplettering,

- och beslut om permanent lösning.

24.141 RELEASE NOTES

Betydelsefulla releaser ska ha release notes.

De ska skilja mellan:

- användarsynlig förändring,

- intern teknik,

- migration,

- känd begränsning,

- och rollbackstatus.

24.142 CHANGELOG

GainPilot ska ha versionsstyrd changelog.

Agenten ska inte lägga till generiska eller duplicerade poster.

24.143 DOKUMENTATIONSUPPDATERING

Implementation ska uppdatera relevant:

- teknisk dokumentation,

- API-kontrakt,

- agentmanifest,

- testplan,

- och användarhjälp.

24.144 CANONICAL BOKUPPDATERING

Vanliga implementationer ska inte automatiskt skriva om den canonical boken.

När förändringen innebär en verklig arkitektur- eller produktvisionsändring ska en separat bokrevision föreslås.

24.145 ADR

Betydelsefulla tekniska val ska dokumenteras som Architecture Decision Record.

ADR ska ange:

- kontext,

- alternativ,

- beslut,

- konsekvenser,

- status,

- och canonical relation.

24.146 KUNSKAPSKOMPILERING

Godkända förändringar ska kunna uppdatera:

- kodgraf,

- Intelligence Graph,

- kontraktsregister,

- agentkunskap,

- och repositoryindex.

Uppdateringen ska ske efter verifierad merge.

24.147 INDEXFÄRSKHET

Kod- och kunskapsindex ska märkas med:

- commit,

- byggtid,

- och scope.

Agenten ska veta om indexet är äldre än branchen.

24.148 INGEN INDEXSTYRD FALSK SANNING

Ett gammalt index får inte användas för att hävda att:

- en fil saknas,

- en funktion finns,

- eller ett kontrakt är implementerat

utan verifiering.

24.149 UPPFÖLJNING

Varje betydelsefull förändring ska ha:

- effektmått,

- reviewdatum,

- och ansvarig.

Uppgiften är inte helt avslutad vid merge.

24.150 PRODUKTRESULTAT

GainPilot ska skilja mellan:

- teknisk leverans,

- produktionsleverans,

- och verifierad produktnytta.

Alla tre kan ha olika status.

24.151 TEKNISKT FÄRDIG

Tekniskt färdig kan innebära:

- implementation klar,

- lokala tester godkända,

- och PR skapad.

Det betyder inte:

- mergad,

- deployad,

- eller användarvaliderad.

24.152 PRODUKTIONSFÄRDIG

Produktionsfärdig kan innebära:

- merge,

- deployment,

- migration,

- och smoke tests

är klara.

Det betyder inte automatiskt att affärs- eller användareffekten är bekräftad.

24.153 VALIDERAD

Validerad innebär att:

- den avsedda effekten,

- skyddsmåtten,

- och verklig produktfunktion

har följts upp tillräckligt.

24.154 AGENTRAPPORTERING

Agenten ska rapportera tillstånd exakt.

Tillåtna formuleringar ska motsvara verkligheten.

Exempel:

- Analys slutförd, inga filer ändrade.

- Ändringar gjorda men inte testade.

- Tester passerade lokalt.

- Commit skapad men inte pushad.

- Branch pushad, PR saknas.

- PR skapad, checks pågår.

- PR mergad, deployment ej verifierad.

- Deployment verifierad i staging.

- Produktion verifierad genom smoke tests.

24.155 FÖRBJUDEN FÄRDIGFORMULERING

Agenten ska inte säga:

Klart

när avgörande steg saknas.

Den ska beskriva exakt vad som återstår.

24.156 EVIDENCE-BASED STATUS

Status ska stödjas av bevis som:

- git status,

- commit hash,

- testoutput,

- PR-status,

- deploymentstatus,

- eller verifierade metrics.

24.157 INGEN HALLUCINERAD VERKTYGSANVÄNDNING

Agenten får inte påstå att den:

- läst en fil,

- kört ett test,

- skapat en PR,

- eller verifierat produktion

om verktyget inte faktiskt utförde handlingen.

24.158 FEL OCH BEGRÄNSNINGAR

Agenten ska redovisa:

- verktygsfel,

- behörighetsproblem,

- saknad miljö,

- otillgängliga testsystem,

- och osäkerhet.

24.159 STOPPREGEL

Agenten ska stoppa när den upptäcker:

- fel repository,

- fel branch,

- kritisk scopekonflikt,

- orelaterad destruktiv förändring,

- saknad behörighet,

- secret risk,

- eller okänd produktionspåverkan.

24.160 SÄKER FRÅGA

När ett beslut krävs ska agenten ställa en avgränsad fråga.

Exempel:

Arbetsytan innehåller tre orelaterade ändringar. Jag kan fortsätta med läsande audit men inte stagea eller committa. Ska uppgiften flyttas till en separat worktree?

24.161 INTE ONÖDIGA FRÅGOR

Agenten ska inte fråga om sådant som kan lösas genom:

- repositorypolicy,

- befintligt scope,

- canonical kontrakt,

- eller säker standard.

Governance ska inte skapa onödig friktion.

24.162 PARALLELLT AGENTARBETE

Flera agenter ska kunna arbeta parallellt.

Exempel:

- Architecture Agent kartlägger lösningen.

- Test Agent förbereder scenarier.

- Security Agent granskar hotmodell.

- Implementation Agent arbetar i egen worktree.

Arbetet ska samordnas genom tydliga beroenden.

24.163 FILÄGARSKAP

Parallella agenter ska kunna ha temporärt fil- eller modulscope.

Detta minskar konflikt.

24.164 INTEGRATIONSAGENT

En särskild integrationsagent kan sammanföra flera agenters leveranser.

Den ska:

- kontrollera kontrakt,

- lösa konflikter,

- och köra full testsvit.

Den ska inte automatiskt välja mellan motstridiga domänbeslut.

24.165 KONFLIKT MELLAN AGENTER

När agenter föreslår olika lösningar ska systemet jämföra:

- antaganden,

- risk,

- kostnad,

- canonical kompatibilitet,

- och testbarhet.

Atlas eller mänsklig ägare ska välja rätt beslutsnivå.

24.166 GEMENSAM ARBETSYTA

Flera agenter ska inte skriva samtidigt i samma arbetsyta utan samordning.

Det ökar risken för:

- otydlig diff,

- överskrivning,

- och felaktig attribution.

24.167 LÅSNING

Teknisk eller operativ låsning kan användas för:

- migration,

- release,

- eller känslig modul.

Lås ska ha ägare och timeout.

24.168 AGENTKÖ

Agentuppgifter ska kunna köas.

Kön ska ta hänsyn till:

- prioritet,

- beroenden,

- kostnad,

- risk,

- och tillgänglig kompetens.

24.169 PRIORITET

Akuta säkerhets- eller produktionsproblem kan prioriteras före roadmaparbete.

Agenten ska inte själv höja en uppgift till kritisk utan evidens.

24.170 WIP-BEGRÄNSNING

GainPilot ska begränsa antal samtidiga agentuppgifter.

Fler agenter skapar inte alltid högre leveransförmåga.

24.171 BUDGET

Varje agentuppgift ska ha budget.

Budgeten kan omfatta:

- tokens,

- modellkostnad,

- verktygsanrop,

- CI-minuter,

- previewmiljö,

- och extern research.

24.172 KOSTNADSSTOPP

När budgeten nås ska agenten:

- stoppa,

- sammanfatta status,

- och begära utökning

om det krävs.

24.173 INGEN BUDGETKRINGGÅNG

Agenten får inte dela upp uppgiften i många underuppgifter för att kringgå budget.

24.174 TIDSBEGRÄNSNING

Uppgifter ska kunna ha:

- timeout,

- deadline,

- och reviewpunkt.

Långa agentkörningar ska skapa checkpoints.

24.175 CHECKPOINT

Agenten ska kunna spara:

- plan,

- ändringar,

- teststatus,

- öppna frågor,

- och nästa steg

så att arbetet kan återupptas säkert.

24.176 ÅTERUPPTAGNING

När en uppgift återupptas ska agenten verifiera:

- repositorystatus,

- branch,

- nya upstreamändringar,

- teststatus,

- och att mandatet fortfarande gäller.

24.177 UTGÅNGET MANDAT

En gammal agentuppgift ska inte återupptas om:

- scope har löpt ut,

- branchen ersatts,

- eller policyn ändrats

utan ny kontroll.

24.178 CANCEL

En utvecklingsuppgift ska kunna avbrytas.

Systemet ska då:

- stoppa nya åtgärder,

- bevara arbetsresultat,

- märka branchen,

- och ange om cleanup krävs.

24.179 CLEANUP

Tillfälliga:

- branches,

- worktrees,

- previewmiljöer,

- feature flags,

- och testresurser

ska ha cleanup-plan.

24.180 INGEN AUTOMATISK RADERING AV OGRANSKAT ARBETE

Agenten får inte radera:

- branch,

- worktree,

- logg,

- eller artefakt

som kan innehålla meningsbärande arbete utan verifiering och mandat.

24.181 BEVARANDEPRINCIP

GainPilot ska följa en bevarandeprincip för projektmaterial.

Inget meningsbärande material ska raderas innan:

- innehållet identifierats,

- relevans bedömts,

- säker kopia verifierats,

- och borttagning godkänts.

24.182 ARKIV

Avslutat eller ersatt agentarbete ska kunna flyttas till:

- archive,

- rejected,

- superseded,

- eller abandoned

med tydlig status.

24.183 LÄRANDE FRÅN AGENTUPPGIFTER

Efter uppgiften ska systemet kunna registrera:

- vad som fungerade,

- vilka instruktioner som var otydliga,

- vilka tester som saknades,

- och vilka agentsystem som bör förbättras.

24.184 PRIVAT AGENTLÄRANDE

Lärande från ett specifikt GainPilot-repository ska inte automatiskt spridas till andra projekt om det innehåller:

- privat kod,

- företagsstrategi,

- eller projektunika regler.

24.185 PLATTFORMSLÄRANDE

Omnira kan lära av aggregerade utvecklingsmönster.

Exempel:

- vanliga scopefel,

- missade teststeg,

- agentkostnad,

- och reviewkorrigeringar.

Detta ska ske med rätt isolering.

24.186 KVALITETSMÅTT

Agentdriven utveckling ska kunna mätas genom:

- accepterade leveranser,

- regressionsfel,

- reviewkommentarer,

- scopebrott,

- testtäckning,

- kostnad,

- och tid till verifierad produktnytta.

24.187 INTE KODVOLYM

Antal skrivna rader kod ska inte vara framgångsmått.

24.188 INTE ANTAL PR

Antal skapade pull requests ska inte vara huvudmått.

En agent som skapar många små men irrelevanta PR:er är inte nödvändigtvis produktiv.

24.189 FIRST-PASS QUALITY

GainPilot ska kunna följa hur ofta en agentleverans:

- klarar tester,

- följer scope,

- och godkänns utan större omarbete.

24.190 REVIEW DEFECT RATE

Systemet ska följa vilka fel som upptäcks först i review.

Återkommande fel ska förbättra:

- instruktioner,

- testmallar,

- eller agentval.

24.191 PRODUCTION ESCAPE

Fel som når produktion ska analyseras mot:

- uppgift,

- agent,

- testlucka,

- review,

- och deploymentkontroll.

24.192 AGENTKOSTNAD PER GODKÄND LEVERANS

Kostnad ska kunna relateras till:

- godkänd,

- mergad,

- deployad,

- och validerad

leverans.

Billig kod som aldrig kan användas är inte effektiv.

24.193 KORRIGERINGSFREKVENS

Systemet ska följa hur ofta människor eller andra agenter behöver korrigera:

- kod,

- arkitektur,

- test,

- dokumentation,

- eller statusrapport.

24.194 HALLUCINERAD STATUS

Påståenden om genomförda åtgärder som saknar bevis ska registreras som allvarlig agentkvalitetssignal.

24.195 AGENTDRIFT

Agentdrift kan visa sig genom:

- större diffar,

- fler dependencies,

- bredare kontext,

- längre svar,

- fler verktygsanrop,

- eller sämre scopeföljsamhet.

24.196 POLICYDRIFT

Utvecklingsagentens faktiska beteende ska jämföras med agentmanifestet.

Om agenten börjar:

- använda förbjudna verktyg,

- begära större behörighet,

- eller hoppa över tester

ska capabilityn kunna stoppas.

24.197 INCIDENT

En agentutvecklingsincident kan vara:

- kod i fel repository,

- commit av secrets,

- radering av användararbete,

- oauktoriserad deployment,

- tenantläcka,

- eller falsk produktionsrapport.

24.198 INCIDENTSTOPP

Vid incident ska GainPilot kunna stoppa:

- agenten,

- verktyget,

- repositoryåtkomsten,

- deploymentcapabilityn,

- eller hela utvecklingsworkflowet.

24.199 KARANTÄN

Misstänkta commits, branches eller artefakter ska kunna sättas i karantän.

De ska inte mergeas eller deployas innan verifiering.

24.200 KONSEKVENSANALYS

Efter agentincident ska systemet identifiera:

- ändrade filer,

- commits,

- branches,

- PR,

- deployment,

- användardata,

- secrets,

- och andra agentuppgifter som påverkats.

24.201 ÅTERSTÄLLNING

Återställning kan kräva:

- revert,

- ny commit,

- secretrotation,

- datareparation,

- branchisolering,

- eller miljöåterställning.

24.202 POST-INCIDENT REVIEW

Review ska undersöka:

- uppgiftsdefinition,

- agentval,

- behörighet,

- verktyg,

- tester,

- review,

- och varför skydden inte stoppade händelsen.

24.203 AGENTMANIFEST

Varje utvecklingsagent ska ha manifest.

Manifestet ska minst innehålla:

- identity,

- owner,

- role,

- version,

- supported_tasks,

- supported_domains,

- capabilities,

- tools,

- authority,

- data_classes,

- prohibited_actions,

- model_routes,

- budget_defaults,

- test_requirements,

- and deployment_status.

24.204 POLICY SOM KOD

Betydelsefulla utvecklingsregler ska där möjligt genomdrivas tekniskt.

Exempel:

- ingen push till main,

- inga secrets i diff,

- required tests,

- filscope,

- branch protection,

- och deploymentapproval.

24.205 PROMPT ÄR INTE GOVERNANCE

Agentens instruktion:

Var försiktig och ändra bara relevanta filer

ersätter inte:

- filscope,

- permissions,

- diffkontroll,

- och review.

24.206 SJÄLVMODIFIERING

Utvecklingsagenter får inte själva:

- höja sin repositoryåtkomst,

- ändra branch protection,

- lägga till produktionssecrets,

- ge sig mergebehörighet,

- eller skriva om sitt agentmanifest i produktion.

24.207 FÖRSLAG TILL FÖRBÄTTRING

Agenten får föreslå förbättringar i:

- verktyg,

- instruktioner,

- tester,

- och workflow.

Förändringen ska behandlas som separat styrd uppgift.

24.208 SHADOW MODE FÖR UTVECKLINGSAGENTER

Nya utvecklingsagentversioner ska kunna arbeta i shadow mode.

De kan:

- analysera samma issue,

- skapa alternativ plan,

- eller generera en diff

utan att ändra aktiv branch.

24.209 PARALLELL UTVÄRDERING

Aktiv och ny agentversion ska jämföras för:

- scope,

- kodkvalitet,

- testresultat,

- säkerhet,

- kostnad,

- och statusprecision.

24.210 CANARY

Ny agentversion ska först få:

- intern repositoryyta,

- dokumentationsuppgift,

- testgenerering,

- eller annan låg risk-uppgift.

Den ska inte börja med:

- production deployment,

- tenantpolicy,

- eller destruktiv migration.

24.211 BEGRÄNSAD WRITE

Agenten kan först få:

- read-only,

- sedan branch-write,

- därefter commit,

- och senare begränsad push

när kvaliteten verifierats.

24.212 EARNED DEVELOPMENT AUTONOMY

Utvecklingsautonomi ska förtjänas per capability.

En agent kan exempelvis få:

- autonom dokumentationsuppdatering,

- men fortfarande behöva approval för dependencyändring.

24.213 AUTONOMIREVIEW

Agentauthority ska omprövas efter:

- modellbyte,

- incident,

- större repositoryförändring,

- eller försämrad kvalitet.

24.214 MÄNSKLIGT ANSVAR

GainPilot-ägaren eller utsedd teknisk ägare ska bära slutligt ansvar för:

- produktens riktning,

- riskacceptans,

- mergepolicy,

- och produktionsmandat.

24.215 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för agentdriven produktutveckling.

**Kontrakt GP-454 — Agentdriven utveckling ska vara ett styrt system**

AI-agenter ska arbeta genom definierade uppgifter, capabilities, arbetsmiljöer, tester, reviews och beslutsgränser — aldrig genom obegränsad repositoryåtkomst.

**Kontrakt GP-455 — Problem, förslag och implementation ska separeras**

En agentanalys eller lösningshypotes får inte automatiskt skapa kodändring, merge eller deployment.

**Kontrakt GP-456 — Varje utvecklingsuppgift ska ha explicit scope**

Uppgifter ska ange mål, acceptanskriterier, inkluderat och exkluderat scope, risk, filer, verktyg, tester och stoppvillkor.

**Kontrakt GP-457 — Scope får inte utökas tyst**

När agenten upptäcker arbete utanför mandatet ska den stoppa den delen, dokumentera behovet och begära nytt godkännande.

**Kontrakt GP-458 — Rätt specialist ska göra rätt arbete**

Produktanalys, arkitektur, domänlogik, implementation, test, säkerhet, integritet, migration och release ska kunna utföras av separata ansvariga roller.

**Kontrakt GP-459 — Kompetensluckor ska redovisas**

En agent får inte fylla saknad domän-, teknik- eller säkerhetskompetens med självsäker fri generering.

**Kontrakt GP-460 — Repository och arbetsyta ska verifieras**

Före ändring ska agenten kontrollera repository, branch, worktree, upstream, HEAD och orelaterade ändringar.

**Kontrakt GP-461 — Orelaterat arbete ska skyddas**

Agenter får inte stagea, ändra, återställa, flytta eller radera användarens eller andra agenters orelaterade filer utan uttryckligt mandat.

**Kontrakt GP-462 — Normal utveckling ska ske isolerat**

Produktförändringar ska genomföras på separat branch eller worktree och inte direkt i main.

**Kontrakt GP-463 — Minsta nödvändiga förändring ska prioriteras**

Agenten ska undvika orelaterad refaktorering, överarkitektur, dependencyökning och bred diff som inte krävs av acceptanskriterierna.

**Kontrakt GP-464 — Canonical kunskap ska verifieras mot implementation**

Böcker, kodgrafer och agentindex ska styra förståelse men får inte användas som bevis för faktisk kod utan kontroll av repositoryt.

**Kontrakt GP-465 — Kritisk logik får inte endast ligga i prompt**

Behörighet, säkerhet, domänregler, datakontrakt och högriskbeslut ska genomdrivas genom kod, schema, policy och tester.

**Kontrakt GP-466 — Agentgenererad kod har samma kvalitetskrav**

Kod från agenter ska vara begriplig, testbar, säker, underhållbar och följa GainPilots arkitektur- och stilregler.

**Kontrakt GP-467 — Testbevis krävs före färdigstatus**

Agenter får inte rapportera en implementation som färdig innan obligatoriska tester har körts och begränsningar redovisats.

**Kontrakt GP-468 — Oberoende kontroll ska användas vid risk**

Hög- och kritisk risk ska kräva separat test-, domän-, säkerhets-, integritets- eller mänsklig review.

**Kontrakt GP-469 — Pull request är normal leveransgräns**

Alla vanliga produktförändringar ska levereras genom fokuserad pull request med scope, risk, testresultat, migration och rollback.

**Kontrakt GP-470 — Merge och deployment är separata beslut**

En godkänd eller mergad PR får inte beskrivas som live förrän deployment och produktionsverifiering är bekräftade.

**Kontrakt GP-471 — Agentstatus ska motsvara verifierat tillstånd**

Påståenden om analys, ändring, test, commit, push, PR, merge och deployment ska stödjas av faktisk verktygs- eller systemevidens.

**Kontrakt GP-472 — Högriskdeployment ska vara progressiv**

Förändringar i säkerhet, data, agenter, programlogik och centrala domänmotorer ska använda staging, feature flags, canary, stoppregler och rollback där relevant.

**Kontrakt GP-473 — Teknisk leverans och produktnytta ska separeras**

Merge eller deployment innebär inte att förändringen är validerad; avsedd effekt och skyddsmått ska följas upp.

**Kontrakt GP-474 — Meningsbärande projektmaterial ska bevaras**

Branches, worktrees, dokument, kod och artefakter får inte raderas innan innehållet har identifierats, säker kopia verifierats och borttagning godkänts.

**Kontrakt GP-475 — Agenter får inte självmodifiera sitt utvecklingsmandat**

Utvecklingsagenter får inte själva höja behörighet, ändra branch protection, lägga till secrets, ge sig merge- eller deploymenträtt eller ändra sitt produktionsmanifest.

**Kontrakt GP-476 — Utvecklingsautonomi ska förtjänas per capability**

Read, branch-write, commit, push, PR, merge och deployment ska vara separata och återkalleliga mandat som höjs genom verifierad kvalitet.

**Kontrakt GP-477 — Agentutveckling ska vara branch-, test- och reviewstyrd**

Förändringar av produkt, agenter, prompts, policies, schema, modeller och utvecklingsverktyg ska ske genom separat branch, tester, kvalificerad review, kontrollerad utrullning och effektuppföljning.

24.216 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- ge en generell agent obegränsad repositoryåtkomst,

- be en agent förbättra hela produkten utan scope,

- låta analys automatiskt bli implementation,

- låta förslag automatiskt bli merge,

- låta merge automatiskt bli deployment,

- låta deployment automatiskt beskrivas som validerad produktnytta,

- använda samma agent för alla roller,

- behandla rollnamn som kosmetiska personas,

- välja agent endast efter lägsta pris,

- låta agenten arbeta utanför sin kompetens,

- låta kompetenslucka döljas genom självsäker text,

- använda otydliga acceptanskriterier,

- utelämna exkluderat scope,

- tillåta tyst scopeexpansion,

- behandla alla uppgifter som låg risk,

- låta kritiska förändringar ha samma process som textändringar,

- låta en agent själv klassificera ned risk utan review,

- anta att alla förändringar är reversibla,

- arbeta i fel repository,

- anta att mappnamnet räcker som projektidentitet,

- hoppa över branch- och upstreamkontroll,

- stagea orelaterade användarändringar,

- återställa filer som agenten inte skapade,

- radera orelaterade worktrees,

- ändra direkt i main,

- blanda parallella agentuppgifter i samma arbetsyta,

- skapa stora blandade commits,

- ändra filer utanför scope utan rapport,

- lägga till dependencies av bekvämlighet,

- uppdatera lockfile med stora orelaterade förändringar,

- köra okända externa scripts,

- exponera secrets för agenten,

- skriva secrets i kod eller logg,

- använda full produktionsdata för vanlig felsökning,

- skicka hela repositoryt till varje agent,

- läsa hela Omnira för en liten GainPilot-ändring,

- lita blint på kodgraf eller repositoryindex,

- anta att canonical bok betyder implementerad funktion,

- ignorera dokumentationsdrift,

- börja högriskimplementation utan plan,

- överarkitektera små förändringar,

- gömma domänlogik i UI eller prompt,

- använda prompttext som enda säkerhetskontroll,

- hitta på bibliotek eller API:er,

- svälja fel,

- returnera falsk framgång,

- skapa icke-idempotenta retries,

- skriva destruktiva migrationer utan backup- eller reparationsplan,

- köra ad hoc-datakorrigering utan audit,

- lämna permanenta feature flags,

- rapportera färdig innan test,

- dölja hoppade tester,

- kalla en delvis körd testsvit fullständigt godkänd,

- låta implementeringsagentens egna tester vara enda verifiering vid hög risk,

- acceptera stora snapshotdiffar blint,

- använda riktiga personuppgifter i fixtures,

- låta samma agent implementera och slutgodkänna kritisk ändring,

- skapa pull requests med orelaterade ändringar,

- använda vaga PR-titlar,

- utelämna rollback,

- anta att lokala tester innebär gröna remote-checks,

- mergea med pågående checks,

- påstå att commit eller push skett utan verifiering,

- skapa dubblett-PR vid retry,

- blanda PR skapad, mergad och deployad,

- beskriva mergad kod som live utan deploymentbevis,

- deploya högriskändring utan approval,

- ta bort gammalt schema innan konsumenter migrerat,

- hoppa över produktionsverifiering,

- använda smoke test som skapar skadlig användardata,

- ignorera canarymått,

- göra blind automatisk rollback,

- lämna hotfix utan eftergranskning,

- låta release notes ersätta faktisk dokumentation,

- skriva om canonical bok vid varje liten kodändring,

- uppdatera kunskapsindex före verifierad merge,

- använda gammalt index som sanning,

- avsluta uppgift vid merge utan effektuppföljning,

- säga klart när arbete återstår,

- hallucinera verktygsanvändning,

- dölja fel eller saknad behörighet,

- fortsätta efter fel repository eller secret risk,

- ställa frågor som repositorypolicy redan besvarar,

- låta flera agenter skriva samtidigt utan samordning,

- låta integrationsagent välja domänbeslut utan ägare,

- använda fler agenter än uppgiften kräver,

- kringgå kostnadsbudget genom underuppgifter,

- återuppta gammal uppgift utan mandatkontroll,

- radera avbrutet agentarbete utan granskning,

- radera meningsbärande projektmaterial utan verifierad kopia,

- mäta utvecklingsframgång i kodrader,

- mäta utvecklingsframgång i antal PR,

- ignorera hallucinerad status som kvalitetssignal,

- låta agentdrift fortsätta utan omprövning,

- låta agenten ändra sitt eget manifest,

- låta agenten ge sig merge- eller deploymentbehörighet,

- ge full autonomi efter ett fåtal lyckade uppgifter,

- eller ändra agentutvecklingssystemet direkt i produktion utan branch, tester, review, shadow mode och kontrollerad utrullning.

24.217 KANONISKA BESLUT FRÅN KAPITEL 24

Följande beslut etableras:

1. GainPilot ska stödja agentdriven produktutveckling.

2. Agentdriven utveckling ska behandlas som ett styrt produktionssystem.

3. Utvecklingskedjan ska vara explicit.

4. Observation ska skiljas från problemformulering.

5. Problemformulering ska skiljas från lösningshypotes.

6. Lösningshypotes ska skiljas från implementation.

7. Implementation ska skiljas från review.

8. Review ska skiljas från merge.

9. Merge ska skiljas från deployment.

10. Deployment ska skiljas från effektvalidering.

11. Varje utvecklingsuppgift ska ha stabil identitet.

12. Varje uppgift ska ha mänsklig eller organisatorisk ägare.

13. Uppgifter ska ha tydlig problemformulering.

14. Uppgifter ska kunna ha testbar lösningshypotes.

15. Acceptanskriterier ska vara explicita.

16. Exkluderat scope ska definieras.

17. Scopeexpansion ska kräva nytt godkännande.

18. Utvecklingsuppgifter ska riskklassificeras.

19. Riskklass ska påverka process och behörighet.

20. Reversibilitet ska bedömas.

21. GainPilot ska använda specialiserade utvecklingsagenter.

22. Product Analysis Agent ska arbeta med problem och signaler.

23. Architecture Agent ska granska systemgränser.

24. Domain Expert Agent ska granska domänkorrekthet.

25. Research Agent ska skilja källor från beslut.

26. Implementation Agent ska arbeta inom scope.

27. Test Agent ska verifiera acceptanskriterier.

28. Security Review Agent ska ha separat roll.

29. Privacy Review Agent ska ha separat roll.

30. Performance Agent ska kunna analysera kostnad och latency.

31. Documentation Agent ska hålla dokumentation aktuell.

32. Migration Agent ska hantera schema och backfill.

33. Release Agent ska hantera releaseförberedelse.

34. Incident Analysis Agent ska arbeta spårbart.

35. Atlas ska kunna orkestrera utvecklingsarbete.

36. Atlas ska inte ensam utföra hela leveranskedjan.

37. Manageragent ska kunna samordna utan kodmandat.

38. Specialistkompetens ska prioriteras.

39. Varje agent ska ha kompetensregister.

40. Uppgifter ska ange kompetenskrav.

41. Kompetensgap ska redovisas.

42. Agentval ska väga kvalitet, risk och kostnad.

43. Modellval ska ske per uppgift.

44. Modellbyte ska regressionstestas.

45. Varje uppgift ska ange exakt repository.

46. Arbetsmiljö ska verifieras.

47. Git status ska kontrolleras före ändring.

48. Orelaterade ändringar ska skyddas.

49. Normal utveckling ska ske på separat branch.

50. Parallellt arbete bör använda separata worktrees.

51. Startcommit ska registreras.

52. Upstreamstatus ska kontrolleras.

53. Basuppdatering ska följa repositorypolicy.

54. Direkt utveckling i main ska förbjudas.

55. Filscope ska kunna begränsas.

56. Genererade filer ska hanteras enligt källa.

57. Binära filer ska ha reproduktionsmetod.

58. Nya dependencies ska motiveras.

59. Dependencyval ska omfatta licens och säkerhet.

60. Lockfiles ska hållas fokuserade.

61. Supply chain ska skyddas.

62. Okända externa scripts ska inte köras.

63. Secrets ska hållas utanför agentkontext.

64. Miljövariabler ska inte läcka.

65. Full produktionsdata ska inte vara standard för felsökning.

66. Känslig felsökning ska vara tids- och ärendebunden.

67. Kodagenten ska få uppgiftsspecifik kontext.

68. Kontextbudget ska finnas.

69. Kodgraf kan användas.

70. Kodgrafpåståenden ska verifieras mot kod.

71. Canonical kunskap ska vara tillgänglig för agenter.

72. Kunskapsstatus ska påverka prioritet.

73. Boken ska inte användas som implementationsbevis.

74. Dokumentationsdrift ska rapporteras.

75. Högriskarbete ska ha plan före ändring.

76. Planen ska kunna justeras spårbart.

77. Minsta nödvändiga diff ska prioriteras.

78. Överarkitektur ska undvikas.

79. Domänlogik ska ligga i rätt modul.

80. Kritisk logik ska inte endast ligga i prompt.

81. Agentresultat ska kunna vara strukturerade.

82. Agentgenererad kod ska följa repositorykvalitet.

83. API:er ska verifieras.

84. Felhantering ska vara explicit.

85. Ny kod ska vara observerbar.

86. Workflows ska bedömas för idempotens.

87. Migrationer ska vara versionerade och återstartbara.

88. Backfill ska ha checkpoint och verifiering.

89. Destruktiva ändringar ska kräva stark kontroll.

90. Datakorrigering ska vara auditerad.

91. Feature flags ska ha ägare.

92. Feature flags ska ha borttagningsplan.

93. Teststrategi ska följa risk.

94. Färdigstatus ska kräva testbevis.

95. Testresultat ska dokumenteras.

96. Hoppade tester ska redovisas.

97. Enhetstester ska inte ersätta övrig verifiering.

98. Kontraktstester ska användas.

99. Domänlogik ska domäntestas.

100. Säkerhet ska testas.

101. Integritet ska testas.

102. Migrationer ska testas vid avbrott och omkörning.

103. Prestanda ska testas när relevant.

104. Snapshotdiffar ska granskas.

105. Testdata ska vara skyddad.

106. Högriskarbete ska ha oberoende testkontroll.

107. Adversarial review ska kunna användas.

108. Code Review Agent ska vara separat roll.

109. Reviewkommentarer ska ha severity.

110. Kommentarer ska lösas verkligt.

111. Mänsklig review ska krävas vid vissa risker.

112. Domänförändringar ska kunna kräva expertreview.

113. Fyraögonsprincip ska användas vid kritisk risk.

114. Pull request ska vara normal leveransgräns.

115. PR ska innehålla scope och testbevis.

116. PR ska vara fokuserad.

117. PR-titel ska vara begriplig.

118. PR-beskrivning ska skilja ändrat och oförändrat.

119. Bevis ska motsvara verkligt tillstånd.

120. Automatiska checks ska användas.

121. Remote checkstatus ska verifieras.

122. Main ska ha branch protection.

123. Merge ska vara separat beslut.

124. Mergestrategi ska följa policy.

125. Merge med okänt tillstånd ska förbjudas.

126. Commits ska vara fokuserade.

127. Commitstatus ska verifieras.

128. Push ska ske till rätt branch.

129. PR-skapande ska vara idempotent.

130. PR-state ska beskrivas exakt.

131. Merge ska inte likställas med deployment.

132. Deployment ska ha plan.

133. Previewmiljö ska isoleras.

134. Staging ska använda skyddad data.

135. Canary ska användas vid högre risk.

136. Feature flags ska kunna begränsa målgrupp.

137. Högriskdeployment ska kräva separat approval.

138. Migrationsordning ska definieras.

139. Expand-and-contract ska användas där relevant.

140. Produktion ska verifieras efter deployment.

141. Smoke tests ska vara säkra.

142. Synthetic monitoring ska använda testidentiteter.

143. Användarpåverkan ska följas.

144. Rollbacktriggers ska definieras.

145. Rollback ska vara komponentmedveten.

146. Blind automatisk rollback ska undvikas.

147. Hotfix ska vara minimal.

148. Hotfix ska eftergranskas.

149. Release notes ska skapas.

150. Changelog ska versionsstyras.

151. Dokumentation ska uppdateras.

152. Canonical bok ska endast revideras vid verkligt visionsbehov.

153. Betydelsefulla val ska dokumenteras i ADR.

154. Kunskapsregister ska uppdateras efter merge.

155. Index ska märkas med commit.

156. Föråldrat index ska inte vara sanning.

157. Betydelsefulla förändringar ska följas upp.

158. Teknisk leverans ska ha egen status.

159. Produktionsleverans ska ha egen status.

160. Validerad effekt ska ha egen status.

161. Agentrapportering ska vara exakt.

162. Ordet klart ska inte användas felaktigt.

163. Status ska ha verifierbart bevis.

164. Hallucinerad verktygsanvändning ska förbjudas.

165. Begränsningar ska redovisas.

166. Agenten ska ha stoppregler.

167. Frågor ska vara avgränsade.

168. Onödiga frågor ska undvikas.

169. Flera agenter ska kunna arbeta parallellt.

170. Parallella agenter ska ha filscope.

171. Integrationsagent ska kunna sammanföra resultat.

172. Domänkonflikter ska ha beslutsägare.

173. Samtidig osamordnad skrivning ska förbjudas.

174. Lås ska ha ägare och timeout.

175. Agentuppgifter ska kunna köas.

176. Prioritet ska baseras på verklig påverkan.

177. Work in progress ska begränsas.

178. Agentuppgifter ska ha budget.

179. Kostnadsstopp ska fungera.

180. Budget får inte kringgås.

181. Uppgifter ska ha tidsgräns.

182. Långa uppgifter ska skapa checkpoints.

183. Återupptagning ska verifiera nytt tillstånd.

184. Utgånget mandat ska inte återanvändas.

185. Uppgifter ska kunna avbrytas.

186. Tillfälliga resurser ska ha cleanup-plan.

187. Ogranskat arbete ska inte raderas automatiskt.

188. Meningsbärande projektmaterial ska bevaras.

189. Avslutat arbete ska kunna arkiveras.

190. Utvecklingsuppgifter ska skapa lärande.

191. Projektunik kunskap ska inte spridas okontrollerat.

192. Omnira kan lära av aggregerade utvecklingsmönster.

193. Agentkvalitet ska mätas.

194. Kodvolym ska inte vara framgångsmått.

195. Antal PR ska inte vara huvudmått.

196. First-pass quality ska följas.

197. Review defects ska analyseras.

198. Production escapes ska analyseras.

199. Kostnad ska relateras till godkänd leverans.

200. Korrigeringsfrekvens ska följas.

201. Hallucinerad status ska vara allvarlig signal.

202. Agentdrift ska övervakas.

203. Policybeteende ska jämföras med manifest.

204. Utvecklingsincidenter ska klassificeras.

205. Agent- och verktygsåtkomst ska kunna stoppas.

206. Misstänkta artefakter ska kunna sättas i karantän.

207. Incidentpåverkan ska konsekvensanalyseras.

208. Återställning ska kunna omfatta secretrotation och datareparation.

209. Incidenter ska eftergranskas.

210. Varje agent ska ha manifest.

211. Governance ska där möjligt vara policy som kod.

212. Prompttext ska inte vara enda skyddet.

213. Agenter får inte självmodifiera sitt mandat.

214. Förbättringsförslag ska följa normal utvecklingsprocess.

215. Nya agentversioner ska köras i shadow mode.

216. Agentversioner ska jämföras parallellt.

217. Canary ska börja med låg risk.

218. Write-behörighet ska höjas gradvis.

219. Utvecklingsautonomi ska vara capabilitybaserad.

220. Authority ska omprövas efter modellbyte och incident.

221. Slutligt produktansvar ska förbli mänskligt.

222. Agentdriven utveckling ska öka kapacitet utan att avskaffa kontroll.

24.218 IMPLEMENTERINGSORDNING

GainPilots agentdrivna produktutveckling ska implementeras stegvis.

Fas 1 — Uppgiftsregister

Implementera:

- task identity,

- owner,

- objective,

- scope,

- excluded scope,

- acceptance criteria,

- risk class,

- och status.

Fas 2 — Agentregister

Implementera:

- agent identity,

- role,

- owner,

- version,

- capabilities,

- tools,

- domains,

- risk levels,

- och prohibited actions.

Fas 3 — Repositoryregister

Implementera:

- repository identity,

- remote,

- default branch,

- branch policy,

- test commands,

- build commands,

- deployment targets,

- och owners.

Fas 4 — Arbetsmiljöverifiering

Implementera automatisk kontroll av:

- repository,

- branch,

- worktree,

- upstream,

- HEAD,

- git status,

- och orelaterade ändringar.

Fas 5 — Scopekontroll

Implementera:

- allowed paths,

- prohibited paths,

- diff validation,

- dependency change detection,

- och scope expansion request.

Fas 6 — Branch- och worktreeflöde

Implementera:

- branch naming,

- worktree creation,

- task mapping,

- start commit,

- cleanup status,

- och archive.

Fas 7 — Kontextkompilering

Implementera uppgiftspaket med:

- relevant code,

- canonical contracts,

- ADR,

- tests,

- repository policy,

- och context budget.

Fas 8 — Read-only-agenter

Börja med agenter för:

- audit,

- architecture mapping,

- product analysis,

- och test planning

utan write access.

Fas 9 — Begränsad branch-write

Ge utvalda agenter rätt att:

- ändra filer inom scope,

- men inte commit,

- push,

- eller skapa PR.

Fas 10 — Testsystem

Implementera:

- test matrix,

- test evidence,

- skipped test reporting,

- domain tests,

- security tests,

- och privacy tests.

Fas 11 — Commitcapability

Implementera:

- explicit staging,

- unrelated file protection,

- commit message policy,

- commit evidence,

- och task relation.

Fas 12 — Pushcapability

Implementera:

- allowed remote,

- allowed branch,

- secret scan,

- upstream verification,

- och push evidence.

Fas 13 — Pull request-capability

Implementera:

- idempotent PR creation,

- title and body template,

- base validation,

- check status,

- och review status.

Fas 14 — Specialistreview

Implementera separata flöden för:

- code review,

- domain review,

- security review,

- privacy review,

- migration review,

- och performance review.

Fas 15 — Branch protection

Implementera:

- required PR,

- required checks,

- review rules,

- merge restrictions,

- och critical path owners.

Fas 16 — Releaseförberedelse

Implementera:

- build verification,

- release manifest,

- feature flags,

- migration plan,

- rollback plan,

- och release notes.

Fas 17 — Staging

Implementera:

- preview,

- staging deployment,

- synthetic data,

- smoke tests,

- och approval.

Fas 18 — Canary

Implementera:

- internal tenant,

- limited users,

- risk metrics,

- guardrails,

- stop rules,

- och rollback.

Fas 19 — Produktionsverifiering

Implementera:

- deployment status,

- migration status,

- health checks,

- smoke tests,

- logs,

- metrics,

- och feature flag confirmation.

Fas 20 — Effektuppföljning

Implementera:

- baseline,

- expected effect,

- product metric,

- guardrail metric,

- review date,

- och validated outcome.

Fas 21 — Agentstatusmodell

Implementera exakta statusar för:

- analyzed,

- modified,

- tested,

- committed,

- pushed,

- PR opened,

- reviewed,

- merged,

- deployed,

- och validated.

Fas 22 — Budget och checkpoints

Implementera:

- token budget,

- tool budget,

- CI budget,

- timeout,

- checkpoint,

- resume,

- och cancel.

Fas 23 — Parallella agenter

Implementera:

- task decomposition,

- worktree isolation,

- file ownership,

- dependencies,

- integration agent,

- och conflict resolution.

Fas 24 — Agentkvalitetsmätning

Implementera:

- scope compliance,

- first-pass quality,

- review defects,

- production escapes,

- status accuracy,

- cost per accepted delivery,

- och correction rate.

Fas 25 — Incidenthantering

Implementera:

- agent stop,

- tool stop,

- repository revoke,

- quarantine,

- secret rotation,

- consequence analysis,

- och post-incident review.

Fas 26 — Shadow mode för utvecklingsagenter

Implementera:

- parallel planning,

- alternative diff,

- no-write comparison,

- quality scoring,

- och human evaluation.

Fas 27 — Earned development autonomy

Implementera separata mandat för:

- read,

- branch-write,

- commit,

- push,

- PR,

- merge proposal,

- och deployment proposal.

Fas 28 — Canonical knowledge integration

Efter godkänd GainPilot-bok:

- integrera boken i repositoryts kunskapsstruktur,

- skapa kontraktsregister,

- skapa agentretrieval,

- länka ADR,

- och skapa testbara implementation requirements.

Fas 29 — Full agentgovernance

Implementera:

- periodic authority review,

- model review,

- competency review,

- repository audit,

- supply-chain controls,

- retention,

- och forbidden self-modification.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- enhetstester,

- kontraktstester,

- domäntester,

- säkerhets- och integritetstester,

- review,

- shadow mode där relevant,

- pull request,

- canary,

- kontrollerad merge,

- deploymentverifiering,

- och effektuppföljning.

24.219 FRAMGÅNGSKRITERIER

Kapitel 24:s vision är framgångsrikt realiserad när:

- varje agentuppgift har identitet,

- uppgifter har tydlig ägare,

- problemformulering och lösningshypotes hålls åtskilda,

- acceptanskriterier är explicita,

- exkluderat scope är synligt,

- scopeexpansion kräver nytt mandat,

- uppgifter riskklassificeras,

- högriskarbete får starkare kontroll,

- flera specialiserade utvecklingsagenter finns,

- agentroller har verkligt separata capabilities,

- kompetensluckor redovisas,

- agentval baseras på risk och kvalitet,

- modellval är uppgiftsspecifikt,

- repository verifieras före förändring,

- branch och upstream kontrolleras,

- orelaterade användarändringar skyddas,

- vanliga förändringar aldrig görs direkt i main,

- parallellt arbete använder isolerade worktrees,

- startcommit registreras,

- fils cope kan genomdrivas,

- dependencies kräver motivering,

- secrets inte exponeras,

- produktionsdata inte används fritt,

- kodagenter får uppgiftsspecifik kontext,

- kodgraf används som stöd och inte som sanning,

- canonical bokkontrakt är tillgängliga,

- implementation verifieras mot faktisk kod,

- högriskändringar har plan,

- diffen hålls fokuserad,

- domänlogik ligger i rätt modul,

- kritisk policy inte endast finns i prompt,

- agentgenererad kod följer kvalitetskrav,

- API:er verifieras,

- nya workflows är idempotenta,

- migrationer är återstartbara,

- destruktiva ändringar kräver backup- eller reparationsplan,

- feature flags har ägare och slutdatum,

- obligatoriska tester körs före färdigstatus,

- hoppade tester redovisas,

- domänlogik testas semantiskt,

- säkerhet och integritet testas,

- högriskarbete granskas oberoende,

- pull requests är fokuserade,

- PR-beskrivningar innehåller risk och rollback,

- remote checks verifieras,

- main har branch protection,

- merge kräver separat beslut,

- commit och push kan bevisas,

- dubblett-PR förhindras,

- PR, merge och deployment har olika status,

- högriskdeployment använder staging och canary,

- migrationsordning är definierad,

- produktion verifieras efter deployment,

- användarpåverkan följs,

- rollbacktriggers finns,

- hotfix eftergranskas,

- release notes och changelog hålls uppdaterade,

- dokumentation följer implementationen,

- canonical bok inte ändras av små implementationer,

- ADR används för betydelsefulla beslut,

- kod- och kunskapsindex uppdateras efter merge,

- teknisk leverans skiljs från validerad produktnytta,

- agentstatus motsvarar verkligt tillstånd,

- ordet klart inte används när steg saknas,

- hallucinerad verktygsanvändning upptäcks,

- agenten stoppar vid fel repository eller secret risk,

- parallella agentuppgifter samordnas,

- agent-WIP begränsas,

- budget kan stoppa arbete,

- checkpoints kan återupptas säkert,

- gammalt mandat inte återanvänds,

- avbrutna uppgifter kan arkiveras,

- meningsbärande projektmaterial inte raderas,

- utvecklingslärande dokumenteras,

- agentkvalitet mäts på godkänd leverans,

- kodvolym inte används som huvudmått,

- review defects och production escapes analyseras,

- hallucinerad status är en allvarlig kvalitetssignal,

- agentdrift och policyavvikelser övervakas,

- agentincidenter kan stoppas och isoleras,

- commits och branches kan sättas i karantän,

- secretrotation och datareparation kan genomföras,

- varje agent har manifest,

- kritisk governance genomdrivs tekniskt,

- agenten inte kan självmodifiera sitt mandat,

- nya agentversioner körs i shadow mode,

- canary börjar med låg risk,

- write-, commit-, push-, PR-, merge- och deploymentmandat är separata,

- utvecklingsautonomi kan återkallas,

- och slutligt produkt-, risk- och produktionsansvar förblir mänskligt.

24.220 SAMMANFATTNING

GainPilot ska kunna utvecklas snabbare och mer systematiskt med hjälp av AI-agenter.

Agenter ska kunna bidra med:

- produktanalys,

- arkitekturkartläggning,

- research,

- implementation,

- tester,

- säkerhetsgranskning,

- integritetsgranskning,

- dokumentation,

- migration,

- release,

- och incidentanalys.

Detta ska inte ske genom att en enda agent får obegränsad tillgång till hela produkten.

Agentdriven produktutveckling ska vara en kontrollerad kedja.

Den ska börja med att förstå problemet.

Ett mätvärde, supportärende eller Atlas-förslag ska först bli:

- en observation,

- en problemformulering,

- och en lösningshypotes.

Därefter ska uppgiften få:

- en ägare,

- ett explicit scope,

- exkluderat scope,

- acceptanskriterier,

- riskklass,

- och testkrav.

En agent ska inte få instruktionen:

Förbättra GainPilot.

Den ska få en begränsad uppgift som:

Minska korrigeringsgraden för tidigare godkända övningsbyten genom att justera rankingen inom substitutionsmotorn. Ändra inte träningsgrafen, smärtpolicyn eller programgeneratorn. Lägg till domäntester för utrustningsbyte och historiskt godkända alternativ.

Rätt agent ska därefter väljas.

En Product Analysis Agent kan förstå problemet.

En Architecture Agent kan kartlägga berörda moduler.

En Domain Expert Agent kan kontrollera träningslogiken.

En Implementation Agent kan skriva koden.

En Test Agent kan försöka bryta lösningen.

En Security Review Agent kan kontrollera behörighet och dataflöden.

En Privacy Review Agent kan kontrollera om nya data används.

En människa eller annan behörig ägare kan därefter fatta merge- och deploymentbeslut.

Atlas ska kunna samordna detta arbete.

Atlas ska kunna:

- skapa arbetsplan,

- välja specialistroller,

- följa status,

- samla resultat,

- och visa vilka beslut som krävs.

Atlas ska inte ensam få:

- identifiera problemet,

- välja lösning,

- skriva koden,

- skapa tester som bekräftar den egna lösningen,

- godkänna förändringen,

- mergea,

- deploya,

- och sedan förklara att resultatet blev bra.

Rollseparation ska användas när risken kräver det.

Varje agentuppgift ska börja i rätt tekniska miljö.

Agenten ska verifiera:

- repository,

- branch,

- worktree,

- upstream,

- startcommit,

- och git status.

Orelaterade ändringar ska skyddas.

Agenten får inte:

- stagea dem,

- återställa dem,

- radera dem,

- eller blanda in dem i sin commit.

Normal produktutveckling ska ske på separat branch eller worktree.

Main ska skyddas.

Parallella agentuppgifter ska inte skriva samtidigt i samma arbetsyta utan samordning.

Varje uppgift ska ha filscope.

Om agenten upptäcker att en annan modul behöver ändras ska den:

- stoppa den delen,

- beskriva behovet,

- och begära nytt scope.

Agenten ska arbeta med minsta nödvändiga förändring.

Den ska undvika:

- orelaterad refaktorering,

- nya dependencies utan behov,

- överarkitektur,

- och stora diffar som gör review svår.

GainPilots domänlogik ska ligga i rätt modul.

Träningsregler ska inte döljas i:

- UI,

- databastrigger,

- prompt,

- eller integrationskod

om de behöver vara canonical, testbara och återanvändbara.

Kritisk logik ska genomdrivas genom:

- kod,

- schema,

- policies,

- permissions,

- och tester.

En prompt är inte en säkerhetsmodell.

Agenten ska få ett uppgiftsspecifikt kontextpaket.

Paketet kan innehålla:

- relevanta filer,

- berörda canonical kontrakt,

- repositorypolicy,

- ADR,

- testkommandon,

- och acceptanskriterier.

Agenten behöver normalt inte läsa hela GainPilot, Omnira och alla böcker.

Kodgraf och Intelligence Graph kan minska kontextbehovet.

De ska behandlas som index, inte som ofelbar sanning.

Kritiska påståenden ska verifieras mot faktisk kod.

Agentgenererad kod ska hålla samma kvalitetsnivå som annan kod.

Den ska vara:

- begriplig,

- fokuserad,

- testbar,

- säker,

- och underhållbar.

Agenten ska verifiera:

- biblioteksversioner,

- interna interfaces,

- API:er,

- och datakontrakt.

Den ska inte hitta på sannolika funktioner.

Tester ska vara proportionerliga mot risken.

En textändring kan kräva enkel validering.

En ändring i substitutionsmotorn kan kräva:

- enhetstester,

- domäntester,

- regressionsscenarier,

- säkerhetstest,

- och användarflödestest.

En migration kan kräva:

- tom databas,

- äldre schema,

- avbrott,

- retry,

- backfill,

- och verifieringsfrågor.

En agent får inte säga att uppgiften är färdig innan obligatoriska tester är körda.

Den ska redovisa:

- exakt testkommando,

- resultat,

- skips,

- fel,

- och sådant som inte kunde verifieras.

Vid hög risk ska test eller review vara oberoende.

Samma missförstånd får inte automatiskt finnas i:

- implementation,

- test,

- och godkännande.

Pull request ska vara normal leveransgräns.

PR:n ska beskriva:

- problemet,

- scopet,

- vad som ändrats,

- vad som inte ändrats,

- tester,

- risk,

- migration,

- rollback,

- och eventuell produktpåverkan.

Agenten ska verifiera:

- att branchen pushats,

- att PR:n finns,

- att rätt base används,

- och att remote checks verkligen passerat.

PR skapad är inte samma sak som:

- godkänd,

- mergad,

- deployad,

- eller produktionsverifierad.

Merge ska vara ett separat beslut.

Deployment ska vara ett separat beslut.

Högriskförändringar ska kunna använda:

- preview,

- staging,

- feature flag,

- intern tenant,

- canary,

- stoppregler,

- och rollback.

Efter deployment ska GainPilot verifiera:

- health,

- migrationsstatus,

- centrala användarflöden,

- logs,

- metrics,

- och feature flags.

En mergad PR ska inte beskrivas som live innan detta är känt.

En deployment ska inte beskrivas som framgångsrik bara för att tjänsten svarar.

GainPilot ska också följa:

- användarkorrigeringar,

- säkerhetssignaler,

- support,

- skyddsmått,

- och avsedd produktnytta.

Tekniskt färdig, produktionsfärdig och validerad ska vara olika statusar.

Agentrapportering ska vara exakt.

Agenten ska kunna säga:

- Analysen är klar och inga filer har ändrats.

- Ändringarna finns lokalt men är inte testade.

- Lokala tester passerar.

- Commit är skapad men inte pushad.

- Branch är pushad men ingen PR finns.

- PR är skapad och checks pågår.

- PR är mergad men deployment är inte verifierad.

- Deployment är verifierad i staging.

- Produktion är verifierad genom definierade smoke tests.

Agenten ska inte säga:

Klart

när avgörande steg saknas.

Påståenden ska stödjas av:

- gitstatus,

- commit hash,

- testoutput,

- PR-status,

- deploymentstatus,

- och produktionsbevis.

Hallucinerad verktygsanvändning ska behandlas som en allvarlig kvalitetssignal.

GainPilot ska kunna använda flera agenter parallellt.

Detta ska ske genom:

- separata uppgifter,

- isolerade worktrees,

- definierat filscope,

- tydliga beroenden,

- och en integrationspunkt.

Fler agenter ska inte användas för sakens skull.

Work in progress ska begränsas.

Varje uppgift ska ha:

- kostnadsbudget,

- tidsgräns,

- checkpoint,

- och cancelmöjlighet.

Om budget eller mandat tar slut ska agenten stoppa och redovisa tillståndet.

Avbrutet arbete ska inte raderas automatiskt.

GainPilot ska följa en bevarandeprincip:

Inget meningsbärande projektmaterial ska raderas innan innehållet identifierats, en säker kopia verifierats och borttagningen godkänts.

Branches, worktrees, dokument, tester och agentartefakter ska kunna:

- arkiveras,

- markeras som ersatta,

- eller städas kontrollerat.

Agentdriven utveckling ska mätas på verklig kvalitet.

Relevanta mått är:

- scopeföljsamhet,

- first-pass quality,

- review defects,

- production escapes,

- testkvalitet,

- statusprecision,

- kostnad per godkänd leverans,

- och tid till validerad produktnytta.

Antal kodrader eller skapade PR:er är inte tillräckliga mått.

Nya utvecklingsagentversioner ska först köras i shadow mode.

De kan:

- analysera samma issue,

- skapa alternativ plan,

- eller generera en separat diff

utan att påverka aktiv branch.

Därefter kan agenten få gradvis större mandat:

1. Read-only.

2. Branch-write.

3. Commit.

4. Push.

5. Skapa pull request.

6. Föreslå merge.

7. Förbereda deployment.

Merge och produktionsdeployment ska förbli särskilt styrda.

Autonomi ska förtjänas per capability.

En agent kan vara betrodd att:

- uppdatera dokumentation autonomt,

men fortfarande behöva approval för:

- dependencies,

- migrationer,

- säkerhet,

- eller användardata.

Agenter får inte själva:

- ändra branch protection,

- höja sin repositoryåtkomst,

- lägga till secrets,

- ge sig mergebehörighet,

- ge sig deploymentmandat,

- eller skriva om sitt produktionsmanifest.

De får föreslå förbättringar.

Förändringen ska gå genom samma styrda utvecklingsprocess som all annan produktutveckling.

Kapitel 24 etablerar därmed följande kärnprincip:

GainPilot ska använda AI-agenter för att kraftigt öka analys-, utvecklings- och leveranskapaciteten, men varje agent ska arbeta som en avgränsad specialist inom ett verifierbart produktionsflöde. Agenter får hjälpa till att bygga produkten — de får inte bli produktens oövervakade ägare. Scope, kunskap, arbetsyta, tester, review, merge, deployment, bevarande och ansvar ska alltid vara tydliga, spårbara och återkalleliga.
