# The Prompt: Higgsfield MCP, videoklipp och bildreserv

Datum: 2026-10-22
Status: förslag för granskning; ingen aktivering eller produktkod ingår.
Projekt: The Prompt (a8a1b1f6-c222-4893-9399-b1fb3bc2fa52).
Kodbas: Bumbi190/ai-operating-platform, undersökt main 139a45c.

## Mål och avgränsning

André vill behålla två dagliga nyhetsreels, höja kvaliteten med korta relevanta videoklipp, använda befintliga Higgsfield-krediter och kunna gå tillbaka till stillbilder. Färdiga filer ska sparas automatiskt. Inga nya abonnemang eller automatiska påfyllningar ingår.

Detta dokument beskriver målbilden och avgränsar första leveransen till en anslutning som bara kan läsa konto/saldo och inhämta pris. Betald videogenerering, ändrat bildflöde och schemalagd aktivering ingår inte i den första leveransen. Efter verifierad anslutning delas fortsatt implementation upp i kostnadsstyrd generering/lagring och därefter renderingskoppling.

## Verifierad nulägesbild

- Fyra godkända Grok Imagine Video 1.5 Lite-klipp har använts i ett färdigt 28,1-sekunders prov, med befintlig engelsk röst och tidsatta undertexter.
- Provet kostade 16 krediter för fyra klipp plus 4 för ett omtag. Saldo vid kontrollen var 1170, inte en garanterad framtida tillgång.
- Hemsidan finns på stationära i C:\Users\Andre\Projects\Theprompt\Code\Theprompt-hemsida.
- Omniras cron step3 bygger SimpleNewsReel med bilder. step4 använder samma typ av props vid omrendering. Båda måste stödja klipp innan videoläget kan aktiveras.
- Provider-registret i lib/media/providers/router.ts registrerar MuAPI, men inte Higgsfield.
- Befintliga media/job-moduler äger hållbara jobb och CAS-övergångar. Befintlig asset admission stöder MP4/WebM, ägarskap och proveniens.
- Den nuvarande sociala tokenlagringen är uttryckligen för Facebook/Instagram/YouTube. Den får inte behandlas som en generell Higgsfield-tokenlagring.
- Granskade filer visar ingen färdig generell MCP-klient för denna integration.
- Kvalitetsfixen i draft-PR #513 och tidszonsfrågan i issue #378 är separata och ännu inte verifierat driftsatta.

## Val av anslutning

1. Rekommenderat: Higgsfield MCP med OAuth. Använder det befintliga kontots krediter. Omnira behöver en egen auktorisering; ChatGPT-pluginets inloggning överförs inte.
2. Vanliga Higgsfield API:t: separat dollardebitering och separat API-nyckel. Väljs inte här, eftersom det inte uppfyller kravet att först använda befintliga krediter.
3. Manuell produktion via chatten: fungerar för prov och använder redan anslutningen, men utgör inte en obevakad Atlas-automation.

MCP-servern är https://mcp.higgsfield.ai/mcp. Officiella instruktioner beskriver Streamable HTTP, OAuth2 och dynamisk klientregistrering. Faktiska annonserade metadata, scopes och verktygsscheman ska verifieras vid anslutningen; inga endpoints eller verktygsargument ska härledas från gamla exempel.

## Första leverans: anslutning och läsning

Omfattning:
- En serverstyrd, projektbunden OAuth-start och callback med state, PKCE och kortlivad engångstransaktion.
- Endast projektets behöriga operatör kan koppla, se status eller koppla från. Callback måste matcha initiativtagare, projekt, server och state.
- Serveradress är fast och tillåts inte väljas via inkommande URL. Annonserade auth-adresser kontrolleras mot förväntad leverantör.
- Tokens lagras krypterat på serversidan med återkallelse och refresh-hantering. De lämnar aldrig status-API, klientloggar eller feltexter.
- Ny separat provider-anslutningslagring med projektägarskap, server-only behörighet och RLS; sociala tokeners befintliga CHECK-regler ändras inte.
- Anslutningsstatus visar ansluten/återanslutning krävs/inte ansluten. Visa verifierat konto eller workspace om servern tillhandahåller stabil identitet. Om identiteten inte kan bindas kan läsprovet redovisas, men betald aktivering blockeras.
- MCP-klienten tillåter enbart saldo-, modell- och prisverktyg i denna leverans. Inga genererings-, köp-, projekt- eller kontomuterande verktyg exponeras för Atlas.
- Prisinhämtning använder ett bekräftat schema utan mediereferenser, eftersom vissa prisverktyg kan importera referensfiler.
- Ingen ändring i crons, publiceringsstatus eller produktionsflaggor.

Ny teknisk kod placeras i en avgränsad Higgsfield MCP-modul, med anslutningsroutes och fokuserade tester. Produktionsberoenden låses i befintlig lockfil. Exakta SDK-anrop verifieras mot aktuell dokumentation när implementationen planeras.

Godkänt resultat:
1. Lokal verifiering med fejkat MCP-svar bevisar callback-bindning, tokenhantering, åtkomstkontroll och verktygsbegränsning.
2. Operatören kan ansluta sitt konto genom leverantörens inloggningsfönster.
3. Omnira kan läsa saldo och offert för fyra sekunder 720p, 9:16 utan att skapa ett jobb eller minska saldot.
4. Frånkoppling stoppar åtkomst och raderar lokalt sparade tokens; eventuell leverantörsåterkallelse används när den stöds.
5. Bildflödet och dess schemaläggning är oförändrade.

