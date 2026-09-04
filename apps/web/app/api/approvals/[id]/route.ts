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
import { recordMemoryEvent } from '@/lib/atlas/memory/record-event'

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

  // Fetch the approval to get project_id, output_key, content, kind, and run lineage
  // for feedback, Atlas memory, and the publish hook.
  const { data: existing } = await db
    .from('approvals')
    .select('id, project_id, output_key, content, run_id, kind, runs(project_id)')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const directProjectId = (existing as Record<string, unknown>)['project_id'] as string | null | undefined
  const approvalRun = (existing as any)?.runs
  const projectId = directProjectId ?? (Array.isArray(approvalRun)
    ? approvalRun[0]?.project_id
    : approvalRun?.project_id)

  // Ownership gate BEFORE any mutation or publish side effect.
  if (!projectId || !assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  // ── G3C-3B · RUN FIRST, THEN APPROVAL — ONE ATOMIC TRANSITION ────────────
  // This route used to write the APPROVAL first, unconditionally (no status
  // predicate at all), and only afterwards attempt the run flip — whose row
  // count it never checked. Two failures followed from that ordering:
  //
  //   • cancel-first: the cancel route set the run `cancelled` and the approval
  //     `returned`; this PATCH then overwrote `returned` back to `approved`, the
  //     run flip matched zero rows, and the publish hook — gated only on
  //     `action === 'approved'` — PUBLISHED AN ARTICLE FOR A CANCELLED RUN.
  //   • approve-first: the cancel route's own unchecked UPDATE matched zero rows
  //     and still answered `{ok:true, status:'cancelled'}`.
  //
  // `resolve_approval` locks the RUN row before the approval row — the same
  // order `request_run_cancel` uses — so the two serialise on one row instead of
  // interleaving. `revised` takes the run lock too: it leaves the run
  // awaiting_approval, but without the lock a cancel could win the run while the
  // revision independently overwrote the `returned` approval it had just written.
  if (!existing.run_id) {
    return NextResponse.json(
      { error: 'Godkännandet saknar körning och kan inte avgöras här' }, { status: 409 })
  }

  const { data: verdict, error } = await db.rpc('resolve_approval', {
    p_approval_id: params.id,
    p_run_id:      existing.run_id,
    p_project_id:  projectId,
    p_action:      action,
    p_notes:       reviewer_notes ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const WON = verdict === 'APPROVED' || verdict === 'REJECTED' || verdict === 'REVISED'
  if (!WON) {
    // A loser is CONTROL FLOW, not success. It must not publish, must not record
    // "approved" feedback, and must not write a procedural memory claiming a
    // decision it did not make.
    return NextResponse.json({
      ok: false, outcome: verdict,
      error: verdict === 'LOST'
        ? 'Körningen väntar inte längre på godkännande (avbruten eller redan avgjord)'
        : verdict === 'ALREADY_RESOLVED'
          ? 'Godkännandet är redan avgjort'
          : 'Godkännandet hittades inte för denna körning',
    }, { status: 409 })
  }

  const { data } = await db.from('approvals').select().eq('id', params.id).single()

  // Save feedback for memory learning (non-blocking — don't fail the request if this errors)
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

    // Atlas Memory M4 Commit 4 — procedural feedback signal.
    // event_type='feedback' → procedural → materializes in atlas.memories via consolidation.
    // dedupeKey is entity-scoped ('feedback:${outputType}'), NOT approval-ID-scoped, so all
    // feedback for the same output type consolidates to ONE atlas.memories row (bounded growth).
    // sourceId=approvalId drives the idempotency index: network retries are safe (deduped).
    // Re-review (same approval PATCH'd twice): first human decision wins — second is deduped.
    // void = non-blocking side-channel; must never delay or fail the approval response.
    const outputType = existing.output_key ?? 'unknown'
    void recordMemoryEvent({
      scope:      'project',
      eventType:  'feedback',
      projectId,
      entityKind: 'output_type',
      entityId:   outputType,
      dedupeKey:  `feedback:${outputType}`,
      source:     'approval',
      sourceId:   params.id,
      subject:    `Content feedback: ${outputType}`,
      content:    `${action}: ${outputType} output${reviewer_notes ? ` — ${reviewer_notes.slice(0, 200)}` : ''}`,
      confidence: action === 'rejected' ? 0.80 : action === 'approved' ? 0.70 : 0.50,
      structured: {
        outputType,
        action,
        runId:    existing.run_id ?? null,
        kind:     existing.kind   ?? null,
        hasNotes: !!reviewer_notes,
      },
    }, db)
  }

  // Publish-on-approve hook: only for article_publish approvals that were just approved.
  // Guarded so all other approval kinds are completely unaffected. Idempotent (RPC keyed
  // on external_id), non-blocking — the approval already saved; report publish outcome.
  let published: unknown = undefined
  let publishError: string | undefined
  // `verdict === 'APPROVED'`, never `action === 'approved'`: only the operation
  // that actually WON the run transition may cause an external effect.
  if (verdict === 'APPROVED' && existing?.kind === ARTICLE_APPROVAL_KIND && typeof existing.content === 'string') {
    try {
      published = await publishApprovedArticle(existing.content)
    } catch (pubErr) {
      publishError = pubErr instanceof Error ? pubErr.message : String(pubErr)
      console.error('[approvals] publish-on-approve failed:', publishError)
    }
  }

  return NextResponse.json({ approval: data, published, publishError })
}
