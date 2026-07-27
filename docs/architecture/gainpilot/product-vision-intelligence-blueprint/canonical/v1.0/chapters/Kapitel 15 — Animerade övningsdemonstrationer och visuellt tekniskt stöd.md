# Kapitel 15 — Animerade övningsdemonstrationer och visuellt tekniskt stöd

GainPilots visuella övningssystem ska hjälpa användaren förstå hur en rörelse ska genomföras innan och under träningen.

Systemet ska kunna visa:

- startposition,

- rörelsebana,

- slutposition,

- relevanta ledpositioner,

- utrustningsplacering,

- tempo,

- andning när det är pedagogiskt motiverat,

- primära teknikpunkter,

- vanliga fel,

- progressioner,

- regressioner,

- och viktiga skillnader mellan övningsvarianter.

Det visuella stödet ska inte reduceras till dekorativa animationer.

En visuellt imponerande demonstration som visar fel teknik är sämre än en enkel men korrekt demonstration.

GainPilots övningsmedia ska därför byggas utifrån fyra likvärdigt viktiga mål:

1. Teknisk korrekthet.

2. Pedagogisk tydlighet.

3. Visuell konsekvens.

4. Praktisk användbarhet under ett aktivt träningspass.

Demonstrationerna ska fungera för:

- nybörjare som aldrig har sett övningen,

- vana användare som behöver en snabb påminnelse,

- användare som jämför varianter,

- användare som behöver regression eller progression,

- användare med tillgänglighetsbehov,

- och användare som tränar utan stabil internetanslutning.

GainPilot ska använda en hybridmodell för sitt mediebibliotek.

Den kan kombinera:

- licensierade övningsbibliotek,

- egenproducerad 3D-animation,

- motion capture,

- handanimerade korrigeringar,

- realtidsrenderade modeller,

- förhandsrenderade videor,

- och begränsad AI-baserad efterbearbetning.

AI ska främst användas för att:

- effektivisera produktion,

- skapa visuella variationer,

- förbättra lokalisering,

- anpassa bakgrunder,

- skapa undertexter,

- och stödja kvalitetskontroll.

AI får inte ensam avgöra den canonical rörelsen.

Människokroppens rörelse, utrustningens position och repetitionens standard ska kvalitetssäkras genom en definierad granskningsprocess.

Arnold ska använda det visuella stödet för att ge rätt mängd information i rätt situation.

Atlas ska kunna hjälpa GainPilot identifiera:

- saknade demonstrationer,

- nya medieleverantörer,

- licensrisker,

- återkommande användarproblem,

- och behov av uppdaterad teknisk granskning.

Hermes ska kontrollera åtkomst till användarspecifik video, bilder och annan privat media.

Grundprincipen är:

GainPilots övningsdemonstrationer ska vara visuellt levande och moderna, men rörelsens tydlighet, tekniska korrekthet och användarens säkerhet ska alltid väga tyngre än den visuella effekten.

15.1 DET VISUELLA SYSTEMETS SYFTE

Övningsmedia ska lösa ett konkret användarbehov.

Systemet ska kunna hjälpa användaren att:

- känna igen rätt övning,

- förstå hur rörelsen börjar,

- förstå vart kroppen eller redskapet ska röra sig,

- skilja övningen från närliggande varianter,

- komma ihåg ett begränsat antal teknikpunkter,

- och genomföra nästa set med större trygghet.

Media ska inte försöka ersätta:

- praktisk erfarenhet,

- mänsklig tränare,

- professionell rehabilitering,

- eller individuell medicinsk bedömning.

Systemet ska vara ett pedagogiskt hjälpmedel.

Det ska inte framställas som en garanti för perfekt teknik.

15.2 CANONICAL MEDIAARKITEKTUR

GainPilot ska ha en canonical mediaarkitektur.

Den ska minst kunna representera:

- media_identity,

- canonical_exercise_identity,

- exercise_variant_identity,

- media_type,

- instructional_purpose,

- camera_angle,

- movement_phase,

- model_identity,

- equipment_identity,

- environment_identity,

- language,

- accessibility_variant,

- source,

- license,

- production_method,

- technical_review_status,

- editorial_review_status,

- publication_status,

- version,

- checksum,

- file_or_asset_reference,

- and retention_status.

Exakta tekniska fältnamn definieras senare.

Principen är att varje publicerad demonstration ska vara:

- spårbar,

- versionshanterad,

- licensierad,

- granskningsbar,

- och kopplad till rätt canonical övningsvariant.

15.3 MEDIAIDENTITET

Varje medieresurs ska ha en stabil identitet.

Identiteten ska vara separerad från:

- filnamn,

- URL,

- språk,

- aktuell lagringsleverantör,

- och visningsrubrik.

Exempel:

Mediaidentitet:

gp-media-bench-press-main-side-v1

Canonical övning:

barbell-bench-press

Syfte:

Huvuddemonstration.

Vinkel:

Sida.

Version:

1.

Om filen flyttas eller kodas om ska mediaidentiteten kunna bevaras när innehållet i sak är samma version.

15.4 KOPPLING TILL CANONICAL ÖVNING

Alla övningsdemonstrationer ska kopplas till canonical övningsidentitet.

Kopplingen får inte endast bygga på:

- filnamn,

- textetikett,

- sökord,

- eller katalogplacering.

Systemet ska veta exakt vilken variant demonstrationen gäller.

Exempel:

Följande ska kunna ha separata demonstrationer:

- vanlig bänkpress,

- pausad bänkpress,

- smal bänkpress,

- lutande bänkpress,

- och bänkpress med tempo.

Användaren får inte visas en närliggande men felaktig variant utan tydlig information.

15.5 MEDIATYPER

GainPilot ska stödja flera mediatyper.

Exempel:

- loopad 3D-animation,

- förhandsrenderad video,

- realtidsrenderad 3D-modell,

- motion capture-animation,

- filmad mänsklig demonstration,

- illustrerad stegsekvens,

- stillbild,

- interaktiv rörelsemodell,

- teknikjämförelse,

- felvisualisering,

- och ljudbeskrivning.

Olika mediatyper kan fylla olika syften.

Det ska inte finnas ett krav på att en enda mediatyp måste användas för alla övningar.

15.6 INSTRUKTIONSSYFTE

Varje medieresurs ska ha ett definierat instruktionellt syfte.

Exempel:

- identifiera övningen,

- visa full repetition,

- visa startposition,

- visa rörelsebana,

- visa tempo,

- visa vanligt fel,

- visa regression,

- visa progression,

- jämföra varianter,

- eller stödja tillgänglighet.

En animation som skapats för snabb identifiering behöver inte innehålla samma detaljnivå som en teknisk genomgång.

15.7 HUVUDDEMONSTRATION

Varje prioriterad övning ska ha en huvuddemonstration.

Huvuddemonstrationen ska normalt visa:

- full kropp eller relevant kroppsdel,

- hela utrustningen,

- stabil kameravinkel,

- minst en fullständig repetition,

- tydlig start- och slutposition,

- och en naturligt loopbar rörelse.

Huvuddemonstrationen ska fungera som snabb visuell referens i:

- övningsbiblioteket,

- programvyn,

- och det aktiva träningspasset.

15.8 FÖRDJUPAD TEKNIKDEMONSTRATION

Vissa övningar ska även ha en fördjupad demonstration.

Den kan visa:

- flera kameravinklar,

- rörelsens faser,

- teknikpunkter,

- redskapets bana,

- tempo,

- andning,

- vanliga fel,

- och skillnader mellan varianter.

Den fördjupade demonstrationen ska kunna öppnas när användaren behöver mer hjälp.

Den ska inte automatiskt spelas upp i sin helhet mellan varje set.

15.9 STARTPOSITION

Startpositionen ska visas tydligt.

Det kan omfatta:

- fotplacering,

- grepp,

- kroppens position,

- redskapets placering,

- säkerhetsutrustning,

- och var rörelsen börjar.

GainPilot ska undvika att visa en överdrivet stiliserad startposition som är svår att återskapa i verkligheten.

Vid övningar där flera rimliga startpositioner finns ska systemet beskriva att variation kan förekomma.

15.10 RÖRELSEBANA

Demonstrationen ska tydligt visa rörelsebanan.

Rörelsebanan kan visualiseras genom:

- modellens rörelse,

- diskret bana för redskap,

- markering av riktning,

- eller fasindelning.

Grafiska hjälpmedel ska användas sparsamt.

De får inte göra rörelsen svårare att se.

15.11 SLUTPOSITION

Slutpositionen ska vara tydligt definierad när övningen har en sådan.

Exempel:

- full armbågssträckning enligt aktuell standard,

- stabil toppläge,

- korrekt mottagningsposition,

- eller avslutad hålltid.

Systemet ska skilja mellan:

- allmän träningsstandard,

- tävlingsstandard,

- och användarspecifik professionell begränsning.

15.12 RÖRELSENS FASER

GainPilot ska kunna dela upp rörelsen i faser.

Exempel:

1. Förberedelse.

2. Excentrisk fas.

3. Vändpunkt.

4. Koncentrisk fas.

5. Stabilisering.

6. Återgång.

Fasindelningen ska användas när den förbättrar förståelsen.

En enkel övning behöver inte alltid få en komplicerad biomekanisk uppdelning.

15.13 TEMPO

Demonstrationen ska kunna visa relevant tempo.

Det kan ske genom:

- faktisk animationshastighet,

- tidsmarkering,

- visuell räknare,

- eller text.

Om programmet anger ett särskilt tempo ska demonstrationen kunna anpassas eller kompletteras.

En standardanimation får inte ge intryck av att exakt tempo alltid är obligatoriskt.

15.14 PAUSPOSITIONER

Pausövningar ska tydligt visa:

- var pausen sker,

- hur länge den ungefär varar,

- och vilken kroppskontroll som bevaras.

Exempel:

Pausad bänkpress ska inte visas som en vanlig repetition där stången endast rör sig långsamt vid bröstet.

Pausen ska vara visuellt tydlig.

15.15 ANDNING OCH BÅLTRYCK

GainPilot kan ge generell information om:

- andning,

- bålstabilitet,

- och anspänning

när det är relevant.

Systemet ska vara försiktigt med:

- extrema andningsinstruktioner,

- medicinska tillstånd,

- och användare som rapporterar yrsel eller andra symptom.

Andningsinstruktioner ska inte framställas som universella när övning, belastning och individ påverkar utförandet.

15.16 KAMERAVINKLAR

GainPilot ska kunna stödja flera kameravinklar.

Exempel:

- sida,

- framifrån,

- bakifrån,

- snett framifrån,

- snett bakifrån,

- uppifrån,

- eller detaljvinkel.

Vinkeln ska väljas utifrån vad som behöver visas.

En enda vinkel räcker inte alltid för att förstå:

- fotplacering,

- stångbana,

- ryggradens position,

- eller rörelsebredd.

15.17 HUVUDVINKEL

Varje övning ska ha en rekommenderad huvudvinkel.

Huvudvinkeln ska:

- visa den viktigaste rörelsen,

- minimera visuella hinder,

- och fungera i liten mobilvy.

Exempel:

Sida kan vara huvudvinkel för många press- och höftdominanta rörelser.

Snett framifrån kan vara bättre när både bredd och djup behöver synas.

15.18 VÄXLING MELLAN VINKLAR

Användaren ska kunna växla vinkel utan att lämna övningsvyn.

Vinkelväxlingen ska:

- bevara samma variant,

- bevara samma repetitionsfas,

- och tydligt visa vilken vinkel som används.

GainPilot får inte växla till media från en annan övningsversion enbart för att önskad vinkel saknas.

15.19 SYNKRONISERADE VINKLAR

Flera kameravinklar kan synkroniseras så att användaren ser samma rörelsefas.

Detta kan vara särskilt värdefullt för:

- olympiska lyft,

- komplexa calisthenicsfärdigheter,

- och teknisk analys.

Synkronisering ska inte krävas för alla övningar i första versionen.

15.20 ZOOM OCH DETALJVY

Användaren ska kunna zooma in på relevanta områden.

Exempel:

- grepp,

- fotposition,

- knälinje,

- skulderposition,

- eller utrustningsinställning.

Detaljvyn ska vara separat från huvuddemonstrationen när zoomen annars döljer hela rörelsen.

15.21 MODELLENS UTFORMNING

GainPilots visuella modell ska vara:

- anatomiskt begriplig,

- konsekvent,

- neutral nog för bred användning,

- och tydlig mot bakgrunden.

Modellen ska inte behöva vara fotorealistisk.

Ett lätt stiliserat 3D-utförande kan förbättra:

- tydlighet,

- varumärkesidentitet,

- återanvändning,

