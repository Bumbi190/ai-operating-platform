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

## 6. P1a implemented: private-byte verification adapter contract (2 November 2026)

The new `private-capture-bytes.ts` is an **injected, pre-production server-side gate**. It does not make any live Supabase requests and is not exposed as an upload endpoint. It accepts only a structurally valid capture package, server-derived project allow-list, an independently authorized listing-to-project binding, and a private object reader. It then reads all six photos from the one fixed private bucket contract `vehicle-originals-private`, with a 15 MB per-file cap, checks actual bytes against declared lengths, basic file signatures and SHA-256 hashes, and returns only `bytes_checked_for_human_review`.

**No trust escalation:** this gate does not decode or visually inspect pixels, prove that declared dimensions match image data, prove camera originals/seller rights, validate the reviewer identity, sign evidence, or publish a 3D model. Header checks are not malware scanning or a complete decoder. The private reader, ownership SQL and bucket do not exist in production yet; those require an explicit separate implementation/release approval.

**Acceptansprover:** rejects cross-project access before any object read, unbound listing before reading, wrong private path, duplicated/synthetic metadata, missing storage, byte mismatches, fake signatures, altered actual SHA and provider failures. All decisions fail closed. Owner/project scope must come from the server's authenticated project-access layer, not client fields.

**Architecture decision:** start with owner-authenticated downloads from a private bucket. Supabase Storage buckets are private by default and Storage has separate RLS on `storage.objects`; signing or publicizing URLs is not an alternative to verifying per-project ownership for this workflow. Supabase recommends using Storage APIs rather than mutating `storage` metadata tables directly. References: https://supabase.com/docs/guides/storage/security/access-control , https://supabase.com/docs/guides/storage/buckets/fundamentals , https://supabase.com/docs/guides/storage/schema/design .

**Next implementation:** design the real listing-owner binding and private bucket policy against actual Omnira schema; do not assume Handlarbörsen's separate database is mounted in this project. Require a scoped RLS policy, an authenticated API with bounded download, independent image decoder/dimensions, file integrity and reviewer audit before any personal or dealer photo enters a production environment.

## 7. P1b — owner-session private Storage adapter + proposed SQL (2026-11-02)

**Implementation only, NOT activated.** Owner-session adapter `owner-scoped-storage.ts` binds an authenticated request's project access to an exact `website_vehicle_capture_listings` row (id, project_id, owner_id and `evidence_only` state) before allowing any original read. A per-request closure binds allowed project and listing. The only accepted paths are hash-addressed originals underneath the chosen project/listing. It downloads through `Supabase Storage.from('vehicle-originals-private').download(...)` with the authenticated **user** client, not service-role, public URLs or signed URLs. The 15 MB check runs before converting the returned Blob into an in-memory Uint8Array; an eventual bucket must independently enforce the same max file size because network transfer completes before the Blob exists.

The server-only, **not routed** `server-capture-review.ts` obtains the existing `resolveProjectAccess()`, then cross-checks the independent Supabase `auth.getUser()` identity before it creates the adapter. There is no public user endpoint and no DB write. The method returns only `bytes_checked_for_human_review`, never a real-vehicle approval. The storage adapter is currently testable via dependency-injected mocks, but a real user JWT/RLS integration test cannot run until the schema/bucket and read permissions have been separately reviewed and installed.

**SQL proposal:** `docs/sql/atlas-studio-real-vehicle-captures-p1b-proposed.sql`.
- Introduces a server-managed owner/project/listing binding plus immutable metadata for a private photo set. Both have RLS with **read-only** owner policies. No direct authenticated INSERT, UPDATE, DELETE policy is proposed.
- Proposes a read-only `storage.objects` policy for `vehicle-originals-private`, restricted to authenticated owner, a concrete photo record and `storage.allow_any_operation(['object.get_authenticated','object.get_authenticated_info'])`; denies listing or write operations *through this policy*. Existing policies still need auditing for OR-overlap before deployment.
- The actual **private bucket must be created using the Storage API**, not direct mutations of storage schema. The required 15 MB file limit, accepted image MIME types, and private access model are planned but have NOT been activated.
- PostgreSQL policies are a proposal and **were not executed, integration-tested, or applied**. Tenant A/tenant B, revoked listing, missing-photo-record, object-list, upload/upsert/move/delete and user-authenticated download tests must be run in isolated Supabase/PostgreSQL + Storage with the proposed policy before owner approval.
- The SQL intentionally does not generate or approve a visual model, identify license authenticity, decode pixels, or expose dealer data across the two separate Supabase projects.

The production migration, creation of a bucket, metadata writer, admin review, and first customer/car photo pilot are held behind independent budget, privacy and owner release gates.

## 8. P1d — actual image codec and pixel verification (2026-11-02)

