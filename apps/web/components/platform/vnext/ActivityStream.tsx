/**
 * Aktivitet — the operator's chronological activity surface.
 *
 * A server component. It renders what `lib/os/activity.ts` read and nothing
 * more: no derived score, no inferred agent, no "healthy", no gap filled in
 * because a row looked empty. Where a fact is absent the surface says it is
 * absent, and where a source could not be read it says that instead.
 *
 * The order of the page is the order an operator asks the questions: what needs
 * me, what is running, then what has happened — and each entry carries the way
 * back to the row it came from.
 */

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

import {
  AGENT_ATTRIBUTION_NOTE,
  EMPTY_STREAM_BODY,
  EMPTY_STREAM_TITLE,
  NOT_OBSERVED_NOTE,
  STEP_DETAIL_NOTE,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  TIME_SOURCE_LABELS,
  runStateLabel,
} from '@/lib/os/activity-shared'
import { statusLabel as reviewStatusLabel } from '@/lib/os/review-queue-shared'
import type { ActivityEntry, ActivityModel, ActivityRunEntry } from '@/lib/os/activity'
import styles from './ActivityStream.module.css'

function when(iso: string | null): string {
  if (!iso) return UNKNOWN_LABEL
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return UNKNOWN_LABEL
  return formatDistanceToNow(d, { addSuffix: true, locale: sv })
}

function ProjectTag({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className={styles.projectUnknown}>Projekt {UNKNOWN_LABEL.toLowerCase()}</span>
  return (
    <span className={styles.project}>
      <span className={styles.dot} style={color ? { background: color } : undefined} aria-hidden />
      {name}
    </span>
  )
}

function EntryCard({ entry }: { entry: ActivityEntry }) {
  const title =
    entry.kind === 'run'
      ? entry.workflowName ?? `Arbetsflöde ${UNKNOWN_LABEL.toLowerCase()}`
      : entry.outputKey ?? 'Granskning'

  const stateLabel =
    entry.kind === 'run' ? runStateLabel(entry.status) : reviewStatusLabel(entry.status)

  return (
    <li className={styles.entry} data-tone={entry.tone} data-kind={entry.kind}>
      <div className={styles.entryHead}>
        <div className={styles.entryIdentity}>
          <span className={styles.kind}>{entry.kind === 'run' ? 'Körning' : 'Granskning'}</span>
          <h3 className={styles.entryTitle}>{title}</h3>
        </div>
        <span className={styles.state} data-tone={entry.tone}>
          {stateLabel}
          {/* An unrecognised status is shown, not hidden behind its fallback label. */}
          {entry.status && stateLabel !== entry.status && (
            <code className={styles.raw}>{entry.status}</code>
          )}
        </span>
      </div>

      <div className={styles.entryMeta}>
        <ProjectTag name={entry.project.name} color={entry.project.color} />
        <span className={styles.time}>
          {when(entry.occurredAt)}
          {entry.timeSource && <span className={styles.timeSource}> · {TIME_SOURCE_LABELS[entry.timeSource]}</span>}
        </span>
        {entry.kind === 'review' && entry.reviewKind && (
          <span className={styles.tag}>{entry.reviewKind}</span>
        )}
        {entry.kind === 'run' && entry.attempts !== null && entry.attempts > 0 && (
          <span className={styles.tag}>{entry.attempts} försök</span>
        )}
      </div>

      {entry.kind === 'run' && <RunBody entry={entry} />}

      {entry.href && (
        <Link href={entry.href} className={styles.inspect}>
          {entry.kind === 'run' ? 'Öppna körningen' : 'Öppna granskningar'}
        </Link>
      )}
    </li>
  )
}

function RunBody({ entry }: { entry: ActivityRunEntry }) {
  return (
    <>
      {entry.error && (
        <p className={styles.error}>
          <span className={styles.bodyLabel}>Fel</span>
          {entry.error}
        </p>
      )}
      {entry.cancelReason && (
        <p className={styles.reason}>
          <span className={styles.bodyLabel}>Avbruten</span>
          {entry.cancelReason}
        </p>
      )}
      {entry.detail && (
        <p className={styles.detail}>
          <span className={styles.bodyLabel}>Senaste loggrad</span>
          {entry.detail}
        </p>
      )}
    </>
  )
}

function Lane({
  title,
  note,
  entries,
  empty,
}: {
  title: string
  note?: string
  entries: ActivityEntry[]
  empty: string
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <span className={styles.count}>{entries.length}</span>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      {entries.length > 0 ? (
        <ul className={styles.list}>
          {entries.map((e) => (
            <EntryCard key={`${e.kind}:${e.id}`} entry={e} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </section>
  )
}

export function ActivityStream({ model }: { model: ActivityModel }) {
  const { counts, sources } = model
  const unreadable = [
    sources.runs === 'error' ? 'körningar' : null,
    sources.reviews === 'error' ? 'granskningar' : null,
    sources.logs === 'error' ? 'loggrader' : null,
  ].filter((v): v is string => v !== null)

  return (
    <div className={styles.field}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Aktivitet</p>
        <h1 className={styles.title}>Vad Omnira har gjort</h1>
        <p className={styles.lede}>
          {model.state === 'error'
            ? UNREADABLE_LABEL
            : `${counts.runs} körningar och ${counts.reviews} granskningar${
                model.projectSlug ? ` i ${model.projectSlug}` : ' i de projekt den här sessionen äger'
              }.`}
        </p>
      </header>

      {unreadable.length > 0 && (
        <section className={styles.panel} data-unreadable="true">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{UNREADABLE_LABEL}</h2>
          </div>
          <p className={styles.note}>
            Följande kunde inte läsas och saknas därför nedan: {unreadable.join(', ')}. Det är inte
            samma sak som att ingenting har hänt.
          </p>
        </section>
      )}

      <Lane
        title="Kräver uppmärksamhet"
        entries={model.attention}
        empty="Inga misslyckade eller avbrutna körningar, och ingen granskning väntar på en människa."
      />

      <Lane
        title="Pågår nu"
        entries={model.running}
        empty="Ingen körning är igång just nu."
      />

      <Lane
        title="Händelseflöde"
        entries={model.entries}
        empty={`${EMPTY_STREAM_TITLE} — ${EMPTY_STREAM_BODY}`}
      />

      <section className={styles.panel} data-provenance="true">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Vad som är registrerat</h2>
        </div>
        <p className={styles.note}>{AGENT_ATTRIBUTION_NOTE}</p>
        <p className={styles.note}>{STEP_DETAIL_NOTE}</p>
        <p className={styles.note}>{NOT_OBSERVED_NOTE}</p>
      </section>

      <details className={styles.diagnostics}>
        <summary className={styles.summary}>Diagnostik</summary>
        <dl className={styles.diagList}>
          <div className={styles.diagRow}>
            <dt>Körningar lästa</dt>
            <dd>
              {counts.runs} (tak {model.limits.runs})
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Granskningar lästa</dt>
            <dd>
              {counts.reviews} (tak {model.limits.reviews})
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Körningar med loggrad</dt>
            <dd>
              {counts.withDetail} av {counts.runs}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Körningar med registrerad agent</dt>
            <dd>
              {counts.withAgent} av {counts.runs}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Källor</dt>
            <dd>
              körningar {sources.runs} · granskningar {sources.reviews} · loggrader {sources.logs}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

export function ActivityStreamLoading() {
  return (
    <div className={styles.field}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Aktivitet</p>
        <h1 className={styles.title}>Vad Omnira har gjort</h1>
        <p className={styles.lede}>Läser…</p>
      </header>
    </div>
  )
}
