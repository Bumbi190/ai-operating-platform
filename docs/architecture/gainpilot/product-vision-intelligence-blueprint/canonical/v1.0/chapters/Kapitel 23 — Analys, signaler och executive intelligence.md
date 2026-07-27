# Kapitel 23 — Analys, signaler och executive intelligence

GainPilot ska kunna förstå vad som händer i produkten, varför det händer och vilka beslut som kan behöva fattas.

Detta kräver mer än:

- dashboards,

- grafer,

- sidvisningar,

- antal användare,

- träningspass,

- kalorier,

- eller abonnemangsintäkter.

En mätpunkt är inte automatiskt en insikt.

En förändring är inte automatiskt ett problem.

En korrelation är inte automatiskt en orsak.

Och en signal är inte automatiskt ett mandat att förändra produkten.

GainPilot ska därför bygga en sammanhängande kedja från rå observation till kontrollerat beslut.

Den canonical kedjan ska vara:

Händelse

→ observation

→ mätvärde

→ signal

→ analys

→ hypotes

→ rekommendation

→ beslut

→ godkänt mandat

→ åtgärd

→ effektuppföljning

→ lärande.

Varje steg ska vara tydligt åtskilt.

Ett genomfört träningspass är en händelse.

Att 62 procent av användarna genomför minst två pass under sin första vecka är ett mätvärde.

Att denna andel har sjunkit under fyra veckor kan vara en signal.

Att minskningen sammanfaller med ett nytt onboardingflöde kan vara en observation.

Att onboardingförändringen orsakade minskningen är en hypotes.

Att återställa ett tidigare steg eller testa en förenklad variant är en rekommendation.

Att genomföra förändringen är ett separat beslut.

GainPilot ska inte låta analyticsmotorer, språkmodeller eller Atlas hoppa över dessa steg.

Executive Intelligence ska vara Omniras system för att omvandla:

- produktdata,

- användarsignaler,

- verksamhetsdata,

- teknisk status,

- ekonomiska data,

- risker,

- utvecklingsstatus,

- research,

- och strategiska mål

till begripliga och spårbara beslutsunderlag.

Atlas ska kunna använda Executive Intelligence för att förstå GainPilot som:

- produkt,

- verksamhet,

- tekniksystem,

- agentplattform,

- och strategisk tillgång.

Atlas ska kunna hjälpa ägaren se:

- vad som fungerar,

- vad som försämras,

- vilka problem som är viktigast,

- vilka antaganden som saknar stöd,

- vilka möjligheter som uppstår,

- vilka beslut som väntar,

- vilka risker som växer,

- och vilka aktiviteter som inte längre motiverar sin kostnad.

Atlas ska däremot inte automatiskt få full åtkomst till användarnas:

- träningshistorik,

- kroppsvikt,

- kostlogg,

- smärtanteckningar,

- progressionsbilder,

- eller privata coachdialoger.

Executive Intelligence ska i första hand använda:

- aggregerade mätvärden,

- minimerade domänsignaler,

- pseudonymiserade analysunderlag,

- tydlig provenance,

- och definierade integritetströsklar.

Individdata ska endast användas när:

- syftet kräver det,

- användarens eller systemets mandat tillåter det,

- Hermes godkänner åtkomsten,

- och en mindre detaljerad signal inte räcker.

GainPilot ska inte optimeras för en enda metrik.

Ett system som endast optimerar för:

- öppningsfrekvens,

- daglig aktivitet,

- antal loggade måltider,

- träningsvolym,

- retention,

- eller intäkt

kan skapa en sämre produkt trots att siffran förbättras.

Exempel:

Fler pushnotiser kan öka appöppningar.

De kan samtidigt öka:

- irritation,

- notisavstängningar,

- avregistrering,

- och känslan av övervakning.

Mer aggressiv träningsprogression kan på kort sikt öka registrerad prestation.

Den kan samtidigt öka:

- smärtsignaler,

- avbrutna program,

- osäker teknik,

- och långsiktig bortfallsrisk.

GainPilot ska därför använda balanserade metriksystem.

Varje betydelsefull optimeringsmetrik ska ha skyddsmått.

Om produkten optimerar:

- programaktivering,

ska den även följa:

- förståelse,

- korrigeringar,

- säkerhetsblockeringar,

- och senare genomförbarhet.

Om produkten optimerar:

- träningsföljsamhet,

ska den även följa:

- funktionsbevarande anpassningar,

- återhämtning,

- användarupplevd kontroll,

- och tecken på tvångsmässigt beteende.

Om produkten optimerar:

- abonnemangskonvertering,

ska den även följa:

- uppsägningsfriktion,

- klagomål,

- felköp,

- återbetalningar,

- och om coachrelationen används som försäljningspress.

Grundprincipen är:

GainPilot ska använda analys för att förstå och förbättra produkten, inte för att manipulera användaren eller automatiskt styra verksamheten. Executive Intelligence ska skapa bättre beslutsunderlag genom verifierbara signaler, tydliga hypoteser, balanserade mätetal och kontrollerad uppföljning — medan beslut, mandat och ansvar förblir explicita.

23.1 ANALYSENS ROLL

Analys ska hjälpa GainPilot att:

- förstå produktens tillstånd,

- identifiera förändringar,

- upptäcka problem,

- utvärdera hypoteser,

- prioritera arbete,

- följa strategiska mål,

- och bedöma effekten av genomförda beslut.

Analys ska inte användas som ersättning för:

- produktomdöme,

- domänexpertis,

- användarfeedback,

- säkerhetsbedömning,

- eller mänskligt ansvar.

23.2 EXECUTIVE INTELLIGENCE

Executive Intelligence ska vara den kontrollerade förmåga som omvandlar många olika signalsystem till en sammanhängande ledningsbild.

Den ska kunna svara på frågor som:

- Hur mår GainPilot?

- Vad har förändrats?

- Varför kan förändringen ha inträffat?

- Hur säker är analysen?

- Vilka mål påverkas?

- Vilka risker växer?

- Vilka beslut krävs?

- Vilka alternativ finns?

- Vad kostar alternativen?

- Vad händer om inget görs?

- Och hur ska effekten följas upp?

23.3 INGEN ENDA EXECUTIVE-POÄNG

GainPilot ska inte reduceras till en ogenomskinlig sammanfattande poäng.

En enda health score kan dölja att:

- användarnyttan förbättras,

- samtidigt som säkerhetsincidenterna ökar,

- kostnaden växer,

- och teknisk tillförlitlighet försämras.

Executive Intelligence ska visa separata dimensioner.

23.4 DEN CANONICAL ANALYSKEDJAN

GainPilot ska använda följande canonical analyskedja:

1. Händelse.

2. Observation.

3. Mätvärde.

4. Signal.

5. Analys.

6. Hypotes.

7. Rekommendation.

8. Beslut.

9. Mandat.

10. Åtgärd.

11. Effektmätning.

12. Lärande.

Stegen får kombineras i presentationen.

De får inte blandas i datamodellen.

23.5 HÄNDELSE

En händelse beskriver något som har inträffat.

Exempel:

- användare slutförde onboarding,

- träningspass sparades,

- program aktiverades,

- övningsbyte korrigerades,

- säkerhetsstopp utlöstes,

- abonnemang avslutades,

- modellversion uppdaterades,

- eller integration misslyckades.

Händelsen ska ha stabil identitet och tid.

23.6 OBSERVATION

En observation beskriver något som har noterats utan att hela betydelsen är fastställd.

Exempel:

- tre onboardingsteg lämnas ofta ofullständiga,

- fler användare väljer kortversion,

- eller ett integrationsfel sammanfaller med fler dubbla träningsresultat.

Observationen ska inte formuleras som bevisad orsak.

23.7 MÄTVÄRDE

Ett mätvärde är en definierad beräkning.

Det ska minst ha:

- metric identity,

- definition,

- datakälla,

- population,

- tidsperiod,

- enhet,

- beräkningsmetod,

- och version.

23.8 SIGNAL

En signal är en observation eller mätförändring som bedöms vara värd uppmärksamhet.

En signal kan vara:

- positiv,

- negativ,

- neutral,

- osäker,

- eller informativ.

En signal är inte automatiskt en incident.

23.9 ANALYS

En analys försöker förklara:

- vad signalen betyder,

- hur den relaterar till mål,

- vilka möjliga orsaker som finns,

- vilka data som saknas,

- och vilken osäkerhet som återstår.

23.10 HYPOTES

En hypotes är en testbar möjlig förklaring.

Exempel:

Det nya onboardingsteget ökar kognitiv friktion och minskar programaktivering.

Hypotesen ska innehålla:

- stödjande observationer,

- alternativa förklaringar,

- och testmetod.

23.11 REKOMMENDATION

En rekommendation ska ange:

- föreslagen riktning,

- motivering,

- förväntad effekt,

- kostnad,

- risk,

- alternativ,

- och hur resultatet ska bedömas.

En rekommendation ska inte döljas som en självklar teknisk slutsats.

23.12 BESLUT

Ett beslut innebär att en ansvarig aktör har valt en riktning.

Beslutet ska ha:

- beslutsägare,

- datum,

- underlag,

- scope,

- giltighet,

- och omprövningsvillkor.

23.13 MANDAT

Mandat anger vad som faktiskt får genomföras.

Ett beslut om att:

Förbättra onboarding

är inte tillräckligt mandat för att:

- skriva om hela användarmodellen,

- ändra datainsamling,

- eller aktivera nya notifieringar.

Mandatet ska vara avgränsat.

23.14 ÅTGÄRD

Åtgärden är den verkliga förändringen.

Den kan vara:

- kodändring,

- policyändring,

- produktförändring,

- processförändring,

- tillfällig flagg,

- ny research,

- eller beslut att inte agera.

23.15 EFFEKTMÄTNING

Varje betydelsefull åtgärd ska ha en plan för att bedöma:

- om den genomfördes korrekt,

- om avsedd effekt uppstod,

- om skyddsmått försämrades,

- och om oväntade konsekvenser uppstod.

23.16 LÄRANDE

Efter uppföljning ska GainPilot kunna registrera:

- vad som bekräftades,

- vad som motbevisades,

- vilka antaganden som ändrades,

- och vad framtida beslut bör ta hänsyn till.

Lärandet ska inte automatiskt bli permanent produktregel.

23.17 DEN CANONICAL EXECUTIVE INTELLIGENCE-MODELLEN

Executive Intelligence ska minst kunna representera:

- intelligence_item_identity,

- domain_identity,

- tenant_identity,

- objective_identity,

- source_events,

- observations,

- metric_references,

- signal_type,

- severity,

- confidence,

- time_horizon,

- affected_capabilities,

- affected_user_segments,

- privacy_classification,

- analysis,

- hypotheses,

- alternatives,

- recommendation,

- expected_impact,

- risk,

- estimated_cost,

- decision_owner,

- approval_requirement,

- status,

- review_date,

- effect_measurement,

- and provenance.

Exakta tekniska fältnamn fastställs senare.

23.18 INTELLIGENCE ITEM

Ett intelligence item ska vara ett spårbart analysobjekt.

Det kan representera:

- produktmöjlighet,

- problem,

- risk,

- kostnadsavvikelse,

- säkerhetssignal,

- strategisk fråga,

- eller beslut som kräver uppföljning.

23.19 STATUS

Ett intelligence item ska kunna ha status som:

- detected,

- under_analysis,

- insufficient_evidence,

- hypothesis_defined,

- recommendation_ready,

- awaiting_decision,

- approved,

- rejected,

- deferred,

- in_execution,

- measuring_effect,

- validated,

- disproven,

- resolved,

- eller archived.

23.20 SEVERITY

Severity ska beskriva möjlig påverkan.

Exempel:

- informational,

- low,

- moderate,

- high,

- critical.

Severity ska inte enbart styras av hur stor den procentuella förändringen är.

23.21 CONFIDENCE

Confidence ska beskriva tilltron till:

- signalens giltighet,

- analysen,

- hypotesen,

- eller rekommendationen.

Dessa kan ha olika confidence.

En signal kan vara säker medan orsaken är osäker.

23.22 TIDSHORISONT

Executive Intelligence ska skilja mellan:

- realtid,

- operativ dag,

- vecka,

- månad,

- kvartal,

- programblock,

- och långsiktig strategi.

En kortsiktig avvikelse ska inte automatiskt styra långsiktig roadmap.

23.23 PRODUKTDIMENSIONER

GainPilot ska minst kunna analyseras genom följande dimensioner:

- användarnytta,

- säkerhet,

- integritet,

- produktkvalitet,

- tränings- och kostdomänens korrekthet,

- teknisk tillförlitlighet,

- agentkvalitet,

- verksamhet,

- ekonomi,

- tillväxt,

- retention,

- support,

- utvecklingsförmåga,

- och strategisk riktning.

23.24 ANVÄNDARNYTTA

Användarnytta ska bedöma om GainPilot hjälper användaren:

- förstå sin plan,

- genomföra den,

- anpassa den,

- följa sin utveckling,

- och fatta bättre beslut.

Appanvändning är inte samma sak som användarnytta.

23.25 SÄKERHET

Säkerhetsanalys ska kunna omfatta:

- olämpliga programförslag,

- felaktiga substitutioner,

- missade begränsningar,

- överdriven progression,

