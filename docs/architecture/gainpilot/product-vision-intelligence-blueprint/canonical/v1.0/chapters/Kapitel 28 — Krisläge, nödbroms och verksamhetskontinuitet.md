# Kapitel 28 — Krisläge, nödbroms och verksamhetskontinuitet

GainPilot ska kunna hantera situationer där normal driftgovernance inte längre räcker.

De flesta problem ska hanteras genom ordinarie:

- felhantering,

- degradering,

- incidentrespons,

- rollback,

- capabilitypaus,

- och återhämtning.

Vissa händelser kan däremot hota:

- människors säkerhet,

- användarnas integritet,

- tenantisolering,

- produktens dataintegritet,

- GainPilots ekonomiska överlevnad,

- Omniras kontroll över sina agenter,

- eller möjligheten att fortsätta verksamheten.

I sådana situationer ska GainPilot kunna gå in i ett särskilt krisläge.

Krisläge ska inte vara ett dramatiskt namn för ett vanligt tekniskt fel.

Det ska vara ett kontrollerat operating mode för situationer där:

- konsekvensen kan bli systemomfattande,

- normal beslutstakt är för långsam,

- informationen är ofullständig,

- flera projekt eller capabilities påverkas,

- eller fortsatt normal automation kan förvärra skadan.

Exempel på situationer som kan motivera krisläge:

- en agent utför handlingar utanför sitt mandat,

- tenantisoleringen kan inte längre verifieras,

- en större dataläcka misstänks,

- autentiseringskedjan är komprometterad,

- en kritisk leverantör upphör utan användbar övergångstid,

- produktionsdata riskerar permanent förlust,

- en ekonomisk kostnadsloop växer okontrollerat,

- säkerhetskritisk träningslogik har systematiskt fel,

- en felaktig modellversion påverkar många användare,

- eller Omnira inte längre säkert kan avgöra vilka autonoma handlingar som pågår.

Krisläget ska kunna begränsas till rätt nivå.

Det ska inte alltid innebära att hela GainPilot eller Omnira stängs ned.

Systemet ska kunna aktivera krisläge för:

- en operation,

- en capability,

- en agent,

- en användare,

- en tenant,

- GainPilot-projektet,

- ett externt beroende,

- en miljö,

- eller hela Omnira.

Grundprincipen ska vara:

Stoppa minsta tillräckliga del av systemet för att förhindra fortsatt skada, samtidigt som säkra och nödvändiga funktioner bevaras.

Exempel:

Om Arnold börjar skapa olämpliga automatiska övningsbyten behöver GainPilot kanske:

- stoppa Arnold från automatisk execution,

- återföra honom till propose-only,

- och pausa substitutionscapabilityn.

Det behöver inte innebära att användaren förlorar:

- åtkomst till sitt aktiva program,

- möjligheten att logga träning,

- sin historik,

- eller säkra manuella funktioner.

Om tenantisoleringen däremot inte kan verifieras kan GainPilot behöva:

- stoppa alla centrala reads och writes,

- återkalla aktiva agenttokens,

- isolera berörda tjänster,

- och endast tillåta lokala eller särskilt säkra funktioner.

Krisläge ska bygga på en tydlig kontrollordning.

Den canonical kriskedjan ska vara:

Kritisk signal

→ verifiering av omedelbar risk

→ krisdeklaration

→ nödbroms

→ containment

→ bevarande av data och bevis

→ etablering av krisledning

→ lägesbild

→ prioriterad kontinuitet

→ skadebegränsning

→ recoveryplan

→ gradvis återstart

→ utökad verifiering

→ avslut av krisläge

→ eftergranskning

→ långsiktig förbättring.

GainPilot ska skilja mellan:

- incident,

- allvarlig incident,

- kris,

- katastrofläge,

- och långvarig kontinuitetsstörning.

En incident kan hanteras inom etablerade driftprocesser.

En kris kräver ofta:

- ändrade beslutsvägar,

- prioriterad ledning,

- bredare koordinering,

- starkare stoppmandat,

- och tillfälligt begränsad normal automation.

Katastrofläge kan innebära att kritisk infrastruktur, data eller kontrollförmåga har gått förlorad i sådan omfattning att ordinarie produktion inte kan upprätthållas.

Krisgovernance får inte bli ett sätt för Atlas, Arnold eller andra agenter att ge sig själva större authority.

Tvärtom ska krisläge normalt innebära:

- mindre autonomi,

- färre aktiva capabilities,

- striktare datatillgång,

- hårdare budgetstopp,

- tätare rapportering,

- och tydligare mänskligt ansvar.

Atlas ska kunna bidra genom att:

- samla verifierade signaler,

- skapa en gemensam lägesbild,

- identifiera beroenden,

- sammanställa handlingsalternativ,

- följa beslut och åtgärder,

- och uppmärksamma motstridig information.

Atlas ska inte ensam få:

- deklarera obegränsat globalt krisläge,

- ge sig själv L6-authority,

- återställa alla capabilities,

- fatta juridiska beslut,

- eller stänga krisen.

Arnold ska i krisläge fokusera på:

- användarens säkerhet,

- begriplig information,

- säkra manuella alternativ,

- lokal databevaring,

- och att inte skapa nya osäkra förändringar.

GainPilot ska skydda användaren från både:

- själva krisen,

- och överdrivna krisåtgärder.

Ett omfattande stopp kan i sig skapa skada.

Exempel:

Om användaren är mitt i ett träningspass ska GainPilot där det är säkert kunna:

- behålla passet lokalt,

- visa redan verifierade instruktioner,

- låta användaren registrera resultat,

- och vänta med molnsynk.

Systemet ska inte radera eller låsa användarens lokala träningsdata enbart därför att en central integration är komprometterad.

Krisläge ska vara förberett innan krisen inträffar.

GainPilot ska därför ha:

- definierade krisscenarier,

- nödbromsar,

- reservroller,

- kommunikationsvägar,

- offlinekopior av centrala runbooks,

- säkerhetskopior,

- manuella arbetsmetoder,

- återställningsprioriteringar,

- och återkommande övningar.

Grundprincipen är:

GainPilot ska kunna bromsa snabbt utan att förlora kontrollen, upprätthålla säkra kärnfunktioner under allvarlig störning och återgå till normal drift först när identitet, data, authority, capabilities och användarpåverkan har verifierats.

28.1 KRIS SOM SÄRSKILT OPERATING MODE

Krisläge ska vara ett explicit operating mode.

Det ska inte endast vara:

- en incidentetikett,

- en Slack-kanal,

- eller en röd dashboard.

Operating mode ska tekniskt kunna förändra:

- tillåtna capabilities,

- authoritytak,

- approvalkrav,

- budget,

- modellrouting,

- datadelning,

- deployments,

- och rapporteringsfrekvens.

28.2 NORMAL MODE

Normal mode innebär att GainPilot använder ordinarie:

- authority,

- approvals,

- automation,

- budget,

- deployments,

- och driftprocesser.

28.3 DEGRADED MODE

Degraded mode innebär att vissa funktioner är begränsade men att ordinarie styrmodell i huvudsak gäller.

28.4 INCIDENT MODE

Incident mode innebär att en aktiv incident hanteras genom definierad incidentledning och containment.

28.5 CRISIS MODE

Crisis mode innebär att risken eller koordinationsbehovet är så stort att:

- normal automation begränsas,

- beslutsvägar förändras,

- särskild krisledning aktiveras,

- och kontinuitet prioriteras.

28.6 DISASTER MODE

Disaster mode kan användas när GainPilot har förlorat eller riskerar att förlora:

- kritisk infrastruktur,

- central data,

- primär region,

- secretskontroll,

- eller möjlighet till normal produktion.

28.7 RECOVERY MODE

Recovery mode innebär att systemet återställs gradvis efter containment.

Det ska inte likställas med normal drift.

28.8 MODELLENS TILLSTÅND

GainPilot ska minst kunna representera:

- normal,

- degraded,

- incident,

- crisis,

- disaster,

- recovery,

- verifying,

- och stabilized.

28.9 DEN CANONICAL KRISMODELLEN

Krisobjektet ska minst kunna representera:

- crisis_identity,

- declared_at,

- declared_by,

- initiating_signals,

- crisis_type,

- severity,

- affected_capabilities,

- affected_tenants,

- affected_users,

- affected_environments,

- safety_impact,

- privacy_impact,

- data_impact,

- financial_impact,

- autonomy_impact,

- continuity_status,

- crisis_lead,

- decision_authority,

- activated_brakes,

- preserved_capabilities,

- prohibited_actions,

- communication_status,

- recovery_criteria,

- review_status,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

28.10 KRISIDENTITET

Varje deklarerad kris ska ha stabil identitet.

Identiteten ska länka:

- incidenter,

- beslut,

- nödbromsar,

- kommunikation,

- datarepair,

- recovery,

- och eftergranskning.

28.11 KRISTYPER

GainPilot ska kunna klassificera kriser som:

- safety,

- privacy,

- security,

- identity,

- data,

- agent-control,

- financial,

- provider,

- infrastructure,

- governance,

- continuity,

- eller multi-domain.

28.12 SÄKERHETSKRIS

En säkerhetskris kan uppstå när GainPilot systematiskt riskerar att ge:

- olämpliga träningsförslag,

- farlig progression,

- felaktig hantering av smärtsignaler,

- eller andra råd som kan skapa fysisk skada.

28.13 INTEGRITETSKRIS

En integritetskris kan uppstå vid:

- omfattande felaktig datadelning,

- cross-tenant access,

- exponerade coachdialoger,

- eller okontrollerad extern modellöverföring.

28.14 IDENTITETSKRIS

En identitetskris kan uppstå när GainPilot inte säkert kan avgöra:

- vem som är inloggad,

- om en enhet är betrodd,

- eller om en approval verkligen gavs av rätt person.

28.15 DATAKRIS

En datakris kan omfatta:

- omfattande korruption,

- förlust,

- okontrollerad duplicering,

- felaktig återställning,

- eller osäker canonical källa.

28.16 AGENTKONTROLLKRIS

En agentkontrollkris kan uppstå när:

- en agent agerar utanför scope,

- tool use inte längre kan begränsas,

- agentidentitet är osäker,

- eller flera agenter skapar motstridiga writes.

28.17 EKONOMISK KRIS

En ekonomisk kris kan uppstå vid:

- okontrollerad AI-kostnad,

- felaktiga köp,

- leverantörsdebitering,

- betalningsfel,

- eller oförmåga att upprätthålla kritisk drift.

28.18 LEVERANTÖRSKRIS

Leverantörskris kan innebära att en kritisk leverantör:

- försvinner,

- blir osäker,

- ändrar villkor akut,

