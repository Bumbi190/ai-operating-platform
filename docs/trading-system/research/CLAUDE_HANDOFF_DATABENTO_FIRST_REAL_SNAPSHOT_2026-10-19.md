# Omnira / Trading – Claude-handoff: första riktiga NQ/ES-dygnet

**Datum:** 2026-10-19  
**Roll:** Läs först. Verifiera mot GitHub och användarens Windows-dator innan nya ändringar.  
**Status:** IMPORT STAGED/DRY-RUN VALIDATED — REAL HISTORICAL DATA NOT DOWNLOADED YET.

## 1. Målet och operatörens instruktion

Bygg vidare på Omniras offline Trading System för NQ/MNQ med ES som SMT-stöd. Användaren vill komma vidare mot **riktig historisk statistik innan finjustering**, med **minimal kostnad**, och planerar att flytta nästa arbetspass till Claude. Föregående assistant har börjat förbereda importen. **Utför inte någon betald nedladdning automatiskt** endast på grund av denna handoff.

Nuvarande första avsedda riktiga data: två futureskontrakt (**NQZ6, ESZ6**) på **2026-10-15T00:00:00Z → 2026-10-16T00:00:00Z**, Databento **GLBX.MDP3**, **ohlcv-1m**, raw_symbol (inte continuous/parent eller ALL_SYMBOLS). Det här är *ett UTC-dygn*, inte explicit en RTH-session.

## 2. Verifierad metadata-offert – inga nycklar

Databento-konto är skapat, användaren har rapporterat **125 USD historiska startkrediter**. Offerten kontrollerades från Databentos verkliga API och sparades **lokalt** (aldrig commit):

