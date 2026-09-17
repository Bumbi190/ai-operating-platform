import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getMemory, type MemoryItem } from '@/lib/ai/memory/memory-store'
import { getRecentFeedback, type FeedbackRecord } from '@/lib/ai/memory/feedback-store'
import {
  MEMORY_CATEGORY_LABELS,
  MEMORY_FEEDBACK_LIMIT,
  type MemoryFeedbackItem,
  type MemoryProject,
  type MemoryRead,
  type MemoryRule,
  type MemoryViewModel,
  type MemoryViewState,
} from './memory-shared'

/**
 * Minne vNext — a deliberately small read model over the two approved legacy
 * sources. It is not an Atlas M4 projection and never calls atlas_recall.
 *
 * The ownership gate always runs first on the session-bound Supabase client.
 * Only an explicitly selected project from that result may reach the existing
 * service-role helpers, and both helpers receive that one verified id.
 */

interface RawProject {
  id?: string | null
  name?: string | null
  slug?: string | null
  color?: string | null
}

interface MemoryLoaderDeps {
  createUserClient: typeof createClient
  readRules: typeof getMemory
  readFeedback: typeof getRecentFeedback
}

const DEFAULT_DEPS: MemoryLoaderDeps = {
  createUserClient: createClient,
  readRules: getMemory,
  readFeedback: getRecentFeedback,
}

const NOT_REQUESTED: MemoryRead<never> = { state: 'not_requested', items: [] }

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toProject(raw: RawProject): MemoryProject | null {
  const id = text(raw.id)
  const name = text(raw.name)
  const slug = text(raw.slug)
  if (!id || !name || !slug) return null
  return { id, name, slug, color: text(raw.color) ?? '#64748b' }
}

const DETAIL_FIELDS: ReadonlyArray<[string, string]> = [
  ['example', 'Exempel'],
  ['pattern', 'Lagrade mönstret'],
  ['source', 'Lagrad källa'],
  ['last_rejection', 'Senaste avvisning'],
]

export function toMemoryRule(item: MemoryItem): MemoryRule {
  const note = text(item.value.note)
  const details = DETAIL_FIELDS.flatMap(([key, label]) => {
    const value = item.value[key]
    if (typeof value === 'string' && value.trim() !== '') return [{ label, value: value.trim() }]
    if (typeof value === 'number' || typeof value === 'boolean') return [{ label, value: String(value) }]
    return []
  })

  return {
    id: item.id,
    category: item.category,
    categoryLabel: MEMORY_CATEGORY_LABELS[item.category],
    key: item.key,
    note,
    details,
    confidence: finite(item.confidence),
    evidenceCount: finite(item.evidenceCount),
    lastSeenAt: text(item.lastSeenAt),
  }
}

function toFeedback(item: FeedbackRecord): MemoryFeedbackItem {
  return {
    id: item.id,
    outputType: item.outputType,
    decision: item.decision,
    rejectionReason: item.rejectionReason,
    revisionNotes: item.revisionNotes,
    qualityPatterns: item.qualityPatterns,
    contentExcerpt: item.contentExcerpt,
    evalScore: finite(item.evalScore),
    createdAt: item.createdAt,
  }
}

function baseModel(
  state: MemoryViewState,
  projects: MemoryProject[],
  requestedProjectSlug: string | null,
): MemoryViewModel {
  return {
    state,
    projects,
    requestedProjectSlug,
    selectedProject: null,
    rules: NOT_REQUESTED,
    feedback: NOT_REQUESTED,
    feedbackLimit: MEMORY_FEEDBACK_LIMIT,
  }
}

export async function loadMemoryView(
  { projectSlug }: { projectSlug: string | null },
  deps: MemoryLoaderDeps = DEFAULT_DEPS,
): Promise<MemoryViewModel | null> {
  const supabase = await deps.createUserClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null

  // RLS is the authority. This list contains only projects the session owns.
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, slug, color')
    .order('name', { ascending: true })

  if (error) return baseModel('project_error', [], projectSlug)

  const projects = ((data ?? []) as RawProject[])
    .map(toProject)
    .filter((project): project is MemoryProject => project !== null)

  // No project choice means no project-bound read — even when there is only one.
  if (!projectSlug) return baseModel('choose_project', projects, null)

  const selectedProject = projects.find((project) => project.slug === projectSlug) ?? null
  // Unknown and foreign slugs are deliberately indistinguishable and fail closed.
  if (!selectedProject) return baseModel('project_not_found', projects, projectSlug)

  const [rulesResult, feedbackResult] = await Promise.allSettled([
    deps.readRules(selectedProject.id),
    deps.readFeedback(selectedProject.id, MEMORY_FEEDBACK_LIMIT),
  ])

  return {
    state: 'ready',
    projects,
    requestedProjectSlug: projectSlug,
    selectedProject,
    rules: rulesResult.status === 'fulfilled'
      ? { state: 'ok', items: rulesResult.value.map(toMemoryRule) }
      : { state: 'error', items: [] },
    feedback: feedbackResult.status === 'fulfilled'
      ? { state: 'ok', items: feedbackResult.value.map(toFeedback) }
      : { state: 'error', items: [] },
    feedbackLimit: MEMORY_FEEDBACK_LIMIT,
  }
}
