# Strato B2: beständig inkorg till Atlas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the already selected inline execution method and one fresh whole-increment review at the end.

**Goal:** Atlas och André kan se relevanta inkommande Handlarbörsen-mejl med spårbart underlag, utan dubblering, förlorade svar eller ändrade lästmarkeringar.

**Architecture:** Den befintliga Windows-hosten läser det redan anslutna Strato-kontot via ett separat, ägarauktoriserat läskontrakt. Omnira lagrar begränsad metadata och vald text beständigt innan serverns UID-checkpoint flyttas atomiskt. Atlas får projektbundna läsverktyg; mejlinnehåll kan aldrig starta kommandon, godkänna åtgärder eller skicka mejl.

**Tech Stack:** Befintlig Next.js/TypeScript/Supabase, Python 3.12 imaplib/email/html.parser och Windows Credential Manager. Inga nya konton, MX-ändringar, inkommande portar eller paket.

**Spec:** Den av André godkända `docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md`, särskilt §§4–7,9. B1 är verkligt verifierad 2026-10-17 19:07Z. Detta är B2 inkorg; den efterföljande svarsspecialisten blir en separat B3-plan eftersom dagens kö och kontaktregler endast stöder första kontakt. C sändning är fortsatt separat.

## För André

Jag sköter teknik, installation och tester. Förslag till första läsomfattning: endast INBOX i info@handlarborsen.se, från 8 oktober 2026 kl. 00:00 svensk tid. Alla mejl inom gränsen kan visas som begränsade rubrikrader; själva texten hämtas bara för valda bekräftade kontakter eller enskilda mejl som du uttryckligen väljer. Okända eller tvetydiga avsändare visas som ej kopplade. Vi importerar inte hela postfacket till en modell.

Redan lästa svar, även sådana du läst på telefonen, ska komma med. Ingenting markeras läst, flyttas eller raderas. Inkorgen ger underlaget för nästa del: svarsförslag som visas för din granskning. Den här delen skapar inga automatiska svar eller modelljobb.

Status vid planstart: kontaktregistret är tomt. Founding 5 har redan kontaktats, men adresser, filialkopplingar och historik måste verifieras mot aktuellt underlag före registrering. Vi skapar inte nya första-kontaktjobb för dem.

## Global Constraints

- Projekt `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`, worker `49d30271-cf0b-47c9-a70d-2bce5b9b09ba`, mailbox `5964032c-aad9-47c5-b986-71dc7339d775`. Ingen första-projekt-fallback.
- Endast `imap.strato.de:993`, verifierad TLS minst 1.2 och den bekräftade credential-referensen. Ingen lösenordsöverföring till server/modell/logg; ingen sökning i andra hemlighetslager.
- Föreslagen startgräns `2026-10-07T22:00:00Z` (8 oktober 00:00 Europe/Stockholm). UI visar datum och omfattning; config är avstängd tills ägaren aktiverar den exakta versionen.
- Endast fast mapp `INBOX`; ingen modellvald mapp/server. Använd `select('INBOX', readonly=True)`/EXAMINE och UID SEARCH/FETCH med BODY.PEEK, aldrig UNSEEN-filter eller sekvensnummer som identitet.
- Identitet är mailbox + mapp + UIDVALIDITY + UID. Samma fullständigt valda meddelandetext och oföränderliga rubriker över nya UID-epoker kan återanvända en kanonisk referens via SHA-256 över längdprefixade råa valda rubriker + dekodad text. Message-ID ensamt är aldrig en dedupliceringsnyckel. Separata förekomster sparas. Ofullständig/ej vald text ger en möjlig dubblett för granskning vid epokbyte, aldrig en automatisk sammanslagning eller ett nytt modelljobb.
- Full mejltext/headers är privata projektdata och får endast finnas i ägaravgränsad lagring och uttryckliga läsresultat; inte i loggar, felmeddelanden, telemetri, checkpointjournal eller Git.
- Ägargräns, aktiv configversion, aktuell mailboxgeneration, hostgeneration, stopp och revokering kontrolleras vid claim och commit. En ny mailboxanslutning eller ny läsomfattning stänger/fäktar föregående läskonfiguration.
- Inga bilage-/bild-/URL-hämtningar, HTML-rendering, externa pixlar, SMTP-operationer, IMAP STORE/APPEND/COPY/MOVE/EXPUNGE eller automatisk lästmarkering.
- Även bekräftade avsändares innehåll behandlas som obetrodda data. From/Reply-To/Authentication-Results i ett mejl skapar ingen behörighet. Bilagor och mejlinstruktioner får aldrig aktivera verktyg.
- InboxEnabled och faktiskt arbetstillstånd härleds från serverconfig och heartbeat, inte från ett lyckat B1-prov. SendingEnabled förblir false.
- Behåll huvudgrenens pågående röst-, modell-, konkurrent- och SoMe-arbete. Ingen produktionsmerge eller global flaggaktivering ingår i plangodkännandet.

