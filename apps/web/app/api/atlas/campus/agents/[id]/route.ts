/**
 * GET /api/atlas/campus/agents/:id?projectId=<uuid>
 *
 * Re-confirm a per-project agent identity using the EXISTING authenticated
 * Organisation loader before showing a private Pling contact card.
 * The data is not a session, agent execution, grant, chat or call.
 *
 * Never accept API-key authentication, never read an unscoped agent row,
 * never return the stored system_prompt or project credentials.
 */
import { NextResponse } from 'next/server'
import { loadOrganisationModel } from '@/lib/os/organisation'
import { resolveVerifiedAgentBinding } from '@/lib/atlas/campus/verified-agent-binding'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    // Verify AUTH FIRST via the same loader used for Agent Office v0.31.
    const model = await loadOrganisationModel()
    if (!model) return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401, headers: PRIVATE_HEADERS,
    })
    // Failed source availability is UNKNOWN, never an empty list or 404.
    if (!model.availability.projects || !model.availability.agents) {
      return NextResponse.json({ error: 'Agent register unavailable' }, {
        status: 503, headers: PRIVATE_HEADERS,
      })
    }

    const url = new URL(request.url)
    const keys = [...url.searchParams.keys()]
    const ids = url.searchParams.getAll('projectId')
    if (keys.length !== 1 || keys[0] !== 'projectId' ||
        ids.length !== 1 || !UUID.test(ids[0]!) ||
        typeof params.id !== 'string' || !UUID.test(params.id)) {
      return NextResponse.json({ error: 'Invalid agent selection' }, {
        status: 400, headers: PRIVATE_HEADERS,
      })
    }
    const binding = resolveVerifiedAgentBinding(model, ids[0]!, params.id)
    if (!binding) {
      // A foreign agent must be indistinguishable from a nonexistent agent.
      return NextResponse.json({ error: 'Not found' }, {
        status: 404, headers: PRIVATE_HEADERS,
      })
    }
    return NextResponse.json(binding, { status: 200, headers: PRIVATE_HEADERS })
  } catch {
    // Never print secrets, agent prompts, database errors or raw membership.
    return NextResponse.json({ error: 'Agent register unavailable' }, {
      status: 503, headers: PRIVATE_HEADERS,
    })
  }
}
