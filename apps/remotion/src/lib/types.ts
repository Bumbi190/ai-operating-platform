export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

/** Pre-computed sentence-level caption group */
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

  // Visual scenes — 4–5 image URLs (Ideogram-generated)
  // If empty, falls back to dark gradient background
  images: string[]

  // Branding
  accentColor?: string
}
