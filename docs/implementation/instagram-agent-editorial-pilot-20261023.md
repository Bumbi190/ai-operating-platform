# Omnira / Instagram Agent – scoped editorial pilot (2026-10-23)

## Source and intent
- Source: Jake Schincariol, `Jakeschincariol/instagram-agent-skill`, MIT.
- Pinned local source: `C:/Users/Andre/Projects/Omnira/External/instagram-agent-skill` at `d03c56bb598be770c60b201f94237e5d1a4268a6`.
- Four Python-backed skills available **only to local coding assistants**: `ig-reel`, `ig-viral`, `ig-human`, `ig-audit`.
- App integration in this branch is a **cost-free editorial adaptation**: project-scoped text guidance and a pure metrics summarizer. It does not call local Python, Meta or external APIs.
- The existing Atlas The Prompt scriptwriting/QA and Familje-Stunden Reel drafting pipelines import `lib/content-growth/guidance.ts`, which now composes the Instagram Agent guidance. No new background scheduler, token, DB migration or publishing path.

## Behavioral boundaries
- The Prompt: preserve verified source, named actor, pinned Victoria voice, image/video production and current output JSON.
- Familje-Stunden: preserve parent-facing Swedish tone, approved Nova/Pling images and voice, age-appropriate content, canonical assets and existing JSON.
- Only one relevant CTA per Reel; do not mix a follow request and a comment prompt.
- Three candidate hook *types* are evaluated conceptually before choosing a final version; scores are heuristics only. Actual outcomes require account-specific metrics.
- English Python hookscore/humanizer is **not** valid automatic editorial judgment for Swedish copy. Swedish content requires human review.
- No scraping, unauthorized account access, automatic DMs/comments, spend, publication or false guarantees of virality.

## Analytics input requirements
`summarizeInstagramPerformance(brand, posts)` is a pure import (not yet bound to accounts or UI).
- Data must come from authorized first-party account exports/Insights, segregated by brand.
- Required: post ID, brand, views; optional fields must be explicitly null if unknown: reach, shares, saves, follows.
- Computes own-account median views; safe view multiple and engagement/reach fractions only when denominators are nonzero.
- Less than six posts: insufficient; six to twenty-nine: exploratory; thirty-plus: descriptive only (not predictive).
- Reject mixed projects, duplicate post IDs, invalid counts.

## Verification
- Vitest integration and growth suites: 20 passed, 0 failed on 2026-10-23 (all relevant tests).
- Isolated TypeScript strict check of both new content-growth modules: PASS.
- Full app TypeScript check: BLOCKED by unrelated existing/missing workspace dependencies (notably @omnira/local-text-contract, @modelcontextprotocol/client, onnxruntime-web/wasm, @vercel/functions upgradeWebSocket and Remotion Lambda types). No TypeScript errors were reported in the new content-growth modules. Full production readiness requires a clean check in the project's normal dependency environment.
- Production activation is NOT performed in this branch.
- No change to existing uncommitted autonomy-runtime work.

## Next gates
1. Have second reviewer inspect prompt changes, brand isolation, voice restrictions and cost/QA safeguards.
2. Collect actual recent Insights for both accounts through approved account connections or exports; no synthetic metrics.
3. Connect the pure metrics summarizer to an authenticated project-scoped read-only Atlas view when the approved data source exists.
4. Test two weeks against per-account baselines and measured outcomes (watch time/retention, saves/reach, shares/reach, follows/reach; Familje-Stunden additionally attributable subscriber conversions).
5. Merge/deploy only after existing owner review and tests; keep image/video fallback in place.
