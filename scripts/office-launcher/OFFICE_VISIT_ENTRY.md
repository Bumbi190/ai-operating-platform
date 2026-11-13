# Office visit entry — local review candidate

This adds the entry integration already specified for the Office visit. It is local, uncommitted and not installed or published. The database migration is already active (office_visit_sessions, hosted version20261113122811); it must not be applied again.

## User flow
The Office page offers:
- Open Office and connect: exact omnira-office://visit. The foreground companion starts/reuses the fixed Office game and opens the protected approval page.
- Open without agent connection: existing exact omnira-office://open, forwarded to the unchanged launcher.

A browser launch is not connection proof. The owner selects one avatar/project/registered agent and explicitly approves. Only after native acknowledgement may the browser close. Office exit ends the connection; four-hour absolute maximum and existing leases still apply. Identity only; no work execution or voice claim.

## Fixed installation
office_entry_install.py --check is read-only and verifies native receiver, known legacy source bytes, owner and effective/per-user command.
After separate installation approval, --install-visit copies the fixed runtime/evidence file allowlist into LOCALAPPDATA/Omnira/OfficeLauncher/visits/<content-id>. No source path or URL may be passed on the CLI.

The standalone bootstrap embeds the module hashes. Its registered command uses the fixed pythonw.exe, -I and -B, a fixed bootstrap path and one URI. It rejects extra arguments, query/fragment/path variations, missing/changed/extra files, bytecode directories and redirected bundle roots before importing product modules. Windows spawned workers reverify under __mp_main__ before importing their target. The two native generator/style files are bundled solely for existing saved-native hash checks, never executed by entry.

Upgrade is allowed only from the exact existing v1 owner/command and matching legacy bytes, or the identical already-installed candidate. A missing already-registered bundle is never silently recreated. It does not replace the old launcher file, alter protocol labels, install autostart, or change Nova/Unreal assets. Unknown registration/file drift is preserved. A failed registry switch restores only known values written by that switch.

## Restore
Run office_entry_install.py --restore-launcher from this exact reviewed source version. It verifies both the immutable candidate bundle and unchanged legacy file, then restores only the original owner and launch-only command. Local files are retained. Restore does not require a healthy native receiver. An unknown edit is a review stop; there is no forced uninstall.

## Activation boundary
No real HKCU update, real owner grant, production frontend merge/release, environment key, new paid service, model/workflow/voice call or native asset write is part of preparing/testing this candidate.

The client remains pinned to https://omniraos.se. The already READY protected Preview of d3de8ad does not provide a usable direct native test for these unpublished entry changes. Real consent-to-game/browser-close/game-exit acceptance requires separately reviewed frontend release and local installation.

## Verification
Initial fixed-entry tests failed because the feature was absent; after implementation the entry/installer tests pass. Rendered actual TSX assertion failed for absent visit link, then passed.
Tests use real temporary files and isolated Python subprocesses with synthetic registry, OS process and upstream identity boundaries. Actual bundled bootstrap -> visit.main -> loopback -> web handlers -> native projection is verified across browser detach and later game exit. This is not real-owner/TLS/Unreal acceptance.
Exact final counts, review findings/fixes and hashes are recorded in the owned Office QA ledger and publication handoff.


## Local trust and review follow-up
The trusted installation and its fixed current-user registry command anchor the bootstrap. Its own file and owned path components are checked for redirects, and the content-addressed directory must match all12 file hashes, including the bootstrap. This is integrity/drift protection for trusted local software, not attestation against a Windows user who can replace the bootstrap or registry with arbitrary code.
Independent entry review found4Important issues, reproduced by6failing regression tests: fresh spawn verification, restore independent of native readiness, bootstrap/ancestor redirects, and missing/idempotent bundle handling. All are fixed in one test-first pass; no re-review is claimed.
Deferred minor: the transport fixture proves2total reads, including1refresh after browser detach. It does not prove2post-detach reads. Its deadline/assertion is unchanged; evidence wording is narrowed. Real-owner/TLS/Unreal acceptance remains pending.
