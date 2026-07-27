# Kapitel 13 — Program, kalender och långsiktig planering

GainPilots program- och kalendersystem ska omvandla användarens långsiktiga mål till en konkret, begriplig och genomförbar plan.

Systemet ska knyta samman:

- långsiktiga mål,

- träningsfaser,

- programblock,

- träningsveckor,

- enskilda pass,

- kostplanering,

- återhämtning,

- kalenderbegränsningar,

- och verkligt genomförande.

Ett träningsprogram ska inte behandlas som en statisk lista med pass.

Det ska vara en versionshanterad plan som beskriver:

- vad användaren försöker uppnå,

- varför den valda strukturen används,

- vilka delar som är viktigast,

- hur progressionen ska ske,

- vilka reservlösningar som finns,

- och vad GainPilot ska göra när verkligheten förändras.

Kalendern ska inte endast visa datum.

Den ska vara ett operativt planeringslager där användaren kan förstå:

- vad som ska göras,

- när det ska göras,

- hur lång tid det förväntas ta,

- vad som kan flyttas,

- vad som är låst,

- och hur förändringar påverkar resten av planen.

GainPilot ska kunna stödja användare som:

- följer ett program skapat av GainPilot,

- följer ett program från en mänsklig tränare,

- kombinerar flera träningsformer,

- har varierande arbetstider,

- studerar,

- har familjeansvar,

- reser,

- tränar på olika gym,

- eller behöver perioder med lägre ambitionsnivå.

Arnold ska vara användarens coach och planeringsgränssnitt.

Han ska kunna:

- presentera dagens och veckans plan,

- hjälpa användaren flytta pass,

- förklara prioriteringar,

- skapa kortversioner,

- hantera avvikelser,

- och följa upp genomförandet.

Atlas ska hjälpa Arnold med bredare planeringsintelligens, långsiktiga mål, godkänd Omnira-kontext och konfliktanalys.

Hermes ska kontrollera vilken kalender- och projektinformation som får delas.

Grundprincipen är:

GainPilot ska inte tvinga användarens liv att passa ett teoretiskt program. Plattformen ska bygga en intelligent plan som bevarar målet men kan fungera i användarens verkliga kalender.

13.1 PROGRAMMET SOM ETT LEVANDE KONTRAKT

Ett aktivt program ska fungera som ett kontrakt mellan:

- användarens mål,

- GainPilots tränings- och kostintelligens,

- användarens kontrollnivå,

- och den tid som faktiskt finns tillgänglig.

Programmet ska beskriva:

- programmets huvudmål,

- sekundära mål,

- bevarandemål,

- startpunkt,

- planerad tidsperiod,

- träningsfrekvens,

- programstruktur,

- progressionsmodell,

- återhämtningsstrategi,

- framgångskriterier,

- och omprövningspunkter.

Programmet ska samtidigt vara förändringsbart.

Ett förändringsbart program får däremot inte vara godtyckligt.

Varje betydelsefull förändring ska kunna förklaras och spåras.

Grundprincipen är:

Programmet ska vara stabilt nog för progression och flexibelt nog för verkligheten.

13.2 DEN KANONISKA PROGRAMMODELLEN

GainPilot ska ha en canonical programmodell.

Den ska minst kunna representera:

1. Programidentitet.

2. Programägare.

3. Programkälla.

4. Huvudmål.

5. Sekundära mål.

6. Programstatus.

7. Programblock.

8. Träningsveckor.

9. Träningspass.

10. Passdelar.

11. Aktiviteter och övningar.

12. Progressionsregler.

13. Kalenderplacering.

14. Reservplaner.

15. Användarlåsningar.

16. Kontrollnivå.

17. Version.

18. Förändringshistorik.

19. Utvärderingspunkter.

20. Slutstatus.

Programmodellen ska användas av:

- Arnold,

- Atlas,

- träningsmotorn,

- kostmotorn,

- kalendern,

- progressionsmotorn,

- substitutionsmotorn,

- analysfunktionerna,

- och externa integrationer.

Det ska inte finnas motstridiga representationer av samma aktiva program.

13.3 PROGRAMIDENTITET

Varje program ska ha en stabil identitet.

Programidentiteten ska vara separerad från:

- programnamn,

- aktuell version,

- användarens visningsnamn,

- och externa leverantörsidentifierare.

Exempel:

Programidentitet:

gp-program-8f42

Visningsnamn:

Andrés styrka och muskelbyggnad — höstblock

Version:

3

Programnamnet ska kunna ändras utan att historik, resultat eller relationer bryts.

13.4 PROGRAMKÄLLA

Varje program ska ha en definierad källa.

Exempel:

- skapat av GainPilot,

- skapat av användaren,

- importerat från extern tjänst,

- skapat av mänsklig tränare,

- anpassat från extern mall,

- eller kombinerat från flera godkända komponenter.

Källan ska påverka:

- vem som får förändra programmet,

- hur ändringar presenteras,

- vilka rättigheter som gäller,

- och vilken progression som styr.

GainPilot får inte framställa ett anpassat externt program som helt egen originalprogrammering utan tydlig provenance.

13.5 PROGRAMÄGANDE

Programägande ska skiljas från teknisk lagring.

Ett program kan ägas eller styras av:

- användaren,

- GainPilot,

- en mänsklig tränare,

- en organisation,

- eller flera komponentägare.

Ägande ska kunna definieras per programdel.

Exempel:

Styrkedel:

Mänsklig tränare.

Konditionsdel:

GainPilot.

Calisthenicsdel:

Användaren.

Kostplan:

Arnold och kostmotorn inom användarens mandat.

Varje komponent ska ha en definierad förändringsrätt.

13.6 PROGRAMSTATUS

Ett program ska kunna ha status som:

- utkast,

- föreslaget,

- väntar på godkännande,

- schemalagt,

- aktivt,

- pausat,

- minimiläge,

- slutfört,

- avbrutet,

- ersatt,

- eller arkiverat.

Statusen ska påverka vad systemet får göra.

Ett utkast får inte generera obligatoriska kalenderhändelser.

Ett pausat program ska inte fortsätta skapa automatiska progressioner.

Ett arkiverat program får användas som historik men inte som aktiv plan.

13.7 PROGRAMMÅL

Varje aktivt program ska ha ett huvudmål.

Exempel:

- bygga muskler,

- öka maximal styrka,

- förbättra kondition,

- gå ned i vikt med muskelbevarande,

- utveckla CrossFit-kapacitet,

- eller uppnå en calisthenicsfärdighet.

Programmet kan även ha sekundära mål.

Exempel:

Huvudmål:

Muskelbyggnad.

Sekundärt mål:

Öka bänkpressstyrkan.

Bevarandemål:

Behålla grundläggande kondition.

Målen ska prioriteras.

GainPilot får inte behandla alla mål som lika viktiga om de konkurrerar om tid eller återhämtning.

13.8 PROGRAMMETS TIDSHORISONT

Ett program ska kunna ha:

- planerat startdatum,

- uppskattat slutdatum,

- antal veckor,

- villkorsbaserat slut,

- eller löpande struktur.

Ett slutdatum ska inte alltid tolkas som att målet måste vara uppnått exakt den dagen.

Det kan vara en planerad utvärderingspunkt.

GainPilot ska kunna skilja mellan:

- programslut,

- blockslut,

- måldatum,

- tävlingsdatum,

- och omprövningsdatum.

13.9 PROGRAMBLOCK

Ett program kan bestå av flera block.

Varje block ska kunna innehålla:

- blockidentitet,

- syfte,

- längd,

- start- och slutvillkor,

- belastningsprincip,

- progressionsmodell,

- övningsstruktur,

- återhämtningsstrategi,

- och utvärderingskriterier.

Exempel:

Block 1:

Återstart och teknik.

Block 2:

Hypertrofi och arbetskapacitet.

Block 3:

Styrkeprioritering.

Block 4:

Utvärdering och ny planering.

Blocken ska bilda en begriplig långsiktig riktning.

13.10 BLOCKÖVERGÅNGAR

Övergången mellan programblock ska vara explicit.

GainPilot ska bedöma:

- om blockets mål uppnåtts,

- hur följsamheten har varit,

- hur prestationen utvecklats,

- hur återhämtningen fungerat,

- och om nästa prioritet fortfarande är relevant.

En blockövergång ska kunna resultera i:

- planerad fortsättning,

- upprepat block,

- modifierat block,

- återhämtningsperiod,

- eller nytt program.

Systemet ska inte automatiskt gå vidare enbart för att kalenderdatumet passerat.

13.11 TRÄNINGSVECKAN

Träningsveckan ska vara en strukturerad del av programmet.

Den ska kunna innehålla:

- veckonummer,

- veckans syfte,

- planerad belastning,

- träningspass,

- konditionsaktiviteter,

- vilodagar,

- återhämtningsfokus,

- kostrelaterade planeringspunkter,

- och veckans flexibilitetsmarginal.

Veckan ska inte endast vara sju isolerade datum.

GainPilot ska förstå relationen mellan dagarna.

13.12 KALENDERVECKA OCH PROGRAMVECKA

GainPilot ska skilja mellan kalendervecka och programvecka.

Kalendervecka följer datum.

Programvecka följer programmets interna progression.

Exempel:

Användaren missar flera pass på grund av sjukdom.

Nästa kalendervecka behöver inte automatiskt bli nästa programvecka.

Systemet kan:

- fortsätta samma programvecka,

- skapa en återstartsvecka,

- eller anpassa progressionen.

Detta ska bero på programmet och användarens situation.

13.13 ASYNKRON PROGRAMORDNING

Alla användare tränar inte enligt fasta veckodagar.

GainPilot ska stödja asynkron programordning.

Exempel:

Pass A

→ Pass B

→ vilodag

→ Pass C

→ Pass A

Användaren fortsätter i ordning när tid finns.

Detta kan vara lämpligt för:

- skiftarbete,

- varierande familjeschema,

- resor,

- eller användare som inte vill binda pass till veckodagar.

GainPilot ska fortfarande kontrollera:

- återhämtning,

- passordning,

- och maximal tidslucka mellan viktiga exponeringar.

13.14 FAST KALENDERSTRUKTUR

Vissa användare behöver fasta träningsdagar.

Exempel:

- måndag,

- onsdag,

- fredag.

Den fasta strukturen kan skapa:

- förutsägbarhet,

- familjeplanering,

- enklare vanor,

- och stabil träningsfrekvens.

GainPilot ska kunna låsa dessa dagar.

Systemet ska samtidigt ha regler för vad som händer när ett fast pass missas.

13.15 HYBRIDSTRUKTUR

GainPilot ska kunna använda en hybridstruktur.

Exempel:

Två fasta huvudpass:

- måndag,

- torsdag.

Ett flexibelt tilläggspass:

- lördag eller söndag.

Hybridstrukturen kan ge stabilitet utan att göra programmet onödigt skört.

GainPilot ska kunna ange vilka pass som är:

- fasta,

- flexibla,

- valbara,

- eller reservpass.

13.16 KALENDERNS ROLL