- eller inte längre kan användas lagligt eller tekniskt.

28.19 INFRASTRUKTURKRIS

Infrastrukturkris kan omfatta:

- regionbortfall,

- komprometterad molnmiljö,

- större nätverksstörning,

- eller förlust av centrala utvecklings- och driftverktyg.

28.20 GOVERNANCEKRIS

Governancekris kan uppstå när GainPilot inte längre kan lita på:

- approvals,

- audit,

- branchskydd,

- authoritymodell,

- eller beslutsidentiteter.

28.21 MULTI-DOMAIN-KRIS

En kris kan omfatta flera typer samtidigt.

Exempel:

Ett komprometterat utvecklingskonto kan skapa:

- säkerhetsrisk,

- datarisk,

- agentkontrollrisk,

- och governanceproblem.

28.22 KRISTRÖSKEL

Krisläge ska inte aktiveras för varje allvarlig incident.

Bedömningen ska ta hänsyn till:

- omfattning,

- hastighet,

- osäkerhet,

- systemisk påverkan,

- irreversibilitet,

- och om normal incidentprocess räcker.

28.23 AUTOMATISK KRISSIGNAL

Systemet kan skapa en automatisk krissignal.

Signalen får inte alltid ensam deklarera full kris.

28.24 AUTOMATISK NÖDBROMS

Vid fördefinierad kritisk risk ska nödbroms kunna aktiveras innan full krisdeklaration.

Exempel:

- verifierad cross-tenant write,

- obehörigt köp,

- eller agent som överskrider authoritytak.

28.25 MÄNSKLIG KRISDEKLARATION

Globalt eller omfattande krisläge ska normalt deklareras av:

- ägare,

- utsedd krisledare,

- säkerhetsansvarig,

- eller annan explicit behörig roll.

28.26 ATLAS SOM SIGNALGIVARE

Atlas ska kunna rekommendera krisdeklaration.

Rekommendationen ska innehålla:

- verifierade fakta,

- osäkerheter,

- påverkan,

- och föreslagen nivå.

28.27 ARNOLD SOM SIGNALGIVARE

Arnold ska kunna skapa säkerhets- eller användarpåverkanssignal.

Arnold ska inte deklarera verksamhetsomfattande kris.

28.28 KRISDEKLARATION

Deklarationen ska minst ange:

- vilken kris som misstänks eller bekräftats,

- vilken nivå som aktiveras,

- vilka capabilities som stoppas,

- vilka funktioner som bevaras,

- vem som leder,

- och nästa reviewtid.

28.29 PRELIMINÄR DEKLARATION

När fakta är ofullständiga ska krisen kunna deklareras preliminärt.

Osäkerheten ska vara synlig.

28.30 INGEN FALSK PRECISION

Krisens exakta omfattning behöver inte vara känd innan containment.

Systemet ska inte vänta på full rotorsak när fortsatt skada pågår.

28.31 NÖDBROMS

Nödbromsen ska vara en teknisk och organisatorisk förmåga att snabbt begränsa handlingar.

28.32 DEN CANONICAL NÖDBROMSMODELLEN

Varje nödbroms ska minst definiera:

- brake_identity,

- owner,

- trigger,

- scope,

- affected_capabilities,

- allowed_safe_functions,

- prohibited_actions,

- activation_method,

- authentication_requirement,

- expected_effect,

- verification_method,

- reset_policy,

- and audit_policy.

28.33 GLOBAL NÖDBROMS

Global nödbroms ska kunna stoppa:

- nya autonoma writes,

- authorityhöjningar,

- externa publiceringar,

- köp,

- och icke-kritiska agentworkflows

över hela Omnira.

28.34 GAINPILOT-NÖDBROMS

GainPilot ska kunna stoppas separat från andra Omnira-projekt.

28.35 TENANTNÖDBROMS

En komprometterad eller felande tenant ska kunna isoleras.

28.36 ANVÄNDARNÖDBROMS

En användare ska kunna stoppa autonoma handlingar för sitt eget konto.

28.37 AGENTNÖDBROMS

Arnold, Atlas eller specialistagent ska kunna:

- pausas,

- avaktiveras,

- eller återföras till read-only/propose-only.

28.38 CAPABILITYNÖDBROMS

En enskild capability ska kunna stoppas.

Exempel:

- adapt_workout,

- calendar_write,

- data_share,

- create_purchase,

- eller deploy_production.

28.39 VERKTYGSNÖDBROMS

Ett särskilt verktyg ska kunna kopplas bort från agentruntime.

28.40 INTEGRATIONSNÖDBROMS

Extern integration ska kunna:

- pausas,

- isoleras,

- och få sina tokens återkallade.

28.41 WRITE FREEZE

Write freeze ska stoppa nya tillståndsförändringar.

Read-only kan fortsätta där detta är säkert.

28.42 READ FREEZE

Om läsning kan exponera fel användares data ska även reads kunna stoppas.

28.43 COMMUNICATION FREEZE

Systemet ska kunna stoppa:

- pushnotiser,

- e-post,

- social publicering,

- och externa meddelanden.

28.44 SPEND FREEZE

Alla nya kostnadsskapande handlingar ska kunna stoppas.

28.45 DEPLOYMENT FREEZE

Nya deployments och governanceändringar ska kunna frysas under kris.

28.46 AUTHORITY FREEZE

Systemet ska kunna stoppa:

- nya grants,

- delegation,

- authorityhöjning,

- och ändrade approvalregler.

28.47 MINSTA TILLRÄCKLIGA STOPP

Krisledningen ska välja minsta stopp som effektivt begränsar risken.

28.48 STOPPETS BLAST RADIUS

Även nödbromsen har en blast radius.

Systemet ska bedöma:

- vilka användare som påverkas,

- vilka säkra funktioner som försvinner,

- och vilken sekundär risk stoppet skapar.

28.49 OMEDELBAR AKTIVERING

Kritiska nödbromsar ska kunna aktiveras utan att hela ordinarie approvalkedjan slutförs.

Aktiveringen ska kräva särskild nödbromsbehörighet.

28.50 TVÅPERSONERSAKTIVERING

Vissa globala stopp kan kräva två aktörer när tiden tillåter det.

28.51 ENSAM AKTIVERING VID OMEDELBAR FARA

Vid verifierad omedelbar systemisk risk ska en särskilt behörig aktör kunna stoppa först och få eftergranskning direkt därefter.

28.52 FYSISK OCH DIGITAL ÅTKOMST

Kritiska nödbromsar ska vara åtkomliga även om delar av normal administration ligger nere.

28.53 RESERVKANAL

Krisaktivering ska ha reservkanal.

Exempel:

- separat autentiserad kontrollpanel,

- hårdvarunyckel,

- eller annan isolerad väg.

28.54 SKYDD MOT MISSBRUK

Nödbromsen ska skyddas mot:

- obehörig aktivering,

- sabotage,

- replay,

- och oavsiktlig global påverkan.

28.55 AKTIVERINGSBEVIS

Efter aktivering ska systemet verifiera faktisk effekt.

Det räcker inte att UI visar:

Paused.

28.56 DISTRIBUERAT STOPP

Alla relevanta tjänster, workers, köer och offlineenheter ska få stoppstatus.

28.57 FÖRDRÖJD ENHET

En offlineenhet kanske inte kan stoppas direkt.

Dess grants ska därför vara:

- kortlivade,

- scopeade,

- och revocationmedvetna.

28.58 STOPPTILLSTÅND

Systemet ska kunna visa:

- requested,

- propagating,

- active,

- partially_active,

- failed,

- verifying,

- och released.

28.59 PARTIELLT STOPP

Om nödbromsen endast fått delvis effekt ska detta vara en kritisk signal.

28.60 MANUELL RESERV

Om automatisk propagatering misslyckas ska manuella isoleringssteg finnas.

28.61 SAFE MODE

Safe mode ska vara GainPilots säkra kontinuitetsläge.

28.62 SAFE MODE-FUNKTIONER

Safe mode kan tillåta:

- lokal inloggning på betrodd enhet,

- åtkomst till redan verifierad aktiv plan,

- lokal träningsloggning,

- visning av statiska övningsinstruktioner,

- export av egna lokalt tillgängliga data,

- och manuell användarkontroll.

28.63 SAFE MODE-BLOCKERINGAR

Safe mode ska kunna blockera:

- ny agentgenerering,

- externa modellkall,

- centrala writes,

- datadelning,

- köp,

- automatisk progression,

- kalenderwrite,

- och nya programaktiveringar.

28.64 SAFE MODE-DATA

Data som visas i safe mode ska vara:

- lokalt verifierad,

- versionsmärkt,

- och tydligt daterad.

28.65 STALE DATA

Om informationen kan vara inaktuell ska användaren se detta.

28.66 INGEN OSÄKER PERSONALISERING

Safe mode ska inte generera nya råd utifrån:

- ofullständig kontext,

- osäker identitet,

- eller otillgängliga säkerhetsregler.

28.67 MANUAL MODE

Användaren ska kunna fortsätta manuellt där detta är säkert.

28.68 LOKAL FIRST

Aktivt pass ska där möjligt kunna:

- visas,

- genomföras,

- och sparas lokalt

utan central automation.

28.69 SYNKSPÄRR

Lokal data ska inte synkas till en central miljö som ännu inte är verifierad.

28.70 KÖAD SYNK

Säkra lokala writes kan köas tills recovery är klar.

28.71 KONTINUITET

Verksamhetskontinuitet innebär att GainPilot kan upprätthålla prioriterade funktioner under störning.

28.72 BUSINESS IMPACT ANALYSIS

GainPilot ska genomföra Business Impact Analysis för kritiska capabilities.

28.73 KRITISKA CAPABILITIES

Kritiska GainPilot-capabilities kan omfatta:

- säker identitet,

- åtkomst till aktiv plan,

- lokal träningsloggning,

- databevarande,

- permissionrevocation,

- och användarinformation.

28.74 VIKTIGA CAPABILITIES

Viktiga men inte alltid omedelbart kritiska capabilities kan omfatta:

- molnsynk,

- Arnold-dialog,

- programgenerering,

- kostplanering,

- och progressionsanalys.

28.75 ICKE-KRITISKA CAPABILITIES

Funktioner som kan pausas tidigt kan omfatta:

- bakgrundsresearch,

- automatiska insights,

- mediaförbättring,

- marknadsanalys,

- och experiment.

28.76 ÅTERSTÄLLNINGSPRIORITET

Varje capability ska ha en återställningsprioritet.

28.77 MINIMUM VIABLE CONTINUITY

GainPilot ska definiera minsta verksamhetsnivå som måste bevaras.

28.78 MINIMUM VIABLE GAINPILOT

En möjlig miniminivå kan vara:

- användaren kan identifieras säkert,

- redan godkänd plan kan visas,

- träningsresultat kan sparas lokalt,

- användaren kan se driftstatus,

- och inga nya osäkra autonoma handlingar sker.

28.79 MANUELLA PROCESSER

Kritiska funktioner ska där relevant ha manuell reservprocess.

28.80 MANUELL PROCESS ÄR INTE OBEGRÄNSAD

Manuell hantering ska fortfarande följa:

- identitet,

- dataminimering,

- audit,

- och behörighet.

28.81 ALTERNATIV KOMMUNIKATION

GainPilot ska ha reservvägar för viktig användarkommunikation.

28.82 RESERVDOKUMENTATION

Kritiska runbooks, kontaktlistor och recoveryinstruktioner ska finnas offline eller isolerat.

28.83 KONTAKTLISTA

Krisorganisationens kontaktlista ska hållas aktuell.

28.84 ROLLRESERV

Kritiska roller ska ha ersättare.

28.85 SINGLE POINT OF HUMAN FAILURE

Krisförmågan får inte vara beroende av att exakt en person:

- är tillgänglig,

- minns alla lösenord,

- eller har ensam åtkomst till återställningsmaterial.

28.86 GRUNDARBEROENDE

I GainPilots tidiga fas kan grundaren vara central.

Systemet ska ändå dokumentera:

- konton,

- recovery,

- repository,

- leverantörer,

- och beslut

så att en tillfällig otillgänglighet inte skapar total kontrollförlust.

28.87 SUCCESSION ACCESS

Kritisk åtkomst ska ha säker reservmodell utan att ge vardaglig bred access.

28.88 BREAK-GLASS-CREDENTIALS

Reservcredentials ska vara:

- starkt skyddade,

- testade,

- auditerade,

- och endast använda i definierad kris.

28.89 SECRETSKONTINUITET

GainPilot ska kunna återställa eller rotera kritiska secrets.

28.90 LEVERANTÖRSREGISTER

Kritiska leverantörer ska ha:

- owner,

- kontakt,

- kontrakt,

- data scope,

- exit plan,

- och alternativ.

28.91 EXIT PLAN

Kritiska leverantörer ska ha dokumenterad exit- eller ersättningsplan.

28.92 DATAEXPORT FRÅN LEVERANTÖR

GainPilot ska kunna få ut nödvändig data i användbart format.

28.93 LEVERANTÖRSBORTFALL

Kontinuitetsplanen ska beskriva vad som händer om:

- leverantören ligger nere,

- kontot spärras,

- priset förändras drastiskt,

- eller tjänsten avvecklas.

28.94 MODELLLEVERANTÖR

Om en AI-modellleverantör faller bort ska GainPilot kunna:

- använda godkänd fallback,

- återgå till begränsad regelbaserad funktion,

- eller pausa generativ capability.

28.95 INGEN OSÄKER MODELLFALLBACK

En reservmodell ska inte användas för högriskuppgifter utan validering.

28.96 MOLNLEVERANTÖR

GainPilot ska ha plan för:

- regionfel,

- kontoåtkomst,

- backup,

- och export.

28.97 BETALNINGSLEVERANTÖR

Betalningsstörning ska inte radera eller låsa användarens data.

28.98 DOMÄNLEVERANTÖR

Förlust av domän, DNS eller certifikat ska ingå i kontinuitetsplanen.

28.99 KODHOSTING

Repository och releasehistorik ska ha verifierad backup eller exportstrategi.

28.100 DOKUMENTARKIV

Canonical böcker och arkitekturmaterial ska bevaras separat från en enda enhet eller tjänst.

28.101 KRISLEDNING

Deklarerad kris ska ha tydlig ledningsstruktur.

28.102 KRISLEDARE

Krisledaren ansvarar för:

- prioritering,

- beslutsrytm,

- resursfördelning,

- och gemensam lägesbild.

28.103 TEKNISK LEDARE

Teknisk ledare ansvarar för:

- containment,

- diagnos,

- recovery,

- och teknisk verifiering.

28.104 SÄKERHETS- OCH INTEGRITETSANSVARIG

Denna roll ansvarar för:

- skadebegränsning,

- dataåtkomst,

- bevis,

- notifieringsbehov,

- och säkerhetsbeslut.

28.105 DOMÄNANSVARIG

Domänansvarig bedömer:

- träningsmässig,

- kostmässig,

- och användarsäker påverkan.

28.106 KONTINUITETSANSVARIG

Kontinuitetsansvarig följer:

- prioriterade capabilities,

- reservprocesser,

- leverantörer,

- och recoveryordning.

28.107 KOMMUNIKATIONSANSVARIG

Kommunikationsansvarig samordnar:

- intern status,

- support,

- användarinformation,

- partners,

- och annan relevant kommunikation.

28.108 BESLUTSLOGG

Alla viktiga krisbeslut ska registreras.

28.109 BESLUTSLOGGENS INNEHÅLL

Loggen ska minst visa:

- tid,

- beslut,

- beslutsfattare,

- underlag,

- osäkerhet,

- förväntad effekt,

- och reviewpunkt.

28.110 LÄGESBILD

Krisledningen ska upprätthålla en gemensam lägesbild.

28.111 VERIFIED FACTS

Lägesbilden ska skilja verifierade fakta från:

- hypoteser,

- rapporter,

- och antaganden.

28.112 UNKNOWN

Det som ännu inte är känt ska vara synligt.

28.113 SENASTE UPPDATERING

Varje del av lägesbilden ska visa aktualitet.

28.114 PRIORITERING

Krisprioritering ska följa:

1. Skydda människors säkerhet.

2. Stoppa obehörig dataåtkomst.

3. Förhindra fortsatt irreversibel skada.

4. Bevara data och bevis.

5. Upprätthålla säkra kärnfunktioner.

6. Kommunicera med berörda.

7. Återställa kontroll och drift.

8. Optimera kostnad och normal produktivitet.

28.115 INGEN ROADMAPPRIORITERING UNDER AKUT KRIS

Vanligt utvecklingsarbete ska normalt pausas om det konkurrerar med kritisk krishantering.

28.116 CHANGE FREEZE

Krisledningen ska kunna införa change freeze.

28.117 TILLÅTNA KRISFÖRÄNDRINGAR

Endast förändringar som:

- begränsar skada,

- återställer kontroll,

- eller upprätthåller kritisk kontinuitet

ska normalt tillåtas.

28.118 KRISBRANCH

Akuta kodändringar ska ske genom särskild men fortfarande spårbar branchprocess.

28.119 MINSTA DIFF

Krisförändringar ska vara så små som möjligt.

28.120 KRISTESTER

Även akuta ändringar ska få proportionerliga tester.

28.121 KRISREVIEW

När full normal review inte är möjlig ska minst relevant snabb review genomföras.

28.122 EFTERGRANSKNING

Alla bypassade eller förkortade steg ska eftergranskas.

28.123 KRISBUDGET

Krisen ska kunna få särskild budget.

28.124 KRISBUDGETENS SCOPE

Budgeten ska vara:

- tidsbegränsad,

- ägd,

- och kopplad till krisidentiteten.

28.125 INGEN OBEGRÄNSAD KRISSPEND

Krisläge ska inte ge obegränsat ekonomiskt mandat.

28.126 EXTERNA EXPERTER

Krisledningen ska kunna anlita:

- säkerhetsexpert,

- dataräddning,

- juridisk expertis,

- domänexpert,

- eller leverantörsstöd

genom särskilt mandat.

28.127 BEVARANDE FÖRE REPARATION

Vid möjlig data- eller enhetsskada ska bevarande prioriteras före experimentell reparation.

28.128 INGEN DESTRUKTIV HEMMADIAGNOSTIK

Om lagringsmedia eller annan fysisk enhet visar allvarligt fel ska GainPilot- eller Omnira-processen kunna stoppa fortsatta skriv- och reparationsförsök.

28.129 PROFESSIONELL ÅTERSTÄLLNING

När risken kräver det ska professionell dataåterställning användas i stället för fortsatt agentexperiment.

28.130 KOMMUNIKATION I KRIS

Krisinformation ska vara:

- korrekt,

- snabb,

- proportionerlig,

- och samordnad.

28.131 INTERN KOMMUNIKATION

Intern status ska visa:

- nuläge,

- risk,

- beslut,

- åtgärder,

- blockerare,

- och nästa uppdatering.

28.132 ANVÄNDARKOMMUNIKATION

Användaren ska informeras när krisen påverkar:

- åtkomst,

- data,

- program,

- träning,

- kost,

- betalning,

- integritet,

- eller förväntad funktion.

28.133 BEGRIPLIG TON

Krisinformation ska undvika:

- intern jargong,

- vaga försäkringar,

- och onödig dramatik.

28.134 INGEN FALSK SÄKERHET

GainPilot ska inte säga:

Ingen data har påverkats

förrän detta verifierats.

28.135 INGEN SPEKULATIV ORSAK

Misstänkt orsak ska märkas som hypotes.

28.136 HANDLINGSINFORMATION

Användaren ska få veta om den behöver:

- avvakta,

- byta lösenord,

- kontrollera träningshistorik,

- undvika synk,

- eller kontakta support.

28.137 INGEN ONÖDIG ANVÄNDARÅTGÄRD

Användaren ska inte belastas med åtgärder som GainPilot kan utföra säkert centralt.

28.138 UPPDATERINGSRYTM

Krisledningen ska definiera när nästa uppdatering kommer.

28.139 STATUSSIDA

Större tjänstepåverkan ska kunna visas på status page.

28.140 DIREKTMEDDELANDE

Berörda användare kan behöva direktmeddelande utöver generell status.

28.141 SUPPORTBRIEF

Support ska få en canonical brief.

28.142 EN VERSION AV SANNINGEN

Support, Arnold, Atlas och status page ska bygga på samma verifierade krisstatus.

28.143 ARNOLD I KRIS

Arnold ska:

- förklara aktuell funktion,

- undvika osäkra råd,

- erbjuda säkra alternativ,

- och acceptera att viss automation är pausad.

28.144 ATLAS I KRIS

Atlas ska:

- sammanställa,

- analysera,

- prioritera,

- och upptäcka konflikter.

Atlas ska tydligt skilja:

- fakta,

- inferens,

- och rekommendation.

28.145 AGENTTYSTNAD

När säkert svar saknas ska agenten kunna säga:

Jag kan inte verifiera detta just nu.

Den ska inte fylla luckan med sannolik text.

28.146 DATAÅTKOMST I KRIS

Krisläge får inte automatiskt ge bredare tillgång till användardata.

28.147 ÄRENDESBUNDEN ACCESS

Extra access ska vara:

