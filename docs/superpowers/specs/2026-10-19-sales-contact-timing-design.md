# Handlarbörsen – kontaktlogg och datumkontroll före säljförberedelse

Datum: 2026-10-19
Status: Design godkänd av André 2026-10-19 kl. 08:27:20 Europe/Stockholm. Genomförandeplanen granskas separat; inget utskick eller schema är godkänt.
Bas: `2121206e0dd041d3fb894315d8a7797dc7e72f09`
Gren: `codex/atlas-harvey-sales-20261017`
Projekt: Handlarbörsen, `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`.
Detta dokument är nästa avgränsade del av säljflödet. Det skapar inga utskick eller scheman.

## 1. Avsikt och godkännandets omfattning

Andre vill att Atlas förbereder kommande kundkontakter, med rätt avstånd mellan mejlen och mänsklig granskning före varje utskick. Han har uttryckligen förbjudit nya utskick och schemaläggning nu. Avsändaren vid en framtida kundsändning ska vara Andre <info@handlarborsen.se>, signerad Andre / Handlarbörsen.

Förslaget som presenterades i chatten är minst 14 hela dygn från senaste faktiskt utgående säljmejl före en obesvarad uppföljning, högst en påminnelse per aktuell inbjudan inklusive tidigare skickade, därefter paus. Det ska kunna granskas och korrigeras innan det används. Dagarna är en försiktig verksamhetsregel, inte ett bevis på lämplighet eller tillstånd att kontakta någon.

Denna leverans ska ge en beständig, källmärkt kontaktlogg och en serverberäknad datumkontroll i befintlig Säljförberedelse. Den får blockera eller förklara förberedelse. Den ger aldrig sändningsrätt. Kundtransport, automatisk utskickssekvens och kalenderkoppling aktiveras inte.

## 2. Verifierat nuläge

- Alla 139 kontaktposter är spärrade. 32 har registrerad tidigare kontakt, 107 har okänd historik. Samtliga 82 nyimporterade är obekräftade; två är dessutom exkluderade.
- `SalesContact` har historikstatus och fritextunderlag, men inget strukturerat datum för senaste skickade mejl. Fritext får inte maskintolkas till tillåtelse.
- Strato INBOX har ett versions- och generationsbundet läsflöde. Skickat har ingen löpande synk. Befintlig avstämning gäller 7–18 oktober, inte obegränsad historik eller senare manuella mejl.
- Resend-status finns som daterade underlag, inte som en aktiv Atlasintegration. Ett separat anslutet verktyg i ChatGPT är inte samma behörighet som Atlas har.
- `sales_prepare_job` accepterar endast bekräftade, ospärrade, ej exkluderade kontakter med uttryckligen ingen tidigare kontakt. Befintliga dubblerings- och pilotnivåkontroller ska behållas.
- `sales_send_confirm` och `sales_send_begin_dispatch` hör till den separata, exakt versionsbundna privata testsvarsvägen. Det finns ingen aktiverad kundkampanjväg att lägga en väntetid ovanpå.
- Utkastgranskning och testsändning är separata beslut. Nya utkastversioner behöver ny granskning.
- Baslinje vid granskningen: första säljjobb 0, svarsjobb 1, sändningsjobb 1, sändningshändelser 4. Inga nya jobb behövs för designarbetet.

Kodområden: `apps/web/lib/sales/{types,api,store,view-model,atlas-tools}.ts`, `apps/web/lib/sales/inbox/types.ts`, `apps/web/components/platform/vnext/sales/SalesWorkspace.tsx`, pilot- och sändningsmigrationerna i `apps/web/supabase/migrations/`, samt `workers/sales/sending/worker.py`.

## 3. Alternativ och vald riktning

| Alternativ | Konsekvens |
| --- | --- |
| Rekommenderat: gemensamma, granskade historikversioner och serverberäknad kontroll | Hanterar Strato och Resend tillsammans, synliggör luckor och kan byggas utan nya postfacksbehörigheter. |
| Enbart ett redigerbart ”senast kontaktad”-datum | Enkelt, men tappar påminnelser, osäkra sändningar, källor och delad mottagaradress. Räcker inte. |
| Full kontinuerlig import av Strato Skickat och Resend direkt | Kan bli nästa del men kräver egna åtkomstbeslut, avgränsning och återhämtningsflöden. Ingår inte i denna leverans. |

Vi bygger den gemensamma loggen först. Frånvaro av automatisk import får ge ”behöver stämmas av”, aldrig grönt ljus.

