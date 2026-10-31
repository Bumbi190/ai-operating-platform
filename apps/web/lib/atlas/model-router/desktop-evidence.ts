/**
 * Read-only inspection of Windows desktop readiness reports.
 *
 * SECURITY BOUNDARY: Desktop PowerShell JSON is UNATTESTED. It can be copied,
 * replayed or edited, so it may inform an operator UI but must NEVER become
 * trusted WorkerEvidence or authorize a model/Code Broker dispatch.
 *
 * A future authenticated Code Broker protocol must verify origin + freshness +
 * task-bound capability and rerun policy checks. Do NOT add a "trusted" flag
 * controlled by a client or by this snapshot.
 */
import { routeModel, type RoutingRequest } from './route'

export const DESKTOP_SNAPSHOT_VERSION = 'atlas.desktop-readiness.snapshot.v1' as const
const MAX_AGE_MS = 5 * 60 * 1000

type BudgetView = Readonly<{
  date: string | null
  localApiBudgetLimitUsd: number | null
  localApiReservedUsd: number | null
  localCodexRunLimit: number | null
  localCodexRunSlotsRemaining: number | null
  actualCodexUsdKnown: false
}>

export interface DesktopDiagnostic {
  readonly status: 'observed' | 'stale' | 'invalid'
  readonly ageMs: number | null
  readonly localModels: readonly string[]
  readonly localResourceGatePassed: boolean
  readonly inferenceSmokePassed: false
  readonly availableSystemRamMB: number | null
  readonly availableGpuVramMB: number | null
  readonly codexLoginSeen: boolean
  readonly codexEntitlementVerified: false
  readonly primeHistoricalTests: number | null
  readonly primeHistoricalPasses: number | null
  readonly primeCredentialPresent: boolean
  readonly primeFreshToolSmokeVerified: false
  readonly localBudget: BudgetView | null
  readonly blockers: readonly string[]
  readonly brokerAttested: false
  readonly routingEvidenceTrusted: false
  readonly dispatchAuthorized: false
}

const obj = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null

const keys = (r: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(r).sort().join('|') === [...expected].sort().join('|')

const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max

const amount = (v: unknown, max = 1_000_000): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max

const isDay = (v: unknown): v is string =>
  typeof v === 'string' && /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(v) &&
  !Number.isNaN(Date.parse(v + 'T00:00:00Z')) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v

const stockholmDayAt = (when: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(when))
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return fields.year + '-' + fields.month + '-' + fields.day
}

const stamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) &&
  Number.isFinite(Date.parse(v))

const modelName = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(v)

