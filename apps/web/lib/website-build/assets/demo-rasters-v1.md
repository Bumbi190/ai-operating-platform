# Bundled fictional showroom rasters v1

The five raster entries in `demo-rasters-v1.json` are copies of the already approved mockup crops under `apps/web/e2e/website-catalog/assets/premium/`. The source provenance JSON contains crop coordinates, dimensions and SHA-256 checksums; all five were checked before promotion into this bundle. No new image generation or external fetch occurs at runtime.

Original approved image: `Design/references/web-studio/DEMO_MOTORS_APPROVED_AMBER_2026-10-31.png`, SHA-256 `b9af8a93fd090bacd499bad965eac72c10c93263506bf291d322c289f5dd2433`.

These are AI-generated fictional illustrations, not photographs of actual inventory. Four card images are reused across eight synthetic entries. They are not geometry, a 360-degree capture or a live 3D model; resolution remains suitable for this prototype, not a promise of customer-grade originals. They are deliberately bundled demo material, not a registry for private user uploads.

`atlas-asset:<hash>` refers to the SHA-256 of decoded raster file bytes. Registry initialization checks each image against its recorded checksum. Changing an image requires a new content hash and review; never overwrite a previous hash binding. The compiler resolves only these bundled handles. The model-output adapter additionally requires the image to exist in the current validated design reference or previous artifact; a bundled entry alone does not authorize a model to add it to another build.

Private previously supplied rasters are scoped to a fresh in-memory snapshot map for one invocation. They are never added to this JSON or a global cache. The new protocol handles HTML image `src` attributes; it does not represent arbitrary CSS, video or 3D resources. Existing CSP, sandbox, input/output byte limits and explicit plan/mockup approvals remain unchanged.
