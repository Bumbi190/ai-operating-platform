import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Nova Desktop persistent Atlas voice bridge', () => {
  it('mounts the bridge for the authenticated platform layout, inside Atlas runtime', () => {
    const layout = readFileSync(join(root, 'app/(platform)/layout.tsx'), 'utf8')
    expect(layout).toContain("import { NovaBridgeProvider } from '@/components/platform/os/NovaBridgeRuntime'")
    expect(layout.indexOf('<AtlasRuntimeProvider')).toBeLessThan(layout.indexOf('<NovaBridgeProvider>'))
    expect(layout.indexOf('<NovaBridgeProvider>')).toBeLessThan(layout.indexOf('<OperatorModeProvider'))
    expect(layout).toContain('</NovaBridgeProvider>')
  })

  it('uses the existing Atlas conversation runtime instead of a second voice provider', () => {
    const runtime = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    expect(runtime).toContain("import { useAtlas } from '@/lib/atlas/runtime'")
    expect(runtime).toContain('current.activate()')
    expect(runtime).toContain('current.deactivate()')
    expect(runtime).toContain('current.stopAudio()')
    expect(runtime).toContain("'/voice/authorize', 'POST', { protocol: 1 }")
    expect(runtime).toContain("local('/control/ack', 'POST', { id: command.id })")
    expect(runtime).not.toContain('getUserMedia(')
    expect(runtime).not.toContain('new WebSocket(')
  })

  it('keeps the local pairing in memory and strips the fragment from history', () => {
    const runtime = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    expect(runtime).toContain('pairingRef = useRef<Pair | null>(null)')
    expect(runtime).toContain("window.history.replaceState(null, '', window.location.pathname + window.location.search)")
    expect(runtime).not.toContain('localStorage')
    expect(runtime).not.toContain('sessionStorage')
  })

  it('keeps the relay controller mounted while the user navigates inside Omnira', () => {
    const runtime = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    expect(runtime).toContain("const pollingLoop = useCallback")
    expect(runtime).toContain("const pathname = usePathname()")
    expect(runtime).toContain("if (pathname !== '/nova-bridge' || pairingRef.current) return")
    expect(runtime).not.toContain("if (pathname !== '/nova-bridge') { stoppedRef.current = true")
  })

  it('supports a one-time hotkey auto-pair while retaining SSO and browser permission gates', () => {
    const runtime = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    expect(runtime).toContain("const hotkey = params.get('hotkey') === '1'")
    expect(runtime).toContain("window.history.replaceState(null, '', window.location.pathname + window.location.search)")
    expect(runtime).toContain("autoHotkeyStageRef.current = pair.hotkey ? 'connect' : 'none'")
    expect(runtime).toContain("autoHotkeyStageRef.current = 'voice'")
    expect(runtime).toContain("if (phase !== 'paired' || autoHotkeyStageRef.current !== 'voice') return")
    expect(runtime).toContain("void startVoice()")
    expect(runtime).toContain("if (!result.connected || result.mode !== 'read_only')")
    expect(runtime).toContain("if (!current.voiceConversationAvailable)")
    expect(runtime).toContain("current.activate()")
  })

  it('requires a separate browser click for microphone consent and documents hotkeys', () => {
    const page = readFileSync(join(root, 'app/(platform)/nova-bridge/page.tsx'), 'utf8')
    expect(page).toContain('Starta röstsamtal')
    expect(page).toContain('Ctrl + Alt + Space')
    expect(page).toContain('Ctrl + Alt + .')
    expect(page).toContain('Kalender- och andra ändringar använder Atlas vanliga behörigheter')
  })
})
