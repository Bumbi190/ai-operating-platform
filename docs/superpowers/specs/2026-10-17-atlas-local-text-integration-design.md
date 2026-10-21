# Atlas lokal textkörning — integrationsdesign

Datum: 2026-10-17. Status: konkret förslag för ägargranskning, inte godkänd implementation eller aktivering.
Arbetsspår: `codex/atlas-local-models-20261017`. Pilotbas: `d1fd17928087c20295bdbaeae88672b9995894e5`.
Läst huvudkod: `origin/main` vid `c518c30`. Inga andra arbetsgrenar importeras eller ändras av detta dokument.

## 1. Avsikt och gräns

André behåller RTX 3060 12 GB och 16 GB RAM. Datorn ska kunna fungera som hemmabaserad AI-server. Atlas ska välja en lämplig, verifierad lokal specialist för enkla jobb och få ett granskat resultat tillbaka. Uppgifter som saknar godkänd lokal väg ska kunna eskaleras inom befintlig projektbehörighet och budget. Problem och mänskliga beslut ska vara synliga i Omnira.

Jag tolkar önskemålet om meddelandeplan som aviseringar vid driftproblem och beslut. Första leveransen använder Omniras Aktivitet och Granskningar. Extern mobilpush, SMS, telefoni och e-postleverans är inte verifierade för detta nya flöde och ingår inte som utlovad funktion.

Detta är en vertikal integrationsleverans: en projektbunden textuppgift från Atlas genom en säker kö till datorn, granskning, kvitto och kontrollerad eskalering. Den ersätter inte Atlas huvudmodell, röstflöde, byggstudio, befintliga kodworkers eller övriga projekts publicering. Den första piloten ger endast förslag; inga kundmeddelanden, kodändringar, publiceringar eller ekonomiska åtgärder utförs av lokalmodellen.

Ollama är körmiljön och NVIDIA-kortet accelererar samma lokala körning. NVIDIA-hostade API:er/NIM är en separat provider-/deploymentväg. FreeLLMAPI, nya NVIDIA-tjänster och automatiska modellnedladdningar ingår inte.

## 2. Verifierat nuläge

| Del | Lästa bevis | Konsekvens |
| --- | --- | --- |
| Lokal inferens | `docs/architecture/local-models/2026-10-17-verification.md`: tre kandidater, 75 slutliga kvalitetsfall, verklig GPU-körning, separat agentgranskning | Lokal motor finns; godkännandet gäller det fasta provpaketet |
| Atlas modellprofil | `apps/web/lib/ai/atlas-model-policy.ts`: standard/openai_economy, `localAvailable:false` | Ingen dynamisk lokal routing finns här ännu |
| Atlas chatt | `apps/web/app/api/chat/route.ts`: modellpolicy, TOOLS, executeTool, projekt-/konversationskontroller och SSE | Lägg till ett smalt asynkront verktyg; ersätt inte chatthjärnan eller dess loop |
| Modellista | `apps/web/lib/ai/models.ts` har namn som inte alla routas av `runner.ts` | Ett namn i en lista bevisar inte en fungerande adapter |
| Molnkörning | `apps/web/lib/ai/runner.ts` har styrda Anthropic-/OpenAI-anrop och dispatch-/avbrottssemantik | Eskalering och granskningsanrop ska använda dessa gränser |
| Kodworker | `apps/web/lib/atlas/code-work/worker-registry.ts` registrerar Claude patch, inte en körbar Codex-worker | `codex_worker` från piloten är ett rekommenderat mål, inte en färdig integration |
| Broker | Kontrollkanalen har signerade principaler, claims och fences; lokal nyckelimplementation är Mac-specifik | Återanvänd verifierade principer, inte kodbrokerns nycklar eller rättigheter för Windows-textjobb |
| Mänsklig granskning | `apps/web/lib/os/review-queue.ts` härleder ägare/projekt via run; beslut finns i ordinarie approval-route | Återanvänd denna ägargräns; ett lokalt svar får inte besluta åt ägaren |
| Avisering | `approval-notification-behaviour.test.ts` bevisar med mockad e-post att notification följer vunnen statusövergång | Återanvänd deduplicerad händelsesemantik; testet bevisar inte ny mobil-/e-postleverans |

