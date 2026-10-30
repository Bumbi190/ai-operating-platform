import { describe, expect, it } from 'vitest'
import * as React from 'react'

// Vitest transpiles existing Next.js JSX using the classic runtime.
;(globalThis as any).React = React
const { createElement } = React
import { renderToStaticMarkup } from 'react-dom/server'
import { InstagramGrowthCard } from '../../app/(platform)/atlas/operations/InstagramGrowthCard'
import { summarizeInstagramPerformance, type GrowthBrand } from '../content-growth/instagram-metrics'
import type { InstagramGrowthPanel } from '../content-growth/instagram-read'

function readyPanel(brand: GrowthBrand, n: number): InstagramGrowthPanel {
  return {
    brand, status: 'ready', lastFetchedAt: new Date().toISOString(), skippedUnknownViews: 0,
    summary: summarizeInstagramPerformance(brand, Array.from({ length: n }, (_, i) => ({
      id: brand + i, brand, views: i + 40, reach: 100,
      shares: 4, saves: 3, follows: null,
    }))),
  }
}
const html = (p: InstagramGrowthPanel) => renderToStaticMarkup(createElement(InstagramGrowthCard, { panel: p }))

describe('Atlas Operations Instagram proposals stay read-only in rendered HTML', () => {
  it('shows family sample warning rather than claiming a winning format', () => {
    const out = html(readyPanel('familje-stunden', 2))
    expect(out).toContain('Samla fler jämförbara inlägg')
    expect(out).toContain('minst 4 ytterligare')
    expect(out).toContain('Endast ett förslag')
    expect(out).not.toContain('AI-nyhetsvideos')
    expect(out).not.toContain('<button')
    expect(out).not.toContain('<form')
  })
  it('shows The Prompt hook experiment with a review-only contract', () => {
    const out = html(readyPanel('the-prompt', 18))
    expect(out).toContain('två sakliga hook-vinklar')
    expect(out).toContain('nyheten först')
    expect(out).toContain('48-timmarsfönster')
    expect(out).toContain('utan godkännande')
    expect(out).not.toContain('Nova/Plings')
  })
  it('never renders inaccessible project data or advice from an unavailable source', () => {
    const inaccessible: InstagramGrowthPanel = { brand: 'the-prompt', status: 'no_access',
      summary: null, lastFetchedAt: null, skippedUnknownViews: 0 }
    expect(html(inaccessible)).toBe('')
    const out = html({ ...inaccessible, status: 'unavailable' })
    expect(out).toContain('kunde inte läsas')
    expect(out).not.toContain('Atlas föreslår experiment')
  })
})
