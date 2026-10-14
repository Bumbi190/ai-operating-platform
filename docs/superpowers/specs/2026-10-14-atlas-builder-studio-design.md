# Atlas Byggstudio — design för granskning
Datum: 2026-10-14
Status: Förslag inför implementation. Föregående leverans A är publicerad; funktionerna nedan är nästa utbyggnad.
Bas: Omnira main efter PR #341, commit 910376b2eb485f136e1b36073f08e7788f0be2d6.

## Målet
André ska kunna öppna Bygg med Atlas i menyn, bifoga en produktbild eller annan referens och samtala med Atlas medan en riktig hemsida eller butik byggs. Arbetsytan visar webbplatsen, Atlas separata desktop och verkliga uppgifter hos specialistagenter. Atlas driver arbetet framåt, frågar när en uppgift saknar avgörande information och låter en oberoende agent granska resultatet före människans slutgranskning. Stripe är standard för betalningar. Domäner söks först hos Strato och köps via ägarens konto.

Alla källfiler, referenser, genererade bilder, planer, tester och granskningar tillhör ett och samma projekt med en vald standardmapp. Dåliga eller övergivna projekt ska kunna arkiveras eller läggas i papperskorgen utan att andra projekt eller externa resurser förstörs.

## Vad inventeringen faktiskt visar
- Den publicerade leveransen har gemensam text/röstkonversation, versionsplaner, exakt godkännande, statisk preview, feedback och strukturerad ZIP.
- Startsidan öppnar en vanlig tom konversation med generella verksamhetsfrågor. Preview saknas innan ett byggkvitto finns.
- Atlas-chattens transport är textbaserad; referensbilder är inte ett färdigt chattflöde.
- Ingen färdig användaråtgärd för projektarkivering/radering hittades i de granskade projektvyerna/API:erna.
- Asset-kontraktet har projektbundet AssetId, privata resurser, proveniens, hash och referensbilder. Detta återanvänds.
- Delegeringskontraktet stöder Executive till Manager. Workforce-steget och körbara specialistverktyg är inte därmed aktiverade.
- Verktygsavailability för missioner vägrar fortfarande anta att körbara verktyg eller skrivrättigheter finns.
- Kodbrokern har macOS-nyckelhantering. Isoleringssubstratet är inte en integrerad Windows-webbworker.
- Det gamla kodarbetskontraktet förbjuder godtycklig shell, nätverk, credential.access och deployment. Dessa förbud får inte tas bort för att få byggstudion att fungera.
- Omniras gamla GPT Image 1-väg nekas före debitering eftersom den saknar bevisad kostnadsgräns. GPT Image 2 kräver en egen korrekt adapter och prissättning.
- Målstationären kör Windows Home och Docker med Linux-containrar. Den har 16 GB RAM och var belastad vid inventeringen. En desktop måste ha resursgräns och får inte stoppa andra projektmiljöer.

## Vald riktning och alternativ
Rekommendation: behåll Omnira som kontrollplan och kör projektets separata Linux-desktop i Docker på stationären. En Windows-broker ansvarar för verifierad identitet, projektmapp, jobb, filer och verkliga kvitton. Desktopens webbläsare och terminal syns i Omnira.
Alternativ 2: separat Windows-VM. Mer Windows-lik miljö men större minnes- och installationsbehov; inte förstavalet på denna stationär.
Alternativ 3: molndesktop. Kan avlasta stationären och fungera när datorn är avstängd, men behöver vald tjänst och budget. Aktiveras inte som en dold reserv.

Det är en projektarbetsmiljö med ett eget grafiskt Linux-skrivbord, inte en extra Windows-användarsession. Atlas får ingen åtkomst till ägarens vanliga personliga desktop som en följd av detta val.

