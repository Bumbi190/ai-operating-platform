'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Conversation {
  id: string
  title: string
  project_id: string | null
  updated_at: string
  projects: { name: string; slug: string } | null
}

export function ConversationList({ conversations }: { conversations: Conversation[] }) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Radera denna konversation?')) return
    setDeleting(id)
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  // Group by date
  const groups: Record<string, Conversation[]> = {}
  const now = new Date()
  for (const conv of conversations) {
    const date = new Date(conv.updated_at)
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    const label =
      diffDays === 0 ? 'Idag' :
      diffDays === 1 ? 'Igår' :
      diffDays < 7  ? 'Denna vecka' :
      diffDays < 30 ? 'Denna månad' : 'Äldre'
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }

  const groupOrder = ['Idag', 'Igår', 'Denna vecka', 'Denna månad', 'Äldre']

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {groupOrder.filter(g => groups[g]).map(groupLabel => (
        <div key={groupLabel}>
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">{groupLabel}</p>
          <div className="space-y-1">
            {groups[groupLabel].map(conv => (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className={cn(
                  'group flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent',
                  'hover:bg-card hover:border-border transition-all',
                  deleting === conv.id && 'opacity-50 pointer-events-none',
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  {conv.projects && (
                    <p className="text-xs text-muted-foreground truncate">{conv.projects.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(conv.updated_at).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
