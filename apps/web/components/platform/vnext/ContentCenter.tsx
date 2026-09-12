/**
 * Content Center — the operator's editorial queue.
 *
 * A server component. It renders what `lib/os/content-center.ts` read and
 * nothing more: no invented progress, no "live" claim about the website, no
 * status folded into another. Where two stored fields disagree, the card says
 * so instead of choosing one.
 *
 * The one action here is the existing Generate Article drawer, mounted
 * unchanged. Approve & publish, reject and hero images stay on the article's
 * own page, where the full text and QA report are in view — every card links
 * there.
 */

import Link from 'next/link'
import { ViewVisibleSync } from '@/components/platform/os'
import { GenerateArticleDrawer } from '@/app/(platform)/atlas/content/GenerateArticleDrawer'
import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  COST_NOTE,
  DISAGREEMENT_NOTE,
  GENERATION_NOTE,
  HERO_IMAGE_STATUS_LABELS,
  NEWS_UNREADABLE_NOTE,
  NOT_RECORDED_LABEL,
  QA_CONFIDENCE_LABELS,
  QA_NOTE,
  QA_VERDICT_LABELS,
  REVIEW_NOTE,
  STATUS_NOTE,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  contentStatusLabel,
  contentStatusTone,
} from '@/lib/os/content-center-shared'
import type {
  ContentAttention,
  ContentCard,
  ContentCenterModel,
  ContentLane,
  ContentSource,
} from '@/lib/os/content-center'
import styles from './ContentCenter.module.css'

// ── Presentation only ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<ContentSource, string> = {
  content: 'Artikelkön',
  news: 'Nyhetskällan',
  projects: 'Projektnamnen',
}

const STAMP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ATLAS_HOME_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function stamp(iso: string | null): string {
  if (!iso) return NOT_RECORDED_LABEL
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? UNKNOWN_LABEL : STAMP.format(d)
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

/** The surface's own formatter. A recorded amount is shown as recorded; none is "not recorded". */
export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_RECORDED_LABEL
  if (value > 0 && value < 0.00005) return '< $0.0001'
  return USD.format(value)
}

const title = (card: ContentCard) => card.title ?? 'Utan titel'

// ── Pieces ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = contentStatusLabel(status)
  return (
    <span className={styles.status} data-tone={contentStatusTone(status)}>
      {label}
      {/* An unrecognised status is shown, not hidden behind its fallback label. */}
      {label !== CONTENT_STATUS_LABELS[status as keyof typeof CONTENT_STATUS_LABELS] && (
        <code className={styles.raw}>{status || '∅'}</code>
      )}
    </span>
  )
}

