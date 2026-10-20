# Windows Broker Identity and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing broker's generate, enroll and diagnostic commands usable on André's Windows desktop with a persistent non-exportable P-256 identity, without enabling code execution.

**Architecture:** Add a Windows CNG adapter behind the existing BrokerSigner interface and select it by the actual OS. Keep Mac behavior, the server's ES256/DER protocol and the six existing server routes. This is the first independent prerequisite of the approved first-code-job design; Windows repository/Docker qualification, workspace materialization and the execution loop require subsequent plans.

**Tech Stack:** TypeScript/Node, .NET 8 console helper with Windows CNG, existing Vitest and server crypto verifier. No external .NET packages or paid services.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md — approved by André on 2026-10-18, 17:34 Europe/Stockholm.

## Global Constraints

- First execution host is the stationary Windows computer. This plan enables identity/diagnostics only; it does not claim that Windows isolation or code jobs work.
- Private keys never leave Windows CNG; storage is labelled `windows_cng`, never Secure Enclave or TPM.
- Keep P-256, ES256, SHA-256, DER signature encoding, canonical request bytes and server authorization rules unchanged.
- Keep native helper limits: 16384 payload bytes, 32768 output bytes, 15000 ms timeout.
- No model/API spend, subscription changes, production enrollment, server approval, new grants, migrations, automatic merge/deploy or job polling in this plan.
- Test identities and fixture files belong to the test harness. Only these may be cleaned up automatically.
- Existing full-suite failures and OS-specific skips must remain visible. No skipped native check is represented as a Windows pass.
- Later code jobs retain the approved limits: two worker iterations, eight changed files, 131072 diff bytes, 1200 seconds.

## Review Focus

1. A returning user must reopen the same key after a new process; generate must never silently rotate an existing identity. Covered by Task 1/4.
2. Windows paths contain spaces; helper execution must use an exact executable and argument array, never shell expansion. Covered by Task 2.
3. A syntactically plausible helper result may contain another key, wrong UUID or a forged thumbprint. Reject it before enrollment/signing. Covered by Task 2.
4. Enrollment/diagnostics must not follow redirects or send a signed request to a non-loopback HTTP origin. Covered by Task 3.
5. An unavailable helper, denied key access, unsupported OS or oversized Unicode payload must produce a bounded failure without creating a substitute key. Covered by Tasks 1/2/4.

---

## Scope and dependency map

The approved design is deliberately split into independently releasable plans:
- This plan: Windows identity and signed diagnostics; no server registration is performed during verification.
- Next: Windows tool trust/ACLs, canonical repo paths, named-pipe daemon identity and Docker/WSL2 qualification. A healthy Docker version observed on 2026-10-18 is not that proof.
- Then: pinned workspace/dependencies in a named volume; bounded patch and test executor.
- Then: signed runtime/evidence/result endpoints, governed model calls and cancellation/recovery.
- Then: conversation status and a real small bug with human review.
- Later: multiple repositories, independent AI review, PR mutation and bounded subagents.

None of the deferred capabilities is enabled implicitly by this plan. Implementation starts only after plan review and execution-method selection.

## File map

Create:
- `apps/code-broker/native/windows/OmniraBrokerIdentity.csproj`: .NET 8 console project, no PackageReference, framework-dependent DLL.
- `apps/code-broker/native/windows/NuGet.Config`: clear external package sources for this dependency-free helper.
- `apps/code-broker/native/windows/Program.cs`: closed command parser and bounded JSON I/O.
- `apps/code-broker/native/windows/WindowsIdentityStore.cs`: CNG key creation/reopening, public projection and DER signing.
- `apps/code-broker/native/windows/smoke/Smoke.csproj` and `Program.cs`: independent native proof including attempted private export and fixture-only deletion.
- `apps/code-broker/src/identity/windows-cng.ts`: fixed local helper boundary and strict public-result validation.
- `apps/code-broker/src/identity/platform-signer.ts`: OS selection.
- `apps/code-broker/src/protocol/origin.ts`: shared HTTPS/loopback origin validation.
- `apps/web/lib/qa/sdf-windows-identity.test.ts`: portable adapter/protocol tests.
- `apps/web/lib/qa/sdf-windows-identity-native.test.ts`: opt-in real Windows/CNG proof.
- `docs/verification/2026-10-18-windows-broker-identity.md`: exact source, commands, results and remaining blocks.

Modify:
- `apps/code-broker/src/identity/types.ts`: add storage label only.
- `apps/code-broker/src/cli.ts`: replace unconditional Mac signer with OS factory.
- `apps/code-broker/src/protocol/{http-client,operational-client}.ts`: reuse common origin rules, keep operational APIs unchanged.
- `apps/code-broker/package.json` and `.gitignore`: helper build script and ignored native bin/obj output.
- Existing focused tests only where shared-origin extraction changes imports; do not weaken old boundaries.

No web route, database schema, runtime grant or worker registry changes.

## Task 1: Persistent Windows CNG identity