- kris- och uppgiftsbunden,

- tidsbegränsad,

- och auditerad.

28.148 MINIMERING

Endast data som krävs för containment eller recovery ska hämtas.

28.149 FORENSISK KOPIA

När relevant ska en verifierad forensisk eller oförändrad kopia bevaras innan reparation.

28.150 CHAIN OF CUSTODY

Bevis och känsliga artefakter ska ha dokumenterad hanteringskedja.

28.151 AUDIT I KRIS

Krisen ska inte stänga av audit.

Om ordinarie audit är otillgänglig ska reservloggning användas.

28.152 TIDSSTÄMPLING

Beslut och åtgärder ska tidsstämplas korrekt.

28.153 OFFLINEBESLUT

Beslut som fattas utanför ordinarie system ska registreras när systemet åter är tillgängligt.

28.154 RECOVERYPLAN

Recoveryplanen ska beskriva:

- vad som ska återställas,

- i vilken ordning,

- med vilka förutsättningar,

- av vem,

- och hur resultatet verifieras.

28.155 RECOVERYKRITERIER

Varje stoppad capability ska ha egna återstartskriterier.

28.156 IDENTITET FÖRE FUNKTION

Säker identitet och tenantisolering ska återställas före bred användarfunktion.

28.157 DATA FÖRE AUTOMATION

Dataintegritet ska verifieras innan autonoma writes återaktiveras.

28.158 PERMISSION FÖRE AGENTWRITE

Permission- och revocationsystemet ska verifieras innan agentexecution återstartar.

28.159 MANUAL FÖRE AUTONOM

Manuella och read-only-flöden ska återställas före högre autonomi.

28.160 INTERN TENANT FÖRST

Recovery kan börja med intern tenant.

28.161 BEGRÄNSAD CANARY

Därefter kan en liten definierad grupp användas.

28.162 GRADVIS AUTHORITY

Agentauthority ska höjas stegvis:

- disabled,

- read-only,

- propose-only,

- prepare-only,

- execute-with-approval,

- och först därefter bounded autonomy.

28.163 GRADVIS DATAÅTKOMST

Datatillgång ska också återställas stegvis.

28.164 GRADVIS SYNK

Köad offline- och backlogdata ska synkas i kontrollerade batcher.

28.165 BACKLOGANALYS

Innan återstart ska GainPilot bedöma:

- köstorlek,

- meddelandeålder,

- dubblettrisk,

- och kostnad.

28.166 INGEN BLIND BACKLOGREPLAY

Alla väntande handlingar ska inte utföras automatiskt efter recovery.

28.167 STALE INTENT

En gammal användarintention kan inte alltid genomföras senare.

Exempel:

En två dagar gammal begäran att flytta morgondagens pass är inte längre relevant.

28.168 EXPIRY VID KRIS

Väntande approvals och workflows ska kunna löpa ut under krisen.

28.169 OMPRÖVNING

Kritiska väntande handlingar ska omprövas mot aktuell kontext.

28.170 VERIFIERING

Återställd capability ska verifieras genom:

- tekniska tester,

- domäntester,

- permissiontester,

- användarflöden,

- och skyddsmått.

28.171 OBSERVATIONSPERIOD

Vissa capabilities ska ligga i observation innan full normalisering.

28.172 STABILIZED

Stabilized innebär att:

- akut risk är stoppad,

- prioriterade funktioner fungerar,

- och läget är under kontroll.

Det innebär inte att krisen är avslutad.

28.173 AVSLUT AV KRISLÄGE

Krisläge ska avslutas genom explicit beslut.

28.174 AVSLUTSKRITERIER

Kriterier ska minst omfatta:

- fortsatt skada stoppad,

- identitet verifierad,

- tenantisolering verifierad,

- data bedömd,

- centrala capabilities stabila,

- authority kontrollerad,

- användarkommunikation genomförd,

- och recoveryägare accepterar läget.

28.175 NORMAL MODE KRÄVER BESLUT

Systemet ska inte automatiskt gå tillbaka till normal mode när metrics blir gröna.

28.176 KVARVARANDE BEGRÄNSNINGAR

Vissa begränsningar kan kvarstå efter att krisledningen avslutats.

28.177 EFTERKRISLÄGE

GainPilot kan använda ett tidsbegränsat heightened monitoring mode.

28.178 FÖRHÖJD OBSERVABILITY

Efter kris ska:

- alerts,

- sampling,

- review,

- och rapportering

kunna vara förstärkta under en period.

28.179 TILLFÄLLIGT LÄGRE AUTONOMI

Agentautonomi kan förbli lägre tills tillräcklig ny evidens finns.

28.180 EFTERGRANSKNING

Varje deklarerad kris ska följas av en full eftergranskning.

28.181 KRISREVIEW

Review ska omfatta:

- förvarning,

- declaration,

- nödbroms,

- containment,

- ledning,

- kommunikation,

- kontinuitet,

- recovery,

- och återstart.

28.182 VARFÖR BLEV INCIDENTEN EN KRIS

Review ska identifiera varför ordinarie incidentförmåga inte räckte.

28.183 VARFÖR BLEV PÅVERKAN SYSTEMISK

Systemiska beroenden och gemensamma felpunkter ska analyseras.

28.184 NÖDBROMSENS EFFEKT

Review ska bedöma:

- om stoppet aktiverades i tid,

- om rätt scope stoppades,

- och om säkra funktioner bevarades.

28.185 FALSK POSITIV KRIS

En felaktig krisdeklaration ska också analyseras.

Överaktivering kan skapa stor verksamhetspåverkan.

28.186 FALSK NEGATIV KRIS

För sen eller utebliven krisdeklaration ska analyseras.

28.187 BESLUTSKVALITET

Review ska bedöma beslut utifrån den information som fanns då.

Senare kunskap får inte användas för förenklad efterhandsbedömning.

28.188 KOMMUNIKATIONSKVALITET

Review ska bedöma:

- tydlighet,

- aktualitet,

- konsekvens,

- och användarpåverkan.

28.189 KONTINUITETSKVALITET

Review ska bedöma vilka kärnfunktioner som kunde bevaras.

28.190 RECOVERYKVALITET

Review ska bedöma:

- återställningsordning,

- verifiering,

- dubbletter,

- datakonflikter,

- och authority.

28.191 ÅTGÄRDSKATEGORIER

Åtgärder ska kunna klassificeras som:

- prevent,

- detect,

- decide,

- stop,

- preserve,

- communicate,

- continue,

- recover,

- och govern.

28.192 KRISÅTGÄRDER

Varje åtgärd ska ha:

- ägare,

- deadline,

- risk,

- scope,

- och verifieringskriterium.

28.193 HÖGSTA PRIORITET

Systemiska skyddsbrister ska prioriteras över kosmetiska förbättringar.

28.194 DOKUMENTATIONSUPPDATERING

Krisrunbooks, kontaktlistor och kontinuitetsplaner ska uppdateras.

28.195 ARKITEKTURUPPDATERING

Krisen kan visa behov av:

- bättre isolering,

- lägre coupling,

- alternativ leverantör,

- lokal first,

- eller starkare authoritygränser.

28.196 BOK- OCH KONTRAKTSUPPDATERING

Om krisen visar att canonical arkitektur behöver förändras ska en separat bok- eller kontraktsrevision föreslås.

28.197 INGEN AUTOMATISK CANONICAL ÄNDRING

En agent får inte skriva om canonical principer direkt från en incidentrapport.

28.198 KRISÖVNING

GainPilot ska öva krisscenarier före verklig kris.

28.199 TABLETOP

Tabletop ska testa:

- roller,

- beslut,

- kommunikation,

- och beroenden.

28.200 TEKNISK ÖVNING

Teknisk övning ska testa:

- nödbroms,

- tokenrevocation,

- write freeze,

- tenantisolering,

- safe mode,

- backup,

- och recovery.

28.201 KOMMUNIKATIONSÖVNING

Organisationen ska öva:

- intern status,

- användarmeddelande,

- supportbrief,

- och osäkerhetskommunikation.

28.202 GRUNDAROTILLGÄNGLIGHET

Övning ska omfatta att grundaren tillfälligt inte är tillgänglig.

28.203 LEVERANTÖRSBORTFALL

Övning ska omfatta bortfall av:

- modell,

- moln,

- betalning,

- kodhosting,

- eller kommunikationskanal.

28.204 IDENTITETSKOMPROMISS

Övning ska omfatta komprometterat:

- administratörskonto,

- agenttoken,

- eller utvecklingskonto.

28.205 DATAKORRUPTION

Övning ska omfatta osäker canonical data.

28.206 AGENTKONTROLLFÖRLUST

Övning ska omfatta agent som:

- fortsätter efter revocation,

- skapar upprepade writes,

- eller inte följer stoppsignal.

28.207 EKONOMISK LOOP

Övning ska omfatta snabb kostnadsökning från:

- retries,

- modellkall,

- eller automatiska köp.

28.208 KRITISK DOMÄNBUGG

Övning ska omfatta fel som påverkar tränings- eller kostsäkerhet.

28.209 ÅTERSTARTSÖVNING

Övningen ska inte sluta vid stopp.

Den ska också testa full gradvis recovery.

28.210 MÄTVÄRDEN

Krisförmågan ska mätas.

28.211 TIME TO DECLARE

Tid från kritisk signal till krisdeklaration ska följas.

28.212 TIME TO BRAKE

Tid från beslut till verifierad nödbromseffekt ska följas.

28.213 TIME TO CONTAIN

Tid till stoppad fortsatt påverkan ska följas.

28.214 CONTINUITY LEVEL

GainPilot ska kunna mäta hur stor andel av prioriterade kärnfunktioner som bevarades.

28.215 TIME TO SAFE MODE

Tid till fungerande safe mode ska följas.

28.216 TIME TO RECOVER

Återställningstid ska följas per capability.

28.217 TIME TO NORMALIZE

Tid till normal mode ska skiljas från teknisk recovery.

28.218 BRAKE EFFECTIVENESS

Nödbromsen ska mätas på:

- täckning,

- hastighet,

- false stop,

- och kvarvarande writes.

28.219 RECOVERY DEFECTS

Fel som uppstår under recovery ska följas.

28.220 COMMUNICATION DELAY

Tid till första korrekta användarinformation ska följas.

28.221 DECISION REVERSAL

Beslut som snabbt behöver ändras kan visa:

- ny information,

- eller bristande beslutsunderlag.

De ska analyseras utan automatisk skuldbeläggning.

28.222 EXERCISE FINDINGS

Brist som upptäcks i övning ska få samma ägarskap som verkliga incidentåtgärder.

28.223 KRISBEREDSKAP

GainPilot ska regelbundet bedöma sin krisberedskap.

