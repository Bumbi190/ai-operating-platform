# Kapitel 11 — Programimport, externa källor och canonical normalisering

GainPilot ska kunna hjälpa användaren även när tränings- eller kostupplägget inte har skapats direkt i GainPilot.

Användaren kan redan följa:

- ett program från en mänsklig tränare,

- ett program från en annan träningsapp,

- ett kalkylblad,

- en PDF,

- ett dokument,

- en bild,

- ett publicerat träningsprogram,

- programmeringen från en CrossFit-box,

- ett calisthenicsupplägg,

- en löpplan,

- ett eget handskrivet upplägg,

- eller en kombination av flera källor.

GainPilot ska därför kunna:

- importera,

- tolka,

- normalisera,

- analysera,

- presentera,

- och följa externa program.

Importen får däremot inte innebära att allt externt innehåll automatiskt blir canonical GainPilot-kunskap.

Ett externt program kan vara:

- korrekt men ofullständigt beskrivet,

- lämpligt för en annan målgrupp,

- svårt att tolka,

- upphovsrättsskyddat,

- byggt med andra övningsnamn,

- inkompatibelt med användarens utrustning,

- eller olämpligt i relation till användarens övriga mål och belastning.

GainPilot ska därför skilja mellan:

- vad källan faktiskt innehåller,

- vad systemet tolkar,

- vad användaren bekräftar,

- vad GainPilot analyserar,

- vad som får användas operativt,

- och vad som kan bli canonical kunskap efter separat granskning.

Programimport ska inte vara en enkel filuppladdning följd av fri AI-tolkning.

Den ska vara en kontrollerad dataprocess med:

- källidentifiering,

- rättighetsbedömning,

- extraktion,

- strukturering,

- canonical matchning,

- osäkerhetsmarkering,

- användarbekräftelse,

- säkerhetskontroll,

- versionshantering,

- och spårbar aktivering.

Arnold ska hjälpa användaren förstå vad som importerats och vilka delar som är osäkra.

Atlas ska kunna hjälpa med research, källbedömning, normalisering, dubblettanalys och långsiktig förbättring av importmotorn.

Hermes ska kontrollera vilken extern och intern kontext som får användas.

Grundprincipen är:

GainPilot ska kunna arbeta med externa program utan att okritiskt kopiera dem, förlora deras ursprung eller blanda samman källans innehåll med GainPilots egna slutsatser.

11.1 VARFÖR PROGRAMIMPORT ÄR EN KÄRNFUNKTION

Många användare kommer inte till GainPilot utan historik.

De kan redan ha:

- flera års träningsloggar,

- ett aktuellt program,

- favoritrutiner,

- en extern coach,

- egna anteckningar,

- eller betalt innehåll från en annan tjänst.

GainPilot ska inte kräva att användaren överger allt detta och börjar om.

Importfunktionen ska minska friktionen genom att:

- bevara tidigare arbete,

- göra historik användbar,

- låta Arnold förstå nuläget,

- skapa kontinuitet,

- och göra det möjligt att analysera ett befintligt upplägg.

Programimport ska stödja flera användningsfall.

Exempel:

- användaren vill fortsätta följa programmet oförändrat,

- användaren vill att GainPilot endast loggar och analyserar,

- användaren vill att Arnold föreslår mindre anpassningar,

- användaren vill jämföra programmet med GainPilots rekommendationer,

- eller användaren vill använda programmet som grund för ett nytt personligt upplägg.

GainPilot ska därför fråga vad användaren vill göra med det importerade materialet.

Systemet får inte anta att import automatiskt innebär tillåtelse att förändra programmet.

11.2 IMPORT ÄR INTE SAMMA SAK SOM AKTIVERING

Ett program kan importeras utan att det blir aktivt.

GainPilot ska skilja mellan följande tillstånd:

1. Mottaget.

2. Extraherat.

3. Normaliserat.

4. Användarbekräftat.

5. Säkerhetsgranskat.

6. Klart för aktivering.

7. Aktivt.

8. Arkiverat.

9. Avvisat.

10. Delvis importerat.

Ett program ska inte bli användarens aktiva plan enbart för att filen har lästs.

Aktivering ska kräva att GainPilot tillräckligt säkert förstår:

- programstrukturen,

- träningsdagarna,

- övningarna,

- arbetsmängden,

- progressionen där sådan finns,

- och viktiga begränsningar.

Om underlaget är ofullständigt ska Arnold kunna säga:

Jag har importerat programmets veckostruktur och de flesta övningarna, men progressionsregeln för huvudlyften är fortfarande oklar. Du kan använda det som ett manuellt program nu, eller bekräfta hur belastningen ska utvecklas innan det aktiveras som intelligent program.

11.3 IMPORTLÄGEN

GainPilot ska stödja flera importlägen.

11.3.1 Bevarandeläge

Programmet importeras för att kunna visas, följas och loggas.

GainPilot ändrar inte innehållet utan användarens uttryckliga beslut.

Passar när användaren:

- följer en extern coach,

- vill behålla originalstrukturen,

- eller endast behöver loggning.

11.3.2 Analysläge

GainPilot importerar och analyserar programmet men gör inga automatiska förändringar.

Arnold kan beskriva:

- träningsfrekvens,

- volym,

- rörelsemönster,

- belastningsfördelning,

- progression,

- och möjliga konflikter.

11.3.3 Anpassningsläge

Programmet används som grund men får anpassas inom användarens mandat.

GainPilot kan exempelvis:

- byta olämpliga övningar,

- anpassa utrustning,

- korta pass,

- eller justera placering.

11.3.4 Konverteringsläge

Programmets principer och struktur används för att skapa ett nytt GainPilot-program.

Det nya programmet ska vara en separat version och inte framställas som en identisk kopia.

11.3.5 Historikläge

Äldre träningsprogram eller loggar importeras endast för analys och historik.

De ska inte automatiskt påverka den aktiva planen som aktuell sanning.

11.4 KÄLLTYPER

GainPilot ska kunna hantera flera typer av källor.

Exempel:

- CSV,

- kalkylblad,

- PDF,

- Word-dokument,

- vanlig text,

- JSON,

- exportfil från annan app,

- skärmbild,

- foto,

- webbsida,

- e-postbilaga,

- API,

- kalender,

- eller manuell inmatning.

Varje källtyp har olika risker.

Ett strukturerat exportformat kan ge tydliga fält men använda okända identifierare.

En PDF kan bevara layout men vara svår att extrahera korrekt.

En bild kan kräva visuell tolkning och ha låg säkerhet.

En webbsida kan förändras över tid eller innehålla upphovsrättsskyddat material.

GainPilot ska anpassa importprocessen efter källtypen.

11.5 STRUKTURERADE OCH OSTRUKTURERADE KÄLLOR

GainPilot ska skilja mellan strukturerade och ostrukturerade källor.

Strukturerade källor kan exempelvis innehålla:

- tydliga träningsdagar,

- övningsidentifierare,

- set,

- repetitioner,

- belastningar,

- datum,

- och progression.

Ostrukturerade källor kan innehålla:

- löpande text,

- tabeller med oklar struktur,

- förkortningar,

- handskrivna anteckningar,

- eller bilder.

Strukturerad data är inte automatiskt korrekt.

Ostrukturerad data är inte automatiskt oanvändbar.

Skillnaden ska påverka:

- extraktionsmetod,

- säkerhetsnivå,

- användarbekräftelse,

- och hur mycket som får automatiseras.

11.6 KÄLLIDENTITET

Varje import ska ha en källidentitet.

Källidentiteten ska kunna innehålla:

- källa eller tjänst,

- filnamn,

- extern URL eller dokumentreferens,

- skapandedatum när det är känt,

- importdatum,

- ägare,

- licensstatus,

- versionsinformation,

- checksumma,

- och användarens relation till materialet.

Exempel:

Källa:

Extern träningsapp.

Exporttyp:

CSV.

Importerad:

12 september 2026.

Ägare:

Användaren.

Syfte:

Historikimport.

Källidentiteten ska följa data genom normalisering och analys.

11.7 PROVENANCE

Varje importerad uppgift ska kunna spåras till sitt ursprung.

Det gäller exempelvis:

- övningsnamn,

- träningsdag,

- set,

- repetitionsmål,

- progressionsregel,

- tekniknotering,

- eller träningsresultat.

GainPilot ska kunna skilja mellan:

- direkt extraherat innehåll,

- normaliserad representation,

- systeminferens,

- användarkorrigering,

- och senare GainPilot-anpassning.

Exempel:

Originaltext:

“BP 4x8 @ 80%”

Extraherad tolkning:

Övning: BP.

Set: 4.

Repetitioner: 8.

Belastning: 80 procent.

Canonical matchning:

Bänkpress med skivstång.

Osäkerhet:

Förkortningen BP kan i vissa sammanhang betyda annat.

Bekräftelse:

Användaren bekräftade bänkpress.

Denna kedja ska vara spårbar.

11.8 KÄLLANS INNEHÅLL OCH GAINPILOTS TOLKNING

GainPilot ska bevara skillnaden mellan originalinnehåll och tolkning.

Originalinnehållet ska inte skrivas över när systemet normaliserar det.

Det ska vara möjligt att visa:

- vad källan sa,

- hur GainPilot tolkade det,

- och vilka delar användaren korrigerade.

Detta är särskilt viktigt när:

- förkortningar används,

- layouten är svårtolkad,

- övningsnamn är lokala,

- eller programmet använder egna begrepp.

Grundprincipen är:

Tolkning får aldrig förklädas till originaldata.

11.9 RÄTTIGHETER OCH UPPHOVSRÄTT

GainPilot ska respektera upphovsrätt, licenser och användningsvillkor.

Att användaren kan läsa eller ladda upp ett program innebär inte automatiskt att GainPilot får:

- publicera det,

- sälja det vidare,

- dela det med andra användare,

- använda det som global träningsmall,

- eller träna modeller på innehållet.

GainPilot ska skilja mellan:

- privat användning,

- personlig bearbetning,

- analys,

- intern lagring,

- delning,

- och kommersiell återanvändning.

Ett upphovsrättsskyddat program kan användas privat av användaren inom tillåtna gränser.

Det får inte automatiskt bli GainPilots canonical programbibliotek.

När rättigheterna är osäkra ska systemet begränsa användningen.

11.10 ANVÄNDARENS RÄTT TILL MATERIALET

Vid import ska GainPilot kunna fråga eller fastställa användarens relation till materialet.

Exempel:

- användaren skapade det själv,

- användaren fick det från sin tränare,

- användaren har köpt tillgång,

- materialet är offentligt,

- materialet har öppen licens,

- eller rättigheten är okänd.

GainPilot behöver inte göra användaren till juridisk expert.

Systemet ska däremot undvika att anta obegränsade rättigheter.

