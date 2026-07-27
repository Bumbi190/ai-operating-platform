# Kapitel 25 — Branch-, test-, PR- och mergegovernance

GainPilot ska utvecklas genom en tekniskt verifierbar och ansvarsmässigt tydlig leveranskedja.

Agentdriven utveckling kan skapa:

- analyser,

- planer,

- kod,

- tester,

- dokumentation,

- migrationer,

- pull requests,

- och releaseunderlag.

Ingen av dessa artefakter ska automatiskt betraktas som godkänd produktförändring.

GainPilot ska skilja mellan:

- föreslagen förändring,

- lokal arbetskopia,

- testad implementation,

- commit,

- pushad branch,

- öppnad pull request,

- genomförd review,

- mergebar pull request,

- mergad kod,

- deployad kod,

- verifierad produktion,

- och validerad produktnytta.

Dessa tillstånd får inte beskrivas som om de vore samma sak.

En kodändring kan fungera lokalt men:

- sakna relevanta tester,

- bygga på fel bascommit,

- innehålla orelaterade filer,

- bryta ett annat kontrakt,

- ha konflikter med main,

- eller misslyckas i CI.

En pull request kan vara skapad men:

- sakna required checks,

- sakna review,

- ha unresolved conversations,

- vara behind main,

- eller vara blockerad av branch protection.

En pull request kan vara mergad men:

- ännu inte deployad,

- ha misslyckad deployment,

- ha väntande migration,

- eller vara inaktiv bakom en feature flag.

En deployment kan vara tekniskt lyckad men:

- orsaka produktionsfel,

- bryta ett användarflöde,

- försämra säkerhet,

- eller sakna bekräftad användarnytta.

GainPilots governance ska göra varje sådant tillstånd synligt.

Den canonical leveranskedjan ska vara:

Godkänt scope

→ verifierad repositorymiljö

→ separat branch eller worktree

→ fokuserad implementation

→ lokal validering

→ commit

→ push

→ pull request

→ automatiska checks

→ kvalificerad review

→ merge readiness

→ separat mergebeslut

→ merge

→ deployment

→ produktionsverifiering

→ effektuppföljning

→ kontrollerad städning.

Varje övergång ska ha:

- tydliga villkor,

- identifierad aktör,

- verifierbart bevis,

- tillåtet mandat,

- och ett säkert felutfall.

GainPilot ska inte bygga sin utvecklingssäkerhet på att en agent eller människa:

- kommer ihåg alla regler,

- alltid väljer rätt branch,

- aldrig råkar stagea fel fil,

- och alltid beskriver status korrekt.

Så många regler som möjligt ska genomdrivas tekniskt genom:

- branch protection,

- repository permissions,

- CODEOWNERS,

- required checks,

- schema- och policytester,

- secret scanning,

- protected environments,

- deployment approvals,

- och auditerade verktygsgränser.

Mänsklig och agentbaserad bedömning ska komplettera dessa kontroller.

Den ska inte ersätta dem.

Grundprincipen är:

Ingen GainPilot-förändring ska nå main eller produktion enbart därför att en agent har skapat övertygande kod och sagt att arbetet är klart. Varje förändring ska kunna följas från godkänt scope till verifierad produktion genom isolerat arbete, reproducerbara tester, kvalificerad review, skyddad merge och spårbar effektuppföljning.

25.1 GOVERNANCE SOM TEKNISKT SYSTEM

Branch-, test-, PR- och mergegovernance ska vara ett sammanhängande tekniskt system.

Systemet ska omfatta:

- repositoryidentitet,

- branchpolicy,

- worktrees,

- commitpolicy,

- testmatris,

- CI,

- pull requests,

- review,

- merge,

- release,

- deployment,

- rollback,

- och audit.

Governance ska inte endast finnas i muntliga instruktioner.

25.2 REPOSITORY SOM SKYDDAD PRODUKTIONSKÄLLA

GainPilots repository ska behandlas som en skyddad produktionskälla.

Det ska vara möjligt att avgöra:

- vilken kod som är canonical,

- vilken branch som representerar godkänd huvudlinje,

- vilka releaser som byggts,

- och vilken version som körs i varje miljö.

25.3 REPOSITORYIDENTITET

Varje repository ska ha stabil identitet.

Registret ska minst kunna innehålla:

- repository_identity,

- remote_url,

- default_branch,

- owners,

- domain_scope,

- repository_type,

- branch_policy,

- required_checks,

- deployment_targets,

- och archival_status.

25.4 FEL REPOSITORY

Arbete i fel repository ska behandlas som ett stoppvillkor.

Liknande mappnamn eller kopierade projekt får inte betraktas som tillräcklig identitetskontroll.

25.5 DEFAULT BRANCH

GainPilot ska ha en definierad default branch.

Den kan exempelvis heta:

- main,

- trunk,

- eller annan explicit fastställd identitet.

Agenter ska inte anta namnet.

25.6 MAIN SOM GODKÄND HUVUDLINJE

Main ska representera den godkända huvudlinjen.

Main ska normalt endast ta emot förändringar genom:

- pull request,

- required checks,

- och godkänd mergeprocess.

25.7 INGEN NORMAL DIREKTSKRIVNING TILL MAIN

Vanlig utveckling ska inte:

- committas direkt till main,

- pushas direkt till main,

- eller skrivas in genom administrativa genvägar.

Undantag ska vara mycket begränsade.

25.8 BREAK-GLASS FÖR REPOSITORY

Ett break-glass-flöde kan finnas för kritisk incident.

Det ska kräva:

- dokumenterad incident,

- namngiven ansvarig,

- minsta möjliga ändring,

- stark autentisering,

- audit,

- och obligatorisk eftergranskning.

25.9 DEN CANONICAL LEVERANSMODELLEN

GainPilot ska ha en canonical modell för kodleveranser.

Modellen ska minst kunna representera:

- change_identity,

- task_identity,

- repository_identity,

- base_branch,

- base_commit,

- working_branch,

- worktree_identity,

- authoring_actors,

- approved_scope,

- changed_paths,

- commit_identities,

- push_status,

- pull_request_identity,

- required_checks,

- review_requirements,

- review_status,

- merge_status,

- merge_commit,

- release_identity,

- deployment_status,

- production_verification,

- effect_status,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

25.10 FÖRÄNDRINGSIDENTITET

Varje betydelsefull förändring ska ha en stabil identitet.

Identiteten ska kunna länka:

- issue,

- utvecklingsuppgift,

- branch,

- commits,

- PR,

- deployment,

- incidenter,

- och effektuppföljning.

25.11 BASE BRANCH

Varje arbetsbranch ska ha definierad base branch.

Det ska vara tydligt vilken huvudlinje förändringen bygger på.

25.12 BASE COMMIT

Startcommit ska registreras.

Det gör det möjligt att:

- beräkna rätt diff,

- upptäcka upstreamförändringar,

- och reproducera utgångsläget.

25.13 BRANCHTYPER

GainPilot kan använda branchtyper som:

- feature,

- fix,

- security,

- documentation,

- refactor,

- migration,

- experiment,

- release,

- och hotfix.

Branchtypen ska spegla arbetets verkliga karaktär.

25.14 BRANCHNAMN

Branchnamn ska vara:

- begripligt,

- stabilt,

- och kopplat till förändringsidentiteten.

Exempel:

feat/gainpilot-workout-offline-sync

fix/exercise-substitution-deduplication

security/hermes-tenant-filtering

25.15 INGEN KÄNSLIG INFORMATION I BRANCHNAMN

Branchnamn får inte innehålla:

- användarnamn,

- medicinsk information,

- privata incidentdetaljer,

- eller secrets.

25.16 BRANCHÄGARE

Varje aktiv branch ska ha:

- uppgiftsägare,

- teknisk ägare,

- och status.

Övergivna branches ska inte förbli oklassificerade.

25.17 BRANCHSTATUS

En branch ska kunna ha status som:

- active,

- paused,

- blocked,

- awaiting_review,

- superseded,

- merged,

- abandoned,

- quarantined,

- eller archived.

25.18 WORKTREEIDENTITET

Parallella arbeten ska kunna kopplas till separata worktrees.

Varje worktree ska registrera:

- sökväg,

- branch,

- task,

- repository,

- skapandetid,

- ägare,

- och cleanupstatus.

25.19 WORKTREEISOLERING

En worktree ska endast användas för sin avsedda branch och uppgift.

Agenter får inte flytta mellan worktrees utan ny verifiering.

25.20 GEMENSAM ARBETSYTA

Flera agenter ska inte ändra samma arbetskopia samtidigt utan uttrycklig samordning.

Det kan annars skapa:

- otydlig attribution,

- konflikter,

- och oavsiktliga commits.

25.21 PRE-FLIGHT-KONTROLL

Före varje förändringsarbete ska agenten eller utvecklaren verifiera:

- aktuell katalog,

- repository root,

- git remote,

- branch,

- upstream,

- HEAD,

- status,

- och pågående rebase eller merge.

25.22 ARBETSYTANS RENHET

Arbetsytan ska klassificeras som:

- clean,

- dirty-related,

- dirty-unrelated,

- conflicted,

- eller unknown.

Klassificeringen ska påverka vilka åtgärder som är tillåtna.

25.23 DIRTY-RELATED

Dirty-related innebär att osparade ändringar tillhör den aktuella uppgiften.

De ska kunna fortsätta behandlas inom uppgiften.

25.24 DIRTY-UNRELATED

Dirty-unrelated innebär att arbetsytan innehåller ändringar utanför aktuellt scope.

Agenten får normalt:

- läsa,

- analysera,

- och rapportera.

Agenten får inte:

- stagea,

- återställa,

- eller inkludera ändringarna.

25.25 CONFLICTED

Om repositoryt har:

- mergekonflikt,

- rebasekonflikt,

- eller oavslutad cherry-pick

ska normalt skrivande arbete stoppas tills tillståndet hanterats.

25.26 UNKNOWN

Om gitstatus eller repositoryidentitet inte kan verifieras ska förändrande åtgärder nekas.

25.27 ORELATERADE FILER

Orelaterade filer ska skyddas genom:

- explicit staging,

- diffgranskning,

- paths cope,

- och pre-commit-kontroll.

25.28 EXPLICIT STAGING

GainPilot ska föredra explicit staging av:

- namngivna filer,

- eller granskade hunks.

Breda kommandon som stagear allt ska användas restriktivt.

25.29 GIT ADD ALL

`git add .` eller motsvarande ska inte vara standard i en arbetsyta som kan innehålla orelaterade ändringar.

25.30 STAGED DIFF

Före commit ska staged diff granskas.

Granskningen ska kontrollera:

- fils cope,

- secrets,

- genererade filer,

- oavsiktliga formatteringar,

- och orelaterade ändringar.

25.31 UNSTAGED DIFF

Även unstaged diff ska kontrolleras före slutrapport.

Det ska vara tydligt om relevant arbete fortfarande ligger utanför commiten.

25.32 UNTRACKED FILES

Ospårade filer ska klassificeras.

De kan vara:

- avsedda nya filer,

- lokala artefakter,

- secrets,

- temporära outputs,

- eller orelaterat material.

De får inte inkluderas automatiskt.

25.33 GITIGNORE

`.gitignore` ska skydda:

- secrets,

- lokala miljöfiler,

- cache,

- byggartefakter,

- och andra ej versionsstyrda resurser.

En ignore-regel får inte användas för att dölja betydelsefulla källfiler.

25.34 FILRADERING

Raderade filer ska granskas särskilt.

Agenten ska kunna förklara:

- varför filen tas bort,

- om den ersatts,

- om innehåll bevarats,

- och vilken påverkan borttagningen har.

25.35 BEVARANDEREGEL

Meningsbärande projektmaterial ska inte raderas innan:

- innehållet identifierats,

- eventuell canonical status fastställts,

- säker kopia verifierats,

- och borttagning godkänts.

25.36 RENAME FÖRE DELETE-AND-CREATE

När en fil endast flyttas eller döps om ska versionshistoriken bevaras så långt möjligt.

25.37 GENERERADE FILER

Repositoryt ska definiera vilka genererade filer som:

- ska committas,

- ska byggas i CI,

- eller ska ignoreras.

Agenten ska inte manuellt redigera genererad output om källan finns.

25.38 FORMATTERING

Automatisk formattering ska begränsas till relevanta filer.

