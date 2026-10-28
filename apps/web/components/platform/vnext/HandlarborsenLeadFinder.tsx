import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Building2, Database, LockKeyhole, Search, ShieldCheck } from 'lucide-react'
import type { LeadFinderReadiness } from '@/lib/handlarborsen/lead-finder/readiness'
import type { KnownContacts } from '@/lib/handlarborsen/lead-finder/known-contacts'
import { filterCandidateViews, type SavedCandidates } from '@/lib/handlarborsen/lead-finder/saved-candidates'
import { filterLocalReview, normalizeLocalFilter, LOCAL_REVIEW_FILTERS, type LocalReviewFilter, type LocalReviewState } from '@/lib/handlarborsen/lead-finder/local-review'
import styles from './HandlarborsenLeadFinder.module.css'
import { HandlarborsenScbImportControl } from './HandlarborsenScbImportControl'

type Summary = Pick<KnownContacts, 'status' | 'count' | 'externalPilotRegistryConnected'> & { reviewBlocked: true }
export interface LeadFinderProps {
  slug: string
  readiness: LeadFinderReadiness
  known: Summary
  saved: SavedCandidates
  search: string
  filter: string
  /** Opt-in local audited report; omitted/disabled renders nothing extra. */
  localReview?: LocalReviewState
  localSearch?: string
  localFilter?: string
  importPreviewEnabled?: boolean
  importWriteEnabled?: boolean
  researchEnabled?: boolean
  researchExtractEnabled?: boolean
}

const localFilterLabels: Record<LocalReviewFilter, string> = {
  all: 'Alla', active: 'Verksamma per SCB', inactive: 'Ej verksamma per SCB', restricted: 'SCB-spärr',
  prior: 'Tidigare kontakt', possible_group: 'Möjlig koncerngrupp (namn)', other_legal_form: 'Annan juridisk form',
}
const channelLabels = { reklam: 'reklam', epost: 'e-post', telefon: 'telefon' }
const localReasons: Record<string, string> = {
  profile_missing: 'Användarprofilen kunde inte avgöras.', path_rejected: 'Den lokala mappen godkändes inte.',
  read_failed: 'Rapporten kunde inte läsas säkert.', summary_mismatch: 'Rapportens summor stämmer inte med raderna.',
}

const statusLabels = {
  needs_review: 'Behöver granskning',
  approved_for_outreach_review: 'Granskad – ej utskicksklar',
  rejected: 'Avvisad',
  duplicate: 'Dubblett',
  excluded: 'Exkluderad',
  suppressed: 'Kontaktspärr',
}
const sourceLabels: Record<string, string> = {
  disabled: 'Inte aktiverad', ready: 'Läsbar', incomplete: 'Ofullständigt underlag',
  unavailable: 'Kunde inte verifieras', forbidden: 'Åtkomst nekad',
}

