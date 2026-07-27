# Kapitel 14 — Träningspasset och den aktiva coachupplevelsen

GainPilots träningspass ska vara den plats där programmets långsiktiga logik möter användarens faktiska prestation i stunden.

Det aktiva passet ska samla:

- dagens plan,

- relevant programversion,

- planerade övningar,

- set och repetitionsmål,

- belastningsförslag,

- teknikinstruktioner,

- vilotider,

- progression,

- autoreglering,

- övningsbyten,

- säkerhetssignaler,

- användarens feedback,

- och det verkliga utfallet.

Träningspasset ska inte upplevas som ett långt formulär som användaren måste administrera mellan varje set.

Det ska fungera som en aktiv coachningsyta där Arnold hjälper användaren:

- förstå vad som ska göras,

- starta med rätt plan,

- registrera resultat snabbt,

- anpassa passet när verkligheten kräver det,

- och avsluta med en begriplig sammanfattning.

GainPilot ska stödja flera träningsformer inom samma passarkitektur.

Det gäller bland annat:

- styrketräning,

- hypertrofi,

- styrkelyft,

- CrossFit,

- calisthenics,

- kondition,

- intervaller,

- cirkelträning,

- teknikträning,

- och kombinerade pass.

Varje träningsdomän ska kunna behålla sin egen riktiga struktur.

Ett styrkepass ska inte tvingas in i ett CrossFit-format.

En AMRAP ska inte reduceras till en vanlig lista med set.

Ett löpintervall ska inte behandlas som en styrkeövning med repetitioner.

En calisthenicsfärdighet ska kunna följas genom:

- assistans,

- kvalitet,

- hålltid,

- teknik,

- och progression

i stället för endast extern belastning.

Arnold ska vara närvarande under passet utan att bli störande.

Han ska kunna ge:

- korta instruktioner,

- relevanta påminnelser,

- tidsanpassade förslag,

- och säkerhetsstyrda stopp

när situationen kräver det.

Atlas ska kunna hjälpa med bredare analys och relevant minne, men ska normalt inte behöva vara aktiv i varje set.

Hermes ska kontrollera vilken användar-, sensor-, kalender- och hälsokontext som får användas under passet.

Grundprincipen är:

GainPilot ska göra träningspasset enklare att genomföra och bättre att förstå — utan att användaren behöver välja mellan intelligent coachning och ett snabbt, fokuserat träningsflöde.

14.1 TRÄNINGSPASSET SOM OPERATIV EXEKVERING

Programmet beskriver vad som planeras över tid.

Träningspasset är programmets operativa exekvering.

Det aktiva passet ska representera:

- vilken programversion som används,

- vilken programvecka passet tillhör,

- vilket planerat pass som exekveras,

- vilka anpassningar som gäller i dag,

- vad användaren faktiskt genomför,

- och vilka avvikelser som uppstår.

GainPilot ska skilja mellan:

1. Passmall.

2. Planerad passinstans.

3. Aktiv träningssession.

4. Registrerat utfall.

5. Efteranalys.

Passmallen beskriver den återanvändbara strukturen.

Den planerade passinstansen beskriver vad som är bokat för ett specifikt tillfälle.

Den aktiva träningssessionen beskriver vad som händer i realtid.

Utfallet beskriver vad användaren faktiskt gjorde.

Efteranalysen beskriver vad resultatet betyder för kommande planering.

14.2 DEN CANONICAL TRÄNINGSPASSMODELLEN

GainPilot ska ha en canonical modell för aktiva träningspass.

Modellen ska minst kunna representera:

- session_identity,

- user_identity,

- program_identity,

- program_version,

- program_week,

- planned_session_identity,

- session_type,

- training_domain,

- scheduled_start,

- actual_start,

- actual_end,

- training_environment,

- equipment_context,

- readiness_context,

- active_restrictions,

- session_parts,

- activities,

- sets_or_intervals,

- planned_targets,

- actual_results,

- rest_periods,

- substitutions,

- adaptations,

- technique_feedback,

- pain_or_safety_signals,

- completion_status,

- user_feedback,

- and session_summary.

Exakta tekniska fältnamn definieras senare.

Principen är att samma aktiva pass ska kunna förstås konsekvent av:

- användargränssnittet,

- Arnold,

- träningsmotorn,

- progressionsmotorn,

- substitutionsmotorn,

- återhämtningsmotorn,

- och analyslagret.

14.3 PASSIDENTITET

Varje aktiv träningssession ska ha en unik identitet.

Identiteten ska skiljas från:

- programmets passmall,

- kalenderhändelsen,

- och tidigare genomföranden av samma pass.

Exempel:

Passmall:

Överkropp A.

Planerad instans:

Överkropp A — vecka 4 — torsdag.

Aktiv session:

Den specifika träningssession som startas och registreras denna torsdag.

Om användaren genomför passet igen samma vecka ska det skapa en ny session och inte skriva över den första.

14.4 PLANERAT OCH GENOMFÖRT

GainPilot ska alltid skilja mellan:

- planerat innehåll,

- dagens anpassade plan,

- och faktiskt genomfört resultat.

Exempel:

Planerat:

Bänkpress 4 × 8 på 100 kilogram.

Dagens anpassning:

4 × 8 på 97,5 kilogram.

Genomfört:

8, 8, 8 och 7 repetitioner på 97,5 kilogram.

Alla tre nivåerna ska kunna bevaras.

Det gör det möjligt att förstå:

- programmets avsikt,

- GainPilots beslut,

- och användarens faktiska prestation.

14.5 PASSSTATUS

Ett träningspass ska kunna ha status som:

- planerat,

- förberett,

- startat,

- pausat,

- aktivt,

- delvis genomfört,

- genomfört,

- avbrutet,

- ersatt,

- missat,

- ogiltigförklarat,

- eller arkiverat.

Statusen ska påverka:

- synkronisering,

- analys,

- progression,

- kalender,

- och uppföljning.

Ett pass som endast öppnats av misstag ska inte automatiskt räknas som genomfört eller misslyckat.

14.6 FÖRBEREDELSEVY

Innan passet startar ska användaren kunna se en enkel förberedelsevy.

Den kan innehålla:

- passets namn,

- huvudsakligt syfte,

- uppskattad tid,

- träningsmiljö,

- nödvändig utrustning,

- dagens viktigaste övningar,

- eventuella aktiva begränsningar,

- och tillgängliga reservversioner.

Arnold kan exempelvis säga:

Dagens pass är ett överkroppspass med bänkpress som huvudövning.

Planerad tid:

Cirka 55 minuter.

Viktigast i dag:

Bänkpress, horisontellt drag och vertikal press.

Det finns även en 35-minutersversion om tiden blir knapp.

14.7 SNABB BEREDSKAPSKONTROLL

GainPilot ska kunna genomföra en kort beredskapskontroll före passet.

Kontrollen ska normalt vara enkel.

Exempel:

Hur känns kroppen inför passet?

- bra,

- normal,

- sliten,

- ovanlig smärta,

- eller sjukdomskänsla.

Vid behov kan följdfrågor ställas.

Kontrollen ska inte bli ett långt obligatoriskt frågeformulär.

Användaren ska kunna hoppa över den när säkerhetsregler och kontrollnivå tillåter det.

14.8 BEREDSKAPSDATA

Beredskapsbedömningen kan använda:

- användarens egen skattning,

- senaste träningsresultat,

- rapporterad sömn,

- aktuell träningsvärk,

- relevant återhämtningshistorik,

- och valbar wearabledata.

Ingen enskild signal ska automatiskt styra passet.

GainPilot ska kunna säga:

Du har rapporterat sämre sömn, men prestationen har varit stabil. Vi behåller huvudplanen och kalibrerar belastningen under uppvärmningen.

14.9 SÄKERHET FÖRE START

Före passet ska GainPilot kontrollera:

- aktiva övningsblockeringar,

- professionella begränsningar,

- registrerad allergi när koststöd är relevant,

- pågående sjukdomssignal,

- och andra kända högriskkonflikter.

Systemet ska inte försöka avgöra medicinsk träningsberedskap utanför sitt mandat.

Vid allvarlig signal ska Arnold kunna rekommendera att passet inte startas och att professionell bedömning söks.

14.10 TRÄNINGSMILJÖ

Användaren ska kunna bekräfta träningsmiljö före eller under passet.

Exempel:

- ordinarie gym,

- hemmagym,

- CrossFit-box,

- calisthenicspark,

- utomhus,

- hotellgym,

- eller annan tillfällig miljö.

Miljön ska påverka:

- tillgänglig utrustning,

- reservövningar,

- säkerhet,

- och tidsåtgång.

Ett tillfälligt miljöval ska inte automatiskt ändra användarens permanenta profil.

14.11 UTRUSTNINGSKONTEXT

GainPilot ska kunna förstå vilken utrustning som är tillgänglig för den aktuella sessionen.

Det kan komma från:

- användarens sparade gymprofil,

- vald miljö,

- manuell bekräftelse,

- eller tillfällig uppdatering.

Användaren ska snabbt kunna markera:

- utrustningen saknas,

- utrustningen är upptagen,

- utrustningen är trasig,

- eller ett annat redskap används.

Detta ska kunna aktivera substitutionsmotorn utan att avbryta hela passflödet.

14.12 STARTA PASS

När passet startas ska GainPilot:

- låsa rätt planerad passinstans,

- hämta aktuell programversion,

- kontrollera nya säkerhetsuppdateringar,

- skapa aktiv sessionsstatus,

- registrera starttid,

- och ladda relevant offlinecache.

Passet ska inte tyst byta till en ny programversion efter att sessionen har startat.

Om programmet ändras under passet ska användaren informeras och ändringen hanteras separat.

14.13 STARTA OPLANERAT PASS

Användaren ska kunna starta ett oplanerat träningspass.

Möjliga alternativ:

- välj befintlig passmall,

- upprepa tidigare pass,

- skapa fri träning,

- starta aktivitet,

- eller låt Arnold skapa ett tillfälligt pass.

Oplanerat pass ska inte automatiskt skrivas in som permanent programstruktur.

Efteråt kan Arnold fråga om passet ska påverka kommande planering.

14.14 UPPREPA TIDIGARE PASS

Användaren ska kunna upprepa ett tidigare pass.

GainPilot ska då tydligt visa:

- vilken historisk version som används,

- om den skiljer sig från aktuell plan,

- och om tidigare belastningar fortfarande är rimliga.

Ett gammalt pass får inte automatiskt återaktivera:

- inaktuella övningar,

- gamla blockeringar,

- eller tidigare belastningsnivåer

utan kontroll.

14.15 FRI TRÄNING

GainPilot ska stödja fri träning.

Användaren ska kunna:

- lägga till övningar,

- registrera set,

- använda timer,

- och spara passet.

Fri träning ska fortfarande kunna använda:

- canonical övningsidentiteter,

- säkerhetsbegränsningar,

- och användarens måttenheter.

Systemet ska inte tvinga fri träning att följa en fördefinierad progression.

14.16 PASSDELAR

Ett pass ska kunna bestå av flera delar.

Exempel:

1. Förberedelse.

2. Uppvärmning.

3. Teknik eller skill.

4. Huvudövning.

5. Kompletterande styrka eller hypertrofi.

6. Kondition eller workout.

7. Nedvarvning.

8. Reflektion.

Olika träningsdomäner kan använda andra strukturer.

CrossFit kan exempelvis ha:

- warm-up,

- skill,

- strength,

- metcon,

- cooldown.

Passdelarnas ordning och relation ska bevaras.

14.17 UPPVÄRMNING

GainPilot ska kunna presentera en relevant uppvärmning.

Uppvärmningen kan bestå av:

- generell rörelse,

- specifik rörelseförberedelse,

- gradvis belastningsökning,

- teknikrepetition,

- och aktivering där det är motiverat.

Systemet ska undvika att skapa onödigt långa standarduppvärmningar.

Uppvärmningen ska anpassas efter:

- passets huvudrörelser,

- träningsmiljö,

- användarens erfarenhet,

- och dagsform.

14.18 UPPVÄRMNINGSSET

Uppvärmningsset ska skiljas från arbetsset.

GainPilot ska kunna:

- föreslå startbelastning,

- föreslå belastningssteg,

- registrera resultat,

- och använda uppvärmningen för dagskalibrering.

Uppvärmningsset ska normalt inte räknas in i samma volymanalys som arbetsset.

De ska däremot kunna påverka:

- tid,

- teknikbedömning,

