---
document: "Canonical Decision Register v1.0"
book: "Omnira — Mobile Intelligence & Device Control"
edition: "Canonical Edition v1.0"
status: "APPROVED"
approved: true
approval_date: "2026-07-30"
approved_by: "André Hultgren"
source_file: "Exports/Canonical-Edition-v1.0-APPROVED-r3/Canonical-Chapters/00 — Canonical Decision Register v1.0.docx"
source_sha256: "b4291f40ba026e445d69c79dbad756511a7e65a6e43399b7d9a0c643f9827bd0"
generated: "2026-07-30"
derived: true
---

# Canonical Decision Register v1.0


*Dokumentstatus: Canonical Edition v1.0 — APPROVED*


*Dokumentklass: Normerande governance- och arkitekturbeslut*


*Ägare: André Hultgren*


*System: Omnira*

Central intelligens: Atlas

Omfattning: Mobile Intelligence, Device Control, multi-device orchestration, approvals, privacy, security och framtida mobil autonomi


## 1. Dokumentets syfte

Detta dokument samlar de beslut som ska styra den kanoniska boken Omnira Mobile Intelligence & Device Control.

Beslutsregistret ska fungera som gemensam och aktuell riktning för:

André

Atlas

ChatGPT

Claude

Codex

framtida utvecklingsagenter

framtida mänskliga utvecklare

arkitekturgranskning

implementation

testning och validering

Besluten gäller före lösa antaganden, gamla implementationer, enskilda agentförslag och tekniska genvägar.

Om framtida implementation skiljer sig från detta register ska skillnaden:

- identifieras,
- motiveras,
- riskbedömas,
- godkännas genom governance,
- dokumenteras som ett nytt eller ändrat canonical beslut.
Del I — Vision, produktgräns och målgrupp

CDR-001 — Mobilen som fullvärdig Omnira-node

Mobilen ska utvecklas till en fullvärdig Omnira-node.

Den ska kunna fungera som:

- personlig assistentyta,
- operativ AI-yta,
- workflowkomponent,
- approval-enhet,
- notifieringsenhet,
- mobil kontextkälla,
- device-control-yta,
- framtida autonom exekveringsyta.
Mobilen ska inte behöva bära hela Omnira-systemet för att vara en fullvärdig nod.

CDR-002 — Atlas roller

Atlas ska kunna fungera som:

- personlig assistent,
- operativ agent,
- workflowmotor,
- intern ledningsfunktion,
- koordinationslager,
- governance-exekverare,
- säkerhets- och riskbedömare,
- beslutsstöd,
- slutgranskare av delegerat arbete.
Atlas är den interna intelligensen. Projektet, företaget eller dess projektagent är normalt det externa ansiktet.

CDR-003 — Första målgruppen

Den första versionen ska optimeras för André och hans egna projekt.

Arkitekturen ska samtidigt förberedas för framtida:

- privatpersoner,
- team,
- företag,
- flera roller,
- flera användare,
- multi-tenant-drift.
Produkten ska inte överbyggas som full enterprise-lösning innan Andrés egna projekt fungerar.

Den får samtidigt inte byggas som en privat engångslösning som senare måste ersättas helt.

CDR-004 — Första kärnomfattningen

Den första framtida mobilversionens kärna ska omfatta:

- Atlas-chatt,
- röststyrning,
- approvals,
- notifieringar,
- projektbundna workflows,
- fil- och mediahantering,
- grundläggande device control,
- kalender,
- device health,
- säker inloggning,
- recovery,
- multi-device-kontroll,
- audit,
- verifiering,
- safe failure.
Följande ska definieras arkitektoniskt men kan implementeras senare:

- avancerad platsintelligens,
- automatisk kamerarullsklassificering,
- djup autonom device control,
- flerpersonsgodkännande,
- bred företagsgovernance,
- betalningar,
- smarta hem,
- bilstyrning.
Del II — Authority, scope och approvals

CDR-005 — Authority-modell

Omnira ska använda en authority-modell från L0 till L6.

Nivåerna ska representera en kontrollerad utveckling från:

- observation,
- rekommendation,
- human approval,
- avgränsad lågriskautomation,
- authority-baserad autonomi,
- bredare men fortfarande styrd autonomi.
Ingen capability får automatiskt få högre authority enbart för att den tekniskt kan utföra en uppgift.

CDR-006 — Kombinerad scope-modell

Behörighet får inte definieras enbart per projekt.

Canonical scope ska kunna bindas till:

Projekt + capability + app eller tjänst + datatyp + enhet + tidsperiod.

