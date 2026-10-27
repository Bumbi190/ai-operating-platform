# The Prompt — hybrid reel rendering and canonical MP4 selection

**27 October 2026 · Draft PR #558 · Code preparation only.** No production deploy, paid Higgsfield generation, database migration, changed cron or social publishing.

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
- Existing four pre-approved MP4 source clips remain under `Projects/Theprompt/Nyheter/Provreel-20261022`; they have **not** been inserted into canonical storage by this PR.

## Release and generation remain gated

1. PR #552 is a separate **draft** containing the shared conservative 5 kr/Swedish-day Higgsfield budget. Its production migration remains **unapplied**, and `HIGGSFIELD_PAID_VIDEO_ENABLED` stays OFF. Do not bypass Omnira's migration guard or treat the allowance as a provider invoice cap.
2. Independently review PR #558, particularly asset ownership, canonical storage, private URL lifetime and Remotion timing. No production merge until a full real-file render and broad compatibility checks pass.
3. Establish an editorially approved, revision-bound script → asset-ID assignment. Verify/canonicalize one existing approved MP4 for a **non-billable render** before attaching a live producer.
4. Add a narrow Higgsfield generation adapter only after #552 coordinated release: exact current cost quote, durable reservation before the sole authorized dispatch, no ambiguous retry, job/usage receipt, canonical MP4 admission and reviewed fallbacks.
5. Wire only reviewed videos into the authorized render path and hold a bounded manual publishing trial. Existing image-reel times (10:00 and 20:00) and legacy image generation remain untouched until the operator explicitly activates the new mode.

**Product limitation:** With a conservative allowance of 1 SEK/credit, the previously quoted four-credit/four-second model permits at most one such new clip per Swedish day. Two full AI-video reels per day are not supported by this budget; a hybrid/image fallback remains essential.

## 27 oktober — tillägg: inlåst förkontroll och gated privat MP4-import

Den nya, helt isolerade `apps/web/scripts/theprompt/`-modulen låser originalfilerna till exakt full SHA-256 och verifierar MP4-container, 720×1280-upplösning, 4042 ms per fil och byteantal. De fyra verkliga lokala filerna klarade förkontrollen **4/4**. MP4-/importsuiten kördes med **12/12 godkända tester**, inklusive en simulerad import med de riktiga filernas bytes och ett negativt fall där felaktigt fjärde klipp stoppar alla skrivningar.

En särskild `--apply`-grind är OFF som standard och kräver separat miljöflagga, förväntat projekt-ID och korrekt Omnira-Supabase-host. Den blockerades korrekt i ett negativt på-datorn-test. En framtida riktig import ska använda befintliga `admitAssetBytes`, lagra i privat `media-assets-private` med både Asset-ID och historiskt ursprung utan att skapa nya kostnadshändelser. Ingen server-/react-server-integration, produktionsuppladdning eller fullständig Remotion-render är ännu genomförd.

Läs den fullständiga operatörsbeskrivningen i `apps/web/scripts/theprompt/README.md`. Den skyddade produktionens läsande katalogkontroll visade `0` tidigare videorader och `0` objekt i importprefixet. De godkända klippen finns fortfarande endast lokalt; PR #558 ska inte mergas förrän import- och renderkraven är granskade.

## 27 oktober — nästa uppdatering: fungerande betrodd Node-serverstartare (read-only prover)

Den tidigare direkta Node-processen kunde inte importera Nexts \`server-only\`-moduler. Ett nytt, separat \`run-approved-import.cjs\` reparerar det **endast för lokal betrodd Node-körning**: esbuild kompilerar den verkliga kanoniska \`admitAssetBytes\`-koden och behandlar Nexts servermarkör som tom i denna speciella CLI. Det påverkar inte webbens bundling eller behörighetslogik.

- \`--link-check\`: PASS. 50 kod-/beroendemoduler analyserades offline i en isolerad miljö, utan databasanrop eller nycklar.
- \`--module-check\`: PASS. Kompilerad Node-process laddade \`createAdminClient\` och \`admitAssetBytes\` i rätt serverkontext utan att skapa någon klient eller exekvera en skrivning.
- \`run-approved-import.node-check.mjs\`: **7/7 PASS**. Anrop med \`--apply\` vägras utan operatörsgrind, rätt projekt-ID, korrekt Omnira-Supabase-värd och servernyckel; \`--apply\` kan inte kombineras med de fria testlägena.
- Normal förkontroll är fortsatt samma inlåsta fyra MP4-filer, helt offline och utan Supabase-variabler.
- Den riktiga importen är **fortfarande ej körd**. Den lokala arbetskopian saknar skyddad produktionskonfiguration; Vercel har relaterade produktionsvariabelnamn men deras värden har inte hämtats. Det finns ännu inga kanoniska MP4-tillgångar i produktion.
- Inga produktionsändringar, betalda Higgsfield-anrop, ny Remotion-render, sociala schemabyten eller merge görs i denna uppdatering. Oberoende granskning och en verifierad riktig import behövs före produktionsaktivering.

## GitHub-kontraktsgrind för ny importer- och hybridkod

`.github/workflows/theprompt-hybrid-safety.yml` läggs till som separat PR-grind för ändringar i denna funktion. Den kör **40** källfria tester på Node 22, vägrar databasmiljövariabler och kontrollerar att exakt **två** privatfilsberoende fall är överhoppade. Ett källfritt lokalt CI-genrep gav `42 tests / 40 pass / 2 skip / 0 fail`; med originalfilerna på Hultgren är `42/42` gröna. Det här är inte en oberoende kodgranskning och inte en riktig MP4-rendering eller produktionsimport.
