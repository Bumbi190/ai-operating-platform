# Atlas Content Growth v1 — safe integration

## Scope

The Prompt and Familje-Stunden keep independent, project-scoped editorial rules. The existing social APIs, Remotion renderer, quality gates and human approval plane remain in place. This change adds editorial guidance to already-used prompts, a first-frame Remotion motion adjustment for The Prompt and a discoverable workspace skill.

## Upstream research (reviewed 2026-10-17)

- Ootto Virality: https://github.com/Ootto-AI/claude-virality-skill (MIT). Useful ideas: a recognisable moving first frame, practical benefit in the first three seconds, script/visual alignment, honest CTA.
- Ootto Content Skills: https://github.com/Ootto-AI/claude-content-skills (MIT). Selected ideas: distinct hook candidates, reel storyboard, A/B testing of one variable, iterative learning.
- Remotion skills: https://github.com/remotion-dev/skills . Omnira already has .agents/skills/remotion-best-practices and apps/remotion: do not add redundant engines or install scripts blindly.
- Ootto MCP is intentionally not connected: additional fee, token/privacy/access review and a proven need are required. No external Instagram privileges granted.

Upstream claims of “viral” reach are marketing claims and are not predictive of performance on our accounts. None of the upstream commands or agent directives were imported as trusted runtime instructions.

## Code wired in this version

1. media/script-prompt.ts: verified-source visual-first hook instructions, without altering the established JSON contract.
2. media/quality.ts: scripts are evaluated for plausible immediate visual relevance; rendered-frame inspection remains a separate TODO.
3. marketing/drafter.ts: family-safe storyboard instructions are added for Reels only; approved assets, characters, single CTA and brand canon take precedence.
4. remotion/ShortFormVideo.tsx: opening hook text is already visible and moves from frame 0 rather than fading from zero opacity; no new render dependency.
5. .agents/skills/atlas-content-growth/SKILL.md: documentation for future agent content tasks (knowledge only, not automatic live publishing).

## Next steps before claiming measurable uplift

- Review a rendered Reel at frames 0, 15, 30, 60 and 90 (30 fps). Confirm subtitles, audio sync, brand identity, scene movement and factual accuracy.
- Confirm that Instagram insights actually return valid project-scoped data; explicitly indicate missing metrics, not zero.
- Trial two *independently reviewed* hook concepts while keeping other variables as comparable as possible.
- Record baseline and results after publishing: reach, views, shares, saves and retention only if the platform exposes retention.
- Decide whether a native experiment UI is worth building. No autopost/DM changes are part of this PR.

## Safety and rollout

No DB migration, new secret, OAuth scope, external execution, new scheduled task, cost commitment, provider integration or unapproved publish/DM behavior. Existing release controls remain in force. This is v1 creative guidance, not a complete visual QA or automatic learning loop.