## 4. Beständig historik utan automatisk sammanslagning av filialer

En ny projektskopad tabell, `sales_contact_history_revisions`, innehåller oföränderliga, numrerade historikversioner per normaliserad mottagaradress. Varje ny revision anger föregående revisions-ID; optimistisk versionskontroll stoppar parallella överskrivningar. Ursprungliga rader och källor behålls.

Varje revision innehåller:
- Projekt, ägare, mottagaradress, schemasversion, registreringstid och granskare.
- Explicit kopplade kontakt-ID:n och kontaktversioner; e-postbyte eller relevant kontaktändring gör tidigare koppling inaktuell.
- Historikstatus: okänd, ägarbekräftat ingen tidigare kontakt eller registrerad tidigare kontakt. Källfönster utan träffar bevisar aldrig ingen tidigare kontakt.
- Källor för Strato Skickat, relevant inkommande historik och Resend: identitet, faktisk tidsavgränsning, granskad tidpunkt, stabil källreferens och känd lucka/felstatus. Inget lösenord, token eller mejltext behöver lagras här.
- Händelser: stabilt händelse-ID, källa/käll-ID, faktisk tidpunkt, riktning, utfall, explicit klassning och inbjudans-ID när det är verifierat.
- Klassning: första inbjudan, påminnelse, svar i pågående dialog eller oklassificerat. Okänd klassning får inte antas vara ett vanligt svar för att kringgå påminnelsegränsen.
- Eventuella rättelser med hänvisning till tidigare källuppgift. En ändrad tolkning lämnar spår och skapar ny version.

Identiska provider-ID:n dedupliceras inom rätt källa/identitet. Liknande ämne, tid, domän eller text är aldrig tillräckligt för att minska antalet påminnelser. Möjlig dubbelobservation över Strato och Resend kräver explicit källkoppling; oklarhet blockerar i stället för att ge ett lägre antal.

Filialrader bevaras. Datumkontrollen grupperar däremot samma exakta normaliserade mottagaradress över samtliga filialrader i projektet. Ägarbekräftade alternativa adresser kan visas för samordningsgranskning; ingen sådan relation härleds automatiskt ur domän eller personnamn.

## 5. Inmatning och källornas räckvidd

Första versionen använder en ägargranskad historikimport via Omniras inloggade gränssnitt. Den tar emot begränsad strukturerad metadata och stabila referenser, inte credentials, fria URL-hämtningar eller hela postfacket. Atlas får hjälpa till att formulera ett underlag, men saknar verktyg för att godkänna historik, ändra regler, ta bort spärrar eller starta import.

Befintliga anteckningar är underlag till granskningen. De migreras inte tyst till ”senaste faktiska utskick”. Ett historiskt datum får först märkas som senaste observerade händelse; för att datumkontrollen ska kunna vara komplett krävs också redovisad täckning efter händelsen och avstämning av eventuella andra manuella kanaler.

Strato- och Resend-täckning måste avse samma mottagare, relevant inbjudan och hela det angivna avstämningsfönstret. Saknade mappar, arkiverad/annan historik eller oklar påminnelseklassning anges som luckor. En ägaruppgift om äldre kontakt visas som just ägarintygad, inte som providerverifierad.

En nyligen sparad revision gör inte en gammal källa färsk. Faktiskt kontrollerad sluttid för varje nödvändig källa ska ligga högst 15 minuter före kontrolltiden för statusen ”underlag aktuellt för granskning”. Detta är en vald försiktig gräns för förberedelse, inte en garanti mot ett nytt manuellt mejl efter avstämningen. Utgången källa ger stopp och visar när avstämningen senast gällde.

Inga nya löpande läsbehörigheter aktiveras. En senare automatisk adapter ska använda samma kontrakt, kunna rapportera luckor och granskas separat.

## 6. Serverberäknad datumkontroll

Regler lagras separat som oföränderliga rader i `sales_contact_timing_rules`: projekt, ägare, versionsnummer, föregående versions-ID, granskat av, skapad tid, minsta väntetid i sekunder, högsta antal påminnelser och källornas högsta ålder. Förslagsvärdena är 1 209 600 sekunder, en påminnelse och 900 sekunders källålder. En explicit ägaråtgärd i gränssnittet skapar nästa regelversion med idempotensnyckel och väntad tidigare version; Atlas kan inte göra det. Servern använder senaste ägarbekräftade regelversionen för förberedelse. Saknad regelversion blockerar kontrollen. Migrationen skapar ingen sådan rad och designgodkännande innebär inte aktivering av sändning.

