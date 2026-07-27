# Kapitel 10 — Övningsgrafen och substitutionsmotorn

GainPilots övningssystem ska vara mer än ett sökbart bibliotek med övningsnamn, bilder och muskelgrupper.

Det ska vara en strukturerad kunskapsmodell som gör det möjligt för GainPilot att förstå:

- vad en övning faktiskt är,

- vilket syfte den fyller,

- vilka rörelser och muskler den belastar,

- vilken utrustning den kräver,

- vilken teknisk nivå den förutsätter,

- vilka risker eller begränsningar som kan vara relevanta,

- hur den kan utvecklas,

- och vilka andra övningar som kan ersätta den i en viss situation.

Denna kunskapsmodell ska representeras genom GainPilots canonical övningsgraf.

Övningsgrafen ska koppla samman:

- övningar,

- varianter,

- rörelsemönster,

- muskler,

- utrustning,

- färdigheter,

- progressioner,

- regressioner,

- substitutionsrelationer,

- programfunktioner,

- träningsdomäner,

- teknikstandarder,

- och visuellt instruktionsmaterial.

Substitutionsmotorn ska använda grafen för att hjälpa användaren byta övning utan att programmets syfte förstörs.

Ett övningsbyte ska inte endast besvara frågan:

Vilken annan övning tränar samma muskel?

Det ska besvara:

Vilken övning är det bästa alternativet i den aktuella användarens situation, med hänsyn till varför bytet behövs, vilket mål övningen stödjer och vad resten av programmet redan innehåller?

En ersättningsövning kan vara lämplig vid:

- upptagen utrustning,

- saknad utrustning,

- tidsbrist,

- teknisk osäkerhet,

- användarpreferens,

- tillfällig variation,

- lokal trötthet,

- smärta eller obehag,

- resor,

- hemmaträning,

- eller en planerad progression eller regression.

Samma ersättning är inte rätt i alla dessa situationer.

Arnold ska göra bytet snabbt och begripligt för användaren.

Atlas ska kunna hjälpa med research, källgranskning, datakvalitet och analys av övningsbiblioteket.

Hermes ska säkerställa att endast relevant användar- och Omnira-kontext används.

Alla övningsrelationer, substitutioner och progressioner ska vara versionshanterade, kvalitetsklassificerade och möjliga att granska.

Grundprincipen är:

GainPilot ska inte bara känna till övningar. Plattformen ska förstå deras funktion, relationer, begränsningar och plats i användarens program.

10.1 ÖVNINGEN SOM STRUKTURERAD KUNSKAPSENHET

Varje övning ska representeras som en strukturerad kunskapsenhet.

En canonical övningspost ska minst kunna innehålla:

- stabil övningsidentitet,

- canonical namn,

- lokala visningsnamn,

- vanliga synonymer,

- beskrivning,

- träningsdomän,

- rörelsemönster,

- primära muskler,

- sekundära muskler,

- stabiliserande krav,

- utrustning,

- startposition,

- rörelsebana,

- slutposition,

- repetitionsdefinition,

- teknikpunkter,

- vanliga fel,

- svårighetsgrad,

- belastningsmöjlighet,

- trötthetsprofil,

- progressioner,

- regressioner,

- substitutionsrelationer,

- säkerhetsnoteringar,

- medieresurser,

- källor,

- licensstatus,

- granskningsstatus,

- och versionsinformation.

Övningsposten ska kunna användas av:

- programgeneratorn,

- träningsloggen,

- substitutionsmotorn,

- progressionmotorn,

- Arnold,

- Atlas,

- övningsdemonstrationerna,

- sökfunktionen,

- och externa integrationer.

Systemet får inte ha separata motstridiga övningsdefinitioner för olika funktioner.

10.2 CANONICAL ÖVNINGSIDENTITET

Varje övning ska ha en stabil canonical identitet som inte förändras när:

- språket ändras,

- visningsnamnet förbättras,

- en synonym läggs till,

- eller en extern datakälla använder ett annat namn.

Exempel:

Canonical identifierare:

barbell-bench-press

Svenskt namn:

Bänkpress med skivstång

Engelskt namn:

Barbell Bench Press

Vanliga synonymer:

Bänkpress

Bench press

Flat bench press

Visningsnamnet får ändras utan att användarens träningshistorik bryts.

Canonical identitet ska användas för:

- träningsresultat,

- programversioner,

- övningsrelationer,

- media,

- analyser,

- och importerad data.

10.3 ÖVNING OCH ÖVNINGSVARIANT

GainPilot ska skilja mellan en övning och dess varianter.

Varianter kan skilja sig genom:

- utrustning,

- grepp,

- stans,

- vinkel,

- tempo,

- rörelseomfång,

- paus,

- unilateral eller bilateral utförandeform,

- assistans,

- belastningsplacering,

- eller teknikstandard.

Exempel:

Bänkpress med skivstång är relaterad till:

- smal bänkpress,

- lutande bänkpress,

- pausad bänkpress,

- touch-and-go-bänkpress,

- hantelpress,

- och bröstpress i maskin.

Dessa övningar är inte identiska.

GainPilot ska kunna representera:

- familjetillhörighet,

- likheter,

- skillnader,

- och vilka programfunktioner de kan eller inte kan ersätta.

En variant ska få egen canonical identitet när skillnaden påverkar:

- programmering,

- progression,

- teknik,

- resultatjämförelse,

- eller substitutionsbeslut.

10.4 ÖVNINGSFAMILJER

När flera övningar delar ett tydligt fundament ska de kunna samlas i en övningsfamilj.

Exempel på familjer:

- bänkpressfamiljen,

- knäböjsfamiljen,

- marklyftsfamiljen,

- vertikala drag,

- horisontella roddar,

- utfallsvarianter,

- pull-up-varianter,

- handståendeprogressioner,

- och cykliska konditionsaktiviteter.

En övningsfamilj ska underlätta:

- sökning,

- analys,

- mediaproduktion,

- programvariation,

- och importnormalisering.

Familjetillhörighet får inte innebära att alla medlemmar är likvärdiga substitutioner.

10.5 RÖRELSEMÖNSTER

GainPilot ska kunna klassificera övningar efter rörelsemönster.

Exempel på övergripande rörelsemönster:

- horisontell press,

- vertikal press,

- horisontellt drag,

- vertikalt drag,

- knädominant rörelse,

- höftdominant rörelse,

- utfall eller split stance,

- armbågsflexion,

- armbågsextension,

- höftabduktion,

- höftadduktion,

- bålrotation,

- antirotation,

- bålflexion,

- bålextension,

- gång,

- löpning,

- cyklisk kondition,

- hopp,

- kast,

- bärande,

- och gymnastisk support.

En övning kan tillhöra flera rörelsemönster med olika styrka.

Exempel:

En thruster innehåller både:

- knädominant rörelse,

- vertikal press,

- och helkroppskoordination.

Rörelsemönster ska användas som en del av substitutionsanalysen men får inte ensamt avgöra den.

10.6 MUSKELMODELLEN

Övningsgrafen ska kunna koppla övningar till muskler och muskelgrupper.

Relationerna ska kunna klassificeras som:

- primär belastning,

- sekundär belastning,

- stabiliserande funktion,

- eller låg och kontextberoende involvering.

GainPilot ska inte använda en förenklad muskelmarkering som absolut biologisk sanning.

Muskelbelastningen kan påverkas av:

- teknik,

- anatomi,

- rörelseomfång,

- grepp,

- belastning,

- och utförande.

Muskelrelationer ska därför kunna ha:

- styrka,

- villkor,

- källa,

- och säkerhetsnivå.

Exempel:

Lutande hantelpress kan ha stark relation till:

- bröstmuskulatur,

- främre axel,

- och triceps.

Den exakta fördelningen ska inte presenteras med falsk precision.

10.7 TRÄNINGSFUNKTION

Varje övning i ett aktivt program ska ha en träningsfunktion.

Exempel på funktioner:

- primärt styrkelyft,

- huvudövning för hypertrofi,

- teknisk träning,

- muskelkomplettering,

- rörelsebalans,

- färdighetsträning,

- lokal uthållighet,

- konditionsarbete,

- uppvärmning,

- rehabiliteringsnära träning inom professionella instruktioner,

- eller valfri finisher.

Samma övning kan ha olika funktion i olika program.

Exempel:

Bänkpress kan vara:

- huvudlyft i ett styrkeprogram,

- hypertrofiövning i ett muskelbyggnadsprogram,

- kompletterande pressarbete i ett CrossFit-upplägg,

- eller teknikövning efter ett längre uppehåll.

Substitutionsmotorn måste förstå den aktiva funktionen.

Ett bra byte för hypertrofi är inte alltid ett bra byte för specificitet inför ett styrketest.

10.8 UTRUSTNINGSMODELLEN

GainPilot ska representera vilken utrustning en övning kräver.

Utrustning kan klassificeras som:

- obligatorisk,

- valbar,

- alternativ,

- eller miljöberoende.

Exempel:

Bänkpress med skivstång kan kräva:

- skivstång,

- viktskivor,

- bänk,

- och säker träningsmiljö.

Ett rack eller passare kan vara relevant beroende på utförande och belastning.

Utrustningsmodellen ska även kunna beskriva:

- maskintyp,

- kabelposition,

- handtag,

- höjd,

- motståndsband,

- ringar,

- räcke,

- pull-up-stång,

- och konditionsmaskin.

GainPilot ska skilja mellan:

- användaren saknar utrustningen permanent,

- utrustningen är tillfälligt upptagen,

- utrustningen är trasig,

- och användaren tränar i en tillfällig miljö.

10.9 MILJÖ

Övningar ska kunna kopplas till träningsmiljöer.

Exempel:

- kommersiellt gym,

- hemmagym,

- CrossFit-box,

- calisthenicspark,

- utomhus,

- hotellgym,

- bostad,

- eller arbetsplats.

Miljön kan påverka:

- säkerhet,

- utrymme,

- underlag,

