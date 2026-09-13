/**
 * Marknadsgranskning — the operator's review of campaign drafts.
 *
 * A server component. It renders what `lib/os/marketing-review.ts` read and
 * nothing more: no score the Guard did not store, no "Guard körs…" that nothing
 * observes, no status folded into another, and no "all reviewed" unless it is
 * true. A month without a plan says so, and drafts outside the window are
 * counted rather than hidden.
 *
 * The controls on each card are `MarketingDraftActions`, which posts to the
 * existing decision route. Nothing in this file handles an event.
 */

import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'
import {
  ASSET_STATUS_LABELS,
  DECISION_NOTE,
  DRAFT_STATUSES,
  DRAFT_STATUS_LABELS,
  DRAFT_STATUS_NOTES,
  GUARD_NOTE,
  GUARD_VERDICT_LABELS,
  NOT_RECORDED_LABEL,
  OUTSIDE_NOTE,
  PLAN_STATUS_LABELS,
  SEVERITY_LABELS,
  STATUS_NOTE,
  UNKNOWN_LABEL,
  UNKNOWN_STATUS_LABEL,
  UNREADABLE_LABEL,
  WINDOW_NOTE,
  draftStatusLabel,
  draftStatusTone,
  isDraftStatus,
  type DraftStatus,
} from '@/lib/os/marketing-review-shared'
import type {
  MarketingAttention,
  MarketingDraftCard,
  MarketingLane,
  MarketingReviewModel,
  OutsidePlan,
  OutsideSummary,
  WindowMonth,
} from '@/lib/os/marketing-review'
import { MarketingDraftActions } from './MarketingDraftActions'
import styles from './MarketingReview.module.css'

// ── Presentation only ────────────────────────────────────────────────────────

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

const statusWord = (status: string) =>
  isDraftStatus(status) ? DRAFT_STATUS_LABELS[status] : `${UNKNOWN_STATUS_LABEL} (${status || '∅'})`

// ── Pieces ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={styles.status} data-tone={draftStatusTone(status)}>
      {draftStatusLabel(status)}
      {/* An unrecognised status is shown, not hidden behind its fallback label. */}
      {!isDraftStatus(status) && <code className={styles.raw}>{status || '∅'}</code>}
    </span>
  )
}

function GuardLine({ guard }: { guard: MarketingDraftCard['guard'] }) {
  const verdict = guard.verdict ? GUARD_VERDICT_LABELS[guard.verdict] ?? guard.verdict : null
  const score = guard.score !== null ? `${guard.score}/100` : null
  const previous = [score, verdict].filter(Boolean).join(' · ')

  let value: string
  if (guard.state === 'awaiting') {
    value = previous ? `väntar på bedömning · föregående rapport ${previous}` : 'väntar på bedömning'
  } else if (guard.state === 'missing') {
    value = 'ingen rapport'
  } else {
    value = `${score ?? 'poäng ej registrerad'} · ${verdict ?? 'utlåtande ej registrerat'}`
  }

  return (
    <span className={styles.metaItem} data-guard={guard.state}>
      <span className={styles.metaLabel}>Guard</span>
      {value}
    </span>
  )
}

