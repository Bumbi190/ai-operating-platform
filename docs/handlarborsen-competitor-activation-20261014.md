# Handlarbörsen – konkurrenshistorik: faktisk databasinstallation 2026-10-14

## Produktionsdatabas – verifierad

**Godkännande:** operatören begärde aktivering av konkurrenthistoriken och godkände separat även autonom bevakning. Autonom schemaläggning är dock fortsatt gatad av Cost Governance; detta dokument avser först och främst den manuella lagringsfunktionen.

- Supabase-projekt: Omnira, `iboepohjwrhtgshrqaol`.
- Exakt migration: `handlarborsen_competitor_observations_v1` via godkänd Supabase migration-API, ledger-version `20261014133814`.
- Den bytebevarade SQL-kandidaten finns i `apps/web/supabase/migrations/20261014143000_handlarborsen_competitor_observations_v1.sql`. Kommentarens gamla "UNAPPLIED" beskriver tidigare granskningsläge, inte aktuell drift; SQL hålls bytebevarad gentemot godkänd candidate.
- READ-ONLY-verifiering efter apply: tabell finns, `relrowsecurity=true`, `relforcerowsecurity=true`, noll RLS-policies; anonym och vanlig authenticated-åtkomst nekas; service-role har SELECT+INSERT men inte UPDATE. Antal poster efter apply: 0. Projekt-ID, slug och migrationsledger verifierades också.
- Autonom bevakning, manuell sparning, modeller, cron, Atlas-exekvering och kostnadsgrindar ändrades **inte** av databasapply. Inga data skapades.

## Release-kod och effektiv säkerhetsinventering

- Kodbasen var före denna PR synkroniserad med Atlas PR #337; dess website-migration fanns redan i produktion och i `main`.
- Kandidatkoden har en ägargatad manuell skrivväg bakom serverflaggan `HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED` (frånvaro = OFF), ett max på sex fördefinierade källor, exakt UTC-dag, inga fria URL:er och ingen automatisk bakgrundsskanning.
- `schema-security.json` har uppdaterats efter faktiska read-only DB-bevis till 100 live tabeller. Den förra ögonblicksbilden hade 97; tre nyss verifierade SERVER_ONLY-tabeller har flyttats från `created_not_live` till kartan: `atlas_analysis_drafts`, `atlas_analysis_draft_events`, `handlarborsen_competitor_observations`. 97 tidigare klassningar har inte ersatts utan ny granskning; metadata beskriver den begränsningen.
- Guard-v2 räknar nu 117 canonical / 103 enforced. Produktionsledgern har exakt en extra migration (140 poster vid den tidigare avstämningen).
- Isolerade real-Supabase-PG17.6-tester bekräftade immutabel enskild dagsuppsättning, 8 samtidiga insättningar, RLS, least privilege och rollback.
- Fokus-test innan release: 234/234 riktade tester passerade, TypeScript, git diff check också godkända.

## Kvarvarande driftsekvens

1. Publicera/merge granskad kod under repositoryns existerande branch protection och de tre obligatoriska CI-checkarna. Kringgå inte skydd för att spara Actions-kostnader.
2. Verifiera produktion/deploy med serverflagga OFF och Atlas-projektsidans read-only struktur oförändrad.
3. Slå på flaggan bara i en skyddad, behörighetsbunden test-Preview och gör en owner-driven första skanning/sparning.
4. Verifiera exakt sex rader, ett källnamn per källa, rätt UTC-dag, SHA256, failure status vid BCA och att ny klickning inte skriver över. Säkerställ att en annan organisationsmedlem nekas skrivning.
5. Manuell produktion ON först efter validerad Preview och säker schema-registrering.
6. Autonom veckobevakning ON först efter Band 1 och Band 2 Cost Governance i båda miljöer, explicit budget, kill switch, lease, audit, idempotens, villkorskontroll och separat schemaläggningsimplementering.

**OBS:** detta dokument utgör inte verifiering av första riktiga observationen. Fram till att sådan finns ska historiken visa sanningsenligt att data saknas.
