# Översikt och kompakt Atlas-chatt — verifiering

Arbetsgren: `codex/atlas-overview-messenger-20261015`.
Bas: `605cc176dcdd60cae0c45b90947c84ce279b5d8a`.
Verifierad produktkod: `35255a20952b399a5fb75697e166b239d989882d`.
Arbetet startade 2026-10-15; verifieringen fortsatte 2026-10-16, Europe/Stockholm.
Status: implementerad och granskad i egen gren. Levereras som draft-PR. Ingen merge eller produktionsaktivering.

## Levererat beteende

- Ägarens startsida är Översikt, med 7/30 kalenderdagar i Stockholm, registrerad AI-kostnad, körningar och projektkort. Atlas har kvar sin egen sida och menypunkt.
- Den extra bygglänken ovanför Atlas är borttagen. Byggflödet ligger kvar i ordinarie navigation.
- Den runda knappen öppnar textchatt med skicka, samtal/lägg på och minimera som de tre ordinarie kontrollerna.
- Textvägen använder samma controller som fullchatten, utan STT/TTS. Minimering, vanliga länkar och periodbyte bevarar utkast och svar.
- Första konversationens skapande förblir markerat som pågående efter återöppning. Explicit trådbyte släpper den gamla trådens sändlås; sena svar/fel påverkar inte den nya panelen.
- Ett oskickat utkast följer med när första röstturen skapar dess konversation. Val av en annan befintlig tråd flyttar inget utkast.
- Taltext, varningar och arbetsytelänkar rullar ovanför skrivfältet. Skrivfält och knappar förblir nåbara även med liten synlig höjd.
- Utloggning rensar konversation, panelutkast och koordinater. Chatttext skrivs inte till panelens lokala lagring.
- Dolda byggreferenser utesluts uttryckligen. ”Jag godkänner” kan inte i den kompakta textvägen godkänna en plan som inte visas.
- Översiktens serverläsare verifierar färskt ägarscope före alla aggregeringar. Arkiverade och raderade projekt undantas; läsfel och ofullständiga sidor visas inte som verifierad nolla.
- Kanonisk lyckad körningsstatus, `done`, visas som Klart.

## Riktade kontroller efter slutgranskningens rättningar

| Kontroll | Resultat |
| --- | --- |
| Playwright, desktop 1280/1920 och mobil 390, riktiga fullchatten och Atlas-ytan | 27/27 passerar |
| Riktade controller-, data-, renderings-, navigations- och auth-tester, 17 filer | 236/236 passerar |
| Bredare breadcrumb- och mobilkromkontrakt | 2 kända baslinjefel kvar; namnges nedan |
| Verklig POST /api/chat med mockad provider och separat lokal SQL-testdatabas | 1/1 vald säkerhetsregression passerar; 8 andra tester ej valda |
| TypeScript, samma lokala beroenden före/efter | Samma 3 befintliga Remotion-fel; inga nya |
| ESLint, installerad Next core-web-vitals-konfiguration, 56 ändrade kodfiler | 0 fel; 2 befintliga runtime-varningar |
| git diff --check | Passerar |

De två kända bredare kontraktsfelen är `breadcrumbs · accessibility uses semantic breadcrumb markup` och `mobile chrome · MobileRailToggle is untouched keeps its own desktop-rail suppression`. Båda fallerar även på basen. De berörda produktkomponenterna ändras inte här. Föråldrade krav på en endast desktop-synlig Atlas-knapp och den gamla menyordningen har däremot uppdaterats till den godkända designen.

TypeScript-felen ligger i `lib/media/lambda-render.ts`: TS2307 för `@remotion/lambda/client` på rad 21 och TS2339 för `region` på rad 50 och 90. Lint lämnar de två befintliga react-hooks/exhaustive-deps-varningarna i `runtime.tsx`.

Standardkommandot `npm run lint` vill konfigurera ESLint även på basen. Kontrollen använder därför en separat konfiguration som utökar den redan installerade `eslint-config-next/core-web-vitals`; ingen global lintpolicy eller produktdependency har lagts till.

### Bygggrindens bevis och gräns

Testet skapar en riktig väntande plan i en egen lokal testdatabas, skickar ”jag godkänner” och ”starta bygget nu” utan synlig planreferens genom den autentiserade chat-route som används i produkten, och låter den mockade modellen föreslå byggverktyget. Båda får det uttryckliga avslaget `PLAN_REVIEW_REQUIRED`; beslut och byggsessioner förblir noll. Inga betalda provideranrop görs.

