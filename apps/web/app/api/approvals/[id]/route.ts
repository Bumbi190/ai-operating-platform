/**
 * PATCH /api/approvals/[id]  — approve, reject, or revise an approval
 * GET   /api/approvals/[id]  — get a single approval with full content
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('approvals')
    .select(`
      *,
      runs (
        id, status, created_at,
        workflows ( name ),
        agents ( name )
      )
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ approval: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, reviewer_notes } = body

  if (!['approved', 'rejected', 'revised'].includes(action)) {
    return NextResponse.json(
      { error: 'action måste vara approved, rejected eller revised' },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('approvals')
    .update({
      status: action,
      reviewer_notes: reviewer_notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ approval: data })
}
