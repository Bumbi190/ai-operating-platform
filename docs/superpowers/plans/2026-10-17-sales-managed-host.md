# Atlasstyrd beständig säljworker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the existing inline execution method; use one fresh whole-increment review at the end.

**Goal:** Atlas kan hålla den redan parade Handlarbörsen-workern ansluten, pausa och återuppta utkastarbete samt visa verklig driftstatus utan att André hanterar kommandon eller token.

**Architecture:** Behåll den projektbundna utgående workern och korta jobbleaser. Lägg till en separat, återkallbar managementidentitet som endast får underhålla samma workers anslutning. Hemligheter genereras och lagras på datorn; servern lagrar hashvärden. En användarbunden Windows-uppgift startar en pinnad installation efter inloggning.

**Tech Stack:** Befintlig Next.js/TypeScript/Supabase, Python3.12, Windows Credential Manager, Task Scheduler och befintlig Claude Code2.1.296. Inga nya Pythonpaket eller modell-/molntjänster.

**Spec:** `docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md`, främst §§1,5,6,9. Förtydligad beställning2026-10-17: teknisk konfigurering sköts av Atlas/assistenten; fortsatt arbete med permanent drift godkänt i samtalet15:49 Europe/Stockholm. Den konkreta planen väntar på granskning före implementation.

## För André

Du ska kunna säga ”håll säljförberedelsen igång” eller ”pausa säljförberedelsen”. Den nya beständiga behörigheten gäller endast den redan kopplade datorn och Handlarbörsens utkastarbete och kan återkallas. Den tillåter inga kundutskick. Efter en datoromstart krävs vanlig Windows-inloggning; automatisk inloggning, Windows-lösenord, ström- och nätverksändringar ingår inte.

## Global Constraints

- Rätt Omnira-databas är `iboepohjwrhtgshrqaol`; projektet är `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`. Ingen första-projekt-fallback.
- Befintlig worker `49d30271-cf0b-47c9-a70d-2bce5b9b09ba` är bara ett observerat pilot-ID, aldrig ett hårdkodat produktstandardvärde.
- Inga generella service-role-nycklar på datorn; inga token i modellindata, verktygsresultat, argument, miljöfiler, Git eller loggar.
- Managementbehörigheten är uttryckligt ägarbunden, projektbunden och återkallbar. Den gäller tills ägaren återkallar den eller ägarbindningen upphör. Atlas får inte skapa denna behörighet själv.
- Ordinarie worker-bearer har fortsatt24h giltighet. Förnyelse sker när högst12h återstår, före nästa jobb; pågående modellförsök återstartas aldrig.
- Ordinarie90s claim/15s heartbeat, generationer, stoppkontroller och högst10 modellförsök per jobb behålls.
- host_generation gäller endast anslutningscredentials; credential-rotation får aldrig ändra ett jobs generation eller återauktorisera en förlorad claim.
- Credential-rotation får idempotent återställas efter osäkert HTTP-svar; det ger aldrig rätt att återförsöka ett osäkert modelljobb.
- Windows autostart kör som samma inloggade användare med lägsta privilegier. Ingen tjänst som SYSTEM, administratörshöjning eller automatisk inloggning.
- Ingen godtycklig shell-, fil-, uppdaterings- eller nedladdningsförmåga läggs i Atlas. Desktop Commander-gränsen och övriga worktrees lämnas oförändrade.
- Produktionsmerge/aktivering är en separat slutlig releaseåtgärd. Pausen för bredare outreach, redan kontaktade Founding5 och `sendingEnabled:false` behålls.

## Review Focus

1. Strömavbrott efter serverns credential-rotation men före lokal kvittens: samma förnyelse återställs, inte en ny okänd identitet — Task3.
2. Återkallad worker eller bytt projektägare: gamla managementhemligheter kan inte förnya eller återaktivera behörighet — Tasks1–2.
3. Omstart under extern modellkörning: lokal omstart får inte regenerera ett osäkert jobb — Tasks3–4.
4. Två hostprocesser eller en främmande schemalagd uppgift med liknande namn: ingen dubbel claim/överskrivning — Task4.
5. Ansluten dator med pausat projekt, utgången Claude-inloggning eller fel CLI-version: visa delarnas faktiska status, inte ”Atlas arbetar” — Tasks2,5.

