/**
 * lib/atlas/autonomy-runtime/bind.ts — Phase 3B1B bind-time autonomy admission.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * The ONE place autonomy is consulted when a workflow action run is about to be
 * bound. It composes the closed per-ActionKind policy (`autonomyPolicyFor`) and
 * the pure Phase 3B0 core (`admitAutonomyAction`), and turns a PERMISSIVE
 * answer into the exact provenance the atomic bind RPC persists together with
 * the run. It re-implements nothing.
 *
 * ── WHAT `admitted` MEANS ───────────────────────────────────────────────────
 * Only that the autonomy layer added no refusal. It is an ADDITIONAL veto that
 * runs after every existing bind gate (authorization, project isolation,
 * definition binding, evidence, spend, financial rollout) and replaces none of
 * them. capability ≠ authority.
 *
 * ── WHY LICENSED KINDS FAIL CLOSED HERE (Phase 3B1B scope) ──────────────────
 * A licensed admission depends on three MUTABLE authority inputs — the licence
 * ledger, the Decision Ledger decision that governs the licence, and the
 * platform Survival ceiling — which are read here, in TypeScript, BEFORE the
 * atomic bind transaction commits. A bind may only commit on authority that is
 * structurally serialized with that commit, and today only one of the three can
 * be:
 *
 *   • licence ledger — serializable per workflow instance (its FK to
 *     `workflow_instances` takes FOR KEY SHARE on every licence insert, so a
 *     FOR UPDATE on the instance row would serialize issue AND narrowing acts);
 *   • Decision Ledger — NOT serializable without a project-wide lock or a SQL
 *     re-implementation of the Chapter 11 lifecycle fold (forbidden): records
 *     are plain project-scoped inserts and governance is also clock-driven;
 *   • Survival — NOT serializable at all: a continuous measurement with no
 *     event a transaction could lock against.
 *
 * Two-session PostgreSQL review proved the race is real (a reversal record and
 * a competing licence lineage both committed inside an open bind). A freshness
 * window is not serialization. So until a reviewed proof exists for every input,
 * a licensed kind is REFUSED at bind — before any of those inputs is even read.
 * This is a further veto, never a fallback: nothing becomes admissible that was
 * not before, and production holds zero licences.
 *
 * ── WHAT IS READ ────────────────────────────────────────────────────────────
 * Nothing mutable. Licence-exempt admission is a function of the reviewed,
 * compiled policy table alone, which is exactly why it has no TOCTOU: the
 * provenance is the exemption itself, and inventing a licence or a Survival
 * observation would be a fabricated record.
 *
 * ── NO TRACE WRITER ─────────────────────────────────────────────────────────
 * This module writes nothing. The only bind-provenance writer is the atomic
 * `bind_workflow_action_run` RPC, called from `createWorkflowActionRun`.
 */

import 'server-only'

import { admitAutonomyAction, type AutonomyAdmissionResult } from './admission'
import { autonomyPolicyFor } from './policy'

/**
 * Exactly the bind-provenance fields the atomic RPC accepts.
 *
 * Deliberately NO run id, NO claim id and NO boundary: the run does not exist
 * yet, no claim exists before a run, and the boundary is fixed by the RPC
 * itself rather than chosen by a caller. Only the exempt shape exists in 3B1B.
 */
export interface BindProvenance {
  readonly policy_mode: 'license_exempt_observation'
  readonly policy_reason: 'canonical_read_only_observation'
  readonly reason: 'exempt_observation'
  readonly required_level: 'L0'
}

/** Why a bind was refused. The canonical admission reasons, plus the 3B1B scope veto. */
export type BindRefusalReason =
  | AutonomyAdmissionResult['reason']
  /** A licensed kind: its authority inputs cannot yet be serialized with the bind commit. */
  | 'licensed_bind_not_serializable'

export type BindAdmission =
  | { readonly admitted: true; readonly provenance: BindProvenance }
  | { readonly admitted: false; readonly reason: BindRefusalReason; readonly detail: string }

/**
 * Bind-time autonomy admission for one ActionKind on one workflow instance.
 *
 * Takes no level, no licence, no ceiling and no clock. The instance id is part
 * of the signature so the admission names its subject, but no input derived
 * from it can widen anything: nothing mutable is read.
 */
export async function admitAutonomyAtBind(
  actionKind: string, workflowInstanceId: string,
): Promise<BindAdmission> {
  const policy = autonomyPolicyFor(actionKind)

  // ── licensed: fail closed BEFORE reading licence, Decision Ledger or Survival
  if (policy?.mode === 'licensed') {
    return {
      admitted: false, reason: 'licensed_bind_not_serializable',
      detail: `autonomy: ${actionKind} is licensed (minimum ${policy.minimumLevel}); licensed binds are `
        + 'refused until licence, Decision Ledger and Survival inputs are structurally serialized '
        + `with the bind commit (instance ${workflowInstanceId})`,
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