## Review Focus

1. Svar som redan lästs på telefonen: ska sparas oberoende av Seen — Task2.
2. Avbrott efter mottagning eller förlorat commit-svar: checkpoint får aldrig gå före beständig lagring och replay får inte dubblera meddelandet — Tasks1,3.
3. UIDVALIDITY-byte, luckor, expunge och UID N:* som också kan returnera en lägre UID: inget gammalt innehåll får behandlas som nytt eller tappas tyst — Tasks1–3.
4. Samma adress på flera filialer, falsk avsändare och motstridigt Message-ID: ingen automatisk sammanslagning, kontaktauktorisering eller svarsåtgärd — Tasks1,4.
5. Stora/felaktiga MIME-träd, mejlinstruktioner, HTML och nya credentials under läsning: begränsad hantering, begriplig status och inget innehållsläckage eller aktivering med gammal generation — Tasks2–5.

## Kontrakt och filkarta

Skapa sammanhållna `apps/web/lib/sales/inbox/{types,validate,store,api,host-api,atlas-tools}.ts` och `workers/sales/mailbox/{inbox,mime_text,inbox_sync}.py`.

- `InboxConfig={projectId,mailboxId,folder:'INBOX',since:string,selectedContactIds:string[],version:number,mailboxGeneration:number,state:'disabled'|'enabled'|'paused'|'needs_input'|'reconciling'|'revoked'}`.
- `InboxRef={projectId,mailboxId,configVersion,mailboxGeneration,hostGeneration,claimId,batchId}`. Lease 180 sekunder, högst en aktiv claim per config.
- `InboxCursor={uidValidity:string|null,scannedThroughUid:number,epoch:number}`. UID/UIDVALIDITY valideras som positiva 32-bitstal; representera UIDVALIDITY kanoniskt som decimalsträng i JSON.
- `InboxRecord={uid:number,internalDate:string,size:number,headerSha256:string,header:{from:string,to:string,subject:string,messageId:string|null,inReplyTo:string|null,references:string[]},text:string|null,textState:'not_selected'|'complete'|'truncated'|'unsupported'|'vanished'|'too_large',contentSha256:string|null}`. Bounded headerfält; text är dekodad ren text.
- `InboxBatch={ref:InboxRef,mode:'scan'|'selected_text',expectedCursor:InboxCursor,uidValidity:string,throughUid:number,records:InboxRecord[],rangeEnd:number}`. Ett batchkvitto anger accepted, cursor och räknare; ingen råtext eller credential.
- `InboxMessage` visar kanoniskt ID, förekomster och `contactState:'unlinked'|'ambiguous'|'linked'`. Kontaktkoppling är en ägarbekräftad åtgärd till ett befintligt bekräftat kontakt-ID, aldrig en följd av mejltext.
- Nya fasta operationsnamn: ägare `read_inbox, read_message, configure_inbox, set_inbox_state, link_message, select_message_text`; host `claim_sync, read_batch_receipt, commit_batch, report_sync_failure`.
- Atlas får endast `get_sales_inbox(projectId,mailboxId,cursor?)` och `get_sales_inbox_message(projectId,messageId)`. Verktygen kan inte aktivera config, välja historik, läsa credentials eller starta ett svar.
- Pagination 50 metadata-rader, serverutfärdad cursor och högst 8 KiB text per vald läsning. Ett modellverktyg får bara text för redan ägarvald/auktoriserad meddelandetext.

### Task1: Ägarbunden läskonfiguration och atomisk inboxlagring

**Files:** skapa inbox types/validate/store och en migration genererad med Supabase CLI `migration new sales_strato_inbox`; `apps/web/supabase/tests/sales_strato_inbox.sql`; `apps/web/lib/qa/sales-inbox-store.test.ts`. Uppdatera befintliga schema-/säkerhetsregister enligt deras befintliga regler.

**Interfaces:** konsumerar SalesPrincipal, HostPrincipal, mailboxgeneration och sales_stop. Producerar `readInbox(db,p,input)`, `readInboxMessage(db,p,input)`, `configureInbox(db,p,input)` samt service-only RPC:er `sales_inbox_<operation>` för operationsnamnen ovan.

