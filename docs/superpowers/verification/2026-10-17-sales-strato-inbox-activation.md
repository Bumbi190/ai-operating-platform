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

## Reviewed final candidate pins and recovery
Client source 7acf719ae34f8d45230539c9735a458bcbf5847d; manifest 849135da5819f9cb4e1b69d93aedebe56d9d61b763b45817353faebac9a77287;49 files; staged Python108/108. Reviewed migration SHA256 1013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1. The active B1 task is unchanged; exact ownership and candidate startup plan were verified without Apply. Once an inbox config exists, a different email is explicitly refused and requires a distinct connection identity, preserving UID namespaces. Same-address password renewal is allowed but requires saving/activating the scope again; owner and Atlas effective status now explain that fence. Before changing origin, require the exact old RSA key entry to exist and public kid to match; never invoke key creation as a missing-key fallback. Server preview pin remains pending the approved migration/build gate.


## Actual activation 2026-10-18

Supersedes the earlier preactivation status. André requested continuation after the concrete INBOX scope proposal; activated exactly that scope, since2026-10-07T22:00Z, selectedContactIds=[], configversion2/mailboxgeneration6. No body selection, model job or send.

Reviewed SQL1013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1 applied through MCP. Its automatic history version20261018034640 was corrected to approved source20261017191904 by one-row DML guarded on exact generated version/name/statement cardinality/SHA256; no SQL change. Four live RLS tables/zero client grants or policies,16 invoker routines/empty search_path/service-only EXECUTE verified. Security advisor adds only intentional no-policy INFO. Performance advisor reports seven missing FK indexes and two unused indexes at pilot size; no inbox WARN. Existing unrelated warnings remain outside scope.

Three other independently applied migrations were reconciled byte-for-byte from existing git4b4336a after live ledger hash comparison; no extra DDL applied. Their17 table classifications were captured read-only; local_text_jobs retains column-only authenticated owner SELECT and TENANT_RLS, verified separately from table grants. Canonical137/enforced123, ledger160, frozen14/30. Guard/security tests103/103 pass; actual Vercel build guard123/123 and160 known ledger names passes.

Protected preview READY dpl_J12MNKMNf8Eu4pXGQZpYY2BBdb5K, serverSHA b2a5ef227f60648d92531621f12e6aaf23f64db1:
https://ai-operating-platform-lc074jvu6-bumbi190s-projects.vercel.app/projects/handlarborsen/sales
Initial probe while build was unfinished refused; after READY, existing manager poll and disabled inbox contract both passed. Actual origin migration preserves manager/active mailbox credential references and exact existing RSA kid. Host rotated independently overnight to generation3 before rollout; current journal state was preserved rather than overwritten with old generation2 metadata.

Installed client source7acf719ae34f8d45230539c9735a458bcbf5847d,49 files, manifest849135da5819f9cb4e1b69d93aedebe56d9d61b763b45817353faebac9a77287. Verified owned task, stopped oldPID5208 and proved absence before newtask registration/startPID41292. Restarted only that owned task, proved41292 absent before newPID42904; exactly one host and OS lock verified. Manifest reverified after restart. Current host heartbeat/CLI ready and generation3 observed.

Real batch71960328-aeb4-4d02-a739-d49b9a083a4d accepted6/inserted6 at03:53:27Z; cursor UIDVALIDITY1791301212/UID20/epoch1. Six saved messages and occurrences, zero bodies, zero duplicate occurrence groups. Bounded read-only Seen comparison covered all6 in-scope messages and changed0. After actual host restart, batch1c8acb41-eb95-45ef-b566-5fc4de1d45f0 accepted0/inserted0, same cursor and6 occurrences. Owner read contract returns6 visible messages, effective inbox/reading true, current scope true, sending false.

Limits: relevance/customer-reply identity has not been established; contacts0/jobs0 and body text0. Do not describe this as an actual prepared customer reply or successful customer contact. André still needs to recognize one real incoming message in the private owner view; that explicit manual acceptance item remains open. This is not a mobile/browser-session login proof. Full repository remains baseline-equivalent with401 historical failures, not all green.

All automated rollout checks completed. Task5 retains the manual owner-message verification item; its own workspace is retained pending that check. B3 concrete reply-preparation plan is prepared separately, awaiting review; C sending and broad outreach remain inactive.
