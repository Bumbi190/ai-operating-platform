import { DOSSIER_DATE, EVIDENCE, STATUS_LABELS, summarizeScan, type PublicScan } from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import styles from './HandlarborsenCompetitors.module.css'

function CheckedTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })} (Stockholm)</time>
}

export function HandlarborsenCompetitors({ scan }: { scan: PublicScan | null }) {
  const summary = scan ? summarizeScan(scan) : null
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
          <div><dt>Lagring</dt><dd>ej inkopplat</dd></div>
        </dl>
        <p>Kontrollen läser offentliga källor vid ditt klick och sparar inga observationer. Historiska förändringar och långsiktig bevakning väntar på framtida lagring och godkännande. Autonom exekvering är spärrad tills Cost Governance är verifierad i preview och produktion.</p>
        {/* A native GET form avoids Next Link prefetch executing an on-demand scan. */}
        <form method="get" action="/projects/handlarborsen/competitors">
          <button type="submit" name="scan" value="1" className={styles.button}>Kontrollera offentliga källor</button>
        </form>
        {scan && summary ? <p role="status">{summary.checked} av {EVIDENCE.length} källor med kontrollerad titelmetadata. {summary.failed} kunde inte verifieras. Kontrollerat: <CheckedTime value={scan.checked_at} />.</p>
          : <p>Inte kontrollerad i denna vy. Källdossierns datum är inte en senaste körning.</p>}
        <p>En tillgänglig titel verifierar endast sidans tillgänglighet och titelmetadata vid kontrollen. Innehåll, aktuella villkor och förändringar över tid verifieras inte.</p>
      </section>
      <section aria-labelledby="competitor-evidence">
        <h2 id="competitor-evidence">Källbelagda observationer</h2>
        <p>Belägg: de angivna publicerade nyheterna. Säkerheten gäller historiska publiceringar; dagens erbjudanden och våra hypoteser är inte verifierade.</p>
        <div className={styles.cards}>
          {EVIDENCE.map(source => {
            const check = scan?.sources.find(item => item.id === source.id)
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
