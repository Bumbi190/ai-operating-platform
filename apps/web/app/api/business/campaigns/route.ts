/**
 * GET   /api/business/campaigns?project_id=&status=&limit=  — lista kampanjer (inloggad)
 * POST  /api/business/campaigns                             — skapa kampanj (user ELLER API-nyckel)
 * PATCH /api/business/campaigns                             — uppdatera kampanj { id, ...patch }
 *
 * Body (POST): { project_id | project_slug, name, channel?, status?, started_at?, ended_at? }
 */
import { NextResponse } from 'next/server'
import { requireUserOrApiKey } from '@/lib/api-auth'
import { createCampaign, updateCampaign, listCampaigns, BusinessError, type CampaignStatus } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  try {
    const data = await listCampaigns({
      project_id: searchParams.get('project_id') ?? undefined,
      status:     (searchParams.get('status') as CampaignStatus) ?? undefined,
      limit:      searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    })
    return NextResponse.json(data)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const campaign = await createCampaign(body)
    return NextResponse.json(campaign, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const { id, ...patch } = await request.json()
    if (!id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    const campaign = await updateCampaign(id, patch)
    return NextResponse.json(campaign)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
