# Omnira WebBuilder – Etapp 1: granskad nulägesrapport (2026-11-08)

**Status: lokal prospektkedja verifierad med syntetiska data; EJ produktionsklar; EJ redo för Etapp 2.**

## Avgränsning och Git

- Repository: `Bumbi190/ai-operating-platform`.
- Arbetsmapp: `C:\Users\Andre\Projects\Omnira\.worktrees\webbuilder-etapp1-pr368-20261108`.
- Etapp 1 har egen lokal branch: `feat/webbuilder-etapp1-prospects-20261108`.
- Basen `f6fd852` är en **lokal merge commit** av PR #368-head `f724ec6` med senaste granskade `main` `8f1b258`. Etapp 1 är därmed **beroende av ännu omergad PR #368**, även om arbetsbranchen är separat.
- PR #368: öppen Draft, UNSTABLE (en CodeQL-kontroll misslyckad; övriga granskade kontroller gröna per `gh pr checks`). Ändra/merga inte PR #368 från denna etapp.
- Inga ändringar i `main`, ingen push, ingen prod-migrering, ingen Vercel-deploy, inga kundutskick.
- Denna etapp ska INTE blandas med Etapp 0, Oscars separata demo eller andra WebBuilder-chattar.

## Implementerade förmågor på arbetsbranchen

1. SCB-underbyggt prospektsök med företags- och arbetsställekontroll samt spärrmarkering. Live-SCB kräver separat skyddad API-nyckel och Preview-gate; säljutskick är ej aktiverade.
2. Operatören bekräftar aktuell företagswebbplats; Playwright sparar både mobil- och datorskärmbilder samt observerade faktauppgifter.
3. Tre förslag kräver giltiga observationsreferenser och mänsklig granskning; inga påhittade belägg accepteras.
4. Företagsspecifik plan och tre mockuper; utanför-prospekt-ändrad plan gör kopplingen ogiltig.
5. Befintlig kanonisk WebBuilder-worker bygger godkänd mockup till en liten statisk konceptstartsida utan AI-modellanrop i testläget.
6. Repeterbar ZIP-export, innehållshash, och separat kontroll av manuellt publicerad Vercel-demo i 390/1440 px.
7. Ägar- och projektkontroller, HMAC-bindning av SCB-svar, revisions- och hashskydd samt inga automatiska mail- eller publiceringsåtgärder.

## Faktiska QA-bevis

- Isolerad lokal Auth/PostgREST/Storage: 190/190 kanoniska applikations-SQL-steg genomförda vid första uppsättning; riktiga konton och privat lagring testade.
- `synthetic-integration-receipt.json`: **31/31 godkända** i full lokal webbläsar/API-kedja, inklusive verkliga WEBP-bilder, återöppnad prospektvy, mobil/desktop utan horisontell överbredd, exporterad HTML, en användares nekade åtkomst till annan användares data och blockering av cross-origin mutation.
- Prospekt, worker-hook och demo: **56/56** fokuserade Vitest-tester godkända.
- Migrationspolicy och 1M-token kostnadsreservation: **10/10** tester godkända; höga konservativa kostnadstak kvarstår som säkerhet, inte faktiska debiteringar.
- Nätverksprovet `node --test scripts/test-website-prospect-network.mjs`: **4/4** godkända; privata, reserverade och loopback-adresser blockerade.
- `tsc --noEmit --incremental false`: **godkänd**.
- `git diff --check`: **godkänd** (CRLF/LF-varningar i Windows förekommer).
- Hela breda Vitest-sviten utan den äldre särskilda SQL-fixturen är **inte grön** (huvudsakligen saknad testdatabas); den räknas INTE som godkänd.
- Separat SQL-only roundtrip: bootstrap och `cinematic` godkända; efterföljande flerfilig Vitest-integration **timeout efter 240 s** utan slutsvar. Det ägda, isolerade test-Dockerobjektet avlägsnades. Rapport i `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs/6b1b9ebc-7db9-4c54-9ba1-9969a802e12a/receipt.json`.
- ESLint-kontroll inte genomförbar: repo saknar upptäckbar ESLint-konfiguration; ingen automatisk config skapades.

## Bevisplatser (lokalt på stationär)