**Interfaces**
- Consumes existing public identity shape from `src/identity/types.ts`.
- Produces C# `IdentityPublicResult WindowsIdentityStore.Generate(string id)`, `IdentityPublicResult ReadPublic(string id)`, `string Sign(string id, byte[] payload)`. Define `IdentityPublicResult` and nested `BrokerPublicJwk` records with the exact JSON property names below; serialize using System.Text.Json.
- JSON public result: `{identityId,publicJwk:{kty:"EC",crv:"P-256",x,y},keyThumbprint,storage:"windows_cng"}`.
- Signature result: `{signature: string}`, base64url DER, without padding.
- Production helper supports only `generate --identity UUID`, `public --identity UUID`, `sign --identity UUID --payload-base64 VALUE`.

- [ ] Write the native smoke harness first. Assert: fresh key reopens with identical JWK/thumbprint; duplicate generate fails and preserves the old key; public/sign on missing identity fail without creation; EccPrivateBlob export throws; a valid UUID outside version 1–5/variant 8–b fails before key access. Use random UUIDs with the harness-owned key-name namespace `com.omnira.code-broker.<UUID>`; fixture deletion runs in finally only for keys this harness successfully created and cannot accept an operator-supplied name.
- [ ] Run the dependency-free native build to show missing production types fail. Command: `dotnet build apps/code-broker/native/windows/smoke/Smoke.csproj --configfile apps/code-broker/native/windows/NuGet.Config -c Release`. Expected RED: missing identity-store/project implementation, not a network/package-resolution error.
- [ ] Implement net8.0-windows projects with no PackageReference and `UseAppHost=false`. Exclude `smoke/**/*.cs` from the production project's Compile items; the smoke project references the production project and has its own entry point. Use current-user `CngKey`, `CngAlgorithm.ECDsaP256`, `CngProvider.MicrosoftSoftwareKeyStorageProvider`, `CngExportPolicies.None`, signing-only usage. Never overwrite an existing key, import a private key or fall back to plaintext files. Inspect existing provider/curve/export-policy before reopening for use.
- [ ] Implement exact argument parsing: reject unknown/duplicate flags, noncanonical UUIDs, invalid base64 and payloads over 16384 UTF-8 bytes. Sign with `ECDsaCng.SignData(payload, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence)`. Export public parameters only; compute thumbprint from UTF-8 canonical JWK with property order crv,kty,x,y. Errors emit only a stable generic code; no stack trace, payload or key bytes.
- [ ] Run native smoke. Expected GREEN: every stated assertion passed; process exits 0 and fixture keys are removed. Build helper DLL into `apps/code-broker/.native/windows/`; leave no production identity behind.
- [ ] Commit the native helper and smoke tests: `feat(broker): add non-exportable Windows CNG identity`.

## Task 2: Fixed Windows adapter and OS selection

**Interfaces**
- Consumes Task 1 helper output.
- Produces `class WindowsCngBrokerSigner implements BrokerSigner`, with existing generateIdentity/getPublicIdentity/signCanonicalPayload/verifyLocalIdentityAvailable signatures.
- Produces `createPlatformBrokerSigner(platform: NodeJS.Platform = process.platform): BrokerSigner`: win32 → Windows adapter; darwin → existing SecureMacBrokerSigner; all others throw unsupported-platform.
- An internal test factory accepts a mocked helper runner; production constructor accepts no path, environment or command override.

- [ ] Add portable failing tests in `sdf-windows-identity.test.ts`: selection preserves Mac; Linux refuses; malformed identity rejected before spawn; >16384-byte Unicode rejected; helper timeout/output overflow/unavailable key produce generic failure; mismatched UUID, invalid JWK point, forged thumbprint, extra/private JWK fields and wrong storage rejected.
- [ ] Run `npm exec --workspace=apps/web -- vitest run lib/qa/sdf-windows-identity.test.ts --maxWorkers=2 --minWorkers=2`. Expected RED from missing adapter/factory.
- [ ] Implement adapter using fixed `C:\\Program Files\\dotnet\\dotnet.exe` and a package-relative helper DLL resolved with `fileURLToPath`. Invoke `execFile` with an argument array, `shell:false`, `windowsHide:true`, existing timeout/output ceilings. Do not read a helper path from environment/PATH. Fail if the fixed runtime/helper is unavailable or a helper ancestor is a reparse point. This prerequisite proves the fixed invocation only; full Windows executable ACL trust remains in the next plan.
- [ ] Validate public output with Node public-key parsing, 32-byte base64url coordinates, recomputed RFC 7638 thumbprint, exact requested identity and storage label. Windows generation rejects the Mac-only fallback option. Signing rechecks identity availability, bounds payload bytes and returns only a syntactically bounded DER signature.
- [ ] Add `windows_cng` to local storage union and wire CLI to the factory. Keep CLI commands exactly generate/enroll/diagnostic; no job loop, isolation import or authority mutation.
- [ ] Run new tests plus `sdf1c-broker-identity-id.test.ts`, `sdf1c-trusted-broker.test.ts`, `sdf1c2-broker-control-channel.test.ts`. Expected GREEN without deleting/changing existing assertions; any newly discovered unrelated failure is reported with exact source.
- [ ] Commit: `feat(broker): select Windows identity adapter in diagnostic CLI`.

