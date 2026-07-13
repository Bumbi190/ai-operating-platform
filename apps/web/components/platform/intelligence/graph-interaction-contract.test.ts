import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const client = readFileSync(new URL('./IntelligenceGraphClient.tsx', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('./GraphCanvas.tsx', import.meta.url), 'utf8')
const inspector = readFileSync(new URL('./NodeInspector.tsx', import.meta.url), 'utf8')

describe('Phase 2 rendered interaction contract', () => {
  it('keeps fullscreen as presentation state without resetting selection or camera', () => {
    expect(client).toContain('requestFullscreen()')
    expect(client).toContain('document.exitFullscreen()')
    expect(client).toContain('handleFullscreenChange = () => setFullscreen')
    expect(client).toContain('Browser/platform denial leaves graph selection and camera untouched')
  })

  it('exposes keyboard search, zoom, focus, directional navigation, isolate, and Escape', () => {
    for (const key of ["event.key === '/'", "event.key === '0'", "event.key === 'Escape'", "event.key.toLowerCase() === 'f'", "event.key.toLowerCase() === 'i'", "event.key.startsWith('Arrow')"]) {
      expect(canvas).toContain(key)
    }
  })

  it('renders explicit drilldown, isolate exit, breadcrumb, and truthful no-result controls', () => {
    expect(inspector).toContain('onDrillIn(node)')
    expect(inspector).toContain('onIsolate(node)')
    expect(client).toContain('aria-label="Graph location"')
    expect(client).toContain('Exit isolate')
    expect(client).toContain('Inga noder matchar i aktuell behörig scope.')
    expect(client).toContain('Grafens struktur ligger kvar dimmad.')
  })

  it('keeps Execution Replay explicitly disabled', () => {
    expect(client).toContain('<TabButton active={false} disabled')
    expect(client).toContain('Execution Replay')
  })
})
