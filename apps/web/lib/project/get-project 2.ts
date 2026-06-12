import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ProjectSettings } from './media-settings'

export type ResolvedProject = {
  id: string
  name: string
  slug: string
  color: string
  settings: ProjectSettings
}

/**
 * Resolve a project by slug, once per request.
 *
 * Wrapped in React `cache()` so the `[slug]` layout and every child page that
 * call it within the same request share a single DB round-trip — the project
 * is resolved once and reused. Uses the RLS-respecting server client, so the
 * database enforces tenant access as a backstop (not just app-level filters).
 *
 * Returns `null` when the slug doesn't resolve (caller decides on notFound()).
 */
export const getProjectBySlug = cache(async (slug: string): Promise<ResolvedProject | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug, color, settings')
    .eq('slug', slug)
    .single()

  if (!data) return null

  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    color: (data.color as string) ?? '#6366f1',
    settings: ((data.settings as ProjectSettings | null) ?? {}) as ProjectSettings,
  }
})
