# Säker Strato-anslutning från Atlas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve inline execution and one fresh whole-increment review at the end.

**Goal:** André kan ansluta Handlarbörsens Strato-postfack via ett säkert Atlas-formulär; den lokala hosten provar SMTP/IMAP-inloggning och Atlas visar korrekt resultat, utan att lösenordet går till modellen eller lagras i serverklartext.

**Architecture:** Bygg ovanpå den projektbundna, redan ägarauktoriserade hosten från planen `2026-10-17-sales-managed-host.md`. Webbläsaren krypterar credentials till hostens publicerade publika nyckel; servern förmedlar endast en tidsbegränsad krypterad engångsbegäran. Lokal host lagrar bekräftade credentials i Windows Credential Manager och returnerar en hemlighetsfri receipt.

**Tech Stack:** Befintlig Next.js/Web Crypto/Supabase, Python3.12 SSL/imaplib/smtplib, Node22 inbyggda crypto, Windows Credential Manager. Inga nya Resend-konton, MX-ändringar, API-abonnemang eller Pythonpaket.

**Spec:** `docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md` §§1,6,7,9. Detta är B1: säker anslutning/inloggningsprov. B2 inkorg/checkpoints och C exakt sändningsauktorisering återstår separat och får inte märkas färdiga av denna leverans. Konkret plan väntar på granskning.

## För André

Atlas sköter anslutningsinställningarna och provet. Om postfackslösenordet behövs skriver du det en gång i anslutningsformuläret, aldrig i chatten. Lösenordet stannar mellan webbläsaren och din lokala host i den här konstruktionen. Resultatet betyder att inloggningen fungerar; inga kundmejl skickas och ingen inkorg importeras av detta prov.

## Global Constraints

- Managementhostens färdiga projekt-/ägarkontroll är prerequisite. Den befintliga23h-preview-hosten har inte redan dessa mailboxförmågor.
- Använd faktisk, av ägaren bekräftad fullständig postfacksadress. `info@handlarborsen.se` är förifylld kandidat, inte bevis för genomförd inloggning eller mailboxägande.
- Endast `smtp.strato.de:465` och `imap.strato.de:993`, verifierad SSL/TLS minst1.2, normal lösenordsautentisering; ingen CRAM-MD5, okrypterad transport, fri endpoint eller modellvald URL.
- Anslutningsprovet gör auth och logout endast: inga SMTP MAIL/RCPT/DATA, IMAP SELECT/SEARCH/FETCH/STORE/APPEND, mapplistor eller meddelande-/bilagehämtning.
- Credentialformuläret skickar aldrig fälten password/privateKey till API. Modellen får endast formreferens och status. Server/API/logg/telemetri innehåller aldrig klartextlösenord, privatnyckel eller AES-nyckel.
- Hybridformat `sales-strato-envelope-v1`: RSA3072/OAEP-SHA256 omsluter en ny32bytes AES-nyckel; AES256-GCM med ny12bytes IV och128bit tag krypterar max4096bytes UTF8-credential-JSON. RSA används inte direkt för ett långt lösenord.
- Lösenord är1–2048 UTF8-bytes och får inte innehålla NUL; ingen trunkering. Credential Manager lagrar lösenordet separat från icke-hemlig kontometadata. Envelopefältet ciphertext är kryptotext följd av16bytes GCM-tag, som i WebCrypto; alla binärfält är kanonisk base64url utan padding.
- OAEP label och GCM AAD är exakt UTF8 `OmniraSales/strato/v1\n{projectId}\n{workerId}\n{setupId}\n{kid}`. Nonce/setupId är serverutfärdat engångs-ID; tag/context måste stämma före credentialanvändning.
- `kid` är SHA256 över publik DER/SPKI. Endast publik RSA JWK med exponentAQAB och3072bit modulus får registreras. Privat PKCS8/DER lagras base64 i Credential Manager och måste rymmas inom2560bytes; inga plaintextfiler.
- Cipherbegäran kan behandlas högst15min från skapandet. Ciphertext rensas vid terminal receipt och genom eget pg_cron-jobb var5:e minut efter expiry. Metadata får behållas, inga råa secrets/ciphertexter i audit.
- Publicerad nyckel är inte hårdvaruattestering. Webbläsarens egen kod, användarens OS-konto och lokala host är betrodda; inga löften om skydd mot komprometterad förstapartskod/host eller garanterad heapnollning.
- En aktiv setup per host; övriga nekas med begriplig status. Lease90s, timeout per auth10s, separat Node-helpertimeout10s, generation/revokering kontrolleras vid claim och resultat. Ingen automatisk lösenordsretry efter authfel.
- Inga verkliga SMTP-/IMAP-försök före säker inloggning. Testmottagare/text begärs först när sändningsdelen faktiskt är byggd; B1 behöver ingen testmottagare.

