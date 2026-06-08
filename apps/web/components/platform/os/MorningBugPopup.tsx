'use client'

/**
 * MorningBugPopup — morgonruta på /atlas efter nattens buggscan.
 *
 * Visar nya fynd (24h) + öppna akuta buggar, var och en med en färdig
 * fix-prompt och en "Kopiera"-knapp (klistra in i Claude-chatten). Visas en
 * gång per morgon — dismiss sparas i localStorage per datum.
 *
 * Renderar null om det inte finns något att visa.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Circle, X, Copy, Check, ClipboardCheck } from 'lucide-react'
import type { BugReport, BugscanFinding } from '@/lib/bugs/types'

interface Item {
  key: string
  project: string
  title: string
  level: 'critical' | 'error' | 'warning'
  message: string
  fixPrompt: string | null
}

const SEEN_KEY = 'omnira_bugpopup_seen'
function today(): string { return new Date().toISOString().slice(0, 10) }

function toItems(findings: BugscanFinding[], reports: BugReport[]): Item[] {
  const items: Item[] = []
  for (const r of reports) {
    items.push({
      key: `rep-${r.id}`,
      project: r.project_id ? 'Projekt' : 'Plattform',
      title: r.title,
      level: 'critical',
      message: r.detail ?? '',
      fixPrompt: r.fix_prompt,
    })
  }
  for (const f of findings) {
    items.push({
      key: `fnd-${f.id}`,
      project: f.project_name ?? 'Okänt projekt',
      title: f.check_name,
      level: f.status === 'error' ? 'error' : 'warning',
      message: f.message ?? '',
      fixPrompt: f.fix_prompt,
    })
  }
  // Akut först, sedan error, sedan warning.
  const rank = { critical: 0, error: 1, warning: 2 } as const
  return items.sort((a, b) => rank[a.level] - rank[b.level])
}

function dot(level: Item['level']) {
  if (level === 'warning') return <Circle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
  return <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${level === 'critical' ? 'text-red-400' : 'text-orange-400'}`} />
}

export function MorningBugPopup({
  findings,
  reports,
}: {
  findings: BugscanFinding[]
  reports: BugReport[]
}) {
  const items = toItems(findings ?? [], reports ?? [])
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    try {
      if (localStorage.getItem(SEEN_KEY) !== today()) setOpen(true)
    } catch {
      setOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (items.length === 0 || !open) return null

  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, today()) } catch { /* ignore */ }
    setOpen(false)
  }

  const copy = async (item: Item) => {
    if (!item.fixPrompt) return
    try {
      await navigator.clipboard.writeText(item.fixPrompt)
      setCopied(item.key)
      setTimeout(() => setCopied(c => (c === item.key ? null : c)), 2000)
    } catch { /* ignore */ }
  }

  const critical = items.filter(i => i.level === 'critical').length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg mt-10 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-300" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Morgonkoll — buggscan</h2>
              <p className="text-xs text-zinc-400">
                {items.length} {items.length === 1 ? 'nytt fynd' : 'nya fynd'} senaste 24h
                {critical > 0 ? ` · ${critical} akut` : ''}
              </p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="Stäng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {items.map(item => (
            <div key={item.key} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="flex items-start gap-2.5">
                {dot(item.level)}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-secondary">{item.project}</p>
                  <p className="text-sm font-medium text-foreground/90 break-words">{item.title}</p>
                  {item.message && <p className="text-xs text-zinc-400 mt-0.5 break-words">{item.message}</p>}
                </div>
                {item.fixPrompt && (
                  <button
                    onClick={() => copy(item)}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                  >
                    {copied === item.key
                      ? <><Check className="w-3.5 h-3.5 text-green-400" /> Kopierad</>
                      : <><Copy className="w-3.5 h-3.5" /> Fix-prompt</>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-zinc-800">
          <p className="text-xs text-secondary inline-flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" /> Kopiera en prompt → klistra in i Claude-chatten.
          </p>
          <button onClick={dismiss} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-white">
            Stäng
          </button>
        </div>
      </div>
    </div>
  )
}
