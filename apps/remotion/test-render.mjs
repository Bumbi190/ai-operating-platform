/**
 * Quick local test for renderMediaOnLambda.
 * Run: node test-render.mjs
 *
 * This bypasses Vercel and calls Lambda directly to diagnose the 504.
 */
import { renderMediaOnLambda } from '@remotion/lambda/client'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load env from apps/web/.env.local
const envPath = resolve('../web/.env.local')
dotenv.populate(process.env, Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
))

const region = process.env.AWS_REGION
const fnName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
const serveUrl = process.env.REMOTION_SERVE_URL

console.log('Region:', region)
console.log('Function:', fnName)
console.log('ServeURL:', serveUrl?.slice(0, 60) + '...')
console.log()
console.log('Calling renderMediaOnLambda...')

const start = Date.now()

try {
  const result = await renderMediaOnLambda({
    region,
    functionName: fnName,
    serveUrl,
    composition: 'SimpleNewsReel',
    inputProps: {
      hook: 'Test render — checking Lambda connectivity',
      audioUrl: 'https://www.w3schools.com/html/horse.mp3',
      captions: [],
      words: [],
      images: [],
      accentColor: '#6366f1',
    },
    codec: 'h264',
    imageFormat: 'jpeg',
    jpegQuality: 80,
    maxRetries: 0,
    framesPerLambda: 60,
    privacy: 'public',
    outName: 'test-connectivity.mp4',
    logLevel: 'verbose',
  })

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✅ renderMediaOnLambda returned in ${elapsed}s`)
  console.log('renderId:', result.renderId)
  console.log('bucketName:', result.bucketName)
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`❌ FAILED after ${elapsed}s`)
  console.log('Error:', err.message)
  if (err.stack) console.log(err.stack.split('\n').slice(0,5).join('\n'))
}