Controller-testet innehåller både dold plan och dold byggsession. En temporär mutation från `buildContext: null` till `undefined` gav det avsedda testfelet; återställd kod passerar. Mutationen ingår inte i grenen.

Den bredare befintliga SQL-byggsviten har separata baslinjefel: BUILD_UNAVAILABLE, kvitto för synligt godkännande och en femsekunderstimeout i den lokala fixturen. Denna ändring påstår inte att hela byggflödet är grönt.

## Helsvit mot samma bas

Node 22 bookworm, samma befintliga Linux-beroenden, två workers, högst två CPU-kärnor och 3 GiB, nätverk avstängt. Inga API-nycklar eller produktionsmiljöfiler kopieras. Basen och den slutliga produktkoden körs som separata snapshots.

| Snapshot | Pass | Fail | Pending |
| --- | ---: | ---: | ---: |
| Bas 605cc176 | 12 578 | 251 | 1 202 |
| UI-kod 35255a2 | 12 614 | 247 | 1 202 |


Slutkörningen rapporterar 14 067 tester. Helsviten är röd även på basen. 246 fel har samma fil, testnamn och första felorsak i båda körningarna. 5 tidigare fel återkommer inte efter avsiktligt uppdaterade launcher-/layoutkontrakt. 56 tillkomna namngivna assertioner passerar.

Det enda tillkomna felet i containerkörningen är det nya SQL-provet för kompakt godkännande. Det avbryter före produktbeteendet med kravet att förbereda den isolerade SQL-fixturen och sätta WEBSITE_BUILD_TEST_DATABASE_NAME. Samma test passerar separat på Windows med förberedd, egen SQL-testdatabas (1/1), inklusive båda uttryckliga PLAN_REVIEW_REQUIRED-avslagen. Detta är ett redovisat miljökrav; helsviten kallas inte grön.

Fullständiga namngivna fel, tillkomna gröna tester och ersatta gamla assertioner finns i [full-suite-comparison.json](atlas-overview-messenger-20261015/full-suite-comparison.json). En tidigare kandidat kördes också; de då röda gamla mobil-/menyförväntningarna är åtgärdade enligt godkänd design. Slutlig jämförelse gäller rättningscommiten ovan.

## Oberoende granskning

En separat granskare kontrollerade hela grenen en gång. Två Important-fynd gällde klippt skrivfält och utkast vid första röstturen. Det tredje fyndet, fel etikett för `done`, omgraderades från Minor till Important eftersom normala lyckade körningar annars visas som okända. Alla tre fick regressionstest som först föll och därefter passerade. Inga uppskjutna Minor-fynd återstår.

[Granskningsprotokoll](2026-10-15-atlas-overview-messenger-review.md) beskriver fynd, rättningar och granskningens gränser. Ingen andra granskare beställdes efter den samlade rättningsomgången.

## Browserbevisets räckvidd och bilder

Riktiga produktkomponenter körs i separat localhost-fixtur med mockad auth, router, chat-API och mikrofon. Översiktens browserdata är testdata; servermodellens ägarscope testas separat med en läsare som kan lämna främmande rader om filtrering saknas. Navigations- och signoutknappar ovanför sidan i bilderna finns bara i testfixturen.

| Yta | Mobil 390 | Desktop 1280 | Bred desktop 1920 |
| --- | --- | --- | --- |
| Chatt | [Bild](atlas-overview-messenger-20261015/mini-390.png) | [Bild](atlas-overview-messenger-20261015/mini-1280.png) | [Bild](atlas-overview-messenger-20261015/mini-1920.png) |
| Översikt | [Bild](atlas-overview-messenger-20261015/overview-390.png) | [Bild](atlas-overview-messenger-20261015/overview-1280.png) | [Bild](atlas-overview-messenger-20261015/overview-1920.png) |

Kontrollerna täcker IME, Skift+Enter, dubbeltryck, dragning, zoom, simulerat skärmtangentbord, nekad mikrofon, lång taltext, trådbyte och utloggning under väntande svar. De verifierar inte fysiskt röstsamtal/TTS eller alla riktiga mobiltangentbord. Inga skarpa modell- eller bildanrop har gjorts.

## Reproducerbara kontroller

Från `apps/web`, med projektets installerade beroenden:

```sh
node ../../node_modules/@playwright/test/cli.js test -c playwright.atlas-overview-messenger.config.ts
node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 lib/atlas/conversation/controller.test.ts lib/atlas/voice-capture.test.ts lib/qa/atlas-mini-chat-geometry.test.ts lib/qa/overview-period.test.ts lib/qa/overview-view-model.test.ts lib/qa/overview-dashboard.test.ts lib/qa/overview-sidebar-render.test.ts lib/qa/overview-auth-navigation.test.ts
node ../../node_modules/typescript/bin/tsc --noEmit
```

