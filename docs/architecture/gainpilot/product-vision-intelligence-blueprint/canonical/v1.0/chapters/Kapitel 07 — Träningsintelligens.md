# Kapitel 07 — Träningsintelligens

GainPilots träningsintelligens ska omvandla användarens mål, förutsättningar, träningshistorik och verkliga resultat till ett sammanhängande och kontinuerligt anpassningsbart träningssystem.

Träningsintelligensen ska inte enbart generera träningspass.

Den ska förstå varför ett program ser ut som det gör, vilken funktion varje del fyller, hur användaren reagerar på upplägget och när planen bör behållas, justeras eller byggas om.

Systemet ska kunna hjälpa användare som vill:

- bygga muskler,

- bli starkare,

- gå ned i vikt,

- gå upp i vikt,

- förbättra konditionen,

- kombinera flera mål,

- utvecklas inom CrossFit,

- lära sig calisthenicsfärdigheter,

- återvända efter ett träningsuppehåll,

- eller skapa en hållbar träningsrutin.

GainPilot ska stödja dessa mål genom ett gemensamt intelligent fundament, men får inte använda samma programmeringsmodell för alla träningsformer.

Traditionell styrketräning, hypertrofi, styrkelyft, CrossFit, calisthenics och kondition har gemensamma principer kring belastning, progression och återhämtning, men de representerar prestation och utveckling på olika sätt.

Träningsintelligensen ska därför bestå av:

- en gemensam träningsmodell,

- domänspecifika regler,

- en canonical övningsgraf,

- en programmodell,

- en progressionsmotor,

- en substitutionsmotor,

- en belastnings- och återhämtningsmodell,

- en analysmodell,

- och en kontrollerad anpassningsprocess.

Arnold ska vara användarens coach och förklara träningsbesluten.

Atlas ska hjälpa Arnold med bredare analys, minne, research och relevant Omnira-kontext.

Hermes ska kontrollera vilken information som får användas.

Träningsintelligensen ska följa användarens valda kontrollnivå och GainPilots säkerhets-, integritets- och förklarbarhetskrav.

Grundprincipen är:

GainPilot ska inte endast tala om vad användaren ska träna. Plattformen ska förstå vad träningen försöker åstadkomma, följa vad som faktiskt händer och förbättra upplägget utan att göra det instabilt.

7.1 TRÄNINGSINTELLIGENS ÄR MER ÄN PROGRAMGENERERING

Ett genererat träningsprogram är endast en startpunkt.

Ett verkligt intelligent träningssystem måste även kunna:

- förstå programmets syfte,

- följa genomförandet,

- registrera avvikelser,

- tolka resultat,

- upptäcka mönster,

- justera progression,

- hantera missade pass,

- föreslå övningsbyten,

- anpassa träningsveckan,

- och förklara förändringar.

Ett system som skapar ett program men därefter lämnar användaren ensam är inte en långsiktig coach.

Ett system som ändrar programmet efter varje mindre avvikelse är inte heller intelligent.

GainPilot ska balansera:

- stabilitet,

- anpassning,

- användarkontroll,

- och långsiktig progression.

Träningsintelligensen ska arbeta i en återkommande cykel:

Förstå användaren

→ Definiera träningsmålet

→ Skapa programstruktur

→ Planera träningspass

→ Stödja genomförandet

→ Registrera relevanta resultat

→ Analysera utvecklingen

→ Identifiera behov av förändring

→ Anpassa inom rätt mandat

→ Förklara förändringen

→ Följa upp resultatet

Varje steg ska kunna spåras till användarens mål och GainPilots canonical regler.

7.2 DEN KANONISKA TRÄNINGSMODELLEN

GainPilot ska ha en canonical träningsmodell som används av:

- Arnold,

- Atlas,

- programgeneratorn,

- progressionsmotorn,

- övningsgrafen,

- substitutionsmotorn,

- träningsloggen,

- analysfunktionerna,

- och externa integrationer.

Modellen ska kunna representera minst följande nivåer:

1. Långsiktig träningsinriktning.

2. Träningsfas eller programblock.

3. Träningsvecka eller mikrocykel.

4. Träningspass.

5. Passdel.

6. Övning eller aktivitet.

7. Arbetsset, intervall, runda eller försök.

8. Registrerat resultat.

9. Analys och utvärdering.

10. Anpassningsbeslut.

7.2.1 Långsiktig träningsinriktning

Den långsiktiga inriktningen beskriver vad träningen huvudsakligen ska utveckla över en längre period.

Exempel:

- generell styrka,

- hypertrofi,

- viktnedgång med muskelbevarande,

- förbättrad kondition,

- CrossFit-kapacitet,

- eller utveckling av calisthenicsfärdigheter.

7.2.2 Programblock

Ett programblock ska ha ett definierat syfte och en förväntad tidsperiod.

Exempel:

- grundträning,

- volymblock,

- styrkeblock,

- teknikblock,

- deload,

- återstartsblock,

- eller tävlingsförberedelse.

Blockets syfte ska påverka:

- övningsurval,

- volym,

- intensitet,

- progression,

- och framgångskriterier.

7.2.3 Träningsvecka

Träningsveckan beskriver hur belastning, träningsformer och återhämtning organiseras över flera dagar.

Veckan får inte behandlas som en lista av isolerade pass.

GainPilot ska förstå relationen mellan passen.

7.2.4 Träningspass

Ett träningspass ska ha:

- ett huvudsyfte,

- en beräknad tidsåtgång,

- en prioriteringsordning,

- definierade aktiviteter,

- och en reservversion vid tidsbrist.

7.2.5 Passdel

Ett pass kan bestå av olika delar, exempelvis:

- uppvärmning,

- teknik,

- huvudövning,

- kompletterande styrka,

- hypertrofi,

- skill-träning,

- konditionsdel,

- cooldown,

- eller mobilitet.

Detta är särskilt viktigt för CrossFit och kombinerade pass.

7.2.6 Övning eller aktivitet

Varje aktivitet ska kopplas till canonical övnings- eller aktivitetsdata och programmets syfte.

7.2.7 Arbetsenhet

En arbetsenhet kan exempelvis vara:

- set,

- repetitionsserie,

- intervall,

- runda,

- tidshållning,

- distans,

- isometrisk hålltid,

- eller tekniskt försök.

GainPilot får inte anta att all träning kan representeras som vanliga set och repetitioner.

7.3 PROGRAMMET SKA UTGÅ FRÅN ETT TYDLIGT SYFTE

Varje program ska byggas utifrån ett uttalat mål och en definierad prioritering.

Programmet ska kunna svara på:

- vilket huvudmål som prioriteras,

- vilka sekundära mål som stöds,

- vad som endast ska bevaras,

- vilka praktiska begränsningar som finns,

- och vilka kompromisser som har accepterats.

Exempel:

Huvudmål:

Muskelbyggnad.

Sekundärt mål:

Ökad styrka i bänkpress.

Bevarandemål:

Grundläggande kondition.

Begränsning:

Tre träningsdagar och högst 60 minuter per pass.

Konsekvens:

Programmet prioriterar helkroppsträning tre gånger per vecka, extra bröstvolym och två korta lågintensiva konditionspass.

Programmet får inte innehålla aktiviteter enbart för att de är populära eller varierade.

Varje betydelsefull del ska ha en funktion.

7.4 PROGRAMGENERERING SKA VARA REGELSTYRD OCH KONTEXTBASERAD

GainPilot ska kunna generera träningsprogram, men genereringen ska inte bygga på fri textproduktion utan strukturella kontrakt.

Programgeneratorn ska använda:

- användarens mål,

- träningsnivå per domän,

- tillgängliga dagar,

- passlängd,

- utrustning,

- övningskännedom,

- preferenser,

- begränsningar,

- aktuell träningshistorik,

- och vald kontrollnivå.

Den ska även tillämpa domänspecifika regler.

Ett hypertrofiprogram kan kräva analys av:

- muskelgruppsfördelning,

- volym,

- träningsfrekvens,

- övningsvariation,

- och trötthetskostnad.

Ett styrkeprogram kan kräva större fokus på:

- specificitet,

- huvudlyft,

- intensitet,

- teknikexponering,

- och belastningsprogression.

Ett CrossFit-upplägg kan kräva analys av:

- rörelsevariation,

- energisystem,

- workoutformat,

- skalning,

- och kombinerad systemisk belastning.

Ett calisthenicsupplägg kan kräva:

- färdighetsprogression,

- förkunskapskrav,

- teknikfrekvens,

- assistansnivå,

- och kvalitetsbedömning.

Programgeneratorn ska kunna förklara varför den valda strukturen passar användaren.

7.5 PROGRAMMALLAR OCH PERSONLIG ANPASSNING

GainPilot får använda programmallar.

Välbyggda mallar kan ge:

- stabilitet,

- beprövad struktur,

- enklare verifiering,

- och snabbare programgenerering.

En mall får däremot inte behandlas som ett färdigt personligt program.

Mallen ska anpassas efter:

- antal träningsdagar,

- tillgänglig tid,

- träningsmiljö,

- erfarenhet,

- målprioritet,

- övningsbegränsningar,

- återhämtning,

- och tidigare resultat.

