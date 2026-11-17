# Omnira AWS Bedrock – fas 2: verifierbar modellåtkomst utan modellkörning

Datum: 2026-11-17
Arbetsgren: `feat/omnira-bedrock-pilot-20261116`
Bascommit: `e234185feeba01707b74e81d5fcb1312e3f3a7f2`
Miljö: **endast isolerad AWS Preview-gren**. Produktionsmiljön, Runtime-rollen och dess godkännanden lämnas oförändrade.
Ursprunglig fas 1-handoff: `docs/omnira-bedrock-readonly-catalog-20261117.md`.

## Verifierat läge före fas 2

- Riktig Vercel Preview-katalogläsning i `us-east-1`: **126 foundation models, 103 inference profiles**; 34 profiler innehåller global routing-varning.
- Länkad AWS-katalogroll fungerar redan för de två metadata-listoperationerna (dokumentationen i fas 1 med "roll inte skapad" beskriver ett äldre läge).
- Ingen modellinvokation eller ny nyckel behövdes för katalogläsningen.
- Katalogresultat garanterar **inte** kontoåtkomst, produktionskörning, modellavtal, faktisk destinationsregion, pris eller budget.

## Fas 2-implementation för isolerad Preview

1. `availability-review.ts`: fail-closed kontroll av en modell och sanerade statusar för `authorizationStatus`, `entitlementAvailability`, `agreementAvailability` och `regionAvailability`; även ett helt positivt svar lämnar `canDispatch=false`.
2. `availability-service.ts`: explicit temporär OIDC-credential + kort tidsgräns, en `ListFoundationModels` för bekräftad aktuell regionmedlemskap och sedan exakt en `GetFoundationModelAvailability` för ett valt modell-ID; inga profiler eller godtyckliga ARN:er accepteras, inget fallback till Remotion-nycklar.
3. `POST /api/model-control/bedrock-availability`: endast verifierad plattformsoperatör, exakt AWS-testgrenen i Preview, same-origin, mycket liten POST-body och separat default-off feature flag.
4. `/model-control-preview`: knapp **Granska AWS-åtkomst (läsning)** per modell; ingen automatisk körning för alla 126. Säker diagnostik om extra IAM-behörigheten/flaggan saknas.
5. Syntetiska tester för identitetsavvikelser, ofullständiga svar, saknade avtal, IAM-nekanden, CSRF, payload, rollgränser och icke-körning.

## Ägar-GO genomfört: exakt en ytterligare AWS-läsbehörighet

Före ändringen var katalogrollens befintliga inline-policy `Omnira-Bedrock-Catalog-ReadOnly` begränsad till `bedrock:ListFoundationModels` och `bedrock:ListInferenceProfiles`. Inga managed policies var kopplade till rollen. Den ursprungliga policyn har inte ändrats.

AWS dokumenterar `GetFoundationModelAvailability` som en **read**-operation vars IAM-resurstyp saknar avgränsningsbart modell-ARN och därför typiskt använder `Resource: "*"`.

**Genomfört efter uttryckligt ägargodkännande den 17 november 2026:** AWS inline-policy `Omnira-Bedrock-Availability-ReadOnly` har lagts till. Ny IAM-rollvy visar båda separata inline-policies.
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadOnlyFoundationModelAvailability",
    "Effect": "Allow",
    "Action": "bedrock:GetFoundationModelAvailability",
    "Resource": "*"
  }]
}
```

Enbart denna AWS IAM read-åtgärd har tillkommit. Den tidigare testspecifika runtime-rollen och produktion har inte ändrats. Inga `bedrock:InvokeModel*`, `Converse`, Marketplace- eller avtalsskapande-rättigheter har lagts till.

**Vercel verifierat:** `OMNIRA_BEDROCK_AVAILABILITY_ENABLED=true` är satt som encrypted Preview-env, enbart för `feat/omnira-bedrock-pilot-20261116`. De två katalogvariablerna finns kvar på samma gren. Inga produktions- eller generella Preview-variabler har lagts till.

**Rollback:** ta bort/avaktivera enbart denna Vercel-variabel och kör vid behov `aws iam delete-role-policy --role-name Omnira-Bedrock-Catalog-Preview --policy-name Omnira-Bedrock-Availability-ReadOnly` via rätt AWS-konto. Fas 1-katalogpolicyn får behållas.

## Vad resultatet skulle betyda

- `reported_available`: AWS svarade positivt för alla fyra kontrollstatusar **i den tillfälliga katalogrollens källregion**. Inte en verifierad produktions- eller worker-behörighet.
- `not_available`: AWS rapporterade explicit nekande/otillgänglighet/fel; aldrig automatisk fallback.
- `needs_review`: saknat, okänt eller väntande avtal/status; aldrig automatiskt godkänt.
- Inga AWS `errorMessage`, rådata, tokens eller stack traces returneras till UI.
- **Alla** resultat har `canDispatch=false`, `pricingVerified=false`, `regionProcessingApproved=false`, `budgetReserved=false` och `productionInvocationVerified=false`.

## Riktig Preview-kontroll efter aktivering (17 november)

- Commit `f8e858f6337ceffdb4269d0ee3a3daef1db5e2f2` kördes som Vercel Preview `dpl_CMy2uxT46UdVvfQESNx531iqhz2r` (READY). Den ursprungliga katalogläsningen var fortfarande komplett (126 modeller, 103 profiler).
- En enda manuell `GetFoundationModelAvailability`-kontroll av `amazon.nova-micro-v1:0` via Preview gav säkert avslag `availability_metadata_rejected`. Ingen modell kördes och inga uppgifter om modellåtkomst godkändes.
- Ursprungsnormaliseraren krävde att AWS-svaret uttryckligen ekade identiskt `modelId`. För att undvika spekulation har en senare diagnoskorrigering nu åtskilda **sanerade** felkoder för utelämnad modellidentitet respektive faktisk identitetskonflikt, båda fortsatt spärrade. Ingen rå AWS-data eller modell-ID från oväntat svar lämnar backend. Efter nästa Preview-deployment ska den verkliga statusen kontrolleras innan vidare beslut.

## Nästa fas före verklig AI-körning

- En read-only `GetInferenceProfile`-granskning av samtliga tillåtna faktiska destinationer, minst per källregion. Global profiles hålls blockerade tills uttrycklig databehandlingspolicy finns.
- Godkänn aktuellt modell-/region-/profilpris, kreditregler och högsta kostnad per jobb med källbevis och datum. Ingen statisk gissad modellprislista.
- Sammanför separata kontoutfallsbevis med `planModelForWorkflow`, utan att låta användarvald modell kringgå projektbehörighet, STOP, `withGovernedSpend`, samtycke, oberoende granskare eller explicit godkännande.
- Genomför syntetiskt test av alla säkerhetsvägar och därefter **separat godkänd**, maxbeloppsbegränsad manuell testkörning för en modell innan allmän modellroutning övervägs.
- Bedrock Mantle måste utredas separat. Upptäckt i `us-east-1` är inte "alla AWS-modeller i alla regioner".

## Dokumentation

- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetFoundationModelAvailability.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
- https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonbedrock.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html
