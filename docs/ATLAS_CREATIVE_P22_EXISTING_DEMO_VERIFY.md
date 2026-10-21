# Atlas Creative P22 — read-only integrity verification of existing demos

Date: 2026-10-21
Branch: `feat/atlas-creative-p22-preview-verification`
Parent: P21 Draft PR #488

## Purpose

The Hultgren workstation already contains **synthetic local ArtCraft demo
outputs** and a preview. Rather than executing PhotoCraft/FilmCraft again
or bypassing the intentionally disabled media-worker execution gate,
P22 revalidates the **existing** source, converted image and demo video.

The verification is entirely **read-only**. No media editors, job broker,
worker activation, database, cloud API, network listener or publishing
action is invoked.

### Verified actual local artifacts

Root is the existing test-only folder:

```text
%USERPROFILE%\Projects\Omnira\External\ArtCraft\_atlas_test_only
```

It contains:

- `input/atlas-test.png` — synthetic 320 × 160 PNG.
- `output/atlas-test.webp` — previously staged 320 × 160 WebP.
- `output/pilot.mp4` — previously staged synthetic video.
- `reviews/artcraft-fixture-001/manifest.json` and `index.html`
  — existing local private reviewer material.

P22 compares a newly derived, in-memory review manifest (with hashes
computed from actual current bytes) to the saved manifest. It separately
reconstructs the HTML preview and compares it *exactly* to the saved HTML.
The existing demo verified unchanged. Video byte size was **2,156,220** and
WebP byte size was **1,514**.

Both existing pinned CLI executables were also checked, without running:
PhotoCraft 0.10.0 and FilmCraft 0.9.0 SHA-256 matched
`scripts/creative-tools/artcraft-lock.json`.

### Reproduce (Hultgren only)

From the standalone P22 worktree root:

```powershell
node scripts/creative-tools/verify-existing-demo.mjs --verify-existing
```

This command prints a small JSON status report and never edits the
original demo output, preview HTML or manifest. It requires the precise
existing review ID and fixed trusted local test root. Path traversal or
unknown review names are rejected.

To inspect the local preview manually in the workstation browser, open:

```text
%USERPROFILE%\Projects\Omnira\External\ArtCraft\_atlas_test_only\reviews\artcraft-fixture-001\index.html
```

This is a **local file**, not a public URL or deployed Omnira page.

## Tested

- 7 new P22 unit/fixture tests passed: unchanged manifest, image tamper,
  video tamper, modified preview HTML, forged approval/provenance, path
  escaping and repeatable read-only verification.
- The full creative Node suite passed **143/143** in two repeated runs.
  The first full run had **142/143**; the individual failing test was
  not captured, and the issue could not be reproduced in two subsequent
  full runs. That first run is NOT counted as a pass; the intermittent
  failure remains an observation for later CI stability review.
- Sequential existing PGlite/PostgreSQL WASM suite passed **41/41**.
- Latest clean runs total **184/184** checks. No P22 PostgreSQL migration
  or Next.js app change was needed.

## Limits / strict NO-GO

Media-header checks, hashes, dimensions and an intact saved preview **do
not prove** the program generated the files as claimed, visual quality,
safe media decoding, a signed OS worker action or genuine Atlas agent
execution. The older manifest carries
`provenance=local-direct-cli-fixtures-only`, not an independent
attestation. The renderer intentionally says
`approvalStatus=not-requested`,
`independentQcPassed=false`,
`executionAuthorized=false` and
`publishAuthorized=false`.

P22 does NOT change `AUTONOMOUS_CREATIVE_EXECUTION_ENABLED=false` in
`local-broker.mjs`; nor does it enable the disabled Windows account.
It does not merge the stacked Draft PRs, run migrations, generate a new
image/video, save user/project assets or publish anywhere.

Next: independent review/consolidation of the creative PR stack,
a properly isolated/manual execution plan with explicit operator approval,
trusted editor-output provenance and full image QC before connecting the
real Atlas creative pipeline.

No new costs, production writes, cloud services or access grants.