GainPilot ska skilja mellan:

- canonical mall,

- anpassad programinstans,

- användarens aktiva program,

- och historisk programversion.

Om en mall uppdateras ska befintliga användares aktiva program inte tyst förändras.

En mallförändring kan i stället leda till:

- nytt förslag,

- granskningspost,

- eller tillämpning vid nästa programblock.

7.6 TRÄNINGSFREKVENS

GainPilot ska välja träningsfrekvens utifrån mer än användarens ambition.

Systemet ska väga:

- mål,

- erfarenhet,

- tillgängliga dagar,

- passlängd,

- återhämtningsförmåga,

- övrig aktivitet,

- och tidigare följsamhet.

Användaren kan ange:

- önskad frekvens,

- normal genomförbar frekvens,

- och minsta acceptabla frekvens.

Programmet ska i första hand byggas för den frekvens användaren sannolikt kan genomföra.

Om användaren önskar fem pass men regelbundet endast kan genomföra tre ska GainPilot inte fortsätta behandla femdagarsprogrammet som idealet utan omprövning.

Arnold ska kunna säga:

Du vill gärna träna fem dagar, men tre dagar har fungerat konsekvent. Jag rekommenderar att vi bygger ett komplett tredagarsprogram och använder ett fjärde pass som valbart tillägg.

Träningsfrekvens ska vara ett programmeringsbeslut, inte ett mått på användarens värde eller disciplin.

7.7 PASSLÄNGD OCH PRIORITERING

Varje träningspass ska kunna genomföras inom den planerade tiden under normala förhållanden.

GainPilot ska uppskatta tidsåtgång utifrån:

- antal övningar,

- antal set,

- vilotider,

- utrustningsbyten,

- uppvärmning,

- och eventuella superset eller intervaller.

Om passet riskerar att bli för långt ska systemet prioritera.

Varje aktivitet kan ha en prioritet, exempelvis:

- kritisk,

- hög,

- normal,

- valbar,

- eller endast om tid finns.

När tiden minskar ska GainPilot inte slumpmässigt ta bort den sista övningen.

Systemet ska bevara passets huvudsyfte.

Exempel:

Fullt pass:

60 minuter.

Kortversion:

35 minuter.

Behålls:

Bänkpress, rodd och benövning.

Reducerat:

Isolerande axelarbete.

Borttaget:

Valfri armfinisher.

Arnold ska kunna förklara vad kortversionen bevarar och vad som går förlorat.

7.8 ÖVNINGSURVAL

Övningsurval ska utgå från programmets funktion och användarens förutsättningar.

GainPilot ska kunna bedöma övningar utifrån:

- rörelsemönster,

- primära muskler,

- sekundära muskler,

- belastningsprofil,

- träningsdomän,

- stabilitetskrav,

- tekniksvårighet,

- utrustning,

- trötthetskostnad,

- progressionsmöjlighet,

- användarpreferens,

- och säkerhetsbegränsning.

En övning ska inte väljas enbart för att den tränar rätt muskelgrupp.

Exempel:

Bänkpress och kabel-flyes kan båda belasta bröstmuskulaturen, men de fyller olika funktioner.

Bänkpress kan ge:

- större extern belastning,

- tydligare styrkeprogression,

- och större bidrag från triceps och främre axel.

Kabel-flyes kan ge:

- lägre stabilitetskrav,

- mer isolerat muskelarbete,

- och annan belastningsprofil.

GainPilot ska förstå dessa skillnader när programmet byggs eller en övning ersätts.

7.9 ÖVNINGSORDNING

Övningarnas ordning ska vara avsiktlig.

GainPilot ska kunna prioritera:

- tekniskt krävande rörelser,

- huvudlyft,

- högprioriterade muskelgrupper,

- explosiva moment,

- eller viktiga färdigheter

innan tröttheten blir för hög.

Ordningen kan även påverkas av:

- utrustning,

- tidsbegränsning,

- superset,

- säkerhet,

- och användarens mål.

Ett pass ska inte automatiskt sorteras efter en statisk regel.

Exempel:

En användare som prioriterar bänkpress kan börja med bänkpress.

En annan användare med handstående som huvudmål kan behöva göra teknikträningen innan tung pressvolym.

CrossFit-pass kan kräva annan ordning mellan:

- teknik,

- styrka,

- och workout.

Arnold ska kunna förklara varför ordningen valts när det är relevant.

7.10 UPPVÄRMNING

GainPilot ska kunna skapa uppvärmning som är proportionerlig mot aktiviteten.

Uppvärmningen ska inte vara samma generiska rutin före alla pass.

Den kan bestå av:

- allmän temperaturhöjning,

- rörelsespecifik förberedelse,

- teknisk repetition,

- gradvis belastningsökning,

- och vid behov riktad mobilitet.

För styrketräning ska GainPilot kunna skapa uppvärmningsset utifrån:

- arbetsvikt,

- övning,

- erfarenhet,

- och dagens beredskap.

För tekniskt krävande CrossFit- eller tyngdlyftningsrörelser kan uppvärmningen behöva innehålla rörelsedelar och teknikprogression.

För calisthenics kan uppvärmningen behöva förbereda:

- handleder,

- axlar,

- skulderkontroll,

- och specifika positioner.

Uppvärmning ska skapa beredskap utan att orsaka onödig trötthet.

7.11 TRÄNINGSVOLYM

GainPilot ska kunna representera och analysera träningsvolym på flera sätt.

Beroende på domän kan volym beskrivas genom:

- antal arbetsset,

- repetitioner,

- extern belastning,

- tid under arbete,

- distans,

- rundor,

- försök,

- eller exponeringar för en färdighet.

Volym ska inte reduceras till en enda universell siffra.

För hypertrofi kan antal relevanta arbetsset per muskelgrupp vara viktigt.

För styrka kan volym i huvudlyft och intensitetsfördelning vara mer relevant.

För calisthenics kan antal kvalitativa försök och total hålltid vara centralt.

För kondition kan tid och distans vid olika intensiteter vara viktigare.

GainPilot ska även förstå att två set inte alltid har samma träningsvärde eller trötthetskostnad.

Volymanalysen ska sättas i relation till:

- intensitet,

- teknik,

- närhet till utmattning,

- återhämtning,

- och användarens träningsnivå.

7.12 INTENSITET

Intensitet ska kunna representeras domänspecifikt.

Inom styrketräning kan det exempelvis vara:

- procent av max,

- RPE,

- RIR,

- belastning,

- eller repetitionssvårighet.

Inom kondition kan det vara:

- tempo,

- puls,

- effekt,

- upplevd ansträngning,

- eller intensitetszon.

Inom calisthenics kan intensitet påverkas av:

- hävarm,

- assistans,

- rörelseomfång,

- teknikstandard,

- och variantens svårighet.

Inom CrossFit kan intensiteten även påverkas av:

- workoutstruktur,

- tidsgräns,

- rörelsekombination,

- och täthet mellan arbetsperioder.

GainPilot ska inte blanda samman olika intensitetsmått utan normalisering och förklaring.

Arnold ska använda den representation som passar användarens erfarenhet.

7.13 RPE OCH RIR

GainPilot ska kunna stödja RPE och RIR när det passar användaren och träningsformen.

RIR beskriver ungefär hur många repetitioner användaren bedömer fanns kvar.

RPE beskriver upplevd ansträngning enligt en definierad skala.

Dessa värden är användbara men subjektiva.

GainPilot ska därför:

- introducera begreppen pedagogiskt,

- kalibrera användarens förståelse,

- jämföra med faktisk prestation,

- och undvika att behandla varje skattning som exakt.

En nybörjare kan använda enklare val:

- lätt,

- lagom,

- tungt,

- eller mycket tungt.

En erfaren användare kan använda exaktare RPE- eller RIR-värden.

Arnold ska kunna upptäcka möjliga kalibreringsproblem.

Exempel:

Användaren registrerar regelbundet RIR 3 men misslyckas på nästa repetition.

Systemet kan då föreslå att RIR-skattningen kalibreras, inte omedelbart anta att användaren är oärlig eller att programmet är fel.

7.14 PROGRESSION

GainPilot ska ha en explicit progressionsmodell.

Progression kan innebära mer än att höja vikten.

Den kan ske genom:

- högre belastning,

- fler repetitioner,

- fler kvalitativa set,

- bättre teknik,

- större rörelseomfång,

- lägre assistans,

- längre hålltid,

- snabbare tid,

- längre distans,

- bättre rörelsekvalitet,

- eller lägre upplevd ansträngning vid samma arbete.

Progressionsformen ska matcha målet och träningsdomänen.

GainPilot ska kunna använda flera progressionsstrategier, exempelvis:

- linjär progression,

- dubbel progression,

- vågformad belastning,

- blockbaserad progression,

- autoreglering,

- eller färdighetsbaserad progression.

Strategin ska inte väljas för att den är avancerad.

Den ska väljas för att den passar användaren.

7.15 DUBBEL PROGRESSION

Dubbel progression kan användas när användaren arbetar inom ett repetitionsintervall.

Exempel:

Mål:

3 set med 8–12 repetitioner.

Användaren behåller vikten tills alla planerade set når det övre repetitionsmålet med godkänd teknik och rimlig ansträngning.