- möjlighet att släppa vikter,

- ljud,

- väder,

- och tillgänglig utrustning.

En övning som tekniskt kräver få redskap kan ändå vara olämplig i en viss miljö.

Exempel:

Hopp eller tyngdlyftning kan vara olämpligt i ett hotellrum trots att användaren har ett motstånd tillgängligt.

10.10 SVÅRIGHETSGRAD

Övningens svårighetsgrad ska kunna beskrivas genom flera komponenter.

Exempel:

- teknisk komplexitet,

- balanskrav,

- rörlighetskrav,

- styrkekrav,

- koordination,

- hastighet,

- och risk vid misslyckande.

GainPilot ska inte använda en enda global etikett som fullständig beskrivning.

En övning kan vara:

- enkel att förstå men tung att belasta,

- tekniskt komplex men låg i extern belastning,

- eller enkel för en erfaren användare men olämplig för en nybörjare.

Svårighetsbedömningen ska kopplas till användarens erfarenhet per domän.

10.11 TEKNISKA FÖRKUNSKAPER

Övningsgrafen ska kunna representera förkunskapskrav.

Exempel:

En muscle-up kan kräva tillräcklig kapacitet inom:

- strikt dragstyrka,

- explosivt drag,

- supportposition,

- övergångsteknik,

- och relevant utrustning.

En olympisk lyftvariant kan kräva:

- grundposition,

- dragteknik,

- mottagningsposition,

- och tillräcklig rörelsekontroll.

Förkunskapsrelationer ska användas för:

- programgenerering,

- progression,

- teknikstöd,

- och säkerhetsbedömning.

GainPilot ska inte anta att användaren är redo för en slutövning enbart för att den valts som mål.

10.12 BELASTNINGSMÖJLIGHET

Övningar ska kunna beskrivas utifrån hur de kan belastas och följas över tid.

Exempel:

- enkel viktökning,

- små eller stora belastningssteg,

- repetitionsprogression,

- tidsprogression,

- assistansprogression,

- tempo,

- rörelseomfång,

- eller variantprogression.

En maskin kan erbjuda enkel och stabil belastningsprogression.

En balanskrävande fri övning kan begränsas av stabilitet innan målmuskeln når hög belastning.

Substitutionsmotorn ska ta hänsyn till om programmet behöver:

- hög belastningskapacitet,

- enkel progression,

- teknisk specificitet,

- eller låg trötthetskostnad.

10.13 TRÖTTHETSPROFIL

Övningsgrafen ska kunna beskriva övningars typiska trötthetsprofil.

Det kan exempelvis omfatta:

- lokal muskeltrötthet,

- systemisk trötthet,

- grepptrötthet,

- ryggbelastning,

- stabilitetskrav,

- och återhämtningstid.

Trötthetsprofilen ska inte presenteras som en exakt universalvärdering.

Den ska kunna påverkas av:

- belastning,

- volym,

- teknik,

- användarnivå,

- och placering i passet.

Exempel:

En bröststödd rodd kan i många situationer ge lägre belastning på ländryggen än en framåtlutad skivstångsrodd.

Det kan göra den lämplig när ryggtrötthet behöver begränsas.

Det betyder inte att den alltid är bättre.

10.14 STABILITETSKRAV

GainPilot ska kunna beskriva hur mycket stabilitet en övning kräver.

Stabilitetskrav kan påverka:

- teknisk svårighet,

- belastningsmöjlighet,

- målmuskelns begränsning,

- och lämplighet vid trötthet.

Exempel:

En sittande maskinpress har normalt lägre stabilitetskrav än stående press med fria vikter.

Det kan vara en fördel när målet är lokal muskelbelastning eller när användaren behöver enklare teknik.

Det kan vara en nackdel om programmet specifikt tränar stående kontroll och stabilitet.

10.15 RÖRELSEOMFÅNG

Övningsgrafen ska kunna representera:

- normalt rörelseomfång,

- begränsad variant,

- förlängd variant,

- och användarspecifik tillåten rörelse.

Rörelseomfång kan påverkas av:

- teknikstandard,

- utrustning,

- rörlighet,

- kroppskontroll,

- och professionella begränsningar.

Två övningar med samma namn men olika rörelseomfång kan behöva särskiljas vid resultatjämförelse.

Substitutionsmotorn ska även förstå när ett alternativ förändrar den belastade delen av rörelsen.

10.16 TEMPO OCH PAUS

Tempo och paus ska kunna representeras som delar av övningsutförandet.

Exempel:

- kontrollerad excentrisk fas,

- paus i botten,

- paus i toppläge,

- explosiv koncentrisk fas,

- eller statisk hålltid.

En tempo- eller pausvariant kan ha annan:

- teknisk funktion,

- svårighetsgrad,

- belastningsnivå,

- och progressionsmodell

än standardvarianten.

GainPilot ska inte automatiskt jämföra resultaten som identiska.

10.17 UNILATERALA OCH BILATERALA ÖVNINGAR

GainPilot ska skilja mellan unilateral och bilateral träning.

Ett byte mellan dem kan påverka:

- balans,

- tidsåtgång,

- belastning,

- stabilitet,

- koordinationskrav,

- och lokal muskelbelastning.

Exempel:

Bulgariska split squats kan ersätta delar av ett knädominant arbete men är inte fullständigt likvärdiga med tung bilateral knäböj.

Substitutionsmotorn ska förklara skillnaden när den är relevant.

10.18 ÖPPEN OCH STÄNGD KEDJA

GainPilot kan representera om en övning huvudsakligen sker i:

- öppen kinetisk kedja,

- stängd kinetisk kedja,

- eller en blandad struktur.

Denna egenskap får inte användas som en enkel kvalitetsrangordning.

Den kan vara relevant vid:

- färdighetsprogression,

- substitutionsanalys,

- och specifika professionella instruktioner.

Systemet ska undvika att använda biomekaniska etiketter utan praktisk betydelse för beslutet.

10.19 DOMÄNSPECIFIK ÖVNINGSMODELL

Övningsgrafen ska stödja flera träningsdomäner.

Minst följande domäner ska kunna representeras:

- styrketräning,

- hypertrofi,

- styrkelyft,

- olympiska lyft,

- CrossFit,

- calisthenics,

- kondition,

- rörlighet,

- och uppvärmning.

Samma aktivitet kan förekomma i flera domäner.

Domäntillhörigheten ska inte duplicera övningen om rörelsen faktiskt är densamma.

I stället ska grafen kunna beskriva:

- användningssätt,

- regler,

- och teknikstandard per domän.

10.20 CROSSFIT-RÖRELSER

CrossFit kräver stöd för rörelser som kan förekomma i:

- styrkedel,

- teknikdel,

- workout,

- komplex,

- eller tävlingsstandard.

Övningsgrafen ska kunna beskriva:

- rörelsestandard,

- repetitionsdefinition,

- no-rep-kriterier,

- scaling,

- utrustningskrav,

- och relation till workoutformat.

Exempel:

Pull-up kan förekomma som:

- strikt pull-up,

- kipping pull-up,

- butterfly pull-up,

- chest-to-bar,

- eller assisterad variant.

Dessa rörelser ska inte behandlas som samma övning enbart för att de delar dragmönster.

10.21 CALISTHENICS-FÄRDIGHETER

Calisthenics ska representeras genom färdighetsgrafer.

En färdighetsgraf ska kunna innehålla:

- slutmål,

- förkunskapskrav,

- progressioner,

- regressioner,

- assistansnivåer,

- teknikstandard,

- kvalitetskriterier,

- och möjliga sidovägar.

Progressionsvägen behöver inte vara helt linjär.

Exempel:

En användare kan utveckla handstående genom parallella spår för:

- axelstyrka,

- linje,

- balans,

- handledstolerans,

- och ingångsteknik.

GainPilot ska kunna identifiera vilken del som sannolikt begränsar nästa steg.

10.22 KONDITIONSAKTIVITETER

Konditionsaktiviteter ska också ingå i rörelse- och aktivitetsgrafen.

Exempel:

- promenad,

- löpning,

- cykling,

- roddmaskin,

- SkiErg,

- assault bike,

- simning,

- och trappmaskin.

Relationer kan beskriva:

- liknande energisystem,

- lägre eller högre stötbelastning,

- lokal muskelbelastning,

- tillgänglig utrustning,

- och lämplighet som substitution.

Exempel:

Cykling kan i vissa situationer ersätta ett lågintensivt löppass när användaren behöver minska stötbelastning.

Det är inte en fullständigt identisk träningsstimulus.

10.23 PROGRESSIONER

En progressionsrelation ska beskriva att en övning eller variant kan vara ett rimligt nästa steg från en annan.

Relationen ska kunna innehålla:

- förkunskapskrav,

- framgångskriterier,

- rekommenderad exponering,

- risknivå,

- och granskningsstatus.

Exempel:

Assisterad pull-up

→ Strikt pull-up

Övergången kan kräva:

- viss repetitionskapacitet,

- kontroll i hela rörelseomfånget,

- och möjlighet att genomföra rörelsen utan oönskad kompensation.

Progression ska inte ske enbart för att en viss tid har gått.

10.24 REGRESSIONER

En regression ska vara en enklare eller mer tillgänglig variant som bevarar en relevant del av rörelsens funktion.

Regressioner kan användas när:

- användaren är nybörjare,

- tekniken inte är tillräcklig,

- kapaciteten tillfälligt minskat,

- utrustning saknas,

- eller återgång sker efter uppehåll.

En regression ska inte beskrivas som ett misslyckande.

Arnold kan säga:

Vi använder en lättare variant för att träna samma rörelsekontroll med bättre kvalitet. När kriterierna är uppfyllda går vi vidare igen.

10.25 SIDOSTEG I PROGRESSIONEN

Alla förändringar är inte framåt eller bakåt.

GainPilot ska kunna representera sidosteg.

Ett sidosteg kan vara:

- annan övning med liknande svårighetsgrad,

- teknikvariant,

