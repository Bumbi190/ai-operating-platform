---
name: atlas-content-growth
description: Improve Atlas short-form content for The Prompt and Familje-Stunden using source-backed hooks, visual-first Reels, authentic CTAs, Remotion review and data-driven iteration.
---

# Atlas content growth (project-scoped)

Use as editorial knowledge for existing Omnira pipelines; do not install or execute unknown external scripts. This skill cannot grant publishing, DM, credentials, spend or execution privileges.

## The Prompt
- Choose 2–3 genuinely distinct hooks for the same verified AI story; make the named actor, change and consequences clear in the first 3 seconds.
- Frame 0 should already have a recognisable real story element, legible text and purposeful movement.
- Create a short storyboard: spoken line => real visual => on-screen words. No fabricated screenshots, product capabilities, performance numbers or quotes.
- Existing script QA and factual review take priority over engagement score.

## Familje-Stunden
- Start with a real parent need or one approved Nova/Pling/activity asset, with warm, age-appropriate motion.
- Explain practical benefit within three seconds, even on mute. No fear-based parenting hooks, invented character features or unsafe child scenarios.
- Respect supplied family marketing canon, monthly theme, asset slots and one CTA. No unapproved discounts, freebies, offers or links.
- All family data and brand context stay within the active Familje-Stunden project.

## ElevenLabs voice identity (required)
- The Prompt retains Victoria as pinned in apps/web/lib/voice/config.ts, not any similarly named library voice.
- Pling's official dialogue voice is the owner-approved Alternative B (vhPZICLLz0UIRNLnUe0u / eleven_v4) with the recorded December brightening profile. Nova still needs a verified exact voice-to-dialogue mapping. Sanna is story narrator, not either character.
- Read docs/content-growth-voice-lock-v1.md and apps/web/lib/content-growth/voice-lock.ts; Nova dialogue must remain blocked; Pling requires the exact pinned model and its approved processing, verified before any future synthesis.
- The owner approved the existing September Känslomånaden file `nova_final.wav` on 2026-10-17 as the true Nova voice. See `NOVA_APPROVED_AUDIO_REFERENCE` and its SHA-256 in `apps/web/lib/content-growth/voice-lock.ts`. This is an audio identity, NOT permission to synthesize with an unknown ElevenLabs ID; keep Nova dialogue blocked.
- Nova voice ID `I0uKCr8dyBq1Ouru7CWl` was rejected by the owner (incorrect voice, English sample) on 2026-10-17. NEVER suggest, reuse, pin or generate with this ID for Nova, even though ElevenLabs lists it under that name.
- No automatic fallback or paid voice-generation experiment is permitted.

## Render and learn
- Use the existing Remotion project and its installed remotion-best-practices skill. Do not add a second video engine.
- Inspect actual rendered video at 0, 0.5, 1, 2 and 3 seconds; a prompt-only quality check is not visual validation.
- Compare candidate hook angles on one primary metric (e.g. available 3s retention; otherwise available views/reach/saves) with the platform, posting time and creative differences disclosed.
- Treat small samples as uncertain; never describe a predicted score as a guaranteed viral outcome.

## Controls
- Never automatically publish, spam comments, send DMs, import contact lists, buy tools or scrape restricted/private data.
- Existing human approval, project isolation, credential binding, audit and quota safeguards remain authoritative.
- Social data must be from verified project-bound provider connections; when unavailable, report a data gap.

Reference ideas: Ootto-AI/claude-virality-skill and Ootto-AI/claude-content-skills (MIT, linked in docs/content-growth-v1.md). Original guidance here is project-adapted; upstream skills are not installed or run as code.