Helsvitens motsvarande kommando är `node ../../node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=<rapport.json>` i respektive snapshot. Samma Node-/beroendemiljö krävs för jämförbara basfel.

SQL-provet kör `lib/website-build/chat-tools.test.ts --testNamePattern "compact approval without"` mot en separat förberedd testdatabas, vald med `WEBSITE_BUILD_TEST_DATABASE_NAME`. Utan SQL-fixturen ska testet avbryta före produktbeteendet. Ingen del av beviset förutsätter en skarp modellnyckel.

## Så provar André efter aktivering av denna gren

1. Logga in som ägare: Översikt ska vara startsidan. Välj 7/30 dagar och öppna ett projekt.
2. Klicka på den lilla runda Omnira-symbolen. Skriv utan mikrofon; minimera och öppna igen.
3. Dra via överkanten på dator. Skriv ett utkast och byt vanlig sida: utkastet ska finnas kvar.
4. Atlas i menyn öppnar Atlas egen yta; Chat öppnar den befintliga fullchatten.
5. Samtalsknappen är valfri. Nekad eller saknad mikrofon ska lämna text användbar.

Minnespiloten och port 3015 är oförändrade. Den andra konversationens bygggren, modellval och budget är orörda. Den här grenen kräver ingen ny provider, schemaändring eller betalning. Ordinarie modellkostnad för en faktisk chatt följer redan befintlig routing.

## Beslut under genomförandet

1. Ruling: Packaged helper scripts and writing-good-tests reference cannot be read by the skills service. Reproduce their task briefs, BASE and completion ledger manually; keep the same review and RED/GREEN gates - cost if wrong: incomplete execution bookkeeping.

2. Task 1: Ruling: Existing builder SQL suite is red before this change (BUILD_UNAVAILABLE, visible-confirmation receipt and 5s timeout); do not repair unrelated builder logic. Boundary test executes real route/SQL and passes independently; retain baseline failures for final comparison - cost if wrong: a pre-existing builder fault may remain in the separate builder project.

3. Task 2: Ruling: Planned port 54392 is occupied; allocate own available localhost port 59137 and keep reuseExistingServer false. Added fixture navigation adapter because the old stub reloads the page - cost if wrong: fixture routing differs from real Next shell; final integration checks remain required.

4. Task 5: Ruling: The plan omitted the no-code auth callback fallback, which dropped an explicit reviewed return path. Preserve next through the same strict allowlist, verified RED->GREEN - cost if wrong: sign-in could return to the default instead of the selected internal page.

5. Task 5: Ruling: Include the existing runtime workspace caption, omitted by the plan file map, so /dashboard reads Overview in Swedish throughout the shell. RED->GREEN label test - cost if wrong: inconsistent workspace orientation.

6. Task 5: Ruling: Standard npm lint prompts for configuration on the unchanged base; run the installed Next core-web-vitals preset through an isolated config against changed files instead of introducing repository-wide ESLint policy - cost if wrong: unrelated repository lint remains unverified.

7. Task 6: Ruling: Run the independent whole-branch review while the long whole-suite comparison finishes; publish the PR only after both are assessed - cost if wrong: the reviewer initially sees provisional full-suite totals, which the root must close before delivery.

8. Task 6: Ruling: Superseded desktop-only orb and old nav-order source assertions now follow the approved mobile Messenger/Overview design. Preserve the unrelated MobileRailToggle baseline failure - cost if wrong: reduced historical source pinning, mitigated by real-component collision/target/browser tests.

9. Final: Ruling: Reviewer set aside full-suite health pending comparison. Compare baseline and final snapshot by exact failure names before delivery and disclose any residual baseline errors - cost if wrong: an environment-dependent regression could remain.

10. Final: Ruling: Physical microphone/TTS and actual mobile keyboards remain outside simulated acceptance; retain the existing runtime and require hands-on checks after branch activation - cost if wrong: device-specific voice/keyboard behavior may differ.

11. Final: Ruling: Production SQL/provider behavior is not exercised with billable calls. Use scoped reader tests and the real authenticated route against an isolated SQL fixture; no production activation - cost if wrong: deployment-specific configuration issues remain for activation.

12. Final: Ruling: The approved plan explicitly requires comparison against an already-red baseline, so finish as a draft PR with named baseline failures instead of applying the generic finishing skill's all-green stop to unrelated code - cost if wrong: unrelated red checks can still block later integration; no merge or production activation is authorized.

PR-länken läggs till efter att den godkända draft-PR:n har skapats.