- och belastningsval.

14.19 AUTOMATISK UPPVÄRMNINGSPROGRESSION

För vanliga styrkeövningar kan GainPilot generera uppvärmningssteg utifrån:

- planerad arbetsvikt,

- tidigare prestation,

- användarens preferens,

- och övningens egenskaper.

Exempel:

Tom stång

→ måttlig vikt

→ mellanvikt

→ närmare arbetsvikt

→ arbetsset

Systemet ska undvika falsk precision och kunna justeras manuellt.

14.20 UPPVÄRMNING SOM KALIBRERING

GainPilot ska kunna använda uppvärmningen för att bedöma:

- om planerad belastning känns rimlig,

- om tekniken är stabil,

- om ovanlig smärta uppstår,

- och om dagens pass behöver mikroanpassas.

En avvikande uppvärmning ska inte ensam skapa en stor programändring.

Den kan däremot motivera en kontrollerad dagsanpassning.

14.21 HUVUDÖVNING

Huvudövningen ska presenteras med:

- syfte,

- planerade set,

- repetitionsmål,

- belastning eller intensitet,

- vilotid,

- teknikfokus,

- och progressionsregel.

Användaren ska snabbt kunna se vad som är viktigast.

Exempel:

Bänkpress

Syfte:

Huvudövning för styrka.

Plan:

4 × 6.

Belastning:

100 kilogram.

Intensitet:

Cirka RIR 2.

Vila:

3–4 minuter.

Teknikfokus:

Stabil startposition och jämn kontaktpunkt.

14.22 KOMPLETTERANDE ÖVNINGAR

Kompletterande övningar ska presenteras med rätt informationsnivå.

De behöver inte alltid få lika omfattande instruktion som huvudövningen.

GainPilot ska kunna visa:

- plan,

- snabb teknikpåminnelse,

- senaste resultat,

- och möjliga byten.

Passflödet ska prioritera enkel registrering.

14.23 ÖVNINGSKORT

Varje övning ska kunna visas genom ett övningskort.

Kortet kan innehålla:

- namn,

- canonical variant,

- visuell demonstration,

- planerade set,

- tidigare resultat,

- dagens förslag,

- vilotimer,

- teknikpunkter,

- och substitutionsknapp.

Användaren ska kunna öppna en djupare vy utan att övningskortet blir överbelastat.

14.24 VISUELL ÖVNINGSDEMONSTRATION

Den aktiva passvyn ska kunna visa:

- kort animation,

- video,

- steg-för-steg-instruktion,

- teknikpunkter,

- och vanliga fel.

Demonstrationen ska vara kopplad till rätt canonical övningsvariant.

GainPilot ska inte visa standardbänkpressvideo när programmet avser:

- pausad bänkpress,

- smal bänkpress,

- eller annan betydelsefull variant.

14.25 MEDIEKONTROLL

Användaren ska kunna:

- pausa,

- spela upp igen,

- ändra hastighet,

- växla vinkel,

- aktivera text,

- och stänga av animation.

Media ska fungera utan ljud.

Tillgänglighetsinställningar ska respekteras.

14.26 TEKNIKPUNKTER

GainPilot ska normalt visa ett begränsat antal teknikpunkter.

Exempel:

- stabil fotposition,

- kontrollerad excentrisk fas,

- håll stångbanan jämn.

Systemet ska undvika att visa tio eller fler instruktioner samtidigt.

För många instruktioner kan försämra användarens fokus.

14.27 TEKNIKFOKUS PER SET

Arnold ska kunna välja ett enskilt teknikfokus för ett set.

Exempel:

I nästa set fokuserar du bara på jämn kontaktpunkt.

Detta ska användas när:

- användaren lär sig övningen,

- ett återkommande problem finns,

- eller användaren uttryckligen vill ha teknikhjälp.

Arnold ska inte kommentera tekniken efter varje set utan relevant grund.

14.28 TEKNIKFEEDBACK FRÅN VIDEO

GainPilot kan på sikt stödja videoanalys.

Videoanalys ska vara:

- valbar,

- tydligt initierad,

- begränsad till relevant övning,

- och hanterad enligt integritetspolicy.

Systemet ska vara tydligt med osäkerhet.

Videoanalys kan påverkas av:

- kameravinkel,

- bildkvalitet,

- kläder,

- synlig utrustning,

- och ofullständig rörelse.

14.29 VIDEOLAGRING

Träningsvideo ska inte lagras permanent som standard.

Användaren ska kunna välja:

- analysera lokalt och radera,

- spara till aktuell session,

- spara i teknikbibliotek,

- eller dela med tränare.

Lagringsstatus ska vara tydlig.

Atlas eller andra projekt ska inte automatiskt få tillgång till videon.

14.30 AI-BASERAD TEKNIKANALYS

AI-baserad teknikfeedback får inte presenteras som absolut biomekanisk sanning.

Systemet ska kunna säga:

Jag ser en möjlig förändring i stångbanan under de sista repetitionerna, men kameravinkeln gör bedömningen osäker.

Teknikanalys ska inte diagnostisera:

- skada,

- rörelseproblem,

- eller medicinska tillstånd.

14.31 REPETITIONSREGISTRERING

GainPilot ska göra repetitionsregistrering snabb.

Användaren ska kunna:

- bekräfta planerat antal,

- ändra repetitionsantal,

- markera AMRAP,

- ange misslyckad repetition,

- eller lämna fältet tomt.

Snabbval ska prioriteras.

Exempel:

Planerat:

8.

Genomfört:

Tryck på 8 för bekräftelse.

Användaren ska inte behöva öppna tangentbordet för varje set.

14.32 BELASTNINGSREGISTRERING

Belastning ska kunna registreras som:

- kilogram,

- pund,

- maskinsteg,

- bandnivå,

- kroppsvikt,

- assistansvikt,

- procent,

- eller annan domänspecifik enhet.

GainPilot ska komma ihåg senast använda värde men inte automatiskt anta att det är rätt i dag.

14.33 VIKTPLATTOR

GainPilot kan hjälpa användaren räkna viktskivor.

Systemet ska använda:

- stångens vikt,

- tillgängliga viktskivor,

- målvikt,

- och eventuell collarsvikt.

Resultatet ska visas begripligt.

Funktionen ska stödja både kilogram och pund.

14.34 MASKINER

Maskinbelastning ska kunna registreras som:

- vikt,

- steg,

- plattnummer,

- eller användardefinierad nivå.

GainPilot ska förstå att två maskiner med samma visade vikt inte alltid är direkt jämförbara.

Maskinidentitet eller gymprofil kan behövas för meningsfull historik.

14.35 KROPPSVIKTSÖVNINGAR

Kroppsviktsövningar ska kunna registrera:

- kroppsvikt,

- extern tilläggsvikt,

- assistans,

- variant,

- repetitionsantal,

- hålltid,

- och kvalitet.

Exempel:

Pull-up:

Kroppsvikt:

87 kilogram.

Extra vikt:

10 kilogram.

Repetitioner:

6.

Systemet ska inte summera kroppsvikt och extern vikt som om det vore exakt jämförbart med en maskinbelastning utan rätt modell.

14.36 ASSISTERADE ÖVNINGAR

Assisterade övningar ska registrera assistansnivå separat.

Exempel:

- maskinassistans,

- motståndsband,

- partnerassistans,

- eller fotstöd.

Minskad assistans kan vara progression.

GainPilot ska förstå att lägre assistansvärde i vissa maskiner innebär högre faktisk svårighet.

14.37 RPE OCH RIR

GainPilot ska kunna använda:

- RPE,

- RIR,

- eller ingen ansträngningsskattning.

Användaren ska kunna välja önskad metod.

Systemet ska inte kräva skattning efter varje set för alla användare.

En förenklad modell kan fråga:

- lätt,

- lagom,

- tungt,

- eller maximalt.

14.38 RPE- OCH RIR-KALIBRERING

Arnold ska hjälpa nya användare förstå RPE och RIR.

Exempel:

RIR 2 betyder att du uppskattar att ungefär två tekniskt godtagbara repetitioner återstod.

Systemet ska inte behandla skattningen som exakt.

Över tid kan GainPilot lära användarens typiska skattningsmönster.

14.39 SETSTATUS

Varje set ska kunna ha status som:

- planerat,

- genomfört,

- delvis genomfört,

- misslyckat,

- avbrutet,

- uppvärmning,

- backoff,

- dropset,

- ej utfört,

- eller ogiltigt.

Det gör det möjligt att representera passet utan att tvinga alla resultat till samma format.

14.40 SETTYPER

GainPilot ska stödja olika settyper.

Exempel:

- raka set,

- uppvärmningsset,

- toppset,

- backoff-set,

- dropset,

- rest-pause,

- myo-reps,

- cluster-set,

- isometriskt set,

- och tekniskt övningsset.

Settypen ska påverka:

- registrering,

- analys,

- progression,

- och vila.

14.41 TOPPSET OCH BACKOFF-SET

Ett styrkepass kan använda:

- toppset på viss RPE,

- följt av backoff-set med reducerad belastning.

GainPilot ska kunna:

- föreslå toppset,

- registrera utfallet,

- beräkna eller föreslå backoff-belastning,

- och uttrycka osäkerhet.

Ett dåligt toppset ska inte automatiskt göra hela passet misslyckat.

14.42 DUBBEL PROGRESSION UNDER PASSET

Vid dubbel progression ska GainPilot kunna visa:

- repetitionsintervall,

- aktuell vikt,

- tidigare resultat,

- och kriterier för framtida viktökning.

Exempel:

Mål:

8–12 repetitioner.

När alla arbetsset når 12 repetitioner med rätt kvalitet höjs belastningen nästa gång.

Användaren ska kunna förstå regeln direkt i passvyn.

14.43 PROCENTBASERAD TRÄNING

GainPilot ska kunna använda procent av:

- verifierat max,

- uppskattat max,

- träningsmax,

- eller programdefinierat referensvärde.

Systemet ska visa vilken referens som används.

Exempel:

80 procent av träningsmax 150 kilogram.

Det ska inte vara otydligt om procenten bygger på:

- faktisk 1RM,

- e1RM,

- eller annat värde.

14.44 AUTOREGLERAD BELASTNING

GainPilot ska kunna föreslå belastning utifrån:

- planerat mål,

- uppvärmning,

- tidigare prestation,

- RPE eller RIR,

- dagsform,

- och användarens kontrollnivå.

Förslaget ska presenteras som en rekommendation eller automatisk mikroanpassning inom mandat.

Exempel:

Den planerade vikten var 100 kilogram, men uppvärmningen var tyngre än normalt. Jag föreslår 97,5 kilogram för dagens arbetsset.

14.45 BELASTNINGSINTERVALL

I vissa pass kan GainPilot ge ett belastningsintervall.

Exempel:

Välj 75–80 kilogram så att du avslutar setet med ungefär RIR 2.

Detta kan vara mer lämpligt än en exakt vikt när:

- utrustningen varierar,

- användaren autoreglerar,

- eller dagsformen påverkar.

14.46 AUTOMATISK SETJUSTERING

GainPilot får kunna justera återstående set inom användarens mandat.

Exempel:

- minska vikten,

- minska ett set,

- sänka repetitionsmålet,

- eller förlänga vilan.

Systemet ska beskriva varför.

Det får inte dölja ändringen i loggen.

14.47 MISSLYCKAT SET

När användaren inte når repetitionsmålet ska GainPilot bedöma:

- hur många repetitioner som saknades,

- teknik,

- RPE eller RIR,

- tidigare set,

- och programmets progression.

Möjliga åtgärder:

- behåll vikten,

- sänk vikten,

- justera återstående repetitioner,

- förläng vilan,

- eller avsluta övningen.

Ett misslyckat set ska inte automatiskt utlösa en stor programförändring.

14.48 TEKNISKT MISSLYCKAT SET

GainPilot ska kunna skilja mellan:

- muskelfel,

- tekniskt sammanbrott,

- avbrutet försök,

- och frivilligt avslut.

Om tekniken tydligt försämras kan Arnold rekommendera att setet avslutas även om användaren tror att fler repetitioner är möjliga.

AI-baserad teknikbedömning ska fortfarande uttrycka osäkerhet.

14.49 PERSONBÄSTA

GainPilot ska kunna identifiera relevanta personbästa.

Exempel:

- högsta belastning,

- bästa repetitionsresultat,

- uppskattat 1RM,

- längsta hålltid,

- snabbaste tid,

- längsta distans,

