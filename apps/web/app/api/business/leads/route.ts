/**
 * GET  /api/business/leads?project_id=&status=&limit=   — lista leads (inloggad)
 * POST /api/business/leads                              — skapa lead
 *
 * Body (POST): { project_id | project_slug, name?, email?, source?, status?, value_sek? }
 *
 * ── PHASE 2: THREE AUTH CLASSES, TWO BODY CONTRACTS ──────────────────────────
 *
 * A project credential holding `business.leads.create` may now create a lead.
 * The session and legacy-key paths are unchanged, including their body handling
 * — the UI (`QuickAdd`) sends `project_id` and Familje-Stunden's
 * `send-pyssel-lead` sends a project reference, and both remain legitimate.
 *
 * The credential path does NOT share that contract. Its project comes from the
 * credential row and from nowhere else, and naming a project in the body is
 * refused outright rather than compared. Presence is the refusal because a
 * comparison is one `??` away from becoming a fallback, and because a caller
 * supplying a project id has misunderstood what the credential is — saying so
 * is better than silently ignoring it.
 *
 * The asymmetry is deliberate and is the point of the phase: the legacy paths
 * keep the semantics they already had, the new path gets the semantics we
 * actually want, and migrating a caller is therefore a real security change
 * rather than a rename.
 */
import { NextResponse } from 'next/server'
import { resolveLeadsAuth } from '@/lib/business/leads-auth'
import { createLead, listLeads, BusinessError, type LeadStatus, type LeadInput } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

/** V1 defines no read scope, so a credential token cannot list leads. */
const NO_READ_SCOPE = null

/** The scope a project credential must hold to create a lead. */
const CREATE_SCOPE = 'business.leads.create'

/**
 * Lead fields a credential caller may supply. Project identity is absent by
 * construction: a pick cannot emit a key it does not name, so no later edit to
 * the body shape can introduce one.
 */
const CREDENTIAL_LEAD_FIELDS = ['name', 'email', 'source', 'status', 'value_sek'] as const

/** Project-naming keys refused on the credential path. */
const PROJECT_KEYS = ['project_id', 'project_slug'] as const

export async function GET(request: Request) {
  const auth = await resolveLeadsAuth(request, NO_READ_SCOPE)
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
  const auth = await resolveLeadsAuth(request, CREATE_SCOPE)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    if (auth.auth.kind === 'project_credential') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
          { error: 'invalid_request', detail: 'body_must_be_object' },
          { status: 400 },
        )
      }
      for (const key of PROJECT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          return NextResponse.json(
            { error: 'invalid_request', detail: `project_from_credential_only:${key}` },
            { status: 400 },
          )
        }
      }
      const input: LeadInput = { project_id: auth.auth.principal.projectId }
      for (const field of CREDENTIAL_LEAD_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          (input as Record<string, unknown>)[field] = body[field]
        }
      }
      const lead = await createLead(input)
      return NextResponse.json(lead, { status: 201 })
    }

    // Session and legacy-key paths — contract unchanged from before Phase 2.
    const lead = await createLead(body)
    return NextResponse.json(lead, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
