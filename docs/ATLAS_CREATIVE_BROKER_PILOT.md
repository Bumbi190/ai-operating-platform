# Atlas local creative broker pilot (Hultgren workstation)

Date: 2026-10-20. Isolated implementation branch: feat/atlas-creative-tools-p0.

## Actual state

**Verified:** PhotoCraft and FilmCraft portable binaries installed and hash-pinned, both MCP
servers respond to initialize/tools/list; image and video sample outputs created by direct
editor CLI calls (PhotoCraft WebP and FilmCraft demo MP4). The planning policy and skill
documentation are available in the same branch.

**Implemented:** a one-shot local pilot broker at scripts/creative-tools/local-broker.mjs.
It accepts only two fixed recipes:
- photocraft.convert-webp (synthetic/approved PNG from pilot input folder)
- filmcraft.demo-export-mp4 (bundled demo only)

**Not verified:** remote execution of the broker's approved editing mode. The attempt from
Desktop Commander was blocked by a safety control. The broker's read-only --validate
mode works with actual queued requests and its 3 unit tests pass. Do not mark the
editing path through this broker as tested or production-ready.

**Not implemented:** Atlas cloud-to-workstation authenticated channel, OS sandbox,
autonomy license, reviewer integration, user approval UX, or live social publishing.

## Windows test location

- External root: C:\Users\Andre\Projects\Omnira\External\ArtCraft
- Test input: _atlas_test_only/input
- Requests: _atlas_test_only/requests
- Staged outputs: _atlas_test_only/output
- Audit receipts: _atlas_test_only/audit

The pilot does NOT open a network port and is not a background service.

## Example pilot envelopes

PhotoCraft request in requests/pilotimage001.json:

    {"id":"pilotimage001","operation":"photocraft.convert-webp","inputName":"atlas-test.png","quality":82}

FilmCraft request in requests/pilotfilm001.json:

    {"id":"pilotfilm001","operation":"filmcraft.demo-export-mp4"}

Read-only validation:

    node scripts/creative-tools/local-broker.mjs --job pilotimage001 --validate

Run these only as operator-controlled local pilot tasks, never as an untrusted Atlas
network request. The --pilot-approve switch is NOT a verified human authorization
and MUST NOT be treated as a production permission.

## What the broker enforces

- version-pinned executable hashes
- fixed recipe allowlist; no arbitrary command strings or CLI parameters
- constrained job IDs and plain input filenames
- test-only staging and no overwrite
- input/output file type and size checks
- process timeouts
- audit output hashes and preview-only state

**Important caveat:** all these are in-process checks, not an OS-level sandbox.
Both third-party executables still run with the calling user's permissions.
Limit tests to synthetic media until low-privilege OS isolation exists.

## Live Atlas milestone

Create or reuse the separately developed trusted Omnira broker host (without changing
that project's ongoing code work). Add an authenticated typed creative queue and
dedicated local media worker running under limited Windows credentials. Commands must
be constrained to tested recipes and scoped files. New media output must pass
independent QC, be admitted with provenance, shown in the Atlas preview and approved
by the user before publish. No direct MCP command_run exposure to an AI model.
