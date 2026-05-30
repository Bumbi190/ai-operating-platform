'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles, CheckCircle, Loader2, AlertCircle, Video, Cloud, Play, Download } from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineEvent {
  step: string
  label?: string
  progress?: number
  scriptId?: string
  hook?: string
  renderInputUrl?: string
  durationMs?: number
  imageCount?: number
  message?: string
}

interface StepStatus {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

type RenderState = 'idle' | 'starting' | 'rendering' | 'ready' | 'failed'

const PIPELINE_STEPS: StepStatus[] = [
  { id: 'analyzing',  label: 'Analyserar artikel',          status: 'pending' },
  { id: 'scripting',  label: 'Skriver manus (Claude)',       status: 'pending' },
  { id: 'voice',      label: 'Genererar röst (Victoria)',    status: 'pending' },
  { id: 'images',     label: 'Genererar scener (Ideogram)',  status: 'pending' },
  { id: 'done',       label: 'Redo att rendera',             status: 'pending' },
]

const STEP_ORDER = [
  'analyzing', 'news_done', 'scripting', 'script_done',
  'voice', 'uploading_audio', 'voice_done',
  'images', 'uploading_images', 'done',
]

function stepToDisplay(step: string): string {
  if (['analyzing', 'news_done'].includes(step))                     return 'analyzing'
  if (['scripting', 'script_done'].includes(step))                   return 'scripting'
  if (['voice', 'uploading_audio', 'voice_done'].includes(step))     return 'voice'
  if (['images', 'uploading_images'].includes(step))                 return 'images'
  if (step === 'done')                                               return 'done'
  return ''
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GenerateVideoPage() {
  const params    = useParams()
  const slug      = params.slug as string

  const [projectId, setProjectId]       = useState<string | null>(null)
  const [text, setText]                 = useState('')
  const [running, setRunning]           = useState(false)
  const [steps, setSteps]               = useState<StepStatus[]>(PIPELINE_STEPS)
  const [currentLabel, setCurrentLabel] = useState('')
  const [progress, setProgress]         = useState(0)
  const [result, setResult]             = useState<PipelineEvent | null>(null)
  const [error, setError]               = useState<string | null>(null)

  // Cloud render state
  const [renderState, setRenderState]   = useState<RenderState>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [videoUrl, setVideoUrl]         = useState<string | null>(null)
  const [renderError, setRenderError]   = useState<string | null>(null)
  const renderPollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const renderIdsRef                    = useRef<{ renderId: string; bucketName: string } | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch(`/api/projects/by-slug/${slug}`)
      .then(r => r.json())
      .then((d: { id?: string }) => setProjectId(d?.id ?? null))
      .catch(() => {})
  }, [slug])

  // Clean up render poll on unmount
  useEffect(() => {
    return () => { if (renderPollRef.current) clearInterval(renderPollRef.current) }
  }, [])

  const updateStep = useCallback((displayId: string, status: StepStatus['status']) => {
    setSteps(prev => prev.map(s => {
      if (s.id === displayId) return { ...s, status }
      if (status === 'active') {
        const prevIdx = PIPELINE_STEPS.findIndex(p => p.id === s.id)
        const thisIdx = PIPELINE_STEPS.findIndex(p => p.id === displayId)
        if (prevIdx < thisIdx && s.status !== 'done') return { ...s, status: 'done' }
      }
      return s
    }))
  }, [])

  // ── Pipeline generation ──────────────────────────────────────────────────────

  async function generate() {
    if (!text.trim() || !projectId || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress(0)
    setRenderState('idle')
    setVideoUrl(null)
    setRenderError(null)
    setSteps(PIPELINE_STEPS.map(s => ({ ...s, status: 'pending' })))
    setCurrentLabel('Startar pipeline...')

    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/media/pipeline/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, project_id: projectId }),
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(`API fel ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as PipelineEvent
            if (event.progress !== undefined) setProgress(event.progress)
            if (event.label) setCurrentLabel(event.label)
            const displayStep = stepToDisplay(event.step)
            if (displayStep) {
              if (event.step === 'done') {
                setSteps(prev => prev.map(s => ({ ...s, status: 'done' })))
                setResult(event)
              } else {
                updateStep(displayStep, 'active')
              }
            }
            if (event.step === 'error') setError(event.message ?? 'Pipeline misslyckades')
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Okänt fel')
      }
    } finally {
      setRunning(false)
    }
  }

  // ── Cloud render ─────────────────────────────────────────────────────────────

  async function startCloudRender() {
    if (!result?.scriptId) return
    setRenderState('starting')
    setRenderError(null)
    setRenderProgress(0)

    try {
      const res = await fetch('/api/media/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: result.scriptId }),
      })
      const data = await res.json() as { renderId?: string; bucketName?: string; error?: string }

      if (!res.ok || !data.renderId) {
        setRenderState('failed')
        setRenderError(data.error ?? 'Kunde inte starta rendering')
        return
      }

      renderIdsRef.current = { renderId: data.renderId, bucketName: data.bucketName! }
      setRenderState('rendering')
      pollRenderStatus(data.renderId, data.bucketName!, result.scriptId)
    } catch (err) {
      setRenderState('failed')
      setRenderError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  function pollRenderStatus(renderId: string, bucketName: string, scriptId: string) {
    if (renderPollRef.current) clearInterval(renderPollRef.current)

    renderPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/media/render/status/${renderId}?scriptId=${scriptId}&bucketName=${encodeURIComponent(bucketName)}`
        )
        const data = await res.json() as {
          progress: number
          done: boolean
          videoUrl?: string
          error?: string
        }

