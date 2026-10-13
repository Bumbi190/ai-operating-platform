# Omnira collaborator access v1 — approved scope (2026-10-13)

Status: design only. No permissions, users or production DB records modified.

## Decision

Owner / Super Admin: the existing Omnira owner account, identified by verified Supabase auth user ID (email is login identity, not authorization proof).
Oscar / Collaborator: may **view all Omnira projects and their project information**, including financial reports, project memory, activity, plans and analytics. May use Atlas for read-only questions and propose changes to any project. This is NOT unrestricted authority to execute actions or see secret material.

Secrets, raw credentials, access tokens, API keys, recovery codes, user authentication records, and privileged service-role internals are **never** exposed as project information, even to collaborators. User PII in records should remain governed by existing privacy restrictions.

## Action and approval policy

| Capability | Owner | Collaborator |
|---|---|---|
| View all project dashboards and approved project information | yes | yes |
| Ask Atlas read-only questions across projects | yes | yes |
| Submit plans, code proposals and draft PRs | yes | yes (isolated branch, no merge) |
| Handlarbörsen day-to-day actions | yes | delegated, limited by existing policy |
| Other projects: apply plans / execute writes / send / publish / merge | yes, within existing gates | owner approval required |
| Handlarbörsen: production deploy, billing, user access, secrets, destructive operations | owner approval | never unilateral |
| Change permissions / assign roles / approve own elevation | owner only | no |
| Read decrypted credentials or platform secrets | restricted backend only | no |

**No shortcut:** `view_all_projects` must not be interpreted by existing action-capable `getAllowedProjectIds` (today ownership-derived). Introduce a distinct viewer-scoped read allowlist and audited route/view permissions. Existing write and action policies remain owner-only or require explicitly scoped delegated authority.

Approval is enforced server-side before every protected side effect. Atlas' response text, a UI button, or a chat prompt is never approval. An approval binds actor, project, action, payload hash, allowed side effects, expiry and single-use operation identity. Oscar must not approve his own protected work.

## Rollout gates

1. Keep current viewer-only draft PR #329 **unmerged**; replace/supersede its role assumptions after review, do not silently repurpose migration names or merge its UI.
2. Design organization membership (`owner` / `collaborator`) and project scope; authorized owner invitations, acceptance and revocation.
3. Add read-only project data path with complete cross-project tests, privacy filters and explicit secret redaction.
4. Add approval-bound action path for collaborator proposals and delegated Handlarbörsen operations; protect all existing routes/API handlers.
5. Test ordinary collaborator versus owner, revoked collaborator, unverified session, forged project ID, service-role scope, direct API writes, draft PR and owner-approval race/replay.
6. Verify OAuth/invitation callback and selected app domain, full database migration baseline, hosted CI and Vercel preview. Only then merge/deploy and send invite.

No guarantees that an existing owner-only page is safe merely because it reads data. Every route must be audited separately.

## Branch isolation

This plan lives on a separate Omnira worktree from `origin/main`. Handlarbörsen repository and all in-progress worktrees stay untouched.
