# Kapitel 19 — CrossFit, calisthenics och framtida träningsdomäner

GainPilot ska kunna stödja fler träningsformer än traditionell styrketräning, bodybuilding och allmän kondition.

CrossFit och calisthenics visar tydligt varför GainPilot inte kan bygga hela träningsplattformen kring en enda universell modell för:

- övning,

- set,

- repetitioner,

- belastning,

- vila,

- progression,

- och resultat.

I traditionell styrketräning kan ett träningsmoment ofta beskrivas som:

Övning

→ set

→ repetitioner

→ belastning

→ vila.

I CrossFit kan samma träningspass innehålla:

- styrkemoment,

- olympiska lyft,

- gymnastiska färdigheter,

- löpning,

- rodd,

- cykling,

- komplex,

- intervaller,

- time cap,

- rounds for time,

- AMRAP,

- EMOM,

- scaling,

- rörelsestandarder,

- och flera olika resultatformat.

I calisthenics kan progression i stället handla om:

- kroppslinje,

- hävstång,

- assistans,

- rörelseomfång,

- kontroll,

- hålltid,

- balans,

- teknik,

- övergångar,

- och färdighetsberedskap.

En användare kan bli starkare utan att lägga till extern vikt.

En annan användare kan förbättra en workout utan att få en bättre sluttid, eftersom personen:

- valde svårare scaling,

- genomförde fler korrekta repetitioner,

- använde mindre assistans,

- eller höll en högre rörelsestandard.

GainPilot måste därför förstå träningsdomäner som olika men kompatibla kunskaps- och exekveringssystem.

Plattformen ska inte skapa helt separata appar för varje träningsform.

Den ska i stället ha:

- en gemensam träningsgrund,

- domänspecifika modeller,

- tydliga adapterlager,

- och kontrollerade relationer mellan domänerna.

Den gemensamma grunden ska omfatta:

- användare,

- mål,

- program,

- kalender,

- träningssession,

- aktivitet,

- resultat,

- återhämtning,

- säkerhet,

- minne,

- progression,

- och governance.

Domänlagret ska definiera sådant som endast är meningsfullt inom en viss träningsform.

För CrossFit kan detta vara:

- workoutformat,

- RX,

- scaled,

- foundations,

- time cap,

- no-rep,

- roundstruktur,

- workout score,

- och movement standards.

För calisthenics kan det vara:

- progressionsträd,

- prerequisite-färdigheter,

- assistansnivå,

- statisk hålltid,

- dynamisk kontroll,

- ledposition,

- och regressionsväg.

GainPilot ska även kunna utökas med framtida domäner som:

- powerlifting,

- olympisk tyngdlyftning,

- löpning,

- cykling,

- simning,

- triathlon,

- funktionell fitness,

- rörlighet,

- rehabiliteringsnära träning,

- kampsport,

- lagsport,

- dans,

- vandring,

- klättring,

- och andra specialiserade aktiviteter.

Utbyggnaden ska inte kräva att plattformens kärna skrivs om varje gång en ny domän tillkommer.

Samtidigt får en alltför generell modell inte förstöra de egenskaper som gör varje träningsform unik.

Grundprincipen är:

GainPilot ska ha en gemensam träningsplattform med domänspecifik intelligens. Gemensamma begrepp ska återanvändas där de verkligen är gemensamma, medan varje träningsform ska få de modeller, regler, säkerhetskrav och progressionsvägar som krävs för att representeras korrekt.

19.1 GEMENSAM KÄRNA OCH DOMÄNSPECIFIK INTELLIGENS

GainPilot ska skilja mellan:

1. Gemensam träningskärna.

2. Domänspecifik modell.

3. Domänspecifik intelligens.

4. Domänspecifik presentation.

5. Domänspecifik säkerhet.

Den gemensamma kärnan ska definiera:

- identitet,

- användare,

- mål,

- program,

- kalender,

- session,

- planerat och faktiskt genomförande,

- resultat,

- historik,

- versionering,

- provenance,

- behörighet,

- och audit.

Den domänspecifika modellen ska definiera hur träningsformen representeras.

Den domänspecifika intelligensen ska definiera hur GainPilot:

- planerar,

- analyserar,

- anpassar,

- skalar,

- och utvärderar

inom träningsformen.

19.2 INGEN UNIVERSALMODELL SOM FÖRSTÖR DOMÄNEN

GainPilot ska inte tvinga alla träningsformer till:

- övning,

- tre set,

- tio repetitioner,

- två minuters vila,

- och kilogram.

En sådan modell kan fungera för vissa styrkepass.

Den kan inte korrekt beskriva:

- en 20-minuters AMRAP,

- ett gymnastiskt komplex,

- ett maxhåll i front lever,

- ett intervallpass på cykel,

- ett klätterproblem,

- eller ett simpass med längder och tekniska fokus.

19.3 DEN CANONICAL DOMÄNMODELLEN

Varje träningsdomän ska minst kunna representera:

- domain_identity,

- domain_name,

- domain_version,

- domain_status,

- supported_activity_types,

- supported_session_structures,

- supported_result_types,

- progression_model,

- scaling_model,

- safety_model,

- terminology,

- equipment_model,

- movement_standard_model,

- media_requirements,

- coach_capabilities,

- user_eligibility,

- validation_rules,

- integration_contracts,

- and governance_owner.

Exakta tekniska fältnamn definieras senare.

Domänmodellen ska göra det möjligt att förstå:

- vad domänen omfattar,

- vilka funktioner GainPilot kan stödja,

- vilka begränsningar som finns,

- och vilka delar som ännu inte är implementerade.

19.4 DOMÄNIDENTITET

Varje träningsdomän ska ha stabil identitet.

Exempel:

- strength_training,

- hypertrophy_training,

- crossfit,

- calisthenics,

- powerlifting,

- olympic_weightlifting,

- running,

- cycling,

- swimming,

- mobility,

- och climbing.

Domännamnet kan lokaliseras.

Identiteten ska förbli stabil.

19.5 DOMÄNSTATUS

En domän ska kunna ha status som:

- research,

- conceptual,

- experimental,

- internal_preview,

- beta,

- supported,

- restricted,

- deprecated,

- eller archived.

GainPilot ska inte presentera en experimentell domän som fullständigt och professionellt validerad.

19.6 STÖDNIVÅ

Domänens stödnivå ska beskriva vilka funktioner som faktiskt finns.

Exempel:

Nivå 1:

Registrering och historik.

Nivå 2:

Planering och genomförande.

Nivå 3:

Domänspecifik progression och anpassning.

Nivå 4:

Fördjupad teknik-, säkerhets- och tävlingslogik.

Nivå 5:

Fullt integrerad domänintelligens.

Användaren ska kunna se stödnivån.

19.7 DOMÄNPAKET

En träningsdomän ska kunna levereras som ett versionerat domänpaket.

Paketet kan innehålla:

- dataschema,

- regler,

- ordlista,

- aktivitetstyper,

- progressionsmodeller,

- säkerhetspolicy,

- testscenarier,

- instruktioner,

- media,

- och migrationsregler.

Domänpaketet ska inte kunna ändra plattformens säkerhets- eller behörighetskärna.

19.8 GEMENSAM AKTIVITET

En aktivitet ska vara ett gemensamt överordnat begrepp.

Aktiviteten kan vara:

- en styrkeövning,

- en löpintervall,

- ett gymnastiskt moment,

- en workout,

- en rörlighetssekvens,

- eller ett teknikdrill.

Varje aktivitet ska samtidigt ha en domänspecifik typ.

19.9 AKTIVITETSTYP

Aktivitetstypen ska ange hur aktiviteten ska:

- planeras,

- visas,

- genomföras,

- registreras,

- och analyseras.

Exempel:

- loaded_strength_exercise,

- bodyweight_strength_exercise,

- static_skill_hold,

- dynamic_skill,

- monostructural_interval,

- crossfit_workout,

- olympic_lift,

- mobility_drill,

- och recovery_activity.

19.10 GEMENSAM SESSION

En träningssession ska kunna innehålla flera domäner.

Exempel:

- olympiskt lyft,

- styrkedel,

- CrossFit-workout,

- och rörlighet

i samma session.

Sessionen ska därför kunna bestå av flera domänspecifika delar.

19.11 SESSIONDEL

Varje sessionsdel ska ha:

- identitet,

- domän,

- syfte,

- struktur,

- planerad tid,

- status,

- och resultatmodell.

Exempel:

Del 1:

Teknik — snatch.

Del 2:

Styrka — front squat.

Del 3:

Metcon — AMRAP.

Del 4:

Nedvarvning.

19.12 ORDNING MELLAN DOMÄNER

När flera domäner kombineras ska ordningen ha ett syfte.

Exempel:

Tekniskt krävande olympiska lyft kan placeras före tröttande konditionsarbete.

Avancerad calisthenicsteknik kan kräva hög koncentration och relativt låg trötthet.

GainPilot ska inte slumpmässigt kombinera träningsdelar.

19.13 DOMÄNINTERFERENS

GainPilot ska analysera om träningsdomäner konkurrerar.

Exempel:

- tung benstyrka och hög löpvolym,

- avancerad handståendeträning efter uttröttande axelvolym,

- olympiska lyft efter hård greppträning,

- eller stora mängder kipping före tung press.

Systemet ska kunna förklara kompromissen.

19.14 DOMÄNPRIORITET

Användaren ska kunna prioritera domäner.

Exempel:

Huvudmål:

Styrka.

Sekundärt mål:

Löpning.

Underhåll:

Calisthenics.

Programmet ska återspegla prioriteringen.

19.15 FLERA HUVUDDOMÄNER

Användaren kan ha flera viktiga träningsmål.

GainPilot ska då:

- tydliggöra målkonflikter,

- fördela återhämtning,

- och skapa realistiska kompromisser.

Systemet ska inte lova maximal utveckling inom alla domäner samtidigt.

19.16 CROSSFIT SOM DOMÄN

CrossFit-domänen ska kunna representera:

- styrka,

- olympiska lyft,

- gymnastik,

- monostrukturell kondition,

- workouts,

- skills,

- scaling,

- standarder,

- tävlingsformat,

- och blandade träningspass.

CrossFit får inte reduceras till:

- cirkelträning,

- slumpmässiga övningar,

- eller hög puls.

19.17 CROSSFIT-TERMINOLOGI

GainPilot ska ha en versionshanterad ordlista för CrossFit-relaterade begrepp.

Exempel:

- WOD,

- AMRAP,

- EMOM,

- E2MOM,

- rounds for time,

- chipper,

- ladder,

- couplet,

- triplet,

- time cap,

- RX,

- scaled,

- foundations,

- no-rep,

- och benchmark workout.

Användaren ska kunna få en enkel förklaring av varje begrepp.

19.18 VARUMÄRKEN OCH RÄTTIGHETER

CrossFit är ett registrerat varumärke.

GainPilot ska hantera:

- varumärkesanvändning,

- källhänvisning,

- licenser,

- tävlingsinnehåll,

- och officiella workoutnamn

enligt tillämpliga rättigheter.

Systemet ska inte antyda officiellt partnerskap utan avtal.

19.19 CROSSFIT-WORKOUTIDENTITET

Varje workout ska ha stabil identitet.

Identiteten ska skiljas från:

- workoutnamn,

- datum,

- användarens instans,

- och resultat.

Exempel:

Canonical workout:

gp-cf-workout-fran-inspired-01.

Användarinstans:

Workout genomförd den 14 augusti.

19.20 OFFICIELL OCH EGEN WORKOUT

GainPilot ska skilja mellan:

- officiell benchmark,

- licensierad workout,

- coachskapad workout,

- GainPilot-genererad workout,

- användarskapad workout,

- och importerad workout.

Källan ska vara synlig.

19.21 WORKOUTSTRUKTUR

En CrossFit-workout ska kunna innehålla:

- format,

- rörelser,

- repetitionsschema,

- rounds,

- duration,

- time cap,

- belastningar,

- scaling,

- standarder,

- transitions,

