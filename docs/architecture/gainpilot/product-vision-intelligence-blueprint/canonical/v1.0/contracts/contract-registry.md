# Kontraktsregister — GainPilot — Product Vision & Intelligence Blueprint

**Version:** v1.0  ·  **Status:** Canonical Review Candidate  ·  **Antal kontrakt:** 690  ·  **Serie:** GP-1–GP-690

Registret listar samtliga canonical-kontrakt i kapitelordning. Kontrakts-ID, kontraktstitel och kontraktstext återges exakt enligt de verifierade kapitelkällorna och är canonical. **Kategori är derived classification / non-canonical metadata** (nyckelordsbaserad) och påverkar inte kontraktens ID, titel eller text.

## Kategorifördelning

| Kategori | Antal |
|---|---|
| training | 155 |
| agent | 108 |
| nutrition | 78 |
| product | 70 |
| memory | 64 |
| data | 54 |
| safety | 51 |
| authority | 41 |
| governance | 25 |
| security | 10 |
| operations | 10 |
| privacy | 8 |
| roadmap | 5 |
| compliance | 4 |
| commercial | 4 |
| domain | 3 |
| **Totalt** | **690** |

## Kontrakt

### Kapitel 1 — GainPilots uppdrag

**GP-1 — Användarrelation**  
*Kategori (derived/non-canonical): agent · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnold ska vara GainPilots primära användarnära coach. Interna agenter och system får stödja Arnold utan att skapa en fragmenterad användarupplevelse.

**GP-2 — Central intelligens**  
*Kategori (derived/non-canonical): memory · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Atlas ska fungera som den övergripande intelligensen bakom Arnold. Arnold ska kunna använda Atlas för bredare resonemang, minne, research och samordning.

**GP-3 — Minnesisolering**  
*Kategori (derived/non-canonical): training · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilots minnesdomän ska vara isolerad från andra användare och andra Omnira-projekt. Ingen agent får använda irrelevant eller obehörig projektdata för att personanpassa GainPilot.

**GP-4 — Förklarbar anpassning**  
*Kategori (derived/non-canonical): training · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Varje betydelsefull automatisk förändring av användarens upplägg ska kunna förklaras.

**GP-5 — Valbar kontroll**  
*Kategori (derived/non-canonical): product · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Användaren ska kunna välja hur mycket GainPilot får ändra automatiskt.

**GP-6 — Sammanhängande planering**  
*Kategori (derived/non-canonical): nutrition · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Träning, kost, aktivitet, progression och återhämtning ska behandlas som delar av samma planeringsproblem.

**GP-7 — Kontrollerad research**  
*Kategori (derived/non-canonical): safety · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Extern information ska bedömas utifrån källkvalitet, aktualitet, relevans och osäkerhet innan den används.

**GP-8 — Kontrollerad produktutveckling**  
*Kategori (derived/non-canonical): agent · Sektion: 1.18 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Alla kodförändringar som initieras av Atlas eller andra agenter ska ske på en separat branch och genom en verifierad PR- och mergeprocess.

### Kapitel 2 — Problemet GainPilot löser

**GP-9 — Kontext före rekommendation**  
*Kategori (derived/non-canonical): safety · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot får inte skapa en personlig rekommendation utan tillräcklig relevant kontext. När kontexten är otillräcklig ska systemet fråga, begränsa rådet eller tydligt beskriva osäkerheten.

**GP-10 — Helhetsanalys**  
*Kategori (derived/non-canonical): nutrition · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Betydelsefulla förändringar av träning, kost eller aktivitet ska bedömas utifrån konsekvenserna för användarens samlade upplägg.

**GP-11 — Verkligheten är en del av modellen**  
*Kategori (derived/non-canonical): data · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Återkommande avvikelser ska kunna behandlas som signaler om att planen behöver förändras. Systemet får inte automatiskt tolka alla avvikelser som bristande motivation.

**GP-12 — Meningsfull valfrihet**  
*Kategori (derived/non-canonical): product · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot ska prioritera ett begränsat antal relevanta alternativ framför långa, osorterade listor.

**GP-13 — Mönster före överreaktion**  
*Kategori (derived/non-canonical): safety · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot ska som huvudregel kräva ett tillräckligt mönster eller tydlig risk innan större förändringar genomförs.

**GP-14 — Förklaring före förtroende**  
*Kategori (derived/non-canonical): training · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Betydelsefulla rekommendationer och förändringar ska kunna förklaras på en nivå som passar användaren.

**GP-15 — Externt innehåll kräver granskning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Program, övningar, kostråd och annan information från externa källor ska granskas, normaliseras och anpassas innan de används.

**GP-16 — Personalisering över tid**  
*Kategori (derived/non-canonical): memory · Sektion: 2.23 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot ska förbättra sin användarmodell genom tillåtna och relevanta observationer över tid. En onboardingprofil får inte behandlas som en fullständig och permanent bild av användaren.

### Kapitel 3 — Arnold och den personliga coachupplevelsen

**GP-17 — En konsekvent coachrelation**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnold ska vara GainPilots primära och konsekventa användarnära coach. Interna modeller, agenter och tjänster får inte skapa motstridiga personligheter eller regler.

**GP-18 — Atlas bakom, Arnold framför**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Atlas ska ge Arnold bredare intelligens. Arnold ska normalt vara den som kommunicerar beslutet till användaren.

**GP-19 — Domänstyrd coachning**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnolds svar och handlingar ska förankras i GainPilots domänmodeller, säkerhetsregler och användarkontext.

**GP-20 — Anpassningsbar ton, stabil säkerhet**  
*Kategori (derived/non-canonical): training · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnolds kommunikationsstil får anpassas. Säkerhetsgränser, ärlighet och faktiska beslutskriterier får inte anpassas bort.

**GP-21 — Relevant proaktivitet**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnold får agera proaktivt när det finns ett rimligt användarvärde och rätt behörighet. Proaktivitet får inte skapa onödigt brus eller upplevelse av övervakning.

**GP-22 — Osäkerhet ska uttryckas**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnold ska skilja mellan fakta, tolkning, hypotes och rekommendation.

**GP-23 — Ingen kritisk gissning**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

När viktig kontext saknas ska Arnold fråga, begränsa rekommendationen eller avstå.

**GP-24 — Historik och återställning**  
*Kategori (derived/non-canonical): product · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Betydelsefulla automatiska ändringar ska kunna spåras, förklaras och återställas.

**GP-25 — Professionella gränser**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnold får inte framställa GainPilot som ersättning för professionell vård eller ge råd utanför plattformens mandat.

**GP-26 — Användarkontroll**  
*Kategori (derived/non-canonical): agent · Sektion: 3.39 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Arnolds handlingar ska följa användarens valda kontrollnivå och tillämpliga approvalkrav.

### Kapitel 4 — Målgrupper och användarbehov

**GP-27 — Gemensamt fundament, anpassad upplevelse**  
*Kategori (derived/non-canonical): training · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot ska använda ett gemensamt plattformsfundament men anpassa upplevelse, planering och coachning efter användarens domän och behov.

**GP-28 — Ingen global erfarenhetsnivå**  
*Kategori (derived/non-canonical): training · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Användarens erfarenhet ska kunna representeras per träningsdomän och vid behov per färdighet.

**GP-29 — Kombinerade mål kräver prioritering**  
*Kategori (derived/non-canonical): data · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

När användaren har flera mål ska GainPilot definiera deras prioritet och analysera konflikter.

**GP-30 — Praktiska begränsningar är planeringsdata**  
*Kategori (derived/non-canonical): nutrition · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Tid, utrustning, vardag och kostpraktik ska behandlas som verkliga krav i planen.

**GP-31 — Preferens är inte säkerhetsbegränsning**  
*Kategori (derived/non-canonical): security · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan personlig preferens, praktisk begränsning och säkerhetsrelaterad begränsning.

**GP-32 — Progressiv komplexitet**  
*Kategori (derived/non-canonical): product · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Nybörjare ska kunna använda GainPilot utan att exponeras för onödig komplexitet. Avancerade användare ska kunna få större kontroll och insyn.

**GP-33 — Segmentering får inte låsa användaren**  
*Kategori (derived/non-canonical): memory · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Målgruppssegment ska vägleda personalisering men får inte förhindra användaren från att kombinera domäner eller förändras över tid.

**GP-34 — Aktuell användarvilja har företräde**  
*Kategori (derived/non-canonical): memory · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Historiskt minne och observerade mönster får inte tyst ersätta användarens aktuella uttryckta mål och beslut.

**GP-35 — Personalisering ska kunna korrigeras**  
*Kategori (derived/non-canonical): memory · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Användaren ska kunna se, ändra och ta bort viktiga profiluppgifter som påverkar GainPilots beslut.

**GP-36 — Målgruppsinsikter ska bli produktkrav**  
*Kategori (derived/non-canonical): governance · Sektion: 4.38 Arkitekturkontrakt · v1.0 · Canonical Review Candidate*  

Identifierade användarbehov ska kunna översättas till konkreta kapabiliteter, tester och framgångskriterier.

### Kapitel 5 — GainPilots produktprinciper och anti-principer

**GP-37 — Verkligt användarvärde**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje större funktion ska kunna kopplas till ett definierat användarbehov och ett verifierbart resultat.

**GP-38 — Genomförbar planering**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska optimera för ett upplägg som användaren rimligen kan genomföra, inte endast ett teoretiskt optimalt upplägg.

**GP-39 — Intelligens minskar friktion**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

AI och automatik ska minska planerings-, besluts- eller registreringsbördan. De får inte skapa mer arbete än de ersätter utan tydligt mervärde.

**GP-40 — Progressiv komplexitet**  
*Kategori (derived/non-canonical): data · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kärnupplevelsen ska vara enkel. Djupare data, analys och kontroll ska kunna öppnas av användare som behöver det.

**GP-41 — Förklarbar och reversibel automatik**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla automatiska beslut ska kunna förklaras, spåras och återställas.

**GP-42 — Syftesbegränsad kontext**  
*Kategori (derived/non-canonical): agent · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold och Atlas får endast använda kontext som är relevant, tillåten och proportionerlig mot uppgiften.

**GP-43 — Kontrollerat minne**  
*Kategori (derived/non-canonical): memory · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Viktiga minnesposter ska kunna granskas, korrigeras och tas bort av användaren.

**GP-44 — Helhetsbedömning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla ändringar inom träning, kost eller aktivitet ska analyseras i relation till användarens samlade plan.

**GP-45 — Stabilitet före förändring**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En fungerande plan ska inte ändras utan ett tillräckligt skäl.

**GP-46 — Kvalitetskontrollerat innehåll**  
*Kategori (derived/non-canonical): nutrition · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningar, program, kostunderlag, videor och externa källor ska granskas innan de blir canonical eller används för personliga rekommendationer.

**GP-47 — Professionella gränser**  
*Kategori (derived/non-canonical): nutrition · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska tydligt skilja mellan tränings- och kostvägledning och professionell medicinsk eller vårdrelaterad bedömning.

**GP-48 — Användarägd korrigering**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna korrigera de viktiga profiluppgifter och antaganden som påverkar GainPilots beslut.

**GP-49 — Branchbaserad utveckling**  
*Kategori (derived/non-canonical): governance · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kodförändringar ska genomföras på separat branch och följa test-, PR-, review- och mergeprocess.

**GP-50 — Begränsad autonomi**  
*Kategori (derived/non-canonical): agent · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agentmandat ska vara explicita, avgränsade, spårbara, återkalleliga och kopplade till risknivå.

**GP-51 — Ärlig produktstatus**  
*Kategori (derived/non-canonical): product · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska tydligt skilja mellan experimentellt, begränsat och fullt produktionsstöd.

**GP-52 — Ingen manipulativ design**  
*Kategori (derived/non-canonical): operations · Sektion: 5.48 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte använda skuld, rädsla, falsk brådska eller artificiell inlåsning för att driva användarbeteende eller intäkter.

### Kapitel 6 — Onboarding och den kanoniska användarmodellen

**GP-53 — Progressiv onboarding**  
*Kategori (derived/non-canonical): product · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska samla den minsta information som krävs för ett säkert första värde och komplettera profilen när ytterligare kontext blir relevant.

**GP-54 — Frågor kräver syfte**  
*Kategori (derived/non-canonical): security · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje onboardingfråga ska kunna kopplas till ett definierat användarvärde, säkerhetsbehov eller planeringsbeslut.

**GP-55 — Tidigt användarvärde**  
*Kategori (derived/non-canonical): product · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Onboardingen ska skapa begripligt värde innan hela den långsiktiga profilen är komplett.

**GP-56 — Strukturerad målmodell**  
*Kategori (derived/non-canonical): product · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Mål ska representeras med prioritet, tidsperiod, mätetal, konflikter och relation till andra mål.

**GP-57 — Domänspecifik erfarenhet**  
*Kategori (derived/non-canonical): training · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Erfarenhet ska modelleras per träningsdomän och vid behov per färdighet.

**GP-58 — Nuläge före gammal historik**  
*Kategori (derived/non-canonical): safety · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktuell bekräftad kontext ska normalt väga tyngre än äldre historisk information vid planering.

**GP-59 — Praktiska förutsättningar är canonical data**  
*Kategori (derived/non-canonical): nutrition · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tillgängliga dagar, tid, utrustning och kostpraktik ska påverka den aktiva planen.

**GP-60 — Säkerhetsbegränsningar ska särskiljas**  
*Kategori (derived/non-canonical): security · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Allergier, smärta och andra säkerhetsrelaterade begränsningar ska skiljas från vanliga preferenser.

**GP-61 — Granulär kontroll**  
*Kategori (derived/non-canonical): safety · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarens kontrollnivå ska kunna tillämpas per kapabilitet och riskklass.

**GP-62 — Behörighetsstyrd Atlas-kontext**  
*Kategori (derived/non-canonical): memory · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Information från Atlas eller andra Omnira-domäner får endast användas genom Hermes, rätt syfte och tillämpligt användargodkännande.

**GP-63 — Provenance för användaruppgifter**  
*Kategori (derived/non-canonical): security · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Viktiga uppgifter ska kunna kopplas till källa, tidpunkt, säkerhetsnivå och giltighet.

**GP-64 — Inferens är inte fakta**  
*Kategori (derived/non-canonical): product · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Systeminferenser ska markeras som inferenser och får inte behandlas som användarbekräftade fakta.

**GP-65 — Tidsbegränsad information ska löpa ut**  
*Kategori (derived/non-canonical): training · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tillfälliga begränsningar och kontexter ska ha giltighetstid eller omprövningspunkt.

**GP-66 — Användarkorrigering**  
*Kategori (derived/non-canonical): product · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna se och korrigera de uppgifter som påverkar GainPilots beslut.

**GP-67 — Canonical användarmodell**  
*Kategori (derived/non-canonical): agent · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilots agenter och funktioner ska använda en gemensam styrd användarmodell och får inte skapa okontrollerade parallella profiler.

**GP-68 — Första planen är kalibrerbar**  
*Kategori (derived/non-canonical): training · Sektion: 6.51 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det första upplägget ska presenteras som ett förklarat och anpassningsbart förslag, inte som en slutgiltig sanning.

### Kapitel 7 — Träningsintelligens

**GP-69 — Träning som sammanhängande system**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska behandla program, pass, övningar, progression, återhämtning och resultat som delar av samma träningsmodell.

**GP-70 — Syftesstyrd programmering**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje program och betydelsefull programdel ska kunna kopplas till ett definierat mål eller planeringsbehov.

**GP-71 — Regelstyrd programgenerering**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Personliga program ska skapas genom canonical träningsregler och strukturerad användarkontext, inte genom fri språkmodellsgenerering ensam.

**GP-72 — Domänspecifik intelligens**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Styrketräning, hypertrofi, CrossFit, calisthenics och kondition ska ha egna domänregler där deras modeller skiljer sig.

**GP-73 — Genomförbar frekvens och passlängd**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Program ska utgå från användarens realistiska tillgänglighet och kunna hantera en definierad miniminivå.

**GP-74 — Funktionellt övningsurval**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningar ska väljas och ersättas utifrån programmets syfte, inte endast muskelgrupp eller namn.

**GP-75 — Explicit progression**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje aktivt program ska ha en definierad progressionsmodell eller ett uttryckligt skäl till att progression inte används.

**GP-76 — Stabilitet före omprogrammering**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska normalt kräva ett relevant mönster eller tydlig händelse innan större programförändringar genomförs.

**GP-77 — Canonical övningsidentitet**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningar ska ha stabila canonical identiteter separerade från visningsnamn och språk.

**GP-78 — Strukturerad övningsgraf**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsrelationer ska representeras med typ, villkor, källa och kvalitetsstatus.

**GP-79 — Kvalitetsgranskat media**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsdemonstrationer ska vara licensierade, versionshanterade och tekniskt granskade innan produktionsanvändning.

**GP-80 — Domänanpassad loggning**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Träningsloggen ska representera den faktiska aktivitetstypen och får inte tvinga alla domäner till set och repetitioner.

**GP-81 — Kontrollerad anpassning**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Analys får endast förändra ett aktivt program genom GainPilots anpassningsmotor och användarens tillämpliga mandat.

**GP-82 — Versionshanterade program**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktiva träningsprogram och betydelsefulla förändringar ska vara versionerade och återställningsbara.

**GP-83 — Professionell gräns vid smärta och skada**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte diagnostisera eller programmera runt högrisksymptom utan lämplig begränsning och hänvisning.

**GP-84 — Samlad belastningsbedömning**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Styrka, kondition, CrossFit, calisthenics och annan relevant aktivitet ska konsekvensbedömas tillsammans.

**GP-85 — Granskad kunskapsuppdatering**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ny extern information får inte direkt ändra canonical träningsregler eller användarprogram.

**GP-86 — Extern programmering ska respekteras**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte skriva över ett externt eller mänskligt coachat program utanför användarens uttryckliga mandat.

**GP-87 — Beslut ska vara observerbara**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla träningsbeslut ska kunna spåras till data, regel, mandat och resultat.