## Kontrakt och filkarta

Nya moduler: `apps/web/lib/sales/host-{types,api,store}.ts`, `apps/web/app/api/sales/host/route.ts`, `workers/sales/{managed_connection,host,journal}.py`, `workers/sales/scripts/{startup-plan,install-startup,remove-startup}.ps1`.

`HostPrincipal={ownerId:string,projectId:string,workerId:string,generation:number}`. `HostStatus={workerId:string,managed:boolean,desiredState:'running'|'paused',connectionState:'online'|'offline'|'revoked',cliState:'ready'|'blocked'|'unknown',lastSeenAt:string|null,workerExpiresAt:string}`. Hemliga hashvärden ingår inte i publika typer.

Host-API accepterar endast `adopt`, `rotate`, `poll`, `report_status`. `adopt` autentiseras med ännu giltig ordinarie worker-bearer och kräver separat ägargrant; övriga operationer autentiseras med management-bearer. Servern härleder identiteten från credential, aldrig från JSON-fält. `rotate` tar `{rotationId,newTokenHash,expectedGeneration}` och returnerar `{generation,expiresAt}`.

### Task1: Beständig ägargrant, rotation och revisionsspår

**Files:** skapa `apps/web/supabase/migrations/20261017141000_sales_managed_host.sql`, `apps/web/supabase/tests/sales_managed_host.sql`, `apps/web/lib/sales/host-types.ts`; ändra `apps/web/scripts/migration-guard-policy.mjs`, motsvarande guardtester och `apps/web/tests/isolation/schema-security.json`.

**Consumes:** befintliga `sales_owner`, `sales_worker`, workerregistrering och återkallning. **Produces:** service-only invoker-RPC:erna `sales_host_authorize`, `sales_host_set_desired`, `sales_host_adopt`, `sales_host_identity`, `sales_host_rotate`, `sales_host_poll`, `sales_host_report_status` med tom search_path.

- [ ] Skriv SQL-regressioner: förnyelse utan ägargrant nekas; främmande projekt/ägare nekas; återkallning/ägarbyte nekar samtliga hostoperationer; samma rotationId/hash ger samma receipt utan förlängd expiry; annan hash på samma ID eller gammal generation nekas; samtidiga rotationer ger en vinnare.
- [ ] Kör Task1-fixturen i den planägda lokala Postgres-containern. Expected: RED för saknade objekt, inte anslutnings-/syntaxfel.
- [ ] Lägg managementgrant, manager_token_hash, host_generation, desired_state, senaste rotations-ID/receipt och hälsofälten på registreringen. `sales_host_authorize` är endast ägaroperation, aldrig Atlasverktyg. `adopt` får bara sätta första managerhashen; samma hash är idempotent, ersättning nekas. Alla anrop kontrollerar aktuell ägarbindning och revoked_at. Poll förnyar endast hälsa, aldrig jobbclaim.
- [ ] Skapa `sales_host_events` som server-only append-only-tabell med project/worker-FK, action, generation och icke-hemlig receiptmetadata. Inga råa headers, payloads eller credentialhashar i event. RLS på, noll klientgrants/policies; service SELECT/INSERT endast, UPDATE/DELETE/TRUNCATE nekas.
- [ ] Uppdatera kanoniska migrationsantal130/116 till131/117; ändra inte frysta grandfathered-listor. Ny tabell är created-not-live tills faktisk katalogkontroll efter godkänd apply.
- [ ] Kör SQL samt migration/security/schema-sviterna. Expected: GREEN med ovanstående förnyelse-/revokeringsegenskaper. Commit `feat(sales): add owner-bound managed host lifecycle`.

### Task2: Smal host-API och säker ägarstyrning

**Files:** skapa `apps/web/lib/sales/host-{api,store}.ts`, `apps/web/app/api/sales/host/route.ts`, `apps/web/lib/qa/sales-host-api.test.ts`; ändra `apps/web/lib/sales/api.ts`.

**Consumes:** Task1 RPC/typer samt befintliga scope-/HTTP-gränser. **Produces:** `authenticateSalesHost(db,tokenHash):Promise<HostPrincipal>`, `createSalesHostApi(deps):(request:Request)=>Promise<Response>`, ägaroperationerna `authorize_managed_worker` och `set_worker_desired`.