Arnold kan säga:

Du kan använda programmet privat i GainPilot. Jag gör det inte till en offentlig mall eller delar innehållet med andra användare.

11.11 PRIVAT KÄLLA OCH CANONICAL KUNSKAP

Privat importerad data ska hållas åtskild från canonical GainPilot-data.

Ett privat program kan innehålla:

- egna övningsnamn,

- unika regler,

- coachanteckningar,

- eller personliga instruktioner.

Dessa ska inte göras globala.

Om en import innehåller en relevant ny övning eller regel kan Atlas skapa ett separat granskningsförslag.

Processen ska då vara:

Privat signal

→ Anonymiserad eller minimerad kandidat

→ Dubblettkontroll

→ Oberoende källinsamling

→ Teknisk granskning

→ Rättighetsbedömning

→ Canonical beslut

Det privata originalet får inte användas som global källa utan rätt grund.

11.12 EXTRAKTION

Extraktionssteget ska försöka identifiera programmets struktur.

Det kan omfatta:

- titel,

- skapare,

- programlängd,

- veckor,

- dagar,

- pass,

- övningar,

- set,

- repetitioner,

- tempo,

- vila,

- belastning,

- intensitet,

- progression,

- deload,

- och anteckningar.

GainPilot ska inte kräva att allt kan extraheras.

Varje fält ska kunna ha:

- extraherat värde,

- säkerhetsnivå,

- källposition,

- och eventuell varning.

Ett osäkert värde ska inte automatiskt behandlas som bekräftat.

11.13 TABELLTOLKNING

Många träningsprogram använder tabeller.

GainPilot ska kunna förstå:

- rubriker,

- sammanslagna celler,

- veckokolumner,

- dagsektioner,

- upprepade rubriker,

- och fotnoter.

Tabeller kan vara visuellt tydliga för en människa men svåra att tolka maskinellt.

Systemet ska därför kunna markera problem som:

- oklar cellkoppling,

- saknad rubrik,

- eller flera möjliga tolkningar.

Arnold ska kunna visa en förhandsgranskning före aktivering.

11.14 BILDER OCH SKÄRMBILDER

GainPilot kan stödja import från bilder och skärmbilder.

Bildimport ska behandlas som en högre osäkerhetskälla.

Möjliga problem:

- beskuren text,

- låg upplösning,

- handskriven text,

- visuella symboler,

- tabellgränser,

- och saknade sidor.

Systemet ska kunna säga:

Jag kan läsa de flesta övningarna, men kolumnen för vila är delvis beskuren. Bekräfta dessa tre rader innan programmet aktiveras.

Bildimport ska inte skapa falsk säkerhet.

11.15 HANDSKRIVNA PROGRAM

Handskrivna program kan importeras som preliminära utkast.

GainPilot ska kunna:

- extrahera möjliga övningar,

- föreslå tolkningar,

- och låta användaren bekräfta.

Systemet ska inte automatiskt aktivera kritiska siffror som:

- belastning,

- procent,

- eller repetitionsmål

om handstilen är osäker.

Den ursprungliga bilden ska kunna bevaras som provenance om användaren tillåter det.

11.16 TEXTBASERAD IMPORT

Användaren ska kunna klistra in text som:

Måndag:

Bänkpress 4x8

Skivstångsrodd 4x10

Axelpress 3x10

GainPilot ska kunna strukturera texten.

Systemet ska förstå vanliga former som:

- 4x8,

- 4 × 8,

- 3 sets of 10,

- AMRAP,

- EMOM,

- RPE 8,

- RIR 2,

- procentangivelser,

- och tidsintervaller.

Tolkningen ska vara språk- och lokaliseringsmedveten.

11.17 FÖRKORTNINGAR

Externa program använder ofta förkortningar.

Exempel:

- BP,

- SQ,

- DL,

- RDL,

- OHP,

- DB,

- BB,

- KB,

- BW,

- AMRAP,

- EMOM,

- RPE,

- och RIR.

Förkortningar ska tolkas i kontext.

GainPilot ska använda:

- programspråk,

- övriga övningar,

- träningsdomän,

- utrustning,

- och användarens historik.

En osäker förkortning ska kräva bekräftelse.

Systemet får inte tyst välja den vanligaste betydelsen när flera rimliga alternativ finns.

11.18 SET OCH REPETITIONER

GainPilot ska kunna normalisera olika sätt att skriva set och repetitioner.

Exempel:

- 4 × 8,

- 4x8,

- 4 sets 8 reps,

- 8, 8, 8, 8,

- 4 arbetsset,

- eller “fyra set till RIR 2”.

Systemet ska skilja mellan:

- planerade set,

- arbetsset,

- uppvärmningsset,

- backoff-set,

- dropset,

- myo-reps,

- rest-pause,

- och andra specialformat.

Alla specialformat ska inte automatiskt reduceras till vanliga set.

11.19 BELASTNING

Belastning kan uttryckas genom:

- kilogram,

- pund,

- procent av max,

- RPE,

- RIR,

- bandnivå,

- maskinsteg,

- kroppsvikt,

- assistans,

- eller fri text.

GainPilot ska normalisera enheten men bevara originalet.

Exempel:

Original:

135 lb.

Canonical värde:

61,2 kilogram efter konvertering.

Visning:

Kan följa användarens valda enhet.

Systemet ska inte ändra användarens historiska prestation genom avrundning utan att originalvärdet bevaras.

11.20 TEMPO

Tempo kan uttryckas som exempelvis:

- 3-1-1-0,

- långsam excentrisk,

- paus i botten,

- kontrollerat,

- eller explosivt.

GainPilot ska kunna strukturera tydliga tempoangivelser.

Otydligt språk ska kunna sparas som instruktion utan falsk exakt normalisering.

Exempel:

“Kontrollerat tempo” ska inte automatiskt bli ett exakt 3-0-1-0-tempo.

11.21 VILA

Vila kan anges som:

- sekunder,

- minuter,

- intervall,

- “vid behov”,

- eller implicit genom workoutformat.

GainPilot ska kunna skilja mellan:

- vila mellan set,

- vila mellan övningar,

- vila mellan rundor,

- och aktiv vila.

Om vila saknas ska systemet kunna:

- lämna fältet tomt,

- använda ett tydligt GainPilot-förslag,

- eller be användaren bekräfta.

Ett föreslaget värde ska markeras som GainPilot-tillägg och inte originalprogram.

11.22 PROGRESSION

Progression är ofta den mest otydliga delen av externa program.

Den kan anges som:

- höj varje vecka,

- öka när alla reps klaras,

- följ procenttabell,

- använd RPE,

- gör fler rundor,

- minska assistans,

- eller följ tränarens instruktion.

GainPilot ska försöka strukturera progressionen.

Om progression saknas ska programmet kunna klassificeras som:

- manuell progression,

- okänd progression,

- statiskt upplägg,

- eller kräver användarbeslut.

GainPilot får inte uppfinna en progressionsregel och presentera den som original.

11.23 PROGRAMLÄNGD

Programlängd kan anges som:

- exakt antal veckor,

- tills mål uppnås,

- löpande,

- återkommande mikrocykel,

- eller okänt.

GainPilot ska representera detta tydligt.

Ett program utan angiven sluttid ska inte automatiskt få en påhittad programlängd.

Systemet kan föreslå en första utvärderingspunkt som GainPilot-tillägg.

11.24 VECKOSTRUKTUR

GainPilot ska kunna identifiera:

- fasta veckodagar,

- passnummer,

- roterande schema,

- A/B-struktur,

- och asynkron träningsordning.

Exempel:

Programmet kan ange:

Dag 1

Dag 2

Vila

Dag 3

Dag 4

Detta är inte nödvändigtvis samma sak som måndag till torsdag.

GainPilot ska bevara programmets faktiska logik.

11.25 PROGRAMBLOCK

Ett externt program kan innehålla flera block.

Exempel:

- introduktion,

- volym,

- styrka,

- toppning,

- deload,

- testvecka,

- eller återhämtning.

GainPilot ska kunna importera blocken som separata strukturer.

Om blockgränserna är otydliga ska systemet markera detta.

Programmet ska inte plattas ut till en enda lång lista om blocken har olika syften.

11.26 SUPERSET, CIRKLAR OCH KOMPLEX

GainPilot ska kunna tolka grupperade aktiviteter.

Exempel:

A1/A2,

superset,

tri-set,

circuit,

complex,

eller stationer.

Systemet ska bevara:

- ordning,

- gruppidentitet,

- vila,

- och om aktiviteterna alterneras.

Två övningar i samma tabellrad får inte automatiskt behandlas som separata sekventiella övningar om programmet avser superset.

11.27 CROSSFIT-IMPORT

CrossFit-program kräver särskild struktur.

GainPilot ska kunna importera:

- warm-up,

- strength,

- skill,

- workout,

- AMRAP,

- EMOM,

- rounds for time,

- time cap,

- scaling,

- och rörelsestandard.

Systemet ska även kunna identifiera om programmet kommer från:

- användarens box,

- offentlig workout,

- tävling,

- eller egen programmering.

GainPilot får inte kopiera eller distribuera skyddad boxprogrammering till andra användare.

11.28 CALISTHENICS-IMPORT

Calisthenicsprogram kan innehålla:

- skills,

- progressioner,

- regressioner,

- assistans,

- hålltid,

- kvalitetsmål,

- och rörelseförberedelser.

GainPilot ska kunna skilja mellan:

- huvudskill,

- styrkestöd,

- teknikdrill,

- och mobilitetsarbete.

En progression som skrivs som text ska inte automatiskt kopplas till canonical färdighetsgraf utan matchningskontroll.

11.29 KONDITIONSIMPORT

Konditionsprogram kan innehålla:

- distans,

- tid,

- tempo,

- puls,

- zon,

- effekt,

- intervaller,

- återhämtning,

- och terräng.

GainPilot ska kunna importera strukturer som:

5 × 4 minuter i zon 4

med 2 minuter lugn återhämtning.

Systemet ska skilja mellan:

- arbetstid,

- vilotid,

- uppvärmning,

- nedvarvning,

- och total passlängd.

11.30 KOSTPROGRAM OCH MÅLTIDSPLANER

Importmotorn ska på sikt även kunna hantera:

- måltidsplaner,

- receptlistor,

- energi- och makromål,

- inköpslistor,

- och professionellt skapade kostupplägg.

Samma principer ska gälla:

- källbevarande,

- canonical normalisering,

- allergenkontroll,

- rättighetsbedömning,

- och användarbekräftelse.

Ett medicinskt kostupplägg ska inte automatiskt behandlas som vanlig wellness-planering.

11.31 CANONICAL NORMALISERING

Efter extraktion ska externa data normaliseras mot GainPilots canonical modeller.