**GP-88 — Branchbaserad träningsutveckling**  
*Kategori (derived/non-canonical): training · Sektion: 7.64 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av träningsmotor, regler, övningsgraf och säkerhetslogik ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 8 — Kostintelligens

**GP-89 — Kost som sammanhängande system**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska behandla energi, näring, måltider, preferenser, vardag och uppföljning som delar av samma kostmodell.

**GP-90 — Kostmålet kopplas till helheten**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kostplanen ska stödja användarens övergripande mål och konsekvensbedömas tillsammans med träning och aktivitet.

**GP-91 — Energi är en kalibrerbar uppskattning**  
*Kategori (derived/non-canonical): product · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Initialt energibehov ska presenteras som en uppskattning och kalibreras mot verkliga resultat.

**GP-92 — Trend före enskild vägning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla kostanpassningar ska normalt baseras på relevant trenddata och flera signaler.

**GP-93 — Praktisk måltidsstruktur**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kostplanen ska anpassas efter tid, budget, preferenser, hushåll och vardag.

**GP-94 — Canonical livsmedelsidentitet**  
*Kategori (derived/non-canonical): data · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Livsmedel och produkter ska ha canonical identiteter, datakälla och kvalitetsstatus.

**GP-95 — Canonical receptmodell**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Recept ska vara strukturerade, skalbara, versionshanterade och kopplade till validerad livsmedelsdata.

**GP-96 — Meningsfull måltidssubstitution**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Måltids- och ingrediensbyten ska ta hänsyn till energi, protein, begränsningar, funktion och resten av dagens plan.

**GP-97 — Allergier har företräde**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Allergier och säkerhetskritiska kostbegränsningar ska tillämpas före preferenser och optimering.

**GP-98 — Flera precisionsnivåer**  
*Kategori (derived/non-canonical): product · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna stödja både förenklad portionsbaserad planering och detaljerad vägning.

**GP-99 — Flexibilitet utan kompensationslogik**  
*Kategori (derived/non-canonical): product · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Normala avvikelser ska hanteras utan aggressiv kompensation, skuld eller straffbeteende.

**GP-100 — Kontrollerad kostanpassning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktiva kostplaner får endast förändras genom kostanpassningsmotorn och användarens tillämpliga mandat.

**GP-101 — Versionshanterad kostplan**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla kostförändringar ska vara spårbara och återställningsbara.

**GP-102 — Professionella gränser**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte diagnostisera, ersätta medicinsk nutritionsterapi eller ge högriskråd utanför sitt mandat.

**GP-103 — Skydd mot osunda mönster**  
*Kategori (derived/non-canonical): safety · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna begränsa funktioner och rekommendationer som riskerar att förstärka extrem restriktion eller kompensationsbeteende.

**GP-104 — Granskad extern kunskap**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ny forskning, livsmedelsdata och externa recept får inte direkt bli canonical utan granskning.

**GP-105 — Atlas bakom, Arnold framför**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska bidra med research, analys och relevant kontext, medan Arnold normalt kommunicerar kostbesluten.

**GP-106 — Hermes minimerar kostkontext**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Delad Omnira-kontext ska begränsas till det kostplaneringen faktiskt kräver.

**GP-107 — Domänöverskridande konsekvensanalys**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tränings- och kostmotorerna ska kunna bedöma hur förändringar i den ena domänen påverkar den andra.

**GP-108 — Branchbaserad kostutveckling**  
*Kategori (derived/non-canonical): nutrition · Sektion: 8.82 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av kostmotor, livsmedelsdata, allergenregler och säkerhetslogik ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 9 — Progression, återhämtning och anpassning

**GP-109 — Målspecifik progression**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Progression ska definieras i relation till användarens aktiva mål, träningsdomän och programfas.

**GP-110 — Process, prestation och resultat**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan processprogression, prestationsprogression och resultatprogression.

**GP-111 — Jämförbarhet före slutsats**  
*Kategori (derived/non-canonical): data · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Prestationsdata får endast jämföras när teknik, variant, standard och övrig kontext är tillräckligt jämförbara.

**GP-112 — Baslinje före avancerad personalisering**  
*Kategori (derived/non-canonical): memory · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska etablera en tillräcklig baslinje innan säkra individuella responsmönster antas.

**GP-113 — Trend före datapunkt**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Större anpassningar ska normalt baseras på relevanta trender eller tydliga högrisksignaler.

**GP-114 — Underhåll är giltig framgång**  
*Kategori (derived/non-canonical): product · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Bibehållen kapacitet ska kunna klassificeras som framgång när den stödjer det aktiva målet.

**GP-115 — Flera återhämtningssignaler**  
*Kategori (derived/non-canonical): data · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återhämtningsbedömning ska använda flera relevanta signaler och får inte styras av en enskild poäng utan tillräcklig kontext.

**GP-116 — Signalkvalitet och provenance**  
*Kategori (derived/non-canonical): safety · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återhämtningsdata ska ha känd källa, kvalitet, tidpunkt och osäkerhet.

**GP-117 — Rätt orsak, rätt åtgärd**  
*Kategori (derived/non-canonical): security · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan fysiologisk trötthet, praktisk tidsbrist, låg följsamhet och säkerhetssignal.

**GP-118 — Samlad belastningsanalys**  
*Kategori (derived/non-canonical): nutrition · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Relevant belastning från styrka, kondition, CrossFit, calisthenics, kost och vardag ska konsekvensbedömas tillsammans.

**GP-119 — Minsta effektiva förändring**  
*Kategori (derived/non-canonical): product · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska normalt välja den minsta förändring som rimligen kan lösa det identifierade problemet.

**GP-120 — Hypotesdriven anpassning**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla förändringar ska ha en dokumenterad hypotes, ett förväntat resultat och ett uppföljningsfönster.

**GP-121 — Begränsad samtidighet**  
*Kategori (derived/non-canonical): product · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska undvika att förändra flera centrala variabler samtidigt när det inte är nödvändigt.

**GP-122 — Kontrollnivå och låsningar**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Alla anpassningar ska följa användarens kontrollnivå och respektera låsta mål och plandelar.

**GP-123 — Riskstyrd automatik**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Anpassningens riskklass ska avgöra graden av automatik, godkännande och uppföljning.

**GP-124 — Förklarbar förändring**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla anpassningar ska kunna förklaras genom observation, tolkning, förändring, förväntat resultat och osäkerhet.

**GP-125 — Versionshanterad anpassning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Program-, kost- och återhämtningsförändringar ska vara spårbara och återställningsbara.

**GP-126 — Misslyckade hypoteser ska omprövas**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska registrera när en anpassning inte skapar önskat resultat och ompröva den bakomliggande hypotesen.

**GP-127 — Stabilitetsskydd**  
*Kategori (derived/non-canonical): product · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Systemet ska kunna begränsa överdriven förändringsfrekvens och införa stabilitetsperioder.

**GP-128 — Professionella gränser**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte diagnostisera sjukdom, skada, överträningssyndrom eller psykisk ohälsa.

**GP-129 — Behörighetsstyrd Omnira-kontext**  
*Kategori (derived/non-canonical): memory · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och Arnold får endast använda relevant Omnira-kontext genom Hermes och rätt behörighet.

**GP-130 — Versionshanterade intelligensmodeller**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Progressions-, återhämtnings- och anpassningsmodeller ska versioneras och kunna revideras.

**GP-131 — Testad anpassning**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av canonical anpassningsregler ska genomgå enhets-, scenario-, säkerhets-, simulations- och regressionstestning.

**GP-132 — Branchbaserad utveckling**  
*Kategori (derived/non-canonical): training · Sektion: 9.99 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av progressionsmotor, återhämtningsmodell och anpassningslogik ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 10 — Övningsgrafen och substitutionsmotorn

**GP-133 — Övning som strukturerad kunskap**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje canonical övning ska representeras genom en strukturerad och versionshanterad kunskapsmodell.

**GP-134 — Stabil canonical identitet**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsidentitet ska vara stabil och separerad från språk, visningsnamn och externa leverantörsidentifierare.

**GP-135 — Varianter ska särskiljas**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla skillnader i utrustning, teknik, rörelseomfång, belastning eller programmering ska kunna representeras som egna varianter.

**GP-136 — Programfunktion före substitution**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett övningsbyte ska bedömas utifrån övningens funktion i det aktiva programmet.

**GP-137 — Orsak före alternativ**  
*Kategori (derived/non-canonical): product · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Substitutionsmotorn ska identifiera orsaken till bytet innan alternativ rangordnas.

**GP-138 — Hårda säkerhetsfilter**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Säkerhetsbegränsningar, blockerade övningar och saknad utrustning ska filtrera bort kandidater före mjuk rangordning.

**GP-139 — Villkorade relationer**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Progressioner, regressioner och substitutioner ska ha uttryckliga villkor, källa och kvalitetsstatus.

**GP-140 — Begränsat rekommendationsurval**  
*Kategori (derived/non-canonical): agent · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska normalt presentera ett litet antal relevanta alternativ i stället för en osorterad katalog.

**GP-141 — Förklarad kompromiss**  
*Kategori (derived/non-canonical): product · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När ett byte inte är fullständigt likvärdigt ska den viktiga kompromissen kommuniceras.

**GP-142 — Giltighet för substitution**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje övningsbyte ska kunna klassificeras som tillfälligt, tidsbegränsat, blockbaserat eller permanent.

**GP-143 — Programkonsekvensanalys**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett övningsbyte ska analyseras i relation till resten av passet och programmet.

**GP-144 — Separat prestationshistorik**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Resultat från betydelsefullt olika övningsvarianter ska lagras separat även när övningarna är relaterade.

**GP-145 — Canonical mediekoppling**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsmedia ska kopplas genom canonical övningsidentitet och ha licens, version och granskningsstatus.

**GP-146 — Teknisk mediegranskning**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

AI-genererat, retargetat och externt övningsmaterial ska granskas innan produktionsanvändning.

**GP-147 — Privat användarinnehåll**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarskapade övningar ska vara privata tills en separat canonical granskningsprocess har slutförts.

**GP-148 — Provenance**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsdata och relationer ska ha känd källa, tidpunkt, säkerhetsnivå och granskningsstatus.

**GP-149 — Versionshanterad graf**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningsposter, relationer, media och säkerhetsnoteringar ska versioneras och kunna migreras kontrollerat.

**GP-150 — Behörighetsstyrd personlig rangordning**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Personliga preferenser och historik får påverka rangordningen men aldrig kringgå säkerhets- och programregler.

**GP-151 — Observerbara substitutionsbeslut**  
*Kategori (derived/non-canonical): product · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det ska gå att spåra varför ett alternativ föreslogs, valdes eller avvisades.

**GP-152 — Branchbaserad grafutveckling**  
*Kategori (derived/non-canonical): training · Sektion: 10.100 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av canonical övningsgraf, substitutionsmotor och säkerhetsfilter ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 11 — Programimport, externa källor och canonical normalisering

**GP-153 — Import är separat från aktivering**  
*Kategori (derived/non-canonical): product · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Externt material får inte bli aktiv plan enbart genom uppladdning eller extraktion.

**GP-154 — Originalet ska bevaras**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan originalinnehåll, extraktion, normalisering, användarkorrigering och GainPilot-anpassning.

**GP-155 — Provenance på fältnivå**  
*Kategori (derived/non-canonical): data · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefull importerad data ska kunna spåras till källa, tidpunkt och tolkningssteg.

**GP-156 — Rättighetsstyrd användning**  
*Kategori (derived/non-canonical): product · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Privat tillgång till externt material får inte behandlas som obegränsad rätt till publicering, delning eller canonical återanvändning.

**GP-157 — Importläget ska vara uttryckligt**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan bevarande, analys, anpassning, konvertering och historikimport.

**GP-158 — Osäkerhet ska representeras**  
*Kategori (derived/non-canonical): safety · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Extraherade och matchade fält ska kunna ha säkerhetsnivå och kräva bekräftelse när det behövs.

**GP-159 — Mellanformat före canonical data**  
*Kategori (derived/non-canonical): data · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Osäker extern data ska först lagras i ett styrt mellanformat och får inte skrivas direkt till den aktiva domänmodellen.

**GP-160 — Canonical matchning ska vara kontrollerad**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Övningar, aktiviteter och programkomponenter ska matchas genom exakt, synonym-, fuzzy- eller kontextbaserad metod med tydlig säkerhetsnivå.

**GP-161 — Okända poster ska förbli privata**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ej matchade övningar och komponenter ska vara privata tills separat canonical granskning har slutförts.

**GP-162 — Programkonflikter ska synliggöras**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Konflikter med användarens tid, utrustning, säkerhetsbegränsningar och mål får inte döljas eller lösas tyst.

**GP-163 — Original och anpassning ska versionssepareras**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot-anpassningar av externa program ska skapas som separata versioner med tydlig diff.

**GP-164 — Programskaparens intention ska respekteras**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska bevara källans struktur och regler när användaren inte uttryckligen har beviljat ändringsmandat.

**GP-165 — Extern progression får inte konkurrera dolt**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Endast en uttryckligt vald progressionsmodell får operativt styra samma programkomponent.

**GP-166 — Komponentmandat**  
*Kategori (derived/non-canonical): authority · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Olika delar av användarens plan ska kunna ha olika källa, ägare och ändringsmandat.

**GP-167 — Strikt synkroniseringsriktning**  
*Kategori (derived/non-canonical): product · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Läs-, skriv-, enkelriktad och tvåvägssynkronisering ska konfigureras separat och tydligt.

**GP-168 — Idempotent import**  
*Kategori (derived/non-canonical): data · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Samma källdata ska kunna importeras igen utan oavsiktliga dubbletter.

**GP-169 — Säker filhantering**  
*Kategori (derived/non-canonical): product · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Importerade filer ska valideras och bearbetas isolerat utan exekvering av inbäddad kod.

**GP-170 — Dataminimerad extraktion**  
*Kategori (derived/non-canonical): data · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska endast extrahera och lagra information som är relevant för importens definierade syfte.

**GP-171 — Användarbekräftelse före högriskaktivering**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Osäkra, säkerhetskritiska eller centrala programfält ska kräva bekräftelse före aktivering.

**GP-172 — Canonical data kräver separat governance**  
*Kategori (derived/non-canonical): data · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ingen enskild privat eller extern import får direkt skapa global canonical kunskap.

**GP-173 — Spårbar programanalys**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Analyser av importerade program ska kunna kopplas till exakt källversion, canonical data och analysregel.

**GP-174 — Ingen hallucinerad komplettering**  
*Kategori (derived/non-canonical): product · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Saknade fält får inte fyllas av AI och presenteras som om de kom från originalkällan.

**GP-175 — Portabilitet**  
*Kategori (derived/non-canonical): training · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna exportera sina egna resultat, programversioner och GainPilot-skapade data i ett begripligt format.

**GP-176 — Branchbaserad importutveckling**  
*Kategori (derived/non-canonical): security · Sektion: 11.136 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av importparser, normalisering, canonical matchning, rättighetsmodell och säkerhetsfilter ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 12 — Minne, personalisering och kontinuerligt lärande

**GP-177 — Strukturerat minne**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Viktiga användarminnen ska representeras som strukturerad, versionshanterad och styrd data.

**GP-178 — Isolerade minnesdomäner**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot, Arnold, Atlas och övriga Omnira-projekt ska använda separata minnesdomäner med explicit delning.

**GP-179 — Hermes som obligatorisk gateway**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Minnesåtkomst mellan GainPilot och andra Omnira-domäner ska gå genom Hermes och tillämplig policy.

**GP-180 — Syftesbegränsad minnesåtkomst**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En agent får endast läsa eller skriva minne som är relevant för en definierad uppgift och kapabilitet.

**GP-181 — Provenance**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull minnespost ska ha källa, tidpunkt, giltighet, säkerhetsnivå och status.

**GP-182 — Inferens är inte användarfakta**  
*Kategori (derived/non-canonical): product · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Observerade mönster och systeminferenser får inte behandlas som användarbekräftade fakta.

**GP-183 — Användarbekräftelse vid betydelsefull inferens**  
*Kategori (derived/non-canonical): data · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Inferenser som påverkar större beslut, känsliga data eller domändelning ska kräva användarbekräftelse.

**GP-184 — Aktuell användarvilja har företräde**  
*Kategori (derived/non-canonical): product · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarens aktuella uttryckliga beslut ska normalt väga tyngre än äldre observationer och inferenser.

**GP-185 — Giltighet och tidsförfall**  
*Kategori (derived/non-canonical): training · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Minnestyper ska ha definierad giltighet, omprövning eller tidsförfall när informationen kan bli inaktuell.

**GP-186 — Säkerhetskritiska minnen har prioritet**  
*Kategori (derived/non-canonical): training · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktiva allergier, blockerade övningar och professionella begränsningar ska tillämpas före vanliga preferenser och optimering.

**GP-187 — Minimerad kontextleverans**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska dela den minsta representation som krävs för uppgiften och inte hela källdomänen.

**GP-188 — Användarstyrd insyn**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna se vilka minnen som finns, deras källa, delningsstatus och vad de påverkar.

**GP-189 — Rättelse och radering**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna korrigera och ta bort minnen inom tillämpliga rättsliga och säkerhetsmässiga gränser.

**GP-190 — Verifierad glömska**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Borttagna eller utgångna minnen får inte fortsätta hämtas eller påverka rekommendationer.

**GP-191 — Kvalitet före mängd**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska prioritera relevanta och verifierade minnen framför maximal datalagring.

**GP-192 — Utfallsbaserat lärande**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Personalisering ska bedöma resultatet av tidigare val och inte endast registrera att valet gjordes.

**GP-193 — Personalisering utan låsning**  
*Kategori (derived/non-canonical): training · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tidigare mönster ska påverka standardval men får inte hindra användaren från att förändra mål, beteende eller träningsform.

**GP-194 — Delad profil ska vara begränsad**  
*Kategori (derived/non-canonical): domain · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Den globala Omnira-profilen ska endast innehålla uttryckligt definierade och lämpliga delade uppgifter.

