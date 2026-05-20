/**
 * GET  /api/approvals        — list approvals (optionally filter by status)
 * POST /api/approvals        — create a new approval request (called by workflow executor)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const status = req.nextUrl.searchParams.get('status') // pending | approved | rejected | revised | all

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
      runs (
        id,
        status,
        created_at,
        workflows ( name ),
        agents ( name )
      )
    `)
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
