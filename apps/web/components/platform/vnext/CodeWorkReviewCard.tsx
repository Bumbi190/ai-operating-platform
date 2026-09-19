'use client'

import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AUTHORIZATION_STATUS_LABELS,
  CODE_WORK_STATE_LABELS,
  type CodeWorkReviewItem,
  type CodeWorkReviewQueueModel,
} from '@/lib/atlas/code-work/control-plane/operator-model'
import styles from './CodeWorkReviewCard.module.css'

type Outcome = { kind: 'idle' | 'working' | 'done' | 'error'; message?: string }

export function CodeWorkReviewPanel({ model }: { model: CodeWorkReviewQueueModel }) {
  return (
    <section className={styles.panel} aria-labelledby="code-work-heading">
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>SDF‑1B2 · Kontrollplan</p>
          <h2 id="code-work-heading" className={styles.title}>Kodarbetsbehörighet</h2>
          <p className={styles.copy}>
            Ett godkännande tillåter endast den exakt bundna framtida kodarbetsadmissionen.
            Ingen worker startas i denna fas.
          </p>
        </div>
        <span className={styles.truth}>NO EXECUTION RUNTIME</span>
      </div>

      <ProposalForm />

      {model.state === 'error' ? (
        <p className={styles.note} role="note" data-tone="error">
          Kodarbetsförslagen kunde inte läsas. Det betyder inte att kön är tom.
        </p>
      ) : model.queue.length + model.archive.length === 0 ? (
        <p className={styles.note} role="note">Inga kodarbetsförslag att visa.</p>
      ) : (
        <div className={styles.groups}>
          {model.queue.length > 0 ? (
            <div>
              <h3 className={styles.groupTitle}>Väntar på ägarbeslut · {model.queue.length}</h3>
              <div className={styles.cards}>{model.queue.map(item => <CodeWorkCard key={item.workId} item={item} />)}</div>
            </div>
          ) : null}
          {model.archive.length > 0 ? (
            <details className={styles.archive}>
              <summary>Avgjorda och avslutade · {model.archive.length}</summary>
              <div className={styles.cards}>{model.archive.map(item => <CodeWorkCard key={item.workId} item={item} />)}</div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  )
}

function ProposalForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  const submit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOutcome({ kind: 'working' })
    const data = new FormData(event.currentTarget)
    const paths = (name: string) => String(data.get(name) ?? '')
      .split(/[\n,]/).map(value => value.trim()).filter(Boolean)
    const idempotencyKey = String(data.get('idempotencyKey') ?? '').trim()
      || globalThis.crypto.randomUUID()
    try {
      const response = await fetch('/api/atlas/code-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workPackageId: String(data.get('workPackageId') ?? '').trim(),
          pinnedBaseSha: String(data.get('pinnedBaseSha') ?? '').trim(),
          readPaths: paths('readPaths'),
          writePaths: paths('writePaths'),
          idempotencyKey,
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setOutcome({ kind: 'error', message: payload?.error ?? 'Förslaget kunde inte registreras.' })
        return
      }
      setOutcome({ kind: 'done', message: 'Förslaget registrerades och väntar på ägarbeslut.' })
      router.refresh()
    } catch {
      setOutcome({ kind: 'error', message: 'Förslaget kunde inte skickas.' })
    }
  }, [router])

  return (
    <div className={styles.proposal}>
      <button type="button" className={styles.secondary} onClick={() => setOpen(value => !value)} aria-expanded={open}>
        {open ? 'Stäng förslagsformulär' : 'Nytt avgränsat förslag'}
      </button>
      {open ? (
        <form className={styles.form} onSubmit={submit}>
          <label>Work Package-id<input name="workPackageId" required autoComplete="off" /></label>
          <label>Föreslagen bas · ännu inte broker-verifierad<input name="pinnedBaseSha" required minLength={40} maxLength={40} autoComplete="off" /></label>
          <label>Lässcope<textarea name="readPaths" rows={2} required placeholder="apps/web/lib/…" /></label>
          <label>Skrivscope<textarea name="writePaths" rows={2} required placeholder="apps/web/components/…" /></label>
          <label>Idempotensnyckel <span>(valfri)</span><input name="idempotencyKey" maxLength={200} autoComplete="off" /></label>
          <div className={styles.formActions}>
            <button className={styles.primary} disabled={outcome.kind === 'working'}>
              {outcome.kind === 'working' ? 'Registrerar …' : 'Registrera förslag'}
            </button>
            <p role="status" data-kind={outcome.kind}>{outcome.message ?? ''}</p>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function CodeWorkCard({ item }: { item: CodeWorkReviewItem }) {
  const router = useRouter()
  const [hours, setHours] = useState('4')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  const decide = useCallback(async (action: 'grant' | 'deny') => {
    setOutcome({ kind: 'working' })
    const body = action === 'grant'
      ? { action, projectSlug: item.project.slug, expiresAt: new Date(Date.now() + Number(hours) * 3_600_000).toISOString() }
      : { action, projectSlug: item.project.slug }
    try {
      const response = await fetch(`/api/atlas/code-work/${item.workId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setOutcome({ kind: 'error', message: payload?.error ?? 'Beslutet kunde inte registreras.' })
        router.refresh()
        return
      }
      setOutcome({ kind: 'done', message: action === 'grant' ? 'Behörigheten beviljades.' : 'Förslaget avvisades.' })
      router.refresh()
    } catch {
      setOutcome({ kind: 'error', message: 'Beslutet kunde inte skickas.' })
    }
  }, [hours, item.project.slug, item.workId, router])

  return (
    <article className={styles.card} data-state={item.state}>
      <div className={styles.cardTop}>
        <div className={styles.cardTitle}>
          <span className={styles.projectDot} style={{ background: item.project.color }} aria-hidden />
          <div>
            <h3>{item.objective}</h3>
            <p>{item.project.name} · {item.repository}</p>
          </div>
        </div>
        <span className={styles.chip}>{AUTHORIZATION_STATUS_LABELS[item.authorizationStatus]}</span>
      </div>
      <dl className={styles.facts}>
        <div><dt>Bas</dt><dd><code>{item.pinnedBaseSha.slice(0, 10)}</code></dd></div>
        <div><dt>Scope</dt><dd>{item.readPathCount} läs · {item.writePathCount} skriv</dd></div>
        <div><dt>Worker</dt><dd>{item.workerLabel}</dd></div>
        <div><dt>Kommandon</dt><dd>{item.commandCount} allowlistade</dd></div>
        <div><dt>Gräns</dt><dd>{item.limitsLabel}</dd></div>
        <div><dt>Admission</dt><dd><code>{item.admissionHash.slice(0, 10)}</code></dd></div>
      </dl>
      <p className={styles.lifecycle}>{CODE_WORK_STATE_LABELS[item.state]}</p>
      <div className={styles.cardActions}>
        <Link href={item.detailHref} className={styles.secondary}>Visa exakt scope</Link>
        {item.actionable ? (
          <>
            <label className={styles.expiry}>Giltighet
              <select value={hours} onChange={event => setHours(event.target.value)}>
                <option value="1">1 timme</option><option value="4">4 timmar</option><option value="24">24 timmar</option>
              </select>
            </label>
            <button type="button" className={styles.primary} disabled={outcome.kind === 'working'} onClick={() => decide('grant')}>Godkänn</button>
            <button type="button" className={styles.danger} disabled={outcome.kind === 'working'} onClick={() => decide('deny')}>Avvisa</button>
          </>
        ) : null}
      </div>
      <p className={styles.outcome} role="status" data-kind={outcome.kind}>{outcome.message ?? ''}</p>
    </article>
  )
}
