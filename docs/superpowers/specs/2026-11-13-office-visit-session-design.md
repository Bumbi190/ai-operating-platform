# Office-besök med tillfällig läsåtkomst
Status: designförslag för lokal utveckling, 13 november 2026. Ingen behörighet är skapad eller aktiverad.
Bas: befintlig Office-gren/PR634, HEAD80bbe170ffe6a0e1ba742fc02af727e59d6ea273.

## 1. Mål och beslut
André har valt att anslutningen ska följa kontorsbesöket: fortsätta när webbläsaren döljs eller stängs och avslutas när Office stängs. Projektens självständiga arbetsflöden påverkas inte av Office-fönstret.
Första versionen omfattar en uttryckligen vald Familje-Pling, ett ägt projekt och en registrerad agent. Den visar namn och verifierad identitet; arbetsstatus är fortsatt okänd. Röst, modellkörning, arbetsflödesstart, datorstyrning och fler figurer ingår inte i denna ändring.
Implementatörens föreslagna skyddsgränser: högst fyra timmar per besök, 30sekunders serverlease, oförändrad20sekunders native-statusgiltighet. En gräns som löper ut kräver nytt uttryckligt besök; den förlängs inte automatiskt bortom maxtiden.

## 2. Alternativ och vald riktning
Vald produktinriktning: en tillfällig Office-koppling medan det godkända spelet är öppet. En ständig bakgrundstjänst är bortvald av André.
Browserpollning ensam uppfyller inte målet: sidan kan frysas/stängas. Att ta bort hide-stop eller förlänga statusens20sekunder löser inte detta.
Att kopiera Omnira-cookies/refresh-token till Python eller återanvända breda social-/kodbrokercredentials skulle ge fel behörighet. Befintliga NovaPR631 är fortfarande browsermedierad och lämnas orörd.
Föreslagen teknik: en separat serverförankrad, återkallelig Office-läsgrant med en hemlighet endast i companion-processens RAM. Browsern godkänner kopplingen men behövs inte för fortsatt dataläsning. Ingen ny betald tjänst eller klientdependency föreslås; befintliga Next.js/Supabase och Pythonstandardbibliotek används.

## 3. Användarflöde och start
1. Ett uttryckligt val ”Öppna Office och anslut” startar en visit-companion på den godkända datorn. Befintlig launch-only URI omnira-office://open bevaras. En separat exakt URI omnira-office://visit föreslås för den nya funktionen, utan path/query/fragment eller caller-supplied argument.
2. Companion verifierar den sparade native-mottagaren och tar exklusiv writerlease innan någon listener/browser öppnas. Den startar eller återanvänder endast det exakta Office-spelet genom befintlig launcher och låser en verifierad processidentitet.
3. Companion öppnar den separata skyddade Office-sidan. Ägaren loggar in där och väljer projekt/agent/figur samt knappen ”Anslut för kontorsbesöket”. Texten anger läsomfattning, stängd-browserbeteende och fyra timmars maxgräns.
4. Först när servergranten och första native-läsningen är verifierade visas ”Office är anslutet – du kan stänga sidan”. Att en browser öppnats eller ett spel startats är aldrig ett anslutningsbevis.
5. Explicit Koppla från eller Ctrl+C/stäng companion avslutar anslutningen, även om spelet lämnas öppet. Office-processens slut avslutar companion. Inga andra program eller arbetsflöden stoppas.

Ny URI kräver granskad uppdatering av den befintliga HKCU-installationen med dess owner-/command-/hashkontroller. Ingen installation/registrering görs under lokal utveckling. Companion kan testas via explicit CLI innan URI-steget installeras. Ny startare kopieras som en fast, granskad moduluppsättning till egen installationsmapp; inga caller-paths eller fria kommandon. Ingen autostart/OS-tjänst och ingen ändring i aktiv Nova Desktop.

