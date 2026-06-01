/**
 * POST /api/media/token  — spara ett nytt plattforms-token (inloggad operatör)
 *
 * Body: { platform: 'instagram' | 'facebook', token: string, expires_days?: number }
 *
 * Används för att lägga in ett nytt token med rätt scopes (t.ex. efter att du
 * lagt till instagram_manage_insights) utan att röra SQL. Sparas i
 * platform_tokens, som har företräde framför env-variabler.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setToken, type Platform } from '@/lib/media/token-store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { platform?: string; token?: string; expires_days?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }) }

  const platform = body.platform as Platform
  const token = body.token?.trim()

  if (platform !== 'instagram' && platform !== 'facebook') {
    return NextResponse.json({ error: "platform måste vara 'instagram' eller 'facebook'" }, { status: 400 })
  }
  if (!token || token.length < 50) {
    return NextResponse.json({ error: 'Tokenet ser för kort ut — klistra in hela värdet' }, { status: 400 })
  }

  const expiresAt = body.expires_days
    ? new Date(Date.now() + body.expires_days * 24 * 60 * 60 * 1000)
    : undefined

  try {
    await setToken(platform, token, expiresAt)
    return NextResponse.json({ ok: true, platform, expires_at: expiresAt?.toISOString() ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Kunde inte spara token' }, { status: 500 })
  }
}
