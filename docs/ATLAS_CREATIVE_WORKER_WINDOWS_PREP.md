# Atlas Creative Worker — Windows 11 Home provisioning (P4)

Date: 2026-10-20 · Machine: HULTGREN · Repo: ai-operating-platform
Branch: `feat/atlas-creative-tools-p0`

## Verified state after operator provisioning

- The operator executed `worker-provision.ps1 -Apply` manually in an elevated
  Windows PowerShell window; the creation receipt reported success and
  `productionReady=false`. Do not rerun this creation step.
- The non-elevated Desktop Commander session independently confirmed that
  local account `omnira-media-worker` **exists**, is **disabled**, and does
  not belong to local Administrators.
- The ordinary non-elevated session could not inspect the protected NTFS ACLs;
  it correctly returned `restrictedAclsVerified=false` and null existence for
  unreadable subfolders. **Operator-reported elevated, read-only verification
  on 2026-10-20 subsequently returned `restrictedAclsVerified=true`.** All seven
  folders (`root`, `bin`, `queue`, `input`, `output`, `temp`, `receipts`) were
  reported present, ACL-readable, inheritance-disabled, with approved worker
  rights and no unexpected Allow ACEs. This result is supported by the full
  PowerShell JSON transcript supplied by the operator; it is not yet a separate
  independent security audit of effective Windows process isolation.
- PhotoCraft 0.10.0 and FilmCraft 0.9.0 are present in the original ArtCraft
  location; the portable program binaries **and both ZIP archives** match
  their separately pinned SHA-256 hashes.
- The pinned staging plan did not copy any files: `changesApplied=false`.
  Its two destinations are inaccessible to this session, so each is marked
  `targetInspection=access_denied` and `targetExists=null`.
- No NTFS permissions, local user state or firewall configuration were changed
  by the follow-up. The worker remains disabled and no creative execution or
  network isolation has been authorized.
- Five Windows provision/staging tests plus 14 synthetic ACL-policy cases
  passed in the updated test harness. These **do not replace an elevated audit**.

## Implemented operator-controlled scripts

`worker-provision.ps1` (no parameters): read-only provisioning preview.
`worker-verify.ps1`: read-only user, group and NTFS ACL audit.
`worker-stage-binaries.ps1` (no parameters): read-only pinned binary staging preview.

These scripts do not grant approval to Atlas and do not run autonomously.

### Elevated ACL inspection: operator-reported PASS; next gate is staged binaries

The provisioning step and elevated read-only `worker-verify.ps1` inspection
have **already been performed**. Never rerun `worker-provision.ps1 -Apply`.
The submitted JSON reported `restrictedAclsVerified=true`, a disabled
non-administrator account and seven individually passing folder ACL checks.
Do not mistake that result for network/process sandbox verification.

**No further command is authorized by this report.** Before any elevated
`worker-stage-binaries.ps1 -Apply`, obtain a separate owner decision and an
independent review of archive extraction, staging destinations and signatures.
The staging script is designed to refuse changed release hashes, inaccessible
or occupied targets, and any elevated ACL audit that fails. The worker must
remain disabled; do not relax ACLs to force a passing result.

**Do not stage programs or enable the account yet.** Binary staging `-Apply`
also enforces this elevated read-only ACL audit and refuses inaccessible or
preexisting destinations; a separate owner approval and independent review
are still needed before staging. Passwords are never shared in chat or logs.

**No automatic enabling** is provided. Do not use `Enable-LocalUser` until
separate application-level authentication, queue, network restrictions,
independent file-boundary tests and human approval have been implemented.

### Provisioned filesystem

`C:\ProgramData\OmniraCreativeWorker`

| Directory | Worker rights (planned) |
| --- | --- |
| bin | read/execute |
| queue | read |
| input | read |
| output | modify |
| temp | modify |
| receipts | read |

SYSTEM and local Administrators are intended to retain full control, with
inheritance disabled and narrowly scoped worker ACEs. **These effective ACLs
have not yet been independently observed from an elevated session.** No
binaries have been staged and the worker is intentionally **disabled**.
If provisioning was incomplete, stop and review; do not rerun it blindly
or relax ACLs.

## Security caveats

A non-admin Windows account plus NTFS ACLs is **hardening**, not a
proof of a secure OS sandbox. It does not automatically prevent network
egress, spawning alternate programs, privilege escalation, or reading
otherwise public Windows resources. Per-executable firewall block rules
would not reliably block all child-process traffic. An independent review,
strong process restrictions or an isolated VM/container can be necessary.

