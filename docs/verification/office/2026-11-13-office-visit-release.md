# Office visit release candidate — 13 November 2026

The existing Office game can maintain one explicitly selected Familje-Pling identity after its pairing page is hidden or closed. The foreground companion verifies the approved local receiver and pins the exact game process. It stops when that process exits. Independent project workflows are unaffected.

## Release state

This candidate is tested and intended for review in existing Draft PR634 on feat/atlas-office-entry-20261106. Base before this delivery: 80bbe170ffe6a0e1ba742fc02af727e59d6ea273. No production merge, hosted schema application, real owner grant, URI installation, voice or model/workflow activation is performed by preparing this delivery.

The launch-only omnira-office://open handler stays unchanged. The candidate uses an explicit --visit CLI. A reviewed fixed-module installer and exact visit URI remain a separate integration step before normal entry from Omnira is offered.

## Verification

Fresh Windows runs:
- Office Python:96/96, including previous74 regression tests and disposable PostgreSQL integration.
- Office web/controller/panel/server tests:32/32.
- Campus tests:45/45.
- Ownership/isolation:119/119 across5files.
- Migration Guard/schema invariants/Office migration release:125/125 across3files.
- Total417 scoped tests; TypeScript check passes.
- Actual cross-process browser controller → HTTP handlers → Python companion → atomic projection passes across2 native reads after browser detach, then clears on simulated game-process exit. Identity, upstream DB/auth/process/TLS fixtures are synthetic.
- Existing cross-language legacy relay integration and actual pure DTO producer contract also passed during this workstream.

The unrelated historical broad Windows web suite is not asserted green (previous baseline129failedfiles/444failedtests). No new full web matrix was run.

Independent implementation review found6 Important issues; each was reproduced and fixed with a regression test. Provisional attach expires after15seconds unless the browser has read native acknowledgement and confirmed the same scope. Outbound DNS/TLS/body reads run in a disposable, fixed-purpose worker with a total bounded deadline. Late failed workers cannot write after losing the writer lease. Loopback shutdown closes active sockets. Browser observation failure detaches monitoring without revoking a healthy confirmed native visit. Persisted frames are capped at both the20second source maximum and the visit's lease/absolute expiry.

The deferred minor JSON whitespace issue is now fixed and tested, including UTF-8 BOM handling. No deferred review finding remains from that review.

## Canonical migration and fail-closed build

CLI-generated filename: apps/web/supabase/migrations/20261113105758_office_visit_sessions.sql. The original file was created under the legacy root and moved, byte-identically, to the canonical directory actually read by the Vercel build guard. No SQL body change accompanied the move.

Guard count tripwires advance from175/161 to176/162. Frozen14 grandfathered and30 legacy names, hashes, guard evaluation functions, emergency override behavior and ledger RPC are unchanged. Historical captures remain immutable; tests now correctly treat them as missing the pending Office migration.

Read-only live metadata from Omnira / AI Operating Platform, project iboepohjwrhtgshrqaol:
- PostgreSQL17; required auth.sessions/project/agent columns have expected UUID/text types.
- Migration function owner postgres has SELECT and row-lock privileges on auth.sessions.
- office_private schema and Office RPCs are absent.
- The real ledger contains198names and does not contain office_visit_sessions.
- A publishable-key, read-only Accept-Profile request returns406/PGRST106 for office_private: the private schema is not exposed in the current Data API configuration.
- Applying the unmodified guard to the actual observed names blocks specifically on office_visit_sessions. Adding that name only in a hypothetical fixture yields199known names and162/162 enforced. No live ledger was edited.

A hosted preview is expected to remain blocked until the reviewed migration is applied through the normal migration mechanism and verified. Do not bypass the guard or manufacture a ledger row.

## Hosted activation scope to review separately

One additive migration creates2 private tables, visits and create_attempts;3 private SECURITY DEFINER functions with locked search_path;3 public SECURITY INVOKER wrappers. Direct anon/authenticated/service_role table grants are revoked, RLS enabled, and only the existing backend service role may execute the narrow RPCs. Public and authenticated users cannot call them directly.

