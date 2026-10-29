'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ReplyWorkspace, ReplyDraftRevision, ReplyJobSummary } from '@/lib/sales/replies/types'
import { salesStatusLabel } from '@/lib/sales/view-model'
import { SalesReplySend } from './SalesReplySend'
import styles from './SalesWorkspace.module.css'

type Props = {
  projectId: string
  approvalId?: string
  /** Shared with the sales workspace: there is only one expanded proposal of either kind. */
  openReviewKey?: string | null
  onOpenReviewKeyChange?: (key: string | null) => void
}

const empty: ReplyWorkspace = { jobs: [], drafts: [], sendingEnabled: false }
const reviewKey = (jobId: string) => 'reply:' + jobId
const isReviewable = (job: ReplyJobSummary, draft: ReplyDraftRevision | undefined) =>
  !!draft && draft.current && draft.status === 'pending' && !!draft.approvalId
  && draft.questions.length === 0 && job.sourceCurrent && !job.newerIncoming
  && !['cancelled', 'failed', 'reconciling'].includes(job.status)

/**
 * Compact, owner-scoped review queue. The API owns source freshness,
 * revision hashes, and the approval transition. Nothing in this component
 * can send mail: 'review' is explicitly distinct from /api/sales/sending.
 */
export function SalesReplies({ projectId, approvalId, openReviewKey, onOpenReviewKeyChange }: Props) {
  const router = useRouter()
  const [model, setModel] = useState<ReplyWorkspace>(empty)
  const [known, setKnown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState('')
  const [editing, setEditing] = useState<ReplyDraftRevision | null>(null)
  const [localOpenKey, setLocalOpenKey] = useState<string | null>(null)
  const ownerClosedFocusedReview = useRef(false)
  const currentOpenKey = openReviewKey === undefined ? localOpenKey : openReviewKey

  const changeOpen = (key: string | null) => {
    if (key === null && approvalId) ownerClosedFocusedReview.current = true
    setEditing(null)
    if (onOpenReviewKeyChange) onOpenReviewKeyChange(key)
    else setLocalOpenKey(key)
  }

  async function load(signal?: AbortSignal) {
    const response = await fetch('/api/sales/replies?projectId=' + encodeURIComponent(projectId), {
      cache: 'no-store', signal,
    })
    if (!response.ok) throw Error('Svarsförslagen kunde inte hämtas.')
    const next = await response.json() as ReplyWorkspace
    if (!signal?.aborted) {
      setModel(next)
      setKnown(true)
      if (approvalId && openReviewKey === undefined && !ownerClosedFocusedReview.current) {
        const matched = next.drafts.find(d => d.current && d.approvalId === approvalId)
        if (matched) setLocalOpenKey(reviewKey(matched.jobId))
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setModel(empty)
    setKnown(false)
    setError('')
    setOutcome('')
    setEditing(null)
    setLocalOpenKey(null)
    ownerClosedFocusedReview.current = false
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError('Svarsförslagen kunde inte hämtas. Sparat underlag kan vara äldre.')
    })
    const timer = setInterval(() => {
      void load(controller.signal).catch(() => {
        if (!controller.signal.aborted) setError('Svarsförslagen kunde inte uppdateras. Sparat underlag kan vara äldre.')
      })
    }, 20_000)
    return () => { controller.abort(); clearInterval(timer) }
    // The review scope must reset when the owner/project or approval changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, approvalId])

  async function post(operation: string, values: Record<string, unknown>) {
    const response = await fetch('/api/sales/replies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation, projectId, ...values }),
    })
    if (!response.ok) throw Error(response.status === 409
      ? 'Underlaget har ändrats. Uppdatera och granska den senaste versionen.'
      : 'Åtgärden kunde inte sparas. Kontrollera projektets status.')
    return response.json()
  }

  async function action(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setOutcome('')
    try { await work() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Åtgärden kunde inte genomföras.') }
    finally { setBusy(false) }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const fields = new FormData(event.currentTarget)
    void action(async () => {
      await post('edit', {
        revisionId: editing.id, expectedHash: editing.sha256,
        subject: fields.get('subject'), body: fields.get('body'),
        questions: String(fields.get('questions')).split('\n').map(s => s.trim()).filter(Boolean),
      })
      setEditing(null)
      await load()
      setOutcome('Ny svarsversion sparad. Den måste granskas på nytt. Inget mejl skickades.')
      router.refresh()
    })
  }

  function review(draft: ReplyDraftRevision, decision: 'approved' | 'rejected') {
    void action(async () => {
      await post('review', { revisionId: draft.id, expectedHash: draft.sha256, decision })
      setEditing(null)
      changeOpen(null)
      await load()
      setOutcome(decision === 'approved'
        ? 'Svarsförslaget är godkänt för texten. Inget mejl har skickats.'
        : 'Svarsförslaget är avvisat. Inget mejl har skickats.')
      router.refresh()
    })
  }

  const visibleJobs = approvalId
    ? model.jobs.filter(j => model.drafts.some(d => d.jobId === j.id && d.current && d.approvalId === approvalId))
    : model.jobs
  const draftByJob = new Map(model.drafts.filter(d => d.current).map(d => [d.jobId, d]))
  const jobs = [...visibleJobs].sort((a, b) => {
    const aPending = isReviewable(a, draftByJob.get(a.id)) ? 1 : 0
    const bPending = isReviewable(b, draftByJob.get(b.id)) ? 1 : 0
    return bPending - aPending || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  })
  const readyCount = visibleJobs.filter(j => isReviewable(j, draftByJob.get(j.id))).length

  return (
    <section
      aria-label="Svarsförslag"
      className={styles.review}
      data-ph-no-capture data-private="true" data-hj-suppress data-dd-privacy="hidden"
    >
      <div className={styles.sectionHead}>
        <div>
          <h2>Svarsförslag för granskning</h2>
          {known && <p className={styles.empty}>
            {readyCount === 0 ? 'Inga klara textbeslut väntar just nu.' :
              `${readyCount} ${readyCount === 1 ? 'svarsförslag väntar' : 'svarsförslag väntar'} på ditt beslut.`}
            {' '}Visa bara det förslag du vill läsa.
          </p>}
        </div>
        <button type="button" disabled={busy} onClick={() => void action(() => load())}>
          Uppdatera svarsförslag
        </button>
      </div>
      {error && <p role="alert" className={styles.message}>{error}</p>}
      {outcome && <p role="status" className={styles.message}>{outcome}</p>}
      {!known ? <p>Status för sparade svar är ännu inte verifierad.</p>
        : !jobs.length ? <p>{approvalId
          ? 'Granskningen saknar en aktuell mejlversion. Öppna projektets svarsvy.'
          : 'Inga svarsuppdrag finns ännu. Välj ett mejl i inkorgen och be Atlas förbereda ett svar.'}</p>
        : null}
      {jobs.map(job => {
        const draft = draftByJob.get(job.id)
        const isOpen = currentOpenKey === reviewKey(job.id)
        const stale = !job.sourceCurrent || job.newerIncoming
        const canApprove = isReviewable(job, draft)
        const title = job.replyMode === 'general'
          ? 'Vanligt mejlsvar' : (job.source.companyName || 'Mejlsvar')
        const displayStatus = !draft ? salesStatusLabel(job.status)
          : draft.status === 'approved' ? 'Text godkänd – ej skickad'
          : draft.status === 'rejected' ? 'Avvisat'
          : !job.sourceCurrent ? 'Källan har ändrats'
          : job.newerIncoming ? 'Nyare mejl finns'
          : draft.questions.length ? 'Behöver kompletteras'
          : draft.status === 'pending' ? 'Väntar på granskning'
          : salesStatusLabel(job.status)
        const detailId = 'reply-review-' + job.id

        return (
          <article key={job.id} className={styles.replyCard} data-expanded={isOpen ? 'true' : 'false'}>
            <button
              type="button"
              className={styles.replyToggle}
              disabled={busy}
              aria-expanded={isOpen}
              aria-controls={detailId}
              onClick={() => changeOpen(isOpen ? null : reviewKey(job.id))}
            >
              <span className={styles.replyTitle}>
                <strong>{title} · {job.replyMode === 'general'
                  ? 'Utan erbjudande' : job.source.branchName || 'Huvudkontor'}</strong>
                <small>{job.source.subject || 'Ämne saknas'} · {new Date(job.createdAt).toLocaleString('sv-SE')}</small>
              </span>
              <span className={styles.replyStatus}>{displayStatus}</span>
              <span className={styles.replyChevron} aria-hidden>{isOpen ? '⌃' : '⌄'}</span>
              <span className={styles.visuallyHidden}>
                {isOpen ? 'Dölj' : 'Visa'} förslag
              </span>
            </button>

            {isOpen && (
              <div id={detailId} className={styles.replyDetail}>
                <p>Granska både avsändare och mottagare. Ett godkännande sparar bara textbeslutet.</p>
                <dl className={styles.metadata}>
                  <dt>Från</dt><dd>{job.source.senderName
                    ? `${job.source.senderName} <${job.source.senderEmail}>` : job.source.senderEmail}</dd>
                  <dt>Till</dt><dd>{job.source.toEmail}</dd>
                  <dt>Erbjudande</dt><dd>{job.source.offerText}</dd>
                </dl>
                {!job.sourceCurrent && <p role="note">Underlaget har ändrats. Den gamla versionen kan inte godkännas.</p>}
                {job.newerIncoming && <p role="note">Ett nyare mejl finns från samma adress.
                  Det bevisar inte att det är samma tråd. Granska inkorgen innan ett nytt uppdrag.</p>}
                {job.detail && <p>{job.status === 'reconciling'
                  ? 'Arbetet behöver stämmas av. Det startas inte om automatiskt.'
                  : 'Uppdraget behöver kontrolleras.'}</p>}
                {draft && (
                  <>
                    <h4>{draft.subject}</h4>
                    <pre className={styles.inboxText}>{draft.body}</pre>
                    {draft.questions.length > 0 && <div className={styles.notice}>
                      <strong>Frågor att kontrollera</strong>
                      <ul>{draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
                    </div>}
                    {editing?.id === draft.id ? (
                      <form key={draft.id} className={styles.form} onSubmit={save}>
                        <h4>Redigera detta svar</h4>
                        <p>En ändring skapar en ny version som kräver nytt godkännande.</p>
                        <label>Ämne för svaret<input name="subject" required maxLength={90} defaultValue={draft.subject}/></label>
                        <label>Svarstext<textarea name="body" required maxLength={2000} rows={7} defaultValue={draft.body}/></label>
                        <label>Kvarstående frågor<textarea name="questions" defaultValue={draft.questions.join('\n')}/></label>
                        <div className={styles.actions}>
                          <button disabled={busy} type="submit">Spara ny svarsversion</button>
                          <button type="button" disabled={busy} onClick={() => setEditing(null)}>Avbryt redigering</button>
                        </div>
                      </form>
                    ) : (
                      <div className={styles.actions}>
                        <button type="button" disabled={busy || stale || job.status === 'cancelled'}
                          onClick={() => setEditing(draft)}>Redigera svarsförslag</button>
                        {draft.status === 'pending' && draft.approvalId && (
                          <>
                            <button type="button" disabled={busy || !canApprove}
                              onClick={() => review(draft, 'approved')}>Godkänn svarsförslag</button>
                            <button type="button" disabled={busy}
                              onClick={() => review(draft, 'rejected')}>Avvisa svarsförslag</button>
                          </>)}
                        <button type="button" disabled={busy} onClick={() => changeOpen(null)}>
                          Dölj förslag
                        </button>
                      </div>
                    )}
                    {draft.status === 'approved' && (
                      <details className={styles.disclosure}>
                        <summary>Separat sändstatus – godkännandet har inte skickat mejlet</summary>
                        <SalesReplySend key={draft.id} projectId={projectId} revisionId={draft.id}
                          revisionHash={draft.sha256} sourceCurrent={!stale && job.status !== 'cancelled'} />
                      </details>
                    )}
                  </>
                )}
                {job.status !== 'cancelled' && (
                  <div className={styles.actions}>
                    <button type="button" disabled={busy} onClick={() => void action(async () => {
                      await post('cancel', { jobId: job.id })
                      changeOpen(null)
                      await load()
                      router.refresh()
                    })}>Avbryt svarsuppdrag</button>
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
