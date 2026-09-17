import type { FeedbackRecord } from '@/lib/ai/memory/feedback-store'
import type { MemoryCategory } from '@/lib/ai/memory/memory-store'

/** Serializable contract shared by the Minne server loader and client view. */

export const MEMORY_FEEDBACK_LIMIT = 15

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  hook_patterns: 'Hook-mönster',
  avoided_phrases: 'Undvikta fraser',
  brand_voice: 'Varumärkesröst',
  content_patterns: 'Innehållsmönster',
  rejection_triggers: 'Avvisningsorsaker',
}

export interface MemoryProject {
  id: string
  name: string
  slug: string
  color: string
}

export interface MemoryRuleDetail {
  label: string
  value: string
}

export interface MemoryRule {
  id: string
  category: MemoryCategory
  categoryLabel: string
  key: string
  note: string | null
  details: MemoryRuleDetail[]
  confidence: number | null
  evidenceCount: number | null
  lastSeenAt: string | null
}

export interface MemoryFeedbackItem {
  id: string
  outputType: string
  decision: FeedbackRecord['decision']
  rejectionReason: string | null
  revisionNotes: string | null
  qualityPatterns: string[]
  contentExcerpt: string | null
  evalScore: number | null
  createdAt: string
}

export type MemoryRead<T> =
  | { state: 'ok'; items: T[] }
  | { state: 'error'; items: T[] }
  | { state: 'not_requested'; items: T[] }

export type MemoryViewState =
  | 'choose_project'
  | 'project_not_found'
  | 'project_error'
  | 'ready'

export interface MemoryViewModel {
  state: MemoryViewState
  projects: MemoryProject[]
  requestedProjectSlug: string | null
  selectedProject: MemoryProject | null
  rules: MemoryRead<MemoryRule>
  feedback: MemoryRead<MemoryFeedbackItem>
  feedbackLimit: number
}
