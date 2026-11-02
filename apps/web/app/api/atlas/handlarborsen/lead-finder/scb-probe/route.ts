import { resolveProjectAccess } from '@/lib/auth/project-access'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { loadKnownContactsForOwner } from '@/lib/handlarborsen/lead-finder/known-contacts-server'
import { leadFinderScbProbeApi } from '@/lib/handlarborsen/lead-finder/scb-probe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return leadFinderScbProbeApi(request, {
    env: process.env,
    resolveAccess: async () => {
      const access = await resolveProjectAccess()
      if (!access.ok) return { ok: false, status: access.response.status === 401 ? 401 : 403 }
      return { ok: true, userId: access.userId, allowedProjectIds: access.allowedProjectIds }
    },
    loadKnownContacts: () => loadKnownContactsForOwner(HANDLARBORSEN_PROJECT_ID),
  })
}
