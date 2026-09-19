'use client'

import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AUTHORIZATION_STATUS_LABELS,
  CODE_WORK_STATE_LABELS,
  type CodeWorkDetailModel,
} from '@/lib/atlas/code-work/control-plane/operator-model'
import styles from './CodeWorkDetail.module.css'

type Outcome = { kind: 'idle' | 'working' | 'done' | 'error'; message?: string }

const short = (value: string) => `${value.slice(0, 12)}…`

export function CodeWorkDetail({ model }: { model: CodeWorkDetailModel }) {
  const router = useRouter()
  const [hours, setHours] = useState('4')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  const act = useCallback(async (action: 'grant' | 'deny' | 'cancel') => {
    setOutcome({ kind: 'working' })
    const body = action === 'grant'
      ? { action, projectSlug: model.project.slug, expiresAt: new Date(Date.now() + Number(hours) * 3_600_000).toISOString() }
      : { action, projectSlug: model.project.slug }
    try {
      const response = await fetch(`/api/atlas/code-work/${model.workId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setOutcome({ kind: 'error', message: payload?.error ?? 'Åtgärden kunde inte registreras.' })
        router.refresh()
        return
      }
      setOutcome({ kind: 'done', message: action === 'grant' ? 'Behörigheten beviljades.' : action === 'deny' ? 'Förslaget avvisades.' : 'Kontrollposten avbröts.' })
      router.refresh()
    } catch {
      setOutcome({ kind: 'error', message: 'Åtgärden kunde inte skickas.' })
    }
  }, [hours, model.project.slug, model.workId, router])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href={`/approvals?project=${encodeURIComponent(model.project.slug)}`}>← Till Granskningar</Link>
          <p className={styles.eyebrow}>SDF‑1B2 · Kodarbetsförslag</p>
          <h1>{model.objective}</h1>
          <p className={styles.lede}>{model.project.name} · {model.repository}</p>
        </div>
        <div className={styles.statuses}>
          <span className={styles.truth}>AUTHORIZED CONTROL PLANE / NO EXECUTION RUNTIME</span>
          <span className={styles.chip}>{CODE_WORK_STATE_LABELS[model.state]}</span>
        </div>
      </header>

      <section className={styles.summary} aria-label="Sammanfattning">
        <Fact label="Behörighet" value={AUTHORIZATION_STATUS_LABELS[model.authorizationStatus]} />
        <Fact label="Admission" value={short(model.admissionHash)} mono />
        <Fact label="Kontrollpost" value={short(model.workId)} mono />
        <Fact label="Kvitton" value={String(model.receipts.length)} />
      </section>

      <div className={styles.grid}>
        <Section title="Uppdrag">
          <p>{model.objective}</p>
          <Fact label="Work Package" value={model.workPackageId} mono />
        </Section>

        <Section title="Repo / scope">
          <Fact label="Repository" value={model.repository} />
          <Fact label="Föreslagen bas · ännu inte broker-verifierad" value={model.pinnedBaseSha} mono />
          <PathList label="Läs" values={model.readPaths} />
          <PathList label="Skriv" values={model.writePaths} />
          {model.deniedPaths.length > 0 ? <PathList label="Nekat" values={model.deniedPaths} /> : null}
        </Section>

        <Section title="Worker">
          <Fact label="Adapter" value="claude_patch_v1" mono />
          <Fact label="Provider / modell" value={model.workerLabel} />
          <Fact label="Capability" value="code.worktree.patch.v1" mono />
          <p className={styles.note}>Inga direkta tools, inget shell, ingen Git-, filesystem- eller nätverksåtkomst.</p>
        </Section>

        <Section title="Kommandon / gränser">
          <PathList label="Allowlistade command-id" values={model.commandIds} />
          <div className={styles.compactFacts}>
            <Fact label="Iterationer" value={String(model.limits.maxWorkerIterations)} />
            <Fact label="Ändrade filer" value={String(model.limits.maxChangedFiles)} />
            <Fact label="Diff" value={`${Math.round(model.limits.maxDiffBytes / 1024)} KiB`} />
            <Fact label="Total tid" value={`${model.limits.maxTotalRuntimeSeconds}s`} />
          </div>
        </Section>

        <Section title="Authorization">
          <Fact label="Status" value={AUTHORIZATION_STATUS_LABELS[model.authorizationStatus]} />
          <Fact label="Authorization-id" value={model.authorizationId} mono />
          <Fact label="Händelser" value={String(model.authorizationEventCount)} />
          <Fact label="Giltig till" value={model.authorizationExpiresAt ?? 'Inte beviljad'} mono />
        </Section>

        <Section title="Lifecycle">
          <ol className={styles.timeline}>
            {model.lifecycle.map(item => (
              <li key={item.label} data-present={item.at ? 'true' : 'false'}>
                <span>{item.label}</span><time>{item.at ?? 'Ej inträffad'}</time>
              </li>
            ))}
          </ol>
          {model.terminalReasonCode ? <Fact label="Terminal orsak" value={model.terminalReasonCode} mono /> : null}
        </Section>
      </div>

      <section className={styles.receipts} aria-labelledby="receipt-heading">
        <div className={styles.sectionHead}><h2 id="receipt-heading">Receipts</h2><span>{model.receipts.length}</span></div>
        {model.receipts.length === 0 ? <p className={styles.note}>Inga kvitton registrerade.</p> : (
          <ol>
            {model.receipts.map(receipt => (
              <li key={receipt.receiptId}>
                <div><strong>#{receipt.sequence} · {receipt.eventLabel}</strong><span>{receipt.receiptClass} · {receipt.producerType}/{receipt.producerId}</span></div>
                <time dateTime={receipt.observedAt}>{receipt.observedAt}</time>
                {Object.keys(receipt.payload).length > 0 ? (
                  <div className={styles.receiptPayload}>{Object.entries(receipt.payload).map(([key, value]) => <Fact key={key} label={key} value={String(value)} mono />)}</div>
                ) : <p className={styles.note}>Okänd eller avsiktligt dold payload.</p>}
                <p className={styles.hash}>payload {short(receipt.payloadHash)} · kvitto {short(receipt.receiptHash)} · föregående {receipt.previousReceiptHash ? short(receipt.previousReceiptHash) : 'kedjestart'}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.controls} aria-labelledby="control-heading">
        <div><h2 id="control-heading">Controls</h2><p>Beslut ändrar endast kontrollplanet. Ingen kod exekveras här.</p></div>
        <div className={styles.actions}>
          {model.actionable ? (
            <>
              <label>Giltighet<select value={hours} onChange={event => setHours(event.target.value)}><option value="1">1 timme</option><option value="4">4 timmar</option><option value="24">24 timmar</option></select></label>
              <button data-action="grant" disabled={outcome.kind === 'working'} onClick={() => act('grant')}>Godkänn</button>
              <button data-action="deny" disabled={outcome.kind === 'working'} onClick={() => act('deny')}>Avvisa</button>
            </>
          ) : null}
          {model.cancelable ? <button data-action="cancel" disabled={outcome.kind === 'working'} onClick={() => act('cancel')}>Avbryt kontrollpost</button> : null}
        </div>
        <p className={styles.outcome} role="status" data-kind={outcome.kind}>{outcome.message ?? ''}</p>
      </section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className={styles.fact}><span className={styles.factLabel}>{label}</span><span className={styles.factValue} data-mono={mono ? 'true' : 'false'}>{value}</span></div>
}

function PathList({ label, values }: { label: string; values: string[] }) {
  return <div className={styles.paths}><h3>{label}</h3><ul>{values.map(value => <li key={value}><code>{value}</code></li>)}</ul></div>
}
