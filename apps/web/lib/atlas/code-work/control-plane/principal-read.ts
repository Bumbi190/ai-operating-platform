/** Principal-scoped server read; project authority is proven before table access. */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createCodeWorkControlPlaneStore, type CodeWorkControlPlaneStore } from './store'
import type { StoredCodeWorkRun } from './types'

export type CodeWorkReadStatus = 'ok' | 'no_principal' | 'not_permitted' | 'unavailable'

export async function readCodeWorkRun(
  projectId: string,
  workId: string,
  options: { store?: CodeWorkControlPlaneStore } = {},
): Promise<{ run: StoredCodeWorkRun | null; status: CodeWorkReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { run: null, status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return { run: null, status: 'not_permitted' }
  }
  try {
    const run = await (options.store ?? createCodeWorkControlPlaneStore())
      .byProjectAndWorkId(projectId, workId)
    return run ? { run, status: 'ok' } : { run: null, status: 'not_permitted' }
  } catch {
    return { run: null, status: 'unavailable' }
  }
}
