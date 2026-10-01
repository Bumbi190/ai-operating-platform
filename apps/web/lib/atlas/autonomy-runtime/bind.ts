/**
 * lib/atlas/autonomy-runtime/bind.ts — Phase 3B1B bind-time autonomy admission.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * The ONE place the canonical autonomy systems are consulted when a workflow
 * action run is about to be bound. It composes, and re-implements nothing:
 *
 *   policy     — `autonomyPolicyFor`          (the closed per-ActionKind table)
 *   licence    — `resolveAutonomyLicense`     (the canonical Phase 2C read)
 *   Survival   — `readPlatformSurvivalCeiling` (the platform ceiling adapter)
 *   decision   — `admitAutonomyAction`        (the pure Phase 3B0 core)
 *
 * and turns a PERMISSIVE answer into the exact provenance the atomic bind RPC
 * persists together with the run.
 *
 * ── WHAT `admitted` MEANS ───────────────────────────────────────────────────
 * Only that the autonomy layer added no refusal. It is an ADDITIONAL veto that
 * runs after every existing bind gate (authorization, project isolation,
 * definition binding, evidence, spend, financial rollout) and replaces none of
 * them. capability ≠ authority.
 *
 * ── WHAT IS READ, AND WHAT IS NOT ───────────────────────────────────────────
 *   • unsupported / unknown — refused before ANY read. No level compensates.
 *   • licence-exempt        — no licence and no Survival read at all. The
 *                             provenance is the exemption itself; inventing a
 *                             licence or a Survival observation would be a
 *                             fabricated record.
 *   • licensed              — the canonical licence; Survival ONLY when the
 *                             licence is effective and the kind is in scope,
 *                             because the admission order never consults it
 *                             otherwise and the trace forbids claiming it did.
 *
 * ── THE WATERMARK ───────────────────────────────────────────────────────────
 * The licence is resolved here, in TypeScript, and the run is committed later
 * in SQL. Authority can change in between. The resolver reports
 * `ledgerWatermark` — the highest licence `event_seq` among the exact events it
 * folded — and the bind RPC refuses (40001, nothing written) if any event above
 * it exists at commit time. Because the watermark comes from the SAME read the
 * answer was computed from, there is no second read that could disagree with it.
 *
 * ── NO TRACE WRITER ─────────────────────────────────────────────────────────
 * This module writes nothing. The only bind-provenance writer is the atomic
 * `bind_workflow_action_run` RPC, called from `createWorkflowActionRun`.
 */

import 'server-only'

// The canonical resolution and NOTHING else from the licence module: this file
// can read what resolution produced, never construct the store, issue, derive
// or re-fold a licence. Pinned by the exact per-file allowlist in the licence
// suite.
import { resolveAutonomyLicense } from '@/lib/atlas/autonomy-license/resolve'
import { admitAutonomyAction, type AutonomyAdmissionResult } from './admission'
import { autonomyPolicyFor } from './policy'
import { readPlatformSurvivalCeiling, type PlatformSurvivalResult } from './platform-survival'

/**
 * Exactly the bind-provenance fields the atomic RPC accepts.
 *
 * Deliberately NO run id, NO claim id and NO boundary: the run does not exist
 * yet, no claim exists before a run, and the boundary is fixed by the RPC
 * itself rather than chosen by a caller.
 */
export interface BindProvenance {
  readonly policy_mode: 'license_exempt_observation' | 'licensed'
  readonly policy_reason: 'canonical_read_only_observation' | null
  readonly reason: 'exempt_observation' | 'allowed'
  readonly license_id: string | null
  readonly license_generation: number | null
  readonly license_reason: string | null
  readonly required_level: string
  readonly effective_level: string | null
  readonly survival_state: string | null
  readonly survival_ceiling: string | null
  readonly survival_reason: string | null
  readonly bounded_by: 'licence' | 'survival_ceiling' | 'survival_unavailable' | null
  readonly license_resolved_at: string | null
  readonly survival_as_of: string | null
  /**
   * The resolver's `ledgerWatermark`. Not stored in the trace — it is the
   * concurrency proof the RPC checks.
   */
  readonly license_watermark: number | null
}

export type BindAdmission =
  | { readonly admitted: true; readonly provenance: BindProvenance }
  | {
      readonly admitted: false
      /** The canonical admission reason. Never invented. */
      readonly reason: AutonomyAdmissionResult['reason']
      readonly detail: string
    }

