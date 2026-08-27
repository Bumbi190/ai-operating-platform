'use client'

/**
 * AtlasMiniOrb — Atlas som permanent närvaro i Omnira OS.
 *
 * Visas på alla sidor utom /atlas (där fullorben är synlig).
 * All state kommer från useAtlas() — inga egna voice-refs eller logik.
 *
 * Interaktioner:
 *   Ej aktiv + klick        → activate() + öppna panel
 *   Speaking + klick        → stopAudio() (barge-in)
 *   Listening + klick       → deactivate()
 *   Idle / thinking + klick → toggla panel
 *   Maximize-ikon           → openWorkspace('/atlas')
 *   X                       → stäng panel (sessionen fortsätter)
 */

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { X, Maximize2, MessageSquare, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAtlas } from '@/lib/atlas/runtime'
import type { OrbPhase } from './AtlasOrb'
import { AtlasLauncherOrb } from './AtlasLauncherOrb'

// Orbens diameter som mini-version (vs 148px på Atlas-sidan)
const MINI_SIZE = 52

// ── Nedre högra hörnet delas med aktivitets-peeken ──────────────────────────
//
// Den här krocken har setts förut. En tidigare slice mätte upp exakt samma
// ~52x40 px överlapp mot aktivitets-peeken och löste den genom att göra orben
// desktop-only — under antagandet att peeken ägde hörnet UNDER lg. Antagandet
// höll inte: peeken är "universell aktivitets-peek (alla skärmstorlekar)" och
// gömmer sig på desktop enbart på /atlas?ui=vnext. Eftersom launchern aldrig
// renderas på /atlas är det villkoret aldrig sant där launchern syns, så
// krocken flyttade bara upp till desktop i stället för att försvinna.
//
// Lösningen är en vertikal stapel: peeken ligger kvar längst ned, launchern
// vilar ovanför den. Offseten är HÄRLEDD ur peekens egen geometri i stället för
// gissad, så den följer med om den knappen ändrar storlek.
const ACTIVITY_PEEK_BOTTOM = 20   // MobileRailToggle: bottom-5
const ACTIVITY_PEEK_HEIGHT = 44   // MobileRailToggle: h-11
const STACK_GAP = 12              // andrum mellan peek och launcher
const LAUNCHER_BOTTOM = ACTIVITY_PEEK_BOTTOM + ACTIVITY_PEEK_HEIGHT + STACK_GAP  // 76
// Höger-kanten delas med peeken (right-5) så stapeln får en rak kant.
const STACK_RIGHT = ACTIVITY_PEEK_BOTTOM
// Panelen vilar 10 px ovanför launchern, som tidigare.
const PANEL_GAP = 10
const PANEL_BOTTOM = LAUNCHER_BOTTOM + MINI_SIZE + PANEL_GAP

/** Fasbeskrivning för hjälpmedel — samma ordval som orbens tidigare etikett. */
function phaseDescription(phase: OrbPhase): string {
  switch (phase) {
    case 'idle':      return 'Tryck för att prata'
    case 'listening': return 'Lyssnar…'
    case 'thinking':  return 'Tänker…'
    case 'speaking':  return 'Talar…'
  }
}

