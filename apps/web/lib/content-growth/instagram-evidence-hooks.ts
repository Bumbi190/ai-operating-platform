/** Local, bounded integration seam. No approved durable sink or runtime activation.
 * Explicit synthetic sessions are for local tests only. No I/O or provider attestation. */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { prepareInstagramPublicationCandidate, prepareInstagramMeasurementCandidate } from './instagram-evidence-capture'

type Gate = NonNullable<Parameters<typeof prepareInstagramPublicationCandidate>[0]>
type PublicationEvent = ReturnType<Parameters<typeof prepareInstagramPublicationCandidate>[1]>
type MeasurementEvent = ReturnType<Parameters<typeof prepareInstagramMeasurementCandidate>[2]>
type Publication = NonNullable<Parameters<typeof prepareInstagramMeasurementCandidate>[1]>
type Measurement = NonNullable<ReturnType<typeof prepareInstagramMeasurementCandidate>['candidate']>
type Scope = Gate['scope']
type Window = PublicationEvent['request']
export type LocalPublishEvidence = Readonly<{ scope: Scope; mediaId: string; request: Window; dispatchAttempts: number }>

export function createLocalInstagramEvidenceSession(config: Gate, prior: readonly Publication[] = []) {
  const gate = Object.freeze({
    enabled: config.enabled === true, projectSlug: config.projectSlug,
    scope: Object.freeze({projectId:config.scope.projectId,bindingId:config.scope.bindingId,accountId:config.scope.accountId,platform:config.scope.platform}),
    enrollment: Object.freeze({startMs:config.enrollment.startMs,endMs:config.enrollment.endMs}),
  })
  if (prior.length > 200) throw Error('Local publication cap')
  const publications = new Map<string, Publication>()
  const measurements: Measurement[] = []
  let halted = false
  const matches = (s: Scope) => gate.enabled && !halted && gate.projectSlug === 'ai-media-automation' &&
    s.platform === 'instagram' && s.projectId === gate.scope.projectId &&
    s.bindingId === gate.scope.bindingId && s.accountId === gate.scope.accountId
  for (const p of prior) {
    if (!matches(p) || publications.has(p.scriptId)) throw Error('Mixed or duplicate local publication')
    publications.set(p.scriptId,Object.freeze({
      kind:p.kind,evidence:p.evidence,platform:p.platform,projectId:p.projectId,
      bindingId:p.bindingId,accountId:p.accountId,scriptId:p.scriptId,mediaId:p.mediaId,
      acquisitionId:p.acquisitionId,startMs:p.startMs,endMs:p.endMs,
    }))
  }
  return Object.freeze({
    matches,
    publication(scriptId: string, previousMediaId: string | null, persistedMediaId: string, e: LocalPublishEvidence) {
      if (!matches(e.scope)) return
      const v = prepareInstagramPublicationCandidate(gate, () => ({
        ...e.scope, scriptId, mediaId:e.mediaId, acquisitionId:randomUUID(),
        origin:'existing_media_publish_response', dispatchAttempts:e.dispatchAttempts,
        dryRun:false, recovered:false, skipped:false, needsVerification:false,
        previousMediaId,persistedMediaId,request:e.request,nowMs:Date.now(),
      }))
      if (v.status !== 'candidate_only') return
      if (publications.has(scriptId) || publications.size >= 200) { halted=true; return }
      publications.set(scriptId,v.candidate)
    },
    measurement(scope: Scope, scriptId: string, mediaId: string, request: Window, result: MeasurementEvent['result']) {
      if (!matches(scope)) return
      const publication=publications.get(scriptId)
      if (!publication || publication.mediaId!==mediaId) return
      const v=prepareInstagramMeasurementCandidate(gate,publication,()=>({
        ...scope,scriptId,mediaId,acquisitionId:randomUUID(),origin:'existing_insights_response',
        singleResponseMetrics:true,request,nowMs:Date.now(),result,
      }))
      if (v.status !== 'candidate_only') return
      if (measurements.length>=800) { halted=true; return }
      measurements.push(v.candidate)
    },
    snapshot() {
      return Object.freeze({mode:'local_unverified_only' as const,halted,
        publications:Object.freeze([...publications.values()]),measurements:Object.freeze([...measurements]),
        authorizesPilot:false as const})
    },
  })
}
export type LocalInstagramEvidenceSession = ReturnType<typeof createLocalInstagramEvidenceSession>

/** Deliberate release gate. Never replace with an env-only switch. */
export function openInstagramEvidenceSession(): LocalInstagramEvidenceSession | undefined {
  return undefined
}