**GP-195 — Ingen dold profilering**  
*Kategori (derived/non-canonical): product · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte skapa ogenomskinliga psykologiska eller känsliga profiler som användaren inte kan granska.

**GP-196 — Minnesskrivning kräver styrd process**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Externa dokument, verktyg och modeller får inte skriva direkt till canonical användarminne.

**GP-197 — Skydd mot minnesförgiftning**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Minnesarkitekturen ska använda provenance, behörighet, säkerhetsnivå, bekräftelse och rollback för att motverka felaktig påverkan.

**GP-198 — Versionshanterad profil**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarprofil, minnesposter, konsolideringar och policys ska versioneras.

**GP-199 — En gemensam canonical profil**  
*Kategori (derived/non-canonical): agent · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold, Atlas och GainPilots motorer ska använda samma styrda canonical användarprofil inom respektive behörighet.

**GP-200 — Branchbaserad minnesutveckling**  
*Kategori (derived/non-canonical): memory · Sektion: 12.149 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av minnesmodell, Hermes-policy, retention, säkerhetsklass och personaliseringsregler ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 13 — Program, kalender och långsiktig planering

**GP-201 — Program som versionshanterat kontrakt**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje aktivt program ska vara en strukturerad, versionshanterad och spårbar representation av mål, plan, progression och mandat.

**GP-202 — Programkälla och ägande**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Program och programkomponenter ska ha definierad källa, ägare och ändringsrätt.

**GP-203 — Huvudmål och prioritering**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje aktivt program ska ha ett tydligt huvudmål och en explicit prioritering mellan sekundära mål.

**GP-204 — Programvecka och kalendervecka**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja mellan programmets interna progression och kalenderns datumstruktur.

**GP-205 — Fasta, flexibla och asynkrona upplägg**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Programmodellen ska stödja fasta kalenderdagar, flexibla fönster, hybridupplägg och asynkron träningsordning.

**GP-206 — Realistisk passlängd**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kalenderbokningar ska baseras på realistiskt uppskattad och senare kalibrerad tidsåtgång.

**GP-207 — Prioriterad reservstruktur**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Relevanta pass ska kunna ha kortversion, minimipass eller reservpass som bevarar programmets viktigaste funktion.

**GP-208 — Missade pass skapar inte automatisk skuld**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Missade pass får inte automatiskt staplas på framtida dagar utan program- och återhämtningsanalys.

**GP-209 — Program- och kalenderlåsningar**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarlåsta programdelar och kalenderhändelser får inte ändras automatiskt.

**GP-210 — Minimerad kalenderåtkomst**  
*Kategori (derived/non-canonical): product · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska i första hand använda tillgänglighetsinformation och inte privata kalenderdetaljer.

**GP-211 — Separata läs- och skrivbehörigheter**  
*Kategori (derived/non-canonical): authority · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kalenderläsning och kalenderskrivning ska kräva separata scopes och användarbeslut.

**GP-212 — Källsystem för kalenderdata**  
*Kategori (derived/non-canonical): data · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje synkroniserad datatyp ska ha ett definierat källsystem och en konfliktpolicy.

**GP-213 — Idempotent synkronisering**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kalender- och programuppdateringar ska kunna upprepas utan oavsiktliga dubbletter.

**GP-214 — Kontrollerad automatisk ombokning**  
*Kategori (derived/non-canonical): authority · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatisk flytt av aktiviteter får endast ske inom uttryckliga tids-, risk- och användarmandat.

**GP-215 — Programkonsekvens före ombokning**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Flytt av pass ska analyseras i relation till återhämtning, övriga pass och programmets prioritet.

**GP-216 — Originalprogram ska respekteras**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte förändra ett externt eller tränarägt program utanför användarens och ägarens definierade mandat.

**GP-217 — Komponentbaserad planering**  
*Kategori (derived/non-canonical): nutrition · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Träning, kondition, skills och kost ska kunna vara separata komponenter inom en samordnad övergripande plan.

**GP-218 — Förklarbar planering**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefull programplacering och ombokning ska kunna förklaras genom mål, tillgänglighet, prioritet och återhämtning.

**GP-219 — Återställningsbar förändring**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Program- och kalenderändringar ska ha historik och kunna återställas när säkerhet och aktuell version tillåter det.

**GP-220 — Branchbaserad planeringsutveckling**  
*Kategori (derived/non-canonical): training · Sektion: 13.156 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av programmodell, kalenderintegration, ombokningsmotor och behörighetspolicy ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 14 — Träningspasset och den aktiva coachupplevelsen

**GP-221 — Planerat och genomfört ska separeras**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska bevara skillnaden mellan programplan, dagens anpassade plan och faktiskt genomförande.

**GP-222 — Stabil sessionsidentitet**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje aktiv träningssession ska ha en unik identitet och kopplas till rätt program- och passversion.

**GP-223 — Domänriktig sessionsmodell**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Styrka, CrossFit, calisthenics och kondition ska representeras genom modeller som bevarar respektive träningsforms riktiga struktur.

**GP-224 — Snabb registrering**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det aktiva passet ska minimera användarens administrativa arbete och erbjuda snabb bekräftelse av planerade värden.

**GP-225 — Saknad data är inte noll**  
*Kategori (derived/non-canonical): data · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ej registrerade värden får inte automatiskt behandlas som misslyckade eller nollställda resultat.

**GP-226 — Uppvärmning som separat fas**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Uppvärmning och uppvärmningsset ska hållas åtskilda från arbetsset men kunna användas för dagskalibrering.

**GP-227 — Belastningsförslag ska vara förklarbara**  
*Kategori (derived/non-canonical): authority · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Autoreglerad belastning ska kopplas till plan, historik, uppvärmning och användarens mandat.

**GP-228 — Mikroanpassning inom mandat**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatisk justering av belastning, vila, repetitioner eller set får endast ske inom explicit kontrollnivå och riskgräns.

**GP-229 — Övningsbyte ska använda substitutionsmotorn**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett byte under pass ska följa programfunktion, bytesorsak, säkerhetsfilter och definierad giltighet.

**GP-230 — Säkerhet har företräde**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Smärta, allvarliga symptom och aktiva begränsningar ska kunna stoppa normalt progressions- och optimeringsflöde.

**GP-231 — Kamera och mikrofon kräver aktivt val**  
*Kategori (derived/non-canonical): product · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Sensorer som kamera och mikrofon får endast aktiveras genom tydligt användarval och för ett definierat syfte.

**GP-232 — Videoanalys är osäker assistans**  
*Kategori (derived/non-canonical): safety · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

AI-baserad teknikbedömning ska uttrycka osäkerhet och får inte diagnostisera skada eller medicinska tillstånd.

**GP-233 — Råmedia ska ha begränsad retention**  
*Kategori (derived/non-canonical): data · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Råvideo, ljud och högfrekvent sensordata ska normalt inte lagras längre än uppgiften kräver utan uttryckligt användarval.

**GP-234 — Offlineförmåga**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna genomföra och registrera grundläggande planerat träningspass utan nätanslutning.

**GP-235 — Idempotent sessionssynkronisering**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Set, aktiviteter och sessionshändelser ska kunna synkroniseras igen utan oavsiktliga dubbletter.

**GP-236 — Kraschåterställning**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett aktivt pass ska kunna återställas efter app-, nätverks- eller enhetsfel utan att registrerade resultat förloras.

**GP-237 — Begränsad livecoachning**  
*Kategori (derived/non-canonical): agent · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska leverera minsta relevanta coachning enligt användarens valda detaljnivå.

**GP-238 — Passammanfattning ska vara prioriterad**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Efter passet ska GainPilot sammanfatta huvudsyfte, viktiga resultat, avvikelser och nästa steg utan att skapa en datadump.

**GP-239 — Progression kräver kvalificerat utfall**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatisk progression ska kräva tydlig programregel, tillräcklig datakvalitet och avsaknad av blockerande säkerhetssignal.

**GP-240 — Sessioner ska vara versionshanterade och auditerbara**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Passdata, efterhandsredigeringar, permanenta byten och säkerhetshändelser ska kunna spåras och återställas.

**GP-241 — Sessionsminne ska vara tillfälligt och minimerat**  
*Kategori (derived/non-canonical): training · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska skapa ett uppgiftsbegränsat minnespaket för passet och inte leverera irrelevant Atlas- eller Omnira-kontext.

**GP-242 — Branchbaserad sessionsutveckling**  
*Kategori (derived/non-canonical): security · Sektion: 14.189 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av sessionsmodell, autoreglering, timer, säkerhetsflöden, sensorer och synkronisering ska ske på separat branch med tester, pull request, granskning och kontrollerad merge.

### Kapitel 15 — Animerade övningsdemonstrationer och visuellt tekniskt stöd

**GP-243 — Canonical medieidentitet**  
*Kategori (derived/non-canonical): training · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje publicerad medieresurs ska ha stabil identitet och kopplas till exakt canonical övning och variant.

**GP-244 — Instruktionssyfte före produktion**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje resurs ska ha ett definierat pedagogiskt syfte innan den produceras eller licensieras.

**GP-245 — Teknisk korrekthet före visuell effekt**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Rörelsens och utrustningens korrekthet ska alltid ha företräde framför visuell stil och varumärkeseffekt.

**GP-246 — Flera mediatyper**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna använda 3D, video, stillbilder, text, ljud och interaktiv media beroende på användningsfallet.

**GP-247 — Variantkorrekt demonstration**  
*Kategori (derived/non-canonical): training · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Media från en närliggande övning eller variant får inte visas som om den vore den planerade canonical rörelsen.

**GP-248 — Begränsad snabbvy**  
*Kategori (derived/non-canonical): training · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Under aktivt träningspass ska demonstration och teknikpunkter begränsas till den minsta mängd som stödjer nästa handling.

**GP-249 — Individuell variation**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Visuella standarder ska beskrivas som pedagogiska referenser och får inte framställas som identiska krav för alla kroppar.

**GP-250 — Muskelmarkering är pedagogisk förenkling**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Muskelvisualisering får inte presenteras som exakt realtidsmätning eller fullständig biologisk sanning.

**GP-251 — Fel måste märkas tydligt**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Felvisualisering får aldrig kunna förväxlas med canonical huvuddemonstration.

**GP-252 — Progressioner ska ha villkor**  
*Kategori (derived/non-canonical): training · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Visuella progressioner och regressioner ska kopplas till förkunskapskrav, kvalitetskriterier och övningsgrafen.

**GP-253 — Hybridbibliotek**  
*Kategori (derived/non-canonical): domain · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna kombinera licensierat och egenproducerat material utan att canonical domänlogik låses till en leverantör.

**GP-254 — AI är produktionsstöd**  
*Kategori (derived/non-canonical): data · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Generativ AI får stödja styling, lokalisering och produktion men får inte ensam definiera canonical rörelsedata.

**GP-255 — Teknisk granskning före publicering**  
*Kategori (derived/non-canonical): governance · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Allt canonical rörelsemedia ska granskas av relevant teknisk kompetens före produktionsanvändning.

**GP-256 — Licensierad användning**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje extern resurs ska ha känd, maskinläsbar och tillämpad licensstatus.

**GP-257 — Tillgänglighet som kärnkrav**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Media ska ha textalternativ, minskad rörelse, ljudoberoende information och tillräcklig kontrast.

**GP-258 — Versionshanterad media**  
*Kategori (derived/non-canonical): data · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Media, metadata, text, ljud, licens och canonical koppling ska versioneras.

**GP-259 — Snabb avpublicering**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Felaktig, osäker eller rättighetsmässigt ogiltig media ska kunna avpubliceras och ersättas med fallback utan full klientrelease.

**GP-260 — Begränsad privat mediaåtkomst**  
*Kategori (derived/non-canonical): memory · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarvideo och bilder ska vara privata som standard och endast delas genom Hermes och explicit mandat.

**GP-261 — Begränsad retention av råmedia**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Privat råvideo, ljud och bilder ska normalt raderas när uppgiften är klar om användaren inte aktivt väljer att spara dem.

**GP-262 — Offlinefallback**  
*Kategori (derived/non-canonical): training · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Grundläggande instruktion och relevant godkänd media ska kunna vara tillgänglig under offlinepass när licens och lagringspolicy tillåter det.

**GP-263 — Observerbar medieleverans**  
*Kategori (derived/non-canonical): product · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det ska gå att spåra vilken version, vinkel, källa och fallback som användes utan att exponera privat innehåll.

**GP-264 — Branch- och gatebaserad medieutveckling**  
*Kategori (derived/non-canonical): governance · Sektion: 15.198 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av mediaarkitektur, canonical koppling, produktionspipeline, tekniktext och publiceringsregler ska ske genom separat branch, kvalitetstester, granskning och kontrollerad publicering.

### Kapitel 16 — Kostplanering, recept och intelligenta måltidsbyten

**GP-265 — Kostplanen ska vara genomförbar**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska prioritera praktisk, säker och hållbar kostplanering framför teoretisk maximal precision.

**GP-266 — Canonical kostmodell**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kostmål, måltider, recept, ingredienser, portioner, byten, säkerhetsregler och utfall ska representeras strukturerat och versionshanterat.

**GP-267 — Detaljnivån ska vara användarstyrd**  
*Kategori (derived/non-canonical): data · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska stödja allt från enkla riktlinjer till detaljerad loggning utan att kräva samma precision av alla.

**GP-268 — Energi- och näringsvärden är uppskattningar**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Beräknade behov, näringsvärden och restaurangmåltider ska uttrycka relevant osäkerhet.

**GP-269 — Planerat och faktiskt intag ska separeras**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Planerad måltid, användarens byte och faktiskt genomförande ska bevaras som separata datanivåer.

**GP-270 — Canonical ingrediensidentitet**  
*Kategori (derived/non-canonical): product · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ingredienser och produkter ska identifieras strukturerat och inte enbart genom fritext.

**GP-271 — Rå och tillagad mängd ska skiljas**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Vikt, volym och näringsberäkning ska ange vilken livsmedelsform som avses.

**GP-272 — Provenance för näringsdata**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Näringsvärden, priser, allergener och produktinformation ska ha känd källa, aktualitet och säkerhetsnivå.

**GP-273 — Allergier har absolut säkerhetsprioritet**  
*Kategori (derived/non-canonical): security · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktiva allergier får inte övertrumfas av preferens, popularitet, pris, sponsring eller automatisk substitution.

**GP-274 — Medicinska kostbehov kräver särskilt scope**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte skapa, ändra eller tolka medicinska kostupplägg utanför definierad professionell och användargodkänd ram.

**GP-275 — Måltidsbyte ska bevara funktion**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Måltidsbyten ska utgå från måltidens syfte, säkerhet, användarens önskemål och praktiska begränsningar — inte enbart från kalorilikhet.

**GP-276 — Bytesorsaken ska påverka valet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Saknad ingrediens, tidsbrist, budget, smak, restaurang och kostval ska behandlas som olika bytesproblem.

**GP-277 — Tillfälligt byte är inte permanent preferens**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En enskild måltidsändring får inte automatiskt förändra användarens långsiktiga kostprofil.

**GP-278 — Reservmåltider ska vara planerade**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska erbjuda säkra, enkla och relevanta reservmåltider innan vardagsproblem uppstår.

**GP-279 — Ingen kompensatorisk skuld**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En avvikande måltid får inte automatiskt leda till extrem restriktion, överdriven träning eller moraliserande återkoppling.

**GP-280 — Recept ska vara granskningsbara**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Canonical recept ska ha källa, ingrediensmodell, allergenkontroll, portionslogik, praktisk validering och versionsstatus.

**GP-281 — AI-recept är utkast före granskning**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Generativ AI får skapa privata receptförslag men inte direkt publicera canonical recept eller säkerhetskritiska instruktioner.

**GP-282 — Familjemåltider utan dold profilering**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna skala gemensamma måltider utan att skapa onödiga eller känsliga profiler om andra hushållsmedlemmar.

**GP-283 — Minimerad kostkontext**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska dela den minsta kalender-, familje-, inköps- och hälsokontext som kostuppgiften kräver.

**GP-284 — Privat måltidsmedia**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Måltidsbilder, etikettfoton och privata recept ska vara privata som standard och ha begränsad retention.

**GP-285 — Idempotent och offlinekapabel kostlogg**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Måltider och ändringar ska kunna registreras offline och synkroniseras utan dubbletter eller tyst dataförlust.

**GP-286 — Branch- och gatebaserad kostutveckling**  
*Kategori (derived/non-canonical): nutrition · Sektion: 16.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av kostmodell, allergenregler, receptmotor, byteslogik och canonical innehåll ska ske genom separat branch eller innehållsgren, tester, granskning och kontrollerad publicering.

### Kapitel 17 — Progression, statistik och återkoppling

**GP-287 — Progression är flerdimensionell**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska mäta relevant utveckling inom prestation, teknik, genomförbarhet, kontinuitet, kost, återhämtning och användarupplevelse — inte genom en enda universell poäng.

**GP-288 — Mätvärde, trend, tolkning och rekommendation ska separeras**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Observerad data, beräkning, analys och åtgärd ska vara skilda och spårbara lager.

**GP-289 — Provenance för statistik**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje viktigt mätvärde och varje beräknad trend ska ha källa, tidpunkt, modellversion och datakvalitet.

**GP-290 — Trend före enskilt värde**  
*Kategori (derived/non-canonical): training · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska normalt använda flera jämförbara datapunkter innan en förändring klassificeras som progression eller tillbakagång.

**GP-291 — Domänspecifika tidsfönster**  
*Kategori (derived/non-canonical): training · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Trendfönster och stabilitetskrav ska anpassas efter måttets biologiska, praktiska och tekniska egenskaper.

**GP-292 — Jämförbarhet före analys**  
*Kategori (derived/non-canonical): training · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Resultat från olika övningsvarianter, standarder, miljöer, sensorer eller mätmetoder får inte jämföras direkt utan tydlig kontext.

**GP-293 — Osäkerhet ska vara synlig**  
*Kategori (derived/non-canonical): safety · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska uttrycka när underlaget är begränsat, modellen är osäker eller förändringen kan ligga inom normal variation.

