'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { RunLog } from '@/lib/supabase/types'
import { Copy, Check } from 'lucide-react'

interface LogStreamProps {
  runId: string
  initialLogs?: RunLog[]
  initialStatus?: string
}

const roleColors: Record<string, string> = {
  user: 'text-blue-400',
  assistant: 'text-emerald-400',
  system: 'text-yellow-400',
  tool: 'text-purple-400',
}

const roleLabels: Record<string, string> = {
  user: 'input',
  assistant: 'output',
  system: 'system',
  tool: 'tool',
}

/** Detect binary/image content that shouldn't be shown raw */
function isBinaryContent(content: string): boolean {
  if (content.startsWith('data:image/')) return true
  // Long base64-like string
  if (content.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 200))) return true
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed?.urls) || parsed?.b64_json) return true
  } catch { /* not JSON */ }
  return false
}

/** Sanitize log content for display — replace binary blobs with friendly text */
function sanitizeLogContent(content: string): string {
  if (content.startsWith('data:image/')) return '🖼️  [Bild genererad — visas i Utdata]'
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') {
      const urls: string[] = parsed.urls ?? []
      const errors: string[] = parsed.errors ?? []
      // All base64 — replace inline
      const hasBase64 = urls.some((u: string) => u.startsWith('data:'))
      if (urls.length > 0 || errors.length > 0) {
        const parts: string[] = []
        if (urls.length > 0) parts.push(`🖼️  ${urls.length} bild${urls.length > 1 ? 'er' : ''} genererad${urls.length > 1 ? 'e' : ''}`)
        if (errors.length > 0) parts.push(`⚠️  ${errors.length} fel`)
        return parts.join(' · ') + (hasBase64 ? ' (base64 — visas i Utdata)' : '')
      }
      // JSON array of prompts — show truncated
      if (Array.isArray(parsed)) {
        return `[${parsed.length} prompts] ${parsed.map((p: string, i: number) => `\n  ${i + 1}. ${String(p).slice(0, 80)}${String(p).length > 80 ? '…' : ''}`).join('')}`
      }
    }
  } catch { /* not JSON */ }
  // Long base64-like blob
  if (content.length > 500 && /^[A-Za-z0-9+/=\s]{200,}/.test(content)) {
    return `[📦 Binärdata — ${content.length} tecken, dold]`
  }
  return content
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/5 text-secondary hover:text-zinc-300"
      title="Kopiera"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  )
}