function Card({ card }: { card: ContentCard }) {
  const verdict = card.qa.verdict
  const confidence = card.qa.confidence
    ? QA_CONFIDENCE_LABELS[card.qa.confidence] ?? card.qa.confidence
    : null

  return (
    <li className={styles.card} data-tone={contentStatusTone(card.status)} data-status={card.status}>
      <div className={styles.cardHead}>
        <div className={styles.cardIdentity}>
          <span className={styles.kind}>
            {card.contentType ? CONTENT_TYPE_LABELS[card.contentType] ?? card.contentType : NOT_RECORDED_LABEL}
          </span>
          <h3 className={styles.cardTitle}>{title(card)}</h3>
        </div>
        <StatusBadge status={card.status} />
      </div>

      {card.summary && <p className={styles.cardSummary}>{card.summary}</p>}

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Automatisk QA</span>
          {QA_VERDICT_LABELS[verdict]}
          {confidence && <span> · säkerhet {confidence}</span>}
          {card.qa.issues !== null && card.qa.issues > 0 && <span> · {card.qa.issues} anmärkningar</span>}
        </span>
        {verdict === 'fail' && card.status === 'published' && (
          <span className={styles.tag} data-flag="qa-fail">Publicerad med underkänd QA</span>
        )}
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Beräknad genereringskostnad</span>
          {formatUsd(card.estimatedCostUsd)}
        </span>
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Modell</span>
          {card.model ?? NOT_RECORDED_LABEL}
        </span>
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Hjältebild</span>
          {card.heroImageStatus
            ? HERO_IMAGE_STATUS_LABELS[card.heroImageStatus] ?? card.heroImageStatus
            : NOT_RECORDED_LABEL}
        </span>
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Skapad</span>
          {stamp(card.createdAt)}
        </span>
        {card.publishedAt && (
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Publicering bokförd</span>
            {stamp(card.publishedAt)}
          </span>
        )}
        {card.project && (
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Projekt</span>
            {card.project.name ?? card.project.slug ?? UNKNOWN_LABEL}
          </span>
        )}
      </div>

      {card.status === 'failed' && (
        <p className={styles.detail} data-tone="failure">
          <span className={styles.bodyLabel}>Publiceringsfel</span>
          {card.publishError ?? NOT_RECORDED_LABEL}
        </p>
      )}
      {card.status === 'rejected' && card.rejectionReason && (
        <p className={styles.detail}>
          <span className={styles.bodyLabel}>Avvisningsskäl</span>
          {card.rejectionReason}
        </p>
      )}
      {card.statusReason && (
        <p className={styles.detail}>
          <span className={styles.bodyLabel}>Lagrad statusförklaring</span>
          {card.statusReason}
        </p>
      )}
      {card.publishRecordedWithoutPublishedStatus && (
        <p className={styles.detail} data-tone="integrity">
          <span className={styles.tag} data-flag="disagreement">Fälten motsäger varandra</span>{' '}
          Publicering är bokförd ({card.publishOperation ?? NOT_RECORDED_LABEL}), men status är{' '}
          {contentStatusLabel(card.status)}.
        </p>
      )}
      {card.destinationUnsafe && (
        <p className={styles.detail} data-tone="integrity">
          En publiceringsadress är lagrad men är inte en http- eller https-adress och visas därför inte.
        </p>
      )}

      <div className={styles.links}>
        {card.href && (
          <Link href={card.href} className={styles.inspect}>
            Öppna artikeln
          </Link>
        )}
        {card.destinationUrl && (
          <a href={card.destinationUrl} target="_blank" rel="noopener noreferrer" className={styles.inspect}>
            Bokförd publiceringsadress
          </a>
        )}
      </div>
    </li>
  )
}

function AttentionItem({ item }: { item: ContentAttention }) {
  switch (item.kind) {
    case 'pending_review':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.count === 1 ? '1 artikel väntar på granskning' : `${item.count} artiklar väntar på granskning`}
          </span>
          <span className={styles.attentionDetail}>{REVIEW_NOTE}</span>
        </li>
      )
    case 'publish_failed':
      return (
        <li className={styles.attention} data-tone="failure" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Publicering misslyckades: {title(item.card)}</span>
          <span className={styles.attentionDetail}>{item.card.publishError ?? 'Inget fel är bokfört.'}</span>
          {item.card.href && (
            <Link href={item.card.href} className={styles.inspect}>
              Öppna artikeln
            </Link>
          )}
        </li>
      )
    case 'status_disagreement':
      return (
        <li className={styles.attention} data-tone="integrity" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {title(item.card)}: publicering bokförd trots status {contentStatusLabel(item.card.status)}
          </span>
          <span className={styles.attentionDetail}>{DISAGREEMENT_NOTE}</span>
          {item.card.href && (
            <Link href={item.card.href} className={styles.inspect}>
              Öppna artikeln
            </Link>
          )}
        </li>
      )
    case 'truncated':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Läsningen nådde taket på {item.limit} artiklar</span>
          <span className={styles.attentionDetail}>
            Äldre artiklar saknas i listan och i antalen ovan — antalen är en undre gräns.
          </span>
        </li>
      )
    case 'source_unreadable':
      return (
        <li className={styles.attention} data-tone="unreadable" data-kind={item.kind}>
          <span className={styles.attentionTitle}>{SOURCE_LABELS[item.source]} kunde inte läsas</span>
          <span className={styles.attentionDetail}>Det som saknas nedan är okänt, inte tomt.</span>
        </li>
      )
  }
}

