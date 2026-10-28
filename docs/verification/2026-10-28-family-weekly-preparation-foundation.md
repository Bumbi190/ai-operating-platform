# Familje-Stunden — veckovis automatisk innehållsförberedelse, fas 1

Datum: 2026-10-28 (Europe/Stockholm)
Status: **ENBART PLANERINGSKOD / EJ AKTIVERAD**. Ingen cron, AI-modell, produktionstabell eller publiceringskö ändras av denna gren.

## Affärsönskemål

Från januari 2027 ska Atlas på söndag eftermiddag förbereda nästa veckas vanligt Facebook-/Instagram-innehåll med projektets riktiga fakta och egna bilder, meddela operatören och överlämna för granskning. Operatören ska kunna redigera och godkänna exakta texter, bilder och tider. **Bara efter separat schemaapproval** får befintlig publiceringskö skicka vid rätt tid.

* Den redan godkända nov–dec-kön ska inte ändras.
* Månadsintroduktioner den 1:a kl. 20.30 är en **separat process** med obligatorisk bekräftelse av faktisk kundåtkomst. Veckogeneratorn får aldrig ersätta, förbereda eller publicera ett månadsrelease-inlägg via ordinarie veckoflöde.
* Spontana inlägg via befintliga `get_social_content` och `propose_social_content` fungerar som separat, operatörsstyrt utkastflöde; förslaget är inte godkänt/schemalagt/skickat.

## Implementerat i denna isolerade gren

`apps/web/lib/social-launch/weekly/auto-preparation.ts`:
* Pure, side-effect-free `findWeeklyAutomaticWindow(now)` med start **söndag 2027-01-03 kl. 15.00–15.59 Europe/Stockholm**, därefter söndagar i samma lokala tidsfönster. Första målveckan är måndag **2027-01-04**. DST får inte ändra lokal timme.
* `evaluateAutomaticWeeklyPreparation` ger bara statusarna `not_due`, `not_enabled`, `already_prepared`, `nothing_to_prepare`, `review_required`, `ready_to_prepare_drafts`.
* Den kräver explicit opt-in, rätt Familje-Stunden-projekt, matchande signerad/owner-granskad veckokontext, inga rapporterade källbrister, ett faktiskt projektspecifikt faktaunderlag och beskrivna redan ägda bilder.
* En full redan förberedd/godkänd vecka skapar inget nytt. En delvis fylld vecka kan bara föreslå saknade ordinarie Facebook-/Instagram-par.
* **Ingen** funktion returnerar publicerings-, dispatch-, kontoanslutnings-, bildgenererings- eller kostnadsbehörighet.
* Befintliga `planMarketingWeek`, `getWeeklyContext` och `prepareWeeklyDrafts` bibehålls som källor och framtida anrop. Deras kontroller kring dubbletter, revisions-ID, idempotens, budget och upphov ska inte dubbleras.

`apps/web/lib/social-launch/weekly/auto-preparation.test.ts` testar startdatum, veckor, lokal timme, sommartid, befintlig förberedelse, delvis full vecka, saknad källa, fel projekt, obevisade konton/bilder och ingen publiceringsrätt. **28/28 befintliga + nya veckotester godkända**, separat TypeScript godkänd.

## Status verifierad mot Omnira och Familje-Stunden i produktion (läsningar endast)

- Omniras `social_monthly_release_rules`: aktiv regel `dayOfMonth=1`, `localTime=20:30`, båda kanalerna.
- Månadsinläggen 2026-11-01 och 2026-12-01 är godkända och `queued` på Instagram + Facebook (två per månad). De är **inte bevis på att kundåtkomst är verifierad**.
- `social_monthly_release_evidence` saknade poster för både november och december vid kontroll.
- `social_weekly_preparations` var tomt. Veckoverktygen kan förbereda utkast när ägaren ber om det i Atlas-chatten; **ingen återkommande självgenerering är driftsatt**.
- I Familje-Stundens egen produktionsdatabas saknas en `month_releases`-rad för `2026-11`. Enligt `docs/MONTHLY_RELEASE_RUNBOOK.md` är release-grinden **fail-open** utan den raden; det är ett viktigt säkerhets-/releasesteg att lösa innan novembermaterial laddas upp eller intygas släppt.
- Den lokalt lästa novemberkonfigurationen anger att november ännu inte är v2-paket med protectedManifest. **Lokal källa är inte ett QA-bevis på aktuell serverstatus.** Faktisk admin/non-admin åtkomst behöver testas i Familje-Stundens egen releasprocess.
- Påminnelser för 31 oktober kl. 11.00 (förhandskontroll) och 1 november kl. 16.00 (kundåtkomst + social readiness) är skapade som separata ChatGPT-automatiseringar. De får inte skicka/publicera eller intyga åtkomst.
- Äldre osäkert Instagram-kvitto från 23 oktober ska bevaras för spårbarhet och får **inte** skickas igen av en veckogenerator.

