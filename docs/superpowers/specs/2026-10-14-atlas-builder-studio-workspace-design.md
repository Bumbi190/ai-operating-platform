# Atlas Byggstudio 1 — arbetsyta, projektval och livscykel
Datum: 2026-10-14
Status: Fokuserad delspec från ägarens godkända studio-design, inför granskning av implementationsplan.
Överordnad spec: docs/superpowers/specs/2026-10-14-atlas-builder-studio-design.md

## Leverans
Bygg med Atlas blir en direkt menyingång på /build med chatt och preview från första öppningen. Ägaren kan skapa ett nytt projekt från sin första instruktion, öppna ett befintligt projekt, fortsätta dess konversation och arkivera/lägga i papperskorg/återställa projektet. Befintliga planer, byggkvitton, text och redigerbar röst återanvänds.

Ingen butik skapas. Inga bildjobb, desktopar eller nya providerskrivningar aktiveras i denna del. Dessa är egna leveranser; deras frånvaro syns som verklig status och rätt anslutningssteg.

## Arbetsyta
- Canonical URL /build. Valfritt project=slug, conversation=UUID och session=UUID; varje valt barn måste tillhöra det valda ägarprojektet.
- Bygg med Atlas placeras i Atlas-gruppen i vNext-menyn på dator och mobil och i kommandopaletten. Legacy använder samma route via en uttrycklig post; ingen ny färgpalett eller ändring av övriga legacy-poster.
- Dator: chatt vänster, arbetsyta höger. Arbetsytans flikar: Webbplats, Desktop, Filer, Uppgifter.
- Mobil: Chatt, Webbplats, Desktop; Filer/Uppgifter finns inom arbetsområdet. En åtkomlig composer på Chatt. Ingen horisontell sidscroll vid 390, 980 eller 1440 px.
- Tom preview visas innan första jobbet. Desktop säger att anslutningen saknas tills faktisk capability finns. Filer visar projektets verifierade artefakter; en vald lokal sökväg är inte bevis för en fil.
- Studiolägets startförslag: Beskriv din hemsida, Förbättra en befintlig sida, Använd en referens. Generella verksamhetsfrågor visas fortfarande i vanlig Atlas-chatt.
- Gamla projektbygglänkar och historiska sessioner öppnar samma arbetsyta efter ägarkontroll; vanlig /chat förblir vanlig chatt.
- Originalets Omnira-designvariabler återanvänds. Ingen automatisk byte till previewfliken när ett jobb får nytt kvitto medan användaren skriver.

## Projekt och första meddelandet
- Inget utkast skapas bara genom att öppna sidan. Första Skicka skapar projekt/konversation idempotent från en serververifierad ägare.
- Nytt projekt använder eget agent-id från mallen atlas-web-builder-v1, model claude-sonnet-4-6, config.max_tokens 6000. Ingen annan verksamhets agent-id, nyckel, budget eller mapp kopieras.
- Mallens prompt och design-skill-versioner pinnas i en enda serverägd definition; klienten kan inte välja rättigheter genom payload.
- Saknad projektbudget visas och måste konfigureras före betald körning. Projekt-/konversationsskapandet är gratis.
- Befintligt projekt väljs från ägarens projektlista. Dess inställningar och agentval bevaras. Saknad byggagent visas med rätt inställningslänk; välj inte första agenten.
- Röst transkriberas till ett redigerbart utkast före Skicka, även innan projektet finns. Befintlig captureUtterance används; det finns bara en composer och samma conversation controller efter anslutningen.
- Ett förlorat create-svar får återspelas med samma idempotencyKey. Samma nyckel med annan payload ger konflikt, inte ett andra projekt.
- Misslyckad start behåller utkastet. Bytt projekt/konversation ogiltigförklarar gamla klientresponses och gamla talutkast.

## Befintliga projektmappar
- Alla ägarens projekt kan väljas; lokal anslutning är inte ett krav för att öppna deras chatt.
- Inställningen väljer ny projektmapp från standardföräldern eller en exakt befintlig rot. Lägen: new, existing_git, existing_folder.
- Full projektmappsåtkomst registreras som ägarens avsikt. För denna del är kopplingen pending_runner, aldrig verified/local_saved.
- Befintlig rot flyttas inte och får inte kombineras med nya projektets folderName. Ändring av standardmapp flyttar inga befintliga projekt.
- Befintlig struktur bevaras. Föreslagen Atlas metadata är .atlas/; mål för planer, referenser och bilder uttrycks som relativa sökvägar. Dessa materialiseras först av leverans 3/5.
- Lokala roots lagras privat. Ett targetId eller root från klienten är ingen runneridentitet eller exekveringsrättighet.

## Arkiv och papperskorg
- Tillstånd active, archived, trashed lagras separat från projektets befintliga execution_paused.
- Arkiv/papperskorg sätter befintlig projekt-stop authority atomärt med lifecycle-ändringen och ökar lifecycle-versionen. Nya körningar vägras. Aktiva writers måste nå säkert stopp; visa Avslutar arbete tills kvitto finns.
- Återställning gör projektet active igen men återupplivar inga jobb och tar inte bort en annan paus. Visa om projektet fortfarande är pausat.
- Arkiv/papperskorg döljer från aktiv projektlista men lämnar ägarens historik läsbar och ger en tydlig återställningsvy.
- Före papperskorg visas exakt projektnamn och att lokal mapp/livesida/externa resurser bevaras. Bekräftelsen gäller den version som visas.
- Permanent radering är separat senare åtgärd med målgranskning; denna del erbjuder aldrig en permanent delete-knapp eller städar Docker/filer/providers.
- Collaborator, observer och foreign owner får inte skapa studiowrites eller ändra lifecycle. Samma 404 för främmande och obefintligt projekt.

## Data och gränser
Nya owner-rooted tabeller: website_build_studio_intents, website_build_workspace_requests, project_lifecycle. Nya klienter har bara scoped SELECT; mutationer går genom serververifierad principal och service_role-only RPC. JSONB anpassas vid servergränsen tills kanoniska DB-typer regenererats.

Workspace-request är en begäran. En framtida broker behöver göra rot-/junction-/repo-/identitetskontroll och skriva ett separat kvitto. UI får inte uppgradera begäran till capability själv.
Följ befintliga plan-/beslut-/worker-fences och stop authority. Ingen tillämpad migration ändras.
Inga privata ägar-, device-, agent- eller projektspecifika värden från produktionskontot hårdkodas i repo/test.

## Acceptans
- Meny och kommandopalett når /build; ingen Starta Atlas-chatt-mellansida.
- Nytt, befintligt, historiskt och ej anslutet projekt fungerar på 390/980/1440 px med en composer.
- Förlorat create-svar ger samma projekt/konversation; agent/budget från annat projekt kan inte ärvas.
- Foreign project/session/conversation och observer-writes vägras innan admin-/providerdata läses.
- Befintlig rot visas som begärd, inte som skapad, och ändrad standardförälder flyttar inget.
- Arkivrace mot verklig claim/commit stoppas med riktiga SQL-fences; återställning ger ingen ny körningsrättighet.
- Fel läsning/anslutning/skapande är synlig, utkast finns kvar och gamla responses kan inte läcka in efter projektbyte.
