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
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient }           from '@/lib/supabase/client'
import { buildChatRequestBody }   from '@/lib/atlas/view-client'
import { resolveWorkspace, resolveActiveProject } from './workspace-registry'

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

  // ── Exekutivt läge ────────────────────────────────────────────────────
  executiveState: ExecutiveState

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
  sendMessage(text: string): Promise<void>
}

// ── Context ──────────────────────────────────────────────────────────────────

const AtlasContext = createContext<AtlasValue | null>(null)

/** Konsumera Atlas-runtime. Kastar om komponenten är utanför AtlasRuntimeProvider. */
export function useAtlas(): AtlasValue {
  const ctx = useContext(AtlasContext)
  if (!ctx) throw new Error('useAtlas() måste användas inuti AtlasRuntimeProvider')
  return ctx
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

  // ── Röstinnehåll ─────────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState('')
  const [response, setResponse]     = useState('')
  const [perf, setPerf]             = useState<string | null>(null)

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
  const audioRef     = useRef<HTMLAudioElement | null>(null)
  const silenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRef    = useRef(false)
  const closedRef    = useRef(true)   // startar stängt (inaktivt)
  const listeningRef = useRef(false)
  const recActiveRef = useRef(false)
  const marksRef     = useRef<Record<string, number>>({})
  const ttsMsRef     = useRef(0)

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
      if (audioRef.current)      return
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

  // ── Konversations-skapare ─────────────────────────────────────────────────
  async function ensureConversation(firstText: string): Promise<string | null> {
    if (convRef.current) return convRef.current
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return null
      const { data } = await sb
        .from('conversations')
        .insert({ user_id: user.id, title: '🎙 ' + firstText.slice(0, 56) })
        .select('id')
        .single()
      const id = (data as any)?.id ?? null
      convRef.current = id
      if (id) setConversationId(id)
    } catch { /* osparat samtal är ok */ }
    return convRef.current
  }

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
          marksRef.current = { speechEnd: performance.now() }
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
  async function fetchTTSUrl(sentence: string): Promise<string | null> {
    try {
      const res = await fetch('/api/chat/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sentence, voice: 'onyx' }),
      })
      if (!res.ok) return null
      const ms = Number(res.headers.get('x-tts-ms') || 0)
      if (ms) ttsMsRef.current += ms
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        audioRef.current = null
        resolve()
      }
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    })
  }

  function logLatency(
    serverTiming?: { contextMs?: number; firstTokenMs?: number; serverTotalMs?: number }
  ) {
    const m = marksRef.current
    const totalToVoice = (m.speechEnd && m.firstAudio)
      ? Math.round(m.firstAudio - m.speechEnd)
      : null
    if (totalToVoice) setPerf(`⚡ ${(totalToVoice / 1000).toFixed(1)}s`)
  }

  // ── Publika kontroller ────────────────────────────────────────────────────

  function activate() {
    closedRef.current    = false
    cancelRef.current    = false
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
    if (silenceRef.current)         clearTimeout(silenceRef.current)
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
  }

  function stopAudio() {
    cancelRef.current = true
    try { audioRef.current?.pause(); audioRef.current = null } catch { /* ignore */ }
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
    setVoicePhase('thinking')
    setTranscript(text)
    setResponse('')
    setPerf(null)
    cancelRef.current = false
    ttsMsRef.current  = 0

    // ExecutiveState: avgörs av konversationsdjup — ren tillståndsmaskin
    const isFirstMessage = historyRef.current.length === 0
    setExecutiveState(isFirstMessage ? 'briefing' : 'advising')
    resetInactivityTimer()

    // Uppdatera historik
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    setHistory(h => [...h, { role: 'user', content: text }])

    const urlQueue: Promise<string | null>[] = []
    let reply         = ''
    let processedLen  = 0
    let streamDone    = false
    let playerStarted = false
    let serverTiming: { contextMs?: number; firstTokenMs?: number; serverTotalMs?: number } | undefined

    const player = async () => {
      setVoicePhase('speaking')
      let idx = 0
      while (!cancelRef.current) {
        if (idx >= urlQueue.length) {
          if (streamDone) break
          await new Promise(r => setTimeout(r, 50))
          continue
        }
        const url = await urlQueue[idx]; idx++
        if (cancelRef.current) break
        if (url) {
          if (!marksRef.current.firstAudio) {
            marksRef.current.firstAudio = performance.now()
            logLatency(serverTiming)
          }
          await playUrl(url)
        }
      }
      if (!cancelRef.current) {
        setVoicePhase('idle')
        setTimeout(() => { if (!cancelRef.current) startListeningRef.current() }, 350)
      }
    }

    const enqueue = (sentence: string) => {
      const s = sentence.trim()
      if (!s) return
      urlQueue.push(fetchTTSUrl(s))
      if (!playerStarted) { playerStarted = true; player() }
    }

    const flush = (final: boolean) => {
      const re = /[.!?…]+\s/g
      re.lastIndex = processedLen
      let m: RegExpExecArray | null
      let boundary = processedLen
      while ((m = re.exec(reply)) !== null) {
        const end = m.index + m[0].length
        enqueue(reply.slice(boundary, end))
        boundary = end
      }
      processedLen = boundary
      if (final && processedLen < reply.length) {
        enqueue(reply.slice(processedLen))
        processedLen = reply.length
      }
    }

    const convId = await ensureConversation(text)
    marksRef.current.sent = performance.now()

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(
          buildChatRequestBody({
            messages:        historyRef.current,
            voice:           true,
            conversation_id: convId,
          })
        ),
      })

      if (res.ok && res.body) {
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let   buf     = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelRef.current) { try { reader.cancel() } catch { /* ignore */ }; break }

          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const d = JSON.parse(line.slice(6))

              if (d.event === 'text' && d.text) {
                if (!marksRef.current.firstByte) marksRef.current.firstByte = performance.now()
                reply += d.text
                setResponse(reply)
                flush(false)

              } else if (d.event === 'timing') {
                serverTiming = {
                  contextMs:     d.contextMs,
                  firstTokenMs:  d.firstTokenMs,
                  serverTotalMs: d.serverTotalMs,
                }

              } else if (d.event === 'navigate' && d.href) {
                // Atlas delegerar till ett workspace
                setExecutiveState('delegating')
                const href = d.href as string
                if (href.split('?')[0] !== pathnameRef.current) {
                  openWorkspace(href)
                }

              } else if (d.event === 'tool_call' && d.name === 'trigger_workflow') {
                // Atlas delegerar till en agent
                setExecutiveState('delegating')
              }
            } catch { /* ignorera felaktiga SSE-frames */ }
          }
        }
      }

      streamDone = true
      flush(true)

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      setHistory(h => [...h, { role: 'assistant', content: reply }])

      if (!playerStarted) {
        setVoicePhase('idle')
        setTimeout(() => { if (!cancelRef.current) startListeningRef.current() }, 350)
      }
    } catch {
      streamDone = true
      setVoicePhase('idle')
      setTimeout(() => { if (!cancelRef.current) startListeningRef.current() }, 350)
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
    executiveState,
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
    sendMessage,
  }

  return (
    <AtlasContext.Provider value={value}>
      {children}
    </AtlasContext.Provider>
  )
}
