# Kapitel 22 — Hermes och isolerade minnesdomäner

GainPilot ska kunna lära känna användaren över tid.

Arnold ska kunna minnas:

- användarens mål,

- träningshistorik,

- kostpreferenser,

- tillgänglig utrustning,

- övningar som fungerar bra,

- övningar som användaren ogillar,

- tidigare programbeslut,

- kommunikationspreferenser,

- återkommande hinder,

- och andra relevanta GainPilot-förhållanden.

Atlas ska samtidigt kunna förstå GainPilot som:

- produkt,

- verksamhet,

- projekt,

- agentsystem,

- och del av Omniras större ekosystem.

Detta skapar ett grundläggande arkitekturproblem.

Om all information läggs i ett gemensamt minne kan systemet bli kraftfullt men osäkert.

Arnold kan då få tillgång till:

- privata Omnira-samtal,

- andra projekts strategier,

- kunduppgifter,

- privata dokument,

- meddelanden,

- ekonomisk information,

- eller sådant användaren aldrig avsett att använda i träningscoachningen.

Atlas kan på motsvarande sätt få tillgång till:

- fullständig träningshistorik,

- kroppsvikt,

- kroppsmått,

- progressionsbilder,

- kostlogg,

- smärtanteckningar,

- och privata dialoger med Arnold

även när Atlas endast behöver förstå en övergripande produktsignal.

GainPilot och Omnira ska därför inte bygga minne som en enda stor databas där alla agenter kan söka fritt.

Systemet ska bygga isolerade minnesdomäner.

Hermes ska vara den styrda gateway som kontrollerar all betydelsefull överföring mellan dessa domäner.

Hermes ska inte endast vara:

- en vektordatabas,

- en sökmotor,

- en promptbyggare,

- eller en teknisk API-proxy.

Hermes ska vara ett styrande minnes- och kontextlager.

Hermes ska kunna avgöra:

- vem som begär information,

- för vilken användare,

- inom vilken tenant,

- för vilket projekt,

- i vilket syfte,

- vilken datatyp som efterfrågas,

- vilken detaljnivå som behövs,

- vilken tidsperiod som är relevant,

- om känslig information får användas,

- vilken modell eller agent som får ta emot den,

- hur länge informationen får finnas i kontext,

- om resultatet får skrivas tillbaka,

- och om informationen får påverka framtida beteenden.

GainPilot ska ha en egen minnesdomän.

Arnold ska normalt arbeta inom denna domän.

Atlas ska kunna begära begränsade och syftesbundna paket genom Hermes.

Andra Omnira-projekt ska inte kunna läsa GainPilot-minnet utan:

- uttrycklig relation,

- godkänt syfte,

- rätt authority,

- och relevant användarmandat.

På samma sätt ska GainPilot inte få fri tillgång till andra projekts data.

En kalenderintegration kan exempelvis ge GainPilot signalen:

Användaren har låg tillgänglighet mellan 16.00 och 20.00.

GainPilot behöver normalt inte få:

- mötestitlar,

- deltagare,

- beskrivningar,

- videolänkar,

- eller privata anteckningar.

Ett annat Omnira-projekt kan få veta:

Användaren har ett aktivt träningsmål som kräver tre tidsfönster per vecka.

Projektet behöver normalt inte få:

- exakt kroppsvikt,

- övningshistorik,

- kostdata,

- eller Arnolds privata coachdialog.

Hermes ska göra sådan reducering möjlig.

Grundprincipen är:

Delad intelligens ska inte kräva delat råminne. GainPilot, Arnold, Atlas och andra Omnira-domäner ska kunna samarbeta genom syftesbundna, minimerade och tidsbegränsade kontextpaket — samtidigt som varje minnesdomän förblir isolerad, användarkontrollerad och spårbar.

22.1 HERMES ROLL

Hermes ska vara Omniras centrala gateway för:

- minnesåtkomst,

- kontextöverföring,

- dataminimering,

- scopekontroll,

- informationsklassificering,

- minnesskrivning,

- minneskorrigering,

- radering,

- retention,

- och spårbarhet.

Hermes ska inte själv vara den primära ägaren till all information.

Varje domän ska äga sina egna data och minnen.

22.2 GATEWAY, INTE GLOBALT MINNE

Hermes ska inte beskrivas som ett globalt minne som automatiskt innehåller allt.

Hermes ska i stället:

- känna till vilka minnesdomäner som finns,

- känna till deras kontrakt,

- kontrollera åtkomst,

- skapa säkra paket,

- och förmedla godkända skrivningar.

Rådata ska normalt stanna hos den ägande domänen.

22.3 MINNESDOMÄN

En minnesdomän är en avgränsad yta för information med gemensamt:

- ägande,

- syfte,

- dataklassificering,

- åtkomstmodell,

- retention,

- och användningsregler.

Exempel:

- GainPilot-minne.

- Delad användarprofil.

- Atlas strategiska minne.

- Omnira projektminne.

- Kalenderdomän.

- Kommunikationsdomän.

- Supportdomän.

- Produktanalysdomän.

22.4 GAINPILOT-MINNESDOMÄNEN

GainPilot-minnesdomänen kan innehålla:

- träningsmål,

- kostmål,

- programhistorik,

- träningsresultat,

- övningspreferenser,

- utrustning,

- tidsbegränsningar,

- aktiva säkerhetsbegränsningar,

- måltidspreferenser,

- kommunikationspreferenser,

- GainPilot-beslut,

- och relevanta coachningsmönster.

Minnet ska vara scopeat till rätt användare och tenant.

22.5 DELAD ANVÄNDARPROFIL

Omnira kan ha en delad användarprofil med uttryckligt godkända uppgifter.

Profilen kan innehålla:

- hur användaren vill bli tilltalad,

- språk,

- generell kommunikationsstil,

- tidszon,

- övergripande approvalpreferenser,

- och vissa stabila arbetspreferenser.

Profilen ska inte bli en dold sammanställning av användarens privatliv.

22.6 ATLAS STRATEGISKA MINNE

Atlas strategiska minne kan innehålla:

- projektstatus,

- strategiska beslut,

- verksamhetsmål,

- roadmap,

- risker,

- beroenden,

- och godkända systemiska slutsatser.

Det ska normalt inte innehålla fullständig individuell GainPilot-data.

22.7 PRIVAT ANVÄNDARDATA

Privat användardata ska förbli hos den domän där den behövs.

Exempel:

- kroppsvikt,

- kroppsmått,

- progressionsbilder,

- kostlogg,

- smärthistorik,

- träningsprestationer,

- privata coachdialoger,

- och känsliga personliga anteckningar.

Central tillgång ska kräva särskild grund.

22.8 DEN CANONICAL HERMESMODELLEN

Hermes ska ha en canonical modell för minnes- och kontexttransaktioner.

Modellen ska minst kunna representera:

- request_identity,

- requesting_actor,

- receiving_actor,

- tenant_identity,

- user_identity,

- project_identity,

- source_domain,

- destination_domain,

- purpose,

- capability,

- requested_data_classes,

- requested_memory_types,

- temporal_scope,

- detail_level,

- permission_scope,

- authority_level,

- approval_reference,

- minimization_policy,

- transformation_policy,

- retention_policy,

- write_back_policy,

- prohibited_uses,

- status,

- decision_reason,

- provenance,

- and audit_reference.

Exakta tekniska fältnamn fastställs senare.

22.9 MINNESTRANSAKTION

Varje betydelsefull överföring genom Hermes ska behandlas som en minnestransaktion.

En minnestransaktion kan vara:

- read,

- write,

- update,

- correct,

- delete,

- export,

- summarize,

- transform,

- share,

- revoke,

- eller derive.

Transaktionen ska ha tydligt syfte.

22.10 AKTÖR

Hermes ska identifiera den aktör som begär åtkomst.

Aktören kan vara:

- användaren,

- Arnold,

- Atlas,

- specialistagent,

- GainPilot-tjänst,

- coach,

- support,

- administratör,

- integration,

- eller schemalagt workflow.

En agentidentitet får inte ersättas av ett generellt systemkonto.

22.11 EFFEKTIV BEHÖRIGHET

Den effektiva behörigheten ska vara den mest restriktiva kombinationen av:

- systempolicy,

- tenantpolicy,

- domänpolicy,

- användarens mandat,

- aktörens capability,

- authority level,

- dataklass,

- syfte,

- och aktuell riskstatus.

Hermes ska inte välja den mest tillåtande regeln.

22.12 SYFTESBUNDEN ÅTKOMST

Varje åtkomst ska ange varför informationen behövs.

Exempel:

Tillåtet syfte:

Anpassa morgondagens träningspass efter tillgänglig tid.

Otillräckligt syfte:

Förbättra AI:n.

Syftet ska vara specifikt nog att styra dataminimering.

22.13 ÄNDAMÅLSBEGRÄNSNING

Information som lästs för ett syfte får inte automatiskt återanvändas för ett annat.

Exempel:

Kalenderdata som används för träningsplanering får inte automatiskt användas för:

- marknadsföring,

- produktprofilering,

- arbetsanalys,

- eller global modellträning.

22.14 CAPABILITYBUNDEN ÅTKOMST

Hermes ska koppla minnesåtkomst till en capability.

Exempel:

Capability:

adapt_training_schedule.

Detta kan ge tillgång till:

- tillgänglighetsfönster,

- aktiv träningsplan,

- och användarens planeringspreferens.

Det ska inte automatiskt ge tillgång till hela kalendern.

22.15 DATAKLASSIFICERING

Hermes ska förstå dataklassificering.

Exempel:

- public,

- internal,

- confidential,

- sensitive_personal,

- health_related,

- highly_restricted,

- och derived_aggregate.

Klassificeringen ska påverka:

- vem som får läsa,

- var data får behandlas,

- om extern modell får användas,

- loggning,

- retention,

- och approval.

22.16 HÄLSORELATERADE MINNEN

GainPilot-data kan vara hälsorelaterad även när den inte är medicinsk journalinformation.

Exempel:

- vikt,

- kroppsmått,

- vilopuls,

- smärta,

- medicinska begränsningar,

- kostrestriktioner,

- och återhämtningsdata.

Hermes ska behandla denna data med förhöjd försiktighet.

22.17 HÖGT BEGRÄNSAD DATA

Vissa uppgifter ska kunna klassificeras som särskilt begränsade.

Exempel:

- progressionsbilder,

- tydliga medicinska uppgifter,

- ätproblematik,

- privata röstinspelningar,

- eller detaljerad konversationshistorik.

Sådan data ska normalt inte lämna GainPilot-domänen.

22.18 MINIMERING

Hermes ska lämna ut minsta mängd information som behövs.

Minimering kan ske genom:

- färre fält,

- kortare tidsperiod,

- lägre precision,

- aggregering,

- kategorisering,

- pseudonymisering,

- sammanfattning,

- eller reducerad signal.

22.19 FÄLTMINIMERING

Om Arnold behöver veta vilka träningsredskap användaren har ska Hermes kunna lämna:

- skivstång,

- hantlar,

- bänk,

- kabelmaskin.

Det behöver inte samtidigt lämna:

- gymmets adress,

- medlemsnummer,

- betalningsinformation,

- eller besökshistorik.

22.20 TEMPORAL MINIMERING

En förfrågan ska använda minsta relevanta tidsperiod.

Exempel:

För att planera nästa vecka kan det räcka med:

- nästa veckas tillgänglighetsfönster.

Systemet behöver inte hämta användarens kalenderhistorik för flera år.

22.21 PRECISIONSMINIMERING

Hermes ska kunna reducera precision.

Exempel:

Full information:

Användaren väger 87,4 kilogram.

Reducerad signal:

Användarens vikttrend är stabil inom det aktiva uppföljningsintervallet.

Atlas kan ofta använda den reducerade signalen.

22.22 KATEGORISK REDUCERING

Detaljerad information kan ersättas med kategori.

Exempel:

Full kalender:

Lämna förskolan 07.45–08.15.

Reducerad kategori:

Morgonens tillgänglighet är begränsad.

GainPilot ska inte få familjedetaljer när tidskategorin räcker.

22.23 AGGREGERING

Hermes ska kunna skapa aggregerad information.

Exempel:

- tre av fyra kvällspass flyttades,

- den genomsnittliga passlängden är lägre än planerat,

- eller recept med mer än 30 minuters tillagning har låg användning.

Aggregeringen ska behålla relevant provenance.

22.24 PSEUDONYMISERING

För produktanalys ska Hermes kunna ersätta direkt identitet med pseudonym eller aggregerat segment.

Pseudonymiserad data ska fortfarande behandlas försiktigt om återidentifiering är möjlig.

22.25 ANONYMISERING

Data ska endast beskrivas som anonymiserad när återidentifiering rimligen har förhindrats.

Att ta bort namn är inte alltid tillräckligt.

