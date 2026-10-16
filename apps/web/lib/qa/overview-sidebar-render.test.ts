import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseFragment } from 'parse5'
import { Sidebar } from '@/components/platform/Sidebar'
import { AtlasMobileNav } from '@/components/platform/vnext/AtlasMobileNav'
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}))
;(globalThis as any).React = React
function links(html: string) {
  const result: any[] = []
  function text(node: any): string {
    return node.nodeName === '#text'
      ? node.value
      : (node.childNodes ?? []).map(text).join('')
  }
  function walk(node: any) {
    if (node.tagName === 'a')
      result.push({
        text: text(node).trim(),
        href: node.attrs.find((a: any) => a.name === 'href')?.value
      })
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(parseFragment(html))
  return result
}
describe('rendered overview links', () => {
  it.each(['vnext', 'legacy'] as const)(
    'uses the real primary href in the %s sidebar',
    (uiGeneration) => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, { projects: [], uiGeneration })
      )
      expect(links(html).find((l) => l.text === 'Översikt')?.href).toBe(
        uiGeneration === 'vnext' ? '/dashboard?ui=vnext' : '/dashboard'
      )
      expect(links(html).find((l) => l.text === 'Atlas')?.href).toBe('/atlas')
    }
  )
  it('keeps collaborator navigation contained in the rendered sidebar', () => {
    const html = renderToStaticMarkup(
      React.createElement(Sidebar, {
        projects: [],
        uiGeneration: 'vnext',
        readOnly: true
      })
    )
    expect(links(html).find((l) => l.text === 'Översikt')?.href).toBe(
      '/organization'
    )
  })
  it('uses Overview as the mobile Omnira home link', () => {
    const html = renderToStaticMarkup(React.createElement(AtlasMobileNav))
    expect(links(html).find((l) => l.text === 'OMNIRA')?.href).toBe(
      '/dashboard?ui=vnext'
    )
  })
})
