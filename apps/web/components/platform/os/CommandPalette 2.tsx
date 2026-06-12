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

export function CommandPalette({
  open,
  onClose,
  projects = [],
}: {
  open: boolean
  onClose: () => void
  projects?: ProjectLite[]
}) {
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
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(13,16,32,0.98), rgba(8,10,22,0.98))',
          border: '1px solid rgba(99,102,241,0.22)',
        }}
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 h-12 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {busy ? <Loader2 className="w-4 h-4 text-indigo-300 animate-spin shrink-0" /> : <Search className="w-4 h-4 text-secondary shrink-0" />}
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
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-indigo-500/12' : 'hover:bg-white/[0.03]'}`}
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: isIntent ? 'rgba(212,165,116,0.14)' : 'rgba(255,255,255,0.04)' }}>
                    {isIntent
                      ? <Sparkles className="w-3 h-3" style={{ color: '#d4a574' }} />
                      : <ArrowRight className="w-3 h-3 text-indigo-300" />}
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
