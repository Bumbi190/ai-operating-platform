'use client'

import { useState, useEffect } from 'react'
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
  ArrowDown,
  Bot,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, WorkflowStep } from '@/lib/supabase/types'

interface StepDraft extends Omit<WorkflowStep, 'order'> {
  id: string // local key for React
}

export default function NewWorkflowPage({
  params,
}: {
  params: { slug: string }
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [steps, setSteps] = useState<StepDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<string | null>(null)

  // Load agents for this project
  useEffect(() => {
    fetch(`/api/projects/${params.slug}/agents`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data)
      })
      .catch(console.error)
  }, [params.slug])

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

    // Validate steps
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

    const res = await fetch(`/api/projects/${params.slug}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        steps: finalSteps,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Något gick fel')
      setLoading(false)
      return
    }

    router.push(`/projects/${params.slug}/workflows`)
    router.refresh()
  }

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Nytt workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">
          En sekvens av agentsteg där varje steg kan använda utdata från föregående
        </p>
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
              placeholder="t.ex. Månadspaket Generator"
              required
              autoFocus
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
            {agents.length === 0 && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                ⚠ Inga agenter — skapa agenter first
              </p>
            )}
          </div>

          {steps.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Inga steg ännu</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Klicka &quot;Lägg till steg&quot; för att börja bygga ditt workflow
                </p>
              </div>
            </div>
          )}

          {/* Step cards with connecting arrows */}
          <div className="space-y-0">
            {steps.map((step, idx) => {
              const isActive = activeStep === step.id
              const agent = agentMap[step.agent_id]

              return (
                <div key={step.id}>
                  {/* Connecting arrow */}
                  {idx > 0 && (
                    <div className="flex justify-center py-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-px h-3 bg-border" />
                        <ArrowDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {/* Step card */}
                  <div
                    className={cn(
                      'rounded-xl border bg-card transition-all cursor-pointer',
                      isActive
                        ? 'border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                        : 'border-border hover:border-border/80',
                    )}
                    onClick={() => setActiveStep(isActive ? null : step.id)}
                  >
                    {/* Step header — always visible */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Step number badge */}
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

                      {/* Agent badge */}
                      {agent && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          <Bot className="w-3 h-3" />
                          {agent.name}
                        </span>
                      )}

                      {/* Actions */}
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
                          {/* Agent selector */}
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

                          {/* Output key */}
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

                        {/* Input template */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Input-mall *</Label>
                            {/* Variable chips for previous steps */}
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
                            placeholder={
                              idx === 0
                                ? 'Skriv en berättelse om {{tema}} för barn {{ålder}}.'
                                : `Baserat på detta:\n\n{{${steps[idx - 1]?.output_key ?? 'föregående'}}}\n\nGör nu...`
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
          </div>

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

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <span className="shrink-0">⚠</span>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? 'Skapar...' : 'Skapa workflow'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/projects/${params.slug}/workflows`)}
          >
            Avbryt
          </Button>
        </div>
      </form>
    </div>
  )
}
