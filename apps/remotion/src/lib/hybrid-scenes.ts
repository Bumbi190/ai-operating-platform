/**
 * A render-only bridge between canonical video assets and the existing
 * still-image reel. This module NEVER creates a clip, calls a provider,
 * authorizes spend, or publishes a post.
 *
 * Producers must supply previously admitted video assets from project-owned
 * storage. They remain responsible for provenance and authorization.
 */
export interface AdmittedReelClip {
  /** HTTPS URL resolved from an admitted project-owned asset, not provider output. */
  src: string
  /** Original clip duration, measured at the target 30 fps timeline. */
  durationFrames: number
}

export interface PlannedReelClip extends AdmittedReelClip {
  /** Global start frame for the video, including transition overlap. */
  startFrame: number
  /** Number of global frames for which it must cover the scene. */
  displayFrames: number
  /** Constant rate that fills the interval without looping or a frozen tail. */
  playbackRate: number
}

export interface HybridScenePlanInput {
  sceneCount: number
  totalFrames: number
  outroFrames: number
  transitionFrames: number
  /** Aligned with fallback images; null means keep the image for that scene. */
  sceneVideos?: ReadonlyArray<AdmittedReelClip | null>
}

const MIN_PLAYBACK_RATE = 0.25
const MAX_PLAYBACK_RATE = 2

// URL syntax is not asset admission: the server producer must verify ownership.
function isHttpsVideoSource(src: unknown): src is string {
  if (typeof src !== 'string' || src.length > 4096) return false
  try {
    const uri = new URL(src)
    return uri.protocol === 'https:' && !!uri.hostname && !uri.username && !uri.password && !uri.hash
  } catch {
    return false
  }
}

/**
 * Fail back to the corresponding still whenever scene metadata is unsuitable.
 * This is a visual fallback only. A failed or ambiguous PAID dispatch must
 * never be retried or replaced by another paid operation from this module.
 */
export function planHybridSceneClips(input: HybridScenePlanInput): Array<PlannedReelClip | null> {
  const {sceneCount, totalFrames, outroFrames, transitionFrames, sceneVideos} = input
  if (!Number.isInteger(sceneCount) || sceneCount < 0 || sceneCount > 20) return []
  const fallback = Array<PlannedReelClip | null>(sceneCount).fill(null)
  if (!Number.isInteger(totalFrames) || !Number.isInteger(outroFrames) ||
      !Number.isInteger(transitionFrames) || totalFrames <= outroFrames ||
      outroFrames < 0 || transitionFrames < 0 || transitionFrames > 120 ||
      totalFrames > 30 * 60 * 5 || sceneCount === 0 ||
      !sceneVideos || sceneVideos.length !== sceneCount) return fallback

  const contentFrames = totalFrames - outroFrames
  if (contentFrames < sceneCount) return fallback
  const sceneDuration = contentFrames / sceneCount
  const halfTransition = transitionFrames / 2

  return sceneVideos.map((clip, index) => {
    if (!clip || !isHttpsVideoSource(clip.src) ||
        !Number.isInteger(clip.durationFrames) ||
        clip.durationFrames < 1 || clip.durationFrames > 30 * 60) return null

    const startFrame = Math.max(0, Math.floor(index * sceneDuration - halfTransition))
    // The branded outro is not a content scene. Do not stretch the final
    // clip through those hidden frames: that makes its playback unnaturally slow.
    const endFrame = index === sceneCount - 1
      ? contentFrames
      : Math.min(contentFrames, Math.ceil((index + 1) * sceneDuration + halfTransition))
    const displayFrames = endFrame - startFrame
    if (displayFrames < 1) return null

    const playbackRate = clip.durationFrames / displayFrames
    if (playbackRate < MIN_PLAYBACK_RATE || playbackRate > MAX_PLAYBACK_RATE) return null

    return {
      src: clip.src,
      durationFrames: clip.durationFrames,
      startFrame,
      displayFrames,
      playbackRate,
    }
  })
}