Där det behövs ska scope även kunna innehålla:

- workflow,
- konto,
- kanal,
- mapp,
- avsändare,
- mottagare,
- kostnadsgräns,
- precision,
- geografiskt område,
- riskklass.
CDR-007 — Approval-alternativ

Systemet ska stödja minst:

- godkänn en gång,
- godkänn för aktuell handling,
- godkänn för workflow,
- godkänn för projekt,
- godkänn under begränsad tidsperiod,
- godkänn inom budget,
- avslå,
- skjut upp,
- begär ändrat förslag,
- blockera capability,
- återkalla aktivt mandat.
CDR-008 — Begriplig approval

Approval-gränssnittet ska använda vanligt språk och visa:

- vad Atlas vill göra,
- varför,
- vilket projekt som berörs,
- vilken app eller tjänst som används,
- vilken information som läses eller ändras,
- hur länge tillståndet gäller,
- kostnad eller budgetpåverkan,
- risker,
- möjliga sidoeffekter,
- om åtgärden går att återställa,
- vad som händer om användaren nekar.
Tekniska detaljer ska kunna öppnas separat.

CDR-009 — Automation måste förtjänas

Nya workflows och capabilities ska normalt börja med approval.

Ökad autonomi får ges efter att workflowet har visat:

- stabilitet,
- korrekt resultat,
- fungerande verifiering,
- acceptabel kostnad,
- inga kritiska säkerhetsfel,
- inga oväntade sidoeffekter.
Atlas får rekommendera ökad autonomi men får inte själv höja sin authority.

CDR-010 — Approval-trötthet

Approval-trötthet ska minskas genom:

- workflowmandat,
- mandatpaket,
- tidsbegränsade mandat,
- budgetmandat,
- gruppering av liknande approvals,
- lärande av återkommande godkännanden,
- automatiseringsförslag efter stabilitet.
Säkerhet får inte ersättas med ständiga mikro-approvals.

Del III — Projektisolering och identitet

CDR-011 — Strikt projektisolering

Mobilfunktioner, workflows, data, minnen, credentials, kostnader, audit och agenter ska vara projektbundna där det är relevant.

Data får inte blandas mellan:

- The Prompt,
- Familje-Stunden,
- GainPilot,
- Omnira,
- framtida projekt.
Projektisolering ska genomdrivas genom arkitektur och policy, inte enbart genom namnkonventioner.

CDR-012 — Atlas global vy

Atlas ska kunna ha en global vy över användarens projekt.

Enskilda projekt ska inte automatiskt få tillgång till andra projekts:

- data,
- minnen,
- ekonomi,
- kommunikation,
- credentials,
- kundinformation,
- workflows.
Tvärprojektdelning ska vara explicit och spårbar.

CDR-013 — Extern identitet

Projektets eller företagets identitet används normalt externt utan att Atlas nämns.

Exempel:

Familje-Stunden kommunicerar som Familje-Stunden, Nova eller Pling.

GainPilot kommunicerar som GainPilot eller Arnold.

The Prompt kan uttryckligen hänvisa till Atlas där det ingår i konceptet.

Omniras interna arkitektur får inte läcka in i projektens externa kommunikation.

CDR-014 — Personlig information

Personliga användaruppgifter ska ägas av användaren och användarens Atlas eller specialiserade personliga agent.

Sådan information får inte automatiskt överföras till projekt.

Del IV — Credentials, autentisering och recovery

CDR-015 — Inga klartextlösenord

Klartextlösenord får inte lagras i:

- minne,
- audit-loggar,
- promptar,
- vanliga konfigurationsfiler,
- projektdokument,
- workflowstate,
- oskyddade backuper.
CDR-016 — Godkänd credential-hantering

Autentisering ska i första hand använda:

- OAuth,
- sessions-token,
- begränsade API-nycklar,
- credential vault,
- säkra enhetssessioner,
- kortlivade åtkomstbevis.
Credentials ska kunna begränsas per projekt, tjänst, capability, workflow och enhet.

CDR-017 — Ingen universell huvudkod

Det får inte finnas ett permanent speciallösenord eller universellt lösen som alltid kan kringgå vanliga säkerhetskontroller.

Recovery ska i stället kunna använda:

- verifierad e-post,
- SMS-kod,
- engångskoder,
- betrodd enhet,
- recovery-enhet,
- starkare flerfaktorsverifiering vid hög risk.
CDR-018 — Misstänkt session

Vid stark misstanke om intrång får Atlas:

- stoppa nya högriskjobb,
- pausa credential-användning,
- logga ut den misstänkta enheten,
- kräva ny verifiering,
- informera användaren genom betrodd kanal.
Om endast en enhet misstänks ska inte alla enheter automatiskt loggas ut utan ytterligare skäl.

CDR-019 — Kontoåterställning

Användaren ska från en betrodd enhet kunna:

- logga ut alla aktiva enheter,
- återkalla sessioner,
- byta lösenord,
- se misstänkt aktivitet,
- pausa mobilkontroll,
- skydda projekt,
- återställa åtkomst.
Data ska inte automatiskt raderas vid en säkerhetsincident.

CDR-020 — Kontoradering

Total radering ska:

- kräva extra autentisering,
- ha en ångerperiod,
- pausa projekt och integrationer,
- återkalla tokens och credentials,
- visa vad som kommer att försvinna,
- skiljas från tillfällig kontolåsning.
Del V — Privat kommunikation och notifieringar

CDR-021 — Privata appar som standard

Följande ska vara privata och blockerade som standard:

- SMS och Google Messages,
- Messenger,
- WhatsApp,
- Signal,
- Telegram,
- bankappar,
- BankID,
- privata autentiseringsytor,
- andra uttryckligt känsliga appar.
Blockeringen ska ske innan innehållet läses.

CDR-022 — Privat och projektägd social närvaro

Samma plattform ska kunna delas upp mellan:

- privat konto,
- projektkonto,
- företagssida,
- projektkanal,
- särskild inbox.
Atlas får inte automatiskt få tillgång till en privat profil bara för att ett projekt använder samma plattform.

CDR-023 — Godkända projektkanaler

Atlas ska kunna få tillgång till godkända projektkonton på exempelvis:

- Facebook,
- Instagram,
- YouTube,
- e-post,
- nyhetsbrevssystem,
- framtida X,
- Reddit,
- Pinterest.
Åtkomsten ska knytas till rätt projekt och workflow.

CDR-024 — Läsning av kommunikation

Atlas får läsa innehåll när det gäller:

- projektägda konton,
- projektinkorgar,
- särskilda mappar eller etiketter,
- specifika workflows,
- en uttryckligen öppnad konversation,
- historiska meddelanden inom godkänt scope.
Privata konversationer får inte läsas generellt.

CDR-025 — Kommunikation i början

I den första fasen ska externa kommunikationsåtgärder kräva approval.

Det gäller bland annat:

- standardsvar,
- mötesbekräftelser,
- kundservice,
- sociala kommentarer,
- privata SMS,
- myndighetskontakt,
- svar till missnöjd kund,
- marknadsföring.
Senare får lågriskkommunikation automatiseras inom tydligt mandat.

CDR-026 — Eftergranskning av automatiska svar

När Atlas börjar svara automatiskt ska användaren initialt få en notifiering efter varje automatiskt svar.

Notifieringskravet ska kunna tas bort när workflowet har visat stabil kvalitet.

CDR-027 — Notifieringssammanfattning

Första notifieringsnivån ska normalt vara neutral och kort.

Exempel:

Tre saker behöver din uppmärksamhet: ett kundärende, en kalenderändring och ett säkerhetsproblem.

Fullständiga detaljer visas när användaren öppnar posten eller ber Atlas utveckla informationen.

Del VI — Kalender och proaktiv uppmärksamhet

CDR-028 — Kalenderåtkomst

Atlas ska kunna läsa kalendern och förstå kalenderinnehåll för att hjälpa användaren.

I början ska skapande, ändring och radering kräva approval.

Det gäller även:

- deltagarstatus,
- inbjudningar,
- återkommande händelser,
- fokustid,
- påminnelser,
- videomöteslänkar.
CDR-029 — Kalendersekretess för framtida användare

Andrés installation behöver inte använda generell metadata-only-klassning.

Arkitekturen ska ändå stödja framtida:

Private — metadata only

Där Atlas endast ser att tiden är upptagen.

CDR-030 — Prioritetsnivåer

Proaktiv uppmärksamhet ska använda:

- P0: omedelbart,
- P1: nästa lämpliga tillfälle,
- P2: briefing,
- P3: historik eller dashboard.
Prioriteten bestäms genom en kombination av fasta regler och Atlas kontextbedömning.

CDR-031 — Tyst läge och avbrott

Atlas ska respektera:

- sömn,
- möten,
- körning,
- träning,
- familjetid,
- semester,
- fokusläge,
- stör ej.
Endast verkligt allvarliga händelser får bryta igenom.

