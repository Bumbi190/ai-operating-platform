# Atlas lokala modeller — första leveransen
Datum: 2026-10-17
Status: designförslag för ägargranskning; ingen implementation eller aktivering.
Gren: codex/atlas-local-models-20261017
Bas: origin/main 0249e0daa111e576c72c810f186195d7ba5a9bdf
Worktree: C:/Users/Andre/Projects/Omnira/.worktrees/atlas-local-models-20261017

## Avsikt och acceptans
André vill att Atlas ska kunna använda datorns NVIDIA-grafikkort för enklare modelljobb, före införande av FreeLLMAPI. Arbetet ska vara isolerat från övriga pågående Omnira-grenar.
Slutmålet är Atlas -> avgränsat jobb -> lokal modell -> validerat resultat tillbaka till Atlas.
Denna första leverans bevisar den lokala delen med samma uttryckliga jobbkontrakt som en senare Atlas-adapter kan använda. Den är inte en färdig molnkoppling och får inte beskrivas som att Atlas redan routar jobb lokalt.

## Verifierat nuläge
- Windows-enheten Hultgren: NVIDIA GeForce RTX 3060, 12288 MiB, drivrutin 610.60; cirka 102,8 GB ledigt på C: vid kontroll.
- Ollama svarade inte på 127.0.0.1:11434 på Windows eller Mac.
- Windows: ollama saknades i aktuell PATH och hittades inte på de två kontrollerade standardplatserna. Detta är ingen fullständig inventering av alla installationsplatser.
- Aktuell main har Claude/OpenAI-körning, inklusive atlas-model-policy.ts och runner.ts, men ingen verifierad körbar Ollama/NVIDIA-adapter.
- NVIDIA API-nyckel, NVIDIA-grafikkort och lokal Ollama-körning är tre separata saker.
- Intelligence Fabric ch08/ch09 skiljer registrering, behörighet, tillgänglighet och faktiskt körbevis. Registrerad resurs eller dokumenterad modell räcker inte för att kalla en väg fungerande.
- Huvudutcheckningen ligger på en annan gren och har pågående ändringar. Dessa ska inte städas, flyttas, committas eller ingå här.

## Alternativ och beslut
1. Rekommenderat: fristående lokal förstaleverans med Ollama, ett litet jobbkontrakt och reproducerbart acceptansprov. Kräver inget nytt molnberoende och skiljer hårdvarubevis från Atlas-integration.
2. Bygga full moln-till-dator-kö direkt. Ger slutflödet tidigare men blandar modellkvalitet med nya enhetsidentiteter, databas, återkallelse och jobbleaser innan hårdvaruvägen ens är bevisad.
3. Införa FreeLLMAPI nu. Kan ge fler leverantörer men bevisar inte lokal NVIDIA-körning och lägger till en separat routingmekanism.

Välj alternativ 1 som första avgränsade arkitekturleverans. Alternativ 2 följer efter accepterad lokal rapport och en separat granskad transportdesign. FreeLLMAPI ingår inte.

## Förstaleveransens komponenter
Ny fristående Node-modul under workers/local-models/; inga ändringar av befintliga chatt-, röst-, byggstudio- eller modellstandarder.
Använd Node 20+ och inbyggd fetch/node:test för att undvika nya produktberoenden. Modul, tester, syntetiska fixtures och PowerShell-startinstruktioner hålls i denna katalog.
1. Lokal förkontroll: kontrollera Windows, ledigt utrymme, Ollama-version, loopback-tillgänglighet, valda modellens digest och faktisk GPU-placering.
2. Lokal jobbvalidering: godkänn bara versionsbundet kontrakt och allowlistade uppgifter.
3. Ollama-adapter: en begränsad POST till /api/chat; inga verktyg, kommandon eller godtyckliga URL:er från jobb.
4. Resultatvalidering: schema, längdgränser och uppgiftens tillåtna värden.
5. Acceptanskommando: kör syntetiska svenska exempel, samla kvalitet och prestanda i en rapport.

CLI:n läser ett uttryckligen angivet JSON-jobb från stdin; den skannar aldrig repo eller hemkatalog. Resultatet är ett förslag utan sidoeffekter.
Ingen produktionskontext, kunddata, hemlighet eller databasnyckel används i testerna.

