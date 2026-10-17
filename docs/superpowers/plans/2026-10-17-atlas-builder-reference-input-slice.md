# Atlas Byggstudio — bildreferenser, första säkra del (2026-10-17)

Status: **implementerad och lokalt testad grundmodul, INTE aktiverad i användargränssnitt eller produktion.** Isolerad branch `codex/atlas-builder-references-20261017`.

## Varför en separat del behövs

Den godkända femleveransplanen kräver upp till fyra PNG/JPEG/WebP-referenser per tur, högst 10 MiB per bild, verklig typ-/pixelkontroll, EXIF-rensning och därefter ett **privat** kanoniskt AssetId inom rätt projekt. En referens måste först godkännas av servern och kopplas till en behörig konversation innan en AI-modell får se den.

Direkt multipart-POST av upp till 4 × 10 MiB till en vanlig Vercel Function fungerar inte: [Vercel begränsar request bodies till 4.5 MB](https://vercel.com/docs/functions/limitations#request-body-size). Det går inte att lösa med en större klientinställning.

## Implementerat i denna branch

`lib/website-build/assets/normalize-reference.ts` är ett transportoberoende, isolerat normaliseringssteg:

- Kontroll av tillåten MIME **mot faktiska bytes**. SVG, HTML och påhittade format vägras.
- Maximalt 10 MiB, 6 000 px per kant och 16 megapixlar. Skadade filer och överdimensionerade bilder vägras före lagring.
- Använder pinnad `sharp` för riktig dekodning och orienteringskorrigering, inte klientens dimensioner.
- Kodar om till WebP och stryker källans EXIF/ICC/XMP inklusive platsdata; returnerar verifierad dimension och bytes. **Ingen uppladdning, URL, betald modell eller publiceringsbehörighet skapas.**
- Riktade tester med PNG/JPEG/WebP, falsk MIME, SVG, korrupt fil, storleksgränser och roterad EXIF-bild.

## Fortsättning (måste göras innan funktionen kan visas som klar)

1. Ägar-/projekt-/konversationsbind en engångsbiljett till **privat temporär uppladdning** hos Supabase Storage. Klienten laddar bytes direkt till rätt privat staging, med maxstorlek och kort giltighet. Ingen publik bucket.
2. Servern verifierar exakt uppladdningsbiljett, ägare, projekt, konversation, antal (≤4), format/bytes/pixlar och allokering. Läs originalet från staging, kör `normalizeReferenceImage`, lagra **bara det normaliserade** resultatet via befintlig `admitAssetBytes` med `visibility: internal`, radera staging. Kvittera AssetId + hash, inte en offentlig URL. Hantera återspelning, fel, städning och parallella uppladdningar.
3. Ge ägarbunden läsning/thumbnails utan att exponera Supabase service-role. Visa uppladdade referenser bredvid studio-composern och bevara dem vid fel/återupptagning, även vid projektbyte och mobil.
4. Bind referens-AssetId till **exakt chattur och projekt** på servern; multimodalt skickas bara verifierat material till en bildkapabel modell. Avvisa bilagor från en annan konversation, gamla/återkallade projekt, arkiv och ändrade utkast. Verifiera att modellen faktiskt såg bilderna.
5. Utöka arbetsplan, designmockups och färdig byggartefakt med korrekt proveniens, rättighets-/licensbeslut och projektbundet bildmaterial. Ingen betalad GPT Image 2-körning innan adapter, prisbok, hård kostnadsreservation och riktiga kvitton finns enligt ursprungsplanen.

## Säkerhets-/releaseregel

Inga nuvarande globala kod-workflows, iframe-CSP, kostnadsgrindar eller publiceringsgränser får öppnas för bildstödet. Den här grunden är en byggsten och ger **ingen** rättighet till Atlas att använda stationärens terminal, ändra livekod eller skicka bilder till en modell.

Huvudplan: `docs/superpowers/plans/2026-10-14-atlas-builder-studio-rollout.md`. Versionsbunden kvalitetskontroll och inloggat end-to-end-prov krävs för att lyfta Draft → Ready.
