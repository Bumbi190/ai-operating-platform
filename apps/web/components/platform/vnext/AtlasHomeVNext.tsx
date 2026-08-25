import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { AtlasCommandCore } from './AtlasCommandCore'
import { AtlasMobileNav } from './AtlasMobileNav'
import { ProjectRail } from './ProjectRail'
import { ActivitySystemRail } from './ActivitySystemRail'
import styles from './AtlasHomeVNext.module.css'

export function AtlasHomeVNext({ model }: { model: AtlasHomeViewModel }) {
  return (
    <div className={styles.page}>
      <div className={styles.ambientGrid} aria-hidden="true" />
      <div className={styles.ambientStars} aria-hidden="true" />
      <div className={styles.ambientOrbit} aria-hidden="true" />
      <div className={styles.ambientGlow} aria-hidden="true" />
      <AtlasMobileNav />
      <div className={styles.workspace}>
        <main className={styles.primaryCanvas}>
          <AtlasCommandCore />
          <ProjectRail projects={model.projects} generatedAt={model.generatedAt} availability={model.availability} />
        </main>
        <ActivitySystemRail model={model} />
      </div>
    </div>
  )
}
