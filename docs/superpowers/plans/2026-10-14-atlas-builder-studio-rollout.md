# Atlas Byggstudio — genomförandeordning
Datum: 2026-10-14
Godkänd målbild: docs/superpowers/specs/2026-10-14-atlas-builder-studio-design.md
Utförande: Native, enligt tidigare val.

## Din precisering är inarbetad
Vi bygger den generella byggstudion. Kaffekokaren/dropshipping var ett exempel på vad Atlas senare ska kunna göra, inte en butik som ska byggas nu. Stripe är förvalt först när ett projekt behöver betalningar.

Befintliga projekt ingår i målbilden. Atlas ska kunna inventera, läsa och ändra hela deras anslutna projektmappar, använda befintliga bilder och planer, visa preview, testa och uppdatera den verkliga sidan. Projekten behåller sitt ramverk och sin struktur. Standardmappen används för nya projekt, utan att flytta de gamla.

## Vad som redan är publicerat
Leverans A/PR #341 har planering i Atlas-konversationen, exakt plangodkännande, statisk preview, feedback och strukturerad projektexport. Den nya studion, bildbilagor/GPT Image 2, stationärens desktop och körbara specialistagenter är ännu inte publicerade.

## Leveranser
| Del | Användbart resultat | Bevis innan den kallas klar |
| --- | --- | --- |
| 1. Arbetsyta och projektlivscykel | Bygg med Atlas i menyn öppnar chatt + preview direkt. Nya och befintliga projekt, arkiv/papperskorg/återställning. | Riktiga komponenter i browser; atomärt projekt/agent/konversationsskapande; ägarskap och lifecycle-race mot SQL-worker. |
| 2. Referenser och GPT Image 2 | Bifoga bilder som Atlas verkligen kan se; genererade bilder visas i samma chatt och sparas privat i rätt projekt. | Faktiska bildinputs/bytes, gpt-image-2, kostnadsreservation + settlement och separata cloud/local-kvitton. |
| 3. Stationärens runner och desktop | En egen isolerad Linux-desktop på stationären, filer/terminal/browser och riktig webbapp-preview i Omnira. | Verifierad Windows-identitet/rot; faktisk datorbild; demo med serverdata via autentiserad relay; offline/stop/återstart. |
| 4. Specialistjobb och oberoende granskning | Atlas fördelar verkliga jobb, tar emot ändringar under arbetet och presenterar testat resultat efter separat agentgranskning. | Child-job- och kostnadsbevis; konfliktsäker staging; reviewer granskar exakt hash och stoppar avsiktligt fel. |
| 5. Underhåll och uppdatering av befintliga sidor | Kopplade git-repon och vanliga mappar kan förbättras och deras livesidor uppdateras via rätt mål. | Bevarade ägarändringar; konflikt-/återställningsprov; testad preview; faktisk commit/artifact/deployment i rätt projekt. |

Del 1 har en färdig fokuserad implementationsplan:
- Spec: docs/superpowers/specs/2026-10-14-atlas-builder-studio-workspace-design.md
- Plan: docs/superpowers/plans/2026-10-14-atlas-builder-studio-workspace.md

Del 2–5 är avgränsade arbetsområden nedan. Deras exakta implementationsplaner skrivs mot respektive granskad kodgräns; denna ordning är inte ett påstående att de redan är implementerade eller testade. Del 1 kan publiceras och användas självständigt med den redan fungerande statiska byggmotorn.

## Del 2 — bildkonversation
Återanvänd lib/media/asset/ för AssetId, proveniens, hash, projektisolation och privata referenser. Nya gränser: lib/atlas/conversation/attachments/ och lib/website-build/assets/; separat gpt-image-2-adapter, modellregister och cost/spend-ceiling.

Bifogningar: PNG/JPEG/WebP, högst 4 bilder/meddelande och 10 MiB/bild; verkliga bytes/dimensioner/pixelgräns, EXIF-rensad modell/webbversion. Referensens AssetId följer chatt, multimodalt modellinput och genereringsjobb. En publikt gissad URL ger ingen bildåtkomst.

Betalda bildjobb behöver en verifierad hård kostnadsgräns för vald input/antal/format/storlek/kvalitet, projektbudget och riktig usage-settlement. En ungefärlig prislista får inte låsa upp det gamla nekade spendflödet. Saknad kontomodell/nyckel/budget förklaras med rätt anslutning.