function DraftCard({ card }: { card: MarketingDraftCard }) {
  const identity = [card.channelLabel, card.formatLabel, card.monthLabel ?? NOT_RECORDED_LABEL].join(' · ')

  return (
    <li className={styles.card} data-tone={draftStatusTone(card.status)} data-status={card.status}>
      <div className={styles.cardHead}>
        <div className={styles.cardIdentity}>
          <span className={styles.kind}>{identity}</span>
          <p className={styles.cardTitle} data-empty={card.captionPreview ? undefined : 'true'}>
            {card.captionPreview ? `${card.captionPreview}${card.captionTruncated ? '…' : ''}` : 'Ingen caption'}
          </p>
        </div>
        <StatusBadge status={card.status} />
      </div>

      <div className={styles.meta}>
        <GuardLine guard={card.guard} />
        {card.critical && <span className={styles.tag} data-flag="critical">Kan ej godkännas</span>}
        {card.themeName && (
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Tema</span>
            {card.themeName}
          </span>
        )}
      </div>

      {card.primaryReason && (
        <p className={styles.reason} data-tone={card.primaryReason.tone}>{card.primaryReason.text}</p>
      )}

      <MarketingDraftActions
        draftId={card.id}
        plan={card.actions}
        captionFull={card.captionFull}
        needsLandingUrl={card.cta.needsLandingUrl}
        landingUrl={card.cta.landingUrl}
      />

      <details className={styles.details}>
        <summary className={styles.summary}>Detaljer</summary>
        <div className={styles.detailBody}>
          <div className={styles.section}>
            <span className={styles.bodyLabel}>Caption</span>
            <p className={styles.caption}>{card.captionFull || '—'}</p>
          </div>

          {card.violations.length > 0 && (
            <div className={styles.section}>
              <span className={styles.bodyLabel}>Problem</span>
              <ul className={styles.issues}>
                {card.violations.map((v, i) => (
                  <li key={i} className={styles.issue}>
                    <span className={styles.severity} data-severity={v.severity}>
                      {SEVERITY_LABELS[v.severity] ?? v.severity}
                    </span>
                    <span>{v.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.section}>
            <span className={styles.bodyLabel}>CTA</span>
            <p className={styles.caption}>
              {card.cta.label ?? NOT_RECORDED_LABEL}
              {card.cta.needsLandingUrl ? ` · ${card.cta.landingUrl ?? 'landningssida saknas'}` : ''}
            </p>
          </div>

          {card.warnings.length > 0 && (
            <div className={styles.section}>
              <span className={styles.bodyLabel}>Att tänka på</span>
              <ul className={styles.plain}>
                {card.warnings.map((w, i) => <li key={i}>{w.explanation}</li>)}
              </ul>
            </div>
          )}

          <div className={styles.section}>
            <span className={styles.bodyLabel}>Bilder</span>
            {card.assets.length === 0 ? (
              <p className={styles.caption}>—</p>
            ) : (
              <ul className={styles.plain}>
                {card.assets.map((a, i) => (
                  <li key={i}>
                    {a.ref ?? '(ingen referens)'} · {ASSET_STATUS_LABELS[a.status] ?? a.status}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.section}>
            <span className={styles.bodyLabel}>Tidslinje</span>
            <ul className={styles.plain}>
              {card.audit.map((step) => (
                <li key={step.label}>
                  {step.label} · {stamp(step.at)}
                  {step.runStatus ? <> · körning <code className={styles.raw}>{step.runStatus}</code></> : null}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.section}>
            <span className={styles.bodyLabel}>Tekniska detaljer</span>
            <ul className={styles.plain}>
              <li>
                draft_key <code className={styles.raw}>{card.draftKey}</code> · version {card.version ?? UNKNOWN_LABEL}
              </li>
              <li>
                status <code className={styles.raw}>{card.status || '∅'}</code>
                {card.beat ? <> · beat <code className={styles.raw}>{card.beat}</code></> : null}
              </li>
              {card.audit.map((step) => (
                <li key={`run-${step.label}`}>
                  {step.label} run_id <code className={styles.raw}>{step.runId ?? '—'}</code>
                </li>
              ))}
              {card.blockingGaps.length > 0 && <li>blockerande luckor: {card.blockingGaps.join(', ')}</li>}
            </ul>
          </div>
        </div>
      </details>
    </li>
  )
}

function Lane({ lane }: { lane: MarketingLane }) {
  const label = lane.known ? DRAFT_STATUS_LABELS[lane.status as DraftStatus] : UNKNOWN_STATUS_LABEL
  return (
    <section className={styles.panel} data-lane={lane.status}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          {label}
          {!lane.known && <> <code className={styles.raw}>{lane.status || '∅'}</code></>}
        </h2>
        <span className={styles.count}>{lane.cards.length}</span>
      </div>
      {lane.known && <p className={styles.panelNote}>{DRAFT_STATUS_NOTES[lane.status as DraftStatus]}</p>}
      {lane.cards.length > 0 ? (
        <ul className={styles.list}>
          {lane.cards.map((card) => (
            <DraftCard key={card.id} card={card} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Inget utkast i fönstret är redo för beslut.</p>
      )}
    </section>
  )
}

function Month({ month }: { month: WindowMonth }) {
  return (
    <div className={styles.month} data-plan={month.hasPlan ? 'present' : 'none'} data-month={month.planKey}>
      <span className={styles.monthLabel}>{month.label}</span>
      <span className={styles.monthValue}>
        {month.hasPlan ? month.themeName ?? 'Tema ej satt' : 'Ingen kampanjplan'}
      </span>
      <span className={styles.monthDetail}>
        {month.hasPlan
          ? 'Utkasten från månadens plan granskas nedan.'
          : 'Det finns ingen plan för månaden, och därför inga utkast från den.'}
      </span>
    </div>
  )
}

function AttentionItem({ item }: { item: MarketingAttention }) {
  switch (item.kind) {
    case 'ready':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.count === 1 ? '1 utkast är redo för beslut' : `${item.count} utkast är redo för beslut`}
          </span>
          <span className={styles.attentionDetail}>{DRAFT_STATUS_NOTES.guard_passed}</span>
        </li>
      )
    case 'no_plan':
      return (
        <li className={styles.attention} data-tone="neutral" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Ingen kampanjplan för {item.months.join(' och ')}</span>
          <span className={styles.attentionDetail}>Granskningen visar bara utkast från planer i fönstret.</span>
        </li>
      )
    case 'outside_undecided':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>
            {item.count === 1
              ? '1 utkast utanför fönstret saknar operatörsbeslut'
              : `${item.count} utkast utanför fönstret saknar operatörsbeslut`}
          </span>
          <span className={styles.attentionDetail}>
            {item.plans === 1 ? 'I en plan' : `I ${item.plans} planer`} utanför granskningsfönstret. De beslutas inte
            här — antalen står under Planer utanför fönstret.
          </span>
        </li>
      )
    case 'outside_unreadable':
      return (
        <li className={styles.attention} data-tone="unreadable" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Planerna utanför fönstret kunde inte läsas</span>
          <span className={styles.attentionDetail}>Det som saknas där är okänt, inte tomt.</span>
        </li>
      )
    case 'outside_truncated':
      return (
        <li className={styles.attention} data-tone="attention" data-kind={item.kind}>
          <span className={styles.attentionTitle}>Läsningen utanför fönstret nådde sitt tak</span>
          <span className={styles.attentionDetail}>Antalen där är en undre gräns.</span>
        </li>
      )
  }
}

function OutsidePlanRow({ plan }: { plan: OutsidePlan }) {
  return (
    <li className={styles.plan} data-undecided={plan.undecided > 0 ? 'true' : undefined} data-plan-key={plan.planKey}>
      <span className={styles.planTitle}>
        {plan.label}
        {plan.themeName ? ` · ${plan.themeName}` : ''}
      </span>
      <span className={styles.planDetail}>
        {plan.drafts === 0
          ? 'Inga utkast'
          : `${plan.drafts} utkast${plan.undecided > 0 ? `, varav ${plan.undecided} utan operatörsbeslut` : ''}`}
      </span>
      {plan.byStatus.length > 0 && (
        <span className={styles.planDetail}>
          {plan.byStatus.map((s) => `${statusWord(s.status)} ${s.count}`).join(' · ')}
        </span>
      )}
    </li>
  )
}

function OutsidePanel({ outside }: { outside: OutsideSummary }) {
  return (
    <section className={styles.panel} data-section="outside">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Planer utanför fönstret</h2>
        <span className={styles.count}>{outside.state === 'error' ? UNREADABLE_LABEL : outside.plans.length}</span>
      </div>
      <p className={styles.panelNote}>{OUTSIDE_NOTE}</p>
      {outside.state === 'error' ? (
        <p className={styles.empty}>Planerna utanför fönstret kunde inte läsas. Det som saknas är okänt, inte tomt.</p>
      ) : outside.plans.length === 0 ? (
        <p className={styles.empty}>Det finns inga planer utanför fönstret.</p>
      ) : (
        <ul className={styles.plans}>
          {outside.plans.map((plan) => (
            <OutsidePlanRow key={plan.planKey} plan={plan} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Header({ lede }: { lede: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <p className={styles.eyebrow}>Kampanjutkast</p>
        <h1 className={styles.title}>Marknadsgranskning</h1>
        <p className={styles.lede}>{lede}</p>
      </div>
    </header>
  )
}

const LEDE =
  'Utkast från kampanjplanerna för innevarande och nästa kalendermånad, med Guards lagrade bedömning. Besluten är operatörens, och ingenting publiceras härifrån.'

// ── The surface ──────────────────────────────────────────────────────────────

export function MarketingReview({ model }: { model: MarketingReviewModel }) {
  if (model.state === 'unavailable') {
    return (
      <div className={styles.field}>
        <Header lede={LEDE} />
        <section className={styles.panel} data-state="unavailable">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Ingen marknadsgranskning</h2>
          </div>
          <p className={styles.note}>Ingen marknadsgranskning är tillgänglig för projekten den här sessionen äger.</p>
        </section>
      </div>
    )
  }

  const { counts } = model

  return (
    <div className={styles.field}>
      <Header lede={LEDE} />

      {model.state === 'error' && (
        <section className={styles.panel} data-unreadable="true">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{UNREADABLE_LABEL}</h2>
          </div>
          <p className={styles.note}>
            Granskningen kunde inte läsas helt. Sidan visar därför inga utkast — det är inte samma sak som att inget
            väntar.
          </p>
        </section>
      )}

      {model.window.length > 0 && (
        <section className={styles.window} aria-label="Granskningsfönster">
          {model.window.map((month) => (
            <Month key={month.planKey} month={month} />
          ))}
        </section>
      )}

      {counts && (
        <section className={styles.facts} aria-label="Antal per status i fönstret">
          {DRAFT_STATUSES.map((status) => (
            <div key={status} className={styles.fact} data-tone={draftStatusTone(status)} data-fact={status}>
              <span className={styles.factLabel}>{DRAFT_STATUS_LABELS[status]}</span>
              <span className={styles.factValue}>{counts[status]}</span>
            </div>
          ))}
          {counts.unknown > 0 && (
            <div className={styles.fact} data-tone="neutral" data-fact="unknown">
              <span className={styles.factLabel}>{UNKNOWN_STATUS_LABEL}</span>
              <span className={styles.factValue}>{counts.unknown}</span>
            </div>
          )}
        </section>
      )}

      {model.state === 'ok' && (
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
              {model.nothingWaiting
                ? 'Inget i fönstret väntar på beslut.'
                : counts && counts.total === 0
                  ? 'Planerna i fönstret har inga utkast ännu.'
                  : 'Inget utkast i fönstret är redo för beslut just nu.'}
            </p>
          )}
        </section>
      )}

      {model.state === 'error' && model.attention.length > 0 && (
        <ul className={styles.attentionList} aria-label="Utanför fönstret">
          {model.attention.map((item, i) => (
            <AttentionItem key={`${item.kind}:${i}`} item={item} />
          ))}
        </ul>
      )}

      {model.state === 'ok' && model.lanes.map((lane) => <Lane key={lane.status || '∅'} lane={lane} />)}

      <OutsidePanel outside={model.outside} />

      <section className={styles.panel} data-provenance="true">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Hur uppgifterna är framtagna</h2>
        </div>
        <p className={styles.note}>{WINDOW_NOTE}</p>
        <p className={styles.note}>{STATUS_NOTE}</p>
        <p className={styles.note}>{GUARD_NOTE}</p>
        <p className={styles.note}>{DECISION_NOTE}</p>
      </section>

      <details className={styles.diagnostics}>
        <summary className={styles.summary}>Diagnostik</summary>
        <dl className={styles.diagList}>
          <div className={styles.diagRow}>
            <dt>Fönster (UTC)</dt>
            <dd>{model.window.map((m) => m.planKey).join(' · ') || '—'}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Planstatus i fönstret</dt>
            <dd>
              {model.window
                .map((m) => `${m.planKey} ${m.planStatus ? PLAN_STATUS_LABELS[m.planStatus] ?? m.planStatus : 'ingen plan'}`)
                .join(' · ') || '—'}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Utkast i fönstret</dt>
            <dd>{counts ? counts.total : UNREADABLE_LABEL}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Utanför fönstret</dt>
            <dd>
              {model.outside.state === 'error'
                ? UNREADABLE_LABEL
                : `${model.outside.plans.length} planer · ${model.outside.drafts} utkast (tak ${model.limits.drafts} rader)${model.outside.truncated ? ' — taket nått' : ''}`}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Källor</dt>
            <dd>{`granskning ${model.state === 'error' ? 'error' : 'ok'} · utanför fönstret ${model.outside.state}`}</dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

export function MarketingReviewLoading() {
  return (
    <div className={styles.field}>
      <Header lede="Läser…" />
    </div>
  )
}
