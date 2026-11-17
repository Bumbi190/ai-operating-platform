# Omnira Model Control – gemensam modellplattform (2026-11-17)

## Mål
**En central modellkatalog och en gemensam policy för alla Omnira-workflows.** Detta inkluderar Atlas och projekt som The Prompt, Familje-Stunden, WebBuilder, Handlarbörsen, GainPilot och kommande projekt.

Beslutet är att användaren ska kunna välja modell per workflow/agent, och Atlas ska kunna föreslå rätt kvalitet/kostnad. En central rekommendation innebär **aldrig** tillstånd att anropa en betald modell, förändra live-routing eller publicera något.

## Faktisk implementerad etapp – endast isolerad testgren
- `lib/ai/model-control/catalog.ts`: det gemensamma modellregistret, som skiljer modellfamilj, provider, gränssnitt, kapabiliteter, kvalitetsnivå (endast provisorisk), region, prissättning och åtkomststatus åt. En modell från Claude via AWS är inte samma transport eller kostnadsprofil som Claude via direkt Anthropic-API.
- `lib/ai/model-control/workflow-policy.ts`: en ren, deterministisk modellkandidatplanerare som accepterar projektscope, workflow-id, kapabiliteter, lägsta provisoriska nivå, dataklassning, region, tillåtna providers, önskemodell och utesluten modellfamilj. Ingen I/O, inga credentials, inga kostnader.
- `lib/article/daily/model-choice.ts`: The Prompts UI hämtar nu modellidentitet och modellstatus från den gemensamma katalogen, i stället för ett separat kopierat modellregister.
- `lib/atlas/model-router`: befintlig kod/desktop-router förblir orörd, med sina tidigare sandbox-, attest- och tillståndsvillkor. Inga generiska runtime-vägar har kopplats om.
- Katalogens startkandidater: Nova Micro, Nova Lite, Nova Pro (Bedrock), Claude Sonnet 4.6 (Anthropic direkt), GPT-5.4 Mini (OpenAI direkt). Endast Nova Micro har verifierat Bedrock Preview-smoketest. Modellerna är **inte** allmänt tillgängliga, prisverifierade i alla regioner eller produktionsauktoriserade bara för att de finns i listan.
- Bild, ljud, video, embeddings och annan specialiserad generering saknar ännu verifierade modeller i denna nya katalog. Planeraren blockerar dem i stället för att tyst byta till en textmodell. Specialiserade befintliga integrationer fortsätter oförändrade.
- Systemet sparar ingen workflow-modellpolicy i databasen, är inte kopplat till någon befintlig runtime och skapar ingen ny publicering/cron.

## Målarkitektur (ej produktionsaktiverad)
1. **Discovery:** dynamiskt lista modeller och inference profiles för rätt AWS-region och endpoint (Bedrock Runtime samt, där relevant, Bedrock Mantle). En API-katalog säger inte vilka modeller kontot får fakturera eller köra.
2. **Capabilities:** modality + rätt API för modellens funktion. Textchatt via Converse för modeller som stöder det, men bildgenerering/embeddings/video/verktyg kan kräva andra API:er eller externa leverantörer.
3. **Workflow policy:** begäran är knuten till verifierad projektägare, faktisk ExecutionContract/STOP, dataklass och extern databehandling, tillåten modellfamilj, kvalitet, max token/volym och kanalspecifik policy.
4. **Quote:** känt och verifierat bruttopris, region, inference profile och kapacitetsgräns, inklusive konservativ övre användning. Okänt pris = ingen körning. AWS-krediter redovisas separat; de minskar inte den reserverade bruttokostnaden.
5. **Dispatch gate:** enbart utsedda och hårt prövade provider-adapters; `withGovernedSpend`, fysisk STOP/abort, IAM/OIDC minst privilegierade, maxAttempts=1, inga obevakade retries eller dold leverantörsfallback.
6. **Audit:** logga modellval, källa för pris/åtkomst/quality-test, faktisk tokenkostnad, budgetreservation, settlement, projektscope, operation, modell och kontrollerad publikationsstatus i Omniras befintliga ledger.
7. **Model overrides:** användaren får föreslå manuell modell för ett arbetsflöde men valet måste tillhöra en attest-/allowlist och får aldrig skapa nya rättigheter.
8. **Quality:** oberoende tester mot verkliga uppgiftsexempel. Skribent och faktagranskare bör inte dela samma underliggande modellfamilj. En modell fungerar inte nödvändigtvis lika bra för nyheter, barninnehåll, kod, ljud och 3D.
9. **Rollout:** arbetsflöden migreras ett i taget efter godkända tests, med observation och rollback. Ingen massomkoppling av Omniras befintliga stabila pipelines.

## Viktiga AWS-begränsningar
- AWS Bedrock ger en gemensam autentisering och API-plattform, **inte automatiskt obegränsad tillgång till varje modell hos varje modellutvecklare**. Tillgänglighet, region, entitlements, inference profiles och modellens gränssnitt varierar.
- ListFoundationModels/ListInferenceProfiles kan användas för read-only discovery i Bedrock Runtime när en separat tillåten IAM-läsroll finns. Mantle har separat modellupptäckt.
- OIDC Preview och en framtida Production IAM-roll är olika förtroendegränser. Återanvänd inte Preview-rollen i produktion, använd inga permanenta Bedrock API-nycklar.
- Allt som kan publicera, skicka e-post eller ändra kod kräver **ytterligare** workflow-/agentauktorisation. Modellkatalogen ger inte sådan åtkomst.
- Befintliga Remotion Lambda-nycklar, The Prompts sociala publicering och övriga Omnira-projekt förblir orörda i denna etapp.

## Kriterier före verklig gemensam runtime
- Verifierad katalogupptäckt och regional modellåtkomst från AWS
- Pinned priser och tillräcklig kvalitet för varje användningsområde
- Samma centrala budgetledger och fysisk STOP som existerande providers
- Per-workflow projektidentitet och giltig utförandebehörighet (licens eller godkännande)
- Staged smoke-test med två olika workflows och inget oavsiktligt leverantörsbyte
- Ingen publicering eller kodändring från ett modellbeslut ensamt

## Status
**Arkitektur och central kandidatplanerare förberedda; allt är advisory-only och avstängt i produktion.** Den faktiska all-workflow-omkopplingen är inte gjord och ska inte presenteras som färdig.

AWS-dokumentation:
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
