/**
 * Atlas digital growth intelligence v1.
 *
 * Deterministic project-scoped, read-only decision support. This module DOES NOT
 * connect to providers, verify credentials, persist, approve, or execute actions.
 * The caller must provide independently verified and cohort-attributed records.
 */
export const DIGITAL_GROWTH_VERSION = 'atlas-digital-growth-v1' as const

export type GrowthProject = 'familje-stunden' | 'handlarborsen' | 'the-prompt'
export type GrowthFunnel =
  | 'landing_to_trial' | 'trial_to_paid' | 'member_retention'
  | 'dealer_contact_to_pilot' | 'verified_dealer_to_listing' | 'listing_to_interest'
  | 'video_to_profile' | 'profile_to_follow' | 'video_to_verified_site_visit'

export type EvidenceProvider =
  | 'posthog' | 'stripe' | 'supabase' | 'youtube'
  | 'facebook' | 'instagram' | 'business_crm' | 'owner_verified'

export interface GrowthEvidence {
  /** Opaque provider/report ID. Never a contact name, email, or private URL. */
  ref: string
  provider: EvidenceProvider
  project: GrowthProject
  verified: boolean
  capturedAt: string
}

export interface GrowthWindow {
  project: GrowthProject
  funnel: GrowthFunnel
  startDate: string // inclusive YYYY-MM-DD
  endDate: string // inclusive YYYY-MM-DD
  entrants: number | null // distinct, eligible members of the SAME cohort
  converted: number | null // converted members of that SAME cohort
  measurementKey: string // stable event definition/version
  attributionWindowDays: number
  evidence: readonly GrowthEvidence[]
}

export type GrowthStatus = 'data_gap' | 'insufficient_sample' | 'needs_review' | 'stable_or_improved'

export interface GrowthDraftAction {
  project: GrowthProject
  type: 'draft_experiment'
  execution: 'not_authorized'
  humanApprovalBeforeExternalExecution: true
  allowedSpendSek: 0
  hypothesis: string
  primaryMetric: GrowthFunnel
  suggestedCheck: string
}

export interface GrowthDecision {
  version: typeof DIGITAL_GROWTH_VERSION
  project: GrowthProject
  funnel: GrowthFunnel
  status: GrowthStatus
  currentRate: number | null
  previousRate: number | null
  relativeChange: number | null
  evidenceRefs: string[]
  gaps: string[]
  rationale: string
  proposal: GrowthDraftAction | null
}

type FunnelDefinition = { label: string; hypothesis: string; nextCheck: string }

/** Project-owned funnels: mixing business metrics is always denied. */
const FUNNELS: Readonly<Record<GrowthProject, Partial<Record<GrowthFunnel, FunnelDefinition>>>> = {
  'familje-stunden': {
    landing_to_trial: {
      label: 'landing visitors starting a trial',
      hypothesis: 'A clearer and truthful parent benefit may lower trial friction.',
      nextCheck: 'Review mobile landing page, verified parent benefits and approved trial CTA.',
    },
    trial_to_paid: {
      label: 'trial members converting to paying subscribers',
      hypothesis: 'Better onboarding guidance may improve trial-to-paid conversion.',
      nextCheck: 'Review trial onboarding, cohort age and payment problems without contacting families.',
    },
    member_retention: {
      label: 'eligible members remaining active',
      hypothesis: 'Clearer monthly activity access may improve retention.',
      nextCheck: 'Review content availability and anonymous member feedback.',
    },
  },
  handlarborsen: {
    dealer_contact_to_pilot: {
      label: 'contacted dealers entering the pilot',
      hypothesis: 'A clearer founding-pilot invitation may reduce dealer registration friction.',
      nextCheck: 'Review contact-to-registration drop-off, approved pilot terms and individual replies.',
    },
    verified_dealer_to_listing: {
      label: 'verified dealers publishing their first listing',
      hypothesis: 'Simpler first-listing onboarding may improve activation.',
      nextCheck: 'Review first-listing steps, errors and verified dealer feedback.',
    },
    listing_to_interest: {
      label: 'eligible listings attracting verified interest',
      hypothesis: 'Better listing guidance and discovery may increase verified interest.',
      nextCheck: 'Review listing quality, exposure and discoverability; do not edit live listings.',
    },
  },
  'the-prompt': {
    video_to_profile: {
      label: 'video viewers visiting the project profile',
      hypothesis: 'A stronger but strictly verified first-three-seconds hook may help.',
      nextCheck: 'Review source accuracy, early retention, visuals and truthful end CTA.',
    },
    profile_to_follow: {
      label: 'profile visitors following the channel',
      hypothesis: 'A clearer editorial promise may improve follows per profile visit.',
      nextCheck: 'Review verified story cadence and accessible channel promise.',
    },
    video_to_verified_site_visit: {
      label: 'video viewers visiting the project website',
      hypothesis: 'A trustworthy source-linked CTA may increase qualified visits.',
      nextCheck: 'Verify attribution, destination and evidence-backed CTA.',
    },
  },
}

