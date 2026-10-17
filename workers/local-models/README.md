# Lokala modellprov

Fristående Windows-pilot på loopback. Detta är kvalificeringsverktyg, inte en färdig molnkoppling till Atlas och inte en produktionsbehörighet.

## Körning

Kör från denna gren/worktree med Node 20+ och NVIDIA-drivrutin. Ingen npm-installation behövs.

```powershell
./workers/local-models/scripts/preflight.ps1
./workers/local-models/scripts/runtime.ps1 -Action Prepare
./workers/local-models/scripts/runtime.ps1 -Action Start
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD='1'
$exe=Join-Path $PWD 'workers/local-models/.local-runtime/ollama-v0.40.5/ollama.exe'
# Kontrollera minst 20 GB ledigt före VARJE pull.
& $exe pull qwen3:8b
node workers/local-models/accept.mjs run --candidate qwen3:8b
& $exe pull qwen3.5:4b
node workers/local-models/accept.mjs run --candidate qwen3.5:4b
& $exe pull qwen3.5:9b
node workers/local-models/accept.mjs run --candidate qwen3.5:9b
```

Varje prov ger en rapport och dess SHA-256 i `.local-runtime/`. `pending_review` betyder att modellen INTE är godkänd. Rapporter innehåller endast det syntetiska provpaketets resultat och lokala prestandabevis; lägg dem inte i Git. Fel/blockerare och ej körda fall bevaras.

En separat agent ska läsa hela rapporten, fixtures/sv-v1.json och facit. Granskningen måste ange reportSha256, reviewerAgentId/reviewerRunId, reviewerModelId (eller session_model_unspecified) och beslut med skäl och samtliga caseId:n per uppgiftstyp. Sammanfattningar kräver faktagranskning av alla fem svar. Produktionsaktivering eller nya rättigheter får inte skrivas in av granskaren.

Operatörens granskningsflöde sparar separat provenance med source=collaboration, runStatus=completed, verkliga reviewerAgentId/reviewerRunId, reviewerModelId (samma som i granskningen), implementationAgentId och samma reportSha256. Detta är en ärlig offline-spårbarhet, inte kryptografisk autentisering. Kandidaten får aldrig skapa sin egen granskningspost.

```powershell
node workers/local-models/accept.mjs assess --report <rapport.json> --review <granskning.json> --provenance <provenance.json>
./workers/local-models/scripts/runtime.ps1 -Action Stop
```

Alla tre assess-filer måste ligga i denna moduls `.local-runtime/`. Text som inte klarar lokal kvalificering ger endast ett förslag om OpenAI. Kodarbete behöver separat Codex-worker. Inga sådana betal-/kodagentanrop görs av denna modul.

## Tester och fel

```powershell
$tests=@(Get-ChildItem workers/local-models -Filter '*.test.mjs' | ForEach-Object FullName)+@(Get-ChildItem workers/local-models/scripts -Filter '*.test.mjs' | ForEach-Object FullName)
node --test $tests
```

Tester använder loopback-fixtures, inte verkliga modeller. PowerShell-testerna körs på Windows. Om 11434 redan används vägrar startscriptet; stoppa inte andras processer. Efter timeout kan `job.lock` vara osäker: starta inga fler jobb. Låt den egna CLI-processen avslutas och använd Stop för att verifierat stoppa den ägda servern och dess identifierade barn; därefter får en ny Start/provserie göras. Om föräldraprocessen redan har kraschat bevaras osäkerhetsspärren, eftersom ett föräldralöst GPU-jobb inte kan uteslutas; manuell verifiering krävs. Ingen generell kill eller automatisk låsrensning.

Hela provserien, avlastning och GPU-observation delar samma exklusiva spärr. GPU-bevis ska samlas medan kallstartens generering pågår, med modellens digest och identifierad ägd runner. Modellidentiteten kontrolleras före och efter generering. Rapporten binder också acceptans-/runtimekoden och distributionens arkiv-/binärhash. Ändringar kräver nya prov och ny granskning.

Gränsen 3 000 Unicode-tecken är ett kontraktstak, inte ett bevis att varje tillåten text ryms i modellens 4 096-tokenkontext. Denna leverans kvalificerar endast det fasta provpaketet. Tokenbudget och detektion av eventuell kontexttrunkering återstår före produktionsrouting för godtyckliga texter.

Den råa `cli.mjs run` är ett operatörsverktyg för ett enskilt lokalt testjobb. Den gör ingen modellkvalificering och får inte kopplas direkt till produktions-Atlas. Varje framtida Atlas-dispatch ska kräva aktuell uppgiftskvalificering och ordinarie åtkomst-/budgetkontroll.

## Atlas-adapter under implementation

`createOllamaClient().inferBounded()` is the only intended Atlas inference path. It requires operator-qualified tokenizer and raw-runtime evidence bound to exact model/runtime artifacts. `runJob(...,{requirePromptBudget:true,tokenizerEvidence})` preserves the same lifecycle lease. Missing proof returns `TOKEN_BUDGET_UNVERIFIED`; oversized full raw prompt/schema plus 384 output reserve returns `INPUT_TOO_LARGE` before generation. The raw operator CLI retains its previous fixed-fixture behavior and is not a production Atlas route.

