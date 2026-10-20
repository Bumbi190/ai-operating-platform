# Atlas code-work intake preview – bounded planning slice

Date: 2026-10-20. **Planning only; not enabled in conversation or voice.**

## Implemented

- `prepareCodeWorkIntakePreview` takes an objective, work kind, and 1–8
  concrete repository-relative file paths. The *server* must provide an
  approved repository identifier, pinned base SHA, and independently verified
  local code model qualification or null.
- The file policy rejects traversal, absolute or Windows paths, secrets,
  globs, directories, unsupported extensions and case-insensitive duplicates.
  It reuses existing SDF lexical path policy, **not** actual filesystem proof.
- Low-risk classification is only considered for explicitly named
  presentation source files in `apps/web/components/` or `apps/web/lib/ui/`
  without protected path segments. All other paths default to high risk.
  Untrusted request data cannot override this classification, budget, model
  or any approval field.
- The already registered cost-aware model router chooses an author and a
  cross-family reviewer; the preview pins immutable-looking metadata,
  separate SEK ceilings and an SHA-256 preview fingerprint. Any material
  change requires a newly verified proposal.
- Every preview is flagged `executionEnabled=false`,
  `noAuthorityGranted=true`, and `requiresExactHumanApproval=true`.
  A proposed Standard fallback still requires human choice if local coding
  is not qualified.

## Verified

9 new focused tests and the router's 14 existing tests pass locally
(23/23). SDF-1B Linux-CI now requires both test files and enforces 9/14
anti-skip floors. The first GitHub CI run for this change is pending.

## Explicitly not implemented

- No chat or voice command routes to this module yet.
- No validated local Qwen *coding* qualification is claimed. Test data uses
  a synthetic model ID and digest; the eventual trusted server context must
  validate the real qualification record.
- No repository file existence, filesystem containment or symlink safety
  is established by this preview. Broker proof remains mandatory.
- No Mission/WorkPackage binding, proposal persistence, authorization, API
  call, code patch, test execution or merge is performed.
- The existing SDF-1B operator review/approval remains the only admission
  path; a preview fingerprint is **not** an authorization token.

## Next runtime milestone

Bind authenticated voice/text intent to a *read-only* preview display.
Resolve the repository and exact target paths using a verified server-side
source, then require an explicit operator-approved SDF-1B proposal before
allowing any broker work.