Desktop Commander slutade svara på två läsanrop under inventeringen. Resterande kod lästes via GitHub. Det visar en begränsning i undersökningskanalen, inte bevis för att en framtida lokal worker är offline. Inga ström-, autostart-, nätverks- eller driftinställningar ändrades.

Relevanta passager lästes i Intelligence Fabric kapitel 7 (modellversion, claimed/observed/verified/restricted), 11 (behörighetsfiltrering, profiler, bounded fallback) och 19 (lokala noder, placering, privat data och ingen governance-bypass). Detta förslag påstår inte full konformitet med hela Fabric-boken.

## 3. Alternativ och valt förslag

1. **Rekommenderat: utgående Windows-worker + serverägd modellpolicy och beständig kö.** Datorn hämtar jobb över HTTPS, Ollama stannar på loopback. Jobbet överlever en stängd chatt och varje steg kan spåras. Kräver en ny begränsad textworkeridentitet och kö.
2. **Privat gateway/VPN med direktanrop.** Kan fungera, men behöver separat nätverksåtkomst, fortfarande jobb-/resultatbindning och felåterhämtning. Ger inget tydligt mervärde för denna första asynkrona textpilot.

Val: alternativ 1. Modellvalet är deterministisk policy på kontrollerad metadata, inte en fri modell som hittar på modellnamn eller endpoint. Atlas uttrycker uppgift och krav; servern avgör vad som är tillåtet och körbart.

## 4. Liten resurskatalog och modellval

Skilj på modellfamilj, exakt modellversion/digest, körmiljö/provider, deployment på datorn, förmåga och faktisk beredskap. Katalogen är en liten implementation av dessa begrepp, inte en parallell generell Fabric-plattform.

Varje kandidatpost innehåller stabilt internt ID, exakt digest, Ollama-/adapter-/prompt-/schema-/konfigurationsversion, distributionshashar, tillåtna uppgiftstyper, språk, indatagräns, lokal provrapport och separat granskningsreferens. Driftstatus och projektets tillstånd lagras separat från benchmarkgodkännandet. Alias som `qwen3.5:4b` räcker inte som versionsbevis.

Status ska skilja mellan upptäckt, installerad, provad, godkänd för provpaket, antagen för projektpilot, tillgänglig och pausad/återkallad. Ingen status ger automatiskt nästa status. Nya modeller kan föreslås och provköras genom samma kvalificering, men laddas inte ned, uppdateras eller blir produktionsvalbara på eget initiativ.

| Uppgift | Första kandidat att kvalificera för Atlas-pilot | Alternativ/begränsning |
| --- | --- | --- |
| Klassificering | Qwen3.5 4B, 9/10 i provpaketet | Qwen3.5 9B, 10/10, är ett separat godkänt lokalt alternativ |
| Extraktion | Qwen3.5 4B, 9/10, noll påhittade saknade fält | De två större kandidaterna är nekade för denna uppgift |
| Sammanfattning | Qwen3 8B, 5/5 faktatrogna enligt separat agent | Qwen3.5-kandidaterna är nekade för denna uppgift |
| Fri dialog, planering, verktygsval | Befintlig kvalificerad Atlas-molnväg | Ingen lokal behörighet från dessa tre textprov |
| Kodarbete | Befintligt kodflöde respektive separat Codex-integration | Lokal textworker får inga shell-, Git- eller skrivrättigheter |

Ny profil: `local_assist_v1`, uttryckligt aktiverad per pilotprojekt. Den är en policy för hjälpuppgifter och ändrar inte innebörden av dagens `ATLAS_MODEL_PROFILE` för huvudchatten.

