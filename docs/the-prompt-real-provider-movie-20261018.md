# The Prompt — actual provider movie, 18 October 2026

## Actual result

The owner signed into the protected preview and completed the single existing attempt at 06:14 UTC / 08:14 Stockholm. On resuming, the page already held three generated images and Victoria audio. No second batch was requested.

Preview identity: 194592d0-57b0-5980-a01c-dc9fad5e39eb. Persisted row remains pending_review / private_preview, with the private state ready and no legacy voice/video delivery fields populated. Three internal active image assets and one internal active audio asset are in media-assets-private.

Asset IDs:
- Images: 54e2680b-e770-4488-ab14-11df6f3eaa49, 740be12c-5cbf-42ea-a050-578bf8ac8166, 81d4263b-6d7d-46bf-b184-5e959be89c05.
- Audio: b7bb7717-3478-4408-a972-a7fc54d92f3b.
- Canonical Victoria qSeXEcewz7tA0Q0qk9fH / eleven_turbo_v2_5; 29,721 ms; 73 timed words. Normalized timing transcript matches the full reviewed manuscript.

Registered cost_events: Ideogram 3 images = 2.5200 SEK, ElevenLabs 1 narration = 1.1870 SEK, OpenAI scene planning = 0.0308 SEK. Total 3.7378 SEK against the 12 SEK cap. Primary Anthropic planning reservation was released; existing OpenAI fallback completed. This is the application cost ledger, not an independently reconciled vendor invoice or remaining credit balance.

## Encoded movie

The-Prompt-Anthropic-privat-videoprov.mp4: 6,593,523 bytes, SHA-256 9cae243419e5530cb62d28f5d281c610021795ac2fe48d9661e41585c6a0a18a. H.264/AAC, 720 x 1280, 30 fps, 32.75 seconds container duration (29.721-second narration plus three-second outro and encoding alignment).

Actual canonical private assets were downloaded with all four byte lengths/checksums checked, then rendered through ThePromptDailyPilot. Twelve automatically planned full/close shots, English word captions, AI ILLUSTRATIONS disclosure and FOLLOW THE PROMPT outro. No paid regeneration during rendering.

Full audio/video decode PASS. Encoded frames extracted at 0.5, 3.8, 10.5, 16, 21, 28 and 31 seconds; opening, all three images and outro inspected. The images are illustrative concepts, with synthetic document/screen details; they are not documentary photographs. No claim of human full-clip listening or final release approval.

Private delivery saved as libfile_8442569fec9c819191ad1d641a5222db, filename above. Local transfer checksum matches the remote export. QA files remain outside Git.

## JSONB readback regression and correction

The first successful generation response displayed correctly, but a later authenticated status refresh returned PREVIEW_UNAVAILABLE. A real persisted row showed JSONB had reordered word object properties to word/endMs/startMs. The receipt had hashed JavaScript insertion order word/startMs/endMs, so unchanged timings failed verification.

Proved against the actual persisted receipt: raw JSONB serialization does not match; projection of the same word/start/end values in canonical order matches the EXISTING receipt exactly. No database row or old receipt was rewritten.

Added a real JSONB-order round trip to the runtime/store integration test and object-key reorder regressions to receipt creation and stored-voice verification. All three failed for the expected digest/readback error before the fix. Creation and both verification paths now use one canonical word/start/end projection. Word sequence, text and actual times, audio checksum, voice/model, ownership and private placement remain checked.

Final checks: 131/131 complete Remotion Node/tsx tests, both isolation contracts, 334/334 scoped web regressions and full web TypeScript PASS. Real updated server runtime inspect was executed TWICE against the existing database row, with actual asset lookup and signing: ready both times, identical four asset IDs; four signed downloads again matched lengths and checksums. This was authorized operator CLI readback, not an HTTP cookie/session retest. No generate() call, second batch or schema change.

The original deployed URL at source commit 29892db still has the old digest behavior. A corrected preview deployment must be checked separately; a READY build alone is not an authenticated browser retest. The old export download already existed in the owner's Downloads; the browser download event observer timed out, so the validated existing file was used instead of starting more jobs.

## Next release gate

The owner accepted the prior v2 visual direction and now the three provider images. The exact new encoded movie, including its sound/caption tempo, still needs review before release authority. The seven-day trial remains NOT STARTED. Production composition/release/rollback, trusted usage/source/voice receipts, DST-safe 10/20 scheduler and prospective per-platform 24h/72h measurement remain required.

Original source: https://www.anthropic.com/research/employment-at-anthropic, originally 16 October 16:26 UTC. Expires for fresh-news generation 18 October 16:26 UTC / 18:26 Stockholm, before today's 20:00 slot. Later coverage does not refresh it. Existing private results can still be reviewed after expiry.