Kalendern ska fungera som GainPilots operativa planeringsyta.

Den ska kunna visa:

- planerade träningspass,

- genomförda pass,

- flyttade pass,

- missade pass,

- vilodagar,

- kostplaneringshändelser,

- vägningar eller uppföljningar,

- programblock,

- och större milstolpar.

Kalendern ska inte överfyllas med varje intern analys eller mindre rekommendation.

Den ska visa det användaren behöver för planering och genomförande.

13.17 PROGRAMVY OCH KALENDERVY

GainPilot ska skilja mellan programvyn och kalendervyn.

Programvyn ska visa:

- programmets logik,

- veckostruktur,

- pass,

- progression,

- och långsiktig riktning.

Kalendervyn ska visa:

- när aktiviteterna är planerade,

- faktiska datum,

- tidsfönster,

- och konflikter.

Samma pass ska kunna visas i båda vyerna utan att dupliceras som olika aktiviteter.

13.18 DAGSVY

Dagsvyn ska hjälpa användaren förstå dagens plan.

Den kan visa:

- dagens huvudpass,

- planerad tid,

- uppskattad passlängd,

- måltidsrelaterade förberedelser,

- relevanta påminnelser,

- och reservalternativ.

Dagsvyn ska prioritera tydlighet.

Användaren ska inte behöva öppna hela programmet för att förstå nästa steg.

13.19 VECKOVY

Veckovyn ska visa:

- planerade pass,

- passens huvudsakliga syfte,

- vilodagar,

- konditionsaktiviteter,

- flexibilitetsfönster,

- och relevanta konflikter.

Den ska även kunna visa:

- genomförandegrad,

- belastningsfördelning,

- och eventuella föreslagna förändringar.

Veckovyn ska inte skapa skuld genom aggressiva röda markeringar för varje avvikelse.

13.20 MÅNADSVY

Månadsvyn ska ge långsiktig överblick.

Den kan visa:

- programblock,

- planerade övergångar,

- resor,

- tävlingar,

- viktiga uppföljningar,

- och återhämtningsperioder.

Detaljerade set och repetitioner ska normalt inte dominera månadsvyn.

13.21 TIDSLINJEVY

GainPilot ska kunna visa programmets längre tidslinje.

Tidslinjen kan innehålla:

- programstart,

- blockgränser,

- deload,

- testperiod,

- måldatum,

- tävling,

- och utvärdering.

Tidslinjen ska göra det möjligt att förstå:

- var användaren befinner sig,

- vad som kommer härnäst,

- och varför den aktuella fasen finns.

13.22 PLANERADE TIDSFÖNSTER

Ett pass ska kunna planeras till:

- exakt tid,

- dag utan exakt klockslag,

- morgon,

- eftermiddag,

- kväll,

- eller flexibelt tidsfönster.

GainPilot ska inte uppfinna exakta tider om användaren endast har angett en dag eller ett brett tidsfönster.

Exempel:

Plan:

Tisdag kväll.

Det behöver inte automatiskt bli:

Tisdag 18.00.

Exakt tid ska användas när användaren önskar det eller kalenderintegrationen kräver det.

13.23 PASSLÄNGD I KALENDERN

Varje träningspass ska ha en uppskattad längd.

Uppskattningen ska baseras på:

- uppvärmning,

- övningar,

- set,

- vilotider,

- utrustningsbyten,

- och eventuell nedvarvning.

Kalenderblocket ska motsvara realistisk tidsåtgång.

GainPilot ska följa faktisk passlängd och kalibrera framtida uppskattningar.

Systemet ska inte fortsätta boka 45 minuter om passen konsekvent tar 70 minuter.

13.24 FÖRBEREDELSETID

Vissa aktiviteter kräver tid före eller efter själva passet.

Exempel:

- resa till gymmet,

- ombyte,

- dusch,

- matförberedelse,

- eller utrustningsuppställning.

Användaren ska kunna välja om sådan tid ska ingå i kalenderblocket.

GainPilot ska inte automatiskt läsa privat platsinformation för att beräkna restid utan tillåtelse.

13.25 KALENDERINTEGRATION

GainPilot ska kunna integreras med externa kalendrar.

Det kan exempelvis vara:

- Google Kalender,

- Apple Kalender,

- Microsoft Outlook,

- eller annan godkänd kalender.

Integrationen ska använda:

- minsta nödvändiga behörighet,

- tydliga scopes,

- separat läs- och skrivåtkomst,

- och återkallelig anslutning.

GainPilot ska fungera även utan extern kalenderintegration.

13.26 KALENDER SOM KÄLLSYSTEM

Användaren ska kunna definiera vilket system som är källa för schemaläggningen.

Exempel:

GainPilot är källsystem för träningspass.

Google Kalender visar en synkroniserad kopia.

Alternativt:

Google Kalender är källsystem för användarens tillgänglighet.

GainPilot använder endast lediga tidsfönster.

Källsystemet ska påverka konfliktlösning och skrivbehörighet.

13.27 LÄSBEHÖRIGHET

Med läsbehörighet kan GainPilot få tillgång till relevant tillgänglighet.

Systemet ska i första hand använda:

- upptagen eller ledig,

- tidsfönster,

- och eventuellt platskategori när användaren har godkänt det.

GainPilot behöver normalt inte:

- mötestitlar,

- deltagare,

- beskrivningar,

- bilagor,

- eller privata anteckningar.

Hermes ska kunna reducera kalenderdata till tillgänglighetsinformation.

13.28 SKRIVBEHÖRIGHET

Skrivbehörighet ska vara separat från läsbehörighet.

När skrivbehörighet är aktiverad kan GainPilot exempelvis:

- lägga till träningspass,

- uppdatera tiden,

- flytta ett pass,

- eller markera ett pass som inställt.

GainPilot ska inte skriva till kalendern utan användarens uttryckliga mandat.

Större serieförändringar ska kräva tydligare kontroll än en enskild flytt.

13.29 KALENDERHÄNDELSENS INNEHÅLL

En kalenderhändelse kan innehålla:

- passnamn,

- start och slut,

- plats,

- kort beskrivning,

- länk till GainPilot,

- och påminnelse.

Känsliga uppgifter ska inte automatiskt skrivas i den externa kalendern.

Exempel:

Kalendern kan visa:

GainPilot — Överkroppspass

Den behöver normalt inte visa:

- kroppsvikt,

- hälsobegränsningar,

- detaljerade kostmål,

- eller privata coachanteckningar.

13.30 PRIVATA KALENDERHÄNDELSER

Användaren ska kunna välja om GainPilot-händelser ska markeras som privata.

Detta är särskilt viktigt för:

- delade arbetskalendrar,

- familjekalendrar,

- eller organisationskonton.

GainPilot ska inte anta att externa kalenderhändelser endast är synliga för användaren.

13.31 TILLGÄNGLIGHETSANALYS

GainPilot ska kunna analysera tillgängliga träningsfönster.

Analysen kan väga:

- passlängd,

- restid om tillåtet,

- träningsmiljö,

- återhämtning,

- användarpreferens,

- och närliggande aktiviteter.

Systemet ska inte automatiskt boka varje ledigt hål.

Ett tomt kalenderfönster betyder inte alltid att användaren vill träna.

13.32 FÖREDRAGNA TRÄNINGSTIDER

Användaren ska kunna ange:

- föredragen tid,

- acceptabel tid,

- och tider som bör undvikas.

Exempel:

Föredraget:

Förmiddag.

Acceptabelt:

Tidig kväll.

Undvik:

Efter 21.00.

Dessa preferenser ska påverka schemaläggningen men kunna övertrumfas av användarens aktuella beslut.

13.33 KALENDERKONFLIKTER

En konflikt kan uppstå när:

- ett nytt möte överlappar passet,

- passet flyttas för nära nästa pass,

- ett långt pass bokas i ett kort tidsfönster,

- eller flera träningsformer konkurrerar.

GainPilot ska identifiera konflikten och presentera relevanta lösningar.

Exempel:

Ditt benpass överlappar nu ett möte och kan inte genomföras inom det återstående tidsfönstret.

Alternativ:

1. Flytta hela passet till torsdag.

2. Använd dagens 35-minutersversion.

3. Behåll endast huvudövningarna i dag och flytta konditionen.

13.34 KONFLIKTPRIORITET

Alla kalenderkonflikter är inte lika viktiga.

GainPilot ska kunna skilja mellan:

- informationskonflikt,

- praktisk konflikt,

- programkonflikt,

- återhämtningskonflikt,

- och säkerhetskonflikt.

Exempel:

Informationskonflikt:

Två aktiviteter har samma tid men en är endast en påminnelse.

Praktisk konflikt:

Användaren kan inte vara på två platser samtidigt.

Återhämtningskonflikt:

Två tunga benpass hamnar på efterföljande dagar.

Säkerhetskonflikt:

Programmet försöker schemalägga blockerad aktivitet.

Konfliktklassen ska påverka hur starkt systemet agerar.

13.35 AUTOMATISK OMBOKNING

GainPilot får kunna flytta lågriskaktiviteter automatiskt när användarens kontrollnivå tillåter det.

Automatisk ombokning ska ha regler för:

- tillåtet tidsfönster,

- maximal förskjutning,

- återhämtning,

- låsta dagar,

- och användarens preferenser.

Exempel:

Ett flexibelt promenadpass kan flyttas från tisdag till onsdag.

Ett tungt huvudpass ska normalt kräva starkare kontroll.

Alla automatiska flyttar ska vara synliga och återställningsbara.

13.36 OMBOKNINGSFÖRSLAG

När automatisk flytt inte är tillåten ska Arnold presentera ett förslag.

Förslaget ska beskriva:

- vad som flyttas,

- varför,

- hur resten av veckan påverkas,

- och vilket alternativ som rekommenderas.

Exempel:

Jag rekommenderar att torsdagens löppass flyttas till onsdag. Det minskar konflikten med lördagens benpass utan att ändra veckans totala konditionsmängd.

13.37 MISSAT PASS

Ett missat pass ska få en tydlig status.

Exempel:

- missat,

- avbrutet,

- ombokat,

- medvetet borttaget,

- eller ersatt av kortversion.

GainPilot ska inte automatiskt beskriva allt som “misslyckat”.

Orsaken kan påverka nästa åtgärd.

13.38 MISSAT PASS SKA INTE SKAPA SKULD

GainPilot ska inte bygga en växande kö av ogjorda pass.

Systemet ska inte automatiskt flytta varje missat pass framåt.

I stället ska det bedöma:

- passets prioritet,

- programmets struktur,

- återstående vecka,

- återhämtning,

- och målet.

Möjliga beslut:

- flytta passet,

- använda reservpass,

- hoppa över lägre prioriterad aktivitet,

- kombinera en begränsad del,

- eller fortsätta enligt ordinarie plan.

13.39 PASSENS PRIORITET

Varje pass ska kunna ha prioritet.

Exempel:

- kritiskt huvudpass,

- hög prioritet,

- normal,

- kompletterande,

- valbart,

- eller reservpass.

Prioriteten ska påverka hur GainPilot hanterar:

- tidsbrist,