export type GrowthActionType =
  | 'read_only_analysis' | 'local_draft' | 'send_email' | 'publish'
  | 'run_paid_ads' | 'change_price' | 'change_production' | 'access_private_records'

export interface GrowthActionRequest {
  project: GrowthProject
  type: GrowthActionType
  requestedSpendSek?: number
}

export interface GrowthActionGate {
  verdict: 'draft_only' | 'approval_required' | 'blocked'
  authorizesExternalExecution: false
  requiresOwnerApproval: boolean
  rationale: string
}

/**
 * Decision support only; never an authorization to execute. Real action paths
 * must still pass Omnira's tenant, license, broker, budget, and owner gates.
 */
export function classifyGrowthAction(request: GrowthActionRequest, activeProject: GrowthProject): GrowthActionGate {
  if (request.project !== activeProject || !Object.prototype.hasOwnProperty.call(FUNNELS, request.project)) {
    return { verdict: 'blocked', authorizesExternalExecution: false, requiresOwnerApproval: true,
      rationale: 'Project isolation: the action is not in the active project.' }
  }
  if (request.requestedSpendSek !== undefined
      && (!Number.isFinite(request.requestedSpendSek) || request.requestedSpendSek < 0)) {
    return { verdict: 'blocked', authorizesExternalExecution: false, requiresOwnerApproval: true,
      rationale: 'Invalid budget; reject without executing.' }
  }
  if (!['read_only_analysis', 'local_draft'].includes(request.type) || (request.requestedSpendSek ?? 0) > 0) {
    return { verdict: 'approval_required', authorizesExternalExecution: false, requiresOwnerApproval: true,
      rationale: 'External action, private records or spend requires existing verified owner approval.' }
  }
  return { verdict: 'draft_only', authorizesExternalExecution: false, requiresOwnerApproval: false,
    rationale: 'Only local analysis or drafting. Not permission to publish or contact anyone.' }
}

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(value + 'T00:00:00.000Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86400000 : null
}

function validEvidence(e: GrowthEvidence, project: GrowthProject): boolean {
  return e.project === project && e.verified === true
    && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,180}$/.test(e.ref)
    && Number.isFinite(Date.parse(e.capturedAt))
    && Object.prototype.hasOwnProperty.call(FUNNELS, e.project)
}

function windowError(w: GrowthWindow): string | null {
  if (!FUNNELS[w.project]?.[w.funnel]) return 'Wrong project or unsupported funnel.'
  const start = utcDay(w.startDate)
  const end = utcDay(w.endDate)
  if (start === null || end === null || start > end) return 'Invalid reporting dates.'
  if (!w.measurementKey?.trim()) return 'Missing stable event-definition key.'
  if (!Number.isSafeInteger(w.attributionWindowDays) || w.attributionWindowDays < 1) return 'Invalid attribution window.'
  if (w.entrants === null || w.converted === null) return 'Cohort counts are missing.'
  if (!Number.isSafeInteger(w.entrants) || !Number.isSafeInteger(w.converted)
      || w.entrants < 0 || w.converted < 0 || w.converted > w.entrants) {
    return 'Invalid cohort counts (converted must be a subset of entrants).'
  }
  if (!w.evidence.length || w.evidence.some(e => !validEvidence(e, w.project))) {
    return 'Missing verified project-bound provider evidence.'
  }
  return null
}

