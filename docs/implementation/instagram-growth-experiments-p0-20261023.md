# Instagram Growth P0 — Atlas advisory experiments
Date: 2026-10-23
Branch: codex/instagram-growth-experiments-20261023
Base: origin/main at 8ed6b4f (no changes to production)

## Intent
Extend the ALREADY deployed, project-scoped Instagram metrics in Atlas Operations with one clear, deterministic, read-only suggestion per brand and a separate pure function that can review manually labeled A/B observations.

## Current observed first-party data
- The Prompt: 293 Instagram insight rows all-time; 176 with published_at in the last 90 days. The existing UI reviews a bounded 80-post recent sample.
- Familje-Stunden: 2 real Insights rows, associated with two provider-confirmed posts. Median 42 views and 84 views combined at first collection; n=2 is not a usable comparison basis.
- Both brands have their own existing project-scoped queries and UI. No cross-account ranking.

## Behavior
- Fewer than six measured posts: suggest data collection only, not optimization. Familje-Stunden currently needs at least four additional posts for an exploratory baseline.
- Old (>7 days) or missing last-fetched timestamp: suggest inspecting the EXISTING Insights refresh, not making a content decision.
- Six or more posts, recent data: offer one MANUAL hypothesis. The Prompt can test three evidence-first vs three problem-first hooks. Familje-Stunden can test three everyday-benefit openings vs three curiosity openings; use approved Nova/Pling art and Swedish tone.
- A/B evaluation is a separate pure function. Requires the same brand, unique manually assigned post IDs, at least three per variant, positive observed reach, shares and saves, and a measurement taken 48–54 hours after each post. Returns a descriptive comparison with no winner or significance claim. The current database does NOT store manual variant labels or a fixed-age experiment observation series, so this comparator cannot yet run automatically on live posts.
- Experiment ideas are presented as text only inside the existing InstagramGrowthCard; no buttons, scheduling, payment, posting, changes to Meta permissions, cron jobs or database migrations. The existing user review gate remains mandatory.

## Verification
- 67/67 targeted Vitest regression tests green, including new pure-suggestion, A/B-validation, rendered server HTML and existing isolation, Insights and voice tests.
- Targeted strict TypeScript check including the new module, UI and test files: PASS.
- A real signed-in visual browser review was not available in this chat because the connected browser did not permit reading its app.omniraos.se tab. Server-rendered HTML has been tested, but a UI screenshot/user acceptance check remains before release.
- No API inference costs and no external requests are initiated by this feature.

## Release gate
1. Review the source and explanatory wording. Do NOT present provisional ideas as validated winners.
2. Test in a clean GitHub CI + Vercel preview only after approval of deployment costs.
3. If approved, deploy read-only suggestions and inspect the actual logged-in Atlas Operations page for both projects.
4. Separately design a reviewed A/B tagging/observation ledger and fixed-age snapshot sampling before enabling automated experiment evaluation. No autonomous publication.