\`\`\`
C:\Users\Andre\Projects\Omnira\Previews\Databento-Metadata-20261019\Quote_Result_Public.json
\`\`\`

Verkligt svar (2026-10-19 14:20:34Z):
- status: FREE_METADATA_ONLY_COMPLETE
- NQ: raw_symbol \`NQZ6\`, instrument_id **261401**, est. **0.0050380826 USD**
- ES: raw_symbol \`ESZ6\`, instrument_id **10252**, est. **0.0050380826 USD**
- total est. **0.010076165 USD**, inte garanti för slutdebitering.
- downloadedRecords: 0; billableEndpointsCalled: 0; downloadAuthorized: false.

**API-nyckel får inte läsas, delas, läggas i kod eller sparas i Git.** Den har använts lokalt i dold PowerShell-inmatning och rensats. Fortsätt med dold lokal \`getpass\`-inmatning vid framtida nedladdning.

## 3. Ny researchbranch och verkliga arbetsresultat

Repository: \`Bumbi190/ai-operating-platform\`.

Ny branch: \`research/trading-databento-first-real-import-staging-20261019\`.

Bas: \`research/trading-databento-free-metadata-20261019\`, som har det kostnadsfria metadataverktyget \`databento-free-metadata-only.mjs\`, säker quote launcher, 13/13 Node-tester och stöd för ett enda retry av metadata-timeout. Denna bas är i sin tur researchbaserad på \`feat/trading-databento-offline-intake-audit-20261019\` (36 offline-testfall för leverantörsnormalisering; inte riktig data).

I nya branchen finns:
- \`scripts/trading/research/databento-first-snapshot.py\`: **prepare är default och ger inga nätverksanrop**. Läser verifierad quote, låser dataset/schema/datum/NQZ6/ESZ6/kontrakts-ID och kräver totalt estimat ≤ **0,05 USD** plus färsk offert (max 48 timmar), kompletterat med interaktivt godkännande och villkorsbekräftelse före \`--download\`. Import använder Databentos officiella Python SDK \`Historical.timeseries.get_range(..., path=...)\`, producerar original DBN, SHA256 och granskningsmanifest. Sparar aldrig API-nyckel. Output spärras om mapp redan finns, inga automatiska retries av **betalda** anrop.
- \`scripts/trading/research/test_databento_first_snapshot.py\`: **13/13** verkliga OFFLINE Python-unit-tester på stationära inklusive riktiga quote-metadatans form, strikt kontraktsval, budget, mockade säkerhetsgrindar och ingen debitering. Testerna gör aldrig nätverksanrop.
- \`scripts/trading/research/Databento_FIRST_PREPARE_ONLY.cmd\`: användarvänlig read-only prep.
- \`scripts/trading/research/Databento_FIRST_DOWNLOAD_OWNER_APPROVAL.cmd\`: framtida **avsiktligt debiterande** entrypoint, med konsolens exakta tvåstegsgodkännande. **Kör inte utan användarens uttryckliga pris-/budgetgodkännande.**

Den lokala, ISOLERADE staging-mappen på stationära:

\`\`\`
C:\Users\Andre\Projects\Omnira\Previews\Databento-FirstSnapshot-20261019\
  .venv\Scripts\python.exe
  databento-first-snapshot.py
  test_databento_first_snapshot.py
  Databento_FIRST_PREPARE_ONLY.cmd
  Databento_FIRST_DOWNLOAD_OWNER_APPROVAL.cmd
  Quote_Result_Public.json   (verifierade metadata – ingen nyckel)
\`\`\`

Officiella Databento Python SDK har installerats endast i denna \`.venv\`:
- **Databento 0.87.0**
- **Python 3.12.2**
- Inga verkliga time series GET-anrop har gjorts.
- \`python -m unittest discover -v -p test_databento_first_snapshot.py\` => **13/13 PASS** i den lokala staging-mappen.
- \`python databento-first-snapshot.py --quote Quote_Result_Public.json\` => **PREPARED_PENDING_EXPLICIT_DOWNLOAD_APPROVAL**, real quota 0.010076165 USD, cap 0.05 USD, \`dataDownloaded:false\`.

Viktigt: den lokala estimate-cap på 0.05 USD är **INTE en hård kreditgräns hos Databento**. Inför verkligt datauttag, kontrollera kontots Billing / Usage Limits i Brave (användaren är inloggad där), licens-/storage-villkor och att offerten inte har gått ut.

Först efter uttryckligt operatörsbeslut (exakta kontrakt, dag och budget) får ett **enda** första fakturerbart uttag försökas. Det laddar ner två ursprungliga DBN-filer till:

\`\`\`
C:\Users\Andre\Projects\Omnira\Data\Historical\Databento-20261015\
\`\`\`

Om ett anrop misslyckas efter start, bevara filerna/karantänflaggan och **försök inte igen** innan Databentos Usage/Billing kontrollerats. Ett retry kan skapa extra kostnad. Säkerhetsgrindar på nästa nivå måste granska riktiga DBN innan C3C/paper/replay.

## 4. Tradering och faktiskt prestationsstatistik (spärrat)

Den separata forskningsbranchen \`research/trading-ifvg-b-observation-stats-20261019\` innehåller **83/83** offline-tester för syntetiska iFVG B-only-fall och en lokal HTML/JSON/CSV-rapport:

\`\`\`
C:\Users\Andre\Projects\Omnira\Previews\TradingStats-20261019\
\`\`\`

12 medvetet författade syntetiska scenarier, 3 B-only- och 5 A+B-**observationer**. **Det är INTE riktiga handelstransaktioner, en träffsäkerhet eller en lönsamhetsstudie.** B-prövning = FVG:s tredje candle stänger efter avslutad manipulation; om alla tre ska följa efter är fortfarande oklart.

Användargodkända detaljer:
1. **iFVG = Inversion Fair Value Gap** (ej implied).
2. Bekräftelse med en **helt färdig 1m candle-close STRICTLY beyond far edge**; wick-only är inte tillåtet.
3. Axel föreslog att **B-only** testas först; A är inte formellt förbjudet i den kanoniska strategin.

Öppet: GATE-01 (formation, äldre gap, expiry, tie-break), GATE-02 CISD, GATE-03 equal levels, GATE-04 SMT, GATE-08 licensed real data, calendar/contract evidence och risk/SL/TP/exit. Ingen \`approvedDetectionVersion\`, inga order, ingen livehandel. **Riktig data räcker INTE ensamt till win rate eller profit factor.**

Existerande Backtest Lab v2 är **endast godkänt som visuellt gränssnitt med syntetiska fixtures** och ska inte tyst börja mata ut ”verklig vinst” innan setupen och exits är godkända.

## 5. Skydda användarens arbetskopia, kostnader och integritet

Windows via Remote Desktop Commander, enhet **Hultgren**, id \`0880811c-d0bf-4fca-b636-a36b4f556836\`.

**Rör INTE användarens aktiva git-arbetskopia**:
\`\`\`
C:\Users\Andre\Projects\Omnira\Code\ai-operating-platform
branch: feat/phase3b1b-atomic-bind-provenance
9 smutsiga filer vid senaste kontroll
\`\`\`

Använd en ny separat temporär mapp/branch för research och tester. Gör **ingen PR/merge/deploy/CI** utan godkännande. Prissättningsgränser och licenser ska verifieras, inte gissas. Användarens Brave fungerar, men Chrome hade laddningsproblem vid registrering; Databento-konto är redan skapat.

Uppföljning:
1. Kontrollera SHA/branch och lokal staging, samt att inget realt \`Data\Historical\Databento-20261015\` finns.
2. Kontrollera om 48h offert-färskhet fortfarande gäller; annars begär en *ny gratis offert* via metadata-only, ingen betald historik.
3. Kontrollera verklig SDK \`get_range(path=...)\` och DBN-validation i isolerad test innan debitering; rätta fail-closed i forskning, inte runtime.
4. Begär **uttryckligt klartecken från användaren** för ett historiskt datauttag inom max est. 0.05 USD och kontrollera leverantörens Billing usage limit/Terms.
5. Använd användarens lokala dolda prompt för hemlig nyckel, aldrig ChatGPT/Claude-meddelanden.
6. Efter historik: råbytes-SHA256, kontrakts-ID, bar count, start/slut, onormal OHLCV, UTC/sessionkalender, luckor (OHLCV publiceras endast när handel skett), entitlements, licensing och karantän; anslut därefter separat till C3C när read-only validation godkänts.
7. Först efter fullständig strategi-definition testas win rate, net R, spread/fees/slippage och out-of-sample. Inga låtsasresultat.

Officiella docs:
- https://databento.com/docs/api-reference-historical
- https://databento.com/docs/examples/basics-historical/ohlcv-resampling
- https://databento.com/docs/quickstart

**Högsta prioritet:** Bli klar med en enda riktig, granskad offline-DBN-snapshot utan risk för onödiga debiteringar och utan att öppna någon trading-approval-grind.