- alternativ utrustning,

- eller variation som tränar samma färdighet från annan vinkel.

Sidosteg kan vara relevanta för:

- variation,

- överbelastningshantering,

- miljöbyte,

- eller kompletterande utveckling.

De får inte automatiskt presenteras som progression.

10.26 SUBSTITUTIONSRELATIONER

En substitutionsrelation ska beskriva när en övning kan ersätta en annan.

Relationen ska aldrig vara en enkel binär etikett utan kontext.

Den ska kunna innehålla:

- substitutionsgrad,

- bevarad funktion,

- förlorad funktion,

- användningsvillkor,

- förbjudna villkor,

- utrustningskrav,

- tidskonsekvens,

- trötthetskonsekvens,

- och kvalitetsstatus.

Exempel:

Bröststödd hantelrodd kan vara ett starkt alternativ till sittande kabelrodd när:

- kabelstationen är upptagen,

- användaren har hantlar och bänk,

- och programmets mål är horisontellt drag med begränsad ländryggsbelastning.

Relationen kan vara svagare om programmet specifikt tränar kabelns kontinuerliga belastningsprofil.

10.27 SUBSTITUTIONSGRAD

GainPilot ska kunna klassificera substitutionsrelationer.

Exempel på nivåer:

- nästan likvärdig,

- starkt alternativ,

- acceptabel kompromiss,

- tillfälligt nödalternativ,

- eller olämplig substitution.

Nivån ska alltid förstås i relation till en viss funktion.

En övning kan vara nästan likvärdig för muskelbyggnad men olämplig för tävlingsspecificitet.

Arnold ska kunna förklara:

Det här är ett bra tillfälligt alternativ för bröstträningen, men det ersätter inte bänkpressens specifika teknikträning.

10.28 ORSAKEN TILL BYTET

Substitutionsmotorn ska alltid ta hänsyn till orsaken till bytet.

Vanliga orsaker:

- utrustningen är upptagen,

- utrustningen saknas,

- användaren har ont,

- övningen känns obekväm,

- användaren ogillar övningen,

- tekniken är för svår,

- passet måste kortas,

- användaren vill ha variation,

- aktuell lokal trötthet,

- eller professionell instruktion.

Orsaken ska påverka både:

- vilka alternativ som får visas,

- och om bytet får vara tillfälligt eller permanent.

Ett alternativ vid upptagen utrustning får inte automatiskt användas vid smärta.

10.29 UTRUSTNINGEN ÄR UPPTAGEN

När utrustningen tillfälligt är upptagen ska GainPilot prioritera ett snabbt och praktiskt byte.

Motorn ska kunna ta hänsyn till:

- tillgänglig utrustning i närheten,

- programmets funktion,

- passets ordning,

- tidsåtgång,

- och om användaren kan återgå till originalövningen senare.

Möjliga lösningar kan vara:

- tillfällig substitution,

- ändrad övningsordning,

- eller väntetid om övningen är högt prioriterad.

Arnold ska kunna säga:

Kabelstationen är upptagen. Du kan antingen göra bröststödd hantelrodd nu eller flytta kabelrodden till efter nästa övning. Hantelrodden är snabbast och bevarar dagens huvudsyfte bäst.

10.30 UTRUSTNINGEN SAKNAS

När utrustningen saknas permanent eller under en längre period ska GainPilot kunna skapa ett mer varaktigt alternativ.

Motorn ska analysera:

- hemmagym,

- hotellgym,

- utomhusmiljö,

- och användarens övriga utrustning.

Ett långvarigt byte kan kräva:

- ny progressionsmodell,

- ändrade belastningsmål,

- eller annan programstruktur.

GainPilot ska inte bara ersätta övningsnamnet och behålla gamla vikter eller progression.

10.31 TIDSBRIST

När passet behöver kortas ska substitutionsmotorn även kunna föreslå övningar som:

- kräver mindre uppställning,

- har kortare utrustningsbyte,

- kan köras i superset,

- eller kombinerar flera relevanta funktioner.

Tidseffektivitet får inte användas som enda kvalitetsmått.

Exempel:

En sammansatt övning kan spara tid men samtidigt skapa högre systemisk trötthet än två enklare övningar.

GainPilot ska prioritera passets huvudsyfte.

10.32 TEKNISK OSÄKERHET

När användaren inte behärskar en övning ska GainPilot kunna:

- visa teknikmaterial,

- föreslå lättare variant,

- föreslå lägre belastning,

- eller ersätta övningen tillfälligt.

Systemet ska skilja mellan:

- okänd övning,

- låg trygghet,

- faktisk teknikbrist,

- och osäker AI-bedömning.

Arnold ska inte automatiskt blockera en övning enbart för att systemet saknar tillräcklig teknikdata.

10.33 ANVÄNDARPREFERENS

När användaren ogillar en övning ska GainPilot bedöma om en rimlig substitution finns.

Systemet ska respektera användarens preferens men samtidigt kunna förklara kompromisser.

Exempel:

Du kan byta ut utfall mot benpress. Det minskar balanskravet och gör progressionen enklare, men du förlorar en del unilateral träning. Eftersom programmet redan innehåller annan unilateral träning är bytet rimligt.

Preferens ska inte automatiskt väga tyngre än en säkerhetsbegränsning eller ett uttryckligt programkrav.

10.34 SMÄRTA ELLER OBEHAG

Smärta ska aktivera en annan process än vanliga substitutionsönskemål.

GainPilot ska först försöka förstå:

- om smärtan är skarp eller akut,

- om den återkommer,

- om den endast gäller en viss rörelse,

- och om användaren har professionella instruktioner.

Systemet får inte diagnostisera orsaken.

Vid relevant risksignal ska GainPilot:

- stoppa eller pausa övningen,

- begränsa automatiska alternativ,

- markera en tillfällig begränsning,

- och rekommendera professionell bedömning när det behövs.

En smärtfri alternativ övning får inte presenteras som behandling eller bevis på att problemet är ofarligt.

10.35 LOKAL TRÖTTHET

När en användare har ovanlig lokal trötthet kan GainPilot föreslå ett alternativ med:

- lägre belastning på den trötta strukturen,

- lägre stabilitetskrav,

- annan utrustning,

- eller reducerad volym.

Motorn ska skilja mellan lokal trötthet och smärta.

Exempel:

Om greppet är uttröttat kan en maskinrodd eller dragremmar vara relevant beroende på programmets syfte.

Om greppträning är en del av syftet ska systemet inte automatiskt kringgå den.

10.36 PLANERAD VARIATION

GainPilot ska kunna använda planerad variation.

Variation kan användas för:

- nytt programblock,

- annan belastningsprofil,

- teknikfokus,

- motivation,

- eller kompletterande utveckling.

Planerad variation ska inte innebära slumpmässiga byten.

Arnold ska kunna förklara varför en ny variant införs och hur den relaterar till tidigare övning.

10.37 TILLFÄLLIGT OCH PERMANENT BYTE

Varje substitution ska ha en giltighet.

Möjliga giltigheter:

- ett set,

- ett pass,

- en vecka,

- en definierad period,

- ett programblock,

- eller permanent tills vidare.

Exempel:

Upptagen utrustning:

Ett pass.

Hotellgym:

En vecka.

Ny programvariant:

Ett block.

Stark permanent preferens:

Tills vidare.

Smärtbegränsning:

Tills professionell bedömning eller användarbekräftad omprövning.

Ett tillfälligt byte får inte automatiskt ändra framtida program.

10.38 SUBSTITUTIONSMOTORENS BESLUTSPROCESS

Substitutionsmotorn ska arbeta i en kontrollerad kedja:

Identifiera originalövningen

→ Identifiera aktiv programfunktion

→ Fastställ orsaken till bytet

→ Kontrollera säkerhetsbegränsningar

→ Kontrollera tillgänglig utrustning

→ Kontrollera användarpreferenser

→ Identifiera relevanta kandidater

→ Beräkna funktionell likhet

→ Analysera kompromisser

→ Rangordna alternativ

→ Presentera begränsat urval

→ Registrera användarens val

→ Uppdatera passet

→ Skapa giltighet och historik

→ Följa upp vid behov

Ingen kandidat ska föreslås enbart för att den delar primär muskelgrupp.

10.39 HÅRDA FILTER

Vissa regler ska fungera som hårda filter.

En kandidat ska tas bort om den:

- kräver utrustning som saknas,

- bryter mot aktiv säkerhetsbegränsning,

- är uttryckligen blockerad,

- ligger över tillåten teknisk nivå,

- inte fungerar i den aktuella miljön,

- eller strider mot professionella instruktioner.

Hårda filter ska tillämpas före rangordning.

En algoritm får inte väga upp en säkerhetskonflikt med hög muskelmässig likhet.

10.40 MJUKA RANGORDNINGSFAKTORER

Efter hårda filter ska kandidater kunna rangordnas utifrån:

- rörelsemönster,

- målmuskel,

- programfunktion,

- belastningsprofil,

- stabilitetskrav,

- progressionsmöjlighet,

- tidsåtgång,

- trötthetsprofil,

- användarpreferens,

- tidigare respons,

- och tillgängligt instruktionsmaterial.

Viktningen ska bero på orsaken till bytet.

Exempel:

Vid tidsbrist kan snabb uppställning väga tyngre.

Vid hypertrofi kan lokal muskelbelastning och progression väga tyngre.

Vid styrkespecificitet kan rörelselikhet och teknik väga tyngre.

10.41 SUBSTITUTIONSSCORE

GainPilot kan använda ett internt substitutionsscore för att rangordna kandidater.

Scoren ska inte presenteras som absolut biologisk sanning.

Den ska vara en beslutsstödsmodell.

En möjlig intern modell kan väga:

- funktionslikhet,

- rörelselikhet,

- muskelöverlapp,

- utrustningsmatchning,

- användarmatchning,

- trötthetsmatchning,

- och risk.

Scoren ska vara:

- versionerad,

- förklarbar,

- testbar,

