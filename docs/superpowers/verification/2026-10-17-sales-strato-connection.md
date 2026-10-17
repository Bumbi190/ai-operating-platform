# Strato B1 verification — 2026-10-17

Current release state and subsequent measured gates are recorded in [2026-10-17-sales-release.md](2026-10-17-sales-release.md). This file preserves evidence at its increment/review checkpoint.


Increment base4a66ea6f558cf4975180dc0f232ec7468fcd7f40, after the independently reviewed managed-host fixes.

Implemented and measured:
- Real WebCrypto→Node RSA3072/OAEP-SHA256 + AES256-GCM interoperability, Unicode and size bounds, key/context/tag refusal. Browser password is never an API field.
- Real disposable PostgreSQL lifecycle as service_role, not just database owner: one active setup, context/key/generation binding, idempotent sealed submit and receipt, stale local activation refusal, expiry, revocation and client ACL.
-359 scoped TypeScript/security tests passed, with3 database-dependent tests separately exercised against real PostgreSQL.
- Windows Python58/58; Node crypto1/1.
- Real SQL→Next handler→Python crypto→fake SMTP/IMAP→in-memory OS-store→receipt integration: lost receipts recover without auth retry, a newer head fences stale activation, expired ciphertext is cleared, revoke during auth prevents activation. Three explicit synthetic fake-auth probes, zero real network/model/mail operations.
- Playwright2/2 on desktop1440px/mobile390px. Real browser envelope decrypted by Node matches the synthetic Unicode secret; no HTTP body or console message contains it; password field clears. Account/host fields cannot change while encryption/setup is in flight. Screenshots visually inspected.
- Typecheck passed. No installed first-party telemetry/autocapture hook found in the app components/layout; form subtree also carries private/no-capture markers.
- Full repository suite running; prior401 historical failures reproduced at exact base. One previous extra5000ms unrelated test timeout passed53/53 on current-file rerun.

Rulings:
- Added a narrow service-only SECURITY DEFINER cleanup-ready predicate because the actual service role cannot use the cron schema. It returns only whether the exact own job/owner/database/schedule/command is active; no cron rows or general cron reach are granted. Cost if wrong: setup blocks rather than bypassing cleanup.
- Added owner-scoped mailbox reference lookup for Atlas form links and UI polling; it cannot begin/submit a setup or return credentials. Cost if wrong: form/status unavailable.
- Setup acceptance and current receipt are the server linearization points. The single host resolves pending receipts before claiming another setup; a newer head refuses replay activation. No claim of cross-system hardware atomicity or compromised-host protection.
- Mailbox passwords stay in Credential Manager separately from public account metadata. No Chrome/general-secret search or password reset is performed.
- Windows test-pipe Unicode encoding was explicitly fixed after an ASCII hash checkpoint demonstrated the fixture's cp1252 mismatch. Production crypto transport already uses explicit UTF8 bytes.

Pending before release: fresh independent review and one regression fix pass, final baseline comparison, exact reviewed migration/catalog/advisor checks, real scoped host grant/rotation/revocation proof, pinned protected preview and owned startup/heartbeat/old-host replacement. No actual mailbox is authenticated until its owner enters the secure form. B2 inbox import and C sending remain unimplemented and disabled.
