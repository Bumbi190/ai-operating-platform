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

## Efter grönt OIDC-test – manuellt Nova Micro-test
- AWS Activate-krediter kan enligt AWS användas till berättigade Bedrock-modeller; kontrollera senare faktisk kredittillämpning i Billing.
- Klicka enbart en gång på 'Kör ett Nova Micro-test' på samma Preview-sida för ett verkligt, mycket litet inferensanrop.
- Modell: amazon.nova-micro-v1:0, us-east-1. Fast systemgenererad testtext; högst 48 utdata-tokens. Ingen användardata skickas. Testet utlöses aldrig automatiskt.
- AWS-bedrock klienten får endast temporära STS-credentials från OIDC, inte AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY i Vercel.
- Kontrollera svaret och tokenantal. Budget 10 USD/mån är en varning, inte en hård spärr.

## Efter pilot
Städa bort de temporära endpoints och grenens env-variabler innan radering av pilotgrenen. Ändra inte andra projekt eller produktionsnycklar.