## Modell och installationsgräns
Första kandidat: qwen3:8b, Q4_K_M, cirka 5,2 GB enligt Ollamas modellkort. Detta är ett testval, inte ett påstående att modellen är bäst eller redan ryms med önskad prestanda.
Hämta Ollama enbart från officiell distribution. Använd separat versionsbunden portable Windows-installation under denna worktrees ignorerade .local-runtime/ för första provet; ingen global PATH, autostart eller befintlig tjänst ändras.
Modellvikter hålls utanför Git i samma lokala runtimeområde. Kontrollera ledigt utrymme före hämtning; avbryt om mindre än 20 GB finns ledigt.
Registrera distributionsversion, verifierad tillgänglig releasechecksumma/signatur och modellens fullständiga digest i acceptansrapporten. En flytande tagg räcker inte som reproduktionsbevis. Saknad verifierbar distribution ska blockera installationen, inte kringgå kontrollen.
Använd processlokala inställningar: OLLAMA_HOST=127.0.0.1:11434, OLLAMA_NO_CLOUD=1, OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_LOADED_MODELS=1.
Kontrollera lyssnande adresser innan prov. Vid befintlig lyssnare på porten avbryt och identifiera processen; ändra eller döda inte en annan installation.
Installationsprovet får inte ändra brandvägg, router, LAN-exponering eller grafikdrivrutin.

## Jobbkontrakt v1
Input: version=1, jobId (UUID), taskType, text, samt taskType-specifika allowlistade värden.
Tillåtna taskType:
- classify: välj exakt en av 2–8 etiketter som anges av anroparen.
- extract: endast fälten company, city och registrationNumber; varje fält är en sträng eller null. Resultatet får inte hitta på saknade uppgifter.
- summarize: högst tre korta svenska punkter; enbart fakta som står i källtexten.

Högst 3000 tecken källtext. Högst 64 tecken per etikett. Okända fält, otillåtna uppgifter, tom text och felaktigt kontrakt nekas före HTTP.
Anroparen väljer inte modell, systemprompt, endpoint, verktyg eller genereringsparametrar.
Adaptern använder qwen3:8b, stream=false, think=false efter att /api/show verifierat stödet, temperature=0, num_ctx=4096, num_predict=384, keep_alive=2m.
Dessa parametrar begränsar försöket; de garanterar inte korrekt språk eller faktariktighet.

Output: version, jobId, taskType, status, result samt metadata med faktisk provider=ollama_local, serverversion, modelldigest, wallMs och tillgängliga token-/durationfält.
Status är succeeded, rejected eller failed. Fel returnerar en fast reasonCode utan råa leverantörsfel eller inmatning.
Metadata skiljer API-avgift (ingen fakturerad modell-API-tjänst) från okänd el-/hårdvarukostnad; rapportera inte total driftkostnad som noll.

## Gränser och felhantering
En körning åt gången. Max 90 sekunder per försök inklusive kallstart, 3 sekunder för hälsofrågor och högst 128 KiB HTTP-svar. Hela kroppen läses under samma deadline och bytetak.
Tillåt endast exakt loopback-adress och fast port/sökväg; följ inte redirects. Ingen HTTP-proxy eller alternativ endpoint ska kunna styra denna adapter mot molnet.
Inga automatiska omförsök och ingen automatisk övergång till betalda modeller.
Timeout, avbrott, saknad modell, CPU-körning vid GPU-acceptans, fel modell/digest, felaktig JSON, verktygsanrop, trunkering och schemafel markeras uttryckligen. Otillförlitliga resultat används inte som lyckade jobb.
Avbruten fetch är inte bevis på stoppad GPU-generering. Starta inte nästa prov innan tjänsten åter är verifierat ledig; kvarvarande last ger stoppad körserie och manuell återhämtning av just den ägda provprocessen.
Källtext behandlas som data; modellsvaret ger aldrig rätt att ändra filer, köra kod eller anropa andra verktyg.
Normala loggar innehåller jobb-ID, modell-ID, status och mätetal; ingen prompt, svarstext eller känslig kontext. Acceptansfixtures och facit är avsiktligt syntetiska.

