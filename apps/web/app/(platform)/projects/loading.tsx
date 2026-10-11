import styles from './ProjectsLoading.module.css'

/** Visible while the authorized project portfolio loads. Shapes are neutral
 * placeholders, NOT a claim about how many projects exist. */
export default function ProjectsLoading() {
  return (
    <section
      className={styles.screen}
      aria-busy="true"
      aria-label="Projekt laddas"
    >
      <h1 className={styles.heading}>Projekt</h1>
      <p className={styles.description} role="status">
        Läser projekt du har åtkomst till…
      </p>
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={styles.ghost}>
            <div className={styles.cover} />
            <div className={styles.text} />
          </div>
        ))}
      </div>
    </section>
  )
}