## Review Focus

1. Fel/swap av hostnyckel, projekt, mailbox, setupID eller AAD: ingen decrypt/användning, inte auth mot fel konto — Tasks1–3.
2. Process-/nätavbrott efter lyckad auth men före lokal credential-/serverreceipt: ingen osann ”ansluten”, ingen nedskrivning av nyare config — Tasks2–3.
3. Lösenord och privata nycklar som överstiger store-/krypteringsgränser eller innehåller Unicode: tydlig vägran utan läckage — Tasks1,3.
4. Inspelning/telemetri, felutskrifter och hjälpverktygens stdout: hemligheter får inte nå observationer eller modeller — Tasks3–4.
5. Redan lästa mejl, svar från telefonen och tidigare outreach: B1 ska inte låtsas att inkorgshistorik eller kundkontakt är kontrollerad — Tasks4–5.

## Kontrakt och filkarta

`MailboxContext={projectId,workerId,mailboxId,setupId,kid,email,expiresAt}`. `SealedMailboxEnvelope={format:'sales-strato-envelope-v1',wrappedKey:string,iv:string,ciphertext:string}` med base64url utan fri metadata. `MailboxStatus={mailboxId,email,status:'not_connected'|'waiting_for_host'|'probing'|'authenticated'|'needs_input'|'reconciling',smtpAuthenticatedAt:string|null,imapAuthenticatedAt:string|null,reasonCode:string|null,inboxEnabled:false,sendingEnabled:false}`.

Nya moduler: `apps/web/lib/sales/mailbox/{types,api,host-api,store,seal}.ts`, `workers/sales/mailbox/{__init__,crypto,probe,setup}.py`, `workers/sales/mailbox/crypto-helper.mjs`, `apps/web/components/platform/vnext/sales/StratoConnection.tsx`. `seal.ts` är en browsermodul och får inte importeras av modellhandlern.

### Task1: Kontexbundet krypteringsformat och lokal nyckellagring

**Files:** skapa mailbox-typer/seal samt crypto.py/helper.mjs; tester `apps/web/lib/qa/sales-mailbox-seal.test.ts`, `workers/sales/tests/test_mailbox_crypto.py`, `workers/sales/mailbox/crypto-helper.test.mjs`.

**Consumes:** managed host-identitet och CredentialStore. **Produces:** `sealMailboxCredentials(context:MailboxContext,publicJwk:JsonWebKey,password:string):Promise<SealedMailboxEnvelope>`, `MailboxCrypto.public_key()->{kid,jwk}`, `MailboxCrypto.open(context,envelope)->{email,password}`.

