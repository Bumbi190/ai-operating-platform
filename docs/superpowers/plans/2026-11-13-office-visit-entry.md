# Office Visit Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Connect the existing Omnira Office page to the already implemented foreground visit companion.
**Architecture:** A standalone isolated Python bootstrap accepts only exact open/visit verbs, verifies a fixed content-addressed local module bundle, and dispatches the existing launcher or visit CLI. An explicit current-user installer upgrades only the known legacy handler and can restore it without changing its file. The Office page offers separate launch-only and visit actions.
**Tech Stack:** Existing Next.js, Python3.12 standard library, Windows HKCU registration; no new dependency.
**Spec:** docs/superpowers/specs/2026-11-13-office-visit-session-design.md sections3,7,8,9. This is the previously specified URI integration, not a new product direction.

## Global Constraints
- Reuse owned Office branch/PR634 at d3de8ad; no other worktree, new branch, force action, production frontend or actual grant.
- Local implementation and temporary install fixtures now. Real HKCU installation and publication remain separately reviewable activation steps.
- Preserve original launch-only handler file and exact open behavior; no new autostart/service or change to map/assets.
- Only omnira-office://visit (optional trailing slash), existing exact open forms; no query/fragment/path/caller arguments.
- Fixed allowlist includes native generator/style files needed by existing integrity checks; never execute them.
- Hash every runtime/evidence file before importing any bundled product module. Python -I, no caller CWD or PYTHONPATH imports.
- Existing owner/command and legacy source hash must match before registration changes. Unknown drift is preserved.
- DB activation already complete version20261113122811; no additional database writes needed.
- Production HTTPS host stays pinned. Preview completion is not native acceptance; real owner test remains after frontend/installation activation.

## Review Focus
- Injected source/PYTHONPATH/CWD module rejected or ignored before dispatch (Task1 isolated subprocess).
- Missing, modified, extra Python module or symlink in installed bundle fails closed (Task1).
- Registration/legacy-file drift and partial registry-write failure preserve/restore prior owned state (Task1).
- Multiprocessing spawn must safely import HTTPS worker without rerunning URI entry (Task1 actual spawn subprocess).
- Visit page link must not claim connection merely from browser launch; launch-only remains available (Task2 rendered markup).

### Task 1: Verified fixed-module entry and guarded installer
**Files:** Create scripts/office-launcher/office_entry.py, office_entry_install.py, test_office_entry.py.
**Interfaces:** bootstrap main(args)->int; installer build_payloads(source)->dict[str,bytes], prepare_bundle(source,destination)->Path, install_visit(source,root,registry,interpreter)->dict, restore_launcher(source,root,registry,interpreter)->dict. Registry read(effective:bool)->Registration and write(Registration).
- [x] Write tests for URI rejection, isolated real bundled subprocess, fixed imports/evidence assets, filesystem tampering, legacy drift, registry collision, idempotence, restore and rollback.
- [x] Run tests RED for missing entry/installer.
- [x] Implement fixed bundle/dispatch and existing-handler-only guarded installer.
- [x] Run tests GREEN plus existing launcher/pairing/visit Python regressions.
- [x] Verify real installed-handler state read-only; keep real installation untouched.
- [x] Record candidate scope; do not commit/push until reviewed publication.

### Task 2: Explicit visit link and acceptance handoff
**Files:** Modify apps/web/app/(platform)/atlas/office/page.tsx and scripts/office-launcher/test_office_page.cjs; create scripts/office-launcher/OFFICE_VISIT_ENTRY.md.
**Interfaces:** new exact omnira-office://visit anchor with consent explanation; existing omnira-office://open retained.
- [x] Write rendered markup assertions for both explicit actions, help references and pending-confirmation copy.
- [x] Observe RED, implement minimal page copy/link, run existing Office web tests and typecheck GREEN.
- [x] Run isolated actual bootstrap -> visit.main -> companion filesystem/HTTP fixture after detached browser and game-exit; no owner grant or real Office game.
- [x] Obtain one fresh scoped code review. Fix important findings with RED->GREEN tests; record any remaining limits.
- [x] Prepare reviewable activation instructions and exact changed-file/hash manifest; no real installation, merge or production release.
