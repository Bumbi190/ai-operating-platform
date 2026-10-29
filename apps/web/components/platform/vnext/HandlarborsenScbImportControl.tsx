'use client'

import React, { useRef, useState } from 'react'
import { buildLocalReview, type LocalReview } from '@/lib/handlarborsen/lead-finder/local-review'
import { buildResearchQueue } from '@/lib/handlarborsen/lead-finder/lead-research'
import { AtlasResearchQueue, HandlarborsenScbPreviewTable } from './HandlarborsenScbPreviewTable'
import { HandlarborsenResearchResults, parseResearchResponse, type ResearchView } from './HandlarborsenResearchResults'
import styles from './HandlarborsenScbImportControl.module.css'

type PreviewCounts = {
  count: number
  needsReview: number
  excluded: number
  suppressed: number
  inactive: number
  marketingRestricted: number
  priorContact: number
  historyCoverage: 'PARTIAL'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreachReady: 0
  digest: string
}

const ENDPOINT = '/api/atlas/handlarborsen/lead-finder/import'
const CONFIRMATION = 'IMPORTERA 89 SOM EJ KONTAKTBARA'
const MAX_BYTES = 150_000
const RESEARCH_ENDPOINT = '/api/atlas/handlarborsen/lead-finder/research'
const RESEARCH_CONFIRMATION = 'UNDERSÖK 5 FÖRETAG'
const RESEARCH_BATCH_SIZE = 5
// Local session guard only. Tavily's 25-credit key limit remains the hard spend cap.
const RESEARCH_MAX_BATCHES_PER_REVIEW = 5
const RESEARCH_EXTRACT_CONFIRMATION = 'UNDERSÖK 5 FÖRETAG OCH GRANSKA WEBBSIDOR'

function errorLabel(code: string): string {
  switch (code) {
    case 'unauthorized': return 'Du behöver logga in igen.'
    case 'denied': return 'Endast projektets ägare får använda importen.'
    case 'execution_paused': return 'Projektet är pausat. Import kan inte genomföras.'
    case 'disabled': return 'Importen är inte aktiverad på servern.'
    case 'body_too_large': return 'Filerna överskrider storleksgränsen.'
    case 'snapshot_invalid':
    case 'manifest_invalid': return 'Rapporten kunde inte verifieras. Ingen data importerades.'
    case 'digest_not_approved': return 'Den exakta rapporten är inte godkänd för import.'
    case 'table_not_empty': return 'Databasen innehåller redan kandidatposter. Ingen överskrivning gjordes.'
    case 'unsupported_media_type':
    case 'confirmation_invalid': return 'Begäran avvisades. Ingen sökning gjordes.'
    case 'batch_unavailable': return 'Den valda omgången ligger utanför den verifierade företagslistan.'
    case 'unavailable': return 'Importtjänsten eller databasanslutningen är inte tillgänglig.'
    default: return 'Begäran kunde inte genomföras. Ingen data har godkänts för kontakt.'
  }
}

