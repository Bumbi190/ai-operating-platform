/**
 * Read-only CLI preview. Usage:
 *   powershell -NoProfile -File scripts/atlas-model-router/desktop-snapshot.ps1 |
 *     node node_modules/tsx/dist/cli.mjs scripts/atlas-model-router/preview-desktop-snapshot.mts
 *
 * No model/API calls, no writes, no token reads and NO routing authority.
 */
import { readFileSync } from 'node:fs'
import {
  inspectDesktopSnapshot,
  previewRouteFromDesktopSnapshot,
} from '../../apps/web/lib/atlas/model-router/desktop-evidence'
import type { RoutingRequest } from '../../apps/web/lib/atlas/model-router/route'

const nowMs = Date.now()
let input: unknown
try {
  const raw = readFileSync(0, 'utf8')
  if (raw.length > 20_000) throw new Error('snapshot exceeds size bound')
  input = JSON.parse(raw)
} catch {
  input = null
}

const makeRequest = (task: RoutingRequest['task'], allowExternalProcessing: boolean): RoutingRequest => ({
  task,
  minimumQuality: task === 'code_patch' ? 2 : 1,
  dataClassification: 'public',
  allowExternalProcessing,
  observedNowMs: nowMs,
  evidence: [],
  meteredPolicy: {
    humanApproved: false,
    hardSpendGateEnforced: false,
    remainingBudgetSek: null,
    approvedCeilingSek: null,
  },
})

const diagnostic = inspectDesktopSnapshot(input, nowMs)
const simple = previewRouteFromDesktopSnapshot(input, makeRequest('classify', false))
const code = previewRouteFromDesktopSnapshot(input, makeRequest('code_patch', true))
const output = {
  schemaVersion: 'atlas.desktop-readiness.preview.v1',
  mode: 'read_only_diagnostic',
  snapshotState: diagnostic.status,
  snapshotAgeMs: diagnostic.ageMs,
  modelsInstalled: diagnostic.localModels,
  freeSystemRamMB: diagnostic.availableSystemRamMB,
  freeGpuVramMB: diagnostic.availableGpuVramMB,
  localResourceGatePassed: diagnostic.localResourceGatePassed,
  localInferenceSmokePassed: false,
  codexLoginSeen: diagnostic.codexLoginSeen,
  codexEntitlementVerified: false,
  primePilotCredentialPresent: diagnostic.primeCredentialPresent,
  primeHistoricalSyntheticTests: diagnostic.primeHistoricalTests === null ? null : {
    passed: diagnostic.primeHistoricalPasses, total: diagnostic.primeHistoricalTests,
  },
  primeFreshToolSmokeVerified: false,
  localBudget: diagnostic.localBudget,
  blockers: diagnostic.blockers,
  readiness: {
    classify: simple.decision.status,
    codePatch: code.decision.status,
    automaticDispatchAllowed: false,
    requireSignedBrokerEvidence: true,
    requireExplicitHumanApproval: true,
  },
  warning: 'Local diagnostics are not signed Code Broker evidence. No ChatGPT/Codex USD billing information is present.',
}
console.log(JSON.stringify(output, null, 2))
