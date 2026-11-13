# Office direct start — approved continuation, 12 November 2026

The owner approved continuing the existing Office entry with local Unreal opening first, then agent integration and voice. Existing PR #630 is merged; continue its clean isolated branch locally, without changing another chat's Nova worktree.

## Goal and approach
The existing /atlas/office page offers an explicit link that opens the approved Office map on the owner's Windows computer. Use a narrow per-user URL protocol handler: omnira-office://open. The desktop handler accepts only that fixed URI, validates the engine/project/map, and invokes Unreal with a fixed argv list and shell=False. Repeated clicks focus an existing exact Office game, including while it is starting. Serialize competing activations with a named mutex.

Approaches considered: a native start from Omnira (chosen by continuation of the existing setup) and Pixel Streaming (a separate browser streaming project, deferred). Implementation choice by the agent: use a dedicated desktop launcher instead of modifying the active Nova voice relay; this avoids colliding with parallel development and adds no HTTP listener.

## Constraints
- Current approved target: UE 5.8, Omnira_Office_CastQA_v83, /Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit, game mode, D3D11, 1440x900.
- Existing world, classic HQ, assets and active Nova worktree remain preserved.
- Only the fixed open URI; no query, fragments, target path or caller flags.
- No API keys, login copies, elevated installation, model calls or new subscription.
- Installation is per-user with a stable local script and explicit rollback.
- Do not replace an existing unrelated protocol registration.
- Web page must explain the installed launcher requirement; a link click cannot prove the game loaded.
- This delivery launches Office only. Agent execution, live status and speech are later integration stages and are not claimed here.
- Keep changes local; prepare concrete validation before any production release decision.

## Acceptance
1. Windows resolves the registered URL to the fixed launcher and correct Office game.
2. Repeated activations preserve one matching process and bring its window forward when Windows permits it.
3. Missing files, invalid project metadata, malformed URIs, and process-query errors fail visibly.
4. Existing unrelated Unreal/editor instances are not focused.
5. The rendered page includes the explicit start action and manual fallback, preserves classic HQ, and works with keyboard/mobile layout.
6. Test local handler, protocol dispatch, process/window identity and rendered UI. Production activation is a distinct step.