- och teknisk kontroll.

Stiliseringen får inte förvränga:

- proportioner,

- ledpositioner,

- grepp,

- eller utrustningskontakt.

15.22 KROPPSPROPORTIONER

En enda avatarmodell representerar inte alla kroppar.

GainPilot ska vara tydligt med att:

- kroppsproportioner varierar,

- rörelsebanor kan se något olika ut,

- fotbredd och grepp kan behöva anpassas,

- och en visuell standard inte är en exakt mall för varje individ.

På sikt kan systemet stödja flera proportionstyper.

Detta får inte ge intryck av att användarens kropp måste se ut eller röra sig exakt som modellen.

15.23 KROPPSMÅNGFALD

GainPilot ska över tid kunna erbjuda variation i:

- kroppslängd,

- kroppsbyggnad,

- hudton,

- könsuttryck,

- och fysisk presentation.

Mångfalden ska implementeras utan att skapa olika tekniska standarder baserade på utseende.

Canonical rörelselogik ska vara gemensam där övningen är densamma.

15.24 KLÄDER

Modellens kläder ska:

- göra ledpositioner synliga,

- inte skymma rörelsen,

- fungera med muskelmarkeringar,

- och passa GainPilots visuella identitet.

Kläderna får inte sexualisera modellen eller distrahera från instruktionen.

15.25 ANSIKTE OCH PERSONLIGHET

Huvudsyftet är rörelsen.

Avataren behöver inte ha ett starkt individuellt ansiktsuttryck.

Ett neutralt eller stiliserat ansikte kan:

- minska distraktion,

- förenkla produktion,

- och göra modellen mer tidlös.

Arnolds personlighet ska främst uttryckas genom:

- språk,

- röst,

- gränssnitt,

- och coachning

snarare än genom att varje övningsavatar ska föreställa Arnold.

15.26 ARNOLD SOM VISUELL COACH

Arnold kan finnas i eller kring demonstrationerna genom:

- korta textkommentarer,

- röst,

- markerade teknikpunkter,

- eller en diskret visuell coachindikator.

Arnold ska inte täcka viktiga delar av rörelsen.

Han behöver inte visas som fysisk tränare bredvid avataren i varje demonstration.

15.27 MILJÖDESIGN

GainPilots övningsmiljö ska kunna vara mörk, modern och levande.

Den kan använda:

- dämpad gymmiljö,

- mjuka ljuskällor,

- diskreta djupdetaljer,

- och subtila rörelseelement.

Miljön ska inte vara helt tom om det gör produkten steril.

Den får inte heller bli så detaljerad att:

- kroppen försvinner,

- utrustningen blir svår att se,

- eller rörelsen konkurrerar med bakgrunden.

15.28 KONTRAST

Modell, utrustning, markeringar och bakgrund ska ha tillräcklig kontrast.

Kontrasten ska testas på:

- mobil,

- surfplatta,

- webb,

- mörk skärm,

- ljus omgivning,

- och olika synförutsättningar.

Mörkt visuellt tema får inte innebära att svarta vikter och redskap försvinner i bakgrunden.

15.29 LJUSSÄTTNING

Ljussättningen ska:

- tydliggöra kroppens form,

- göra ledpositioner synliga,

- separera modellen från bakgrunden,

- och undvika vilseledande skuggor.

Dramatiskt ljus får inte dölja teknik.

15.30 BAKGRUNDSRÖRELSE

Subtil bakgrundsrörelse kan skapa ett levande uttryck.

Den ska kunna stängas av genom:

- minskad rörelse-inställning,

- energisparläge,

- eller användarval.

Bakgrundsrörelsen får inte konkurrera med övningens rörelse.

15.31 SÖMLÖS LOOP

Huvudanimationer ska kunna loopas sömlöst där det passar.

Loopen ska:

- inte hoppa visuellt,

- inte kapa startpositionen,

- och inte skapa en onaturlig paus.

För övningar där en automatisk loop blir missvisande ska systemet använda:

- tydlig återställning,

- eller separat start och slut.

15.32 LOOPHASTIGHET

Användaren ska kunna välja:

- normal hastighet,

- långsam uppspelning,

- och eventuellt bild-för-bild.

Långsam uppspelning ska inte bara sänka bildhastigheten om det skapar hackig eller felaktig rörelse.

15.33 AUTOMATISK UPPSPELNING

Automatisk uppspelning ska vara försiktig.

I övningsbiblioteket kan korta loopar spelas automatiskt om:

- användarinställningen tillåter det,

- datamängden är rimlig,

- och tillgänglighetsinställningar respekteras.

Under aktivt träningspass ska användaren kunna välja om media spelas automatiskt.

15.34 MINSKAD RÖRELSE

Användare som väljer minskad rörelse ska kunna få:

- stillbilder,

- stegsekvens,

- långsammare övergång,

- eller endast text.

Funktionen ska påverka både:

- övningsanimation,

- och bakgrundseffekter.

15.35 MUSKELMARKERINGAR

GainPilot ska kunna visa pedagogiska muskelmarkeringar.

Markeringarna kan skilja mellan:

- primär belastning,

- sekundär belastning,

- och stabiliserande funktion.

Systemet ska tydligt förklara att markeringarna är förenklade representationer.

De ska inte ge intryck av att:

- endast markerade muskler arbetar,

- exakt belastningsfördelning är känd,

- eller alla individer belastar identiskt.

15.36 DYNAMISKA MUSKELMARKERINGAR

Muskelmarkeringar kan förändras under rörelsen.

Exempel:

- aktivering markeras tydligare under en viss fas,

- eller stabiliserande muskler visas separat.

Dynamisk markering ska endast användas när det finns tillräckligt underlag.

Den får inte presenteras som realtidsmätning av muskelaktivitet.

15.37 FÄRG OCH MUSKELMARKERING

Muskelmarkering får inte vara beroende endast av färg.

Systemet ska även kunna använda:

- kontur,

- mönster,

- etikett,

- eller separat text.

Detta är viktigt för användare med nedsatt färgseende.

15.38 RÖRELSEMARKÖRER

GainPilot kan använda diskreta markörer för:

- stångbana,

- tyngdpunkt,

- ledvinkel,

- fotposition,

- eller rörelseriktning.

Markörerna ska vara pedagogiska.

De ska inte ge falsk vetenskaplig precision när rörelsen varierar naturligt mellan individer.

15.39 LEDVINKLAR

Exakta ledvinklar ska endast visas när:

- de är relevanta,

- källan är tillförlitlig,

- och variationen förklaras.

Systemet ska undvika universella budskap som:

Knät måste alltid vara exakt 90 grader.

Instruktion ska beskriva syftet snarare än skapa onödigt rigida regler.

15.40 REDSKAPSBANA

För övningar med:

- skivstång,

- hantel,

- kettlebell,

- kabel,

- eller annat redskap

kan GainPilot visa redskapets bana.

Banan ska vara variant- och vinkelkorrekt.

Den ska inte kopieras mellan olika övningar enbart för att de liknar varandra.

15.41 FOTPLACERING

Fötternas position kan visas genom:

- markering på golvet,

- kameravinkel,

- eller detaljbild.

GainPilot ska förklara när fotplaceringen kan variera utifrån:

- anatomi,

- komfort,

- mål,

- och professionell instruktion.

15.42 GREPP

Grepp ska kunna visas tydligt.

Det kan omfatta:

- greppbredd,

- handposition,

- tumgrepp,

- handledsposition,

- och redskapets placering.

Systemet ska skilja mellan:

- rekommenderad standard,

- tillåten variation,

- och särskild teknikstandard.

15.43 UTRUSTNINGSINSTÄLLNING

Maskinövningar ska kunna visa:

- säteshöjd,

- startläge,

- handtagsposition,

- säkerhetsspärr,

- och andra relevanta inställningar.

Eftersom maskiner varierar mellan tillverkare ska GainPilot vara försiktigt med modellunika instruktioner.

Leverantörsspecifika demonstrationer ska kopplas till rätt maskinidentitet när sådan information finns.

15.44 VIKTSÄKERHET

Demonstrationer för skivstångsövningar ska kunna visa:

- säkerhetsarmar,

- ställning,

- clips när de är relevanta,

- korrekt avlyft,

- och säker återplacering.

Media får inte normalisera osäkra uppställningar för att animationen ska bli enklare.

15.45 PASSARE

Vid övningar där passare kan vara relevant ska GainPilot kunna visa eller beskriva:

- när passare kan användas,

- hur denne placerar sig,

- och hur hjälpen sker.

Detta ska inte ge intryck av att en oerfaren passare automatiskt eliminerar risk.

15.46 VANLIGA FEL

GainPilot ska kunna visa vanliga fel.

Varje felvisualisering ska ha:

- felidentitet,

- berörd övning,

- relevant fas,

- kort förklaring,

- korrigerande fokus,

- källa,

- och granskningsstatus.

Systemet ska skilja mellan:

- tydligt fel enligt aktuell standard,

- möjlig individuell variation,

- och osäker eller omdebatterad teknikfråga.

15.47 FELDEMONSTRATIONENS UTFORMNING

Felaktig teknik ska inte visas utan tydlig märkning.

Användaren ska aldrig kunna misstolka felanimationen som huvuddemonstration.

Felvyn ska använda:

- tydlig rubrik,

- avvikande visuell ram,

- textförklaring,

- och jämförelse med önskat utförande.

15.48 JÄMFÖRELSE MELLAN RÄTT OCH FEL

GainPilot kan visa två utföranden:

- rekommenderat utförande,

- och vanligt problem.

Jämförelsen ska synkroniseras där möjligt.

Den ska fokusera på ett problem i taget.

För många samtidiga skillnader gör det svårt att förstå vad användaren ska ändra.

15.49 KORRIGERANDE INSTRUKTION

Varje fel ska kopplas till ett enkelt korrigerande fokus.

Exempel:

Problem:

Stången driver framåt under pressen.

Fokus:

Behåll stången närmare kroppen och avsluta stabilt över stödytan.

Korrigeringen ska inte överdrivas eller skapa ett nytt problem.

15.50 TEKNIKVARIATION ÄR INTE ALLTID FEL

GainPilot ska undvika att märka all variation som fel.

Skillnader kan bero på:

- kroppsproportioner,

- rörlighet,

- träningsmål,

- utrustning,

- vald variant,

- eller professionell anpassning.

Systemet ska vara särskilt försiktigt med generella instruktioner om:

- knäposition,

- ryggposition,

- djup,

- greppbredd,

- och fotvinkel.

15.51 PROGRESSIONER I MEDIA

GainPilot ska kunna visa hur en rörelse utvecklas stegvis.

Exempel:

Assisterad pull-up

→ excentrisk pull-up

→ strikt pull-up

→ viktad pull-up.

Progressionsmedia ska visa:

- förkunskapskrav,

- kvalitetskriterier,

- och när nästa steg kan vara lämpligt.

Systemet ska inte endast visa en visuellt svårare rörelse utan att beskriva övergången.

15.52 REGRESSIONER I MEDIA

Regressioner ska visas som fullvärdiga träningsalternativ.

De ska inte framställas som misslyckanden.

Media ska förklara:

- vilken del av huvudrörelsen som bevaras,

- vad som förenklas,

- och hur användaren kan utvecklas vidare.

15.53 CALISTHENICS-PROGRESSIONER

Calisthenics kräver ofta en graf av flera parallella utvecklingsspår.

GainPilot ska kunna visa progression inom:

- styrka,

- balans,

- rörlighet,

- kontroll,

- assistans,

- och teknik.

Exempel:

Handstående kan kräva separata visualiseringar för:

- väggposition,

- linje,

- kick-up,

- balansövning,

- handledsförberedelse,

- och fri hållning.

Systemet ska inte presentera en enda universell stege som passar alla.

15.54 CROSSFIT-SCALING

CrossFitmedia ska kunna visa:

- RX-rörelse,

- scaled variant,

- foundationsvariant,

- och viktiga standarder.

Scaling ska beskrivas utifrån workoutens syfte.

En lättare rörelse är inte alltid rätt scaling om den förändrar:

- tidsdomän,

- repetitionshastighet,

- eller rörelsens funktion.

15.55 KONDITIONSDEMONSTRATIONER

Konditionsaktiviteter kan behöva media för:

- löpteknik,

- roddmaskin,

- SkiErg,

- cykelinställning,

- assault bike,

- simning,

- och intervallstruktur.

Systemet ska vara försiktigt med att ge detaljerade teknikregler där:

- individ,

- hastighet,

- utrustning,

- och träningsform

påverkar utförandet.

15.56 RODDMASKIN

Roddmaskinsmedia ska kunna visa:

- catch,

- drive,

- finish,

- recovery,

