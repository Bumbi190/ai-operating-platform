import styles from './AnalysisDraftHistoryLink.module.css'

export function AnalysisDraftHistoryLink({ projectSlug }: { projectSlug: string }) {
  return (
    <a
      className={styles.card}
      href={'/projects/' + encodeURIComponent(projectSlug) + '/atlas/analysis-drafts'}
    >
      <span className={styles.copy}>
        <span className={styles.title}>Sparade analysutkast</span>
        <span className={styles.description}>
          Här hittar du sparade analyser och underlagen de bygger på.
        </span>
      </span>
      <span className={styles.action}>Öppna historiken <span aria-hidden="true">→</span></span>
    </a>
  )
}
