# Omnira project cover — 2026-10-13

The Handlarbörsen project page now has a panoramic showroom cover, with its existing logo and the original single project heading overlaid. It appears only inside Omnira's vNext Project Command Center for the Handlarbörsen slug. Other projects, the legacy page, data readers, navigation, project-stop control and all stored status values retain their existing behavior.

Asset: `apps/web/public/project-covers/handlarborsen-showroom-v1.png`.
SHA-256: `c1be72df6736250e2669c3d0a6f6ba586ea77d4c7d807861e4d5d0c189f9de99`.
Generated with the built-in image tool, visually inspected, then copied into the repository. The showroom is decorative artwork, not a claim about actual vehicles or premises. The background and logo have empty alt text; the backdrop is aria-hidden. A dark overlay preserves contrast for the existing heading, facts and actions.

## Validation

- Typecheck: pass after the cover changes.
- Existing history/overview tests: 25/25 pass.
- Combined existing history/overview/Command Center tests: 100 pass, two failures. A repeat with the original `HEAD` Command Center source restored temporarily reproduced the same two failures (75 pass, two fail in the Command Center suite); the new cover source was restored afterward. Existing failures are the legacy body hash and an outdated whole-source prohibition on “handlarborsen”, already contradicted by the existing project description. No test assertions were weakened.
- Read-only code review: no remaining blocker.
- Actual component server-rendered into a disposable visual fixture, with synthetic model data, mock image optimization and project-stop action, and the real CSS module selectors. Chrome used a fresh isolated profile and blocked hostname resolution. CDP explicitly set viewport metrics to 1440×900 and 390×1100. Both screenshots were inspected: heading, logo, status values and action labels are readable, links wrap, and document scroll width equals viewport width (1440 and 390). The fixture exercised the owner-brief styling used on the real project page.
- This visual fixture is separate from genuine API/database verification; it does not prove production browser login or saved-draft click navigation.
- Targeted lint is unavailable because the checkout has no configured ESLint setup.

## Image prompt

Use case: photorealistic-natural. A wide cinematic decorative Handlarbörsen cover for Omnira: a Scandinavian premium car showroom at blue hour, dark steel and glass, subtle cyan lighting, polished floor reflections, three contemporary unbranded cars centered and to the right, dark negative space on the left for an application-rendered heading, approximately 3:1 framing. Midnight blue and restrained cyan; no people, text, logos, watermarks or UI. Not documentation of real inventory.
