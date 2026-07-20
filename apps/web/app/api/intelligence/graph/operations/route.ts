/**
 * GET /api/intelligence/graph/operations — read-only Live Operations graph.
 *
 * Auth: logged-in user required. Every query is project-scoped through
 * lib/atlas/isolation (fail closed — empty allow-list ⇒ zero rows).
 *
 * Query:
 *   project=<uuid>   narrow to ONE project (must be in the caller's allow-list,
 *                    otherwise silently ignored → falls back to the allow-list)
 *   hours=<1..720>   time window for runs (default 24)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildOperationsGraph,
  DEFAULT_WINDOW,
  OperationsGraphLimitError,
} from '@/lib/intelligence/operations-graph'
import type { OperationsGraphResponse } from '@/lib/intelligence/graph-contract'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })

  const params = req.nextUrl.searchParams

  const projectId = params.get('project') ?? undefined
  if (projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return NextResponse.json({ error: 'invalid project id' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const hoursRaw = params.get('hours')
  let hours = DEFAULT_WINDOW.hours
  if (hoursRaw !== null) {
    const parsed = Number.parseInt(hoursRaw, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 720) {
      return NextResponse.json({ error: 'invalid hours (1–720)' }, { status: 400, headers: NO_STORE_HEADERS })
    }
    hours = parsed
  }

  try {
    const db = createAdminClient()
    const { graph, projects, snapshot } = await buildOperationsGraph(db, user.id, {
      projectId,
      window: { hours, maxRuns: DEFAULT_WINDOW.maxRuns },
    })
    const response: OperationsGraphResponse = { available: true, projects, snapshot, ...graph }
    return NextResponse.json(response, { headers: NO_STORE_HEADERS })
  } catch (error) {
    // Fail closed: no partial data on error.
    const status = error instanceof OperationsGraphLimitError ? 503 : 500
    return NextResponse.json({ error: 'operations graph unavailable' }, { status, headers: NO_STORE_HEADERS })
  }
}
