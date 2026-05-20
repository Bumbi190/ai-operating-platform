'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  ArrowDown,
  Bot,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, WorkflowStep } from '@/lib/supabase/types'

interface StepDraft extends Omit<WorkflowStep, 'order'> {
  id: string // local React key
}

interface Props {
  workflow: {
    id: string
    name: string
    description: string
    steps: WorkflowStep[]
  }
  agents: Agent[]
  slug: string
}

export default function EditWorkflowClient({ workflow, agents, slug }: Props) {
  const router = useRouter()
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description)
  const [steps, setSteps] = useState<StepDraft[]>(
    [...workflow.steps]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, id: crypto.randomUUID() })),
  )
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<string | null>(null)

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

  function addStep() {
    const newStep: StepDraft = {
      id: crypto.randomUUID(),
      name: `Steg ${steps.length + 1}`,
      agent_id: agents[0]?.id ?? '',
      input_template: '',
      output_key: `steg_${steps.length + 1}`,
    }
    setSteps((prev) => [...prev, newStep])
    setActiveStep(newStep.id)
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id))
    if (activeStep === id) setActiveStep(null)
  }

  function updateStep(id: string, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function moveStep(id: string, dir: 'up' | 'down') {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (dir === 'up' && idx === 0) return prev
      if (dir === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swap = dir === 'up' ? idx - 1 : idx + 1
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (steps.length === 0) {
      setError('Lägg till minst ett steg')
      return
    }

    for (const step of steps) {
      if (!step.agent_id) {
        setError(`Välj en agent för steg "${step.name}"`)
        return
      }
      if (!step.input_template.trim()) {
        setError(`Fyll i input-mall för steg "${step.name}"`)
        return
      }
      if (!step.output_key.trim()) {
        setError(`Fyll i output-nyckel för steg "${step.name}"`)
        return
      }
    }

    setLoading(true)
    setError(null)

    const finalSteps: WorkflowStep[] = steps.map((s, i) => ({
      order: i + 1,
      name: s.name,
      agent_id: s.agent_id,
      input_template: s.input_template,
      output_key: s.output_key,
    }))

    const res = await fetch(`/api/projects/${slug}/workflows/${workflow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        steps: finalSteps,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Något gick fel')
      setLoading(false)
      return
    }

    router.push(`/projects/${slug}/workflows`)
    router.refresh()
  }

  async function handleDelete() {
    await fetch(`/api/projects/${slug}/workflows/${workflow.id}`, {
      method: 'DELETE',
    })
    router.push(`/projects/${slug}/workflows`)
    router.refresh()
  }

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{workflow.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Redigera workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              router.push(`/projects/${slug}/workflows/${workflow.id}/run`)
            }
            className="gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            Kör
          </Button>
          {deleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive">Är du säker?</span>
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                Ja, ta bort
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteConfirm(false)}
              >
                Avbryt
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Grundinformation
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Namn *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Beskrivning</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vad gör detta workflow?"
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Steg ({steps.length})
            </h2>
          </div>

          {steps.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Inga steg</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Klicka &quot;Lägg till steg&quot; för att lägga till ett steg
                </p>
              </div>
            </div>
          )}

          {steps.map((step, idx) => {
            const isActive = activeStep === step.id
            const agent = agentMap[step.agent_id]

            return (
              <div key={step.id}>
                {idx > 0 && (
                  <div className="flex justify-center py-1">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-px h-3 bg-border" />
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    'rounded-xl border bg-card transition-all cursor-pointer',
                    isActive
                      ? 'border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                      : 'border-border hover:border-border/80',
                  )}
                  onClick={() => setActiveStep(isActive ? null : step.id)}
                >
                  {/* Step header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border',
                        isActive
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                          : 'bg-muted border-border text-muted-foreground',
                      )}
                    >
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={step.name}
                        onChange={(e) => updateStep(step.id, { name: e.target.value })}
                        placeholder="Stegnamn"
                        className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
                      />
                    </div>

                    {agent && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                        <Bot className="w-3 h-3" />
                        {agent.name}
                      </span>
                    )}

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors text-muted-foreground"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 'down')}
                        disabled={idx === steps.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors text-muted-foreground"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(step.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isActive && (
                    <div
                      className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Agent *</Label>
                          <Select
                            value={step.agent_id}
                            onChange={(e) =>
                              updateStep(step.id, { agent_id: e.target.value })
                            }
                          >
                            <option value="">Välj agent...</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Output-nyckel *{' '}
                            <span className="text-muted-foreground font-normal">
                              → {'{{'}nyckel{'}}'}
                            </span>
                          </Label>
                          <Input
                            value={step.output_key}
                            onChange={(e) =>
                              updateStep(step.id, {
                                output_key: e.target.value
                                  .replace(/\s/g, '_')
                                  .toLowerCase(),
                              })
                            }
                            placeholder="t.ex. svar"
                            className="font-mono text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Input-mall *</Label>
                          {idx > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {steps.slice(0, idx).map((prev) => (
                                <button
                                  key={prev.id}
                                  type="button"
                                  onClick={() =>
                                    updateStep(step.id, {
                                      input_template:
                                        step.input_template +
                                        `{{${prev.output_key}}}`,
                                    })
                                  }
                                  className="text-[10px] rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 px-2 py-0.5 hover:bg-indigo-500/20 transition-colors font-mono"
                                >
                                  + {'{{'}
                                  {prev.output_key}
                                  {'}}'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Textarea
                          value={step.input_template}
                          onChange={(e) =>
                            updateStep(step.id, {
                              input_template: e.target.value,
                            })
                          }
                          rows={4}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <Button
            type="button"
            variant="outline"
            onClick={addStep}
            disabled={agents.length === 0}
            className="w-full mt-3 border-dashed"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Lägg till steg
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <span className="shrink-0">⚠</span>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? 'Sparar...' : 'Spara ändringar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/projects/${slug}/workflows`)}
          >
            Avbryt
          </Button>
        </div>
      </form>
    </div>
  )
}
