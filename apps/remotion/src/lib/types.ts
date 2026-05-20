export interface WordTiming {
  word: string
  startMs: number
  endMs: number
}

export interface VideoInputProps {
  // Script content
  hook: string
  script: string
  caption: string

  // Audio
  audioUrl: string       // public URL to .mp3 in Supabase Storage
  durationMs: number     // total duration in ms

  // Word timing (fetched from timingUrl or passed directly)
  words: WordTiming[]

  // Branding
  accentColor?: string   // default: '#6366f1' (indigo)
  theme?: 'dark' | 'light'
}