**GP-294 — Processmål ska synliggöras**  
*Kategori (derived/non-canonical): operations · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna få återkoppling på fungerande process och kontinuitet även innan slutresultatet har förändrats.

**GP-295 — Kontrollerad anpassning räknas som följsamhet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Godkända reservpass, kortversioner, måltidsbyten och minimilägen får inte automatiskt klassificeras som misslyckanden.

**GP-296 — Planeringskvalitet ska mätas**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återkommande missade eller flyttade aktiviteter ska kunna analyseras som problem i planen och inte endast i användarens beteende.

**GP-297 — Kvalitativa framsteg är giltiga**  
*Kategori (derived/non-canonical): safety · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna dokumentera teknik, självständighet, trygghet och fungerande vanor utan att tvinga fram en falsk numerisk poäng.

**GP-298 — Korrelation är inte orsak**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Samband mellan sömn, kost, kalender, återhämtning och prestation ska beskrivas som möjliga relationer om orsak inte kan fastställas.

**GP-299 — Överreaktion ska förhindras**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Enskilda avvikelser får inte skriva om program, kostplan eller användarprofil om signalen inte är säkerhetskritisk.

**GP-300 — Platå kräver kvalificerad bedömning**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En platå ska kräva tillräcklig tidsperiod, jämförbar data och analys av plan, följsamhet och återhämtning.

**GP-301 — Prognoser är scenarier, inte garantier**  
*Kategori (derived/non-canonical): safety · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Framtida utveckling ska uttryckas genom intervall, antaganden och osäkerhet.

**GP-302 — Personlig jämförelse före populationsjämförelse**  
*Kategori (derived/non-canonical): product · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska i första hand bedöma användaren mot den egna baslinjen, målet och planen.

**GP-303 — Ingen ogenomskinlig hälsopoäng**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Systemet får inte reducera användarens kropp, kost, sömn, träning och välmående till ett oförklarligt globalt hälsotal.

**GP-304 — Förklarbar rekommendation**  
*Kategori (derived/non-canonical): safety · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull rekommendation ska kunna förklaras genom använda data, jämförelseperiod, osäkerhet och beslutsregel.

**GP-305 — Analys får inte skriva direkt**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Statistik- och analysmotorer får inte ändra program, kostmål, säkerhetsregler eller minnen utan respektive domäns mandat och approvalprocess.

**GP-306 — Modellversionering**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Analysmodeller, beräkningar, trendalgoritmer och rekommendationsregler ska ha identitet, version och rollback.

**GP-307 — Användaren får korrigera analysen**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna korrigera data, avvisa slutsatser och markera att kontext saknas.

**GP-308 — Minimerad analyskontext**  
*Kategori (derived/non-canonical): memory · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska leverera den minsta datamängd som krävs för aktuell analys och hindra obegränsad domänkombination.

**GP-309 — Privat statistik**  
*Kategori (derived/non-canonical): nutrition · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kroppsmått, kroppsvikt, bilder, kostdata och återhämtningssignaler ska vara privata som standard och ha granulär delning.

**GP-310 — Branch- och modellstyrd utveckling**  
*Kategori (derived/non-canonical): data · Sektion: 17.217 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av analysmodeller, statistikvyer, prognoser, rekommendationer och datakombinationer ska ske genom separat branch, validering, tester, granskning och kontrollerad utrullning.

### Kapitel 18 — Motivation, följsamhet och coachkommunikation

**GP-311 — Motivation är en signal, inte en identitet**  
*Kategori (derived/non-canonical): data · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte klassificera användarens karaktär eller värde utifrån tillfällig motivation eller följsamhet.

**GP-312 — Följsamhet är ett systemresultat**  
*Kategori (derived/non-canonical): data · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återkommande avvikelser ska analyseras i relation till mål, plan, tid, friktion, återhämtning och kommunikation — inte endast användarens disciplin.

**GP-313 — Kommunikationssyfte före kontakt**  
*Kategori (derived/non-canonical): product · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje proaktiv kommunikation ska ha ett definierat användarvärde och får inte skickas enbart för att öka engagemangsmetrik.

**GP-314 — Användarstyrd kommunikation**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna styra typ, kanal, tid, frekvens, ton och detaljnivå för vanlig coachkommunikation.

**GP-315 — Säkerhet före engagemang**  
*Kategori (derived/non-canonical): safety · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte försvaga säkerhetsbudskap eller pressa användaren till aktivitet för att förbättra engagemang eller följsamhet.

**GP-316 — Ingen skuld eller manipulation**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold får inte använda skuld, skam, rädsla, artificiell brådska, relationspress eller bekräftelseskam.

**GP-317 — Arnold ska stödja självständighet**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Coachningen ska göra användaren mer kapabel att förstå och hantera sin plan, inte mer beroende av AI-systemet.

**GP-318 — Ton förändrar inte policy**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Personlighet, humor, direkthet och användarvald coachstil får inte förändra fakta, säkerhetsregler eller behörigheter.

**GP-319 — Specifik och sann återkoppling**  
*Kategori (derived/non-canonical): data · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Beröm, kritik och motiverande återkoppling ska grunda sig i verklig data eller uttrycklig användarfeedback.

**GP-320 — Funktionsbevarande anpassning är följsamhet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Godkända kortversioner, reservpass, måltidsbyten, pauser och minimilägen ska bedömas efter vilken planfunktion de bevarar.

**GP-321 — Kärnplan före full plan**  
*Kategori (derived/non-canonical): roadmap · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna skilja följsamhet till planens viktigaste delar från genomförandet av valbara tillägg.

**GP-322 — Hinder före press**  
*Kategori (derived/non-canonical): operations · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När användaren inte genomför planen ska GainPilot först undersöka praktiska, kunskapsmässiga, återhämtningsrelaterade och målrelaterade hinder.

**GP-323 — Återgång utan skuld**  
*Kategori (derived/non-canonical): product · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återengagemang efter avbrott ska fokusera på aktuell situation, användarens mål och ett säkert nästa steg.

**GP-324 — Begränsad återkontakt**  
*Kategori (derived/non-canonical): product · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Inaktivitet får inte utlösa obegränsade eller allt mer påträngande återengagemangsmeddelanden.

**GP-325 — Ingen terapeutisk imitation**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold får vara stödjande men får inte framställa sig som terapeut, diagnostisera psykisk ohälsa eller bedriva behandling.

**GP-326 — Känsliga signaler stoppar vanlig motivation**  
*Kategori (derived/non-canonical): training · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Signal om självskada, allvarlig ätproblematik, medicinsk fara eller tvångsmässig träning ska aktivera särskilt säkerhetsflöde.

**GP-327 — Kommersiell separation**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Reklam, sponsring, affiliateinnehåll och abonnemangsförslag ska vara tydligt separerade från oberoende coachning.

**GP-328 — Minimerad kommunikationskontext**  
*Kategori (derived/non-canonical): memory · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska leverera den minsta personliga kontext som krävs och hindra att privat information används enbart för att göra kommunikationen mer personlig.

**GP-329 — Idempotent och frekvensbegränsad leverans**  
*Kategori (derived/non-canonical): product · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kommunikationssystemet ska förhindra dubbletter, respektera tysta perioder och tillämpa tydliga frekvensgränser.

**GP-330 — Generering är inte leveransbeslut**  
*Kategori (derived/non-canonical): product · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Språkmodellen som formulerar ett meddelande ska inte ensam besluta att användaren ska kontaktas.

**GP-331 — Kommunikation ska vara versionshanterad**  
*Kategori (derived/non-canonical): safety · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Mallar, modeller, tonregler, frekvenspolicy och högriskmeddelanden ska ha version, teststatus och rollback.

**GP-332 — Branch- och etikstyrd kommunikationsutveckling**  
*Kategori (derived/non-canonical): agent · Sektion: 18.233 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av coachton, motivation, proaktiv kontakt, gamification och återengagemang ska ske genom separat branch, etisk granskning, tester och kontrollerad utrullning.

### Kapitel 19 — CrossFit, calisthenics och framtida träningsdomäner

**GP-333 — Gemensam kärna, domänspecifik intelligens**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska återanvända gemensamma plattformsbegrepp men ge varje träningsdomän egna modeller, regler, säkerhetskrav och progressionssystem.

**GP-334 — Ingen förstörande universalmodell**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ingen träningsdomän får tvingas in i set-, repetitions- och belastningsformat när dess faktiska struktur kräver andra begrepp.

**GP-335 — Versionerade domänpaket**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje träningsdomän ska ha identifierad version, stödnivå, datamodell, säkerhetsmodell, progression och teststatus.

**GP-336 — Domänkontext ska bevaras**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En aktivitet ska behålla sitt syfte och sin domän även när samma rörelse används inom flera träningsformer.

**GP-337 — CrossFit-workouts ska vara strukturerade**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

AMRAP, EMOM, rounds for time, chipper, ladder, intervaller, time cap och score ska representeras som strukturerad canonical data.

**GP-338 — Scaling ska bevara stimulus**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

CrossFit-scaling ska i första hand bevara workoutens avsedda tidsprofil, rörelsefunktion, intensitet och användarsäkerhet.

**GP-339 — RX och scaled ska vara explicita versioner**  
*Kategori (derived/non-canonical): product · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Resultat får endast jämföras som likvärdiga när workoutversion, scaling, standard och scoreformat är kompatibla.

**GP-340 — Rörelsestandard ska versioneras**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

CrossFit-standarder, tävlingskrav och no-rep-definitioner ska ha känd version och provenance.

**GP-341 — Score före global poäng**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

CrossFit-resultat ska behålla sina domänspecifika scoreformat och får inte reduceras till en ogenomskinlig universell fitnesspoäng.

**GP-342 — Skills ska representeras som grafer**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Calisthenicsprogression ska använda prerequisites, parallella vägar, regressions, assistans och kvalitetskrav — inte endast linjära nivålistor.

**GP-343 — Kvalitet före svårighetsgrad**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En användare ska inte flyttas till svårare calisthenicsprogression enbart utifrån tid eller repetitionsantal utan bedömning av kontroll, stabilitet och säkerhet.

**GP-344 — Assistans ska ha metodkontext**  
*Kategori (derived/non-canonical): compliance · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Band, vägg, partner, maskin och andra assistansformer ska lagras separat och inte jämföras som identiska nivåer.

**GP-345 — Ett lyckat försök är inte full behärskning**  
*Kategori (derived/non-canonical): product · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Skillstatus ska kräva tillräcklig stabilitet och får inte höjas permanent efter ett enskilt lyckat försök.

**GP-346 — Domänspecifik substitution**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Substitutioner ska använda den aktiva domänens funktion, stimulus, progression, teknik och säkerhetsmodell.

**GP-347 — Domäninterferens ska analyseras**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När flera träningsformer kombineras ska GainPilot analysera konkurrerande belastning, återhämtning, teknik och prioritet.

**GP-348 — Ny domän kräver expertis**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En ny specialiserad träningsdomän får inte bli canonical utan relevant mänsklig expertgranskning och dokumenterad kunskapsprovenance.

**GP-349 — Domänkompetens ska deklareras**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter, modeller och coachfunktioner ska uttryckligen ange vilka träningsdomäner och användarnivåer de är validerade för.

**GP-350 — Okänd aktivitet ska förbli okänd**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte hallucinera klassificering, progression eller analys för en aktivitet som systemet inte förstår.

**GP-351 — Domänmedia kräver teknisk validering**  
*Kategori (derived/non-canonical): data · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Animation, video och kameraanalys ska granskas mot domänens faktiska rörelse, standard och biomekanik.

**GP-352 — Domänspecifik säkerhet**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje träningsdomän ska definiera egna risker, miljökrav, utrustningskrav, stoppkriterier och professionella gränser.

**GP-353 — Domänminne ska isoleras**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

CrossFit-, calisthenics- och andra domänminnen ska delas genom Hermes och får inte automatiskt spridas till andra projekt eller aktörer.

**GP-354 — Adapterbaserad utbyggnad**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya träningsdomäner och externa plattformar ska ansluta genom versionerade adapterkontrakt utan att bryta den gemensamma träningskärnan.

**GP-355 — Domänresultat ska vara portabla**  
*Kategori (derived/non-canonical): domain · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna exportera domänspecifik historik med begriplig struktur, enheter, standarder och provenance.

**GP-356 — Branch- och expertstyrd domänutveckling**  
*Kategori (derived/non-canonical): training · Sektion: 19.199 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya domäner, progressioner, scalingregler, standarder och säkerhetsmodeller ska utvecklas på separat branch genom tester, expertgranskning, shadow mode och kontrollerad utrullning.

### Kapitel 20 — GainPilot som Omnira-domän

**GP-357 — GainPilot är en fullvärdig Omnira-domän**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska ha egen produktlogik, datamodell, riskmodell, agenter och verksamhetsstyrning samtidigt som gemensamma Omnira-förmågor återanvänds.

**GP-358 — Omnira är kontrollplan, inte domänersättning**  
*Kategori (derived/non-canonical): memory · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Omnira ska tillhandahålla styrning, identitet, minnesgränser, approvals och agentsamordning utan att skriva över GainPilots specialistlogik.

**GP-359 — Explicit bounded context**  
*Kategori (derived/non-canonical): data · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot-begrepp, data och beslut ska ha en tydlig domängräns och får inte blandas med andra projekt genom generella otypade objekt.

**GP-360 — Tenant- och användarisolering**  
*Kategori (derived/non-canonical): memory · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

All GainPilot-data, alla minnen, filer, index, köer, loggar och agentkontexter ska vara tenant- och användarscopeade.

**GP-361 — Capabilitybaserad integration**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Omnira, Atlas, Arnold och andra agenter ska agera genom identifierade GainPilot-capabilities med explicit risk, behörighet och approval.

**GP-362 — Versionerade domänkontrakt**  
*Kategori (derived/non-canonical): authority · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kommandon, queries, events, signals, approvals och data envelopes mellan GainPilot och Omnira ska vara versionerade och tenantmedvetna.

**GP-363 — Minimerad domänöverskridande data**  
*Kategori (derived/non-canonical): training · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Data som passerar GainPilots gräns ska vara syftesbunden, klassificerad och minimerad, med säkra referenser i stället för fullständiga kopior där möjligt.

**GP-364 — Hermes är obligatorisk minnesgräns**  
*Kategori (derived/non-canonical): memory · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold, andra domäner och externa system får inte läsa eller skriva GainPilot-minne utanför Hermes godkända scope.

**GP-365 — Central intelligens utan central genväg**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas får samordna och analysera GainPilot men får inte kringgå domänregler, approvals, säkerhetskontroller eller användarens mandat.

**GP-366 — Delegering skapar inte behörighet**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Den effektiva behörigheten ska alltid begränsas av agentens, domänens, tenantens, användarens och systemets mest restriktiva tillämpliga policy.

**GP-367 — Authority ska beviljas per capability**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Autonomi får inte ges som ett globalt agentprivilegium utan ska scopeas till funktion, projekt, datatyp, integration, användare och tidsperiod.

**GP-368 — Förtjänad bounded autonomy**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agentautonomi ska höjas genom verifierad kvalitet och kunna löpa ut, pausas eller återkallas efter incident, modellbyte eller policyförändring.

**GP-369 — Degraderad självständighet**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilots kritiska användarflöden ska kunna fortsätta säkert när Atlas, externa modeller eller mjuka Omnira-beroenden är otillgängliga.

**GP-370 — Idempotenta och återhämtningsbara workflows**  
*Kategori (derived/non-canonical): operations · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla GainPilot-workflows ska hantera retries, dubbletter, unknown outcome, compensation och verifierad återhämtning.

**GP-371 — Observerbar domän**  
*Kategori (derived/non-canonical): nutrition · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilots tjänster, agenter, workflows, kostnader, integrationer, beslut och säkerhetssignaler ska vara observerbara utan att känsliga payloads kopieras i onödan.

**GP-372 — Domänspecifikt nödstopp**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna stoppa en agent, capability, integration eller workflow utan att hela Omnira eller användarens lokala grundfunktioner måste stängas ned.

**GP-373 — Secrets ska förbli i valv**  
*Kategori (derived/non-canonical): memory · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Lösenord, tokens, API-nycklar och certifikat får inte lagras i kod, prompts, dokumentation, användarminnen eller agentkontext.

**GP-374 — Miljö- och produktionsisolering**  
*Kategori (derived/non-canonical): data · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Utveckling, test, preview, staging och produktion ska vara tydligt separerade, och produktionsdata får inte återanvändas okontrollerat.

**GP-375 — Canonical kunskap ska vara versionsstyrd**  
*Kategori (derived/non-canonical): data · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Godkänd GainPilot-arkitektur ska integreras som spårbar kunskap, medan körbara policies, schema och tester ska kompileras till tekniskt validerbara format.

**GP-376 — Ingen tyst avvikelse från canonical vision**  
*Kategori (derived/non-canonical): governance · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Implementation som avviker från godkända GainPilot-kontrakt ska dokumenteras, konsekvensbedömas och godkännas.

**GP-377 — Agentdriven utveckling kräver isolerat arbetsflöde**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Alla normala förändringar ska ske genom godkänt scope, ren arbetsyta, separat branch eller worktree, tester, pull request och review.

**GP-378 — Multitenant utan arbetsgivarinsyn**  
*Kategori (derived/non-canonical): agent · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Framtida coach-, gym- och företagstenants får endast tillgång till explicit delad eller aggregerad data och aldrig automatisk full åtkomst till individens privata GainPilot-profil.

**GP-379 — Portabel och lös koppling**  
*Kategori (derived/non-canonical): data · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna exportera användardata, ersätta leverantörer och i princip flyttas från Omnira utan att domänhistoriken blir obrukbar.

**GP-380 — Produktupplevelsen före plattformskomplexiteten**  
*Kategori (derived/non-canonical): safety · Sektion: 20.226 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Omniras interna arkitektur ska ge GainPilot större intelligens och säkerhet utan att användaren tvingas förstå eller hantera plattformens tekniska komplexitet.

### Kapitel 21 — Atlas och Arnold

