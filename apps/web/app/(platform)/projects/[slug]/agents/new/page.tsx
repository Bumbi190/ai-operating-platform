'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgentForm, type AgentFormData } from '@/components/forms/AgentForm'

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
    <div className="p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Ny agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          En agent är en AI med en specifik roll, systemprompt och modell
        </p>
      </div>

      <AgentForm
        onSubmit={handleSubmit}
        submitLabel="Skapa agent"
        isLoading={loading}
        error={error}
      />
    </div>
  )
}
