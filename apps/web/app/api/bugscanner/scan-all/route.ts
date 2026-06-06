/**
 * POST /api/bugscanner/scan-all
 *
 * Orchestrator för den dagliga buggscanningen. Kör varje projekts EGNA
 * bugscanner (via registret), diffar mot förra körningen och sparar resultatet
 * i bugscan_runs/bugscan_findings. Matar panelen — skickar inget mail.
 *
 * Triggas av Vercel cron (se vercel.json) samt manuellt av inloggad admin.
 * Skyddas med CRON_SECRET (Vercel cron skickar Authorization: Bearer <secret>).
 */

import { NextResponse } from 'next/server'
import { runScanAll } from '@/lib/bugs/scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorize(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  // Fallback: inloggad admin via cookie-session.
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const adminEmail = process.env.BREVO_ADMIN_EMAIL
    return !!(user && adminEmail && user.email === adminEmail)
  } catch {
    return false
  }
}

async function handle(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runScanAll()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[scan-all] Kritiskt fel:', err)
    return NextResponse.json({ error: 'Scan-all misslyckades', details: err?.message }, { status: 500 })
  }
}

export async function POST(request: Request) { return handle(request) }
// GET tillåts så Vercel cron (som gör GET) kan trigga den.
export async function GET(request: Request) { return handle(request) }
