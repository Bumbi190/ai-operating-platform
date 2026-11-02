# Real Vehicle 3D Showroom Pipeline v1 — Omnira Web Studio

**Datum:** 2026-11-02
**Beslutsstatus:** genomförandeplan / första kodgrinden, inte godkännande att publicera eller köpa tjänster.
**Projekt:** Omnira Web Studio. Handlarbörsen kan senare vara en konsument av ett särskilt beslutat B2B-gränssnitt; B2B-marknadsplatsens kunddata, annonser och produktion är utanför detta arbete.

## 1. Kundlöftet vi får ge

Showroomets 3D-modell får beskrivas som **den faktiska annonsbilen** först när identitet, utrustning, visuella avvikelser, ursprungsrättigheter och versionslåst mänsklig granskning kan bevisas för just den lagerbilen.

**Tre visuellt ärliga nivåer:**
1. **Fotografisk 360° av den faktiska bilen:** bilder tagna från den riktiga lagerbilen, med granskat bildursprung. Det är en interaktiv bildsekvens, INTE en fri 3D-modell. Bra lågkostnadsnivå för verklighetstrogen visning.
2. **3D-koncept / uppskattad modell:** kan vara snygg och interaktiv, men får endast kallas koncept, visualisering eller demonstration. Samma modellår eller VIN räcker inte för påståenden om exakt utförande.
3. **Verifierad 3D för exakt lagerbil:** en källbevisad GLB och poster, verkliga fotoreferenser från samma lagerbil, fixkamera-jämförelser, kontroll av lack/trim/fälgar/kaross och auktoriserad mänsklig godkännare. Eventuella skillnader innebär refus eller en uttryckligen annan produktkategori.

Det befintliga Demo Motors-objektet **Nord GT** är `fictional_concept`; dess vita low-poly-geometri visar bara teknik, inte premiumgrafik eller en sann digital tvilling.

## 2. Varför underlag och kvalitet är separata problem

- VIN/registreringsdata kan hjälpa med make/model/year, men etablerar inte färg, hjul, paket, skick, skador eller faktisk utrustning utan separat bevis.
- Fotogrammetri av blank metall och glas är tekniskt svår. Många foton med samma rörliga reflexer garanterar inte korrekt geometri. Bristande överlapp, varierande exponering och olika optik ökar felrisken.
- GLB/glTF 2.0 kan bära PBR-material. En mer realistisk visuell finish kräver faktiskt korrekt geometri, normaler/UV, roughness/metallic, klarlack, gummi, glas och bra miljöbelysning, plus mobilanpassad storlek.
- En fotorealistisk renderad bild är inte ett oberoende bevis för att mesh och fälgar är rätt.

**Tekniska källor (bakgrund, inte produktgodkännande):**
- NHTSA vPIC, VIN-decoding: https://vpic.nhtsa.dot.gov/decoder
- Autodesk fotogrammetriråd: https://www.autodesk.com/support/technical/article/caas/tsarticles/ts/52TspXEV098QBNNf1FQbkG.html
- Khronos glTF 2.0/PBR: https://www.khronos.org/gltf/pbr/
- Khronos clearcoat: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_clearcoat/README.md

## 3. Föreslagen arbetsordning och verkliga beslut

### Gate A — exakt bilidentitet och tillåtna originalbilder (P0)

**Inga uppladdningar till produktion i denna fas.**

- Ägarskapsbunden `projectId`, `listingId`, `captureId` — intern identitet, inte fritt URL-namn.
- Manuellt dokumenterad bilidentitet: fabrikat, modell, modellår, trim, lack och fälgar. Dekodning får aldrig fylla i obelagda egenskaper som om de vore verifierade.
- Rättighetsattest från behörig bilägare/handlare, namn och tidpunkt.
- Minst **sex obligatoriska fotobevis**: front 3/4, sida, bak 3/4, motsatt främre sida, närbild på hjul, foto av trim/utförandemarkör. Fotona är minsta material för *granskning*, inte tillräckligt för helautomatisk 3D-rekonstruktion.
- Varje foto: original-flagga (attest, inte verifiering), SHA-256, format, pixelstorlek, antal bytes, insamlingstid och privat, innehållsadresserad lagringsreferens som måste matcha projekt/listning/capture.
- Avvisning vid saknad vinkel, återanvänd hash, fel ägare/path, otillåtet ursprung, syntetiskt foto eller orimliga metadata.
- Returstatus får vara **`ready_for_human_review`**, aldrig `real_vehicle_verified` eller `publishable`.
- Implementerat som lokal ren funktionsgrind i `apps/web/lib/website-build/vehicle-verification/capture-intake.ts` med fokuserade tester. Den kontrollerar *inte* filbytes eller behörigheter i en lagringstjänst ännu.

### Gate B — oberoende lagring, hash och materialrätt (P1)

