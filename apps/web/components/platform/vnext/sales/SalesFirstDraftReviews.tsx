'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SalesWorkspace, SalesDraftRevision } from '@/lib/sales/types'
import styles from './SalesWorkspace.module.css'

type Props = {
  model: SalesWorkspace
  openReviewKey: string | null
  onOpenReviewKeyChange: (key: string | null) => void
  onRefresh: () => Promise<void>
}

/** First outreach drafts share one open-state with incoming-mail replies. */
export function SalesFirstDraftReviews({ model, openReviewKey, onOpenReviewKeyChange, onRefresh }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<SalesDraftRevision | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const drafts = [...model.drafts].sort((a, b) => {
    const aPending = a.current && a.approvalId && ['pending', 'revised', 'needs_input'].includes(a.status) ? 1 : 0
    const bPending = b.current && b.approvalId && ['pending', 'revised', 'needs_input'].includes(b.status) ? 1 : 0
    return Number(bPending) - Number(aPending)
      || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  })
  const pending = drafts.filter(d => d.current && d.approvalId && ['pending', 'revised', 'needs_input'].includes(d.status)).length
  const open = (next: string | null) => {
    setEditing(null)
    onOpenReviewKeyChange(next)
  }
  async function work(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Granskningen misslyckades.') }
    finally { setBusy(false) }
  }
  function decide(draft: SalesDraftRevision, decision: 'approved' | 'rejected') {
    if (!draft.approvalId) return
    void work(async () => {
      const response = await fetch('/api/approvals/' + encodeURIComponent(draft.approvalId!), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: decision }),
      })
      if (!response.ok) throw Error(response.status === 409
        ? 'Utkastet har ändrats. Uppdatera innan du granskar igen.'
        : 'Beslutet kunde inte sparas.')
      open(null)
      await onRefresh()
      setNotice(decision === 'approved'
        ? 'Mejltexten godkändes. Inget mejl har skickats.'
        : 'Mejlutkastet avvisades. Inget mejl har skickats.')
      router.refresh()
    })
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const values = new FormData(event.currentTarget)
    const draft = editing
    void work(async () => {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'revise',
          projectId: model.projectId,
          revisionId: draft.id,
          draft: {
            contactId: draft.contactId, contactVersion: draft.contactVersion,
            offerRevisionId: draft.offerRevisionId, senderEmail: draft.senderEmail,
            toEmail: draft.toEmail, evidenceIds: draft.evidenceIds,
            subject: values.get('subject'), body: values.get('body'),
            questions: String(values.get('questions')).split('\n').map(q => q.trim()).filter(Boolean),
          },
        }),
      })
      if (!response.ok) throw Error(response.status === 409
        ? 'Utkastet har ändrats. Granska den senaste versionen.'
        : 'Ny version kunde inte sparas.')
      setEditing(null)
      open(null)
      await onRefresh()
      setNotice('Ny version sparad. Tidigare godkännande gäller inte längre.')
      router.refresh()
    })
  }

  return (
    <section className={styles.review} aria-label="Mejlutkast för granskning"
      data-private="true" data-ph-no-capture data-hj-suppress data-dd-privacy="hidden">
      <p className={styles.empty}>
        {pending > 0 ? `${pending} utkast behöver ditt beslut.` : 'Inga väntande utkast.'}
        {' '}Öppna ett förslag i taget. Textgodkännande skickar aldrig mejl.
      </p>
      {error && <p role="alert" className={styles.message}>{error}</p>}
      {notice && <p role="status" className={styles.message}>{notice}</p>}
      {drafts.length === 0 && <p>Inga utkast har skapats ännu.</p>}
      {drafts.map(draft => {
        const key = 'initial:' + draft.id
        const expanded = openReviewKey === key
        const contact = model.contacts.find(c => c.id === draft.contactId)
        const offer = model.offers.find(o => o.id === draft.offerRevisionId)
        const actionable = draft.current && !!draft.approvalId && ['pending', 'revised', 'needs_input'].includes(draft.status)
        const title = contact
          ? [contact.companyName, contact.branchName || 'Huvudkontor'].join(' · ')
          : 'Kontakt som behöver kontrolleras'
        const label = !draft.current ? 'Föråldrad version – kan inte granskas' : draft.status === 'approved' ? 'Text godkänd – ej skickad'
          : draft.status === 'rejected' ? 'Avvisat'
          : draft.questions.length > 0 ? 'Behöver kompletteras'
          : actionable ? 'Väntar på granskning' : 'Granskningsstatus oklar'
        const contentId = 'outreach-review-' + draft.id
        return (
          <article key={draft.id} className={styles.replyCard} data-expanded={expanded ? 'true' : 'false'}>
            <button type="button" className={styles.replyToggle} aria-expanded={expanded}
              aria-controls={contentId} disabled={busy}
              onClick={() => open(expanded ? null : key)}>
              <span className={styles.replyTitle}>
                <strong>{title}</strong>
                <small>{draft.subject || 'Ämne saknas'} · {new Date(draft.createdAt).toLocaleString('sv-SE')}</small>
              </span>
              <span className={styles.replyStatus}>{label}</span>
              <span className={styles.replyChevron} aria-hidden>{expanded ? '⌃' : '⌄'}</span>
              <span className={styles.visuallyHidden}>{expanded ? 'Dölj' : 'Visa'} förslag</span>
            </button>
            {expanded && (
              <div className={styles.replyDetail} id={contentId}>
                <p>Kontrollera kontakt, erbjudande och svarstext. Ingenting skickas vid godkännande.</p>
                <dl className={styles.metadata}>
                  <dt>Från</dt><dd>{draft.senderEmail}</dd>
                  <dt>Till</dt><dd>{draft.toEmail}</dd>
                  <dt>Erbjudande</dt><dd>{offer?.offerText || 'Erbjudandeversion saknas'}</dd>
                </dl>
                <h4>{draft.subject}</h4>
                <pre className={styles.inboxText}>{draft.body}</pre>
                {draft.questions.length > 0 && <div className={styles.notice}>
                  <strong>Kontrollera före godkännande</strong>
                  <ul>{draft.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>}
                <details className={styles.disclosure}>
                  <summary>Visa källunderlag och kontakthistorik</summary>
                  <div className={styles.disclosureBody}>
                    <p>{contact?.historySource || 'Ingen verifierbar historik.'}</p>
                    {model.evidence?.filter(e => e.contactId === draft.contactId && draft.evidenceIds.includes(e.id)).map(e => (
                      <div key={e.id}>{e.source && (
                        <>
                          <Link href={e.source.sourceUrl} target="_blank" rel="noreferrer">{e.source.sourceUrl}</Link>
                          <small>Observerat {new Date(e.source.observedAt).toLocaleString('sv-SE')}</small>
                          <p>{e.source.text}</p>
                        </>
                      )}</div>
                    ))}
                    <small>Kontrollsumma: {draft.sha256.slice(0, 12)}…</small>
                  </div>
                </details>
                {editing?.id === draft.id ? (
                  <form key={draft.id} className={styles.form} onSubmit={save}>
                    <h4>Redigera utkastet</h4>
                    <p>Du behöver godkänna den nya versionen separat.</p>
                    <label>Ämne<input name="subject" required maxLength={90} defaultValue={draft.subject} /></label>
                    <label>Mejltext<textarea name="body" required maxLength={2000} rows={7} defaultValue={draft.body} /></label>
                    <label>Kvarstående frågor<textarea name="questions" defaultValue={draft.questions.join('\n')} /></label>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Spara ny version</button>
                      <button type="button" disabled={busy} onClick={() => setEditing(null)}>Avbryt redigering</button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.actions}>
                    <button type="button" disabled={busy || !draft.current} onClick={() => setEditing(draft)}>Redigera</button>
                    {actionable && (
                      <>
                        <button type="button" disabled={busy || draft.questions.length > 0}
                          onClick={() => decide(draft, 'approved')}>Godkänn mejltext</button>
                        <button type="button" disabled={busy}
                          onClick={() => decide(draft, 'rejected')}>Avvisa</button>
                      </>
                    )}
                    <button type="button" disabled={busy} onClick={() => open(null)}>Dölj förslag</button>
                    {draft.runId && <Link href={`/projects/${model.workspaceUrl.split('/')[2]}/runs/${draft.runId}`}>Visa granskningskörning</Link>}
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