Added `apps/web/lib/website-build/vehicle-verification/image-inspection.ts` and
a strict **new** entrypoint `checkPrivateVehicleCaptureImages()` in
`private-capture-bytes.ts`. The disabled/unrouted server review entrypoint now
uses the *pixel checked* variant; the former bytes-only function remains explicitly
named and returns only `bytes_checked_for_human_review`, never real-car verification.

**Order of trust checks:** validate input metadata and ownership; confirm exact
listing/project binding before any private download; read six separately scoped
originals with per-file byte cap; verify format signature and content SHA-256;
then decode each image with pinned Sharp 0.34.4. Only after all six complete does
the result become `pixels_checked_for_human_review`.

**Pixel safety:** enforce JPEG/PNG/WebP actual decoder format, exact declared
width/height, minimum side 480, maximum side 8192, maximum 12 million pixels,
15 MB compressed input limit, max four channels, no animated/multi-frame image,
no unnormalized EXIF rotation, fail-on-warning decode. Running Sharp's
`metadata()` alone is insufficient: the validator calls `stats()` to force a
full pixel decode and reject truncated/invalid image payloads. The multi-frame
metadata probe explicitly loads all pages in metadata to avoid the normal Sharp
default of silently selecting only the first frame. It performs no remote
fetch, no image generation and no public upload.

**Local automated verification:** 50/50 focused vehicle verification Vitest
tests PASS, including genuine synthetic PNG/JPEG/WebP, six-photo pipeline,
wrong dimensions, forged-but-rehashed corrupt PNG, EXIF rotation, real animated
two-frame WebP and a very compressed 16-million-pixel image refused under the
12-million-pixel budget. Targeted TypeScript compile PASS. No customer images
were read. Exact commit CI, hosted deployment status and any broader
regressions must be verified separately before release.

**Not authenticated physical proof:** pixel verification cannot attest the
actual pictured car, faked EXIF, time/place, rights, damage, trim or wheels.
Those remain a human-review and source-provenance gate. The code is STILL NOT
on any production upload route; existing Demo Motors remains fictional.

## 9. P2a — evidence-bound reviewer audit contract (2026-11-02)

**Status: pure server-bound contract, NOT an HTTP endpoint or installed audit database.**

Added `apps/web/lib/website-build/vehicle-verification/review-audit-contract.ts`
with injected server-only capabilities for (1) trusted reviewer assignment,
(2) reading an **immutable evidence snapshot** of the correct project, listing,
photo capture, GLB and its revision, and (3) an **atomic append-if-current**
audit writer. The untrusted, client-supplied checklist never authorizes any
publication even if every checkbox says `matches`.

**Fail-closed gates:**
- Project ID must be in the server-derived owner's allowed project scope, and
  the server-identified reviewer must have a separately recorded assignment
  to the exact listing. The source of this assignment must be privileged,
  versioned, and never taken from user-editable JWT metadata.
- The snapshot must come from trusted server persistence, indicate completed
  six-image pixel review, include all six distinct source hashes and four
  render-image hashes bound to exact camera views, have a specific immutable
  GLB SHA, and a UUID evidence revision ID.
- Submitted client-side source and render hashes must match that independently
  loaded snapshot exactly. Changed model, stale capture or swapped images
  are rejected before any audit write.
- The reviewer identity, event ID and timestamp are generated by the server,
  not taken from the client. Client `approved`, `publish`, `reviewerRole`,
  `reviewerId` and other attempted authority fields are refused outright.
- Difference => `revision_required`; uncertainty =>
  `additional_evidence_required`; all claimed matches =>
  `human_review_required`. The only stored-event result is explicitly
  `review_recorded_not_approved`, never verified/publishable.
- The audit event includes a deterministic SHA-256 digest of fixed fields,
  a separate normalized snapshot digest and exact revision. These hashes
  provide **integrity references, not cryptographic signatures or proof of a
  real human**. An eventual trusted server/DB append writer must persist
  append-only, enforce unique `eventId`, and **atomically recheck** reviewer
  authorization + evidence revision + project binding during the INSERT, so
  a race cannot authorize a stale or foreign record. No unsafe SELECT-then-INSERT
  is acceptable. A revision conflict, duplicate, authorization removal or
  persistence outage must return refusal.

**Verification:** local Vitest includes 12 audit-boundary tests covering true
server-side reviewer ID, missing project rights, unassigned reviewer, fake
client approval, tampered photo/render hashes, changed GLB, stale capture,
unverified source pixels, missing camera evidence, correct wheel-difference
and uncertain-paint outcomes, atomic conflict/duplicate/revoked assignment,
corrupt trusted DB records and provider outages. Together with existing
vehicle-verification suites the local total is **74/74**, targeted strict
TypeScript PASS. CI on the exact pushed SHA remains a separate release gate.