`gguf-evidence.mjs` reads only an operator-selected allowlisted model blob, checks its complete SHA-256 and GPT-2 byte coverage, and refuses unknown tokenizers/pretokenizers. This is artifact evidence, not project admission, remote attestation or a semantic quality certificate. The new raw prompt needs requalification and independent review before any project pilot. See the separate integration verification record.


### Granskad start för Atlas textworker

`workers/local-text/supervisor.mjs --config <absolut sökväg>` övervakar en egen Windows-session. Konfigurationen ska finnas i `workers/local-text/.local-state/<deviceId>/config.json`; journalen heter `attempt.dpapi.json` och räknaren `counter.json` i samma katalog. Identitet och kvalificerade modellprofiler måste redan vara verifierade. Skriptet skapar inga API-nycklar och hämtar inga modeller.

Förhandsgranska utan installation:

```powershell
powershell -NoProfile -File workers/local-text/scripts/install-startup.ps1 -Preview -ConfigPath <absolut-konfigurationsfil>
powershell -NoProfile -File workers/local-text/scripts/remove-startup.ps1 -Preview -ConfigPath <samma-fil>
```

Startuppgiften använder inloggad nuvarande användare, lägsta privilegier, AtLogOn och en instans. Efter omstart krävs inloggning. Ingen autostart är installerad av utvecklingstesterna. `-Apply` används först vid separat godkänd driftaktivering.

Återställning: återkalla först exakt enhet med normal ägarinloggning i Omnira (`PATCH /api/local-text/devices/<deviceId>`, aktuell projekt/version och action revoke). Detta stoppar ej startade jobb och behåller osäkra försök. Förhandsgranska sedan borttagning och använd `remove-startup.ps1 -Apply` för exakt egen uppgift. Skriptet rapporterar ärligt att serveråterkallelse krävs; det har inga ägarcredentials. Windows-jobbet avslutar bara sina egna processer. Osäkra journaler/lås rensas aldrig automatiskt, och en kvarvarande `stop.request` kräver operatörens bedömning före ny start. Lokal kernel-empty-metadata är bevis för lokal processavslutning, inte ett godkännande att frigöra ett serverjobb.

Loggar är tre filer om högst64KiB med fasta livscykelkoder; råtext och barnprocessernas stdout/stderr sparas inte. Fem krascher på tio minuter pausar och kräver åtgärd. Processägande är inte ett OS-sandbox.


### Ny kvalificering för Atlas textflöde

Den äldre `cli.mjs --help` svarar `INVALID_COMMAND_OR_INPUT`; dess enkla `run --candidate` kör inte det nya kvalificeringspaketet. Använd den separata, operatörsstyrda kommandoraden med absoluta sökvägar:

```powershell
node workers/local-models/qualify-atlas.mjs --config C:\Users\Andre\Projects\Omnira\.worktrees\atlas-local-text-integration-20261017\workers\local-models\.local-runtime\atlas-text-qualification\config.json --output C:\Users\Andre\Projects\Omnira\.worktrees\atlas-local-text-integration-20261017\workers\local-models\.local-runtime\atlas-text-qualification\evidence
```

Konfigurationen innehåller verifierade runtime-/modell-/drivrutins-/adapterhashar och lokala artefaktsökvägar, inga API-nycklar. Programmet startar/hämtar inga modeller och skriver inga projektadmissioner. Starta först en verifierad egen Ollama-runtime. Hela modellserien håller exklusiv resurslease, verifierar ägande/artefakter vid båda gränser och full GPU-residens före/efter varje generering. Varje svar använder exakt samma bounded infer-adapter som workern. Okänt utfall stoppar serien och bevarar spärr; `seriesStatus` måste vara completed innan något granskas som godkänt.

`sv-atlas-v2.json` har25 syntetiska fall per uppgift. Alla75 källa/svar-par för var och en av tre modeller ska granskas av en separat agent mot exakt rapporthash. Felaktiga/fabricerade/injicerade svar ger aldrig admission. Resultatet gäller bara exakt adapter, modell, mall, schema och konfiguration; gamla pilotgodkännanden överförs inte. Den jämförda ChatML-varianten förbättrade vissa nullvärden men underkändes för alla tillåtna kombinationer; klassificering på9B var bättre med den ursprungliga råmallen. Slutprovet använder den uppmätta råmallen och escapeskydd även för schemaetiketter. Ingen kvalitetsgräns har sänkts. Rapporter i `.local-runtime` är lokala syntetiska prov, inte betalda API-anrop eller produktionsadmission.

Komponentprovet körs separat: `npx playwright test e2e/local-text.spec.ts --config playwright.local-text.config.ts` från `apps/web`. Det använder verkliga komponenter i en isolerad HTTP-fixture med kontrollerade ägarsvar, inte produktionsinloggning. Faktisk CNG/HTTPS/SQL/RTX3060-väg är ett separat opt-in integrationsprov och dokumenteras med sin verkliga status. Ny betald molnroll, installation, projektadmission och omstart kräver den konkreta driftgranskningen; dessa kontroller aktiverar inget.