Därefter höjs belastningen och repetitionerna kan återgå mot den nedre delen av intervallet.

GainPilot ska kunna ta hänsyn till:

- setens kvalitet,

- RIR eller RPE,

- viktökningens storlek,

- och normal variation.

Systemet ska inte höja vikten enbart för att det första setet nådde övre repetitionsgränsen om resterande set inte gjorde det.

7.16 LINJÄR PROGRESSION

Linjär progression kan passa:

- nybörjare,

- återvändande användare,

- eller rörelser där snabb tidig utveckling är möjlig.

GainPilot ska kunna öka belastning eller arbetsmängd enligt en enkel regel.

Systemet ska samtidigt ha definierade kriterier för när den linjära progressionen inte längre fungerar.

Exempel:

Om användaren misslyckas med samma mål flera gånger ska GainPilot inte fortsätta höja eller kräva samma progression utan analys.

Möjliga åtgärder kan vara:

- behålla belastning,

- minska belastning,

- sänka repetitionsmål,

- ändra volym,

- förbättra teknik,

- eller byta progressionsmodell.

7.17 AUTOREGLERING

Autoreglering innebär att träningsbelastningen anpassas efter användarens dagsform och prestation inom definierade gränser.

GainPilot kan använda:

- uppvärmningsset,

- RPE eller RIR,

- tidigare resultat,

- rapporterad återhämtning,

- och faktisk prestationskvalitet.

Autoreglering får inte innebära att hela programmet styrs av dagskänsla.

Den ska arbeta inom en planerad struktur.

Exempel:

Planerad arbetsvikt:

100 kilogram.

Tillåtet autoregleringsintervall:

95–102,5 kilogram.

Om uppvärmningen känns ovanligt tung och tidigare återhämtningssignaler är svaga kan Arnold föreslå den lägre delen av intervallet.

Större avvikelser ska kräva tydligare analys eller godkännande beroende på användarens kontrollnivå.

7.18 PROGRESSION FÖR CALISTHENICS

Calisthenicsprogression ska inte begränsas till fler repetitioner.

GainPilot ska kunna representera:

- progression till svårare variant,

- minskad assistans,

- längre hävarm,

- längre hålltid,

- större rörelseomfång,

- bättre balans,

- bättre linje,

- och högre rörelsekvalitet.

En färdighetsprogression ska kunna innehålla:

- förkunskapskrav,

- rekommenderad grundstyrka,

- aktuellt steg,

- framgångskriterier,

- regression,

- och nästa rimliga steg.

Exempel:

Handstående mot vägg

→ Kontrollerade tåsläpp

→ Korta fria håll

→ Längre fria håll

→ Kontrollerad ingång

GainPilot ska inte flytta användaren till nästa steg enbart utifrån tid eller antal försök.

Teknisk kvalitet och säkerhet ska ingå i bedömningen.

7.19 PROGRESSION FÖR CROSSFIT

CrossFit-progression kan ske inom flera samtidiga kapaciteter:

- styrka,

- olympiska lyft,

- gymnastiska färdigheter,

- kondition,

- workoutstrategi,

- och skalningsnivå.

GainPilot ska kunna skilja mellan förbättring genom:

- högre belastning,

- snabbare tid,

- fler rundor,

- bättre rörelsestandard,

- mindre skalning,

- jämnare tempo,

- eller lägre upplevd ansträngning.

Systemet ska inte automatiskt jämföra två workouts som om de vore identiska när:

- vikten ändrats,

- rörelsevarianten ändrats,

- time cap ändrats,

- eller rörelsestandarden varit annorlunda.

Resultat behöver normaliseras och sättas i rätt kontext.

7.20 PROGRESSION FÖR KONDITION

Konditionsprogression kan ske genom:

- längre tid,

- längre distans,

- högre tempo,

- fler intervaller,

- kortare vila,

- lägre ansträngning vid samma fart,

- eller högre kapacitet inom rätt intensitetszon.

GainPilot ska inte öka alla variabler samtidigt.

Systemet ska kontrollera belastningsökningen och ta hänsyn till användarens övriga träning.

En nybörjare inom löpning kan exempelvis utvecklas genom:

- fler sammanhängande löpminuter,

- färre gångpauser,

- eller längre total aktivitetstid.

En erfaren löpare kan behöva mer detaljerad planering av:

- lugna pass,

- tröskelpass,

- intervaller,

- och långpass.

Den första GainPilot-versionen kan ha begränsat konditionsdjup, men datamodellen ska stödja fortsatt utveckling.

7.21 PLATÅER

En platå ska inte definieras utifrån ett enskilt stillastående resultat.

GainPilot ska bedöma om progressionen faktiskt har stannat genom flera signaler.

Det kan exempelvis vara:

- utebliven förbättring över flera relevanta pass,

- ökad ansträngning vid samma prestation,

- försämrad teknik,

- låg följsamhet,

- eller återkommande misslyckanden.

Systemet ska därefter försöka identifiera möjlig orsak.

Möjliga orsaker kan vara:

- otillräcklig träningsstimulans,

- för hög trötthet,

- olämplig progression,

- bristande teknik,

- för låg följsamhet,

- målkonflikt,

- otillräckligt energiintag,

- eller normal långsammare utveckling.

GainPilot får inte använda samma lösning för alla platåer.

Mer volym är inte alltid svaret.

Mindre volym är inte alltid svaret.

En ny övning är inte alltid svaret.

7.22 DELOAD OCH ÅTERHÄMTNINGSVECKOR

GainPilot ska kunna planera och föreslå perioder med reducerad belastning när det finns ett tydligt syfte.

En deload kan innebära minskning av:

- volym,

- intensitet,

- träningsfrekvens,

- eller en kombination.

Deload ska inte användas automatiskt efter ett statiskt antal veckor för alla användare.

Den kan vara:

- planerad,

- signalstyrd,

- eller kopplad till programövergång.

Relevanta signaler kan vara:

- ökande trötthet,

- fallande prestation,

- högre upplevd ansträngning,

- återkommande teknikförsämring,

- och minskad motivation i kombination med andra signaler.

GainPilot ska förklara att en återhämtningsvecka är en del av progressionen, inte ett misslyckande.

7.23 MISSAT TRÄNINGSPASS

När användaren missar ett pass ska GainPilot bedöma situationen i stället för att automatiskt flytta eller ta bort passet.

Systemet ska kunna ta hänsyn till:

- vilket pass som missades,

- orsaken,

- resten av veckan,

- återhämtningen,

- målprioriteten,

- och kommande träningspass.

Möjliga åtgärder kan vara:

- flytta passet,

- slå samman vissa delar,

- använda en kortversion,

- hoppa över passet,

- eller justera nästa vecka.

GainPilot ska undvika att skapa en skuld där missade pass staplas på framtiden.

Exempel:

Ett missat måndagspass ska inte automatiskt innebära två fulla pass på tisdag om det skapar en olämplig belastning.

Arnold ska kunna säga:

Vi hoppar över måndagens mindre prioriterade pass och fortsätter med onsdagens plan. Att försöka pressa in allt skulle försämra resten av veckan.

7.24 ÄNDRAD TRÄNINGSDAG

Användaren ska enkelt kunna flytta ett träningspass.

GainPilot ska analysera hur flytten påverkar:

- återhämtning,

- muskelgrupper,

- huvudlyft,

- kondition,

- och resten av veckan.

Systemet ska kunna skilja mellan:

- en engångsflytt,

- en tillfällig veckoförändring,

- och en permanent schemaändring.

En engångsflytt ska inte automatiskt skriva om användarens normala preferenser.

Om samma flytt återkommer kan Arnold fråga om grundschemat bör ändras.

7.25 ÖVNINGSBYTE

Övningsbyten ska vara enkla för användaren men intelligenta under ytan.

GainPilot ska först förstå orsaken till bytet.

Vanliga orsaker är:

- utrustningen är upptagen,

- utrustningen saknas,

- smärta eller obehag,

- teknisk osäkerhet,

- tidsbrist,

- låg motivation,

- användarpreferens,

- eller planerad variation.

Substitutionsmotorn ska därefter försöka bevara:

- rörelsemönster,

- primärt träningssyfte,

- relevant muskelbelastning,

- progressionsmöjlighet,

- och lämplig trötthetsnivå.

Ett fullständigt likvärdigt byte finns inte alltid.

Arnold ska då förklara kompromissen.

Exempel:

Den här ersättningen tränar samma primära muskel men ger lägre möjlighet till tung belastningsprogression. Den fungerar bra som tillfälligt byte i dag men bör inte automatiskt ersätta huvudövningen permanent.

7.26 TILLFÄLLIGA OCH PERMANENTA BYTEN

GainPilot ska skilja mellan:

- byte för ett set,

- byte för ett pass,

- byte för en vecka,

- byte för ett programblock,

- och permanent byte.

Exempel:

Kabelstationen är upptagen.

Lösning:

Tillfälligt byte under dagens pass.

Användaren upplever återkommande obehag i övningen.

Lösning:

Övningen blockeras tillfälligt och kräver omprövning.

Användaren föredrar konsekvent en likvärdig variant.

