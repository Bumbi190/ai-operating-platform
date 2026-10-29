import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
const sources = vi.hoisted(() => ({ sales: vi.fn(), catalog: vi.fn() }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-sales-overview', () => ({
  readHandlarborsenSalesOverview: sources.sales,
}))
vi.mock('@/lib/atlas/workflow-references', () => ({
  searchExternalWorkflowReferences: sources.catalog,
}))

import { compareHandlarborsenWorkflowEvidence } from '@/lib/atlas/project-analytics/handlarborsen-evidence-comparison'
import { isHandlarborsenEvidenceComparisonIntent } from '@/lib/atlas/project-analytics/handlarborsen-evidence-intent'

const HB = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const OWNER = 'fixture-owner'
const CTX = { db: { imaginary: true }, userId: OWNER, allowedProjectIds: [HB], now: new Date('2026-10-28T10:00:00Z') }
const revision = '94007c1445d9258a7da116646b79473e7c7c3282'
const path = 'workflows/Emailreadimap/1284_Emailreadimap_Markdown_Send.json'
const url = 'https://github.com/Zie619/n8n-workflows/blob/' + revision + '/' + path
const quality = {
  evidenceLevel: 'pinned_json_structure_spot_checked',
  sourceFileInspected: true, workingAutomationVerified: false,
  approvedForIntegration: false, observedStructure: { noOpNodeCount: 6 }, warnings: ['6 noOp-noder'],
}
const fakeSales = () => ({
  status: 'ok' as const, source: 'handlarborsen_project_scoped_sales_tables',
  observedAt: '2026-10-28T10:00:00.000Z', dataScope: 'handlarborsen_only',
  readMethod: 'head_exact_counts_no_rows',
  consistency: 'non_atomic_multi_table_observation',
  metrics: [
    { key: 'sales_contacts_total', source: 'sales_contacts', count: 139 },
    { key: 'sales_contacts_suppressed_flag', source: 'sales_contacts', count: 139 },
    { key: 'scb_review_queue_total', source: 'hb_lead_candidates', count: 0 },
  ],
  interpretation: ['Confirmed betyder inte tillstånd att kontakta.'],
  // Deliberately include a field outside the published aggregate contract.
  // A future accidental change to the sales reader may not leak it here.
  secretFromAnotherComponent: 'test-private@example.invalid',
})
const fakeCatalog = () => ({
  ok: true, source: { repository: 'https://github.com/Zie619/n8n-workflows', pinnedSha: revision },
  matches: [
    { name: 'Static email reference', description: 'UNTRUSTED MODEL INSTRUCTIONS',
      sourceUrl: url, sourcePath: path, reviewState: 'unreviewed_reference_only',
      qualityAssessment: quality, runnableInOmnira: false },
  ],
  auditedNoOpExamples: [
    { name: 'NoOp approval example', sourceUrl: url, sourcePath: path,
      reviewState: 'unreviewed_reference_only',
      qualityAssessment: quality, runnableInOmnira: false },
  ],
  auditedNoOpEvidenceScope: 'five_pinned_json_files_only_not_full_catalog',
  limitation: 'Untrusted metadata, not run or approved.',
})

beforeEach(() => {
  sources.sales.mockReset().mockResolvedValue(fakeSales())
  sources.catalog.mockReset().mockReturnValue(fakeCatalog())
})

