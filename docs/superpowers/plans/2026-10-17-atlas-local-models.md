# Atlas Local Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prova tre lokala modellkandidater på svenska, låta en separat agent granska resultaten och producera uppgiftsbundna kvalificerings-/eskaleringsbeslut.
**Architecture:** Fristående lokal Node-worker med strikt jobbkontrakt, direkt loopback-transport och en kandidat åt gången. Ett separat kvalificeringsflöde kombinerar uppmätta tester och oberoende agentgranskning; det öppnar ingen produktionsrättighet. Molnkörd Atlas och betald OpenAI/Codex-dispatch kräver nästa integrationsleverans.
**Tech Stack:** Node 20+ (verifierat v22.22.3 på Windows), ESM .mjs, node:http, node:test, PowerShell, portable Ollama/CUDA. Inga npm-beroenden.
**Spec:** docs/superpowers/specs/2026-10-17-atlas-local-models-design.md, inklusive Andrés ägartillägg 2026-10-17 kl. 09:07 Europe/Stockholm.
**State:** André godkände Native-genomförande 2026-10-17 kl. 09:24 Europe/Stockholm. Implementerad och lokalt verifierad; se docs/architecture/local-models/2026-10-17-verification.md. Ingen produktionsaktivering.
**Workspace:** C:/Users/Andre/Projects/Omnira/.worktrees/atlas-local-models-20261017
**Branch/base:** codex/atlas-local-models-20261017 från 0249e0daa111e576c72c810f186195d7ba5a9bdf.

## Global Constraints
- All kod under workers/local-models/. Endast denna spec, plan, modul och dess verifieringsdokument ändras. Inga andra grenar importeras.
- Node 20+ och inbyggda moduler; ingen npm-installation behövs. Root/web package.json, delade .env, Supabase, Vercel och standardmodeller lämnas utanför ändringen.
- Kandidater i ordning: qwen3:8b, qwen3.5:4b, qwen3.5:9b; verifierad lokal Q4_K_M-backend/full digest. Ingen :cloud, ingen annan godtycklig modell.
- Processlokalt: OLLAMA_HOST=127.0.0.1:11434, OLLAMA_NO_CLOUD=1, OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_LOADED_MODELS=1.
- Minst 20 GB ledigt före varje hämtning. Endast officiell portable distribution, verifierad SHA-256 före extraktion/körning.
- Text högst 3000 Unicode-kodpunkter, 2–8 unika etiketter om högst 64 kodpunkter, endast classify/extract/summarize. Input maximalt 64 KiB UTF-8. Alla okända fält nekas.
- Extract-fält exakt company, city, registrationNumber: sträng eller null. Summarize-resultat 1–3 punkter med högst 300 kodpunkter vardera; inga nya fakta.
- stream=false, think=false efter verifierat stöd, temperature=0, num_ctx=4096, num_predict=384, keep_alive=2m.
- En körning åt gången, även mellan CLI-processer. 90 sekunder total job/request/body-deadline, 3 sekunder för hälsa, högst 128 KiB svar, inga redirects/proxyvägar/automatiska retries.
- Lokal kvalificering är per kandidat och uppgiftstyp. Hela GPU-/kontraktskontrollen plus respektive kvalitetskrav och separat agentgranskning krävs.
- Classify minst 9/10; extract minst 9/10 samt noll påhittade saknade värden; summarize 5/5 faktatrogna. Varm p90 högst 20 sekunder per uppgiftstyp; redovisa litet urval.
- Kandidater eller kandidaters resultat får inte godkänna sig själva. Ändrat underlag ger nytt granskningsbehov.
- OpenAI/Codex anges som eskaleringsmål; denna leverans anropar dem inte och bygger ingen Codex-worker. Inga betalda tester, produktionsjobb, merge eller deploy.

## Review Focus
1. Å/ä/ö, emoji och mycket UTF-8: tecken- och bytetak får inte blandas; inga tysta trunkeringar.
2. Servern skickar headers men hänger i body: samma deadline/bytetak måste fortsätta gälla efter headers.
3. Två CLI-processer eller avbruten generering: inget dubbelt GPU-jobb, ingen frisläppning som låtsas att servern slutat arbeta.
4. Giltig JSON med påhittade fakta eller instruction injection: schema räcker inte för modellkvalificering; facit och oberoende granskning måste kunna underkänna.
5. Ändrad digest, rapport, prompt eller granskningsidentitet: äldre godkännande får inte återanvändas eller upphöjas till produktionsbehörighet.