/**
 * Bind-time autonomy admission for one ActionKind on one workflow instance.
 *
 * Takes no level, no licence, no ceiling and no clock: every authority input is
 * derived from the canonical sources, so a caller cannot widen its own terms.
 */
export async function admitAutonomyAtBind(
  actionKind: string, workflowInstanceId: string,
): Promise<BindAdmission> {
  const policy = autonomyPolicyFor(actionKind)

  // ── unknown / unsupported: the pure core refuses, before any read ─────────
  if (!policy || policy.mode === 'unsupported') {
    const r = admitAutonomyAction({ actionKind, licence: null, survivalCeiling: null })
    return {
      admitted: false, reason: r.reason,
      detail: policy?.mode === 'unsupported'
        ? `autonomy: ${actionKind} is unsupported (${policy.unsupportedReason}): ${policy.detail}`
        : `autonomy: ${actionKind} has no autonomy policy`,
    }
  }

  // ── licence-exempt observation: nothing is consulted, nothing invented ────
  if (policy.mode === 'license_exempt_observation') {
    const r = admitAutonomyAction({ actionKind, licence: null, survivalCeiling: null })
    if (!r.allowed || r.reason !== 'exempt_observation') {
      return { admitted: false, reason: r.reason, detail: `autonomy: exempt policy did not admit ${actionKind}` }
    }
    return {
      admitted: true,
      provenance: {
        policy_mode: 'license_exempt_observation',
        policy_reason: policy.exemptionReason,
        reason: 'exempt_observation',
        license_id: null, license_generation: null, license_reason: null,
        required_level: policy.minimumLevel,
        effective_level: null,
        survival_state: null, survival_ceiling: null, survival_reason: null,
        bounded_by: null,
        license_resolved_at: null, survival_as_of: null,
        license_watermark: null,
      },
    }
  }

  // ── licensed ──────────────────────────────────────────────────────────────
  // The canonical resolution, and the watermark of the exact ledger read it
  // was computed from — see the header.
  const licence = await resolveAutonomyLicense(workflowInstanceId)
  const watermark = licence.ledgerWatermark

  // Survival is read only where the admission order would consult it. A
  // failed read is passed as NULL — never as its L0 placeholder — so the
  // composition reports `survival_unavailable` rather than an observed L0.
  let survival: PlatformSurvivalResult | null = null
  if (licence.effective && licence.allowedActionKinds.includes(actionKind)) {
    survival = await readPlatformSurvivalCeiling()
  }

  const r = admitAutonomyAction({
    actionKind, licence,
    survivalCeiling: survival && survival.ok ? survival.ceiling : null,
  })

  if (!r.allowed) {
    return {
      admitted: false, reason: r.reason,
      detail: `autonomy: ${r.reason} (licence ${licence.reason}, required ${r.requiredLevel ?? '—'}, `
        + `effective ${r.effectiveLevel ?? '—'})`,
    }
  }

  // An admitted licensed decision must be fully representable. Any gap is a
  // broken invariant, and a broken invariant refuses — it never persists a
  // partial record that looks like provenance.
  if (r.reason !== 'allowed' || licence.licenseId === null || licence.generation === null
      || r.requiredLevel === null || r.effectiveLevel === null || survival === null
      || watermark === null
      || (r.boundedBy !== 'licence' && r.boundedBy !== 'survival_ceiling'
          && r.boundedBy !== 'survival_unavailable')) {
    return {
      admitted: false, reason: r.reason,
      detail: 'autonomy: admitted licensed decision is not fully representable; refusing',
    }
  }

  return {
    admitted: true,
    provenance: {
      policy_mode: 'licensed',
      policy_reason: null,
      reason: 'allowed',
      license_id: licence.licenseId,
      license_generation: licence.generation,
      license_reason: licence.reason,
      required_level: r.requiredLevel,
      effective_level: r.effectiveLevel,
      survival_state: survival.ok ? survival.state : null,
      survival_ceiling: survival.ok ? survival.ceiling : null,
      survival_reason: survival.ok ? null : survival.reason,
      bounded_by: r.boundedBy,
      license_resolved_at: licence.resolvedAt,
      survival_as_of: survival.ok ? survival.asOf : null,
      license_watermark: watermark,
    },
  }
}