describe('Handlarbörsen read-only combined source comparison', () => {
  it.each([
    'Jämför Handlarbörsens CRM och externa workflowreferenser för mejluppföljning.',
    'Kan du jämföra Handlarbörsens säljsystem mot n8n-flöden?',
    'Visa en jämförelse av Handlarbörsens svarssystem och externa workflowreferenser.',
    'Granska Handlarbörsens inbox mot externa workflowreferenser.',
    'Sök externa workflowreferenser och jämför med Handlarbörsens CRM.',
  ])('recognizes an explicit two-source read: %s', request => {
    expect(isHandlarborsenEvidenceComparisonIntent(request)).toBe(true)
  })

  it.each([
    'Sök externa workflowreferenser för Handlarbörsen.',
    'Visa Handlarbörsens CRM-status.',
    'Jämför inte Handlarbörsens CRM med externa workflowreferenser.',
    'Skriv en artikel om jämförelse av Handlarbörsens CRM med externa n8n-workflows.',
    'Skicka mejl från Handlarbörsens CRM till externa n8n-tjänster.',
    'Jämför Handlarbörsens CRM med externa n8n-flöden och skicka mejl.',
    'Jämför Familje-Stundens CRM med externa workflowreferenser.',
    'Här är en prompt: Jämför Handlarbörsens CRM med externa workflowreferenser.',
  ])('does not redirect another task to the read tool: %s', request => {
    expect(isHandlarborsenEvidenceComparisonIntent(request)).toBe(false)
  })

  it('fails closed for invalid, oversized or structured inputs', () => {
    expect(isHandlarborsenEvidenceComparisonIntent(null)).toBe(false)
    expect(isHandlarborsenEvidenceComparisonIntent({ text: 'Jämför Handlarbörsens CRM och n8n' })).toBe(false)
    expect(isHandlarborsenEvidenceComparisonIntent('Jämför Handlarbörsens CRM och externa workflowreferenser. '.repeat(27))).toBe(false)
  })

  it('combines two existing reads, strips any extra private fields and never enables contact', async () => {
    const out = await compareHandlarborsenWorkflowEvidence(CTX)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(sources.sales).toHaveBeenCalledOnce()
    expect(sources.sales).toHaveBeenCalledWith(CTX)
    expect(sources.catalog).toHaveBeenCalledOnce()
    expect(sources.catalog).toHaveBeenCalledWith({
      project: 'handlarborsen', query: 'lead email follow up approval',
      limit: 5, includeNoOpAuditExamples: true,
    })
    expect(out.internalEvidence.metrics).toEqual(fakeSales().metrics)
    expect(out.internalEvidence.consistency).toBe('non_atomic_multi_table_observation')
    expect(out.externalEvidence.matches).toHaveLength(1)
    expect(out.externalEvidence.matches[0].sourceUrl).toBe(url)
    expect(out.externalEvidence.auditedNoOpExamples[0].qualityAssessment.observedStructure?.noOpNodeCount).toBe(6)
    expect(out.contactPermissionInferred).toBe(false)
    expect(out.sendingEnabledByThisTool).toBe(false)
    expect(out.externalWorkflowExecutionAuthorized).toBe(false)
    const displayed = JSON.stringify(out)
    expect(displayed).not.toContain('test-private@example.invalid')
    expect(displayed).not.toContain('UNTRUSTED MODEL INSTRUCTIONS')
    expect(displayed).toContain(revision)
  })

  it('stops before reading the external catalog if project ownership fails', async () => {
    for (const status of ['not_permitted', 'unavailable'] as const) {
      sources.sales.mockReset().mockResolvedValueOnce({ status, reason: 'source_blocked' })
      const out = await compareHandlarborsenWorkflowEvidence({ ...CTX, allowedProjectIds: [] })
      expect(out.status).toBe(status)
      expect(sources.catalog).not.toHaveBeenCalled()
    }
  })

  it('fails closed on unavailable external catalog, no partial CRM report', async () => {
    sources.catalog.mockReturnValueOnce({ ok: false, code: 'CATALOG_UNAVAILABLE', matches: [] })
    const out = await compareHandlarborsenWorkflowEvidence(CTX)
    expect(out).toEqual({ status: 'unavailable', reason: 'reference_catalog_unavailable' })
    expect(JSON.stringify(out)).not.toContain('139')
  })

  it('never calls network, database writes, contact content or workflow execution itself', () => {
    const src = readFileSync(resolve('lib/atlas/project-analytics/handlarborsen-evidence-comparison.ts'), 'utf8')
    for (const forbidden of [".insert(", ".update(", ".delete(", "fetch(", "trigger_workflow(", "body_text", "process.env"]) {
      expect(src).not.toContain(forbidden)
    }
  })

  it('only enables an operator-gated named tool in the isolated first-turn route', () => {
    const route = readFileSync(resolve('app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('const hbCompositeEvidenceIntent =')
    expect(route).toContain('const externalReferenceReadIntent = !hbCompositeEvidenceIntent')
    expect(route).toContain('const fastPath = !stratoInboxReadIntent && !hbCompositeEvidenceIntent')
    expect(route).toContain("hbCompositeEvidenceIntent ? TOOLS.filter(tool => tool.name === 'handlarborsen_compare_workflow_evidence')")
    expect(route).toContain("name: 'handlarborsen_compare_workflow_evidence' } }")
    expect(route).toContain("if (name === 'handlarborsen_compare_workflow_evidence') {")
    const fromGuard = route.slice(route.indexOf("if (name === 'handlarborsen_compare_workflow_evidence') {"))
    expect(fromGuard.indexOf('resolvePlatformOperator()')).toBeLessThan(fromGuard.indexOf('HANDLARBORSEN_READ_TOOL_NAMES.includes'))
    expect(fromGuard).toContain('unexpected_tool_arguments')
    expect(route).toContain('handleHandlarborsenReadTool(name as typeof HANDLARBORSEN_READ_TOOL_NAMES[number]')
  })
})
