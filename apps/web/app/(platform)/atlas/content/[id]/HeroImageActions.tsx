'use client'

/**
 * Atlas → Content Center → detail → Hero image actions (System A, MVP Commit 4).
 *
 * Sibling of ReviewActions. Operator-triggered ONLY; no autonomous generation.
 *
 * Status handling per spec:
 *   pending/null → "Generate Hero Image" button
 *   generating   → disabled "Generating…" with spinner
 *   ready        → show image + "Regenerate Hero Image" button
 *   failed       → error notice + "Retry" button
 *   rejected_qa  → QA feedback + "Regenerate Hero Image" button
 *
 * Always shows the hero image prompt (when present) so the operator knows what
 * will be generated and can decide if the prompt is good enough to fire.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Image as ImageIcon, RotateCw, AlertTriangle, Loader2, Sparkles } from 'lucide-react'

interface Props {
  id: string
  heroImageUrl: string | null
  heroImagePrompt: string | null
  heroImageStatus: string | null
  heroImageQa: Record<string, unknown> | null
}

export function HeroImageActions({
  id,
  heroImageUrl,
  heroImagePrompt,
  heroImageStatus,
  heroImageQa,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  // null in the DB means "no expectation yet" — present it as 'pending' to the
  // operator so the workflow has a clear starting state. saveGeneratedArticle
  // sets 'pending' on new rows; this only handles legacy rows that pre-date the
  // hero columns.
  const status = heroImageStatus ?? 'pending'
  const isBusy = busy || status === 'generating'

  async function trigger() {
    setBusy(true)
    setClientError(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/hero-image`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && data.reason) setClientError(data.reason)
      else if (!res.ok) setClientError(data.error ?? `Request failed (${res.status})`)
      router.refresh()
    } catch (e) {
      setClientError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wide text-sky-300/80 inline-flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> Hero image
        </h2>
        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {status}
        </span>
      </div>

      {/* Prompt — always shown when present so operator knows what's being generated */}
      {heroImagePrompt && (
        <div className="rounded border border-zinc-800 bg-zinc-950 p-2.5">
          <p className="text-[10px] font-mono uppercase text-meta mb-1">Hero image prompt</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{heroImagePrompt}</p>
        </div>
      )}

      {/* Image preview (visible whenever a URL is set, regardless of status) */}
      {heroImageUrl && (
        <div className="rounded border border-zinc-800 overflow-hidden bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt={heroImagePrompt ?? 'Hero image'}
            className="w-full h-auto max-h-[420px] object-contain"
          />
        </div>
      )}

      {/* Failed state */}
      {status === 'failed' && (
        <div className="rounded border border-rose-500/40 bg-rose-500/5 p-2.5 text-xs text-rose-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Generation failed. Press Retry to try again. The Brevo alert email
            has the upstream error detail.
          </span>
        </div>
      )}

      {/* QA-rejected state — reserved for Phase 3; render the report if present */}
      {status === 'rejected_qa' && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-200">
          <p className="font-medium mb-1 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Rejected by image QA
          </p>
          {heroImageQa && Object.keys(heroImageQa).length > 0 ? (
            <pre className="text-[11px] text-amber-100/80 whitespace-pre-wrap mt-1.5 font-mono">
              {JSON.stringify(heroImageQa, null, 2)}
            </pre>
          ) : (
            <p>No QA report available.</p>
          )}
        </div>
      )}

      {/* Client-side error from the last fetch attempt (network, skipped, etc.) */}
      {clientError && (
        <p className="text-xs text-rose-400">{clientError}</p>
      )}

      {/* Action buttons — one primary action per state */}
      <div className="flex gap-2">
        {status === 'pending' && (
          <button
            onClick={trigger}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate Hero Image
          </button>
        )}

        {status === 'generating' && (
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600/40 text-white text-xs font-medium opacity-80 cursor-not-allowed"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…
          </button>
        )}

        {status === 'ready' && (
          <button
            onClick={trigger}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Regenerate Hero Image
          </button>
        )}

        {status === 'failed' && (
          <button
            onClick={trigger}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Retry
          </button>
        )}

        {status === 'rejected_qa' && (
          <button
            onClick={trigger}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Regenerate Hero Image
          </button>
        )}
      </div>

      <p className="text-[10px] text-meta">
        Operator-triggered. Reuses the same Ideogram editorial pipeline as the news reels (cost ~$0.08 per generation).
      </p>
    </section>
  )
}
