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
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
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

  // ISOLATION: both identifiers come straight from the query string, and the
  // service-role client bypasses RLS, so the id alone proves nothing. Scope the
  // lookup itself rather than fetching and checking afterwards: `guard_reports`
  // carries its own NOT NULL project_id, so no relation walk is needed. A
  // foreign report then produces no row and returns the SAME 404 as a missing
  // one, which is what keeps ids from being probed for existence.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  let q = db.from('guard_reports').select('*')
    .in('project_id', scopeProjectFilter(allowedProjectIds))
  q = reportId ? q.eq('id', reportId) : q.eq('draft_id', draftId as string)
  const { data: report } = await q.maybeSingle()
  if (!report) return NextResponse.json({ error: 'Rapport hittades inte' }, { status: 404 })
  return NextResponse.json({ report })
}
