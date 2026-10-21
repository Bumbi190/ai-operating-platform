# Atlas Creative P40: synthetic launcher core

Qualification record for the ordinary-user Windows synthetic launcher. This is a diagnostic implementation follow-up to the approved P38 design, not a deployed worker or authorization to execute PhotoCraft/FilmCraft.

## Observed outcome

The separately built production executable completed one `--synthetic-self-test` run at 2026-10-21T20:57:32.9429572Z: exit 0, 1976 UTF8 stdout bytes containing one JSON object, zero stderr bytes, and complete native process, pump, input-fixture and AppContainer-profile cleanup. The operation elapsed 1042ms under the unchanged 20000/30000ms endpoints. The final eight-suite launcher regression passed with zero skips, and the existing creative regression passed 304/304 with zero failures/skips.

The exact production object, capture metadata, environment observations, source digests, suite build identities and all nine preserved historical/intermediate artifact pairs are recorded in [ATLAS_CREATIVE_P40_LAUNCHER_CORE_OBSERVATION.json](ATLAS_CREATIVE_P40_LAUNCHER_CORE_OBSERVATION.json). Original failures remain failures. Later successful operations do not establish cleanup for those nine pairs.

Source identity is the qualification-time, pre-commit working tree based on `87f8bddc520a1f8b4b301499efe714f2e4e6b1dd`. SHA256 values describe actual file bytes at qualification, including line endings. The enclosing commit supplies the Git identity; this document does not claim an impossible hash of its own future commit.

## Entry, evidence and authority

Build using the existing fixed Framework64 compiler:

```powershell
$build = & .\scripts\creative-tools\launcher\build.ps1 | ConvertFrom-Json
& $build.HostExe --synthetic-self-test
& .\scripts\creative-tools\launcher\tests\run.ps1 -Suite All
& 'C:\Program Files\nodejs\node.exe' --test scripts/creative-tools/*.test.mjs
```

The exact observed production command was:

```text
"C:\Users\Andre\AppData\Local\Temp\omnira-launcher-build-70b37e9fa4184af7974ac82e55eb111c\SyntheticLauncher.exe" --synthetic-self-test
```

Only that single exact argument is supported. No argument, unknown arguments, extra arguments, path/account flags and case variants refuse with exit2 before fixture/profile creation. Elevated or AppContainer hosts refuse; no elevation is attempted. Exit0 requires the complete Cleaned result, verified native identity/job, child exit0, completed writer/drains and complete cleanup. All other returned runs exit2. Fail-stop paths can terminate without returning a report.

A single monotonic budget starts before CLI identity verification and is passed through the runner and cleanup. Existing direct internal runner callers also create exactly one budget. No public budget or fault selector exists. All dispatches eight independent suite invocations, each retaining its own creation-time guard job and45s watchdog; there is no enlarged aggregate deadline.

The production host is compiled once by the build wrapper. It does not compile or read repository source at runtime. TEST-only source-audit context and fault/identity seams are excluded from the production manifest. Runtime metadata hashes the executing assembly and CLR image; the Node hash comes from the staged pinned image. Source hashes come from the build/evidence wrapper, not host source inspection.

The report contains bounded sizes, digests, restricted stage/refusal labels, an optional signed native error number, observed token/job/exit/timing and independent cleanup fields. It excludes input content, raw stderr, arbitrary exception text, credentials and caller paths. Its finite schema is checked against a32768-byte UTF8 ceiling before writing. Fixture identity is a validated generated nonce. Unknown labels become fixed redacted labels. Native FIXTURE/CREATE/MEMBER/CLEANUP console diagnostics exist only in TEST, preserving the throwing-writer regression while production stdout remains one parseable JSON object.

All nine authority fields remain immutable false and are serialized as literal false:
ActualWorkerTokenVerified, RootAclTrustVerified, NetworkEgressVerified, RealHumanApprovalVerified, ArbitraryBrokerContainmentVerified, GeneralExecutableTrustVerified, CreativeExecutionAuthorized, PublishAuthorized and ProductionReady.

## Actual host metadata

- Ordinary observed identity: HULTGREN\Andre. The compiled host independently checked outside-AppContainer, non-elevated and no enabled administrator group before setup.
- OS observation: Microsoft Windows [Version 10.0.26300.9711] from the fixed System32 cmd.exe built-in `ver`; registry CurrentBuildNumber=26300, UBR=9711 from HKLM SOFTWARE Microsoft Windows NT CurrentVersion.
- The report's `EnvironmentOsVersion` is explicitly labelled `Environment.OSVersion-compatibility-view`. An unmanifested managed executable may report a compatibility version; it is not presented as the actual Windows release.
- Compiler: 14.8.10001.0 built by: bd501acdc000004, SHA256 `eca02e6b15cde93009a59a3d129d5a77fb5008f2e1cf62cf573b6737c747ecc3`.
- CLR file version: 4.8.10008.0 built by: d5c29ab0c000001, SHA256 `121b975d4242a069be2f46e59b661b95c7c468e30c0a9820da1066d8e40df524`; observed Framework registry release534296.
- Installed/staged Node: v22.22.3, SHA256 `780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b`.
- Actual production host SHA256: `837788851b178d5334af4c0623aafd9a02ffc93cdcd28c0e9aafd4dd4f73d0b8`.

