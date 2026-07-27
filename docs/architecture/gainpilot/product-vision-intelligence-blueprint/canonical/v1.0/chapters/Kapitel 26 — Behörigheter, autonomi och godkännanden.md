# Kapitel 26 — Behörigheter, autonomi och godkännanden

GainPilot ska kunna hjälpa användaren utan att varje liten handling kräver manuell bekräftelse.

Arnold ska på sikt kunna:

- anpassa träningspass,

- flytta aktiviteter,

- föreslå måltidsbyten,

- genomföra lågriskjusteringar,

- hantera återkommande preferenser,

- och utföra godkända arbetsflöden

utan att användaren behöver godkänna varje enskilt steg.

Atlas ska på motsvarande sätt kunna:

- analysera GainPilot,

- samordna agenter,

- skapa beslutsunderlag,

- initiera godkända interna processer,

- följa risker,

- och rekommendera förbättringar.

Detta innebär inte att GainPilot eller Omnira ska ge AI-agenter obegränsad autonomi.

Autonomi ska aldrig vara:

- generell,

- permanent,

- underförstådd,

- agentbestämd,

- eller frikopplad från ansvar.

Autonomi ska vara ett resultat av uttryckligt beviljade och tekniskt genomdrivna behörigheter.

Systemet ska skilja mellan:

- identitet,

- autentisering,

- roll,

- capability,

- authority,

- permission,

- scope,

- delegation,

- approval,

- budget,

- policy,

- och faktisk åtgärd.

Dessa begrepp får inte blandas samman.

Att Arnold är identifierad som användarens GainPilot-coach innebär inte att han får:

- ändra alla program,

- läsa alla minnen,

- skriva i kalendern,

- använda externa integrationer,

- eller genomföra ekonomiska handlingar.

Att Atlas är central intelligens innebär inte att Atlas får:

- läsa alla användares data,

- höja agenters authority,

- godkänna sina egna rekommendationer,

- eller deploya produktionsförändringar.

Att en användare skriver:

Gör vad som behövs

är inte ett tekniskt fullmaktsdokument.

GainPilot ska i stället kunna omvandla användarens intention till ett strukturerat och begränsat mandat.

Exempel:

Användaren säger:

Du får anpassa mina träningspass automatiskt när jag har mindre än 45 minuter.

Detta ska inte tolkas som:

Arnold får ändra hela träningsprogrammet fritt.

Det kan i stället bli ett mandat med:

- actor: Arnold,

- capability: adapt_workout_duration,

- user scope: aktuell användare,

- project scope: GainPilot,

- time scope: tills vidare eller definierad period,

- precondition: tillgänglig tid under 45 minuter,

- allowed actions: korta passet genom godkänd canonical regel,

- prohibited actions: ändra veckovolym över angivet intervall,

- risk class: low,

- reporting requirement: visa vad som ändrades,

- revocation: omedelbart återkallelig,

- och review date: definierat datum.

Autonomi ska byggas genom sådana mandat.

GainPilot ska följa principen om minsta privilegium.

Varje agent, människa, integration och workflow ska endast få:

- den capability,

- den data,

- den authority,

- den tidsperiod,

- den miljö,

- och den omfattning

som krävs för den aktuella uppgiften.

Systemet ska använda default deny.

Om det inte tydligt kan verifieras att en åtgärd är tillåten ska den:

- nekas,

- förberedas som förslag,

- eller skickas till rätt godkännande.

GainPilot ska samtidigt undvika approvaltrötthet.

Om varje:

- övningsbyte,

- passflytt,

- portionsjustering,

- timer,

- påminnelse,

- och låg risk-inställning

kräver samma manuella godkännande kommer användaren till slut:

- godkänna utan att läsa,

- stänga av funktionen,

- eller ge ett för brett mandat för att slippa avbrotten.

Godkännandesystemet ska därför vara riskbaserat, begripligt och adaptivt.

Låg risk och tydligt reversibla handlingar kan gradvis få större autonomi.

Hög risk, irreversibla handlingar och känslig datadelning ska behålla stark kontroll.

Autonomi ska förtjänas per capability.

Arnold kan exempelvis vara betrodd att:

- flytta ett träningspass inom samma vecka,

- föreslå likvärdig övning,

- eller välja en tidigare godkänd reservmåltid.

Det betyder inte att Arnold automatiskt får:

- ändra träningsmålet,

- höja energimålet,

- tolka en skada,

- dela hälsodata,

- köpa utrustning,

- eller teckna abonnemang.

På samma sätt kan en utvecklingsagent få:

- skriva på separat branch,

- skapa commit,

- och öppna pull request.

Det ger inte automatiskt rätt att:

- mergea,

- deploya,

- ändra branch protection,

- eller läsa produktionssecrets.

Grundprincipen är:

GainPilot ska ge rätt aktör rätt förmåga, inom rätt scope, under rätt tid och med rätt kontroll. Autonomi ska vara granulär, förtjänad, observerbar och återkallelig. Godkännanden ska skydda verkliga beslut och risker — inte skapa meningslös friktion eller användas som en genväg till obegränsad fullmakt.

26.1 BEHÖRIGHET SOM ARKITEKTUR

Behörighet ska vara en grundläggande arkitekturkomponent.

Den ska genomdrivas i:

- användargränssnitt,

- API,

- databas,

- verktyg,

- agentruntime,

- workflows,

- integrationer,

- köer,

- minne,

- repository,

- och deploymentmiljö.

Det räcker inte att dölja en knapp i UI.

26.2 IDENTITET

Varje aktör ska ha en stabil identitet.

Aktören kan vara:

- användare,

- Arnold,

- Atlas,

- specialistagent,

- coach,

- supportmedarbetare,

- organisation,

- integration,

- utvecklingsagent,

- eller systemworkflow.

26.3 AUTENTISERING

Autentisering ska verifiera att aktören är den som den utger sig för att vara.

Autentisering ger inte i sig rätt att utföra en handling.

26.4 AUKTORISERING

Auktorisering ska avgöra om den verifierade aktören får utföra den aktuella handlingen.

Beslutet ska ta hänsyn till:

- capability,

- scope,

- authority,

- policy,

- dataklass,

- miljö,

- risk,

- och aktuellt mandat.

26.5 ROLL

En roll ska representera ett organisatoriskt eller funktionellt ansvar.

Exempel:

- user,

- coach,

- support,

- domain_owner,

- security_reviewer,

- Arnold,

- Atlas,

- eller implementation_agent.

Roll ska inte ensam skapa alla rättigheter.

26.6 CAPABILITY

En capability är en uttryckligt definierad förmåga.

Exempel:

- read_active_program,

- adapt_workout_duration,

- propose_exercise_substitution,

- activate_training_block,

- write_calendar_event,

- share_progress_with_coach,

- create_pull_request,

- approve_merge,

- eller deploy_to_production.

26.7 PERMISSION

Permission anger om en aktör får använda en viss capability inom ett visst scope.

Permission ska kunna vara:

- allow,

- deny,

- conditional,

- approval_required,

- temporary,

- suspended,

- eller expired.

26.8 AUTHORITY

Authority anger hur självständigt aktören får använda en capability.

Två aktörer kan ha samma capability men olika authority.

Exempel:

Arnold kan få:

- läsa aktivt program automatiskt,

- föreslå nytt program,

- men kräva approval för aktivering.

26.9 SCOPE

Scope ska begränsa var en permission gäller.

Scope kan omfatta:

- tenant,

- användare,

- projekt,

- capability,

- datatyp,

- objekt,

- miljö,

- enhet,

- tid,

- budget,

- riskklass,

- och arbetsflöde.

26.10 DEN CANONICAL BEHÖRIGHETSMODELLEN

GainPilot ska ha en canonical modell för permissions och authority.

Modellen ska minst kunna representera:

- grant_identity,

- subject_identity,

- subject_type,

- issuer_identity,

- tenant_identity,

- user_identity,

- project_identity,

- capability_identity,

- resource_scope,

- data_scope,

- environment_scope,

- device_scope,

- authority_level,

- risk_limit,

- budget_limit,

- temporal_scope,

- preconditions,

- allowed_actions,

- prohibited_actions,

- approval_policy,

- reporting_policy,

- delegation_policy,

- retention_policy,

- revocation_policy,

- status,

- version,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

26.11 SUBJECT

Subject är den aktör som får eller nekas behörighet.

Subject kan vara:

- människa,

- agent,

- tjänst,

- workflow,

- integration,

- eller grupp.

26.12 ISSUER

Issuer är den aktör eller policy som beviljar behörigheten.

Issuer måste själv ha rätt att bevilja det aktuella mandatet.

26.13 INGEN SJÄLVTILLDELNING

En agent får inte själv:

- ge sig permission,

- höja authority,

- bredda scope,

- förlänga giltighet,

- eller ta bort approvalkrav.

26.14 GRANT

Ett grant är en explicit beviljad rättighet.

Grant ska vara:

- spårbart,

- versionshanterat,

- och återkalleligt.

26.15 DENY

Ett explicit deny ska normalt ha företräde framför allow.

Exempel:

Arnold har generell rätt att läsa träningsminnen.

Användaren har markerat en viss post som do-not-share.

Deny ska då vinna.

26.16 POLICYKOMBINATION

Effektiv behörighet ska beräknas från den mest restriktiva kombinationen av:

- systempolicy,

- tenantpolicy,

- projektpolicy,

- användarval,

- agentmanifest,

- capabilitygrant,

- dataklass,

- och incidentstatus.

26.17 DEFAULT DENY

Om systemet inte kan hitta ett giltigt allow ska handlingen nekas.

Frånvaro av förbud är inte tillstånd.

26.18 MINSTA PRIVILEGIUM

Varje aktör ska få minsta rättighet som krävs.

Ett workflow som endast behöver:

- läsa dagens pass

ska inte få:

- skriva hela programmet,

- läsa kostlogg,

- eller använda kalendern.

26.19 SEPARATION OF DUTIES

Betydelsefulla processer ska kunna kräva flera roller.

Exempel:

- en aktör föreslår,

- en annan granskar,

- en tredje godkänner,

- och en fjärde genomför.

26.20 FÖRESLÅ

Capabilityn att föreslå ska vara separat från att besluta eller genomföra.

Arnold kan föreslå:

- ändrad träningsfrekvens.

Det betyder inte att han får aktivera förändringen.

26.21 FÖRBEREDA

En aktör kan få förbereda en åtgärd.

Exempel:

- skapa nytt programutkast,

- bygga inköpslista,

- eller skapa deploymentplan.

Förberedelsen ska kunna granskas före effekt.

26.22 GODKÄNNA

Approval ska vara en separat handling med egen identitet.

Godkännandet ska ange exakt:

- vad som godkänns,

- av vem,

- under vilka villkor,

- och hur länge.

26.23 GENOMFÖRA

Execution capability ska vara separat från approval.

En godkännare behöver inte själv vara den aktör som genomför.

26.24 VERIFIERA

Verifiering ska vara separat från genomförandet.

Exempel:

En agent deployar till staging.

En annan kontroll verifierar:

- rätt artefakt,

- rätt miljö,

- och fungerande flöde.

26.25 ÅTERKALLA

Revocation ska vara en egen capability.

Den ska kunna stoppa framtida användning av ett grant.

26.26 DELEGERA

Delegation innebär att en aktör tillfälligt överför en begränsad del av sitt mandat.

Delegation får aldrig skapa större rättighet än delegatorn själv har.

26.27 DEN CANONICAL AUTHORITYMODELLEN

GainPilot ska följa Omniras authoritynivåer L0–L6.

Nivåerna ska tolkas per capability, inte som en global agentrankning.

26.28 L0 — OBSERVERA

L0 innebär att aktören kan:

- observera,

- läsa tillåten status,

- och skapa icke-bindande signaler.

Aktören får inte förändra tillstånd.

26.29 L1 — INFORMERA

L1 innebär att aktören kan:

- sammanfatta,

- förklara,

- och uppmärksamma.

Aktören får inte skapa förändringsförslag som presenteras som beslut.

26.30 L2 — REKOMMENDERA

L2 innebär att aktören kan:

- analysera,

- jämföra alternativ,

- och rekommendera.

Ingen verklig förändring ska ske utan nästa beslutspunkt.

26.31 L3 — FÖRBEREDA

L3 innebär att aktören kan:

- skapa utkast,

- planer,

- förberedda ändringar,

- eller approval requests.

Resultatet får inte automatiskt aktiveras.

26.32 L4 — GENOMFÖRA INOM BEGRÄNSAT MANDAT

L4 innebär att aktören får genomföra tydligt definierade och begränsade handlingar.

Handlingarna ska vara:

- lågriskmässiga eller särskilt godkända,

- observerbara,

- reversibla där möjligt,

- och bundna till policy.

26.33 L5 — ORKESTRERA INOM DOMÄN

L5 innebär att aktören kan:

- samordna flera capabilities,

- delegera inom mandat,

- och genomföra domänarbetsflöden.

L5 ska inte innebära obegränsad systemåtkomst.

26.34 L6 — GOVERNANCE- OCH SYSTEMMANDAT

L6 omfattar särskilda ägar- eller governancebefogenheter.

Exempel:

- bevilja authority,

- ändra policy,

- godkänna högriskdeployment,

- eller ändra systemgränser.

L6 ska vara mycket begränsat.