## Filkarta
- workers/local-models/.gitignore — bara lokala runtime-/rapport-/låsfiler.
- contracts.mjs + contracts.test.mjs — input/output-kontrakt och fasta felkoder.
- candidates.mjs — fasta kandidat-ID:n, parametrar och versions-ID.
- transport.mjs + transport.test.mjs — begränsad direkt HTTP till loopback; internt testsnitt mot riktig fixture.
- ollama.mjs + ollama.test.mjs — hälsa, modelldigest, fasta prompts, format-schema och modelldispatch.
- worker.mjs, cli.mjs + worker.test.mjs — ett validerat jobb, korsprocesslås, resultat och CLI.
- fixtures/sv-v1.json — syntetiska 25 fall, facit och kritiska saknade fält.
- evaluate.mjs + evaluate.test.mjs — reproducerbart livepaket, evidens och deterministiska mått.
- qualification.mjs + qualification.test.mjs — granskningsbindning, uppgiftsgodkännande och eskaleringsbeslut.
- scripts/runtime.ps1 + scripts/preflight.ps1 — verifierad portable hämtning, start/status/stopp av endast egen process.
- scripts/runtime.test.mjs — PowerShell-parsning, checksummefel och isolerad förkontroll.
- accept.mjs, README.md + accept.test.mjs — explicita kommandon och slutrapport.
- docs/architecture/local-models/2026-10-17-verification.md — verifierade totalsiffror och kvarstående gränser; inga råa lokala rapporter.
Alla råa prov-/granskningsrapporter, runtimefiler och vikter ligger ignorerat i workers/local-models/.local-runtime/. Ingen koppling till befintliga brokers/workergrenar.

---

### Task 1: Versionsbundet jobbkontrakt och kandidatlista
**Files:** Create contracts.mjs, candidates.mjs, contracts.test.mjs och .gitignore enligt filkartan.
**Interfaces:** validateJob(value:unknown) -> Job eller ContractError(reasonCode); validateResult(taskType,value,labels?) -> Result eller ContractError. Job = {version:1, jobId:UUID, taskType:'classify'|'extract'|'summarize', text:string, labels?:string[]}. Result = {label:string}, {company:string|null,city:string|null,registrationNumber:string|null} respektive {bullets:string[]}. CANDIDATES är fryst lista med de tre fasta kandidat-ID:na; JOB_VERSION/PROMPT_VERSION/FIXTURE_VERSION är 1.

- [x] **Step 1: Skriv contracts.test.mjs.** Assertions:
```js
assert.throws(() => validateJob({...valid, model:'anything'}), /INVALID_JOB/);
assert.throws(() => validateJob({...valid, text:'å'.repeat(3001)}), /INVALID_JOB/);
assert.equal(validateJob({...valid, text:'😀'.repeat(3000)}).text, '😀'.repeat(3000));
assert.throws(() => validateJob({...valid, labels:['bil','bil']}), /INVALID_JOB/);
assert.throws(() => validateResult('extract', {company:'X',city:null,registrationNumber:null,extra:1}), /INVALID_RESULT/);
```
Lägg även fall för labels på fel taskType, okänd version/task, 1/9 etiketter, tomma/blankstegsetiketter, null saknade fält, tom/4-punkts sammanfattning och strängar över gräns.
- [x] **Step 2: Kör** `node --test workers/local-models/contracts.test.mjs`; förvänta FAIL eftersom modul saknas.
- [x] **Step 3: Implementera gränserna och listan.** Kandidat väljs av operatören utanför Job. JSON-schema skickas till modellen men samma kontrakt verifieras också lokalt.
- [x] **Step 4: Kör samma testkommando**; förvänta 0 fel. Kör `git diff --check`.
- [x] **Step 5: Commit endast denna tasks filer:** `feat(local-models): define bounded jobs and candidate profiles`.