## Arbetsytan
- Lägg Bygg med Atlas i gemensam meny och kommandopalett. Canonical route: /build.
- Vid öppning visas chatt och ett previewområde direkt, även före första bygget. Ingen separat startsida med Starta Atlas-chatt.
- Desktop: chatt till vänster; arbetsområde till höger med Webbplats, Desktop, Filer och Uppgifter. Originalets Omnira-färger behålls.
- Mobil: flikar Chatt, Webbplats och Desktop; Filer/Uppgifter nås inom arbetsområdet. Composer ska alltid gå att nå.
- Tomt läge visar relevanta förslag: bifoga produktbild, beskriv en hemsida, använd en referens. De generella verksamhetsfrågorna visas inte här.
- Projektväljaren erbjuder Nytt projekt och ägarens befintliga byggprojekt. En gammal projektkonversation blir inte automatiskt en annan butik.
- Första meddelandet kan skapa ett nytt utkastprojekt och dess konversation idempotent. Namnet går att ändra.
- Ett nytt byggprojekt använder en versionsbunden godkänd webbbyggarmall med projektets egna agentidentiteter. Visa vald roll/modell och fråga om budget som saknas; välj aldrig första agenten eller kopiera ett annat projekts agent-id.
- Tidigare projektspecifika bygglänkar och historiska sessioner öppnar samma arbetsyta efter befintlig ägarkontroll.
- Webbplatsfliken är den verkliga webbappens preview. Desktopfliken visar Atlas faktiska desktop, webbläsare och terminal; dessa två vyer ska inte förväxlas.
- Offline, väntande anslutning, senaste bildtid och aktiv uppgift visas begripligt. Ingen simulerad mus eller påhittad agentaktivitet.

## Bifogade bilder och genererade bilder
- Bifoga via knapp, drag/drop på dator och mobilens bildväljare. Första versionen: PNG, JPEG och WebP; högst 4 bilder per meddelande och 10 MiB per bild.
- Kontrollera faktiska bildbytes, dimensioner och maximal pixelmängd; filändelse och klientens MIME är inte tillräckliga. EXIF tas bort från modell-/webbversionen.
- Varje bild får ett AssetId, checksumma, proveniens och projektkoppling. Originalfilens namn blir aldrig en godtycklig skrivsökväg.
- Referenser visas som thumbnails i chatten och används som riktiga bildinputs hos en verifierat bildkapabel modell. Kontexten lagrar assetreferenser, inte permanenta publika URL:er.
- Ingen generering startas förrän ett projekt är valt/skapat och referensernas ägare/projekt verifierats.
- Använd GPT Image 2, model-id gpt-image-2; byt inte till en annan bildmodell utan uttryckligt val.
- Ett hållbart bakgrundsjobb genererar eller redigerar bilden och återkommer i samma konversation med själva bilden, inte bara en länktext.
- Modellen registreras i modellval, adapter, användningsmätning och prisbok. Befintlig budget-/spendkontroll kringgås inte.
- Pinna antal, format, storlek och kvalitet; använd aktuella officiella tokenpriser, en granskad konservativ input-/outputgräns och riktig usage-settlement. En prisuppskattning är inte en hård debiteringsgräns.
- Starta inte ett betalt bildjobb om den begärda konfigurationen inte kan få en bevisad kostnadsreservation. Visa vad som behöver åtgärdas.
- Provade API-anrop måste särskiljas från doubles. Ingen åtkomst till GPT Image 2 på det aktuella kontot är ännu verifierad.
- Bilder sparas privat under projektet och materialiseras i dess lokala mapp av runnern. Cloud saved och Local saved är två separata verifierade tillstånd.
- Om datorn är offline kan bilden finnas sparad i projektets privata lagring och vänta på lokal synkning; UI får inte säga att en lokal fil redan finns.

## Projektmapp
Standardmappen anges i befintliga bygginställningar och binds till en verifierad runner. Det exakta valet används för nya projekt; ändringar flyttar inte gamla projekt tyst.
Projektroten får följande struktur:
- src/ — appkällor
- assets/images/references/ — inskickade bildreferenser
- assets/images/generated/ — Atlas genererade bilder
- assets/media/ — övriga media
- plans/ — brief, arkitektur och arbetsuppdelning
- reviews/ — oberoende granskning och åtgärdade fynd
- tests/ — rapporter och utvalda testbilder
- previews/ — versionsbundna previewartefakter
- project.json — identiteter, relativsökvägar, hashar och materialiseringskvitton

Runnern verifierar Windows-roten, junctions/reparse points och relativsökvägar innan varje write. Desktopen monterar endast det aktuella projektets arbetsmapp. Äldre externa git-repon kan kopplas explicit och arbetar i en isolerad worktree; de ändras inte genom ett generellt Nytt projekt-flöde.
Ny projektkoppling och genererade tillgångar får inte ärva The Prompts agent, konton eller mappar utan ett explicit projektspecifikt val.