**GP-381 — Atlas och Arnold är separata agentidentiteter**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och Arnold ska ha skilda roller, capabilities, minnesscope, verktyg, authority, versioner och auditspår.

**GP-382 — Arnold äger GainPilot-relationen**  
*Kategori (derived/non-canonical): nutrition · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska vara användarens huvudsakliga coach och produktgränssnitt för träning, kost, planering, progression och GainPilot-dialog.

**GP-383 — Atlas är central intelligens, inte användarcoach som standard**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska stödja strategi, samordning, research och tvärdomänanalys utan att ta över Arnolds löpande coachrelation.

**GP-384 — Arnold är inte en persona ovanpå Atlas**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska ha egen domänkompetens och policy och får inte reduceras till en annan ton för samma globala agent.

**GP-385 — Central intelligens får inte innebära central övervakning**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska endast få GainPilot-data genom definierat syfte, Hermes-minimering och rätt användar- och tenantscope.

**GP-386 — Ingen dold agentväxling**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det ska vara begripligt när Atlas, Arnold eller en specialistagent har skapat ett betydelsefullt svar eller beslut.

**GP-387 — Delegering ska vara strukturerad**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje agentdelegering ska ange mål, scope, data, verktyg, authority, budget, approval, resultatformat och stoppvillkor.

**GP-388 — Delegering breddar aldrig mandat**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En underagent får aldrig större datatillgång, authority, verktyg eller budget än den effektiva uppgiften tillåter.

**GP-389 — Resultat är inte beslut**  
*Kategori (derived/non-canonical): training · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Analys från Atlas, Arnold eller specialistagent ska inte automatiskt bli rekommendation, minne, programändring eller produktionsåtgärd.

**GP-390 — Hermes är obligatorisk kontextgräns**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

All betydelsefull minnes- och kontextdelning mellan Atlas, Arnold, GainPilot och andra domäner ska gå genom Hermes.

**GP-391 — Arnold får inte hela Atlas-minnet**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska endast få GainPilot-relevant och uttryckligt godkänd delad kontext och aldrig automatisk åtkomst till andra projekt eller privata Omnira-data.

**GP-392 — Atlas får inte hela GainPilot-minnet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska normalt använda reducerade signaler, aggregerad data och syftesbundna paket i stället för full individuell tränings-, kost- och coachhistorik.

**GP-393 — Capability före verktyg**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och Arnold ska agera genom tillåtna capabilities; teknisk tillgång till ett verktyg får aldrig i sig skapa rätt att använda det.

**GP-394 — Confidence och authority ska separeras**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hög säkerhet i en analys får inte ge agenten större mandat att genomföra åtgärden.

**GP-395 — Domänregel före generell agentinferens**  
*Kategori (derived/non-canonical): training · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilots validerade domän-, säkerhets- och progressionsregler ska normalt ha företräde framför Atlas eller en språkmodells generella bedömning.

**GP-396 — Förklaring ska följa verklig beslutskedja**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och Arnold får inte skapa efterhandsförklaringar som inte motsvarar använda data, regler, modeller och delegationer.

**GP-397 — Agentpersonlighet förändrar inte sanningen**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnolds coachton och Atlas strategiska ton får påverka presentation men aldrig fakta, policy, säkerhet, behörighet eller provenance.

**GP-398 — Agentkommunikation ska vara injektionssäker**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarinnehåll, webbkällor, importer och agentrespons får inte kunna ändra systempolicy, authority, verktyg eller minnesscope genom textinstruktioner.

**GP-399 — Agentkedjor ska vara idempotenta och avbrytbara**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Delegering ska stödja unik identitet, timeout, cancel, retry, unknown outcome, partiellt resultat och begränsat delegeringsdjup.

**GP-400 — Agentversioner ska kunna köras i shadow mode**  
*Kategori (derived/non-canonical): agent · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya Atlas- och Arnoldversioner ska valideras parallellt innan de påverkar användare eller produktion.

**GP-401 — Privat lärande och plattformslärande ska separeras**  
*Kategori (derived/non-canonical): training · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnolds användarspecifika personalisering får inte automatiskt bli Atlas- eller plattformsregel, modellträning eller annan användares kontext.

**GP-402 — Agenter får inte självmodifiera sitt mandat**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och Arnold får inte själva höja authority, lägga till verktyg, bredda minnesscope eller ändra sina produktionspolicies.

**GP-403 — Mänskligt ansvar ska vara explicit**  
*Kategori (derived/non-canonical): safety · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla strategiska, säkerhetsmässiga och högriskmässiga beslut ska ha identifierad mänsklig eller organisatorisk beslutsägare.

**GP-404 — Branch- och reviewstyrd agentutveckling**  
*Kategori (derived/non-canonical): memory · Sektion: 21.202 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ändringar av Atlas, Arnold, delegation, modeller, prompts, verktyg, minnesåtkomst och authority ska ske genom separat branch, tester, review, shadow mode och kontrollerad utrullning.

### Kapitel 22 — Hermes och isolerade minnesdomäner

**GP-405 — Hermes är en styrd gateway**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska kontrollera minnes- och kontextöverföring mellan domäner och får inte reduceras till ett obegränsat globalt minne eller en generell söktjänst.

**GP-406 — Domänen äger sitt råminne**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot och andra Omnira-domäner ska äga sina egna minnen, medan Hermes förmedlar godkänd åtkomst genom kontrakt.

**GP-407 — Minnesdomäner ska vara isolerade**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tenant-, användar-, projekt-, domän-, miljö-, cache-, fil-, kö- och indexisolering ska genomdrivas genom hela lagrings- och retrievalkedjan.

**GP-408 — Syfte före minnesåtkomst**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje Hermes-transaktion ska ha ett specifikt syfte, capability och mottagare innan data hämtas.

**GP-409 — Minsta tillräckliga kontext**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska leverera minsta mängd och precision av information som fortfarande gör uppgiften säker och användbar.

**GP-410 — Reducerad signal före rådata**  
*Kategori (derived/non-canonical): agent · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold och andra domäner ska använda aggregerade eller reducerade signaler när full källdata inte krävs.

**GP-411 — Kontextpaket ska vara tids- och uppgiftsbundna**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Paket ska ha identitet, syfte, giltighet, retention, förbjudna användningar och får inte automatiskt bli mottagarens långtidsminne.

**GP-412 — Fakta och inferens ska separeras**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Minnesposter och kontextpaket ska tydligt skilja användarbekräftade fakta, observationer, preferenser, inferenser, hypoteser, beslut och regler.

**GP-413 — Varje minne ska ha provenance och tid**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla minnesposter ska ha källa, skapandetid, giltighet, confidence och versionsstatus.

**GP-414 — Känsliga inferenser kräver starkt skydd**  
*Kategori (derived/non-canonical): safety · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte automatiskt skapa eller sprida känsliga slutsatser om hälsa, psykiskt tillstånd, relationer eller andra privata attribut.

**GP-415 — Användaren styr minnesscope**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna välja om ett minne är privat, projektspecifikt, delat, tidsbegränsat, låst, do-not-share, do-not-store eller do-not-infer.

**GP-416 — Minneskrivning ska vara kontrollerad**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Persistent minne ska skapas genom typning, klassificering, scope, riskbedömning, bekräftelse där det krävs, versionering och audit.

**GP-417 — Korrigering ska propageras**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När användaren rättar ett minne ska aktiva poster, härledda inferenser, index, cache och framtida beslut uppdateras enligt spårbar policy.

**GP-418 — Radering ska vara fullständig och verifierbar**  
*Kategori (derived/non-canonical): data · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Radering ska omfatta aktiv data, embeddings, index, cache, härledda poster och paket samt hantera backups genom dokumenterad retention.

**GP-419 — Semantisk relevans är inte behörighet**  
*Kategori (derived/non-canonical): authority · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Vektorsökning och ranking får endast ske efter hårda filter för tenant, användare, domän, dataklass, syfte och giltighet.

**GP-420 — Sammanfattning får inte skapa ny personlig sanning**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes ska bevara skillnaden mellan källfakta och tolkning och får inte hallucinera motiv, diagnoser, identiteter eller stabila preferenser.

**GP-421 — Privat personalisering är inte modellträning**  
*Kategori (derived/non-canonical): training · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnolds användarspecifika lärande ska hållas separat från plattformslärande, populationsanalys och extern eller intern grundmodellträning.

**GP-422 — Extern modellåtkomst ska vara explicit**  
*Kategori (derived/non-canonical): authority · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Data får endast lämnas till en extern modell när dataklass, leverantör, region, retention, användarmandat och uppgiftens nödvändighet tillåter det.

**GP-423 — Återkallande ska stoppa framtida åtkomst**  
*Kategori (derived/non-canonical): authority · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När användaren återkallar delning eller mandat ska nya läsningar stoppas och aktiva paket och uppgifter hanteras säkert.

**GP-424 — Hermes ska vara default deny**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Oklart syfte, saknat scope, fel tenant, otillräcklig authority eller okänd policy ska leda till nekad eller förtydligad förfrågan, inte bred åtkomst.

**GP-425 — Hermes ska fungera i degraderat läge utan policygenväg**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får använda giltig lokal domänkontext när Hermes är otillgängligt men får inte skapa ny tvärdomändelning eller kringgå minnesgränsen.

**GP-426 — Minnesbeslut ska vara observerbara**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Läsning, skrivning, minimering, delning, korrigering, radering och nekning ska kunna förklaras och auditeras utan att full privat payload lagras.

**GP-427 — Hermes får inte självmodifiera skyddet**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hermes, Atlas, Arnold och andra agenter får inte själva bredda scope, sänka dataklass, ta bort användarlås eller förlänga retention i produktion.

**GP-428 — Branch- och integritetsstyrd Hermesutveckling**  
*Kategori (derived/non-canonical): memory · Sektion: 22.225 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av minnesmodell, retrieval, minimering, retention, radering, modellrouting och policy ska ske genom separat branch, hotmodellering, tester, review, shadow mode och kontrollerad utrullning.

### Kapitel 23 — Analys, signaler och executive intelligence

**GP-429 — Analyskedjan ska vara explicit**  
*Kategori (derived/non-canonical): authority · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Händelse, observation, mätvärde, signal, analys, hypotes, rekommendation, beslut, mandat, åtgärd och effekt ska vara separata och spårbara steg.

**GP-430 — Signal är inte beslut**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ingen mätförändring, anomali, användarfeedback eller Atlas-analys får automatiskt förändra produkt, policy, pris, säkerhet eller agentmandat.

**GP-431 — Executive Intelligence ska vara multidimensionellt**  
*Kategori (derived/non-canonical): safety · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte reduceras till en enda health score, North Star eller intäktsmetrik utan separata dimensioner för användarnytta, säkerhet, integritet, kvalitet, teknik och verksamhet.

**GP-432 — Varje optimeringsmått kräver skyddsmått**  
*Kategori (derived/non-canonical): safety · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produkt- och affärsoptimering ska följas av mått som kan upptäcka försämrad säkerhet, integritet, användarkontroll, kvalitet eller långsiktig nytta.

**GP-433 — Metrik ska vara definierad och versionerad**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull metrik ska ha ägare, population, nämnare, tidsperiod, beräkningsmetod, datakälla, version och kända begränsningar.

**GP-434 — Appaktivitet är inte användarnytta**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Öppningar, klick, konversationslängd, loggning och skärmtid får inte ensamma användas som bevis på att GainPilot hjälper användaren.

**GP-435 — Domänspecifik framgång ska bevaras**  
*Kategori (derived/non-canonical): nutrition · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Träning, kost, CrossFit, calisthenics, återhämtning och följsamhet ska mätas enligt sina egna canonical modeller och får inte reduceras till en universell aktivitetsprocent.

**GP-436 — Korrelation får inte presenteras som kausalitet**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och analysagenter ska skilja association från orsak, redovisa alternativa förklaringar och uttrycka osäkerhet.

**GP-437 — Analys ska ha provenance och lineage**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Intelligence items, metrics, signals och rekommendationer ska kunna spåras till data, transformationsversion, modell, expert och beslutskontext.

**GP-438 — Saknad och ofullständig data ska synliggöras**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte tyst tolka saknad registrering som noll, frånvaro eller misslyckande.

**GP-439 — Segmentering ska vara integritetssäker**  
*Kategori (derived/non-canonical): privacy · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Känsliga, små eller återidentifierbara segment ska begränsas, minimeras eller döljas och får inte användas för olämplig profilering.

**GP-440 — Hermes ska minimera Executive Intelligence-data**  
*Kategori (derived/non-canonical): memory · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och analysagenter ska i första hand använda aggregat, reducerade signaler och tillräckligt stora segment i stället för full individuell GainPilot-data.

**GP-441 — Privat dialog är inte standardanalytik**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Fullständiga Arnold-konversationer får inte automatiskt användas för produkt-, affärs- eller modellanalys.

**GP-442 — Experiment får inte manipulera användaren**  
*Kategori (derived/non-canonical): safety · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte experimentera med skuld, rädsla, falsk brådska, sämre säkerhet, integritetsförlust eller försvårad uppsägning för att förbättra engagemang eller intäkt.

**GP-443 — Experiment kräver hypotes och stoppregel**  
*Kategori (derived/non-canonical): compliance · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje experiment ska ha definierad målgrupp, kontroll, primärt mått, skyddsmått, tidsperiod, ansvarig och stoppvillkor.

**GP-444 — Statistisk förändring är inte automatiskt produktvärde**  
*Kategori (derived/non-canonical): nutrition · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Resultat ska bedömas efter praktisk effekt, användarnytta, kostnad, risk och långsiktiga konsekvenser.

**GP-445 — Rekommendation och mandat ska separeras**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas får analysera och rekommendera men inte själv bevilja strategiskt, ekonomiskt, integritetsmässigt eller högriskmässigt mandat.

**GP-446 — Executive briefs ska vara beslutsorienterade**  
*Kategori (derived/non-canonical): nutrition · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Rapporter ska prioritera förändring, betydelse, evidens, osäkerhet, alternativ, risk, kostnad och beslut som krävs framför dekorativa mätvärden.

**GP-447 — Beslut ska följas till effekt**  
*Kategori (derived/non-canonical): product · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Betydelsefulla beslut ska ha förväntat resultat, skyddsmått, reviewdatum och möjlighet att fortsätta, ändra, stoppa eller rulla tillbaka.

**GP-448 — Felaktig analys ska konsekvensbedömas**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När data, metrik eller analys visar sig vara fel ska GainPilot identifiera vilka rapporter, rekommendationer, experiment och beslut som påverkades.

**GP-449 — Executive Intelligence får inte kringgå säkerhet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ingen produkt-, tillväxt- eller kostnadsanalys får användas för att tyst försvaga GainPilots säkerhets-, integritets- eller professionella gränser.

**GP-450 — Analysagenter ska vara scopeade och testade**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och specialistagenter ska ha deklarerat datasc ope, capability, modellversion, confidencekalibrering och teststatus.

**GP-451 — Nya analysversioner ska köras i shadow mode**  
*Kategori (derived/non-canonical): data · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya metric-, signal-, ranking-, analys- och rekommendationsmodeller ska jämföras utan beslutspåverkan innan begränsad utrullning.

**GP-452 — Executive Intelligence får inte självmodifiera målen**  
*Kategori (derived/non-canonical): agent · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas och analysagenter får inte själva ändra strategiska mål, North Star, datasc ope, metrikdefinitioner eller automatiseringsmandat i produktion.

**GP-453 — Branch- och reviewstyrd analysutveckling**  
*Kategori (derived/non-canonical): privacy · Sektion: 23.250 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av events, metrics, signaler, experiment, dashboards, Executive Intelligence och automatiska beslut ska ske genom separat branch, tester, integritetsgranskning, shadow mode och kontrollerad utrullning.

### Kapitel 24 — Agentdriven produktutveckling

**GP-454 — Agentdriven utveckling ska vara ett styrt system**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

AI-agenter ska arbeta genom definierade uppgifter, capabilities, arbetsmiljöer, tester, reviews och beslutsgränser — aldrig genom obegränsad repositoryåtkomst.

**GP-455 — Problem, förslag och implementation ska separeras**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En agentanalys eller lösningshypotes får inte automatiskt skapa kodändring, merge eller deployment.

**GP-456 — Varje utvecklingsuppgift ska ha explicit scope**  
*Kategori (derived/non-canonical): safety · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Uppgifter ska ange mål, acceptanskriterier, inkluderat och exkluderat scope, risk, filer, verktyg, tester och stoppvillkor.

**GP-457 — Scope får inte utökas tyst**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När agenten upptäcker arbete utanför mandatet ska den stoppa den delen, dokumentera behovet och begära nytt godkännande.

**GP-458 — Rätt specialist ska göra rätt arbete**  
*Kategori (derived/non-canonical): safety · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produktanalys, arkitektur, domänlogik, implementation, test, säkerhet, integritet, migration och release ska kunna utföras av separata ansvariga roller.

**GP-459 — Kompetensluckor ska redovisas**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En agent får inte fylla saknad domän-, teknik- eller säkerhetskompetens med självsäker fri generering.

**GP-460 — Repository och arbetsyta ska verifieras**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Före ändring ska agenten kontrollera repository, branch, worktree, upstream, HEAD och orelaterade ändringar.

**GP-461 — Orelaterat arbete ska skyddas**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter får inte stagea, ändra, återställa, flytta eller radera användarens eller andra agenters orelaterade filer utan uttryckligt mandat.

**GP-462 — Normal utveckling ska ske isolerat**  
*Kategori (derived/non-canonical): governance · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produktförändringar ska genomföras på separat branch eller worktree och inte direkt i main.

**GP-463 — Minsta nödvändiga förändring ska prioriteras**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenten ska undvika orelaterad refaktorering, överarkitektur, dependencyökning och bred diff som inte krävs av acceptanskriterierna.

**GP-464 — Canonical kunskap ska verifieras mot implementation**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Böcker, kodgrafer och agentindex ska styra förståelse men får inte användas som bevis för faktisk kod utan kontroll av repositoryt.