- och scoretyp.

19.22 AMRAP

AMRAP ska representeras som:

- definierad tidsperiod,

- en eller flera aktiviteter,

- repetitionsstruktur,

- fullständiga rundor,

- extra repetitioner,

- och scaling.

Resultatet kan exempelvis vara:

7 rundor + 12 repetitioner.

GainPilot ska inte lagra resultatet som endast 7,12 utan tydlig struktur.

19.23 EMOM

EMOM ska kunna beskriva:

- total tid,

- minutstruktur,

- aktivitet per minut,

- arbetsmål,

- återstående vila,

- och genomförandestatus.

Varianter kan vara:

- every minute,

- every two minutes,

- alternerande minuter,

- eller längre intervall.

19.24 ROUNDS FOR TIME

Rounds for time ska innehålla:

- antal rundor,

- aktiviteter,

- repetitioner,

- belastningar,

- standarder,

- total tid,

- time cap,

- och eventuell ofullständig progress.

Om time cap nås ska GainPilot bevara:

- slutförd del,

- inte endast statusen misslyckad.

19.25 CHIPPER

En chipper ska representeras som en sekvens av större arbetsblock som normalt genomförs i ordning.

Systemet ska kunna registrera:

- var användaren befann sig vid time cap,

- delresultat,

- och eventuella scalingändringar.

19.26 LADDER

En ladder kan vara:

- stigande,

- fallande,

- pyramid,

- viktbaserad,

- repetitionsbaserad,

- eller tidsbaserad.

GainPilot ska representera stegen strukturerat.

Systemet ska inte lagra hela upplägget som en fritextrad.

19.27 COUPLET OCH TRIPLET

Couplet och triplet ska kunna beskriva relationen mellan:

- två,

- respektive tre,

återkommande rörelser eller aktiviteter.

Formatet ska kunna kombineras med:

- AMRAP,

- rounds for time,

- intervall,

- eller annan workoutstruktur.

19.28 INTERVALLWORKOUT

CrossFit-domänen ska stödja intervaller med:

- arbete,

- vila,

- antal intervaller,

- score per intervall,

- och total score.

GainPilot ska kunna skilja mellan:

- bästa intervall,

- genomsnitt,

- totalarbete,

- och fallande prestation.

19.29 TIME CAP

Time cap ska vara ett explicit fält.

Den ska inte blandas ihop med:

- planerad duration,

- faktisk sluttid,

- eller vilotid.

När time cap nås ska resultatet fortfarande vara giltigt och analyserbart.

19.30 SCORETYPER

CrossFit-workouts kan använda score som:

- tid,

- rounds plus reps,

- totala repetitioner,

- total belastning,

- kalorier,

- distans,

- poäng,

- eller flera delresultat.

Scoretypen ska styra:

- registrering,

- jämförelse,

- och presentation.

19.31 FLERA SCORES

En workout kan ha flera scores.

Exempel:

- belastning i styrkedelen,

- tid i workoutdelen,

- och kvalitetsstatus för en skill.

GainPilot ska inte försöka slå samman allt till en enda poäng.

19.32 RX

RX ska betyda att workouten genomfördes enligt definierad RX-version.

Det kräver att GainPilot bevarar:

- rörelser,

- belastningar,

- repetitionsschema,

- standard,

- och övriga krav.

Användaren ska inte kunna markeras RX enbart för att workoutnamnet matchar.

19.33 SCALED

Scaled ska inte vara en enda generell kategori.

GainPilot ska bevara exakt:

- vilka rörelser som ändrades,

- vilken belastning som användes,

- vilka repetitioner som ändrades,

- och vilka standarder som gällde.

Två scaled-resultat kan vara helt olika.

19.34 FOUNDATIONS

En foundations-version kan prioritera:

- grundteknik,

- lägre komplexitet,

- lägre belastning,

- och tydligare standard.

Foundations ska inte beskrivas som ett misslyckat RX-försök.

Det är en egen giltig workoutversion.

19.35 INDIVIDUELL SCALING

GainPilot ska kunna skapa individuell scaling utifrån:

- erfarenhet,

- rörelseförmåga,

- säkerhet,

- skada eller begränsning,

- utrustning,

- och workoutens avsedda stimulus.

Scaling ska bevara stimulus där det är möjligt.

19.36 STIMULUS

Varje workout ska kunna ha avsett stimulus.

Exempel:

- kort och intensiv,

- medellång kontinuerlig arbetskapacitet,

- lokal muskulär uthållighet,

- tung belastning under trötthet,

- gymnastisk densitet,

- eller längre pacingarbete.

Scaling ska utgå från stimulus, inte endast från att göra rörelser enklare.

19.37 STIMULUSBEVARANDE SCALING

Ett relevant scalingbeslut ska kunna svara på:

- Vad ska användaren uppleva?

- Hur länge bör workouten ungefär pågå?

- Vilken rörelsekvalitet krävs?

- Hur stor del av arbetet ska vara obrutet?

- Var får tröttheten huvudsakligen uppstå?

Ett byte som förändrar hela workoutens funktion ska markeras som kompromiss.

19.38 RÖRELSESTANDARD

Varje rörelse i en workout ska kunna ha definierad standard.

Exempel:

- startposition,

- slutposition,

- rörelseomfång,

- kontaktpunkt,

- låsning,

- kontroll,

- och tillåtna variationer.

Standarder ska kunna versioneras.

19.39 NO-REP

GainPilot ska kunna registrera no-reps.

No-rep ska kopplas till:

- repetition,

- orsak,

- standard,

- källa,

- och eventuell videoreferens.

Systemet ska inte låta en osäker AI-bedömning ensam avgöra tävlingsresultat.

19.40 RÖRELSER UNDER TRÖTTHET

CrossFit innebär ofta rörelser under hög trötthet.

GainPilot ska därför kunna skilja mellan:

- teknisk kapacitet i utvilat tillstånd,

- och säker kapacitet under workout.

Att användaren kan genomföra en rörelse en gång betyder inte automatiskt att den är lämplig i hög repetitionsvolym.

19.41 KOMPLEXA RÖRELSER

Komplexa moment kan vara:

- snatch,

- clean and jerk,

- muscle-up,

- handstand walk,

- kipping pull-up,

- toes-to-bar,

- eller rope climb.

Programmering ska ta hänsyn till:

- teknik,

- trötthet,

- volym,

- och progression.

19.42 OLYMPISKA LYFT I CROSSFIT

Olympiska lyft inom en workout ska inte analyseras exakt som olympisk tyngdlyftning i tävlingssammanhang.

GainPilot ska bevara kontexten:

- tekniskt arbete,

- styrkedel,

- maxförsök,

- komplex,

- eller workout under tid.

19.43 BARBELL COMPLEX

Ett skivstångskomplex ska kunna representera:

- rörelsernas ordning,

- repetitionsantal,

- om stången får släppas,

- belastning,

- rounds,

- och vila.

Komplexet ska vara en egen strukturerad aktivitet.

19.44 GYMNASTISKT KOMPLEX

Ett gymnastiskt komplex kan innehålla:

- flera rörelser,

- övergångar,

- obruten sekvens,

- och kvalitetskrav.

GainPilot ska inte bryta upp komplexet till helt oberoende övningar när övergången är en del av färdigheten.

19.45 MONOSTRUKTURELLA AKTIVITETER

CrossFit-domänen ska stödja:

- löpning,

- rodd,

- cykling,

- ski erg,

- simning,

- och andra repetitiva konditionsaktiviteter.

Varje aktivitet ska bevara:

- distans,

- kalorier,

- tid,

- effekt,

- maskintyp,

- och relevanta inställningar.

19.46 MASKINSPECIFIK DATA

Kalorier på olika maskiner är inte alltid direkt jämförbara.

GainPilot ska bevara:

- maskintyp,

- modell där relevant,

- inställning,

- och datakälla.

19.47 TRANSITIONS

Övergångar mellan aktiviteter kan vara betydelsefulla.

GainPilot kan stödja:

- transitionstid,

- utrustningsplacering,

- och logistiska flaskhalsar.

Systemet ska inte alltid tolka långsam transition som dålig kondition.

19.48 PACING

CrossFit-intelligensen ska kunna hjälpa användaren planera pacing.

Det kan omfatta:

- öppningstempo,

- setuppdelning,

- planerad vila,

- transitionsstrategi,

- och avslutning.

Pacingförslag ska baseras på:

- workout,

- historik,

- kapacitet,

- och scaling.

19.49 SETUPPDELNING

GainPilot ska kunna föreslå hur repetitioner kan delas.

Exempel:

15 pull-ups kan planeras som:

- 8 + 7,

- 5 + 5 + 5,

- eller obrutet

beroende på användarens kapacitet och workoutens syfte.

Systemet ska inte anta att obrutet alltid är bäst.

19.50 WORKOUTFÖRHANDSVISNING

Före start ska Arnold kunna visa:

- workoutformat,

- rörelser,

- scaling,

- standarder,

- time cap,

- avsett stimulus,

- pacingförslag,

- och säkerhetsnoteringar.

19.51 WORKOUTGENOMFÖRANDE

Under workout ska gränssnittet kunna prioritera:

- tid,

- aktuell round,

- repetition,

- nästa rörelse,

- och enkel registrering.

Det ska inte kräva långa dialoger under intensivt arbete.

19.52 AUTOMATISK ROUNDRÄKNING

GainPilot kan stödja automatisk eller halvautomatisk roundräkning genom:

- användartryck,

- wearable,

- sensor,

- kamera,

- eller röst.

Automatisk registrering ska visa osäkerhet och vara korrigerbar.

19.53 RÖST UNDER WORKOUT

Användaren ska kunna säga:

- ny round,

- tio repetitioner,

- paus,

- no-rep,

- eller stoppa.

Röstfunktionen ska vara robust mot:

- musik,

- andning,

- och bakgrundsljud.

Osäker registrering ska inte tyst bli officiellt resultat.

19.54 WORKOUTRESULTAT

Efter workout ska GainPilot kunna visa:

- score,

- scaling,

- standard,

- time cap-status,

- upplevd ansträngning,

- pacing,

- rörelseproblem,

- och användarfeedback.

19.55 JÄMFÖRBARA CROSSFITRESULTAT

Två resultat ska endast jämföras direkt när:

- workoutversion,

- scaling,

- rörelsestandard,

- time cap,

- utrustning,

- och scoretyp

är tillräckligt kompatibla.

19.56 CROSSFIT-PROGRESSION

CrossFit-progression ska kunna analyseras inom flera dimensioner.

Exempel:

- förbättrad benchmarktid,

- högre belastning,

- svårare scaling,

- fler korrekta repetitioner,

- jämnare pacing,

- förbättrade skills,

- och större arbetskapacitet.

Systemet ska inte skapa en enda global CrossFit-poäng som ersätter dessa delar.

19.57 CROSSFIT-PROGRAMMERING

GainPilot ska kunna representera programmering över:

- dag,

- vecka,

- block,

- och säsong.

Programmeringen ska kunna balansera:

- styrka,

- olympiska lyft,

- skills,

- gymnastik,

- kondition,

- mixed modal work,

- och återhämtning.

19.58 CONSTANTLY VARIED ÄR INTE SLUMPMÄSSIGT

Variation ska inte betyda slump.

Ett program kan vara varierat och samtidigt ha:

- mål,

- progression,

- återkommande exponering,

- belastningskontroll,

- och tydliga testpunkter.

GainPilot ska undvika workoutgenerering som endast blandar rörelser för att skapa nyhet.

19.59 TRÄNINGSDOS I CROSSFIT

Träningsdos ska kunna bedömas genom:

- duration,

- intensitet,

- rörelsevolym,

- belastning,

- skillkrav,

- impact,

- och kombination av domäner.

En workout på tio minuter kan vara mer belastande än ett längre pass.

19.60 RÖRELSEEXPOSERING

GainPilot ska kunna följa exponering för:

- pull-ups,

- toes-to-bar,

- burpees,

- box jumps,

- olympiska lyft,