- eller bästa resultat vid viss standard.

Personbästa ska endast jämföras mellan tillräckligt jämförbara prestationer.

Ett personbästa med annan variant, scaling eller teknikstandard ska inte blandas ihop.

14.50 PERSONBÄSTA UNDER PASS

Arnold kan uppmärksamma ett personbästa utan att störa passet.

Exempel:

Nytt repetitionsrekord på 100 kilogram: 9 repetitioner.

Notisen ska vara kort.

Användaren ska kunna stänga av firanden under passet.

14.51 VILOTIMER

GainPilot ska ha en vilotimer.

Den ska kunna:

- starta automatiskt eller manuellt,

- använda planerad vilotid,

- förlängas,

- kortas,

- pausas,

- och fortsätta i bakgrunden.

Användaren ska kunna välja:

- ljud,

- vibration,

- visuell signal,

- eller ingen notifiering.

14.52 AUTOMATISK TIMERSTART

Timer kan starta när användaren markerar ett set som genomfört.

Detta ska vara valbart.

Systemet ska inte starta flera timers samtidigt utan tydlig struktur.

14.53 VILOINTERVALL

Vila ska kunna anges som:

- exakt tid,

- intervall,

- minimum,

- eller användarstyrt.

Exempel:

2–3 minuter.

Arnold kan säga:

Du har vilat två minuter. Börja nästa set när du känner dig redo inom det planerade intervallet.

14.54 ADAPTIV VILA

GainPilot kan föreslå längre eller kortare vila utifrån:

- setets ansträngning,

- kommande belastning,

- passets tidsram,

- och träningsmålet.

Kortare tid får inte prioriteras om det tydligt försämrar passets huvudsyfte.

Adaptiv vila ska vara ett förslag, inte en medicinsk bedömning.

14.55 TIMER OCH TILLGÄNGLIGHET

Timern ska kunna fungera med:

- skärmläsare,

- vibration,

- stora siffror,

- låsskärm,

- hörlurar,

- och smartwatch där integration finns.

Användaren ska inte behöva hålla skärmen aktiv under hela vilan.

14.56 PASSNAVIGERING

Användaren ska kunna navigera mellan övningar.

Möjliga lägen:

- strikt programordning,

- fri ordning,

- eller rekommenderad ordning med möjlighet att ändra.

När användaren ändrar ordning ska GainPilot kunna analysera:

- uppvärmning,

- utrustning,

- trötthet,

- och programfunktion.

14.57 ÄNDRAD ÖVNINGSORDNING

När utrustning är upptagen kan användaren flytta en övning senare i passet.

GainPilot ska kunna säga:

Du kan göra latsdraget senare. Det påverkar inte huvudövningen, men gör det före bicepsövningen så att dragkapaciteten inte begränsas i onödan.

Ändringen ska registreras i den aktiva sessionen men behöver inte bli permanent.

14.58 SUPERSET

GainPilot ska stödja superset.

Systemet ska kunna visa:

- vilka övningar som hör ihop,

- ordningen,

- vila efter varje övning eller runda,

- och antal rundor.

Timern ska förstå supersetstrukturen.

Användaren ska kunna bryta upp supersettet om utrustning eller miljö kräver det.

14.59 TRI-SET OCH CIRKLAR

GainPilot ska kunna representera:

- tri-set,

- cirklar,

- stationsträning,

- och andra grupperade format.

Systemet ska bevara:

- gruppidentitet,

- ordning,

- rundor,

- och vilostruktur.

Registreringen ska inte kräva att användaren lämnar gruppen efter varje enskild aktivitet.

14.60 KOMPLEX

Styrke- och tyngdlyftningskomplex ska kunna representeras som en sammanhängande sekvens.

Exempel:

1 power clean

+ 1 front squat

+ 1 jerk

GainPilot ska registrera:

- sekvens,

- antal komplex,

- belastning,

- och kvalitet.

Komplexet ska inte reduceras till tre helt separata övningar om programmets avsikt är sammanhängande utförande.

14.61 AMRAP

GainPilot ska stödja AMRAP.

Modellen ska kunna innehålla:

- tidsgräns,

- rörelser,

- repetitionsstruktur,

- scaling,

- antal fullständiga rundor,

- extra repetitioner,

- och pauser där det är relevant.

Resultatet ska kunna visas som:

7 rundor + 12 repetitioner.

Systemet ska bevara vilken scaling och rörelsestandard som användes.

14.62 EMOM

GainPilot ska stödja EMOM.

Modellen ska kunna innehålla:

- total tid,

- arbete per minut,

- flera stationer,

- repetitionsmål,

- belastning,

- och om en minut missades.

Timern ska ge tydliga signaler utan att kräva ständig skärminteraktion.

14.63 ROUNDS FOR TIME

GainPilot ska kunna registrera:

- antal rundor,

- rörelser,

- time cap,

- sluttid,

- scaling,

- och ofullständigt resultat.

Om användaren inte hinner klart ska resultatet kunna registreras som:

Time cap nådd vid 4 rundor + 15 repetitioner.

Det ska inte klassificeras som saknad data.

14.64 INTERVALLPASS

Konditionsintervaller ska kunna innehålla:

- uppvärmning,

- arbetsintervall,

- återhämtning,

- antal repetitioner,

- intensitetsmål,

- tempo,

- puls,

- effekt,

- och nedvarvning.

GainPilot ska stödja både:

- tidsbaserade,

- distansbaserade,

- pulsbaserade,

- och effektbaserade intervaller.

14.65 DISTANS OCH TEMPO

Konditionspass ska kunna registrera:

- distans,

- tid,

- tempo,

- höjdskillnad,

- underlag,

- och träningsmiljö.

GainPilot ska skilja mellan:

- löpband,

- utomhus,

- bana,

- terräng,

- och annan relevant miljö.

Resultaten ska inte behandlas som direkt jämförbara utan kontext.

14.66 PULS

Puls kan registreras genom:

- sensor,

- manuell inmatning,

- eller extern integration.

GainPilot ska behandla pulsen som mätdata med felmarginal.

Systemet ska inte diagnostisera medicinska tillstånd från pulsdata.

Vid allvarliga symptom ska professionell bedömning rekommenderas.

14.67 EFFEKT

Cykling och vissa konditionsmaskiner kan använda watt.

GainPilot ska kunna registrera:

- medeleffekt,

- toppeffekt,

- normaliserad eller leverantörsspecifik effekt där relevant,

- och intervallvärden.

Leverantörsspecifika mått ska ha tydlig källa.

14.68 CALISTHENICS-SESSIONER

Calisthenicspass ska kunna registrera:

- skill,

- progression,

- assistans,

- hålltid,

- repetitionskvalitet,

- rörelseomfång,

- försök,

- och teknisk status.

Alla försök ska inte räknas som likvärdiga arbetsset.

GainPilot ska kunna skilja mellan:

- kvalitativt försök,

- teknikdrill,

- styrkestöd,

- och misslyckat försök.

14.69 HÅLLTIDER

Isometriska färdigheter ska kunna registrera:

- hålltid,

- assistans,

- variant,

- kvalitet,

- och avbrottsorsak.

En längre hålltid med sämre position ska inte automatiskt klassificeras som bättre resultat.

14.70 FÖRSÖK OCH KVALITET

Tekniska färdigheter kan behöva följas genom:

- antal försök,

- lyckade försök,

- kvalitetsnivå,

- och teknisk kommentar.

GainPilot ska undvika att uppmuntra obegränsat antal försök när lokal belastning eller teknikförsämring ökar.

14.71 CROSSFIT-SCALING

CrossFit-sessioner ska kunna använda:

- RX,

- scaled,

- foundations,

- eller användarspecifik scaling.

Scaling ska dokumentera:

- belastning,

- rörelsevariant,

- repetitionsändring,

- höjd,

- distans,

- eller annan relevant skillnad.

Resultat med olika scaling ska inte automatiskt jämföras som identiska.

14.72 NO-REP OCH RÖRELSESTANDARD

GainPilot ska kunna registrera no-reps när användaren eller domaren anger dem.

AI ska vara försiktigt med automatisk no-rep-bedömning.

Rörelsestandarden ska vara känd.

En repetition som godkänns i vanlig träning kan skilja sig från tävlingsstandard.

14.73 PAUS UNDER PASS

Användaren ska kunna pausa ett aktivt pass.

Paus kan användas vid:

- tillfälligt avbrott,

- utrustningsproblem,

- telefonsamtal,

- eller annan händelse.

GainPilot ska skilja mellan:

- planerad vila,

- passpaus,

- och avslutat pass.

Lång paus kan påverka passanalysen.

14.74 ÅTERUPPTA PASS

Ett pausat pass ska kunna återupptas.

GainPilot ska kunna fråga om:

- miljön förändrats,

- användaren behöver ny uppvärmning,

- eller vissa övningar bör omplaneras.

Systemet ska inte automatiskt fortsätta timer och aktiva intervaller från fel tidpunkt.

14.75 PASS ÖVER FLERA SESSIONER

I vissa fall kan ett pass delas upp.

Exempel:

Huvudövningar på morgonen och kompletterande träning på kvällen.

GainPilot ska kunna representera detta som:

- ett delat pass,

- eller två relaterade sessioner.

Användaren ska förstå hur analysen räknar dem.

14.76 TIDSBRIST UNDER PASS

När tiden blir knapp ska Arnold kunna erbjuda:

- kortversion,

- prioriterad avslutning,

- borttagning av valbara delar,

- eller paus och senare fortsättning.

Förslaget ska bevara programmets huvudfunktion.

Exempel:

Du har cirka 20 minuter kvar. Behåll rodden och benövningen, men hoppa över armfinishern. Då bevaras passets viktigaste balans.

14.77 AUTOMATISK TIDSPROGNOS

GainPilot ska kunna uppskatta återstående passlängd utifrån:

- kvarvarande set,

- planerad vila,

- övningsbyten,

- och faktisk arbetstakt.

Exempel:

Beräknad tid kvar:

28–35 minuter.

Prognosen ska uppdateras utan falsk precision.

14.78 TIDSÖVERSKRIDANDE

När passet riskerar att bli längre än kalenderblocket ska Arnold kunna varna.

Varningen ska inte avbryta användaren för tidigt.

Systemet kan säga:

Med nuvarande tempo blir passet cirka 15 minuter längre än planerat. Vill du fortsätta fullt eller använda den prioriterade avslutningen?

14.79 ÖVNINGSBYTE UNDER PASS

Användaren ska kunna byta övning direkt från övningskortet.

Substitutionsmotorn ska använda:

- originalövningens funktion,

- bytesorsak,

- tillgänglig utrustning,

- aktiva begränsningar,

- och resten av passet.

Arnold ska normalt visa:

- ett rekommenderat alternativ,

- ett fåtal andra val,

- och en kort förklaring.

14.80 SNABBT BYTE VID UPPTAGEN UTRUSTNING

Vid upptagen utrustning ska användaren kunna välja:

- föreslagen ersättare,

- flytta övningen senare,

- vänta,

- eller välja från biblioteket.

GainPilot ska optimera för snabbhet utan att förlora programlogiken.

14.81 PERMANENT BYTE FRÅN PASSVYN

När användaren väljer ett byte ska systemet fråga eller härleda giltigheten inom mandat.

Exempel:

- endast detta set,

- endast dagens pass,

- resten av veckan,

- resten av blocket,

- eller permanent tills vidare.

Ett byte under tidspress ska normalt inte automatiskt bli permanent.

14.82 LÄGGA TILL ÖVNING

Användaren ska kunna lägga till en övning.

GainPilot ska kontrollera:

- passets tidsram,

- aktuell belastning,

- övningsöverlappning,

- och användarens mål.

En låg risk-övning kan läggas till manuellt.

Arnold kan varna när den extra övningen sannolikt skapar onödig belastning.

14.83 TA BORT ÖVNING

Användaren ska kunna ta bort en övning från dagens pass.

Systemet ska visa:

- övningens funktion,

- om den är viktig,

- och om borttagningen påverkar resten av veckan.

Ett tillfälligt borttagande ska inte automatiskt ändra passmallen.

14.84 ÄNDRA SET OCH REPETITIONER

Användaren ska kunna ändra dagens:

- set,

- repetitionsmål,

- belastning,

- vila,

- och ordning.

Systemet ska skilja mellan:

- lokal sessionsändring,

- framtida programändring,

- och permanent preferens.

Arnold ska inte tyst återställa användarens manuella ändring under samma pass.

