# Kapitel 17 — Progression, statistik och återkoppling

GainPilots progressions- och statistiksystem ska hjälpa användaren förstå om träningen, kosten och den långsiktiga planen faktiskt leder i rätt riktning.

Systemet ska inte endast samla data.

Det ska omvandla användarens historik till en begriplig bild av:

- vad som har förändrats,

- vad som sannolikt orsakat förändringen,

- vad som fortfarande är osäkert,

- vad som fungerar,

- vad som behöver följas längre,

- och vilket nästa beslut som är rimligt.

Progression ska inte reduceras till:

- högre vikt på stången,

- fler repetitioner,

- lägre kroppsvikt,

- fler träningspass,

- eller en stigande poäng i ett diagram.

En användare kan göra verkliga framsteg genom att:

- utföra samma belastning med bättre teknik,

- genomföra fler planerade pass,

- tåla större träningsvolym,

- behöva mindre assistans,

- hålla en calisthenicsposition längre,

- springa samma sträcka med lägre ansträngning,

- återhämta sig bättre,

- följa en fungerande måltidsstruktur,

- minska vardagsfriktionen,

- eller behålla kapacitet under en krävande livsperiod.

GainPilot ska därför kunna mäta progression inom flera dimensioner.

Minst följande områden ska kunna följas:

1. Styrka.

2. Muskelbyggnad och träningsvolym.

3. Teknik och rörelsekvalitet.

4. Kondition och arbetskapacitet.

5. CrossFit-resultat.

6. Calisthenicsfärdigheter.

7. Kroppsvikt och kroppsmått.

8. Koststruktur och följsamhet.

9. Återhämtning.

10. Genomförbarhet och planeringskvalitet.

11. Vanor och kontinuitet.

12. Användarens egen upplevelse.

Statistik ska ge användaren stöd.

Den får inte:

- skapa falsk precision,

- uppmuntra tvångsmässig mätning,

- moralisera kring avvikelser,

- eller göra användaren beroende av dagliga poäng.

Arnold ska vara användarens primära gränssnitt till progressionen.

Han ska kunna:

- sammanfatta utvecklingen,

- sätta enskilda resultat i sammanhang,

- uttrycka osäkerhet,

- lyfta relevanta framsteg,

- identifiera verkliga problem,

- och föreslå nästa steg.

Atlas ska hjälpa med:

- långsiktig mönsteranalys,

- korrelationer mellan flera godkända domäner,

- plattformsinsikter,

- research,

- och kvalitetskontroll av analysmodeller.

Hermes ska kontrollera vilka minnen, träningsresultat, kostuppgifter, kroppsmått, kalenderdata och andra privata signaler som får kombineras.

Grundprincipen är:

GainPilot ska inte ge användaren fler siffror än personen behöver. Plattformen ska göra framsteg begripliga genom relevant data, ärlig osäkerhet och konkreta beslut som hjälper användaren fortsätta utvecklas.

17.1 PROGRESSION SOM FLERDIMENSIONELL FÖRÄNDRING

Progression ska representeras som förändring i en eller flera relevanta dimensioner.

Exempel:

Styrkeprogression:

- högre belastning,

- fler repetitioner,

- bättre RIR vid samma arbete,

- eller stabilare teknik.

Hypertrofiprogression:

- större tolererad träningsvolym,

- bättre prestation inom målintervallet,

- kroppsmått över tid,

- och långsiktig visuell eller funktionell förändring.

Konditionsprogression:

- högre tempo,

- längre distans,

- bättre effekt,

- lägre upplevd ansträngning,

- eller snabbare återhämtning.

Calisthenicsprogression:

- mindre assistans,

- svårare progression,

- längre hålltid,

- fler kvalitativa repetitioner,

- eller stabilare position.

Kostprogression:

- mer fungerande måltidsstruktur,

- bättre följsamhet,

- färre oplanerade avbrott,

- och målrelevant vikttrend.

GainPilot ska inte använda en enda global progressionspoäng som ersättning för dessa dimensioner.

17.2 DEN CANONICAL PROGRESSIONSMODELLEN

GainPilot ska ha en canonical modell för progression och statistik.

Modellen ska minst kunna representera:

- progress_identity,

- user_identity,

- goal_identity,

- metric_identity,

- metric_domain,

- measurement_type,

- source,

- measurement_time,

- comparison_window,

- baseline,

- current_value,

- target_range,

- confidence,

- data_quality,

- trend_direction,

- trend_magnitude,

- contextual_factors,

- interpretation,

- recommended_action,

- model_version,

- and user_feedback.

Exakta tekniska fältnamn definieras senare.

Principen är att varje progressionsbedömning ska kunna svara på:

- Vad mäts?

- Varför mäts det?

- Vilken tidsperiod jämförs?

- Vilken datakälla används?

- Hur säker är analysen?

- Vilken kontext påverkar resultatet?

- Vad betyder det för användarens mål?

- Och vilket beslut kan följa?

17.3 MÅTTIDENTITET

Varje mått ska ha en stabil identitet.

Exempel:

- barbell_bench_press_top_set_load,

- bench_press_estimated_1rm,

- weekly_completed_priority_sessions,

- average_session_duration,

- bodyweight_rolling_average,

- pull_up_assistance_level,

- five_kilometer_running_time,

- nutrition_plan_adherence_structure,

- eller sleep_self_reported_quality.

Visningsnamnet får kunna lokaliseras.

Den underliggande måttidentiteten ska vara stabil.

17.4 MÅTTDOMÄNER

Mått ska organiseras i domäner.

Exempel:

- training_strength,

- training_hypertrophy,

- training_skill,

- training_conditioning,

- nutrition,

- body_measurement,

- recovery,

- adherence,

- planning,

- and user_experience.

Domänen ska påverka:

- tillåten jämförelse,

- visualisering,

- osäkerhet,

- och vilka beslut måttet får stödja.

17.5 MÄTVÄRDE OCH TOLKNING

GainPilot ska skilja mellan:

- mätvärde,

- beräknat värde,

- trend,

- tolkning,

- och rekommendation.

Exempel:

Mätvärde:

100 kilogram × 8 repetitioner.

Beräknat värde:

Uppskattat 1RM enligt vald modell.

Trend:

Ökande under sex veckor.

Tolkning:

Styrkeutvecklingen är sannolikt positiv.

Rekommendation:

Behåll nuvarande progression tills nästa blockutvärdering.

Dessa nivåer får inte blandas samman.

17.6 DIREKTA MÄTNINGAR

Direkta mätningar kan exempelvis vara:

- registrerad belastning,

- repetitionsantal,

- tid,

- distans,

- kroppsvikt,

- midjemått,

- assistansnivå,

- eller antal genomförda pass.

Även direkta mätningar kan innehålla fel.

GainPilot ska kunna registrera:

- källa,

- enhet,

- mätmetod,

- och kvalitet.

17.7 BERÄKNADE MÅTT

Beräknade mått kan vara:

- uppskattat 1RM,

- träningsvolym,

- genomsnittligt tempo,

- vikttrend,

- arbetsbelastning,

- eller följsamhetsgrad.

Beräknade mått ska ha:

- känd modell,

- version,

- indata,

- och relevant osäkerhet.

Ett beräknat värde ska inte presenteras som direkt observerad sanning.

17.8 INFERERADE MÅTT

Vissa mått bygger på flera signaler och analys.

Exempel:

- möjlig återhämtningsbrist,

- sannolik planeringsfriktion,

- förbättrad rörelsekvalitet,

- eller risk för att programmet är för tidskrävande.

Infererade mått ska tydligt markeras som:

- möjlig bedömning,

- inte fakta.

Betydelsefulla inferenser ska kunna kräva användarbekräftelse.

17.9 PROVENANCE

Varje datavärde ska ha provenance.

Källan kan vara:

- användarregistrering,

- GainPilot-session,

- träningssensor,

- wearable,

- extern integration,

- tränare,

- kameraanalys,

- eller systemberäkning.

Systemet ska kunna visa:

- varifrån värdet kommer,

- när det registrerades,

- om användaren har korrigerat det,

- och om källan har begränsad tillförlitlighet.

17.10 DATAKVALITET

Varje mått ska kunna ha datakvalitet.

Exempel:

Hög kvalitet:

- verifierat tävlingsresultat,

- användarbekräftad träningslogg,

- eller stabil sensor med känd källa.

Medelhög kvalitet:

- konsekvent vardagsregistrering,

- uppskattat restaurangintag,

- eller wearabledata med mindre luckor.

Låg kvalitet:

- ofullständig minnesbaserad registrering,

- grov bildanalys,

- eller osäker extern import.

Datakvaliteten ska påverka hur stark slutsatsen får vara.

17.11 MÄTOSÄKERHET

GainPilot ska uttrycka relevant osäkerhet.

Exempel:

Vikten ser ut att öka långsamt, men det finns endast fyra mätningar under perioden.

Systemet ska inte ge ett exakt trendvärde med två decimaler när underlaget är svagt.

17.12 BASLINJE

Progression kräver en baslinje.

Baslinjen kan vara:

- första verifierade mätning,

- start av programblock,

- personligt genomsnitt,

- tidigare programfas,

- eller manuellt valt referensdatum.

Systemet ska visa vilken baslinje som används.

Ett resultat kan se bättre eller sämre ut beroende på vald referensperiod.

17.13 DYNAMISK BASLINJE

Vissa analyser kan använda en rullande baslinje.

Exempel:

De senaste fyra veckornas genomsnitt jämförs med föregående fyra veckor.

Dynamisk baslinje ska inte ersätta användarens långsiktiga historik.

Den ska vara ett analysverktyg för aktuell trend.

17.14 MÅLVÄRDE

Ett mått kan ha:

- exakt mål,

- målintervall,

- miniminivå,

- önskad riktning,

- eller inget numeriskt mål.

Exempel:

Exakt:

Springa fem kilometer under 25 minuter.

Intervall:

Tre till fyra styrkepass per vecka.

Riktning:

Gradvis minska assistansen i pull-ups.

Kvalitativt mål:

Genomföra rörelsen med stabil teknik.

GainPilot ska inte tvinga alla mål till ett exakt tal.

17.15 MÅTT UTAN MÅL

Vissa mått ska visas för kontext utan att användaren behöver förbättra dem.

Exempel:

- genomsnittlig passlängd,

- vanlig träningstid,

- eller antal måltidsbyten.

Systemet ska inte göra varje mätbar sak till ett optimeringsmål.

17.16 LEDANDE OCH EFTERSLÄPANDE MÅTT

GainPilot ska skilja mellan ledande och eftersläpande mått.

Ledande mått kan vara:

- genomförda huvudpass,

- planerad träningsvolym,

- regelbunden måltidsstruktur,

- eller sömnmöjlighet.

Eftersläpande mått kan vara:

- styrkeökning,

- kroppsviktstrend,

- konditionstid,

- eller kroppsmått.

Ledande mått beskriver beteenden och processer.

Eftersläpande mått beskriver resultat som ofta tar längre tid.

17.17 RESULTAT OCH PROCESS

GainPilot ska hjälpa användaren skilja mellan:

- resultatmål,

- prestationsmål,

- och processmål.

Exempel:

Resultatmål:

Minska kroppsvikten med ett visst intervall.

Prestationsmål:

Öka styrkan i knäböj.

Processmål:

Genomföra tre prioriterade pass per vecka.

Användaren ska kunna få positiv återkoppling på en fungerande process även innan slutresultatet syns.

17.18 TREND FÖRE ENSKILT VÄRDE

GainPilot ska normalt prioritera trend framför enskild mätning.

Exempel:

En enskild sämre träningsdag ska inte automatiskt beskrivas som tillbakagång.

En enskild högre kroppsvikt ska inte automatiskt beskrivas som fettökning.

En enskild snabb löptid ska inte automatiskt bli ny stabil kapacitetsnivå.

17.19 TRENDFÖNSTER

Olika mått kräver olika tidsfönster.

Exempel:

Styrkeprestation:

Kan analyseras över flera jämförbara pass.

Kroppsvikt:

Kan använda rullande genomsnitt över dagar eller veckor.

Kroppsmått:

Kan kräva längre intervall.

Teknik:

Kan bedömas över ett antal jämförbara videor eller tränartillfällen.

Följsamhet:

Kan analyseras per vecka eller programblock.

Systemet ska inte använda samma trendfönster för alla mått.

17.20 KORTSIKTIG TREND

Kortsiktig trend kan hjälpa användaren förstå aktuell riktning.

Den ska vara tydligt separerad från långsiktig utveckling.

Exempel:

Senaste två veckorna har träningsvolymen minskat.

Det betyder inte nödvändigtvis att programmets långsiktiga utveckling är negativ.

17.21 LÅNGSIKTIG TREND

Långsiktig trend ska kunna visa:

- månader,

- programblock,

- säsonger,

- eller flera år.

Systemet ska hantera att:

- mål förändras,