- [x] Skriv RED-tester för annan ägare/projekt, inaktuell config/mailbox/host, paus/revoke, fel folder/startdatum och innehåll i ej tillåtna fält. Ett tomt kontaktregister får inte skapa kopplade kontakter.
- [x] Kör `npx vitest run lib/qa/sales-inbox-store.test.ts --maxWorkers=1 --minWorkers=1` från apps/web; bekräfta avsedd RED.
- [x] Skapa fyra RLS-tabeller: `sales_inbox_configs` (scope, cursor, claim), `sales_inbox_messages` (kanonisk text/metadata), `sales_inbox_occurrences` (unik mailbox/folder/UIDVALIDITY/UID) och `sales_inbox_batches` (claim/idempotens/receipt). Ingen direkt klientmutation; ägarläsning kontrolleras även i RPC, service-only mutation med tom search_path.
- [x] Implementera commit som en transaktion: lås config, validera hela ref och expectedCursor, infoga/deduplicera meddelanden/förekomster och terminala textstatusar, spara batchkvitto, flytta därefter cursor. Samma batch-ID med samma payloadhash ger samma kvitto; annan payload ger konflikt. Motsägande innehåll för samma förekomst får inte skriva över.
- [x] Vid ny UIDVALIDITY: öka epoch, starta begränsad omläsning inom vald historik, bevara tidigare kanoniska meddelanden/förekomster och använd samma commitregler. Generera inga kontakt-/kampanjjobb.
- [x] Kör SQL som faktisk service_role i den ägarmärkta lokala PostgreSQL-fixturen. Assert: avbrott före commit ändrar ingen cursor; efter commit finns både data och cursor; dubbelt kvitto ger en förekomst; lika Message-ID med olika innehåll bevarar båda. Header-only-poster får inte kollapsa mellan epoker. Utökning från ej vald till vald text är en versionskontrollerad uppdatering av samma förekomst, inte ett nytt mejl.
- [x] Kör GREEN och commit `feat(sales): persist scoped inbox batches before checkpoints`.

### Task2: Riktig IMAP-läsare och begränsad texttolkning

**Files:** skapa `workers/sales/mailbox/inbox.py`, `mime_text.py`, `workers/sales/tests/test_inbox_reader.py`, `test_inbox_mime.py`; syntetisk socketserver-fixture under tests.

**Interfaces:** `read_inbox_batch(config,cursor,selected_messages,password,*,client_factory=None)->InboxBatchData`; `decode_text_part(mime_headers,encoded_bytes)->{text,textState}`. Credentials används bara i minnet. Returnera innehåll till anroparen, aldrig stdout.

- [x] Skriv RED för Seen/telefonläsning, UID-luckor, expunge mellan search/fetch, fel UIDVALIDITY-typ, capability str, IMAP-serverns faktiska bytes/tuple-svar och N:* som innehåller för låg UID. Använd riktig imaplib över en syntetisk lokal server, inte bara en dubbel av bibliotekets objekt.
- [x] Kör `python -m unittest workers.sales.tests.test_inbox_reader workers.sales.tests.test_inbox_mime -v`; verifiera RED.
- [x] Implementera verifierad TLS/PLAIN och read-only INBOX. Ett claim innehåller cursor och serverns uttryckliga textbegäranden. En synk har IMAP-totaldeadline 30 s, connect/auth högst 10 s vardera. UIDNEXT avgränsar ett stabilt övre tak; UID-search i fönster om högst 500 UID och explicit numerisk filtrering mot intervallet. Processa högst 20 träffar per batch.
- [x] Sök från kalenderdagen före since och filtrera INTERNALDATE mot exakt UTC-gräns. Flytta throughUid endast över täckta resultat/intervall; bevara återstående backlog för nästa batch. Okända mejl får endast bounded headers. Utelämnade/försvunna objekt får en beständig terminal status, inte ett påhittat tomt mejl.
- [x] Hämta BODYSTRUCTURE och endast uttryckligen vald text/plain-del, annars vald text/html-del som omvandlas till ren text med HTMLParser. Hämta aldrig bilagedelar. MIME-djup högst 8, högst 50 delar, högst 64 KiB kodad textdel, högst 8 KiB dekodad UTF-8. Överskridande/misslyckad tolkning ger truncated/too_large/unsupported och synlig granskningsfråga.
- [x] Sätt total JSON-payloadgräns 50 KiB före överföring. Dela batchen tidigare om fler texter inte ryms; trunkera inte tyst. HTML/script/remote image/länk körs eller hämtas aldrig.
- [x] Kör GREEN inklusive exakt kommandojournal från socketfixturen: ingen STORE/APPEND/EXPUNGE/SMTP och ingen ändring av Seen. Commit `feat(sales): read bounded IMAP inbox data without changing flags`.