14.85 ANVÄNDARMANDAT

Passautomation ska följa användarens kontrollnivå.

I vägledande läge ska Arnold:

- föreslå,

- förklara,

- och invänta beslut.

I samarbetsläge kan GainPilot automatisera:

- vilotimer,

- nästa planerade set,

- mindre belastningsjustering,

- och låg risk-substitution inom definierade regler.

I coachläge kan systemet göra fler mikroanpassningar men fortfarande inte:

- ändra huvudmål,

- ignorera låsningar,

- eller fatta högriskbeslut utan rätt approval.

14.86 LÅSTA ÖVNINGAR OCH PASSDELAR

Användaren ska kunna låsa:

- huvudövning,

- viss övningsvariant,

- antal huvudset,

- eller passets centrala del.

GainPilot får inte ändra den låsta delen automatiskt.

Om låsningen skapar konflikt ska Arnold föreslå ändringar i olåsta delar.

14.87 SMÄRTA UNDER PASS

När användaren rapporterar smärta ska passflödet byta till säkerhetsläge.

Arnold ska kunna fråga:

- var smärtan känns,

- om den är skarp eller ovanlig,

- om den uppstod plötsligt,

- och om användaren kan röra sig normalt.

GainPilot får inte diagnostisera orsaken.

Systemet ska kunna:

- stoppa aktuell övning,

- avbryta set,

- begränsa substitutioner,

- dokumentera signalen,

- och rekommendera professionell bedömning.

14.88 OBEHAG OCH NORMAL ANSTRÄNGNING

GainPilot ska hjälpa användaren skilja mellan:

- normal muskelansträngning,

- träningsvärk,

- obehag,

- och möjlig risksignal.

Systemet ska vara försiktigt.

Det får inte avfärda smärta som normal träningskänsla utan underlag.

14.89 SJUKDOMSSIGNAL UNDER PASS

Om användaren rapporterar:

- bröstsmärta,

- svimningskänsla,

- svår andnöd utöver normal ansträngning,

- plötslig funktionsförlust,

- eller andra allvarliga symptom

ska GainPilot prioritera omedelbar säkerhet.

Arnold ska rekommendera att träningen avbryts och att akut eller professionell hjälp söks beroende på situationen.

GainPilot ska inte försöka optimera resten av passet.

14.90 SÄKERHETSSTOPP

Systemet ska kunna skapa ett säkerhetsstopp.

Ett säkerhetsstopp ska:

- pausa eller avsluta relevant aktivitet,

- hindra automatisk progression,

- markera den berörda övningen eller domänen,

- och kräva aktiv omprövning innan återgång.

Säkerhetsstopp får inte förväxlas med vanligt missat set.

14.91 SPOTTING OCH SÄKERHETSUTRUSTNING

GainPilot kan påminna om:

- säkerhetsarmar,

- clips,

- passare,

- och säker träningsmiljö

vid relevanta övningar.

Systemet ska inte anta att användaren har rätt säkerhetsutrustning.

Vid tunga eller riskfyllda lyft ska Arnold kunna rekommendera en säkrare variant eller belastning.

14.92 ENSAMTRÄNING

Användaren ska kunna ange att personen tränar ensam.

Det kan påverka:

- övningsval,

- säkerhetsrekommendation,

- och hur nära failure vissa lyft bör planeras.

GainPilot ska inte skapa onödig rädsla men ska kunna undvika olämpliga rekommendationer.

14.93 TRÄNING TILL FAILURE

GainPilot ska kunna representera om ett set ska utföras:

- långt från failure,

- nära failure,

- eller till tekniskt failure.

Systemet ska inte använda failure som standard för alla övningar.

Beslutet ska ta hänsyn till:

- mål,

- övning,

- erfarenhet,

- säkerhet,

- och passets övriga belastning.

14.94 LIVECOACHNING

Arnold ska kunna ge livecoachning genom:

- text,

- ljud,

- vibration,

- visuella signaler,

- eller valbar röst.

Livecoachning ska vara proportionerlig.

Användaren ska kunna välja:

- minimal,

- normal,

- detaljerad,

- eller endast säkerhetskritisk coachning.

14.95 MINIMAL LIVECOACHNING

I minimalt läge ska Arnold normalt endast visa:

- nästa aktivitet,

- planerat mål,

- timer,

- och säkerhetskritiska meddelanden.

Detta läge passar användare som vill träna fokuserat utan mycket dialog.

14.96 NORMAL LIVECOACHNING

I normalt läge kan Arnold även visa:

- senaste prestation,

- kort teknikfokus,

- progression,

- och relevanta anpassningsförslag.

14.97 DETALJERAD LIVECOACHNING

I detaljerat läge kan Arnold ge:

- djupare tekniska förklaringar,

- mer aktiv uppföljning,

- och fler frågor om dagsform och setkvalitet.

Detta kan passa nybörjare eller användare som lär sig en ny domän.

14.98 RÖSTCOACHNING

Röstcoachning ska kunna:

- läsa nästa övning,

- starta timer,

- registrera set,

- svara på korta frågor,

- och varna vid säkerhetssignal.

Användaren ska kunna säga:

- klart,

- åtta repetitioner på 100 kilo,

- lägg på fem kilo,

- byt övning,

- pausa passet,

- eller hur lång vila är kvar?

Röstkommandon ska bekräftas när feltolkning kan påverka data eller säkerhet.

14.99 RÖSTENS INTEGRITET

GainPilot ska inte lyssna passivt utan användarens tydliga val.

Röstinspelning ska normalt:

- aktiveras genom knapp eller wake-funktion som användaren valt,

- behandlas för uppgiften,

- och raderas enligt policy.

Privata samtal i omgivningen ska inte sparas som träningsdata.

14.100 LJUD I OFFENTLIG MILJÖ

Arnold ska vara försiktig med att läsa upp:

- kroppsvikt,

- hälsobegränsningar,

- kostdata,

- eller annan känslig information

på ett offentligt gym.

Användaren ska kunna välja:

- hörlursläge,

- privat röstläge,

- eller visuella svar.

14.101 SMARTWATCH OCH BÄRBARA ENHETER

GainPilot kan stödja smartwatch eller annan bärbar enhet.

Grundläggande funktioner kan vara:

- visa nästa set,

- registrera repetition,

- starta timer,

- visa puls,

- och markera passstatus.

Wearablegränssnittet ska vara enkelt och inte försöka visa hela programmet.

14.102 MOBIL OCH LÅSSKÄRM

Passet ska kunna fortsätta när mobilskärmen släcks.

Relevant information kan visas genom:

- låsskärmsaktivitet,

- notis,

- timer,

- eller wearable.

Känslig information ska minimeras på låsskärmen.

14.103 OFFLINEPASS

Användaren ska kunna genomföra sitt planerade pass utan internetanslutning.

Offlinepaketet ska innehålla:

- aktuell passinstans,

- övningar,

- planerade mål,

- senaste relevanta belastningar,

- grundläggande media där tillgängligt,

- och säkerhetskritiska blockeringar.

Systemet ska markera vilka funktioner som inte är tillgängliga offline.

14.104 OFFLINEÄNDRINGAR

Offline ska användaren kunna:

- registrera set,

- ändra belastning,

- byta mellan förberedda reservövningar,

- och avsluta passet.

Mer avancerad research eller full substitutionsanalys kan kräva anslutning.

Ändringarna ska synkroniseras senare med versionskontroll.

14.105 SYNKRONISERING EFTER PASS

När anslutning återkommer ska GainPilot synkronisera:

- session,

- set,

- resultat,

- tidsdata,

- anpassningar,

- och feedback.

Synkroniseringen ska vara idempotent.

Samma set får inte skapas flera gånger.

14.106 SYNKRONISERINGSKONFLIKTER

Konflikter kan uppstå om samma session ändras på:

- mobil,

- smartwatch,

- webb,

- eller annan enhet.

GainPilot ska använda:

- sessionsidentitet,

- versionsnummer,

- tidsstämplar,

- och källprioritet.

Betydelsefull konflikt ska visas för användaren.

Systemet får inte tyst radera ett registrerat set.

14.107 BATTERI OCH PRESTANDA

Det aktiva passet ska vara resurseffektivt.

GainPilot ska undvika:

- ständig högfrekvent GPS,

- kontinuerlig kamerabehandling,

- onödig nätverkssynkronisering,

- och tung AI-analys

när funktionen inte används.

Användaren ska kunna genomföra ett långt pass utan oproportionerlig batteriförbrukning.

14.108 GPS OCH STRÄCKA

GPS ska endast användas när aktiviteten kräver det och användaren har tillåtit det.

Exempel:

- löpning,

- cykling,

- promenad,

- eller annan utomhusaktivitet.

GainPilot ska inte aktivera GPS för ett vanligt gympass utan relevant syfte.

14.109 AKTIVITETSSENSORER

GainPilot kan använda:

- puls,

- steg,

- hastighet,

- distans,

- kadens,

- effekt,

- eller rörelsedata

från godkända enheter.

Sensorvärden ska ha:

- källa,

- tidpunkt,

- kvalitet,

- och felhantering.

Systemet ska fungera även utan sensor.

14.110 AUTOMATISK REPETITIONSRÄKNING

GainPilot kan på sikt stödja automatisk repetitionsräkning.

Funktionen ska behandlas som assistans.

Den kan påverkas av:

- sensorplacering,

- övningsvariant,

- rörelseomfång,

- och tempo.

Användaren ska kunna korrigera antalet.

Automatisk räkning får inte skriva över användarens bekräftade resultat.

14.111 PASSNOTERINGAR

Användaren ska kunna lägga till anteckningar.

Anteckningar kan kopplas till:

- hela passet,

- en övning,

- ett set,

- eller en säkerhetssignal.

Exempel:

Greppet kändes svagt i sista marklyftssetet.

Anteckningar ska inte automatiskt omvandlas till permanent minne.

14.112 SNABBFEEDBACK

Efter övning eller pass kan GainPilot fråga:

- kändes belastningen rätt,

- fungerade övningen,

- hur var energin,

- och fanns smärta eller problem?

Frågorna ska vara få och relevanta.

Användaren ska kunna hoppa över dem.

14.113 HUMÖR OCH MOTIVATION

Användaren kan frivilligt registrera:

- motivation,

- energi,

- eller allmän känsla.

GainPilot ska inte diagnostisera psykisk hälsa från dessa svar.

Informationen ska användas som en planeringssignal med rätt osäkerhet.

14.114 TRÄNINGSVÄRK OCH LOKAL BELASTNING

Användaren ska kunna rapportera träningsvärk eller lokal trötthet.

Systemet ska skilja detta från smärta.

GainPilot kan använda signalen för:

- dagsanpassning,

- övningsordning,

- eller senare återhämtningsanalys.

14.115 PASSFLÖDE UTAN ÖVERREGISTRERING

GainPilot ska minimera registreringsbördan.

Det kan ske genom:

- förifyllda värden,

- snabb bekräftelse,

- automatiskt timerval,

- röstregistrering,

- senast använda belastning,

- och smart kopiering mellan set.

Systemet ska inte kräva att användaren anger:

- RPE,

- kommentar,

- tempo,

- vila,

- och teknikstatus

efter varje set om användaren inte vill.

14.116 SNABBLÄGE

GainPilot ska ha ett snabbläge.

I snabbläge ska användaren kunna:

- bekräfta set,

- ändra belastning,

- ändra repetitioner,

- starta timer,

- och gå vidare.

Djupare funktioner ska finnas tillgängliga men inte dominera gränssnittet.

14.117 DETALJERAT LOGGNINGSLÄGE

Avancerade användare ska kunna välja detaljerad loggning.

Det kan omfatta:

- RPE,

- RIR,

- tempo,

- settyp,

- tekniknotering,

- vilotid,

- och sensorvärden.

Detaljerad loggning ska vara valbar per:

- användare,

- program,

- träningsdomän,

- eller övning.

14.118 AUTOMATISK REGISTRERING

Vissa data kan registreras automatiskt.

Exempel:

- passets starttid,

- sluttid,

- timer,

- sensorvärden,

- och genomförd kalenderhändelse.

Automatisk registrering ska vara transparent och korrigerbar.

14.119 INTE REGISTRERAT ÄR INTE NOLL

Saknad data ska inte automatiskt tolkas som:

- noll repetitioner,

- ingen ansträngning,

- missat set,

- eller dåligt resultat.

GainPilot ska skilja mellan:

