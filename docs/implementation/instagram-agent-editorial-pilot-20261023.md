# Omnira / Instagram Agent – scoped editorial pilot (2026-10-23)

## Source and intent
- Source: Jake Schincariol, `Jakeschincariol/instagram-agent-skill`, MIT.
- Pinned local source: `C:/Users/Andre/Projects/Omnira/External/instagram-agent-skill` at `d03c56bb598be770c60b201f94237e5d1a4268a6`.
- Four Python-backed skills available **only to local coding assistants**: `ig-reel`, `ig-viral`, `ig-human`, `ig-audit`.
- App integration in this branch is a **cost-free editorial adaptation**: project-scoped text guidance, a pure metrics summarizer and an authenticated, read-only Operations Center card per brand. The view only reads cached data; it does not call local Python, Meta or other external APIs.
- The existing Atlas The Prompt scriptwriting/QA and Familje-Stunden Reel drafting pipelines import `lib/content-growth/guidance.ts`, which now composes the Instagram Agent guidance. No new background scheduler, token, DB migration or publishing path.

## Behavioral boundaries
- The Prompt: preserve verified source, named actor, pinned Victoria voice, image/video production and current output JSON.
- Familje-Stunden: preserve parent-facing Swedish tone, approved Nova/Pling images and voice, age-appropriate content, canonical assets and existing JSON.
- Only one relevant CTA per Reel; do not mix a follow request and a comment prompt.
- Three candidate hook *types* are evaluated conceptually before choosing a final version; scores are heuristics only. Actual outcomes require account-specific metrics.
- English Python hookscore/humanizer is **not** valid automatic editorial judgment for Swedish copy. Swedish content requires human review.
- No scraping, unauthorized account access, automatic DMs/comments, spend, publication or false guarantees of virality.

## Analytics input requirements
`summarizeInstagramPerformance(brand, posts)` is pure. `readInstagramGrowthPanels(db, allowedProjectIds)` now reads existing `media_insights` in the server-rendered Atlas Operations Center, strictly after a verified human session and an allow-list created from `getAllowedProjectIds`. It reads the last 80 Instagram insight rows published within 90 days, separately for The Prompt and Familje-Stunden. No new credential, external request, scheduler or database table is required.
- Data must come from authorized first-party account exports/Insights, segregated by brand.
- Required: post ID, brand, measured views. Unknown views are skipped (not treated as zero). Optional reach, shares and saves remain null if unknown. Per-post follows are always null since existing collection does not provide this attribution.
- Computes own-account median views; safe view multiple and engagement/reach fractions only when denominators are nonzero.
- Less than six posts: insufficient; six to twenty-nine: exploratory; thirty-plus: descriptive only (not predictive).
- Reject mixed projects, duplicate post IDs, invalid counts.

## Verification
- Instagram/content-growth/isolation Vitest suite: 42 targeted tests passed; the 25-test `atlas-pages-isolation` suite also passed on retry with a 20-second per-test deadline (the initial run hit the environment's 5-second timeout on one unrelated Atlas Home test, with no assertion failure). These runs cover both account isolation and the existing Operations page.
- Isolated strict TypeScript check of the Instagram growth modules and UI card via `apps/web/tsconfig.instagram-growth.json`: PASS.
- Full app TypeScript check: BLOCKED by unrelated existing/missing workspace dependencies (notably @omnira/local-text-contract, @modelcontextprotocol/client, onnxruntime-web/wasm, @vercel/functions upgradeWebSocket and Remotion Lambda types). No TypeScript errors were reported in the new content-growth modules. Full production readiness requires a clean check in the project's normal dependency environment.
- Production activation is NOT performed in this branch.
- No change to existing uncommitted autonomy-runtime work.

## Existing data source – verified read-only 2026-10-23
- Connected Supabase project `AI Operating Platform` already contains 293 The Prompt Instagram insight rows (176 within 90 days), with last fetched timestamp 2026-10-22 09:00 UTC. The latest 80-post sample has median 14 views and highest 322 views. These are descriptive, not viral success claims.
- Familje-Stunden has verified Instagram credential health (status `ok` and identity verified), 23 marketing drafts and 2 `social_publications` rows for Instagram, but ZERO `media_insights` rows and ZERO published `media_scripts` with Instagram media ID. Existing refresh job only collects Instagram insights for `media_scripts`, so its different publication pipeline is not covered.
- Do NOT pretend a missing analytics row means no Instagram posts. A separate, reviewed adapter must map authorized `social_publications` provider IDs to first-party Meta Insights without violating project ownership, publishing gates, API limits or the existing media_scripts foreign-key model. No such adapter is activated in this branch.
- Account-level follower movement is not post-specific; do not turn it into Reel follows/reach.

## Next gates
1. Have second reviewer inspect prompt changes, brand isolation, voice restrictions and cost/QA safeguards.
2. Validate sample and freshness from the existing The Prompt `media_insights` account source in the authenticated Operations view.
3. Build a separate, approved Familje-Stunden Insights adapter for its `social_publications` workflow (or import authorized first-party Insights), after confirming its actual publication media IDs and table constraints. Never synthesize missing metrics.
4. Test two weeks against per-account baselines and measured outcomes (watch time/retention where available, saves/reach, shares/reach; Familje-Stunden additionally attributable subscriber conversions).
5. Merge/deploy only after existing owner review and tests; keep image/video fallback in place.
