import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => vi.unstubAllGlobals())

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement('a', { href }, children) }))
vi.mock('@/lib/atlas/conversation/provider', () => ({
  useAtlasConversation: () => ({ controller: { updateTestDataReview: vi.fn() } }),
}))
vi.mock('@/components/platform/os/AtlasTestDataReviewCard', () => ({
  AtlasTestDataReviewCard: () => null,
}))

import { AtlasVoicePanel } from '@/components/platform/os/AtlasVoicePanel'
import type { AtlasVoiceSession } from '@/lib/atlas/voice-pilot/use-voice-session'

type Choice = { key: 'anders' | 'peter' | 'nova'; label: string }
const choices: Choice[] = [
  { key: 'anders', label: 'Anders – varm rikssvenska' },
  { key: 'peter', label: 'Peter – naturlig skånska' },
  { key: 'nova', label: 'Nova (Agent Office)' },
]
const fn = () => {}
function session(overrides: Record<string, unknown> = {}): AtlasVoiceSession {
  return {
    voices: choices, voice: 'anders', mic: false, speaking: false, listening: false, transcribing: false,
    opening: false, sending: false, reply: '', draft: '', notice: '', pauseMs: 1400, playbackMode: 'speakers',
    stopAll: fn, setVoice: fn, toggleMic: fn, interruptForCorrection: fn, setPlaybackMode: fn,
    setPauseMs: fn, editDraft: fn, submitDraft: fn,
    snapshot: { id: null, history: [], entries: [], testDataReviews: [], pending: false },
    ...overrides,
  } as unknown as AtlasVoiceSession
}
function render(s = session(), minimized = false) {
  return renderToStaticMarkup(React.createElement(AtlasVoicePanel, {
    session: s, minimized, onMinimize: fn, onShow: fn,
    onClose: fn, onBuild: fn, projects: [], projectName: null,
  }))
}
describe('Atlas main voice panel selector', () => {
  it('shows the live selector without opening developer-only test pages or advanced settings', () => {
    const html = render()
    expect(html).toContain('Välj röst')
    expect(html).toMatch(/<label[^>]*for="atlas-shared-voice-select"/)
    expect(html).toContain('id="atlas-shared-voice-select"')
    expect(html).toMatch(/<option[^>]*value="anders"[^>]*selected=""[^>]*>/)
    expect(html).toContain('value="peter"')
    expect(html).toContain('value="nova"')
    expect(html).toContain('Nova (Agent Office)')
    expect(html.indexOf('atlas-shared-voice-select')).toBeLessThan(html.indexOf('Samtalets arbetsytor'))
  })
  it('shows the chosen Nova voice while retaining Anders and Peter as alternatives', () => {
    const html = render(session({ voice: 'nova' }))
    expect(html).toMatch(/<option[^>]*value="nova"[^>]*selected=""[^>]*>/)
    expect(html).toContain('Anders')
    expect(html).toContain('Peter')
    expect(html).not.toContain('4xkUqaR9MYOJHoaC1Nak')
  })
  it('shows a disabled loading state and never invents unconfirmed voice options', () => {
    const html = render(session({ voices: [] }))
    expect(html).toMatch(/<select[^>]*id="atlas-shared-voice-select"[^>]*disabled=""/)
    expect(html).toContain('Hämtar röster')
    expect(html).not.toContain('Nova (Agent Office)')
  })
  it('does not offer voice switching from the minimized call dock', () => {
    const html = render(session(), true)
    expect(html).not.toContain('atlas-shared-voice-select')
    expect(html).toContain('Visa röstsamtalet')
  })
})
