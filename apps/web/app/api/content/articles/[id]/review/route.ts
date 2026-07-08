/**
 * POST /api/content/articles/[id]/review   (System A — Website Content Engine)
 *
 * Operator approve/reject for a website_content item. Atlas is the authoritative
 * editorial record; this route writes back the workflow result.
 *
 *  - reject  → status='rejected' (no website write)
 *  - approve → publish via the EXISTING publishArticle mechanism only, then
 *              status='published' + destination_url/published_at/publish_operation.
 *
 * Strict System A: touches only website_content + the publishing mechanism.
 * Never uses the `approvals` table or `media_scripts`.
 *
 * Auth: operator session (Supabase auth). Not a cron endpoint.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishArticle } from '@/lib/publishing/publish'
import { PublishError, type PublishPayload } from '@/lib/publishing/types'
import { recordMemoryEvent } from '@/lib/atlas/memory/record-event'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: 'approve' | 'reject'; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: row, error: loadErr } = await db
    .from('website_content')
    .select('id, status, destination_key, payload, hero_image_url, project_id')
    .eq('id', params.id)
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'content not found' }, { status: 404 })
  // ISOLATION (C-1): the content must belong to one of the caller's projects
  // BEFORE any reject write or approve→publish. This route uses the service-role
  // client (RLS-bypassing); approve publishes publicly, so a foreign id must not
  // reach it. Foreign rows return the same 404 as missing (no existence probing).
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  if (!assertProjectAllowed(row.project_id, allowedProjectIds)) {
    return NextResponse.json({ error: 'content not found' }, { status: 404 })
  }
  if (row.status !== 'pending_review') {
    return NextResponse.json({ error: `not reviewable (status=${row.status})` }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const reviewer = user.email ?? user.id

  // ── Reject — no website write ──────────────────────────────────────────────
  if (action === 'reject') {
    const { error } = await db.from('website_content').update({
      status:           'rejected',
      reviewed_at:      nowIso,
      reviewed_by:      reviewer,
      reviewer_notes:   body.notes ?? null,
      rejection_reason: body.notes ?? null,
      status_reason:    `Rejected by ${reviewer}`,
      updated_at:       nowIso,
    }).eq('id', row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Atlas Memory — procedural feedback signal (mirrors /api/approvals/[id] pattern).
    // sourceId=params.id on the idempotency index (source, source_id, event_type) ensures
    // a double-submit of the same review produces no duplicate event (the status guard
    // above catches it first, but this is the backstop).
    void recordMemoryEvent({
      scope:      'project',
      eventType:  'feedback',
      projectId:  row.project_id,
      entityKind: 'output_type',
      entityId:   'article',
      dedupeKey:  'feedback:article',
      source:     'approval',
      sourceId:   params.id,
      subject:    'Content review: article',
      content:    `rejected: article output${body.notes ? ` — ${body.notes.slice(0, 200)}` : ''}`,
      confidence: 0.80,
      structured: {
        action:      'reject',
        contentId:   params.id,
        destination: row.destination_key,
        reviewer,
        hasNotes:    !!body.notes,
      },
    }, db)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // ── Approve — publish via the existing mechanism only ──────────────────────
  // MVP Commit 5: thread the operator-managed hero_image_url column into the
  // publish payload. The column is the live source of truth (set by Commit 3's
  // generateHeroImage()); the payload jsonb captured at generation time does
  // not yet have it. Sending null on first publish is correct (the destination
  // CMS clears the field per its three-way semantics). Sending a URL on
  // re-publish updates the destination row to point at the current Supabase
  // hero. No other field is touched.
  const destinationKey = (row.destination_key as string) ?? 'the-prompt'
  const payload: PublishPayload = {
    ...(row.payload as unknown as PublishPayload),
    hero_image_url: (row.hero_image_url as string | null) ?? null,
    published_at: nowIso,
  }

  try {
    const result = await publishArticle(destinationKey, payload)
    const { error } = await db.from('website_content').update({
      status:            'published',
      reviewed_at:       nowIso,
      reviewed_by:       reviewer,
      published_at:      result.published_at ?? nowIso,
      destination_url:   result.published_url,
      publish_operation: result.operation,
      publish_error:     null,
      status_reason:     `Approved & published by ${reviewer}`,
      updated_at:        nowIso,
    }).eq('id', row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Atlas Memory — emitted only after the DB update confirms 'published'. A publish
    // infrastructure failure lands in the catch block below and sets status='failed';
    // no emit there — that is not a quality signal, only an infrastructure failure.
    void recordMemoryEvent({
      scope:      'project',
      eventType:  'feedback',
      projectId:  row.project_id,
      entityKind: 'output_type',
      entityId:   'article',
      dedupeKey:  'feedback:article',
      source:     'approval',
      sourceId:   params.id,
      subject:    'Content review: article',
      content:    'approved: article output',
      confidence: 0.70,
      structured: {
        action:       'approve',
        contentId:    params.id,
        destination:  row.destination_key,
        publishedUrl: result.published_url,
        reviewer,
        hasNotes:     false,
      },
    }, db)
    return NextResponse.json({ ok: true, status: 'published', published_url: result.published_url, operation: result.operation })
  } catch (e) {
    const msg = e instanceof PublishError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e))
    await db.from('website_content').update({
      status:        'failed',
      reviewed_at:   nowIso,
      reviewed_by:   reviewer,
      publish_error: msg,
      status_reason: `Publish failed: ${msg}`,
      updated_at:    nowIso,
    }).eq('id', row.id)
    return NextResponse.json({ ok: false, status: 'failed', error: msg }, { status: 502 })
  }
}
