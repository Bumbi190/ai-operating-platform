import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasProjectViewerMembership } from '@/lib/atlas/project-viewer-access'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

function denied() {
  return NextResponse.json({ error: 'Not permitted' }, { status: 403, headers })
}

/** An intentionally narrow, read-only, session-authenticated view. Never returns a raw snapshot. */
export async function GET() {
  const client = await createClient()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers })

  // Authenticate and authorize with the session-bound client BEFORE the service-role
  // report reader. Never widen Atlas' owner-only project allowlist.
  const { data: owned, error: ownerError } = await client.from('projects')
    .select('id').eq('id', HANDLARBORSEN_PROJECT_ID).eq('owner_id', user.id).maybeSingle()

  if (ownerError) return denied()
  let permitted = owned?.id === HANDLARBORSEN_PROJECT_ID
  if (!permitted) {
    // No fallback access on a missing membership table, SQL errors or revoked user.
    permitted = await hasProjectViewerMembership(
      client as unknown as Parameters<typeof hasProjectViewerMembership>[0],
      HANDLARBORSEN_PROJECT_ID,
      user.id,
    )
  }
  if (!permitted) return denied()

  const result = await loadHandlarborsenMarketplaceReport(
    { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG },
    { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] },
  )
  if (result.status !== 'ok') return denied()

  const { report } = result
  // Whitelist only aggregate numbers and freshness; never forward the report's
  // raw history, collection audit, sources, credentials or project metadata.
  return NextResponse.json({
    project: 'Handlarbörsen',
    state: report.state,
    snapshotDate: report.latest?.snapshotDate ?? null,
    observedAt: report.latest?.observedAt ?? null,
    freshness: report.latest?.freshness ?? null,
    metrics: (report.latest?.metrics ?? []).map(({ key, label, value }) => ({ key, label, value })),
  }, { headers })
}
