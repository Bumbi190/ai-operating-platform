'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import type { ReviewItem, ReviewQueueModel } from '@/lib/os/review-queue'
import {
  BLOCKED_REASONS,
  DECISIONS,
  REVISION_NOTE,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  type ReviewDecision,
} from '@/lib/os/review-queue-shared'
import styles from './ReviewQueue.module.css'

/**
 * Granskningar — the global review queue in vNext.
 *
 * An operator queue, not a dashboard: the items lead and the inspector sits
 * beside them. Everything shown is stored — status, kind, output key, the
 * reviewed text, notes, timestamps, the run's own status and its workflow's
 * name, the project's name, slug, colour and stop state. Nothing here scores,
 * ranks, prices or predicts, because Omnira stores none of that for an approval.
 *
 * ONE DECISION PATH. Godkänn / Revidera / Avvisa post to the existing
 * `PATCH /api/approvals/[id]`, which owns the ownership gate, the
 * `resolve_approval` transition and the canonical memory event. This component
 * adds no authority and no second write — and it never claims a decision the
 * server refused: a 409 is rendered as the refusal it is.
 *
 * KEYBOARD STAYS LOCAL. Arrow keys and Enter are bound to the list element
 * only. The shell keeps Esc, the palette and every global binding it already
 * owns, and every action here is reachable by Tab and a button.
 */
