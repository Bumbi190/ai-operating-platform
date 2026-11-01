# Web Studio Verified 3D Vehicle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Add a governed GLB free-camera vehicle viewer while preserving the existing 360 fallback and preventing false real-vehicle claims.

**Architecture:** Keep model output inert. Add a governed 3D asset manifest and a bounded declarative 3D behavior whose runtime is owned by Omnira. GLB bytes are separate export assets; the compiled website references an approved local asset path. Demo V1 reuses the existing Blender concept source. Real-vehicle mode is blocked until evidence and human approval satisfy the truth contract.

**Tech Stack:** Next.js 14, TypeScript, static website compiler/runtime, Three.js 0.187.0, GLTFLoader, GLB/glTF 2.0, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-web-studio-verified-3d-vehicle-design.md`

## Global Constraints
- Do not weaken the existing 1 MiB artifact guard.
- No CDN or external runtime script.
- No model-generated JavaScript.
- Existing 360 spin remains available as fallback.
- `fictional_concept` can never be presented as a real vehicle.
- `real_vehicle_verified` requires the complete evidence + human approval gate.
- No paid asset/model call during Demo V1.

## Review Focus
- GLB binary must not be embedded in model output or artifact HTML.
- Viewer failure must fall back cleanly to the existing 360/poster experience.
- A fictional asset must never cross the real-vehicle truth gate.
- Exported site must use relative/self-hosted asset paths and work without a CDN.
- Mobile/touch and reduced-motion behavior must remain usable.

### Task 1: 3D truth and asset manifest
**Files:**
- Create: `apps/web/lib/website-build/assets/vehicle-3d.ts`
- Create: `apps/web/lib/website-build/assets/vehicle-3d.test.ts`
- Create: `apps/web/lib/website-build/assets/demo-vehicle-3d-v1.json`

**Interfaces:**
- Produce `Vehicle3DTruthClass`, `Vehicle3DAssetManifest`, `assertVehicle3DAssetManifest(value)`.
- Produce lookup by approved opaque asset id.

- [ ] Add RED tests for valid fictional demo, rejected fictional-as-real, incomplete real identity/evidence, invalid SHA/path and unapproved asset.
- [ ] Implement strict manifest validation.
- [ ] Register only the Demo Motors concept GLB/poster as `fictional_concept`.
- [ ] Run targeted tests; expect green.

### Task 2: Export the existing Demo Motors source as GLB
**Files:**
- Create: `apps/web/e2e/website-catalog/assets/premium/3d/demo-motors-concept.glb`
- Create: `apps/web/e2e/website-catalog/assets/premium/3d/demo-motors-poster.webp`
- Create: `apps/web/e2e/website-catalog/assets/premium/3d/provenance.json`

**Interfaces:**
- Consume the existing isolated Blender source used for the 12-angle spin.
- Produce one GLB plus a poster rendered from that exact source.

- [ ] Verify the Blender source exists and record its SHA/source metadata.
- [ ] Export GLB without paid generation.
- [ ] Render the poster from a fixed camera on the same source.
- [ ] Validate hashes and file sizes; record provenance.
- [ ] Confirm poster and GLB belong to the same source asset.

### Task 3: Add a bounded declarative 3D behavior
**Files:**
- Modify: `apps/web/lib/website-build/types.ts`
- Modify: `apps/web/lib/website-build/artifact.ts`
- Modify: `apps/web/lib/website-build/artifact.test.ts`

**Interfaces:**
- Add `WebsiteModel3DBehavior={kind:'model3d';triggerId:string;targetIds:string[];assetId:string;fallbackBehaviorId?:string}`.
- Compiler accepts only approved asset ids and structurally valid viewer containers.

- [ ] RED tests: unknown asset, fictional truth mutation, duplicate/overlapping ownership, malformed viewer element.
- [ ] Implement the minimum validator.
- [ ] Preserve all current spin validation unchanged.
- [ ] Run artifact suite.

### Task 4: Self-hosted Three.js viewer runtime
**Files:**
- Modify: `apps/web/package.json` and lockfile to pin `three@0.187.0`.
- Create: `apps/web/lib/website-build/model3d-runtime.ts`
- Modify: `apps/web/lib/website-build/preview-runtime.ts`
- Add focused runtime tests.

**Interfaces:**
- Load approved GLB with `GLTFLoader`.
- Orbit + bounded zoom; no arbitrary scripts/URLs.
- On init/load failure, expose the existing spin fallback.

- [ ] RED tests for asset resolution, failure fallback, reduced-motion and bounded controls.
- [ ] Implement bundled runtime with no CDN.
- [ ] Verify no model-provided JS executes.
- [ ] Run runtime tests and TypeScript.

### Task 5: Keep GLB outside the 1 MiB artifact and static-export it
**Files:**
- Modify artifact/export types to carry governed binary asset references without base64 text.
- Modify the self-contained deployable exporter introduced in commit `2905d3e`.
- Add export tests.

**Interfaces:**
- Artifact metadata references asset id/path.
- Export copies bytes to `assets/3d/<sha>.glb` and emits relative URLs.

- [ ] RED test proving a GLB is not embedded in HTML/JSON.
- [ ] RED test proving exported HTML resolves the local GLB and no external origin is required.
- [ ] Implement copy/export path.
- [ ] Keep the existing artifact byte guard unchanged.
- [ ] Run export tests.

### Task 6: Demo Motors integration with same-source poster
**Files:**
- Modify premium dealer template + tests.
- Modify built-in raster/model binding.
- Preserve existing 360 as fallback.

**Interfaces:**
- First concept car displays the new free-camera viewer.
- Hero/poster comes from the same Blender source as the GLB.
- Truth copy remains explicitly fictional.

- [ ] RED template test requiring matching GLB/poster provenance and 360 fallback.
- [ ] Wire the approved Demo Motors 3D asset.
- [ ] Verify desktop/mobile interaction in real Chromium.
- [ ] Verify 360 fallback by forcing 3D load failure.

### Task 7: Real-vehicle verification gate
**Files:**
- Create verification service/types/tests under `apps/web/lib/website-build/vehicle-verification/`.
- No production uploader in this task.

**Interfaces:**
- `evaluateRealVehicleEvidence(manifest,evidence,review): Verified|Refused`.
- Only `Verified` may yield `real_vehicle_verified`.

- [ ] RED tests for missing view, wrong color/trim/wheel identity, missing reviewer, AI-only geometry.
- [ ] Implement fail-closed gate.
- [ ] Add fixed-angle render checklist metadata.
- [ ] Ensure Demo Motors cannot pass this gate.

### Task 8: End-to-end proof
- Run targeted Vitest suites.
- Run isolated PostgreSQL Studio roundtrip if RAM gate allows.
- Run Playwright desktop/mobile viewer flow.
- Verify no console errors, no external model requests, fallback works.
- Verify truth labels.
- Document exact commit and limits.
- Do not push/deploy until separately approved.