**Still prohibited:** production SQL for reviewer tables, an actual audit
writer/route, any reviewer action in the UI, real customer photographs,
a public 'Verified' label or automatic publication. Next deliverable is a
separate **reviewed SQL proposal and isolated A/B/immutability tests** for a
durable reviewer-assignment and append-only audit table, followed by actual
backend session integration and owner-authorized visual comparison. The current
Demo Motors review page stays explicitly fictional/read-only and its Approve
control remains disabled.

## 10. P2b proposed append-only reviewer database + isolated SQL verification

**Implementation only (2 November 2026), NOT applied to any real Supabase DB:**
`docs/sql/atlas-studio-real-vehicle-review-audit-p2b-proposed.sql`
contains an owner/project/listing-bound reviewer-assignment table, an
append-only immutable revision table, a separately mutable `current`
revision pointer and an append-only inspection event table. The event
table accepts ONLY the three non-approval outcomes
`human_review_required`, `revision_required` and
`additional_evidence_required`. Each event is bound to
reviewer, listing, capture, GLB SHA, immutable revision ID, evidence digest
and deterministic event checksum.

The event writer `website_review_private.append_pending(...)` is
`SECURITY INVOKER` in a non-exposed schema. Its EXECUTE privilege is
granted only to `service_role`. No signed-in or anonymous user may read
or write these tables directly. The function checks actual project ownership,
active reviewer assignment and current evidence revision using `FOR SHARE`
row locks that conflict with concurrent revocation or revision-change UPDATEs.
Duplicate `event_id`, changed GLB hash, stale revision, foreign reviewer,
invalid/expired server timestamp and revoked assignment are rejected.
Immutable evidence rows and audit events cannot be UPDATEd or DELETEd.

**Verified in isolated PostgreSQL 17 on Hultgren:** existing
`scripts/verification/run-vehicle-capture-rls.ps1` now also executes
the complete proposed audit SQL and two synthetic-owner assertion scripts.
There is no network, port, host mount or customer record; Postgres is
memory-limited to 192MB, and the disposable container is removed.
The test passed on synthetic owner A/B, exact-event replay, source/GLB swap,
stale revision after switching the current pointer, assignment revocation,
and audit/revision mutation refusal. A one-hour stale timestamp was refused.
Exact fixture: `docs/verification/web-studio/vehicle-review-audit-*.sql`,
proof log: `vehicle-review-audit-proof.md`. The preexisting CI Studio
job now runs these SQL assertions as part of its isolated RLS step.

**Important limits:** These tests are PostgreSQL-only. A true concurrent
two-connection interleaving test, hosted Supabase RLS, actual source-photo
origin and license verification, reviewer-session binding, production audit
persistence and actual customer UI acceptance remain unverified. A trusted
backend must independently verify reviewer ID from the authenticated
session; `service_role` can impersonate reviewers and must NEVER be
exposed to a browser. The SQL function in a private schema is NOT callable
as an ordinary public `supabase-js.rpc` endpoint and requires a
separately designed, reviewed backend database writer. An event hash is not
a digital signature. No public `approved`/verified label, customer
Storage, 3D-generating provider, SQL migration deployment or owner
publication permission was created.

## 11. P2c — concurrent PostgreSQL audit/revision/revocation proof (2026-11-02)

Added `scripts/verification/vehicle-review-race.mjs` to the existing
disposable, network-none, 192 MB `postgres:17-alpine` test runner. The
script opens **two independent interactive psql sessions**, observes a real
PostgreSQL row-lock wait in a third query, then releases the winning
transaction to verify the result. This is not just sequential SQL.

Five independently verified scenarios (each PASS locally):
- revision change commits first; old audit is refused as stale;
- reviewer assignment is revoked first; audit is denied;
- pending audit acquires the row lock first; model switch waits for commit;
- underlying vehicle listing is revoked first; audit is denied;
- project ownership transfers first; old review is denied.

To close the two additional TOCTOU windows, the private
`append_pending` SQL proposal now locks the project owner and active
listing under `FOR SHARE`, as well as the current model revision and
reviewer assignment. PostgreSQL requires UPDATE privilege for these row
locks; the privileged, non-browser `service_role` alone receives
narrow column grants on project owner and listing state. No new client
privileges or hosted DB changes. The local suite returned exit 0
and cleaned the disposable container.

The script refuses use outside its labeled, PID-scoped, network-none
fixture container, and CI is configured to run it whenever this
script or SQL changes. Exact proof and limits:
`docs/verification/web-studio/vehicle-review-audit-proof.md`.
The separate production-auth reviewer bridge, cryptographic attestation,
visual car-identity comparison, real photos and approval remain
**unimplemented**; do not mistake an append-only *pending* event
for a verified or publishable 3D vehicle.
