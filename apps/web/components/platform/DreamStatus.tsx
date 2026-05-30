'use client'

import { useState, useEffect, useCallback } from 'react'
import { Moon, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

interface DreamMemory {
  key: string
  value: string
  updated_at: string
}

interface DreamStatusProps {
  slug: string
}

function getHealthStatus(memories: DreamMemory[]): 'ok' | 'warning' | 'critical' | 'empty' {
  if (memories.length === 0) return 'empty'
  const hasCritical = memories.some(m => m.value.includes('[CRITICAL]'))
  const hasWarning = memories.some(m => m.value.includes('[WARNING]'))
  if (hasCritical) return 'critical'
  if (hasWarning) return 'warning'
  return 'ok'
}

const healthConfig = {
  ok: {
    label: 'Bra',
    icon: CheckCircle,
    className: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  warning: {
    label: 'Varningar',
    icon: AlertTriangle,
    className: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  critical: {
    label: 'Problem',
    icon: XCircle,
    className: 'text-red-500',
    bg: 'bg-red-500/10',
  },
  empty: {
    label: 'Inga data',
    icon: Moon,
    className: 'text-muted-foreground',
    bg: 'bg-muted/30',
  },
}

export function DreamStatus({ slug }: DreamStatusProps) {
  const [memories, setMemories] = useState<DreamMemory[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<Date | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDreamStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${slug}/dream`)
      if (!res.ok) return
      const data = await res.json()
      const mems: DreamMemory[] = data.memories ?? []
      setMemories(mems)
      if (mems.length > 0) {
        setLastRun(new Date(mems[0].updated_at))
      }
    } catch {
      // tyst fel — visar bara tom status
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchDreamStatus()
  }, [fetchDreamStatus])

  async function runDreamCycle() {
    setIsRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/dream`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Okänt fel')
        return
      }
      setSummary(data.summary ?? null)
      await fetchDreamStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nätverksfel')
    } finally {
      setIsRunning(false)
    }
  }

  const health = getHealthStatus(memories)
  const { label, icon: HealthIcon, className: healthClass, bg: healthBg } = healthConfig[health]
  const insightCount = memories.length

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="h-3 w-48 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-medium">Dream Cycle</span>
        </div>
        <button
          onClick={runDreamCycle}
          disabled={isRunning}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Analyserar…' : 'Kör nu'}
        </button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 flex-wrap">
        {lastRun ? (
          <span className="text-xs text-muted-foreground">
            Senaste:{' '}
            {formatDistanceToNow(lastRun, { addSuffix: true, locale: sv })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Aldrig körts</span>
        )}

        <span className="text-muted-foreground text-xs">·</span>

        <span className="text-xs text-muted-foreground">
          {insightCount} insikt{insightCount !== 1 ? 'er' : ''}
        </span>

        <span className="text-muted-foreground text-xs">·</span>

        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${healthBg} ${healthClass}`}>
          <HealthIcon className="w-3 h-3" />
          {label}
        </span>
      </div>

      {/* Summary (visas efter körning eller om det finns data) */}
      {summary && (
        <p className="text-xs text-muted-foreground border-l-2 border-indigo-400/40 pl-3 leading-relaxed">
          {summary}
        </p>
      )}

      {/* Senaste insikter (max 3) */}
      {memories.length > 0 && !summary && (
        <div className="space-y-1.5">
          {memories.slice(0, 3).map(m => (
            <p key={m.key} className="text-xs text-muted-foreground border-l-2 border-border pl-3 truncate">
              {m.value}
            </p>
          ))}
        </div>
      )}

      {/* Felmeddelande */}
      {error && (
        <p className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