En liten funktionsändring ska inte skapa en repositoryomfattande formatdiff utan separat scope.

25.39 LINE ENDINGS OCH ENCODING

Agenten ska undvika oavsiktliga förändringar i:

- radslut,

- encoding,

- filrättigheter,

- och whitespace.

Sådana förändringar kan dölja verklig diff.

25.40 FILRÄTTIGHETER

Förändrade exekveringsrättigheter eller andra filmoder ska granskas.

25.41 SUBMODULES

Submoduleändringar ska vara explicita.

En uppdaterad submodulepekare ska inte döljas bland vanliga kodändringar.

25.42 LARGE FILES

Stora binära filer ska hanteras genom godkänd lagringsmodell.

De ska inte läggas i repositoryt utan:

- behov,

- licens,

- och storleksbedömning.

25.43 COMMIT SOM SPÅRBAR ENHET

En commit ska vara en begriplig och reproducerbar förändringsenhet.

Den ska normalt representera:

- ett sammanhängande steg,

- inom ett tydligt scope.

25.44 COMMITIDENTITET

Varje commit ska ha en verifierbar hash.

Statusrapportering ska använda faktisk commitidentitet när commit har skapats.

25.45 COMMITMEDDELANDE

Commitmeddelandet ska beskriva den verkliga förändringen.

Exempel:

fix: prevent duplicate workout result ingestion

feat: add scoped Hermes context packages for Arnold

25.46 VAGA COMMITMEDDELANDEN

Commitmeddelanden som:

- update,

- changes,

- fix stuff,

- eller final

ska undvikas.

25.47 COMMITOMFÅNG

En commit ska inte blanda:

- feature,

- orelaterad refaktorering,

- dokumentstädning,

- dependencyuppdatering,

- och lokal konfiguration

utan tydlig anledning.

25.48 ATOMISKA COMMITS

Commits bör vara atomiska när det underlättar:

- review,

- revert,

- och förståelse.

Atomisk betyder inte att varje enskild rad behöver egen commit.

25.49 TEST OCH IMPLEMENTATION

Tester kan ligga i samma commit som implementationen när de tillsammans utgör en komplett förändring.

Separata commits kan användas när det förbättrar granskningsbarheten.

25.50 FIXUP-COMMITS

Fixup-commits kan användas under aktiv review.

Repositorypolicy ska avgöra om de ska squashas före merge.

25.51 SIGNERING

Kritiska repositories kan kräva signerade commits eller motsvarande verifiering.

25.52 COMMIT FÅR INTE SKAPAS UTAN SCOPEKONTROLL

Före commit ska systemet verifiera:

- att staged paths tillhör scope,

- att secrets saknas,

- och att obligatorisk lokal validering genomförts där policyn kräver det.

25.53 PRE-COMMIT-HOOKS

Pre-commit-hooks kan kontrollera:

- formatting,

- lint,

- secret scanning,

- schema,

- och policy.

Hooks ska inte vara den enda kontrollnivån.

25.54 HOOK-BYPASS

Bypass av hooks ska kräva:

- tydlig orsak,

- audit,

- och efterföljande CI-verifiering.

Agenten ska inte använda bypass för bekvämlighet.

25.55 TESTNINGENS SYFTE

Testning ska skapa evidens för att förändringen:

- uppfyller sitt syfte,

- inte bryter centrala kontrakt,

- och hanterar relevanta fel.

Testning ska inte endast maximera antal gröna tester.

25.56 TESTPYRAMID

GainPilot kan använda en balanserad teststruktur med:

- många snabba enhetstester,

- färre integrationstester,

- riktade kontraktstester,

- och selektiva end-to-end-tester.

Fördelningen ska anpassas till systemet.

25.57 DEN CANONICAL TESTMATRISEN

Varje förändring ska kunna kopplas till en testmatris.

Matrisen ska minst kunna ange:

- test_identity,

- change_identity,

- risk_class,

- test_type,

- environment,

- command,

- expected_result,

- actual_result,

- status,

- evidence,

- owner,

- och executed_at.

25.58 TESTTYPER

GainPilot ska kunna använda:

- unit,

- component,

- contract,

- integration,

- end-to-end,

- domain,

- security,

- privacy,

- accessibility,

- performance,

- migration,

- resilience,

- och manual validation.

25.59 TESTKRAV PER RISK

Riskklassen ska avgöra miniminivå.

Låg risk kan kräva:

- lint,

- typecheck,

- och riktad validering.

Kritisk risk kan kräva:

- full domäntest,

- säkerhets- och integritetstest,

- migrationstest,

- adversarial review,

- staging,

- och canary.

25.60 ENHETSTEST

Enhetstest ska verifiera isolerad logik.

Det ska vara:

- deterministiskt,

- snabbt,

- och begripligt.

25.61 KOMPONENTTEST

Komponenttest ska verifiera en större avgränsad modul med verkligare beroenden.

25.62 KONTRAKTSTEST

Kontraktstest ska verifiera samspelet mellan:

- GainPilot och Omnira,

- Arnold och Hermes,

- tjänster,

- events,

- API:er,

- och externa integrationer.

25.63 DOMÄNTEST

Domäntest ska verifiera semantisk korrekthet.

Exempel:

Ett övningsbyte ska:

- matcha avsedd rörelsefunktion,

- respektera begränsningar,

- och bevara programmets intention.

25.64 INTEGRATIONSTEST

Integrationstest ska kontrollera flera verkliga komponenter tillsammans.

Det ska inkludera relevanta:

- databaser,

- köer,

- tjänster,

- och adapters.

25.65 END-TO-END-TEST

End-to-end-test ska verifiera ett viktigt användarflöde genom systemet.

Det ska användas selektivt eftersom det kan vara:

- långsamt,

- dyrt,

- och skört.

25.66 SÄKERHETSTEST

Säkerhetstest ska kunna omfatta:

- autentisering,

- authorization,

- tenantisolering,

- secrets,

- injection,

- exfiltration,

- dependencyrisk,

- och webhookverifiering.

25.67 INTEGRITETSTEST

Integritetstest ska kunna omfatta:

- dataminimering,

- do-not-share,

- retention,

- radering,

- logging,

- och extern modellrouting.

25.68 TILLGÄNGLIGHETSTEST

Användargränssnitt ska testas för:

- tangentbord,

- skärmläsare,

- kontrast,

- textförstoring,

- och semantisk struktur.

25.69 PRESTANDATEST

Prestandatest ska kunna mäta:

- latency,

- throughput,

- databasbelastning,

- minne,

- batteri,

- modellkostnad,

- och nätverk.

25.70 MIGRATIONSTEST

Migrationstest ska omfatta:

- clean install,

- upgrade,

- avbrott,

- retry,

- realistisk datamängd,

- och verifiering.

25.71 RESILIENSTEST

Resilien test ska simulera:

- timeout,

- felande integration,

- köfördröjning,

- duplicerat event,

- unknown outcome,

- och återanslutning.

25.72 MANUELL VALIDERING

Manuell validering kan krävas för:

- visuella flöden,

- coachton,

- komplex UX,

- domänbedömning,

- och produktionsnära scenario.

Den ska dokumenteras.

25.73 TESTKOMMANDO

Varje automatiskt testresultat ska kunna kopplas till exakt kommando eller pipelinejobb.

25.74 TESTMILJÖ

Testresultat ska ange miljö.

Exempel:

- local,

- CI,

- preview,

- staging,

- eller production smoke test.

25.75 TESTEVIDENS

Evidens kan vara:

- terminaloutput,

- CI-jobb,

- rapport,

- screenshot,

- loggreferens,

- eller verifierad status.

25.76 PASS

Pass innebär att testets definierade förväntan uppfylldes.

25.77 FAIL

Fail innebär att förväntan inte uppfylldes.

Agenten ska inte beskriva fail som:

- mindre detalj,

- om testet är required.

25.78 SKIPPED

Skipped ska redovisas.

Orsaken ska vara känd.

25.79 NOT RUN

Not run ska skiljas från skipped.

Ett test som aldrig startades är inte ett passerat test.

25.80 FLAKY

Flaky tests ska markeras.

Omkörning kan ge mer information.

Den får inte användas för att dölja instabilitet.

25.81 QUARANTINED TEST

Ett känt instabilt test kan tillfälligt sättas i karantän.

Det ska ha:

- ägare,

- issue,

- tidsgräns,

- och reparationsplan.

25.82 INGEN OBEGRÄNSAD KARANTÄN

Karantän får inte bli en permanent väg runt testkrav.

25.83 TESTORDER

Vissa teststeg ska kunna stoppa senare dyrare steg.

Exempel:

1. Schema och lint.

2. Typecheck.

3. Unit.

4. Contract.

5. Integration.

6. Security.

7. Build.

8. End-to-end.

25.84 FAIL FAST

Fail fast kan minska kostnad.

Systemet ska fortfarande bevara tillräcklig diagnostik.

25.85 TESTPARALLELLISERING

Tester kan köras parallellt när:

- de är isolerade,

- deterministiska,

- och inte delar skadligt tillstånd.

25.86 TESTISOLERING

Tester ska inte påverka varandra genom:

- delad databas,

- gemensam användare,

- ordningsberoende,

- eller kvarvarande cache.

25.87 REALISTISK DATA

Testdata ska vara realistisk nog att upptäcka domänfel.

Den ska inte innehålla verkliga personuppgifter utan särskild grund.

25.88 FIXTURES

Fixtures ska vara:

- versionerade,

- begripliga,

- och kopplade till testsyfte.

25.89 GOLDEN DATA

Golden datasets kan användas för:

- substitutionsmotor,

- progressionsanalys,

- agentutdata,

- och importnormalisering.

Datasetet ska granskas och versioneras.

25.90 MODELLTESTER

AI-agent- och modellfunktioner ska testas genom:

- scenario suites,

- structured output,

- policyefterlevnad,

- confidence,

- och kvalitetsbedömning.

25.91 ICKE-DETERMINISM

Modelltester ska hantera icke-determinism.

Det kan ske genom:

- intervall,

- flera körningar,

- constraints,

- och kvalitativ review.

25.92 SNAPSHOTS

Snapshots ska inte godkännas enbart genom att uppdateras.

Diffen ska granskas semantiskt.

25.93 TESTTÄCKNING

Kodtäckning kan användas som diagnostiskt mått.

Hög procentsats är inte bevis på hög testkvalitet.

25.94 MUTATION TESTING

Mutation testing kan användas för kritisk logik för att bedöma om tester verkligen upptäcker fel.

25.95 PROPERTY-BASED TESTING

Property-based testing kan användas för:

- datakontrakt,

- substitutionsregler,

- kalenderlogik,

- och idempotens.

25.96 REGRESSIONSTEST

Varje verifierat produktionsfel bör där det är rimligt skapa ett regressionstest.

25.97 TESTSKULD

Testskuld ska registreras.

Den ska inte döljas bakom en allmän teknisk skuldlista.

25.98 OBLIGATORISKA TESTER

Required checks ska motsvara:

- repository,

- risk,

- och berörda paths.

En dokumentationsändring behöver inte alltid köra samma matris som en datamigration.

25.99 PATH-BASED CHECKS

CI kan välja relevanta jobb efter förändrade paths.

Path-baserad optimering ska inte hoppa över test som påverkas indirekt.

25.100 DEPENDENCY-AWARE CHECKS

Kodgraf eller beroendekarta kan hjälpa CI avgöra påverkade moduler.

Kartan ska vara aktuell.

25.101 FULL REGRESSION

Full regression ska kunna krävas vid:

- release,

- central arkitekturförändring,

- dependencyuppgradering,

- schemaändring,

- eller hög risk.

25.102 TESTRESULTATETS GILTIGHET

Ett testresultat gäller för:

- en viss commit,

- en viss miljö,

- och en viss konfiguration.

Ny commit kan göra tidigare resultat inaktuellt.

25.103 STALE CHECKS

PR-checks ska omköras när:

- ny commit pushas,

- basbranchen förändras på relevant sätt,

- eller required configuration uppdateras.

25.104 CI SOM OBEROENDE KONTROLL

CI ska köra tester i en kontrollerad miljö separat från agentens lokala miljö.

25.105 CI FÅR INTE LITA PÅ LOKAL STATUS

Lokalt pass är ett viktigt bevis.

Det ersätter inte required remote checks.

