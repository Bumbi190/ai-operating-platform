import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KpiOverview } from '@/components/platform/vnext/KpiOverview'
;(globalThis as unknown as { React: typeof React }).React = React

const headline = [
  { key: 'companies_registered_total', label: 'Registrerade företag', value: 10, note: '0 sedan 2026-10-10' },
  { key: 'companies_verified_total', label: 'Verifierade företag', value: 6, note: null },
  { key: 'vehicles_published_active', label: 'Publicerade fordon', value: 2, note: null },
  { key: 'vehicles_reserved', label: 'Reserverade fordon', value: 2, note: null },
  { key: 'bids_total', label: 'Bud totalt', value: 2, note: null },
  { key: 'deals_completed_total', label: 'Slutförda affärer totalt', value: null, note: 'Ingen verifierad uppgift' },
]

const render = (prominent: boolean) => renderToStaticMarkup(
  createElement(KpiOverview, {
    titleId: 'test-dashboard',
    kicker: 'Marknadsplats · Nyckeltal',
    headline,
    activityTitle: 'Senaste 24 h',
    activityCaption: 'Inga jämförbara dagar',
    activity: [],
    meta: [],
    notices: [],
    historyTitle: 'Historisk utveckling',
    historyText: 'Endast verifierad historik.',
    reportHref: null,
    reportLabel: '',
    prominent,
  }),
)

describe('Handlarbörsen dashboard visual v2 presentation contracts', () => {
  it('adds six icons only in explicitly prominent KPI views without inventing trends', () => {
    const html = render(true)
    expect(html).toContain('data-prominent="true"')
    expect((html.match(/data-visual="true"/g) ?? [])).toHaveLength(6)
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(6)
    expect(html).toContain('Registrerade företag')
    expect(html).toContain('Ingen verifierad uppgift')
    expect(html).toContain('Okänt')
    expect(html).toContain('0 sedan 2026-10-10')
    expect(html).not.toContain('<canvas')
  })

  it('leaves generic nonprominent projects without the Handlarbörsen icon layout', () => {
    const html = render(false)
    expect(html).not.toContain('data-prominent="true"')
    expect(html).not.toContain('data-visual="true"')
    expect(html).toContain('Slutförda affärer totalt')
    expect(html).toContain('Okänt')
  })
})