22.26 REDUCERAD SIGNAL

En reducerad signal är ett kontrollerat påstående som ersätter underliggande detaljdata.

Exempel:

- låg tillgänglighet,

- återkommande träningsfriktion,

- förhöjd programbelastning,

- eller instabil integrationskvalitet.

Signalen ska ha:

- definition,

- källa,

- giltighet,

- confidence,

- och tillåten användning.

22.27 SIGNAL ÄR INTE RÅDATA

Mottagaren ska inte automatiskt kunna expandera en reducerad signal till full rådata.

Fördjupad åtkomst ska kräva en ny Hermes-transaktion.

22.28 KONTEXTPAKET

Hermes ska kunna skapa ett tillfälligt kontextpaket för en agentuppgift.

Paketet ska kunna innehålla:

- verifierade fakta,

- relevanta preferenser,

- aktiva begränsningar,

- mål,

- senaste beslut,

- reducerade signaler,

- och källreferenser.

22.29 PAKETIDENTITET

Varje kontextpaket ska ha unik identitet.

Identiteten ska användas för:

- spårbarhet,

- deduplicering,

- retention,

- återkallande,

- och audit.

22.30 PAKETETS SYFTE

Paketet ska endast användas för det angivna syftet.

Exempel:

Syfte:

Skapa förslag till nästa träningsvecka.

Paketet får inte automatiskt sparas som:

- Atlas globalminne,

- produktanalys,

- eller marknadsföringsprofil.

22.31 PAKETETS GILTIGHET

Kontextpaket ska ha definierad giltighet.

Giltigheten kan vara:

- en agentuppgift,

- en användarsession,

- en viss tidsperiod,

- eller tills ett specifikt beslut fattats.

När giltigheten löper ut ska paketet inte återanvändas utan kontroll.

22.32 PAKETETS RETENTION

Hermes ska skilja mellan:

- aktiv kontext,

- teknisk transaktionshistorik,

- auditreferens,

- och långtidsminne.

Hela paketets innehåll behöver normalt inte sparas i auditloggen.

22.33 FÖRBJUDNA ANVÄNDNINGAR

Ett kontextpaket ska kunna ange förbjudna användningar.

Exempel:

- får inte skickas till extern modell,

- får inte sparas,

- får inte delas med coach,

- får inte användas för produktanalys,

- och får inte påverka andra projekt.

22.34 EXTERN MODELL

Hermes ska kontrollera om data får skickas till en extern AI-modell.

Kontrollen ska omfatta:

- dataklass,

- region,

- leverantör,

- retention,

- modellavtal,

- användarmandat,

- och uppgiftens nödvändighet.

22.35 LOKAL BEHANDLING

Känslig information ska där det är lämpligt kunna behandlas:

- lokalt på enheten,

- i GainPilots kontrollerade miljö,

- eller genom en särskilt godkänd modell.

Lokal behandling får inte automatiskt betraktas som säker utan övriga kontroller.

22.36 MODELLSPECIFIK MINIMERING

Olika modeller kan få olika kontext.

Exempel:

En enkel klassificeringsmodell kan få:

- ett begränsat strukturerat fält.

En större planeringsmodell kan få:

- ett bredare men fortfarande minimerat paket.

Ingen modell ska få full profil av bekvämlighet.

22.37 PROMPTKONTEXT OCH MINNE

Information som finns i en prompt är inte automatiskt ett sparat minne.

Systemet ska skilja mellan:

- tillfällig promptkontext,

- sessionskontext,

- arbetsminne,

- och persistent minne.

22.38 SESSIONSMINNE

Sessionsminne får stödja en pågående interaktion.

Det kan innehålla:

- aktuella frågor,

- tillfälliga val,

- och nyligen hämtad kontext.

Sessionsminnet ska normalt löpa ut.

22.39 ARBETSMINNE

Arbetsminne kan användas av en agent under en specifik uppgift.

Det ska inte automatiskt återanvändas i framtida uppgifter.

22.40 EPISODISKT MINNE

Episodiskt minne beskriver en händelse.

Exempel:

- användaren genomförde ett pass,

- bytte en övning,

- avvisade ett programförslag,

- eller pausade coachning.

Händelsen ska bevaras med tid och kontext.

22.41 SEMANTISKT MINNE

Semantiskt minne beskriver ett mer stabilt påstående.

Exempel:

- användaren tränar normalt på ett visst gym,

- föredrar hantelpress framför maskinpress,

- eller vill ha korta svar under träningspass.

Påståendet ska ha:

- källa,

- confidence,

- giltighet,

- och möjlighet till korrigering.

22.42 PREFERENSMINNE

Preferenser ska skiljas från fakta.

Exempel:

Faktum:

Användaren valde hantelpress i tre pass.

Möjlig inferens:

Användaren föredrar hantelpress.

Preferensen ska inte automatiskt skrivas som säker sanning.

22.43 BEGRÄNSNINGSMINNE

Begränsningar kan vara:

- permanenta,

- långvariga,

- tillfälliga,

- situationsbundna,

- eller osäkra.

Exempel:

- allergi,

- aktiv smärta,

- begränsad utrustning,

- tidsbegränsning,

- eller professionell instruktion.

Typen och giltigheten ska vara explicit.

22.44 BESLUTSMINNE

GainPilot ska kunna minnas betydelsefulla beslut.

Exempel:

- användaren valde tre träningsdagar,

- ett programblock aktiverades,

- en övning låstes,

- eller coachdelning godkändes.

Beslutet ska innehålla:

- vem som beslutade,

- vilket mandat,

- giltighet,

- och om beslutet kan återkallas.

22.45 RATIONALMINNE

Betydelsefulla beslut kan ha lagrad motivering.

Exempel:

Övningen byttes eftersom:

- gymmet saknade utrustning,

- och alternativet bevarade samma rörelsefunktion.

Motiveringen ska inte ersättas av en påhittad senare förklaring.

22.46 INFERENSMINNE

En inferens ska alltid markeras som inferens.

Den ska ha:

- underlag,

- confidence,

- skapandetid,

- giltighet,

- och bekräftelsestatus.

Inferens får inte presenteras som användarens uttryckliga uppgift.

22.47 HYPOTESMINNE

En svag eller undersökande slutsats ska kunna lagras som hypotes.

Exempel:

Kvällspass kan vara svårare att genomföra än morgonpass.

Hypotesen ska inte styra permanent planering utan verifiering.

22.48 OBSERVATION

En observation är en registrerad signal utan full tolkning.

Exempel:

- tre pass flyttades,

- två recept byttes,

- eller fem kvällsnotiser stängdes.

Observationen kan senare stödja analys.

22.49 FAKTA

Ett faktapåstående ska ha tillräcklig grund.

Exempel:

- användaren har angett att hemmagymmet saknar kabelmaskin,

- eller användaren har uttryckligen valt vegetarisk kost.

Fakta kan fortfarande bli inaktuella.

22.50 FAKTA KAN FÖRÅLDRAS

Ett tidigare korrekt faktum kan sluta gälla.

Exempel:

- användaren byter gym,

- köper ny utrustning,

- ändrar kost,

- eller får nya arbetstider.

Minnet ska därför ha aktualitetsmodell.

22.51 MINNESTYP

Varje persistent minnespost ska ha en typ.

Exempel:

- fact,

- preference,

- constraint,

- observation,

- inference,

- hypothesis,

- decision,

- rationale,

- goal,

- relationship,

- eller policy_reference.

Typen ska påverka hur minnet får användas.

22.52 PROVENANCE

Varje betydelsefull minnespost ska ha provenance.

Provenance kan ange:

- användarens uttryckliga uppgift,

- sensor,

- import,

- träningsresultat,

- Arnold-dialog,

- Atlas-analys,

- professionell källa,

- eller systemregel.

22.53 KÄLLKVALITET

Källor ska kunna ha olika kvalitet.

Exempel:

- användaren bekräftade uppgiften,

- verifierad integration,

- osäker sensor,

- OCR från bild,

- eller agentinferens.

Källkvaliteten ska påverka confidence.

22.54 TID

Minnesposter ska minst kunna ha:

- created_at,

- observed_at,

- effective_from,

- valid_until,

- last_confirmed_at,

- och updated_at

där relevant.

22.55 GILTIGHET

Ett minne ska kunna vara:

- aktuellt,

- tidsbegränsat,

- utgånget,

- osäkert,

- ersatt,

- återkallat,

- eller arkiverat.

Utgångna minnen ska inte styra aktiva beslut.

22.56 DECAY

Vissa inferenser och preferenser ska kunna försvagas över tid.

Exempel:

En möjlig övningspreferens som inte bekräftats på ett år ska väga mindre.

Decay ska inte användas för:

- allergier,

- juridiska krav,

- eller aktiva säkerhetsregler

utan särskild modell.

22.57 STALENESS

Hermes ska kunna markera minnen som potentiellt inaktuella.

Exempel:

Din utrustningsprofil uppdaterades senast för arton månader sedan. Stämmer den fortfarande?

Systemet ska fråga när aktualitet är betydelsefull.

22.58 CONFIDENCE

Inferenser och osäkra minnen ska ha confidence.

Confidence ska inte vara godtyckligt genererad.

Den bör baseras på:

- källkvalitet,

- antal observationer,

- samstämmighet,

- aktualitet,

- och användarbekräftelse.

22.59 USER-CONFIRMED

En användarbekräftad minnespost ska markeras.

Bekräftelse betyder att användaren bekräftat uppgiften.

Det betyder inte att uppgiften är oföränderlig.

22.60 SYSTEM-VERIFIED

Vissa uppgifter kan vara systemverifierade.

Exempel:

- ett pass genomfördes och synkroniserades,

- eller en integration återkallades.

Systemverifiering ska ange vilket system som verifierade.

22.61 CONFLICTING

Två minnesposter kan stå i konflikt.

Exempel:

- tidigare mål: gå ned i vikt,

- nytt mål: stabilisera vikten.

Hermes ska inte slå ihop dem till ett otydligt medelvärde.

22.62 KONFLIKTLÖSNING

Konflikt ska hanteras genom:

- tidsordning,

- scope,

- källkvalitet,

- uttrycklig användarbekräftelse,

- eller fråga till användaren.

Säkerhetskritiska konflikter ska använda försiktig standard.

22.63 ERSÄTTNING

När en ny minnespost ersätter en tidigare ska relationen bevaras.

Det ska gå att förstå:

- vad som ändrades,

- när,

- varför,

- och vem som ändrade.

22.64 VERSIONERING

Minnesposter ska versioneras när ändringen är betydelsefull.

Systemet ska inte skriva över historik utan spår.

22.65 AKTIV VY OCH HISTORISK VY

Användaren ska kunna se:

- aktuell aktiv information,

- och historiska versioner där det är relevant.

Normal användning ska inte överbelastas med teknisk historik.

22.66 MINNESSKRIVNING

En persistent skrivning ska följa kontrollerad process.

Canonical flöde:

Observation

→ kandidat

→ typning

→ dataklassificering

→ scope

→ riskbedömning

→ bekräftelse där det krävs

→ skrivning

→ versionering

→ audit.

22.67 KANDIDATMINNE

En agent ska kunna föreslå ett minne utan att direkt spara det.

Exempel:

Du har valt kortare pass under fyra veckor. Vill du spara att vardagspass helst ska vara högst 45 minuter?

Användaren kan:

- godkänna,

- redigera,

- avvisa,

- eller göra minnet tillfälligt.

22.68 AUTOMATISK MINNESSKRIVNING

Vissa lågriskfakta kan sparas automatiskt.

Exempel:

- genomfört pass,

- registrerad belastning,

- valt recept,

- eller explicit ändrad inställning.

Automatisk skrivning ska följa tydlig policy.

22.69 KÄNSLIG MINNESSKRIVNING

Känsliga inferenser ska normalt kräva bekräftelse.

Exempel:

- möjlig ätproblematik,

- psykisk hälsa,

- medicinsk slutsats,

- familjeförhållande,

- eller annan djupt personlig tolkning.

GainPilot ska normalt undvika att skapa sådana minnen helt.

22.70 INGET MINNE AV ALLT

Arnold ska inte försöka spara varje uttalande.

Exempel på sådant som normalt inte ska bli permanent minne:

- tillfällig irritation,

- vardaglig småprat,

- enstaka skämt,

- kortsiktigt humör,

- eller information utan framtida värde.

22.71 MINNESVÄRDE

Före skrivning ska systemet bedöma om informationen:

- sannolikt blir användbar senare,

- är tillräckligt stabil,

- är relevant för domänen,

- och inte skapar oproportionerlig integritetsrisk.

22.72 ANVÄNDARENS KONTROLL

Användaren ska kunna styra:

- vad som sparas,

- om det är privat eller delat,

- vilket projekt som får använda det,

