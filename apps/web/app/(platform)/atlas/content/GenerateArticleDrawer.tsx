'use client'

/**
 * Atlas → Content Center → Generate Article drawer.
 *
 * Operator-facing UI for kicking off the existing article generation pipeline
 * without curl/CRON_SECRET. The button mounts in the Content Center header;
 * clicking opens a right-side drawer with:
 *   • tier picker (breaking / standard / deep) — defaults to 'standard'
 *   • list of media_news_items with status='new'
 *   • Generate → POST /api/content/articles/operator-generate
 *   • on 200 → router.push to /atlas/content/<id>
 *
 * Reuses the same pipeline as the cron path; no new generation logic. The new
 * row lands in pending_review per the existing saveGeneratedArticle contract.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X, Loader2 } from 'lucide-react'

export interface NewsItemForPicker {
  id: string
  title: string
  source_name: string | null
  virality_score: number | null
  created_at: string
}

type Tier = 'breaking' | 'standard' | 'deep'

export function GenerateArticleDrawer({ newsItems }: { newsItems: NewsItemForPicker[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null)
  const [tier, setTier] = useState<Tier>('standard')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (busy) return
    setOpen(false)
    setError(null)
  }

  async function generate() {
    if (!selectedNewsId || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/content/articles/operator-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ news_item_id: selectedNewsId, tier }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Request failed (${res.status})`)
        return
      }
      router.push(`/atlas/content/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Generate Article
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generate Article"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch justify-end"
          onClick={close}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        >
          <div
            className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-sm font-semibold text-zinc-100 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" /> Generate Article
              </h2>
              <button
                onClick={close}
                disabled={busy}
                aria-label="Close"
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Tier */}
            <section className="p-4 border-b border-zinc-800 space-y-2 shrink-0">
              <p className="text-[10px] font-mono uppercase text-meta">Length tier</p>
              <div className="flex gap-2">
                {(['breaking', 'standard', 'deep'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    disabled={busy}
                    className={[
                      'flex-1 px-3 py-2 rounded text-xs font-medium border transition-colors disabled:opacity-50',
                      tier === t
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/70',
                    ].join(' ')}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-meta">
                breaking ≈ 150–300 words · standard ≈ 450–750 · deep ≈ 900–1300
              </p>
            </section>

            {/* News items list */}
            <section className="p-4 space-y-2 flex-1 min-h-0">
              <p className="text-[10px] font-mono uppercase text-meta">
                News items <span className="text-meta">(status=new · most recent first)</span>
              </p>
              {newsItems.length === 0 ? (
                <p className="text-xs text-meta italic px-1">No news items with status=new.</p>
              ) : (
                <ul className="space-y-1.5">
                  {newsItems.map((n) => {
                    const selected = selectedNewsId === n.id
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => setSelectedNewsId(n.id)}
                          disabled={busy}
                          className={[
                            'w-full text-left rounded border p-3 transition-colors disabled:opacity-50',
                            selected
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900',
                          ].join(' ')}
                        >
                          <p className="text-sm font-medium text-zinc-100 line-clamp-2">{n.title}</p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-secondary">
                            <span>{n.source_name ?? '—'}</span>
                            <span>
                              Virality: <span className="text-zinc-300">{n.virality_score ?? '—'}</span>
                            </span>
                            <span>{new Date(n.created_at).toLocaleDateString('sv-SE')}</span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Footer */}
            <footer className="sticky bottom-0 p-4 border-t border-zinc-800 bg-zinc-950 space-y-2 shrink-0">
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                onClick={generate}
                disabled={!selectedNewsId || busy}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {busy ? 'Generating…' : 'Generate Article'}
              </button>
              <p className="text-[10px] text-meta">
                Reuses the existing Atlas pipeline. Result lands in Pending Review — no autonomous publish.
              </p>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
