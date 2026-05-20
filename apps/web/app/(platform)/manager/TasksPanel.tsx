'use client'

import { useState } from 'react'
import { CheckSquare, Circle, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-amber-400',
  medium:   'text-blue-400',
  low:      'text-muted-foreground/50',
}

export function TasksPanel({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [completing, setCompleting] = useState<string | null>(null)
  const [showPlanInput, setShowPlanInput] = useState(false)
  const [goal, setGoal] = useState('')
  const [planning, setPlanning] = useState(false)

  async function completeTask(taskId: string) {
    setCompleting(taskId)
    await fetch('/api/manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_task', task_id: taskId, status: 'done' }),
    })
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setCompleting(null)
  }

  async function planFromGoal() {
    if (!goal.trim()) return
    setPlanning(true)
    try {
      const res = await fetch('/api/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan_tasks', goal, project_id: 'global' }),
      })
      const data = await res.json()
      if (data.tasks?.length) {
        setTasks(prev => [...data.tasks, ...prev])
      }
      setGoal('')
      setShowPlanInput(false)
    } finally {
      setPlanning(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Manager-uppgifter</h2>
          <span className="text-xs text-muted-foreground/50 tabular-nums">{tasks.length} aktiva</span>
        </div>
        <button
          onClick={() => setShowPlanInput(!showPlanInput)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Planera från mål
        </button>
      </div>

      {/* Goal input */}
      {showPlanInput && (
        <div className="px-5 py-3 border-b border-border/50 flex gap-2">
          <input
            autoFocus
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') planFromGoal(); if (e.key === 'Escape') setShowPlanInput(false) }}
            placeholder="Beskriv ett mål — Manager Agent bryter ner det i uppgifter…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={planFromGoal}
            disabled={planning}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {planning ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Planera'}
          </button>
          <button onClick={() => setShowPlanInput(false)} className="p-1.5 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          Inga aktiva uppgifter — klicka "Planera från mål" för att låta Manager Agent skapa en plan
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {tasks.map(task => (
            <div key={task.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
              <button
                onClick={() => completeTask(task.id)}
                disabled={completing === task.id}
                className="mt-0.5 shrink-0 text-muted-foreground/40 hover:text-green-400 transition-colors"
              >
                {completing === task.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Circle className="w-4 h-4" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                )}
              </div>
              <span className={cn('text-[10px] font-medium shrink-0 mt-1', PRIORITY_COLOR[task.priority] ?? 'text-muted-foreground')}>
                {task.priority?.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