28.224 BEREDSKAPSDIMENSIONER

Bedömningen ska minst omfatta:

- människor,

- process,

- teknik,

- data,

- leverantörer,

- kommunikation,

- ekonomi,

- och governance.

28.225 INGEN ENSKILD BEREDSKAPSPOÄNG

En global readiness score får inte dölja kritiska luckor.

28.226 ATLAS OCH BEREDSKAP

Atlas ska kunna sammanställa:

- förfallna övningar,

- saknade reservroller,

- ouppdaterade runbooks,

- och leverantörsrisker.

28.227 ARNOLD OCH KONTINUITET

Arnold ska testas för att kunna fungera begränsat och säkert utan full central intelligens.

28.228 HERMES OCH KRIS

Hermes ska kunna gå in i ett särskilt krisläge med:

- hårdare minimering,

- read restrictions,

- och blockerad tvärdomändelning.

28.229 DEVELOPMENT CONTROL PLANE

Utvecklings- och deploymentverktyg ska kunna isoleras från produktion under kris.

28.230 SEPARAT KRISÅTKOMST

Krisaccess ska inte vara samma konto eller token som vanlig utvecklingsaccess.

28.231 KONTROLLERAD KRISUTVECKLING

Förändringar av krissystemet ska följa:

Riskanalys

→ scenario

→ scope

→ separat branch

→ implementation

→ negativa tester

→ distribuerat stopptest

→ safe mode-test

→ återstartstest

→ säkerhets- och integritetsreview

→ shadow mode

→ pull request

→ tabletop

→ teknisk övning

→ canary

→ kontrollerad merge

→ verifiering.

28.232 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för krisläge, nödbroms och verksamhetskontinuitet.

**Kontrakt GP-550 — Krisläge ska vara ett explicit operating mode**

GainPilot ska tekniskt kunna växla mellan normal, degraded, incident, crisis, disaster, recovery och verifying med definierade effekter på capabilities, authority, data, budget och automation.

**Kontrakt GP-551 — Kris ska skiljas från vanlig incident**

Krisläge ska endast användas när påverkan, osäkerheten, koordinationsbehovet eller systemrisken överstiger ordinarie incidenthanteringsförmåga.

**Kontrakt GP-552 — Nödbromsen ska vara granulär**

Systemet ska kunna stoppa operation, capability, agent, användare, tenant, projekt, integration, writeplan eller hela Omnira utan att säkra funktioner försvinner i onödan.

**Kontrakt GP-553 — Minsta tillräckliga stopp ska prioriteras**

Containment ska begränsa fortsatt skada med minsta möjliga blast radius och samtidigt bevara säkra kärnfunktioner.

**Kontrakt GP-554 — Kritisk nödbroms ska kunna aktiveras snabbt**

Verifierad omedelbar risk ska kunna stoppas av särskilt behörig aktör innan full normal approvalkedja är klar, med omedelbar audit och eftergranskning.

**Kontrakt GP-555 — Nödbromsens verkliga effekt ska verifieras**

Ett UI-tillstånd eller skickat stoppkommando får inte betraktas som tillräckligt; alla relevanta tjänster, workers, tokens, köer och enheter ska kontrolleras.

**Kontrakt GP-556 — Krisläge ska normalt minska autonomi**

Atlas, Arnold och andra agenter ska inte få bredare authority genom krisdeklaration; execution, delegation, dataåtkomst och budget ska normalt begränsas.

**Kontrakt GP-557 — Safe mode ska bevara säkra kärnfunktioner**

Användaren ska där möjligt kunna läsa verifierad plan, logga lokalt, se status och behålla kontroll utan nya osäkra agent- eller molnwrites.

**Kontrakt GP-558 — Kontinuitet ska definieras per capability**

GainPilot ska ha en prioriterad lista över kritiska, viktiga och pausbara capabilities samt definierad minsta verksamhetsnivå.

**Kontrakt GP-559 — Krisledning ska ha tydliga roller och beslutsmandat**

Krisledare, teknisk ledare, säkerhets-/integritetsansvarig, domänansvarig, kontinuitetsansvarig och kommunikationsansvarig ska ha tydliga och separerade uppgifter.

**Kontrakt GP-560 — Lägesbilden ska skilja fakta från hypotes**

Verifierade fakta, osäkerheter, antaganden, beslut och åtgärder ska presenteras separat och tidsstämplat.

**Kontrakt GP-561 — Data och bevis ska bevaras före reparation**

Krisrespons får inte radera, skriva över eller förändra relevanta loggar, lagringsmedia, branches, data eller artefakter innan påverkan och bevarandebehov har bedömts.

**Kontrakt GP-562 — Krisaccess ska vara minimerad och ärendebunden**

Krisläge får inte automatiskt ge agenter, support eller utvecklare obegränsad åtkomst till produktionsdata, secrets eller privata användardomäner.

**Kontrakt GP-563 — Krisbudgeten ska vara begränsad**

Akut behov får möjliggöra särskild spend men budgeten ska vara tids-, belopps-, leverantörs- och krisbunden.

**Kontrakt GP-564 — Kommunikation ska vara samordnad och sann**

Arnold, Atlas, support, status page och direkt användarinformation ska bygga på samma verifierade lägesbild och får inte presentera osäker orsak eller recovery som faktum.

**Kontrakt GP-565 — Recovery ska återställa kontroll före automation**

Identitet, tenantisolering, dataintegritet, permissions och manuella kärnflöden ska verifieras före agentwrites och högre autonomi.

**Kontrakt GP-566 — Backlog får inte återspelas blint**

Köade writes, approvals, workflows och användarintentioner ska omprövas för relevans, expiry, idempotens och aktuell kontext efter kris.

**Kontrakt GP-567 — Normal mode ska kräva explicit beslut**

Gröna metrics eller återställd tjänst får inte automatiskt återställa full automation, authority, dataåtkomst eller normal drift.

**Kontrakt GP-568 — Krisavslut ska ha verifierbara kriterier**

Fortsatt skada, identitet, isolering, data, capabilities, authority, kommunikation och kvarvarande risk ska bedömas innan krisläge avslutas.

**Kontrakt GP-569 — Efterkrisövervakning ska kunna förstärkas**

GainPilot ska kunna behålla lägre autonomi, tätare observability och striktare review under en tidsbegränsad stabiliseringsperiod.

**Kontrakt GP-570 — Krisförmågan ska övas**

Nödbroms, safe mode, reservroller, leverantörsbortfall, komprometterad identitet, dataförlust, agentkontroll och gradvis återstart ska testas regelbundet.

**Kontrakt GP-571 — Grundar- och leverantörsberoenden ska ha reservplan**

GainPilot får inte vara helt beroende av en enda person, enhet, leverantör, region eller åtkomstväg för att kunna stoppa, bevara och återställa systemet.

**Kontrakt GP-572 — Atlas får stödja men inte ensam äga krisen**

Atlas ska kunna sammanställa och rekommendera men får inte ensam ge sig systemmandat, deklarera avslut eller återställa full authority.

**Kontrakt GP-573 — Krissystemet ska utvecklas genom full governance**

Operating modes, nödbromsar, safe mode, reservaccess, krisbudget, kommunikation och recovery ska ändras genom separat branch, negativa tester, övningar, review, shadow mode och kontrollerad utrullning.

28.233 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- kalla varje incident för kris,

- vänta på full rotorsak innan pågående systemisk skada stoppas,

- använda kris som ursäkt för obegränsad agentauthority,

- ge Atlas L6 därför att situationen är brådskande,

- låta Arnold fortsätta osäkra automatiska anpassningar,

- stoppa hela Omnira när en capability kan isoleras,

- behålla osäkra writes för att upprätthålla en grön dashboard,

- använda ett enda globalt stopp utan granulära alternativ,

- sakna tenant-, agent- eller capabilitynödbroms,

- aktivera nödbroms utan att verifiera effekten,

- anta att offlineenheter har tagit emot stoppet,

- låta gamla tokens fortsätta fungera,

- sakna reservväg till kritisk nödbroms,

- låta nödbromsen vara enkel att sabotera,

- använda krisläge för att kringgå audit,

- använda kris för att få obegränsad produktionsdata,

- stänga av all read-only-funktion utan behov,

- göra safe mode beroende av samma felande centralservice,

- generera nya högriskråd i safe mode,

- synka lokal data till overifierad miljö,

- sakna minimum viable continuity,

- prioritera research eller analytics över databevarande,

- låta ett betalningsfel radera användardata,

- sakna reservroll för kritisk mänsklig funktion,

- låta all krisåtkomst bero på en enda person,

- dela vardagliga administratörsuppgifter med break-glass-konto,

- ha reservcredentials som aldrig testats,

- sakna exitplan för kritisk leverantör,

- använda otestad modell som akut högriskfallback,

- anta att repository alltid finns tillgängligt,

- lagra alla canonical artefakter på en enda SSD eller tjänst,

- sakna gemensam lägesbild,

- blanda fakta och hypotes,

- sakna tidsstämplar,

- prioritera normal roadmap under akut kris,

- göra stora refaktoreringar som krisfix,

- hoppa över all review,

- låta bypassade steg förbli ogranskade,

- använda obegränsad krisbudget,

- låta agent själv köpa extern krishjälp,

- fortsätta destruktiv diagnostik på skadad lagring,

- skriva över bevis före forensisk kopia,

- publicera spekulativ rotorsak,

- lova återställningstid utan grund,

- ge användaren onödiga manuella uppgifter,

- låta support använda annan krisstatus än resten av systemet,

- låta Arnold gissa när data inte kan verifieras,

- använda kris för bredare Hermesåtkomst,

- sakna chain of custody,

- stänga av audit under kris,

- återstarta automation före permissionkontroll,

- återstarta full authority direkt,

- replaya alla köer efter recovery,

- genomföra gamla användarintentioner som inte längre är relevanta,

- återanvända approvals som löpt ut under krisen,

- beskriva stabilized som closed,

- automatiskt gå till normal mode,

- stänga kris trots overifierad data,

- ta bort förhöjd övervakning för tidigt,

- automatiskt återställa tidigare agentautonomi,

- skriva en eftergranskning som endast beskriver tekniskt fel,

- ignorera varför incidenten blev systemisk,

- mäta endast recoverytid och inte kontinuitet,

- lämna krisåtgärder utan ägare,

- uppdatera canonical bok direkt från en agentgenererad postmortem,

- genomföra övningar som endast testar stopp och inte återstart,

- anta att grundaren alltid är tillgänglig,

- göra destruktiv datarepair till första krisövning,

- mäta beredskap med en enda poäng,

- låta Atlas ensam deklarera normalisering,

