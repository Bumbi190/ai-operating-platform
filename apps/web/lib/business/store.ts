/**
 * lib/business/store.ts
 *
 * Skriv-sidan för verksamhetsdata: leads, kampanjer och intäkter.
 *
 * Det här är lagret som FYLLER tabellerna som dashboardens BusinessCard läser
 * (se lib/os/business.ts). Pipelines, cron-jobb, agenter och externa webhooks
 * (t.ex. Stripe) anropar dessa funktioner — direkt i Next, eller via
 * /api/business/* med en API-nyckel.
 *
 * Varje funktion är självförsörjande (skapar egen admin-klient) så anropare
 * slipper hantera Supabase-detaljer.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyProjectScope } from '@/lib/atlas/isolation'

// ─── Projektupplösning ────────────────────────────────────────────────────────
// Anropare får ange antingen project_id (uuid) eller project_slug (t.ex. "gainpilot").

interface ProjectRef {
  project_id?: string | null
  project_slug?: string | null
}

async function resolveProjectId(db: ReturnType<typeof createAdminClient>, ref: ProjectRef): Promise<string | null> {
  if (ref.project_id) return ref.project_id
  if (ref.project_slug) {
    const { data } = await (db.from('projects') as any)
      .select('id').eq('slug', ref.project_slug).maybeSingle()
    return data?.id ?? null
  }
  return null
}

class BusinessError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export { BusinessError }

// ─── Leads ──────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'qualified' | 'converted' | 'lost'

export interface LeadInput extends ProjectRef {
  name?:    string | null
  email?:   string | null
  source?:  string | null
  status?:  LeadStatus
  value_sek?: number | null
}

export async function createLead(input: LeadInput) {
  const db = createAdminClient()
  const projectId = await resolveProjectId(db, input)
  if (!projectId) throw new BusinessError('Okänt projekt — ange project_id eller giltig project_slug')

  const { data, error } = await (db.from('leads') as any).insert({
    project_id: projectId,
    name:       input.name ?? null,
    email:      input.email ?? null,
    source:     input.source ?? null,
    status:     input.status ?? 'new',
    value_sek:  input.value_sek ?? null,
  }).select().single()

  if (error) throw new BusinessError(error.message, 500)
  return data
}

/**
 * List leads within an explicit project allow-list.
 *
 * `allowedProjectIds` is REQUIRED, not optional. After 4B3 there is no
 * legitimate global read path to this table — the one production caller is the
 * session-scoped GET route — so `undefined = unscoped` would be a footgun with
 * nothing left to justify it. Making it required means a future caller cannot
 * read every tenant's leads by simply forgetting an argument; it has to be
 * written on purpose.
 *
 * An explicit `project_id` NARROWS within the allow-list and can never widen
 * it: the scope predicate is applied independently, so naming a foreign
 * project yields no rows rather than that project's rows.
 */
export async function listLeads(opts: {
  project_id?: string
  status?: LeadStatus
  limit?: number
  allowedProjectIds: string[]
}) {
  const db = createAdminClient()
  let q = (db.from('leads') as any).select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 100)
  // Scoped at the query boundary, never by post-filtering a service-role read.
  // An empty allow-list becomes the impossible id, so it yields zero rows
  // rather than every row.
  q = applyProjectScope(q, opts.allowedProjectIds)
  if (opts.project_id) q = q.eq('project_id', opts.project_id)
  if (opts.status)     q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new BusinessError(error.message, 500)
  return data ?? []
}

// ─── Kampanjer ────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended'

export interface CampaignInput extends ProjectRef {
  name:     string
  channel?: string | null
  status?:  CampaignStatus
  started_at?: string | null
  ended_at?:   string | null
}

