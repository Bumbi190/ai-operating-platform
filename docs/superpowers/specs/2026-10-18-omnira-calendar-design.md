# Omnira Kalender — designförslag

Datum: 2026-10-18
Status: **Förslag för ägargranskning. Ingen produktkod, migration eller driftsändring ingår i denna leverans.**
Kontrollerad bas: `34d21cde97aa1c25a6d34a613657d8aee91f8591`.

## 1. Beställningen och avsedd användning

André vill ha en egen sida i huvudmenyn med en veckokalender som visar vad som ska göras och när. Den ska samla privata möten, egna planerade uppgifter och projektens verkliga scheman. Atlas ska fylla i och ändra kalendern på Andrés begäran, både genom text och under röstsamtal.

Framgång betyder att en ändring som sparas genom Atlas syns på samma kalender som en manuell ändring, finns kvar efter omladdning och visar korrekt svensk tid. Projektpubliceringar ska visa den faktiska köns tid och status. Privata möten ska endast vara tillgängliga för rätt användare.

Antaganden för första versionen: kalendern sparas i Omnira, veckan börjar på måndag och visningstiden är Europe/Stockholm. Ingen koppling till Google Calendar, Apple Kalender eller Outlook behövs för denna version.

## 2. Kontrollerad nulägesbild

- `app/(platform)/planning/page.tsx`, `lib/os/planning.ts` och `components/platform/vnext/PlanningView.tsx`: Planering sammanställer manager_tasks, cron-workflows och workflow_instances. Den är avsiktligt skrivskyddad.
- Manageruppgifterna har inga verkliga tids- eller deadlinefält i denna modell. Skapandedatum får därför inte användas som planerad arbetstid.
- `planning_items` och `sprints` har ingen fungerande producent/konsument för denna upplevelse och ska inte användas som reservkalender.
- `social_content_revisions` har önskade publiceringstider; `social_schedule_jobs` har exakta godkända tider och publiceringsstatus. Dessa måste fortsätta vara källor för publicering.
- `lib/nav/registry.ts`, `lib/nav/vnext-nav.ts` och `lib/atlas/workspace-registry.ts` styr navigation och Atlas sidkontext.
- `lib/atlas/voice-pilot/use-voice-session.ts` skickar text och rösttranskript genom samma samtalskontroller. Kalenderverktygen ska kopplas till den gemensamma verktygsvägen. Att endast registrera ett verktyg är inte ett genomfört rösttest.

Detta är en ny kalenderfunktion, inte en kosmetisk ombyggnad av Planering.

## 3. Val av lösning

| Alternativ | Fördel | Kostnad eller begränsning |
| --- | --- | --- |
| **Rekommenderat: egen kalender i Omnira, med läsning från befintliga projektkällor** | Fungerar utan ny kontokoppling. Atlas och sidan delar sparade poster. Kön behåller sin auktoritet. | Ny privat lagring, API, veckovy och verktyg behövs. |
| Extern kalender som primär lagring | Kan passa den som redan planerar allt i en extern kalender. | Kräver anslutning och löser inte projektköernas status eller godkännanden. |
| Egen kalender och extern tvåvägssynk direkt | Ger båda upplevelserna. | Konflikter och synkregler gör första leveransen större. |

Första alternativet väljs som förslag. Extern synk kan byggas senare med samma kalendergränssnitt.

## 4. Sidan användaren möter

- Ny menypost **Kalender**, destination `/calendar`, på dator och i mobilmenyn. Befintlig Planering behålls.
- Kalendern fyller innehållsytan. Dator: sju dagar måndag–söndag, klockslag längs vänsterkanten, markering av dagens datum och aktuell tid.
- Litet verktygsfält: föregående/nästa vecka, Idag, veckans datum, Ny händelse samt filter Alla/Privat/projekt.
- Färger skiljer privata poster och respektive projekt; titel och typ finns också som text så att färg inte är enda signalen.
- Klick på en ledig tid skapar ett utkast. Klick på en post öppnar en sidopanel med titel, datum, tid, eventuell sluttid, plats/anteckning och tillåtna ändringar.
- Dator och mobil ska kunna skapa, ändra och avboka. Mobil använder en dag i taget inom samma vecka och tydliga dagknappar, utan att krympa sju kolumner till oläslig bredd.
- Heldagsposter ligger ovanför tidsrutnätet. Överlappande möten visas sida vid sida och markeras som krockar.
- Uppgifter utan bestämd tid läggs inte på ett påhittat klockslag. En kompakt lista kan låta användaren boka tid för dem.
- Sidan innehåller kalendern och dess reglage. Atlas nås genom befintlig chatt/röstyta.

