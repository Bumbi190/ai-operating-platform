import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import NovaBridgePage from '../../app/(platform)/nova-bridge/page'

const { state } = vi.hoisted(() => ({ state: vi.fn() }))
vi.mock('@/components/platform/os/NovaBridgeRuntime', () => ({ useNovaBridge: state }))

describe('Nova Bridge connection guidance', () => {
  beforeAll(() => vi.stubGlobal('React', React))
  afterAll(() => vi.unstubAllGlobals())

  function render(phase: string, voiceAuthorized: boolean, nativeVoice: boolean) {
    state.mockReturnValue({ phase, voiceAuthorized, nativeVoice, voiceAvailable: true,
      voiceStatus: nativeVoice ? 'Windows · Sanna' : 'Lyssnar', voiceMicActive: true })
    return renderToStaticMarkup(React.createElement(NovaBridgePage))
  }

  it('offers the next desktop action after native voice is authorized', () => {
    const html = render('paired', true, true)
    expect(html).toContain('Nova är ansluten')
    expect(html).toContain('Hej Nova, starta Spotify')
    expect(html).toContain('LIVE-raden')
    expect(html).not.toContain('Koppla Windows-röst')
    expect(html).not.toContain('Aktivera mikrofon')
  })

  it('shows the two real mode choices before the voice grant', () => {
    const html = render('paired', false, false)
    expect(html).toContain('Koppla Windows-röst (Sanna)')
    expect(html).toContain('Använd webbläsarens mikrofon')
    expect(html).not.toContain('Nova är ansluten')
  })

  it('keeps browser and disconnected sessions distinct from the desktop microphone', () => {
    expect(render('paired', true, false)).not.toContain('LIVE-raden')
    const lost = render('failed', true, true)
    expect(lost).toContain('Frånkopplad')
    expect(lost).not.toContain('LIVE-raden')
    expect(lost).not.toContain('Avsluta röstsamtal')
  })
})