25.106 CI-IDENTITET

Varje pipelinekörning ska ha:

- run identity,

- commit,

- branch,

- event,

- miljö,

- och status.

25.107 CI-SECRETS

CI-secrets ska vara:

- miljöspecifika,

- minimerade,

- roterbara,

- och ej exponerade till okända workflows.

25.108 PULL REQUESTS FRÅN FORKS

PR från forks ska inte få känsliga secrets automatiskt.

25.109 WORKFLOW-FÖRÄNDRINGAR

Ändringar i CI-workflows ska granskas särskilt eftersom de kan påverka:

- secrets,

- checks,

- release,

- och branch protection.

25.110 BUILD

CI ska verifiera att produkten kan byggas reproducerbart.

25.111 ARTEFAKTIDENTITET

Buildartefakter ska kopplas till:

- commit,

- pipeline,

- dependencylock,

- och byggmiljö.

25.112 SBOM

GainPilot kan skapa Software Bill of Materials för relevanta releaser.

25.113 PROVENANCE FÖR BUILD

Kritiska artefakter bör ha build provenance eller motsvarande spårbarhet.

25.114 SECRET SCANNING

Secret scanning ska köras:

- före push där möjligt,

- i CI,

- och på repositoryhistorik enligt policy.

25.115 DEPENDENCY SCANNING

Dependencies ska kontrolleras för:

- kända sårbarheter,

- licens,

- och oväntade förändringar.

25.116 STATIC ANALYSIS

Statisk analys kan kontrollera:

- kodfel,

- säkerhet,

- dead code,

- och policybrott.

25.117 DYNAMIC ANALYSIS

Dynamisk analys kan användas för:

- runtimefel,

- säkerhetsproblem,

- och integrationer.

25.118 CODEQL ELLER MOTSVARANDE

Avancerad kodanalys kan användas där det ger relevant täckning.

25.119 CI-BUDGET

CI ska ha kostnadsstyrning.

Optimering får inte ta bort kritiska kontroller.

25.120 PR SOM GRANSKNINGSOBJEKT

Pull request ska vara den centrala granskningsenheten för normal utveckling.

PR:n ska samla:

- diff,

- scope,

- bevis,

- diskussion,

- checks,

- approvals,

- och mergehistorik.

25.121 PR-IDENTITET

Varje PR ska ha unik identitet och kopplas till förändringsuppgiften.

25.122 PR-BASE

PR:n ska ha rätt base branch.

Fel base ska behandlas som blockerande.

25.123 PR-HEAD

PR:ns head branch ska motsvara den avsedda arbetsbranchen.

25.124 PR-TITEL

PR-titeln ska kort beskriva den verkliga förändringen.

25.125 PR-BESKRIVNING

PR-beskrivningen ska minst innehålla:

- problem,

- mål,

- scope,

- exkluderat scope,

- genomförda ändringar,

- testresultat,

- risk,

- migration,

- rollout,

- och rollback.

25.126 CANONICAL KONTRAKT I PR

När förändringen implementerar eller påverkar canonical kontrakt ska de refereras.

25.127 ISSUE-LÄNK

PR:n ska kunna länkas till:

- issue,

- intelligence item,

- incident,

- eller roadmapinitiativ.

25.128 PR-MALL

GainPilot ska använda PR-mallar anpassade efter förändringstyp.

Exempel:

- normal feature,

- security,

- migration,

- documentation,

- och hotfix.

25.129 CHECKLISTOR

Checklistor kan hjälpa säkerställa att relevanta steg genomförts.

De ska inte bli en mekanisk ersättning för review.

25.130 DRAFT PR

Draft PR kan användas för:

- tidig feedback,

- arkitekturdiskussion,

- och synlig arbetsstatus.

Draft ska inte mergeas.

25.131 PR-STORLEK

PR:n ska vara så liten som praktiskt möjligt men tillräckligt komplett för att vara säker och användbar.

25.132 FÖR STOR PR

En stor PR ska kunna kräva:

- uppdelning,

- särskild reviewplan,

- eller stegvis merge bakom flagg.

25.133 ORELATERADE ÄNDRINGAR I PR

Orelaterade förändringar ska flyttas till separata uppgifter och PR:er.

25.134 AUTOMATISK PR-SAMMANFATTNING

En agent kan skapa en PR-sammanfattning.

Sammanfattningen ska verifieras mot den faktiska diffen.

25.135 INGEN HALLUCINERAD PR-BESKRIVNING

PR:n får inte påstå att:

- ett test körts,

- en migration verifierats,

- eller en funktion implementerats

utan evidens.

25.136 SCREENSHOTS

UI-förändringar ska kunna kräva:

- före- och efterbilder,

- responsiva vyer,

- och tillgänglighetsbevis.

25.137 VIDEO

Komplexa interaktioner kan dokumenteras med kort video eller motsvarande bevis.

25.138 LOGG- OCH QUERYBEVIS

Backend- och migrationsändringar kan kräva:

- loggreferenser,

- queryresultat,

- eller schemautdrag.

25.139 KÄNSLIGT BEVIS

PR-bevis får inte exponera:

- användardata,

- secrets,

- tokens,

- eller privat incidentinformation.

25.140 REVIEW SOM KVALIFICERAD BEDÖMNING

Review ska bedöma mer än syntax.

Den ska kunna omfatta:

- produktmål,

- domänkorrekthet,

- arkitektur,

- säkerhet,

- integritet,

- testkvalitet,

- drift,

- kostnad,

- och underhållbarhet.

25.141 REVIEWROLLER

Review kan kräva roller som:

- code owner,

- domain reviewer,

- security reviewer,

- privacy reviewer,

- data reviewer,

- UX reviewer,

- och release owner.

25.142 CODEOWNERS

CODEOWNERS eller motsvarande kan kräva rätt granskare för känsliga paths.

25.143 PATH-BASED REVIEW

Förändringar i särskilda mappar ska kunna utlösa krav på specifik review.

Exempel:

- `security/`,

- `hermes/`,

- `training-engine/`,

- `nutrition/`,

- `migrations/`,

- och `agent-policies/`.

25.144 OBEROENDE REVIEW

Hög- och kritisk risk ska kräva granskare som inte skapade implementationen.

25.145 AGENTREVIEW

AI-agenter kan bidra till review.

De ska inte vara enda godkännare för kritisk förändring.

25.146 MÄNSKLIG REVIEW

Mänsklig review ska krävas där:

- ansvar,

- risk,

- juridik,

- eller professionell domänbedömning

inte kan delegeras fullt ut.

25.147 REVIEWSTATUS

En review ska kunna ha status:

- pending,

- commented,

- changes_requested,

- approved,

- dismissed,

- eller stale.

25.148 STALE APPROVAL

Approval kan bli stale när:

- betydelsefull ny commit tillkommer,

- scope ändras,

- eller basen uppdateras.

Då ska ny review kunna krävas.

25.149 CHANGES REQUESTED

En blockerande begäran om ändring ska stoppa merge tills den:

- hanterats,

- eller uttryckligen avfärdats av behörig aktör.

25.150 REVIEWKOMMENTAR

Kommentarer ska vara:

- konkreta,

- kopplade till kod eller princip,

- och klassificerade efter allvar.

25.151 BLOCKER

Blocker innebär att förändringen inte får mergeas i aktuellt tillstånd.

25.152 REQUIRED

Required innebär att frågan ska lösas före merge, men behöver inte representera akut risk.

25.153 SUGGESTION

Suggestion kan förbättra lösningen men blockerar inte normalt merge.

25.154 QUESTION

Question begär förklaring och kan bli blockerande beroende på svaret.

25.155 REVIEWRESOLUTION

En kommentar ska inte markeras resolved förrän:

- kod ändrats,

- test lagts till,

- dokumentation uppdaterats,

- eller motiverad förklaring accepterats.

25.156 BULK RESOLVE

Automatisk bulk resolution ska undvikas för betydelsefulla kommentarer.

25.157 SELF-APPROVAL

Författaren ska inte ensam kunna slutgodkänna sin egen högriskförändring.

25.158 FYRAÖGONSPRINCIP

Kritisk förändring ska kräva minst två oberoende kontrollperspektiv.

Exempel:

- teknisk + domän,

- teknisk + säkerhet,

- eller integritet + ägare.

25.159 REVIEW AV TESTER

Granskaren ska bedöma:

- om rätt beteende testas,

- inte bara om testfil finns.

25.160 REVIEW AV BORTTAGNING

Borttagning av:

- kod,

- datafält,

- migration,

- policy,

- test,

- eller dokumentation

ska granskas för förlorat skydd eller innehåll.

25.161 REVIEW AV DEPENDENCIES

Ny eller uppdaterad dependency ska granskas för:

- behov,

- version,

- licens,

- säkerhet,

- och lock-in.

25.162 REVIEW AV PROMPTS OCH POLICIES

Förändringar i agentprompts och policies ska granskas som produktlogik när de påverkar:

- beteende,

- data,

- authority,

- eller användarkommunikation.

25.163 REVIEW AV MIGRATIONER

Migrationer ska granskas för:

- låsning,

- kompatibilitet,

- databevarande,

- retry,

- och rollback eller repair.

25.164 REVIEW AV OBSERVABILITY

Ny funktion ska ha tillräcklig observability utan känslig överloggning.

25.165 REVIEW AV ROLLBACK

Rollbackplanen ska vara realistisk.

Formuleringen:

Reverta PR:n

är inte alltid tillräcklig vid schema- eller dataförändring.

25.166 MERGE READINESS

En PR är merge ready först när alla definierade villkor är uppfyllda.

25.167 DEN CANONICAL MERGE READINESS-MODELLEN

Merge readiness ska minst kunna bedöma:

- correct_base,

- branch_up_to_date,

- required_checks_passed,

- required_reviews_approved,

- no_blocking_conversations,

- scope_validated,

- migration_ready,

- rollout_ready,

- rollback_ready,

- security_status,

- privacy_status,

- och owner_decision.

25.168 GRÖNA CHECKS

Alla required checks ska vara gröna.

Optional checks ska ha dokumenterad status.

25.169 PÅGÅENDE CHECKS

PR ska inte mergeas medan required checks pågår.

25.170 CANCELLED CHECKS

Cancelled är inte samma sak som passed.

25.171 NEUTRAL OCH SKIPPED CHECKS

Neutral eller skipped status ska bedömas enligt checkens avsikt.

Required verifiering får inte försvinna genom felaktig villkorslogik.

25.172 MERGEKONFLIKT

Mergekonflikt ska lösas kontrollerat.

Konfliktlösningen ska:

- granskas,

- testas,

- och inte endast välja ena sidan mekaniskt.

25.173 BEHIND MAIN

Repositorypolicy ska avgöra om branch måste vara uppdaterad mot main före merge.

25.174 UPPDATERING MOT MAIN

När branch uppdateras ska relevanta:

- tester,

- approvals,

- och checks

omvärderas.

25.175 MERGE QUEUE

GainPilot kan använda merge queue för att verifiera förändringen mot aktuell huvudlinje före merge.

25.176 MERGE TRAIN

Flera väntande PR:er kan testas i ordnad kö för att minska integrationsfel.

25.177 BATCH MERGE

Flera orelaterade PR:er ska inte batchmergeas utan möjlighet att identifiera orsaken vid fel.

25.178 MERGEMANDAT

Merge ska kräva separat capability.

Att kunna:

- skriva kod,

- committa,

- pusha,

- och skapa PR

innebär inte mergebehörighet.

25.179 MERGEBESLUTSÄGARE

Merge ska ha identifierad beslutsägare.

Ägaren ska förstå:

- risk,

- review,

- checks,

- rollout,

- och rollback.

25.180 AGENTMERGE

En agent kan få mergecapability för:

- låg risk,

- tydligt avgränsade förändringar,

- med fulla tekniska skydd.

Mandatet ska förtjänas och kunna återkallas.

25.181 INGEN AUTOMATISK HÖGRISKMERGE

Säkerhets-, integritets-, tenant-, migrations- och domänkritiska förändringar ska normalt inte mergeas helt automatiskt.

25.182 MERGESTRATEGI

Repositoryt ska definiera tillåten strategi:

- squash merge,

- merge commit,

- eller rebase merge.

25.183 SQUASH MERGE

Squash merge kan skapa tydlig huvudlinje.

PR-historiken ska bevara detaljerna.

