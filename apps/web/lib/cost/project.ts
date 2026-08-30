/**
 * lib/cost/project.ts — resolve the project a billable call belongs to.
 *
 * Extracted so the budget gate and the cost logger agree on which project is
 * charged. `track.ts` kept this private, which was fine while cost was only ever
 * recorded; once spend can be REFUSED, the gate and the ledger disagreeing about
 * the project would mean charging one budget and checking another.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_MEDIA_SLUG = 'ai-media-automation'

const cache = new Map<string, string | null>()

/** Never throws: an unresolvable project yields null and the caller decides. */
export async function resolveCostProjectId(slug: string = DEFAULT_MEDIA_SLUG): Promise<string | null> {
  if (cache.has(slug)) return cache.get(slug) ?? null
  try {
    const db = createAdminClient()
    const { data } = await db.from('projects').select('id').eq('slug', slug).limit(1).maybeSingle()
    const id = data?.id ?? null
    cache.set(slug, id)
    return id
  } catch {
    return null
  }
}
