# Atlas: första operativa kodagentflödet

Datum: 2026-10-20. Status: designförslag för Andrés granskning. Ingen körbehörighet, ingen produktionsaktivering och ingen ny modell- eller kostnadsbehörighet ges av detta dokument.
Bygger på: `2026-10-18-atlas-first-code-job-design.md` och `2026-10-18-atlas-independent-review-design.md` (godkänd 2026-10-18 19:57). Dessa gäller fortsatt; detta dokument preciserar ingång, agent-/modellval, sammanfattning och godkännandegrind och ger en konkret implementationsordning.

## 1. Nuläge: vad fungerar och vad saknas

Status mäts mot vad som är verifierat med tester eller riktiga prov, inte mot vad som finns som kod.

### Röst och samtal

| Del | Status | Var |
| --- | --- | --- |
| Röstsamtal med Atlas (streaming STT, bekräftade mikrofonturer, bevarat samtal mellan vyer, återupptag efter omstart) | Fungerar, släppt på `main` | `lib/atlas/live-voice`, `lib/atlas/voice-pilot`, `/api/atlas/voice-pilot/{speech,stream}` |
| Kostnadsstyrda röstanrop (reservation och avräkning) | Fungerar på `main` | `lib/cost/governed-spend.ts`, settlement-tester |
| Textchatt med Atlas, Mission/Delegation/WorkPackage | Fungerar på `main` | `lib/atlas/{conversation,mission,delegation,workpackage}` |
| Röst eller text → föreslaget kodjobb | **Saknas.** Samtalet skapar inga kodjobbsförslag; kodjobb föreslås i dag bara via operatörsgränsen `POST /api/atlas/code-work` | `lib/atlas/code-work/control-plane/operator-write.ts` |
| Kodjobbsstatus i samtalet | **Saknas** (det finns detalj- och granskningskort i UI, men ingen koppling till samtalet) | `components/platform/vnext/CodeWork*.tsx` |

### Kodarbetsflödet

| Del | Status |
| --- | --- |
| Kodjobbskontrakt, admission, beständigt tillstånd, operatörsgranskning (SDF-1A/1B) | Fungerar på `main` |
| Betrodd brokeridentitet, enrollment, claim/recover/heartbeat, kontrollkanal (SDF-1C1/1C2) | Fungerar på `main` |
| Windowsidentitet (CNG), värdkvalificering, skyddade worktrees, sandboxprov | Verifierat på grenen, inte på `main` |
| Pinnad Windows-källmaterialisering och offline Node-fixture | Verifierat på grenen |
| Levande körunderlag (execution lease) och irreversibel stoppgrind | Verifierat på grenen; API avstängt som standard (`ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED`) |
| Kooperativt nativestopp med riktiga försök A–D | Verifierat på grenen (`48034ba`); två oberoende granskningar |
| Granskningskontrakt och beständig, rollbunden granskningslagring | Verifierat på grenen |
| Guarden förbrukas en gång | **Saknas**; RED-tester finns, plan `2026-10-20-guard-single-use.md` |
| Modellanrop för kodagenten (`claude_patch_v1`) och applicering av strukturerade filändringar i arbetskopian | **Saknas** (adaptern är registrerad, men anropas inte; registrerat modell-ID är gammalt) |
| Fasta testkommandon körda i sandboxen mot arbetskopian, med evidens | **Delvis**: fixture-tester körs i den frysta imagen; jobbets egna registrerade kommandon kopplas inte in än |
| Fryst granskningspaket, oberoende AI-granskare och agentmeddelanden | **Saknas** som körande flöde (kontrakt och lagring finns) |
| Sammanfattning och godkännandegrind för merge | **Saknas** |
| Merge, PR och driftsättning | Medvetet **inte** en Atlasförmåga |

Slutsats: säkerhetsgrunden för isolering och avbrott är på plats. Det som återstår är själva arbetsslingan: modell, patch, test och granskning, samt ingången från samtalet och resultatvyn.

## 2. Målflödet

