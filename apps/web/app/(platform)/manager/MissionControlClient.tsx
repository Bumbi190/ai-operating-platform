'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Brain, Activity, ShieldCheck, AlertTriangle,
  Zap, CheckCircle2, XCircle, Clock,
  Bot, Play, Send, Loader2,
  Terminal, Eye, GitBranch, Plus,
  TrendingUp, Settings, Cpu, Mic, MicOff, Volume2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  slug: string
  color: string
}

interface Agent {
  id: string
  name: string
  project_id: string
  model: string
}

interface Run {
  id: string
  status: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  error: string | null
  workflow_id: string
  project_id: string
  workflows: { name: string } | null
  projects: { name: string; slug: string; color: string } | null
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
}

interface AgentMessage {
  id: string
  from_agent: string
  to_agent: string
  message_type: string
  content: string
  created_at: string
}

interface RunLog {
  id: string
  role: string
  content: string
  step_order: number | null
  step_name: string | null
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
  created_at: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

// Anthropic message format for the chat API
interface AnthropicMsg {
  role: 'user' | 'assistant'
  content: string
}

export interface MissionControlProps {
  projects: Project[]
  agents: Agent[]
  runs: Run[]
  approvalCount: number
  tasks: Task[]
  agentMessages: AgentMessage[]
  totalCostStr: string
  conversationId: string | null
  initialChatMessages: ChatMsg[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS = {
  done:    { dot: 'bg-emerald-400',               label: 'Klar',    text: 'text-emerald-400' },
  running: { dot: 'bg-blue-400 animate-pulse',    label: 'Kör',     text: 'text-blue-400'    },
  failed:  { dot: 'bg-red-400',                   label: 'Fel',     text: 'text-red-400'     },
  pending: { dot: 'bg-zinc-600',                  label: 'Väntar',  text: 'text-zinc-500'    },
} as const

const ROLE_COLOR: Record<string, string> = {
  user:      'text-blue-400',
  assistant: 'text-emerald-400',
  system:    'text-yellow-400',
  tool:      'text-purple-400',
}

function sanitizeLog(content: string): string {
  if (content.startsWith('data:image/')) return '🖼️  [Bild genererad]'
  try {
    const p = JSON.parse(content)
    if (p && typeof p === 'object') {
      const urls: string[] = p.urls ?? []
      if (urls.length > 0) return `🖼️  ${urls.length} bild${urls.length !== 1 ? 'er' : ''} genererad${urls.length !== 1 ? 'e' : ''}`
      if (Array.isArray(p)) return `[${p.length} prompts]`
    }
  } catch { /* not json */ }
  if (content.length > 500 && /^[A-Za-z0-9+/=\s]{200,}/.test(content)) return `[Binärdata — ${content.length} tecken]`
  return content
}

// ── Main component ────────────────────────────────────────────────────────────

export function MissionControlClient({
  projects, agents, runs, approvalCount, tasks,
  agentMessages, totalCostStr, conversationId: initConvId, initialChatMessages,
}: MissionControlProps) {

  // ── State ──────────────────────────────────────────────────────────────────
  const activeRun = runs.find(r => r.status === 'running')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    activeRun?.id ?? runs[0]?.id ?? null,
  )
  const [centerTab, setCenterTab] = useState<'runs' | 'logs' | 'agents'>(activeRun ? 'logs' : 'runs')

  // Logs panel state
  const [logs, setLogs] = useState<RunLog[]>([])
  const [logStatus, setLogStatus] = useState<string>(
    runs.find(r => r.id === selectedRunId)?.status ?? 'pending',
  )
  const [logConnected, setLogConnected] = useState(false)
  const logBottomRef = useRef<HTMLDivElement>(null)

  // Chat state
  const [convId, setConvId]           = useState<string | null>(initConvId)
  const [chatHistory, setChatHistory] = useState<AnthropicMsg[]>(
    initialChatMessages.map(m => ({ role: m.role, content: m.content })),
  )
  const [chatDisplay, setChatDisplay] = useState<ChatMsg[]>(initialChatMessages)
  const [chatInput, setChatInput]     = useState('')
  const [chatBusy, setChatBusy]       = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Voice state
  const [voiceMode, setVoiceMode]       = useState(false)   // auto-play responses
  const [isListening, setIsListening]   = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  const audioRef       = useRef<HTMLAudioElement | null>(null)

  // Clock
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  )

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedRun = runs.find(r => r.id === selectedRunId)
  const runningRuns = runs.filter(r => r.status === 'running')
  const agentsByProject = projects.reduce<Record<string, Agent[]>>((acc, p) => {
    acc[p.id] = agents.filter(a => a.project_id === p.id)
    return acc
  }, {})
  const totalTokens = logs.reduce((s, l) => s + (l.tokens_in ?? 0) + (l.tokens_out ?? 0), 0)

