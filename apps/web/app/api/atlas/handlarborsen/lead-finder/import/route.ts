import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { leadFinderImportApi, type ImportWriter } from '@/lib/handlarborsen/lead-finder/import-api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// hb_lead_candidates is not in generated types yet (migration is unapplied).
interface LooseTable {
  select(cols: string, opts: { count: 'exact'; head: true }): { eq(c: string, v: string): PromiseLike<{ count: number | null; error: unknown }> }
  insert(rows: unknown[]): PromiseLike<{ error: unknown }>
}
const writer = (): ImportWriter => {
  const table = () => (createAdminClient() as unknown as { from(t: 'hb_lead_candidates'): LooseTable }).from('hb_lead_candidates')
  return {
    async countCandidates(projectId) {
      const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('project_id', projectId)
      return { count: error ? null : count, failed: !!error }
    },
    async insertCandidates(rows) {
      const { error } = await table().insert(rows)
      return { failed: !!error }
    },
  }
}

export async function POST(request: Request) {
  return leadFinderImportApi(request, {
    env: process.env,
    getUser: async () => {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.getUser()
      return error || !data.user ? null : { id: data.user.id }
    },
    loadProject: async userId => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('projects')
        .select('id, slug, name, owner_id, execution_paused')
        .eq('id', HANDLARBORSEN_PROJECT_ID)
        .eq('owner_id', userId)
        .maybeSingle()
      if (error) throw new Error('project_read_failed')
      if (!data) return null
      return {
        id: data.id as string, slug: data.slug as string, name: data.name as string,
        owner_id: data.owner_id as string, executionPaused: data.execution_paused !== false,
      }
    },
    isHandlarborsenProject,
    getWriter: writer,
  })
}