- och andra återkommande moment.

Detta kan minska risken för olämplig volymkoncentration.

19.61 REPETITIONSVOLYM

Höga repetitionsantal ska bedömas i relation till:

- rörelse,

- användarnivå,

- teknik,

- föregående träning,

- och återhämtning.

Systemet ska inte behandla 100 repetitioner som samma belastning oavsett rörelse.

19.62 IMPACT OCH LANDNINGAR

Rörelser med upprepade landningar kan kräva särskild belastningsmodell.

Exempel:

- box jumps,

- double-unders,

- löpning,

- och hoppande utfall.

GainPilot ska kunna följa impactvolym separat.

19.63 KIPPINGVOLYM

Kipping och dynamiska hängande rörelser ska kunna ha:

- egen volym,

- teknikstatus,

- och återhämtningsbehov.

Systemet ska inte endast räkna dem som vanliga pull-ups.

19.64 HANDSKADOR OCH GREPP

CrossFit och calisthenics kan ge hög grepp- och hudbelastning.

GainPilot kan stödja:

- grepptrötthet,

- hudproblem,

- rivna händer,

- och behov av modifiering.

Systemet ska inte diagnostisera skada.

19.65 CROSSFIT-SÄKERHET

CrossFit-säkerheten ska omfatta:

- teknik under trötthet,

- hög repetitionsvolym,

- komplexa lyft,

- skalning,

- time cap,

- värme,

- vätska,

- och användarens erfarenhet.

19.66 STOPPKRITERIER

GainPilot ska kunna definiera stoppkriterier.

Exempel:

- tydlig smärta,

- yrsel,

- förlorad kontroll,

- allvarligt försämrad teknik,

- eller annan säkerhetssignal.

Arnold ska prioritera säkerhet framför score.

19.67 TÄVLING

Tävlingsläge ska vara separat från vardagsträning.

Det kan kräva:

- verifierade standarder,

- domare,

- heat,

- lane,

- officiellt scoreformat,

- och låst workoutversion.

GainPilot ska inte presentera vanlig träningsdata som officiellt tävlingsresultat.

19.68 LEADERBOARDS

Leaderboards ska vara valbara.

De ska bevara:

- workoutversion,

- scaling,

- kategori,

- standard,

- och verifieringsstatus.

GainPilot ska inte ranka inkompatibla resultat tillsammans.

19.69 PRIVAT RESULTAT

Användaren ska kunna registrera en CrossFit-workout helt privat.

Privat resultat ska inte automatiskt delas till:

- gym,

- coach,

- grupp,

- eller leaderboard.

19.70 BOX- OCH COACHINTEGRATION

En CrossFit-box eller coach kan framtida få tillgång till:

- programmering,

- klasschema,

- valda resultat,

- scaling,

- och feedback.

Åtkomsten ska vara:

- explicit,

- tidsbegränsad,

- och scopebaserad.

19.71 KLASSBOKNING

GainPilot kan integrera klassbokning.

Systemet ska skilja mellan:

- bokad klass,

- planerad träning,

- genomförd klass,

- och avbokning.

Bokning ska inte automatiskt räknas som genomförande.

19.72 KLASSPLAN OCH INDIVIDPLAN

Boxens klassprogram kan behöva kombineras med användarens individuella mål.

GainPilot ska kunna:

- analysera veckans klassinnehåll,

- identifiera luckor,

- och undvika dubbelbelastning.

Systemet ska inte skriva om boxens program utan rätt mandat.

19.73 CALISTHENICS SOM DOMÄN

Calisthenics-domänen ska kunna representera:

- kroppsviktsstyrka,

- statiska skills,

- dynamiska skills,

- balans,

- kontroll,

- mobilitet,

- hävstång,

- assistans,

- progressioner,

- regressionsvägar,

- och kombinationer.

19.74 CALISTHENICS ÄR INTE ENBART ÖVNINGAR UTAN VIKT

Calisthenics ska inte reduceras till:

- armhävningar,

- sit-ups,

- och kroppsviktsknäböj.

Domänen kan innehålla avancerade färdigheter som:

- handstand,

- handstand push-up,

- planche,

- front lever,

- back lever,

- muscle-up,

- human flag,

- pistol squat,

- one-arm pull-up,

- och statiska ringpositioner.

19.75 SKILLIDENTITET

Varje skill ska ha stabil identitet.

Exempel:

- freestanding_handstand,

- strict_bar_muscle_up,

- front_lever,

- tuck_planche,

- ring_support_hold,

- och pistol_squat.

Skillidentiteten ska skiljas från:

- progression,

- variant,

- och användarens aktuella nivå.

19.76 PROGRESSIONSTRÄD

En skill ska kunna ha ett progressionsträd.

Trädet kan innehålla:

- prerequisites,

- regressions,

- progressioner,

- parallella vägar,

- stödövningar,

- och exitkriterier.

Progressionsträdet ska vara en graf, inte endast en linjär lista.

19.77 INGEN ENDA UNIVERSAL PROGRESSIONSVÄG

Olika användare kan nå samma skill genom olika vägar.

Exempel:

En användare kan behöva mer:

- dragstyrka.

En annan kan behöva:

- skulderbladskontroll.

En tredje kan behöva:

- rörlighet,

- balans,

- eller teknik.

GainPilot ska därför inte kräva exakt samma progression från alla.

19.78 PREREQUISITES

En skill kan ha prerequisites inom:

- styrka,

- mobilitet,

- kontroll,

- teknik,

- tolerans,

- och säkerhet.

Prerequisites ska beskrivas som:

- rekommenderade,

- starkt rekommenderade,

- eller obligatoriska

beroende på risk och kunskapsgrund.

19.79 SKILLBEREDSKAP

GainPilot ska kunna bedöma beredskap utifrån flera signaler.

Exempel:

För muscle-up kan relevant underlag vara:

- strikt pull-up-kapacitet,

- dipstyrka,

- övergångsteknik,

- grepp,

- och kontrollerad kipping där det används.

Beredskapsbedömningen ska uttrycka osäkerhet.

19.80 STATISKA SKILLS

Statiska skills ska kunna registrera:

- position,

- progression,

- hålltid,

- kvalitet,

- assistans,

- och antal försök.

19.81 HÅLLTID

Hålltid ska mätas från:

- godkänd startposition,

- till dess att standarden bryts.

GainPilot ska inte räkna tid i en tydligt förlorad position som full kvalitativ hålltid.

19.82 KVALITETSGRADERING

En statisk position kan ha kvalitet som:

- ej godkänd,

- delvis godkänd,

- godkänd,

- stabil,

- eller tävlingsstandard

där en sådan standard finns.

Kvalitetsgraderingen ska vara förklarbar.

19.83 DYNAMISKA SKILLS

Dynamiska skills ska kunna registrera:

- startposition,

- rörelseväg,

- övergång,

- slutposition,

- assistans,

- repetition,

- och kvalitet.

19.84 SKILLFÖRSÖK

GainPilot ska skilja mellan:

- träningsrepetition,

- tekniskt försök,

- nästan lyckat försök,

- lyckad repetition,

- och stabil serie.

Ett enda lyckat försök ska inte automatiskt innebära full behärskning.

19.85 SKILLSTATUS

Skillstatus kan vara:

- ej introducerad,

- introducerad,

- prerequisite-träning,

- assisterad,

- delvis självständig,

- enstaka lyckad,

- stabil,

- konsekvent,

- eller avancerad.

19.86 ASSISTANS

Assistans ska kunna representera:

- gummiband,

- maskin,

- partner,

- fotstöd,

- box,

- vägg,

- counterweight,

- eller annan metod.

Assistansnivåer ska inte jämföras utan metodkontext.

19.87 GUMMIBAND

Gummiband varierar mellan:

- tillverkare,

- färg,

- längd,

- slitage,

- och placering.

GainPilot ska inte anta att ett visst färgnamn alltid motsvarar samma assistans.

19.88 VÄGGASSISTANS

Handstående mot vägg ska skiljas mellan:

- mage mot vägg,

- rygg mot vägg,

- avstånd,

- stödgrad,

- och fristående försök.

Alla väggvarianter ska inte behandlas som likvärdiga.

19.89 HÄVSTÅNG

Calisthenicsprogression påverkas av hävstång.

GainPilot ska kunna representera:

- tuck,

- advanced tuck,

- straddle,

- one-leg,

- full position,

- och andra definierade levervarianter.

Systemet ska inte anta att små visuella skillnader är obetydliga.

19.90 RÖRELSEOMFÅNG

Progression kan ske genom större rörelseomfång.

Exempel:

- djupare handstand push-up,

- lägre pistol squat,

- eller längre dragväg.

Rörelseomfång ska kunna registreras utan falsk precision.

19.91 TEMPO

Tempo kan användas för att bygga:

- kontroll,

- styrka,

- och positionsmedvetenhet.

Calisthenicsmodellen ska stödja:

- excentrisk tid,

- paus,

- koncentrisk fas,

- och statisk kontroll.

19.92 EXCENTRISKA PROGRESSIONER

Excentriska repetitioner kan vara en egen progression.

GainPilot ska kunna lagra:

- startassistans,

- excentrisk tid,

- kontroll,

- slutposition,

- och säkerhetsstatus.

19.93 PARTIALS

Partiella repetitioner kan användas avsiktligt.

De ska markeras som:

- definierat rörelseomfång,

- inte full repetition.

GainPilot ska inte skapa falska personbästa genom att blanda partials och full ROM.

19.94 ISOMETRISK TRÄNING

Isometrisk träning kan innehålla:

- position,

- ledvinkel,

- hålltid,

- ansträngning,

- och assistans.

Olika positioner ska inte jämföras endast genom sekunder.

19.95 RINGAR

Ringträning ska kunna representera:

- instabilitet,

- ringhöjd,

- ringbredd,

- stöd,

- turn-out,

- och specifik standard.

En ring-dip ska inte behandlas som identisk med parallellbars-dip.

19.96 PARALLETTES

Parallettes kan påverka:

- handledsvinkel,

- höjd,

- rörelseomfång,

- och balans.

Utrustningsvarianten ska bevaras.

19.97 STÅNG OCH RÄCKE

GainPilot ska kunna skilja mellan:

- rak stång,

- multigrip,

- neutral grip,

- tjock stång,

- och annan greppmiljö.

Greppvarianten påverkar jämförbarheten.

19.98 MOBILITET OCH SKILLS

Vissa skills kräver mobilitet.

Exempel:

- handstående,

- pistol squat,

- bridge,

- och djupa kompressionspositioner.

GainPilot ska kunna koppla skill till relevanta mobilitetsbehov utan att diagnostisera begränsningen.

19.99 STYRKA OCH SKILLS

Skillträning ska skilja mellan:

- generell styrka,

- positionsstyrka,

- teknik,

- och balans.

Mer generell styrka löser inte alltid skillproblemet.

19.100 BALANS

Balansskills ska kunna följas genom:

- fri hålltid,

- antal kontrollerade försök,

- korrigeringsförmåga,

- och startmetod.

GainPilot ska inte endast räkna bästa enstaka hålltid.

19.101 HANDSTÅENDE

Handståendemodellen ska kunna representera:

- väggvariant,

- kick-up,

- press-entry,

- fristående håll,

- gång,

- linje,

- handposition,

- och säkerhetsmiljö.

19.102 PLANCHE

Plancheprogression ska kunna representera:

- tuck,

- advanced tuck,

- straddle,

- full,

- lean,

- bandassistans,

- och parallettes eller golv.

Systemet ska inte rekommendera progression endast utifrån hålltid.

19.103 FRONT LEVER

Front lever ska kunna representera:

- tuck,

- advanced tuck,

- one-leg,

- straddle,

- full,

- raises,

- pulls,

- och assisterade varianter.

19.104 MUSCLE-UP

Muscle-up ska skilja mellan:

- ring och bar,

- strikt och kipping,

- transitionstyp,

- grepp,

- och standard.

En kipping bar muscle-up ska inte registreras som strikt ring muscle-up.