PhotoCraft and FilmCraft are not proprietary Adobe binaries. Do not expose
their general-purpose MCP command channels directly to an autonomous agent.

## Remaining before a first autonomous media job

1. Independently audit the provisioned disabled worker's actual NTFS ACLs
   from an elevated read-only session; get external security sign-off.
2. Separate authenticated creative queue with explicit signed, one-time
   operator approval and non-replayable storage.
3. Low-privilege local worker that has a **fixed recipe** command allowlist,
   verified input scope, controlled environment and output staging.
4. Verified network/process isolation appropriate for untrusted media.
5. Full execution test through trusted queue (not just direct CLI tests).
6. Independent QC and canonical derived Asset admission; preview and
   separate human publication approval in Omnira.

## Read-only staging review – 2026-10-20

The operator authorized a **review only**, not `worker-stage-binaries.ps1 -Apply`.
The staging has **not** been carried out; the worker remains disabled.

The new `worker-archive-audit.ps1` independently inspected both original
locked release archives without extracting or executing any code:

- PhotoCraft 0.10.0: 9 expected files, 182,054,025 uncompressed bytes.
- FilmCraft 0.9.0: 9 expected files, 153,542,694 uncompressed bytes.
- Both ZIP SHA-256 digests matched `artcraft-lock.json`.
- Exact archive entries, no duplicate/extra or unsafe ZIP paths, zero external
  attributes and bounded compression/total sizes passed.
- The CLI executable **inside each ZIP** matched the pinned SHA-256.
- Original unpacked CLI and desktop executable Authenticode signatures were
  `Valid`, with certificate subject Learning Machines Inc, pinned signer
  thumbprint `54A063654E51CD00D5620C36616F9A6AA30EDD15`.
  An Authenticode result verifies a signer; it does not independently prove
  that the release is safe software or that a Windows sandbox exists.

`worker-stage-binaries.ps1 -Apply` now **requires** the read-only archive
audit after checking the account and folder ACLs in the elevated session. It
rejects an existing/unknown installation parent and reparse points at worker
root/bin, verifies archive and CLI hashes, verifies *both staged executable*
signatures, rehashes the ZIP after extraction, and checks the account is still
disabled. If any proof fails, stop and inspect a possibly partial staging
tree; never blindly retry or loosen permissions.

10/10 targeted Windows Node tests passed, including the live read-only archive
audit and 17 synthetic ZIP-policy cases (traversal, unsafe aliases, metadata,
compression bombs and oversize entries). The **actual staging Apply path has not
been exercised**, and
independent review of privilege transitions, source-file immutability, ACL
inheritance for staged children, extraction behavior and process/network
isolation is still required. An administrator running scripts from a
user-writable worktree remains a distinct trust risk; confirm the reviewed
commit and script contents before any future elevated `-Apply`.

## Privileged source trust review — protected handoff still required

A further read-only ACL inspection demonstrated that the original staging
script, lockfile and ZIPs are owned by the ordinary Windows user, with writable
inherited permissions. **An elevated PowerShell window must not launch
`worker-stage-binaries.ps1 -Apply` from this Git worktree** even though its
archive hashes and signatures are correct: an editable script or source archive
can be changed after review.

The Apply path is now blocked unless:

1. The invoked script lives at exactly
   `C:\ProgramData\OmniraCreativeWorker\control\worker-stage-binaries.ps1`,
   NOT under the ordinary user profile, Downloads or a git worktree.
2. Both `control` and `imports` exist as protected directories, and all
   required control scripts, lockfile, two release ZIPs, CLI/GUI binaries and
   source subdirectories have no reparse points, inheritance disabled, owner
   `SYSTEM` or `BUILTIN\Administrators`, and Allow ACEs exclusively for
   those trusted principals.
3. Import paths and versions match the exact allowlisted patterns. Apply
   rechecks the protected ZIPs with the full nine-entry archive audit and
   Authenticode; it does **not** consume the user's editable ArtCraft source.
4. All previous account/NTFS, destination, hash, signature and disabled-user
   checks still pass.

**The protected control/imports handoff has NOT been built or independently
reviewed.** Its design needs an out-of-band reviewer-pinned commit and SHA-256
manifest, privileged copying into protected folders, independent post-copy
hash/ACL inspection, and no unattended agent authority. Running the current
script from the user profile with `-Apply` must remain disallowed. Even a
correctly gated script is not a substitute for that separate trust ceremony.