- om Atlas får se en reducerad signal,

- och hur länge minnet ska gälla.

22.73 PRIVAT ELLER DELAT

En minnespost ska kunna vara:

- GainPilot-private,

- user-private,

- shared-profile,

- Atlas-approved,

- coach-shared,

- eller organization-shared.

Standardvärdet för känslig data ska vara privat.

22.74 PROJEKTSCOPE

Minnet ska kunna begränsas till:

- GainPilot,

- en specifik del av GainPilot,

- ett coachförhållande,

- en tenant,

- eller ett tidsbegränsat workflow.

22.75 GLOBALT MINNE

Globalt användarminne ska användas sparsamt.

Endast stabila och uttryckligt godkända uppgifter bör kunna placeras där.

Exempel:

- språk,

- önskat namn,

- generell kommunikationsstil,

- och vissa övergripande säkerhetsregler.

22.76 INGEN AUTOMATISK UPPGRADERING TILL GLOBALT

Ett GainPilot-minne får inte automatiskt flyttas till globalt Omnira-minne bara för att det används ofta.

22.77 MINNESLÄSNING

En minnesläsning ska följa:

Förfrågan

→ identitetskontroll

→ syfteskontroll

→ capabilitykontroll

→ scopekontroll

→ policyutvärdering

→ minimisering

→ paketgenerering

→ leverans

→ audit.

22.78 SÖKNING

Hermes ska kunna kombinera:

- strukturerad sökning,

- metadatafilter,

- tidsfilter,

- grafrelationer,

- semantisk retrieval,

- och explicita referenser.

Semantisk likhet får inte ersätta scopekontroll.

22.79 VEKTORSÖKNING

Embeddings kan användas för att hitta relevant minne.

Embeddings ska:

- vara tenantisolerade,

- vara användarscopeade,

- ha dataklassificering,

- och kunna raderas.

En gemensam vektoryta utan säkerhetsfilter är förbjuden.

22.80 EMBEDDINGS ÄR KÄNSLIG DATA

Embeddings kan läcka betydelse eller möjliggöra återkoppling till originaldata.

De ska inte betraktas som anonymiserade enbart för att texten inte är direkt läsbar.

22.81 METADATAFILTER FÖRE SEMANTIK

Hermes ska använda hårda filter före semantisk retrieval.

Exempel:

- rätt tenant,

- rätt användare,

- rätt domän,

- tillåten dataklass,

- giltig tid,

- och aktiv policy.

Därefter kan relevans beräknas.

22.82 TOP-K ÄR INTE BEHÖRIGHET

Att ett minne är ett av de semantiskt mest relevanta innebär inte att agenten får läsa det.

22.83 RETRIEVALPROVENANCE

Agenten ska kunna se var informationen kommer från.

Retrieval ska inte returnera lösryckta påståenden utan:

- källa,

- tid,

- status,

- och minnestyp.

22.84 KONTEXTSAMMANSTÄLLNING

Hermes ska sammanställa kontext utan att ändra betydelsen.

Sammanställningen ska skilja mellan:

- användarens uttryckliga uppgift,

- observerad data,

- inferens,

- och systemregel.

22.85 INGEN SAMMANFATTNINGSHALLUCINATION

Hermes får inte lägga till nya personliga slutsatser när det sammanfattar minne.

Om källan säger:

Användaren har flyttat tre kvällspass.

Hermes får inte sammanfatta:

Användaren saknar disciplin på kvällarna.

22.86 KÄLLREFERENS

Sammanfattade påståenden ska kunna spåras tillbaka till källposter.

Detta behövs för:

- korrigering,

- förklaring,

- incidentutredning,

- och radering.

22.87 MINNESKORRIGERING

Användaren ska kunna korrigera ett minne.

Exempel:

Jag ogillar inte knäböj. Jag undvek den bara tillfälligt på grund av knäsmärta.

Korrigeringen ska uppdatera:

- aktiv fakta,

- preferensinferens,

- och relevanta framtida beslut.

22.88 KORRIGERINGENS RÄCKVIDD

Systemet ska förstå vad korrigeringen påverkar.

Den kan gälla:

- en minnespost,

- en hel inferens,

- en period,

- ett projekt,

- eller en delad profil.

22.89 ANVÄNDAREN SKA INTE BEHÖVA HITTA ALLA KOPIOR

När ett minne korrigeras ska Hermes kunna identifiera:

- härledda minnen,

- cache,

- index,

- aktiva paket,

- och godkända kopior.

Korrigeringen ska propageras enligt policy.

22.90 HÄRLEDDA MINNEN

Ett minne kan vara härlett från flera källor.

Exempel:

Preferens:

Användaren föredrar morgonträning.

Källor:

- uttryckligt svar,

- planeringsval,

- och historiskt genomförande.

Om en källa korrigeras ska inferensen omvärderas.

22.91 MINNESRADERING

Användaren ska kunna begära radering.

Raderingen kan omfatta:

- en post,

- en kategori,

- ett projekt,

- en tidsperiod,

- en konversation,

- eller hela kontot.

22.92 RADERINGSPROCESS

Radering ska minst omfatta:

1. Identifiera scope.

2. Bekräfta vad som påverkas.

3. Stoppa nya användningar.

4. Markera poster för radering.

5. Radera aktiv data.

6. Radera eller avaktivera index.

7. Propagera till härledda data.

8. Hantera backups enligt policy.

9. Verifiera resultatet.

10. Skapa minimerad auditpost.

22.93 SOFT DELETE

Soft delete kan användas under begränsad ångerperiod eller teknisk process.

Soft delete får inte innebära att data fortsätter användas i vanlig produktfunktion.

22.94 HARD DELETE

Efter relevant ångerperiod och verifiering ska data kunna tas bort från aktiva system.

Backuphantering ska följa dokumenterad retention.

22.95 BACKUP

Raderad information kan finnas i backup under en begränsad period.

Den ska:

- inte återföras till aktiv användning,

- vara skyddad,

- och försvinna enligt backupretention.

22.96 RADERING AV EMBEDDINGS

När källinnehåll raderas ska relaterade embeddings:

- raderas,

- ombyggas,

- eller göras otillgängliga

enligt säker process.

22.97 RADERING AV HÄRLEDDA SIGNALER

En härledd produktsignal kan ibland behöva tas bort eller omberäknas när källan raderas.

Hermes ska känna till derivationsrelationer.

22.98 RADERING OCH AGGREGERAD DATA

Verkligt anonymiserad och aggregerad information kan i vissa fall inte kopplas tillbaka till individen.

Systemet ska inte felaktigt kalla pseudonymiserad individdata anonym.

22.99 ÅTERKALLANDE AV DELNING

Användaren ska kunna återkalla:

- coachåtkomst,

- Atlasdelning,

- integrationsåtkomst,

- och andra projektkopplingar.

Återkallandet ska stoppa nya åtkomster.

22.100 PÅGÅENDE UPPGIFT

När delning återkallas under en pågående agentuppgift ska systemet:

- stoppa nya läsningar,

- avbryta där det är säkert,

- och avgöra om redan mottagen kontext måste raderas.

22.101 MINNESEXPORT

Användaren ska kunna exportera sina minnen.

Exporten ska skilja mellan:

- uttryckliga fakta,

- preferenser,

- inferenser,

- beslut,

- och systemhändelser.

Ogenomskinliga interna identifierare ska förklaras.

22.102 FÖRKLARBAR MINNESVY

GainPilot ska ha en användarvänlig vy som kan visa:

- Vad Arnold minns.

- Varför det sparades.

- Vilket projekt som får använda det.

- Om Atlas får en reducerad signal.

- När minnet senast bekräftades.

- Hur det kan ändras eller raderas.

22.103 AVANCERAD MINNESVY

En avancerad vy kan visa:

- provenance,

- dataklass,

- confidence,

- version,

- giltighet,

- derivation,

- och auditreferens.

22.104 MINNESLÅS

Användaren ska kunna låsa vissa minnen.

Exempel:

- mitt huvudsakliga mål,

- min allergi,

- min kommunikationsstil,

- eller en professionell restriktion.

Låst minne får inte automatiskt ändras genom inferens.

22.105 LÅS ÄR INTE OÄNDLIGHET

Användaren ska fortfarande kunna redigera eller ta bort ett låst minne.

Låsning skyddar mot automatisk ändring.

22.106 DO-NOT-INFER

Användaren ska kunna markera områden där systemet inte får skapa inferenser.

Exempel:

- psykisk hälsa,

- relationer,

- arbetsförmåga,

- ekonomi,

- eller andra privata områden.

GainPilot ska respektera detta även om mönster tekniskt kan identifieras.

22.107 DO-NOT-SHARE

Användaren ska kunna markera minnen som inte får lämna GainPilot-domänen.

Hermes ska då neka Atlas och andra domäner även om informationen skulle vara relevant.

22.108 DO-NOT-STORE

Användaren ska kunna välja att en uppgift får användas i aktuell session men inte sparas.

Exempel:

Tillfällig information om:

- resa,

- sjuk vecka,

- eller privat händelse.

22.109 TILLFÄLLIGT MINNE

Tillfälliga minnen ska ha automatisk utgångstid.

Systemet ska inte kräva att användaren manuellt raderar varje kortvarig uppgift.

22.110 RETENTIONSPOLICY

Varje minnestyp ska ha retention.

Retention kan baseras på:

- användarval,

- juridiskt krav,

- domänbehov,

- dataklass,

- och risk.

Obegränsad retention ska inte vara standard.

22.111 RETENTION OCH NYTTA

GainPilot ska inte lagra data längre än den rimligen behövs.

Lång historik kan vara användbar för progression.

Det innebär inte att alla:

- råa röstfiler,

- prompts,

- bilder,

- och tillfälliga paket

behöver sparas lika länge.

22.112 RÖSTDATA

Röstinspelningar ska normalt:

- behandlas för aktuell uppgift,

- och därefter raderas

om användaren inte uttryckligen valt annan lagring.

Transkription och härlett minne ska ha separata regler.

22.113 BILDER

Progressionsbilder och teknikvideor ska:

- ha separat mediaretention,

- vara privata som standard,

- och inte automatiskt användas för modellträning.

22.114 KONVERSATIONER

Arnold-dialoger ska kunna ha:

- sessionsretention,

- vald historik,

- minnesextraktion,

- och separat radering.

Att en dialog visas i historiken innebär inte att allt i den är persistent minne.

22.115 INGEN DOLD MODELLTRÄNING

GainPilot-data och Arnold-dialoger ska inte automatiskt användas för:

- extern modellträning,

- intern grundmodellträning,

- eller andra användares personalisering.

Modellträning kräver separat process och grund.

22.116 PRODUKTPERSONALISERING

Produktpersonalisering ska ske inom användarens scope.

Exempel:

- Arnold anpassar ton,

- programmet använder preferenser,

- och substitutionsmotorn rankar tidigare godkända alternativ.

Detta är inte samma sak som modellträning.

22.117 PLATTFORMSLÄRANDE

Plattformslärande kan använda:

- aggregerade signaler,

- anonymiserade mönster,

- kvalitetsfeedback,

- och strukturerade korrigeringar.

Det ska följa separat governance.

22.118 POPULATIONSDATA

En populationsinsikt ska inte skapas från en enda användare.

Systemet ska använda:

- tillräcklig datamängd,

- minimering,

- fairnessbedömning,

- och rättslig eller avtalsmässig grund.

22.119 SMÅ GRUPPER

Aggregering över mycket små grupper kan möjliggöra återidentifiering.

Hermes ska ha minsta gruppstorlek eller motsvarande skydd.

22.120 SÄLLSYNTA KOMBINATIONER

Även utan namn kan en ovanlig kombination av:

- ålder,

- plats,

- träningsform,

- skada,

- och tidpunkt

identifiera en person.

Minimering ska bedöma kombinationsrisk.

22.121 COACHDELNING

Användaren ska kunna dela utvalda GainPilot-data med en coach.

Delningen kan omfatta:

- program,

- pass,

- resultat,

- feedback,

- och valda mål.

Den ska inte automatiskt omfatta:

- privata Arnold-samtal,

- annan Omnira-data,

- eller full kosthistorik.

22.122 COACHENS MINNESRÄTT

En coach ska inte automatiskt få skapa permanenta minnen om användaren.

Coachens anteckningar ska ha:

- tydligt ägande,

- synlighet,

- och raderingsregler.

22.123 COACHRELATIONENS SLUT

När coachrelationen avslutas ska:

- framtida åtkomst stoppas,

- delade paket återkallas,

- och fortsatt lagring hanteras enligt avtal och användarval.

22.124 ORGANISATIONSDELNING

Gym och företag ska normalt få:

- aggregerad,

- minimerad,

- och icke-individuell

information.

Individens GainPilot-minne ska inte bli organisationsdata.