### Task 2: Begränsad Ollama-transport och en lokal jobbkörning
**Files:** Create transport.mjs/test, ollama.mjs/test, worker.mjs/test, cli.mjs.
**Interfaces:** requestLoopback({method,path,body,timeoutMs,maxBytes,signal}, internalTransport?) -> Promise<JSON>; production använder bara 127.0.0.1:11434. InternalTransport är testsnitt och kan inte anges via Job/CLI/env.
inspectCandidate(candidateId,{signal}) -> CandidateSnapshot {candidateId, modelDigest, serverVersion, supportsNoThink, quantization}.
runJob(job,{candidateId,expectedSnapshot,runtimeDir,signal}) -> Promise<JobOutcome>. Samma monotona 90s-budget startar före kandidatinspektionen och delas av hälsa, dispatch och body.
JobOutcome = {version:1,jobId,taskType,status:'succeeded'|'rejected'|'failed',result?,reasonCode?,metadata:{provider:'ollama_local',candidateId,modelDigest,serverVersion,wallMs,usage?,billedApiSek:0,totalOperatingCostSek:null}}.
CLI: `node workers/local-models/cli.mjs run --candidate <allowlisted-id>`, JSON stdin, en JSON-output, ingen godtycklig fil-/endpoint-/systempromptflagga.

- [x] **Step 1: Skriv verkliga HTTP-fixturetester** för taskens exporter. Assertions inkluderar:
```js
assert.equal(observedRequest.host, '127.0.0.1:11434');
assert.equal(observedRequest.body.think, false);
assert.equal(observedRequest.body.options.num_ctx, 4096);
assert.equal(observedRequest.body.options.num_predict, 384);
assert.equal(secondProcessOutcome.reasonCode, 'LOCAL_BUSY');
assert.equal(requestCountForInvalidJob, 0);
```
Testa header-sedan-stall med kort intern testdeadline; body fortsätter överskrida 128 KiB; redirect mot extern URL får noll uppföljningsanrop. Testa digestbyte mellan inspect och dispatch, unsupported think=false, :cloud, truncering, tool_calls, icke-JSON, abort och UTF-8 bodytak.
Testa två riktiga CLI-barnprocesser med ägt lås och en fördröjd HTTP-fixture. När ett dispatchat anrop avbryts/timeoutar lämnas en markerad osäker körstatus som blockerar nästa jobb; inga automatiska försök eller processdödningar.
- [x] **Step 2: Kör** `node --test workers/local-models/transport.test.mjs workers/local-models/ollama.test.mjs workers/local-models/worker.test.mjs`; förvänta FAIL för saknade moduler.
- [x] **Step 3: Implementera direkt node:http, fast schema/prompt och worker.** Total deadline omfattar body. Hälsoendpoints och chattsökväg är fasta. Körningslås skapas exklusivt med wx i eget runtimeDir; inga lås i andra worktrees. En normal slutförd förfrågan frigör eget lås; osäker efterdispatch hanteras fail-closed. Operatörsåterställning får endast röra verifierat ägd provprocess.
- [x] **Step 4: Kör samtliga tester hittills** med explicita testfilnamn; förvänta 0 fel och inga anslutningar till verklig Ollama som standard.
- [x] **Step 5: Commit:** `feat(local-models): add loopback inference with bounded lifecycle`.

### Task 3: Svenska kandidatprov och mätbar evidens
**Files:** Create fixtures/sv-v1.json, evaluate.mjs och evaluate.test.mjs.
**Interfaces:** runEvaluation({candidateId,snapshot,runtimeDir,signal}) -> Promise<EvaluationReport>; scoreEvaluation(report,fixtureSet) -> PerTaskMetrics; writeEvidence(report,runtimeDir) -> {reportPath,reportSha256}.
EvaluationReport v1 binder kandidat/digest/server, kvantisering, GPU-bevisreferenser, suiteHash, promptHash, adapterHash och configHash samt varje caseId/jobbutfall/duration och input/resultat från det syntetiska paketet. Normala körloggar innehåller inte text.
Rapporten får aldrig innehålla proddata; evaluator läser bara fixturefilen i modulen.

