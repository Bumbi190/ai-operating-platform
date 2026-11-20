# The Prompt — godkänd V3-master och visuell stil

**Godkännande mottaget 28 oktober 2026.** Den specifika V3-testfilmen
`ThePrompt_Dynamic_V3_720_Master_TEST_2026-10-28.mp4` (720×1280, 30,72 s)
och dess visuella riktning godkändes uttryckligen av användaren. Godkännandet gäller
**filmen och den kreativa stilen**. Det är INTE ett separat tillstånd att
automatiskt publicera, återpublicera en redan publicerad nyhet eller köpa nya AI-klipp.

## Referens och kvalitet

- Varaktighet: 30,72 s / 921 bildrutor / 30 fps / 720×1280 vertikalt.
- SHA-256: `d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788`.
- Storlek: 6 878 149 bytes. H.264 High / AAC stereo 48 kHz.
- 12 redigerade utsnitt ur fyra redan godkända unika källklipp.
- 4 cross-dissolves, selektiva mjuka zoomningar, tydliga ord-/siffermarkeringar.
- 19 synkade undertextgrupper och en redan existerande berättarröst.
- Återställt officiellt THE PROMPT-slutkort med dubbla linjer, sloganen
  `AI NEWS. DAILY. NO FLUFF.`, och utan text på slutkortet.
- FilmCraft 0.9.0 exporterade utan saknade medier; full MP4-avkodning och
  ljudmätning passerade. Bildkontroll gjordes på minst fyra referensrutor.

## Vilka resurser Atlas ska använda

Maskinläsbar, versionslåst stilprofil:
`apps/web/lib/media/theprompt-dynamic-v3-approved.json`.

Den godkända video-mastern, det redigerbara FilmCraft-projektet och fullständiga
QA-kvitton finns lokalt på Hultgren under:

`C:\Users\Andre\Projects\Theprompt\Nyheter\Provreel-20261022\preview-local\FilmCraft-review\V3-Dynamic`

Kanoniska källklipp är sedan tidigare lagrade i Omniras privata medielagring som
fyra olika Asset-ID. Det är **inte samma sak som att den nya färdiga V3-filmen
redan har laddats upp**.

En ny, *default OFF* operator-import finns i
`apps/web/scripts/theprompt/approved-v3-master.mjs` med startaren
`run-approved-v3-master.cjs`. Den verifierar masterfilens exakta SHA-256,
upplösning, varaktighet och käll-Asset-ID:n, skapar endast en **privat derived
Asset** via Omniras kanoniska `admitAssetBytes`, och anger
`creativeMasterApproved=true`, `publicationApproved=false`. Ingen
publiceringsväg skapas. Normal körning är read-only.

**Operativ status:** skarp import av färdig V3-master till Supabase **har inte
genomförts**. Det lokala skrivförsöket stoppades innan någon muterande körning
kunde startas. Försök inte med direkta SQL- eller Storage-insättningar för att
gå runt spärren. Använd endast genomgången, operatörsgodkänd canonical admission
och verifiera kvittot efteråt.

## Nästa utveckling

1. För in den godkända visuella profilen i Atlas redaktionella storyboardplanering,
   med ordtid, faktakontroll och identifierade tillgångar för varje ny opublicerad
   artikel. Återanvändning av samma fyra källklipp i en testsaga betyder inte att
   12 helt olika AI-klipp genererats.
2. QA för 9:16, textens safe areas, ljud, musikrättigheter, AI-illustrationsmärkning
   och korrekt original- versus AI-genererat bildmaterial.
3. Gör integrerad provrendering mot ett **nytt, opublicerat** The Prompt-manus
   med användargodkännande inför distribution.
4. PR #552 om 5 kr per svensk dag är fortfarande en separat draft med
   koordinerad databas- och källkodsrelease innan någon betald videogenerering
   får starta. Behåll två dagliga bildinlägg (10.00/20.00) och bildfallback
   tills allt detta är separat granskat.

Referens: PR #558 för renderar- och privat-preview-stöd. Inga ändringar i
produktionsschemat eller den gamla nyhetslistans publiceringsstatus av denna profil.