Lösning:

Arnold kan föreslå ett permanent programbyte.

Ett tillfälligt byte ska inte automatiskt förändra framtida program.

7.27 ÖVNINGSBIBLIOTEK OCH ÖVNINGSGRAF

GainPilots övningsbibliotek ska vara mer än en mediakatalog.

Varje övning ska ingå i en strukturerad övningsgraf.

Övningsgrafen ska kunna beskriva relationer som:

- regression till,

- progression från,

- tillfälligt alternativ till,

- permanent alternativ till,

- tekniskt relaterad till,

- samma rörelsemönster som,

- belastar samma primära muskel som,

- kräver samma utrustning som,

- och används inom samma träningsdomän som.

Övningsgrafen ska göra det möjligt för GainPilot att resonera om övningsbyten, programbalans och färdighetsutveckling.

Relationer ska kunna ha:

- typ,

- styrka,

- villkor,

- källa,

- och kvalitetsstatus.

Exempel:

Front squat kan vara ett relevant alternativ till back squat i vissa program, men relationen är inte fullständigt likvärdig.

Villkoren ska kunna beskriva skillnader i:

- belastning,

- teknik,

- muskelbidrag,

- och programmets syfte.

7.28 ÖVNINGSIDENTITET OCH DUBLETTER

GainPilot ska ha canonical identitet för varje övning.

Olika namn ska kunna kopplas till samma övning.

Exempel:

- Romanian deadlift,

- RDL,

- rumänska marklyft,

- och raka marklyft där benämningen faktiskt avser samma variant

kan behöva normaliseras eller särskiljas beroende på utförande.

Systemet får inte slå samman övningar enbart på grund av liknande namn.

Canonical identitet ska baseras på rörelsens faktiska definition.

Varianter med betydelsefulla skillnader ska kunna ha egna identiteter.

Exempel:

- bänkpress med paus,

- touch-and-go-bänkpress,

- smal bänkpress,

- och lutande bänkpress

är relaterade men inte identiska.

7.29 ANIMERADE ÖVNINGSDEMONSTRATIONER

GainPilot ska kunna visa animerade övningsdemonstrationer som en integrerad del av träningsupplevelsen.

Demonstrationen ska kunna visa:

- startposition,

- rörelsebana,

- slutposition,

- andning där relevant,

- primära muskler,

- sekundära muskler,

- vanliga fel,

- och alternativa kameravinklar.

Videon eller animationen ska kopplas till övningens canonical identitet.

Media får inte kopplas enbart genom övningsnamn.

Materialet ska kunna ha metadata för:

- källa,

- licens,

- version,

- produktionsmetod,

- kvalitetsgranskning,

- teknisk granskare,

- språk,

- och tillgängliga format.

GainPilot ska kunna använda en mörkare, levande eller stiliserad bakgrund som passar produktens visuella identitet.

Bakgrunden får inte göra rörelsen svårare att se.

Rörelsens korrekthet ska alltid väga tyngre än visuell effekt.

7.30 AI-GENERERAT ÖVNINGSMATERIAL

AI kan användas i produktionen av övningsmaterial.

Den kan exempelvis hjälpa till med:

- bakgrunder,

- rendering,

- visuell standardisering,

- ljussättning,

- kameravarianter,

- undertexter,

- lokalisering,

- och efterbearbetning.

AI ska inte ensam betraktas som sanningskälla för rörelsens teknik.

AI-genererat eller AI-transformerat övningsmaterial ska granskas för:

- biomekanisk rimlighet,

- korrekt utrustning,

- stabil rörelse över bildrutor,

- korrekt grepp,

- korrekt ledposition,

- och konsekvent rörelsebana.

Tekniskt avancerade rörelser ska ha högre granskningskrav.

Det gäller särskilt:

- olympiska lyft,

- kippingrörelser,

- muscle-ups,

- handstående,

- planche,

- front lever,

- gymnastiska moment,

- och komplexa CrossFit-rörelser.

En snygg animation som lär ut fel teknik får inte publiceras.

7.31 EXTERNA ÖVNINGSBIBLIOTEK

GainPilot ska kunna använda licensierade externa övningsbibliotek.

Innan ett bibliotek integreras ska GainPilot bedöma:

- täckning,

- videokvalitet,

- metadata,

- licens,

- kommersiell användning,

- white-label-rättigheter,

- lagringsrätt,

- API-beroende,

- exportmöjlighet,

- leverantörslåsning,

- och täckning för specialdomäner.

Ett bibliotek med många övningar är inte automatiskt tillräckligt.

GainPilot ska jämföra biblioteket mot den canonical övningslista som produkten faktiskt behöver.

Biblioteket ska kunna kompletteras med eget material.

Den långsiktiga modellen bör därför stödja ett hybridbibliotek:

- licensierat grundmaterial,

- egenproducerade prioriterade övningar,

- och specialproduktion för CrossFit och calisthenics.

7.32 TRÄNINGSLOGGNING

Träningsloggen ska vara snabb, tydlig och anpassad efter aktiviteten.

För styrketräning kan användaren registrera:

- vikt,

- repetitioner,

- set,

- RPE eller RIR,

- tekniknotering,

- och eventuell smärta eller avvikelse.

För kondition kan registreringen omfatta:

- tid,

- distans,

- tempo,

- puls,

- effekt,

- och upplevd ansträngning.

För CrossFit kan den omfatta:

- workoutversion,

- scaling,

- vikt,

- tid,

- rundor,

- repetitioner,

- time cap,

- och rörelsestandard.

För calisthenics kan den omfatta:

- variant,

- assistans,

- repetitioner,

- hålltid,

- rörelseomfång,

- och kvalitetsbedömning.

GainPilot ska förifylla rimliga värden från planen och tidigare pass.

Användaren ska inte behöva bygga loggen från tomt läge varje gång.

7.33 AUTOMATISK REGISTRERING OCH SENSORER

GainPilot ska på sikt kunna använda data från:

- mobiltelefon,

- träningsklocka,

- cykeldator,

- pulsmätare,

- smart utrustning,

- och andra godkända integrationer.

Automatisk data ska inte automatiskt behandlas som perfekt.

Systemet ska kunna hantera:

- saknade värden,

- felaktiga mätningar,

- dubbla aktiviteter,

- tidsförskjutningar,

- och skillnader mellan enheter.

Användaren ska kunna korrigera importerad aktivitetsdata.

Känslig sensor- och hälsodata ska omfattas av starkare behörighets- och integritetsregler.

7.34 TEKNIKBEDÖMNING

GainPilot kan på sikt stödja teknikbedömning genom:

- användarfeedback,

- video,

- sensorer,

- eller godkänd lokal bildanalys.

Teknikbedömning ska beskrivas med rätt säkerhetsnivå.

Systemet får inte påstå att tekniken är säker eller perfekt enbart utifrån begränsad kameravinkel eller osäker analys.

När video används ska GainPilot ta hänsyn till:

- kameravinkel,

- bildkvalitet,

- synliga leder,

- belastning,

- och om hela rörelsen kan bedömas.

Arnold ska kunna säga:

Från den här vinkeln ser knäspårningen stabil ut, men jag kan inte bedöma ryggpositionen tillräckligt säkert. En sidovinkel skulle ge bättre underlag.

Teknikanalys ska stödja användaren, inte skapa falsk diagnostik.

7.35 SMÄRTA UNDER TRÄNING

När användaren rapporterar smärta ska GainPilot skilja mellan:

- normal ansträngning,

- träningsvärk,

- obehag,

- skarp eller akut smärta,

- och återkommande problem.

GainPilot får inte diagnostisera orsaken.

Systemet ska kunna:

- avbryta eller pausa aktuell övning,

- föreslå säkert alternativ när det är rimligt,

- markera begränsningen,

- och rekommendera professionell bedömning när situationen kräver det.

Arnold ska inte försöka programmera runt återkommande skarp smärta utan tillräckligt underlag.

En alternativ övning ska inte presenteras som medicinsk behandling.

7.36 PRESTATIONSANALYS

GainPilot ska analysera prestation över tid.

Analysen kan omfatta:

- belastningsutveckling,

- repetitionstrend,

- volym,

- RPE eller RIR,

- teknik,

- passföljsamhet,

- träningsfrekvens,

- och programfas.

Systemet ska skilja mellan:

- kortsiktig variation,

- relevant trend,

- platå,

- och försämring.

Analysen ska jämföra data som faktiskt är jämförbar.

Exempel:

Ett set med annan teknikstandard, annan rörelsevariant eller annat rörelseomfång får inte automatiskt jämföras som identisk prestation.

Arnold ska sammanfatta den viktigaste betydelsen, inte endast visa siffror.

7.37 UPPSKATTAD STYRKA

GainPilot kan använda uppskattningar av maximal styrka, exempelvis uppskattat 1RM.

Sådana värden ska behandlas som uppskattningar.

De kan påverkas av:

- repetitionsantal,

- teknik,

- trötthet,

- formel,

- och individuell respons.

GainPilot ska inte presentera uppskattat max som ett säkert faktiskt max.

Arnold kan säga:

Din uppskattade styrkenivå har ökat, men värdet bygger på repetitionsset och är inte samma sak som ett testat max.

