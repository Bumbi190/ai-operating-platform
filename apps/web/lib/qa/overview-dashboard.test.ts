import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverviewDashboard } from '@/components/platform/overview/OverviewDashboard'
import { overviewFixture } from '../../e2e/atlas-overview-messenger-model'
;(globalThis as any).React = React
const render = (model = overviewFixture()) =>
  renderToStaticMarkup(React.createElement(OverviewDashboard, { model }))
describe('overview presentation', () => {
  it('renders real supplied metrics, routes and Stockholm update time', () => {
    const html = render()
    expect(html).toContain('Översikt')
    expect(html).toContain('/atlas')
    expect(html).toContain('Uppdaterad')
    expect(html).toContain('/dashboard?period=7')
    expect(html).toContain('/dashboard?period=30')
    expect(html).toContain('/projects/test-project')
    expect(html).toContain('14:00')
    expect(html).toContain('Högst 3 körningar per dag')
    expect((html.match(/data-overview-chart=/g) ?? []).length).toBe(2)
  })
  it('shows unavailable and partial series without a chart or false total', () => {
    for (const state of ['unavailable', 'partial'] as const) {
      const html = render(overviewFixture(7, state))
      expect(html).toContain(
        state === 'partial' ? 'Ofullständiga data' : 'Data kunde inte läsas'
      )
      expect(html).not.toContain('data-overview-chart=')
      expect(html).toContain('—')
    }
  })
  it('distinguishes successfully empty data from failure', () => {
    const html = render(overviewFixture(7, 'complete', true))
    expect(html).toContain('0,00')
    expect(html).toContain('Inga registrerade kostnader')
    expect(html).toContain('Inga projekt')
    expect(html).not.toContain('Data kunde inte läsas')
  })
  it('keeps negative corrections visible and unknown statuses counted', () => {
    const model = overviewFixture()
    model.costByDay.value![0].costSek = -2
    model.runsByDay.value![0].counts.future_status = 3
    const html = render(model)
    expect(html).toContain('−2')
    expect(html).toContain('Övrigt')
  })
})