Beräkningen använder serverns tid och oföränderliga historik- och regelversioner. Klientens klocka och modellens påståenden används inte som bevis. Det finns en gemensam serverfunktion som returnerar:
- Kontakt- och mottagaridentitet, underlags- och regelversion.
- Senaste observerade utgående händelse med källor och faktiskt avstämningsfönster.
- Antal verifierade påminnelser för aktuell inbjudan, separat från antalet skickade/delivererade mejl.
- `intervalFloorAt` som lägsta tidsgräns utifrån verifierat underlag, eller null när den inte kan bestämmas.
- Samtliga blockeringsorsaker och `customerSendingEnabled:false`. En passerad tidsgräns är aldrig ett skickklart besked.

Reglernas ordning:
1. Respektera befintlig kontaktspärr, exkludering, avregistrering, studs, nej, avvakta och projektstopp. En paus överordnas tidsgränsen och löper inte ut automatiskt.
2. Saknad, motsägelsefull, gammal eller oklassificerad relevant historik blockerar. Frånvaro av träff blir inte noll tidigare mejl eller noll påminnelser.
3. Osäker tidigare leverans/sändning, reservation eller pågående sändningsjobb blockerar. Ett verifierat misslyckande före sändning räknas inte som skickat mejl; oklart utfall får däremot inte behandlas som misslyckande före sändning. Ingen automatisk omsändning.
4. Ett nytt svar eller ett önskemål om att vänta stoppar en obesvarad uppföljning och kräver ny kontextgranskning.
5. En redan skickad obesvarad påminnelse för den aktuella inbjudan innebär paus, även om den skickades före importen. Ett nytt kampanjnamn/inbjudans-ID får inte nollställa en öppen obesvarad relation till samma mottagare.
6. För en första obesvarad uppföljning räknas minst 14 × 24 timmar från senaste relevanta utgående säljmejl. Oklarhet om senare utgående mejl blockerar. UTC används för jämförelse; svensk lokal tid och UTC-offset visas i gränssnittet.
7. Ett faktiskt svar på en kunds fråga är en annan avsikt och behöver inte vänta 14 dygn. Det kräver verifierad inkommande källa och mänsklig granskning och får inte skapa en ny påminnelsesekvens. Modellen ensam kan inte välja undantaget.

En första inbjudan kräver fortsatt uttryckligen kontrollerad avsaknad av tidigare kontakt samt befintliga kontakt-, spärr- och erbjudandekontroller. Ingen av de nu spärrade 139 posterna blir valbar genom att en historikversion sparas.

## 7. Omnira och Atlas

Lägg till en från början stängd sektion ”Kontaktplan och väntetider” i den befintliga säljvyn. Visa tydliga svenska statusar: ”Kontaktspärr”, ”Historik behöver stämmas av”, ”Påminnelse redan skickad”, ”Inväntar svar” och ”Tidigaste tidsgräns enligt underlaget”. Detaljer öppnas per kontakt. Ingen ny huvudmeny eller ständigt lång lista.

Historikgranskning visar mottagare, filialkoppling, källfönster, händelser, påminnelser och luckor innan ägaren sparar en ny version. Reglerna visas med versionsnummer. Regeländring är ett separat ägarbeslut och ger ingen sändningsrätt.

Ett läsverktyg, `get_sales_contact_timing`, följer befintlig projekt-/konversationsbindning och returnerar serverns resultat. Atlas ska citera status, källa och avstämningstid utan att tolka null som ett ledigt datum. Resultatet ska kunna granskas i samma vy. Verktyget skapar inga poster.

Den nya kontrollen återanvänds före första säljjobbets serverkontroller; databasoperationen validerar aktuella kontakt-/historikversioner i samma transaktion. Befintliga idempotens-, erbjudande-, spärr- och dubbleringskontroller består. Denna del lägger inte till automatisk förberedelse av uppföljningsjobb.

## 8. Relation till framtida kundsändning

Den aktuella privata testsvarsvägen ändras inte och får inga nya mottagare. Befintligt test skickas inte igen. Ingen kundpolicy, sändningsbehörighet eller schemaläggare skapas.

Datumkontrollen är en förberedelsekontroll. Före en senare kundaktivering måste samma aktuella källor, spärrar, versionsbundna granskning och mottagarreservation kontrolleras atomiskt både vid sändningsbeslut och omedelbart före dispatch. Nytt inkommande svar, senare utgående händelse, ändrat underlag eller för gammal avstämning ska då stoppa jobbet. Den kundvägen ingår inte i denna leverans och får inte beskrivas som färdig eller aktiveras genom godkännandet av detta dokument.

