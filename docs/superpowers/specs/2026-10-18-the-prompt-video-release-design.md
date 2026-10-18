# The Prompt – granskad film till publicering

Status: **approved architecture specification** by Andre on 18 October 2026 at 09:40 Stockholm; implementation plan review is next. No installed release authority.
Datum: 18 oktober 2026. Utgångspunkt: draft PR #377, kod de9f0ea och dokumentation 193342c.

## Mål och avgränsning

Den godkända bildstilen ska kunna användas i The Prompts befintliga två dagliga nyhetssläpp. Systemet ska kunna svara på vilken faktisk film, källa, berättarröst och vilka bilder som granskats, vilket konto som får materialet och om det redan har skickats. Ett manuellt satt `status=approved`, en fungerande videolänk eller en godkänd bildstil räcker inte för den nya vägen.

André har redan godkänt den privata filmen med mjuk zoom. Det beslutet bevaras och samma oförändrade prov ska inte granskas estetiskt igen. Detta förslag gäller den tekniska kopplingen och en senare konkret releasebekräftelse med rätt film och destination.

Det första genomförbara delprojektet är **ett serverbyggt, beständigt granskningspaket** i Omniras befintliga innehållsgranskning. Det får inga utskicksrättigheter. Reels-transport, YouTube, automatiskt schema och veckotest följer först när deras egna återstående delar är verifierade.

## Verifierad befintlig kod

| Del | Det som faktiskt finns | Begränsning |
| --- | --- | --- |
| `ThePromptIllustratedNews` | Registrerad Remotion-komposition med verkliga ordtider, tre bilder, Victoria och AI-märkning | Ingen releasebehörighet; Lambda-starten tillåter ännu bara de två äldre mallarna |
| `assets` och `asset_provenance` | Projektbundna medie-ID:n, kontrollsummor, privat lagring och registrerad genereringshistorik | Leverantörsnamn är inte i sig användningsrätt eller publiceringsbeslut |
| `social_content_posts/revisions/decisions` | Beständiga revisioner och exakta mänskliga beslut; video stöds i innehållsförberedelsen | Saknar The Prompts sammanhållna nyhets-/röst-/renderunderlag |
| `social_publications/events` | Kontobunden publiceringsbegäran, versionsvillkor, kanalstatus och osäkerhetsläge | Nuvarande manuella transport tillåter FB text/länk/JPEG och IG JPEG; inte Reels eller YouTube |
| Äldre The Prompt-publicerare | Befintliga konto-/stopp-/kanalkvitton och två dagliga släpp | Använder skriptrad och URL; får inte bli genväg för nya illustrationsprov |

Detta bygger på läst källkod i `lib/social-launch/content`, `lib/social-launch/publication`, motsvarande två kanoniska SQL-filer, `lib/media/asset` och de verkliga cron-/publiceringsrutterna. Schemaförekomst i produktion för det nya föreslagna paketet påstås inte.

## Alternativ och rekommendation

1. **Rekommenderat: återanvänd befintliga innehållsrevisioner och beslut, lägg till ett smalt nyhetsunderlag bundet till revisionen.** Granskningen och framtida publiceringsbegäran får samma identitet som Omniras andra innehåll. Nyhetsfält, röstkvitto och renderidentitet blir ett tillägg, inte en andra godkännandemotor.
2. Lägg releaseflaggor i `media_scripts.raw_output`. Mindre kod, men en redigerbar rad och en boolesk flagga ger inte ett oföränderligt, granskat paket. Rekommenderas inte.
3. Bygg en separat The Prompt-publicerare med egen besluts- och kvittohistorik. Ger fler parallella vägar och svårare dubbleringsskydd. Rekommenderas inte.

## Det första delprojektets data och flöde

### 1. En verklig nyhetsrevision

Den privata leverantörsprovets rad är en separat `pending_review/private_preview` med platshållarmanus. Den ska bevaras. Den får inte byta status och bli den nya publiceringsraden.