Urvalet sker i följande ordning:
1. Fastställ kanonisk uppgift, projekt, dataklass, kvalitetskrav, tidsgräns och gällande budget/placering från serverkontrollerad kontext. Ingen första-projekt-fallback.
2. Uteslut kandidater som saknar verifierad adapter, rätt uppgift, aktuellt versionsbevis, projektets pilotantagande, tillåten dataplacering, godkänd licens/användning, kapacitet eller färsk hälsa. Okänt bevis innebär inte tillstånd.
3. Följ profilens uppgiftsbundna förstaval. Ett redan laddat, lika behörigt alternativ kan återanvändas om det uppfyller samma kvalitetskrav och deadline; bytet får ett nytt spårbart beslut. Undvik modellbyte enbart för en obestyrkt millisekundsvinst i tio mätningar.
4. Vid högre krav kan en annan kvalificerad kandidat väljas före dispatch. Ingen generell slutsats att större modell alltid är bättre.
5. Om ingen lokal kandidat är behörig: välj en uttryckligen tillåten molnväg eller `needs_input` med begripligt skäl. Frågan får inte omformuleras till en annan förmåga för att få ett lokalt svar.

Ett SelectionDecision sparar jobbreferens, projekt, policyversion, exakt kandidat/version/deployment, uteslutningsskäl, hälsobevisets tid, kvalitetsbevis, förväntad kostnad inklusive granskning, osäkerhet, giltighet och fallbackpolicy. Det omvalideras före dispatch. Lokal API-avgift kan vara noll; total elkostnad får vara okänd.

## 5. Jobbflöde och första användning i Atlas

Nya serververktyg: `request_local_text_job` och `get_local_text_job`. De läggs som en smal handler bredvid befintliga handler-familjer i chattrouten. De är inte tillgängliga i byggstudions eller röstens specialflöden i första piloten.

Första användningsfall: ägaren ber Atlas klassificera, extrahera eller sammanfatta en avgränsad text inom ett uttryckligt valt pilotprojekt. Atlas får inget verktyg för att välja godtycklig provider, modell, endpoint, prompt eller genereringsinställning. Projekt- och konversationsägande verifieras server-side innan något jobb skapas.

Verktyget returnerar omedelbart ett jobbkvitto, inte ett påstått färdigt svar. En beständig statusvy visar köad, körs, granskas, klar eller behöver åtgärd. Status hämtas via en ägarbunden read-route med kort polling; ingen 90-sekunders generering hålls öppen inne i chattens verktygsloop. Resultatet kan hämtas i samma konversation och syns i Aktivitet även efter omladdning.

Logisk kedja: auktoriserad begäran → urvalsbeslut → kö → enhetsclaim → lokal inferens → mottaget men ej godkänt resultat → separat kvalitetsgranskning → slutresultat eller styrd eskalering. Maskinell kvalitetsgranskning och ägarens godkännande av en faktisk affärsåtgärd är olika saker.

Kön och mottagandet bygger vidare på befintliga run-, claim-, stopp- och projektgränser. Textjobb får egna lagringsobjekt för enheter, projektbundna deployment-antaganden, jobb, försök och granskningskvitton. Kodbrokerns tabeller eller credentials får inte återanvändas som om de gav texträttigheter. Privilegierade övergångar är atomiska, med explicit ägare, projekt, aktuell claim och fence. RLS skyddar klientens läsmodell; worker kan bara använda de smala serveroperationerna, inte en service-role-nyckel på datorn.

Arbetslivscykel: `queued -> claimed -> running -> reviewing -> succeeded`. Alternativa grenar är `escalation_pending`, `needs_input`, `failed`, `cancelled` och `reconciling`. Ett transportfel efter möjlig dispatch går till `reconciling`, inte direkt tillbaka till kö eller vidare till en annan modell. Sena resultat från utgången claim kan sparas som försenat bevis men får inte färdigställa eller skriva över jobbet.

Varje försök binds till jobb-ID, inputhash, task/schema, exakt modell/admission, enhets-ID, claim-ID/fence, start-/sluttid, faktiskt resultat eller fast felkod samt token-/tidsmetadata. Endast ett vinnande slutresultat får publiceras för ett jobb. Återanrop med samma idempotensnyckel lämnar samma kvitto; ändrad indata med samma nyckel nekas.