  // ── Clock tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatDisplay])

  // ── Voice: speak agent response via Victoria (ElevenLabs) ──────────────────
  async function speakText(text: string) {
    try {
      const res = await fetch('/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
    } catch { /* non-fatal */ }
  }

  // ── Voice: start/stop microphone listening ─────────────────────────────────
  function toggleListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Din webbläsare stöder inte röstigenkänning. Använd Chrome eller Safari.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      setVoiceTranscript('')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang            = 'sv-SE'
    recognition.continuous      = false
    recognition.interimResults  = true

    recognition.onstart = () => setIsListening(true)

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setVoiceTranscript(transcript)
      // Final result → send
      if (e.results[e.results.length - 1].isFinal) {
        setIsListening(false)
        setVoiceTranscript('')
        if (transcript.trim()) sendMessage(transcript.trim())
      }
    }

    recognition.onerror = () => { setIsListening(false); setVoiceTranscript('') }
    recognition.onend   = () => { setIsListening(false); setVoiceTranscript('') }

    recognitionRef.current = recognition
    recognition.start()
  }

  // ── SSE for selected run ───────────────────────────────────────────────────
  const loadRun = useCallback((runId: string, status: string) => {
    setLogs([])
    setLogStatus(status)
    setLogConnected(false)

    const es = new EventSource(`/api/runs/${runId}/stream`)

    es.onopen = () => setLogConnected(true)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'log' && data.log) {
          setLogs(prev => prev.some(l => l.id === data.log.id) ? prev : [...prev, data.log])
        }
        if (data.type === 'done')  { setLogStatus('done');   setLogConnected(false); es.close() }
        if (data.type === 'error') { setLogStatus('failed'); setLogConnected(false); es.close() }
      } catch { /* ignore */ }
    }

    es.onerror = () => { setLogConnected(false); es.close() }

    return () => es.close()
  }, [])

  useEffect(() => {
    if (!selectedRunId) return
    const run = runs.find(r => r.id === selectedRunId)
    return loadRun(selectedRunId, run?.status ?? 'pending')
  }, [selectedRunId, loadRun])

  // ── Select run + switch to logs ────────────────────────────────────────────
  function selectRun(id: string) {
    setSelectedRunId(id)
    setCenterTab('logs')
  }

  // ── Chat send ──────────────────────────────────────────────────────────────
  async function sendMessage(text: string) {
    const msg = text.trim()
    if (!msg || chatBusy) return
    setChatInput('')
    setChatBusy(true)

    const userDisplay: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: msg }
    setChatDisplay(prev => [...prev, userDisplay])

    const newHistory: AnthropicMsg[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory)

    // Create conversation if needed
    let currentConvId = convId
    if (!currentConvId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: msg.slice(0, 60) }),
        })
        const data = await res.json()
        currentConvId = data.id ?? null
        setConvId(currentConvId)
      } catch { /* proceed without saving */ }
    }

    // Stream from /api/chat
    const assistantId = `a-${Date.now()}`
    setChatDisplay(prev => [...prev, { id: assistantId, role: 'assistant', content: '', isStreaming: true }])
    let assistantText = ''

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          conversation_id: currentConvId,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Chat misslyckades')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''  // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.event === 'text' && d.text) {
              assistantText += d.text
              setChatDisplay(prev =>
                prev.map(m => m.id === assistantId
                  ? { ...m, content: assistantText }
                  : m,
                ),
              )
            }
            if (d.event === 'done') break
          } catch { /* ignore parse errors */ }
        }
      }

      setChatDisplay(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m))
      setChatHistory(prev => [...prev, { role: 'assistant', content: assistantText }])

      // Auto-play response with Victoria's voice if voice mode is on
      if (voiceMode && assistantText) speakText(assistantText)

    } catch (err) {
      setChatDisplay(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: 'Kunde inte nå Manager Agent. Försök igen.', isStreaming: false }
          : m,
        ),
      )
    } finally {
      setChatBusy(false)
    }
  }

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(chatInput)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // Manager is a bespoke 3-column operator console that lives inside the new
  // OS shell's main column (the parent is already `overflow-y-auto` and sized
  // to viewport minus the command bar). We fill the canvas with min-height
  // instead of nesting another `h-screen` viewport-locked scroller.
  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col bg-[#060a10] text-zinc-300">

      {/* ═══════ TOP STATUS BAR ═════════════════════════════════════════════ */}
      <header className="h-11 flex items-center gap-3 px-4 border-b border-white/[0.06] bg-black/40 shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-indigo-600/90 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/70">
            Mission Control
          </span>
        </div>

        <div className="w-px h-4 bg-white/10 shrink-0" />

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400/80 tracking-wider">LIVE</span>
        </div>

        {/* Active runs */}
        {runningRuns.length > 0 ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-mono text-blue-400">
              {runningRuns.length} AKTIV{runningRuns.length !== 1 ? 'A' : ''}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-zinc-700 shrink-0">INAKTIV</span>
        )}

        <div className="flex-1" />

        {/* Right stats */}
        <div className="flex items-center gap-4 text-[10px] font-mono">
          {approvalCount > 0 && (
            <Link
              href="/approvals"
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ShieldCheck className="w-3 h-3" />
              {approvalCount} ATT GRANSKA
            </Link>
          )}
          <span className="text-zinc-600">{totalCostStr} / MÅN</span>
          <span className="text-zinc-500 tabular-nums">{clock}</span>
        </div>
      </header>

      {/* ═══════ 3-COLUMN BODY ══════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ CENTER PANEL — Run Monitor ═════════════════════════════════════ */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#060a10]">

          {/* Tab bar */}
          <div className="flex items-center border-b border-white/[0.06] bg-black/20 shrink-0 px-2 gap-0.5">
            {[
              { id: 'runs'   as const, label: 'Körningar', Icon: Play,     badge: runningRuns.length },
              { id: 'logs'   as const, label: 'Live Log',  Icon: Terminal,  badge: 0 },
              { id: 'agents' as const, label: 'Agenter',   Icon: Bot,       badge: agents.filter(a => runs.some(r => r.project_id === a.project_id && r.status === 'running')).length },
            ].map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                onClick={() => setCenterTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-[11px] border-b-2 transition-colors',
                  centerTab === id
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-zinc-600 hover:text-zinc-400',
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
                {badge > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
              </button>
            ))}

            <div className="flex-1" />

            {/* Selected run label */}
            {selectedRun && (
              <div className="flex items-center gap-2 px-4 text-[10px] font-mono text-zinc-700">
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS[logStatus as keyof typeof STATUS]?.dot ?? 'bg-zinc-600')} />
                {(selectedRun.workflows as any)?.name ?? 'Körning'} · {selectedRun.id.slice(0, 8)}
              </div>
            )}
          </div>

          {/* Tab: Runs grid */}
          {centerTab === 'runs' && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
              {/* Running now */}
              {runningRuns.length > 0 && (
                <section>
                  <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-600 mb-2 px-0.5">
                    Aktiva just nu
                  </p>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {runningRuns.map(run => (
                      <RunCard key={run.id} run={run} isSelected={run.id === selectedRunId} onSelect={selectRun} />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent */}
              <section>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-600 mb-2 px-0.5">
                  Senaste körningar
                </p>
                {runs.filter(r => r.status !== 'running').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Play className="w-10 h-10 text-zinc-800 mb-3" />
                    <p className="text-sm text-zinc-600">Inga körningar ännu</p>
                    <p className="text-xs text-zinc-700 mt-1">Kör ett workflow från ett projekt för att komma igång</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {runs.filter(r => r.status !== 'running').slice(0, 12).map(run => (
                      <RunCard key={run.id} run={run} isSelected={run.id === selectedRunId} onSelect={selectRun} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Tab: Agents grid */}
          {centerTab === 'agents' && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 px-0.5">
                <div>
                  <p className="text-xs font-semibold text-zinc-300">Agent Status</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">
                    {agents.filter(a => runs.some(r => r.project_id === a.project_id && r.status === 'running')).length} aktiva
                    <span className="mx-1.5 text-zinc-800">·</span>
                    {agents.length} totalt
                  </p>
                </div>
                <Link
                  href="/projects"
                  className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors font-mono"
                >
                  Alla projekt →
                </Link>
              </div>

              {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Bot className="w-10 h-10 text-zinc-800 mb-3" />
                  <p className="text-sm text-zinc-600">Inga agenter ännu</p>
                  <p className="text-xs text-zinc-700 mt-1">Skapa agenter från ett projekt</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      projects={projects}
                      runs={runs}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Live Log (terminal) */}
          {centerTab === 'logs' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950/60">
              {/* Terminal header */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-zinc-950/80 shrink-0">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                </div>
                <span className="flex-1 text-[10px] font-mono text-zinc-600 truncate">
                  {selectedRun
                    ? `${(selectedRun.workflows as any)?.name ?? 'körning'} · ${selectedRun.id}`
                    : 'ingen körning vald — klicka på en körning'}
                </span>
                <div className="flex items-center gap-3 text-[10px] font-mono shrink-0">
                  {logConnected && (
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {logStatus === 'done'    && <span className="text-emerald-400">✓ KLAR</span>}
                  {logStatus === 'failed'  && <span className="text-red-400">✗ FEL</span>}
                  {totalTokens > 0 && (
                    <span className="text-zinc-700">{totalTokens.toLocaleString()} tokens</span>
                  )}
                  {selectedRun && (
                    <Link
                      href={`/projects/${(selectedRun.projects as any)?.slug}/runs/${selectedRun.id}`}
                      className="flex items-center gap-1 text-zinc-700 hover:text-zinc-400 transition-colors"
                    >
                      <Eye className="w-3 h-3" /> Fullskärm
                    </Link>
                  )}
                </div>
              </div>

              {/* Log lines */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-4 font-mono text-[11px] space-y-1.5">
                {logs.length === 0 && !logConnected && (
                  <div className="flex items-center gap-2.5 text-zinc-700 py-4">
                    <span className="w-3 h-3 rounded-full border border-zinc-700 animate-pulse" />
                    {selectedRunId ? 'Laddar logg...' : 'Välj en körning från listan till vänster'}
                  </div>
                )}

                {logs.map((log, i) => (
                  <div key={log.id ?? i}>
                    {/* Step divider */}
                    {log.role === 'user' && log.step_name && (
                      <div className="flex items-center gap-3 my-4 first:mt-0">
                        <div className="h-px flex-1 bg-white/[0.05]" />
                        <span className="text-zinc-600 text-[10px] font-sans shrink-0">
                          {log.step_order}. {log.step_name}
                        </span>
                        <div className="h-px flex-1 bg-white/[0.05]" />
                      </div>
                    )}

                    <div className="flex gap-3 leading-relaxed">
                      <span className={cn('w-12 text-right shrink-0 mt-0.5', ROLE_COLOR[log.role] ?? 'text-zinc-600')}>
                        [{log.role === 'assistant' ? 'out' : log.role === 'user' ? 'in' : log.role}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <pre className="whitespace-pre-wrap break-words text-zinc-300 leading-relaxed">
                          {sanitizeLog(log.content)}
                        </pre>
                        {(log.tokens_in != null || log.duration_ms != null) && (
                          <div className="flex gap-2 text-zinc-700 font-sans mt-0.5 text-[9px]">
                            {log.duration_ms != null && <span>{(log.duration_ms / 1000).toFixed(1)}s</span>}
                            {(log.tokens_in != null || log.tokens_out != null) && (
                              <span>{(log.tokens_in ?? 0) + (log.tokens_out ?? 0)} tokens</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {logStatus === 'done' && logs.length > 0 && (
                  <div className="mt-6 pt-3 border-t border-white/[0.05] flex items-center gap-2 text-emerald-400 font-sans text-[10px]">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Körning klar · {logs.filter(l => l.role === 'assistant').length} svar genererade
                    {totalTokens > 0 && ` · ${totalTokens.toLocaleString()} tokens totalt`}
                  </div>
                )}
                {logStatus === 'failed' && (
                  <div className="mt-6 pt-3 border-t border-white/[0.05] flex items-center gap-2 text-red-400 font-sans text-[10px]">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    Körning misslyckades — se felmeddelande ovan
                  </div>
                )}

                <div ref={logBottomRef} />
              </div>
            </div>
          )}
        </main>

        {/* ═══ RIGHT PANEL — Manager Agent Chat ═══════════════════════════════ */}
        <aside className="w-80 border-l border-white/[0.06] flex flex-col bg-black/20 shrink-0">

          {/* Header */}
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2.5 shrink-0">
            <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Brain className="w-3 h-3 text-indigo-400" />
            </div>
            <span className="text-xs font-semibold text-zinc-300">Manager Agent</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-mono text-emerald-400/70">ONLINE</span>
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
            {chatDisplay.length === 0 && (
              <div className="py-8 text-center space-y-3">
                <Brain className="w-10 h-10 text-indigo-400/10 mx-auto" />
                <div>
                  <p className="text-xs text-zinc-600">Chatta med Manager Agent</p>
                  <p className="text-[10px] text-zinc-700 mt-1">
                    Fråga om status, planer eller be om åtgärder
                  </p>
                </div>
              </div>
            )}

            {chatDisplay.map(msg => (
              <div
                key={msg.id}
                className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-2.5 h-2.5 text-indigo-400" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[88%] rounded-xl px-3 py-2 text-[11px] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-indigo-600/25 text-indigo-100 rounded-br-none'
                    : 'bg-white/[0.05] text-zinc-300 rounded-bl-none',
                )}>
                  {msg.isStreaming && !msg.content ? (
                    <span className="flex items-center gap-1.5 text-zinc-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Tänker...
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-3 py-2 border-t border-white/[0.06] flex gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
            {['Status?', 'Daglig plan', 'Fel idag?', 'Kostnader?'].map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={chatBusy}
                className="text-[9px] text-zinc-700 hover:text-zinc-400 bg-white/[0.04] hover:bg-white/[0.07] px-2 py-1 rounded-full whitespace-nowrap transition-colors disabled:opacity-40 shrink-0 font-mono"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat input */}
          <form onSubmit={handleChatSubmit} className="px-3 pb-3 pt-1 shrink-0">
            {/* Voice transcript preview */}
            {isListening && (
              <div className="mb-1.5 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                <span className="text-[10px] text-red-300 italic truncate flex-1">
                  {voiceTranscript || 'Lyssnar...'}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder={isListening ? 'Lyssnar...' : 'Fråga Manager Agent...'}
                disabled={chatBusy || isListening}
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50 transition-colors"
              />

              {/* Mic button */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={chatBusy}
                title={isListening ? 'Stoppa inspelning' : 'Tala med Manager Agent (fn)'}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors shrink-0 self-end',
                  isListening
                    ? 'bg-red-500/80 hover:bg-red-500 animate-pulse'
                    : 'bg-white/[0.07] hover:bg-white/[0.12]',
                )}
              >
                {isListening
                  ? <MicOff className="w-3.5 h-3.5 text-white" />
                  : <Mic className="w-3.5 h-3.5 text-zinc-400" />
                }
              </button>

              {/* Voice mode toggle (auto-play responses) */}
              <button
                type="button"
                onClick={() => setVoiceMode(v => !v)}
                title={voiceMode ? 'Stäng av Victorias röst' : 'Aktivera Victorias röst på svar'}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 self-end',
                  voiceMode
                    ? 'bg-indigo-600/60 hover:bg-indigo-600/80 text-indigo-300'
                    : 'bg-white/[0.07] hover:bg-white/[0.12] text-zinc-600',
                )}
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>

              {/* Send button */}
              <button
                type="submit"
                disabled={chatBusy || !chatInput.trim()}
                className="w-8 h-8 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 flex items-center justify-center disabled:opacity-30 transition-colors shrink-0 self-end"
              >
                {chatBusy
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  : <Send className="w-3.5 h-3.5 text-white" />
                }
              </button>
            </div>
          </form>

          {/* Manager Tasks */}
          {tasks.length > 0 && (
            <div className="border-t border-white/[0.06] shrink-0">
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-600">
                  Uppgifter
                </span>
                <span className="text-[9px] font-mono text-zinc-700">
                  {tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length} aktiva
                </span>
              </div>
              <div className="px-3 pb-3 space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                {tasks.slice(0, 6).map(task => (
                  <div key={task.id} className="flex items-start gap-2">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                      task.status === 'done'        ? 'bg-emerald-500' :
                      task.status === 'in_progress' ? 'bg-blue-400 animate-pulse' :
                      task.priority === 'critical' || task.priority === 'high' ? 'bg-amber-500' :
                      'bg-zinc-700',
                    )} />
                    <p className="text-[10px] text-zinc-600 leading-snug">{task.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Messages */}
          {agentMessages.length > 0 && (
            <div className="border-t border-white/[0.06] shrink-0">
              <div className="px-4 py-2">
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-600">
                  Agentmeddelanden
                </span>
              </div>
              <div className="px-3 pb-3 space-y-1.5 max-h-28 overflow-y-auto scrollbar-thin">
                {agentMessages.slice(0, 4).map(msg => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <Zap className="w-2.5 h-2.5 text-zinc-700 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[9px] text-zinc-700 font-mono mb-0.5">
                        <span>{msg.from_agent}</span>
                        <span>→</span>
                        <span>{msg.to_agent}</span>
                      </div>
                      <p className="text-[10px] text-zinc-600 truncate">
                        {msg.content.replace(/[\n\r]+/g, ' ').slice(0, 60)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ── Run Card ──────────────────────────────────────────────────────────────────

function RunCard({
  run, isSelected, onSelect,
}: {
  run: Run
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const cfg = STATUS[run.status as keyof typeof STATUS] ?? STATUS.pending
  const project  = run.projects as any
  const workflow = run.workflows as any
  const duration = run.started_at && run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null

  return (
    <button
      onClick={() => onSelect(run.id)}
      className={cn(
        'w-full text-left rounded-lg border p-3.5 transition-all',
        isSelected
          ? 'border-indigo-500/40 bg-indigo-500/[0.05]'
          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {workflow?.name ?? 'Körning'}
          </span>
        </div>
        <span className={cn('text-[10px] font-mono shrink-0', cfg.text)}>{cfg.label}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-zinc-600 flex-wrap">
        {project && (
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </span>
        )}
        <span>
          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv })}
        </span>
        {duration != null && <span>{duration}s</span>}
      </div>

      {run.error && (
        <p className="mt-1.5 text-[10px] text-red-400/70 font-mono truncate">
          {run.error.slice(0, 60)}{run.error.length > 60 ? '…' : ''}
        </p>
      )}
    </button>
  )
}

// ── Agent Card ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent, projects, runs,
}: {
  agent: Agent
  projects: Project[]
  runs: Run[]
}) {
  const project  = projects.find(p => p.id === agent.project_id)
  const lastRun  = runs.filter(r => r.project_id === agent.project_id)[0]
  const isActive = lastRun?.status === 'running'

  // Shorten model name for display
  const modelLabel = agent.model
    .replace('claude-', '')
    .replace('gpt-', '')
    .split('-')
    .slice(0, 3)
    .join('-')

  const duration = lastRun?.started_at && lastRun?.finished_at
    ? Math.round((new Date(lastRun.finished_at).getTime() - new Date(lastRun.started_at).getTime()) / 1000)
    : null

  return (
    <Link
      href={project ? `/projects/${project.slug}` : '#'}
      className={cn(
        'block rounded-lg border p-3.5 transition-all hover:border-white/[0.14] hover:bg-white/[0.04]',
        isActive
          ? 'border-blue-500/30 bg-blue-500/[0.04]'
          : 'border-white/[0.07] bg-white/[0.02]',
      )}
    >
      {/* Top row: icon + name + status */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          isActive
            ? 'bg-blue-500/15 border border-blue-500/25'
            : 'bg-white/[0.05] border border-white/[0.07]',
        )}>
          <Bot className={cn('w-4 h-4', isActive ? 'text-blue-400' : 'text-zinc-500')} />
          {isActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400 animate-pulse border border-[#060a10]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-200 truncate">{agent.name}</span>
            <span className={cn(
              'text-[9px] font-mono shrink-0',
              isActive ? 'text-blue-400' : 'text-zinc-700',
            )}>
              {isActive ? 'AKTIV' : 'INAKTIV'}
            </span>
          </div>
          {/* Model badge */}
          <div className="flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5 text-zinc-700 shrink-0" />
            <span className="text-[9px] font-mono text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {modelLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Project row */}
      {project && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
          <span className="text-[10px] text-zinc-600 truncate">{project.name}</span>
        </div>
      )}

      {/* Last run row */}
      {lastRun && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono">
          <span className={cn(
            'w-1 h-1 rounded-full shrink-0',
            STATUS[lastRun.status as keyof typeof STATUS]?.dot ?? 'bg-zinc-700',
          )} />
          {isActive ? (
            <span className="text-blue-400">Kör nu…</span>
          ) : (
            <>
              <span className="text-zinc-700">
                {formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true, locale: sv })}
              </span>
              {duration != null && (
                <span className="text-zinc-800">{duration}s</span>
              )}
            </>
          )}
        </div>
      )}
    </Link>
  )
}
