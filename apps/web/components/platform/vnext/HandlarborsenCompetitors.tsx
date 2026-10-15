import { DOSSIER_DATE, EVIDENCE, STATUS_LABELS, summarizeScan, type PublicScan } from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import { HandlarborsenLandscape } from './HandlarborsenLandscape'
import { HandlarborsenCompetitorHistory } from './HandlarborsenCompetitorHistory'
import { HandlarborsenCompetitorDiscovery } from './HandlarborsenCompetitorDiscovery'
import { HandlarborsenSaveCompetitorScan } from './HandlarborsenSaveCompetitorScan'
import type { HistoryAnalysis } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
import { latestSavedCompetitorObservation, savedCompetitorDay } from '@/lib/atlas/project-analytics/handlarborsen-competitor-latest'
import type { LandscapeScan } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape'
import styles from './HandlarborsenCompetitors.module.css'

function CheckedTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })} (Stockholm)</time>
}

export function HandlarborsenCompetitors({ scan, landscape = null, history = null, historyEnabled = false, canSaveHistory = false }: { scan: PublicScan | null; landscape?: LandscapeScan | null; history?: HistoryAnalysis | null; historyEnabled?: boolean; canSaveHistory?: boolean }) {
  const summary = scan ? summarizeScan(scan) : null
  return (
    <div className={styles.page}>
      <header>
        <a href="/projects/handlarborsen" className={styles.link}>Tillbaka till Handlarbörsen</a>
        <p className={styles.kicker}>Handlarbörsen · Offentligt beslutsunderlag</p>
        <h1>Konkurrentspanaren</h1>
        <p>Fyra B2B-aktörer. Daterad dossier om Handlarbudet (<time dateTime={DOSSIER_DATE}>{DOSSIER_DATE}</time>) och tre ytterligare officiella jämförelsekällor. Inga påståenden om livepriser eller nyupptäckta förändringar.</p>
      </header>
      <section className={styles.panel} aria-labelledby="competitor-mode">
        <h2 id="competitor-mode">Manuell kontroll</h2>
        <dl className={styles.facts}>
          <div><dt>Aktiverat</dt><dd>manuell läsning</dd></div>
          <div><dt>Schemalagt</dt><dd>ej aktiverad</dd></div>
          <div><dt>Lagring</dt><dd>{historyEnabled ? (history?.status === 'ok' ? 'manuell historik aktiv' : 'aktiverad – läsning ej verifierad') : 'avstängd i denna miljö'}</dd></div>
        </dl>
        <p>{historyEnabled
          ? 'Offentliga källor kan kontrolleras manuellt och sparas högst en gång per UTC-dag. Förändringar kräver två verifierade observationer av samma källa. Ingen automatisk bevakning eller exekvering är aktiverad.'
          : 'Kontrollen läser offentliga källor vid ditt klick. Manuell historiklagring är avstängd i denna miljö, men tidigare sparade observationer påverkas inte. Autonom exekvering är spärrad tills Cost Governance är verifierad i preview och produktion.'}</p>
        {/* A native GET form avoids Next Link prefetch executing an on-demand scan. */}
        <form method="get" action="/projects/handlarborsen/competitors">
          <button type="submit" name="scan" value="1" className={styles.button}>Kontrollera offentliga källor</button>
        </form>
        {scan && summary ? <p role="status">{summary.checked} av {EVIDENCE.length} källor med kontrollerad titelmetadata. {summary.failed} kunde inte verifieras. Kontrollerat: <CheckedTime value={scan.checked_at} />.</p>
          : <p>Inte kontrollerad i denna vy. Källdossierns datum är inte en senaste körning.</p>}
        <p>En tillgänglig titel verifierar endast sidans tillgänglighet och titelmetadata vid kontrollen. Innehåll, aktuella villkor och förändringar över tid verifieras inte.</p>
      </section>
      <HandlarborsenLandscape scan={landscape} history={history} />
      <HandlarborsenCompetitorHistory history={history} historyEnabled={historyEnabled} />
      <HandlarborsenCompetitorDiscovery />
      {historyEnabled && canSaveHistory ? <HandlarborsenSaveCompetitorScan /> : null}
      <section aria-labelledby="competitor-evidence">
        <h2 id="competitor-evidence">Handlarbudet · daterade observationer</h2>
        <p>Belägg: de angivna publicerade nyheterna. Säkerheten gäller historiska publiceringar; dagens erbjudanden och våra hypoteser är inte verifierade.</p>
        <div className={styles.cards}>
          {EVIDENCE.map(source => {
            const check = scan?.sources.find(item => item.id === source.id)
            const saved = latestSavedCompetitorObservation(history, source.id)
            const savedDay = saved ? savedCompetitorDay(saved) : null
            return <article className={styles.panel} key={source.id} aria-labelledby={`source-${source.id}`}>
              <h3 id={`source-${source.id}`}>{source.label}</h3>
              <p>Publicerad <time dateTime={source.published}>{source.published}</time> · <a href={source.url} className={styles.link} rel="noreferrer">Officiell källa hos Handlarbudet</a></p>
              <p><strong>Observation ur daterad källa:</strong> {source.observation}</p>
              <p><strong>Senast sparad observation:</strong> {saved && savedDay ? <><time dateTime={savedDay.date}>{savedDay.label}</time> · {saved.status === 'metadata_checked' ? 'Sidtitel verifierad' : 'Källan kunde inte verifieras'}</> : 'Ingen sparad observation för denna källa'}</p>
              {check ? <p><strong>Separat kontroll i denna vy:</strong> {STATUS_LABELS[check.status]}</p> : null}
              {check ? <p>Kontrollerat: <CheckedTime value={check.checked_at} /></p> : null}
              {check?.title ? <p><strong>Hämtad titelmetadata:</strong> {check.title}</p> : null}
            </article>
          })}
        </div>
      </section>
      <section aria-labelledby="competitor-ideas">
        <p className={styles.kicker}>Atlas · Planeringsunderlag</p>
        <h2 id="competitor-ideas">Från konkurrentsignal till testbar plan</h2>
        <p>Följande förslag utgår från daterade offentliga källor, inte från verifierade erbjudanden idag. Ingen uppgift är godkänd, tilldelad, schemalagd eller utförd. Validera först med pilothandlarna innan en uppgift prioriteras i projektets arbetsflöden.</p>
        <ol className={styles.plan}>
          {EVIDENCE.map((source, index) => <li className={styles.planStep} key={source.id}>
            <span className={styles.stepIndex}>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <span className={styles.planState}>Föreslagen intervju · inväntar beslut</span>
              <h3>{source.idea}</h3>
              <p>{source.hypothesis}</p>
              <p className={styles.planSource}>Spårbar källa: <a href={`#source-${source.id}`} className={styles.link}>{source.label}</a>, publicerad {source.published}. Ej verifierad produktprioritet.</p>
            </div>
          </li>)}
        </ol>
        <div className={styles.planFooter}>
          <strong>Beslutsgrind:</strong> Ställ frågorna under pilotintervjuerna, dokumentera svaren och låt sedan Atlas prioritera på nytt utifrån verklig feedback. Ingen automation utförs från den här sidan.
        </div>
      </section>
    </div>
  )
}
