'use client'

/**
 * Atlas → Content Center → detail → Review actions (System A).
 * Approve (→ publish via the server route, reusing publishArticle) / Reject.
 * Only rendered for pending_review items. Calls /api/content/articles/[id]/review.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function ReviewActions({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  async function act(action: 'approve' | 'reject') {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, notes: action === 'reject' ? notes : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <h2 className="text-xs font-mono uppercase tracking-wide text-amber-400/80">Review</h2>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rejection reason (optional)"
        className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 resize-none h-16 focus:outline-none focus:border-zinc-600"
      />
      <div className="flex gap-2">
        <button
          onClick={() => act('approve')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
        >
          {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Approve &amp; Publish
        </button>
        <button
          onClick={() => act('reject')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium disabled:opacity-50"
        >
          {busy === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <p className="text-[10px] text-meta">Approve publishes to The Prompt via the existing publishing mechanism. Atlas records the outcome.</p>
    </section>
  )
}
