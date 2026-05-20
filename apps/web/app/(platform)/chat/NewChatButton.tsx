'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'

interface Project {
  id: string
  name: string
  slug: string
}

interface Props {
  projects: Project[]
  variant?: 'default' | 'primary'
}

export function NewChatButton({ projects, variant = 'default' }: Props) {
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const router = useRouter()

  async function createChat(projectId?: string) {
    setLoading(true)
    setShowPicker(false)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId ?? null }),
      })
      const conv = await res.json()
      if (conv.id) router.push(`/chat/${conv.id}`)
    } finally {
      setLoading(false)
    }
  }

  const buttonContent = loading
    ? <Loader2 className={variant === 'primary' ? 'w-4 h-4 animate-spin' : 'w-3.5 h-3.5 animate-spin'} />
    : <Plus className={variant === 'primary' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />

  if (variant === 'primary') {
    return (
      <div className="relative">
        <button
          onClick={() => projects.length > 1 ? setShowPicker(!showPicker) : createChat(projects[0]?.id)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {buttonContent}
          Ny chatt
        </button>

        {showPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">Välj projekt</div>
              <button onClick={() => createChat(undefined)} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors">
                Inget projekt
              </button>
              {projects.map(p => (
                <button key={p.id} onClick={() => createChat(p.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors">
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => projects.length > 1 ? setShowPicker(!showPicker) : createChat(projects[0]?.id)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
      >
        {buttonContent}
        Ny chatt
      </button>

      {showPicker && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">Välj projekt</div>
            <button onClick={() => createChat(undefined)} className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
              Inget projekt
            </button>
            {projects.map(p => (
              <button key={p.id} onClick={() => createChat(p.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
