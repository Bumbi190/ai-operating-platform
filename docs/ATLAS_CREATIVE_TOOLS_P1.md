# Atlas creative editing — local MCP discovery + routing (2026-10-20)

## Verified on desktop Hultgren

- PhotoCraft 0.10.0 portable for Windows: SHA256 checked against release manifest.
- FilmCraft 0.9.0 portable for Windows: SHA256 checked against release manifest.
- Verified installed executable SHA256 hashes are pinned in scripts/creative-tools/artcraft-lock.json.
- Read-only MCP handshake + tools/list works on both: PhotoCraft 25 tools; FilmCraft 17 tools.
- Read-only discovery command: node scripts/creative-tools/mcp-probe.mjs (uses scratch data directories).
- PhotoCraft sample: 320x160 PNG -> 320x160 WebP, CLI info confirms valid image.
- FilmCraft sample: bundled demo project -> 480x270 PNG frame.
- Pure creative routing code exists in apps/web/lib/media/creative-routing.ts; Node tests pass (3/3).
- Agent/operator skill in .agents/skills/atlas-creative-editing/SKILL.md.
- Existing production pipelines, credentials, missions and publishing remain unchanged.

## How Atlas learns to use a creative program

1. Skill document explains each program's role, what it is NOT, and project-specific QC.
2. Machine-detected capability catalog comes from MCP tools/list, not LLM recall of tool names.
3. Tool description and JSON inputSchema specify precise parameters; reject requests with unknown shapes.
4. Tested recipes and version pins make behavior reproducible; future recipes require actual fixture tests.
5. Workflow planner decides WHEN an editor is useful; separates generation, media editing, templating and live charts.
6. Execution is a distinct authority decision. Selecting a tool is never permission to execute or publish.

## Production architecture still required

Omnira's Next.js web deployment must not attempt to spawn Windows executables.
Implement a local broker on Hultgren, preferably reusing the project's existing trusted host pattern.
Broker must have:
- machine-specific authenticated, scoped queue / process channel;
- restricted OS identity / ACL, with per-job staging roots and no production cloud credentials;
- allowlisted tools and typed operations (not unrestricted MCP command_run);
- pinned binary verification, job ID, timeout, CPU/GPU/disk ceilings, provenance and audit trail;
- separate reviewer, explicit approval gate before publication or overwrite;
- rollback/disable switch, status reporting, and no implicit cloud/paid fallbacks.

PhotoCraft advertises read/write root flags, but these alone are not a complete OS sandbox.
FilmCraft lacks equivalent documented flags and therefore MUST NOT expose unconstrained
MCP write actions to an autonomous Atlas session running under the founder's Windows account.

Current gate in creative-tools.ts deliberately returns canExecuteCreativeTool=false.
Do not flip it as a shortcut. Get broker security and Atlas mission license reviewed in
the separate autonomy implementation before the first live editing job.

## Routing examples

| User request | Preferred | Why |
| --- | --- | --- |
| Create a new Nova and Pling illustration | Existing image generator | New visual content needs a generative model |
| Correct illustration layers and export variants | PhotoCraft after broker approval | Pixel/layer editor |
| Compress 100 simple JPG photos | Existing image pipeline | Cheap and reproducible |
| Revise transitions and clip timing in one video | FilmCraft after broker approval | Timeline editor |
| Produce recurring The Prompt videos | Existing Remotion templates | Stable scheduled production |
| Export in a different codec | FFmpeg | No editing required |
| Improve Omnira analytics graphs | React interactive charts | Live, accessible, data-correct |
| Design printable activity PDF | Existing PDF flow | Existing validation remains authoritative |

## Next acceptance milestone

A single local staged PhotoCraft operation invoked through the reviewed broker,
followed by FilmCraft staging, logged job evidence, preview, independent QC and
user approval. Only then wire into live Atlas task orchestration.
