'use client'

/**
 * VoiceAssistant — global röstgränssnitt för Manager Agent.
 *
 * Aktiveras med Option+Space (⌥ Space) var som helst på plattformen,
 * eller via den flytande mikrofon-pillret nere i mitten.
 *
 * Flöde:
 *   1. ⌥ Space → mikrofon aktiveras (Web Speech API)
 *   2. Talar → transkriberas live i pillret
 *   3. Skickar till /api/chat (Manager Agent)
 *   4. Svaret läses upp med Victorias röst via /api/chat/tts
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

export function VoiceAssistant() {
  const [phase, setPhase]         = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse]   = useState('')
  const [visible, setVisible]     = useState(false)

  const recognitionRef  = useRef<any>(null)
  const audioRef        = useRef<HTMLAudioElement | null>(null)
  const historyRef      = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const silenceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Keyboard shortcut: Option+Space (⌥ Space) ────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Option+Space on Mac, Alt+Space on Windows/Linux
      if (e.code === 'Space' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (phase === 'idle') {
          setVisible(true)
          startListening()
        } else if (phase === 'listening') {
          stopListening()
        } else if (phase === 'speaking') {
          stopSpeakingBrowser()
        }
      }
      // Escape closes
      if (e.key === 'Escape') {
        stopAll()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase])

  // ── Speech recognition ───────────────────────────────────────────────────
  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Röstigenkänning kräver Chrome eller Safari.')
      return
    }
    const rec = new SR()
    rec.lang            = 'sv-SE'
    rec.continuous      = false
    rec.interimResults  = true

    rec.onstart  = () => { setPhase('listening'); setTranscript(''); setResponse('') }

    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('')
      setTranscript(text)

      // Återställ tystnadstimer vid varje nytt tal
      if (silenceTimer.current) clearTimeout(silenceTimer.current)

      if (e.results[e.results.length - 1].isFinal) {
        // Direkt avslut vid final result
        rec.stop()
        if (text.trim()) sendToAgent(text.trim())
      } else {
        // Auto-skicka efter 2s tystnad om vi har interim text
        silenceTimer.current = setTimeout(() => {
          rec.stop()
          if (text.trim()) sendToAgent(text.trim())
        }, 2000)
      }
    }

    rec.onerror = () => { if (silenceTimer.current) clearTimeout(silenceTimer.current); stopAll() }
    rec.onend   = () => { if (silenceTimer.current) clearTimeout(silenceTimer.current) }

    recognitionRef.current = rec
    rec.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  function stopSpeakingBrowser() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPhase('idle')
  }

  function stopAll() {
    stopListening()
    stopSpeakingBrowser()
    setPhase('idle')
    setTranscript('')
    setResponse('')
    setVisible(false)
  }

  // ── Send to Manager Agent ────────────────────────────────────────────────
  const sendToAgent = useCallback(async (text: string) => {
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
      if (!res.ok || !res.body) throw new Error()

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
            if (d.event === 'text' && d.text) {
              reply += d.text
              setResponse(reply)
            }
          } catch { /* ignore */ }
        }
      }

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]

      // Speak with Victoria
      if (reply) await speakReply(reply)
      else setPhase('idle')

    } catch {
      setPhase('idle')
    }
  }, [])

  // ── Svensk TTS via webbläsarens inbyggda röst (instant, ingen latens) ────
  function speakReply(text: string) {
    setPhase('speaking')

    window.speechSynthesis.cancel() // avbryt eventuell pågående uppläsning

    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'sv-SE'
    utt.rate = 1.05
    utt.pitch = 1.0

    // Välj bästa tillgängliga svenska röst
    const voices = window.speechSynthesis.getVoices()
    const preferred = ['Alva', 'Klara', 'Ellen', 'Astrid']
    const svVoice = preferred
      .map(name => voices.find(v => v.name.includes(name) && v.lang.startsWith('sv')))
      .find(Boolean)
      ?? voices.find(v => v.lang.startsWith('sv'))

    if (svVoice) utt.voice = svVoice

    utt.onend = () => {
      setPhase('idle')
      setTimeout(() => setVisible(false), 1500)
    }
    utt.onerror = () => setPhase('idle')

    window.speechSynthesis.speak(utt)
  }

  function stopSpeakingBrowser() {
    window.speechSynthesis.cancel()
    setPhase('idle')
  }

  // ── Don't render during SSR ───────────────────────────────────────────────
  if (typeof window === 'undefined') return null

  return (
    <>
      {/* ── Floating trigger pill ──────────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">

        {/* Response bubble — appears above pill */}
        {(response || (phase === 'thinking' && transcript)) && (
          <div className="pointer-events-auto max-w-sm bg-[#0d1120]/95 border border-indigo-500/20 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
            {phase === 'thinking' && !response && (
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                Tänker...
              </div>
            )}
            {response && (
              <p className="text-[12px] text-zinc-200 leading-relaxed">{response}</p>
            )}
            {phase === 'speaking' && (
              <div className="flex items-center gap-1.5 mt-2">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-0.5 bg-indigo-400 rounded-full animate-pulse"
                    style={{
                      height: `${8 + Math.sin(i * 1.2) * 6}px`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
                <span className="text-[9px] text-indigo-400/70 ml-1 font-mono">VICTORIA</span>
              </div>
            )}
          </div>
        )}

        {/* Main pill */}
        <button
          onClick={() => {
            if (!visible) { setVisible(true); startListening() }
            else if (phase === 'listening') stopListening()
            else if (phase === 'speaking') stopSpeakingBrowser()
            else if (phase === 'idle') { visible ? stopAll() : startListening() }
          }}
          className={cn(
            'pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full',
            'border backdrop-blur-xl shadow-2xl transition-all duration-300',
            'text-[11px] font-medium select-none',
            phase === 'idle' && !visible
              ? 'bg-black/40 border-white/10 text-zinc-600 hover:text-zinc-300 hover:border-white/20 hover:bg-black/60 scale-90 opacity-60 hover:opacity-100 hover:scale-100'
              : phase === 'listening'
                ? 'bg-red-500/15 border-red-500/40 text-red-300 scale-105'
                : phase === 'thinking'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                  : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300',
          )}
        >
          {phase === 'listening' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span>{transcript || 'Lyssnar...'}</span>
              <MicOff className="w-3.5 h-3.5 opacity-70" />
            </>
          ) : phase === 'thinking' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Tänker...</span>
            </>
          ) : phase === 'speaking' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="font-mono text-[10px]">VICTORIA</span>
              <X className="w-3.5 h-3.5 opacity-70" onClick={stopSpeaking} />
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>Prata med Victoria</span>
              <kbd className="text-[9px] bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded font-mono opacity-60">⌥ Space</kbd>
            </>
          )}
        </button>
      </div>
    </>
  )
}