- eller ändra kris- och nödbromssystemet direkt i produktion utan branch, tester, övning, review och kontrollerad utrullning.

28.234 KANONISKA BESLUT FRÅN KAPITEL 28

Följande beslut etableras:

1. GainPilot ska ha explicit crisis mode.

2. Crisis mode ska skiljas från incident mode.

3. Disaster mode ska kunna användas vid omfattande kontroll- eller infrastrukturförlust.

4. Recovery mode ska vara separat från normal mode.

5. Operating mode ska tekniskt påverka systembeteende.

6. Varje kris ska ha stabil identitet.

7. Krisen ska klassificeras efter typ.

8. Säkerhetskris ska stödjas.

9. Integritetskris ska stödjas.

10. Identitetskris ska stödjas.

11. Datakris ska stödjas.

12. Agentkontrollkris ska stödjas.

13. Ekonomisk kris ska stödjas.

14. Leverantörskris ska stödjas.

15. Infrastrukturkris ska stödjas.

16. Governancekris ska stödjas.

17. Multi-domain-kris ska stödjas.

18. Krisnivå ska bero på mer än incidentseverity.

19. Automatisk krissignal ska kunna skapas.

20. Kritisk automatisk nödbroms ska kunna användas.

21. Omfattande kris ska normalt deklareras av behörig människa.

22. Atlas ska få rekommendera krisdeklaration.

23. Arnold ska få skapa användarsäkerhetssignal.

24. Krisdeklaration ska vara strukturerad.

25. Preliminär krisdeklaration ska stödjas.

26. Containment ska inte vänta på full rotorsak.

27. GainPilot ska ha nödbromssystem.

28. Global Omnira-nödbroms ska finnas.

29. GainPilot-projektnödbroms ska finnas.

30. Tenantnödbroms ska finnas.

31. Användarnödbroms ska finnas.

32. Agentnödbroms ska finnas.

33. Capabilitynödbroms ska finnas.

34. Verktygsnödbroms ska finnas.

35. Integrationsnödbroms ska finnas.

36. Write freeze ska finnas.

37. Read freeze ska kunna användas vid datarisk.

38. Communication freeze ska finnas.

39. Spend freeze ska finnas.

40. Deployment freeze ska finnas.

41. Authority freeze ska finnas.

42. Minsta tillräckliga stopp ska prioriteras.

43. Nödbromsens egen påverkan ska bedömas.

44. Kritisk aktivering ska kunna ske snabbt.

45. Vissa globala stopp ska kunna kräva två personer.

46. Omedelbar fara ska kunna stoppas av ensam särskilt behörig aktör.

47. Kritisk nödbroms ska ha reservkanal.

48. Nödbromsen ska skyddas mot missbruk.

49. Faktisk stoppeffekt ska verifieras.

50. Stoppstatus ska propageras distribuerat.

51. Offlinegrants ska begränsa kvarvarande risk.

52. Partially active stop ska vara kritisk signal.

53. Manuell reservisolering ska finnas.

54. Safe mode ska vara definierat.

55. Safe mode ska kunna visa verifierad plan.

56. Safe mode ska stödja lokal träningsloggning.

57. Safe mode ska blockera osäkra centrala writes.

58. Safe mode-data ska versionsmärkas.

59. Stale data ska visas tydligt.

60. Safe mode ska inte generera osäker personalisering.

61. Manual mode ska bevaras där säkert.

62. Aktivt pass ska fungera local-first där möjligt.

63. Synk till overifierad miljö ska blockeras.

64. Lokal data ska kunna köas.

65. Business Impact Analysis ska genomföras.

66. Capabilities ska klassificeras efter kontinuitetskritikalitet.

67. Minsta GainPilot-funktion ska definieras.

68. Kritiska funktioner ska kunna ha manuell reservprocess.

69. Reservprocesser ska fortfarande följa integritet och behörighet.

70. Kritisk kommunikation ska ha alternativ kanal.

71. Runbooks och kontaktlistor ska finnas isolerat.

72. Kritiska roller ska ha ersättare.

73. Krisförmågan ska inte bero på exakt en person.

74. Grundarberoende ska dokumenteras och minskas.

75. Säker reservaccess ska finnas.

76. Break-glass-credentials ska testas.

77. Secrets ska kunna roteras och återställas.

78. Kritiska leverantörer ska registreras.

79. Exitplan ska finnas.

80. Leverantörsdata ska kunna exporteras.

81. Modellbortfall ska ha säker fallback eller paus.

82. Otestad fallback ska inte användas för högriskcapability.

83. Molnregionfel ska ingå i plan.

84. Betalningsfel ska inte radera data.

85. DNS- och domänbortfall ska ingå.

86. Repository ska ha backup- eller exportstrategi.

87. Canonical dokument ska bevaras separat.

88. Krisledning ska ha tydlig struktur.

89. Krisledare ska ha definierat mandat.

90. Teknisk ledare ska vara separat roll.

91. Säkerhets- och integritetsansvar ska vara explicit.

92. Domänansvar ska finnas.

93. Kontinuitetsansvar ska finnas.

94. Kommunikationsansvar ska finnas.

95. Krisbeslut ska loggas.

96. Beslutslogg ska visa osäkerhet och reviewpunkt.

97. Gemensam lägesbild ska finnas.

98. Fakta och hypotes ska skiljas.

99. Unknowns ska visas.

100. Lägesbild ska ha aktualitet.

101. Säkerhet och dataskydd ska prioriteras.

102. Normal roadmap ska kunna pausas.

103. Change freeze ska kunna aktiveras.

104. Endast nödvändiga krisförändringar ska tillåtas.

105. Krisfixar ska ha separat branch.

106. Krisdiff ska vara minimal.

107. Proportionerliga tester ska krävas.

108. Snabb relevant review ska genomföras.

109. Förkortade steg ska eftergranskas.

110. Särskild krisbudget ska stödjas.

111. Krisbudget ska vara begränsad.

112. Extern experthjälp ska kunna godkännas.

113. Bevarande ska ske före destruktiv reparation.

114. Allvarligt lagringsfel ska stoppa fortsatta osäkra försök.

115. Professionell återställning ska kunna väljas.

116. Krisinformation ska samordnas.

117. Intern status ska vara strukturerad.

118. Berörda användare ska informeras.

119. Tonen ska vara begriplig och proportionerlig.

120. Falsk säkerhet ska förbjudas.

121. Spekulativ orsak ska märkas.

122. Användaren ska få relevanta instruktioner.

123. Onödig användarbörda ska undvikas.

124. Nästa uppdateringstid ska anges.

125. Status page ska stödjas.

126. Direktmeddelande ska kunna användas.

127. Support ska få canonical brief.

128. Alla kommunikationsytor ska dela samma lägesbild.

129. Arnold ska använda säkert krisbeteende.

130. Atlas ska skilja fakta från inferens.

131. Agenter ska kunna avstå från overifierat svar.

132. Kris ska inte automatiskt bredda dataåtkomst.

133. Extra access ska vara ärendebunden.

134. Dataminimering ska gälla.

135. Forensisk kopia ska kunna bevaras.

136. Chain of custody ska stödjas.

137. Audit ska fortsätta i kris.

138. Reservloggning ska finnas.

139. Offlinebeslut ska registreras i efterhand.

140. Recoveryplan ska vara strukturerad.

141. Varje capability ska ha återstartskriterier.

142. Identitet ska återställas före bred funktion.

143. Dataintegritet ska verifieras före automation.

144. Permission ska verifieras före agentwrite.

145. Manual mode ska återställas före autonomi.

146. Intern tenant ska kunna användas först.

147. Begränsad canary ska användas.

148. Authority ska återställas stegvis.

149. Dataåtkomst ska återställas stegvis.

150. Backlog ska synkas kontrollerat.

151. Backlog ska analyseras före replay.

152. Gamla intentioner ska kunna förfalla.

153. Approvals ska kunna löpa ut under kris.

154. Context ska omprövas.

155. Recovery ska domän- och permissiontestas.

156. Observationstid ska kunna krävas.

157. Stabilized ska skiljas från closed.

158. Krisläge ska avslutas explicit.

159. Avslutskriterier ska vara verifierbara.

160. Normal mode ska kräva beslut.

161. Begränsningar ska kunna kvarstå.

162. Heightened monitoring ska stödjas.

163. Agentautonomi ska kunna förbli sänkt.

164. Full eftergranskning ska krävas.

165. Review ska analysera varför incidenten blev kris.

166. Systemiska beroenden ska analyseras.

167. Nödbromsens kvalitet ska granskas.

168. Falska positiva kriser ska analyseras.

169. Falska negativa kriser ska analyseras.

170. Beslut ska bedömas utifrån då tillgänglig information.

171. Kommunikationskvalitet ska granskas.

172. Kontinuitetskvalitet ska granskas.

173. Recoverykvalitet ska granskas.

174. Krisåtgärder ska ha ägare.

175. Systemiska skyddsbrister ska prioriteras.

176. Runbooks och kontaktlistor ska uppdateras.

177. Arkitekturen ska kunna ändras efter styrd analys.

178. Canonical bok ska inte ändras automatiskt.

179. Krisövningar ska genomföras.

180. Tabletop ska testa roller och beslut.

181. Teknisk övning ska testa nödbroms och recovery.

182. Kommunikationsövning ska genomföras.

183. Grundarotillgänglighet ska övas.

184. Leverantörsbortfall ska övas.

185. Identitetskompromiss ska övas.

186. Datakorruption ska övas.

187. Agentkontrollförlust ska övas.

188. Kostnadsloop ska övas.

189. Kritisk domänbugg ska övas.

190. Övning ska inkludera återstart.

191. Time to declare ska mätas.

192. Time to brake ska mätas.

193. Time to contain ska mätas.

194. Continuity level ska mätas.

195. Time to safe mode ska mätas.

196. Recoverytid ska mätas per capability.

197. Normaliseringstid ska hållas separat.

198. Brake effectiveness ska följas.

199. Recovery defects ska följas.

200. Kommunikationsfördröjning ska följas.

201. Övningsfynd ska få ägare.

202. Beredskap ska bedömas multidimensionellt.

203. En enda readiness score ska inte styra.

204. Atlas ska sammanställa beredskapsluckor.

205. Arnold ska fungera säkert utan full central intelligens.

206. Hermes ska ha crisis mode.

207. Development control plane ska kunna isoleras.

208. Krisaccess ska skiljas från vardagsaccess.

209. Krissystemet ska utvecklas genom full governance.

210. GainPilot ska kunna bromsa, fortsätta säkert och återstarta utan att förlora kontrollen.

28.235 IMPLEMENTERINGSORDNING

GainPilots kris-, nödbroms- och kontinuitetsförmåga ska implementeras stegvis.