- [x] **Step 1: Skriv tester** som hävdar exakt 10 classify +10 extract +5 summarize med unika caseId:n. Extract har minst tre saknade-fältfall och ett av dem innehåller instruktioner att hitta på ett företagsnamn. Sammanfattningsfacit innehåller källans tillåtna fakta och förbjudna påståenden.
```js
assert.equal(scoreEvaluation(reportWith9Classifications, fixtures).classify.correct, 9);
assert.equal(scoreEvaluation(reportWithInventedMissingField, fixtures).extract.inventedMissingFields, 1);
assert.equal(reportWithOneFailedCase.cases.length, 25);
assert.notEqual(hashReport(changedOutput), hashReport(originalReport));
```
Testa att sammanfattningens semantiska kvalitet lämnas pending_review och aldrig automatiskt godkänns av schema. Varm p90 beräknas med nearest-rank efter separat kallstart och separat uppvärmning av respektive taskType. Inga mätvärden från kallstart blandas in i varm p90; små sample counts skrivs ut.
- [x] **Step 2: Kör** `node --test workers/local-models/evaluate.test.mjs`; förvänta FAIL.
- [x] **Step 3: Implementera paket och utvärdering.** Ett separat kallstartsprov och uppvärmningsprov per taskType är märkta och utanför 25 kvalitetsfall; deras overhead räknas separat. Vid fel lagras felutfall för aktuellt och ej körda fall, aldrig tyst bortfall. Osäker efterdispatch stoppar serien.
Kandidater byts först efter ägd modellavlastning och bevisad frigjord GPU. Inga verkliga jobb läggs i serien.
- [x] **Step 4: Kör evaluator- och tidigare tester**; förvänta 0 fel. Verifiera facits täckning före liveprov, inga ändrade trösklar efter att kandidatsvar setts.
- [x] **Step 5: Commit:** `feat(local-models): add Swedish candidate evaluation evidence`.

### Task 4: Agentgranskning, uppgiftskvalificering och eskalering
**Files:** Create qualification.mjs och qualification.test.mjs.
**Interfaces:** qualifyCandidate({report,reportBytes,review,provenance,currentIdentity}) -> Qualification; chooseLocalRoute({workKind:'text'|'code',taskType?:TaskType,qualifications,currentIdentity}) -> RouteDecision. workKind kommer från den lokala anroparen, inte från modelltext. Okänd workKind/ogiltigt jobb nekas; bara uttryckligt code kan rekommendera Codex.
Review v1 innehåller reportSha256, reviewerAgentId, reviewerModelId (eller ärligt session_model_unspecified), reviewerRunId och per-task beslut approved/rejected med skäl och caseId-referenser. För summarize krävs 5/5 explicita faktagranskningar; extract-granskningen måste omfatta samtliga saknade-fältfall.
Provenance skapas av detta sessionsflöde efter en verklig separat agents körning, aldrig av kandidaten eller modelltexten. Offlinefilen bevisar inte extern identitet kryptografiskt och får inte användas som produktionsautentisering.
Qualification = {scope:'local_evaluation_only', identity:{...hashes}, approvedTasks:TaskType[], deniedTasks:[{taskType,reasons}]}.
RouteDecision är {status:'local_candidate',candidateId,taskType} eller {status:'escalation_required',reasonCode,target:'openai_model'|'codex_worker',dispatched:false}. Uttryckligt workKind=code ger codex_worker; giltigt textarbete utan kvalificerad kandidat ger openai_model. Ogiltig input blir rejected och eskaleras inte.

- [x] **Step 1: Skriv tester**:
```js
assert.deepEqual(qualifyCandidate({ ...good, review:null }).approvedTasks, []);
assert.deepEqual(qualifyCandidate({ ...good, review:selfReview }).approvedTasks, []);
assert.deepEqual(qualifyCandidate({ ...good, report:tampered }).approvedTasks, []);
assert.equal(routeWithoutApprovedCandidate.status, 'escalation_required');
assert.equal(routeWithoutApprovedCandidate.dispatched, false);
assert.equal(qualified.scope, 'local_evaluation_only');
```
Testa agent approved trots 8/10 classify, 8/10 extract, påhittat saknat fält, CPU/GPU-fel, saknat GPU-bevis, varm p90 >20000 ms, saknad casegranskning, okänd caseId och ändrat adapter-/prompt-/suite-/configHash: lokal nekning.
Testa godkänd classify men nekad summarize: endast classify kan väljas. Vid flera godkända kandidater väljs lägst uppmätt varm p90 för samma taskType, därefter fast kandidatordning. Ny modellversion kräver ny kvalificering. Ingen test får skapa nätverk till OpenAI/Codex.
- [x] **Step 2: Kör** `node --test workers/local-models/qualification.test.mjs`; förvänta FAIL.
- [x] **Step 3: Implementera ren, deterministisk logik.** Agent kan neka men aldrig övertrumfa misslyckad kontroll. Endast samma uppgiftstyp och identitetsversion kan ärva godkännandet. Inga schema-/kvalitetskontroller tas bort för att få en kandidat godkänd.
- [x] **Step 4: Kör hela lokala enhetspaketet**; förvänta 0 fel och verifierat dispatched:false för eskalering.
- [x] **Step 5: Commit:** `feat(local-models): require independent review before qualification`.

