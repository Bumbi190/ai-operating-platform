/**
 * Structural observations for FIVE pinned third-party JSON source files.
 * These are NOT approvals of code quality, licensing, functionality, sending
 * privileges or installation. No executable third-party JSON is stored here.
 */
export const SOURCE_AUDIT_PIN = '94007c1445d9258a7da116646b79473e7c7c3282'

const OBSERVATIONS = Object.freeze({
  'workflows/Emailreadimap/1284_Emailreadimap_Markdown_Send.json': Object.freeze({
    nodes: 18, connections: 19, noOp: 6, emailActions: 2, httpRequests: 0, credentialRefs: 7,
  }),
  'workflows/Emailreadimap/1427_Emailreadimap_Manual_Send_Webhook.json': Object.freeze({
    nodes: 31, connections: 39, noOp: 12, emailActions: 2, httpRequests: 2, credentialRefs: 13,
  }),
  'workflows/Emailreadimap/1277_Emailreadimap_Manual_Send_Webhook.json': Object.freeze({
    nodes: 26, connections: 42, noOp: 15, emailActions: 1, httpRequests: 2, credentialRefs: 14,
  }),
  'workflows/Emailsend/1628_Emailsend_Code_Automation_Webhook.json': Object.freeze({
    nodes: 16, connections: 15, noOp: 0, emailActions: 1, httpRequests: 2, credentialRefs: 0,
  }),
  'workflows/Manual/0024_Manual_Clearbit_Send_Triggered.json': Object.freeze({
    nodes: 3, connections: 0, noOp: 0, emailActions: 0, httpRequests: 0, credentialRefs: 1,
  }),
})

export const AUDITED_SOURCE_PATHS = Object.freeze(Object.keys(OBSERVATIONS))

/**
 * Model-visible, read-only cautionary evidence. Never represents a runtime
 * execution test or authorizes running an external workflow.
 */
export function sourceAuditFor(path, pinnedSha, metadataNodeCount) {
  const data = pinnedSha === SOURCE_AUDIT_PIN &&
    typeof path === 'string' &&
    Object.hasOwn(OBSERVATIONS, path)
    ? OBSERVATIONS[path]
    : null

  if (!data) {
    return {
      evidenceLevel: 'metadata_only_unverified',
      sourceFileInspected: false,
      workingAutomationVerified: false,
      approvedForIntegration: false,
      observedStructure: null,
      warnings: ['Endast katalogmetadata. Workflowfilens funktion och licens har inte kontrollerats.'],
    }
  }

  const warnings = ['Endast JSON-strukturen är stickprovsgranskad. Ingen körning, säkerhets- eller licensgranskning.']
  if (data.noOp > 0) warnings.push(
    String(data.noOp) + ' noOp-noder (platshållare); namngivna AI-steg får inte beskrivas som fungerande.')
  if (data.connections === 0) warnings.push(
    'Inga anslutna steg i connections; detta är inte en verifierad körbar automation.')
  if (data.emailActions > 0) warnings.push(
    String(data.emailActions) + ' Gmail/mejl-noder kan ha externa effekter; ingen leverans eller aktivering är godkänd.')
  if (data.credentialRefs > 0) warnings.push(
    String(data.credentialRefs) + ' noder innehåller credential-referenser (inga hemlighetsvärden ingår i granskningen).')
  if (Number.isSafeInteger(metadataNodeCount) && metadataNodeCount !== data.nodes) warnings.push(
    'Indexet uppger ' + String(metadataNodeCount) + ' noder; källfilen innehåller ' +
    String(data.nodes) + '. Indexmetadata är inaktuell.')

  return {
    evidenceLevel: 'pinned_json_structure_spot_checked',
    sourceFileInspected: true,
    workingAutomationVerified: false,
    approvedForIntegration: false,
    observedStructure: {
      nodeCount: data.nodes,
      connectionCount: data.connections,
      noOpNodeCount: data.noOp,
      emailActionNodeCount: data.emailActions,
      httpRequestNodeCount: data.httpRequests,
      credentialReferenceNodeCount: data.credentialRefs,
    },
    warnings,
  }
}
