# Atlas: oberoende kodgranskare och kommunikation mellan agenter
Datum: 2026-10-18
Status: Skriftlig specifikation godkänd av André 2026-10-18 19:57 Europe/Stockholm. Dokumentet aktiverar ingen funktion.
Bas: codex/atlas-code-worker-design-20261018, 3dfa1573f19e36aaec9bbfe651cf04674ecb5eee.

## Avsikt och relation till tidigare design

André vill att en separat agent granskar kodagentens resultat innan ändringar förs in i projektets ordinarie kod. Agenterna ska kunna ställa frågor och diskutera rättningar utan att samtal ger dem ytterligare behörigheter.

Detta tillägg preciserar docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md. Den tidigare formuleringen som skjuter AI-granskaren till efter det första flödet ersätts för framtida integration: den oberoende AI-granskaren ska vara införd och bevisad innan Atlas får någon förmåga att föra in kodändringar i ordinarie projektkod. Människans granskning och godkännande behålls.

Första kodjobbet får fortfarande enbart ändra en separat arbetskopia och lämna granskningsunderlag. Den arbetskopian måste vara skrivbar för kodagenten; granskningskravet gäller införande i ordinarie projektkod, inte varje tillfällig redigering i arbetskopian.

Första omfattningen är Omnira, ett jobb åt gången, en kodagent och en separat granskningsagent, samordnade av Atlas. Det är inte ett generellt agentnätverk eller tillstånd att skapa obegränsat med underagenter.

## Befintligt underlag och faktiskt nuläge

- docs/autonomy/EVALUATION-GATES.md beskriver deterministiska kontroller, separat granskare, rättningsslinga och mänsklig granskning. Dokumentet märker detta som design, inte implementerad gate runner.
- Mission, DelegationEnvelope, WorkPackage, policy, filprotokoll och beständigt operatörsunderlag finns.
- apps/web/lib/atlas/code-work/evidence.ts har slutna bevisklasser, bland annat final_diff och test_result. Fri kommentar hålls avsiktligt utanför evidenshashen. Ett agentmeddelande ska inte smygas in som ett nytt behörighetsbevis.
- Windowsidentitet och metadata för värd/Docker är verifierade lokalt. Windows sandboxkörning, körande kodjobb, AI-granskare, meddelandeleverans och integration är inte därmed implementerade.
- Befintlig CLI, produktionsbehörighet, databas och livekod ändras inte av detta dokument.

## Alternativ och valt upplägg

| Upplägg | Fördel | Nackdel |
|---|---|---|
| Separat granskare, riktade meddelanden via Atlas | Spårbara roller och begränsad kommunikation; kan återanvända uppdragets gränser | Kräver gransknings- och leveransbevis |
| Alla agenter delar samma samtal | Enkel gemensam diskussion | Svagare oberoende, större kontext och svårare rättighetsgränser |
| Endast mänsklig granskning | Minst ny implementation | Uppfyller inte önskemålet om en separat AI-granskare |

Val: första alternativet. En annan modell eller leverantör kan senare ge ett kompletterande perspektiv, men är inget säkerhetsbevis och ingen ny prenumeration krävs. Minimikravet är separat körning/session, separat aktör och färsk granskningskontext.

## Roller och rättigheter

| Roll | Får göra | Får inte göra |
|---|---|---|
| Atlas, samordnare | Fördela registrerade uppgifter, förmedla godkända meddelandetyper, visa verklig status och samla resultat | Ändra mandat/budget eller godkänna egna kodändringar genom ett meddelande |
| Kodagent | Läsa tillåten kod, lämna strukturerade filändringar och använda registrerade testkommandon i isolerad miljö | Skriva i ordinarie checkout, själv utse godkänd granskare eller publicera |
| Granskningsagent | Läsa fryst ändring och tillåten kontext, bedöma tester, skriva fynd och begära förtydliganden | Ändra kod, bevilja behörighet, ändra policy eller köra godtyckliga kommandon |
| Server/broker | Kontrollera identitet, versioner, policy, budget, receipts och tillstånd | Behandla modelltext som tillstånd eller dölja saknade kontroller |
| André | Granska tillgängligt underlag och godkänna en exakt version | Ett allmänt ja kopplas inte till en annan eller senare version |

Granskningens skrivåtkomst begränsas till dess eget resultat och uppdragets meddelandelogg, genom validerade servergränser. Kodprojektet är läsbart enligt snävt mandat. Eventuell oberoende testkörning får endast ske med registrerad rättighet i en separat sandbox med egen temporär testyta, aldrig på värden eller i kodagentens skrivbara kopia.

## Flöde och versionsbindning

