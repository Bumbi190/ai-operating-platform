# Familje-Stunden — November teaser v3 (offline creative preview)

**Status:** Local creative preview awaiting owner review. NOT a scheduled or production-releasable pipeline.

## Project identity and isolation

- Only Familje-Stunden media; dedicated composition FamiljeStundenNovemberTeaser, 1080 × 1920 at 30 fps for 15 seconds.
- No The Prompt sources, cloud model calls, ElevenLabs, credentials, external uploads or automated publication.
- The Prompt's live creative development branch stays separately owned and is not modified.
- Copy reflects the actual 2026 November forest/Pling artwork. The older Marketing Bible has an outdated October/November theme mapping; it is not a release authority.

## Verified owner assets (SHA-256)

1. Hero: Worktrees/content-studio-nova-pling-20261017/public/images/months/november-preview.png
   SHA-256: 5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76
2. Activity: 00_Canonical/Game assets/November_Lov-och-Skuggmanaden_Activity_04_Board_Hjalp-Pling-genom-skogen.png
   SHA-256: ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b
3. Instrumental: Månads Teman 2026/Känslomånaden-V2/Social-content/Final/FINAL-v3-bygge/audio/music_bed_v2.wav
   SHA-256: 595fc8ea398d92bc0d2c6b0664fd9447da6e645a742a2116f90339bc6de21908

Source art and instrumental remain in Familje-Stunden, outside Omnira Git. The staging script verifies the exact hashes, then copies them only into locally ignored apps/remotion/public/content-studio-local/family-november/. Reuse of the September instrumental in a November public campaign still requires owner review.

## Reproduce on Windows (in the dedicated project branch)

From apps/remotion, run npm ci --ignore-scripts --no-audit --no-fund.
Then run node scripts/stage-family-november-preview.mjs.
Run node --test tests/family-november-preview-contract.test.mjs.
Render with Remotion CLI using composition FamiljeStundenNovemberTeaser, --codec=h264 --scale=0.5 --concurrency=2.

Current local draft: C:\Users\Andre\Videos\Omnira-Content-Previews\2026-10-17\familje-stunden-november-v3-preview.mp4

## Remaining release gates

- Editor must review actual November visuals, Swedish captions and the borrowed September instrumental.
- The known-good Nova WAV sample does not reveal an approved ElevenLabs voice ID; no new Nova dialogue is allowed.
- Pling Alternative B voice pin exists, but the required audio DSP is not yet implemented/verified for content studio; no new Pling dialogue is allowed.
- Do NOT mark November as already released before its actual release.
- Full-size final render, manual publication approval, destination ownership check and live publishing/scheduling integration are separate future steps.
