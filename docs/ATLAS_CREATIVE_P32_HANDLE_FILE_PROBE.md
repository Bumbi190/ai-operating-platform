# Atlas Creative P32 — synthetic native handle read prototype

Date: 2026-10-21. Parent: P31 Draft #501, commit0ab35a3.
Scope: standalone standard-user diagnostic reference; no installed worker,
project input adapter, editor launch, privileged copy or production change.

P31's three actual standard-user file-protocol observations passed. It did
not close the pathname check/reopen gap or establish reparse race protection.
This prototype investigates native handle-relative read mechanics separately.

## Read mechanism

The test binds a fresh local NTFS synthetic root using CreateFileW with
OPEN_REPARSE_POINT/BACKUP_SEMANTICS and read sharing only. Root identity,
filesystem/volume and canonical final path come from the opened handle.
It does not validate root ACL trust.

Relative names have a bounded ASCII component grammar (max5 components,
max64 characters each, max320 overall). Traversal, alternate streams,
backslashes, UNC/device forms, reserved DOS names and trailing dots fail
before native lookup.

Each component is opened using NtCreateFile with the previous directory
handle as RootDirectory, FILE_OPEN, SYNCHRONIZE, synchronous nonalert I/O,
FILE_OPEN_REPARSE_POINT and OBJ_DONT_REPARSE. Handles are non-inheritable,
with no write/delete sharing; all parent handles stay alive through the read.
No fallback is attempted if a flag/API is unsupported.

Metadata rejects reparse points, incorrect file/directory types, non-disk
handles and multi-link leaf files. Exact canonical final path is corroborated.
The bounded read (<=64KiB) uses the SAME leaf handle and rechecks handle
identity, byte size, link count and write timestamp before returning data.

## Synthetic native cases

The fixture creates only GUID-owned local Temp directories, small known
canaries, a directory junction pointing to its own synthetic sibling, and a
hardlink to its own sibling canary. There are no real project/ledger reads.

18 intended observations:
- Unpinned root/parent rename, delete and write controls succeed.
- Junction/hardlink fixture controls actually reach the known sibling canary.
- Normal nested read returns exact bytes through the held handle.
- Root rename, parent rename, leaf deletion and write-open fail with the
  expected Windows sharing error32 while handles are pinned.
- Junction traversal and hardlink leaf return specific refusals.
- Six unsafe relative-name cases are rejected before lookup.
- A read larger than the caller's cap is rejected.
- Rename operations work after all handles are disposed.
- Both synthetic source canaries remain unchanged.

Arbitrary mutation failures do not count as containment. Setup must succeed
before a link-rejection observation is accepted. All pinned handles must be
disposed before exact, nonrecursive cleanup.

## Standard-user requirement and limits

Both C# Run and the wrapper reject an administrator context before creating
fixtures. The wrapper rejects it before imports/source compilation too.
No elevated fixture execution was performed.

The initial review identified why elevated execution would be unsafe:
fixture cleanup resolves paths after handles are closed, and the Temp
fixture is user-writable. Standard-user enforcement removes the privilege
amplification; it does NOT make cleanup a race-safe production mechanism.
Do not reuse cleanup or fixture construction for privileged deployment.
Do not run concurrent programs that alter the synthetic fixture.

RootAclTrustVerified, WorkerTokenVerified,
GeneralReparseRaceProtectionVerified and ProductionReady remain false even
if every synthetic observation passes. This is not an adversarial concurrency
proof, protected-ledger access check, generic hardening library, AppContainer
token check or dedicated worker validation. It does not test every reparse
tag, hardlink race, broker or editor API. No worker/account activation,
network request, existing project ACL change or production deployment.

## Validation so far

- Full source compiled with fixed system .NET Framework csc and explicit
  system references, without loading/executing the output assembly.
- Windows PowerShell5.1 wrapper parsed without execution.
- 15/15 pure lexical cases passed using an authored reviewed literal:
  3 allowed paths and12 disallowed names/forms; no native calls/file I/O.
- Tested path-grammar source equality and git diff --check required before
  commit.
- Independent reviewer read actual source and wrapper; elevated-cleanup
  execution blocker fixed by standard-user enforcement, then re-reviewed
  with no remaining confirmed blockers for standard-user reproduction.
- Actual18 native observations passed in both the operator run and an automatic standard-user run; see results below.

Microsoft API references:
- https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information

## Reproduce

Use ordinary PowerShell; do not elevate or change execution policy.

```powershell
powershell.exe -NoProfile -File "C:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-p32-handle-file-probe\scripts\creative-tools\worker-handle-file-spike.ps1"
```

Inspect Error, AllTestsPassed, all18 test entries and FixtureRemoved.
A failed cleanup preserves FixturePath for targeted review; do not recursively
delete an unexplained directory. No grant or activation follows this result.

Keep Draft, stacked on #501; no merge/deployment.

## Actual operator and automatic results — 2026-10-21

The operator supplied an ordinary-user result with Error=null, AllTestsPassed=true and all18 test rows true; fixture suffix `f9c073da7e17481e9778d585d4d6c0c6` was reported removed. A fresh read-only check after reconnect independently found0 matching entries in the known Temp parent.

After Desktop Commander reconnected, the remote process independently reported Administrator=false, Windows session1 and the expected Andre user SID. Therefore ordinary-user execution is now available directly; no linked-token synthesis, UAC bypass, service/account change or Explorer workaround was needed. This does not change the documented administrator context of earlier sessions.

The assistant automatically ran the existing standard-user wrapper through fixed system PowerShell with NoProfile. It exited0 at `2026-10-21T13:32:03.3138152Z`: all18 native rows passed, Error=null, ElevatedContext=false and FixtureRemoved=true. A separate parent enumeration in the supervising process found0 entries for automatic fixture suffix `b7273eb6f9bd42e4bb3d64e80e2e35d4`. Structured output is in `ATLAS_CREATIVE_P32_HANDLE_FILE_RESULT.json`.

Git recognized that this earlier worktree's metadata owner was Administrators. Worktree/ancestor metadata were checked for ordinary directory types/no reparse points and the exact known worktree was trusted with command-local `-c safe.directory=...` only. No global Git exception, ownership or ACL change was made.

Conclusion: these18 bounded synthetic native observations passed twice. Root ACL trust, dedicated worker token and general adversarial race/production readiness remain false; no worker/editor/network operation or activation occurred. Automatic ordinary-user runs can be used for subsequent authorized diagnostics while that context remains verified.
