/**
 * render.ts — CLI render script for ShortFormVideo.
 *
 * Usage:
 *   npm run render -- --config=./render-input.json
 *
 * render-input.json format:
 * {
 *   "scriptId": "abc123",
 *   "hook": "This AI just changed everything.",
 *   "audioUrl": "https://...",
 *   "timingUrl": "https://...",
 *   "durationMs": 45000,
 *   "images": ["https://...", "https://...", "https://...", "https://...", "https://..."],
 *   "accentColor": "#6366f1"
 * }
 */

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import fs from 'fs'
import type { VideoInputProps, WordTiming, CaptionGroup } from './lib/types'

const FPS = 30

/**
 * Groups word-level timing into readable sentence caption chunks.
 * Rules:
 * - Break at sentence-ending punctuation (. ! ? , ;) if ≥3 words accumulated
 * - Hard break at 7 words regardless
 * - Small overlap buffer: caption stays visible 4 extra frames after last word
 */
function buildCaptionGroups(words: WordTiming[]): CaptionGroup[] {
  const groups: CaptionGroup[] = []
  const BUFFER_FRAMES = 4
  const MAX_WORDS = 7
  const MIN_WORDS_BEFORE_BREAK = 3

  let i = 0
  while (i < words.length) {
    const chunk: WordTiming[] = []

    while (i < words.length && chunk.length < MAX_WORDS) {
      chunk.push(words[i])
      i++

      const lastWord = chunk[chunk.length - 1].word
      const endsWithPunct = /[.!?,;]$/.test(lastWord)
      if (endsWithPunct && chunk.length >= MIN_WORDS_BEFORE_BREAK) break
    }

    if (chunk.length === 0) break

    const startFrame = Math.floor((chunk[0].startMs / 1000) * FPS)
    const endFrame = Math.floor((chunk[chunk.length - 1].endMs / 1000) * FPS) + BUFFER_FRAMES

    groups.push({
      text: chunk.map(w => w.word).join(' '),
      startFrame,
      endFrame,
    })
  }

  return groups
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, ...rest] = a.replace(/^--/, '').split('=')
      return [k, rest.join('=')]
    })
  )

  if (!args.config) {
    throw new Error('Usage: npm run render -- --config=./render-input.json')
  }

  const configPath = path.resolve(args.config)
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    scriptId: string
    hook: string
    audioUrl: string
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

  // Build sentence-level caption groups
  const captions: CaptionGroup[] = words.length > 0 ? buildCaptionGroups(words) : []
  console.log(`📝 ${captions.length} caption groups built`)

  const inputProps: VideoInputProps = {
    hook: raw.hook,
    audioUrl: raw.audioUrl,
    durationMs: raw.durationMs,
    words,
    captions,
    images: raw.images ?? [],
    accentColor: raw.accentColor ?? '#6366f1',
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

  console.log(`🎬 Rendering ${composition.durationInFrames} frames at ${FPS}fps...`)

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
}

main().catch(err => {
  console.error('❌ Render failed:', err)
  process.exit(1)
})
