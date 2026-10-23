# P43 fixed read-only inventory — 2026-10-23

Scope: `feat/atlas-creative-p43-protected-install-design`, starting at
`c3b89bc7bb90dc6c05eb1e2ee5d55f5eb6204a14`. No shared code changed.
This inventory grants no authority to install or run any binary.

Run from a standard Windows operator session, using installed Node:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/creative-tools/p43-readonly-inventory.mjs
& 'C:\Program Files\nodejs\node.exe' --test scripts/creative-tools/p43-readonly-inventory.test.mjs
```

There are no CLI arguments, including help, path, account, nonce or mode selectors.
Stdout is one JSON object plus newline, at most 8,192 UTF-8 bytes. Exit 2 means
argument/identity/internal refusal; exit 0 means observations were attempted,
including observations that remain UNKNOWN. Neither exit means acceptance.
No raw errors, paths, account identities, SIDs, ACLs or packet text are serialized.

## Fixed scope and identities

The fixed system PowerShell executable is
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`; alternate Windows
locations fail closed. No profile or shell is used. PATH and module search are
fixed to Windows system locations. The constant command uses WindowsIdentity,
WindowsPrincipal and system-directory `whoami.exe` to require a medium-integrity,
non-administrator token. System/service identities, the named worker account,
impersonation and other integrity levels are refused before inventory source I/O.
An unavailable/failed identity query also refuses before source I/O. The only
optional account query imports only this approved, version-pinned file:
`C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.LocalAccounts\1.0.0.0\Microsoft.PowerShell.LocalAccounts.psd1`.
It then calls module-qualified `Get-LocalUser` for `omnira-media-worker`.
There is no fallback, arbitrary module path or module-name search. Import/query
failure remains worker UNKNOWN; this observation cannot bypass any identity or
authority gate. No account mutation is implemented.

UserProfile and LocalApplicationData come from Windows Environment.GetFolderPath,
not CLI/environment executable selectors or the worktree. The fixed source roots
are LocalApplicationData/Temp and UserProfile/Projects/Omnira/External/ArtCraft.
The packet nonce is `51fae6e28a794c12a727c558640cf239`; only its fixed historical
`omnira-launcher-review-<nonce>` directory is enumerated (at most five entries
per listing, two listings).
Unexpected, missing or duplicate packet entries keep the overall packet result
`untrusted/unexpected_entries`. Collection still observes only the four fixed
filenames below; unknown entries are never opened or individually inspected.
Each known entry retains its own mismatch, link/reparse, missing or unreadable
status, even when the packet's entry set is unexpected. A known matching leaf is
`observed`; only the overall exact packet can become `observed_match`. If ancestor
revalidation fails, further reads stop and prior entry observations are retained.

| Packet leaf | Exact bytes | Expected identity |
| --- | ---: | --- |
| SyntheticLauncher.exe | 79360 | SHA256 `bdcf4c6c765045f07277b8fd002b89931caa97955671721a279255d697ceedc6` |
| review-manifest.json | 2352 | SHA256 `1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504` |
| owner.txt | 32 | Exact ASCII nonce, no newline; SHA256 computed from this constant |
| manifest.sha256 | 64 | Exact ASCII manifest digest above, no newline; SHA256 computed from this constant |

PhotoCraft 0.10.0 leaves, beneath the fixed ArtCraft root:

- `photocraft/portable/photocraft-0.10.0-windows-x64-portable/photocraft-cli.exe`:
  SHA256 `109a13782578b03f56d7f3180b3729d9555ece5e936baeb5672ec2dcb28fbf51`.
- `photocraft/photocraft-0.10.0-windows-x64-portable.zip`:
  SHA256 `66b7e47d66589eb6947c8d7417c80fa44621cf83823ffdc47f42024eb03bd5d2`.

PhotoCraft reads have a 256 MiB ceiling per leaf, not an asserted expected size.
No archive extraction, executable import, Authenticode check or execution occurs.
The historical packet source commit is `f5eaa713c8290fc0154c73796841afbd38fc1bad`;
later P42 native fix `60d9cca` does not establish this packet's executable identity.

SHA256 identities of the final code/test bytes at this evidence capture:

- `scripts/creative-tools/p43-readonly-inventory.mjs`:
  `9c379824154c315c67a934788116128785aa2aa6b76e81d5ec65347067e1aa3d`.
- `scripts/creative-tools/p43-readonly-inventory.test.mjs`:
  `b092b8c090c95c26a99acdc9b836d525a4bdedf63b10b95c516924c83cc5816a`.