export function ReviewQueue({ model }: { model: ReviewQueueModel }) {
  const first = model.queue[0] ?? model.archive[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(first?.id ?? null)
  const [detailOpen, setDetailOpen] = useState(false)
  const listRef = useRef<HTMLUListElement | null>(null)

  const ordered = useMemo(() => [...model.queue, ...model.archive], [model.queue, model.archive])
  const selected = ordered.find((item) => item.id === selectedId) ?? first

  const select = useCallback((id: string, opts?: { open?: boolean }) => {
    setSelectedId(id)
    if (opts?.open) setDetailOpen(true)
  }, [])

  // Arrow/Enter handling lives on the list, so it can never become a global
  // router: outside this element the keys mean whatever the shell says.
  const onListKeyDown = useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
    const index = ordered.findIndex((item) => item.id === selectedId)
    if (event.key === 'Enter') {
      if (index >= 0) { event.preventDefault(); setDetailOpen(true) }
      return
    }
    if (ordered.length === 0) return
    event.preventDefault()
    const next = event.key === 'ArrowDown'
      ? Math.min(ordered.length - 1, index < 0 ? 0 : index + 1)
      : Math.max(0, index < 0 ? 0 : index - 1)
    const target = ordered[next]
    if (!target) return
    setSelectedId(target.id)
    listRef.current?.querySelector<HTMLElement>(`[data-item-id="${target.id}"]`)?.focus()
  }, [ordered, selectedId])

  return (
    <div className={styles.field} data-detail={detailOpen ? 'open' : 'closed'}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Operatörskö</p>
          <h1 className={styles.title}>Granskningar</h1>
          <p className={styles.lede}>
            Väntande beslut i projekten du äger. Godkänn, revidera eller avvisa — besluten går genom
            samma körningsväg som resten av Omnira.
          </p>
        </div>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Väntar</dt>
            <dd>{model.state === 'error' ? UNKNOWN_LABEL : model.queue.length}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Avgjorda</dt>
            <dd>{model.state === 'error' ? UNKNOWN_LABEL : model.archive.length}</dd>
          </div>
          {model.filter ? (
            <div className={styles.fact} data-filter="on">
              <dt>Filter</dt>
              <dd>{model.filter.slug}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className={styles.workspace}>
        <section className={styles.queue} aria-labelledby="review-queue-heading">
          <div className={styles.sectionHead}>
            <h2 id="review-queue-heading" className={styles.sectionTitle}>Kö</h2>
            {model.state === 'ok' && model.total !== null
              ? <span className={styles.count}>{model.total}</span>
              : null}
          </div>

          {model.state === 'error' ? (
            <p className={styles.note} role="note" data-tone="error">
              Granskningar {UNREADABLE_LABEL.toLowerCase()}. Kön är inte tom — den gick inte att läsa.
            </p>
          ) : ordered.length === 0 ? (
            <p className={styles.note} role="note">
              {model.filter
                ? `Inga granskningar för projektet "${model.filter.slug}".`
                : 'Inga granskningar att visa. Utdata som kräver operatörsbeslut hamnar här.'}
            </p>
          ) : (
            <>
              {model.queue.length === 0 ? (
                <p className={styles.note} role="note">Inget väntar på beslut just nu.</p>
              ) : null}
              <ul
                ref={listRef}
                className={styles.rows}
                onKeyDown={onListKeyDown}
                aria-label="Granskningsobjekt"
              >
                {ordered.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    selected={item.id === selected?.id}
                    onSelect={select}
                  />
                ))}
              </ul>
              {model.truncated && model.total !== null ? (
                <p className={styles.more}>Visar {ordered.length} av {model.total}.</p>
              ) : null}
            </>
          )}
        </section>

        <aside className={styles.inspector} aria-label="Granskningsdetaljer">
          {model.state === 'error' ? (
            <p className={styles.note} role="note" data-tone="error">
              Detaljer {UNREADABLE_LABEL.toLowerCase()}.
            </p>
          ) : selected ? (
            <Inspector item={selected} onClose={() => setDetailOpen(false)} />
          ) : (
            <p className={styles.note} role="note">Välj en granskning för att se detaljer.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

/** The queue's skeleton. Distinct from empty: this one says it is loading. */
export function ReviewQueueLoading() {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Operatörskö</p>
          <h1 className={styles.title}>Granskningar</h1>
        </div>
      </header>
      <p className={styles.note} role="status">Läser granskningar …</p>
    </div>
  )
}

function QueueRow({
  item, selected, onSelect,
}: {
  item: ReviewItem
  selected: boolean
  onSelect: (id: string, opts?: { open?: boolean }) => void
}) {
  return (
    <li className={styles.row} data-selected={selected ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.rowButton}
        data-item-id={item.id}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(item.id, { open: true })}
      >
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{item.outputKey ?? item.kind ?? 'Utan utdatanyckel'}</span>
          <span className={styles.rowMeta}>
            {item.project ? (
              <span className={styles.projectMark}>
                <span
                  className={styles.projectDot}
                  style={{ background: item.project.color }}
                  aria-hidden
                />
                {item.project.name}
              </span>
            ) : (
              <span className={styles.projectMark}>Projekt {UNKNOWN_LABEL.toLowerCase()}</span>
            )}
            {item.createdAt ? <> · <Rel iso={item.createdAt} /></> : null}
          </span>
        </span>
        <StatusChip item={item} />
      </button>
    </li>
  )
}

function StatusChip({ item }: { item: ReviewItem }) {
  return (
    <span className={styles.chip} data-class={item.statusClass} title={item.status || undefined}>
      {item.statusLabel}
      {item.statusClass === 'unknown' && item.status ? (
        <span className={styles.chipRaw}> ({item.status})</span>
      ) : null}
    </span>
  )
}

function Inspector({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <button type="button" className={styles.back} onClick={onClose}>← Tillbaka till kön</button>
        <h2 className={styles.detailTitle}>{item.outputKey ?? item.kind ?? 'Granskning'}</h2>
        <StatusChip item={item} />
      </div>

      <dl className={styles.meta}>
        <Meta label="Typ" value={item.kind} />
        <Meta label="Utdatanyckel" value={item.outputKey} />
        <Meta label="Status" value={item.status || null} />
        <Meta label="Skapad" value={item.createdAt} kind="time" />
        <Meta label="Granskad" value={item.reviewedAt} kind="time" />
        <Meta label="Avgjord" value={item.decidedAt} kind="time" />
        <Meta label="Körningens status" value={item.runStatus} />
        <Meta label="Åtgärdstyp" value={item.runActionKind} />
        <Meta label="Arbetsflöde" value={item.workflowName} />
      </dl>

      {item.project ? (
        <p className={styles.projectLine}>
          <span className={styles.projectDot} style={{ background: item.project.color }} aria-hidden />
          {item.project.href
            ? <Link href={item.project.href} className={styles.inlineLink}>{item.project.name}</Link>
            : <span>{item.project.name}</span>}
          <span className={styles.slug}>{item.project.slug}</span>
          {item.project.paused ? (
            <span className={styles.pause}>
              Projektstopp aktivt{item.project.pausedReason ? ` — ${item.project.pausedReason}` : ''}
            </span>
          ) : null}
        </p>
      ) : (
        <p className={styles.note} role="note">Projekt {UNKNOWN_LABEL.toLowerCase()} för denna post.</p>
      )}

      {item.runHref ? (
        <p className={styles.more}>
          <Link href={item.runHref} className={styles.inlineLink}>Öppna körningen</Link>
        </p>
      ) : null}

      <section className={styles.contentBlock} aria-label="Granskat innehåll">
        <h3 className={styles.blockTitle}>Innehåll</h3>
        {item.content.trim() === ''
          ? <p className={styles.note} role="note">Inget lagrat innehåll.</p>
          : <pre className={styles.content}>{item.content}</pre>}
      </section>

      {item.reviewerNotes ? (
        <section className={styles.contentBlock} aria-label="Granskarens anteckningar">
          <h3 className={styles.blockTitle}>Anteckningar</h3>
          <p className={styles.notes}>{item.reviewerNotes}</p>
        </section>
      ) : null}

      <DecisionPanel item={item} />
    </div>
  )
}

function Meta({ label, value, kind }: { label: string; value: string | null; kind?: 'time' }) {
  return (
    <div className={styles.metaItem}>
      <dt>{label}</dt>
      <dd>
        {value == null
          ? <span className={styles.absent}>{UNKNOWN_LABEL.toLowerCase()}</span>
          : kind === 'time' ? <Rel iso={value} /> : value}
      </dd>
    </div>
  )
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working'; action: ReviewDecision }
  | { kind: 'done'; message: string }
  | { kind: 'stale'; message: string }
  | { kind: 'error'; message: string }

function DecisionPanel({ item }: { item: ReviewItem }) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  const decide = useCallback(async (action: ReviewDecision) => {
    setOutcome({ kind: 'working', action })
    try {
      const res = await fetch(`/api/approvals/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewer_notes: notes.trim() || undefined }),
      })
      const payload = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) {
        // The route answers 409 when this caller did not win the transition.
        // That is the server's answer and it is shown as such — never as success.
        setOutcome({
          kind: res.status === 409 ? 'stale' : 'error',
          message: payload?.error ?? 'Beslutet gick inte igenom.',
        })
        router.refresh()
        return
      }
      setOutcome({ kind: 'done', message: 'Beslutet registrerades.' })
      setNotes('')
      router.refresh()
    } catch {
      setOutcome({ kind: 'error', message: 'Beslutet gick inte att skicka.' })
    }
  }, [item.id, notes, router])

  if (!item.decidable) {
    return (
      <section className={styles.decide} aria-label="Beslut">
        <p className={styles.note} role="note" data-tone="warning">
          {item.blockedReason ? BLOCKED_REASONS[item.blockedReason] : BLOCKED_REASONS.terminal}
        </p>
      </section>
    )
  }

  const working = outcome.kind === 'working'
  return (
    <section className={styles.decide} aria-label="Beslut">
      <label className={styles.notesLabel} htmlFor={`review-notes-${item.id}`}>
        Anteckning till beslutet (valfri)
      </label>
      <textarea
        id={`review-notes-${item.id}`}
        className={styles.notesInput}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        placeholder="Skickas med beslutet och sparas på granskningen."
      />
      <div className={styles.actions}>
        {DECISIONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            className={styles.action}
            data-action={action}
            disabled={working}
            onClick={() => decide(action)}
          >
            {working && outcome.action === action ? 'Skickar …' : label}
          </button>
        ))}
      </div>
      <p className={styles.revisionNote}>{REVISION_NOTE}</p>
      <p className={styles.outcome} role="status" data-kind={outcome.kind}>
        {outcome.kind === 'done' || outcome.kind === 'stale' || outcome.kind === 'error'
          ? outcome.message
          : ''}
      </p>
    </section>
  )
}

function Rel({ iso }: { iso: string }) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return <span>{UNKNOWN_LABEL.toLowerCase()} tidpunkt</span>
  return (
    <time dateTime={iso} title={iso}>
      {formatDistanceToNow(at, { addSuffix: true, locale: sv })}
    </time>
  )
}
