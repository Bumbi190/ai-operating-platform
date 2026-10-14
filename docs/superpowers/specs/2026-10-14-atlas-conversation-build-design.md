# Atlas: samtal, plan och livebygge i Omnira

Datum: 2026-10-14
Status: konkret designförslag för granskning; inga produktändringar genom detta dokument.
Grund: main 630a12cd01f2c9ed45cc65d7be42da2e51904168 och användarens feedback på mobilbyggvyn.

## Mål och godkänt tidigare arbete

Användaren vill börja i en vanlig Atlas-chatt eller ett röstsamtal. Atlas hjälper till att planera hemsidans syfte, innehåll, utseende och tekniska arkitektur. Efter granskning av planen öppnas en preview som uppdateras under arbetet. Samtalet fortsätter i samma konversation. Saknade anslutningar förklaras enkelt med direktlänkar och korrekta instruktioner.

Omniras befintliga visuella identitet ska användas i arbetsytan. Den genererade hemsidans design bestäms av användarens önskemål och eventuella referens, inte av Omniras färger.

Det tidigare godkända bygget och röstfixen är redan levererade i PR #337 och #339. Deras byggmotor, projektisolering, kostnadskontroller, versioner, feedbackkö och previewisolering ska återanvändas. Detta dokument ersätter form- och agentvalet som primär ingång. Det är ett tillägg till den levererade funktionaliteten, inte en omskrivning av motorn.

## Verifierat nuläge

- BuildStart har en separat blankett och väljer agents[0]. Därför kan en medieagent bli förvald byggagent.
- BuildWorkspace.module.css innehåller en egen hårdkodad palett som avviker från Omniras befintliga globala designvärden och Atlas-chatten.
- /api/chat har redan start_website_build, get_website_build, submit_website_build_feedback och control_website_build. Start kräver idag projekt, agent och brief; någon bindande planrevision ingår inte.
- Startverktyget returnerar workspaceUrl och instruktion att visa en länk. Textchatten och röstlagret hanterar navigation men saknar ett gemensamt typat byggvybesked.
- Byggvyn visar en separat feedbackkonversation. Den sparade byggsessionen har conversationId, vilket ger en återanvändbar koppling men innebär inte att de olika chattklienterna redan delar aktiv historik.
- Nuvarande worker bygger verifierade statiska sidpaket med granskade interaktioner. Den exekverar inte en godtycklig fullstack-app och publicerar inte till Vercel.
- Omniras kodarbetskontrakt förbjuder godtycklig shell, deployment och credential.access. Den lokala broker-CLI:n har generate, enroll och diagnostic med en macOS-signer. Godkänd brokeridentitet är inte bevis för en fungerande Windows-terminal eller körande worker.
- Befintliga inställningar har projektbundna sociala anslutningar och metadata för vissa konfigurationsvärden. De utgör inte en generell Vercel-/Supabase-anslutning för Atlas.
- Omnira använder själv Vercel och Supabase. Det ger inte automatiskt Atlas behörighet att skapa eller ändra kunders webbprojekt på dessa tjänster. Anslutningar i ChatGPT är heller inte Atlas-runtimeanslutningar.

## Alternativ och rekommendation

1. Rekommenderat: samma Atlas-konversation med ett plan-/previewpaneltillstånd. Återanvänder chatten och motorn, undviker dubbla samtal och fungerar för text och röst.
2. Separat byggsida som öppnas från chatten: mindre UI-arbete men större risk att konversation, röst och preview tappar sammanhang.
3. Generell utvecklingsmiljö först: ger fullstack-körning men kräver nya exekverings-, paket-, nätverks- och deploymentadaptrar. Bör byggas efter att samtalsflödet är fungerande.

Rekommendationen är alternativ 1. Genomförandet delas i tre leveranser med egna verifierbara gränser: samtal/plan/preview, körbar projektutveckling, publicering/databaskoppling.

## Användarflöde

