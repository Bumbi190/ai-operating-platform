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
    expect(runtime).toContain("autoHotkeyStageRef.current = pair.hotkey ? (pair.native ? 'native' : 'connect') : 'none'")
    expect(runtime).toContain("autoHotkeyStageRef.current = autoHotkeyStageRef.current === 'native' ? 'native' : 'voice'")
    expect(runtime).toContain("if (phase !== 'paired' || autoHotkeyStageRef.current !== 'voice') return")
    expect(runtime).toContain("void startVoice()")
    expect(runtime).toContain("if (!result.connected || result.mode !== 'read_only')")
    expect(runtime).toContain("if (!current.voiceConversationAvailable)")
    expect(runtime).toContain("current.activate()")
  })

  it('authorizes only the user-requested native input mode with Sanna and no browser mic', () => {
    const bridge = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    const page = readFileSync(join(root, 'app/(platform)/nova-bridge/page.tsx'), 'utf8')
    expect(bridge).toContain("const native = params.get('native') === '1'")
    expect(bridge).toContain("'/voice/authorize', 'POST', { protocol: 1, mode: 'native', desktopReplies: true }")
    expect(bridge).toContain("data.voices.some(v => v.key === 'nova')")
    expect(bridge).toContain('current.selectNovaVoice?.()')
    expect(bridge).toContain("current.deactivate()")
    expect(bridge).toContain('voiceStatus: nativeVoice ?')
    expect(page).toContain('Koppla Windows-röst (Sanna)')
    expect(page).toContain('bridge.nativeVoice')
  })

  it('speaks the desktop result directly and acknowledges successful playback', () => {
    const bridge = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    const block = bridge.split("else if (task.mode === 'nova_speech')")[1].split('else if (task.mode')[0]
    expect(block).toContain('await atlasRef.current.speakNativeReply?.(task.text)')
    expect(block).toContain('if (!played)')
    expect(block).toContain("await push(task.id, 'done')")
    expect(block).not.toContain('executeReadOnly')
  })

  it('uses only the tool-free mode for automatic native speech and keeps ordinary read-only context separate', () => {
    const bridge = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    const route = readFileSync(join(root, 'app/api/chat/route.ts'), 'utf8')
    expect(bridge).toContain("task.mode === 'nova_readonly' || task.mode === 'nova_voice'")
    expect(bridge).toContain("mode: 'nova_readonly', voice: native")
    expect(bridge).toContain("await atlasRef.current.speakNativeReply?.(answer.slice(0, 300))")
    expect(bridge).toContain('const nativeTurnsRef = useRef<ChatTurn[]>([])')
    expect(route).toContain("systemPrompt = buildAtlasSystemPrompt() + NOVA_READONLY_DIRECTIVE + (voice ? VOICE_DIRECTIVE : '')")
    expect(route).toContain('max_tokens: novaReadOnly ? (voice ? 150 : 900)')
  })

  it('distinguishes relay consent from a working microphone and offers a real click recovery', () => {
    const bridge = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    const page = readFileSync(join(root, 'app/(platform)/nova-bridge/page.tsx'), 'utf8')
    expect(bridge).toContain('voiceMicActive: Boolean(atlas.voiceMicActive)')
    expect(bridge).toContain('voiceMicProblem: atlas.voiceMicProblem ?? null')
    expect(bridge).toContain("!atlas.voiceMicActive ? 'Av - mikrofonen")
    expect(bridge).toContain('const retryMic = useCallback(() => {')
    expect(bridge).toContain('current.deactivate()')
    expect(bridge).toContain('current.activate()')
    expect(page).toContain('onClick={bridge.retryMic}')
    expect(page).toContain('Aktivera mikrofon')
    expect(page).toContain('role="alert"')
  })

  it('does not make mic acquisition depend on a playable TTS AudioContext', () => {
    const hook = readFileSync(join(root, 'lib/atlas/voice-pilot/use-voice-session.ts'), 'utf8')
    const start = hook.slice(hook.indexOf('  async function startMic('), hook.indexOf('  function resumeQueuedVoice('))
    expect(start).toContain('void prepared.catch')
    expect(start).toContain('await next.start()')
    expect(start).not.toContain('await prepared')
    expect(start).not.toContain('if (!await voicesReady.current)')
    expect(start).toContain('void voicesReady.current.then(')
  })

  it('waits for Sanna PCM playback before replying done to native microphone supervisor', () => {
    const bridge = readFileSync(join(root, 'components/platform/os/NovaBridgeRuntime.tsx'), 'utf8')
    const player = readFileSync(join(root, 'lib/atlas/voice-pilot/player.ts'), 'utf8')
    const hook = readFileSync(join(root, 'lib/atlas/voice-pilot/use-voice-session.ts'), 'utf8')
    const native = bridge.slice(bridge.indexOf('const executeReadOnly'), bridge.indexOf('const executeOperator'))
    expect(native.indexOf("await atlasRef.current.speakNativeReply?.("))
      .toBeLessThan(native.indexOf("await push(task.id, 'done')"))
    expect(player).toContain('async waitUntilIdle(timeoutMs = 30_000)')
    expect(player).toContain('!running && queue.length === 0 && !audioActive')
    expect(hook).toContain('async function speakNativeReply(text: string)')
    expect(hook).toContain('return speak().playNativeVoice(text, 30_000)')
    expect(hook).toContain("voices.some(item => item.key === 'nova')")
  })

  it('requires a separate browser click for microphone consent and documents hotkeys', () => {
    const page = readFileSync(join(root, 'app/(platform)/nova-bridge/page.tsx'), 'utf8')
    expect(page).toContain('Använd webbläsarens mikrofon')
    expect(page).toContain('onClick={() => void bridge.startVoice()}')
    expect(page).toContain('Ctrl + Alt + Space')
    expect(page).toContain('Ctrl + Alt + .')
    expect(page).toContain('Kalender- och andra ändringar använder Atlas vanliga behörigheter')
  })
})
