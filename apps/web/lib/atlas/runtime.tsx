'use client'

/**
 * AtlasRuntime — persistent OS-lager för röst och konversationsstate.
 *
 * Providern bor i app/(platform)/layout.tsx och lever oberoende av vilken
 * workspace-sida som visas. Atlas är aldrig en sida — det är ett runtime.
 *
 * Ansvar: röstfas, konversation, executive state, workspace-spårning.
 * Inte: AI-resonerande, minne, retrieval, workflow-exekvering.
 *
 * Publik API: useAtlas() — det är allt konsumenter behöver känna till.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { buildChatRequestBody }   from '@/lib/atlas/view-client'
import { AtlasAudioAnalyser, AtlasAudioLevelStore } from './audio-analysis'
import { playTtsUrl, type PlaybackEvent, type PlaybackHandle, type PlaybackResult } from './playback'
import {
  playProgressiveTtsResponse,
  progressiveMp3Capability,
  type ProgressiveCapability,
  type TtsBodyEvent,
} from './progressive-playback'
import {
  createLatencyMarks,
  formatLatency,
  formatRawLatency,
  markOnce,
  mergeServerTiming,
  type AtlasLatencyMark,
  type AtlasLatencyMarks,
  type AtlasServerTiming,
  type LatencyOrigin,
} from './latency'
import {
  ATLAS_ACTION_TOOL_NAMES,
  interpretAtlasToolResult,
  resolveAtlasServiceWarning,
  type AtlasOrbCompletionEvent,
  type AtlasOrbRuntimeSignal,
} from './orb-state'
import { resolveWorkspace, resolveActiveProject } from './workspace-registry'
import { IncrementalSpeechSegmenter, toSpeechText } from './speech-segmenter'
import { BoundedTaskQueue } from './tts-queue'
import { consumeAtlasSse, type AtlasSseEvent } from './sse'

// ── Typer ────────────────────────────────────────────────────────────────────

/** Mekanisk/audio-tillstånd — vad rösten gör just nu. */
export type VoicePhase =
  | 'idle'       // inget aktivt
  | 'listening'  // STT aktivt, tar emot tal
  | 'thinking'   // LLM streamas, TTS-kön byggs
  | 'speaking'   // audio spelas upp

/** Semantiskt beteendetillstånd — vad Atlas gör. Ren tillståndsmaskin på SSE-signaler. */
export type ExecutiveState =
  | 'idle'        // inte aktivt engagerad
  | 'briefing'    // levererar rapport (första meddelandet)
  | 'advising'    // svarar i pågående dialog
  | 'delegating'  // triggar agent, workflow eller navigering
  | 'monitoring'  // observerar passivt — session öppen men tyst (>5 min)

export interface Workspace {
  href:     string
  label:    string
  project?: { id: string; slug: string; name: string; color: string }
  icon?:    string
  status?:  'healthy' | 'needs_attention' | 'active' | 'unknown'
  priority?: 'urgent' | 'normal' | 'low'
}

export interface ConversationMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface ProjectRef {
  id:    string
  slug:  string
  name:  string
  color: string
}

export interface AtlasValue {
  // ── Röst ────────────────────────────────────────────────────────────────
  voicePhase:  VoicePhase
  transcript:  string            // löpande STT-text under listening
  response:    string            // ackumulerat Atlas-svar (streaming)
  perf:        string | null     // latens-readout, t.ex. "⚡ 1.4s"
  perfRaw:     string | null     // request-local raw timeline, never persisted
  progressivePlayback: ProgressiveCapability

  // ── Exekutivt läge ────────────────────────────────────────────────────
  executiveState: ExecutiveState
  execution: AtlasOrbRuntimeSignal | null
  awaitingApproval: AtlasOrbRuntimeSignal | null
  warning: AtlasOrbRuntimeSignal | null
  completionEvent: AtlasOrbCompletionEvent | null

  // ── Session ───────────────────────────────────────────────────────────
  isSessionActive: boolean
  lastActiveAt:    Date | null

  // ── Konversation ──────────────────────────────────────────────────────
  history:        ConversationMessage[]
  conversationId: string | null