## 5. Sparade poster och källornas ansvar

En ny tabell, `user_calendar_events`, sparar manuella poster. Datakontraktet innehåller id, owner_user_id, titel, valfri beskrivning/plats, typ privat eller egen arbetsbokning, valfri behörighetskontrollerad projekt-/uppgiftsreferens, tidsuppgifter, version, status scheduled/cancelled och skapad/ändrad-tid. Endast användaren äger dessa poster även när en arbetsbokning pekar på ett projekt. En separat användarägd tabell, `user_calendar_mutations`, håller idempotensnyckel, operation, postreferens och sparat resultat för säkra återförsök; den får inte bli en gemensam aktivitetslogg.

Tidsbestämda poster sparar UTC-start, eventuell UTC-sluttid och ursprunglig tidszon. Heldagsposter använder lokala kalenderdatum och exklusivt slutdatum så att de inte flyttar dag vid tidszonskonvertering. För kalenderlistning hämtas bara valt tidsintervall, högst 31 dagar per anrop. API och Atlas använder samma validerade läs- och mutationskontrakt. Titel eller känsliga anteckningar ska inte kopieras till projektminne eller gemensamma agentloggar.

| Källa | Vad kalendern visar | Hur en ändring sker |
| --- | --- | --- |
| Privat möte eller egen arbetsbokning | Den sparade kalenderposten | Direkt genom kalenderns gemensamma API. |
| Socialt utkast med önskad tid | Förslag, med tydlig granskningsstatus | Uppdatering av den verkliga innehållsrevisionen. |
| Godkänt publiceringsjobb | Köns faktiska tid, konto och status | Befintligt ändrings- och granskningsflöde för publicering. |
| Månatlig släppregel utan färdigt innehåll | Planerad plats, innehåll saknas | Regeln skapar inte ett godkänt publiceringsjobb. |
| Workflow-instans med wake_at | Verklig väckning/fortsättning, korrekt benämnd | Endast genom arbetsflödets egna stödda operationer. |
| Uppgift utan arbetstid | Saknar bestämd tid | En användarbeställd arbetsbokning kan referera uppgiften. |

Varje projicerad post har en stabil källreferens. Samma sociala inlägg dedupliceras mellan utkast och kö. Ett nytt ändringsförslag får inte dölja att en tidigare godkänd tid ännu gäller. Flytt av ett godkänt inlägg ska visa tidigare godkänd tid och den föreslagna ändringen tills rätt omgång har granskats igen. Kalendern får inte bli en parallell publiceringskö.

En arbetsbokning startar inte automatiskt agentjobb. Exekvering kräver projektets befintliga arbetsflöde och behörighet.

## 6. Atlas i text och samtal

Samma serverfunktioner används av sidan och de föreslagna verktygen `get_calendar`, `create_calendar_event`, `update_calendar_event` och `cancel_calendar_event`. Verktygsnamnen är förslag, inte redan tillgängliga funktioner.

Exempel som ska fungera:

- ”Lägg in möte med Oscar på torsdag klockan 14 till 15.”
- ”Vad har jag nästa vecka?”
- ”Flytta mötet med Oscar till fredag klockan 10.”
- ”Boka en timme för Familje-Stundens novemberinlägg på tisdag.”
- ”Flytta Familje-Stundens fredagsinlägg till 17.” Atlas hittar rätt källpost och förbereder rätt ändringsflöde.

Atlas får spara en vanlig kalenderändring när användaren tydligt har bett om den. Den behöver inte gå genom en publiceringsgrind. Vid flera likadana möten, oklar dag eller oklar flytt ska Atlas ställa en konkret följdfråga innan skrivning.

Relativa datum tolkas med serverns aktuella datum och Europe/Stockholm. En tvetydig eller obefintlig tid vid sommartidsbyte får inte gissas. En tid utan angiven längd kan sparas utan verklig sluttid och visas som en punkt; visuell höjd i kalendern får inte bli en påhittad möteslängd.