1. Atlas tar emot ett konkret uppdrag och skapar avgränsade worker- och reviewer-uppgifter under samma föräldrauppdrag.
2. Kodagenten arbetar i den separata arbetskopian. Obligatoriska registrerade kontroller körs; saknad, misslyckad eller överhoppad obligatorisk kontroll hindrar godkänt resultat.
3. Brokern fryser ett granskningspaket. Kodagenten får inte ändra den version granskaren läser.
4. Granskaren får ursprungligt uppdrag, tillåten källkontext, faktisk diff och testbevis. Kodagentens slutsats eller tidigare diskussion om korrekthet ingår inte i den första bedömningen.
5. Granskaren lämnar ett första sparat resultat innan den får läsa kodagentens försvar/förklaringar. Efter det kan riktade frågor och svar förtydliga fynd inom samma paketversion.
6. Begärda rättningar återgår till kodagenten. Varje ändrat kod-, test- eller bevisunderlag skapar ett nytt paket; relevanta tester och separat granskning körs på nytt. Tidigare godkännanden återanvänds inte.
7. Först när obligatoriska kontroller och en giltig separat granskning passerat kan resultatet visas som klart för mänsklig granskning.
8. Människans godkännande binds till exakt paket. En framtida integrationsförmåga måste dessutom kontrollera levande mandat, aktuell målversion och det oförändrade paketet vid själva skrivningen. Denna förmåga ingår inte i tilläggets implementation.

Det frysta paketets identitet beräknas av betrodd kod från minst workId, projekt/repository, uppdragsversion och authority pins, bas-SHA och avsedd målref, kandidatens filmanifest/contenthashar, diffhash, obligatoriska check-id:n med registerversioner, faktiska kommandokvitton och testresultat, samt granskningspolicyversion. Modellen får inte själv ange en auktoritativ hash eller granskare.

Paketet är oföränderligt och underlagen ska gå att läsa; en hash utan åtkomlig diff/källkod/logg räcker inte. Ändrad målref, filhash, scope, checkuppsättning, testbevis eller mandat gör underlaget inaktuellt. Ingen tyst rebase eller automatisk konfliktlösning får återanvända det tidigare godkännandet.

## Granskningsresultat och maskinell kontroll

Granskningsresultatet innehåller reviewTaskId, serverhärledd reviewerActorId/session, granskat paket-id/hash, policyversion, status, fynd, uttryckliga granskningsluckor och hänvisningar till underlag. Kodagentens aktör/session får inte vara granskaren för samma paket.

Slutna granskningsstatusar är förslag för ett kommande kontrakt: passed, changes_requested och inconclusive. De är inte befintliga lifecycle-enumvärden. Första modellen får endast lämna ett strukturerat förslag; betrodd kod binder proveniens och verifierar strukturen.

Fynd anger severity (critical, important, minor), berörd fil/plats eller artefakt, konkret utlösare, effekt, bevis och föreslagen rättning. Kritiska/viktiga fynd eller en granskningslucka som rör ett obligatoriskt krav blockerar. Mindre fynd får lämnas synliga till människan om policyn tillåter det. Inconclusive, timeout, fel schema och saknat bevis blockerar; de blir aldrig passed genom frånvaro av feltext.

Ett första sparat resultat kan vara preliminärt medan en riktad fråga väntar på svar. Resultat sparas som nya versioner; ett slutligt passed får endast utfärdas för den avslutade sessionens oförändrade paket. Varje extra modellutskick räknas mot sessionens och jobbets tak.

Servern måste kontrollera separat tilldelad aktör, giltig claim/fence, rätt paket, rätt policy, erforderliga testbevis och budget innan ett godkänt granskningskvitto sparas. En sparad modellbedömning är evidens om granskningen, inte bevis för att koden är felfri eller en tillåtelse till merge/deploy.

## Kommunikation mellan agenter

Kommunikationen är uppdragsbunden och går via Atlas/servern. Första versionen använder riktade beständiga meddelanden i jobbets förlopp, inte en ny global gruppchatt eller en separat generell meddelandetjänst.

Tillåtna typer: question, answer, finding_reference, correction_request och blocker. Kod/diff/testresultat överförs som kontrollerade artefaktreferenser, inte som exekverbara instruktioner i meddelandetext.

Varje meddelande binds till projekt, workId, paketversion, serverhärledd avsändare, tilldelad mottagare/roll, typ, meddelande-id, tidsstämpel och eventuell replyTo. Servern kontrollerar dessa mot den levande tilldelningen; kroppen får inte välja en annan identitet, ett annat projekt eller utökat scope.

Lagring är append-only. Upprepade leveranser med samma id är idempotenta; kvittens och ordning är synliga, och förlorad anslutning får inte skapa en ny uppgift eller dubbla modellutskick. Servern tilldelar sekvensnummer. Ett sent meddelande från en återkallad session/fence kan arkiveras som avvisat men inte ändra aktuellt jobb.

Alla modeller behandlar andra agenters text, repo-innehåll och loggar som opålitligt innehåll. Uppmaningar som "ignorera policyn", begäran om hemligheter eller ett informellt "godkänt" kan inte ge rättigheter eller passera en gate. Projektens åtkomstgränser och befintlig sekretessredigering gäller även refererade artefakter.

Agentdialogen visas för användaren som begripliga händelser: exempelvis "Granskaren hittade ett fel", "Kodagenten rättar" eller "Behöver ditt beslut". Full fråge-/svarslogg finns som underlag, men privat modellresonemang efterfrågas eller lagras inte som bevis.