Bilden sparas först i privat projektlagring. Runnern materialiserar sedan assets/images/references/ eller assets/images/generated/ med checksumma och lokalt kvitto. Befintligt projekt kan ha ett annat verifierat relativt bildmål.

## Del 3 — lokal exekvering
Återanvänd identitets-/claim-/fence-principer från apps/code-broker, men skapa separat website-build-execution-v1. Nuvarande macOS-nyckel och probe-only substrat är inte en färdig Windows-worker. Det hårdkodade gamla Omnira/Mac-reporegistret får inte utökas till allmän maskinåtkomst.

Workspace-request från del 1 är bara avsikten. Brokern producerar separat bevis för owner/project/request/generation, canonical rot, junction/reparse-kontroll, repoidentitet och faktisk tillgänglighet. Full läs/skriv för projektet sker inom verifierad rot; ingen personlig hemkatalog/Docker socket/andra projekt monteras i containern.

Pinnad Linux-desktop, initial 2-vCPU/2-GiB-profil, en desktop och ett tungt bygge samtidigt. Resursbrist ger väntan och hjälp; befintliga containrar eller globala WSL-gränser ändras inte. Utgående signerad HTTPS för jobb/heartbeat/artifacts; privata faktiska JPEG-frames högst 2/s när behörig tittare är aktiv.

Frames bär project/session/job/generation/frameId/capturedAt. Webbplats-preview behöver en separat projektbunden HTTP-relay till appens verkliga port och server; frames ensamma räcker inte. Ingen publikt oskyddad VNC-port eller godtycklig LAN-proxy.

## Del 4 — delegering
Ny gräns lib/atlas/delegation/workforce/. Executive→Manager finns som kontrakt; körbara specialistverktyg, child jobs och reviewer måste bevisas separat.

Roller: arkitekt, frontend/design, backend/integration, bild/content, test/QA, oberoende reviewer. Två specialistmodelljobb i parallell som högst; en lokal tung körning. Barnet ärver exakt projekt/plan/hash/generation, fil-/verktygsuppgift och budget; det kan inte ge sig självt större rättigheter.

Writers arbetar separat och Atlas integrerar resultat. Granskaren har annan identitet, är read-only och granskar exakt integrerad tree/artifact-hash. Förändrad version ogiltigförklarar review. Högst två reparationsomgångar före konkret fråga till användaren.

Chattinstruktioner får hållbara kvitton även medan jobbet pågår. Gamla jobb/resultat fences bort efter ersättande instruktion eller Stoppa. Atlas frågar om avgörande okända saker och fortsätter självständigt med det som kan göras inom godkänd plan.

## Del 5 — befintliga projekt
Ny gräns lib/website-build/maintenance/ tillsammans med broker workspace-binding/snapshot/apply. Full mappåtkomst omfattar källor, konfiguration, befintliga bilder och övrigt projektmaterial. Nycklar används genom skyddad runtime-injektion och skickas inte till modellen.

Git: pinnad bas + snapshot av relevanta ocommittade ägarändringar till isolerad worktree. Vanlig mapp: stagingkopia med filhashmanifest. Bevara ramverk/start/testkommandon, inga framtvingade src/-flyttar. Atlas-material samlas i projektets valda relativa mappar och .atlas/-metadata.

Efter test/preview och oberoende review jämförs originalets aktuella hash med snapshoten. Konflictingrepp stoppar berörda writes och förklaras. Applicering har journal och återställningskvitto; inget reset/force eller tyst överskrivning av nyare ägarändringar.

Uppdatering av livesidan går genom projektets verkliga repo/provider och normal PR/CI/release. Lokalt ändrad fil är inte ett deploykvitto. Kopplingar till Vercel/Supabase visas med enkla rätta länkar och verifierat mål. Domäner kollas först hos Strato; Stripe tas fram om den godkända uppgiften behöver betalningar.

## Slutlig användargranskning
Atlas visar fungerande preview, vad som ändrats, verifierade tester, separat agentgranskning, kostnad och eventuella anslutningshinder. Ägaren kan ge fler instruktioner i samma chatt. Färdig-status kräver det verkliga resultatet för den aktuella versionen, inte endast en plan eller ett UI.

## Kontrollerad övergång
Samma Native-metod och befintliga rena worktree används. Varje implementation börjar med sin konkreta skrivna plan och slutar med riktiga kontroller och en slutgranskare. Del 1 är nästa föreslagna implementation. Ingen butik, domänbeställning eller permanent projektradering ingår i denna planering.
