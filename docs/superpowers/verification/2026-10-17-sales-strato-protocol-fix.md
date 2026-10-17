# Strato B1 SMTP protocol correction (2026-10-17)

Scope: the approved Handlarborsen B1 authentication-only connection. PR #386 remains draft and unmerged. Inbox access and message sending remain off.

## Evidence and diagnosis

The owner confirmed that the same mailbox credentials work in Strato Webmail. Actual Atlas setup f295fcef-4a1a-48ed-ab71-94700313e46c ended in SMTP_AUTH_FAILED before either authentication timestamp. Its sealed credential was cleared and no failed password was retained. A TLS/EHLO-only Windows check reached smtp.strato.de:465 using verified TLS 1.3; AUTH PLAIN was advertised. This transport check attempted no authentication.

A confirmed protocol defect existed in the client: it always appended the full initial SASL response to AUTH PLAIN. The allowed 2048-byte Unicode password could exceed the SMTP command-line limit, and a 334 continuation was not handled. RFC 4954 sections 4 and 6 require a separate response when the initial command would exceed that limit. This defect is not yet proven to be the cause of the owner's actual failure; the prior receipt does not include a numeric SMTP reply.

## Change

Use one AUTH PLAIN command, wait for 334, then send one UTF-8/base64 SASL response. Preserve the original total deadline and password bytes. Never retry a rejected password or fall back to another mechanism. An unfinished challenge is cancelled with '*' before QUIT.

Persist only fixed phase, numeric SMTP reply, fixed reason code, timestamp and setup ID in the local mailbox-diagnostic.json journal. No response text, exception text, email, password, base64 credential or private key is logged. Diagnostic write failures cannot alter authentication success. Server receipt and recovery protocol are unchanged.

## Verification

- RED: the new protocol and diagnostic tests failed against the prior implementation.
- GREEN: all 66 Windows Python worker tests pass, including maximum Unicode length, rejection without retry, repeated challenge cancellation, total deadline, diagnostic redaction and receipt separation.
- SQL/API/Python integration and installed-runtime evidence are recorded below when completed.
- No real mailbox authentication was attempted during this fix. A new explicit secure-form submission is required because failed credentials were discarded.
- The existing full-web baseline (401 historical failures with unchanged identities) is documented in 2026-10-17-sales-release.md. This Python-only change does not alter the web API or components.

Primary protocol references: https://www.rfc-editor.org/rfc/rfc4954.html and https://docs.python.org/3.12/library/smtplib.html.

Integration GREEN: disposable PostgreSQL 16 SQL checks and all three actual API/Python integrations pass (27.33 seconds). The mailbox integration exercised encrypted browser-compatible crypto, the new two-step fake SMTP exchange, lost-receipt recovery without reauthentication, stale activation fencing and revocation during the probe. The disposable container had no published ports, mounts or network.
