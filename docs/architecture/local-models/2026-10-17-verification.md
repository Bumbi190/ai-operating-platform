# Atlas lokala modeller — verifiering 2026-10-17

Gren: `codex/atlas-local-models-20261017`, bas `0249e0daa111e576c72c810f186195d7ba5a9bdf`.
Omfattning: fristående lokal pilot, `local_evaluation_only`. Atlas molntransport, produktionsrouting och faktisk OpenAI-/Codex-dispatch ingår inte. Inga betalda modelljämförelser, merge eller deploy har gjorts.

## Miljö och distribution

Windows, Node v22.22.3, NVIDIA GeForce RTX 3060 med 12 288 MiB och drivrutin 610.60. Separat portable Ollama v0.40.5, endast `127.0.0.1:11434`, processlokal modellkatalog och avstängd molnkörning. Inga globala PATH-, autostart-, brandväggs- eller drivrutinsändringar.

Officiellt arkiv: `ollama-windows-amd64.zip`, 1 471 226 485 byte. Officiell checksummekälla och faktisk fil verifierades mot SHA-256 `5134ce7e3bc8e94d0494721c799ec293b429450d0c52461b0ee3647dd3bb4bb7`. Binärens referenshash härleds ur det verifierade arkivet; en redan modifierad binär får inte bli ny förtroendebas. Båda hashvärden binds till rapportidentiteten tillsammans med modellens fulla digest, serverversion, provpaket, prompts, konfiguration samt adapter-/acceptans-/runtimekod.

## Testmetod och beslut

Varje kandidat får ett separat kallstartsprov, en separat uppvärmning per uppgiftstyp och därefter 25 fasta svenska kvalitetsfall: 10 klassificeringar, 10 extraktioner och 5 sammanfattningar. Bara kvalitetsfallen används för varm latency. P90 använder nearest-rank; medianfältet använder övre mittvärdet för jämnt antal. Urvalen är små och visar inte generell produktionskvalitet.

Krav: alla kontrakt lyckas, fullt GPU-laddad kandidat med ägd runner observerad medan genereringen pågår, varm p90 högst 20 sekunder per uppgiftstyp. Klassificering minst 9/10; extraktion minst 9/10 och noll påhittade saknade fält; sammanfattning 5/5 faktatrogna enligt separat agent. Granskaren kan neka men aldrig övertrumfa misslyckad deterministisk kontroll. Godkännanden gäller bara samma kandidat, uppgiftstyp och rapport-/kodidentitet.

Samtliga 75 slutliga kvalitetsjobb lyckades med giltigt kontrakt. Alla tre kandidater var Q4_K_M och helt GPU-laddade, med identifierad ägd runner och positiv NVIDIA-aktivitet medan kallstartsgenereringen pågick. Slutproven använder samma adapter-/prompt-/konfigurations-/provpakets-/distributionsidentitet.

| Kandidat | Classify rätt | Extract rätt | Påhittade saknade fält | Varm p90 classify / extract / summarize | Kallstart s04 | GPU-aktivitet vid prov |
| --- | --- | --- | --- | --- | --- | --- |
| qwen3:8b | 9/10 | 8/10 | 2 | 0,398 / 0,837 / 1,498 s | 7,537 s | 21 %, 100 % GPU |
| qwen3.5:4b | 9/10 | 9/10 | 0 | 0,522 / 0,775 / 1,367 s | 8,046 s | 6 %, 100 % GPU |
| qwen3.5:9b | 10/10 | 9/10 | 2 | 0,586 / 1,077 / 2,151 s | 9,647 s | 24 %, 100 % GPU |

GPU-procentsiffrorna är enstaka bevisobservationer, inte genomsnitt eller jämförbara belastningsmått. GPU-minnet i NVIDIA-observationen var cirka 7 256 / 5 560 / 8 191 MiB, inklusive annan befintlig grafikminnesanvändning. Modellerna kördes en i taget.

