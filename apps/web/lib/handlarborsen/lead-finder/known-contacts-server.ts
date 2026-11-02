import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { loadKnownContacts, type KnownContacts } from './known-contacts'

/**
 * Called only AFTER the page resolved the project via RLS. Uses the ordinary
 * session-scoped Supabase client, NEVER createAdminClient/service-role.
 * Even when enabled, a project_id filter bounds every read.
 */
export async function loadKnownContactsForOwner(projectId: string): Promise<KnownContacts> {
  const enabled = process.env.HB_LEADFINDER_CONTACT_READ_ENABLED === 'true'
  return loadKnownContacts(projectId, enabled, async (verifiedProjectId, limit) => {
    if (verifiedProjectId !== HANDLARBORSEN_PROJECT_ID) {
      throw new Error('wrong_project')
    }
    // sales_contacts exists in migration 20261017100633 but is not yet in
    // the repo's older generated Database type. Keep this narrow and read-only.
    const db = await createClient()
    const reader = db as unknown as {
      from(table: 'sales_contacts'): {
        select(fields: 'project_id,data'): {
          eq(column: 'project_id', value: string): {
            limit(max: number): Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await reader.from('sales_contacts')
      .select('project_id,data')
      .eq('project_id', verifiedProjectId)
      .limit(limit)
    return { data, error }
  })
}
