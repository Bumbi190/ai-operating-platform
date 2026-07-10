import { Anthropic } from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { toJson } from '@/lib/supabase/json'
import { EDITORIAL_DUPLICATE_FRESHNESS_REVIEWER_PROMPT } from '@/lib/media/agents'

export const EDITORIAL_DUPLICATE_REVIEWER = 'Editorial Duplicate & Freshness Reviewer'

export type NoveltyVerdict =
  | { verdict: 'new'; confidence: number; matchedItemIds: string[]; reasoning: string }
  | { verdict: 'duplicate'; confidence: number; matchedItemIds: string[]; reasoning: string }
  | { verdict: 'material_update'; confidence: number; matchedItemIds: string[]; newFacts: string[]; reasoning: string }
  | { verdict: 'uncertain'; confidence: number; matchedItemIds: string[]; reasoning: string }

export type NoveltyOutcome =
  | 'novelty_passed'
  | 'duplicate_blocked'
  | 'material_update_pending'
  | 'uncertain_requires_review'

export interface NewsCandidateInput {
  project_id: string
  title: string
  summary?: string | null
  url?: string | null
  source_name?: string | null
  target_audience?: string | null
  content_angle?: string | null
  virality_score?: number | null
  key_insight?: string | null
  raw_output?: Record<string, unknown> | null
  run_id?: string | null
  source_item_id?: string | null
  source_published_at?: string | null
}

export interface PriorNewsEvidence {
  id: string
  title: string
  summary: string | null
  url: string | null
  source_name: string | null
  status: string | null
  canonical_url: string | null
  normalized_title: string | null
  event_fingerprint: string | null
  novelty_verdict: string | null
  novelty_reasoning: string | null
  created_at: string | null
  media_scripts?: Array<{
    id: string
    status: string | null
    hook: string | null
    script: string | null
    video_status: string | null
    voice_status: string | null
    published_at: string | null
  }>
}

export interface PersistNoveltyResult {
  status: NoveltyOutcome
  newsItemId: string
  verdict: NoveltyVerdict
  workflowRunId: string | null
}

export interface NoveltyReviewerOptions {
  workflowRunId?: string | null
  reviewer?: (input: {
    candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>
    priorItems: PriorNewsEvidence[]
  }) => Promise<unknown>
}

type NoveltyReviewRun = {
  id: string
  agent: {
    id: string
    name: string
    model: string | null
    system_prompt: string | null
  }
  workflow: {
    id: string
    name: string
  }
}

type CandidateIntakeRow = {
  news_item_id: string
  status: string
  novelty_claim_id: string | null
  novelty_claim_acquired: boolean
  novelty_verdict: string | null
  novelty_confidence: number | null
  novelty_matched_item_ids: string[] | null
  novelty_reasoning: string | null
  novelty_new_facts: string[] | null
  novelty_policy_outcome: NoveltyOutcome | null
  novelty_workflow_run_id: string | null
}

type StoredNoveltyRun = {
  id: string
  status: string
  context: Record<string, unknown> | null
}

type SimilaritySignal = {
  priorItemId: string
  titleScore: number
  fingerprintScore: number
  exactCanonicalUrl: boolean
  exactFingerprint: boolean
}

type NoveltyAuditEvidence = {
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>
  priorItems: Array<Pick<PriorNewsEvidence,
    'id' | 'title' | 'summary' | 'url' | 'source_name' | 'status' | 'canonical_url' | 'normalized_title' | 'event_fingerprint' | 'novelty_verdict' | 'created_at'
  > & { scriptStates: Array<{ id: string; status: string | null; voice_status: string | null; video_status: string | null; published_at: string | null }> }>
  similaritySignals: SimilaritySignal[]
}

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'fbclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'cmpid',
])

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'in', 'into', 'is', 'it', 'its', 'new', 'of', 'on', 'or', 'over',
  'says', 'the', 'their', 'this', 'to', 'with', 'will', 'just',
])

