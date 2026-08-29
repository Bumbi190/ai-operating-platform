/**
 * lib/workflows/attestation.ts — evidence produced somewhere Omnira cannot reach.
 *
 * Most of Familje-Stundens verification is local: ffprobe on a hero video, PDF
 * geometry, nineteen audio files counted on disk, `node --test`, `tsc`, a
 * production build. A serverless runtime cannot perform any of it, and PR3's
 * classifier says so honestly by refusing to auto-advance those states. This
 * module is the other half of that answer: a trusted producer runs the check
 * where the artefacts actually are, and states what it observed.
 *
 * ── AN ATTESTATION IS A STATEMENT, NOT AN OBSERVATION ───────────────────────
 * The single rule everything here protects: an attested PASS must never be
 * presented as something Omnira saw. `source` carries that distinction in the
 * database, the API preserves it, the consumption rules respect it, and the UI
 * shows it. A green tick with no provenance is exactly the failure this design
 * exists to prevent.
 *
 * ── BOUND TO ONE TARGET ─────────────────────────────────────────────────────
 * "19/19 audio files PASS" is only true about a specific set of artefacts, for a
 * specific month, under a specific definition. So evidence is pinned to a target
 * hash computed from the instance, the definition version, the state, the check,
 * and — where the producer supplies them — the source commit and the artifact
 * manifest hash. Rebuild the artefacts and the manifest hash moves; the old
 * attestation stops matching and goes STALE rather than silently continuing to
 * vouch for files that no longer exist.
 *
 * The hash is `canonicalTargetVersionHash` — the same primitive PR2 pins
 * authorizations with. There are already three canonicalizers in this repository
 * and this module deliberately adds no fourth.
 */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import { getState } from './machine'
import type { EvidenceSource, WorkflowInstance, WorkflowSpec } from './types'

/** The four outcomes an attested check may report. `skipped` is legacy-only. */
export type AttestedResult = 'pass' | 'fail' | 'blocked' | 'error'

export const ATTESTED_RESULTS: readonly AttestedResult[] = ['pass', 'fail', 'blocked', 'error']

/**
 * Who produced a statement. `omnira` is reserved for `automated` rows and can
 * never appear on an attestation — a producer claiming to be Omnira is precisely
 * the confusion the provenance column prevents.
 */
export type ProducerType = 'local_agent' | 'ci' | 'human'

export const PRODUCER_TYPES: readonly ProducerType[] = ['local_agent', 'ci', 'human']

/**
 * A check a workflow declares, and which provenance may satisfy it.
 *
 * Some checks must stay `automated`: Omnira probes the protected endpoints
 * itself, and accepting an attestation for that would replace a fact with a
 * claim. Others can only ever be `attested`, because the artefacts are not
 * reachable from a serverless runtime. Stating it per check keeps that decision
 * explicit instead of implied by whoever posts first.
 */
export interface AttestableCheck {
  check_key: string
  state: string
  allowed_provenance: readonly EvidenceSource[]
  description: string
  /**
   * Whether the target binding must include the artifact manifest hash. True for
   * checks that are claims ABOUT built files — rebuilding must invalidate them.
   */
  binds_artifacts: boolean
  /**
   * Whether this check must be SATISFIED for safe advancement.
   *
   * A required check that is absent, stale or blocked holds the workflow. An
   * informational one is recorded and shown but does not hold anything — it is
   * a fact worth having, not a gate. Stating it per check keeps "we could not
   * run this" from silently becoming either a blocker or a shrug.
   */
  required: boolean
}

// ── Target binding ───────────────────────────────────────────────────────────

export interface EvidenceTargetInput {
  instance: Pick<WorkflowInstance,
    'id' | 'instance_key' | 'def_key' | 'def_version' | 'def_hash'>
  spec: WorkflowSpec
  state: string
  checkKey: string
  /** Producer-supplied provenance, when the check is about built artefacts. */
  sourceCommit?: string | null
  artifactManifestHash?: string | null
}

/**
 * Everything that makes this evidence about THIS thing.
 *
 * Every field is load-bearing: change any of them and a prior attestation must
 * stop applying. `def_hash` covers the whole definition, so a version bump
 * invalidates everything; `state_inputs` covers what the check was told to look
 * at; `artifact_manifest_hash` covers the files themselves.
 */