Förberedelseadaptern tar endast projekt, manus-ID, video-asset-ID och en återanvändbar idempotensnyckel. Servern hämtar ägare/projekträtt, det faktiska engelska manuset, nyhetens ursprungliga källa och publiceringstid samt de kanoniska medierna. Saknad verklig manus-/nyhetsrad ger ett konkret förberedelsefel. En klient får inte leverera `approved`, `rightsVerified`, leverantörsuppgifter eller egna signerade URL:er som bevis.

### 2. Ett oföränderligt nyhetsunderlag

Föreslagen ny serverintern relation: `media_news_review_evidence`, en post per innehållsrevision, projekt och SHA-256. Namn och detaljer blir en riktig granskad migration i nästa implementation; inget schema tillämpas genom detta dokument.

Paketet binder följande fält:

- projekt, manus-ID, faktisk innehållsrevision och dess checksumma;
- ursprunglig nyhets-URL, ursprunglig publiceringstid, källnyckel och manus-/hookfingeravtryck;
- exakt MP4-asset-ID, byteantal, checksumma, uppmätta videodata och referens till full bild-/ljudkontroll;
- ordnad lista med tre bild-ID:n och kontrollsummor;
- audio-ID/kontrollsumma, kanoniskt Victoria-röstkvitto, modell, varaktighet, manus- och ordtidshash;
- kreativ version `the-prompt-illustrated-smooth-v1`, komposition, källkodsversion och faktisk renderprofil;
- användningsunderlag för AI-illustrationerna med spårbara referenser och beslutstid; saknat underlag blockerar;
- registrerad budget-/genereringsproveniens som referenser till befintliga kvitton, aldrig ett påhittat leverantörssaldo.

Signerade länkar är tillfällig leverans och ingår inte i identitetsfingeravtrycket. Hashning använder schemafast projektion; ordtider återanvänder den befintliga kanoniska projektionen i `pilotVoiceTimingsSha256`.

Tabellen får RLS, nekad direkt åtkomst för anon/authenticated och skrivskydd efter skapande. Relationer binder projekt, post, revision och checksumma tillsammans. Serverintern skapandefunktion återanvänder samma ägarkontroll och stoppregler som befintlig innehållsförberedelse. Inga klientredigerbara metadata får utge sig för att vara kontrollresultat.

### 3. Samma granskning, rätt film

Den befintliga innehållsvyn visar exakt MP4 med kortlivad behörig uppspelning, engelsk inläggstext, källans datum/färskhet, AI-märkning och tänkt destinationskonto.

Beslutet återanvänder `social_content_decisions` och binder den exakta aktuella revisionen. Underlaget måste finnas innan beslutet fattas; ett gammalt beslut får aldrig göras giltigt genom att bevis läggs till i efterhand. Ändrad film, källa, ljud, bilder, text eller kontobindning kräver en ny revision. Det är innehållets nya tillstånd som granskas, inte en upprepning av godkännandet av den gamla privata filmen.

Den redan exporterade produktionspresentationen är en separat fil med SHA-256 `9f2fa29912da43efa731453796c417c3a26d661189a85641c4603f0be50a9fab`. Den har andra bytes än det godkända privata provet eftersom provetiketterna ändrats. Detta dokument installerar inget beslut för den.

### 4. Läsbar beredskap, ingen dispatch

Första delprojektet levererar en läsande beredskapskontroll med tydliga orsaker: saknad källa, utgången nyhet, fel projekt, ändrat media, saknat röst-/användningsunderlag, saknat granskningsbeslut, stoppat projekt eller saknad videotransport.

Resultatet beskriver `review_packet_ready` och separata blockerare för faktisk publicering. Det får inte hävda `canPublish=true` medan transport, schema eller releasebehörighet saknas. Inga vanliga GET-anrop genererar, laddar upp till sociala medier eller skapar publiceringsbegäran.

## Senare koppling efter första delprojektet

Reels-stöd ska utöka den befintliga publiceringsmotorn, dess DB-kontroller och dess kvittohistorik. Det ska inte implementeras genom att ta bort den nya spärren i de gamla The Prompt-rutterna.