Användaren ska inte pressas att testa verkligt max bara för att systemet kan beräkna en uppskattning.

7.38 ÅTERHÄMTNINGSANALYS

GainPilot ska använda flera signaler för att bedöma återhämtning.

Det kan exempelvis vara:

- prestationsutveckling,

- upplevd ansträngning,

- sömnupplevelse,

- träningsvärk,

- fysisk trötthet,

- träningsfrekvens,

- övrig aktivitet,

- och användarens egen bedömning.

Ingen enskild signal ska automatiskt definiera återhämtningen.

GainPilot ska vara särskilt försiktigt med att presentera en enkel återhämtningspoäng som objektiv biologisk sanning.

Återhämtningsanalysen ska användas för att stödja beslut, inte ersätta användarens upplevelse.

7.39 TRÄNINGSBELASTNING ÖVER FLERA DOMÄNER

GainPilot ska förstå att användaren kan kombinera:

- styrketräning,

- CrossFit,

- calisthenics,

- löpning,

- cykling,

- promenader,

- idrott,

- och fysisk vardagsaktivitet.

Belastningen från dessa aktiviteter ska analyseras tillsammans när det är relevant.

Systemet ska kunna upptäcka konflikter som:

- tung benstyrka före intervallpass,

- stor mängd dragarbete före muscle-up-träning,

- högintensiv CrossFit-workout efter tung styrka,

- eller kraftigt ökad konditionsvolym under energiunderskott.

GainPilot behöver inte reducera all träning till en enda exakt belastningspoäng.

Systemet ska i stället kunna använda flera domänspecifika signaler och identifiera relevanta överlappningar.

7.40 INTERFERENS MELLAN MÅL

När användaren kombinerar flera mål ska GainPilot bedöma om de:

- stödjer varandra,

- kan samexistera med rimlig prioritering,

- eller konkurrerar om tid och återhämtning.

Exempel:

Muskelbyggnad och måttlig kondition kan kombineras.

Maximal styrkeutveckling och stor löpvolym kan kräva tydligare prioritering.

Avancerad calisthenics och bodybuilding kan kombineras, men press- och dragvolymen behöver samordnas.

CrossFit och separat högvolymstyrka kan skapa dubbel belastning om passen inte koordineras.

Arnold ska förklara kompromisserna.

GainPilot får inte lova maximal utveckling inom alla mål samtidigt.

7.41 TRÄNING UNDER VIKTNEDGÅNG

När användaren befinner sig i energiunderskott ska träningsintelligensen ta hänsyn till:

- lägre återhämtningsmarginal,

- behov av muskelbevarande,

- prestationsvariation,

- hunger,

- och total träningsbelastning.

GainPilot ska normalt försöka behålla relevant styrkestimulus.

Systemet ska inte automatiskt omvandla all träning till lätt högrepetitionsträning bara för att användaren vill gå ned i vikt.

Volym, intensitet och kondition ska anpassas efter:

- underskottets storlek,

- användarens nivå,

- utvecklingen,

- och återhämtningen.

Träningsmotorn och kostmotorn ska samverka.

7.42 TRÄNING UNDER VIKTUPPGÅNG OCH MUSKELBYGGNAD

Vid viktuppgång eller muskelbyggnad ska GainPilot följa relationen mellan:

- energiintag,

- kroppsvikt,

- träningsprestation,

- volym,

- och återhämtning.

Systemet ska inte anta att större viktuppgång automatiskt innebär bättre muskelutveckling.

Träningsprogrammet ska ge en tillräcklig och progressiv stimulans.

Om kroppsvikten ökar men träningen saknar progression kan GainPilot behöva analysera:

- programkvalitet,

- följsamhet,

- återhämtning,

- och kostens faktiska struktur.

7.43 ÅTERSTART EFTER UPPEHÅLL

GainPilot ska kunna skapa återstartsprogram efter:

- sjukdom,

- semester,

- skada,

- tidsbrist,

- eller längre träningsuppehåll.

Återstartsplanen ska ta hänsyn till:

- uppehållets längd,

- tidigare träningsnivå,

- aktuell situation,

- och orsaken till avbrottet.

GainPilot ska normalt reducera:

- belastning,

- volym,

- eller båda

under den första återgångsperioden.

Systemet ska inte låta tidigare personbästa styra den första veckan.

Målet ska vara att återställa:

- rytm,

- teknik,

- tolerans,

- och realistisk progression.

7.44 PROGRAMBLOCK OCH PERIODISERING

GainPilot ska kunna organisera träning i programblock med olika syften.

Exempel:

- introduktionsblock,

- hypertrofiblock,

- styrkeblock,

- teknikblock,

- konditionsblock,

- deload,

- återstartsblock,

- och tävlingsförberedelse.

Periodisering ska användas när den skapar värde.

GainPilot ska inte göra enkla program onödigt komplicerade genom att lägga till avancerade blockmodeller utan behov.

Nybörjare kan utvecklas länge genom enklare progression.

Erfarna användare eller mål med tydliga faser kan behöva mer strukturerad periodisering.

7.45 ÖVERGÅNG MELLAN PROGRAMBLOCK

När ett programblock avslutas ska GainPilot genomföra en utvärdering.

Den ska kunna bedöma:

- måluppfyllelse,

- prestation,

- följsamhet,

- återhämtning,

- övningsrespons,

- och användarens upplevelse.

Nästa block ska inte skapas enbart genom att upprepa det tidigare med högre vikter.

GainPilot ska identifiera:

- vad som ska behållas,

- vad som ska förändras,

- vilka nya prioriteringar som finns,

- och om användaren behöver en övergångs- eller återhämtningsperiod.

Arnold ska förklara förändringen mellan blocken.

7.46 ANVÄNDARENS MANUELLA ÄNDRINGAR

Användaren ska kunna ändra sitt program.

Manuella ändringar ska registreras som strukturerade beslut.

GainPilot ska kunna förstå:

- vad som ändrades,

- varför,

- om det är tillfälligt,

- och hur det påverkar programmets syfte.

Systemet får inte omedelbart skriva över användarens val.

Om förändringen skapar en tydlig målkonflikt eller säkerhetsrisk ska Arnold förklara det.

Exempel:

Du har tagit bort programmets enda vertikala dragövning. Det minskar programmets dragbalans. Vill du ersätta den med ett alternativ eller behålla förändringen trots konsekvensen?

7.47 LÅSTA PROGRAMDELAR

Användaren ska kunna låsa delar av sitt träningsupplägg.

Det kan exempelvis vara:

- huvudövning,

- träningsdag,

- träningssplit,

- veckofrekvens,

- eller specifik färdighet.

En låsning ska påverka vad Arnold får ändra automatiskt.

GainPilot ska kunna beskriva konsekvensen.

Exempel:

Bänkpress är låst som huvudövning.

Arnold får då justera:

- belastning,

- set,

- repetitioner,

- eller kompletterande övningar

inom mandatet, men får inte ersätta bänkpress utan att användaren först låser upp den eller godkänner förändringen.

7.48 ANPASSNINGSMOTOR

GainPilots anpassningsmotor ska omvandla analys till kontrollerade förändringar.

Processen ska vara:

Observation

→ Kontextkontroll

→ Mönsterbedömning

→ Hypotes

→ Möjliga åtgärder

→ Konsekvensanalys

→ Riskklassificering

→ Kontrollnivå

→ Förslag eller automatisk förändring

→ Förklaring

→ Uppföljning

Anpassningsmotorn får inte direkt förändra programmet från en enskild observation utan att tillämpliga regler har följts.

Varje betydelsefull ändring ska kunna kopplas till:

- underlag,

- beslut,

- regel,

- och förväntat resultat.

7.49 ANPASSNINGSNIVÅER

Träningsförändringar ska kunna klassificeras efter betydelse.

7.49.1 Mikroförrändring

Exempel:

- liten viktjustering,

- justerad vilotid,

- eller ändrat repetitionsmål inom samma ram.

Kan ofta ske automatiskt i samarbets- eller coachläge.

7.49.2 Passförändring

Exempel:

- tillfälligt övningsbyte,

- kortversion av pass,

- eller flytt av en träningsdag.

Kan kräva olika kontroll beroende på användarens mandat.

7.49.3 Veckoförändring

Exempel:

- ändrad volym,

- förändrad passfördelning,

- eller tillagd konditionsaktivitet.

Bör normalt förklaras tydligt.

7.49.4 Programförändring

Exempel:

- ny träningssplit,

- ändrade huvudövningar,

- eller byte av progressionsmodell.

Kräver starkare underlag och ofta användargodkännande.

7.49.5 Mål- eller fasförändring

Exempel:

- byte från muskelbyggnad till viktnedgång,

- ny tävlingsförberedelse,

- eller större omprioritering mellan styrka och kondition.

Ska normalt kräva uttryckligt användargodkännande.

7.50 FÖRÄNDRINGSHISTORIK

Betydelsefulla träningsförändringar ska dokumenteras.

Historiken ska kunna visa:

- datum,

- förändring,

- orsak,

- underlag,

- initiativtagare,

- kontrollnivå,

- användargodkännande,

- och resultat.

Exempel:

Datum:

18 augusti 2026.

Förändring:

Bänkpress 4 × 8 ändrades till 3 × 8.

Orsak:

Ökad trötthet och försämrad sista-set-prestation under tre veckor.

Initierad av:

Arnold.

Kontrollnivå:

Samarbetsläge.

Status:

Godkänd och genomförd.

Uppföljning:

Ny bedömning efter två pass.

Historiken ska vara begriplig för användaren och tillräckligt strukturerad för teknisk revision.

7.51 ÅTERSTÄLLNING AV TRÄNINGSFÖRÄNDRINGAR

Användaren ska kunna återställa betydelsefulla automatiska förändringar.

GainPilot ska kunna återställa:

- en enskild övning,

- ett pass,

- en träningsvecka,

- eller en tidigare programversion.

Systemet ska förklara vilka följdändringar som påverkas.

Exempel:

Om användaren återställer tidigare träningssplit kan även:

- träningsdagar,

- passvolym,

- och konditionsplacering

behöva återställas eller omberäknas.

Återställning ska använda en verklig versionsmodell och får inte endast skapa ännu en ogenomskinlig förändring.

7.52 SÄKERHET OCH RISKKLASSIFICERING

Träningsbeslut ska riskklassificeras.

Låg risk kan exempelvis vara:

- mindre viktjustering,

- ändrad vilotid,

- eller tillfälligt likvärdigt övningsbyte.

Förhöjd risk kan exempelvis vara:

- kraftigt ökad träningsvolym,

- avancerad teknisk rörelse,

- stor ökning av löpdistans,

- eller kombination av flera högintensiva pass.

Hög risk kan exempelvis vara:

- träning trots allvarliga symptom,

- återgång efter allvarlig skada utan professionell vägledning,

- extrema belastningsökningar,

- eller automatiska beslut som ligger utanför GainPilots mandat.

Risknivån ska påverka:

- automatik,

- godkännande,

- förklaring,

- och uppföljning.

7.53 ARNOLDS ROLL I TRÄNINGSINTELLIGENSEN

Arnold ska göra träningsintelligensen begriplig och användbar.

Han ska kunna:

- presentera programmet,

- förklara syftet,

- guida under passet,

- svara på frågor,

- föreslå byten,

- tolka resultat,

- och beskriva förändringar.

Arnold ska inte överbelasta användaren med all intern analys.

Han ska prioritera det som behövs för nästa beslut.

Exempel:

Intern analys kan omfatta:

- volymtrend,

- RPE-förändring,

- återhämtningssignaler,

- och övrig aktivitet.

Användaren kan få:

Dina benpass har blivit tyngre samtidigt som löpningen ökat. Jag minskar ett kompletterande set denna vecka men behåller huvudlyftet.

7.54 ATLAS ROLL I TRÄNINGSINTELLIGENSEN

Atlas ska hjälpa Arnold när uppgiften kräver bredare intelligens.

Det kan exempelvis vara:

- analys över lång historik,

- samordning med kalender och vardag,

- omvärldsbevakning,

- kontroll av aktuella källor,

- och analys av GainPilot som produkt.

Atlas får inte kringgå GainPilots träningsregler.

Atlas ska lämna:

- underlag,

- analys,

- osäkerhet,

- och förslag

till GainPilots domänmotorer och Arnold.

Det slutliga användarbeslutet ska följa:

- träningskontrakten,

- användarens mandat,

- och säkerhetsreglerna.

7.55 HERMES OCH TRÄNINGSKONTEXT

Hermes ska kontrollera relevant kontextöverföring.

Exempel:

Arnold behöver veta vilka kvällar användaren är upptagen.

Hermes kan dela:

- tillgängliga tidsfönster,

- blockerade perioder,

- och giltig tidsperiod.

Arnold behöver normalt inte:

- mötestitlar,

- deltagare,

- eller känsliga beskrivningar.

Träningsplanering ska använda minimerad kontext.

GainPilot ska även isolera träningsdata mellan:

- användare,

- projekt,

- miljöer,

- och framtida organisationer.

7.56 FORSKNING OCH AKTUELL KUNSKAP

Atlas ska kunna hjälpa GainPilot hålla träningskunskapen aktuell.

Omvärldsbevakning kan omfatta:

- etablerad träningsforskning,

- officiella riktlinjer,

- säkerhetsinformation,

- rörelsestandarder,

- nya integrationer,

- och relevanta tekniska lösningar.

En till två kontroller per vecka kan användas som grundnivå för bred omvärldsbevakning.

Frekvensen ska anpassas efter behov och risk.

Ny information får inte direkt ändra användarnas program.

Processen ska vara:

Identifiera ny information

→ Bedöma källa

→ Jämföra med befintligt kunskapsläge

→ Bedöma praktisk betydelse

→ Granska påverkan på GainPilots regler

→ Skapa uppdateringsförslag

→ Testa

→ Godkänna

→ Versionera

→ Tillämpa kontrollerat

En enskild studie eller trend får inte skriva om träningsmotorn.

7.57 KUNSKAPSVERSIONERING

GainPilots träningsregler och modeller ska vara versionerade.

Ett träningsbeslut ska vid behov kunna kopplas till:

- programversion,

- regelversion,

- övningsdataversion,

- och analysmodell.

När en regel uppdateras ska systemet kunna förstå:

- vilka program som påverkas,

- om befintliga program ska fortsätta,

- om nytt förslag ska skapas,

- och hur förändringen ska kommuniceras.

Canonical träningskunskap får inte förändras ogenomskinligt.

7.58 EXTERNA TRÄNINGSPROGRAM

GainPilot ska kunna hitta, importera och analysera externa träningsprogram.

Systemet ska bedöma:

- källa,

- målgrupp,

- mål,

- programstruktur,

- volym,

- intensitet,

- progression,

- återhämtning,

- utrustning,

- tidsåtgång,

- och säkerhet.

Programmet ska normaliseras mot GainPilots canonical modeller.

Externa övningsnamn ska kopplas till canonical övningsidentiteter.

Om innehållet är upphovsrättsskyddat ska GainPilot respektera licens och tillåten användning.

GainPilot ska kunna:

- analysera ett program,

- sammanfatta principerna,

- anpassa en tillåten struktur,

- eller hjälpa användaren följa ett eget program.

Systemet får inte återpublicera skyddat material utan rättighet.

7.59 ANVÄNDARE SOM FÖLJER EGEN COACH ELLER EXTERNT PROGRAM

GainPilot ska kunna fungera även när användaren följer ett program från:

- mänsklig tränare,

- CrossFit-box,

- förening,

- eller annan tjänst.

Arnold ska då inte automatiskt skriva över programmet.

GainPilot kan i stället fungera som:

- logg,

- analysstöd,

- teknikstöd,

- aktivitetsöversikt,

- kostcoach,

- och samordningslager.

Användaren ska kunna ange vilka delar GainPilot får påverka.

Exempel:

GainPilot får anpassa kost och återhämtning men får inte ändra tränarens huvudprogram.

Denna gräns ska respekteras.

7.60 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera hur träningsfunktionerna fungerar på plattformsnivå.

Det kan exempelvis omfatta:

- vilka övningar som ofta byts,

- vilka pass som ofta avbryts,

- vilka programstrukturer som ger låg följsamhet,

- vilka rekommendationer som ofta avvisas,

- och var registreringsflödet skapar friktion.

Analysen ska separeras från personlig coachning.

En användares privata data får inte bli personlig kontext för en annan användare.

Aggregerade mönster kan användas för produktförbättring inom rätt integritetsregler.

7.61 KONTROLLERAD PRODUKTUTVECKLING

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

- träningsmotor,

- progressionsregler,

- säkerhetsgränser,

- övningsgraf,

- eller produktion

från en analysinsikt.

Även lågriskförbättringar ska vara:

- spårbara,

- testade,

- reversibla,

- och kopplade till ett definierat mandat.

7.62 TESTNING AV TRÄNINGSINTELLIGENS

Träningsintelligensen ska testas på flera nivåer.

7.62.1 Enhetstester

Ska verifiera enskilda regler, exempelvis:

- progression,

- volymberäkning,

- övningsfiltrering,

- och kontrollnivå.

7.62.2 Kontraktstester

Ska verifiera att:

- användarmodell,

- programmotor,

- övningsgraf,

- och analysmotor

utbyter korrekt data.

7.62.3 Scenariotester

Ska testa verkliga användarsituationer.

Exempel:

- nybörjare med tre dagar och begränsad utrustning,

- erfaren användare med styrkemål,

- användare som kombinerar löpning och hypertrofi,

- missat pass,

- tillfälligt hotellgym,

- återstart efter sjukdom,

- och övningsbyte på grund av smärta.

7.62.4 Säkerhetstester

Ska verifiera att GainPilot:

- inte rekommenderar blockerade övningar,

- respekterar allergier och andra relevanta begränsningar där de påverkar träningen,

- inte kringgår approvalregler,

- och inte behandlar högriskhändelser som normala anpassningar.

7.62.5 Regressionstester

Ska säkerställa att en förbättring i en domän inte försämrar andra program eller användare.

7.62.6 Simulering

GainPilot ska kunna simulera program över tid för att upptäcka:

- orimlig volymutveckling,

- konflikter mellan pass,

- instabil progression,

- och felaktiga substitutionskedjor.

7.63 OBSERVABILITY OCH BESLUTSSPÅRNING

Träningsmotorn ska vara observerbar.

Det ska gå att förstå:

- vilken data som användes,

- vilken regel som aktiverades,

- vilka alternativ som övervägdes,

- vilket beslut som fattades,

- vilken kontrollnivå som användes,

- och vad resultatet blev.

Teknisk observability ska inte innebära att känslig användardata exponeras i onödiga loggar.

Loggar ska använda:

- minimerad data,

- pseudonymisering där möjligt,

- rätt behörighet,

- och definierad retention.

Beslutsspårning ska stödja:

- felsökning,

- användarförklaring,

- säkerhetsrevision,

- och produktförbättring.

7.64 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots träningsintelligens.

**Kontrakt GP-69 — Träning som sammanhängande system**

GainPilot ska behandla program, pass, övningar, progression, återhämtning och resultat som delar av samma träningsmodell.

**Kontrakt GP-70 — Syftesstyrd programmering**

Varje program och betydelsefull programdel ska kunna kopplas till ett definierat mål eller planeringsbehov.

**Kontrakt GP-71 — Regelstyrd programgenerering**

Personliga program ska skapas genom canonical träningsregler och strukturerad användarkontext, inte genom fri språkmodellsgenerering ensam.

**Kontrakt GP-72 — Domänspecifik intelligens**

Styrketräning, hypertrofi, CrossFit, calisthenics och kondition ska ha egna domänregler där deras modeller skiljer sig.

**Kontrakt GP-73 — Genomförbar frekvens och passlängd**

Program ska utgå från användarens realistiska tillgänglighet och kunna hantera en definierad miniminivå.

**Kontrakt GP-74 — Funktionellt övningsurval**

Övningar ska väljas och ersättas utifrån programmets syfte, inte endast muskelgrupp eller namn.

**Kontrakt GP-75 — Explicit progression**

Varje aktivt program ska ha en definierad progressionsmodell eller ett uttryckligt skäl till att progression inte används.

**Kontrakt GP-76 — Stabilitet före omprogrammering**

GainPilot ska normalt kräva ett relevant mönster eller tydlig händelse innan större programförändringar genomförs.

**Kontrakt GP-77 — Canonical övningsidentitet**

Övningar ska ha stabila canonical identiteter separerade från visningsnamn och språk.

**Kontrakt GP-78 — Strukturerad övningsgraf**

Övningsrelationer ska representeras med typ, villkor, källa och kvalitetsstatus.

**Kontrakt GP-79 — Kvalitetsgranskat media**

Övningsdemonstrationer ska vara licensierade, versionshanterade och tekniskt granskade innan produktionsanvändning.

**Kontrakt GP-80 — Domänanpassad loggning**

Träningsloggen ska representera den faktiska aktivitetstypen och får inte tvinga alla domäner till set och repetitioner.

**Kontrakt GP-81 — Kontrollerad anpassning**

Analys får endast förändra ett aktivt program genom GainPilots anpassningsmotor och användarens tillämpliga mandat.

**Kontrakt GP-82 — Versionshanterade program**

Aktiva träningsprogram och betydelsefulla förändringar ska vara versionerade och återställningsbara.

**Kontrakt GP-83 — Professionell gräns vid smärta och skada**

GainPilot får inte diagnostisera eller programmera runt högrisksymptom utan lämplig begränsning och hänvisning.

**Kontrakt GP-84 — Samlad belastningsbedömning**

Styrka, kondition, CrossFit, calisthenics och annan relevant aktivitet ska konsekvensbedömas tillsammans.

**Kontrakt GP-85 — Granskad kunskapsuppdatering**

Ny extern information får inte direkt ändra canonical träningsregler eller användarprogram.

**Kontrakt GP-86 — Extern programmering ska respekteras**

GainPilot får inte skriva över ett externt eller mänskligt coachat program utanför användarens uttryckliga mandat.

**Kontrakt GP-87 — Beslut ska vara observerbara**

Betydelsefulla träningsbeslut ska kunna spåras till data, regel, mandat och resultat.

**Kontrakt GP-88 — Branchbaserad träningsutveckling**

Förändringar av träningsmotor, regler, övningsgraf och säkerhetslogik ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

7.65 ANTI-PRINCIPER

GainPilot ska inte:

- behandla träningsintelligens som en engångsgenerator för träningsprogram,

- skapa program utan tydligt mål,

- använda samma programmodell för alla träningsdomäner,

- välja träningsfrekvens utifrån ambition utan hänsyn till verklig genomförbarhet,

- skapa pass som regelbundet överskrider användarens tillgängliga tid,

- välja övningar endast efter muskelgrupp,

- byta fungerande övningar bara för att skapa variation,

- ändra programmet efter varje mindre avvikelse,

- höja belastning utan definierad progressionsregel,

- behandla RPE eller RIR som objektiva exakta värden,

- behandla en platå som bekräftad efter ett enskilt pass,

- använda mer volym som universallösning,

- stapla missade pass på framtida dagar utan konsekvensanalys,

- behandla tillfälliga övningsbyten som permanenta,

- koppla övningsmedia enbart genom textnamn,

- publicera AI-genererade övningsdemonstrationer utan teknisk granskning,

- anta att ett stort externt övningsbibliotek täcker GainPilots verkliga behov,

- tvinga CrossFit, calisthenics och kondition till en vanlig set- och repetitionsmodell,

- presentera uppskattat max som ett säkert faktiskt max,

- diagnostisera smärta eller skador,

- behandla en återhämtningspoäng som biologisk sanning,

- lova maximal progression inom flera konkurrerande mål samtidigt,

- skriva över användarens eller en extern tränares program utan mandat,

- uppdatera träningsmotorn direkt från en ny studie,

- blanda användares träningsdata,

- eller ändra main eller produktion utan branch, tester och granskning.

7.66 KANONISKA BESLUT FRÅN KAPITEL 7

Följande beslut etableras:

1. GainPilots träningsintelligens ska vara ett kontinuerligt planerings-, genomförande-, analys- och anpassningssystem.

2. Träningsintelligensen ska använda en gemensam canonical träningsmodell.

3. Modellen ska representera långsiktig inriktning, programblock, träningsvecka, pass, passdel, aktivitet, arbetsenhet, resultat och anpassningsbeslut.

4. Varje träningsprogram ska ha ett tydligt huvudsyfte.

5. Sekundära mål och bevarandemål ska representeras separat.

6. Programgenerering ska vara regelstyrd och använda strukturerad användarkontext.

7. Språkmodeller får stödja programskapandet men får inte ensamma definiera träningslogiken.

8. GainPilot får använda canonical programmallar.

9. En mall ska anpassas innan den blir ett personligt program.

10. Ändringar av en mall får inte tyst skriva om aktiva användarprogram.

11. Träningsfrekvens ska baseras på realistisk genomförbarhet.

12. GainPilot ska kunna planera för normal frekvens och miniminivå.

13. Pass ska kunna genomföras inom planerad tid.

14. Varje pass ska kunna ha en prioriterad kortversion.

15. Övningsurval ska bedömas utifrån funktion, användarkontext och programsyfte.

16. Övningsordning ska vara avsiktlig.

17. Uppvärmning ska vara aktivitetsspecifik och proportionerlig.

18. Träningsvolym ska representeras domänspecifikt.

19. Intensitet ska representeras med mått som passar träningsformen.

20. RPE och RIR ska behandlas som användbara men subjektiva signaler.

21. Varje program ska ha en explicit progressionsmodell eller ett dokumenterat undantag.

22. GainPilot ska stödja flera progressionsstrategier.

23. Autoreglering ska ske inom definierade gränser.

24. Calisthenicsprogression ska stödja variant, assistans, hävarm, hålltid, rörelseomfång och teknik.

25. CrossFit-progression ska stödja belastning, tid, rundor, scaling och rörelsestandard.

26. Konditionsprogression ska stödja tid, distans, tempo, intervaller, puls, effekt och upplevd ansträngning där data finns.

27. Platåer ska identifieras genom tillräckligt underlag och flera relevanta signaler.

28. Deload och återhämtningsperioder ska ha definierat syfte.

29. Missade pass ska hanteras genom konsekvensanalys.

30. GainPilot ska undvika att stapla missade pass.

31. Flyttade träningsdagar ska analyseras i relation till resten av veckan.

32. Övningsbyten ska börja med orsaken till bytet.

33. Substitutioner ska försöka bevara programmets funktion.

34. GainPilot ska skilja mellan tillfälliga och permanenta övningsbyten.

35. GainPilot ska ha en canonical övningsgraf.

36. Övningsgrafen ska innehålla villkorade och kvalitetsklassificerade relationer.

37. Varje övning ska ha en canonical identitet separat från språk och visningsnamn.

38. Animerade övningsdemonstrationer ska kopplas till canonical övningsidentitet.

39. Övningsmedia ska ha källa, licens, version och granskningsstatus.

40. Rörelsens korrekthet ska väga tyngre än visuell kvalitet.

