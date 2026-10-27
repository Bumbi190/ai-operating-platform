# The Prompt — hybrid reel rendering and canonical MP4 selection

**27 October 2026 · Draft PR #558.** Current state: four previously approved MP4s privately imported and byte-verified in Omnira's canonical storage. No code production deployment, paid Higgsfield generation, SQL migration, scheduling change or social publication. Earlier sections below record pre-import checkpoints; the final section records the verified import and new preview endpoint.

## Existing renderer support (09df0e6)

- `SimpleNewsReel` optionally accepts index-aligned MP4 scenes while retaining its four/five approved image fallbacks, smooth transitions, continuous slow zoom, voice, captions, watermark and outro.
- Valid clips play muted at fixed `playbackRate` (0.25–2), without replaying the same clip to fill a scene. The image is retained below the video. A decode/render failure must be investigated, not auto-published.
- `buildVideoInputProps` accepts optional `sceneVideos`; calls that omit them retain the exact old image-only payload.
- No live API, cron, Lambda invocation or publisher requests a video yet.

## Canonical project-owned clip selection (follow-up)

- `project-video-slots.ts` is a pure, read-only selector. A future *authorized* server route may supply one canonical Asset UUID or `null` per approved scene. A `null` or omitted selection intentionally uses the existing still image.
- **Every non-null asset is validated before a delivery URL is minted**: ID identity, exact project owner, active video, MP4 MIME, 9:16 dimensions, bounded duration, checksum, byte size, public/private bucket and safe storage path. It refuses duplicate video UUIDs and slot misalignment.
- Foreign-project, missing, inactive, wrong-type or suspicious assets **fail closed**; they are not silently remapped to another project or arbitrary video URL. Even a valid first scene receives no signed URL if a later scene is invalid.
- `project-video-slots-server.ts` binds the selector to the existing canonical `getAsset` and the trusted `publicDeliveryUrl` / `signedAssetUrl` helpers. Private delivery URLs expire after 3600 seconds and must never be persisted as identities or logged.
- This is deliberately **not connected to render/start yet**. The future calling route must first authorize the exact saved script and project, enforce its editorial review state, and select the version-bound asset IDs. The pure selector cannot establish user permission or editorial approval by itself.
- No provider `generate_video`, paid quote, retry, storage write, SQL mutation or publication entry point was added.

## Verification on Hultgren (isolated worktree)

- `node --experimental-strip-types --test apps/remotion/src/lib/hybrid-scenes.node-check.mjs`: **8/8 pass**.
- `node --experimental-strip-types --test apps/web/lib/media/video-props-hybrid.node-check.mjs`: **2/2 pass**.
- `node --experimental-strip-types --test apps/web/lib/media/project-video-slots.node-check.mjs`: **13/13 pass**, including cross-project refusal, duplicate scenes, invalid metadata, unsafe URLs, signer failures and canonical asset → Remotion props.
- **23/23 focused, non-billable tests passed** across these files (when each suite last ran).
- TypeScript `transpileModule` syntax checks passed for six new/modified TS/TSX files. The pure `project-video-slots.ts` TypeScript module and its type-only canonical Asset dependency pass a **strict no-emit typecheck**. These are *not* a full workspace typecheck.
- No complete Remotion render has been run. Remotion is not installed in this worktree, and Hultgren reported ~1.1 GB of 15.8 GB RAM free when checked; installing/rendering there now would create unnecessary pressure.
- Four original MP4s remain locally in `Projects/Theprompt/Nyheter/Provreel-20261022`. Their private canonical import was completed separately after the original code-only checkpoint (see latest audit below).

## Release and generation remain gated

1. PR #552 is a separate **draft** containing the shared conservative 5 kr/Swedish-day Higgsfield budget. Its production migration remains **unapplied**, and `HIGGSFIELD_PAID_VIDEO_ENABLED` stays OFF. Do not bypass Omnira's migration guard or treat the allowance as a provider invoice cap.
2. Independently review PR #558, particularly asset ownership, canonical storage, private URL lifetime and Remotion timing. No production merge until a full real-file render and broad compatibility checks pass.
3. Establish an editorially approved, revision-bound script → asset-ID assignment. Verify/canonicalize one existing approved MP4 for a **non-billable render** before attaching a live producer.
4. Add a narrow Higgsfield generation adapter only after #552 coordinated release: exact current cost quote, durable reservation before the sole authorized dispatch, no ambiguous retry, job/usage receipt, canonical MP4 admission and reviewed fallbacks.
5. Wire only reviewed videos into the authorized render path and hold a bounded manual publishing trial. Existing image-reel times (10:00 and 20:00) and legacy image generation remain untouched until the operator explicitly activates the new mode.

