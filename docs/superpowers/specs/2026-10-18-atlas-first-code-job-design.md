# Atlas: första genomförda kodjobbet
Datum: 2026-10-18
Status: Förslag för ägargranskning. Ingen körbehörighet eller produktionsaktivering ges av detta dokument.
Bas: ai-operating-platform, main e2316f1eb2a018ce968122eb4d6095b433c0e43c.

## Mål och avgränsning

André ska kunna ge Atlas ett litet kodjobb i ett samtal och få tillbaka en verklig ändring med testresultat och granskningsunderlag. Atlas ska visa arbetets status medan samtalet fortsätter. Den stationära Windowsdatorn är första körvärd.

Första versionen omfattar ett jobb i Omnira åt gången och en kodarbetare. Den levererar en bevarad separat kodkopia, en exakt diff och verifieringsbevis för mänsklig granskning. Git-commit, push, PR-skrivning, merge och deploy ingår inte i arbetarens mandat. De läggs senare till som separata kontrollerade förmågor.

Fler projekt och självstartade underagenter följer efter detta första bevisade flöde. Dokumentet ger en sammanhängande målbild; implementationen delas i små steg som kan granskas och testas var för sig.

## Vad som är verifierat idag

- Mission, DelegationEnvelope och WorkPackage finns. Kodjobb har kontrakt, validering, beständigt tillstånd och operatörsgranskning.
- Det signerade brokerprotokollet har discover, claim, recover och heartbeat. Det levererar ännu inte kodkontext eller kör uppdrag.
- SDF-1C3A har separat worktree och kontroller för en begränsad Docker-sandbox. Kompositionsroten har uttryckligen ingen produktionsanropare.
- Den lokala CLI:n har bara generate, enroll och diagnostic. Identiteten använder Mac Keychain/Secure Enclave.
- Både lokalt och på webbsidan finns ett enda godkänt kodrepo: Omnira, med fasta Mac-sökvägar.
- Två kommandon är registrerade: typecheck och en fast kontraktstestsvit. Registrering innebär inte att de redan körs av Atlas.
- Namnet på den befintliga 1C3B-grenen antyder materialisering, men grenen har inga ändringar efter 1C3A. Inget av detta arbete antas redan färdigt.
- På Windowsvärden finns Node, Git, Docker Desktop och WSL2. Docker svarade med Linux och en microsoft-standard-WSL2-kärna. Detta är en miljöobservation, inte ett godkänt isolationsbevis.
- Den fullständiga Omnira-testsviten har tidigare dokumenterade fel. Ett nytt kodjobb får inte beskrivas som helt grönt genom att dölja dessa.

Källor i repot:
apps/code-broker/src/cli.ts
apps/code-broker/src/isolation/{substrate,registry,docker-host,sandbox-spec}.ts
apps/code-broker/src/protocol/operational-client.ts
apps/web/lib/atlas/code-work/{types,worker-registry,command-registry,capability,patch-protocol}.ts
apps/web/lib/atlas/code-work/mission-translation/translate.ts
docs/autonomy/{README,MISSION-CONTRACT,EVALUATION-GATES,RISK-AND-AUTHORITY}.md

## Val av angreppssätt

Rekommendation: bygg vidare på den befintliga brokern och dess kontrakt, med ett explicit Windowsstöd och därefter en begränsad körslinga. Då behålls projektgränser, kvitton och återkallelse i samma kedja.

Alternativet att först köra enbart på Mac skulle återanvända mer av värdlagret men gör den avsedda stationära servern beroende av Macen. En generell terminalagent skulle ge bredare åtkomst än den befintliga policyn medger och kräva en annan behörighetsmodell. Inget av dessa alternativ väljs.

## Arkitektur och ansvar

### 1. Windowsvärd, identitet och isolering

Brokern kör som en vanlig Windowsanvändare. En plattformsadapter implementerar det befintliga BrokerSigner-gränssnittet med en beständig P-256-nyckel i Windows CNG, utan export av privatnyckeln. Nyckellagringen rapporteras som Windowslagring; den får aldrig märkas som Secure Enclave eller TPM utan bevis. Macstödet behålls.

Signaturformatet ska förbli kompatibelt med serverns ES256/DER-verifiering. Registrering, återkallelse och godkännande av värden använder befintliga servergränser. Nyckelgenerering och registrering är explicita installationsåtgärder, inte något ett uppdrag får utföra.

