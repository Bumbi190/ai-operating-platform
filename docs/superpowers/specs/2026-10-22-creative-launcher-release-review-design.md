# Creative launcher release-review package design (P41)

Date: 2026-10-22. Status: proposed written design, awaiting André's review.
Base: P40 `c6e4171d54d3d34b029557faa5b77dd45d81abce`, Draft #512.

## Intended outcome

Atlas should eventually edit approved images with PhotoCraft, then evaluate FilmCraft, while preserving the existing media workflow. P40 qualifies an ordinary-user synthetic launcher, not either editor or the disabled dedicated account. The next useful deliverable is an inspectable release-review package and a non-executing offline verifier, so a later independently operated protected-copy proposal can name exact bytes rather than mutable checkout paths.

André authorized continuing toward creative-tool use. This document proposes that next software slice; it does not authorize installation, account enablement, an editor run, network rules or production use. The current step prepared a manual review copy with existing P40 primitives only; no product source was changed.

## Approaches considered

| Approach | Benefit | Cost / disposition |
| --- | --- | --- |
| Ordinary-user package builder and offline verifier | Produces exact reviewable bytes and repeatable rejection checks before privileged work | Recommended; produces consistency evidence only, with a separate trusted installation still required |
| Direct protected install and dedicated-account launch | Would exercise a later operational boundary | Deferred: trusted bootstrap, exact ACL/provenance and account-launch acceptance are not yet supplied |
| Launch PhotoCraft from the development checkout | Short path to an editor demonstration | Not selected: P38/P37 require protected provenance, actual worker identity, effective isolation and durable approval first |

## Current concrete review copy

Prepared without executing the copied host, changing system permissions or copying into ProgramData:

- Local packet nonce: `6a1fbf255a4e4e809ff6d7e0ff2f4be4`.
- Packet location relative to the existing worktree: `.superpowers/sdd/creative-p41-protected-handoff/packet-6a1fbf255a4e4e809ff6d7e0ff2f4be4/`.
- Exact files: `owner.txt`, `SyntheticLauncher.exe`, `review-manifest.json`, `manifest.sha256`.
- Executable bytes: 79,360.
- Executable SHA256: `3498a6324c5e9c7219aa2cbcac000f0a90e0c12341e2fcef66ae14b51ce249d7`.
- Review-manifest SHA256: `98fb5bf778be45355451322a83aa3290c47434c99ef39860407a2110d9850b0e`.
- All 17 qualification source-digest observations matched current P40 source before copying.
- Source was opened read-only without write/delete sharing; the same held stream was hashed and copied to a CreateNew destination, flushed, and the destination bytes were hashed again.
- No test executable or Node binary is included. The existing host still depends on its fixed installed Node path and runtime pin; this packet does not solve deployed runtime provenance.

This is an ordinary-user, writable review artifact. Hash equality does not authenticate an operator or establish an independent trust root. The sibling hash file is a convenience check only. The executable stays out of Git. The committed document records its identity for review; no elevation may execute this worktree, the packet or a packet-generated command.

## Proposed P41 components and boundaries

1. A fixed-source ordinary-user build/export wrapper uses the existing fixed Framework64 compiler, explicit source/reference lists and pinned runtime requirements. It exports only the production host and finite data files into a fresh, nonce-marked package. It does not start the exported executable or modify an existing package. No arbitrary executable, shell, capability, account or protected destination selector.
2. A separate ordinary-user offline verifier reads the package as data. It checks the exact entry set, ordinary file/directory types, bounded manifest bytes, declared file lengths and SHA256, no links/reparse points/multiple-link leaves, and immutable false authority fields. It must not load assemblies, import packet scripts, evaluate data, start a process or write the package.
3. A finite review report names source revision, source digests, compiler observation and binary bytes, then distinguishes `packageConsistent` from trust/authorization. It reports unknown prerequisites explicitly. It cannot turn consistency into install permission.

The package format is a bounded versioned JSON manifest with a finite shallow schema, explicit maximums, unique decoded property names, exact integer lexemes, validated lowercase hashes and no unknown fields. Maximum container depth is three and each object has at most 64 properties; source-file names come from the fixed build manifest, not caller paths. Strict parsing must reject malformed UTF8/BOM, duplicate or escaped-duplicate properties, trailing data and coercions before materializing trusted fields. Implementation planning must select a bounded parser compatible with existing Framework dependencies; no package installation is implied.