## Egen desktop på stationären
- Windows-brokern får OS-stött skydd av sin privata identitet. macOS Secure Enclave/Keychain räknas inte som Windows-stöd.
- En verifierad website-build-execution-v1 capability skiljs från det äldre kodarbetskontraktet. Inga generella shell-/deploymentförbud öppnas globalt.
- Första runtime: låst Docker-image med Chromium, terminal, Node/toolchain och ett grafiskt Linux-skrivbord; image och beroendeversioner pinnas.
- Ingen Docker socket, hemkatalog eller andra projekt monteras in i agentens container. Inget privileged-läge.
- En aktiv desktop åt gången och ett tungt lokalt bygge åt gången. Agenternas modelljobb kan vara parallella utan att skapa flera desktopar.
- Tillåtna dependencies, researchdomäner och kommandon binds till jobbets rättigheter. Paketinstallation, browser research och providerskrivningar är olika operationer.
- Worker använder utgående HTTPS för claim, heartbeat och kvitton. Desktop blir inte en oskyddad publik VNC-port.
- Första datorvyn använder faktiska JPEG-skärmbilder upp till 2 per sekund när en behörig tittare är aktiv. Det är en live-bildserie, inte ett löfte om videoström med hög bildfrekvens.
- Varje bild bär projectId, sessionId, jobId, generation, monotont frameId och capturedAt. Försenade bilder från gamla jobb får aldrig visas som den nya desktopen.
- Skärmbilder ligger i privat tillfällig lagring, hämtas med kortlivad behörighet och begränsad historik. Stale/offline visas tydligt.
- Handinmatning av hemligheter sker i en särskild skyddad överlämning; råa nycklar hamnar inte i chatt, agentprompt, logg, granskningsbild eller export.
- Före start mäts resurser. Börja med en 2-vCPU/2-GiB-profil; ta inte över befintliga Docker/WSL-gränser. Otillräckligt minne innebär väntande jobb och konkret hjälp, inte att andra projekt stängs.
- Avstängd dator innebär paus/väntan. Ingen molntjänst startas eller köps automatiskt.

## Kommunikation mellan app, desktop och filer
- Kontrollen ligger i Omnira. En hållbar kö skiljer chattens snabba kvitto från lång körning på stationären.
- Varje worker-anrop autentiseras mot verifierad identitet och exakt projekt/jobbgeneration; lokala folder paths eller annonserad online-status ger ingen rättighet.
- Tillfälliga bilder och appartefakter passerar en projektbunden privat lagringsgräns med kvitto och checksumma. Vercel behöver ingen direkt inkommande anslutning till Windows.
- Desktopvyn hämtar de senaste behöriga bildkvittorna. Previewartefakter och även appens interaktiva requests behöver en egen autentiserad, projektbunden relay till runtime; en bildserie bevisar inte att en fullstack-app fungerar.
- Runtime-relayn har en tillåten port, begäransmetoder, payloadgränser, miljö och tidsgräns per jobb. Den accepterar inte godtyckliga värdnamn eller öppnar datorns LAN.
- Första end-to-end-beviset görs med ett verkligt lokalt demoformulär och serverdata på stationären samt Android-vyn, innan remote preview blir en annonserad capability.

## Delegering och oberoende granskning
Atlas är samordnare. En versionerad arbetsplan innehåller verkliga child jobs med dessa roller:
1. Arkitekt — komponenter, datamodell, kopplingar och krav.
2. Webbdesign/frontend — layout, responsivitet, navigering och tillgänglighet.
3. Backend/commerce — katalog, orders, kontoanslutningar och Stripe.
4. Bild/content — referensanvändning, GPT Image 2 och produkttext med källor.
5. Test/QA — verkliga funktioner, mobil, felvägar och integrationer.
6. Granskare — självständig kontroll av exakt sammansatt version.

