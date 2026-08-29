/**
 * POST /api/workflows/evidence — ingest attested local evidence.
 *
 * The producer runs the check where the artefacts actually are — ffprobe, PDF
 * geometry, `node --test`, a production build — and states what it observed.
 * This endpoint records that STATEMENT. It does not verify the claim (it cannot;
 * that is the whole reason attestation exists), and it is careful never to let a
 * statement look like an observation.
 *
 * WHAT A SUCCESSFUL INGEST DOES: appends one row to workflow_evidence with
 * `source = 'attested'`, a producer identity, a payload hash and a target hash.
 *
 * WHAT IT CANNOT DO, structurally:
 *   • transition a workflow — it never calls appendTransition
 *   • create or decide an authorization — it never touches the ledger
 *   • write to Familje-Stunden — it makes no outbound request at all
 *   • create an instance, a definition or a state
 *   • mutate earlier evidence — the table rejects UPDATE and DELETE by trigger
 *   • act outside its project — the instance must belong to the credential's own
 *
 * The credential is scoped to `workflow.evidence.write` and compared by exact
 * string equality; there is no hierarchy and no wildcard, so it cannot widen
 * into anything else. The scope is named once, in the route-scoped resolver
 * lib/workflows/evidence-auth.ts — this route never reaches the credential
 * primitive directly, which is the containment rule leads-auth.ts established.
 */

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireEvidenceProducer } from '@/lib/workflows/evidence-auth'
import { readDefinitionById, readInstance, recordEvidence } from '@/lib/workflows/store'
import { findAdapter } from '@/lib/workflows/adapters/registry'
import {
  ATTESTED_RESULTS, PRODUCER_TYPES,
  computeEvidencePayloadHash, computeEvidenceTargetHash, validateEvidencePayload,
  type AttestedResult, type ProducerType,
} from '@/lib/workflows/attestation'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 256 * 1024

const bad = (detail: string, status = 400) =>
  NextResponse.json({ error: 'invalid_request', detail }, { status })

function isIsoInstant(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}
function isShortText(v: unknown, max = 200): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max
}
const SHA256 = /^[a-f0-9]{64}$/

export async function POST(request: Request) {
  // 1. AUTHENTICATE FIRST. Nothing is read, and no existence is revealed, before
  //    a principal is established — the same ordering rule the authorization
  //    boundary follows.
  const auth = await requireEvidenceProducer(request)
  if (!auth.ok) return auth.response
  const { principal } = auth

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return bad('body exceeds 256KB', 413)

  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('body must be an object')
    body = parsed as Record<string, unknown>
  } catch {
    return bad('body is not valid JSON')
  }

  // 2. Shape. Every field is read explicitly; the caller's object never reaches
  //    the append-only row.
  const { instanceId, state, checkKey, result, observedAt, producerType, payload } = body as {
    instanceId?: unknown; state?: unknown; checkKey?: unknown; result?: unknown
    observedAt?: unknown; producerType?: unknown; payload?: unknown
  }

  if (!isShortText(instanceId, 64)) return bad('instanceId')
  if (!isShortText(state, 128)) return bad('state')
  if (!isShortText(checkKey, 128)) return bad('checkKey')
  if (!ATTESTED_RESULTS.includes(result as AttestedResult)) {
    return bad(`result must be one of ${ATTESTED_RESULTS.join(', ')}`)
  }
  if (!isIsoInstant(observedAt)) return bad('observedAt must be an ISO-8601 instant')
  if (!PRODUCER_TYPES.includes(producerType as ProducerType)) {
    return bad(`producerType must be one of ${PRODUCER_TYPES.join(', ')}`)
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return bad('payload must be an object')
  }
  const safePayload = (payload ?? {}) as Record<string, unknown>
  const payloadCheck = validateEvidencePayload(safePayload)
  if (!payloadCheck.ok) return bad(payloadCheck.errors.join('; '))

  const sourceCommit = body.sourceCommit === undefined || body.sourceCommit === null
    ? null : isShortText(body.sourceCommit, 64) ? String(body.sourceCommit) : undefined
  if (sourceCommit === undefined) return bad('sourceCommit')
  const artifactManifestHash =
    body.artifactManifestHash === undefined || body.artifactManifestHash === null
      ? null
      : (typeof body.artifactManifestHash === 'string' && SHA256.test(body.artifactManifestHash))
        ? body.artifactManifestHash : undefined
  if (artifactManifestHash === undefined) return bad('artifactManifestHash must be a sha256 hex digest')

  const tool = body.tool === undefined || body.tool === null ? null
    : isShortText(body.tool, 200) ? String(body.tool) : undefined
  if (tool === undefined) return bad('tool')
  const toolVersion = body.toolVersion === undefined || body.toolVersion === null ? null
    : isShortText(body.toolVersion, 100) ? String(body.toolVersion) : undefined
  if (toolVersion === undefined) return bad('toolVersion')

  const db = createAdminClient()

  // 3. The instance must exist AND belong to this credential's project. Unknown
  //    and foreign answer identically, so this is not an instance-id oracle.
  const instance = await readInstance(db, instanceId)
  if (!instance || instance.project_id !== principal.projectId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const def = await readDefinitionById(db, instance.def_id)

  // 4. The check must be DECLARED for this state, and must accept attestation.
  //    A definition with no adapter accepts no attestations at all.
  const adapter = findAdapter(instance.def_key)
  const check = adapter?.attestableChecks()
    .find(c => c.state === state && c.check_key === checkKey) ?? null
  if (!check) {
    return bad(`"${checkKey}" is not a declared check for state "${state}" in ${instance.def_key}`, 422)
  }
  if (!check.allowed_provenance.includes('attested')) {
    return bad(
      `"${checkKey}" is verified by Omnira directly and does not accept attested evidence`, 422)
  }
  if (check.binds_artifacts && !artifactManifestHash) {
    return bad(`"${checkKey}" is a claim about built artefacts and requires artifactManifestHash`, 422)
  }

  // 5. Bind. Both hashes are computed HERE from server-held state plus the
  //    producer's declared provenance — never accepted from the caller.
  let targetHash: string
  try {
    targetHash = computeEvidenceTargetHash({
      instance, spec: def.spec, state, checkKey,
      sourceCommit, artifactManifestHash,
    })
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'target could not be computed', 422)
  }
  const payloadHash = computeEvidencePayloadHash({
    checkKey, result: result as AttestedResult, observedAt, targetHash, payload: safePayload,
  })

  // 6. Append. A replay of the same statement is a no-op, not a second fact:
  //    the unique index on (instance, check, payload_hash) makes that structural.
  try {
    const evidence = await recordEvidence(db, {
      instanceId, state, checkKey,
      result: result as AttestedResult,
      source: 'attested',
      detail: safePayload,
      attestation: {
        producer: principal.credentialId,
        producerType: producerType as ProducerType,
        observedAt, payloadHash, targetHash,
        metadata: { tool, tool_version: toolVersion, source_commit: sourceCommit,
                    artifact_manifest_hash: artifactManifestHash },
      },
    })
    return NextResponse.json({
      ok: true, recorded: true,
      evidenceId: evidence.id, payloadHash, targetHash,
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    if (message.includes('23505') || message.toLowerCase().includes('duplicate key')) {
      // Idempotent: the identical statement is already on record.
      return NextResponse.json({
        ok: true, recorded: false, duplicate: true, payloadHash, targetHash,
      }, { status: 200 })
    }
    console.error('[workflow-evidence] ingest failed:', message)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