**GP-465 — Kritisk logik får inte endast ligga i prompt**  
*Kategori (derived/non-canonical): authority · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Behörighet, säkerhet, domänregler, datakontrakt och högriskbeslut ska genomdrivas genom kod, schema, policy och tester.

**GP-466 — Agentgenererad kod har samma kvalitetskrav**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kod från agenter ska vara begriplig, testbar, säker, underhållbar och följa GainPilots arkitektur- och stilregler.

**GP-467 — Testbevis krävs före färdigstatus**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter får inte rapportera en implementation som färdig innan obligatoriska tester har körts och begränsningar redovisats.

**GP-468 — Oberoende kontroll ska användas vid risk**  
*Kategori (derived/non-canonical): safety · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hög- och kritisk risk ska kräva separat test-, domän-, säkerhets-, integritets- eller mänsklig review.

**GP-469 — Pull request är normal leveransgräns**  
*Kategori (derived/non-canonical): safety · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Alla vanliga produktförändringar ska levereras genom fokuserad pull request med scope, risk, testresultat, migration och rollback.

**GP-470 — Merge och deployment är separata beslut**  
*Kategori (derived/non-canonical): governance · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En godkänd eller mergad PR får inte beskrivas som live förrän deployment och produktionsverifiering är bekräftade.

**GP-471 — Agentstatus ska motsvara verifierat tillstånd**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Påståenden om analys, ändring, test, commit, push, PR, merge och deployment ska stödjas av faktisk verktygs- eller systemevidens.

**GP-472 — Högriskdeployment ska vara progressiv**  
*Kategori (derived/non-canonical): training · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar i säkerhet, data, agenter, programlogik och centrala domänmotorer ska använda staging, feature flags, canary, stoppregler och rollback där relevant.

**GP-473 — Teknisk leverans och produktnytta ska separeras**  
*Kategori (derived/non-canonical): governance · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Merge eller deployment innebär inte att förändringen är validerad; avsedd effekt och skyddsmått ska följas upp.

**GP-474 — Meningsbärande projektmaterial ska bevaras**  
*Kategori (derived/non-canonical): governance · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Branches, worktrees, dokument, kod och artefakter får inte raderas innan innehållet har identifierats, säker kopia verifierats och borttagning godkänts.

**GP-475 — Agenter får inte självmodifiera sitt utvecklingsmandat**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Utvecklingsagenter får inte själva höja behörighet, ändra branch protection, lägga till secrets, ge sig merge- eller deploymenträtt eller ändra sitt produktionsmanifest.

**GP-476 — Utvecklingsautonomi ska förtjänas per capability**  
*Kategori (derived/non-canonical): authority · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Read, branch-write, commit, push, PR, merge och deployment ska vara separata och återkalleliga mandat som höjs genom verifierad kvalitet.

**GP-477 — Agentutveckling ska vara branch-, test- och reviewstyrd**  
*Kategori (derived/non-canonical): agent · Sektion: 24.215 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av produkt, agenter, prompts, policies, schema, modeller och utvecklingsverktyg ska ske genom separat branch, tester, kvalificerad review, kontrollerad utrullning och effektuppföljning.

### Kapitel 25 — Branch-, test-, PR- och mergegovernance

**GP-478 — Leveranstillstånd ska vara separata**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Lokal ändring, testad kod, commit, push, PR, review, merge, deployment, produktionsverifiering och validerad effekt ska representeras som skilda tillstånd.

**GP-479 — Main ska vara skyddad huvudlinje**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Normal utveckling får endast nå main genom godkänd pull request, required checks och behörigt mergebeslut.

**GP-480 — Repositorymiljön ska verifieras före förändring**  
*Kategori (derived/non-canonical): operations · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Repository, remote, branch, worktree, upstream, HEAD, status och pågående gitoperationer ska kontrolleras innan skrivande arbete.

**GP-481 — Orelaterade ändringar får aldrig följa med**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Staging, commit, push och PR ska endast innehålla granskade filer och hunks inom godkänt scope.

**GP-482 — Meningsbärande projektmaterial ska bevaras**  
*Kategori (derived/non-canonical): authority · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Filer, branches, worktrees, dokument och artefakter får inte raderas innan innehåll, canonical status, säker kopia och borttagningsmandat har verifierats.

**GP-483 — Commits ska vara fokuserade och bevisbara**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje commit ska representera en begriplig förändring, ha korrekt identitet och inte beskrivas som skapad förrän hash och branch verifierats.

**GP-484 — Testresultat ska vara commit- och miljöbundna**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett testbevis ska ange kommando, commit, miljö, status, skips och begränsningar och får inte återanvändas efter relevant kodförändring.

**GP-485 — Risk ska styra testmatrisen**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Testkrav ska öka med domän-, säkerhets-, integritets-, migrations- och produktionsrisk och får inte reduceras till en universell minimikontroll.

**GP-486 — Skipped och not run är inte passed**  
*Kategori (derived/non-canonical): training · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Alla ej körda, avbrutna, instabila och karantänsatta tester ska redovisas och får inte presenteras som fullständigt godkänd testsvit.

**GP-487 — CI är en oberoende verifieringsgräns**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Lokala tester får inte ersätta required remote checks som körs mot rätt commit i kontrollerad miljö.

**GP-488 — Pull request ska vara normal granskningsgräns**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje vanlig förändring ska levereras genom fokuserad PR med problem, scope, testbevis, risk, migration, rollout och rollback.

**GP-489 — PR-beskrivning ska motsvara faktisk diff**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatiska eller manuella sammanfattningar får inte påstå implementation, tester eller påverkan som inte kan verifieras i kod och evidens.

**GP-490 — Review ska vara roll- och riskbaserad**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Berörda code owners, domän-, säkerhets-, integritets-, data- och releaseansvariga ska granskas enligt paths och riskklass.

**GP-491 — Författaren får inte ensam godkänna kritisk förändring**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hög- och kritisk risk ska kräva oberoende review och vid behov fyraögonsprincip.

**GP-492 — Reviewkommentarer ska lösas verkligt**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Blockerande och required kommentarer får inte markeras lösta utan kodändring, test, dokumentation eller accepterad motivering.

**GP-493 — Merge readiness ska vara explicit**  
*Kategori (derived/non-canonical): compliance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En PR får endast betraktas som merge ready när base, checks, reviews, conversations, scope, migration, rollout, rollback och ansvarigt beslut är verifierade.

**GP-494 — Merge kräver separat mandat**  
*Kategori (derived/non-canonical): authority · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Rätt att skriva, committa, pusha eller skapa PR ger inte automatisk rätt att mergea.

**GP-495 — Closed är inte merged och merged är inte deployed**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

PR-, merge-, release- och deploymentstatus ska hämtas från verkligt systemtillstånd och aldrig härledas från otydlig text.

**GP-496 — Deployment ska vara progressiv och verifierbar**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Högre risk ska använda skyddade miljöer, artefaktidentitet, staging, flags, canary, stoppregler, rollback och produktionsverifiering.

**GP-497 — Dataförändringar kräver särskild rollbackmodell**  
*Kategori (derived/non-canonical): data · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Schema- och datamigrationer ska ha kompatibilitets-, repair- eller compensationplan och får inte förlita sig på blind kodrevert.

**GP-498 — Produktionshälsa ska verifieras efter deployment**  
*Kategori (derived/non-canonical): safety · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Rätt artefakt, migration, flags, centrala flöden, logs, metrics och skyddsmått ska kontrolleras innan produktionen beskrivs som verifierad.

**GP-499 — Statusrapportering ska vara evidensbaserad**  
*Kategori (derived/non-canonical): agent · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter och människor ska endast rapportera test, commit, push, PR, merge, deployment och validering som genomförda när verifierbara bevis finns.

**GP-500 — Governance får inte självmodifieras av utvecklingsagenten**  
*Kategori (derived/non-canonical): agent · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter får inte själva ta bort checks, sänka reviewkrav, ändra CODEOWNERS, ge sig merge- eller deploymentmandat eller kringgå protected environments.

**GP-501 — Governanceförändringar ska själva följa governance**  
*Kategori (derived/non-canonical): governance · Sektion: 25.289 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Branch-, test-, CI-, review-, merge-, release- och deploymentregler ska ändras genom separat branch, policytester, oberoende review och kontrollerad utrullning.

### Kapitel 26 — Behörigheter, autonomi och godkännanden

**GP-502 — Behörighet ska vara explicit och tekniskt genomdriven**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Identitet, roll eller agentpersonlighet får inte i sig ge rätt att läsa, skriva, dela, spendera, radera eller påverka systemtillstånd.

**GP-503 — Default deny ska gälla**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

När giltigt grant, scope, capability eller approval inte kan verifieras ska handlingen nekas, förberedas eller eskaleras.

**GP-504 — Minsta privilegium ska gälla hela kedjan**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje människa, agent, integration och workflow ska endast få den capability, data, authority, miljö och tid som uppgiften kräver.

**GP-505 — Authority ska vara capabilityspecifik**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

L0–L6 ska tilldelas per capability och scope och får aldrig behandlas som en global agentnivå.

**GP-506 — Föreslå, förbereda, godkänna, genomföra och verifiera ska separeras**  
*Kategori (derived/non-canonical): product · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Rätt att utföra ett steg får inte automatiskt ge rätt att utföra nästa eller godkänna den egna handlingen.

**GP-507 — Agenter får inte bevilja sig själva mandat**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold och andra agenter får inte själva höja authority, bredda scope, förlänga giltighet eller ta bort approvalkrav.

**GP-508 — Approval ska vara exakt och tidsbegränsat**  
*Kategori (derived/non-canonical): nutrition · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Godkännanden ska avse en tydligt beskriven handling, effekt, resursversion, kostnad, risk och giltighetsperiod.

**GP-509 — Tystnad är inte godkännande**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Avsaknad av svar, timeout eller utebliven reaktion får inte tolkas som approval.

**GP-510 — Approval får inte användas som mörk bundling**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Operativ handling, datadelning, köp, marknadsföring och andra separata beslut får inte döljas i ett enda otydligt godkännande.

**GP-511 — Autonomi ska förtjänas per capability**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Verifierad kvalitet i en handlingstyp får endast påverka autonomin för samma eller uttryckligt relaterade capability.

**GP-512 — Hög confidence skapar inte högre authority**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agentens säkerhet i sin analys får aldrig i sig ge större mandat eller lägre approvalkrav.

**GP-513 — Autonomi ska vara begränsad och återkallelig**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje autonomt mandat ska ha scope, riskgräns, budget, rapporteringsregel, expiry eller review och omedelbar revocation.

**GP-514 — Approvaltrötthet får inte användas för att skapa bred fullmakt**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska minska onödiga approvals genom riskbaserade och granulära mandat, inte genom att pressa användaren till obegränsad autonomi.

**GP-515 — Kostnad kräver separat budgetmandat**  
*Kategori (derived/non-canonical): nutrition · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Permission att använda en capability ger inte automatiskt rätt att skapa kostnad, köp, abonnemang eller leverantörsåtagande.

**GP-516 — Delegation får aldrig bredda rättigheter**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En delegat eller underagent får aldrig större authority, scope, budget eller datatillgång än delegatorn och den aktuella uppgiften tillåter.

**GP-517 — Revocation ska få snabb och fullständig effekt**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Återkallande ska stoppa nya handlingar, tokens, delegation och cachead permission samt hantera pågående och offlinearbete säkert.

**GP-518 — Nödstopp ska vara granulärt**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna stoppa agent, capability, projekt, writeplan eller hela systemet utan att säkra read-only-funktioner försvinner i onödan.

**GP-519 — Återstart ska vara kontrollerad**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Autonomi och writebehörighet får inte återställas fullt ut efter incident utan verifiering, review och relevant approval.

**GP-520 — Behörighet ska verifieras vid execution**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Approval eller grant ska omprövas mot aktuell resursversion, risksignal, expiry och context för att motverka replay och TOCTOU-fel.

**GP-521 — Autonoma handlingar ska vara förklarbara**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna se vad som gjordes, varför, vilket mandat som användes, vilken data som påverkade beslutet och hur handlingen kan återställas.

**GP-522 — Permission enforcement ska finnas i flera lager**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

UI, agentruntime, capabilitygateway, tjänst, databas, verktyg och downstreamsystem ska tillsammans förhindra kringgående.

**GP-523 — Permissionincidenter ska konsekvensanalyseras**  
*Kategori (derived/non-canonical): nutrition · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Obehörig access eller execution ska spåras till använd data, handlingar, kostnader, mottagare och eventuell kompensation.

**GP-524 — Agenter får inte självmodifiera permissiongovernance**  
*Kategori (derived/non-canonical): agent · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter får inte ändra capabilityregister, authoritytak, riskklasser, approvalpolicy, budgetskydd, branchskydd eller nödstopp i produktion.

**GP-525 — Behörighets- och autonomiutveckling ska vara branch- och reviewstyrd**  
*Kategori (derived/non-canonical): authority · Sektion: 26.302 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar av permissions, approvals, authority, delegation, budget, nödstopp och autonomi ska ske genom separat branch, negativa tester, säkerhets- och integritetsreview, shadow mode och kontrollerad utrullning.

### Kapitel 27 — Drift, observability, incidenter och återhämtning

**GP-526 — Drift ska bedömas per capability**  
*Kategori (derived/non-canonical): safety · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte beskriva hela produkten som frisk eller nere utan att kunna visa vilka användarförmågor, beroenden och datavägar som fungerar, är degraderade eller stoppade.

**GP-527 — Process health är inte produkthälsa**  
*Kategori (derived/non-canonical): safety · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En svarande tjänst eller grön infrastrukturkontroll får inte användas som enda bevis för att centrala GainPilot-flöden fungerar korrekt och säkert.

**GP-528 — Observability ska följa hela beslutskedjan**  
*Kategori (derived/non-canonical): memory · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarintention, agent, Hermes, permission, capability, verktyg, event, lagring och användarresultat ska kunna korreleras genom stabila identiteter och spårbar provenance.

**GP-529 — Loggar ska vara strukturerade och minimerade**  
*Kategori (derived/non-canonical): agent · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produktionloggar och traces ska ge tillräcklig diagnostik utan att lagra full privat användardata, secrets eller onödiga agentpayloads.

**GP-530 — Domän- och användarsignaler ska komplettera tekniska metrics**  
*Kategori (derived/non-canonical): training · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tillgänglighet, latency och error rate ska kompletteras med mått för datakorrekthet, programfunktion, träningsloggning, permission, agentkvalitet och verklig användarpåverkan.

**GP-531 — SLO ska definieras per kritisk capability**  
*Kategori (derived/non-canonical): product · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska ha mätbara mål för centrala förmågor och får inte förlita sig enbart på en generell tjänsteuptime.

**GP-532 — Unknown outcome ska vara ett explicit tillstånd**  
*Kategori (derived/non-canonical): product · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Timeout, avbrutet workflow eller osäker downstreamrespons får inte automatiskt klassificeras som failure eller success.

**GP-533 — Retry får endast ske efter säker klassificering**  
*Kategori (derived/non-canonical): operations · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Systemet ska verifiera operation, side effects, idempotency identity och resursversion innan en osäker handling görs om.

**GP-534 — Side effects ska vara idempotenta eller deduplicerade**  
*Kategori (derived/non-canonical): training · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Workout-save, programaktivering, kalenderwrite, köp, publicering och andra betydelsefulla writes ska skyddas mot dubbla effekter.

**GP-535 — Asynkrona meddelanden ska tåla dubblering och fel ordning**  
*Kategori (derived/non-canonical): product · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Events, queues och consumers ska ha stabil identitet, version, provenance, deduplicering och definierad orderingmodell.

**GP-536 — Degradering får inte kringgå skydd**  
*Kategori (derived/non-canonical): authority · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Safe mode och fallback får aldrig hoppa över tenantisolering, permission, säkerhetsbegränsning, dataminimering eller kritisk domänkontroll.

**GP-537 — Offlinearbete ska bevaras och synkas säkert**  
*Kategori (derived/non-canonical): training · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Lokala träningsresultat och andra offlinewrites ska ha stabil identitet, versionskontroll, konfliktmodell och idempotent synkronisering.

**GP-538 — Backup ska bevisas genom restore**  
*Kategori (derived/non-canonical): data · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Backupstatus får inte betraktas som tillräckligt skydd förrän data, tenantisolering, radering och centrala flöden har verifierats efter återställning.

**GP-539 — Restore får inte återaktivera raderad data**  
*Kategori (derived/non-canonical): privacy · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarraderingar, revocations och andra skyddstillstånd ska återappliceras och verifieras efter backuprestore.

**GP-540 — Incidenter ska klassificeras efter verklig påverkan**  
*Kategori (derived/non-canonical): safety · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Severity ska ta hänsyn till säkerhet, integritet, data, användare, ekonomi, blast radius och pågående skada — inte endast tekniskt felantal.

**GP-541 — Containment ska prioriteras före kosmetisk återställning**  
*Kategori (derived/non-canonical): data · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Incidentrespons ska först stoppa fortsatt påverkan, skydda data och begränsa blast radius innan dashboards, automation eller full funktion återställs.

**GP-542 — Bevis och projektmaterial ska bevaras**  
*Kategori (derived/non-canonical): data · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Loggar, data, branches, worktrees, artefakter och andra incidentbevis får inte raderas eller skrivas över innan påverkan har analyserats och säker kopia verifierats.

**GP-543 — Recovery ska vara gradvis och verifierad**  
*Kategori (derived/non-canonical): agent · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Capabilities, agentsystem, writes och autonomy ska återstartas stegvis efter kontroller, tester och relevant approval.

**GP-544 — Incidentkommunikation ska skilja fakta från hypotes**  
*Kategori (derived/non-canonical): operations · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Intern och extern status får inte presentera osäkra orsaker, estimat eller full recovery som verifierade fakta.

**GP-545 — Incident closure ska kräva mer än återställd tjänst**  
*Kategori (derived/non-canonical): data · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Aktiv påverkan, data, användarkommunikation, root-cause-status, action items och ansvarig acceptans ska bedömas innan incidenten stängs.

