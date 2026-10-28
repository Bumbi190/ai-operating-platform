import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preferredAtlasVoice } from '@/lib/atlas/voice-pilot/voices'
import { createMicSignalStore } from '@/lib/atlas/voice-pilot/mic-diagnostics'

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => vi.unstubAllGlobals())
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement('a', { href }, children),
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
    voices: choices, voice: 'nova', mic: true, speaking: false, listening: true, transcribing: false,
    opening: false, sending: false, reply: '', draft: '', notice: '',
    micSignalStore: createMicSignalStore(), micDeviceId: '', micDevices: [], selectMicDevice: fn,
    stopAll: fn, setVoice: fn, toggleMute: fn, editDraft: fn, submitDraft: fn,
    snapshot: { id: null, history: [], entries: [], testDataReviews: [], pending: false },
    ...overrides,
  } as unknown as AtlasVoiceSession
}
function render(s = session(), minimized = false) {
  return renderToStaticMarkup(React.createElement(AtlasVoicePanel, {
    session: s, minimized, onMinimize: fn, onShow: fn, onClose: fn,
    onBuild: fn, projects: [], projectName: null,
  }))
}
describe('Compact persistent Atlas call shell', () => {
  it('defaults to Nova only when the server confirms it; Anders remains fallback', () => {
    expect(preferredAtlasVoice(choices)).toBe('nova')
    expect(preferredAtlasVoice(choices.slice(0, 2))).toBe('anders')
    expect(preferredAtlasVoice([choices[1]])).toBe('peter')
    expect(preferredAtlasVoice([])).toBe('anders')
  })
  it('shows only the three call controls in the compact dock, and never hides mute', () => {
    const html = render(session(), true)
    expect(html).toContain('Pågående röstsamtal med Atlas')
    expect(html).toContain('Nova')
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-label="Mikrofonens ljudnivå"')
    expect(html).toContain('aria-label="Muta mikrofonen"')
    expect(html).toContain('aria-label="Visa chatten"')
    expect(html).toContain('aria-label="Lägg på"')
    expect((html.match(/<button /g) ?? [])).toHaveLength(3)
    expect(html).not.toContain('atlas-shared-voice-select')
    expect(html).not.toContain('Starta mikrofonen')
    expect(html).not.toContain('Välj projektvy')
  })
  it('shows muted state without falsely ending the call', () => {
    const html = render(session({ mic: false, listening: false }), true)
    expect(html).toContain('Mikrofonen är mutad')
    expect(html).toContain('aria-label="Slå på mikrofonen"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Lägg på"')
  })
  it('distinguishes an unexpected microphone disconnect from an intentional mute', () => {
    const state = session({
      mic: false, listening: false,
      micProblem: 'Talanslutningen avbröts. Tryck för att återansluta.',
      notice: '',
    })
    const dock = render(state, true)
    expect(dock).toContain('Återanslut mikrofon')
    expect(dock).toContain('aria-label="Återanslut mikrofonen"')
    expect(dock).not.toContain('Mikrofonen är mutad')
    expect(dock).toContain('aria-label="Lägg på"')
    const expanded = render(state)
    expect(expanded).toContain('Talanslutningen avbröts')
    expect(expanded).toContain('aria-label="Återanslut mikrofonen"')
  })
  it('keeps transcript/chat visible only after expanding, without old navigation clutter', () => {
    const html = render(session({
      snapshot: {
        id: 'thread-1',
        history: [{ role: 'user', content: 'Hej Nova' }, { role: 'assistant', content: 'Hej, vi börjar.' }],
        entries: [], testDataReviews: [], pending: false,
      },
    }))
    expect(html).toContain('Hej Nova')
    expect(html).toContain('Hej, vi börjar.')
    expect(html).toContain('aria-label="Minimera chatten"')
    expect(html).toContain('Skriv till Nova')
    expect(html).not.toContain('Bygg med Atlas')
    expect(html).not.toContain('Välj projektvy')
    expect(html).not.toContain('Tid att tänka')
    expect(html).not.toContain('Avbryt och rätta')
    expect(html).toContain('<details')
    expect(html).toContain('Byt röst')
    expect(html).not.toContain('4xkUqaR9MYOJHoaC1Nak')
  })
  it('shows the full Claude prompt and a copy action only on written assistant replies', () => {
    const prompt = '### Prompt till Claude\\n\\nBehåll säkerhetsgränserna och verifiera alla tester.'
    const live = session({ snapshot: {
      id: 'long-document-thread', history: [
        { role: 'user', content: 'Skriv prompt till Claude' },
        { role: 'assistant', content: prompt },
      ], entries: [], testDataReviews: [], pending: false,
    } })
    const html = render(live)
    expect(html).toContain('Behåll säkerhetsgränserna')
    expect(html).toContain('aria-label="Kopiera hela svaret"')
    expect(html).toContain('Kopiera hela svaret')
    expect((html.match(/aria-label="Kopiera hela svaret"/g) ?? [])).toHaveLength(1)
    expect(render(live, true)).not.toContain('Kopiera hela svaret')
    expect((render(live, true).match(/<button /g) ?? [])).toHaveLength(3)
  })
  it('labels batch transcription honestly while preview uses stable mode', () => {
    const stable = render(session({ inputMode: 'batch' }))
    expect(stable).toContain('stabilt läge')
    expect(stable).toContain('ljudet tolkas när du har pratat klart')
    expect(render(session({ inputMode: 'streaming' }))).toContain('realtidsläge')
  })
  it('offers optional browser microphone selection in expanded chat without a fourth dock control', () => {
    const html = render(session({
      micDevices: [
        { id: 'hyperx', label: 'HyperX Cloud II Wireless' },
        { id: 'sandberg', label: 'Sandberg 133-97' },
      ],
      micDeviceId: 'hyperx',
    }))
    expect(html).toContain('Mikrofontest')
    expect(html).toContain('Systemets standardmikrofon')
    expect(html).toContain('HyperX Cloud II Wireless')
    expect(html).toContain('Sandberg 133-97')
    expect(html).toContain('value="hyperx" selected=""')
    expect(html).toContain('Mikrofonens ljudnivå')
    expect(render(session(), true)).not.toContain('atlas-shared-mic-device')
    expect((render(session(), true).match(/<button /g) ?? [])).toHaveLength(3)
  })
  it('does not invent Nova if provider voices are missing, and disables manual voice change', () => {
    const html = render(session({ voices: [], voice: 'anders' }))
    expect(html).toContain('Hämtar röster')
    expect(html).not.toContain('Nova (Agent Office)')
    expect(html).toMatch(/id="atlas-shared-voice-select"[^>]*disabled=""/)
  })
  it('does not kill the call when the microphone is muted or the tab is temporarily hidden', () => {
    const hook = readFileSync(join(process.cwd(), 'lib/atlas/voice-pilot/use-voice-session.ts'), 'utf8')
    const pause = hook.slice(hook.indexOf('function pauseMic()'), hook.indexOf('function stopAll()'))
    expect(pause).toContain('capture.current')
    expect(pause).not.toContain('stopSpeech()')
    expect(pause).not.toContain('lifetime.current++')
    expect(hook).not.toContain("addEventListener('visibilitychange'")
    expect(hook).toContain("addEventListener('pagehide'")
    const runtime = readFileSync(join(process.cwd(), 'lib/atlas/runtime.tsx'), 'utf8')
    expect(runtime).toContain("const currentSessionActive = managedVoice ? voicePanel !== 'closed'")
    expect(runtime).toContain("setVoicePanel('minimized')")
  })
  it('keeps hands-free interruption behind an explicit headset choice in expanded microphone settings', () => {
    const html = render(session({ playbackMode: 'headphones' }))
    expect(html).toContain('atlas-headphones-barge-in')
    expect(html).toContain('checked=""')
    expect(html).toContain('börja prata')
    const dock = render(session({ playbackMode: 'headphones' }), true)
    expect(dock).not.toContain('atlas-headphones-barge-in')
    expect((dock.match(/<button /g) ?? [])).toHaveLength(3)
  })
  it('exposes the phone entry on Atlas home instead of the old microphone entry', () => {
    const home = readFileSync(join(process.cwd(), 'components/platform/vnext/AtlasCommandCore.tsx'), 'utf8')
    expect(home).toContain("'Ring Nova'")
    expect(home).toContain('<Phone size={19} />')
    expect(home).toContain('<PhoneOff size={19} />')
  })
})