export function evidenceTargetPayload(input: EvidenceTargetInput): Record<string, unknown> {
  const state = getState(input.spec, input.state)
  if (state === null) {
    throw new Error(`evidenceTargetPayload: "${input.state}" is not declared by ${input.spec.def_key}`)
  }
  return {
    kind: 'workflow.evidence',
    instance_id: input.instance.id,
    instance_key: input.instance.instance_key,
    def_key: input.instance.def_key,
    def_version: input.instance.def_version,
    def_hash: input.instance.def_hash,
    state: state.id,
    check_key: input.checkKey,
    state_inputs: [...state.inputs].sort(),
    source_commit: input.sourceCommit ?? null,
    artifact_manifest_hash: input.artifactManifestHash ?? null,
  }
}

/** The pin an attestation must carry to remain valid. */
export function computeEvidenceTargetHash(input: EvidenceTargetInput): string {
  return canonicalTargetVersionHash(evidenceTargetPayload(input))
}

/**
 * Deterministic hash of what the producer actually claims.
 *
 * Two producers reporting the same observation about the same target hash
 * identically, which is what makes a retried submission a no-op rather than a
 * duplicate fact.
 */
export function computeEvidencePayloadHash(input: {
  checkKey: string
  result: AttestedResult
  observedAt: string
  targetHash: string
  payload: Record<string, unknown>
}): string {
  return canonicalTargetVersionHash({
    check_key: input.checkKey,
    result: input.result,
    observed_at: input.observedAt,
    target_hash: input.targetHash,
    payload: input.payload,
  })
}

// ── Envelope ─────────────────────────────────────────────────────────────────

/**
 * One attested check, as submitted. This is the wire shape; the API reconstructs
 * it field by field rather than trusting the caller's object, so an unknown key
 * cannot ride into an append-only record.
 */
export interface AttestationEnvelope {
  instanceId: string
  state: string
  checkKey: string
  result: AttestedResult
  observedAt: string
  producerType: ProducerType
  /** Safe metadata only. Validated to carry no secret-shaped values. */
  payload: Record<string, unknown>
  tool?: string | null
  toolVersion?: string | null
  sourceCommit?: string | null
  artifactManifestHash?: string | null
}

/**
 * Keys that must never appear in a payload or in attestation metadata.
 *
 * Not a security boundary on its own — a determined producer can name a field
 * anything — but it catches the realistic accident of a QA script serialising
 * its whole environment into the bundle it uploads.
 */
const FORBIDDEN_KEY = /(secret|token|password|passwd|api[_-]?key|service[_-]?role|authorization|credential|bearer|private[_-]?key)/i

export interface PayloadValidation {
  ok: boolean
  errors: string[]
}

/**
 * Reject anything that looks like a credential, and anything unbounded.
 *
 * Depth and size are capped because this lands in an append-only table that
 * nobody can prune: a runaway payload is permanent.
 */
export function validateEvidencePayload(
  payload: unknown,
  path = 'payload',
  depth = 0,
): PayloadValidation {
  const errors: string[] = []
  if (depth > 6) return { ok: false, errors: [`${path}: nested too deeply (max 6)`] }

  if (payload === null || ['string', 'number', 'boolean'].includes(typeof payload)) {
    if (typeof payload === 'string' && payload.length > 4_000) {
      errors.push(`${path}: string exceeds 4000 characters`)
    }
    return { ok: errors.length === 0, errors }
  }
  if (Array.isArray(payload)) {
    if (payload.length > 200) errors.push(`${path}: array exceeds 200 entries`)
    payload.slice(0, 200).forEach((entry, i) => {
      errors.push(...validateEvidencePayload(entry, `${path}[${i}]`, depth + 1).errors)
    })
    return { ok: errors.length === 0, errors }
  }
  if (typeof payload === 'object') {
    const entries = Object.entries(payload as Record<string, unknown>)
    if (entries.length > 100) errors.push(`${path}: object exceeds 100 keys`)
    for (const [key, value] of entries) {
      if (FORBIDDEN_KEY.test(key)) {
        errors.push(`${path}.${key}: key name suggests a credential and is refused`)
        continue
      }
      errors.push(...validateEvidencePayload(value, `${path}.${key}`, depth + 1).errors)
    }
    return { ok: errors.length === 0, errors }
  }
  return { ok: false, errors: [`${path}: unsupported value type`] }
}

// ── Staleness ────────────────────────────────────────────────────────────────

export type EvidenceBinding = 'current' | 'stale' | 'unbound'

/**
 * Is a recorded row still about the thing we are asking about?
 *
 * `unbound` is for pre-PR5 and `automated` rows that carry no pin. They are not
 * stale — nothing claimed they were pinned — but they cannot satisfy a check
 * that requires a binding either.
 */
export function evidenceBinding(
  recordedTargetHash: string | null | undefined,
  currentTargetHash: string,
): EvidenceBinding {
  if (!recordedTargetHash) return 'unbound'
  return recordedTargetHash === currentTargetHash ? 'current' : 'stale'
}
