# Plan: modellrouter med hårda SEK-tak och första riktiga kodjobbet

Datum: 2026-10-20. Status: förslag efter Andrés riktlinjer 07:32. Ingen konfiguration, ingen modellhämtning och inget betalt anrop görs innan planen godkänts.
Bygger på: `docs/superpowers/specs/2026-10-20-atlas-operational-code-agent-flow-design.md`.

## 1. Verifierade modellnamn och priser (2026-10-20)

| Profil | Modell | Exakt ID | Pris per 1M token (in/ut) | Källa |
| --- | --- | --- | --- | --- |
| Small | Qwen Coder lokalt via Ollama | `qwen2.5-coder:14b` (Q4_K_M, 9,0 GB, 32K kontext) eller `qwen2.5-coder:7b` (4,7 GB) | 0 kr API-avgift (el och hårdvara tillkommer) | ollama.com/library/qwen2.5-coder |
| Standard | GPT-5.4 Mini | `gpt-5.4-mini-2026-03-17` (pinnad snapshot; aliaset `gpt-5.4-mini` flyter) | 0,75 / 4,50 USD, cachad in 0,075 | developers.openai.com/api/docs/models/gpt-5.4-mini |
| Complex | Claude Sonnet 5.5 | `claude-sonnet-5-5` (inget separat snapshot-ID listas) | 2 / 10 USD, 1M kontext utan tillägg | platform.claude.com/docs/en/about-claude/pricing och models/overview |
| Granskare (billig, annan familj) | Claude Haiku 5.5 eller GPT-5.4 Mini | `claude-haiku-5-5` | Haiku: 0,10 / 0,50 USD upp till 100K token in, därefter 0,50 / 2,50 | samma |

Omnira har redan `gpt-5.4-mini` och dess snapshot med rätt pris i `apps/web/lib/ai/pricing.ts`. Sonnet 5.5 och Haiku 5.5 saknas där, och de modeller som finns (`claude-sonnet-4-6`, `claude-haiku-4-5`) är äldre. Växelkursen hämtas från `cost_rates.usd_sek` med reservvärdet 10,5 i `apps/web/lib/cost/rates.ts`.

### Lokala modeller på RTX 3060 (12 GB VRAM, 16 GB RAM, Ryzen 5 5600G)

- Redan på datorn: portabel Ollama 0.40.5 i worktreen `atlas-local-models-20261017` med `qwen3:8b`, `qwen3.5:4b` och `qwen3.5:9b`. Av dessa är `qwen3.5:9b` kvalificerad, men bara för `classify` (25/25 rätt, p95 750 ms). Ingen är kvalificerad för kod. Ollama körs inte nu och finns inte i PATH.
- Passar helt i VRAM: `qwen2.5-coder:14b` Q4_K_M på cirka 9 GB, med måttlig kontext (cirka 8K) så att KV-cachen får plats, och `qwen2.5-coder:7b` på 4,7 GB med full 32K-kontext.
- Passar inte: `qwen3-coder:30b` (19 GB) och `qwen2.5-coder:32b` (20 GB). Med 16 GB RAM är avlastning till CPU inte stabil, och de väljs inte.
- Stabilitet mäts, den antas inte. Föreslaget prov, som återanvänder local-text-kvalificeringen (fast kandidatlista, digest, GPU-placering via `ollama ps`, 25 fall, p95, ingen CPU-reserv): ladda ned 7b och 14b (cirka 14 GB, kräver ditt godkännande eftersom det är nätverkshämtning) och kör ett kodkorpus med strukturerade filändringar. Godkänt kräver giltig JSON i alla fall, att patchar appliceras och att testet blir grönt. Klarar ingen av dem kraven går Small-jobb till Standard bara om du uttryckligen väljer det, aldrig automatiskt.

## 2. Hårda kostnadstak i SEK

Gäller per jobb och per roll, och omfattar alla anrop och omförsök:

| Roll | Tak | Exempel på ett anrop | Uppskattning |
| --- | --- | --- | --- |
| Kodagent Standard | 2,00 kr | 30K in och 4K ut på GPT-5.4 Mini | cirka 0,43 kr |
| Kodagent Complex | 10,00 kr | 60K in och 8K ut på Sonnet 5.5 | cirka 2,10 kr |
| Granskare | 3,00 kr | 40K in och 3K ut på Haiku 5.5 / GPT-5.4 Mini | cirka 0,06 / 0,46 kr |
| Kodagent Small | 0 kr API | lokal | tid och el redovisas separat |

Regler, verifierade med tester innan något betalt anrop görs:

