import { createElement } from 'react'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { BrokerSettingsModel, StoredBroker } from '@/lib/atlas/code-broker/types'

;(globalThis as unknown as { React: typeof React }).React = React
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const NOW = '2026-09-19T08:00:00.000Z'
const baseBroker: StoredBroker = {
  brokerId: '40000000-0000-4000-8000-000000000001', enrollmentId: '20000000-0000-4000-8000-000000000001',
  ownerUserId: '10000000-0000-4000-8000-000000000001', hostId: '30000000-0000-4000-8000-000000000001',
  publicJwk: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
  keyThumbprint: 'fingerprint-with-a-deliberately-long-unbroken-value', algorithm: 'ES256', protocolVersion: 1,
  brokerVersion: '0.1.0', buildSha256: 'a'.repeat(64), hostLabel: 'Synthetic Mac', localUidHash: 'b'.repeat(64),
  osVersion: 'macOS synthetic', status: 'pending', allowedRepositoryIds: ['github.com/bumbi190/ai-operating-platform'],
  approvedAt: null, approvedBy: null, lastSeenAt: null, expiresAt: null, revokedAt: null, revokedBy: null,
  revokedReason: null, requestCounter: 0, lastRequestJti: null, lastRequestAt: null, createdAt: NOW, updatedAt: NOW,
}
const model = (over: Partial<BrokerSettingsModel> = {}): BrokerSettingsModel => ({
  capability: { allowed: true, reason: 'allowed' }, brokers: [], openEnrollment: null,
  generatedAt: NOW, readable: true, ...over,
})
let render: (value: BrokerSettingsModel) => string

beforeAll(async () => {
  const { SettingsBrokerPanel } = await import('@/components/platform/vnext/SettingsBrokerPanel')
  render = value => renderToStaticMarkup(createElement(SettingsBrokerPanel, { model: value }))
})

describe('SDF-1C1 Settings broker states', () => {
  it('shows the truthful empty state and start action without work or connectivity claims', () => {
    const html = render(model())
    expect(html).toContain('Ingen broker konfigurerad')
    expect(html).toContain('Starta enrollment')
    expect(html).not.toMatch(/>Online<|Aktivt arbete|Worktree|Worker|Tester/)
  })
  it('separates an issued enrollment from a broker awaiting approval', () => {
    const issued = render(model({ openEnrollment: { enrollmentId: baseBroker.enrollmentId, hostId: baseBroker.hostId, state: 'issued', createdAt: NOW, expiresAt: '2026-09-19T08:10:00.000Z' } }))
    expect(issued).toContain('Enrollment väntar')
    expect(issued).toContain('Ej verifierad')
    const pending = render(model({ brokers: [baseBroker] }))
    expect(pending).toContain('Väntar på godkännande')
    expect(pending).toContain('Godkänn')
    const source = readFileSync(resolve(__dirname, '../../components/platform/vnext/SettingsBrokerPanel.tsx'), 'utf8')
    expect(source).toContain('/api/atlas/code-brokers/${broker.brokerId}/approve')
  })
  it('shows approved identity evidence but never derives an online state from it', () => {
    const html = render(model({ brokers: [{ ...baseBroker, status: 'active', approvedAt: NOW, approvedBy: baseBroker.ownerUserId }] }))
    expect(html).toContain('Godkänd')
    expect(html).toContain(baseBroker.keyThumbprint)
    expect(html).toContain(baseBroker.buildSha256)
    expect(html).toContain('github.com/bumbi190/ai-operating-platform')
    expect(html).not.toMatch(/>Online</)
  })
  it('renders revoked and lost as terminal evidence with no approval action', () => {
    for (const status of ['revoked', 'lost'] as const) {
      const html = render(model({ brokers: [{ ...baseBroker, status, revokedAt: NOW, revokedBy: baseBroker.ownerUserId, revokedReason: status === 'lost' ? 'device_lost' : 'operator_revoked' }] }))
      expect(html).toContain(status === 'lost' ? 'Förlorad' : 'Återkallad')
      expect(html).not.toContain('>Godkänn<')
    }
  })
  it('pins wrapping, touch, forced-colors and mobile action contracts', () => {
    const css = readFileSync(resolve(__dirname, '../../components/platform/vnext/SettingsSurface.module.css'), 'utf8')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('.brokerActions :is(.primary, .secondary), .brokerStart { min-height: 2.75rem; }')
    const source = readFileSync(resolve(__dirname, '../../components/platform/vnext/SettingsBrokerPanel.tsx'), 'utf8')
    expect(source).toContain('${styles.primary} ${styles.brokerStart}')
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.brokerActions/)
  })
})
