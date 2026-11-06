# Omnira Creative Bridge v1 — design for the first live Atlas edit

Date: 2026-10-20. Branch: feat/atlas-creative-tools-p0.

## Existing verified pieces

- Windows: PhotoCraft and FilmCraft are installed as portable pinned binaries.
- Local MCP initialize/tools/list: PhotoCraft 25 tools, FilmCraft 17.
- Direct CLI: PhotoCraft valid 320×160 WebP output; FilmCraft rendered demo PNG and MP4.
- Local-only creative worker pilot: scripts/creative-tools/local-broker.mjs.
- Atlas routing policy: apps/web/lib/media/creative-routing.ts.
- Draft-only transfer object: apps/web/lib/media/creative-work-draft.ts.
- File structure checks: scripts/creative-tools/media-verify.mjs.
- No production edit, host service, network listener, or publishing integration is enabled.

## Why not piggyback on the existing code-work broker

Atlas code-broker signed requests are authorized for code-work and scoped to
an immutable repository ID. A creative worker edits media assets, not a Git repo.
Reusing code-work's claim IDs, repository eligibility, or execution authority
would silently enlarge its trust boundary. Reuse the cryptographic concepts and
operator-facing approval semantics, but establish a SEPARATE media-work capability
and a distinct authenticated work type; do not stretch the code-work SQL schema.

## Minimal desired workflow

1. A user requests an edit to an approved canonical AssetId in a project.
2. Atlas checks the project, source ownership, checksum, and selects a candidate
   with planCreativeTask(intent, localCapabilities).
3. prepareCreativeWorkDraft emits a non-executable draft. The goal text is
   untrusted and is for planning and review only.
4. An authorized human reviews the proposed operation and target, granting one
   short-lived, single-use approval for that specific job, project, input hash,
   tool version, operation and output bounds.
5. Trusted server writes the exact approved job to a creative-specific queue.
6. An authenticated, low-privilege worker on Hultgren claims the job by ID.
   The host verifies signed scope, freshness, replay counter, approval, tool
   hash and the canonical input asset checksum before making a local scratch copy.
7. Worker dispatches only a typed allowlisted recipe. Arbitrary MCP command_run,
   mouse/keyboard automation, shell strings and filesystem paths are disallowed.
8. Worker checks the staged output container, dimensions/duration, size and hash.
   Independent QC examines actual visual/audio quality. Output admitted as an
   INTERNAL derived asset with provenance; the original is never overwritten.
9. Atlas shows side-by-side preview with source and revision details; human
   approval is still needed for public posting or replacing a live asset.

## Required authority properties

- Task submission, tool selection, execution and publishing are four distinct
  decisions. A discovered tool is not an execution grant.
- Signed approval binds: workId, projectId, sourceAssetId, sourceSHA256, exact
  recipe id, pinned binary SHA256, expiration, nonce, max output bytes.
- Reject missing or expired approval; reject reuse and cross-project media.
- Idempotency: one workId may be claimed once, never run twice due to a retry.
- The dedicated worker must run under a restricted Windows identity or OS
  sandbox; Node filename allowlists alone cannot confine third-party binaries.
- Broker transport authentication and user authorization must both hold.
- No media-level authorization is inferred from code-work's repository allowlist.
- Job completion alone does NOT grant publish, spend or preview access.
- Do not expose existing founding-admin cloud credentials to the local editor.

## Candidate Phase-1 operations (after security acceptance)

- image.webp.export: edit an approved image, produce a WebP derivative at specified
  bounded quality and dimensions. FIRST RUN should use an entirely synthetic fixture.
- video.timeline.revision: copy an approved project into a sandbox, change only
  an allowlisted cut or timing operation, export draft MP4.

The existing pilot broker intentionally supports only an image conversion and a
bundled FilmCraft demo export. Neither operation is a ready-to-use production edit.

## Go/no-go acceptance

1. Operator authorization is recorded and independently checked (not --pilot-approve).
2. OS-level sandbox boundary tested against path traversal, symlinks, network
   requests and access to unrelated personal files.
3. Unknown/mutated binary rejected by version/hash policy.
4. Duplicate job, replay and failed-job retry do not cause second execution.
5. Output admitted as internal with immutable source+tool provenance and QC.
6. Preview and human decision visible from Atlas; no automatic publishing.
7. Existing Omnira and The Prompt workflows continue to pass regression tests.

## Verified workstation constraint

The target PC is Windows 11 Home (build 26300). Standard Windows Sandbox is
not included in Home, and the Docker CLI was not found on PATH. Do not plan
a Windows Sandbox dependency. Candidate isolation: an explicitly provisioned
non-admin local worker account with deny-by-default NTFS ACLs, dedicated media
staging, restricted process privileges and no cloud secrets. Provisioning that
account and changing ACLs are operator/admin actions and are NOT performed by
this branch. A Windows account boundary alone does not prove containment:
test process escape, symlink/reparse-point attacks and network egress separately.