const KNOWN_ENTITIES = [
  'openai', 'anthropic', 'google', 'deepmind', 'gemini', 'claude', 'chatgpt',
  'gpt', 'meta', 'llama', 'mistral', 'nvidia', 'apple', 'microsoft', 'xai',
  'grok', 'perplexity', 'cursor', 'windsurf', 'huggingface', 'hugging face',
  'cohere', 'stability', 'groq',
]

export function canonicalizeUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null
  try {
    const url = new URL(rawUrl)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    const pathname = url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : ''
    const query = url.searchParams.toString()
    return `${url.protocol}//${url.hostname}${pathname}${query ? `?${query}` : ''}`.toLowerCase()
  } catch {
    return rawUrl.trim().toLowerCase()
  }
}

export function normalizeTitle(title: string): string {
  return tokenize(title).join(' ')
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

export function extractNamedEntities(text: string): string[] {
  const haystack = text.toLowerCase()
  const known = KNOWN_ENTITIES.filter(entity => haystack.includes(entity))
  const capitalized = Array.from(text.matchAll(/\b[A-Z][A-Za-z0-9.+-]{2,}(?:\s+[A-Z][A-Za-z0-9.+-]{2,})?\b/g))
    .map(m => m[0].toLowerCase())
    .filter(entity => !STOP_WORDS.has(entity))
  return Array.from(new Set([...known, ...capitalized])).slice(0, 12)
}

function centralClaim(title: string, summary?: string | null, keyInsight?: string | null): string[] {
  const words = tokenize([title, summary, keyInsight].filter(Boolean).join(' '))
  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 12)
}

export function createEventFingerprint(input: Pick<NewsCandidateInput, 'title' | 'summary' | 'key_insight'>): string {
  const entities = extractNamedEntities([input.title, input.summary, input.key_insight].filter(Boolean).join(' '))
    .map(e => e.replace(/\s+/g, '-'))
  const claim = centralClaim(input.title, input.summary, input.key_insight)
  return Array.from(new Set([...entities, ...claim])).slice(0, 18).join('|')
}

export function buildDeterministicNoveltyFields(input: NewsCandidateInput) {
  return {
    canonical_url: canonicalizeUrl(input.url),
    normalized_title: normalizeTitle(input.title),
    event_fingerprint: createEventFingerprint(input),
  }
}

export function candidateIdempotencyIdentity(input: NewsCandidateInput): string {
  const canonicalUrl = canonicalizeUrl(input.url)
  if (canonicalUrl) return `url:${canonicalUrl}`

  const sourceName = normalizeTitle(input.source_name ?? 'unknown-source') || 'unknown-source'
  const sourceItemId = input.source_item_id?.trim()
  if (sourceItemId) return `source-item:${sourceName}:${sourceItemId}`

  const publishedAt = input.source_published_at?.trim() || 'unknown-published-at'
  return `fallback:${sourceName}:${normalizeTitle(input.title)}:${publishedAt}`
}

export function candidateIdempotencyKey(input: NewsCandidateInput): string {
  const identity = candidateIdempotencyIdentity(input)
  const digest = createHash('sha256')
    .update(`media-candidate:v1:${input.project_id}:${identity}`)
    .digest('hex')
  return `media-candidate:v1:${digest}`
}

function jaccard(a: string, b: string): number {
  const left = new Set(a.split(/[|\s]+/).filter(Boolean))
  const right = new Set(b.split(/[|\s]+/).filter(Boolean))
  if (!left.size || !right.size) return 0
  const intersection = Array.from(left).filter(item => right.has(item)).length
  return intersection / (left.size + right.size - intersection)
}