- smärt- och risksignaler,

- och felaktig kommunikation.

23.26 INTEGRITET

Integritetsanalys ska kunna följa:

- överhämtad kontext,

- felaktig delning,

- do-not-share-blockeringar,

- externa modellöverföringar,

- supportåtkomst,

- raderingsfel,

- och tenantisolering.

23.27 PRODUKTKVALITET

Produktkvalitet kan omfatta:

- begriplighet,

- friktion,

- fel,

- korrigeringar,

- tillgänglighet,

- svarstid,

- och användarupplevd kontroll.

23.28 DOMÄNKORREKTHET

GainPilot ska särskilt mäta om:

- programmen följer sina avsedda funktioner,

- substitutioner bevarar rätt träningsintention,

- progressioner är rimliga,

- kostförslag följer begränsningar,

- och domänspecifika format representeras korrekt.

23.29 TEKNISK TILLFÖRLITLIGHET

Teknisk analys kan omfatta:

- tillgänglighet,

- latency,

- fel,

- okända utfall,

- dubbla resultat,

- synkproblem,

- integrationsstatus,

- och återställning.

23.30 AGENTKVALITET

Agentkvalitet ska mätas separat för:

- Arnold,

- Atlas,

- och specialistagenter.

Mätningen kan omfatta:

- rätt capabilityval,

- felaktig tool use,

- korrigeringar,

- policyblockeringar,

- confidencekalibrering,

- och användarbedömd hjälpsamhet.

23.31 VERKSAMHET

Verksamhetsanalys kan omfatta:

- aktiva användare,

- betalande användare,

- supportbelastning,

- innehållsproduktion,

- partnerskap,

- utvecklingskapacitet,

- och operativa flaskhalsar.

23.32 EKONOMI

Ekonomisk analys kan omfatta:

- intäkt,

- kostnad,

- bruttomarginal,

- AI-kostnad,

- lagring,

- supportkostnad,

- kundanskaffning,

- återbetalningar,

- och leverantörsberoende.

Ekonomisk analys ska inte ignorera användarskydd.

23.33 TILLVÄXT

Tillväxt ska kunna delas upp i:

- nya användare,

- aktiverade användare,

- betalande användare,

- organisk tillväxt,

- betald tillväxt,

- referrals,

- och partnerskap.

Nedladdning ska inte automatiskt betraktas som aktiv användare.

23.34 RETENTION

Retention ska definieras utifrån produktens verkliga användningsmönster.

Daglig aktivitet kan vara irrelevant för en användare som:

- tränar tre dagar per vecka,

- och endast använder kostplanen vid veckoplanering.

GainPilot ska inte använda en enda generell retentiondefinition.

23.35 SUPPORT

Supportanalys ska kunna visa:

- ärendetyper,

- återkommande problem,

- lösningstid,

- eskalering,

- och produktområden som skapar onödigt stödbehov.

23.36 UTVECKLINGSFÖRMÅGA

Executive Intelligence ska kunna följa:

- roadmapprogress,

- blockerade initiativ,

- teknisk skuld,

- teststatus,

- releasefrekvens,

- incidentpåverkan,

- och dokumentationsdrift.

23.37 STRATEGISK RIKTNING

Strategisk analys ska koppla nuvarande produktstatus till:

- vision,

- målgrupper,

- affärsmodell,

- Omnira-roadmap,

- och tillgängliga resurser.

En intressant feature är inte automatiskt strategiskt relevant.

23.38 NORTH STAR-METRIK

GainPilot kan använda en North Star-metrik.

Den får inte vara ensam styrmekanism.

En möjlig framtida North Star kan mäta:

Andelen aktiva användare som genomför eller funktionsbevarande anpassar sin godkända kärnplan under en relevant period och samtidigt rapporterar att planen är begriplig och hållbar.

Definitionen ska valideras innan den används.

23.39 INGEN FALSK ENKELHET

North Star-metriken ska kompletteras med skyddsmått för:

- säkerhet,

- återhämtning,

- användarkontroll,

- korrigeringar,

- integritet,

- och långsiktig retention.

23.40 METRIKHIERARKI

GainPilot ska ha en metrikstruktur med:

1. Strategiska mått.

2. Produktmått.

3. Domänmått.

4. Operativa mått.

5. Tekniska mått.

6. Skyddsmått.

7. Diagnostiska mått.

Alla mått ska inte visas i samma dashboard.

23.41 STRATEGISKA MÅTT

Strategiska mått ska följa:

- produktens långsiktiga värde,

- affärens hållbarhet,

- säkerhet,

- och visionens genomförande.

De ska förändras relativt långsamt.

23.42 PRODUKTMÅTT

Produktmått kan följa:

- onboarding,

- programskapande,

- aktivering,

- passgenomförande,

- måltidsplanering,

- substitution,

- och återengagemang.

23.43 DOMÄNMÅTT

Domänmått kan följa:

- progressionskorrigering,

- RX/scaled-registrering,

- övningsmatchning,

- kostsubstitution,

- eller skillstatus.

De ska använda domänspecifika definitioner.

23.44 OPERATIVA MÅTT

Operativa mått ska hjälpa daglig drift.

Exempel:

- öppna incidenter,

- misslyckade workflows,

- integrationer i degraded,

- väntande approvals,

- och supportkö.

23.45 TEKNISKA MÅTT

Tekniska mått kan omfatta:

- latency,

- error rate,

- queue depth,

- timeout,

- cache hit rate,

- duplicate processing,

- och deployment health.

23.46 SKYDDSMÅTT

Skyddsmått ska upptäcka om en förbättring sker på bekostnad av något viktigt.

Exempel:

Vid optimering av träningsföljsamhet ska GainPilot följa:

- säkerhetsstopp,

- smärtsignaler,

- användaravslag,

- upplevd press,

- och överdriven träningsvolym.

23.47 DIAGNOSTISKA MÅTT

Diagnostiska mått ska hjälpa förklara ett problem.

De behöver inte vara strategiska.

Exempel:

- fel per operativsystem,

- tid i visst onboardingsteg,

- eller response latency för en specifik modell.

23.48 METRIKREGISTER

Alla betydelsefulla mått ska finnas i ett metrikregister.

Registret ska minst innehålla:

- metric identity,

- namn,

- definition,

- syfte,

- ägare,

- datakälla,

- population,

- filtrering,

- enhet,

- beräkningsmetod,

- uppdateringsfrekvens,

- datakvalitet,

- version,

- och kända begränsningar.

23.49 EN METRIK SKA HA ÄGARE

Varje strategiskt eller operativt viktigt mått ska ha en ägare.

Ägaren ansvarar för:

- definition,

- kvalitet,

- förändringar,

- och korrekt användning.

23.50 METRIKVERSIONERING

Om definitionen ändras ska måttet versioneras.

Exempel:

Aktiv användare kan först betyda:

Minst en appöppning per vecka.

Senare kan det betyda:

Minst en meningsfull GainPilot-aktivitet per vecka.

Historiska serier får inte blandas utan markering.

23.51 NÄMNARE

Mått ska ha tydlig nämnare.

Exempel:

Programaktiveringsgrad kan beräknas bland:

- alla registrerade användare,

- alla som slutfört onboarding,

- eller alla som fått ett programförslag.

Resultaten kan skilja sig kraftigt.

23.52 POPULATION

Mätningar ska ange vilken population som ingår.

Exempel:

- alla användare,

- nya användare,

- betalande användare,

- intern tenant,

- Androidanvändare,

- eller användare med styrketräningsprogram.

23.53 SEGMENTERING

Segmentering kan användas för att förstå skillnader.

Segment kan exempelvis baseras på:

- produktstadium,

- träningsdomän,

- erfarenhetsnivå,

- plattform,

- språk,

- abonnemang,

- eller användarvalt mål.

Segmentering ska inte skapa olämplig profilering.

23.54 KÄNSLIG SEGMENTERING

GainPilot ska vara försiktigt med segment baserade på:

- hälsa,

- kropp,

- psykisk problematik,

- funktionsnedsättning,

- eller andra känsliga attribut.

Sådan analys ska kräva starkt syfte och skydd.

23.55 SMÅ SEGMENT

Små segment kan:

- ge instabila slutsatser,

- och öka återidentifieringsrisk.

Executive Intelligence ska kunna dölja eller slå samman små grupper.

23.56 DATAFÄRSKHET

Varje mått ska visa hur aktuell datan är.

Ett dashboardvärde från gårdagen får inte presenteras som realtid.

23.57 DATATÄCKNING

Mått ska visa hur stor andel av relevant population som täcks.

Exempel:

Wearable-baserad återhämtningsanalys gäller kanske endast användare som:

- har ansluten enhet,

- bär den regelbundet,

- och har god datakvalitet.

23.58 MISSING DATA

Saknade data ska vara synliga.

GainPilot ska inte anta att:

- inget registrerat pass betyder inget genomfört pass,

- eller saknad kostlogg betyder att användaren inte åt.

23.59 SURVIVORSHIP BIAS

Analys får inte endast omfatta användare som:

- fortsatte använda produkten,

- loggade allt,

- eller svarade på feedback.

Användare som lämnar kan bära viktig information.

23.60 SELECTION BIAS

Användare som frivilligt ansluter wearable eller fyller i avancerad onboarding kan skilja sig från andra.

Analysen ska inte generalisera utan försiktighet.

23.61 MEASUREMENT BIAS

Det som är lätt att mäta är inte alltid det viktigaste.

GainPilot ska inte prioritera:

- appöppning,

- loggning,

- eller klick

framför svårare men viktigare frågor om:

- förståelse,

- hållbarhet,

- självständighet,

- och verklig användarnytta.

23.62 GOODHARTS LAG

När ett mått blir ett hårt mål kan människor och system börja optimera måttet snarare än det egentliga syftet.

GainPilot ska därför:

- använda flera mått,

- följa skyddsmått,

- och regelbundet granska om metriken fortfarande representerar verkligt värde.

23.63 VANITY METRICS

GainPilot ska undvika att styra verksamheten genom ytliga mått som:

- totala nedladdningar,

- totala genererade träningspass,

- antal AI-svar,

- eller antal registrerade konton

utan relation till aktiv användarnytta.

23.64 MENINGSFULL AKTIVERING

Aktivering ska definieras som att användaren nått ett verkligt första värde.

Det kan exempelvis kräva att användaren:

- slutfört relevant onboarding,

- förstått eller godkänt sin plan,

- och startat eller planerat första meningsfulla aktivitet.

Kontoskapande är inte tillräckligt.

23.65 TIME TO VALUE

GainPilot ska kunna mäta tiden från:

- första kontakt,

- till första meningsfulla värde.

Kortare tid är ofta positivt.

Det får inte uppnås genom att hoppa över:

- säkerhetsfrågor,

- målbekräftelse,

- eller nödvändig användarkontroll.

23.66 ONBOARDINGMÅTT

Onboarding ska kunna analyseras genom:

- start,

- stegcompletion,

- avbrott,

- tid,

- korrigeringar,

- säkerhetsfrågor,

- och programaktivering.

Ett längre steg kan vara nödvändigt om det förbättrar säkerheten.

23.67 PROGRAMMÅTT

Programsystemet ska kunna följa:

- skapade förslag,

- användarkorrigeringar,

- aktivering,

- manuella ändringar,

- anpassningar,

- avslut,

- och upplevd begriplighet.

23.68 PASSMÅTT

Träningspass kan analyseras genom:

- startade,

- genomförda,

- delvis genomförda,

- kortversioner,

- reservpass,

- säkerhetsstopp,

- och flyttade pass.

Endast fullständiga standardpass får inte definiera framgång.

23.69 FÖLJSAMHETSMÅTT

Följsamhetsanalys ska följa Kapitel 18.

Den ska skilja mellan:

- kärnplan,

- full plan,

- funktionsbevarande anpassning,

- planerad paus,

- och oplanerat bortfall.

23.70 SUBSTITUTIONSMÅTT

Substitutionsmotorn ska kunna följas genom:

- föreslagna byten,

- accepterade byten,

- korrigerade byten,

- säkerhetsblockeringar,

- senare resultat,

- och återkommande användarval.

23.71 PROGRESSIONSMÅTT

Progressionsanalys ska kunna följa:

- genomförd progression,

- avvisad progression,

- deload,

- platå,

- regression,

- och användarkorrigering.

Mer belastning ska inte automatiskt räknas som bättre progression.

23.72 KOSTMÅTT

Kostfunktioner kan analyseras genom:

- planaktivering,

- receptbyten,

- allergenblockeringar,

- måltidsförenkling,

- inköpslista,

- matavfall där användaren själv registrerar det,

- och genomförbarhet.

23.73 KOMMUNIKATIONSMÅTT

Kommunikationsanalys ska följa Kapitel 18.

Relevanta mått kan vara:

- användarbedömd hjälpsamhet,

- avstängda notiser,

- fel tid,

- fel ton,

- dubbletter,

- och om meddelandet ledde till ett begripligt beslut.

23.74 MINNESMÅTT

Hermes och minnessystemet ska kunna följas genom:

- minneskorrigeringar,

- stale minnen,

- överhämtning,

- nekade förfrågningar,

- raderingsfullständighet,

- och minnesposter som användaren gör privata.

23.75 ARNOLD-MÅTT