- och sekvensen mellan ben, bål och armar.

Animationen ska inte visa en överdriven eller felaktig bålpendling.

Maskinens handtag, kedja och säte ska röra sig konsekvent.

15.57 LÖPNING

Löpningsmedia ska inte försöka etablera en enda perfekt löpstil.

Det kan visa:

- hållning,

- avslappnad armföring,

- rytm,

- och grundläggande säkerhet.

Systemet ska undvika att lova skadefrihet genom en särskild teknik.

15.58 CYKLING

Cykelmedia kan visa:

- grundläggande inställning,

- sadelhöjd som ungefärlig utgångspunkt,

- position,

- och användning av konditionscykel.

Individuell bike fit och medicinska problem ska hänvisas till relevant professionell hjälp.

15.59 RÖRLIGHETSÖVNINGAR

Rörlighetsmedia ska visa:

- startposition,

- kontrollerad rörelse,

- tillåtet rörelseomfång,

- och hur intensiv känslan bör vara på generell nivå.

GainPilot ska inte uppmuntra användaren att pressa genom skarp smärta.

15.60 FILMAD MÄNSKLIG DEMONSTRATION

Filmad mänsklig video kan ge:

- naturlig rörelse,

- verklig utrustning,

- och hög igenkänning.

Den kan samtidigt skapa:

- varierande ljus,

- inkonsekvent bakgrund,

- begränsade kameravinklar,

- modellrättigheter,

- och högre produktionsberoende.

GainPilot kan använda mänsklig video när den har:

- rätt teknik,

- rättigheter,

- kvalitet,

- och visuell passform.

15.61 3D-ANIMATION

3D-animation kan ge:

- konsekvent avatar,

- kontrollerad kameravinkel,

- muskelmarkeringar,

- återanvändbara miljöer,

- och enklare variantproduktion.

3D kräver samtidigt:

- korrekt rigg,

- bra retargeting,

- utrustningsinteraktion,

- teknisk granskning,

- och kvalitetskontroll av varje rörelse.

3D ska inte betraktas som automatiskt korrekt.

15.62 MOTION CAPTURE

Motion capture kan användas för att fånga verklig rörelse.

Produktionsprocessen ska minst omfatta:

- val av kvalificerad utövare,

- definierad teknikstandard,

- kalibrering,

- inspelning från relevanta vinklar,

- rengöring av data,

- retargeting,

- och teknisk slutgranskning.

Motion capture-data får inte publiceras direkt från inspelningen utan kontroll.

15.63 VAL AV UTÖVARE

Den person vars rörelse fångas ska:

- behärska övningen,

- förstå den avsedda standarden,

- och kunna upprepa rörelsen konsekvent.

En stark eller vältränad person är inte automatiskt rätt teknisk modell för varje övning.

15.64 RETARGETING

När motion capture överförs till en 3D-modell kan fel uppstå.

Exempel:

- fötter glider,

- händer tappar redskap,

- leder böjs onaturligt,

- kroppens tyngdpunkt förändras,

- och utrustning penetrerar modellen.

Varje retargetad rörelse ska granskas visuellt och tekniskt.

15.65 HANDANIMERING

Handanimering kan användas för:

- teknisk korrigering,

- maskininteraktion,

- långsamma pedagogiska sekvenser,

- och rörelser som är svåra att fånga.

Handanimering ska använda teknisk referens.

Animatören får inte ensam uppfinna biomekaniken.

15.66 REALTIDSRENDERAD 3D

Realtidsrendering kan göra det möjligt att:

- rotera kameran,

- byta avatar,

- zooma,

- visa muskelmarkeringar,

- och anpassa hastighet.

Tekniken kan samtidigt skapa krav på:

- enhetsprestanda,

- batteri,

- grafikstöd,

- och nedladdningsstorlek.

GainPilot ska ha fallback till förhandsrenderad media eller stillbilder.

15.67 FÖRHANDSRENDERAD VIDEO

Förhandsrenderad video kan ge:

- stabil kvalitet,

- enkel uppspelning,

- mindre enhetsberoende,

- och tydlig versionskontroll.

Den ger mindre interaktivitet.

GainPilot kan använda förhandsrenderad video som första produktionsformat även om en realtidsmotor planeras senare.

15.68 RIVE, LOTTIE OCH 2D-ANIMATION

Lättare animationsformat kan användas för:

- enkla rörelser,

- gränssnittsförklaringar,

- timers,

- och teknikmarkörer.

De passar inte automatiskt för biomekaniskt komplexa helkroppsövningar.

GainPilot ska välja format efter uppgiften.

15.69 AI-GENERERAD VIDEO

Generativ AI kan användas för att skapa eller bearbeta video.

Risker inkluderar:

- anatomiska förändringar mellan bildrutor,

- inkonsekvent utrustning,

- felaktiga grepp,

- varierande ledpositioner,

- och rörelser som inte kan genomföras fysiskt.

AI-genererad video får inte bli canonical huvuddemonstration utan fullständig teknisk granskning.

15.70 AI-BASERAD STYLING

AI kan användas säkrare för:

- bakgrund,

- ljussättning,

- texturer,

- färgvariation,

- upplösningsförbättring,

- och visuellt efterarbete

när rörelsedatan är låst och inte förändras.

Kvalitetskontrollen ska verifiera att stylingsteget inte har ändrat:

- kropp,

- utrustning,

- kontaktpunkter,

- eller rörelsebana.

15.71 AI-BASERAD LOKALISERING

AI kan stödja:

- översättning,

- undertexter,

- textetiketter,

- och röstlokalisering.

Medicinska, säkerhetskritiska och tekniska instruktioner ska granskas innan publicering.

Ett övningsnamn ska kopplas till canonical identitet och inte översättas fritt utan terminologikontroll.

15.72 SYNTHETISK RÖST

GainPilot kan använda syntetisk röst för instruktioner.

Rösten ska:

- vara tydlig,

- uttala övningsnamn korrekt,

- följa användarens språk,

- och inte överbelasta demonstrationen.

Användaren ska kunna stänga av rösten.

15.73 LJUDINSTRUKTION

Ljudinstruktion ska vara kort i aktiva pass.

Exempel:

Stabil startposition.

Sänk kontrollerat.

Pressa jämnt tillbaka.

En längre teknisk genomgång ska kunna öppnas separat.

15.74 LJUD FÅR INTE VARA OBLIGATORISKT

All viktig information ska kunna förstås utan ljud.

Detta krävs för:

- offentliga gym,

- hörselnedsättning,

- avstängt ljud,

- och användare som föredrar text.

15.75 TEXTINSTRUKTION

Varje prioriterad övning ska ha en kort textinstruktion.

Den ska normalt innehålla:

- startposition,

- rörelse,

- och avslutning.

Den ska vara begriplig utan videon.

15.76 STEG-FÖR-STEG

En fördjupad textvy kan innehålla steg.

Exempel:

1. Placera fötterna stabilt.

2. Skapa en kontrollerad startposition.

3. Sänk redskapet längs avsedd bana.

4. Vänd rörelsen med bibehållen kontroll.

5. Avsluta repetitionen stabilt.

Stegen ska vara övningsspecifika och inte generisk utfyllnad.

15.77 KORTA TEKNIKPUNKTER

GainPilot ska normalt begränsa snabbvyn till ett fåtal viktiga punkter.

Exempel:

- behåll stabil kontakt med underlaget,

- kontrollera den excentriska fasen,

- undvik att förlora startpositionen.

Detaljer ska ligga bakom en fördjupad vy.

15.78 VANLIGA FRÅGOR

Övningsvyn kan besvara vanliga frågor.

Exempel:

- Hur brett ska jag greppa?

- Hur djupt ska jag gå?

- Var ska jag känna övningen?

- Vilken vikt ska jag börja med?

- Vad gör jag om övningen känns obekväm?

Svaren ska vara:

- kontextuella,

- försiktiga,

- och kopplade till användarens nivå.

15.79 VAR SKA ÖVNINGEN KÄNNAS?

GainPilot kan beskriva var användaren vanligtvis kan känna muskulär ansträngning.

Systemet ska inte säga att:

- frånvaro av en viss känsla betyder att övningen är värdelös,

- eller att en känsla bevisar perfekt teknik.

Skarp smärta eller ovanliga symptom ska hanteras genom säkerhetsflödet.

15.80 NYBÖRJARLÄGE

Nybörjarläget ska kunna visa:

- tydligare startposition,

- långsammare animation,

- fler grundläggande steg,

- utrustningsförklaring,

- och korta säkerhetspunkter.

Nybörjarläget ska inte behandla användaren nedlåtande.

15.81 AVANCERAT LÄGE

Avancerat läge kan visa:

- teknikstandard,

- tempo,

- programspecifik variant,

- belastningssyfte,

- och djupare biomekanisk kontext.

Avancerad detalj ska vara relevant för användarens mål.

15.82 SNABBLÄGE UNDER PASS

Under aktivt pass ska användaren kunna få:

- en kort loop,

- två eller tre teknikpunkter,

- senaste relevanta instruktion,

- och möjlighet att öppna mer.

Detta ska vara standard för vana användare.

15.83 FÖRSTAGÅNGSVY

När användaren möter en övning för första gången kan GainPilot erbjuda en längre introduktion.

Den kan innehålla:

- full demonstration,

- inställning,

- viktiga fel,

- startbelastning,

- och möjlighet att markera att övningen känns förstådd.

Systemet ska inte tvinga användaren att se hela introduktionen varje gång.

15.84 REPETITION AV INSTRUKTION

Arnold ska kunna avgöra när instruktionen behöver upprepas.

Relevanta signaler kan vara:

- lång tid sedan övningen användes,

- tidigare teknisk osäkerhet,

- ny variant,

- eller användarens uttryckliga fråga.

Systemet ska inte automatiskt anta att användaren glömt allt efter ett uppehåll.

15.85 PERSONLIGT TEKNIKFOKUS

GainPilot kan komma ihåg ett bekräftat teknikfokus.

Exempel:

För bänkpress:

Jämn kontaktpunkt.

Detta fokus kan visas kort i nästa jämförbara pass.

En osäker AI-observation ska inte automatiskt bli permanent teknikminne.

15.86 ANVÄNDARSKAPAD TEKNIKNOTERING

Användaren ska kunna lägga till egen notering.

Exempel:

Tänk på att ställa bänken ett steg längre från racket.

Noteringen ska vara privat som standard.

Den ska inte automatiskt bli canonical instruktion för andra användare.

15.87 TRÄNARSKAPAD INSTRUKTION

En mänsklig tränare kan lägga till:

- teknikpunkt,

- video,

- regressionsval,

- eller individuell instruktion.

Tränarens instruktion ska kunna visas med tydlig källa.

Den får inte blandas ihop med GainPilots canonical text.

15.88 PROFESSIONELLA BEGRÄNSNINGAR

När användaren har professionella instruktioner ska visuellt stöd kunna anpassas.

Exempel:

- begränsat rörelseomfång,

- särskild variant,

- eller förbjuden rörelse.

GainPilot ska inte ändra eller tolka instruktionen utanför dess uttryckliga omfattning.

15.89 PERSONLIG VIDEOJÄMFÖRELSE

Användaren kan på sikt jämföra egen video med canonical demonstration.

Jämförelsen ska vara:

- valbar,

- privat,

- och tydligt osäker.

Systemet ska inte anta att skillnad automatiskt innebär fel.

15.90 ÖVERLÄGGNING

GainPilot kan visa överläggning med:

- referenslinjer,

- rörelsebana,

- eller fasmarkörer.

Överläggningen ska användas pedagogiskt.

Den får inte påstå att användaren måste följa exakt samma geometriska bana som avataren.

15.91 VIDEOANALYSENS KVALITETSKRAV

Analys ska bedöma om videon har:

- rätt kameravinkel,

- hela kroppen synlig,

- tillräckligt ljus,

- relevant utrustning synlig,

- och fullständig repetition.

Om kvaliteten är för låg ska Arnold säga det.

Systemet ska inte skapa detaljerad feedback från otillräcklig video.

15.92 LOKAL VIDEOANALYS

Där det är tekniskt möjligt ska GainPilot kunna analysera video lokalt på användarens enhet.

Det kan minska:

- överföring,

- lagring,

- och integritetsrisk.

Lokal behandling ska fortfarande vara transparent.

15.93 MOLNBASERAD VIDEOANALYS

Molnbaserad analys kan användas när:

- användaren godkänner det,

- uppgiften kräver det,

- och rätt dataskydd finns.

Användaren ska informeras om:

- vad som laddas upp,

- hur länge det sparas,

- vilka modeller som används,

- och hur materialet raderas.

15.94 VIDEORETENTION