## Report meaning and safety limits

`observed_match` means only that observed sizes/digests/text agree with constants.
`mismatch` means an observed deviation. `untrusted` means an observed link,
hardlink, identity change or unexpected entry. `UNKNOWN` preserves `not_found`,
`access_denied`, `io_error`, size-bound and query-unavailable categories; it never
asserts absence or success. Worker `disabled`/`enabled` is only a local account
query observation, not a worker-token or operational acceptance.

The four top-level authorization/readiness booleans and all nine named P42
authority fields are always false, including on complete hash agreement.
`authenticated`, `sourceIntegrityVerified` and `p42NativeVerifierAccepted` are
also always false. The inventory never intentionally names or enumerates protected root;
unexpected redirect under hostile same-user is not ruled out. Protected-root existence
and ACL trust remain UNKNOWN/not_inspected. Ledger, installed trust, runtime provenance,
network containment, actual worker and human approval remain unverified.

Reads hash through one retained file handle, use fixed bounds and compare
before/after file identity, links, size and timestamps. Ancestor names are planned
lexically using Windows path semantics, bounded to 32 directories including the
volume root, before any ancestor filesystem I/O. Checks start at the volume root,
reject observed symlinks/reparse points or canonical redirection before proceeding,
and revalidate prior canonical ancestors from the root before each descendant.
The chain is also revalidated before each fixed packet leaf and before the second
listing, and after PhotoCraft reads. There are no recursive scans.
Node lstat detects ordinary symlinks/junctions and file link counts. **Unresolved
safety gaps:** Node built-ins do not expose all Windows reparse tags, native
parent-relative acquisition, native held-directory/open-reparse-point acquisition,
or share-denial of concurrent write/delete. Metadata and canonical-path checks
cannot provide absolute protection against concurrent substitution. An unsupported
reparse tag or a transient
substitution restored between observations may evade these checks. No hash match
is therefore promoted to source integrity or trust. There is no general native
filesystem I/O wall-clock guarantee; the system probe has a ten-second timeout.
This is not P42 native verifier acceptance and must never be an installer preflight
or authentication anchor. Nothing is copied, written, enabled or cleaned up.

## Failed attempts (kept separate from final evidence)

- Initial tests before implementation: 0/12 passed, exit 1; missing module/API.
- Added hardening regressions: 14/16 passed, exit 1. The uninspected root had an
  inaccurate access-denied label, and collection injection could replace false
  gates in the internal result. Fixed with an explicit not-inspected category and
  selective observation assignment; output serialization independently fixes gates.
- An over-restricted system-probe environment caused identity-unavailable refusal,
  exit 2, before source reads. Retained the ordinary process environment with fixed
  PATH/module search overrides. A diagnostic Node `-e` attempt also hit PowerShell
  quoting syntax failure; subsequent diagnostics used stdin. No package ran.
- `rg` was unavailable; Git initially refused repository ownership. Used scoped
  file reads and a per-command `safe.directory` override; no global Git changes.

## Review-fix failed runs (2026-10-23, distinct from final evidence)

- Tooling: `rg` remained unavailable; initial Git ownership refusal was resolved
  only per command. A per-command `core.excludesFile=NUL` attempt failed with
  "cannot use NUL as an exclude file"; reran without that override. Git status
  completed with read-permission warnings for the global ignore file; no Git
  configuration or permissions were changed.

- Regression setup run: 17/22 passed, 5 failed, exit 1. The existing private
  ancestor/collection/probe functions were not yet exported for injected I/O.
  This was a harness setup failure, not the behavioral reproduction.
- After adding only export/dependency seams with unchanged behavior: 17/22 passed,
  5 failed, exit 1. Reproduced deepest-child-first lookup, descendant inspection
  before junction rejection, 32 I/O calls before depth rejection, missing per-leaf
  packet observations on unexpected entries, and the unversioned module import.
- After the three fixes: 22/22 passed, exit 0. Additional collection/revalidation
  coverage then produced 23/24 passed, exit 1: a test's literal expected nonce
  digest was incorrect. Independently checked with Python hashlib and corrected
  that test expectation; no production change was needed for that failure.
- Final evidence below supersedes the earlier implementation's 17/17 run and
  worker UNKNOWN result. The reviewer-reported normal Hultgren/Andre run had
  packet and PhotoCraft SHA256 observed_match but worker UNKNOWN/query_unavailable;
  its separate Get-LocalUser showed disabled. That is supplied historical evidence,
  not a fresh interactive-account observation from this fix session.

