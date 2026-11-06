# Atlas creative tools: Phase 0 (no external execution)

Status: capability catalog implemented on isolated branch; NOT installed or running.
Projects: https://github.com/storytold/photocraft and https://github.com/storytold/filmcraft.
The other four ArtCraft links are proposed catalog candidates, not verified executable integrations.

## Rationale
Enable Atlas to edit existing media, not magically upgrade its generative model.
Existing Remotion/FFmpeg workflows must remain the default and continue to work.
A new tool is worth enabling only if it passes a quality and reliability comparison.

## Safety gates before installation or execution
1. Pin reviewed commit SHA, verify repository authenticity, dependencies, licenses and release artifacts.
2. Test locally in a dedicated unprivileged Windows account/container with no cloud credentials.
3. Explicit per-tool allowlist, subprocess allowlist, strict input/output directory boundaries and file size limits.
4. MCP transport must be local only with authenticated broker; reject shell commands from untrusted media prompts.
5. Cap runtime, RAM/VRAM and disk usage; block destructive operations and network by default.
6. Output goes to a staging folder; require preview and human approval for publication or overwrite.
7. Preserve event logging (model, tool, version, files, duration, cost, review result) in Atlas audit trail.

## First acceptance tests
- PhotoCraft: import an approved test image; non-destructively resize, edit text/layer and export WebP.
- FilmCraft: create a 10s sample video with a cut and slow continuous zoom; export MP4.
- Compare both with current pipelines for visual quality, correctness, time, stability and cost.
- No production data, no API keys and no automatic posting during evaluation.

## Next implementation
A separate, reviewed local broker with typed tool schemas, sandbox enforcement,
health checks, rollback, and audit events. Wire into the existing media orchestrator
only after acceptance tests pass. Until then canExecuteCreativeTool() fails closed.
