'use client'

/**
 * NewsHunter — The Prompt's autonomous news discovery UI.
 *
 * Shows a "Hunt for today's story" button that streams progress via SSE,
 * then displays top candidates with editorial notes. User picks one to
 * kick off the full video pipeline (or retrigger the hunt).
 */

import { useState, useCallback } from 'react'
import { Search, Zap, Radio, ArrowRight, RefreshCw, CheckCircle2, ExternalLink } from 'lucide-react'

interface StoryCandidate {
  rank: number
  editorialNote: string
  suggestedAngle: 'educational' | 'controversial' | 'inspiring' | 'practical'
  estimatedViralityScore: number
  story: {
    title: string
    url: string
    summary: string
    sourceLabel: string
    publishedAt: string
    viralityScore: number
    engagementScore: number
  }
}

interface HuntState {
  status: 'idle' | 'hunting' | 'done' | 'error'
  label: string
  progress: number
  candidates: StoryCandidate[]
  claudeSummary: string
  totalFetched: number
  afterDedup: number
  error?: string
}

const ANGLE_COLORS: Record<string, string> = {
  educational:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  controversial: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  inspiring:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  practical:     'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

interface NewsHunterProps {
  projectId: string
  onSelectStory?: (candidate: StoryCandidate) => void
}

export function NewsHunter({ projectId, onSelectStory }: NewsHunterProps) {
  const [state, setState] = useState<HuntState>({
    status: 'idle',
    label: '',
    progress: 0,
    candidates: [],
    claudeSummary: '',
    totalFetched: 0,
    afterDedup: 0,
  })
  const [selectedRank, setSelectedRank] = useState<number | null>(null)
  const [pipelining, setPipelining] = useState(false)
  const [pipelineId, setPipelineId] = useState<string | null>(null)

  const runHunt = useCallback(async () => {
    setState({ status: 'hunting', label: 'Starting news hunt...', progress: 0, candidates: [], claudeSummary: '', totalFetched: 0, afterDedup: 0 })
    setSelectedRank(null)
    setPipelineId(null)

    try {
      const res = await fetch('/api/media/news/hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, max_candidates: 3 }),
      })

      if (!res.ok || !res.body) {
        setState(s => ({ ...s, status: 'error', error: 'Failed to start hunt' }))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const event = JSON.parse(line.slice(5).trim())

            if (event.step === 'error') {
              setState(s => ({ ...s, status: 'error', error: event.message }))
              return
            }

            if (event.step === 'done') {
              setState({
                status: 'done',
                label: event.label,
                progress: 100,
                candidates: event.candidates ?? [],
                claudeSummary: event.claudeSummary ?? '',
                totalFetched: event.totalFetched ?? 0,
                afterDedup: event.afterDedup ?? 0,
              })
            } else {
              setState(s => ({
                ...s,
                label: event.label ?? s.label,
                progress: event.progress ?? s.progress,
              }))
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [projectId])

  const runPipeline = useCallback(async (candidate: StoryCandidate) => {
    if (pipelining) return
    setPipelining(true)
    setSelectedRank(candidate.rank)

    // Build a synthetic article text from the candidate
    const text = [
      candidate.story.title,
      candidate.story.summary,
      `Source: ${candidate.story.sourceLabel}`,
      `Editorial note: ${candidate.editorialNote}`,
    ].filter(Boolean).join('\n\n')

    try {
      const res = await fetch('/api/media/pipeline/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          project_id: projectId,
          mode: 'lite',   // SimpleNewsReel by default
        }),
      })

      if (!res.ok || !res.body) {
        setPipelining(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const event = JSON.parse(line.slice(5).trim())
            if (event.step === 'done' && event.scriptId) {
              setPipelineId(event.scriptId)
              if (onSelectStory) onSelectStory(candidate)
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setPipelining(false)
    }
  }, [pipelining, projectId, onSelectStory])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <Radio className="w-4 h-4 text-red-400" />
          <span className="font-semibold text-sm">THE PROMPT — News Hunter</span>
        </div>
        {state.status === 'done' && (
          <button
            onClick={runHunt}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Re-hunt
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">

        {/* Idle */}
        {state.status === 'idle' && (
          <div className="text-center py-6">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Scan HN, Reddit &amp; RSS for today&apos;s best AI story
            </p>
            <button
              onClick={runHunt}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Hunt for today&apos;s story
            </button>
          </div>
        )}

        {/* Hunting */}
        {state.status === 'hunting' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-sm text-muted-foreground">{state.label || 'Hunting...'}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {state.status === 'error' && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
            <p className="font-medium mb-1">Hunt failed</p>
            <p className="text-xs opacity-80">{state.error}</p>
            <button onClick={runHunt} className="mt-3 text-xs underline">Try again</button>
          </div>
        )}

        {/* Done */}
        {state.status === 'done' && (
          <div className="space-y-4">
            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Fetched: <strong className="text-foreground">{state.totalFetched}</strong></span>
              <span>Fresh: <strong className="text-foreground">{state.afterDedup}</strong></span>
              <span className="flex-1 italic truncate">&ldquo;{state.claudeSummary}&rdquo;</span>
            </div>

            {/* No candidates */}
            {state.candidates.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No new AI stories today — all sources already processed this week.
              </div>
            )}

            {/* Candidates */}
            {state.candidates.map((c) => {
              const isSelected = selectedRank === c.rank
              const isPipelined = pipelineId && isSelected

              return (
                <div
                  key={c.rank}
                  className={`rounded-lg border p-4 space-y-3 transition-colors ${
                    isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border/80'
                  }`}
                >
                  {/* Story header */}
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-muted-foreground mt-0.5 w-4 shrink-0">#{c.rank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <h3 className="text-sm font-semibold leading-snug flex-1">{c.story.title}</h3>
                        <a
                          href={c.story.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{c.story.sourceLabel}</span>
                        <span>·</span>
                        <span>Score {c.story.viralityScore}/100</span>
                        {c.story.engagementScore > 0 && (
                          <>
                            <span>·</span>
                            <span>{c.story.engagementScore} pts</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Editorial note */}
                  <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                    {c.editorialNote}
                  </p>

                  {/* Angle + CTA */}
                  <div className="flex items-center gap-2 pl-7">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ANGLE_COLORS[c.suggestedAngle] ?? ''}`}>
                      {c.suggestedAngle}
                    </span>

                    {isPipelined ? (
                      <a
                        href={`/projects/${projectId}/media`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Video ready — Review
                      </a>
                    ) : (
                      <button
                        onClick={() => runPipeline(c)}
                        disabled={pipelining}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {pipelining && isSelected ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Generating video...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-3.5 h-3.5" />
                            Use this story
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
