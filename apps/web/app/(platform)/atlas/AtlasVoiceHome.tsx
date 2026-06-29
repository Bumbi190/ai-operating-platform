'use client'

/**
 * AtlasVoiceHome — ren vy för Atlas-startsidan.
 *
 * All konversations- och röst-state ägs av AtlasRuntimeProvider (lib/atlas/runtime.tsx).
 * Den här komponenten läser state via useAtlas() och delegerar alla handlingar dit.
 *
 * P1A: Noll lokal state. Inga useRef för voice-lifecycle. Ingen SSR-guard behövs
 * här — runtimen hanterar det internt.
 */

import { useCallback } from 'react'
import { Mic, ArrowRight, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAtlas } from '@/lib/atlas/runtime'
import { AtlasOrb } from '@/components/platform/os/AtlasOrb'

const QUICK_PROMPTS = [
  'Vad behöver min uppmärksamhet?',
  'Hur går det för Familje-Stunden?',
  'Vad bör jag fokusera på nu?',
  'Finns det väntande godkännanden?',
]

interface Props {
  operatorName: string
}

export function AtlasVoiceHome({ operatorName }: Props) {
  const atlas = useAtlas()

  // ── Orb-klick: mappa UI-intention till runtime-åtgärder ──────────────────
  function handleOrbClick() {
    if (!atlas.isSessionActive) {
      atlas.activate()
      return
    }
    if (atlas.voicePhase === 'speaking')  { atlas.stopAudio(); return }
    if (atlas.voicePhase === 'listening') { atlas.deactivate(); return }
    if (atlas.voicePhase === 'idle') {
      // Återaktivera lyssnande inom öppen session
      atlas.activate()
    }
  }

  // ── Snabbfrågor ───────────────────────────────────────────────────────────
  const handleQuickPrompt = useCallback((text: string) => {
    if (!atlas.isSessionActive) {
      // Starta session tyst — ingen mikrofon, bara textmeddelande
      atlas.activate()
    }
    atlas.sendMessage(text)
  }, [atlas])

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-12 select-none">

      {/* ── Hälsning ───────────────────────────────────────────────────── */}
      <div className="text-center mb-12 animate-fade-in-up">
        <p className="text-xs uppercase tracking-[0.18em] text-indigo-400/60 font-mono mb-2">
          Atlas · Executive Chief of Staff
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {greeting()} {operatorName}.
        </h1>
      </div>

      {/* ── Orb ────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-8">
        <AtlasOrb
          phase={atlas.voicePhase}
          onClick={handleOrbClick}
          size={148}
          className="animate-fade-in"
        />

        {/* Status-text under orben */}
        <div className="h-8 flex items-center justify-center">
          {atlas.voicePhase === 'idle' && !atlas.isSessionActive && (
            <button
              onClick={handleOrbClick}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Tryck för att prata</span>
              <kbd className="ml-1 text-[10px] bg-white/[0.05] border border-white/10 px-1.5 py-0.5 rounded font-mono opacity-60">
                ⌥ Space
              </kbd>
            </button>
          )}
          {atlas.voicePhase === 'idle' && atlas.isSessionActive && (
            <p className="text-sm text-zinc-500 animate-fade-in">
              Lyssnar om ett ögonblick…
            </p>
          )}
          {atlas.voicePhase === 'listening' && (
            <p className="text-sm text-zinc-300 animate-fade-in truncate max-w-xs text-center">
              {atlas.transcript || 'Lyssnar…'}
            </p>
          )}
          {atlas.voicePhase === 'thinking' && (
            <p className="text-sm text-indigo-400/80 animate-fade-in font-mono">
              tänker…
            </p>
          )}
          {atlas.voicePhase === 'speaking' && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-indigo-300/80 animate-fade-in">
                {atlas.perf && (
                  <span className="text-[10px] font-mono text-zinc-600 mr-2">
                    {atlas.perf}
                  </span>
                )}
                Tryck för att avbryta
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Svarsbubbla ────────────────────────────────────────────────── */}
      {atlas.response && (
        <div className={cn(
          'mt-8 max-w-md w-full animate-fade-in-up',
          'rounded-2xl border border-indigo-500/15 bg-[#0a0d1f]/80 backdrop-blur-xl px-5 py-4',
        )}>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{atlas.response}</p>
          </div>

          {/* Öppna fullständig chatt */}
          {atlas.voicePhase === 'idle' && atlas.conversationId && (
            <button
              onClick={() => atlas.openWorkspace(`/chat/${atlas.conversationId}`)}
              className="mt-3 ml-8 flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-indigo-400 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Öppna i chatt</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Snabbfrågor ────────────────────────────────────────────────── */}
      {atlas.voicePhase === 'idle' && !atlas.response && (
        <div className="mt-10 grid grid-cols-2 gap-2 max-w-sm w-full animate-fade-in">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => handleQuickPrompt(p)}
              className={cn(
                'text-left px-3.5 py-2.5 rounded-xl text-[12px] text-zinc-400',
                'border border-white/[0.06] bg-white/[0.03]',
                'hover:border-indigo-500/25 hover:bg-indigo-500/[0.06] hover:text-zinc-200',
                'transition-all duration-200',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Avsluta-knapp ──────────────────────────────────────────────── */}
      {atlas.isSessionActive && atlas.voicePhase === 'idle' && (
        <button
          onClick={() => atlas.deactivate()}
          className="mt-6 text-[11px] text-zinc-700 hover:text-zinc-500 transition-colors font-mono animate-fade-in"
        >
          avsluta session
        </button>
      )}
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 10) return 'God morgon,'
  if (h < 18) return 'God eftermiddag,'
  return 'God kväll,'
}
