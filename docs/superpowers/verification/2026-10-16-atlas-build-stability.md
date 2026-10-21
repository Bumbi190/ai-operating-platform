# Atlas Översikt/Messenger — byggstabilitet, 2026-10-16

Fortsättning på draft-PR #355 i `codex/atlas-overview-messenger-20261015`. Originalets verifiering beskriver den tidigare basen. Aktuell integrationskontroll gäller produktkod `b301cb74527d985d20e736d33c3c19a9db629a51`, med publicerad main `7ded1f5d36d21916a7551008c5fff1448251794b` integrerad i vår egen gren.

## Rättningar och orsak

Vercels verkliga preview av `c12601f` stoppades före Next-kompilering av migrationsvakten: produktionens ledger hade den redan publicerade `website_mockup_review`, som den gamla featuregrenen saknade. Main slogs ihop rent med vår egen gren. Ingen migrationsvakt kringgicks och ingen produktionsdatabas ändrades.

En egen fysisk installation med `npm ci --no-audit --no-fund` ersatte den äldre delade beroendeinstallationen. De tre tidigare Remotion-typfelen återkommer inte: färsk TypeScript-kontroll har noll fel, utan paket- eller låsfilsändringar.

Två äldre QA-assertioner kontrollerade attributordning respektive ett borttaget internt variabelnamn. De kontrollerar nu faktiskt renderad semantisk breadcrumb-navigation och desktop-knappens synlighet för olika rutter/generationer. Båda proven reagerade på temporära mutationer av produktbeteendet; produktkoden återställdes.

Den färska SQL-fixturen försökte applicera mockup-migreringen innan plan- och Studio-tabellerna fanns. Fixturen använder nu de kanoniska plan-/Studio-migreringarna i beroendeordning och bevarar redan satta testbudgetar. Två nya SQL-regressioner kontrollerar tabeller, RLS, mutatorbehörighet och återinitiering.

Ett positivt chattprov saknade det nya explicita kvittot för godkänd mockup. Det använder nu det riktiga mockup-godkännandet och skickar dess kvitto i den synliga referensen. Produktens krav på synlig godkänd plan/mockup har inte lättats.

## Kontroller

- Sammanhängande UI/controller/auth/översikt/QA/migrations- och SQL-integration efter senaste main-merge: 430/430 i 29 filer.
- Playwright på samma kod: 27/27 på mobil och desktop med verkliga produktkomponenter och mockad auth/router/chat/mikrofon.
- Slutlig TypeScript-kontroll: 0 fel.
- Slutlig riktad ESLint för samtliga fem ändrade test-/fixturfiler: 0 fel, 0 varningar.
- `git diff --check`: godkänd.

## Gränser

Alla SQL-prov använder en egen lokal testdatabas. Inga betalda modell-/bildanrop eller produktions-SQL-mutationer har gjorts. Browserproven simulerar mikrofon och mobiltangentbord; fysisk mikrofon/TTS och verkliga mobiltangentbord behöver fortfarande provas på enheten. Minnespiloten och andra oavslutade arbetsgrenar har inte ändrats.

## Slutlig integration med publicerad main

Efter första uppdateringen publicerades även PR #358, inklusive den kanoniska migreringen för sociala kanalplaner. Den slogs ihop utan konflikt i vår gren. Inga oavslutade arbetsgrenar togs in.

Den sammanhängande integrationskörningen passerar **430/430 tester i 29 filer**, utan pending. Den omfattar de 18 tidigare riktade UI/controller/auth/QA/migrationsfilerna, Settings-kontrakten, alla social-launch-testfiler och de fyra SQL-filerna för chatt, planer, worker och bootstrap. På samma oförändrade produktkod passerar 27/27 Playwright, typkontroll och riktad lint.

[Maskinläsbart resultat per fil](atlas-overview-messenger-20261015/integration-20261016.json). Browserkonfigurationen är `playwright.atlas-overview-messenger.config.ts`; Vitest körs med `--maxWorkers=1 --minWorkers=1` och de listade filerna mot en separat förberedd SQL-databas vald av `WEBSITE_BUILD_TEST_DATABASE_NAME`. Typkontrollen är `tsc --noEmit`.

## Helsvitens kvarvarande fel

En färdig helsvit med 14 107 tester kördes på Windows efter den första main-uppdateringen (`f0f48ca` plus de fem test-/fixturrättningarna, därefter committade som `6eed672`). Källfilernas fingeravtryck var oförändrade under körningen. Resultatet var **12 618 pass, 375 fail i 75 filer, 1 110 skipped och 4 pending**. Samtliga 58 tester i chatt/plan/worker/bootstrap och våra ändrade UI-kontrakt passerade även där.

Helsviten är röd. Fellistan omfattar bland annat POSIX-kommandon och sökvägar som inte fungerar på Windows, äldre filhash-/inventariekrav samt andra Studio-/bygg-SQL-fixturfel (`INVALID_STUDIO_INPUT`, `DESIGN_WORKER_REQUIRED`, `PLAN_REVIEW_REQUIRED`). 204 fel har samma fil och testnamn som den tidigare Linux-baslinjen. Det är namnöverlapp, inte en ny parad jämförelse mot aktuell main; miljöerna och snapshots skiljer sig. De övriga felen klassas inte automatiskt som ofarliga eller gamla.

Denna helsvit föregår integreringen av `7ded1f5`. Efter den integreringen kördes den riktade sammanhängande kontrollen ovan, inklusive alla nytillkomna sociala kanalplantester; helsviten kördes inte om. En äldre Settings-hashassertion från helsviten är normaliserad i publicerad main och passerar i den nya riktade kontrollen.

[Fullständig namngiven fellista och miljögräns](atlas-overview-messenger-20261015/full-suite-windows-20261016.json). Det tidigare Linux-beviset behålls som historik och ersätts inte med jämförbara påståenden om Windows-siffrorna.

## Leverans och preview

Levereras fortsatt som [draft-PR #355](https://github.com/Bumbi190/ai-operating-platform/pull/355), utan merge till main eller produktionsaktivering. Vercels kontroll på PR-head och den uppdaterade PR-beskrivningen anger den faktiska preview-deploymenten och dess resultat. Ett lyckat previewbygge ska verifieras där; de lokala typ-/lintproven ensamma bevisar inget Vercel-bygge.