function buildSimilaritySignals(
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>,
  priorItems: PriorNewsEvidence[],
): SimilaritySignal[] {
  return priorItems.map(item => ({
    priorItemId: item.id,
    titleScore: jaccard(candidate.normalized_title, item.normalized_title ?? ''),
    fingerprintScore: jaccard(candidate.event_fingerprint, item.event_fingerprint ?? ''),
    exactCanonicalUrl: Boolean(candidate.canonical_url && item.canonical_url && candidate.canonical_url === item.canonical_url),
    exactFingerprint: Boolean(candidate.event_fingerprint && item.event_fingerprint && candidate.event_fingerprint === item.event_fingerprint),
  }))
}

function buildAuditEvidence(
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>,
  priorItems: PriorNewsEvidence[],
): NoveltyAuditEvidence {
  return {
    candidate,
    priorItems: priorItems.slice(0, 50).map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      source_name: item.source_name,
      status: item.status,
      canonical_url: item.canonical_url,
      normalized_title: item.normalized_title,
      event_fingerprint: item.event_fingerprint,
      novelty_verdict: item.novelty_verdict,
      created_at: item.created_at,
      scriptStates: (item.media_scripts ?? []).map(script => ({
        id: script.id,
        status: script.status,
        voice_status: script.voice_status,
        video_status: script.video_status,
        published_at: script.published_at,
      })),
    })),
    similaritySignals: buildSimilaritySignals(candidate, priorItems)
      .filter(signal => signal.exactCanonicalUrl || signal.exactFingerprint || Math.max(signal.titleScore, signal.fingerprintScore) > 0.4)
      .sort((a, b) => Math.max(b.titleScore, b.fingerprintScore) - Math.max(a.titleScore, a.fingerprintScore))
      .slice(0, 50),
  }
}

function deterministicVerdict(
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>,
  priorItems: PriorNewsEvidence[],
): NoveltyVerdict | null {
  const exact = priorItems.find(item =>
    candidate.canonical_url && item.canonical_url && candidate.canonical_url === item.canonical_url
  )
  if (exact) {
    return { verdict: 'duplicate', confidence: 1, matchedItemIds: [exact.id], reasoning: 'Canonical URL already exists for this project.' }
  }

  const sameFingerprint = priorItems.find(item =>
    candidate.event_fingerprint && item.event_fingerprint && candidate.event_fingerprint === item.event_fingerprint
  )
  if (sameFingerprint) {
    return { verdict: 'duplicate', confidence: 0.96, matchedItemIds: [sameFingerprint.id], reasoning: 'Stable event fingerprint already exists for this project.' }
  }

  const similar = priorItems
    .map(item => ({
      item,
      score: Math.max(
        jaccard(candidate.normalized_title, item.normalized_title ?? ''),
        jaccard(candidate.event_fingerprint, item.event_fingerprint ?? ''),
      ),
    }))
    .filter(match => match.score >= 0.82)
    .sort((a, b) => b.score - a.score)

  if (similar[0]) {
    return {
      verdict: 'duplicate',
      confidence: Math.min(0.95, similar[0].score),
      matchedItemIds: [similar[0].item.id],
      reasoning: 'Normalized title or event fingerprint is highly similar to an existing pipeline item.',
    }
  }

  return null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function validateNoveltyVerdict(value: unknown): NoveltyVerdict | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!['new', 'duplicate', 'material_update', 'uncertain'].includes(String(v.verdict))) return null
  if (typeof v.confidence !== 'number' || Number.isNaN(v.confidence) || v.confidence < 0 || v.confidence > 1) return null
  if (!isStringArray(v.matchedItemIds)) return null
  if (typeof v.reasoning !== 'string' || v.reasoning.trim().length < 3) return null
  if (v.verdict === 'material_update' && !isStringArray(v.newFacts)) return null

  if (v.verdict === 'material_update') {
    return {
      verdict: 'material_update',
      confidence: v.confidence,
      matchedItemIds: v.matchedItemIds,
      newFacts: v.newFacts as string[],
      reasoning: v.reasoning,
    }
  }

  return {
    verdict: v.verdict as 'new' | 'duplicate' | 'uncertain',
    confidence: v.confidence,
    matchedItemIds: v.matchedItemIds,
    reasoning: v.reasoning,
  }
}

