/**
 * POST /api/leads — lead ingestion (reuse model: writes to existing `leads`).
 *
 * Entry point for GainPilot (and future CRM/form sources) to register leads so
 * Atlas can answer "how many leads this week?" and prioritise conversion.
 *
 * Body: { project_id?, name, email?, phone?, source?, status?, value_sek? }
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

export const dynamic = 'force-dynamic'

const VALID_STATUS = ['ny', 'kontaktad', 'kvalificerad', 'kund', 'new', 'qualified', 'converted', 'lost', 'warm']

export async function POST(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name krävs' }, { status: 400 })

  // ISOLATION (C-1): if a project is specified it must be one the caller owns.
  // A null project_id is allowed (unattributed lead — invisible to project-scoped
  // reads), but a caller may not attribute a lead to another tenant's project.
  const projectId: string | null = body?.project_id ?? null
  if (projectId !== null && !assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return projectForbidden()
  }

  const status = VALID_STATUS.includes(body?.status) ? body.status : 'ny'

  const db: any = createAdminClient()
  try {
    const { data, error } = await db.from('leads').insert({
      project_id:  projectId,
      name,
      email:       body?.email ?? null,
      phone:       body?.phone ?? null,
      source:      body?.source ?? 'manual',
      status,
      value_sek:   typeof body?.value_sek === 'number' ? body.value_sek : null,
    }).select('id, name, status').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, lead: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Kunde inte spara lead' }, { status: 500 })
  }
}
