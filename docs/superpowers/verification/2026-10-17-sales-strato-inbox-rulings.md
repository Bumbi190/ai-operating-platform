# B2 implementation rulings and deferred minor

Chronological decisions include the historical preactivation gate and actual2026-10-18 rollout. Automated activation is verified; the plan ledger remains pending the explicit owner check of a real incoming message.

## Rulings in chronological order

1. Ruling: skill shell workspace/task scripts are unavailable on the authorized Windows device (resource read failed); use equivalent owned workspace, task briefs, BASE records and test logs here. No scope or approval gate changes — cost if wrong: less automated bookkeeping, explicit task records retained.

2. Ruling: apply bounded concrete header limits in implementation (from/to254, subject512, message-id998, references20, aggregate header4KiB), selected contacts<=50 and total batch50KiB — plan requires bounded data without exact values — cost if wrong: large headers become visible unsupported records, never silently omitted.

3. Task1 Ruling: vanished records use nullable headers/date/size rather than invented metadata — an IMAP expunge can remove all observable data — cost if wrong: explicit vanished row needs manual interpretation.

4. Task1 Ruling: content fingerprint is SHA256(UTF8 tag OmniraInbox/v1 plus newline || binary headerSHA256 || uint64be UTF8 text byte length || exact UTF8 text), shared in TS/SQL/Python — avoids requiring raw attachments for a message-wide digest — cost if wrong: harmless duplicate evidence remains for review, no automated campaign.

5. Task1 Ruling: late text fills retain old message IDs/contact decisions as content aliases and move occurrence references to one canonical content record — avoids a unique-key failure and never merges branch contacts — cost if wrong: alias provenance needs review; aliases without contact decisions are hidden from ordinary paging.

6. Task1 Ruling: staged schema registry explicitly marks4 inbox rows live=false and classified count139 while retaining last observed production135; guard134/120 and synthetic ledger157, frozen14/30 unchanged — required new schema classification without false production claim — cost if wrong: apply-before-preview remains blocked.

7. Task5 pre-flight Ruling: existing Vercel apply-before-build guard prevents a runnable preview until this enforced migration exists in the live ledger; preserve final concrete read-scope gate, prepare all code/local proof/review first, then approved scoped apply and preview/installation — no bypass — cost if wrong: final activation waits for deployment verification.

8. Task4 Ruling: backlog display reports only known pending selected text in the loaded page and explicitly states the remaining mailbox count is unverified — the durable cursor does not contain an authoritative mailbox total — cost if wrong: no precise full-mailbox backlog count or ETA.

9. Final: Ruling: refuse address replacement once an inbox config exists rather than introduce another account namespace into this increment — preserves UID/provenance identity and allows same-address password renewal — cost if wrong: another address requires a distinct connection/identity even when the prepared scope is unused.

10. Final: Ruling: reviewer left live Strato/production ACL/preview/active installation unjudged — retain explicit concrete-scope rollout gate and do not claim them tested — cost if wrong: real-provider/deployment problems can remain until gated rollout.

11. Final: Ruling: reviewer did not rerun broad suites — parent independently ran exact-base/current and isolated54/54 recheck, retains all identities/raw counts — cost if wrong: historical401 repository failures remain outside this increment.

12. Final: Ruling: reviewer left B3/C outside scope — preserve separate reply-preparation/sending implementation gates — cost if wrong: automatic replies/sending remain unavailable.

13. Task5 Ruling: MCP assigned apply-time version; preserve approved source version with a one-row exact version/name/cardinality/SHA256-guarded history correction. SQL unchanged and ordinary guard retained — cost if wrong: migration bookkeeping identifies the wrong source; stored hash and live catalog were independently verified.

14. Task5 Ruling: reconcile three independently installed local-text/watch migrations only from existing Git SQL blobs equal to live ledger hashes and17 observed table classifications; retain frozen14/30 and local_text_jobs column-level owner policy — cost if wrong: source bookkeeping could disagree with independently owned features; no unrelated runtime or DDL changed.

15. Task5 Ruling: keep the reviewed B2 SQL unchanged after informational performance advisors for seven missing FK indexes and two unused indexes; current pilot has6 messages and bounded batches — cost if wrong: larger mailboxes may need a separately reviewed index migration.

## Deferred minors

- Final: minor (deferred): polling replaces appended older message pages after20seconds; durable records and open detail remain, older pages can be loaded again.
