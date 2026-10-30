import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AtlasInboxNotice } from '@/components/platform/vnext/AtlasInboxNotice'
import { AtlasInboxContext, AtlasInboxProvider } from '@/components/platform/vnext/AtlasInboxProvider'
import type { InboxSummaryState } from '@/lib/atlas/project-analytics/handlarborsen-inbox-summary-client'
;(globalThis as unknown as { React: typeof React }).React = React
const render = (state: InboxSummaryState, audience: 'owner'|'collaborator' = 'owner') =>
  renderToStaticMarkup(React.createElement(AtlasInboxContext.Provider, {
    value: { state, audience, refresh: vi.fn() },
  }, React.createElement(AtlasInboxNotice)))
describe('Atlas inbox in the shared shell', () => {
  it('renders nothing outside its authorized provider or while disabled', () => {
    expect(renderToStaticMarkup(React.createElement(AtlasInboxNotice))).toBe('')
    expect(renderToStaticMarkup(React.createElement(AtlasInboxProvider, { audience:null, children:React.createElement(AtlasInboxNotice) }))).toBe('')
    expect(render({status:'hidden'})).toBe('')
  })
  it('shows verified unread count and the personal project destination', () => {
    const html = render({status:'ok',unreadCount:2,totalCount:3},'collaborator')
    expect(html).toContain('Atlas inkorg, 2 olästa')
    expect(html).toContain('2 olästa av 3 sparade notiser')
    expect(html).toContain('/organization/projects/handlarborsen/competitors#hb-atlas-inbox-title')
    expect(html).not.toContain('href="/projects/')
    expect(html).toContain('Öppna Konkurrentspanaren')
    expect(html).not.toContain('Markera som läst')
  })
  it('shows a verified empty inbox without a false new-notice badge', () => {
    const html=render({status:'ok',unreadCount:0,totalCount:0})
    expect(html).toContain('Inga notiser har skapats för ditt konto')
    expect(html).not.toContain('data-unread="true"')
  })
  it.each(['loading','unavailable'] as const)('renders %s as unknown, never zero', status => {
    const html=render({status})
    expect(html).toContain('antal olästa okänt')
    expect(html).not.toContain('0 olästa')
  })
})