- Varje konto får en egen innehållsrevision och publiceringsbegäran; samma film kan återanvändas via samma kanoniska video-ID.
- Nyhetsunderlag, aktuell granskning, mediebytes, konto och stopp kontrolleras vid begäran och inför varje nytt skrivande leverantörsanrop.
- Förlorat svar efter ett potentiellt skickat anrop går till befintligt osäkerhets-/återhämtningsflöde. En timeout ger inte en ny publicering eller ett nytt medieköp.
- Videoleverans kräver en uttrycklig utökning av nuvarande JPEG-kontroll och leveransendpoint, med MP4-gränser och korrekt byte-/Range-hantering. Befintliga bildinlägg ska fortsätta fungera.
- YouTube förblir en separat destinationsadapter med kanalbekräftelse och kvitto; det nuvarande manuella publiceringskontraktet stödjer inte kanalen.
- Framtida molnrendering kräver egen granskad kostnads-/återhämtningskoppling. Befintlig privat MP4 kan först tas in via kanonisk privat asset-admission, utan en ny bild-/röstgenerering.
- Ett godkänt granskningspaket är inte en automatisk behörighet att publicera fjorton framtida, ännu inte skapade filmer.

## Testbara acceptanskrav för första delprojektet

1. Fel användare/projekt får inget privat underlag och utför inga skrivningar.
2. Klientflaggor, en främmande/ändrad fil eller ett gammalt godkännande kan inte skapa ett giltigt paket.
3. Röst, manus, ordtider, bildordning, kreativ version och video-ID/kontrollsumma matchar de verkliga lagrade underlagen.
4. Nyhetsfärskhet beräknas från ursprungskällans tid vid varje relevant kontroll. Senare rapportering återställer inte klockan.
5. Samma exakta förberedelse med samma nyckel ger samma paket. Samma nyckel med ändrat innehåll ger konflikt.
6. Databasfel, ofullständigt videounderlag och okänd användningsgrund ger tydlig blockerare, aldrig automatiskt godkännande.
7. Samtidig revision/beslut använder databasvillkor och kan inte godkänna en utbytt film.
8. Ingen förberedelse, läsning eller granskning anropar publicerare eller öppnar legacy-spärren.
9. Ordinarie videor, befintliga JPEG-inlägg och andra projekt behåller sina nuvarande regler.
10. SQL testas lokalt inklusive behörighet/append-only/konkurrens, och migration/rollback granskas separat före produktion.

## Releasegränser och beroenden

Det första delprojektet implementeras och provas i isolerad gren med extern dispatch avstängd. Specifikationens godkännande tillåter nästa planeringssteg; det är inte main-merge, migrationskörning, betald generering eller en livepublicering.

Den gemensamma migrationsblockeringen `sales_reply_preparation` måste fortfarande samordnas mot kanonisk huvudgren. Ingen guard-override eller kopiering av overifierad SQL ingår.

Före själva sjudagarstestet krävs dessutom DST-säkert 10.00/20.00 Europe/Stockholm (#378), prospektiva 24h/72h-kvitton per plattform (#383), fungerande videotransport och ett konkret ägarbeslut om testets releasepaket. Totalen förblir högst två släpp om dagen, högst fjorton under veckan. Det här dokumentet aktiverar inget av detta.

Anthropic-exemplet har ursprungstid 16 oktober 16.26 UTC och passerar 48 timmar 18 oktober 18.26 svensk tid. Det kan fortsätta användas som tekniskt granskningsprov därefter, men inte som en ny aktuell nyhet för kvällens släpp.

## Självgranskning

Förslaget återanvänder faktiska revisions-/beslutstabeller, skiljer första granskningspaketet från senare transport och schema, och lämnar inga låtsasgodkännanden i dagens provrad. Föreslagen relation och adapter är uttryckligen nya; de beskrivs inte som installerade funktioner. Nästa steg efter ägarens granskning är en separat genomförandeplan, inte direkt aktivering.