Första piloten accepterar endast syntetisk eller uttryckligen godkänd text som får hanteras i Atlas molnkontrollplan och hos granskningsprovidern. Okänd dataklass, hemligheter och krav på fullständigt lokal/offline behandling nekas här. Lokal inferens är inte ett löfte om att hela Atlasflödet är offline eller lokalt privat. Ett jobb löper ut 24 timmar efter skapandet om det inte redan har avslutats. Råa jobb-/resultatpayloads rensas senast vid samma 24-timmarsgräns, eller tidigare enligt projektets kortare policy; hashade kvitton och icke-innehållsbärande mätvärden behålls högst 90 dagar. Utgångna råresultat får inte användas till ett nytt godkännande. En approval-projektion får därför inte behålla en extra råkopia eller fortsätta vara beslutsbar efter utgången.

## 6. Windows-worker, anslutning och drift

Worker initierar enbart utgående HTTPS till en fast operatörskonfigurerad Omnira-origin. Jobb får inte styra URL eller filsystem. Ollama är kvar på `127.0.0.1:11434`; ingen routerport, publik Ollama-endpoint eller brandväggsöppning behövs för alternativ 1.

Enheten paras med ägaren i en separat textworkeridentitet med godkända projekt och uppgifter. Använd signerade, versionsbundna requests med serverlagrad enhetsstatus, kort giltighet, monotont räknarvärde, unik nonce och råkroppshash. Nyckeln skyddas i Windows aktuella användares OS-nyckellager med begränsad åtkomst. Ingen Mac Keychain-funktion eller existerande kodbrokeridentitet antas fungera på Windows. En deklarerad binärhash är inte fjärrattestering.

Nödvändiga operationer är enrollment/owner-approval, heartbeat, discover/claim, startbekräftelse, complete/fail och reconcile. Servern härleder enhet, projekt, scope och aktuell claim från den autentiserade identiteten och lagrat jobb; ett JSON-fält skapar ingen behörighet. Återkallad, förlorad eller felaktigt signerad enhet får inga payloads. Överföring och varje tillståndsövergång har storleks-/tidsgränser.

Första kapacitet: en pågående lokal inferens och en laddad modell. Avlastning, modellbyte, GPU-bevis och jobb delar pilotens exklusiva livscykelspärr. Worker inventerar bara installerade allowlistade modeller och deras digests; den skannar inte användarfiler. Ingen automatisk CPU-reservväg eller modelluppdatering aktiveras.

Heartbeat var 15:e sekund, färskhetsgräns 45 sekunder och synlig bortfallsincident efter 90 sekunder. Claim förnyas under jobb. Utgången claim, återkallad enhet eller stoppbeslut ska stoppa nya dispatchar och avbryta det egna pågående anropet. Vid okänt utfall bevaras spärr och avstämningsstatus tills den egna körningens avslut kan styrkas; ingen generell processdödning eller blind låsrensning.

En avgränsad Windows-supervisor ska kunna starta den egna worker/runtime efter operatörens installation och logga hälsa. Driftsättning omfattar ett uttryckligt valt användarkonto, verifierad startmekanism, återstart med begränsad backoff, inga ändrade privilegier, och inga hemligheter i kommandorad eller råloggar. Ett totalt process-/nätverksbortfall får inte lämna projektet låtsat online.

Datorns sömn-/omstartsinställningar, automatisk inloggning, Windows-tjänst/Scheduled Task, credentials och nätverksinställningar ändras inte genom detta designförslag. Genomförandeplanen ska presentera exakt ägd startmekanism och återställning innan den installeras. Slutlig drift måste provas efter worker-krasch och full datoromstart, inte bara i en öppen terminal.

## 7. Granskning, eskalering och kostnad

Befintliga offlinegranskningar är underlag för kandidatantagande, inte en produktionssignatur och inte en granskningsagent som redan är inkopplad. Före projektpilot krävs ett utökat representativt provpaket, ägarens projektantagande och serverbunden, separat granskningsprovenance. Prompt-, modell-, adapter-, runtime- eller gränsändring kräver ny relevant kvalificering.

