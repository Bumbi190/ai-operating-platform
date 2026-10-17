# Handlarbörsen · Medarbetarens manuella Konkurrentspanare – middlewarekorrigering

Datum 2026-10-17. Avgränsad fix för redan mergade P1-/P2-rutterna, utan schema- eller organisationsändring.

## Fynd
Omniras middleware har en fail-closed tillåtelselista för inloggade medarbetare. De äkta, serverauktoriserade POST-rutterna för Handlarbörsens konkurrentbevakning fanns ännu inte på listan. Därför kunde Oscar se sin organisationsvy men skulle få HTTP 403 när han tryckte på Spara historik, Spara kandidat eller ett granskningsbeslut.

## Ändring
- Middleware släpper igenom enbart `POST /api/organization/projects/handlarborsen/competitors/{candidates,history,reviews}` för aktiv collaborator. Samtliga andra verb, syskonprojekt, ändrade sökvägar, extra segment och gamla ägar-API:er fortsätter få 403.
- Den nya medarbetarrutten för reviews gör dessutom separat aktiv session-/projektbehörighetskontroll via `authorizeOrganizationCompetitorAction('record_competitor_evidence')` före service-role RPC. Den befintliga CAS-versioneringen, idempotens, RLS och databasens medlemskapskontroll gäller oförändrat.
- Gränssnittet väljer faktiskt organisationsrutt för collaborators och ägarrutt för owner. Historik- och kandidatsparande hade redan organisations-URL i klienten.
- Ingen ny databas, migration, org-ägare, medlemskapsändring, sökprovider, cron, automatisering eller avisering.

## Bevis
- Ett särskilt middleware runtime-test verifierar exakt tre POST-rutter, och nekar GET/PUT, främmande projekt/segment, ägar-API och återkallat medlemsskap.
- Ett nytt rutt-test verifierar 409 när flaggan är av, same-origin och payload, explicit scoped collaborator grant, samt 201/200/409/403/422/503-koder.
- P1/P2 behörighet, kandidatminne, sexkällshistorik, CAS/replay, Migration Guard och schema-security regressionstestas före merge.
- Oscar behöver inte testa idag; en riktig autentiserad session får fortfarande en separat slutkontroll senare.

## Drift
Ändringen ska mergas till `main` först efter sju gröna GitHub-grindar och READY Preview. Inga Vercel-produktionsflaggor behöver ändras för att detta ska ta effekt efter godkänt produktionsbygge.