Arnold ska mätas på:

- hjälpsamhet,

- rätt domänsvar,

- korrekt capabilityval,

- användarkorrigering,

- säkerhet,

- ton,

- och självständighetsstöd.

Antal meddelanden ska inte vara huvudmått.

23.76 ATLAS-MÅTT

Atlas ska mätas på:

- rekommendationskvalitet,

- korrekt prioritering,

- scope,

- användning av minimerad data,

- kostnad,

- och hur ofta rekommendationer leder till verifierat värde.

23.77 SPECIALISTAGENTMÅTT

Specialistagenter ska ha uppgiftsspecifika mått.

Exempel:

Substitutionsagent:

- funktionsbevarande,

- säkerhet,

- korrigeringsgrad,

- och confidencekalibrering.

Produktanalysagent:

- korrekt datatolkning,

- alternativa hypoteser,

- och frånvaro av falsk kausalitet.

23.78 AFFÄRSMÅTT

Affärsmått kan omfatta:

- abonnemang,

- konvertering,

- churn,

- återbetalning,

- intäkt per användare,

- bruttomarginal,

- och supportkostnad.

De ska inte ensamma styra coachlogik.

23.79 INTÄKT OCH ANVÄNDARNYTTA

En förändring som ökar intäkt men minskar:

- förtroende,

- transparens,

- eller användarkontroll

ska inte automatiskt betraktas som framgångsrik.

23.80 CHURN

Churn ska analyseras genom:

- frivillig uppsägning,

- betalningsfel,

- inaktivitet,

- produktmissnöje,

- mål uppnått,

- eller tillfällig paus.

All churn är inte samma fenomen.

23.81 PAUS OCH UPPSÄGNING

En användare som pausar kan ha en fungerande relation till GainPilot.

Systemet ska inte alltid behandla paus som misslyckande eller aggressivt försöka förhindra den.

23.82 KOSTNAD PER CAPABILITY

GainPilot ska kunna mäta kostnaden för:

- programskapande,

- Arnold-dialog,

- visionanalys,

- research,

- övningsmedia,

- och andra capabilities.

Kostnad ska kopplas till faktisk nytta.

23.83 AI-KOSTNAD

AI-kostnad ska kunna brytas ned per:

- agent,

- modell,

- capability,

- användarsegment,

- workflow,

- och miljö.

Utvecklings- och testkostnad ska skiljas från produktion.

23.84 KOSTNADSANOMALI

Executive Intelligence ska kunna signalera:

- plötslig kostnadsökning,

- oväntat många modellkall,

- större kontextpaket,

- eller dyra retries.

Signalen ska inte automatiskt stänga av kritiska säkerhetsfunktioner.

23.85 ENHETSEKONOMI

När GainPilot har betalande kunder ska systemet kunna bedöma:

- intäkt per kund,

- variabel kostnad,

- supportkostnad,

- infrastrukturkostnad,

- och marginal.

Beräkningen ska ha tydliga antaganden.

23.86 BUDGET MOT FAKTISKT UTFALL

Executive Intelligence ska kunna jämföra:

- budget,

- prognos,

- och faktiskt utfall.

Avvikelser ska analyseras per:

- leverantör,

- agent,

- capability,

- och projektinitiativ.

23.87 PROGNOS

Prognoser ska uttrycka:

- antaganden,

- intervall,

- scenario,

- och osäkerhet.

Atlas ska inte presentera en enda exakt framtidssiffra som säker.

23.88 SCENARIER

GainPilot ska kunna använda scenarier som:

- base case,

- conservative,

- growth,

- constrained,

- och risk case.

Scenarier ska vara beslutsunderlag, inte förutsägelser.

23.89 STRATEGISKA MÅL

GainPilot ska registrera strategiska mål.

Ett mål ska minst ha:

- objective identity,

- beskrivning,

- ägare,

- tidsperiod,

- framgångskriterier,

- relaterade mått,

- beroenden,

- och status.

23.90 MÅL OCH METRIK

Ett strategiskt mål kan ha flera mått.

Exempel:

Mål:

Göra GainPilot användbart som långsiktig personlig coach.

Mått kan omfatta:

- förståelse,

- kärnplansföljsamhet,

- minneskorrigeringar,

- användarupplevd kontroll,

- säkerhet,

- och långsiktig användning.

23.91 OKR OCH LIKNANDE RAMVERK

GainPilot kan använda OKR eller andra målsystem.

Ramverket får inte ersätta:

- verkligt produktomdöme,

- riskhantering,

- eller canonical vision.

23.92 MÅLKONFLIKT

Executive Intelligence ska kunna synliggöra konflikter mellan mål.

Exempel:

- snabb lansering,

- låg kostnad,

- hög kvalitet,

- bred domänsupport,

- och stark säkerhetsvalidering

kan inte alltid maximeras samtidigt.

23.93 PRIORITERING

Atlas ska kunna hjälpa till att prioritera utifrån:

- användarvärde,

- strategisk betydelse,

- risk,

- kostnad,

- beroenden,

- reversibilitet,

- och evidens.

Prioritering ska inte enbart baseras på störst efterfrågan.

23.94 PRIORITERINGSMODELL

En prioriteringsmodell ska vara transparent.

Om poäng används ska viktningen vara synlig.

Poängen ska inte ersätta beslut.

23.95 REVERSIBILITET

Reversibla beslut kan genomföras med lägre tröskel än:

- irreversibla,

- juridiskt bindande,

- eller integritetskänsliga beslut.

Reversibilitet ska ingå i beslutsunderlaget.

23.96 OPTION VALUE

I osäkra områden kan det vara värdefullt att bevara framtida alternativ.

Exempel:

En liten modulär implementation kan vara bättre än en stor leverantörslåsning även om den första kostnaden är högre.

23.97 KOSTNADEN FÖR ATT INTE AGERA

Executive Intelligence ska kunna beskriva konsekvensen av att avvakta.

Exempel:

- växande teknisk skuld,

- fortsatt användarfriktion,

- säkerhetsrisk,

- eller förlorad marknadsmöjlighet.

Att inte agera är också ett beslut.

23.98 BESLUTSBRÅDSKA

Brådska ska baseras på:

- risk,

- tidsfönster,

- beroenden,

- och kostnad för fördröjning.

Atlas får inte skapa artificiell brådska.

23.99 SIGNALTRÖSKEL

En signal ska ha definierad tröskel eller detektionsregel.

Exempel:

- absolut nivå,

- procentuell förändring,

- statistisk avvikelse,

- sekventiellt mönster,

- eller kvalitativ säkerhetshändelse.

23.100 STATISKA TRÖSKLAR

Statiska trösklar är enkla men kan vara olämpliga när:

- användarbasen växer,

- säsongen förändras,

- eller produktmixen skiftar.

De ska granskas regelbundet.

23.101 DYNAMISKA TRÖSKLAR

Dynamiska trösklar kan anpassas efter:

- historik,

- säsong,

- segment,

- och normal variation.

De ska vara förklarbara och versionerade.

23.102 ANOMALIDETEKTION

Anomalidetektion ska kunna identifiera oväntade mönster.

Den ska inte automatiskt klassificera dem som:

- fel,

- bedrägeri,

- eller användarproblem.

Anomalin ska analyseras.

23.103 SÄSONGSVARIATION

GainPilot ska ta hänsyn till:

- helger,

- semestrar,

- årstider,

- nyår,

- sjukdomsperioder,

- och träningssäsonger.

En naturlig säsongsförändring ska inte automatiskt skapa produktpanik.

23.104 BASLINJE

Varje signal ska jämföras med relevant baslinje.

Baslinjen kan vara:

- tidigare period,

- kontrollgrupp,

- förväntat intervall,

- eller jämförbart användarsegment.

23.105 TREND

En trend ska beskrivas över en tillräcklig period.

En enskild dags förändring är normalt inte en trend.

23.106 VOLATILITET

Mått med stor naturlig variation ska inte skapa täta falska signaler.

Systemet ska kunna använda:

- glidande medelvärden,

- intervall,

- eller andra stabiliserande metoder

utan att dölja verkliga problem.

23.107 SIGNALFATIGUE

För många signaler kan göra Executive Intelligence oanvändbart.

GainPilot ska kunna:

- deduplicera,

- gruppera,

- prioritera,

- och undertrycka lågnyttesignaler.

23.108 SIGNALGRUPPERING

Flera relaterade signaler kan samlas till ett intelligence item.

Exempel:

- längre modellresponstid,

- fler timeouts,

- fler avbrutna Arnold-dialoger,

- och högre kostnad

kan vara delar av samma modellincident.

23.109 SIGNALDEDUPLICERING

Samma underliggande händelse ska inte skapa:

- flera identiska varningar,

- flera utvecklingsärenden,

- eller flera strategiska rekommendationer.

23.110 SIGNALENS LIVSCYKEL

En signal ska kunna:

- öppnas,

- bekräftas,

- utredas,

- länkas,

- undertryckas,

- eskaleras,

- lösas,

- och arkiveras.

23.111 FALSK POSITIV

Systemet ska kunna registrera när en signal visade sig vara falsk eller irrelevant.

Detta ska användas för att förbättra detektionen.

23.112 FALSK NEGATIV

GainPilot ska även följa problem som inte upptäcktes i tid.

Exempel:

En användarrapporterad bugg kan visa att befintliga mätvärden saknade rätt signal.

23.113 KVALITATIVA SIGNALER

Alla viktiga signaler är inte numeriska.

Kvalitativa signaler kan komma från:

- användarfeedback,

- support,

- domänexpert,

- incidentreview,

- eller användartest.

De ska struktureras utan att förlora kontext.

23.114 ANVÄNDARFEEDBACK

Feedback ska kunna klassificeras som:

- problem,

- önskemål,

- korrigering,

- säkerhet,

- beröm,

- missförstånd,

- eller annat.

En enskild högljudd användare ska inte automatiskt styra roadmapen.

23.115 FEEDBACKENS PROVENANCE

Systemet ska kunna skilja mellan:

- direkt användarfeedback,

- supportens tolkning,

- Arnold-sammanfattning,

- och Atlas-analys.

23.116 FULL DIALOG OCH STRUKTURERAD SIGNAL

GainPilot ska i första hand omvandla dialog till en minimerad strukturerad signal.

Exempel:

Full dialog:

Privat diskussion med Arnold.

Strukturerad signal:

Användaren upplevde substitutionsförklaringen som otydlig.

Full dialog ska endast granskas vid relevant och godkänd kvalitetshantering.

23.117 SUPPORTSIGNALER

Support ska kunna skapa:

- produktproblem,

- tekniskt problem,

- integritetsproblem,

- säkerhetsproblem,

- eller utbildningsbehov.

Återkommande ärenden ska kunna grupperas.

23.118 DOMÄNEXPERTSIGNALER

Domänexperter ska kunna flagga:

- felaktig träningslogik,

- riskfylld progression,

- otydlig teknikmedia,

- eller olämplig kostlogik.

Expertens signal ska ha känd kompetens och scope.

23.119 RESEARCHSIGNALER

Ny forskning eller externa förändringar kan skapa researchsignaler.

De ska inte automatiskt bli produktförändringar.

Signalen ska innehålla:

- källa,

- kvalitet,

- relevans,

- och behov av vidare granskning.

23.120 MARKNADSSIGNALER

Atlas kan följa:

- konkurrenter,

- nya produktkategorier,

- prissättning,

- teknikutveckling,

- och användarbeteenden.

Marknadssignaler ska bedömas mot GainPilots strategi.

23.121 INGEN FUNKTIONSKOPIERING UTAN STRATEGI

Att en konkurrent lanserar en funktion ska inte automatiskt skapa samma roadmapinitiativ i GainPilot.

23.122 RESEARCHFREKVENS

Periodisk research ska ha:

- definierat ämne,

- frekvens,

- budget,

- källkrav,

- och mottagare.

Kontinuerlig sökning utan beslutssyfte ska undvikas.

23.123 KÄLLHIERARKI

Executive Intelligence ska värdera källor.

Exempel på högre tillförlitlighet:

- intern canonical data,

- verifierade systemhändelser,

- primär forskning,

- officiella dokument,

- och kvalificerad expertgranskning.

Lägre tillförlitlighet kan omfatta:

- marknadsföring,

- obekräftade påståenden,

- och enskilda sociala inlägg.

23.124 KÄLLKONFLIKT

När källor motsäger varandra ska Atlas:

- redovisa konflikten,

- värdera kvalitet,

- och undvika falsk säkerhet.

23.125 KAUSALITET

GainPilot ska skilja mellan:

- korrelation,

- sekvens,

- association,

- och kausal effekt.

Atlas får inte säga:

Förändring X orsakade Y

enbart för att X inträffade före Y.

23.126 ALTERNATIVA FÖRKLARINGAR

Varje betydelsefull analys ska överväga alternativa orsaker.

Exempel:

Minskad träningsloggning kan bero på:

- sämre produktflöde,

- säsong,

- tekniskt fel,

- mindre behov av loggning,

- eller att användarna lämnat produkten.

23.127 KONFOUNDERS

Analysen ska försöka identifiera faktorer som påverkar både:

- den misstänkta orsaken,

- och utfallet.

Detta är särskilt viktigt vid produktförändringar som lanseras samtidigt.

