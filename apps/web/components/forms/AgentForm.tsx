'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { MODELS } from '@/lib/ai/models'

// Skill presets — click to inject a system prompt template
const SKILL_PRESETS = [
  {
    id: 'generalist',
    label: 'Generalist',
    prompt: 'Du är en hjälpsam AI-assistent.\nSvara alltid på det språk som användaren skriver på.\nVar konkret och handlingsinriktad.',
  },
  {
    id: 'story-generator',
    label: 'Berättelsegenerator',
    prompt: 'Du är en kreativ barnboksförfattare som skriver på svenska.\nDu skapar engagerande, åldersanpassade berättelser med:\n- Tydlig handling (början, mitten, slut)\n- Positiva värderingar och lärdomar\n- Levande karaktärer som barn kan identifiera sig med\n- Enkelt men rikt språk\n\nFormat: Returnera berättelsen som ren text med rubrik överst.\nLängd: 300–500 ord om inget annat anges.',
  },
  {
    id: 'activity-planner',
    label: 'Aktivitetsplanerare',
    prompt: 'Du skapar praktiska familjeaktiviteter.\nVarje aktivitet ska:\n- Ta 15–45 minuter\n- Kräva enkelt material (finns hemma)\n- Passa barn 4–8 år\n- Ha tydliga steg-för-steg-instruktioner\n\nReturnera exakt detta JSON-format:\n{"activities": [{"title": "...", "duration_minutes": 20, "materials": ["..."], "steps": ["..."], "learning_goal": "..."}]}',
  },
  {
    id: 'researcher',
    label: 'Researcher',
    prompt: 'Du är en analytisk researcher som samlar och strukturerar information.\nVid varje förfrågan:\n1. Identifiera nyckelaspekter av ämnet\n2. Presentera fakta objektivt\n3. Lyft fram viktiga mönster och insikter\n4. Sammanfatta med konkreta slutsatser\n\nFormat: Strukturerat med rubriker. Källhänvisningar när relevant.',
  },
  {
    id: 'email-writer',
    label: 'E-postskrivare',
    prompt: 'Du skriver professionella, korta och effektiva e-postmeddelanden på svenska.\nRegler:\n- Max 150 ord\n- Tydlig ämnesrad\n- En tydlig call-to-action\n- Professionell men personlig ton\n\nFormat: Returnera ämnesrad på första raden, sedan e-posttexten.',
  },
] as const

export interface AgentFormData {
  name: string
  description: string
  system_prompt: string
  model: string
  max_tokens: number
  temperature: number
}

interface AgentFormProps {
  initial?: Partial<AgentFormData>
  onSubmit: (data: AgentFormData) => Promise<void>
  submitLabel?: string
  isLoading?: boolean
  error?: string | null
}

export function AgentForm({
  initial,
  onSubmit,
  submitLabel = 'Spara agent',
  isLoading = false,
  error,
}: AgentFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [model, setModel] = useState(initial?.model ?? 'claude-sonnet-4-6')
  const [maxTokens, setMaxTokens] = useState(initial?.max_tokens ?? 4000)
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name,
      description,
      system_prompt: systemPrompt,
      model,
      max_tokens: maxTokens,
      temperature,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Namn *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="t.ex. StoryAgent"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Beskrivning</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kort beskrivning av agentens roll"
        />
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <Label htmlFor="model">Modell</Label>
        <Select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {Object.entries(MODELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {/* System prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="system_prompt">Systemprompt *</Label>
          <span className="text-xs text-muted-foreground">Snabbval:</span>
        </div>

        {/* Skill presets */}
        <div className="flex flex-wrap gap-2">
          {SKILL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSystemPrompt(preset.prompt)}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent hover:border-accent-foreground/20 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <Textarea
          id="system_prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Du är en hjälpsam assistent som..."
          required
          rows={8}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {systemPrompt.length} tecken · ~{Math.round(systemPrompt.length / 4)} tokens
        </p>
      </div>

      {/* Advanced config */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">›</span>
          Avancerade inställningar
        </summary>
        <div className="mt-4 space-y-4 pl-4 border-l border-border">
          {/* Max tokens */}
          <div className="space-y-1.5">
            <Label htmlFor="max_tokens">Max tokens: {maxTokens}</Label>
            <input
              id="max_tokens"
              type="range"
              min={256}
              max={8000}
              step={256}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>256</span>
              <span>8000</span>
            </div>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <Label htmlFor="temperature">
              Temperatur: {temperature.toFixed(1)}
              <span className="ml-2 text-muted-foreground font-normal">
                ({temperature < 0.4 ? 'deterministisk' : temperature < 0.7 ? 'balanserad' : 'kreativ'})
              </span>
            </Label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.0 (deterministisk)</span>
              <span>1.0 (kreativ)</span>
            </div>
          </div>
        </div>
      </details>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Sparar...' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => window.history.back()}>
          Avbryt
        </Button>
      </div>
    </form>
  )
}
