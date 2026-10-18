# The Prompt — continuous camera correction, 18 October 2026

The owner approved the three actual provider images, but rejected the camera loop/jump in the 32.75-second Anthropic movie. The planner restarted close crops of the same image approximately every three seconds, including repeated 1.25-to-1.40 resets. A fourth generated image would not correct that reset behavior.

## Change

The reusable illustrated-news planner now emits exactly one uninterrupted, centered move per image, from 1.02 to 1.10 scale. The existing narration-derived image boundaries remain. The renderer interpolates over the whole image interval, ending when the next image or outro begins. No composition, image, source, narration, caption timing or provider execution changed.

Actual story plan: image 0 at 0ms, image 1 at 9555ms, image 2 at 19296ms; narration ends at 29721ms. Three camera moves replace twelve. All three original provider images and the exact same Victoria audio are reused. No new paid generation.

The ignored private render entry recomputes the plan from actual saved words with the updated canonical planner rather than replaying the old exported twelve-shot plan. Newly derived server previews use the same updated planner; old downloaded props require re-planning to receive the fix.

## Evidence

- 132/132 complete Remotion Node/tsx tests PASS, no failures/skips; both isolation contracts PASS.
- Full web TypeScript PASS. Earlier web budget/provider regression results belong to ccb4224, not a fresh run for this pure camera edit.
- Three updated/new camera expectations first failed against the old planner. New 30fps integration walks 900 consecutive frame states, checks no same-image camera restart, monotonic slow zoom, fixed focus and motion completion at each image change.
- Existing daily-preview integration was updated from the superseded extra-crop expectation to one move per image. Context/source/voice and photo-isolation checks remain.
- Actual new H.264/AAC movie: 720 x 1280, 30fps, 982 video frames / 32.733333 video seconds; 32.75-second container.
- Full audio/video decode PASS. Extracted AAC payload hash matches the previous movie exactly: 2c365218bd7976f6a59dceb8b36919335c57bc6c654f1ba539f91f93204b749b.
- Encoded-frame before/after comparison at the original 3.228-second jump was visually inspected; new image position stays continuous. All 982 frames decoded for supplementary background continuity analysis. At 213 background sample positions, largest adjacent-frame mean luma delta within the same image fell from 30.7981 to 1.8498. This excludes the two intentional image changes (frames 287,579) and outro; it is a limited continuity check, not a comprehensive perceptual-quality score.
- Bounded follow-up self-reviewed; no new independent reviewer claimed.

## Private delivery

Updated The-Prompt-Anthropic-privat-videoprov.mp4, 6,633,661 bytes, SHA-256 92a035817577e969ec54b2dd76292ef48d1c60829b18bba32608ae1c1d79d25a. Saved to the same Library identity libfile_8442569fec9c819191ad1d641a5222db, version 1; previous version preserved.

Remote QA master is The-Prompt-Anthropic-mjuk-zoom-v2.mp4. Media/transfer files stay outside Git. No publication, production deployment or seven-day trial activation. Owner review of the corrected encoded motion remains the next quality check. Prior source freshness and release/rights/scheduler/measurement limits remain; the report's original timestamp is unchanged.