Användaren ska själv kunna välja att agera nu eller senare.

Del VII — Device control

CDR-032 — Tillåtna normala mobilinteraktioner

Atlas ska kunna:

- öppna och stänga appar,
- navigera,
- trycka på knappar,
- skriva text,
- läsa skärminnehåll,
- ändra låg-riskinställningar,
- använda appar inom godkända workflows.
CDR-033 — Högriskåtgärder

Följande ska initialt kräva approval och begriplig motivering:

- starta om mobilen,
- aktivera stör ej,
- slå på eller av Wi-Fi,
- ändra systeminställningar,
- ta skärmbilder,
- installera appar,
- avinstallera appar,
- ändra appbehörigheter,
- ändra standardappar.
CDR-034 — Appar utan officiellt API

Omnira får använda visuell appstyrning där officiell integration saknas.

Reglerna ska bero på:

- app,
- risk,
- datakänslighet,
- handlingens reversibilitet,
- verifieringsmöjlighet.
Bindande handlingar kräver starkare kontroll.

CDR-035 — Känsliga appar

Bankappar, BankID, vårdappar, myndighetsappar, lösenordshanterare och autentiseringsappar får endast användas för ett specifikt godkänt ärende.

Slutlig signering, betalning och biometrisk bekräftelse ska kräva användaren.

CDR-036 — Okänd appvy

När en appvy förändrats ska Atlas:

- sluta interagera,
- observera,
- analysera,
- förklara förändringen,
- föreslå nästa steg,
- endast fortsätta när målet kan verifieras med hög säkerhet.
Bindande handlingar får inte utföras i en okänd vy.

Del VIII — Filer, media och karantän

CDR-037 — Filåtkomst

Atlas får läsa arbetsrelaterade:

- dokument,
- PDF-filer,
- hämtade filer,
- videor,
- ljudfiler,
- projektmappar,
- synkroniserade projektfiler,
- appgenererade filer.
Privata mappar och privata bilder ska vara blockerade som standard.

CDR-038 — Filoperationer

Atlas ska kunna:

- skapa,
- byta namn,
- flytta,
- kopiera,
- komprimera,
- dela,
- ladda upp,
- konvertera,
- organisera,
- arkivera,
- återställa filer.
Direkt permanent radering är inte normal standard.

CDR-039 — Karantän före radering

Filer som ska tas bort ska normalt först flyttas till projektseparerad karantän eller papperskorg.

Karantänen ska stödja:

- rollback,
- återställning,
- verifiering,
- regelbundna sammanfattningar,
- förklaring av varför materialet finns kvar.
CDR-040 — Automatisk slutlig radering

Permanent radering behöver inte alltid kräva ett nytt approval när:

- raderingsrätten ingick i mandatet,
- materialet är tillfälligt,
- resultatet har verifierats,
- rollback inte längre behövs,
- raderingen loggas.
CDR-041 — Bilder i första fasen

Användaren ska manuellt välja bilder och videor i den första fasen.

Senare får Atlas analysera kamerarullen för att identifiera projektmaterial.

CDR-042 — Osäker bildklassificering

Osäkert bildmaterial ska:

- läggas i granskningskö,
- få sannolikhet och förklaring,
- behandlas som privat tills annat godkänts,
- inte kopieras eller flyttas automatiskt.
CDR-043 — Originalbilder

Originalbilden ska som standard ligga kvar i kamerarullen.

Projektmaterial kopieras till projektmappen.

Ett särskilt projektmandat får senare definiera annan hantering.

CDR-044 — Ansiktsdata

Atlas får upptäcka att människor eller barn förekommer.

Atlas får inte som standard:

- skapa bestående ansiktsprofiler,
- identifiera människor med namn,
- spara ansiktsrepresentationer,
- bygga personregister.
Identifiering kräver separat uttryckligt godkännande.

Del IX — Kamera, mikrofon och plats

CDR-045 — Kamera och mikrofon

Kamera och mikrofon får endast användas när användaren:

- aktivt talar med Atlas,
- startar inspelning,
- godkänner ett mötestranskript,
- aktivt visar något för Atlas.
Dold eller passiv aktivering är förbjuden.

CDR-046 — Ingen kontinuerlig lyssning

Atlas får inte kontinuerligt analysera omgivningsljud.

Användaren ska inte känna sig passivt övervakad.

CDR-047 — Platsens precision

Precisionstrappan är:

- G0: region,
- G1: stad eller område,
- G2: ungefärlig plats,
- G3: exakt plats,
- G4: kontinuerlig rutt.
G1 är normal standard.

