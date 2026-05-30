import { Brain, Database, Sparkles, GitBranch, Target } from 'lucide-react'

export interface ReasoningStep {
  id: string
  type: 'memory' | 'decision' | 'evaluation' | 'branch' | 'goal'
  title: string
  detail?: string
  confidence?: number
}

const TYPE_META = {
  memory:     { icon: Database,  color: '#67e8f9', label: 'Memory' },
  decision:   { icon: Brain,     color: '#a78bfa', label: 'Decision' },
  evaluation: { icon: Sparkles,  color: '#fbbf24', label: 'Evaluation' },
  branch:     { icon: GitBranch, color: '#818cf8', label: 'Branch' },
  goal:       { icon: Target,    color: '#34d399', label: 'Goal' },
} as const

/**
 * AI reasoning chain — shows WHY the agent made each decision.
 * Used inside approval cards and workflow detail.
 */
export function ReasoningTrace({ steps }: { steps: ReasoningStep[] }) {
  return (
    <div className="space-y-3 relative trace-line pl-7">
      {steps.map((step, i) => {
        const meta = TYPE_META[step.type]
        const Icon = meta.icon
        return (
          <div key={step.id} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}>
            {/* Node */}
            <div
              className="absolute -left-7 top-0.5 w-4 h-4 rounded-full flex items-center justify-center chrome-edge"
              style={{
                background: `${meta.color}1a`,
                border: `1px solid ${meta.color}55`,
                boxShadow: `0 0 10px ${meta.color}44`,
              }}
            >
              <Icon className="w-2 h-2" style={{ color: meta.color }} />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
                {step.confidence != null && (
                  <span className="text-[9px] text-zinc-600 font-mono">
                    · {step.confidence}% conf
                  </span>
                )}
              </div>
              <p className="text-[12px] text-zinc-200 leading-snug">{step.title}</p>
              {step.detail && (
                <p className="text-[10.5px] text-zinc-500 mt-1 leading-relaxed">{step.detail}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Score bar — used in approval cards for AI scores.
 */
export function ScoreBar({
  label,
  score,
  max = 100,
  color,
  description,
}: {
  label: string
  score: number
  max?: number
  color: string
  description?: string
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="num font-bold" style={{ color }}>
          {score}<span className="text-zinc-600 font-normal">/{max}</span>
        </span>
      </div>
      <div className="progress-track">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            boxShadow: `0 0 8px ${color}88`,
          }}
        />
      </div>
      {description && (
        <p className="text-[10px] text-zinc-600 leading-relaxed">{description}</p>
      )}
    </div>
  )
}
