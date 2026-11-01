# Studio deployable export v1 — verification

Date: 2026-11-01
Branch: codex/atlas-builder-references-20261017
Scope: deploy-ready static bundle only; no GitHub repository creation, Vercel production deployment, domain change or customer side effect.

## Problem closed
The existing project ZIP preserved source, plans and immutable previews, but it was primarily a workspace/archive package. Raster images stayed embedded as base64 inside HTML, and there was no explicitly self-contained deploy directory.

## Implementation
- Project exports now include `dist/`.
- `dist/index.html` and other HTML pages externalize verified PNG/JPEG/WebP data URLs to content-addressed files under `dist/assets/images/<sha256>.<ext>`.
- Original source and immutable preview copies remain unchanged.
- The preview CSP remains `img-src data:`; only the deploy copy is rewritten to `img-src 'self'` because its images are local files.
- `website.js` is carried into `dist/`.
- `project.json` declares a `deployable` block with directory, entry, assets path, exact revision and artifact SHA.
- The export root contains a minimal `vercel.json` pinned to `outputDirectory: "dist"`, matching Vercel's file-based project configuration. It contains no account, token, domain or deployment authority.
- All emitted files continue to be listed with SHA-256 and byte count in the project manifest.

## Automated verification
- `project-export.test.ts`: PASS, including externalized image path, self-hosted CSP, dist assets and deployable manifest.
- Combined focused export/artifact/dealer suite: 77/77 PASS.
- TypeScript `tsc --noEmit`: PASS.
- Real Demo Motors export fixture: ZIP generated successfully (~903 KB before final CSP correction; regenerated after correction).
- Extracted `dist/index.html`: no `data:image` references; CSP contains `img-src 'self'`.

## Browser verification
Chromium opened the extracted file directly from:
`%TEMP%\omnira-demo-motors-export\demo-motors\dist\index.html`

Results:
- Nine always-visible showroom/catalog images loaded with no broken assets.
- First vehicle was opened.
- Lazy 360° frame 1 loaded only after disclosure opened, as intended.
- Slider changed from frame 1 to frame 9; target frame naturalWidth = 320.
- `aria-valuetext` = `Vy 9 av 12`.
- Browser console/page errors: none.
- The deploy-bundle spin component was visually inspected.

## Defect found and fixed by E2E QA
Initial deploy export externalized images but inherited the preview-only `img-src data:` CSP. A real hosted/static bundle would have blocked its new local assets. The exporter now rewrites CSP only for the deploy copy to `img-src 'self'`. The private preview policy remains unchanged.

## Deliberate limitations
- This creates a deploy-ready directory, not a Git repository.
- It does not create/promote a Vercel deployment.
- It does not alter DNS or a domain.
- Form delivery remains an explicit integration need.
- Customer-specific secrets are not emitted.
