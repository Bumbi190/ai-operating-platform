/**
 * Private V3 montage: bridge a previously admitted MP4 to exactly ONE
 * storyboard shot for each original image slot.
 *
 * This is a pure renderer plan, NOT asset admission, authorization, provider
 * generation, publication approval, or permission to dispatch a paid render.
 * The calling server must independently authorize source script revision,
 * media provenance, project ownership, and time-bounded delivery.
 */
import type { AdmittedReelClip, PlannedReelClip } from './hybrid-scenes'
import type { V3StoryboardPlan } from './types'

const MIN_RATE = 0.25
const MAX_RATE = 2
const MAX_SOURCE_FRAMES = 30 * 60

function safeHttpsSource(src: unknown): src is string {
  if (typeof src !== 'string' || src.length < 10 || src.length > 4096) return false
  try {
    const url = new URL(src)
    return url.protocol === 'https:' && !!url.hostname &&
      !url.username && !url.password && !url.hash && !url.port
  } catch {
    return false
  }
}

/**
 * Fail closed to original stills if the entire montage is not an explicitly
 * editorial-held, internally consistent PRIVATE storyboard. Its only optional
 * video slots are the previously admitted, index-aligned image replacements.
 *
 * An image can occur repeatedly during the 10-15 shot montage, but the same
 * MP4 plays at most ONCE, at that image's first appearance. Later shots always
 * use its original still, never replay/loop the same four-second provider clip.
 *
 * Clip durations are independently measured by the trusted asset selector at
 * 30fps. Playback speed is bounded to avoid freezes or frantic compression;
 * out-of-range clips revert to stills. The outro is never a video shot.
 */
export function planPrivateV3HybridShots({
  plan, imageCount, sceneVideos,
}: {
  plan: V3StoryboardPlan
  imageCount: number
  sceneVideos?: ReadonlyArray<AdmittedReelClip | null>
}): Array<PlannedReelClip | null> {
  const count = Array.isArray(plan?.shots) ? plan.shots.length : 0
  const fallback = Array<PlannedReelClip | null>(count).fill(null)

  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > 5 ||
      count < 1 || count > 15 ||
      plan.schema !== 'theprompt.v3.private-storyboard.v1' ||
      plan.fps !== 30 || plan.outroFrames !== 75 ||
      !plan.editorialHold?.required ||
      plan.canPublish !== false || plan.canSchedule !== false || plan.canGenerate !== false ||
      !Number.isInteger(plan.contentFrames) || plan.contentFrames < count ||
      !Number.isInteger(plan.totalFrames) ||
      plan.totalFrames !== plan.contentFrames + plan.outroFrames) return fallback

  // Validate the entire shot sequence BEFORE considering video metadata.
  // Each clip stays inside the content region, even during cross-dissolves.
  let previousEnd = 0
  for (let i = 0; i < count; i++) {
    const shot = plan.shots[i]
    if (!shot || shot.index !== i ||
        !Number.isInteger(shot.imageIndex) ||
        shot.imageIndex < 0 || shot.imageIndex >= imageCount ||
        !Number.isInteger(shot.startFrame) || shot.startFrame !== previousEnd ||
        !Number.isInteger(shot.durationFrames) || shot.durationFrames < 1 ||
        !Number.isInteger(shot.transitionInFrames) ||
        shot.transitionInFrames < 0 ||
        shot.transitionInFrames > Math.min(22, shot.durationFrames) ||
        shot.startFrame - shot.transitionInFrames < 0 ||
        shot.startFrame + shot.durationFrames > plan.contentFrames) return fallback
    previousEnd += shot.durationFrames
  }
  if (previousEnd !== plan.contentFrames) return fallback

  if (!sceneVideos) return fallback
  if (!Array.isArray(sceneVideos) || sceneVideos.length !== imageCount) return fallback

  // Any repeated URL is an ambiguous duplicate source, not permission to
  // repeat the same video across scene slots.
  const urls = new Set<string>()
  for (const clip of sceneVideos) {
    if (!clip || !safeHttpsSource(clip.src)) continue
    if (urls.has(clip.src)) return fallback
    urls.add(clip.src)
  }

  const seenImageSlots = new Set<number>()
  return plan.shots.map(shot => {
    const imageIndex = shot.imageIndex
    if (seenImageSlots.has(imageIndex)) return null
    seenImageSlots.add(imageIndex)

    const clip = sceneVideos[imageIndex]
    if (!clip || !safeHttpsSource(clip.src) ||
        !Number.isInteger(clip.durationFrames) ||
        clip.durationFrames < 1 || clip.durationFrames > MAX_SOURCE_FRAMES) return null

    const startFrame = shot.startFrame - shot.transitionInFrames
    const displayFrames = shot.durationFrames + shot.transitionInFrames
    const playbackRate = clip.durationFrames / displayFrames
    if (!Number.isFinite(playbackRate) ||
        playbackRate < MIN_RATE || playbackRate > MAX_RATE) return null
    return {
      src: clip.src, durationFrames: clip.durationFrames,
      startFrame, displayFrames, playbackRate,
    }
  })
}