Användaren ska kunna välja:

- radera direkt efter analys,

- spara till passet,

- spara till teknikbibliotek,

- dela med tränare,

- eller exportera.

Standard ska normalt vara radering efter analys när videon inte behövs längre.

15.95 VIDEO OCH ATLAS

Atlas ska inte automatiskt få åtkomst till användarens träningsvideo.

Om Atlas behövs för en godkänd analys ska Hermes kunna leverera:

- minimerade resultat,

- eller tidsbegränsad åtkomst.

Full video ska inte delas mellan projekt utan tydligt mandat.

15.96 SKÄRMBILDER

Användaren kan skapa skärmbilder av teknik eller inställning.

Skärmbilder ska behandlas som privat användarmedia.

De ska inte automatiskt användas för:

- global modellträning,

- marknadsföring,

- eller produktanalys.

15.97 EXTERNA MEDIABIBLIOTEK

GainPilot kan använda externa bibliotek för att snabbare få bred täckning.

Varje bibliotek ska bedömas utifrån:

- övningsutbud,

- teknisk kvalitet,

- upplösning,

- kameravinklar,

- visuell stil,

- språk,

- API,

- nedladdningsrätt,

- kommersiell licens,

- white-label-rätt,

- leverantörsberoende,

- och exportmöjlighet.

15.98 LEVERANTÖRSMATRIS

GainPilot ska skapa en leverantörsmatris innan ett externt bibliotek väljs.

Matrisen ska minst jämföra:

- antal relevanta övningar,

- täckning av P0-övningar,

- styrketräning,

- CrossFit,

- calisthenics,

- kondition,

- mediaformat,

- visuell anpassning,

- teknisk kvalitet,

- licens,

- pris,

- API-begränsningar,

- och exitmöjlighet.

Ett stort antal övningar ska inte automatiskt väga tyngre än kvalitet.

15.99 LICENS

Varje extern medieresurs ska ha känd licens.

Licensmodellen ska kunna beskriva:

- kommersiell användning,

- användning i mobilapp,

- användning på webb,

- modifieringsrätt,

- lokal lagring,

- cache,

- white-label,

- geografiska begränsningar,

- och upphörandevillkor.

GainPilot ska inte publicera material med oklar rättighetsstatus.

15.100 ATTRIBUTION

När licensen kräver attribution ska GainPilot:

- visa rätt information,

- lagra källan,

- och säkerställa att attributionen följer med rätt resurs.

Attribution ska inte försvinna vid:

- cache,

- export,

- eller formatkonvertering.

15.101 LEVERANTÖRSINLÅSNING

GainPilot ska undvika att canonical övningssystem blir beroende av en leverantörs egna identifierare.

Extern media ska kopplas genom adapter till GainPilots canonical identiteter.

Om leverantören försvinner ska GainPilot kunna:

- ersätta media,

- behålla historik,

- och identifiera vilka övningar som saknar alternativ.

15.102 MEDIEADAPTER

Varje leverantör ska integreras genom ett adapterlager.

Adaptern ska hantera:

- identifierare,

- format,

- språk,

- licensmetadata,

- URL,

- cachepolicy,

- och versionsinformation.

GainPilots domänmodell ska inte byggas direkt mot leverantörens interna struktur.

15.103 HYBRIDBIBLIOTEK

GainPilot ska använda en hybridmodell.

En möjlig struktur är:

1. Licensierat grundbibliotek för snabb täckning.

2. Eget material för de viktigaste övningarna.

3. Specialproducerat material för tekniskt komplexa rörelser.

4. Egna progressioner och regressioner.

5. AI-förstärkt efterbearbetning efter granskning.

Hybridmodellen ska ge både:

- lanseringshastighet,

- och långsiktig kontroll.

15.104 PRIORITERING AV EGET MATERIAL

Eget material ska prioriteras för övningar som:

- används mycket ofta,

- definierar GainPilots visuella identitet,

- saknas hos leverantören,

- är tekniskt komplexa,

- kräver flera progressioner,

- eller har hög säkerhetsbetydelse.

GainPilot behöver inte egenproducera tusentals övningar före lansering.

15.105 FÖRSTA PRODUKTIONSOMFÅNGET

Första produktionen kan fokusera på cirka 20–30 centrala övningar.

Det exakta antalet ska bestämmas utifrån:

- första programmen,

- vanligaste substitutionsbehoven,

- nybörjarstöd,

- och rörelsemönstertäckning.

Ett möjligt första urval kan innehålla:

- knäböjsvariant,

- benpress,

- utfallsvariant,

- marklyftsvariant,

- rumänska marklyft,

- bänkpress,

- hantelpress,

- axelpress,

- rodd,

- latsdrag,

- pull-up eller assisterad pull-up,

- bicepscurl,

- tricepsextension,

- vadpress,

- grundläggande bålövningar,

- promenad,

- löpning,

- cykling,

- roddmaskin,

- och enklare rörlighet.

Den canonical programinventeringen ska avgöra slutligt urval.

15.106 PRODUKTIONSPRIORITET

Medieproduktionen ska använda prioritet.

Exempel:

P0:

Krävs för första fungerande program och säker onboarding.

P1:

Vanliga byten, regressioner och nybörjarövningar.

P2:

Bredare styrke-, hypertrofi- och konditionstäckning.

P3:

CrossFit och calisthenics med hög teknisk komplexitet.

P4:

Sällsynta specialövningar.

Prioriteten ska kunna ändras utifrån verklig användning.

15.107 MEDIATÄCKNING

GainPilot ska kunna mäta täckning.

Täckning ska inte endast betyda:

Andel övningar med valfri bild.

Den ska kunna delas upp i:

- huvuddemonstration,

- textinstruktion,

- teknikpunkter,

- vanliga fel,

- flera vinklar,

- progression,

- regression,

- ljud,

- och tillgänglighetsvariant.

15.108 MINSTA PUBLICERBARA MEDIAPAKET

En P0-övning ska innan full publicering minst kunna ha:

- canonical koppling,

- huvuddemonstration,

- kort textinstruktion,

- ett begränsat antal teknikpunkter,

- känd licens,

- teknisk granskning,

- och versionsstatus.

Mer avancerade resurser kan tillkomma senare.

15.109 MEDIESTATUS

En medieresurs ska kunna ha status som:

- koncept,

- råinspelning,

- under produktion,

- tekniskt granskningsbar,

- tekniskt godkänd,

- redaktionellt godkänd,

- canonical,

- publicerad,

- begränsad,

- ersatt,

- eller avpublicerad.

En rå resurs ska inte kunna visas för användare av misstag.

15.110 TEKNISK GRANSKNING

Teknisk granskning ska verifiera:

- rätt övning,

- rätt variant,

- korrekt startposition,

- rimlig rörelsebana,

- korrekt utrustningskontakt,

- relevant rörelseomfång,

- och frånvaro av uppenbara tekniska fel.

Granskaren ska ha tillräcklig kompetens för träningsdomänen.

15.111 REDAKTIONELL GRANSKNING

Redaktionell granskning ska verifiera:

- begriplighet,

- språk,

- informationsmängd,

- visuell tydlighet,

- tillgänglighet,

- och överensstämmelse med GainPilots ton.

Teknisk och redaktionell granskning ska kunna utföras separat.

15.112 SÄKERHETSGRANSKNING

Högrisk- eller tekniskt komplexa övningar ska kunna kräva särskild säkerhetsgranskning.

Exempel:

- olympiska lyft,

- avancerad gymnastik,

- tunga fria lyft,

- explosiva rörelser,

- och vissa progressioner.

Granskningen ska bedöma både:

- vad som visas,

- och vad som saknas.

15.113 LICENSGRANSKNING

Innan publicering ska GainPilot verifiera:

- rättighet,

- geografisk användning,

- plattformar,

- modifieringsrätt,

- cache,

- och avtalstid.

Licensstatus ska vara maskinläsbar där det är möjligt.

15.114 TILLGÄNGLIGHETSGRANSKNING

Media ska granskas för:

- kontrast,

- undertexter,

- ljudalternativ,

- minskad rörelse,

- skärmläsarstext,

- färgoberoende markeringar,

- och användbarhet vid zoom.

Tillgänglighet ska inte läggas till först efter lansering.

15.115 KVALITETSGATE

Publicering ska kräva att definierade kvalitetspunkter har passerats.

En möjlig gate:

1. Canonical övning verifierad.

2. Variant verifierad.

3. Teknisk granskning godkänd.

4. Redaktionell granskning godkänd.

5. Licens verifierad.

6. Tillgänglighetskontroll klar.

7. Fil och metadata validerade.

8. Tester godkända.

9. Publiceringsstatus satt.

Ingen enskild agent ska kunna hoppa över gaten.

15.116 FYRAÖGONSPRINCIP

Tekniskt komplex eller högriskmedia ska kunna kräva minst två separata godkännanden.

Exempel:

- träningsdomänexpert,

- och produkt- eller säkerhetsgranskare.

Samma person eller agent ska inte ensam:

- skapa,

- granska,

- och publicera

högriskmaterial.

15.117 KVALITETSSCORE

GainPilot kan använda ett internt mediekvalitetsscore.

Det kan väga:

- teknisk granskning,

- upplösning,

- visuell tydlighet,

- licens,

- tillgänglighet,

- användarfeedback,

- och kända fel.

Scoren ska stödja prioritering.

Den får inte ersätta obligatoriska statusar eller kvalitetspunkter.

15.118 VERSIONERING

Varje medieresurs ska vara versionerad.

Ny version kan krävas när:

- rörelsen korrigeras,

- utrustningen ändras,

- kameravinkel ändras,

- text eller etiketter ändrar teknisk betydelse,

- eller licensförhållandet förändras.

En ren komprimeringsändring kan vara en ny filversion utan att instruktionsversionen ändras.

15.119 CHECKSUMMA

Publicerade filer ska ha checksumma.

Checksumman kan användas för:

- integritetskontroll,

- cachevalidering,

- dubblettkontroll,

- och leveransverifiering.

Systemet ska kunna upptäcka om filinnehållet förändrats utan korrekt versionsuppdatering.

15.120 AVPUBLICERING

Media ska kunna avpubliceras om:

- tekniskt fel upptäcks,

- licensen upphör,

- fel variant har kopplats,

- säkerhetsproblem identifieras,

- eller en bättre canonical version ersätter den.

Avpublicering ska:

- stoppa ny användning,

- uppdatera cache,

- bevara historik,

- och aktivera fallback där sådan finns.

15.121 FALLBACK

Om huvudmedia saknas ska GainPilot kunna använda fallback.

Ordningen kan exempelvis vara:

1. Godkänd alternativ vinkel.

2. Godkänd video.

3. Stegsekvens.

4. Stillbild.

5. Textinstruktion.

6. Markering att demonstration saknas.

Systemet ska inte visa en annan variant utan tydlig kontroll.

15.122 LICENS SOM LÖPER UT

GainPilot ska bevaka licensers slutdatum.

Före utgång ska systemet kunna:

- varna,

- identifiera berörda övningar,

- planera ersättningsmedia,

- och stoppa framtida användning vid behov.

Atlas kan hjälpa till med denna bevakning.

15.123 LEVERANTÖRSAVBROTT

Om en extern leverantör blir otillgänglig ska GainPilot:

- använda godkänd cache där licensen tillåter det,

- visa fallback,

- logga incidenten,

- och undvika att passflödet kraschar.

Träningspasset ska kunna fortsätta med textinstruktion.

15.124 CDN OCH DISTRIBUTION

Media ska levereras genom en skalbar distributionsmodell.

Den ska kunna stödja:

- global CDN,

- versionsstyrda URL:er,

- cache,

- rätt format per enhet,

- och snabb avpublicering.

Teknisk implementation definieras senare.

15.125 ADAPTIV KVALITET

GainPilot ska kunna leverera olika kvalitet utifrån:

- nätverk,

- enhet,

- skärm,

- och användarinställning.

Exempel:

- lågupplöst preview,

- normal mobilkvalitet,

- hög kvalitet i teknikvyn,

- och offlineversion.

Systemet ska inte ladda högsta möjliga kvalitet i alla situationer.

15.126 FORMAT

GainPilot ska stödja moderna format med fallback.

Valet ska bedöma:

- kvalitet,

- filstorlek,

- transparens,

- loopstöd,

- hårdvaruacceleration,

- och plattformsstöd.

Canonical mediaidentitet ska vara oberoende av leveransformat.

15.127 FÖRLADDNING

Dagens passmedia kan förladdas före passet.

Detta kan minska väntetid.

Förladdningen ska:

- följa användarens datainställningar,

- begränsa lagring,

- och prioritera dagens övningar.