No privileged script, staging artifact or worker account was changed as part
of this review; local read-only checks remain available with no `-Apply`.

**Decision state: REVIEW COMPLETE / STAGING NOT APPROVED / WORKER DISABLED.**
Do not enable the account, open network access or use PhotoCraft/FilmCraft
through Atlas until separate approval, signed one-use job admission, sandbox
review and a controlled end-to-end test.

## Proposed protected handoff inventory (read-only; pending review)

`node scripts/creative-tools/worker-handoff-manifest.mjs` performs a streaming
SHA-256 inventory without copying files, changing ACLs, enabling the worker,
opening a network connection or invoking any editing executable. It accepts
**no runtime arguments** in CLI mode.

The fixed `omnira.creative.proposed_handoff.v1` inventory contains exactly:

- Six `control/` files: `worker-stage-binaries.ps1`, `worker-verify.ps1`,
  `worker-acl-policy.ps1`, `worker-archive-audit.ps1`,
  `worker-archive-policy.ps1` and `artcraft-lock.json`.
- Six `imports/` files: the pinned PhotoCraft/FilmCraft release ZIP,
  pinned CLI and observed signed GUI executable for each program.
- Paths are relative to the future protected
  `C:\\ProgramData\\OmniraCreativeWorker` destination. Each file has a
  measured length and SHA-256 digest, and a canonical inventory fingerprint.
  The ZIP/CLI digests must equal the four existing immutable release pins.

This inventory **is not signed by an independent reviewer**. Its control/GUI
digests reflect what is currently in user-writable source locations, so they
can change until the source is sealed. A matching fingerprint never grants
permission to install or run software; the handoff explicitly reports
`approvalGranted=false`, `copyPerformed=false`, and `productionReady=false`.

Nineteen isolated Linux-compatible tests now cover both the proposed
manifest and a separately implemented **post-copy byte verifier**. They require
the 12 exact files, deny changed ZIP/CLI/GUI or control scripts, missing or
extra files, unexpected manifest fields, substituted symlinks and malicious
relative paths. The verifier accepts only an exact reviewer-supplied SHA-256
of the serialized manifest; a self-computed manifest fingerprint alone is not
an independent approval. The return value is deliberately
`bytes_verified_not_acl_verified` and always reports
`aclVerified=false`, `reviewerApproved=false` and
`executionEnabled=false`.

A separate read-only Windows script, `worker-handoff-acl-audit.ps1`, inventories
all 12 required files and eight expected `control`/`imports` directories.
It requires protected ACL inheritance, SYSTEM/Administrators ownership and
exclusive trusted Allow ACEs, checks for unexpected files and symlinks, and
never reports activation or installation readiness. Before the protected
handoff exists, it correctly returns `aclVerified=false` with 12 expected
files and eight expected directories. Its first targeted Windows test passed;
**actual protected-copy ACLs have not been verified**.

All synthetic file tests operate on automatically removed temporary fixtures.
SDF-1B Linux CI requires **19/19** successful tests with zero failures or
skips. A Linux copy-byte result cannot establish the Windows ACL result or
Authenticode trust, and neither result authorizes a privileged copy.

**Remaining trust ceremony, not implemented here:**

1. Independently review a particular committed source revision; approve its
   manifest and GUI signer identity out-of-band, with exact SHA-256 pins.
2. Design and review a privileged *copy-only* bootstrap whose own bytes are
   trusted out-of-band. An elevated PowerShell launched from the writable
   worktree cannot safely bootstrap itself.
3. Transfer the exact allowlisted files into new admin-only `control/` and
   `imports/` directories, ensuring parent ACLs, ownership, and reparse
   boundaries are correct before every write. Do not overwrite existing
   destinations, and do not run a transferred script during copying.
4. Independently compare every post-copy digest with the separately pinned
   review manifest and effective ACLs. Abort with no staging authorization on
   any mismatch or unexplained extra file.
5. Reconsider whether a separate VM/container is needed before editor process
   launch and network egress; Windows ACL hardening alone is insufficient.

## Read-only post-copy verification (additional planning increment)

New validation-only modules are included:

- `worker-handoff-verify.mjs` compares the complete 12-file tree with an
  **independently supplied exact manifest JSON digest**, rejecting file
  changes, missing/extra copies, unreviewed entries and symlinks. It checks
  post-copy file sizes and pinned release SHA-256 hashes. It intentionally
  provides **no privileged CLI**, performs no copy, and always returns
  `bytes_verified_not_acl_verified`, `aclVerified=false`,
  `reviewerApproved=false` and `executionEnabled=false`.
- `worker-handoff-acl-audit.ps1` is a separate read-only Windows NTFS audit.
  It examines the protected root plus **eight expected directories and twelve
  exact files**, requires protected ACL inheritance, SYSTEM/Administrators
  ownership and no nontrusted Allow ACEs; unexpected files/symlinks fail
  closed. It cannot grant permission to execute or install. It currently
  reports `aclVerified=false`, because the protected handoff has not
  been created. The regular worker's seven-folder ACL audit is distinct.
- SDF-1B Linux CI requires exactly **19/19 handoff tests, zero skips**;
  Windows tests also require an inert result from the post-copy ACL audit.
  This does not replace full elevated ACL and signature verification after
  an explicitly approved transfer.

A digest handed in by the *same* user-writable source is not independent
reviewer approval. Before a real admin-controlled handoff we still need an
approved exact source revision and digest distributed out of band, a separately
reviewed privileged copy-only bootstrap, post-copy comparisons against the
approved digest, and Windows ACL proof. The bootstrap itself is **not built**.

## Synthetic protected-copy transaction tests (in-memory only)

`worker-handoff-copy-simulator.mjs` is a **pure in-memory** model, not a
privileged copier. It deliberately imports no filesystem, Windows, process,
network or execution facilities, exposes no CLI, and refuses real executable
sizes (maximum 64 KiB per synthetic input). The caller provides twelve
synthetic Buffers and the separately pinned manifest digest.

The simulator models a full transfer transaction:
1. Verify the exact reviewed manifest digest and the strict release lock,
   check all twelve source names and bytes, and refuse occupied targets.
2. Inject a simulated source mutation or target race between review and copy;
   fail closed without changing the external destination Map.
3. Stage cloned test buffers in a separate Map, then independently compare
   every staged byte length and SHA-256; refuse missing, extra or changed
   entries before producing a mock candidate.
4. Always report zero **actual files copied**, no ACL/signature attestation,
   no reviewer approval, no account enablement, and no production readiness.

**13 new adversarial tests** check success, source/target collision, changes
between verification and staging, tampering after staged copy, missing/extra
files, forged manifest or release pins, oversized input and race injection.
Together with the previous 19 manifest/post-copy tests, Linux CI now
requires **32/32 passing with zero skipped**. This simulates transaction logic
only; it does not establish atomic Windows filesystem writes, trust in a
user-writable bootstrap, real NTFS ACLs, or independent reviewer approval.

**The actual protected copy-only bootstrap remains unimplemented and must
not be executed, inferred from this simulator, or treated as authorized.**

**No step above was authorized or executed by this planning change.**

## Synthetic on-disk transfer trial (2026-10-21)

`worker-handoff-temp-copy.mjs` goes one step beyond the in-memory simulator
by writing **twelve tiny synthetic files inside an automatically removed OS
temporary test fixture**. This code deliberately has no command-line entrypoint,
no permissions to create the real protected handoff, no Windows or user-account
operations, and no support for real program archives or binaries.

Its test-only confinement rejects a root outside a direct child of the OS
temporary directory, missing fixture marker, any symlink or non-regular input,
and input files above 64 KiB each. It uses the strict 12-file manifest and a
separately supplied digest, prechecks all sources before copying, refuses any
occupied target, stages files in a separate temporary folder with exclusive
creation, rechecks source hashes during copying, and validates all staged bytes
with the existing post-copy verifier before promoting the synthetic candidate.

**Eleven new test cases** cover the all-pass fixture, a missing/forged marker,
an occupied target, a same-size source swap after preflight, changed/extra
staged files, two different simulated destination races, oversized inputs,
source symlinks, and an incorrect external manifest hash. The trials clean up
the entire temporary fixture and make **zero** changes to `ProgramData`.
Linux SDF-1B CI now requires **43/43** creative handoff tests with zero skips;
all Creative Tools Node tests are run locally before push.

This is a **test of copy sequencing and failure handling only**. Windows
filesystem atomicity, reparse-point races, ACL changes and privilege transfer
cannot be inferred from the trial; a trusted, out-of-band, reviewed
administrator-only bootstrap is still required. A self-provided SHA-256 does
not count as independent signature or owner approval. No production copy or
worker activation is allowed by this result.