25.184 MERGE COMMIT

Merge commit kan användas när branchhistorik och integrationspunkt är värdefull.

25.185 REBASE MERGE

Rebase merge kan användas där linjär historik önskas.

Konflikt- och signeringspolicy ska följas.

25.186 MERGE COMMITIDENTITET

Efter merge ska faktisk commitidentitet verifieras.

25.187 PR-STATUS EFTER MERGE

Systemet ska verifiera att PR:n verkligen är:

- merged,

- och inte endast closed.

25.188 CLOSED WITHOUT MERGE

En stängd PR ska inte beskrivas som mergad.

25.189 AUTO-CLOSE

Issues som stängs automatiskt vid merge ska verifieras så att rätt arbete faktiskt slutförts.

25.190 POST-MERGE-BRANCH

Branch kan raderas efter merge när:

- arbetet är verifierat,

- materialet bevarats,

- och ingen annan process använder den.

25.191 INGEN FÖRHASTAD BRANCHRADERING

Branch ska inte raderas om:

- deployment pågår,

- incidentutredning kräver den,

- eller omergat meningsbärande arbete finns.

25.192 WORKTREE CLEANUP

Worktree ska städas först efter:

- verifierad merge eller avbruten status,

- kontroll av ospårade filer,

- och bevarande av relevanta artefakter.

25.193 MERGE ÄR INTE RELEASE

Mergad kod kan vänta till:

- nästa release,

- feature flag,

- eller annan deploymentprocess.

25.194 RELEASEIDENTITET

Varje release ska ha:

- release_identity,

- version,

- commit,

- artefakter,

- migrationer,

- release notes,

- och target environments.

25.195 RELEASEBRANCH

Releasebranch kan användas när produkten kräver:

- stabiliseringsperiod,

- backports,

- eller samordnad release.

Den ska inte skapa långvarig parallell huvudlinje utan behov.

25.196 VERSIONERING

GainPilot ska använda definierad versionsstrategi.

Den kan omfatta:

- semantisk versionering,

- datumversion,

- buildnummer,

- eller kombination.

25.197 RELEASE CANDIDATE

En release candidate ska vara en definierad artefakt som kan testas innan produktion.

25.198 ARTEFAKTPROMOTION

Samma verifierade artefakt bör där det är möjligt flyttas från:

- staging,

- till production

i stället för att byggas om.

25.199 DEPLOYMENT SOM EGET WORKFLOW

Deployment ska vara ett separat, observerbart workflow.

25.200 DEPLOYMENTSTATUS

Deployment ska kunna ha status som:

- queued,

- awaiting_approval,

- running,

- succeeded,

- failed,

- cancelled,

- rolled_back,

- degraded,

- eller unknown_outcome.

25.201 DEPLOYMENTMANDAT

Deployment ska kräva egen capability och relevant miljöbehörighet.

25.202 PROTECTED ENVIRONMENTS

Staging och production ska kunna skyddas genom:

- miljögodkännanden,

- begränsade secrets,

- och tillåtna aktörer.

25.203 DEPLOYMENTAPPROVAL

Hög risk ska kräva separat deploymentapproval även om PR:n är godkänd.

25.204 DEPLOYMENTPLAN

Planen ska innehålla:

- målmiljö,

- artefakt,

- schemaordning,

- flags,

- health checks,

- rollback,

- och kommunikation.

25.205 MIGRATION FÖRE KOD

Vissa förändringar kräver att schema expanderas före ny kod.

25.206 KOD FÖRE CLEANUP

Gammalt schema eller kod ska inte tas bort innan alla konsumenter har migrerat.

25.207 FEATURE FLAG

Feature flag ska kunna frikoppla:

- deployment,

- från användaraktivering.

25.208 FLAGGSTATUS

Efter deployment ska flaggens faktiska status verifieras.

25.209 INTERN TENANT

Intern tenant kan användas som första produktionsnära aktiveringsnivå.

25.210 CANARY

Canary ska begränsa förändringen till definierad population.

25.211 CANARYMÅTT

Canary ska följa:

- teknisk hälsa,

- domänkorrekthet,

- säkerhet,

- användarkorrigering,

- och kostnad.

25.212 STOPPREGEL

Canary ska ha automatiska eller manuella stoppvillkor.

25.213 GRADVIS UTRULLNING

Utrullning kan ske stegvis efter:

- tenant,

- procent,

- plattform,

- region,

- användargrupp,

- eller capability.

25.214 FULL UTRULLNING

Full utrullning ska kräva att:

- canary är stabil,

- skyddsmått är acceptabla,

- och inga blockerande incidenter finns.

25.215 DEPLOYMENT UNKNOWN OUTCOME

Om deploymentens utfall är okänt ska systemet verifiera miljön innan retry.

Det får inte anta att inget deployades.

25.216 IDEMPOTENT DEPLOYMENT

Deploymentverktyg ska där möjligt vara idempotenta.

25.217 ROLLBACK

Rollback ska kunna omfatta:

- artefakt,

- feature flag,

- routing,

- modell,

- policy,

- och integration.

25.218 DATA OCH ROLLBACK

Dataförändringar kan göra enkel kodrollback olämplig.

Planen ska då ange:

- forward fix,

- compensation,

- eller reparationsmigration.

25.219 AUTOMATISK ROLLBACK

Automatisk rollback kan användas för tydliga tekniska fel.

Den ska inte användas när rollback kan:

- förvärra data,

- skapa schemafel,

- eller återinföra känd sårbarhet.

25.220 PRODUKTIONSVERIFIERING

Efter deployment ska GainPilot verifiera verkligt produktionstillstånd.

25.221 HEALTH CHECK

Health check ska kontrollera mer än att processen svarar.

Den kan omfatta:

- databas,

- kö,

- kritiska dependencies,

- och centrala capabilities.

25.222 SMOKE TEST

Smoke test ska verifiera centrala användarflöden med säkra testidentiteter.

25.223 SYNTHETIC TEST

Syntetiska tester kan regelbundet verifiera kritiska flöden.

25.224 REAL USER MONITORING

Produktionsuppföljning kan använda integritetssäker real user monitoring där relevant.

25.225 LOGGAR

Loggar ska granskas för:

- nya fel,

- exceptions,

- retries,

- och policyblockeringar.

25.226 METRICS

Relevanta tekniska och domänmässiga metrics ska jämföras med baseline.

25.227 TRACES

Distribuerade flöden ska kontrolleras när förändringen påverkar flera tjänster.

25.228 MIGRATIONSVERIFIERING

Migrationens faktiska status ska verifieras.

25.229 FEATURE FLAG-VERIFIERING

Det ska vara känt:

- vem som har funktionen,

- och vilken variant som är aktiv.

25.230 ANVÄNDARPÅVERKAN

GainPilot ska följa:

- fel,

- support,

- korrigeringar,

- avbrutna flöden,

- och relevanta skyddsmått.

25.231 PRODUKTIONSINCIDENT

Om release orsakar incident ska:

- rollout stoppas,

- relevant capability isoleras,

- och incidentprocess startas.

25.232 POST-DEPLOYMENT STATUS

Efter deployment ska status kunna vara:

- verified,

- degraded,

- incident,

- awaiting_effect,

- eller rolled_back.

25.233 VERIFIERAD PRODUKTION

Verified innebär att:

- rätt artefakt körs,

- miljön är stabil,

- kritiska flöden fungerar,

- och inga blockerande signaler upptäckts.

25.234 AWAITING EFFECT

Tekniskt stabil release kan fortfarande vänta på produktmässig effektuppföljning.

25.235 VALIDERAD PRODUKTNYTTA

Validated outcome innebär att:

- avsedd effekt,

- relevanta skyddsmått,

- och tillräcklig tidsperiod

har bedömts.

25.236 STATUSSPRÅK

GainPilot ska använda precisa statusformuleringar.

Exempel:

- Lokala ändringar finns.

- Riktade tester passerar.

- Commit skapad.

- Branch pushad.

- PR öppnad.

- Checks passerar.

- Required reviews är godkända.

- PR är merge ready.

- PR är mergad.

- Release är deployad till staging.

- Produktion är verifierad.

- Effekten är ännu inte validerad.

25.237 ORDET KLART

Ordet klart ska endast användas när det är tydligt vilket steg som är klart.

25.238 EVIDENS

Varje status ska kunna stödjas av:

- commit hash,

- PR-status,

- checkresultat,

- review,

- deploymentidentitet,

- eller produktionsbevis.

25.239 STATUS FRÅN AGENTER

Agentrapporter ska genereras från verifierat systemtillstånd där möjligt.

25.240 INGEN STATUSINFERENS FRÅN TEXT

Systemet ska inte anta att arbete är:

- testat,

- committat,

- eller mergat

enbart för att agenten skriver det.

25.241 AUDIT

Betydelsefulla steg ska auditeras.

Exempel:

- branch skapades,

- protected file ändrades,

- check bypassades,

- review dismissed,

- merge utfördes,

- deployment godkändes,

- eller rollback genomfördes.

25.242 REVIEW DISMISSAL

Avfärdande av en review ska kräva:

- behörig aktör,

- motivering,

- och audit.

25.243 ADMIN OVERRIDE

Administrativ override av branch protection ska behandlas som särskild händelse.

25.244 BYPASS AV REQUIRED CHECK

Bypass ska normalt förbjudas.

Undantag ska kräva incident- eller governanceprocess.

25.245 AUDIT OCH KÄNSLIG DATA

Audit ska inte lagra:

- secrets,

- full användardata,

- eller onödiga incidentdetaljer.

25.246 REPOSITORYINCIDENT

En governanceincident kan vara:

- direkt push till main,

- secret commit,

- merge utan required review,

- fel base,

- radering av projektmaterial,

- eller felaktig statusrapport.

25.247 KARANTÄN

En branch, commit, PR eller release ska kunna sättas i karantän.

25.248 QUARANTINED PR

En karantänmarkerad PR ska inte mergeas förrän:

- orsak utretts,

- scope verifierats,

- och skydd återställts.

25.249 SECRET INCIDENT

Om secret committas ska:

- secretet roteras,

- exponeringen utredas,

- historiken hanteras,

- och berörda system kontrolleras.

Att endast radera raden i en ny commit är inte tillräckligt.

25.250 FELAKTIG MERGE

Vid felaktig merge ska systemet bedöma:

- revert,

- forward fix,

- branch restoration,

- och deploymentpåverkan.

25.251 FELAKTIG RADERING

Raderat meningsbärande material ska återställas från:

- git,

- branch,

- backup,

- eller verifierad artefakt

innan vidare städning.

25.252 KONSEKVENSANALYS

Incidenten ska kopplas till:

- filer,

- commits,

- PR,

- deployment,

- användare,

- data,

- och andra branches.

25.253 POST-INCIDENT REVIEW

Review ska analysera:

- varför kontrollen inte fungerade,

- vilka antaganden som var fel,

- och vilken teknisk förbättring som krävs.

25.254 GOVERNANCEPOLICY SOM KOD

Så många regler som möjligt ska uttryckas genom:

- branch rules,

- required checks,

- permissions,

- environment protection,

- CODEOWNERS,

- och automatiska valideringar.

25.255 POLICYVERSIONERING

Branch-, CI-, review- och mergepolicy ska versioneras.

25.256 POLICYFÖRÄNDRING

Förändringar i governance ska själva följa:

- branch,

- test,

- review,

- och approval.

25.257 INGEN SJÄLVMODIFIERING

Utvecklingsagenter får inte själva:

- ta bort required checks,

- ändra CODEOWNERS,

- sänka reviewkrav,

- ge sig mergebehörighet,

- eller ändra protected environments.

25.258 FÖRSLAG TILL GOVERNANCEFÖRBÄTTRING

Agenter får föreslå förbättringar.

Förslaget ska innehålla:

- problem,

- evidens,

- risk,

- och testplan.

25.259 REPOSITORYPOLICYREGISTER

GainPilot ska ha ett register över:

- repositories,

- default branches,

- required checks,

- owners,

- merge strategy,

- och deploymentrelationer.

25.260 CHECKREGISTER

Varje required check ska ha:

- identitet,

- syfte,

- ägare,

- trigger,

- giltig status,

- och failure owner.

25.261 REVIEWREGISTER

Kritiska paths och förändringstyper ska ha definierade reviewkrav.