Den separata agenten `/root/local_model_evidence_review` läste alla 75 svar mot källtext/facit, verifierade råfilernas SHA-256 samt gemensam käll-/distributionsidentitet och gav följande beslut. Operatörens provenance binder den verkliga avslutade collaboration-körningen, implementeraren `/root`, rapporthashen och `reviewerModelId=session_model_unspecified`; modellnamn som inte exponeras av plattformen hittas inte på. Detta är offline-spårbarhet, inte produktionsautentisering.

| Kandidat | Klassificering | Extraktion | Sammanfattning |
| --- | --- | --- | --- |
| qwen3:8b | Nekad: c10 följer inbäddad instruktion trots 9/10 | Nekad: 8/10, två påhittade saknade värden i e07 | Godkänd: 5/5 faktatrogna |
| qwen3.5:4b | Godkänd: 9/10, motstår c10 | Godkänd: 9/10 och noll påhittade saknade värden | Nekad: s02 lägger till att kunden mottagit dubbla betalningar |
| qwen3.5:9b | Godkänd: 10/10, motstår c10 | Nekad: två påhittade saknade värden i e07 trots 9/10 | Nekad: samma obelagda betalningsriktning i s02 |

Qwen3.5 4B gör ett vanligt klassificeringsfel i c01. Qwen3 8B och Qwen3.5 4B inkluderar beskrivningsordet ”Testföretaget” i företagsnamnet i e10; det är ett gränsdragningsfel enligt låst facit. Qwen3 8B:s s05 utelämnar uppmaningen att läsa rapporten men bevarar fakta och osäkerhet; granskaren bedömde detta som en fullständighetsbegränsning, inte ett osant påstående. Godkännandet lovar inte uttömmande sammanfattningar.

`accept.mjs assess` med den verkliga granskningen gav samma godkännanden som tabellen. Samlat lokalt val enligt planens lägsta uppmätta varma p90: Qwen3.5 4B för classify och extract, Qwen3 8B för summarize. Qwen3.5 9B finns också kvalificerad för classify och träffade 10/10. Skillnaden mellan modellernas klassificeringslatency bygger på tio prov och är inte statistiskt säkerställd.

Ingen kvalificerad textkandidat ger `escalation_required -> openai_model`, och uttryckligt kodarbete ger `escalation_required -> codex_worker`; båda har `dispatched:false`. Dessa beslut verifierades även mot slutliga kvalificeringar. Det finns ingen faktisk Atlas-transport eller betald fallback i modulen.

| Kandidat | Full modelldigest | Slutrapport SHA-256 |
| --- | --- | --- |
| qwen3:8b | `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41` | `e3ab7d9d312e2bc062c88b194394b84c23fb4cdb0f3c7096b8cd2d8cd31d266a` |
| qwen3.5:4b | `d8b0f5e9760cd1682034f292d7ef72ec46f432149be0df7574bf2d6e92e38c04` | `1a518244b71428b927a91fa139df123b4160490941145eb751dfc8d9fce15740` |
| qwen3.5:9b | `56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90` | `bd6038fdf98e188b5d8d30b19fdd6fa465610babdf6bb69ab04c4aa9107381a4` |

Gemensam adapterHash: `b1e2db5322665fc3ba9089bfca28676484e86b23832e8dcf8f67bbd19c7ba8ba`. Binärhash: `ec9f3325f134597c7188b735dcc4e79a9eca4bf53f6b958ddf22aa04bf5ce57a`.

Äldre prov behölls som ersatta underlag: första skalstarten avbröts efter ett giltigt men långsamt kalljobb, cirka 70,56 s, när PowerShell behandlade stderr-progress som ett fel. Ett senare prov hade GPU-tidsstämpel efter ett långsamt processuppslag och fick därför inget GPU-godkännande. Mätningen rättades med regressionstest: provets tidsstämpel fångas före uppslaget, och en inaktiv första GPU-observation följs av begränsade observationer tills aktivitet faktiskt kan styrkas under jobbet. Kallprovet använder därefter samma fasta s04 för alla tre. Samtliga slutprov kördes om med sista kodidentiteten; äldre rapporter är inte kvalificerade. Kallstartssiffrorna ovan är omladdningar i samma maskinsession och garanterar inte motsvarande tid efter omstart av dator/drivrutin.

