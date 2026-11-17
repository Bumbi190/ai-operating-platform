# Omnira Bedrock – fas 3 · exakt modellidentitet, källregion och körgrind

Datum: 2026-11-17
Repo: Bumbi190/ai-operating-platform
Existerande arbetsgren/worktree: `feat/omnira-bedrock-pilot-20261116`
Start-HEAD: `82370d7a797d501808a0c42276ee60eb081d15d2`
Status: **ägar-GO genomfört för separat IAM-läsbehörighet och branchlåst Vercel Preview-flagga**. Koden publiceras endast via befintlig AWS-testgren. Inga AI-modellanrop, produktionsrättigheter eller prissättningar aktiveras.

## Underlag som faktiskt verifierats

- Fas 1 i AWS Preview: katalog från `us-east-1`, 126 foundation models och 103 inference profiles. Metadata innebär inte körbehörighet.
- Fas 2: `amazon.nova-micro-v1:0` gav `AUTHORIZED`/`AVAILABLE`-signaler för oversionerad AWS-respons `amazon.nova-micro-v1`. Enligt kodens safe gate förblir exakt versionsidentitet **overifierad** och `canDispatch=false`.
- AWS dokumenterar att `ListInferenceProfiles` är en översikt för den anropande källregionen. `GetInferenceProfile` från samma källregion behövs för att validera profilens då aktuella destinatoner. Även en lyckad profilkontroll bekräftar inte modellavtal, databehandlingsgodkännande, pris eller driftsåtkomst.

## Nytt lokalt kodarbete

1. `discovery-normalize.ts` behåller nu exakta modell-ID:n i varje profil: `modelIds`. Vi drar ID:n från giltiga foundation-model-ARN-resurser och **behåller suffix**, t.ex. `:0` och `:0:128k`. Dubletter dedupliceras och sorteras. Profilöversikten har alltid `profileDetailsVerified=false`.
2. `model-release-readiness.ts` förenar katalog och fas 2-åtkomst på ett rent, kostnadsfritt sätt, men tilldelar **aldrig** `canDispatch=true`. Den vägrar bl.a. fel modellversion, annan källregion, gamla modeller, oklart profilval, blandade modell-ID:n och global routing med okända destinationsregioner. Saknad prissättning, kreditavräkning, budgetreservation och godkännande anges alltid som öppna spärrar.
3. `/model-control-preview` visar kopplingar mellan modell och profil endast som `ListInferenceProfiles`-metadata; ingen profil upphöjs automatiskt till godkänd körväg.
4. `profile-detail-service.ts` erbjuder källregionsbunden **GetInferenceProfile**, men först efter separat aktivering. Exakt profil-ID måste först förekomma en gång i en fullständigt paginerad `ListInferenceProfiles`. Bara `ACTIVE`/`SYSTEM_DEFINED` accepteras. Get-svaret måste ha samma profil-ID, samma ARN när listsvaret har ARN, giltiga model ARNs och en icke-tom modellista. Både IAM-fel och råa svar saneras. Ingen Runtime-klient används.
5. `POST /api/model-control/bedrock-profile-detail` är operator-auth, same-origin, begränsad JSON, exakt Pilot-Preview-gren och **ny default-off flagga**. Inga ekonomiska eller produktionsåtgärder.

## Godkänd och verifierad AWS-läsrättighet inför Preview-kontroll

Befintlig OIDC-rolle `Omnira-Bedrock-Catalog-Preview` har redan:
- `bedrock:ListFoundationModels`
- `bedrock:ListInferenceProfiles`
- `bedrock:GetFoundationModelAvailability`

Ägaren har godkänt **endast** ytterligare `bedrock:GetInferenceProfile` på systemdefinierade inference-profiler i `us-east-1`. Inline-policyn `Omnira-Bedrock-Profile-Detail-ReadOnly` har skapats på katalogrollen och återlästs från AWS via CloudShell. Dess enda tillåtna IAM-åtgärd och resursmönster är:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadSystemInferenceProfileDetailsInSourceRegion",
    "Effect": "Allow",
    "Action": "bedrock:GetInferenceProfile",
    "Resource": "arn:aws:bedrock:us-east-1:793854110735:inference-profile/*"
  }]
}
```

AWS ListInferenceProfiles bekräftar att aktiva systemprofiler i detta konto faktiskt använder ARN-formatet `arn:aws:bedrock:us-east-1:793854110735:inference-profile/<profil-id>`. Den nya policyn innehåller **inte** application-inference-profile, Runtime, köp, Marketplace, Supabase eller generell `Resource: "*"`-rättighet. IAM-policyåterläsningen bekräftade ändringen; en verklig Preview-kontroll återstår som separat verifiering.

Separat Vercel-variabel har nu skapats och verifierats:
`OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED=true` (encrypted), enbart `preview` + `feat/omnira-bedrock-pilot-20261116`. Övriga AWS-katalogvariabler är oförändrade.

Rulla tillbaka genom att avaktivera just denna nya flagga och ta bort endast den nya IAM inline-policyn. Befintlig katalog och tillgänglighetskontroll kan fortsätta oberoende.

## Pris- och budgetkrav innan framtida modellkörning

- Välj först exakt modell, profil-ID, källregion, körväg och modalitet; visa giltig, daterad källa till **specifik** input-/output-/bild-/ljudprissättning och eventuell global/geografisk differentiering. AWS Bedrocks officiella prissida varierar per modell, modalitet och servicenivå.
- Hämtad profillista är inte ett prisbevis. Ingen USD-per-token har satts i kod, inget dollarpris har fabricerats.
- Kreditavräkning är separat, ej styrkt. Budgetgrinden ska konservativt räkna bruttokostnad före kredit och kända max-outputgränser, med riktig `withGovernedSpend`/STOP och post-körningsavräkning.
- Global profil får inte automatiskt routas utanför godkända regioner, även om den har lägre pris eller AWS visar `ACTIVE`.
- Nya körbehörigheter kräver separat granskning av produktion/Preview-IAM, projekt-/workflow-ägarskap, dataavtal, samtycke och explicita mandat.

## Acceptanskriterier fas 3 lokal

- Syntetiska tester för exakta modell-ID-joins, skilda versionssuffix, global okänd region, oaktiv profil, paginering och negativ IAM-auth.
- Den separat godkända endpoint-flaggan är endast aktiverad på AWS-testgrenens Preview. Inga generella Preview-, produktions-, Runtime- eller ytterligare IAM-rättigheter har aktiverats.
- Alla testade positiva svar fortsätter returnera `canDispatch=false`, `priceVerified=false`, `destinationRegionsApproved=false` och `modelCallsMade=false`.
- Utvald verklig testprofil: `us.amazon.nova-premier-v1:0`. Den är observerad som `ACTIVE` och `SYSTEM_DEFINED` i AWS:s faktiska listning från `us-east-1`, med kontobundet ARN i rätt mönster. Efter färdig Preview-build ska **endast denna profil** kontrolleras med GetInferenceProfile. Ingen modell får anropas. Redovisa enbart säker metadata.

## Officiella referenser

- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetInferenceProfile.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html
- https://aws.amazon.com/bedrock/pricing/
- https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonbedrock.html
