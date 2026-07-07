export const STAGE1_THE_PROMPT_SEED_ACTION = 'seed_the_prompt_brand'

export type Stage1MemoryAction = typeof STAGE1_THE_PROMPT_SEED_ACTION

export interface MemoryPatternPostFields {
  action: string
  projectId: string
}

export interface SeedProjectCandidate {
  name?: string | null
  slug?: string | null
}

export interface ManagerEvaluationInput {
  score: number
  approved: boolean
  issues?: string[]
  feedback?: string
}

export interface ManagerEvaluationContext {
  projectId: string
  contentPreview?: string | null
  contentType?: 'script' | 'hook' | 'caption' | 'image_prompt' | 'news' | 'text'
}

export function normalizeMemoryPatternPostFields(input: {
  action?: unknown
  projectId?: unknown
}): MemoryPatternPostFields {
  return {
    action: typeof input.action === 'string' ? input.action.trim() : '',
    projectId: typeof input.projectId === 'string' ? input.projectId.trim() : '',
  }
}

export function validateMemoryPatternPostFields(fields: MemoryPatternPostFields):
  | { ok: true; action: Stage1MemoryAction; projectId: string }
  | { ok: false; status: 400; error: string } {
  if (!fields.projectId) {
    return { ok: false, status: 400, error: 'projectId is required' }
  }

  if (fields.action !== STAGE1_THE_PROMPT_SEED_ACTION) {
    return {
      ok: false,
      status: 400,
      error: `Unknown action. Use: ${STAGE1_THE_PROMPT_SEED_ACTION}`,
    }
  }

  return { ok: true, action: fields.action, projectId: fields.projectId }
}

export function isThePromptSeedProject(project: SeedProjectCandidate): boolean {
  const slug = (project.slug ?? '').toLowerCase()
  const name = (project.name ?? '').toLowerCase()

  return slug === 'the-prompt' ||
    slug.includes('the-prompt') ||
    name === 'the prompt' ||
    name.includes('the prompt')
}

export function toCanonicalManagerEvaluationRecord(
  evaluation: ManagerEvaluationInput,
  context: ManagerEvaluationContext,
) {
  const overallScore = Math.max(0, Math.min(10, Math.round(evaluation.score) / 10))

  return {
    project_id: context.projectId,
    content_type: context.contentType ?? 'text',
    output_id: null,
    script_id: null,
    hook_strength: null,
    slop_score: null,
    brand_alignment: null,
    specificity: null,
    pacing_quality: null,
    overall_score: overallScore,
    passed: Boolean(evaluation.approved),
    hard_fails: [],
    soft_fails: evaluation.approved ? [] : (evaluation.issues ?? []),
    pass_signals: evaluation.approved ? ['Manager approved'] : [],
    slop_phrases: [],
    issues: (evaluation.issues ?? []).map(detail => ({
      dimension: 'manager',
      detail,
    })),
    suggestion: evaluation.feedback ?? null,
    content_preview: context.contentPreview?.slice(0, 300) ?? null,
  }
}

export function createMemoryLifecycleAuditEvent(input: {
  action: 'tombstoned' | 'corrected' | 'inactive'
  actorId: string
  reason?: string
  at?: string
}) {
  return {
    action: input.action,
    actor_id: input.actorId,
    reason: input.reason ?? 'human_correction',
    at: input.at ?? new Date().toISOString(),
  }
}
