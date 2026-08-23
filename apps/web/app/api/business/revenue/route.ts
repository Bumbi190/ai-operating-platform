/**
 * GET  /api/business/revenue?project_id=&since=&limit=   — lista intäkter
 * POST /api/business/revenue                             — logga intäkt
 *
 * Body (POST): { project_id | project_slug, amount_sek, currency?, source?, description?, occurred_at? }
 *
 * Exempel: en Stripe-webhook postar hit varje gång en betalning lyckas.
 *
 * ── BUSINESS_SESSION_PROJECT_SCOPE (4B1) ─────────────────────────────────────
 *
 * The session path is now scoped to the caller's own projects. Before this, a
 * GET with no filter returned EVERY revenue event in EVERY project — the
 * service-role query had no project predicate — and a POST took the project
 * from the body verbatim. Revenue is the most sensitive of the three business
 * tables to read across tenants, since the rows are amounts.
 *
 * Reads are scoped at the query boundary, never post-filtered after a
 * service-role fetch. The legacy AIOPS_API_KEY path is deliberately UNCHANGED
 * — transitional debt, removed in 4B2 with the auth class itself.
 */
import { NextResponse } from 'next/server'
import {
  resolveBusinessAuth, resolveSessionScope, resolveSessionProject,
} from '@/lib/business/business-auth'
import { logRevenue, listRevenue, BusinessError, type RevenueInput } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

/**
 * Revenue fields a session caller may supply. Project identity is absent by
 * construction — the verified id is written, never the body value.
 */
const SESSION_REVENUE_FIELDS = ['amount_sek', 'currency', 'source', 'description', 'occurred_at'] as const

export async function GET(request: Request) {
  const auth = await resolveBusinessAuth(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)

  let allowedProjectIds: string[] | undefined
  if (auth.auth.kind === 'user') {
    const scope = await resolveSessionScope(auth.auth.userId)
    if (!scope.ok) return scope.response
    allowedProjectIds = scope.allowedProjectIds
  }

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
  const auth = await resolveBusinessAuth(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    if (auth.auth.kind === 'user') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'invalid_request', detail: 'body_must_be_object' }, { status: 400 })
      }
      const project = await resolveSessionProject(body as Record<string, unknown>, auth.auth.userId)
      if (!project.ok) return project.response

      const input = { project_id: project.projectId } as RevenueInput
      for (const field of SESSION_REVENUE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          (input as unknown as Record<string, unknown>)[field] = body[field]
        }
      }
      const event = await logRevenue(input)
      return NextResponse.json(event, { status: 201 })
    }

    // Legacy global-key path — contract unchanged. TRANSITIONAL SECURITY DEBT.
    const event = await logRevenue(body)
    return NextResponse.json(event, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