- missade pass,

- resor,

- och återhämtningsproblem.

Ett valbart pass ska inte behandlas som lika viktigt som programmets centrala huvudpass.

13.40 AKTIVITETERNAS PRIORITET

Även delar inom ett pass ska kunna prioriteras.

Exempel:

Kritisk:

Huvudlyft.

Hög:

Viktig kompletteringsövning.

Normal:

Ytterligare volym.

Valbar:

Finisher.

När passet kortas ska GainPilot bevara högre prioriterade delar först.

13.41 KORTVERSION AV PASS

Varje relevant pass ska kunna ha en kortversion.

Kortversionen ska definiera:

- minsta passlängd,

- vilka delar som behålls,

- vilka delar som reduceras,

- vilka delar som tas bort,

- och vilken funktion som fortfarande bevaras.

Kortversionen ska inte skapas slumpmässigt i stunden om den kan planeras i förväg.

Exempel:

Ordinarie pass:

65 minuter.

Kortversion:

35 minuter.

Behåller:

Bänkpress, rodd och benövning.

Reducerar:

Ett set per kompletteringsövning.

Tar bort:

Valfri armfinisher.

13.42 MINIMIPASS

GainPilot ska även kunna definiera ett minimipass.

Ett minimipass används när användaren har mycket begränsad tid men vill bevara:

- rutinen,

- huvudrörelsen,

- eller en viktig programkontakt.

Exempel:

15 minuter:

- snabb uppvärmning,

- huvudövning,

- en kompletterande rörelse.

Minimipasset ska inte automatiskt räknas som fullständig ersättning för ordinarie pass.

Systemet ska dokumentera vilken del av stimulansen som saknades.

13.43 RESERVPASS

Programmet ska kunna innehålla reservpass.

Exempel:

- hemmaversion,

- hotellgymversion,

- kroppsviktsversion,

- kortversion,

- eller lågtrötthetsversion.

Reservpasset ska kopplas till villkor.

Exempel:

Använd när:

- gymmet är stängt,

- användaren reser,

- endast 30 minuter finns,

- eller återhämtningen är lägre än normalt.

Reservpass ska hjälpa användaren fortsätta utan att GainPilot behöver improvisera hela programmet.

13.44 RESOR

GainPilot ska kunna planera för resor.

Planeringen kan ta hänsyn till:

- resedatum,

- tillgänglig utrustning,

- förväntad tid,

- tidszon,

- resetrötthet,

- och användarens mål.

Användaren ska kunna välja:

- fortsätta programmet,

- använda reseprogram,

- använda minimiplan,

- eller pausa progressionen.

GainPilot ska inte kräva platsdata när användaren själv kan ange reseperiod och utrustning.

13.45 HOTELLGYM

Ett hotellgymprogram ska kunna skapas från:

- faktisk utrustning,

- sannolik grundutrustning,

- eller ett försiktigt reservscenario.

Om utrustningen är okänd ska GainPilot inte anta att:

- skivstång,

- rack,

- eller avancerade maskiner

finns.

Systemet kan skapa ett adaptivt pass som väljer övningar efter vad användaren hittar på plats.

13.46 HEMMATRÄNING

GainPilot ska kunna växla till hemmaträning.

Systemet ska använda användarens registrerade utrustning.

Exempel:

- kroppsvikt,

- hantlar,

- motståndsband,

- skivstång,

- bänk,

- pull-up-stång,

- eller träningscykel.

Ett tillfälligt hemmapass ska inte automatiskt ändra användarens långsiktiga gymprofil.

13.47 FÖRÄNDRAD TRÄNINGSMILJÖ

När användaren byter gym eller träningsmiljö långsiktigt ska GainPilot kunna:

- uppdatera utrustningsprofil,

- kontrollera aktiva övningar,

- skapa substitutionsförslag,

- och omkalibrera relevanta belastningar.

Miljöändringen ska kunna vara:

- tillfällig,

- tidsbegränsad,

- eller permanent.

13.48 ARBETSTIDER OCH SKIFT

GainPilot ska stödja varierande arbetsscheman.

Användaren ska kunna ange:

- fasta arbetstider,

- roterande skift,

- eller kalenderbaserad tillgänglighet.

Planeringen ska kunna använda:

- träningsfönster,

- återhämtning mellan skift,

- sömnmöjlighet,

- och användarens erfarenhet.

GainPilot ska inte göra medicinska antaganden om skiftarbete men ska kunna anpassa den praktiska strukturen.

13.49 STUDIER OCH PERIODER MED HÖG BELASTNING

GainPilot ska kunna ta hänsyn till:

- prov,

- deadlines,

- intensiva arbetsperioder,

- eller andra tidsbegränsade belastningar.

Hermes kan dela minimerad information som:

Kommande vecka har låg kvällstillgänglighet.

GainPilot behöver normalt inte veta:

- kursnamn,

- arbetsinnehåll,

- eller privata projektdetaljer.

Systemet kan föreslå:

- kortare pass,

- minskad frekvens,

- eller minimiplan under perioden.

13.50 FAMILJELIV

Programmet ska kunna fungera tillsammans med familjeliv.

Användaren ska kunna ange:

- fasta familjetider,

- läggning,

- hämtning,

- gemensamma måltider,

- och tider som inte bör bokas.

GainPilot ska använda praktisk planeringsinformation utan att skapa detaljerade profiler om andra familjemedlemmar.

13.51 BARNOMSORG OCH OFÖRUTSÄGBARHET

Användare med små barn kan behöva större flexibilitet.

GainPilot ska kunna skapa:

- korta reservpass,

- flexibla träningsfönster,

- hemmaversioner,

- och asynkron programordning.

Systemet ska inte tolka återkommande schemaförändringar som bristande motivation utan kontext.

13.52 PROGRAMPAUS

Användaren ska kunna pausa ett program.

En paus ska innehålla:

- startdatum,

- orsak om användaren vill ange den,

- förväntad längd,

- vilka funktioner som stoppas,

- och hur återgång ska hanteras.

Under paus ska GainPilot normalt stoppa:

- automatisk progression,

- obligatoriska passnotiser,

- och nya programveckor.

Historiken ska bevaras.

13.53 PAUS UTAN SLUTDATUM

En paus kan vara tills vidare.

GainPilot ska då kunna:

- avstå från återkommande pressande notiser,

- erbjuda en lågmäld återkomstmöjlighet,

- och låta användaren själv återaktivera.

Systemet ska inte automatiskt återstarta programmet.

13.54 PLANERAD PAUS

Vissa pauser kan vara planerade.

Exempel:

- semester,

- tävlingsvila,

- operation,

- eller intensiv arbetsperiod.

GainPilot ska kunna skapa en plan för:

- perioden före pausen,

- vad som eventuellt bevaras under pausen,

- och gradvis återgång.

13.55 ÅTERSTART EFTER PAUS

Efter en paus ska GainPilot inte automatiskt fortsätta exakt där användaren slutade.

Systemet ska bedöma:

- pausens längd,

- orsak,

- aktuell kapacitet,

- och eventuella nya begränsningar.

Möjliga återstarter:

- fortsätt samma vecka,

- upprepa tidigare vecka,

- skapa återstartsvecka,

- minska belastning,

- eller skapa nytt block.

13.56 MINIMILÄGE

GainPilot ska kunna växla programmet till minimiläge.

Minimiläge ska användas när full progression inte är realistisk men användaren vill bevara det viktigaste.

Minimiläget kan innehålla:

- färre pass,

- kortare pass,

- enklare koststruktur,

- prioriterade rörelser,

- och lägre registreringsbörda.

Det ska ha:

- tydligt syfte,

- giltighetstid,

- och omprövningspunkt.

13.57 SÄSONGSPLANERING

GainPilot ska kunna hantera säsongsbaserade mål.

Exempel:

- muskelbyggnad under höst och vinter,

- viktminskning inför sommaren,

- löplopp på våren,

- CrossFit-tävling,

- eller styrketest.

Säsongsplanering ska inte skapa osunda eller extrema mål.

Programmet ska fortfarande följa säkerhets- och hållbarhetsprinciperna.

13.58 TÄVLINGAR OCH EVENEMANG

Användaren ska kunna lägga till:

- lopp,

- tävling,

- testdag,

- fysisk aktivitet,

- eller annat måldatum.

Händelsen ska kunna påverka:

- programblock,

- belastningsplan,

- återhämtning,

- och kalenderprioritering.

GainPilot ska vara ärligt om tiden är för kort för en säker eller realistisk förberedelse.

13.59 MÅLDATUM

Ett måldatum ska ha:

- mål,

- datum,

- prioritet,

- säkerhetsmarginal,

- och uppföljningsplan.

Systemet ska skilja mellan:

- fast datum,

- önskat datum,

- och ungefärlig period.

GainPilot ska inte lova att biologiska resultat kan garanteras till ett visst datum.

13.60 BAKLÄNGESPLANERING

GainPilot ska kunna planera bakåt från ett måldatum.

Processen kan vara:

Mål

→ Utvärderingskriterier

→ Slutfas

→ Huvudblock

→ Grundblock

→ Startnivå

→ Veckoplanering

Baklängesplanering ska ta hänsyn till:

- faktisk tillgänglig tid,

- återhämtning,

- och användarens nivå.

Planen ska inte komprimera en orimlig mängd utveckling bara för att måldatumet är nära.

13.61 FRAMÅTPLANERING

GainPilot ska även planera framåt från användarens aktuella kapacitet.

Framåtplanning kan vara bättre när:

- målet saknar fast datum,

- användaren är nybörjare,

- kapaciteten är osäker,

- eller anpassningen behöver ske stegvis.

Systemet ska kunna kombinera bakåt- och framåtplanering.

13.62 VECKOPLANERING

Arnold ska kunna hjälpa användaren planera kommande vecka.

Veckoplaneringen ska kunna omfatta:

- tillgänglighet,

- träningspass,

- kondition,

- matförberedelse,

- återhämtning,

- och möjliga konflikter.

Processen ska vara enkel.

Exempel:

1. Bekräfta veckans tillgänglighet.

2. Placera huvudpass.

3. Placera kompletterande pass.

4. Kontrollera återhämtning.

5. Skapa reservlösningar.

6. Bekräfta planen.

13.63 VECKOGODKÄNNANDE

Användaren ska kunna välja om den nya veckoplanen:

- gäller automatiskt,

- behöver godkännas,

- eller endast visas som förslag.

Kontrollnivån kan skilja mellan:

- programinnehåll,

- kalenderplacering,

- och mindre ombokningar.

13.64 RULLANDE PLANERING

GainPilot ska kunna använda rullande planering.

Det innebär att systemet kontinuerligt planerar en begränsad framtidsperiod.

Exempel:

- kommande sju dagar,

- två veckor,

- eller aktuellt programblock.

Detaljnivån ska vara hög närmast i tiden och lägre längre fram.

Detta minskar behovet av att låsa varje exakt träningsdag flera månader i förväg.

13.65 PLANERINGSHORISONT

Användaren ska kunna välja planeringshorisont.

Exempel:

- dag för dag,

- en vecka,

- två veckor,

- ett programblock,

- eller fullständig programperiod.

GainPilot ska rekommendera en horisont utifrån:

- schemastabilitet,

- mål,

- och användarens kontrollpreferens.

13.66 KALENDERLÅSNINGAR

Användaren ska kunna låsa:

- ett träningspass,

- en dag,

- ett tidsfönster,

- en vilodag,

- eller en återkommande serie.

GainPilot får inte flytta låsta aktiviteter automatiskt.

Om en låsning skapar konflikt ska Arnold:

- förklara konflikten,

- och föreslå förändringar i olåsta delar.

13.67 PROGRAMLÅSNINGAR

Användaren ska kunna låsa:

- träningsfrekvens,

- träningssplit,

- huvudövningar,

- programblock,

- progressionsmodell,

- eller programkälla.

Programlåsning och kalenderlåsning ska vara separata.

Exempel:

Ett pass kan vara programmässigt låst men kalenderflexibelt.

Det får flyttas men inte förändras.

13.68 VILODAGAR

Vilodagar ska vara en del av planen.

De ska inte endast vara dagar utan träningspass.

En vilodag kan vara:

- fullständig vila,

- lätt aktivitet,

- aktiv återhämtning,

- eller vardagsaktivitet utan särskilt träningsmål.

GainPilot ska kunna skydda viktiga vilodagar från olämplig ombokning.

13.69 FLEXIBILITETSDAGAR

Programmet kan innehålla flexibilitetsdagar.

En flexibilitetsdag kan användas för:

- ombokning,

- valfritt pass,

- promenad,

- teknikträning,

- eller vila.

Flexibilitetsdagen ska inte fyllas automatiskt bara för att den är tom.

13.70 KOSTPLANERING I KALENDERN

GainPilot ska kunna visa kostrelaterade planeringsaktiviteter.

Exempel:

- matförberedelse,

- inköp,

- vägning,

- veckoplanering,

- eller förberedelse inför lång aktivitet.

Kostkalendern ska inte skapa onödig detaljstyrning av varje måltid.

Användaren ska kunna välja detaljnivå.

13.71 MATFÖRBEREDELSE

Matförberedelse kan planeras som:

- storkok,

- inköp,

- portionsförberedelse,

- eller snabb planering.

GainPilot ska kunna koppla förberedelsen till:

- veckans recept,

- antal portioner,

- och användarens tillgänglighet.

Systemet ska inte skapa inköp eller beställningar utan rätt mandat.

13.72 INKÖPSPLANERING

Inköpslistan ska kunna kopplas till kalendern.

Exempel:

Planerade måltider:

Måndag till torsdag.

Inköp:

Söndag eftermiddag.

Användaren ska kunna flytta inköpsaktiviteten utan att recepten automatiskt förändras.

13.73 VÄGNING OCH UPPFÖLJNING

GainPilot ska kunna planera valfria uppföljningar som:

- kroppsvikt,

- kroppsmått,

- programutvärdering,

- eller målsamtal.

Systemet ska inte skicka pressande påminnelser om vikt när användaren har valt bort dem eller när säkerhetsregler begränsar funktionen.

13.74 PÅMINNELSER

Påminnelser ska vara användarstyrda.

Användaren ska kunna välja:

- vilka aktiviteter som ger påminnelse,

- när påminnelsen skickas,

- kanal,

- och hur detaljerad den är.

GainPilot ska undvika överdriven notisfrekvens.

Målet är relevant stöd, inte maximal appöppning.

13.75 SMARTA PÅMINNELSER

GainPilot kan använda kontext för att förbättra påminnelser.

Exempel:

- passet börjar snart,

- användaren har inte bekräftat gymbyte,

- eller utrustning behöver förberedas.

Smarta påminnelser ska inte bli övervakande.

Systemet ska inte använda privat plats- eller kalenderinformation utan tydligt mandat.

13.76 PÅMINNELSE VID FÖRÄNDRING

När ett pass ändras ska användaren kunna få en tydlig sammanfattning.

Exempel:

Torsdagens benpass har flyttats till fredag 17.30.

Orsak:

Kalenderkonflikt.

Följd:

Lördagens intervaller har flyttats till söndag för bättre återhämtning.

Användaren ska kunna:

- godkänna,

- återställa,

- eller redigera.

13.77 STARTA TRÄNINGSPASS FRÅN KALENDERN

Användaren ska kunna öppna dagens pass direkt från kalendern.

Övergången ska bevara:

- rätt programversion,

- rätt pass,

- planerade belastningar,

- och dagens eventuella anpassningar.

Ett gammalt kalenderobjekt får inte öppna fel programversion.

13.78 GENOMFÖRANDESTATUS

Ett pass ska kunna markeras som:

- planerat,

- påbörjat,

- genomfört,

- delvis genomfört,

- avbrutet,

- flyttat,

- ersatt,

- eller missat.

Statusen ska användas i analysen.

Delvis genomfört ska inte automatiskt räknas som helt missat.

13.79 DELVIS GENOMFÖRT PASS

När användaren genomför en del av passet ska GainPilot registrera:

- vilka delar som slutfördes,

- vilka som hoppades över,

- orsak om den är relevant,

- och hur detta påverkar nästa plan.

Systemet ska inte automatiskt försöka lägga till alla missade set senare.

13.80 AVBRUTET PASS

Ett avbrutet pass kan bero på:

- tidsbrist,

- teknikproblem,

- smärta,

- utrustning,

- yttre händelse,

- eller låg energi.

Orsaken ska påverka nästa åtgärd.

Smärta ska aktivera säkerhetsprocess.

Tidsbrist ska i första hand behandlas som planeringsinformation.

13.81 PASS EFTER OPLANERAD AKTIVITET

Användaren kan genomföra annan fysisk aktivitet än planerat.

Exempel:

- spontan fotboll,

- längre promenad,

- cykeltur,

- eller tungt fysiskt arbete.

GainPilot ska kunna registrera aktiviteten och bedöma om den påverkar kommande pass.

Systemet ska inte automatiskt förändra programmet för varje mindre aktivitet.

13.82 DUBBELBOKADE TRÄNINGSAKTIVITETER

GainPilot ska upptäcka när flera träningsaktiviteter planeras för samma tidsfönster.

Det kan vara avsiktligt.

Exempel:

Styrketräning följd av kort kondition.

Systemet ska skilja mellan:

- kombinerat pass,

- dubbelbokning,

- och alternativ aktivitet.

Användaren ska kunna bekräfta strukturen.

13.83 TVÅ PASS SAMMA DAG

GainPilot ska stödja två pass samma dag när det passar användaren och målet.

Systemet ska kontrollera:

- ordning,

- tidsavstånd,

- återhämtning,

- kost,

- och total belastning.

Två pass samma dag ska inte föreslås lättvindigt för användare som saknar behov eller kapacitet.

13.84 MORGON- OCH KVÄLLSPASS

Om två pass planeras samma dag ska GainPilot kunna skilja mellan:

- morgonpass,

- kvällspass,

- och sammanhängande dubbelsession.

Planeringen ska beakta:

- passens syfte,

- belastningsöverlappning,

- och användarens praktiska vardag.

13.85 KOMBINATION AV STYRKA OCH KONDITION

Styrka och kondition ska placeras med hänsyn till:

- huvudmål,

- intensitet,

- rörelsemönster,

- och återhämtning.

GainPilot ska kunna rekommendera:

- samma pass,

- olika tider samma dag,

- eller olika dagar.

Det finns ingen universell kalenderregel för alla användare.

13.86 KOMBINATION AV CROSSFIT OCH ANNAN TRÄNING

CrossFit-pass kan innehålla flera belastningsformer.

Kalendern ska inte behandla ett CrossFit-pass som en enkel konditionsaktivitet.

GainPilot ska analysera:

- styrkedel,

- gymnastik,

- tyngdlyftning,

- workout,

- och total intensitet

när andra pass placeras.

13.87 KOMBINATION AV CALISTHENICS OCH STYRKETRÄNING

Calisthenicsfärdigheter kan placeras:

- före styrketräning,

- som separat kortpass,

- eller på annan dag.

Placeringen ska bero på:

- färdighetens prioritet,

- teknisk känslighet,

- och lokal belastning.

GainPilot ska undvika att lägga avancerad skill-träning efter tung tröttande volym om tekniken kräver hög kvalitet.

13.88 KALENDER OCH ÅTERHÄMTNING

Kalendern ska kunna visa återhämtningskonsekvenser.

Exempel:

- för kort tid mellan tunga benpass,

- hög pressbelastning flera dagar i rad,

- eller lång intensiv aktivitet före huvudpass.

Systemet ska visa konflikt på ett begripligt sätt.

Det ska inte presentera återhämtning som exakt förutsägbar.

13.89 KALENDER OCH KOST

Kostmotorn ska kunna använda kalendern för att planera:

- träningsnära måltider,

- matförberedelse,

- och energi vid längre aktiviteter.

GainPilot ska inte göra vardagskosten onödigt komplicerad.

Mer detaljerad planering ska användas när aktiviteten faktiskt motiverar det.

13.90 KALENDER OCH SÖMN

Om användaren delar relevant sömn- eller arbetstidsinformation kan GainPilot undvika olämpliga träningsförslag.

Exempel:

Ett mycket sent hårt pass före en tidig arbetsmorgon kanske inte passar användarens preferenser.

Systemet ska inte anta att alla reagerar likadant på sen träning.

13.91 KALENDER OCH PLATS

Plats kan användas om användaren har godkänt det.

Exempel:

- hemmagym,

- kommersiellt gym,

- CrossFit-box,

- utomhus,

- eller hotell.

GainPilot ska normalt använda platskategori eller vald träningsmiljö i stället för exakt position.

Exakt platsdata ska endast användas när uppgiften kräver det.

13.92 GEOFENCE

Framtida geofence kan användas för godkända arbetsflöden.

Exempel:

- visa gympasset när användaren anländer till gymmet,

- påminna om paket eller inköp nära relevant plats,

- eller aktivera ett förberett träningsläge.

Geofence ska vara:

- valbart,

- tydligt,

- tidsbegränsat där lämpligt,

- och möjligt att stänga av.

Det får inte bli ständig rörelsespårning.

13.93 KALENDERDATA SOM KÄNSLIG INFORMATION

Kalenderdata kan avslöja:

- arbete,

- relationer,

- hälsa,

- rörelsemönster,

- och privatliv.

GainPilot ska därför använda dataminimering.

Normalt behov:

- tillgänglig tid.

Inte normalt behov:

- hela mötesinnehållet.

Hermes ska kontrollera kalenderåtkomsten.

13.94 DELADE KALENDRAR

Användaren kan använda:

- familjekalender,

- arbetskalender,

- föreningskalender,

- eller delad tränarkalender.

GainPilot ska inte anta att användaren äger alla händelser.

Skrivåtkomst till delad kalender ska kräva tydligt mandat och rätt behörighet.

13.95 FLERA KALENDRAR

GainPilot ska kunna läsa tillgänglighet från flera godkända kalendrar.

