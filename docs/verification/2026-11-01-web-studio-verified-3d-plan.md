# Web Studio verified 3D plan — verification

Date: 2026-11-01
Branch: codex/atlas-builder-references-20261017

## Current truth
- Existing Demo Motors 360 proof is a 12-frame image sequence and remains `fictional_concept`.
- It is not a free-camera GLB viewer and not a digital twin.
- No real-vehicle upload/publish pipeline is active.

## Existing source evidence
The Blender source used for the current fictional 360 proof still exists locally:
`C:\Users\Andre\AppData\Local\Temp\omnira-opus3d-poc-20261030\showroom.blend`
- bytes: 117464
- SHA-256: `31dbc9e2653e27df224999f3487289bad86e37bb33e190ba566a8c8ae5c174ba`
- Blender CLI is not currently discoverable on PATH from Desktop Commander; export has not been attempted in this step.

## Architecture decision
- GLB/glTF 2.0 is the target delivery format.
- Viewer runtime is owned by Omnira; model output remains inert.
- Planned Three.js version: 0.187.0, with GLTFLoader.
- GLB bytes stay outside the 1 MiB text artifact and are copied as governed static-export assets.
- Existing 360 stays as fallback.

## Same-source rule
If a page visually claims that the 2D car and the 3D car are the same vehicle, the poster/hero must be rendered from the same approved 3D source. An independent AI image is insufficient evidence.

## Real vehicle gate
`real_vehicle_verified` requires exact configuration evidence and human approval across fixed comparison views. AI-only inferred geometry cannot receive this truth class.

## Footer side work
The approved showroom hero is now reused as a heavily tinted footer backdrop locally, with no new image generation.
Fresh checks:
- premium template + artifact tests: 76/76 PASS
- local footer preview: HTTP 200 and contains `footer-visual`
- no paid AI/media call
