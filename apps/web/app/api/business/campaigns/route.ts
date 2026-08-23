/**
 * GET   /api/business/campaigns?project_id=&status=&limit=  — lista kampanjer
 * POST  /api/business/campaigns                             — skapa kampanj
 * PATCH /api/business/campaigns                             — uppdatera kampanj { id, ...patch }
 *
 * Body (POST): { project_id | project_slug, name, channel?, status?, started_at?, ended_at? }
 *
 * ── SESSION ONLY (4B2) ───────────────────────────────────────────────────────
 *
 * This route accepts a logged-in user and nothing else. The global
 * AIOPS_API_KEY no longer grants access: it is never read here, and no bearer
 * token of any kind can satisfy `requireUserSession`. The 4A inventory found
 * zero external callers and zero rows ever written, so the safe target was
 * removing machine auth rather than replacing it with a credential.
 *
 * The 4B1 project scoping is unchanged and still carries the weight:
 *
 *   GET    scoped to the caller's own projects at the QUERY boundary. Before
 *          4B1, no filter meant every campaign in every project.
 *   POST   writes the VERIFIED project id, with an allow-listed payload.
 *   PATCH  scopes the UPDATE itself, and rebuilds the patch from the documented
 *          fields — scoping which row is selected does not constrain what the
 *          row becomes, and a raw rest-spread could move a campaign into
 *          someone else's project.
 */
import { NextResponse } from 'next/server'
import { requireUserSession } from '@/lib/auth/session'
import {
  resolveSessionScope, resolveSessionProject,
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
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)

  // A caller may only ever see their own projects. An explicit project_id
  // filter narrows within that set; it can never widen it.
  const scope = await resolveSessionScope(auth.userId)
  if (!scope.ok) return scope.response
  const allowedProjectIds = scope.allowedProjectIds

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
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid_request', detail: 'body_must_be_object' }, { status: 400 })
    }
    const project = await resolveSessionProject(body as Record<string, unknown>, auth.userId)
    if (!project.ok) return project.response

    const input = { project_id: project.projectId } as CampaignInput
    for (const field of SESSION_CAMPAIGN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (input as unknown as Record<string, unknown>)[field] = body[field]
      }
    }
    const campaign = await createCampaign(input)
    return NextResponse.json(campaign, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUserSession()
  if (!auth.ok) return auth.response

  try {
    const { id, ...patch } = await request.json()
    if (!id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })

    const scope = await resolveSessionScope(auth.userId)
    if (!scope.ok) return scope.response

    // ── TWO SEPARATE GUARDS, BOTH REQUIRED ────────────────────────────────
    //
    // Scoping the UPDATE decides WHICH ROW is selected — it matches the row's
    // project BEFORE the write. It says nothing about WHAT THE ROW BECOMES.
    // Passing the raw rest-spread through meant an owned campaign could be
    // MOVED into a project the caller does not own: the predicate matched on
    // the old value and the write then changed it.
    //
    // TypeScript did not catch this. `updateCampaign`'s parameter type is a
    // compile-time constraint at the call site, and `patch` came from
    // `await request.json()` as `any` — so nothing was checked, and even an
    // exact type is erased before runtime sees the object.
    //
    // The patch is therefore REBUILT from the documented fields. A key that is
    // never written cannot move a row, so `project_id`, `project_slug`, `id`
    // and anything else a caller invents are absent by construction rather
    // than filtered out afterwards.
    const safePatch: Record<string, unknown> = {}
    for (const field of SESSION_CAMPAIGN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        safePatch[field] = (patch as Record<string, unknown>)[field]
      }
    }
    const campaign = await updateCampaign(id, safePatch, scope.allowedProjectIds)
    return NextResponse.json(campaign)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
