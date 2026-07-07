'use client'

/**
 * AtlasOrb — den visuella hjärtat i Atlas-upplevelsen.
 *
 * Fyra faser med distinkta animationer:
 *   idle      → långsam andhämtning, indigo-glöd
 *   listening → röda pulserande ringar, mic-indikator
 *   thinking  → roterande violett arc + orb-puls
 *   speaking  → blå ringar + vågformslinjer
 */

import { cn } from '@/lib/utils'

export type OrbPhase = 'idle' | 'listening' | 'thinking' | 'speaking'

interface AtlasOrbProps {
  phase: OrbPhase
  onClick?: () => void
  size?: number   // diameter px, default 140
  className?: string
}

const PHASE_COLORS: Record<OrbPhase, { ring: string; inner: string; border: string }> = {
  idle:      { ring: 'rgba(99,102,241,', inner: 'rgba(79,70,229,',  border: 'rgba(99,102,241,0.25)' },
  listening: { ring: 'rgba(239,68,68,',  inner: 'rgba(220,38,38,',  border: 'rgba(239,68,68,0.40)'  },
  thinking:  { ring: 'rgba(139,92,246,', inner: 'rgba(124,58,237,', border: 'rgba(139,92,246,0.35)' },
  speaking:  { ring: 'rgba(99,102,241,', inner: 'rgba(79,70,229,',  border: 'rgba(99,102,241,0.45)' },
}

export function AtlasOrb({ phase, onClick, size = 140, className }: AtlasOrbProps) {
  const r = size / 2

  const orbAnimation: Record<OrbPhase, string> = {
    idle:      'atlasOrbIdle 4s ease-in-out infinite',
    listening: 'atlasOrbListening 1.4s ease-in-out infinite',
    thinking:  'atlasOrbThinking 2s ease-in-out infinite',
    speaking:  'atlasOrbSpeaking 0.9s ease-in-out infinite',
  }

  const ringDuration: Record<OrbPhase, string> = {
    idle:      '3.2s',
    listening: '1.4s',
    thinking:  '2.2s',
    speaking:  '0.85s',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center select-none outline-none',
        'transition-transform duration-300',
        onClick ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.97]' : 'cursor-default',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={`Atlas — ${phaseLabel(phase)}`}
    >
      {/* ── Yttre ripple-ringar ─────────────────────────────────────── */}
      {phase !== 'idle' && (
        <>
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `1.5px solid ${PHASE_COLORS[phase].ring}0.50)`,
              animation: `atlasRing ${ringDuration[phase]} ease-out infinite`,
            }}
          />
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `1px solid ${PHASE_COLORS[phase].ring}0.30)`,
              animation: `atlasRingSlow ${ringDuration[phase]} ease-out infinite`,
              animationDelay: `calc(${ringDuration[phase]} * 0.45)`,
            }}
          />
          {phase === 'speaking' && (
            <span
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                border: `1px solid ${PHASE_COLORS[phase].ring}0.20)`,
                animation: `atlasRingSlow ${ringDuration[phase]} ease-out infinite`,
                animationDelay: `calc(${ringDuration[phase]} * 0.75)`,
              }}
            />
          )}
        </>
      )}

      {/* ── Orb-kärna ──────────────────────────────────────────────── */}
      <div
        className="relative rounded-full overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          border: `1px solid ${PHASE_COLORS[phase].border}`,
          background: `radial-gradient(circle at 38% 36%, ${PHASE_COLORS[phase].inner}0.22) 0%, ${PHASE_COLORS[phase].inner}0.06) 55%, transparent 100%)`,
          animation: orbAnimation[phase],
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Inre ljusgradient */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${PHASE_COLORS[phase].inner}0.35) 0%, transparent 65%)`,
          }}
        />

        {/* ── Tänkande arc (rotating ring) ─────────────────────────── */}
        {phase === 'thinking' && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 70%, rgba(139,92,246,0.7) 85%, rgba(167,139,250,0.9) 95%, transparent 100%)`,
              animation: 'atlasThinkingArc 1.2s linear infinite',
              borderRadius: '50%',
            }}
          />
        )}

        {/* ── Talande vågformslinjer ──────────────────────────────── */}
        {phase === 'speaking' && (
          <div className="relative z-10 flex items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 3,
                  height: i === 2 ? 28 : i % 2 === 0 ? 18 : 22,
                  background: i === 2
                    ? 'rgba(165,180,252,0.95)'
                    : 'rgba(129,140,248,0.75)',
                  animation: `${i % 2 === 0 ? 'atlasBarPulse' : 'atlasBarPulse2'} ${0.7 + i * 0.08}s ease-in-out infinite`,
                  animationDelay: `${i * 0.10}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* ── Lyssnande mic-punkt ─────────────────────────────────── */}
        {phase === 'listening' && (
          <div className="relative z-10 flex flex-col items-center gap-1.5">
            <div
              className="rounded-full"
              style={{
                width: 12,
                height: 12,
                background: 'rgba(248,113,113,0.95)',
                boxShadow: '0 0 14px rgba(239,68,68,0.70)',
                animation: 'atlasOrbListening 0.9s ease-in-out infinite',
              }}
            />
          </div>
        )}

        {/* ── Idle: subtil gnista ─────────────────────────────────── */}
        {phase === 'idle' && (
          <div
            className="relative z-10 rounded-full"
            style={{
              width: 14,
              height: 14,
              background: 'radial-gradient(circle, rgba(165,180,252,0.70) 0%, rgba(99,102,241,0.25) 100%)',
              boxShadow: '0 0 18px rgba(99,102,241,0.50)',
            }}
          />
        )}
      </div>
    </button>
  )
}

function phaseLabel(phase: OrbPhase): string {
  switch (phase) {
    case 'idle':      return 'Tryck för att prata'
    case 'listening': return 'Lyssnar…'
    case 'thinking':  return 'Tänker…'
    case 'speaking':  return 'Talar…'
  }
}
