# Demo Motors: budgetbeslut och granskningsbart byggpaket

Datum: 2026-11-04. Work ID WEB-STUDIO-PRESET-BIND-20261104. Samma ägda Draft PR368; preflight gav reuse_existing. Utgångspunkt da9e0f6467a853e5eefc4242edb3a14d9d5ad755.

## Budgetbeslut genomfört

Ägarens ”Okej fortsätt då :)”, sidkontext f04566e3-4489-455f-bb65-42a52d4fef45, följer den uttryckliga frågan om USD10 för API-planering/bygge/ändringar med förbetalda Higgsfield-krediter separat. Det behandlas som ja till just det förtydligandet, inte som en ny eller förnyande ram.

- Oföränderlig separat kvittens: [budget-scope-approval](2026-11-04-budget-scope-approval.json).
- Filens SHA-256: ecc80389a7b35a344416146b3b9fc94f6e097845bedcddbf1e4671237a3d8385.
- Befintligt originalgodkännande och lokal admissionsjournal är bevarade.
- Ny skrivskyddad kontroll visade 0 cost_events, 0 spend_reservations och pausat ägarprojekt.
- budget_set_total_allowance initierade endast e6cf9349-4967-441c-a2bd-5778eec974b3 med 10 000 000 USD-mikroenheter, tidigare API-belopp uttryckligen 0 och kvittensens SHA.
- Efterkontroll: limit 10 000 000, committed 0, rätt approval SHA, execution_paused true. [Efterkvittens](2026-11-04-budget-scope-applied.json).
- Ingen månatlig höjning, återbetalning, återställning, ny media, projektåterstart eller betald körning.

Den historiska mediedelsumman är fortsatt ofullständig. Den har inte omvandlats till USD eller nollats av detta beslut.

## Konkret leverans

Ägarvyn /build/demo-motors/cinematic?view=build-review samlar den faktiska sjubilarsvisningen med en nedladdning av hela paketet. Bilhallens ägarvy länkar till granskningssidan. Den offentliga pilotvyn får ingen ny ägarknapp.

Det portabla paketet innehåller:
- index.html: sju konceptbilar, ordinarie filter och Nord R-annons.
- roadster.html och viewer.html: befintlig v7-film, v8-ljus och v9-modell med fyra thrusters.
- nord-r.html: befintlig Nord R-modell och referensbakgrund.
- visning.html: befintlig separat filmvisning.
- Samtliga 30 mediefiler/runtimeberoenden och modellernas relativa alias.
- preset-manifest.json: faktiska HTML-/mediehashar och byteantal.
- plan-proposal.json: fem dokument, sju bilar och designreferens till exakt pakethash. Status review_only_not_admitted.

Den nya exporten fungerar på vanlig statisk HTTP-hosting med relativa filnamn och behöver inte Vercels query-routing. Den befintliga separata Vercel-exportören bevaras. Nord R:s fasta vieweradress läses nu från ett serverförfattat data-attribut för att båda monteringssätten ska fungera; filmer och modellpayloads är oförändrade.

Nedladdningen kräver den pakethash som granskningssidan visade. Saknad, manipulerad eller inaktuell bindning nekas. Endast fasta serverförfattade dokument och det befintliga medieregistret används. Faktiska bytes verifieras vid export. CSP från HTTP-svaren följer med som meta i statiska dokument (frame-ancestors är endast en headerregel och utelämnas ur meta).

Ingen generell HTML-kompilator eller iframe-sandbox har öppnats för modellgenererad video, script eller iframe. Formulären är demo. Filmvisningens befintliga, tydligt märkta mailto-länk finns kvar; den öppnar besökarens mejlprogram vid ett uttryckligt klick.

## Verifiering

- 36 fokuserade Vitest-fall passerade: komplett hash-/filgraf, giltigt planförslag, inaktuell/manipulerad bindning, ägargräns och oförändrat generiskt script-/video-/iframe-förbud.
- Samtliga 43 Playwright-fall passerade lokalt, inklusive full fristående export: båda modellerna, Roadster-filmens slut, återlänk till katalog, separat film och ingen extern nättrafik. Mobil/dator granskningssida ingår.
- Testservern behövde Content-Length och byte-range-svar för att modellera riktig statisk videohosting. Detta ändrar inte film eller produktens scrollkod.
- Lokal full typkontroll slog i den uttryckliga 1536 MB-minnesgränsen; inget typkontrollresultat hävdas från den körningen. Full typkontroll inväntas i CI.
- Författarens andra genomgång: originalbudget och tidigare planbeslut orörda, exakt projekt vid budget-RPC, ingen generisk scriptmöjlighet, ingen förväxling mellan granskningsförslag och godkänt bygge. Ingen oberoende granskning hävdas.

Den kompletta nedladdningen skickas som en explicit ReadableStream i högst 64 KiB-stycken efter integritetskontroll. Det undviker en enda buffrad funktionsrespons för det stora mediepaketet; streamingvägen har ett separat test. Se [Vercels dokumenterade skillnad mellan buffrad och strömmad respons](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions). Inloggad verifiering av den hostade nedladdningen återstår.

## Kvarstående koppling — inte ett genomfört AI-bygge

Detta slutför ett granskningsbart, versionerat indata-/exportpaket. Den ordinarie sparade planen är fortfarande v1 med åtta bilar. Ingen ny planrevision, mockupbeslut, planbeslut eller byggsession har skapats.

Nästa arbete måste använda paketbindningen genom ordinarie plan/mockup/worker/historik och ett snävt textändringskontrakt. Paketet får inte skickas genom den generiska HTML-vägen och kallas bevarat. Därefter krävs det faktiska plan-/designbeslutet och styrd kostnadskontroll före ett övervakat API-bygge samt en avgränsad CTA-ändring. Den redan förtydligade budgetomfattningen ska inte efterfrågas igen.

Ingen merge, produktionspublicering av webbplatsen eller kundutskick. omniraos.se är oförändrat.
