/**
 * render.ts — CLI render script for ShortFormVideo.
 *
 * Usage:
 *   npm run render -- --config=./render-input.json
 *
 * render-input.json format:
 * {
 *   "scriptId":  "abc123",
 *   "projectId": "xyz456",
 *   "hook":      "This AI just changed everything.",
 *   "audioUrl":  "https://...",
 *   "timingUrl": "https://...",
 *   "durationMs": 45000,
 *   "images": ["https://...", "https://...", ...],
 *   "accentColor": "#6366f1"
 * }
 */

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import fs from 'fs'
import type { VideoInputProps, WordTiming, CaptionGroup } from './lib/types'

const FPS = 30

// ─── Caption grouping ─────────────────────────────────────────────────────────

/**
 * Groups word-level timing into readable sentence caption chunks.
 *
 * Design goals (TikTok/Reels retention):
 * - NEVER word-by-word — minimum 4 words per group
 * - Break only at true sentence endings (.!?) — not commas
 * - Hard break at 8 words (fits 2 clean lines at 56px on 9:16)
 * - Minimum display: 0.8s — no flash captions
 * - Buffer: caption lingers 5 extra frames so readers can finish
 */
function buildCaptionGroups(words: WordTiming[]): CaptionGroup[] {
  const groups: CaptionGroup[] = []
  const BUFFER_FRAMES      = 5
  const MAX_WORDS          = 8
  const MIN_WORDS          = 4
  const MIN_DISPLAY_FRAMES = 24   // 0.8s at 30fps

  let i = 0
  while (i < words.length) {
    const chunk: WordTiming[] = []

    while (i < words.length && chunk.length < MAX_WORDS) {
      chunk.push(words[i])
      i++

      const lastWord = chunk[chunk.length - 1].word
      // Only break on sentence-ending punctuation — commas keep flow going
      const endsWithSentence = /[.!?]$/.test(lastWord)
      if (endsWithSentence && chunk.length >= MIN_WORDS) break
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

// ─── Hook duration from word timing ──────────────────────────────────────────

/**
 * Finds where the hook words end in the audio timing data.
 * Hook text is always the first sentence(s) of the script — Victoria says it
 * at the start of the recording, so we scan forward word-by-word.
 *
 * Strategy: normalize both hook and words to lowercase/no-punct, find the
 * last matching hook word, then add 0.5s for a natural pause before captions.
 *
 * Falls back to DEFAULT_HOOK_S seconds if matching is ambiguous.
 */
const DEFAULT_HOOK_S = 4.5

function findHookEndFrame(hookText: string, words: WordTiming[]): number {
  const fallback = Math.round(DEFAULT_HOOK_S * FPS)
  if (!hookText || words.length === 0) return fallback

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const hookWords = hookText.split(/\s+/).map(normalize).filter(Boolean)
  if (hookWords.length === 0) return fallback

  // Walk through word timing, matching hook words in order
  let matched = 0
  let hookEndMs = 0

  for (const w of words) {
    if (matched >= hookWords.length) break
    const norm = normalize(w.word)
    if (norm === hookWords[matched]) {
      matched++
      hookEndMs = w.endMs
    }
  }

  // Require at least 70% match (TTS sometimes changes spelling of numbers etc)
  if (matched < hookWords.length * 0.7) {
    console.log(`  ⚠  Hook matching uncertain (${matched}/${hookWords.length} words) — using ${DEFAULT_HOOK_S}s default`)
    return fallback
  }

  // Hook display: audio hook ends + 0.5s breath + fade-out buffer
  const hookEndFrame = Math.floor((hookEndMs / 1000 + 0.5) * FPS)
  console.log(`  ✅ Hook detected: ${(hookEndMs / 1000).toFixed(2)}s audio → ${hookEndFrame} frames display`)
  return hookEndFrame
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, ...rest] = a.replace(/^--/, '').split('=')
      return [k, rest.join('=')]
    }),
  )

  if (!args.config) {
    throw new Error('Usage: npm run render -- --config=./render-input.json')
  }

  const configPath = path.resolve(args.config)
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    scriptId:  string
    projectId?: string
    hook:      string
    audioUrl:  string
    timingUrl?: string
    durationMs: number
    images?: string[]
    accentColor?: string
  }

  // Fetch word timing
  let words: WordTiming[] = []
  if (raw.timingUrl) {
    console.log('⏱  Fetching word timing...')
    const res = await fetch(raw.timingUrl)
    const data = await res.json() as { words: WordTiming[] }
    words = data.words ?? []
    console.log(`   ${words.length} words loaded`)
  }

  // Detect hook end frame from word timing
  console.log('🎯 Detecting hook timing...')
  const hookDurationFrames = findHookEndFrame(raw.hook, words)

  // Build sentence-level caption groups
  const allCaptions = words.length > 0 ? buildCaptionGroups(words) : []

  // Filter out caption groups that overlap with the hook display period
  // (words spoken during hook don't need captions — the hook text IS the visual)
  const captions = allCaptions.filter(c => c.startFrame >= hookDurationFrames)

  console.log(`📝 ${captions.length} caption groups (${allCaptions.length - captions.length} suppressed during hook)`)

  const inputProps: VideoInputProps = {
    hook: raw.hook,
    audioUrl: raw.audioUrl,
    durationMs: raw.durationMs,
    words,
    captions,
    images: raw.images ?? [],
    accentColor: raw.accentColor ?? '#6366f1',
    hookDurationFrames,
  }

  const outputPath = path.resolve(`./out/${raw.scriptId}.mp4`)
  fs.mkdirSync('./out', { recursive: true })

  console.log('📦 Bundling Remotion...')
  const bundled = await bundle({
    entryPoint: path.resolve('./src/index.ts'),
    onProgress: (p) => process.stdout.write(`\r  ${Math.round(p * 100)}%`),
  })
  console.log('\n✅ Bundle complete')

  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'ShortFormVideo',
    inputProps,
  })

  console.log(`🎬 Rendering ${composition.durationInFrames} frames at ${FPS}fps (~${(composition.durationInFrames / FPS).toFixed(1)}s)...`)
  console.log(`   Output: ${outputPath}`)

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r  ${Math.round(progress * 100)}% rendered`)
    },
  })

  console.log(`\n✅ Video saved to: ${outputPath}`)
  console.log(`\n📤 To publish to dashboard:`)
  console.log(`   npm run upload -- --config=${args.config} --file=${outputPath}`)
}

main().catch(err => {
  console.error('❌ Render failed:', err)
  process.exit(1)
})
