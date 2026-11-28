/**
 * Offline format observations from an already captured reference.
 * A trusted caller must establish capture identity, project binding, rights
 * and actual frame review. A label is an assertion, not proof. Still frames
 * cannot establish spoken words, motion, retention, or causal performance.
 * IDs must be independently assigned opaque UUIDv4 handles, not provider IDs, captions,
 * paths or personal identifiers. Syntax is not proof of origin; the trusted adapter
 * must enforce the mapping. No source-content fields, fetching or publication.
 */
export type ReferenceSourceKind = 'instagram_reel' | 'internal' | 'synthetic'
export type ReferenceFrame = Readonly<{ frameId: string; atMs: number }>
export type ReferenceCapture = Readonly<{
  projectId: string
  captureId: string
  sourceKind: ReferenceSourceKind
  sourceId: string
  durationMs: number
  audioEvidence: 'not_captured'
  frames: readonly ReferenceFrame[]
}>
const FEATURE_HYPOTHESES = {
  recognizable_subject: 'test_subject_first',
  on_screen_text: 'test_text_hierarchy',
  product_or_interface: 'test_concrete_visual',
  demonstration: 'test_visible_demonstration',
  split_screen: 'test_comparison_layout',
  high_contrast: 'test_contrast',
} as const
export type ReferenceVisualFeature = keyof typeof FEATURE_HYPOTHESES
export type ReferenceVisualObservation = Readonly<{
  feature: ReferenceVisualFeature
  frameId: string
  evidence: 'caller_attested_visual_review'
}>
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const validId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const MAX_FRAMES = 120
const MAX_DURATION_MS = 15 * 60 * 1000
const MAX_OBSERVATIONS = MAX_FRAMES * Object.keys(FEATURE_HYPOTHESES).length

/**
 * Only records reviewed, visible categories at specific frames. No "absence"
 * inference from missing observations and no claim that a frame was at time 0
 * unless its timestamp actually is. Hypotheses are editorial test ideas,
 * never evidence of effectiveness, rights clearance or publish permission.
 */
export function summarizeReferenceFormat(
  expectedProjectId: string,
  capture: ReferenceCapture,
  observations: readonly ReferenceVisualObservation[],
) {
  if (!validId(expectedProjectId) || capture === null || typeof capture !== 'object' ||
      capture.projectId !== expectedProjectId ||
      !validId(capture.captureId) || !validId(capture.sourceId) ||
      !['instagram_reel', 'internal', 'synthetic'].includes(capture.sourceKind) ||
      capture.audioEvidence !== 'not_captured' ||
      !integer(capture.durationMs) || capture.durationMs < 1 ||
      capture.durationMs > MAX_DURATION_MS ||
      !Array.isArray(capture.frames) || capture.frames.length < 1 ||
      capture.frames.length > MAX_FRAMES ||
      !Array.isArray(observations) || observations.length > MAX_OBSERVATIONS) {
    throw new Error('Invalid reference capture or scope')
  }
  const frames = new Map<string, number>()
  const times = new Set<number>()
  for (const frame of capture.frames) {
    if (frame === null || typeof frame !== 'object' || !validId(frame.frameId) || frames.has(frame.frameId) ||
        !integer(frame.atMs) || frame.atMs < 0 ||
        frame.atMs > capture.durationMs || times.has(frame.atMs)) {
      throw new Error('Invalid or duplicate reference frame')
    }
    frames.set(frame.frameId, frame.atMs)
    times.add(frame.atMs)
  }

  const seen = new Set<string>()
  const reviewed = new Map<ReferenceVisualFeature, { frameId: string; atMs: number }[]>()
  for (const observation of observations) {
    if (observation === null || typeof observation !== 'object' ||
        observation.evidence !== 'caller_attested_visual_review' ||
        typeof observation.feature !== 'string' ||
        !Object.prototype.hasOwnProperty.call(FEATURE_HYPOTHESES, observation.feature) ||
        !validId(observation.frameId) || !frames.has(observation.frameId)) {
      throw new Error('Invalid or unreviewed visual observation')
    }
    const key = observation.feature + ':' + observation.frameId
    if (seen.has(key)) throw new Error('Duplicate visual observation')
    seen.add(key)
    const evidence = reviewed.get(observation.feature) ?? []
    evidence.push({ frameId: observation.frameId, atMs: frames.get(observation.frameId)! })
    reviewed.set(observation.feature, evidence)
  }
  const features = (Object.keys(FEATURE_HYPOTHESES) as ReferenceVisualFeature[])
    .filter(feature => reviewed.has(feature))
    .map(feature => ({
      feature,
      evidence: reviewed.get(feature)!.sort((a, b) => a.atMs - b.atMs),
      hypothesis: FEATURE_HYPOTHESES[feature],
    }))
  return {
    projectId: expectedProjectId,
    captureId: capture.captureId,
    sourceKind: capture.sourceKind,
    sourceId: capture.sourceId,
    capturedFrameCount: frames.size,
    frameCountWithRecordedObservations: new Set(observations.map(row => row.frameId)).size,
    firstCapturedAtMs: Math.min(...times),
    lastCapturedAtMs: Math.max(...times),
    evidenceStatus: 'caller_attested_visual_observations_only' as const,
    audioEvidence: 'not_captured' as const,
    performanceEvidence: 'not_assessed' as const,
    rightsStatus: 'not_assessed' as const,
    features,
  }
}
