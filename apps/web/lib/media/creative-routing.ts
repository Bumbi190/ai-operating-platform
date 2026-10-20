/**
 * Creative routing advice for Atlas (pure planning, NOT an execution grant).
 * Existing pipelines remain the fallback.
 */
import type { CreativeToolId } from './creative-tools'
export type CreativeIntent =
  | 'new-illustration'
  | 'image-retouch'
  | 'image-resize-batch'
  | 'video-timeline-edit'
  | 'templated-social-video'
  | 'simple-video-transcode'
  | 'motion-composite'
  | 'interactive-data-chart'
  | 'printable-pdf'
export type CreativeEngine =
  | CreativeToolId
  | 'existing-image-generator'
  | 'existing-image-pipeline'
  | 'remotion'
  | 'ffmpeg'
  | 'react-chart'
  | 'existing-pdf-pipeline'
export interface CreativePlan {
  intent: CreativeIntent
  preferred: CreativeEngine
  fallback: CreativeEngine
  externalToolRequired: boolean
  /** A plan never authorizes live workstation execution. */
  executionAuthorized: false
  requiresReview: boolean
  rationale: string
}
type Route = Readonly<{preferred: CreativeEngine; fallback: CreativeEngine; rationale: string}>
const ROUTES: Readonly<Record<CreativeIntent, Route>> = {
  'new-illustration': {
    preferred: 'existing-image-generator', fallback: 'existing-image-generator',
    rationale: 'PhotoCraft edits existing pixels; it does not replace image generation models.',
  },
  'image-retouch': {
    preferred: 'photocraft', fallback: 'existing-image-pipeline',
    rationale: 'Use layer-aware, non-destructive edits on existing artwork.',
  },
  'image-resize-batch': {
    preferred: 'existing-image-pipeline', fallback: 'photocraft',
    rationale: 'Use efficient batch tools first; PhotoCraft for complex edits.',
  },
  'video-timeline-edit': {
    preferred: 'filmcraft', fallback: 'remotion',
    rationale: 'Use a video timeline for cuts, transitions and revisions.',
  },
  'templated-social-video': {
    preferred: 'remotion', fallback: 'filmcraft',
    rationale: 'Keep repeatable scheduled social video in tested Remotion workflows.',
  },
  'simple-video-transcode': {
    preferred: 'ffmpeg', fallback: 'filmcraft',
    rationale: 'Avoid editor startup for straightforward format conversions.',
  },
  'motion-composite': {
    preferred: 'remotion', fallback: 'effectcraft',
    rationale: 'Use existing motion templates; EffectCraft is not verified yet.',
  },
  'interactive-data-chart': {
    preferred: 'react-chart', fallback: 'react-chart',
    rationale: 'Interactive live charts must be data-bound code, not screenshot art.',
  },
  'printable-pdf': {
    preferred: 'existing-pdf-pipeline', fallback: 'pdfcraft',
    rationale: 'Keep validated PDF production until PdfCraft is tested.',
  },
}
const THIRD_PARTY = new Set<CreativeEngine>([
  'photocraft', 'filmcraft', 'effectcraft', 'vectorcraft', 'designcraft', 'pdfcraft',
])
/** Capability discovery is NOT an authorization decision. */
export function planCreativeTask(
  intent: CreativeIntent, locallyDiscovered: readonly CreativeToolId[] = [],
): CreativePlan {
  const route = ROUTES[intent]
  const preferredReady = !THIRD_PARTY.has(route.preferred) ||
    locallyDiscovered.includes(route.preferred as CreativeToolId)
  const preferred = preferredReady ? route.preferred : route.fallback
  const fallback = preferredReady ? route.fallback : route.preferred
  return {
    intent, preferred, fallback,
    externalToolRequired: THIRD_PARTY.has(preferred),
    executionAuthorized: false,
    requiresReview: true,
    rationale: preferredReady ? route.rationale :
      route.rationale + ' Creative tool unavailable: using fallback.',
  }
}
