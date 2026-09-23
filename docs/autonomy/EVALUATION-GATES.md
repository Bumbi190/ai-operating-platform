# Evaluation Gates

**Status:** Canonical v0.1 (Phase 0 — pipeline design, not implemented)

## 1. Deterministic gates (prefer these wherever possible)

Every mission's output must pass, before any reviewer looks at it:

- Formatting
- Lint (`npm run lint` → `next lint`)
- Typecheck (`npm run typecheck` → `tsc --noEmit`)
- Unit tests
- Integration tests
- Build (`next build`)
- **Git diff inspection** — the diff must not touch anything outside the
  mission's `allowedPaths`, and must not touch anything in `forbiddenPaths`
  (SDF-1A's `path-policy.ts` already implements exactly this check for code
  work; a general evaluation pipeline should call it, not reimplement it).
- **Allowed/forbidden capability verification** — the diff/commands used must
  stay inside `allowedCapabilities` and never touch `forbiddenCapabilities`
  (SDF-1A's `capability.ts` and `command-registry.ts` already implement this
  for code work — no `child_process` import exists there by design).
- Secret detection — the existing Knowledge Provider projection already has a
  `secret-scan` step (`lib/atlas/knowledge/projection/`); an evaluation
  pipeline for mission output should use an equivalent scan, not skip this
  because "it's just code."
- Changed-file scope (count and size, e.g. SDF-1A's `maxChangedFiles: 8`,
  `maxDiffBytes: 131072`).
- Repository-specific CI — the existing narrow, purpose-built boundary
  workflows are the pattern to follow, not a new style:
  `.github/workflows/{sdf1b-control-plane-boundary,atlas-project-isolation,
  atlas-dream-reconciliation-boundary,memory-m4-boundary,
  migration-guard-integrity,trading-canon-integrity}.yml`. Each has an
  explicit anti-skip floor (a minimum passed-test count) so a suite silently
  reporting 0 tests never reads as green.

**A skipped or silently-empty check is not a pass.** This has already burned
this codebase once (`omnira-github-ci-reader`: "skipped is not green") —
any Phase 1 evaluation-gate runner must treat `skipped`/`0 ran` the same as
`failed` unless the gate is explicitly declared optional at that mission's
risk level.

## 2. Independent review

**The worker that wrote the code must not be the sole authority deciding
that its own work is correct.** Concretely:

- The reviewer must be a distinct actor from the worker — a different model
  instance/session at minimum, ideally a different model or provider
  entirely, or (until that exists) the existing human operator review
  surface (SDF-1B2: `control-plane/operator-*.ts`,
  `app/api/atlas/code-work/[workId]/route.ts`).
- The repository already has a candidate mechanism worth evaluating for the
  "independent AI reviewer" role in a later phase: the `/code-review` /
  `/code-review ultra` tooling used in this development environment, which
  already separates "the agent that wrote the diff" from "the reviewer that
  reads it." Phase 0 does not commit to this — it is a candidate to evaluate,
  not a dependency to add now.
- Independent review is required at every Mission Risk Level (RISK-AND-AUTHORITY.md)
  — Level 0 may relax it to gates-only per that document's target policy, but
  that is a future policy decision, not something this document enables today.

## 3. Conceptual flow

```
Worker
  → deterministic gates (§1)
  → issues found? → back to Worker (bounded by the mission's retryEscalationPolicy
                     and SDF1_LIMITS.maxWorkerIterations)
  → independent reviewer (§2)
  → issues found? → back to Worker
  → gates again
  → reviewer again
  → PR ready (mission reaches `ready_for_human_review`, per SDF-1A's lifecycle)
```

A mission reaching `ready_for_human_review` is not "done" — RISK-AND-AUTHORITY.md
governs what happens after that, and for Level 2–3 missions that is a human
approval, not an automatic merge.

## 4. Explicitly deferred, not built in Phase 0

- Trajectory evaluation (did the worker take a reasonable path, not just
  produce a correct diff).
- Security/red-team evaluation of worker output.
- Heavy external evaluation frameworks (Inspect AI, DeepEval, Promptfoo, and
  similar) — these remain references only (see PHASE-0.md §6); nothing here
  installs or depends on them.

## 5. Non-goals for this document

- Does not implement a gate runner or a reviewer dispatcher.
- Does not add any new CI workflow.
- Does not change any existing boundary workflow's anti-skip floor.
