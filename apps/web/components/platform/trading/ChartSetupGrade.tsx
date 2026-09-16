import React from 'react'
import type { SetupState } from '@/lib/trading/market-view'
import { GradeBadge, STAGE_LABELS } from './panels'
import styles from './AtlasMarketView.module.css'

/**
 * The setup grade, stated on the chart.
 *
 * The grade is what an operator reads the chart FOR, so it sits on the plot
 * rather than only in the Setup panel beside it. It is the same reported
 * `SetupState` the panel renders — grade and stage, in the panel's own
 * vocabulary — and nothing is graded here: no confirmation is counted and no
 * grade is inferred from the drawing. `NONE` reads as INGEN, never as a blank.
 *
 * On a narrow chart the word "Setup" is visually hidden so the chip and the
 * provenance badge share a line; it stays in the accessible name.
 */
export function ChartSetupGrade({ setup }: { setup: SetupState }) {
  return (
    <span
      className={styles.chartSetupChip}
      data-grade={setup.grade}
      data-stage={setup.stage}
      data-testid="chart-setup-grade"
    >
      <GradeBadge grade={setup.grade} />
      <span className={styles.chartSetupText}>
        {setup.stage === 'NONE' ? (
          // "INGEN" + "Setup": the stage adds nothing when there is no setup.
          'Setup'
        ) : (
          <>
            <span className={styles.chartSetupPrefix}>Setup · </span>
            {STAGE_LABELS[setup.stage]}
          </>
        )}
      </span>
    </span>
  )
}