Systemet ska kunna:

- sammanföra upptagna tider,

- undvika dubbletter,

- och respektera kalenderprioritet.

Privata detaljer ska inte kopieras mellan kalendrar.

13.96 KALENDERFÄRGER

Användaren ska kunna välja en visuell kategori för:

- styrketräning,

- kondition,

- återhämtning,

- kostplanering,

- och uppföljning.

Färger ska inte vara den enda informationsbäraren.

Tillgänglighetskrav ska gälla.

13.97 ÅTERKOMMANDE HÄNDELSER

Träningspass kan synkroniseras som återkommande händelser.

GainPilot ska skilja mellan:

- återkommande kalendermall,

- och programmets riktiga individuella pass.

En förändring av ett pass ska inte oavsiktligt skriva om hela serien.

Systemet ska stödja:

- endast denna händelse,

- denna och följande,

- eller hela serien.

13.98 ÄNDRING AV SERIE

När en återkommande serie ändras ska GainPilot:

- identifiera omfattningen,

- kontrollera programversionen,

- visa konsekvenser,

- och skapa rätt kalenderuppdatering.

Exempel:

Flytta endast torsdagens pass denna vecka.

Det ska inte ändra alla framtida torsdagar.

13.99 TIDSZONER

GainPilot ska hantera tidszoner vid:

- resor,

- kalenderintegrationer,

- tävlingar,

- och fjärrcoachning.

Systemet ska bevara:

- originaltid,

- tidszon,

- och lokal visning.

Ett pass får inte flyttas till fel dag genom felaktig tidszonskonvertering.

13.100 SOMMARTID

Kalenderintegrationer ska hantera övergång till och från sommartid.

Återkommande pass ska förbli på användarens avsedda lokala tid när det är relevant.

13.101 OFFLINEKALENDER

Användaren ska kunna se sin senaste synkroniserade plan offline.

Offlinevyn ska innehålla:

- dagens och närmaste pass,

- aktiv programversion,

- och säkerhetskritiska begränsningar.

Offlineändringar ska synkroniseras med konfliktkontroll.

13.102 SYNKRONISERINGSKONFLIKTER

Konflikter kan uppstå när:

- passet ändras i GainPilot,

- samma händelse ändras i extern kalender,

- eller en enhet arbetar offline.

GainPilot ska ha tydliga regler för:

- källsystem,

- senaste användarbeslut,

- versionsnummer,

- och manuell granskning.

Systemet får inte enbart använda senaste tidsstämpel utan kontext.

13.103 IDEMPOTENT KALENDERSYNKRONISERING

Samma kalenderuppdatering ska kunna köras igen utan att skapa dubbletter.

Varje synkroniserad händelse ska ha:

- intern identitet,

- extern identitet,

- version,

- och synkroniseringsstatus.

13.104 RADERING AV KALENDERHÄNDELSE

När en GainPilot-händelse raderas i extern kalender ska systemet följa definierad policy.

Möjliga beteenden:

- markera passet som oschemalagt,

- fråga användaren,

- ta bort endast kalenderkopian,

- eller avbryta aktiviteten.

GainPilot ska inte anta att radering alltid betyder att användaren vill ta bort passet ur programmet.

13.105 RADERING I GAINPILOT

När ett pass tas bort i GainPilot ska användaren kunna välja om den externa kalenderhändelsen också ska tas bort.

Programhistorik och auditinformation kan behöva bevaras separat.

13.106 ÅTERKALLAD KALENDERÅTKOMST

När användaren återkallar kalenderintegrationen ska GainPilot:

- sluta läsa och skriva,

- ta bort tokens,

- visa senaste synkroniseringsstatus,

- och låta användaren besluta om befintliga GainPilot-händelser.

Programmet ska fortsätta fungera utan extern kalender.

13.107 MANUELL PLANERING

Användaren ska alltid kunna planera manuellt.

Manuell planering ska inte betraktas som ett sämre läge.

Användaren kan:

- dra och släppa pass,

- välja datum,

- ändra tidsfönster,

- och låsa aktiviteter.

GainPilot ska därefter analysera konsekvenser och varna vid relevanta konflikter.

13.108 DRAG OCH SLÄPP

När ett pass flyttas genom drag och släpp ska systemet direkt kunna visa:

- ny dag,

- återhämtningskonsekvens,

- överlappning,

- och eventuell påverkan på andra pass.

Användaren ska kunna genomföra flytten även när den inte är optimal, så länge den inte bryter mot en säkerhetsregel.

Konsekvensen ska vara tydlig.

13.109 SNABBÄNDRINGAR

Vanliga kalenderändringar ska kunna göras snabbt.

Exempel:

- flytta till i morgon,

- markera som vila,

- använd kortversion,

- byt till hemmapass,

- eller hoppa över.

Snabbändringen ska fortfarande skapa rätt status och historik.

13.110 MASSÄNDRINGAR

Användaren ska kunna ändra flera framtida aktiviteter.

Exempel:

- jag reser nästa vecka,

- jag kan endast träna två dagar under kommande månad,

- eller flytta alla söndagspass till lördag.

Massändringen ska:

- förhandsgranskas,

- konsekvensbedömas,

- och kunna återställas.

13.111 FÖRHANDSGRANSKNING

Större kalenderändringar ska visa:

- vilka aktiviteter som flyttas,

- vilka som förändras,

- vilka som tas bort,

- och hur programmet påverkas.

Användaren ska kunna godkänna hela förändringen eller redigera delar.

13.112 ÅTERSTÄLLNING

Kalenderändringar ska kunna återställas.

Återställningen ska kunna omfatta:

- en händelse,

- en vecka,

- en serie,

- eller hela senaste massändringen.

Systemet ska kontrollera om nya aktiviteter eller användarändringar har tillkommit sedan den gamla versionen.

13.113 FÖRÄNDRINGSHISTORIK

Betydelsefulla planeringsändringar ska dokumenteras.

Historiken kan innehålla:

- datum,

- tidigare tid,

- ny tid,

- orsak,

- initiativtagare,

- kontrollnivå,

- berörda aktiviteter,

- och användargodkännande.

Exempel:

Datum:

14 september 2026.

Förändring:

Fredagens benpass flyttades till lördag.

Orsak:

Kalenderkonflikt.

Följdändring:

Lördagens intervaller flyttades till söndag.

Initierad av:

Arnold.

Godkänd av:

Användaren.

13.114 PLANERINGSHYPOTES

Större programförändringar ska kunna ha en planeringshypotes.

Exempel:

Hypotes:

Tre fasta pass och ett flexibelt pass kommer ge bättre följsamhet än fyra fasta pass.

Förändring:

Det fjärde passet blir valbart helgpass.

Förväntat resultat:

Högre genomförandegrad utan att huvudvolymen påverkas.

Uppföljning:

Efter fyra veckor.

13.115 PLANERINGENS UTFALL

GainPilot ska följa om den valda kalenderstrukturen fungerar.

Relevanta signaler:

- genomförda pass,

- återkommande flyttar,

- passlängd,

- sena avbokningar,

- kortversioner,

- och användarfeedback.

Systemet ska inte bedöma kalendern enbart utifrån om alla pass blev genomförda.

En plan kan vara för rigid även om användaren tillfälligt lyckas följa den.

13.116 FÖLJSAMHET OCH KALENDERKVALITET

Låg följsamhet kan tyda på:

- fel träningsfrekvens,

- fel tidpunkt,

- för långa pass,

- för liten flexibilitet,

- eller ändrat mål.

GainPilot ska analysera kalenderstrukturen innan det beskriver problemet som bristande disciplin.

13.117 PLANERAD FLEXIBILITET

Flexibilitet ska vara en del av designen.

Ett program kan exempelvis ange:

- tre pass ska genomföras,

- två pass är högprioriterade,

- ett pass kan placeras valfri dag,

- och en reservdag finns.

Detta är bättre än att behandla varje flytt som ett programfel.

13.118 PLANENS MINIMINIVÅ

Varje program ska kunna definiera en miniminivå.

Exempel:

Ordinarie:

Fyra träningspass.

Miniminivå:

Tre pass där programmets huvudfunktion fortfarande bevaras.

Miniminivån ska inte användas som dold permanent sänkning.

Den ska vara en avsiktlig reservstruktur.

13.119 PLANENS OPTIMALA NIVÅ

Programmet kan även beskriva en optimal nivå.

Exempel:

Miniminivå:

Tre pass.

Normal nivå:

Fyra pass.

Optimal nivå:

Fyra pass plus ett valbart lågintensivt konditionspass.

GainPilot ska undvika att kalla den högsta möjliga träningsmängden optimal om den inte är bättre för användaren.

13.120 EXTRA PASS

Användaren kan vilja lägga till ett extra pass.

GainPilot ska kontrollera:

- huvudmål,

- aktuell belastning,

- återhämtning,

- kommande pass,

- och varför användaren vill lägga till det.

Ett extra pass kan vara:

- teknik,

- promenad,

- lågintensiv kondition,

- valfri hypertrofi,

- eller social aktivitet.

GainPilot ska inte automatiskt godkänna extra högintensiv träning.

13.121 BORTTAGNING AV PASS

När användaren tar bort ett pass ska GainPilot beskriva:

- vad passet bidrog med,

- vad som förloras,

- och om något annat behöver anpassas.

Ett enstaka borttaget pass behöver inte förändra hela programmet.

Återkommande borttagning kan leda till omprövning av grundstrukturen.

13.122 PROGRAMREDIGERING

Användaren ska kunna redigera:

- veckodagar,

- pass,

- övningar,

- set,

- repetitionsmål,

- och prioritet.

GainPilot ska analysera konsekvenser och skilja mellan:

- lokal redigering,

- programförändring,

- och målkonflikt.

Manuella ändringar ska inte tyst skrivas över av Arnold.

13.123 REDIGERING AV AKTIV VECKA

Ändringar i den aktiva veckan ska kunna gälla:

- endast aktuellt tillfälle,

- resten av veckan,

- eller framtida programveckor.

Systemet ska fråga eller tydligt visa omfattningen.

13.124 REDIGERING AV FRAMTIDA VECKOR

När programstrukturen ändras framåt ska en ny programversion skapas när förändringen är betydelsefull.

Historiska veckor ska förbli kopplade till den version som faktiskt användes.

13.125 PROGRAMVERSIONERING

Varje betydelsefull programförändring ska skapa eller kopplas till en programversion.

Versionen ska kunna innehålla:

- programstruktur,

- mål,

- block,

- pass,

- progression,

- kalenderregler,

- kontrollnivå,

- och aktiva låsningar.

Användaren ska kunna jämföra versioner.

13.126 PROGRAMDIFF

GainPilot ska kunna visa skillnaden mellan programversioner.

Exempel:

- träningsdag flyttad,

- pass borttaget,

- övning ersatt,

- set reducerat,

- progression ändrad,

- eller nytt block tillagt.

Diffen ska skilja mellan:

- användarändring,

- Arnold-förslag,

- tränarändring,

- och automatisk lågriskanpassning.

13.127 ROLLBACK AV PROGRAM

