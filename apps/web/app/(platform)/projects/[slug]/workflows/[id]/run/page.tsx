'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Play, Bot, ArrowRight } from 'lucide-react'
import type { Workflow, WorkflowStep, Agent } from '@/lib/supabase/types'
import { OSPage, OSLayer } from '@/components/platform/os'

// Extract {{variable}} names from a template that are NOT output keys
function extractInputVars(steps: WorkflowStep[]): string[] {
  const outputKeys = new Set(steps.map((s) => s.output_key))
  const vars = new Set<string>()

  for (const step of steps) {
    const matches = step.input_template.matchAll(/\{\{(\w+)\}\}/g)
    for (const match of matches) {
      const varName = match[1]
      if (!outputKeys.has(varName)) {
        vars.add(varName)
      }
    }
  }

  return Array.from(vars)
}

export default function RunWorkflowPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const router = useRouter()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load workflow
    fetch(`/api/projects/${params.slug}/workflows`)
      .then((r) => r.json())
      .then((workflows: Workflow[]) => {
        const wf = workflows.find((w) => w.id === params.id)
        if (wf) {
          setWorkflow(wf)
          // Init input values
          const vars = extractInputVars(wf.steps)
          setInputValues(Object.fromEntries(vars.map((v) => [v, ''])))
        }
      })

    // Load agents for display
    fetch(`/api/projects/${params.slug}/agents`)
      .then((r) => r.json())
      .then((agentList: Agent[]) => {
        setAgents(Object.fromEntries(agentList.map((a) => [a.id, a])))
      })
  }, [params.slug, params.id])

  async function handleRun(e: React.FormEvent) {
    e.preventDefault()
    if (!workflow) return
    setRunning(true)
    setError(null)

    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflow.id,
        input: inputValues,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Kunde inte starta körning')
      setRunning(false)
      return
    }

    // Navigate to run detail page to watch live stream
    router.push(`/projects/${params.slug}/runs/${data.run_id}`)
  }

  if (!workflow) {
    return (
      <div className="p-8 text-center text-muted-foreground">Laddar workflow...</div>
    )
  }

  const inputVars = extractInputVars(workflow.steps)

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>{params.slug}</span>
          <ArrowRight className="w-3 h-3" />
          <span>workflows</span>
          <ArrowRight className="w-3 h-3" />
          <span>{workflow.name}</span>
        </div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Play className="w-6 h-6" />
          Kör: {workflow.name}
        </h1>
        {workflow.description && (
          <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
        )}
      </OSLayer>

      <OSLayer layer="operational" className="max-w-3xl 3xl:max-w-4xl space-y-6">
      {/* Workflow overview */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {workflow.steps.length} steg
        </p>
        {[...workflow.steps]
          .sort((a, b) => a.order - b.order)
          .map((step) => {
            const agent = agents[step.agent_id]
            return (
              <div key={step.order} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground font-mono w-5">
                  {step.order}.
                </span>
                <span className="font-medium flex-1">{step.name}</span>
                {agent && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Bot className="w-3 h-3" />
                    {agent.name}
                  </span>
                )}
                <span className="text-xs font-mono text-muted-foreground">
                  →{' '}
                  <span className="text-foreground">{'{{'}{step.output_key}{'}}'}</span>
                </span>
              </div>
            )
          })}
      </div>

      {/* Input form */}
      <form onSubmit={handleRun} className="space-y-6">
        {inputVars.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              Parametrar
              <span className="ml-2 text-muted-foreground font-normal">
                ({inputVars.length} {inputVars.length === 1 ? 'variabel' : 'variabler'})
              </span>
            </p>

            {inputVars.map((varName) => (
              <div key={varName} className="space-y-1.5">
                <Label htmlFor={varName} className="font-mono">
                  {'{{'}{varName}{'}}'}
                </Label>
                <Input
                  id={varName}
                  value={inputValues[varName] ?? ''}
                  onChange={(e) =>
                    setInputValues((prev) => ({ ...prev, [varName]: e.target.value }))
                  }
                  placeholder={`Värde för ${varName}...`}
                  required
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Det här workflowet har inga input-parametrar — det kan köras direkt.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={running}
          className="w-full"
          size="lg"
        >
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Startar körning...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Kör workflow
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Du omdirigeras till körningsloggen automatiskt
        </p>
      </form>
      </OSLayer>
    </OSPage>
  )
}
