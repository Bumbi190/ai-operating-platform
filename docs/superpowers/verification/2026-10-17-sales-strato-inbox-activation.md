# B2 concrete activation candidate — awaiting scope approval

This is a prepared release scope, not a claim of live inbox access. The approved B2 plan explicitly requires the concrete verified read scope before production DDL, preview rollout and the first actual mailbox read. No production flag, merge, SMTP send or model job is part of this candidate.

| Item | Concrete value |
|---|---|
| Supabase project | iboepohjwrhtgshrqaol |
| Owner project | 8f673c09-1c8f-4d78-876e-4c14bf1c89b3 |
| Worker | 49d30271-cf0b-47c9-a70d-2bce5b9b09ba |
| Mailbox | 5964032c-aad9-47c5-b986-71dc7339d775 / info@handlarborsen.se |
| Existing verified mailbox generation | 6 |
| Folder | INBOX only |
| Since | 2026-10-07T22:00:00Z = 2026-10-08 00:00 Europe/Stockholm |
| Metadata | From, To, Subject, Message-ID, In-Reply-To, References, INTERNALDATE and size within the saved scope |
| Text selection at activation | selectedContactIds=[]; no body text until an explicit individual message choice or later saved confirmed-contact selection |
| Batch bounds | at most 500 UIDs / 20 records / 50KiB payload per cycle |
| Saved text bound | at most 8KiB from one eligible text part, at most 64KiB encoded part fetched |
| Polling | separate host thread, no more often than 60seconds; transport backoff60/120/300 |
| Message changes | read-only EXAMINE / BODY.PEEK; no Seen mutation, STORE, APPEND, delete, attachment/image/URL fetch |
| Atlas | persisted inbox/status and owner-selected text only, conversation/project-bound; no configuration, link, select-text, reply job or send capability |
| Outreach | broad outreach remains paused; no contacts, history or addresses imported automatically |

## Required rollout order after the explicit scope approval

1. Verify the reviewed migration hash and apply only `20261017191904_sales_strato_inbox.sql` to the named Supabase project with the source migration version preserved. Do not replay unrelated migrations or alter the frozen14/30 baseline. Verify the four RLS tables, service-only table/RPC ACLs, policy absence, catalog classification, ledger guard and database advisors. A build guard failure must not be bypassed.
2. Produce the protected PR preview from the reviewed server source. Record the exact server SHA, deployment ID, origin and ready/build receipt; test the manager contract on disabled inbox config. The current B1 origin is `https://ai-operating-platform-pylml26ek-bumbi190s-projects.vercel.app`; no origin change happens silently.
3. Stage a distinct immutable client installation from the reviewed source, hash every file and verify its manifest before changing the active task. Record the client SHA/manifest and server SHA/origin separately. Preserve the existing active manager and mailbox credential references; never create a new password/setup or private key as an upgrade side effect.
4. Explicit origin migration: validate the old connection/config origin and project/worker tuple; preserve `activeRef`, `managerRef`, pending rotation and active mailbox references; preserve the existing RSA key reference via the trusted `mailboxKeyRef` configuration field. Change only the validated origin/install pins in the atomic local metadata. Confirm the existing public key kid is unchanged without printing private key or password material.
5. Verify ownership of exactly `\\Omnira\\Omnira-Sales-49d30271-cf0b-47c9-a70d-2bce5b9b09ba`, current interactive SID, Python executable, old root and old manifest. Stop only that task; verify its old process is absent before registering/starting the new pinned task. Never use broad process termination. Confirm one host process/lock and heartbeat with the existing generation2 identity.
6. Save the exact approved disabled scope, verify it, then enable its current version. Observe one bounded real batch; report only counts, cursor, receipt and status. Check Seen flags unchanged, durable cursor after a host restart, and no duplicate occurrences. Do not copy actual message content to Git or logs. If no relevant real reply exists, explicitly report that limitation rather than claiming a real reply was proved.
7. Publish the activation receipt and installed pins. B3 reply-specialist preparation gets a separate concrete plan; C sending is separate. The current initial-contact draft queue must not be represented as reply preparation.

## Current live proof

Read-only database observation at2026-10-17T19:53Z: B1 mailbox authenticated, generation6, IMAP proof19:07:18.240548Z, SMTP proof19:07:17.925556Z. Host online/CLI ready, generation2, latest heartbeat19:53:04.351399Z; contacts0, jobs0. B2 schema absent and no B2 permission active. These facts do not prove an inbox import.
