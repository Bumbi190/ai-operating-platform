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

## 2026-10-17 – efterföljande serverdel i PR #368 (ej publicerad)

Denna arbetsgren innehåller nu också ett **utkast till hela serverflödet** för privata bildreferenser:
- `POST /api/website-build/references/tickets` autentiserar server-session, same-origin, aktuell ägare/projektstatus och konversationsbindning innan en signerad uppladdningsbiljett skapas. Biljetten har servergenererad exakt path i `atlas-reference-staging`, max 4 stabila slots per utkast och två timmars giltighet. Samma slot+utkast är idempotent och MIME-byte vid återspelning avvisas.
- `POST /api/website-build/references/finish` läser endast den projektspecifika staging-filen, CAS-claimar ticketen (`issued` → `processing`), kontrollerar verklig MIME och pixlar, konverterar till metadatafri WebP, kör befintlig kanonisk privata `admitAssetBytes`, sparar `AssetId` och försöker rensa staging. Redan `ready` ger samma AssetId. Ingen publik URL, AI-modell eller publicering.
- En SQL-proposition finns i `docs/sql/atlas-builder-reference-upload-tickets-proposed.sql`. Den skapar **ny privat staging-bucket med 10 MiB/MIME-gräns** och server-only ticket-tabell med RLS, unika slot-identiteter och tillståndskontroller. Den ligger uttryckligen **inte** i den kanoniska migrationsmappen; den har inte applicerats i produktion eller annan befintlig Supabase-databas. Ett temporärt, nätverksisolerat PostgreSQL 16-test av första DDL-varianten passerade för privat bucket, tvingad RLS och nekad authenticated-läsning. Uppdaterad state/asset-constraint kräver ny isolerad verifiering innan release.

**Status:** Kod och mockade HTTP-/storage-/databastester är lokalt gröna. Ingen verklig signed-upload har provats mot Supabase; API-rutterna saknar tabellen/bucket tills migrationen genomförs. Därför får PR **inte mergas eller deployas**. Kodmodellen är avsiktligt fail-closed.

**Kvar före release:** (1) SQL-säkerhetsgranskning, kostnad/rate limit och ett kanoniskt migrationsbeslut, (2) korrekt hantering/återställning av `processing`-jobb efter serverkrasch samt tidsstyrd rensning av utgångna/orphanade staging-filer, (3) riktiga signerade upload-tester på isolerad Supabase-miljö med 10 MiB och minst ett feltest, (4) UI filväljare/thumbnails och uppladdning utan service-role i klienten, (5) bind AssetId till exakt chattur, säker behörig bildläsning och verkligt bildinput i modellen, (6) budgeterad separat GPT Image 2 och riktig app-preview i senare leveranser. En testad backend betyder inte att Atlas nu kan se bilder i chatten.

Granskningsbar [PR #368](https://github.com/Bumbi190/ai-operating-platform/pull/368).
