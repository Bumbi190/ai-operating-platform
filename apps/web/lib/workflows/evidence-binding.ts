/**
 * lib/workflows/evidence-binding.ts — the one place that says which target a
 * piece of evidence is about.
 *
 * ── TWO PINS, TWO PURPOSES ─────────────────────────────────────────────────
 * There are two `canonicalTargetVersionHash` payloads in this system and they
 * are NOT interchangeable:
 *
 *   kind: 'workflow.evidence'   evidenceTargetPayload      — what evidence is about
 *   kind: 'workflow.action'     workflowActionTargetPayload — what an action was approved to do
 *
 * The action payload deliberately INCLUDES the declared evidence rows, so that
 * new evidence invalidates a pending authorization. The evidence payload
 * deliberately does not: it is instance + definition + state + check + declared
 * provenance, and nothing that moves when a row is appended.
 *
 * That difference is why evidence must never be pinned to a run's
 * `target_version_hash`. Doing so would be wrong twice over: it is a different
 * KIND of pin, so `evaluateCheck` would read it as stale; and it would drift the
 * moment the row was written, because writing the row changes the action
 * payload that produced the hash. Evidence would be born stale.
 *
 * ── ONE CLOSURE, THREE READERS ─────────────────────────────────────────────
 * The scheduler tick, the pre-run evidence gate and the READ_ONLY seam all ask
 * "is this check satisfied". They must ask it the same way or they will disagree
 * about the same row, so the hash function lives here and each of them calls it.
 */

import 'server-only'

import { computeEvidenceTargetHash } from './attestation'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from './types'

/** Provenance a producer declared, which is part of what evidence is about. */
interface EvidenceProvenance {
  source_commit?: string
  artifact_manifest_hash?: string
}

/**
 * The target-hash function `summarizeStateEvidence` expects for one state.
 *
 * Per-check, and per-row: `source_commit` and `artifact_manifest_hash` come from
 * the row's own declared provenance, so a check about built artefacts is pinned
 * to those artefacts. An automated observation declares neither and pins to
 * null — which is correct, not a gap: an observation of a live endpoint is not
 * about a commit.
 */
export function evidenceTargetHashFor(
  instance: Pick<WorkflowInstance, 'id' | 'instance_key' | 'def_key' | 'def_version' | 'def_hash'>,
  spec: WorkflowSpec,
  state: string,
  rows: readonly WorkflowEvidence[],
): (checkKey: string) => string {
  return (checkKey: string) => {
    const row = rows.find(r => r.check_key === checkKey)
    const meta = (row?.attestation ?? {}) as EvidenceProvenance
    return computeEvidenceTargetHash({
      instance, spec, state, checkKey,
      sourceCommit: meta.source_commit ?? null,
      artifactManifestHash: meta.artifact_manifest_hash ?? null,
    })
  }
}

/**
 * The pin an AUTOMATED observation must carry.
 *
 * Deliberately takes no provenance: an executor observation has no source commit
 * and no artefact manifest to declare, and accepting either here would let a
 * handler's output influence what its own evidence is judged against.
 */
export function automatedObservationTargetHash(
  instance: Pick<WorkflowInstance, 'id' | 'instance_key' | 'def_key' | 'def_version' | 'def_hash'>,
  spec: WorkflowSpec,
  state: string,
  checkKey: string,
): string {
  return computeEvidenceTargetHash({
    instance, spec, state, checkKey,
    sourceCommit: null, artifactManifestHash: null,
  })
}
