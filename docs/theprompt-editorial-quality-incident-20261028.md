# The Prompt – fail-open editorial quality incident (28 Oct 2026)

## Evidence (read-only production checks)
- At 28 October 2026, the WIRED/Home Office story with script ID `b9271d5b-5254-4ad8-a36c-ce7c66e9c63e` had **status=published** (not pending approval).
- Production records publication on Instagram and Facebook at 08:00 UTC (09:00 in Stockholm) and contains a YouTube video ID. Public takedown has **not** been performed.
- The script said UK Home Office used ChatGPT to *decide* asylum cases and stated that an investigation was underway. WIRED describes potential scrutiny, and the Home Office says people make decisions. The narration is not cleared for reuse.
- An aggregate read of the last seven days showed **11 published** scripts with `quality_score.verdict` containing the old parse-failure placeholder, plus **2 approved** scripts without video with the same marker. This flags missing quality evidence; it does not prove that all 11 stories are inaccurate.
- The old `lib/media/quality.ts` converted malformed model output into 8/10 in every category and `passed=true`. The breaking route also swallowed quality-evaluation errors and continued with `status=approved`.

## Contained change, no production action
- Parse model output with a strict, pure contract. Numeric scores must be finite, in range and consistent; verdict and weak spots must be well-formed. Never fabricate `passed=true` on model/provider/JSON errors.
- A provider's `passed=true` cannot override numerical thresholds; `passed=false` remains rejected.
- The rewrite paths re-evaluate the **final** manuscript. No failing original score may approve a rewritten script.
- Voice/images/render/container preparation and Instagram/Facebook/YouTube queues reject stored, unverified scores; the publish queue skips held rows instead of starving subsequent valid posts.
- The YouTube named-script route retains an exact ID but cannot bypass ready/approved status, nor can it bypass quality checks.
- All fixes stay in a **separate draft PR**. No production SQL, Vercel flags, provider calls, schedules, public posts or credentials were changed while preparing the fix.

## Limits and required next decisions
1. The new contract proves only that the quality *response* was valid; it is **not independent fact-checking**. The script model can invent claims, and the current source context is short. A separately reviewed source-grounding/fact-check gate is still required.
2. Because the malformed placeholder was common, releasing fail-closed behavior may **pause daily publications** until the upstream quality model produces valid responses. That is an intended editorial safeguard, not a green-light to weaken it.
3. Before any merge: independently review TypeScript, run route/safety checks, verify CI on the exact SHA, validate preview behavior and coordinate rollout. Do not bypass migration or spend controls.
4. A human operator must review the affected published posts and choose which public posts to correct or remove; database edits do not retract content from social networks.
5. The existing 10:00/20:00 editorial schedule is not altered by this hotfix; check Europe/Stockholm DST accuracy in a separate task.
