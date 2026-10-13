import styles from '../ProjectsLoading.module.css'

/** Project name is deliberately unknown until the authorized record is read. */
export default function ProjectDetailLoading() {
  return (
    <section className={styles.screen} role="status" aria-busy="true">
      <h1 className={styles.heading}>Öppnar projekt</h1>
      <p className={styles.description}>
        Kontrollerar åtkomst och läser projektets arbetsyta…
      </p>
      <div className={styles.ghost} aria-hidden="true">
        <div className={styles.text} />
        <div className={styles.cover} />
      </div>
    </section>
  )
}