19.105 ONE-ARM-PROGRESSIONER

Ensidiga avancerade progressioner ska kräva särskild belastnings- och säkerhetsmodell.

GainPilot ska inte öka asymmetrisk belastning aggressivt utifrån ett fåtal lyckade försök.

19.106 CALISTHENICS-PROGRAMMERING

Calisthenicsprogrammering ska kunna balansera:

- skillträning,

- styrka,

- volym,

- mobilitet,

- prehab,

- och återhämtning.

19.107 SKILL FÖRE TRÖTTHET

Tekniskt krävande skillträning ska ofta placeras före stor trötthet.

GainPilot ska kunna göra undantag när:

- syftet är uthållighet,

- workoutkontext kräver annat,

- eller coachen definierat en särskild progression.

19.108 FÖRSÖKSVOLYM

Skillträning ska inte endast mätas i repetitioner.

GainPilot ska kunna följa:

- antal kvalitetsförsök,

- total hålltid,

- misslyckade försök,

- och teknisk nedgång.

19.109 KVALITETSSTOPP

Ett skillpass ska kunna stoppas när:

- kvaliteten faller,

- kontrollen försvinner,

- eller säkerhetsrisken ökar.

Mer träning är inte alltid bättre.

19.110 CALISTHENICS-PROGRESSION

Progression kan innebära:

- mindre assistans,

- bättre position,

- längre kvalitativ hålltid,

- större ROM,

- fler kontrollerade repetitioner,

- svårare hävstång,

- eller stabilare utförande.

19.111 INTE ENDAST NÄSTA SVÅRIGHETSGRAD

GainPilot ska inte automatiskt flytta användaren till nästa progression när ett minimivärde nås.

Systemet ska även bedöma:

- kvalitet,

- stabilitet,

- återhämtning,

- och programmets mål.

19.112 REGRESSION

Regression ska vara ett legitimt träningsverktyg.

Den kan användas vid:

- trötthet,

- teknikfokus,

- volymarbete,

- återstart,

- eller säkerhet.

Regression ska inte beskrivas som misslyckande.

19.113 PARALLELLA PROGRESSIONER

En användare kan träna flera vägar samtidigt.

Exempel:

För handstand:

- linjeträning,

- balans,

- kick-up,

- och handledstolerans.

GainPilot ska kunna visa hur vägarna stödjer samma övergripande skill.

19.114 SUPPORTÖVNINGAR

Supportövningar ska kopplas till ett tydligt behov.

Exempel:

- scapula pull-ups,

- hollow body,

- compression work,

- wrist conditioning,

- eller straight-arm strength.

Systemet ska inte lägga till generiska supportövningar utan relation till skillen.

19.115 SKILLÖVERFÖRING

GainPilot kan representera överföring mellan färdigheter.

Exempel:

- ring support kan stödja ring dips,

- hollow body kan stödja flera gymnastiska moment,

- och handstandlinje kan stödja handstand walk.

Överföringen ska uttryckas som relation, inte garanti.

19.116 CROSSFIT OCH CALISTHENICS TILLSAMMANS

CrossFit och calisthenics kan dela:

- gymnastiska rörelser,

- kroppsviktsstyrka,

- grepp,

- och skills.

Domänkontexten kan ändå vara olika.

Exempel:

En muscle-up kan tränas som:

- teknisk calisthenicsskill,

- styrkemål,

- eller högrepetitiv CrossFit-rörelse.

GainPilot ska bevara syftet.

19.117 DOMÄNSPECIFIK SUBSTITUTION

Substitutionsmotorn ska använda domänens logik.

I CrossFit ska substitution bevara:

- stimulus,

- tidsprofil,

- rörelsemönster,

- och workoutflöde.

I calisthenics ska substitution bevara:

- skillmål,

- prerequisite,

- assistansnivå,

- och teknisk funktion.

19.118 CROSSFIT-SUBSTITUTION

Exempel:

Ring muscle-up kan vid scaling ersättas med:

- bar muscle-up,

- jumping muscle-up,

- pull-up plus dip,

- eller annan progression.

Rätt val beror på:

- workoutens stimulus,

- användarens skillnivå,

- volym,

- och säkerhet.

19.119 CALISTHENICS-SUBSTITUTION

Exempel:

Full front lever kan ersättas med:

- straddle,

- one-leg,

- advanced tuck,

- bandassistans,

- eller front lever rows.

Valet ska utgå från:

- målet med passet,

- användarens nivå,

- och vilken förmåga som tränas.

19.120 SUBSTITUTION MELLAN DOMÄNER

En aktivitet kan ibland ersättas av en aktivitet från annan domän.

Exempel:

Löpning kan ersättas av rodd vid utrustnings- eller belastningsproblem.

Ett kroppsviktsdrag kan ersätta ett kabeldrag i hemmaträning.

Sådana byten ska markera:

- vad som bevaras,

- och vad som förändras.

19.121 DOMÄNÖVERSÄTTNING

GainPilot ska kunna översätta träningsintention mellan domäner.

Exempel:

Mål:

Vertikal dragstyrka.

Gym:

Lat pulldown.

Calisthenics:

Assisterad pull-up.

CrossFit:

Pull-upvariation inom definierad workout.

Aktiviteterna är relaterade men inte identiska.

19.122 FRAMTIDA DOMÄNER

GainPilot ska kunna lägga till nya träningsdomäner utan att:

- ändra användaridentitet,

- skapa separat minnessystem,

- duplicera kalendern,

- eller bryta befintlig historik.

Nya domäner ska ansluta genom tydliga kontrakt.

19.123 DOMÄNADAPTER

En domänadapter ska översätta mellan:

- domänens interna modell,

- och GainPilots gemensamma kärna.

Adaptern ska hantera:

- aktiviteter,

- sessioner,

- resultat,

- progression,

- säkerhet,

- och export.

19.124 POWERLIFTING

En framtida powerliftingdomän kan kräva:

- squat,

- bench press,

- deadlift,

- tävlingsstandard,

- attempts,

- viktklass,

- utrustningskategori,

- commands,

- total,

- och meet preparation.

Den ska inte reduceras till vanlig styrketräning.

19.125 OLYMPISK TYNGDLYFTNING

En tyngdlyftningsdomän kan kräva:

- snatch,

- clean and jerk,

- attempts,

- tekniska varianter,

- komplex,

- total,

- tävlingsregler,

- och lyftstandard.

19.126 LÖPNING

En löpdomän kan kräva:

- distans,

- underlag,

- höjdprofil,

- tempo,

- puls,

- intervall,

- race,

- skor,

- och väderkontext.

19.127 CYKLING

En cykeldomän kan kräva:

- effekt,

- kadens,

- cykeltyp,

- trainer,

- terräng,

- drafting,

- distans,

- och energiplanering.

19.128 SIMNING

En simdomän kan kräva:

- simsätt,

- bassänglängd,

- open water,

- antal längder,

- pace,

- stroke rate,

- teknikdrill,

- och säkerhetsmiljö.

19.129 TRIATHLON

Triathlon kräver samordning mellan:

- simning,

- cykling,

- löpning,

- transitions,

- tävlingsdistans,

- och energiplanering.

GainPilot ska inte behandla det som tre oberoende program.

19.130 KLÄTTRING

En klätterdomän kan kräva:

- bouldering,

- led,

- grad,

- försök,

- problemidentitet,

- grepp,

- väggvinkel,

- och säkerhetskompetens.

19.131 KAMPSPORT

En kampsportdomän kan kräva:

- teknik,

- sparring,

- rond,

- intensitet,

- viktklass,

- partner,

- och säkerhetsregler.

GainPilot ska inte ge autonoma kampinstruktioner utan särskild riskgranskning.

19.132 LAGSPORT

Lagsport kan kräva:

- träning,

- match,

- position,

- lagbelastning,

- sprintar,

- kontakt,

- och säsongsplanering.

Individuell GainPilot-plan ska samordnas med lagets belastning.

19.133 REHABILITERINGSNÄRA DOMÄNER

Rehabiliteringsnära funktioner ska kräva:

- tydligt professionellt scope,

- instruktionens källa,

- tillåten anpassning,

- och stoppkriterier.

GainPilot ska inte marknadsföra vanlig träningsintelligens som medicinsk rehabilitering.

19.134 DOMÄNBEHÖRIGHET

En agent eller coach ska endast få agera inom godkända domäner.

Exempel:

En modell validerad för generell styrketräning får inte automatiskt:

- skapa olympisk lyftteknik,

- bedöma avancerad gymnastik,

- eller planera rehabilitering.

19.135 DOMÄNKOMPETENS

Varje intelligenskomponent ska ha deklarerad kompetens.

Det ska framgå:

- vilka domäner den stödjer,

- vilka nivåer,

- vilka användare,

- och vilka riskbegränsningar.

19.136 OKÄND DOMÄN

Om användaren registrerar en aktivitet som GainPilot inte förstår ska systemet:

- bevara originalet,

- låta användaren beskriva den,

- klassificera den som privat eller okänd,

- och undvika påhittad analys.

19.137 DOMÄNKANDIDAT

Återkommande okända aktiviteter kan skapa förslag om ny domän eller aktivitetstyp.

Detta ska inte direkt utöka canonical biblioteket.

19.138 CANONICALISERING AV NY DOMÄN

En ny domän ska kräva:

1. Behovsanalys.

2. Domänexpertis.

3. Begreppsmodell.

4. Säkerhetsmodell.

5. Progressionsmodell.

6. Datamodell.

7. Mediekrav.

8. Testbibliotek.

9. Integritetsgranskning.

10. Implementationsplan.

11. Kontrollerad utrullning.

19.139 DOMÄNEXPERT

Nya specialiserade domäner ska granskas av relevant expertis.

Exempel:

- kvalificerad coach,

- träningsfysiolog,

- fysioterapeut,

- idrottsspecifik specialist,

- eller annan relevant yrkeskompetens.

En språkmodell ska inte vara enda domänexpert.

19.140 KUNSKAPSPROVENANCE

Domänregler ska ha känd källa.

Källan kan vara:

- forskning,

- officiella regler,

- utbildningsmaterial,

- professionell expert,

- licensierad metod,

- eller intern validering.

GainPilot ska skilja mellan:

- etablerad kunskap,

- expertpraxis,

- och experimentell hypotes.

19.141 FORSKNINGSUPPDATERING

Atlas kan hjälpa bevaka ny forskning och domänutveckling.

Research ska inte direkt ändra:

- programregler,

- säkerhet,

- eller canonical progressioner.

Förändringen ska genomgå granskning.

19.142 REGELUPPDATERINGAR

Tävlingsregler och standarder kan förändras.

GainPilot ska versionera:

- regelverk,

- workoutstandard,

- viktklass,

- eller annan officiell definition.

Historiska resultat ska bevara dåvarande regelversion.

19.143 DOMÄNMEDIA

Varje domän kan kräva olika media.

Exempel:

CrossFit:

- rörelsestandard,

- scaling,

- workoutbrief.

Calisthenics:

- progression,

- kroppslinje,

- assistans,

- och kameravinkel.

Löpning:

- teknikdrill,

- terräng,

- och pacing.

Media ska produceras efter domänens behov.

19.144 ANIMATIONER

Övningsanimationer ska inte användas som om de bevisar full domänkompetens.

En animation kan visa:

- grundrörelse,

- position,

- och tempo.

Den kan inte alltid visa:

- individuell scaling,

- trötthet,

- säker miljö,

- eller avancerad teknikbedömning.

19.145 VIDEO

Vissa komplexa skills kan kräva riktig video eller expertgranskad 3D-animation.

Media ska bedömas för:

- biomekanisk korrekthet,

- kameravinkel,

- standard,

- och säkerhet.

19.146 AI-GENERERADE RÖRELSEVIDEO

AI-genererad rörelsevideo får inte publiceras som teknikreferens utan:

- biomekanisk kontroll,

- ledpositionsgranskning,

- repetitionsvalidering,

- och domänexpertens godkännande.

