# Omnira – Bedrock-katalog via separat skrivskyddad OIDC-roll
Datum: 2026-11-17 · Status: FÖRBEREDD, INGA IAM-ÄNDRINGAR GENOMFÖRDA.

## Syfte
Central modellupptäckt för alla Omnira-workflows utan någon rätt att köra modellen.
AWS Bedrock Runtime har ListFoundationModels (en regionbunden lista utan sidtoken)
och ListInferenceProfiles (separat sidindelad lista med nextToken). Resultaten
bevisar INTE att AWS-kontot får anropa, kreditfinansiera eller lagra data hos modellen.
Bedrock Mantle kräver en separat framtida katalogadapter.

## IAM-läsroll – föreslagen, INTE skapad
Roll: Omnira-Bedrock-Catalog-Preview
ARN: arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview

Befintlig Omnira-Bedrock-Test lämnas oförändrad. Ingen nyckel behövs.

### Föreslagen trust policy för Vercel Team OIDC, Preview
~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::793854110735:oidc-provider/oidc.vercel.com/bumbi190s-projects"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/bumbi190s-projects:aud": "https://vercel.com/bumbi190s-projects",
          "oidc.vercel.com/bumbi190s-projects:sub": "owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview"
        }
      }
    }
  ]
}
~~~

Trust gäller Vercel-projektets hela Preview-miljö, INTE enbart en Git-gren.
Applikationens route är hårt bunden till AWS-testgrenen och variablerna ska
också begränsas till den. Ingen wildcard på subjektet.

### Föreslagen inline IAM-policy med ENDAST två liståtgärder
~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyBedrockRuntimeCatalog",
      "Effect": "Allow",
      "Action": [
        "bedrock:ListFoundationModels",
        "bedrock:ListInferenceProfiles"
      ],
      "Resource": "*"
    }
  ]
}
~~~

Policy ger INTE bedrock:InvokeModel, köp/provisionering, STS-administrering,
IAM-förändringar, Supabase, publicering eller AWS Marketplace.
Listoperationerna behöver generellt Resource "*" även för en avgränsad läsroll.

## Nya Vercel-variabler – ännu INTE satta
Endast Preview + feat/omnira-bedrock-pilot-20261116:
- AWS_BEDROCK_CATALOG_ROLE_ARN = arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview
- OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED = true

Inga andra variabler ska ändras. Remotions befintliga AWS-nycklar och
Nova Micros IAM-roll ska bevaras.

## Kod i samma isolerade testgren
- lib/ai/model-control/catalog-oidc.ts: OIDC -> STS enbart för Catalog-Preview.
- lib/ai/model-control/bedrock-catalog-service.ts: @aws-sdk/client-bedrock,
  explicita kortlivade credentials, ListFoundationModels och ListInferenceProfiles,
  maxAttempts=1. Aldrig Runtime-client eller modellkostnader.
- lib/ai/model-control/discovery-normalize.ts: status, modalitet, ID, provider,
  lifecycle, profiles och destinationsregioner; alla åtkomsträttigheter FALSE.
  Paginering som avbryts ger fel, aldrig godkänd partiell katalog.
- POST /api/model-control/bedrock-catalog: samma origin, plattformoperatör,
  exakt AWS-Preview-branch, avstängd utan explicit flagga och läsroll.
- /model-control-preview: visar startkatalog och eventuellt AWS-resultat.

## Produktionsgräns
Ingen live-modell får användas från listan utan separat verifiering av
modellåtkomst, känd prislista och AWS-credit-bokföring, kvalitet, databehandling,
fysisk STOP, withGovernedSpend och giltigt mänskligt beslut/autonomilicens.
Modeller kan kräva inference profiles eller särskilda endpoints/regioner.
Mantle upptäcks separat i en kommande etapp.

AWS-dokumentation:
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html

## Felsökning 17 november 2026

- Första verkliga Preview-anropet gav catalog_response_incomplete. AWS-åtkomsten kom förbi OIDC/STS och rättighetskontrollen, men normalisering eller paginering av modellmetadata underkändes.
- Rotorsaken är ännu INTE verifierad. Ingen IAM-roll har fått utökade rättigheter, och inga betalda modeller har anropats.
- Ny Preview-diagnostik skickar enbart kontrollerade felkategorier: invalid_model_identifier, invalid_profile_identifier, invalid_profile_destination, missing_profile_list, duplicate_model_identifier, duplicate_profile_identifier, pagination_incomplete, invalid_pagination, catalog_size_limit, profile_size_limit eller unknown_validation_error.
- Råa AWS-felsvar, tokens, kontonummer, hemligheter, modell-ID:n och stack traces returneras inte vid fel. Ingen partiell katalog markeras som giltig.
- Efter att diagnosen fångats behöver aktuell avvikelse korrigeras och regressionskontrolleras innan nästa riktiga katalogtest.

## Korrigering efter diagnosen invalid_profile_destination

- AWS dokumenterar global cross-Region inference med giltig ARN utan region eller kontonummer, t.ex. arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0.
- Den tidigare strikta parsern krävde en region efter bedrock: och avvisade dessa globala profiler. Det är den verifierade kodbristen; om den förklarar varje post i det verkliga svaret återstår att bekräfta i Preview.
- Nu extraheras regioner bara från uttryckligen regionala foundation-model-ARN:er; global regionlös ARN markeras med globalDestinationUnspecified=true och destinationslistan förblir tom för den posten.
- UI visar särskild GLOBAL ROUTING-varning. Det finns ingen slutsats om faktisk datalagringsregion, tillåten routing, rätt att använda profilen eller prismodell; destinationRegionsApproved=false och canDispatch=false gäller även om katalogläsningen blir grön.
- Ogiltiga ARN-resurstyper, osäkra tecken och modell-ARN:er med felaktigt account-fält fortsätter nekas.
- Testfall täcker normal regional ARN, global ARN, blandade ARN, felaktiga ARN och total pipeline genom simulerad AWS SDK-respons.

Källa: https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html

Ingen IAM-policy har ändrats, ingen modell har anropats och ingen produktionsdeployment ingår.