## 4. Behörighet och hemligheter
Companion skapar visitId (slumpmässig UUID) och32slumpbyte S med kryptografisk RNG. S används endast av den native HTTPS-klienten och finns bara i dess minne. Browsern får SHA-256(S), visitId och lokal sessionsmetadata genom autentiserad loopback, aldrig S.
Det befintliga lokala parningsnyckelmaterialet för browser→companion är separat från S. Det behåller exactHost/Origin,256bitars nyckel, fragment-scrub, minneslagring och inga logs/storage/querycredentials.
Den inloggade browsern skickar visitId, digest och det uttryckliga valet till serverns create-route. Servern hämtar ägar-id och verifierad auth-session från sin egen autentisering, aldrig från requestbody. getUser och verifierade JWT-claims måste avse samma användare/session; auth-sessionens id och ägarrelation verifieras i databasen.
Servern lagrar endast digest, visitId, owner_id, auth_session_id, projekt/agent/figur, creation/expiry/lease/revocationmetadata. Inga cookies, lösenord, JWT/refresh-token eller service-rolehemligheter lagras i granttabellen. S skickas endast i egen auth-header över exakt tillåten HTTPS-origin och godtas bara av dedikerade Office-routes.
En grant får inte vara allmän Omnira-API-nyckel eller godtas av Campus-, chat-, workflow- eller device-control-routes. Sourceetiketter är inte credentials.
Ny grant till samma ägare/figur ersätter atomiskt tidigare sådan grant. Claim/visitId kan inte återanvändas för ny scope eller livstid. Max fem create-försök per fem minuter och högst100behållna metadata-rader per ägare; gammal utgången metadata rensas avgränsat vid nästa skapande, ingen ny cron.

## 5. Serverkontrakt och datalager
Föreslagna fasta routes:
- POST /api/atlas/office/visits: cookie-auth, exakt same-origin/CSRF-kontroll, bounded striktbody, endast valda UUID/digest. Returnerar offentlig bekräftelse, inga logincredentials.
- POST /api/atlas/office/visits/presence: endast dedikerad visit-header och visitId, inga cookie/API-keyalternativ. Validerar granten och förnyar bara dess korta lease inom absolutdeadline. Returnerar endast vald identitet.
- POST /api/atlas/office/visits/revoke: credential-scope för native eller separat verifierad owner-cookieväg medCSRF. Återkallar endast den aktuella owner/visit-kopplingen. Browserägaren får aldrig identifiera sig genom owner_id i body.

Agentdata är read-only. Att skapa/förnya/återkalla egen anslutningsmetadata är avsiktliga sessionsskrivningar, inte arbetsflödesåtgärder.
Föreslagen privat granttabell i ett eget, ej Data-API-exponerat schema. RLS på som försvar; ingen direkt anon/authenticated-tabellåtkomst. API-servern använder befintlig servercredential, inte en ny lokalnyckel.
Atomiska, snäva SQL-operationer för create, presence/lease och revoke: public SECURITY INVOKER RPC-wrappers till privata funktioner där privilegierad läsning av auth.sessions krävs. Privata SECURITY DEFINER-funktioner får tom/search_pathlåst kvalificering, inga caller-controlled identifierare och EXECUTE endast till service_role; uttryckligt REVOKE från PUBLIC/anon/authenticated. Privata och publika funktionsrättigheter och katalogexponering måste testas, inte antas.
Vid create och varje presence-anrop kontrolleras:
- grantens digest/visitId, aktiv status, lease och absolutexpiry,
- motsvarande auth.sessions-rad med både sessionid och ownerid,
- aktuell projektowner enligt befintlig getAllowedProjectIds-semantik,
- aktuell agent.project_id inom just det projektet.
Ingen fallback till annan användare/projekt eller alla projekt på tom/trasig scope. Utloggning som accepterats av Supabase-servern tar bort authsessionen och stoppar kommande läsningar. Browserstängning tar inte bort sessionen. Detta följer Supabase dokumenterade session_id-kontroll, inte enbart JWT-exp.
SQL återger en tidsstämplad minimal vald identitetsrad. Servern kan återanvända befintliga rena DTO-projektorer efter grantkontrollen, men exponerar inga descriptions, modeller, prompts, portfolio, run-id eller kommandon. executionEvidence förblir unavailable, stepEvidence=false och work_verified=false.
Den befintliga PresenceReceiver-valideringen och nativeprojektionens20sekundersregel bevaras. Ett nytt delegated transport grant ger inte i sig körbevis.