Atlas säger att ändringen är klar först när servern har kvitterat den. Kvittot innehåller identifierad händelse och exakt nytt datum/klockslag samt länk till rätt kalendervecka. Kalendern uppdateras efter ett lyckat verktygsanrop även när ändringen gjordes under ett pågående röstsamtal.

För social publicering gäller fortsatt redaktionell granskning, exakt schemagodkännande och eventuellt släppvillkor. Kalenderverktygen får inte godkänna eller publicera genom en genväg. En källtyp som saknar ett stödd ändringsoperation ska visa sin detaljsida och säga vad som återstår; Atlas får inte låtsas att en lokal kalenderändring har ändrat arbetsflödet.

## 7. Åtkomst, samtidighet och fel

- Inloggad användares servervaliderade identitet bestämmer åtkomst. Klienten eller modellen får inte välja en annan ägare.
- Privata poster är användarägda med RLS och kontrolleras även i serverfunktionerna. Projektåtkomst ger inte tillgång till en kollegas privata kalender.
- Atlas privata kalenderåtkomst gäller ägarens privata samtalskontext. Projektagenter får inte generell åtkomst genom att verktygen finns i den interaktiva chatten.
- Läsning av projektkällor återanvänder befintlig projektisolering. Inga obehöriga titlar, tider eller anteckningar får läcka via filter, fel, kvitton eller röst.
- Ändring/avbokning kräver väntad version. En samtidig ändring ska läsas och lösas, inte skrivas över.
- Skapande och verktygsåterförsök använder stabila idempotensnycklar för att undvika dubbletter.
- Avbokning är återställbar. Generell permanent radering ingår inte i första versionen.
- Serverfel visas som att data inte kunde läsas eller sparas. De får inte visas som en tom kalender eller en lyckad ändring.
- Schemaprojektionerna visar faktisk status och förändras när källan ändras. Om en källa inte kan läsas visas det tydligt.

## 8. Första leverans och verifiering

Första leveransen omfattar egen veckosida, meny och sidkontext, bestående privata möten och arbetsbokningar, stöd för heldag, manuella ändringar/avbokning, gemensamma text-/röstverktyg och projektion av stödda verkliga projektkällor. Sociala ändringar kopplas till befintlig granskning.

Komplexa privata återkommande serier, kalenderinbjudningar till andra, push-/e-postpåminnelser och extern kalendersynk ingår inte i denna första version. Befintliga postnings-/släppregler visas fortfarande genom sina verkliga källor.

Verifieringen måste täcka:

1. Två användare kan inte läsa eller ändra varandras privata händelser, även via Atlas eller projektfilter.
2. En sparad manuell post finns kvar efter omladdning och kontobyte visar rätt kalender.
3. Samma skapa-/ändra-/avboka-operation ger samma sparade resultat via sidan, text och röstvägen.
4. Faktiskt röstsamtal används för ett nytt möte och en flytt innan röststödet markeras som verifierat.
5. Svensk tid, veckogränser, heldag och sommartidsfall fungerar utan datumförskjutning.
6. Upprepade anrop skapar inte dubbletter; samtidiga ändringar ger konflikt.
7. Sociala poster visar köns korrekta tid och status; ett kalenderanrop kan inte kringgå publiceringsgodkännanden.
8. Mobilvyn och tangentbordsnavigering fungerar. Nätverksfel lämnar osparad inmatning kvar.
9. Befintliga sex godkända Familje-Stunden-publiceringar ändras inte av införandet.
10. Projektets nödvändiga typ-, isolerings-, migrations- och säkerhetskontroller körs för den faktiska kodändringen.

## 9. Granskningsläge och nästa steg

Det här dokumentet är ett konkret förslag baserat på beställningen och läst kod. Det är inte ett besked om att kalendern är byggd eller att Atlas redan har dessa verktyg.

Efter ägargranskning tas en exakt implementationsplan fram med datakontrakt, migration, filgränser, testfall och driftsättning. Produktkod och driftsändringar börjar först efter de återstående Superpowers-granskningarna. Testerna ovan är krav för senare implementation; de har inte körts för detta dokument.
