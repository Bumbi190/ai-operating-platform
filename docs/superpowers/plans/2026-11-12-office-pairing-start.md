# Office pairing start implementation plan

> Execute inline with superpowers:executing-plans; one fresh reviewer at the end.

**Goal:** Explicitly start the existing private identity relay and open the exact pairing page after local native-integrity checks.
**Architecture:** New foreground Python entry point consumes fixed OfficeTarget and OfficeRelay. The web auth/selection and native TTL contracts remain unchanged.
**Tech Stack:** Python standard library, existing loopback transport, Windows default browser.
**Spec:** docs/superpowers/specs/2026-11-12-office-pairing-start-design.md

## Global constraints
Existing isolated Office branch only. No new branch, dependency, service, registry/protocol change, shortcut, paid call, credential copy, workflow execution or publication. Production page not opened during tests. Existing Nova worktree/native assets untouched.

## Task 1: Verifiable foreground start
Files: new scripts/office-launcher/office_pairing.py and test_office_pairing.py; update existing PAIRED_RELAY.md/README.md.
Consumes: default_target()->OfficeTarget; OfficeRelay(output_dir,avatars); start(), pairing_url(), stop().
Produces: check_native(target)->Path fixed output; run_pairing(target, opener, stop_event) lifecycle; main(args) exact --check/--pair.
- [x] Write filesystem/actual-HTTP behavior tests; missing entry point fails assertions (RED).
- [x] Implement read-only native evidence gates and strict argument dispatch. Tests cover uninstalled/pending, map/BP/material/source/plugin drift, no side effects on --check/rejection.
- [x] Implement foreground start/open/wait/finally-stop, generic browser errors and no key output. Test synthetic real HTTP identity -> clear on stop, failure/duplicate-writer cleanup (RED to GREEN).
- [x] Run new tests, combined Python suite and actual Windows --check (no real pairing URL), inspect every result. Existing full web suite remains recorded RED; no web edits justify repeating unrelated 8-minute failures.
- [x] Fresh independent review, one Important/Critical fix pass with RED→GREEN regressions. Record rulings/minors in the existing ledger; no commit by existing instruction.
- [x] Update docs and record exact proof. No live owner-session/voice/execution claim.

## Review focus
Untrusted/tampered local evidence cannot start listener; exception messages must not leak URL/key; any post-start failure releases writer; second process preserves live data; no automatic visit to unpublished web page during validation.

Pre-flight interfaces: target verifies local files/engine; relay already enforces output lease, exact origin/key and safe serialization. CLI must not relax these or infer source authenticity from local manifests.

Verification:69/69 combined Python Linux+Windows; Windows real native --check ready; cross-language HTTP proof passed. One fresh review, five Important fixes RED to GREEN, one generic-diagnostic Minor deferred. Full app production build passed with existing public client config, not private keys; whole app Vitest still RED129files/444tests. Local checkpoint only, no commit/push/deploy or real owner pairing.
