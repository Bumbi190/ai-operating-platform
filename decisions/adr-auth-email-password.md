# ADR: Migrate Authentication from Magic Link to Email + Password

**Status:** Accepted
**Date:** 2026-06-19
**Branch:** feat/email-password-auth
**Author:** André Hultgren

---

## Context

Omnira's authentication has used Supabase Magic Link (OTP via email) since launch.
Every login sends a one-time link to the user's email; the `/auth/confirm` page
exchanges the PKCE code for a session cookie via `@supabase/ssr`.

This works for browser access but creates two compounding problems:

1. **Friction.** Every login requires opening an email client, finding the link, and
   clicking it within the OTP expiry window. For an internal ops platform that opens
   on every morning routine, this is significant daily overhead.

2. **Desktop-app blocker.** The planned Electron/Tauri desktop client cannot complete
   the Magic Link callback without registering a custom URL scheme (e.g.,
   `omnira://auth/callback`) in the OS and in Supabase's allowed redirect list.
   Email + Password requires no redirect at all — `signInWithPassword()` returns
   the session inline, making desktop auth trivial.

---

## Decision

Replace Magic Link as the **primary** login method with **email + password**
(`supabase.auth.signInWithPassword`), while keeping Magic Link available as a
**fallback** until all existing users have set a password (Phase 3 removes it).

### What does NOT change

| Layer | Status |
|-------|--------|
| Session model (`@supabase/ssr`, cookie-based) | Unchanged |
| `middleware.ts` (session validation, redirects) | Unchanged |
| `lib/supabase/server.ts` / `client.ts` / `admin.ts` | Unchanged |
| `lib/auth/project-access.ts` | Unchanged |
| `/auth/callback/route.ts` | Unchanged (used by password reset) |
| All API routes | Unchanged |
| RLS and project isolation | Unchanged |

### What changes

| File | Change |
|------|--------|
| `app/(auth)/login/page.tsx` | Add password field; primary action = `signInWithPassword`; Magic Link becomes secondary toggle |
| `app/(auth)/forgot-password/page.tsx` | **New.** `resetPasswordForEmail()` + confirmation view |
| `app/(auth)/update-password/page.tsx` | **New.** `updateUser({ password })` after reset link is clicked |
| `app/auth/confirm/page.tsx` | Add `type=recovery` detection → redirect to `/update-password` |

---

## Alternatives Considered

### A: Keep Magic Link only
Rejected. Does not solve desktop-app blocker or daily login friction.

### B: Magic Link only for desktop (deep link), password for web
Rejected. Dual-path complexity with no benefit — password is simpler everywhere.

### C: SSO / OAuth (Google, etc.)
Deferred. Omnira is single-operator today. SSO adds IdP dependency and billing
overhead not justified at current scale. Can be added later as a third option in
the same login UI.

### D: Passkeys
Deferred. Supabase passkey support is maturing. Correct long-term direction but
not yet stable enough for a production migration without more internal testing.

---

## Rollback Strategy

Because Magic Link is preserved as a fallback (not removed until Phase 3):

- **Phase 1 rollback**: Revert `login/page.tsx` to Magic Link form only. One file,
  one commit. New pages (`forgot-password`, `update-password`) are net-new and do
  not affect existing flows — leaving them deployed is harmless.
- **Phase 2 rollback**: Password reset emails already sent are idempotent — users
  can ignore them. No DB changes are made by this migration (Supabase Auth handles
  password storage internally).
- **Phase 3 rollback**: Requires re-enabling Magic Link in Supabase Dashboard.
  Can be done in < 2 minutes without code changes.

No database migrations are required for any phase. Supabase Auth manages the
`auth.users` table internally; enabling/disabling providers is a Dashboard setting.

---

## Implementation Phases

### Phase 1 — Parallel auth (this branch)
- Add password login as primary method
- Keep Magic Link as secondary ("Logga in med e-postlänk" toggle)
- Add forgot-password and update-password flows
- Deploy to production
- Verify sign-in and password reset work end-to-end

### Phase 2 — User migration (manual, no code)
- In Supabase Dashboard → Authentication → Users: send password reset email to all
  existing users (they click the link, set a password, session is established)
- Verify that all active users can log in with password
- Monitor login errors for 1–2 weeks

### Phase 3 — Remove Magic Link (requires explicit approval)
- Remove Magic Link toggle from `login/page.tsx`
- Disable Magic Link OTP in Supabase Dashboard (Authentication → Providers → Email →
  disable "Enable Email OTP / Magic Link")
- Tag release

---

## Desktop App (Future)

With email + password, the Tauri/Electron client initializes Supabase with a
custom storage adapter instead of cookies:

```typescript
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: tauriSecureStorage, // implements Storage; backed by native keychain
    persistSession: true,
    detectSessionInUrl: false,   // no URL callback needed
  }
})
```

`signInWithPassword({ email, password })` returns the session directly. No OS
URL-scheme registration, no Supabase redirect-list changes.

---

## Consequences

**Positive**
- Faster daily login (no email round-trip)
- Desktop app unblocked
- Password reset flow is standard UX users expect
- Fallback to Magic Link means zero disruption during migration

**Negative / Risks**
- Existing users must set a password before they can use the new flow (managed
  via password-reset email in Phase 2)
- Password credential management responsibility (Supabase handles bcrypt; users
  must not reuse weak passwords — mitigated by minimum length policy in Supabase
  Dashboard)
- If `ATLAS_MEMORY` diagnostic logging from commit `0f4eb93` is still deployed,
  remove it before or alongside this branch merge (separate concern)