Visuellt övertygande rörelse kan fortfarande vara tekniskt fel.

19.147 KAMERAANALYS

Kameraanalys ska ha domänspecifika modeller.

En modell tränad för:

- squatdjup

kan inte automatiskt bedöma:

- handstandlinje,

- muscle-up-transition,

- eller olympiskt lyft.

19.148 KAMERAVINKEL

Varje analys ska ange vilka vinklar som stöds.

Exempel:

- sida,

- framifrån,

- bakifrån,

- eller flera kameror.

Fel vinkel ska skapa:

- begränsad analys,

- inte självsäker bedömning.

19.149 TÄVLINGSBEDÖMNING

AI-baserad bedömning ska inte användas som ensam domare i officiell tävling utan särskild validering, regelgrund och mänsklig kontroll.

19.150 DOMÄNSPECIFIK SÄKERHET

Varje domän ska definiera:

- riskmoment,

- stoppkriterier,

- användarkrav,

- miljökrav,

- utrustningskrav,

- och professionella gränser.

19.151 MILJÖKRAV

Exempel:

Handstand:

Tillräckligt fri yta och säker fallväg.

Ringträning:

Kontrollerad infästning.

Olympiska lyft:

Lämplig plattform och möjlighet att släppa stång.

Open water:

Särskild simsäkerhet.

GainPilot ska inte ignorera träningsmiljön.

19.152 UTRUSTNINGSSÄKERHET

Systemet ska kunna kontrollera:

- tillräcklig infästning,

- stabilitet,

- slitage,

- och lämplighet

där användaren anger relevant information.

GainPilot ska inte ge falsk garanti om utrustningens säkerhet.

19.153 ERFARENHETSNIVÅ

Domänens funktioner ska kunna begränsas efter:

- nybörjare,

- van,

- avancerad,

- tävlande,

- eller professionell.

Avancerade rörelser ska inte rekommenderas enbart för att användaren efterfrågar dem.

19.154 INTRODUKTIONSFLÖDE

När användaren aktiverar en ny domän ska Arnold kunna fråga om:

- erfarenhet,

- mål,

- utrustning,

- tidigare historik,

- begränsningar,

- och önskad ambitionsnivå.

19.155 DOMÄNSPECIFIK ONBOARDING

CrossFit-onboarding kan fråga om:

- box,

- RX-erfarenhet,

- olympiska lyft,

- gymnastiska skills,

- och benchmarkhistorik.

Calisthenics-onboarding kan fråga om:

- pull-ups,

- dips,

- handstand,

- ringvana,

- mobilitet,

- och prioriterad skill.

19.156 INGEN ONÖDIG TESTNING

GainPilot ska inte kräva att användaren testar maxkapacitet i varje ny domän.

Onboarding kan använda:

- historik,

- submaximala tester,

- självskattning,

- och progressiv kalibrering.

19.157 DOMÄNKALIBRERING

De första passen i en ny domän kan vara kalibreringspass.

Syftet är att:

- förstå nivå,

- testa modellens antaganden,

- och skapa säkrare progression.

Kalibrering ska inte döljas som vanligt maxprestandapass.

19.158 DOMÄNMINNE

GainPilot ska kunna lagra domänspecifika minnen.

Exempel:

CrossFit:

- preferred scaling,

- benchmarkhistorik,

- no-rep-mönster,

- och pacingpreferens.

Calisthenics:

- skillnivå,

- assistans,

- handledstolerans,

- och föredragna progressioner.

19.159 DELAT MINNE

Vissa minnen kan delas mellan domäner.

Exempel:

- generell utrustning,

- aktiv smärta,

- kalender,

- återhämtning,

- och övergripande mål.

Delningen ska gå genom Hermes.

19.160 DOMÄNISOLERING

Domänminnen ska inte automatiskt spridas till:

- andra användare,

- andra projekt,

- eller hela Atlas.

En CrossFit-coach ska inte få tillgång till full kost-, familje- eller Omnira-historik.

19.161 DOMÄNBYTEN

Användaren ska kunna:

- aktivera,

- pausa,

- och avsluta

en träningsdomän.

Att pausa CrossFit ska inte radera:

- benchmarkhistorik,

- scaling,

- eller skills.

19.162 HUVUDDOMÄN

Användaren ska kunna välja en aktuell huvuddomän.

Huvuddomänen kan påverka:

- dashboard,

- coachning,

- och programprioritering.

Den får inte radera andra mål.

19.163 SÄSONGSVIS DOMÄN

En domän kan vara aktiv endast under en period.

Exempel:

- löpning under sommaren,

- styrka under vintern,

- eller tävlingsförberedelse inför ett CrossFit-event.

GainPilot ska stödja säsongsplanering.

19.164 DOMÄNÖVERGÅNG

När användaren byter fokus ska GainPilot kunna skapa övergång.

Exempel:

Från hypertrofi till CrossFit:

- bevara styrka,

- introducera konditionsbelastning,

- kalibrera gymnastics,

- och minska olämplig dubbelvolym.

19.165 HISTORIK ÖVER DOMÄNER

GainPilot ska kunna visa användarens långsiktiga utveckling över flera träningsformer.

Systemet ska inte slå ihop inkompatibla mått.

Det kan visa:

- perioder,

- mål,

- och viktiga milstolpar.

19.166 IMPORT AV DOMÄNDATA

GainPilot ska kunna importera:

- CrossFit-loggar,

- workoutresultat,

- calisthenicsprogram,

- löphistorik,

- cykeldata,

- och annan domändata.

Importen ska följa Kapitel 11:s regler för:

- provenance,

- osäkerhet,

- och aktivering.

19.167 EXTERNA PLATTFORMAR

Integrationer ska ske genom adapterlager.

Externa system kan ha:

- egna workoutformat,

- egna scoremodeller,

- egna övningsnamn,

- och egna databegränsningar.

GainPilot ska inte direkt göra extern data canonical.

19.168 EXPORT

Användaren ska kunna exportera domändata.

Exempel:

CrossFit:

- workout,

- scaling,

- score,

- och standard.

Calisthenics:

- skill,

- progression,

- assistans,

- hålltid,

- och kvalitet.

19.169 PORTABILITET

Användaren ska kunna lämna GainPilot utan att förlora begriplig träningshistorik.

Proprietära domänfält ska dokumenteras i exporten.

19.170 OFFLINE

Domänens grundläggande passgenomförande ska kunna fungera offline.

CrossFit kan kräva:

- lokal timer,

- roundräkning,

- workoutstandard,

- och score.

Calisthenics kan kräva:

- progression,

- hålltimer,

- och teknikfokus.

19.171 SYNKRONISERING

Domänresultat ska synkroniseras idempotent.

Ett offlinegenomfört resultat ska inte:

- dupliceras,

- förlora scaling,

- eller skrivas över av tom serverdata.

19.172 KONFLIKTER

Vid konflikt ska GainPilot bevara:

- båda versionerna,

- källor,

- och användarens möjlighet att välja.

Tävlingsverifierat resultat ska inte tyst ersättas av en osäker automatisk logg.

19.173 OBSERVABILITY

Det ska gå att förstå:

- vilken domänmodell som användes,

- vilken workout- eller skillversion,

- vilken scaling,

- vilken säkerhetsregel,

- och vilken analysmodell.

19.174 AUDIT

Betydelsefulla händelser ska kunna auditeras.

Exempel:

- workoutstandard ändrades,

- resultat verifierades,

- scaling uppdaterades,

- skillstatus höjdes,

- ny domän aktiverades,

- eller domänmodell rullades tillbaka.

19.175 DOMÄNINCIDENT

En domänincident kan vara:

- fel score,

- fel scaling,

- osäker rörelse rekommenderad,

- felaktig standard,

- privat resultat exponerat,

- eller modell som blandar inkompatibla resultat.

Systemet ska kunna isolera den berörda domänen.

19.176 DOMÄNROLLBACK

GainPilot ska kunna återgå till tidigare:

- domänpaket,

- progressionsträd,

- workoutmodell,

- säkerhetsregel,

- eller analysversion.

Rollback får inte återaktivera känd risk.

19.177 TESTNING AV DOMÄNER

Varje domän ska ha:

- enhetstester,

- kontraktstester,

- scenariofall,

- säkerhetstester,

- integritetstester,

- och regressionstester.

19.178 CROSSFITTESTER

CrossFit-tester ska omfatta:

- AMRAP,

- EMOM,

- rounds for time,

- chipper,

- ladder,

- time cap,

- RX,

- scaled,

- foundations,

- no-rep,

- och flera scores.

19.179 CROSSFIT-SCALINGTESTER

Tester ska verifiera att scaling:

- bevarar stimulus där möjligt,

- följer användarens nivå,

- inte bryter säkerhet,

- och visas korrekt i resultatet.

19.180 CROSSFIT-JÄMFÖRELSETESTER

Systemet ska verifiera att:

- olika scaling inte rankas som identiska,

- ändrad standard synliggörs,

- och time cap-resultat bevarar slutförd progress.

19.181 CALISTHENICSTESTER

Tester ska omfatta:

- statisk hålltid,

- dynamisk skill,

- assistans,

- band,

- väggstöd,

- hävstång,

- ROM,

- tempo,

- och kvalitet.

19.182 PROGRESSIONSTRÄDSTESTER

Tester ska verifiera:

- prerequisites,

- parallella vägar,

- regressions,

- progression,

- och att användaren inte flyttas till olämpligt steg.

19.183 KVALITETSTESTER

Systemet ska verifiera att:

- längre hålltid med sämre position inte automatiskt räknas som bättre,

- ett enstaka lyckat försök inte blir stabil skill,

- och partials inte jämförs med full ROM.

19.184 DOMÄNÖVERSKRIDANDE TESTER

Tester ska omfatta:

- CrossFit plus styrka,

- calisthenics plus hypertrofi,

- löpning plus benstyrka,

- och flera samtidiga mål.

Systemet ska upptäcka olämplig dubbelbelastning.

19.185 MEDIETESTER

Domänmedia ska testas för:

- rätt rörelse,

- rätt variant,

- rätt standard,

- rätt progression,

- och biomekanisk rimlighet.

19.186 KAMERAANALYSTESTER

Tester ska omfatta:

- fel vinkel,

- delvis skymd kropp,

- dåligt ljus,

- flera personer,

- fel aktivitet,

- och låg modellkonfidens.

19.187 SÄKERHETSTESTER

Tester ska verifiera:

- stopp vid smärta,

- skydd vid teknisk nedgång,

- olämplig avancerad skill,

- osäker miljö,

- och konflikt med professionell instruktion.

19.188 INTEGRITETSTESTER

Tester ska verifiera:

- privata videos,

- coachdelning,

- boxdelning,

- leaderboards,

- domänminne,

- och Hermes-isolering.

19.189 OFFLINETESTER

Offline ska testas för:

- timer,

- roundräkning,

- score,

- progression,

- hålltid,

- och senare synkronisering.

19.190 EXPERTGRANSKNING

Domänens testsvit ska kompletteras med expertgranskning.

Tekniskt korrekta datamodeller kan fortfarande representera dålig träningspraktik.

19.191 SHADOW MODE

Ny domänintelligens ska kunna köras i shadow mode.

Den kan då:

- skapa programförslag,

- scaling,

- eller progression

utan att påverka användaren.

19.192 BEGRÄNSAD BETA

En domän kan lanseras till:

- intern användare,

- expertgrupp,

- eller begränsad beta.

Beta ska ha:

- tydliga begränsningar,

- feedbackkanal,

- stoppregel,

- och rollback.

19.193 CANARY-UTRULLNING

Nya domänregler ska kunna aktiveras gradvis.

Högriskrörelser ska inte vara första canaryområdet.

19.194 DOMÄNDRIFT

GainPilot ska övervaka om domänmodellen försämras när:

- regler ändras,

- nya aktiviteter tillkommer,

- användargruppen breddas,

- eller integrationsdata förändras.

19.195 PLATTFORMSANALYS

Atlas och Omnira ska kunna analysera:

- vilka domäner som används,

- var scaling misslyckas,

- vilka progressioner som överges,

- vilka importsätt som skapar fel,

- och var nya domänbehov uppstår.

Analysen ska använda minimerad data.

19.196 DOMÄNMETRIK

Relevanta produktmetrik kan vara:

- korrekt registrerade workoutresultat,

- scalingkorrigeringar,

- användarbekräftad skillstatus,

- domänspecifika säkerhetsstopp,

- och förståelse av domänpresentationen.

19.197 FRAMGÅNG FÖR DOMÄNSYSTEMET

Domänsystemet är framgångsrikt när:

- träningsformen representeras korrekt,

- användaren förstår planen,

- resultaten är jämförbara när de ska vara det,

- progressionen är säker,

- och plattformens gemensamma funktioner fortfarande fungerar.

19.198 KONTROLLERAD DOMÄNUTVECKLING

När Atlas identifierar en ny domän eller förbättring ska processen vara:

Signal

→ Behovsanalys

→ Domänavgränsning

→ Expertgranskning

→ Begreppsmodell

→ Säkerhetsmodell

→ Progressionsmodell

→ Datakontrakt

→ Godkänt scope

→ Separat branch

→ Implementation

→ Tester

→ Expertvalidering

→ Pull request

→ Shadow mode

→ Begränsad beta

→ Kontrollerad merge

→ Resultatuppföljning

Ingen agent får direkt:

- aktivera ny träningsdomän,

- publicera nya avancerade progressioner,

- ändra scalingregler,

- ändra tävlingsstandard,

- eller bredda säkerhetsmandat

utan denna process.

19.199 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för CrossFit, calisthenics och framtida träningsdomäner.

**Kontrakt GP-333 — Gemensam kärna, domänspecifik intelligens**

GainPilot ska återanvända gemensamma plattformsbegrepp men ge varje träningsdomän egna modeller, regler, säkerhetskrav och progressionssystem.

**Kontrakt GP-334 — Ingen förstörande universalmodell**

Ingen träningsdomän får tvingas in i set-, repetitions- och belastningsformat när dess faktiska struktur kräver andra begrepp.

**Kontrakt GP-335 — Versionerade domänpaket**

Varje träningsdomän ska ha identifierad version, stödnivå, datamodell, säkerhetsmodell, progression och teststatus.

**Kontrakt GP-336 — Domänkontext ska bevaras**

En aktivitet ska behålla sitt syfte och sin domän även när samma rörelse används inom flera träningsformer.

**Kontrakt GP-337 — CrossFit-workouts ska vara strukturerade**

AMRAP, EMOM, rounds for time, chipper, ladder, intervaller, time cap och score ska representeras som strukturerad canonical data.

**Kontrakt GP-338 — Scaling ska bevara stimulus**

CrossFit-scaling ska i första hand bevara workoutens avsedda tidsprofil, rörelsefunktion, intensitet och användarsäkerhet.

**Kontrakt GP-339 — RX och scaled ska vara explicita versioner**

Resultat får endast jämföras som likvärdiga när workoutversion, scaling, standard och scoreformat är kompatibla.

**Kontrakt GP-340 — Rörelsestandard ska versioneras**

CrossFit-standarder, tävlingskrav och no-rep-definitioner ska ha känd version och provenance.

**Kontrakt GP-341 — Score före global poäng**

CrossFit-resultat ska behålla sina domänspecifika scoreformat och får inte reduceras till en ogenomskinlig universell fitnesspoäng.

**Kontrakt GP-342 — Skills ska representeras som grafer**

Calisthenicsprogression ska använda prerequisites, parallella vägar, regressions, assistans och kvalitetskrav — inte endast linjära nivålistor.

**Kontrakt GP-343 — Kvalitet före svårighetsgrad**

En användare ska inte flyttas till svårare calisthenicsprogression enbart utifrån tid eller repetitionsantal utan bedömning av kontroll, stabilitet och säkerhet.

**Kontrakt GP-344 — Assistans ska ha metodkontext**

Band, vägg, partner, maskin och andra assistansformer ska lagras separat och inte jämföras som identiska nivåer.

**Kontrakt GP-345 — Ett lyckat försök är inte full behärskning**

Skillstatus ska kräva tillräcklig stabilitet och får inte höjas permanent efter ett enskilt lyckat försök.

**Kontrakt GP-346 — Domänspecifik substitution**

Substitutioner ska använda den aktiva domänens funktion, stimulus, progression, teknik och säkerhetsmodell.

**Kontrakt GP-347 — Domäninterferens ska analyseras**

När flera träningsformer kombineras ska GainPilot analysera konkurrerande belastning, återhämtning, teknik och prioritet.

**Kontrakt GP-348 — Ny domän kräver expertis**

En ny specialiserad träningsdomän får inte bli canonical utan relevant mänsklig expertgranskning och dokumenterad kunskapsprovenance.

**Kontrakt GP-349 — Domänkompetens ska deklareras**

Agenter, modeller och coachfunktioner ska uttryckligen ange vilka träningsdomäner och användarnivåer de är validerade för.

**Kontrakt GP-350 — Okänd aktivitet ska förbli okänd**

GainPilot får inte hallucinera klassificering, progression eller analys för en aktivitet som systemet inte förstår.

**Kontrakt GP-351 — Domänmedia kräver teknisk validering**

Animation, video och kameraanalys ska granskas mot domänens faktiska rörelse, standard och biomekanik.

**Kontrakt GP-352 — Domänspecifik säkerhet**

Varje träningsdomän ska definiera egna risker, miljökrav, utrustningskrav, stoppkriterier och professionella gränser.

**Kontrakt GP-353 — Domänminne ska isoleras**

CrossFit-, calisthenics- och andra domänminnen ska delas genom Hermes och får inte automatiskt spridas till andra projekt eller aktörer.

**Kontrakt GP-354 — Adapterbaserad utbyggnad**

Nya träningsdomäner och externa plattformar ska ansluta genom versionerade adapterkontrakt utan att bryta den gemensamma träningskärnan.

**Kontrakt GP-355 — Domänresultat ska vara portabla**

Användaren ska kunna exportera domänspecifik historik med begriplig struktur, enheter, standarder och provenance.

**Kontrakt GP-356 — Branch- och expertstyrd domänutveckling**

Nya domäner, progressioner, scalingregler, standarder och säkerhetsmodeller ska utvecklas på separat branch genom tester, expertgranskning, shadow mode och kontrollerad utrullning.

19.200 ANTI-PRINCIPER

GainPilot ska inte:

- behandla alla träningsformer som vanlig styrketräning,

- tvinga alla aktiviteter till set och repetitioner,

- reducera CrossFit till slumpmässig cirkelträning,

- reducera calisthenics till enkla kroppsviktsövningar,

- blanda workoutformat i fritext när de kan representeras strukturerat,

- lagra AMRAP-resultat som ett odefinierat decimaltal,

- ignorera time cap,

- radera ofullständig progress när time cap nås,

- jämföra RX och scaled som identiska resultat,

- behandla all scaling som samma kategori,

- beskriva foundations som misslyckat RX,

- skala en workout utan att förstå stimulus,

- byta rörelser endast utifrån liknande muskelgrupp,

- ignorera rörelsestandard,

- låta osäker AI ensam skapa no-reps,

- behandla komplexa lyft under trötthet som vanliga styrkeset,

- anta att en rörelse är säker i hög volym för att den klaras en gång,

- blanda olympiska lyft i workout och tävlingslyft som identisk kontext,

- reducera CrossFit-kapacitet till en enda poäng,

- kalla constantly varied för slumpmässig programmering,

- ignorera repetitions- och impactvolym,

- jämföra olika maskiners kalorier utan kontext,

- anta att obrutna set alltid är bäst,

- använda leaderboard som standard,

- dela workoutresultat automatiskt,

- ge box eller coach full åtkomst till användarprofilen,

- behandla bokad klass som genomförd träning,

- tvinga individuella mål under boxprogram utan analys,

- representera calisthenicsprogression som en enda linjär stege,

- anta att alla användare behöver samma progression,

- hoppa över prerequisites,

- bedöma skillberedskap från ett enda mått,

- räkna dålig hållposition som full kvalitetstid,

- höja skillstatus efter ett enskilt lyckat försök,

- jämföra olika assistansmetoder som samma nivå,

- anta att gummibandsfärg är standardiserad,

- blanda väggassisterat och fristående handstående,

- blanda partials och full ROM,

- behandla ringövning och stabil parallellbarsövning som identiska,

- flytta användaren till svårare progression endast på grund av hålltid,

- beskriva regression som misslyckande,

- lägga tekniskt krävande skills efter stor trötthet utan syfte,

- maximera försöksvolym när kvaliteten faller,

- blanda CrossFit- och calisthenicskontext för samma rörelse,

- använda en substitutionsmodell utan domänlogik,

- lägga till en ny träningsdomän som en lista med övningar,

- låta språkmodell vara enda domänexpert,

- använda forskning direkt i produktion utan granskning,

- skriva om historiska resultat när regler ändras,

- använda AI-rörelsevideo utan biomekanisk kontroll,

- använda samma kameraanalys för alla träningsformer,

- ge säkerhetsgaranti från ett foto,

- rekommendera avancerade rörelser utan erfarenhetsbedömning,

- kräva maxprov vid onboarding,

- sprida domänminnen till Atlas utan scope,

- radera historik när en domän pausas,

- slå samman inkompatibla resultat över domäner,

- direkt göra extern data canonical,

- eller implementera nya domäner direkt i main eller produktion utan branch, tester, expertgranskning och kontrollerad utrullning.

19.201 KANONISKA BESLUT FRÅN KAPITEL 19

Följande beslut etableras:

1. GainPilot ska ha en gemensam träningskärna.

2. Varje specialiserad träningsform ska ha domänspecifik intelligens.

3. Plattformens gemensamma kärna ska omfatta användare, mål, program, session, resultat, minne, säkerhet och governance.

4. Domänspecifika begrepp ska inte pressas in i en universell setmodell.

5. Varje träningsdomän ska ha stabil identitet.

6. Varje domän ska ha version och status.

7. GainPilot ska visa domänens faktiska stödnivå.

8. Domäner ska kunna distribueras som versionerade paket.

9. Domänpaket får inte ändra plattformens säkerhetskärna.

10. Aktivitet ska vara ett gemensamt överordnat begrepp.

11. Varje aktivitet ska ha domänspecifik typ.

12. En session ska kunna kombinera flera träningsdomäner.

13. Varje sessionsdel ska bevara sitt syfte och sin domän.

14. Ordningen mellan träningsdelar ska vara avsiktlig.

15. GainPilot ska analysera interferens mellan domäner.

16. Användaren ska kunna prioritera huvud- och sekundärdomäner.

17. GainPilot ska synliggöra målkonflikter.

18. CrossFit ska representeras som en full träningsdomän.

19. CrossFit-terminologi ska vara strukturerad och förklarbar.

20. Varumärken och officiellt innehåll ska hanteras med rättighetskontroll.

21. Varje workout ska ha stabil identitet.

22. Officiella, coachskapade, användarskapade och genererade workouts ska hållas isär.

23. Workoutformat ska vara strukturerade.

24. AMRAP ska lagra rundor och extra repetitioner separat.

25. EMOM ska lagra minutstruktur och arbetsmål.

26. Rounds for time ska bevara progress vid time cap.

27. Chippers ska representeras som ordnade arbetsblock.

28. Ladders ska representeras med strukturerade steg.

29. Couplets och triplets ska bevara rörelsernas relation.

30. Intervallworkouts ska kunna ha score per intervall.

31. Time cap ska vara ett explicit fält.

32. CrossFit ska stödja flera scoretyper.

33. En session ska kunna ha flera separata scores.

34. RX ska kräva definierad workoutversion och standard.

35. Scaled ska bevara exakt vad som ändrats.

36. Foundations ska vara en legitim egen version.

37. GainPilot ska kunna skapa individuell scaling.