**GP-546 — Auto-remediation ska vara begränsad och auditerad**  
*Kategori (derived/non-canonical): authority · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatisk återställning får endast utföra tydligt definierade, testade och säkra steg med stoppregler och utan att skapa bredare mandat.

**GP-547 — Agentdrift ska kunna sänka authority**  
*Kategori (derived/non-canonical): agent · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Försämrad kvalitet, bredare databruk, avvikande tool use eller högre korrigeringsgrad ska kunna pausa capability eller återföra agenten till propose-only.

**GP-548 — Operativa skydd ska testas genom realistiska fel**  
*Kategori (derived/non-canonical): authority · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska regelbundet testa timeout, dependency failure, stale permission, duplicate events, unknown outcome, offlinekonflikt, backuprestore, nödstopp och gradvis återstart.

**GP-549 — Drift- och recoveryförändringar ska följa full governance**  
*Kategori (derived/non-canonical): operations · Sektion: 27.354 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Alerts, SLO, retries, runbooks, auto-remediation, backup, restore, incidentflöden och recoveryautomation ska ändras genom separat branch, feltester, review, shadow mode, canary och verifierad utrullning.

### Kapitel 28 — Krisläge, nödbroms och verksamhetskontinuitet

**GP-550 — Krisläge ska vara ett explicit operating mode**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska tekniskt kunna växla mellan normal, degraded, incident, crisis, disaster, recovery och verifying med definierade effekter på capabilities, authority, data, budget och automation.

**GP-551 — Kris ska skiljas från vanlig incident**  
*Kategori (derived/non-canonical): safety · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Krisläge ska endast användas när påverkan, osäkerheten, koordinationsbehovet eller systemrisken överstiger ordinarie incidenthanteringsförmåga.

**GP-552 — Nödbromsen ska vara granulär**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Systemet ska kunna stoppa operation, capability, agent, användare, tenant, projekt, integration, writeplan eller hela Omnira utan att säkra funktioner försvinner i onödan.

**GP-553 — Minsta tillräckliga stopp ska prioriteras**  
*Kategori (derived/non-canonical): safety · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Containment ska begränsa fortsatt skada med minsta möjliga blast radius och samtidigt bevara säkra kärnfunktioner.

**GP-554 — Kritisk nödbroms ska kunna aktiveras snabbt**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Verifierad omedelbar risk ska kunna stoppas av särskilt behörig aktör innan full normal approvalkedja är klar, med omedelbar audit och eftergranskning.

**GP-555 — Nödbromsens verkliga effekt ska verifieras**  
*Kategori (derived/non-canonical): safety · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett UI-tillstånd eller skickat stoppkommando får inte betraktas som tillräckligt; alla relevanta tjänster, workers, tokens, köer och enheter ska kontrolleras.

**GP-556 — Krisläge ska normalt minska autonomi**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold och andra agenter ska inte få bredare authority genom krisdeklaration; execution, delegation, dataåtkomst och budget ska normalt begränsas.

**GP-557 — Safe mode ska bevara säkra kärnfunktioner**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska där möjligt kunna läsa verifierad plan, logga lokalt, se status och behålla kontroll utan nya osäkra agent- eller molnwrites.

**GP-558 — Kontinuitet ska definieras per capability**  
*Kategori (derived/non-canonical): operations · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska ha en prioriterad lista över kritiska, viktiga och pausbara capabilities samt definierad minsta verksamhetsnivå.

**GP-559 — Krisledning ska ha tydliga roller och beslutsmandat**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Krisledare, teknisk ledare, säkerhets-/integritetsansvarig, domänansvarig, kontinuitetsansvarig och kommunikationsansvarig ska ha tydliga och separerade uppgifter.

**GP-560 — Lägesbilden ska skilja fakta från hypotes**  
*Kategori (derived/non-canonical): safety · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Verifierade fakta, osäkerheter, antaganden, beslut och åtgärder ska presenteras separat och tidsstämplat.

**GP-561 — Data och bevis ska bevaras före reparation**  
*Kategori (derived/non-canonical): data · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Krisrespons får inte radera, skriva över eller förändra relevanta loggar, lagringsmedia, branches, data eller artefakter innan påverkan och bevarandebehov har bedömts.

**GP-562 — Krisaccess ska vara minimerad och ärendebunden**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Krisläge får inte automatiskt ge agenter, support eller utvecklare obegränsad åtkomst till produktionsdata, secrets eller privata användardomäner.

**GP-563 — Krisbudgeten ska vara begränsad**  
*Kategori (derived/non-canonical): product · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Akut behov får möjliggöra särskild spend men budgeten ska vara tids-, belopps-, leverantörs- och krisbunden.

**GP-564 — Kommunikation ska vara samordnad och sann**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold, Atlas, support, status page och direkt användarinformation ska bygga på samma verifierade lägesbild och får inte presentera osäker orsak eller recovery som faktum.

**GP-565 — Recovery ska återställa kontroll före automation**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Identitet, tenantisolering, dataintegritet, permissions och manuella kärnflöden ska verifieras före agentwrites och högre autonomi.

**GP-566 — Backlog får inte återspelas blint**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Köade writes, approvals, workflows och användarintentioner ska omprövas för relevans, expiry, idempotens och aktuell kontext efter kris.

**GP-567 — Normal mode ska kräva explicit beslut**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Gröna metrics eller återställd tjänst får inte automatiskt återställa full automation, authority, dataåtkomst eller normal drift.

**GP-568 — Krisavslut ska ha verifierbara kriterier**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Fortsatt skada, identitet, isolering, data, capabilities, authority, kommunikation och kvarvarande risk ska bedömas innan krisläge avslutas.

**GP-569 — Efterkrisövervakning ska kunna förstärkas**  
*Kategori (derived/non-canonical): authority · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna behålla lägre autonomi, tätare observability och striktare review under en tidsbegränsad stabiliseringsperiod.

**GP-570 — Krisförmågan ska övas**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nödbroms, safe mode, reservroller, leverantörsbortfall, komprometterad identitet, dataförlust, agentkontroll och gradvis återstart ska testas regelbundet.

**GP-571 — Grundar- och leverantörsberoenden ska ha reservplan**  
*Kategori (derived/non-canonical): product · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte vara helt beroende av en enda person, enhet, leverantör, region eller åtkomstväg för att kunna stoppa, bevara och återställa systemet.

**GP-572 — Atlas får stödja men inte ensam äga krisen**  
*Kategori (derived/non-canonical): agent · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska kunna sammanställa och rekommendera men får inte ensam ge sig systemmandat, deklarera avslut eller återställa full authority.

**GP-573 — Krissystemet ska utvecklas genom full governance**  
*Kategori (derived/non-canonical): training · Sektion: 28.232 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Operating modes, nödbromsar, safe mode, reservaccess, krisbudget, kommunikation och recovery ska ändras genom separat branch, negativa tester, övningar, review, shadow mode och kontrollerad utrullning.

### Kapitel 29 — Kommersiella modeller och skalbarhet

**GP-574 — Kommersiellt värde ska bygga på användarnytta**  
*Kategori (derived/non-canonical): training · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska monetiseras genom tydlig struktur, intelligens, anpassning och långsiktigt stöd — inte genom kroppsskam, rädsla, skuld eller artificiellt beroende.

**GP-575 — Säkerhet och användarkontroll får inte premiumlåsas**  
*Kategori (derived/non-canonical): training · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Grundläggande dataskydd, permissions, approvals, nödstopp, export och säker inloggning ska vara tillgängliga oavsett kommersiell plan.

**GP-576 — Erbjudanden ska vara versionshanterade**  
*Kategori (derived/non-canonical): commercial · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Pris, capabilities, usagegränser, support, automation och villkor ska kopplas till en explicit erbjudandeversion.

**GP-577 — Paketering ska följa sammanhängande värde**  
*Kategori (derived/non-canonical): commercial · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte skapa godtyckliga begränsningar eller separata betalväggar som gör ett grundläggande användarflöde ofullständigt eller vilseledande.

**GP-578 — Pris och debitering ska vara transparenta**  
*Kategori (derived/non-canonical): commercial · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Totalpris, valuta, skatt, period, förnyelse, rabatt, usage och uppsägning ska vara tydliga före köp.

**GP-579 — Provperiod får inte skapa dold betalning**  
*Kategori (derived/non-canonical): memory · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Startdatum, första debitering, belopp och avbrytande ska visas tydligt, och användaren ska kunna få påminnelse före betalning.

**GP-580 — Betalning får inte skapa större agentauthority**  
*Kategori (derived/non-canonical): agent · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kommersiell entitlement och användarens permission- och autonomival ska förbli separata kontrollsystem.

**GP-581 — Uppsägning och nedgradering ska vara rättvisa**  
*Kategori (derived/non-canonical): security · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det ska vara enkelt att avsluta, pausa eller sänka plan, och användarens data, export och säkerhetskontroll får inte användas som påtryckningsmedel.

**GP-582 — Usage-baserad kostnad ska ha tak och förklaring**  
*Kategori (derived/non-canonical): nutrition · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Variabel kostnad ska vara mätbar, förhandsvisad, spårbar och begränsad genom användar- eller organisationskontroller.

**GP-583 — Individdata får inte säljas**  
*Kategori (derived/non-canonical): nutrition · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte sälja individuell tränings-, kost-, hälso-, beteende- eller kommunikationsdata till annonsörer, partners eller andra externa parter.

**GP-584 — Kommersiell personalisering ska vara minimerad**  
*Kategori (derived/non-canonical): memory · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Känsliga signaler, kroppsmissnöje, låg motivation eller missade mål får inte användas för manipulerande försäljning eller individuell prisökning.

**GP-585 — Sponsring och ekonomiska relationer ska märkas**  
*Kategori (derived/non-canonical): agent · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold och andra GainPilot-ytor ska tydligt skilja neutral vägledning från sponsring, affiliate, marketplaceinnehåll och GainPilots egna erbjudanden.

**GP-586 — Abonnemang, entitlement och permission ska separeras**  
*Kategori (derived/non-canonical): authority · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Billingstatus ska avgöra kommersiell tillgång, medan identity, permission, risk och approval fortsatt ska avgöra om en handling får genomföras.

**GP-587 — Betalningshändelser ska vara idempotenta**  
*Kategori (derived/non-canonical): commercial · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Checkout, renewal, upgrade, refund, credits och betalningswebhooks ska tåla dubbletter, fel ordning, retries och unknown outcome utan dubbel debitering.

**GP-588 — Data får inte hållas som gisslan vid betalningsproblem**  
*Kategori (derived/non-canonical): privacy · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna kontrollera integritet, exportera data, förstå sin betalningsstatus och avsluta tjänsten även när betalning misslyckats.

**GP-589 — AI-kostnad ska mätas per capability och värde**  
*Kategori (derived/non-canonical): nutrition · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna koppla modell-, infrastruktur- och supportkostnad till användarsegment, plan och verkliga värdehändelser.

**GP-590 — Kostnadsoptimering får inte försvaga kvalitet eller säkerhet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Billigare modell, kortare kontext eller färre kontroller får endast användas när domänkorrekthet, användarvärde och säkerhetsnivå kan bevaras.

**GP-591 — Unit economics ska redovisa osäkerhet**  
*Kategori (derived/non-canonical): safety · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tidiga marginal-, LTV-, CAC- och paybackberäkningar ska visa antaganden, dataperiod, segment och osäkerhet.

**GP-592 — Tillväxt ska ske efter produkt- och ekonomibevis**  
*Kategori (derived/non-canonical): product · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska inte skala annonsering, organisation eller infrastruktur aggressivt innan erbjudande, retention, supportförmåga och unit economics är tillräckligt förstådda.

**GP-593 — Skalbarhet ska omfatta fler dimensioner än teknik**  
*Kategori (derived/non-canonical): training · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användare, ekonomi, support, språk, länder, träningsmål, data, agentsystem, organisation och governance ska skalas tillsammans.

**GP-594 — Gemensam plattform ska kombineras med projektisolering**  
*Kategori (derived/non-canonical): memory · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska återanvända Omniras identitet, Atlas, Hermes, billing, observability och governance utan att blanda användardata, ekonomi eller permissions med andra projekt.

**GP-595 — Organisationer får inte köpa obegränsad individåtkomst**  
*Kategori (derived/non-canonical): agent · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

B2B-, gym-, coach- och företagsplaner ska använda minimerad och ändamålsbegränsad data samt individuella permissions.

**GP-596 — Kommersiella experiment ska ha guardrails**  
*Kategori (derived/non-canonical): safety · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Pris-, plan-, kampanj- och usageexperiment ska bedömas genom konvertering, retention, support, refunds, marginal, säkerhet och förtroende.

**GP-597 — Kommersiell status ska vara tekniskt verifierbar**  
*Kategori (derived/non-canonical): authority · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Marknadsföring, erbjudandeversion, checkout, billing och faktisk entitlement ska överensstämma och drift ska upptäckas.

**GP-598 — Kommersiella incidenter ska korrigeras öppet**  
*Kategori (derived/non-canonical): authority · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Fel pris, dubbel debitering, fel entitlement eller missvisande villkor ska stoppas, kompenseras, kommuniceras och eftergranskas.

**GP-599 — Atlas får analysera men inte ensamt besluta kommersiellt**  
*Kategori (derived/non-canonical): agent · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska kunna skapa prognoser och rekommendationer men får inte själv ändra pris, villkor, kampanj, budget eller marknadsexpansion.

**GP-600 — Kommersiell utveckling ska följa full governance**  
*Kategori (derived/non-canonical): authority · Sektion: 29.396 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Priser, planer, billing, entitlements, usage, rabatter, marketplace och kommersiell AI-logik ska ändras genom separat branch, tester, review, shadow billing, pilot, canary och cohortuppföljning.

### Kapitel 30 — Juridik, etik, ansvar och regulatorisk beredskap

**GP-601 — Juridik och etik ska genomdrivas i produkten**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte förlita sig enbart på villkor eller friskrivningar; professionella gränser, dataskydd, konsumentskydd och riskkontroller ska påverka faktisk capability-execution.

**GP-602 — Bedömning ska ske per capability och marknad**  
*Kategori (derived/non-canonical): product · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Juridisk klassificering, användarkrav och kontrollnivå ska knytas till funktionens avsedda syfte, verkliga beteende, målgrupp och jurisdiktion.

**GP-603 — Marknadsföring och funktion ska beskriva samma produkt**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte marknadsföra medicinsk, diagnostisk eller garanterad effekt samtidigt som villkoren beskriver tjänsten som allmän information.

**GP-604 — Arnold får inte utge sig för att vara legitimerad vårdpersonal**  
*Kategori (derived/non-canonical): agent · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agentens identitet, roll, kompetensgräns och AI-natur ska vara tydliga för användaren.

**GP-605 — Risksignal är inte diagnos**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får identifiera signaler och rekommendera professionell eller akut hjälp men får inte presentera osäker inferens som medicinsk diagnos.

**GP-606 — Akut risk ska begränsa berörd automation**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Vid relevanta högrisksignaler ska GainPilot kunna stoppa belastningsökning, programaktivering eller annan osäker execution och ge ett säkert eskaleringssvar.

**GP-607 — Professionell hänvisning ska vara proportionerlig**  
*Kategori (derived/non-canonical): product · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska skilja normal variation, observationsbehov, snar professionell bedömning och möjlig akut situation utan vare sig falsk trygghet eller systematisk alarmism.

**GP-608 — GainPilot får inte förstärka skadligt beteende**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produkten ska motverka kroppsskam, tvångsmässig träning, extremt energiunderskott, kompensatoriskt beteende och moralisering av mat, vila eller missade pass.

**GP-609 — Användarens självbestämmande ska stärkas**  
*Kategori (derived/non-canonical): agent · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold ska förklara och stödja användarens egen förståelse och får inte utformas för emotionellt eller funktionellt beroende.

**GP-610 — Ansvar ska ha namngivna ägare**  
*Kategori (derived/non-canonical): security · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull capability ska ha produkt-, domän-, teknik-, säkerhets-, compliance- och incidentansvar där detta är relevant.

**GP-611 — Agenten är inte en självständig ansvarsbärare**  
*Kategori (derived/non-canonical): agent · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Automatiserade beslut och handlingar ska alltid kunna kopplas till en mänskligt eller organisatoriskt ägd policy, capability och kontrollkedja.

**GP-612 — Betydelsefulla beslut ska kunna förklaras och överprövas**  
*Kategori (derived/non-canonical): data · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna förstå relevant datagrund, invända, korrigera och få mänsklig hantering när beslutets påverkan kräver det.

**GP-613 — Personuppgifter ska behandlas ändamålsbegränsat**  
*Kategori (derived/non-canonical): nutrition · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Data insamlad för träning, kost, säkerhet eller support får inte automatiskt återanvändas för försäljning, forskning, modellträning eller externa bedömningar.

**GP-614 — Känsliga uppgifter ska ha förstärkt skydd**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Hälsorelaterade signaler, kroppsmått, smärta, menstruation, medicinering och psykiskt relaterad information ska få striktare access, retention, delning och audit.

**GP-615 — Samtycke ska vara specifikt och återkalleligt**  
*Kategori (derived/non-canonical): privacy · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Samtycke får inte bundlas med onödig behandling eller användas som universell rättslig grund.

**GP-616 — Dataskyddsrättigheter ska vara operativt genomförbara**  
*Kategori (derived/non-canonical): privacy · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Tillgång, rättelse, radering, begränsning, portabilitet och invändning ska stödjas genom verifierbara workflows och inte endast beskrivas i policy.

**GP-617 — Externa datamottagare ska vara kända och styrda**  
*Kategori (derived/non-canonical): data · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Modellleverantörer, molntjänster, betalningsleverantörer och andra biträden ska ha dokumenterat syfte, data scope, avtal, underleverantörer och exitmodell.

**GP-618 — AI-användning ska vara transparent och capabilityvaliderad**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Det ska vara tydligt när AI används, vilken roll den har och att modellleverantörens generella säkerhet inte ersätter GainPilots egen validering.