Varje lokalt resultat passerar först schema-/storleks-/versionskontroll och därefter en separat faktagranskning mot samma källtext. I första piloten är semantisk granskning en styrd molnkörning med separat roll och kort strikt granskningsschema, eller uttrycklig mänsklig granskning om budget saknas. Kandidatmodellen får inte godkänna sig själv. Ett granskningsfel eller okänt utfall är inte ett godkännande.

Kvitto binds till jobbscope, input- och resultathash, exakt kandidatförsök och verklig granskningskörning. Modelltext med ett uppgivet reviewer-ID är inte autentisering. Godkänt maskinresultat får visas i Atlas, men upphäver ingen separat gate för publicering, utskick eller ändringar.

Första policygräns: högst ett lokalt inferensförsök, ett kvalificerat molnförsök för själva uppgiften och en separat granskning av respektive försöksresultat. Det innebär högst tre molnanrop om lokalgranskning följs av molneskalering och ny granskning. Ingen rundgång mellan tre lokala modeller. Ett alternativ kan väljas före dispatch; misslyckad redan-dispatchad lokal uppgift ska vara terminalt avstämd före en ny exekvering.

Molngransknings- och eskaleringsanrop måste gå genom befintliga projektbundna budget-, stopp- och spend-gränser. Saknad budget/behörighet ger `needs_input`, inte obegränsad fallback. Data som inte får lämna sin tillåtna zon får ingen extern granskning eller eskalering. Codex lämnas `unavailable` tills en riktig workeradapter, behörighet och faktisk körning är verifierade; namnet i en beslutspost räcker inte.

Kostnadsrapport visar lokala jobb, faktisk granskningskostnad, eskaleringskostnad, antal underkännanden och okänd lokal driftkostnad. Ingen procentuell besparing utlovas. Att granska varje litet lokalt jobb med en molnmodell kan bli dyrare än ett direkt molnjobb; piloten ska mäta detta innan fler flöden kopplas.

## 8. Aviserings- och åtgärdsplan

| Händelse | Automatisk hantering | Synligt för André |
| --- | --- | --- |
| Datorn bortkopplad >90 s | Stoppa lokal tilldelning; tillåten, ännu ej dispatchad uppgift kan omväljas enligt policy | En deduplicerad incident i Aktivitet med senaste kontakt och påverkan |
| Datorn återhämtad | Återvalidera identitet, modeller, spärr och hälsa före ny tilldelning | Samma incident markeras återställd |
| Giltigt svar nekas av granskare | Avstäm först försöket; därefter högst tillåten eskalering | Orsak och vald väg i jobbkvittot; ingen separat varning för varje normalt reservval |
| Tre verifierade kvalitetsavslag inom senaste 20 försök för samma deployment/uppgift | Pausa den kombinationen tills omkvalificering | En samlad åtgärd i Granskningar; ingen automatisk tröskelsänkning |
| Ändrad digest/adapter eller saknat versionsbevis | Kandidaten blir obehörig | Omprov krävs och berörda uppgifter visas |
| Budget, placering eller godkännande blockerar alla vägar | `needs_input`, inget nytt molnanrop | Ett projektbundet beslut med kostnads-/policyorsak och tydliga alternativ |
| Osäker timeout/processkrasch | `reconciling`; bevara spärr | En åtgärd för verifierad återhämtning, inte ett falskt ”klart” |

Händelser skapas först efter vunnen kanonisk statusövergång, med idempotensnyckel. Samma driftfel ska inte skapa en ny avisering per heartbeat. Aviseringarnas innehåll får inte innehålla råtext eller credentials. Ingen SMS-, telefon- eller e-postsändning görs i denna designfas.

## 9. Kvarstående inträdeskrav och verifiering

Följande måste vara klara innan första verkliga Atlas-pilotjobb får väljas lokalt:

- Stäng pilotens kända gap kring fatal UTF-8-avkodning och bevisad input-/tokenbudget. 3 000 Unicode-kodpunkter garanterar inte 4 096 token. Server och worker ska använda samma begränsning; om full prompt inklusive mall/schema och reserverat outpututrymme inte kan styrkas rymmas, nekas lokal dispatch med `TOKEN_BUDGET_UNVERIFIED` eller `INPUT_TOO_LARGE`. Ingen tyst trunkering eller höjning av kontext utan ny kvalificering.
- Verifiera Windows nyckelskydd, enrollment, projektgräns, replay-skydd, återkallning och serverns atomiska claim/fence. Ingen skarp nyckel eller DB-migration behövs för designgranskningen.
- Binda produktionsantagande och verklig granskningskörning till aktuellt underlag; importera inte `.local-runtime`-JSON som självbemyndigande produktionsdata.
- Säkerställa att inga nya generella modelldispatchar går runt befintliga budget-/stoppgränser och att den lokala workern inte har molnnycklar eller allmän repoåtkomst.

Acceptansprov ska driva det verkliga flödet: Atlasverktyg → ägar-/projektkontroll → kö → Windows-worker → Ollama/GPU → separat granskning → resultatreceipt. Prov ska dessutom täcka fel projekt/konversation, återspelad request, återkallad enhet, parallella claimers, förlorad claim, sent/dubbelt resultat, modellbyte, injection, felaktig UTF-8, för lång kontext, molnförbjuden placering, saknad budget och providerutfall med osäker dispatch.

Driftprov ska omfatta frånkopplat nät, dödad egen worker, own-runtime-krasch och full datoromstart, med bevis att bara egna processer hanteras och att ingen okänd körning startas om. Stopp och avbrott i ordinarie Atlas måste fortfarande vinna. Aviseringsprov ska bevisa exakt en incident respektive återhämtning, inte bara att en komponent finns i koden.

Första levande pilot är manuellt begärda textjobb i ett godkänt projekt, utan affärssidoeffekter. Syntetisk end-to-end-körning görs först. Därefter får en avgränsad uppsättning godkända exempel användas för att bedöma kvalitet, total väntetid inklusive modellbyte/granskning och verklig API-kostnad. Befintliga röst-, byggstudio- och kodflöden ska regressionskontrolleras vid den smala chattintegrationen.

## 10. Genomförandeordning och leveransgräns

1. Stäng lokala kontraktsgap och bind pilotantagandet; omkör relevanta kandidattester och separat granskning efter beteendeändringar.
2. Inför den smala serverpolicyn, ägarbunden kö och Windows-enhetsidentitet med testad claim-/återhämtningssemantik.
3. Koppla den utgående workern och bevisa en syntetisk end-to-end-textuppgift, med en modell åt gången.
4. Koppla oberoende granskning, styrd molneskalering och riktiga kostnadskvitton inom uttryckligt godkänd projektbudget.
5. Koppla de två Atlasverktygen, statuskvittot, Aktivitet och Granskningar. Verifiera att ”startat” och ”klart” skiljs åt även efter omladdning.
6. Installera den granskade ägda startmekanismen, kör drift-/omstartsproven och genomför den begränsade vardagspiloten.

Implementationen ska ske i en egen worktree från då verifierad main med endast våra egna pilotändringar återanvända; andra pågående grenar får inte cherry-pickas, städas eller ändras. Detaljerade migrationsnamn, filuppdelning, kommandon och kostnadstak hör till nästa skriftliga genomförandeplan. Driftsättning, credentials, registrering och betalda prov blir konkreta steg där, inte sidoeffekter av denna spec.

Specens självgranskning: ändamål och hårdvara är uttryckliga; faktisk pilotkvalificering skiljs från produktionsantagande; routing skiljs från myndighet/behörighet; lokalt GPU-stöd skiljs från NVIDIA-API; lokal inferens skiljs från fullständig lokal integritet; granskning och fallback är begränsade och kostnadsförda; okänd dispatch stoppas för avstämning; notiser är projektbundna och deduplicerade. Ingen runtime-, schema-, standardmodell- eller driftändring genomförs i detta dokument.

Nästa beslut: André granskar denna skrivna integrationsdesign. Därefter skrivs genomförandeplan med exakta steg och verifieringar; planens körsätt väljs före produktkod eller aktivering.