export function HandlarborsenScbImportControl({ writeEnabled = false, researchEnabled = false, extractEnabled = false }: { writeEnabled?: boolean; researchEnabled?: boolean; extractEnabled?: boolean }) {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [summaryFile, setSummaryFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewCounts | null>(null)
  const [review, setReview] = useState<LocalReview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [confirmingResearch, setConfirmingResearch] = useState(false)
  const [researchResults, setResearchResults] = useState<ResearchView[] | null>(null)
  const [researchAttempted, setResearchAttempted] = useState(false)
  const [researchOffset, setResearchOffset] = useState(0)
  const [researchAttempts, setResearchAttempts] = useState(0)
  const queue = review ? buildResearchQueue(review, RESEARCH_BATCH_SIZE, researchOffset) : null
  const firstQueue = review ? buildResearchQueue(review, RESEARCH_BATCH_SIZE) : null
  const eligibleCount = firstQueue?.status === 'ready' ? firstQueue.eligible : 0
  // Extraction can add up to five extra Tavily calls per batch.
  const sessionMaxBatches = extractEnabled ? 2 : RESEARCH_MAX_BATCHES_PER_REVIEW
  const canResearchNext = queue?.status === 'ready' && queue.jobs.length > 0 &&
    researchAttempts < sessionMaxBatches
  const source = useRef<{ csv: string; summary: string } | null>(null)

  function clearPreview() {
    source.current = null
    setConfirmingResearch(false)
    setResearchResults(null)
    setResearchAttempted(false)
    setResearchOffset(0)
    setResearchAttempts(0)
    setPreview(null)
    setReview(null)
    setConfirmation('')
    setCommitted(false)
    setStatus('')
  }

  async function post(mode: 'preview' | 'commit', payload: { csv: string; summary: string }) {
    const body = JSON.stringify(mode === 'preview'
      ? { mode, ...payload }
      : { mode, ...payload, confirmation: CONFIRMATION })
    if (new Blob([body]).size > MAX_BYTES) throw new Error('body_too_large')
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const data: unknown = await response.json().catch(() => null)
    if (!data || typeof data !== 'object') throw new Error('unavailable')
    const r = data as Record<string, unknown>
    if (!response.ok) throw new Error(typeof r.status === 'string' ? r.status : 'unavailable')
    return r
  }

  async function showPreview() {
    if (!csvFile || !summaryFile || busy) return
    clearPreview()
    if (csvFile.size > MAX_BYTES || summaryFile.size > MAX_BYTES ||
      csvFile.size + summaryFile.size > MAX_BYTES) {
      setStatus(errorLabel('body_too_large'))
      return
    }
    setBusy(true)
    try {
      // Browser reads the files only after an explicit click. No localStorage,
      // background upload, or download of source records is used.
      const [csv, summary] = await Promise.all([csvFile.text(), summaryFile.text()])
      const result = await post('preview', { csv, summary })
      const c = result.aggregate
      if (result.status !== 'preview' || typeof c !== 'object' || c === null) throw new Error('unavailable')
      const counts = c as PreviewCounts
      if (counts.count !== 89 || counts.outreachReady !== 0 ||
        counts.historyCoverage !== 'PARTIAL' ||
        counts.contactability !== 'BLOCKED_PENDING_VERIFICATION' ||
        !/^[0-9a-f]{64}$/.test(counts.digest)) throw new Error('unavailable')
      // Parse and display only AFTER the owner-authenticated server has
      // verified these exact selected files. No company rows are returned by
      // the server: the browser already holds the owner's chosen report.
      const verified = buildLocalReview(csv, summary)
      if (verified.status !== 'ready' ||
        verified.review.counts.total !== counts.count ||
        verified.review.counts.inactive !== counts.inactive ||
        verified.review.counts.restricted !== counts.marketingRestricted ||
        verified.review.counts.priorContact !== counts.priorContact ||
        verified.review.outreachReady !== 0) throw new Error('snapshot_invalid')
      source.current = { csv, summary }
      setPreview(counts)
      setReview(verified.review)
      setStatus('Förhandskontrollen är godkänd. Ingen data har importerats.')
    } catch (e) {
      source.current = null
      setReview(null)
      setStatus(errorLabel(e instanceof Error ? e.message : 'unavailable'))
    } finally {
      setBusy(false)
    }
  }

  async function runResearch() {
    if (!researchEnabled || !preview || !source.current || busy || researchAttempted || !canResearchNext ||
        !queue || queue.status !== 'ready') return
    const offset = researchOffset
    const expected = queue.jobs.map(job => job.orgnr)
    const { csv, summary } = source.current
    const body = JSON.stringify({
      csv, summary, digest: preview.digest, offset,
      confirmation: extractEnabled ? RESEARCH_EXTRACT_CONFIRMATION : RESEARCH_CONFIRMATION,
    })
    setConfirmingResearch(false)
    if (new Blob([body]).size > MAX_BYTES) { setStatus(errorLabel('body_too_large')); return }
    setResearchAttempted(true)
    setResearchAttempts(count => count + 1)
    setBusy(true)
    setStatus(extractEnabled ? 'Undersöker… högst 5 grundsökningar och 5 separata sidkontroller.' : 'Söker… högst 5 sökningar körs.')
    try {
      // One explicit approval = one unique batch of at most five basic searches.
      // Earlier results remain in this tab; nothing is persisted or sent.
      const response = await fetch(RESEARCH_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
        cache: 'no-store', credentials: 'same-origin',
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const code = data && typeof data === 'object' ? (data as Record<string, unknown>).status : null
        throw new Error(typeof code === 'string' ? code : 'unavailable')
      }
      const results = parseResearchResponse(data)
      const payload = data as Record<string, unknown>
      if (!results || payload.offset !== offset || payload.eligible !== queue.eligible ||
        results.length !== expected.length || results.some((r, i) => r.orgnr !== expected[i]))
        throw new Error('unavailable')
      setResearchResults(previous => [...(previous ?? []), ...results])
      setStatus(`Omgång ${Math.floor(offset / RESEARCH_BATCH_SIZE) + 1} klar. ${results.length} företag granskade preliminärt, inga kontaktbara.`)
    } catch (e) {
      setStatus(`Omgång ${Math.floor(offset / RESEARCH_BATCH_SIZE) + 1} kunde inte verifieras. ${errorLabel(e instanceof Error ? e.message : 'unavailable')} Inget automatiskt omförsök sker.`)
    } finally {
      // Never retry a possibly charged batch from this review session.
      // Advance even if the network failed or only partial results were returned.
      setResearchOffset(current => current + RESEARCH_BATCH_SIZE)
      setResearchAttempted(false)
      setBusy(false)
    }
  }

  async function importWithApproval() {
    if (!writeEnabled || !preview || !source.current || confirmation !== CONFIRMATION || busy || committed) return
    setBusy(true)
    try {
      const result = await post('commit', source.current)
      if (result.status !== 'imported' || result.imported !== true || result.count !== 89 ||
        result.digest !== preview.digest) throw new Error('unavailable')
      source.current = null
      setCommitted(true)
      setConfirmation('')
      setStatus('89 juridiska företag har lagrats för granskning. Inget företag är kontaktbart.')
    } catch (e) {
      setStatus(errorLabel(e instanceof Error ? e.message : 'unavailable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="hb-import-heading">
      <header>
        <p className={styles.kicker}>Endast projektägaren · särskilt aktiverad funktion</p>
        <h2 id="hb-import-heading">Importförhandsgranskning</h2>
        <p>Välj den rensade SCB-rapporten och dess sammanfattning. Ingen import sker när du förhandsgranskar.</p>
      </header>
      <div className={styles.fields}>
        <label htmlFor="hb-audit-csv">Rensad SCB-rapport (.csv)</label>
        <input id="hb-audit-csv" type="file" accept=".csv,text/csv" disabled={busy}
          onChange={e => { setCsvFile(e.target.files?.[0] ?? null); clearPreview() }} />
        <label htmlFor="hb-audit-summary">Verifierad sammanfattning (.json)</label>
        <input id="hb-audit-summary" type="file" accept=".json,application/json" disabled={busy}
          onChange={e => { setSummaryFile(e.target.files?.[0] ?? null); clearPreview() }} />
        <button type="button" onClick={showPreview} disabled={!csvFile || !summaryFile || busy}>
          {busy ? 'Kontrollerar…' : 'Förhandsgranska utan import'}
        </button>
      </div>

      {preview ? <div className={styles.preview} aria-label="Verifierad importförhandsvisning">
        <strong>{preview.count} juridiska företag</strong>
        <p>{preview.needsReview} för vidare granskning, {preview.excluded} exkluderade och {preview.suppressed} spärrade. Ingen av dem är godkänd för kontakt.</p>
        <p>Tidigare kontakthistorik: ofullständig. Kontrollsumma för rapporten:</p>
        <code>{preview.digest}</code>
      </div> : null}

      {preview && review ? <AtlasResearchQueue review={review} offset={researchOffset} completed={researchResults?.length ?? 0} /> : null}

      {researchEnabled && preview && review ? <div className={styles.researchResults}>
        <p role="status" aria-live="polite">
          Omgång {Math.floor(researchOffset / RESEARCH_BATCH_SIZE) + 1} av {Math.ceil(eligibleCount / RESEARCH_BATCH_SIZE)}.
          {' '}{researchAttempts} av högst {sessionMaxBatches} omgångar försökt i denna förhandsgranskning.
          {' '}Tidigare resultat nedan finns endast kvar i denna flik.
        </p>
        {researchAttempts === 0 && !confirmingResearch ? <div className={styles.fields}>
          <label htmlFor="hb-research-offset">Återuppta från omgång efter omladdning (valfritt)</label>
          <select id="hb-research-offset" value={researchOffset} disabled={busy} onChange={e => setResearchOffset(Number(e.target.value))}>
            {Array.from({ length: Math.ceil(eligibleCount / RESEARCH_BATCH_SIZE) }, (_, i) =>
              <option value={i * RESEARCH_BATCH_SIZE} key={i}>Omgång {i + 1} – från företag {i * RESEARCH_BATCH_SIZE + 1}</option>)}
          </select>
          <small>Ingen tidigare körhistorik sparas mellan besök. Välj föregående fortsättningspunkt varsamt för att undvika dubbla Tavily-kostnader.</small>
        </div> : null}
        <div className={styles.researchActions}>
          {!confirmingResearch && !researchAttempted && canResearchNext ? <button type="button" disabled={busy} onClick={() => setConfirmingResearch(true)}>
            {extractEnabled ? 'Undersök 5 företag och granska webbplatser' :
              researchAttempts === 0 && researchOffset === 0 ? 'Undersök 5 företag (max 5 sökkrediter)' :
              `Undersök nästa ${queue && queue.status === 'ready' ? queue.jobs.length : 5} företag (max 5 sökkrediter)`}
          </button> : null}
        </div>
        {confirmingResearch && canResearchNext ? <div role="alert">
          <p>Omgång {Math.floor(researchOffset / RESEARCH_BATCH_SIZE) + 1}, företag {researchOffset + 1}–{researchOffset + (queue && queue.status === 'ready' ? queue.jobs.length : 5)}.
            {' '}{extractEnabled
              ? 'Högst 5 grundsökningar och upp till 5 extra sidkontroller kan förbruka krediter. Ingen kontakt får godkännas eller sparas.'
              : 'Högst 5 grundsökningar kan förbruka 5 Tavily-krediter. Ingen kontakt får godkännas eller sparas.'}</p>
          <div className={styles.researchActions}>
            <button type="button" disabled={busy} onClick={runResearch}>Bekräfta och sök</button>
            <button type="button" data-variant="secondary" disabled={busy} onClick={() => setConfirmingResearch(false)}>Avbryt</button>
          </div>
        </div> : null}
        {!canResearchNext && !busy ? <p>
          {researchAttempts >= sessionMaxBatches
            ? 'Omgångsgränsen för denna förhandsgranskning är nådd. Tavily-nyckelns separata månadsgräns gäller fortfarande.'
            : 'Inga fler företag finns i den valda forskningskön.'}
        </p> : null}
        {researchResults ? <HandlarborsenResearchResults results={researchResults} /> : null}
      </div> : null}

      {preview && review ? <HandlarborsenScbPreviewTable review={review} researched={researchResults !== null} /> : null}

      {writeEnabled && preview && !committed ?<div className={styles.confirm}>
        <p>Även en framtida import lagrar endast blockerade granskningsposter. Ingen utskicksknapp aktiveras.</p>
        <label htmlFor="hb-import-confirm">Skriv exakt: {CONFIRMATION}</label>
        <input id="hb-import-confirm" type="text" autoComplete="off" spellCheck={false}
          value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
        <button type="button" onClick={importWithApproval}
          disabled={busy || confirmation !== CONFIRMATION}>
          Importera endast som ej kontaktbara
        </button>
      </div> : null}
      {!writeEnabled ? <p className={styles.note}>Databasskrivning är avstängd. Du kan endast förhandsgranska.</p> : null}
      {status ? <p className={styles.feedback} role="status" aria-live="polite">{status}</p> : null}
    </section>
  )
}