1. Användaren skriver eller säger exempelvis: ”Jag vill bygga en bokningssida med mörk design”.
2. Atlas identifierar rätt projekt. Om ingen entydig projektkoppling finns frågar Atlas om projektet; inga nya externa projekt skapas implicit.
3. Atlas frågar bara efter uppgifter som påverkar utförandet. Den sammanfattar mål, målgrupp, sidor, designreferens, funktioner och vad som kräver externa tjänster.
4. Ett plankort visas i samtalet. Det innehåller sidstruktur, viktiga komponenter, data/inloggning vid behov, föreslagen teknik, integrationsbehov, arbetsordning och befintlig budgetgräns.
5. Användaren kan be om ändringar eller trycka ”Bygg enligt planen”. Ett entydigt ”kör” i samtalet får hänvisa till exakt den väntande, synliga planrevisionen genom den befintliga beslutsgrinden. Modellen kan inte själv skapa ett operatörsgodkännande.
6. Efter serverkvitterad byggstart öppnas previewpanelen automatiskt. Innan första versionen finns visas det verkliga arbetssteget.
7. Samma konversation fortsätter medan jobbet kör separat. Instruktioner som ”gör knappen mindre” binds till previewversionen användaren faktiskt såg.
8. Atlas visar vad som är sparat, förstått och infört. Den senaste fungerande versionen ligger kvar om en senare version misslyckas.
9. När en funktion behöver en saknad tjänst visar Atlas ett anslutningskort och fortsätter med sådant som går att utföra. En demoform eller inloggningsskiss märks som demo tills en verklig anslutning har testats.
10. Testad preview och offentlig publicering har separata statusar. Publicering följer användarens tillåtelse för rätt mål och version.

”Bygg hemsida” blir en genväg till en projektbunden Atlas-konversation med en startfråga. Ingen dropdown med News Hunter eller annan generell agent visas i användarflödet. Befintliga bygglänkar fortsätter att öppna rätt historiska session.

## Gränssnitt och färger

- Återanvänd Omniras befintliga yt-, text-, kant-, accent-, typografi- och fokusvärden. Skapa ingen ny palett för byggvyn.
- Desktop: konversation till vänster; samma arbetsyta har plan eller preview till höger. Panelbredd kan justeras och panelen kan stängas utan att jobbet stoppas.
- Mobil: flikar ”Atlas” och ”Preview”, med tydlig planöversikt i Atlas-fliken. Mikrofonstatus, utkast och bygge består vid flikbyte.
- Behåll läsbar text, fokusmarkeringar, visningsstorlek och reduced-motion. Verifiera mot den befintliga Atlas-chatten på 390 px, 980 px och desktop.
- Produkttext använder ”plan”, ”bygger”, ”preview”, ”anslutning saknas” och ”publicerad”. Interna run-/claim-/brokertermer visas bara i detaljer när de hjälper felsökning.

## Samtals- och plankontrakt

En plan tillhör exakt en ägare, ett tillåtet projekt och en konversation. Revisionerna är oföränderliga och innehåller strukturerade krav, teknikval, integrationsbehov och en hash. Ändrade krav skapar en ny revision; ett godkännande av en äldre revision startar inte ett bygge av en nyare.

Den serverlagrade beslutshandlingen binder användare, projekt, konversation, planrevision och omfattning. Att godkänna en statisk preview utökar inte behörigheten till terminal, externa tjänster eller publicering. Oklara eller motsägande önskemål ger ett konkret val i samtalet.

Byggstart använder den godkända planrevisionen och hämtar agentval på servern från projektets uttryckligt konfigurerade byggagent. Agenten måste tillhöra projektet och stödja den avsedda arbetstypen. Saknad lämplig agent ger en inställningsåtgärd; alfabetisk ordning och namnlikhet ger ingen behörighet.

Samma conversationId följer text, röst, plan och byggsession. Ett gemensamt klientkontrakt för konversationens id, historik och aktiva byggkontext ersätter de separata historiespår som idag kan divergera. Rösttranskription kan rättas före sändning. Röst och text konkurrerar inte om två mikrofoner eller två osammanhängande samtal.