23.128 EXPERIMENT

Kontrollerade experiment kan användas när:

- frågan är lämplig,

- risken är låg,

- användarskyddet är bevarat,

- och tydligt beslutsvärde finns.

23.129 EXPERIMENTREGISTER

Varje experiment ska ha:

- experiment identity,

- hypotes,

- målgrupp,

- kontroll,

- variant,

- primärt mått,

- skyddsmått,

- start,

- slut,

- stoppregel,

- och ansvarig.

23.130 EXPERIMENT FÅR INTE VARA DOLD MANIPULATION

GainPilot får inte experimentera med:

- skuld,

- skam,

- rädsla,

- falsk brådska,

- hälsorisk,

- eller försvårad uppsägning

för att öka engagemang eller intäkt.

23.131 SÄKERHETSEXPERIMENT

Säkerhetskritiska regler ska normalt inte A/B-testas mot en mindre säker variant.

Testning ska i stället ske genom:

- simulering,

- shadow mode,

- expertgranskning,

- och kontrollerad validering.

23.132 RANDOMISERING

När randomisering används ska den vara:

- reproducerbar,

- scopead,

- och dokumenterad.

Användaren ska inte hamna i motstridiga experiment samtidigt utan kontroll.

23.133 EXPERIMENTKONFLIKT

Systemet ska kunna upptäcka när flera experiment påverkar samma:

- användarflöde,

- metrik,

- agent,

- eller segment.

23.134 STOPPREGEL

Experiment ska stoppas när:

- säkerhetsmått försämras,

- integritetsrisk uppstår,

- tekniskt fel påverkar resultatet,

- eller förväntad nytta inte längre motiverar fortsatt test.

23.135 STATISTISK OCH PRAKTISK BETYDELSE

En statistiskt mätbar förändring kan vara för liten för att ha praktiskt värde.

Executive Intelligence ska beskriva:

- effektstorlek,

- osäkerhet,

- och faktisk produktbetydelse.

23.136 UNDERPOWERED EXPERIMENT

Små experiment ska inte presentera starka slutsatser när datan är otillräcklig.

Statusen ska kunna vara:

insufficient evidence.

23.137 LÅNGSIKTIGA EFFEKTER

En variant som förbättrar kortsiktig aktivering kan försämra:

- långsiktig förståelse,

- retention,

- säkerhet,

- eller förtroende.

GainPilot ska följa relevanta längre utfall.

23.138 SHADOW MODE SOM ANALYSVERKTYG

Nya agent-, modell- och beslutsversioner ska kunna köras i shadow mode.

Det gör det möjligt att jämföra:

- rekommendationer,

- databruk,

- confidence,

- kostnad,

- och säkerhet

utan användarpåverkan.

23.139 CANARY

Canary-utrullning ska användas för verklig men begränsad validering.

Canary ska ha:

- målgrupp,

- riskklass,

- mätvärden,

- stoppregler,

- och rollback.

23.140 FÖRE-EFTER-ANALYS

Före-efter-jämförelse kan användas men ska ta hänsyn till:

- säsong,

- andra releaser,

- populationens förändring,

- och mätdefinitioner.

23.141 KOHORTANALYS

Kohorter ska kunna skapas efter exempelvis:

- registreringsperiod,

- programstart,

- produktversion,

- eller träningsdomän.

Kohortanalys ska skydda små grupper.

23.142 FUNNEL

Funnels kan användas för att förstå flöden.

Exempel:

Registrering

→ onboarding

→ programförslag

→ programgodkännande

→ första pass

→ första vecka.

Varje steg ska representera verklig användarnytta.

23.143 FUNNEL ÄR INTE HELA PRODUKTEN

En funnel kan visa var användare lämnar.

Den kan inte ensam förklara varför.

23.144 JOURNEY-ANALYS

GainPilot ska kunna analysera längre användarresor.

Exempel:

- nybörjare till självständig tränande,

- viktminskning till viktstabilitet,

- återstart efter paus,

- eller övergång mellan träningsdomäner.

23.145 USER OUTCOMES

GainPilot ska vara försiktigt med att lova eller mäta resultat som:

- viktförändring,

- styrkeökning,

- eller konditionsförbättring

utan att förstå:

- datakvalitet,

- tidsperiod,

- följsamhet,

- och externa faktorer.

23.146 RESULTAT OCH ATTRIBUTION

Ett förbättrat träningsresultat kan påverkas av:

- GainPilot,

- användarens eget arbete,

- extern coach,

- sömn,

- tidigare erfarenhet,

- och andra faktorer.

GainPilot ska inte tillskriva sig hela effekten.

23.147 PROXYMÅTT

När verkligt utfall är svårt att mäta kan proxyer användas.

Proxyer ska märkas tydligt.

Exempel:

Programförståelse kan uppskattas genom:

- färre korrigeringar,

- rätt användning av reservplan,

- och användarfeedback.

Detta är inte en fullständig mätning av förståelse.

23.148 DATAKVALITET

Varje analys ska bedöma datakvalitet.

Dimensioner kan vara:

- fullständighet,

- korrekthet,

- aktualitet,

- konsistens,

- provenance,

- och representativitet.

23.149 DATAKVALITETSSIGNAL

Försämrad datakvalitet ska kunna skapa en signal.

Exempel:

- wearableintegration tappar data,

- dubbla events ökar,

- eller en ny appversion slutar skicka viss information.

23.150 SCHEMAFÖRÄNDRING

När eventschema eller metrikdefinition ändras ska analyskedjan uppdateras.

Gamla och nya data får inte blandas utan kontroll.

23.151 LATE ARRIVING DATA

Försenad data ska hanteras.

En rapport ska kunna visa:

- preliminärt,

- uppdaterat,

- och slutligt värde.

23.152 DUPLIKATDATA

Dubbletter ska identifieras genom:

- event identity,

- idempotency identity,

- och källkontroll.

Dubbla träningsresultat får inte skapa falsk tillväxt.

23.153 BORTFALL

Mätningen ska kunna uppskatta eller markera bortfall.

Den får inte tyst behandla saknade värden som noll.

23.154 DATA LINEAGE

Det ska gå att följa ett mått från:

- presentation,

- genom transformationer,

- till ursprunglig källa.

Lineage ska inkludera versioner.

23.155 PROVENANCE

Varje intelligence item ska ha provenance för:

- data,

- analys,

- modell,

- expert,

- och beslut.

23.156 MODELLGENERERAD ANALYS

När en språkmodell eller analysmodell skapar en tolkning ska detta anges.

Modellen ska inte presenteras som datakälla.

23.157 STRUKTURERAT ANALYSRESULTAT

Atlas och analysagenter ska där möjligt returnera:

- observationer,

- supporting evidence,

- counter-evidence,

- hypotheses,

- confidence,

- alternatives,

- recommendation,

- risk,

- och required decision.

23.158 INGEN FRI TEXT SOM ENDA BESLUTSUNDERLAG

Betydelsefulla rekommendationer ska inte endast finnas i en lång AI-text.

De ska ha strukturerade fält och källreferenser.

23.159 EXECUTIVE BRIEF

Atlas ska kunna skapa en executive brief.

Den kan innehålla:

1. Vad som förändrats.

2. Varför det är viktigt.

3. Hur säker analysen är.

4. Vilka mål som påverkas.

5. Rekommenderad riktning.

6. Alternativ.

7. Risk och kostnad.

8. Beslut som krävs.

9. Nästa uppföljning.

23.160 DAGLIG OPERATIV BRIEF

En daglig brief ska endast innehålla sådant som kräver:

- operativ uppmärksamhet,

- beslut,

- eller riskhantering.

Den ska inte vara en dump av alla mätvärden.

23.161 VECKOBRIEF

En veckobrief kan sammanfatta:

- användarnytta,

- produktfriktion,

- agentstatus,

- teknik,

- ekonomi,

- roadmap,

- och risker.

23.162 MÅNADSBRIEF

En månadsbrief kan fokusera på:

- strategiska mål,

- retention,

- intäkt,

- kostnad,

- produktkvalitet,

- säkerhet,

- och större beslut.

23.163 BESLUTSINKORG

Executive Intelligence ska kunna skapa en beslutsinkorg.

Varje post ska visa:

- beslutet som krävs,

- deadline,

- rekommendation,

- alternativ,

- risk,

- kostnad,

- och ansvarig.

23.164 INFORMATION ÄR INTE BESLUT

Mått som inte kräver åtgärd ska inte fylla beslutsinkorgen.

23.165 WATCHLIST

GainPilot ska kunna ha en watchlist över:

- osäkra signaler,

- växande risker,

- experiment,

- och beroenden

som ännu inte kräver beslut.

23.166 RISKREGISTER

Executive Intelligence ska kopplas till ett riskregister.

Risker kan omfatta:

- produkt,

- säkerhet,

- integritet,

- teknik,

- ekonomi,

- juridik,

- leverantör,

- kompetens,

- och strategi.

23.167 RISKSCORE

Om riskpoäng används ska den bygga på separata dimensioner som:

- sannolikhet,

- påverkan,

- upptäckbarhet,

- återställningsförmåga,

- och tid till skada.

Poängen ska vara förklarbar.

23.168 RISKÄGARE

Varje betydelsefull risk ska ha:

- ägare,

- mitigering,

- trigger,

- reviewdatum,

- och status.

23.169 MÖJLIGHETSREGISTER

Executive Intelligence ska även kunna följa möjligheter.

Exempel:

- ny målgrupp,

- stark användarsignal,

- teknikförbättring,

- partnerskap,

- eller kostnadsbesparing.

23.170 MÖJLIGHET ÄR INTE AUTOMATISKT PRIORITERAD

En möjlighet ska bedömas mot:

- strategi,

- resurser,

- risk,

- timing,

- och alternativkostnad.

23.171 BESLUTSHISTORIK

Executive Intelligence ska kunna visa tidigare beslut och deras utfall.

Detta ska minska risken att samma diskussion upprepas utan lärande.

23.172 BESLUTSUPPFÖLJNING

Ett beslut ska ha:

- förväntad effekt,

- mätplan,

- reviewdatum,

- och kriterier för att fortsätta, ändra eller rulla tillbaka.

23.173 BESLUT UTAN ÅTGÄRD

Ett giltigt beslut kan vara:

- avvakta,

- samla mer data,

- eller inte genomföra förslaget.

Även detta ska dokumenteras när frågan är betydelsefull.

23.174 BESLUTSFÖRFALL

Tidsbegränsade beslut och mandat ska kunna löpa ut.

Exempel:

Ett experimentellt pris eller agentmandat ska inte bli permanent av glömska.

23.175 REKOMMENDATION OCH APPROVAL

Atlas kan rekommendera.

Rätt mänsklig eller organisatorisk aktör ska:

- godkänna,

- ändra,

- avvisa,

- eller skjuta upp.

23.176 ATLAS FÅR INTE BLI BESLUTSÄGARE GENOM PRESENTATION

En välformulerad Atlas-rapport får inte dölja vem som faktiskt ansvarar för beslutet.

23.177 AUTOMATISKA LÅGRISKÅTGÄRDER

Vissa operativa lågriskåtgärder kan automatiseras.

Exempel:

- öppna ett analysärende,

- uppdatera en dashboard,

- eller pausa ett felande icke-kritiskt workflow enligt fördefinierad regel.

Automationen ska ha explicit mandat.

23.178 HÖGRISKÅTGÄRDER

Följande ska normalt kräva starkare kontroll:

- ändrad säkerhetsregel,

- ny användardatadelning,

- prishöjning,

- höjd agentautonomi,

- större programlogik,

- eller produktionsdeployment.

23.179 EXECUTIVE INTELLIGENCE OCH ROADMAP

Atlas ska kunna koppla intelligence items till:

- roadmapinitiativ,

- capabilities,

- teknisk skuld,

- och stages.

En signal ska inte direkt skapa ett roadmaplöfte.

23.180 PRIORITERINGSKÖ

Roadmapförslag ska kunna placeras i:

- investigate,

- candidate,

- approved,

- planned,

- in_progress,

- measuring,

- eller rejected.

23.181 BEROENDEN

Executive Intelligence ska kunna visa att ett förslag beror på:

- annan capability,

- datamigration,

- säkerhetsarbete,

- expertgranskning,

- eller budget.

23.182 KAPACITET

Prioritering ska ta hänsyn till faktisk:

- utvecklingskapacitet,

- ekonomi,

- expertis,

- och operativ belastning.

Atlas ska inte föreslå en orealistisk mängd parallellt arbete.

23.183 WORK IN PROGRESS

GainPilot ska begränsa antal samtidiga strategiska initiativ.

För många parallella projekt kan minska faktisk leverans.

23.184 TEKNISK SKULD

Teknisk skuld ska kunna representeras som:

- konsekvens,

- risk,

- påverkade capabilities,

- kostnad,

- och rekommenderad tidpunkt.

Teknisk skuld ska inte endast vara en osorterad lista.

23.185 DOKUMENTATIONSSKULD

Skillnad mellan:

- canonical bok,

- tekniska kontrakt,

- kod,

- och verklig produkt

ska kunna skapa en documentation drift-signal.

23.186 AGENTSKULD

Agentarkitekturen kan få skuld genom:

- för breda prompts,

- otydlig capabilityrouting,