Användaren ska kunna återgå till en tidigare programversion.

Rollback ska kontrollera:

- aktuell kapacitet,

- säkerhetsbegränsningar,

- kalender,

- och händelser som tillkommit sedan versionen användes.

Systemet får inte återaktivera gamla blockerade övningar eller inaktuella säkerhetsregler.

13.128 PROGRAMFÖRSLAG

GainPilot ska kunna skapa ett nytt programförslag.

Förslaget ska innehålla:

- mål,

- struktur,

- träningsfrekvens,

- passlängd,

- programblock,

- progression,

- reservlösningar,

- och förklaring.

Förslaget ska inte bli aktivt förrän tillämplig kontrollprocess är klar.

13.129 PROGRAMFÖRHANDSGRANSKNING

Användaren ska kunna se programmet före aktivering.

Förhandsgranskningen ska visa:

- veckostruktur,

- pass,

- uppskattad tid,

- övningar,

- målmatchning,

- och eventuella kompromisser.

Arnold ska sammanfatta varför programmet är utformat på detta sätt.

13.130 PROGRAMGODKÄNNANDE

Användaren ska kunna:

- godkänna hela programmet,

- redigera delar,

- låsa delar,

- be om alternativ,

- eller avvisa.

Större program ska inte aktiveras genom ett otydligt standardval.

13.131 AKTIVERING

När programmet aktiveras ska GainPilot skapa:

- aktiv programversion,

- startdatum,

- första programvecka,

- kalenderplacering,

- kontrollnivå,

- och första uppföljningspunkt.

Tidigare aktivt program ska:

- pausas,

- avslutas,

- eller arkiveras

enligt användarens beslut.

13.132 FLERA AKTIVA PROGRAM

GainPilot ska vara försiktigt med flera aktiva program.

Systemet kan stödja flera programkomponenter, men de ska samordnas.

Exempel:

- styrkeprogram,

- löpprogram,

- calisthenics-skill,

- och kostfas.

Det ska finnas en övergripande plan som beskriver:

- huvudmål,

- belastningsprioritet,

- och komponentägande.

13.133 PROGRAMKOMPONENTER

Ett aktivt upplägg ska kunna bestå av komponenter.

Exempel:

Träningskomponent:

Styrka.

Konditionskomponent:

Löpning.

Skill-komponent:

Handstående.

Kostkomponent:

Viktstabilitet.

Varje komponent ska ha:

- mål,

- källa,

- kalenderregler,

- ändringsmandat,

- och prioritet.

13.134 KOMPONENTKONFLIKTER

GainPilot ska analysera konflikter mellan komponenter.

Exempel:

- hög löpvolym och tung benstyrka,

- hög pressvolym och handstående,

- eller CrossFit plus separat högintensiv kondition.

Systemet ska kunna:

- flytta,

- reducera,

- eller prioritera om

inom användarens mandat.

13.135 MÄNSKLIG TRÄNARE

När en mänsklig tränare äger programmet ska GainPilot respektera detta.

Arnold kan:

- visa programmet,

- logga,

- påminna,

- analysera,

- och hjälpa med praktisk kalenderplacering.

Han får inte ändra tränarens program utanför mandatet.

Användaren ska kunna dela relevanta ändringsförslag med tränaren.

13.136 COACHUPPDATERINGAR

En mänsklig tränare kan uppdatera programmet.

GainPilot ska kunna:

- ta emot ny version,

- visa diff,

- kontrollera kalenderkonflikter,

- och be användaren bekräfta aktivering.

Tränarens uppdatering ska inte radera användarens historik.

13.137 DELNING MED TRÄNARE

Användaren ska kunna dela:

- kalenderstatus,

- genomförda pass,

- feedback,

- och valda analyser

med tränaren.

Delningen ska vara:

- explicit,

- granulär,

- tidsbegränsad där lämpligt,

- och återkallelig.

13.138 ARNOLDS ROLL

Arnold ska göra planeringen begriplig och praktisk.

Han ska kunna:

- visa dagens plan,

- sammanfatta veckan,

- hjälpa vid kalenderkonflikter,

- föreslå reservlösningar,

- förklara programändringar,

- och följa upp planens genomförbarhet.

Under vardaglig användning ska kommunikationen vara kort.

Exempel:

Du har 35 minuter i dag. Jag har öppnat kortversionen av överkroppspasset. Huvudövningarna behålls och armfinishern tas bort.

13.139 ATLAS ROLL

Atlas ska hjälpa med:

- långsiktig målplanering,

- godkänd kalenderkontext,

- konflikt mellan flera Omnira-åtaganden,

- research,

- och analys av planeringsmönster.

Atlas kan exempelvis identifiera:

- återkommande perioder där programmet bör växla till minimiläge,

- kommande resor,

- eller målkonflikter mellan flera projekt och aktiviteter.

Atlas får inte direkt skriva om GainPilots aktiva program utan rätt mandat och domänprocess.

13.140 HERMES ROLL

Hermes ska kontrollera delningen av:

- kalenderdata,

- projektbelastning,

- platskategori,

- och annan Omnira-kontext.

GainPilot ska normalt få:

- tillgänglighetsfönster,

- tidsbegränsningar,

- och godkända planeringssignaler.

GainPilot ska normalt inte få:

- privata mötesbeskrivningar,

- meddelanden,

- andra projekts interna innehåll,

- eller detaljer om andra personer.

13.141 MINNE OCH PLANERING

GainPilot ska minnas relevanta planeringsmönster.

Exempel:

- realistisk passlängd,

- vanligt fungerande träningsdagar,

- återkommande konflikter,

- och vilka reservpass användaren föredrar.

Ett tillfälligt schema ska inte automatiskt bli permanent preferens.

Mönster ska bekräftas när de får större framtida påverkan.

13.142 PLANERINGSINFERENSER

GainPilot kan observera:

- att fredagens pass ofta flyttas,

- att sena kvällspass ofta avbryts,

- eller att fyradagarsveckor regelbundet blir tredagarsveckor.

Systemet ska först behandla detta som inferens.

Arnold kan fråga:

Fredagspasset har flyttats eller missats under fem av de senaste sex veckorna. Vill du att jag bygger om grundschemat så att fredagen blir valfri?

13.143 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera planeringsfunktionernas kvalitet.

Det kan exempelvis omfatta:

- hur ofta pass flyttas,

- vilka dagar som skapar låg följsamhet,

- hur ofta kortversioner används,

- om automatiska ombokningar återställs,

- och var kalenderintegrationen misslyckas.

Analysen ska hållas åtskild från personlig coachning och använda minimerad data.

13.144 PLANERINGSMETRIK

Relevanta metrik kan vara:

- planerade mot genomförda pass,

- ombokningsfrekvens,

- kortversionsfrekvens,

- genomsnittlig faktisk passlängd,

- kalenderkonflikter,

- och andel veckor där miniminivån uppnåddes.

GainPilot ska inte optimera för hundraprocentig schemalydnad om det gör programmet sämre eller ohållbart.

13.145 FRAMGÅNGSMÅTT

Ett bra program- och kalendersystem ska leda till:

- högre genomförbarhet,

- färre onödiga konflikter,

- begriplig prioritering,

- stabil progression,

- och lägre planeringsbörda.

Målet är inte att kalendern alltid ska vara full.

13.146 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar ett förbättringsbehov ska processen vara:

Signal

→ Analys

→ Hypotes

→ Förbättringsförslag

→ Risk- och integritetsbedömning

→ Godkänt scope

→ Separat branch

→ Implementation

→ Tester

→ Pull request

→ Granskning

→ Kontrollerad merge

→ Resultatuppföljning

Ingen agent får direkt förändra:

- programmodell,

- kalenderpolicy,

- ombokningsregler,

- externa skrivbehörigheter,

- eller produktion

utifrån en enskild analysinsikt.

13.147 TESTNING AV PROGRAMMODELLEN

Programmodellen ska testas genom:

- enhetstester,

- kontraktstester,

- scenariotester,

- regressionstester,

- och simulering.

Tester ska verifiera:

- programversioner,

- block,

- veckor,

- pass,

- prioritet,

- låsningar,

- och statusövergångar.

13.148 TESTNING AV KALENDERN

Kalendersystemet ska testas mot:

- fasta dagar,

- flexibla pass,

- asynkrona program,

- flera tidszoner,

- sommartid,

- återkommande händelser,

- offlineändringar,

- och externa konflikter.

13.149 SCENARIOTESTER

Scenariotester ska omfatta:

- användare med tre fasta träningsdagar,

- användare med skiftarbete,

- förälder med oförutsägbart schema,

- student under provvecka,

- hotellgym under resa,

- missat huvudpass,

- två pass samma dag,

- kombinerad styrka och löpning,

- CrossFit plus separat styrka,

- och program från mänsklig tränare.

13.150 BEHÖRIGHETSTESTER

Tester ska verifiera att:

- läsbehörighet inte ger skrivbehörighet,

- GainPilot endast får godkända kalendrar,

- privata mötesdetaljer inte exponeras,

- och återkallad integration respekteras.

13.151 SÄKERHETSTESTER

Säkerhetstester ska verifiera att:

- blockerade aktiviteter inte schemaläggs,

- allvarliga återhämtningskonflikter inte ignoreras,

- högriskförändringar kräver rätt kontroll,

- och externa kalendertexter inte kan skriva om programmet genom promptinjektion.

13.152 SYNKRONISERINGSTESTER

Synkronisering ska testas för:

- idempotens,

- dubbletter,

- externa ändringar,

- raderingar,

- offlinearbete,

- serieförändringar,

- och konfliktlösning.

13.153 SIMULERING ÖVER TID

GainPilot ska kunna simulera kalendern över ett programblock.

Simulering kan identifiera:

- otillräcklig återhämtning,

- återkommande dubbelbokning,

- orimlig passlängd,

- för många ändringar,

- och perioder där programmet inte ryms i användarens kalender.

Simuleringen ska vara ett planeringsstöd, inte en garanti för biologiskt resultat.

13.154 OBSERVABILITY

Det ska gå att förstå:

- varför ett pass placerades en viss dag,

- vilken kalenderinformation som användes,

- vilka konflikter som upptäcktes,

- vilka alternativ som övervägdes,

- och varför en ombokning föreslogs.

Tekniska loggar ska minimera privat kalenderinnehåll.

13.155 AUDIT

Betydelsefulla kalender- och programhändelser ska loggas.

Exempel:

- program aktiverades,

- pass flyttades automatiskt,

- användaren återställde en ändring,

- extern kalenderåtkomst beviljades,

- serie uppdaterades,

- eller integration återkallades.

Auditloggen ska ha egen behörighet och retention.

13.156 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots program-, kalender- och planeringssystem.

**Kontrakt GP-201 — Program som versionshanterat kontrakt**

Varje aktivt program ska vara en strukturerad, versionshanterad och spårbar representation av mål, plan, progression och mandat.

**Kontrakt GP-202 — Programkälla och ägande**

Program och programkomponenter ska ha definierad källa, ägare och ändringsrätt.