- och kalibrerbar.

Arnold ska inte behöva visa en teknisk siffra.

Han ska kunna säga:

Det här är det starkaste alternativet eftersom det behåller samma dragmönster, liknande muskelbelastning och låg belastning på ländryggen.

10.42 KONFLIKTER MELLAN FAKTORER

Ett alternativ kan vara bra inom en dimension och sämre inom en annan.

Exempel:

En övning kan ge:

- mycket lik muskelbelastning,

- men högre tekniksvårighet.

Eller:

- liknande rörelsemönster,

- men sämre belastningsprogression.

Substitutionsmotorn ska kunna förklara kompromissen.

Exempel:

Den här varianten är mest lik originalrörelsen men kräver mer balans. Maskinalternativet är enklare och snabbare men mindre specifikt. Eftersom bytet bara gäller dagens pass rekommenderar jag maskinen.

10.43 BEGRÄNSAT ANTAL ALTERNATIV

Arnold ska normalt presentera ett begränsat antal alternativ.

Standard kan exempelvis vara:

- ett rekommenderat förstaval,

- två relevanta alternativ,

- och möjlighet att öppna hela biblioteket.

Användaren ska inte behöva jämföra hundratals övningar mitt under ett pass.

Varje alternativ ska kunna visa:

- varför det passar,

- vad som förändras,

- och om bytet är tillfälligt eller lämpligt permanent.

10.44 ANVÄNDARENS VAL

Användaren ska kunna välja ett annat alternativ än Arnolds förstaval.

Valet ska registreras tillsammans med:

- originalövning,

- vald övning,

- orsak,

- giltighet,

- och eventuell feedback.

GainPilot ska använda valet som en signal.

Ett enda val får inte automatiskt skapa permanent preferens.

Återkommande val kan leda till en fråga:

Du har valt bröststödd rodd i stället för kabelrodd vid flera tillfällen. Vill du att jag prioriterar den permanent, eller beror valen på att kabelstationen ofta är upptagen?

10.45 AUTOMATISKT BYTE

Automatiska övningsbyten ska endast ske inom användarens mandat.

Exempel på byte som kan tillåtas automatiskt:

- tillfälligt likvärdigt byte när utrustningen saknas,

- fördefinierad reservövning,

- eller låg risk-variant inom samma övningsfamilj.

Starkare godkännande ska normalt krävas för:

- byte av huvudövning,

- permanent programändring,

- progression till tekniskt svårare rörelse,

- eller byte kopplat till smärta.

Användaren ska kunna se och återställa bytet.

10.46 RESERVÖVNINGAR

Ett program ska kunna innehålla fördefinierade reservövningar.

En reservövning kan anges av:

- GainPilot,

- användaren,

- eller mänsklig tränare.

Exempel:

Original:

Sittande kabelrodd.

Reserv:

Bröststödd hantelrodd.

Villkor:

Använd när kabelstationen inte är tillgänglig.

Reservövningar ska göra byten snabbare och mer förutsägbara.

De ska fortfarande kontrolleras mot aktuella begränsningar.

10.47 ANVÄNDARLÅSNINGAR

Användaren ska kunna låsa:

- en specifik övning,

- en övningsfamilj,

- ett huvudlyft,

- eller en förbjuden övning.

Exempel:

Bänkpress är låst som huvudövning.

GainPilot får då inte permanent ersätta den utan godkännande.

En tillfällig reserv kan fortfarande användas om användaren väljer det för ett pass.

Blockerade övningar ska inte föreslås så länge blockeringen är aktiv.

10.48 PROFESSIONELLT DEFINIERADE BEGRÄNSNINGAR

När användaren har professionella instruktioner ska dessa kunna lagras som högprioriterade begränsningar.

Exempel:

- undvik viss rörelse,

- använd begränsat rörelseomfång,

- håll belastning inom angiven nivå,

- eller följ särskild progression.

GainPilot ska inte tolka eller utöka instruktionen utanför det användaren har angett.

Systemet ska inte skriva över den genom ett vanligt substitutionsscore.

10.49 FÖRKLARING AV BYTET

Arnold ska kunna förklara ett byte kort eller detaljerat.

Kort:

Kabelrodd är upptagen. Bröststödd hantelrodd är det bästa snabba alternativet och belastar ryggen på liknande sätt.

Normal:

Bröststödd hantelrodd behåller det horisontella draget och begränsar belastningen på ländryggen. Belastningsprofilen skiljer sig något från kabeln, men bytet fungerar bra för dagens hypertrofisyfte.

Teknisk:

Alternativet har hög rörelse- och muskelmässig överlappning, lägre kontinuerlig kabelspänning och liknande stabilitetskrav genom bröststödet. Det är starkt som tillfällig substitution men inte fullständigt likvärdigt.

Förklaringen ska motsvara användarens nivå.

10.50 PROGRAMKONSEKVENS

Efter ett övningsbyte ska GainPilot kontrollera resten av programmet.

Motorn ska analysera om bytet:

- skapar dubblerad rörelse,

- tar bort ett nödvändigt mönster,

- ökar lokal belastning,

- förändrar tidsåtgången,

- eller påverkar progression.

Exempel:

Om en användare byter ut programmets enda vertikala drag mot ännu en horisontell rodd kan veckobalansen förändras.

Arnold ska då kunna varna och föreslå ett bättre alternativ.

10.51 PROGRESSIONSKONSEKVENS

Ett övningsbyte kan kräva ny progressionsmodell.

GainPilot ska inte överföra:

- vikt,

- repetitionsmål,

- RPE,

- eller tidigare rekord

direkt mellan olika övningar utan relevant omräkning eller ny kalibrering.

Exempel:

100 kilogram i skivstångsbänk kan inte direkt översättas till ett exakt viktmål i hantelpress eller maskinpress.

Det nya alternativet ska få:

- startuppskattning,

- kalibrering,

- och egen prestationshistorik.

10.52 RESULTATHISTORIK

Varje övningsvariant ska ha egen resultatshistorik när skillnaden påverkar jämförbarheten.

GainPilot ska kunna koppla relaterade övningar för övergripande analys utan att slå ihop deras resultat.

Exempel:

Bänkpress och smal bänkpress kan visas i samma övningsfamilj.

Deras belastningshistorik ska fortfarande hållas separat.

10.53 MEDIA OCH CANONICAL IDENTITET

Övningsmedia ska kopplas till canonical övningsidentitet.

Media ska inte länkas enbart genom:

- visningsnamn,

- filnamn,

- eller fritext.

En övning kan ha flera medieresurser:

- huvudanimation,

- sidovinkel,

- framifrån,

- teknikdetalj,

- vanliga fel,

- regression,

- progression,

- och tillgänglighetsanpassad version.

Varje resurs ska ha:

- mediaidentitet,

- övningsidentitet,

- version,

- språk,

- källa,

- licens,

- granskningsstatus,

- och publiceringsstatus.

10.54 ANIMERADE DEMONSTRATIONER

GainPilots animerade övningsdemonstrationer ska vara:

- tydliga,

- tekniskt korrekta,

- visuellt konsekventa,

- sömlösa när de loopas,

- och anpassade till produktens identitet.

Animationen ska kunna visa:

- startposition,

- rörelsebana,

- slutposition,

- tempo,

- ledpositioner,

- och relevant utrustning.

Den visuella miljön kan vara mörkare och mer levande än traditionella vita bakgrunder.

Bakgrunden får inte:

- minska kontrasten,

- dölja leder,

- göra utrustning svår att se,

- eller konkurrera med rörelsen.

10.55 MUSKELMARKERINGAR

GainPilot ska kunna visa primära och sekundära muskler i övningsdemonstrationen.

Markeringarna ska beskrivas som pedagogiska förenklingar.

De får inte ge intryck av att endast markerade muskler arbetar.

Användaren ska kunna:

- slå av markeringar,

- växla mellan primär och sekundär belastning,

- och läsa en textbeskrivning.

Muskelfärger och animationer ska följa tillgänglighetskrav.

10.56 VANLIGA FEL

Övningsposten ska kunna innehålla vanliga tekniska fel.

Varje fel ska kunna kopplas till:

- visuell demonstration,

- kort förklaring,

- möjlig konsekvens,

- och korrigerande instruktion.

GainPilot ska vara försiktigt med absoluta formuleringar.

Alla teknikvariationer är inte automatiskt fel.

Systemet ska skilja mellan:

- tydligt avvikande standard,

- möjlig individuell variation,

- och osäker observation.

10.57 TEKNIKSTANDARD

Övningar ska kunna ha teknikstandarder som beror på sammanhanget.

Exempel:

- allmän träningsstandard,

- styrkelyftsstandard,

- CrossFit-repetitionsstandard,

- eller användarspecifik professionell begränsning.

En repetition kan räknas som giltig inom ett gympass men inte inom en tävlingsstandard.

GainPilot ska lagra vilken standard som används vid resultatjämförelse.

10.58 AI-GENERERAT MATERIAL

AI kan användas för:

- visuell stil,

- bakgrund,

- renderingsvariationer,

- undertexter,

- lokalisering,

- kameravinklar,

- och efterbearbetning.

AI-genererad rörelse får inte bli canonical utan teknisk granskning.

Risker kan vara:

- förändrad ledposition mellan bildrutor,

- felaktigt grepp,

- utrustning som deformeras,

- anatomiskt omöjlig rörelse,

- felaktig repetitionsbana,

- och inkonsekvent belastning.

Tekniskt komplexa rörelser ska kräva högre granskningsnivå.

10.59 MOTION CAPTURE OCH 3D

GainPilot kan använda:

- motion capture,

- handanimering,

- licensierade rörelsedata,

- och egen 3D-produktion.

3D-modellen ska göra det möjligt att skapa:

- konsekvent avatar,

- flera kameravinklar,

- olika miljöer,

- muskelmarkeringar,

- och återanvändbara rörelser.

Rörelsedata ska granskas efter retargeting.

En korrekt inspelad rörelse kan bli felaktig när den överförs till en annan kroppsmodell.