- program byts,

- och mätmetoder uppdateras.

Historiska data ska inte jämföras utan kontext.

17.22 TRENDSTABILITET

GainPilot ska kunna beskriva om trenden är:

- stabil,

- möjlig,

- tydlig,

- varierande,

- eller otillräcklig.

Exempel:

Styrketrenden är sannolikt positiv, men resultaten varierar mer än tidigare.

Detta är mer ärligt än ett enkelt grönt eller rött besked.

17.23 STATISTISK SIGNIFIKANS OCH PRODUKTSYSTEM

GainPilot behöver normalt inte visa formell statistisk signifikans för vardagliga personliga beslut.

Systemet ska ändå undvika att dra starka slutsatser från:

- få datapunkter,

- hög variation,

- eller inkompatibla mätningar.

Mer avancerad statistisk analys kan användas internt.

Användargränssnittet ska förklara resultatet begripligt.

17.24 PRAKTISK BETYDELSE

En förändring kan vara mätbar utan att vara praktiskt viktig.

Exempel:

En mycket liten förbättring i beräknat tempo kan ligga inom normal variation.

GainPilot ska bedöma:

- om förändringen är tillräckligt stor,

- tillräckligt stabil,

- och relevant för målet.

Systemet ska inte skapa en stor rekommendation från en obetydlig skillnad.

17.25 STYRKEPROGRESSION

Styrkeprogression ska kunna analyseras genom:

- belastning,

- repetitioner,

- set,

- RPE,

- RIR,

- uppskattat 1RM,

- teknik,

- och övningsvariant.

GainPilot ska säkerställa att prestationerna är jämförbara.

Exempel:

100 kilogram × 8 i vanlig bänkpress ska inte direkt jämföras med:

- pausad bänkpress,

- smal bänkpress,

- annan rörelsestandard,

- eller maskinpress.

17.26 UPPSKATTAT 1RM

Uppskattat 1RM ska beskrivas som en modellbaserad uppskattning.

GainPilot ska kunna:

- använda flera godkända modeller,

- välja lämplig modell efter repetitionsområde,

- och visa osäkerhet.

Systemet ska inte övervärdera e1RM från:

- mycket höga repetitionsantal,

- set till osäker failure,

- ändrad teknik,

- eller ofullständig data.

17.27 VERIFIERAT MAX

Ett verifierat max ska skiljas från uppskattat max.

Det kan komma från:

- testpass,

- tävling,

- eller användarbekräftad prestation.

Verifierat max ska fortfarande ha:

- datum,

- variant,

- standard,

- utrustning,

- och kroppsviktskontext där relevant.

17.28 REPETITIONSPERSONBÄSTA

GainPilot ska kunna identifiera personbästa för:

- viss vikt,

- visst repetitionsintervall,

- viss variant,

- och viss teknikstandard.

Exempel:

Nytt personbästa:

100 kilogram × 9 i bänkpress.

Det ska inte automatiskt innebära att användarens absoluta max har förändrats med ett exakt värde.

17.29 VOLYMPROGRESSION

Volym kan följas genom:

- arbetsset,

- hårda set,

- repetitioner,

- extern belastningsvolym,

- eller muskelgruppsrelaterad träningsdos.

GainPilot ska vara försiktigt med att kalla mer volym för bättre progression.

Ökad volym kan vara:

- avsiktlig belastningsökning,

- kompensation,

- eller onödig trötthet.

17.30 HÅRDA SET

Systemet kan följa arbetsset som når en relevant ansträngningsnivå.

Definitionen ska vara:

- program- och domänspecifik,

- inte universell.

GainPilot ska inte kräva RPE-data för att uppskatta varje set om användaren inte registrerar detta.

17.31 TONNAGE

Tonnage kan användas för vissa analyser.

Det får inte jämföras okritiskt mellan:

- olika övningar,

- olika rörelseomfång,

- maskin och fria vikter,

- eller olika setstrukturer.

Tonnage ska vara ett kompletterande mått.

17.32 TEKNIKPROGRESSION

Teknikprogression kan beskrivas genom:

- stabilare rörelse,

- jämnare repetitionsutförande,

- bättre kontroll,

- färre tekniska avbrott,

- eller högre kvalitet vid samma belastning.

Teknik ska inte reduceras till en ogenomskinlig AI-poäng.

Arnold ska kunna förklara vilken konkret förbättring som observerats.

17.33 AI-BASERAD TEKNIKTREND

Om videoanalys används ska GainPilot kunna följa samma definierade tekniksignal över tid.

Exempel:

Möjlig stångbanestabilitet.

Analysen ska kontrollera:

- jämförbar kameravinkel,

- jämförbar belastning,

- fullständig repetition,

- och modellversion.

Osäkerheten ska vara synlig.

17.34 TRÄNARVERIFIERAD TEKNIK

En mänsklig tränare ska kunna markera:

- förbättring,

- stabilt utförande,

- fortsatt fokus,

- eller ny begränsning.

Tränarens bedömning ska ha tydlig källa.

Den ska inte blandas ihop med AI-analys.

17.35 HYPERTROFIPROGRESSION

Muskelbyggnad kan inte mätas perfekt genom ett enda mått.

GainPilot kan använda en kombination av:

- prestationsutveckling,

- träningsvolym,

- kroppsmått,

- kroppsviktstrend,

- bilder om användaren väljer det,

- och långsiktig planföljsamhet.

Systemet ska uttrycka osäkerhet kring exakt muskelmassa.

17.36 KROPPSMÅTT

Användaren ska kunna registrera:

- midja,

- höft,

- bröst,

- arm,

- lår,

- vad,

- eller egna mått.

Varje mått ska ha:

- mätningsplats,

- enhet,

- tid,

- metod,

- och eventuell instruktion.

Systemet ska uppmuntra jämförbar mätmetod.

17.37 MÄTFEL I KROPPSMÅTT

Kroppsmått kan påverkas av:

- mätplacering,

- bandets spänning,

- tidpunkt,

- vätska,

- och användarteknik.

GainPilot ska undvika att tolka små förändringar som säkra biologiska resultat.

17.38 PROGRESSIONSBILDER

Användaren ska kunna använda privata progressionsbilder.

Bilder ska vara:

- valbara,

- privata som standard,

- tydligt organiserade,

- och skyddade av stark behörighetskontroll.

GainPilot ska inte kräva bilder för att bedöma progression.

17.39 STANDARDISERING AV BILDER

GainPilot kan hjälpa användaren använda liknande:

- ljus,

- avstånd,

- vinkel,

- kläder,

- och tidpunkt.

Systemet ska förklara att bildjämförelser fortfarande är osäkra.

Det ska inte manipulera användaren genom överdriven före- och efterpresentation.

17.40 AI-ANALYS AV KROPPSBILDER

AI-baserad kroppsanalys ska behandlas som högrisk och osäker.

Systemet ska inte:

- diagnostisera,

- ge exakt kroppsfettprocent från ett foto,

- sexualisera användaren,

- eller använda bilden för marknadsföring.

Sådan funktion ska kräva särskild integritets-, säkerhets- och rättvisegranskning.

17.41 KROPPSVIKT

Kroppsvikt ska kunna registreras:

- manuellt,

- från smart våg,

- eller annan godkänd källa.

Varje värde ska ha:

- källa,

- tidpunkt,

- och mätstatus.

En vikt från en annan person eller fel vågprofil ska kunna identifieras och ogiltigförklaras.

17.42 RULLANDE VIKTGENOMSNITT

GainPilot kan använda rullande genomsnitt för att minska påverkan från daglig variation.

Systemet ska visa:

- faktisk mätning,

- och trend

som separata saker.

Användaren ska kunna välja att inte se dagliga viktförändringar.

17.43 VIKTFÖRÄNDRING

Viktförändring ska bedömas i relation till:

- mål,

- tidsperiod,

- kostföljsamhet,

- träningsperiod,

- och mätkvalitet.

GainPilot ska inte anta att all viktökning är negativ eller att all viktnedgång är positiv.

17.44 KROPPSFETT

Mätningar av kroppsfett kan komma från:

- våg,

- kaliper,

- DEXA,

- eller annan metod.

Metoderna har olika felmarginaler.

GainPilot ska:

- bevara metod,

- undvika direkt jämförelse mellan inkompatibla metoder,

- och uttrycka osäkerhet.

17.45 KONDITIONSPROGRESSION

Konditionsprogression kan analyseras genom:

- tid,

- distans,

- tempo,

- effekt,

- puls,

- upplevd ansträngning,

- intervallkapacitet,

- och återhämtning.

Jämförelsen ska ta hänsyn till:

- underlag,

- väder,

- lutning,

- utrustning,

- och aktivitetstyp.

17.46 LÖPPROGRESSION

Löpning ska kunna följas genom:

- distansresultat,

- tempo,

- intervall,

- puls,

- höjdprofil,

- och upplevd ansträngning.

Ett utomhuspass i stark vind ska inte jämföras okritiskt med löpband.

17.47 CYKLINGSPROGRESSION

Cykling kan följas genom:

- effekt,

- tid,

- distans,

- puls,

- och träningszoner.

GainPilot ska skilja mellan:

- olika cyklar,

- inomhus och utomhus,

- samt sensorkällor.

17.48 RODD OCH ERGOMETER

Resultat från roddmaskin eller annan ergometer ska kunna jämföras när:

- maskintyp,

- inställning,

- distans,

- och standard

är tillräckligt lika.

Leverantörsspecifika data ska ha tydlig källa.

17.49 KONDITIONSTESTER

GainPilot ska kunna stödja definierade tester.

Exempel:

- fem kilometer löpning,

- två tusen meter rodd,

- tolv minuters test,

- eller programdefinierat cykeltest.

Testet ska ha:

- protokoll,

- standard,

- säkerhetskrav,

- och jämförelsehistorik.

17.50 CROSSFIT-PROGRESSION

CrossFit-resultat ska bevara:

- workoutidentitet,

- version,

- scaling,

- rörelsestandard,

- time cap,

- miljö,

- och resultatformat.

Samma workout med annan scaling ska inte behandlas som direkt identisk prestation.

17.51 BENCHMARK-WORKOUTS

Benchmark-workouts ska kunna följas över tid.

Jämförelsen ska tydligt visa:

- RX eller scaled,

- belastningar,

- rörelsevarianter,

- reps,

- och eventuella standardförändringar.

En snabbare tid med enklare scaling är inte automatiskt bättre än ett tidigare tyngre genomförande.

17.52 CROSSFIT-ARBETSKAPACITET

GainPilot kan analysera bredare arbetskapacitet genom flera workouts.

Systemet ska vara försiktigt med att reducera komplex CrossFit-kapacitet till en enda poäng.

Olika tidsdomäner och rörelsetyper ska kunna visas separat.

17.53 CALISTHENICS-PROGRESSION

Calisthenicsprogression ska kunna följas genom:

- progressionsteg,

- assistans,

- hålltid,

- repetitionskvalitet,

- rörelseomfång,

- kontroll,

- och lyckade försök.

Systemet ska kunna visa att framsteg ibland sker inom samma progression innan nästa steg är lämpligt.

17.54 SKILLSTATUS

En färdighet ska kunna ha status som:

- introducerad,

- under inlärning,

- stabil med assistans,

- delvis självständig,

- självständig,

- konsekvent,

- eller avancerad.

Status ska inte enbart uppdateras genom ett enskilt lyckat försök.

17.55 ASSISTANSTREND

Minskad assistans kan vara progression.

GainPilot ska bevara:

- assistanstyp,

- band,

- maskinsteg,

- partnerhjälp,

- eller annan metod.

Olika assistansformer ska inte jämföras okritiskt.

17.56 HÅLLTID OCH KVALITET

En längre hålltid är inte alltid bättre om positionen försämras.

GainPilot ska kunna visa:

- hålltid,

- kvalitetsstatus,

- och progressionstyp

tillsammans.

17.57 FÖLJSAMHET

Följsamhet ska beskriva hur väl användaren kunnat genomföra den avsedda planen.

Den ska inte vara ett moraliskt betyg.

GainPilot ska kunna skilja mellan:

- genomförd plan,

- kontrollerat byte,

- kortversion,

- planerad paus,

- och oplanerat bortfall.

17.58 PRIORITERAD FÖLJSAMHET

Alla delar av planen ska inte väga lika.

Exempel:

Genomförda huvudpass kan vara viktigare än valbara tilläggspass.

Grundläggande måltidsstruktur kan vara viktigare än exakt receptval.

GainPilot ska kunna visa:

- följsamhet till kärnplan,

- och följsamhet till full plan

separat.

17.59 MINIMINIVÅ

Om användaren når programmets definierade miniminivå ska detta kunna visas som ett meningsfullt resultat.

Exempel:

Du genomförde tre av tre prioriterade pass. Det valbara fjärde passet genomfördes inte.

Detta ska inte visas som 75 procent misslyckande.