1. **Uppdrag.** André säger eller skriver ett uppdrag. Atlas formulerar ett konkret kodjobbsförslag: projekt, repository, mål, avgränsning, föreslagna tester, risknivå, föreslagen agent/modell och kostnadstak. Förslaget skapas via den befintliga Mission/WorkPackage-gränsen och visas för André. Inget arbete startar på ett förslag.
2. **Godkännande av start.** André godkänner den exakta versionen av förslaget, med budget. Ett allmänt "ja" i samtalet godkänner bara den version som visas. Ändras förslaget krävs nytt godkännande.
3. **Val av agent och modell.** Valet görs av deterministisk serverkod utifrån registrerade profiler, inte av modellen. Se avsnitt 3.
4. **Isolerad körning.** Brokern på Windowsdatorn tar jobbet (claim och fence), materialiserar godkända filer till en egen arbetskopia, och kodagenten lämnar strukturerade filändringar som brokern validerar och applicerar i kopian. Allt under ett levande körunderlag; varje stopp gäller omedelbart.
5. **Automatiska kontroller.** Registrerade kommandon i sandboxen utan nätverk: typkontroll, berörda testsviter, `git diff --check`-motsvarighet och fasta säkerhetskontroller (scope, filantal, diffstorlek, otillåtna sökvägar, hemlighetsmönster). Noll körda tester räknas som underkänt.
6. **Oberoende granskning.** Servern fryser ett granskningspaket. En separat granskare (egen session och aktör, gärna annan modell) bedömer paketet innan den ser kodagentens förklaringar. Högst två kandidatversioner; därefter stannar jobbet för Andrés beslut.
7. **Sammanfattning.** Atlas visar vad som ändrats (filer, diff), testresultat med verkliga kommandon och exitkoder, granskningens fynd och kvarvarande risker. Underlaget härleds ur sparade kvitton, inte ur modellens berättelse.
8. **Mänskligt godkännande.** André godkänner ett exakt paket för vidare hantering. Första versionen ger en bevarad arbetskopia, diff och bevis. Merge och driftsättning gör André själv; de blir aldrig en Atlasförmåga utan en separat design och ett separat godkännande.

## 3. Agent- och modellval med hänsyn till kostnad

- Kodagenter registreras som slutna profiler i `worker-registry` (adapter, version, leverantör, exakt modell-ID, protokoll, inga verktyg, inget skal, ingen git, inget nätverk). Första versionen: en adapter, `claude_patch_v1`, med tre profiler som skiljer sig enbart i modell och tak:
  - `small`: snabb, billig modell för små, väl avgränsade ändringar (1–2 filer, låg risk).
  - `standard`: standardmodell för vanliga buggar och mindre funktioner.
  - `complex`: starkaste modellen för ändringar med flera filer eller hög svårighet. Kräver uttryckligt godkännande per jobb.
- Servern väljer profil utifrån WorkPackage-data (antal filer i scope, risknivå, typ av uppdrag) och det godkända kostnadstaket. Atlas föreslår; André kan välja en annan profil inom samma registrering. Modellen kan aldrig välja eller höja sin egen profil.
- Granskaren använder en separat profil. Standard: en annan modell än kodagenten, minst lika stark för säkerhetsrelevanta filer.
- Kostnad: varje jobb har ett positivt tak i kronor eller dollar som reserveras via `governed-spend` före första anrop, med delbelopp för granskning. Uppskattningen visas i förslaget. Saknad gräns stoppar. Inga prenumerationer antas ingå.
- Att lägga till eller ändra en modellprofil, ett modell-ID eller ett tak är en ändring av säkerhetsgränsen och kräver Andrés uttryckliga godkännande, granskning och test. Det registrerade modell-ID:t (`claude-sonnet-4-6`) behöver uppdateras i ett eget, granskat steg.
- Andra kodagenter (t.ex. en lokal agent med skalåtkomst) är inte med i första versionen. De kräver en egen behörighetsmodell, eftersom de bryter mot "inga verktyg, inget skal".

## 4. Säkerhetsgränser som aldrig får passeras