25.262 MERGEREGISTER

Systemet ska kunna visa:

- vem som mergeade,

- vilket mandat,

- vilken status,

- och vilken commit som skapades.

25.263 RELEASE- OCH DEPLOYMENTREGISTER

Varje release och deployment ska kunna länkas till:

- PR,

- commits,

- artefakt,

- miljö,

- och verifiering.

25.264 METRICS FÖR GOVERNANCE

GainPilot ska mäta:

- failed checks,

- stale approvals,

- mergekonflikter,

- reviewtid,

- production escapes,

- rollbackfrekvens,

- och bypasshändelser.

25.265 REVIEWTID

Lång reviewtid kan vara en flaskhals.

Den ska inte lösas genom att ta bort nödvändiga kontroller utan analys.

25.266 FALSE GREEN

Ett false green inträffar när checks passerar men verklig funktion är fel.

Det ska leda till:

- testanalys,

- och förbättrad täckning.

25.267 FALSE RED

Ett false red inträffar när check blockerar korrekt förändring på grund av:

- instabilitet,

- miljöfel,

- eller felaktig regel.

Även detta ska följas.

25.268 BYPASS RATE

Andel bypassade kontroller ska vara mycket låg och granskas.

25.269 MERGE FAILURE RATE

GainPilot ska följa hur ofta en merge orsakar:

- buildfel,

- deploymentfel,

- eller snabb rollback.

25.270 PRODUCTION ESCAPE RATE

Fel som når produktion ska kopplas till:

- missade tester,

- reviewluckor,

- eller okända beroenden.

25.271 CHANGE FAILURE RATE

Change failure rate kan användas som operativt mått.

Definitionen ska vara tydlig.

25.272 LEAD TIME

Lead time ska mätas från relevant startpunkt till:

- merge,

- deployment,

- eller validerad effekt.

Dessa ska inte blandas.

25.273 DEPLOYMENT FREQUENCY

Deployment frequency kan vara användbart.

Hög frekvens är inte automatiskt bättre om:

- kvalitet,

- säkerhet,

- eller produktfokus

försämras.

25.274 MEAN TIME TO RECOVERY

Återställningstid ska följas för produktionsincidenter.

25.275 REVIEW QUALITY

Reviewkvalitet kan följas genom:

- upptäckta fel,

- återkommande kommentarstyper,

- och produktion escapes.

25.276 AGENT STATUS ACCURACY

Systemet ska mäta hur ofta agentens statusrapport motsvarar faktisk:

- git,

- PR,

- CI,

- merge,

- och deploymentstatus.

25.277 HALLUCINERAD STATUS SOM INCIDENTSIGNAL

Återkommande felaktig statusrapport ska kunna sänka agentens authority.

25.278 EARNED MERGE AUTONOMY

Mergeautonomi ska förtjänas separat från kodautonomi.

25.279 LÅGRISKMERGE

En agent kan senare få mergea exempelvis:

- typografisk dokumentationsfix,

- automatiskt genererad dependencyuppdatering med fulla checks,

- eller annan tydligt definierad lågriskklass.

Mandatet ska vara begränsat.

25.280 HÖGRISKMERGE

Följande ska normalt kräva mänsklig eller särskilt behörig approval:

- träningsmotor,

- kostmotor,

- Hermes,

- authorization,

- tenantisolering,

- radering,

- agentauthority,

- och kritiska migrationer.

25.281 AUTONOMIEXPIRY

Merge- och deploymentmandat ska kunna löpa ut.

25.282 AUTONOMIREVIEW

Mandat ska omprövas efter:

- modellbyte,

- governanceincident,

- quality degradation,

- eller repositoryförändring.

25.283 KONTROLLERAD STÄDNING

Städning efter merge ska vara ett eget steg.

Den kan omfatta:

- branch,

- worktree,

- preview,

- temporära artefakter,

- och feature flags.

25.284 STÄDNINGSBEVIS

Före radering ska systemet verifiera:

- merge,

- backup där relevant,

- inga ospårade värdefulla filer,

- och att deployment eller arkiv inte behöver materialet.

25.285 ARKIVERING FÖRE RADERING

Osäkert material ska arkiveras före permanent borttagning.

25.286 CANONICAL DOKUMENTATION

Canonical böcker, manifest och godkända arkitekturartefakter ska skyddas från automatisk cleanup.

25.287 SLUTSTÄDNING AV BOKMATERIAL

När GainPilot-boken är färdig ska en separat kontrollerad slutstädning genomföras.

Den ska:

- skilja källor,

- proofs,

- produktion,

- final,

- och arkiv,

- verifiera checksummor,

- och undvika radering före slutleverans.

25.288 KONTROLLERAD GOVERNANCEUTVECKLING

Förändringar av detta system ska följa:

Signal

→ analys

→ governanceförslag

→ hot- och konsekvensbedömning

→ godkänt scope

→ separat branch

→ implementation

→ policy- och CI-tester

→ repositorytest

→ pull request

→ oberoende review

→ shadow eller dry run

→ canary där relevant

→ merge

→ verifiering

→ uppföljning.

25.289 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för branch-, test-, PR- och mergegovernance.

**Kontrakt GP-478 — Leveranstillstånd ska vara separata**

Lokal ändring, testad kod, commit, push, PR, review, merge, deployment, produktionsverifiering och validerad effekt ska representeras som skilda tillstånd.

**Kontrakt GP-479 — Main ska vara skyddad huvudlinje**

Normal utveckling får endast nå main genom godkänd pull request, required checks och behörigt mergebeslut.

**Kontrakt GP-480 — Repositorymiljön ska verifieras före förändring**

Repository, remote, branch, worktree, upstream, HEAD, status och pågående gitoperationer ska kontrolleras innan skrivande arbete.

**Kontrakt GP-481 — Orelaterade ändringar får aldrig följa med**

Staging, commit, push och PR ska endast innehålla granskade filer och hunks inom godkänt scope.

**Kontrakt GP-482 — Meningsbärande projektmaterial ska bevaras**

Filer, branches, worktrees, dokument och artefakter får inte raderas innan innehåll, canonical status, säker kopia och borttagningsmandat har verifierats.

**Kontrakt GP-483 — Commits ska vara fokuserade och bevisbara**

Varje commit ska representera en begriplig förändring, ha korrekt identitet och inte beskrivas som skapad förrän hash och branch verifierats.

**Kontrakt GP-484 — Testresultat ska vara commit- och miljöbundna**

Ett testbevis ska ange kommando, commit, miljö, status, skips och begränsningar och får inte återanvändas efter relevant kodförändring.

**Kontrakt GP-485 — Risk ska styra testmatrisen**

Testkrav ska öka med domän-, säkerhets-, integritets-, migrations- och produktionsrisk och får inte reduceras till en universell minimikontroll.

**Kontrakt GP-486 — Skipped och not run är inte passed**

Alla ej körda, avbrutna, instabila och karantänsatta tester ska redovisas och får inte presenteras som fullständigt godkänd testsvit.

**Kontrakt GP-487 — CI är en oberoende verifieringsgräns**

Lokala tester får inte ersätta required remote checks som körs mot rätt commit i kontrollerad miljö.

**Kontrakt GP-488 — Pull request ska vara normal granskningsgräns**

Varje vanlig förändring ska levereras genom fokuserad PR med problem, scope, testbevis, risk, migration, rollout och rollback.

**Kontrakt GP-489 — PR-beskrivning ska motsvara faktisk diff**

Automatiska eller manuella sammanfattningar får inte påstå implementation, tester eller påverkan som inte kan verifieras i kod och evidens.

**Kontrakt GP-490 — Review ska vara roll- och riskbaserad**

Berörda code owners, domän-, säkerhets-, integritets-, data- och releaseansvariga ska granskas enligt paths och riskklass.

**Kontrakt GP-491 — Författaren får inte ensam godkänna kritisk förändring**

Hög- och kritisk risk ska kräva oberoende review och vid behov fyraögonsprincip.

**Kontrakt GP-492 — Reviewkommentarer ska lösas verkligt**

Blockerande och required kommentarer får inte markeras lösta utan kodändring, test, dokumentation eller accepterad motivering.

**Kontrakt GP-493 — Merge readiness ska vara explicit**

En PR får endast betraktas som merge ready när base, checks, reviews, conversations, scope, migration, rollout, rollback och ansvarigt beslut är verifierade.

**Kontrakt GP-494 — Merge kräver separat mandat**

Rätt att skriva, committa, pusha eller skapa PR ger inte automatisk rätt att mergea.

**Kontrakt GP-495 — Closed är inte merged och merged är inte deployed**

PR-, merge-, release- och deploymentstatus ska hämtas från verkligt systemtillstånd och aldrig härledas från otydlig text.

**Kontrakt GP-496 — Deployment ska vara progressiv och verifierbar**

Högre risk ska använda skyddade miljöer, artefaktidentitet, staging, flags, canary, stoppregler, rollback och produktionsverifiering.

**Kontrakt GP-497 — Dataförändringar kräver särskild rollbackmodell**

Schema- och datamigrationer ska ha kompatibilitets-, repair- eller compensationplan och får inte förlita sig på blind kodrevert.

**Kontrakt GP-498 — Produktionshälsa ska verifieras efter deployment**

Rätt artefakt, migration, flags, centrala flöden, logs, metrics och skyddsmått ska kontrolleras innan produktionen beskrivs som verifierad.

**Kontrakt GP-499 — Statusrapportering ska vara evidensbaserad**

Agenter och människor ska endast rapportera test, commit, push, PR, merge, deployment och validering som genomförda när verifierbara bevis finns.

**Kontrakt GP-500 — Governance får inte självmodifieras av utvecklingsagenten**

Agenter får inte själva ta bort checks, sänka reviewkrav, ändra CODEOWNERS, ge sig merge- eller deploymentmandat eller kringgå protected environments.

**Kontrakt GP-501 — Governanceförändringar ska själva följa governance**

Branch-, test-, CI-, review-, merge-, release- och deploymentregler ska ändras genom separat branch, policytester, oberoende review och kontrollerad utrullning.

25.290 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- behandla lokal kod som levererad produkt,

- behandla testad kod som committad,

- behandla commit som push,

- behandla push som PR,

- behandla PR som godkänd,

- behandla godkänd PR som mergad,

- behandla merge som deployment,

- behandla deployment som verifierad effekt,

- arbeta i repository utan identitetskontroll,

- anta default branch,

- utveckla normalt direkt i main,

- använda break-glass för bekvämlighet,

- skapa branch utan ägare eller uppgift,

- lägga känslig information i branchnamn,

- låta övergivna branches sakna status,

- använda samma worktree för osamordnade agentuppgifter,

- skriva i dirty-unrelated workspace,

- fortsätta vid okänd gitstatus,

- stagea allt utan diffkontroll,

- använda `git add .` som standard,

- committa ospårade filer utan klassificering,

- låta `.gitignore` dölja nödvändiga källfiler,

- radera filer utan innehållsanalys,

- radera canonical bokmaterial,

- förlora historik genom onödig delete-and-create,

- manuellt redigera genererade filer utan källa,

- skapa repositoryomfattande formatdiff utan scope,

- ändra line endings oavsiktligt,

- ignorera ändrade filrättigheter,

- uppdatera submodules dolt,

- lägga stora binärer i repositoryt utan governance,

- skapa vaga commits,

- blanda orelaterade förändringar i samma commit,

- rapportera commit utan verifierad hash,

- bypassa hooks för bekvämlighet,

- maximera testantal i stället för testvärde,

- använda enhetstest som enda bevis för distribuerat flöde,

- använda API-status som enda domäntest,

- hoppa över säkerhets- eller integritetstest vid relevant ändring,

- köra migration endast mot tom databas,

- låta testsuites dela okontrollerat tillstånd,

- använda verkliga personuppgifter i fixtures,

- godkänna snapshots blint,

- använda kodtäckning som bevis på korrekthet,

- låta kända produktionsfel sakna regressionstest utan motivering,

- använda samma required checks för allt utan riskbedömning,

- hoppa över indirekt påverkade tester genom fel path-filter,

- återanvända testresultat efter ny commit,

- låta stale checks gälla,

- anta att lokalt grönt betyder CI-grönt,

- exponera CI-secrets till forkade PR:er,

- ändra CI-workflows utan särskild review,

- bygga oidentifierade artefakter,

