/**
 * P2/P3 Atlas worker catalog. Advisory-only. A catalog identity is never
 * an entitlement, an authorization, a runnable process, or a trusted worker.
 *
 * SDF-1A's CLAUDE_PATCH_V1 contract remains unchanged. New harnesses cannot
 * be promoted into that authority boundary by picking an entry here.
 */
export const ROUTER_CATALOG_VERSION = 'atlas.model-router.catalog.v1' as const

export type AtlasTask = 'classify' | 'summarize' | 'plan' | 'code_patch' | 'code_review'
export type QualityTier = 1 | 2 | 3
export type HarnessKind = 'ollama-http' | 'codex-cli' | 'abacus-cli' | 'api'
export type CostKind = 'local' | 'subscription' | 'unverified' | 'metered'
export type ModelLineage = 'qwen' | 'openai' | 'unknown'

export interface WorkerCandidate {
  readonly id: string
  readonly modelId: string
  readonly provider: 'ollama' | 'openai' | 'abacus'
  /** Actual model family, not agent wrapper branding. Unverified wrappers stay unknown. */
  readonly modelLineage: ModelLineage
  readonly harness: HarnessKind
  readonly cost: CostKind
  readonly supportedTasks: readonly AtlasTask[]
  readonly qualityTier: QualityTier
  readonly boundary: 'local' | 'external'
  /** No worker here is authorized for a Git change by registration alone. */
  readonly executesWithoutHumanGate: false
}

/**
 * Abacus costs and subscription reuse have NOT been proven on this machine:
 * default status is intentionally unroutable until attested.
 * Paid API provider entries are illustrative, never auto enabled.
 */
export const ATLAS_WORKERS: readonly WorkerCandidate[] = Object.freeze([
  Object.freeze({
    id: 'local-qwen3-4b',
    modelId: 'qwen3:4b',
    provider: 'ollama', modelLineage: 'qwen', harness: 'ollama-http', cost: 'local',
    supportedTasks: ['classify', 'summarize', 'plan'],
    qualityTier: 1, boundary: 'local', executesWithoutHumanGate: false,
  } as const),
  Object.freeze({
    id: 'codex-chatgpt-cli',
    modelId: 'subscription-default',
    provider: 'openai', modelLineage: 'openai', harness: 'codex-cli', cost: 'subscription',
    supportedTasks: ['classify', 'summarize', 'plan', 'code_patch', 'code_review'],
    qualityTier: 3, boundary: 'external', executesWithoutHumanGate: false,
  } as const),
  Object.freeze({
    id: 'abacus-code-worker',
    modelId: 'user-configured',
    provider: 'abacus', modelLineage: 'unknown', harness: 'abacus-cli', cost: 'unverified',
    supportedTasks: ['plan', 'code_patch', 'code_review'],
    qualityTier: 2, boundary: 'external', executesWithoutHumanGate: false,
  } as const),
  Object.freeze({
    id: 'openai-metered-mini',
    modelId: 'gpt-4o-mini',
    provider: 'openai', modelLineage: 'openai', harness: 'api', cost: 'metered',
    supportedTasks: ['classify', 'summarize', 'plan'],
    qualityTier: 2, boundary: 'external', executesWithoutHumanGate: false,
  } as const),
])