## Task 3: Signed diagnostic transport compatibility

**Interfaces**
- Consumes existing `postEnrollment`, `postSignedDiagnostic` and `assertOperationalOrigin(origin:string):URL`.
- Produces shared `assertBrokerOrigin(origin:string):URL` in origin.ts. Existing `assertOperationalOrigin` remains exported and delegates to it, preserving callers.
- Existing route names, request headers/body, counters and server verifier stay unchanged.

- [ ] Add failing tests to `sdf-windows-identity.test.ts`: allowed HTTPS and explicit localhost/127.0.0.1/::1 HTTP; reject credentials, query/hash, a non-root base path, non-loopback HTTP and non-HTTP schemes. Mock fetch: assert `redirect:"error"`; a redirect fails rather than causing a second request.
- [ ] Run the focused test command from Task 2 and observe these assertions fail against the current permissive enrollment/diagnostic transport.
- [ ] Extract current operational origin rules into shared origin.ts and use for enrollment/diagnostic as well. Preserve the closed route allowlist and one body serialization. Network errors expose no signed headers or pairing values.
- [ ] Test Windows-produced signature against the real web `verifyEs256` function locally: exact payload true, altered payload false, foreign key false. Verify canonical enrollment/request payload builders remain unchanged. This is a local protocol proof, not a production enrollment.
- [ ] Run the identity/trusted-broker/control-channel focused tests. Expected GREEN; no new server route, no protocol widening.
- [ ] Commit: `fix(broker): enforce fixed-origin signed diagnostic transport`.

## Task 4: Real Windows proof and handoff

**Interfaces**
- Consumes Tasks 1–3; produces verification report and install/run instructions without enrolling a production host.
- Native test gate: `SDF_WINDOWS_IDENTITY_REQUIRED=1` requires Windows, built helper and native proof; missing prerequisites fail. Ordinary non-Windows runs label native tests skipped, never passed.

- [ ] Write native Vitest tests that generate one fixture identity using the real adapter, reopen/sign through separate helper processes, verify with real web crypto, reject altered payloads and validate the smoke report's export/duplicate/missing-key assertions. No provider, Supabase or external HTTP call.
- [ ] Run before provisioning helper; expected RED if the helper is missing, with a prerequisite message. If already built from Task 1, capture the earlier Task 1 RED rather than deleting a working binary solely to recreate failure.
- [ ] Add npm `native:build:windows` script using the .NET project/output path and local clear-source NuGet.Config. Explicit setup only. Ignore native bin/obj artifacts including smoke outputs. Do not install or upgrade the observed .NET SDK 8.0.204.
- [ ] Run helper build, then `SDF_WINDOWS_IDENTITY_REQUIRED=1` focused native suite on the actual desktop (PowerShell: set the process env for that invocation and restore afterward). Expected all native tests executed/passed; fixture-only key cleanup confirmed. No real broker is registered.
- [ ] Run `npm exec --workspace=apps/code-broker -- tsc --noEmit` and a web typecheck. Run all newly changed identity/protocol suites once. Existing POSIX-only isolation suites run in the installed Ubuntu/WSL environment using a disposable test checkout if needed; do not pretend Windows can execute their hardcoded /usr/bin/git. Do not pull an image, provision a database or run the full repository suite for an identity-only change.
- [ ] Write the report with source SHA, exact pass/skip counts, native public result hashes, no private material, no production enrollment, and explicit remaining Windows ACL/Docker/workspace blockers. Record test errors rather than claiming completion on mocked proof.
- [ ] Inspect full diff for accidental runtime enablement and exposed key/pairing data. Perform the execution method's branch review, fix material findings, repeat only affected checks. Commit report: `docs(broker): record real Windows identity verification`.

## Plan self-review

- Scoped coverage: Windows signer, truthful storage, compatible signing, explicit installation and native proof map to Tasks 1–4. Canonical enrollment authorization remains unchanged and is exercised by existing broker tests; this plan does not perform production approval/revocation.
- Every Review Focus condition has an owning failing test. Native proof is separate from portable adapter tests.
- Signer method names remain those of BrokerSigner; JSON is compatible with server public-key projection. Storage is local metadata, absent from the enrollment wire shape, so no migration is needed.
- The approved larger design's host qualification, workspace, model, tests/result pipeline and conversation integration are explicitly deferred, not silently omitted or represented as enabled.
- A working Windows identity is a prerequisite deliverable. It is not a successful autonomous code job.

## Execution handoff

Recommended method: Native — implement these four closely related tasks in this session, then one independent whole-branch review. This avoids separate implementation/review contexts for every small task. User must review this plan and choose the method before implementation, per the writing-plans workflow.

Alternative: subagent-driven implementation and a reviewer per task, with higher context overhead. Do not start either method until the user selects it.