Högre precision kräver konkret nytta och godkänt workflow.

CDR-048 — Ingen fullständig platshistorik

Omnira ska inte spara fullständig rörelsehistorik som standard.

Viktiga platshändelser får behandlas tillfälligt och ska raderas när uppgiften är slutförd.

CDR-049 — Platsbaserade påminnelser

Geofencing får användas för exempelvis:

- apotek,
- paketutlämning,
- möten,
- arbetsstart,
- platsbundna workflows.
Skapande av regeln kräver approval. Aktivering inom ett giltigt mandat kräver inte ny approval varje gång.

CDR-050 — Ingen automatisk rörelseprofil

Framtida användare ska inte automatiskt få en profil över:

- vanliga rutter,
- återkommande platser,
- dagliga rörelsemönster.
Platsinlärning ska vara opt-in och kunna raderas.

Del X — Lokal bearbetning, moln och leverantörer

CDR-051 — Lokal bearbetning först vid integritetsbehov

Lokal bearbetning ska prioriteras när det krävs för:

- integritet,
- privata klassificeringar,
- känslig maskering,
- enhetsnära beslut,
- platsregler,
- säkerhetskontroller.
Molnet används när högre intelligens eller annan kapacitet behövs.

CDR-052 — Förklarad dataöverföring

Om data lämnar mobilen utanför ett redan godkänt workflow ska Atlas förklara:

- vilken data,
- mottagare,
- syfte,
- projekt,
- workflow,
- lagring,
- modellträning eller vidareanvändning,
- retention.
CDR-053 — Dynamiskt leverantörsval

Projekt och workflows ska kunna välja lämplig modell eller leverantör utifrån:

- kvalitet,
- pris,
- hastighet,
- integritet,
- tillgänglighet,
- multimodal kapacitet,
- kommersiella villkor.
Valet ska ske bland leverantörer som är godkända av Omniras globala governance.

CDR-054 — Osäkra träningsvillkor

Leverantörer som inte ger tillräckliga garantier mot modellträning eller datavidareanvändning får endast användas för:

- offentlig data,
- okänslig data,
- material som godkänts separat.
CDR-055 — Molnöverföring av bilder

Molnanalys av bilder och skärmbilder ska initialt kräva approval.

Känsligt innehåll ska maskeras före överföring där det är möjligt.

Del XI — Minne, retention och radering

CDR-056 — Minnesgranskningskö

Atlas ska föreslå nya långtidsminnen i en granskningskö.

Användaren ska kunna se:

- formuleringen,
- projekt,
- privat eller global klass,
- framtida beteendepåverkan,
- källa,
- retention.
Användaren ska kunna redigera minnet före godkännande.

CDR-057 — Globalt användarminne

Följande får vara globalt:

- tilltalsform,
- kommunikationsstil,
- arbetspreferenser,
- säkerhetsregler,
- approval-preferenser.
CDR-058 — Projektbundet minne

Följande ska normalt förbli projektbundet:

- kunddata,
- projektstrategi,
- projektkonton,
- innehåll,
- dokument,
- ekonomi,
- projektkommunikation.
CDR-059 — Retention per datatyp

Separata retention-regler ska finnas för:

- audit,
- approvals,
- temporära filer,
- skärmbilder,
- kommunikationsdata,
- notifieringsmetadata,
- platsdata,
- transkriberingar,
- device health,
- incidenter,
- projektminnen,
- personliga minnen.
Projekt får definiera egna regler inom globala gränser.

CDR-060 — Verifierad radering

Atlas ska skilja mellan:

Informationen används inte längre.

och:

Informationen är verifierat borttagen från aktiva system.

Atlas får inte påstå fullständig borttagning från backup eller extern leverantör om detta inte kan bekräftas.

Del XII — Multi-device och node orchestration

CDR-061 — Exekverande noder

Följande ska kunna utföra arbete:

- mobil,
- laptop,
- stationär dator,
- privat serverrigg,
- molnserver.
Klocka och bilsystem fungerar främst som notifierings- och interaktionsytor.

CDR-062 — Control surface kontra execution surface

Var användaren styr Omnira och var arbetet körs är separata frågor.

Mobilen får styra ett workflow som körs på serverrigg, moln eller dator.

CDR-063 — Primär exekveringsriktning

Innan privat serverrigg finns används främst laptop och stationär dator.

Senare ska den privata riggen vara huvudsaklig exekveringsyta.

Atlas får välja dynamiskt när annan nod är bättre.

