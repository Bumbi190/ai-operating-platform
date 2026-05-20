/**
 * render.ts — CLI render script for ShortFormVideo.
 *
 * Usage:
 *   npm run render -- --scriptId=<id> --hook="..." --audioUrl="..." --timingUrl="..."
 *
 * Or with a JSON config file:
 *   npm run render -- --config=./render-input.json
 *
 * Output: ./out/<scriptId>.mp4
 *
 * Example render-input.json:
 * {
 *   "scriptId": "abc123",
 *   "hook": "This AI just changed everything.",
 *   "script": "...",
 *   "caption": "AI updates weekly 🤖",
 *   "audioUrl": "https://...",
 *   "timingUrl": "https://...",
 *   "durationMs": 45000,
 *   "accentColor": "#6366f1"
 * }
 */

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import fs from 'fs'
import type { VideoInputProps, WordTiming } from './lib/types'

async function main() {
  // Parse args
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, v] = a.replace('--', '').split('=')
      return [k, v]
    })
  )

  let inputProps: VideoInputProps & { scriptId: string }

  if (args.config) {
    const configPath = path.resolve(args.config)
    inputProps = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } else {
    throw new Error(
      'Usage: npm run render -- --config=./render-input.json\n' +
      'Create render-input.json from the platform after voice generation.'
    )
  }

  // Fetch word timing from URL
  let words: WordTiming[] = []
  if (inputProps.timingUrl) {
    const res = await fetch((inputProps as { timingUrl: string }).timingUrl)
    const data = await res.json() as { words: WordTiming[] }
    words = data.words
  }

  const compositionId = 'ShortFormVideo'
  const outputPath = path.resolve(`./out/${inputProps.scriptId}.mp4`)

  // Ensure output directory exists
  fs.mkdirSync('./out', { recursive: true })

  console.log('📦 Bundling Remotion...')
  const bundled = await bundle({
    entryPoint: path.resolve('./src/index.ts'),
    onProgress: (progress) => process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
  })
  console.log('\n✅ Bundle complete')

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps: {
      ...inputProps,
      words,
    },
  })

  console.log(`🎬 Rendering ${composition.durationInFrames} frames at ${composition.fps}fps...`)

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: {
      ...inputProps,
      words,
    },
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
