import { canonicalJson } from '@/lib/atlas/mission/binding'
import {
  deriveHandlarborsenInsights,
  HANDLARBORSEN_INSIGHT_RULE_VERSION,
  type HandlarborsenInsight,
} from './handlarborsen-insights'
import { buildMarketplaceReport, type MarketplaceReport } from './handlarborsen-marketplace-report'
import {
  exactKeys,
  canonicalTimestamp,
  validateAnalysisSource,
  hashAnalysisSource,
  sha256,
  sourceReportRows,
  type AnalysisSourceEnvelopeV1,
} from './analysis-source-binding'
export type AnalysisRuleId = 'company-status' | 'bid-window'
export interface SaveSelector {
  ruleId: AnalysisRuleId
  ruleVersion: string
  expectedEvidenceHash: string
}
export interface AnalysisReviewDraftV1 {
  schemaVersion: 1
  workflowKey: 'handlarborsen.manual-insight-review'
  projectId: string
  ruleId: AnalysisRuleId
  ruleVersion: string
  originalInsightId: string
  evidenceHash: string
  contentHash: string
  sourceEnvelope: AnalysisSourceEnvelopeV1
  insight: Extract<HandlarborsenInsight, { kind: 'proposal' }>
  manualSteps: readonly string[]
  evaluatedAt: string
  freshUntil: string
}
export function validateSaveSelector(v: unknown): v is SaveSelector {
  return (
    exactKeys(v, ['ruleId', 'ruleVersion', 'expectedEvidenceHash']) &&
    ['company-status', 'bid-window'].includes(v.ruleId as string) &&
    typeof v.ruleVersion === 'string' &&
    v.ruleVersion.length <= 80 &&
    typeof v.expectedEvidenceHash === 'string' &&
    /^[0-9a-f]{64}$/.test(v.expectedEvidenceHash)
  )
}
// Remove clock projections at every quality nesting, while retaining audit observations.
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !['ageHours', 'today', 'todayDate', 'freshness'].includes(k))
        .map(([k, x]) => [k, stable(x)]),
    )
  return v
}
export function stableOriginalInsightId(id: string): unknown {
  const version = id.slice(0, id.indexOf(':'))
  const prefix = version + ':'
  if (!/^handlarborsen-insights-[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) throw Error('invalid_p0_id')
  const parsed = JSON.parse(decodeURIComponent(id.slice(prefix.length)))
  if (!Array.isArray(parsed) || parsed.length !== 8) throw Error('invalid_p0_id')
  // Array slot 2 is the clock-derived freshness category in P0's actual ID schema.
  return [version, ...parsed.map((v, i) => (i === 2 ? null : stable(v)))]
}
export function analysisContentProjection(d: AnalysisReviewDraftV1): unknown {
  const { id: _id, ...insight } = d.insight
  return {
    schemaVersion: d.schemaVersion,
    templateVersion: 1,
    workflowKey: d.workflowKey,
    projectId: d.projectId,
    ruleId: d.ruleId,
    ruleVersion: d.ruleVersion,
    originalInsightIdentity: stableOriginalInsightId(d.originalInsightId),
    evidenceHash: d.evidenceHash,
    insight: stable(insight),
    manualSteps: d.manualSteps,
  }
}
export function buildAnalysisReviewDraft(
  source: AnalysisSourceEnvelopeV1,
  report: MarketplaceReport,
  selector: SaveSelector,
  now: Date,
): { status: 'ok'; draft: AnalysisReviewDraftV1 } | { status: 'conflict' } {
  try {
    if (
      !validateAnalysisSource(source) ||
      !validateSaveSelector(selector) ||
      selector.ruleVersion !== HANDLARBORSEN_INSIGHT_RULE_VERSION ||
      !source.auditReadable ||
      !source.runs.length ||
      source.runs[0].status === 'error' ||
      hashAnalysisSource(source) !== selector.expectedEvidenceHash
    )
      return { status: 'conflict' }
    const observed = source.snapshots[0]?.observed_at
    if (!observed || !Number.isFinite(now.getTime())) return { status: 'conflict' }
    const observedMicros = BigInt(Date.parse(observed)) * BigInt(1000) + BigInt(observed.slice(23, 26)),
      nowMicros = BigInt(now.getTime()) * BigInt(1000)
    if (observedMicros > nowMicros || nowMicros > observedMicros + BigInt(26 * 3600000) * BigInt(1000))
      return { status: 'conflict' }
    const boundReport = buildMarketplaceReport(sourceReportRows(source), now, source.runs)
    // Compare the authoritative P0 report against normalized evidence without changing its original strings.
    function bindingProjection(v: unknown): unknown {
      if (Array.isArray(v)) return v.map(bindingProjection)
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => !['ageHours', 'today', 'todayDate', 'freshness'].includes(k))
            .map(([k, x]) => [
              k,
              ['observedAt', 'capturedAt', 'ranAt'].includes(k) && typeof x === 'string'
                ? canonicalTimestamp(x)
                : bindingProjection(x),
            ]),
        )
      return v
    }
    if (canonicalJson(bindingProjection(report)) !== canonicalJson(bindingProjection(boundReport)))
      return { status: 'conflict' }
    if (
      !report.collection?.lastAttempt ||
      report.collection.latestAttemptFailed ||
      source.runs[0].snapshot_date === null ||
      source.runs[0].ran_at !== canonicalTimestamp(report.collection.lastAttempt.ranAt) ||
      source.runs[0].status !== report.collection.lastAttempt.status
    )
      return { status: 'conflict' }
    const insight = deriveHandlarborsenInsights(report, now).insights.find(
      (i) => i.rule === selector.ruleId && i.kind === 'proposal',
    )
    if (!insight || insight.kind !== 'proposal' || !report.latest) return { status: 'conflict' }
    const draft: AnalysisReviewDraftV1 = {
      schemaVersion: 1,
      workflowKey: 'handlarborsen.manual-insight-review',
      projectId: source.projectId,
      ruleId: selector.ruleId,
      ruleVersion: selector.ruleVersion,
      originalInsightId: insight.id,
      evidenceHash: selector.expectedEvidenceHash,
      contentHash: '',
      sourceEnvelope: structuredClone(source),
      insight,
      manualSteps: [
        'Granska den citerade rapporten',
        insight.nextCheck,
        'Dokumentera resultatet utanför detta analysutkast',
      ],
      evaluatedAt: now.toISOString(),
      freshUntil:
        new Date(Date.parse(report.latest.observedAt) + 26 * 3600000).toISOString().slice(0, 19) +
        source.snapshots[0].observed_at.slice(19),
    }
    draft.contentHash = sha256(canonicalJson(analysisContentProjection(draft)))
    return { status: 'ok', draft }
  } catch {
    return { status: 'conflict' }
  }
}

