/**
 * Handlarbörsen distribution metrics — independent, pure and OFFLINE.
 *
 * This module consumes count observations provided by future authorised readers.
 * It does not fetch leads, make contact decisions, send messages or access a DB.
 * "send_accepted" means SMTP/provider accepted the job, NOT delivered.
 *
 * Caller must ensure observations refer to exactly the same, deduplicated,
 * bounded company cohort. This function cannot verify that on its own.
 */

export const DISTRIBUTION_STAGES = [
  'identified',
  'company_verified',
  'outreach_review_passed',
  'draft_approved',
  'send_accepted',
  'reply_received',
  'registered',
  'dealer_approved',
  'first_listing_published',
] as const

export type DistributionStage = (typeof DISTRIBUTION_STAGES)[number]

export type DistributionCount =
  | {
      stage: DistributionStage
      status: 'verified'
      count: number
      source: string
      observedAt: string
    }
  | {
      stage: DistributionStage
      status: 'partial'
      count: number
      source: string
      observedAt: string
      reason: string
    }
  | {
      stage: DistributionStage
      status: 'unavailable'
      reason: string
    }

export type StageRead = {
  stage: DistributionStage
  status: 'verified' | 'partial' | 'unavailable'
  count: number | null
  source: string | null
  observedAt: string | null
  reason: string | null
}

export type ConversionRead =
  | { status: 'verified'; numerator: number; denominator: number; percent: number }
  | {
      status: 'unavailable'
      reason: 'missing_or_partial_evidence' | 'zero_denominator' | 'cohort_inconsistent'
    }

export type DistributionSummary = {
  cohortId: string
  stages: StageRead[]
  contactToRegistration: ConversionRead
  registrationToFirstListing: ConversionRead
  identifiedToFirstListing: ConversionRead
}

function isStage(value: unknown): value is DistributionStage {
  return DISTRIBUTION_STAGES.some(stage => stage === value)
}

function checkedCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Distribution counts must be non-negative safe integers')
  }
  return count
}

function checkedText(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' required')
  return value.trim()
}

function checkedRead(value: DistributionCount): StageRead {
  if (!value || typeof value !== 'object' || !isStage(value.stage)) {
    throw new TypeError('Unknown distribution stage')
  }

  if (value.status === 'unavailable') {
    return {
      stage: value.stage, status: 'unavailable', count: null,
      source: null, observedAt: null, reason: checkedText(value.reason, 'reason'),
    }
  }
  if (value.status !== 'verified' && value.status !== 'partial') {
    throw new TypeError('Unknown distribution evidence status')
  }

  const source = checkedText(value.source, 'source')
  const observedAt = checkedText(value.observedAt, 'observedAt')
  const count = checkedCount(value.count)
  const reason = value.status === 'partial'
    ? checkedText(value.reason, 'partial reason')
    : null

  return { stage: value.stage, status: value.status, count, source, observedAt, reason }
}

function conversion(
  stages: StageRead[],
  from: DistributionStage,
  to: DistributionStage,
): ConversionRead {
  const denominator = stages.find(item => item.stage === from)
  const numerator = stages.find(item => item.stage === to)

  // Missing, partial, or unreadable source is NEVER displayed as zero.
  if (!numerator || !denominator || numerator.status !== 'verified' ||
      denominator.status !== 'verified' || numerator.count === null ||
      denominator.count === null) {
    return {status: 'unavailable', reason: 'missing_or_partial_evidence'}
  }
  if (denominator.count === 0) return {status: 'unavailable', reason: 'zero_denominator'}
  if (numerator.count > denominator.count) {
    return {status: 'unavailable', reason: 'cohort_inconsistent'}
  }
  return {
    status: 'verified',
    numerator: numerator.count,
    denominator: denominator.count,
    percent: Math.round((numerator.count / denominator.count) * 1000) / 10,
  }
}

/**
 * Only analytics. Never use this summary to authorise outreach.
 * The passed cohort MUST be a single consistently defined set of legal
 * companies; counts covering different periods/channels cannot be compared.
 */
export function summariseDistributionCohort(input: {
  cohortId: string
  observations: readonly DistributionCount[]
}): DistributionSummary {
  const cohortId = checkedText(input?.cohortId, 'cohortId')
  if (!Array.isArray(input.observations)) throw new TypeError('observations required')

  const byStage = new Map<DistributionStage, StageRead>()
  for (const entry of input.observations) {
    const read = checkedRead(entry)
    if (byStage.has(read.stage)) throw new TypeError('Duplicate stage observation')
    byStage.set(read.stage, read)
  }

  const stages: StageRead[] = DISTRIBUTION_STAGES.map(stage => byStage.get(stage) ?? ({
    stage, status: 'unavailable', count: null, source: null, observedAt: null,
    reason: 'not_collected',
  }))

  return {
    cohortId,
    stages,
    contactToRegistration: conversion(stages, 'send_accepted', 'registered'),
    registrationToFirstListing: conversion(stages, 'registered', 'first_listing_published'),
    identifiedToFirstListing: conversion(stages, 'identified', 'first_listing_published'),
  }
}