  // ── Workspace ─────────────────────────────────────────────────────────
  currentWorkspace: Workspace
  activeProject:    ProjectRef | null
  openWorkspace(href: string, label?: string): void

  // ── Kontroller ────────────────────────────────────────────────────────
  activate():                       void
  deactivate():                     void
  stopAudio():                      void
  reportTextVisible():              void
  sendMessage(text: string): Promise<void>
}

// ── Context ──────────────────────────────────────────────────────────────────

const AtlasContext = createContext<AtlasValue | null>(null)
const AtlasAudioLevelContext = createContext<AtlasAudioLevelStore | null>(null)

/** Konsumera Atlas-runtime. Kastar om komponenten är utanför AtlasRuntimeProvider. */
export function useAtlas(): AtlasValue {
  const ctx = useContext(AtlasContext)
  if (!ctx) throw new Error('useAtlas() måste användas inuti AtlasRuntimeProvider')
  return ctx
}

/** Subscribe only the visual consumer to the high-frequency Web Audio level. */
export function useAtlasAudioLevel(): number {
  const store = useContext(AtlasAudioLevelContext)
  if (!store) throw new Error('useAtlasAudioLevel() måste användas inuti AtlasRuntimeProvider')
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}

// ── Provider ─────────────────────────────────────────────────────────────────

const SILENCE_MS    = 800                // ms tystnad → slut på yttrande
const INACTIVITY_MS = 5 * 60 * 1000     // 5 min → monitoring-tillstånd

interface AtlasRuntimeProviderProps {
  children: React.ReactNode
  projects?: { id: string; slug: string; name: string; color: string }[]
}