Återanvänd styrning, projektisolation, kostnadsbok och beviskrav. Executive till Manager-delegering får inte påstås vara ett körbart workforce-system. Workforce får egna explicita barnkontrakt och implementerade capabilitybevis.
Varje child job har projekt, föräldrajobb, planversion/hash, roll, filer, uppgift, tillåtna verktyg, budget och slutkriterier. Barnet kan inte utöka rättigheter eller godkänna publicering.
Maximalt 2 specialistjobb i parallell första versionen. Ingen rekursiv oändlig delegering. Arkitekt och granskare kan vara sekventiella.
Varje skrivande specialist arbetar i egen stagingyta/worktree. Atlas integrerar granskade resultat; flera agenter skriver inte samtidigt i samma aktiva fil.
Granskarens jobb-id/agent-id måste skilja sig från den som skrev resultatet. Den granskar read-only på exakt tree/artifact-hash och får inte själv utföra köp eller deployment.
Blockerande fynd ger en begränsad reparationsomgång med nytt testbevis och ny granskning. Efter 2 misslyckade reparationsomgångar eller nådd budget frågar Atlas användaren med sammanfattat problem.
En ändring efter godkänd granskning ogiltigförklarar det tidigare granskningskvittot för den nya versionen.
Människan får ett färdigt paket för slutgranskning: fungerande preview, vad som byggts, verifierade tester, granskning, kostnad och eventuella externa hinder.
Agentens kvalitetsgodkännande ersätter inte människans tillåtelse till livebetalningar, publicering, domänköp eller destruktiv borttagning.

## Instruktioner medan Atlas arbetar
Långa byggen och bildjobb körs asynkront så chatten kan ta emot nya meddelanden under arbetet.
En ny instruktion får ett beständigt kvitto och binds till den verkligt visade versionen. Den kan skapa en ny uppgift, ändra en kommande uppgift eller ersätta en pågående uppgift vid nästa säker kontrollpunkt.
Godtycklig text betraktas aldrig som nytt köp-/publiceringsgodkännande.
Pausa, Stoppa och Återuppta gäller child jobs också. Generation/lease/fences förhindrar att gamla resultat skriver över senare instruktioner.
Atlas frågar när en avgörande uppgift är okänd, tvetydig eller kräver ägarens val. Frågan namnger vad som saknas och visar alternativ, rätt sida/fil eller anslutningssteg.
Icke blockerade uppgifter fortsätter inom befintligt godkännande. Atlas samlar relaterade frågor; användaren ska inte behöva svara om varje färg, tangenttryckning eller fil.

## Från kaffebild till verklig butik
Produktbilden räcker för att starta: skapa projekt, analysera referensen, föreslå butik/produktpresentation, bygga responsiv UI och förbereda katalog/checkout.
Produktbilden bevisar inte leverantör, modellnummer, pris, frakt, lagersaldo eller produktens egenskaper. Atlas håller fakta, förslag och obekräftade antaganden isär och frågar om det avgörande.
Standard är egen Next.js-butik, Supabase för de delar som faktiskt kräver data och Stripe Checkout Sessions för betalningar. Andra val gäller endast om användaren säger till.
Varukorgens pris räknas server-side från verifierad katalog; klienten får inte bestämma beloppet.
Stripe-konto binds explicit till rätt ägare/projekt och miljö. Ett konto kopplat i ChatGPT är inte automatiskt en anslutning till den genererade butiken.
Utveckling och integrationstest använder separat Stripe-sandbox. Keys hålls server-side och transporteras genom den skyddade anslutningen, inte chatt.
Signerade webhooks hanterar betald och fördröjd betalning idempotent. En lyckad success-sida är inte bevis för betalning eller skapad leverantörsorder.
Order lagras med projekt-, betalnings- och leverantörsreferens. Automatisk leverantörsorder kräver en verklig integration eller verifierad rutin och korrekt leverantörsprodukt.
Om bara manuellt orderarbete finns ska Atlas säga det. En knapp Köp gör inte en butik till fungerande automatisk dropshipping.
Före verklig lansering: verifierat merchantkonto, godkänd katalog/pris, leverantörs-/fraktrutin, villkor, sandbox-orderflöde, providerkopplingar, ägargranskning och fungerande HTTPS.
Liveaktivering är en särskild exakt version/miljö. Strato först för domän, Vercel för den verifierade deploymenten om inget annat valts.

## Arkivera och ta bort projekt
- Arkivera: stoppa nya jobb, avsluta/pausa aktiva arbeten säkert, dölj från aktiv lista och behåll materialet. Återställning är enkel.
- Papperskorg: visa konsekvensen, flytta det valda Omnira-projektet ur den vanliga listan och erbjud återställning. Inga externa tjänster tas bort implicit.
- Permanenta projektdata, lokal mapp, Vercel-projekt, Supabase-projekt och Stripe-objekt är separata mål i en konsekvensvy.
- Radering av lokala filer kräver verifierad project.json/rot/ägare, stoppade writers och exakt projektval. Inga globala docker volume-/mapp-rensningar.
- Betalningshistorik och aktiva butikers order får inte försvinna genom ett generellt dåligt utkast-projekt-flöde.
- Oklart eller delat externt resursägarskap ger fråga och hjälplänk. Ta inte bort en gemensam Supabase- eller Stripe-anslutning för att ett utkast läggs i papperskorgen.
- Collaborator/observer kan inte arkivera eller radera ett bevakat ägarprojekt.