### Task3: Hostcykel, återhämtning och smal transport

**Files:** skapa `inbox_sync.py`, `test_inbox_sync.py`, inbox host-api och `apps/web/app/api/sales/inbox/host/route.ts`; modifiera protocol.py, managed_connection.py, host.py samt befintliga transporttester.

**Interfaces:** `ManagedConnection.inbox_client()` använder samma manageridentitet med fast purpose inbox -> `/api/sales/inbox/host`. `sync_inbox_once(client,store,mailbox_journal,sync_journal,reader)->SyncResult`; en stoppbar bakgrundscykel per SingleInstance-host.

- [x] Skriv RED för avbrott före/efter commit, förlorat kvitto, ny mailbox/config under läsning, parallell host, hostpaus samt utgången claim. Checkpointjournalen får inte innehålla mejltext eller lösenord.
- [x] Kör Python-/host-API-tester för avsedd RED.
- [x] Kör synk högst var 60:e sekund i en egen begränsad hosttråd så befintliga host-heartbeats inte blockeras av IMAP. Ingen synk före serverauktoriserad enabled config. Läsning fungerar även om Claude doctor är blocked; projekt/hostpaus stoppar läsningen.
- [x] Textbegäranden för UID som redan ligger bakom cursor hanteras i selected_text-batcher med oförändrad scannedThroughUid. Servern verifierar att varje text UID är vald av ägaren eller omfattas av konfigurationens valda kontaktadresser; okänd text nekas. Ändrat kontakturval eller tidigare since höjer configversionen och startar begränsad omläsning med befintlig deduplicering. Journalför enbart pending batch-ID/ref/range/hash. Efter omstart: fråga read_batch_receipt innan annan läsning. Accepterat kvitto avslutar pending; ej accepterad batch kan läsas om eftersom servercursor ännu inte flyttats. Vid motstridigt kvitto: reconciling, inget blindt framflyttande.
- [x] Använd endast aktiv lokal credential-ref när mailboxgeneration matchar. Ett faktiskt AUTH-fel sätter needs_input och stoppar nya authförsök tills ägaren återupptar; tillfälliga transportfel får begränsad backoff 60/120/300 s. Fel är fasta koder utan råa exception-/serversvar.
- [x] Kör GREEN, befintliga lifecycle-/fencing-/transporttester och hela Python-sviten. Commit `feat(sales): synchronize authorized inbox batches with crash recovery`.

### Task4: Ägarvy och Atlas läser sparat underlag

**Files:** skapa inbox api/atlas-tools och `apps/web/app/api/sales/inbox/route.ts`; `components/platform/vnext/sales/SalesInbox.tsx`; modifiera SalesWorkspace.tsx, SalesWorkspace.module.css, sales atlas-tools/guide och mailbox types/validate/statusprojektion. Tester `sales-inbox-api.test.ts`, `sales-inbox-atlas-tools.test.ts`, `e2e/sales-inbox.spec.ts`.

**Interfaces:** GET/POST följer befintlig session/project/same-origin-kontroll. InboxConfig-version och expectedVersion krävs för ändringar. Atlasverktygen läser bara efter conversation/project-validering.

- [x] Skriv RED för fel projekt/konversation, Modell försöker configure/link/select-text, tvetydig filialadress, HTML/prompt-injection, paus/offline/backlog och äldre B1-status som inte innebär aktiv inkorg.
- [x] Kör fokuserad Vitest och Playwright-fixture, avsedd RED.
- [x] Visa inkorgskort i befintlig säljvy med datum/omfattning, aktivera/pausa, senast lyckade synk, backlog och beständiga meddelanden. Ren text och privata/no-capture-markörer. Inga tekniska portar/token i användarflödet.
- [x] Ägaren kan välja text i enskilt meddelande och koppla till exakt befintlig bekräftad kontakt; versionkonflikt kräver ny läsning. Adressmatchning är endast ett förslag. Flera filialer förblir separata och tvetydiga tills ägaren väljer.
- [x] Atlas läser sparade referenser/status och vald text, anger källa/tid och saknade underlag. Okänd text skapar inga kommandon, modelljobb, ändringar eller svar. Uppdatera nuvarande hårdkodade inboxEnabled:false till faktisk behörighetsstatus; sendingEnabled är fortsatt literal false.
- [x] Kör GREEN, typecheck och desktop/mobil-Playwright. Commit `feat(sales): expose durable inbox evidence to the owner and Atlas`.