26.35 AUTHORITY PER CAPABILITY

En agent ska kunna ha olika authority för olika capabilities.

Exempel för Arnold:

- read_active_program: L4.

- explain_program: L4.

- propose_substitution: L4.

- execute_low_risk_substitution: L4.

- activate_new_program: L3.

- change_medical_constraint: ingen permission.

- share_data_with_external_party: L2 eller approval required.

26.36 INGEN GLOBAL L4

Formuleringen:

Arnold har L4

är otillräcklig.

Systemet ska ange:

- L4 för vilken capability,

- vilket scope,

- vilken risk,

- och vilken tidsperiod.

26.37 AUTHORITY CEILING

Varje agent ska ha ett maximalt authoritytak.

Ett enskilt grant får inte överskrida taket utan särskild governanceprocess.

26.38 TENANTSPECIFIK AUTHORITY

Authority ska kunna skilja mellan tenants.

Intern grundartenant kan tillåta:

- experimentell automation.

Kundtenant kan kräva:

- striktare approval och lägre autonomi.

26.39 ANVÄNDARSPECIFIK AUTHORITY

Två användare kan välja olika kontrollnivåer.

En användare kan vilja:

- godkänna varje programändring.

En annan kan ge Arnold mandat att:

- anpassa pass inom definierade gränser.

26.40 MILJÖSPECIFIK AUTHORITY

En agent kan ha:

- större write-rätt i development,

- begränsad rätt i staging,

- och ingen direkt write-rätt i production.

26.41 ENHETSSPECIFIK AUTHORITY

Capability kan begränsas per enhet.

Exempel:

- mobilen får godkänna passflytt,

- wearable får endast starta timer,

- och datorn krävs för större kontoinställningar.

26.42 TIDSSPECIFIK AUTHORITY

Grant ska kunna gälla:

- en gång,

- under en session,

- till ett datum,

- under ett träningsblock,

- eller tills användaren återkallar det.

26.43 JUST-IN-TIME-GRANT

Känsliga capabilities ska där möjligt beviljas just-in-time.

Grantet ska:

- skapas för en specifik uppgift,

- användas,

- och löpa ut.

26.44 STANDING GRANT

Återkommande lågriskhandlingar kan använda ett stående grant.

Exempel:

Arnold får automatiskt ersätta en övning med ett tidigare godkänt alternativ när utrustningen saknas.

Stående grants ska granskas regelbundet.

26.45 TEMPORÄR UPPHÖJNING

En aktör kan få tillfälligt högre authority.

Exempel:

En supporttekniker får tillfällig read access till ett specificerat ärende.

Upphöjningen ska:

- kräva stark grund,

- vara tidsbegränsad,

- och auditeras.

26.46 BREAK-GLASS

Break-glass ska vara reserverat för allvarlig incident.

Det ska kräva:

- definierad nödsituation,

- stark autentisering,

- minsta nödvändiga access,

- omedelbar audit,

- automatisk expiry,

- och eftergranskning.

26.47 INGEN BEKVÄMLIGHETS-BREAK-GLASS

Break-glass får inte användas därför att:

- vanlig approval tar tid,

- ett verktyg är krångligt,

- eller agenten vill ha bredare kontext.

26.48 CAPABILITYREGISTER

GainPilot ska ha ett capabilityregister.

Varje capability ska minst ha:

- capability_identity,

- beskrivning,

- owner,

- risk_class,

- input schema,

- output schema,

- side effects,

- required_permissions,

- allowed_authority_levels,

- approval_policy,

- audit_policy,

- rollback_model,

- och status.

26.49 CAPABILITYÄGARE

Varje capability ska ha en ägare.

Ägaren ansvarar för:

- riskklass,

- kontrakt,

- policy,

- tester,

- och förändringar.

26.50 SIDE EFFECT

Capabilityregistret ska ange om handlingen:

- endast läser,

- skapar,

- ändrar,

- raderar,

- kommunicerar,

- spenderar,

- eller påverkar annan domän.

26.51 REVERSIBILITET

Capabilityn ska klassificeras efter reversibilitet.

Exempel:

Hög reversibilitet:

- flytta ett pass inom veckan,

- ändra appvy,

- eller skapa ett utkast.

Låg reversibilitet:

- publicera externt,

- radera data,

- göra köp,

- eller lämna känslig information.

26.52 BLAST RADIUS

Systemet ska bedöma hur stor påverkan en felaktig åtgärd kan få.

Exempel:

- en användare,

- ett träningspass,

- ett projekt,

- en tenant,

- alla användare,

- eller produktion.

26.53 RISKMODELL

Risk ska bedömas utifrån flera dimensioner.

Exempel:

- användarsäkerhet,

- integritet,

- ekonomi,

- irreversibilitet,

- extern påverkan,

- blast radius,

- juridik,

- och confidence.

26.54 RISKKLASSER

GainPilot kan använda:

- minimal,

- low,

- medium,

- high,

- och critical.

Riskklassen ska påverka approval.

26.55 MINIMAL RISK

Minimal risk kan omfatta:

- öppna en vy,

- starta timer,

- eller läsa offentligt hjälpinnehåll.

Sådana handlingar ska normalt inte kräva approval.

26.56 LOW RISK

Låg risk kan omfatta:

- tidigare godkänt övningsbyte,

- flytta pass inom samma vecka,

- eller välja en reservmåltid.

Handlingarna kan automatiseras inom mandat.

26.57 MEDIUM RISK

Medelrisk kan omfatta:

- större programjustering,

- kalenderwrite,

- ny extern integration,

- eller coachdelning.

Approval eller starkare policy kan krävas.

26.58 HIGH RISK

Hög risk kan omfatta:

- ändrat energi- eller viktmål,

- känslig datadelning,

- kostnad,

- höjd agentautonomi,

- eller större träningsbelastningsförändring.

26.59 CRITICAL RISK

Kritisk risk kan omfatta:

- autentisering,

- tenantisolering,

- permanent radering,

- säkerhetsgränser,

- produktionsdeployment,

- eller systemomfattande policyförändring.

26.60 DYNAMISK RISK

Risk kan förändras beroende på kontext.

Exempel:

Ett vanligt övningsbyte kan vara låg risk.

Samma byte kan bli högre risk när användaren har:

- aktiv smärta,

- ny skada,

- eller professionell restriktion.

26.61 RISKSIGNALER

Capabilityn ska kunna läsa relevanta risksignaler innan execution.

Den får inte hämta mer känslig data än vad riskbedömningen kräver.

26.62 CONFIDENCE OCH RISK

Låg confidence kan höja den effektiva riskklassen.

Hög confidence får inte automatiskt sänka en intrinsiskt hög risk.

26.63 APPROVAL

Approval är ett uttryckligt godkännande av en definierad åtgärd eller mandatförändring.

Approval ska inte vara ett generellt:

Ja till allt.

26.64 DEN CANONICAL APPROVALMODELLEN

Approvalmodellen ska minst kunna representera:

- approval_identity,

- requested_by,

- approving_actor,

- affected_user,

- tenant,

- project,

- capability,

- action_summary,

- exact_effect,

- data_used,

- data_shared,

- risk_class,

- reversibility,

- estimated_cost,

- alternatives,

- expiry,

- execution_window,

- conditions,

- status,

- decision_reason,

- execution_reference,

- and audit_reference.

26.65 APPROVAL REQUEST

En approval request ska beskriva:

- vad som ska ske,

- varför,

- vilken effekt handlingen får,

- vilken data som används,

- risk,

- kostnad,

- alternativ,

- och om handlingen kan återställas.

26.66 BEGRIPLIGT SPRÅK

Approval ska presenteras på begripligt språk.

Användaren ska inte behöva förstå interna capability-ID:n för att fatta beslut.

26.67 TEKNISK DETALJVY

En avancerad vy ska kunna visa:

- capability,

- agent,

- scope,

- policy,

- datafält,

- authority,

- och auditreferens.

26.68 EXAKT HANDLING

Approval ska gälla en exakt handling.

Exempel:

Godkänn att Arnold flyttar torsdagens benpass till lördag.

Det ska inte tyst inkludera:

- förändrad veckovolym,

- nya notiser,

- eller kalenderskrivning utanför GainPilot.

26.69 EXAKT EFFEKT

Användaren ska kunna förstå vad som förändras.

Exempel:

- programinstansen ändras,

- kalenderhändelsen uppdateras,

- och en notis schemaläggs.

Varje effekt ska redovisas.

26.70 ALTERNATIV

Approval request ska där relevant visa säkra alternativ.

Exempel:

- flytta passet,

- använda kortversion,

- använda reservpass,

- eller hoppa över med planerad återstart.

26.71 KOSTNAD

Om handlingen innebär relevant kostnad ska den visas i kronor.

Exempel:

Detta startar en extern analystjänst som beräknas kosta högst 25 kr.

Intern teknisk kostnad behöver inte alltid visas för användaren.

26.72 INGEN DOLD KOSTNAD

En agent ska inte initiera:

- köp,

- abonnemang,

- betald API-användning,

- eller annonsering

utan rätt budgetmandat.

26.73 APPROVALSTATUS

Approval ska kunna ha status:

- requested,

- viewed,

- approved,

- conditionally_approved,

- rejected,

- expired,

- revoked,

- cancelled,

- executed,

- failed,

- eller unknown_outcome.

26.74 EXPIRY

Approval ska löpa ut.

Ett gammalt godkännande ska inte kunna användas för en förändrad situation.

26.75 EXECUTION WINDOW

Godkännandet ska kunna ange när handlingen får utföras.

Exempel:

- omedelbart,

- inom en timme,

- före nästa pass,

- eller under ett definierat releasefönster.

26.76 VILLKORAT GODKÄNNANDE

Användaren ska kunna godkänna med villkor.

Exempel:

Flytta passet, men ändra inte övningarna eller den totala volymen.

26.77 DELVIS GODKÄNNANDE

När en begäran innehåller flera separerbara handlingar ska användaren kunna godkänna vissa delar.

26.78 AVSLAG

Ett avslag ska inte tolkas som:

- permanent ogillande,

- eller att användaren aldrig vill se ett liknande förslag.

Systemet ska skilja mellan:

- nej nu,

- nej till denna variant,

- och visa inte detta igen.

26.79 AVSLAGSORSAK

Användaren kan frivilligt ange varför förslaget avvisades.

Orsaken kan förbättra framtida förslag.

Den ska inte krävas.

26.80 APPROVAL FÅR INTE ANVÄNDAS SOM SAMTYCKESGENVÄG

Ett operativt approval är inte automatiskt:

- juridiskt samtycke,

- integritetspolicyacceptans,

- eller godkännande av modellträning.

Sådana beslut ska ha egna processer.

26.81 BUNDLING

Flera handlingar får endast samlas i ett approval när de:

- hör samman,

- är begripliga,

- och inte döljer en mer känslig handling.

26.82 INGEN MÖRK BUNDLING

GainPilot får inte paketera:

- nödvändig programändring,

- datadelning,

- marknadsföring,

- och abonnemang

i ett enda godkännande.

26.83 BULK APPROVAL

Bulk approval kan användas för en definierad lista av likartade lågriskhandlingar.

Listan ska vara synlig.

26.84 STÅENDE GODKÄNNANDE

Användaren ska kunna skapa ett stående mandat.

Exempel:

Arnold får under de kommande åtta veckorna automatiskt flytta träningspass inom samma vecka när kalendern visar tidskonflikt.

Mandatet ska vara:

- specifikt,

- granskningsbart,

- och återkalleligt.

26.85 GODKÄNN EN GÅNG

För känsligare åtgärder ska användaren kunna välja:

- endast denna gång.

26.86 GODKÄNN UNDER SESSION

Ett mandat kan gälla under:

- pågående träningspass,

- aktuell planeringssession,

- eller ett specifikt workflow.

26.87 GODKÄNN FÖR PERIOD

Ett mandat kan gälla till ett angivet datum.

Systemet ska påminna när mandatet löper ut om funktionen påverkas.

26.88 GODKÄNN ALLT AV DENNA TYP

Detta alternativ ska endast erbjudas när:

- capabilityn är tydligt definierad,

- riskerna är begripliga,

- och användaren kan ändra beslutet senare.

26.89 APPROVALTRÖTTHET

GainPilot ska mäta och motverka approvaltrötthet.

Tecken kan vara:

- mycket snabba godkännanden,

- hög avslagsfrekvens,

- avstängd funktion,

- eller breda mandat direkt efter många små frågor.

26.90 RISKGRUPPERING

Liknande lågriskhandlingar kan grupperas under ett begränsat mandat för att minska friktion.

26.91 APPROVALADAPTATION

Systemet kan föreslå ändrad approvalnivå när:

- handlingen återkommande godkänts,

- kvaliteten varit hög,

- inga incidenter uppstått,

- och användaren behållit kontroll.

26.92 INGEN TYST APPROVALNEDTRAPPNING

GainPilot får inte automatiskt ta bort approvalkrav bara för att användaren ofta godkänner.

26.93 REKOMMENDATION OM HÖGRE AUTONOMI

Arnold eller Atlas kan rekommendera:

Du har godkänt samma typ av lågriskbyte 18 gånger utan korrigering. Vill du att Arnold ska få göra dessa byten automatiskt?

Användaren ska själv besluta.

26.94 REKOMMENDATION OM LÄGRE AUTONOMI