Normalisering kan omfatta:

- övningsidentiteter,

- aktiviteter,

- setformat,

- enheter,

- träningsdagar,

- programblock,

- progression,

- intensitet,

- och språk.

Normalisering ska inte förstöra originaldata.

Varje normaliserat objekt ska kunna länkas tillbaka till källan.

11.32 EXAKT MATCHNING

När extern data exakt matchar en canonical identitet kan GainPilot koppla den med hög säkerhet.

Exempel:

Externt namn:

Barbell Bench Press.

Canonical match:

barbell-bench-press.

Matchningen ska ändå ta hänsyn till:

- variant,

- tempo,

- paus,

- vinkel,

- och teknikstandard.

Textmässig exakt matchning är inte alltid teknisk identitet.

11.33 SYNONYMMATCHNING

GainPilot ska kunna matcha etablerade synonymer.

Exempel:

RDL

→ Romanian deadlift

→ Rumänska marklyft.

Synonymer ska komma från:

- canonical synonymregister,

- lokaliseringsdata,

- och granskade externa källor.

Användarens egen privata synonym kan lagras utan att bli global.

11.34 FUZZY MATCHNING

När ett namn inte matchar exakt kan systemet använda fuzzy matchning.

Fuzzy matchning kan ta hänsyn till:

- stavning,

- språk,

- ordordning,

- utrustning,

- träningsdomän,

- och omgivande programstruktur.

En fuzzy matchning ska ha säkerhetsnivå.

Låg säkerhet ska kräva bekräftelse.

GainPilot får inte använda en låg säkerhetsmatchning som aktiv övning utan tydlig kontroll.

11.35 KONTESTBASERAD MATCHNING

Samma namn kan betyda olika saker i olika sammanhang.

Exempel:

“Press” kan betyda:

- bänkpress,

- militärpress,

- benpress,

- eller maskinpress.

GainPilot ska använda kontext som:

- muskelgrupp,

- övriga övningar,

- utrustning,

- träningsdomän,

- och källans språk.

Systemet ska fortfarande fråga när osäkerheten är betydande.

11.36 OKÄND ÖVNING

Om en övning inte kan matchas ska GainPilot skapa en okänd importerad övning.

Den ska kunna innehålla:

- originalnamn,

- beskrivning,

- källa,

- programfunktion,

- och eventuell media.

Den ska vara privat för användaren eller importen.

Arnold kan fråga:

Jag hittar ingen säker canonical matchning för “Cable Power Row”. Är detta en vanlig kabelrodd, en explosiv roddvariant eller en egen övning från programskaparen?

11.37 DUBLETTER

Import från flera källor kan skapa dubbletter.

GainPilot ska kunna upptäcka:

- samma program importerat flera gånger,

- samma träningspass i flera format,

- samma övningsresultat från både app och wearable,

- och samma dokument med nytt filnamn.

Dubblettkontroll kan använda:

- checksumma,

- datum,

- källa,

- träningsinnehåll,

- och resultat.

Systemet ska inte radera dubbletter automatiskt när osäkerhet finns.

Användaren ska kunna granska.

11.38 ENHETSNORMALISERING

GainPilot ska kunna normalisera:

- kilogram och pund,

- kilometer och miles,

- minuter och sekunder,

- watt,

- puls,

- tempo,

- och andra relevanta enheter.

Originalvärdet ska bevaras.

Konvertering ska vara reproducerbar.

Historiska resultat får inte förändras av senare byte av användarens visningsenhet.

11.39 DATUM OCH TID

Importerad historik kan använda olika:

- tidszoner,

- datumformat,

- veckostarter,

- och lokala konventioner.

GainPilot ska normalisera tid utan att förlora originalkontext.

Exempel:

03/04/2026 kan vara 3 april eller 4 mars beroende på källa.

Osäkra datum ska kräva bekräftelse eller markeras som osäkra.

11.40 ANVÄNDARBEKRÄFTELSE

Användaren ska få en begriplig förhandsgranskning före aktivering.

Förhandsgranskningen ska kunna visa:

- antal veckor,

- antal pass,

- matchade övningar,

- okända övningar,

- osäkra värden,

- saknade regler,

- och viktiga varningar.

Arnold kan säga:

Jag har importerat ett åttaveckorsprogram med fyra pass per vecka.

42 övningsposter matchades säkert.

3 behöver din bekräftelse.

Progressionen är tydlig för huvudlyften men saknas för tillbehörsövningarna.

Två övningar kräver utrustning du inte har markerat.

Användaren ska kunna korrigera innan aktivering.

11.41 MASSBEKRÄFTELSE OCH DETALJGRANSKNING

GainPilot ska inte kräva att användaren bekräftar varje fält när säkerheten är hög.

Systemet ska använda:

- automatisk acceptans för hög säkerhet och låg risk,

- grupperad bekräftelse för liknande poster,

- och detaljgranskning för osäkra eller viktiga fält.

Exempel:

Tio vanliga övningsnamn kan bekräftas tillsammans.

En oklar huvudövning ska granskas separat.

11.42 KONFLIKTER MED ANVÄNDARMODELLEN

Ett importerat program kan strida mot användarens aktuella profil.

Exempel:

- programmet kräver fem dagar men användaren kan träna tre,

- programmet använder blockerad övning,

- programmet kräver saknad utrustning,

- passet överskrider tillgänglig tid,

- eller volymen är olämplig för användarens nivå.

GainPilot ska inte tyst ändra originalprogrammet.

Systemet ska visa konflikten och erbjuda val.

Exempel:

Programmet innehåller fem träningsdagar, men din nuvarande planering tillåter tre.

Du kan:

1. behålla originalet och planera manuellt,

2. låta GainPilot skapa en tredagarsanpassning,

3. eller importera programmet endast för analys.

11.43 SÄKERHETSKONTROLL

Före aktivering ska GainPilot kontrollera:

- blockerade övningar,

- smärt- eller skaderelaterade begränsningar,

- professionella instruktioner,

- olämplig träningsökning,

- och andra högrisksignaler.

Säkerhetskontrollen ska inte framställa GainPilot som medicinsk garant.

Den ska identifiera tydliga konflikter inom systemets kända mandat.

11.44 BELASTNINGSANALYS

GainPilot ska kunna analysera importerad träningsbelastning.

Analysen kan omfatta:

- träningsfrekvens,

- setvolym,

- intensitet,

- rörelsemönster,

- muskelgrupper,

- konditionsbelastning,

- och progression.

Systemet ska jämföra programmet mot:

- användarens aktuella nivå,

- tidigare program,

- övrig aktivitet,

- och mål.

En analys ska uttrycka osäkerhet när data saknas.

11.45 PASSLÄNGDSANALYS

GainPilot ska uppskatta passlängd utifrån:

- antal övningar,

- set,

- vila,

- superset,

- uppvärmning,

- och utrustningsbyten.

Om programmet sannolikt överskrider användarens tid ska Arnold kunna säga:

Originalpasset uppskattas ta cirka 80–95 minuter, medan du har angett högst 60 minuter. Jag kan skapa en prioriterad kortversion utan att skriva över originalet.

11.46 RÖRELSEBALANS

GainPilot ska kunna analysera programmets rörelsemönster.

Det kan exempelvis identifiera:

- mycket press men lite drag,

- hög knädominant belastning,

- saknad vertikal dragträning,

- eller flera överlappande höftdominanta pass.

Analysen ska inte automatiskt klassificera varje asymmetri som fel.

Programmet kan ha ett specifikt syfte.

Arnold ska sätta observationen i relation till målet.

11.47 MUSKELGRUPPSFÖRDELNING

GainPilot kan analysera ungefärlig belastning per muskelgrupp.

Analysen ska använda:

- övningsgrafen,

- arbetsset,

- programfunktion,

- och relationernas säkerhet.

Den får inte presenteras som exakt biologisk mätning.

Systemet ska kunna säga:

Programmet prioriterar bröst och framsida lår tydligt. Det kan vara avsiktligt, men ryggvolymen är lägre än i ditt nuvarande upplägg.

11.48 PROGRESSIONSANALYS

GainPilot ska bedöma om programmet har en fungerande progressionsmodell.

Frågor kan vara:

- när höjs belastningen,

- vad händer vid misslyckande,

- hur hanteras variation,

- finns deload,

- och hur avslutas blocket?

Ett program utan explicit progression kan fortfarande användas.

Det ska däremot inte framställas som självanpassande.

11.49 ÅTERHÄMTNINGSANALYS

GainPilot ska analysera om programmets struktur ger rimlig återhämtning i relation till:

- användarens nivå,

- träningsfrekvens,

- övrig aktivitet,

- kostmål,

- och aktuella begränsningar.

Systemet ska inte påstå att det kan förutsäga exakt återhämtning.

Analysen ska vara ett beslutsstöd.

11.50 KOMPATIBILITET MED KOSTMÅL

Ett importerat träningsprogram kan behöva analyseras mot användarens kostfas.

Exempel:

Ett mycket högvolymprogram kan vara svårare att tolerera under ett aggressivt energiunderskott.

GainPilot ska kunna flagga relationen utan att automatiskt förändra programmet.

11.51 KOMPATIBILITET MED ANDRA TRÄNINGSDOMÄNER

Användaren kan kombinera det importerade programmet med:

- löpning,

- CrossFit,

- calisthenics,

- idrott,

- eller fysisk vardagsaktivitet.

GainPilot ska analysera överlappning och målkonflikt.

Det importerade programmet får inte behandlas som om det existerar isolerat.

11.52 ORIGINALPROGRAM OCH ANPASSAD VERSION

När GainPilot förändrar ett importerat program ska originalet bevaras.

Systemet ska skapa:

- originalversion,

- anpassad version,

- och tydlig förändringsdiff.

Exempel:

Original:

Fem träningsdagar.

Anpassad version:

Tre träningsdagar.

Förändringar:

- dag 1 och 2 kombinerades,

- två lägre prioriterade isolationsövningar togs bort,

- veckovolymen reducerades,

- konditionspasset flyttades.

Användaren ska kunna jämföra och återgå.

11.53 ANPASSNING FÅR INTE FELAKTIGT TILLSKRIVAS KÄLLAN

När GainPilot ändrar ett externt program ska systemet inte presentera ändringen som om programskaparen hade gjort den.

Arnold ska säga:

Det här är GainPilots anpassning av originalprogrammet.

Inte:

Det här är programskaparens rekommendation.

Provenance ska förbli tydlig.

11.54 SKAPARE OCH COACHRELATION

Om programmet kommer från en mänsklig tränare ska GainPilot respektera relationen.

Användaren ska kunna ange:

- GainPilot får endast logga,

- GainPilot får analysera,

- GainPilot får föreslå,

- eller GainPilot får anpassa vissa delar.

