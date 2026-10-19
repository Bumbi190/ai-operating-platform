# Atlas frozen fixture recovery — bounded proposal

Status: written for André's review; NOT approved or executed.
Parent: docs/superpowers/plans/2026-10-19-windows-source-materialization.md.
Existing one-shot setup completed. Actual attempt42dcda59-6d77-4514-a6cf-25356e1f0f86 returned fixture_failed; both original-daemon removals confirmed. Its image-owned runner emitted only omnira_fixed_fixture_failed, so the failing internal phase is not yet established. Do not invent a diagnosis.

The parent explicitly permits exactly one pull and one build. That allowance is consumed. This proposal requests a bounded extension rather than silently rebuilding or weakening runtime guards.

## Proposed extension
1. Preserve the failed proof, intent, diagnostic, original image/profile and complete seventeen-file gate results as immutable evidence. No rerun of the same attempt.
2. Add and test fixed phase diagnostics to the image-owned runner: dependency-before, source-before, writable-owned-volume, fixture-launch/result, source-after, dependency-after. Errors identify a closed stage/code only; do not echo arbitrary source, environment or exception messages. Retain bounded redacted child stdout/stderr plus hashes when a fixed child fails. Tests must first reproduce missing failure evidence.
3. Permit at most TWO additional locally retained image builds, each at most900000ms/8MiB, each with an exclusive once-only intent and same-peer reconciliation. First build adds diagnostics; a second is permitted only for a concrete root-cause correction established by the first diagnostic run. Never retry a dispatched or uncertain build.
4. Reuse the already downloaded pinned base and frozen dependency stage. No new pull, dependency installation, subscription, registry publication, network-enabled RUN, lifecycle script or user credential/config. Require the existing dependency layers; cache miss or need for new packages is a block. Use a minimal config, explicitly pinned installed Buildx, explicit Docker pipe and network none for build RUN instructions.
5. Permit at most TWO fresh fixed-fixture attempts total, at most one per newly enrolled image. Persist each new attempt before launch. Retain the same existing proof worktree/base and exact22-file source policy. Runtime limits, uid10001, sole owned volume, read-only image, network none and independent cleanup remain unchanged. No arbitrary command, exec, bind mount, host Node test, or production caller.
6. Verify a material fix RED→GREEN, require actual test count>0/all passed/no skips/unchanged source+dependencies and both removals. Run all seventeen named files, all six Windows flags and both typechecks. Historical failed attempts never become green evidence.
7. Complete Task4 and the already planned single independent gpt-6-astra high whole-range review only after the actual chain is green. One material review fix pass, no rereview. Commit report, verify Notion handoff, then remove only this plan's scratch.

Stop if either extra build/attempt allowance is exhausted, the root cause requires changed source/dependency policy or weaker isolation, current base/peer differs, or cleanup is not confirmed. Retain the evidence and resources; never prune or substitute success.

No push, merge, deployment, paid model call or live autonomous code-job activation is authorized by this extension.