Git- och Dockerverktyg hittas genom fasta, granskade kandidater. Windowskontroller ska hantera reparse points, junctions, sökvägsalias och skiftlägesokänslighet. Uppdrag, modelltext och miljövariabler får inte välja verktyg, rotkatalog, Dockercontext eller daemon.

En separat Windowsprofil ska bevisa Docker Desktop med WSL2 och Linuxcontainrar via en fast lokal anslutning och värddata. Enbart ett kärnnamn eller ett falskbart OS-fält räcker inte. Okänd eller otillgänglig miljö avvisas. Testerna ska även visa att fel daemon, godtycklig TCP-anslutning och Windowscontainrar avvisas.

Omniras verkliga checkout och en separat arbetskatalog registreras uttryckligen för denna värd. Modellens svar får inte lägga till repos eller sökvägar.

### 2. Arbetskopia och sandbox

Ett godkänt jobb binds till exakt repository, projekt, bas-SHA, claim, fence och admission-hash. Förberedelse återanvänder befintliga repo- och worktreebevis.

Endast godkända, versionshanterade textfiler materialiseras i en Docker named volume. Ingen .git-katalog, lokal miljöfil, användarkatalog, credential eller värdens node_modules följer med. Inga host bind mounts eller Docker-sockets exponeras.

Testmiljön använder en separat, förberedd och digestlåst bild med en kontrollerad verktygskedja och låsta beroenden. Ingen nätverksinstallation, godtyckligt livscykelskript eller image pull sker under jobbet. Bildens verkliga identitet och beroendelåsning ingår i bevisen. Hälsoprovets Alpinebild är inte en färdig Node-testmiljö.

Sandboxen behåller nätverk avstängt, kör utan root, begränsar resurser och har skrivbarhet enbart där uppdraget kräver det. Kod och testkommandon körs aldrig direkt på värddatorn.

### 3. Körslinga och modell

Nya signerade, ändamålsspecifika gränser behövs för att hämta det egna jobbets körunderlag och skriva evidens/tillstånd/resultat. De använder samma brokeridentitet, aktuella claim-token och fence. Databastabeller och service credentials lämnar aldrig servern.

Servern verifierar den levande uppdragskedjan, projektet, admission-hashen, arbetaridentiteten, budgeten och claimen före modellarbete. Kodkontext och loggar begränsas till uppdragets läsmandat och redigeras för hemligheter. Modellutdata behandlas som opålitlig indata.

Första adaptern använder den redan registrerade claude_patch_v1 via Omniras styrda modellåtkomst och spendkontroll. Ingen privat Claude-/ChatGPT-prenumeration antas ingå i API-kostnaden. Inga nya abonnemang ingår. Betalt liveprov kräver en uttrycklig positiv kostnadsgräns; saknad gräns stoppar anropet.

Modellen lämnar enbart det befintliga strukturerade filprotokollet. Brokern validerar samtliga operationer, förväntade filhashar, filantal och diffstorlek innan något appliceras. Arbetskopian används för slutlig diff; redigerat innehåll får inte hamna i ett annat checkout.

Befintliga tak behålls: högst två arbetariterationer, åtta ändrade filer, 131072 diffbyte och 1200 sekunder totalt. Gränser kan skärpas per jobb, aldrig höjas av modellen.

### 4. Tester, resultat och avbrott

Testkommandon är fasta registrerade kommandon med fasta argument eller slutna argumentval. Första verkliga buggjobbet behöver en relevant regressionstestsvit; den nuvarande kontraktssviten får inte användas som bevis för en orelaterad bugg. Nödvändiga test/build-kommandon läggs till genom granskade registerändringar.

Det verkliga kommandot, exitkoden, tidsåtgången och utdatahasharna registreras. Noll körda tester, uteblivet testunderlag eller en överhoppad obligatorisk kontroll räknas inte som godkänt. Kända basfel särredovisas; slutstatus får bara bli ready_for_human_review om jobbets uttryckliga obligatoriska kontroller är uppfyllda.

Brokern stoppar på cancellation, tappad claim, utgången behörighet, ändrad bas, avvikande scope, budgettak eller timeout. Pågående processer avslutas och sena resultat kan inte publiceras med en gammal fence.

Om anslutningen eller processen dör återupptas bara arbete vars ägarskap och kvittokedja kan bevisas. Osäkert modellutskick får inte debiteras eller skickas igen blint; okänd filoperation måste stämmas av mot arbetskopians hash. Återstart får aldrig skapa ett andra parallellt jobb för samma uppdrag.