- hoppa över secret scanning,

- ignorera dependencyrisk,

- skapa PR mot fel base,

- skapa PR med fel head branch,

- använda vag PR-titel,

- utelämna exkluderat scope,

- utelämna testbegränsningar,

- utelämna rollout eller rollback,

- skapa PR-sammanfattning som inte matchar diff,

- exponera användardata i screenshots eller loggbevis,

- göra mycket stora blandade PR:er,

- låta checklistor ersätta kvalificerad review,

- mergea draft PR,

- låta implementeringsagent ensam slutgranska kritisk förändring,

- ignorera CODEOWNERS,

- låta stale approval gälla efter betydande kodändring,

- mergea med changes requested,

- bulkmarkera blockerande kommentarer resolved,

- self-approva kritisk förändring,

- granska att test finns utan att granska vad det testar,

- ta bort tester utan att förstå skyddet,

- acceptera dependency utan licensbedömning,

- behandla promptändring som vanlig textändring när beteendet påverkas,

- använda en orealistisk rollbackplan,

- beskriva PR som merge ready med pågående checks,

- betrakta cancelled eller skipped required check som passed,

- lösa mergekonflikt genom godtyckligt val,

- uppdatera main utan omtest,

- batchmergea orelaterade förändringar okontrollerat,

- ge kodagent automatisk mergebehörighet,

- mergea högriskförändring helt automatiskt,

- beskriva closed PR som merged,

- radera branch innan merge och deployment verifierats,

- radera worktree med ospårat arbete,

- behandla merge som release,

- bygga om olika artefakter för staging och produktion utan behov,

- deploya utan artefaktidentitet,

- låta PR-approval automatiskt bli production approval,

- ta bort gammalt schema för tidigt,

- glömma verifiera feature flag,

- lansera full utrullning utan canary när risk kräver den,

- retrya deployment med unknown outcome utan verifiering,

- göra blind rollback av datamigration,

- kalla process-health för produkthälsa,

- använda smoke tests med riktig användardata,

- ignorera nya produktionsfel efter release,

- beskriva produktion som verifierad innan kritiska flöden testats,

- beskriva tekniskt stabil release som validerad användarnytta,

- använda ordet klart utan tydligt steg,

- låta agenttext vara enda statuskälla,

- avfärda review utan audit,

- använda admin override utan incidentprocess,

- bypassa required checks,

- låta governanceaudit bli ett privat dataarkiv,

- mergea karantänmarkerad PR,

- endast radera en exponerad secret från senaste commit,

- återställa felaktig merge utan konsekvensanalys,

- ändra branch protection direkt i produktion,

- låta utvecklingsagent ta bort egna checks,

- mäta kvalitet enbart genom deploymentfrekvens,

- jaga kortare reviewtid genom att sänka säkerheten,

- ignorera false green och false red,

- låta bypass rate växa,

- ge mergeautonomi samtidigt som kodautonomi,

- låta mergeautonomi vara permanent,

- automatiskt radera branches och worktrees efter PR-close,

- städa bort osäker bok- eller projektdata,

- eller ändra governance utan samma branch-, test-, review- och mergekrav som systemet själv föreskriver.

25.291 KANONISKA BESLUT FRÅN KAPITEL 25

Följande beslut etableras:

1. GainPilot ska skilja alla leveranstillstånd.

2. Main ska vara godkänd huvudlinje.

3. Normal direktpush till main ska förbjudas.

4. Break-glass ska vara särskild incidentprocess.

5. Varje repository ska ha stabil identitet.

6. Default branch ska vara explicit.

7. Varje förändring ska ha identitet.

8. Varje arbetsbranch ska ha definierad base.

9. Startcommit ska registreras.

10. Branchtyper ska kunna klassificeras.

11. Branchnamn ska vara begripliga.

12. Branchnamn får inte innehålla känslig information.

13. Branch ska ha ägare och status.

14. Worktrees ska ha identitet.

15. Worktrees ska kopplas till branch och task.

16. Flera agenter ska inte skriva osamordnat i samma worktree.

17. Pre-flight-kontroll ska krävas.

18. Arbetsytans renhet ska klassificeras.

19. Dirty-related och dirty-unrelated ska skiljas.

20. Konfliktstatus ska stoppa okontrollerat skrivande.

21. Unknown repository status ska neka förändring.

22. Orelaterade filer ska skyddas.

23. Explicit staging ska prioriteras.

24. Breda stagingkommandon ska användas restriktivt.

25. Staged diff ska granskas.

26. Unstaged diff ska granskas före slutrapport.

27. Untracked files ska klassificeras.

28. Gitignore ska skydda lokala hemligheter och artefakter.

29. Raderade filer ska granskas särskilt.

30. Meningsbärande material ska bevaras.

31. Filflyttar ska behålla historik där möjligt.

32. Genererade filer ska ha fastställd hantering.

33. Formatteringsdiff ska begränsas.

34. Oavsiktlig encoding- och modeförändring ska undvikas.

35. Submoduleändringar ska vara explicita.

36. Stora filer ska ha särskild governance.

37. Commits ska vara spårbara enheter.

38. Commit hash ska verifieras.

39. Commitmeddelanden ska beskriva verklig ändring.

40. Vaga commitmeddelanden ska undvikas.

41. Commits ska vara fokuserade.

42. Atomiska commits ska användas när de förbättrar review.

43. Tester får följa implementation i samma commit.

44. Fixup-commits ska hanteras enligt mergepolicy.

45. Kritiska commits ska kunna signeras.

46. Scopekontroll ska ske före commit.

47. Pre-commit-hooks ska kunna användas.

48. Hook-bypass ska kräva motivering.

49. Testning ska skapa evidens.

50. GainPilot ska ha canonical testmatris.

51. Testtyp ska matcha risk och funktion.

52. Testkrav ska öka med risk.

53. Enhetstest ska verifiera isolerad logik.

54. Komponenttest ska verifiera större modul.

55. Kontraktstest ska verifiera systemgränser.

56. Domäntest ska verifiera betydelse.

57. Integrationstest ska använda verkliga komponenter.

58. End-to-end-test ska användas selektivt.

59. Säkerhetstest ska finnas vid relevant förändring.

60. Integritetstest ska finnas vid relevant förändring.

61. Tillgänglighet ska testas.

62. Prestanda ska testas där relevant.

63. Migrationer ska testas vid avbrott och retry.

64. Resiliens ska testas.

65. Manuell validering ska dokumenteras.

66. Testkommando ska registreras.

67. Testmiljö ska registreras.

68. Testevidens ska kunna visas.

69. Pass, fail, skipped och not run ska skiljas.

70. Flaky test ska markeras.

71. Karantän ska vara tidsbegränsad.

72. Testordning ska kunna optimera kostnad.

73. Fail fast ska bevara diagnostik.

74. Testparallellisering ska kräva isolering.

75. Testdata ska vara skyddad.

76. Fixtures ska vara versionerade.

77. Golden datasets ska granskas.

78. Modelltester ska ha scenariosviter.

79. Icke-determinism ska hanteras.

80. Snapshots ska granskas semantiskt.

81. Kodtäckning ska vara diagnostisk.

82. Mutation testing ska kunna användas.

83. Property-based testing ska kunna användas.

84. Produktionsfel bör skapa regressionstest.

85. Testskuld ska registreras.

86. Required checks ska vara riskanpassade.

87. Path-based checks ska vara beroendemedvetna.

88. Full regression ska kunna krävas.

89. Testbevis ska knytas till commit.

90. Stale checks ska omköras.

91. CI ska vara oberoende kontroll.

92. Lokalt grönt ska inte ersätta remote checks.

93. CI-runs ska ha identitet.

94. CI-secrets ska minimeras.

95. Forkade PR:er ska inte få secrets automatiskt.

96. CI-workflows ska granskas särskilt.

97. Build ska vara reproducerbar.

98. Artefakter ska ha identitet.

99. SBOM ska kunna skapas.

100. Build provenance ska kunna användas.

101. Secret scanning ska köras.

102. Dependency scanning ska köras.

103. Statisk analys ska kunna användas.

104. Dynamisk analys ska kunna användas.

105. CI-kostnad ska styras utan att kritiska kontroller tas bort.

106. Pull request ska vara central granskningsenhet.

107. PR ska kopplas till förändringsidentitet.

108. Base och head ska verifieras.

109. PR-titel ska vara tydlig.

110. PR-beskrivning ska vara fullständig.

111. Canonical kontrakt ska refereras.

112. PR ska kunna länka issue och incident.

113. PR-mallar ska användas.

114. Checklistor ska komplettera review.

115. Draft PR ska stödjas.

116. Draft PR får inte mergeas.

117. PR-storlek ska hållas rimlig.

118. För stora PR:er ska kunna delas.

119. Orelaterade ändringar ska flyttas.

120. Automatisk PR-sammanfattning ska verifieras.

121. Hallucinerade PR-påståenden ska förbjudas.

122. UI-förändringar ska kunna ha bildbevis.

123. Komplexa flöden ska kunna ha videobevis.

124. Backendförändringar ska kunna ha query- och loggbevis.

125. Bevis får inte exponera känslig information.

126. Review ska omfatta mer än syntax.

127. Reviewroller ska vara tydliga.

128. CODEOWNERS ska kunna användas.

129. Känsliga paths ska kräva särskilda granskare.

130. Hög risk ska kräva oberoende review.

131. AI-review ska komplettera mänskligt ansvar.

132. Mänsklig review ska krävas där risk motiverar det.

133. Reviewstatus ska vara strukturerad.

134. Approval ska kunna bli stale.

135. Changes requested ska stoppa merge.

136. Kommentarer ska klassificeras.

137. Blocker och required ska skiljas.

138. Suggestion och question ska skiljas.

139. Kommentarer ska lösas verkligt.

140. Bulk resolve ska undvikas.

141. Self-approval ska begränsas.

142. Fyraögonsprincip ska kunna krävas.

143. Tester ska granskas semantiskt.

144. Borttagningar ska granskas.

145. Dependencies ska granskas.

146. Prompt- och policyändringar ska granskas som produktlogik.

147. Migrationer ska få särskild review.

148. Observability ska granskas.

149. Rollbackplanen ska bedömas realistiskt.

150. Merge readiness ska vara explicit.

151. Base ska vara korrekt.

152. Required checks ska passera.

153. Required reviews ska vara godkända.

154. Blockerande conversations ska vara lösta.

155. Scope ska vara validerat.

156. Migration och rollout ska vara redo.

157. Rollback ska vara redo.

158. Pålöpande checks ska stoppa merge.

159. Cancelled ska inte betyda passed.

160. Skipped required check ska granskas.

161. Mergekonflikter ska lösas semantiskt.

162. Branch freshness ska följa policy.

163. Uppdatering mot main ska omtestas.

164. Merge queue ska kunna användas.

165. Merge train ska kunna användas.

166. Orelaterad batch merge ska undvikas.

167. Merge ska kräva separat capability.

168. Merge ska ha beslutsägare.

169. Agentmerge ska vara begränsad.

170. Högriskmerge ska normalt kräva mänsklig approval.

171. Mergestrategi ska vara definierad.

172. Merge commit ska verifieras.

173. Closed ska skiljas från merged.

174. Issues ska inte antas slutförda enbart genom auto-close.

175. Branchradering ska ske efter verifiering.

176. Worktree cleanup ska kontrollera ospårat arbete.

177. Merge ska skiljas från release.

178. Releases ska ha identitet.

179. Releasebranch ska användas endast vid behov.

180. Versionsstrategi ska vara definierad.

181. Release candidate ska vara identifierad.

182. Artefaktpromotion ska prioriteras.

183. Deployment ska vara eget workflow.

184. Deploymentstatus ska vara strukturerad.

185. Deployment ska kräva eget mandat.

186. Miljöer ska vara skyddade.

187. Högriskdeployment ska ha approval.

188. Deploymentplan ska vara explicit.

189. Schema och kod ska lanseras kompatibelt.

190. Feature flags ska kunna separera deployment från aktivering.

191. Flaggstatus ska verifieras.

192. Intern tenant ska kunna användas.

193. Canary ska begränsa risk.

194. Canary ska ha relevanta mått.

195. Canary ska ha stoppregel.

196. Utrullning ska kunna ske gradvis.

197. Full utrullning ska kräva stabilitet.

198. Unknown deployment outcome ska verifieras.

