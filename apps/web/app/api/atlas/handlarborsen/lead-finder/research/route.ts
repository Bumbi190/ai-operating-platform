import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { leadFinderResearchApi } from '@/lib/handlarborsen/lead-finder/research-api'
import { makeTavilyResearchAdapter } from '@/lib/handlarborsen/lead-finder/tavily-research-adapter'
import { makeTavilyVerifiedResearchAdapter } from '@/lib/handlarborsen/lead-finder/tavily-extract-research'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Five sequential bounded searches can exceed legacy function defaults.
export const maxDuration = 60

export async function POST(request: Request) {
  return leadFinderResearchApi(request, {
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
    getAdapter: () => process.env.HB_LEADFINDER_EXTRACT_ENABLED === 'true'
      ? makeTavilyVerifiedResearchAdapter({
          key: process.env.TAVILY_API_KEY,
          fetchImpl: fetch,
          extractApproved: true,
        })
      : makeTavilyResearchAdapter({ key: process.env.TAVILY_API_KEY, fetchImpl: fetch }),
  })
}
