import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectBySlug } from '@/lib/project/get-project'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { EVIDENCE } from './handlarborsen-competitors'
import { scanPublicSources } from './handlarborsen-competitors-scan'
import type { CompetitorHistory, CompetitorObservation } from './handlarborsen-competitor-history'

const TABLE = 'handlarborsen_competitor_observations'
const COLUMNS = 'source_id, observed_on, checked_at, status, title'

async function authorizedDb() {
  const project = await getProjectBySlug('handlarborsen')
  if (!project || !isHandlarborsenProject(project)) return null
  return createAdminClient()
}

/** Fixed project, inclusive UTC window of 30 days, at most 3 * 30 rows. */
async function readHistory(db: ReturnType<typeof createAdminClient>, now: Date): Promise<CompetitorHistory> {
  const today = now.toISOString().slice(0, 10)
  const start = new Date(`${today}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 29)
  // This unapplied table is not yet present in the generated database types.
  const { data, error } = await (db as any).from(TABLE).select(COLUMNS)
    .eq('project_id', HANDLARBORSEN_PROJECT_ID)
    .gte('observed_on', start.toISOString().slice(0, 10)).lte('observed_on', today)
    .order('observed_on', { ascending: false }).order('source_id', { ascending: true }).limit(90)
  if (error || !Array.isArray(data)) return { status: 'read_failed' }
  return { status: 'ok', observations: data as CompetitorObservation[] }
}

export async function loadCompetitorHistory(): Promise<CompetitorHistory> {
  try {
    const db = await authorizedDb()
    return db ? await readHistory(db, new Date()) : { status: 'not_permitted' }
  } catch { return { status: 'read_failed' } }
}

/** Only invoked by the guarded manual POST. No caller-controlled target or scan input. */
export async function saveManualCompetitorScan(): Promise<'saved' | 'already_saved' | 'not_permitted' | 'read_failed' | 'write_failed'> {
  let networkStarted = false
  try {
    const db = await authorizedDb()
    if (!db) return 'not_permitted'
    const now = new Date(), today = now.toISOString().slice(0, 10)
    const history = await readHistory(db, now)
    if (history.status !== 'ok') return 'read_failed'
    const existing = new Set(history.observations.filter(row => row.observed_on === today).map(row => row.source_id))
    if (EVIDENCE.every(source => existing.has(source.id))) return 'already_saved'
    networkStarted = true
    const scan = await scanPublicSources()
    const rows = EVIDENCE.map(source => {
      const check = scan.sources.find(item => item.id === source.id)!
      // Keep the actual per-source check time and its UTC date, including midnight crossings.
      const checkedAt = check.checked_at
      const title = check.status === 'metadata_checked' ? check.title : null
      return { project_id: HANDLARBORSEN_PROJECT_ID, source_id: source.id,
        observed_on: checkedAt.slice(0, 10), checked_at: checkedAt, status: check.status, title,
        title_digest: title ? createHash('sha256').update(title, 'utf8').digest('hex') : null }
    }).filter(row => !history.observations.some(saved => saved.source_id === row.source_id && saved.observed_on === row.observed_on))
    if (!rows.length) return 'already_saved'
    // Supabase emits INSERT ON CONFLICT DO NOTHING; first observation is never overwritten.
    const { error } = await (db as any).from(TABLE).upsert(rows, {
      onConflict: 'project_id,source_id,observed_on', ignoreDuplicates: true,
    })
    return error ? 'write_failed' : 'saved'
  } catch { return networkStarted ? 'write_failed' : 'read_failed' }
}
