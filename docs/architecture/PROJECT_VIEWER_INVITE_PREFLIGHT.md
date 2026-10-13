# Project viewer invitations — implementation preflight (2026-10-13)

Status: DESIGN ONLY. No accounts created, no invites sent, no migrations applied.

## Verified existing boundaries

- `apps/web/lib/atlas/isolation.ts` computes `getAllowedProjectIds` exclusively by `projects.owner_id = userId`. The empty list is fail closed.
- Current project RLS and related policies use owner checks. A viewer will not become an owner; modifying the application allowlist alone cannot make the UI safe or complete.
- The login UI uses `signInWithPassword` or `signInWithOtp` with `shouldCreateUser: false`; no public sign-up flow is available there.
- The Atlas tool `list_atlas_workflow_catalog` requires platform-operator authorization. Preserve that boundary for project viewers.

## Proposed first release

Oscar should be invited to view Handlarbörsen project dashboards only. No Atlas chat, data exports, agent jobs, workflows, approvals, project edits, other projects, billing or administration in P1.

1. Create project-scoped membership with explicit immutable `viewer` role, `project_id`, `user_id`, issuer, timestamps, active/revoked status. Add database constraints against duplicate memberships and guard membership management to existing project owner.
2. Invitation flow: authenticated owner requests invite to a specific project and email. Generate single-use, expiring invite; safely confirm an auth user and membership only after verification. Never use service-role data reads in a viewer API without explicit project membership checks.
3. Introduce distinct owner and viewer read predicates, not a blanket change to `getAllowedProjectIds` (used by Atlas tools that may trigger writes). Owner allowlist remains intact; viewer-specific read helpers are introduced for an audited set of routes only.
4. Audit every project dashboard endpoint and backing SQL/RLS, plus shared data caches. A viewer's permitted views must never include global owner data, secrets or cross-project statistics.
5. Deny all POST/PATCH/PUT/DELETE server routes for viewers; user-interface button hiding is not authorization.
6. Add RLS tests for owner, viewer, unrelated user and revoked viewer, including read/write adversarial cases.
7. Deploy behind a default-off flag, prove production database migrations and recipient invite redirect configuration on `app.omniraos.se`, then enable and send an invite with explicit owner approval.

## Security release gates

- No privilege escalation via user-supplied `project_id`, JWT claims, API scopes or service-role endpoints.
- Zero disclosure of other projects, Atlas private context, accounting details, customer PII or internal registries.
- Invite can be revoked and replay/expired invites fail closed.
- Existing owner access and existing Atlas action behavior remain unchanged.
- Domain callback, email templates, rate limiting and email sender verified before sending a real invitation.

This note is for scoping and review. It does not grant access or guarantee any functionality.
