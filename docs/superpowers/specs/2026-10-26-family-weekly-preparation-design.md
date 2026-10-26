# Atlas förbereder Familjestundens marknadsvecka

Status: design för granskning, ännu inte godkänd för implementation.

## Mål och avgränsning

André har valt att nästa steg är veckoförslag med befintliga bilder, nya texter och mänskligt godkännande. Saga och aktiviteter produceras fortsatt tillsammans med André. Den befintliga publiceringskön sköter godkända inlägg.

Första leveransen: André ber Atlas i projektets chatt att förbereda en uttryckligt angiven vecka. Atlas läser projektunderlaget, förbereder lediga innehållstillfällen och sparar utkast för granskning. Detta är ett steg mot automatiserad marknadsföring; det är inte en ny återkommande bakgrundskörning eller stående publiceringsfullmakt. Återkommande produktion kräver senare eget beslut om starttid och kostnadsgräns.

## Vald väg och alternativ

Bygg på befintlig Atlas-chatt, innehållsrevisioner, ägda bilder, redaktionella beslut och schemagranskning. Det återanvänder redan verifierade behörighets- och publiceringsgränser. André har valt veckoförslag för sitt godkännande med befintliga bilder.

En separat schemalagd producent skulle kunna förbereda veckor utan en chattbegäran, men tillför nya betalda körningar, kostnadstak och återstartsansvar. Det är ett senare steg. Ett fristående planeringssystem tillför dubbla kalendrar och godkännanden och passar inte behovet.

## Användarflöde

1. André ber exempelvis ”Förbered vecka 45 för Familjestunden”. Saknas år eller datum och perioden är tvetydig frågar Atlas; annars visar den måndag–söndag i svensk tid.
2. Atlas läser aktuell godkänd kanalplan, företagsunderlag, befintliga innehållsrevisioner, ägda bilder, schemabatcher och publiceringshistorik. Behörighet kontrolleras på servern för både användare och konversation.
3. Tillfällen som redan har innehåll eller köreservation lämnas ifred. Atlas visar dem som redan planerade. En redan full vecka resulterar i en läsbar återrapport utan nya utkast eller onödiga genereringssteg.
4. För lediga tillfällen föreslår Atlas kanaltexter för Facebook och Instagram och väljer en lämplig befintlig bild vars motiv kan beläggas i sparat underlag. Mediebrief är inte bevis för en ny bild. Okänt material, saknade produktfakta eller otillräckliga bildmetadata markeras som saknat; inga produktpåståenden uppfinns.
5. Utkasten sparas och länkas till befintliga ”Innehåll och kalender”. André granskar bild, text och tid. Ändringar kräver ny innehållsrevision och nytt redaktionellt beslut.
6. Först när de exakta revisionerna är redaktionellt godkända får Atlas föreslå en schemabatch. Befintligt native-godkännande ger kömandat. Veckoförberedelsen får aldrig själv godkänna innehåll, batch, kundåtkomst eller publicering.

## Planering och repetitionsskydd

Den redan lagda november–decemberplanen omfattar 36 köjobb och ska inte fyllas på med kopior. Befintliga verkliga tider är auktoritativa. För nya lediga veckor föreslås två ordinarie tillfällen, tisdag och fredag, med 17.00 respektive 20.30 som tydligt visat standardförslag. Detta är ett designförslag från Codex; det skriver inte om redan godkända onsdags-/söndagstider. Högst tre tillfällen per svensk vecka och högst två kanaler per tillfälle enligt nuvarande schemaregler. Månadens smygtitt kan vara tredje tillfället.

För delvis planerade veckor är målet två ordinarie tillfällen totalt, inte två nya. Ett befintligt onsdagsinlägg räknas alltså som ett av de två. Månadssmygtitten räknas separat, inom gränsen tre tillfällen. Endast återstående antal föreslås; bland lediga tisdag/fredagstider väljs den som ger störst avstånd till befintliga tillfällen, med tisdag först vid lika avstånd. Saknas en framtida ledig standardtid rapporteras det i stället för att flytta befintligt innehåll eller fylla på en ny veckodag. Ett befintligt tillfälle med bara en kanal lämnas som ett tillfälle och kompletteras inte tyst; Atlas rapporterar den saknade kanalen för en separat begäran. Detta är Codex föreslagna standard för att undvika överplanering, inte ett tidigare beslut från André.

