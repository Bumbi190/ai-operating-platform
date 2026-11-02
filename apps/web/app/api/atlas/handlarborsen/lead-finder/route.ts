import { resolveProjectAccess } from '@/lib/auth/project-access'
import { leadFinderReadinessApi } from '@/lib/handlarborsen/lead-finder/api'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return leadFinderReadinessApi(request, {
    resolveAccess: async () => {
      const access = await resolveProjectAccess()
      if (!access.ok) return { ok: false, status: access.response.status === 401 ? 401 : 403 }
      return { ok: true, userId: access.userId, allowedProjectIds: access.allowedProjectIds }
    },
  })
}