22.125 SUPPORTÅTKOMST

Support ska endast få:

- ärenderelevant information,

- tidsbegränsat scope,

- och användar- eller policygodkänd åtkomst.

Support ska inte söka fritt i Hermes.

22.126 JUST-IN-TIME

Känslig åtkomst ska där det är möjligt vara just-in-time.

Åtkomsten ska:

- begäras,

- motiveras,

- beviljas,

- löpa ut,

- och auditeras.

22.127 BREAK-GLASS

Ett break-glass-flöde kan finnas för allvarliga incidenter.

Det ska kräva:

- definierad nödsituation,

- stark autentisering,

- minsta åtkomst,

- omedelbar audit,

- och eftergranskning.

Break-glass får inte användas för bekvämlighet.

22.128 ATLAS-FÖRFRÅGAN

När Atlas begär GainPilot-kontext ska Hermes kontrollera:

- om strategisk eller systemisk analys kan göras med aggregerad data,

- om individdata verkligen krävs,

- och om användarens mandat tillåter detta.

Standard ska vara reducerad signal.

22.129 ARNOLD-FÖRFRÅGAN

När Arnold begär Omnira-kontext ska Hermes kontrollera:

- om uppgiften ligger inom GainPilot,

- om användaren godkänt relationen,

- och om en reducerad signal räcker.

Arnold ska inte få andra projekts rådata.

22.130 SPECIALISTAGENT

En GainPilot-specialist ska få ännu snävare kontext.

Exempel:

En substitutionsagent kan behöva:

- aktuell övning,

- programfunktion,

- utrustning,

- begränsning,

- och historiskt godkända alternativ.

Agenten behöver normalt inte:

- full kostlogg,

- kalender,

- eller konversationshistorik.

22.131 KONTEXT PER UPPGIFT

Olika uppgifter ska få olika paket.

Samma användare kan få:

- ett minimalt workoutpaket,

- ett separat kostpaket,

- och ett produktanalytiskt signalpaket.

Det ska inte finnas ett universellt användarpaket som skickas överallt.

22.132 KONTEXTKOMPILATOR

Hermes kan fungera som en kontextkompilator.

Den ska:

1. Tolka uppgiften.

2. Identifiera erforderliga datatyper.

3. Kontrollera policy.

4. Hämta tillåtna källor.

5. Minimera.

6. Strukturera.

7. Märka provenance och osäkerhet.

8. Skapa tidsbegränsat paket.

9. Leverera till rätt mottagare.

22.133 KOMPILATORN FÅR INTE SKAPA BEHÖRIGHET

Att en uppgift tekniskt kan beskrivas innebär inte att Hermes får hämta datan.

Policykontroll ska ske före retrieval.

22.134 KONTEXTMALLAR

Vanliga capabilities kan ha kontextmallar.

Exempel:

adapt_training_schedule kan normalt kräva:

- active_training_plan,

- available_time_windows,

- scheduling_preferences,

- recovery_constraints,

- och current_week_status.

Mallen ska vara versionerad.

22.135 DYNAMISK MINIMERING

Kontextmallen ska kunna reduceras ytterligare.

Exempel:

Om användaren endast vill flytta ett pass inom samma dag behövs inte hela veckans historik.

22.136 INGEN ÖVERHÄMTNING

Hermes ska kunna upptäcka förfrågningar som systematiskt begär mer data än vad resultatet använder.

Det kan vara:

- produktfel,

- agentdrift,

- eller säkerhetsrisk.

22.137 KONTAKT MED EXTERNA SYSTEM

Hermes kan förmedla kontext till externa integrationer.

Exempel:

- kalender,

- wearable,

- coachplattform,

- eller exporttjänst.

Extern överföring ska ha separat kontrakt.

22.138 DATAUTGÅNG

När data lämnar Omnira ska systemet registrera:

- mottagare,

- datatyper,

- syfte,

- rättslig eller avtalsmässig grund,

- tid,

- och återkallningsmöjlighet.

22.139 DATAINGÅNG

Data som kommer in ska ha:

- källa,

- användare,

- tenant,

- tidsstämpel,

- integritetsstatus,

- och confidence.

Extern data ska inte automatiskt bli minne.

22.140 IMPORT TILL MINNE

Importerad information ska först passera:

- extraction,

- normalisering,

- användarmatchning,

- osäkerhetsbedömning,

- och aktiveringskontroll.

Kapitel 11:s importregler ska gälla.

22.141 SENSORINFORMATION

Sensorinformation ska behandlas som observation.

Den kan vara:

- felaktig,

- ofullständig,

- eller tagen ur sitt sammanhang.

En sensoravvikelse ska inte automatiskt bli ett stabilt användarminne.

22.142 KALENDERINFORMATION

Kalenderinformation ska normalt reduceras till:

- tillgänglighet,

- tidsfönster,

- eller belastningskategori.

Innehåll, deltagare och privata titlar ska inte lämnas ut utan behov.

22.143 PLATSINFORMATION

Plats ska användas sparsamt.

GainPilot kan i vissa fall behöva veta:

- hemma,

- gym,

- resa,

- eller okänd träningsmiljö.

Exakt plats ska inte användas när kategori räcker.

22.144 MEDDELANDEN

Privata meddelanden ska inte vara en generell kontextkälla för GainPilot.

GainPilot ska inte läsa användarens privata konversationer för att bedöma:

- motivation,

- humör,

- relationer,

- eller tillgänglighet.

22.145 BILDER OCH FILER

Privata bilder och filer ska endast användas när användaren:

- väljer dem,

- laddar upp dem,

- eller öppnar ett godkänt workflow.

Hermes ska inte söka fritt i privata mappar.

22.146 MINNESISOLERING I LAGRING

Isolering ska finnas i:

- databas,

- objektlagring,

- filer,

- cache,

- vektorindex,

- sökindex,

- köer,

- backups,

- och loggar.

Enbart applikationsfilter är inte tillräckligt.

22.147 TENANTISOLERING

Varje minnespost ska kunna kopplas till rätt tenant.

Frågor utan tenantidentitet ska normalt nekas.

22.148 ANVÄNDARISOLERING

Inom samma tenant ska användarnas minnen hållas separata.

En coachorganisation innebär inte att coachen äger klienternas fullständiga minne.

22.149 PROJEKTISOLERING

GainPilot-minnen ska separeras från:

- The Prompt,

- Familje-Stunden,

- andra kundprojekt,

- och privata Omnira-domäner.

Gemensam användare betyder inte gemensamt minnesscope.

22.150 MILJÖISOLERING

Development, test, staging och production ska ha separata minnesytor.

Produktionsminnen ska inte kopieras till test utan särskilt godkännande.

22.151 CACHE

Cache ska vara:

- tenantmedveten,

- användarscopead,

- tidsbegränsad,

- och raderingsbar.

Felaktig cache kan skapa minnesläcka även om databasen är korrekt isolerad.

22.152 INDEX

Sök- och vektorindex ska byggas med:

- scope,

- dataklass,

- version,

- och raderingsreferens.

Indexet får inte leva kvar efter att källdatan blivit otillgänglig.

22.153 KÖER

Meddelanden och arbetsköer som innehåller minnesreferenser ska ha:

- tenant,

- user scope,

- purpose,

- och expiration.

Gamla kömeddelanden ska inte återaktivera återkallad åtkomst.

22.154 LOGGAR

Loggar ska normalt inte innehålla:

- fulla minnesposter,

- privata konversationer,

- kroppsmått,

- progressionsbilder,

- eller kompletta kontextpaket.

Referenser och teknisk metadata ska prioriteras.

22.155 TRACING

Tracing ska visa flödet utan att duplicera känsligt innehåll.

Exempel:

Arnold

→ Hermes request

→ GainPilot memory

→ minimized context package

→ Planning Agent.

Payloads ska vara redigerade eller refererade.

22.156 AUDIT

Audit ska kunna visa:

- vem som begärde data,

- syftet,

- vilken policy som användes,

- vilken dataklass som lämnades,

- om informationen minimerades,

- vem som tog emot,

- och om skrivning följde.

22.157 ANVÄNDARVÄNLIG AUDIT

Användaren ska kunna se en enkel historik.

Exempel:

Atlas fick den 14 augusti en reducerad signal om låg tillgänglighet för att analysera träningsplanens genomförbarhet. Inga mötestitlar eller kalenderdetaljer delades.

22.158 TEKNISK AUDIT

Teknisk audit kan dessutom visa:

- request identity,

- policyversion,

- package identity,

- agentversion,

- och integritetsreferens.

22.159 AUDIT FÅR INTE BLI NYTT MINNESARKIV

Auditloggen ska inte spara fulla privata payloads enbart för att bevisa att de användes.

22.160 INCIDENT

En Hermes-incident kan vara:

- fel tenant,

- fel användare,

- för bred kontext,

- data till otillåten modell,

- fortsatt åtkomst efter återkallande,

- felaktig radering,

- eller sammanfattning som förändrar betydelsen.

22.161 ALLVARLIG INCIDENT

Följande ska behandlas som allvarligt:

- annan användares minne i Arnold-kontext,

- Atlas får förbjuden GainPilot-data,

- extern modell får highly restricted data,

- eller raderad information återkommer i aktiv produkt.

22.162 INCIDENTSTOPP

Hermes ska kunna stoppa:

- en aktör,

- en capability,

- en dataklass,

- en extern modell,

- ett projekt,

- eller all tvärdomändelning.

GainPilots lokala grundfunktioner ska kunna fortsätta där det är säkert.

22.163 QUARANTINE

Misstänkta minnesposter eller paket ska kunna sättas i karantän.

De får då inte användas förrän:

- ägande,

- källa,

- scope,

- och integritet

har verifierats.

22.164 FELAKTIGT MINNE

Om ett felaktigt minne har påverkat beslut ska systemet kunna identifiera:

- vilka rekommendationer,

- program,

- meddelanden,

- och härledda minnen

som kan ha påverkats.

22.165 KONSEKVENSANALYS

En minneskorrigering eller incident ska kunna utlösa konsekvensanalys.

Exempel:

Felaktigt minne:

Användaren saknar skivstång.

Möjlig påverkan:

- flera programförslag,

- substitutionsrankning,

- och utrustningsprofil.

22.166 ROLLBACK

Hermes ska kunna återgå till tidigare:

- policy,

- kontextmall,

- retrievalmodell,

- minimeringsregel,

- eller minnesversion.

Rollback får inte återaktivera känd dataläcka.

22.167 POLICYVERSIONERING

Hermes-policies ska vara versionerade.

Det ska gå att förstå vilken policy som tillät eller nekade en transaktion.

22.168 SCHEMAVERSIONERING

Minnesposter och kontextpaket ska ha schemaversion.

Migrationer ska bevara:

- typ,

- scope,

- provenance,

- och användarval.

22.169 RETRIEVALVERSION

Retrievalalgoritmer och ranking ska versioneras.

En ändrad rankingmodell kan förändra vilken personlig information agenten ser.

22.170 SUMMARIZATION VERSION

Modellen som sammanfattar minne ska versioneras och testas.

En ny sammanfattningsmodell kan skapa:

- felaktiga inferenser,

- överdriven säkerhet,

- eller borttappade begränsningar.

22.171 POLICY SOM KOD

Betydelsefulla Hermes-regler ska där möjligt uttryckas som tekniskt validerbara policies.

Exempel:

- förbjuden dataklass till viss modell,

- tenantmatchning,

- do-not-share,

- approvalkrav,

- och retention.

22.172 PROMPT ÄR INTE POLICY

Hermes säkerhet får inte bygga på att en agentprompt säger:

Var försiktig med privat data.

Behörighet och minimering ska genomdrivas tekniskt.

22.173 DEFAULT DENY

När scope eller syfte är oklart ska Hermes normalt neka eller begära förtydligande.

Det ska inte anta bred åtkomst.

22.174 SÄKER FALLBACK

Om Hermes inte kan verifiera en tvärdomänförfrågan ska GainPilot:

- använda lokal domäninformation,

- fråga användaren,

- eller avstå.

Systemet ska inte kringgå Hermes för att uppgiften känns viktig.

22.175 DEGRADERAT LÄGE

Om Hermes är tillfälligt otillgängligt ska Arnold kunna använda:

- redan lokalt godkänd GainPilot-data,

- aktivt pass,

- och begränsade cacheade paket inom giltighet.

Ny tvärdomändelning ska pausas.

22.176 OFFLINE

Offlinepaket ska vara:

- krypterade,

- minimerade,

- tidsbegränsade,

- och bundna till rätt användare och enhet.

Alla minnen ska inte synkroniseras till varje enhet.

22.177 ENHETSSCOPE

Användaren ska kunna begränsa vilka minnen som får finnas på:

- mobil,

- dator,

- wearable,

- eller annan nod.