17.60 KONTROLLERAD ANPASSNING ÄR FÖLJSAMHET

Ett godkänt byte eller en kortversion kan fortfarande uppfylla planens funktion.

GainPilot ska inte straffa användaren statistiskt för att systemets egen reservplan användes korrekt.

17.61 PLANERINGSKVALITET

GainPilot ska mäta hur väl planen passar användarens verklighet.

Signaler kan vara:

- återkommande flyttar,

- tidsöverskridanden,

- användning av kortversioner,

- missade fasta pass,

- och återkommande bytesorsaker.

Låg följsamhet kan vara ett planeringsproblem snarare än ett användarproblem.

17.62 PASSLÄNGD

Faktisk passlängd ska kunna jämföras med planerad tid.

Systemet ska kunna identifiera:

- konsekvent underskattning,

- stor variation,

- och passdelar som skapar försening.

Arnold kan föreslå:

- längre kalenderblock,

- färre övningar,

- eller bättre kortversion.

17.63 KOSTFÖLJSAMHET

Kostföljsamhet ska kunna bedömas utifrån vald detaljnivå.

För en användare med måltidsmallar kan relevant följsamhet vara:

- antal måltider med rätt struktur.

För en användare med detaljerade makromål kan ytterligare mått användas.

GainPilot ska inte utvärdera alla efter samma modell.

17.64 RESERVMÅLTIDER OCH FRAMGÅNG

Användning av reservmåltid ska kunna räknas som:

- lyckad anpassning,

- inte misslyckande.

Systemet ska kunna visa:

Tre måltider behövde bytas denna vecka. Alla ersattes med planerade alternativ och grundstrukturen behölls.

17.65 KONTINUITET

Kontinuitet beskriver användarens långsiktiga förmåga att fortsätta.

Den kan mätas genom:

- aktiva veckor,

- återgång efter paus,

- genomförda kärnaktiviteter,

- och stabilt användande av reservstrukturer.

Kontinuitet ska inte reduceras till en obruten daglig kedja.

17.66 STREAKS

GainPilot får använda streaks försiktigt.

En streak ska:

- stödja en meningsfull vana,

- tåla planerade vilodagar,

- och inte skapa skuld vid avbrott.

Systemet ska inte designa hela motivationen kring att en lång kedja aldrig får brytas.

17.67 FLEXIBLA STREAKS

En bättre modell kan vara:

- veckor där kärnplanen uppnåddes,

- antal återgångar efter avbrott,

- eller konsekventa måltidsförberedelser.

Flexibla streaks ska spegla användarens verkliga mål.

17.68 ÅTERGÅNG SOM FRAMSTEG

Att återuppta träning eller koststruktur efter ett avbrott ska kunna räknas som ett viktigt framsteg.

Arnold kan säga:

Du tappade två veckor under sjukdomsperioden men återgick till programmet utan att försöka kompensera. Det är ett starkt tecken på hållbarhet.

17.69 ÅTERHÄMTNINGSMÅTT

GainPilot kan följa:

- användarens sömnupplevelse,

- träningsvärk,

- energi,

- stress,

- vilopuls,

- HRV,

- och återhämtningsfeedback

när användaren väljer det.

Ingen enskild signal ska bli en absolut återhämtningspoäng.

17.70 WEARABLE-ÅTERHÄMTNINGSPOÄNG

Externa återhämtningspoäng ska ha:

- leverantör,

- modell,

- och datum.

GainPilot ska inte presentera leverantörens poäng som universell biologisk sanning.

Systemet ska sätta värdet i relation till:

- användarens upplevelse,

- och faktisk prestation.

17.71 PERSONLIG BASLINJE FÖR ÅTERHÄMTNING

Återhämtningssignaler ska i första hand jämföras med användarens egen historik.

Befolkningsintervall kan användas som bakgrund.

De ska inte ersätta personlig baslinje.

17.72 ÅTERHÄMTNINGSTREND

GainPilot ska kunna identifiera återkommande mönster.

Exempel:

- sömnupplevelsen är ofta lägre efter sena pass,

- eller träningsvärken är hög efter viss kombination av pass.

Detta ska först behandlas som inferens.

Arnold kan fråga om mönstret stämmer.

17.73 SJÄLVSKATTAD UPPLEVELSE

Användarens egen upplevelse ska behandlas som en central datakälla.

Exempel:

- hur planen känns,

- om passen är för långa,

- om maten fungerar,

- om energin räcker,

- och om coachningen är lagom.

GainPilot ska inte låta sensordata automatiskt övertrumfa användaren.

17.74 KVALITATIV FEEDBACK

Feedback kan vara:

- fritext,

- valbara svar,

- röst,

- eller korta skattningar.

Systemet ska kunna strukturera feedback utan att förlora originalformuleringen.

En språkmodells sammanfattning ska inte ersätta användarens råa kommentar.

17.75 FEEDBACKTYPER

Feedback ska kunna klassificeras som:

- positivt utfall,

- negativt utfall,

- preferens,

- säkerhetssignal,

- användbarhetsproblem,

- innehållsfel,

- eller förändringsönskemål.

Klassificeringen ska vara korrigerbar.

17.76 FEEDBACK EFTER PASS

Efter pass kan Arnold fråga ett fåtal relevanta frågor.

Exempel:

- Uppnådde passet sitt syfte?

- Var tiden rimlig?

- Fanns smärta?

- Ska något ändras nästa gång?

Frågor ska inte upprepas i onödan.

17.77 FEEDBACK EFTER VECKA

Veckofeedback kan omfatta:

- vad som fungerade,

- vad som var svårt,

- om planen var realistisk,

- och vilket stöd användaren vill ha.

Den ska kunna genomföras snabbt.

17.78 FEEDBACK EFTER PROGRAMBLOCK

Vid blockslut ska användaren kunna ge djupare återkoppling.

Exempel:

- upplevd progression,

- favorit- och problemövningar,

- passlängd,

- motivation,

- koststruktur,

- och nästa mål.

Denna feedback ska påverka nästa planering.

17.79 FEEDBACKS KÄLLA

Feedback ska ha tydlig källa.

Exempel:

- användaren,

- mänsklig tränare,

- Arnold,

- Atlas-analys,

- support,

- eller automatiskt identifierad signal.

Användarens uttryckliga feedback ska hållas separat från systemets tolkning.

17.80 FEEDBACKENS GILTIGHET

Feedback kan vara:

- sessionsspecifik,

- veckospecifik,

- blockrelaterad,

- tidsbegränsad,

- eller långsiktig.

Exempel:

Jag gillar inte denna måltid i dag.

Det ska inte automatiskt tolkas som:

Jag vill aldrig se receptet igen.

17.81 NEGATIV FEEDBACK

Negativ feedback ska leda till rätt typ av respons.

Exempel:

För lång passlängd:

Planeringsanalys.

Smärta:

Säkerhetsflöde.

Dålig smak:

Recept- eller preferensanalys.

Tekniskt fel:

Produktincident.

Systemet ska inte behandla all negativ feedback som användarens motivationsproblem.

17.82 POSITIV FEEDBACK

Positiv feedback ska också analyseras.

GainPilot ska kunna förstå:

- vad som fungerade,

- i vilken kontext,

- och om det bör användas igen.

En positiv upplevelse ska inte automatiskt bli permanent standard.

17.83 FEEDBACKLOOPEN

GainPilots feedbackloop ska vara:

Utfall

→ Användarfeedback

→ Datakvalitetsbedömning

→ Mönsteranalys

→ Tolkning

→ Förslag

→ Godkännande där det behövs

→ Förändring

→ Uppföljning

Förändringar ska vara spårbara och reversibla.

17.84 ÖVERREAKTIONSSKYDD

GainPilot ska ha skydd mot överreaktion.

En enskild negativ datapunkt ska normalt inte:

- skriva om programmet,

- sänka användarens mål,

- eller skapa stark varning.

Undantag gäller säkerhetskritiska signaler.

17.85 STABILITETSFÖNSTER

Större anpassningar ska kunna kräva ett stabilitetsfönster.

Exempel:

En kostförändring följs under två eller tre veckor innan ny justering.

Ett träningsblock bedöms över flera pass.

Stabilitetsfönstret ska vara domänspecifikt.

17.86 FÖRÄNDRINGSHYPOTES

Betydelsefulla förändringar ska kunna kopplas till en hypotes.

Exempel:

Hypotes:

Kortare vardagspass kommer förbättra genomförandet utan att huvudprogressionen försämras.

Förändring:

Vardagsvolymen reduceras och helgpasset får större flexibilitet.

Uppföljning:

Efter fyra veckor.

17.87 UTFALL AV FÖRÄNDRING

GainPilot ska kunna bedöma om en förändring:

- förbättrade resultatet,

- inte gjorde tydlig skillnad,

- försämrade utfallet,

- eller saknar tillräckligt underlag.

Systemet ska kunna återställa eller revidera förändringen.

17.88 KORRELATION ÄR INTE ORSAK

GainPilot kan upptäcka samband.

Exempel:

Bättre sömn sammanfaller med bättre träningsprestation.

Detta bevisar inte att en enskild faktor ensam orsakade resultatet.

Arnold ska använda formuleringar som:

Det verkar finnas ett samband.

Inte:

Vi vet att detta var orsaken.

17.89 MULTIVARIABEL ANALYS

Atlas kan hjälpa analysera flera signaler samtidigt.

Exempel:

- träningsvolym,

- sömn,

- arbetstid,

- kostföljsamhet,

- och prestation.

Analysen ska fortfarande:

- uttrycka osäkerhet,

- minimera data,

- och undvika medicinska slutsatser.

17.90 KONFUNDERANDE FAKTORER

GainPilot ska kunna dokumentera möjliga faktorer som påverkar jämförelsen.

Exempel:

- sjukdom,

- resa,

- ny utrustning,

- ändrad teknik,

- viktförändring,

- stressig period,

- eller ändrad mätmetod.

Systemet ska inte dölja sådana faktorer för att skapa en renare graf.

17.91 JÄMFÖRBARHET

Två mätvärden ska endast jämföras direkt när de är tillräckligt kompatibla.

Jämförbarhet kan påverkas av:

- övningsvariant,

- utrustning,

- teknikstandard,

- miljö,

- mätmetod,

- programfas,

- och kroppsvikt.

GainPilot ska kunna markera jämförelsen som begränsad.

17.92 NORMALISERING

Vissa mått kan normaliseras.

Exempel:

- styrka relativt kroppsvikt,

- tempo per distans,

- eller resultat per tidsenhet.

Normalisering ska användas när den hjälper målet.

Systemet ska inte göra relativ styrka till viktigare mått för alla användare.

17.93 HISTORISKA MODELLÄNDRINGAR

Om analysmodellen uppdateras ska GainPilot bevara:

- tidigare beräkning,

- modellversion,

- och ny beräkning där den görs.

Systemet ska inte skriva om historiken utan att det syns.

17.94 DATAKORRIGERING

När användaren korrigerar ett resultat ska:

- analysen uppdateras,

- tidigare version bevaras,

- och berörda rekommendationer omprövas.

Ett felaktigt personbästa ska inte fortsätta påverka progressionen.

17.95 OGILTIGA VÄRDEN

Användaren eller systemet ska kunna markera data som ogiltig.

Exempel:

- fel vågprofil,

- GPS-fel,

- dubblett,

- felregistrerad vikt,

- eller pass som aldrig genomfördes.

Ogiltig data ska inte användas i aktiva trender.

17.96 SAKNAD DATA

Saknad data ska behandlas som saknad.

GainPilot ska inte fylla i resultat utan tydlig metod.

Systemet kan använda:

- intervall,

- uppskattning,

- eller ingen analys.

Uppskattade värden ska markeras.

17.97 IMPUTERING

Avancerad analys kan ibland använda imputerade värden.

Detta ska ske försiktigt.

Imputerad data får inte användas som användarens verkliga prestation.

Användargränssnittet ska normalt prioritera observerade värden.

17.98 OUTLIERS

GainPilot ska kunna upptäcka avvikande värden.

Exempel:

- kroppsvikt som plötsligt skiljer 20 kilogram,

- orimlig GPS-hastighet,

- eller dubbla träningsresultat.

Ett avvikande värde ska:

- granskas,

- inte automatiskt raderas,

- och kunna bekräftas av användaren.

17.99 PERSONBÄSTA OCH OUTLIERS

Ett extremt resultat ska inte automatiskt bli personbästa om datakvaliteten är låg.

Systemet kan säga:

Det här ser ut som ett nytt rekord, men värdet skiljer sig kraftigt från tidigare resultat. Vill du bekräfta det?

17.100 STATISTIKVYER

GainPilot ska erbjuda flera nivåer av statistik.

Exempel:

1. Snabb överblick.

2. Veckosammanfattning.

3. Programblock.

4. Målspecifik analys.

5. Övningshistorik.

6. Kost- och vikttrend.