## 6. Processlås och native-livscykel
Companion väljer endast matching_office/default_target med exakt engine/project/map/allowlistade game-flaggor. Identiteten hålls genom ett OS-processhandle och verifierad creation/executable identity, inte enbart PID eller fönstertitel. PID-återanvändning, enumeratefel, fel projekt, editor/commandlet eller saknad process stoppar flödet.
Monitor kontrollerar levande process minst var250ms; nativepool startar inte innan verifierat gamehandle finns. En legitim spelstart får högst90sekunder att ge en verifierbar process. Ingen servergrant skapas före giltig processidentitet.
Samma writerlease som idag hindrar två companions/legacybryggor att skriva samtidigt. Ingen blind takeover eller start av flera spel.
Native hämtar ett enda snapshot åt gången, åtta sekunder efter föregående slutförande, med fem sekunders nätverksgräns. Redirects avvisas, TLSvalideras, requestorigin/path är fast och inte caller-supplied. Inga hemligheter/rawDTOs i diagnostics.
Serverlease förnyas till min(absolutexpiry, databasnu+30sekunder) endast medan den tidigare leasen fortfarande är giltig. Utgången/revokerad/ersatt grant kan inte återupplivas genom heartbeat.
Vid fel, nekad scope eller gammal källa visas okänd status. Native får inte fabricera nytt generatedAt för gamla data. Normal stop rensar projektionen och försöker serverrevoke med begränsad väntan; nätfel lämnar inga fortsatta pollförsök och kvarvarande serverlease dör inom30sekunder. Den sparade Unreal-mottagaren släcker gammal positiv identitet senast enligt sin befintliga20sekundersdeadline även om companion dör.

## 7. Lokal transport och kompatibilitet
Ett explicit visit-protokoll skiljs från legacyprotocol1. Legacy --pair, launch-only URI och hidden-stop fortsätter oförändrade. Visitmode har bara status, attach och disconnect som fasta lokala routes; ingen browser /snapshot eller /bind får konkurrera med native HTTPS-publishern.
attach innehåller visitId och valt scope, inte hemlighetenS eller godtycklig URL. Native godtar inget positivt tillstånd förrän HTTPSsvaret från servern matchar både visitId och samtliga valda ids och aktuella deadlines.
Browsern håller kvar nuvarande fail-closed unmount/hide-beteende i legacy och pending-läge. Efter att Officevisit uttryckligen godkänts och nativekvitterats äger companion dess livscykel: pagehide stänger då enbart browsersidan, inte granten. Explicit Koppla från återkallar ändå aktuell visit.
Den som bygger avgör minsta kodextraktion för att återanvända strikta HTTP-gränskontroller utan att ge legacy nya aktiva routes eller acceptera två publishers. Allt måste fortsatt testas genom riktiga HTTP-/filsystemgränser.

