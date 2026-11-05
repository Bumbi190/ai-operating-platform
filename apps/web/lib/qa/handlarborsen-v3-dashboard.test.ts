import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenRealDealerKpis } from '@/components/platform/vnext/HandlarborsenRealDealerKpis'

describe('Handlarbörsen owner real-dealer KPI presentation', () => {
  it('renders separate v3 categories and the exact versioned provenance', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenRealDealerKpis, {
      data: { status: 'available', registered: 1, verified: 1,
        testOrganisations: 8, internalOrganisations: 2,
        unclassifiedOrganisations: 0, observedAt: '2026-11-05T11:49:51.834Z' },
    }))
    expect(html).toContain('Riktiga externa handlare')
    expect(html).toContain('Verifierade externa handlare')
    expect(html).toContain('Testorganisationer')
    expect(html).toContain('Interna skyddade bolag')
    expect(html).toContain('classified_real_external_dealers')
    expect(html).toContain('2026-11-05T11:49:51.834Z')
    expect(html).not.toContain('legacy_all_organisations')
  })
  it('never invents zero or falls back to legacy totals when v3 is unavailable', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenRealDealerKpis, {
      data: { status: 'unavailable', reason: 'credential_unavailable' },
    }))
    expect(html).toContain('credential_unavailable')
    expect(html).toContain('Inga antal antas vara noll')
    expect(html).not.toContain('>0</strong>')
    expect(html).not.toContain('>11</strong>')
  })
})