## Independently signed handoff review protocol (2026-10-21)

The review-only cryptographic contract in
`worker-handoff-review-proof.mjs` requires a fresh **P-256 signature**
bound to all of: the fixed Omnira repository, exact 40-digit Git commit,
serialized 12-file manifest SHA-256, author ID, a DIFFERENT reviewer ID,
host `HULTGREN`, issued/expiry timestamps and nonce.
It uses a purpose-separated canonical encoding (`review_only`) and
`noCopyAuthority=true`. Its public verification key is not accepted from
the untrusted proof. A caller must separately pin a trusted P-256 reviewer's
SPKI SHA-256 fingerprint through a controlled out-of-band registry.

`worker-handoff-review-bundle.mjs` composes this signature verification
with exact-byte validation of the proposed manifest. It rejects an old
signed review after even one manifest entry changes, a different commit,
an unknown reviewer key, unsupported extra fields or an invented
`approvalGranted=true` flag. **Cryptographic scope binding alone cannot
prove the human reviewer was authorized**, that the source files remain
immutable, or that a signed nonce has been durably consumed.
The result deliberately reports
`reviewerPolicyApproved=false`, `nonceConsumed=false`,
`copyAuthorized=false`, `privilegedBootstrapAuthorized=false`,
`workerExecutionEnabled=false` and `productionReady=false`.

19 deterministic tests use **throwaway P-256 keys created inside tests only**.
They cover scope forgery, self-review ID, canonical encoding, replay,
bad/expired timestamps, wrong P-256 key, incompatible key type, altered
commit/manifest, tampered signatures and forged approval metadata.
The previous 43 Creative Handoff tests plus these 19 are protected by the
SDF-1B Linux CI anti-skip floor of **62/62 passing, zero skipped**.
No real reviewer certificate/private key has been generated, registered
or approved, and no protected copy was performed.

**Further prerequisites** before ANY elevated copy attempt:
a true out-of-band reviewer identity and key registry, human decision on
the specific Git revision and manifest digest, durable one-time approval
record with withdrawal/expiry enforcement, an independently reviewed
copy-only bootstrap with protected ownership/ACLs, plus post-copy
hash, signer and ACL verification. The current modules are solely
planning and verification primitives, **not an installer**.

## Reviewer registry and replay boundary (development-only, 2026-10-21)

The new pure `worker-handoff-reviewer-registry.mjs` accepts a proposed
reviewer registry **only when its serialized SHA-256 matches a separately
supplied, externally pinned digest**. It requires an active P-256 reviewer,
valid DER public-key/SPKI fingerprint, fixed repository and host, uniquely
enrolled reviewer IDs, and rejects revoked/suspended reviewers, untrusted
keys, modified manifests, stale Git commit bindings, and self-review.
Author ID, commit SHA and manifest SHA must be supplied from independent
project policy; none may be derived solely from the reviewer's signed claim.

**The registry is not enrolled or authorized for production**. A writable
file whose fingerprint is supplied by its own author does not establish an
independently trusted human identity, even if its fields claim
`independentlyEnrolled=true`. The verifier therefore always returns
`externalEnrollmentAuthorityEstablished=false`,
`reviewerActualIdentityVerified=false`,
`reviewerPermissionToCopy=false`, and
`bootstrapAuthorized=false`. No real reviewer credential or private
key has been created.

`worker-handoff-nonce-fixture.mjs` is a **synthetic replay-rejection test**:
it validates the signed review+registry+manifest, then exclusively creates
a non-executing receipt named after a domain-separated nonce SHA-256.
The test directory MUST be a specifically marked direct child of OS TEMP.
A duplicate or truncated old receipt blocks a second submission; revoked
reviewers or expired signatures create no receipt. The receipt cannot be
used for creative work, copying, privileged installation or production
nonce consumption. All tests use temporary throwaway P-256 keys and delete
their isolated fixture after the test. No `ProgramData` changes occur.

Twelve independent reviewer-registry tests plus ten synthetic receipt
tests passed locally, including missing author identity and replay.
Together with the earlier 62 handoff tests, the SDF-1B Linux CI anti-skip
floor now requires **84/84 tests without any skips**.

