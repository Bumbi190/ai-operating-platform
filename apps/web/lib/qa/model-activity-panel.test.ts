import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModelActivityPanel } from '@/components/platform/vnext/ModelActivityPanel'
import type { ModelActivitySnapshot } from '@/lib/intelligence/model-activity'

const sample: ModelActivitySnapshot = {
  state: 'complete',
  source: 'cost_events',
  periodHours: 24,
  recordedCalls: 2,
  unlinkedCalls: 1,
  observedCostSek: 3.25,
  byModel: [
    { projectId: 'p1', provider: 'aws-bedrock', model: 'claude-sonnet-4-6',
      calls: 2, costSek: 3.25, lastSeen: '2026-11-25T09:00:00Z', runIds: ['run-1'] },
  ],
  byRun: [{ projectId: 'p1', runId: 'run-1', provider: 'aws-bedrock',
    model: 'claude-sonnet-4-6', calls: 1, costSek: 1.25, lastSeen: '2026-11-25T09:00:00Z' }],
}

const markup = (activity: ModelActivitySnapshot | undefined) => renderToStaticMarkup(
  createElement(ModelActivityPanel, {
    activity, projects: [{ id: 'p1', name: 'Familje-Stunden' }],
    runningRunIds: new Set(['run-1']), onFocusProject: () => {},
  }),
)

describe('model activity panel renders source truthfully', () => {
  it('shows real model rows, project, cost and snapshot wording', () => {
    const html = markup(sample)
    expect(html).toContain('claude-sonnet-4-6')
    expect(html).toContain('Familje-Stunden')
    expect(html).toContain('3,25')
    expect(html).toContain('Registrerad modellanv')
    expect(html).toContain('cost_events')
    expect(html).toContain('inte att modellen just nu genererar')
  })
  it('never prints zero-cost metrics for unavailable telemetry', () => {
    const html = markup(undefined)
    expect(html).toContain('Kostnadsunderlag saknas')
    expect(html).toContain('Ok')
    expect(html).not.toContain('0,00')
  })
  it('marks partial event scans, rather than asserting invoice totals', () => {
    const html = markup({ ...sample, state: 'partial' })
    expect(html).toContain('ofullst')
    expect(html).toContain('validerade poster')
  })
})
