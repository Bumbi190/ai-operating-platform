'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgentForm, type AgentFormData } from '@/components/forms/AgentForm'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import type { Agent } from '@/lib/supabase/types'

interface Props {
  agent: Agent
  slug: string
}

export default function EditAgentClient({ agent, slug }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  async function handleSubmit(data: AgentFormData) {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/projects/${slug}/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        system_prompt: data.system_prompt,
        model: data.model,
        config: { max_tokens: data.max_tokens, temperature: data.temperature },
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      setError(result.error ?? 'Något gick fel')
      setLoading(false)
      return
    }

    router.push(`/projects/${slug}/agents`)
    router.refresh()
  }

  async function handleDelete() {
    await fetch(`/api/projects/${slug}/agents/${agent.id}`, { method: 'DELETE' })
    router.push(`/projects/${slug}/agents`)
    router.refresh()
  }

  const config = agent.config as { max_tokens?: number; temperature?: number }

  return (
    <div className="p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Redigera agent</p>
        </div>
        {/* Delete */}
        {deleteConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-destructive">Är du säker?</span>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              Ja, ta bort
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(false)}>
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

      <AgentForm
        initial={{
          name: agent.name,
          description: agent.description ?? '',
          system_prompt: agent.system_prompt,
          model: agent.model,
          max_tokens: config?.max_tokens ?? 4000,
          temperature: config?.temperature ?? 0.7,
        }}
        onSubmit={handleSubmit}
        submitLabel="Spara ändringar"
        isLoading={loading}
        error={error}
      />
    </div>
  )
}