GainPilot ska inte försöka ersätta tränaren utan användarens beslut.

Arnold kan fungera som stöd runt programmet.

11.55 DELNING MED TRÄNARE

Framtida stöd kan låta användaren dela:

- träningslogg,

- avvikelser,

- feedback,

- och GainPilot-analyser

med en tränare.

Delning ska vara explicit och granulär.

Tränaren ska inte automatiskt få tillgång till:

- kostdata,

- annan Omnira-kontext,

- privat minne,

- eller andra projekt.

Varje relation ska ha egen behörighetsmodell.

11.56 IMPORT AV HISTORISK TRÄNINGSDATA

GainPilot ska kunna importera historik som:

- genomförda pass,

- set,

- repetitioner,

- vikter,

- distanser,

- tider,

- puls,

- och anteckningar.

Historisk data ska ha:

- källa,

- tidpunkt,

- matchningsstatus,

- och kvalitetsnivå.

Systemet ska skilja mellan:

- planerad data,

- genomförd data,

- och efterhandsregistrering.

11.57 PLANERAT OCH GENOMFÖRT

Externa appar kan exportera både plan och resultat.

GainPilot ska inte blanda samman dem.

Exempel:

Planerat:

100 kilogram × 8.

Genomfört:

100 kilogram × 7.

Båda behövs för analys.

Om exporten inte skiljer dem tydligt ska systemet markera osäkerhet.

11.58 TIDIGARE PERSONBÄSTA

Importerade personbästa ska valideras mot:

- övningsvariant,

- teknikstandard,

- enhet,

- datum,

- och källa.

De kan visas som importerade historiska resultat.

GainPilot ska inte automatiskt använda dem som aktuell programnivå.

11.59 IMPORTERAD KROPPSDATA

Kroppsvikt och andra kroppsmått kan importeras.

Systemet ska kontrollera:

- enhet,

- mättidpunkt,

- datakälla,

- dubbletter,

- och extrema felvärden.

Importerad kroppsfettprocent ska behandlas med särskild osäkerhet beroende på mätmetod.

GainPilot får inte presentera den som exakt.

11.60 IMPORTERAD SENSOR- OCH WEARABLEDATA

Wearabledata kan omfatta:

- puls,

- aktivitet,

- sömn,

- distans,

- tempo,

- effekt,

- och energiförbrukning.

GainPilot ska kunna:

- normalisera leverantörsformat,

- ta bort dubbletter,

- markera saknad data,

- och bevara leverantörskälla.

Beräknad energiförbrukning ska behandlas som uppskattning.

11.61 API-INTEGRATION

När en extern tjänst erbjuder API ska GainPilot föredra strukturerad och behörighetsstyrd integration framför återkommande manuell uppladdning.

API-integrationen ska ha:

- OAuth eller annan säker autentisering,

- definierade scopes,

- synkroniseringsriktning,

- datatyper,

- felhantering,

- rate limits,

- och återkallelse.

GainPilot ska inte begära bredare åtkomst än integrationen behöver.

11.62 LÄSBEHÖRIGHET OCH SKRIVBEHÖRIGHET

Läs- och skrivbehörighet ska separeras.

En integration som används för import behöver inte automatiskt få skriva tillbaka till källan.

Skrivbehörighet ska kräva:

- uttryckligt syfte,

- användargodkännande,

- konfliktmodell,

- och rollbackstrategi.

GainPilot ska inte skriva över externa träningsprogram utan tydligt mandat.

11.63 ENKELRIKTAD SYNKRONISERING

Enkelriktad synkronisering kan användas när:

- GainPilot endast läser historik,

- en extern coachplattform är källsystem,

- eller konfliktrisken är hög.

Systemet ska tydligt visa vilket system som är källa till sanningen.

11.64 TVÅVÄGSSYNKRONISERING

Tvåvägssynkronisering är mer riskfylld.

Den kräver regler för:

- vilken version som vinner,

- samtidiga ändringar,

- radering,

- offlineändringar,

- och konflikter.

GainPilot ska inte aktivera tvåvägssynkronisering som standard.

En förändring ska inte kunna studsa fram och tillbaka mellan system.

11.65 KÄLLSYSTEM

För varje integrerad datatyp ska GainPilot kunna definiera ett källsystem.

Exempel:

Träningsprogram:

Extern tränarplattform.

Träningsresultat:

GainPilot.

Puls:

Träningsklocka.

Kalender:

Google Kalender.

Källsystemet ska påverka:

- skrivbehörighet,

- konfliktlösning,

- och användarens förväntningar.

11.66 KONFLIKTHANTERING

När två system innehåller olika versioner ska GainPilot kunna:

- välja källsystem,

- be användaren,

- skapa parallella versioner,

- eller pausa synkronisering.

Systemet får inte tyst skriva över den senaste ändringen enbart utifrån tidsstämpel när klockor eller offlineändringar kan vara osäkra.

11.67 RADERING I KÄLLSYSTEM

Om data raderas i den externa tjänsten ska GainPilot följa definierad policy.

Möjliga modeller:

- spegla raderingen,

- behålla historisk kopia,

- arkivera,

- eller fråga användaren.

Policyn ska vara tydlig före synkronisering.

GainPilot ska respektera rättsliga och användarstyrda raderingskrav.

11.68 SYNKRONISERINGSSTATUS

Användaren ska kunna se:

- senaste lyckade synkronisering,

- källa,

- fel,

- väntande poster,

- och eventuella konflikter.

GainPilot får inte låtsas att synkronisering lyckats när den är ofullständig.

11.69 FELHANTERING

Import kan misslyckas helt eller delvis.

Systemet ska klassificera fel som:

- filen kunde inte läsas,

- formatet stöds inte,

- vissa fält saknas,

- matchning är osäker,

- API-åtkomst saknas,

- rättighet är oklar,

- eller säkerhetskontroll misslyckades.

Arnold ska ge ett konkret nästa steg.

Exempel:

Jag kunde läsa träningsdagarna men inte tabellen med procentbelastning. Du kan ladda upp den sidan separat eller fylla i procenten manuellt.

11.70 PARTIELL IMPORT

GainPilot ska kunna slutföra en partiell import.

Exempel:

- tre av fyra veckor kunde läsas,

- de flesta övningarna matchades,

- eller historiken saknar RPE.

Systemet ska tydligt visa vad som saknas.

Partiell import får inte beskrivas som komplett.

11.71 ÅTERUPPTA IMPORT

En importprocess ska kunna pausas och återupptas.

Användaren ska inte behöva börja om om:

- filen är stor,

- bekräftelse krävs,

- eller en integration tillfälligt misslyckas.

Importstatus ska versioneras.

11.72 IDEMPOTENT IMPORT

Samma fil eller datapaket ska kunna importeras igen utan att automatiskt skapa dubbletter.

Importmotorn ska använda:

- checksumma,

- källidentifierare,

- extern postidentitet,

- och innehållsjämförelse.

Användaren ska kunna välja att skapa en ny version när materialet faktiskt har ändrats.

11.73 CHECKSUMMOR

Filer och större importpaket ska få checksumma.

Checksumman kan hjälpa till att:

- upptäcka dubbletter,

- verifiera att källan inte förändrats,

- och koppla analysen till exakt filversion.

En ny fil med samma namn men annan checksumma ska behandlas som potentiellt ny version.

11.74 VERSIONERING AV IMPORTEN

Varje import ska ha egen version.

Versionen ska kunna innehålla:

- källfil,

- extraktionsresultat,

- normaliserad data,

- användarkorrigeringar,

- analys,

- och aktiveringsstatus.

Om användaren laddar upp en uppdaterad version ska GainPilot kunna jämföra dem.

11.75 DIFF MELLAN PROGRAMVERSIONER

GainPilot ska kunna visa skillnader mellan två programversioner.

Exempel:

- tillagd vecka,

- borttagen övning,

- ändrat setantal,

- ändrad progression,

- ny träningsdag,

- eller uppdaterad tekniknotering.

Diffen ska skilja mellan:

- ändring i originalkällan,

- användarkorrigering,

- och GainPilot-anpassning.

11.76 ARKIVERING

Gamla program ska kunna arkiveras.

Arkivering ska bevara:

- historik,

- genomförda resultat,

- källa,

- och analys.

Arkiverade program ska inte fortsätta styra aktiv planering om de inte uttryckligen används som historisk kontext.

11.77 AVVISAD IMPORT

En import kan avvisas om:

- filen är skadlig eller osäker,

- innehållet inte går att tolka,

- rättighetsrisken är för hög för den önskade användningen,

- eller säkerhetskonflikten inte kan hanteras.

Avvisning ska inte radera originalet utan tydlig policy och användarbeslut.

11.78 SÄKER FILHANTERING

Importerade filer ska hanteras som potentiellt osäkra.

GainPilot ska använda:

- filtypsvalidering,

- storleksgränser,

- malwarekontroll där relevant,

- isolerad bearbetning,

- och begränsad exekvering.

Dokumentmakron eller inbäddad kod ska inte köras.

Filer ska inte få direkt påverka applikationslogik.

11.79 DATAMINIMERING

GainPilot ska endast extrahera data som är relevant för importens syfte.

Ett dokument kan innehålla:

- personuppgifter,

- kontaktuppgifter,

- privata anteckningar,

- eller annan information

som inte behövs för träningsprogrammet.

Systemet ska undvika att lagra eller använda irrelevant innehåll.

11.80 PRIVATA ANTECKNINGAR

Ett program från en tränare kan innehålla privata kommentarer.

GainPilot ska behandla dem som privat användar- eller coachdata.

De får inte:

- bli canonical träningskunskap,

- användas för andra användare,

- eller visas utanför rätt behörighetsrelation.

11.81 KÄNSLIGA UPPGIFTER

Importerade dokument kan innehålla:

- hälsouppgifter,

- skador,

- medicinsk information,

- eller annan känslig data.

GainPilot ska identifiera att starkare skydd kan krävas.

Systemet ska inte automatiskt använda all känslig information i Arnold-minnet.

11.82 HERMES OCH IMPORTERAD KONTEXT

Hermes ska kontrollera hur importerad data får delas mellan:

- GainPilot,

- Arnold,

- Atlas,

- och andra Omnira-domäner.

Exempel:

Atlas kan behöva analysera programstrukturen.

Atlas behöver inte automatiskt få tillgång till privata coachanteckningar eller personidentifierande information.

Hermes ska kunna dela en minimerad strukturerad representation.

11.83 ARNOLDS ROLL

Arnold ska guida användaren genom importen.

Han ska kunna:

- fråga vad användaren vill uppnå,

- förklara vad som kunde läsas,

- visa osäkerheter,

- be om bekräftelse,

- presentera konflikter,

- och hjälpa användaren aktivera rätt version.