- inte registrerat,

- ej genomfört,

- och faktiskt nollvärde.

14.120 PASSAVSLUT

När användaren avslutar passet ska GainPilot:

- kontrollera oregistrerade aktiviteter,

- låta användaren avsluta ändå,

- skapa slutstatus,

- registrera sluttid,

- och generera en kort sammanfattning.

Systemet ska inte tvinga användaren att fylla i varje saknat fält.

14.121 AUTOMATISKT AVSLUT

Om användaren lämnar ett pass öppet länge ska GainPilot kunna fråga om passet ska:

- fortsätta,

- pausas,

- avslutas,

- eller markeras som avbrutet.

Systemet ska inte automatiskt anta sluttid utan rimlig regel och tydlig status.

14.122 PASSAMMANFATTNING

Efter passet ska Arnold kunna visa en sammanfattning.

Den kan innehålla:

- genomförda delar,

- viktigaste resultat,

- personbästa,

- avvikelser,

- total tid,

- och nästa steg.

Exempel:

Passet är klart.

Du genomförde alla huvudövningar på 58 minuter.

Bänkpress:

4 × 8 på 100 kilogram.

Nytt repetitionsrekord:

9 repetitioner i sista setet.

Armfinishern hoppades över på grund av tidsbrist.

Ingen programändring behövs.

14.123 SAMMANFATTNINGENS PRIORITERING

Passammanfattningen ska inte bli en datadump.

Den ska prioritera:

1. Om passets huvudsyfte uppnåddes.

2. Viktiga resultat.

3. Avvikelser med framtida betydelse.

4. Säkerhetssignaler.

5. Nästa relevanta beslut.

Fullständig logg ska finnas separat.

14.124 PASSKVALITET

GainPilot kan skapa en passbedömning.

Den ska inte reduceras till ett ogenomskinligt betyg.

Bedömningen kan beskriva:

- genomförande,

- målmatchning,

- kvalitet,

- belastning,

- och återhämtningskostnad.

Exempel:

Passets huvudsyfte uppnåddes.

Tre av fyra kompletteringsövningar genomfördes.

Belastningen var något högre än planerat men utan tydlig teknikförsämring.

Systemet ska undvika moraliserande betyg som:

Dåligt pass.

14.125 TRÄNINGSVOLYM

Efter passet ska GainPilot kunna beräkna relevant volym.

Volym kan uttryckas genom:

- arbetsset,

- repetitioner,

- extern belastningsvolym,

- tid,

- distans,

- eller domänspecifika mått.

Ingen enskild volymmetrik ska behandlas som fullständig representation av träningsstimulus.

14.126 TONNAGE

GainPilot kan beräkna tonnage när det är meningsfullt.

Tonnage ska inte användas som universellt kvalitetsmått.

Exempel:

Mer tonnage kan bero på:

- fler uppvärmningsset,

- större rörelse,

- annan övning,

- eller högre total trötthet.

Systemet ska sätta måttet i kontext.

14.127 UPPSKATTAT 1RM

GainPilot kan beräkna uppskattat 1RM från relevanta set.

e1RM ska beskrivas som en uppskattning.

Modell och datakvalitet ska vara kända.

Ett set med:

- mycket hög repetitionsmängd,

- osäker RPE,

- eller avvikande teknik

kan ge mindre tillförlitlig uppskattning.

14.128 PRESTATIONSTREND

Ett enskilt pass ska kunna jämföras med:

- senaste motsvarande pass,

- aktuellt block,

- och långsiktig trend.

Arnold ska undvika överreaktion.

Exempel:

Dagens resultat var något lägre än förra veckan, men den långsiktiga trenden är fortfarande positiv.

14.129 PASSBELASTNING

GainPilot ska kunna uppskatta passets belastning utifrån flera faktorer.

Exempel:

- arbetsset,

- intensitet,

- RPE,

- konditionstid,

- puls,

- workoutformat,

- och användarens upplevelse.

Passbelastning ska vara ett beslutsstöd.

Det får inte presenteras som exakt biologisk trötthet.

14.130 SESSION RPE

Användaren kan ange en övergripande ansträngningsskattning för passet.

GainPilot kan kombinera den med passlängd som ett enkelt belastningsmått.

Det ska fortfarande beskrivas som uppskattning.

Session RPE ska inte krävas av alla.

14.131 ÅTERHÄMTNINGSKONSEKVENS

Efter passet kan GainPilot bedöma om kommande plan behöver granskas.

Exempel:

- oväntat hög belastning,

- ovanligt lång session,

- extra workout,

- eller smärtsignal.

Systemet ska inte automatiskt flytta framtida pass efter varje tung session.

Det kan skapa en uppföljningssignal.

14.132 PROGRESSION EFTER PASS

Progressionsmotorn ska analysera:

- om målet uppnåddes,

- teknik,

- RPE eller RIR,

- jämförbara tidigare pass,

- och programmets regel.

Möjliga beslut:

- höj belastning,

- öka repetitioner,

- behåll,

- sänk,

- ändra assistans,

- eller samla mer data.

Beslutet ska följa kontrollnivån.

14.133 AUTOMATISK PROGRESSION

Automatisk progression får endast ske när:

- programmets regel är tydlig,

- resultatet är tillräckligt säkert,

- säkerhetssignaler saknas,

- och användarens mandat tillåter det.

Exempel:

Alla tre set nådde övre repetitionsgränsen med rätt kvalitet.

Nästa pass höjs vikten med 2,5 kilogram.

Förändringen ska vara synlig och återställningsbar.

14.134 MANUELLT GODKÄND PROGRESSION

I vägledande läge ska Arnold säga:

Du nådde 12 repetitioner i alla tre set med cirka RIR 2. Enligt programregeln är nästa steg att höja från 30 till 32 kilogram. Vill du godkänna det?

Användaren ska kunna:

- godkänna,

- behålla vikten,

- eller ändra förslaget.

14.135 PROGRESSION VID OSÄKER DATA

Om data är ofullständig ska GainPilot inte låtsas veta.

Exempel:

Repetitionsantalet registrerades, men RIR och teknikstatus saknas.

Systemet kan:

- behålla nuvarande plan,

- fråga användaren,

- eller ge ett försiktigt förslag.

14.136 PASSFEEDBACK TILL PROGRAMMET

Passet ska kunna skicka strukturerade signaler till programmodellen.

Exempel:

- passet tar för lång tid,

- en övning byts ofta,

- planerad belastning är felkalibrerad,

- eller en viss veckoplacering fungerar dåligt.

En enskild signal ska normalt inte automatiskt skriva om programmet.

Återkommande mönster kan skapa ett förändringsförslag.

14.137 PASSFEEDBACK TILL MINNET

Relevant och återkommande information kan föreslås som minne.

Exempel:

- användaren föredrar kortare vardagspass,

- viss utrustning saknas permanent,

- eller ett särskilt övningsalternativ fungerar bättre.

En enskild sessionshändelse ska inte automatiskt bli permanent minne.

14.138 PASSFEEDBACK TILL KALENDERN

Faktisk passlängd och starttid kan förbättra planeringen.

Exempel:

Passet var planerat till 45 minuter men tog 65 minuter under fyra jämförbara tillfällen.

Arnold kan fråga om framtida kalenderblock ska förlängas.

Systemet ska inte ändra kalendern permanent utan rätt mandat.

14.139 PASSFEEDBACK TILL KOSTMOTORN

När relevant kan träningssessionen skicka signaler om:

- faktisk aktivitet,

- längre konditionspass,

- högre träningsvolym,

- eller förändrad träningstid.

Kostmotorn ska använda signalen proportionerligt.

Ett enskilt extra set ska inte skapa stora kostförändringar.

14.140 ANTECKNINGAR FRÅN ARNOLD

Arnold ska kunna skapa strukturerade träningsanteckningar.

Exempel:

Observation:

Bänkpressens sista två set var tyngre än planerat.

Åtgärd:

Behåll belastningen nästa pass.

Uppföljning:

Jämför RIR och repetitionsresultat.

Anteckningen ska skiljas från användarens egen kommentar.

14.141 ANVÄNDARENS EFTERREFLEKTION

Användaren kan frivilligt svara på en kort reflektion.

Exempel:

- vad fungerade bäst,

- vad var svårt,

- vill du ändra något nästa gång?

Reflektionen ska inte vara obligatorisk efter varje pass.

14.142 VECKOSAMMANSTÄLLNING

Passdata ska kunna bidra till veckosammanställningen.

Den ska kunna visa:

- genomförda pass,

- huvudprogression,

- pass som kortades,

- återhämtningssignal,

- och nästa veckas fokus.

Veckosammanställningen ska skilja mellan:

- faktisk prestation,

- analys,

- och rekommendation.

14.143 JÄMFÖRELSE MED TIDIGARE PASS

Användaren ska kunna jämföra samma pass eller övning över tid.

Jämförelsen ska ta hänsyn till:

- variant,

- teknikstandard,

- setstruktur,

- belastning,

- och programfas.

GainPilot ska inte jämföra oförenliga pass som om de vore samma.

14.144 PASSHISTORIK

Passhistoriken ska kunna filtreras efter:

- program,

- övning,

- träningsdomän,

- datum,

- miljö,

- och status.

Historiken ska visa:

- planerat,

- genomfört,

- anpassningar,

- och anteckningar.

Användaren ska kunna korrigera felregistreringar.

14.145 REDIGERING EFTER PASS

Användaren ska kunna redigera:

- set,

- repetitioner,

- belastning,

- tid,

- status,

- och anteckningar

efter avslutat pass.

Ändringen ska:

- skapa versionsspår,

- uppdatera analyser,

- och markera att data ändrats i efterhand.

14.146 LÅSNING AV VERIFIERAT RESULTAT

Ett resultat kan låsas när det:

- verifierats av användaren,

- importerats från betrodd källa,

- eller används som tävlingsresultat.

Låst resultat ska kräva starkare redigeringsprocess.

Historiken ska bevaras.

14.147 RADERING AV PASS

Användaren ska kunna radera eller ogiltigförklara ett pass.

Skillnaden ska vara tydlig.

Radering:

Passet tas bort enligt policy.

Ogiltigförklaring:

Passet bevaras i historiken men används inte för progression eller analys.

Ogiltigförklaring kan vara relevant om passet registrerats fel.

14.148 ÅTERSTÄLLNING AV PASSDATA

Passredigeringar ska kunna återställas när möjligt.

GainPilot ska bevara:

- tidigare version,

- ändringsorsak,

- och vem som gjorde ändringen.

14.149 DELNING AV PASS

Användaren ska kunna dela ett pass med:

- tränare,

- vän,

- eller annan godkänd mottagare.

Delningen ska vara explicit och begränsad.

Användaren ska kunna välja om delningen innehåller:

- övningar,

- resultat,

- kommentarer,

- video,

- eller endast sammanfattning.

Känslig data ska inte följa med automatiskt.

14.150 DELNING MED MÄNSKLIG TRÄNARE

En tränare kan få tillgång till:

- genomförda set,

- feedback,

- teknikvideo,

- och avvikelser

inom godkänd relation.

Tränaren ska inte automatiskt få:

- privata Atlas-minnen,

- kostdata,

- kalenderinnehåll,

- eller andra Omnira-projekt.

14.151 TRÄNARFEEDBACK

Mänsklig tränarfeedback ska kunna kopplas till:

- pass,

- övning,

- set,

- eller programförändring.

GainPilot ska skilja mellan:

- tränarens instruktion,

- Arnolds analys,

- och användarens kommentar.

Tränarens ändringsrätt ska följa behörighetsmodellen.

14.152 ARNOLDS ROLL UNDER PASSET

Arnold ska vara den aktiva användarnära coachen.

Han ska kunna:

- förbereda passet,

- visa nästa steg,

- registrera resultat,

- styra timer,

- svara på frågor,

- föreslå mikroanpassningar,

- hjälpa vid utrustningsproblem,

- och avsluta passet.

Arnold ska inte dominera träningsupplevelsen.

Grundregeln ska vara:

Rätt information, vid rätt tidpunkt, i minsta användbara mängd.

14.153 ATLAS ROLL UNDER PASSET

Atlas ska normalt inte behöva delta i varje set.

Atlas kan bidra när uppgiften kräver:

- bredare historik,

- relevant Omnira-kontext,

- research,

- eller långsiktig analys.

Exempel:

Atlas kan hjälpa Arnold förstå att användaren befinner sig i en tillfälligt belastad period som redan godkänts för planeringsanvändning.

