'use client'

/**
 * Marknadsgranskning — the controls on one draft card.
 *
 * ONE DECISION PATH. Godkänn, Åtgärda/Redigera and Skicka tillbaka post to the
 * existing `POST /api/marketing/approvals` with the body the replaced page
 * sent. The route owns the ownership gate, the Guard check before an approval,
 * the status write, the decision ledger and the queued Drafter or Guard run.
 * This component adds no authority and no second write — and it never claims a
 * decision the server refused: anything but a 2xx is shown as what it was.
 *
 * Which controls exist, and which one leads, is `draftActionPlan` — the
 * replaced page's rule. Every control is a button or a native disclosure,
 * reachable by Tab; nothing here binds a key.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DECISION_ENDPOINT,
  DRAFT_ACTION_NOTES,
  SEND_FAILED_MESSAGE,
  decisionBody,
  decisionOutcome,
  type DecisionOutcomeKind,
  type DraftAction,
  type DraftActionEntry,
  type DraftActionPlan,
} from '@/lib/os/marketing-review-shared'
import styles from './MarketingReview.module.css'

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working'; action: DraftAction }
  | { kind: DecisionOutcomeKind; message: string }

export interface MarketingDraftActionsProps {
  draftId: string
  plan: DraftActionPlan
  captionFull: string
  needsLandingUrl: boolean
  landingUrl: string | null
}

export function MarketingDraftActions({ draftId, plan, captionFull, needsLandingUrl, landingUrl }: MarketingDraftActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [caption, setCaption] = useState(captionFull)
  const [url, setUrl] = useState(landingUrl ?? '')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  const send = useCallback(async (action: DraftAction) => {
    setOutcome({ kind: 'working', action })
    try {
      const res = await fetch(DECISION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decisionBody(draftId, action, { caption, landingUrl: url })),
      })
      const payload = await res.json().catch(() => null)
      const answer = decisionOutcome(action, res.status, payload)
      if (!res.ok) {
        // The route's refusal is its answer. It is shown as such — never as success.
        setOutcome(answer)
        router.refresh()
        return
      }
      setOutcome(answer)
      setEditing(false)
      router.refresh()
    } catch {
      setOutcome({ kind: 'error', message: SEND_FAILED_MESSAGE })
    }
  }, [draftId, caption, url, router])

  const startEdit = useCallback(() => {
    // Every edit starts from the stored values, as the replaced page's did.
    setCaption(captionFull)
    setUrl(landingUrl ?? '')
    setOutcome({ kind: 'idle' })
    setEditing(true)
  }, [captionFull, landingUrl])

  const working = outcome.kind === 'working'
  const message = outcome.kind === 'idle' || outcome.kind === 'working' ? '' : outcome.message

  const control = (entry: DraftActionEntry, emphasis?: 'primary') => (
    <button
      type="button"
      className={styles.action}
      data-action={entry.action}
      data-emphasis={emphasis}
      disabled={working}
      onClick={() => (entry.action === 'edit' ? startEdit() : send(entry.action))}
    >
      {outcome.kind === 'working' && outcome.action === entry.action ? 'Skickar …' : entry.label}
    </button>
  )

  if (editing) {
    return (
      <section className={styles.decide} aria-label="Redigera utkastet">
        <label className={styles.fieldLabel} htmlFor={`caption-${draftId}`}>Caption</label>
        <textarea
          id={`caption-${draftId}`}
          className={styles.textarea}
          rows={5}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />
        {needsLandingUrl && (
          <>
            <label className={styles.fieldLabel} htmlFor={`landing-${draftId}`}>Landningssida (UTM-URL)</label>
            <input
              id={`landing-${draftId}`}
              className={styles.input}
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://familje-stunden.se/…"
            />
          </>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            data-action="edit"
            data-emphasis="primary"
            disabled={working}
            onClick={() => send('edit')}
          >
            {working ? 'Sparar …' : 'Spara och bedöm om'}
          </button>
          <button type="button" className={styles.action} disabled={working} onClick={() => setEditing(false)}>
            Avbryt
          </button>
        </div>
        <p className={styles.actionNote}>{DRAFT_ACTION_NOTES.edit}</p>
        <p className={styles.outcome} role="status" data-kind={outcome.kind}>{message}</p>
      </section>
    )
  }

  return (
    <section className={styles.decide} aria-label="Beslut">
      <div className={styles.actions}>
        {plan.primary && control(plan.primary, 'primary')}
        {plan.secondary.length > 0 && (
          <details className={styles.more}>
            <summary className={styles.moreSummary}>{plan.primary ? 'Fler val' : 'Åtgärder'}</summary>
            <div className={styles.moreList}>
              {plan.secondary.map((entry) => (
                <div key={entry.action} className={styles.option}>
                  {control(entry)}
                  <p className={styles.actionNote}>{DRAFT_ACTION_NOTES[entry.action]}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      {plan.primary && <p className={styles.actionNote}>{DRAFT_ACTION_NOTES[plan.primary.action]}</p>}
      <p className={styles.outcome} role="status" data-kind={outcome.kind}>{message}</p>
    </section>
  )
}
