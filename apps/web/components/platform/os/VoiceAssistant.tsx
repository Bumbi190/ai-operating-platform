'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

// Hur länge tystnad innan vi tolkar dig som färdig (ms). Höjt från 2s → 3.5s
// så assistenten inte avbryter mitt i en mening. Kan höjas vid behov.
const SILENCE_MS = 3500

export function VoiceAssistant() {
  const [mounted, setMounted]         = useState(false)
  const [phase, setPhase]             = useState<Phase>('idle')
  const [transcript, setTranscript]   = useState('')
  const [response, setResponse]       = useState('')
  const [open, setOpen]               = useState(false)

  const recRef      = useRef<any>(null)
  const audioRef    = useRef<HTMLAudioElement | null>(null)
  const historyRef  = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const silenceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRef   = useRef(false)

  // Avoid SSR mismatch
  useEffect(() => { setMounted(true) }, [])

  // ⌥ Space shortcut
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

  function startListening() {
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) { alert('Röstigenkänning kräver Chrome eller Safari.'); return }

      const rec = new SR()
      rec.lang           = 'sv-SE'
      rec.continuous     = true   // håll mikrofonen öppen genom korta pauser
      rec.interimResults = true   // live-transkription

      rec.onstart  = () => { setPhase('listening'); setTranscript(''); setResponse('') }

      // Skicka FÖRST efter en tydlig tystnad — aldrig mitt i en mening.
      rec.onresult = (e: any) => {
        const text = Array.from(e.results as any[])
          .map((r: any) => r[0].transcript).join('')
        setTranscript(text)

        // Varje nytt ljud nollställer tystnadstimern → vi väntar tills du är klar.
        if (silenceRef.current) clearTimeout(silenceRef.current)
        silenceRef.current = setTimeout(() => {
          try { rec.stop() } catch { /* ignore */ }
          if (text.trim()) sendMessage(text.trim())
        }, SILENCE_MS)
      }

      rec.onerror = () => { setPhase('idle'); if (silenceRef.current) clearTimeout(silenceRef.current) }
      rec.onend   = () => { if (silenceRef.current) clearTimeout(silenceRef.current) }

      recRef.current = rec
      rec.start()
    } catch {
      setPhase('idle')
    }
  }

  function stopListening() {
    try { recRef.current?.stop() } catch { /* ignore */ }
  }

  function stopAudio() {
    cancelRef.current = true
    try {
      audioRef.current?.pause()
      audioRef.current = null
    } catch { /* ignore */ }
    setPhase('idle')
  }

  function closeAll() {
    cancelRef.current = true
    stopListening()
    stopAudio()
    setPhase('idle')
    setTranscript('')
    setResponse('')
    setOpen(false)
    if (silenceRef.current) clearTimeout(silenceRef.current)
  }

  // Hämtar TTS för EN mening och returnerar en uppspelbar objectURL.
  async function fetchTTSUrl(sentence: string): Promise<string | null> {
    try {
      const res = await fetch('/api/chat/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sentence, voice: 'nova' }),
      })
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { try { URL.revokeObjectURL(url) } catch { /* ignore */ } ; audioRef.current = null; resolve() }
      audio.onerror = () => { resolve() }
      audio.play().catch(() => resolve())
    })
  }

  /**
   * Strömmande röstsvar (Phase 6 + 7):
   * Medan LLM:en strömmar text plockar vi ut färdiga meningar och startar TTS
   * per mening direkt — första ljudet börjar spela långt innan hela svaret är
   * klart. En kö spelar bitarna i ordning.
   */
  async function sendMessage(text: string) {
    setPhase('thinking')
    setTranscript(text)
    setResponse('')
    cancelRef.current = false
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]

    const urlQueue: Promise<string | null>[] = []
    let reply = ''
    let processedLen = 0
    let streamDone = false
    let playerStarted = false

    // Spelar upp köade ljudbitar i ordning, väntar på nya tills strömmen är klar.
    const player = async () => {
      setPhase('speaking')
      let idx = 0
      while (!cancelRef.current) {
        if (idx >= urlQueue.length) {
          if (streamDone) break
          await new Promise(r => setTimeout(r, 60))
          continue
        }
        const url = await urlQueue[idx]; idx++
        if (cancelRef.current) break
        if (url) await playUrl(url)
      }
      if (!cancelRef.current) {
        setPhase('idle')
        setTimeout(() => { if (!cancelRef.current) setOpen(false) }, 2200)
      }
    }

    const enqueue = (sentence: string) => {
      const s = sentence.trim()
      if (!s) return
      urlQueue.push(fetchTTSUrl(s))
      if (!playerStarted) { playerStarted = true; player() }
    }

    // Plocka färdiga meningar ur den ackumulerade texten (punkt+mellanslag = klar).
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

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyRef.current, voice: true }),
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
              if (d.event === 'text' && d.text) { reply += d.text; setResponse(reply); flush(false) }
            } catch { /* ignore */ }
          }
        }
      }

      streamDone = true
      flush(true)
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      if (!playerStarted) setPhase('idle')   // inget tal genererades

    } catch {
      streamDone = true
      setPhase('idle')
    }
  }

  if (!mounted) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">

      {/* Response bubble */}
      {open && response && (
        <div className="pointer-events-auto max-w-sm w-full bg-[#0d1120]/95 border border-indigo-500/20 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl">
          <p className="text-[12px] text-zinc-200 leading-relaxed">{response}</p>
          {phase === 'speaking' && (
            <div className="flex items-center gap-1 mt-2">
              {[0,1,2,3].map(i => (
                <div key={i} className="w-0.5 rounded-full bg-indigo-400 animate-pulse"
                  style={{ height: `${8 + Math.sin(i*1.2)*5}px`, animationDelay: `${i*0.12}s` }} />
              ))}
              <span className="text-[9px] text-indigo-400/60 ml-1 font-mono">NOVA</span>
            </div>
          )}
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
            <span className="max-w-[260px] truncate">{transcript || 'Lyssnar… prata på, jag väntar tills du är klar'}</span>
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