Systemet ska också kunna rekommendera lägre autonomi när:

- korrigeringar ökar,

- kontext är osäker,

- eller incident inträffat.

26.95 APPROVALKANAL

Godkännanden ska kunna ske genom:

- app,

- webb,

- mobilnotis,

- röst,

- eller annan godkänd kanal.

Kanalen ska matcha risknivån.

26.96 RÖSTGODKÄNNANDE

Röstapproval ska endast användas när:

- rätt person är verifierad,

- handlingen är begriplig,

- och risknivån tillåter det.

26.97 HÖGRISK OCH RÖST

Kritiska handlingar ska normalt kräva starkare bekräftelse än ett enkelt:

Ja.

26.98 STEP-UP AUTHENTICATION

Känsliga approvals ska kunna kräva:

- lösenord,

- biometrisk verifiering,

- säkerhetsnyckel,

- eller annan stark autentisering.

26.99 RE-AUTHENTICATION

En redan inloggad session kan behöva återautentiseras före:

- dataradering,

- betalning,

- känslig delning,

- eller authorityförändring.

26.100 NOTIFICATION APPROVAL

En notis ska inte visa känslig information på låsskärmen om användaren inte godkänt det.

26.101 APPROVAL PÅ FEL ENHET

Systemet ska kunna begränsa att vissa beslut endast fattas på:

- betrodd enhet,

- eller starkt autentiserad webb-/datorvy.

26.102 DELEGERAT GODKÄNNANDE

En användare eller organisation kan delegera approval till:

- coach,

- administratör,

- ekonomiansvarig,

- säkerhetsansvarig,

- eller annan definierad roll.

Delegationen ska vara explicit.

26.103 COACHAPPROVAL

En coach kan få rätt att godkänna:

- programjusteringar,

- övningsalternativ,

- och planeringsändringar

inom coachrelationen.

Coachen ska inte få godkänna:

- användarens privata datadelning,

- köp,

- eller andra Omnira-projekt.

26.104 ORGANISATIONSAPPROVAL

Organisationer ska kunna använda approvalkedjor.

Exempel:

- produktägare,

- domänexpert,

- säkerhetsansvarig,

- och release owner.

26.105 N-AV-M

Kritiska beslut ska kunna kräva flera godkännare.

Exempel:

Två av tre behöriga roller måste godkänna en kritisk policyändring.

26.106 FYRAÖGONSPRINCIP

Kritiska åtgärder ska kunna kräva minst två oberoende personer eller kontrollroller.

26.107 APPROVALORDNING

Vissa approvals ska ske i ordning.

Exempel:

1. Domänreview.

2. Säkerhetsreview.

3. Ägarbeslut.

4. Deploymentapproval.

26.108 PARALLELLA APPROVALS

Oberoende approvals kan ske parallellt när det inte skapar ansvarskonflikt.

26.109 APPROVALKONFLIKT

Om en godkännare godkänner och en annan avslår ska policyn ange:

- vilken roll som har veto,

- om ärendet ska omarbetas,

- eller om högre beslutsägare krävs.

26.110 VETO

Säkerhets- och integritetsroller ska kunna ha veto inom definierat område.

26.111 VETO FÅR INTE VARA GLOBALT UTAN GRÄNS

Ett veto ska vara kopplat till:

- riskdomän,

- policy,

- och behörig roll.

26.112 APPROVALSLA

Operativa approvals kan ha önskad svarstid.

SLA får inte skapa automatiskt godkännande vid tystnad.

26.113 INGET GODKÄNNANDE GENOM TYSTNAD

Avsaknad av svar ska normalt betyda:

- ej godkänt,

- väntande,

- eller utgånget.

Det ska inte betyda ja.

26.114 ESCALATION

En obesvarad approval kan eskaleras till:

- användaren igen,

- alternativ behörig aktör,

- eller säker standard.

Eskalering ska inte bredda mandatet.

26.115 APPROVALKÖ

Användaren ska ha en tydlig kö över väntande beslut.

Kön ska prioritera:

- brådska,

- risk,

- deadline,

- och beroenden.

26.116 APPROVALINBOX

Varje post ska visa:

- vad som kräver beslut,

- rekommendation,

- risk,

- effekt,

- och när beslutet behövs.

26.117 TRIVIALA BESLUT

Trivial information ska inte fylla approvalinkorgen.

26.118 BESLUT OCH INFORMATION

Systemet ska skilja mellan:

- information,

- rekommendation,

- varning,

- approval request,

- och akut säkerhetsstopp.

26.119 AKUT SÄKERHETSSTOPP

GainPilot ska kunna stoppa en handling utan approval när:

- fortsatt execution sannolikt skapar allvarlig skada,

- och stoppet är säkert.

Stoppet ska rapporteras omedelbart.

26.120 AUTOÅTGÄRD VID KRITISK RISK

Systemet kan automatiskt:

- pausa publicering,

- stoppa workflow,

- blockera datadelning,

- eller isolera capability

vid tydligt definierad kritisk risk.

Autoåtgärden ska vara:

- minimerad,

- reversibel där möjligt,

- och auditerad.

26.121 AUTOÅTGÄRD ÄR INTE FRI AUTONOMI

Ett nödstopp ger inte systemet rätt att:

- utföra bred reparation,

- radera data,

- eller fatta nya strategiska beslut.

26.122 RAPPORTERING EFTER AUTOÅTGÄRD

Systemet ska omedelbart rapportera:

- vad som stoppades,

- varför,

- vilken risk som identifierades,

- och vad som krävs för återstart.

26.123 NÖDSTOPP

Användaren ska kunna aktivera nödstopp.

Nödstopp kan omfatta:

- stoppa publicering,

- pausa agentworkflows,

- blockera nya externa writes,

- och frysa authorityhöjningar.

26.124 GLOBALT NÖDSTOPP

Omnira ska kunna ha ett globalt nödstopp.

Det ska användas vid:

- identitetsrisk,

- omfattande dataläcka,

- okontrollerad agent,

- eller annan systemisk incident.

26.125 PROJEKTNÖDSTOPP

GainPilot ska kunna stoppas separat utan att andra Omnira-projekt påverkas mer än nödvändigt.

26.126 CAPABILITYNÖDSTOPP

En enskild capability ska kunna stoppas.

Exempel:

- automatiska övningsbyten pausas,

- men passvisning och loggning fortsätter.

26.127 AGENTNÖDSTOPP

Arnold, Atlas eller specialistagent ska kunna stoppas separat.

26.128 WRITE FREEZE

Systemet ska kunna frysa writes men tillåta read-only-funktioner.

26.129 SAFE MODE

GainPilot ska ha ett säkert läge.

Safe mode kan tillåta:

- läsa aktiv plan,

- visa redan godkända instruktioner,

- logga lokalt,

- och exportera egna data.

Det kan blockera:

- nya automatiska ändringar,

- tvärdomändelning,

- och externa writes.

26.130 ÅTERSTART

Återstart efter nödstopp ska vara kontrollerad.

Den ska minst omfatta:

- orsak verifierad,

- incident bedömd,

- capability testad,

- authority omprövad,

- och ansvarig approval.

26.131 GRADVIS ÅTERSTART

Återstart ska kunna ske per:

- projekt,

- agent,

- capability,

- tenant,

- eller användargrupp.

26.132 INGEN AUTOMATISK FULL ÅTERSTART

Systemet ska inte automatiskt återställa all autonomi efter att en teknisk tjänst åter svarar.

26.133 REVOCATION

Ett grant ska kunna återkallas omedelbart.

Revocation ska stoppa:

- nya handlingar,

- ny delegation,

- och nya access tokens.

26.134 PÅGÅENDE HANDLING

Vid återkallande ska systemet avgöra hur pågående handling hanteras.

Alternativ kan vara:

- stoppa,

- slutföra säkert,

- kompensera,

- eller sätta status unknown_outcome.

26.135 TOKENREVOCATION

Tekniska tokens och sessioner ska återkallas när relevant permission återkallas.

26.136 CACHE OCH REVOCATION

Cacheade permissions ska invalideras snabbt.

Ett återkallat grant får inte fortsätta gälla på grund av gammal cache.

26.137 OFFLINE OCH REVOCATION

Offlineenheter kan inte alltid nås omedelbart.

Offlinegrants ska därför vara:

- tidsbegränsade,

- snäva,

- och riskanpassade.

26.138 REVOCATION LIST

Enheter och services ska kunna kontrollera en revocation list eller motsvarande mekanism.

26.139 DELEGATION

Delegation ska vara en strukturerad permissionstransaktion.

Den ska ange:

- delegator,

- delegate,

- capability,

- scope,

- authority,

- expiry,

- och om vidaredelegation är tillåten.

26.140 DELEGATIONSTAK

Delegaten får aldrig högre authority än den lägsta av:

- delegatorns authority,

- uppgiftens authority,

- och policytaket.

26.141 VIDAREDELEGERING

Vidaredelegation ska normalt vara förbjuden om den inte uttryckligen tillåts.

26.142 DELEGERINGSDJUP

Systemet ska begränsa hur många led en delegation får passera.

26.143 DELEGERINGSKEDJA

Hela delegationskedjan ska vara spårbar.

26.144 INGEN TEXTBASERAD BEHÖRIGHET

En agent kan inte skapa permission genom att skriva:

Jag delegerar nu full access till underagenten.

Behörighet ska skapas genom authoritysystemet.

26.145 AGENTCAPABILITIES

Agenter ska anropa capabilities genom strukturerade verktygsgränser.

De ska inte få direkt åtkomst till underliggande databaser eller secrets när en capability räcker.

26.146 TOOL BINDING

Ett verktyg ska vara bundet till:

- agent,

- capability,

- scope,

- miljö,

- och uppgift.

26.147 TOOL INVOCATION POLICY

Före verktygsanrop ska systemet kontrollera:

- giltigt grant,

- inputschema,

- risksignal,

- approvalstatus,

- och budget.

26.148 OUTPUTPOLICY

Efter verktygsanrop ska resultatet valideras innan nästa effekt.

26.149 VERKTYG SKAPAR INTE MANDAT

Att ett verktyg är tekniskt tillgängligt betyder inte att agenten får använda det i aktuell uppgift.

26.150 DIREKT DATABASÅTKOMST

Direkt databasåtkomst ska begränsas.

Agenter ska normalt använda:

- domäntjänst,

- policykontrollerad query,

- eller särskilt administrativt workflow.

26.151 PRODUKTIONSWRITE

Produktionswrite ska ha högre kontroll än read.

Write ska kunna kräva:

- approval,

- environment grant,

- och audit.

26.152 RADERING

Radering ska ha egen capability.

Rätt att uppdatera innebär inte rätt att radera.

26.153 EXPORT

Dataexport ska ha egen capability.

Rätt att läsa i appen innebär inte rätt att exportera till extern mottagare.

26.154 DELNING

Delning ska vara separat från export.

En export till användaren själv är inte samma sak som delning med:

- coach,

- organisation,

- eller extern tjänst.

26.155 KOMMUNIKATION

Rätt att skapa text innebär inte rätt att:

- skicka notis,

- publicera externt,

- eller kontakta tredje part.

26.156 KALENDER

Calendar read och calendar write ska vara separata capabilities.

26.157 SOCIALA MEDIER

Läsa projektets sociala status ska vara separat från:

- publicera,

- svara,

- radera,

- eller ändra kampanj.

26.158 EKONOMI

Ekonomiska capabilities ska delas upp i:

- läsa kostnad,

- föreslå budget,

- reservera budget,

- genomföra köp,

- och ändra abonnemang.

26.159 BUDGET

Budget ska vara en separat kontrollaxel.

En aktör kan ha permission men sakna tillgänglig budget.

26.160 DEN CANONICAL BUDGETMODELLEN

Budgetmodellen ska minst kunna representera:

- budget_identity,

- owner,

- tenant,

- project,

- capability,

- currency,

- period,

- maximum_amount,

- remaining_amount,

- per_action_limit,

- vendor_scope,

- approval_threshold,

- status,

- and audit_reference.

26.161 BUDGET PER PROJEKT

GainPilot ska kunna ha egen projektbudget.

26.162 GLOBAL BUDGET

Omnira ska kunna ha global budget som sätter tak över projektbudgetar.

26.163 BUDGET PER CAPABILITY

Exempel:

- AI-research,

- media generation,

- annonsering,

- externa integrationer,

- och produktionsinfrastruktur

ska kunna ha separata budgetar.

26.164 PER-ACTION LIMIT

En agent kan få spendera upp till ett visst belopp per handling.

Exempel:

Arnold får inte genomföra köp.

Atlas kan få initiera analysarbete upp till 10 kr per körning inom intern budget.

26.165 PERIODLIMIT

Budget ska kunna gälla:

- dag,

- vecka,

- månad,

- projektfas,

- eller engångsuppgift.

26.166 BUDGETALERT

Systemet ska kunna varna vid:

- 50 procent,

- 75 procent,

- 90 procent,

- och 100 procent

eller annan definierad nivå.

26.167 BUDGETSTOPP

När budgettak nås ska nya kostnadsskapande handlingar stoppas eller kräva nytt approval.

26.168 INGEN BUDGETSPLIT

Agenten får inte dela upp en kostnad i flera mindre handlingar för att kringgå per-action limit.

26.169 PROGNOS

Före större kostnad ska systemet visa:

- uppskattning,

- intervall,

- och osäkerhet.

26.170 KOSTNADSÖVERSKRIDANDE

Om faktisk kostnad riskerar överstiga godkänt belopp ska handlingen:

- stoppas,

- reduceras,

- eller återgå till approval.

26.171 VENDOR SCOPE

Budget kan begränsas till:

- viss leverantör,

- modell,

- eller tjänst.

Ett godkännande för en leverantör ska inte automatiskt gälla en annan.

26.172 PREPAID OCH SUBSCRIPTION

Engångsköp, förbrukningskostnad och återkommande abonnemang ska vara separata beslut.

26.173 ÅTERKOMMANDE KOSTNAD

Ett abonnemang ska visa:

- pris,

- faktureringsperiod,

- bindning,

- uppsägning,

- och förväntad användning.

26.174 INGEN DOLD FÖRLÄNGNING

Agenten ska inte aktivera automatisk förlängning utan uttryckligt mandat.

26.175 AUTONOMI

Autonomi är förmågan att utföra handlingar utan ett nytt mänskligt beslut vid varje tillfälle.

Autonomi ska alltid bygga på:

- giltiga grants,

- tydlig policy,

- riskgränser,

- budget,

- observability,

- och revocation.

26.176 AUTONOMI ÄR INTE BEHÖRIGHET

En aktör kan ha permission att genomföra en handling men ändå kräva approval varje gång.

Autonomi anger om handlingen kan utföras utan nytt approval.

26.177 AUTONOMIPROFIL

Användaren ska kunna välja övergripande kontrollprofil.

Exempel:

- manual,

- guided,

- balanced,

- proactive,

- eller custom.

Profilen ska översättas till granulära grants.

26.178 MANUAL

Manual innebär att de flesta förändringar kräver approval.

Read, förklaring och lokal navigation kan ske automatiskt.

26.179 GUIDED

Guided innebär att Arnold:

- föreslår,

- förbereder,

- och väntar på approval för verkliga ändringar.

26.180 BALANCED

Balanced kan tillåta:

- lågrisk- och tidigare godkända handlingar automatiskt,

- medan större förändringar kräver approval.

26.181 PROACTIVE

Proactive kan ge större autonomi inom tydliga gränser.

Det får inte bli obegränsat globalt mandat.

26.182 CUSTOM

Custom ska låta användaren styra per capability.

26.183 PROFILEN ÄR INTE EN ENDA SWITCH

Valet proactive får inte aktivera:

- datadelning,

- köp,

- radering,

- och hälsorelaterade högriskändringar

utan separata regler.

26.184 EARNED AUTONOMY

Autonomi ska kunna förtjänas genom verifierad kvalitet.

Bedömningen kan omfatta:

- antal genomförda handlingar,

- korrigeringsgrad,

- incidenter,

- användarfeedback,

- confidencekalibrering,

- och policyefterlevnad.

26.185 MINSTA DATAUNDERLAG

Systemet ska kräva tillräckligt antal relevanta handlingar innan det rekommenderar högre autonomi.

26.186 INGEN AUTONOMI FRÅN ENSTAKA FRAMGÅNG

En lyckad handling ska inte automatiskt ge bredare mandat.

26.187 CAPABILITYSPECIFIK HISTORIK

Autonomihistorik ska bedömas per capability.

Bra kvalitet i:

- passflytt

ger inte bevis för kvalitet i:

- koständring,

- datadelning,

- eller köp.

26.188 RISKTAK FÖR AUTONOMI

Vissa capabilities ska alltid kräva approval eller stark governance oavsett historik.

26.189 AUTONOMINIVÅ

Varje capability ska kunna ha autonominivå som:

- disabled,

- propose_only,

- prepare_only,

- execute_with_approval,

- execute_with_notification,

- execute_and_report,

- eller bounded_autonomous.

26.190 DISABLED

Disabled innebär att capabilityn inte får användas.

26.191 PROPOSE ONLY

Agenten får endast skapa rekommendation.

26.192 PREPARE ONLY

Agenten får skapa färdigt utkast men inte aktivera.

26.193 EXECUTE WITH APPROVAL

Handling får genomföras efter specificerat approval.

26.194 EXECUTE WITH NOTIFICATION

Handling får genomföras automatiskt men användaren informeras före eller direkt efter.

26.195 EXECUTE AND REPORT

Handling genomförs inom mandat och rapporteras i relevant sammanfattning.

26.196 BOUNDED AUTONOMOUS

Agenten får genomföra en definierad sekvens inom hårda gränser och stoppvillkor.

26.197 STÄNDIGT OBSERVERBAR

Autonoma handlingar ska vara observerbara.

Användaren ska kunna se:

- vad som hände,

- varför,

- vilket mandat,

- vilken data,

- och hur handlingen kan återställas.

26.198 RAPPORTERINGSNIVÅ

Rapportering ska kunna ske:

- omedelbart,

- i sammanfattning,

- endast vid avvikelse,

- eller vid risk.

Användaren ska kunna välja inom säkra gränser.

26.199 OMEDELBAR RAPPORTERING

Omedelbar rapportering ska krävas när:

- en autoåtgärd stoppade något,

- relevant risk identifierades,

- pengar användes,

- extern delning skedde,

- eller planen ändrades betydligt.

26.200 SAMMANFATTAD RAPPORTERING

Små, återkommande lågriskhandlingar kan samlas.

Exempel:

Arnold gjorde två tidigare godkända övningsbyten denna vecka eftersom utrustningen saknades.

26.201 TYST AUTONOMI

Helt tyst autonomi ska användas sparsamt.

Användaren ska fortfarande kunna se historiken.

26.202 FÖRKLARING

Varje autonom handling ska kunna förklaras utifrån:

- grant,

- policy,

- data,

- regel,

- och confidence.

26.203 INGEN PÅHITTAD MOTIVERING

Agenten får inte skapa en plausibel förklaring i efterhand som inte motsvarar verklig beslutskedja.

26.204 AUTONOMIDRIFT

Systemet ska upptäcka om autonomt beteende över tid:

- blir bredare,

- använder mer data,

- gör fler handlingar,

- eller avviker från ursprungligt syfte.

26.205 SCOPE CREEP

En capability får inte gradvis börja påverka fler objekt än grantet anger.

26.206 BEHAVIORAL CREEP

En agent får inte tolka ett återkommande mandat allt bredare.

Exempel:

Rätt att flytta pass inom veckan får inte gradvis bli rätt att ändra träningsfrekvens.

26.207 DATA CREEP

Agenten får inte börja hämta mer data därför att den kan förbättra rekommendationen marginellt.

26.208 COST CREEP

En autonom capability får inte få ökande kostnad utan budgetkontroll.

26.209 PERIODISK REVIEW

Stående grants ska granskas periodiskt.

Review ska fråga:

- används capabilityn,

- ger den värde,

- är risknivån oförändrad,

- och behövs mandatet fortfarande?

26.210 UNUSED GRANTS

Oanvända grants ska kunna löpa ut eller föreslås för borttagning.

26.211 DORMANT ACCOUNTS

Konton som varit inaktiva länge ska inte behålla breda aktiva grants utan omprövning.

26.212 MODELLBYTE

När underliggande agentmodell byts ska högre autonomi kunna:

- sänkas tillfälligt,

- köras i shadow mode,

- och omvalideras.

26.213 POLICYBYTE

När relevant policy ändras ska grants omvärderas.

26.214 CAPABILITYVERSION

Ett grant ska vara kopplat till en capabilityversion.

Större beteendeförändring ska kunna kräva nytt approval.

26.215 SEMANTISK FÖRÄNDRING

Om capabilityn behåller samma namn men får större effekt ska systemet behandla det som nytt mandatbehov.

26.216 USER CONTROL CENTER

GainPilot ska ha ett kontrollcenter för autonomi och permissions.

Det ska visa:

- aktiva grants,

- väntande approvals,

- agentauthority,

- datadelning,

- budget,

- senaste autonoma handlingar,

- och nödstopp.

26.217 ENKEL VY

Enkel vy ska använda begripligt språk.

Exempel:

Arnold får automatiskt:

- flytta träningspass inom samma vecka,

- använda tidigare godkända övningsbyten,

- och välja sparade reservmåltider.

Arnold måste fråga innan han:

- ändrar träningsmål,

- delar data,

- eller aktiverar nytt program.

26.218 AVANCERAD VY

Avancerad vy kan visa:

- capabilities,

- authoritynivå,

- scope,

- expiry,

- policy,

- och audit.

26.219 ÄNDRA MANDAT

Användaren ska kunna:

- höja,

- sänka,

- pausa,

- återkalla,

- och tidsbegränsa

mandat.

26.220 PAUSA AUTONOMI

Användaren ska kunna pausa autonomi utan att radera alla inställningar.

26.221 ÅTERSTÄLL TILL MANUELLT

Ett enkelt val ska kunna återställa GainPilot till:

- propose-only eller manual mode.

26.222 EXPORTERA BEHÖRIGHETER

Användaren ska kunna exportera en begriplig lista över aktiva grants och delningar.

26.223 HISTORIK

Kontrollcentret ska visa:

- vem som beviljade,

- när,

- vilka handlingar som utförts,

- och eventuella incidenter.

26.224 ORGANISATIONSVY

Organisationer ska kunna se:

- roller,

- capabilities,

- approvals,

- och policyavvikelser

utan att se mer individdata än nödvändigt.

26.225 SUPPORT

Support ska kunna hjälpa användaren förstå permissions.

Support får inte ändra hög risk-behörighet utan rätt process.

26.226 ÅTERSTÄLLNING AV FELAKTIG BEHÖRIGHET

Om ett grant skapats felaktigt ska systemet:

- återkalla det,

- identifiera utförda handlingar,

- bedöma påverkan,

- och informera berörda.

26.227 AUDIT

Alla betydelsefulla behörighetshändelser ska auditeras.

Exempel:

- grant skapades,

- authority höjdes,

- approval gavs,

- budget ändrades,

- delegation skedde,

- nödstopp aktiverades,

- eller revocation utfördes.

26.228 MINIMERAD AUDIT

Audit ska normalt inte innehålla fulla:

- träningsdata,

- kostuppgifter,

- eller privata dialoger.

Referenser och beslutmetadata ska prioriteras.

26.229 USER-FACING AUDIT

Användaren ska kunna se en begriplig historik.

Exempel:

Arnold flyttade måndagens pass till tisdag eftersom du hade gett honom rätt att flytta pass inom samma vecka. Ingen träningsvolym ändrades.

26.230 TEKNISK AUDIT

Teknisk audit kan visa:

- grant identity,

- capability version,

- policy version,

- authority level,

- och execution reference.

26.231 PERMISSION INCIDENT

En incident kan vara:

- capability användes utan grant,

- fel användarscope,

- fel tenant,

- expired approval,

- budgetöverskridande,

- eller authority escalation.

26.232 ALLVARLIG INCIDENT

Följande ska behandlas som allvarligt:

- obehörig känslig datadelning,

- agent själv höjer authority,

- köp utan mandat,

- radering utan korrekt approval,

- eller cross-tenant execution.

26.233 INCIDENTSTOPP

Vid permissionincident ska systemet kunna stoppa:

- agent,

- capability,

- granttyp,

- integration,

- eller hela writeplanet.

26.234 KARANTÄN

Misstänkta grants eller approvals ska kunna sättas i karantän.

26.235 KONSEKVENSANALYS

Incidenten ska analyseras för:

- vilka handlingar som genomförts,

- vilken data som lästs,

- vem som påverkats,

- och om kompensation krävs.

26.236 KOMPENSATION

En felaktig handling ska där möjligt kunna kompenseras.

Exempel:

- återställa program,

- återkalla delning,

- återbetala kostnad,

- eller återställa kalenderhändelse.

26.237 IRREVERSIBEL EFFEKT

Om effekten inte kan återställas ska systemet:

- stoppa fortsatt påverkan,

- informera,

- dokumentera,

- och genomföra skadebegränsning.

26.238 POST-INCIDENT REVIEW

Review ska analysera:

- grant,

- policy,

- agent,

- approval,

- tool binding,

- och varför kontrollen misslyckades.

26.239 POLICY SOM KOD

Behörighets- och approvalregler ska där möjligt genomdrivas tekniskt.

Exempel:

- default deny,

- authority ceiling,

- expiry,

- budget,

- tenant match,

- och required approval.

26.240 PROMPT ÄR INTE PERMISSION

Instruktionen:

Fråga användaren innan du gör något viktigt

är inte tillräcklig säkerhet.

Systemet ska tekniskt blockera execution utan giltigt approval.

26.241 UI ÄR INTE PERMISSION

En dold knapp betyder inte att API:t är skyddat.

26.242 API ÄR INTE ENSAMT SKYDD

Databas, verktyg och downstreamservices ska också verifiera behörighet där det behövs.

26.243 DEFENSE IN DEPTH

Kritiska capabilities ska ha flera kontrollager.

Exempel:

- identitet,

- capabilitygrant,

- approval,

- tool policy,

- service authorization,

- databaspolicy,

- och audit.

26.244 POLICYVERSIONERING

Permissions-, authority- och approvalpolicy ska versioneras.

26.245 GRANTVERSIONERING

Ändringar i grant ska bevara historik.

26.246 APPROVALVERSIONERING