function result(
  w: GrowthWindow, status: GrowthStatus, gaps: string[], rationale: string,
  currentRate: number | null = null, previousRate: number | null = null,
  relativeChange: number | null = null, proposal: GrowthDraftAction | null = null,
  priorEvidence: readonly GrowthEvidence[] = [],
): GrowthDecision {
  return {
    version: DIGITAL_GROWTH_VERSION, project: w.project, funnel: w.funnel, status,
    currentRate, previousRate, relativeChange,
    evidenceRefs: [...new Set([...w.evidence, ...priorEvidence]
      .filter(e => validEvidence(e, w.project)).map(e => e.ref))],
    gaps, rationale, proposal,
  }
}

const MIN_SAMPLE = 30
const MIN_ABSOLUTE_DROP = 0.05 // 5 percentage points
const MIN_RELATIVE_DROP = 0.20 // 20% relative

/**
 * Directional TRIAGE only. A decline does not establish causation, statistical
 * significance, profitability, or that an ad campaign should be launched.
 */
export function analyzeGrowthFunnel(current: GrowthWindow, previous?: GrowthWindow): GrowthDecision {
  const invalid = windowError(current)
  if (invalid) return result(current, 'data_gap', [invalid], 'Do not infer results from unverified data.')
  const currentRate = current.entrants ? current.converted! / current.entrants : null
  if (!previous) return result(current, 'data_gap', ['Comparable previous cohort missing.'],
    'Collect comparable baseline data.', currentRate)
  if (previous.project !== current.project || previous.funnel !== current.funnel) {
    return result(current, 'data_gap', ['Cross-project/funnel comparison denied.'], 'Do not mix company data.')
  }
  const badPrevious = windowError(previous)
  if (badPrevious) return result(current, 'data_gap', [badPrevious], 'Previous cohort is not verified.')
  const cs = utcDay(current.startDate)!, ce = utcDay(current.endDate)!
  const ps = utcDay(previous.startDate)!, pe = utcDay(previous.endDate)!
  if (current.measurementKey !== previous.measurementKey
      || current.attributionWindowDays !== previous.attributionWindowDays
      || ce - cs !== pe - ps || pe >= cs) {
    return result(current, 'data_gap', ['Measurement definition or reporting windows differ.'],
      'Mismatched periods are not comparable.')
  }
  const previousRate = previous.entrants ? previous.converted! / previous.entrants : null
  if (currentRate === null || previousRate === null
      || current.entrants! < MIN_SAMPLE || previous.entrants! < MIN_SAMPLE) {
    return result(current, 'insufficient_sample', ['Fewer than 30 entrants in one or both cohorts.'],
      'Collect additional evidence before drawing a directional conclusion.',
      currentRate, previousRate, null, null, previous.evidence)
  }
  const relativeChange = previousRate ? (currentRate - previousRate) / previousRate : null
  const drop = previousRate - currentRate
  if (relativeChange === null || drop < MIN_ABSOLUTE_DROP || relativeChange > -MIN_RELATIVE_DROP) {
    return result(current, 'stable_or_improved', [], 'No large directional decline; no causal claim.',
      currentRate, previousRate, relativeChange, null, previous.evidence)
  }
  const definition = FUNNELS[current.project][current.funnel]!
  return result(current, 'needs_review', [], 'Directional decline in ' + definition.label
    + '; cause and any business impact remain unverified.',
    currentRate, previousRate, relativeChange, {
      project: current.project, type: 'draft_experiment', execution: 'not_authorized',
      humanApprovalBeforeExternalExecution: true, allowedSpendSek: 0,
      primaryMetric: current.funnel,
      hypothesis: definition.hypothesis,
      suggestedCheck: definition.nextCheck,
    }, previous.evidence)
}
