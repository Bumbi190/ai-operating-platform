# Build Reproducibility Report — ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN

- Build scripts use `pathlib` + argparse CLI (`--workspace-root`, `--output-dir`, `--help`). No hardcoded session paths.
- Preflight verifies all input checksums and FAILS CLOSED on any missing source or wrong SHA.
- The build writes only under a staging directory inside `--output-dir`, then atomically finalizes (os.replace).
- No git, no network, no dependency installation. Requires system tool `pdftotext` (poppler), presence checked in preflight.
- This package was produced by running the scripts, not by manual post-hoc files.

## Package hygiene
- No transient test files are included in the package (e.g. no `Build/__deltest.txt`).
- Every Python script in `Build/` sets `import sys; sys.dont_write_bytecode = True` at the top, so running the
  test runner or router does NOT create `Build/__pycache__/` or any `*.pyc` inside the package.
- The package contains no `__pycache__/` directory and no `*.pyc` files.
- Every deliverable file except this manifest appears in the manifest checksum table; there are no unlisted files.

## Reproducible command
```
python3 Build/build_atlas.py \
  --workspace-root "<path>/executive-intelligence" \
  --output-dir     "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean"
```
