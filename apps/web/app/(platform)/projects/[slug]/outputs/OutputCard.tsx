'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  ChevronDown, ChevronUp, Image as ImageIcon,
  BookOpen, Zap, Star, Clipboard, Download, Check, Trash2,
  Package, ExternalLink,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface Run {
  id: string
  status: string
  context: Record<string, string> | null
  created_at: string
  finished_at: string | null
  workflows: { name: string } | null
}

interface Props {
  run: Run
}

// Ordered sections — defines display order and metadata
const STEP_META: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'tema',              label: 'Tema',                    icon: Star,      color: 'text-yellow-400'  },
  { key: 'aktiviteter',       label: 'Aktiviteter & Pyssel',    icon: Zap,       color: 'text-blue-400'    },
  { key: 'saga',              label: 'Saga & MP3-manus',        icon: BookOpen,  color: 'text-purple-400'  },
  { key: 'komplement',        label: 'Checklista & Diplom',     icon: Clipboard, color: 'text-orange-400'  },
  { key: 'bilder',            label: 'Färgläggningsbilder',     icon: ImageIcon, color: 'text-green-400'   },
  { key: 'sagabilder',        label: 'Sagaillustrationer',      icon: ImageIcon, color: 'text-indigo-400'  },
  { key: 'aktivitetsbilder',  label: 'Aktivitetsillustrationer',icon: ImageIcon, color: 'text-pink-400'    },
]

// Intermediate pipeline keys that should never be shown to users
// (prompt arrays, sub-outputs, internal context helpers)
const HIDDEN_KEYS = new Set([
  'bildprompts',
  'sagabildprompts',
  'aktivitetsbildprompts',
  'saga_tema',
  'månad',
])