**GP-619 — Bias och kvalitetsgap ska mätas och åtgärdas**  
*Kategori (derived/non-canonical): data · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska analysera om funktioner systematiskt fungerar sämre eller osäkrare för relevanta grupper, språk, kroppar eller funktionsförutsättningar.

**GP-620 — Tillgänglighet ska vara ett grundkrav**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Säkerhet, betalning, approvals, träningsinformation och användarkontroll ska vara möjliga att använda med relevanta hjälpmedel och alternativa presentationer.

**GP-621 — Minderåriga kräver separat produktmodell**  
*Kategori (derived/non-canonical): privacy · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte behandla minderåriga som vanliga vuxenanvändare utan särskild ålders-, integritets-, innehålls-, kommersiell och vårdnadshavargovernance.

**GP-622 — Immaterialrätt och innehållsprovenance ska verifieras**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kod, övningsmedia, program, text, AI-material och användaruppladdningar ska ha känd rättighet eller tydligt tillåtet användningsscope.

**GP-623 — Marknadsföring ska vara styrkbar och icke-manipulativ**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Resultatpåståenden, testimonials, före- och eftermaterial, sponsring och affiliateinnehåll ska vara sanningsenliga, tydligt märkta och etiskt granskade.

**GP-624 — Policy och systembeteende ska överensstämma**  
*Kategori (derived/non-canonical): privacy · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Skillnad mellan villkor, integritetspolicy, marknadsföring, teknisk databehandling och faktisk capability ska upptäckas och hanteras som avvikelse eller incident.

**GP-625 — Efterlevnad ska stödjas av evidens**  
*Kategori (derived/non-canonical): governance · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull kontroll ska kunna kopplas till ägare, implementation, test, review, version och faktisk evidens.

**GP-626 — Atlas får analysera men inte slutligt avgöra juridik**  
*Kategori (derived/non-canonical): agent · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska kunna bevaka, sammanställa och rekommendera men rättslig klassificering, riskacceptans och högrisklansering ska ägas av behörig människa eller organisation.

**GP-627 — Regulatoriska förändringar ska hanteras kontrollerat**  
*Kategori (derived/non-canonical): safety · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ny lag, vägledning eller standard ska skapa analys och beslutsärende, inte automatisk produkt- eller policyändring.

**GP-628 — Högriskcapabilities och nya marknader ska ha gates**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Lansering ska kunna blockeras när avsett syfte, klassificering, avtal, kontroller, användarinformation eller ansvar ännu inte är tillräckligt verifierade.

**GP-629 — Complianceundantag ska vara tidsbegränsade**  
*Kategori (derived/non-canonical): training · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett undantag ska ha scope, ägare, risk, kompensationskontroll, expiry och explicit omprövning.

**GP-630 — Juridisk och etisk utveckling ska följa full governance**  
*Kategori (derived/non-canonical): data · Sektion: 30.206 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ändringar av professionella gränser, databehandling, AI-transparens, marknadsföring, konsumentflöden och compliancekontroller ska ske genom separat branch, tester, kvalificerad review, pilot och verifierad lansering.

### Kapitel 31 — Roadmap, genomförande och stegvis realisering

**GP-631 — GainPilot ska realiseras stegvis**  
*Kategori (derived/non-canonical): roadmap · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Den fulla visionen får inte implementeras som ett enda odelat projekt; varje stage ska skapa ett användbart, verifierbart och arkitektoniskt hållbart resultat.

**GP-632 — Första versionen ska vara liten men arkitektoniskt korrekt**  
*Kategori (derived/non-canonical): authority · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Stage 1 får begränsa funktioner och målgrupper men ska använda stabil identitet, versionering, scope, provenance, permission och spårbar förändring där dessa behövs.

**GP-633 — Roadmapinitiativ ska beskriva problem och utfall**  
*Kategori (derived/non-canonical): training · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arbete får inte prioriteras enbart som en featurelista utan ska ange målgrupp, problem, avsett värde, evidens och guardrails.

**GP-634 — Roadmapen ska vara kontraktsmedveten**  
*Kategori (derived/non-canonical): roadmap · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefullt initiativ ska kopplas till berörda GP-kontrakt och tydligt ange vilka delar som implementeras, förbereds eller ligger utanför scope.

**GP-635 — Capabilitymognad ska beskrivas ärligt**  
*Kategori (derived/non-canonical): governance · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Prototype, implementation, test, production readiness, release och verifierad effekt ska vara separata statusar och får inte användas som synonymer.

**GP-636 — Kärnvärdekedjan ska prioriteras**  
*Kategori (derived/non-canonical): training · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Onboarding, program, planerat pass, aktivt genomförande, loggning, återkoppling och nästa anpassning ska fungera sammanhängande före omfattande sidofunktioner.

**GP-637 — GainPilot ska föredra vertikala slices**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya produktförmågor ska där möjligt levereras genom en tunn men komplett kedja över UI, domän, data, agent, säkerhet och observability.

**GP-638 — Omnira-komplexitet ska följa verkligt produktbehov**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Generiska agent-, plattforms- och enterprise-capabilities får inte byggas långt före det GainPilot-flöde som behöver dem.

**GP-639 — Roadmapen ska begränsa work in progress**  
*Kategori (derived/non-canonical): roadmap · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska prioritera verifierad completion framför många samtidiga halvfärdiga initiativ.

**GP-640 — Stageövergång ska kräva explicit acceptans**  
*Kategori (derived/non-canonical): product · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nästa mognadsstage får inte anses påbörjad eller den föregående avslutad enbart därför att tid gått eller en demo genomförts.

**GP-641 — Varje stage ska producera evidens**  
*Kategori (derived/non-canonical): safety · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Scope, implementation, tester, reviews, release, användarfeedback, metrics, avvikelser och kvarvarande risk ska samlas i ett verifierbart stagepaket.

**GP-642 — Roadmapbeslut ska hantera antaganden och osäkerhet**  
*Kategori (derived/non-canonical): safety · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Obekräftade behov, estimat och prognoser ska märkas och få en plan för validering innan de behandlas som stabil grund.

**GP-643 — Prioritering ska väga mer än intäkt och popularitet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarvärde, strategisk passform, säkerhet, lärande, beroenden, kostnad, reversibilitet och opportunity cost ska vägas i roadmapbeslut.

**GP-644 — En prioriteringsmodell får inte fatta beslut autonomt**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Poäng, analyser och Atlas-rekommendationer ska stödja men inte ersätta ansvarig produktägares bedömning.

**GP-645 — Repositoryarbete ska vara isolerat och spårbart**  
*Kategori (derived/non-canonical): data · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje avgränsad implementation ska använda rätt baslinje, separat branch eller worktree, avgränsade commits, pull request, review och verifierad merge.

**GP-646 — Orelaterade ändringar får inte blandas**  
*Kategori (derived/non-canonical): product · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förbefintligt eller orelaterat material ska redovisas och lämnas orört om det inte uttryckligen ingår i godkänt scope.

**GP-647 — Agentproduktion ska begränsas av reviewkapacitet**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte starta mer agentdrivet arbete än vad relevanta människor och kontrollsystem kan granska och verifiera.

**GP-648 — Merge är inte samma sak som release**  
*Kategori (derived/non-canonical): governance · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kodmerge, deployment, featureaktivering, användarlansering och verifierad effekt ska vara separata kontrollerade steg.

**GP-649 — Release ska vara gradvis och återställningsbar**  
*Kategori (derived/non-canonical): compliance · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Nya capabilities ska där relevant använda intern release, feature flag, canary, stoppvillkor, rollback eller compensation och post-release-verifiering.

**GP-650 — Modell-, prompt- och knowledge-förändringar är releaser**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Förändringar i agentbeteende eller canonical kunskapsunderlag ska versioneras, testas, observeras och kunna återställas på samma sätt som kod.

**GP-651 — Teknisk skuld ska vara synlig och ägd**  
*Kategori (derived/non-canonical): safety · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Avsiktliga förenklingar och temporära lösningar ska ha risk, ägare och reviewpunkt och får inte tyst bli permanent canonical arkitektur.

**GP-652 — Meningsbärande material ska bevaras före städning**  
*Kategori (derived/non-canonical): governance · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Canonical böcker, källor, proofs, branches, worktrees och artefakter får inte raderas innan finala versioner, checksummor och säkra kopior har verifierats.

**GP-653 — Avvikelse från canonical kontrakt ska vara explicit**  
*Kategori (derived/non-canonical): safety · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Implementation får inte tyst omdefiniera eller kringgå ett GP-kontrakt; avvikelse ska dokumenteras, riskbedömas, tidsbegränsas eller leda till canonical revision.

**GP-654 — Canonical kunskap ska kompileras selektivt**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenter ska få relevant och minimerad kunskapskontext, inte automatiskt hela bokserien i varje uppgift.

**GP-655 — Roadmapeffekt ska mätas efter release**  
*Kategori (derived/non-canonical): nutrition · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Initiativ ska följas för adoption, användarvärde, säkerhet, kvalitet, kostnad och oavsiktliga effekter innan de betraktas som fullt verifierade.

**GP-656 — Atlas får analysera men inte ensam styra roadmapen**  
*Kategori (derived/non-canonical): agent · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska kunna sammanställa signaler och rekommendera prioritering men stage, budget, riskacceptans och lansering ska beslutas av behörig mänsklig ägare.

**GP-657 — Roadmap- och implementationssystemet ska följa full governance**  
*Kategori (derived/non-canonical): roadmap · Sektion: 31.294 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Initiativ, stages, branches, releases, kontraktsavvikelser och canonical revisioner ska hanteras genom definierat scope, tester, review, canary, evidens och explicit beslut.

### Kapitel 32 — Canonical sammanfattning, målbild och slutliga arkitekturprinciper

**GP-658 — GainPilot ska vara en full bounded domain inom Omnira**  
*Kategori (derived/non-canonical): data · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska ha eget produktansvar, egna dataobjekt, capabilities, policies, kommersiella modeller och operativ status samtidigt som gemensamma Omnira-förmågor återanvänds genom tydliga gränser.

**GP-659 — Arnold ska äga den användarnära coachrelationen**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användarens primära tränings- och kostdialog ska hanteras av Arnold inom GainPilot-domänen, med tydlig identitet, kompetensgräns och capabilitystyrning.

**GP-660 — Atlas ska skapa central intelligens utan central övervakning**  
*Kategori (derived/non-canonical): memory · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas ska få minimerade och ändamålsbegränsade signaler för produkt-, risk-, drift- och affärsanalys men inte obegränsad åtkomst till användarens privata GainPilot-minne.

**GP-661 — Hermes ska vara obligatorisk gräns för minne och kontext**  
*Kategori (derived/non-canonical): memory · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

All betydelsefull delning mellan Arnold, Atlas, GainPilot och andra Omnira-domäner ska gå genom scopead retrieval, minimering, provenance och policykontroll.

**GP-662 — Delad intelligens ska kombineras med isolerade minnesdomäner**  
*Kategori (derived/non-canonical): memory · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Generella lärdomar och aggregerade signaler får delas där det är tillåtet, medan privata användar-, tenant- och projektminnen ska förbli isolerade.

**GP-663 — GainPilot ska vara adaptivt men inte godtyckligt**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Program-, tränings-, kost- och kalenderförändringar ska bygga på explicit mål, data, programlogik, risk, provenance och authority samt kunna förklaras och korrigeras.

**GP-664 — Användaren ska behålla kontrollen**  
*Kategori (derived/non-canonical): product · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska kunna förstå, godkänna, ändra, överstyra, återkalla, stoppa, exportera och korrigera relevanta delar av GainPilot.

**GP-665 — Personalisering ska vara ändamålsbegränsad**  
*Kategori (derived/non-canonical): memory · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får endast använda användarens minne och data för tydliga, tillåtna och förklarbara syften med relevant retention och möjlighet till rättelse.

**GP-666 — Träningshistorik ska bevaras spårbart**  
*Kategori (derived/non-canonical): training · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Programändringar, korrigeringar, synk och progression får inte tyst skriva över genomförda pass eller ursprungliga resultat.

**GP-667 — Tränings- och kostsystemet ska uttrycka osäkerhet**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ofullständig data, modellinferens, uppskattade näringsvärden och osäkra träningsbedömningar får inte presenteras som exakt verifierad sanning.

**GP-668 — Safety ska prioriteras över prestationsoptimering**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska kunna stoppa eller begränsa progression, program, kostförändring och agentexecution när relevanta säkerhetssignaler eller professionella gränser kräver det.

**GP-669 — Motivation får inte bygga på manipulation**  
*Kategori (derived/non-canonical): training · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte använda kroppsskam, skuld, rädsla, tvångsmässig streaklogik eller användarens sårbarhet för att öka träning, retention eller försäljning.

**GP-670 — Capabilities ska vara den canonical handlingsgränsen**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Agenthandlingar ska definieras genom versionerade capabilities med input, output, side effects, risk, authority, permission, idempotency och audit.

**GP-671 — Authority ska vara scopead, förtjänad och återkallelig**  
*Kategori (derived/non-canonical): authority · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Autonomi ska definieras per capability, användare, tenant, data, tid och risk, byggas genom verifierad evidens och kunna sänkas eller stoppas omedelbart.

**GP-672 — Confidence får aldrig ersätta mandat**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

En agents höga bedömda säkerhet får inte ge större dataåtkomst, tool access eller execution authority.

**GP-673 — Approval ska vara begripligt och meningsfullt**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Användaren ska förstå handling, effekt, kostnad, data, reversibilitet och giltighet, och GainPilot ska motverka både dold execution och approval fatigue.

**GP-674 — Safe mode ska bevara användarens kärnförmåga**  
*Kategori (derived/non-canonical): data · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Vid allvarlig störning ska GainPilot där möjligt låta användaren läsa verifierad plan, logga lokalt, se status och behålla datakontroll utan nya osäkra writes.

**GP-675 — Distribuerade handlingar ska bevara sanningen om utfallet**  
*Kategori (derived/non-canonical): product · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Timeout, dubblett, fel ordning, partial execution och unknown outcome ska hanteras genom stabil identitet, idempotency, verifiering och compensation.

**GP-676 — Observability ska mäta användar- och capabilityresultat**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot får inte förlita sig enbart på processuptime utan ska följa data, agentbeteende, permissions, user flows, domänutfall, kostnad och faktisk användarpåverkan.

**GP-677 — Backup ska bevisas genom säker restore**  
*Kategori (derived/non-canonical): data · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Data, tenantisolering, raderingar, schema, filer och centrala GainPilot-flöden ska verifieras efter återställning.

**GP-678 — Incident och kris ska minska autonomi**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Allvarlig drift-, data-, säkerhets-, integritets- eller agentrisk ska kunna pausa writes, begränsa data, sänka authority och kräva gradvis verifierad recovery.

**GP-679 — Kommersiellt värde ska bygga på verklig användarnytta**  
*Kategori (derived/non-canonical): training · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot ska finansieras genom struktur, intelligens, anpassning och stöd, inte genom datakuveri, dark patterns, kroppsmissnöje eller artificiellt beroende.

**GP-680 — Betalning, entitlement, permission och authority ska separeras**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Ett abonnemang kan ge kommersiell tillgång till en capability men får inte automatiskt skapa datatillstånd, approval eller större agentautonomi.

**GP-681 — Individuell GainPilot-data får inte säljas**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Privat tränings-, kost-, kropps-, hälso-, beteende- och coachdata får inte säljas till annonsörer, arbetsgivare, försäkringsaktörer eller andra externa parter.

**GP-682 — Professionella och regulatoriska gränser ska genomdrivas tekniskt**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Arnold får inte diagnostisera, behandla eller utge sig för legitimerad kompetens utanför en separat godkänd produktmodell, och riskfrågor ska kunna stoppa berörd automation.

**GP-683 — Varje betydelsefull capability ska ha mänskligt eller organisatoriskt ansvar**  
*Kategori (derived/non-canonical): safety · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Produkt-, domän-, teknik-, säkerhets-, compliance- och incidentansvar ska kunna identifieras även när handlingen genomförs automatiskt.

**GP-684 — GainPilot ska realiseras genom verifierade stages**  
*Kategori (derived/non-canonical): authority · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Stage 1 ska skapa en fungerande kärnprodukt innan omfattande domän-, organisations-, plattforms- eller autonomiexpansion genomförs.

**GP-685 — Canonical böcker ska vara versionsstyrda och bevarade**  
*Kategori (derived/non-canonical): governance · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Fullbok, kapitel, manifest, kontraktsregister, changelog, checksummor och proofs ska bevaras i verifierad struktur utan radering av meningsbärande material före säker kopia.

**GP-686 — Canonical kunskap ska kompileras selektivt**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold och specialistagenter ska få minimerade uppgiftsspecifika knowledge packages med tydlig provenance i stället för oscopead tillgång till hela bokserien.

**GP-687 — Kontraktsuppfyllelse ska kräva relevant evidens**  
*Kategori (derived/non-canonical): operations · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Kodreferens ensam är inte tillräcklig; automatiska tester, mänsklig review, audit, driftverifiering och användarevidens ska användas efter kontraktets natur.

**GP-688 — Agenter får föreslå men inte självmodifiera governance**  
*Kategori (derived/non-canonical): agent · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Atlas, Arnold och specialistagenter får identifiera behov och skapa förslag men får inte själva ändra canonical bok, authoritymodell, säkerhetspolicy eller sitt eget mandat.

**GP-689 — GainPilot ska utvecklas genom full repository- och releasegovernance**  
*Kategori (derived/non-canonical): governance · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

Varje betydelsefull förändring ska ha scope, separat branch eller worktree, tester, relevant review, pull request, gradvis release, rollback eller compensation och post-release-verifiering.

**GP-690 — Slutlig produktframgång ska mätas som hållbart användarvärde under kontroll**  
*Kategori (derived/non-canonical): nutrition · Sektion: 32.231 ARKITEKTURKONTRAKT · v1.0 · Canonical Review Candidate*  

GainPilot är framgångsrikt när användaren får återkommande tränings- och kostvärde, förstår systemet, behåller kontrollen och kan använda tjänsten inom en säker, privat, tillförlitlig och ekonomiskt hållbar modell.