async function defaultReviewer(input: {
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>
  priorItems: PriorNewsEvidence[]
  model?: string | null
  systemPrompt?: string | null
}): Promise<unknown> {
  const anthropic = new Anthropic()
  const response = await anthropic.messages.create({
    model: input.model ?? 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    system: input.systemPrompt ?? EDITORIAL_DUPLICATE_FRESHNESS_REVIEWER_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({ candidate: input.candidate, priorItems: input.priorItems.slice(0, 20) }),
    }],
  })
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim())
}

export async function loadNoveltyEvidence(
  db: SupabaseClient,
  projectId: string,
  excludeNewsItemId?: string | null,
): Promise<PriorNewsEvidence[]> {
  let query = db
    .from('media_news_items')
    .select(`
      id,
      title,
      summary,
      url,
      source_name,
      status,
      canonical_url,
      normalized_title,
      event_fingerprint,
      novelty_verdict,
      novelty_reasoning,
      created_at,
      media_scripts (
        id,
        status,
        hook,
        script,
        video_status,
        voice_status,
        published_at
      )
    `)
    .eq('project_id', projectId)
    .in('status', [
      'approved',
      'scripted',
      'published',
      'pending_novelty_review',
      'duplicate_blocked',
      'material_update_pending',
      'uncertain_requires_review',
    ])
    .order('created_at', { ascending: false })
    .limit(200)

  if (excludeNewsItemId) query = query.neq('id', excludeNewsItemId)

  const { data, error } = await query
  if (error) throw new Error(`novelty evidence query failed: ${error.message}`)
  return (data ?? []) as PriorNewsEvidence[]
}

export function outcomeForVerdict(verdict: NoveltyVerdict): NoveltyOutcome {
  if (verdict.verdict === 'new') return 'novelty_passed'
  if (verdict.verdict === 'duplicate') return 'duplicate_blocked'
  if (verdict.verdict === 'material_update') return 'material_update_pending'
  return 'uncertain_requires_review'
}

export function statusForOutcome(outcome: NoveltyOutcome): string {
  if (outcome === 'novelty_passed') return 'pending_editorial_review'
  return outcome
}

async function createNoveltyReviewRun(
  db: SupabaseClient,
  input: {
    candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>
    newsItemId: string
    evidence: NoveltyAuditEvidence
    startedAt: string
  },
): Promise<NoveltyReviewRun> {
  const { data: agent, error: agentError } = await (db.from('agents') as any)
    .select('id, name, model, system_prompt')
    .eq('project_id', input.candidate.project_id)
    .eq('name', EDITORIAL_DUPLICATE_REVIEWER)
    .maybeSingle()
  if (agentError) throw new Error(`novelty reviewer agent lookup failed: ${agentError.message}`)
  if (!agent) throw new Error(`Seeded agent not found: ${EDITORIAL_DUPLICATE_REVIEWER}`)

  const { data: workflow, error: workflowError } = await (db.from('workflows') as any)
    .select('id, name')
    .eq('project_id', input.candidate.project_id)
    .eq('name', 'Editorial Duplicate Review')
    .maybeSingle()
  if (workflowError) throw new Error(`novelty workflow lookup failed: ${workflowError.message}`)
  if (!workflow) throw new Error('Seeded workflow not found: Editorial Duplicate Review')

  const { data: run, error: runError } = await (db.from('runs') as any)
    .insert({
      project_id: input.candidate.project_id,
      workflow_id: workflow.id,
      kind: 'media_novelty_review',
      status: 'running',
      started_at: input.startedAt,
      input: toJson({
        newsItemId: input.newsItemId,
        candidate: input.candidate,
      }),
      context: toJson({
        agent: { id: agent.id, name: agent.name, model: agent.model, systemPrompt: agent.system_prompt },
        role: EDITORIAL_DUPLICATE_REVIEWER,
        workflow: { id: workflow.id, name: workflow.name },
        evidence: input.evidence,
        deterministic: {
          canonical_url: input.candidate.canonical_url,
          normalized_title: input.candidate.normalized_title,
          event_fingerprint: input.candidate.event_fingerprint,
        },
      }),
    })
    .select('id')
    .single()

  if (runError) throw new Error(`novelty run insert failed: ${runError.message}`)
  if (!run?.id) throw new Error('novelty run insert returned no id')

  return { id: run.id, agent, workflow } as NoveltyReviewRun
}