- `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\runtime-receipt.json`
- `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\synthetic-integration-receipt.json`
- `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\synthetic-evidence\`
- `C:\Users\Andre\Projects\Omnira\Temp\etapp1-typecheck5.log`
- `C:\Users\Andre\Projects\Omnira\Temp\etapp1-guard-and-price2.log`
- `C:\Users\Andre\Projects\Omnira\Temp\etapp1-isolated-sql-roundtrip.log`
- `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\website-real-auth-routes-local-20261108-backup.json` (separat, ej för Git).

Alla lokala testföretag är tydligt syntetiska; `https://example.com/` är endast offentlig testdomän.

## Kvarvarande blockerare innan Etapp 1 är helt färdig

1. **SCB riktigt företag:** Den riktiga SCB-nyckeln finns som skyddad hemlighet i tidigare Vercel Preview-branch, men inte i den isolerade lokala arbetsmiljön. Nyckeln får aldrig begäras eller visas i chatt. Ägaren kan i separat auktoriserat steg konfigurera nyckeln via säker lokal hemlighetshantering; först då är riktig sökning och webbplatsverifiering möjlig.
2. **En skarp demonstrationskedja utan utskick:** Verifiera ett verkligt, tillåtet bilhandlarföretag, dess riktiga webbplats, skärmbilder, tre faktabundna förbättringar, mockup, bygg och därefter en av ägaren separat godkänd Vercel-demo med fungerande URL. Ingen prospektkontakt innan detta.
3. **Beroende av PR #368:** Ett separat val behövs om PR #368 ska slutföras först eller om Etapp 1 ska isoleras om till ett helt eget upstream-bidrag; den nuvarande lokalen är en merge-baserad stack och ska **inte** pushas eller mergas som ren PR mot `main` utan denna kontroll.
4. **Produktionsmigrering:** Den nya `20261108094559_webbuilder_prospects.sql` är medvetet ny och **inte** applicerad mot hostad produktion. Migreringsvakten har räknats upp 174/160 → 175/161, så en saknad ledgerpost ska blockera release tills ägaren granskar och godkänner separat. Ingen bypass/grandfathering.
5. **CI-kvalificering:** Åtgärda/avgränsa PR #368 CodeQL-fel i dess egen process och slutför SQL-regressionstestets timeout/bevis före merge.

## Begränsningar och kostnad

SCB:s allmänna företagsregister har ett avgiftsfritt API enligt SCB; personlig API-nyckel krävs. Inga betalmodeller, köpta nya tjänster eller extrabranches i Supabase användes för denna lokala provkörning. Bara lokal Docker och den redan existerande kodbasen.

**Beslutspunkt:** Etapp 1 är tekniskt verifierad lokalt men får inte markeras `KLAR`, och ingen Etapp 2-överlämning får göras som om prospektflödet redan vore skarpt.

## Tillägg: vidare arbete 2026-11-08 (Etapp 1, endast lokal branch)

