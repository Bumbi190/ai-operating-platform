# Atlas Model & Agent Router — genomförandeplan
Datum: 2026-10-22
Status: P0 preflight klar; lokalt GPU-inferenstest BLOCKERAT; inte produktionsaktiverad
Ansvar: Atlas som orkestrerare; Codex, Abacus, Ollama och API-modeller som utbytbara exekutörer.
Branch: codex/atlas-model-agent-router-20261022

## Beslut och mål
Atlas behåller rollen som projektägande huvudagent. Codex är inte Atlas identitet eller permanenta driftmotor. Abacus är en underagent, inte ny chef eller obligatoriskt beroende.
Mål: minimera förväntad verklig kostnad utan att tumma på verifierbar kvalitet, säkerhet eller deadline.
Särskilj MODELL (LLM), PROVIDER (endpoint/konto), HARNESS (Codex/Abacus/egen agent), WORKER (låst process), ARBETSPAKET (approved scope).
En lokal modell via NVIDIA RTX 3060 + Ollama har ingen API-tokenavgift, men kräver lokal maskin, el, minne och drift.
ChatGPT-abonnemangets Codex-åtkomst används endast via officiell ChatGPT-inloggning i Codex, inom kvoter och villkor; är inte en allmän API-nyckel för molnservern.
Abacus kan upptäcka Codex och även anropa Ollama lokalt, men kräver egen installation och eventuell inloggning. Ingen automatisk växling in i abonnemang utan explicit provider/model-konfiguration.

## Nuläge verifierat 2026-10-22
Windows Hultgren: NVIDIA GeForce RTX 3060 12 GB, NVIDIA-driver 610.60, RAM 15.8 GB, ledigt C: ca 87.5 GB.
NVIDIA GPU fungerar. Ollama hittades inte i standardinstallation/registry och localhost:11434 svarade inte. Codex/abacusai saknades i PATH; ingen slutsats om andra installationer.
Omniras kod: apps/web/lib/atlas/code-work/worker-registry.ts tillåter endast CLAUDE_PATCH_V1; hårdkodad provider/model. SDF-1 policy.ts kontrollerar identitet/scope.
Budget-gate apps/web/lib/cost/budget-gate.ts använder reservat-och-avräkna, men H1_SPEND_GATE har ett advisory-läge; budgetkontroll är inte liktydigt med godkännande.
Repo main-workspace är smutsig med pågående autonomi-ändringar. All ny utveckling ska ske i separat worktree. Befintliga parallella arbeten får inte störas.
Hårdvarans 12 GB VRAM passar kvantiserade ca 3B-8B modeller, beroende på kontext och samtidigt GPU-utnyttjande. Stora 30B-modeller bör ej lovas full GPU-drift.

## Arkitektur
Atlas -> Planning/Task classifier -> Candidate registry/health/quota -> Deterministisk kostnad- och kvalitetsrouter -> Spend/authorization gates -> WorkPackage -> Worker adapter -> Evidence -> Oberoende reviewer -> Human gate -> Promotion.
Registryfält: id, provider, harness, capabilityTags, toolPermissions, online/available, lastVerifiedAt, performanceScore, quotaKind, priceEstimate, subscriptionKind, host, modelId, policyVersion.
Router väljer bara ur *allowlist* och returnerar decisionId, kandidater, rankningsskäl och beräknad kostnad, inga hemligheter eller login-token.
Disponera privilegier separat per arbetspaket: read paths, write paths, nätverk, shell, Git, runtime, tidsgränser. Agentens identitet ger aldrig automatiskt befogenhet.
En oberoende granskare kontrollerar diff, tester, förbjudna filer, regressionsrisk och säkerhetslogg. Ägare godkänner merge, deploy, nya kostnader och utökad access.
Fallback: om lokal modell misslyckas -> Codex-abonnemangsworker om inloggad och quota finns -> godkänd API-modell endast med hård budget och tillstånd. Ingen tyst betald fallback.
Stoppa om budget saknas, identity/health kan ej verifieras, kvotstatus okänd för nödvändiga uppdrag, eller om worktree saknar skydd.

## Adaptrar (ordning)
1. ollama-local: 127.0.0.1:11434 endast loopback, read-only första probe; modeller och kvantisering väljs efter tillgängligt VRAM.
2. codex-subscription: codex CLI på Hultgren, ChatGPT-inloggning via användaren; lokala arbetsuppdrag inom prenumerationsgränser och explicit interaktivt godkännande där nödvändigt.
3. abacus-agent: abacusai CLI lokalt, konfigurerad på Codex eller Ollama; --model, --permission-mode plan, --print. Först förstärkt read-only/plan; verktygsrättigheter valideras i adapter.
4. api-paid: OpenAI mini/annan godkänd API-leverantör, separat API-nyckel i secret store, hård kostnadsspärr och giltigt ägarbeslut.

