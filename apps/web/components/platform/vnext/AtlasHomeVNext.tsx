import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { composeAtlasRailCards } from '@/lib/atlas/first-party-workspaces'
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
          {/*
            The rail carries the operator's authorized projects plus first-party
            system workspaces. Composition happens HERE, in presentation, on a
            model the server has already scoped — `home-view-model.ts` never sees
            a system workspace, so the project allow-list is untouched by it.
          */}
          <ProjectRail
            cards={composeAtlasRailCards(model.projects)}
            generatedAt={model.generatedAt}
            availability={model.availability}
          />
        </main>
        <ActivitySystemRail model={model} />
      </div>
    </div>
  )
}