export function OutputCard({ run }: Props) {
  const router = useRouter()
  const [cardExpanded, setCardExpanded] = useState(false)
  const [relativeTime, setRelativeTime] = useState('')
  useEffect(() => {
    setRelativeTime(formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: sv }))
  }, [run.created_at])
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const context = (run.context ?? {}) as Record<string, string>

  // Whether this run has a monthly package ready for export
  const hasMonthlyPackage = !!(context['saga'] && context['saga'].length > 50)

  // Known sections first (in defined order), then any other context keys
  const knownKeys = new Set(STEP_META.map(m => m.key))
  const knownSections = STEP_META.filter(({ key }) => context[key] && context[key].length > 0)
  const unknownSections = Object.entries(context)
    .filter(([key, val]) => !knownKeys.has(key) && !HIDDEN_KEYS.has(key) && val && val.length > 0)
    .map(([key]) => ({
      key,
      label: key,
      icon: Zap,
      color: 'text-zinc-400',
    }))
  const sections = [...knownSections, ...unknownSections]

  if (sections.length === 0) return null

  const workflowName = (run.workflows as any)?.name ?? 'Körning'

  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Ta bort den här körningen? Det går inte att ångra.')) return
    setDeleting(true)
    await fetch(`/api/runs/${run.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header — click to expand/collapse the whole card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCardExpanded((v) => !v)}
        onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? setCardExpanded((v) => !v) : undefined}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors cursor-pointer select-none"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{workflowName}</p>
          <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
            {relativeTime} · {sections.length} delar klara
          </p>
        </div>

        {/* Compact status dots */}
        <div className="hidden sm:flex items-center gap-1">
          {sections.map(({ key, color, icon: Icon }) => (
            <Icon key={key} className={cn('w-3.5 h-3.5', color)} />
          ))}
        </div>

        {/* PDF Export buttons — visible whenever monthly package is ready */}
        {hasMonthlyPackage && (
          <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={`/api/runs/${run.id}/monthly-pdf`}
              target="_blank"
              rel="noopener noreferrer"
              title="Förhandsgranska & spara månadspaket som PDF"
              className="inline-flex items-center gap-1 rounded-md bg-yellow-500/15 hover:bg-yellow-500/30 text-yellow-400 hover:text-yellow-300 text-[11px] font-semibold px-2 py-1 transition-colors"
            >
              <Package className="w-3 h-3" />
              <span className="hidden sm:inline">Månadspaket</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
            <a
              href={`/api/runs/${run.id}/ebook?format=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              title="Förhandsgranska & spara saga som PDF"
              className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold px-2 py-1 transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              <span className="hidden md:inline">Saga</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Ta bort körning"
          className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {cardExpanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Sections — accordion per section */}
      {cardExpanded && (
        <div className="border-t border-border divide-y divide-border">
          {sections.map(({ key, label, icon: Icon, color }) => {
            const isOpen = openSections.has(key)
            return (
              <div key={key}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/10 transition-colors text-left"
                >
                  <Icon className={cn('w-4 h-4 shrink-0', color)} />
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  {isOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                </button>

                {/* Section content */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-1">
                    <SectionContent stepKey={key} content={context[key] ?? ''} runId={run.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function extractMp3Manus(sagaText: string): { mp3: string; pageCount: number } {
  // Extract MP3-MANUS section
  const mp3Match = sagaText.match(/##\s*🎙️\s*MP3-MANUS[^\n]*\n([\s\S]*)$/i)
  const mp3 = mp3Match?.[1]?.trim() ?? ''

  // Count story pages
  const pageMatches = sagaText.match(/\*\*\[Sid\s+\d+\]\*\*|\*\*Sida\s+\d+\*\*/g) ?? []

  return { mp3, pageCount: pageMatches.length }
}

function SectionContent({ stepKey, content, runId }: { stepKey: string; content: string; runId: string }) {
  const [copied, setCopied] = useState(false)

  // Saga — show ONLY MP3-manus + e-bok download buttons
  if (stepKey === 'saga') {
    const { mp3, pageCount } = extractMp3Manus(content)

    const copyMp3 = async () => {
      await navigator.clipboard.writeText(mp3 || content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }

    return (
      <div className="space-y-4">
        {/* Download buttons */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
          {pageCount > 0 && (
            <span className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
              📖 {pageCount} bildsidor
            </span>
          )}
          {/* Månadspaket PDF — allt samlat */}
          <a
            href={`/api/runs/${runId}/monthly-pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            📦 Månadspaket PDF
          </a>
          {/* Saga PDF */}
          <a
            href={`/api/runs/${runId}/ebook?format=pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            📖 Saga PDF
          </a>
          {/* Saga EPUB */}
          <a
            href={`/api/runs/${runId}/ebook?format=epub`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            EPUB
          </a>
        </div>

        {/* MP3-manus — ElevenLabs-text */}
        {mp3 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                🎙️ Berättarmanus — klistra in i ElevenLabs
              </p>
              <button
                onClick={copyMp3}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Kopierat!</> : <><Clipboard className="w-3.5 h-3.5" /> Kopiera allt</>}
              </button>
            </div>
            <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground bg-muted/30 rounded-lg p-4 border border-border max-h-96 overflow-y-auto">
              {mp3}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">MP3-manus saknas i denna körning.</p>
        )}
      </div>
    )
  }



  // Try to detect JSON (e.g. image results, prompt arrays)
  let parsedJson: any = null
  try { parsedJson = JSON.parse(content) } catch { /* not JSON */ }

  if (parsedJson !== null) {
    // Image result object with urls/errors
    if (parsedJson.urls || parsedJson.errors) {
      const urls: string[] = parsedJson.urls ?? []
      const errors: string[] = parsedJson.errors ?? []
      return (
        <div className="space-y-3">
          {urls.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {urls.map((url: string, i: number) => (
                <div key={i} className="rounded-lg overflow-hidden border border-border bg-white aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Bild ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Inga bilder genererade.</p>
          )}
          {errors.length > 0 && (
            <div className="text-xs text-destructive space-y-1">
              {errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      )
    }

    // JSON array of strings (e.g. prompt lists)
    if (Array.isArray(parsedJson) && parsedJson.every((x: any) => typeof x === 'string')) {
      return (
        <ol className="space-y-2 text-sm text-foreground list-decimal pl-5">
          {parsedJson.map((item: string, i: number) => (
            <li key={i} className="leading-relaxed">{item}</li>
          ))}
        </ol>
      )
    }

    // Generic JSON — show formatted
    return (
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words bg-muted/20 rounded-lg p-4 border border-border max-h-96 overflow-y-auto font-mono">
        {JSON.stringify(parsedJson, null, 2)}
      </pre>
    )
  }

  // Plain text / markdown content
  return (
    <div className="prose prose-sm prose-invert max-w-none
      [&>p]:mb-2 [&>p:last-child]:mb-0
      [&>ul]:mb-3 [&>ul]:pl-5 [&>ul>li]:mb-1
      [&>ol]:mb-3 [&>ol]:pl-5 [&>ol>li]:mb-1
      [&>h1]:text-base [&>h1]:font-bold [&>h1]:mb-2 [&>h1]:mt-4
      [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-2 [&>h2]:mt-3
      [&>h3]:text-sm [&>h3]:font-medium [&>h3]:mb-1 [&>h3]:mt-2
      [&>strong]:font-semibold [&>hr]:border-border [&>hr]:my-3
      [&>blockquote]:border-l-2 [&>blockquote]:border-indigo-500 [&>blockquote]:pl-3 [&>blockquote]:text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