/** Local audited SCB report. Renders nothing when disabled (always the case in production). */
function LocalReviewSection({ state, search, filter }: { state: LocalReviewState; search: string; filter: string }) {
  if (state.status === 'disabled') return null
  if (state.status === 'unavailable') {
    return (
      <section className={styles.panel} aria-labelledby="hb-local-title">
        <h2 id="hb-local-title">Lokal SCB-granskning</h2>
        <div className={styles.empty} role="status">
          <LockKeyhole size={26} aria-hidden="true" />
          <h3>Den lokala rapporten kan inte verifieras</h3>
          <p>{localReasons[state.reason] ?? 'Rapporten bedömdes osäker och visas därför inte.'} Inga siffror visas.</p>
        </div>
      </section>
    )
  }
  const { review } = state
  const activeFilter = normalizeLocalFilter(filter)
  const rows = filterLocalReview(review.rows, search, activeFilter)
  const c = review.counts
  return (
    <section className={styles.panel} aria-labelledby="hb-local-title" data-local-review="ready">
      <div className={styles.sectionHeader}>
        <div><p className={styles.kicker}>Lokal utvecklingsvy · endast ägare</p><h2 id="hb-local-title">Lokal SCB-granskning</h2></div>
        <span className={styles.safety}><ShieldCheck size={15} aria-hidden="true" /> Källa: {review.provenance}</span>
      </div>
      <p className={styles.localNote} role="note">
        {c.total} juridiska enheter granskade lokalt ({c.active} verksamma och {c.inactive} ej verksamma enligt SCB). Verksam enligt SCB är inte detsamma som lämplig bilhandlare
        eller tillåtelse att kontakta. Alla företag väntar på mänsklig granskning och är spärrade tills de verifierats (BLOCKED_PENDING_VERIFICATION). Historiken är ofullständig:
        ingen exakt träff betyder inte att företaget är nytt. {review.excludedPhysicalPersons} fysisk person har uteslutits. Detta är inte live-API och ingenting har godkänts eller skickats.
      </p>
      <ul className={styles.localWarnings} aria-label="Varningar">
        <li data-tone="warning">{c.restricted} företag har SCB-spärr (reklam, e-post eller telefon). Kontakta inte.</li>
        <li data-tone="warning">{c.inactive} är inte verksamma enligt SCB.</li>
        <li data-tone="warning">{c.priorContact} är tidigare kontaktat enligt en ofullständig historik.</li>
        <li data-tone="info">{c.possibleGroup} har ett gemensamt namnled (hypotes). Det är inget belägg för ägarskap eller koncern.</li>
      </ul>
      <form method="get" className={styles.filters} aria-label="Sök och filtrera lokal granskning">
        <label htmlFor="hb-local-q">Sök</label>
        <input type="search" id="hb-local-q" name="local_q" maxLength={80} defaultValue={search.slice(0, 80)} placeholder="Företag, org.nr eller ort" />
        <label htmlFor="hb-local-filter">Filter</label>
        <select id="hb-local-filter" name="local_filter" defaultValue={activeFilter}>
          {LOCAL_REVIEW_FILTERS.map(v => <option key={v} value={v}>{localFilterLabels[v]}</option>)}
        </select>
        <button type="submit">Filtrera</button>
      </form>
      <p className={styles.localCount} aria-live="polite">Visar {rows.length} av {c.total}</p>
      {rows.length ? <div className={styles.tableWrap}><table>
        <caption className={styles.srOnly}>Lokalt granskade juridiska enheter, ingen är godkänd för kontakt</caption>
        <thead><tr><th scope="col">Företag</th><th scope="col">Ort</th><th scope="col">SNI</th><th scope="col">Status per SCB</th><th scope="col">Flaggor</th><th scope="col">Granskning</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.orgnr}>
          <td><strong>{r.name}</strong><small>{r.orgnr} · {r.legalFormLabel}</small></td>
          <td>{r.city}</td>
          <td>{r.sni.split(';').join(', ')}</td>
          <td><span className={styles.flag} data-tone={r.scbActive ? 'info' : 'warning'}>{r.scbActive ? 'Verksam per SCB' : 'Ej verksam per SCB'}</span><small>Inte en bedömning av lämplighet</small></td>
          <td>
            {r.restricted ? <span className={styles.flag} data-tone="warning">SCB-spärr: {r.restrictedChannels.map(ch => channelLabels[ch]).join(', ')}</span> : null}
            {r.priorContact ? <span className={styles.flag} data-tone="warning">Tidigare kontaktad (partiell historik)</span> : null}
            {r.otherLegalForm ? <span className={styles.flag} data-tone="warning">Annan juridisk form</span> : null}
            {r.groupHypothesis ? <small>Möjlig grupp (namnled, hypotes): {r.groupHypothesis}</small> : null}
          </td>
          <td><span className={styles.flag} data-tone="warning">Väntar på mänsklig granskning</span><small>Spärrad: BLOCKED_PENDING_VERIFICATION</small></td>
        </tr>)}</tbody>
      </table></div> : <p className={styles.empty}>Inga företag matchar filtreringen.</p>}
      <div className={styles.footer}><span>Skrivskyddad lokal vy. Ingen knapp här godkänner, markerar som ny eller skickar något.</span></div>
    </section>
  )
}

