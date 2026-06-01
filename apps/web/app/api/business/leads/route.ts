/**
 * GET  /api/business/leads?project_id=&status=&limit=   — lista leads (inloggad)
 * POST /api/business/leads                              — skapa lead (user ELLER API-nyckel)
 *
 * Body (POST): { project_id | project_slug, name?, email?, source?, status?, value_sek? }
 */
import { NextResponse } from 'next/server'
import { requireUserOrApiKey } from '@/lib/api-auth'
import { createLead, listLeads, BusinessError, type LeadStatus } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  try {
    const data = await listLeads({
      project_id: searchParams.get('project_id') ?? undefined,
      status:     (searchParams.get('status') as LeadStatus) ?? undefined,
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
    const lead = await createLead(body)
    return NextResponse.json(lead, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
