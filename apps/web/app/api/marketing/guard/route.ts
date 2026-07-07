/**
 * GET /api/marketing/guard — läs en guard-rapport.
 *
 * Query:
 *   ?draft_id=<uuid>   → rapporten för ett utkast
 *   ?report_id=<uuid>  → en specifik rapport
 *
 * Read-only. ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const draftId = url.searchParams.get('draft_id')
  const reportId = url.searchParams.get('report_id')
  if (!draftId && !reportId) return NextResponse.json({ error: 'draft_id eller report_id krävs' }, { status: 400 })

  const db = createAdminClient()
  let q = db.from('guard_reports').select('*')
  q = reportId ? q.eq('id', reportId) : q.eq('draft_id', draftId as string)
  const { data: report } = await q.maybeSingle()
  if (!report) return NextResponse.json({ error: 'Rapport hittades inte' }, { status: 404 })
  return NextResponse.json({ report })
}