Arnold ska inte överbelasta användaren med tekniska importdetaljer.

Exempel:

Jag har läst in programmet. Det mesta är tydligt, men tre saker behöver bekräftas innan det blir aktivt:

1. Om “BP” betyder bänkpress.

2. Om dag 4 är valfri eller obligatorisk.

3. Hur vikten ska höjas när alla repetitioner klaras.

11.84 ATLAS ROLL

Atlas ska hjälpa GainPilot med:

- källbedömning,

- extern research,

- leverantörsanalys,

- dubblettidentifiering,

- semantisk matchning,

- och förbättring av importregler.

Atlas kan även identifiera:

- återkommande okända format,

- vanliga felmatchningar,

- saknade canonical övningar,

- och nya integrationsbehov.

Atlas får inte göra privata importer globala utan separat governance.

11.85 EXTERN RESEARCH

När GainPilot behöver förstå en offentlig programkälla kan Atlas söka efter:

- officiell dokumentation,

- programskaparens instruktioner,

- licens,

- förkortningar,

- och versionshistorik.

Research ska använda trovärdiga källor.

En blogg eller social post får inte automatiskt definiera hur ett program fungerar om officiellt underlag finns.

11.86 PUBLICERADE PROGRAM

GainPilot kan analysera offentligt publicerade program.

Systemet ska skilja mellan:

- att länka,

- sammanfatta,

- analysera,

- personanpassa principer,

- och återpublicera fullständigt innehåll.

Full återpublicering kan kräva rättighet.

GainPilot ska hellre bevara en referens och skapa en tillåten personlig representation än att kopiera skyddat material.

11.87 ÖPPNA LICENSER

Program eller data med öppen licens kan användas enligt licensvillkoren.

GainPilot ska lagra:

- licenstyp,

- attribution,

- ändringskrav,

- kommersiell rätt,

- och vidarelicensieringsvillkor.

Öppen tillgång betyder inte alltid fri kommersiell återanvändning.

11.88 LEVERANTÖRSDATA

Externa leverantörer kan erbjuda:

- övningsdata,

- träningsprogram,

- recept,

- och historikimport.

GainPilot ska bedöma:

- API-stabilitet,

- datakvalitet,

- licens,

- export,

- leverantörsinlåsning,

- pris,

- och uppsägningsrisk.

Canonical data ska inte bli beroende av att leverantören alltid finns kvar.

11.89 LEVERANTÖRSADAPTER

Varje extern integration ska använda en adapter.

Adaptern ska översätta leverantörens format till GainPilots importmodell.

Canonical domänlogik ska inte byggas direkt mot leverantörens interna fält.

Detta gör det möjligt att:

- byta leverantör,

- hantera flera källor,

- och testa normalisering separat.

11.90 IMPORTKONTRAKT

GainPilot ska ha ett gemensamt importkontrakt.

Det ska minst kunna representera:

- source,

- source_version,

- source_record_id,

- content_type,

- original_payload_reference,

- extracted_fields,

- confidence,

- normalization_status,

- canonical_matches,

- user_confirmations,

- warnings,

- rights_status,

- and activation_status.

Exakta tekniska fältnamn definieras senare.

Principen är att alla importörer ska leverera samma styrda mellanformat.

11.91 MELLANFORMAT

GainPilot ska använda ett mellanformat mellan extraktion och canonical aktivering.

Mellanformatet ska:

- bevara originalvärden,

- representera osäkerhet,

- stödja flera kandidater,

- och kunna redigeras av användaren.

Det ska inte vara samma sak som den aktiva träningsmodellen.

Detta skyddar canonical data från osäker extraktion.

11.92 VALIDATION

Innan aktivering ska importen valideras.

Validering ska kontrollera:

- obligatoriska fält,

- rimliga värden,

- datatyper,

- enheter,

- referenser,

- övningsmatchningar,

- och programsammanhang.

Exempel:

- negativt setantal,

- 800 kilogram som sannolikt felskrivet,

- okänd tidsenhet,

- eller pass utan aktivitet

ska skapa varning eller fel.

11.93 RIMLIGHETSKONTROLL

GainPilot ska kunna upptäcka sannolikt orimliga värden.

Exempel:

- 50 set i en övning,

- 2 000 repetitioner i vanlig styrketräning,

- extrem veckovolym,

- eller negativ vilotid.

Rimlighetskontroll får inte automatiskt radera värdet.

Det kan vara ett ovanligt men korrekt specialformat.

Användaren ska kunna bekräfta.

11.94 SÄKERHETSSTOPP

Vissa importer ska inte kunna aktiveras utan granskning.

Exempel:

- program med tydligt extrema belastningsökningar,

- blockerade högriskövningar,

- oklar återgång efter skada,

- eller kostplan med extrem restriktion.

GainPilot ska kunna stoppa aktivering och förklara varför.

11.95 MANUELL REDIGERING

Användaren ska kunna redigera den normaliserade importen före aktivering.

Det ska gå att ändra:

- övningsmatchning,

- träningsdag,

- set,

- repetitioner,

- enhet,

- och progression.

Redigeringen ska dokumenteras som användarkorrigering.

Originalet ska bevaras.

11.96 MASSREDIGERING

Vid större importer ska GainPilot stödja massredigering.

Exempel:

- byt alla pund till kilogramvisning,

- matcha alla “DB Row” till en viss variant,

- ändra veckostart,

- eller markera alla dag 4-pass som valfria.

Massredigering ska visa förhandsgranskning och vara återställningsbar.

11.97 AKTIVERING

När importen är bekräftad ska användaren kunna aktivera den.

Aktivering ska skapa:

- aktiv programversion,

- källa,

- kontrollnivå,

- datum,

- eventuella GainPilot-anpassningar,

- och uppföljningspunkt.

Originalimporten ska förbli separat.

11.98 FÖRSTA VECKAN EFTER IMPORT

Den första användningsperioden ska behandlas som kalibrering.

GainPilot ska följa:

- faktisk passlängd,

- övningsmatchningar,

- belastningsnivå,

- användarens förståelse,

- och praktisk genomförbarhet.

Systemet ska inte omedelbart ändra programmet efter första avvikelsen.

Det ska kunna fråga:

Passet tog betydligt längre tid än importen antydde. Berodde det på väntetid, oklar ordning eller är den planerade volymen för hög för din tillgängliga tid?

11.99 IMPORTERAD PROGRESSION OCH GAINPILOT-AUTOMATIK

Om programmet har egen progression ska GainPilot respektera den.

Arnolds automatik ska inte samtidigt använda en konkurrerande GainPilot-progression.

Systemet ska kunna välja:

- extern progression styr,

- GainPilot följer endast,

- GainPilot föreslår avvikelser,

- eller GainPilot ersätter progressionen efter användarbeslut.

Två progressionsmotorer får inte styra samma arbetsset utan tydligt kontrakt.

11.100 PROGRAMSKAPARENS INTENTION

GainPilot ska försöka bevara programskaparens intention när den går att identifiera.

Exempel:

- viss träningsfrekvens,

- huvudlyftens placering,

- progression,

- eller blockstruktur.

Systemet ska inte förändra programmet enbart för att GainPilots standardmall ser annorlunda ut.

När en anpassning behövs ska Arnold beskriva hur intentionen bevaras eller förändras.

11.101 ANALYS UTAN VÄRDERING

GainPilot ska analysera program utan onödigt kategoriska omdömen.

Systemet ska undvika formuleringar som:

Det här programmet är dåligt.

Arnold kan i stället säga:

Programmet verkar vara byggt för fyra träningsdagar och högre volym än du har följt nyligen. Det kan fungera, men det kräver antingen längre pass eller en anpassning till din nuvarande tid.

Analysen ska vara konkret och kontextuell.

11.102 JÄMFÖRELSE MELLAN PROGRAM

Användaren ska kunna jämföra:

- nuvarande program,

- importerat program,

- GainPilot-förslag,

- och tidigare program.

Jämförelsen kan visa:

- träningsdagar,

- passlängd,

- volym,

- rörelsemönster,

- progression,

- utrustning,

- och målmatchning.

GainPilot ska inte utse en vinnare utan att beskriva kriterierna.

11.103 KOMBINERA PROGRAM

GainPilot ska vara försiktigt med att kombinera flera fullständiga program.

Systemet ska inte stapla:

- styrkeprogram,

- löpprogram,

- CrossFit-program,

- och calisthenicsprogram

utan samlad belastningsanalys.

Om användaren vill kombinera ska GainPilot:

1. fastställa huvudmål,

2. identifiera överlappning,

3. välja vilka delar som bevaras,

4. reducera dubbel belastning,

5. skapa en ny kombinerad programversion,

6. och dokumentera kompromisserna.

11.104 IMPORT AV DEL AV PROGRAM

Användaren ska kunna importera en del.

Exempel:

- endast huvudlyft,

- endast konditionsdel,

- endast en programvecka,

- eller endast ett skill-upplägg.

GainPilot ska kunna kombinera den importerade delen med en befintlig GainPilot-plan inom rätt mandat.

Provenance ska finnas på komponentnivå.

11.105 KOMPONENTÄGANDE

Ett aktivt program kan bestå av komponenter med olika ägare.

Exempel:

Styrkedel:

Extern tränare.

Kondition:

GainPilot.

Kost:

Arnold och kostmotorn.

Calisthenics-skill:

Användarens eget upplägg.

Varje komponent ska ha:

- källa,

- ändringsmandat,

- och uppföljningsansvar.

GainPilot får inte anta full äganderätt över hela planen.

11.106 LÅSTA IMPORTKOMPONENTER

Användaren ska kunna låsa importerade komponenter.

Exempel:

- huvudprogrammet får inte ändras,

- övningsordningen ska bevaras,

- eller tränarens belastningar får endast loggas.

GainPilot ska anpassa andra domäner runt de låsta komponenterna.

11.107 EXPORT FRÅN GAINPILOT

GainPilot ska även kunna exportera användarens program och historik.

Exporten ska kunna innehålla:

- programstruktur,

- träningsresultat,

- förändringshistorik,

- och användarens egna data.

Exporten ska använda öppna eller tydligt dokumenterade format där möjligt.

Användaren ska inte låsas in.

11.108 EXPORT OCH LICENS

GainPilot ska inte exportera skyddat externt innehåll utanför tillåten användning.

En användare ska kunna exportera:

- sina resultat,

- egna anteckningar,

- och GainPilot-skapade anpassningar.

Fullständigt källmaterial kan behöva begränsas av licens.

11.109 PORTABILITET

Import och export ska stödja dataportabilitet.

GainPilot ska kunna bevara:

- canonical identiteter,

- ursprungsidentifierare,

- enheter,

- tidsstämplar,

- och versionsinformation.