export function AtlasRuntimeProvider({
  children,
  projects = [],
}: AtlasRuntimeProviderProps) {

  const router   = useRouter()
  const pathname = usePathname()

  // Synk pathname i ref så att async-funktioner alltid läser aktuellt värde
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // ── Mount-skydd (SSR-säkerhet) ────────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Röstfas ──────────────────────────────────────────────────────────────
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const phaseRef = useRef<VoicePhase>('idle')
  useEffect(() => { phaseRef.current = voicePhase }, [voicePhase])

  // ── Executive state ──────────────────────────────────────────────────────
  const [executiveState, setExecutiveState] = useState<ExecutiveState>('idle')
  const [execution, setExecution] = useState<AtlasOrbRuntimeSignal | null>(null)
  const [awaitingApproval, setAwaitingApproval] = useState<AtlasOrbRuntimeSignal | null>(null)
  const [warning, setWarning] = useState<AtlasOrbRuntimeSignal | null>(null)
  const [completionEvent, setCompletionEvent] = useState<AtlasOrbCompletionEvent | null>(null)
  const executionRef = useRef<AtlasOrbRuntimeSignal | null>(null)
  const completionIdRef = useRef(0)

  // ── Röstinnehåll ─────────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState('')
  const [response, setResponse]     = useState('')
  const [perf, setPerf]             = useState<string | null>(null)
  const [perfRaw, setPerfRaw]       = useState<string | null>(null)
  const [progressivePlayback, setProgressivePlayback] = useState<ProgressiveCapability>('unsupported')
  useEffect(() => { setProgressivePlayback(progressiveMp3Capability()) }, [])

  // ── Session ──────────────────────────────────────────────────────────────
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [lastActiveAt, setLastActiveAt]       = useState<Date | null>(null)
  const isSessionActiveRef = useRef(false)
  useEffect(() => { isSessionActiveRef.current = isSessionActive }, [isSessionActive])

  // ── Konversation ─────────────────────────────────────────────────────────
  const [history, setHistory]               = useState<ConversationMessage[]>([])
  const historyRef                          = useRef<ConversationMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const convRef                             = useRef<string | null>(null)

  // ── Workspace ────────────────────────────────────────────────────────────
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(() =>
    resolveWorkspace(pathname, projects)
  )
  const [activeProject, setActiveProject] = useState<ProjectRef | null>(() =>
    resolveActiveProject(pathname, projects)
  )
  useEffect(() => {
    setCurrentWorkspace(resolveWorkspace(pathname, projects))
    setActiveProject(resolveActiveProject(pathname, projects))
    // projects är stabil (server-fetchad). pathname är rätt dep här.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // ── Voice-refs ────────────────────────────────────────────────────────────
  const recRef       = useRef<any>(null)
  // One live segment at a time. The handle owns the element, the analyser and
  // the object URL, so nothing here has to reach past it to tear a segment down.
  const playbackRef  = useRef<PlaybackHandle | null>(null)
  const audioLevelStoreRef = useRef<AtlasAudioLevelStore | null>(null)
  const audioAnalyserRef = useRef<AtlasAudioAnalyser | null>(null)
  const silenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRef    = useRef(false)
  const closedRef    = useRef(true)   // startar stängt (inaktivt)
  const listeningRef = useRef(false)
  const recActiveRef = useRef(false)
  // One timeline per request. `requestGeneration` is what stops a cancelled
  // response's late TTS or playback callback from writing into the next
  // request's marks and inventing a latency nobody experienced.
  const marksRef     = useRef<AtlasLatencyMarks>(createLatencyMarks(0, 'typed', 0))
  const requestGenRef = useRef(0)
  // Set by the recogniser at speech-end and consumed by the NEXT send. Held
  // apart from the marks so a typed message can never adopt a stale speech-end.
  const pendingSpeechEndRef = useRef<number | null>(null)
  const ttsMsRef     = useRef(0)
  const serverTimingRef = useRef<AtlasServerTiming | undefined>(undefined)
  const visibleGenerationRef = useRef<number | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const ttsQueueRef = useRef<BoundedTaskQueue<{
    url: string | null
    errorCode?: unknown
    responseAt?: number
  }> | null>(null)

  if (!audioLevelStoreRef.current) audioLevelStoreRef.current = new AtlasAudioLevelStore()

  useEffect(() => () => {
    chatAbortRef.current?.abort()
    ttsQueueRef.current?.cancel()
    playbackRef.current?.stop()
    void audioAnalyserRef.current?.dispose()
  }, [])

  function reportTextVisible() {
    const generation = visibleGenerationRef.current
    if (generation === null) return
    const at = performance.now()
    markOnce(marksRef.current, generation, 'firstDomVisible', at)
    if (markOnce(marksRef.current, generation, 'firstVisible', at)) {
      logLatency(serverTimingRef.current)
    }
  }

  function getAudioAnalyser(): AtlasAudioAnalyser {
    audioAnalyserRef.current ??= new AtlasAudioAnalyser({ store: audioLevelStoreRef.current! })
    return audioAnalyserRef.current
  }

  function beginExecution(toolName: string) {
    const signal = { active: true, toolName }
    executionRef.current = signal
    setExecution(signal)
    setAwaitingApproval(null)
    setWarning(null)
    setExecutiveState('delegating')
  }

  function finishExecution(toolName: string, result: Record<string, unknown> | null) {
    executionRef.current = null
    setExecution(null)
    const outcome = interpretAtlasToolResult(result)
    if (outcome.kind === 'awaiting_approval') {
      setAwaitingApproval({
        active: true,
        toolName,
        detail: outcome.detail,
      })
      return
    }
    if (outcome.kind === 'warning') {
      setWarning({
        active: true,
        toolName,
        detail: outcome.detail,
      })
      return
    }
    completionIdRef.current += 1
    setCompletionEvent({ id: completionIdRef.current, toolName })
  }

  // ── Inaktivitetstimer ─────────────────────────────────────────────────────
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function resetInactivityTimer() {
    setLastActiveAt(new Date())
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(() => {
      if (isSessionActiveRef.current) setExecutiveState('monitoring')
    }, INACTIVITY_MS)
  }

  // ── Refs till senaste funktionsversioner (undviker stale closures i effects) ──
  const startListeningRef = useRef<() => void>(() => {})
  const activateRef       = useRef<() => void>(() => {})
  const deactivateRef     = useRef<() => void>(() => {})
  const stopAudioRef      = useRef<() => void>(() => {})

  // ── Mic-watchdog ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      if (closedRef.current)    return
      if (!listeningRef.current) return
      if (recActiveRef.current)  return
      if (playbackRef.current)   return
      if (phaseRef.current === 'thinking' || phaseRef.current === 'speaking') return
      startListeningRef.current()
    }, 1500)
    return () => clearInterval(id)
  }, [mounted])

  // ── Globala kortkommandon ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (!isSessionActiveRef.current) {
          activateRef.current()
        } else if (phaseRef.current === 'speaking') {
          stopAudioRef.current()
        } else {
          deactivateRef.current()
        }
      }
      if (e.key === 'Escape' && isSessionActiveRef.current) {
        deactivateRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mounted])

  // ── STT ──────────────────────────────────────────────────────────────────
  function startListening() {
    if (closedRef.current)    return
    if (recActiveRef.current) return
    cancelRef.current = false

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Röstigenkänning kräver Chrome eller Safari.')
      return
    }

    const rec = new SR()
    rec.lang           = 'sv-SE'
    rec.continuous     = true
    rec.interimResults = true
    listeningRef.current = true

    rec.onstart = () => {
      recActiveRef.current = true
      setVoicePhase('listening')
      setTranscript('')
    }

    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setTranscript(text)
      if (silenceRef.current) clearTimeout(silenceRef.current)
      silenceRef.current = setTimeout(() => {
        const t = text.trim()
        if (t) {
          listeningRef.current = false
          try { rec.stop() } catch { /* ignore */ }
          pendingSpeechEndRef.current = performance.now()
          sendMessage(t)
        }
      }, SILENCE_MS)
    }

    rec.onerror = (ev: any) => {
      const err = ev?.error
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        listeningRef.current = false
        setVoicePhase('idle')
        alert('Mikrofon-åtkomst nekad. Tillåt mikrofonen i webbläsaren.')
      }
    }

    rec.onend = () => {
      recActiveRef.current = false
      if (silenceRef.current) clearTimeout(silenceRef.current)
      if (listeningRef.current && !cancelRef.current) {
        setTimeout(() => {
          if (listeningRef.current && !cancelRef.current && !recActiveRef.current) {
            startListeningRef.current()
          }
        }, 250)
      }
    }

    recRef.current = rec
    try { rec.start() } catch { recActiveRef.current = false }
  }

  function stopListening() {
    listeningRef.current = false
    try { recRef.current?.stop() } catch { /* ignore */ }
    if (silenceRef.current) clearTimeout(silenceRef.current)
    setVoicePhase('idle')
  }

  // ── TTS ──────────────────────────────────────────────────────────────────
  async function fetchTTSUrl(
    sentence: string,
    signal: AbortSignal,
    generation: number,
    progressive: boolean,
  ): Promise<{ url: string | null; response?: Response; errorCode?: unknown; responseAt?: number }> {
    try {
      const res = await fetch('/api/chat/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sentence, voice: 'onyx' }),
        signal,
      })
      const responseAt = performance.now()
      markOnce(marksRef.current, generation, 'ttsHeadersReceived', responseAt)
      markOnce(marksRef.current, generation, 'ttsResponse', responseAt)
      logLatency(serverTimingRef.current)
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { code?: unknown } | null
        return { url: null, errorCode: payload?.code, responseAt }
      }
      const ms = Number(res.headers.get('x-tts-upstream-ms') || 0)
      if (ms) ttsMsRef.current += ms
      if (progressive && res.body) return { url: null, response: res, responseAt }
      const chunks: ArrayBuffer[] = []
      const reader = res.body?.getReader()
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value?.byteLength) {
            markOnce(marksRef.current, generation, 'ttsFirstBodyByte', performance.now())
            chunks.push(Uint8Array.from(value).buffer)
          }
        }
      } else {
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength) {
          markOnce(marksRef.current, generation, 'ttsFirstBodyByte', performance.now())
          chunks.push(Uint8Array.from(bytes).buffer)
        }
      }
      const completeAt = performance.now()
      markOnce(marksRef.current, generation, 'ttsBodyComplete', completeAt)
      markOnce(marksRef.current, generation, 'ttsBlobReady', completeAt)
      logLatency(serverTimingRef.current)
      const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'audio/mpeg' })
      return { url: URL.createObjectURL(blob), responseAt }
    } catch (error) {
      if (signal.aborted) return { url: null }
      return { url: null, errorCode: 'ATLAS_TTS_REQUEST_FAILED' }
    }
  }

  /**
   * Play one segment and report what genuinely happened.
   *
   * `speaking` is raised from `onStart`, which fires on the element's `playing`
   * event — the first moment audio is actually leaving the browser. It is NOT
   * raised when the blob arrives and NOT when `play()` is called; either would
   * be the orb claiming to speak into silence, which is the defect this fixes.
   */
  function playbackCallbacks(generation: number, serverTiming?: AtlasServerTiming) {
    const eventMarks: Partial<Record<PlaybackEvent, AtlasLatencyMark>> = {
      'play-called': 'playCalled',
      'play-promise-resolved': 'playPromiseResolved',
      'play-promise-rejected': 'playPromiseRejected',
      loadedmetadata: 'loadedMetadata',
      canplay: 'canPlay',
      waiting: 'waiting',
      stalled: 'stalled',
      error: 'playbackError',
    }
    return {
      onEvent: (event: PlaybackEvent) => {
        const mark = eventMarks[event]
        if (mark && markOnce(marksRef.current, generation, mark, performance.now())) {
          logLatency(serverTiming)
        }
      },
      onStart: () => {
        if (requestGenRef.current !== generation || cancelRef.current) return
        setVoicePhase('speaking')
        if (markOnce(marksRef.current, generation, 'firstAudio', performance.now())) {
          logLatency(serverTiming)
        }
      },
    }
  }

  async function playUrl(
    url: string,
    generation: number,
    serverTiming?: AtlasServerTiming,
  ): Promise<PlaybackResult> {
    // The blob leaves our hands here. This is NOT `audio.play()` — the playback
    // module owns that, and the gap between the two is its analyser preparation.
    markOnce(marksRef.current, generation, 'playbackHandoff', performance.now())
    const handle = playTtsUrl(url, {
      analyser: getAudioAnalyser(),
      ...playbackCallbacks(generation, serverTiming),
    })
    playbackRef.current = handle
    try {
      return await handle.result
    } finally {
      if (playbackRef.current === handle) playbackRef.current = null
    }
  }

  async function playResponse(
    response: Response,
    generation: number,
    serverTiming?: AtlasServerTiming,
  ): Promise<PlaybackResult> {
    markOnce(marksRef.current, generation, 'playbackHandoff', performance.now())
    const bodyMarks: Partial<Record<TtsBodyEvent, AtlasLatencyMark>> = {
      'first-byte': 'ttsFirstBodyByte',
      'body-complete': 'ttsBodyComplete',
    }
    const handle = playProgressiveTtsResponse(response, {
      analyser: getAudioAnalyser(),
      capability: () => progressivePlayback,
      ...playbackCallbacks(generation, serverTiming),
      onBodyEvent: (event) => {
        const mark = bodyMarks[event]
        if (mark && markOnce(marksRef.current, generation, mark, performance.now())) {
          if (event === 'body-complete') {
            markOnce(marksRef.current, generation, 'ttsBlobReady', performance.now())
          }
          logLatency(serverTiming)
        }
      },
    })
    playbackRef.current = handle
    try {
      return await handle.result
    } finally {
      if (playbackRef.current === handle) playbackRef.current = null
    }
  }

  function logLatency(serverTiming?: AtlasServerTiming) {
    setPerf(formatLatency(marksRef.current, serverTiming))
    setPerfRaw(formatRawLatency(marksRef.current, serverTiming))
  }

  // ── Publika kontroller ────────────────────────────────────────────────────

  function activate() {
    closedRef.current    = false
    cancelRef.current    = false
    setAwaitingApproval(null)
    setWarning(null)
    setIsSessionActive(true)
    resetInactivityTimer()
    listeningRef.current = true
    startListening()
  }

  function deactivate() {
    closedRef.current    = true
    cancelRef.current    = true
    listeningRef.current = false
    stopListening()
    stopAudio()
    setVoicePhase('idle')
    setTranscript('')
    setIsSessionActive(false)
    setExecutiveState('idle')
    executionRef.current = null
    setExecution(null)
    setAwaitingApproval(null)
    setWarning(null)
    if (silenceRef.current)         clearTimeout(silenceRef.current)
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
  }

  function stopAudio() {
    cancelRef.current = true
    requestGenRef.current += 1
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    ttsQueueRef.current?.cancel()
    ttsQueueRef.current = null
    playbackRef.current?.stop()
    getAudioAnalyser().disconnect()
    setVoicePhase('idle')
    if (!closedRef.current) {
      listeningRef.current = true
      setTimeout(() => {
        if (!closedRef.current && !recActiveRef.current) startListeningRef.current()
      }, 200)
    }
  }

  function openWorkspace(href: string, _label?: string) {
    // P1A: tunn router.push-wrapper. P1B lägger till mjuka övergångar.
    router.push(href)
  }

  // ── Streaming + TTS-pipeline ──────────────────────────────────────────────
  async function sendMessage(text: string) {
    chatAbortRef.current?.abort()
    ttsQueueRef.current?.cancel()
    playbackRef.current?.stop()
    // A new request retires the previous timeline. Anything still in flight for
    // the old one now fails its generation check instead of contaminating this.
    const generation = ++requestGenRef.current
    const chatAbort = new AbortController()
    chatAbortRef.current = chatAbort
    const ttsQueue = new BoundedTaskQueue<{
      url: string | null
      response?: Response
      errorCode?: unknown
      responseAt?: number
    }>(2)
    ttsQueueRef.current = ttsQueue
    const isCurrent = () => requestGenRef.current === generation && !cancelRef.current
    const speechEnd = pendingSpeechEndRef.current
    pendingSpeechEndRef.current = null
    const origin: LatencyOrigin = speechEnd !== null ? 'voice' : 'typed'
    // Voice anchors on speech-end; a typed message has no speech, so submit is
    // its T0. Consuming the pending value above is what keeps them separate.
    marksRef.current = createLatencyMarks(generation, origin, speechEnd ?? performance.now())

    setVoicePhase('thinking')
    setTranscript(text)
    setResponse('')
    setPerf(null)
    setPerfRaw(null)
    cancelRef.current = false
    ttsMsRef.current  = 0
    serverTimingRef.current = undefined
    visibleGenerationRef.current = null
    executionRef.current = null
    setExecution(null)
    setAwaitingApproval(null)
    setWarning(null)

    // ExecutiveState: avgörs av konversationsdjup — ren tillståndsmaskin
    const isFirstMessage = historyRef.current.length === 0
    setExecutiveState(isFirstMessage ? 'briefing' : 'advising')
    resetInactivityTimer()

    // Uppdatera historik
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    setHistory(h => [...h, { role: 'user', content: text }])

    const urlQueue: Promise<{ url: string | null; response?: Response; errorCode?: unknown; responseAt?: number }>[] = []
    let reply         = ''
    let streamDone    = false
    let playerStarted = false
    let ttsFailureReported = false
    let serverTiming: AtlasServerTiming | undefined
    const segmenter = new IncrementalSpeechSegmenter()

    const player = async () => {
      let idx = 0
      while (isCurrent()) {
        if (idx >= urlQueue.length) {
          if (streamDone) break
          await new Promise(r => setTimeout(r, 50))
          continue
        }
        const tts = await urlQueue[idx]; idx++
        const url = tts.url
        if (!isCurrent()) {
          if (url) try { URL.revokeObjectURL(url) } catch { /* ignore */ }
          if (tts.response?.body) void tts.response.body.cancel().catch(() => undefined)
          break
        }
        if (tts.errorCode && !ttsFailureReported) {
          ttsFailureReported = true
          setWarning(resolveAtlasServiceWarning(tts.errorCode))
        }
        if (tts.response) {
          const outcome = await playResponse(tts.response, generation, serverTiming)
          if (isCurrent() && outcome.code && !ttsFailureReported) {
            ttsFailureReported = true
            setWarning(resolveAtlasServiceWarning(outcome.code))
          }
        } else if (url) {
          // The phase is raised inside playUrl, on real playback start. Here we
          // only care what came back: a blocked or failed segment must reach the
          // operator rather than pass for speech nobody heard.
          const outcome = await playUrl(url, generation, serverTiming)
          if (isCurrent() && outcome.code && !ttsFailureReported) {
            ttsFailureReported = true
            setWarning(resolveAtlasServiceWarning(outcome.code))
          }
        }
      }
      if (!isCurrent() && idx < urlQueue.length) {
        void Promise.all(urlQueue.slice(idx)).then((results) => {
          results.forEach(({ url: queuedUrl, response: queuedResponse }) => {
            if (queuedUrl) try { URL.revokeObjectURL(queuedUrl) } catch { /* ignore */ }
            if (queuedResponse?.body) void queuedResponse.body.cancel().catch(() => undefined)
          })
        })
      }
      if (isCurrent()) {
        setVoicePhase('idle')
        setTimeout(() => { if (isCurrent()) startListeningRef.current() }, 350)
      }
    }

    const enqueue = (source: string, boundary: 'sentence' | 'soft' | 'final') => {
      const s = toSpeechText(source)
      if (!s) return
      // enqueue is only ever reached with a COMPLETE speakable segment, so this
      // is exactly T4, and the TTS round trip for it starts on the next line.
      const isFirstSegment = urlQueue.length === 0
      markOnce(marksRef.current, generation, 'firstSpeakable', performance.now())
      if (boundary === 'sentence') {
        markOnce(marksRef.current, generation, 'firstSentence', performance.now())
      }
      const ttsRequestAt = performance.now()
      markOnce(marksRef.current, generation, 'ttsRequestStart', ttsRequestAt)
      markOnce(marksRef.current, generation, 'ttsStart', ttsRequestAt)
      const pending = ttsQueue.enqueue(signal => fetchTTSUrl(s, signal, generation, isFirstSegment)).then(result => {
        if (result.status === 'fulfilled') return result.value!
        if (result.status === 'failed') {
          return { url: null, errorCode: 'ATLAS_TTS_REQUEST_FAILED' as const }
        }
        return { url: null }
      })
      urlQueue.push(isFirstSegment
        // Only the FIRST segment's blob answers "how long does one TTS call
        // take". The cumulative ttsMsRef cannot distinguish that.
        ? pending.then(result => {
            if (!isCurrent()) return result
            return result
          })
        : pending)
      if (!playerStarted) { playerStarted = true; player() }
    }

    const chatRequestAt = performance.now()
    markOnce(marksRef.current, generation, 'chatRequestStart', chatRequestAt)
    markOnce(marksRef.current, generation, 'sent', chatRequestAt)

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(
          buildChatRequestBody({
            messages:        historyRef.current,
            voice:           true,
            conversation_id: convRef.current ?? undefined,
            create_conversation: !convRef.current,
          })
        ),
        signal: chatAbort.signal,
      })

      markOnce(marksRef.current, generation, 'chatHeadersReceived', performance.now())
      logLatency(serverTiming)

      if (!isCurrent()) return
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { code?: unknown } | null
        setWarning(resolveAtlasServiceWarning(payload?.code))
        streamDone = true
        setVoicePhase('idle')
        return
      }

      if (res.body) {
        const onEvent = (d: AtlasSseEvent) => {
          if (!isCurrent()) return

          if (d.event === 'text' && typeof d.text === 'string' && d.text) {
            const at = performance.now()
            markOnce(marksRef.current, generation, 'firstSseTextReceived', at)
            markOnce(marksRef.current, generation, 'firstByte', at)
            reply += d.text
            visibleGenerationRef.current = generation
            setResponse(reply)
            for (const segment of segmenter.push(d.text)) {
              enqueue(segment.text, segment.boundary)
            }

          } else if (d.event === 'timing') {
            serverTiming = mergeServerTiming(serverTiming, {
              authReadyMs:   typeof d.authReadyMs === 'number' ? d.authReadyMs : undefined,
              requestParsedMs: typeof d.requestParsedMs === 'number' ? d.requestParsedMs : undefined,
              contextMs:     typeof d.contextMs === 'number' ? d.contextMs : undefined,
              modelStartMs:  typeof d.modelStartMs === 'number' ? d.modelStartMs : undefined,
              streamReadyMs: typeof d.streamReadyMs === 'number' ? d.streamReadyMs : undefined,
              firstTokenMs:  typeof d.firstTokenMs === 'number' ? d.firstTokenMs : undefined,
              serverTotalMs: typeof d.serverTotalMs === 'number' ? d.serverTotalMs : undefined,
            })
            serverTimingRef.current = serverTiming
            logLatency(serverTiming)

          } else if (d.event === 'conversation' && typeof d.id === 'string') {
            convRef.current = d.id
            setConversationId(d.id)

          } else if (d.event === 'navigate' && typeof d.href === 'string') {
            setExecutiveState('delegating')
            if (d.href.split('?')[0] !== pathnameRef.current) openWorkspace(d.href)

          } else if (d.event === 'tool_call' && typeof d.tool === 'string' && ATLAS_ACTION_TOOL_NAMES.has(d.tool)) {
            beginExecution(d.tool)

          } else if (d.event === 'tool_result' && typeof d.tool === 'string' && ATLAS_ACTION_TOOL_NAMES.has(d.tool)) {
            const result = d.result && typeof d.result === 'object'
              ? d.result as Record<string, unknown>
              : null
            finishExecution(d.tool, result)

          } else if (d.event === 'error') {
            executionRef.current = null
            setExecution(null)
            setWarning(resolveAtlasServiceWarning(d.code))

          } else if (d.event === 'done' && executionRef.current) {
            executionRef.current = null
            setExecution(null)
          }
        }

        await consumeAtlasSse(res.body, onEvent, chatAbort.signal)
      }

      streamDone = true
      for (const segment of segmenter.push('', true)) {
        enqueue(segment.text, segment.boundary)
      }

      if (isCurrent()) {
        historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
        setHistory(h => [...h, { role: 'assistant', content: reply }])
      }

      if (!playerStarted && isCurrent()) {
        setVoicePhase('idle')
        setTimeout(() => { if (isCurrent()) startListeningRef.current() }, 350)
      }
    } catch {
      streamDone = true
      if (!isCurrent() || chatAbort.signal.aborted) return
      executionRef.current = null
      setExecution(null)
      setWarning({ active: true, detail: 'Anslutningen till Atlas avbröts.' })
      setVoicePhase('idle')
      setTimeout(() => { if (isCurrent()) startListeningRef.current() }, 350)
    } finally {
      if (chatAbortRef.current === chatAbort) chatAbortRef.current = null
    }
  }

  // Håll function-refs à jour med senaste definitions (undviker stale closures)
  startListeningRef.current = startListening
  activateRef.current       = activate
  deactivateRef.current     = deactivate
  stopAudioRef.current      = stopAudio

  // ── Context-värde ─────────────────────────────────────────────────────────
  const value: AtlasValue = {
    voicePhase,
    transcript,
    response,
    perf,
    perfRaw,
    progressivePlayback,
    executiveState,
    execution,
    awaitingApproval,
    warning,
    completionEvent,
    isSessionActive,
    lastActiveAt,
    history,
    conversationId,
    currentWorkspace,
    activeProject,
    openWorkspace,
    activate,
    deactivate,
    stopAudio,
    reportTextVisible,
    sendMessage,
  }

  return (
    <AtlasAudioLevelContext.Provider value={audioLevelStoreRef.current}>
      <AtlasContext.Provider value={value}>
        {children}
      </AtlasContext.Provider>
    </AtlasAudioLevelContext.Provider>
  )
}