7. Återhämtningsöversikt.

8. Fördjupad analys.

Användaren ska inte behöva förstå avancerad statistik för att använda produkten.

17.101 ÖVERSIKT

Översikten ska visa det mest relevanta för det aktuella målet.

Exempel:

- huvudmål,

- aktuell trend,

- viktigaste framsteg,

- kärnplanens följsamhet,

- och nästa utvärdering.

Översikten ska inte fyllas med alla tillgängliga mått.

17.102 PERSONLIG DASHBOARD

Användaren ska kunna anpassa vilka mått som visas.

Exempel:

- bänkpress,

- kroppsviktstrend,

- genomförda pass,

- löptid,

- eller pull-up-progression.

Säkerhetskritiska meddelanden ska inte kunna döljas på ett sätt som gör systemet osäkert.

17.103 MÅLKORT

Varje aktivt mål ska kunna ha ett målkort.

Kortet kan visa:

- mål,

- nuläge,

- trend,

- tidsperiod,

- viktigaste process,

- och nästa omprövning.

Det ska vara tydligt om nuläget är:

- mätt,

- uppskattat,

- eller kvalitativt bedömt.

17.104 ÖVNINGSVY

Övningsstatistik ska kunna visa:

- senaste resultat,

- personbästa,

- repetitionshistorik,

- belastning,

- RPE eller RIR,

- progression,

- och teknikfokus.

Den ska filtrera på rätt variant.

17.105 PROGRAMBLOCKSVY

Blockvyn ska kunna visa:

- syfte,

- genomförda pass,

- progressionsutfall,

- volymutveckling,

- viktiga anpassningar,

- och blockets slutsats.

Användaren ska förstå varför nästa block rekommenderas.

17.106 KOSTÖVERSIKT

Kostöversikten ska kunna visa:

- måltidsstruktur,

- planerade och kontrollerade byten,

- vikttrend där användaren vill,

- hunger eller energi,

- och planens praktiska funktion.

Den ska inte moralisera kring enskilda måltider.

17.107 KALENDERVY OCH PROGRESSION

Kalendern kan visa:

- genomförda kärnpass,

- planerade pauser,

- kortversioner,

- och återgångar.

Färg ska inte vara enda informationsbärare.

17.108 DIAGRAM

Diagram ska:

- ha tydlig axel,

- ha enhet,

- visa tidsperiod,

- skilja mätning från trend,

- och vara tillgängliga.

GainPilot ska undvika vilseledande:

- avskurna axlar,

- otydliga skalor,

- och dramatiska visuella effekter.

17.109 SKALOR

Systemet ska välja skala som hjälper användaren förstå förändringen utan att överdriva den.

Användaren ska kunna se:

- absolut värde,

- förändring,

- och relevant målintervall.

En liten förändring ska inte visuellt framställas som enorm.

17.110 FÄRGER

Grönt och rött får inte vara enda sättet att visa:

- förbättring,

- försämring,

- eller varning.

Systemet ska även använda:

- symbol,

- text,

- mönster,

- och etikett.

17.111 TILLGÄNGLIGHET

Statistik ska fungera med:

- skärmläsare,

- tangentbord,

- zoom,

- färgblindhet,

- och minskad rörelse.

Diagram ska ha textalternativ.

17.112 TEXTSAMMANFATTNING AV DIAGRAM

Varje viktigt diagram ska kunna få en textförklaring.

Exempel:

Din genomsnittliga bänkpressprestation har ökat under de senaste sex veckorna. Förändringen är tydligast i repetitionsresultaten på 100 kilogram.

17.113 INTERAKTIVA DIAGRAM

Användaren ska kunna:

- välja tidsperiod,

- filtrera variant,

- visa datapunkt,

- jämföra perioder,

- och öppna källan.

Interaktivitet ska inte krävas för att förstå huvudbudskapet.

17.114 JÄMFÖRELSE MELLAN PERIODER

GainPilot ska kunna jämföra:

- vecka mot vecka,

- månad mot månad,

- block mot block,

- eller samma säsong över år.

Jämförelsen ska visa kontextskillnader.

17.115 FÖRE OCH EFTER

Före- och efterpresentation ska användas försiktigt.

Systemet ska:

- visa tidsperiod,

- använda jämförbar data,

- och undvika manipulativ bildbehandling.

Användaren ska kunna välja att inte använda sådan vy.

17.116 FRAMSTEG UTAN SIFFROR

GainPilot ska kunna visa kvalitativa framsteg.

Exempel:

- användaren behöver mindre hjälp att planera,

- kan genomföra ett gympass självständigt,

- vågar använda en ny övning,

- eller har etablerat en fungerande veckostruktur.

Dessa framsteg ska kunna dokumenteras utan falsk numerisk poäng.

17.117 MILSTOLPAR

En milstolpe kan vara:

- prestationsbaserad,

- processbaserad,

- teknisk,

- eller användardefinierad.

Exempel:

- första strikta pull-up,

- tio konsekventa programveckor,

- första egna måltidsplaneringen,

- eller återgång efter lång paus.

Milstolpar ska vara meningsfulla för användaren.

17.118 AUTOMATISKA MILSTOLPAR

GainPilot kan identifiera objektiva milstolpar.

Exempel:

- nytt verifierat personbästa,

- genomfört programblock,

- eller första genomförda träningsvecka.

Kvalitativa och känsliga milstolpar ska normalt kräva användarbekräftelse.

17.119 FIRANDE

Arnold ska kunna fira framsteg.

Firandet ska vara:

- proportionerligt,

- valbart,

- och anpassat till användarens stil.

Systemet ska inte överdriva varje liten förändring eller använda barnslig gamification för alla.

17.120 INGEN MANIPULATIV GAMIFICATION

GainPilot ska inte använda:

- hot om förlorade belöningar,

- artificiell knapphet,

- skuld,

- eller social skam

för att tvinga fram beteende.

Belöningar ska stödja användarens verkliga mål.

17.121 FRAMSTEG OCH SJÄLVBILD

GainPilot ska använda neutralt språk kring:

- kropp,

- vikt,

- prestation,

- och missade mål.

Systemet ska inte koppla användarens värde som person till resultatet.

17.122 PLATÅ

En platå ska inte identifieras enbart för att ett mått varit oförändrat vid ett eller två tillfällen.

GainPilot ska bedöma:

- tillräcklig tidsperiod,

- datakvalitet,

- följsamhet,

- programfas,

- och återhämtning.

17.123 PLATÅTYPER

Systemet ska kunna skilja mellan:

- verklig prestationsplatå,

- normal variation,

- mätplatå,

- planeringsproblem,

- låg följsamhet,

- och avsiktlig underhållsfas.

Alla platåer kräver inte mer träning eller mindre mat.

17.124 PLATÅANALYS

En platåanalys kan omfatta:

- progression,

- träningsdos,

- teknik,

- återhämtning,

- kost,

- kalender,

- och användarfeedback.

Systemet ska presentera:

- sannolika förklaringar,

- inte säker diagnos.

17.125 PLATÅFÖRSLAG

Möjliga förslag kan vara:

- behåll planen längre,

- ändra progression,

- reducera trötthet,

- justera övning,

- förbättra genomförbarhet,

- eller skapa nytt block.

GainPilot ska undvika reflexmässig ökning av volym.

17.126 TILLBAKAGÅNG

Tillbakagång kan vara:

- tillfällig,

- förväntad,

- eller långsiktigt relevant.

Exempel:

Efter sjukdom kan lägre prestation vara normal.

Efter en planerad deload kan träningsvolymen vara lägre.

Systemet ska sätta resultatet i sammanhang.

17.127 UNDERHÅLL ÄR INTE MISSLYCKANDE

I vissa perioder är målet att bevara kapacitet.

GainPilot ska kunna visa:

Du har behållit huvudstyrkan under en period med halverad träningsfrekvens. Det är ett positivt resultat i förhållande till minimilägets mål.

17.128 DETRAINING OCH ÅTERSTART

Efter längre paus ska GainPilot kunna visa:

- vad som minskat,

- vad som bevarats,

- och hur snabbt kapaciteten återkommer.

Systemet ska undvika katastrofspråk.

17.129 PROGNOSER

GainPilot kan skapa försiktiga prognoser.

Exempel:

Om den nuvarande trenden fortsätter kan målet vara möjligt inom ungefär detta tidsintervall.

Prognoser ska:

- uttrycka intervall,

- visa antaganden,

- och tydligt beskriva osäkerhet.

17.130 INGA GARANTER

GainPilot får inte garantera:

- viss vikt,

- viss muskelökning,

- visst styrkeresultat,

- eller visst datum.

Biologiska och praktiska utfall varierar.

17.131 SCENARIER

I stället för en enda prognos kan GainPilot visa scenarier.

Exempel:

Stabil utveckling:

Nuvarande plan fortsätter.

Långsammare utveckling:

Fler avbrott eller lägre följsamhet.

Snabbare utveckling:

Förbättrad kontinuitet och fortsatt god återhämtning.

Scenarier ska inte bli pressande löften.

17.132 FÖRVÄNTNINGSINTERVALL

GainPilot kan använda ett förväntningsintervall för förändring.

Det ska bygga på:

- användarens historik,

- mål,

- och generell canonical kunskap.

Systemet ska inte dölja att individens utfall kan ligga utanför intervallet.

17.133 BENCHMARKS

GainPilot kan använda benchmarks för orientering.

Exempel:

- standardiserade träningsnivåer,

- konditionstester,

- eller färdighetsnivåer.

Benchmarks ska vara:

- valbara,

- relevanta,

- och tydligt kontextualiserade.

De får inte användas för att skambelägga användaren.

17.134 PERSONLIG JÄMFÖRELSE FÖRE BEFOLKNINGSJÄMFÖRELSE

Systemet ska i första hand jämföra användaren med:

- sin egen baslinje,

- sina mål,

- och sin plan.

Befolkningsjämförelser ska vara sekundära.

17.135 SOCIAL JÄMFÖRELSE

Om framtida sociala funktioner används ska användaren styra:

- vad som delas,

- med vem,

- och om ranking används.

GainPilot ska inte skapa offentlig prestationsranking som standard.

17.136 ANONYMA BENCHMARKS

Aggregerade benchmarks kan användas om:

- integritet skyddas,

- urvalet är relevant,

- och datakvaliteten är tillräcklig.

Systemet ska beskriva:

- population,

- nivå,

- och begränsningar.

17.137 SNEDVRIDNING I BENCHMARKS

Befolkningsdata kan vara snedvriden av:

- vilka som loggar,

- bortfall,

- träningsnivå,

- kön,

- ålder,

- utrustning,

- och geografisk marknad.

GainPilot ska inte presentera sned data som universell norm.

17.138 ÅLDER OCH DEMOGRAFI

Demografisk information ska endast användas när:

- den är relevant,

- användaren har rätt kontroll,

- och modellen är rättvist granskad.

Systemet ska inte skapa begränsande antaganden om användarens förmåga enbart utifrån demografi.

17.139 RÄTTVISA I ANALYS

Analysmodeller ska granskas för att säkerställa att de inte systematiskt:

- underskattar vissa användare,

- överdriver risk,

- eller ger sämre rekommendationer

på grund av datamängd, kroppstyp, kön, funktionsvariation eller annan irrelevant faktor.

17.140 PERSONLIGA MÅTT

Användaren ska kunna skapa egna mått.

Exempel:

- antal pass där tekniken kändes stabil,

- antal veckor med matlådor,

- eller hur ofta promenader genomfördes.

Egna mått ska ha tydlig definition.

17.141 ANVÄNDARSTYRDA PRIORITERINGAR

Användaren ska kunna välja vilka framsteg som är viktigast.

Exempel:

Jag bryr mig mer om att passen blir genomförda än om att vikten ökar varje vecka.

Arnold ska anpassa översikten efter detta.

17.142 DOLDA MÅTT

Vissa interna mått kan behövas för systemdrift.

Exempel:

- modellkvalitet,

- synkroniseringsfel,

- eller osäkerhetsvärde.

Dessa ska inte automatiskt visas som användarens prestationsmått.

17.143 POÄNGSYSTEM

Om GainPilot använder en sammanfattande poäng ska den:

- ha tydlig definition,

- kunna förklaras,

- och aldrig ersätta domänmåtten.

Poängen ska inte vara:

- hälsobetyg,

- människovärde,

- eller absolut prognos.

17.144 INGEN OGENOMSKINLIG HÄLSOPOÄNG

GainPilot ska inte skapa ett allomfattande hälsotal som kombinerar:

- vikt,

- mat,

- sömn,

- träning,

- och humör

utan att användaren kan förstå hur det beräknas.

Systemet ska hellre visa separata relevanta signaler.

17.145 VECKOSAMMANFATTNING

Arnold ska kunna skapa en veckosammanfattning.

Den kan innehålla:

- veckans huvudmål,