38. Varje workout ska kunna ha avsett stimulus.

39. Scaling ska försöka bevara stimulus.

40. Rörelsestandarder ska vara versionerade.

41. No-reps ska kunna registreras med orsak och källa.

42. Rörelsekapacitet i utvilat tillstånd ska skiljas från kapacitet under trötthet.

43. Komplexa rörelser ska ha särskild programmeringslogik.

44. Olympiska lyft ska bevara kontext.

45. Skivstångskomplex ska vara strukturerade aktiviteter.

46. Gymnastiska komplex ska bevara övergångar.

47. Monostrukturella aktiviteter ska ha egna mått.

48. Maskinspecifik data ska bevaras.

49. Transitionstid ska kunna analyseras.

50. Pacing ska kunna planeras och följas.

51. Setuppdelning ska anpassas efter workoutens mål.

52. Arnold ska kunna ge workoutbrief före start.

53. Workoutgränssnittet ska förenklas under hög intensitet.

54. Automatisk roundräkning ska vara korrigerbar.

55. Röstregistrering under workout ska hantera osäkerhet.

56. Workoutresultat ska bevara scaling och standard.

57. Endast kompatibla CrossFit-resultat ska jämföras direkt.

58. CrossFit-progression ska vara flerdimensionell.

59. CrossFit-programmering ska balansera styrka, skills, gymnastik och kondition.

60. Variation ska vara programmerad och inte slumpmässig.

61. Träningsdos ska inkludera mer än duration.

62. Rörelseexponering ska följas.

63. Hög repetitionsvolym ska vara rörelsespecifik.

64. Impact ska kunna följas separat.

65. Kippingvolym ska kunna följas.

66. Grepp- och hudbelastning ska kunna rapporteras.

67. CrossFit ska ha domänspecifika säkerhetsregler.

68. Workouts ska kunna ha stoppkriterier.

69. Tävlingsläge ska skiljas från vanlig träning.

70. Leaderboards ska vara valbara och standardiserade.

71. Resultat ska vara privata som standard.

72. Box- och coachåtkomst ska vara explicit.

73. Klassbokning ska skiljas från genomförande.

74. Boxprogram och individuell plan ska kunna samordnas.

75. Calisthenics ska representeras som en full träningsdomän.

76. Calisthenics ska omfatta styrka, skills, balans, kontroll och mobilitet.

77. Varje skill ska ha stabil identitet.

78. Progressioner ska representeras som grafer.

79. Flera progressionsvägar ska kunna leda till samma skill.

80. Prerequisites ska vara strukturerade.

81. Skillberedskap ska bedömas genom flera signaler.

82. Statiska skills ska lagra hålltid, kvalitet och assistans.

83. Hålltid ska räknas inom godkänd position.

84. Kvalitetsgradering ska vara förklarbar.

85. Dynamiska skills ska bevara övergång och slutposition.

86. Skillförsök ska skiljas från lyckade stabila repetitioner.

87. Skillstatus ska ha flera nivåer.

88. Assistansmetoder ska hållas åtskilda.

89. Gummibandsdata ska ha metod- och produktkontext.

90. Väggassistans ska beskriva position och stödgrad.

91. Hävstångsvarianter ska vara explicit representerade.

92. Rörelseomfång ska kunna vara en progressionsdimension.

93. Tempo ska stödjas i calisthenicsmodellen.

94. Excentriska repetitioner ska kunna vara egen progression.

95. Partials ska hållas separata från full ROM.

96. Isometrisk träning ska bevara position och ledvinkel.

97. Ringträning ska representeras separat från stabila redskap.

98. Parallettes ska bevara utrustningskontext.

99. Grepp- och stångvariant ska påverka jämförbarhet.

100. Mobilitetsbehov ska kunna kopplas till skills.

101. Skillproblem ska inte alltid tolkas som generell styrkebrist.

102. Balans ska kunna följas separat.

103. Handstand ska ha egen domänmodell.

104. Plancheprogression ska bevara hävstång och redskap.

105. Front lever ska ha strukturerade progressionsvarianter.

106. Muscle-up ska skilja mellan bar, ring, strikt och kipping.

107. Avancerade ensidiga progressioner ska ha starkare säkerhetskontroll.

108. Calisthenicsprogrammering ska balansera skill, styrka, mobilitet och återhämtning.

109. Teknisk skillträning ska normalt placeras före stor trötthet.

110. Försöksvolym ska bedömas tillsammans med kvalitet.

111. Skills ska kunna stoppas när kvaliteten faller.

112. Calisthenicsprogression ska vara flerdimensionell.

113. Nästa progression ska kräva mer än ett tröskelvärde.

114. Regression ska vara en legitim träningsmetod.

115. Parallella progressioner ska kunna tränas samtidigt.

116. Supportövningar ska ha tydlig relation till skillen.

117. Skillöverföring ska beskrivas som möjlig relation.

118. Samma rörelse ska kunna ha olika syfte i olika domäner.

119. Substitution ska vara domänspecifik.

120. CrossFit-substitution ska bevara workoutstimulus.

121. Calisthenicssubstitution ska bevara skillfunktion.

122. Substitution mellan domäner ska visa kompromisser.

123. GainPilot ska kunna översätta träningsintention mellan domäner.

124. Nya träningsdomäner ska kunna anslutas utan att kärnan skrivs om.

125. Nya domäner ska använda adapterlager.

126. Powerlifting ska kunna få egen tävlingsmodell.

127. Olympisk tyngdlyftning ska kunna få egen lyft- och tävlingsmodell.

128. Löpning ska kunna få miljö-, distans- och tempomodell.

129. Cykling ska kunna få effekt- och terrängmodell.

130. Simning ska kunna få simsätts- och bassängmodell.

131. Triathlon ska behandlas som samordnad multidomänsport.

132. Klättring ska kunna få grad-, problem- och försöksmodell.

133. Kampsport ska kräva särskild säkerhetsgranskning.

134. Lagsport ska kunna samordnas med individuell belastning.

135. Rehabiliteringsnära funktioner ska kräva professionellt scope.

136. Agentbehörighet ska vara domänbegränsad.

137. Varje modell ska deklarera domänkompetens.

138. Okända aktiviteter ska kunna bevaras utan falsk analys.

139. Återkommande okända aktiviteter kan skapa domänkandidater.

140. Canonicalisering av ny domän ska kräva full granskningsprocess.

141. Specialiserade domäner ska ha mänsklig expertgranskning.

142. Domänregler ska ha kunskapsprovenance.

143. Research ska inte direkt ändra produktionen.

144. Regeluppdateringar ska versioneras.

145. Domänmedia ska anpassas efter träningsformens behov.

146. Animation ska inte betraktas som full teknikvalidering.

147. AI-rörelsevideo ska biomekaniskt granskas.

148. Kameraanalys ska vara domänspecifik.

149. Kameravinkel ska påverka analysens giltighet.

150. AI ska inte ensam avgöra officiella tävlingsresultat.

151. Varje domän ska ha egen säkerhetsmodell.

152. Miljökrav ska kunna beskrivas.

153. Utrustningssäkerhet ska behandlas försiktigt.

154. Erfarenhetsnivå ska påverka tillgängliga funktioner.

155. Nya domäner ska ha introduktionsflöde.

156. CrossFit och calisthenics ska ha domänspecifik onboarding.

157. Onboarding ska inte kräva onödiga maxprov.

158. De första passen kan användas för kalibrering.

159. Domänspecifika minnen ska kunna lagras.

160. Delade minnen ska gå genom Hermes.

161. Domänminnen ska vara isolerade.

162. Användaren ska kunna pausa och återaktivera domäner.

163. Huvuddomän ska kunna väljas.

164. Domäner ska kunna vara säsongsaktiva.

165. GainPilot ska stödja övergång mellan träningsformer.

166. Historik ska kunna visas över flera domäner utan falska jämförelser.

167. Domändata ska kunna importeras med provenance.

168. Externa plattformar ska integreras genom adaptrar.

169. Användaren ska kunna exportera domänhistorik.

170. Domändata ska vara portabel.

171. Grundläggande domänfunktioner ska fungera offline.

172. Synkronisering ska vara idempotent.

173. Konflikter ska bevara båda versionerna.

174. Domänbeslut ska vara observerbara.

175. Betydelsefulla domänhändelser ska kunna auditeras.

176. Domänincidenter ska kunna isoleras.

177. Domänpaket ska kunna återställas.

178. Varje domän ska ha en full testsvit.

179. CrossFitformat och scoremodeller ska testas.

180. Scaling ska testas mot stimulus och säkerhet.

181. Inkompatibla resultat ska inte jämföras.

182. Calisthenicsassistans och progression ska testas.

183. Progressionsträd ska testas.

184. Kvalitet ska kunna övertrumfa kvantitet.

185. Multidomänprogram ska testas för interferens.

186. Domänmedia och kameraanalys ska testas.

187. Säkerhets- och integritetskrav ska testas.

188. Offline och synkronisering ska testas.

189. Domäner ska expertgranskas.

190. Ny intelligens ska kunna köras i shadow mode.

191. Domäner ska kunna lanseras i begränsad beta.

192. Canary-utrullning ska användas.

193. Domändrift ska övervakas.

194. Atlas ska kunna identifiera domänbehov genom minimerad analys.

195. Domänframgång ska mätas genom korrekt representation och användbarhet.

196. Nya domäner ska utvecklas på separat branch.

197. Implementationen ska genomgå tester och expertvalidering.

198. Utrullningen ska vara begränsad och återställningsbar.

199. Agentautonomi inom en domän ska vara explicit och återkallelig.

200. GainPilot ska kunna växa till en multidomänplattform utan att offra träningsformernas verkliga struktur.

19.202 IMPLEMENTERINGSORDNING

GainPilots CrossFit-, calisthenics- och domänarkitektur ska implementeras stegvis.

Fas 1 — Gemensam domänkärna

Implementera:

- domänidentitet,

- domänversion,

- status,

- stödnivå,

- aktivitetstyp,

- sessionsdel,

- resultattyp,

- och domänadapter.

Fas 2 — Multidomänsessioner

Implementera:

- flera domäner i samma pass,

- ordning,

- syfte,

- planerad tid,

- och separat resultatmodell.

Fas 3 — CrossFit-workoutmodell

Implementera:

- workoutidentitet,

- källa,

- format,

- rörelser,

- repetitioner,

- rounds,

- duration,

- time cap,

- och scoretyp.

Fas 4 — Grundläggande CrossFitformat

Implementera:

- AMRAP,

- EMOM,

- rounds for time,

- chipper,

- ladder,

- intervaller,

- couplet,

- och triplet.

Fas 5 — CrossFit-scaling

Implementera:

- RX,

- scaled,

- foundations,

- individuell version,

- scalingorsak,

- och exakt förändringshistorik.

Fas 6 — Stimulusmodell

Implementera:

- tidsprofil,

- avsedd intensitet,

- setuppdelning,

- rörelsefunktion,

- och scalingvalidering.

Fas 7 — Rörelsestandarder

Implementera:

- startposition,

- slutposition,

- ROM,

- standardversion,

- no-rep,

- och källprovenance.

Fas 8 — CrossFit-genomförande

Implementera:

- workoutbrief,

- timer,

- roundräkning,

- repetitionsregistrering,

- time cap,

- och slutscore.

Fas 9 — CrossFit-analys

Implementera:

- pacing,

- transitions,

- jämförbara resultat,

- benchmarkhistorik,

- skillprogression,

- och belastning.

Fas 10 — CrossFit-säkerhet

Implementera:

- erfarenhetsnivå,

- rörelser under trötthet,

- repetitionsvolym,

- impact,

- kipping,

- stoppkriterier,

- och säkerhetsfeedback.

Fas 11 — Calisthenics-skillmodell

Implementera:

- skillidentitet,

- skillstatus,

- progression,

- regression,

- prerequisite,

- assistans,

- och kvalitet.

Fas 12 — Progressionsgraf

Implementera:

- noder,

- relationer,

- parallella vägar,