## Självständiga leveranser
| Leverans | Klar när |
| --- | --- |
| 1. Byggstudio och projektlivscykel | Meny leder direkt till chatt + preview, nya projekt/återläsning fungerar, arkivering/papperskorg/återställning bevisade. |
| 2. Referenser och GPT Image 2 | Bildbilagor fungerar som riktiga modellinputs, bildjobb mäts och sparas privat i rätt projekt med verkliga bilder i chatten. |
| 3. Windows-broker och desktop | Verifierad lokal projektmapp, browser/terminal, verklig live-bildserie, apppreview och offline/stop/återstart fungerar. |
| 4. Workforce och granskningsgrind | Specialistjobb utförs faktiskt och en annan agent granskar exakt resultat innan mänsklig slutgranskning. |
| 5. Butik och provideraktivering | Riktig testorder, signerad webhook, orderpersistens och verifierad leverantörsväg; därefter separat livepublicering. |

Varje leverans får eget fokuserat spec/implementation plan och meningsfulla tester. Befintlig Native-metod återanvänds utan ny metodmeny. Inga stora installations-/betalnings-/providerändringar görs genom att kalla en UI-prototyp färdig.

## Verifieringar som måste ingå
- Nytt projekt och uppladdningar återspelas efter förlorat svar utan dubbla projekt/tillgångar.
- Foreign asset/session/project/desktop-frame vägras; observer får inte skriva eller radera.
- Bilden blir riktig modellinput. Generering använder gpt-image-2 och ger riktiga bytes, kostnadskvitto och rätt mappkvitto.
- Stale child jobs, frames, granskningar och gamla planversioner kan inte ersätta nytt arbete.
- Bild-, ZIP- och filflöden provar traversal, Windows-junction, fel MIME, stora bilder och bortkopplad desktop.
- Datorbilden avspeglar faktiskt navigerad sida/terminal; webbappens preview har ett separat kvitto.
- Instruktion medan frontend/backend arbetar får ett kvitto och syns i nästa integrerade version.
- Granskare som inte är skrivande agent hittar ett avsiktligt bruten mobil/checkout-version och hindrar Ready for owner.
- Saknad leverantör/nyckel/behörighet ger rätt fråga och länk samtidigt som oberoende arbete kan fortsätta.
- Stripe-serverpris, signaturfel, dubbel webhook, delayed payment och misslyckad leverantörsorder ger korrekt orderstatus.
- Projektarkiv/återställning stoppar nya writes och bevarar korrekt material; permanent radering kräver rätt mål och omfattning.
- Release behåller normala skyddade PR-kontroller, budgetar och oförändrade tillämpade migrationer.

## Kodgränser för planeringen
Arbetsyta: lib/nav/registry.ts, app/(platform)/build/, AtlasBuildSurface/AtlasChatConversation och befintlig conversation controller.
Projektlivscykel: nytt lib/project/lifecycle/ med ägarskap, API, tombstone/restore och writer-kontroll.
Bilder: nytt lib/atlas/conversation/attachments/ och website-build/assets/, återanvänd lib/media/asset/ samt separat gpt-image-2-adapter och rätt cost/spend-ceiling.
Desktop: apps/code-broker med Windows identity, ny website capability/worker, projektmaterialisering och privata frame-kvitton.
Workforce: lib/atlas/delegation/workforce/ med riktiga jobbföräldrar, capabilities, specialiststaging och read-only review.
Butik: lib/website-build/commerce/ med produktbrief, serverpris, orders, sandbox/live-binding, webhooks och provideradaptrar.
Exakta migrationsnamn skapas med repositoryts faktiska CLI i respektive implementation. Ingen gammal tillämpad SQL ändras.

## Officiella källor kontrollerade 2026-10-14
- https://developers.openai.com/api/docs/models/gpt-image-2
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://docs.docker.com/desktop/features/wsl/
- https://docs.docker.com/engine/containers/resource_constraints/
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted

Källorna styr API- och runtimeval; de bevisar inte att ägarens konton, nya capabilities eller desktop är inkopplade i Omnira. Inga hemligheter eller privata maskin-/projektidentiteter ingår i detta dokument.
