# Handlarbörsen · begränsad konkurrentbehörighet för organisationsmedarbetare

2026-10-16. Den godkända organisationen har en aktiv Owner och en aktiv Collaborator. Ingen ny användare, rollrad eller medlemskapsändring görs här.

## Ändring

- Owner behåller sina gamla RLS-skyddade /projects/handlarborsen/competitors-vägar och same-origin-POST.
- Collaborator får en separat, serverauktoriserad projektsida /organization/projects/handlarborsen/competitors och en länk från Handlarbörsen i organisationsvyn.
- Collaborator får läsa samma historiska källkontroller och redan sparade kandidatposter samt manuellt spara en daglig sexkällorskontroll eller en redan redaktionellt granskad kandidat.
- De två nya POST-rutterna använder endast fast servervald projektidentitet, fast källlista, tom body, same-origin, inga godtyckliga URL:er och ingen schemaläggning.
- Färsk session, aktivt organisatoriskt collaborator-medlemskap, koppling till aktiv organisation-Owner och matchande Handlarbörsen id, slug och registrerat namn krävs före privilegierade databasoperationer eller externa källanrop.
- Ägaren går fortsatt via sin ordinarie ägarbehörighet. Inga generella RLS-regler, medlemskapsgrants eller ägar-ID ändras.

## Explicit utanför delegation

Inga rättigheter att hantera ekonomi, budget, API-nycklar, konton, inbjudningar, produktionsdeploy, godkännanden, körningar, kod, schemaläggning, eller att införa nya osanerade skanningskällor. Inga andra projekt får POST-behörighet genom denna ändring. Automatisk konkurrentupptäckt och aviseringar inne i Atlas förblir avstängda.

## Test och release

- Isolerade behörighetstester täcker saknad session, inaktivt/revokerat konto, fel roll, annat projekt-id/slug/namn, ogiltiga begäranden och 403 före nätverk/DB-skrivning.
- Befintliga owner-only API- och historiktester verifieras parallellt för att hindra regression.
- Databasens unika kandidatnyckel och observationernas UTC-dagsspärr är oförändrade.
- Ingen automatisk exekvering introduceras. Aktuella produktionsflaggor är oförändrade; candidate memory är fortfarande endast aktiv i isolerad Preview.
- Efter en grön CI och READY Preview ska en verklig Collaborator-session kontrollera tillgången. En UI-knapp är aldrig ett bevis på serverbehörighet.