15.128 OFFLINEMEDIA

Användaren ska kunna ladda ned relevanta demonstrationer för offlinepass.

Offlinepaketet ska:

- vara versionshanterat,

- ha begränsad storlek,

- respektera licens,

- och kunna uppdateras.

Media med återkallad licens ska kunna tas bort eller blockeras enligt policy.

15.129 CACHE

Cache ska kunna innehålla:

- thumbnails,

- korta loopar,

- textinstruktion,

- och dagens media.

Cache får inte bli en permanent okontrollerad kopia.

Den ska ha:

- version,

- utgång,

- och invalidation.

15.130 PRESTANDA

Övningsmedia ska starta snabbt.

Produktmål kan exempelvis omfatta:

- snabb första bild,

- kort tid till uppspelning,

- stabil loop,

- och låg felfrekvens.

GainPilot ska mäta faktisk upplevelse på olika enheter.

15.131 BATTERI

Realtidsrendering och högupplöst video kan påverka batteriet.

Systemet ska kunna använda:

- energisparläge,

- förhandsrenderad fallback,

- minskad bildfrekvens,

- och avstängd bakgrundsrörelse.

Användaren ska inte behöva välja mellan demonstration och att mobilen räcker under passet.

15.132 DATATRAFIK

GainPilot ska kunna visa och respektera inställningar för:

- endast Wi-Fi,

- tillåt mobildata,

- låg datamängd,

- och automatisk offlinecache.

Systemet ska undvika att ladda samma media flera gånger.

15.133 SÖKNING I MEDIABIBLIOTEKET

Användaren ska kunna söka efter:

- övningsnamn,

- synonym,

- muskel,

- utrustning,

- rörelsemönster,

- träningsdomän,

- och färdighet.

Sökningen ska använda canonical övningsgraf.

Media ska inte ha en separat motstridig sökmodell.

15.134 FÖRHANDSVISNING

Sökresultat kan visa en kort preview.

Previewn ska:

- identifiera övningen,

- starta snabbt,

- och inte kräva full videoladdning.

Användaren ska kunna stänga av automatiska previews.

15.135 FAVORITER OCH SPARAT MATERIAL

Användaren ska kunna spara:

- övning,

- demonstration,

- teknikpunkt,

- eller personlig video.

Sparad extern media ska fortfarande följa licens och tillgänglighet.

15.136 PERSONLIGT TEKNIKBIBLIOTEK

GainPilot kan erbjuda ett privat teknikbibliotek.

Det kan innehålla:

- egna videor,

- tränarfeedback,

- tekniknoteringar,

- jämförelser,

- och tidigare fokus.

Biblioteket ska vara isolerat från det globala canonical mediebiblioteket.

15.137 DELNING

Användaren ska kunna dela en demonstration eller länk.

Delningen ska respektera:

- licens,

- åtkomst,

- och eventuell prenumerationsbegränsning.

Privata teknikvideor ska endast delas efter explicit val.

15.138 EMBED OCH EXTERNA LÄNKAR

Extern media kan bäddas in om:

- leverantören tillåter det,

- integriteten är acceptabel,

- och upplevelsen är stabil.

GainPilot ska vara försiktigt med externa spelare som:

- spårar användaren,

- visar reklam,

- föreslår orelaterat innehåll,

- eller förändras utan kontroll.

15.139 INGA OBEHÖRIGA NEDLADDNINGAR

GainPilot ska inte kringgå leverantörers tekniska skydd eller villkor för att kopiera media.

All lagring och cache ska ha rätt avtalsgrund.

15.140 LOKALISERING

Media ska kunna lokaliseras utan att rörelsedatan dupliceras i onödan.

Lokaliserade komponenter kan vara:

- övningsnamn,

- teknikpunkter,

- etiketter,

- undertexter,

- och röst.

Canonical media ska behålla samma övningsidentitet över språk.

15.141 TERMINOLOGI

Övningsnamn och teknikbegrepp ska följa GainPilots canonical terminologi.

Systemet ska kunna stödja etablerade engelska begrepp även i svensk användning.

Exempel:

Användaren kan söka på både:

- rumänska marklyft,

- Romanian deadlift,

- och RDL.

15.142 UNDERtexter

All talad instruktion ska kunna ha undertexter.

Undertexterna ska:

- vara synkroniserade,

- tydliga,

- och möjliga att stänga av.

Automatiskt genererade undertexter ska granskas för tekniska övningsnamn.

15.143 LJUDbeskrivning

Vissa demonstrationer kan behöva ljudbeskrivning.

Den kan beskriva:

- startposition,

- rörelseriktning,

- och relevant teknik.

Ljudbeskrivningen ska vara separat från vanlig coachröst där det behövs.

15.144 SKÄRMLÄSARE

Övningsmedia ska ha textalternativ som skärmläsare kan använda.

Textalternativet ska beskriva den pedagogiskt relevanta rörelsen.

Det ska inte endast säga:

Animation av bänkpress.

15.145 TANGENTBORD OCH STYRNING

På webb ska användaren kunna:

- spela,

- pausa,

- byta vinkel,

- öppna text,

- och stänga media

med tangentbord.

15.146 BLINKANDE EFFEKTER

GainPilot ska undvika:

- snabba blinkningar,

- starka pulser,

- och visuella effekter

som kan skapa obehag eller tillgänglighetsrisk.

Den futuristiska designen ska vara kontrollerad.

15.147 KOGNITIV BELASTNING

Media ska inte visa samtidigt:

- full animation,

- flera muskelmarkeringar,

- fem rörelsebanor,

- många teknikpunkter,

- timer,

- och omfattande text

utan användarens val.

Gränssnittet ska prioritera en sak i taget.

15.148 BARN OCH UNGA ANVÄNDARE

Om GainPilot i framtiden stödjer minderåriga krävs särskild:

- åldersanpassning,

- samtyckesmodell,

- säkerhetsgranskning,

- och pedagogik.

Detta ska inte aktiveras genom att endast återanvända vuxnas media.

15.149 MEDICINSKT ELLER REHABILITERINGSNÄRA INNEHÅLL

GainPilot ska vara försiktigt med övningar som framställs som:

- behandling,

- rehabilitering,

- korrigering av diagnos,

- eller medicinsk lösning.

Sådant innehåll kräver:

- särskild professionell grund,

- tydligt scope,

- och separat governance.

Vanlig träningsmedia får inte marknadsföras som behandling.

15.150 SÄKERHETSTEXT

Tekniskt eller riskmässigt relevanta övningar kan ha kort säkerhetstext.

Exempel:

Använd säkerhetsarmar eller passare vid tung belastning.

Säkerhetstexten ska vara konkret.

Den ska inte vara en generell ansvarsfriskrivning som döljer ett dåligt innehåll.

15.151 INSTRUKTIONSANSVAR

GainPilot ska säkerställa att varje teknisk instruktion har:

- definierad källa,

- granskningsstatus,

- och ägare.

Ingen anonym AI-text ska kunna publiceras som canonical instruktion utan granskning.

15.152 ANVÄNDAREN KAN RAPPORTERA FEL

Användaren ska kunna rapportera:

- fel övning,

- konstig rörelse,

- trasig video,

- saknad variant,

- fel text,

- eller tillgänglighetsproblem.

Rapporten ska kopplas till:

- mediaidentitet,

- version,

- enhet,

- och relevant tidsstämpel.

15.153 SNABB AVPUBLICERING VID FEL

Vid allvarligt fel ska GainPilot kunna:

- stoppa resursen,

- byta till fallback,

- öppna incident,

- och identifiera berörda vyer.

Det ska inte krävas en full klientuppdatering för att avpublicera felaktigt media.

15.154 ANVÄNDARFEEDBACK

GainPilot kan samla feedback som:

- hjälpte demonstrationen,

- var den tydlig,

- saknades en vinkel,

- eller visades fel variant?

Feedbacken ska vara enkel och valbar.

Popularitet ska inte ersätta teknisk granskning.

15.155 BETEENDESIGNALER

Systemet kan analysera:

- hur ofta media öppnas,

- om användaren byter vinkel,

- om videon avbryts,

- och vilka övningar som ofta skapar teknikfrågor.

Beteendesignaler ska användas för produktförbättring.

De får inte automatiskt klassificera användarens teknik som dålig.

15.156 MEDIEKVALITET OCH UTFALL

GainPilot ska kunna undersöka om bättre media leder till:

- färre avbrutna övningar,

- mindre förvirring,

- färre felrapporter,

- och högre trygghet.

Det ska inte hävda att media ensamt orsakar bättre träningsresultat utan tillräckligt underlag.

15.157 A/B-TESTNING

Visuell presentation kan A/B-testas för lågriskfrågor.

Exempel:

- placering av vinkelval,

- storlek på tekniktext,

- och previewformat.

Canonical teknik, säkerhetsinstruktioner och rörelsedata ska inte experimenteras fritt utan governance.

15.158 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera:

- medietäckning,

- laddningsfel,

- leverantörsavbrott,

- användarrapporter,

- licensrisker,

- och produktionsbehov.

Analysen ska normalt använda:

- mediaidentitet,

- teknisk metadata,

- och aggregerad användning.

Privat användarvideo ska inte ingå utan separat rätt grund.

15.159 ATLAS ROLL

Atlas ska kunna hjälpa GainPilot med:

- omvärldsbevakning,

- leverantörsbedömning,

- licensförändringar,

- produktionsprioritering,

- dubblettanalys,

- och kvalitetssignaler.

Atlas kan skapa förslag som:

- fem P0-övningar saknar godkänd sidovinkel,

- leverantörens licens upphör om 90 dagar,

- eller användare rapporterar återkommande problem i en viss animation.

Atlas får inte publicera eller ändra canonical media direkt.

15.160 ARNOLDS ROLL

Arnold ska göra det visuella materialet användbart för användaren.

Han ska kunna:

- öppna rätt demonstration,

- välja relevant detaljnivå,

- lyfta ett teknikfokus,

- jämföra varianter,

- visa regression,

- och förklara att individuell variation finns.

Arnold ska inte överdriva säkerheten i det visuella materialet.

15.161 HERMES ROLL

Hermes ska kontrollera åtkomst till:

- användarens träningsvideo,

- skärmbilder,

- tränarfeedback,

- och privata tekniknoteringar.

Canonical offentligt övningsmedia kräver normalt inte personlig minnesåtkomst.

Personlig videoanalys ska få ett separat och tidsbegränsat åtkomstscope.

15.162 PRODUKTIONSPIPELINE

GainPilots produktionspipeline ska kunna vara:

Behovsidentifiering

→ Canonical övningskontroll

→ Instruktionsspecifikation

→ Käll- och referensinsamling

→ Produktionsmetod

→ Råproduktion

→ Teknisk granskning

→ Korrigering

→ Redaktionell granskning

→ Tillgänglighetsgranskning

→ Licenskontroll

→ Kodning och optimering

→ Metadata

→ Tester

→ Publiceringsgodkännande

→ Versionsstyrd distribution

→ Uppföljning

Ingen viktig fas ska vara implicit.

15.163 INSTRUKTIONSSPECIFIKATION

Innan produktion ska varje resurs ha en specifikation.

Den kan innehålla:

- canonical övning,

- variant,

- syfte,

- teknikstandard,

- kameravinkel,

- tempo,

- utrustning,

- modell,

- bakgrund,

- text,

- markeringar,

- och granskningskrav.

Specifikationen ska minska risken att produktionen skapar visuellt snyggt men fel innehåll.

15.164 REFERENSMATERIAL

Produktion ska använda granskade referenser.

Referenser kan vara:

- officiell rörelsestandard,

- intern teknisk beskrivning,

- kvalificerad utövare,

- motion capture,

- expertgranskning,

- och relevant källmaterial.

En enskild social medievideo ska inte automatiskt definiera canonical teknik.

15.165 STORYBOARD

Komplexa demonstrationer ska kunna använda storyboard.

Storyboarden kan visa:

- start,

- viktiga faser,

- kamerabyte,

- text,

- markering,

- och avslutning.

Storyboard ska granskas innan dyr produktion när det minskar omarbete.

15.166 RÅPRODUKTION

Råproduktion ska lagras separat från publicerade filer.

Den ska kunna innehålla:

- mocapdata,

- 3D-scen,

- rigg,

- texturer,

- ljud,

- redigeringsprojekt,

- och råvideo.

Råfiler ska ha tydlig ägare, licens och retention.

15.167 PRODUKTIONSKÄLLOR

GainPilot ska bevara vilka källfiler som skapade den publicerade resursen.

Detta möjliggör:

- korrigering,

- ny rendering,

- annan upplösning,

- ny lokalisering,

- och licensrevision.

