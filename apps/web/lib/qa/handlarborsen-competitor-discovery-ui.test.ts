import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { HandlarborsenCompetitorDiscovery } from '@/components/platform/vnext/HandlarborsenCompetitorDiscovery'

describe('competitor discovery review panel', () => {
  it('shows independently checked TradingSolutions lead, source, and truthful inactive automation state', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenCompetitorDiscovery))
    expect(html).toContain('Nya konkurrenter att granska')
    expect(html).toContain('TradingSolutions D2D')
    expect(html).toContain('https://www.tradingsolutions.se/d2d/')
    expect(html).toContain('2026-10-15')
    expect(html).toContain('inte aktiverade')
    expect(html).toContain('inväntar granskning')
    expect(html).not.toContain('Nystartat företag')
    expect(html).not.toContain('Upptäckt automatiskt')
    expect(html).not.toContain('onclick=')
  })
  it('labels an actual persisted candidate signal without claiming external notification delivery', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenCompetitorDiscovery, {
      memoryEnabled: true,
      memory: { status: 'ok', awaitingReview: 1, candidates: [{
        host: 'tradingsolutions.se', name: 'TradingSolutions D2D',
        officialUrl: 'https://www.tradingsolutions.se/d2d/',
        observedOn: '2026-10-15', relevance: 'Granskad B2B-handel',
        provenance: 'independently_checked_official_website',
        firstSeenAt: '2026-10-15T11:00:00.000Z',
        lifecycle: 'candidate_for_review', foundedRecently: 'not_verified', executable: false,
      }] },
    }))
    expect(html).toContain('Sparad kandidatsignal')
    expect(html).toContain('Först sparad i Omnira')
    expect(html).toContain('1 kandidat(er)')
    expect(html).toContain('Ingen notis har skickats')
    expect(html).toContain('Spara granskad kandidat')
  })
  it('fails closed when activated memory cannot be verified', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenCompetitorDiscovery, {
      memoryEnabled: true, memory: { status: 'unavailable' },
    }))
    expect(html).toContain('Kandidatminnet är aktiverat men kan inte läsas')
    expect(html).not.toContain('Sparad kandidatsignal')
    expect(html).not.toContain('Spara granskad kandidat')
  })
})