## Kvar för en verklig återkommande Atlas-generator

1. Bestäm **bestående ägaropt-in** till begränsad bakgrundsförberedelse, med uttrycklig projektgräns, giltig ägaridentitet och behörig konversation. Ingen Cron får själv skapa/imitera `p_principal` för att kringgå projektåtkomst.
2. Binda kostnadsstyrd LLM-körning till Atlas befintliga governed-spend, med tak och validerade utdata, ingen extern bildgenerering automatiskt. LLM får se enbart avgränsade projektfakta och redan beskrivna tillgångar.
3. Använd exakt `getWeeklyContext` → validerad generator → `prepareWeeklyDrafts` med samma kontext-hash, version, semantisk dubblettkontroll och idempotens. Ingen post får skapas ifall källmaterialet ändrats under körningen.
4. Visa sparade utkast i den befintliga sociala arbetsytan och avisera projektägaren **endast vid nytt granskningsbart arbete eller blockerare**.
5. Kräv separat native **Godkänn och schemalägg veckans inlägg**. Ingen auto-schemaläggning före den processen, och ingen ny publiceringskö implementeras.
6. Efter begränsad Preview-testning, ägargranskning och CI kan en söndags-Trigger aktiveras för januari 2027. Den här grenen lägger **inte till någon Vercel-cron eller funktionsflagga**, för att inte aktivera kostnader eller ändra nuvarande automation.

### Gräns för utlovad funktion

Detta är **fas 1**, inte en färdig autonom veckoagent. Att testen säger `ready_to_prepare_drafts` betyder att systemet får överväga ett skyddat genereringsanrop när steg 1–6 ovan är implementerade, **inte** att utkast skapas idag. Användaren ska inte få ett falskt löfte om helautomatiska veckoutkast efter december innan dessa steg är live.


## Fas 2 – kostnadsstyrd textgenerering och granskningsavisering (2026-10-28)

**Kod färdig och offline-verifierad, inte driftsatt.** Den här grenen innehåller nu:

- \`auto-draft-model.ts\`: kompilerar en kort, strukturerad prompt av endast projektets redan sparade verifierade faktaprofil, godkända befintliga bildbeskrivningar och lediga tidsluckor. En enda \`gpt-4o-mini\`-körning med max \`1800\` genererade token kan bli aktuell efter en verkligt verifierad opt-in och ett riktigt \`RUN_BOUND\`-anspråk. Anropet går via \`runStep\` / \`openAIChatCompletion\` / \`withGovernedSpend\` under \`AUTONOMOUS\` och rätt projektbudget/STOP. Om budget, STOP eller modell nekas finns **ingen** reservmodell, automatisk retry eller okontrollerad kostnadskanal.
- Modellsvaret kräver komplett JSON med exakt Facebook- och Instagram-utkast för varje ledig ordinarie veckotid. Ingen ny tid, källa, bild eller kanal accepteras; otillåtna rabatt-/garantipåståenden och främmande länkar nekas. En avbruten eller osäker körning kan **ha kostat** även om resultatet underkänns, så den rapporterar \`modelCalls:1\`, inte noll.
- \`review-pipeline.ts\`: två oberoende kontroller av samma *bestående och betrodda* ägaropt-in (före och efter eventuell modellkostnad). Kräver faktiskt ägar-ID, Familje-Stunden-ägarskap, ägardriven konversation och ett äkta anspråk på ett autonomt jobb. Modellen får inte själv skapa dessa. Sparande går bara till det existerande \`prepareWeeklyDrafts\` → \`social_weekly_save\`, vilket återläser context-hash och begränsar generation1/idempotens under projektlås. Ingen schemapublicering sker.
- Efter ett verifierat serverkvitto \`editorial_review_required\` med \`publicationAuthority=false\` skapas en avgränsad \`ReviewNotification\` med länk till Familje-Stundens sociala granskningsyta och antal förslag. **Aviseringen är bara data.** Ingen e-post, push eller meddelande skickas av denna modul, och modellen får ingen mottagaradress.
- Nya \`auto-draft-model.test.ts\` och \`review-pipeline.test.ts\` med omöjliga/dubbla/tamperade modellutdata, återkallat ägargodkännande under pågående körning, budgetvägran, falskt publiceringskvitto och främmande granskningslänk. **56/56 fokuserade tester godkända, avgränsad TypeScript-kontroll godkänd.** Alla AI-modeller var mockade; inga API-anrop eller kostnader uppstod.

### Resterande aktiveringsarbete och extern blockerare

- Det finns **ännu ingen betrodd, beständig enrollment-adapter** som läser operatörens aktiva samtycke från en auditerbar databasregel. \`loadVerifiedEnrollment\` måste implementeras i en egen granskad serverenhet, med avregistrering, giltighet, betal-/körningstak och ägarkontroll. Ingen typ/boolean/LLM-text från en HTTP-request kvalificerar som samtycke.
- Det finns **ännu inget schemalagt, hållbart \`RUN_BOUND\`-jobb**, ingen signerad cron-worker och ingen background-körning; \`prepareWeekForOwnerReview\` anropas inte från appen. Förhindra dubbla betalda körningar med claim/idempotens och budgetkontroll innan aktivering.
- Ingen faktisk notifiering skickas. En separat notifier behöver beständig \`preparationId\`-baserad deduplicering, korrekt ägarmottagare och uppföljningsstatus. Ett uteblivet notiskvitto får inte trigga ny modellgenerering.
- Ägargranskning, separat social-plan-/schemaapproval och månadsrelease-grinden är fortsatt oförändrade. Ingen ny bildmodell, publiceringskanal eller företagskontakt har aktiverats.
- Vercels tidigare Preview-bygge för denna gren är blockerat av \`handlarborsen_scb_review_only_candidates\` som finns i produktionsledgret men ännu inte i \`main\`. **Inga** migrationsfiler kopieras från det parallella SCB-arbetet, och ingen migrationsspärr får kringgås. Ny Vercel-verifiering efter att SCB-grenen korrekt har landat.

### Leveransgräns

\`auto-draft-model.ts\` + \`review-pipeline.ts\` är en färdig **avstängd kodväg för kostnadsstyrd beredning och granskning**. Att den finns i PR:n är **inte** ett påstående om att Atlas skickar utkast automatiskt januari 2027. Återkommande schema, beständigt opt-in, aktiva arbetsanspråk och notifieringsleverans kräver en separat aktiveringsgranskning.


## Fas 3 – beständig ägaropt-in och in-app granskningskvitto (2026-10-28)

**Kod implementerad i separat PR, INTE installerad eller aktiverad på produktion.**

- Migration \`20261028093000_family_weekly_auto_consent_events.sql\`: en append-only logg av \`enable\`/\`revoke\` för exakt Familje-Stunden-projektet. Ägaren kan läsa/lägga till egna händelser enligt RLS och aktuell \`projects.owner_id\`, men inte uppdatera eller radera dem. PostgreSQL tidsstämplar händelserna. Samtycke gäller som längst 90 dagar; servern skapar 89 dagars giltighet vid en uttrycklig operatörsåtgärd. Max 1800 utdata-tokens, en tillåten *enstaka* modellkörning per vecka som målkontrakt, \`can_schedule=false\` och \`can_publish=false\` är hårda DB-konstanter. **Samtidig körningsdeduplicering måste fortfarande implementeras i den framtida RUN_BOUND-workern innan aktivering**; en tabellkolumn ensam debiteringsbegränsar inga anrop.
- \`enrollment.ts\`, \`enrollment-store.ts\` och \`enrollment-action.ts\`: endast senaste monotona händelsen för dagens verkliga projektägare kan härleda ett aktivt godkännande. Händelse-ID inkluderas i det betrodda bidraget så att återkallelse och nyregistrering med samma expiry aldrig kan ärva ett gammalt körningsgodkännande. Läs- och runtimevägar är fail-closed. \`FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED\` måste vara exakt \`true\` för att framtida worker ens ska få ett verifierat enrollment-objekt; standardvärde är avstängt.
- \`/api/social-weekly-automation\`: enkel GET/POST för separat operatörsöversyn. Kräver inloggad projektägare, exakta indata, samma origin och plattformens befintliga operatörsidentitet för en POST. Den använder användarens **RLS-styrda session**, aldrig service-role, för att lägga till ett uttryckligen bekräftat godkännande eller en återkallelse. \`FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED\` måste vara exakt \`true\`; standardvärde OFF, då nekas all POST och GET visar bara att funktionen ännu inte är aktiverad.
- \`SocialWeeklyAutomationControls\` syns under Familje-Stundens schema när kod släpps. Den visar systemstatus och, endast när servern tillåter ägaropt-in, separata kontrollknappar för \`Godkänn automatiska veckoutkast\` och \`Återkalla godkännande\`. En aktiv opt-in betyder **inte** att produktionens RUN_BOUND-jobb är påslagna, vilket gränssnittet också förklarar.
- Migration \`20261028094000_family_weekly_review_notices.sql\`: ett \`unique(preparation_id)\`-kvitto per redan sparad utkastomgång. En DB-trigger kräver matchande ursprunglig \`social_weekly_preparations\` med samma projekt, ägare, vecka och editorial_review_required utan publiceringsbehörighet. Endast service-role får INSERT, autentiserad ägare får bara RLS-skyddad SELECT, ingen får UPDATE/DELETE via API. Ingen mejl-, push- eller socialprovider används.
- \`review-notice-store.ts\` och \`review-notice-db.ts\`: kod för framtida worker att lagra en sådan notis en gång med \`ON CONFLICT DO NOTHING\`, först efter verifierat native-save-kvitto. Den är **inte** inkopplad på någon cron/worker i denna fas.
- \`review-notice-read.ts\`: begränsad, kontrollerad läsvy (högst fem aviseringar) med fast URL till den egna granskningsytan. Även vid fel visas inga råa fel, privat mejltext eller främmande länkar. Den befintliga schemapanelen kan visa kvarvarande granskningsposter när tabellen och den verkliga skrivprocessen finns. **Detta är en intern in-app lista, ingen push- eller e-postavisering ännu.**
- **99/99 riktade Vitest-tester och avgränsad TypeScript-kontroll grön**. SQL migrationerna har endast kontrollerats statiskt mot RLS/grants/constraints; de är **inte körda i en lokal eller produktionsdatabas**, vilket innebär att pgTAP och faktisk signerad Preview-acceptans fortfarande måste göras innan release.

### Kvar innan faktisk veckovis drift

1. SCB-teamets produktionsledgersproblem gör fortfarande att Vercel Preview fail-closed stoppar denna isolerade PR. Ingen kringgång eller kopierad SCB-migration.
2. Granska och tillämpa dessa två nya migrationsfiler via korrekt releaseprocess först när all migrationhistorik är konsekvent. Testa på skyddad lokal/testdatabas med \`anon\`, \`authenticated\` annan ägare, projektägare och \`service_role\`, inklusive immutability och källkvitto.
3. En faktisk operatör använder då det explicita opt-in-gränssnittet; ChatGPT eller Atlas får **inte** slå på samtycket åt användaren. En opt-in aktiverar ändå inte RUN_BOUND-worker, Cron eller publiceringsrätt.
4. Bygg hållbara run-claims med unik per-vecka-nyckel och kostnadstak **före** billabelt modell-anrop; säkra atomär återkallelsespärr precis före \`social_weekly_save\`, även under en race med en samtidigt återkallande ägare. Om agenten misslyckas med att skicka en avisering ska samma förberedelse *inte* genereras eller debiteras på nytt.
5. Koppla \`recordWeeklyReviewNotice\` efter ett verkligt sparat \`preparationId\` och begränsa eventuell e-post-/pushleverans till en separat, beständig leveransjournal med unik ID och verifierad mottagare.
6. Först efter lyckad ägar-/behörighets-Preview och genomförda säkerhetstester får den förberedande söndagskörningen starta januari 2027. Native \`Godkänn och schemalägg veckans inlägg\` kvarstår som den **enda** publiceringsgrinden.
