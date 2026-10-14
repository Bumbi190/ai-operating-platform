import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenCompetitorHistory } from '@/components/platform/vnext/HandlarborsenCompetitorHistory'
import { evaluateCompetitorHistory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'

;(globalThis as unknown as { React: typeof React }).React = React

const now = new Date('2026-10-14T12:00:00.000Z')
const history = evaluateCompetitorHistory([
  { sourceId: 'auto1', checkedAt: '2026-10-12T10:00:00.000Z', status: 'metadata_checked', title: 'Public title A' },
  { sourceId: 'auto1', checkedAt: '2026-10-14T10:00:00.000Z', status: 'metadata_checked', title: 'Public title B' },
], now)
const render = (value: typeof history | null) =>
  renderToStaticMarkup(React.createElement(HandlarborsenCompetitorHistory, { history: value }))

describe('competitor history visualization respects source and activation gate', () => {
  it('shows truthful off state instead of fake chart before storage activation', () => {
    const html = render(null)
    expect(html).toContain('Inväntar lagring')
    expect(html).toContain('inga observationer lagras')
    expect(html).not.toContain('role="img"')
  })
  it('renders only the two real observation dates and audit-bound review proposal', () => {
    if (history.status !== 'ok') throw Error('test fixture must be valid')
    const html = render(history)
    expect(html).toContain('2026-10-12')
    expect(html).toContain('2026-10-14')
    expect(html).not.toContain('2026-10-13')
    expect(html).toContain('1/1 ändrade')
    expect(html).toContain('Ingen jämförelse')
    expect(html).toContain('Public title A')
    expect(html).toContain('Public title B')
    expect(html).toContain('Förslag – inte godkänt eller utfört')
    expect(html).toContain('saknade dagar')
  })
  it('refuses to chart failed or malformed input as a real change', () => {
    const error = evaluateCompetitorHistory([
      { sourceId: 'untrusted', checkedAt: '2026-10-14T10:00:00.000Z', status: 'metadata_checked', title: 'bad' },
    ], now)
    const html = render(error)
    expect(html).toContain('Historiken kunde inte verifieras')
    expect(html).not.toContain('role="img"')
  })
})
