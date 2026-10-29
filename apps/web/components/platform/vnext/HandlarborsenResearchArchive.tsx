'use client'

import React, { useMemo, useState } from 'react'
import { parseResearchArchive, type ArchiveReview, type ArchiveReviewCompany } from '@/lib/handlarborsen/lead-finder/research-archive'
import styles from './HandlarborsenResearchArchive.module.css'

const URL = '/api/atlas/handlarborsen/lead-finder/archive'
const CONFIRMATION = 'SPARA 81 SOM EJ KONTAKTBARA'
const MAX_FILE_BYTES = 95_000

export function HandlarborsenResearchArchive({ archive, saveEnabled = false }: { archive: ArchiveReview; saveEnabled?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewedArchive, setPreviewedArchive] = useState<ArchiveReview | null>(null)
  const [report, setReport] = useState<unknown>(null)
  const [digest, setDigest] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const activeArchive = archive.status === 'ready' ? archive : previewedArchive ?? archive
  const isPreviewOnly = archive.status !== 'ready' && activeArchive.status === 'ready'
  const filtered = useMemo(() => {
    if (activeArchive.status !== 'ready') return []
    const q = search.trim().toLocaleLowerCase('sv')
    return activeArchive.report.result.filter(x => {
      const category = x.sale ? 'sale' : x.registeredOnly ? 'registered' : x.matches===0 ? 'empty' : 'other'
      const matchFilter = filter === 'all' || filter === category ||
        (filter === 'crm' && x.crm === 'matched_existing_contact')
      return matchFilter && (!q || [x.name, x.city, x.orgnr].join(' ').toLocaleLowerCase('sv').includes(q))
    })
  }, [activeArchive, filter, search])

  if (archive.status === 'disabled') return null

  async function send(mode: 'preview' | 'save') {
    if (busy || (mode === 'preview' && !file) || (mode === 'save' && (!saveEnabled || !digest || !report || confirm !== CONFIRMATION))) return
    setBusy(true)
    setFeedback('')
    try {
      let source = report
      if (mode === 'preview') {
        if (!file || file.size < 1 || file.size > MAX_FILE_BYTES)
          throw new Error('Fel filstorlek. Välj den färdiga kallgranskning.json-rapporten.')
        source = JSON.parse(await file.text()) as unknown
      }
      const body = mode === 'preview'
        ? { mode, report: source }
        : { mode, report: source, digest, confirmation: confirm }
      const response = await fetch(URL, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!data || typeof data !== 'object') throw new Error('Svarsformatet kunde inte verifieras.')
      const value = data as Record<string, unknown>
      if (!response.ok) throw new Error('Säkerhetskontrollen nekade åtgärden ('+String(value.status??response.status)+').')
      if (mode === 'preview') {
        if (value.status !== 'preview' || value.count !== 81 || value.outreachReady !== false ||
          value.historyComplete !== false || typeof value.digest !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.digest))
          throw new Error('Rapporten kunde inte valideras.')
        const parsed = parseResearchArchive(source)
        const serverReport = value.report
        if (!parsed.ok || !serverReport || typeof serverReport !== 'object' ||
          !Array.isArray((serverReport as { result?: unknown }).result))
          throw new Error('Källgranskningen kunde inte verifieras.')
        const results = (serverReport as {result: unknown[]}).result
        const approvedCrm = ['matched_existing_contact', 'no_match_in_partial_history', 'crm_unavailable']
        const valid = results.length === parsed.value.result.length && results.every((raw, i) => {
          if (!raw || typeof raw !== 'object') return false
          const row = raw as Record<string, unknown>
          const original = parsed.value.result[i]
          return row.orgnr === original.orgnr && row.name === original.name &&
            row.contactable === false && row.outreachReady === false &&
            row.historyComplete === false && approvedCrm.includes(String(row.crm)) &&
            Array.isArray(row.crmReasons) && row.crmReasons.every(x => typeof x === 'string' && x.length < 100)
        })
        if (!valid) throw new Error('CRM-kontrollen kunde inte verifieras.')
        const crmStatus = value.crmStatus
        const safeCrm = ['ready','unavailable','incomplete','disabled','forbidden'].includes(String(crmStatus))
          ? crmStatus as 'ready' | 'unavailable' | 'incomplete' | 'disabled' | 'forbidden' : 'unavailable'
        setPreviewedArchive({
          status: 'ready',
          report: { counts: parsed.value.counts, result: results as ArchiveReviewCompany[] },
          sourceDigest: value.digest,
          createdAt: new Date().toISOString(),
          crmStatus: safeCrm,
          outreachReady: false,
          historyComplete: false,
        })
        setReport(source)
        setDigest(value.digest)
        setFeedback('81 juridiska företag förhandsgranskade med CRM-status. Inget har sparats eller godkänts för kontakt.')
      } else {
        if (value.status !== 'saved_for_review' || value.outreachReady !== false ||
          value.historyComplete !== false || value.digest !== digest) throw new Error('Lagringen kunde inte verifieras.')
        setFeedback('Rapporten sparad säkert. Laddar om granskningsvyn.')
        window.location.reload()
      }
    } catch (e) {
      if (mode === 'preview') { setReport(null); setDigest(null); setPreviewedArchive(null) }
      setFeedback(e instanceof Error ? e.message : 'Arkivet kunde inte nås.')
    } finally { setBusy(false) }
  }

  return (
    <section className={styles.panel} aria-labelledby="hb-archive-heading">
      <header>
        <p className={styles.eyebrow}>Endast projektägaren · skyddad Preview</p>
        <h2 id="hb-archive-heading">Atlas – bestående källgranskning</h2>
        <p>En separat granskningsrapport för de 81 undersökta juridiska företagen. Ingen import sker till CRM, inga utskick skickas och ingen är kontaktbar.</p>
      </header>
      {archive.status === 'unavailable' ? <p className={styles.warning} role="status">Arkivtabellen eller läsbehörigheten är ännu inte verifierad. Inga uppgifter visas förrän kontrollen är klar.</p> : null}
      {archive.status === 'empty' ? <p>Inget bestående researcharkiv finns ännu. Den lokala rapporten kan laddas upp en gång och sparas efter separat bekräftelse.</p> : null}
      {activeArchive.status === 'ready' ? <>
        <div className={styles.metrics} aria-label="Källgranskningens status">
          <div><strong>{activeArchive.report.counts.covered} / 81</strong><small>Företag genomgångna</small></div>
          <div><strong>{activeArchive.report.counts.saleSignalsToReview}</strong><small>Försäljningsindikationer</small></div>
          <div><strong>{activeArchive.report.counts.potentialOwnDomain}</strong><small>Möjliga egna domäner</small></div>
          <div><strong>{activeArchive.report.result.filter(x => x.crm === 'matched_existing_contact').length}</strong><small>Matchningar i Omniras CRM</small></div>
        </div>
        <p className={styles.warning} role="note">
          CRM-status: {activeArchive.crmStatus === 'ready' ? 'Jämförd med tillgängliga Omnira-kontakter' : 'Inte verifierad'}.
          {' '}Den externa historiska pilotlistan är inte komplett. Ingen CRM-match betyder INTE ett nytt företag.
          {' '}Samtliga är fortsatt spärrade för kontakt.
        </p>
        <div className={styles.filters}>
          <label>Filtrera <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">Alla 81</option>
            <option value="sale">Försäljningsindikationer</option>
            <option value="registered">Registrerad bilhandel</option>
            <option value="crm">Match i Omniras CRM</option>
            <option value="empty">Inga relevanta källor</option>
            <option value="other">Övriga</option>
          </select></label>
          <label>Sök företag <input type="search" value={search} maxLength={80}
            onChange={e=>setSearch(e.target.value.slice(0,80))} placeholder="Företag, ort eller org.nr"/></label>
        </div>
        <p className={styles.count} role="status" aria-live="polite">Visar {filtered.length} av 81 · alla ej kontaktbara</p>
        <div className={styles.tableWrap} role="region" aria-label="Forskningsarkiv" tabIndex={0}>
          <table><thead><tr><th scope="col">Företag</th><th scope="col">Belägg</th><th scope="col">Tidigare kontakt</th><th scope="col">Källa</th></tr></thead>
            <tbody>{filtered.map(x=><tr key={x.orgnr}>
              <td><strong>{x.name}</strong><small>{x.orgnr} · {x.city}</small></td>
              <td>{x.label}<small>{x.matches} företagsspecifika sökresultat</small></td>
              <td><span className={x.crm === 'matched_existing_contact' ? styles.warningText : ''}>
                {x.crm === 'matched_existing_contact' ? 'Känd kontakt – spärrad' :
                 x.crm === 'crm_unavailable' ? 'CRM ej kontrollerat' : 'Ingen säker match – historik ofullständig'}
              </span><small>Ej kontaktbar</small></td>
              <td>{x.source ? <a href={x.source} target="_blank" rel="noopener noreferrer nofollow">Granska källa</a> : 'Saknas'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <small className={styles.footnote}>{isPreviewOnly ? 'Endast tillfällig förhandsvisning, inte sparad' : 'Arkiv sparat '+activeArchive.createdAt.slice(0,10)} · kontrollsumma: {activeArchive.status === 'ready' ? activeArchive.sourceDigest.slice(0,14) : ''}…</small>
      </> : null}
      <div className={styles.upload}>
        <h3>Spara en granskningsrapport</h3>
        <label htmlFor="hb-archive-file">Välj den lokala filen <code>kallgranskning.json</code></label>
        <input id="hb-archive-file" type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{setFile(e.target.files?.[0]??null);setDigest(null);setReport(null);setConfirm('');setFeedback('')}} />
        <button type="button" disabled={busy || !file} onClick={()=>void send('preview')}>Förhandskontrollera 81 utan lagring</button>
        {digest && saveEnabled ? <>
          <p>Förhandsgranskningen är godkänd. Alla företag sparas som ej kontaktbara; inga CRM-uppgifter ändras.</p>
          <label htmlFor="hb-archive-confirm">Skriv exakt: {CONFIRMATION}</label>
          <input id="hb-archive-confirm" type="text" value={confirm} spellCheck={false}
            autoComplete="off" disabled={busy} onChange={e=>setConfirm(e.target.value)} />
          <button type="button" disabled={busy || confirm !== CONFIRMATION}
            onClick={()=>void send('save')}>Spara endast som granskningsunderlag</button>
        </> : null}
        {!saveEnabled ? <p className={styles.warning} role="note">Förhandsvisning fungerar utan arkivtabell. Bestående lagring är ännu avstängd.</p> : null}
        {feedback ? <p role="status" aria-live="polite">{feedback}</p> : null}
      </div>
    </section>
  )
}