## Final evidence (review fixes, 2026-10-23)

Targeted command:
`& 'C:\Program Files\nodejs\node.exe' --test scripts/creative-tools/p43-readonly-inventory.test.mjs`.
24/24 passed, no failures/skips/cancellations, exit 0, installed Node v22.22.3,
current non-elevated CodexSandboxOffline context. The original 17 tests remain;
new coverage exercises root-first canonical ancestry, parent junction/reparse/
redirect refusal before descendant lookup, depth refusal before I/O, canonical
parent substitution, collection with extra/missing/many unknown entries, known
changed/link/missing leaves, unknown entries appearing/disappearing between
listings, five-entry enumeration bounds, the versioned probe import command,
identity guard ordering and worker fields that cannot bypass false gates.
Tests use only self-owned retained temp bytes and injected Windows filesystem/
process mocks. No protected directories are used. No automatic cleanup occurs.
The exact historical all-match packet test uses mocked observation records;
collection byte fixtures are not represented as authenticated historical binaries.

The actual fixed CLI in this context completed with exit 0 and exactly one
1,108-byte JSON report plus its included newline (empty stderr): worker **disabled**; packet UNKNOWN/access_denied; both PhotoCraft sources
UNKNOWN/not_found under this account's OS-derived home; protected root
UNKNOWN/not_inspected. These are not fresh observations from Andre's interactive
account. No elevated session was created to test refusal; those paths use mocks.
All four top-level authorization/readiness flags, all nine named authorities,
and authenticated/sourceIntegrityVerified/p42NativeVerifierAccepted are false.
The CLI emits only allowlisted observations in one JSON plus newline, capped at
8,192 UTF-8 bytes; worker disabled grants no authority.

`git diff --check` exited 0. Explicit no-index `--check` comparisons against
`/dev/null` emitted no whitespace errors for all three untracked files (exit 1
indicates their added-file differences). Only the three P43 deliverable files are uncommitted/untracked.
Existing Node304 was not run because no shared code changed. No P42/P40 native
test wrapper, worker, PhotoCraft, FilmCraft, SyntheticLauncher.exe, installer or
privileged binary was executed. No elevation, ACL/firewall changes, migrations,
staging, downloads, commit or push occurred. No other worktree was changed.

## Independent review and fresh Hultgren operator verification (2026-10-23)

A separate read-only security reviewer inspected the final P43 CLI, test suite and this evidence against the P43 proposal. **No remaining High/Medium actionable findings** were reported: both earlier root-first traversal and unexpected-entry/known-leaf findings were addressed. The reviewer observed one Low test weakness: an unequal-digests assertion could pass when one read returned no digest. The test now first asserts both file observations have status `observed`, and each digest matches the 64-character lowercase SHA-256 format, before checking inequality. The ordinary Windows targeted suite was rerun and **24/24 passed, exit 0**, no skipped tests. The corrected test SHA-256 is recorded above. No new production behavior was introduced by this final test-only change.

A fresh **standard non-elevated HULTGREN\\Andre** read-only execution via the fixed installed `C:\\Program Files\\nodejs\\node.exe` then produced one bounded JSON report (exit 0, no editor or package execution). Its historical P42 packet status was `observed_match` for all four fixed entries, including host length 79,360 and host SHA-256 `bdcf4c6c765045f07277b8fd002b89931caa97955671721a279255d697ceedc6`, manifest length 2,352 and SHA-256 `1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504`. PhotoCraft 0.10.0 CLI was 76,295,544 bytes with pinned SHA-256 `109a13782578b03f56d7f3180b3729d9555ece5e936baeb5672ec2dcb28fbf51`; its release archive was 84,828,713 bytes with pinned SHA-256 `66b7e47d66589eb6947c8d7417c80fa44621cf83823ffdc47f42024eb03bd5d2`. The worker-account observation was **`disabled`**. Protected-root ACL stayed `UNKNOWN/not_inspected`.

Every top-level authority/readiness field, all nine P42 authorities, `sourceIntegrityVerified`, `authenticated`, and `p42NativeVerifierAccepted` remained **false**. This finite observational report is **not** an independently authenticated installation package or a strong Windows reparse/TOCTOU guarantee. A real protected ACL audit, independent approval anchor, trusted copy-only bootstrap, actual worker-token/network/broker qualification and a separate private PhotoCraft job approval remain required. This operator verification did not enable a worker, edit ACLs/firewall, elevate worktree code, copy binaries, create approvals, execute the synthetic host or creative editors, or deploy anything.
