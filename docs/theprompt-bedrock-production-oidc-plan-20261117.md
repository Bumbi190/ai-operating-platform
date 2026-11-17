# Omnira → AWS Bedrock Production: OIDC utan API-nycklar (förberett, inte aktiverat)

**NO-GO: ingen produktionsroll eller produktionskonfiguration har skapats i detta steg.** Det tidigare fungerande `Omnira-Bedrock-Test`-rollexemplet är begränsat till Vercel Preview. Ändra aldrig dess trust till Production.

## Separat, minst privilegierad produktionsroll (för senare godkännande)
Planerat rollnamn: `Omnira-Bedrock-ThePrompt-Production`
Förväntat ARN efter att den skapats: `arn:aws:iam::793854110735:role/Omnira-Bedrock-ThePrompt-Production`

Vercel issuer: `https://oidc.vercel.com/bumbi190s-projects`
Audience: `https://vercel.com/bumbi190s-projects`
Projekt: `ai-operating-platform-web`
Miljö: `production`

Trust policy (endast om operatören efter separat granskning godkänner):

```json
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
          "oidc.vercel.com/bumbi190s-projects:sub": "owner:bumbi190s-projects:project:ai-operating-platform-web:environment:production"
        }
      }
    }
  ]
}
```

En enda initial model Invoke-policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ThePromptNovaMicroOnly",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0"
    }
  ]
}
```

**Avsiktligt inte tillåtet:** bedrock:InvokeModelWithResponseStream, modellprofiler, wildcard-resurser, AWS Marketplace, STS-kontomanipulation, IAM-ändringar, S3, Supabase, publicering eller webbsökning. Behov av skrivmodell (Nova Lite/Pro) måste bedömas och behörigheten utökas separat med godkännande.

Vercel: först när rollen är skapad och verifierad – sätt `AWS_BEDROCK_ROLE_ARN` på **Production**, behåll Preview-värdet oförändrat, och sätt `AWS_BEDROCK_REGION=us-east-1` i Production. Lagra inga AWS API-nycklar för detta flöde. **Rör inte** befintliga `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, de används fortfarande av Remotion Lambda.

## Tillkommande releasegates
1. Verifiera vilka tjänster som faktiskt omfattas av AWS Activate-krediterna i Billing, inte bara i kreditöversikten.
2. The Prompt har budget 100 kr/dag, 400 kr/vecka, 700 kr/månad. Projektbudget finns men den globala H1_SPEND_GATE är ännu inte aktiverad; använd inte den som skenbar hård spärr.
3. Godkänn separat mycket låg daglig andel för webb (förslag max 2 artiklar/dag och separat spenderingsdelbudget), utan att höja eller aktivera globala budgetar för andra projekt.
4. Publiceringslicens ska vara projekt-, kanal-, budget- och tidsbegränsad med godkända källor. Det krävs ett avgränsat GO före någon oövervakad live-artikel.
5. Bedrock Agents Classic är stängt för nya kunder; förmedlingen sker via Omniras projektspecifika roller + Bedrock Runtime och eventuellt AgentCore efter separat kostnadsbedömning.

Ingen IAM-roll, policys, API-nyckel, Vercel-variabel eller produktionsdeployment har skapats av detta dokument.
