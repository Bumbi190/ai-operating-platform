import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { loadSavedCandidates, type SavedCandidates } from './saved-candidates'

/** Candidate table migrated on 2026-10-28. Reads remain OFF by default until reviewed import. */
export async function loadSavedCandidatesForOwner(projectId: string): Promise<SavedCandidates> {
  const enabled = process.env.HB_LEADFINDER_CANDIDATE_READ_ENABLED === 'true'
  return loadSavedCandidates(projectId, enabled, async (verifiedProjectId, limit) => {
    if (verifiedProjectId !== HANDLARBORSEN_PROJECT_ID) throw new Error('wrong_project')
    // Schema and RLS are now live; generated Database types still predate
    // this migration. Reads stay gated until an explicitly reviewed import.
    const db = await createClient()
    const reader = db as unknown as {
      from(table: 'hb_lead_candidates'): {
        select(fields: string): {
          eq(column: 'project_id', value: string): {
            order(column: 'name', opts: { ascending: boolean }): {
              limit(max: number): Promise<{ data: unknown; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await reader.from('hb_lead_candidates')
      .select('id,project_id,name,orgnr,city,county_code,score,status,exclusions,sni_codes,scb_status_code,legal_form_code,reklam_code,epost_code,telefon_code,prior_contact,history_coverage,contactability,outreach_ready,provenance')
      .eq('project_id', verifiedProjectId)
      .order('name', { ascending: true })
      .limit(limit)
    return { data, error }
  })
}