function Lane({ lane }: { lane: ContentLane }) {
  const label = contentStatusLabel(lane.status)
  return (
    <section className={styles.panel} data-lane={lane.status}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          {label}
          {!lane.known && <> <code className={styles.raw}>{lane.status || '∅'}</code></>}
        </h2>
        <span className={styles.count}>{lane.cards.length}</span>
      </div>
      {lane.cards.length > 0 ? (
        <ul className={styles.list}>
          {lane.cards.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Ingen artikel väntar på granskning.</p>
      )}
    </section>
  )
}

// ── The surface ──────────────────────────────────────────────────────────────

export function ContentCenter({ model }: { model: ContentCenterModel }) {
  const { counts, sources } = model

  return (
    <div className={styles.field}>
      <ViewVisibleSync refs={model.visibleRefs} />

      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Content Center</p>
          <h1 className={styles.title}>Redaktionell kö</h1>
          <p className={styles.lede}>
            Webbartiklar i de projekt den här sessionen äger. Status är Atlas egen; webbplatsen observeras inte
            härifrån.
          </p>
        </div>
        <div className={styles.actions}>
          {sources.news === 'ok' && <GenerateArticleDrawer newsItems={model.newsItems} />}
          <p className={styles.actionNote}>{sources.news === 'ok' ? GENERATION_NOTE : NEWS_UNREADABLE_NOTE}</p>
        </div>
      </header>

      {model.state === 'error' && (
        <section className={styles.panel} data-unreadable="true">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{UNREADABLE_LABEL}</h2>
          </div>
          <p className={styles.note}>
            Artikelkön kunde inte läsas. Sidan visar därför inga artiklar — det är inte samma sak som en tom kö.
          </p>
        </section>
      )}

      <section className={styles.facts} aria-label="Antal per status">
        {counts === null ? (
          <div className={styles.fact} data-tone="unreadable" data-fact="unreadable">
            <span className={styles.factLabel}>Antal</span>
            <span className={styles.factValue}>{UNREADABLE_LABEL}</span>
          </div>
        ) : (
          <>
            {CONTENT_STATUSES.map((status) => (
              <div key={status} className={styles.fact} data-tone={contentStatusTone(status)} data-fact={status}>
                <span className={styles.factLabel}>{CONTENT_STATUS_LABELS[status]}</span>
                <span className={styles.factValue}>{counts[status]}</span>
              </div>
            ))}
            {counts.unknown > 0 && (
              <div className={styles.fact} data-tone="neutral" data-fact="unknown">
                <span className={styles.factLabel}>Okänd status</span>
                <span className={styles.factValue}>{counts.unknown}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.panel} data-section="attention">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Kräver uppmärksamhet</h2>
          <span className={styles.count}>{model.attention.length}</span>
        </div>
        {model.attention.length > 0 ? (
          <ul className={styles.attentionList}>
            {model.attention.map((item, i) => (
              <AttentionItem key={`${item.kind}:${i}`} item={item} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            Ingen artikel väntar på granskning, ingen publicering har misslyckats och inga lagrade fält motsäger
            varandra.
          </p>
        )}
      </section>

      {model.state === 'ok' && model.lanes.map((lane) => <Lane key={lane.status || '∅'} lane={lane} />)}

      <section className={styles.panel} data-provenance="true">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Hur uppgifterna är framtagna</h2>
        </div>
        <p className={styles.note}>{STATUS_NOTE}</p>
        <p className={styles.note}>{QA_NOTE}</p>
        <p className={styles.note}>{COST_NOTE}</p>
        <p className={styles.note}>{REVIEW_NOTE}</p>
      </section>

      <details className={styles.diagnostics}>
        <summary className={styles.summary}>Diagnostik</summary>
        <dl className={styles.diagList}>
          <div className={styles.diagRow}>
            <dt>Artiklar lästa</dt>
            <dd>
              {counts === null ? UNREADABLE_LABEL : counts.total} (tak {model.limits.rows})
              {model.truncated ? ' — taket nått' : ''}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Nyheter för generering</dt>
            <dd>
              {sources.news === 'ok' ? model.newsItems.length : UNREADABLE_LABEL} (tak {model.limits.news})
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Källor</dt>
            <dd>
              {(Object.keys(sources) as ContentSource[]).map((s) => `${s} ${sources[s]}`).join(' · ')}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

export function ContentCenterLoading() {
  return (
    <div className={styles.field}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Content Center</p>
          <h1 className={styles.title}>Redaktionell kö</h1>
          <p className={styles.lede}>Läser…</p>
        </div>
      </header>
    </div>
  )
}
