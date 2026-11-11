'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAtlas } from '@/lib/atlas/runtime'

type Pair = { port: number; key: string; hotkey: boolean; native: boolean }
type LocalTask = { id: string; text: string; mode: 'nova_readonly' | 'atlas_operator' | 'nova_voice' | 'nova_speech' }
type VoiceControl = { id: string; kind: 'voice_toggle' | 'voice_interrupt' | 'voice_resume' }
type ChatTurn = { role: 'user' | 'assistant'; content: string }
type LocalFetch = RequestInit & { targetAddressSpace: 'loopback' }
type BridgePhase = 'ready' | 'connecting' | 'paired' | 'failed' | 'paused'

type NovaBridgeValue = {
  phase: BridgePhase
  message: string
  lastPrompt: string
  lastAnswer: string
  voiceAuthorized: boolean
  nativeVoice: boolean
  voiceAvailable: boolean
  novaVoiceAvailable: boolean
  voiceMicActive: boolean
  voiceMicProblem: string | null
  voiceStatus: string
  retryMic(): void
  connect(): Promise<void>
  startVoice(): Promise<void>
  startNativeVoice(): Promise<void>
  stopVoice(): Promise<void>
  pause(): void
}

const Context = createContext<NovaBridgeValue | null>(null)
const MAX_LOCAL_CHARS = 3000
const SAFE_PAIR = /^[A-Za-z0-9_-]{32,96}$/

function readPairingFragment(): Pair | null {
  const raw = window.location.hash.slice(1)
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const port = Number(params.get('port'))
  const key = params.get('key') ?? ''
  const hotkey = params.get('hotkey') === '1'
  const native = params.get('native') === '1'
  // Remove the short-lived token from browser history immediately.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!Number.isInteger(port) || port < 1025 || port > 65535 || !SAFE_PAIR.test(key)) return null
  return { port, key, hotkey, native }
}

function voiceStatusLabel(status: string): string {
  return ({
    idle: 'Av',
    starting: 'Startar mikrofon',
    listening: 'Lyssnar',
    transcribing: 'Tolkar tal',
    thinking: 'Atlas arbetar',
    speaking: 'Nova pratar',
    error: 'Röstfel',
  } as Record<string, string>)[status] ?? 'Okänd status'
}