- gamla modellversioner,

- eller svårtestade agentkedjor.

Detta ska följas separat.

23.187 DATA- OCH ANALYSSKULD

GainPilot ska kunna följa:

- odefinierade mått,

- trasig lineage,

- föråldrade dashboards,

- och experiment utan avslut.

23.188 KOSTNAD FÖR SKULD

Skuld ska bedömas utifrån:

- nuvarande friktion,

- framtida risk,

- fördröjd utveckling,

- och potentiell incidentkostnad.

23.189 ALERT OCH INTELLIGENCE

Ett tekniskt alert är inte alltid ett executive intelligence item.

Alerts ska först:

- klassificeras,

- dedupliceras,

- och bedömas för verksamhetspåverkan.

23.190 INCIDENT OCH EXECUTIVE INTELLIGENCE

Allvarliga incidenter ska kunna skapa:

- operativ incident,

- executive signal,

- och efterföljande lärande.

Incidenthanteringen ska inte vänta på en executive rapport.

23.191 POST-INCIDENT REVIEW

Efter incident ska analysen omfatta:

- vad som hände,

- påverkan,

- varför skydden inte räckte,

- vad som fungerade,

- och vilka förändringar som behövs.

Fokus ska ligga på systemförbättring, inte endast skuld.

23.192 SÄKERHETSOVERRIDES

Executive Intelligence får inte rekommendera att säkerhetskontroller försvagas endast för att:

- konvertering,

- retention,

- eller kostnad

förbättras.

23.193 INTEGRITETSOVERRIDES

Atlas får inte föreslå bredare användardataåtkomst enbart för att analysen blir enklare.

Först ska minimerade alternativ prövas.

23.194 HERMES OCH EXECUTIVE INTELLIGENCE

Hermes ska skapa särskilda analys- och signalpaket.

De ska kunna innehålla:

- aggregat,

- reducerade signaler,

- segment med tillräcklig storlek,

- datakvalitet,

- och förbjudna användningar.

23.195 INDIVIDDATA

Individdata ska endast användas när:

- ett support- eller säkerhetsärende kräver det,

- användaren godkänt relevant analys,

- eller annan uttrycklig grund finns.

Executive Intelligence ska inte vara en genväg runt Hermes.

23.196 PRIVATA DIALOGER

Fulla Arnold-dialoger ska inte vara standardinput till Atlas.

Strukturerade signaler ska prioriteras.

23.197 KÄNSLIGA RESULTAT

Rapporter ska undvika att visa små grupper eller ovanliga kombinationer som kan identifiera användare.

23.198 DIFFERENTIAL PRIVACY OCH ANDRA METODER

GainPilot kan senare överväga tekniker som:

- differential privacy,

- secure aggregation,

- och privacy-preserving analytics

där det ger verkligt värde.

Tekniknamnet ska inte användas som garanti utan korrekt implementation.

23.199 DATARETENTION FÖR ANALYS

Analysdata ska ha separat retention.

Råevents behöver inte sparas lika länge som:

- aggregerade mått,

- beslut,

- och validerat lärande.

23.200 RADERING

När användardata raderas ska:

- identifierbara analysunderlag,

- pseudonymer,

- och härledda segment

hanteras enligt Kapitel 22:s regler.

23.201 ANALYSMILJÖ

Analys ska ske i isolerad miljö med:

- rätt tenant,

- dataklass,

- åtkomst,

- och exportkontroll.

23.202 DATAEXPORT FRÅN ANALYSMILJÖ

Resultat som lämnar analysmiljön ska:

- minimeras,

- klassificeras,

- och granskas för återidentifieringsrisk.

23.203 EXTERNA ANALYSVERKTYG

Externa analytics- och BI-verktyg ska behandlas som leverantörsintegrationer.

GainPilot ska kontrollera:

- datatyper,

- region,

- retention,

- access,

- och export.

23.204 INGEN OBEGRÄNSAD EVENTEXPORT

GainPilot ska inte skicka alla råevents till externa analysleverantörer av bekvämlighet.

23.205 DASHBOARDS

Dashboards ska utformas efter mottagare.

Exempel:

- grundare,

- produktägare,

- teknisk drift,

- säkerhet,

- ekonomi,

- och domänexpert.

Alla ska inte se samma data.

23.206 ROLLSTYRD DASHBOARD

Dashboardåtkomst ska följa:

- roll,

- tenant,

- dataklass,

- och syfte.

23.207 DASHBOARDENS DATASTATUS

Varje dashboard ska visa:

- senaste uppdatering,

- datatäckning,

- definition,

- och kända fel

för viktiga mått.

23.208 INGEN DEKORATIV PRECISION

Executive Intelligence ska inte visa fler decimaler eller exakta prognoser än underlaget motiverar.

23.209 VISUELL PRIORITERING

Rapporter ska prioritera:

- beslut,

- förändring,

- risk,

- och osäkerhet

framför stora mängder dekorativa diagram.

23.210 TILLGÄNGLIGHET

Dashboards och briefs ska fungera med:

- skärmläsare,

- tangentbord,

- textförstoring,

- och tydliga textalternativ.

Färg får inte vara enda signalbärare.

23.211 SPRÅK

Executive briefs ska kunna presenteras på svenska och framtida användarspråk.

Domänspecifika termer ska behålla korrekt betydelse.

23.212 ARNOLD OCH ANALYS

Arnold ska kunna visa användaren personlig GainPilot-analys.

Exempel:

- utveckling,

- genomförbarhet,

- återkommande hinder,

- och programanpassningar.

Detta ska baseras på användarens egna data och mandat.

23.213 ATLAS OCH INDIVIDENS ANALYS

Atlas ska inte automatiskt presentera central verksamhetsanalys som personlig coachning.

Arnold ska översätta relevanta beslut till användarens GainPilot-kontext.

23.214 PERSONLIG DASHBOARD

Användarens dashboard ska prioritera:

- aktiva mål,

- begriplig progression,

- kärnplan,

- relevanta förändringar,

- och nästa steg.

Den ska inte överbelastas med produktmetrik.

23.215 JÄMFÖRELSE MED ANDRA

Personlig analys ska normalt jämföra användaren med:

- sin egen historik,

- sina mål,

- och sin plan.

Jämförelse med andra ska vara valbar och kontextualiserad.

23.216 BENCHMARKS

Benchmarks ska ha:

- relevant population,

- metod,

- och begränsningar.

GainPilot ska inte säga:

Du ligger under genomsnittet

utan att förklara vad genomsnittet representerar.

23.217 NORMATIV ANALYS

Statistik ska inte automatiskt användas för att tala om vad användaren bör vilja.

Vanligt beteende är inte automatiskt optimalt eller önskvärt.

23.218 AUTOMATISK INSIGHT-GENERERING

Atlas och analysagenter kan generera möjliga insights.

Varje insight ska valideras för:

- datagrund,

- betydelse,

- kausalitetsnivå,

- och integritet.

23.219 INSIGHT-FATIGUE

Systemet ska begränsa triviala automatiska insights.

Exempel:

Du tränade mer den här veckan än förra veckan.

ska endast visas när det har relevant betydelse.

23.220 FÖRKLARBAR INSIGHT

En insight ska kunna svara på:

- Vilken data användes?

- Vilken period?

- Vad jämförs?

- Hur säker är slutsatsen?

- Och vilket beslut kan den stödja?

23.221 INGEN MOTIVERANDE FÖRVRÄNGNING

Arnold får inte ändra analysens faktiska innebörd för att göra den mer uppmuntrande.

Han kan formulera den respektfullt.

23.222 OBSERVABILITY FÖR ANALYS

Analysflödet ska vara observerbart.

Det ska gå att se:

- datakälla,

- transformationsversion,

- metrikversion,

- modell,

- prompt eller policy,

- och slutligt intelligence item.

23.223 AUDIT

Betydelsefulla händelser ska auditeras.

Exempel:

- nytt strategiskt mått skapades,

- känsligt segment aktiverades,

- Atlas fick individdata,

- rekommendation godkändes,

- experiment stoppades,

- eller beslut rullades tillbaka.

23.224 ANALYSINCIDENT

En analysincident kan vara:

- fel population,

- felaktig nämnare,

- dataläcka,

- falsk kausalitet,

- trasig dashboard,

- eller beslut byggt på korrupt data.

23.225 KONSEKVENSANALYS

När ett mått visar sig vara fel ska GainPilot identifiera:

- vilka rapporter,

- rekommendationer,

- beslut,

- och experiment

som påverkades.

23.226 RÄTTELSE

Felaktiga executive briefs ska kunna rättas.

Rättelsen ska:

- markera vad som var fel,

- ge korrekt information,

- och identifiera eventuella påverkade beslut.

23.227 ROLLBACK

GainPilot ska kunna återställa:

- metrikdefinition,

- datatransformation,

- signalregel,

- analysmodell,

- dashboard,

- och automatiskt arbetsflöde.

Rollback får inte skriva om historiska beslut.

23.228 ANALYSDRIFT

Systemet ska övervaka om analysen över tid:

- använder större datamängder,

- skapar fler signaler,

- får sämre precision,

- eller börjar prioritera fel mål.

23.229 MODELLDRIFT

Atlas och analysagenter ska följas för:

- ändrad rekommendationsstil,

- förlorad osäkerhet,

- fler kausalitetspåståenden,

- och större kontextbehov.

23.230 TESTNING AV EXECUTIVE INTELLIGENCE

Teststrategin ska omfatta:

- metriktester,

- datakvalitetstester,

- lineage-tester,

- signaltester,

- integritetstester,

- agenttester,

- och beslutsscenarier.

23.231 METRIKTESTER

Tester ska verifiera:

- definition,

- population,

- nämnare,

- tidsperiod,

- enhet,

- och version.

23.232 DATAQUALITY-TESTER

Tester ska omfatta:

- saknade events,

- dubbletter,

- försenad data,

- fel schema,

- och fel tenant.

23.233 SIGNALTESTER

Tester ska verifiera:

- tröskel,

- deduplicering,

- severity,

- confidence,

- och lifecycle.

23.234 KAUSALITETSTESTER

Atlas ska testas för att inte uttrycka säker kausalitet från enkel korrelation.

23.235 ALTERNATIVHYPOTESTESTER

Analysagenten ska kunna generera och väga flera möjliga förklaringar.

23.236 INTEGRITETSTESTER

Tester ska verifiera:

- små segment,

- individdata,

- Hermes-paket,

- extern analytics,

- och radering.

23.237 BESLUTSTESTER

Systemet ska testas så att:

- rekommendation inte automatiskt blir beslut,

- beslut inte automatiskt breddar mandat,

- och högriskåtgärd kräver approval.

23.238 EXPERIMENTTESTER

Tester ska omfatta:

- assignment,

- målgrupp,

- skyddsmått,

- stoppregel,

- experimentkonflikt,

- och resultatberäkning.

23.239 DASHBOARDTESTER

Dashboards ska testas för:

- korrekt värde,

- datafreshness,

- behörighet,

- tillgänglighet,

- och felmeddelanden.

23.240 SHADOW MODE

Nya signal-, analys- och rekommendationsmodeller ska köras i shadow mode.

De får skapa alternativa intelligence items utan att påverka beslut.

23.241 PARALLELL UTVÄRDERING

Aktiv och ny analysversion ska jämföras för:

- träffsäkerhet,

- falska positiva,

- databruk,

- kostnad,

- och användbarhet.

23.242 CANARY

Ny Executive Intelligence-logik ska först användas för:

- intern tenant,

- lågriskmått,

- eller begränsad rapport.

Den ska inte börja med automatiska högriskbeslut.

23.243 MANUELL REVIEW

Strategiska rekommendationer från ny modell ska initialt granskas manuellt.

23.244 FRAMGÅNGSMÅTT FÖR EXECUTIVE INTELLIGENCE

Relevanta mått kan vara:

- beslut som fattas med tillräckligt underlag,

- falska signaler,

- missade risker,

- rekommendationer som verifieras,

- tid från signal till beslut,

- och andel rekommendationer som avslutas med uppföljning.

23.245 INTE FLER RAPPORTER SOM MÅL

Antal dashboards, briefs eller intelligence items är inte ett framgångsmått.

23.246 MÄNSKLIGT ANSVAR

Executive Intelligence ska ha tydliga mänskliga ägare för:

- måldefinition,

- metrik,

- dataskydd,

- rekommendationer,

- och beslut.

23.247 INGEN SJÄLVMODIFIERANDE ANALYS

Atlas eller analysagenter får inte själva:

- byta strategiskt mål,

- ändra North Star,

- bredda dataåtkomst,

- eller automatisera beslut

utan rätt process.

23.248 FÖRBÄTTRINGSFÖRSLAG

Executive Intelligence får föreslå förändringar i:

- metrik,

- signalsystem,

- dashboards,

- och analysmetod.

Förslagen ska granskas.

23.249 KONTROLLERAD UTVECKLING

Canonical utvecklingsflöde ska vara:

Signal

→ analysbehov

→ dataskyddsbedömning

→ metrik- eller modellförslag

→ godkänt scope

→ separat branch

→ implementation

→ data- och metriktester

→ integritets- och säkerhetstester

→ shadow mode

→ pull request

→ review

→ canary

→ kontrollerad merge

→ effektuppföljning.