**Product limitation:** With a conservative allowance of 1 SEK/credit, the previously quoted four-credit/four-second model permits at most one such new clip per Swedish day. Two full AI-video reels per day are not supported by this budget; a hybrid/image fallback remains essential.

## 27 oktober — tillägg: inlåst förkontroll och gated privat MP4-import

Den nya, helt isolerade `apps/web/scripts/theprompt/`-modulen låser originalfilerna till exakt full SHA-256 och verifierar MP4-container, 720×1280-upplösning, 4042 ms per fil och byteantal. De fyra verkliga lokala filerna klarade förkontrollen **4/4**. MP4-/importsuiten kördes med **12/12 godkända tester**, inklusive en simulerad import med de riktiga filernas bytes och ett negativt fall där felaktigt fjärde klipp stoppar alla skrivningar.

En särskild `--apply`-grind är OFF som standard och kräver separat miljöflagga, förväntat projekt-ID och korrekt Omnira-Supabase-host. Den blockerades korrekt i ett negativt på-datorn-test. Vid detta första checkpoint var importen ännu inte genomförd. Senare under dagen kördes den skyddat mot rätt projekt och fyra privata Asset-ID verifierades efteråt. Ingen fullständig Remotion-render är ännu genomförd.

Läs operatörsbeskrivningen i `apps/web/scripts/theprompt/README.md`. Katalogkontrollen före importen visade 0 tidigare videorader och 0 objekt i importprefixet. Efter importen finns nu 4 privata objektrader och 4 aktiva Asset-ID. PR #558 ska inte mergas förrän den nya granskningsvägen och renderkraven är verifierade.

## 27 oktober — nästa uppdatering: fungerande betrodd Node-serverstartare (read-only prover)

Den tidigare direkta Node-processen kunde inte importera Nexts `server-only`-moduler. Ett nytt, separat `run-approved-import.cjs` reparerar det **endast för lokal betrodd Node-körning**: esbuild kompilerar den verkliga kanoniska `admitAssetBytes`-koden och behandlar Nexts servermarkör som tom i denna speciella CLI. Det påverkar inte webbens bundling eller behörighetslogik.

- `--link-check`: PASS. 50 kod-/beroendemoduler analyserades offline i en isolerad miljö, utan databasanrop eller nycklar.
- `--module-check`: PASS. Kompilerad Node-process laddade `createAdminClient` och `admitAssetBytes` i rätt serverkontext utan att skapa någon klient eller exekvera en skrivning.
- `run-approved-import.node-check.mjs`: **7/7 PASS**. Anrop med `--apply` vägras utan operatörsgrind, rätt projekt-ID, korrekt Omnira-Supabase-värd och servernyckel; `--apply` kan inte kombineras med de fria testlägena.
- Normal förkontroll är fortsatt samma inlåsta fyra MP4-filer, helt offline och utan Supabase-variabler.
- Vid detta checkpoint var riktig import ännu inte körd. Senare verifierades befintliga lokala serverbehörigheter utan att avslöja nyckelvärden, och de fyra filerna importerades i privat lagring. Aktuella kvitton och verifiering återfinns längre ner.
- Inga produktionsändringar, betalda Higgsfield-anrop, ny Remotion-render, sociala schemabyten eller merge görs i denna uppdatering. Oberoende granskning och en verifierad riktig import behövs före produktionsaktivering.

## GitHub-kontraktsgrind för ny importer- och hybridkod

`.github/workflows/theprompt-hybrid-safety.yml` läggs till som separat PR-grind för ändringar i denna funktion. Den kör **41** källfria tester på Node 22, vägrar databasmiljövariabler och kontrollerar att exakt **två** privatfilsberoende fall är överhoppade. Ett källfritt lokalt CI-genrep gav `43 tests / 41 pass / 2 skip / 0 fail`; med originalfilerna på Hultgren är `43/43` gröna. Det här är inte en oberoende kodgranskning och inte en riktig MP4-rendering eller produktionsimport.

## 27 oktober — korrigering av sista scenens slutbild

Vid jämförelse med det verkliga sparade provmanuset observerades **28 049 ms berättarröst och tre godkända bildplatser**, medan fyra separata original-MP4 finns på Hultgren. Det finns inget annat just nu färdigutrustat fyrabildsmanus i The Prompts mediedata. Därför försöker PR #558 inte tyst koppla fyra MP4 till tre bilder; den oförändrade projektägda slotgrinden blockerar denna felmatchning. Detta är endast en läsande observation.