## Etapper och färdigkriterier
P0 Inventering: verifiera installerade binärer, nvidia-smi, RAM/VRAM, ledigt utrymme, Ollama HTTP health, abonnemangsinloggning (utan att läsa eller spara hemligheter), aktiv Git-worktree och budget-gates. Klar när rapporten har mätbara statusvärden.
P1 Lokal modellserver: installera signerad officiell Ollama-version; bind 127.0.0.1; hämta EN liten testmodell (ex. qwen3:4b) efter kontroll av faktisk modellstorlek/utrymme; kör svensk sammanfattning och liten kodanalys; mät latens/tokens, VRAM, temperatur och context-marginal. Inga produktionsdata i första testet.
P2 Kontrakt: introducera generellt immutable WorkerCapability/ModelCandidate; register och hälsokontroller utan att ändra befintliga CLAUDE_PATCH_V1-semantiker; nytt versionshanterat adapter-kontrakt. Avvisa okänd worker (fail closed).
P3 Router: välj billigaste tillräckligt bra kapacitet per uppgift; kontrollerad fallback med logg och mätdata. Testa planering vs kodning vs granskning separat. Ingen blind router som enbart väljer lägsta tokenspris.
P4 Prenumerationsworker: installera Codex CLI (ej användarkonto automatiskt), användaren loggar in med ChatGPT; testa endast behörig lokal task. Ingen server-side OAuth-session eller tokenexport.
P5 Abacus-agent: installera Abacus CLI; användaren gör eventuell egen inloggning; testa --model codex/... och lokala Ollama med samma read-only prov; bedöm om Abacus tillför utöver direkt-Codex.
P6 Godkännande och kostnad: koppla till nuvarande work package governance/ledger, stoppa vid spend cap eller bruten inloggning; belasta bara förauktoriserad budget; förbjud tyst provider-switch. Verifiera att advisory-inställning inte räcker.
P7 Utvärdering: jämför samma frysta uppgifter och repo-snapshot med identiska testvillkor; kvalitet (unit/integration), tid, antal korrigeringar, verklig kostnad, felgrad, reproducerbarhet.
P8 Pilot: isolerad staging-worktree; ingen merge/deploy utan oberoende review och ägarens godkännande. Avbryt om kostnad eller GPU-resurser påverkar andra aktiva arbeten.

## Första routingpolicyn (förslag, ej aktiverad)
- Klassificering/omskrivning/sammanfattning/testdata: Ollama, om confidence/quality-gate passerar.
- Kodändringar: Codex direct som default när abonnemangskvot finns; Abacus kan tävla i A/B-prov om bättre verktygsflöde.
- Sårbarhetsgranskning och kritisk arkitektur: separat stark granskare; lokal liten modell enbart stöd, inte ensam godkännare.
- Produktion, pengar, massutskick, hemligheter, fakturering: human gate alltid.
- Otillgängligt GPU/kvot: pausa och be om beslut när övriga alternativ kostar pengar.

## Konkreta tester
- En worker får aldrig se andra projekts workspace eller hemligheter; path allowlist måste upprätthållas av broker, ej enbart prompt.
- Prov med offline Ollama, avbruten Codex-login, låg GPU-VRAM, budget=0, parallella agentjobb och återkörning utan dubbeldebitering.
- Kan stoppa körning om GPU överstiger tidigare överenskomna säkerhetsgränser (80 C, 94% VRAM) och respektera övriga uppdrag.
- Verifiera versionsbyte, återspelning av receipts, begränsad terminalkörning, inaktiverad nätverkstillgång i read-only.
- Router ska ge ett begripligt kvitto: varför modell valdes, faktisk kostnad, underliggande provider, granskare och slutligt ägarbeslut.

## Öppna beroenden
- Bekräfta att användaren loggat in i Codex CLI med ChatGPT på Hultgren. Ingen lagring av session i Omniras databas.
- Ta reda på om Abacus CLI kräver separat gratiskonto/prenumeration för just agentkörning; budget = 0 nya betalda abonnemang tills beslut.
- För molnbaserad Atlas -> hemmadator krävs redan planerad säker, autentiserad lokal broker/relay, inte en publik port till Ollama.
- Samordna med pågående kodagent-, broker- och budgetarbeten och gör integration först när deras kontrakt är stabila.

## Källor verifierade
- https://api.abacus.ai/help/abacusai-desktop/providers
- https://api.abacus.ai/help/abacusai-desktop/settings
- https://github.com/abacusai/abacusai-desktop
- https://github.com/openai/codex
- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- https://docs.ollama.com/windows

## Faktisk P0-uppföljning 2026-10-22
- Ollama 0.40.8 installerad via officiell Winget-källa; endpoint på 127.0.0.1:11434 besvarar /api/tags.
- qwen3:4b nedladdad 2.5 GB och synlig i Ollama-listan. Modellens första inferensanrop returnerade HTTP 500.
- Ollama server.log visar "ptxas fatal: Memory allocation failure" och "CUDA error: a PTX JIT compilation failed" under GPU-uppvärmningen. Orsak ännu inte definitivt fastställd. Byt inte NVIDIA-drivrutin eller stoppa användarens andra processer utan separat godkännande.
- RAM: endast ca 0.7-1.4 GB ledigt vid prov, trots ca 9.9 GB ledigt VRAM. Lokala modellexekveringar ska därför inte schemaläggas innan minnesmarginal finns och felet är diagnostiserat.
- Codex CLI 0.163.0 installerad och "Logged in using ChatGPT" verifierat. Ingen automatisk debitering/API-nyckel har använts.
- Abacus CLI 2.10.10 installerad; "Not logged in". Kräver användarens Abacus-inloggning innan test.
- Read-only script: scripts/atlas-model-router/preflight.ps1. Observera att `localInferencePreflightPass=true` endast betyder att resursgränserna är uppfyllda, inte att modellen fungerar.
- Ingen router, automatisk delegering, betald modell eller produktionskoppling är aktiverad. Nästa konkreta steg: åtgärda minnes-/CUDA-problemet utan att störa aktiva arbeten; därefter kör verifierat Qwen-test och abacus-plan-test.
