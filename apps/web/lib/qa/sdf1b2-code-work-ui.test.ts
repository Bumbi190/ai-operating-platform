import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  CodeWorkDetailModel,
  CodeWorkReviewItem,
  CodeWorkReviewQueueModel,
} from '@/lib/atlas/code-work/control-plane/operator-model'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BASE = 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1'

const item: CodeWorkReviewItem = {
  workId: '30000000-0000-4000-8000-000000000001',
  project: { id: '20000000-0000-4000-8000-000000000001', name: 'Syntetiskt projekt', slug: 'syntetiskt-projekt', color: '#22d3ee' },
  objective: 'Avgränsa operatörens kodarbetsbehörighet',
  repository: 'Bumbi190/ai-operating-platform',
  pinnedBaseSha: BASE,
  readPathCount: 2,
  writePathCount: 1,
  workerLabel: 'anthropic · claude-sonnet-4-6',
  commandCount: 2,
  limitsLabel: '8 filer · 128 KiB',
  admissionHash: HASH_A,
  state: 'proposed',
  authorizationStatus: 'pending',
  authorizationExpiresAt: null,
  createdAt: '2026-09-19T08:00:00Z',
  actionable: true,
  cancelable: true,
  detailHref: '/projects/syntetiskt-projekt/code-work/30000000-0000-4000-8000-000000000001',
}

let CodeWorkReviewPanel: typeof import('@/components/platform/vnext/CodeWorkReviewCard').CodeWorkReviewPanel
let CodeWorkDetail: typeof import('@/components/platform/vnext/CodeWorkDetail').CodeWorkDetail

beforeAll(async () => {
  ;({ CodeWorkReviewPanel } = await import('@/components/platform/vnext/CodeWorkReviewCard'))
  ;({ CodeWorkDetail } = await import('@/components/platform/vnext/CodeWorkDetail'))
})

describe('SDF-1B2 rendered operator surfaces', () => {
  it('renders a distinct pending code-work card with exact bounded facts and owner actions', () => {
    const model: CodeWorkReviewQueueModel = { state: 'ok', queue: [item], archive: [], total: 1, filter: null }
    const html = renderToStaticMarkup(createElement(CodeWorkReviewPanel, { model }))
    expect(html).toContain('Kodarbetsbehörighet')
    expect(html).toContain('Ingen worker startas i denna fas')
    expect(html).toContain('Syntetiskt projekt')
    expect(html).toContain('Bumbi190/ai-operating-platform')
    expect(html).toContain(BASE.slice(0, 10))
    expect(html).toContain('2 läs · 1 skriv')
    expect(html).toContain('claude-sonnet-4-6')
    expect(html).toContain('Godkänn')
    expect(html).toContain('Avvisa')
    expect(html).toContain('Visa exakt scope')
    expect(html).not.toContain('brokerToken')
  })

  it('does not offer stale grant/deny actions for a denied item', () => {
    const denied = { ...item, state: 'policy_denied' as const, authorizationStatus: 'denied' as const, actionable: false, cancelable: false }
    const model: CodeWorkReviewQueueModel = { state: 'ok', queue: [], archive: [denied], total: 1, filter: null }
    const html = renderToStaticMarkup(createElement(CodeWorkReviewPanel, { model }))
    expect(html).toContain('Avvisad')
    expect(html).not.toContain('>Godkänn<')
    expect(html).not.toContain('>Avvisa<')
  })

  it('renders every approved detail section, truthful base copy and safe receipt chain', () => {
    const detail: CodeWorkDetailModel = {
      ...item,
      workPackageId: '60000000-0000-4000-8000-000000000001',
      authorizationId: '80000000-0000-4000-8000-000000000001',
      authorizationEventCount: 1,
      authorizedAt: null,
      terminalAt: null,
      terminalReasonCode: null,
      readPaths: ['apps/web/lib', 'apps/web/components'],
      writePaths: ['apps/web/lib/atlas/code-work/control-plane'],
      deniedPaths: [],
      commandIds: ['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'],
      limits: { maxWorkerIterations: 2, maxChangedFiles: 8, maxDiffBytes: 131072, maxTotalRuntimeSeconds: 1200, maxCommandRuntimeSeconds: 300 },
      lifecycle: [{ label: 'Föreslagen', at: '2026-09-19T08:00:00Z' }],
      receipts: [{
        receiptId: '91000000-0000-4000-8000-000000000001', sequence: 1,
        eventType: 'authorization_requested', eventLabel: 'Ägarbeslut begärt', receiptClass: 'control',
        producerType: 'control_plane', producerId: 'authorization', observedAt: '2026-09-19T08:00:00Z',
        recordedAt: '2026-09-19T08:00:00Z', payload: { authorizationId: '80000000-0000-4000-8000-000000000001' },
        payloadHash: HASH_A, previousReceiptHash: null, receiptHash: HASH_B,
      }],
    }
    const html = renderToStaticMarkup(createElement(CodeWorkDetail, { model: detail }))
    for (const heading of ['Uppdrag', 'Repo / scope', 'Worker', 'Kommandon / gränser', 'Authorization', 'Lifecycle', 'Receipts', 'Controls']) {
      expect(html, heading).toContain(heading)
    }
    expect(html).toContain('Föreslagen bas · ännu inte broker-verifierad')
    expect(html).toContain('AUTHORIZED CONTROL PLANE / NO EXECUTION RUNTIME')
    expect(html).toContain('kedjestart')
    expect(html).not.toMatch(/service[_ -]?role|bearer|brokerToken/i)
  })

  it('locks responsive, touch, focus, reduced-motion and forced-colors contracts', () => {
    const css = [
      readFileSync(resolve(process.cwd(), 'components/platform/vnext/CodeWorkReviewCard.module.css'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'components/platform/vnext/CodeWorkDetail.module.css'), 'utf8'),
    ].join('\n')
    expect(css).toMatch(/min-height:\s*2\.75rem/)
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/@media \(max-width: 480px\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/@media \(forced-colors: active\)/)
    expect(css).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