- genomförda kärnaktiviteter,

- framsteg,

- kontrollerade anpassningar,

- återhämtningssignal,

- och nästa veckas fokus.

Exempel:

Veckans viktigaste resultat:

- Tre av tre prioriterade styrkepass genomfördes.

- Bänkpressen ökade från 8 till 9 repetitioner på 100 kilogram.

- Två pass använde kortversion utan att huvudövningarna försvann.

- Kroppsviktstrenden är stabil.

- Nästa vecka behåller vi samma struktur.

17.146 MÅNADSSAMMANFATTNING

Månadssammanfattningen ska fokusera på längre mönster.

Exempel:

- styrketrend,

- genomförbarhet,

- vikttrend,

- nya färdigheter,

- och viktigaste planändring.

Den ska inte upprepa varje veckodetalj.

17.147 BLOCKSAMMANFATTNING

Vid programblockets slut ska Arnold kunna beskriva:

- vad blocket försökte uppnå,

- vad som faktiskt hände,

- vilka mått som förbättrades,

- vilka problem som återkom,

- och nästa rekommendation.

17.148 SAMMANFATTNINGENS TON

Sammanfattningar ska vara:

- sakliga,

- uppmuntrande,

- ärliga,

- och icke-moraliserande.

Arnold ska inte gömma negativa signaler.

Han ska inte heller förstora dem.

17.149 REKOMMENDATION FRÅN STATISTIK

En rekommendation ska kopplas till:

- aktivt mål,

- relevant trend,

- datakvalitet,

- och programmets regler.

Exempel:

Du har nått övre repetitionsgränsen i tre jämförbara pass med stabil RIR. Jag rekommenderar en mindre belastningsökning nästa gång.

17.150 INGEN REKOMMENDATION

Ibland är rätt beslut att inte ändra något.

GainPilot ska kunna säga:

Trenden är stabil och underlaget visar inget tydligt behov av förändring. Vi behåller planen och följer nästa två pass.

17.151 REKOMMENDATIONSSTYRKA

Rekommendationer ska kunna ha nivåer.

Exempel:

- observation,

- möjligt förslag,

- rekommendation,

- stark rekommendation,

- eller säkerhetskrav.

Nivån ska bero på:

- datakvalitet,

- risk,

- och användarmandat.

17.152 FÖRKLARING

Arnold ska kunna förklara:

- vilka data som användes,

- vilken period som jämfördes,

- vad som talar för slutsatsen,

- vad som är osäkert,

- och varför förslaget är proportionerligt.

17.153 ALTERNATIV

Vid större beslut ska Arnold kunna presentera alternativ.

Exempel:

1. Behåll planen två veckor till.

2. Minska ett kompletterande set.

3. Byt progression i huvudövningen.

Systemet ska förklara fördelar och kompromisser.

17.154 ANVÄNDARVAL

Användaren ska kunna:

- godkänna,

- avvisa,

- skjuta upp,

- eller redigera rekommendationen.

Avvisandet ska inte automatiskt tolkas som irrationellt.

17.155 ÅTGÄRDSKOPPLING

En godkänd rekommendation ska kunna skapa:

- programändring,

- måltidsförändring,

- kalenderanpassning,

- minnesförslag,

- eller ny uppföljning.

Åtgärden ska följa respektive domäns governance.

17.156 ANALYS FÅR INTE SKRIVA DIREKT

Statistikmotorn får inte direkt ändra:

- program,

- kostmål,

- säkerhetsregler,

- eller användarprofil

utan rätt besluts- och approvalprocess.

17.157 AUTOMATISKA LÅGRISKÅTGÄRDER

Inom användarens mandat kan vissa lågriskåtgärder ske automatiskt.

Exempel:

- uppdatera nästa belastningsförslag enligt tydlig programregel,

- eller justera ett diagramfilter.

Åtgärden ska vara synlig och återställningsbar.

17.158 HÖGRISKÅTGÄRDER

Större förändringar ska kräva starkare kontroll.

Exempel:

- betydande energiändring,

- programblockbyte,

- permanent övningsblockering,

- eller medicinskt relevant rekommendation.

17.159 NOTISER OM PROGRESSION

GainPilot kan skicka notiser om:

- verklig milstolpe,

- veckosammanfattning,

- ny rekommendation,

- eller behov av användarbeslut.

Systemet ska undvika:

- dagliga prestationsbedömningar,

- överdrivna firanden,

- och notiser som skapar oro.

17.160 NEGATIVA NOTISER

GainPilot ska inte skicka formuleringar som:

Du ligger efter.

Du förstörde din streak.

Din utveckling är dålig.

Arnold kan i stället säga:

Planen har varit svår att genomföra de senaste två veckorna. Jag har identifierat två möjliga sätt att förenkla den.

17.161 ANOMALIER

Systemet ska kunna notifiera vid betydelsefulla anomalier.

Exempel:

- uppenbart felaktig viktmätning,

- oväntad kraftig prestationsförändring,

- eller flera återkommande säkerhetssignaler.

Anomalier ska inte automatiskt beskrivas som medicinska problem.

17.162 SÄKERHETSSIGNALER

Statistiksystemet ska kunna identifiera mönster som behöver säkerhetsgranskning.

Exempel:

- återkommande smärtrapporter,

- upprepade svimningskänslor,

- extrem viktförändring,

- eller destruktiv kostfeedback.

Systemet ska pausa vanlig optimering och använda rätt säkerhetsflöde.

17.163 PROFESSIONELL HÄNVISNING

När signalerna ligger utanför GainPilots kompetens ska Arnold kunna rekommendera:

- läkare,

- fysioterapeut,

- dietist,

- psykolog,

- eller annan relevant professionell hjälp.

GainPilot ska inte diagnostisera genom statistik.

17.164 DATAMINIMERING

Progressionsanalys ska använda minsta nödvändiga data.

Exempel:

För träningsprogression behövs normalt inte:

- privata meddelanden,

- full arbetskalender,

- eller andra Omnira-projekts innehåll.

Hermes ska reducera kontexten.

17.165 KÄNSLIGA MÅTT

Följande kan vara känsliga:

- kroppsvikt,

- kroppsmått,

- progressionsbilder,

- kostlogg,

- puls,

- återhämtning,

- och professionella instruktioner.

Användaren ska kunna styra:

- om de visas,

- var de visas,

- vem som får se dem,

- och om de används i sammanfattningar.

17.166 PRIVAT DASHBOARD

Känsliga mått ska kunna döljas från:

- låsskärm,

- delad skärm,

- social delning,

- och tränarvy.

GainPilot ska inte anta att användarens enhet alltid är privat.

17.167 DELNING AV FRAMSTEG

Användaren ska kunna dela:

- en milstolpe,

- ett pass,

- en graf,

- eller en sammanfattning.

Delningen ska vara granulär.

Systemet ska inte automatiskt inkludera:

- kroppsvikt,

- kroppsbilder,

- kostdata,

- eller privata anteckningar.

17.168 DELNING MED TRÄNARE

En tränare kan få tillgång till:

- valda träningsmått,

- programföljsamhet,

- feedback,

- och relevanta säkerhetssignaler

inom sitt mandat.

Tränaren ska inte automatiskt få full GainPilot- eller Atlasprofil.

17.169 DELNING MED VÅRDPERSONAL

Professionell export ska kunna innehålla:

- definierad period,

- vald datatyp,

- källor,

- och osäkerhet.

Systemet ska inte framställa GainPilots analys som medicinsk journal.

17.170 SOCIAL DELNING

Sociala framsteg ska vara avstängda som standard.

Användaren ska aktivt välja:

- innehåll,

- mottagare,

- text,

- och om GainPilot-varumärke visas.

Systemet ska inte använda social press som huvudmotivationsmetod.

17.171 EXPORT

Användaren ska kunna exportera:

- träningshistorik,

- personbästa,

- mål,

- vikttrend,

- måltidsöversikt,

- och egna feedbackdata.

Exporten ska innehålla:

- enheter,

- datum,

- och relevant provenance.

17.172 RADERING

Användaren ska kunna radera:

- enskilda mätvärden,

- kroppsmått,

- bilder,

- viktdata,

- eller hela statistikdomäner

inom tillämpliga regler.

Raderad data ska inte fortsätta påverka analysen.

17.173 RETENTION

Olika datatyper ska ha definierad retention.

Exempel:

Strukturerade träningsresultat:

Kan bevaras långsiktigt.

Rå sensordata:

Kortare retention.

Progressionsbilder:

Användarstyrd retention.

Tillfälliga analysmellanresultat:

Raderas när uppgiften är klar.

17.174 PRIVATLÄGE

Användaren ska kunna analysera ett resultat utan att skapa permanent statistik.

Exempel:

- privat bildjämförelse,

- tillfällig viktfråga,

- eller hypotetisk prognos.

Systemet ska tydligt visa vad som sparas.

17.175 ARNOLDS ROLL

Arnold ska göra statistik begriplig.

Han ska:

- prioritera det viktigaste,

- förklara trender,

- uttrycka osäkerhet,

- ge proportionerliga rekommendationer,

- och hjälpa användaren fatta beslut.

Arnold ska inte recitera alla datapunkter användaren redan kan se.

17.176 ATLAS ROLL

Atlas ska kunna hjälpa med:

- längre tidsserier,

- samband mellan godkända domäner,

- analyskvalitet,

- research,

- och plattformsförbättring.

Atlas får inte fritt kombinera alla användarens privata data.

Varje analys ska ha definierat syfte och scope.

17.177 HERMES ROLL

Hermes ska kontrollera:

- vilka mått som får kombineras,

- vilken tidsperiod,

- vilken agent,

- vilket syfte,

- och vilken detaljnivå.

Exempel:

Atlas kan få:

Användarens träningsgenomförande minskade under en period med låg tillgänglighet.

Atlas behöver normalt inte få:

- mötestitlar,

- privata personer,

- eller full kostdagbok.

17.178 SESSIONSSPECIFIK ANALYSKONTEXT

När Arnold analyserar ett pass ska Hermes kunna leverera:

- rätt programversion,

- jämförbara tidigare pass,

- aktuella mål,

- och relevanta begränsningar.

Han ska inte få hela användarens historik om den inte behövs.

17.179 ANALYSPAKET

Ett analyspaket ska kunna beskriva:

- frågan,

- måttet,

- perioden,

- datakällorna,

- exkluderade domäner,

- modellversionen,

- och behörigheten.

Paketet ska vara tillfälligt och auditerbart.

17.180 ANALYSMODELLER

Varje viktig analysmodell ska ha:

- identitet,

- version,

- syfte,

- indata,

- utdata,

- begränsningar,

- teststatus,

- och ägare.

Exempel:

- e1RM-modell,

- vikttrendmodell,

- följsamhetsmodell,

- eller planeringsfriktionsmodell.

17.181 MODELLREGISTER

GainPilot ska ha ett register över aktiva analysmodeller.

Registret ska kunna visa:

- vilken version som används,

- i vilka funktioner,

- när den godkändes,

- och vilka kända begränsningar som finns.

17.182 MODELLUPPDATERING

En ny analysmodell ska inte tyst ändra historiska slutsatser.

GainPilot ska kunna:

- köra den parallellt,

- jämföra utfall,

- och bestämma om historik ska räknas om.

17.183 BACKTESTING

Modeller ska kunna testas mot historisk data.

Backtesting ska bedöma:

- stabilitet,

- felaktiga signaler,

- överreaktion,

- och rekommendationernas utfall.

Historisk korrelation är inte tillräcklig för att bevisa framtida nytta.

17.184 SIMULERING

GainPilot ska kunna simulera hur analysmodellen agerar vid:

- saknad data,

- outliers,

- sjukdom,

- paus,

- snabb progression,

- och varierande följsamhet.

Simulering ska användas före bred produktionsaktivering.

17.185 SHADOW MODE

Nya modeller kan köras i shadow mode.

Det innebär att modellen:

- skapar analys,

- men inte påverkar användaren eller planen.

Resultatet kan jämföras med den aktiva modellen.

17.186 CANARY-UTRULLNING

En ny modell kan aktiveras för en begränsad grupp efter godkännande.

Utrullningen ska:

- ha tydliga framgångskriterier,

- kunna stoppas,

- och inte inkludera högriskanvändning utan starkare granskning.

17.187 MODELLDRIFT

GainPilot ska övervaka om analysmodeller blir mindre tillförlitliga när:

- användarbeteende förändras,

- datakällor ändras,

- nya träningsdomäner tillkommer,

- eller externa integrationer uppdateras.

17.188 KALIBRERING

Modellens säkerhetsnivå ska spegla verklig träffsäkerhet.

Om modellen ofta uttrycker hög säkerhet men användare korrigerar slutsatsen ska den omkalibreras.

17.189 FALSKA POSITIVA SIGNALER

Systemet ska mäta hur ofta det felaktigt:

- identifierar platå,

- varnar för problem,