function parse(input: unknown): null | {
  readonly ageAnchorMs: number
  readonly models: readonly string[]
  readonly freeRamMB: number | null
  readonly freeVramMB: number | null
  readonly resourceGate: boolean
  readonly codexLoginSeen: boolean
  readonly primeCredentialPresent: boolean
  readonly primeHistoricalTests: number | null
  readonly primeHistoricalPasses: number | null
  readonly budget: BudgetView | null
  readonly budgetState: 'local_ledger_read' | 'unavailable'
  readonly preflightState: 'observed' | 'unavailable'
  readonly historicalState: string
} {
  const x = obj(input)
  if (!x || !keys(x, [
    'schemaVersion', 'capturedAtMs', 'origin', 'brokerAttested',
    'dispatchAuthorized', 'preflight', 'primePilot', 'budget', 'note',
  ]) || x.schemaVersion !== DESKTOP_SNAPSHOT_VERSION ||
      x.origin !== 'unattested_windows_local' ||
      x.brokerAttested !== false || x.dispatchAuthorized !== false ||
      !integer(x.capturedAtMs, 1) || typeof x.note !== 'string' ||
      x.note.length > 250) return null

  const p = obj(x.preflight), a = obj(x.primePilot), b = obj(x.budget)
  if (!p || !a || !b ||
      !keys(p, ['state', 'freeRamMB', 'gpu', 'localModels',
        'ollamaServer', 'resourceGatePassed', 'inferenceSmokePassed', 'codexLoginSeen']) ||
      !keys(a, ['credentialFilePresent', 'entitlementVerified',
        'toolSmokeFresh', 'pilotHumanApproved', 'historicalTestState',
        'historicalTestCount', 'historicalTestPass', 'historicalReportTimestamp']) ||
      !keys(b, ['state', 'day', 'timezone', 'localApiBudgetLimitUsd',
        'localApiReservedUsd', 'localCodexRunLimit',
        'localCodexRunSlotsRemaining', 'actualCodexUsdKnown'])) return null

  const preflightState = p.state
  const budgetState = b.state
  if (!['observed', 'unavailable'].includes(preflightState as string) ||
      !['local_ledger_read', 'unavailable'].includes(budgetState as string) ||
      !Array.isArray(p.localModels) || p.localModels.length > 32 ||
      !p.localModels.every(modelName) ||
      new Set(p.localModels).size !== p.localModels.length ||
      typeof p.ollamaServer !== 'boolean' ||
      typeof p.resourceGatePassed !== 'boolean' ||
      p.inferenceSmokePassed !== false ||
      typeof p.codexLoginSeen !== 'boolean' ||
      typeof a.credentialFilePresent !== 'boolean' ||
      a.entitlementVerified !== false || a.toolSmokeFresh !== false ||
      a.pilotHumanApproved !== false ||
      !['historical_locally_consistent', 'inconsistent', 'unavailable'].includes(a.historicalTestState as string) ||
      !integer(a.historicalTestCount, 0, 10000) ||
      !integer(a.historicalTestPass, 0, 10000) ||
      a.historicalTestPass > a.historicalTestCount ||
      (a.historicalReportTimestamp !== null && !stamp(a.historicalReportTimestamp)) ||
      b.timezone !== 'Europe/Stockholm' || b.actualCodexUsdKnown !== false) return null

  const gpu = p.gpu === null ? null : obj(p.gpu)
  if (gpu && (!keys(gpu, ['name', 'freeVramMB', 'totalVramMB', 'temperatureC']) ||
      typeof gpu.name !== 'string' || gpu.name.length > 160 ||
      !integer(gpu.totalVramMB, 0, 1_000_000) ||
      !integer(gpu.freeVramMB, 0, gpu.totalVramMB) ||
      !integer(gpu.temperatureC, 0, 160))) return null
  if (p.gpu !== null && !gpu) return null

  if (preflightState === 'unavailable' &&
      (p.freeRamMB !== null || gpu !== null || p.localModels.length !== 0 ||
       p.ollamaServer !== false || p.resourceGatePassed !== false ||
       p.codexLoginSeen !== false)) return null
  if (preflightState === 'observed' && !integer(p.freeRamMB, 0, 1_000_000)) return null
  if (p.resourceGatePassed &&
      (preflightState !== 'observed' || p.ollamaServer !== true || gpu === null ||
       (p.freeRamMB as number) < 4096 || (gpu.freeVramMB as number) < 4096 ||
       (gpu.temperatureC as number) >= 80)) return null

  const goodHistorical = a.historicalTestState === 'historical_locally_consistent'
  if (goodHistorical && (!integer(a.historicalTestCount, 1) ||
      a.historicalTestPass !== a.historicalTestCount ||
      a.historicalReportTimestamp === null ||
      Date.parse(a.historicalReportTimestamp as string) > (x.capturedAtMs as number))) return null

  let budget: BudgetView | null = null
  if (budgetState === 'local_ledger_read') {
    if (!isDay(b.day) || !amount(b.localApiBudgetLimitUsd, 1000) ||
        !amount(b.localApiReservedUsd, 1000) ||
        !integer(b.localCodexRunLimit, 0, 100) ||
        !integer(b.localCodexRunSlotsRemaining, 0, b.localCodexRunLimit as number)) return null
    // Daily ledger must match the same Stockholm-local calendar day as this probe.
    if (b.day !== stockholmDayAt(x.capturedAtMs as number)) return null
    budget = {
      date: b.day as string, localApiBudgetLimitUsd: b.localApiBudgetLimitUsd as number,
      localApiReservedUsd: b.localApiReservedUsd as number,
      localCodexRunLimit: b.localCodexRunLimit as number,
      localCodexRunSlotsRemaining: b.localCodexRunSlotsRemaining as number,
      actualCodexUsdKnown: false,
    }
  } else if (b.day !== null || b.localApiBudgetLimitUsd !== null ||
             b.localApiReservedUsd !== null || b.localCodexRunLimit !== null ||
             b.localCodexRunSlotsRemaining !== null) return null

  return {
    ageAnchorMs: x.capturedAtMs as number,
    models: Object.freeze([...(p.localModels as string[])]),
    freeRamMB: p.freeRamMB as number | null,
    freeVramMB: gpu ? gpu.freeVramMB as number : null,
    resourceGate: p.resourceGatePassed as boolean,
    codexLoginSeen: p.codexLoginSeen as boolean,
    primeCredentialPresent: a.credentialFilePresent as boolean,
    primeHistoricalTests: goodHistorical ? a.historicalTestCount as number : null,
    primeHistoricalPasses: goodHistorical ? a.historicalTestPass as number : null,
    budget, budgetState: budgetState as 'local_ledger_read' | 'unavailable',
    preflightState: preflightState as 'observed' | 'unavailable',
    historicalState: a.historicalTestState as string,
  }
}

