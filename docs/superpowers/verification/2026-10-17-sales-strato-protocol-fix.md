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

## Installed-runtime evidence

Installed immutable client source 48ebc7948813be2384fe4c37df1e97f3b047aaa8 from git archive into the current user's OmniraSales/pilots/handlarborsen-48ebc7948813. All 47 files and the full manifest coverage were verified; manifest SHA-256 e8b99d50f70d62e7d5746292a6b562c8b6bf6df75bbc21b8e76e37ee2dfb9d29.

The exact owned task was previewed, paused, stopped and removed. The old Python process was confirmed absent before configuration changed. The same task was installed from the new pin, ownership checked, and started once: PID 23096, one instance, interactive current-user / least privilege. Generation 2 and the existing management/worker credential references and journal were preserved. No credentials were extracted or re-entered. The origin remains the previously qualified protected pylml26ek preview, whose API is unchanged by this client-only correction.

At 18:45:28Z the server reported CLI ready, online, desired running and last heartbeat 18:45:21Z, after the new task start at 18:45:04Z. The failed mailbox receipt remains needs_input and is not represented as connected. No automatic retry of its discarded password occurred.

The disposable test container was removed after verifying its exact name, image and ownership label. No production merge or flag activation occurred. The next required proof is one new owner-submitted encrypted credential envelope and actual SMTP+IMAP success plus confirmed local storage.

## Follow-up: actual SMTP success and IMAP capability contract

At 19:00:40Z actual owner-submitted setup fa7161dc-a093-4b14-a073-fbdde2634608 received SMTP 235 (authenticated), then stopped at imap_connect with UNSUPPORTED_AUTH. The failed setup's sealed credential was cleared and localStored remained false. This is partial success, not a connected mailbox.

Root cause is now confirmed for the IMAP failure: Python 3.12 imaplib.IMAP4._get_capabilities decodes the response to str and stores a tuple of strings, while our probe compared against b'AUTH=PLAIN'. Both existing test doubles incorrectly returned bytes, so their green results missed the real library contract. A verified TLS/993, CAPABILITY/logout-only check against actual Strato confirmed AUTH=PLAIN and that every capability is str. It attempted no authentication and read no mailbox content.

The fix compares 'AUTH=PLAIN' as text. Both test doubles now match imaplib. Two regression tests call the actual standard-library capability parser before running the production probe: advertised PLAIN must reach authentication, absent PLAIN must still refuse it without a fallback. The success case failed with UNSUPPORTED_AUTH before the one-line production correction. All 68 Python worker tests now pass.

The prior tests were insufficient proof of this external-library boundary; the new characterization tests explicitly cover that assumption. The remaining qualification is a new owner-submitted login after installation, because the failed credential was correctly discarded. No automatic retry or credential recovery is introduced.

Follow-up integration verification: all three real PostgreSQL/API/Python integrations pass with corrected string capability doubles (29.10 seconds). Full Windows Python worker suite: 68/68, 1.455 seconds. Only production change in this follow-up is the IMAP capability comparison; no web component, schema, credential scope or permissions change.