- [x] Skriv tester för verklig browser-WebCrypto→Node-roundtrip med syntetiska secrets; fel OAEP-hash/label, ändrat AAD/tag/kid/email/projekt, översize och >2560bytes nyckel nekas. Assert att servertyperna saknar klartextcredential-fält.
- [x] Kör Vitest, Node `--test` och Python crypto-fixturen. Expected: RED på saknade moduler, inte nät-/paketfel.
- [x] Implementera RSA3072/65537 och exakt hybridformat ovan med standard-API:er. Python läser/lagrar privatnyckeln i Credential Manager; Node-helpern får endast stdin och fasta actionnamn, inga secrets i argv. Node-stdout med decryptresultat fångas enbart i hostminnet; stderr kastas. Ingen rå helperoutput förs till tool-/hostlogg. Fail-closed om WebCrypto saknas.
- [x] Kör samma tester. Expected: GREEN, syntetisk secret bevarad och varje context-swap nekad. Commit `feat(sales): seal mailbox credentials to the authorized host`.

### Task2: Ägarbunden engångskö, key-publicering och hemlighetsfri status

**Files:** skapa `apps/web/supabase/migrations/20261017142000_sales_strato_connection.sql`, `apps/web/supabase/tests/sales_strato_connection.sql`, mailbox-{api,host-api,store}.ts, routes `apps/web/app/api/sales/mailbox/route.ts` och `apps/web/app/api/sales/mailbox/host/route.ts`; tester `sales-mailbox-api.test.ts`, `sales-mailbox-host-api.test.ts`. Uppdatera guard/registry som vid föregående plan.

**Consumes:** Task1 format och `authenticateSalesHost` från föregående plan. **Produces:** `createMailboxApi(deps)`, `createMailboxHostApi(deps)` samt RPC:erna `sales_mailbox_publish_key`, `_begin_setup`, `_submit_sealed`, `_claim_setup`, `_commit_probe`, `_read_status`, `_expire_setups`.

- [x] Skriv SQL/API-tester för fel ägare/projekt/worker/kid, nyckelbyte med pågående setup, dubbel submit/replay med ändrad ciphertext, två aktiva setups, gammal claim/generation, expiry och revoke under auth. Samma receipt är idempotent; annan receipt för samma ID nekas. Password/privateKey/plaintext som JSON-fält nekas innan RPC.
- [x] Kör lokal verklig SQL och nya API-tester. Expected: RED på saknade objekt.
- [x] Skapa `sales_mailbox_connections` (ägarläsbar TENANT_RLS, inga klientmutationer) och `sales_mailbox_setups` (SERVER_ONLY). Setup innehåller bara context, begränsat sealed-format, status/lease/generation och tider. Spara inga plaintextsecrets eller råa exceptions. Samma mailbox-email måste finnas i förseglad payload och betrodd context; worker verifierar efter decrypt.
- [x] Key-publicering kräver giltig managementprincipal; servern härleder host/projekt och versionsbinder nyckeln. Ägarroute kräver session/same-origin och tillåtet projekt. Inget Atlasverktyg får submittera credentials eller ersätta hostnyckel. Terminala receipts rensar ciphertext atomiskt; metadata skiljer authbevis från varaktigt local-store-kvitto.
- [x] Schemalägg enbart `sales_expire_mailbox_setups()` i befintlig pg_cron var5:e minut med ett eget unikt jobnamn. Rutinen får inte röra annat än utgångna mailbox-setups. Verifiera jobbet efter apply; ingen credential-UI aktiveras utan fungerande cleanup. Lokala SQL-fixturen använder anrop direkt, ingen riktig extern cron.
- [x] Uppdatera132/118 migrationer efter föregående plans131/117; bevara frysta listor. Dessa två tabeller är created-not-live tills riktig efterkontroll.
- [x] Kör SQL, API, migrationssäkerhet och schema-invariant. Expected: GREEN; inga authgrants på setupdata eller privata RPC:er. Commit `feat(sales): queue encrypted Strato setup for one authorized host`.

### Task3: Lokal Strato-auth utan mejlåtgärder

**Files:** skapa `workers/sales/mailbox/{probe,setup}.py`, `workers/sales/tests/test_mailbox_probe.py`; ändra managed host för typed mailbox-poll mellan jobb.

**Consumes:** Tasks1–2 och hostens single-instance-lås. **Produces:** `probe_strato(email,password,clients)->ProbeReceipt`, `process_mailbox_setup(client,crypto,store,journal)->bool`.

