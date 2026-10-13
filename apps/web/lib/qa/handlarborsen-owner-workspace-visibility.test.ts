/**
 * The Handlarbörsen technical workspace may be folded only when every
 * relevant scoped read succeeds and there is nothing to act on.
 * The six technical panels remain in the DOM and are expandable by summary.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shouldCollapseEmptyOwnerWorkspace } from '@/lib/os/project-command-center-visibility'
import type { ProjectCommandCenterModel } from '@/lib/os/project-command-center'

type Workspace = Pick<
  ProjectCommandCenterModel,
  'agents' | 'workflows' | 'approvals' | 'runs' | 'instances' | 'outputs' | 'activity'
>

function emptySection(total: number | null = 0) {
  return { state: 'ok' as const, items: [], total, truncated: false }
}

function emptyWorkspace(): Workspace {
  return {
    agents: emptySection(),
    workflows: emptySection(),
    approvals: emptySection(),
    runs: emptySection(null),
    instances: emptySection(null),
    outputs: emptySection(null),
    activity: { activeRuns: 0, lastRun: { state: 'ok', at: null } },
  }
}

describe('Handlarbörsen owner workspace · safe folding', () => {
  it('folds only an explicitly successful, entirely empty technical workspace', () => {
    expect(shouldCollapseEmptyOwnerWorkspace(emptyWorkspace())).toBe(true)
  })

  it('never folds when counts are unknown, positive or a source fails', () => {
    for (const name of ['agents', 'workflows', 'approvals'] as const) {
      const unknown = emptyWorkspace()
      unknown[name].total = null
      expect(shouldCollapseEmptyOwnerWorkspace(unknown), `${name}: unknown count`).toBe(false)
      const failed = emptyWorkspace()
      failed[name].state = 'error'
      expect(shouldCollapseEmptyOwnerWorkspace(failed), `${name}: read failure`).toBe(false)
      const positive = emptyWorkspace()
      positive[name].total = 1
      expect(shouldCollapseEmptyOwnerWorkspace(positive), `${name}: positive count`).toBe(false)
    }
  })

  it('never hides active or historical project runs', () => {
    const active = emptyWorkspace()
    active.activity.activeRuns = 1
    expect(shouldCollapseEmptyOwnerWorkspace(active)).toBe(false)
    const unknown = emptyWorkspace()
    unknown.activity.activeRuns = null
    expect(shouldCollapseEmptyOwnerWorkspace(unknown)).toBe(false)
    const failed = emptyWorkspace()
    failed.activity.lastRun = { state: 'error' }
    expect(shouldCollapseEmptyOwnerWorkspace(failed)).toBe(false)
    const previous = emptyWorkspace()
    previous.activity.lastRun = { state: 'ok', at: '2026-10-10T10:00:00Z' }
    expect(shouldCollapseEmptyOwnerWorkspace(previous)).toBe(false)
  })

  it('never folds if a secondary section has data or its read failed', () => {
    for (const name of ['runs', 'instances', 'outputs'] as const) {
      const failed = emptyWorkspace()
      failed[name].state = 'error'
      expect(shouldCollapseEmptyOwnerWorkspace(failed), `${name}: failed`).toBe(false)
      const positive = emptyWorkspace()
      positive[name].total = 1
      expect(shouldCollapseEmptyOwnerWorkspace(positive), `${name}: positive total`).toBe(false)
      const rows = emptyWorkspace()
      rows[name].items = [{} as never]
      expect(shouldCollapseEmptyOwnerWorkspace(rows), `${name}: has rows`).toBe(false)
    }
  })

  it('keeps generic project pages expanded and every technical panel reachable', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/platform/vnext/ProjectCommandCenter.tsx'), 'utf8',
    )
    expect(source).toContain('Boolean(briefing) && shouldCollapseEmptyOwnerWorkspace(model)')
    expect(source).toContain('<details className={styles.technicalDetails}>')
    expect(source).toContain('<summary className={styles.technicalSummary}>')
    expect(source).toContain('{workspace}')
    for (const section of ['WorkflowsSection', 'InstancesSection', 'ApprovalsSection', 'RunsSection', 'AgentsSection', 'OutputsSection']) {
      expect(source).toContain(`<${section} model={model} />`)
    }
  })
})
