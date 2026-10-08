import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { composeAtlasRailCards } from '@/lib/atlas/first-party-workspaces'
import { AtlasCommandCore } from './AtlasCommandCore'
import { AtlasDisplayScaleControl } from './AtlasDisplayScaleControl'
import { AtlasMobileNav } from './AtlasMobileNav'
import { AtlasStarfield } from './AtlasStarfield'
import { ProjectRail } from './ProjectRail'
import { ActivitySystemRail } from './ActivitySystemRail'
import styles from './AtlasHomeVNext.module.css'

/**
 * Atlas Home — composed after the canonical mockup
 * (Design/references/Atlas/omnira-atlas-home-living-intelligence-v1.png).
 *
 * The page is a full-bleed space backdrop with one fixed-proportion stage on
 * top of it. The stage is the mockup's 1299×926 canvas (the area right of the
 * sidebar, under the top bar) and scales as a whole with the viewport, so the
 * composition — face, identity column, composer, cards — keeps the mockup's
 * proportions from a laptop to a 49" ultrawide. The backdrop fills whatever is
 * left around it.
 */
export function AtlasHomeVNext({ model }: { model: AtlasHomeViewModel }) {
  return (
    <div className={styles.page}>
      <div className={styles.backdropNebula} aria-hidden="true" />
      <AtlasStarfield className={styles.backdropStars} />
      <div className={styles.backdropVignette} aria-hidden="true" />
      <AtlasMobileNav />
      <div className={styles.stageFrame}>
        <div className={styles.stage}>
          <AtlasCommandCore />

          <blockquote className={styles.quote}>
            <p>”Större förståelse.<br />Större möjligheter.”</p>
          </blockquote>

          <div className={styles.scaleSlot}>
            <AtlasDisplayScaleControl />
          </div>

          <div className={styles.summaryRow}>
            <ActivitySystemRail model={model} />
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
          </div>
        </div>
      </div>
    </div>
  )
}