15.168 AUTOMATISK VALIDERING

Pipeline ska kunna validera:

- filformat,

- upplösning,

- bildfrekvens,

- längd,

- ljudspår,

- undertexter,

- checksumma,

- metadata,

- och canonical koppling.

Automatisk validering ersätter inte teknisk rörelsegranskning.

15.169 VISUELL JÄMFÖRELSE

Nya versioner ska kunna jämföras med tidigare version.

Systemet kan upptäcka:

- förändrad kamera,

- förändrad modell,

- saknad utrustning,

- eller oväntad visuell skillnad.

Automatiska bildjämförelser ska användas som stöd.

15.170 RÖRELSEVALIDERING

På sikt kan GainPilot använda rörelseanalys för att identifiera:

- fotglidning,

- tappad kontakt med redskap,

- onaturliga ledhopp,

- och animation som inte loopar korrekt.

Automatisk kontroll ska inte vara ensam teknisk godkännare.

15.171 UTRUSTNINGSVALIDERING

Systemet ska kontrollera att:

- redskapet finns i alla bildrutor,

- händer och kropp behåller rimlig kontakt,

- maskindelar rör sig korrekt,

- och vikter inte förändras visuellt.

Generativ efterbearbetning får inte deformera utrustningen.

15.172 ANATOMIVALIDERING

GainPilot ska kontrollera:

- orimliga ledvinklar,

- penetrering mellan kroppsdelar,

- plötsliga proportionförändringar,

- och anatomiska artefakter.

Detta är särskilt viktigt vid AI-genererad eller retargetad media.

15.173 LOOPVALIDERING

Loopar ska testas för:

- visuellt hopp,

- felaktig återställning,

- varierande utrustningsposition,

- och onaturlig rytm.

En tekniskt korrekt repetition kan fortfarande vara en dålig loop.

15.174 TEKNISK REVIEWLOGG

Varje teknisk granskning ska kunna dokumentera:

- granskare,

- datum,

- version,

- kriterier,

- identifierade problem,

- korrigeringar,

- och beslut.

Godkännandet ska inte endast vara en odokumenterad muntlig bedömning.

15.175 PUBLICERINGSGODKÄNNANDE

Publiceringsbeslutet ska ange:

- vilken version som godkänns,

- för vilka plattformar,

- på vilka språk,

- och med vilka eventuella begränsningar.

Exempel:

Godkänd som huvuddemonstration för mobil och webb.

Inte godkänd för automatisk teknikjämförelse.

15.176 ROLLBACK

GainPilot ska kunna återgå till tidigare media.

Rollback ska användas när:

- ny version har tekniskt fel,

- laddningen försämras,

- licensinformationen är fel,

- eller användarfeedback visar allvarligt problem.

Rollback får inte återaktivera en version med känd säkerhetsrisk.

15.177 INCIDENTHANTERING

En medieincident kan vara:

- fel övning visas,

- farlig teknik demonstreras,

- licensbrott,

- privat video exponeras,

- eller media från annan användare visas.

Incidentprocessen ska kunna:

- stoppa åtkomst,

- identifiera omfattning,

- bevara bevis,

- korrigera kopplingar,

- invalidiera cache,

- och följa upp.

15.178 SÄKERHETSINCIDENT

Om en demonstration bedöms kunna leda till risk ska den avpubliceras omedelbart.

GainPilot ska inte vänta på nästa ordinarie release.

15.179 INTEGRITETSINCIDENT

Om privat användarmedia exponeras fel ska incidenten behandlas som en allvarlig integritetsincident.

Åtgärder kan omfatta:

- stoppa åtkomst,

- återkalla URL,

- radera cache,

- kontrollera loggar,

- och informera enligt tillämpliga krav.

15.180 BACKUP

Canonical media och produktionskällor ska säkerhetskopieras enligt definierad policy.

Backup ska:

- vara versionshanterad,

- skyddad,

- och testad för återställning.

Licensbegränsat material ska endast säkerhetskopieras enligt avtalet.

15.181 ARKIVERING

Ersatta media kan arkiveras.

Arkivet ska bevara:

- version,

- licens,

- publiceringsperiod,

- och orsak till ersättning.

Arkiverad media ska inte användas i nya pass.

15.182 RADERING

Media ska kunna raderas när:

- licens kräver det,

- privat användare begär det,

- retention löper ut,

- eller filen saknar fortsatt legitimt syfte.

Radering ska inkludera relevanta:

- cachekopior,

- derivat,

- och personliga delningslänkar

enligt policy.

15.183 TESTNING AV MEDIAARKITEKTUREN

Mediaarkitekturen ska testas genom:

- enhetstester,

- kontraktstester,

- visuella tester,

- tillgänglighetstester,

- licenstester,

- prestandatester,

- säkerhetstester,

- och regressionstester.

15.184 KONTRAKTSTESTER

Kontraktstester ska verifiera kopplingen mellan:

- canonical övning,

- mediaidentitet,

- språk,

- vinkel,

- version,

- och publiceringsstatus.

Fel variant ska inte kunna returneras som giltig fallback.

15.185 VISUELLA REGRESSIONSTESTER

Visuella tester ska kunna upptäcka:

- saknad modell,

- felaktig bakgrund,

- klippt utrustning,

- fel proportion,

- fel etikett,

- och trasig layout.

Visuell likhet är inte tillräcklig för teknisk godkännande.

15.186 TEKNISKA SCENARIOTESTER

Scenarier ska omfatta:

- huvudvinkel,

- flera vinklar,

- långsam uppspelning,

- pausvariant,

- muskelmarkering,

- vanligt fel,

- progression,

- och regression.

15.187 ENHETSTESTER

Media ska testas på:

- mindre Android-enheter,

- större Android-enheter,

- iPhone där GainPilot stödjer det,

- surfplatta,

- webb,

- smartwatchrelaterade previews,

- och äldre men stödda enheter.

15.188 NÄTVERKSTESTER

Systemet ska testas vid:

- snabbt Wi-Fi,

- mobilnät,

- långsam anslutning,

- instabil anslutning,

- och offline.

Textinstruktion ska förbli tillgänglig när video inte laddas.

15.189 TILLGÄNGLIGHETSTESTER

Tester ska verifiera:

- minskad rörelse,

- undertexter,

- skärmläsare,

- tangentbord,

- kontrast,

- färgblindhet,

- zoom,

- och ljud av.

15.190 LICENSTESTER

Systemet ska verifiera att:

- utgången licens stoppar publicering,

- attribution visas där den krävs,

- offlinecache följer villkoren,

- och fel territorium inte får åtkomst när geografisk begränsning finns.

15.191 SÄKERHETSTESTER

Säkerhetstester ska verifiera:

- privata filer inte exponeras,

- signerade länkar löper ut,

- användarisolering fungerar,

- externa URL:er valideras,

- och promptinjektion i metadata inte påverkar systemregler.

15.192 PRESTANDATEST

Systemet ska mäta:

- tid till första bild,

- tid till uppspelning,

- buffring,

- CPU- och GPU-belastning,

- batteri,

- minne,

- och cacheträffar.

15.193 ANVÄNDARTESTNING

Media ska testas med:

- nybörjare,

- vana tränande,

- användare med teknisk erfarenhet,

- användare med tillgänglighetsbehov,

- och personer som använder produkten i ett verkligt gym.

Testet ska bedöma:

- förstår användaren rörelsen,

- ser användaren rätt variant,

- är informationen lagom,

- och fungerar media under tidspress?

15.194 EXPERTTESTNING

Tekniskt komplexa demonstrationer ska granskas av personer med relevant kompetens.

Det kan omfatta:

- kvalificerad tränare,

- domänexpert,

- fysioterapeut när innehållet kräver det,

- CrossFit-specialist,

- calisthenicscoach,

- eller tyngdlyftningsexpert.

Rätt expert beror på rörelsen.

15.195 OBSERVABILITY

Det ska gå att förstå:

- vilken media som visades,

- vilken version,

- vilket språk,

- vilken vinkel,

- om fallback användes,

- om filen laddades,

- och om användaren rapporterade problem.

Observability ska inte logga privat video i klartext eller skapa onödiga kopior.

15.196 AUDIT

Betydelsefulla händelser ska kunna auditeras.

Exempel:

- canonical media publicerades,

- licens ändrades,

- tekniskt fel rapporterades,

- resurs avpublicerades,

- privat video delades,

- eller Atlas skapade ett förbättringsförslag.

15.197 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar förbättringsbehov ska processen vara:

Signal

→ Analys

→ Hypotes

→ Produktions- eller produktförslag

→ Teknisk och rättslig riskbedömning

→ Godkänt scope

→ Separat branch eller kontrollerad produktionsgren

→ Produktion eller implementation

→ Tester

→ Teknisk granskning

→ Pull request

→ Publiceringsgodkännande

→ Kontrollerad merge och distribution

→ Resultatuppföljning

Ingen agent får direkt:

- ersätta canonical media,

- ändra tekniktext,

- koppla om övningsidentitet,

- ändra licensstatus,

- eller publicera generativt material

utan denna process.

15.198 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots animerade övningsdemonstrationer och visuella teknikstöd.

**Kontrakt GP-243 — Canonical medieidentitet**

Varje publicerad medieresurs ska ha stabil identitet och kopplas till exakt canonical övning och variant.

**Kontrakt GP-244 — Instruktionssyfte före produktion**

Varje resurs ska ha ett definierat pedagogiskt syfte innan den produceras eller licensieras.

**Kontrakt GP-245 — Teknisk korrekthet före visuell effekt**

Rörelsens och utrustningens korrekthet ska alltid ha företräde framför visuell stil och varumärkeseffekt.

**Kontrakt GP-246 — Flera mediatyper**

GainPilot ska kunna använda 3D, video, stillbilder, text, ljud och interaktiv media beroende på användningsfallet.

**Kontrakt GP-247 — Variantkorrekt demonstration**

Media från en närliggande övning eller variant får inte visas som om den vore den planerade canonical rörelsen.

**Kontrakt GP-248 — Begränsad snabbvy**

Under aktivt träningspass ska demonstration och teknikpunkter begränsas till den minsta mängd som stödjer nästa handling.

**Kontrakt GP-249 — Individuell variation**

Visuella standarder ska beskrivas som pedagogiska referenser och får inte framställas som identiska krav för alla kroppar.

**Kontrakt GP-250 — Muskelmarkering är pedagogisk förenkling**

Muskelvisualisering får inte presenteras som exakt realtidsmätning eller fullständig biologisk sanning.

**Kontrakt GP-251 — Fel måste märkas tydligt**

Felvisualisering får aldrig kunna förväxlas med canonical huvuddemonstration.

**Kontrakt GP-252 — Progressioner ska ha villkor**

Visuella progressioner och regressioner ska kopplas till förkunskapskrav, kvalitetskriterier och övningsgrafen.

**Kontrakt GP-253 — Hybridbibliotek**

GainPilot ska kunna kombinera licensierat och egenproducerat material utan att canonical domänlogik låses till en leverantör.

**Kontrakt GP-254 — AI är produktionsstöd**

Generativ AI får stödja styling, lokalisering och produktion men får inte ensam definiera canonical rörelsedata.

**Kontrakt GP-255 — Teknisk granskning före publicering**

Allt canonical rörelsemedia ska granskas av relevant teknisk kompetens före produktionsanvändning.

**Kontrakt GP-256 — Licensierad användning**

Varje extern resurs ska ha känd, maskinläsbar och tillämpad licensstatus.

**Kontrakt GP-257 — Tillgänglighet som kärnkrav**

Media ska ha textalternativ, minskad rörelse, ljudoberoende information och tillräcklig kontrast.

**Kontrakt GP-258 — Versionshanterad media**

Media, metadata, text, ljud, licens och canonical koppling ska versioneras.

**Kontrakt GP-259 — Snabb avpublicering**

Felaktig, osäker eller rättighetsmässigt ogiltig media ska kunna avpubliceras och ersättas med fallback utan full klientrelease.

**Kontrakt GP-260 — Begränsad privat mediaåtkomst**

Användarvideo och bilder ska vara privata som standard och endast delas genom Hermes och explicit mandat.

**Kontrakt GP-261 — Begränsad retention av råmedia**

Privat råvideo, ljud och bilder ska normalt raderas när uppgiften är klar om användaren inte aktivt väljer att spara dem.

**Kontrakt GP-262 — Offlinefallback**

Grundläggande instruktion och relevant godkänd media ska kunna vara tillgänglig under offlinepass när licens och lagringspolicy tillåter det.

**Kontrakt GP-263 — Observerbar medieleverans**

Det ska gå att spåra vilken version, vinkel, källa och fallback som användes utan att exponera privat innehåll.