Limits for the first format: exactly four package entries named above, one ordinary host executable up to 1 MiB, manifest at most 64 KiB UTF8, one depth level, lowercase 32-hex owner nonce and lowercase 64-hex SHA256 values. These are review-package limits, not changes to P40's input/request/output budgets. A larger future host requires a reviewed format change rather than automatic bound widening.

The automated format may evolve from the manual `review-manifest.json` capture, but must use a new explicit version if its semantics differ. The manual packet is baseline evidence, not already-qualified implementation of the proposed builder/verifier.

## Data flow and failure handling

Existing reviewed source -> ordinary build -> fresh review package -> read-only consistency report -> human review.

Stop on source drift, expected-byte mismatch, unknown entries, oversized/invalid manifest, unexpected file type/link, missing runtime pin or incomplete read. Preserve the primary failure separately from whether the newly owned output was completed. Never delete unknown or replaced entries, mutate an existing package, accept a partial package or retry with weaker checks. No broad recursive cleanup. The nine old P40 input/profile pairs remain outside this operation and must not be adopted or removed.

The offline verifier never dereferences a runtime or source pathname supplied by package data. It checks the declared fixed runtime pin but leaves installed-runtime provenance unverified. The verifier must hash and inspect the same held file objects. File naming and hashes under the same ordinary-user ownership do not establish hostile-same-user, administrator or kernel containment. An independently authenticated approved manifest digest is a later installation prerequisite, not an optional argument that makes this verifier authoritative.

## Acceptance for this software slice

| Case | Required result |
| --- | --- |
| Internally built exact production package | Bounded consistency result; all authority fields remain false |
| Host or manifest altered after capture | Reject; no executable started |
| Test executable, unknown entry or nested directory | Reject; preserve package |
| Reparse point, hardlink leaf, identity/size change during read | Reject; no path reopen used to substitute content |
| Duplicate, escaped alias, malformed UTF8, overflow or unknown manifest fields | Reject before trusting fields; report remains bounded/redacted |
| Missing/different declared runtime pin | Reject invalid manifest; never broaden runtime selection or download a substitute |
| Existing target / incomplete export | Refuse overwrite; record separate exact ownership/cleanup evidence |
| Claimed approval or install permission in package data | Reject; no production-granting field or mode exists |
| Production CLI/creative regression | Existing exact synthetic-only CLI and broker gates unchanged |

Meaningful tests cover copy identity/alteration, no-execution side effects, strict parser boundaries and output ownership. Reuse P40 lifecycle evidence for unchanged native code; do not repeatedly run native lifecycle suites or cloud CI merely for documentation changes. Any later change to qualified code needs its own covering qualification.

## Explicit authority and later handoffs

All nine existing authority fields remain false: ActualWorkerTokenVerified, RootAclTrustVerified, NetworkEgressVerified, RealHumanApprovalVerified, ArbitraryBrokerContainmentVerified, GeneralExecutableTrustVerified, CreativeExecutionAuthorized, PublishAuthorized and ProductionReady. `InstallationAuthorized` and worker activation also remain false. P41's consistency report is not a credential, approval receipt, service or broker connection.

After this package/verifier slice, a separate concrete protected-install proposal must name the independently reviewed trusted bootstrap, authenticated approval channel and exact approved manifest digest, target paths, trusted owner/DACLs, parent/reparse checks, copy-only operation, independent post-copy verification and rollback preserving approval/nonce history. No elevated code may be sourced from this mutable checkout. The older six-file editor handoff inventory and Apply scripts are not silently expanded or reused for launcher installation.

Actual dedicated-account launch, real project input/output roots, effective network/broker restrictions and restart-safe human approval remain separate reviewed acceptance work. Before account enablement or protected writes, seek the separate concrete authorization required by P38 and the existing admin runbook. Editor compatibility and real export quality then need a single explicitly scoped private PhotoCraft test before FilmCraft. Publication remains separate.

## Historical evidence and current status

P40's eight compiled suites, 304 unchanged creative tests and final scoped review remain recorded observations. All nine GitHub check/status entries on #512 were observed SUCCESS on reconnect. The full 45-second watchdog expiry was not deliberately triggered, and nine historical/intermediate input/profile pairs remain preserved with cleanup unverified. Neither this packet nor later green checks repair those historical outcomes. No new native/editor test or account audit was run for P41 preparation.

## Review decision requested

Review and approve the ordinary-user builder/offline-verifier design before its implementation plan is written. The selected subagent implementation/review method from the prior plan may be retained. Approval of this document would permit planning that slice; it would not authorize protected provisioning, enabling the worker, running PhotoCraft or changing production gates.
