'use client'

import React, { useMemo, useState } from 'react'
import type { ArchiveReview } from '@/lib/handlarborsen/lead-finder/research-archive'
import styles from './HandlarborsenResearchArchive.module.css'

const URL = '/api/atlas/handlarborsen/lead-finder/archive'
const CONFIRMATION = 'SPARA 81 SOM EJ KONTAKTBARA'
const MAX_FILE_BYTES = 95_000

export function HandlarborsenResearchArchive({ archive }: { archive: ArchiveReview }) {
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<unknown>(null)
  const [digest, setDigest] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (archive.status !== 'ready') return []
    const q = search.trim().toLocaleLowerCase('sv')
    return archive.report.result.filter(x => {
      const category = x.sale ? 'sale' : x.registeredOnly ? 'registered' : x.matches===0 ? 'empty' : 'other'
      const matchFilter = filter === 'all' || filter === category ||
        (filter === 'crm' && x.crm === 'matched_existing_contact')
      return matchFilter && (!q || [x.name, x.city, x.orgnr].join(' ').toLocaleLowerCase('sv').includes(q))
    })
  }, [archive, filter, search])

  if (archive.status === 'disabled') return null

  async function send(mode: 'preview' | 'save') {
    if (busy || (mode === 'preview' && !file) || (mode === 'save' && (!digest || !report || confirm !== CONFIRMATION))) return
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
        setReport(source)
        setDigest(value.digest)
        setFeedback('Alla 81 juridiska företag är validerade. Inget har sparats eller godkänts för kontakt.')
      } else {
        if (value.status !== 'saved_for_review' || value.outreachReady !== false ||
          value.historyComplete !== false || value.digest !== digest) throw new Error('Lagringen kunde inte verifieras.')
        setFeedback('Rapporten sparad säkert. Laddar om granskningsvyn.')
        window.location.reload()
      }
    } catch (e) {
      if (mode === 'preview') { setReport(null); setDigest(null) }
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
      {archive.status === 'ready' ? <>
        <div className={styles.metrics} aria-label="Källgranskningens status">
          <div><strong>{archive.report.counts.covered} / 81</strong><small>Företag genomgångna</small></div>
          <div><strong>{archive.report.counts.saleSignalsToReview}</strong><small>Försäljningsindikationer</small></div>
          <div><strong>{archive.report.counts.potentialOwnDomain}</strong><small>Möjliga egna domäner</small></div>
          <div><strong>{archive.report.result.filter(x => x.crm === 'matched_existing_contact').length}</strong><small>Matchningar i Omniras CRM</small></div>
        </div>
        <p className={styles.warning} role="note">
          CRM-status: {archive.crmStatus === 'ready' ? 'Jämförd med tillgängliga Omnira-kontakter' : 'Inte verifierad'}.
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
        <small className={styles.footnote}>Arkivets kontrollsumma: {archive.sourceDigest.slice(0,14)}… · sparad {archive.createdAt.slice(0,10)}.</small>
      </> : null}
      {archive.status !== 'unavailable' ? <div className={styles.upload}>
        <h3>Spara en granskningsrapport</h3>
        <label htmlFor="hb-archive-file">Välj den lokala filen <code>kallgranskning.json</code></label>
        <input id="hb-archive-file" type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{setFile(e.target.files?.[0]??null);setDigest(null);setReport(null);setConfirm('');setFeedback('')}} />
        <button type="button" disabled={busy || !file} onClick={()=>void send('preview')}>Förhandskontrollera 81 utan lagring</button>
        {digest ? <>
          <p>Förhandsgranskningen är godkänd. Alla företag sparas som ej kontaktbara; inga CRM-uppgifter ändras.</p>
          <label htmlFor="hb-archive-confirm">Skriv exakt: {CONFIRMATION}</label>
          <input id="hb-archive-confirm" type="text" value={confirm} spellCheck={false}
            autoComplete="off" disabled={busy} onChange={e=>setConfirm(e.target.value)} />
          <button type="button" disabled={busy || confirm !== CONFIRMATION}
            onClick={()=>void send('save')}>Spara endast som granskningsunderlag</button>
        </> : null}
        {feedback ? <p role="status" aria-live="polite">{feedback}</p> : null}
      </div> : null}
    </section>
  )
}
