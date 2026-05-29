/**
 * GET /api/media/test-facebook
 * Temporär testroute — verifiera att Facebook-posting funkar.
 * Skyddat av samma CRON_SECRET. Ta bort efter test.
 */

import { NextResponse } from 'next/server'
import { postReelToFacebook } from '@/lib/media/facebook'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const videoUrl = 'https://s3.eu-north-1.amazonaws.com/remotionlambda-eunorth1-401x2imzry/renders/y1qti04bb7/1dba7303-fa32-4613-8384-039e88d6ed91.mp4'
  const caption  = 'Anthropic just showed developers shipping production code written entirely by Claude. [TEST]\n\n#Claude #AIcoding #Anthropic'

  try {
    const result = await postReelToFacebook(videoUrl, caption)
    return NextResponse.json({ status: 'ok', ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: msg }, { status: 500 })
  }
}