Atlas får inte kringgå GainPilots träningsregler eller säkerhetsmodell.

14.154 HERMES ROLL UNDER PASSET

Hermes ska kontrollera vilken kontext som levereras under passet.

Relevant kontext kan vara:

- aktivt program,

- aktuella begränsningar,

- senaste jämförbara resultat,

- träningsmiljö,

- och användarens coachningsinställningar.

Arnold behöver normalt inte:

- privata meddelanden,

- full kalender,

- andra projekt,

- eller detaljerad familjekontext.

14.155 SESSIONSSPECIFIKT MINNESPAKET

När passet startar ska Hermes kunna skapa ett tillfälligt minnespaket.

Paketet kan innehålla:

- passplan,

- relevanta säkerhetsminnen,

- aktuella preferenser,

- senaste prestationsdata,

- och kontrollnivå.

Paketet ska:

- vara begränsat till sessionen,

- kunna uppdateras,

- och upphöra efter passet.

14.156 PASSDATA SOM KÄNSLIG INFORMATION

Träningsdata kan avslöja:

- hälsa,

- kroppsfunktion,

- rutiner,

- plats,

- och personliga mål.

GainPilot ska därför använda:

- dataminimering,

- användarisolering,

- kryptering,

- och behörighetskontroll.

Tekniska loggar ska inte kopiera mer innehåll än felsökningen kräver.

14.157 PLATSDATA

Exakt plats ska inte krävas för ett normalt träningspass.

GainPilot ska i första hand använda:

- vald träningsmiljö,

- gymprofil,

- eller platskategori.

GPS ska endast aktiveras för funktioner som faktiskt kräver det.

14.158 KAMERA OCH MIKROFON

Kamera och mikrofon ska vara:

- avstängda som standard,

- tydligt aktiverade,

- uppgiftsbegränsade,

- och möjliga att stänga av direkt.

Användaren ska se när en sensor används.

GainPilot ska inte analysera omgivningen kontinuerligt.

14.159 BAKGRUNDSAKTIVITET

GainPilot får fortsätta:

- timer,

- passstatus,

- och godkänd sensorinsamling

i bakgrunden.

Bakgrundsaktiviteten ska vara tydligt definierad.

Den får inte ge obegränsad tillgång till mikrofon, kamera eller plats.

14.160 DATARETENTION

Passdata ska ha definierad retention.

Strukturerade träningsresultat kan behöva lagras långsiktigt för progression.

Rådata som:

- kontinuerlig rörelsesensor,

- råvideo,

- och ljud

ska normalt ha kortare retention om användaren inte aktivt sparar dem.

14.161 PRIVATLÄGE FÖR PASS

Användaren ska kunna genomföra ett pass i privatläge.

I privatläge kan GainPilot:

- använda den aktiva planen,

- logga lokalt eller tillfälligt,

- och låta användaren välja vad som sparas efteråt.

Säkerhetskritisk funktion kan fortfarande kräva begränsad operativ data.

14.162 PROMPTINJEKTION UNDER PASS

Extern text från:

- QR-kod,

- webbsida,

- meddelande,

- dokument,

- eller träningsmaskin

får inte kunna ändra GainPilots systemregler.

Om användaren importerar en instruktion ska den behandlas som data som ska analyseras.

Den får inte:

- begära bredare minnesåtkomst,

- ändra kontrollnivå,

- eller skriva till canonical träningslogik.

14.163 FELAKTIG SENSORINFORMATION

GainPilot ska kunna upptäcka orimliga sensorvärden.

Exempel:

- omöjlig puls,

- plötslig GPS-förflyttning,

- extrema repetitionsantal,

- eller dubbletter.

Systemet ska inte automatiskt använda uppenbart felaktig data för progression.

14.164 FELHANTERING UNDER PASS

Passflödet ska kunna fortsätta när en icke-kritisk funktion misslyckas.

Exempel:

- video laddas inte,

- wearable tappar anslutning,

- timer synkroniseras sent,

- eller substitutionssökning är offline.

Grundläggande loggning ska fortfarande fungera.

Felmeddelandet ska ge ett konkret nästa steg.

14.165 KRASCHÅTERSTÄLLNING

Om appen stängs eller kraschar ska den aktiva sessionen kunna återställas.

GainPilot ska bevara:

- senaste registrerade set,

- aktiv timerstatus där möjligt,

- passversion,

- och offlineändringar.

Användaren ska inte behöva börja om hela passet.

14.166 DUBBELSTART

GainPilot ska upptäcka om samma pass startas på flera enheter.

Systemet ska kunna:

- fortsätta befintlig session,

- skapa ny session,

- eller fråga användaren.

Det får inte tyst sammanfoga två orelaterade pass.

14.167 SESSION LEASE

Den aktiva sessionen kan använda ett sessionslås eller lease.

Syftet är att minska risken att flera enheter samtidigt skriver mot samma set.

Leasen ska kunna:

- förnyas,

- övertas kontrollerat,

- och återställas efter nätverksfel.

Systemet ska fortfarande stödja offlinearbete.

14.168 IDEMPOTENTA SETHÄNDELSER

Registrering av ett set ska vara idempotent.

Om samma händelse skickas flera gånger på grund av nätverksfel ska den inte skapa flera identiska set.

Varje sethändelse ska ha unik identitet.

14.169 HÄNDELSELOGG

Passet ska kunna representeras som en följd av händelser.

Exempel:

- session_started,

- exercise_started,

- set_completed,

- load_changed,

- exercise_substituted,

- pain_reported,

- session_paused,

- session_completed.

Händelseloggen ska stödja:

- återställning,

- felsökning,

- synkronisering,

- och audit.

Den aktiva användarvyn behöver inte visa de tekniska händelsenamnen.

14.170 DERIVERAD SESSIONSSAMMANFATTNING

Passammanfattningen kan härledas från händelselogg och aktuell sessionsmodell.

Den ska inte bli en oberoende sanning som avviker från de faktiska registreringarna.

När ett set korrigeras ska sammanfattningen kunna uppdateras.

14.171 OBSERVABILITY

Det ska gå att förstå:

- vilken programversion som användes,

- vilka automatiska förslag som gjordes,

- vilka anpassningar användaren godkände,

- vilka sensorer som användes,

- och varför progressionen förändrades.

Observability ska inte exponera onödigt privat innehåll.

14.172 AUDIT

Betydelsefulla passhändelser ska kunna auditeras.

Exempel:

- säkerhetsstopp,

- permanent övningsbyte,

- automatisk belastningsjustering,

- tränarändring,

- videodelning,

- och efterhandsredigering.

Auditloggen ska ha separat åtkomstkontroll.

14.173 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera träningspassens produktkvalitet.

Det kan omfatta:

- var användare avbryter pass,

- vilka registreringssteg som tar lång tid,

- vilka timers som stängs av,

- hur ofta övningar byts,

- om belastningsförslag accepteras,

- och var synkroniseringsfel uppstår.

Analysen ska använda minimerad och aggregerad data där möjligt.

Privata träningsvideor ska inte analyseras för produktutveckling utan separat rätt grund.

14.174 PASSMETRIK

Relevanta produktmetrik kan vara:

- tid till passstart,

- registreringstid per set,

- andel genomförda huvudövningar,

- användning av kortversion,

- avbrutna sessioner,

- timeranvändning,

- och korrigeringsfrekvens.

GainPilot ska inte optimera för maximal skärmtid under träning.

Ett bra träningspass kan innebära mindre interaktion med appen.

14.175 KVALITETSMÅTT

Träningspassupplevelsen är framgångsrik när:

- användaren förstår nästa steg,

- registreringen går snabbt,

- relevanta anpassningar är lätta,

- säkerhetssignaler hanteras korrekt,

- och passet ger användbar data för framtiden.

Målet är inte att samla flest möjliga datapunkter.

14.176 KONTROLLERAD PRODUKTUTVECKLING

När Atlas identifierar förbättringsbehov ska processen vara:

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

- sessionsmodellen,

- säkerhetsstoppen,

- belastningsmotorn,

- timerlogiken,

- sensorbehörigheter,

- eller produktion

utifrån en enskild analysinsikt.

14.177 TESTNING AV SESSIONSMODELLEN

Sessionsmodellen ska testas genom:

- enhetstester,

- kontraktstester,

- scenariotester,

- säkerhetstester,

- synkroniseringstester,

- och regressionstester.

Tester ska verifiera:

- planerat kontra genomfört,

- statusövergångar,

- settyper,

- övningsbyten,

- pauser,

- återstart,

- och avslut.

14.178 TESTNING AV STYRKETRÄNING

Scenarier ska omfatta:

- raka set,

- toppset och backoff,

- dubbel progression,

- procentbaserad träning,

- RPE och RIR,

- misslyckat set,

- personbästa,

- och övningsbyte.

14.179 TESTNING AV CROSSFIT

Scenarier ska omfatta:

- AMRAP,

- EMOM,

- rounds for time,

- time cap,

- scaling,

- no-reps,

- komplex,

- och flera passdelar.

14.180 TESTNING AV CALISTHENICS

Scenarier ska omfatta:

- hålltid,

- assistans,

- skillförsök,

- teknisk kvalitet,

- progression,

- regression,

- och begränsat antal kvalitetsförsök.

14.181 TESTNING AV KONDITION

Scenarier ska omfatta:

- tidsintervaller,

- distansintervaller,

- löpning,

- cykling,

- GPS-fel,

- sensorbortfall,

- och offlinepass.

14.182 SÄKERHETSTESTER

Säkerhetstester ska verifiera att:

- blockerad övning inte startas utan kontroll,

- smärta inte hanteras som vanlig preferens,

- allvarliga symptom stoppar optimeringsflödet,

- högriskprogression kräver rätt mandat,

- och kamera eller mikrofon inte aktiveras utan tillåtelse.

14.183 BEHÖRIGHETSTESTER

Tester ska verifiera att:

- passet endast hämtar rätt användares data,

- tränaren endast ser delat innehåll,

- Arnold endast får rätt minnespaket,

- och Atlas inte får obegränsad åtkomst.

14.184 OFFLINETESTER

Offlinetester ska verifiera:

- passstart,

- setregistrering,

- timer,

- reservövning,

- avslut,

- och senare synkronisering.

Systemet ska inte förlora data när anslutningen försvinner.

14.185 KRASCHTESTER

Tester ska simulera:

- appkrasch,

- batteridöd,

- operativsystemsstängning,

- och nätverksavbrott.

Användaren ska kunna återställa den aktiva sessionen utan dubbletter.

14.186 REGRESSIONSTESTER

En förändring i:

- timer,

- setregistrering,

- programmodell,

- övningsgraf,

- eller synkronisering

får inte oavsiktligt förstöra andra träningsdomäner.

Exempel:

En förbättring för styrkeset får inte göra AMRAP-registrering felaktig.

14.187 SIMULERING

GainPilot ska kunna simulera passflöden.

Simulering kan upptäcka:

- orimliga belastningsändringar,

- för långa pass,

- felaktig timerordning,

- instabila autoregleringar,

- och saknade statusövergångar.

Simuleringen ska inte ersätta verkliga användartester.

14.188 ANVÄNDARTESTNING

Det aktiva passet ska testas med användare inom flera nivåer.

Exempel:

- nybörjare,

- erfaren gymanvändare,

- styrkeutövare,

- CrossFit-utövare,

- calisthenicsutövare,

- konditionsutövare,

- och användare med tillgänglighetsbehov.

Gränssnittet ska inte optimeras enbart för avancerade användare.

14.189 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för GainPilots aktiva träningspass.

**Kontrakt GP-221 — Planerat och genomfört ska separeras**

GainPilot ska bevara skillnaden mellan programplan, dagens anpassade plan och faktiskt genomförande.

**Kontrakt GP-222 — Stabil sessionsidentitet**

Varje aktiv träningssession ska ha en unik identitet och kopplas till rätt program- och passversion.

**Kontrakt GP-223 — Domänriktig sessionsmodell**

Styrka, CrossFit, calisthenics och kondition ska representeras genom modeller som bevarar respektive träningsforms riktiga struktur.

**Kontrakt GP-224 — Snabb registrering**

Det aktiva passet ska minimera användarens administrativa arbete och erbjuda snabb bekräftelse av planerade värden.

**Kontrakt GP-225 — Saknad data är inte noll**

Ej registrerade värden får inte automatiskt behandlas som misslyckade eller nollställda resultat.