### Task 5: Ägd portable Ollama-runtime och GPU-förkontroll
**Files:** Create scripts/runtime.ps1, scripts/preflight.ps1 och scripts/runtime.test.mjs.
**Interfaces:** runtime.ps1 -Action Prepare|Start|Status|Stop -RuntimeRoot <this-worktree-local-root>. Scriptet accepterar ingen exekverbar sökväg eller godtycklig URL från modelljobb.
Preflight ger JSON med OS, Node-version, ledig disk, verifierad runtimeversion, bind-adress, GPU-status, modellidentitet och ägd processstatus; hemligheter läses inte.
Prepare är separat från Start och utför aldrig inferens. Stop kräver matchande journal över PID, starttid och executablePath från eget Start och får annars vägra.

- [x] **Step 1: Skriv runtime.test.mjs** med PowerShell AST-parsning och isolerad kontroll av checksummevalidering. En pytteliten testfil med fel SHA måste nekas före extraktion och får inte ändra andra filer. Preflight för upptagen port rapporterar blocked och startar/stänger ingen tjänst. Tester får aldrig ladda ned distribution eller modeller.
- [x] **Step 2: Kör** `node --test workers/local-models/scripts/runtime.test.mjs`; förvänta FAIL.
- [x] **Step 3: Implementera versionsbunden officiell runtime.** Kontrollerad kandidat vid planering: Ollama v0.40.5, ollama-windows-amd64.zip, 1471226485 byte, SHA-256 5134ce7e3bc8e94d0494721c799ec293b429450d0c52461b0ee3647dd3bb4bb7.
Verifiera att officiell release/sha256sum fortfarande överensstämmer före hämtning; avvikelse stoppar och kräver dokumenterat nytt versionsval, ingen flytande latest.
Processlokala miljövariabler inklusive OLLAMA_MODELS pekar mot runtimeområdet. Hämta modell via ägd Ollama-binary och officiellt allowlistat taggnamn; kontrollera digest/Q4_K_M/backend innan inferens. Håll högst en modell laddad. En kandidat som inte kan laddas fullt på GPU markeras blockerad.
Kontrollera bind-adress via OS och faktisk GPU-placering under last via ägd ollama ps samt nvidia-smi; en lyckad HTTP-respons är inte GPU-bevis.
- [x] **Step 4: Kör skripttester och läsbaserad preflight**; förvänta 0 testfel och inga globala inställningsändringar. Inga livehämtningar före godkänd plan.
- [x] **Step 5: Commit:** `feat(local-models): manage isolated verified Ollama runtime`.

### Task 6: Verkliga kandidatprov, separat agentbedömning och leverans
**Files:** Create accept.mjs, accept.test.mjs, README.md och docs/architecture/local-models/2026-10-17-verification.md. Alla råa kör-/granskningsfiler förblir ignorerade.
**Interfaces:** `node workers/local-models/accept.mjs run --candidate <id>` kör ett synligt explicit livepaket, `... assess --report <path> --review <path>` binder separat granskat underlag; båda måste ange scope local_evaluation_only.
README ger PowerShell-kommandon för Prepare/Start, varje kandidatprov, granskning, Stop och felåterhämtning. Ingen autostart eller produktionsflagga.

