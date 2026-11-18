# Office direct start implementation plan

**Goal:** Open the existing Unreal Office from its Omnira entry.
**Architecture:** Static explicit protocol link, dedicated one-purpose Windows handler, fixed local target and duplicate prevention.
**Tech stack:** Next.js/React page; Python standard library; HKCU URL protocol; Windows APIs.
**Spec:** docs/superpowers/specs/2026-11-12-office-direct-start-design.md

## Constraints
Use the existing Office branch; no edits to parallel Nova code or Unreal world. No shell, external service, model spend or new permissions. Local validation before release. No commits/push/deploy in this execution.

## Tasks
- [x] Verify source, owner decisions, existing PR and reusable worktree. PR #630 merged; existing branch is clean and isolated. Preflight found that branch; no new branch was created.
- [x] Write failing behavioral tests for fixed target, duplicate handling, invalid URI, missing files, malformed project and foreign registration.
- [x] Implement scripts/office-launcher/office_launcher.py and test_office_launcher.py; tests green locally.
- [x] Run the launcher tests on Windows; check exact target and mutex/process/window APIs.
- [x] Replace the Unreal placeholder on apps/web/app/(platform)/atlas/office/page.tsx with the explicit start link and truthful installation/fallback copy.
- [x] Render and test the actual TSX page, including keyboard link and mobile layout.
- [x] Independent review of the complete change, correct important findings, rerun affected checks.
- [x] Install the tested handler for this Windows user; verify registered URI dispatch and duplicate handling with the actual Office.
- [x] Record observed proof, remaining production activation and subsequent agent-binding work.

## Review focus
Command-line injection from URI; registration collision; concurrent clicks and starting game; wrong map/editor focus; false success on an uninstalled or unavailable target.