## Målbild för följande leveranser

### Kostnadsstyrd generering

Föreslagna startgränser, inte aktiverade:
- Högst 4 klipp per reel, normalt 4 sekunder per klipp i 720p.
- Högst 20 Higgsfield-krediter per reel inklusive omtag.
- Högst 40 per svensk kalenderdag och 1000 över rullande 30 dygn.
- Minst 100 krediter lämnas på kontot efter en reservation.
- Ingen automatisk påfyllning eller automatisk växling till dollar-API.
- Högst ett kvalitetsomtag per reel och endast inom samtliga gränser.

Pris och saldo kontrolleras före skapande. Reservationer måste vara atomiska över samtidiga jobb och räknas med i gränserna. Okända pris-, saldo- eller dispatchutfall får inte behandlas som noll kostnad eller utlösa omköp.

Befintlig central spend-governance ska fortsatt gälla. Dess SEK-redovisning får inte matas med påhittad kreditkurs. En verifierad resursklass och redovisningsgrund för förbetalda krediter krävs före betald dispatch. Saknas den är generering blockerad, även om MCP-inloggningen fungerar.

Higgsfield-adaptern ansluts till befintligt provider-kontrakt och media-jobblivscykel. Inget parallellt retry- eller jobbsystem byggs. Förlorat svar efter submit betyder okänt utfall; reservation och jobb behålls för avstämning, inte automatisk nygenerering.

### Lagring och kvalitet

Varje färdigt klipp laddas ned och antas som kanonisk tillgång i rätt projekt innan det får användas. Kontrollera format, storlek, ägarskap och checksumma; registrera modell, jobbidentitet, kreditunderlag och koppling till nyheten. Använd projektlagringens stabila objekt, inte leverantörens tillfälliga länkar, i renderingen.

Råklipp, slutvideo, text och undertextunderlag sparas automatiskt. Den lokala Nyheter-mappen är en exportkopia, inte den enda kopian. Exportkö får vänta när stationära är avstängd utan att originalen försvinner.

Klippen är illustrationer, inte dokumentära bevis. Granska loggor, verkliga personer och missvisande scener. Ingen nyhetsuppgift får godkännas genom att enbart den visuella kontrollen passerar.

### Rendering och bildreserv

Lägen: still_images och video_clips. Första driftsatta versionen behåller still_images som standard och gör video_clips till ett uttryckligt projektval.

Behåll befintliga bilder och SimpleNewsReel. Lägg till en separat klippkomposition och ett versionerat klippmanifest. Props innehåller tillgångsidentiteter/stabila URL:er, faktisk längd, scenplacering och tyst klippljud. Samma engelska röst och undertexter används.

Spara valt läge, manifest och komposition på renderförsöket. step4 måste återanvända samma låsta underlag vid retry; det får inte nygenerera klipp eller falla tillbaka till fel komposition.

Färdiga klipp måste finnas före step3:s renderstart. Saknas godkända klipp vid den tidpunkten, eller om anslutning/budget saknas, väljs det befintliga bildflödet. Eventuella senare färdiga klipp arkiveras och orsakar ingen extra publicering.

Återgång till bilder sker för samma script/publiceringsslot med atomiskt val av endast en rendergren. Publicerade poster skrivs inte över. Ett allmänt exekveringsstopp eller underkänd nyhet blockerar båda grenarna; det får inte kringgås via bildreserven. Bildgenerering och Lambda måste fortfarande klara sina egna kostnads- och exekveringsgrindar.

Ingen ny separat publiceringscron. Befintliga tider 10:00 och 20:00 Europe/Stockholm ska bevaras. Sommartidsfixen följs upp separat före aktivering.

## Verifiering före senare aktivering

- Dubbla cronanrop ger högst ett ägt jobb och en vald rendergren.
- Expirerad OAuth, okänd offert, kreditbrist och lagringsfel ger uttrycklig status.
- Ett osäkert submitutfall ger aldrig automatisk ny debitering.
- Dagsgränsen följer Europe/Stockholm även vid byte av sommartid.
- Steg 3 och steg 4 renderar samma klippmanifest vid återförsök.
- Ett projekt kan inte använda ett annat projekts tokens, jobb eller tillgångar.
- Avstängt videoläge ger samma fungerande bildreel som tidigare.
- En end-to-end-provreel granskas före att video blir valt projektläge.
- Separat kodgranskning krävs före merge. Inga genereringskostnader behövs för enhetstester.

## Källor, kontrollerade 2026-10-22

- https://higgsfield.ai/blog/higgsfield-api — API och MCP/plugin har skild debitering.
- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp — egna MCP-klienter, OAuth och befintliga krediter.
- https://higgsfield.ai/blog/automate-ai-video-n8n-make — Streamable HTTP och dynamisk OAuth-klientregistrering.
- https://higgsfield.ai/mcp — officiell MCP-serveradress.

## Granskningsutfall

Dokumentet är självgranskat mot lästa kodvägar: befintliga sociala tokens återanvänds inte som generell providerlagring, central spend-governance kringgås inte, och bildreserven får inte kringgå stopp eller kvalitetskrav. Första leveransen gör inga betalda anrop. Senare kredittak är förslag, inte redan sparad produktionskonfiguration.
