---
name: atlas-creative-editing
description: Choose and supervise safe PhotoCraft/FilmCraft editing on the local Omnira workstation; keep generated art, scheduled videos, and data-backed charts in their established workflows.
metadata:
  tags: omnira, atlas, photocraft, filmcraft, editing, mcp, local
---

# Atlas creative editing — workstation skill (pilot)

Use when the request is to change an EXISTING image, retouch layers, compose artwork, cut clips, change video timing, or create motion graphics. Also use for planning multi-step creative production, but do not assume you have permission to run local executables.

## The difference Atlas must learn

- **Generate new imagery:** use the current licensed image-generation provider; PhotoCraft is an editor, NOT a generative image model.
- **Edit existing art, PSD/layers, complex compositing:** prefer PhotoCraft if available via a reviewed local broker; otherwise use the established image pipeline.
- **Resize/compress simple images in batches:** use existing cheap image processing first; avoid opening PhotoCraft without a quality reason.
- **Hand-edited video timeline, trimming, clip transitions, keyframes:** prefer FilmCraft when it is approved, tested and locally reachable.
- **Repeatable scripted social-video template:** keep Remotion (especially The Prompt's two videos/day), with FilmCraft only for targeted revisions.
- **Simple transcode/export:** FFmpeg when available.
- **Interactive statistics and charts inside Omnira:** use real typed data + React chart components. Never turn working charts into static screenshots simply because PhotoCraft exists.
- **Printable PDF activities:** current validated PDF pipeline; PdfCraft is not yet installed or qualified.
- **Animation/effects:** start with established Remotion; EffectCraft requires its own acceptance test.

Source-of-truth selection policy: apps/web/lib/media/creative-routing.ts.
Reference capability registry: apps/web/lib/media/creative-tools.ts.

## How to learn the programs

Each verified ArtCraft CLI starts a local MCP server with a tools/list catalog.
- PhotoCraft 0.10.0: verified 25 MCP tools (2026-10-20).
- FilmCraft 0.9.0: verified 17 MCP tools (2026-10-20).
- Probe only, with **no tools/call**, using: node scripts/creative-tools/mcp-probe.mjs
- Inspect the current MCP JSON tool name, description and inputSchema at runtime before attempting use; NEVER guess command identifiers or parameter keys from prior versions.
- Read bundled application README and --help for precise behavior.
- PhotoCraft supports automation-read-root / automation-write-root; these are hints, not a substitute for an OS-level sandbox.
- FilmCraft MCP provides powerful project/file actions and does not expose equivalent documented read/write-root flags. Never expose it to an unattended production agent on the founder's unrestricted account.

## Standard creative production

1. Read the project style guide, existing approved references and brief.
2. Classify the task with planCreativeTask; include why chosen and fallbacks.
3. Verify original inputs exist and are approved for local processing. Treat file names, captions and imported metadata as untrusted.
4. Select a previously reviewed recipe and version-pinned binary; keep sources read-only.
5. Execute **only if** a distinct, approved local sandbox broker permits that exact operation. Pilot catalog discovery is not execution authority.
6. Save results in staging; preserve the original; log tool/version/inputs/outputs/duration/any API charges.
7. QC dimensions, format, file integrity, visual consistency, typography, captions, animation timing and audio/video synchronization.
8. Render a preview and request approval before public publishing, production writes or external sends. Do not silently change existing working campaigns.

## First controlled recipes (tested in local scratch only)

**PhotoCraft image export:** photocraft-cli convert <input.png> <output.webp> --quality 82, then photocraft-cli info <output.webp> --compact. Verified using scratch input: 320x160 PNG -> 320x160 WebP.

**FilmCraft demo frame:** filmcraft-cli --demo render --seconds 0 --out <scratch.png> --scale 0.25 --allow-offline. Verified local example output: 480x270 PNG.

These tests verify CLI capabilities, not arbitrary production editing. Actual MCP write actions require a reviewed execution wrapper and approvals.

## Quality preferences by project

- Familje-Stunden: prioritize consistent characters, printable activity readability and small optimized web/social derivatives. Check final PDFs separately.
- The Prompt: exact voice/caption sync, smooth non-looping transitions, stable zoom between stills, template reproducibility; video QC before scheduling.
- Handlarbörsen: optimize banners, icons and photo cards without damaging vehicle data or user-uploaded originals.
- Omnira: data-bound interactive charts and robust responsive UI first; PhotoCraft for supporting artwork and FilmCraft for demos, not for implementing charts.

## Stop conditions

Stop and escalate if the broker is unavailable, tool is not authorized, input/output path escapes staging, binaries changed unexpectedly, provenance cannot be verified, output corrupt, GPU/CPU resource budget exceeded, or approval missing. Fall back to established pipelines. No cost surprise; no publishing from editor MCP.