Fas 1 — Operating modes

Implementera:

- normal,

- degraded,

- incident,

- crisis,

- disaster,

- recovery,

- verifying,

- och stabilized.

Fas 2 — Krismodell

Implementera:

- crisis identity,

- type,

- severity,

- affected scope,

- lead,

- status,

- och audit.

Fas 3 — Capabilitykritikalitet

Klassificera:

- critical,

- important,

- deferrable,

- och non-essential.

Fas 4 — Business Impact Analysis

Dokumentera per capability:

- användarpåverkan,

- data,

- beroenden,

- maximum tolerable outage,

- RPO,

- RTO,

- och reservmetod.

Fas 5 — Capabilitynödbroms

Implementera stopp för:

- adapt workout,

- program activation,

- calendar write,

- data sharing,

- purchase,

- och external communication.

Fas 6 — Agentnödbroms

Implementera:

- pause Arnold,

- pause Atlas,

- pause specialist,

- read-only,

- propose-only,

- och token revoke.

Fas 7 — GainPilot-projektstopp

Implementera:

- write freeze,

- communication freeze,

- spend freeze,

- deployment freeze,

- och authority freeze.

Fas 8 — Tenant- och användarstopp

Implementera isolering utan onödig påverkan på andra tenants.

Fas 9 — Global Omnira-nödbroms

Implementera systemomfattande stopp för nya autonoma writes och authorityhöjningar.

Fas 10 — Stoppropagering

Implementera:

- service propagation,

- worker stop,

- queue pause,

- token revocation,

- cache invalidation,

- och verification.

Fas 11 — Reservaktivering

Implementera separat starkt autentiserad kriskanal.

Fas 12 — Safe mode

Implementera:

- verified cached plan,

- local workout logging,

- static instructions,

- local status,

- och blocked central writes.

Fas 13 — Lokal kontinuitet

Implementera:

- local operation identity,

- encrypted storage,

- queued sync,

- och safe export.

Fas 14 — Kontinuitetsregister

Implementera:

- critical capability,

- manual alternative,

- owner,

- dependencies,

- och recovery priority.

Fas 15 — Krisroller

Implementera:

- crisis lead,

- technical lead,

- security/privacy lead,

- domain lead,

- continuity lead,

- communication lead,

- och alternates.

Fas 16 — Besluts- och lägeslogg

Implementera:

- verified facts,

- hypotheses,

- unknowns,

- decisions,

- owners,

- och update cadence.

Fas 17 — Krisbudget

Implementera:

- crisis-bound budget,

- maximum amount,

- vendor scope,

- expiry,

- approval,

- och audit.

Fas 18 — Leverantörskontinuitet

Implementera register och exitplan för:

- cloud,

- AI models,

- payment,

- domain/DNS,

- code hosting,

- och communication.

Fas 19 — Reservaccess

Implementera:

- break-glass credentials,

- secure storage,

- test,

- rotation,

- och dual control där relevant.

Fas 20 — Krisinformation

Implementera:

- internal brief,

- support brief,

- status page,

- direct user message,

- och next update.

Fas 21 — Recoveryplaner

Implementera återstartskriterier per kritisk capability.

Fas 22 — Gradvis authorityåterställning

Implementera:

- disabled,

- read-only,

- propose-only,

- prepare-only,

- execute-with-approval,

- och bounded autonomous.

Fas 23 — Backlogtriage

Implementera:

- expiry,

- relevance,

- idempotency,

- context recheck,

- och controlled replay.

Fas 24 — Efterkrisövervakning

Implementera:

- heightened alerts,

- tighter review,

- lower autonomy,

- och review expiry.

Fas 25 — Krisavslut

Implementera verifierbara closurekriterier och explicit beslut.

Fas 26 — Tabletop

Öva:

- privacy crisis,

- agent-control crisis,

- provider outage,

- och founder unavailability.

Fas 27 — Teknisk nödbromsövning

Verifiera:

- aktivering,

- propagation,

- partial failure,

- manual isolation,

- och audit.

Fas 28 — Safe mode-övning

Verifiera att användaren kan:

- öppna plan,

- logga lokalt,

- se status,

- och undvika osäker synk.

Fas 29 — Recoveryövning

Verifiera:

- identity,

- tenant isolation,

- data,

- permissions,

- backlog,

- canary,

- och authority.

Fas 30 — Leverantörsbortfall

Genomför övning för:

- AI-provider,

- cloud region,

- payment,

- DNS,

- och repository.

Fas 31 — Data- och lagringskris

Implementera:

- write stop,

- forensic preservation,

- checksum,

- professional recovery handoff,

- och no-destructive-repair policy.

Fas 32 — Krisobservability

Implementera mått för:

- time to declare,

- time to brake,

- time to contain,

- continuity,

- recovery,

- och communication.

Fas 33 — Full krisgovernance

Implementera:

- periodic review,

- role verification,

- contact review,

- access test,

- supplier exit test,

- och forbidden self-modification.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- enhets- och policytester,

- negativa authorizationtester,

- distribuerade stopptester,

- offline- och safe mode-test,

- leverantörsfel,

- data- och bevarandetest,

- tabletop,

- teknisk övning,

- shadow mode,

- pull request,

- säkerhets-, integritets- och operativ review,

- canary,

- kontrollerad merge,

- och verifierad återstart.

28.236 FRAMGÅNGSKRITERIER

Kapitel 28:s vision är framgångsrikt realiserad när:

- GainPilot har explicita operating modes,

- incident och kris hålls åtskilda,

- disaster och recovery kan representeras,

- kris påverkar capabilities och authority tekniskt,

- varje kris har identitet,

- flera kristyper kan hanteras,

- kriströskeln är definierad,

- automatiska kritiska signaler kan skapas,

- mänskligt deklarerat krisläge fungerar,

- Atlas kan rekommendera men inte ensam ta kontroll,

- Arnold kan skapa säkerhetssignal,

- krisdeklaration visar scope och ledning,

- preliminär declaration kan göras,

- containment inte väntar på full rotorsak,

- global nödbroms finns,

- GainPilot kan stoppas separat,

- tenant och användare kan isoleras,

- agent och capability kan stoppas,

- verktyg och integrationer kan kopplas bort,

- write, communication, spend, deployment och authority kan frysas,

- minsta tillräckliga stopp används,

- nödbromsens egen påverkan bedöms,

- akut stopp kan genomföras snabbt,

- kritiska globala stopp kan använda dual control,

- reservkanal finns,

- stoppsystemet är skyddat mot sabotage,

- verklig stoppeffekt verifieras,

- distribuerade workers och tokens stoppas,

- partial stop upptäcks,

- safe mode fungerar,

- verifierad plan kan visas,

- träningsresultat kan sparas lokalt,

- osäkra centrala writes blockeras,

- stale data märks,

- manual mode finns,

- synk kan pausas,

- Business Impact Analysis är genomförd,

- kritiska capabilities är klassificerade,

- minimum viable GainPilot är definierat,

- manuella reservprocesser finns,

- reservkommunikation finns,

- runbooks och kontakter finns isolerat,

- kritiska roller har ersättare,

- verksamheten inte är helt beroende av en person,

- break-glass-access testas,

- secrets kan roteras,

- leverantörsregister och exitplaner finns,

- data kan exporteras från kritiska leverantörer,

- AI-fallback är testad eller capabilityn pausas,

- moln-, betalnings-, DNS- och repositorybortfall har planer,

- canonical dokument finns i verifierad säker kopia,

- krisledningens roller är tydliga,

- beslut loggas,

- lägesbilden skiljer fakta och hypotes,

- unknowns visas,

- prioriteringsordningen är fastställd,

- normal roadmap kan frysas,

- krisfixar har minimalt scope,

- akuta ändringar får tester och review,

- bypassade steg eftergranskas,

- krisbudget är begränsad,

- extern professionell hjälp kan anlitas kontrollerat,

- data och bevis bevaras före reparation,

- osäkra lagringsförsök kan stoppas,

- kommunikationen är samordnad,

- användare får begriplig information,

- spekulativ orsak märks,

- support använder canonical status,

- Arnold inte gissar,

- kris inte breddar dataåtkomst automatiskt,

- forensisk bevarandekedja finns,

- audit fortsätter,

- recoveryplaner finns per capability,

- identitet och isolering återställs först,

- dataintegritet verifieras före automation,

- permission testas före agentwrite,

- authority återställs stegvis,

- backlog analyseras före replay,

- gamla intentioner och approvals kan löpa ut,

- canary används,

- observationstid kan krävas,

- stabilized inte blandas med closed,

- krisläge avslutas explicit,

- normal mode kräver beslut,

- förhöjd övervakning används,

- autonomi kan förbli sänkt,

- full krisreview genomförs,

- nödbromsens precision analyseras,

- falska positiva och negativa deklarationer följs,

- kontinuitet och recoverykvalitet bedöms,

- krisåtgärder har ägare,

- dokumentation och arkitektur förbättras kontrollerat,

- canonical bok inte skrivs om automatiskt,

- tabletop genomförs,

- tekniska krisövningar genomförs,

- kommunikation övas,

- grundarotillgänglighet övas,

- leverantörsbortfall övas,

- identitetskompromiss övas,

- dataförlust och korruption övas,

- agentkontrollförlust övas,

- ekonomisk loop övas,

- kritisk domänbugg övas,

- återstart ingår i varje övning,

- time to declare, brake och contain mäts,

- continuity level mäts,

- safe mode och recoverytid mäts,

- brake effectiveness följs,

- recovery defects följs,

- krisberedskap bedöms multidimensionellt,

- Hermes har crisis mode,

- utvecklingsplanet kan isoleras,

- krisaccess skiljs från vardagsaccess,

- och alla kris- och nödbromsförändringar sker genom separat branch, negativa tester, övningar, review, shadow mode och kontrollerad utrullning.

28.237 SAMMANFATTNING

GainPilot ska vara förberett för situationer där vanlig incidenthantering inte räcker.

En kris kan uppstå när:

- människors säkerhet hotas,

- tenantisolering inte kan verifieras,

- användardata riskerar omfattande exponering,

- agenter inte längre kan kontrolleras säkert,

- kritisk data är korrupt,

- eller verksamhetens fortsatta drift hotas.

Krisläge ska vara ett uttryckligt operating mode.

Det ska inte endast vara ett möte eller en etikett.

När crisis mode aktiveras ska systemet tekniskt kunna:

- sänka agentauthority,

- stoppa nya autonoma writes,

- frysa köp,

- blockera datadelning,

- stoppa deployments,

- isolera integrationer,

- och kräva tätare rapportering.

Krisläge ska inte ge agenter större frihet.

Atlas ska kunna:

- sammanställa lägesbild,