export async function createCampaign(input: CampaignInput) {
  const db = createAdminClient()
  const projectId = await resolveProjectId(db, input)
  if (!projectId) throw new BusinessError('Okänt projekt — ange project_id eller giltig project_slug')
  if (!input.name) throw new BusinessError('name krävs')

  const { data, error } = await (db.from('campaigns') as any).insert({
    project_id: projectId,
    name:       input.name,
    channel:    input.channel ?? null,
    status:     input.status ?? 'active',
    started_at: input.started_at ?? (input.status === 'active' ? new Date().toISOString() : null),
    ended_at:   input.ended_at ?? null,
  }).select().single()

  if (error) throw new BusinessError(error.message, 500)
  return data
}

/**
 * `allowedProjectIds` scopes the UPDATE itself at the database boundary.
 *
 *  - `undefined` → unscoped, the pre-existing behaviour for legacy callers.
 *  - `string[]`  → the row must also live in one of those projects; an EMPTY
 *                  array yields an impossible id and therefore no row.
 *
 * Selecting a campaign by `id` alone was the hole: knowing an id was enough to
 * update another tenant's campaign. Scoping the write, rather than checking a
 * caller-supplied project first, means the row that gets updated is the row
 * that was authorized — the two cannot disagree.
 */
export async function updateCampaign(
  id: string,
  patch: Partial<Pick<CampaignInput, 'name' | 'channel' | 'status' | 'started_at' | 'ended_at'>>,
  allowedProjectIds?: string[],
) {
  const db = createAdminClient()
  const update: Record<string, unknown> = { ...patch }
  if (patch.status === 'ended' && !patch.ended_at) update.ended_at = new Date().toISOString()
  const q = applyProjectScope(
    (db.from('campaigns') as any).update(update).eq('id', id),
    allowedProjectIds,
  )
  const { data, error } = await q.select().maybeSingle()
  if (error) throw new BusinessError(error.message, 500)
  if (!data) throw new BusinessError('Kampanjen finns inte', 404)
  return data
}

export async function listCampaigns(opts: { project_id?: string; status?: CampaignStatus; limit?: number; allowedProjectIds?: string[] } = {}) {
  const db = createAdminClient()
  let q = (db.from('campaigns') as any).select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 100)
  // Scoped at the query boundary, never by post-filtering a service-role read.
  q = applyProjectScope(q, opts.allowedProjectIds)
  if (opts.project_id) q = q.eq('project_id', opts.project_id)
  if (opts.status)     q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) throw new BusinessError(error.message, 500)
  return data ?? []
}

// ─── Intäkter ─────────────────────────────────────────────────────────────────

export interface RevenueInput extends ProjectRef {
  amount_sek:   number
  currency?:    string
  source?:      string | null      // t.ex. 'stripe', 'manual', 'instagram'
  description?: string | null
  occurred_at?: string | null
}

export async function logRevenue(input: RevenueInput) {
  const db = createAdminClient()
  const projectId = await resolveProjectId(db, input)
  if (!projectId) throw new BusinessError('Okänt projekt — ange project_id eller giltig project_slug')
  if (typeof input.amount_sek !== 'number' || Number.isNaN(input.amount_sek)) {
    throw new BusinessError('amount_sek måste vara ett tal')
  }

  const { data, error } = await (db.from('revenue_events') as any).insert({
    project_id:  projectId,
    amount_sek:  input.amount_sek,
    currency:    input.currency ?? 'SEK',
    source:      input.source ?? 'manual',
    description: input.description ?? null,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  }).select().single()

  if (error) throw new BusinessError(error.message, 500)
  return data
}

export async function listRevenue(opts: { project_id?: string; sinceISO?: string; limit?: number; allowedProjectIds?: string[] } = {}) {
  const db = createAdminClient()
  let q = (db.from('revenue_events') as any).select('*').order('occurred_at', { ascending: false }).limit(opts.limit ?? 200)
  // Scoped at the query boundary, never by post-filtering a service-role read.
  q = applyProjectScope(q, opts.allowedProjectIds)
  if (opts.project_id) q = q.eq('project_id', opts.project_id)
  if (opts.sinceISO)   q = q.gte('occurred_at', opts.sinceISO)
  const { data, error } = await q
  if (error) throw new BusinessError(error.message, 500)
  return data ?? []
}