- [x] **Step 1: Skriv accept.test.mjs**: okänd kandidat/kommando ska ge exit 2 utan nätverk; nekad granskning ger ingen lokal kvalificering; missing review ger pending_review; invalid/hashändrad evidens får inte godkännas. `run` måste vara uttryckligt, testimport får inte starta arbete.
- [x] **Step 2: Kör** `node --test workers/local-models/accept.test.mjs`; förvänta FAIL. Implementera CLI/README och kör om; förvänta PASS.
- [x] **Step 3: Kör hela modulens enhetspaket och diffkontroll.** Lista testfiler explicit i PowerShell; importera inte web-appens testsvit eller dess miljö. Dokumentera faktiska antal/fel. Dokumentationskontroller får inte kallas GPU-/livebevis.
- [x] **Step 4: Genomför förkontroll, Prepare och Start på Hultgren** efter planens ägargodkännande. Kör de tre kandidaterna sekventiellt. Varje kandidat ger digestbunden rapport eller explicit blockerare. Gör inget betalt anrop för att jämföra.
- [x] **Step 5: Be separat granskningsagent granska alla kandidaters syntetiska provrapporter, facit och utdata.** Agenten får endast läsa dessa underlag, får inte ändra implementation, trösklar, fixturefacit eller andra grenar. Begär per-task verdict, skäl, fallreferenser och granskarens köridentitet. Underkända/blockerade kandidater ska behållas i jämförelsen.
För sammanfattningar kontrolleras 5/5 svar mot källans fakta; inga uteblivna fall får godkännas. Kör sedan assess med den verkliga granskningen. Hitta inte på reviewer-ID eller godkännande.
- [x] **Step 6: Gör helgrensgranskning med en separat agent** av koden och felvägarna, inklusive transportgränser, granskningens bindning och isolering. Åtgärda verkliga fel i denna worktree och kör berörda tester. Kod-/promptändring som påverkar inferens ogiltigförklarar tidigare kandidatbevis och kräver nya prov/granskning.
- [x] **Step 7: Leverera verifieringsdokument** med godkända uppgiftstyper per kandidat eller escalation_required, faktiska provantal, kall/varm latency, GPU-bevisstatus och begränsningar. Dokumentera att Atlas-molntransport, produktionsgranskningsagent och faktisk OpenAI/Codex-dispatch ännu inte finns i leveransen.
Stoppa bara egen provprocess när proverna är klara; kontrollera att andra tjänster/utcheckningar är orörda av arbetet. Runtime/vikter får ligga kvar ignorerat för nästa steg.
- [x] **Step 8: Commit endast tillåtna käll-/dokumentfiler, push denna gren, uppdatera projektstatus och återrapportera.** Ingen merge/deploy. Rapportera blockerare ärligt om ingen kandidat klarar kvalitet/VRAM/stabilitet.

## Planens självgranskning
- Specens kontrakt/parametrar/gränser: Task 1–2.
- Å/ä/ö/emoji och UTF-8: Task 1–2.
- Timeout under body/redirect/bytetak och samtidiga CLI-processer: Task 2.
- 25 svenska kvalitetsfall, saknade fält och osäker semantik: Task 3.
- Separat agent, evidensbindning, per-task beslut och eskaleringsmål: Task 4 och Task 6.
- Verifierad distribution, GPU och ägd process: Task 5–6.
- Isolation, återställning, inga produktions-/betalda sidoeffekter: globala gränser och Task 5–6.
- Ingen komponent i planen påstår att offline-granskning är kryptografisk identitet, att tester garanterar generell korrekthet eller att Codex redan är inkopplad.

## Historisk handoff före implementation
André har godkänt designen och uttryckligen krävt en separat agents granskning av lokala modellprov. Därefter godkändes Native-genomförande kl. 09:24.
Rekommendation: Native — huvudagenten implementerar task-by-task i samma worktree; separat agent granskar kandidattesterna och en separat helgrensgranskning utförs före leverans.
Alternativ: Subagent-driven — ny implementeringsagent och ny granskare per task, plus kandidatgranskning och helgrensgranskning.
Planen lästes och godkändes med Native som körsätt kl. 09:24 före Task 1. Separat helkodgranskning kördes före de slutliga modellproven eftersom rättningar ändrar evidensidentiteten; mätproblem rättades med röda/gröna regressioner och slutproven kördes om. Separat modellgranskning omfattade alla 75 slutliga svar. Denna plan skapar ingen ny produktionsaktivering.