- [x] Skriv fake-SMTP/IMAP-tester med exakta tillåtna metodanrop: SSL-anslutning, normal lösenordsautentisering och logout. Assert att MAIL/RCPT/DATA/SELECT/SEARCH/FETCH/STORE/APPEND aldrig kan anropas. Testa certfel, timeout, Unicode, fel lösenord, bara en lyckad sida, revoke, nätavbrott efter lokal lagring och sen gammal receipt.
- [x] Kör `python -m unittest discover -s workers/sales/tests -p test_mailbox_probe.py -v`. Expected: RED.
- [x] Implementera fasta verifierade Strato-endpoints och PLAIN över SSL/TLS när servern stöder detta; ingen CRAM-MD5 eller authfallback till okrypterat. Unsupported auth ger fast needs_input-kod, ingen gissning/loop. `debuglevel=0`, råa exceptions loggas aldrig.
- [x] Spara bekräftad mailboxcredential som versionsbunden staged nyckel i Credential Manager med read-back och journal. Flytta aktiv-referensen först efter bekräftad aktuell serverreceipt; misslyckat prov lämnar tidigare fungerande credential orörd. Gör ingen serverterminal ”authenticated”-receipt innan lokal varaktig lagring lyckats. Efter omstart löses journalens osäkra setup före nästa poll: återställ samma setup/generation utan nytt authförsök, aktivera bara om serverns aktuella mailboxgeneration fortfarande matchar, annars rensa staged credential. Båda authsidorna måste ha lyckats för authenticated.
- [x] Kör hela worker-sviten. Expected: GREEN, inga riktiga nät-/modell-/mejloperationer. Commit `feat(sales): verify Strato login without reading or sending mail`.

### Task4: Säker inloggning i Atlas och begripliga kvitton

**Files:** skapa `StratoConnection.tsx`; ändra SalesWorkspace och sales atlas-tools; tester `sales-mailbox-atlas-tools.test.ts`, Playwright-fixturen och mailbox-UI-test.

**Consumes:** MailboxContext/Status och seal-funktionen. **Produces:** Atlasverktygen `prepare_strato_connection({projectId,workerId})` och `get_strato_connection_status({projectId,mailboxId})`, som endast returnerar den sparade ägarbundna formreferensen/statusen.

- [x] Skriv tester för konversationsbindning, fel projekt/host, oauktoriserad managementhost, feature-off, fel public key och nekad plaintextsubmit. I riktig browser ska en syntetisk canarysecret saknas i samtliga HTTP-body/logg/verktygsresultat; endast sealed-format får lämna sidan. Testa mobil390px och desktop.
- [x] Kör nya tester. Expected: RED för saknat formulär/verktyg.
- [x] Lägg formuläret i befintlig projektvy med exakt information: ”Anslut Strato”, ”Provar inloggningen – inga mejl skickas”, och ”Inkorgsinläsning är inte aktiverad”. Adress bekräftas av ägaren, lösenord via password-input; rensa efter kryptering/unmount. Ingen URL-, chat-, minnes-, console-, analytics- eller session-replay-kopia. Fält märks som privata/no-capture och testas mot befintlig telemetri.
- [x] Atlas kan öppna formreferensen och följa kvittot medan användaren pratar. Modellen får aldrig lösenordsfält eller verktyg som lämnar in credentials. Erbjud ingen generell ”aktivera säljautopilot”.
- [x] Kör nya och befintliga sales-/Studio-gränstester, typecheck och browserfixturer. Expected: GREEN. Commit `feat(sales): connect Strato through an encrypted owner form`.

### Task5: Verkligt flödesbevis och korrekt avgränsad leverans

**Files:** lägg lokal SQL/API→host-fixture i `apps/web/scripts/test-sales-db.mjs`; skapa `docs/superpowers/verification/2026-10-17-sales-strato-connection.md` och uppdatera worker-README.