export function inspectDesktopSnapshot(input: unknown, observedNowMs: number): DesktopDiagnostic {
  const x = integer(observedNowMs, 1) ? parse(input) : null
  const invalid: DesktopDiagnostic = {
    status: 'invalid', ageMs: null, localModels: [],
    localResourceGatePassed: false, inferenceSmokePassed: false,
    availableSystemRamMB: null, availableGpuVramMB: null,
    codexLoginSeen: false, codexEntitlementVerified: false,
    primeHistoricalTests: null, primeHistoricalPasses: null,
    primeCredentialPresent: false, primeFreshToolSmokeVerified: false,
    localBudget: null, blockers: ['invalid_snapshot', 'broker_attestation_missing'],
    brokerAttested: false, routingEvidenceTrusted: false, dispatchAuthorized: false,
  }
  if (!x) return invalid
  const ageMs = observedNowMs - x.ageAnchorMs
  const stale = ageMs < 0 || ageMs > MAX_AGE_MS
  const blockers = [
    'broker_attestation_missing',
    'inference_smoke_not_proven',
    'codex_quota_unverified',
    'pilot_human_approval_missing',
    ...(stale ? ['snapshot_stale_or_future'] : []),
    ...(x.preflightState !== 'observed' ? ['preflight_unavailable'] : []),
    ...(!x.resourceGate ? ['local_resources_unavailable'] : []),
    ...(x.budgetState !== 'local_ledger_read' ? ['pilot_budget_unavailable'] : []),
    ...(x.budget && x.budget.localCodexRunSlotsRemaining === 0 ? ['pilot_daily_run_limit_reached'] : []),
  ]
  return {
    status: stale ? 'stale' : 'observed', ageMs,
    localModels: x.models,
    localResourceGatePassed: x.resourceGate,
    inferenceSmokePassed: false,
    availableSystemRamMB: x.freeRamMB,
    availableGpuVramMB: x.freeVramMB,
    codexLoginSeen: x.codexLoginSeen,
    codexEntitlementVerified: false,
    primeHistoricalTests: x.primeHistoricalTests,
    primeHistoricalPasses: x.primeHistoricalPasses,
    primeCredentialPresent: x.primeCredentialPresent,
    primeFreshToolSmokeVerified: false,
    localBudget: x.budget,
    blockers, brokerAttested: false, routingEvidenceTrusted: false,
    dispatchAuthorized: false,
  }
}

/**
 * A UI-only preview. It deliberately discards ALL untrusted WorkerEvidence,
 * including request.evidence: no desktop JSON may promote a candidate.
 */
export function previewRouteFromDesktopSnapshot(
  snapshot: unknown,
  request: RoutingRequest,
): {
  readonly diagnostic: DesktopDiagnostic
  readonly decision: ReturnType<typeof routeModel>
} {
  return {
    diagnostic: inspectDesktopSnapshot(snapshot, request?.observedNowMs),
    decision: routeModel({ ...request, evidence: [] }),
  }
}
