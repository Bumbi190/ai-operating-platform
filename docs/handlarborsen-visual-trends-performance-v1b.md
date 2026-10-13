# Handlarbörsen — visuell statistik och snabbare projektvy (1B)

Status: **draft, read-only, beroende av PR #302**. Ingen prod-ändring och inga ändringar i cron, lagring eller credentials.

## Genomförda, avgränsade förbättringar

- Tre serverrenderade, CSS- och SVG-baserade diagram för **företag** (registrerade/verifierade), **fordon** (publicerade/reserverade) och **handel** (bud/slutförda affärer).
- **En sparad UTC-dag:** två verkliga nivåer per diagram som horisontella staplar. En datapunkt är aldrig en kurva eller en trend.
- **Minst två sparade UTC-dagar:** högst de senaste 14 sparade rapporterna som exakta punkter på datumaxeln. Linjesegment ritas bara mellan två intilliggande kalenderdagar när **båda** värdena faktiskt finns. Saknade dagar och null fylls inte i. Null visas som "Okänt". Faktiskt 0 visas som 0.
- Två mått per grupp kan ha olika definitioner. Diagrammen gör aldrig anspråk på en konverteringstratt, intäkter, MRR eller en fullständig kundresa.
- Tillgänglighet: underliggande exakta värden i utökningsbar tabell vid historik. Responsivt för mobil, surfplatta och dator. **Inget klientbaserat diagrambibliotek och inga nya API-anrop**.
- **/projects:** tar bort en dubblerad `supabase.auth.getUser()` i sidan, eftersom `loadAtlasHomeViewModel()` redan autentiserar, hanterar tomt sessionstillstånd och använder `getAllowedProjectIds`. Rotlayoutens autentisering och projektfilter är orörda.
- `loading.tsx` visar neutrala, tillgängliga laddningsskelett medan behörighetskontroller och dataläsningar pågår. De visar inga påhittade företag eller antal.
- **/projects/[slug]:** projektmodellen och Handlarbörsens befintliga läsning startar parallellt. När arbetsytan är klar kan den strömmas även om statistikpanelen fortfarande laddar via en egen Suspense-gräns.
- **Befintlig statistikläsare:** efter oförändrad project-id/slug/observer- och scope-kontroll körs snapshot- och collector_runs-läsning parallellt i stället för i serie. Om audit-läsning misslyckas visas fortfarande sparat underlag med **okänd** insamlingsstatus; snapshotfel blir fortfarande read_failed.

## Verifieringskontrakt

- Källan är samma redan verifierade och auktoriserade `MarketplaceReport` som visas i dagens KPI-översikt.
- Testar datum, null, noll, luckor, stale/invalid och mörkad åtkomst samt att det inte tillkommer ny klientkod för diagram eller något DB-anrop.
- Testar att två läsningar startar samtidigt **efter** scope/mode-grindarna och inte kan utföra skrivningar.
- Route-level skeleton och ny auth-fördelning är strukturellt testade. En faktisk produktions-TTFB-förbättring är **inte uppmätt** (preview kan ha auth/cold-start) och får inte påstås.
- Förhandsvisningen ska granskas visuellt på mobil/dator före merge. Lås inte upp autonom handling, externa kundsvar eller aktivera ekonomi här.

## Efter detta

**Stripe/ekonomin** ska granskas som ett **eget steg** i både `Bumbi190/handlarborsen` och Omnira: kontrollera vad som är driftsatt, om live billing är aktiverat och vilka säkra aggregerade/behörighetsskyddade ekonomidata som får läsas. Ingen nyckel, webhook, betalningsfunktion eller aktivering ingår i den här PR:en.
