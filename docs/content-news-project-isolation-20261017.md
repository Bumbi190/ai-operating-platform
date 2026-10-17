# Legacy AI-news pipeline: project-scoped capability boundary

## Existing issue

The generic media-enabled project setting did not establish authority to use
The Prompt's legacy AI-news workflow. A user who owns another project (for
example Familje-Stunden) could open the generic legacy News/Scripts pages and
invoke paid Breaking/voice/image/music/render endpoints against an owned
non-news project, inadvertently mixing news scripts and Victoria voice into
family content.

## Scope of change (2026-10-17)

An explicit fail-closed project identity gate is applied only to the legacy
AI-news workflow. The allowed slugs are:
- the-prompt
- ai-media-automation (original unattended default project)

News/Scripts project UI routes verify both **access to the exact project ID**
and the legacy news project type. The media dashboard only presents Breaking
and News/Scripts links when the project is a news project. Five existing paid
or external news routes verify the owned script's **database-derived project
slug** before Anthropic, ElevenLabs, Ideogram, music generation or Lambda
dispatch. User-supplied project IDs do not confer media capability.

These new checks supplement, never substitute for, existing session/project
authorization, governed spend, stop policy or publisher destination review.

## Out of scope / caveats

- Does not activate or change The Prompt publishing or scheduling.
- Does not activate Familje-Stunden automatic posting or grant TTS permission.
- No DB migration, token credentials or third-party APIs called.
- Does not change the globally cross-project Atlas activity feed; it is
  intentionally cross-project outside project views. Full operational
  isolation and the future unified Content Studio policy deserve a further
  separate audit.
- Historical project names are an explicit compatibility list, not a general
  rule that every future project may use the paid legacy pipeline.
- Do not infer project capabilities from the generic settings.media.enabled
  switch.

## Validation

1. Run Vitest on lib/qa/legacy-news-project-boundary.test.ts and previously
   existing voice/project-access checks.
2. Type-check the apps/web workspace.
3. Confirm The Prompt and ai-media-automation remain allowed; Familje-Stunden,
   Handlarbörsen and unknown projects are rejected.
4. Compare the five API guard placements to the paid dispatch calls.