23.250 ARKITEKTURKONTRAKT

Följande kontrakt är normerande för analys, signaler och Executive Intelligence.

**Kontrakt GP-429 — Analyskedjan ska vara explicit**

Händelse, observation, mätvärde, signal, analys, hypotes, rekommendation, beslut, mandat, åtgärd och effekt ska vara separata och spårbara steg.

**Kontrakt GP-430 — Signal är inte beslut**

Ingen mätförändring, anomali, användarfeedback eller Atlas-analys får automatiskt förändra produkt, policy, pris, säkerhet eller agentmandat.

**Kontrakt GP-431 — Executive Intelligence ska vara multidimensionellt**

GainPilot får inte reduceras till en enda health score, North Star eller intäktsmetrik utan separata dimensioner för användarnytta, säkerhet, integritet, kvalitet, teknik och verksamhet.

**Kontrakt GP-432 — Varje optimeringsmått kräver skyddsmått**

Produkt- och affärsoptimering ska följas av mått som kan upptäcka försämrad säkerhet, integritet, användarkontroll, kvalitet eller långsiktig nytta.

**Kontrakt GP-433 — Metrik ska vara definierad och versionerad**

Varje betydelsefull metrik ska ha ägare, population, nämnare, tidsperiod, beräkningsmetod, datakälla, version och kända begränsningar.

**Kontrakt GP-434 — Appaktivitet är inte användarnytta**

Öppningar, klick, konversationslängd, loggning och skärmtid får inte ensamma användas som bevis på att GainPilot hjälper användaren.

**Kontrakt GP-435 — Domänspecifik framgång ska bevaras**

Träning, kost, CrossFit, calisthenics, återhämtning och följsamhet ska mätas enligt sina egna canonical modeller och får inte reduceras till en universell aktivitetsprocent.

**Kontrakt GP-436 — Korrelation får inte presenteras som kausalitet**

Atlas och analysagenter ska skilja association från orsak, redovisa alternativa förklaringar och uttrycka osäkerhet.

**Kontrakt GP-437 — Analys ska ha provenance och lineage**

Intelligence items, metrics, signals och rekommendationer ska kunna spåras till data, transformationsversion, modell, expert och beslutskontext.

**Kontrakt GP-438 — Saknad och ofullständig data ska synliggöras**

GainPilot får inte tyst tolka saknad registrering som noll, frånvaro eller misslyckande.

**Kontrakt GP-439 — Segmentering ska vara integritetssäker**

Känsliga, små eller återidentifierbara segment ska begränsas, minimeras eller döljas och får inte användas för olämplig profilering.

**Kontrakt GP-440 — Hermes ska minimera Executive Intelligence-data**

Atlas och analysagenter ska i första hand använda aggregat, reducerade signaler och tillräckligt stora segment i stället för full individuell GainPilot-data.

**Kontrakt GP-441 — Privat dialog är inte standardanalytik**

Fullständiga Arnold-konversationer får inte automatiskt användas för produkt-, affärs- eller modellanalys.

**Kontrakt GP-442 — Experiment får inte manipulera användaren**

GainPilot får inte experimentera med skuld, rädsla, falsk brådska, sämre säkerhet, integritetsförlust eller försvårad uppsägning för att förbättra engagemang eller intäkt.

**Kontrakt GP-443 — Experiment kräver hypotes och stoppregel**

Varje experiment ska ha definierad målgrupp, kontroll, primärt mått, skyddsmått, tidsperiod, ansvarig och stoppvillkor.

**Kontrakt GP-444 — Statistisk förändring är inte automatiskt produktvärde**

Resultat ska bedömas efter praktisk effekt, användarnytta, kostnad, risk och långsiktiga konsekvenser.

**Kontrakt GP-445 — Rekommendation och mandat ska separeras**

Atlas får analysera och rekommendera men inte själv bevilja strategiskt, ekonomiskt, integritetsmässigt eller högriskmässigt mandat.

**Kontrakt GP-446 — Executive briefs ska vara beslutsorienterade**

Rapporter ska prioritera förändring, betydelse, evidens, osäkerhet, alternativ, risk, kostnad och beslut som krävs framför dekorativa mätvärden.

**Kontrakt GP-447 — Beslut ska följas till effekt**

Betydelsefulla beslut ska ha förväntat resultat, skyddsmått, reviewdatum och möjlighet att fortsätta, ändra, stoppa eller rulla tillbaka.

**Kontrakt GP-448 — Felaktig analys ska konsekvensbedömas**

När data, metrik eller analys visar sig vara fel ska GainPilot identifiera vilka rapporter, rekommendationer, experiment och beslut som påverkades.

**Kontrakt GP-449 — Executive Intelligence får inte kringgå säkerhet**

Ingen produkt-, tillväxt- eller kostnadsanalys får användas för att tyst försvaga GainPilots säkerhets-, integritets- eller professionella gränser.

**Kontrakt GP-450 — Analysagenter ska vara scopeade och testade**

Atlas och specialistagenter ska ha deklarerat datasc ope, capability, modellversion, confidencekalibrering och teststatus.

**Kontrakt GP-451 — Nya analysversioner ska köras i shadow mode**

Nya metric-, signal-, ranking-, analys- och rekommendationsmodeller ska jämföras utan beslutspåverkan innan begränsad utrullning.

**Kontrakt GP-452 — Executive Intelligence får inte självmodifiera målen**

Atlas och analysagenter får inte själva ändra strategiska mål, North Star, datasc ope, metrikdefinitioner eller automatiseringsmandat i produktion.

**Kontrakt GP-453 — Branch- och reviewstyrd analysutveckling**

Förändringar av events, metrics, signaler, experiment, dashboards, Executive Intelligence och automatiska beslut ska ske genom separat branch, tester, integritetsgranskning, shadow mode och kontrollerad utrullning.

23.251 ANTI-PRINCIPER

GainPilot och Omnira ska inte:

- blanda händelse, signal, analys och beslut,

- behandla varje förändring som problem,

- låta signaler direkt ändra produkten,

- reducera GainPilot till en enda health score,

- använda en North Star utan skyddsmått,

- optimera endast för öppningar,

- optimera endast för daglig aktivitet,

- optimera endast för loggning,

- optimera endast för intäkt,

- optimera endast för retention,

- betrakta fler träningspass som automatiskt bättre,

- betrakta högre belastning som automatiskt bättre progression,

- mäta följsamhet utan kortversioner och reservplaner,

- behandla paus som misslyckande,

- använda total nedladdning som aktiv användning,

- använda kontoskapande som meningsfull aktivering,

- korta onboarding genom att ta bort nödvändig säkerhet,

- använda odefinierade mått,

- ändra metrikdefinition utan version,

- dölja nämnare eller population,

- blanda olika metrikversioner,

- anta att saknad data är noll,

- anta att ologgat pass inte genomfördes,

- ignorera datatäckning,

- ignorera selection bias,

- ignorera survivorship bias,

- mäta endast sådant som är lätt att mäta,

- låta målet bli en proxy som förlorat kopplingen till användarnyttan,

- använda vanity metrics i strategiska beslut,

- skapa känsliga användarsegment utan starkt syfte,

- visa små segment som kan identifiera personer,

- kalla borttagna namn för anonymisering,

- exportera alla råevents till externa analysverktyg,

- ge alla interna roller samma dashboard,

- presentera gammal data som aktuell,

- visa falsk decimalprecision,

- skapa dashboards utan ägare,

- generera hundratals triviala insights,

- presentera korrelation som orsak,

- ignorera alternativa förklaringar,

- dra stark slutsats från liten datamängd,

- köra experiment utan hypotes,

- köra experiment utan skyddsmått,

- A/B-testa sämre säkerhet mot bättre konvertering,

- experimentera med skuld eller rädsla,

- använda falsk brådska i experiment,

- göra uppsägning svårare som tillväxttest,

- låta flera motstridiga experiment påverka samma användare,

- fortsätta experiment efter säkerhetsförsämring,

- behandla statistisk signifikans som tillräckligt värde,

- ignorera långsiktiga effekter,

- tillskriva GainPilot hela användarens resultat,

- använda proxy som om det vore verkligt utfall,

- låta korrupt data fortsätta styra beslut,

- dölja data lineage,

- använda språkmodell som datakälla,

- lagra strategisk analys endast som fri AI-text,

- skapa executive brief som metrikdump,

- fylla beslutsinkorgen med information utan beslut,

- skapa artificiell brådska,

- låta Atlas välja mål utan ägarbeslut,

- låta Atlas rekommendera och godkänna samma högriskåtgärd,

- låta rekommendation automatiskt skapa roadmap,

- starta fler initiativ än organisationen kan hantera,

- låta intäktsmål försvaga användarskydd,

- låta kostnadsbesparing stänga kritisk säkerhet,

- använda Executive Intelligence som genväg runt Hermes,

- använda fulla Arnold-dialoger som standardinput,

- visa individuell hälsodata i executive dashboards,

- låta arbetsgivare se individanalys,

- skapa beslut från fel population,

- ignorera felaktig nämnare,

- rätta dashboard utan att utreda påverkade beslut,

- skriva om historiska beslut efter metrikändring,

- använda gamla beslut utan reviewdatum,

- låta experimentella mandat bli permanenta,

- använda analysagent utan deklarerad datatillgång,

- låta analysagent bredda sin egen kontext,

- ändra North Star automatiskt,

- ändra signaltrösklar direkt i produktion,

- låta nya analysmodeller påverka beslut utan shadow mode,

- eller ändra Executive Intelligence direkt i main utan branch, tester, review och kontrollerad utrullning.

23.252 KANONISKA BESLUT FRÅN KAPITEL 23

Följande beslut etableras:

1. GainPilot ska ha en explicit analyskedja.

2. Händelser ska skiljas från observationer.

3. Observationer ska skiljas från mätvärden.

4. Mätvärden ska skiljas från signaler.

5. Signaler ska skiljas från analyser.

6. Analyser ska skiljas från hypoteser.

7. Hypoteser ska skiljas från rekommendationer.

8. Rekommendationer ska skiljas från beslut.

9. Beslut ska skiljas från mandat.

10. Mandat ska skiljas från genomförd åtgärd.

11. Åtgärder ska följas upp genom effektmätning.

12. Resultat ska skapa dokumenterat lärande.

13. Executive Intelligence ska vara multidimensionellt.

14. GainPilot ska inte ha en ogenomskinlig global health score som ensam styrning.

15. Användarnytta ska vara en separat dimension.

16. Säkerhet ska vara en separat dimension.

17. Integritet ska vara en separat dimension.

18. Produktkvalitet ska vara en separat dimension.

19. Domänkorrekthet ska vara en separat dimension.

20. Teknisk tillförlitlighet ska vara en separat dimension.

21. Agentkvalitet ska vara en separat dimension.

22. Ekonomi och verksamhet ska följas separat.

23. Varje intelligence item ska ha stabil identitet.

24. Intelligence items ska ha lifecycle-status.

25. Severity och confidence ska hållas åtskilda.

26. Signalens confidence och hypotesens confidence ska kunna skilja sig.

27. Executive Intelligence ska förstå flera tidshorisonter.

28. Kortsiktig variation ska inte automatiskt styra långsiktig strategi.

29. GainPilot ska ha en metrikstruktur.

30. Strategiska, produkt-, domän-, operativa och tekniska mått ska hållas åtskilda.

31. Skyddsmått ska vara obligatoriska för viktig optimering.

32. Diagnostiska mått ska användas för förklaring.

33. Alla viktiga mått ska registreras.

34. Varje viktigt mått ska ha ägare.

35. Metrikdefinitioner ska versioneras.

36. Nämnare ska vara explicit.

37. Population ska vara explicit.

38. Segment ska ha tydlig definition.

39. Känsliga segment ska kräva starkt skydd.

40. Små grupper ska döljas eller slås samman.

41. Datafreshness ska visas.

42. Datatäckning ska visas.

43. Saknad data ska synliggöras.

44. Saknad data ska inte automatiskt bli noll.

45. Analys ska bedöma selection bias.

46. Analys ska bedöma survivorship bias.

47. Analys ska bedöma measurement bias.

48. GainPilot ska motverka Goodhart-effekter.

49. Vanity metrics ska inte styra strategin.

50. Aktivering ska representera verkligt första värde.

51. Time to value ska följas utan att säkerhet tas bort.

52. Onboarding ska ha balanserade mått.

53. Programsystemet ska följas från förslag till långsiktigt utfall.

54. Passanalys ska inkludera anpassningar.

55. Följsamhetsanalys ska följa kärnplanens funktion.

56. Substitutioner ska följas genom acceptans och korrigering.

57. Progression ska följas multidimensionellt.

58. Kostfunktioner ska följas genom genomförbarhet och säkerhet.

59. Kommunikation ska mätas genom hjälpsamhet och användarkontroll.

60. Hermes ska följas genom minneskvalitet och integritet.

61. Arnold ska mätas på hjälpsamhet och säkerhet.

62. Atlas ska mätas på strategisk kvalitet och scope.

63. Specialistagenter ska ha uppgiftsspecifika mått.

64. Affärsmått ska hållas separata från coachlogik.

65. Intäktsökning får inte automatiskt övertrumfa användarnytta.

66. Churn ska klassificeras efter orsak.

