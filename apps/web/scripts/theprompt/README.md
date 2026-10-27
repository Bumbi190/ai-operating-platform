# The Prompt — godkända MP4-klipp till Omniras kanoniska medielagring

**2026-10-27, status: förkontroll godkänd, riktig import INTE genomförd.**

Den här mappen innehåller tre separata arbetsdelar:

- `approved-clips-preflight.mjs`: läsande MP4-inspektion och SHA-256-lås mot de fyra klippen som redan godkänts
- `approved-clips-check.mjs`: fristående förkontroll, inga externa beroenden, inga skrivningar
- `import-approved-clips.mjs`: låst operatörsimport, **ingen automatisk aktivering**; använder Omniras befintliga `admitAssetBytes` när den får uttrycklig skrivbehörighet
- `run-approved-import.cjs`: separat Node-serverstartare som kompilerar den riktiga kanoniska importeraren till en tillfällig, serverbegränsad CLI; kompilerar bara under kontroll och öppnar ingen publik API-route

## Verifierade resurser

- Lokalt: `C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022\scene-0.mp4` till `scene-3.mp4`.
- Samtliga fyra har 720×1280 (9:16), 4042 ms MP4-containervaraktighet och fullständig inlåst SHA-256.
- Projektet i Omniras egen Supabase: `ai-media-automation` / `a8a1b1f6-c222-4893-9399-b1fb3bc2fa52`.
- Avsedd bucket: `media-assets-private` (privat). Tabellen `assets` och `asset_provenance` har RLS aktiverad.
- Läsande livekontroll: **0** registrerade The Prompt-videotillgångar, **0** befintliga objekt under importens lagringsprefix och **0** SHA-256-dubbletter från dessa fyra klipp.

## Helt säker förkontroll

Från `apps/web`:

```powershell
node scripts/theprompt/approved-clips-check.mjs --source-dir "C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022"
node scripts/theprompt/run-approved-import.cjs --source-dir "C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022"
```

Båda kommandona är **read-only**, verifierar fyra exakta filer och behöver inga Supabase-nycklar. Kompilering utan externa anrop kan separat testas med `node scripts/theprompt/run-approved-import.cjs --link-check`. Kompilerad körning av riktiga kanoniska moduler (utan databasanslutning) kan testas med `--module-check`. Dessa två tekniska kontroller kräver installerade beroenden, men inga hemliga nycklar.

Tester:

```powershell
node --test scripts/theprompt/approved-clips.node-check.mjs scripts/theprompt/import-approved-clips.node-check.mjs scripts/theprompt/run-approved-import.node-check.mjs
```

För de två operatörsspecifika simuleringstesterna med verkliga MP4-filer kan man före kommandot sätta `THEPROMPT_APPROVED_CLIPS_DIR` till den lokala provreel-mappen. Utan dessa filer hoppas de två testerna över i CI; de övriga körs utan särskilda beroenden.

## Uttryckligen blockerad riktig import

Skrivläget är spärrat om inte **samtliga** följande är uppfyllda:

1. Oberoende granskning av importkoden samt projekt-/assetisoleringen och godkänd körning i en riktig servermiljö.
2. Den lokala processen har korrekta *server-only* `NEXT_PUBLIC_SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` utan att nycklar skickas till chatt eller loggar. Kodens accepterade projekthost är låst till Omniras rätta Supabase, inte Familje-Stundens eller Handlarbörsens databaser.
3. Operatören aktiverar den separata grinden `OMNIRA_THEPROMPT_IMPORT_APPROVED=1`, anger `--apply`, och anger exakt förväntat projekts UUID i `--expected-project-id`. Grinden är OFF som standard. Ett negativt lokalt test med `--apply` utan grinden gav `NO-GO: operator_gate_off`, exit code 1.
4. Start sker med `run-approved-import.cjs`, som **enbart i en betrodd lokal Node-serverprocess** kompilerar de befintliga kanoniska modulerna. Nexts `server-only`-markör görs till en no-op i denna **privilegierade CLI-kompilering, inte i webbappen**. `--link-check` och `--module-check` har passerat med installerade beroenden från en isolerad arbetskopia, utan nätverksanrop. Fullständigt operativt `--apply` med riktiga skyddade miljövariabler och efterföljande importkvitton är **inte testat**.
5. Alla fyra källfiler kontrolleras igen med bytehash före *första* skrivning. Databasens eventuella existerande tillgångar kontrolleras mot både checksumma och provenance innan nya filer registreras.

Importen använder endast Omniras befintliga, kanoniska `admitAssetBytes`: först MP4-validering, sedan privat lagring, asset-rad och ursprungsrad. Inget `upsert`, ingen dubbelgenerering och ingen automatisk återförsök vid oklar utgång. Vid en redan registrerad exakt match väljs befintligt ID. Vid en partiell DB-/nätverksincident stannar hela körningen för manuell avstämning; en fyrfilsbatch utlovas **inte** vara databasatomisk.

Historiska klipp märks `source: imported`, `provider: higgsfield`, `model: grok_video_v15_lite`, `publicationApproved: false`. Inga tidigare provider-jobb-ID eller nya kostnadshändelser hittas på. Importbeslut är skilt från filmens redaktionella publiceringsgodkännande.

## Lokala verifieringsresultat

- 5/5 syntax/MP4-simulatorfall gröna.
- 7/7 importsäkerhetsfall gröna, varav två testades med riktiga filer och mockade DB-/Storage-operationer.
- 4/4 lokala MP4-filer passerade SHA-256, byteantal, bilddimensioner och MP4-containervaraktighet.
- Tvingad `--apply` utan separat env-grind vägrades. Ytterligare 7/7 grindtester avvisade bland annat fel projekt, fel Supabase-värd och saknad nyckel, och bekräftade att vanlig dry-run är oförändrad.
- Offline Node-`--link-check` PASS; riktig kompilerad `--module-check` PASS – kanoniska admin- och admissionmoduler laddades utan databas-/lagringsanrop.
- Inga produktionsfiler uppladdade, inga `assets` eller `asset_provenance` rader skapade, ingen Higgsfield-kredit debiterad.

## Återstående beroenden

- Oberoende kodgranskning och säker integration i riktig, skyddad servermiljö.
- Uppladdning av fyra klipp med riktiga privata tillgångs-ID som kvitto och uppföljande SQL- och Storage-läsning.
- Fristående fullständig Remotion-render och manuell kvalitetsgranskning av den färdiga vertikala reelen.
- Separat PR #552 (budget för framtida betalda Higgsfield-anrop) behöver koordinerad DB/source-release innan någon automatiserad videogenerering får aktiveras.
- Gammalt bildbaserat publiceringsflöde är kvar oförändrat och videoläget för publicering är AV.

## Automatiskt CI-skydd för importen

`.github/workflows/theprompt-hybrid-safety.yml` kör lokala kod- och avvisningstester utan databas, hemliga nycklar eller npm-installation. I CI ska **40/40** syntetiska fall passera och de **2** fall som behöver riktiga privata MP4-original ska vara explicit markerade som överhoppade. På Hultgren verifierades alla **42/42** med de riktiga godkända källfilerna. En separat lokal `--module-check` bekräftar att de kanoniska importmodulerna går att ladda med redan installerade serverberoenden.

**Detta är inget produktionskvitto.** Det saknas fortfarande ett skyddat, behörigt `--apply`-test med faktiska kanoniska Asset-ID och efterföljande objekt-/provenancekontroll, samt en färdigrenderad reel.