Wearable behöver normalt endast ett mycket litet operativt paket.

22.178 LOKAL RADERING

När en enhet tas bort eller låses ska lokala minnespaket kunna:

- återkallas,

- raderas,

- eller göras kryptografiskt otillgängliga.

22.179 SYNKRONISERING

Minnesändringar ska synkroniseras idempotent.

Samma korrigering ska inte skapa flera konfliktversioner på grund av retry.

22.180 UNKNOWN OUTCOME

När en minnesskrivning får okänt utfall ska systemet:

- verifiera om posten skapades,

- använda idempotency identity,

- och undvika dubbla minnen.

22.181 KONFLIKTER MELLAN ENHETER

Om två enheter ändrar samma minne ska systemet bevara:

- båda versionerna,

- tidsstämplar,

- källa,

- och användarens möjlighet att lösa konflikten.

22.182 SENASTE SKRIVNING VINNER INTE ALLTID

Last-write-wins är inte lämpligt för alla minnen.

Exempel:

- säkerhetsbegränsning,

- användarkorrigering,

- och professionell instruktion

kan kräva särskild konfliktpolicy.

22.183 PRESTANDA

Hermes ska leverera relevant kontext tillräckligt snabbt för användarflödet.

Aktivt pass ska inte vänta på omfattande global sökning.

22.184 LOKALA SNABBPaket

Vanliga GainPilot-flöden kan använda förkompilerade snabbpaket.

Exempel:

- dagens program,

- aktuella begränsningar,

- utrustning,

- och kommunikationsstil.

Paketet ska uppdateras när källminnet förändras.

22.185 KOSTNAD

Hermes ska ha kostnadsstyrning.

Systemet ska undvika:

- stora semantiska sökningar för enkla frågor,

- ombyggnad av alla embeddings i onödan,

- och stora modellkall för grundläggande minimering.

22.186 KONTEXTBUDGET

Varje agent eller capability ska ha kontextbudget.

Budgeten ska ta hänsyn till:

- risk,

- relevans,

- kostnad,

- latency,

- och modellgräns.

22.187 KONTEXTKOMPRESSION

Hermes kan komprimera kontext genom:

- strukturerade sammanfattningar,

- hierarkiska minnen,

- aktuell status plus referenser,

- och retrieval vid behov.

Kompression får inte radera kritiska undantag.

22.188 KRITISKA UNDANTAG

Följande ska inte tappas bort i sammanfattning:

- allergi,

- aktiv skada eller begränsning,

- do-not-share,

- låst användarval,

- och professionell instruktion.

22.189 MINNESPRIORITET

Hermes ska kunna prioritera:

1. Aktiva säkerhetsregler.

2. Användarens aktuella uttryckliga beslut.

3. Bekräftade stabila fakta.

4. Aktuella mål och begränsningar.

5. Relevanta historiska observationer.

6. Inferenser och hypoteser.

Inferens ska inte övertrumfa uttrycklig korrigering.

22.190 RECENCY OCH STABILITET

Senaste information är inte alltid mest tillförlitlig.

En tillfällig uppgift kan vara nyare än en stabil långsiktig preferens.

Hermes ska väga:

- aktualitet,

- typ,

- giltighet,

- och scope.

22.191 KONTEXTBALANS

För lite kontext kan ge dåliga rekommendationer.

För mycket kontext kan ge:

- integritetsrisk,

- irrelevant påverkan,

- högre kostnad,

- och sämre fokus.

Hermes ska optimera för tillräcklig, inte maximal, kontext.

22.192 TESTNING AV HERMES

Hermes ska ha en full teststrategi.

Den ska omfatta:

- enhetstester,

- policytester,

- kontraktstester,

- tenanttester,

- minimeringstester,

- retentionstester,

- raderingstester,

- och incidenttester.

22.193 TENANTTESTER

Tester ska verifiera att:

- Arnold för användare A inte får användare B:s data,

- Atlas inte får data från fel tenant,

- cache inte blandas,

- och vektorindex filtreras korrekt.

22.194 PROJEKTTESTER

Tester ska verifiera att GainPilot inte får:

- The Prompt-data,

- Familje-Stunden-data,

- eller andra projekts privata minne

utan explicit kontrakt.

22.195 SYFTESTESTER

Samma dataförfrågan ska kunna:

- beviljas för ett syfte,

- och nekas för ett annat.

Exempel:

Vikttrend för träningsprogression:

Möjligen tillåtet.

Vikttrend för marknadsföring:

Inte automatiskt tillåtet.

22.196 MINIMERINGSTESTER

Tester ska kontrollera att Hermes lämnar:

- tillgänglighetsfönster,

- inte full kalender,

- reducerad återhämtningssignal,

- inte full privat historik,

- och programstatus,

- inte all coachdialog.

22.197 DO-NOT-SHARE-TESTER

Tester ska verifiera att do-not-share blockerar:

- Atlas,

- coach,

- support,

- och externa modeller

enligt användarens val.

22.198 DO-NOT-INFER-TESTER

Systemet ska testas så att det inte skapar förbjudna inferenser från:

- träningsmönster,

- kostval,

- kalender,

- eller kommunikation.

22.199 GILTIGHETSTESTER

Utgångna paket och minnen ska inte användas.

Testet ska omfatta:

- tidszon,

- offlineenhet,

- återanslutning,

- och cache.

22.200 RADERINGSTESTER

Radering ska testas över:

- primär databas,

- cache,

- sökindex,

- embeddings,

- filer,

- härledda minnen,

- och aktiva paket.

22.201 BACKUPTESTER

Tester ska verifiera att raderad information:

- inte återgår till aktiv användning efter restore,

- och försvinner enligt retention.

22.202 KORRIGERINGSTESTER

När användaren korrigerar en preferens ska testet verifiera att:

- den gamla versionen inte används,

- härledda slutsatser omvärderas,

- och framtida Arnold-svar förändras.

22.203 PROVENANCE-TESTER

Alla betydelsefulla påståenden i kontextpaketet ska kunna spåras till:

- källpost,

- transformation,

- och policybeslut.

22.204 SUMMERINGSTESTER

Sammanfattningsmodellen ska testas för att inte:

- moralisera,

- skapa diagnoser,

- öka säkerhetsnivån,

- eller blanda fakta och inferens.

22.205 INJEKTIONSTESTER

Importerad text eller minnesinnehåll får inte kunna instruera Hermes att:

- bredda scope,

- ändra policy,

- eller skicka secrets.

Minnesinnehåll ska behandlas som data.

22.206 EXFILTRATIONSTESTER

Tester ska simulera en agent som försöker:

- söka bredare än uppgiften,

- skicka data till extern modell,

- eller inkludera privat information i output.

22.207 AGENTDRIFTSTESTER

Systemet ska upptäcka om en ny agentversion:

- begär större paket,

- använder mer känslig data,

- eller återanvänder kontext oftare.

22.208 PRESTANDATESTER

Hermes ska testas för:

- aktiva pass,

- många samtidiga användare,

- stora minneshistoriker,

- och komplexa tenantstrukturer.

22.209 FAILURE TESTS

Tester ska omfatta:

- Hermes otillgängligt,

- policytjänst otillgänglig,

- cachefel,

- korrupt index,

- timeout,

- unknown outcome,

- och partiell radering.

22.210 SHADOW MODE

Nya retrieval-, minimerings- och sammanfattningsmodeller ska kunna köras i shadow mode.

De får då skapa alternativa paket utan att leverera dem till aktiva agenter.

22.211 PARALLELL JÄMFÖRELSE

Ny och aktiv Hermes-version ska jämföras för:

- relevans,

- datamängd,

- policyefterlevnad,

- känslig informationsandel,

- kostnad,

- och latency.

22.212 CANARY

Ny Hermes-logik ska först aktiveras för:

- intern tenant,

- lågriskdataklasser,

- eller begränsad capability.

Hälsorelaterad och highly restricted data ska inte vara första canaryområde.

22.213 ROLLBACK

Hermes ska kunna rulla tillbaka:

- policy,

- retrieval,

- ranking,

- sammanfattning,

- paketmall,

- och modellrouting.

Rollback ska bevara korrigeringar och raderingar.

22.214 DRIFTÖVERVAKNING

Hermes ska övervaka:

- genomsnittlig paketstorlek,

- nekade förfrågningar,

- data per agent,

- känsliga dataklasser,

- externa modellöverföringar,

- korrigeringar,

- och raderingsfel.

22.215 MINNESKVALITET

Relevanta kvalitetsmått kan vara:

- felaktiga minnen,

- stale-memory rate,

- användarkorrigeringar,

- otillåtna inferenser,

- överhämtning,

- och missade kritiska begränsningar.

22.216 INTEGRITETSMÅTT

Integritetsmått kan vara:

- onödigt delade fält,

- antal fulla paket där reducerad signal räckte,

- do-not-share-blockeringar,

- felaktig modellrouting,

- och raderingsfullständighet.

22.217 ANVÄNDARNYTTA

Hermes ska inte optimeras endast för minsta möjliga data.

För hård minimering kan göra Arnold:

- förvirrad,

- repetitiv,

- eller oförmögen att ge relevant hjälp.

Målet är minsta tillräckliga kontext.

22.218 FÖRKLARBAR NEKNING

När Hermes nekar en begäran ska systemet kunna förklara:

- vilket scope som saknas,

- vilken policy som blockerar,

- om användarapproval kan lösa det,

- eller om åtkomsten aldrig är tillåten.

22.219 ARNOLDS SVAR VID NEKNING

Arnold kan säga:

Jag kan inte läsa din fullständiga kalender. Jag kan däremot be om en reducerad tillgänglighetssignal om du godkänner det.

Han ska inte antyda att systemet är trasigt när policyn fungerar som avsett.

22.220 ATLAS SVAR VID NEKNING

Atlas ska kunna acceptera att individdata inte är tillgänglig och använda:

- aggregerad data,

- reducerad signal,

- eller osäkerhetsmarkering.

22.221 MÄNSKLIGT ANSVAR

Hermes policies ska ha mänskliga ägare.

Ägarskapet ska omfatta:

- dataklassificering,

- minnesmodell,

- retention,

- incidenter,

- och förändringsgodkännande.

22.222 INGEN SJÄLVMODIFIERING

Hermes eller dess agenter får inte själva:

- bredda åtkomst,

- ändra dataklass,

- sänka minimering,

- förlänga retention,

- eller ta bort användarens do-not-share.

22.223 FÖRBÄTTRINGSFÖRSLAG

Atlas eller Hermes kan föreslå förändringar.

Exempel:

Många Arnold-uppgifter saknar relevant utrustningsinformation.

Förslaget ska genomgå:

- behovsanalys,

- integritetsbedömning,

- scope,

- implementation,

- tester,

- och review.

22.224 KONTROLLERAD HERMESUTVECKLING

Canonical utvecklingsflöde ska vara:

Signal

→ analys

→ dataskyddsbedömning

→ hotmodell

→ policyförslag

→ godkänt scope

→ separat branch

→ implementation

→ policytester

→ tenanttester

→ raderings- och retentionstester

→ shadow mode

→ pull request

→ säkerhets- och integritetsreview

→ canary

→ kontrollerad merge

→ uppföljning.

22.225 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för Hermes och isolerade minnesdomäner.

**Kontrakt GP-405 — Hermes är en styrd gateway**

Hermes ska kontrollera minnes- och kontextöverföring mellan domäner och får inte reduceras till ett obegränsat globalt minne eller en generell söktjänst.

**Kontrakt GP-406 — Domänen äger sitt råminne**

GainPilot och andra Omnira-domäner ska äga sina egna minnen, medan Hermes förmedlar godkänd åtkomst genom kontrakt.

**Kontrakt GP-407 — Minnesdomäner ska vara isolerade**

Tenant-, användar-, projekt-, domän-, miljö-, cache-, fil-, kö- och indexisolering ska genomdrivas genom hela lagrings- och retrievalkedjan.

**Kontrakt GP-408 — Syfte före minnesåtkomst**

Varje Hermes-transaktion ska ha ett specifikt syfte, capability och mottagare innan data hämtas.

**Kontrakt GP-409 — Minsta tillräckliga kontext**

Hermes ska leverera minsta mängd och precision av information som fortfarande gör uppgiften säker och användbar.

**Kontrakt GP-410 — Reducerad signal före rådata**

Atlas, Arnold och andra domäner ska använda aggregerade eller reducerade signaler när full källdata inte krävs.

**Kontrakt GP-411 — Kontextpaket ska vara tids- och uppgiftsbundna**

Paket ska ha identitet, syfte, giltighet, retention, förbjudna användningar och får inte automatiskt bli mottagarens långtidsminne.

**Kontrakt GP-412 — Fakta och inferens ska separeras**

