# Omnira AWS Bedrock – governed adapter (isolerad Etapp, 2026-11-16)

## Status
- Branch: feat/omnira-bedrock-pilot-20261116, **ingen merge** eller automatisk routing.
- Piloten har tidigare verifierat Vercel OIDC → AWS STS → Amazon Nova Micro (15 indatatokens, 3 utdatatokens).
- Den nya modulen för verkliga Bedrock-anrop är **DORMANT**. Ingen route, scheduler eller agent importerar den.
- Preview kör den aldrig utan BEDROCK_GOVERNED_PILOT_ENABLED=true, exakt branch/Preview, H1_SPEND_GATE=1, verifierad server-side operatörsbehörighet, rätt projekt/STOP-scope och källutdrag. Flaggan ska inte aktiveras utan separat releasebeslut.
- En fungerande syntetisk enhetstestsvit är INTE samma sak som verifierad verklig budgetreservation eller producerad redaktionell text.

## Kod och beroenden
- lib/ai/bedrock-pilot/manual-review-contract.ts: ren begäran-/scope-/storleksvalidering, utan nätverk.
- lib/ai/bedrock-pilot/operator-decision.ts och operator-grant.ts: befintlig verifierad plattformoperatör + projektägarskap; servern skapar ett oförfalskbart WeakMap-registrerat behörighetsbevis. JSON-kopior och vanliga booleanvärden avvisas.
- lib/ai/bedrock-pilot/sts-credentials.ts: fast OIDC/STS-roll och region, tidsbegränsade credentials, aldrig gamla AWS-nycklar.
- lib/ai/bedrock-pilot/governed-client.ts: oanvänd server-side adapter med withGovernedSpend, tokenWindowCeiling, getRates, logLlmCost, admitPhysicalRequest, watchExecutionAuthority och composeAbortSignals.
- @aws-sdk/client-bedrock-runtime@3.986.0, explicita credentials och maxAttempts=1. Ingen automatisk retry eller fallback.
- Gemensamt modellregister har Nova Micro bruttopris 0,035 USD per 1M in och 0,14 USD per 1M ut; 128K inputkontext.
- bedrock:InvokeModel-rollen kan användas via förhandsgranskad OIDC men är i AWS bunden till Vercel-projekt + environment:preview, INTE specifikt Git-branch. Applikationens exakta grenbegränsning är kompletterande skydd.

## Order of operations för framtida körning
1. **Verifiera användaren på servern** med resolveManualBedrockOperatorGrant(projectId): befintlig Supabase-session, plattformoperatör och samma projektägare måste alla stämma. Adaptern kräver ett äkta mintat behörighetsbevis, inte ett externt operatorApproved-boolean. Ingen publik route finns; en framtida route måste ha separat CSRF-/auth-/projektgranskning innan den kan nå adaptern.
2. Välj rätt projekt och ExecutionContract med context=OPERATOR_EXECUTION, scope=PROJECT och samma verifierade projekt-ID.
3. Validera 2–6 manuellt angivna HTTPS-källutdrag och max 8192 bytes prompt, max 256 utdata-tokens. Källutdragen är operatörssuppladdade: modellen får INTE påstå att den har verifierat dem.
4. Verifiera Preview/branch, hård spend-gate, separat aktiveringsflagga och OIDC-token. STS före budgetreservation eftersom rollantagandet inte är modellkonsumtion.
5. Beräkna hårt tak från fulla 128K inputkontexten och faktisk max output, med kanonisk USD/SEK-rate; reservera i withGovernedSpend och genomför dess slutliga STOP-kontroll.
6. Före fysisk AWS-dispatch: RUN_BOUND/CONTRACT_ONLY admission och watchdog. Uppfattad STOP efter dispatch är ett tvetydigt debiteringsutfall och måste hållas räknat.
7. Anropa endast Nova Micro en gång med explicita tillfälliga STS-credentials; logga faktiskt tokenantal via logLlmCost inne i den kanoniska spend-metern. Om usage saknas, håll hela taket i ledger.
8. Returnera enbart text för **manuell redaktionell QA**; aldrig automatiskt publicera, återanropa en annan modell eller flytta The Prompts News Hunter till Bedrock.

## QA och återstående releasegates
- Riktade Node-tester: 63/63 godkända för kontrakt, STS, isolering och prisregister före denna auth-förbättring. Nytt Vitest-test med 5/5 för oförfalskbart operatörsbevis och 6/6 mot den riktiga withGovernedSpend-gränsen med SIMULERADE budget-/STOP-/modellseams.
- Full TypeScript-kontroll (tsc --noEmit --incremental false): 0 fel efter att RevenueLegacy utökats för aws-bedrock-leverantören. Vercels vanliga Next-bygg hoppar över TS/lint, så det är en separat kontroll.
- Vercel Preview för exakt senaste SHA krävs; ännu ingen ny merge eller produktionsdeployment.
- Full repo-qa och kritiska regressioner behöver fortsatt granskning innan aktivering.
- Inga betalda regressionstester förrän verifierad autentisering, prisspårning och operatörsbeslut finns.
- Kontrollera i AWS Billing att tidigare anrop belastat krediterna; 10 USD Budget är endast en varning.
- Arbeta endast i denna testgren; bevara originalprojekt, migreringar och produktionsmiljö.
- Rensa tillfällig gren och grenbundna env-variabler när utvärderingen/överlämningen är komplett. Äldre oföränderliga Vercel-Preview-URL:er kan fortfarande innehålla den historiska engångstestrouten och kräver separat genomgång/avstängning; att ta bort routen i senaste branch är inte samma sak som att radera historiska deployments.
