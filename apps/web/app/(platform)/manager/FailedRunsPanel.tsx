'use client'

import { useState } from 'react'
import { AlertTriangle, RotateCcw, Loader2 } from 'lucide-react'

interface FailedRun {
  id: string
  status: string
  error: string | null
  created_at: string
  workflows: { name: string } | null
}

export function FailedRunsPanel({ failedRuns }: { failedRuns: FailedRun[] }) {
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retried, setRetried] = useState<Set<string>>(new Set())

  async function retry(runId: string) {
    setRetrying(runId)
    try {
      const res = await fetch('/api/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_run', run_id: runId }),
      })
      if (res.ok) {
        setRetried(prev => new Set([...prev, runId]))
      }
    } finally {
      setRetrying(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <h2 className="text-sm font-semibold">Misslyckade körningar</h2>
        {failedRuns.length > 0 && (
          <span className="ml-auto text-xs font-medium text-red-400 tabular-nums">{failedRuns.length}</span>
        )}
      </div>

      {failedRuns.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Inga misslyckade körningar 🎉
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
          {failedRuns.map((run) => {
            const isRetried = retried.has(run.id)
            const time = new Date(run.created_at).toLocaleDateString('sv-SE', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })
            return (
              <div key={run.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {run.workflows?.name ?? 'Okänt workflow'}
                  </p>
                  {run.error && (
                    <p className="text-[10px] text-red-400/70 mt-0.5 truncate">{run.error}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{time}</p>
                </div>
                <button
                  onClick={() => retry(run.id)}
                  disabled={!!retrying || isRetried}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors shrink-0"
                >
                  {retrying === run.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RotateCcw className="w-3 h-3" />
                  }
                  {isRetried ? 'Startad' : 'Försök igen'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
