/**
 * GET  /api/business/revenue?project_id=&since=&limit=   — lista intäkter
 * POST /api/business/revenue                             — logga intäkt
 *
 * Body (POST): { project_id | project_slug, amount_sek, currency?, source?, description?, occurred_at? }
 *
 * Historiskt exempel, inte längre möjligt: en Stripe-webhook postade hit vid
 * varje lyckad betalning. Routen är session-only sedan 4B2, så en webhook kan
 * inte nå den.
 *
 * ── SESSION ONLY (4B2) ───────────────────────────────────────────────────────
 *
 * This route accepts a logged-in user and nothing else. The global
 * AIOPS_API_KEY no longer grants access. The 4A inventory found zero external
 * callers and zero rows ever written, so the safe target was removing machine
 * auth rather than replacing it with a credential — and revenue is the most
 * sensitive of the three business tables to read across tenants, since the
 * rows are amounts.
 *
 * The 4B1 project scoping is unchanged: reads are scoped at the QUERY
 * boundary, never post-filtered after a service-role fetch, and a write uses
 * the VERIFIED project id with an allow-listed payload.
 */
import { NextResponse } from 'next/server'
import { requireUserSession } from '@/lib/auth/session'
import {
  resolveSessionScope, resolveSessionProject,
} from '@/lib/business/business-auth'
import { logRevenue, listRevenue, BusinessError, type RevenueInput } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

/**
 * Revenue fields a session caller may supply. Project identity is absent by
 * construction — the verified id is written, never the body value.
 */
const SESSION_REVENUE_FIELDS = ['amount_sek', 'currency', 'source', 'description', 'occurred_at'] as const

export async function GET(request: Request) {
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)

  const scope = await resolveSessionScope(auth.userId)
  if (!scope.ok) return scope.response
  const allowedProjectIds = scope.allowedProjectIds

  try {
    const data = await listRevenue({
      project_id: searchParams.get('project_id') ?? undefined,
      sinceISO:   searchParams.get('since') ?? undefined,
      limit:      searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      allowedProjectIds,
    })
    return NextResponse.json(data)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid_request', detail: 'body_must_be_object' }, { status: 400 })
    }
    const project = await resolveSessionProject(body as Record<string, unknown>, auth.userId)
    if (!project.ok) return project.response

    const input = { project_id: project.projectId } as RevenueInput
    for (const field of SESSION_REVENUE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (input as unknown as Record<string, unknown>)[field] = body[field]
      }
    }
    const event = await logRevenue(input)
    return NextResponse.json(event, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
