import { DOSSIER_DATE, EVIDENCE, STATUS_LABELS, summarizeScan, type PublicScan } from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import styles from './HandlarborsenCompetitors.module.css'
import { compareTitleHistory, type CompetitorHistory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history'

function CheckedTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('sv-SE', { timeZone: 'UTC' })} (UTC)</time>
}

export function HandlarborsenCompetitors({ scan, history, result }: {
  scan: PublicScan | null; history?: CompetitorHistory; result?: string
}) {
  const summary = scan ? summarizeScan(scan) : null
  const observations = history?.status === 'ok' ? history.observations : []
  const changes = compareTitleHistory(observations)
  const message = result === 'read_failed' ? 'Historiken kunde inte läsas. Ingen nätverkskontroll startades.'
    : result === 'write_failed' ? 'Kontrollen kunde inte sparas. Ingen ny historik kan bekräftas.' : null
  return (
    <div className={styles.page}>
      <header>
        <a href="/projects/handlarborsen" className={styles.link}>Tillbaka till Handlarbörsen</a>
        <p className={styles.kicker}>Handlarbörsen · Offentligt beslutsunderlag</p>
        <h1>Konkurrentspanaren · Handlarbudet</h1>
        <p>Daterad källdossier · sammanställd <time dateTime={DOSSIER_DATE}>{DOSSIER_DATE}</time>. Skrivskyddad läsning av tre publicerade nyheter.</p>
      </header>
      <section className={styles.panel} aria-labelledby="competitor-mode">
        <h2 id="competitor-mode">Manuell kontroll</h2>
        <dl className={styles.facts}>
          <div><dt>Aktiverat</dt><dd>manuell läsning</dd></div>
          <div><dt>Schemalagt</dt><dd>ej aktiverad</dd></div>
          <div><dt>Lagring</dt><dd>{history ? 'projektspecifik UTC-historik' : 'ej inkopplat'}</dd></div>
        </dl>
        <p>Kontrollen startas av dig och sparar högst tre titelobservationer per UTC-dag. Vyn visar sparad historik, inte live-data. Ingen autonom kontroll eller cron är aktiverad. Autonom exekvering är spärrad tills Cost Governance är verifierad i preview och produktion.</p>
        <form method="post" action="/projects/handlarborsen/competitors/scan">
          <button type="submit" className={styles.button} disabled={history?.status === 'read_failed' || history?.status === 'not_permitted'}>Kontrollera offentliga källor</button>
        </form>
        {message ? <p role="status">{message}</p> : null}
        {scan && summary ? <p role="status">{summary.checked} av {EVIDENCE.length} källor med kontrollerad titelmetadata. {summary.failed} kunde inte verifieras. Kontrollerat: <CheckedTime value={scan.checked_at} />.</p>
          : <p>{history ? 'Sparad kontrollhistorik visas nedan.' : 'Inte kontrollerad i denna vy.'} Källdossierns datum är inte en senaste körning.</p>}
        <p>En tillgänglig titel verifierar endast sidans tillgänglighet och titelmetadata vid kontrollen. Sidtiteländringar belägger inga ändringar i produkter, erbjudanden eller aktuella villkor.</p>
      </section>
      {history ? <section className={styles.panel} aria-labelledby="competitor-history">
        <h2 id="competitor-history">Sparad kontrollhistorik · senaste 30 UTC-dagarna</h2>
        {history.status === 'read_failed' ? <p role="status">Historiken kunde inte läsas. Status är okänd; detta betyder inte att observationer saknas.</p>
          : history.status === 'not_permitted' ? <p role="status">Historiken är inte tillgänglig.</p>
            : observations.length === 0 ? <p>Inga sparade observationer i detta tidsfönster.</p>
              : <ul>{observations.map(row => <li key={`${row.source_id}-${row.observed_on}`}>
                <a className={styles.link} href={`#source-${row.source_id}`}>{EVIDENCE.find(source => source.id === row.source_id)?.label}</a>
                {' · '}<time dateTime={row.observed_on}>{row.observed_on}</time>{' · '}{STATUS_LABELS[row.status]}
                {' · '}<CheckedTime value={row.checked_at} />{row.title ? <> · {row.title}</> : null}
              </li>)}</ul>}
        <h3>Titelindikatorer för granskning</h3>
        {changes.length ? <ul>{changes.map(change => <li key={`${change.source_id}-${change.to}`}>
          <a className={styles.link} href={`#source-${change.source_id}`}>{EVIDENCE.find(source => source.id === change.source_id)?.label}</a>
          {': sidtitel ändrades · '}{change.from}{' → '}{change.to}{' (UTC). Endast titelmetadata; granska källan.'}
        </li>)}</ul> : <p>Ingen verifierad sidtiteländring att visa. En datapunkt eller en misslyckad kontroll ger inget förändringspåstående.</p>}
      </section> : null}
      <section aria-labelledby="competitor-evidence">
        <h2 id="competitor-evidence">Källbelagda observationer</h2>
        <p>Belägg: de angivna publicerade nyheterna. Säkerheten gäller historiska publiceringar; dagens erbjudanden och våra hypoteser är inte verifierade.</p>
        <div className={styles.cards}>
          {EVIDENCE.map(source => {
            const check = scan?.sources.find(item => item.id === source.id) ?? observations.find(item => item.source_id === source.id)
            return <article className={styles.panel} key={source.id} aria-labelledby={`source-${source.id}`}>
              <h3 id={`source-${source.id}`}>{source.label}</h3>
              <p>Publicerad <time dateTime={source.published}>{source.published}</time> · <a href={source.url} className={styles.link} rel="noreferrer">Officiell källa hos Handlarbudet</a></p>
              <p><strong>Observation ur daterad källa:</strong> {source.observation}</p>
              <p><strong>Kontrollstatus:</strong> {check ? STATUS_LABELS[check.status] : 'Inte kontrollerad i denna vy'}</p>
              {check ? <p>Kontrollerat: <CheckedTime value={check.checked_at} /></p> : null}
              {check?.title ? <p><strong>Hämtad titelmetadata:</strong> {check.title}</p> : null}
            </article>
          })}
        </div>
      </section>
      <section aria-labelledby="competitor-ideas">
        <h2 id="competitor-ideas">Granskningsidéer för piloten</h2>
        <p>Våra hypoteser, inte godkända produktbeslut eller ändringar i roadmapen. Intresse hos Handlarbörsens piloter återstår att validera.</p>
        <div className={styles.cards}>
          {EVIDENCE.map(source => <article className={styles.panel} key={source.id}>
            <p className={styles.kicker}>Granskningsidé · {source.category}</p>
            <h3>{source.idea}</h3>
            <p>{source.hypothesis}</p>
            <p>Underlag: <a href={`#source-${source.id}`} className={styles.link}>{source.label}</a> · {source.published}. Hypotesens säkerhet: ej validerad.</p>
          </article>)}
        </div>
      </section>
    </div>
  )
}
