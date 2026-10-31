import 'server-only'

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { salesEnabled } from '@/lib/sales/feature'
import { readReplyDrafts } from '@/lib/sales/replies/store'

export const dynamic = 'force-dynamic'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

/**
 * Nova's pending-review signal, based entirely on existing owner-gated draft
 * metadata. NEVER serialize bodies, addresses, subjects, contact IDs, or jobs.
 * A reminder is not an approval and must not create any send authority.
 */
export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok || !access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID)
      || !salesEnabled(HANDLARBORSEN_PROJECT_ID)) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  try {
    // Service-role construction is after the session + owner allowlist gate.
    // The existing SQL reader independently repeats project-owner validation.
    const model = await readReplyDrafts(createAdminClient(), access, {
      projectId: HANDLARBORSEN_PROJECT_ID,
    })
    const jobs = new Map(model.jobs.map(job => [job.id, job]))
    const approvalIds = model.drafts
      .filter(draft => {
        const job = jobs.get(draft.jobId)
        return !!job && draft.current && draft.status === 'pending'
          && !!draft.approvalId && draft.questions.length === 0
          && job.sourceCurrent && !job.newerIncoming
          && !['failed', 'cancelled', 'reconciling'].includes(job.status)
      })
      .map(draft => draft.approvalId!)
      .filter((id, index, all) => all.indexOf(id) === index)

    return Response.json({
      state: 'ok', pendingCount: approvalIds.length, approvalIds,
      mayHaveMore: model.jobs.length >= 50,
    }, { headers: privateHeaders })
  } catch {
    return Response.json({ state: 'unavailable' }, {
      status: 503, headers: privateHeaders,
    })
  }
}
