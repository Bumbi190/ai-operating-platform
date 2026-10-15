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
})
