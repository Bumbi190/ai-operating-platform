'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, CheckCircle, XCircle, Newspaper, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import type { MediaNewsItem } from '@/lib/media/types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:      { label: 'Ny',         color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  approved: { label: 'Godkänd',    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  rejected: { label: 'Avslagen',   color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  scripted: { label: 'Manusad',    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
}

const ANGLE_ICONS: Record<string, string> = {
  educational: '📚',
  controversial: '🔥',
  inspiring: '✨',
  practical: '🛠️',
}

function ViralityBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-6">{score}</span>
    </div>
  )
}

export default function NewsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [items, setItems] = useState<MediaNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [projectId, setProjectId] = useState<string | null>(null)

  // Fetch project ID from slug
  useEffect(() => {
    fetch(`/api/projects/by-slug/${slug}`)
      .then(r => r.json())
      .then(d => setProjectId(d?.id ?? null))
      .catch(() => setProjectId(null))
  }, [slug])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const url = new URL('/api/media/news', window.location.origin)
    url.searchParams.set('project_id', projectId)
    if (filter !== 'all') url.searchParams.set('status', filter)
    const res = await fetch(url)
    const data = await res.json() as MediaNewsItem[]
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [projectId, filter])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/media/news/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const filters = ['all', 'new', 'approved', 'scripted', 'rejected']

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">News Feed</h1>
            <p className="text-sm text-muted-foreground">AI-nyheter redo för manusskapande</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${slug}/workflows`}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Kör Fetch AI News
          </Link>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Uppdatera
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {f === 'all' ? 'Alla' : STATUS_LABELS[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Laddar...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Newspaper className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Inga nyheter ännu</p>
          <p className="text-xs text-muted-foreground">
            Kör &ldquo;Fetch AI News&rdquo;-workflowet och anropa{' '}
            <code className="font-mono bg-muted px-1 rounded">POST /api/media/news/from-run</code>{' '}
            för att spara resultatet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusCfg = STATUS_LABELS[item.status]
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-5 space-y-3 hover:border-border/80 transition-all"
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{ANGLE_ICONS[item.content_angle ?? ''] ?? '📰'}</span>
                      <h3 className="font-semibold text-sm leading-snug">{item.title}</h3>
                    </div>
                    {item.source_name && (
                      <span className="text-xs text-muted-foreground font-mono">{item.source_name}</span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${statusCfg?.color}`}>
                    {statusCfg?.label ?? item.status}
                  </span>
                </div>

                {/* Summary */}
                {item.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
                )}

                {/* Key insight */}
                {item.key_insight && (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground mr-2">💡 Insikt:</span>
                    <span className="text-xs">{item.key_insight}</span>
                  </div>
                )}

                {/* Virality + actions */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Viral potential</p>
                    <ViralityBar score={item.virality_score} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        title="Öppna källa"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {item.status === 'new' && (
                      <>
                        <button
                          onClick={() => updateStatus(item.id, 'approved')}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Godkänn
                        </button>
                        <button
                          onClick={() => updateStatus(item.id, 'rejected')}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          <XCircle className="w-3 h-3" /> Avslå
                        </button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <Link
                        href={`/projects/${slug}/workflows`}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors"
                      >
                        <FileText className="w-3 h-3" /> Skapa manus
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