Manuella mejl utanför Omnira kan inte spärras av Omniras databas. Begränsningen visas tydligt. Framtida kundaktivering kräver därför en separat kvalificerad rutin för källornas aktualitet och samtidig manuell användning.

## 9. Behörighet, samtidighet och datakvalitet

Följ befintlig ägarbaserad projektåtkomst och `sales_owner`; ingen allmän service-role-nyckel lämnar servern. De nya tabellerna har RLS och explicita begränsade rättigheter. Samma ursprung krävs för historikmutationer. Atlas får enbart läsbehörighet genom det specifika verktyget.

Lås per projekt och normaliserad mottagaradress, i stabil ordning för flera adresser, och använd väntad föregående historikversion samt kontaktversioner. Samtidig historikimport/ändring och jobbskapande ska antingen använda samma aktuella version eller stoppa med versionskonflikt. Kartlägg låsordningen mot befintlig kontakt-/jobbgranskning före implementation; ändra inte den befintliga sändningsvägens lås utan ett separat behov.

Avvisa fel projekt, framtida/ogiltiga tider, oavslutade källfönster som påstås kompletta, okända eventklassningar och överstora importer. Datum med enbart kalenderdag får inte användas som exakt klockslag; visa frågan och blockera tidsgränsen. Rendera källtext som data, aldrig som instruktioner.

## 10. Verifiering och färdigkriterier

Verifiera riktade enhets-, API-, databas- och UI-fall:
- Exakt gräns strax före och vid 336 timmar, även över sommar-/vintertidsbyte.
- Senare manuellt Strato-mejl flyttar tidsgränsen; senare Resend-mejl ger samma effekt.
- Gammal källa, saknat fönster, källfel, enbart datum och okänd äldre historik blockerar.
- Två filialrader med samma mottagare ger samma kontaktkontroll utan att filialerna slås ihop.
- Befintlig påminnelse räknas, nytt inbjudansnamn nollställer inte pågående obesvarad kontakt.
- Nytt svar, avvakta, nej, avregistrering, studs, osäker sändning och aktuellt sändningsjobb blockerar fortsatt uppföljning.
- Ny version, ändrad adress och samtidiga mutationer ogiltigförklarar gammalt underlag.
- Fel ägare/projekt/konversation och försök att mutera via Atlas nekas.
- Läsning och sparad historik skapar inga sälj-, svars- eller sändningsjobb och ändrar inga kontaktspärrar.
- Befintlig privata testpolicy och redaktionella granskningar påverkas inte.
- Stängd sektion på dator och mobil, läsbara svenska statusar och källor, ingen falsk ”skickklar”.
- Verkligt lästest i Atlas ska återge serverresultatet och skilja tidsgräns från beslut/schemaläggning.

Ingen fullimport eller bakgrundsprocess startas vid migration. Befintliga 139 kontaktpayloads och de 17 nuvarande projektminnena bevaras. Kontrollera oförändrade jobb-/sändningsräknare före och efter verkliga läsprov. Kör relevanta befintliga tester och typecheck; redovisa kända historiska fel separat utan att kalla hela sviten grön.

## 11. Källor och självgranskning

- Befintlig kod och live-definitionen av `public.sales_send_confirm(jsonb,jsonb)`, kontrollerade 19 oktober.
- `docs/superpowers/verification/2026-10-19-sales-contact-cadence-preparation.json`.
- PostgreSQLs dokumentation om tidsaritmetik och skillnaden mellan kalenderdygn och 24 timmar: https://www.postgresql.org/docs/17/functions-datetime.html
- Ursprunglig godkänd säljspecifikation: `docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md`.

Självgranskning: förberedelse skiljs från sändning; källaktualitet skiljs från registreringstid; historiska mejl kan inte räknas bort genom ny import; okänd historik förblir okänd; kontaktspärrar bevaras; 14 dygn ger ingen automatisk rätt till återkontakt; manuella mejl utanför Omnira redovisas som begränsning. Inga credentials eller nya åtkomster ingår.

Nästa steg efter Andrés granskning av detta dokument är en genomförandeplan för just denna leverans. Ingen produktkod, migration eller produktionsaktivering utförs innan den designen och planen har granskats enligt utvecklingsflödet.