- [x] Kör verklig lokal DB→serverhandler→förseglad fixture→fake-auth→OS-store-fake→terminal receipt, inklusive omstart, dubblerad request, nyckelswap, utgången setup, revoke och crash före/efter lagring. Testa cleanupens exakta avgränsning.
- [x] Kör samtliga mailbox/sales/host-tester, Node-kryptotester, SQL, migrationssäkerhet, typecheck och desktop/mobil. Lägg canarychecks på felvägar och loggar. Historiska401 baselinefel dokumenteras oförändrat; nya fel blockerar.
- [x] En färsk oberoende granskning av detta increments diff; högst en regressionstestad fixomgång. Spara risker/avgränsningar.
- [x] Först när säker form, host, cleanup och faktiskt releaseflöde är verifierade: be ägaren logga in i formuläret om Credential Manager saknar ett uttryckligen tidigare anslutet postfack. Sök inte igenom Chrome-profiler, andra appar eller generella hemlighetslager efter lösenord. Begär aldrig lösenord i chatten och återställ inte Strato-lösenord på eget initiativ.
- [ ] Verkligt prov gör exakt en SMTP-/IMAP-auth med ägarens anslutna konto. Spara bara fixed-code receipts, tider, server/port, TLS-resultat, host/projekt och lokal storebekräftelse. Om inloggning saknas: märk korrekt blocked, inte ansluten. Ett lyckat prov är inte inboximport, leverans eller svarshantering.
- [x] Inga kund- eller testmejl skickas i B1. B2 kräver egen plan för UIDVALIDITY+UID/PEEK, persistence före checkpoint, dedupe och vald kontakthistorik/startgräns. C kräver ett separat exakt sändningsbeslut. Commit/pusha ett reviewbart resultat och håll broad outreach pausad.

## Verifierade planförutsättningar och källor

- Plugin-sökning ”Strato IMAP SMTP” gav ingen färdig match2026-10-17; detta är inte en fullständig kataloggaranti.
- pg_cron och pg_net finns i rätt Omnira-projekt; inget nytt cronjobb har skapats av planen.
- Stratos officiella inställningar lästa2026-10-17: https://www.strato.se/faq/e-post/e-postserver-adresser-portar-ssl-tls/ och https://www.strato.se/faq/e-post/hur-kan-jag-anvaenda-ett-externt-e-postprogram-med-min-e-postadress/ .
- Node22 crypto: https://nodejs.org/docs/latest-v22.x/api/crypto.html . Ange oaepHash SHA256 uttryckligt; Node har annars SHA1 som default. WebCryptoformat och hybridkryptering verifieras med riktiga interoperabilitetstester.
- Windows CredentialBlob-gränsen2560bytes: https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw . RSA3072 PKCS8/base64 storlekskontrolleras i verkligt test, aldrig antas rymmas.

## Självgranskning och handoff

Kontraktmatchning: samma context/AAD/kid i browser, server och host; samma principal från föregående plan; inga raw secrets i servertyper; krångliga crash/replayfall har namngivna tester. Inloggning, varaktig credentiallagring, inkorgsinläsning och utskick är separata verifierbara tillstånd. Kontohistorik från Founding5 får inte återskapas som nya initialkontakter. Ingen produktkod, mailboxåtkomst eller ny behörighet skapades när planen skrevs.

Granska planen före implementation; inline-metoden är bevarad. Efter implementationen återstår endast ägarens verkliga säkra inloggning om den inte redan finns ansluten, inte manuella portar/token/terminalkommandon.

Actual release evidence: docs/superpowers/verification/2026-10-17-sales-release.md. Approved2026-10-17; current main integrated, reviewed migrations applied, protected preview and owned managed task verified. Actual Windows logoff/reboot was not performed: configured logon trigger and controlled scheduled restart/generation persistence were verified. Strato actual SMTP/IMAP authentication remains pending secure owner input; no inbox import or sending.