67. Paus ska hållas separat från uppsägning.

68. Kostnad ska kunna mätas per capability.

69. AI-kostnad ska kunna mätas per agent och modell.

70. Kostnadsanomalier ska kunna upptäckas.

71. Enhetsekonomi ska ha tydliga antaganden.

72. Budget, prognos och utfall ska skiljas.

73. Prognoser ska ha intervall och scenarier.

74. GainPilot ska registrera strategiska mål.

75. Mål ska ha ägare och framgångskriterier.

76. Mål ska kunna använda flera mått.

77. OKR eller liknande ramverk får användas men inte ersätta visionen.

78. Målkonflikter ska synliggöras.

79. Atlas ska kunna prioritera med transparent modell.

80. Prioriteringspoäng ska inte ersätta beslut.

81. Reversibilitet ska påverka beslutströskel.

82. Option value ska kunna vägas in.

83. Kostnaden för att inte agera ska synliggöras.

84. Brådska ska vara verklighetsgrundad.

85. Signalsystem ska ha definierade trösklar.

86. Statiska trösklar ska granskas.

87. Dynamiska trösklar ska vara versionerade.

88. Anomalier ska analyseras innan åtgärd.

89. Säsongsvariation ska modelleras.

90. Signaler ska jämföras med relevant baslinje.

91. Trend ska kräva tillräcklig period.

92. Volatila mått ska stabiliseras försiktigt.

93. Signalfatigue ska motverkas.

94. Relaterade signaler ska kunna grupperas.

95. Dubblettsignaler ska förhindras.

96. Signaler ska ha lifecycle.

97. Falska positiva ska registreras.

98. Missade problem ska analyseras som falska negativa.

99. Kvalitativa signaler ska ingå.

100. Användarfeedback ska typas.

101. Feedbackens källa ska bevaras.

102. Full dialog ska ersättas med strukturerad signal där möjligt.

103. Supportsignaler ska kunna grupperas.

104. Domänexperter ska kunna skapa expertgranskade signaler.

105. Research ska skapa signaler, inte direkt policy.

106. Marknadssignaler ska bedömas mot strategin.

107. Konkurrentfunktion ska inte automatiskt kopieras.

108. Research ska ha frekvens och budget.

109. Källor ska kvalitetsbedömas.

110. Källkonflikter ska synliggöras.

111. Korrelation ska skiljas från kausalitet.

112. Alternativa förklaringar ska bedömas.

113. Konfounders ska analyseras.

114. Experiment ska användas selektivt.

115. Experiment ska registreras.

116. Manipulativa experiment ska förbjudas.

117. Sämre säkerhet ska inte vara experimentvariant.

118. Randomisering ska vara dokumenterad.

119. Experimentkonflikter ska upptäckas.

120. Experiment ska ha stoppregel.

121. Praktisk betydelse ska skiljas från statistisk betydelse.

122. Otillräcklig evidens ska kunna vara slutstatus.

123. Långsiktiga effekter ska följas.

124. Shadow mode ska användas före användarpåverkan.

125. Canary ska ha begränsat scope.

126. Före-efter-analys ska kontrollera externa förändringar.

127. Kohortanalys ska användas med integritetsskydd.

128. Funnels ska representera meningsfulla steg.

129. Funnels ska inte ensamma förklara beteende.

130. Längre användarresor ska kunna analyseras.

131. Användarutfall ska tolkas försiktigt.

132. GainPilot ska inte tillskriva sig hela resultatet.

133. Proxyer ska märkas.

134. Datakvalitet ska mätas.

135. Datakvalitetsproblem ska kunna skapa signal.

136. Schemaförändringar ska hanteras i analyskedjan.

137. Försenad data ska kunna uppdatera preliminära värden.

138. Dubblettdata ska tas bort.

139. Bortfall ska markeras.

140. Data lineage ska finnas.

141. Intelligence items ska ha provenance.

142. Modellgenererad analys ska märkas.

143. Analysresultat ska vara strukturerade.

144. Strategiska rekommendationer ska inte endast vara fri text.

145. Atlas ska kunna skapa executive briefs.

146. Dagliga briefs ska vara operativa och selektiva.

147. Veckobriefs ska sammanfatta produktens viktigaste dimensioner.

148. Månadsbriefs ska vara strategiska.

149. GainPilot ska ha en beslutsinkorg.

150. Information utan beslut ska inte fylla beslutsinkorgen.

151. Watchlist ska finnas för osäkra frågor.

152. Riskregister ska kopplas till Executive Intelligence.

153. Riskpoäng ska vara förklarbara.

154. Risker ska ha ägare.

155. Möjligheter ska kunna registreras.

156. Möjlighet ska bedömas mot alternativkostnad.

157. Beslutshistorik ska bevaras.

158. Beslut ska ha uppföljningsplan.

159. Att avvakta ska kunna vara dokumenterat beslut.

160. Tidsbegränsade beslut ska kunna löpa ut.

161. Atlas ska rekommendera men inte själv bevilja högriskmandat.

162. Rätt beslutsägare ska vara synlig.

163. Lågriskoperativ automation ska kräva explicit mandat.

164. Högriskåtgärder ska kräva starkare kontroll.

165. Intelligence items ska kunna kopplas till roadmap.

166. Signal ska inte direkt bli roadmaplöfte.

167. Roadmapförslag ska ha lifecycle.

168. Beroenden ska synliggöras.

169. Prioritering ska ta hänsyn till verklig kapacitet.

170. Work in progress ska begränsas.

171. Teknisk skuld ska representeras strukturerat.

172. Dokumentationsdrift ska kunna skapa signal.

173. Agentskuld ska kunna följas.

174. Analys- och dataskuld ska kunna följas.

175. Skuldens kostnad ska bedömas.

176. Tekniska alerts ska filtreras innan executive-nivå.

177. Incidenter ska kunna skapa executive signal.

178. Post-incident review ska skapa lärande.

179. Säkerhet får inte optimeras bort.

180. Integritet får inte optimeras bort.

181. Hermes ska skapa executive signalpaket.

182. Individdata ska vara undantag.

183. Privata coachdialoger ska inte vara standardinput.

184. Små känsliga grupper ska skyddas.

185. Privacy-preserving analytics kan utvärderas senare.

186. Analysdata ska ha retention.

187. Radering ska propageras till analysunderlag.

188. Analysmiljö ska vara isolerad.

189. Export från analysmiljö ska minimeras.

190. Externa analysverktyg ska riskbedömas.

191. Alla råevents ska inte exporteras externt.

192. Dashboards ska anpassas efter mottagare.

193. Dashboardåtkomst ska vara rollstyrd.

194. Datafreshness och täckning ska visas.

195. Falsk precision ska undvikas.

196. Beslutsrelevant information ska prioriteras visuellt.

197. Dashboards ska vara tillgängliga.

198. Executive briefs ska kunna lokaliseras.

199. Arnold ska kunna visa personlig analys.

200. Atlas verksamhetsanalys ska inte förväxlas med personlig coaching.

201. Användarens dashboard ska prioritera nästa relevanta steg.

202. Jämförelse med andra ska vara valbar.

203. Benchmarks ska förklaras.

204. Statistik ska inte automatiskt bli normativt råd.

205. Automatiska insights ska valideras.

206. Insight-fatigue ska motverkas.

207. Insights ska vara förklarbara.

208. Positiv ton får inte förvränga analys.

209. Analysflödet ska vara observerbart.

210. Betydelsefulla analysbeslut ska auditeras.

211. Analysincidenter ska kunna klassificeras.

212. Felaktiga mått ska konsekvensanalyseras.

213. Felaktiga briefs ska rättas spårbart.

214. Metrik och analyslogik ska kunna rullas tillbaka.

215. Analysdrift ska övervakas.

216. Modellgenererad analys ska driftövervakas.

217. Executive Intelligence ska ha full teststrategi.

218. Metrikdefinitioner ska testas.

219. Datakvalitet ska testas.

220. Signaler ska testas.

221. Kausalitetspåståenden ska testas.

222. Alternativa hypoteser ska testas.

223. Integritet ska testas.

224. Beslutsgränser ska testas.

225. Experiment ska testas.

226. Dashboards ska testas.

227. Nya analysversioner ska köras i shadow mode.

228. Versioner ska jämföras parallellt.

229. Canary ska börja i lågriskområden.

230. Strategiska rekommendationer ska först granskas manuellt.

231. Executive Intelligence ska mätas på beslutsvärde.

232. Antal rapporter ska inte vara framgångsmått.

233. Metrik och mål ska ha mänskliga ägare.

234. Atlas får inte självmodifiera strategiska mål.

235. Analysförbättringar ska behandlas som produktförändringar.

236. Förändringar ska ske genom branch, tester, review och kontrollerad utrullning.

23.253 IMPLEMENTERINGSORDNING

GainPilots analys-, signal- och Executive Intelligence-system ska implementeras stegvis.

Fas 1 — Analysbegrepp

Implementera canonical modeller för:

- event,

- observation,

- metric,

- signal,

- analysis,

- hypothesis,

- recommendation,

- decision,

- mandate,

- action,

- och effect.

Fas 2 — Eventregister

Implementera:

- event identity,

- schema,

- producer,

- tenant,

- user scope,

- timestamp,

- classification,

- och provenance.

Fas 3 — Metrikregister

Implementera:

- metric identity,

- definition,

- ägare,

- population,

- nämnare,

- enhet,

- datakälla,

- version,

- och begränsningar.

Fas 4 — Datakvalitet

Implementera:

- completeness,

- duplicate detection,

- schema validation,

- late data,

- coverage,

- freshness,

- och lineage.

Fas 5 — Grundläggande produktmått

Implementera först:

- onboarding completion,

- program proposal,

- program activation,

- first meaningful activity,

- workout save success,

- och user correction rate.

Fas 6 — Domänmått

Implementera:

- kärnplansföljsamhet,

- funktionsbevarande anpassning,

- substitutionskorrigering,

- progression,

- kostgenomförbarhet,

- och säkerhetsstopp.

Fas 7 — Tekniska mått

Implementera:

- availability,

- latency,

- errors,

- retries,

- unknown outcomes,

- duplicates,

- queue health,

- och integration health.

Fas 8 — Agentmått

Implementera separat för:

- Arnold,

- Atlas,

- planeringsagent,

- substitutionsagent,

- säkerhetsagent,

- och analysagent.

Fas 9 — Integritets- och Hermesmått

Implementera:

- denied access,

- over-retrieval,

- reduced signal usage,

- do-not-share blocks,

- external model transfers,

- corrections,

- och deletion completeness.

Fas 10 — Ekonomi

Implementera:

- AI cost,

- storage cost,

- integration cost,

- support cost,

- subscription revenue,

- refunds,

- och cost per capability.

Fas 11 — Signalsystem

Implementera:

- threshold,

- anomaly,

- trend,

- severity,

- confidence,

- deduplication,

- grouping,

- och lifecycle.

Fas 12 — Intelligence items

Implementera:

- source signals,

- analysis,

- hypotheses,

- alternatives,

- recommendation,

- owner,

- status,

- och review date.

Fas 13 — Hermes executive packages

Implementera:

- aggregate packages,

- reduced signals,

- privacy threshold,

- minimum segment size,

- prohibited uses,

- och provenance.

Fas 14 — Executive brief

Implementera:

- daily operational brief,

- weekly product brief,

- monthly strategic brief,

- watchlist,

- och decision inbox.

Fas 15 — Risk- och möjlighetsregister

Implementera:

- risk identity,

- probability,

- impact,

- owner,

- mitigation,

- trigger,

- opportunity,

- och alternative cost.

Fas 16 — Strategiska mål

Implementera:

- objectives,

- success criteria,

- metric relations,

- dependencies,

- conflicts,

- och status.

Fas 17 — Beslutsregister

Implementera:

- decision owner,

- evidence,

- alternatives,

- mandate,

- validity,

- expected effect,

- och review.

Fas 18 — Effektuppföljning

Implementera:

- baseline,

- expected effect,

- actual effect,

- guardrails,

- unintended outcomes,

- och learning.

Fas 19 — Experimentregister

Implementera:

- hypothesis,

- population,

- control,

- variants,

- primary metric,

- guardrails,

- assignment,

- stop rule,

- och conclusion.

Fas 20 — Shadow mode

Implementera:

- alternative signal models,

- alternative Atlas analyses,

- comparison,

- false positives,

- databruk,

- och cost.

Fas 21 — Canary

Implementera:

- internal tenant,

- limited report,

- low-risk metrics,

- manual review,

- stopping rule,

- och rollback.

Fas 22 — Dashboards

Implementera separata vyer för:

- founder,

- product,

- operations,

- technical,

- security,

- privacy,

- finance,

- och domain expert.

Fas 23 — Personlig GainPilot-analys

Implementera:

- användarens mål,

- kärnplan,

- genomförbarhet,

- progression,

- relevanta hinder,

- och förklarbara insights.

Fas 24 — Research och marknadssignaler

Implementera:

- source registry,

- scheduled research,

- source quality,

- competitor signal,

- hypothesis,

- och decision relevance.

Fas 25 — Incident- och korrigeringsflöde

Implementera:

- wrong metric,

- data corruption,

- affected reports,

- affected decisions,

- correction,

- och consequence analysis.

Fas 26 — Full testsvit

