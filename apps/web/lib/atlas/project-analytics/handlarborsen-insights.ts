import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
  type MarketplaceMetricKey,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  STALE_AFTER_HOURS,
  type MarketplaceReport,
  type ReportSnapshot,
} from './handlarborsen-marketplace-report'

export const HANDLARBORSEN_INSIGHT_RULE_VERSION = 'handlarborsen-insights-1.0.0'
type Rule = 'quality' | 'company-status' | 'bid-window' | 'published-stock'

export interface InsightQuality {
  reportState: MarketplaceReport['state']
  completeness: ReportSnapshot['completeness'] | 'unknown'
  availableCount: number | null
  totalCount: number
  freshness: 'fresh' | 'stale' | 'unknown'
  ageHours: number | null
  collection: MarketplaceReport['collection']
  skippedInvalid: number
  reasons: string[]
  blockedRules: { rule: Rule; reason: string }[]
}

export interface HandlarborsenEvidence {
  metricKey: MarketplaceMetricKey
  value: number | null
  availability: 'known' | 'unknown'
  reason: string | null
  observedAt: string
  capturedAt: string
  snapshotDate: string
  source: 'handlarborsen.marketplace'
  projectId: typeof HANDLARBORSEN_PROJECT_ID
  schemaVersion: 1
  snapshotRef: string
  collectorId: 'handlarborsen.marketplace'
  /** The report does not retain the historical collector version. Never invent it. */
  collectorVersion: null
  completeness: ReportSnapshot['completeness']
  semanticKind: 'total' | 'current' | 'rolling24h' | 'population_unverified'
  /** Stocks are point observations; their window start equals their end. */
  window: { start: string; end: string; timezone: 'UTC'; complete: boolean | null }
  quality: InsightQuality
}

interface InsightBase {
  id: string
  rule: Rule
  ruleVersion: typeof HANDLARBORSEN_INSIGHT_RULE_VERSION
  priority: 'check' | 'review' | 'observe'
  title: string
  observation: string
  evidence: HandlarborsenEvidence[]
  quality: InsightQuality
}
export type HandlarborsenInsight =
  | (InsightBase & { kind: 'quality'; blockedReason: string; nextCheck: string })
  | (InsightBase & { kind: 'fact'; blockedReason: null })
  | (InsightBase & {
      kind: 'proposal'
      blockedReason: null
      reviewReason: string
      nextCheck: string
    })

function validTime(snapshot: ReportSnapshot, nowMs: number): boolean {
  // Stored report validation accepts parseable timestamps. This stricter boundary
  // rejects timezone-less times so rules cannot depend on the host timezone.
  const zonedTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
  if (!zonedTimestamp.test(snapshot.observedAt) || !zonedTimestamp.test(snapshot.capturedAt))
    return false
  const observed = Date.parse(snapshot.observedAt)
  const captured = Date.parse(snapshot.capturedAt)
  return (
    Number.isFinite(observed) &&
    Number.isFinite(captured) &&
    observed <= nowMs &&
    new Date(observed).toISOString().slice(0, 10) === snapshot.snapshotDate
  )
}