**Kontrakt GP-264 — Branch- och gatebaserad medieutveckling**

Förändringar av mediaarkitektur, canonical koppling, produktionspipeline, tekniktext och publiceringsregler ska ske genom separat branch, kvalitetstester, granskning och kontrollerad publicering.

15.199 ANTI-PRINCIPER

GainPilot ska inte:

- behandla övningsanimationer som dekorativ utfyllnad,

- prioritera visuell effekt framför korrekt rörelse,

- koppla media enbart genom filnamn eller fritext,

- visa fel övningsvariant för att rätt media saknas,

- låta samma animation representera tekniskt olika varianter,

- använda en enda kameravinkel när den döljer viktig teknik,

- överbelasta demonstrationer med markeringar och text,

- framställa en avatar som exakt ideal för alla kroppar,

- märka all individuell variation som fel,

- visa muskelmarkering som exakt biologisk mätning,

- använda färg som enda informationsbärare,

- visa felaktig teknik utan tydlig varning,

- presentera regression som misslyckande,

- skapa en universell calisthenicsprogression för alla användare,

- reducera CrossFit-scaling till att bara sänka vikten,

- framställa en viss löpstil som garanterat skadefri,

- publicera motion capture utan retargetinggranskning,

- låta en animatör ensam definiera övningsteknik,

- använda realtids-3D utan fallback,

- publicera generativ AI-video utan teknisk granskning,

- låta AI-styling förändra kropp, grepp eller utrustning,

- publicera automatisk översättning av säkerhetstext utan granskning,

- göra ljud obligatoriskt,

- visa för många teknikpunkter samtidigt,

- spara osäkra AI-observationer som permanent teknikminne,

- dela användarvideo med Atlas eller andra projekt utan mandat,

- lagra träningsvideo permanent som standard,

- använda privat video för global modellträning utan rätt grund,

- välja medieleverantör enbart efter största övningsantal,

- använda media med oklar licens,

- bli beroende av leverantörens privata identifierare,

- göra hela lanseringen beroende av egenproduktion av tusentals övningar,

- publicera råa eller preliminära resurser,

- låta samma agent skapa, godkänna och publicera högriskmaterial utan kontroll,

- fortsätta visa media efter att licensen upphört,

- sakna fallback när en leverantör är nere,

- ladda högsta kvalitet i alla situationer,

- ignorera batteri, datatrafik eller enhetsprestanda,

- göra automatisk uppspelning obligatorisk,

- sakna alternativ för minskad rörelse,

- använda externa spelare som visar reklam eller spårar användaren utan kontroll,

- behandla populärt media som tekniskt korrekt enbart på grund av användning,

- låta användarfeedback ersätta expertgranskning,

- eller ändra canonical media direkt i main eller produktion utan branch, tester, kvalitetsgate och godkännande.

15.200 KANONISKA BESLUT FRÅN KAPITEL 15

Följande beslut etableras:

1. GainPilot ska ha en canonical mediaarkitektur.

2. Varje medieresurs ska ha en stabil identitet.

3. Media ska kopplas till exakt canonical övning och variant.

4. Filnamn och URL får inte vara canonical identitet.

5. Varje resurs ska ha ett definierat instruktionellt syfte.

6. Prioriterade övningar ska ha en huvuddemonstration.

7. Komplexa övningar ska kunna ha fördjupad teknikdemonstration.

8. Media ska visa tydlig startposition.

9. Media ska visa relevant rörelsebana.

10. Media ska visa slutposition när sådan finns.

11. Rörelser ska kunna delas upp i pedagogiska faser.

12. Tempo och paus ska kunna visualiseras.

13. Andningsinstruktioner ska vara försiktiga och kontextuella.

14. GainPilot ska stödja flera kameravinklar.

15. Varje övning ska ha en rekommenderad huvudvinkel.

16. Användaren ska kunna byta kameravinkel.

17. Komplexa rörelser ska på sikt kunna ha synkroniserade vinklar.

18. Detaljvyer ska kunna visa grepp, fotposition och utrustning.

19. GainPilots avatar får vara stiliserad men ska vara anatomiskt begriplig.

20. Stilisering får inte förändra rörelsens teknik.

21. En enda avatar ska inte framställas som representation av alla kroppar.

22. GainPilot ska på sikt stödja visuell kroppsmångfald.

23. Kläder ska göra ledpositioner synliga.

24. Övningsavataren behöver inte föreställa Arnold.

25. Arnold ska kunna synas genom text, röst och diskret coachgränssnitt.

26. GainPilots visuella miljö får vara mörk och levande.

27. Bakgrunden får inte konkurrera med kroppen eller utrustningen.

28. Ljussättning ska prioritera teknisk tydlighet.

29. Bakgrundsrörelse ska kunna stängas av.

30. Huvudanimationer ska loopas sömlöst när det passar rörelsen.

31. Användaren ska kunna ändra uppspelningshastighet.

32. Automatisk uppspelning ska vara valbar.

33. Minskad rörelse ska ge stillbild eller stegsekvens.

34. GainPilot ska kunna visa primära, sekundära och stabiliserande muskler.

35. Muskelmarkeringar ska beskrivas som pedagogiska förenklingar.

36. Muskelinformation får inte vara beroende endast av färg.

37. GainPilot ska kunna visa diskreta rörelsemarkörer.

38. Exakta ledvinklar ska endast visas när de är relevanta och korrekt kontextualiserade.

39. Redskapsbanor ska vara variantkorrekta.

40. Fotplacering och grepp ska kunna visas med tillåten individuell variation.

41. Maskininställning ska kunna visualiseras.

42. Maskinmedia ska kunna kopplas till maskinidentitet när modellen är leverantörsspecifik.

43. Säkerhetsutrustning ska visas där den är relevant.

44. GainPilot ska kunna visa passarteknik där sådan behövs.

45. Vanliga fel ska ha egen identitet och granskningsstatus.

46. Felanimationer ska vara tydligt markerade.

47. Rätt-och-fel-jämförelser ska fokusera på ett problem i taget.

48. Varje fel ska ha ett enkelt korrigerande fokus.

49. Teknikvariation ska inte automatiskt märkas som fel.

50. Progressioner och regressioner ska kopplas till övningsgrafen.

51. Regressioner ska presenteras som fullvärdiga alternativ.

52. Calisthenics ska kunna använda parallella visuella progressionsspår.

53. CrossFitmedia ska stödja scaling och rörelsestandard.

54. Konditionsmaskiner ska ha domänspecifika demonstrationer.

55. Löpmedia ska undvika löften om en enda perfekt teknik.

56. Rörlighetsmedia ska inte uppmuntra träning genom skarp smärta.

57. GainPilot ska kunna använda filmad människa, 3D och andra mediatyper.

58. 3D ska inte antas vara tekniskt korrekt utan granskning.

59. Motion capture ska använda kvalificerad utövare och definierad standard.

60. Retargetad rörelse ska granskas.

61. Handanimering ska bygga på tekniska referenser.

62. Realtidsrenderad 3D ska ha fallback.

63. Förhandsrenderad video får användas som första huvudsakliga produktionsformat.

64. Lättare animationsformat ska användas där de passar.

65. Generativ AI-video får inte publiceras som canonical utan fullständig granskning.

66. AI ska främst användas för styling, lokalisering och effektivisering.

67. AI-styling får inte förändra rörelsedatan.

68. AI-lokaliserad säkerhets- och tekniktext ska granskas.

69. Syntetisk röst ska vara valbar.

70. Viktig information ska fungera utan ljud.

71. Varje P0-övning ska ha kort textinstruktion.

72. Fördjupad text ska kunna visas steg för steg.

73. Snabbvyn ska begränsa antalet teknikpunkter.

74. Övningsvyn ska kunna besvara vanliga frågor.

75. Systemet ska vara försiktigt med var en övning ska kännas.

76. GainPilot ska stödja nybörjar-, avancerat- och snabbläge.

77. Förstagångsvy ska kunna ge mer instruktion.

78. Instruktion ska inte upprepas i onödan.

79. Bekräftade personliga teknikfokus ska kunna kommas ihåg.

80. Användarens egna tekniknoteringar ska vara privata som standard.

81. Tränarens instruktion ska ha tydlig källa.

82. Professionella begränsningar ska kunna påverka media och rörelseomfång.

83. Personlig videoanalys ska vara valbar och osäkerhetsmarkerad.

84. Videoanalys ska kräva tillräcklig kamerakvalitet.

85. Lokal videoanalys ska föredras när den ger tillräcklig funktion.

86. Molnanalys ska kräva tydlig information och godkännande.

87. Privat video ska normalt raderas efter analys.

88. Atlas ska inte automatiskt få tillgång till träningsvideo.

89. Skärmbilder ska behandlas som privat media.

90. Externa medieleverantörer ska bedömas genom leverantörsmatris.

91. Licens ska lagras strukturerat.

92. Attribution ska följa resursen.

93. GainPilot ska undvika leverantörsinlåsning.

94. Varje leverantör ska integreras genom adapter.

95. GainPilot ska använda ett hybridbibliotek.

96. Eget material ska prioriteras för P0-övningar och komplexa rörelser.

97. Första produktionen kan fokusera på cirka 20–30 centrala övningar.

98. Slutligt P0-urval ska styras av canonical programinventering.

99. Media ska prioriteras genom P0–P4.

100. Täckning ska mätas per innehållstyp och inte endast per övning.

101. P0-övningar ska ha ett minsta publicerbart mediepaket.

102. Medieresurser ska ha tydlig produktions- och publiceringsstatus.

103. Teknisk, redaktionell, licens- och tillgänglighetsgranskning ska vara separata kontroller.

104. Högriskmedia ska kunna kräva fyraögonsprincip.

105. Ett internt kvalitetsscore får användas som stöd.

106. Media och metadata ska versioneras.

107. Filer ska kunna ha checksumma.

108. Media ska kunna avpubliceras utan att historiken förstörs.

109. GainPilot ska ha fallbackordning.

110. Licensutgång ska övervakas.

111. Leverantörsavbrott ska inte krascha träningspasset.

112. Media ska levereras genom versionsstyrd distributionsmodell.

113. Kvaliteten ska anpassas efter nätverk och enhet.

114. Canonical identitet ska vara oberoende av filformat.

115. Dagens media ska kunna förladdas.

116. Offlinepaket ska respektera licens.

117. Cache ska vara versionsstyrd och kunna invalidieras.

118. Mediauppspelning ska optimeras för snabb start.

119. Realtidsrendering ska kunna använda energisparläge.

120. Användaren ska kunna begränsa datatrafik.

121. Mediasökning ska använda canonical övningsgraf.

122. Automatiska previews ska vara valbara.

123. Användaren ska kunna spara demonstrationer.

124. Personligt teknikbibliotek ska isoleras från canonical media.

125. Delning ska respektera licens och privatstatus.

126. GainPilot ska undvika externa spelare med okontrollerad reklam eller spårning.

127. Media ska kunna lokaliseras utan att duplicera canonical rörelse.

128. GainPilot ska stödja svenska och etablerade engelska övningsnamn.

129. Talad instruktion ska ha undertexter.

130. Media ska ha meningsfull skärmläsarbeskrivning.

131. Webbmedia ska kunna styras med tangentbord.

132. Blinkande och överdrivna effekter ska undvikas.

133. Gränssnittet ska begränsa kognitiv belastning.

134. Minderåriga ska kräva separat medie- och säkerhetsmodell.

135. Medicinskt eller rehabiliteringsnära innehåll ska ha särskild governance.

136. Säkerhetstext ska vara konkret och övningsspecifik.

137. Canonical instruktion ska ha känd ägare och källa.

138. Användaren ska kunna rapportera mediefel.

139. Allvarliga fel ska kunna avpubliceras snabbt.

140. Användarfeedback ska inte ersätta teknisk granskning.

141. Beteendesignaler får användas för produktförbättring men inte automatisk teknikdiagnos.

142. A/B-testning ska begränsas till lågriskpresentation.

143. Atlas ska stödja analys och omvärldsbevakning utan direkt publiceringsrätt.

144. Arnold ska välja relevant media och detaljnivå.

145. Hermes ska styra privat mediaåtkomst.

146. GainPilot ska ha en fullständig produktionspipeline.

147. Varje produktion ska börja med instruktionell specifikation.

148. Granskade referenser ska användas.

149. Komplex media ska kunna använda storyboard.

150. Råproduktion ska hållas separat från publicerad media.

151. Produktionskällor ska bevaras för korrigering och ny rendering.

152. Automatisk fil- och metadatavalidering ska användas.

153. Rörelse-, utrustnings-, anatomi- och loopfel ska kunna upptäckas genom kontroller.

