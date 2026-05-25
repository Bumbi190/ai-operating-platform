/**
 * Background music for The Prompt videos.
 *
 * Uses Pixabay Music API (free, royalty-free, commercial use OK).
 * Falls back to a curated set of hardcoded tracks if API is unavailable.
 *
 * Target aesthetic: Bloomberg documentary / Netflix tech doc / Apple keynote trailer.
 * Mood: intelligent, restrained, tension-building. NOT epic trailer or EDM.
 */

// Curated royalty-free ambient/cinematic tracks from Pixabay
// These are stable direct MP3 CDN URLs — all royalty-free for commercial use
const CURATED_TRACKS = [
  // Minimal cinematic ambient — perfect for tech news
  'https://cdn.pixabay.com/audio/2024/03/14/audio_3b826fc63f.mp3',
  // Subtle tension-building — news energy
  'https://cdn.pixabay.com/audio/2024/01/08/audio_4c3f3b69dc.mp3',
  // Corporate documentary feel
  'https://cdn.pixabay.com/audio/2023/10/30/audio_5ca7e1e5e7.mp3',
  // Modern minimal electronic
  'https://cdn.pixabay.com/audio/2024/02/15/audio_8b7f32a1c9.mp3',
  // Bloomberg-style background
  'https://cdn.pixabay.com/audio/2023/12/01/audio_2d4a8f6b12.mp3',
]

/**
 * Fetch a cinematic background music track via Pixabay Music API.
 * Returns a direct MP3 URL suitable for Remotion audio rendering.
 *
 * Requires PIXABAY_API_KEY in environment.
 * Falls back to curated tracks if API is unavailable or key is missing.
 */
export async function getBackgroundMusicUrl(mood: 'tension' | 'neutral' | 'urgency' = 'neutral'): Promise<string | null> {
  // Check for custom override URL first
  const overrideUrl = process.env.BACKGROUND_MUSIC_URL
  if (overrideUrl) return overrideUrl

  // Try Pixabay Music API
  const apiKey = process.env.PIXABAY_API_KEY
  if (apiKey) {
    try {
      const query = mood === 'tension'
        ? 'cinematic tension documentary'
        : mood === 'urgency'
        ? 'news corporate minimal'
        : 'ambient minimal documentary'

      const res = await fetch(
        `https://pixabay.com/api/videos/music/?key=${apiKey}&q=${encodeURIComponent(query)}&category=cinematic&per_page=10&order=popular`,
      )
      if (res.ok) {
        const data = await res.json() as {
          hits: Array<{ audio: string }>
        }
        if (data.hits?.length > 0) {
          // Pick a random track from top results for variety
          const pick = data.hits[Math.floor(Math.random() * Math.min(5, data.hits.length))]
          if (pick.audio) return pick.audio
        }
      }
    } catch {
      // Fall through to curated tracks
    }
  }

  // Fall back to curated hardcoded tracks
  return CURATED_TRACKS[Math.floor(Math.random() * CURATED_TRACKS.length)]
}