- stödövningar,

- readiness,

- och exitkriterier.

Fas 13 — Statiska skills

Implementera:

- hålltid,

- kvalitetsstatus,

- position,

- hävstång,

- assistans,

- och antal försök.

Fas 14 — Dynamiska skills

Implementera:

- start,

- övergång,

- slutposition,

- repetition,

- kvalitet,

- och stabilitetsstatus.

Fas 15 — Calisthenicsutrustning

Implementera:

- ringar,

- räcke,

- parallettes,

- vägg,

- band,

- box,

- och greppvariation.

Fas 16 — Calisthenicsprogrammering

Implementera:

- skillträning,

- styrka,

- supportövningar,

- mobilitet,

- försöksvolym,

- kvalitetsstopp,

- och återhämtning.

Fas 17 — Domänspecifik substitution

Implementera:

- CrossFit-stimulus,

- calisthenics-skillfunktion,

- domänöverskridande byten,

- kompromissbeskrivning,

- och användargodkännande.

Fas 18 — Multidomänbelastning

Implementera:

- domänprioritet,

- interferens,

- rörelseexponering,

- impact,

- grepp,

- tekniktrötthet,

- och återhämtningskonflikt.

Fas 19 — Domänmedia

Implementera:

- domänspecifika instruktioner,

- expertgranskad video,

- animation,

- standardpresentation,

- och progressionsexempel.

Fas 20 — Kameraanalys

Implementera först efter särskild validering:

- stödda rörelser,

- kameravinkel,

- konfidens,

- användarkorrigering,

- och förbud mot ensam tävlingsbedömning.

Fas 21 — Box- och coachfunktioner

Implementera:

- klassprogram,

- bokning,

- vald resultatdelning,

- scalingförslag,

- coachfeedback,

- och tidsbegränsad åtkomst.

Fas 22 — Offline och synkronisering

Implementera:

- workouttimer,

- roundräkning,

- skilltimer,

- lokal registrering,

- idempotent synk,

- och konfliktlösning.

Fas 23 — Domänregister

Implementera:

- aktiva domäner,

- versioner,

- stödnivåer,

- modeller,

- expertägare,

- teststatus,

- och kända begränsningar.

Fas 24 — Ny domänpipeline

Implementera:

- domänkandidat,

- behovsanalys,

- expertgranskning,

- modellskapande,

- adapter,

- testbibliotek,

- shadow mode,

- och beta.

Fas 25 — Framtida prioriterade domäner

Utvärdera i ordning efter användarbehov:

- powerlifting,

- olympisk tyngdlyftning,

- löpning,

- cykling,

- simning,

- triathlon,

- klättring,

- och andra områden.

Fas 26 — Full domängovernance

Implementera:

- kunskapsprovenance,

- expertregister,

- regelversionering,

- säkerhetsrevision,

- incidenthantering,

- rollback,

- och kontrollerad avpublicering.

Varje fas ska levereras genom:

- definierat scope,

- separat branch,

- implementation,

- enhets- och kontraktstester,

- domänspecifika scenariotester,

- säkerhetsgranskning,

- integritetsgranskning,

- mediegranskning,

- expertvalidering,

- pull request,

- shadow mode,

- begränsad beta,

- kontrollerad merge,

- och resultatuppföljning.

19.203 FRAMGÅNGSKRITERIER

Kapitel 19:s vision är framgångsrikt realiserad när:

- GainPilot kan stödja flera träningsformer utan separata isolerade produkter,

- den gemensamma träningskärnan återanvänds,

- domänspecifika begrepp inte förloras,

- aktiviteter kan tillhöra rätt domän,

- en session kan kombinera flera träningsformer,

- målkonflikter mellan domäner synliggörs,

- CrossFit-workouts representeras strukturerat,

- AMRAP, EMOM, rounds for time, chippers och ladders fungerar,

- time cap-resultat bevarar faktisk progress,

- flera scoretyper kan användas,

- RX och scaled hålls åtskilda,

- exakt scalinghistorik bevaras,

- foundations behandlas som giltig workoutversion,

- scaling försöker bevara stimulus,

- rörelsestandarder är versionerade,

- no-reps kan registreras och korrigeras,

- workoutgenomförandet fungerar under hög intensitet,

- roundräkning kan ske utan onödig friktion,

- pacing och setuppdelning kan planeras,

- CrossFit-resultat endast jämförs när de är kompatibla,

- CrossFit-progression visas i flera dimensioner,

- programmering är varierad men inte slumpmässig,

- repetitions-, impact- och kippingvolym kan följas,

- säkerhetskriterier prioriteras framför score,

- tävlingsresultat skiljs från vanlig träning,

- leaderboard är valbar,

- box- och coachdelning är explicit,

- calisthenics representeras genom riktiga skillmodeller,

- varje skill har stabil identitet,

- progressioner representeras som grafer,

- olika användare kan använda olika vägar,

- prerequisites och readiness finns,

- statiska skills bevarar hålltid och kvalitet,

- dynamiska skills bevarar övergångar,

- ett lyckat försök inte automatiskt blir full behärskning,

- assistansmetod och nivå bevaras,

- hävstång och ROM kan användas som progression,

- ringar, parallettes, räcken och väggstöd skiljs åt,

- skillträning kan stoppas vid kvalitetsfall,

- regression behandlas som legitim metod,

- supportövningar kopplas till tydligt behov,

- CrossFit- och calisthenicskontext för samma rörelse hålls åtskilda,

- substitution följer aktiv domän,

- multidomäninterferens analyseras,

- nya träningsdomäner kan anslutas genom adapterlager,

- okända aktiviteter inte får påhittad analys,

- nya domäner kräver expertgranskning,

- kunskapskällor är spårbara,

- regeländringar inte skriver om historiken,

- media är domänspecifikt validerad,

- AI-genererade rörelsevideor inte publiceras utan biomekanisk kontroll,

- kameraanalys använder rätt domän och vinkel,

- varje domän har egna säkerhetsregler,

- onboarding och kalibrering är domänspecifik,

- domänminnen är isolerade genom Hermes,

- användaren kan pausa en domän utan dataförlust,

- domändata kan importeras och exporteras,

- grundfunktioner fungerar offline,

- synkronisering inte skapar dubbletter,

- domänmodeller är observerbara och auditerbara,

- domänincidenter kan isoleras,

- domänpaket kan återställas,

- nya domäner kan köras i shadow mode,

- och alla domänförändringar genomförs genom separat branch, tester, expertgranskning och kontrollerad utrullning.

19.204 SAMMANFATTNING

GainPilot ska kunna växa från en tränings- och kostplattform till ett intelligent multidomänsystem.

Det innebär inte att alla träningsformer ska behandlas likadant.

En gemensam plattform ska ge användaren:

- samma identitet,

- samma kalender,

- samma coach,

- samma minnesskydd,

- samma säkerhetsgrund,

- och samma långsiktiga historik.

Men varje träningsform ska få sin egen intelligens.

CrossFit kräver modeller för:

- workouts,

- rounds,

- AMRAP,

- EMOM,

- time cap,

- scaling,

- RX,

- movement standards,

- pacing,

- no-reps,

- och flera scoretyper.

En CrossFit-workout får inte reduceras till en lista med övningar.

GainPilot ska förstå:

- workoutens format,

- avsedda stimulus,

- rörelsernas relation,

- hur resultatet registreras,

- och hur workouten bör skalas.

Scaling ska inte endast göra rörelsen enklare.

Den ska försöka bevara:

- tidsprofil,

- intensitet,

- rörelsefunktion,

- och workoutupplevelse

inom användarens säkra kapacitet.

RX, scaled och foundations ska vara tydliga versioner.

Ett scaled-resultat är inte mindre giltigt.

Det är ett annat resultat med annan standard.

Jämförelser ska därför använda:

- samma workoutversion,

- kompatibel scaling,

- samma scoretyp,

- och relevant rörelsestandard.

Calisthenics kräver en annan modell.

Där kan progression ske genom:

- minskad assistans,

- förbättrad kroppslinje,

- större rörelseomfång,

- längre kvalitativ hålltid,

- svårare hävstång,

- fler kontrollerade repetitioner,

- och stabilare utförande.

Progressionen ska representeras som en graf.

Det ska finnas:

- prerequisites,

- regressioner,

- parallella vägar,

- supportövningar,

- och flera möjliga progressioner.

Alla användare behöver inte följa samma väg.

Ett enda lyckat handstående, muscle-up eller front lever-försök ska inte automatiskt betyda att färdigheten är stabil.

GainPilot ska skilja mellan:

- försök,

- enstaka framgång,

- stabil prestation,

- och konsekvent behärskning.

Kvalitet ska kunna väga tyngre än:

- tid,

- repetitioner,

- och svårighetsgrad.

En längre hålltid med sämre position ska inte automatiskt klassificeras som bättre.

Regression ska vara ett legitimt val.

Den kan användas för:

- teknik,

- volym,

- återstart,

- trötthet,

- och säkerhet.

CrossFit och calisthenics kan dela rörelser.

En muscle-up kan exempelvis vara:

- en teknisk skill,

- ett styrkemål,

- eller en högrepetitiv workoutrörelse.

GainPilot ska därför alltid bevara aktivitetens syfte och domän.

Substitution ska också vara domänspecifik.

I CrossFit ska bytet försöka bevara workoutens stimulus.

I calisthenics ska bytet bevara skillens progression och tekniska funktion.

När ett byte sker mellan domäner ska Arnold kunna förklara:

- vad som bevaras,

- vad som förändras,

- och vilken kompromiss användaren accepterar.

GainPilot ska senare kunna stödja fler domäner.

Exempel:

- powerlifting,

- olympisk tyngdlyftning,

- löpning,

- cykling,

- simning,

- triathlon,

- klättring,

- kampsport,

- och lagsport.

Varje ny domän ska anslutas genom en adapter.

Den ska ha:

- stabil identitet,

- version,

- status,

- stödnivå,

- datamodell,

- progression,

- säkerhet,

- media,

- testbibliotek,

- och expertägare.

GainPilot ska inte kalla en domän fullständigt stödd när den endast kan registrera grunddata.

Stödnivån ska vara tydlig.

Nya domäner ska utvecklas med relevant mänsklig expertis.

En språkmodell kan hjälpa till att:

- strukturera kunskap,

- generera testfall,

- formulera instruktioner,

- och identifiera luckor.

Den får inte vara enda auktoritet för:

- avancerad gymnastik,

- olympiska lyft,

- tävlingsstandard,

- rehabilitering,

- eller annan högriskträning.

Atlas ska kunna hjälpa till att:

- upptäcka nya behov,

- följa forskning,

- analysera domänproblem,

- och föreslå förbättringar.

Atlas får inte direkt:

- publicera en ny domän,

- ändra scaling,

- eller bredda en agents kompetens.

Hermes ska kontrollera hur domänminnen delas.

En CrossFit-coach kan behöva se:

- workoutresultat,

- scaling,

- skills,

- och användarens feedback.

Coachen behöver normalt inte se:

- full kosthistorik,

- privata Omnira-samtal,

- familjedata,

- eller andra projekt.

Alla förändringar av:

- domänmodell,

- workoutformat,

- progressionsträd,

- scalingregler,

- rörelsestandarder,

- kameraanalys,

- och säkerhetslogik

ska ske genom:

- definierat scope,

- separat branch,

- implementation,

- tester,

- säkerhetsgranskning,

- integritetsgranskning,

- mediegranskning,

- domänexpertens validering,

- pull request,

- shadow mode,

- begränsad beta,

- kontrollerad merge,

- och resultatuppföljning.

Kapitel 19 etablerar därmed följande kärnprincip:

GainPilot ska inte bli en generisk träningsapp som råkar innehålla många övningar. Plattformen ska bli ett gemensamt intelligent träningssystem där varje domän representeras på sina egna villkor — med rätt struktur, rätt progression, rätt säkerhet och rätt expertis — samtidigt som användaren behåller en sammanhängande coach, historik och plan över hela sin träningsresa.