10.60 EXTERNA MEDIABIBLIOTEK

Externa mediabibliotek ska bedömas utifrån:

- övningstäckning,

- teknisk kvalitet,

- licens,

- kommersiell användning,

- white-label-rättigheter,

- möjlighet till lokal lagring,

- API-begränsningar,

- leverantörsberoende,

- export,

- språk,

- och specialdomäner.

GainPilot ska skapa en leverantörsmatris innan ett bibliotek väljs.

Matrisen ska jämföra biblioteket mot:

- canonical övningsinventering,

- prioriterade användarprogram,

- CrossFit-behov,

- calisthenicsbehov,

- och framtida internationell användning.

10.61 HYBRIDBIBLIOTEK

GainPilots långsiktiga modell ska stödja ett hybridbibliotek.

Det kan bestå av:

1. licensierat grundmaterial,

2. egenproducerade kärnövningar,

3. specialproduktion för tekniskt komplexa rörelser,

4. och begränsat AI-förstärkt material efter granskning.

Det licensierade materialet kan ge snabb bredd.

Eget material kan ge:

- visuell identitet,

- kontroll,

- teknisk kvalitet,

- och täckning där leverantörer saknar innehåll.

GainPilot ska inte bli fullständigt beroende av en leverantör som kan ändra pris, licens eller API.

10.62 ÖVNINGSINVENTERING

Innan större mediaproduktion ska GainPilot skapa en canonical övningsinventering.

Inventeringen ska klassificera övningar efter:

- produktprioritet,

- användningsfrekvens,

- träningsdomän,

- teknisk komplexitet,

- externt material,

- behov av eget material,

- och granskningsstatus.

En möjlig prioritering:

P0:

Övningar som krävs för första fungerande programmen.

P1:

Vanliga substitutioner och nybörjarövningar.

P2:

Fördjupad styrka, hypertrofi och kondition.

P3:

CrossFit och calisthenics med hög komplexitet.

P4:

Sällsynta specialövningar och långsiktigt innehåll.

Inventeringen ska styra produktionen.

10.63 FÖRSTA ÖVNINGARNA

De första övningarna ska inte väljas enbart utifrån popularitetslistor.

De ska utgå från:

- GainPilots första riktiga program,

- användarens befintliga övningar,

- vanliga substitutionsbehov,

- nybörjarstöd,

- och täckning av centrala rörelsemönster.

Ett första bibliotek kan exempelvis prioritera:

- knädominanta övningar,

- höftdominanta övningar,

- horisontell och vertikal press,

- horisontellt och vertikalt drag,

- vanliga armövningar,

- grundläggande bålträning,

- promenad,

- löpning,

- och cykling.

Exakt inventering ska fastställas genom programspecifikation.

10.64 KÄLLOR OCH PROVENANCE

Varje viktig övningsuppgift ska ha provenance.

Det gäller exempelvis:

- teknikdefinition,

- muskelrelation,

- progressionsrelation,

- substitutionsrelation,

- och säkerhetsnotering.

Källan kan vara:

- intern expertgranskning,

- officiell rörelsestandard,

- licensierad leverantör,

- forskningsunderlag,

- eller kontrollerad redaktionell bedömning.

Systemet ska kunna skilja mellan:

- canonical verifierad information,

- preliminär information,

- AI-genererat förslag,

- och användarskapad post.

10.65 GRANSKNINGSSTATUS

Övningsdata ska kunna ha status som:

- utkast,

- automatiskt importerat,

- preliminärt granskat,

- tekniskt granskat,

- canonical,

- begränsat,

- eller avpublicerat.

En övning kan vara tillgänglig för intern testning utan att vara godkänd för användarprogram.

Tekniskt komplexa rörelser ska kräva starkare granskningsstatus innan de används automatiskt.

10.66 KVALITETSSCORE

GainPilot kan använda ett internt kvalitetsscore för övningsposter och relationer.

Scoren kan påverkas av:

- källkvalitet,

- expertgranskning,

- fullständig metadata,

- mediekvalitet,

- substitutionsvalidering,

- och testtäckning.

Scoren får inte ersätta tydliga statusar eller mänsklig granskning.

Den ska användas som stöd för:

- prioritering,

- varningar,

- och produktionskontroll.

10.67 VERSIONERING

Övningar och relationer ska vara versionerade.

En ny version kan behövas när:

- teknikdefinition ändras,

- metadata korrigeras,

- substitutionsrelation omvärderas,

- media byts,

- eller säkerhetsnotering uppdateras.

Historiska träningsresultat ska kunna förstå vilken övningsversion som användes när det är relevant.

En mindre textkorrigering behöver inte bryta övningsidentiteten.

10.68 AVPUBLICERING

En övning eller medieresurs ska kunna avpubliceras utan att historiken förstörs.

Möjliga orsaker:

- tekniskt fel,

- felaktig animation,

- licensproblem,

- dubblett,

- säkerhetsproblem,

- eller ersatt canonical post.

Avpublicerad data ska inte användas i nya program eller substitutioner.

Historiska program ska fortfarande kunna visa vad användaren gjorde.

10.69 DUBLETTER

GainPilot ska kunna upptäcka dubbletter från:

- olika språk,

- stavningsvariationer,

- externa datakällor,

- och användarskapade övningar.

Dubblettanalys ska använda mer än namn.

Den ska jämföra:

- rörelse,

- utrustning,

- teknik,

- variant,

- och struktur.

Systemet får inte slå samman två tekniskt olika rörelser bara för att deras namn liknar varandra.

10.70 ANVÄNDARSKAPADE ÖVNINGAR

Användaren ska kunna skapa en egen övning när biblioteket saknar den.

En användarskapad övning ska minst kunna innehålla:

- namn,

- enkel beskrivning,

- träningsdomän,

- relevant utrustning,

- och valfri media eller anteckning.

Den ska inte automatiskt bli canonical eller tillgänglig för andra användare.

GainPilot kan försöka matcha den mot befintlig övning.

Arnold kan säga:

Den här övningen verkar likna en befintlig variant. Vill du använda den canonical övningen eller behålla din privata version?

Användarskapade poster ska isoleras per användare eller projekt.

10.71 FÖRSLAG TILL NY CANONICAL ÖVNING

Om flera användare eller importer återkommande innehåller samma okända övning kan Atlas skapa ett förslag till canonical övning.

Processen ska vara:

Signal

→ Dubblettkontroll

→ Källinsamling

→ Preliminär modell

→ Teknisk granskning

→ Licens- och mediabedömning

→ Test

→ Canonical godkännande

→ Versionerad publicering

Ingen användarskapad övning får automatiskt publiceras globalt.

10.72 IMPORT AV EXTERNA ÖVNINGSNAMN

När program importeras ska GainPilot normalisera övningsnamn.

Processen ska kunna:

- identifiera exakt matchning,

- identifiera synonym,

- föreslå variant,

- markera osäker matchning,

- och skapa granskningspost.

En osäker matchning ska inte tyst kopplas till fel övning.

Arnold eller användaren ska kunna bekräfta:

Menar programmet vanlig marklyft, rumänska marklyft eller raka marklyft?

10.73 EXTERNA PROGRAM OCH ÖVNINGSRELATIONER

Ett externt program kan innehålla egna substitutionsförslag.

GainPilot ska inte automatiskt göra dessa relationer canonical.

De ska kunna lagras som:

- programspecifik relation,

- extern källa,

- eller granskningsförslag.

Canonical substitutionsrelationer ska kräva egen validering.

10.74 SÖKNING

Övningssökningen ska stödja:

- namn,

- synonym,

- muskel,

- rörelsemönster,

- utrustning,

- träningsdomän,

- svårighetsgrad,

- och programfunktion.

Sökresultat ska prioriteras efter användarens kontext.

Exempel:

En användare som tränar hemma ska inte först mötas av maskinövningar som saknar praktisk relevans.

Sökningen ska fortfarande kunna visa hela biblioteket när användaren väljer det.

10.75 FILTER

Användaren ska kunna filtrera övningar efter exempelvis:

- utrustning,

- muskel,

- rörelsemönster,

- träningsform,

- svårighetsgrad,

- tidsåtgång,

- tekniknivå,

- och favoritstatus.

Säkerhetsbegränsningar ska inte kunna stängas av som ett vanligt filter.

Blockerade övningar kan visas i en separat hanteringsvy men ska inte föreslås aktivt.

10.76 FAVORITER

Användaren ska kunna markera favoriter.

Favoritstatus ska påverka substitutionsrangordningen när den inte strider mot:

- programsyfte,

- säkerhet,

- eller utrustning.

Favoriter ska inte automatiskt dominera alla program.

GainPilot ska kunna använda favoritövningar där de passar och förklara när en annan övning behövs.

10.77 OGILLADE OCH BLOCKERADE ÖVNINGAR

GainPilot ska skilja mellan:

- ogillad,

- undvik helst,

- blockerad,

- tillfälligt blockerad,

- och säkerhetsblockerad.

Ogillad övning kan fortfarande visas om alternativ saknas och användaren vill se den.

Blockerad övning ska inte föreslås.

Säkerhetsblockering ska ha högre prioritet och tydligare omprövningsprocess.

10.78 LÄRANDE FRÅN SUBSTITUTIONER

GainPilot ska kunna lära från användarens substitutionshistorik.

Relevanta signaler:

- vilka alternativ användaren väljer,

- vilka alternativ som återställs,

- om prestationen förbättras,

- om passet går snabbare,

- och om användaren ger positiv eller negativ feedback.

Systemet ska skilja mellan:

- tillfällig miljöeffekt,

- verklig preferens,

- och bättre individuell respons.

Inlärningen ska vara korrigerbar.

10.79 PERSONLIG SUBSTITUTIONSRANGORDNING

Över tid kan GainPilot anpassa substitutionsrangordningen efter användaren.

Exempel:

Två alternativ är funktionellt likvärdiga.

Användaren har tidigare:

- presterat bättre i det ena,

- föredragit det,

- och genomfört det utan problem.

Det alternativet kan rankas högre.

Personlig historik får inte kringgå säkerhetsfilter eller programfunktion.

10.80 POPULATIONSINSIKTER

Aggregerad och tillåten plattformsdata kan visa:

- vilka övningar som ofta byts,

- vilka substitutionsförslag som accepteras,

- vilka alternativ som ofta återställs,

- och var användare rapporterar teknikproblem.

Atlas kan använda detta för att skapa förbättringsförslag.

Ett populärt byte ska inte automatiskt bli canonical.

Popularitet säger inte säkert att bytet är funktionellt korrekt.

10.81 ARNOLDS ROLL

Arnold ska göra övningsgrafen användbar i stunden.

Han ska kunna:

- förklara en övning,

- visa demonstration,

- föreslå byten,

- fråga varför användaren vill byta,

- beskriva kompromisser,

- och uppdatera passet.

Arnold ska hålla kommunikationen kort under ett aktivt pass.

Exempel:

Kabelstationen är upptagen. Gör bröststödd hantelrodd i dag. Den behåller det horisontella draget och belastar ländryggen mindre än skivstångsrodd.

Användaren ska kunna öppna en djupare förklaring.

10.82 ATLAS ROLL

Atlas ska hjälpa GainPilot med:

- källgranskning,

- research,

- dubblettanalys,

- externa bibliotek,

- nya rörelsestandarder,

- och analys av övningsgrafens kvalitet.

Atlas kan upptäcka:

- saknade övningar,

- svaga substitutionsrelationer,

- licensrisker,

- eller återkommande användarproblem.

Atlas får inte direkt publicera ny canonical övningsdata utan rätt gransknings- och utvecklingsprocess.

10.83 HERMES ROLL

Hermes ska kontrollera vilken användarkontext substitutionsmotorn får använda.

Relevant kontext kan vara:

- tillgänglig utrustning,

- aktivt program,

- övningspreferenser,

- teknisk nivå,

- och uttryckliga begränsningar.

Arnold behöver normalt inte annan privat Omnira-kontext för ett vanligt övningsbyte.

Om kalender eller plats används ska den minimeras till vad uppgiften kräver.

10.84 OMVÄRLDSBEVAKNING

Atlas ska kunna genomföra kontrollerad omvärldsbevakning för:

- nya rörelsestandarder,

- leverantörsförändringar,

- licensvillkor,

- säkerhetsinformation,

- och relevant träningskunskap.

En till två kontroller per vecka kan vara en grundnivå när bevakningen är relevant.

Ny information ska inte direkt skriva om övningsgrafen.

Processen ska vara:

Identifiering

→ Källgranskning

→ Påverkansbedömning

→ Förslag

→ Teknisk granskning

→ Test

→ Versionering

→ Kontrollerad publicering

10.85 KVALITETSSÄKRING AV SUBSTITUTIONER

Substitutionsrelationer ska testas genom:

- expertgranskning,

- regelsimulering,

- scenariotester,

- användarfeedback,

- och plattformsanalys.

Testscenarier kan vara:

- kabelmaskin upptagen,

- hotellgym,

- hemmaträning,

- nybörjare,

- teknisk osäkerhet,

- tidsbrist,

- smärtsignal,

- och låst huvudövning.

Motorn ska inte ge samma förstaval i alla scenarier.

10.86 TESTNING AV ÖVNINGSGRAFEN

Övningsgrafen ska testas för:

- brutna relationer,

- cirkulära progressioner,

- orimliga regressionskedjor,

- saknade canonical identiteter,

- dubbletter,

- fel utrustning,

- och säkerhetskonflikter.

Exempel:

En progression får inte skapa en cirkel där A kräver B och B samtidigt kräver A utan uttrycklig alternativ struktur.

10.87 TESTNING AV MEDIA

Övningsmedia ska testas för:

- korrekt övningskoppling,

- rätt version,

- fungerande uppspelning,

- tillgänglighetsstöd,

- licensstatus,

- visuell kvalitet,

- och teknisk korrekthet.

AI-genererad eller retargetad rörelse ska genomgå särskild biomekanisk granskning.

Media med utgången licens ska automatiskt kunna blockeras från ny användning.

10.88 SÄKERHETSTESTER

Säkerhetstester ska verifiera att:

- blockerade övningar inte föreslås,

- professionella begränsningar respekteras,

- smärtsignal inte hanteras som vanlig preferens,

- tekniskt avancerade progressioner inte ges för tidigt,

- och högriskbyten kräver rätt godkännande.

Motorn ska även testas när data saknas eller motsäger varandra.

10.89 REGRESSIONSTESTER

När en övningsrelation ändras ska systemet kontrollera att:

- befintliga program fortfarande fungerar,

- substitutionsförslag inte försämras,

- progressionskedjor inte bryts,

- och historiska resultat förblir läsbara.

En förbättring för en träningsdomän får inte oavsiktligt skada en annan.

10.90 OBSERVABILITY

Det ska gå att förstå varför ett substitutionsförslag skapades.

Beslutsspårningen ska kunna visa:

- originalövning,

- programfunktion,

- orsak till byte,

- tillämpade hårda filter,

- rangordningsfaktorer,

- föreslagna kandidater,

- valt alternativ,

- kontrollnivå,

- och utfall.

Tekniska loggar ska minimera känslig användardata.

Observability ska stödja:

- felsökning,

- användarförklaring,

- modellutvärdering,

- och säkerhetsrevision.

10.91 FÖRÄNDRINGSHISTORIK

Betydelsefulla permanenta övningsbyten ska lagras i förändringshistoriken.

Exempel:

Datum:

7 september 2026.

Originalövning:

Skivstångsrodd.

Ny övning:

Bröststödd rodd.

Orsak:

Återkommande hög ländryggströtthet tillsammans med tung marklyftsträning.

Funktion:

Horisontellt drag för hypertrofi.

Giltighet:

Resterande programblock.

Initierad av:

Arnold.

Kontrollnivå:

Samarbetsläge.

Uppföljning:

Efter tre träningsveckor.

10.92 ÅTERSTÄLLNING

Användaren ska kunna återställa:

- tillfälligt byte,

- permanent övningsbyte,

- reservövning,

- eller tidigare substitutionspreferens.

Återställningen ska kontrollera:

- aktuell utrustning,

- säkerhetsbegränsning,

- programversion,

- och progression.

GainPilot får inte återställa en övning som fortfarande är säkerhetsblockerad.

10.93 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera:

- vanligaste bytesorsaker,

- accepterade alternativ,

- återställda byten,

- saknade övningar,

- mediaspelningsproblem,

- och svaga delar av grafen.

Analysen ska hållas åtskild från personlig coachning.

Aggregerade mönster får inte ge en användare tillgång till en annan användares privata träningsdata.

10.94 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar ett förbättringsbehov ska processen vara:

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

Ingen agent får direkt förändra:

- canonical övningsidentiteter,

- substitutionsregler,

- säkerhetsfilter,

- progressionsgraf,

- eller publicerat media

utan denna process.

10.95 MIGRATION AV ÖVNINGSIDENTITET

Om två övningsposter behöver slås samman eller en identitet behöver ersättas ska GainPilot använda en kontrollerad migration.

Migrationen ska:

- bevara historik,

- uppdatera relationer,

- uppdatera media,

- uppdatera aktiva program,

- dokumentera den gamla identiteten,

- och möjliggöra rollback.

Canonical identiteter får inte ändras genom enkel textredigering i databasen.

10.96 API OCH INTEGRATIONER

Övningsgrafen ska kunna exponeras genom stabila kontrakt till:

- GainPilots klienter,

- Arnold,

- programgeneratorn,

- externa importer,

- och framtida partnerintegrationer.

API-kontrakt ska skilja mellan:

- canonical data,

- lokaliserad presentation,

- användarspecifik metadata,

- och privata användarövningar.

Externa integrationer får inte kunna skriva direkt till canonical graf utan granskningsprocess.

10.97 OFFLINE OCH CACHE

Grundläggande övningsinformation och media ska kunna cachas för användning under träningspass.

GainPilot ska hantera:

- versionskontroll,

- gammal cache,

- avpublicerat media,

- och begränsad nätanslutning.

En användare ska kunna se sitt planerade pass och grundläggande övningsinstruktion även om anslutningen tillfälligt saknas.

Säkerhetskritiska uppdateringar ska markeras för snabb synkronisering.

10.98 TILLGÄNGLIGHET

Övningsinnehåll ska finnas i flera format.

Minst:

- animation eller video,

- kort text,

- steg-för-steg-instruktion,

- teknikpunkter,

- och textalternativ till visuella element.

Media ska stödja:

- undertexter,

- paus,

- hastighetskontroll,

- loop,

- och minskad animation.

Muskelmarkeringar får inte vara beroende enbart av färg.

10.99 LOKALISERING

Canonical övningsidentitet ska vara språkoberoende.

Visningsnamn, instruktioner och teknikpunkter ska lokaliseras.

GainPilot ska hantera att vissa engelska begrepp är etablerade även i svenska träningsmiljöer.

Användaren ska kunna söka på både:

- bänkpress,

- bench press,

- och andra kända synonymer

utan att skapa separata övningar.

10.100 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots övningsgraf och substitutionsmotor.

**Kontrakt GP-133 — Övning som strukturerad kunskap**

Varje canonical övning ska representeras genom en strukturerad och versionshanterad kunskapsmodell.

**Kontrakt GP-134 — Stabil canonical identitet**

Övningsidentitet ska vara stabil och separerad från språk, visningsnamn och externa leverantörsidentifierare.

**Kontrakt GP-135 — Varianter ska särskiljas**

Betydelsefulla skillnader i utrustning, teknik, rörelseomfång, belastning eller programmering ska kunna representeras som egna varianter.

**Kontrakt GP-136 — Programfunktion före substitution**

