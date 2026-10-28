# Atlas – extern workflowreferenssökning som inte får tappas i snabbvägen
**Datum:** 2026-10-28. **Status:** Isolerad kodfix i PR, ingen automatisk merge eller livekörning.

## Observerad regressionssignal
Operatören bad Atlas: "Sök externa workflowreferenser som kan förbättra Handlarbörsens leadhantering och mejluppföljning. Visa källorna, jämför med våra befintliga funktioner och föreslå inga ändringar utan godkännande."

Atlas svarade med allmänna länkar till HubSpot, Salesforce, ActiveCampaign, Pipedrive och Zoho. Svaret saknade pinnade n8n-katalogfiler. **Utifrån enbart den visade texten går det inte att bevisa om verktyget anropades.** Kodgranskning identifierade däremot en konkret, reproducerbar routingrisk.

## Rotorsak i `app/api/chat/route.ts`
- `isFastPathContent` tilldelar rena skrivuppgifter en snabbväg med **noll verktyg**.
- Dess Regex känner inte igen `workflowreferenser` som ett fristående `workflow`-ord, men känner igen verbet `förbättra`.
- Testfrågan kan därför felklassificeras som `fastPath` och `activeTools=[]`, trots att den efterfrågar en faktiskt tillgänglig, extern och pinnad datakälla.
- Även om fullvägen används har `tool_choice` annars normalt varit automatiskt för denna läsfråga; modellen kan svara generiskt utan att läsa katalogen.

## Åtgärd, isolerat och skrivskyddat
1. `lib/atlas/workflow-references/read-intent.ts` identifierar **uttryckliga läs-/sökförfrågningar om externa workflowreferenser**. Den matchar inte vanlig n8n-diskussion, citat i skrivuppgifter, negerade sökningar eller startkommandon.
2. För denna specifika fråga förbigås textens snabbväg även om klienten skickar `mode: content`; övriga skrivuppgifter och meddelanden påverkas inte.
3. På första LLM-turen tvingas exakt `search_external_workflow_references`, inte `tool_choice=any` och aldrig `trigger_workflow`.
4. Den existerande `resolvePlatformOperator()`-grinden ligger kvar på serververktyget. Ingen ny rättighet introduceras.
5. Ett källdirektiv kräver **faktiska `sourceUrl` från verktygssvaret**, och avråder från att presentera allmänna produktsidor som katalogträffar. Om verktyget nekar åtkomst eller inte hittar resultat ska det uppges, inte ersättas av gissade källor.
6. Den interna jämförelsen med Handlarbörsens befintliga kod får inte påstås vara verifierad utan en separat intern källa. Inga kundkontakter eller utskick tillåts av sökningen.

## Regression och bevisnivå
- `lib/qa/atlas-external-workflow-references.test.ts` innehåller positiva, negativa och fail-closed-scenarier, inklusive den exakta felrapporterade användarfrågan.
- Testfilen kontrollerar också att snabbvägen viker undan och att **namngivet läsverktyg** väljs före generisk åtgärd eller navigation.
- `.github/workflows/atlas-external-workflow-references.yml` kräver minst 25 testassertioner för just katalogregressionerna, plus övriga ursprungliga regressioner och full TypeScript-kontroll.
- Ingen autentiserad Atlas-chattsession har testats av denna PR. En grön CI visar alltså kod- och routingregression, inte faktisk funktion i live-UI.

## Acceptanskriterier efter eventuell godkänd merge/deploy
- Inloggad plattformsoperatör testar den ursprungliga frågan i Atlas.
- En riktig `tool_call` med namn `search_external_workflow_references` ska synas i sessionens verktygsspår.
- Svar ska innehålla minst en käll-URL i formen `https://github.com/Zie619/n8n-workflows/blob/<pinnad-SHA>/workflows/...`, alternativt en ärlig notis om inga träffar.
- Ingen `trigger_workflow`, publicering, Resend-sändning, SCB-nyckelhantering eller ändring av produktionstabeller sker i testet.
- Atlas ska skilja mellan overifierad extern referens och bekräftad intern funktion hos Handlarbörsen.

**Ägargrind:** Denna fix ska först granskats i draft-PR och testas separat från Handlarbörsens SCB- och mejlprototypgrenar.