Chattklienten skickar vald session/revision som visningskontext. Servern verifierar ägande och alla kopplingar; klientfält är aldrig behörighetsbevis. Vanliga frågor besvaras i chatten. Byggändringar skickas genom den befintliga feedbackkön med stabil idempotency key, utan dubbel registrering.

## Öppna preview och återuppta

Ett typat serverbesked efter faktisk byggstart anger den auktoriserade konversationen och byggsessionen. Textklient och röst-runtime använder samma validerade besked för att öppna panelen. Modelltext, en slumpmässig URL eller en inkommande iframe-message får inte öppna godtyckligt innehåll.

Vid reload hämtas kopplad plan och byggsession från servern med ägarkontroll. Förlorad SSE-anslutning efter byggstart återhämtas med samma idempotency key och serverstatus. Sparad feedback visas från dess verkliga kvitton; den dupliceras inte i historiken.

Befintliga byggsessioner fungerar utan att påhittade retroaktiva plangodkännanden skapas. Feedback inom deras redan godkända statiska omfattning fortsätter fungera. Alla nya starter måste passera planrevisionens beslut. Gamla startklienter får ett strukturerat ”plan behöver granskas”-svar och en säker samtalslänk.

## Enkla anslutningskort

Varje kort visar:
- varför anslutningen behövs för en konkret funktion;
- exakt projekt, konto/mål och miljö som avses;
- verifierad status: kopplad, saknas, kunde inte kontrolleras, gått ut, åtkomst nekad eller funktion ännu inte tillgänglig;
- senast kontrollerad tid och nästa steg;
- ”Öppna inställningen”, ”Kopiera kommandot” där ett verifierat kommando finns och ”Kontrollera igen”;
- vad Atlas får göra och hur användaren återkallar tillåtelsen.

Status bestäms av riktiga metadata och adapterkontroller. Förekomsten av ett konfigurationsnamn är inte bevis för fungerande åtkomst. Ett misslyckat statusanrop betyder ”kunde inte kontrolleras”, inte ”saknas”. Om en köradapter ännu inte finns sägs det uttryckligen; ett anslutningskort aktiverar inte en falsk körknapp.

Behoven utgår från planen. En enkel informationssida kräver inte Supabase. Saknad Vercel-koppling stoppar inte en lokal statisk preview.

## Länkar, filer och nycklar

Länkar och kommandon kommer från en granskad guidekatalog, inte från fritt modellerade instruktioner. Katalogen anger tjänst, OS, CLI-version där det behövs, officiell dokumentation, steg och kontroller. Atlas fyller bara i verifierade, icke-hemliga mål.

| Behov | Rätt väg | Installation och kontroll |
| --- | --- | --- |
| Vercel-inloggning | Officiell anslutning eller vercel login på den avsedda runnern | Kontrollera konto och rätt projekt innan någon write |
| Vercel-projekt | vercel link i rätt arbetskatalog | Bind verifierat team/project, visa deras namn |
| Vercel-miljövariabel | Verifierad projektlänk till Settings > Environment Variables | Skriv exakt variabelnamn och miljö, använd Secret för hemligheter |
| Supabase API-nyckel | https://supabase.com/dashboard/project/<verifierad-ref>/settings/api-keys | Välj publicerbar nyckel för klient, hemlig endast vid faktiskt serverbehov |
| Supabase managementåtkomst | Officiell anslutning eller scoped PAT från konto-/tokeninställning | Skilj managementåtkomst från appens data-API-nyckel |
| Lokal apphemlighet | CSPRNG med verifierat kommando för OS, alternativt säker genereringsknapp | Spara direkt i rätt skyddade fält utan utskrift i chatten |
| Omnira-projektnyckel | Omniras riktiga utfärdarflöde med projekt och scopes | En slumpsträng ensam skapar ingen giltig registrerad nyckel |
| Lokal terminal | Installerad och testad projektbunden runner | Godkänd identitet, onlinekontroll och tillåtet repo/kommandoset krävs |