        setRenderProgress(data.progress)

        if (data.done) {
          clearInterval(renderPollRef.current!)
          if (data.videoUrl) {
            setVideoUrl(data.videoUrl)
            setRenderState('ready')
          } else {
            setRenderState('failed')
            setRenderError(data.error ?? 'Rendering misslyckades')
          }
        }
      } catch {
        // transient fetch error — keep polling
      }
    }, 4000)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const ready    = !running && !!text.trim() && !!projectId
  const wordEst  = text.trim().split(/\s+/).filter(Boolean).length
  const charCount = text.length

  return (
    <OSPage>

      {/* Header */}
      <OSLayer layer="hero" className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <Video className="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Generate Video</h1>
          <p className="text-sm text-muted-foreground">
            Klistra in en artikel → manus + röst + bilder + molnrendering
          </p>
        </div>
      </OSLayer>

      <OSLayer layer="operational" className="space-y-6 max-w-4xl 3xl:max-w-5xl">
      {/* Input */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Artikel / nyhet
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={running}
          placeholder={`Klistra in hela artikeltexten, eller skriv en beskrivning av nyheten.\n\nExempel:\n"OpenAI released GPT-5 today with 10x better reasoning than GPT-4..."`}
          className="w-full h-52 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-muted-foreground/40 disabled:opacity-50"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{wordEst} ord · {charCount} tecken</span>
          {!projectId && <span className="text-amber-400">⚠ Laddar projekt...</span>}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={!ready}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {running
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Genererar (~2 min)...</>
          : <><Sparkles className="w-4 h-4" /> Generera video</>
        }
      </button>

      {/* Pipeline progress */}
      {(running || result || error) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-1 bg-border">
            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="p-5 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">{currentLabel}</p>
            <div className="space-y-2">
              {steps.map(step => (
                <div key={step.id} className="flex items-center gap-2.5">
                  {step.status === 'done'   ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  : step.status === 'active' ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                  : step.status === 'error'  ? <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  : <div className="w-4 h-4 rounded-full border border-border shrink-0" />}
                  <span className={`text-sm ${
                    step.status === 'done'   ? 'text-green-400'
                    : step.status === 'active' ? 'text-foreground font-medium'
                    : step.status === 'error'  ? 'text-red-400'
                    : 'text-muted-foreground'
                  }`}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="border-t border-border px-5 py-4 bg-red-500/5">
              <p className="text-sm text-red-400 font-medium">Pipeline misslyckades</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          )}

          {/* ── Pipeline done — Cloud render block ── */}
          {result && !error && (
            <div className="border-t border-border p-5 space-y-5">

              {/* Hook preview */}
              {result.hook && (
                <div className="rounded-lg bg-indigo-500/8 border border-indigo-500/20 px-4 py-3">
                  <p className="text-xs text-indigo-400 font-medium mb-1">Hook</p>
                  <p className="text-sm font-semibold">{result.hook}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {result.imageCount} scener · {result.durationMs ? (result.durationMs / 1000).toFixed(1) : '—'}s
                  </p>
                </div>
              )}

              {/* ── Video player (when ready) ── */}
              {renderState === 'ready' && videoUrl && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-green-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Video klar!
                  </p>
                  <div className="rounded-xl overflow-hidden border border-border bg-black aspect-[9/16] max-w-[280px] mx-auto">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full object-cover"
                      playsInline
                    />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <a
                      href={videoUrl}
                      download
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-white/5 border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Ladda ned MP4
                    </a>
                    <a
                      href={`/projects/${slug}/scripts`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      → Gå till godkännande
                    </a>
                  </div>
                </div>
              )}

              {/* ── Render button / progress ── */}
              {renderState === 'idle' && (
                <button
                  onClick={startCloudRender}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
                >
                  <Cloud className="w-4 h-4" /> Rendera i molnet
                </button>
              )}

              {(renderState === 'starting' || renderState === 'rendering') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {renderState === 'starting' ? 'Startar Lambda...' : `Renderar i molnet...`}
                    </span>
                    <span className="text-indigo-400 font-mono">{renderProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    ~3–5 minuter · du kan stänga webbläsaren och komma tillbaka
                  </p>
                </div>
              )}

              {renderState === 'failed' && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3 space-y-2">
                  <p className="text-sm text-red-400 font-medium">Rendering misslyckades</p>
                  {renderError && <p className="text-xs text-muted-foreground">{renderError}</p>}
                  <button
                    onClick={startCloudRender}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                  >
                    Försök igen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      {!running && !result && (
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Vad händer när du klickar?</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-indigo-400 shrink-0">1.</span>
              <span>Claude analyserar nyheten och hittar vinkeln</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-400 shrink-0">2.</span>
              <span>Claude skriver TikTok/Reels-manus (~65s)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-400 shrink-0">3.</span>
              <span>Victoria läser upp med ordtiming</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-400 shrink-0">4.</span>
              <span>5 cinematic scener genereras av Ideogram</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            Renderas i molnet — ingen terminal behövs
          </p>
        </div>
      )}
      </OSLayer>
    </OSPage>
  )
}