En ren, offline 3-scensberäkning identifierade även att tidigare hjälplogik sträckte sista videoklippet genom filmens 75-frames-slutkort. Hjälpfunktionen använder nu **contentFrames** i stället för hela videons sluttid för sista videon. Nytt regressionstest går grönt och slutscenen stannar korrekt vid frame **797/872** i testfixturen, med jämnare uppspelningshastigheter **0,437 / 0,419 / 0,437** i tre scener. Med de verkliga lokala klippen passerar nu **43/43** riktade tester; CI utan privata filer förväntar **41 pass / 2 överhoppade**. Ingen färdig reel har renderats eller publicerats.

## 27 October — actual private import and signed-byte readback

The approved four original Grok/Higgsfield MP4s were imported through the operator-gated local CLI using the existing Omnira server configuration. No key values were copied or printed. A separate production SQL read verified one active video Asset and one provenance row per clip, with correctly owned project ID, 720×1280 dimensions, 4042 ms duration, original SHA-256 hashes, visibility=internal, and publicationApproved=false. Four corresponding objects exist in media-assets-private.

| Original | Canonical Asset ID |
| --- | --- |
| scene-0.mp4 | 30e4b399-d3f4-4aec-9dc9-4f468c413b69 |
| scene-1.mp4 | d806c254-0b22-46be-abb9-a52310eb6af7 |
| scene-2.mp4 | dda65355-c200-4a41-a1ff-12f7da10e637 |
| scene-3.mp4 | 069bac8a-9c88-4f41-b872-7fdcde33a992 |

The actual stored bytes were downloaded privately once more and hashed: 4/4 byte-perfect matches. Each asset could also be read using a temporary signed URL, which was never logged or persisted. Neither provider spend nor social publishing was performed.

## 27 October — owner-only hybrid preview render INPUT (not MP4)

New owner/project-scoped GET endpoint at /api/media/hybrid-preview/[scriptId] accepts exactly one video_asset_id per saved image scene (or "-" for still fallback). Platform operator identity and project ownership are both verified; the endpoint is also pinned to The Prompt's project. It uses the existing canonical asset selector and issues short-lived private video URLs only after checks. It returns synchronized Remotion input props, published-source status and explicit canGenerate=false, canPublish=false, canSchedule=false with private no-store headers.

The saved source script b0495f6b-9973-40dc-ae9b-156cc110ab51 is ALREADY PUBLISHED in the old image flow, with duration 28049 ms, 3 still images and ready audio/timing. The private video preview maps scene-0/1/2 to the first three imported Asset IDs, holds scene-3 for later, and must not create a second public post.

This API code remains in draft PR #558; no successful owner-authenticated live API request or full Remotion-rendered video is claimed yet. The 12 new offline validation tests cover request identity, alignment, duplicates, external/signed URL refusal and project-origin pinning. Regression CI is expanded to include them (55 cases total, 53 source-free/2 source-dependent in CI; 55/55 expected on Hultgren). The separate 5 SEK/day Higgsfield paid video budget PR #552 remains unmerged and generation stays OFF.

## 27 October — cloud compile smoke without workstation RAM pressure

RemotionRoot's old Studio default props still contained obsolete fields script/caption/theme and lacked the required captions and images fields of VideoInputProps. These have been reconciled to the typed renderer contract, without changing existing script data or media schedules.

The Prompt Hybrid Safety GitHub workflow now has a separate limited cloud CI job which installs the Remotion app's pinned dependencies and bundles the actual compositions via npm run build. It does not perform a render, retrieve private assets, call providers, charge Higgsfield credits or alter production. Its purpose is to catch a real bundler failure on the hybrid renderer without consuming Hultgren's very limited available RAM. This new cloud job still requires an exact-head GitHub result after push; a successful local code transpilation is not a substitute for this build.

## 27 oktober kväll – privat FFmpeg-prov på Hultgren

Ett 29,10 sekunders tekniskt lågupplöst MP4-prov skapades lokalt från tre tidigare godkända originalklipp, sparad röst och 19 undertextgrupper. Filen finns i `Projects/Theprompt/Nyheter/Provreel-20261022/preview-local/ThePrompt_Private_Hybrid_Preview_2026-10-27.mp4` (2 250 091 byte, SHA-256 e42174634a801aa5605fcb418810869a3e7409b7808fb5b897c955d27da9e2ab). H.264 360x640 30 fps, AAC mono. Hela filen dekodades utan FFmpeg-fel, ljudnivåer kontrollerades och tre stillbilder granskades. Denna första privata provfil har hårda scenbyten och ett enklare slutkort, inte Remotions färdiga crossfades eller slutkvalitet. Den har inte publicerats eller laddats upp publikt. Kanoniska klipp i Supabase och befintligt socialt bildflöde är orörda. Nästa steg: riktig Remotion-render med privata medier i skyddad körmiljö och manuell granskning.
