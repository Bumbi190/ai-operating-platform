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
