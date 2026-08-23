/**
 * GET   /api/business/campaigns?project_id=&status=&limit=  — lista kampanjer
 * POST  /api/business/campaigns                             — skapa kampanj
 * PATCH /api/business/campaigns                             — uppdatera kampanj { id, ...patch }
 *
 * Body (POST): { project_id | project_slug, name, channel?, status?, started_at?, ended_at? }
 *
 * ── BUSINESS_SESSION_PROJECT_SCOPE (4B1) ─────────────────────────────────────
 *
 * The session path is now scoped to the caller's own projects. It previously
 * was not, in three distinct ways:
 *
 *   GET    without a filter returned EVERY campaign in EVERY project, because
 *          the service-role query had no project predicate at all.
 *   POST   took the project from the body verbatim.
 *   PATCH  selected the row by `id` alone — knowing an id was enough to update
 *          another tenant's campaign, whatever project you claimed.
 *
 * Reads are scoped at the query boundary and the PATCH is scoped on the UPDATE
 * itself, so the row that changes is the row that was authorized. Nothing is
 * post-filtered after a service-role fetch.
 *
 * The legacy AIOPS_API_KEY path is deliberately UNCHANGED — same project
 * semantics, same status codes, same everything. That is transitional debt,
 * removed in 4B2 when the auth class itself goes.
 */
import { NextResponse } from 'next/server'
import {
  resolveBusinessAuth, resolveSessionScope, resolveSessionProject,
} from '@/lib/business/business-auth'
import {
  createCampaign, updateCampaign, listCampaigns,
  BusinessError, type CampaignStatus, type CampaignInput,
} from '@/lib/business/store'

export const dynamic = 'force-dynamic'

/**
 * Campaign fields a session caller may supply. Project identity is absent by
 * construction: a pick cannot emit a key it does not name, so a body key
 * naming a project can never ride along into the insert.
 */
const SESSION_CAMPAIGN_FIELDS = ['name', 'channel', 'status', 'started_at', 'ended_at'] as const

export async function GET(request: Request) {
  const auth = await resolveBusinessAuth(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)

  // A session caller may only ever see their own projects. An explicit
  // project_id filter narrows within that set; it can never widen it.
  let allowedProjectIds: string[] | undefined
  if (auth.auth.kind === 'user') {
    const scope = await resolveSessionScope(auth.auth.userId)
    if (!scope.ok) return scope.response
    allowedProjectIds = scope.allowedProjectIds
  }

  try {
    const data = await listCampaigns({
      project_id: searchParams.get('project_id') ?? undefined,
      status:     (searchParams.get('status') as CampaignStatus) ?? undefined,
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

      const input = { project_id: project.projectId } as CampaignInput
      for (const field of SESSION_CAMPAIGN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          (input as unknown as Record<string, unknown>)[field] = body[field]
        }
      }
      const campaign = await createCampaign(input)
      return NextResponse.json(campaign, { status: 201 })
    }

    // Legacy global-key path — contract unchanged. TRANSITIONAL SECURITY DEBT.
    const campaign = await createCampaign(body)
    return NextResponse.json(campaign, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await resolveBusinessAuth(request)
  if (!auth.ok) return auth.response

  try {
    const { id, ...patch } = await request.json()
    if (!id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })

    if (auth.auth.kind === 'user') {
      const scope = await resolveSessionScope(auth.auth.userId)
      if (!scope.ok) return scope.response
      // The UPDATE is scoped by the allow-list, so a campaign outside it simply
      // matches no row. A body-supplied project cannot widen that — it is not
      // consulted at all, which is why claiming project A while targeting a
      // campaign in B changes nothing.
      const campaign = await updateCampaign(id, patch, scope.allowedProjectIds)
      return NextResponse.json(campaign)
    }

    // Legacy global-key path — contract unchanged. TRANSITIONAL SECURITY DEBT.
    const campaign = await updateCampaign(id, patch)
    return NextResponse.json(campaign)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