Ett övningsbyte ska bedömas utifrån övningens funktion i det aktiva programmet.

**Kontrakt GP-137 — Orsak före alternativ**

Substitutionsmotorn ska identifiera orsaken till bytet innan alternativ rangordnas.

**Kontrakt GP-138 — Hårda säkerhetsfilter**

Säkerhetsbegränsningar, blockerade övningar och saknad utrustning ska filtrera bort kandidater före mjuk rangordning.

**Kontrakt GP-139 — Villkorade relationer**

Progressioner, regressioner och substitutioner ska ha uttryckliga villkor, källa och kvalitetsstatus.

**Kontrakt GP-140 — Begränsat rekommendationsurval**

Arnold ska normalt presentera ett litet antal relevanta alternativ i stället för en osorterad katalog.

**Kontrakt GP-141 — Förklarad kompromiss**

När ett byte inte är fullständigt likvärdigt ska den viktiga kompromissen kommuniceras.

**Kontrakt GP-142 — Giltighet för substitution**

Varje övningsbyte ska kunna klassificeras som tillfälligt, tidsbegränsat, blockbaserat eller permanent.

**Kontrakt GP-143 — Programkonsekvensanalys**

Ett övningsbyte ska analyseras i relation till resten av passet och programmet.

**Kontrakt GP-144 — Separat prestationshistorik**

Resultat från betydelsefullt olika övningsvarianter ska lagras separat även när övningarna är relaterade.

**Kontrakt GP-145 — Canonical mediekoppling**

Övningsmedia ska kopplas genom canonical övningsidentitet och ha licens, version och granskningsstatus.

**Kontrakt GP-146 — Teknisk mediegranskning**

AI-genererat, retargetat och externt övningsmaterial ska granskas innan produktionsanvändning.

**Kontrakt GP-147 — Privat användarinnehåll**

Användarskapade övningar ska vara privata tills en separat canonical granskningsprocess har slutförts.

**Kontrakt GP-148 — Provenance**

Övningsdata och relationer ska ha känd källa, tidpunkt, säkerhetsnivå och granskningsstatus.

**Kontrakt GP-149 — Versionshanterad graf**

Övningsposter, relationer, media och säkerhetsnoteringar ska versioneras och kunna migreras kontrollerat.

**Kontrakt GP-150 — Behörighetsstyrd personlig rangordning**

Personliga preferenser och historik får påverka rangordningen men aldrig kringgå säkerhets- och programregler.

**Kontrakt GP-151 — Observerbara substitutionsbeslut**

Det ska gå att spåra varför ett alternativ föreslogs, valdes eller avvisades.

**Kontrakt GP-152 — Branchbaserad grafutveckling**

Förändringar av canonical övningsgraf, substitutionsmotor och säkerhetsfilter ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

10.101 ANTI-PRINCIPER

GainPilot ska inte:

- behandla en övning som endast namn, bild och muskelgrupp,

- koppla träningshistorik till föränderliga visningsnamn,

- slå samman olika varianter enbart för att namnen liknar varandra,

- anta att övningar i samma familj är likvärdiga,

- använda primär muskel som enda grund för substitution,

- ignorera övningens funktion i programmet,

- föreslå utrustning användaren saknar,

- behandla upptagen utrustning och smärta som samma bytesorsak,

- ranka säkerhetsmässigt olämplig övning högt på grund av muskelöverlapp,

- visa hundratals osorterade alternativ under ett träningspass,

- automatiskt göra tillfälliga byten permanenta,

- överföra vikter och rekord direkt mellan olika övningar,

- slå ihop prestationshistorik för olika teknikstandarder,

- föreslå blockerade övningar,

- kringgå professionella instruktioner,

- diagnostisera orsaken till smärta,

- presentera ett smärtfritt alternativ som behandling,

- låta popularitet avgöra canonical substitutionskvalitet,

- göra användarskapade övningar globala utan granskning,

- tyst matcha osäkra externa övningsnamn,

- koppla media genom fritextnamn,

- publicera AI-genererad rörelse utan teknisk granskning,

- prioritera visuellt imponerande animation framför korrekt rörelse,

- anta att ett stort externt bibliotek täcker alla GainPilot-domäner,

- bli fullständigt beroende av en enda medieleverantör,

- använda utgången eller oklar licens,

- ändra canonical identiteter utan migration,

- låta externa integrationer skriva direkt till canonical graf,

- eller ändra grafen direkt i main eller produktion utan branch, tester och granskning.

10.102 KANONISKA BESLUT FRÅN KAPITEL 10

Följande beslut etableras:

1. GainPilot ska ha en canonical övningsgraf.

2. Varje övning ska representeras som en strukturerad kunskapsenhet.

3. Varje övning ska ha en stabil canonical identitet.

4. Canonical identitet ska separeras från språk och visningsnamn.

5. Synonymer ska kopplas till samma canonical identitet när rörelsen faktiskt är densamma.

6. Betydelsefulla övningsvarianter ska ha egna identiteter.

7. Övningsfamiljer ska kunna gruppera relaterade varianter.

8. Familjetillhörighet får inte innebära automatisk substitutionslikvärdighet.

9. Övningar ska kunna kopplas till flera rörelsemönster.

10. Muskelrelationer ska kunna klassificeras som primära, sekundära eller stabiliserande.

11. Muskelrelationer ska ha källa och säkerhetsnivå.

12. Varje övning i ett aktivt program ska ha en programfunktion.

13. Samma övning kan ha olika funktion i olika program.

14. Utrustningskrav ska representeras strukturerat.

15. GainPilot ska skilja mellan saknad och tillfälligt upptagen utrustning.

16. Träningsmiljö ska kunna påverka övningens lämplighet.

17. Svårighetsgrad ska representeras genom flera komponenter.

18. Förkunskapskrav ska kunna kopplas till progressioner och färdigheter.

19. Belastnings- och progressionsmöjlighet ska ingå i övningsmodellen.

20. Trötthetsprofil och stabilitetskrav ska kunna påverka substitutionsbeslut.

21. Rörelseomfång, tempo och paus ska kunna representeras.

22. Unilaterala och bilaterala övningar ska särskiljas.

23. GainPilot ska ha domänspecifik övningslogik för styrka, CrossFit, calisthenics och kondition.

24. CrossFit-rörelser ska stödja rörelsestandard, scaling och no-rep-kriterier.

25. Calisthenics ska stödja färdighetsgrafer med parallella och villkorade progressioner.

26. Konditionsaktiviteter ska kunna ingå i substitutionsgrafen.

27. Progressionsrelationer ska ha förkunskapskrav och framgångskriterier.

28. Regressioner ska bevara relevant del av övningens funktion.

29. GainPilot ska stödja sidosteg som inte automatiskt klassificeras som progression.

30. Substitutionsrelationer ska vara villkorade och kontextberoende.

31. Substitutionsgrad ska kunna klassificeras.

32. Orsaken till bytet ska fastställas innan alternativ föreslås.

33. Upptagen utrustning ska kunna hanteras genom byte eller ändrad övningsordning.

34. Permanent saknad utrustning ska kunna skapa mer varaktig programanpassning.

35. Tidsbrist ska kunna påverka övningsval och passstruktur.

36. Teknisk osäkerhet ska kunna leda till teknikstöd, regression eller tillfälligt byte.

37. Användarpreferenser ska respekteras inom programmets och säkerhetens gränser.

38. Smärta ska aktivera en särskild säkerhetsprocess.

39. GainPilot ska inte diagnostisera smärta.

40. Lokal trötthet ska skiljas från smärta.

41. Planerad variation ska vara syftesstyrd.

42. Varje substitution ska ha en definierad giltighet.

43. Substitutionsmotorn ska använda en kontrollerad beslutsprocess.

44. Hårda filter ska tillämpas före rangordning.

45. Mjuka rangordningsfaktorer ska viktas utifrån användningsfallet.

46. Ett internt substitutionsscore får användas som beslutsstöd.

47. Substitutionsscore ska vara förklarbart, versionerat och testbart.

48. Arnold ska normalt presentera ett rekommenderat alternativ och ett fåtal andra relevanta val.

49. Användarens val ska registreras som signal.

50. Ett enskilt val får inte automatiskt bli permanent preferens.

51. Automatiska byten ska följa användarens mandat.

52. Huvudövningar och permanent programstruktur ska kräva starkare kontroll.

53. Program ska kunna ha fördefinierade reservövningar.

54. Användaren ska kunna låsa och blockera övningar.

55. Professionella begränsningar ska ha högre prioritet än rangordningsmodellen.

56. Arnold ska kunna förklara substitutionens fördelar och kompromisser.

57. Varje byte ska konsekvensbedömas mot resten av programmet.

58. Ny övning ska få egen progression och kalibrering.

59. Prestationshistorik för olika varianter ska hållas separat.

60. Övningsmedia ska kopplas till canonical identitet.

61. Media ska ha licens, källa, version och granskningsstatus.

62. GainPilot ska stödja flera kameravinklar och instruktionsformat.

63. Muskelmarkeringar ska vara pedagogiska och valbara.

64. Vanliga fel ska representeras med försiktighet och kontext.

65. Teknikstandard ska kunna variera mellan träningsdomäner.

66. AI får användas i mediaproduktion men inte som ensam teknisk sanningskälla.

67. Motion capture och 3D-retargeting ska granskas.

68. Externa mediabibliotek ska bedömas genom en leverantörsmatris.

69. GainPilot ska stödja ett hybridbibliotek av licensierat och eget material.

70. En canonical övningsinventering ska skapas före storskalig mediaproduktion.

71. De första övningarna ska utgå från riktiga program och användarbehov.

72. Övningsdata och relationer ska ha provenance.

73. Övningar och media ska ha granskningsstatus.

74. Canonical data ska kunna avpubliceras utan att historiken förstörs.

75. Dubblettkontroll ska använda faktisk rörelsedefinition och inte endast namn.

76. Användarskapade övningar ska vara privata som standard.

77. Återkommande okända övningar kan skapa canonical granskningsförslag.

