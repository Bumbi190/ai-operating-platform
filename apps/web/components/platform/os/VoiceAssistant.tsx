'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

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
      rec.continuous     = false
      rec.interimResults = true

      rec.onstart  = () => { setPhase('listening'); setTranscript(''); setResponse('') }

      rec.onresult = (e: any) => {
        const text = Array.from(e.results as any[])
          .map((r: any) => r[0].transcript).join('')
        setTranscript(text)

        if (silenceRef.current) clearTimeout(silenceRef.current)

        if (e.results[e.results.length - 1].isFinal) {
          if (text.trim()) sendMessage(text.trim())
        } else {
          silenceRef.current = setTimeout(() => {
            rec.stop()
            if (text.trim()) sendMessage(text.trim())
          }, 2000)
        }
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
    try {
      audioRef.current?.pause()
      audioRef.current = null
    } catch { /* ignore */ }
    setPhase('idle')
  }

  function closeAll() {
    stopListening()
    stopAudio()
    setPhase('idle')
    setTranscript('')
    setResponse('')
    setOpen(false)
    if (silenceRef.current) clearTimeout(silenceRef.current)
  }

  async function sendMessage(text: string) {
    setPhase('thinking')
    setTranscript(text)
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]

    let reply = ''
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyRef.current }),
      })

      if (res.ok && res.body) {
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let   buf     = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const d = JSON.parse(line.slice(6))
              if (d.event === 'text' && d.text) { reply += d.text; setResponse(reply) }
            } catch { /* ignore */ }
          }
        }
      }

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      if (reply) await playTTS(reply)
      else setPhase('idle')

    } catch {
      setPhase('idle')
    }
  }

  async function playTTS(text: string) {
    setPhase('speaking')
    try {
      const res = await fetch('/api/chat/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, voice: 'nova' }),
      })

      if (!res.ok) { setPhase('idle'); return }

      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        audioRef.current = null
        setPhase('idle')
        setTimeout(() => setOpen(false), 2000)
      }
      audio.onerror = () => { setPhase('idle') }

      // play() returns a Promise — must catch rejection (autoplay policy)
      audio.play().catch(() => setPhase('idle'))

    } catch {
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
            <span className="max-w-[200px] truncate">{transcript || 'Lyssnar...'}</span>
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
            <span>Prata med Victoria</span>
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
