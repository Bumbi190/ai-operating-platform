'use client'

/**
 * CommandPalette — the real ⌘K surface. Three things, all sourced from the
 * navigation registry (single source of truth):
 *   1. Jump to page      (searchDestinations → pages)
 *   2. Jump to project   (searchDestinations → projects)
 *   3. Execute Atlas intent (free text → /chat/<new>?send=…, reusing ?send=)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { searchDestinations, type NavResult } from '@/lib/nav/registry'

interface ProjectLite { name: string; slug: string }

/**
 * Which generation's skin to wear. PRESENTATION ONLY — there is one palette,
 * one search, one keyboard model, one navigation path. The variant selects
 * colours and nothing else.
 */
export type CommandPaletteVariant = 'legacy' | 'vnext'

interface PaletteTheme {
  /** Full-screen dim behind the panel. */
  backdrop: string
  /** Panel surface + edge. */
  panel: React.CSSProperties
  /** Hairline under the search field. */
  inputDivider: string
  /** Spinner shown while the Atlas intent is being created. */
  busyIcon: string
  /** Selected row background, and the non-selected hover. */
  rowActive: string
  rowHover: string
  /** Left marker on the selected row. Inset shadow, so it shifts no layout. */
  rowActiveMarker: string
  /** Navigation rows (jump to page/project). */
  navIconTint: string
  navIconColor: string
  /** The "Ask Atlas" intent row, kept visually distinct from navigation. */
  intentIconTint: string
  intentIconColor: string
}

/**
 * Legacy values are the ones this component shipped with, copied verbatim.
 * `?ui=legacy` must look exactly as it did — it is the rollback path until
 * PR #82 lands — so these are duplicated rather than derived, and a test pins
 * each one against the literals.
 *
 * vNext wears the identity already established by the Atlas launcher and the
 * vNext shell: near-black glass, a cyan edge, restrained glow, no indigo. The
 * colours are the global `:root` tokens (`--omnira-cyan` #22d3ee,
 * `--omnira-teal` #2dd4bf, `--omnira-aqua-bright` #ecfeff) written as rgba so
 * they survive inline styles, and deliberately NOT `--os-accent`, which only
 * resolves to cyan under `[data-ui-generation='vnext']` — the palette renders
 * in a portal-like fixed layer that may sit outside that attribute.
 */
const PALETTE_THEME: Record<CommandPaletteVariant, PaletteTheme> = {
  legacy: {
    backdrop: 'bg-black/55 backdrop-blur-sm animate-fade-in',
    panel: {
      background: 'linear-gradient(180deg, rgba(13,16,32,0.98), rgba(8,10,22,0.98))',
      border: '1px solid rgba(99,102,241,0.22)',
    },
    inputDivider: 'rgba(255,255,255,0.06)',
    busyIcon: 'text-indigo-300',
    rowActive: 'bg-indigo-500/12',
    rowHover: 'hover:bg-white/[0.03]',
    rowActiveMarker: 'none',
    navIconTint: 'rgba(255,255,255,0.04)',
    navIconColor: '#a5b4fc',            // text-indigo-300
    intentIconTint: 'rgba(212,165,116,0.14)',
    intentIconColor: '#d4a574',
  },
  vnext: {
    backdrop: 'bg-[#01060e]/70 backdrop-blur-sm animate-fade-in',
    panel: {
      background: 'linear-gradient(180deg, rgba(7,14,26,0.985), rgba(3,8,18,0.985))',
      border: '1px solid rgba(34,211,238,0.20)',
      boxShadow:
        '0 0 0 1px rgba(34,211,238,0.06), 0 28px 64px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.05)',
    },
    inputDivider: 'rgba(34,211,238,0.12)',
    busyIcon: 'text-cyan-300',
    rowActive: 'bg-cyan-400/[0.10]',
    rowHover: 'hover:bg-white/[0.035]',
    // A 2px cyan edge drawn inside the row: reads as a selection marker without
    // adding width, so keyboard movement cannot nudge the layout.
    rowActiveMarker: 'inset 2px 0 0 0 rgba(34,211,238,0.75)',
    navIconTint: 'rgba(34,211,238,0.10)',
    navIconColor: '#67e8f9',            // --omnira-cyan-soft
    intentIconTint: 'rgba(45,212,191,0.14)',
    intentIconColor: '#5eead4',         // --omnira-teal-soft
  },
}

export function CommandPalette({
  open,
  onClose,
  projects = [],
  variant = 'legacy',
}: {
  open: boolean
  onClose: () => void
  projects?: ProjectLite[]
  /** Presentation only. Defaults to legacy so existing mounts are unaffected. */
  variant?: CommandPaletteVariant
}) {
  const theme = PALETTE_THEME[variant]
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchDestinations(query, { projects }), [query, projects])

  // The "Ask Atlas" intent row — always offered when the operator has typed
  // something that doesn't exactly match a destination.
  const intentRow: NavResult | null = query.trim().length > 1
    ? { kind: 'intent', label: `Ask Atlas: “${query.trim()}”`, hint: 'Enter' }
    : null

  const rows: NavResult[] = useMemo(
    () => (intentRow ? [...results, intentRow] : results),
    [results, intentRow],
  )

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setBusy(false)
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  async function choose(row: NavResult) {
    if (!row) return
    if (row.kind === 'intent') {
      setBusy(true)
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const conv = await res.json()
        if (conv?.id) {
          router.push(`/chat/${conv.id}?send=${encodeURIComponent(query.trim())}`)
          onClose()
          return
        }
      } catch { /* fall through */ }
      setBusy(false)
      return
    }
    if (row.href) {
      router.push(row.href)
      onClose()
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); return }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${theme.backdrop}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
        style={theme.panel}
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 h-12 border-b" style={{ borderColor: theme.inputDivider }}>
          {busy ? <Loader2 className={`w-4 h-4 ${theme.busyIcon} animate-spin shrink-0`} /> : <Search className="w-4 h-4 text-secondary shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Jump to a page, a project, or ask Atlas…"
            className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-meta focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[9px] text-meta">
            <span className="kbd">esc</span>
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto scrollbar-thin py-2">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-meta">No matches. Press Enter to ask Atlas.</p>
          ) : (
            rows.map((row, i) => {
              const isActive = i === active
              const isIntent = row.kind === 'intent'
              return (
                <button
                  key={`${row.kind}-${row.label}-${i}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(row)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${isActive ? theme.rowActive : theme.rowHover}`}
                  style={isActive && theme.rowActiveMarker !== 'none'
                    ? { boxShadow: theme.rowActiveMarker }
                    : undefined}
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: isIntent ? theme.intentIconTint : theme.navIconTint }}>
                    {isIntent
                      ? <Sparkles className="w-3 h-3" style={{ color: theme.intentIconColor }} />
                      : <ArrowRight className="w-3 h-3" style={{ color: theme.navIconColor }} />}
                  </span>
                  <span className="flex-1 min-w-0 text-[12.5px] text-zinc-200 truncate">{row.label}</span>
                  {row.hint && (
                    <span className="text-[9px] uppercase tracking-wider text-meta shrink-0">{row.hint}</span>
                  )}
                  {isActive && !row.hint && <CornerDownLeft className="w-3 h-3 text-meta shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