### Task5: Sammanhängande verifiering, granskning och kvalificerad installation

**Files:** utöka `apps/web/scripts/test-sales-db.mjs` och lägg `lib/qa/sales-inbox-integration.test.ts` samt `workers/sales/tests/inbox_cross_fixture.py`. Skapa `docs/superpowers/verification/2026-10-17-sales-strato-inbox.md`; uppdatera README.

- [x] Kör riktig SQL -> Next-handler -> Python/imaplib-socketfixture -> atomiskt batchkvitto -> ägar/Atlasläsning. Testa redan läst svar, replay, processavbrott före/efter beständig lagring, UIDVALIDITY-byte, dubbletter, försvunnet mejl, MIME-gränser och revoke under fetch.
- [x] Kör hela Python-sviten, scoped sales-/security-/schema-tester, typecheck och Playwright. Kör aktuell bred websvit och jämför mot den dokumenterade historiska 401-felbaslinjen på identitetsnivå; rapportera alla avvikelser vid namn. Inget nytt fel får gömmas i baslinjen.
- [x] Genomför en färsk oberoende helhetsgranskning, högst en regressionstestad fixomgång enligt vald inline-metod. Dokumentera kvarvarande risker och kostnaden om en tolkning är fel.
- [x] Förbered granskad migration, skyddad preview och ny hashkontrollerad installation utan att ändra befintlig aktiv host i förväg. Första aktivering ska vara konkret och reviewbar: mailbox, INBOX, exakt since, metadataläsning och valda texter visas. Inga produktionflaggor/merge.
- [x] Efter uttryckligt godkänd läsomfattning: applicera bara den granskade migrationen i rätt projekt, verifiera RLS/ACL/RPC/catalog/advisors och installera exakt ägd task med verifierad gamla-processen-avslutad före start. Om nya serverorigin krävs: testa kontrakt/auth, bevara verifierade credential-ref/key via explicit migrering och registrera båda pinnarna; byt aldrig origin tyst.
- [x] Verkligt prov läser en begränsad första batch utan att skicka ett testmejl. Visa sparade räknare/status och låt ägaren verifiera ett faktiskt inkommande mejl utan att kopiera dess innehåll till Git/logg. Kontrollera Seen oförändrad, samma servercursor efter omstart och inga dubbla förekomster. Utan relevant verkligt mejl: rapportera den avgränsningen, inte ett bevisat verkligt svar.
- [x] Dokumentera faktiskt aktiverad omfattning och vad Atlas kan läsa; bevara broad outreach pausad. Commit/pusha releasebevis. Gå därefter vidare till separat konkret B3-plan för svarsspecialist, enbart utkast och mänsklig granskning.

## Självgranskning och nästa grind

Planen följer godkänd §7: UIDVALIDITY/UID, PEEK, beständig lagring före cursor, begränsad vald historik och inga automatiska okända svar. Samtliga fem Review Focus-fall har namngivna teststeg. Dagens första-kontaktregler för redan kontaktade Founding 5 ändras inte. B3 och C markeras uttryckligen kvarstående. Inga produktfiler, nya behörigheter eller verkliga mailboxläsningar skapades av denna plan.

Genomförandet behåller tidigare vald inline-metod. Nästa steg: André granskar denna konkreta plan; därefter implementation och full verifiering. Faktisk utökad läsbehörighet aktiveras först mot den konkreta, verifierade omfattningen.

Primärkällor granskade för planen: https://docs.python.org/3.12/library/imaplib.html och https://www.rfc-editor.org/rfc/rfc9051.html . Strato annonserar IMAP4rev1; implementationen använder endast kompatibla grundkommandon. Säkerhetsmönster från agent-email-inbox tillämpas som isolerad databehandling och mänskliga beslut; Resend/MX/webhooks och dess testutskick används inte för det befintliga Strato-kontot.

2026-10-18 actual rollout: see verification/2026-10-18-sales-strato-inbox-active.json. All automated real batch/Seen/restart/no-duplicate checks passed. The real-test checkbox remains open only for André to recognize an actual incoming message in the private owner view; no customer-reply relevance or selected body claimed. B3 plan prepared2026-10-18, awaiting review.

2026-10-18 06:01 Europe/Stockholm: André confirms the private owner view looks correct and asks to continue. Manual inbox acceptance is complete; no selected body or customer reply relevance is implied.