- Atlas får aldrig godkänna, ändra eller kringgå sina egna säkerhetsgränser eller godkännandeprocessen. Det gäller identitet, behörigheter, policyer, registry för kommandon/agenter/modeller, kostnadstak, produktionsnycklar, publicering, körunderlag, stoppgrind och granskningskrav.
- Ett jobb som berör sådana filer klassas automatiskt som hög risk. Det kräver separat mandat, den starkaste granskningsprofilen och Andrés uttryckliga godkännande av exakt paket. Ett pågående jobb får aldrig använda sin egen ändring som auktoritet.
- Kodagenten och granskaren skriver aldrig i ordinarie checkout och har ingen git-, push-, merge- eller deploymöjlighet.
- Modelltext, repoinnehåll och loggar är opålitlig indata. Ett informellt "godkänt" från en agent ger ingenting.
- Ett misslyckat säkerhetstest stoppar jobbet. Det får inte kringgås, märkas om eller räknas som känt basfel utan Andrés beslut.

## 5. Implementationsordning (varje steg för sig: plan → godkännande → RED → GREEN → granskning)

| Steg | Innehåll | Säkerhetskritiskt | Bevis |
| --- | --- | --- | --- |
| 0 | Guarden förbrukas en gång, plus granskningens bryggfynd (`finished`-flagga, orsaksattribuering, gräns efter kill) | Ja | RED finns; A–D körs om en gång |
| 1 | Merge-förberedelse av grenen till `main` via PR som André granskar, med alla flaggor av | Nej (ingen ny förmåga) | full kontroll; André mergar själv |
| 2 | Modellprofiler och aktuellt modell-ID i `worker-registry`; kostnadsuppskattning och reservation per jobb | Ja | kontrakts- och spendtester; ingen betald körning |
| 3 | Kodagentslinga i brokern: hämta godkänd kontext, ett betalt anrop inom tak, validera och applicera strukturerade ändringar i arbetskopian | Ja | fake-modell först; därefter ett betalt prov med uttryckligt litet tak |
| 4 | Registrerade testkommandon för jobbet i sandboxen och evidens (kommando, exitkod, tid, utdatahash) | Ja | riktiga sandboxkörningar, felvägar |
| 5 | Fryst granskningspaket, oberoende granskare och agentmeddelanden enligt granskningsspecifikationen | Ja | specifikationens godkännandebevis 1–9 |
| 6 | Samtalsingång: röst/text → kodjobbsförslag med agent, modell, tak och risk; godkännande binds till exakt version | Delvis (godkännandegränsen) | e2e-test med fake-broker |
| 7 | Status och sammanfattning i samtalet och vyn; godkännande av paket | Nej | UI- och kontraktstester |
| 8 | Första riktiga, lilla Omnira-buggjobbet med lågt tak; André granskar och mergar själv | — | specifikationens godkännandebevis 7 |

Steg 1 kan göras tidigt och parallellt, eftersom allt redan är avstängt som standard. Det minskar risken med en lång, avvikande gren. Steg 2–5 kan prövas helt med fakes innan någon betald körning görs, vilket håller kostnaden nere.

## 6. Kostnadsmedvetenhet

- Inga betalda anrop förrän steg 3, och då bara med uttryckligt tak per prov.
- Standardprofil för vanliga jobb. `complex` och den starkaste granskningsprofilen bara när risk eller omfattning kräver det.
- Fakes och inspelade svar för all utveckling av slingan; riktiga anrop endast för slutbevis.
- Granskningen ingår i jobbets totala tak och får ingen dold egen budget.

## 7. Öppna beslut för André

1. Godkänna steg 0 (guarden) inklusive en ny körning av A–D en gång vardera.
2. Om grenen ska förberedas för PR mot `main` nu (steg 1).
3. Vilka modeller som ska ligga i profilerna `small`/`standard`/`complex` och granskaren, och standardtaket per jobb.
4. Om första riktiga jobbet ska vara i Omnira (rekommenderas) och vilken bugg.