- Privat Supabase Storage-/annan tillgångslagring för originalfoton och versionslåsta metadata. Ingen publikt listbar bucket.
- Serversidan hämtar faktisk upload via projektägarskap/RLS eller motsvarande och re-hashar bilden. Foto-ID och bytes måste bindas till en specifik annons/version och tillåten licens.
- Kontrollera att påstådda kameraoriginal inte är AI-syntetiska eller redigerade, med mänsklig QA där automatisk teknik inte kan avgöra sanningen.
- En riktig verifiering kan bara startas från tjänstens egna persistenta evidens, inte från en godtycklig klient-JSON.

### Gate C — välj presentationsväg först, modellframställning sedan (P1)

**Spår 1 – riktig fotografisk 360 (prioriterad första kundpilot):**
- Fotografera faktiska bilen i konsekvent ljus och jämna vinklar; bearbeta och visa med tydlig etikett `360° foto – faktisk lagerbil`.
- Ingen fri kamera/mesh. Får användas innan verifierad GLB finns och ger bättre sanningshalt än gissad 3D.

**Spår 2 – 3D av exakt bil:**
- Börja med tillåten, identifierad CAD/OEM-/leverantörsmodell och kontrollera samma trim, fälg, kaross och lack mot de verkliga fotona. Saknas licens/källa går spåret inte vidare.
- Alternativt fotobaserad rekonstruktion av större, överlappande bildserie från den *samma* fysiska bilen, kompletterad med manuell geometri- och materialbearbetning där blanka ytor misslyckas.
- Eventuell generativ modell får hjälpa till att ta fram förslag, men dess geometri klassas fortfarande `ai_inferred` tills det finns oberoende bevis, rätt källa och en separat publiceringsgrind.
- Alla externa modell-/Higgsfield-/CAD-/scanning-anrop priskontrolleras och kräver ett explicit nytt godkännande. Ingen kredit får förbrukas bara för att ett foto hämtats.

### Gate D — riktiga bilder jämförs med fixvyer (P2)

- Rendera GLB från fyra låsta kameravinklar, bundna till den specifika källversionen (GLB SHA).
- Granska åtminstone kaross, fälgar, färg, utrustning/trim, lyktor och andra synliga detaljer mot originalfoton. Delar som inte kan verifieras märks *osäkra*, aldrig tyst som korrekta.
- Auktoriserad person granskar båda bilderna, jämförelselogg och licens, godkänner eller avvisar. Ett `true` i klient-JSON är inte tillräckligt.
- Persistensbunden och serverattesterad granskaridentitet, version, hash, beslut och tid, utan möjlighet att en användare själv fabricerar en signerad attestation.
- Befintliga `evaluateRealVehicleEvidence` är bara strukturell preflight. Dess utfall heter `PreflightPassed`, INTE verifierad produktionssanning.

### Gate E — grafik, prestanda och säker leverans (P2)

- Jämför båda renderingar mot verkliga referenser i samma kameravinklar. Rätt kontur och typ av hjul är viktigare än glans.
- PBR: bilens lack/klarlack, glas, gummi, strålkastare, fälgar samt miljöljus och skuggor. Assetstorlek, bildtexturer, GPU och mobil/försämrad anslutning ska kontrolleras i verklig Chromium.
- Om nätverk, WebGL eller GLB misslyckas: visa foto-360 eller poster, tydligt namngiven, utan att låsa användaren.
- HTML/modellruntime får inte ladda modellgenererad JavaScript eller externa CDN-skript.
- Bara ägarkontrollerade versioner får kunna publiceras. Avpublicering/rollback måste alltid vara möjligt.

## 4. Acceptans och releasegränser

En bil går endast vidare till **verifierad 3D** om:
- [ ] Ägande, användningsrätt och riktig fotoidentitet är kontrollerade serversidigt
- [ ] Alla originalbilder har oberoende hash och privat scoped lagring
- [ ] Identitet, lack, trim och hjul är dokumenterade och jämförda mot bilder
- [ ] GLB och poster bygger på samma tillåtna och granskningsbara fordonskälla
- [ ] Renderad front/sida/bak/motsatt sida är manuellt granskad
- [ ] Auktoriserad granskarattestation är knuten till hash, listing, projekt och revision
- [ ] Säkerhet/RLS, webbläsare och mobil 3D/fallback har testats
- [ ] Ägaren har separat godkänt budget och faktisk publicering

Misslyckad grind => `Refused/ReviewRequired`. Lägg **inte** automatiskt en koncept-GLB på en riktig annons. Första riktiga piloten kan visa en korrekt fotobaserad 360 utan fri 3D tills alla verifieringar uppfylls.

## 5. Avgränsning av den här utvecklingsomgången

- Skapa P0 typed fotointag med fail-closed strukturvalidering och tester.
- Förtydliga existerande real-vehicle-preflight så att den inte går att missta för publiceringsgodkännande.
- Ingen uppladdningsfunktion, databas- eller annonseringsintegration, betald modell, produktionsflagga, kunddata eller faktisk ny 3D-modell i denna omgång.
- Fortsätt i **befintlig** `codex/atlas-builder-references-20261017` / PR #368, utan ny PR, main-merge eller production-release.
- Nästa tekniska beslut: designa privat originalbildslagring och autentiserad granskarlogg med en plan för pilot på en faktiskt fotograferad bil. Beslut om första riktiga fordonet tas separat från denna kodgrind.