**Still required** before real handoff: externally operated enrollment/key
lifecycle with human identity proof, separation-of-duties and revocation;
an approved reviewer policy and immutable digest distributed out of band;
a protected production-grade nonce/approval store with durable recovery,
concurrent writers, fencing and revocation; an independently reviewed
copy-only elevated bootstrap; and complete Windows file, signer, ACL,
network/process isolation audits. No API or script now grants installation
permission, and `omnira-media-worker` remains disabled.

## Append-only reviewer lifecycle and cross-process replay trial

A new pure, read-only `worker-handoff-reviewer-lifecycle.mjs` models an
**externally anchored revision chain** over an already-pinned reviewer
registry. Only `suspend` and `revoke` events are allowed. Each event has
a strict sequence number, previous SHA-256, actor ID distinct from reviewer
ID, timestamp and domain-separated event hash. Revocation is terminal:
no self-activation, replay, duplicate transition or key-reenrollment is
available through this module.

The inspection requires all three externally pinned values: base registry
SHA-256, latest journal-head SHA-256, and minimum expected event sequence.
It refuses missing, reordered, altered or deleted journal entries, event
clock rollback, unknown reviewers, and a stale active snapshot after the
pinned head has moved to a suspension/revocation. A valid signed review by
a now-revoked reviewer is rejected **before** any inert nonce test receipt
can be considered. The journal-builder is a *test-data constructor*,
not an enrollment or approval endpoint; a hash-chain is tamper-evident
only when the head was genuinely anchored outside the writable system.

**15 lifecycle tests** plus **two new real cross-process replay tests**
now verify the boundaries. Two separate Node processes compete for one
synthetic receipt under a marked OS TEMP fixture: exactly one creates the
file, while the other receives replay rejection; a process restart does
not reset the nonce. This is still ordinary user-controlled temporary
storage, with no independent durability, operator approval or protected
Windows ACLs. The test fixture is removed after the checks.

Together with the previous 84 handoff tests, GitHub CI requires
**101/101 passing with zero skips**. The source code still has no
production-granting reviewer enrollment, no administrator-controlled
approval store, no executable handoff command, no network isolation
attestation and no worker activation. Before any real deployment, a
separate trusted authority must authenticate reviewer identities,
publish and protect monotonically advancing current heads, verify
operator actions, and use a durable ledger with revocation/fencing.

## Lifecycle-bound nonce receipt trial (2026-10-21)

The synthetic nonce fixture now **requires a pinned reviewer lifecycle**
in addition to the registry, exact Git revision, manifest digest and P-256
review signature. The caller must supply a lifecycle journal, independently
pinned registry/head SHA-256 values and a minimum trusted sequence number.
There is deliberately **no fallback** to a registry-only signature check.
The receipt includes the chain head and sequence that were actually checked,
but does not become an execution or elevated-copy capability.

Five new tests prove that a revoked/suspended reviewer cannot write a
new nonce receipt, even with an otherwise valid signature and fresh nonce;
a stale active journal cannot hide a revoked head; tampering with a journal
entry fails before writing; missing external history pins fail closed; and an
older inert receipt remains inert after the reviewer has been revoked.
Existing tests still require a single winner across independent Node
processes and prevent replay after process restart.

These tests increase the Linux SDF-1B handoff anti-skip floor to
**106/106 passing, zero skipped**. The whole reviewer journal and nonce
fixture are still under the user's synthetic OS-temp test authority.
Their hashes are **not** independent authenticated human approvals or
evidence of Windows ACL confinement. Production-grade secure storage,
monotonic external anchoring, verified reviewer enrollment and revocation
delivery remain prerequisites. The worker stays disabled; no real files are
copied into `ProgramData` and no elevated script is run.

## Synthetic approval-ledger history audit (2026-10-21)

`worker-handoff-nonce-ledger-audit.mjs` adds **read-only** verification
of the existing marked OS TEMP nonce fixture. It does not create, amend,
delete, authorize, or replay any receipt. It requires exactly named,
canonical, non-executing synthetic nonce JSON receipts, rejects symbolic
links, unknown files, malformed/partial records, changed authorization flags,
and invalid lifecycle checkpoint fields. It computes a domain-separated
SHA-256 head over the sorted receipt names, full bytes, and reported lifecycle
reference. The read-only snapshot is explicitly just a **local observation**.