Lokalt genererade apphemligheter och leverantörsutfärdade API-nycklar är olika saker. Ett slumpkommando kan skapa exempelvis en sessionshemlighet men ersätter inte Vercels/Supabases utfärdarflöden.

Hemligheter skrivs i en separat säker inställningsyta eller hos leverantören. De går inte genom modellprompt, chatthistorik, preview, Git eller användarsynliga loggar. Atlas ser bara referens, namn, mål och verifieringsutfall. Inga verkliga tokens byggs in i kopierbara kommandon eller URL-parametrar.

För lokala filer ska kortet öppna en verklig, tillåten fil i den projektbundna runnerns filvy med hemliga värden maskerade. Om ingen sådan runner finns visas leverantörens inställningssida och exakt fil-/variabelnamn som hjälp; knappen ”Öppna fil” visas inte som om mobilen kan öppna en Windowsfil.

Projektlänkar genereras först efter målverifiering. Visa tydligt om länken avser hemsidans eget projekt eller Omniras driftsmiljö. Inga produktions-id:n, privata användar-id:n eller hemligheter hårdkodas i guiderna.

## Tillåtelse och verkligt utförande

Återanvänd befintlig governance och beslutsgrind. En tillåtelse innehåller tjänst/runner, projekt/repo, miljö, operationer, giltighet och befintlig kostnadsgräns. En giltig tidigare tillåtelse används inom sin omfattning; fråga inte igen för varje tangenttryckning.

Terminalåtkomst är inte en generell ”gör allt”-rättighet. Bygg/test i en isolerad projektmiljö skiljs från åtkomst till hostens godtyckliga filer och credential stores. Kontokoppling, läsåtkomst, databasmigration och offentlig deployment är olika befogenheter.

Nya Vercel-/Supabase-adaptrar måste vara separata från det begränsade kodarbetskontrakt som uttryckligen förbjuder deployment och credential.access. Ändra inte det kontraktet till en allmän shellbakväg. Serveradapter använder en skyddad credentialreferens och bevisar verkligt utfall för rätt mål.

Ändringar som utökar funktioner, projekt, tjänster, kostnad eller miljö uppdaterar planen och kräver motsvarande nytt beslut. Publicering rapporteras först med verifierad deployment, URL, revision/commit och funktionskontroll. Ett provider-timeout efter write ger okänt utfall och återhämtning av kvitto, inte blind dubbelkörning.

## Leveransordning och ärliga klartkriterier

### A. Samtal, plan, preview och anslutningsvägledning

Omfattar gemensam konversationskontext, plangranskning, automatisk öppning av befintlig statisk preview, projektets byggagent, samma Omnira-design samt verkliga statusar och guider för tillgängliga respektive saknade adaptrar. Inga nya externa resurser behövs för statisk preview.

Klart när ett text- och ett röstinitierat jobb går från idé via granskad plan till preview utan byggblankett, och ändringar/reload fungerar i samma samtal. För en backendidé visar Atlas både den planerade funktionen och den faktiska saknade kopplingen.

### B. Körbar projektutveckling och terminal

Eget implementationsarbete för en fungerande runner på användarens målmiljö, projektbundna filer, beroenden, bygg/test och en separat preview för verkliga appar. Befintlig macOS-enrollment antas inte fungera på Windows. Vald runner måste bevisa identitet, isolering, tillåtna operationer och resultat innan UI visar ”redo”.

Klart när Atlas kan skapa eller ändra ett riktigt projekt, köra dess godkända kontroller och visa rätt resultat. Modelltext eller identitetsregistrering räknas inte som terminalexekvering.

### C. Vercel, Supabase och färdig produkt

Eget implementationsarbete för skyddade, projektspecifika anslutningar och rättigheter, miljökonfiguration, migrations-/deploymentkvitton samt livekontroller. Data och hemligheter går aldrig via den statiska previewiframes miljö.

