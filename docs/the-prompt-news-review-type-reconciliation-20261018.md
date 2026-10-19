# The Prompt: generated schema types and Remotion compiler correction

Continuation approved 18 October 2026 at 21:01 Europe/Stockholm. Main d3f9fcc1045026042f6bb9c0cd302ed0b7283127 was merged cleanly as b906b0d, with no application runtime change from that merge.

## Generated database types

The connected Supabase TypeScript generator was run against AI Operating Platform, iboepohjwrhtgshrqaol. Its actual output supplied only media_news_review_evidence and these seven public RPC definitions: media_news_canonical_json, media_news_review_caption, media_news_review_lock_inputs, media_news_review_prepare, media_news_review_read, media_news_review_requirements and media_news_snapshot_requirements.

AST comparison verifies every pre-existing public member is unchanged. This is a scoped canonical generated delta, not a replacement of unrelated schema definitions. Existing scoped JSON review contracts remain in use. No grants or SQL were changed. The exact approved SQL remains 35,199 bytes, SHA256 9cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52.

Fresh production SELECT observed review rows0, reserved admission provenance0 and migration-name count1. No real movie, evidence or decision was created.

## Compiler RED and correction

The complete Remotion compiler was actually run on both the feature and an independent exact-main snapshot, using the same installed dependencies. Before correction: feature32 error occurrences, baseline24. Eight own occurrences were in DailyPilot, its Root registration, NewsPreview, illustrated-shots and news-captions.

The fixes declare the ES2023 library used by the existing array APIs, explicitly type the numeric reduce accumulator and give the daily composition a mapped object props type. The latter preserves the named keys needed by Omit without widening the source interface with an index signature.

After correction: feature22 error occurrences, baseline24. All22 remaining occurrences also reproduce on exact main after normalizing source locations and dependency paths. Two old SubtitleTrack occurrences also disappear with the correct library. Full Remotion TypeScript therefore remains RED. The remaining source diagnostics are in the original Root/default props and render.ts, with additional shared installed dependency diagnostics; they are not silently waived.

Compiling both modified TSX files with comments removed produces byte-identical emitted JavaScript to b906b0d. The approved scenes, timing, smooth zoom, captions, audio and outro are preserved.

## Fresh verification

- Web review/content/publication, dispatch/authority and schema/security regression: **666/666 PASS**,31 files, no skips.
- Full web TypeScript after the generated delta: **PASS**, exit0.
- Remotion Node/tsx suite after compiler fixes: **142/142 PASS**, no skips.
- Both editorial/news isolation contracts: **PASS**.
- Complete Remotion compiler: **RED**,22 remaining occurrences, all reproduced on main; own delta8 to0.
- The core fixture passed actual SQL/RLS/fence/cancellation checks and used owned database website_test_1792351174396. Its final cleanup returned0.
- The separate complete web diagnostic and broader exact-main comparison remain running at this checkpoint. No fresh complete-web PASS or independent post-fix review is claimed.

## Boundary

Feature PR377 remains draft. No feature main merge, production application promotion, SQL replay, actual movie intake, paid generation, provider publishing, scheduler/account changes or weekly-trial activation.

Browser reached the feature deployment's Omnira login page; that origin requires owner sign-in before authenticated review. The Vercel fetch connector failed at deployment authentication, so its401 is not an application API assertion.

The old approved movie remains a technical sample after its original source age limit. Current-news evidence, authenticated end-to-end review, video transports, DST378, measurement383 and an explicit live-trial decision remain separate release work.