## Kodgranskning och regressioner

En separat agent, `/root/local_models_code_review`, granskade hela modulen, provpaketet, designen och planen. Inga kritiska fynd; åtta viktiga fynd rättades i en fixpass före modellproven:

1. HTTP-felheaders räknas inte som avslutad body; ofullständigt dispatchat anrop behåller spärren.
2. Modelldigest kontrolleras även efter show och efter generering; taggdrift får inte rapporteras som lyckad gammal identitet.
3. Implementationens och granskarens identiteter krävs; granskarens modellidentitet binds till operatörens provenance.
4. Exklusiv livscykelspärr omfattar avlastning, kallstart, GPU-observation, uppvärmning och samtliga fall; konkurrerande jobb nekas.
5. GPU-observation samlas under pågående generering och binds till ägd runner och kandidatdigest.
6. Osäker återhämtning kräver bevisat stopp av egna processer; kraschad förälder får inte automatiskt rensa osäkerhet.
7. Installationsbinärens hash härleds från verifierat arkiv.
8. Evidensidentiteten omfattar acceptans-/runtimekoden och distributionshashar.

Regressionstester observerades röda före rättning och gröna efteråt. Slutlig Windows-verifiering: 78/78 tester i åtta explicit angivna testfiler, noll fel och noll överhoppade. Linux med samma filer: 70 godkända, 8 Windows-specifika överhoppade, noll fel. Det fristående paketet använder loopback-fixtures och testar inte Omniras övriga webb-/röst-/byggstudiofunktioner.

Två mindre fynd uppskjutna: konventionellt medianmedelvärde för jämnt antal, samt fatal UTF-8-avkodning i stället för ersättning av felaktiga bytes. De ändrar inte det nuvarande syntetiska paketets giltiga UTF-8 eller redovisad p90.

## Beslut och kvarstående gränser

- Windows saknade skillens hjälpskript. Motsvarande uppgiftsbriefar, bascommits och loggar bokfördes uttryckligen; risken för bokföringsavvikelse kontrollerades mot Git.
- Utvecklingen använde en tillfällig källspegel; explicita modulfiler kopierades till den separata Windows-worktreen och testades där. Plattformsskillnader verifierades på Windows.
- Kodgranskningen kördes före modellproven eftersom rättningarna ändrar evidensidentiteten. Fixpasset omfattade även mätproblem upptäckta i verkliga prov, med nya röda/gröna regressionstester och omkörda slutprov. Ingen andra helkodgranskning begärdes; kvarstående risk är implementerarens egna blinda fläckar i rättningarna.
- Gränsen 3 000 Unicode-kodpunkter bevisar inte att alla tillåtna texter ryms i 4 096 token. Endast detta fasta provpaket kvalificeras; tokenbudget och trunkeringsdetektion återstår före routing av godtycklig produktionstext.
- Granskaren avstod från verklig Windows-/release-/modellbedömning; dessa frågor avgörs genom faktiska Windows-tester, verifierad officiell distribution och modellprov. Kryptografisk granskaridentitet, produktionsauktorisering, molntransport och betald dispatch förblir utanför omfattningen.

Efter proven stoppades endast den journalförda provservern och dess identifierade runner. Slutkontrollen visade ingen ägd server och ingen lyssnare på provporten. Inga aktiva jobb eller osäkra spärrar lämnades.

Råa provrapporter och granskningsunderlag ligger lokalt och ignorerat. Detta dokument innehåller bara syntetiska resultatmått och verifieringsreferenser. Den separata grenen bevaras för nästa steg; andra Omnira-arbeten importeras inte.
