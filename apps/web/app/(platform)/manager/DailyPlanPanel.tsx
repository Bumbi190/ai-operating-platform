'use client'

import { useState } from 'react'
import { Brain, RefreshCw, Loader2, AlertTriangle, TrendingUp, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DailyPlan } from '@/lib/ai/manager'

const URGENCY_CONFIG = {
  high:   { label: 'Hög',   color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  medium: { label: 'Medel', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  low:    { label: 'Låg',   color: 'text-muted-foreground bg-muted/30 border-border' },
}

export function DailyPlanPanel({ initialPlan }: { initialPlan: DailyPlan | null }) {
  const [plan, setPlan] = useState<DailyPlan | null>(initialPlan)
  const [loading, setLoading] = useState(false)

  async function generate(force = false) {
    setLoading(true)
    try {
      const res = await fetch('/api/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'daily_plan', force }),
      })
      const data = await res.json()
      if (data.plan) setPlan(data.plan)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold">Daglig plan</h2>
          {plan && (
            <span className="text-[10px] text-muted-foreground/50 ml-1">— genererad av Manager Agent</span>
          )}
        </div>
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
          {plan ? 'Regenerera' : 'Generera plan'}
        </button>
      </div>

      {!plan && !loading && (
        <div className="p-8 text-center space-y-2">
          <Brain className="w-8 h-8 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">Ingen plan för idag ännu</p>
          <button
            onClick={() => generate()}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Klicka för att generera
          </button>
        </div>
      )}

      {loading && !plan && (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Manager analyserar systemet…
        </div>
      )}

      {plan && (
        <div className="p-5 space-y-5">
          {/* Summary */}
          <p className="text-sm text-muted-foreground leading-relaxed">{plan.summary}</p>

          {/* Priorities */}
          {plan.priorities?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Prioriteringar</h3>
              <div className="space-y-2">
                {plan.priorities.map((p, i) => {
                  const cfg = URGENCY_CONFIG[p.urgency] ?? URGENCY_CONFIG.low
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 mt-0.5', cfg.color)}>
                        {cfg.label}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{p.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.reason}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Two columns: concerns + opportunities */}
          <div className="grid grid-cols-2 gap-4">
            {plan.concerns?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Risker
                </h3>
                <ul className="space-y-1">
                  {plan.concerns.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-red-400/50 mt-1">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.opportunities?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-green-400/70 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Möjligheter
                </h3>
                <ul className="space-y-1">
                  {plan.opportunities.map((o, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-green-400/50 mt-1">•</span> {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
