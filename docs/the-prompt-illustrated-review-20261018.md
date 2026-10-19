# The Prompt: illustrated review v2, 18 October 2026

## Owner feedback and change

Owner found the encoded text/motion sample good but boring: too little visible imagery and too little happening. This revision keeps the same source, 19.32-second Victoria narration, English word timing and three-second branded outro so visual treatment can be compared.

Three original cinematic editorial images were generated with the built-in image_gen tool for support triage, code inspection and human judgment. They are clearly marked AI ILLUSTRATIONS throughout the video. They are conceptual artwork, not evidence of real Replit offices, physical robots, people or product UI. No new voice generation, external image license purchase, production model API call or social publishing occurred.

The optional illustratedShots input on ThePromptDailyPilot enables eight deliberate camera cuts at real narration cues: 0, 2984, 5875, 8359, 11239, 13329, 14908 and 17102 ms. Alternating full and close image crops gives visible shot changes; lighter center treatment keeps subjects visible and the opening hook moves upward. These are animated still images, not generated video footage. All old default behavior is retained when illustratedShots is absent.

## Exact output

Full master is retained privately on the workstation:
C:/Users/Andre/Projects/Omnira/Design/ThePrompt-EditorialPreview-20261017/replit-illustrated-review-v2-20261018.mp4

It is 1080 x 1920 and 31,436,487 bytes. A mobile review copy was encoded at 720 x 1280, CRF 23 with the original AAC copied unchanged:
- File: The-Prompt-Replit-privat-videoprov.mp4 (new owner-review version).
- 5,675,696 bytes; duration 22.357333 seconds; H.264/AAC.
- SHA-256: d9c9466f72f6fa16167e575144098c465a9c3d52f94dffe0f8d6ad2f6a8585be.
- Encoded audio-packet SHA-256 is identical to v1: 099f0980f10affa2e76e1814287734682414674530701c4c0bdc361d3ceb0533.
- Full local audio/video decode passes; contact sheet sampled from the encoded film inspected for subject visibility, readable English captions, title, AI-illustration label and outro.
- Owner reviewed the delivered encoded v2 and explicitly accepted the visual direction on 18 October at 06:23:39 Europe/Stockholm: "Mycket b?ttre, exakt det jag e ute efter :D". This records aesthetic acceptance of SHA-256 d9c9466f72f6fa16167e575144098c465a9c3d52f94dffe0f8d6ad2f6a8585be; it is not an independent listening certification or a server publishing receipt.

Source JPEGs are local ignored review assets. Their SHA-256:
- replit-illustration-0.jpg: 51c3cde57b097d15bcc6ab4d964e377b1b5a53467b34cc950f2468bff9fe26be.
- replit-illustration-1.jpg: 5fcce5ff17ef18778647100677f09ed71130db82b4d132d53cac0ca6636c7308.
- replit-illustration-2.jpg: 3313f2a0286abe36ee439976a3ef5d22048d8fe05e548c547401189a7b3c6a26.

Exact prompts and the reproducible local review entrypoint are recorded in the adjacent the-prompt-illustrated-review-prompts-20261018.json. Generated original PNGs were preserved; JPEGs are format-converted copies. Video assets remain outside Git.

## Verification

Three camera/timeline regression tests observed RED, then GREEN: cue boundaries/crop changes, bounded motion/outro boundary and malformed timelines or out-of-range asset/crop data. All 87 Remotion tests pass with zero failures/skips; both existing no-publish/isolation contracts pass. Focused TypeScript for ThePromptDailyPilot and the shot helper passes. Full web or whole-repository suites were not run for this isolated Remotion change.

Only the private preview component, pure shot helper, targeted tests and review documentation are changed. No automatic publishing component, live cron, DB, credentials, release authority or trial format tags changed. AI-generated conceptual pictures must not be treated as documentary source images or automatically satisfy the story_visual evidence contract.

## Next

Owner has accepted this actual illustrated MP4 as the preferred visual direction: story-led images, frequent full/close cuts, unchanged Victoria, English captions and the same outro. Each future story needs its own relevant visuals; do not reuse the Replit artwork as generic daily material. Keep draft PR #377 and the seven-day live trial OFF until aesthetics, fresh source/visual provenance, exact-output approval, budget/release/rollback, DST-safe schedule and prospective metrics are ready. The same Replit source is a 16 October article and becomes older than 48 hours at 18 October 12:55 UTC; it is being reused as a private visual comparison, not as a new published story.