async function completeNoveltyReviewRun(
  db: SupabaseClient,
  input: {
    runId: string
    run: NoveltyReviewRun
    evidence: NoveltyAuditEvidence
    verdict: NoveltyVerdict
    outcome: NoveltyOutcome
    status: string
    startedAt: string
  },
) {
  const failedClosed = input.verdict.verdict === 'uncertain'
    && /failed closed|invalid novelty verdict|invalid|provider|timeout|malformed/i.test(input.verdict.reasoning)
  const { error } = await (db.from('runs') as any)
    .update({
      status: failedClosed ? 'failed' : 'done',
      finished_at: new Date().toISOString(),
      error: failedClosed ? input.verdict.reasoning : null,
      context: toJson({
        agent: input.run.agent,
        role: EDITORIAL_DUPLICATE_REVIEWER,
        workflow: input.run.workflow,
        evidence: input.evidence,
        verdict: input.verdict,
        policyDecision: input.outcome,
        stateTransition: {
          from: 'pending_novelty_review',
          to: input.status,
        },
        startedAt: input.startedAt,
        completedAt: new Date().toISOString(),
      }),
    })
    .eq('id', input.runId)
  if (error) throw new Error(`novelty run completion failed: ${error.message}`)
}

async function failNoveltyReviewRun(
  db: SupabaseClient,
  runId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error)
  const { error: updateError } = await (db.from('runs') as any)
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: message,
    })
    .eq('id', runId)
  if (updateError) throw new Error(`novelty run failure mark failed: ${updateError.message}`)
}

async function loadAttachedNoveltyRun(
  db: SupabaseClient,
  runId: string | null,
): Promise<StoredNoveltyRun | null> {
  if (!runId) return null
  const { data, error } = await (db.from('runs') as any)
    .select('id, status, context')
    .eq('id', runId)
    .maybeSingle()
  if (error) throw new Error(`novelty run resume lookup failed: ${error.message}`)
  return data as StoredNoveltyRun | null
}

function runMetadataFromContext(run: StoredNoveltyRun): NoveltyReviewRun | null {
  const context = run.context
  const agent = context?.agent
  const workflow = context?.workflow
  if (!agent || typeof agent !== 'object' || !workflow || typeof workflow !== 'object') return null
  return {
    id: run.id,
    agent: agent as NoveltyReviewRun['agent'],
    workflow: workflow as NoveltyReviewRun['workflow'],
  }
}

function verdictFromIntakeRow(row: CandidateIntakeRow): NoveltyVerdict | null {
  return validateNoveltyVerdict({
    verdict: row.novelty_verdict,
    confidence: row.novelty_confidence,
    matchedItemIds: row.novelty_matched_item_ids ?? [],
    reasoning: row.novelty_reasoning,
    ...(row.novelty_verdict === 'material_update'
      ? { newFacts: Array.isArray(row.novelty_new_facts) ? row.novelty_new_facts : [] }
      : {}),
  })
}

function completedVerdictFromRun(run: StoredNoveltyRun | null): NoveltyVerdict | null {
  if (run?.status !== 'done') return null
  return validateNoveltyVerdict(run.context?.verdict)
}