- [ ] Skriv testfall för fel authsyfte, modifierat projekt/worker-ID, extra fält, >64KiB, trasig UTF8, feature-off, återkallad principal, ägarbyte och hash/credential i publika svar. Owner-mutation kräver verklig ägarsession/same-origin; hostanrop använder endast bearer.
- [ ] Kör `npx vitest run lib/qa/sales-host-api.test.ts --maxWorkers=2 --minWorkers=1`. Expected: RED på saknad handler.
- [ ] Implementera fasta operationer och strikt fältvalidering. Managementhash måste vara64 hextecken; raw management-/worker-bearer är43 base64urltecken. Privata svar har befintliga no-store/no-referrer-headers. Ingen handler tar emot URL, filväg, shell, lösenord eller modellval. Returfel är fasta koder utan rå exception.
- [ ] Kör samma tester och befintliga sales-api-/worker-protocol-tester. Expected: GREEN, befintliga jobbstopp/fences oförändrade. Commit `feat(sales): expose bounded host connection operations`.

### Task3: Lokal Credential Manager-journal och återställbar förnyelse

**Files:** skapa `workers/sales/{managed_connection,journal}.py`, `workers/sales/tests/test_managed_connection.py`; ändra `credential_store.py`, `protocol.py`.

**Consumes:** Task2 HTTPS-kontrakt. **Produces:** `ManagedConnection.ensure_worker_token(now)->str`, `ManagedConnection.poll_status()->dict`, `CredentialStore.delete(name)`, atomisk lokal journal med endast referenser/hashar/generationer.

- [ ] Skriv fake-transport/OS-store-tester: avbrott efter staged credential, efter servercommit och före lokal active-pointer; replay av samma rotationId; saknad staged secret; två parallella starter; revoked/owner-changed. Assert att inga secretsträngar når argv, journal eller loggar och att inga modellförsök görs.
- [ ] Kör `python -m unittest discover -s workers/sales/tests -p test_managed_connection.py -v`. Expected: RED.
- [ ] Generera managerhemligheten lokalt, lagra/read-back före `adopt`, skicka endast hash som indata. Staga ny workerhemlighet i Credential Manager före rotation; fsync journal med stabilt rotationId före dispatch. Efter bekräftad receipt byts active-referens atomiskt och föråldrad credential rensas. Okänt svar återställs med samma ID/hash; efter tre transportfel visas unavailable och inget modelljobb dispatchas. Ingen plaintext-fallback.
- [ ] Kör hela worker-unittest-sviten. Expected: GREEN och befintligt test för ingen modellretry fortsatt godkänt. Commit `feat(sales): recover managed credentials without secret handoff`.

### Task4: Ägd Windows-livscykel och pinnad installation

**Files:** skapa `workers/sales/host.py`, tre ovan namngivna PowerShell-skript och `workers/sales/tests/test_host_lifecycle.py`; ändra `cli.py`, README.

**Consumes:** Task3 och befintliga `run_once`/doctor. **Produces:** `python -m workers.sales.cli host --project UUID`, `New-SalesStartupPlan(...)`, ägarskapskontrollerad preview/apply-installation och borttagning av exakt egen task.

- [ ] Skriv tester för single-instance-lås, fel manifesthash, annan taskägare/action, spaces/XML-tecken/reparse points, pausad/återkallad host och omstart efter osäker modellcall. Assert noll automatisk återköning av gamla jobb.
- [ ] Kör unittest samt PowerShell-plan/ägarfixture utan att registrera en riktig task. Expected: RED.
- [ ] Använd pinnad installation under LocalAppData; verifiera manifest före jobbkörning. Håll ett Windows-filkörningslås. Task `\Omnira\Omnira-Sales-{workerId}` använder exakt användar-SID, InteractiveToken, LeastPrivilege, LogonTrigger, IgnoreNew och fasta python/entrypoint/config-vägar. Befintlig främmande task nekas; identisk ägd task är no-op. Begränsa crashrestart till3 försök med1min mellanrum; journal/fences gäller även efter restart. Ingen automatisk source-/Claudeuppdatering.
- [ ] Kör samma tester. Expected: GREEN. Installera inte autostart eller ny långvarig grant förrän releasekontrollerna är uppfyllda. Commit `feat(sales): supervise the owned Windows draft worker`.

### Task5: Atlas sköter vardagsdriften

