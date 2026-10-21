# Atlas Creative P37 - audit executable lookup and acceptance checkpoint

Date: 2026-10-21. Base: P36 Draft #508, commit c3272c1.
Scope: read-only audit launch fix, regression test and evidence reconciliation.
No account enablement, worker/editor launch, protected provisioning, ACL or
firewall edit, database migration, deployment, publication or merge.

## Concrete correction

worker-safety-report.mjs previously invoked powershell.exe by basename.
Node child-process lookup therefore depended on inherited PATH/current
directory. The CLI now selects the already-observed fixed system executable:
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe.

This removes executable-name lookup for those three existing read-only
audits. It does not attest Windows binary integrity, pin PowerShell module
provenance, secure mutable worktree scripts or make elevation safe. The
read-only scripts and diagnostic classifier are otherwise unchanged.
Never elevate this mutable checkout as a protected worker authority.

The Windows regression places a data copy of the fixed Windows where.exe
in a fresh temporary directory under the name powershell.exe. It supplies
only that directory as the spawned child's PATH and cwd, without changing
the parent/global environment. The actual CLI must still return a valid
report with all activation/execution/publication flags false.

The fixture compares basename lookup against direct execution of that exact
decoy, querying a guaranteed-absent absolute path inside the fresh fixture.
A first fixture wrongly expected a renamed where.exe query of an existing
file to return0; MUI resource differences made that assumption invalid.
Independent review further identified that requiring failure on an existing
file was locale-dependent. The final absent-path query has a nonzero result
whether or not renamed where has usable MUI resources. With the corrected
fixture and old code, the CLI failed with exit2 at the intended assertion.
Only the fresh test-owned directory is removed in finally. No arbitrary
executable is downloaded, installed or authored.

The test is Windows-only; non-Windows runs skip this OS process-lookup case.
It invokes the real existing read-only audit scripts. Missing/unreadable
host resources remain negative diagnostic observations, not authority.
The test does not require those resource checks to be green.

## What the existing evidence actually establishes

These are historical bounded observations, not current worker attestation.
Referenced P30-P36 documents preserve failed configurations and their
separate cleanup follow-ups; P37 does not rewrite their results.

| Evidence | Established observation | Remaining limit |
| --- | --- | --- |
| P30 admin runbook | Independently inspected root and created/verified two private empty ledger directories | Empty ACL scaffold has no operator keys, approvals, nonce/revocation history or service |
| P30 loopback/WFP | Separate WFP evidence observed a loopback policy block | curl timeout remained inconclusive; no full egress matrix or actual worker proof |
| P31 filesystem probe | Three own-storage/external-synthetic read/write observations passed | Synthetic canaries only; not general project/credential isolation |
| P32 handle-file probe | Eighteen pinned-handle/path/link observations passed | Root ACL trust, actual worker token and general adversarial races remained unverified |
| P33 system-child probe | Actual token inheritance, native membership and deliberate job closure | Separate CLR-helper experiment failed; no editor compatibility claim |
| P34 Node readiness | Six parent/child authored-JS configurations passed, including detached children | Installed ordinary and staged restricted paths differ; no trusted deployed launcher |
| P35 explicit breakaway | Three trials denied explicit flag with Win32=5 between successful matching curl controls | Particular direct CreateProcess configuration; arbitrary broker paths unverified |
| P36 abrupt supervisor termination | Six forced-exit cases plus retained-job-handle control passed | TerminateProcess stimulus only; no universal crash, actual worker or machine-failure proof |

Primary evidence lives in the correspondingly named documents and result
JSON files on this branch. No fresh runtime probe was needed to reconcile
these recorded results.

## Remaining acceptance work, in practical order

1. **Select the bounded launcher and file boundary.** Specify the ordinary
   supervisor versus dedicated worker responsibilities, protected code and
   configuration provenance, exact permitted executable/helper paths and
   minimal environment. Combine pinned file-handle reads with verified root
   ownership/DACLs and bounded private output/temp writes. Demonstrate denied
   other-project, credential and protected-ledger access. Do not turn the
   user-writable diagnostic staging paths into a production trust boundary.

2. **Complete effective network and broker acceptance for that design.**
   Controlled reachable endpoints and matching positive controls must cover
   applicable DNS, TCP/UDP, IPv4/IPv6, LAN, loopback, proxy and helper paths.
   Broker-created processes must be denied or explicitly constrained and
   accounted for. API documentation and a failed request are insufficient.
   Do not change global firewall policy as an incidental test fix.

3. **Bind actual human approval to durable authority.** Verify authentic
   operator identity, exact project/input/tool/output scope, expiry, one-time
   consumption, tamper/replay/revocation rejection and protected restart-safe
   history. Integrate the registered worker key and authenticated claim path
   against an isolated staging DB. Offline signatures, empty ledger folders
   and earlier SQL tests alone do not establish this live handoff.

4. **Prepare a concrete dedicated-worker test proposal.** Name exact
   protected implementation/configuration changes, actual account/token
   launch method, effective checks, rollback and stop conditions. Only then
   seek the separate authorization for any required protected provisioning
   or account activation. The existing disabled account and interactive
   AppContainer token are different identities; synthetic tests cannot
   substitute for the actual worker-token evidence.

After all relevant acceptance checks pass, request a single synthetic,
private PhotoCraft job with explicit fixed scope. Validate its real export,
helpers and asset provenance before considering FilmCraft or broader work.
Publication remains a separate human decision. No time estimate or claim
that one more probe makes the system production-ready is justified here.

The next development deliverable should address the selected launcher/file/
network boundary above, using the proven primitives and explicit missing
requirements. Repeating already-passing token/job demonstrations adds no
acceptance evidence unless that implementation changes.

## Final validation and current ordinary-session observations

The final absent-path regression failed at the intended CLI-exit assertion
with the old executable lookup, then passed after restoring the fixed path.
The complete creative Node suite passed304/304, zero failures/cancellations/
skips, exit0, duration26124ms. This includes the actual Windows CLI test,
not just a string inspection of the source. Verification summary:
ATLAS_CREATIVE_P37_VERIFICATION.json. The scoped suite is the existing
creative-tools suite; unrelated web/database/deployment checks were not run.

The real read-only CLI was also run normally after the final suite.
ATLAS_CREATIVE_P37_HOST_READONLY_RESULT.json records archive verification
true, combined worker/account/seven-folder verification false, private ledger
verification false, and all actual-worker/network/human/queue gates false.
All activation, execution, publication, production and changes flags remain
false. No synthetic P31-P36 result was promoted into a live worker claim.

A separate fixed-system-module account read at2026-10-21T17:30:14Z observed
that the worker account exists and remains disabled; the inspecting session
was not elevated. See ATLAS_CREATIVE_P37_ACCOUNT_READONLY_RESULT.json.
The combined false account/folder check therefore must not be described as
an observed account activation. It does not identify every failed ACL check
or prove that protected paths are missing or have changed. P30's independent
administrator observations remain historical; an ordinary-session composite
report cannot refresh protected-directory attestation.

Independent review found the locale-dependent fixture assumption described
above; it was corrected and the final red/green sequence repeated. Review
found no remaining Important findings in the source/test or checkpoint.
The source change is one executable selection plus its explanatory comment;
no readiness policy or protected-state mutation was added.