/** Pure presentation: no actions, email sends, data reads or test fixtures. */
export function HandlarborsenLeadFinder({ slug, readiness, known, saved, search, filter, localReview = { status: 'disabled' }, localSearch = '', localFilter = 'all', importPreviewEnabled = false, importWriteEnabled = false, researchEnabled = false, researchExtractEnabled = false }: LeadFinderProps) {
  const rows = saved.status === 'ready' ? filterCandidateViews(saved.candidates, search, filter) : []
  const total = saved.status === 'ready' ? saved.candidates.length.toString() : '—'
  const reviewCount = saved.status === 'ready'
    ? saved.candidates.filter(c => c.status === 'needs_review').length.toString() : '—'
  const contactCount = known.status === 'ready' ? String(known.count ?? 0) : '—'
  const validFilter = filter === 'all' || Object.prototype.hasOwnProperty.call(statusLabels, filter) ? filter : 'all'

  return (
    <main className={styles.page}>
      <nav className={styles.crumbs} aria-label="Brödsmulor">
        <Link href={`/projects/${slug}`}><ArrowLeft size={14} aria-hidden="true" /> Handlarbörsen</Link>
        <span aria-hidden="true">/</span><span>Lead Finder</span>
      </nav>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Handlarbörsen / Tillväxt</p>
          <h1>Lead Finder</h1>
          <p>Hitta nya bilhandlare, jämför mot tidigare kontakter och förbered beslut. Inga utskick utan separat godkännande.</p>
        </div>
        <span className={styles.safety}><LockKeyhole size={15} aria-hidden="true" /> Förberedelseläge</span>
      </header>

      <section className={styles.metrics} aria-label="Lead Finder-statistik">
        <article><span><Building2 size={17} aria-hidden="true" /> Databaskandidater</span><strong>{total}</strong><small>{sourceLabels[saved.status]}</small></article>
        <article><span><Search size={17} aria-hidden="true" /> Att granska</span><strong>{reviewCount}</strong><small>Inget automatiskt godkännande</small></article>
        <article><span><Database size={17} aria-hidden="true" /> Omnira-kontakter</span><strong>{contactCount}</strong><small>{sourceLabels[known.status]}</small></article>
        <article><span><ShieldCheck size={17} aria-hidden="true" /> Utskick</span><strong>AV</strong><small>Spärrar och godkännande krävs</small></article>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="hb-leads-sources">
          <h2 id="hb-leads-sources">Datakällor</h2>
          <div className={styles.source}>
            <Database size={20} aria-hidden="true" />
            <div><strong>SCB:s företagsregister</strong>
              <p>{!readiness.scbKeyConfigured ? 'SCB:s live-API-nyckel saknas på servern. Den tidigare verifierade SCB-rapporten kan fortfarande granskas utan liveanrop. SCB och Tavily är två separata datakällor.' : 'SCB-nyckeln är konfigurerad. Liveanrop förblir spärrade tills testet godkänts.'}</p>
            </div>
            <span className={styles.flag} data-tone="warning">{!readiness.scbKeyConfigured ? 'Inväntar nyckel' : 'Live avstängt'}</span>
          </div>
          {researchEnabled && importPreviewEnabled ? <div className={styles.source}>
            <Search size={20} aria-hidden="true" />
            <div><strong>Tavily – manuell webbresearch</strong>
              <p>Separat från SCB:s live-API. Högst fem sökningar efter uttrycklig bekräftelse, inga utskick eller automatiska godkännanden. {researchExtractEnabled ? 'Webbsidgranskning kan använda extra krediter och kräver egen bekräftelse.' : 'Den extra webbsidgranskningen är avstängd.'}</p>
            </div>
            <span className={styles.flag} data-tone="info">Preview · manuell</span>
          </div> : null}
          <div className={styles.source}>
            <Building2 size={20} aria-hidden="true" />
            <div><strong>Befintliga säljkontoakter</strong>
              <p>{known.status === 'ready'
                ? `${known.count} kända Omnira-kontakter kan jämföras. Andra register saknas fortfarande.`
                : 'En säker läskoppling är förberedd. Åtkomst och innehåll ska verifieras innan användning.'}</p>
            </div>
            <span className={styles.flag} data-tone={known.status === 'ready' ? 'info' : 'warning'}>{sourceLabels[known.status]}</span>
          </div>
          <div className={styles.source}>
            <LockKeyhole size={20} aria-hidden="true" />
            <div><strong>Historiska pilotlistan</strong><p>Tidigare kontaktade, avböjda och spärrade företag måste också matchas. Vi antar inte att listan finns i Omnira.</p></div>
            <span className={styles.flag} data-tone="warning">Ej kopplad</span>
          </div>
        </section>
        <aside className={styles.panel} aria-labelledby="hb-leads-next">
          <h2 id="hb-leads-next">Tre steg till första listan</h2>
          <ol className={styles.steps}>
            <li><span>01</span><div><strong>Granska SCB-underlaget</strong><p>Den sanerade SCB-rapporten kan förhandsgranskas av projektägaren. Serverns liveanrop är fortfarande avstängda.</p></div></li>
            <li><span>02</span><div><strong>Matcha spärrar</strong><p>Jämför alla pilotkontakter och kontrollera SCB:s reklam- och e-postspärrar.</p></div></li>
            <li><span>03</span><div><strong>Granska 89 juridiska företag</strong><p>Filtrera de verifierade företagen i förhandsvisningen. Ingen är godkänd för kontakt eller utskick.</p></div></li>
          </ol>
        </aside>
      </div>

      <LocalReviewSection state={localReview} search={localSearch} filter={localFilter} />
      {importPreviewEnabled ? <HandlarborsenScbImportControl writeEnabled={importWriteEnabled} researchEnabled={researchEnabled} extractEnabled={researchExtractEnabled} /> : null}

      <section className={styles.panel} aria-labelledby="hb-leads-results">
        <div className={styles.sectionHeader}>
          <div><p className={styles.kicker}>Databasflöde · ännu inte aktiverat</p><h2 id="hb-leads-results">Sparade kandidater</h2></div>
          <span className={styles.safety}><ShieldCheck size={15} aria-hidden="true" /> Inga syntetiska leads i produktion</span>
        </div>
        {saved.status === 'ready' && saved.candidates.length > 0 ? (
          <>
            <form method="get" className={styles.filters}>
              <label htmlFor="hb-lead-search">Sök</label>
              <input type="search" id="hb-lead-search" name="q" maxLength={80} defaultValue={search.slice(0, 80)} placeholder="Företag eller org.nr" />
              <label htmlFor="hb-lead-status">Status</label>
              <select id="hb-lead-status" name="status" defaultValue={validFilter}>
                <option value="all">Alla statusar</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="submit">Filtrera</button>
            </form>
            {rows.length ? <div className={styles.tableWrap}><table>
              <thead><tr><th scope="col">Företag</th><th scope="col">SNI</th><th scope="col">Ort</th><th scope="col">Bedömning</th><th scope="col">Granskningsstatus</th></tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}>
                <td><strong>{row.name}</strong><small>{row.orgnr} · SCB {row.retrievedAt.slice(0, 10)}</small></td>
                <td>{row.sniCodes.join(', ') || 'Okänd'}</td><td>{row.city}</td>
                <td>{row.score === null ? 'Ej bedömd' : `${row.score}/100`}</td>
                <td><span className={styles.flag} data-tone={row.status === 'suppressed' || row.status === 'excluded' ? 'warning' : 'info'}>{statusLabels[row.status]}</span>
                  {row.reasons.length > 0 ? <small>{row.reasons.join(', ')}</small> : null}</td>
              </tr>)}</tbody>
            </table></div> : <p className={styles.empty}>Inga kandidater matchar filtreringen.</p>}
          </>
        ) : (
          <div className={styles.empty}>
            <LockKeyhole size={26} aria-hidden="true" />
            <h3>{saved.status === 'unavailable' || saved.status === 'incomplete' ? 'Kandidaterna kan inte verifieras' : localReview.status === 'ready' ? 'Inga företag importerade i Omniras databas' : 'Inga riktiga leads inlästa ännu'}</h3>
            <p>{saved.status === 'unavailable' || saved.status === 'incomplete'
              ? 'Källan är otillgänglig eller ofullständig och visas därför inte.'
              : 'Efter en separat godkänd import kan de juridiska företagen listas här med SCB-status och granskningsflaggor. Ingen automatisk poäng eller kontaktbehörighet tilldelas.'}</p>
          </div>
        )}
        <div className={styles.footer}><span>Även granskade kandidater är inte utskicksklara utan fullständiga spärrkontroller.</span>
          <Link href={`/projects/${slug}/competitors`}>Öppna Konkurrentspanaren <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      </section>
    </main>
  )
}
