# Omnira AWS OIDC preview – isolerat pilottest (2026-11-16)

Gren: feat/omnira-bedrock-pilot-20261116. Produktion: orörd.

## Säkerhet
- Endast POST /api/bedrock-pilot-check, ingen GET-funktion eller automatisk körning.
- VERCEL_ENV måste vara preview och VERCEL_GIT_COMMIT_REF måste exakt matcha pilotgrenen.
- En token från Vercels x-vercel-oidc-token-header skickas endast över HTTPS till AWS STS AssumeRoleWithWebIdentity.
- Resultatet visar bara boolesk status. Inga tillfälliga AWS-credentials, tokens eller STS XML-svar exponeras.
- Inga Bedrock-modellanrop görs och inga gamla AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY används.
- Skydda Preview med Vercels SSO och använd ingen anpassad publik domän.

## Manuell kontroll (efter grön preview-build)
Öppna den SSO-skyddade preview-URL:en för pilotgrenen och gå till /bedrock-test.
Klicka på knappen Verifiera AWS-anslutningen (inga modellkostnader).
Förväntat svar: Godkänt: Vercel OIDC till AWS STS fungerar, ingen modell anropad.
Andra svar: felsök endast i pilotgrenen. Låt IAM:s trust policy och gamla AWS-variabler vara orörda.

## Avslutat manuellt Nova Micro-test
- Modell: amazon.nova-micro-v1:0, us-east-1. Verifierat svar: Hej; 15 indatatokens och 3 utdatatokens.
- Det manuella engångstestet är färdigt. Den tidigare avgiftsbelagda POST-routen tas bort i denna revision. Kör inga fler betalda tester utan en granskad anslutning till Omniras gemensamma kostnadsspärr.
- Se docs/aws-bedrock-readiness-20261116.md för teknisk överlämning, kreditosäkerhet och städkriterier.

## Efter pilot
Städa bort de temporära endpoints och grenens env-variabler innan radering av pilotgrenen. Ändra inte andra projekt eller produktionsnycklar.