**Files:** ändra `apps/web/lib/sales/{atlas-tools,types,view-model}.ts`, `apps/web/components/platform/vnext/sales/SalesWorkspace.tsx`; skapa `sales-host-atlas-tools.test.ts`, `sales-host-view-model.test.ts` i `apps/web/lib/qa/`.

**Consumes:** Task2 HostStatus/ägarkontroll och Task4 host. **Produces:** `get_sales_connection_status(projectId)` och `manage_sales_connection({projectId,workerId,action:'pause'|'resume'|'reconnect'})`. Verktygen kan endast påverka redan ägarauktoriserad anslutning.

- [ ] Skriv tester: verklig konversationsbindning, feature-off, annan host/projekt, oauktoriserad grant, inga godtyckliga kommandon/token i modellinput/output, korrekt online/paused/CLI-blocked-status. Webbsidan får ingen nödvändig kopiera-token-/terminalsekvens för normal användning.
- [ ] Kör nya tester. Expected: RED på saknade verktyg/status.
- [ ] Implementera serverhärledd status och små kontrolloperationer. Reconnect begär avstämning/förnyelse, inte ny behörighet eller självåteraktivering efter revoke. Vanliga instruktioner förklarar affärsläget, inte kommandon. Studio får inga hostverktyg. Grant/revoke visas som behörighetsåtgärder, inte som utkastgodkännande.
- [ ] Kör nya/befintliga sales- och berörda chattregistrerings-/Studio-gränstester samt `npm run typecheck`. Expected: GREEN. Commit `feat(sales): let Atlas manage the authorized draft connection`.

### Task6: Verifiering, driftsättning och rollback

**Files:** utöka `apps/web/scripts/test-sales-db.mjs` med den nya lokala SQL-fixturen; skapa `docs/superpowers/verification/2026-10-17-sales-managed-host.md`.

- [ ] Lägg tvärlagerscenario: ägargrant → lokal adopt → serverrotation → krasch/återställning → Atlas pause/resume → revoke → gamla credentials nekas. Verifiera noll SMTP/IMAP/modellanrop i livscykelfixturen och oförändrade jobbfences.
- [ ] Kör samtliga sales-/host-unittester, verklig lokal SQL-integration, migrationssäkerhet, typecheck och desktop/mobil-kontroller. Befintlig full-suite-baseline401 fel är dokumenterad, aldrig skäl att kalla releasen helgrön; nya fel blockerar leverans.
- [ ] Utför en färsk oberoende granskning av just detta increments diff mot planens bas. Gradera före en regressionstestad fixomgång; ingen upprepad re-review av samma fixar.
- [ ] Efter godkänd plan/release: applicera exakt granskad migration, kontrollera RLS/grants/funktioner och advisor-delta, ge enbart den valda hosten ägargrant, prova riktig förnyelse och revoke innan autostart installeras. Om ny preview används måste den pinnade origin flyttas uttryckligt; ingen credential skickas till godtycklig alias/redirect.
- [ ] Kontrollera task ownership/XML, verklig process, upprepad serverheartbeat och att återstart efter inloggning behåller generation/journal. Rollback: revoke exakt worker/grant, stoppa/borttag endast ägd task/process; inga andra Python/Claude/Ollama-processer berörs.
- [ ] Spara faktiska kvitton och limitations. Den gamla23h-hostens STOP markeras först när ersättaren verifierats; parallella claimers ska aldrig lämnas av misstag. Commit/pusha granskningsbart resultat. Inga kundjobb eller kundutskick aktiveras som installationsprov.

## Självgranskning och handoff

Kravtäckning: ägar-/projektidentitet och secretisolering Tasks1–3; återställning/Windows Tasks3–4; Atlasstyrning Task5; verklig drift/rollback Task6. Arkitekturmönster för ägd Windows-task har lästs från det publicerade lokala textspåret, men inga av dess filer, credentials eller aktiva processer importeras/ändras. Nyckel-/mailbox-handoff är separat nästa plan. Ingen produktkod eller ny behörighet skapades när planen skrevs.

Planen ska granskas före implementation enligt det bevarade inline-flödet. Efter godkännande följer `2026-10-17-sales-strato-connection.md`; då behövs som mest en säker postfacksinloggning i formuläret, inga tekniska ägarsteg.
