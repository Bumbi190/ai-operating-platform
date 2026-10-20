# Plan: första operativa kodagentflödet (text först) med UI-fixturen

Datum: 2026-10-20. Status: plan; två blockerare kräver beslut innan end-to-end kan köras.
Bygger på: `docs/superpowers/specs/2026-10-20-atlas-operational-code-agent-flow-design.md`, `2026-10-20-model-router-and-first-job.md` och routern i `apps/web/lib/atlas/code-work/model-routing/model-router.ts` (`194ed2e`).

## Blockerare

### 1. Lokala modeller kan inte laddas

Windows har slut på commit-minne (cirka 2–3 GB ledigt av 63,8 GB). Grafikkortet har cirka 10 GB ledigt, men WDDM kräver commit för CUDA-allokeringar, och laddningen av `qwen2.5-coder:7b` fallerar med `cudaMalloc failed: out of memory`. Minnet hålls av cirka 50 node-processer från andra arbetsflöden: dev-servrar sedan 15–19 oktober, Remotion, e2e-servrar och hängande `npx supabase migration new`. Dessutom tar WSL cirka 8 GB. Agenten stänger inga processer den inte startat.

Åtgärd: André frigör minne eller startar om datorn. Därefter körs kvalificeringen direkt, gratis och lokalt: nio uppgifter × tre omgångar per modell med Omniras patchprotokoll, inklusive fixturfelet och ett test mot promptinjektion.

### 2. Betalda modeller kan inte få bevisbara hårda tak än

Omniras befintliga takkedja prisar indata efter hela kontextfönstret när det saknas ett verifierat indatatak:

| Modell | Värsta fall per anrop | Godkänt tak |
| --- | --- | --- |
| GPT-5.4 Mini | cirka 3,3 kr | 2 kr (kodagent) / 3 kr (granskare) |
| Claude Sonnet 5.5 | cirka 22 kr | 10 kr |
| Claude Haiku 5.5 | cirka 5,3 kr | 3 kr |

Routern nekar därför dessa anrop. Det är avsiktligt och testat.

Mekanismen för verifierat indatatak finns redan (`lib/cost/qualified-text-budget.ts`: UTF-8-byte är en övre gräns för token med byte-baserad BPE, plus en fast rollöverhead). Den är begränsad till local-text, och tokenizerevidensen saknas (`readCloudTextProfile()` returnerar `null`).

Alternativ:
- **A (rekommenderas för GPT):** ta fram tokenizerevidens för `gpt-5.4-mini-2026-03-17`, dvs. att o200k-vokabulären är byte-baserad BPE där varje token täcker minst en byte, samt rollöverheaden. Utvidga `qualified-text-budget` med operationerna `code_work.patch` och `code_work.review`, med fasta gränser för in- och utdata. Kräver hämtning av OpenAI:s publika tokenizerfil, en nätverkshämtning som behöver ditt godkännande. Då blir Standard (cirka 0,35 kr per typiskt anrop) och GPT-granskaren bevisbart hårda inom 2 och 3 kr.
- **B (Claude):** Anthropics tokenizer är inte publik, och deras räknetjänst är uttryckligen en uppskattning. Ett hårt tak kan inte bevisas på samma sätt. Välj mellan:
  - (1) använda Claude först när evidens finns,
  - (2) godkänna en uppskattning med marginal som ett uttryckligt undantag (inte ett bevisat hårt tak),
  - (3) höja Complex-taket så att det täcker fönstret (cirka 22 kr reserveras per anrop, verklig kostnad blir oftast några kronor).

  Rekommendation: (1). För granskning av GPT-författade ändringar används tills vidare en lokal granskare från en annan modellfamilj.
- **C (gratis granskare):** ladda ner en lokal granskare från en annan familj än Qwen, t.ex. `gemma3:12b` (cirka 8 GB) eller `llama3.1:8b` (cirka 4,9 GB), och kvalificera den för granskning. Då kan hela första jobbet köras för 0 kr i API-avgift.

## Flödet (återanvänder befintliga delar)

1. **Ingång (text först):** ett uppdrag i Atlaschatten blir ett kodjobbsförslag via den befintliga operatörsgränsen (`POST /api/atlas/code-work` → `proposeOperatorCodeWork`), med Mission, WorkPackage och admission. Routern lägger till förslag på profil, tak och granskare. Röst använder samma väg via befintlig STT senare.
2. **Godkännande:** du godkänner exakt version, profil och tak (befintlig auktorisering). Inget arbete startar på ett förslag.
3. **Isolerad körning (brokern på Windows):** claim och körunderlag (lease) med en engångsguard. Godkända filer materialiseras till en arbetskopia. Kodagenten (Small lokalt via loopback, eller Standard via servern) lämnar `sdf1.structured_file_ops.v1`. Brokern validerar mot `validateStructuredPatch` och admissionens filgränser och applicerar i kopian.
4. **Tester och kontroller:** det registrerade testkommandot körs i sandboxen utan nätverk. Evidens sparas: kommando, exitkod, tid och utdatahash. Noll körda tester är underkänt.
5. **Oberoende granskning:** fryst paket (diff, test, uppdrag) och en granskare från en annan familj som aldrig ser kodagentens förklaringar först. Resultatet sparas i den befintliga granskningslagringen.
6. **Sammanfattning och ditt godkännande:** Atlas visar diff, testresultat, granskning, faktisk kostnad och tid ur sparade kvitton. Merge och driftsättning gör du själv.

## UI-fixturen

- En lokal gren `atlas/fixture-display-labels` (pushas aldrig) skapas från grenens HEAD i en separat worktree. Etiketterna i `apps/web/lib/ui/display-preferences.ts` byts plats, och det befintliga `display-preferences.test.ts` blir rött.
- Uppdraget ("Etiketterna för visningsstorlek är omkastade, rätta dem") ges som text.
- Godkänt jobb: patchen ändrar bara den filen, testet går från rött till grönt i sandboxen, granskaren lämnar `passed`, och rapporten redovisar kostnad, tid, modellval, ändring, test och granskning. Fixturgrenen och worktreen tas bort efteråt.

## Ordning efter beslut

1. Kvalificering av lokala modeller (blockerare 1).
2. Antingen alternativ A eller C för granskaren, så att första jobbet kan köras inom tak.
3. Slingan i brokern (patch, applicering, test, evidens) med fakes först, RED → GREEN, och därefter oberoende granskning.
4. Ingången via text, statusvyn och rapporten.
5. Fullständigt test med UI-fixturen.