- Lokalt underlag: den offentliga sidan `https://www.edforsbil.se/` testades från en isolerad Chrome/Playwright-miljö med DNS-pinnad publik nätverksproxy, GET/HEAD-only, inga formulär, inga utskick och inga externa skrivningar.
- Första fångsten såg bara en tom SPA-loader. Vi åtgärdade detta med en fail-closed render-readiness-kontroll som väntar på faktiskt synlig text och stödjer både SPA och enklare statiska informationssidor. Real-site-kontroll visade att den tidigare tomma sidan blev riktig efter ca 3 sekunder. Separat test verifierar att loaders inte misstas för innehåll.
- Efter åtgärd fångades `www.edforsbil.se` i 1440 px och 390 px med observerade rubriker, navigation och text. Ingen horisontell överbredd uppmättes. Bildfångsten rapporterar `imagesLoaded:false` på båda vyerna samt varning om ofärdigladdad bild och delvis klippt sida (>6000 px), så dessa konkreta bilder måste granskas manuellt innan kundarbete.
- Tre *observationstödda möjligheter*, inte konstaterade affärsproblem: liten mobil menyknapp i första vyn (ca 30×30 px; `mobile-small-controls`), små klickytor för vissa navigationslänkar i datorvyn (t.ex. 39×27 px; `desktop-small-controls`), samt saknad färdigrenderad metabeskrivning (`desktop-description`). De är inte granskade/godkända för kundkontakt.
- Källidentitet: Edfors Bil AB och orgnr 556639-1735 går att verifiera via offentliga externa webbkällor, MEN **SCB-API har inte anropats i denna lokala testmiljö**. Detta är inte ett SCB-intyg eller ett komplett skarpt prospekt. Underlag sparat utanför Git: `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\edfors-public-review-not-scb.json`.
- SCB:s eget API är avgiftsfritt men kräver personlig API-nyckel: `https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/avgiftsfria-uppgifter-i-foretagsregistret/`. Skyddad SCB_API_KEY identifierades i Vercel för den existerande Harvey-previewn `codex/atlas-harvey-sales-20261017`; hemlighetsvärdet kan inte läsas från anslutningen, och har varken kopierats eller visats. Befintlig `scb-probe`-route är för endast dokumenterad registerläsning, ägar- och projektkontrollerad, kräver inloggning samt en särskild bekräftelse och är blockerad i production. Ingen extern förfrågan genom SCB-proben genomfördes här.
- Lokal fullständig autentiserad testkedja kördes om efter ändringarna: **31/31 tester gröna**, inklusive korrekt återöppning, privata tillgångar och skydd mot främmande ägare.
- Nya fokuserade kodtester: **68/68 gröna** (8 testfiler), samt **5/5 gröna** Node- och Chrome-tester för nätverksgrindar och renderingsberedskap.
- Från samma syntetiska export med SHA256 `84abe1c6b7d7540b887b5e981767331b607842e93a4f7ecde5e8f71505252c7c` finns ett **endast lokalt** Vercel-förberett paket i `C:\Users\Andre\Projects\Omnira\Administration\WebBuilderEtapp1Local-20261108\vercel-ready-synthetic-84abe1c6b7d7`. Manifest, integritet och paths kontrollerade; webbläsarsmoke `offline-browser-receipt.json` gav HTTP 200, korrekt bredder, bilder och noindex på 1440/390 px. `published:false`, ingen Vercel-deploy.
- En utökad fristående SQL-regression från tidigare körning nådde tidsgränsen och är fortfarande **inte verifierad**; den lokala PostgreSQL- och RLS-funktionaliteten är dock testad genom den gröna autentiserade kedjan. Bred SQL-/PR-/CI-kvalificering kvarstår.
- Etapp 1 är fortfarande **inte KLAR**. Säkert stopp: ingen publikation, ingen prod-migrering, ingen kundkontakt, ingen ändring eller merge av PR #368. Behövs fortfarande separat real SCB-prospekt i rätt miljö, manuellt verifierad publik demo efter särskilt godkännande, och GitHub/SQL/CodeQL-avstämning.

## Sista oberoende verifieringen samma dag (Codex + Desktop Commander)

**Arbetsmiljö och behörighet:** fortfarande enbart lokal `feat/webbuilder-etapp1-prospects-20261108`-worktree och den märkta egna lokala teststacken. Codex CLI 0.163.0 användes i *read-only* för oberoende granskning och ändrade inte kod. Fullständig kodgranskning i `C:\Users\Andre\Projects\Omnira\Temp\etapp1-codex-independent-review.txt`. Inga nya betalda tjänster, publika demos, kundutskick, GitHub-pushar, merges eller produktionsmigreringar.

**Granskningens sju P2-fynd och åtgärder:**
1. Faktiska SCB-arbetsställets SNI-koder följer nu med kandidaten och i SCB-signerat underlag; sökfiltret kopieras inte längre som påstådda företagsfakta.
2. Okänd/icke bekräftad SCB-aktivitetsstatus markeras nu som `inactive:true` (endast `ACTIVE_PER_SCB` kan räknas aktiv). Varje osäker juridisk enhet kräver extern granskning innan den kan gå vidare.
3. Read-only webbläsarfångst blockerar alla `wss://` WebSocket-kanaler, utöver tidigare GET/HEAD-grind.
4. Fångst avbryts vid oväntad main-frame-navigering under observations- eller skärmbildssteg, så URL och bevis inte kan höra till olika dokument.
5. Demoverifieraren jämför numera även JS-/bild-/mediafiler i ZIP-exporten mot faktisk webbläsarhämtning: path, SHA256 och bytes, inte bara HTML. Ett manipulerat asset-hashvärde avvisas av enhetstest.
6. Det lokalt staged Vercel-paketet får ett manifest med filhashar. Den lokala verifieraren upptäcker avsiktligt manipulerad HTML och avvisar paketet. Isolerat testpaket `...\vercel-ready-synthetic-84abe1c6b7d7-v2`, publicerat: **false**.
7. Ursprunglig äldre SQL-fixturetransport i `test-db.ts` har potentiellt oavgränsade synkrona Docker/psql-anrop. Ingen ändring i delad PR #368-fixture utan avgränsat beslut. 240-sekunders bred SQL-körning från tidigare är fortfarande inte grön; specifika Etapp1 SQL- och RLS-kontroller har verifierats i full lokal E2E.