export function NovaBridgeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const atlas = useAtlas()
  const atlasRef = useRef(atlas)
  atlasRef.current = atlas

  const [phase, setPhase] = useState<BridgePhase>('ready')
  const [message, setMessage] = useState('Öppna sidan från Nova-bubblans Koppla Atlas-knapp.')
  const [lastPrompt, setLastPrompt] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  const [voiceAuthorized, setVoiceAuthorized] = useState(false)
  const [nativeVoice, setNativeVoice] = useState(false)
  const [pairVersion, setPairVersion] = useState(0)

  const windowsPlayback = useRef(false)
  const pairingRef = useRef<Pair | null>(null)
  const autoHotkeyStageRef = useRef<'none' | 'connect' | 'voice' | 'native'>('none')
  const stoppedRef = useRef(true)
  const phaseRef = useRef<BridgePhase>('ready')
  phaseRef.current = phase
  const voiceAuthorizedRef = useRef(false)
  const turnsRef = useRef<ChatTurn[]>([])
  const nativeTurnsRef = useRef<ChatTurn[]>([])
  const pollRef = useRef(false)
  const runningTaskRef = useRef(false)
  const controllersRef = useRef(new Set<AbortController>())
  const atlasAbortRef = useRef<AbortController | null>(null)
  const seenControlsRef = useRef(new Set<string>())

  useEffect(() => {
    if (pathname !== '/nova-bridge' || pairingRef.current) return
    const pair = readPairingFragment()
    if (pair) {
      pairingRef.current = pair
      autoHotkeyStageRef.current = pair.hotkey ? (pair.native ? 'native' : 'connect') : 'none'
      setPairVersion(value => value + 1)
      setMessage(pair.hotkey
        ? 'Snabbkommando mottaget. Kontrollerar anslutning och mikrofon ...'
        : 'Nova hittad lokalt. Klicka Anslut och godkänn sedan röstsamtalet.')
    }
  }, [pathname])

  const local = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const pairing = pairingRef.current
    if (!pairing) throw new Error('Ingen giltig Nova-parning')
    const controller = new AbortController()
    controllersRef.current.add(controller)
    const init: LocalFetch = {
      method,
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      signal: controller.signal,
      headers: { 'Content-Type': body instanceof Blob ? body.type : 'application/json', 'X-Nova-Token': pairing.key },
      ...(body === undefined ? {} : { body: body instanceof Blob ? body : JSON.stringify(body) }),
    }
    try {
      const response = await fetch('http://127.0.0.1:' + pairing.port + path, init)
      if (!response.ok) throw new Error('Nova lokal HTTP ' + response.status)
      return (await response.json()) as T
    } finally {
      controllersRef.current.delete(controller)
    }
  }, [])

  const push = useCallback(async (id: string, kind: 'text' | 'done' | 'error', text = '') => {
    return local<{ ok: boolean }>('/event', 'POST', { id, kind, text })
  }, [local])

  const executeReadOnly = useCallback(async (task: LocalTask): Promise<void> => {
    if (!['nova_readonly', 'nova_voice'].includes(task.mode) || !task.id || typeof task.text !== 'string' ||
        task.text.length > MAX_LOCAL_CHARS) {
      throw new Error('Nova skickade ett ogiltigt uppdrag')
    }
    const native = task.mode === 'nova_voice'
    if (native && !voiceAuthorizedRef.current) throw new Error('Windows-r?stl?get har inte godk?nts.')
    setLastPrompt(task.text)
    setLastAnswer('')
    setMessage(native ? 'Atlas besvarar Novas r?st i s?kert l?sl?ge.'
      : 'Atlas l?ser texten utan k?rverktyg.')
    let answer = ''
    const context = native ? nativeTurnsRef : turnsRef
    const turns: ChatTurn[] = [...context.current.slice(-10), { role: 'user', content: task.text }]
    const atlasAbort = new AbortController()
    atlasAbortRef.current = atlasAbort
    let statusBusy = false
    let statusFailures = 0
    const statusTimer = window.setInterval(() => {
      if (stoppedRef.current || statusBusy) return
      statusBusy = true
      void local<{ state: string }>('/status?' + encodeURIComponent(task.id))
        .then(({ state }) => {
          statusFailures = 0
          if (state !== 'executing' && state !== 'done') atlasAbort.abort()
        })
        .catch(() => {
          statusFailures += 1
          if (statusFailures >= 3) atlasAbort.abort()
        })
        .finally(() => { statusBusy = false })
    }, 400)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        signal: atlasAbort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: turns, mode: 'nova_readonly', voice: native }),
      })
      if (!response.ok || !response.body) {
        throw new Error(response.status === 401
          ? 'Atlas-sessionen har gått ut. Logga in i Omnira.'
          : 'Atlas kunde inte svara (HTTP ' + response.status + ').')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawDone = false
      try {
        while (!stoppedRef.current && !atlasAbort.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let data: { event?: string; text?: string; code?: string } = {}
            try { data = JSON.parse(line.slice(6)) } catch { continue }
            if (data.event === 'text' && typeof data.text === 'string') {
              for (let i = 0; i < data.text.length; i += 2048) {
                const part = data.text.slice(i, i + 2048)
                answer += part
                if (answer.length > 30_000) throw new Error('Svaret blev för stort')
                await push(task.id, 'text', part)
                setLastAnswer(answer)
              }
            } else if (data.event === 'done') {
              sawDone = true
            } else if (data.event === 'error') {
              throw new Error('Atlas rapporterade ett tjänstefel: ' + (data.code ?? 'okänt'))
            } else if (data.event === 'tool_call' || data.event === 'navigate') {
              throw new Error('Atlas försökte använda ett verktyg i läsläge.')
            }
          }
        }
      } finally {
        try { await reader.cancel() } catch { /* stream finished or canceled */ }
      }
      if (stoppedRef.current || atlasAbort.signal.aborted) return
      if (!sawDone) throw new Error('Atlas avbröt strömmen innan svarskvittot kom fram.')
      context.current = [...turns, { role: 'assistant' as const, content: answer }].slice(-12)
      if (native && !stoppedRef.current && voiceAuthorizedRef.current && answer.trim()) {
        // Authenticated browser only plays the explicitly verified Sanna
        // voice. The original answer remains visible if autoplay is blocked.
        try {
          const played = await atlasRef.current.speakNativeReply?.(answer.slice(0, 300))
          if (!played) {
            // Never re-arm Windows capture while the browser audio sink might
            // still be playing after an expired TTS deadline or failed request.
            atlasRef.current.stopAudio()
            setMessage('Atlas svarade i text, men Nova-r?sten kunde inte verifieras. Inget annat r?stval anv?nds.')
          }
        } catch {
          setMessage('Atlas svarade i text men Brave kunde inte spela upp ljudet.')
        }
      }
      await push(task.id, 'done')
      if (!native) setMessage('Atlas gav ett skrivskyddat svar.')
    } finally {
      window.clearInterval(statusTimer)
      if (atlasAbortRef.current === atlasAbort) atlasAbortRef.current = null
    }
  }, [local, push])

  const executeOperator = useCallback(async (task: LocalTask): Promise<void> => {
    // Only the human-approved native command may be forwarded into Atlas's
    // normal authenticated tool + approval pipeline. No direct OS/write API
    // and no separate model/tool provider is exposed by the loopback bridge.
    if (!['atlas_operator', 'nova_voice'].includes(task.mode) || !task.id || !task.text.trim() ||
        task.text.length > MAX_LOCAL_CHARS || !voiceAuthorizedRef.current) {
      throw new Error('Atlas-uppdraget saknar en godk?nd operat?rsanslutning.')
    }
    const current = atlasRef.current
    if (!current.sendOperatorMessage || !current.voiceConversationAvailable) {
      throw new Error('Atlas-uppdrag ?r inte tillg?ngliga i den h?r testmilj?n.')
    }
    if (current.voicePhase === 'thinking' || current.voicePhase === 'speaking') {
      throw new Error('Atlas arbetar redan. V?nta eller avbryt p?g?ende svar f?rst.')
    }
    setLastPrompt(task.text)
    setLastAnswer('')
    setMessage('Atlas behandlar ditt uttryckligen godk?nda uppdrag med ordinarie beh?righeter.')
    const result = await current.sendOperatorMessage(task.text)
    if (!result.ok) throw new Error('Atlas avbr?t eller kunde inte slutf?ra uppdraget.')
    const answer = result.reply || 'Atlas svarade utan text. Granska konversationen i Omnira.'
    setLastAnswer(answer)
    for (let index = 0; index < answer.length; index += 2048) {
      await push(task.id, 'text', answer.slice(index, index + 2048))
    }
    await push(task.id, 'done')
    setMessage('Atlas-svaret kom fram. Kontrollera eventuella genomf?rda ?tg?rder i Omnira.')
  }, [push])

  const executeVoiceControl = useCallback(async (command: VoiceControl) => {
    if (!command || typeof command.id !== 'string' || !['voice_toggle', 'voice_interrupt', 'voice_resume'].includes(command.kind)) {
      throw new Error('Ogiltigt röstkommando från Nova')
    }
    if (seenControlsRef.current.has(command.id)) {
      // The native side may have superseded/revoked this command while the
      // browser was handling it. A stale acknowledgement is not a lost session.
      await local('/control/ack', 'POST', { id: command.id }).catch(() => {})
      return
    }
    const current = atlasRef.current
    if (!current.voiceConversationAvailable) {
      setMessage('Atlas röstsamtal är inte aktiverat för den här sessionen.')
    } else if (command.kind === 'voice_interrupt') {
      current.stopAudio()
      setMessage('Atlas svar avbröts. Röstsamtalet är fortfarande öppet.')
    } else if (command.kind === 'voice_resume') {
      // The visible "Prata" button is idempotent: never mute a running mic
      // or start a duplicate Windows dictation.
      if (!current.voiceMicActive) current.activate()
      setMessage(current.voiceMicActive ? 'Nova lyssnar redan via Atlas.' : 'Mikrofonen ?terstartas via Atlas.')
    } else if (current.voiceMicActive) {
      current.deactivate()
      setMessage('R?stsamtalet pausades via Nova.')
    } else {
      // At the ten-minute privacy timeout, the call panel is still open
      // but the microphone is released. Explicit toggle re-arms it.
      current.activate()
      setMessage('Mikrofonen startas igen via Nova.')
    }
    seenControlsRef.current.add(command.id)
    if (seenControlsRef.current.size > 32) {
      const first = seenControlsRef.current.values().next().value
      if (first) seenControlsRef.current.delete(first)
    }
    // Emergency interrupt can supersede a queued toggle, so a 409 for this
    // old acknowledgement is expected and must not tear down the poller.
    await local('/control/ack', 'POST', { id: command.id }).catch(() => {})
  }, [local])

  const pollingLoop = useCallback(async () => {
    if (pollRef.current) return
    pollRef.current = true
    try {
      while (!stoppedRef.current) {
        try {
          const data = await local<{ task?: LocalTask; command?: VoiceControl }>('/next')
          if (data.command?.id) await executeVoiceControl(data.command)
          if (data.task?.id && !runningTaskRef.current) {
            runningTaskRef.current = true
            const task = data.task
            // Do not block /next polling while Atlas runs a task. Emergency
            // stop must be processed immediately, even during a slow reply.
            void (async () => {
              try {
                if (task.mode === 'atlas_operator') await executeOperator(task)
                else if (task.mode === 'nova_speech') {
                  if (!voiceAuthorizedRef.current || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 300) {
                    throw new Error('Sanna kunde inte läsa upp skrivbordssvaret.')
                  }
                  setLastAnswer(task.text)
                  let played: boolean | undefined
                  if (windowsPlayback.current) {
                    const response = await fetch('/api/atlas/voice-pilot/speech', {
                      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: task.text, voice: 'nova' }),
                      signal: AbortSignal.timeout(35_000),
                    })
                    if (!response.ok) throw new Error('Omnira kunde inte skapa ljud med Sanna (HTTP ' + response.status + ').')
                    if (!response.body || response.headers.get('Content-Type')?.split(';')[0] !== 'audio/pcm') {
                      throw new Error('Omnira skickade inget PCM-ljud med Sanna.')
                    }
                    const reader = response.body.getReader()
                    const chunks: ArrayBuffer[] = []
                    let size = 0
                    try {
                      for (;;) {
                        const { value, done } = await reader.read()
                        if (done) break
                        size += value.byteLength
                        if (size > 2_880_000) throw new Error('Sannas ljudsvar blev för långt.')
                        chunks.push(new Uint8Array(value).buffer)
                      }
                    } finally {
                      await reader.cancel().catch(() => {})
                      reader.releaseLock()
                    }
                    if (!size || size % 2) throw new Error('Sannas ljudsvar var tomt eller ofullständigt.')
                    const output = await local<{ played: boolean }>('/speech/audio?' + encodeURIComponent(task.id),
                      'POST', new Blob(chunks, { type: 'audio/pcm' }))
                    played = output.played
                  } else {
                    played = await atlasRef.current.speakNativeReply?.(task.text)
                  }
                  if (!played) {
                    atlasRef.current.stopAudio()
                    throw new Error('Sannas ljud kunde inte spelas upp. Kontrollera ljudet i Omnira-fliken.')
                  }
                  await push(task.id, 'done')
                }
                else if (task.mode === 'nova_readonly' || task.mode === 'nova_voice') await executeReadOnly(task)
                else throw new Error('Ok?nt eller ogodk?nt Nova-uppdrag')
              } catch (error) {
                const detail = error instanceof Error ? error.message : 'Ok?nt fel'
                setMessage('Atlas-uppdraget avbr?ts: ' + detail)
                try { await push(task.id, 'error', detail.slice(0, 200)) } catch { /* canceled */ }
              } finally {
                runningTaskRef.current = false
              }
            })()
          }
          if (!stoppedRef.current) {
            await new Promise(resolve => setTimeout(resolve, voiceAuthorizedRef.current ? 250 : 800))
          }
        } catch (error) {
          if (!stoppedRef.current) {
            setPhase('failed')
            setMessage('Kopplingen till Nova försvann: ' +
              (error instanceof Error ? error.message : 'okänt fel'))
          }
          break
        }
      }
    } finally {
      pollRef.current = false
    }
  }, [executeReadOnly, executeOperator, executeVoiceControl, local, push])

  const connect = useCallback(async () => {
    if (!pairingRef.current) {
      setPhase('failed')
      setMessage('Ingen giltig parning. Klicka Koppla Atlas i Nova på din dator.')
      return
    }
    if (pollRef.current) return
    stoppedRef.current = false
    setPhase('connecting')
    setMessage('Ansluter till den lokala Nova-bubblan ...')
    try {
      const result = await local<{ connected: boolean; mode: string; voice_control?: string }>(
        '/connect', 'POST', { protocol: 1 })
      if (!result.connected || result.mode !== 'read_only') throw new Error('Fel protokoll från lokal Nova')
      voiceAuthorizedRef.current = false
      setVoiceAuthorized(false)
      setNativeVoice(false)
      setPhase('paired')
      setMessage('Ansluten. Klicka Starta röstsamtal en gång för mikrofonbehörighet; därefter kan Ctrl+Alt+Space styra samtalet.')
      void pollingLoop()
    } catch (error) {
      stoppedRef.current = true
      setPhase('failed')
      setMessage('Kopplingen misslyckades: ' +
        (error instanceof Error ? error.message : 'okänt fel') +
        '. Tillåt åtkomst till lokalt nätverk om Chrome frågar.')
    }
  }, [local, pollingLoop])

  const startVoice = useCallback(async () => {
    if (!pairingRef.current || phaseRef.current !== 'paired') {
      setMessage('Anslut Nova först innan röstsamtalet startas.')
      return
    }
    const current = atlasRef.current
    if (!current.voiceConversationAvailable) {
      setMessage('Atlas röstsamtal är inte aktiverat för den här användaren eller miljön.')
      return
    }
    // Call synchronously from the click so browser microphone and audio
    // permissions are requested inside a real user gesture.
    current.activate()
    try {
      const result = await local<{ authorized: boolean; message: string }>(
        '/voice/authorize', 'POST', { protocol: 1 })
      if (!result.authorized) throw new Error(result.message || 'Mikrofonkopplingen nekades')
      voiceAuthorizedRef.current = true
      setVoiceAuthorized(true)
      setMessage('Röstsamtalet har godkänts. Mikrofonen startar separat. Om status stannar på Av, klicka Aktivera mikrofon.')
    } catch (error) {
      current.deactivate()
      setMessage('Röstsamtalet kunde inte godkännas: ' +
        (error instanceof Error ? error.message : 'okänt fel'))
    }
  }, [local])

  const startNativeVoice = useCallback(async () => {
    if (!pairingRef.current || phaseRef.current !== 'paired') {
      setMessage('Anslut Nova f?rst innan Windows-samtalet startas.')
      return
    }
    const current = atlasRef.current
    if (!current.voiceConversationAvailable) {
      setMessage('Atlas ?r inte tillg?ngligt f?r den h?r inloggade sessionen.')
      return
    }
    try {
      // Confirm the owner-approved Sanna option from the server. Never
      // silently downgrade to Anders and do not expose the provider ID.
      const response = await fetch('/api/atlas/voice-pilot/speech', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
      })
      if (!response.ok) throw new Error('Novas r?st kunde inte verifieras. Kontrollera inloggningen.')
      const data = await response.json() as { voices?: { key?: string }[] }
      if (!Array.isArray(data.voices) || !data.voices.some(v => v.key === 'nova')) {
        throw new Error('Sanna ?r inte tillg?nglig f?r den h?r Atlas-sessionen. Ingen reservr?st anv?nds.')
      }
      current.deactivate()
      current.selectNovaVoice?.()
      // Windows owns the microphone; the authenticated Omnira tab remains
      // an Atlas conversation/TTS bridge, never a browser microphone.
      const grant = await local<{ authorized: boolean; windowsPlayback?: boolean }>(
        '/voice/authorize', 'POST', { protocol: 1, mode: 'native', desktopReplies: true })
      windowsPlayback.current = grant.windowsPlayback === true
      if (!grant.authorized) throw new Error('Windows-r?stl?get nekades.')
      voiceAuthorizedRef.current = true
      setVoiceAuthorized(true)
      setNativeVoice(true)
      setMessage('Windows-r?stl?get godk?nt. Prata med Nova fr?n Windows-f?nstret.')
    } catch (error) {
      setNativeVoice(false)
      setMessage(error instanceof Error ? error.message : 'Windows-r?stl?get kunde inte startas.')
    }
  }, [local])

  useEffect(() => {
    if (pathname !== '/nova-bridge' || pairVersion === 0 ||
        !['connect', 'native'].includes(autoHotkeyStageRef.current)) return
    autoHotkeyStageRef.current = autoHotkeyStageRef.current === 'native' ? 'native' : 'voice'
    // An expired SSO session still requires interactive browser login.
    void connect()
  }, [pathname, pairVersion, connect])

  useEffect(() => {
    if (phase !== 'paired' || autoHotkeyStageRef.current !== 'native') return
    autoHotkeyStageRef.current = 'none'
    void startNativeVoice()
  }, [phase, startNativeVoice])

  useEffect(() => {
    if (phase !== 'paired' || autoHotkeyStageRef.current !== 'voice') return
    autoHotkeyStageRef.current = 'none'
    if (!atlasRef.current.voiceConversationAvailable) {
      setMessage('Nova är parad, men Atlas röstfunktion är inte tillgänglig. Logga in och prova manuellt.')
      return
    }
    // Browser permission may permit auto-start. Browser gesture restrictions
    // still apply; a visible manual start button stays available as fallback.
    void startVoice()
  }, [phase, startVoice])

  const retryMic = useCallback(() => {
    // Only a real onClick on the authenticated Nova page may initiate this
    // recovery. Never equate the loopback's authorization with an open mic.
    if (phaseRef.current !== 'paired' || !voiceAuthorizedRef.current ||
        !atlasRef.current.voiceConversationAvailable) {
      setMessage('Anslut Nova och godkänn röstsamtalet först.')
      return
    }
    const current = atlasRef.current
    // Clear a stale suspended AudioContext/capture attempt, then request both
    // media resources under this fresh explicit browser user gesture.
    current.deactivate()
    current.activate()
    setMessage('Startar mikrofonen efter ditt klick. Kontrollera att status blir Lyssnar.')
  }, [])

  const stopVoice = useCallback(async () => {
    atlasRef.current.deactivate()
    voiceAuthorizedRef.current = false
    setVoiceAuthorized(false)
    setNativeVoice(false)
    try { await local('/voice/revoke', 'POST', { protocol: 1 }) } catch { /* local relay may already be offline */ }
    setMessage('Röstsamtalet avslutades.')
  }, [local])

  const pause = useCallback(() => {
    stoppedRef.current = true
    for (const controller of controllersRef.current) controller.abort()
    controllersRef.current.clear()
    atlasAbortRef.current?.abort()
    atlasRef.current.deactivate()
    voiceAuthorizedRef.current = false
    setVoiceAuthorized(false)
    setNativeVoice(false)
    void local('/voice/revoke', 'POST', { protocol: 1 }).catch(() => {})
    setPhase('paused')
    setMessage('Kopplingen pausad. Mikrofonen är avstängd och inga nya kommandon behandlas.')
  }, [local])

  useEffect(() => {
    if (!voiceAuthorizedRef.current || stoppedRef.current) return
    const phase = atlas.voicePhase
    const status = !atlas.voicePanelOpen ? 'idle'
      : atlas.voiceMicProblem ? 'error'
      : phase === 'speaking' ? 'speaking'
      : phase === 'thinking' ? 'thinking'
      : phase === 'listening' ? 'listening'
      : atlas.voiceMicActive ? 'starting' : 'idle'
    void local('/voice/status', 'POST', { status }).catch(() => {})
  }, [atlas.voicePhase, atlas.voicePanelOpen, atlas.voiceMicActive, atlas.voiceMicProblem, atlas.isSessionActive, local])

  useEffect(() => () => {
    stoppedRef.current = true
    for (const controller of controllersRef.current) controller.abort()
    controllersRef.current.clear()
    atlasAbortRef.current?.abort()
  }, [])

  const value = useMemo<NovaBridgeValue>(() => ({
    phase, message, lastPrompt, lastAnswer, voiceAuthorized, nativeVoice,
    voiceAvailable: Boolean(atlas.voiceConversationAvailable),
    novaVoiceAvailable: Boolean(atlas.novaVoiceAvailable),
    voiceMicActive: Boolean(atlas.voiceMicActive),
    voiceMicProblem: atlas.voiceMicProblem ?? null,
    voiceStatus: nativeVoice ? 'Windows-mikrofon styr Nova' : !voiceAuthorized ? 'Inte godkänt'
      : atlas.voiceMicProblem ? 'Mikrofonfel'
      : !atlas.voiceMicActive ? 'Av - mikrofonen behöver startas'
      : atlas.voicePhase === 'idle' ? 'Startar mikrofonen'
      : voiceStatusLabel(atlas.voicePhase),
    connect, startVoice, startNativeVoice, retryMic, stopVoice, pause,
  }), [phase, message, lastPrompt, lastAnswer, voiceAuthorized, nativeVoice, atlas.voiceConversationAvailable,
    atlas.novaVoiceAvailable, atlas.voiceMicActive, atlas.voiceMicProblem, atlas.voicePhase,
    connect, startVoice, startNativeVoice, retryMic, stopVoice, pause])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useNovaBridge(): NovaBridgeValue {
  const value = useContext(Context)
  if (!value) throw new Error('useNovaBridge() måste användas inuti NovaBridgeProvider')
  return value
}
