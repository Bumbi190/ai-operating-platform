# The Prompt — privat videopilot och kanonisk MP4-import

**Status 27 oktober 2026:** 4/4 tidigare godkända klipp har importerats till Omniras **privata** Supabase-lagring. Varje fil har hämtats tillbaka, jämförts mot originalets fulla SHA-256 och testats via en temporär signerad läslänk. Ingen ny Higgsfield-generering, schemaändring eller publicering har skett.

## Bekräftade filer och identiteter

Projektet är `ai-media-automation` (`a8a1b1f6-c222-4893-9399-b1fb3bc2fa52`) i Omniras databas `iboepohjwrhtgshrqaol`. Privat bucket: `media-assets-private`. Alla fyra poster är aktiva `video/mp4`, 720×1280, 4042 ms, `visibility=internal` och `publicationApproved=false` i provenance.

| Lokalt original | Kanoniskt Asset-ID |
| --- | --- |
| `scene-0.mp4` | `30e4b399-d3f4-4aec-9dc9-4f468c413b69` |
| `scene-1.mp4` | `d806c254-0b22-46be-abb9-a52310eb6af7` |
| `scene-2.mp4` | `dda65355-c200-4a41-a1ff-12f7da10e637` |
| `scene-3.mp4` | `069bac8a-9c88-4f41-b872-7fdcde33a992` |

Det äldre publicerade manuset `b0495f6b-9973-40dc-ae9b-156cc110ab51` har 28 049 ms berättarröst, ordtider och **tre** sparade bakgrundsbilder. Pilotens privata scenmappning är scen 0–2 i ordning; fjärde klippet förvaras men kopplas inte tyst till ett tretalsmanus.

## Importskriptens säkerhetsgränser

`approved-clips-preflight.mjs` är en ren filvaliderare med inlåsta fulla SHA-256, filstorlekar och MP4-containerdimensioner.

`approved-clips-check.mjs` är en läsande, beroendefri lokal förkontroll. `import-approved-clips.mjs` innehåller den befintliga kanoniska `admitAssetBytes`-importen, utan `upsert` eller automatisk omkörning efter osäkra resultat. `run-approved-import.cjs` är en skyddad Node-startare för dessa befintliga servermoduler, inte en webb- eller publiceringsväg. En korrekt `--apply` kräver separat operatörsflagga, rätt projekt-ID, rätt Supabase-värd och giltig servernyckel. Nycklar lagras inte i detta repo eller dess loggar.

**Importen har redan genomförts. Kör inte ytterligare en produktions-`--apply` utan att först stämma av registrerade tillgångar och granskningsbeslut.** Vid en oklar utgång måste objekten granskas manuellt; importen utlovar inte atomiska transaktioner över fyra filer.

Helt läsande förkontroll på Hultgren:

```powershell
node scripts/theprompt/approved-clips-check.mjs --source-dir "C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022"
node scripts/theprompt/run-approved-import.cjs --source-dir "C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022"
```

Tekniska, likaså läsande verifieringar med installerade beroenden: `run-approved-import.cjs --link-check` respektive `--module-check`. Båda passerade på Hultgren innan den verkliga importen.

## Privat förhandsgranskning (nästa leverans)

`GET /api/media/hybrid-preview/[scriptId]` byggs i PR #558 som en **läsande, ägarbegränsad förhandsgranskningsväg**. Den accepterar en `video_asset_id` per redan sparad bildscen, eller `-` för att behålla en stillbild. Alla ID:n valideras och hämtas ur rätt projekts kanoniska tillgångsregister; privata nedladdningslänkar skapas först efter kontroll av inloggad plattformsoperatör och projektägare.

Svar markeras `private_review_only`, `canGenerate=false`, `canPublish=false` och `canSchedule=false`, med `private,no-store` och `no-referrer`. Samma gamla render- och publiceringsvägar har inte ändrats. Den här vägen ger **renderindata**, inte en färdig MP4. Inga signerade privata länkar sparas i Git eller i dessa anteckningar.

## Tester och återstående arbete

- Föregående hybrid- och importkontroller: 43/43 på Hultgren med verkliga filoriginal.
- Nytillkomna läsande previewförfrågnings- och ursprungstester körs tillsammans med ovanstående i GitHub-regressioner. CI saknar med avsikt de två privata källfilssimuleringarna och redovisar dem som `skipped`.
- Riktig databas- och Storage-kvittoverifiering: 4/4 aktivt lagrade MP4, 4/4 fullständig bytehash efter återhämtning och 4/4 fungerande temporära signerade läslänkar.

**Återstår:** slutför API- och typkontrollerna på den aktuella PR-versionen; koppla preview till en faktisk spelare eller Remotion-rendering, skapa en privat MP4 och granska den manuellt. Datorn har haft mycket lite ledigt RAM; kör därför tung rendering i separat godkänd miljö eller först när maskinen klarar det. PR #552 för framtida Higgsfield-budget är fortfarande **draft** och betald videogenerering är AV. Det gamla bildflödet och schemat 10.00/20.00 är oförändrade.

För fullständig historik, se `docs/theprompt-hybrid-reel-render-support-20261027.md` och lokala `Projects/Theprompt/Nyheter/Provreel-20261022/LAS-MIG.md`.

## 28 oktober – godkänd 720p V3-master och redaktionell stil

Den specifika V3-filmen med SHA-256 `d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788` och stilen med 12 kortare utsnitt, redigerbara texter, mjuka zoomningar och återställt originalslutkort är nu **godkänd för återanvändning som privat kreativ referens**. Det utgör inte tillstånd att automatiskt publicera eller debitera nya Higgsfield-krediter.

Godkännandet finns på två ställen: lokala `V3_REVIEW_MANIFEST.json` i `V3-Dynamic` och kodprofilen `apps/web/lib/media/theprompt-dynamic-v3-approved.json` (med tester). Den privata 720p-masterfilen finns fortfarande **endast lokalt** och har inte påståtts vara uppladdad. En separat read-only-förkontroll och avstängd canonical import för just denna exakta master finns i `approved-v3-master.mjs` och `run-approved-v3-master.cjs`. Användaren godkände innehållet, men en separat skrivgrind och oberoende driftgranskning krävs för att registrera output i Supabase. Den skarpa importen stoppades innan skrivning; skyddet har inte kringgåtts.

En självständig handlingsplan finns i `docs/theprompt-v3-approved-master-20261028.md`. PR #552 om videobudget är fortfarande separat draft. Befintliga bildinlägg och tidsscheman är oförändrade.
