/**
 * lib/atlas/autonomy-runtime/bind.ts — bind-time autonomy admission.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * The ONE place autonomy is consulted when a workflow action run is about to be
 * bound. It composes the closed per-ActionKind policy (`autonomyPolicyFor`) and
 * the pure Phase 3B0 core (`admitAutonomyAction`), and turns a PERMISSIVE
 * answer into the provenance shape the atomic bind RPC persists together with
 * the run. It re-implements nothing.
 *
 * ── WHAT `admitted` MEANS ───────────────────────────────────────────────────
 * Only that the autonomy layer added no refusal. It is an ADDITIONAL veto that
 * runs after every existing bind gate (authorization, project isolation,
 * definition binding, evidence, spend, financial rollout) and replaces none of
 * them. capability ≠ authority.
 *
 * ── LICENCE-EXEMPT KINDS (Phase 3B1B) ───────────────────────────────────────
 * Admitted from the reviewed, compiled policy table alone. Nothing mutable is
 * read, so there is no TOCTOU: the provenance is the exemption itself.
 *
 * ── LICENSED KINDS (Phase 3B1B2 M4) ─────────────────────────────────────────
 * A licensed admission rests on three MUTABLE authority inputs — the licence
 * ledger, the Decision that governs the licence, and the platform Survival
 * ceiling. TypeScript cannot hold them still, so a TypeScript "yes" is never
 * sufficient on its own. It is the canonical, COMPLETE preflight (Option B+ part
 * B): the licence resolver (which folds the Decision through Chapter 11), the
 * whole-platform Survival ceiling, and the admission core — min(licence,
 * ceiling) >= the kind's minimum. Survival can only lower that; it never grants.
 *
 * Admission here only selects the licensed RPC. The AUTHORITY is decided again,
 * serialized, inside `bind_licensed_workflow_action_run_v1`: instance lock →
 * current Decision head lock → the conservative database proofs → commit-time
 * deadline → run + provenance → `survival_commit_fence()` last. Both must say
 * yes; neither can compensate for the other.
 *
 * A licensed kind OUTSIDE the M4 V1 set (`LICENSED_BIND_V1_KINDS`) has no
 * database proof, so it is still refused BEFORE any authority input is read.
 *
 * ── NO TRACE WRITER ─────────────────────────────────────────────────────────
 * This module writes nothing. Bind provenance is written only by the two atomic
 * bind RPCs, called from `createWorkflowActionRun`.
 */

import 'server-only'

import { resolveAutonomyLicense } from '@/lib/atlas/autonomy-license/resolve'
import { admitAutonomyAction, type AutonomyAdmissionResult } from './admission'
import { readPlatformSurvivalCeiling } from './platform-survival'
import { autonomyPolicyFor, LICENSED_BIND_V1_KINDS } from './policy'

/**
 * Exempt bind provenance: exactly the fields the exempt RPC writes.
 *
 * Deliberately NO run id, NO claim id and NO boundary: the run does not exist
 * yet, no claim exists before a run, and the boundary is fixed by the RPC
 * itself rather than chosen by a caller.
 */
export interface ExemptBindProvenance {
  readonly policy_mode: 'license_exempt_observation'
  readonly policy_reason: 'canonical_read_only_observation'
  readonly reason: 'exempt_observation'
  readonly required_level: 'L0'
}

/**
 * A licensed V1 admission. It selects the licensed RPC and carries NOTHING the
 * RPC would accept: the database derives the level, the licence, the Decision
 * and the Survival proof itself, and records only what it proved.
 */
export interface LicensedV1BindAdmission {
  readonly policy_mode: 'licensed'
  readonly admission_basis: 'db_conservative_proof_v1'
}

export type BindProvenance = ExemptBindProvenance | LicensedV1BindAdmission

/** Why a bind was refused. The canonical admission reasons, plus the M4 V1 scope veto. */
export type BindRefusalReason =
  | AutonomyAdmissionResult['reason']
  /** A licensed kind outside the M4 V1 set: no database proof can serialize its authority. */
  | 'licensed_bind_not_serializable'

export type BindAdmission =
  | { readonly admitted: true; readonly provenance: BindProvenance }
  | { readonly admitted: false; readonly reason: BindRefusalReason; readonly detail: string }

const isLicensedV1Kind = (kind: string): boolean =>
  (LICENSED_BIND_V1_KINDS as readonly string[]).includes(kind)

/**
 * Bind-time autonomy admission for one ActionKind on one workflow instance.
 *
 * Takes no level, no licence, no ceiling and no clock. Every authority input is
 * resolved server-side from the instance id; nothing a caller passes can widen it.
 */
export async function admitAutonomyAtBind(
  actionKind: string, workflowInstanceId: string,
): Promise<BindAdmission> {
  const policy = autonomyPolicyFor(actionKind)

  if (policy?.mode === 'licensed') {
    // ── outside V1: fail closed BEFORE reading licence, Decision or Survival
    if (!isLicensedV1Kind(actionKind)) {
      return {
        admitted: false, reason: 'licensed_bind_not_serializable',
        detail: `autonomy: ${actionKind} is licensed (minimum ${policy.minimumLevel}) but outside the M4 V1 `
          + 'licensed-bind set; its licence, Decision and Survival inputs have no database proof that '
          + `serializes them with the bind commit (instance ${workflowInstanceId})`,
      }
    }

    // ── V1: the canonical complete preflight. A refusal here is final, and so is
    //    a licence that could not be resolved at all: unknown authority is none.
    let licence: Awaited<ReturnType<typeof resolveAutonomyLicense>>
    let survival: Awaited<ReturnType<typeof readPlatformSurvivalCeiling>>
    try {
      [licence, survival] = await Promise.all([
        resolveAutonomyLicense(workflowInstanceId),
        readPlatformSurvivalCeiling(),
      ])
    } catch (e) {
      return {
        admitted: false, reason: 'licence_not_effective',
        detail: `autonomy: ${actionKind} was not admitted (licence authority could not be resolved: `
          + `${e instanceof Error ? e.message : String(e)})`,
      }
    }
    const r = admitAutonomyAction({
      actionKind, licence, survivalCeiling: survival.ok ? survival.ceiling : null,
    })
    if (r.allowed && r.reason === 'allowed') {
      return { admitted: true, provenance: { policy_mode: 'licensed', admission_basis: 'db_conservative_proof_v1' } }
    }
    return {
      admitted: false, reason: r.reason,
      detail: `autonomy: ${actionKind} was not admitted (${r.reason}; licence ${licence.reason}`
        + `${survival.ok ? '' : `; survival ${survival.reason}`})`,
    }
  }

  // ── unknown / unsupported / exempt: the pure core decides, with no inputs
  //    it could be wrong about. An exempt kind consults no licence or ceiling.
  const r = admitAutonomyAction({ actionKind, licence: null, survivalCeiling: null })

  if (policy?.mode === 'license_exempt_observation' && r.allowed && r.reason === 'exempt_observation') {
    return {
      admitted: true,
      provenance: {
        policy_mode: 'license_exempt_observation',
        policy_reason: policy.exemptionReason,
        reason: 'exempt_observation',
        required_level: policy.minimumLevel,
      },
    }
  }

  return {
    admitted: false, reason: r.reason,
    detail: policy?.mode === 'unsupported'
      ? `autonomy: ${actionKind} is unsupported (${policy.unsupportedReason}): ${policy.detail}`
      : policy
        ? `autonomy: ${actionKind} was not admitted (${r.reason})`
        : `autonomy: ${actionKind} has no autonomy policy`,
  }
}
