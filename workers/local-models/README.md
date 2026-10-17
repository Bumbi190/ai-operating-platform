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