Om åtgärden ändras efter approval ska det tidigare godkännandet inte automatiskt gälla.

26.247 TOCTOU

Systemet ska hantera risken att tillstånd förändras mellan:

- approval,

- och execution.

Före execution ska kritiska preconditions verifieras igen.

26.248 CONTEXT CHANGE

Om relevant kontext förändrats ska approval kunna ogiltigförklaras.

Exempel:

Användaren godkände en övning.

Därefter registrerades ny smärtsignal.

Execution ska omprövas.

26.249 RESOURCE VERSION

Approval kan bindas till en viss resursversion.

Exempel:

- programversion,

- PR-commit,

- eller kalenderhändelseversion.

26.250 REPLAYSKYDD

Ett gammalt approval ska inte kunna återanvändas för en ny handling.

26.251 NONCE ELLER EXECUTION IDENTITY

Känsliga executions ska ha unik identitet för att förhindra replay och dubbletter.

26.252 IDEMPOTENS

Retries ska inte skapa flera:

- köp,

- kalenderändringar,

- programaktiveringar,

- eller datadelningar.

26.253 UNKNOWN OUTCOME

Vid okänt utfall ska systemet verifiera vad som hände före retry.

26.254 PARTIELL EXECUTION

Om endast delar av en godkänd handling genomförts ska systemet visa:

- vad som lyckades,

- vad som misslyckades,

- och om kompensation krävs.

26.255 APPROVAL OCH RETRY

Ett tekniskt retry får använda samma approval endast när:

- exakt samma handling,

- samma resursversion,

- samma scope,

- och samma giltighetsfönster

fortfarande gäller.

26.256 TESTNING AV PERMISSIONS

GainPilot ska ha full teststrategi för permissions.

Den ska omfatta:

- enhetstest,

- policytest,

- tenanttest,

- authoritytest,

- approvaltest,

- revocationtest,

- och incidenttest.

26.257 POSITIVA TESTER

Systemet ska verifiera att giltiga handlingar fungerar.

26.258 NEGATIVA TESTER

Systemet ska särskilt verifiera att otillåtna handlingar nekas.

26.259 TENANTTESTER

Tester ska kontrollera att:

- agent för tenant A inte kan agera i tenant B,

- även om objektidentiteten är känd.

26.260 USERSCOPETESTER

Agenten ska inte kunna agera på annan användares program genom manipulerad input.

26.261 CAPABILITYTESTER

Varje capability ska testas för:

- rätt input,

- rätt scope,

- rätt side effect,

- och förbjudna handlingar.

26.262 AUTHORITYTESTER

Tester ska kontrollera skillnaden mellan:

- L2 rekommendation,

- L3 förberedelse,

- och L4 execution.

26.263 APPROVALTESTER

Tester ska omfatta:

- approved,

- rejected,

- expired,

- revoked,

- conditional,

- och partial approval.

26.264 REPLAYTESTER

Ett approval ska inte kunna återanvändas felaktigt.

26.265 TOCTOU-TESTER

Testet ska ändra resurs eller risksignal efter approval och verifiera ny kontroll.

26.266 REVOCATIONTESTER

Återkallande ska testas genom:

- cache,

- offlineenhet,

- token,

- pågående workflow,

- och återanslutning.

26.267 BUDGETTESTER

Tester ska verifiera:

- per-action limit,

- periodlimit,

- splitförsök,

- och cost overrun.

26.268 DELEGATIONSTESTER

Tester ska kontrollera:

- authority ceiling,

- expiry,

- vidaredelegation,

- och delegationsdjup.

26.269 NÖDSTOPPSTESTER

Systemet ska testas för:

- capabilitystopp,

- agentstopp,

- projektstopp,

- globalt stopp,

- och gradvis återstart.

26.270 SAFE MODE-TESTER

Safe mode ska bevara säkra grundfunktioner och blockera writes.

26.271 APPROVAL UX-TESTER

Användare ska förstå:

- vad som sker,

- vilken risk,

- och hur beslutet kan ändras.

26.272 DARK PATTERN-TESTER

Approvalflöden ska granskas för att inte:

- gömma avslag,

- göra nej svårare,

- skapa falsk brådska,

- eller förvälja bred autonomi.

26.273 AGENTTESTER

Arnold och Atlas ska testas så att de:

- inte pressar användaren,

- inte hittar på mandat,

- och accepterar denial.

26.274 INJEKTIONSTESTER

Prompter, importer och verktygsresultat får inte kunna:

- bevilja permission,

- ändra approval,

- eller höja authority.

26.275 TOOL ABUSE-TESTER

En agent ska inte kunna använda ett tillåtet verktyg för ett otillåtet syfte.

26.276 MODELLBYTESTESTER

När agentmodell byts ska permission- och approvalbeteende regressionstestas.

26.277 SHADOW MODE

Ny autonomilogik ska kunna köras i shadow mode.

Systemet kan då visa:

- vad agenten skulle ha gjort,

- vilket grant den skulle ha använt,

- och om approval hade krävts.

26.278 PARALLELL UTVÄRDERING

Aktiv och ny policyversion ska jämföras för:

- false allow,

- false deny,

- användarfriktion,

- och risk.

26.279 CANARY

Ny permission- eller autonomilogik ska börja med:

- intern tenant,

- låg risk-capability,

- och begränsad authority.

26.280 INGEN FÖRSTA CANARY PÅ KRITISK CAPABILITY

Följande ska inte vara första testområde:

- radering,

- köp,

- känslig delning,

- tenantpolicy,

- eller production deployment.

26.281 POLICYDRIFT

Systemet ska upptäcka om faktisk enforcement avviker från policydefinitionen.

26.282 GRANTDRIFT

Aktiva grants ska kontrolleras för:

- för bred scope,

- utgången giltighet,

- fel capabilityversion,

- och okänd issuer.

26.283 APPROVALDRIFT

Systemet ska följa:

- för många approvals,

- för breda approvals,

- höga avslagsnivåer,

- och approvals som aldrig används.

26.284 AUTONOMIKVALITET

Autonomi ska mätas genom:

- lyckade handlingar,

- korrigeringar,

- reversals,

- incidenter,

- användarnytta,

- och rapporteringskvalitet.

26.285 FALSE ALLOW

False allow innebär att systemet tillät en handling som borde ha blockerats.

26.286 FALSE DENY

False deny innebär att en legitim handling blockerades.

Båda ska följas.

26.287 PERMISSION LATENCY

Permissionkontroll ska vara snabb nog för aktiva användarflöden.

26.288 CACHE OCH PRESTANDA

Cache kan användas.

Den får inte försvaga:

- revocation,

- expiry,

- eller tenantisolering.

26.289 APPROVAL LATENCY

Approvalprocessen ska inte skapa onödig väntan för lågriskhandlingar.

26.290 TIME TO REVOKE

GainPilot ska mäta hur snabbt ett mandat faktiskt slutar fungera efter revocation.

26.291 TIME TO DETECT

Systemet ska mäta hur snabbt obehörig eller avvikande användning upptäcks.

26.292 BYPASS RATE

Bypass av permissions eller approvals ska vara mycket sällsynt och särskilt granskat.

26.293 BREAK-GLASS RATE

Break-glass-användning ska följas och eftergranskas.

26.294 AUTONOMY ADOPTION

Andel användare med högre autonomi kan mätas.

Det ska inte vara ett mål i sig.

26.295 USER CONTROL

Framgång ska mätas genom att användaren:

- förstår,

- kan ändra,

- och känner kontroll

över agentens mandat.

26.296 INTE MAXIMAL AUTONOMI SOM MÅL

GainPilot ska inte optimera för att få så många användare som möjligt att aktivera autonomt läge.

26.297 RÄTT AUTONOMI

Målet är rätt autonomi för:

- användaren,

- capabilityn,

- risken,

- och situationen.

26.298 MÄNSKLIGT ANSVAR

Mänskliga ägare ska finnas för:

- capabilityregister,

- authoritymodell,

- approvalpolicy,

- riskklass,

- och incidenthantering.

26.299 AGENTEN SOM REKOMMENDATÖR

Atlas och Arnold kan rekommendera:

- nytt grant,

- lägre authority,

- högre authority,

- eller ändrad approvalnivå.

De ska inte ensamma bevilja förändringen.

26.300 INGEN SJÄLVMODIFIERING

Agenter får inte själva:

- ändra capabilityregister,

- authoritytak,

- riskklass,

- approvalpolicy,

- budget,

- eller nödstopp.

26.301 KONTROLLERAD POLICYUTVECKLING

Förändringar ska följa:

Signal

→ analys

→ hotmodell

→ policyförslag

→ godkänt scope

→ separat branch

→ implementation

→ policytester

→ negativa tester

→ approval- och UX-test

→ shadow mode

→ pull request

→ säkerhets- och integritetsreview

→ canary

→ kontrollerad merge

→ uppföljning.

26.302 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för behörigheter, autonomi och godkännanden.

**Kontrakt GP-502 — Behörighet ska vara explicit och tekniskt genomdriven**

Identitet, roll eller agentpersonlighet får inte i sig ge rätt att läsa, skriva, dela, spendera, radera eller påverka systemtillstånd.

**Kontrakt GP-503 — Default deny ska gälla**

När giltigt grant, scope, capability eller approval inte kan verifieras ska handlingen nekas, förberedas eller eskaleras.

**Kontrakt GP-504 — Minsta privilegium ska gälla hela kedjan**

Varje människa, agent, integration och workflow ska endast få den capability, data, authority, miljö och tid som uppgiften kräver.

**Kontrakt GP-505 — Authority ska vara capabilityspecifik**

L0–L6 ska tilldelas per capability och scope och får aldrig behandlas som en global agentnivå.

**Kontrakt GP-506 — Föreslå, förbereda, godkänna, genomföra och verifiera ska separeras**

Rätt att utföra ett steg får inte automatiskt ge rätt att utföra nästa eller godkänna den egna handlingen.

**Kontrakt GP-507 — Agenter får inte bevilja sig själva mandat**

Atlas, Arnold och andra agenter får inte själva höja authority, bredda scope, förlänga giltighet eller ta bort approvalkrav.

**Kontrakt GP-508 — Approval ska vara exakt och tidsbegränsat**

Godkännanden ska avse en tydligt beskriven handling, effekt, resursversion, kostnad, risk och giltighetsperiod.

**Kontrakt GP-509 — Tystnad är inte godkännande**

Avsaknad av svar, timeout eller utebliven reaktion får inte tolkas som approval.

**Kontrakt GP-510 — Approval får inte användas som mörk bundling**

Operativ handling, datadelning, köp, marknadsföring och andra separata beslut får inte döljas i ett enda otydligt godkännande.

**Kontrakt GP-511 — Autonomi ska förtjänas per capability**

Verifierad kvalitet i en handlingstyp får endast påverka autonomin för samma eller uttryckligt relaterade capability.

**Kontrakt GP-512 — Hög confidence skapar inte högre authority**

Agentens säkerhet i sin analys får aldrig i sig ge större mandat eller lägre approvalkrav.

**Kontrakt GP-513 — Autonomi ska vara begränsad och återkallelig**

Varje autonomt mandat ska ha scope, riskgräns, budget, rapporteringsregel, expiry eller review och omedelbar revocation.

**Kontrakt GP-514 — Approvaltrötthet får inte användas för att skapa bred fullmakt**

GainPilot ska minska onödiga approvals genom riskbaserade och granulära mandat, inte genom att pressa användaren till obegränsad autonomi.

**Kontrakt GP-515 — Kostnad kräver separat budgetmandat**

Permission att använda en capability ger inte automatiskt rätt att skapa kostnad, köp, abonnemang eller leverantörsåtagande.

**Kontrakt GP-516 — Delegation får aldrig bredda rättigheter**

En delegat eller underagent får aldrig större authority, scope, budget eller datatillgång än delegatorn och den aktuella uppgiften tillåter.

**Kontrakt GP-517 — Revocation ska få snabb och fullständig effekt**

Återkallande ska stoppa nya handlingar, tokens, delegation och cachead permission samt hantera pågående och offlinearbete säkert.

**Kontrakt GP-518 — Nödstopp ska vara granulärt**

GainPilot ska kunna stoppa agent, capability, projekt, writeplan eller hela systemet utan att säkra read-only-funktioner försvinner i onödan.

**Kontrakt GP-519 — Återstart ska vara kontrollerad**

Autonomi och writebehörighet får inte återställas fullt ut efter incident utan verifiering, review och relevant approval.

**Kontrakt GP-520 — Behörighet ska verifieras vid execution**

Approval eller grant ska omprövas mot aktuell resursversion, risksignal, expiry och context för att motverka replay och TOCTOU-fel.

**Kontrakt GP-521 — Autonoma handlingar ska vara förklarbara**

Användaren ska kunna se vad som gjordes, varför, vilket mandat som användes, vilken data som påverkade beslutet och hur handlingen kan återställas.

**Kontrakt GP-522 — Permission enforcement ska finnas i flera lager**

UI, agentruntime, capabilitygateway, tjänst, databas, verktyg och downstreamsystem ska tillsammans förhindra kringgående.

**Kontrakt GP-523 — Permissionincidenter ska konsekvensanalyseras**

Obehörig access eller execution ska spåras till använd data, handlingar, kostnader, mottagare och eventuell kompensation.

**Kontrakt GP-524 — Agenter får inte självmodifiera permissiongovernance**

