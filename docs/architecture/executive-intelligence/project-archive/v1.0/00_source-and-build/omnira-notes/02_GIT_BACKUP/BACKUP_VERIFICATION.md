# Omnira — Git backup verification

## Existing bundle

- File: `2026-07-24__OMNIRA__GITBUNDLE__ai-operating-platform__VERIFIED.bundle`
- SHA-256: `a43a520582064594121f36ed80e12c2d24c4b4151caaf555967e5838cd23cbe1`
- Size: approximately 4.4 MiB
- `git bundle verify`: PASS
- Refs in bundle: 27
- Bundle HEAD/main: `07107eb41cbd4c0d20ecf72ba8876d1a453c583a`
- History: complete for the recorded refs

## Current mirror

- Portable backup: `ai-operating-platform.git`
- Remote: `https://github.com/Bumbi190/ai-operating-platform.git`
- Default branch: `main`
- Current default-branch commit: `6f51206f9a139c11a3ade846f8de8da718070829`
- Commit date: `2026-07-20T09:58:00+02:00`
- Commit subject: `Merge pull request #52 from Bumbi190/fix/youtube-first-published-at`
- Refs: 29 branch refs, 55 pull-request refs, 1 tag, 85 refs total
- Disk size at verification: 11,816 KiB
- `git fsck --full`: PASS (exit 0, no findings)
- `git show-ref`: PASS; refs were readable

## GitHub tips absent from the older bundle

The following branch tips were not present as objects in the older bundle:

- `docs/intelligence-graph-book-v1` — `95b3ae5c`
- `feat/omnira-intelligence-graph-phase-3` — `a0ee4e5d`
- `fix/media-publish-channel-independence` — `5745ab6f`
- `fix/media-semantic-duplicate-guard` — `9cdcb717`
- `fix/media-semantic-duplicate-guard-recovery` — `0169ff71`
- `fix/memory-stage1-typecheck` — `b078cea8`
- `fix/supabase-public-rls-warning` — `3232c3d9`
- `fix/youtube-first-published-at` — `59cdd168`
- `main` — `6f51206f`

The following pull-request tips were not present as objects in the older bundle:
PR 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52 and 53.

All of these current refs are included in the verified mirror. The older bundle is
retained as the historical snapshot and was not modified.