Minnesposter och kontextpaket ska tydligt skilja användarbekräftade fakta, observationer, preferenser, inferenser, hypoteser, beslut och regler.

**Kontrakt GP-413 — Varje minne ska ha provenance och tid**

Betydelsefulla minnesposter ska ha källa, skapandetid, giltighet, confidence och versionsstatus.

**Kontrakt GP-414 — Känsliga inferenser kräver starkt skydd**

GainPilot får inte automatiskt skapa eller sprida känsliga slutsatser om hälsa, psykiskt tillstånd, relationer eller andra privata attribut.

**Kontrakt GP-415 — Användaren styr minnesscope**

Användaren ska kunna välja om ett minne är privat, projektspecifikt, delat, tidsbegränsat, låst, do-not-share, do-not-store eller do-not-infer.

**Kontrakt GP-416 — Minneskrivning ska vara kontrollerad**

Persistent minne ska skapas genom typning, klassificering, scope, riskbedömning, bekräftelse där det krävs, versionering och audit.

**Kontrakt GP-417 — Korrigering ska propageras**

När användaren rättar ett minne ska aktiva poster, härledda inferenser, index, cache och framtida beslut uppdateras enligt spårbar policy.

**Kontrakt GP-418 — Radering ska vara fullständig och verifierbar**

Radering ska omfatta aktiv data, embeddings, index, cache, härledda poster och paket samt hantera backups genom dokumenterad retention.

**Kontrakt GP-419 — Semantisk relevans är inte behörighet**

Vektorsökning och ranking får endast ske efter hårda filter för tenant, användare, domän, dataklass, syfte och giltighet.

**Kontrakt GP-420 — Sammanfattning får inte skapa ny personlig sanning**

Hermes ska bevara skillnaden mellan källfakta och tolkning och får inte hallucinera motiv, diagnoser, identiteter eller stabila preferenser.

**Kontrakt GP-421 — Privat personalisering är inte modellträning**

Arnolds användarspecifika lärande ska hållas separat från plattformslärande, populationsanalys och extern eller intern grundmodellträning.

**Kontrakt GP-422 — Extern modellåtkomst ska vara explicit**

Data får endast lämnas till en extern modell när dataklass, leverantör, region, retention, användarmandat och uppgiftens nödvändighet tillåter det.

**Kontrakt GP-423 — Återkallande ska stoppa framtida åtkomst**

När användaren återkallar delning eller mandat ska nya läsningar stoppas och aktiva paket och uppgifter hanteras säkert.

**Kontrakt GP-424 — Hermes ska vara default deny**

Oklart syfte, saknat scope, fel tenant, otillräcklig authority eller okänd policy ska leda till nekad eller förtydligad förfrågan, inte bred åtkomst.

**Kontrakt GP-425 — Hermes ska fungera i degraderat läge utan policygenväg**

GainPilot får använda giltig lokal domänkontext när Hermes är otillgängligt men får inte skapa ny tvärdomändelning eller kringgå minnesgränsen.

**Kontrakt GP-426 — Minnesbeslut ska vara observerbara**

Läsning, skrivning, minimering, delning, korrigering, radering och nekning ska kunna förklaras och auditeras utan att full privat payload lagras.

**Kontrakt GP-427 — Hermes får inte självmodifiera skyddet**

Hermes, Atlas, Arnold och andra agenter får inte själva bredda scope, sänka dataklass, ta bort användarlås eller förlänga retention i produktion.

**Kontrakt GP-428 — Branch- och integritetsstyrd Hermesutveckling**

Förändringar av minnesmodell, retrieval, minimering, retention, radering, modellrouting och policy ska ske genom separat branch, hotmodellering, tester, review, shadow mode och kontrollerad utrullning.

22.226 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- bygga ett enda globalt minne som alla agenter kan söka,

- behandla Hermes som en vanlig vektordatabas,

- låta Atlas läsa full GainPilot-historik som standard,

- låta Arnold läsa andra projekts privata minnen,

- anta att samma användare innebär samma scope,

- låta coacher eller organisationer äga individens fullständiga minne,

- kopiera rådata mellan domäner när reducerad signal räcker,

- använda full kalender när tillgänglighetsfönster räcker,

- använda exakta kroppsmått när trendkategori räcker,

- spara fulla kontextpaket som globalt minne,

- återanvända paket för nytt syfte,

- låta utgångna paket användas,

- skicka highly restricted data till extern modell utan särskild kontroll,

- ge varje modell samma användarkontext,

- blanda promptkontext och persistent minne,

- spara allt användaren säger,

- skapa preferens från ett enstaka beteende,

- presentera inferens som fakta,

- lagra hypotes som stabil sanning,

- skapa psykologiska eller medicinska profiler från träningsdata,

- göra känsliga inferenser utan bekräftelse,

- låta nytt faktum automatiskt radera historisk version,

- använda last-write-wins för alla konflikter,

- låta gammalt minne styra aktuella beslut utan aktualitetskontroll,

- låta osäker sensorinformation bli permanent sanning,

- skriva minne utan provenance,

- skriva minne utan användar- eller projektscope,

- flytta GainPilot-minnen till global profil automatiskt,

- ignorera do-not-share,

- ignorera do-not-store,

- ignorera do-not-infer,

- låta låst minne ändras av automatisk inferens,

- lagra tillfälliga uppgifter utan utgångstid,

- behålla alla röstfiler permanent,

- använda progressionsbilder för modellträning utan separat grund,

- behandla konversationshistorik som identisk med minne,

- använda användarens privatdata för dold modellträning,

- kalla pseudonymiserad data anonymiserad,

- skapa populationsinsikt från enskild användare,

- använda för små grupper där återidentifiering är möjlig,

- ge support fri Hermes-sökning,

- använda break-glass som normal åtkomst,

- låta specialistagent få full profil,

- skapa ett universellt användarpaket för alla uppgifter,

- låta kontextkompilatorn skapa behörighet,

- överhämta data för säkerhets skull,

- göra extern integrationsdata direkt canonical,

- söka privata meddelanden för motivationsanalys,

- söka fritt i privata filer,

- förlita sig enbart på applikationsfilter för tenantisolering,

- dela cache mellan användare,

- lägga flera tenants i samma oscopeade vektorindex,

- låta gamla kömeddelanden återaktivera återkallad åtkomst,

- logga fulla privata minnesposter,

- lagra full payload i audit,

- återställa raderad data till aktiv produkt efter backuprestore,

- lämna embeddings efter raderad källa,

- ignorera härledda minnen vid korrigering,

- kräva att användaren hittar varje intern kopia själv,

- låta minnesincident påverka framtida beslut utan konsekvensanalys,

- rulla tillbaka till policy med känd dataläcka,

- ändra retention utan versionering,

- behandla promptinstruktion som åtkomstkontroll,

- tillåta vid oklart scope,

- kringgå Hermes när systemet är offline,

- synkronisera alla känsliga minnen till alla enheter,

- använda senaste skrivning som universell konfliktlösning,

- komprimera bort säkerhetsbegränsningar,

- optimera enbart för minsta datamängd så att tjänsten blir oanvändbar,

- eller ändra Hermes direkt i main eller produktion utan branch, tester, integritetsreview och kontrollerad utrullning.

22.227 KANONISKA BESLUT FRÅN KAPITEL 22

Följande beslut etableras:

1. Hermes ska vara Omniras styrda minnes- och kontextgateway.

2. Hermes ska inte vara ett obegränsat globalt minne.

3. Varje domän ska äga sitt råminne.

4. GainPilot ska ha en isolerad minnesdomän.

5. Omnira kan ha en begränsad delad användarprofil.

6. Atlas ska ha strategiskt minne separat från individuell GainPilot-data.

7. Privat användardata ska stanna i rätt domän.

8. Hermes ska ha en canonical transaktionsmodell.

9. Läsning, skrivning, korrigering och radering ska vara separata transaktioner.

10. Varje transaktion ska ha identifierad aktör.

11. Effektiv behörighet ska använda den mest restriktiva policyn.

12. Varje åtkomst ska ha uttryckligt syfte.

13. Data får inte återanvändas för nytt syfte automatiskt.

14. Minnesåtkomst ska vara capabilitybunden.

15. Data ska klassificeras.

16. Hälsorelaterad data ska ha förhöjt skydd.

17. Särskilt känslig data ska kunna klassificeras som highly restricted.

18. Hermes ska minimera data.

19. Minimering ska kunna ske per fält.

20. Minimering ska kunna ske per tidsperiod.

21. Minimering ska kunna reducera precision.

22. Detaljer ska kunna ersättas med kategorier.

23. Hermes ska kunna skapa aggregat.

24. Pseudonymisering ska inte förväxlas med anonymisering.

25. Reducerade signaler ska vara strukturerade.

26. Reducerad signal ska inte ge automatisk rådataåtkomst.

27. Hermes ska skapa tidsbegränsade kontextpaket.

28. Kontextpaket ska ha unik identitet.

29. Paket ska ha explicit syfte.

30. Paket ska ha giltighetstid.

31. Aktiv kontext ska skiljas från audit och långtidsminne.

32. Paket ska kunna ange förbjudna användningar.

33. Extern modellåtkomst ska kontrolleras.

34. Känslig behandling ska kunna ske lokalt.

35. Modeller ska få olika kontext efter behov.

36. Promptkontext ska skiljas från minne.

37. Sessionsminne ska löpa ut.

38. Arbetsminne ska vara uppgiftsbundet.

39. Episodiskt minne ska beskriva händelser.

40. Semantiskt minne ska beskriva stabilare påståenden.

41. Preferens ska skiljas från observerat val.

42. Begränsningar ska ha typ och giltighet.

43. Beslut ska kunna lagras.

44. Beslutsmotivering ska kunna bevaras.

45. Inferens ska märkas som inferens.

46. Hypotes ska hållas svag och verifierbar.

47. Observation ska kunna lagras utan överdriven tolkning.

48. Fakta ska ha tillräcklig grund.

49. Fakta ska kunna bli inaktuella.

50. Minnesposter ska ha typ.

51. Minnesposter ska ha provenance.

52. Källkvalitet ska påverka confidence.

53. Minnesposter ska ha relevanta tidsfält.

54. Giltighetsstatus ska påverka användning.

55. Inferenser ska kunna decayas.

56. Stale minnen ska flaggas.

57. Confidence ska baseras på verkliga signaler.

58. Användarbekräftelse ska markeras.

59. Systemverifiering ska ha källa.

60. Konflikter mellan minnen ska representeras.

61. Konflikter ska lösas spårbart.

62. Ersatta minnen ska behålla relation till tidigare version.

63. Betydelsefulla minnen ska versioneras.

64. Användaren ska kunna se aktiv och historisk vy.

65. Persistent skrivning ska följa kontrollerat flöde.

66. Agenter ska kunna skapa minneskandidater.

67. Lågriskfakta ska kunna sparas automatiskt.

68. Känsliga inferenser ska kräva starkare skydd.

69. GainPilot ska inte spara allt.

70. Minnesnytta ska vägas mot integritetsrisk.

71. Användaren ska styra vad som sparas och delas.

72. Minnesposter ska kunna ha olika delningsscope.

73. Känsliga minnen ska vara privata som standard.

74. Projektscope ska kunna begränsas.

75. Global profil ska användas sparsamt.

76. Minnen får inte automatiskt uppgraderas till globalt scope.

77. Minnesläsning ska följa ett kontrollerat flöde.

78. Hermes ska kombinera strukturerad och semantisk retrieval.

79. Semantisk sökning ska vara tenant- och användarisolerad.

80. Embeddings ska behandlas som potentiellt känsliga.

81. Hårda metadatafilter ska ske före semantik.

82. Relevans ska inte skapa behörighet.

83. Retrieval ska ha provenance.

84. Kontextsammanställning ska bevara minnestyper.

85. Sammanfattning får inte skapa psykologiska eller moraliska slutsatser.

86. Sammanfattade påståenden ska ha källreferens.

87. Användaren ska kunna korrigera minnen.

88. Korrigering ska ha definierad räckvidd.

89. Korrigering ska propageras till kopior och index.

90. Härledda minnen ska omvärderas.

91. Användaren ska kunna radera minnen.

92. Radering ska vara en verifierad process.

93. Soft delete ska stoppa vanlig användning.

94. Hard delete ska ske efter relevant process.

95. Backupretention ska vara begränsad.

96. Embeddings ska hanteras vid radering.

97. Härledda signaler ska kunna omberäknas.

98. Pseudonymiserad data ska inte behandlas som anonym.

99. Delning ska kunna återkallas.

100. Aktiva uppgifter ska hanteras vid återkallande.

101. Användaren ska kunna exportera minnen.

102. GainPilot ska ha en begriplig minnesvy.

103. Avancerad provenancevy ska kunna erbjudas.

104. Minnen ska kunna låsas.

