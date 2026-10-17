# B2 independent review and single fix pass

One fresh-context whole-increment review used gpt-6-astra at BASE2da7859 -> candidateba735c5. No Critical findings; three Important findings and one Minor. No reviewer was asked to re-review the fixes. The reviewer did not edit files, authenticate to a mailbox, apply DDL, launch services or send messages.

## Important findings and regression proof

1. Encoded multipart filenames bypassed attachment exclusion. `mime_text.select_text_part.attached` recognized literal NAME/FILENAME but not RFC2231 extended/continued forms. Regression covers NAME*, NAME*0*, FILENAME*, FILENAME*0* and lowercase continued names on both multipart parameters and inline disposition. Observed RED: five subcases selected an attachment child; wire regression also returned complete text. GREEN: exclusion normalizes the base parameter name before traversing the container; no child MIME/body fetch.
2. Address replacement retained the previous account's mailbox row/UID namespace. B1 allowed replacing email while retaining mailbox ID; UIDVALIDITY/UID is not an identity across accounts. Chosen fix: a server-side trigger refuses address changes once an inbox config exists, with fixed P0I01 / MAILBOX_IDENTITY_REQUIRED response. Same-address password renewal remains supported. SQL RED expected refusal but got SUCCESS; GREEN explicitly refuses the different address, preserves original email/generation and creates no setup. Owner API RED503 -> GREEN409 with named code. Browser RED generic failure -> GREEN explanation that another address needs a separate connection. No old history can silently appear under a newly substituted account.
3. Saved enabled config could be displayed as active after credential generation fenced it. SQL now returns effective inboxEnabled, readingEnabled, scopeCurrent and fixed reasonCode separately from saved config.state. Reading status also accounts for host offline/pause and project/global pause, without gating on Claude readiness. Owner UI explains scope reconfirmation and never labels stale enabled config as active. Atlas guide requires the effective fields. SQL projection assertion RED -> GREEN; Atlas guide assertion RED -> GREEN; authenticated-replacement browser case RED -> GREEN. Unknown/failed status refresh is explicitly unverified.

After changes: Python108/108 PASS; focused owner/Atlas tests20/20 PASS; SQL inbox transaction tests PASS; typecheck0; browser8/8 PASS. Full DB integration, scoped security/schema and final broad comparison are recorded in the main verification report after they complete.

## Deferred minor

Polling refresh replaces appended message pages with page1 after20seconds. Persisted messages and an open detail remain intact; loading older pages again is possible. Deferred as a UI continuity issue under the agreed one-pass rule; no data-loss or sending claim is implied.

## Reviewer boundaries and parent decisions

- Live Strato behavior, production ACL/catalog, new protected preview and active B2 installation were not assessed because they remain unactivated. Parent keeps these as explicit rollout gates and makes no live-import claim.
- Reviewer relied on the supplied broad comparison rather than rerunning it. Parent independently ran the exact-base/current suites and isolated rechecks and preserves full failure identities/raw counts.
- B3 replies and C sending remain outside this increment, unavailable and subject to separate concrete implementation/authorization.
