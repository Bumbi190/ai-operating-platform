/**
 * GET /api/intelligence/graph/system — the static System Map (Graphify import).
 *
 * Auth: logged-in user required (fail closed — no artifact data without a session).
 * The graph describes Omnira's own codebase (no per-project runtime data), so a
 * valid session is the access boundary, matching /memory and /system.
 *
 * Query:
 *   level=overview                     (default) community supernodes
 *   level=community&community=<id>    one community's subgraph
 *   level=neighborhood&node=<id>      one node + direct neighbors (inspector)
 *   q=<text>                          search node index (max 30 hits)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCommunityView,
  buildNeighborhood,
  buildOverview,
  loadSystemGraph,
  searchNodes,
} from '@/lib/intelligence/system-graph'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = loadSystemGraph()
  if (!status.ok) {
    // Honest empty state — no fictional data. 200 so the client can render
    // instructions instead of an error banner.
    return NextResponse.json({
      available: false,
      reason: status.reason,
      hint: status.reason === 'missing'
        ? 'Generera artifacten: kör graphify på repot och sedan `npx tsx scripts/import-system-graph.ts` i apps/web.'
        : 'Artifacten avvisades av schema-/storleksvalideringen. Regenerera den med import-scriptet.',
    })
  }

  const { graph } = status
  const params = req.nextUrl.searchParams

  const q = params.get('q')
  if (q) {
    return NextResponse.json({ available: true, hits: searchNodes(graph, q) })
  }

  const level = params.get('level') ?? 'overview'

  if (level === 'community') {
    const idRaw = params.get('community')
    const id = idRaw !== null ? Number.parseInt(idRaw, 10) : NaN
    if (!Number.isInteger(id) || id < 0) {
      return NextResponse.json({ error: 'invalid community id' }, { status: 400 })
    }
    return NextResponse.json({ available: true, ...buildCommunityView(graph, id) })
  }

  if (level === 'neighborhood') {
    const nodeId = params.get('node')
    if (!nodeId || nodeId.length > 300) {
      return NextResponse.json({ error: 'invalid node id' }, { status: 400 })
    }
    const view = buildNeighborhood(graph, nodeId)
    if (!view) return NextResponse.json({ error: 'node not found' }, { status: 404 })
    return NextResponse.json({ available: true, ...view })
  }

  return NextResponse.json({ available: true, ...buildOverview(graph) })
}