These are local observations, not signature, installation-provenance, servicing, support-lifecycle or general executable-trust attestations.

## Qualification and limits

The combined zero-capability SECURITY_CAPABILITIES, exactly three inherited pipe ends and exact creation-time JOB_LIST configuration ran through the actual compiled core. Native policy remains unnamed/noninherited KILL_ON_JOB_CLOSE, active-process limit4, exact flags0x2008, no breakaway, suspended creation, exact package SID/caps0/Low4096/no elevation/no enabled administrator and pinned image verification before resume. No post-creation assignment fallback, broad inheritance, network action or ACL repair was added.

The final suite set is Cli, Boundary, Input, Protocol, Lifecycle, LifecycleDeadline, Cleanup and Crash. Tests include excluded sentinel objects with positive controls, same-handle input, malformed protocol, backpressure/overflow, terminal producers, cancellation, cleanup preservation and independent held-handle crash observations. The deferred raw-ingress test now accepts otherwise-valid JSON padded with leading whitespace to exactly98304 bytes and rejects the otherwise-identical98305-byte request using the existing sequential protocol fixture and TEST transport allowance.

Original CLI compile RED records absent entry/report classes. A later deliberate runtime RED proved that a synthetic Passed=true flag without completion evidence was insufficiently guarded; the final shared entry explicitly refuses that case. No native qualification failure occurred in Task6. Earlier All runs are retained separately from the final-source run.

The full45s outer watchdog timeout was not deliberately fired. Actual forced owner/driver stops and inner fail-stop paths were exercised; that finite proof does not establish every possible OS scheduling/API behavior. Budgets are software acceptance bounds, not real-time OS guarantees. A forced failed owner, independently corroborated no-live-process/pump observation and separate scoped cleanup are distinct facts; follow-up success never changes the original failed-run cleanup result.

The host/development source and authored synthetic fixture are trusted only for this slice. Hostile same-user processes, administrators, kernel compromise, production root ACL trust, protected deployment/runtime provenance, real-worker launch, effective network/broker restrictions and authenticated human approval remain outside this qualification. Product broker/queue/editor wiring, the hard-false execution gate, handoff inventory and historical P32-P36 evidence are unchanged.

## Preserved original failures

All nine rows remain cleanup-unverified and preserved. No current run adopted or deleted them. Exact input/profile paths and original evidence identifiers appear separately for each row in the JSON observation.

| Nonce | Original result |
| --- | --- |
| `04c92cc06585478dac29520187465c12` | Task3 original timeout; failed run, missing original ownership capture. |
| `548d0246b9064934930af4184f9b1cf0` | Task5 PumpFailStop diagnostic assertion failure; held exits observed, original cleanup false; per-entry ownership unavailable. |
| `06ed9a08758e48a2955e042c934c1ab8` | Task5 Boundary loop follow-up omitted; exit0 was not accepted as zero-residual cleanup; stopped/never-resumed original cleanup false. |
| `3ece6fbfb2404e639936ef58d3ee822f` | Task5 Boundary loop follow-up omitted; exit0 was not accepted as zero-residual cleanup; stopped/never-resumed original cleanup false. |
| `462f960a70194d2e8467db5d1d606622` | Task5 Boundary loop follow-up omitted; exit0 was not accepted as zero-residual cleanup; stopped/never-resumed original cleanup false. |
| `d69d96856d2d4029a1c11ce7c9526120` | Task5 Boundary loop follow-up omitted; exit0 was not accepted as zero-residual cleanup; stopped/never-resumed original cleanup false. |
| `8b4c8dc1cd8f448abedaeb69b2cd2e15` | Task5 Boundary terminal identity re-query cleanup failure, exit1; specific native subcall/error unrecorded. |
| `4c3fed58ba0e48eabc5c3e0970cd0475` | Task5 Input terminal identity re-query cleanup failure, exit1; specific native subcall/error unrecorded. |
| `0ef305f0db8f4fe59c223721f9f426e3` | Task5 Protocol terminal identity re-query cleanup failure, exit1; specific native subcall/error unrecorded. |

The Task5 profile-unknown follow-up bookkeeping failure at build44e98ebfcdd049ec824a4ca9acb6695c also remains historical failed evidence; that case left no residual after its separate scoped deletion. It is not one of these nine pairs.

Implementation is ready for independent whole-branch review. No merge, deployment, protected installation, account activation, real editor, live queue or publishing action is authorized by this record.