199. Deployment ska vara idempotent där möjligt.

200. Rollback ska vara komponentmedveten.

201. Dataförändring ska ha repairmodell.

202. Automatisk rollback ska användas försiktigt.

203. Produktion ska verifieras efter deployment.

204. Health checks ska kontrollera dependencies.

205. Smoke tests ska använda säkra identiteter.

206. Synthetic monitoring ska kunna användas.

207. Integritetssäker real user monitoring ska kunna användas.

208. Logs, metrics och traces ska granskas.

209. Migration och flags ska verifieras.

210. Användarpåverkan ska följas.

211. Releaseincident ska stoppa rollout.

212. Post-deployment-status ska vara explicit.

213. Verified production ska ha tydliga kriterier.

214. Awaiting effect ska vara egen status.

215. Validerad nytta ska kräva effektuppföljning.

216. Statusspråk ska vara precist.

217. Ordet klart ska vara stegspecifikt.

218. Status ska ha evidens.

219. Agentstatus ska hämtas från verktyg där möjligt.

220. Text ska inte vara enda statuskälla.

221. Betydelsefulla governancehändelser ska auditeras.

222. Review dismissal ska auditeras.

223. Admin override ska auditeras.

224. Check-bypass ska normalt förbjudas.

225. Audit ska minimera känslig data.

226. Repositoryincidenter ska klassificeras.

227. Branches och PR:er ska kunna sättas i karantän.

228. Karantän ska blockera merge.

229. Secretincident ska kräva rotation.

230. Felaktig merge ska konsekvensbedömas.

231. Felaktig radering ska återställas.

232. Post-incident review ska förbättra systemet.

233. Governance ska genomdrivas tekniskt.

234. Governancepolicy ska versioneras.

235. Governanceförändring ska följa governance.

236. Agenter får inte självmodifiera skyddet.

237. Förbättringsförslag ska kunna lämnas.

238. Repositorypolicy ska registreras.

239. Required checks ska ha ägare.

240. Reviewkrav ska registreras.

241. Mergehändelser ska registreras.

242. Releases och deployments ska registreras.

243. Governancekvalitet ska mätas.

244. Reviewflaskhals ska analyseras utan säkerhetsförsämring.

245. False green ska följas.

246. False red ska följas.

247. Bypass rate ska följas.

248. Merge failure rate ska följas.

249. Production escape rate ska följas.

250. Change failure rate ska definieras.

251. Lead time till merge, deployment och effekt ska skiljas.

252. Deploymentfrekvens ska inte vara ensamt mål.

253. Recovery time ska följas.

254. Reviewkvalitet ska följas.

255. Agentens statusprecision ska mätas.

256. Hallucinerad status ska sänka förtroende och authority.

257. Mergeautonomi ska förtjänas separat.

258. Lågriskmerge ska kunna automatiseras senare.

259. Högriskmerge ska behålla stark kontroll.

260. Autonomimandat ska löpa ut.

261. Autonomi ska omprövas.

262. Cleanup ska vara ett kontrollerat steg.

263. Cleanup ska kräva bevis.

264. Osäkert material ska arkiveras.

265. Canonical bokmaterial ska skyddas.

266. Slutstädning ska ske separat och checksummeverifierat.

267. GainPilot ska ha en verifierbar kedja från scope till produktionsnytta.

25.292 IMPLEMENTERINGSORDNING

Branch-, test-, PR- och mergegovernance ska implementeras stegvis.

Fas 1 — Repositoryregister

Implementera:

- repository identity,

- remote,

- default branch,

- owners,

- domain scope,

- och deployment targets.

Fas 2 — Branchpolicy

Implementera:

- branch naming,

- branch types,

- task relation,

- start commit,

- owner,

- och status.

Fas 3 — Pre-flight

Implementera automatisk kontroll av:

- repository root,

- remote,

- branch,

- upstream,

- HEAD,

- git status,

- och pågående operationer.

Fas 4 — Worktreegovernance

Implementera:

- worktree identity,

- path,

- branch,

- task,

- owner,

- locking,

- och cleanupstatus.

Fas 5 — Filscope och bevarande

Implementera:

- allowed paths,

- unrelated-change detection,

- explicit staging,

- deletion warning,

- och canonical material protection.

Fas 6 — Commitgovernance

Implementera:

- staged diff validation,

- commit message policy,

- secret scan,

- task relation,

- commit evidence,

- och signerad commit där relevant.

Fas 7 — Testregister

Implementera:

- test identity,

- type,

- command,

- environment,

- risk relation,

- expected result,

- och owner.

Fas 8 — Grundläggande CI

Implementera:

- lint,

- typecheck,

- unit tests,

- build,

- och artefaktidentitet.

Fas 9 — Domän- och kontraktstester

Implementera:

- training engine tests,

- nutrition tests,

- Hermes contracts,

- agent contracts,

- och tenant isolation.

Fas 10 — Säkerhet och integritet

Implementera:

- secret scanning,

- dependency scanning,

- authorization tests,

- data minimization,

- deletion,

- och model-routing tests.

Fas 11 — Migration och resiliens

Implementera:

- migration tests,

- interruption,

- retry,

- idempotency,

- unknown outcome,

- och recovery.

Fas 12 — Riskbaserad testmatris

Implementera:

- low,

- medium,

- high,

- critical,

- path-based triggers,

- och full regression conditions.

Fas 13 — Pull request-mallar

Implementera mallar för:

- feature,

- fix,

- security,

- migration,

- documentation,

- och hotfix.

Fas 14 — PR-evidens

Implementera:

- test summary,

- screenshots,

- schema proof,

- migration evidence,

- rollout,

- och rollback.

Fas 15 — CODEOWNERS

Implementera ägarskap för:

- domain engines,

- Hermes,

- agent policies,

- security,

- migrations,

- deployment,

- och canonical documentation.

Fas 16 — Reviewmodell

Implementera:

- reviewer roles,

- comment severity,

- stale approvals,

- changes requested,

- och resolution tracking.

Fas 17 — Branch protection

Implementera:

- required PR,

- required checks,

- required reviews,

- protected main,

- och restricted bypass.

Fas 18 — Merge readiness

Implementera automatisk kontroll av:

- base,

- freshness,

- checks,

- reviews,

- unresolved conversations,

- scope,

- rollout,

- och rollback.

Fas 19 — Merge queue

Implementera:

- queue,

- merge-group testing,

- conflict handling,

- och final commit verification.

Fas 20 — Mergecapability

Implementera separata mandat för:

- propose merge,

- approve merge,

- execute merge,

- och emergency override.

Fas 21 — Releaseidentitet

Implementera:

- release version,

- merge commit,

- artefact digest,

- SBOM,

- release notes,

- och target environment.

Fas 22 — Protected environments

Implementera:

- staging,

- production,

- environment secrets,

- deployment actors,

- och approvals.

Fas 23 — Feature flags

Implementera:

- owner,

- target,

- expiration,

- rollout,

- status verification,

- och cleanup.

Fas 24 — Canary

Implementera:

- internal tenant,

- target cohort,

- technical metrics,

- domain guardrails,

- stop rules,

- och rollback.

Fas 25 — Produktionsverifiering

Implementera:

- health checks,

- smoke tests,

- migration status,

- flags,

- logs,

- metrics,

- traces,

- och user-impact signals.

Fas 26 — Effektstatus

Implementera:

- technically complete,

- merged,

- deployed,

- production verified,

- awaiting effect,

- validated,

- och rolled back.

Fas 27 — Evidensbaserad agentrapportering

Implementera statusgenerering från:

- git,

- CI,

- PR,

- review,

- merge,

- deployment,

- och production systems.

Fas 28 — Incidentgovernance

Implementera:

- quarantine,

- direct-main incident,

- secret exposure,

- invalid merge,

- branch restore,

- och consequence analysis.

Fas 29 — Governancemått

Implementera:

- check failure,

- review time,

- stale approval,

- bypass,

- merge failure,

- production escape,

- status accuracy,

- och recovery time.

Fas 30 — Earned autonomy

Implementera separata mandat för:

- commit,

- push,

- PR creation,

- low-risk merge,

- deployment proposal,

- och production approval.

Fas 31 — Cleanup och arkiv

Implementera:

- branch cleanup,

- worktree cleanup,

- preview cleanup,

- artifact archive,

- canonical protection,

- och bevarandeverifiering.

Fas 32 — Canonical bokleverans

När hela GainPilot-boken godkänts:

- verifiera finalfiler,

- skapa manifest,

- skapa checksummor,

- separera sources, proofs, production, final och archive,

- kopiera canonical edition till Omnira-repositoryts kunskapsstruktur,

- och radera ingenting innan leveransen är verifierad.

Fas 33 — Full governanceaudit

Implementera återkommande kontroll av:

- branch rules,

- required checks,

- CODEOWNERS,

- permissions,

- bypasses,

- deployment environments,

- autonomy,

- och policy drift.

Varje fas ska genomföras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- testning av policyn,

- simulering av failure modes,

- pull request,

- oberoende review,

- dry run eller shadow mode,

- kontrollerad merge,

- produktionsverifiering,

- och uppföljning.

25.293 FRAMGÅNGSKRITERIER

Kapitel 25:s vision är framgångsrikt realiserad när:

- GainPilot kan skilja lokal ändring från levererad funktion,

- varje repository har stabil identitet,

- main är skyddad,

- direktpush till main normalt är omöjlig,

- break-glass är auditerat,

- varje branch har ägare och uppgift,

- startcommit registreras,

- worktrees är isolerade,

- pre-flight-kontroll sker automatiskt,

- dirty-unrelated upptäcks,

- orelaterade filer inte stageas,

- staged diff granskas,

- untracked files klassificeras,

- secrets och lokala artefakter ignoreras korrekt,

- raderingar får särskild kontroll,

- meningsbärande projektmaterial bevaras,

- canonical bokmaterial skyddas,

- commits är fokuserade,

- commit hash verifieras,

- commitmeddelanden är begripliga,

- hooks inte kringgås utan spår,

- varje förändring får en riskanpassad testmatris,

- domänlogik testas semantiskt,

- systemgränser kontraktstestas,

- säkerhet och integritet testas,

- migrationer testas för avbrott och omkörning,

- pass, fail, skipped och not run skiljs,

- flaky tests har ägare,

- testkarantän löper ut,

- testdata inte innehåller oskyddade personuppgifter,

- testresultat är bundna till rätt commit,

- stale checks omkörs,

- CI fungerar som oberoende kontroll,

- artefakter har identitet,

- secrets inte exponeras för forkade workflows,

- CI-workflows granskas särskilt,

- secret och dependency scanning körs,

- PR alltid har rätt base och head,

- PR-beskrivningen motsvarar faktisk diff,

- testbegränsningar redovisas,

- canonical kontrakt refereras,

- stora PR:er delas eller får särskild reviewplan,

- bevis inte innehåller känslig data,

- CODEOWNERS styr känsliga paths,

- högriskförändringar får oberoende review,

- stale approvals upptäcks,

- changes requested stoppar merge,

- blockerande kommentarer löses verkligt,

- self-approval inte räcker för kritisk förändring,

- testernas kvalitet granskas,

- migrations- och rollbackplaner är realistiska,

- merge readiness beräknas explicit,

- required checks måste vara gröna,

- cancelled och skipped inte feltolkas,

- mergekonflikter omtestas,

- branches uppdateras mot main enligt policy,

- merge queue kan verifiera huvudlinjen,

- merge kräver separat mandat,

- högriskmerge kräver stark kontroll,

- faktisk merge commit verifieras,

- closed PR inte kallas merged,

- branches inte raderas för tidigt,

- worktrees inte städas med ospårat värdefullt material,

- release har version och artefaktidentitet,

- staging och production är skyddade miljöer,

- deployment kräver eget mandat,

- högriskdeployment har approval,

- schema och kod lanseras kompatibelt,

- feature flags verifieras,

- canary följer tekniska och domänmässiga skyddsmått,

- full utrullning sker gradvis,

- unknown deployment outcome verifieras,

- dataförändringar har repairstrategi,

- produktionen verifieras efter deployment,

- smoke tests använder säkra testidentiteter,

- migrationsstatus och flags kontrolleras,

- användarpåverkan följs,

- tekniskt stabil release kan markeras awaiting effect,

- validerad produktnytta kräver uppföljning,

