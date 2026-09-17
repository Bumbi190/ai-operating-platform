'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Package,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceOutputRun } from '@/lib/os/project-workspace'
import styles from './ProjectWorkspace.module.css'

const STEP_META = [
  { key: 'tema', label: 'Tema', icon: Star },
  { key: 'aktiviteter', label: 'Aktiviteter & Pyssel', icon: Zap },
  { key: 'saga', label: 'Saga & MP3-manus', icon: BookOpen },
  { key: 'komplement', label: 'Checklista & Diplom', icon: Clipboard },
  { key: 'bilder', label: 'Färgläggningsbilder', icon: ImageIcon },
  { key: 'sagabilder', label: 'Sagaillustrationer', icon: ImageIcon },
  { key: 'aktivitetsbilder', label: 'Aktivitetsillustrationer', icon: ImageIcon },
] as const

const HIDDEN_KEYS = new Set([
  'bildprompts', 'sagabildprompts', 'aktivitetsbildprompts', 'saga_tema', 'månad',
])

function toDisplayString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function OutputRunCard({ run }: { run: WorkspaceOutputRun }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [relativeTime, setRelativeTime] = useState('')

  useEffect(() => {
    setRelativeTime(formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: sv }))
  }, [run.createdAt])

  const context = run.context ?? {}
  const knownKeys = new Set<string>(STEP_META.map((entry) => entry.key))
  const knownSections = STEP_META.filter(({ key }) => toDisplayString(context[key]).length > 0)
  const unknownSections = Object.entries(context)
    .filter(([key, value]) => !knownKeys.has(key) && !HIDDEN_KEYS.has(key) && toDisplayString(value).length > 0)
    .map(([key]) => ({ key, label: key, icon: Zap }))
  const sections = [...knownSections, ...unknownSections]
  const saga = toDisplayString(context.saga)
  const hasMonthlyPackage = saga.length > 50

  if (sections.length === 0) return null

  function toggleSection(key: string) {
    setOpenSections((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function deleteRun() {
    // Existing semantics, stated plainly: this deletes the whole run, not one
    // visible context section and not one canonical outputs-table row.
    if (!window.confirm('Ta bort hela körningen och dess lagrade resultat? Det går inte att ångra.')) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/runs/${run.id}`, { method: 'DELETE' })
      if (!response.ok) {
        setDeleting(false)
        return
      }
      router.refresh()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <article className={styles.outputCard}>
      <div className={styles.outputHead}>
        <button
          type="button"
          className={styles.outputToggle}
          aria-expanded={expanded}
          aria-controls={`output-${run.id}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className={styles.outputIdentity}>
            <span className={styles.outputName}>{run.workflowName ?? 'Körning utan workflow'}</span>
            <span className={styles.outputMeta} suppressHydrationWarning>
              {relativeTime || 'Tidpunkt läses'} · {sections.length} delar i run context
            </span>
          </span>
          <ChevronDown className={styles.outputChevron} data-open={expanded || undefined} size={17} aria-hidden="true" />
        </button>

        <div className={styles.outputActions}>
          {run.runHref ? <Link href={run.runHref} className={styles.iconAction} title="Visa källkörning"><ExternalLink size={15} /><span className={styles.srOnly}>Visa källkörning</span></Link> : null}
          {hasMonthlyPackage ? (
            <>
              <a href={`/api/runs/${run.id}/monthly-pdf`} target="_blank" rel="noopener noreferrer" className={styles.iconAction} title="Öppna månadspaket som PDF"><Package size={15} /><span className={styles.srOnly}>Månadspaket PDF</span></a>
              <a href={`/api/runs/${run.id}/ebook?format=pdf`} target="_blank" rel="noopener noreferrer" className={styles.iconAction} title="Öppna saga som PDF"><BookOpen size={15} /><span className={styles.srOnly}>Saga PDF</span></a>
            </>
          ) : null}
          <button type="button" onClick={deleteRun} disabled={deleting} className={styles.deleteAction} title="Ta bort hela körningen">
            <Trash2 size={15} aria-hidden="true" />
            <span className={styles.srOnly}>Ta bort hela körningen</span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={`output-${run.id}`} className={styles.outputSections}>
          <p className={styles.outputTruth}>Visar lagrade värden från denna körnings <code>runs.context</code>.</p>
          {sections.map(({ key, label, icon: Icon }) => {
            const open = openSections.has(key)
            return (
              <section key={key} className={styles.outputSection}>
                <button
                  type="button"
                  className={styles.outputSectionToggle}
                  aria-expanded={open}
                  onClick={() => toggleSection(key)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                  <ChevronDown size={15} data-open={open || undefined} aria-hidden="true" />
                </button>
                {open ? <SectionContent stepKey={key} content={toDisplayString(context[key])} runId={run.id} /> : null}
              </section>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

function extractMp3Manus(sagaText: string): { mp3: string; pageCount: number } {
  const mp3Match = sagaText.match(/##\s*🎙️\s*MP3-MANUS[^\n]*\n([\s\S]*)$/i)
  const pageMatches = sagaText.match(/\*\*\[Sid\s+\d+\]\*\*|\*\*Sida\s+\d+\*\*/g) ?? []
  return { mp3: mp3Match?.[1]?.trim() ?? '', pageCount: pageMatches.length }
}

function SectionContent({ stepKey, content, runId }: { stepKey: string; content: string; runId: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  if (stepKey === 'saga') {
    const { mp3, pageCount } = extractMp3Manus(content)
    return (
      <div className={styles.sectionContent}>
        <div className={styles.exportRow}>
          {pageCount > 0 ? <span className={styles.chip}>{pageCount} bildsidor</span> : null}
          <a href={`/api/runs/${runId}/monthly-pdf`} target="_blank" rel="noopener noreferrer" className={styles.textAction}><Download size={14} /> Månadspaket PDF</a>
          <a href={`/api/runs/${runId}/ebook?format=pdf`} target="_blank" rel="noopener noreferrer" className={styles.textAction}><Download size={14} /> Saga PDF</a>
          <a href={`/api/runs/${runId}/ebook?format=epub`} download className={styles.textAction}><Download size={14} /> EPUB</a>
        </div>
        {mp3 ? (
          <div>
            <div className={styles.contentHead}>
              <p>Berättarmanus</p>
              <button type="button" className={styles.copyAction} onClick={() => copy(mp3)}>
                {copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Kopierat' : 'Kopiera allt'}
              </button>
            </div>
            <pre className={styles.pre}>{mp3}</pre>
          </div>
        ) : <p className={styles.muted}>MP3-manus saknas i denna körning.</p>}
      </div>
    )
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(content) } catch { parsed = null }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const result = parsed as { urls?: unknown; errors?: unknown }
    if (Array.isArray(result.urls) || Array.isArray(result.errors)) {
      const urls = Array.isArray(result.urls) ? result.urls.filter((url): url is string => typeof url === 'string') : []
      const errors = Array.isArray(result.errors) ? result.errors.filter((error): error is string => typeof error === 'string') : []
      return (
        <div className={styles.sectionContent}>
          {urls.length > 0 ? (
            <div className={styles.imageGrid}>
              {urls.map((url, index) => (
                <div key={`${url.slice(0, 32)}-${index}`} className={styles.imageFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Genererad bild ${index + 1}`} />
                </div>
              ))}
            </div>
          ) : <p className={styles.muted}>Inga bilder genererade.</p>}
          {errors.map((error, index) => <p key={index} className={styles.outputError}>{error}</p>)}
        </div>
      )
    }
  }

  if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
    return <ol className={styles.plainList}>{parsed.map((item, index) => <li key={index}>{item}</li>)}</ol>
  }

  if (parsed !== null) return <pre className={styles.pre}>{JSON.stringify(parsed, null, 2)}</pre>

  return (
    <div className={styles.markdown}>
      <div className={styles.contentHead}>
        <span />
        <button type="button" className={styles.copyAction} onClick={() => copy(content)}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Kopierat' : 'Kopiera'}
        </button>
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