- eller föreslår förändring.

För många falska signaler skadar användarens förtroende.

17.190 FALSKA NEGATIVA SIGNALER

Systemet ska även bedöma om det missar:

- återkommande smärta,

- planeringsproblem,

- eller tydlig regressionssignal.

Säkerhetsrelaterade missar ska ha hög prioritet.

17.191 ANVÄNDARKORRIGERING AV ANALYS

Användaren ska kunna säga:

- detta stämmer,

- detta stämmer inte,

- information saknas,

- eller förklaringen är fel.

Korrigeringen ska påverka:

- analysstatus,

- och framtida modellutvärdering.

17.192 FÖRKLARBARHET

En analys ska kunna förklaras utan att användaren behöver läsa modellkod.

Exempel:

Jag bedömer att fredagens passplacering fungerar dåligt eftersom det har flyttats eller kortats i fem av de senaste sex veckorna. De andra två huvudpassen har varit stabila.

17.193 FÖRKLARINGENS NIVÅER

GainPilot ska kunna erbjuda:

- kort förklaring,

- detaljerad förklaring,

- och tekniskt underlag.

Den tekniska nivån kan innehålla:

- mått,

- period,

- modellversion,

- och exkluderade data.

17.194 INGA PÅHITTADE FÖRKLARINGAR

Arnold får inte skapa en övertygande efterhandsförklaring som modellen inte faktiskt använde.

Förklaringen ska grundas i:

- verkliga data,

- verklig modell,

- och dokumenterad beslutskedja.

17.195 OBSERVABILITY

Det ska gå att förstå:

- vilka data som analyserades,

- vilken modellversion,

- vilken trend som skapades,

- vilken rekommendation som följde,

- och om användaren accepterade den.

Loggar ska minimera känsligt innehåll.

17.196 AUDIT

Betydelsefulla händelser ska kunna auditeras.

Exempel:

- nytt personbästa verifierades,

- kroppsvikt korrigerades,

- prognos skapades,

- högriskrekommendation stoppades,

- modellversion ändrades,

- eller användaren raderade en statistikdomän.

17.197 INCIDENTHANTERING

En analysincident kan vara:

- fel användares data visas,

- vikttrend räknas fel,

- personbästa skapas från dubblett,

- privat bild exponeras,

- eller en modell ger riskfylld rekommendation.

Systemet ska kunna:

- stoppa funktionen,

- identifiera omfattning,

- korrigera data,

- återkalla rekommendationer,

- och följa upp.

17.198 ANALYSROLLBACK

GainPilot ska kunna återgå till:

- tidigare modellversion,

- tidigare trendberäkning,

- eller tidigare dashboardlogik.

Rollback får inte återaktivera kända säkerhetsproblem.

17.199 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera produktens kvalitet.

Exempel:

- vilka diagram som förstås,

- vilka rekommendationer som accepteras,

- hur ofta analyser korrigeras,

- var användare blir förvirrade,

- och vilka mått som faktiskt leder till bättre beslut.

Analysen ska använda aggregerad och minimerad data där möjligt.

17.200 PRODUKTMETRIK

Relevanta produktmetrik kan vara:

- öppningsfrekvens för sammanfattningar,

- andel förklaringar som användaren upplever som begripliga,

- korrigeringsfrekvens,

- rekommendationsacceptans,

- återställningsfrekvens,

- och tid till beslut.

GainPilot ska inte optimera för att användaren tittar på statistik varje dag.

17.201 FRAMGÅNG FÖR STATISTIKSYSTEMET

Statistiksystemet är framgångsrikt när det:

- minskar osäkerhet,

- förbättrar beslut,

- gör framsteg synliga,

- och förhindrar överreaktion.

Antalet diagram är inte ett framgångsmått.

17.202 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar förbättringsbehov ska processen vara:

Signal

→ Analys

→ Hypotes

→ Modell- eller produktförslag

→ Risk-, integritets- och rättvisebedömning

→ Godkänt scope

→ Separat branch

→ Implementation

→ Tester

→ Modellvalidering

→ Pull request

→ Granskning

→ Kontrollerad merge

→ Begränsad utrullning

→ Resultatuppföljning

Ingen agent får direkt:

- byta analysmodell,

- ändra användarens mål,

- skapa nya hälsopoäng,

- skriva om historik,

- eller genomföra högriskåtgärder

utan denna process.

17.203 TESTNING AV PROGRESSIONSMODELLEN

Progressionsmodellen ska testas genom:

- enhetstester,

- kontraktstester,

- scenariotester,

- statistiska tester,

- säkerhetstester,

- integritetstester,

- tillgänglighetstester,

- och regressionstester.

17.204 STYRKETESTER

Tester ska omfatta:

- belastningsökning,

- repetitionsrekord,

- e1RM,

- ändrad variant,

- RPE,

- saknad data,

- och felaktigt personbästa.

17.205 KROPPSVIKTSTESTER

Tester ska omfatta:

- daglig variation,

- rullande genomsnitt,

- saknade dagar,

- fel vågprofil,

- outlier,

- och ändrad målsättning.

17.206 KONDITIONSTESTER

Tester ska omfatta:

- olika underlag,

- GPS-fel,

- pulsdata,

- tidsförbättring,

- väderkontext,

- och olika sensorkällor.

17.207 CROSSFITTESTER

Tester ska omfatta:

- RX och scaled,

- time cap,

- ändrad workoutversion,

- no-reps,

- och inkompatibla standarder.

17.208 CALISTHENICSTESTER

Tester ska omfatta:

- minskad assistans,

- längre hålltid,

- lägre kvalitet,

- progressionsteg,

- och enstaka lyckat försök.

17.209 FÖLJSAMHETSTESTER

Tester ska verifiera att:

- kortversion,

- reservmåltid,

- planerad paus,

- och uppnådd miniminivå

inte felaktigt klassificeras som misslyckande.

17.210 PLATÅTESTER

Scenarier ska omfatta:

- normal variation,

- verklig platå,

- låg följsamhet,

- återhämtningsproblem,

- och underhållsfas.

Systemet ska inte ge samma rekommendation i alla fall.

17.211 SAKNAD DATA OCH OUTLIERS

Tester ska verifiera:

- att saknad data inte blir noll,

- att outliers flaggas,

- att användaren kan bekräfta,

- och att ogiltiga värden exkluderas.

17.212 MODELLVERSIONSTESTER

Tester ska verifiera:

- modellregister,

- parallella versioner,

- shadow mode,

- rollback,

- och historiska beräkningar.

17.213 INTEGRITETSTESTER

Tester ska verifiera:

- rätt användare,

- rätt domän,

- progressionsbilder,

- kroppsmått,

- tränardelning,

- och Hermes-minimering.

17.214 TILLGÄNGLIGHETSTESTER

Statistik ska testas för:

- skärmläsare,

- tangentbord,

- zoom,

- färgblindhet,

- textalternativ,

- och begriplighet utan interaktiv graf.

17.215 ANVÄNDARTESTNING

Systemet ska testas med:

- användare som vill ha enkel överblick,

- avancerade statistikintresserade användare,

- nybörjare,

- styrkeutövare,

- viktmål,

- CrossFit,

- calisthenics,

- kondition,

- och användare som inte vill se kroppsvikt.

17.216 FÖRKLARINGSTESTER

Användare ska kunna förstå:

- vad som förändrats,

- varför GainPilot tror det,

- hur säkert det är,

- och vad nästa steg innebär.

En tekniskt korrekt analys är inte tillräcklig om förklaringen är obegriplig.

17.217 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots progression, statistik och återkoppling.

**Kontrakt GP-287 — Progression är flerdimensionell**

GainPilot ska mäta relevant utveckling inom prestation, teknik, genomförbarhet, kontinuitet, kost, återhämtning och användarupplevelse — inte genom en enda universell poäng.

**Kontrakt GP-288 — Mätvärde, trend, tolkning och rekommendation ska separeras**

Observerad data, beräkning, analys och åtgärd ska vara skilda och spårbara lager.

**Kontrakt GP-289 — Provenance för statistik**

Varje viktigt mätvärde och varje beräknad trend ska ha källa, tidpunkt, modellversion och datakvalitet.

**Kontrakt GP-290 — Trend före enskilt värde**

GainPilot ska normalt använda flera jämförbara datapunkter innan en förändring klassificeras som progression eller tillbakagång.

**Kontrakt GP-291 — Domänspecifika tidsfönster**

Trendfönster och stabilitetskrav ska anpassas efter måttets biologiska, praktiska och tekniska egenskaper.

**Kontrakt GP-292 — Jämförbarhet före analys**

Resultat från olika övningsvarianter, standarder, miljöer, sensorer eller mätmetoder får inte jämföras direkt utan tydlig kontext.

**Kontrakt GP-293 — Osäkerhet ska vara synlig**

GainPilot ska uttrycka när underlaget är begränsat, modellen är osäker eller förändringen kan ligga inom normal variation.

**Kontrakt GP-294 — Processmål ska synliggöras**

Användaren ska kunna få återkoppling på fungerande process och kontinuitet även innan slutresultatet har förändrats.

**Kontrakt GP-295 — Kontrollerad anpassning räknas som följsamhet**

Godkända reservpass, kortversioner, måltidsbyten och minimilägen får inte automatiskt klassificeras som misslyckanden.

**Kontrakt GP-296 — Planeringskvalitet ska mätas**

Återkommande missade eller flyttade aktiviteter ska kunna analyseras som problem i planen och inte endast i användarens beteende.

**Kontrakt GP-297 — Kvalitativa framsteg är giltiga**

GainPilot ska kunna dokumentera teknik, självständighet, trygghet och fungerande vanor utan att tvinga fram en falsk numerisk poäng.

**Kontrakt GP-298 — Korrelation är inte orsak**

Samband mellan sömn, kost, kalender, återhämtning och prestation ska beskrivas som möjliga relationer om orsak inte kan fastställas.

**Kontrakt GP-299 — Överreaktion ska förhindras**

Enskilda avvikelser får inte skriva om program, kostplan eller användarprofil om signalen inte är säkerhetskritisk.

**Kontrakt GP-300 — Platå kräver kvalificerad bedömning**

En platå ska kräva tillräcklig tidsperiod, jämförbar data och analys av plan, följsamhet och återhämtning.

**Kontrakt GP-301 — Prognoser är scenarier, inte garantier**

Framtida utveckling ska uttryckas genom intervall, antaganden och osäkerhet.

**Kontrakt GP-302 — Personlig jämförelse före populationsjämförelse**

GainPilot ska i första hand bedöma användaren mot den egna baslinjen, målet och planen.

**Kontrakt GP-303 — Ingen ogenomskinlig hälsopoäng**

Systemet får inte reducera användarens kropp, kost, sömn, träning och välmående till ett oförklarligt globalt hälsotal.

**Kontrakt GP-304 — Förklarbar rekommendation**

Varje betydelsefull rekommendation ska kunna förklaras genom använda data, jämförelseperiod, osäkerhet och beslutsregel.

**Kontrakt GP-305 — Analys får inte skriva direkt**

Statistik- och analysmotorer får inte ändra program, kostmål, säkerhetsregler eller minnen utan respektive domäns mandat och approvalprocess.

**Kontrakt GP-306 — Modellversionering**

Analysmodeller, beräkningar, trendalgoritmer och rekommendationsregler ska ha identitet, version och rollback.

**Kontrakt GP-307 — Användaren får korrigera analysen**

Användaren ska kunna korrigera data, avvisa slutsatser och markera att kontext saknas.

**Kontrakt GP-308 — Minimerad analyskontext**

Hermes ska leverera den minsta datamängd som krävs för aktuell analys och hindra obegränsad domänkombination.

**Kontrakt GP-309 — Privat statistik**

Kroppsmått, kroppsvikt, bilder, kostdata och återhämtningssignaler ska vara privata som standard och ha granulär delning.

**Kontrakt GP-310 — Branch- och modellstyrd utveckling**

Förändringar av analysmodeller, statistikvyer, prognoser, rekommendationer och datakombinationer ska ske genom separat branch, validering, tester, granskning och kontrollerad utrullning.

17.218 ANTI-PRINCIPER

GainPilot ska inte:

- reducera all progression till ett enda tal,

- anta att mer träningsvolym alltid är bättre,

- behandla högre kroppsvikt som automatiskt negativ,

- behandla lägre kroppsvikt som automatiskt positiv,

- jämföra olika övningsvarianter som identiska,

- jämföra olika CrossFit-scaling som samma prestation,

- blanda olika kroppsfettsmetoder utan kontext,

- presentera e1RM som verifierat max,

- skapa personbästa från osäker data,

- tolka en enskild mätning som stabil trend,

- använda samma trendfönster för alla domäner,

- visa falsk precision,

- skapa dramatiska diagram genom vilseledande skalor,

- använda färg som enda informationsbärare,

- kräva kroppsvikt eller progressionsbilder,

