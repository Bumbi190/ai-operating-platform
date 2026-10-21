'use client'
import * as React from 'react'
import { useCallback, useContext, useRef } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { AtlasInboxContext } from './AtlasInboxProvider'
import { useDismissOnOutside } from './useDismissOnOutside'
import { inboxLinks } from '@/lib/atlas/project-analytics/handlarborsen-inbox-summary-client'
import styles from './AtlasInboxNotice.module.css'

/** The same personal surface in desktop, mobile and legacy chrome. Opening is read-only. */
export function AtlasInboxNotice() {
  const inbox = useContext(AtlasInboxContext)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    if (!details.current?.open) return
    const focusInside = details.current.contains(document.activeElement)
    details.current.open = false
    if (focusInside) summary.current?.focus()
  },[])
  // Read the native open state directly, including an Escape immediately after opening.
  useDismissOnOutside(details,true,close)
  if (!inbox || inbox.state.status === 'hidden') return null
  const { state, audience, refresh } = inbox
  const label = state.status === 'ok' ? `Atlas inkorg, ${state.unreadCount} olästa`
    : 'Atlas inkorg, antal olästa okänt'
  return <details ref={details} className={styles.root} onToggle={event => {
    const expanded = event.currentTarget.open
    if (expanded) refresh(true)
  }}>
    <summary ref={summary} aria-label={label} className={styles.button}>
      <Inbox size={19} aria-hidden="true" />
      {state.status === 'ok' ? state.unreadCount > 0
        ? <span className={styles.badge} data-unread="true" aria-hidden="true">{state.unreadCount}</span>
        : null : <span className={styles.unknown} aria-hidden="true">?</span>}
    </summary>
    <section className={styles.panel} aria-label="Atlas konkurrentinkorg">
      <strong>Atlas · Handlarbörsen</strong>
      <p aria-live="polite">{state.status === 'ok'
        ? state.totalCount === 0 ? 'Inga notiser har skapats för ditt konto.'
          : `${state.unreadCount} olästa av ${state.totalCount} sparade notiser.`
        : state.status === 'loading' ? 'Hämtar din inkorg…'
          : 'Inkorgen kunde inte läsas. Antalet olästa är okänt.'}</p>
      <Link href={inboxLinks[audience].page} onClick={() => {
        if (details.current) details.current.open = false
      }}>Öppna Konkurrentspanaren →</Link>
    </section>
  </details>
}