78. Externa övningsnamn ska normaliseras med osäkerhetskontroll.

79. Sökning och filter ska vara kontextstyrda.

80. Favoriter får påverka rangordningen men inte säkerhetsregler.

81. GainPilot ska skilja mellan ogillade, blockerade och säkerhetsblockerade övningar.

82. Substitutionshistorik ska användas för korrigerbar personalisering.

83. Aggregerade populationsinsikter får inte automatiskt definiera canonical kvalitet.

84. Arnold ska vara den användarnära övningscoachen.

85. Atlas ska stödja research, grafkvalitet, dubblettanalys och leverantörsbedömning.

86. Hermes ska minimera användarkontexten till vad substitutionsbeslutet behöver.

87. Atlas ska kunna genomföra kontrollerad omvärldsbevakning.

88. Övningsgrafen och substitutionsmotorn ska testas genom scenario-, säkerhets-, regressions- och simuleringstester.

89. Media ska genomgå funktionell, teknisk, licensmässig och tillgänglighetsrelaterad testning.

90. Substitutionsbeslut ska vara observerbara och spårbara.

91. Betydelsefulla permanenta byten ska ha förändringshistorik.

92. Användaren ska kunna återställa byten när säkerhetsreglerna tillåter det.

93. Canonical identitetsändringar ska genomföras genom kontrollerad migration.

94. Externa integrationer får inte skriva direkt till canonical graf.

95. Grundläggande övningsinformation ska kunna användas vid tillfällig offline-situation.

96. Tillgänglighet och lokalisering ska ingå i övningssystemets kärna.

97. Förändringar av graf, motor och säkerhetsfilter ska ske på separat branch.

98. Alla förändringar ska testas, granskas och merga kontrollerat.

99. Agentautonomi i övningsdomänen ska vara explicit, begränsad och återkallelig.

100. Canonical övningsgraf ska fungera som gemensam kunskapskälla för hela GainPilot.

10.103 IMPLEMENTERINGSORDNING

GainPilots övningsgraf och substitutionsmotor ska implementeras stegvis.

Fas 1 — Canonical övningsidentitet

Implementera:

- stabil övningsidentifierare,

- canonical namn,

- svenska och engelska visningsnamn,

- synonymer,

- övningsfamilj,

- och versionsstatus.

Fas 2 — Grundläggande övningsmetadata

Implementera:

- rörelsemönster,

- primära muskler,

- sekundära muskler,

- utrustning,

- träningsdomän,

- svårighetsgrad,

- och teknikpunkter.

Fas 3 — Första canonical inventeringen

Skapa och granska de övningar som krävs för:

- första styrketräningsprogrammen,

- första hypertrofiprogrammen,

- vanliga nybörjarprogram,

- och de viktigaste substitutionsfallen.

Fas 4 — Grundläggande substitutionsrelationer

Implementera:

- nästan likvärdig,

- starkt alternativ,

- acceptabel kompromiss,

- och tillfälligt nödalternativ.

Relationer ska börja med vanliga och tydliga fall.

Fas 5 — Substitutionsmotor v1

Implementera:

- orsak till byte,

- utrustningsfilter,

- blockeringar,

- användarpreferens,

- programfunktion,

- rangordning,

- och begränsat rekommendationsurval.

Fas 6 — Reservövningar och giltighet

Implementera:

- fördefinierade reservövningar,

- tillfälligt byte,

- permanent byte,

- giltighetstid,

- förändringshistorik,

- och återställning.

Fas 7 — Progressioner och regressioner

Implementera:

- förkunskapsrelationer,

- framgångskriterier,

- regressioner,

- progressioner,

- sidosteg,

- och kvalitetsstatus.

Fas 8 — Övningsmedia v1

Implementera:

- huvudanimation,

- sidovinkel,

- kort instruktion,

- muskelmarkering,

- licensmetadata,

- och granskningsstatus.

Börja med P0-övningar.

Fas 9 — Externa leverantörer

Implementera:

- leverantörsmatris,

- importadapter,

- rättighetskontroll,

- canonical matchning,

- och leverantörsoberoende medielager.

Fas 10 — Personlig substitutionsrangordning

Implementera:

- historiska val,

- feedback,

- tidigare resultat,

- och korrigerbara personliga preferenser.

Fas 11 — CrossFit-graf

Implementera:

- scaling,

- rörelsestandard,

- no-rep,

- workoutfunktion,

- och CrossFit-specifika substitutioner.

Fas 12 — Calisthenics-graf

Implementera:

- skills,

- parallella progressioner,

- regressioner,

- assistansnivåer,

- kvalitetskriterier,

- och lokal belastningshantering.

Fas 13 — Konditionssubstitutioner

Implementera:

- gång,

- löpning,

- cykling,

- maskinalternativ,

- intensitetsmatchning,

- och belastningskompromisser.

Fas 14 — Fördjupad grafintelligens

Implementera:

- kvalitetsklassificering,

- avancerad substitutionsscore,

- grafsimulering,

- dubblettanalys,

- automatiska granskningsförslag,

- och plattformsanalys.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- pull request,

- granskning,

- kontrollerad merge,

- och resultatuppföljning.

10.104 FRAMGÅNGSKRITERIER

Kapitel 10:s vision är framgångsrikt realiserad när:

- varje övning har en stabil canonical identitet,

- övningsnamn och synonymer kan lokaliseras utan att historiken bryts,

- betydelsefulla varianter representeras separat,

- programgeneratorn förstår övningarnas funktion,

- användaren snabbt kan byta en upptagen övning,

- bytesorsaken påverkar rekommendationen,

- säkerhetsbegränsningar filtrerar bort olämpliga alternativ,

- substitutionsmotorn bevarar programmets huvudsyfte,

- Arnold visar ett begränsat antal relevanta alternativ,

- användaren förstår kompromissen vid ett icke-likvärdigt byte,

- tillfälliga och permanenta byten hålls åtskilda,

- övningsbyten inte förstör veckans rörelse- eller belastningsbalans,

- nya övningar får egen kalibrering och prestationshistorik,

- användaren kan låsa och blockera övningar,

- professionella begränsningar respekteras,

- calisthenicsprogressioner kan representeras som villkorade färdighetsgrafer,

- CrossFit-rörelser kan representera scaling och standarder,

- konditionsaktiviteter kan bytas med tydligt förklarade kompromisser,

- övningsmedia är kopplat till rätt canonical identitet,

- animationer är tekniskt korrekta och licensierade,

- AI-genererat material granskas före publicering,

- GainPilot kan kombinera externt och eget media utan total leverantörsinlåsning,

- övningsinventeringen styr mediaproduktionen,

- användarskapade övningar hålls privata tills de granskats,

- importerade övningar normaliseras utan tysta felmatchningar,

- användarens substitutionshistorik förbättrar framtida förslag,

- Atlas kan identifiera grafproblem utan att direkt ändra canonical data,

- Hermes begränsar användarkontexten till relevant information,

- övningsgrafen är versionerad och migrerbar,

- substitutionsbeslut är observerbara,

- och alla förbättringar genomförs via separat branch, tester, pull request och kontrollerad merge.

10.105 SAMMANFATTNING

GainPilots övningsgraf ska vara den gemensamma kunskapsgrunden för hur plattformen förstår rörelse, övningar, variationer, progressioner och substitutioner.

En övning ska inte reduceras till:

- ett namn,

- en bild,

- och en markerad muskel.

Den ska representeras genom:

- canonical identitet,

- rörelsemönster,

- muskler,

- utrustning,

- teknisk nivå,

- programfunktion,

- belastningsmöjlighet,

- trötthetsprofil,

- progressioner,

- regressioner,

- substitutionsrelationer,

- media,

- provenance,

- och granskningsstatus.

Substitutionsmotorn ska förstå varför användaren vill byta övning.

Ett byte på grund av:

- upptagen utrustning,

- tidsbrist,

- preferens,

- teknisk osäkerhet,

- eller smärta

ska inte hanteras på samma sätt.

Säkerhetsfilter ska alltid ha företräde.

Därefter ska motorn rangordna relevanta alternativ utifrån programmets syfte och användarens situation.

Arnold ska visa ett fåtal tydliga alternativ och förklara:

- vad som bevaras,

- vad som förändras,

- och om bytet är lämpligt tillfälligt eller permanent.

GainPilot ska förstå att två övningar kan vara likvärdiga inom en viss funktion men olika inom en annan.

En maskinpress kan vara ett starkt alternativ för hypertrofi men inte för specifik bänkpressträning.

En cykelaktivitet kan bevara lågintensivt konditionsarbete men inte ge exakt samma löpbelastning.

En regression inom calisthenics ska bevara relevanta delar av färdigheten utan att behandlas som misslyckande.

Övningsmedia ska kopplas till canonical identitet och vara:

- tekniskt granskat,

- versionshanterat,

- licensierat,

- lokaliserat,

- och tillgängligt.

GainPilots visuella identitet får vara mörk, levande och modern.

Rörelsens tydlighet och korrekthet ska alltid väga tyngre än den visuella effekten.

AI kan användas för produktion och styling men får inte ensam definiera tekniken.

Atlas ska hjälpa GainPilot med research, källor, leverantörer, dubbletter och grafkvalitet.

Hermes ska begränsa användarkontexten till det substitutionsbeslutet faktiskt behöver.

Canonical övningsgraf får aldrig ändras direkt genom en okontrollerad agenthandling.

Alla förändringar ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- teknisk granskning,

- pull request,

- kontrollerad merge,

- versionering,

- och uppföljning.

Kapitel 10 etablerar därmed följande kärnprincip:

GainPilot ska inte erbjuda en stor lista med övningar och lämna användaren att själv förstå vilka som passar. Plattformen ska bygga en canonical kunskapsgraf som förstår varje övnings funktion och relationer, så att Arnold snabbt kan hitta det bästa relevanta alternativet utan att programmets mål, progression, säkerhet eller långsiktiga logik går förlorad.
