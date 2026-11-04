# Roadster: recessed thrusters, evening materials and responsive scroll

Work WEB-STUDIO-ROADSTER-POLISH-20261104, owned Draft PR368. Preflight receipt ../omnira-pr-preflight-ROADSTER-POLISH-20261104.json returned review_required/matching_local_branch; manual scope review confirmed the clean existing branch and PR368 own these files. Continued that branch without creating a new worktree or PR.

## Observed problems and change

The v9 nozzle centers all used X=-0.516, while the rear body surface ranges from approximately -0.465 at the outer mouths to -0.490 at the inner pair. Moving all four forward together would intersect the body. The offline generator now clips four small apertures in the rear shell, interpolating UVs/normals on the cut triangles. Each nozzle follows the sampled rear surface, has a 0.019-unit recessed chamber and a maximum 0.003-unit lip. Original source binary data, body attributes outside the localized cut, textures, windshield and contact-shadow primitives remain intact. Four separate fitted meshes use satin titanium and restrained blue rings.

The authored Roadster viewer now has readable TypeScript source and a reproducible esbuild script. Cool sky and warm showroom reflections, paint-only roughness/metalness refinement and less opaque smoked glass are confined to this preset. Generic AI artifact compiler, runtime and sandbox rules are unchanged. The underlying AI body mesh still contains uneven surfaces: this is a material/lighting refinement, not a photorealistic replacement model.

The old 3D loop rendered every animation frame indefinitely. The new viewer schedules rendering on OrbitControls changes and only continues while damping settles. It pauses when hidden/offscreen and bounds the drawing buffer to about 1.8 million pixels (DPR <=1.5). Camera framing and drag/zoom are preserved.

The 15.066667-second accepted film is unchanged byte-for-byte. Inspection found an I-frame every eight frames, so no transcode or new video was needed. Forward scroll now presents consecutive decoded frames, with bounded catch-up playback, instead of seeking on each wheel update. Reverse seeks are decoder-paced and always use the latest scroll position. Scroll layout measurements are cached until mode/resize changes, hidden documents pause, normal playback restores 1x speed, and the whole departure remains reachable.

## Reproduction and integrity

Run from repository root:
- python scripts/web-studio/roadster-thrusters.py
- node scripts/web-studio/build-roadster-viewer.mjs

Both commands reproduced identical hashes on a second run:
- Model: 578a550161f3cdbcd517b14b91051ac30bf00a66a8445ae8b9b0eff6747073ca (6,003,844 bytes).
- Viewer: 7e6810b637863031098698b90bd9ae432fed48dfc5874e15d307e0d787443098.
- Film unchanged: b403e13ba6fb651ff1c3175c595b6406b3817f4f85bbd00898dbeaf5f171f3bc.

The manifest, template URLs, SRI and package digest follow the actual new bytes. Historical v1/v2 model and viewer assets are retained.

## Verification

- 36 focused unit/integrity/export/authorization tests pass.
- Full nonincremental TypeScript check passes with 4096 MB heap.
- The nine existing Roadster browser cases and two new rendering/scroll performance regressions pass.
- New tests observe zero additional WebGL draws across idle intervals before and after rotation, a bounded render buffer, more than 20 presented frames during a full forward scroll, fewer than three seeks, successful direction reversal and final paused state.
- Side, rear and front screenshots inspected by the author. This is author review, not independent review.
- Full cinematic suite passes 45/45 locally in 2.7 minutes, including portable export and both models.

No new media provider generation, API build, budget mutation, merge, external message or production release. The standalone omniraos.se release remains unchanged; the branch preview is the delivery surface.

References consulted: [Three.js on-demand rendering](https://threejs.org/manual/pages/rendering-on-demand.html), [FFmpeg codec controls](https://www.ffmpeg.org/ffmpeg-codecs.html). No general hardware FPS guarantee is claimed; tests use Chromium/SwiftShader and cannot establish smoothness on every device.


## Preview prerequisite discovered after push

Deployment dpl_Az2s5y2ZEti8fwp87WjxAKaxarH5 stopped at the unchanged migration guard: the parallel PostHog work had already applied posthog_approved_read, absent from this branch. Read-only inspection observed ledger version 20261104135920 and one statement, SHA c40c2a05a06e09beea1667665d4b7aa43a4813bf1c4215a6d03354260d3d242b. The exact installed statement is now preserved as a canonical SQL file, with -text attributes. No migration was applied or edited in the database.

The separately captured 197-name production ledger passes the unchanged set policy with canonical/enforced counts 174/160. Frozen grandfathered and legacy allowlists remain unchanged. Historical captures are preserved and still fail when incomplete. The new receipt test verifies exact statement bytes and rejects missing/duplicate PostHog entries. The Roadster bundle also gains -text attributes to preserve its immutable hash on Windows checkout.

### Final source reconciliation checks

The complete migration integrity command passed 83/83 tests. Historical 190–196-name receipts remain immutable and correctly incomplete; the separately observed 197-name receipt passes. Source classification for atlas_posthog_read_events was verified using a read-only catalog SELECT: RLS on, zero policies, no client grants, service-role SELECT only. No database mutation or external analytics call was made.

Hosted deployment dpl_46QhDhFND2GiQtiBgCnonkh5A338 reached READY; the authenticated Roadster 3D page loaded and its screenshot was inspected. The stable branch preview points to this reviewed Roadster implementation; the subsequent follow-up only reconciles source classifications and historical tests.

Schema-security invariant and migration-security replay passed 217/217 tests locally. Registry additions describe the observed server-only table; evaluator rules and exception lists are unchanged.
