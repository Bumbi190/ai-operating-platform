/**
 * upload.ts — Post-render upload script.
 *
 * After rendering a video locally, run this to:
 *   1. Upload the MP4 to Supabase Storage (media-assets/video/...)
 *   2. Call POST /api/media/render/complete to mark the script render-ready
 *   3. Print the public URL + dashboard link
 *
 * Usage:
 *   npm run upload -- --config=./render-input.json --file=./out/{scriptId}.mp4
 *
 * Required env vars (in .env.local at the repo root or apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL        e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY       service_role key (not the anon key)
 *   NEXT_PUBLIC_APP_URL             e.g. https://ai-operating-platform-web.vercel.app
 *                                   or   http://localhost:3000 for local dev
 */

import path from 'path'
import fs from 'fs'

// ─── Load env ─────────────────────────────────────────────────────────────────

function loadEnv() {
  // Try apps/web/.env.local first, then root .env.local
  const candidates = [
    path.resolve(__dirname, '../../web/.env.local'),
    path.resolve(__dirname, '../../../.env.local'),
  ]

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
    console.log(`📁 Loaded env from ${envPath}`)
    break
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, ...rest] = a.replace(/^--/, '').split('=')
      return [k, rest.join('=')]
    }),
  )

  if (!args.config || !args.file) {
    console.error('Usage: npm run upload -- --config=./render-input.json --file=./out/{scriptId}.mp4')
    process.exit(1)
  }

  const config = JSON.parse(fs.readFileSync(path.resolve(args.config), 'utf8')) as {
    scriptId: string
    projectId: string
  }

  const videoPath = path.resolve(args.file)
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ File not found: ${videoPath}`)
    process.exit(1)
  }

  const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
    console.error('   Add them to apps/web/.env.local')
    process.exit(1)
  }

  const { scriptId, projectId } = config
  const storagePath = `video/${projectId}/${scriptId}.mp4`
  const videoBuffer = fs.readFileSync(videoPath)

  // ── 1. Upload to Supabase Storage ─────────────────────────────────────────
  console.log(`\n📤 Uploading ${(videoBuffer.length / 1_000_000).toFixed(1)}MB to Supabase Storage...`)
  console.log(`   Path: media-assets/${storagePath}`)

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/media-assets/${storagePath}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'video/mp4',
        'x-upsert': 'true',
      },
      body: videoBuffer,
    },
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error(`❌ Storage upload failed (${uploadRes.status}): ${err}`)
    process.exit(1)
  }

  // Build public URL
  const videoUrl = `${supabaseUrl}/storage/v1/object/public/media-assets/${storagePath}`
  console.log(`✅ Uploaded: ${videoUrl}`)

  // ── 2. Mark render complete in the database ────────────────────────────────
  console.log('\n🔗 Marking script render-complete...')

  const completeRes = await fetch(`${appUrl}/api/media/render/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ script_id: scriptId, video_url: videoUrl }),
  })

  if (!completeRes.ok) {
    const err = await completeRes.text()
    console.error(`❌ render/complete failed (${completeRes.status}): ${err}`)
    console.log(`   Video URL is: ${videoUrl}`)
    console.log(`   You can manually update the DB if needed.`)
    process.exit(1)
  }

  // ── 3. Done ───────────────────────────────────────────────────────────────
  console.log('\n🎬 ────────────────────────────────────────────')
  console.log('   Video ready in dashboard!')
  console.log(`   Script: ${scriptId}`)
  console.log(`   URL:    ${videoUrl}`)
  console.log('────────────────────────────────────────────────\n')
}

main().catch(err => {
  console.error('❌ Upload failed:', err)
  process.exit(1)
})
