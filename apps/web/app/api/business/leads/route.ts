/**
 * GET  /api/business/leads?project_id=&status=&limit=   — lista leads (inloggad)
 * POST /api/business/leads                              — skapa lead
 *
 * Body (POST): { project_id | project_slug, name?, email?, source?, status?, value_sek? }
 *
 * ── TWO AUTH CLASSES, TWO BODY CONTRACTS (after Phase 4B3) ───────────────────
 *
 * A logged-in user, or a project credential holding `business.leads.create`.
 * The global `AIOPS_API_KEY` class is gone — 4B3 removed the last HTTP surface
 * that accepted it. A bearer token that is not in the `omn_` namespace is now
 * simply unauthenticated.
 *
 * The two remaining classes do NOT share a body contract, and the difference is
 * the point rather than an inconsistency.
 *
 * SESSION callers name their project (`QuickAdd` sends `project_id`), and that
 * name is authorized against the caller's own allow-list before any write. The
 * insert then uses the VERIFIED id, never the body value that was checked, so
 * the two cannot drift apart.
 *
 * CREDENTIAL callers do not name a project at all. It comes from the credential
 * row and from nowhere else, and naming one in the body is refused outright
 * rather than compared. Presence is the refusal because a comparison is one
 * `??` away from becoming a fallback, and because a caller supplying a project
 * id has misunderstood what the credential is — saying so beats silently
 * ignoring it.
 */
import { NextResponse } from 'next/server'
import { resolveLeadsAuth, resolveSessionLeadProject } from '@/lib/business/leads-auth'
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

/**
 * Lead fields a SESSION caller may supply.
 *
 * Identical to the credential list, and for the same reason: the project is
 * decided before this runs and is written from the verified id, so a body key
 * naming a project must not be able to ride along into the insert. Picking
 * rather than spreading is what makes that structural — `createLead` can only
 * ever receive the project this route authorized.
 */
const SESSION_LEAD_FIELDS = CREDENTIAL_LEAD_FIELDS

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

    if (auth.auth.kind === 'user') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
          { error: 'invalid_request', detail: 'body_must_be_object' },
          { status: 400 },
        )
      }
      // LEADS_SESSION_PROJECT_SCOPE: authenticate is not authorize. The project
      // the caller named is checked against their own allow-list BEFORE any
      // write, and the insert then uses the verified id — never the body value
      // that was checked, so the two cannot drift apart.
      const project = await resolveSessionLeadProject(body as Record<string, unknown>, auth.auth.userId)
      if (!project.ok) return project.response

      const input: LeadInput = { project_id: project.projectId }
      for (const field of SESSION_LEAD_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          (input as Record<string, unknown>)[field] = body[field]
        }
      }
      const lead = await createLead(input)
      return NextResponse.json(lead, { status: 201 })
    }

    // Unreachable: `LeadsAuth` has exactly the two kinds handled above, and the
    // assignment below fails to compile if a third is ever added without a
    // branch here. The runtime 401 is not redundant with that check — the build
    // ignores type errors, so a compile-time proof alone would let a new auth
    // class fall through to whatever came next. Denying is the safe direction;
    // this is where a write used to live.
    const unhandled: never = auth.auth
    void unhandled
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
