'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, Loader2, Image } from 'lucide-react'
import type { MediaScript } from '@/lib/media/types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Väntar granskning', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  approved:       { label: 'Godkänd',           color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  rejected:       { label: 'Avslagen',          color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  published:      { label: 'Publicerad',         color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
}

// ─── Pipeline step indicator ─────────────────────────────────────────────────

type PipelineStep = 'voice' | 'images' | 'done' | null

function PipelineProgress({ step }: { step: PipelineStep }) {
  if (!step) return null

  const steps = [
    { id: 'voice',  label: 'Genererar röst (Victoria)' },
    { id: 'images', label: 'Genererar scener (Ideogram)' },
    { id: 'done',   label: 'Redo för rendering' },
  ]

  const currentIndex = step === 'done' ? 2 : steps.findIndex(s => s.id === step)

  return (
    <div className="border-t border-border px-5 py-3 bg-indigo-500/5">
      <div className="flex items-center gap-3">
        {steps.map((s, i) => {
          const done = i < currentIndex || step === 'done'
          const active = s.id === step
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              {done ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
              ) : active ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
              )}
              <span className={`text-xs ${active ? 'text-indigo-300' : done ? 'text-green-400' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className="w-4 h-px bg-border ml-1" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Script Card ─────────────────────────────────────────────────────────────

function ScriptCard({ script, onUpdate }: {
  script: MediaScript & { media_news_items?: { title: string; virality_score: number } | null }
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const statusCfg = STATUS_LABELS[script.status]

  const hasImages = Array.isArray(script.images) && script.images.length > 0

  // ── Auto-chain: voice → images ───────────────────────────────────────────
  async function runPipeline(scriptId: string, scriptText: string) {
    setPipelineError(null)

    try {
      // Step 1: Voice (Victoria)
      setPipelineStep('voice')
      const voiceRes = await fetch('/api/media/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id: scriptId, text: scriptText }),
        // voice omitted → defaults to 'victoria' in the API
      })
      if (!voiceRes.ok) {
        const err = await voiceRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Voice failed (${voiceRes.status})`)
      }

      // Step 2: Images
      setPipelineStep('images')
      const imgRes = await fetch('/api/media/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id: scriptId }),
      })
      if (!imgRes.ok) {
        const err = await imgRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Image generation failed (${imgRes.status})`)
      }

      // Done!
      setPipelineStep('done')
      onUpdate()

      // Clear "done" indicator after 3s
      setTimeout(() => setPipelineStep(null), 3000)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setPipelineError(msg)
      setPipelineStep(null)
      onUpdate()
    }
  }

  async function handleApprove() {
    if (!script.script) return

    // 1. Update status to approved
    await fetch(`/api/media/scripts/${script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })

    // 2. Immediately kick off voice + image pipeline
    runPipeline(script.id, script.script)
  }

  async function handleReject() {
    await fetch(`/api/media/scripts/${script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    })
    onUpdate()
  }

  // Manual re-trigger for edge cases (already approved but no voice)
  async function rerunPipeline() {
    if (!script.script) return
    runPipeline(script.id, script.script)
  }

  // Manual images-only (already has voice, missing images)
  async function generateImages() {
    setPipelineError(null)
    setPipelineStep('images')
    try {
      const res = await fetch('/api/media/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id: script.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Image generation failed (${res.status})`)
      }
      setPipelineStep('done')
      onUpdate()
      setTimeout(() => setPipelineStep(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setPipelineError(msg)
      setPipelineStep(null)
    }
  }

  const isProcessing = pipelineStep !== null && pipelineStep !== 'done'

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {script.media_news_items && (
              <p className="text-xs text-muted-foreground mb-1 truncate">
                📰 {script.media_news_items.title}
              </p>
            )}
            <p className="text-sm font-semibold leading-snug line-clamp-2">{script.hook ?? '—'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs">v{script.version}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusCfg?.color}`}>
              {statusCfg?.label ?? script.status}
            </span>
          </div>
        </div>

        {/* Script preview */}
        {script.script && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">{script.script}</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {script.estimated_duration && <span>⏱ {script.estimated_duration}</span>}
          {script.tone && <span className="capitalize">🎭 {script.tone}</span>}
          {script.voice_status === 'ready' && <span>🎙 Victoria ✅</span>}
          {script.voice_status === 'generating' && <span>🎙 Genererar röst...</span>}
          {script.voice_status === 'failed' && <span className="text-red-400">🎙 Röst misslyckades</span>}
          {hasImages && <span>🎬 {(script.images as string[]).length} scener ✅</span>}
        </div>

        {/* Pipeline error */}
        {pipelineError && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">
            ⚠️ {pipelineError}
          </p>
        )}
      </div>

      {/* Pipeline progress bar */}
      <PipelineProgress step={pipelineStep} />

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border p-5 space-y-4 bg-muted/20">
          {/* Full script */}
          {script.script && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Fullständigt manus</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{script.script}</p>
            </div>
          )}

          {/* Captions */}
          {script.captions && script.captions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Bildtexter</p>
              <div className="space-y-1">
                {script.captions.map((c, i) => (
                  <div key={i} className="text-xs bg-muted rounded px-3 py-1.5">{c}</div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          {script.cta && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">CTA</p>
              <p className="text-xs">{script.cta}</p>
            </div>
          )}

          {/* Hashtags */}
          {script.hashtags && script.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {script.hashtags.map((h, i) => (
                <span key={i} className="text-xs bg-muted rounded px-2 py-0.5 text-muted-foreground">{h}</span>
              ))}
            </div>
          )}

          {/* Audio player */}
          {script.audio_url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Röstinspelning — Victoria</p>
              <audio controls src={script.audio_url} className="w-full h-8" />
            </div>
          )}

          {/* Scene thumbnails */}
          {hasImages && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Scener ({(script.images as string[]).length})</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(script.images as string[]).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Scen ${i + 1}`}
                    className="h-24 w-auto rounded-md border border-border shrink-0 object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Render input link */}
          {script.voice_status === 'ready' && (
            <a
              href={`/api/media/render-input/${script.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
            >
              📥 Ladda ned render-input.json
            </a>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Dölj' : 'Visa manus'}
        </button>

        <div className="flex items-center gap-1.5">
          {/* Pending review — primary CTA */}
          {script.status === 'pending_review' && (
            <>
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                {isProcessing
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Bearbetar...</>
                  : <><CheckCircle className="w-3 h-3" /> Godkänn →</>
                }
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" /> Avslå
              </button>
            </>
          )}

          {/* Approved but pipeline failed / never ran */}
          {script.status === 'approved' && script.voice_status === 'none' && !isProcessing && (
            <button
              onClick={rerunPipeline}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <Loader2 className="w-3 h-3" /> Kör pipeline
            </button>
          )}

          {/* Has voice but missing images */}
          {script.status === 'approved' && script.voice_status === 'ready' && !hasImages && !isProcessing && (
            <button
              onClick={generateImages}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <Image className="w-3 h-3" /> Generera bilder
            </button>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Bearbetar...
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [scripts, setScripts] = useState<(MediaScript & { media_news_items?: { title: string; virality_score: number } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/by-slug/${slug}`)
      .then(r => r.json())
      .then(d => setProjectId(d?.id ?? null))
      .catch(() => setProjectId(null))
  }, [slug])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const url = new URL('/api/media/scripts', window.location.origin)
    url.searchParams.set('project_id', projectId)
    if (filter !== 'all') url.searchParams.set('status', filter)
    const res = await fetch(url)
    const data = await res.json()
    setScripts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [projectId, filter])

  useEffect(() => { load() }, [load])

  const filters = ['all', 'pending_review', 'approved', 'published', 'rejected']

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Script Queue</h1>
            <p className="text-sm text-muted-foreground">Godkänn → röst + bilder genereras automatiskt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${slug}/workflows`}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Kör Generate Script
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

      {/* Filters */}
      <div className="flex gap-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {f === 'all' ? 'Alla' : STATUS_LABELS[f]?.label ?? f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Laddar...</div>
      ) : scripts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Inga manus ännu</p>
          <p className="text-xs text-muted-foreground">
            Kör &ldquo;Generate Script&rdquo;-workflowet för att skapa manus.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scripts.map(script => (
            <ScriptCard
              key={script.id}
              script={script}
              onUpdate={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
