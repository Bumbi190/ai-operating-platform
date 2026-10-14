import {
  COMPETITOR_SITES,
  LANDSCAPE_OBSERVED_ON,
  summarizeLandscape,
  type LandscapeScan,
  type LandscapeSourceStatus,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape'
import styles from './HandlarborsenLandscape.module.css'

const statusText: Record<LandscapeSourceStatus, string> = {
  metadata_checked: 'Titel verifierad vid kontrollen',
  robots_denied: 'Ingen inläsning: robots-reglerna tillåter inte sidan',
  robots_unavailable: 'Ingen inläsning: robots-reglerna kunde inte verifieras',
  redirect_refused: 'Omdirigering nekades',
  http_error: 'Källan svarade inte OK',
  invalid_content_type: 'Inte giltig HTML',
  too_large: 'Innehållet överskred gränsen',
  metadata_missing: 'Titelmetadata saknades',
  fetch_failed: 'Hämtningen misslyckades',
}

export function HandlarborsenLandscape({ scan }: { scan: LandscapeScan | null }) {
  const summary = summarizeLandscape(scan)
  return (
    <section className={styles.section} aria-labelledby="hb-landscape">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Marknadskarta · 4 aktörer</p>
          <h2 id="hb-landscape">Fler konkurrenter att bevaka</h2>
          <p>Tre ytterligare officiella B2B-källor utöver Handlarbudet. Offentliga beskrivningar granskades {LANDSCAPE_OBSERVED_ON} och kan ha ändrats.</p>
        </div>
        <span className={styles.status} data-scanned={scan ? 'yes' : undefined}>
          {scan ? summary.checked + '/3 titlar verifierade' : 'Inväntar manuell kontroll'}
        </span>
      </header>
      {scan ? (
        <div className={styles.progressBlock}>
          <div className={styles.track} role="progressbar" aria-label="Andel tillgängliga officiella källtitlar vid senaste kontroll" aria-valuemin={0} aria-valuemax={3} aria-valuenow={summary.checked}>
            <span style={{ width: (summary.checked / 3) * 100 + '%' }} />
          </div>
          <p>{summary.failed === 0 ? 'Samtliga tre källtitlar kunde kontrolleras.' : summary.failed + ' av tre källor kunde inte verifieras.'} Detta mäter endast källtillgänglighet, inte marknadsandel eller konkurrenskraft.</p>
        </div>
      ) : null}
      <div className={styles.grid}>
        <article className={styles.card}>
          <p className={styles.cardEyebrow}>Historisk dossier</p>
          <h3>Handlarbudet</h3>
          <p>Tre daterade officiella nyheter finns längre ner. De styrker inte vad som erbjuds just idag.</p>
          <a href="#competitor-evidence">Visa äldre källor ↓</a>
        </article>
        {COMPETITOR_SITES.map(source => {
          const observation = scan?.observations.find(result => result.id === source.id)
          return (
            <article className={styles.card} key={source.id}>
              <p className={styles.cardEyebrow}>Officiell B2B-källa · {source.observedOn}</p>
              <h3>{source.name}</h3>
              <p>{source.description}</p>
              <p className={styles.checked} data-ok={observation?.status === 'metadata_checked' ? 'yes' : undefined}>
                {observation ? statusText[observation.status] : 'Inte kontrollerad i den här vyn'}
              </p>
              {observation?.title ? <p className={styles.sourceTitle}>Titel: {observation.title}</p> : null}
              <a href={source.url} target="_blank" rel="noopener noreferrer">Öppna officiell källa ↗</a>
            </article>
          )
        })}
      </div>
      <details className={styles.planDetails}>
        <summary>Tre extra frågor att testa i pilotintervjuer</summary>
        <ol>
          {COMPETITOR_SITES.map(source => (
            <li key={source.id}>
              <strong>{source.name}</strong> · {source.interviewQuestion}
              <span>Förslag att validera med handlare – inte ett godkänt produktbeslut.</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
