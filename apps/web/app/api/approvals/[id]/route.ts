/**
 * PATCH /api/approvals/[id]  — approve, reject, or revise an approval
 * GET   /api/approvals/[id]  — get a single approval with full content
 *
 * On PATCH: also saves content_feedback for memory learning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { saveFeedback } from '@/lib/ai/memory/feedback-store'
import { ARTICLE_APPROVAL_KIND, publishApprovedArticle } from '@/lib/article/approval'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

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
  if (!assertProjectAllowed(data.project_id, access.allowedProjectIds)) return projectForbidden()
  return NextResponse.json({ approval: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const body = await req.json()
  const { action, reviewer_notes } = body

  if (!['approved', 'rejected', 'revised'].includes(action)) {
    return NextResponse.json(
      { error: 'action måste vara approved, rejected eller revised' },
      { status: 400 },
    )
  }

  const db = createAdminClient()

  // Fetch the approval to get project_id, output_key, content, kind for feedback + publish hook
  const { data: existing } = await db
    .from('approvals')
    .select('id, project_id, output_key, content, run_id, kind')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Ownership gate BEFORE any mutation or publish side effect.
  if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) return projectForbidden()

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

  // H1.P4 PR2 — run lifecycle transition. The approval status is now persisted; reflect the
  // human decision on the originating run. Conditional on status='awaiting_approval' makes
  // it idempotent and race-free: a second PATCH, or an approval whose run is not awaiting,
  // updates zero rows. Non-blocking — a run-update miss never fails the saved approval.
  // 'revised' deliberately leaves run status untouched in PR2.
  if (existing.run_id && (action === 'approved' || action === 'rejected')) {
    try {
      if (action === 'approved') {
        await db.from('runs')
          .update({ status: 'done' })
          .eq('id', existing.run_id).eq('status', 'awaiting_approval')
      } else {
        await db.from('runs')
          .update({ status: 'rejected', error: `approval_rejected: ${reviewer_notes ?? ''}`.slice(0, 500) })
          .eq('id', existing.run_id).eq('status', 'awaiting_approval')
      }
    } catch (runErr) {
      console.error('[approvals] run-transition failed:', runErr)
    }
  }

  // Save feedback for memory learning (non-blocking — don't fail the request if this errors)
  if (existing?.project_id) {
    try {
      await saveFeedback({
        projectId:       existing.project_id,
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

  // Publish-on-approve hook: only for article_publish approvals that were just approved.
  // Guarded so all other approval kinds are completely unaffected. Idempotent (RPC keyed
  // on external_id), non-blocking — the approval already saved; report publish outcome.
  let published: unknown = undefined
  let publishError: string | undefined
  if (action === 'approved' && existing?.kind === ARTICLE_APPROVAL_KIND && typeof existing.content === 'string') {
    try {
      published = await publishApprovedArticle(existing.content)
    } catch (pubErr) {
      publishError = pubErr instanceof Error ? pubErr.message : String(pubErr)
      console.error('[approvals] publish-on-approve failed:', publishError)
    }
  }

  return NextResponse.json({ approval: data, published, publishError })
}
