# Omnira – AWS Bedrock, resultat och säker överlämning (2026-11-16)

**Arbetsgren:** feat/omnira-bedrock-pilot-20261116. **Produktionsbeslut:** NO-GO för automatisk modellrouting; GO för offline-analys och fortsatt granskad utveckling.

## Verifierat utfall
- Ett manuellt isolerat Vercel Preview-test kunde anta IAM-rollen Omnira-Bedrock-Test via Vercel OIDC och AWS STS (visat på användarens skärmbild).
- Samma Preview nådde modellen amazon.nova-micro-v1:0 i us-east-1 och fick textsvaret ”Hej”, 15 indatatokens och 3 utdatatokens.
- Priser som operatören verifierade på Amazon Bedrock (us-east-1, Standard): 0,035 USD/1 miljon indatatokens; 0,14 USD/1 miljon utdatatokens. Modellerad bruttokostnad: cirka 0,000000945 USD för just testet. Detta är INTE verifierad fakturakostnad.
- Krediternas tillämpning på fakturan har ännu INTE verifierats. Kontrollera Billing efter att förbrukning registrerats.
- Omniras befintliga AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY och AWS_REGION används bl.a. för Remotion Lambda. De ska lämnas orörda.

## Avveckling av engångstestet
Efter det godkända Nova-testet tas den privata betalda API-endpointen POST /api/bedrock-pilot-converse och dess SDK-beroende bort från pilotgrenens senaste revision.
Endast OIDC/STS-autentiseringstestet kvarstår på /bedrock-test. Det krävs ett nytt READY Preview-bygge och att den gamla betalda routen ger 404 för att verifiera avvecklingen.
Ingen generell Bedrock-dispatcher är införd. Inga vanliga Omnira-anrop har ändrat modell.

## Implementeringsgräns
Omniras kanoniska gräns för betalda provider-anrop är lib/cost/governed-spend.ts / withGovernedSpend. Varje anrop behöver projekt, execution/STOP, ett hårt kostnadstak, budgetreservation och settlement.
Det tidigare minimala Bedrock-anropet gjorde INTE denna databasbaserade reservation. Det får därför ALDRIG kopieras till produktion eller användas som generell provider-adapter.
Den nya lib/ai/bedrock-pilot/shadow-policy.ts anropar ingen modell och auktoriserar aldrig dispatch. Den ger bara deterministisk förhandsgranskning och bruttokostnadsberäkning.

## Nästa riktiga adapter: krav före GO
1. Bind en verifierad projektidentitet och ExecutionContract till varje användning; respektera STOP och in-flight authority vid sista dispatch.
2. Lägg varje betalt AWS-anrop innanför withGovernedSpend. Använd gemensam spend-meter och cost_events med provider aws-bedrock, inte separata beloppsloggar.
3. Utöka kanonisk prisbok och kontextfönster först efter verifiering; beräkna hårt SEK-tak med samma fastlåsta valutakurs och priser som används vid settlement. Inga heuristiska inputtokens får bli ett ogrundat tak.
4. SDK maxAttempts=1. Ingen dold retry eller automatisk fallback vid oklart dispatchutfall.
5. Endast Vercel OIDC och explicita temporära STS-credentials; inte SDK:s standardkedja som kan plocka befintliga Remotion-nycklar.
6. Börja med separat manuellt, icke-publicerande redaktionellt text-QA. Inget byte i The Prompts News Hunter eller publiceringskedja och inga automatiska Atlas-uppgifter.
7. AWS Budget 10 USD/månad är en varning, inte ett kostnadsstopp. En hård reservation och volymbegränsning i Omnira krävs för produktion.
8. AWS IAM trust är begränsat till Vercel-projektet och environment:preview, INTE en viss Git-branch. Kodens branchkontroll och Vercels grenvariabler kompletterar men ersätter inte IAM-granskning.

## Städkriterier för tillfällig testgren
- Senaste Preview måste vara READY och tidigare betalda routen ska ge 404.
- Behåll evidens i Git-historiken, men rör inte AWS-kontot, budgeten, gamla nycklar eller andra projekt.
- Ta bort AWS_BEDROCK_ROLE_ARN och AWS_BEDROCK_REGION från testgrenen i Vercel när inga aktiva tester kräver dem. Radera först därefter endast feat/omnira-bedrock-pilot-20261116.