**Extra upptäckt:** Den tidigare Playwright `page.screenshot(clip)`-vägen angav långa bildmått men gav bara första viewporten. Numera används kontrollerad CDP `captureBeyondViewport`, med direkt PNG-IHDR-verifiering av verklig bredd/höjd. Verklig read-only granskning av Edfors Bil: **1440 × 5346 px** och **390 × 6000 px**, riktiga PNG-mått identiska med registrerade. Varning kvarstår för ej laddade bilder i delar av sidan och avklippt mobilmaterial över 6000 px; denna sida är inte godkänd som kundprospekt, och en riktig SCB-API-läsning har inte skett.

**Extra UI-fel upptäckt och rättat:** En gammal prospektlistehämtning från projekt A kunde avslutas efter en hämtning från projekt B och skriva över det nyare resultatet. `ProspectBoard` använder nu ett senaste-anropsversionsnummer; gammalt svar kan inte ändra den valda listan. Den senaste helkörningen bekräftar att det sparade syntetiska prospektet öppnas igen.

**Kontroller efter åtgärder:**
- Riktade Vitest: **72/72 pass**, åtta testfiler (`Temp\etapp1-hardening-vitest.log`).
- Node + riktig Chrome: **7/7 pass** inklusive SSRF-skydd, fördröjd SPA-rendering, faktisk PNG-helhöjd och WebSocket-stopp (`Temp\etapp1-hardening-browser.log`).
- TypeScript: `tsc --noEmit --incremental false` **PASS** efter även UI-rättelsen (`Temp\etapp1-last-typecheck.log`).
- Full autentiserad lokalkedja: **31/31 PASS, completed=true, production=false, outreach=false**, inklusive koppling av prospekt till bygget, hashbar ZIP-export, desktop/mobile och återöppning i verkligt UI (`Temp\etapp1-final-integration-ui-race-fixed.log` och senaste `Administration\WebBuilderEtapp1Local-20261108\synthetic-integration-receipt.json`).
- Två mellanliggande retester fångade verkliga observationsfel: en export gav övergående HTTP 503 under samtidig tung belastning, men samma URI gav HTTP 200/ZIP vid senare separat läsning; nästa körning hittade och rättade ovan nämnda out-of-order-prospektlista. Isolerad slutkörning passerade samtliga steg.

**Separat GitHub-beroende:** PR [#368](https://github.com/Bumbi190/ai-operating-platform/pull/368) kvarstår som `OPEN Draft UNSTABLE`. CodeQL-check `127326580831` rapporterar 6 larm (1 critical, 2 high, 3 medium), huvudsakligen i `apps/web/scripts/website-auth-routes-local.ts` och `apps/web/scripts/test-website-auth-local.mjs` (SSRF/temporary-file/network-dataflöden). Detta är en **annan gransknings- och godkännandegrind**, inte ett bevis att Etapp1:s ägarskapsskydd är brutet. Ändra inte PR #368 från Etapp1-branchen utan separat kontroll.

**Kvar före att markera Etapp 1 helt KLAR:** en riktigt SCB-verifierad registerläsning via behörig skyddad preview och verklig, manuellt granskad kundkandidat; användarens separata klartecken för en Vercel-preview med riktig fungerande länk och asset-integritet; hantering av PR368:s CodeQL-fynd och historiska SQL-timeout. Ingen utrullning eller migration gjord. **Etapp 2 får inte startas som om dessa releasegrindar vore färdiga.**