- statusformuleringar är precisa,

- ordet klart inte döljer återstående steg,

- agentstatus byggs från faktisk systemevidens,

- governancehändelser auditeras,

- branch protection-bypass är sällsynt och granskat,

- branches och PR:er kan sättas i karantän,

- exponerade secrets roteras,

- felaktiga merges konsekvensbedöms,

- raderat material kan återställas,

- governancepolicy versioneras,

- agenter inte kan ta bort sina egna kontroller,

- repository-, check-, review-, merge- och deploymentregister finns,

- false green och false red följs,

- production escapes leder till testförbättring,

- agenters statusprecision mäts,

- felaktig status kan sänka authority,

- mergeautonomi förtjänas separat,

- högriskområden behåller mänskligt ansvar,

- cleanup sker kontrollerat,

- osäkert material arkiveras,

- och GainPilots hela leveranskedja kan följas från godkänt scope till verifierad och uppföljd produktionsförändring.

25.294 SAMMANFATTNING

GainPilot ska inte betrakta kod som färdig enbart därför att den har skrivits.

En förändring ska passera flera tydligt separerade tillstånd:

1. Godkänt scope.

2. Verifierad repositorymiljö.

3. Isolerad branch eller worktree.

4. Lokal implementation.

5. Lokal validering.

6. Commit.

7. Push.

8. Pull request.

9. Automatiska checks.

10. Kvalificerad review.

11. Merge readiness.

12. Mergebeslut.

13. Merge.

14. Release.

15. Deployment.

16. Produktionsverifiering.

17. Effektuppföljning.

18. Kontrollerad städning.

Varje tillstånd ska kunna verifieras.

En agent ska inte få säga:

Klart, pushat och live

när det verkliga tillståndet är:

- lokala ändringar finns,

- ett par tester har passerat,

- men ingen commit eller PR har skapats.

GainPilot ska använda exakt status.

Exempel:

- Ändringarna är lokala och otestade.

- Riktade tester passerar.

- Commit `abc123` är skapad på branch X.

- Branchen är pushad.

- PR är öppnad och checks pågår.

- Required checks har passerat.

- Review changes requested.

- PR är merge ready.

- PR är mergad.

- Deployment till staging är verifierad.

- Produktion kör rätt artefakt.

- Produktens effekt är ännu inte validerad.

Detta ska gälla både människor och agenter.

Main ska vara en skyddad huvudlinje.

Vanliga förändringar ska inte kunna skrivas direkt till main.

De ska ske i:

- separat branch,

- och helst separat worktree när flera arbeten pågår.

Före varje ändring ska agenten verifiera:

- repository,

- remote,

- branch,

- upstream,

- HEAD,

- git status,

- och eventuella pågående gitoperationer.

Om arbetsytan innehåller orelaterade ändringar ska agenten:

- skydda dem,

- inte stagea dem,

- inte återställa dem,

- och inte inkludera dem i sin commit.

Explicit staging ska prioriteras.

Staged diff ska granskas före commit.

Ospårade filer ska klassificeras.

En agent ska inte använda ett brett stagingkommando av bekvämlighet och hoppas att allt är relevant.

Raderingar ska behandlas med särskild försiktighet.

GainPilot ska följa en absolut bevarandeprincip:

Inget meningsbärande projektmaterial får raderas innan innehållet identifierats, canonical status bedömts, säker kopia verifierats och borttagningen godkänts.

Detta gäller:

- kod,

- dokument,

- branches,

- worktrees,

- bokkapitel,

- proofs,

- manifests,

- och andra projektartefakter.

Commits ska vara fokuserade och begripliga.

Varje commit ska:

- motsvara rätt branch,

- endast innehålla relevant scope,

- ha tydligt meddelande,

- och kunna identifieras med hash.

Agenten får inte rapportera en commit som skapad utan att commitidentiteten verifierats.

Testning ska vara riskbaserad.

En enkel dokumentationsändring behöver inte samma testmatris som:

- Hermes,

- tenantisolering,

- substitutionsmotorn,

- kostlogiken,

- en datamigration,

- eller agentauthority.

GainPilot ska kunna använda:

- enhetstester,

- komponenttester,

- kontraktstester,

- integrationstester,

- domäntester,

- end-to-end-tester,

- säkerhetstester,

- integritetstester,

- tillgänglighetstester,

- migrationstester,

- prestandatester,

- och resiliensscenarier.

Ett test ska inte endast kontrollera tekniskt format.

Domäntest ska verifiera verklig betydelse.

Ett övningsbyte är inte korrekt enbart därför att API:t returnerar giltig JSON.

Bytet ska:

- bevara rätt träningsfunktion,

- följa användarens begränsningar,

- använda rätt utrustning,

- och inte förstöra programmets progression.

Testresultat ska redovisas exakt.

GainPilot ska skilja mellan:

- passed,

- failed,

- skipped,

- not run,

- cancelled,

- och flaky.

Skipped är inte passed.

Not run är inte passed.

Ett test som endast passerar efter flera omkörningar ska inte beskrivas som stabilt.

Varje testresultat ska kopplas till:

- rätt commit,

- rätt miljö,

- rätt kommando,

- och rätt konfiguration.

Ny commit kan göra tidigare resultat inaktuellt.

CI ska fungera som oberoende kontroll.

Lokala tester är viktiga.

De ersätter inte required remote checks.

CI ska kunna verifiera:

- lint,

- typecheck,

- build,

- unit,

- contract,

- integration,

- security,

- privacy,

- migration,

- och andra riskbaserade jobb.

CI ska skydda sina secrets.

Pull requests från forks eller okända workflows ska inte få känsliga värden.

Ändringar i CI-definitioner ska granskas särskilt, eftersom en sådan ändring kan påverka:

- vilka tester som körs,

- vilka secrets som exponeras,

- och hur produktion deployas.

Pull request ska vara den normala granskningsgränsen.

PR:n ska beskriva:

- problemet,

- målet,

- inkluderat scope,

- exkluderat scope,

- vad som faktiskt ändrats,

- testresultat,

- risk,

- migration,

- rollout,

- och rollback.

PR-beskrivningen ska matcha den verkliga diffen.

En AI-genererad sammanfattning får användas.

Den måste verifieras.

PR:n får inte påstå att en funktion, test eller migration är klar om bevis saknas.

Review ska utföras av rätt kompetenser.

En kodgranskare kan bedöma:

- korrekthet,

- struktur,

- underhållbarhet,

- och testkvalitet.

En domängranskare kan bedöma:

- träningslogik,

- kostlogik,

- progression,

- eller substitutionsfunktion.

En säkerhetsgranskare kan bedöma:

- behörighet,

- secrets,

- injection,

- och tenantisolering.

En integritetsgranskare kan bedöma:

- dataminimering,

- retention,

- radering,

- och extern modellåtkomst.

CODEOWNERS eller motsvarande ska kunna kräva rätt granskare för känsliga paths.

Hög- och kritisk risk ska kräva oberoende review.

Samma agent ska inte ensam:

- implementera,

- skapa bekräftande test,

- godkänna,

- mergea,

- och deploya

en kritisk förändring.

Reviewkommentarer ska lösas verkligt.

Kommentarer ska kunna klassificeras som:

- blocker,

- required,

- suggestion,

- question,

- eller note.

En blocker får inte bulkmarkeras resolved utan att problemet behandlats.

En approval kan bli stale när ny betydelsefull kod tillkommer.

GainPilot ska då kunna kräva ny review.

En PR är inte merge ready bara för att den ser färdig ut.

Merge readiness ska verifiera:

- rätt base,

- aktuell branch,

- alla required checks,

- required reviews,

- inga blockerande conversations,

- korrekt scope,

- migrationsberedskap,

- rollout,

- rollback,

- och ett behörigt mergebeslut.

Merge ska vara en separat capability.

Rätt att:

- skriva kod,

- committa,

- pusha,

- och skapa PR

ska inte innebära rätt att mergea.

Mergeautonomi ska förtjänas separat.

En agent kan senare få mergea mycket tydliga lågriskförändringar.

Detta mandat ska inte automatiskt gälla:

- Hermes,

- säkerhet,

- tenantisolering,

- träningsmotorn,

- kostmotorn,

- radering,

- agentauthority,

- eller kritiska migrationer.

Efter merge ska faktisk merge commit verifieras.

En stängd PR är inte nödvändigtvis mergad.

En mergad PR är inte automatiskt deployad.

Deployment ska vara ett separat workflow med:

- artefaktidentitet,

- målmiljö,

- migrationsordning,

- feature flags,

- health checks,

- canary,

- rollback,

- och approval där relevant.

Samma verifierade artefakt bör flyttas från staging till produktion när det är möjligt.

Produktion ska inte byggas från en annan okänd kodversion.

Högre risk ska använda progressiv utrullning.

Det kan innebära:

- preview,

- staging,

- intern tenant,

- feature flag,

- canary,

- begränsad procent,

- och gradvis expansion.

Canary ska följa både tekniska och domänmässiga mått.

Det räcker inte att servern svarar.

GainPilot ska även följa:

- felaktiga program,

- användarkorrigeringar,

- säkerhetssignaler,

- förlorade träningsresultat,

- integrationsproblem,

- och kostnad.

Deployment med okänt utfall ska verifieras före retry.

Systemet får inte deploya samma förändring flera gånger eller anta att inget hände.

Rollback ska vara realistisk.

För ren kod kan rollback innebära tidigare artefakt.

För datamigration kan det krävas:

- forward fix,

- repair migration,

- compensation,

- eller särskild dataåterställning.

En blind revert kan göra situationen värre.

Efter deployment ska produktionen verifieras genom:

- rätt artefakt,

- migrationsstatus,

- feature flags,

- health checks,

- smoke tests,

- logs,

- metrics,

- traces,

- och relevanta användarflöden.

Tekniskt stabil produktion betyder fortfarande inte att produktnyttan är validerad.

GainPilot ska skilja mellan:

- production verified,

- awaiting effect,

- och validated outcome.

En förändring i onboarding kan vara tekniskt korrekt men ändå:

- öka friktion,

- minska förståelse,

- eller försämra säkerhet.

Effekten ska därför följas över relevant period.

Governance ska vara auditerbar.

Det ska gå att förstå:

- vem som skapade branch,

- vem som gjorde commit,

- vilka tester som kördes,

- vem som godkände,

- vem som mergeade,

- vem som godkände deployment,

- och vilken version som hamnade i produktion.

Bypass av:

- required checks,

- review,

- branch protection,

- eller protected environment

ska vara mycket sällsynt och särskilt auditerat.

Agenter får inte själva:

- ta bort required checks,

- sänka reviewkrav,

- ändra CODEOWNERS,

- ge sig mergebehörighet,

- ge sig deploymenträtt,

- eller öppna produktionsmiljön.

De får föreslå förbättringar.

Governanceförändringen ska själv gå genom:

- separat branch,

- policytester,

- pull request,

- oberoende review,

- dry run,

- kontrollerad merge,

- och verifiering.

Efter merge och deployment ska cleanup ske kontrollerat.

Branches, worktrees och artefakter ska inte raderas automatiskt innan:

- merge är verifierad,

- relevant material är bevarat,

- ospårade filer har kontrollerats,

- och incident- eller rollbackbehov har bedömts.

När hela GainPilot-boken är färdig ska även bokmaterialet genomgå en separat, kontrollerad slutstädning.

Strukturen ska skilja mellan:

- sources,

- proofs,

- production,

- final,

- och archive.

Finalfiler ska verifieras med:

- manifest,

- versionsinformation,

- och checksummor.

Ingenting ska raderas innan:

- slutleveransen är verifierad,

- canonical edition är säker,

- och kopian i Omniras repository eller annan godkänd lagring har bekräftats.

Kapitel 25 etablerar därmed följande kärnprincip:

GainPilot ska ha en verifierbar leveranskedja där ingen förändring kan hoppa från agentgenererad kod till main eller produktion genom otydlig status eller överdrivet förtroende. Brancher ska isolera arbetet, tester ska skapa evidens, pull requests ska samla granskningen, review ska tillföra rätt kompetens, merge ska kräva separat mandat och deployment ska följas av verklig produktions- och effektverifiering. Governance ska inte sakta ned GainPilot genom byråkrati — den ska göra snabb agentdriven utveckling säker, reproducerbar och pålitlig.
