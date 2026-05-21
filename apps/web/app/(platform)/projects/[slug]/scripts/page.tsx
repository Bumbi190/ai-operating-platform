'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, CheckCircle, XCircle, RefreshCw,
  ChevronDown, ChevronUp, Loader2, ImageIcon,
  Play, Download, ExternalLink, Cloud, Search,
  Pencil, Shuffle,
} from 'lucide-react'
import type { MediaScript } from '@/lib/media/types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Väntar granskning', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  approved:       { label: 'Godkänd',           color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  rejected:       { label: 'Avslagen',          color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  published:      { label: 'Publicerad',         color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
}

const VIDEO_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none:       { label: 'Ej renderad',       color: 'text-muted-foreground' },
  rendering:  { label: '⏳ Renderar...',    color: 'text-amber-400' },
  ready:      { label: '🎬 Video klar',     color: 'text-green-400' },
  failed:     { label: '❌ Render fel',     color: 'text-red-400' },
}

// ─── Pipeline step indicator ─────────────────────────────────────────────────

type PipelineStep = 'voice' | 'images' | 'music' | 'done' | null

function PipelineProgress({ step }: { step: PipelineStep }) {
  if (!step) return null

  const steps = [
    { id: 'voice',  label: 'Genererar röst (Victoria)' },
    { id: 'images', label: 'Genererar scener (Ideogram)' },
    { id: 'music',  label: '🎵 Genererar musik' },
    { id: 'done',   label: 'Redo för rendering' },
  ]

  const currentIndex = step === 'done' ? steps.length - 1 : steps.findIndex(s => s.id === step)

  return (
    <div className="border-t border-border px-5 py-3 bg-indigo-500/5">
      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((s, i) => {
          const done   = i < currentIndex || step === 'done'
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
              {i < steps.length - 1 && <div className="w-4 h-px bg-border ml-1 hidden sm:block" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Cloud Render button + progress ─────────────────────────────────────────

type RenderState = 'idle' | 'starting' | 'rendering' | 'ready' | 'failed'

function CloudRenderBlock({
  scriptId,
  onReady,
}: {
  scriptId: string
  onReady: (videoUrl: string) => void
}) {
  const [state, setState]       = useState<RenderState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function start() {
    setState('starting')
    setError(null)
    try {
      const res  = await fetch('/api/media/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId }),
      })
      const data = await res.json() as { renderId?: string; bucketName?: string; error?: string }
      if (!res.ok || !data.renderId) {
        setState('failed')
        setError(data.error ?? 'Kunde inte starta rendering')
        return
      }
      setState('rendering')
      poll(data.renderId, data.bucketName!)
    } catch (err) {
      setState('failed')
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  function poll(renderId: string, bucketName: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(
          `/api/media/render/status/${renderId}?scriptId=${scriptId}&bucketName=${encodeURIComponent(bucketName)}`
        )
        const data = await res.json() as { progress: number; done: boolean; videoUrl?: string; error?: string }
        setProgress(data.progress)
        if (data.done) {
          clearInterval(pollRef.current!)
          if (data.videoUrl) { setState('ready'); onReady(data.videoUrl) }
          else               { setState('failed'); setError(data.error ?? 'Rendering misslyckades') }
        }
      } catch { /* keep polling */ }
    }, 4000)
  }

  if (state === 'idle') return (
    <button
      onClick={start}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
    >
      <Cloud className="w-4 h-4" /> Rendera i molnet
    </button>
  )

  if (state === 'starting' || state === 'rendering') return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {state === 'starting' ? 'Startar Lambda...' : 'Renderar i molnet...'}
        </span>
        <span className="text-emerald-400 font-mono">{progress}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )

  if (state === 'failed') return (
    <div className="space-y-2">
      <p className="text-xs text-red-400">{error ?? 'Rendering misslyckades'}</p>
      <button onClick={start} className="text-xs text-red-400 hover:text-red-300 underline">Försök igen</button>
    </div>
  )

  return null // 'ready' — video player shown by parent
}

// ─── Video Player ─────────────────────────────────────────────────────────────

function VideoPlayer({ url }: { url: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-black">
      <div className="relative" style={{ paddingBottom: '177.78%' /* 9:16 */ }}>
        <video
          src={url}
          controls
          playsInline
          className="absolute inset-0 w-full h-full object-contain"
          style={{ background: '#000' }}
        />
      </div>
    </div>
  )
}

// ─── Script Card ─────────────────────────────────────────────────────────────

function ScriptCard({ script, onUpdate }: {
  script: MediaScript & { media_news_items?: { title: string; virality_score: number } | null }
  onUpdate: () => void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [pipelineStep, setPipelineStep]   = useState<PipelineStep>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [liveVideoUrl, setLiveVideoUrl]   = useState<string | null>(null)

  const statusCfg      = STATUS_LABELS[script.status]
  const videoStatusCfg = VIDEO_STATUS_LABELS[script.video_status ?? 'none']
  const hasImages      = Array.isArray(script.images) && script.images.length > 0
  const hasVideo       = !!(liveVideoUrl ?? (script.video_status === 'ready' && script.video_url))
  const isRenderReady  = script.voice_status === 'ready' && hasImages

  // ── Auto-chain: voice → images ───────────────────────────────────────────
  async function runPipeline(scriptId: string, scriptText: string) {
    setPipelineError(null)
    try {
      setPipelineStep('voice')
      const voiceRes = await fetch('/api/media/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id: scriptId, text: scriptText }),
      })
      if (!voiceRes.ok) {
        const err = await voiceRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Voice failed (${voiceRes.status})`)
      }

      setPipelineStep('images')
      const imgRes = await fetch('/api/media/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_id: scriptId }),
      })
      if (!imgRes.ok) {
        const err = await imgRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Image gen failed (${imgRes.status})`)
      }

      setPipelineStep('music')
      const musicRes = await fetch('/api/media/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId }),
      })
      if (!musicRes.ok) {
        // Music failure is non-fatal — log and continue without music
        console.warn('[pipeline] Music generation failed, continuing without music')
      }

      setPipelineStep('done')
      onUpdate()
      setTimeout(() => { setPipelineStep(null) }, 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setPipelineError(msg)
      setPipelineStep(null)
      onUpdate()
    }
  }

  async function handleApprove() {
    if (!script.script) return
    await fetch(`/api/media/scripts/${script.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
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

  async function rerunPipeline() {
    if (!script.script) return
    runPipeline(script.id, script.script)
  }

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
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Failed (${res.status})`)
      }

      setPipelineStep('music')
      const musicRes = await fetch('/api/media/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id }),
      })
      if (!musicRes.ok) {
        console.warn('[pipeline] Music generation failed, continuing without music')
      }

      setPipelineStep('done')
      onUpdate()
      setTimeout(() => { setPipelineStep(null) }, 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setPipelineError(msg)
      setPipelineStep(null)
    }
  }

  // ── Re-generate image only (re-roll) ────────────────────────────────────────
  async function rerollImage() {
    if (isProcessing) return
    setPipelineError(null)
    setPipelineStep('images')
    try {
      const res = await fetch(`/api/media/scripts/${script.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ what: 'image' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Failed (${res.status})`)
      }
      setPipelineStep('done')
      onUpdate()
      setTimeout(() => setPipelineStep(null), 2500)
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Okänt fel')
      setPipelineStep(null)
    }
  }

  // ── Re-generate script (new hook + body, keeps news item) ───────────────────
  async function rewriteScript() {
    if (isProcessing) return
    setPipelineError(null)
    setPipelineStep('voice')  // will auto-chain voice after rewrite
    try {
      const res = await fetch(`/api/media/scripts/${script.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ what: 'script' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Failed (${res.status})`)
      }
      // Script rewritten — now regenerate voice with new text
      const updated = await res.json() as { script?: string }
      if (updated.script) {
        await runPipeline(script.id, updated.script)
      } else {
        onUpdate()
        setPipelineStep(null)
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Okänt fel')
      setPipelineStep(null)
    }
  }

  const isProcessing = pipelineStep !== null && pipelineStep !== 'done'

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
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
        {script.script && !expanded && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">{script.script}</p>
        )}

        {/* Status row */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {script.estimated_duration && (
            <span className="text-muted-foreground">⏱ {script.estimated_duration}</span>
          )}
          {script.tone && (
            <span className="text-muted-foreground capitalize">🎭 {script.tone}</span>
          )}
          {script.voice_status === 'ready' && (
            <span className="text-green-400">🎙 Victoria ✅</span>
          )}
          {script.voice_status === 'generating' && (
            <span className="text-amber-400">🎙 Genererar...</span>
          )}
          {script.voice_status === 'failed' && (
            <span className="text-red-400">🎙 Röst fel</span>
          )}
          {hasImages && (
            <span className="text-green-400">🎬 {(script.images as string[]).length} scener ✅</span>
          )}
          {script.video_status && script.video_status !== 'none' && (
            <span className={videoStatusCfg.color}>{videoStatusCfg.label}</span>
          )}
        </div>

        {/* Error */}
        {pipelineError && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">
            ⚠️ {pipelineError}
          </p>
        )}
      </div>

      {/* ── Pipeline progress ── */}
      <PipelineProgress step={pipelineStep} />

      {/* ── Video player ── */}
      {hasVideo && expanded && (() => {
        const videoUrl = (liveVideoUrl ?? script.video_url)!
        return (
          <div className="border-t border-border p-5 bg-black/40">
            <p className="text-xs font-medium text-muted-foreground mb-3">Renderad video</p>
            <VideoPlayer url={videoUrl} />
            <div className="mt-3 flex gap-2">
              <a
                href={videoUrl}
                download
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
              >
                <Download className="w-3 h-3" /> Ladda ned MP4
              </a>
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Öppna i ny flik
              </a>
            </div>
          </div>
        )
      })()}

      {/* ── Expanded content ── */}
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
              <div className="flex flex-wrap gap-1.5">
                {script.captions.map((c, i) => (
                  <div key={i} className="text-xs bg-muted rounded-full px-3 py-1">{c}</div>
                ))}
              </div>
            </div>
          )}

          {/* Hashtags + CTA */}
          <div className="flex flex-wrap gap-3">
            {script.hashtags && script.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {script.hashtags.map((h, i) => (
                  <span key={i} className="text-xs bg-indigo-500/10 text-indigo-400 rounded px-2 py-0.5">{h}</span>
                ))}
              </div>
            )}
            {script.cta && (
              <p className="text-xs text-muted-foreground">CTA: <span className="text-foreground">{script.cta}</span></p>
            )}
          </div>

          {/* Audio */}
          {script.audio_url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Röstinspelning — Victoria</p>
              <audio controls src={script.audio_url} className="w-full h-8" />
            </div>
          )}

          {/* Scene thumbnails */}
          {hasImages && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Genererade scener ({(script.images as string[]).length})
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(script.images as string[]).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Scen ${i + 1}`}
                    className="h-28 w-auto rounded-md border border-border shrink-0 object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cloud render */}
          {isRenderReady && !hasVideo && (
            <CloudRenderBlock
              scriptId={script.id}
              onReady={(url) => { setLiveVideoUrl(url); onUpdate() }}
            />
          )}
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Dölj' : 'Visa detaljer'}
          </button>

          {/* Quick video play button when not expanded */}
          {hasVideo && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              <Play className="w-3 h-3" /> Spela video
            </button>
          )}

        </div>

        <div className="flex items-center gap-1.5">
          {/* Pending review */}
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

          {/* Approved but pipeline never ran */}
          {script.status === 'approved' && script.voice_status === 'none' && !isProcessing && (
            <button
              onClick={rerunPipeline}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Kör pipeline
            </button>
          )}

          {/* Has voice but missing images */}
          {script.status === 'approved' && script.voice_status === 'ready' && !hasImages && !isProcessing && (
            <button
              onClick={generateImages}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <ImageIcon className="w-3 h-3" /> Generera bilder
            </button>
          )}

          {/* Re-roll image (approved + has images) */}
          {script.status === 'approved' && hasImages && !isProcessing && (
            <button
              onClick={rerollImage}
              title="Generera ny bakgrundsbild"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Shuffle className="w-3 h-3" /> Ny bild
            </button>
          )}

          {/* Rewrite script (approved) */}
          {script.status === 'approved' && !isProcessing && (
            <button
              onClick={rewriteScript}
              title="Skriv om hook och manus med nytt vinkel"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="w-3 h-3" /> Nytt manus
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
  const [scripts, setScripts] = useState<(MediaScript & {
    media_news_items?: { title: string; virality_score: number } | null
  })[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<string>('all')
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/by-slug/${slug}`)
      .then(r => r.json())
      .then((d: { id?: string }) => setProjectId(d?.id ?? null))
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
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Script Queue</h1>
            <p className="text-sm text-muted-foreground">Godkänn → röst + bilder → render</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${slug}/news`}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Hitta ny nyhet
          </Link>
          <Link
            href={`/projects/${slug}/workflows`}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Generera manus
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
      <div className="flex gap-1 flex-wrap">
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
            Kör &ldquo;Generera manus&rdquo;-workflowet för att skapa innehåll.
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
