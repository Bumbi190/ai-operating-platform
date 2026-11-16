/**
 * Nova Micro pilot facts and NON-DISPATCHING shadow eligibility.
 *
 * This module cannot call an AI provider, cannot reserve budget and cannot
 * switch Omnira's live routing. It deliberately has no dispatch function.
 *
 * Prices: Amazon Bedrock standard on-demand, us-east-1, 2026-11-16.
 * AWS Activate credit applicability and final billed/net amount are separate
 * from this *gross* usage estimate and must be checked on the AWS invoice.
 */
export const NOVA_MICRO_PILOT_MODEL = 'amazon.nova-micro-v1:0'
export const NOVA_MICRO_PILOT_REGION = 'us-east-1'
export const NOVA_MICRO_INPUT_PER_MILLION_USD = 0.035
export const NOVA_MICRO_OUTPUT_PER_MILLION_USD = 0.14
export const NOVA_MICRO_REVIEW_MAX_INPUT_BYTES = 8192
export const NOVA_MICRO_REVIEW_MAX_OUTPUT_TOKENS = 256
export const NOVA_MICRO_CONTEXT_WINDOW_TOKENS = 128_000

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'

export type ShadowCandidate = {
  environment: string | undefined
  gitRef: string | undefined
  enabled: boolean
  hardSpendGateEnabled: boolean
  /** This is a private, explicitly operated text-only QA job, never publishing. */
  operation: string
  projectId: string | undefined
  inputBytes: number
  maxOutputTokens: number
}

export type ShadowDecision =
  | { status: 'refused'; reason: string; canDispatch: false }
  | { status: 'shadow_review_only'; reason: 'ready_for_non_dispatching_review'; canDispatch: false }

/**
 * A planning-only readiness filter, NEVER a dispatch authorisation.
 * Passing this does not bypass withGovernedSpend/STOP/approval.
 */
export function evaluateBedrockShadowCandidate(input: ShadowCandidate): ShadowDecision {
  if (!input.enabled) return { status: 'refused', reason: 'disabled', canDispatch: false }
  if (input.environment !== 'preview' || input.gitRef !== PILOT_BRANCH) {
    return { status: 'refused', reason: 'not_isolated_preview', canDispatch: false }
  }
  if (!input.hardSpendGateEnabled) {
    return { status: 'refused', reason: 'hard_spend_gate_required', canDispatch: false }
  }
  if (input.operation !== 'manual_editorial_quality_review') {
    return { status: 'refused', reason: 'operation_not_allowlisted', canDispatch: false }
  }
  if (typeof input.projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.projectId)) {
    return { status: 'refused', reason: 'project_not_qualified', canDispatch: false }
  }
  if (!Number.isSafeInteger(input.inputBytes) || input.inputBytes < 1 ||
      input.inputBytes > NOVA_MICRO_REVIEW_MAX_INPUT_BYTES) {
    return { status: 'refused', reason: 'input_not_bounded', canDispatch: false }
  }
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 ||
      input.maxOutputTokens > NOVA_MICRO_REVIEW_MAX_OUTPUT_TOKENS) {
    return { status: 'refused', reason: 'output_not_bounded', canDispatch: false }
  }
  return { status: 'shadow_review_only', reason: 'ready_for_non_dispatching_review', canDispatch: false }
}

function tokenCount(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export type GrossUsageQuote = {
  modelId: typeof NOVA_MICRO_PILOT_MODEL
  region: typeof NOVA_MICRO_PILOT_REGION
  grossUsd: number
  creditsAppliedUsd: null
  netBilledUsd: null
}

/** Only price actual usage returned by AWS; no heuristic token estimate. */
export function quoteNovaMicroGrossUsage(inputTokens: number, outputTokens: number): GrossUsageQuote {
  if (!tokenCount(inputTokens, NOVA_MICRO_CONTEXT_WINDOW_TOKENS) ||
      !tokenCount(outputTokens, NOVA_MICRO_REVIEW_MAX_OUTPUT_TOKENS)) {
    throw new Error('NOVA_PILOT_USAGE_NOT_VERIFIED')
  }
  const grossUsd = (inputTokens * NOVA_MICRO_INPUT_PER_MILLION_USD
      + outputTokens * NOVA_MICRO_OUTPUT_PER_MILLION_USD) / 1_000_000
  return {
    modelId: NOVA_MICRO_PILOT_MODEL,
    region: NOVA_MICRO_PILOT_REGION,
    grossUsd,
    creditsAppliedUsd: null,
    netBilledUsd: null,
  }
}

/**
 * Gross theoretical ceiling for the pilot parameters only; not a spend
 * reservation and not an authorisation to bill. The future governed adapter
 * must pin USD/SEK rates and include this in Omnira's canonical ledger.
 */
export function boundNovaMicroPilotGrossUsd(maxOutputTokens: number): number {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 ||
      maxOutputTokens > NOVA_MICRO_REVIEW_MAX_OUTPUT_TOKENS) {
    throw new Error('NOVA_PILOT_OUTPUT_NOT_BOUNDED')
  }
  return (NOVA_MICRO_CONTEXT_WINDOW_TOKENS * NOVA_MICRO_INPUT_PER_MILLION_USD
    + maxOutputTokens * NOVA_MICRO_OUTPUT_PER_MILLION_USD) / 1_000_000
}
