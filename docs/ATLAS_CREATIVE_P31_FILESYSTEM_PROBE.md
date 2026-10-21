# Atlas Creative P31 — synthetic AppContainer filesystem diagnostic

Parent: P30 Draft PR #500, commit ec42f9f. Date: 2026-10-21.
Scope: throwaway diagnostic and reference source only; no installed worker,
runtime adapter, editor, migration, service or production change.

P30 established bounded IPv4/IPv6 loopback non-connectivity with receiver-side
AppContainerLoopback WFP correlation. It did not establish filesystem
confinement, dedicated worker-token behavior, all-network denial or readiness.

## What this probe measures

Run only from a fresh ordinary, unelevated Windows PowerShell session.
The wrapper and C# Run both reject administrators before creating fixtures.
It creates one unique own-user AppContainer profile and one GUID-named
synthetic directory under the known LocalApplicationData/Temp directory.
No existing project files, protected ledger, credentials or user media are read.

Every trial has ordinary controls before and after, plus one zero-capability
low-integrity AppContainer process. Fixed system curl is created suspended,
assigned to a kill-on-close, active-process-limit-one job, inspected for the
exact expected package/token facts, and resumed only after those checks.
There are no inherited handles. Ordinary controls must exit0 and copy exact
canary bytes. Both source canaries are rechecked after every trial.

| Trial | Restricted expectation |
| --- | --- |
| Own profile read/write positive control | exit0, exact canary copied within fresh profile |
| Read from external synthetic fixture into fresh profile | exit37 AND output absent or verified regular zero-length file |
| Write own-profile canary into external synthetic fixture | exit23 AND output absent via exact parent enumeration |

"External" means outside the new profile but still inside this probe's owned
synthetic fixture. It never means an arbitrary caller-supplied directory.
Any nonempty partial copy fails the read-denial check.

Fixed-drive paths and existing directory ancestors must be non-reparse;
input URLs must be hostless local file URLs. UNC/device paths and mapped
network drives are rejected; --proto =file, no remote URL/redirect or
proxy/config inheritance. This avoids the UNC/SMB trap in file-protocol
tests. Metadata checks are not atomic handle-based containment.

Diagnostic output includes restricted curl text, token facts, synthetic
fixture identity and cleanup observations. Readback is bounded to the
small known canary and diagnostic text.

## Cleanup and limits

Canaries use CreateNew. Outputs must be absent before each curl launch.
The external fixture cleanup names only its four known synthetic files,
rejects reparse/type surprises and uses nonrecursive Directory.Delete.
Unexpected extra entries leave cleanup unverified rather than recursively
deleting them. The profile is deleted with its Windows API, then package
storage absence and registry mapping absence are independently corroborated.
Cleanup waits until all processes have stopped.

These are bounded same-user diagnostic fixtures, not protection against an
adversarial same-user path-swap race. In particular, curl output creation is
not an atomic exclusive-create deployment mechanism. Never reuse this code
for privileged copying or real untrusted payload execution.
A passing write-denial observation applies to the combined low-integrity
AppContainer token; it does not distinguish MIC from package-DACL enforcement.

Even every diagnostic row passing leaves WorkerTokenVerified,
ReparseRaceProtectionVerified, GeneralFilesystemIsolationVerified and
ProductionReady false. It does not test actual protected approvals/nonces,
other projects, alternate file access APIs, descendants, brokers, DNS/UDP/LAN
or editor compatibility. No ACL, firewall rule, account or service is changed.

## Standard-user command

No execution-policy change or elevation. At an ordinary PowerShell prompt:

```powershell
powershell.exe -NoProfile -File "C:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-p31-filesystem-probe\scripts\creative-tools\worker-appcontainer-filesystem-spike.ps1"
```

Supply the result before any additional test or activation decision.
No worker activation is authorized by this diagnostic.

## Validation before actual operator run

- Full reference C# compiles with fixed system .NET Framework csc and explicit
  system references, without loading/executing the output assembly.
- Windows PowerShell5.1 parser accepts the wrapper; it was not run elevated.
- A reviewed fixed literal of the file helper methods passed10/10 checks:
  hostless escaped local URL with spaces, UNC/device rejection, actual
  fixed system curl file-only transfer with exact contents, absent/zero-length
  versus partial/full outputs, exact-content mismatch and source preservation.
  No AppContainer or worker process was started in that helper check.
- Source helper equality to that tested literal and git diff --check are
  required before commit. The reproducible helper reference is
  ATLAS_CREATIVE_P31_FILESYSTEM_HELPER_TEST.txt.
- Independent actual-source review caught and corrected partial-copy
  acceptance; the result now requires no output or verified zero bytes.
- Actual standard-user AppContainer filesystem result: NOT YET RUN.

Keep this PR Draft, stacked on P30. No merge/deployment/activation.
