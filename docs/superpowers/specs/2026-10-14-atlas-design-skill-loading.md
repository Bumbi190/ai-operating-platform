# Atlas: första etappen för designfärdigheter

Status: design för granskning. Inte implementerad eller aktiverad.

## Mål och avgränsning

André vill att Atlas ska kunna driva en hemsida från idé till färdig produkt. Installation av de åtta designfärdigheterna är genomförd för lokala utvecklingsagenter. Den första nya runtime-etappen ska göra samma versionslåsta designkunskap tillgänglig för Atlas och projektagenter. Den ska inte låtsas erbjuda bygge, browser-test eller publicering som den ännu inte utför.

Ett fullständigt webbbyggarflöde delas i tre leveranser: (1) laddning och verifierbar planering, (2) isolerat bygge och preview med verkliga testbevis, (3) publicering genom befintlig beslutsgrind. Denna spec omfattar bara leverans 1. Ootto/Instagram är ett separat arbete.

## Alternativ och beslut

A. Endast lokala skills: klart, användbart för Codex/Claude, men Atlas saknar tillgång.
B. Versionslåst skillregister och behovsstyrd laddning i befintlig Atlas/agent-runtime: rekommenderas för första etappen; återanvänder dagens projektgränser.
C. Ny allmän agentmotor med shell och browser: större förändring; väljs inte i denna etapp.

## Befintlig struktur

`agents` är den riktiga projektbundna agentkällan. `skill_ids` är idag ointerpre­terade etiketter utan laddare. `workflow-runner.ts` läser agentens `system_prompt` men inte Markdown-skills. `api/chat/route.ts` erbjuder redan projektbundna Atlas-verktyg för arbetsflöden. Kodarbetsförmågan deklarerar separata, begränsade operationer och saknar generell shell-/verktygsåtkomst. Dessa gränser bevaras.

## Föreslagen lösning

1. Bygg ett statiskt, explicit register för enbart de åtta installerade skill-ID:na. Generera vid byggtid ett deploybart innehållspaket från versionslåsta Markdown-filer; Vercel får inte förutsätta tillgång till användarens Windows-filsystem. Metadata innehåller källa, commit, hash, ändamål och status.
2. Lägg till läsverktyg för Atlas: lista designfärdigheter och hämta en skill eller dess tillåtna referenser. ID och referenssökväg måste matcha registret. Inga godtyckliga filvägar, URL-hämtningar, installationer eller exekveringar tillåts.
3. Projektagentens promptkomposition laddar endast explicit tilldelade, godkända skill-ID:n. Okända ID:n får aldrig räknas som verifierad förmåga. Befintliga okända etiketter rapporteras som olösta och ger inte nya rättigheter.
4. Håll instruktionerna under befintlig systempolicy. En färdighet ger kunskap; den kan aldrig ge behörighet att installera, generera, spendera, skriva till andra projekt eller publicera. Upstream-instruktioner som förutsätter saknade verktyg blir redovisade beroenden.
5. Ladda bara relevant innehåll. Läsverktyget returnerar högst 16 000 tecken per anrop med explicit nextOffset för fortsatt läsning. Agentpromptens skilltext har högst 64 000 tecken totalt; överträdelse blir ett tydligt fel, aldrig tyst trunkering. Den stora katalogen ska inte injiceras i varje chatt. Runtime-paketet innehåller bara SKILL.md och registrerade instruktionsreferenser, aldrig körbara scripts eller eval-data.

## Användarflöde och ärlig status

Vid exempelvis "Bygg en hemsida för mitt företag" ska Atlas kunna hämta designkunskap, ta fram en projektbrief, välja lämpliga steg och visa vilka exekveringsberoenden som saknas. Resultatet heter designplan tills ett senare bygge har verifierats. Det ska aldrig markeras färdig webbplats på grund av en textprompt, katalogpost eller installerad skill.

## Verifiering för leverans 1

- Tillåtna skill-ID:n och referenser går att läsa från byggt/deploybart paket.
- Okända ID:n, absoluta vägar, traversal och fel hash nekas.
- Projektagentens tilldelningar påverkar bara rätt projekts prompt.
- Befintliga agentflöden utan designfärdigheter behåller beteendet.
- Upstream-text kan inte ändra verktygsbehörigheter eller publiceringsgrindar.
- Riktade enhetstester, typecheck och en riktig Atlas-läsning på preview visar exakt vilken skillversion som användes.

## Vad nästa leverans måste bevisa

Byggsteget måste skapa verkliga filer i ett isolerat projekt, köra tillåten byggkedja och browser-testa preview på mobil och desktop. Det ska leverera skärmbilder, funktionstest, console-fel och kvarstående fel. Publicering är färdig först efter verifierad deployment och live-kontroll. Dessa leveranser kräver egna konkreta designer utifrån den befintliga broker-/governance-kedjan; inget sådant har aktiverats här.