## Verifiering och aktiveringsbeslut
Meningsfulla tester med lokal HTTP-fixture verifierar riktig request/response, deadline under body-läsning, redirectnekande, bytetak, ogiltiga jobb och felaktiga modellresultat. Testerna får aldrig kontakta en verklig modell som standard.
Liveprov startas med ett separat explicit kommando och kör endast den lokala allowlistade modellen.
Kvalitetspaket: 10 klassificeringar, 10 informationsutplock (inklusive saknade fält) och 5 sammanfattningar på svenska.
Godkänd kandidat kräver:
- GPU-placering verifierad under last via ollama ps och nvidia-smi; helt GPU-laddad modell för denna första kandidat.
- Minst 9/10 korrekta klassificeringar.
- Minst 9/10 helt korrekta extraktionsobjekt samt noll påhittade värden i fallen med saknade fält.
- 5/5 sammanfattningar utan nya fakta, bedömda manuellt mot sparat syntetiskt facit.
- Giltiga kontrakt och inga verktygsanrop i alla godkända svar.
- Separat redovisad kallstart och varm median/p90; varm p90 högst 20 sekunder på detta paket.

Misslyckad kandidat aktiveras inte. En mindre modell kan utvärderas i samma uttryckliga prov efter dokumenterat nytt modellval; sänk inte kvalitetskraven för att få grönt.
Rapporten anger exakt antal prov, parametrar, modellversion, faktisk GPU-användning, fel och begränsningar. Inga påhittade besparingar eller jämförelser mot omätta molnkörningar.

## Atlas-koppling efter lokal acceptans
Molnkörd Atlas kan inte nå datorns 127.0.0.1. Öppna därför inte Ollama mot internet.
Nästa design ska använda en enhetsbunden lokal worker som själv hämtar uttryckligen tillåtna jobb via HTTPS, kör samma lokala jobbkontrakt och lämnar resultat till servern.
Den designen ska fastställa autentisering och återkallelse, tenant/projekt-åtkomst, atomisk claim/lease, cancel/expire, idempotent resultat, dataminimering, kögränser och befintlig execution-/authority-kontroll före dispatch. Ingen service-role-nyckel placeras på datorn.
Befintliga omergade brokergrenar får inte importeras eller förutsättas finnas i main. Inga befintliga workerbehörigheter breddas.
Första Atlas-pilot ska vara operatörsvald, begränsad till de uppgifter som klarat kvalitetspaketet och utan betald fallback. Automatisk routing kommer först efter verifierad pilot.
Denna förstaleverans innehåller varken enhetscredential, databas, molnendpoint, produktionsaktivering eller automatisk Atlas-routing.

## Isolering, leverans och återställning
Allt arbete sker i angiven worktree på egen gren från angiven bas. Inga cherry-picks från andra arbetsspår.
Commit ska endast innehålla denna designspec och senare uttryckligen tillhörande local-models-filer. Modellvikter, runtime, rapport med lokal maskindata och lokala konfigurationer ska inte hamna i Git.
Ingen merge eller deploy ingår i första leveransen. Ingen ändring av delade .env-filer, Supabase, Vercel, befintliga standardmodeller eller andra worktrees.
Stoppa bara en Ollama-process som detta prov startat och vars PID/version/port verifierats. Ingen allmän processdödning.
Återställning av lokal provinstallation sker genom att stoppa den ägda processen och ta bort dess egna ignorerade runtimefiler; andra installationer och modeller lämnas orörda.
En dokumentationscommit bevisar inte att modeller eller integration fungerar. Tester och verkliga prov ska redovisas separat.

## Granskningsordning
Detta är en ny arkitekturdel. Superpowers brainstorming kräver granskning av denna skrivna design före implementationsplan; planen granskas därefter med val av körsätt.
Rekommenderat körsätt för den kommande planen: samma agent arbetar sekventiellt i denna worktree. Inga andra agenters pågående brancher används.
Nuvarande status: isolering och skrivbords-/källkontroll genomförda; installation, modellhämtning, produktkod och liveinferens ännu inte genomförda.

## Källor lästa 2026-10-17
- https://docs.ollama.com/windows — Windows, NVIDIA-stöd och portable CLI.
- https://docs.ollama.com/faq — loopback, GPU-verifiering och OLLAMA_NO_CLOUD.
- https://docs.ollama.com/api/chat — format, think, duration och tokenfält.
- https://ollama.com/library/qwen3:8b — kandidatens storlek, kvantisering och modellidentitet.
- apps/web/lib/ai/atlas-model-policy.ts, models.ts, runner.ts, openai-client.ts.
- docs/architecture/intelligence-fabric/atlas-knowledge/v1.0/chapters/ch08.md och ch09.md.