Implementera:

- metric tests,

- quality tests,

- lineage tests,

- tenant tests,

- privacy tests,

- causal-language tests,

- experiment tests,

- och dashboard tests.

Fas 27 — Full Executive Intelligence-governance

Implementera:

- metric owners,

- objective owners,

- decision owners,

- data access review,

- model review,

- periodic metric audit,

- experiment ethics review,

- och forbidden self-modification.

Varje fas ska levereras genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- schema- och datatester,

- metriktester,

- domäntester,

- integritetstester,

- säkerhetstester,

- agenttester,

- kausalitets- och förklaringstester,

- shadow mode,

- pull request,

- kvalificerad review,

- canary,

- kontrollerad merge,

- och effektuppföljning.

23.254 FRAMGÅNGSKRITERIER

Kapitel 23:s vision är framgångsrikt realiserad när:

- händelser, signaler, analyser och beslut hålls åtskilda,

- varje viktigt mätvärde har definition och ägare,

- population och nämnare är synliga,

- metrikförändringar versioneras,

- saknad data inte behandlas som noll,

- datatäckning och freshness visas,

- GainPilot inte styrs av vanity metrics,

- appöppningar inte likställs med användarnytta,

- North Star kompletteras med skyddsmått,

- säkerhet och integritet har egna dimensioner,

- tränings- och kostmått följer sina domänmodeller,

- kortversioner och reservplaner räknas korrekt,

- Arnold mäts på hjälpsamhet och säkerhet,

- Atlas mäts på rekommendationskvalitet och scope,

- AI-kostnad kan kopplas till capability,

- strategiska mål har mätbara men balanserade kriterier,

- målkonflikter synliggörs,

- signaler har definierade trösklar,

- anomalier inte automatiskt klassificeras som fel,

- säsongsvariation hanteras,

- signalfatigue begränsas,

- dubblettsignaler grupperas,

- falska positiva och negativa följs,

- kvalitativ feedback inkluderas,

- fulla coachdialoger inte används som standardanalytik,

- research skapar signaler och inte direkt policy,

- källkvalitet och konflikt visas,

- Atlas skiljer korrelation från kausalitet,

- alternativa hypoteser presenteras,

- experiment har hypotes och stoppregel,

- experiment inte manipulerar användaren,

- säkerhet inte A/B-testas mot sämre variant,

- skyddsmått kan stoppa experiment,

- praktisk betydelse visas utöver statistisk förändring,

- otillräcklig evidens kan redovisas,

- långsiktiga effekter följs,

- datakvalitet kan skapa signal,

- lineage finns från dashboard till källa,

- modellgenererad analys märks,

- rekommendationer är strukturerade,

- executive briefs fokuserar på beslut,

- beslutsinkorgen inte fylls av trivial information,

- risker och möjligheter har ägare,

- beslut har uppföljningsdatum,

- beslut att avvakta kan dokumenteras,

- Atlas rekommenderar utan att själv bevilja högriskmandat,

- roadmapförslag inte automatiskt blir löften,

- prioritering tar hänsyn till verklig kapacitet,

- teknisk, dokumentations-, agent- och analysdata-skuld kan följas,

- incidenter skapar lärande,

- säkerhet inte optimeras bort för tillväxt,

- integritet inte optimeras bort för analys,

- Hermes levererar reducerade executive signalpaket,

- små segment skyddas,

- analysdata har retention,

- användarradering propageras,

- externa analysverktyg får minimerad data,

- dashboardåtkomst är rollstyrd,

- dashboarden visar datastatus,

- användarens personliga analys fokuserar på egna mål,

- jämförelse med andra är valbar,

- automatiska insights är begripliga och relevanta,

- analysflödet är observerbart,

- felaktiga mått konsekvensanalyseras,

- felaktiga briefs rättas,

- analyslogik kan rullas tillbaka,

- nya signal- och analysmodeller körs i shadow mode,

- canary börjar med lågriskrapporter,

- strategiska rekommendationer granskas manuellt i början,

- Executive Intelligence mäts på bättre beslut och inte fler rapporter,

- mål och metrik har mänskliga ägare,

- Atlas inte kan självmodifiera strategiska mål eller datasc ope,

- och alla förändringar sker genom separat branch, tester, integritetsgranskning, review och kontrollerad utrullning.

23.255 SAMMANFATTNING

GainPilot ska kunna förstå både individens produktupplevelse och verksamhetens övergripande utveckling.

Det kräver en tydlig kedja från data till beslut.

En träningssession som genomförs är en händelse.

En ökad andel kortversioner är ett mätvärde.

En återkommande ökning kan bli en signal.

Signalen kan betyda:

- att användarna har mindre tid,

- att standardpassen är för långa,

- att en ny målgrupp använder produkten,

- eller att kortversionerna fungerar bättre än väntat.

Atlas ska inte automatiskt välja en förklaring.

Executive Intelligence ska i stället:

- kontrollera data,

- beskriva förändringen,

- identifiera alternativa hypoteser,

- visa osäkerhet,

- och rekommendera nästa analys eller beslut.

En signal är inte ett beslut.

En rekommendation är inte ett mandat.

Ett mandat är inte samma sak som en genomförd åtgärd.

Och en åtgärd är inte färdig innan effekten har följts upp.

GainPilot ska därför använda följande canonical kedja:

Händelse

→ observation

→ mätvärde

→ signal

→ analys

→ hypotes

→ rekommendation

→ beslut

→ mandat

→ åtgärd

→ effektuppföljning

→ lärande.

Executive Intelligence ska ge en sammanhängande bild av GainPilot genom flera dimensioner:

- användarnytta,

- säkerhet,

- integritet,

- produktkvalitet,

- domänkorrekthet,

- teknisk tillförlitlighet,

- agentkvalitet,

- verksamhet,

- ekonomi,

- och strategisk riktning.

Ingen dimension får ensam definiera produktens framgång.

Högre retention är inte automatiskt bra om den skapas genom:

- notispress,

- svår uppsägning,

- eller emotionellt beroende.

Högre träningsföljsamhet är inte automatiskt bra om den skapas genom:

- olämplig progression,

- ignorering av smärta,

- eller skuld.

Lägre AI-kostnad är inte automatiskt bra om resultatet blir:

- sämre säkerhet,

- sämre domänkorrekthet,

- eller fler felaktiga program.

Varje optimeringsmått ska därför ha skyddsmått.

GainPilot ska inte styras av ytliga mått som:

- antal nedladdningar,

- antal AI-svar,

- antal genererade program,

- eller totala appöppningar.

Systemet ska försöka mäta meningsfullt värde.

Exempel:

- användaren förstår sin plan,

- användaren kan genomföra eller anpassa kärnplanen,

- programmet är säkert,

- användaren känner kontroll,

- och GainPilot hjälper personen bli mer självständig.

Dessa mål är svårare att mäta.

Det gör dem inte mindre viktiga.

Varje metrik ska ha:

- en stabil identitet,

- tydlig definition,

- ägare,

- population,

- nämnare,

- tidsperiod,

- datakälla,

- beräkningsmetod,

- version,

- och kända begränsningar.

Om definitionen ändras ska historiken inte blandas.

Aktiv användare kan inte ena månaden betyda:

öppnade appen,

och nästa månad betyda:

genomförde en GainPilot-aktivitet,

utan att förändringen markeras.

Saknad data ska vara synlig.

Ett ologgat pass är inte automatiskt ett missat pass.

En tom kostlogg betyder inte att användaren inte åt.

En wearable utan data betyder inte att återhämtningen var dålig.

Executive Intelligence ska uttrycka:

- datatäckning,

- saknade värden,

- confidence,

- och representativitet.

Atlas ska kunna använda både kvantitativa och kvalitativa signaler.

Kvantitativa signaler kan komma från:

- produktflöden,

- träningspass,

- agentkorrigeringar,

- kostnad,

- teknik,

- och abonnemang.

Kvalitativa signaler kan komma från:

- användarfeedback,

- support,

- domänexperter,

- incidentreview,

- och research.

Fullständiga privata dialoger ska inte vara standardinput.

Arnold ska i första hand skapa minimerade strukturerade signaler.

Exempel:

Användaren upplevde substitutionsförklaringen som otydlig.

Atlas behöver normalt inte få den fulla dialogen.

Hermes ska kontrollera all datadelning till Executive Intelligence.

Atlas ska i första hand få:

- aggregat,

- reducerade signaler,

- tillräckligt stora segment,

- datakvalitetsinformation,

- och provenance.

Atlas ska inte automatiskt få:

- individens kroppsmått,

- träningshistorik,

- kostlogg,

- smärtanteckningar,

- eller privata samtal.

När individdata verkligen krävs ska:

- syftet vara tydligt,

- datan minimeras,

- behörigheten verifieras,

- och användningen auditeras.

GainPilot ska vara försiktigt med experiment.

Experiment kan hjälpa produkten förstå:

- vilket onboardingflöde som är tydligast,

- vilket sammanfattningsformat som fungerar,

- eller hur en låg risk-funktion bäst presenteras.

Experiment får inte användas för att testa:

- skuld,

- skam,

- rädsla,

- artificiell brådska,

- försämrad säkerhet,

- eller svårare uppsägning.

Varje experiment ska ha:

- hypotes,

- målgrupp,

- kontroll,

- variant,

- primärt mått,

- skyddsmått,

- tidsperiod,

- stoppregel,

- och ansvarig.

Om säkerhets- eller integritetsmått försämras ska experimentet stoppas.

Statistisk förändring är inte tillräcklig.

GainPilot ska även fråga:

- Är skillnaden praktiskt viktig?

- Förbättrar den användarnyttan?

- Vilka risker skapas?

- Vad kostar förändringen?

- Och håller effekten över tid?

Atlas ska kunna skapa executive briefs.

En bra brief ska svara på:

- Vad har förändrats?

- Varför är det viktigt?

- Hur säker är analysen?

- Vilka mål påverkas?

- Vilka alternativa förklaringar finns?

- Vad rekommenderas?

- Vilka andra val finns?

- Vad kostar alternativen?

- Vilken risk finns?

- Och vilket beslut krävs?

Briefen ska inte vara en metrikdump.

GainPilot ska ha:

- operativ daglig brief,

- produktorienterad veckobrief,

- strategisk månadsbrief,

- watchlist,

- riskregister,

- möjlighetsregister,

- och beslutsinkorg.

Endast frågor som faktiskt kräver beslut ska placeras i beslutsinkorgen.

Atlas får rekommendera.

Atlas får inte själv:

- byta strategiska mål,

- ändra GainPilots North Star,

- bredda användardataåtkomst,

- höja agentautonomi,

- ändra pris,

- eller genomföra högriskproduktförändring

utan rätt mandat.

Beslutet ska ha en tydlig ägare.

Beslut ska följas upp.

Om GainPilot väljer att:

- förenkla onboarding,

- byta modell,

- ändra programgeneratorn,

- eller justera abonnemanget

ska systemet i förväg definiera:

- förväntad effekt,

- primära mått,

- skyddsmått,

- reviewdatum,

- och rollbackvillkor.

När resultatet är känt ska GainPilot registrera:

- vad som fungerade,

- vad som inte fungerade,

- vilka antaganden som var fel,

- och vad som ska förändras framåt.

Felaktig analys ska behandlas som ett verkligt problem.

Om ett mått hade:

- fel nämnare,

- fel population,

- dubbla events,

- eller korrupt data

ska GainPilot identifiera vilka:

- dashboards,

- briefs,

- rekommendationer,

- experiment,

- och beslut

som påverkades.

Det räcker inte att tyst rätta grafen.

Nya metrik-, signal- och analysmodeller ska först köras i shadow mode.

De ska jämföras med den aktiva versionen utifrån:

- datakorrekthet,

- falska positiva,

- falska negativa,

- kausalitetsspråk,

- integritet,

- kostnad,

- och faktisk beslutsnytta.

Därefter kan de lanseras genom begränsad canary.

Executive Intelligence ska inte bedömas efter hur många rapporter Atlas skapar.

Systemet är framgångsrikt när det hjälper GainPilot:

- upptäcka verkliga problem tidigare,

- undvika falska slutsatser,

- prioritera bättre,

- fatta begripliga beslut,

- skydda användaren,

- och lära av verkliga resultat.

Alla förändringar av:

- events,

- metrics,

- signaler,

- dashboards,

- experiment,

- Atlas-analyser,

- recommendations,

- och automatiska beslut

ska ske genom:

- definierat scope,

- separat branch eller worktree,

- implementation,

- data- och metriktester,

- domäntester,

- säkerhetstester,

- integritetstester,

- agent- och förklaringstester,

- shadow mode,

- pull request,

- kvalificerad review,

- canary,

- kontrollerad merge,

- och effektuppföljning.

Kapitel 23 etablerar därmed följande kärnprincip:

GainPilot ska inte bli datadrivet i betydelsen att varje siffra automatiskt styr produkten. GainPilot ska bli evidensinformerat — genom att skilja observation från orsak, signal från beslut och rekommendation från mandat. Executive Intelligence ska hjälpa Atlas och GainPilots ägare se helheten, förstå osäkerheten och fatta bättre beslut utan att användarnas privatliv, säkerhet eller långsiktiga nytta reduceras till ett dashboardvärde.
