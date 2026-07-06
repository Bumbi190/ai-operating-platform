/**
 * PATCH /api/approvals/[id]  — approve, reject, or revise an approval
 * GET   /api/approvals/[id]  — get a single approval with full content
 *
 * On PATCH: also saves content_feedback for memory learning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveFeedback } from '@/lib/ai/memory/feedback-store'

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

  // Fetch the approval lineage to get project_id, output_key, content for feedback.
  const { data: existing } = await db
    .from('approvals')
    .select('id, output_key, content, run_id, runs(project_id)')
    .eq('id', params.id)
    .single()

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

  // Save feedback for memory learning (non-blocking — don't fail the request if this errors)
  const approvalRun = (existing as any)?.runs
  const projectId = Array.isArray(approvalRun)
    ? approvalRun[0]?.project_id
    : approvalRun?.project_id

  if (projectId) {
    try {
      await saveFeedback({
        projectId,
        approvalId:      params.id,
        outputType:      existing.output_key ?? 'unknown',
        decision:        action as 'approved' | 'rejected' | 'revised',
        rejectionReason: action !== 'approved' ? reviewer_notes : undefined,
        revisionNotes:   action === 'revised'  ? reviewer_notes : undefined,
        contentExcerpt:  typeof existing.content === 'string'
          ? existing.content.slice(0, 300)
          : undefined,
      })
    } catch (feedbackErr) {
      // Log but don't fail — approval already saved
      console.error('[approvals] feedback save failed:', feedbackErr)
    }
  }

  return NextResponse.json({ approval: data })
}