**Kontrakt GP-226 — Uppvärmning som separat fas**

Uppvärmning och uppvärmningsset ska hållas åtskilda från arbetsset men kunna användas för dagskalibrering.

**Kontrakt GP-227 — Belastningsförslag ska vara förklarbara**

Autoreglerad belastning ska kopplas till plan, historik, uppvärmning och användarens mandat.

**Kontrakt GP-228 — Mikroanpassning inom mandat**

Automatisk justering av belastning, vila, repetitioner eller set får endast ske inom explicit kontrollnivå och riskgräns.

**Kontrakt GP-229 — Övningsbyte ska använda substitutionsmotorn**

Ett byte under pass ska följa programfunktion, bytesorsak, säkerhetsfilter och definierad giltighet.

**Kontrakt GP-230 — Säkerhet har företräde**

Smärta, allvarliga symptom och aktiva begränsningar ska kunna stoppa normalt progressions- och optimeringsflöde.

**Kontrakt GP-231 — Kamera och mikrofon kräver aktivt val**

Sensorer som kamera och mikrofon får endast aktiveras genom tydligt användarval och för ett definierat syfte.

**Kontrakt GP-232 — Videoanalys är osäker assistans**

AI-baserad teknikbedömning ska uttrycka osäkerhet och får inte diagnostisera skada eller medicinska tillstånd.

**Kontrakt GP-233 — Råmedia ska ha begränsad retention**

Råvideo, ljud och högfrekvent sensordata ska normalt inte lagras längre än uppgiften kräver utan uttryckligt användarval.

**Kontrakt GP-234 — Offlineförmåga**

Användaren ska kunna genomföra och registrera grundläggande planerat träningspass utan nätanslutning.

**Kontrakt GP-235 — Idempotent sessionssynkronisering**

Set, aktiviteter och sessionshändelser ska kunna synkroniseras igen utan oavsiktliga dubbletter.

**Kontrakt GP-236 — Kraschåterställning**

Ett aktivt pass ska kunna återställas efter app-, nätverks- eller enhetsfel utan att registrerade resultat förloras.

**Kontrakt GP-237 — Begränsad livecoachning**

Arnold ska leverera minsta relevanta coachning enligt användarens valda detaljnivå.

**Kontrakt GP-238 — Passammanfattning ska vara prioriterad**

Efter passet ska GainPilot sammanfatta huvudsyfte, viktiga resultat, avvikelser och nästa steg utan att skapa en datadump.

**Kontrakt GP-239 — Progression kräver kvalificerat utfall**

Automatisk progression ska kräva tydlig programregel, tillräcklig datakvalitet och avsaknad av blockerande säkerhetssignal.

**Kontrakt GP-240 — Sessioner ska vara versionshanterade och auditerbara**

Passdata, efterhandsredigeringar, permanenta byten och säkerhetshändelser ska kunna spåras och återställas.

**Kontrakt GP-241 — Sessionsminne ska vara tillfälligt och minimerat**

Hermes ska skapa ett uppgiftsbegränsat minnespaket för passet och inte leverera irrelevant Atlas- eller Omnira-kontext.

**Kontrakt GP-242 — Branchbaserad sessionsutveckling**

Förändringar av sessionsmodell, autoreglering, timer, säkerhetsflöden, sensorer och synkronisering ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

14.190 ANTI-PRINCIPER

GainPilot ska inte:

- behandla träningspasset som ett långt administrativt formulär,

- blanda samman planerade och genomförda resultat,

- skriva över planerad data när användaren avviker,

- återanvända samma sessionsidentitet för flera pass,

- tvinga alla träningsformer till vanlig set- och repetitionsmodell,

- behandla AMRAP som vanliga styrkeset,

- behandla calisthenicsfärdighet som enbart repetitionsantal,

- behandla konditionspass som en styrkeövning,

- kräva full beredskapsenkät före varje pass,

- låta en enskild wearablepoäng styra hela sessionen,

- ändra programversion tyst efter passstart,

- räkna uppvärmningsset som vanliga arbetsset utan rätt modell,

- visa för många teknikpunkter samtidigt,

- ge teknikfeedback efter varje set utan relevant behov,

- presentera AI-videoanalys som säker biomekanisk sanning,

- lagra träningsvideo permanent som standard,

- kräva RPE eller RIR från alla användare efter varje set,

- behandla saknad registrering som noll,

- överföra vikter mellan olika maskiner eller övningar som om de vore identiska,

- höja belastningen efter ett enskilt oklart resultat,

- använda failure som standard i alla övningar,

- ändra låsta huvudövningar,

- göra tillfälliga passbyten permanenta utan kontroll,

- lägga till extra volym utan att analysera pass och vecka,

- stapla missade set på framtida pass,

- avfärda smärta som normal ansträngning,

- föreslå övningssubstitution som medicinsk behandling,

- fortsätta optimera när användaren rapporterar allvarliga symptom,

- aktivera kamera, mikrofon eller GPS utan tydligt syfte,

- lyssna passivt på omgivningen,

- läsa upp känslig information offentligt utan användarval,

- kräva internetanslutning för grundläggande passregistrering,

- skapa dubbletter vid synkronisering,

- förlora passdata vid appkrasch,

- använda skärmtid som framgångsmått,

- lagra all rå sensorinformation permanent,

- dela träningsdata med Atlas, tränare eller andra projekt utan rätt policy,

- låta externa texter förändra sessionsregler genom promptinjektion,

- eller ändra sessionsmotorn direkt i main eller produktion utan branch, tester och granskning.

14.191 KANONISKA BESLUT FRÅN KAPITEL 14

Följande beslut etableras:

1. GainPilot ska ha en canonical modell för aktiva träningspass.

2. Passmall, planerad passinstans, aktiv session, utfall och efteranalys ska vara separata begrepp.

3. Varje träningssession ska ha unik identitet.

4. Sessionen ska kopplas till exakt programversion och programvecka.

5. GainPilot ska bevara planerat, anpassat och genomfört innehåll separat.

6. Pass ska kunna ha status som planerat, startat, pausat, delvis genomfört, genomfört, avbrutet eller ersatt.

7. Användaren ska få en enkel förberedelsevy.

8. GainPilot ska kunna genomföra en kort beredskapskontroll.

9. Beredskapskontrollen ska vara valbar när säkerheten tillåter det.

10. Flera återhämtningssignaler ska kunna användas men ingen enskild signal ska styra hela passet.

11. Säkerhetsbegränsningar ska kontrolleras före start.

12. Användaren ska kunna välja aktuell träningsmiljö.

13. Tillfällig miljö ska inte automatiskt ändra permanent profil.

14. Passet ska kunna startas planerat eller oplanerat.

15. Användaren ska kunna upprepa tidigare pass med versionskontroll.

16. Fri träning ska vara ett fullvärdigt läge.

17. Pass ska kunna innehålla flera strukturerade delar.

18. Uppvärmning ska anpassas efter passets huvudfunktion.

19. Uppvärmningsset ska hållas åtskilda från arbetsset.

20. Uppvärmning ska kunna användas för dagskalibrering.

21. Huvudövningen ska visa syfte, mål, belastning, vila och teknikfokus.

22. Kompletterande övningar ska kunna presenteras mer kompakt.

23. Varje övning ska kunna visas genom ett övningskort.

24. Övningsmedia ska kopplas till rätt canonical variant.

25. Användaren ska kunna styra medieuppspelning och animation.

26. GainPilot ska begränsa antalet samtidiga teknikpunkter.

27. Arnold ska kunna ge ett teknikfokus per set.

28. Videoanalys ska vara valbar.

29. Träningsvideo ska inte lagras permanent som standard.

30. AI-teknikfeedback ska uttrycka osäkerhet.

31. GainPilot ska erbjuda snabb repetitionsregistrering.

32. Planerade värden ska kunna bekräftas med ett tryck.

33. Belastning ska stödja flera enheter och utrustningstyper.

34. GainPilot ska kunna hjälpa med viktskivor.

35. Maskinresultat ska kunna kopplas till maskin- eller gymkontext.

36. Kroppsviktsövningar ska stödja extern vikt och assistans.

37. GainPilot ska stödja assisterade övningar.

38. RPE och RIR ska vara valbara.

39. Användaren ska kunna använda en förenklad ansträngningsskala.

40. Set ska kunna ha flera statusar och typer.

41. GainPilot ska stödja raka set, toppset, backoff, dropset, rest-pause och andra relevanta format.

42. Dubbel progression ska kunna förklaras i passvyn.

43. Procentbaserad träning ska visa vilken referens som används.

44. GainPilot ska kunna föreslå autoreglerad belastning.

45. Belastningsförslag ska kunna uttryckas som intervall.

46. Automatisk setjustering ska följa användarens mandat.

47. Misslyckade set ska analyseras proportionerligt.

48. GainPilot ska skilja mellan tekniskt och muskulärt misslyckande.

49. Personbästa ska endast jämföras mellan tillräckligt likvärdiga prestationer.

50. Personbästa ska kunna uppmärksammas diskret.

51. GainPilot ska ha en valbar vilotimer.

52. Timern ska kunna starta automatiskt efter set.

53. Vila ska kunna anges exakt eller som intervall.

54. Adaptiv vila ska vara ett förslag, inte biologisk sanning.

55. Timern ska fungera med tillgänglighetsfunktioner.

56. Användaren ska kunna ändra övningsordningen.

57. Ordningen ska kunna konsekvensbedömas.

58. GainPilot ska stödja superset, tri-set, cirklar och komplex.

59. GainPilot ska stödja AMRAP, EMOM och rounds for time.

60. Time cap-resultat ska kunna registreras korrekt.

61. Konditionsintervaller ska kunna vara tids-, distans-, puls- eller effektbaserade.

62. Konditionspass ska bevara miljö- och underlagskontext.

63. Puls och effekt ska ha känd källa.

64. GainPilot ska stödja calisthenicsfärdigheter, assistans, hålltid och kvalitetsförsök.

65. CrossFit-scaling och rörelsestandard ska dokumenteras.

66. Pass ska kunna pausas och återupptas.

67. Ett pass ska kunna delas över flera sessioner när det är avsiktligt.

68. Arnold ska kunna erbjuda prioriterad avslutning vid tidsbrist.

69. GainPilot ska kunna uppskatta återstående tid.

70. Tidsprognoser ska uttrycka intervall när osäkerhet finns.

71. Övningsbyten ska gå genom substitutionsmotorn.

72. Upptagen utrustning ska kunna hanteras genom byte eller ändrad ordning.

73. Varje byte ska ha giltighet.

74. Användaren ska kunna lägga till eller ta bort övningar.

75. GainPilot ska visa konsekvensen av större passändringar.

76. Manuella sessionsändringar ska inte tyst skrivas över.

77. Passautomation ska följa användarens kontrollnivå.

78. Användarlåsningar ska respekteras.

79. Smärta ska aktivera särskilt säkerhetsflöde.

80. GainPilot ska inte diagnostisera smärta.

81. Allvarliga symptom ska stoppa vanligt optimeringsflöde.

82. Systemet ska kunna skapa säkerhetsstopp.

83. GainPilot ska kunna påminna om relevant säkerhetsutrustning.

84. Ensamträning ska kunna påverka riskbedömningen.

85. Träning till failure ska vara övnings- och målspecifik.

86. Arnold ska kunna erbjuda minimal, normal eller detaljerad livecoachning.

87. Röstcoachning ska vara valbar.

88. Röstkommandon ska bekräftas när feltolkning kan påverka säkerhet eller data.

89. GainPilot ska inte använda passiv lyssning utan tydligt val.

90. Känslig information ska inte automatiskt läsas upp offentligt.

91. Smartwatchstöd ska prioritera enkla passfunktioner.

92. Passet ska kunna fortsätta med släckt mobilskärm.

93. Grundläggande träningspass ska fungera offline.

94. Offlineändringar ska synkroniseras med versionskontroll.

95. Synkronisering ska vara idempotent.

96. Konflikter mellan enheter ska inte tyst radera data.

97. GainPilot ska minimera batteri- och resursanvändning.

98. GPS ska endast användas när aktiviteten kräver det.

99. Sensorer ska vara valbara och ha kvalitetsstatus.

100. Automatisk repetitionsräkning ska vara korrigerbar.

101. Användaren ska kunna skapa anteckningar på pass-, övnings- och setnivå.

102. Snabbfeedback ska vara kort och valbar.

103. Humör och motivation får användas som signaler men inte diagnoser.