## 8. Acceptanskriterier
- Utan verifierad ägare, giltigt spelhandle, korrekt nativeinstallation eller uttryckligt val skapas ingen användbar grant.
- Felprojekt/agent/owner/session, CSRF, annan Origin/Host, stulen digest utanS, dubbelclaim och felheader/route nekas.
- Andra API:er accepterar aldrig visitcredential. Legacyloopback kan inte skriva visitdata. Ingen credential syns i URL/query/storage/logs/JSONprojektion.
- Browser kan stängas efter bekräftad attach; faktisk verifierad identitet fortsätter uppdateras i den vanliga Office-vyn under kontrollerat besök.
- Close/restart/PIDreuse av spelet och Ctrl+C/normal processdöd ger okänd nativeidentitet; inga request görs efter observerad exit. Serverlease/absolutgräns/revoke gäller också vid lås, klockförskjutning, replay, nätfel och suspend/resume.
- Accepterad serverutloggning, raderad authsession och ändrad projektowner/agentflytt stoppar nya positiva frames.
- Max en vald identitet och fasta begränsade läspayloads; ingen modell/workflow/röst/externalmessage.
- Befintliga74Pythonregressioner, Officeweb-/middlewaretester och relevanta isolationstester förblir godkända. Nya server/SQL/HTTP/native-livscykeltester måste visa de negativa gränserna, inte bara mockad happy-path.
- Äkta ägaracceptans på skyddad testmiljö och spel stängd browser verifieras separat efter godkänd release; syntetiska tester märks uttryckligen som sådana.

## 9. Utvecklings- och releasegräns
Detta är en större ändring än senaste fillåsrättningen: ny snäv serverbehörighet och privat metadata behövs. Först lokal kod och fristående, disponibla PostgreSQL-fixturer med syntetiska sessioner; ingen produktionsdatabas, befintlig delad testcontainer eller aktiv Nova/Harvey-worktree ändras.
En ny SQL-fil ska skapas med den installerade Supabase CLI:ns dokumenterade migration-new-kommando vid implementation, efter --version/--helpkontroll, inte med påhittat migreringsnamn. Inga dependencies installeras blint.
Migration Guard får inte försvagas eller kringgås. En framtida hostedpreview kan kräva separat godkänd schemaaktivering i rätt miljö innan det ordinarie bygget kan passera. Ingen produktionsschemaändring, push/deploy eller install av det utökade URI-handlaret görs genom att design/lokal utveckling godkänns.
Använd befintlig Office-gren efter färskpreflight. Designen hålls lokal tills granskad; commit/push föreslås med exakt färdigt scope efter tester. Behåll PR634 Draft och alla parallella arbetskopior. Nuvarande godkända Unreal-karta och riggar/material ändras inte.

## 10. Underlag och kvarvarande byggarval
Aktuellt källäge: OfficeConnectionPanel/connection.ts/office_pairing/office_relay/office_presence/office_launcher; Campus identityroutes och lib/os/organisation.ts/atlas/isolation.ts. Canonical MI22.62: smal pairing och återkallelse.
Supabase https://supabase.com/docs/guides/auth/sessions beskriver session_id och kontroll mot auth.sessions för avslutad inloggning. Changelog kontrollerad13nov: CLIv3/TLSändringar ska beaktas om verktyg behövs; ingen uppgradering föreslås här.
https://developer.chrome.com/docs/web-platform/page-lifecycle-api och https://developer.chrome.com/blog/timer-throttling-in-chrome-88/ beskriver bakgrundsbegränsningen.
Byggaren väljer filuppdelning, test-fixturverktyg och minsta UIstruktur inom dessa gränser. Exakt pinned Supabaseklients stöd för verifierade claims och authsessions SQLrättigheter måste kontrolleras i lokal fixture innan produktionsförslag. Ingen återanvändning av produktionsJWT eller riktiga authsessions i lokala tester.


## Implementationsprecisering efter granskning
OS-handle/nativeinstallation verifieras av den betrodda lokala companionen. Servern attesterar inte datorns OS-process. En redan inloggad ägare kan skapa en egen snäv läsgrant för sitt eget projekt utan companionen; annan ägares data tillåts aldrig. En serverattesterad dator skulle kräva separat enrollment/design och ingår inte här. UUIDv7 används med30sekunders skapandefönster för att kombinera begränsad metadatalagring och skydd mot återanvändning av gamla ids. Attach är provisorisk i15sekunder tills browsern läst nativekvittot och bekräftat samma scope.