CDR-064 — Känsliga lokala jobb

Känsliga jobb som är bundna till lokal bearbetning får inte flyttas till molnet enbart för kontinuitet.

Atlas ska i sådana fall:

- vänta,
- begära att lokal dator startas,
- använda annan godkänd lokal nod.
CDR-065 — En aktiv exekveringsägare

Varje action eller workflowsteg ska ha en aktiv exekveringsägare.

Detta ska förhindra:

- dubbelpublicering,
- dubbla kundsvar,
- race conditions,
- motstridiga filändringar.
CDR-066 — Selektiv dataöverföring

När arbete flyttas mellan noder ska endast den information som steget behöver överföras.

Temporära kopior ska tas bort efter verifierat resultat när de inte behövs för rollback.

CDR-067 — Enhetsroller

Enheter ska kunna ha roller som:

- full administration,
- worker,
- approval-enhet,
- notifieringsenhet,
- read-only,
- recovery-enhet.
Andrés planerade standard:

- laptop: full administration,
- mobil: approvals och notifieringar,
- stationär eller rigg: worker,
- separat dold enhet: recovery.
CDR-068 — Betrodd ny enhet

En ny enhet ska kunna godkännas med:

- aktiv inloggning,
- tidsbegränsad QR-kod,
- bekräftelse på redan betrodd enhet,
- kryptografisk enhetsidentitet.
CDR-069 — Offline-noder

En återansluten nod ska:

- jämföra sitt state med canonical state,
- kassera utgångna mandat,
- kontrollera gamla actions,
- undvika att köra redan slutförda uppgifter.
Ett utgånget mandat får inte återupplivas efter offlineperiod.

CDR-070 — Canonical state

Omniras kontrollplan ska vara canonical för:

- workflows,
- approvals,
- authority,
- mandat,
- projektstatus,
- audit.
Vault är canonical för credentials.

Projektets datalager är canonical för projektdata.

Enheten är canonical för sitt omedelbara lokala device state.

Del XIII — Verifiering, rollback och incidenter

CDR-071 — Ingen falsk framgång

Atlas får aldrig påstå att en åtgärd lyckades om resultatet inte kunnat verifieras.

Tillåtna statusar ska innefatta:

- lyckades,
- misslyckades,
- kunde inte verifieras,
- väntar,
- delvis slutfört,
- återställt,
- stoppat av säkerhet,
- kräver användarens hjälp.
CDR-072 — Verifieringsnivåer

Omnira ska stödja:

- V0: ingen verifiering,
- V1: visuell bekräftelse,
- V2: tillstånd lästes tillbaka,
- V3: två oberoende bevis.
Känsligare handlingar kräver högre verifieringsnivå.

CDR-073 — Beroendebaserat stopp

Ett workflow ska stoppas när ett efterföljande steg är beroende av ett resultat som inte kunde verifieras.

Oberoende lågrisksteg får fortsätta om det är säkert.

CDR-074 — Unknown outcome

Om en handling kan ha genomförts men resultatet är okänt får Atlas inte blint upprepa handlingen.

Det gäller särskilt:

- publicering,
- skickade meddelanden,
- betalningar,
- bokningar,
- externa förändringar.
CDR-075 — Automatisk incidentåtgärd

Atlas får vid allvarlig incident utföra avgränsade lågriskåtgärder, initialt främst:

- stoppa publicering,
- pausa workflow.
Åtgärden ska vara riskreducerande och reversibel.

CDR-076 — Incidentnotis

Alla automatiska incidentåtgärder ska meddelas omedelbart.

Notisen ska visa:

- vad Atlas gjorde,
- varför,
- kvarvarande risk.
CDR-077 — Rollback

Redan genomförda förändringar ska återställas när:

- mandat återkallas,
- workflow misslyckas,
- rollback är säker,
- rollback inte skapar större risk.
Handlingar som inte kan återställas fullt ut ska märkas tydligt före approval.

Del XIV — Audit, delegation och ansvar

CDR-078 — Nivåindelad audit

Audit ska delas i:

- kompakt hälsoaudit,
- utökad audit,
- full audit.
Full audit ska främst användas för större, känsliga, ekonomiska, ovanliga eller irreversibla handlingar.

CDR-079 — Auditens syfte

Audit ska användas för:

- snabb förståelse,
- diagnos,
- spårbarhet,
- verifiering,
- incidentanalys,
- governance.
Audit ska inte bli en okontrollerad kopia av allt projektinnehåll.

CDR-080 — Förklaringsbarhet