The change stores scoped visit metadata and secret digests, not passwords/JWTs/cookies/refresh tokens. It does not edit existing projects, agents, auth sessions, workflows or customer records. No new paid resource, subscription, environment key or third-party integration is introduced. Running visits consume existing Vercel/Supabase request quotas; no voice/model cost is incurred by this identity-only transport.

Upper bounds:4hours absolute;30second nonrevivable server lease;20second native source limit;8second sequential poll interval;5second network budget;250ms process monitor. One avatar/project/agent only. Five structurally valid create attempts per5minutes and at most100 retained visit metadata rows per owner, with bounded lazy cleanup.

## Rollback / disable

Before a real owner test, verify catalog rights, private API exposure and the actual ledger entry. If verification fails, disable only the new Office access without deleting audit metadata:

~~~sql
REVOKE EXECUTE ON FUNCTION
 public.office_visit_create(uuid,uuid,uuid,text,uuid,uuid,text),
 public.office_visit_presence(uuid,text),
 public.office_visit_revoke(uuid,text,uuid,uuid),
 office_private.create_visit(uuid,uuid,uuid,text,uuid,uuid,text),
 office_private.presence(uuid,text),
 office_private.revoke_visit(uuid,text,uuid,uuid)
 FROM service_role;
REVOKE USAGE ON SCHEMA office_private FROM service_role;
UPDATE office_private.visits
 SET revoked_at=coalesce(revoked_at,clock_timestamp());
~~~

Do not drop customer data or rewrite migration history. Leave the old launch-only/legacy transport and approved Unreal world intact. A future frontend release can be reverted independently while the new access remains disabled.

## Trust boundary

The companion enforces installation/game-process checks locally; the server does not remotely attest a Windows process. A signed-in owner can manually create a bounded read grant for their own registered agent. Server ownership/session/agent validation prevents cross-owner access. Remote device attestation would require a separate enrollment design.

Timestamp-bound UUIDv7 claims prevent old IDs from being reclaimed after bounded metadata cleanup. A computer clock more than30seconds out of sync fails closed and needs correction before a new visit.

The temporary credential only authenticates dedicated Office metadata endpoints. Work status stays unknown. Real owner/ordinary Unreal acceptance for the new visit transport remains pending hosted activation and reviewed local installation.

SQL SHA256 (LF-normalized): a77bbd8837122cf419c271e534b594811217caec5c9142941bd6eecd8a7fb337

## Delivery follow-up: main integration and CI classification

Main0c8cb611 was integrated into the Office branch without changing its approved The Prompt runtime code. The merged local check set passed250QA tests,32Office tests,45Campus tests and typecheck; the96Python tests' source is unchanged and their earlier fresh run passed. The private schema registry remains byte-identical to main.

GitHub's full migration-security corpus correctly rejected office_private as unclassified. The follow-up adds only this exact non-exposed schema to the existing internal-schema registry. No migration-statement exceptions, fingerprints, runtime gate code, frozen grandfathered/legacy lists, RPC rights or SQL bytes change. New whole-corpus tests pin exactly2Office tables, enabledRLS, zero policies and no direct PUBLIC/anon/authenticated/service_role table privileges. Client grants and similarly named unreviewed schemas remain blocking.

The new tests failed before registration and pass after it:215/215 across migration-security-gate, schema-security-invariant and Office migration release, plus typecheck. A separate read-only review found no Important/Critical or Minor finding in this scoped classification/test change; that reviewer did not independently execute the tests. An earlier SDF-1C CI attempt hit a5second Docker-host proof test timeout; no broker code or runtime/test deadline was relaxed. The next source delivery reruns the unchanged CI suite.

Vercel's actual build log confirms the remaining hosted release block is exactly the unapplied office_visit_sessions migration. Production schema remains untouched.
