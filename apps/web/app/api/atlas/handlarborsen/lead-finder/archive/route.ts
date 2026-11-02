import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { leadFinderResearchArchiveApi } from '@/lib/handlarborsen/lead-finder/research-archive-api'
import { loadKnownContactsForOwner } from '@/lib/handlarborsen/lead-finder/known-contacts-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Owner-only, Preview-only, manual snapshot upload. Never CRM or send. */
export async function POST(request: Request) {
  return leadFinderResearchArchiveApi(request, {
    env: process.env,
    getUser: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return error || !data.user ? null : { id: data.user.id }
    },
    loadProject: async userId => {
      const db = await createClient()
      const { data, error } = await db.from('projects')
        .select('id,slug,name,owner_id,execution_paused')
        .eq('id', HANDLARBORSEN_PROJECT_ID)
        .eq('owner_id', userId).maybeSingle()
      if (error) throw Error('project_read_failed')
      return data ? {
        id: data.id, slug: data.slug, name: data.name,
        owner_id: data.owner_id, executionPaused: data.execution_paused !== false,
      } : null
    },
    isHandlarborsenProject,
    getKnownContacts: () => loadKnownContactsForOwner(HANDLARBORSEN_PROJECT_ID),
    readExisting: async digest => {
      const db = await createClient()
      // This table is not yet in the old generated DB type. RLS still applies.
      const { data, error } = await (db as unknown as {from(table: string): any}).from('hb_lead_research_archives')
        .select('id').eq('project_id', HANDLARBORSEN_PROJECT_ID)
        .eq('snapshot_sha256', digest).limit(1)
      return { exists: Array.isArray(data) && data.length > 0, failed: !!error }
    },
    save: async record => {
      const db = await createClient()
      const { error } = await (db as unknown as {from(table: string): any}).from('hb_lead_research_archives').insert(record)
      return { failed: !!error }
    },
  })
}