154. Teknisk review ska dokumenteras.

155. Publiceringsgodkännande ska ange version och användningsscope.

156. GainPilot ska kunna genomföra rollback.

157. Medieincidenter ska ha definierad incidentprocess.

158. Säkerhetsfarlig media ska avpubliceras omedelbart.

159. Privat mediaexponering ska behandlas som allvarlig integritetsincident.

160. Backup och arkiv ska följa licens och retention.

161. Media ska kunna raderas från cache och derivat när policy kräver det.

162. Mediaarkitekturen ska testas genom tekniska, visuella, tillgänglighets-, licens-, säkerhets- och prestandatester.

163. Flera enhets- och nätverksförhållanden ska testas.

164. Canonical teknik ska användartestas och expertgranskas.

165. Medieleverans ska vara observerbar och auditerbar.

166. Förändringar av mediaarkitektur och canonical innehåll ska ske på separat branch eller kontrollerad produktionsgren.

167. Publicering ska kräva tester, quality gate och rätt godkännande.

168. Agentautonomi inom mediedomänen ska vara explicit, begränsad och återkallelig.

15.201 IMPLEMENTERINGSORDNING

GainPilots animerade övningsdemonstrationer och visuella teknikstöd ska implementeras stegvis.

Fas 1 — Canonical mediamodell

Implementera:

- mediaidentitet,

- canonical övningskoppling,

- variant,

- mediatyp,

- syfte,

- vinkel,

- språk,

- källa,

- licens,

- status,

- och version.

Fas 2 — Övningsinventering

Fastställ:

- första programmens övningar,

- P0-övningar,

- vanliga substitutioner,

- nybörjarövningar,

- och minsta mediepaket.

Fas 3 — Leverantörsmatris

Jämför externa bibliotek utifrån:

- täckning,

- kvalitet,

- licens,

- API,

- white-label,

- kostnad,

- och leverantörsinlåsning.

Fas 4 — Första hybridbiblioteket

Implementera:

- licensierat grundmaterial,

- canonical adapter,

- metadata,

- fallback,

- och publiceringsstatus.

Fas 5 — Text och teknikpunkter

Implementera för P0:

- kort textinstruktion,

- startposition,

- rörelse,

- slutposition,

- teknikpunkter,

- och grundläggande säkerhetstext.

Fas 6 — Huvuddemonstrationer

Publicera P0-media med:

- huvudvinkel,

- sömlös loop,

- rätt variant,

- korrekt utrustning,

- teknisk review,

- och licensstatus.

Fas 7 — Aktiv passintegration

Implementera:

- övningskort,

- preview,

- uppspelning,

- paus,

- hastighet,

- fullskärm,

- och textfallback.

Fas 8 — Tillgänglighet

Implementera:

- undertexter,

- skärmläsartext,

- minskad rörelse,

- tangentbordsstyrning,

- kontrast,

- och färgoberoende markeringar.

Fas 9 — Flera vinklar

Implementera för prioriterade övningar:

- sida,

- snett framifrån,

- framifrån,

- vinkelväxling,

- och synkroniserad fas där möjligt.

Fas 10 — Muskelmarkeringar

Implementera:

- primära muskler,

- sekundära muskler,

- av- och påslag,

- textförklaring,

- och tillgänglig markering.

Fas 11 — Vanliga fel

Implementera:

- felidentitet,

- tydlig märkning,

- rätt-och-fel-jämförelse,

- korrigerande fokus,

- och granskningsstatus.

Fas 12 — Progressioner och regressioner

Koppla media till:

- övningsgraf,

- förkunskapskrav,

- kvalitetskriterier,

- och användarens aktuella nivå.

Fas 13 — Egen 3D-pipeline

Implementera:

- avatar,

- rigg,

- utrustning,

- miljö,

- motion capture eller handanimation,

- rendering,

- teknisk review,

- och produktionsarkiv.

Fas 14 — Realtidsrendering

Implementera först efter prestandagranskning:

- roterbar modell,

- zoom,

- vinkel,

- muskelmarkering,

- hastighet,

- och förhandsrenderad fallback.

Fas 15 — Personligt teknikbibliotek

Implementera:

- privat video,

- tränarfeedback,

- tekniknotering,

- retention,

- och delning.

Fas 16 — Videoanalys

Implementera först efter särskild integritets- och kvalitetsgranskning:

- aktiv kamerastart,

- kvalitetskontroll,

- lokal analys där möjligt,

- osäkerhetsmarkering,

- jämförelse,

- och radering efter uppgift.

Fas 17 — CrossFit och calisthenics

Implementera:

- scaling,

- rörelsestandard,

- no-rep-exempel,

- skills,

- progressioner,

- assistans,

- och tekniska kvalitetskriterier.

Fas 18 — Fördjupad konditionsmedia

Implementera:

- roddmaskin,

- SkiErg,

- cykling,

- löpning,

- intervallförklaringar,

- och utrustningsinställning.

Fas 19 — Full produktionsautomation

Implementera:

- instruktionell specifikation,

- produktionskö,

- automatisk filvalidering,

- metadata,

- checksumma,

- visuella regressionstester,

- och publiceringsgate.

Fas 20 — Fördjupad Atlas-analys

Implementera:

- medietäckning,

- licensbevakning,

- felmönster,

- leverantörsrisk,

- produktionsprioritering,

- och kontrollerade förbättringsförslag.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller produktionsgren,

- produktion eller implementation,

- teknisk granskning,

- redaktionell granskning,

- tillgänglighetsgranskning,

- licenskontroll,

- tester,

- pull request,

- publiceringsgodkännande,

- kontrollerad merge och distribution,

- och resultatuppföljning.

15.202 FRAMGÅNGSKRITERIER

Kapitel 15:s vision är framgångsrikt realiserad när:

- varje prioriterad övning har rätt canonical mediaidentitet,

- media alltid kopplas till rätt övningsvariant,

- användaren snabbt kan förstå startposition och rörelsebana,

- huvuddemonstrationer fungerar i liten mobilvy,

- animationer loopar utan störande hopp,

- användaren kan pausa och ändra hastighet,

- flera vinklar finns där de faktiskt tillför värde,

- teknikpunkter är korta och begripliga,

- fördjupad information kan öppnas separat,

- muskelmarkeringar är pedagogiska och tillgängliga,

- individuell variation inte felklassificeras,

- felanimationer tydligt skiljs från rätt utförande,

- progressioner och regressioner är kopplade till övningsgrafen,

- CrossFit-scaling visas med rätt workoutfunktion,

- calisthenicsfärdigheter kan visas genom flera utvecklingsspår,

- konditionsmaskiner har korrekt rörelsesekvens,

- GainPilot kan kombinera externt och eget material,

- systemet inte är fullständigt beroende av en leverantör,

- alla externa resurser har verifierad licens,

- P0-övningarna har ett fullständigt minsta mediepaket,

- GainPilot kan lansera med ett fokuserat första urval utan att vänta på tusentals övningar,

- AI används för effektivisering utan att få definiera biomekaniken,

- motion capture och retargeting granskas,

- media genomgår teknisk, redaktionell, licens- och tillgänglighetsgranskning,

- högriskmaterial kräver flera godkännanden,

- felaktig media kan avpubliceras omedelbart,

- fallback finns när media eller leverantör saknas,

- uppspelningen fungerar på svagare enheter,

- användaren kan begränsa datatrafik,

- dagens media kan användas offline,

- minskad rörelse och textalternativ fungerar,

- talad instruktion har undertexter,

- privat användarvideo är isolerad,

- användaren styr om video sparas eller raderas,

- Atlas inte automatiskt får tillgång till privat media,

- användaren kan rapportera fel,

- systemet kan mäta täckning, prestanda och kvalitet,

- mediaarkitekturen är versionerad och auditerbar,

- och alla förbättringar genomförs genom separat branch eller produktionsgren, tester, kvalitetssäkring, pull request och kontrollerad publicering.

15.203 SAMMANFATTNING

GainPilots animerade övningsdemonstrationer ska göra träning enklare att förstå utan att skapa falsk säkerhet.

Det visuella systemet ska hjälpa användaren se:

- hur övningen börjar,

- hur kroppen och redskapet rör sig,

- hur repetitionen avslutas,

- vilka teknikpunkter som är viktigast,

- och hur övningen skiljer sig från närliggande varianter.

Media ska alltid kopplas till:

- rätt canonical övning,

- rätt variant,

- rätt teknikstandard,

- och rätt programfunktion.

GainPilot får inte visa en ungefärligt liknande övning som om den vore identisk.

Den visuella riktningen får vara:

- mörk,

- modern,

- levande,

- och tydligt GainPilot.

Bakgrunden, ljuset och effekterna får aldrig göra rörelsen svårare att se.

Teknisk korrekthet ska alltid väga tyngre än visuell effekt.

GainPilot ska kunna använda:

- filmad mänsklig video,

- 3D-animation,

- motion capture,

- handanimation,

- realtidsrendering,

- förhandsrenderad video,

- stillbilder,

- och text.

Ingen mediatyp ska användas enbart för att den är tekniskt imponerande.

Formatet ska väljas efter användarens behov.

AI ska kunna stödja:

- styling,

- bakgrunder,

- lokalisering,

- undertexter,

- rendering,

- och produktion.

AI får inte ensam definiera:

- ledposition,

- grepp,

- utrustningskontakt,

- rörelsebana,

- eller canonical teknik.

All rörelsedata ska genomgå relevant teknisk granskning.

GainPilot ska börja fokuserat.

Ett första bibliotek med cirka 20–30 centrala övningar kan ge större produktvärde än ett stort men svagt granskat bibliotek.

Urvalet ska styras av:

- första programmen,

- vanligaste substitutionsbehoven,

- nybörjarstödet,

- och övningsgrafens prioriteringar.

GainPilot ska använda en hybridmodell.

Licensierat material kan ge snabb bredd.

Eget material ska ge:

- varumärkesidentitet,

- teknisk kontroll,

- och stöd för övningar som saknas eller kräver större kvalitet.

Calisthenics och CrossFit kommer sannolikt kräva mer egen och domänspecifik produktion än vanliga gymövningar.

Varje medieresurs ska ha:

- identitet,

- källa,

- licens,

- version,

- teknisk granskningsstatus,

- redaktionell status,

- och publiceringsstatus.

Media ska kunna:

- avpubliceras,

- ersättas,

- återställas,

- och distribueras genom fallback

utan att hela produkten behöver uppdateras.

Användaren ska kunna:

- spela,

- pausa,

- ändra hastighet,

- byta vinkel,

- stänga av animation,

- använda text,

- och välja minskad rörelse.

All viktig information ska fungera utan ljud.

Muskelmarkeringar ska vara pedagogiska och valbara.

De får inte presenteras som exakt biologisk mätning.

Vanliga fel ska visas försiktigt.

GainPilot ska skilja mellan:

- tydligt teknikfel,

- individuell variation,

- och omdebatterad eller osäker fråga.

Personlig videoanalys ska vara valbar.

Användaren ska veta:

- när kameran används,

- vad som analyseras,

- om materialet laddas upp,

- och när det raderas.

Privat video ska inte automatiskt delas med Atlas, andra projekt eller produktanalys.

Hermes ska kontrollera all sådan åtkomst.

Arnold ska vara den coach som använder media i rätt ögonblick.

Han ska inte överbelasta användaren med en full teknisk föreläsning mellan varje set.

Under passet ska han normalt visa:

- en kort loop,

- några få teknikpunkter,

- och möjlighet till fördjupning.

Atlas ska hjälpa GainPilot identifiera:

- täckningsluckor,

- felrapporter,

- licensrisker,

- leverantörsproblem,

- och nästa produktionsprioritet.

Atlas får inte direkt skapa och publicera canonical teknikmaterial.

Alla förändringar av mediearkitektur, rörelsedata, tekniktext, licens, canonical koppling och publiceringsregler ska ske genom:

- definierat scope,

- separat branch eller produktionsgren,

- tydlig specifikation,

- produktion,

- teknisk granskning,

- redaktionell granskning,

- tillgänglighetsgranskning,

- licenskontroll,

- tester,

- pull request,

- publiceringsgodkännande,

- kontrollerad distribution,

- och uppföljning.

Kapitel 15 etablerar därmed följande kärnprincip:

GainPilot ska inte fylla övningsbiblioteket med så många animationer som möjligt. Plattformen ska bygga ett canonical, granskat och visuellt konsekvent demonstrationssystem där varje rörelse hjälper användaren förstå exakt vad som ska göras — med modern design och stark AI-assistans i produktionen, men med mänskligt verifierad teknik, tydliga rättigheter och användarens säkerhet som absoluta kvalitetsgränser.
