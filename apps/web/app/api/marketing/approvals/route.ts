/**
 * Marketing Approvals — Action Center beslut (Fas 4).
 *
 * GET  → granskningsköer (getMarketingReview) för aktiv + nästa månad.
 * POST → ett operatörsbeslut för ett utkast:
 *        { draft_id, action: 'approve' | 'reject' | 'return' | 'edit', note?, caption_rendered?, landing_url? }
 *
 * Återanvänder den BEFINTLIGA approvals-tabellen (kind='marketing_draft') som
 * beslutsliggare — ingen parallell approval-logik. draft_posts.status är
 * sanningskällan för köerna. ⛔ Ingen publicering/Meta/scheduling.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getMarketingReview } from '@/lib/marketing/review'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const review = await getMarketingReview(db)
  return NextResponse.json(review)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const operator = user.email ?? user.id

  const body = (await request.json().catch(() => ({}))) as {
    draft_id?: string; action?: string; note?: string; caption_rendered?: string; landing_url?: string
  }
  const draftId = (body.draft_id ?? '').trim()
  const action = (body.action ?? '').trim()
  if (!draftId || !action) return NextResponse.json({ error: 'draft_id och action krävs' }, { status: 400 })

  const db = createAdminClient()
  const { data: draftRow } = await db
    .from('draft_posts')
    .select('id, project_id, brief_id, draft_key, status, draft_payload')
    .eq('id', draftId).maybeSingle()
  const draft = draftRow as { id?: string; project_id?: string; brief_id?: string; draft_key?: string; status?: string; draft_payload?: any } | null
  if (!draft?.id) return NextResponse.json({ error: 'Utkast hittades inte' }, { status: 404 })

  const { data: rep } = await db.from('guard_reports').select('id, verdict, score_breakdown, violations').eq('draft_id', draft.id).maybeSingle()
  const guard = rep as { id?: string; verdict?: string; score_breakdown?: any; violations?: any[] } | null
  const isCritical = Boolean(guard?.score_breakdown?.critical) || (Array.isArray(guard?.violations) && guard!.violations.some((v) => v.severity === 'CRITICAL'))

  const adb = db as any
  const logDecision = async (state: string, act: string, fixPatch: unknown = null, note: string | null = null) => {
    await adb.from('approvals').insert({
      kind: 'marketing_draft',
      project_id: draft.project_id,
      draft_id: draft.id,
      guard_report_id: guard?.id ?? null,
      output_key: 'marketing_draft',
      content: draft.draft_key ?? '',
      status: state,
      action: act,
      operator,
      note: note,
      reviewer_notes: note,
      fix_patch: fixPatch,
      decided_at: new Date().toISOString(),
    })
  }

  if (action === 'approve') {
    if (!guard || guard.verdict === 'rejected' || isCritical) {
      return NextResponse.json({ error: 'Får inte godkännas (Guard underkänd eller CRITICAL).' }, { status: 409 })
    }
    await db.from('draft_posts').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', draft.id)
    await logDecision('approved', 'approve')
    return NextResponse.json({ ok: true, draft_id: draft.id, status: 'approved' })
  }

  if (action === 'reject') {
    await db.from('draft_posts').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', draft.id)
    await logDecision('rejected', 'reject', null, body.note ?? null)
    return NextResponse.json({ ok: true, draft_id: draft.id, status: 'rejected' })
  }

  if (action === 'return') {
    await db.from('draft_posts').update({ status: 'returned', updated_at: new Date().toISOString() }).eq('id', draft.id)
    await logDecision('returned', 'return_to_drafter', null, body.note ?? null)
    await adb.from('runs').insert({
      project_id: draft.project_id, workflow_id: null, kind: 'marketing_channel_drafter',
      status: 'pending', input: { brief_id: draft.brief_id, returned_from: draft.id, note: body.note ?? null }, context: {},
    })
    return NextResponse.json({ ok: true, draft_id: draft.id, status: 'returned', requeued: true })
  }

  if (action === 'edit') {
    // Lätt operatörsfix: caption_rendered och/eller landningssida. Re-validera via Guard.
    const payload = { ...(draft.draft_payload ?? {}) }
    if (typeof body.caption_rendered === 'string') payload.caption_rendered = body.caption_rendered
    if (typeof body.landing_url === 'string' && body.landing_url.trim()) {
      payload.landing_url_slot = body.landing_url.trim()
      if (payload.cta) payload.cta = { ...payload.cta, landing_url_slot: body.landing_url.trim() }
    }
    await db.from('draft_posts').update({ status: 'drafted', draft_payload: payload, updated_at: new Date().toISOString() }).eq('id', draft.id)
    await logDecision('revised', 'approve_with_fix', { caption_rendered: body.caption_rendered ?? null, landing_url: body.landing_url ?? null })
    await adb.from('runs').insert({
      project_id: draft.project_id, workflow_id: null, kind: 'marketing_brand_guard',
      status: 'pending', input: { draft_id: draft.id }, context: {},
    })
    return NextResponse.json({ ok: true, draft_id: draft.id, status: 'drafted', revalidating: true })
  }

  return NextResponse.json({ error: `Okänd action: ${action}` }, { status: 400 })
}