Atlas ska ge korta begripliga beslutssammanfattningar som standard.

Teknisk detalj ska kunna visas på begäran.

CDR-081 — Felanalys

Efter fel ska Atlas analysera:

- grundorsak,
- konsekvens,
- modell,
- workflowdesign,
- verktyg,
- extern tjänst,
- nod,
- policy,
- approval,
- datakvalitet.
Atlas ska föreslå hur samma fel förhindras framöver.

CDR-082 — Delegering

En delegerad agent får inte automatiskt ärva all Atlas authority.

Agenten ska få ett begränsat mandat för:

- capability,
- data,
- projekt,
- kostnad,
- tid,
- verktyg,
- externt handlingsutrymme.
CDR-083 — Agentgranskning

En specialiserad agents resultat ska kunna granskas av:

- en annan agent,
- Atlas,
- användaren.
Atlas ska slutgranska innan externa eller bindande resultat skickas ut när workflowets risk kräver det.

CDR-084 — Återkommande agentfel

Återkommande fel ska utredas och åtgärdas.

Målet är att reparera:

- instruktion,
- modellval,
- kontext,
- verktyg,
- workflowdesign,
- behörighet.
Autonomi får tillfälligt minskas för att skydda systemet.

Del XV — UX, röst och dagligt arbetssätt

CDR-085 — Första åtkomstytan

Första versionen ska använda Omnira-appen.

Widget kan införas senare.

CDR-086 — Startsida

Startsidan ska kombinera:

- Atlas-chatten,
- Vad behöver jag göra nu?,
- relevanta approvals,
- varningar,
- kort projektstatus.
CDR-087 — Morgonbriefing

Morgonbriefingen ska vara kort och innehålla:

- dagens kalender,
- viktigaste deadlines,
- Atlas rekommenderade prioritering.
Mer information ges på begäran.

CDR-088 — Kvällssammanfattning

Kvällssammanfattningen ska fokusera på:

- avvikelser,
- fel,
- kostnader,
- lärdomar,
- vad Atlas behöver från användaren.
CDR-089 — Vad behöver jag göra nu?

Vyn ska endast visa sådant som faktiskt kräver användaren.

Atlas ska dölja sådant den säkert kan lösa inom mandat.

CDR-090 — Röst som kollegial interaktion

Användaren ska kunna prata med Atlas som med en kollega.

Röst ska kunna användas för:

- frågor,
- prioriteringar,
- workflows,
- approvals,
- diktering,
- status,
- stoppa och återuppta arbete.
Högriskhandlingar kan kräva skärm eller stark autentisering.

CDR-091 — Avbrott i röstsamtal

Atlas ska sluta prata när användaren börjar tala.

Systemet ska kunna:

- förstå ämnesbyte,
- minnas tidigare ämne,
- återuppta,
- fråga om en uppgift ska pausas,
- komma ihåg oavslutade beslut.
Bakgrundsljud ska inte behandlas som användaravbrott utan tillräcklig säkerhet.

CDR-092 — Naturlig personlig anpassning

Atlas får anpassa ton, detaljnivå och arbetssätt efter:

- stress,
- tid på dagen,
- privat eller arbete,
- behov av raka besked,
- behov av stöd,
- användarens preferenser.
Det får inte bygga på dold övervakning.

Del XVI — Testning, uppdateringar och capability expansion

CDR-093 — Automatiska uppdateringar

Mobilapp, integrationer, agenter, modeller och workflowdefinitioner ska kunna uppdateras automatiskt.

Säkerhetsuppdateringar får prioriteras.

CDR-094 — Nya behörigheter kräver nytt godkännande

En uppdatering som kräver bredare Android- eller systembehörighet ska alltid kräva ny approval.

Gamla mandat får inte automatiskt utökas.

CDR-095 — Mandatets giltighet efter ändring

Mindre interna förändringar får behålla befintligt mandat när de inte väsentligt ändrar:

- kostnad,
- risk,
- dataåtkomst,
- mottagare,
- extern konsekvens,
- capability.
Väsentlig förändring kräver ny approval.

CDR-096 — Mognadsmodell

Nya workflows ska kunna gå genom:

- simulation,
- test,
- shadow mode,
- approvalbaserad produktion,
- begränsad autonomi,
- bredare autonomi.
CDR-097 — Testnod och canary

Nya eller ändrade workflows ska kunna testas på en testnod före bred produktion.

Atlas får automatiskt stoppa utrullningen när fel eller risk ökar.

CDR-098 — Blockerande säkerhetstester