Agenter får inte ändra capabilityregister, authoritytak, riskklasser, approvalpolicy, budgetskydd, branchskydd eller nödstopp i produktion.

**Kontrakt GP-525 — Behörighets- och autonomiutveckling ska vara branch- och reviewstyrd**

Förändringar av permissions, approvals, authority, delegation, budget, nödstopp och autonomi ska ske genom separat branch, negativa tester, säkerhets- och integritetsreview, shadow mode och kontrollerad utrullning.

26.303 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- behandla inloggning som full authorization,

- behandla roll som obegränsad behörighet,

- ge Arnold rättigheter enbart därför att han är coach,

- ge Atlas rättigheter enbart därför att han är central intelligens,

- tolka gör vad som behövs som generell fullmakt,

- använda ett globalt permissionfält,

- ge global L4 eller L5 utan capabilityscope,

- anta att read innebär write,

- anta att update innebär delete,

- anta att export innebär delning,

- anta att förslag innebär execution,

- låta genomföraren godkänna sin egen kritiska handling,

- låta verifieraren vara identisk med executor vid kritisk risk,

- tillåta när giltigt grant saknas,

- använda frånvaro av deny som allow,

- låta ett allow övertrumfa explicit do-not-share,

- ge större authority än agentens ceiling,

- låta authority gälla mellan tenants,

- låta developmentmandat gälla i production,

- ge standing grants utan review,

- låta tillfällig upphöjning sakna expiry,

- använda break-glass av bekvämlighet,

- använda break-glass utan audit,

- låta capability sakna ägare,

- dölja side effects,

- ignorera irreversibilitet,

- ignorera blast radius,

- använda samma riskklass oavsett context,

- sänka risk enbart för att modellen är självsäker,

- skapa vaga approval requests,

- använda tekniska formuleringar som döljer verklig effekt,

- godkänna flera dolda handlingar i ett klick,

- paketera datadelning med nödvändig produktfunktion,

- visa kostnad först efter execution,

- skapa abonnemang utan separat approval,

- låta approval gälla utan expiry,

- återanvända approval efter förändrad handling,

- tolka tystnad som ja,

- göra avslag svårare än godkännande,

- förvälja bred autonomi,

- använda falsk brådska,

- pressa användaren genom många små approvals,

- ta bort approvalkrav tyst,

- anta att många tidigare godkännanden innebär nytt mandat,

- höja autonomi efter en lyckad handling,

- använda framgång i passflytt för att ge köprättighet,

- låta proactive mode aktivera allt,

- göra autonomiprofil till en global switch,

- ge hög risk-capability bounded autonomy utan särskild kontroll,

- låta autonomi vara osynlig,

- dölja historiken över autonoma handlingar,

- skapa efterhandsförklaring som inte matchar beslutskedjan,

- låta scope creep fortsätta,

- låta data creep fortsätta,

- låta kostnad creep fortsätta,

- behålla oanvända grants permanent,

- behålla bred authority efter lång inaktivitet,

- behålla hög autonomi efter modellbyte utan omtest,

- låta capability ändra semantik utan nytt approval,

- sakna kontrollcenter,

- göra permissioninställningar obegripliga,

- göra revocation svår,

- kräva att användaren raderar alla grants ett och ett i incident,

- ge support fri rätt att höja authority,

- låta en coach godkänna användarens privata datadelning,

- sakna veto för säkerhetskritisk fråga,

- ge globalt veto utan definierad domän,

- godkänna automatiskt när SLA löper ut,

- fylla approvalinkorgen med trivial information,

- blanda information och approval request,

- låta säkerhetsstopp bli generell reparationsfullmakt,

- göra autoåtgärd utan omedelbar rapportering,

- stoppa hela GainPilot när en capability räcker,

- återstarta full autonomi automatiskt,

- återkalla grant utan att invalidiera tokens,

- låta cache behålla återkallad permission,

- ge långlivade breda offlinegrants,

- tillåta vidaredelegation som standard,

- skapa obegränsad delegationskedja,

- låta agenttext skapa permission,

- ge agenten direkt secrets när capability räcker,

- låta verktygstillgång skapa mandat,

- ge direkt databaswrite utan policy,

- blanda calendar read och write,

- blanda social read och publish,

- blanda budgetanalys och köp,

- låta budgetöverskridande fortsätta tyst,

- kringgå per-action limit genom split,

- behandla engångsköp och abonnemang lika,

- aktivera automatisk förlängning utan mandat,

- använda autonomi som mål i sig,

- mäta framgång i antal användare med proactive mode,

- dölja false allow,

- ignorera false deny,

- låta permissioncache försvaga revocation,

- ignorera time to revoke,

- använda approvaltext som juridiskt samtycke,

- låta gammalt approval återspelas,

- retrya vid unknown outcome utan verifiering,

- låta partial execution beskrivas som full success,

- testa endast positiva permissionfall,

- hoppa över negativa tester,

- hoppa över cross-tenant-test,

- låta ny modellversion behålla full autonomi utan regressionstest,

- lansera ny permissionpolicy direkt på kritisk capability,

- låta agenten ändra sina egna authoritytak,

- eller ändra permission- och autonomisystemet direkt i produktion utan branch, tester, review och kontrollerad utrullning.

26.304 KANONISKA BESLUT FRÅN KAPITEL 26

Följande beslut etableras:

1. GainPilot ska ha ett tekniskt behörighetssystem.

2. Identitet och autentisering ska skiljas från authorization.

3. Roll och permission ska skiljas.

4. Capability ska vara den centrala åtgärdsgränsen.

5. Permission ska bindas till capability och scope.

6. Authority ska beskriva självständighetsnivå.

7. Scope ska omfatta tenant, användare, projekt, data, miljö och tid.

8. GainPilot ska ha en canonical grantmodell.

9. Subject och issuer ska vara explicit.

10. Agenter får inte bevilja sig själva rättigheter.

11. Explicit deny ska normalt vinna.

12. Effektiv policy ska använda den mest restriktiva kombinationen.

13. Default deny ska användas.

14. Minsta privilegium ska gälla.

15. Separation of duties ska kunna krävas.

16. Föreslå ska vara separat capability.

17. Förbereda ska vara separat capability.

18. Godkänna ska vara separat capability.

19. Genomföra ska vara separat capability.

20. Verifiera ska vara separat capability.

21. Återkalla ska vara separat capability.

22. Delegera ska vara separat capability.

23. GainPilot ska följa L0–L6.

24. L0 ska vara observation.

25. L1 ska vara information.

26. L2 ska vara rekommendation.

27. L3 ska vara förberedelse.

28. L4 ska vara begränsad execution.

29. L5 ska vara domänorkestrering.

30. L6 ska vara särskilt governance- och systemmandat.

31. Authority ska alltid anges per capability.

32. Global authoritynivå ska inte användas.

33. Agentmanifest ska ha authority ceiling.

34. Authority ska kunna vara tenantspecifik.

35. Authority ska kunna vara användarspecifik.

36. Authority ska kunna vara miljöspecifik.

37. Authority ska kunna vara enhetsspecifik.

38. Authority ska kunna vara tidsbegränsad.

39. Just-in-time grants ska stödjas.

40. Standing grants ska granskas.

41. Temporär upphöjning ska löpa ut.

42. Break-glass ska vara särskild incidentprocess.

43. GainPilot ska ha capabilityregister.

44. Varje capability ska ha ägare.

45. Side effects ska deklareras.

46. Reversibilitet ska deklareras.

47. Blast radius ska deklareras.

48. Risk ska vara multidimensionell.

49. Riskklasser ska påverka approval.

50. Risk ska kunna ändras med context.

51. Risksignaler ska läsas minimerat.

52. Confidence ska inte ersätta riskklass.

53. Approval ska vara en strukturerad handling.

54. Approval ska ha egen identitet.

55. Approval request ska beskriva effekt.

56. Approval ska vara begripligt.

57. Avancerad teknisk vy ska finnas.

58. Approval ska gälla exakt handling.

59. Side effects ska visas.

60. Alternativ ska visas där relevant.

61. Kostnad ska visas i kronor när den berör användaren.

62. Approvalstatus ska vara strukturerad.

63. Approval ska ha expiry.

64. Execution window ska kunna anges.

65. Villkorat approval ska stödjas.

66. Delvis approval ska stödjas.

67. Avslag ska inte automatiskt bli permanent preferens.

68. Avslagsorsak ska vara frivillig.

69. Operativt approval ska skiljas från juridiskt samtycke.

70. Mörk bundling ska förbjudas.

71. Bulk approval ska vara transparent.

72. Stående approval ska vara snävt.

73. Användaren ska kunna välja engångsgodkännande.

74. Sessionsapproval ska stödjas.

75. Periodmandat ska stödjas.

76. Godkänn alla av denna typ ska endast finnas för tydliga capabilities.

77. Approvaltrötthet ska mätas.

78. Likartade lågriskhandlingar ska kunna grupperas.

79. Systemet får föreslå ändrad approvalnivå.

80. Approvalkrav får inte sänkas tyst.

81. Atlas och Arnold får rekommendera högre autonomi.

82. Systemet ska också kunna rekommendera lägre autonomi.

83. Approvalkanal ska matcha risk.

84. Röstapproval ska kräva identitetskontroll.

85. Kritiska handlingar ska kräva starkare bekräftelse.

86. Step-up authentication ska stödjas.

87. Re-authentication ska användas vid känslig handling.

88. Låsskärmsnotis ska minimera känslig data.

89. Betrodd enhet ska kunna krävas.

90. Delegated approval ska stödjas.

91. Coachapproval ska vara domänbegränsat.

92. Organisationsapproval ska stödjas.

93. N-av-M ska kunna användas.

94. Fyraögonsprincip ska kunna krävas.

95. Approvalordning ska kunna definieras.

96. Parallella approvals ska kunna användas.

97. Approvalkonflikt ska ha policy.

98. Säkerhets- och integritetsroller ska kunna ha veto.

99. Veto ska vara scopeat.

100. Approval-SLA får inte skapa auto-approval.

101. Tystnad ska inte betyda ja.

102. Eskalering ska inte bredda mandat.

103. Approvalkö ska vara prioriterad.

104. Approvalinbox ska visa verkliga beslut.

105. Trivial information ska hållas utanför kön.

106. Information, rekommendation, varning och approval ska skiljas.

107. Akut säkerhetsstopp ska kunna ske automatiskt.

108. Kritisk autoåtgärd ska vara begränsad.

109. Autoåtgärd ska rapporteras direkt.

110. Användaren ska ha nödstopp.

111. Globalt nödstopp ska finnas.

112. Projektnödstopp ska finnas.

113. Capabilitynödstopp ska finnas.

114. Agentnödstopp ska finnas.

115. Write freeze ska finnas.

116. Safe mode ska finnas.

117. Återstart ska kräva kontroll.

118. Återstart ska kunna ske gradvis.

119. Full autonomi ska inte återställas automatiskt.

120. Grant ska kunna återkallas omedelbart.

121. Pågående handling ska hanteras säkert.

122. Tokens ska återkallas.

123. Permissioncache ska invalideras.

124. Offlinegrants ska vara snäva och kortlivade.

125. Revocationmekanism ska stödjas offline.

126. Delegation ska vara strukturerad.

127. Delegation ska ha authority ceiling.

128. Vidaredelegation ska vara förbjuden som standard.

129. Delegeringsdjup ska begränsas.

130. Hela kedjan ska kunna auditeras.

131. Text ska aldrig skapa permission.

132. Agenter ska använda strukturerade capabilityverktyg.

133. Tool binding ska vara scopeat.

134. Tool invocation ska verifiera grant och approval.

135. Tool output ska valideras.

136. Verktygstillgång ska inte skapa mandat.

137. Direkt databasåtkomst ska begränsas.

138. Production write ska ha stark kontroll.

139. Radering ska ha egen capability.

140. Export ska ha egen capability.

141. Delning ska ha egen capability.

142. Kommunikation ska ha egen capability.

143. Calendar read och write ska skiljas.

144. Social read och publish ska skiljas.

145. Ekonomiska capabilities ska delas upp.

146. Budget ska vara separat kontroll.

147. GainPilot ska ha canonical budgetmodell.

148. Projektbudget ska stödjas.

149. Global Omnira-budget ska stödjas.

150. Budget per capability ska stödjas.

151. Per-action limit ska stödjas.

152. Periodlimit ska stödjas.

153. Budgetalerts ska stödjas.

154. Budgetstopp ska stödjas.

155. Kostnadssplit får inte kringgå tak.

156. Prognos ska visas.

157. Överskridanderisk ska stoppa eller eskalera.

158. Vendor scope ska stödjas.

159. Engångsköp och abonnemang ska skiljas.

160. Automatisk förlängning ska kräva mandat.

161. Autonomi ska bygga på grants och policy.

162. Permission och autonomi ska skiljas.

163. Användaren ska kunna välja kontrollprofil.

164. Manual mode ska finnas.

165. Guided mode ska finnas.

166. Balanced mode ska finnas.

167. Proactive mode ska finnas.

168. Custom mode ska finnas.

169. Profil ska inte vara global fullmakt.

170. Earned autonomy ska stödjas.

171. Tillräcklig historik ska krävas.

172. Enstaka framgång ska inte höja autonomi.

173. Historik ska vara capabilityspecifik.

