/**
 * GET  /api/approvals        — list approvals (optionally filter by status)
 * POST /api/approvals        — create a new approval request (called by workflow executor)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const status = req.nextUrl.searchParams.get('status') // pending | approved | rejected | revised | all

  // ISOLATION: the API counterpart of the approvals PAGE fixed in Phase 9L.
  // `approvals.project_id` is nullable and most live rows leave it null, so
  // filtering that column alone would empty the queue rather than isolate it.
  // Ownership travels through the parent run — the same rule the page and the
  // decision route already apply — and `runs!inner` is what makes the filter
  // drop rows: a plain embed would only null the embedded object and leave
  // every tenant's approval in the response.
  //
  // The scope lands BEFORE `.order()` and `.limit(50)`. That matters
  // independently of the leak: a limit over a global read is spent on whoever
  // approved most recently platform-wide, so an operator's own queue can be
  // pushed out of the slice entirely.
  //
  // PRE-EXISTING AND NOT REPAIRED HERE: the `agents ( name )` embed has no
  // matching relationship ("Could not find a relationship between 'runs' and
  // 'agents'"), so this query has been returning 400 and the route 500 on
  // main — the same broken embed Phase 9L documented on the Manager page. The
  // leak is therefore latent rather than live. Fixing the relationship would
  // surface data this endpoint has never returned, which is a functional
  // change; the scope is added now so that whenever it IS repaired, it cannot
  // come back global.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  let query = db
    .from('approvals')
    .select(`
      id,
      output_key,
      content,
      status,
      reviewer_notes,
      created_at,
      reviewed_at,
      runs!inner (
        id,
        status,
        created_at,
        workflows ( name ),
        agents ( name )
      )
    `)
    .in('runs.project_id', scopeProjectFilter(allowedProjectIds))
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ approvals: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { run_id, output_key, content } = body

  if (!run_id || !output_key || !content) {
    return NextResponse.json({ error: 'run_id, output_key och content krävs' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('approvals')
    .insert({ run_id, output_key, content, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ approval: data }, { status: 201 })
}