41. AI-genererat övningsmaterial ska granskas innan publicering.

42. Tekniskt komplexa rörelser ska ha högre granskningskrav.

43. GainPilot ska kunna använda externa licensierade övningsbibliotek.

44. Externa bibliotek ska jämföras mot GainPilots canonical övningsbehov.

45. GainPilot bör stödja ett hybridbibliotek med externt och eget material.

46. Träningsloggningen ska anpassas efter träningsdomänen.

47. Automatiskt importerad träningsdata ska valideras och kunna korrigeras.

48. Teknikbedömning ska uttrycka begränsningar och osäkerhet.

49. GainPilot ska inte diagnostisera smärta eller skador.

50. Prestationsanalys ska skilja mellan variation, trend, platå och försämring.

51. Uppskattade styrkevärden ska presenteras som uppskattningar.

52. Återhämtningsanalys ska använda flera signaler.

53. GainPilot ska analysera belastning över flera träningsdomäner.

54. Konkurrerande mål ska prioriteras och konsekvensbedömas.

55. Träningsmotorn och kostmotorn ska samverka vid viktmål.

56. GainPilot ska stödja kontrollerad återstart efter träningsuppehåll.

57. GainPilot ska stödja programblock och övergångar mellan block.

58. Manuella programändringar ska registreras och konsekvensbedömas.

59. Användaren ska kunna låsa programdelar.

60. Alla automatiska förändringar ska gå genom en kontrollerad anpassningsmotor.

61. Anpassningar ska klassificeras efter betydelse och risk.

62. Betydelsefulla träningsförändringar ska ha förändringshistorik.

63. Programversioner ska kunna återställas.

64. Arnold ska förklara träningsbeslut på rätt detaljnivå.

65. Atlas ska bidra med analys, research och relevant Omnira-kontext utan att kringgå träningsreglerna.

66. Hermes ska minimera delad kontext till vad träningsuppgiften kräver.

67. Ny forskning ska granskas innan canonical kunskap eller aktiva program förändras.

68. Träningsregler, program och övningsdata ska versioneras.

69. Externa träningsprogram ska analyseras och normaliseras före användning.

70. GainPilot ska kunna stödja användare som följer mänsklig coach eller extern programmering.

71. Plattformsanalys ska hållas åtskild från personlig användarkontext.

72. Förändringar av träningsintelligensen ska genomföras på separat branch.

73. Träningsmotorn ska testas genom enhets-, kontrakts-, scenario-, säkerhets- och regressionstester.

74. Betydelsefulla träningsbeslut ska vara observerbara och spårbara.

75. Agentautonomi inom träningsdomänen ska vara explicit, begränsad, verifierad och återkallelig.

7.67 IMPLEMENTERINGSORDNING

GainPilots träningsintelligens ska implementeras stegvis.

Fas 1 — Canonical grundmodell

Implementera:

- träningsmål,

- program,

- träningsvecka,

- träningspass,

- övning,

- set,

- resultat,

- och programversion.

Fas 2 — Grundläggande styrketräning

Implementera:

- styrketräningsprogram,

- set och repetitioner,

- belastning,

- enkel RIR eller ansträngning,

- dubbel progression,

- träningsloggning,

- och kortversion av pass.

Fas 3 — Canonical övningsbibliotek

Implementera:

- grundövningar,

- metadata,

- muskler,

- rörelsemönster,

- utrustning,

- teknikpunkter,

- och canonical identitet.

De första övningarna ska utgå från de övningar som används i GainPilots första verkliga program och användarens befintliga träning.

Fas 4 — Substitutionsmotor

Implementera:

- orsak till byte,

- tillfälliga alternativ,

- permanenta alternativ,

- utrustningsfilter,

- preferenser,

- och programkonsekvens.

Fas 5 — Träningsanalys

Implementera:

- progressionstrend,

- följsamhet,

- volym,

- ansträngning,

- och enkel mönsterbedömning.

Fas 6 — Anpassningsmotor

Implementera:

- mikroförrändringar,

- kontrollnivåer,

- förklaring,

- förändringshistorik,

- och återställning.

Fas 7 — Övningsmedia

Implementera:

- animerade demonstrationer,

- licensmetadata,

- granskningsstatus,

- GainPilot-bakgrund,

- muskelmarkeringar,

- och alternativa kameravinklar.

Fas 8 — Grundläggande kondition

Implementera:

- gång,

- löpning,

- cykling,

- tid,

- distans,

- tempo,

- och upplevd ansträngning.

Fas 9 — Calisthenics

Implementera:

- skill-modell,

- progressioner,

- regressioner,

- assistans,

- hålltid,

- och rörelsekvalitet.

Fas 10 — CrossFit

Implementera:

- workout,

- AMRAP,

- EMOM,

- rounds,

- time cap,

- scaling,

- rörelsestandard,

- och samlad belastning.

Fas 11 — Fördjupad intelligens

Implementera:

- autoreglering,

- programblock,

- avancerad analys,

- teknikstöd,

- externa program,

- och fler integrationer.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- tester,

- pull request,

- granskning,

- kontrollerad merge,

- och resultatuppföljning.

7.68 FRAMGÅNGSKRITERIER

Kapitel 7:s vision är framgångsrikt realiserad när:

- GainPilot kan skapa ett träningsprogram utifrån användarens verkliga mål och förutsättningar,

- varje program har ett begripligt syfte,

- passen ryms inom användarens tillgängliga tid,

- övningar väljs utifrån funktion och inte endast muskelgrupp,

- användaren snabbt kan registrera träningen,

- programmet har en tydlig progressionsmodell,

- Arnold kan förklara varför belastning, volym eller övningar förändras,

- GainPilot kan skilja mellan normal variation och relevanta mönster,

- missade pass hanteras utan att skapa en ohållbar skuld,

- övningar kan bytas utan att programmets huvudsyfte förloras,

- tillfälliga och permanenta byten hålls åtskilda,

- den canonical övningsgrafen stödjer relevanta substitutioner och progressioner,

- animerade demonstrationer är korrekta, licensierade och versionshanterade,

- styrketräning, kondition, CrossFit och calisthenics kan representeras utan att tvingas till samma datamodell,

- belastningen mellan olika träningsformer kan konsekvensbedömas,

- programförändringar är förklarbara och återställningsbara,

- användarens kontrollnivå tillämpas korrekt,

- Atlas kan förstärka Arnold utan att kringgå GainPilots träningsregler,

- Hermes begränsar kontextöverföring till relevant information,

- ny forskning granskas innan den påverkar canonical kunskap,

- externa program kan analyseras utan okritisk kopiering,

- träningsbeslut kan spåras till data, regler och mandat,

- och förbättringar av träningsmotorn genomförs genom separat branch, tester, pull request och kontrollerad merge.

7.69 SAMMANFATTNING

GainPilots träningsintelligens ska vara kärnan i plattformens förmåga att skapa verkliga och långsiktiga träningsresultat.

Systemet ska inte enbart generera ett schema.

Det ska förstå:

- användarens mål,

- programmets syfte,

- varje träningspass,

- övningarnas funktion,

- progressionen,

- den samlade belastningen,

- verkliga resultat,

- och behovet av förändring.

Träningsintelligensen ska använda ett gemensamt canonical fundament men ha riktiga domänmodeller för:

- styrketräning,

- hypertrofi,

- styrka,

- CrossFit,

- calisthenics,

- och kondition.

Program ska vara genomförbara inom användarens tid, utrustning och vardag.

Progression ska vara explicit men inte begränsas till högre vikter.

Övningsbyten ska vara enkla för användaren och funktionellt intelligenta under ytan.

GainPilots övningsbibliotek ska utvecklas till en strukturerad övningsgraf med canonical identiteter, progressioner, regressioner, substitutioner och kvalitetsgranskat visuellt material.

Animerade övningsdemonstrationer ska ge användaren tydlig och pedagogiskt korrekt vägledning.

AI kan hjälpa produktionen, men får inte ersätta teknisk kvalitetskontroll.

Arnold ska vara coachen som gör träningsintelligensen begriplig.

Atlas ska hjälpa Arnold med minne, analys, research och relevant Omnira-kontext.

Hermes ska säkerställa att kontexten är tillåten, minimerad och isolerad.

Programmet ska vara stabilt när det fungerar och anpassningsbart när verkliga mönster visar att det behöver förändras.

Automatiska förändringar ska följa användarens mandat, dokumenteras, förklaras och kunna återställas.

På plattformsnivå ska GainPilot lära av användning och förbättra träningsupplevelsen genom Omniras kontrollerade utvecklingsmodell.

Ingen träningsregel, övningsgraf eller säkerhetsfunktion får förändras direkt i produktion från en analysinsikt.

Alla förbättringar ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- pull request,

- granskning,

- kontrollerad merge,

- och uppföljning.

Kapitel 7 etablerar därmed följande kärnprincip:

GainPilot ska inte ge användaren ett statiskt träningsschema och hoppas att det fungerar. Plattformen ska skapa ett begripligt träningssystem, följa vad som faktiskt händer och utveckla planen tillsammans med användaren — med tillräcklig stabilitet för verklig progression och tillräcklig intelligens för att anpassas när livet, målet eller resultaten förändras.