- ge exakt kroppsfettprocent från ett vanligt foto,

- sexualisera eller värdera användarens kropp,

- låta sensordata övertrumfa användarens upplevelse utan analys,

- behandla saknad data som noll,

- fylla i mätvärden och visa dem som observerade fakta,

- radera outliers automatiskt,

- betrakta en planerad paus som misslyckande,

- betrakta kortversion som utebliven träning,

- betrakta reservmåltid som låg kostföljsamhet,

- skapa streaks som straffar planerad vila,

- använda förlorad streak för skuldbeläggning,

- göra varje mätbart område till ett mål,

- skapa offentlig ranking som standard,

- jämföra användaren med population före den egna utvecklingen,

- presentera snedvridna benchmarks som norm,

- anta förmåga eller begränsning enbart från demografi,

- göra underhållsperiod till negativ utveckling,

- identifiera platå efter ett fåtal datapunkter,

- öka träningsvolym reflexmässigt vid platå,

- skapa säkra orsaksförklaringar från korrelation,

- lova resultat eller måldatum,

- använda moraliserande språk i sammanfattningar,

- dölja negativa signaler för att vara uppmuntrande,

- överdriva små framsteg,

- skapa notiser som säger att användaren ligger efter eller förstört något,

- använda statistik för att öka skärmtid,

- skapa ogenomskinlig global hälsopoäng,

- låta analysmotorn skriva direkt till program eller kostplan,

- ändra historiska resultat utan versionsspår,

- byta modellversion utan validering,

- låta en språkmodell hitta på en förklaring i efterhand,

- kombinera alla användarens privata domäner utan explicit syfte,

- dela kroppsmått eller bilder automatiskt,

- använda privat statistik för manipulativ försäljning,

- eller ändra statistik- och analysmotorn direkt i main eller produktion utan branch, tester och granskning.

17.219 KANONISKA BESLUT FRÅN KAPITEL 17

Följande beslut etableras:

1. GainPilot ska ha en canonical progressionsmodell.

2. Progression ska representeras i flera domäner.

3. Ingen global poäng ska ersätta domänspecifika mått.

4. Varje mått ska ha stabil identitet.

5. Mått ska organiseras efter domän.

6. Mätvärde, beräkning, trend, tolkning och rekommendation ska hållas åtskilda.

7. Direkta, beräknade och infererade mått ska klassificeras separat.

8. Varje viktigt värde ska ha provenance.

9. Datakvalitet ska påverka slutsatsens styrka.

10. Mätosäkerhet ska uttryckas.

11. Varje progressionsanalys ska ha en baslinje.

12. Baslinjen ska vara synlig för användaren.

13. Rullande baslinjer får användas för aktuella trender.

14. Mål ska kunna vara exakta, intervallbaserade, riktade eller kvalitativa.

15. Alla mått behöver inte bli mål.

16. GainPilot ska skilja mellan ledande och eftersläpande mått.

17. Processmål ska kunna lyftas innan slutresultatet förändras.

18. Trend ska normalt väga tyngre än enskild datapunkt.

19. Trendfönster ska vara domänspecifika.

20. Kortsiktig och långsiktig trend ska visas separat.

21. Trendens stabilitet ska kunna beskrivas.

22. Praktisk betydelse ska skiljas från mätbar förändring.

23. Styrkeprogression ska använda variantkorrekt data.

24. e1RM ska vara en uppskattning.

25. Verifierat max och uppskattat max ska hållas åtskilda.

26. Repetitionspersonbästa ska vara vikt- och variantberoende.

27. Volym ska vara ett stödjande och inte universellt mått.

28. Tonnage ska användas med kontext.

29. Teknikprogression ska kunna vara kvalitativ.

30. AI-tekniktrend ska kräva jämförbar video och modellversion.

31. Tränarbedömning ska ha separat källa.

32. Hypertrofi ska bedömas genom flera signaler.

33. Kroppsmått ska ha definierad mätmetod.

34. Små förändringar i kroppsmått ska inte överdrivas.

35. Progressionsbilder ska vara valbara och privata.

36. AI-kroppsanalys ska behandlas som högrisk.

37. Kroppsvikt ska kunna ha flera källor.

38. Rullande viktgenomsnitt ska visas separat från dagsvärden.

39. Viktförändring ska bedömas i relation till mål.

40. Kroppsfett ska bevara mätmetod.

41. Konditionsanalys ska bevara miljö och sensorkälla.

42. Löpning, cykling och ergometer ska ha domänspecifik jämförelse.

43. Definierade konditionstester ska ha standardiserat protokoll.

44. CrossFit-resultat ska bevara workout, scaling och standard.

45. Benchmark-workouts med olika scaling ska inte jämföras okritiskt.

46. CrossFit-kapacitet ska inte reduceras till en enda poäng.

47. Calisthenicsprogression ska använda progression, assistans, kvalitet och hålltid.

48. Ett enskilt lyckat skillförsök ska inte automatiskt ändra skillstatus.

49. Assistansformer ska hållas åtskilda.

50. Hålltid ska bedömas tillsammans med kvalitet.

51. Följsamhet ska vara neutral och funktionsbaserad.

52. Kärnplan och full plan ska kunna visas separat.

53. Uppnådd miniminivå ska behandlas som meningsfullt resultat.

54. Kontrollerade anpassningar ska kunna räknas som följsamhet.

55. Planeringskvalitet ska följas.

56. Faktisk passlängd ska jämföras med planerad.

57. Kostföljsamhet ska anpassas till vald detaljnivå.

58. Reservmåltider ska kunna räknas som lyckade anpassningar.

59. Kontinuitet ska väga tyngre än obrutna dagliga kedjor.

60. Streaks ska vara flexibla och valbara.

61. Återgång efter avbrott ska kunna uppmärksammas som framsteg.

62. Återhämtningsmått ska vara valbara.

63. En extern återhämtningspoäng ska inte bli biologisk sanning.

64. Personlig återhämtningsbaslinje ska prioriteras.

65. Återhämtningsmönster ska behandlas som inferenser tills de bekräftas.

66. Användarens egen upplevelse ska vara central datakälla.

67. Kvalitativ feedback ska kunna bevaras i originalform.

68. Feedback ska klassificeras efter typ.

69. Sessions-, vecko- och blockfeedback ska vara separata.

70. Feedbackkälla och giltighet ska lagras.

71. Negativ feedback ska routas till rätt domänprocess.

72. Positiv feedback ska analyseras i kontext.

73. GainPilot ska använda en spårbar feedbackloop.

74. Överreaktionsskydd ska finnas.

75. Större förändringar ska kunna använda stabilitetsfönster.

76. Förändringar ska ha hypotes och uppföljning.

77. Systemet ska kunna bedöma förändringens utfall.

78. Korrelation ska inte beskrivas som säker orsak.

79. Atlas får analysera flera godkända signaler med osäkerhet.

80. Möjliga konfounders ska visas.

81. Direkt jämförelse ska kräva kompatibel data.

82. Normalisering ska endast användas när den hjälper målet.

83. Modelländringar ska inte skriva om historik osynligt.

84. Datakorrigering ska uppdatera analyser.

85. Ogiltig data ska exkluderas från aktiva trender.

86. Saknad data ska förbli saknad.

87. Imputerad data ska markeras och inte bli verklig prestation.

88. Outliers ska granskas och inte raderas automatiskt.

89. Osäkra personbästa ska kräva bekräftelse.

90. GainPilot ska erbjuda flera statistiknivåer.

91. Översikten ska anpassas efter aktuellt mål.

92. Användaren ska kunna anpassa sin dashboard.

93. Varje mål ska kunna ha ett målkort.

94. Övningsstatistik ska filtrera rätt variant.

95. Programblock ska ha egen progressionssammanfattning.

96. Kostöversikten ska vara neutral.

97. Kalendern ska kunna visa kärnplanens genomförande.

98. Diagram ska ha tydliga axlar, enheter och perioder.

99. Diagram ska undvika vilseledande skalor.

100. Statistik får inte vara beroende endast av färg.

101. Diagram ska vara tillgängliga.

102. Viktiga diagram ska ha textsammanfattning.

103. Interaktiva diagram ska ha begriplig grundvy.

104. Periodjämförelser ska visa kontextskillnader.

105. Före- och efterpresentation ska vara valbar och jämförbar.

106. GainPilot ska kunna visa framsteg utan siffror.

107. Milstolpar ska kunna vara process-, prestations- eller teknikbaserade.

108. Automatiska milstolpar ska kräva tillförlitlig data.

109. Firande ska vara proportionerligt och valbart.

110. Manipulativ gamification ska förbjudas.

111. Arnold ska använda neutralt språk kring självbild och kropp.

112. Platå ska kräva kvalificerat underlag.

113. GainPilot ska skilja mellan olika typer av platå.

114. Platåanalys ska omfatta plan, följsamhet och återhämtning.

115. Platåförslag ska vara proportionerliga.

116. Tillbakagång ska sättas i kontext.

117. Underhåll ska kunna vara ett positivt mål.

118. Återstart efter paus ska inte beskrivas som katastrof.

119. Prognoser ska använda intervall och antaganden.

120. GainPilot ska inte garantera resultat.

121. Systemet ska kunna visa flera scenarier.

122. Förväntningsintervall ska uttrycka individuell osäkerhet.

123. Benchmarks ska vara valbara.

124. Personlig jämförelse ska prioriteras framför population.

125. Social prestationsranking ska vara avstängd som standard.

126. Anonyma benchmarks ska beskriva population och begränsningar.

127. Benchmarkmodeller ska granskas för snedvridning.

128. Demografi ska endast användas när det är relevant och tillåtet.

129. Analysmodeller ska rättvisegranskas.

130. Användaren ska kunna skapa egna mått.

131. Användaren ska kunna prioritera vilka framsteg som visas.

132. Interna driftmått ska hållas separata från prestationsmått.

133. Sammanfattande poäng ska vara förklarbar och sekundär.

134. GainPilot ska inte skapa ogenomskinlig global hälsopoäng.

135. Arnold ska kunna skapa vecko-, månads- och blocksammanfattningar.

136. Sammanfattningar ska prioritera viktig information.

137. Statistikrekommendationer ska kopplas till mål och datakvalitet.

138. Att inte ändra något ska vara ett giltigt beslut.

139. Rekommendationer ska ha styrkenivå.

140. Användaren ska kunna få kort och detaljerad förklaring.

141. Större beslut ska kunna ha alternativ.

142. Användaren ska kunna godkänna, avvisa eller skjuta upp.

143. Godkända analyser ska routas till rätt domänåtgärd.

144. Analysmotorn ska inte skriva direkt till andra domäner.

145. Automatiska lågriskåtgärder ska vara synliga och återställningsbara.

146. Högriskåtgärder ska kräva starkare approval.

147. Progressionsnotiser ska vara begränsade och relevanta.

148. GainPilot ska inte skicka skuldbeläggande negativa notiser.

149. Anomalier ska kunna upptäckas utan medicinsk diagnos.

150. Säkerhetssignaler ska kunna stoppa vanlig optimering.

151. Professionell hänvisning ska användas utanför GainPilots scope.

152. Progressionsanalys ska följa dataminimering.

153. Känsliga mått ska ha granular synlighet.

154. Dashboarden ska kunna döljas i privata situationer.

155. Delning av framsteg ska vara explicit och granulär.

156. Tränare ska endast se godkända mått.

157. Professionell export ska beskriva osäkerhet.

158. Social delning ska vara avstängd som standard.

159. Användaren ska kunna exportera statistik.

160. Användaren ska kunna radera statistik och bilder.

161. Raderad data ska inte fortsätta påverka analysen.

162. Datatyper ska ha separata retentionregler.

163. Privat analysläge ska kunna användas.

164. Arnold ska vara primärt statistikgränssnitt.

165. Atlas ska bidra med långsiktig analys utan obegränsad åtkomst.

166. Hermes ska kontrollera varje domänkombination.

167. Sessionsanalyser ska använda minimerad kontext.

168. Analyspaket ska vara tillfälliga och auditerbara.

169. Varje analysmodell ska ha identitet och version.

170. GainPilot ska ha ett modellregister.

171. Modelluppdateringar ska kunna jämföras parallellt.

172. Backtesting ska användas.

173. Simulering ska användas före bred aktivering.

174. Nya modeller ska kunna köras i shadow mode.

175. Canary-utrullning ska kunna användas.

176. Modellens drift ska övervakas.

177. Modellens säkerhet ska kalibreras.

178. Falska positiva och negativa signaler ska mätas.

179. Användaren ska kunna korrigera analysen.

180. Förklaringar ska grunda sig i verklig beslutskedja.

181. Arnold får inte hitta på efterhandsförklaringar.

182. Analys ska vara observerbar och auditerbar.

183. Analysincidenter ska ha definierad incidentprocess.

184. GainPilot ska kunna genomföra modell- och analysrollback.