## Budget, stopp och återhämtning

Befintliga tak behålls: två arbetariterationer, åtta ändrade filer, 131072 diffbyte och 1200 sekunder totalt. Granskning och intern kommunikation ingår i samma totala budget/tid; granskaren får inte en dold egen kostnadspott.

Första designens extra tak: högst två granskningsuppdrag (en separat session per kandidatversion, med högst tre modellutskick per session), tolv interna agentmeddelanden med högst 4096 UTF-8-byte per meddelandekropp, högst 65536 UTF-8-byte textkontext per granskning och 32768 UTF-8-byte strukturerat granskningsutdata. Hårdare jobbtak går före. Obligatorisk kontext får inte kapas tyst för att rymmas; otillräckligt utrymme ger inconclusive och stopp.

Positiv uttrycklig kostnadsgräns och registrerad modellåtkomst krävs före betalda worker- eller reviewer-anrop. Servern reserverar granskningens tilldelade del inom totalen före workerstart. Saknad gräns eller otillräcklig återstående budget stoppar arbetet. Ingen installation, abonnemangsändring eller betald provkörning godkänns genom denna design.

Två kandidatversioner är inte obegränsade rättningsslingor. Om andra granskningen fortfarande hittar blockerande fel stannar jobbet för ett synligt nytt beslut. Cancel, utgången behörighet, tappad claim, ändrad bas och överskridet budget-/tids-/meddelandetak stoppar progression. Osäkert modellutskick stäms av före återförsök; ingen blind ny debitering.

Om reviewer- eller coordinator-processen startar om återanvänds bara sparad, giltig version/tilldelning med verifierbar proveniens. Ett gammalt meddelande eller ett gammalt passed kan aldrig återuppliva ett avbrutet eller inaktuellt jobb.

## Godkännandebevis för implementationen

1. En kodagent kan ändra sin egen kopia men inte ordinarie kod; granskaren kan läsa fryst underlag men inte redigera det.
2. Worker som granskar sig själv, fel reviewer-session/projekt/claim och förfalskade avsändar-id:n stoppas.
3. Passed för ett annat paket, ändrad kod/testevidens, ny målversion och återspelat gammalt godkännande stoppas.
4. Fel, timeout, inconclusive, överhoppade/0 körda obligatoriska kontroller och otillgängligt underlag blockerar mänsklig-ready-status.
5. Ett fynd leder till en ny kandidat med nya tester och ny separat granskning, inom två iterationer.
6. Workerförklaringar kan inte påverka granskarens första bedömning; riktade förtydliganden kan läsas efter ett sparat första resultat.
7. Meddelanden över projektgräns, fri scope-/rolländring, promptinjektion, dubbelleverans och meddelanden över tak provas.
8. Avbrott/återstart och gammal fence kan inte skapa dubbel modellkörning eller ett sent godkänt resultat.
9. Användaren ser faktisk granskning, kvarvarande mindre fynd, förbrukad budget och versionsbundet underlag.
10. En verklig avgränsad provkörning visar worker, reviewer och kontrollkedja; mocks eller en grön kontraktssvit räcker inte för livepåståendet. Betald provkörning kräver separat konkret kostnadsmandat.

## Genomförandeordning och uttryckliga gränser

1. Slutför nästa infrastrukturgrind: skyddad Windowsarbetskopia och verkligt isolerat hälsoprov. Metadataresultatet ensamt medger ingen körning.
2. Bygg slutna gransknings-/meddelandekontrakt och beständiga versionsbundna underlag mot befintliga Mission/WorkPackage-gränser.
3. Anslut begränsad kodarbetare och oberoende granskare med deras registrerade modell-/teståtkomst; bevisa fel- och avbrottsfallen.
4. Koppla begriplig Atlasstatus och mänsklig paketgranskning. Första jobbet stannar med separat kopia och granskat resultat.
5. Planera införande/PR/merge/deploy separat. Ingen integration aktiveras innan den här granskningskedjan är bevisad.

Principen ska senare återanvändas för andra uppdrag, men detta dokument implementerar inte radering av företagsdata, betalningar, mejlutskick eller produktionspublicering. Sådana handlingar behöver egna mandat och verifierbara underlag. Identitets-, behörighets-, policy- och kostnadskod kräver fortsatt separat mandat; ett jobb får inte göra sin egen patch till ny behörighet.

Detta dokument är design. Nästa artefakt efter ägargranskning är en implementationsplan, med det redan valda inline-arbetssättet bevarat. Att bevara arbetssättet innebär inte att varje produktjobb får hoppa över sin oberoende AI-granskare.

## Källor kontrollerade under designarbetet

- docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md
- docs/verification/2026-10-18-windows-host-qualification.md
- docs/autonomy/EVALUATION-GATES.md
- apps/web/lib/atlas/code-work/{types,evidence,command-registry}.ts
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

De externa källorna beskriver erfarenheter av samordning, begränsningar och utvärdering. De bevisar inte att Atlas har dessa funktioner eller att den föreslagna granskaren hittar alla fel.
