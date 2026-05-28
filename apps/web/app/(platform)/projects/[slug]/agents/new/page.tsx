'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgentForm, type AgentFormData } from '@/components/forms/AgentForm'
import { OSPage, OSLayer } from '@/components/platform/os'

export default function NewAgentPage({
  params,
}: {
  params: { slug: string }
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(data: AgentFormData) {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/projects/${params.slug}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        system_prompt: data.system_prompt,
        model: data.model,
        config: {
          max_tokens: data.max_tokens,
          temperature: data.temperature,
        },
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      setError(result.error ?? 'Något gick fel')
      setLoading(false)
      return
    }

    router.push(`/projects/${params.slug}/agents`)
    router.refresh()
  }

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <p className="eyebrow eyebrow-accent mb-3">System · agent deployment</p>
        <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Ny agent</h1>
        <p className="text-sm 2xl:text-base text-zinc-400 mt-2 max-w-2xl">
          En agent är en AI med en specifik roll, systemprompt och modell
        </p>
      </OSLayer>

      <OSLayer layer="operational">
        <div className="max-w-3xl 3xl:max-w-4xl">
          <AgentForm
            onSubmit={handleSubmit}
            submitLabel="Skapa agent"
            isLoading={loading}
            error={error}
          />
        </div>
      </OSLayer>
    </OSPage>
  )
}