105. Låsning ska skydda mot automatisk ändring.

106. Användaren ska kunna ange do-not-infer.

107. Användaren ska kunna ange do-not-share.

108. Användaren ska kunna ange do-not-store.

109. Tillfälliga minnen ska löpa ut automatiskt.

110. Varje minnestyp ska ha retention.

111. Retention ska balansera nytta och risk.

112. Röstdata ska normalt raderas efter uppgift.

113. Bilder och video ska ha separat policy.

114. Dialoghistorik och minne ska hållas isär.

115. Dold modellträning ska förbjudas.

116. Personalisering ska vara användarscopead.

117. Plattformslärande ska ha separat governance.

118. Populationsinsikter ska kräva aggregering.

119. Små grupper ska skyddas mot återidentifiering.

120. Sällsynta kombinationer ska riskbedömas.

121. Coachdelning ska vara granulär.

122. Coachanteckningar ska ha tydligt ägande.

123. Avslutad coachrelation ska stoppa åtkomst.

124. Organisationer ska normalt endast få aggregerad information.

125. Supportåtkomst ska vara ärendebunden.

126. Känslig åtkomst ska kunna vara just-in-time.

127. Break-glass ska vara en särskild incidentprocess.

128. Atlas ska normalt få reducerade signaler.

129. Arnold ska normalt få reducerad extern kontext.

130. Specialistagenter ska få snävare paket.

131. Kontext ska skapas per uppgift.

132. Hermes ska fungera som kontextkompilator.

133. Kontextkompilering får inte skapa behörighet.

134. Vanliga capabilities ska kunna ha kontextmallar.

135. Kontextmallar ska kunna reduceras dynamiskt.

136. Överhämtning ska kunna upptäckas.

137. Extern dataöverföring ska ha kontrakt.

138. Datautgång ska registreras.

139. Dataingång ska ha provenance.

140. Importerad data ska inte automatiskt bli minne.

141. Sensordata ska behandlas som observation.

142. Kalenderdata ska minimeras.

143. Plats ska reduceras till kategori när möjligt.

144. Privata meddelanden ska inte vara generell GainPilot-källa.

145. Privata bilder och filer ska kräva användarinitiering.

146. Isolering ska genomdrivas i hela lagringskedjan.

147. Tenantidentitet ska krävas.

148. Användare ska isoleras inom tenant.

149. Projektminnen ska isoleras.

150. Miljöer ska isoleras.

151. Cache ska vara scopead.

152. Index ska vara scopeat och raderingsbart.

153. Köer ska bära scope och expiration.

154. Loggar ska minimera minnesinnehåll.

155. Tracing ska använda referenser.

156. Minnestransaktioner ska auditeras.

157. Användaren ska få begriplig audit.

158. Teknisk audit ska finnas.

159. Audit ska inte bli ett nytt privat dataarkiv.

160. Hermes ska ha incidentklassificering.

161. Fel användare eller modell ska behandlas som allvarlig incident.

162. Hermes ska kunna stoppa åtkomst granulärt.

163. Misstänkt data ska kunna sättas i karantän.

164. Felaktigt minnes påverkan ska kunna spåras.

165. Korrigeringar ska kunna utlösa konsekvensanalys.

166. Hermes ska stödja rollback.

167. Policyer ska versioneras.

168. Scheman ska versioneras.

169. Retrievalmodeller ska versioneras.

170. Sammanfattningsmodeller ska versioneras.

171. Policies ska där möjligt vara kodifierade.

172. Prompttext ska inte vara säkerhetsgräns.

173. Hermes ska använda default deny.

174. Säker fallback ska finnas.

175. GainPilot ska kunna fungera degraderat utan policygenväg.

176. Offlinepaket ska vara krypterade och tidsbegränsade.

177. Minnen ska kunna scopeas per enhet.

178. Lokala paket ska kunna återkallas.

179. Synkronisering ska vara idempotent.

180. Unknown outcome ska verifieras.

181. Enhetskonflikter ska bevaras.

182. Last-write-wins ska inte vara universell policy.

183. Hermes ska stödja snabba användarflöden.

184. Förkompilerade snabbpaket ska kunna användas.

185. Kostnad ska optimeras.

186. Kontextbudget ska finnas.

187. Kontext ska kunna komprimeras.

188. Kritiska undantag får inte komprimeras bort.

189. Säkerhetsregler och uttryckliga beslut ska ha hög prioritet.

190. Aktualitet och stabilitet ska vägas separat.

191. Minsta tillräckliga kontext ska vara målet.

192. Hermes ska ha full teststrategi.

193. Tenantisolering ska testas.

194. Projektisolering ska testas.

195. Syftesbegränsning ska testas.

196. Minimering ska testas.

197. Do-not-share ska testas.

198. Do-not-infer ska testas.

199. Giltighet och expiration ska testas.

200. Radering ska testas i alla lager.

201. Backuprestore ska testas mot raderad data.

202. Korrigering ska testas.

203. Provenance ska testas.

204. Sammanfattning ska testas för hallucinerade inferenser.

205. Minnesinjektion ska testas.

206. Dataexfiltration ska testas.

207. Agenters kontextdrift ska övervakas.

208. Prestanda ska testas.

209. Fel- och degraderade tillstånd ska testas.

210. Ny Hermes-logik ska köras i shadow mode.

211. Versioner ska jämföras parallellt.

212. Canary ska börja med lågriskdata.

213. Hermes ska kunna rullas tillbaka.

214. Drift ska övervakas.

215. Minneskvalitet ska mätas.

216. Integritet ska mätas.

217. Användarnytta ska vägas mot minimering.

218. Nekningar ska kunna förklaras.

219. Arnold ska kunna förklara minnesbegränsning.

220. Atlas ska kunna arbeta med reducerat underlag.

221. Hermes-policy ska ha mänsklig ägare.

222. Hermes får inte självmodifiera sitt skydd.

223. Förbättringsförslag ska följa utvecklingsprocess.

224. Hermesförändringar ska ske på separat branch.

225. Integritets-, säkerhets- och raderingstester ska krävas.

226. GainPilot ska få delad intelligens utan delat råminne.

22.228 IMPLEMENTERINGSORDNING

Hermes och GainPilots minnesdomäner ska implementeras stegvis.

Fas 1 — Minnesdomänregister

Implementera:

- domain identity,

- owner,

- tenant,

- dataklasser,

- syften,

- retention,

- och tillåtna relationer.

Fas 2 — GainPilot-minnesschema

Implementera:

- fact,

- preference,

- constraint,

- observation,

- inference,

- hypothesis,

- decision,

- rationale,

- goal,

- och policy reference.

Fas 3 — Provenance och tid

Implementera:

- source,

- created_at,

- observed_at,

- effective_from,

- valid_until,

- last_confirmed,

- confidence,

- och status.

Fas 4 — Scope

Implementera:

- tenant,

- user,

- project,

- domain,

- capability,

- sharing scope,

- och device scope.

Fas 5 — Hermes requestmodell

Implementera:

- requesting actor,

- purpose,

- capability,

- requested data,

- temporal scope,

- detail level,

- destination,

- och approval reference.

Fas 6 — Policy engine

Implementera:

- default deny,

- tenantmatchning,

- usermatchning,

- dataklass,

- authority,

- purpose limitation,

- do-not-share,

- och model restrictions.

Fas 7 — Strukturerad retrieval

Implementera:

- metadatafilter,

- tidsfilter,

- aktiva poster,

- giltighetskontroll,

- och provenance.

Fas 8 — Semantisk retrieval

Implementera först efter hårda filter:

- embeddings,

- tenant- och användarisolering,

- relevans,

- top-k,

- och raderingsreferenser.

Fas 9 — Kontextpaket

Implementera:

- package identity,

- purpose,

- facts,

- constraints,

- preferences,

- reduced signals,

- provenance,

- expiration,

- och prohibited uses.

Fas 10 — Minimering

Implementera:

- field minimization,

- temporal minimization,

- precision reduction,

- categorical reduction,

- och aggregation.

Fas 11 — Arnoldpaket

Implementera mallar för:

- aktivt pass,

- programplanering,

- substitutionsmotor,

- kostplanering,

- progression,

- och kommunikation.

Fas 12 — Atlaspaket

Implementera:

- domänhealth,

- produktstatus,

- aggregerade användarsignaler,

- kostnad,

- risk,

- och strategiska reducerade signaler.

Fas 13 — Minnesskrivning

Implementera:

- candidate memory,

- automatic low-risk write,

- confirmation,

- classification,

- scope,

- versioning,

- och audit.

Fas 14 — Användarens minnesvy

Implementera:

- vad Arnold minns,

- varför,

- scope,

- giltighet,

- redigera,

- låsa,

- göra privat,

- och radera.

Fas 15 — Korrigering

Implementera:

- versionering,

- replacement relation,

- propagation,

- derived-memory review,

- cache invalidation,

- och future-decision update.

Fas 16 — Radering

Implementera:

- soft delete,

- hard delete,

- cache,

- index,

- embeddings,

- derived data,

- aktiva paket,

- och verifiering.

Fas 17 — Användarkontroller

Implementera:

- do-not-share,

- do-not-store,

- do-not-infer,

- memory lock,

- temporary memory,

- och expiry.

Fas 18 — Delad användarprofil

Implementera endast:

- namn,

- språk,

- generell kommunikationsstil,

- tidszon,

- och uttryckligt godkända globala preferenser.

Fas 19 — Tvärdomänsignaler

Implementera:

- kalenderns tillgänglighet,

- godkänd övergripande arbetsbelastning,

- och andra reducerade signaler

utan full källdata.

Fas 20 — Coachdelning

Implementera:

- valda datatyper,

- tidsbegränsning,

- användarapproval,

- coachanteckning,

- återkallande,

- och avslutad relation.

Fas 21 — Extern modellrouting

Implementera:

- dataklass,

- leverantör,

- region,

- retention,

- lokal fallback,

- och förbjudna datatyper.

Fas 22 — Offline och enheter

Implementera:

- encrypted local package,

- device binding,

- expiration,

- lokal radering,

- synkronisering,

- och konfliktlösning.

Fas 23 — Audit

Implementera:

- användarvänlig delningshistorik,

- teknisk transaktionsaudit,

- policyversion,

- och minimerad loggning.

Fas 24 — Incidenthantering

Implementera:

- quarantine,

- capability stop,

- model stop,

- tenant stop,

- consequence analysis,

- och återstartsprocess.

Fas 25 — Testsvit

Implementera:

- tenanttester,

- projekttester,

- syftestester,

- minimeringstester,

- raderingstester,

- backuptester,

- injectionstester,

- och exfiltrationstester.

Fas 26 — Shadow mode

Implementera parallell utvärdering av:

- retrieval,

- minimering,

- ranking,

- sammanfattning,

- och kontextpaket.

Fas 27 — Canary och rollback

Implementera:

- intern tenant,

- lågriskdataklass,

- användningsmått,

- integritetsmått,

- stoppregel,

- och säker rollback.

Fas 28 — Plattformslärande

Implementera först efter separat governance:

- aggregering,

- minsta gruppstorlek,

- anonymiseringsbedömning,

- fairness,

- och tydlig separation från användarminne.

Fas 29 — Full Hermes-governance

Implementera:

- policyägare,

- periodisk review,

- retentionrevision,

- modellregister,

- leverantörskontroll,

- incidentövningar,

- och förbjuden självmodifiering.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- schema- och kontraktstester,

- policytester,

- tenant- och användarisoleringstester,

- integritetstester,

- raderings- och retentionstester,

- säkerhetstester,

- injection- och exfiltrationstester,

- prestandatest,

- shadow mode,

- pull request,

- kvalificerad integritets- och säkerhetsreview,

- canary,

- kontrollerad merge,

- och resultatuppföljning.

22.229 FRAMGÅNGSKRITERIER

Kapitel 22:s vision är framgångsrikt realiserad när:

- GainPilot har en egen isolerad minnesdomän,

- Hermes fungerar som gateway och inte som öppet globalt minne,

- rådata stannar hos den ägande domänen,

- alla minnestransaktioner har identifierad aktör och syfte,

- tenant och användare verifieras före retrieval,

- capability och authority kontrolleras,

- oklara förfrågningar nekas,

- minsta tillräckliga data lämnas ut,

- full kalender kan ersättas med tillgänglighetssignal,

- exakt kroppsinformation kan ersättas med relevant trend,

- Atlas normalt får aggregerade eller reducerade signaler,

- Arnold inte får andra projekts rådata,

- specialistagenter får snäva uppgiftspaket,

- kontextpaket har identitet och giltighet,

- paket inte automatiskt blir långtidsminne,

- förbjudna användningar kan uttryckas,

- extern modellrouting följer dataklass och mandat,

- promptkontext och persistent minne hålls åtskilda,