Ett exportformat ska vara begripligt även utanför GainPilot där möjligt.

11.110 LOKALISERING

Importmotorn ska stödja flera språk.

Det innebär stöd för:

- övningsnamn,

- datum,

- decimaltecken,

- enheter,

- veckodagar,

- och träningsförkortningar.

Exempel:

3,5 kilometer och 3.5 km ska kunna normaliseras korrekt utifrån källans locale.

Språkdetektion ska inte ensam avgöra innehållets betydelse.

11.111 TILLGÄNGLIGHET

Importflödet ska vara tillgängligt.

Användaren ska kunna:

- granska osäkra matchningar med tangentbord,

- använda skärmläsare,

- förstå varningar utan att enbart färg används,

- och få textbeskrivningar av visuella diffar.

Stora program ska inte kräva att användaren granskar en oändlig tabell utan struktur.

11.112 PRESTANDA

Stora importer kan innehålla flera års data.

GainPilot ska:

- bearbeta stegvis,

- visa status,

- hantera batcher,

- och undvika att blockera användarens normala användning.

Systemet ska kunna importera historik utan att allt måste aktiveras samtidigt.

11.113 KOSTNADSKONTROLL

AI-baserad dokumenttolkning kan skapa kostnader.

GainPilot ska använda:

- strukturerade parsermetoder först,

- selektiv modellanalys,

- batchning,

- cache,

- och återanvändning av tidigare matchningar.

Atlas ska inte läsa om samma dokument upprepade gånger utan skäl.

Kostnadskontroll får inte försämra säkerhetskritisk granskning.

11.114 MODELLVAL

Olika importuppgifter kan använda olika modeller.

Exempel:

- enkel CSV kräver ingen språkmodell,

- komplicerad tabell kan kräva visuell analys,

- fuzzy övningsmatchning kan använda embedding eller regelmodell,

- och rättighetsbedömning kan kräva separat research.

GainPilot ska välja minsta tillräckliga förmåga.

11.115 OSÄKERHET

Varje automatiskt tolkat fält ska kunna ha säkerhetsnivå.

Exempel:

Hög:

Exakt övningsnamn och tydliga siffror.

Medelhög:

Vanlig förkortning i tydlig träningskontext.

Låg:

Handskriven belastning eller oklar kolumn.

Säkerhetsnivån ska påverka behovet av användarbekräftelse.

11.116 FÄLTNIVÅ OCH OBJEKTNIVÅ

Osäkerhet ska kunna representeras både:

- per fält,

- och för hela objektet.

Exempel:

Övningen kan vara säkert identifierad, men repetitionsantalet osäkert.

Programmet kan vara huvudsakligen tydligt men sakna progressionsregel.

11.117 INFERENSER

GainPilot kan ibland dra inferenser.

Exempel:

Programmet verkar använda dubbel progression.

Inferensen ska inte skrivas in som källans uttryckliga regel utan bekräftelse.

Arnold kan fråga:

Jag tolkar instruktionen som att vikten höjs när alla tre set når tolv repetitioner. Stämmer det?

11.118 SPÅRBAR ANALYS

Programanalys ska kunna spåras till:

- importerad data,

- canonical övningsgraf,

- användarmodell,

- och analysregel.

Exempel:

Varning:

Hög pressvolym.

Underlag:

18 importerade pressarbetsset per vecka.

Källa:

Programversion 1.2.

Analysregel:

GainPilot training analysis vX.

Resultatet ska vara reviderbart.

11.119 MODELLHALLUCINATIONER

GainPilot ska skydda mot att språkmodeller uppfinner:

- saknade övningar,

- progression,

- vilotider,

- eller programförklaringar.

När information saknas ska fältet förbli:

- okänt,

- ofullständigt,

- eller GainPilot-förslag.

Det får inte fyllas i och presenteras som källa.

11.120 CANONICAL DATA FÅR INTE SKAPAS AV EN ENSKILD IMPORT

En privat eller extern import får inte automatiskt:

- skapa global övning,

- skapa canonical programmall,

- ändra substitutionsrelation,

- eller uppdatera träningsregler.

Canonical förändring kräver separat granskningsprocess.

11.121 IMPORTSIGNALER TILL ATLAS

Importsystemet ska kunna skicka strukturerade signaler till Atlas.

Exempel:

- ofta förekommande okänd övning,

- nytt leverantörsformat,

- återkommande felmatchning,

- vanlig programstruktur,

- eller ofta avvisad import.

Signalen ska vara minimerad och följa integritetsregler.

Atlas kan därefter skapa ett förbättringsförslag.

11.122 PLATTFORMSANALYS

Omnira och Atlas ska kunna analysera:

- lyckade och misslyckade importer,

- vanliga källtyper,

- bekräftelsebörda,

- matchningskvalitet,

- och aktiveringsgrad.

Analysen ska användas för att förbättra importupplevelsen.

Privata dokument ska inte göras läsbara för andra användare eller obehöriga produktfunktioner.

11.123 KONTROLLERAD KUNSKAPSUTVINNING

GainPilot kan identifiera kandidater till ny kunskap från återkommande importer.

Kandidater kan vara:

- ny synonym,

- ny övning,

- nytt format,

- eller vanlig programrelation.

Kandidaten ska genomgå:

Signal

→ Minimering

→ Oberoende verifiering

→ Rättighetskontroll

→ Teknisk granskning

→ Test

→ Canonical beslut

Importmaterialet får inte automatiskt bli träningsdata för global modellförbättring.

11.124 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar förbättringsbehov ska processen vara:

Signal

→ Analys

→ Hypotes

→ Förbättringsförslag

→ Riskbedömning

→ Godkänt scope

→ Separat branch

→ Implementation

→ Tester

→ Pull request

→ Granskning

→ Kontrollerad merge

→ Resultatuppföljning

Ingen agent får direkt ändra:

- importparser,

- canonical matchningsregler,

- rättighetsmodell,

- säkerhetsfilter,

- eller produktion

utan denna process.

11.125 TESTNING AV IMPORTMOTORN

Importmotorn ska testas på flera nivåer.

11.125.1 Enhetstester

Ska verifiera:

- enhetskonvertering,

- set- och repetitionsparsing,

- datumtolkning,

- förkortningar,

- och statusövergångar.

11.125.2 Kontraktstester

Ska verifiera datautbyte mellan:

- filhantering,

- extraktion,

- mellanformat,

- canonical matchning,

- användarbekräftelse,

- och aktivering.

11.125.3 Scenariotester

Ska omfatta:

- CSV-export,

- PDF-tabell,

- Word-dokument,

- skärmbild,

- handskriven plan,

- CrossFit-workout,

- calisthenicsprogram,

- löpintervaller,

- och flera års träningshistorik.

11.125.4 Säkerhetstester

Ska verifiera:

- filtypskontroll,

- makroblockering,

- behörigheter,

- privat dataseparation,

- och högriskaktivering.

11.125.5 Rättighetstester

Ska verifiera att privat och skyddat innehåll inte automatiskt publiceras eller blir globalt.

11.125.6 Regressionstester

Ska säkerställa att nya parserregler inte försämrar befintliga källformat.

11.126 GOLDEN FILES

GainPilot ska använda ett kontrollerat bibliotek av testfiler.

Golden files kan innehålla:

- typiska exportformat,

- svåra tabeller,

- språkvariationer,

- och kända edge cases.

Förväntat extraktionsresultat ska vara versionshanterat.

Privata användarfiler får inte läggas in som testdata utan rätt grund och anonymisering.

11.127 FUZZ-TESTNING

Importparser ska kunna testas med:

- oväntade tecken,

- saknade fält,

- mycket stora värden,

- blandade enheter,

- felaktiga datum,

- och trasiga tabeller.

Syftet är att säkerställa att systemet:

- inte kraschar,

- inte aktiverar felaktig data,

- och inte skapar osäkra canonical matchningar.

11.128 SIMULERING

GainPilot ska kunna simulera en importerad plan före aktivering.

Simuleringen kan kontrollera:

- passlängd,

- veckovolym,

- progression,

- utrustningskonflikter,

- och överlappning med annan aktivitet.

Simulering ska inte beskrivas som säker förutsägelse av biologiskt resultat.

11.129 OBSERVABILITY

Importprocessen ska vara observerbar.

Det ska gå att förstå:

- vilken källa som användes,

- vilket parsersteg som kördes,

- vilka fält som extraherades,

- vilka matchningar som gjordes,

- vilka varningar som skapades,

- vad användaren korrigerade,

- och vilken version som aktiverades.

Loggar ska minimera privat innehåll.

11.130 AUDIT LOG

Betydelsefulla importhändelser ska loggas.

Exempel:

- fil mottagen,

- import startad,

- extraktion klar,

- användare korrigerade övning,

- säkerhetsvarning skapad,

- program aktiverat,

- synkronisering återkallad,

- eller data exporterad.

Auditloggen ska vara behörighetsstyrd.

11.131 RETENTION

Importerade originalfiler ska ha retentionpolicy.

Användaren ska kunna välja eller informeras om:

- filen sparas,

- endast strukturerad data sparas,

- filen raderas efter import,

- eller filen arkiveras för provenance.

Känsliga originalfiler ska inte lagras längre än nödvändigt utan tydligt syfte.

11.132 RADERING

Användaren ska kunna radera:

- originalfil,

- importprojekt,

- normaliserad data,

- eller aktiv programversion

inom tillämpliga regler.

Systemet ska förklara skillnaden mellan:

- radering av original,

- radering av aktiv plan,

- och bevarande av nödvändig auditinformation.

11.133 ÅTERKALLA INTEGRATION

Användaren ska kunna återkalla en API-integration.

Återkallelse ska:

- stoppa framtida synkronisering,

- ta bort tokens,

- visa vilken data som redan finns,

- och låta användaren besluta om tidigare importerad data.

GainPilot får inte fortsätta använda en återkallad integration.

11.134 OFFLINEIMPORT

GainPilot kan stödja lokal eller senare synkroniserad import.

En offlineimport ska:

- bevara källfil,

- markera att central validering saknas,

- och slutföra säkerhetskontroll innan aktivering där det krävs.

Offline får inte användas för att kringgå rättighets- eller säkerhetsregler.

11.135 IMPLEMENTERINGSSTATUS

GainPilot ska vara ärligt med vilka format som stöds.

Exempel:

Fullt stöd:

CSV från definierad källa.

Begränsat stöd:

Allmän PDF.

Experimentellt:

Handskriven bild.

Inte stödd:

Krypterad eller lösenordsskyddad fil utan användaröppning.

Användaren ska inte tro att alla format tolkas perfekt.

11.136 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för programimport, externa källor och canonical normalisering.

**Kontrakt GP-153 — Import är separat från aktivering**