Samma kampanj får finnas på Facebook och Instagram vid samma tillfälle. Exakta kopior stoppas; mycket liknande text eller samma bild med nästan samma budskap inom 14 dagar går till granskning enligt befintlig policy. Jämförelsen omfattar också befintliga planerade utkast och icke avbrutna köjobb, så att två nya förslag inte duplicerar varandra före publicering. En helt avbruten reservation utan publiceringsförsök är inte ett aktivt innehållstillfälle; publiceringshistorik och osäkra försök behålls som spärrar.

Saknat utfall från oktober får inte återpubliceras. Veckoförberedelsen får inte lösa eller radera det osäkra kvittot.

## Månadssmygtitt och källor

Månadens inlägg kräver uttrycklig år/månad och verifierbart produktunderlag för just den månaden. Produktunderlaget kommer från sparat projektunderlag eller en etablerad läsande projektkoppling; det krävs inte ny bred GitHub-behörighet. Saknas underlaget visas ”månadens innehåll saknas” och inget släppinlägg konstrueras från föregående månad. Kod, katalog eller driftsättning är inte kundåtkomstbevis.

Förberedelsen bevarar separata fält för månad, katalogfingeravtryck och villkor om kundåtkomst. Vid schemagranskning används befintlig month_release-väg. Kundåtkomst måste fortfarande bekräftas inom dygnet före publicering. Förslaget aktiverar ingen bekräftelse i förväg.

## Teknisk form och återhämtning

Ett avgränsat läsande veckokontextverktyg och ett servervaliderat sparverktyg kopplas till befintlig Atlas-chatt. Texten skrivs i den pågående chattkörningen med befintlig modell och dess vanliga kostnadskontroll. Inga nya betalda bildanrop, modellbyten eller separata bakgrundsmodellkörningar införs.

Servern räknar svensk veckoperiod, lediga tillfällen och tillåtna bild-/kanalval från färsk projektstatus. Modellens UUID:er, tider, projektfält och påstådda godkännanden är inte auktoritativa. Sparning kontrollerar projektägare, konversationsåtkomst, aktuell kanalplan, bildägande, repetitionsspärrar och samtidiga reservationer.

En sparad förberedelse identifieras av projekt, svensk veckostart och en uttrycklig förberedelsegeneration. Den binder stabila post-ID:n och idempotensnycklar till tillfälle/kanal. Samma begäran återanvänder förberedelsen; dubbelklick, parallella chattar och förlorade svar får inte skapa dubbla utkast. Delvis sparade förslag återupptas utan nya ID:n. Inaktuella källversioner eller nya reservationer ger konflikt och ny läsning. En ny generation eller ändring av befintliga utkast kräver uttrycklig ändringsbegäran; nya texter på ett återförsök får inte tyst ersätta tidigare sparade texter.

Val av intern tabell/RPC-layout, katalogfingeravtryckets kanoniska format, exakt låsordning inom befintlig projektlåspolicy och uppdelning av tester lämnas till implementatören. Ingen klient får servicebehörighet. Betrodda serververktyg ska behålla befintlig ägar-/konversationsisolering. Ingen ny publik skrivrätt eller publiceringsrätt skapas.

## Godkännandekrav och testbara resultat

- Full redan planerad vecka: noll nya utkast och tydlig återrapport.
- Ledig vecka med verifierat underlag: utkast för två tillfällen och båda kanalerna, rätt svensk period och ägd bild, inget schemabeslut.
- Saknad bild, fakta, månadsunderlag, konto eller godkänd kanalplan: begripligt saknat underlag, ingen fabricerad ersättning eller publicering.
- Exakt och liknande innehåll mot historik, framtida kö, andra utkast och samma förberedelse hanteras enligt 14-dagarspolicyn. Facebook+Instagram-kampanjparet är tillåtet.
- Återförsök, parallella chattar, avbruten sparning och ändrade källor ger inga dubbla utkast eller överskrivna godkännanden.
- Annat projekt, läsare och egenkonstruerade klientfält kan inte skriva eller godkänna.
- Förberedelseverktygen saknar alla vägar för provider-POST, batchgodkännande, kundåtkomstbevis och betald bildgenerering.
- Native innehållsgranskning och därefter separat schemagodkännande verifieras i test. Befintlig publicering och repetionsspärrar ska fortsätta fungera.

Ingen produktkod eller stående automation byggs före godkänd design. Därefter tas genomförandeplan och kostnadsbegränsade verifieringar fram.