export function AtlasMiniOrb() {
  const pathname = usePathname()
  const atlas    = useAtlas()

  // Lokal UI-state: panel öppen/stängd. Konversationsstate ägs av runtime.
  const [panelOpen, setPanelOpen] = useState(false)

  // Dold på /atlas — fullorben i AtlasVoiceHome är aktiv där
  if (pathname === '/atlas') return null

  // ── Orb-klick: mappa UI-intention till runtime-åtgärder ──────────────────
  function handleOrbClick() {
    if (!atlas.isSessionActive) {
      atlas.activate()
      setPanelOpen(true)
      return
    }
    if (atlas.voicePhase === 'speaking') {
      atlas.stopAudio()   // barge-in: avbryt tal, lyssna direkt
      return
    }
    if (atlas.voicePhase === 'listening') {
      atlas.deactivate()
      return
    }
    // idle eller thinking: toggla panelen
    setPanelOpen(p => !p)
  }

  // ── Statusfärg (levande indikator i panel-header) ──────────────────────
  const statusDot = cn(
    'w-1.5 h-1.5 rounded-full transition-colors duration-500',
    atlas.voicePhase === 'idle'      && 'bg-indigo-500/60',
    atlas.voicePhase === 'listening' && 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]',
    atlas.voicePhase === 'thinking'  && 'bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]',
    atlas.voicePhase === 'speaking'  && 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]',
  )

  return (
    <>
      {/* ── Kompakt konversationspanel ─────────────────────────────────── */}
      {panelOpen && (
        <div
          className={cn(
            // Desktop only, matching the launcher that opens it. The corner is
            // shared with the activity peek — see the stack constants above;
            // the panel rides above the launcher rather than beside the peek.
            'hidden lg:block',
            'fixed z-50 w-72',
            'rounded-2xl overflow-hidden',
            'border border-white/[0.08]',
            'bg-[#070b1a]/96 backdrop-blur-xl',
            'shadow-[0_0_0_1px_rgba(99,102,241,0.08),0_24px_48px_rgba(0,0,0,0.65)]',
            'animate-fade-in-up',
          )}
          style={{ bottom: `${PANEL_BOTTOM}px`, right: `${STACK_RIGHT}px` }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className={statusDot} />
              <span className="text-xs font-medium text-zinc-300 tracking-wide">
                Atlas
              </span>
              {atlas.voicePhase !== 'idle' && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  ·{' '}
                  {atlas.voicePhase === 'listening' && 'lyssnar'}
                  {atlas.voicePhase === 'thinking'  && 'tänker'}
                  {atlas.voicePhase === 'speaking'  && 'talar'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => { atlas.openWorkspace('/atlas'); setPanelOpen(false) }}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all"
                title="Öppna Atlas"
                aria-label="Öppna Atlas"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all"
                aria-label="Stäng"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ── Innehåll ────────────────────────────────────────────────── */}
          <div className="px-4 py-3.5 min-h-[72px]">

            {/* Lyssnande: löpande transkript */}
            {atlas.voicePhase === 'listening' && (
              <p className="text-xs text-zinc-300 leading-relaxed animate-fade-in">
                {atlas.transcript || 'Lyssnar…'}
              </p>
            )}

            {/* Tänkande */}
            {atlas.voicePhase === 'thinking' && (
              <p className="text-[11px] text-violet-400/80 font-mono animate-fade-in">
                tänker…
              </p>
            )}

            {/* Senaste svar — visas under speaking och därefter */}
            {(atlas.voicePhase === 'speaking' ||
              (atlas.voicePhase === 'idle' && !!atlas.response)) && (
              <div className="animate-fade-in">
                {atlas.perf && (
                  <span className="block mb-1 text-[9px] font-mono text-zinc-600">
                    {atlas.perf}
                  </span>
                )}
                <p className="text-xs text-zinc-200 leading-relaxed line-clamp-5">
                  {atlas.response}
                </p>
              </div>
            )}

            {/* Idle, session aktiv men inget svar ännu */}
            {atlas.voicePhase === 'idle' && !atlas.response && atlas.isSessionActive && (
              <p className="text-[11px] text-zinc-600">Lyssnar om ett ögonblick…</p>
            )}

            {/* Session inte startad */}
            {!atlas.isSessionActive && (
              <p className="text-[11px] text-zinc-600">
                Tryck på orben för att prata med Atlas.
              </p>
            )}
          </div>

          {/* ── Footer: öppna i chatt ────────────────────────────────────── */}
          {atlas.conversationId && (
            <div className="px-4 py-2.5 border-t border-white/[0.04]">
              <button
                onClick={() => {
                  atlas.openWorkspace(`/chat/${atlas.conversationId}`)
                  setPanelOpen(false)
                }}
                className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-indigo-400 transition-colors"
              >
                <MessageSquare className="w-2.5 h-2.5" />
                <span>Öppna i chatt</span>
                <ArrowRight className="w-2 h-2" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Mini-orb: fast position bottom-right ──────────────────────────── */}
      <div
        className="hidden lg:block fixed z-50"
        style={{ bottom: `${LAUNCHER_BOTTOM}px`, right: `${STACK_RIGHT}px` }}
      >

        {/* Aktiv-prick: syns när session pågår men panel är stängd */}
        {atlas.isSessionActive && !panelOpen && atlas.voicePhase === 'idle' && (
          <div
            className="absolute -top-0.5 -right-0.5 z-10 w-2 h-2 rounded-full
                       bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
            aria-hidden
          />
        )}

        {/* Presentation only. The handler, the phase and the 52px footprint are
            exactly what AtlasOrb received here before — the launcher swapped
            material, not behaviour. AtlasOrb itself is untouched because the
            legacy Atlas home still renders it. */}
        <AtlasLauncherOrb
          phase={atlas.voicePhase}
          onClick={handleOrbClick}
          size={MINI_SIZE}
          label="Öppna Atlas"
          stateDescription={`Atlas — ${phaseDescription(atlas.voicePhase)}`}
        />
      </div>
    </>
  )
}