Externt material får inte bli aktiv plan enbart genom uppladdning eller extraktion.

**Kontrakt GP-154 — Originalet ska bevaras**

GainPilot ska skilja mellan originalinnehåll, extraktion, normalisering, användarkorrigering och GainPilot-anpassning.

**Kontrakt GP-155 — Provenance på fältnivå**

Betydelsefull importerad data ska kunna spåras till källa, tidpunkt och tolkningssteg.

**Kontrakt GP-156 — Rättighetsstyrd användning**

Privat tillgång till externt material får inte behandlas som obegränsad rätt till publicering, delning eller canonical återanvändning.

**Kontrakt GP-157 — Importläget ska vara uttryckligt**

GainPilot ska skilja mellan bevarande, analys, anpassning, konvertering och historikimport.

**Kontrakt GP-158 — Osäkerhet ska representeras**

Extraherade och matchade fält ska kunna ha säkerhetsnivå och kräva bekräftelse när det behövs.

**Kontrakt GP-159 — Mellanformat före canonical data**

Osäker extern data ska först lagras i ett styrt mellanformat och får inte skrivas direkt till den aktiva domänmodellen.

**Kontrakt GP-160 — Canonical matchning ska vara kontrollerad**

Övningar, aktiviteter och programkomponenter ska matchas genom exakt, synonym-, fuzzy- eller kontextbaserad metod med tydlig säkerhetsnivå.

**Kontrakt GP-161 — Okända poster ska förbli privata**

Ej matchade övningar och komponenter ska vara privata tills separat canonical granskning har slutförts.

**Kontrakt GP-162 — Programkonflikter ska synliggöras**

Konflikter med användarens tid, utrustning, säkerhetsbegränsningar och mål får inte döljas eller lösas tyst.

**Kontrakt GP-163 — Original och anpassning ska versionssepareras**

GainPilot-anpassningar av externa program ska skapas som separata versioner med tydlig diff.

**Kontrakt GP-164 — Programskaparens intention ska respekteras**

GainPilot ska bevara källans struktur och regler när användaren inte uttryckligen har beviljat ändringsmandat.

**Kontrakt GP-165 — Extern progression får inte konkurrera dolt**

Endast en uttryckligt vald progressionsmodell får operativt styra samma programkomponent.

**Kontrakt GP-166 — Komponentmandat**

Olika delar av användarens plan ska kunna ha olika källa, ägare och ändringsmandat.

**Kontrakt GP-167 — Strikt synkroniseringsriktning**

Läs-, skriv-, enkelriktad och tvåvägssynkronisering ska konfigureras separat och tydligt.

**Kontrakt GP-168 — Idempotent import**

Samma källdata ska kunna importeras igen utan oavsiktliga dubbletter.

**Kontrakt GP-169 — Säker filhantering**

Importerade filer ska valideras och bearbetas isolerat utan exekvering av inbäddad kod.

**Kontrakt GP-170 — Dataminimerad extraktion**

GainPilot ska endast extrahera och lagra information som är relevant för importens definierade syfte.

**Kontrakt GP-171 — Användarbekräftelse före högriskaktivering**

Osäkra, säkerhetskritiska eller centrala programfält ska kräva bekräftelse före aktivering.

**Kontrakt GP-172 — Canonical data kräver separat governance**

Ingen enskild privat eller extern import får direkt skapa global canonical kunskap.

**Kontrakt GP-173 — Spårbar programanalys**

Analyser av importerade program ska kunna kopplas till exakt källversion, canonical data och analysregel.

**Kontrakt GP-174 — Ingen hallucinerad komplettering**

Saknade fält får inte fyllas av AI och presenteras som om de kom från originalkällan.

**Kontrakt GP-175 — Portabilitet**

Användaren ska kunna exportera sina egna resultat, programversioner och GainPilot-skapade data i ett begripligt format.

**Kontrakt GP-176 — Branchbaserad importutveckling**

Förändringar av importparser, normalisering, canonical matchning, rättighetsmodell och säkerhetsfilter ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

11.137 ANTI-PRINCIPER

GainPilot ska inte:

- aktivera ett program direkt efter uppladdning utan validering,

- behandla all extern data som canonical,

- skriva över originalinnehållet med systemets tolkning,

- dölja osäkra matchningar,

- fylla saknade värden och presentera dem som källinformation,

- anta att användaren har obegränsade återpubliceringsrättigheter,

- göra köpta eller privata program till globala mallar,

- använda privata coachanteckningar som allmän träningskunskap,

- matcha övningar enbart efter textlikhet,

- tyst välja mellan flera möjliga förkortningar,

- behandla bild- eller handskriftsimport som säker,

- slå ihop planerade och genomförda resultat,

- använda gamla personbästa som aktuell träningsnivå,

- konvertera enheter utan att bevara originalvärdet,

- tolka otydliga datum utan kontroll,

- tvinga användaren att bekräfta varje lågriskfält,

- dölja konflikter med tid, utrustning eller säkerhetsbegränsningar,

- skriva om ett externt program utan separat version,

- tillskriva GainPilot-anpassningar till originalskaparen,

- skriva över en mänsklig tränares program utan mandat,

- kombinera flera fullständiga program utan belastningsanalys,

- låta två progressionsmotorer styra samma aktivitet,

- tillåta externa integrationer att skriva till GainPilot utan tydligt scope,

- aktivera tvåvägssynkronisering utan konfliktmodell,

- tyst radera data vid synkroniseringskonflikt,

- beskriva partiell import som komplett,

- skapa dubbletter vid upprepad import,

- köra dokumentmakron eller inbäddad kod,

- extrahera irrelevant privat information,

- göra användarskapade okända övningar globala,

- använda språkmodeller som enda parser för strukturerad data,

- använda privat användarinnehåll som testdata utan rätt grund,

- eller ändra importmotorn direkt i main eller produktion utan branch, tester och granskning.

11.138 KANONISKA BESLUT FRÅN KAPITEL 11

Följande beslut etableras:

1. GainPilot ska kunna importera externa träningsprogram, historik och relevanta planeringsdata.

2. Import och aktivering ska vara separata processer.

3. GainPilot ska stödja bevarandeläge, analysläge, anpassningsläge, konverteringsläge och historikläge.

4. Importens syfte ska fastställas före operativ användning.

5. GainPilot ska stödja strukturerade och ostrukturerade källor.

6. Varje import ska ha källidentitet.

7. Importerad data ska ha provenance.

8. Originalinnehåll ska hållas separat från GainPilots tolkning.

9. Användarkorrigeringar ska dokumenteras.

10. GainPilot ska respektera upphovsrätt och licensvillkor.

11. Privat användning får inte förväxlas med rätt till global publicering.

12. Privat importerad data ska hållas separat från canonical GainPilot-kunskap.

13. Canonical kunskapsförslag ska kräva oberoende granskning.

14. Extraktion ska stödja programstruktur, pass, övningar, set, repetitioner, belastning, progression och anteckningar.

15. Varje extraherat fält ska kunna ha säkerhetsnivå.

16. Tabeller ska tolkas med layoutmedvetenhet.

17. Bild- och skärmbildsimport ska betraktas som mer osäker.

18. Handskriven import ska kräva starkare bekräftelse.

19. Textimport ska stödja vanliga träningsformat och förkortningar.

20. Förkortningar ska tolkas i kontext.

21. GainPilot ska skilja mellan arbetsset, uppvärmningsset och specialformat.

22. Belastning ska kunna uttryckas genom vikt, procent, RPE, RIR, assistans och andra domänspecifika mått.

23. Originalenhet ska bevaras vid konvertering.

24. Otydligt tempo ska inte normaliseras till falsk precision.

25. Saknad vila ska inte automatiskt presenteras som originalvärde.

26. Extern progression ska struktureras där den är tydlig.

27. Saknad progression ska markeras som saknad eller manuell.

28. Programlängd ska inte uppfinnas.

29. Veckostruktur ska kunna vara kalenderbaserad, roterande eller asynkron.

30. Programblock ska bevaras.

31. Superset, cirklar och komplex ska representeras strukturerat.

32. CrossFit-import ska stödja AMRAP, EMOM, rounds, time cap, scaling och rörelsestandard.

33. Calisthenicsimport ska stödja skills, progressioner, assistans och kvalitetskriterier.

34. Konditionsimport ska stödja tid, distans, tempo, puls, effekt och intervaller.

35. Kost- och måltidsplaner ska följa samma provenance- och säkerhetsprinciper.

36. Extern data ska normaliseras mot GainPilots canonical modeller.

37. Canonical matchning ska kunna ske genom exakt, synonym-, fuzzy- och kontextbaserad matchning.

38. Osäkra matchningar ska kräva bekräftelse.

39. Okända övningar ska kunna bevaras privat.

40. Importmotorn ska upptäcka dubbletter.

41. Datum, tid och locale ska normaliseras med osäkerhetskontroll.

42. Användaren ska få förhandsgranskning före aktivering.

43. Bekräftelsebördan ska anpassas efter säkerhet och risk.

44. Konflikter med användarmodellen ska synliggöras.

45. Säkerhetskontroll ska ske före aktivering.

46. GainPilot ska analysera belastning, passlängd, rörelsebalans, muskelgrupper, progression och återhämtning.

47. Analysen ska sättas i relation till användarens mål och övriga aktivitet.

48. Originalprogram och GainPilot-anpassning ska vara separata versioner.

49. GainPilot-anpassningar får inte tillskrivas källan.

50. Mänskliga tränarrelationer ska respekteras.

51. Användaren ska kunna styra vilka delar GainPilot får påverka.

52. Historisk data ska skilja mellan planerat och genomfört.

53. Importerade personbästa ska valideras och inte behandlas som aktuell nivå.

54. Importerad kroppsfettdata ska presenteras med rätt osäkerhet.

55. Wearabledata ska ha leverantörskälla och kvalitetsstatus.

56. API-integrationer ska använda minsta nödvändiga scope.

57. Läs- och skrivbehörighet ska separeras.

58. Enkelriktad och tvåvägssynkronisering ska vara olika modeller.

59. Varje datatyp ska kunna ha definierat källsystem.

60. Konflikter ska inte lösas tyst.

61. Raderingsbeteende ska vara tydligt definierat.

62. Användaren ska kunna se synkroniseringsstatus och fel.

63. Partiell import ska stödjas och märkas tydligt.

64. Import ska kunna pausas och återupptas.

65. Import ska vara idempotent.

66. Filer och importpaket ska kunna använda checksumma.

67. Importer ska versioneras.

68. GainPilot ska kunna visa diff mellan programversioner.

69. Gamla program ska kunna arkiveras.

70. Importerade filer ska hanteras som potentiellt osäkra.

71. Inbäddad kod och makron får inte köras.

72. Extraktion ska vara dataminimerad.