Resultatet består av diff, berörda filer, bevarad arbetskopia, testbevis och en kort sammanfattning. Innehåll skyddas av projektets befintliga åtkomstgräns. Hashar utan åtkomligt underlag räcker inte för granskning.

### 5. Atlas samtalsyta

Samtalet föreslår jobb genom befintliga Mission/Delegation/WorkPackage-gränser. Godkännande binds till det konkreta uppdragets version och mandat. Ett vanligt ja får inte bli en allmän kodbehörighet.

Atlas visar begriplig status: väntar på godkännande, väntar på datorn, arbetar, testar, behöver hjälp eller klart för granskning. Ett hämtat jobb är inte ett genomfört jobb. Uppdateringar härleds från sparat tillstånd och kvitton, inte modellens egen berättelse.

Användaren kan fortsätta samtalet, byta vy och avbryta jobbet. Jobbet tillhör serverns uppdrag och brokern, inte webbläsarflikens livslängd.

## Gränser mot kommande arbete

Första granskaren är människan via granskningsunderlaget. Separata AI-granskare, uppdelning i flera samtidiga underagenter och automatiskt skapade PR:er kommer efter första flödet.

Nästa delegeringssteg återanvänder befintliga föräldrauppdrag och avgränsade WorkPackages. Varje underagent får snävare scope, egen identitet/resultat och en del av samma budget. Ingen rekursiv obegränsad agentskapning, egen behörighetsökning eller dubbelt ägarskap av samma arbetskopia tillåts.

Atlas kan senare ändra Omniras applikationskod med samma flöde. Kod som styr identitet, behörigheter, policys, kostnadstak, produktionsnycklar och publicering kräver separat mandat och granskning. Ett pågående jobb får aldrig använda sin egen kodändring som ny auktoritet.

## Godkännandebevis för första versionen

1. Windowsidentiteten signerar ett känt payload som den riktiga serververifieraren accepterar; fel signatur och återkallad värd avvisas.
2. Ett verkligt ofarligt sandboxprov på den stationära datorn verifierar miljön och kontrollerna. Mocks räcker inte som livebevis.
3. Ett exakt basbundet jobb materialiserar bara godkända filer, applicerar en strukturerad ändring och kör en relevant regressionstest utan nätverk eller hemligheter.
4. Scopebrott, hashkonflikt, symlink/junction, fel repo och försök att starta ett oregistrerat kommando stoppas.
5. Avbrott under modellväntan, patch eller test och förlorad lease kan inte ge ett sent godkänt resultat. Återanslutning duplicerar inte arbete.
6. Den vanliga Atlaschatten visar det riktiga jobbets status och tillgängliga diff/testbevis.
7. Ett litet verkligt Omnira-buggjobb genomförs med avgränsad budget. Människan granskar resultatet. Ingen automatisk merge eller deploy sker.

Tester körs proportionerligt per implementationssteg. Dokumentgranskning är inte runtimeverifiering. Befintliga breda testfel redovisas öppet.

## Första implementationsdel

Börja med Windowsidentitet, slutet värd-/reporegister och verifierad Docker/WSL2-isolering. Behåll produktionskörning avstängd. Därefter följer workspace-materialisering, körslinga/evidens, modelladapter/tester och sist samtalskopplingen.

Varje del ska lämna ett verifierbart resultat och samma sparade arbetsstatus, så att arbetet kan fortsätta i en ny chatt utan att bero på samtalsminne.

## Externa primärkällor för Windowsanpassningen

https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.cngkeycreationparameters
https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.cngexportpolicies
https://docs.docker.com/desktop/features/wsl/
https://docs.docker.com/desktop/features/vmm/

Dessa beskriver plattformsfunktioner. De är inte bevis för att Omniras implementation eller denna dator uppfyller kraven; det måste testerna ovan visa.

## Tillägg om oberoende AI-granskning, 2026-10-18

André har godkänt inriktningen med Atlas, en kodagent och en separat granskningsagent samt uppdragsbunden kommunikation. Den skriftliga specifikationen finns i docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md och godkändes av André 2026-10-18 19:57 Europe/Stockholm. Den preciserar och ersätter den tidigare ordningsföljden som sköt AI-granskaren till efter första flödet: AI-granskning ska vara bevisad före någon framtida förmåga att föra in ändringar i ordinarie projektkod. Första kodjobbet arbetar fortfarande enbart i en separat kopia och ger inget merge-/deploymandat. Detta är en designuppdatering, inte en aktiverad funktion.