104. GainPilot ska erbjuda snabbläge och detaljerat loggningsläge.

105. Automatisk dataregistrering ska vara transparent.

106. Ej registrerad data ska inte behandlas som noll.

107. Användaren ska kunna avsluta pass trots ofullständig loggning.

108. Övergivna sessioner ska hanteras genom tydlig återupptagnings- eller avslutsprocess.

109. Arnold ska skapa en prioriterad passammanfattning.

110. Passkvalitet ska beskrivas utan moraliserande betyg.

111. GainPilot ska kunna analysera volym, tonnage, e1RM och andra mått med rätt kontext.

112. Ett enskilt pass ska sättas i relation till långsiktig trend.

113. Passbelastning ska behandlas som uppskattning.

114. Progressionsmotorn ska analysera passets faktiska utfall.

115. Automatisk progression ska kräva tydlig regel och tillräcklig säkerhet.

116. Osäker data ska kunna leda till oförändrad plan.

117. Passet ska kunna skicka strukturerade signaler till program, minne, kalender och kostmotor.

118. En enskild sessionssignal ska normalt inte skriva om programmet.

119. Passdata ska kunna bidra till veckosammanställning.

120. Användaren ska kunna se och redigera passhistorik.

121. Efterhandsredigering ska versionshanteras.

122. Verifierade resultat ska kunna låsas.

123. Pass ska kunna raderas eller ogiltigförklaras.

124. Användaren ska kunna dela utvalda passdata.

125. Delning med tränare ska vara explicit och granulär.

126. Tränarfeedback ska hållas åtskild från Arnolds analys.

127. Arnold ska vara den aktiva användarnära coachen.

128. Atlas ska endast användas när bredare analys tillför värde.

129. Hermes ska leverera ett sessionsspecifikt och minimerat minnespaket.

130. Kamera, mikrofon och plats ska vara uppgiftsbegränsade.

131. Råmedia och sensordata ska ha tydlig retention.

132. Passet ska kunna användas i privatläge.

133. GainPilot ska skydda mot promptinjektion i externa träningskällor.

134. Orimliga sensorvärden ska inte påverka progression automatiskt.

135. Grundläggande passfunktion ska fortsätta vid icke-kritiska fel.

136. Aktiv session ska kunna återställas efter krasch.

137. GainPilot ska upptäcka dubbelstart på flera enheter.

138. Sessionslås eller lease ska kunna användas utan att blockera offlinearbete.

139. Varje sethändelse ska ha unik identitet.

140. Sessionshändelser ska kunna bilda en återställningsbar händelselogg.

141. Passammanfattningen ska härledas från canonical sessionsdata.

142. Betydelsefulla passbeslut ska vara observerbara och auditerbara.

143. Plattformsanalys ska använda minimerad data.

144. Produktens mål ska vara mindre administrativ friktion, inte mer skärmtid.

145. Sessionssystemet ska testas över alla centrala träningsdomäner.

146. Offline-, krasch-, sensor- och synkroniseringsscenarier ska testas.

147. Förändringar av sessionssystemet ska ske på separat branch.

148. Alla förändringar ska genomgå tester, pull request, granskning och kontrollerad merge.

149. Agentautonomi under träningspasset ska vara explicit, begränsad och återkallelig.

150. Träningspasset ska fungera som den operativa bryggan mellan GainPilots plan och användarens verkliga prestation.

14.192 IMPLEMENTERINGSORDNING

GainPilots aktiva träningspass ska implementeras stegvis.

Fas 1 — Canonical sessionsmodell

Implementera:

- sessionsidentitet,

- programkoppling,

- planerat pass,

- start och slut,

- status,

- och planerat kontra genomfört.

Fas 2 — Grundläggande styrkepass

Implementera:

- övningslista,

- set,

- repetitioner,

- belastning,

- snabbregistrering,

- och passavslut.

Fas 3 — Vilotimer

Implementera:

- manuell timer,

- automatisk start efter set,

- ljud,

- vibration,

- bakgrundsläge,

- och valbar vilotid.

Fas 4 — Övningskort och demonstration

Implementera:

- övningsnamn,

- plan,

- senaste resultat,

- teknikpunkter,

- animation eller video,

- och tillgänglighetsstöd.

Fas 5 — Progressionsstöd

Implementera:

- dubbel progression,

- tidigare prestation,

- belastningsförslag,

- RPE eller RIR,

- och nästa pass-förslag.

Fas 6 — Substitutioner under pass

Implementera:

- bytesorsak,

- utrustningsfilter,

- rekommenderat alternativ,

- tillfällig giltighet,

- och passuppdatering.

Fas 7 — Passprioritering

Implementera:

- huvudövningar,

- kompletterande övningar,

- kortversion,

- minimipass,

- och tidsprognos.

Fas 8 — Offline och kraschsäkerhet

Implementera:

- lokal session,

- offlineändringar,

- idempotent synkronisering,

- session lease,

- och kraschåterställning.

Fas 9 — Röst och wearable

Implementera:

- enkla röstkommandon,

- timer,

- setbekräftelse,

- smartwatchvy,

- och privat ljudläge.

Fas 10 — Konditionssessioner

Implementera:

- tid,

- distans,

- tempo,

- intervaller,

- puls,

- GPS,

- och sensorprovenance.

Fas 11 — CrossFit-sessioner

Implementera:

- warm-up,

- skill,

- strength,

- AMRAP,

- EMOM,

- rounds for time,

- time cap,

- och scaling.

Fas 12 — Calisthenicssessioner

Implementera:

- skills,

- försök,

- hålltid,

- assistans,

- teknikstatus,

- progression,

- och lokal belastningskontroll.

Fas 13 — Videoanalys

Implementera först efter särskild integritets- och kvalitetsgranskning:

- aktiv kamerastart,

- lokal eller tidsbegränsad behandling,

- teknikmarkering,

- användarkorrigering,

- och tydlig osäkerhet.

Fas 14 — Fördjupad autoreglering

Implementera:

- uppvärmningskalibrering,

- belastningsintervall,

- återstående setjustering,

- adaptiv vila,

- och säkerhetsgränser.

Fas 15 — Tränarintegration

Implementera:

- delad passlogg,

- tränarfeedback,

- teknikvideo,

- ändringsmandat,

- och återkallande av åtkomst.

Fas 16 — Fördjupad sessionsintelligens

Implementera:

- händelselogg,

- sessionssimulering,

- personlig flödesanpassning,

- sensorfusion,

- och långsiktig utfallsanalys.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- tillgänglighetsgranskning,

- integritetsgranskning,

- säkerhetsgranskning,

- pull request,

- kontrollerad merge,

- och resultatuppföljning.

14.193 FRAMGÅNGSKRITERIER

Kapitel 14:s vision är framgångsrikt realiserad när:

- användaren kan starta rätt planerat pass med ett fåtal steg,

- passet är kopplat till rätt programversion,

- planerat och genomfört innehåll hålls åtskilt,

- registrering av set går snabbt,

- användaren inte behöver skriva in samma värden om och om igen,

- uppvärmningsset kan användas för dagskalibrering,

- huvudövningens syfte och mål är tydliga,

- övningsmedia visar rätt canonical variant,

- teknikpunkter är korta och relevanta,

- användaren kan välja hur mycket coachning Arnold ger,

- vilotimern fungerar i bakgrunden,

- styrkeset, superset, komplex och specialformat kan registreras korrekt,

- CrossFit-pass behåller workoutformat, scaling och time cap,

- calisthenicspass kan registrera skill, assistans, hålltid och kvalitet,

- konditionspass kan registrera intervall, tempo, puls och effekt,

- användaren snabbt kan byta upptagen utrustning,

- tillfälliga byten inte automatiskt blir permanenta,

- tidsbrist kan hanteras med prioriterad kortversion,

- smärta aktiverar säkerhetsflöde,

- allvarliga symptom stoppar optimeringsflödet,

- kamera och mikrofon endast aktiveras med tydligt val,

- träningsvideo inte lagras permanent utan beslut,

- passet fungerar utan internet,

- registrerade resultat överlever appkrasch,

- synkronisering inte skapar dubbletter,

- röst och wearable kan användas utan att bli obligatoriska,

- passammanfattningen visar det viktigaste utan datadump,

- progression föreslås utifrån verkligt kvalificerat utfall,

- användaren kan korrigera passdata,

- efterhandsändringar är versionshanterade,

- pass kan delas granulärt med tränare,

- Arnold kan coacha utan att störa,

- Atlas endast används när bredare intelligens behövs,

- Hermes minimerar sessionskontexten,

- plattformsanalys inte kräver obegränsad åtkomst till privata träningsdata,

- och alla förbättringar genomförs genom separat branch, tester, pull request och kontrollerad merge.

14.194 SAMMANFATTNING

GainPilots träningspass ska vara den operativa kärnan i användarens träningsupplevelse.

Det är under passet som:

- programmet exekveras,

- användaren presterar,

- progressionen prövas,

- verkliga problem uppstår,

- och framtida anpassningar får sitt underlag.

Passet ska bevara skillnaden mellan:

- vad programmet planerade,

- vad GainPilot anpassade,

- och vad användaren faktiskt genomförde.

Det ska stödja flera träningsdomäner utan att göra dem identiska.

Styrketräning ska kunna använda:

- set,

- repetitioner,

- belastning,

- RPE,

- RIR,

- toppset,

- backoff-set,

- och dubbel progression.

CrossFit ska kunna använda:

- AMRAP,

- EMOM,

- rounds for time,

- time cap,

- scaling,

- och rörelsestandard.

Calisthenics ska kunna använda:

- skillprogression,

- assistans,

- hålltid,

- kvalitativa försök,

- och teknisk status.

Kondition ska kunna använda:

- tid,

- distans,

- tempo,

- puls,

- effekt,

- och intervallstruktur.

GainPilot ska göra registreringen snabb.

Användaren ska kunna bekräfta planerade värden, ändra belastning och starta timer utan att lämna träningsflödet.

Detaljerad loggning ska finnas för dem som vill ha den.

Den ska inte tvingas på alla.

Arnold ska ge rätt coachning vid rätt tidpunkt.

Under ett vanligt set kan det räcka med:

- nästa mål,

- senaste resultat,

- timer,

- och ett kort teknikfokus.

Vid tidsbrist ska Arnold kunna prioritera passet.

Vid upptagen utrustning ska han kunna föreslå ett relevant byte.

Vid smärta eller allvarliga symptom ska han sluta optimera och prioritera säkerhet.

Kamera, mikrofon, GPS och sensorer ska vara valbara och uppgiftsbegränsade.

Videoanalys ska kunna hjälpa användaren men får inte presenteras som säker diagnos eller absolut biomekanisk sanning.

Råvideo och ljud ska normalt raderas när uppgiften är klar om användaren inte aktivt sparar dem.

Passet ska fungera offline.

Registrerade set ska inte försvinna vid dålig anslutning eller appkrasch.

Synkronisering ska vara idempotent och konflikter mellan enheter ska hanteras utan tyst dataförlust.

Efter passet ska Arnold sammanfatta:

- om huvudsyftet uppnåddes,

- viktiga resultat,

- personbästa,

- betydelsefulla avvikelser,

- och nästa relevanta steg.

Passdata ska kunna informera:

- progression,

- återhämtning,

- kalender,

- kost,

- och långsiktig personalisering.

En enskild avvikelse ska däremot inte automatiskt skriva om hela programmet eller användarens profil.

Arnold ska vara den aktiva coachen användaren möter.

Atlas ska bidra när bredare intelligens eller långsiktig analys behövs.

Hermes ska skapa ett minimerat sessionspaket så att Arnold får:

- rätt pass,

- aktuella begränsningar,

- relevanta tidigare resultat,

- och rätt kontrollnivå

utan obegränsad åtkomst till användarens övriga privatliv.

Alla förändringar av sessionsmodell, timer, autoreglering, sensoranvändning, säkerhetsflöden och synkronisering ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- tillgänglighetsgranskning,

- integritetsgranskning,

- säkerhetsgranskning,

- pull request,

- kontrollerad merge,

- och uppföljning.

Kapitel 14 etablerar därmed följande kärnprincip:

GainPilot ska göra träningspasset intelligent utan att göra det tungrott. Arnold ska finnas där när användaren behöver vägledning, anpassning eller säkerhetsstöd — men själva träningen ska förbli i centrum, med ett snabbt flöde, tydliga beslut och tillförlitlig data som hjälper användaren utvecklas över tid.
