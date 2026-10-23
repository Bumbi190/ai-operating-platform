# P42 synthetic launcher release-review package

The separate ordinary-user tool now exports its own build-bound production sibling and verifies a four-file packet without running the host. This is consistency evidence for human review. It grants no installation, execution, worker activation, publication or production permission.

The tool recognizes only `--export` and `--verify <canonical absolute local directory>`. Build with `scripts/creative-tools/launcher/review-package/build.ps1`; run the returned ReviewExe as the ordinary user. Export has no source, output, runtime, account or capability selector. Its generated nonce locates the packet at the OS-derived LocalApplicationData directory plus `Temp/omnira-launcher-review-<nonce>`. Do not execute the packet.

## Retained production observation

On 2026-10-22 at 13:24:48 UTC, production export exited 0 and its separate read-only verification exited 0. The exact packet is retained for human review:

| Observation | Value |
| --- | --- |
| Nonce | `51fae6e28a794c12a727c558640cf239` |
| Host bytes | 79360 |
| Host SHA256 | `bdcf4c6c765045f07277b8fd002b89931caa97955671721a279255d697ceedc6` |
| Raw manifest bytes | 2352 |
| Raw manifest SHA256 | `1ddd5934530ba837d066edf060e4f5d725875b3db0170c902b096e54dec92504` |
| Review tool SHA256 | `b1a1673ab6b1a1f477620ffeb864f3113bd02324250bbe90e0977498e4fc808c` |
| Source commit observed at build | `f5eaa713c8290fc0154c73796841afbd38fc1bad` |

The four entries are owner.txt, SyntheticLauncher.exe, review-manifest.json and manifest.sha256. No test executable or Node binary is included. Before and after verification, all four lengths, SHA256 values, creation times, last-write times and the exact entry count matched. Last-access time is deliberately excluded. All nine authority fields and five additional side-effect/permission fields remained false.

Exact private location/ownership, capture paths, UTC, generated context, all17 P40 source digests, package-tool source digests, compiler metadata and outcomes are in the companion observation JSON and retained evidence under `.superpowers/sdd/creative-release-review/task3-qualification-74f18ee5d11b4f3bbcc3e09b525cb780`. No future enclosing commit or document self-hash is claimed.

This host is freshly built data from unchanged P40 Git source. Its bytes differ from the previously qualified P40 host; this document does not relabel the older byte-specific self-test evidence or claim a new native self-test. The fixed Framework64 compiler SHA256 is `eca02e6b15cde93009a59a3d129d5a77fb5008f2e1cf62cf573b6737c747ecc3`, numeric version14.8.10001.0. Compiler/runtime hashes were observed before/after the build. They do not establish independent provenance. The declared runtime pin remains `780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b`; installed runtime provenance remains unverified.

## Behavior and qualification

Export checks ordinary identity before opening package inputs. Its fixed17 source paths are generated from the wrapper's internal parent directory, checked against the captured digest map and held through export. The host comes only from the tool's own sibling path, checked against generated length/hash. Handles reject reparse/multiple-link leaves and hold the same source objects against ordinary write/delete replacement. The bounded host bytes are read/hash-checked through one held source and copied into a new destination; completion uses the read-only verifier to hash the destination again.

Native CreateDirectory refuses a preexisting candidate. A held ordinary NTFS root anchors four native relative FILE_CREATE writes, each CreateNew, flushed and closed. Export never cleans output. Primary finite refusal and whether its newly owned output is incomplete are separate report facts; unknown entries, collisions and partial output remain preserved. A directory created but subsequently refused can therefore remain as incomplete evidence. Success requires the existing verifier's held-root exact enumeration, held leaf metadata/identity checks and same-handle reads. There is no package assembly loading, script import, process start or package-provided path dereference.

Final package source is covered by `tests/run.ps1 -Suite All` at build `fee8efa3577941bb8a97fa302e6d5423`. All dispatches three separate processes, each with its own45000ms deadline and unique CreateNew captures: Codec59 assertions, Files78, Export59. Each exited0, with complete captures and no timeout. Export controls include exact bound host/four entries, actual altered build-owned sibling refusal and restoration, injected source mismatch, existing directory/leaf no-overwrite, preserved unknown/partial output, identity-before-resource checks, strict modes and bounded redaction. Test-only hooks use REVIEW_TEST and are absent production; no TEST symbol or parent fixture adapter is enabled.

The first final integration regression ran304 tests:303 passed, one failed, zero skipped. Existing `queue-http-contract.test.mjs` test “signature or pinned scope mutation is refused” expected409 but received200. Its old mutation could leave a signature unchanged when the first character was already A. That is a possible cause; the actual original signature was not captured, so the cause is not proven. The original failed capture remains intact. A narrowly approved test-only correction chooses a different first character and asserts decoded bytes differ. The focused queueHTTP run passed9/9; the next full304 again passed303/failed1, now in approval-proof.test.mjs:51 (Missing expected exception), which used the same mutation premise. Both failures remain intact. A controller-approved bounded correction covers exactly four existing test fixtures: approval-proof, queue-http-contract, worker-handoff-nonce-fixture and worker-handoff-review-proof. Production signature/approval/broker policy remains unchanged. The final four-file focused run passed45/45 and final full regression passed304/304, with zero failures/skips, complete captures and no timeout. Their separate evidence is task3-regression-final-4cd53b88769c43dc9a5e9e17f54078a5. Final C# and production evidence was retained without rerun because those inputs did not change. Original and final outcomes/source identities remain separate in the companion observation.

No P40 native suites were rerun. Existing production P40 sources and CLI, broker/queue production code, editor workflow and old handoff files remain unchanged. Four existing Node test fixtures changed as the documented regression exception.

## Limits and next boundary

A coherent foreign packet may pass consistency. Hash consistency is not authentication; the sibling hash is not an independent anchor. Ordinary-user writable packets do not establish a trusted operator, root ACLs, actual worker token, effective network restriction, independent human approval, general executable trust, creative execution, publication or readiness.

Handles and finite rechecks are not an atomic directory transaction or universal protection against a hostile same-user, administrator or kernel. Successful parent directory replacement, native returned-buffer fault injection, metadata-changing writes through pins and full45-second watchdog expiry were not exercised. Synchronous native disk calls do not gain a general kernel I/O timeout guarantee. Test cleanup assumes freshly owned nonadversarial names and removes only exact own entries; production verification/export never clean packets.

Nine historical P40 input/profile pairs and the manual P41v1 packet remain untouched and outside adoption/deletion. Their prior cleanup/expiry limitations remain. No protected copy, ACL/account/firewall/service/editor changes or copied-host execution occurred. A later protected-install proposal still needs an independently trusted bootstrap, authenticated exact manifest approval, protected destination/owner/DACL validation, independent copy verification and rollback. Actual worker launch and a scoped private PhotoCraft test remain separate acceptance work; publication remains separate.