Klart när en verklig vald hemsida kan publiceras, rätt databaskoppling fungerar för avsedda användare, och Atlas kan visa verkliga resultat eller ett konkret återhämtningssteg. Kontoskapande, avgiftsbelagda resurser och produktionsändringar följer användarens uttryckliga omfattning.

## Berörda gränser

- Befintlig AtlasChatConversation, AtlasChatLauncher och Atlas-runtime delar konversations- och arbetskontext.
- chat-shared/view-client får typade plan-/byggvyeffekter utan databas- eller authkod i klientkontrakt.
- /api/chat och website-build/atlas-tools återanvänder ägar-/projektkontroller och byggkön.
- Ny planpersistens och projektets byggagentkonfiguration läggs i nya CLI-skapade migrationer. Redan applicerade migrationer ändras aldrig.
- Befintlig previewkomponent och säkerhetsmodell behålls; layout och samtalsyta anpassas.
- En avgränsad anslutningsmodell läser tillgänglig status och guidenavigering. Varje framtida köradapter tillkommer explicit; nya writevägar göms inte i läsverktyg.

En efterföljande implementationsplan för A måste specificera schema/RPC, integrationspunkter och migreringsordning före produktkod. B och C får egna planer för sina exekverings- och leverantörsgränser.

## Acceptans och verifiering

1. Atlas-chatten och röstingången visar samma plan och öppnar samma byggsession.
2. Agent väljs från verifierad projektkonfiguration; ingen News Hunter-default.
3. Ingen ny byggkörning utan godkänd, aktuell planrevision. Ändrad plan ogiltigförklarar äldre beslut för nya starter.
4. Ett återförsök efter förlorat startbesked skapar inte två jobb.
5. Feedback före första preview och under pågående bygge får korrekta versionbundna kvitton.
6. Text, transkription och uppläsning delar samtalskontext; micstopp stoppar inte jobbet.
7. Reload, flikbyte, återanslutning och historiska direktlänkar tappar inte sessionen eller utkast.
8. UI visar samma Omnira-färger, synlig fokusmarkering och fungerande mobilflöde.
9. Fel projekt, okänd session, stale plan och samarbetsroll utan exekveringsrätt nekas av servern.
10. Saknad anslutning, nekad åtkomst, utgången åtkomst, okänt kontrollutfall och ej implementerad adapter visas som olika tillstånd.
11. Guider leder till rätt verifierat projekt/miljö och ger OS-kompatibla kommandon. Ingen fejkad ”nyckelgenerator” för tjänstetokens.
12. Hemligheter förekommer inte i chattdata, modellinput, URLs, preview, export, Git eller loggar.
13. Senaste fungerande preview kvarstår vid fel; sandbox/CSP, revisionshashar och meddelandevalidering försvagas inte.
14. Publicering och databasfunktion visas inte som färdiga innan deras separata adaptrar och verkliga kontroller passerar.

Använd meningsfulla kontrakts-/isoleringstester och browserflöden för ändrade beteenden. Genomför verklig mikrofon-, generation- och senare deploymentkontroll där en godkänd session och tjänsteåtkomst finns. Redovisa uttryckligen vilka delar som bara testats med provider-/röst-fixtures.

## Officiella guider kontrollerade 2026-10-14

- Vercel login: https://vercel.com/docs/cli/login
- Vercel link: https://vercel.com/docs/cli/link
- Vercel miljövariabler: https://vercel.com/docs/environment-variables/managing-environment-variables
- Vercel Secret/Config: https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase scoped PAT: https://supabase.com/docs/guides/platform/personal-access-tokens
- Supabase link: https://supabase.com/docs/reference/cli/supabase-link

Leverantörsguider och installerade CLI-versioner kontrolleras igen när körbara kommandon implementeras. Denna design skapar inga nycklar, tillåtelser eller leverantörsprojekt.