const INSIGHT_SHAPE: unknown = {
  id: 'string',
  rule: 'string',
  ruleVersion: 'string',
  priority: 'string',
  title: 'string',
  observation: 'string',
  evidence: [
    {
      metricKey: 'string',
      value: 'nullable-number',
      availability: 'string',
      reason: 'nullable-string',
      observedAt: 'string',
      capturedAt: 'string',
      snapshotDate: 'string',
      source: 'string',
      projectId: 'string',
      schemaVersion: 'number',
      snapshotRef: 'string',
      collectorId: 'string',
      collectorVersion: 'null',
      completeness: 'string',
      semanticKind: 'string',
      window: {
        start: 'string',
        end: 'string',
        timezone: 'string',
        complete: 'nullable-boolean',
      },
      quality: {
        reportState: 'string',
        completeness: 'string',
        availableCount: 'nullable-number',
        totalCount: 'number',
        freshness: 'string',
        ageHours: 'nullable-number',
        collection: {
          $nullable: {
            lastSuccess: {
              $nullable: {
                ranAt: 'string',
                snapshotDate: 'string',
                ageHours: 'number',
              },
            },
            lastAttempt: { $nullable: { ranAt: 'string', status: 'string' } },
            today: 'string',
            todayDate: 'string',
            latestAttemptFailed: 'boolean',
          },
        },
        skippedInvalid: 'number',
        reasons: ['string'],
        blockedRules: [{ rule: 'string', reason: 'string' }],
      },
    },
  ],
  quality: {
    reportState: 'string',
    completeness: 'string',
    availableCount: 'nullable-number',
    totalCount: 'number',
    freshness: 'string',
    ageHours: 'nullable-number',
    collection: {
      $nullable: {
        lastSuccess: {
          $nullable: {
            ranAt: 'string',
            snapshotDate: 'string',
            ageHours: 'number',
          },
        },
        lastAttempt: { $nullable: { ranAt: 'string', status: 'string' } },
        today: 'string',
        todayDate: 'string',
        latestAttemptFailed: 'boolean',
      },
    },
    skippedInvalid: 'number',
    reasons: ['string'],
    blockedRules: [{ rule: 'string', reason: 'string' }],
  },
  kind: 'string',
  blockedReason: 'null',
  reviewReason: 'string',
  nextCheck: 'string',
}
function shapeMatches(v: unknown, shape: any): boolean {
  if (typeof shape === 'string') {
    if (shape.startsWith('nullable-') && v === null) return true
    const type = shape.replace('nullable-', '')
    return type === 'null'
      ? v === null
      : type === 'number'
        ? typeof v === 'number' && Number.isFinite(v)
        : typeof v === type
  }
  if (Array.isArray(shape)) return Array.isArray(v) && v.every((x) => shapeMatches(x, shape[0]))
  if (shape.$nullable) return v === null || shapeMatches(v, shape.$nullable)
  return exactKeys(v, Object.keys(shape)) && Object.entries(shape).every(([k, x]) => shapeMatches(v[k], x))
}
export function validateAnalysisReviewDraft(v: unknown): AnalysisReviewDraftV1 | null {
  try {
    if (
      !exactKeys(v, [
        'schemaVersion',
        'workflowKey',
        'projectId',
        'ruleId',
        'ruleVersion',
        'originalInsightId',
        'evidenceHash',
        'contentHash',
        'sourceEnvelope',
        'insight',
        'manualSteps',
        'evaluatedAt',
        'freshUntil',
      ])
    )
      return null
    const source = validateAnalysisSource(v.sourceEnvelope)
    if (
      !source ||
      v.schemaVersion !== 1 ||
      v.workflowKey !== 'handlarborsen.manual-insight-review' ||
      v.projectId !== source.projectId ||
      !['company-status', 'bid-window'].includes(v.ruleId as string) ||
      typeof v.ruleVersion !== 'string' ||
      v.ruleVersion.length > 80 ||
      typeof v.originalInsightId !== 'string' ||
      typeof v.evaluatedAt !== 'string' ||
      new Date(v.evaluatedAt).toISOString() !== v.evaluatedAt ||
      typeof v.freshUntil !== 'string' ||
      !shapeMatches(v.insight, INSIGHT_SHAPE)
    )
      return null
    const d = v as unknown as AnalysisReviewDraftV1
    if (
      d.insight.kind !== 'proposal' ||
      d.insight.rule !== d.ruleId ||
      d.insight.ruleVersion !== d.ruleVersion ||
      d.originalInsightId !== d.insight.id ||
      d.evidenceHash !== hashAnalysisSource(source) ||
      !Array.isArray(d.manualSteps) ||
      d.manualSteps.length !== 3 ||
      d.manualSteps[0] !== 'Granska den citerade rapporten' ||
      d.manualSteps[1] !== d.insight.nextCheck ||
      d.manualSteps[2] !== 'Dokumentera resultatet utanför detta analysutkast'
    )
      return null
    if (d.contentHash !== sha256(canonicalJson(analysisContentProjection(d)))) return null
    const observed = source.snapshots[0]?.observed_at
    if (
      !observed ||
      d.freshUntil !==
        new Date(Date.parse(observed) + 26 * 3600000).toISOString().slice(0, 19) + observed.slice(19)
    )
      return null
    return structuredClone(d)
  } catch {
    return null
  }
}