- analysera beroenden,

- föreslå prioritering,

- och följa åtgärder.

Atlas ska inte ensam få:

- bevilja sig systemmandat,

- återställa full authority,

- eller deklarera att krisen är avslutad.

Arnold ska fokusera på användarens säkerhet.

Han ska kunna:

- visa verifierad information,

- erbjuda manuella alternativ,

- spara träningsresultat lokalt,

- och förklara vad som är pausat.

Han ska inte generera nya osäkra råd när:

- identitet,

- kontext,

- data,

- eller säkerhetsregler

inte kan verifieras.

GainPilot ska ha granulära nödbromsar.

Det ska gå att stoppa:

- en operation,

- en capability,

- Arnold,

- Atlas,

- en integration,

- en tenant,

- GainPilot,

- eller hela Omniras autonoma writeplan.

Systemet ska använda minsta tillräckliga stopp.

Om problemet endast gäller automatisk kalenderwrite ska:

- träningsloggning,

- programvisning,

- och användarens historik

inte behöva försvinna.

Om tenantisoleringen däremot är osäker ska både reads och writes kunna stoppas till dess att användargränserna verifierats.

Nödbromsen ska inte endast skicka ett kommando.

GainPilot ska verifiera att:

- tjänster,

- workers,

- köer,

- tokens,

- cache,

- och enheter

faktiskt har övergått till stoppat tillstånd.

Partiell stoppeffekt ska behandlas som kritisk information.

Offlineenheter kan skapa särskild risk.

Därför ska deras grants vara:

- snäva,

- tidsbegränsade,

- och revocationmedvetna.

Safe mode ska bevara säkra kärnfunktioner.

En användare ska där möjligt kunna:

- öppna sin redan verifierade plan,

- se statiska instruktioner,

- logga sitt pass lokalt,

- och se att molnsynk är pausad.

Safe mode ska inte:

- skapa nytt program,

- ändra mål,

- dela data,

- genomföra köp,

- eller göra nya autonoma anpassningar.

GainPilot ska definiera sin minsta kontinuitetsnivå.

Den kan innebära att:

- rätt användare kan identifieras,

- aktiv plan kan visas,

- lokal data kan bevaras,

- nödstopp fungerar,

- och inga nya osäkra handlingar sker.

Andra funktioner kan tillfälligt pausas.

Exempel:

- research,

- automatiska insights,

- avancerad media,

- experiment,

- och bakgrundsanalys.

Kontinuitetsplanen ska omfatta människor.

GainPilot får inte vara helt beroende av:

- en person,

- ett konto,

- en enhet,

- eller ett lösenord.

I en tidig grundarledd fas kommer ägaren naturligt vara central.

Det ska ändå finnas:

- dokumenterade konton,

- reservaccess,

- kontaktlistor,

- recoveryinstruktioner,

- leverantörsregister,

- och säker åtkomst till canonical material.

Detta ska inte innebära att vardaglig access breddas.

Reservåtkomsten ska vara:

- starkt skyddad,

- testad,

- och endast användbar under definierade villkor.

Kritiska leverantörer ska ha exitplaner.

GainPilot ska förstå vad som händer om:

- AI-modellen försvinner,

- molnregionen går ned,

- betalningsleverantören spärrar kontot,

- domänen förloras,

- kodhostingen blir otillgänglig,

- eller kommunikationen slutar fungera.

En fallback ska inte endast existera på papper.

Den ska vara testad.

En billig reservmodell ska inte få ta över en högriskcapability om dess domän- eller säkerhetskvalitet är otillräcklig.

Då ska capabilityn hellre:

- pausas,

- eller återgå till manuell och regelbaserad funktion.

Krisledning ska ha tydliga roller.

Det ska finnas ansvar för:

- helheten,

- teknik,

- säkerhet och integritet,

- GainPilot-domänen,

- kontinuitet,

- kommunikation,

- och dokumentation.

Alla betydelsefulla beslut ska loggas.

Beslutsloggen ska visa:

- vad som beslutades,

- av vem,

- vid vilken tid,

- med vilket underlag,

- vilken osäkerhet som fanns,

- och när beslutet ska omprövas.

Lägesbilden ska skilja mellan:

- verifierade fakta,

- sannolika hypoteser,

- obekräftade rapporter,

- okända frågor,

- och beslut.

Krisen ska inte använda brådska som ursäkt för att sudda ut skillnaden mellan fakta och gissning.

Normal roadmap och icke-kritiskt utvecklingsarbete ska kunna pausas.

Krisfixar ska ändå följa en spårbar process.

De ska ha:

- definierat scope,

- minimal diff,

- relevant test,

- snabb kvalificerad review,

- och eftergranskning av alla förkortade steg.

Krisläge ska inte innebära obegränsad ekonomisk fullmakt.

En särskild krisbudget kan aktiveras.

Den ska vara:

- tidsbegränsad,

- beloppsbegränsad,

- leverantörsbegränsad,

- och kopplad till krisidentiteten.

Professionell hjälp ska kunna användas när det behövs.

Det kan omfatta:

- säkerhetsexpert,

- juridisk expertis,

- domänexpert,

- leverantörsstöd,

- eller professionell dataräddning.

Vid möjlig fysisk lagringsskada ska bevarande prioriteras.

GainPilot- och Omniraprocessen ska kunna säga:

Stoppa alla fortsatta diagnostik- och reparationsförsök. Koppla från enheten och överlämna den oförändrad till professionell dataräddning.

Systemet ska inte fortsätta skriva, initiera eller experimentera enbart därför att en agent fortfarande kan generera kommandon.

Krisinformation ska vara samordnad.

Arnold, Atlas, support, status page och direktmeddelanden ska använda samma verifierade lägesbild.

Användaren ska få veta:

- vad som påverkas,

- vad som fortfarande fungerar,

- vad GainPilot har stoppat,

- om data är säker,

- vad användaren behöver göra,

- och när nästa uppdatering kommer.

GainPilot ska inte säga:

Ingen data har påverkats,

innan detta är verifierat.

Systemet ska heller inte överdriva.

Osäkerhet ska uttryckas tydligt:

Vi undersöker fortfarande om träningsresultat från en begränsad period har påverkats. Spara inte om samma pass innan vi har verifierat utfallet.

Krisläge ska inte ge fri tillgång till användardata.

Extra access ska vara:

- uppgiftsbunden,

- tidsbegränsad,

- minimerad,

- och auditerad.

Bevis ska bevaras.

Det kan innebära:

- oförändrad loggexport,

- forensisk kopia,

- checksummor,

- branchbevarande,

- eller isolerad databaskopia.

Krisrespons ska inte panikstäda.

Den ska inte:

- radera loggar,

- skriva över disk,

- ta bort branches,

- eller rensa artefakter

innan betydelsen förståtts.

Recovery ska ske gradvis.

GainPilot ska återställa:

1. Identitet.

2. Tenantisolering.

3. Dataintegritet.

4. Permission och revocation.

5. Read-only och manuella kärnflöden.

6. Lokal och central synk.

7. Agentförslag.

8. Execution med approval.

9. Begränsad autonomi.

10. Normal mode.

Köad backlog ska inte spelas upp blint.

Varje väntande handling ska bedömas för:

- idempotens,

- expiry,

- relevans,

- resursversion,

- och aktuell användarintention.

En gammal approval eller kalenderåtgärd kan ha förlorat sin mening under krisen.

Stabil teknisk drift innebär inte att krisen är avslutad.

GainPilot ska först verifiera:

- att fortsatt skada har stoppats,

- att identitet och tenantisolering fungerar,

- att data är förstådd,

- att capabilities fungerar säkert,

- att authority är korrekt,

- att användare har informerats,

- och att kvarvarande risk har en ägare.

Normal mode ska kräva explicit beslut.

Efter krisen ska GainPilot kunna behålla:

- förhöjd observability,

- tätare review,

- striktare approvals,

- och lägre agentautonomi

under en stabiliseringsperiod.

Varje kris ska eftergranskas.

Review ska inte endast fråga:

Vad gick sönder?

Den ska även fråga:

- Varför blev påverkan systemisk?

- Varför räckte inte den vanliga incidentprocessen?

- Varför aktiverades nödbromsen vid just den tidpunkten?

- Stoppades rätt saker?

- Bevarades säkra kärnfunktioner?

- Var informationen korrekt?

- Var recoveryordningen rätt?

- Och varför kunde samma typ av kris uppstå?

Krisförmågan ska övas.

GainPilot ska genomföra:

- tabletop,

- tekniska stopptester,

- safe mode-övningar,

- leverantörsbortfall,

- identitetskompromiss,

- dataförlust,

- agentkontrollförlust,

- kostnadsloop,

- och gradvis återstart.

Övningen ska fortsätta hela vägen tillbaka.

Det räcker inte att visa att systemet kan stoppas.

GainPilot ska också visa att det kan:

- bevara data,

- kommunicera,

- återställa rätt ordning,

- kontrollera authority,

- och återgå säkert.

Framgång ska inte endast mätas genom återställningstid.

GainPilot ska även mäta:

- time to declare,

- time to brake,

- time to contain,

- continuity level,

- time to safe mode,

- brake effectiveness,

- recovery defects,

- och kommunikationsfördröjning.

Atlas ska kunna följa beredskapen.

Atlas kan uppmärksamma:

- utgångna runbooks,

- saknade reservroller,

- otestade nödbromsar,

- leverantörer utan exitplan,

- och föråldrad reservaccess.

Atlas får rekommendera åtgärder.

Mänsklig ägare ska besluta om:

- beredskap,

- krisnivå,

- riskacceptans,

- och full normalisering.

Alla förändringar av:

- operating modes,

- nödbromsar,

- safe mode,

- krisaccess,

- krisbudget,

- reservkommunikation,

- och recovery

ska ske genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- negativa authorizationtester,

- distribuerade stopptester,

- safe mode-test,

- leverantörsfel,

- återstartstest,

- säkerhets- och integritetsreview,

- shadow mode,

- pull request,

- tabletop,

- teknisk övning,

- canary,

- kontrollerad merge,

- och verifierad recovery.

Kapitel 28 etablerar därmed följande kärnprincip:

GainPilot ska inte vara beroende av att varje skydd alltid fungerar. När kontroll, data, identitet eller säkerhet hotas ska systemet kunna bromsa snabbt, isolera rätt område, bevara sanningen och fortsätta med en säker miniminivå. Krisläge ska minska autonomi, inte öka den. Återstart ska ske från identitet och dataintegritet till manuell funktion och först därefter tillbaka till begränsad automation. GainPilot är inte verkligt motståndskraftigt förrän det både kan stoppa och återvända utan att förlora användarens data, förtroende eller kontroll.