**Kontrakt GP-203 — Huvudmål och prioritering**

Varje aktivt program ska ha ett tydligt huvudmål och en explicit prioritering mellan sekundära mål.

**Kontrakt GP-204 — Programvecka och kalendervecka**

GainPilot ska skilja mellan programmets interna progression och kalenderns datumstruktur.

**Kontrakt GP-205 — Fasta, flexibla och asynkrona upplägg**

Programmodellen ska stödja fasta kalenderdagar, flexibla fönster, hybridupplägg och asynkron träningsordning.

**Kontrakt GP-206 — Realistisk passlängd**

Kalenderbokningar ska baseras på realistiskt uppskattad och senare kalibrerad tidsåtgång.

**Kontrakt GP-207 — Prioriterad reservstruktur**

Relevanta pass ska kunna ha kortversion, minimipass eller reservpass som bevarar programmets viktigaste funktion.

**Kontrakt GP-208 — Missade pass skapar inte automatisk skuld**

Missade pass får inte automatiskt staplas på framtida dagar utan program- och återhämtningsanalys.

**Kontrakt GP-209 — Program- och kalenderlåsningar**

Användarlåsta programdelar och kalenderhändelser får inte ändras automatiskt.

**Kontrakt GP-210 — Minimerad kalenderåtkomst**

GainPilot ska i första hand använda tillgänglighetsinformation och inte privata kalenderdetaljer.

**Kontrakt GP-211 — Separata läs- och skrivbehörigheter**

Kalenderläsning och kalenderskrivning ska kräva separata scopes och användarbeslut.

**Kontrakt GP-212 — Källsystem för kalenderdata**

Varje synkroniserad datatyp ska ha ett definierat källsystem och en konfliktpolicy.

**Kontrakt GP-213 — Idempotent synkronisering**

Kalender- och programuppdateringar ska kunna upprepas utan oavsiktliga dubbletter.

**Kontrakt GP-214 — Kontrollerad automatisk ombokning**

Automatisk flytt av aktiviteter får endast ske inom uttryckliga tids-, risk- och användarmandat.

**Kontrakt GP-215 — Programkonsekvens före ombokning**

Flytt av pass ska analyseras i relation till återhämtning, övriga pass och programmets prioritet.

**Kontrakt GP-216 — Originalprogram ska respekteras**

GainPilot får inte förändra ett externt eller tränarägt program utanför användarens och ägarens definierade mandat.

**Kontrakt GP-217 — Komponentbaserad planering**

Träning, kondition, skills och kost ska kunna vara separata komponenter inom en samordnad övergripande plan.

**Kontrakt GP-218 — Förklarbar planering**

Betydelsefull programplacering och ombokning ska kunna förklaras genom mål, tillgänglighet, prioritet och återhämtning.

**Kontrakt GP-219 — Återställningsbar förändring**

Program- och kalenderändringar ska ha historik och kunna återställas när säkerhet och aktuell version tillåter det.

**Kontrakt GP-220 — Branchbaserad planeringsutveckling**

Förändringar av programmodell, kalenderintegration, ombokningsmotor och behörighetspolicy ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

13.157 ANTI-PRINCIPER

GainPilot ska inte:

- behandla programmet som en statisk lista med pass,

- skapa program utan tydligt mål,

- behandla alla mål som lika prioriterade,

- blanda samman kalendervecka och programvecka,

- kräva fasta veckodagar för alla användare,

- anta att ledig kalendertid automatiskt är träningsbar tid,

- boka pass som regelbundet inte ryms i tidsfönstret,

- ignorera restid och förberedelsetid när användaren vill inkludera dem,

- kräva extern kalenderintegration för att GainPilot ska fungera,

- begära full kalenderåtkomst när upptagen eller ledig räcker,

- behandla läsbehörighet som skrivbehörighet,

- skriva känsliga tränings- eller hälsouppgifter i externa kalenderhändelser utan behov,

- flytta låsta pass,

- flytta huvudpass automatiskt utan mandat,

- stapla missade pass på framtiden,

- behandla delvis genomfört pass som helt missat,

- använda skuldbeläggande kalenderdesign,

- fylla flexibilitetsdagar bara för att de är tomma,

- göra tillfällig reseplan till permanent programstruktur,

- fortsätta progression när programmet är pausat,

- återstarta program automatiskt efter obestämd paus,

- återgå direkt till full belastning efter långt uppehåll,

- kombinera flera program utan samlad analys,

- skriva över mänsklig tränares program,

- låta två programkomponenter styra samma aktivitet utan tydligt ägande,

- skapa återkommande kalenderhändelser utan korrekt seriehantering,

- ändra hela serien när endast ett tillfälle avses,

- ignorera tidszon eller sommartid,

- skapa dubbletter vid upprepad synkronisering,

- tolka extern kalenderradering som säker programradering,

- låta externa kalendertexter ändra GainPilots regler,

- använda privat kalenderinformation för andra syften än användaren har godkänt,

- optimera för full kalender i stället för hållbar utveckling,

- eller ändra planeringsmotorn direkt i main eller produktion utan branch, tester och granskning.

13.158 KANONISKA BESLUT FRÅN KAPITEL 13

Följande beslut etableras:

1. GainPilot ska ha en canonical programmodell.

2. Program ska vara strukturerade och versionshanterade.

3. Varje program ska ha stabil identitet.

4. Programnamn ska kunna ändras utan att identiteten bryts.

5. Varje program ska ha definierad källa.

6. Program och komponenter ska ha definierat ägande.

7. Ägande ska skiljas från teknisk lagring.

8. Varje aktivt program ska ha ett huvudmål.

9. Sekundära mål och bevarandemål ska prioriteras separat.

10. Program ska kunna ha fasta, villkorsbaserade eller löpande tidshorisonter.

11. Program ska kunna bestå av flera block.

12. Blockövergångar ska baseras på utvärdering och inte endast datum.

13. Programveckor och kalenderveckor ska behandlas separat.

14. GainPilot ska stödja asynkron programordning.

15. GainPilot ska stödja fasta träningsdagar.

16. GainPilot ska stödja hybridstruktur med fasta och flexibla pass.

17. Kalendern ska vara ett operativt planeringslager.

18. Programvy och kalendervy ska använda samma underliggande programdata.

19. GainPilot ska ha dags-, vecko-, månads- och tidslinjevy.

20. Pass ska kunna planeras till exakt tid eller bredare tidsfönster.

21. GainPilot ska inte uppfinna exakt tid när användaren inte har valt det.

22. Kalenderblocket ska baseras på realistisk passlängd.

23. Faktisk passlängd ska kunna kalibrera framtida uppskattningar.

24. Användaren ska kunna välja om restid och förberedelse ingår.

25. GainPilot ska kunna integreras med externa kalendrar.

26. GainPilot ska fungera utan extern kalender.

27. Varje kalenderintegration ska använda minsta nödvändiga scope.

28. Läs- och skrivbehörighet ska separeras.

29. GainPilot ska i första hand använda upptagen- eller ledigdata.

30. Kalenderhändelser ska minimera känslig information.

31. Användaren ska kunna markera GainPilot-händelser som privata.

32. GainPilot ska inte boka varje ledigt kalenderfönster.

33. Föredragna, acceptabla och olämpliga träningstider ska kunna anges.

34. Kalenderkonflikter ska klassificeras efter betydelse.

35. Automatisk ombokning ska följa användarens mandat.

36. Huvudpass ska ha starkare ombokningsskydd än lågriskaktiviteter.

37. Ombokningsförslag ska beskriva följdverkningar.

38. Missade pass ska ha strukturerad status.

39. Missade pass ska inte automatiskt staplas på framtiden.

40. Pass och passdelar ska kunna prioriteras.

41. Relevanta pass ska kunna ha en kortversion.

42. GainPilot ska kunna skapa minimipass.

43. Program ska kunna innehålla reservpass.

44. Reservpass ska kopplas till uttryckliga villkor.

45. GainPilot ska stödja reseplanering.

46. Hotellgymprogram ska inte anta avancerad utrustning.

47. GainPilot ska stödja tillfällig och permanent hemmaträning.

48. Förändrad träningsmiljö ska kunna omkalibrera övningar och belastningar.

49. GainPilot ska stödja fasta och roterande arbetstider.

50. Minimerad studie- och arbetsbelastningskontext ska kunna användas genom Hermes.

51. GainPilot ska stödja familjetider och oförutsägbarhet.

52. Användaren ska kunna pausa program.

53. Paus ska stoppa automatisk progression och irrelevanta notiser.

54. Paus utan slutdatum ska inte återstartas automatiskt.

55. Återstart efter paus ska konsekvensbedömas.

56. Program ska kunna växla till minimiläge.

57. Minimiläge ska ha syfte och omprövningspunkt.

58. GainPilot ska stödja säsongsplanering.

59. Tävlingar och måldatum ska kunna påverka blockplanering.

60. Måldatum får inte innebära garanterat resultat.

61. GainPilot ska kunna planera bakåt från ett måldatum.

62. GainPilot ska kunna planera framåt från aktuell kapacitet.

63. Arnold ska kunna genomföra enkel veckoplanering.

64. Användaren ska kunna välja om veckoplanen aktiveras automatiskt eller kräver godkännande.

65. GainPilot ska stödja rullande planering.

66. Planeringshorisonten ska kunna anpassas.

67. Användaren ska kunna låsa kalenderhändelser.

68. Användaren ska kunna låsa programstruktur.

69. Kalenderlåsning och programlåsning ska vara separata.

70. Vilodagar ska vara en aktiv del av planen.

71. Flexibilitetsdagar ska kunna lämnas tomma.

72. Kostrelaterade förberedelser ska kunna visas i kalendern.

73. Inköps- och måltidsplanering ska vara valbara.

74. Vikt- och uppföljningspåminnelser ska vara användarstyrda.

75. Påminnelser ska optimeras för stöd och inte maximal öppningsfrekvens.

76. Kalenderändringar ska kunna sammanfattas och återställas.

77. Dagens pass ska kunna startas direkt från kalendern.

78. Rätt programversion ska öppnas.

79. Pass ska kunna vara planerade, påbörjade, genomförda, delvisa, avbrutna, flyttade eller missade.

80. Delvis genomförda pass ska registreras strukturerat.

81. Avbrutna pass ska analyseras utifrån orsak.

82. Oplanerad fysisk aktivitet ska kunna påverka kommande planering.

83. GainPilot ska upptäcka dubbelbokade aktiviteter.

84. Två pass samma dag ska konsekvensbedömas.

85. Styrka och kondition ska placeras målspecifikt.

86. CrossFit ska analyseras som en sammansatt belastning.

87. Calisthenicsfärdigheter ska placeras utifrån teknisk prioritet och lokal belastning.

88. Kalendern ska kunna visa återhämtningskonflikter.

89. Kostmotorn ska kunna använda träningskalendern.

90. Sömn- och platskontext ska vara valbar och minimerad.

91. Geofence ska endast användas i godkända arbetsflöden.

92. Kalenderdata ska behandlas som potentiellt känslig.