A second entry point requires an **externally supplied exact expected head**
and a **minimum record count**, detecting missing/deleted/replaced receipts,
content manipulation, rollback to a lower receipt count, and a stale checkpoint
even across a new Node process. It returns an audit-only match, never an
authorization. **The verifier cannot tell whether the external pin was
actually trusted.** An attacker who controls both the receipt directory and
the supplied pin could forge a consistent snapshot; this design cannot
replace a separately administered monotonic anchor or protected ACLs.

The test suite contains **13 synthetic inventory/rollback tests** plus
**two integration tests** using receipts created by the existing
signature/lifecycle-bound nonce fixture. CI's Linux Creative Handoff
anti-skip floor is now **121/121**, with no skipped tests. All tests use
automatically removed fixtures under OS TEMP and require no added APIs,
cloud resources, Windows administrator session, or model usage.

The production-grade approval ledger and monotonic external checkpoint
**do not exist yet**. Required future controls include an independent
owner/reviewer identity and revocation authority, protected append-only
storage with OS-level permissions and durable crash recovery, an externally
anchored monotonic revision/nonce floor, post-crash verification,
signer+ACL evidence, and separate human approval for every privileged
copy/install action. The worker remains disabled.

## Planned admin-owned approval ledger: read-only ACL preflight (2026-10-21)

The handoff, signature, nonce and lifecycle tests above remain synthetic.
This increment introduces a **separate** proposed Windows ledger, which is
not the `receipts` directory used by the media worker:

```text
C:\ProgramData\OmniraCreativeWorker\
  approvals\
    nonces\
      <64-lowercase-hex-SHA256>.json
```

No approval directories or receipt files were provisioned or copied.
`worker-approval-ledger-acl-audit.ps1` reads Windows NTFS metadata only;
there is **no `-Apply` mode**. It reports unknown/missing or unreadable
folders as **not verified**. It checks the proposed `approvals` and
`approvals/nonces` folders and at most 32 test-phase receipt names:
- Parent root is an existing, trusted-owned, non-reparse directory with protected ACL and **no write/ownership/ACL-changing Allow rights** for any untrusted principal (the existing media worker's read-only rights do not automatically qualify it for the private ledger).
- Every proposed ledger directory/receipt has disabled ACL inheritance,
  an owner of SYSTEM or BUILTIN Administrators, and only explicit,
  full-control Allow ACEs for **both** of those SIDs.
- No ACE whatsoever may grant access to `omnira-media-worker`,
  standard users, `Everyone`, `Authenticated Users`, or other groups.
- Paths must be ordinary directories/files, not links/reparse points.
  Additional folders, unrecognized filenames, unreadable ACLs or
  unexpected objects fail closed.

The separately testable `worker-approval-ledger-acl-policy.ps1`
has **17 passing synthetic Windows ACL cases** (both valid owner types,
unexpected users, inherited ACEs, Deny ACEs, wrong rights, wrong file type,
missing trusted principals and links).
The read-only audit has two Windows integration tests. Linux CI runs
three structural anti-regression tests and raises the Creative Handoff
anti-skip floor from 121 to **124/124**, with zero skips. Structural CI
checks are **not** an equivalent of inspecting real Windows ACLs.

The initial ordinary-user audit reported `aclVerified=false` and
`productionReady=false`, because the future ledger is not installed/
readable. A future admin inspection must confirm these ACLs after an
owner-approved setup; the currently disabled worker must never receive
access to the ledger. Even a successful ACL audit reports
`receiptContentsVerified=false`, `externalAnchorVerified=false`,
`realReviewerIdentityVerified=false`, `installationAuthorized=false`
and `workerExecutionEnabled=false`.

**Do not put the externally pinned current history head inside this ledger
or elsewhere under the same writable trust domain and call it independent.**
It must be held by a separately administered, authenticated monotonic
authority with revocation and protected durable write semantics. Windows
ACL tests alone cannot prove backup rollback prevention, effective token
isolation, trusted operator identity, or crash-safe append-only storage.
The bounded 32-receipt layout is **only a P0 audit design**; a production
storage/retention/fencing plan remains unbuilt.

No system ACLs or account settings changed; no editor process ran and no
production approval authority was created.

## Whole-archive integrity update

The staging planner additionally checks SHA-256 of the original PhotoCraft and
FilmCraft release ZIPs against pinned hashes in artcraft-lock.json. On a future
operator-approved Apply, it extracts these pinned archives into the restricted
ProgramData bin tree, then verifies the installed executable hash again. This
avoids trusting a potentially modified unpacked portable directory.
