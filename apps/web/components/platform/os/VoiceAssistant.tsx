'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

// Tystnad innan vi tolkar dig som färdig (ms). Sänkt från 3500 → 1100:
// 3,5 s var den största enskilda fördröjningen i hela röst-pipelinen.
const SILENCE_MS = 1100

export function VoiceAssistant() {
  const [mounted, setMounted]       = useState(false)
  const [phase, setPhase]           = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse]     = useState('')
  const [open, setOpen]             = useState(false)
  const [perf, setPerf]             = useState<string | null>(null)   // latens-readout

  const recRef        = useRef<any>(null)
  const audioRef      = useRef<HTMLAudioElement | null>(null)
  const historyRef    = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const silenceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRef     = useRef(false)
  const convRef       = useRef<string | null>(null)
  const listeningRef  = useRef(false)   // INTENT: vill vi ha mikrofonen öppen?
  const recActiveRef  = useRef(false)   // är en recognition igång just nu?
  const marksRef      = useRef<Record<string, number>>({})
  const ttsMsRef      = useRef(0)

  async function ensureConversation(firstText: string): Promise<string | null> {
    if (convRef.current) return convRef.current
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return null
      const { data } = await sb.from('conversations')
        .insert({ user_id: user.id, title: '🎙 ' + firstText.slice(0, 56) })
        .select('id').single()
      convRef.current = (data as any)?.id ?? null
    } catch { /* osparat samtal är ok */ }
    return convRef.current
  }

  useEffect(() => { setMounted(true) }, [])

  // ⌥ Space-genväg
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (phase === 'idle') { setOpen(true); startListening() }
        else if (phase === 'listening') stopListening()
        else if (phase === 'speaking') stopAudio()
      }
      if (e.key === 'Escape') closeAll()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mounted, phase])

  // ── Mikrofon: robust livscykel ──────────────────────────────────────────────
  // Web Speech (Chrome) avslutar `continuous`-igenkänning av sig själv vid paus.
  // Tidigare återställdes aldrig detta → fasen fastnade på "listening" med död
  // mikrofon. Nu styr listeningRef vår INTENT och onend startar om automatiskt.
  function startListening() {
    if (cancelRef.current) return
    if (recActiveRef.current) return   // redan igång — undvik dubbelstart
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Röstigenkänning kräver Chrome eller Safari.'); return }

    const rec = new SR()
    rec.lang           = 'sv-SE'
    rec.continuous     = true
    rec.interimResults = true
    listeningRef.current = true

    rec.onstart = () => { recActiveRef.current = true; setPhase('listening'); setTranscript('') }

    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('')
      setTranscript(text)
      if (silenceRef.current) clearTimeout(silenceRef.current)
      silenceRef.current = setTimeout(() => {
        const t = text.trim()
        if (t) {
          listeningRef.current = false       // vi avslutar lyssning för att skicka
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
        setPhase('idle')
        alert('Mikrofon-åtkomst nekad. Tillåt mikrofonen i webbläsaren och försök igen.')
      }
      // no-speech / aborted / network: låt onend sköta omstarten.
    }

    rec.onend = () => {
      recActiveRef.current = false
      if (silenceRef.current) clearTimeout(silenceRef.current)
      // Auto-omstart om vi fortfarande VILL lyssna (Chrome stänger av sig själv).
      if (listeningRef.current && !cancelRef.current) {
        setTimeout(() => {
          if (listeningRef.current && !cancelRef.current && !recActiveRef.current) startListening()
        }, 250)
      }
    }

    recRef.current = rec
    try { rec.start() } catch { recActiveRef.current = false /* redan igång */ }
  }

  function stopListening() {
    listeningRef.current = false
    try { recRef.current?.stop() } catch { /* ignore */ }
    if (silenceRef.current) clearTimeout(silenceRef.current)
    setPhase('idle')
  }

  function stopAudio() {
    cancelRef.current = true
    try { audioRef.current?.pause(); audioRef.current = null } catch { /* ignore */ }
    setPhase('idle')
  }

  function closeAll() {
    cancelRef.current = true
    listeningRef.current = false
    stopListening()
    stopAudio()
    setPhase('idle')
    setTranscript('')
    setResponse('')
    setOpen(false)
    if (silenceRef.current) clearTimeout(silenceRef.current)
  }

  async function fetchTTSUrl(sentence: string): Promise<string | null> {
    try {
      const res = await fetch('/api/chat/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sentence, voice: 'nova' }),
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
      audio.onended = () => { try { URL.revokeObjectURL(url) } catch { /* ignore */ } ; audioRef.current = null; resolve() }
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    })
  }

  // Loggar latens per steg + total (mål: < 3 s från att du slutar prata → tal).
  function logLatency(serverTiming?: { contextMs?: number; firstTokenMs?: number; serverTotalMs?: number }) {
    const m = marksRef.current
    const r = (a?: number, b?: number) => (a && b ? Math.round(b - a) : null)
    const toFirstByte  = r(m.sent, m.firstByte)
    const toFirstAudio = r(m.firstByte, m.firstAudio)
    const totalToVoice = r(m.speechEnd, m.firstAudio)
    /* eslint-disable no-console */
    console.groupCollapsed(`🎙 Atlas Voice — svar på ${totalToVoice ?? '?'} ms`)
    console.log('1. STT tystnadströskel (väntan) :', SILENCE_MS, 'ms')
    console.log('2. Skick → första token        :', toFirstByte, 'ms', serverTiming ? `(server: kontext ${serverTiming.contextMs}ms, första token ${serverTiming.firstTokenMs}ms)` : '')
    console.log('3. Första token → första ljud   :', toFirstAudio, 'ms', `(TTS totalt ${ttsMsRef.current}ms)`)
    console.log('➡  TOTAL (slutade prata → tal)  :', totalToVoice, 'ms')
    console.groupEnd()
    /* eslint-enable no-console */
    if (totalToVoice) setPerf(`⚡ ${(totalToVoice / 1000).toFixed(1)}s till svar`)
  }

  /**
   * Strömmande röstsvar: medan LLM:en strömmar text plockar vi ut färdiga
   * meningar och startar TTS per mening direkt — första ljudet börjar långt
   * innan hela svaret är klart. En kö spelar bitarna i ordning. (Nu effektivt
   * eftersom servern äntligen strömmar token-för-token.)
   */
  async function sendMessage(text: string) {
    setPhase('thinking')
    setTranscript(text)
    setResponse('')
    setPerf(null)
    cancelRef.current = false
    ttsMsRef.current = 0
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]

    const urlQueue: Promise<string | null>[] = []
    let reply = ''
    let processedLen = 0
    let streamDone = false
    let playerStarted = false
    let serverTiming: { contextMs?: number; firstTokenMs?: number; serverTotalMs?: number } | undefined

    const player = async () => {
      setPhase('speaking')
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
          if (!marksRef.current.firstAudio) { marksRef.current.firstAudio = performance.now(); logLatency(serverTiming) }
          await playUrl(url)
        }
      }
      if (!cancelRef.current) {
        setPhase('idle')
        // Kontinuerligt samtal — Atlas lyssnar igen direkt efter att ha talat klart.
        setTimeout(() => { if (!cancelRef.current) startListening() }, 350)
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
        body:    JSON.stringify({ messages: historyRef.current, voice: true, conversation_id: convId }),
      })

      if (res.ok && res.body) {
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let   buf     = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelRef.current) { try { reader.cancel() } catch { /* ignore */ } ; break }
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const d = JSON.parse(line.slice(6))
              if (d.event === 'text' && d.text) {
                if (!marksRef.current.firstByte) marksRef.current.firstByte = performance.now()
                reply += d.text; setResponse(reply); flush(false)
              } else if (d.event === 'timing') {
                serverTiming = { contextMs: d.contextMs, firstTokenMs: d.firstTokenMs, serverTotalMs: d.serverTotalMs }
              }
            } catch { /* ignore */ }
          }
        }
      }

      streamDone = true
      flush(true)
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      if (!playerStarted) {
        setPhase('idle')
        setTimeout(() => { if (!cancelRef.current) startListening() }, 350)   // inget tal → lyssna ändå
      }
    } catch {
      streamDone = true
      setPhase('idle')
      setTimeout(() => { if (!cancelRef.current) startListening() }, 350)
    }
  }

  if (!mounted) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">

      {/* Response bubble */}
      {open && response && (
        <div className="pointer-events-auto max-w-sm w-full bg-[#0d1120]/95 border border-indigo-500/20 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl">
          <p className="text-[12px] text-zinc-200 leading-relaxed">{response}</p>
          <div className="flex items-center gap-2 mt-2">
            {phase === 'speaking' && (
              <div className="flex items-center gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-0.5 rounded-full bg-indigo-400 animate-pulse"
                    style={{ height: `${8 + Math.sin(i*1.2)*5}px`, animationDelay: `${i*0.12}s` }} />
                ))}
                <span className="text-[9px] text-indigo-400/60 ml-1 font-mono">NOVA</span>
              </div>
            )}
            {perf && <span className="text-[9px] text-zinc-500 font-mono ml-auto">{perf}</span>}
          </div>
        </div>
      )}

      {/* Main pill */}
      <button
        onClick={() => {
          if (!open) { setOpen(true); startListening() }
          else if (phase === 'listening') stopListening()
          else if (phase === 'speaking') stopAudio()
          else if (phase === 'idle') closeAll()
        }}
        className={cn(
          'pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full border backdrop-blur-xl shadow-xl',
          'text-[11px] font-medium select-none transition-all duration-200',
          !open
            ? 'bg-black/40 border-white/10 text-zinc-600 hover:text-zinc-300 hover:border-white/20 opacity-50 hover:opacity-100 scale-95 hover:scale-100'
            : phase === 'listening'
              ? 'bg-red-500/15 border-red-500/40 text-red-300 scale-105'
              : phase === 'thinking'
                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                : phase === 'speaking'
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-black/50 border-white/10 text-zinc-500',
        )}
      >
        {phase === 'listening' ? (
          <>
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="max-w-[260px] truncate">{transcript || 'Lyssnar… prata på'}</span>
            <MicOff className="w-3.5 h-3.5 shrink-0 opacity-70" />
          </>
        ) : phase === 'thinking' ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Tänker...</span></>
        ) : phase === 'speaking' ? (
          <>
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>Talar...</span>
            <X className="w-3.5 h-3.5 shrink-0 opacity-70" />
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5" />
            <span>Prata med assistenten</span>
            <kbd className="text-[9px] bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded font-mono opacity-50">⌥ Space</kbd>
          </>
        )}
      </button>

      {/* Close when open+idle */}
      {open && phase === 'idle' && !response && (
        <button onClick={closeAll} className="pointer-events-auto text-[9px] text-zinc-700 hover:text-zinc-500 font-mono">
          stäng
        </button>
      )}
    </div>
  )
}