93. Delade kalendrar ska ha tydlig skrivbehörighet.

94. Flera kalendrar ska kunna sammanföras utan att privata detaljer kopieras.

95. Kalenderkategorier ska vara tillgängliga utan färgberoende.

96. Återkommande aktiviteter ska stödja korrekt seriehantering.

97. Tidszoner och sommartid ska hanteras.

98. Kalendern ska kunna användas offline i begränsad omfattning.

99. Synkroniseringskonflikter ska lösas med version och källsystem.

100. Kalendersynkronisering ska vara idempotent.

101. Radering i extern kalender ska inte automatiskt radera programmet.

102. Återkallad kalenderåtkomst ska stoppa fortsatt synkronisering.

103. Manuell planering ska vara ett fullvärdigt läge.

104. Drag och släpp ska visa konsekvenser.

105. Vanliga kalenderändringar ska kunna göras snabbt.

106. Massändringar ska kunna förhandsgranskas.

107. Program- och kalenderändringar ska vara återställningsbara.

108. Betydelsefulla planeringsändringar ska ha historik.

109. Planeringshypoteser ska kunna följas upp.

110. GainPilot ska analysera om kalenderstrukturen faktiskt fungerar.

111. Låg följsamhet ska kunna leda till omprövning av kalendern.

112. Flexibilitet ska byggas in i programdesignen.

113. Program ska kunna definiera miniminivå, normalnivå och valbara tillägg.

114. Extra pass ska analyseras innan de läggs till.

115. Borttagning av pass ska visa konsekvens.

116. Användaren ska kunna redigera programmet.

117. Manuella ändringar ska inte tyst skrivas över.

118. Ändringens omfattning ska kunna gälla ett tillfälle, en vecka eller framtiden.

119. Betydelsefulla programändringar ska skapa ny version.

120. Programversioner ska kunna jämföras och återställas.

121. Nya programförslag ska förhandsgranskas och godkännas.

122. Aktivering ska skapa kalender, programvecka och uppföljningspunkt.

123. GainPilot ska samordna flera programkomponenter.

124. Varje komponent ska ha mål, källa, mandat och prioritet.

125. Mänskliga tränarprogram ska respekteras.

126. Delning med tränare ska vara explicit och återkallelig.

127. Arnold ska vara användarens primära planeringsgränssnitt.

128. Atlas ska bidra med bredare planeringsanalys utan att kringgå GainPilots regler.

129. Hermes ska minimera kalender- och projektkontext.

130. Planeringsmönster får inte bli permanenta preferenser utan tillräckligt underlag.

131. Plattformsanalys ska hållas åtskild från personlig planering.

132. Program- och kalendersystemet ska testas genom enhets-, kontrakts-, scenario-, säkerhets-, behörighets-, synkroniserings- och regressionstester.

133. Planeringen ska kunna simuleras över programblock.

134. Betydelsefulla beslut ska vara observerbara och auditerbara.

135. Förändringar av planeringssystemet ska ske på separat branch med tester, pull request och kontrollerad merge.

136. Agentautonomi inom program- och kalenderdomänen ska vara explicit, begränsad och återkallelig.

13.159 IMPLEMENTERINGSORDNING

GainPilots program-, kalender- och planeringssystem ska implementeras stegvis.

Fas 1 — Canonical programmodell

Implementera:

- programidentitet,

- mål,

- källa,

- ägare,

- status,

- version,

- och kontrollnivå.

Fas 2 — Programstruktur

Implementera:

- programblock,

- programveckor,

- träningspass,

- passdelar,

- prioritet,

- och progressionskoppling.

Fas 3 — Intern kalender

Implementera:

- dagsvy,

- veckovy,

- månadsvy,

- passplacering,

- status,

- och manuell flytt.

Fas 4 — Passlängd och prioritering

Implementera:

- uppskattad tidsåtgång,

- faktisk tidsåtgång,

- prioriterade passdelar,

- kortversion,

- och minimipass.

Fas 5 — Missade och flyttade pass

Implementera:

- ombokning,

- hoppa över,

- delvis genomfört,

- förändringshistorik,

- och konsekvensanalys.

Fas 6 — Reservpass

Implementera:

- hemmaversion,

- hotellgymversion,

- kortversion,

- lågtrötthetsversion,

- och tydliga aktiveringsvillkor.

Fas 7 — Veckoplanering

Implementera:

- tillgänglighet,

- fasta och flexibla pass,

- veckogodkännande,

- miniminivå,

- och rullande planering.

Fas 8 — Programversionering

Implementera:

- versioner,

- diff,

- rollback,

- användarändringar,

- Arnold-förslag,

- och låsningar.

Fas 9 — Kalenderintegration v1

Implementera:

- en extern kalenderleverantör,

- OAuth,

- läsbehörighet,

- upptagen eller ledig,

- och minimerad kontext genom Hermes.

Fas 10 — Kalenderskrivning

Implementera:

- skapa händelse,

- uppdatera tid,

- ta bort kalenderkopia,

- privata händelser,

- och separat skrivmandat.

Fas 11 — Återkommande händelser och synkronisering

Implementera:

- enstaka tillfälle,

- denna och följande,

- hela serien,

- idempotens,

- och konfliktlösning.

Fas 12 — Fördjupad ombokningsmotor

Implementera:

- återhämtningsanalys,

- programprioritet,

- automatisk lågriskflytt,

- förslag,

- och återställning.

Fas 13 — Resor och miljöbyten

Implementera:

- hotellgym,

- hemmaträning,

- tillfällig utrustningsprofil,

- tidszon,

- och återstartsplan.

Fas 14 — Flerkomponentsplanering

Implementera samordning mellan:

- styrka,

- kondition,

- CrossFit,

- calisthenics,

- och kost.

Fas 15 — Atlas och Omnira-kontext

Implementera genom Hermes:

- minimerad kalenderbelastning,

- resesignal,

- större tidsbegränsningar,

- och godkända måldatum.

Fas 16 — Fördjupad planeringsintelligens

Implementera:

- planeringshypoteser,

- genomförbarhetsanalys,

- personliga tidsmönster,

- simulering,

- och stabilitetsskydd.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- integritetsgranskning,

- säkerhetsgranskning,

- pull request,

- kontrollerad merge,

- och resultatuppföljning.

13.160 FRAMGÅNGSKRITERIER

Kapitel 13:s vision är framgångsrikt realiserad när:

- GainPilot kan omvandla användarens mål till ett tydligt program,

- programmet har källa, ägare, mål och version,

- programblock och programveckor är begripliga,

- kalendervecka och programvecka hålls åtskilda,

- användaren kan välja fasta, flexibla eller asynkrona träningsdagar,

- pass bokas med realistisk tidsåtgång,

- faktisk passlängd förbättrar framtida planering,

- användaren kan se dagens och veckans viktigaste aktiviteter,

- programmet har kortversioner och reservpass,

- missade pass inte skapar växande träningsskuld,

- pass kan flyttas utan att återhämtning och programlogik ignoreras,

- användaren kan låsa pass och programdelar,

- resor och ändrad träningsmiljö kan hanteras,

- minimiläge kan aktiveras under krävande perioder,

- program kan pausas och återstartas kontrollerat,

- flera träningsformer kan samordnas,

- kostplanering kan kopplas till relevanta aktiviteter,

- externa kalendrar kan användas med minsta nödvändiga behörighet,

- läs- och skrivåtkomst är separerade,

- privata kalenderdetaljer inte delas i onödan,

- kalenderhändelser synkroniseras utan dubbletter,

- serieförändringar inte påverkar fel tillfällen,

- användaren kan planera manuellt,

- massändringar kan förhandsgranskas,

- program- och kalenderändringar har historik,

- användaren kan återställa förändringar,

- mänskliga tränarprogram respekteras,

- Arnold kan förklara varför ett pass placerades eller flyttades,

- Atlas kan bidra med bredare planeringsintelligens utan obegränsad kalenderåtkomst,

- Hermes minimerar all extern kontext,

- planeringssystemet lär sig vad som fungerar utan att låsa användaren till gamla mönster,

- och alla förbättringar genomförs genom separat branch, tester, pull request och kontrollerad merge.

13.161 SAMMANFATTNING

GainPilots program- och kalendersystem ska vara länken mellan användarens långsiktiga mål och det som faktiskt händer i vardagen.

Ett program ska inte vara en statisk lista med träningspass.

Det ska vara en levande men styrd plan som beskriver:

- målet,

- prioriteringarna,

- programblocken,

- träningsveckorna,

- progressionen,

- reservlösningarna,

- och användarens kontrollnivå.

Kalendern ska göra planen operativ.

Den ska visa:

- vad som ska göras,

- när det kan göras,

- hur lång tid det tar,

- vad som är viktigast,

- och vilka alternativ som finns när verkligheten förändras.

GainPilot ska stödja:

- fasta träningsdagar,

- flexibla tidsfönster,

- asynkron träningsordning,

- och hybrida strukturer.

Användaren ska inte behöva passa in livet i en onödigt rigid träningsvecka.

Programmet ska i stället kunna fungera tillsammans med:

- arbete,

- studier,

- familjeliv,

- resor,

- skiftarbete,

- och perioder med lägre kapacitet.

Missade pass ska inte skapa skuld eller en växande kö.

GainPilot ska avgöra vad som bör:

- flyttas,

- kortas,

- ersättas,

- eller lämnas bakom.

Relevanta pass ska ha:

- kortversion,

- minimipass,

- eller reservpass.

Det gör att användaren kan bevara programmets viktigaste funktion även när full plan inte är möjlig.

Kalenderintegration ska vara valbar.

När den används ska GainPilot i första hand få:

- tillgänglighetsfönster,

- inte användarens fullständiga privata kalenderinnehåll.

Läs- och skrivbehörighet ska vara separata.

Alla kalenderhändelser ska använda minsta nödvändiga information.

Arnold ska vara den coach som hjälper användaren förstå och förändra planen.

Han ska kunna säga:

- vad som är viktigast,

- varför ett pass placeras en viss dag,

- vad ett kortpass bevarar,

- och hur resten av veckan påverkas av en ombokning.

Atlas ska hjälpa med långsiktig planering, måldatum och godkänd Omnira-kontext.

Hermes ska säkerställa att kalender- och projektinformation minimeras innan den når GainPilot.

Program, kalenderhändelser och planeringsbeslut ska vara:

- versionshanterade,

- spårbara,

- förklarbara,

- och återställningsbara.

Ingen agent får ändra ett tränarägt program, en låst programdel eller en extern kalender utanför användarens mandat.

Alla förändringar av programmodell, kalenderintegration och ombokningslogik ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- integritetsgranskning,

- säkerhetsgranskning,

- pull request,

- kontrollerad merge,

- och uppföljning.

Kapitel 13 etablerar därmed följande kärnprincip:

GainPilot ska inte bara skapa en bra träningsplan. Plattformen ska göra planen genomförbar i användarens verkliga liv — med tydliga prioriteringar, intelligenta reservlösningar och en kalender som kan förändras utan att programmets mål, säkerhet eller långsiktiga progression går förlorad.
