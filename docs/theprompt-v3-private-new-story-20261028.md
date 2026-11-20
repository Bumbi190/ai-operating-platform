# The Prompt – V3 på ett nytt, opublicerat manus (privat faktagranskningsprov)

**28 oktober 2026. Kod och FilmCraft endast för privat QA. Ingen produktion aktiverad.**

## Resultat av det genomförda provet

Ett nytt `media_scripts`-manus från 28 oktober, med manus-ID
`b9271d5b-5254-4ad8-a36c-ce7c66e9c63e`, valdes för att tekniskt prova den
tidigare godkända V3-stilen. Vid läsning hade det redan 3 projektägda
AI-illustrationer, 51 synkroniserade talade ord, en 22 152 ms befintlig
berättarröst och `status=approved`.

Originalkällan är WIRED:
`https://www.wired.com/story/uk-home-office-may-face-investigation-over-use-of-openai-tools/`

**Innehållsvarning:** Manuset överdriver avgörandebefogenheten. Källan beskriver
AI-verktyg för att sammanfatta intervjuer och söka policyinformation, och
Home Office uppger att handläggare fattar besluten. Artikeln beskriver att en
granskning övervägs, inte att den formellt pågår. Befintligt manus och audio
får inte behandlas som faktagranskade. Databasens `quality_score` anger
`passed=true` men även `Quality check parse error — proceeding with caution.`
Det är ingen tillräcklig redaktionell kontroll.

## Verklig FilmCraft-export – lokal, inte publicerad

- Fil: `C:\Users\Andre\Projects\Theprompt\Nyheter\20261028-HomeOffice-V3-PrivateQA\ThePrompt_V3_NewStory_PrivateQA_EDITORIAL_HOLD_20261028.mp4`
- Redigerbar FilmCraft-fil: `ThePrompt_NewStory_V3_FACTCHECK_HOLD.fcproj` i samma mapp.
- Förhandsgranskning: `OPEN_PRIVATE_V3_QA.html`.
- 10 korta stillbildsutsnitt med animerad zoom från 3 befintliga public-media-
  illustrationer, 4 crossfades, 13 tidskodade bildtexter och godkänt THE PROMPT-
  avslutningskort.
- 24,68 sekunder, 360×640, 740 frames, 30 fps, H.264 High och AAC stereo.
- FFmpeg full avkodning: `exit 0`.
- SHA-256: `812bc7c1b376a798e2aa8b2d042eb92279a39792be41752ddcfb48492ac5cd52`.
- 2 784 406 bytes, ljudmedel -20,0 dB och max -1,5 dB.
- Ovanpå hela nyhetsdelen syns `EDITORIAL HOLD – NOT FOR PUBLICATION` och
  `AI-GENERATED ILLUSTRATIONS`, så provet inte kan misstas för färdig nyhet.
- Ingen ny Higgsfield-betalning, ingen röstgenerering, ingen ny DB-post,
  ingen social publicering och inga ändrade scheman.

Detta prov **visar vad samma V3-metod kan göra när en ny nyhet bara har
stillbilder**. Det har förstås inte riktig rörelsefilm i den mening som de
fyra original-MP4-klippen har.

## Generell Omnira-kod i PR #558

1. `apps/web/lib/media/theprompt-v3-storyboard.ts`: deterministisk
   planering av 2–3 sekunders bildutsnitt från redan godkända bildreferenser
   och känd längd, bundet till rätt projekt och ett ännu opublicerat script-ID.
   Stoppar fel projekt, publicerade script, fel bildantal och trasiga ordtider.
   Den privata bildstilplanen innehåller uttryckligen `canPublish=false`,
   `canGenerate=false`, `canSchedule=false` och `editorialHold.required=true`.
2. `apps/remotion/src/components/V3ImageMontageBackground.tsx`:
   bildväxlingar med interpolerad zoom/pan, korta dissolves och tydlig
   granskningsmärkning när innehållet inte är verifierat. Körs som valbart
   V3-läge i `SimpleNewsReel`, utan att ändra gamla renderade bild- och MP4-lägen.
3. `GET /api/media/v3-private-storyboard/[scriptId]`: ny, endast läsande
   ägar-/projektbehörighetskontrollerad API-route. Helt låst till The Prompt.
   Tar inga öppna query-parametrar, kräver bilder/ljud/timing från rätt
   Supabase-projekt, hämtar ett begränsat ordtidsunderlag utan redirect och
   returnerar ett V3-renderunderlag med granskningsspärr. Den kända
   sakfelaktiga pilotnyheten får explicit `source_claim_conflict`.
4. Webbsidans `buildVideoInputProps` kan återanvända redan kontrollerade
   ordtider i V3-läget utan ett extra oskyddat fetch-anrop. Äldre
   anropsvägar lämnas oförändrade.
5. CI testar både rena regler och att den verkliga Remotion-koden går att
   kompilera. Lokalt: **78/78 tidigare + nya relevanta tester** utan fel.
   Den nya Storyboard-modulen har ytterligare 10 fall, och äldre bildfallback
   behålls.

## Viktig gräns mellan test och pågående publicering

Den nya API-vägen är endast avsedd för privata granskningsförslag. Den
kopplas **inte** till `render/start`, cron, kostnadsreservationer eller
sociala sändningar. Samtidigt är det ursprungliga automationsmanuset i
produktionsdatabasen fortfarande markerat som `approved`; dess
`video_status` hade blivit `ready` vid sista kontroll. Den nya privata
spärren stoppar **inte** den äldre publiceringspipelinen.

En riktad redaktionell paus/ändring av just denna redan godkända post måste
hanteras och godkännas separat. Att skriva om gamla voice- och captionfält
utan korrekt ny röst är inte ett godtagbart sätt att dölja sakfelet.

## Fortsatt arbete

- Testa auktoriserad privat preview efter CI/preview-deploy.
- Gör fullständig Remotion-render i ett isolerat test med redan känt,
  faktakontrollerat script och rätt källmaterial, inte en dubblerad
  publicerad nyhet.
- Rätta originalmanuset och skapa ny voice om det ska publiceras.
- Kör godkännande och budget/produktionsrelease i en separat, granskad fas.
