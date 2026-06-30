/**
 * GET /api/atlas/intelligence/brief
 *
 * Internal read surface for EI cognitive artifacts — Epic 1.
 *
 * Query params:
 *   kind       — artifact kind (default: 'brief'). Any IntelligenceKind value.
 *   projectId  — project UUID or 'global' for platform-level artifacts.
 *   limit      — max results (default: 10, max: 50).
 *   since      — ISO timestamp, only return artifacts produced at or after.
 *
 * Returns newest-first, non-superseded only.
 *
 * Protected with the same CRON_SECRET as the cron route. In a later epic,
 * this will be gated by user auth for Voice/UX surfaces.
 *
 * This route is intentionally separate from the live Atlas page
 * (app/(platform)/atlas/page.tsx), which is NOT changed in Epic 1.
 *
 * Canonical refs: §3 (Memory read surface), §14 (cognitive artifact types).
 */

import { NextResponse } from 'next/server'
import { queryIntelligence } from '@/lib/atlas/intelligence/retrieval'
import type { IntelligenceKind } from '@/lib/atlas/intelligence/types'

export const dynamic = 'force-dynamic'

const VALID_KINDS: IntelligenceKind[] = [
  'brief', 'trend', 'insight', 'risk', 'opportunity',
  'executive_brief', 'recommendation', 'attention_request',
  'delegation_request', 'knowledge_request', 'hypothesis',
  'outcome', 'experience',
]

export async function GET(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // For Epic 1, protected by CRON_SECRET (internal route only).
  // Epic 4 will open this to authenticated users via the UX surface.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse params ──────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)

  const kindParam = searchParams.get('kind') ?? 'brief'
  if (!VALID_KINDS.includes(kindParam as IntelligenceKind)) {
    return NextResponse.json(
      { error: `Invalid kind: ${kindParam}. Valid: ${VALID_KINDS.join(', ')}` },
      { status: 400 },
    )
  }
  const kind = kindParam as IntelligenceKind

  const projectIdParam = searchParams.get('projectId')
  // 'global' → null (platform-level artifacts); undefined = all scopes
  const projectId: string | null | undefined =
    projectIdParam === 'global' ? null :
    projectIdParam              ? projectIdParam :
    undefined

  const limitParam = parseInt(searchParams.get('limit') ?? '10', 10)
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 10 : limitParam), 50)

  const since = searchParams.get('since') ?? undefined

  // ── Query ─────────────────────────────────────────────────────────────────
  try {
    const artifacts = await queryIntelligence({
      kinds:     [kind],
      projectId,
      limit,
      since,
    })

    return NextResponse.json({
      kind,
      count:   artifacts.length,
      results: artifacts,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ei-read] query failed: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
