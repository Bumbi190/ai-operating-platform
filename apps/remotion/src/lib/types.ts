export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

/** Pre-computed sentence-level caption group (absolute frame numbers) */
export interface CaptionGroup {
  text: string
  startFrame: number
  endFrame: number
}

export interface VideoInputProps {
  // Script content
  hook: string

  // Audio
  audioUrl: string
  durationMs: number

  // Timing — pre-processed into caption groups by render.ts
  words: WordTiming[]
  captions: CaptionGroup[]

  // Pacing — how many frames to show the hook text overlay.
  // Detected from word timing by render.ts (dynamic), falls back to 135 (4.5s at 30fps).
  hookDurationFrames?: number

  // Visual scenes — 4–5 image URLs (Ideogram-generated)
  // If empty, falls back to dark gradient background
  images: string[]

  // Branding
  accentColor?: string
}