73. Privata anteckningar och känsliga uppgifter ska ha starkare skydd.

74. Hermes ska styra hur importerad data delas med Atlas och andra Omnira-domäner.

75. Arnold ska guida användaren genom import och bekräftelse.

76. Atlas ska bidra med research, semantisk matchning, dubblettanalys och förbättringsförslag.

77. Offentliga källor ska analyseras med rättighetsmedvetenhet.

78. Öppna licenser ska lagras och följas.

79. Externa leverantörer ska integreras genom adapterlager.

80. GainPilot ska ha ett gemensamt importkontrakt och mellanformat.

81. Importer ska valideras strukturellt och rimlighetskontrolleras.

82. Högriskimporter ska kunna stoppas före aktivering.

83. Användaren ska kunna redigera normaliserad data.

84. Massredigering ska kunna förhandsgranskas och återställas.

85. Aktivering ska skapa en tydlig aktiv version.

86. Första perioden efter import ska behandlas som kalibrering.

87. Extern progressionsmodell ska respekteras tills användaren väljer något annat.

88. GainPilot ska försöka bevara programskaparens intention.

89. Programanalys ska vara konkret och kontextuell.

90. Användaren ska kunna jämföra program.

91. Flera program ska inte kombineras utan mål- och belastningsanalys.

92. Delar av program ska kunna importeras separat.

93. Programkomponenter ska kunna ha olika källa och mandat.

94. Importerade komponenter ska kunna låsas.

95. GainPilot ska stödja export och dataportabilitet.

96. Export ska respektera licens och upphovsrätt.

97. Importmotorn ska stödja lokalisering och tillgänglighet.

98. Stora importer ska bearbetas stegvis.

99. AI-kostnad ska begränsas genom strukturerade parsermetoder, cache och selektiv analys.

100. Minsta tillräckliga modell ska användas för varje importsteg.

101. Osäkerhet ska representeras på fält- och objektnivå.

102. Inferenser ska skiljas från uttrycklig källinformation.

103. Programanalys ska vara spårbar till källa och modellversion.

104. GainPilot ska skydda mot modellhallucinationer.

105. En enskild import får inte skapa global canonical data.

106. Importsystemet får skicka minimerade förbättringssignaler till Atlas.

107. Plattformsanalys ska hållas åtskild från privat användarinnehåll.

108. Canonical kunskapsutvinning ska kräva separat governance.

109. Importmotorn ska testas genom enhets-, kontrakts-, scenario-, säkerhets-, rättighets- och regressionstester.

110. Golden files ska användas för kända importformat.

111. Fuzz-testning ska användas mot trasiga och oväntade källor.

112. Importerade program ska kunna simuleras före aktivering.

113. Importprocessen ska vara observerbar och auditerbar.

114. Originalfiler ska följa definierad retention.

115. Användaren ska kunna radera importer och återkalla integrationer.

116. GainPilot ska vara ärligt med stödstatus för olika format.

117. Förändringar av importmotor och normalisering ska ske på separat branch.

118. Alla förändringar ska testas, granskas och merga kontrollerat.

119. Agentautonomi inom importdomänen ska vara explicit, begränsad och återkallelig.

120. GainPilot ska kunna använda externa program utan att förlora användarens kontroll eller källans ursprung.

11.139 IMPLEMENTERINGSORDNING

GainPilots programimport och externa källsystem ska implementeras stegvis.

Fas 1 — Gemensamt importkontrakt

Implementera:

- källidentitet,

- importstatus,

- originalreferens,

- mellanformat,

- säkerhetsnivå,

- och aktiveringsstatus.

Fas 2 — Enkel textimport

Implementera:

- träningsdagar,

- övningsnamn,

- set,

- repetitioner,

- belastning,

- och förhandsgranskning.

Fas 3 — CSV-import

Implementera:

- definierat tabellformat,

- enhetsnormalisering,

- datum,

- övningsmatchning,

- och dubblettkontroll.

Fas 4 — Canonical matchning

Implementera:

- exakt matchning,

- synonymmatchning,

- fuzzy matchning,

- säkerhetsnivå,

- och användarbekräftelse.

Fas 5 — Programaktivering

Implementera:

- importläge,

- validering,

- säkerhetskontroll,

- aktiv programversion,

- och rollback.

Fas 6 — Historikimport

Implementera:

- genomförda pass,

- planerat kontra genomfört,

- belastningshistorik,

- datum,

- och importerade personbästa.

Fas 7 — PDF- och dokumentimport

Implementera:

- tabellutvinning,

- rubriker,

- veckostruktur,

- passdelar,

- och osäkerhetsgranskning.

Fas 8 — Bild- och skärmbildsimport

Implementera:

- visuell extraktion,

- beskärningsvarningar,

- manuell korrigering,

- och starkare bekräftelsekrav.

Fas 9 — Programanalys

Implementera:

- passlängd,

- träningsfrekvens,

- rörelsemönster,

- muskelgruppsfördelning,

- progression,

- och användarkonflikter.

Fas 10 — Anpassade versioner

Implementera:

- originalversion,

- GainPilot-version,

- diff,

- låsta komponenter,

- och återställning.

Fas 11 — API-integrationer

Implementera:

- OAuth,

- scopes,

- enkelriktad synkronisering,

- källsystem,

- och felstatus.

Fas 12 — Tvåvägssynkronisering

Implementera först efter separat riskgranskning:

- konfliktlösning,

- samtidiga ändringar,

- skrivmandat,

- radering,

- och rollback.

Fas 13 — CrossFit-, calisthenics- och konditionsimport

Implementera:

- workouts,

- scaling,

- skills,

- assistans,

- intervaller,

- tempo,

- puls,

- och effekt.

Fas 14 — Kost- och receptimport

Implementera:

- måltidsplaner,

- recept,

- ingredienser,

- allergenkontroll,

- och kostplansversioner.

Fas 15 — Fördjupad intelligent import

Implementera:

- semantisk dokumenttolkning,

- modellval,

- automatisk gruppering,

- masskorrigering,

- och förbättringssignaler till Atlas.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- pull request,

- granskning,

- kontrollerad merge,

- och resultatuppföljning.

11.140 FRAMGÅNGSKRITERIER

Kapitel 11:s vision är framgångsrikt realiserad när:

- användaren kan importera ett befintligt träningsprogram utan att börja om,

- importen inte aktiveras innan den har validerats,

- originalkällan bevaras,

- GainPilots tolkning tydligt skiljs från källans innehåll,

- övningar normaliseras mot canonical identiteter,

- osäkra matchningar visas för användaren,

- okända övningar kan bevaras privat,

- programstrukturen bevarar veckor, dagar, passdelar och progression,

- CrossFit-, calisthenics- och konditionsformat inte tvingas till en enkel setmodell,

- enheter och datum normaliseras korrekt,

- dubbletter upptäcks,

- användaren kan korrigera importen före aktivering,

- konflikter med tid, utrustning, mål och säkerhetsbegränsningar synliggörs,

- programmet kan importeras för bevarande, analys, anpassning eller historik,

- GainPilot inte skriver över en mänsklig tränares program utan mandat,

- original och anpassad version kan jämföras,

- progressionsansvaret är tydligt,

- programkomponenter kan ha olika källa och ändringsmandat,

- historisk data skiljer mellan planerat och genomfört,

- API-integrationer använder minsta nödvändiga behörighet,

- synkroniseringsstatus och konflikter är synliga,

- importen är idempotent och versionshanterad,

- filer behandlas säkert,

- privata anteckningar och känsliga uppgifter skyddas,

- rättighets- och licensgränser respekteras,

- privata importer inte blir global canonical kunskap,

- användaren kan exportera sin egen data,

- Atlas kan identifiera förbättringsmöjligheter utan att direkt publicera privat innehåll,

- Hermes minimerar delad importkontext,

- importprocessen kan observeras och auditeras,

- modeller och parserregler är testade,

- och alla förbättringar genomförs genom separat branch, tester, pull request och kontrollerad merge.

11.141 SAMMANFATTNING

GainPilot ska kunna möta användaren där användaren redan befinner sig.

Plattformen ska inte kräva att tidigare träningsprogram, träningshistorik, coachrelationer och egna upplägg överges.

Programimport ska göra det möjligt att:

- bevara,

- förstå,

- analysera,

- följa,

- och vid rätt mandat anpassa

externt material.

Import får däremot aldrig innebära okontrollerad kopiering.

GainPilot ska skilja mellan:

- originalkällan,

- extraktionen,

- canonical normaliseringen,

- användarens korrigeringar,

- GainPilots analys,

- och den aktiva programversionen.

Varje viktig uppgift ska ha provenance.

Osäker information ska förbli osäker tills den bekräftats.

Saknad information ska inte uppfinnas.

Ett externt program ska kunna importeras utan att automatiskt bli canonical GainPilot-kunskap.

Privata, köpta eller coachskapade program ska förbli privata och följa rättighetsgränser.

GainPilot ska kunna normalisera:

- övningsnamn,

- set,

- repetitioner,

- belastningar,

- enheter,

- träningsdagar,

- programblock,

- progression,

- och domänspecifika format.

CrossFit, calisthenics och kondition ska bevaras i sina riktiga strukturer.

Arnold ska hjälpa användaren förstå:

- vad som importerades,

- vad som är osäkert,

- vilka konflikter som finns,

- och vilka delar som behöver bekräftas.

Atlas ska hjälpa med:

- research,

- dubblettanalys,

- semantisk matchning,

- källbedömning,

- och förbättring av importmotorn.

Hermes ska säkerställa att endast relevant och tillåten information används.

När GainPilot anpassar ett externt program ska originalet bevaras.

Den nya versionen ska tydligt beskrivas som GainPilots anpassning.

Användaren ska kunna jämföra, godkänna, låsa och återställa.

API-integrationer ska använda minsta nödvändiga behörighet.

Läs- och skrivåtkomst ska separeras.

Tvåvägssynkronisering ska endast användas när konflikter, källsystem och rollback är tydligt definierade.

Importerade filer ska behandlas som potentiellt osäkra.

Privata och känsliga uppgifter ska minimeras och skyddas.

Canonical kunskap får aldrig skapas direkt från en enskild import.

Alla förbättringar av importmotor, parser, matchningsmodell, rättighetsregler och säkerhetsfilter ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- pull request,

- granskning,

- kontrollerad merge,

- och uppföljning.

Kapitel 11 etablerar därmed följande kärnprincip:

GainPilot ska kunna ta emot användarens befintliga träningsvärld utan att förstöra dess ursprung, rättigheter eller innebörd. Plattformen ska omvandla externa program och historik till spårbar, korrigerbar och användbar struktur — men endast göra dem operativa eller canonical när rätt källa, säkerhet, behörighet och granskning finns.
