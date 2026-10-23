# P42 security review fixes - 2026-10-23

Scope: this branch only. Production edits are limited to PackageFiles.cs, PackageExporter.cs and PackageVerifier.cs. PackageContracts.cs and PackageManifest.cs are unchanged. P42 ExportTests.cs and ManifestTests.cs add regressions; FileTests.cs moves its old create-only fixture directory helper into test code because production no longer exposes a create-and-discard helper.

## Retained acquisition and verification

Output opens and pins the fixed canonical local NTFS parent, checks its non-inheritable disk directory handle, reparse attribute, final path and volume identity, then uses parent-relative NtCreateFile with FILE_CREATE, FILE_DIRECTORY_FILE, FILE_SYNCHRONOUS_IO_NONALERT, FILE_OPEN_REPARSE_POINT and OBJ_DONT_REPARSE. OBJ_INHERIT is absent. The returned handle is retained with read sharing only, preventing directory deletion/rename or a competing write handle. FILE_CREATED is required before recording creation evidence. Existing candidates never become owned exports. Parent and child identity/final-path checks remain in force, including NTFS volume identity and non-inheritance checks. No ACL is rewritten; normal inherited ACL behavior is retained.

Every output file is still created relative to that held directory with FILE_CREATE and flushed. Export keeps the parent and output handles through verification. Verification duplicates the held directory object into its existing snapshot lifecycle using DuplicateHandle with inheritance disabled; it does not reopen the export path. The same exact enumeration, held leaf identity/link/size/reparse/path checks, bounded reads and unchanged checks apply to both verification modes.

Export verification additionally requires the exact generated nonce, expected host length/hash, SHA-256 of the original raw manifest, and SHA-256 of the parsed manifest re-encoded against the generated context. This binds all source digests, commit, compiler and runtime context as well as fixed schema/false-authority fields. Standalone verification retains its consistency-only meaning.

Creation evidence is recorded immediately after successful native create-only acquisition, even if a subsequent validation refuses. Refusal retains the original export nonce and incomplete-output indication only for a newly created directory. Production never deletes output, substitutes another packet's nonce, overwrites existing leaves, or cleans unknown content.

## Regression evidence

Tests run as the ordinary sandbox user (CodexSandboxOffline), using only review-package/tests/run.ps1. The wrapper compiles the sibling SyntheticLauncher.exe for hashing/copying; it never executes it. No P40 native suite or worker/creative application was run.

Failing-first evidence against the original implementation with REVIEW_TEST boundary hooks:

- Build 75c53a5fab38428487b18d8d0c24e4f7: Codec 62 and Files 78 assertions passed; Export exited 1: `created directory acquired atomically before replacement`. The hook renamed the new directory and installed a replacement before old Output acquisition.
- Build ae01b4b2cc784ba885ec17c515ff618a: Export exited 1: `coherent substitution refuses export`. The old exporter accepted a coherent foreign packet; the test first confirmed standalone consistency.
- Build 4d3a9da9b6ba4f97b7f204ff2d3eaa26: Export exited 1: `export directory retained through verification`. The old close/reopen boundary permitted whole-directory substitution. Original production files were restored temporarily for this red check, then the fixes were restored in a finally block.

Final regression coverage includes both deterministic directory-move boundaries, no export path reopen, coherent foreign packet substitution, same-host/same-nonce changed source commit, raw-manifest whitespace substitution with recomputed digest, exact new nonce retention, untouched substituted bytes, and incomplete empty creation after an injected refusal. Existing collision, unknown-entry, partial-export and identity controls continue to pass. Hooks are compiled only with REVIEW_TEST.

Scanner-only tests instantiate the private Scanner via reflection and bypass schema parsing entirely: depth 3 accepted / 4 refused, 64 properties accepted / 65 refused, and two sibling 64-property objects accepted to check per-object counting. No parser production change was needed.

Final command: `scripts/creative-tools/launcher/review-package/tests/run.ps1 -Suite All`, with a process-local PowerShell git wrapper supplying `-c safe.directory=<this worktree>`; no global Git configuration changed.

Final build/evidence directory: `C:/Users/Andre/AppData/Local/Temp/omnira-launcher-build-8dfaa6177420498990836f7a1c7f0f77`.

| Suite | Assertions | Exit | Timeout | Capture | Stderr bytes |
| --- | ---: | ---: | --- | --- | ---: |
| Codec | 62 | 0 | false | complete | 0 |
| Files | 78 | 0 | false | complete | 0 |
| Export | 83 | 0 | false | complete | 0 |

223 assertions total. Each suite retained its stdout/stderr and metadata under the evidence directory, with the existing 45-second outer limit. Production and test compilation succeeded. A preliminary invocation was blocked by Git ownership configuration; a transient test compilation failure referenced the removed NewDirectory fixture helper. Both were resolved before the final run. `git diff --check` passed.

## Limits

The guarantees are for this ordinary-user local NTFS export operation while its handles remain held. Successful export does not make later mutable packet contents authenticated or protected after handles close. Standalone coherent packet consistency grants no execution, installation, publication or production authority. No administrator/kernel adversary, general native I/O timeout guarantee, or production deployment is claimed. Existing authority flags, source checks and identity requirements remain unchanged.

No P40 launcher, production broker, worker, privileges/account, system ACL, editor, firewall, publishing, migration or other worktree was changed. No SyntheticLauncher.exe, PhotoCraft, FilmCraft or worker was executed. No commit, merge or push was performed.

## Independent final review and fresh operator rerun (2026-10-23)

A second, independent, read-only Codex review inspected the scoped six-file security fix and this note and reported no remaining actionable findings. This was static code review only: it did not run tests or reproduce native race timing. It explicitly checked parent-relative create-only flags, FILE_CREATED ownership, held-directory verification, generated context binding, sharing and cleanup. The historical failures and red/green observations above remain separate; a review verdict does not erase those limits.

After the changes, a fresh non-elevated `HULTGREN\\Andre` execution of `scripts/creative-tools/launcher/review-package/tests/run.ps1 -Suite All` passed Codec 62, Files 78 and Export 83 (223 total), exit 0 and all evidence processes ended. Build and test capture root: `C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-1b301cf6bc7f4e3e9ec74d198fabf247`. This ordinary session independently corroborates the sandbox-user run and does not execute the generated launcher.

A further fresh ordinary-user regression using `C:\\Program Files\\nodejs\\node.exe --test --test-concurrency=1 scripts/creative-tools/*.test.mjs` completed 304/304 tests, zero failures, cancelled or skipped, exit 0. The test runner took approximately 40.8 seconds. This was the existing Node creative-tools suite; no native P40 launcher suite, protected installation, worker or editor execution occurred.

P42 may be submitted as a stacked Draft PR for review. Do not change `InstallationAuthorized`, any of the nine authority flags, or worker activation based on these results.