function known(snapshot: ReportSnapshot, key: MarketplaceMetricKey): number | null {
  const value = snapshot.metrics.find((metric) => metric.key === key)?.value
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/**
 * Closed P0 rules, in display priority order: quality; company status if registered
 * exceeds verified (otherwise a fact); two separate bid levels, with a manual check
 * when rolling24h is zero; published stock delta only on consecutive observed UTC
 * dates. No rolling-window trends, conversion, demand or causal conclusions.
 * Partial permits known levels; stale/failed audit/unavailable blocks business rules.
 * `now` is mandatory. No I/O, mutation, ambient clock, model or executable actions.
 * IDs encode the rule and exact evidence/quality, not evaluation time; no lossy hash.
 */
export function deriveHandlarborsenInsights(
  report: MarketplaceReport,
  now: Date,
): {
  evaluatedAt: string | null
  quality: InsightQuality
  insights: HandlarborsenInsight[]
} {
  const nowMs = now.getTime()
  const latest = report.state === 'ok' ? report.latest : null
  const usable = latest !== null && Number.isFinite(nowMs) && validTime(latest, nowMs)
  const ageHours = usable ? (nowMs - Date.parse(latest.observedAt)) / 3_600_000 : null
  const quality: InsightQuality = {
    reportState: report.state,
    completeness: usable ? latest.completeness : 'unknown',
    availableCount: usable
      ? MARKETPLACE_METRIC_KEYS.filter((key) => known(latest, key) !== null).length
      : null,
    totalCount: MARKETPLACE_METRIC_KEYS.length,
    freshness: ageHours === null ? 'unknown' : ageHours > STALE_AFTER_HOURS ? 'stale' : 'fresh',
    ageHours,
    collection: report.collection,
    skippedInvalid: report.history.skippedInvalid,
    reasons: [],
    blockedRules: [],
  }
  if (!usable)
    quality.reasons.push(
      `Verifierat underlag saknas (${report.state === 'ok' ? 'ogiltig eller saknad observationstid' : report.state}).`,
    )
  if (quality.freshness === 'stale')
    quality.reasons.push('Observationen är äldre än 26 timmar; nytt underlag krävs.')
  if (usable && latest.completeness !== 'complete')
    quality.reasons.push(`Underlaget är ${latest.completeness}; okända mått är inte noll.`)
  if (report.collection?.latestAttemptFailed)
    quality.reasons.push(
      'Senaste insamlingsförsöket misslyckades; sparad rapport är inte en ny lyckad insamling.',
    )
  if (!report.collection?.lastAttempt)
    quality.reasons.push('Insamlingsaudit är okänd; lyckad insamling kan inte bekräftas.')
  if (report.history.skippedInvalid > 0)
    quality.reasons.push('Historiken innehåller bortvalda ogiltiga snapshots.')

  const businessAllowed =
    usable &&
    quality.freshness === 'fresh' &&
    latest.completeness !== 'unavailable' &&
    !report.collection?.latestAttemptFailed
  const required: Record<Exclude<Rule, 'quality'>, MarketplaceMetricKey[]> = {
    'company-status': ['companies_registered_total', 'companies_verified_total'],
    'bid-window': ['bids_total', 'bids_last_24h'],
    'published-stock': ['vehicles_published_active'],
  }
  for (const rule of Object.keys(required) as (keyof typeof required)[]) {
    if (!businessAllowed)
      quality.blockedRules.push({
        rule,
        reason: 'Aktuellt, användbart underlag krävs; kontrollera kvalitetsnotisen.',
      })
    else if (required[rule].some((key) => known(latest, key) === null))
      quality.blockedRules.push({ rule, reason: 'Nödvändigt mått är okänt eller saknas.' })
  }
  const previous = report.history.previous
  if (businessAllowed && !quality.blockedRules.some((block) => block.rule === 'published-stock')) {
    if (
      !previous ||
      !validTime(previous, nowMs) ||
      Date.parse(`${latest.snapshotDate}T00:00:00Z`) -
        Date.parse(`${previous.snapshotDate}T00:00:00Z`) !==
        86_400_000 ||
      previous.completeness === 'unavailable' ||
      known(previous, 'vehicles_published_active') === null
    ) {
      quality.blockedRules.push({
        rule: 'published-stock',
        reason:
          'Trend kräver kända värden på två intilliggande observerade UTC-datum; luckor fylls inte.',
      })
    }
  }

  function evidence(snapshot: ReportSnapshot, key: MarketplaceMetricKey): HandlarborsenEvidence {
    const metric = snapshot.metrics.find((item) => item.key === key)
    const value = known(snapshot, key)
    const end = new Date(snapshot.observedAt).toISOString()
    const rolling = metric?.kind === 'window24h'
    return {
      metricKey: key,
      value,
      availability: value === null ? 'unknown' : 'known',
      reason: value === null ? (metric?.reasonLabel ?? 'Mått saknas eller är okänt') : null,
      observedAt: snapshot.observedAt,
      capturedAt: snapshot.capturedAt,
      snapshotDate: snapshot.snapshotDate,
      source: 'handlarborsen.marketplace',
      projectId: HANDLARBORSEN_PROJECT_ID,
      schemaVersion: 1,
      snapshotRef: `${HANDLARBORSEN_PROJECT_ID}/${snapshot.snapshotDate}/${snapshot.observedAt}/${snapshot.capturedAt}`,
      collectorId: 'handlarborsen.marketplace',
      collectorVersion: null,
      completeness: snapshot.completeness,
      semanticKind:
        key === 'companies_verified_total'
          ? 'population_unverified'
          : rolling
            ? 'rolling24h'
            : metric?.kind === 'current'
              ? 'current'
              : 'total',
      window: {
        start: rolling ? new Date(Date.parse(end) - 86_400_000).toISOString() : end,
        end,
        timezone: 'UTC',
        complete: rolling ? null : true,
      },
      quality,
    }
  }
  const insights: HandlarborsenInsight[] = []
  function base(
    rule: Rule,
    title: string,
    observation: string,
    items: HandlarborsenEvidence[],
    priority: InsightBase['priority'],
  ): InsightBase {
    // Exclude ageHours and collection ageHours: the same evidence retains its ID
    // while getting older within the same freshness category.
    const identity = [
      rule,
      report.state,
      quality.freshness,
      quality.reasons,
      quality.blockedRules,
      report.collection?.lastAttempt ?? null,
      report.history.skippedInvalid,
      items.map(({ quality: _quality, ...item }) => item),
    ]
    return {
      id: `${HANDLARBORSEN_INSIGHT_RULE_VERSION}:${encodeURIComponent(JSON.stringify(identity))}`,
      rule,
      ruleVersion: HANDLARBORSEN_INSIGHT_RULE_VERSION,
      title,
      observation,
      evidence: items,
      priority,
      quality,
    }
  }
  if (quality.reasons.length || quality.blockedRules.length) {
    const reason = [
      ...quality.reasons,
      ...quality.blockedRules.map((block) => `${block.rule}: ${block.reason}`),
    ].join(' ')
    insights.push({
      ...base(
        'quality',
        'Underlagets begränsningar',
        reason,
        usable ? MARKETPLACE_METRIC_KEYS.map((key) => evidence(latest, key)) : [],
        'check',
      ),
      kind: 'quality',
      blockedReason: reason,
      nextCheck:
        'Kontrollera rapportens källa, insamlingsaudit och saknade observationer innan nästa bedömning.',
    })
  }
  const allowed = (rule: Rule) =>
    businessAllowed && !quality.blockedRules.some((block) => block.rule === rule)
  if (usable && allowed('company-status')) {
    const registered = known(latest, 'companies_registered_total')!
    const verified = known(latest, 'companies_verified_total')!
    const item = base(
      'company-status',
      'Företagsstatus vid observationen',
      `${registered} registrerade, ${verified} verifierade vid observationen. Populationen kan inkludera stängda företag; populationsdefinitionen är inte källverifierad.`,
      required['company-status'].map((key) => evidence(latest, key)),
      'review',
    )
    insights.push(
      registered > verified
        ? {
            ...item,
            kind: 'proposal',
            blockedReason: null,
            reviewReason:
              'Skillnaden visar inte hur många som väntar på verifiering och är ingen konverteringsgrad.',
            nextCheck: 'Att granska: kontrollera faktiska företagsstatusar i Handlarbörsens admin.',
          }
        : { ...item, kind: 'fact', blockedReason: null },
    )
  }
  if (usable && allowed('bid-window')) {
    const total = known(latest, 'bids_total')!
    const recent = known(latest, 'bids_last_24h')!
    const item = base(
      'bid-window',
      'Bud: total och rullande fönster',
      `${total} bud totalt. ${recent} bud i det angivna rullande 24 h-fönstret. Fönstrets täckning är inte separat verifierad.`,
      required['bid-window'].map((key) => evidence(latest, key)),
      'observe',
    )
    insights.push(
      recent === 0
        ? {
            ...item,
            kind: 'proposal',
            blockedReason: null,
            reviewReason:
              'En observation fastställer varken efterfrågan eller orsak. Rullande fönster jämförs inte mellan dagar.',
            nextCheck:
              'Att granska: kontrollera känt publicerat utbud och invänta jämförbara, verifierade fönster.',
          }
        : { ...item, kind: 'fact', blockedReason: null },
    )
  }
  if (usable && previous && allowed('published-stock')) {
    const delta =
      known(latest, 'vehicles_published_active')! - known(previous, 'vehicles_published_active')!
    insights.push({
      ...base(
        'published-stock',
        'Publicerat utbud mellan observationer',
        `Förändring ${delta > 0 ? '+' : ''}${delta} mellan ${previous.snapshotDate} och ${latest.snapshotDate} (UTC). Två nivåläsningar, ingen orsaksslutsats.`,
        [
          evidence(previous, 'vehicles_published_active'),
          evidence(latest, 'vehicles_published_active'),
        ],
        'observe',
      ),
      kind: 'fact',
      blockedReason: null,
    })
  }
  return { evaluatedAt: Number.isFinite(nowMs) ? now.toISOString() : null, quality, insights }
}