- facts, observations, preferences, inferences och hypotheses skiljs,

- användarbekräftade uppgifter markeras,

- varje minnespost har provenance,

- minnen har aktualitet och giltighet,

- stale minnen kan ombekräftas,

- inferenser kan försvagas över tid,

- konflikter mellan minnen synliggörs,

- nya minnen inte tyst skriver över historik,

- minneskandidater kan godkännas eller avvisas,

- känsliga inferenser inte skapas automatiskt,

- Arnold inte sparar allt användaren säger,

- användaren kan välja privat eller delat scope,

- GainPilot-minnen inte flyttas globalt automatiskt,

- användaren kan låsa minnen,

- do-not-infer fungerar,

- do-not-share fungerar,

- do-not-store fungerar,

- tillfälliga minnen löper ut,

- minnesläsning använder hårda filter före semantisk sökning,

- embeddings är tenant- och användarisolerade,

- semantisk relevans inte skapar behörighet,

- retrieval visar provenance,

- sammanfattningar inte skapar nya personliga slutsatser,

- användaren kan rätta ett minne,

- korrigering propageras till härledda poster och index,

- användaren kan radera en post eller kategori,

- radering omfattar cache, embeddings och sökindex,

- backupretention är dokumenterad,

- raderad information inte återkommer efter restore,

- användaren kan återkalla Atlas-, coach- och integrationsdelning,

- återkallande stoppar nya läsningar,

- användaren kan exportera minnesdata,

- GainPilot visar vad Arnold minns,

- användaren kan se när Atlas fick en reducerad signal,

- coachdelning är granulär och tidsbegränsad,

- supportåtkomst är ärendebunden,

- break-glass endast används vid verklig incident,

- externa system får spårbar dataöverföring,

- sensordata behandlas som observation,

- privata meddelanden inte används för GainPilot-profilering,

- privata filer inte söks utan användarinitiering,

- isolering finns i databas, filer, cache, index, köer och backups,

- utvecklings- och produktionsminnen är separerade,

- loggar inte innehåller fulla privata paket,

- audit är begriplig utan att skapa nytt privat arkiv,

- fel användare eller tenant behandlas som allvarlig incident,

- misstänkt data kan sättas i karantän,

- felaktiga minnen kan konsekvensanalyseras,

- policies och scheman är versionerade,

- sammanfattnings- och retrievalmodeller kan rullas tillbaka,

- prompttext inte är enda skyddet,

- Hermes använder default deny,

- GainPilot fungerar lokalt när Hermes är otillgängligt,

- ny tvärdomändelning stoppas i degraderat läge,

- lokala paket är krypterade och tidsbegränsade,

- enhetsåtkomst kan återkallas,

- synkronisering är idempotent,

- unknown outcome verifieras,

- konflikter mellan enheter inte tyst skrivs över,

- kontextleverans är tillräckligt snabb för aktiva pass,

- kritiska säkerhetsbegränsningar inte komprimeras bort,

- Hermes har full testsvit,

- tenant-, projekt-, policy-, minimerings- och raderingstester finns,

- injection och exfiltration testas,

- nya Hermesversioner körs i shadow mode,

- canary börjar med låg risk,

- rollback inte återinför känd läcka,

- minneskvalitet och integritet övervakas,

- användarnytta bevaras,

- policynekningar kan förklaras,

- Hermes har mänsklig ägare,

- Hermes och agenter inte kan självmodifiera skyddet,

- privat personalisering hålls separat från plattformslärande,

- dold modellträning inte sker,

- och alla Hermesförändringar genomförs genom separat branch, tester, integritetsreview, shadow mode och kontrollerad utrullning.

22.230 SAMMANFATTNING

GainPilot ska kunna minnas användaren.

Det betyder inte att hela Omnira ska få veta allt om användaren.

Arnold ska kunna använda relevant information om:

- mål,

- program,

- träningshistorik,

- kostpreferenser,

- utrustning,

- begränsningar,

- kommunikationsstil,

- och tidigare GainPilot-beslut.

Denna information ska normalt stanna i GainPilot-minnesdomänen.

Atlas ska kunna förstå GainPilot på en bredare nivå.

Atlas kan behöva veta:

- att ett program har låg genomförbarhet,

- att en produktfunktion skapar återkommande friktion,

- att kostnaden ökar,

- att en agentmodell ger fler korrigeringar,

- eller att ett projektberoende påverkar roadmapen.

Atlas behöver normalt inte få:

- full träningslogg,

- exakta kroppsmått,

- privat kosthistorik,

- progressionsbilder,

- eller fulla Arnold-dialoger.

Hermes ska göra denna separation möjlig.

Hermes ska inte vara ett öppet globalt minne.

Hermes ska vara en gateway som frågar:

- Vem begär informationen?

- För vilken användare?

- Inom vilken tenant?

- Från vilken domän?

- För vilket syfte?

- Vilken capability används?

- Vilka datatyper krävs?

- Hur mycket precision behövs?

- Vilken tidsperiod är relevant?

- Får data skickas till den aktuella modellen?

- Hur länge får kontexten användas?

- Får resultatet sparas?

- Och vilka användningar är förbjudna?

Hermes ska sedan skapa ett minimerat kontextpaket.

Exempel:

Arnold behöver anpassa nästa veckas träningsplan.

Hermes kan ge:

- aktuell plan,

- användarens godkända träningsmål,

- aktiva begränsningar,

- tillgängliga tidsfönster,

- och tidigare planeringspreferenser.

Hermes behöver inte ge:

- hela kalendern,

- privata mötestitlar,

- meddelanden,

- andra projekts dokument,

- eller orelaterad verksamhetsinformation.

Atlas behöver analysera varför GainPilot-planen ofta ändras.

Hermes kan ge:

- antal flyttade pass,

- typ av återkommande hinder,

- genomsnittlig passlängd,

- och en reducerad tillgänglighetssignal.

Atlas behöver inte få:

- varje övning,

- varje personligt meddelande,

- eller hela användarens vardag.

GainPilot ska skilja mellan olika minnestyper.

Ett minne kan vara:

- fakta,

- preferens,

- begränsning,

- observation,

- inferens,

- hypotes,

- beslut,

- motivering,

- mål,

- eller policyreferens.

Systemet ska aldrig blanda dessa kategorier.

Om användaren valde hantelpress vid tre tillfällen är detta en observation.

Det kan skapa hypotesen:

Användaren kanske föredrar hantelpress.

Det ska inte direkt bli faktum:

Användaren ogillar bänkpress.

En preferens ska kunna:

- bekräftas,

- korrigeras,

- försvagas över tid,

- och gälla endast inom en viss kontext.

Ett minne ska ha:

- källa,

- tid,

- scope,

- confidence,

- giltighet,

- och version.

En tidigare korrekt uppgift kan bli inaktuell.

Användaren kan:

- byta gym,

- köpa ny utrustning,

- ändra träningsmål,

- ändra kost,

- eller få nya vardagsförutsättningar.

Arnold ska därför inte använda gamla uppgifter som evig sanning.

GainPilot ska kunna fråga:

Din utrustningsprofil uppdaterades för länge sedan. Stämmer den fortfarande?

Persistent minne ska skapas kontrollerat.

Vissa faktiska handlingar kan sparas automatiskt.

Exempel:

- genomfört pass,

- användarens uttryckliga inställningsändring,

- eller registrerat resultat.

Mer tolkande uppgifter ska kunna bli minneskandidater.

Arnold kan säga:

Du har valt kortare pass under flera veckor. Vill du att jag sparar att vardagspass helst ska vara högst 45 minuter?

Användaren ska kunna:

- godkänna,

- redigera,

- avvisa,

- göra informationen tillfällig,

- hålla den privat,

- eller tillåta en reducerad signal till Atlas.

Användaren ska kunna kontrollera sina minnen.

GainPilot ska erbjuda en begriplig vy över:

- vad Arnold minns,

- varför det sparades,

- vilken källa uppgiften har,

- vilket projekt som får använda det,

- om Atlas kan få information,

- hur länge minnet gäller,

- och hur det kan ändras eller raderas.

Användaren ska kunna välja:

- do-not-share,

- do-not-store,

- do-not-infer,

- minneslås,

- tillfälligt minne,

- och projektspecifikt scope.

Do-not-infer är särskilt viktigt.

GainPilot ska inte analysera tränings- och kostmönster för att skapa dolda slutsatser om:

- psykisk hälsa,

- relationer,

- ekonomi,

- arbetsförmåga,

- eller andra personliga attribut.

Teknisk möjlighet är inte samma sak som legitim användning.

Korrigering ska vara verklig.

Om användaren säger:

Jag ogillar inte knäböj. Jag undvek den endast tillfälligt på grund av smärta.

ska GainPilot inte bara lägga till den nya meningen.

Systemet ska:

- korrigera preferensen,

- bevara den historiska orsaken,

- omvärdera härledda slutsatser,

- uppdatera framtida rekommendationer,

- och rensa inaktuella cache- och indexposter.

Radering ska också vara verklig.

När användaren raderar ett minne ska systemet hantera:

- primärdata,

- cache,

- sökindex,

- embeddings,

- filer,

- härledda minnen,

- aktiva kontextpaket,

- och backups enligt retention.

Användaren ska inte behöva känna till varje teknisk kopia.

Hermes ska känna till relationerna och kunna verifiera raderingen.

Semantisk sökning ska aldrig användas före säkerhetsfiltrering.

Hermes ska först kontrollera:

- tenant,

- användare,

- projekt,

- domän,

- dataklass,

- syfte,

- capability,

- och giltighet.

Därefter kan systemet beräkna relevans.

Att ett minne är semantiskt relevant innebär inte att agenten får läsa det.

Embeddings ska behandlas som känsliga.

De ska:

- isoleras,

- scopeas,

- kunna raderas,

- och inte kallas anonymiserade utan verklig grund.

Hermes ska inte endast skydda läsning.

Det ska även skydda:

- skrivning,

- delning,

- rättelse,

- export,

- återkallande,

- och radering.

Allt ska vara observerbart.

Användaren ska kunna se:

Atlas fick en reducerad tillgänglighetssignal för att analysera träningsplanens genomförbarhet. Inga kalenderdetaljer delades.

Tekniska operatörer ska kunna se:

- request identity,

- aktör,

- policyversion,

- dataklass,

- package identity,

- och beslutsorsak.

Audit ska samtidigt undvika att spara full privat payload.

Hermes ska använda default deny.

Om en förfrågan saknar:

- tydligt syfte,

- rätt användare,

- rätt tenant,

- tillräckligt mandat,

- eller tillåten mottagare

ska den nekas eller förtydligas.

Hermes får inte kringgås när det är otillgängligt.

GainPilot ska då kunna använda:

- lokalt sparad aktiv plan,

- giltiga GainPilot-minnen,

- och redan godkända tidsbegränsade paket.

Ny tvärdomändelning ska vänta.

Ett aktivt träningspass ska fortfarande kunna fungera.

Atlas ska samtidigt kunna fortsätta med sådan analys som inte kräver förbjuden individdata.

Hermes ska kunna stoppas granulärt.

Vid incident ska det gå att stoppa:

- en viss agent,

- en extern modell,

- en dataklass,

- en capability,

- en tenant,

- eller all tvärdomändelning.

GainPilots lokala kärna ska inte automatiskt försvinna.

Nya retrievalmodeller, sammanfattningsmodeller och minimeringsregler ska först köras i shadow mode.

De ska jämföras utifrån:

- relevans,

- paketstorlek,

- integritet,

- policyefterlevnad,

- kostnad,

- latency,

- och användarnytta.

Canary ska börja med:

- intern tenant,

- lågriskdata,

- och tydliga stoppregler.

Hermes, Atlas och Arnold får inte själva:

- bredda minnesåtkomst,

- ändra dataklass,

- förlänga retention,

- ta bort do-not-share,

- eller ge sig själva nya rättigheter.

De får föreslå förbättringar.

Förändringen ska gå genom:

- analys,

- dataskyddsbedömning,

- hotmodell,

- definierat scope,

- separat branch eller worktree,

- implementation,

- policytester,

- tenanttester,

- raderings- och retentionstester,

- injection- och exfiltrationstester,

- shadow mode,

- pull request,

- integritets- och säkerhetsreview,

- canary,

- kontrollerad merge,

- och uppföljning.

Kapitel 22 etablerar därmed följande kärnprincip:

GainPilot ska kunna lära känna användaren utan att göra användaren genomskinlig för hela Omnira. Hermes ska möjliggöra delad intelligens genom isolerade minnesdomäner, minimerade kontextpaket, reducerade signaler och användarstyrd delning — så att Arnold får den information som behövs för att vara en verkligt personlig coach, Atlas får den information som behövs för att förbättra GainPilot, och ingen agent får mer av användarens liv än det aktuella syftet kräver.