185. Plattformsanalys ska använda minimerad data.

186. Statistiksystemet ska optimeras för bättre beslut, inte fler diagram.

187. Progressionssystemet ska testas i alla centrala tränings- och kostdomäner.

188. Tillgänglighet och begriplighet ska testas.

189. Förändringar av analysmodeller ska ske på separat branch.

190. Alla förändringar ska genomgå tester, validering, pull request och kontrollerad utrullning.

191. Agentautonomi inom progressions- och statistikdomänen ska vara explicit, begränsad och återkallelig.

192. GainPilot ska använda statistik för att hjälpa användaren förstå sin utveckling, inte för att definiera användarens värde.

17.220 IMPLEMENTERINGSORDNING

GainPilots progression, statistik och återkoppling ska implementeras stegvis.

Fas 1 — Canonical måttmodell

Implementera:

- måttidentitet,

- domän,

- värde,

- enhet,

- källa,

- tidpunkt,

- datakvalitet,

- och version.

Fas 2 — Grundläggande träningshistorik

Implementera:

- belastning,

- repetitioner,

- set,

- personbästa,

- och jämförelse mellan likvärdiga pass.

Fas 3 — Enkel progressionsöversikt

Implementera:

- aktuellt mål,

- senaste resultat,

- trend,

- följsamhet till kärnplan,

- och nästa utvärdering.

Fas 4 — Övningsstatistik

Implementera:

- övningsvariant,

- repetitionshistorik,

- belastning,

- e1RM,

- personbästa,

- och datakvalitet.

Fas 5 — Veckosammanfattning

Implementera:

- kärnpass,

- kortversioner,

- personbästa,

- anpassningar,

- och nästa veckas fokus.

Fas 6 — Programblock

Implementera:

- baslinje,

- mål,

- blockutfall,

- volym,

- prestation,

- och blockrekommendation.

Fas 7 — Kroppsvikt och kroppsmått

Implementera:

- manuell registrering,

- källa,

- rullande trend,

- mått,

- outlierkontroll,

- och privat visning.

Fas 8 — Konditionsstatistik

Implementera:

- distans,

- tid,

- tempo,

- puls,

- effekt,

- miljö,

- och jämförbarhet.

Fas 9 — Följsamhetsmodell

Implementera:

- kärnplan,

- full plan,

- kortversion,

- reservpass,

- paus,

- och miniminivå.

Fas 10 — Kost- och måltidsöversikt

Implementera:

- måltidsstruktur,

- kontrollerade byten,

- reservmåltider,

- vikttrend,

- och användarfeedback.

Fas 11 — Feedbacksystem

Implementera:

- passfeedback,

- veckofeedback,

- blockfeedback,

- klassificering,

- och återkopplingshistorik.

Fas 12 — Diagram och tillgänglighet

Implementera:

- tydliga diagram,

- textalternativ,

- skärmläsarstöd,

- färgoberoende status,

- och användarvalda mått.

Fas 13 — Progressionsbilder

Implementera först efter särskild integritetsgranskning:

- privat lagring,

- standardiseringsstöd,

- jämförelse,

- export,

- och radering.

Fas 14 — CrossFit-statistik

Implementera:

- workoutidentitet,

- RX och scaled,

- time cap,

- rundor,

- standard,

- och benchmarkhistorik.

Fas 15 — Calisthenics-statistik

Implementera:

- skillstatus,

- progression,

- assistans,

- hålltid,

- kvalitet,

- och lyckade försök.

Fas 16 — Återhämtning

Implementera:

- självskattning,

- wearablekälla,

- personlig baslinje,

- trend,

- och osäkerhetsmarkering.

Fas 17 — Platåanalys

Implementera:

- kvalificeringsperiod,

- datakvalitet,

- följsamhet,

- planeringsproblem,

- återhämtning,

- och proportionerliga alternativ.

Fas 18 — Rekommendationsmotor

Implementera:

- observation,

- förslag,

- rekommendationsstyrka,

- förklaring,

- alternativ,

- approval,

- och routing till rätt domän.

Fas 19 — Modellregister

Implementera:

- modellidentitet,

- version,

- syfte,

- indata,

- begränsningar,

- teststatus,

- och aktivt scope.

Fas 20 — Shadow mode och canary

Implementera:

- parallell modellkörning,

- backtesting,

- jämförelse,

- begränsad utrullning,

- och automatisk stoppsignal.

Fas 21 — Atlas och tvärdomänanalys

Implementera genom Hermes:

- minimerade analyspaket,

- tillåtna korrelationer,

- långsiktiga mönster,

- och explicit osäkerhet.

Fas 22 — Fördjupade prognoser

Implementera först efter modellvalidering:

- scenarier,

- intervall,

- antaganden,

- och förbud mot garantier.

Fas 23 — Professionell delning

Implementera:

- tränarvy,

- professionell export,

- tidsbegränsad åtkomst,

- och käll- samt osäkerhetsinformation.

Fas 24 — Full analysgovernance

Implementera:

- modellrevision,

- rättvisegranskning,

- driftövervakning,

- incidenthantering,

- rollback,

- och audit.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- statistisk validering,

- integritetsgranskning,

- säkerhetsgranskning,

- rättvisegranskning där relevant,

- tillgänglighetsgranskning,

- pull request,

- kontrollerad merge,

- begränsad utrullning,

- och resultatuppföljning.

17.221 FRAMGÅNGSKRITERIER

Kapitel 17:s vision är framgångsrikt realiserad när:

- användaren förstår hur den aktuella planen utvecklas,

- progression visas inom flera relevanta domäner,

- statistik inte reduceras till en global poäng,

- direkta och beräknade värden hålls åtskilda,

- varje viktig datapunkt har källa,

- osäkerhet och datakvalitet visas,

- trender baseras på relevanta tidsfönster,

- enskilda avvikelser inte skapar överreaktion,

- jämförelser använder rätt övningsvariant och standard,

- e1RM inte blandas ihop med verifierat max,

- personbästa verifieras,

- kroppsvikt visas som trend i stället för moralisk bedömning,

- kroppsmått och bilder är privata och valbara,

- konditionsresultat bevarar miljö och sensorkälla,

- CrossFit-statistik bevarar scaling och workoutstandard,

- calisthenicsprogression visar assistans, kvalitet och färdighetsnivå,

- reservpass och kortversioner kan räknas som lyckad anpassning,

- uppnådd miniminivå synliggörs,

- följsamhet inte moraliseras,

- planeringsproblem kan identifieras,

- återgång efter paus uppmärksammas,

- användarens egen upplevelse väger tungt,

- feedback samlas i rätt omfattning,

- större förändringar har hypotes och uppföljning,

- samband inte presenteras som säker orsak,

- platåer identifieras först efter tillräckligt underlag,

- underhållsperioder inte presenteras som misslyckanden,

- prognoser visas som scenarier och intervall,

- användaren i första hand jämförs med sin egen utveckling,

- benchmarks är valbara,

- diagram är tydliga och tillgängliga,

- statistik kan förstås utan att användaren är expert,

- kvalitativa framsteg kan dokumenteras,

- milstolpar är meningsfulla,

- gamification inte används manipulativt,

- Arnold kan skapa korta och korrekta sammanfattningar,

- rekommendationer kan förklaras,

- det ibland rekommenderas att planen inte förändras,

- användaren kan godkänna eller avvisa analysens förslag,

- statistikmotorn inte skriver direkt till andra domäner,

- känsliga mått har granulär synlighet,

- användaren kan exportera och radera sin data,

- analysmodeller är versionshanterade,

- nya modeller kan köras i shadow mode,

- modeller kan återställas,

- Atlas bidrar utan obegränsad datakombination,

- Hermes minimerar analyskontexten,

- och alla förbättringar genomförs genom separat branch, tester, validering, pull request och kontrollerad utrullning.

17.222 SAMMANFATTNING

GainPilots progressions- och statistiksystem ska göra användarens utveckling begriplig.

Systemet ska inte endast visa:

- hur mycket användaren lyfte,

- hur många pass som genomfördes,

- hur kroppsvikten förändrades,

- eller hur många kalorier som registrerades.

Det ska hjälpa användaren förstå:

- om riktningen är rätt,

- om planen fungerar,

- vilka framsteg som faktiskt är meningsfulla,

- vad som fortfarande är osäkert,

- och om någonting behöver förändras.

Progression ska vara flerdimensionell.

Den kan innebära:

- högre belastning,

- fler repetitioner,

- bättre teknik,

- stabilare prestation,

- större arbetskapacitet,

- mindre assistans,

- längre hålltid,

- bättre genomförbarhet,

- fungerande måltidsstruktur,

- eller starkare kontinuitet.

GainPilot ska skilja mellan:

- mätvärde,

- beräknat värde,

- trend,

- tolkning,

- och rekommendation.

Ett enskilt resultat ska inte automatiskt bli en trend.

En trend ska inte automatiskt bli en säker förklaring.

En förklaring ska inte automatiskt ge analysmotorn rätt att ändra användarens plan.

Varje viktigt mått ska ha:

- källa,

- tidpunkt,

- enhet,

- datakvalitet,

- och modellversion.

Systemet ska kunna säga:

Vi har tillräcklig data för en tydlig trend.

Det ska också kunna säga:

Underlaget är för osäkert för att förändra planen.

GainPilot ska prioritera användarens egen utveckling framför jämförelse med andra.

Benchmarks får ge kontext.

De får inte definiera användarens värde eller användas för skam.

Kroppsvikt, kroppsmått och progressionsbilder ska vara:

- valbara,

- privata,

- och neutralt presenterade.

Dagliga variationer ska inte förstoras.

Bilder ska inte analyseras som exakt kroppsfett eller användas utan uttryckligt mandat.

Följsamhet ska bedömas i relation till planens verkliga prioriteringar.

Tre genomförda kärnpass och ett uteblivet valbart pass ska inte beskrivas som ett misslyckande.

Ett kortpass kan vara en lyckad anpassning.

En reservmåltid kan vara ett fungerande val.

En planerad paus kan vara en del av programmet.

En återgång efter ett avbrott kan vara ett viktigt framsteg.

GainPilot ska identifiera platåer försiktigt.

Systemet ska först kontrollera:

- om datan är jämförbar,

- om tillräcklig tid har gått,

- om planen har följts,

- om användaren återhämtar sig,

- och om målet faktiskt kräver fortsatt ökning.

Ibland är rätt beslut:

- ändra progression,

- förenkla planen,

- eller skapa ett nytt block.

Ibland är rätt beslut att inte ändra något alls.

Arnold ska sammanfatta statistik på ett sätt som användaren förstår.

Han ska kunna säga:

Din styrketrend är fortsatt positiv. Bänkpressen har förbättrats i tre jämförbara pass, medan övriga huvudövningar är stabila. Vardagsupplägget fungerar bättre efter att passen kortades. Jag rekommenderar att vi behåller strukturen ytterligare två veckor.

Han ska också kunna säga:

Dagens sämre resultat är en enstaka avvikelse. Det finns inte tillräckligt underlag för att ändra programmet.

Atlas ska hjälpa med:

- längre tidsserier,

- kontrollerade tvärdomänsanalyser,

- modellkvalitet,

- research,

- och produktförbättring.

Atlas får inte kombinera:

- träningsdata,

- kostdata,

- kalender,

- kroppsmått,

- och andra privata domäner

utan ett definierat och användargodkänt syfte.

Hermes ska skapa minimerade analyspaket som endast innehåller den kontext som behövs.

Analysmodeller ska vara:

- identifierade,

- versionerade,

- testade,

- kalibrerade,

- förklarbara,

- och möjliga att återställa.

Nya modeller ska kunna köras i shadow mode innan de påverkar användaren.

De ska kunna testas genom:

- backtesting,

- simulering,

- canary-utrullning,

- och verklig resultatuppföljning.

Ingen språkmodell får skapa en övertygande förklaring som inte motsvarar den faktiska analysen.

Ingen statistikmotor får direkt skriva om:

- program,

- kostmål,

- säkerhetsregler,

- eller användarminnen

utan respektive domäns godkända process.

Alla förändringar av:

- progressionsmodell,

- trendalgoritm,

- diagram,

- prognos,

- rekommendationsmotor,

- och tvärdomänanalys

ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- statistisk validering,

- integritetsgranskning,

- säkerhetsgranskning,

- rättvisegranskning,

- tillgänglighetsgranskning,

- pull request,

- kontrollerad merge,

- begränsad utrullning,

- och uppföljning.

Kapitel 17 etablerar därmed följande kärnprincip:

GainPilot ska inte mäta användaren för mätandets skull. Plattformen ska använda relevant, spårbar och ärligt tolkad data för att visa verkliga framsteg, upptäcka när planen behöver stöd och hjälpa användaren fatta bättre beslut — utan falsk precision, manipulativ jämförelse eller krav på att varje del av människans utveckling måste reduceras till ett tal.
