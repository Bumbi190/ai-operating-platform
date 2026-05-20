/**
 * video-props.ts — shared logic for building Remotion VideoInputProps.
 *
 * Used by both:
 *   - apps/remotion/src/render.ts  (local CLI render)
 *   - apps/web/app/api/media/render/start/route.ts  (Lambda cloud render)
 *
 * Keeps caption grouping, hook detection, and scene timing in one place.
 */

const FPS = 30

// ─── Types (mirrored from apps/remotion/src/lib/types.ts) ────────────────────

export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

export interface CaptionGroup {
  text: string
  startFrame: number
  endFrame: number
}

export interface VideoInputProps {
  hook: string
  audioUrl: string
  durationMs: number
  words: WordTiming[]
  captions: CaptionGroup[]
  hookDurationFrames: number
  images: string[]
  sceneStartFrames?: number[]
  accentColor?: string
}

// ─── Caption grouping ─────────────────────────────────────────────────────────

function buildCaptionGroups(words: WordTiming[]): CaptionGroup[] {
  const groups: CaptionGroup[] = []
  const BUFFER_FRAMES      = 5
  const MAX_WORDS          = 8
  const MIN_WORDS          = 4
  const MIN_DISPLAY_FRAMES = 24  // 0.8s at 30fps

  let i = 0
  while (i < words.length) {
    const chunk: WordTiming[] = []

    while (i < words.length && chunk.length < MAX_WORDS) {
      chunk.push(words[i])
      i++
      const lastWord = chunk[chunk.length - 1].word
      if (/[.!?]$/.test(lastWord) && chunk.length >= MIN_WORDS) break
    }

    if (chunk.length === 0) break

    const startFrame = Math.floor((chunk[0].startMs / 1000) * FPS)
    const naturalEnd = Math.floor((chunk[chunk.length - 1].endMs / 1000) * FPS) + BUFFER_FRAMES
    const endFrame   = Math.max(naturalEnd, startFrame + MIN_DISPLAY_FRAMES)

    groups.push({
      text: chunk.map(w => w.word).join(' '),
      startFrame,
      endFrame,
    })
  }

  return groups
}

// ─── Hook end-frame detection ─────────────────────────────────────────────────

const DEFAULT_HOOK_S = 4.5

function findHookEndFrame(hookText: string, words: WordTiming[]): number {
  const fallback = Math.round(DEFAULT_HOOK_S * FPS)
  if (words.length === 0) return fallback

  // Strategy 1: first sentence boundary in audio (skip first 3 words, require ≥1.5s)
  for (let i = 3; i < words.length; i++) {
    const word = words[i]
    if (/[.!?]$/.test(word.word) && word.endMs >= 1500) {
      const endFrame = Math.floor((word.endMs / 1000 + 0.4) * FPS)
      if (endFrame >= 60 && endFrame <= 240) return endFrame
    }
  }

  // Strategy 2: text-match hook against words
  if (hookText) {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const hookWords = hookText.split(/\s+/).map(normalize).filter(Boolean)
    let matched = 0, hookEndMs = 0
    for (const w of words) {
      if (matched >= hookWords.length) break
      if (normalize(w.word) === hookWords[matched]) { matched++; hookEndMs = w.endMs }
    }
    if (matched >= hookWords.length * 0.7 && hookEndMs > 0) {
      return Math.floor((hookEndMs / 1000 + 0.5) * FPS)
    }
  }

  return fallback
}

// ─── Scene start frames ───────────────────────────────────────────────────────

function buildSceneStartFrames(words: WordTiming[], imageCount: number): number[] {
  if (imageCount === 0 || words.length === 0) return []
  const wordsPerScene = Math.ceil(words.length / imageCount)
  return Array.from({ length: imageCount }, (_, i) => {
    if (i === 0) return 0
    const firstWord = words[i * wordsPerScene]
    return firstWord ? Math.floor((firstWord.startMs / 1000) * FPS) : 0
  })
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build complete VideoInputProps from raw script data.
 * Fetches word timing, computes captions + hook timing + scene frames.
 */
export async function buildVideoInputProps(params: {
  hook: string
  audioUrl: string
  timingUrl: string
  durationMs: number
  images: string[]
  accentColor?: string
}): Promise<VideoInputProps> {
  const { hook, audioUrl, timingUrl, durationMs, images, accentColor } = params

  // Fetch word timing
  let words: WordTiming[] = []
  if (timingUrl) {
    const res = await fetch(timingUrl)
    const data = await res.json() as { words: WordTiming[] }
    words = data.words ?? []
  }

  const hookDurationFrames = findHookEndFrame(hook, words)
  const allCaptions        = buildCaptionGroups(words)

  // Trim/remove captions overlapping with hook
  const captions = allCaptions
    .map(c => c.endFrame <= hookDurationFrames
      ? null
      : c.startFrame < hookDurationFrames
        ? { ...c, startFrame: hookDurationFrames }
        : c
    )
    .filter((c): c is CaptionGroup => c !== null)

  const sceneStartFrames = buildSceneStartFrames(words, images.length)

  return {
    hook,
    audioUrl,
    durationMs,
    words,
    captions,
    hookDurationFrames,
    images,
    sceneStartFrames: sceneStartFrames.length > 0 ? sceneStartFrames : undefined,
    accentColor: accentColor ?? '#6366f1',
  }
}