174. Vissa capabilities ska alltid ha stark approval.

175. Autonominivå ska vara strukturerad.

176. Disabled ska finnas.

177. Propose-only ska finnas.

178. Prepare-only ska finnas.

179. Execute-with-approval ska finnas.

180. Execute-with-notification ska finnas.

181. Execute-and-report ska finnas.

182. Bounded autonomous ska finnas.

183. Autonoma handlingar ska vara observerbara.

184. Rapporteringsnivå ska vara konfigurerbar.

185. Vissa handlingar ska rapporteras omedelbart.

186. Lågriskhandlingar ska kunna sammanfattas.

187. Tyst autonomi ska vara begränsad.

188. Autonoma handlingar ska kunna förklaras.

189. Efterhandsmotivering ska förbjudas.

190. Autonomidrift ska övervakas.

191. Scope creep ska upptäckas.

192. Behavioral creep ska upptäckas.

193. Data creep ska upptäckas.

194. Cost creep ska upptäckas.

195. Stående grants ska reviewas.

196. Oanvända grants ska kunna löpa ut.

197. Dormanta konton ska omprövas.

198. Modellbyte ska kunna sänka autonomi.

199. Policybyte ska omvärdera grants.

200. Grants ska kopplas till capabilityversion.

201. Semantisk capabilityförändring ska kräva ny kontroll.

202. Kontrollcenter ska finnas.

203. Enkel vy ska vara begriplig.

204. Avancerad vy ska finnas.

205. Användaren ska kunna ändra mandat.

206. Autonomi ska kunna pausas.

207. Manual mode ska kunna återställas snabbt.

208. Grants ska kunna exporteras.

209. Historik ska vara synlig.

210. Organisationer ska få egen kontrollvy.

211. Support ska inte fritt höja authority.

212. Felaktigt grant ska kunna återställas.

213. Behörighetshändelser ska auditeras.

214. Audit ska minimera privat data.

215. User-facing audit ska finnas.

216. Teknisk audit ska finnas.

217. Permissionincidenter ska klassificeras.

218. Obehörig känslig påverkan ska vara allvarlig incident.

219. Capability och writeplan ska kunna stoppas.

220. Grants ska kunna sättas i karantän.

221. Incidenter ska konsekvensanalyseras.

222. Felaktiga handlingar ska kompenseras där möjligt.

223. Irreversibel påverkan ska skadebegränsas.

224. Incidenter ska eftergranskas.

225. Behörighet ska vara policy som kod.

226. Prompt ska inte vara permissiongräns.

227. UI ska inte vara permissiongräns.

228. Downstreamsystem ska verifiera access.

229. Defense in depth ska användas.

230. Policyer ska versioneras.

231. Grants ska versioneras.

232. Approvals ska versioneras.

233. Execution ska omkontrollera tillstånd.

234. Contextförändring ska kunna ogiltigförklara approval.

235. Approval ska kunna bindas till resursversion.

236. Replay ska förhindras.

237. Känsliga handlingar ska ha unik execution identity.

238. Execution ska vara idempotent.

239. Unknown outcome ska verifieras.

240. Partial execution ska redovisas.

241. Retry ska respektera samma approvalscope.

242. Permissions ska ha full teststrategi.

243. Giltiga handlingar ska testas.

244. Otillåtna handlingar ska testas.

245. Cross-tenant-försök ska testas.

246. Manipulerat userscope ska testas.

247. Capabilityside effects ska testas.

248. Authoritynivåer ska testas.

249. Approvalstatusar ska testas.

250. Replay ska testas.

251. TOCTOU ska testas.

252. Revocation ska testas genom cache och offline.

253. Budgetsplit ska testas.

254. Delegation ceiling ska testas.

255. Nödstopp ska testas.

256. Safe mode ska testas.

257. Approval-UX ska testas.

258. Dark patterns ska testas.

259. Agenters denialbeteende ska testas.

260. Injection ska inte kunna skapa permission.

261. Tool abuse ska testas.

262. Modellbyte ska regressionstestas.

263. Ny autonomilogik ska köras i shadow mode.

264. Policyversioner ska jämföras.

265. Canary ska börja med låg risk.

266. Kritiska capabilities ska inte vara första canary.

267. Policy enforcement drift ska följas.

268. Aktiva grants ska driftgranskas.

269. Approvalfriktion ska mätas.

270. Autonomikvalitet ska mätas.

271. False allow ska följas.

272. False deny ska följas.

273. Permissionkontroll ska vara snabb.

274. Cache får inte försvaga revocation.

275. Approval latency ska följas.

276. Time to revoke ska följas.

277. Time to detect ska följas.

278. Bypass rate ska följas.

279. Break-glass ska följas.

280. Autonomiadoption ska inte vara mål i sig.

281. Användarkontroll ska vara framgångsmått.

282. Rätt autonomi ska prioriteras framför maximal autonomi.

283. Permissiongovernance ska ha mänskliga ägare.

284. Atlas och Arnold får rekommendera men inte själva bevilja authority.

285. Agenter får inte självmodifiera governance.

286. Policyförändringar ska följa branch, tester och review.

287. GainPilot ska kunna vara hjälpsamt autonomt utan att bli oöverskådligt eller okontrollerat.

26.305 IMPLEMENTERINGSORDNING

GainPilots behörighets-, autonomi- och approvalsystem ska implementeras stegvis.

Fas 1 — Aktörsregister

Implementera:

- subject identity,

- subject type,

- owner,

- tenant,

- status,

- och authentication relation.

Fas 2 — Capabilityregister

Implementera:

- capability identity,

- owner,

- description,

- inputs,

- outputs,

- side effects,

- risk,

- reversibility,

- och status.

Fas 3 — Scopemodell

Implementera:

- tenant,

- user,

- project,

- resource,

- data,

- environment,

- device,

- time,

- och workflow.

Fas 4 — Authority L0–L6

Implementera:

- authority per capability,

- authority ceiling,

- role defaults,

- och explicit overrides.

Fas 5 — Grantmodell

Implementera:

- subject,

- issuer,

- capability,

- scope,

- authority,

- preconditions,

- expiry,

- status,

- och audit.

Fas 6 — Policy engine

Implementera:

- default deny,

- explicit deny,

- most restrictive wins,

- tenant matching,

- user matching,

- och capability version.

Fas 7 — Tool binding

Implementera:

- agent identity,

- task identity,

- capability,

- environment,

- input validation,

- och output validation.

Fas 8 — Grundläggande approval

Implementera:

- approval request,

- approving actor,

- action summary,

- effect,

- risk,

- expiry,

- och execution reference.

Fas 9 — Approval-UX

Implementera:

- begriplig sammanfattning,

- teknisk detaljvy,

- alternativ,

- reject,

- conditional approval,

- och partial approval.

Fas 10 — Step-up authentication

Implementera:

- betrodd enhet,

- biometrik,

- re-authentication,

- och riskbaserad kanal.

Fas 11 — User control center

Implementera:

- aktiva grants,

- approvals,

- autonoma handlingar,

- data sharing,

- budget,

- pause,

- revoke,

- och emergency stop.

Fas 12 — Manual och guided mode

Starta GainPilot med:

- propose-only,

- prepare-only,

- och execute-with-approval

för de flesta förändringar.

Fas 13 — Lågriskautomation

Implementera först:

- tidigare godkänt övningsbyte,

- passflytt inom vecka,

- reservmåltid,

- och andra tydligt reversibla handlingar.

Fas 14 — Rapportering

Implementera:

- immediate report,

- weekly summary,

- exception report,

- och förklaringskedja.

Fas 15 — Revocation

Implementera:

- grant revoke,

- token revoke,

- cache invalidation,

- active task handling,

- och offline expiry.

Fas 16 — Delegation

Implementera:

- delegator,

- delegate,

- capability,

- authority ceiling,

- expiry,

- chain,

- och no onward delegation som standard.

Fas 17 — Budget

Implementera:

- project budget,

- capability budget,

- per-action limit,

- periodlimit,

- vendor scope,

- alert,

- och hard stop.

Fas 18 — Nödstopp

Implementera:

- capability stop,

- agent stop,

- project stop,

- global stop,

- write freeze,

- och safe mode.

Fas 19 — Återstart

Implementera:

- incident verification,

- authority review,

- capability test,

- approval,

- och gradual restart.

Fas 20 — Earned autonomy

Implementera:

- capability-specific performance,

- correction rate,

- incident rate,

- minimum sample,

- recommendation,

- och user approval.

Fas 21 — Autonomiprofiler

Implementera:

- manual,

- guided,

- balanced,

- proactive,

- och custom

som mappningar till granulära grants.

Fas 22 — Organisationsapproval

Implementera:

- roles,

- N-of-M,

- ordered approvals,

- parallel approvals,

- veto,

- och escalation.

Fas 23 — Replay- och TOCTOU-skydd

Implementera:

- resource version,

- execution identity,

- expiry,

- context recheck,

- och idempotency.

Fas 24 — Permissionaudit

Implementera:

- grant history,

- approval history,

- execution history,

- delegation,

- budget,

- revocation,

- och incident references.

Fas 25 — Negativa tester

Implementera:

- cross-tenant,

- wrong user,

- expired grant,

- revoked approval,

- authority escalation,

- replay,

- split budget,

- och tool abuse.

Fas 26 — Approval- och dark-patterntest

Implementera tester för:

- begriplighet,

- neutral presentation,

- lätt avslag,

- ingen förvald bred autonomi,

- och ingen falsk brådska.

Fas 27 — Shadow mode

Implementera:

- would execute,

- would require approval,

- selected grant,

- selected data,

- risk,

- och counterfactual result.

Fas 28 — Canary

Implementera:

- intern tenant,

- låg risk-capability,

- begränsad population,

- false allow,

- false deny,

- correction,

- och stop rule.

Fas 29 — Driftövervakning

Implementera:

- grant drift,

- policy drift,

- approval fatigue,

- autonomy drift,

- cost creep,

- time to revoke,

- och incident rate.

Fas 30 — Full permissiongovernance

Implementera:

- capability owners,

- policy owners,

- periodic access review,

- dormant grant cleanup,

- model-change review,

- break-glass review,

- och forbidden self-modification.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- unit- och policytester,

- negativa authorizationtester,

- tenant- och userscopetester,

- approval- och UX-tester,

- budgettester,

- revocation- och offline-tester,

- injection- och tool-abuse-tester,

- shadow mode,

- pull request,

- kvalificerad säkerhets- och integritetsreview,

- canary,

- kontrollerad merge,

- och effektuppföljning.

26.306 FRAMGÅNGSKRITERIER

Kapitel 26:s vision är framgångsrikt realiserad när:

- varje aktör har stabil identitet,

- autentisering inte förväxlas med authorization,

- roller inte automatiskt ger bred rättighet,

- alla verkliga handlingar går genom capabilities,

- permissions är scopeade,

- authority är capabilityspecifik,

- L0–L6 kan tillämpas per handling,

- default deny genomdrivs,

- explicit deny vinner,

- minsta privilegium används,

- issuer måste ha rätt att bevilja,

- agenter inte kan ge sig själva grants,

- authority ceiling fungerar,

- förslag och execution är separerade,

- approval och execution är separerade,

- execution och verifiering är separerade,

- stående grants har expiry eller review,

- just-in-time-access finns,

- break-glass är auditerat,

- capabilities har ägare,

- side effects är kända,

- reversibilitet och blast radius påverkar risk,

- context kan höja risk,

- approval requests är begripliga,

- handling och effekt visas exakt,

- kostnad visas när användaren påverkas,

- approval har expiry,

- villkorat och delvis godkännande fungerar,

- användaren enkelt kan avslå,

- tystnad aldrig tolkas som ja,

- operativt approval inte blandas med juridiskt samtycke,

- mörk bundling inte förekommer,

- approvaltrötthet mäts,

- approvalnivå inte sänks tyst,

- systemet kan rekommendera både högre och lägre autonomi,

- risknivå styr approvalkanal,

- känsliga beslut kräver step-up authentication,

- betrodd enhet kan krävas,

- coachapproval är begränsat,

- organisationsapproval kan kräva flera roller,

- veto är definierat,

- approvalkö visar verkliga beslut,

- akut säkerhetsstopp fungerar,

- autoåtgärd rapporteras omedelbart,

- användaren har nödstopp,

- GainPilot kan stoppas utan att hela Omnira stängs,

- enskilda capabilities kan stoppas,

- safe mode bevarar säkra grundfunktioner,

- återstart sker gradvis,

- revocation stoppar nya handlingar,

- tokens och cache invalideras,

- offlinegrants löper ut,

- delegation aldrig breddar authority,

- vidaredelegation är blockerad som standard,

- agenttext inte kan skapa permission,

- tool binding är scopeat,

- produktionswrite kräver starkare kontroll,

- read, write, delete, export och share är separata capabilities,

- calendar read och write skiljs,

- social read och publish skiljs,

- ekonomiska capabilities är uppdelade,

- projektbudget och global budget finns,

- per-action- och periodlimit fungerar,

- agenten inte kan kringgå budget genom split,

- abonnemang kräver eget mandat,

- användaren kan välja kontrollprofil,

- profiler översätts till granulära grants,

- proactive mode inte blir fullmakt,

- earned autonomy bygger på tillräcklig historik,

- kvalitet bedöms per capability,