1. Före varje anrop beräknar servern **värsta fallet**: faktiskt räknade indata-token plus hela `max_output` gånger listpriset gånger en försiktig växelkurs, det högsta av `cost_rates` och 10,5. Ryms det inte i återstående tak görs inget anrop och jobbet stannar med `budget_exhausted`.
2. Beloppet reserveras via den befintliga `governed-spend`/`budget-gate`-kedjan i SEK innan anropet görs, och avräknas mot faktisk användning efteråt. Ett omförsök är ett nytt anrop med ny reservation inom samma tak.
3. Ett anrop vars utfall är okänt (t.ex. tappad anslutning) räknas som fullt förbrukat och skickas inte om i blindo.
4. Ingen automatisk uppgradering till en dyrare profil och ingen automatisk växling till en annan leverantör. Vid fel stannar jobbet och väntar på ditt beslut.
5. Granskningens tak är separat men ingår i jobbets totaltak (planen: 2 + 3 kr för Standard, 10 + 3 kr för Complex).
6. Tak, modell-ID:n och priser ligger i serverns register. Ändringar är ändringar av säkerhetsgränsen och kräver ditt godkännande; modellen och Atlas kan inte ändra dem.

## 3. Val av granskare (annan modellfamilj)

| Kodagent | Granskare (standard) | Motivering |
| --- | --- | --- |
| Small (Qwen, lokal) | GPT-5.4 Mini | annan familj; lokal modell godkänner aldrig ensam |
| Standard (GPT-5.4 Mini) | Claude Haiku 5.5, med indata begränsad under 100K token | annan familj, lägst kostnad |
| Complex (Sonnet 5.5) | GPT-5.4 Mini | annan familj inom 3 kr |

Om en ändring berör säkerhetsrelevanta filer (identitet, behörigheter, policyer, register, tak, körunderlag, stoppgrind, publicering) klassas jobbet som hög risk. Då krävs Complex-granskning inom ett högre tak som du godkänt för just det jobbet, och därefter ditt godkännande av det exakta paketet.

## 4. Kostnadsfria modeller och krediter

- Lokala modeller är förstahandsval när de är kvalificerade för uppgiften.
- Krediter eller gratisnivåer används bara för leverantörer och konton vars villkor inte tillåter träning på eller lagring av vår kod utöver det som är nödvändigt. Vilka det gäller ska du godkänna.
- Krediter går genom samma spendkedja och tak som betalda anrop. Ett gratisanrop är aldrig obegränsat.
- Kod skickas inte till publika gratisendpoints som loggar eller tränar på indata.

## 5. Implementationsordning (efter guarden, varje steg med RED → GREEN och granskning)

1. **Register:** profilerna Small, Standard, Complex och Granskare som slutna poster i `worker-registry`, med exakta ID:n och priser för Sonnet 5.5 och Haiku 5.5 i `pricing.ts`. Inga anrop i det här steget.
2. **Hårda tak:** funktionen för värsta fallet, reservationen och avräkningen, med tester för överskridande, omförsök, okänt utfall, saknad växelkurs och avstängd automatisk uppgradering.
3. **Lokal kvalificering:** efter godkänd nedladdning, kvalificering av `qwen2.5-coder:7b` och `:14b` för strukturerade filändringar. Endast ett godkänt resultat pinnas med digest.
4. **Modelladaptrar:** en gemensam adapter för strukturerade filändringar (befintligt protokoll) med tre transporter: lokal Ollama via brokern på loopback, OpenAI via servern och Anthropic via servern. API-nycklar lämnar aldrig servern.
5. **Slingan i arbetskopian:** validera och applicera ändringar, kör registrerade tester och spara evidens. Allt sker under det levande körunderlaget, och guarden förbrukas en gång.
6. **Granskare och paket**, enligt granskningsspecifikationen.
7. **Ingång och resultat:** uppdrag via röst eller text som blir ett förslag, ditt godkännande av en exakt version, status i samtalet, sammanfattning och ditt godkännande av paketet.

## 6. Första riktiga kodjobbet (kontrollerat UI-scenario)

Förslag: ett kontrollerat scenario i en isolerad arbetskopia, så att resultatet är mätbart och produktion inte påverkas.

- En lokal fixturgren (pushas aldrig) skapas från bas-SHA:n. Den har en medvetet införd enradsbugg i en liten, ren UI-hjälpare för visningsstorlek (`apps/web/lib/ui/display-preferences.ts`, där etiketterna för `DISPLAY_SCALES` byts plats) och ett fallerande regressionstest i den befintliga `display-preferences.test.ts`.
- Uppdraget ges via text eller röst: "Etiketterna för visningsstorlek är omkastade, rätta dem." Atlas föreslår profilen Small. Om Small inte är kvalificerad föreslås Standard, och du väljer.
- Godkänt jobb: patchen ändrar bara den hjälparen, det registrerade testet går från rött till grönt i sandboxen, granskaren lämnar `passed` för det frysta paketet, och sammanfattningen visar diff, test och kostnad. Inget kommer in i ordinarie checkout. Merge görs bara av dig.
- Alternativ om du hellre vill ha en verklig bugg: jag letar upp en befintlig liten UI-bugg och föreslår den innan något görs.

## 7. Godkännanden som behövs

1. Planen i stort, inklusive profiler, tak och granskarval.
2. Nedladdning av `qwen2.5-coder:7b` och `:14b` (cirka 14 GB) till den portabla Ollama-miljön, och kvalificeringskörningen (gratis, lokal).
3. Det första betalda provet: ett anrop till Standard inom 2 kr och en granskning inom 3 kr.
4. Fixturscenariot eller en verklig bugg.
