# Repo Integration Manifest — Atlas Knowledge Edition v1.0

Record of the controlled repo integration of the approved Atlas Knowledge Edition package.

## Integration coordinates

- **Date:** 2026-07-17
- **Repo path:** `/Volumes/2T_SSD_AI/Projects/Omnira`
- **Integration branch:** `docs/executive-intelligence-atlas-knowledge-v1`
- **Base commit (origin/main at integration time):** `19d984439dc0b419f344943b5597b62f5910abd4`
- **Package source (outside repo):**
  `/Users/andrehultgren/Documents/Omnira-Cowork/executive-intelligence/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean`
- **Package target (in repo):**
  `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/package/`

## File counts

- Package files copied: **74** (73 manifest-listed + the manifest itself)
- Transient files copied: **0**
- Wrapper docs added (outside `package/`): 6
  - `docs/architecture/executive-intelligence/README.md`
  - `docs/architecture/executive-intelligence/professional-edition/v1.0/PROFESSIONAL_EDITION_REFERENCE.md`
  - `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/README.md`
  - `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md`
  - `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/SOURCE_PROVENANCE.md`
  - `docs/architecture/executive-intelligence/atlas-knowledge/v1.0/INTEGRATION_NOTES.md`
  - (this file) `.../atlas-knowledge/v1.0/REPO_INTEGRATION_MANIFEST.md`

## Checks performed (repo copy)

| Check | Result |
|---|---|
| Package manifest checksum verification (73 files) | PASS — all match |
| File count in `package/` | PASS — 74 files |
| No `__pycache__` | PASS |
| No `*.pyc` | PASS |
| No `Build/__deltest.txt` | PASS |
| No unlisted files vs. package manifest | PASS — none |
| No local `/Users/...` path leaks in repo copy | PASS — none |
| No Claude session / `/sessions/...` path leaks | PASS — none |
| No embeddings / vector-DB artifacts | PASS — none |
| Retrieval tests from repo copy | PASS — 56/56, exit 0 |
| Test runner creates no `__pycache__` | PASS |
| Deliberate failure test (broken fixture) | PASS — 55/56, exit 1 (run in disposable temp copy; repo copy untouched) |

## Pinned checksums (upstream, referenced by hash — not copied)

- Canonical v1.0: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`
- Final Professional Edition PDF: `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2`
- Router (`Build/query_atlas.py`): `59693314e1668d3862eebd37e47c16bda97f84381df451474459bf3281f00747`
- Test fixtures (`Build/test_fixtures.jsonl`): `5ebffc881a33985bfc5abaa2ed9fb74aa22a85afc4765e5a7c82a29206cf2727`

Per-file SHA-256 for all 73 package files is in
`package/ATLAS_KNOWLEDGE_EDITION_MANIFEST.md`.

## Retrieval test results

- Source package: 56/56 pass, exit 0
- Repo copy: 56/56 pass, exit 0
- Broken-fixture control: 55/56, exit 1 (disposable temp copy only)

## Git status / diff scope

- The integration touches **only** paths under
  `docs/architecture/executive-intelligence/`.
- No runtime code, schema, migrations, Supabase, Vercel, or deployment config is changed.
- No pre-existing repo files are modified, moved, or deleted.

## Stop limits honored

This integration did **not**: change runtime code · implement Atlas ingestion · create
embeddings · create a vector database · change schema · change migrations · change Supabase ·
deploy · change Vercel · change packages outside
`docs/architecture/executive-intelligence` · delete anything · move older files · run a full
folder cleanup · change Canonical · change the Final Professional Edition · change the SSD
archive · change the Cowork Candidate 1/2/Clean packages.

## Note on `Build/` and `.gitignore`

The repository root `.gitignore` contains a `build/` rule. Because the repo is configured
case-insensitively, that rule would otherwise exclude the package's `Build/` directory
(`build_atlas.py`, `query_atlas.py`, `run_retrieval_tests.py`, `test_fixtures.jsonl`). These
four files are part of the approved 74-file package, so they were added with `git add -f` to
keep the package complete. The repository `.gitignore` was **not** modified.

## Operator note (integration environment)

The repo was mounted through a bridge that permits file **create** and **rename** but blocks
`unlink`. Git's own background maintenance therefore leaves an empty `.git/index.lock` after
some read commands. This was handled by moving orphaned lock files aside (rename, not delete)
into `.git/.fuse_quarantine/` and disabling git auto-maintenance for the session. No tracked
content was affected. Leftover empty files under `.git/.fuse_quarantine/` are host-side
deletable and are not part of the working tree or any commit.