export function LogStream({ runId, initialLogs = [], initialStatus = 'running' }: LogStreamProps) {
  const [logs, setLogs] = useState<RunLog[]>(initialLogs)
  const [status, setStatus] = useState(initialStatus)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // SSE connection — only when run is still active
  useEffect(() => {
    if (status === 'done' || status === 'failed') return

    const es = new EventSource(`/api/runs/${runId}/stream`)

    es.onopen = () => setConnected(true)

    es.onmessage = (event) => {
      let data: { type: string; log?: RunLog; status?: string; message?: string }
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      if (data.type === 'log' && data.log) {
        setLogs((prev) => {
          if (prev.some((l) => l.id === data.log!.id)) return prev
          return [...prev, data.log!]
        })
      }

      if (data.type === 'done') {
        setStatus('done')
        setConnected(false)
        es.close()
      }

      if (data.type === 'error') {
        setStatus('failed')
        setConnected(false)
        es.close()
      }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
    }

    return () => es.close()
  }, [runId, status])

  // Derive step info from logs
  const steps = logs.reduce<{ order: number; name: string; done: boolean; tokens?: number; duration?: number }[]>(
    (acc, log) => {
      if (log.role === 'user' && log.step_name != null && log.step_order != null) {
        if (!acc.find((s) => s.order === log.step_order)) {
          acc.push({ order: log.step_order!, name: log.step_name!, done: false })
        }
      }
      if (log.role === 'assistant' && log.step_order != null) {
        const step = acc.find((s) => s.order === log.step_order)
        if (step) {
          step.done = true
          step.tokens = (log.tokens_in ?? 0) + (log.tokens_out ?? 0)
          step.duration = log.duration_ms ?? undefined
        }
      }
      return acc
    },
    [],
  )

  const totalTokens = logs.reduce(
    (sum, l) => sum + (l.tokens_in ?? 0) + (l.tokens_out ?? 0),
    0,
  )

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#080c14] font-mono text-sm overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-900/60">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-secondary ml-1 font-sans">körningslogg</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-sans">
          {connected && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              live
            </span>
          )}
          {status === 'done' && (
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              klar
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              misslyckades
            </span>
          )}
          {status === 'running' && !connected && (
            <span className="text-secondary">ansluter...</span>
          )}
          {totalTokens > 0 && (
            <span className="text-meta">{totalTokens} tokens totalt</span>
          )}
          <span className="text-faint">{logs.length} händelser</span>
        </div>
      </div>

      {/* Step progress bar — only if multiple steps */}
      {steps.length > 1 && (
        <div className="px-4 py-3 border-b border-white/5 bg-zinc-900/30 flex items-center gap-2 font-sans overflow-x-auto">
          {steps.map((step, i) => (
            <div key={step.order} className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors',
                    step.done
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : status === 'running' && i === steps.filter((s) => s.done).length
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 animate-pulse'
                      : 'bg-zinc-800 border-zinc-700 text-secondary',
                  )}
                >
                  {step.done ? '✓' : step.order}
                </div>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      step.done ? 'text-zinc-300' : 'text-secondary',
                    )}
                  >
                    {step.name}
                  </span>
                  {step.done && step.duration != null && (
                    <span className="text-[10px] text-meta">
                      {(step.duration / 1000).toFixed(1)}s
                      {step.tokens != null && ` · ${step.tokens}t`}
                    </span>
                  )}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="w-6 h-px bg-zinc-800 mx-1" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log output */}
      <div className="h-[32rem] overflow-y-auto scrollbar-thin p-4 space-y-2">
        {logs.length === 0 && (
          <div className="flex items-center gap-2.5 text-meta text-xs py-4">
            <span className="w-3 h-3 rounded-full border border-zinc-600 animate-pulse" />
            Väntar på första händelse...
          </div>
        )}

        {logs.map((log, i) => (
          <div key={log.id ?? i} className="animate-fade-in">
            {/* Step separator */}
            {log.role === 'user' && log.step_name && (
              <div className="flex items-center gap-3 mb-3 mt-5 first:mt-0">
                <div className="h-px flex-1 bg-white/5" />
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 font-bold font-sans">
                    {log.step_order}
                  </span>
                  <span className="text-xs text-zinc-400 font-sans font-medium">
                    {log.step_name}
                  </span>
                </div>
                <div className="h-px flex-1 bg-white/5" />
              </div>
            )}

            <div className="flex gap-3 group">
              <span
                className={cn(
                  'shrink-0 text-xs w-14 mt-0.5 text-right',
                  roleColors[log.role] ?? 'text-secondary',
                )}
              >
                [{roleLabels[log.role] ?? log.role}]
              </span>

              <div className="flex-1 min-w-0">
                <pre className="whitespace-pre-wrap break-words text-zinc-200 text-xs leading-relaxed">
                  {sanitizeLogContent(log.content)}
                </pre>

                {/* Token/timing metadata */}
                {(log.tokens_in != null || log.tokens_out != null) && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-meta font-sans">
                    {log.duration_ms != null && (
                      <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    <span>·</span>
                    <span>{(log.tokens_in ?? 0) + (log.tokens_out ?? 0)} tokens</span>
                  </div>
                )}
              </div>

              {/* Copy button for assistant output — only if not binary */}
              {log.role === 'assistant' && !isBinaryContent(log.content) && (
                <div className="shrink-0 mt-0.5">
                  <CopyButton text={log.content} />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Status footer */}
        {status === 'done' && (
          <div className="mt-6 pt-3 border-t border-white/5 text-xs text-green-400 flex items-center gap-2 font-sans">
            <span className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] font-bold">
              ✓
            </span>
            <span>
              Körning klar —{' '}
              {logs.filter((l) => l.role === 'assistant').length} svar
              genererade
              {totalTokens > 0 && ` · ${totalTokens} tokens totalt`}
            </span>
          </div>
        )}

        {status === 'failed' && (
          <div className="mt-6 pt-3 border-t border-white/5 text-xs text-red-400 flex items-center gap-2 font-sans">
            <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center text-[10px] font-bold">
              ✗
            </span>
            <span>Körning misslyckades — se felmeddelande ovan</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