async function releaseNoveltyClaim(
  db: SupabaseClient,
  newsItemId: string,
  claimId: string,
) {
  await (db.from('media_news_items') as any)
    .update({ novelty_claim_id: null, novelty_claimed_at: null })
    .eq('id', newsItemId)
    .eq('novelty_claim_id', claimId)
}

export async function reviewCandidateNovelty(
  db: SupabaseClient,
  candidate: NewsCandidateInput & ReturnType<typeof buildDeterministicNoveltyFields>,
  options: NoveltyReviewerOptions = {},
  excludeNewsItemId?: string | null,
): Promise<NoveltyVerdict> {
  const priorItems = await loadNoveltyEvidence(db, candidate.project_id, excludeNewsItemId)
  const deterministic = deterministicVerdict(candidate, priorItems)
  if (deterministic) return deterministic

  try {
    const raw = await (options.reviewer ?? defaultReviewer)({ candidate, priorItems })
    return validateNoveltyVerdict(raw) ?? {
      verdict: 'uncertain',
      confidence: 0,
      matchedItemIds: [],
      reasoning: 'Reviewer returned invalid novelty verdict.',
    }
  } catch (err) {
    return {
      verdict: 'uncertain',
      confidence: 0,
      matchedItemIds: [],
      reasoning: `Reviewer failed closed: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
  }
}

export async function persistCandidateWithNoveltyReview(
  db: SupabaseClient,
  input: NewsCandidateInput,
  options: NoveltyReviewerOptions = {},
): Promise<PersistNoveltyResult> {
  const deterministic = buildDeterministicNoveltyFields(input)
  const idempotencyIdentity = candidateIdempotencyIdentity(input)
  const idempotencyKey = candidateIdempotencyKey(input)
  const rawOutput = input.raw_output ?? {
    title: input.title,
    summary: input.summary ?? null,
    key_insight: input.key_insight ?? null,
    virality_score: input.virality_score ?? 0,
    target_audience: input.target_audience ?? 'intermediate',
    content_angle: input.content_angle ?? null,
    source_url: input.url ?? null,
    source_name: input.source_name ?? null,
  }

  const { data: intakeData, error } = await (db as any).rpc('claim_media_news_candidate', {
    p_project_id: input.project_id,
    p_run_id: input.run_id ?? null,
    p_title: input.title,
    p_summary: input.summary ?? null,
    p_url: input.url ?? null,
    p_source_name: input.source_name ?? null,
    p_virality_score: input.virality_score ?? 0,
    p_content_angle: input.content_angle ?? null,
    p_target_audience: input.target_audience ?? null,
    p_key_insight: input.key_insight ?? null,
    p_raw_output: toJson(rawOutput),
    p_canonical_url: deterministic.canonical_url,
    p_normalized_title: deterministic.normalized_title,
    p_event_fingerprint: deterministic.event_fingerprint,
    p_candidate_idempotency_key: idempotencyKey,
    p_candidate_identity: idempotencyIdentity,
    p_candidate_source_id: input.source_item_id ?? null,
    p_candidate_published_at: input.source_published_at ?? null,
  })
  if (error) throw new Error(`candidate intake claim failed: ${error.message}`)
  const intake = (Array.isArray(intakeData) ? intakeData[0] : intakeData) as CandidateIntakeRow | null
  if (!intake?.news_item_id) throw new Error('candidate intake claim returned no news item')

  if (intake.status !== 'pending_novelty_review') {
    const existingVerdict = verdictFromIntakeRow(intake)
    if (!existingVerdict || !intake.novelty_policy_outcome) {
      throw new Error(`candidate ${intake.news_item_id} has terminal novelty state without a valid durable verdict`)
    }
    return {
      status: intake.novelty_policy_outcome,
      newsItemId: intake.news_item_id,
      verdict: existingVerdict,
      workflowRunId: intake.novelty_workflow_run_id,
    }
  }
  if (!intake.novelty_claim_acquired || !intake.novelty_claim_id) {
    throw new Error(`novelty review already in progress for candidate ${intake.news_item_id}`)
  }

  const candidate = { ...input, ...deterministic }
  const claimId = intake.novelty_claim_id
  try {
    const priorItems = await loadNoveltyEvidence(db, candidate.project_id, intake.news_item_id)
    const evidence = buildAuditEvidence(candidate, priorItems)
    const startedAt = new Date().toISOString()
    if (options.workflowRunId) {
      throw new Error('External novelty workflowRunId injection is no longer supported; durable reviewer execution must be created here')
    }

    const attachedRun = await loadAttachedNoveltyRun(db, intake.novelty_workflow_run_id)
    let reviewRun = attachedRun?.status === 'running' ? runMetadataFromContext(attachedRun) : null
    let verdict = completedVerdictFromRun(attachedRun)

    if (!verdict && !reviewRun) {
      reviewRun = await createNoveltyReviewRun(db, {
        candidate,
        newsItemId: intake.news_item_id,
        evidence,
        startedAt,
      })
      const { error: bindError } = await (db.from('media_news_items') as any)
        .update({ novelty_workflow_run_id: reviewRun.id })
        .eq('id', intake.news_item_id)
        .eq('novelty_claim_id', claimId)
      if (bindError) {
        await failNoveltyReviewRun(db, reviewRun.id, bindError)
        throw new Error(`novelty run bind failed: ${bindError.message}`)
      }
    }

    if (!verdict) {
      verdict = deterministicVerdict(candidate, priorItems)
      if (!verdict) {
        try {
          const raw = options.reviewer
            ? await options.reviewer({ candidate, priorItems })
            : await defaultReviewer({
              candidate,
              priorItems,
              model: reviewRun!.agent.model,
              systemPrompt: reviewRun!.agent.system_prompt,
            })
          verdict = validateNoveltyVerdict(raw)
          if (!verdict) throw new Error('Reviewer returned invalid novelty verdict')
        } catch (reviewError) {
          await failNoveltyReviewRun(db, reviewRun!.id, reviewError)
          throw reviewError
        }
      }

      const outcome = outcomeForVerdict(verdict)
      const status = statusForOutcome(outcome)
      await completeNoveltyReviewRun(db, {
        runId: reviewRun!.id,
        run: reviewRun!,
        evidence,
        verdict,
        outcome,
        status,
        startedAt,
      })
    }

    const workflowRunId = reviewRun?.id ?? attachedRun!.id
    const outcome = outcomeForVerdict(verdict)
    const status = statusForOutcome(outcome)
    const { error: updateError } = await (db.from('media_news_items') as any)
      .update({
        status,
        novelty_verdict: verdict.verdict,
        novelty_confidence: verdict.confidence,
        novelty_matched_item_ids: verdict.matchedItemIds,
        novelty_reasoning: verdict.reasoning,
        novelty_new_facts: verdict.verdict === 'material_update' ? verdict.newFacts : [],
        novelty_reviewer: EDITORIAL_DUPLICATE_REVIEWER,
        novelty_reviewed_at: new Date().toISOString(),
        novelty_input_evidence: toJson({ ...evidence, workflowRunId }),
        novelty_policy_outcome: outcome,
        novelty_workflow_run_id: workflowRunId,
        novelty_claim_id: null,
        novelty_claimed_at: null,
      })
      .eq('id', intake.news_item_id)
      .eq('novelty_claim_id', claimId)

    if (updateError) throw new Error(`novelty verdict update failed: ${updateError.message}`)
    return { status: outcome, newsItemId: intake.news_item_id, verdict, workflowRunId }
  } catch (persistError) {
    try {
      await releaseNoveltyClaim(db, intake.news_item_id, claimId)
    } catch {
      // The stale-claim timeout remains the recovery path if claim release is unavailable.
    }
    throw persistError
  }
}