- högriskområden behåller approval,

- autonominivåer är strukturerade,

- autonoma handlingar är observerbara,

- användaren kan se mandat och motivering,

- rapportering sker på rätt nivå,

- scope-, data- och cost creep upptäcks,

- stående grants reviewas,

- oanvända grants städas,

- modellbyte kan sänka autonomi,

- capabilityversion påverkar grants,

- användaren har kontrollcenter,

- manual mode kan återställas snabbt,

- grants kan exporteras,

- autonomi kan pausas utan att inställningar förloras,

- felaktiga grants kan återkallas,

- permissionaudit är begriplig,

- obehörig handling klassificeras som incident,

- påverkan kan konsekvensanalyseras,

- kompensation kan genomföras,

- permission enforcement finns i flera lager,

- policyer och grants versioneras,

- approval omprövas vid contextförändring,

- replay förhindras,

- execution är idempotent,

- unknown outcome verifieras,

- partial execution visas,

- positiva och negativa tester finns,

- cross-tenant och wrong-user-scenarier testas,

- revocation testas genom cache och offline,

- budgetsplit testas,

- nödstopp och safe mode testas,

- approval-UX granskas för dark patterns,

- agenten accepterar denial,

- injection inte kan skapa permission,

- tool abuse testas,

- modellbyte regressionstestas,

- ny autonomilogik körs i shadow mode,

- canary börjar med låg risk,

- false allow och false deny följs,

- permission latency är acceptabel,

- time to revoke mäts,

- bypass och break-glass granskas,

- autonomiadoption inte är ett mål i sig,

- användaren upplever verklig kontroll,

- mänskliga ägare ansvarar för governance,

- Atlas och Arnold endast rekommenderar authorityförändringar,

- agenter inte kan självmodifiera skyddet,

- och alla förändringar genomförs genom separat branch, tester, säkerhets- och integritetsreview, shadow mode och kontrollerad utrullning.

26.307 SAMMANFATTNING

GainPilot ska kunna bli mer autonomt över tid.

Det ska inte bli obegränsat.

Arnold ska kunna hjälpa användaren genom att:

- läsa relevanta GainPilot-data,

- föreslå anpassningar,

- förbereda förändringar,

- och inom tydliga gränser genomföra lågriskhandlingar.

Atlas ska kunna:

- analysera GainPilot,

- samordna agenter,

- följa risker,

- och skapa strategiska rekommendationer.

Ingen av agenterna ska automatiskt få full systembehörighet.

GainPilot ska skilja mellan:

- vem aktören är,

- vad aktören får göra,

- inom vilket scope,

- hur självständigt handlingen får utföras,

- vilken risk som tillåts,

- vilken budget som finns,

- och när ett mänskligt godkännande krävs.

Roll är inte permission.

Att Arnold är coach betyder inte att han får göra allt inom träning och kost.

Att Atlas är central intelligens betyder inte att Atlas får ändra all policy.

Behörighet ska byggas av granulära capabilities.

Exempel:

- läsa aktiv plan,

- föreslå övningsbyte,

- genomföra tidigare godkänt byte,

- flytta ett pass,

- aktivera nytt program,

- skriva i kalender,

- dela data med coach,

- eller genomföra köp.

Varje capability ska ha:

- ägare,

- riskklass,

- side effects,

- authoritygräns,

- approvalpolicy,

- audit,

- och rollbackmodell.

GainPilot ska använda L0–L6 per capability.

Arnold kan exempelvis ha:

- L4 för att läsa och förklara aktiv plan,

- L4 för tidigare godkända lågriskbyten,

- L3 för nytt programförslag,

- L2 för ändrat energimål,

- och ingen permission för medicinsk diagnos eller privat datadelning.

Atlas kan ha:

- L4 för intern produktanalys,

- L3 för roadmapförslag,

- L2 för authorityrekommendation,

- och ingen rätt att själv bevilja höjd autonomi.

Autonomi ska därför inte beskrivas som:

Arnold är autonom.

Den ska beskrivas som:

Arnold får under detta mandat genomföra dessa capabilities, för denna användare, under denna tidsperiod, inom dessa risk- och budgetgränser.

GainPilot ska använda default deny.

När systemet inte kan verifiera:

- grant,

- scope,

- authority,

- approval,

- budget,

- eller aktuell säkerhet

ska handlingen inte genomföras.

Den ska:

- nekas,

- förberedas som förslag,

- eller skickas till approval.

Approval ska vara begripligt.

Användaren ska se:

- vad som sker,

- varför,

- vilken data som används,

- vad som förändras,

- vilken kostnad som kan uppstå,

- vilken risk som finns,

- om handlingen kan återställas,

- och vilka alternativ som finns.

Ett approval ska inte vara:

Ja till allt.

Det ska gälla en exakt handling eller ett tydligt stående mandat.

Exempel:

Arnold får under de kommande åtta veckorna automatiskt flytta träningspass inom samma vecka när ett godkänt tillgänglighetsfönster saknas. Han får inte ändra veckovolym, träningsmål eller övningsval genom detta mandat.

Godkännandet ska:

- ha expiry,

- kunna återkallas,

- och kunna granskas i kontrollcentret.

Tystnad ska aldrig vara godkännande.

Ett utgånget approval ska inte kunna användas.

Ett approval ska inte återanvändas efter att:

- handlingen ändrats,

- resursversionen ändrats,

- eller ny riskinformation tillkommit.

GainPilot ska kontrollera mandatet igen vid execution.

Detta skyddar mot att ett tidigare säkert beslut blir osäkert därför att situationen förändrats.

Approval får inte användas som mörk bundling.

GainPilot ska inte gömma:

- datadelning,

- marknadsföring,

- abonnemang,

- eller bred autonomi

bakom ett nödvändigt produktbeslut.

Användaren ska kunna säga:

- ja,

- nej,

- endast denna gång,

- under denna session,

- under en viss period,

- eller ja med villkor.

GainPilot ska också undvika approvaltrötthet.

Om användaren måste godkänna varje liten lågriskhandling kommer kontrollen att bli sämre, inte bättre.

Systemet ska därför kunna gruppera tydligt likartade och reversibla handlingar.

Efter tillräckligt många lyckade och okorrigerade handlingar kan Arnold rekommendera:

Du har godkänt denna typ av övningsbyte många gånger. Vill du att jag gör dessa automatiskt när samma villkor gäller?

Arnold får rekommendera detta.

Han får inte själv aktivera det.

Autonomi ska förtjänas per capability.

Bra resultat i en capability får inte användas som bevis för en annan.

Att Arnold korrekt flyttat 20 träningspass innebär inte att han ska få:

- ändra kostmål,

- dela data,

- göra köp,

- eller aktivera nytt program.

Vissa handlingar ska alltid behålla stark kontroll.

Det gäller särskilt:

- känslig datadelning,

- permanent radering,

- köp och abonnemang,

- ändrade säkerhetsregler,

- höjd agentauthority,

- tenantpolicy,

- och produktionsdeployment.

GainPilot ska erbjuda kontrollprofiler som:

- manual,

- guided,

- balanced,

- proactive,

- och custom.

Profilerna ska vara begripliga genvägar.

De ska inte vara en enda global switch.

Proactive mode ska inte automatiskt innebära:

- full datadelning,

- ekonomiskt mandat,

- raderingsrätt,

- eller högriskautonomi.

Varje profil ska översättas till granulära grants.

Användaren ska ha ett kontrollcenter.

Det ska visa:

- vad Arnold får göra automatiskt,

- vad han måste fråga om,

- vilka data som delas,

- aktiva tidsbegränsade mandat,

- budget,

- senaste autonoma handlingar,

- och nödstopp.

Användaren ska kunna:

- pausa autonomi,

- sänka authority,

- återkalla en capability,

- återställa manual mode,

- och exportera sin behörighetsöversikt.

Autonoma handlingar ska vara synliga.

Arnold ska kunna säga:

Jag flyttade morgondagens pass till fredag eftersom du har gett mig mandat att flytta pass inom samma vecka vid tidskonflikt. Jag ändrade inte träningsvolymen.

Atlas ska kunna säga:

Jag skapade ett internt analysärende inom GainPilots analysbudget. Ingen individuell användardata användes.

Förklaringen ska motsvara verklig beslutskedja.

Agenter får inte hitta på motiveringar i efterhand.

Budget ska vara separat från permission.

En agent kan ha rätt att använda en extern analystjänst men sakna:

- tillgänglig budget,

- rätt leverantör,

- eller per-action-mandat.

GainPilot ska kunna sätta:

- global budget,

- projektbudget,

- capabilitybudget,

- per-action limit,

- periodlimit,

- och vendor scope.

Belopp som berör användaren ska visas i kronor.

En agent får inte kringgå en gräns genom att dela upp kostnaden i flera mindre handlingar.

Återkommande abonnemang ska kräva tydligt beslut.

Automatisk förlängning ska inte aktiveras tyst.

Delegation ska följa samma principer.

Atlas kan delegera en analys till specialistagent.

Arnold kan delegera en programberäkning till GainPilots domänmotor.

Delegaten får aldrig större:

- authority,

- scope,

- budget,

- eller datatillgång

än delegatorn och uppgiften tillåter.

Vidaredelegation ska vara förbjuden som standard.

En agentrespons kan inte skapa rättighet genom text.

Behörighet ska skapas genom systemets grant- och capabilitymodell.

Revocation ska få snabb effekt.

När användaren återkallar ett mandat ska systemet stoppa:

- nya handlingar,

- nya delegationer,

- tokens,

- och cachead permission.

Offlineenheter ska endast ha snäva och kortlivade grants.

Pågående handlingar ska hanteras säkert.

Systemet ska kunna:

- stoppa,

- slutföra minsta säkra steg,

- kompensera,

- eller markera unknown outcome.

GainPilot ska ha nödstopp.

Det ska gå att stoppa:

- en capability,

- Arnold,

- Atlas,

- hela GainPilot-projektet,

- writes,

- eller hela Omniras autonoma exekvering.

Ett nödstopp ska inte automatiskt ta bort säker read-only-funktion.

Användaren ska fortfarande kunna:

- läsa sin plan,

- se redan godkända instruktioner,

- och komma åt sina data

när detta är säkert.

Återstart ska ske gradvis.

Systemet ska inte automatiskt återställa alla tidigare mandat bara för att en teknisk tjänst åter fungerar.

Orsaken ska verifieras.

Capabilityn ska testas.

Authority ska omprövas.

Rätt aktör ska godkänna återstart.

Permission enforcement ska finnas i flera lager.

Det ska inte räcka att:

- en knapp är dold,

- en prompt säger var försiktig,

- eller ett API förväntar sig rätt beteende.

Kontroll ska kunna ske i:

- UI,

- agentruntime,

- capabilitygateway,

- tjänst,

- databas,

- integration,

- och downstreamsystem.

Kritiska actions ska använda defense in depth.

GainPilot ska testas minst lika mycket för vad systemet inte får göra som för vad det får göra.

Tester ska omfatta:

- fel tenant,

- fel användare,

- expired grant,

- revoked approval,

- replay,

- authority escalation,

- budgetsplit,

- tool abuse,

- offline revocation,

- och contextförändring efter approval.

Ny permission- eller autonomilogik ska först köras i shadow mode.

Systemet ska då kunna visa:

- vad agenten skulle ha gjort,

- vilket mandat som skulle ha använts,

- vilken data som hade lästs,

- om approval hade krävts,

- och om den aktiva policyn kom till ett annat resultat.

Canary ska börja med:

- intern tenant,

- låg risk-capability,

- begränsad population,

- och tydliga stoppregler.

Radering, köp, känslig delning, tenantpolicy och produktionsdeployment ska inte vara första canaryområde.

GainPilot ska mäta både:

- false allow,

- och false deny.

Ett system som tillåter för mycket är farligt.

Ett system som blockerar allt är oanvändbart.

Målet är minsta säkra friktion.

Framgång ska inte mätas i hur många användare som aktiverar hög autonomi.

Framgång ska mätas i om användaren:

- förstår vad systemet får göra,

- känner kontroll,

- kan ändra sitt beslut,

- får relevant hjälp,

- och skyddas från handlingar som ligger utanför mandatet.

Atlas och Arnold får föreslå förändrad autonomi.

De får inte bevilja sig själva den.

Agenter får inte själva ändra:

- capabilityregister,

- authoritytak,

- riskklasser,

- approvalpolicy,

- budgetskydd,

- eller nödstopp.

Alla förändringar ska gå genom:

- analys,

- hotmodell,

- definierat scope,

- separat branch eller worktree,

- implementation,

- policytester,

- negativa authorizationtester,

- tenant- och användarisoleringstester,

- approval- och UX-tester,

- injection- och tool-abuse-tester,

- shadow mode,

- pull request,

- säkerhets- och integritetsreview,

- canary,

- kontrollerad merge,

- och effektuppföljning.

Kapitel 26 etablerar därmed följande kärnprincip:

GainPilot ska inte välja mellan helt manuell kontroll och obegränsad AI-autonomi. Systemet ska bygga ett granulärt mellanlager där varje agent får exakt de capabilities, den authority, den data, den budget och den tidsperiod som behövs. Autonomi ska förtjänas per handlingstyp, approval ska vara begripligt och meningsfullt, och användaren ska alltid kunna se, pausa, återkalla och återta kontrollen.