Minst följande ska vara blockerande:

- credential isolation,
- projektisolering,
- privata appblockeringar,
- authority enforcement,
- approval enforcement,
- nödstopp,
- dubbelpubliceringsskydd,
- verifiering,
- rollback,
- safe failure.
CDR-099 — Automatisk fallback

Atlas får återgå till tidigare fungerande modell eller leverantör när:

- den tidigare lösningen fortfarande är godkänd,
- workflowet behöver fortsätta,
- kostnad och risk ligger inom mandat,
- resultatet kan verifieras.
CDR-100 — Versionsspårning

Viktiga actions ska kunna kopplas till:

- appversion,
- workflowversion,
- agentversion,
- governanceversion,
- modell,
- leverantör,
- integrationsversion,
- mandat,
- relevant instruktion.
CDR-101 — Nya capabilities

Helt nya capabilities ska:

- vara avstängda som standard,
- genomgå separat riskgranskning,
- få egen capability-definition,
- få egna approvals,
- inte ärva befintliga mandat,
- valideras före produktion.
Del XVII — Absoluta förbud

CDR-102 — Förbjudna standardbeteenden

Följande är förbjudet som standard:

Dold mikrofonaktivering.

Dold kameraaktivering.

Kontinuerlig exakt platsspårning.

Klartextlösenord.

Generell läsning av privata meddelanden.

Automatisk åtkomst till bankappar och BankID.

Oannonserad molnöverföring.

Irreversibla handlingar utan mandat.

Automatisk utökning av behörigheter.

Osynlig sammanblandning mellan projekt.

Påstådd framgång utan verifiering.

Automatisk authority-höjning.

Credential-exponering i promptar eller loggar.

Dold bakgrundsövervakning.

Att en agent ärver obegränsad Atlas-behörighet.

Att ett utgånget mandat fortsätter användas.

Att okända appvyer behandlas som tidigare validerade.

Att komprometterad enhet får fortsätta använda högriskcredentials.

Att personlig användardata automatiskt blir projektdata.

Att framtida enterprise-policyer kan kringgås av vanlig administratör.

Del XVIII — Nödstopp och återställning

CDR-103 — Projektbundet nödstopp

Varje projekt ska ha ett eget nödstopp.

Det ska kunna pausa:

- publicering,
- kommunikation,
- workflows,
- automatiska förändringar,
- tillfälliga mandat.
CDR-104 — Globalt nödstopp

Omnira ska ha ett globalt nödstopp.

Det ska kunna stoppa automation utan att automatiskt förstöra:

- data,
- konfiguration,
- credentials,
- minnen,
- governance.
CDR-105 — Kontrollerad återstart

Efter nödstopp ska systemet visa:

- vad som stoppades,
- varför,
- vad som är säkert,
- vad som kräver granskning,
- vilka delar som kan återstartas.
Återstart ska kunna ske stegvis per:

- projekt,
- workflow,
- capability,
- enhet.
Del XIX — Bokens framtida status

CDR-106 — Tre samtidiga funktioner

Den kommande boken ska vara:

- en vision,
- en normerande målarkitektur,
- ett canonical governance-kontrakt.
CDR-107 — Implementation sker senare

Beslutsregistret och boken innebär inte att implementation har godkänts eller påbörjats.

Implementation ska ske separat och stegvis.

CDR-108 — Canonical styrkälla

Efter slutgodkännande ska boken och dess beslut vara styrande för framtida mobilimplementation.

Claude, Codex och andra agenter ska granska relevanta implementationer mot denna canonical källa.

CDR-109 — Ändringskontroll

Ändringar av canonical beslut ska kräva:

- identifierat beslut,
- föreslagen ändring,
- motivering,
- riskbedömning,
- kompatibilitetsbedömning,
- ägargodkännande,
- versionsuppdatering,
- changelog.
Slutstatus

Detta register innehåller den beslutade riktningen från samtliga genomförda intervjublock.

Dokumentet granskades och godkändes uttryckligen av André 2026-07-30 och är klassificerat som Canonical Approved.

Efter godkännande ska nästa dokument vara:

Omnira — Mobile Intelligence & Device Control — Canonical Book Architecture and Chapter Plan v1.0.md

Det dokumentet ska sparas i:

05_BOOKS/07_MOBILE_INTELLIGENCE/00_GOVERNANCE_AND_DECISIONS/

Därefter börjar Kapitel 1 i:

05_BOOKS/07_MOBILE_INTELLIGENCE/01_CHAPTER_MANUSCRIPTS/

