'use client'

/**
 * NightlyFindings — nattens systemfynd som briefing-sektion på /atlas.
 *
 * P0: ersätter MorningBugPopup. Samma data (buggscan-fynd 24h + öppna akuta
 * buggar) och samma "Kopiera fix-prompt"-funktion, men som lugn sektion i
 * briefingen i stället för en modal som avbryter inloggningen.
 *
 * Renderar null om det inte finns något att visa.
 */

import { useState } from 'react'
import { AlertTriangle, Circle, Copy, Check, MoonStar } from 'lucide-react'
import type { BugReport, BugscanFinding } from '@/lib/bugs/types'

interface Item {
  key: string
  project: string
  title: string
  level: 'critical' | 'error' | 'warning'
  message: string
  fixPrompt: string | null
}

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
  if (level === 'warning') return <Circle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
  return <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${level === 'critical' ? 'text-red-400' : 'text-orange-400'}`} />
}

export function NightlyFindings({
  findings,
  reports,
}: {
  findings: BugscanFinding[]
  reports: BugReport[]
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const items = toItems(findings, reports)
  if (items.length === 0) return null

  const copy = async (item: Item) => {
    if (!item.fixPrompt) return
    try {
      await navigator.clipboard.writeText(item.fixPrompt)
      setCopiedKey(item.key)
      setTimeout(() => setCopiedKey(k => (k === item.key ? null : k)), 2000)
    } catch { /* clipboard otillgängligt — ignorera */ }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MoonStar className="w-3.5 h-3.5 text-indigo-300" />
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Nattens systemfynd · {items.length}
        </p>
      </div>
      <div className="space-y-2.5">
        {items.map(item => (
          <div key={item.key} className="flex items-start gap-2.5">
            {dot(item.level)}
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-medium text-foreground/95 truncate">
                {item.title}
                <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{item.project}</span>
              </p>
              {item.message && (
                <p className="text-[11.5px] text-zinc-400 leading-relaxed line-clamp-2">{item.message}</p>
              )}
            </div>
            {item.fixPrompt && (
              <button
                onClick={() => copy(item)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 transition-colors"
              >
                {copiedKey === item.key
                  ? (<><Check className="w-3 h-3" /> Kopierad</>)
                  : (<><Copy className="w-3 h-3" /> Fix-prompt</>)}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
