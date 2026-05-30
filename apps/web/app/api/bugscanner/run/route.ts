/**
 * POST /api/bugscanner/run
 *
 * Triggar en komplett buggscanning av Familje-Stunden + Gainpilot.
 * Skickar en HTML-rapport till admin-mailet via Brevo.
 *
 * Säkras med BUGSCANNER_SECRET — matcha mot Authorization: Bearer <secret>
 * Sätt BUGSCANNER_SECRET i .env.local.
 */

import { NextResponse } from 'next/server'
import { runBugScan } from '@/lib/bugscanner/checker'
import { buildBugReportEmail } from '@/lib/bugscanner/reportEmail'
import { sendAdminNotification } from '@/lib/email/brevo'

export const maxDuration = 60 // Vercel: max 60s för hobby-plan

export async function POST(request: Request) {
  // Autentisering — accepterar antingen inloggad session ELLER secret token
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.BUGSCANNER_SECRET
  const tokenOk = secret && authHeader === `Bearer ${secret}`

  if (!tokenOk) {
    // Kontrollera om det är en inloggad admin via cookie-session istället
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const adminEmail = process.env.BREVO_ADMIN_EMAIL

    if (!user || user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('[BugScanner] Startar daglig buggscanning...')
    const report = await runBugScan()

    const { subject, html } = buildBugReportEmail(report)

    // Skicka alltid mailet — även om allt är OK (bekräftar att scannern lever)
    const emailResult = await sendAdminNotification(subject, html)

    console.log(`[BugScanner] Klar — ${report.summary.errors} fel, ${report.summary.warnings} varningar. Mail: ${emailResult?.success ? 'skickat' : 'misslyckades'}`)

    return NextResponse.json({
      ok: true,
      summary: report.summary,
      checksRun: report.checks.length,
      emailSent: emailResult?.success ?? false,
      checks: report.checks,   // full per-check details: { name, status, message }
    })
  } catch (err: any) {
    console.error('[BugScanner] Kritiskt fel:', err)
    return NextResponse.json(
      { error: 'Buggscanning misslyckades', details: err?.message },
      { status: 500 },
    )
  }
}

// GET — enkel hälsokoll att endpointen finns
export async function GET() {
  return NextResponse.json({ ok: true, info: 'POST /api/bugscanner/run för att köra scan' })
}
