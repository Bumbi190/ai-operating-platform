/**
 * Handlarbörsen owner brief: grounded data, explicit Atlas chat scope,
 * honest unknown/empty states and no authority expansion.
 */

import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HandlarborsenOwnerBrief } from '@/components/platform/vnext/HandlarborsenOwnerBrief'
import { emptyReport, type MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { resolveDestination } from '@/lib/nav/registry'
import type { ProjectCommandCenterModel } from '@/lib/os/project-command-center'

// The repository's Vitest JSX transform uses React's classic runtime.
;(globalThis as unknown as { React: typeof React }).React = React

const root = resolve(__dirname, '../..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

function model(agents: number | null = 0, workflows: number | null = 0, failed = false) {
  const section = (n: number | null) => ({
    state: failed ? 'error' as const : 'ok' as const,
    items: [],
    total: n,
    truncated: false,
  })
  return {
    agents: section(agents),
    workflows: section(workflows),
    links: { build: null,
      agents: '/projects/handlarborsen/agents',
      workflows: '/projects/handlarborsen/workflows',
      marketplace: '/projects/handlarborsen/marketplace',
      runs: null,
      outputs: null,
      newAgent: null,
      newWorkflow: null,
      media: null,
      approvals: null,
    },
  } as Pick<ProjectCommandCenterModel, 'agents' | 'workflows' | 'links'>
}

const report = (freshness: 'fresh' | 'stale' = 'fresh'): MarketplaceReport => ({
  state: 'ok',
  latest: {
    snapshotDate: '2026-10-10',
    observedAt: '2026-10-10T10:22:48.446Z',
    capturedAt: '2026-10-10T10:22:49.000Z',
    completeness: 'complete',
    availableCount: 11,
    unavailableCount: 0,
    metrics: [],
    ageHours: freshness === 'fresh' ? 1 : 40,
    freshness,
  },
  collection: {
    lastSuccess: { ranAt: '2026-10-10T10:22:49.000Z', snapshotDate: '2026-10-10', ageHours: 1 },
    lastAttempt: { ranAt: '2026-10-10T10:22:49.000Z', status: 'ok' },
    today: 'none',
    todayDate: '2026-10-11',
    latestAttemptFailed: false,
  },
  history: {
    series: [], snapshotCount: 1, skippedInvalid: 0, previous: null,
    comparison: { available: false, reason: 'no_previous_snapshot' },
  },
})

function html(modelInput = model(), reportInput: MarketplaceReport = report()) {
  return renderToStaticMarkup(createElement(HandlarborsenOwnerBrief, { model: modelInput, report: reportInput }))
}

describe('Handlarbörsen owner brief', () => {
  it('names the purpose, with no invented agent, KPI or pilot statistics', () => {
    const result = html()
    expect(result).toContain('Nästa steg för projektet')
    expect(result).toContain('Analysera med Atlas')
    expect(result).toContain('Bygg arbetsflödet')
    expect(result).toContain('Dagens insamling:')
    expect(result).not.toContain('kundnöjdhet')
    expect(result).not.toContain('AI-poäng')
    expect(result).not.toContain('pilotföretag')
  })

  it('links Atlas through the canonical registry and explains project naming', () => {
    const result = html()
    expect(result).toContain('Handlarbörsen')
    expect(result).toContain(`href="${resolveDestination('chat')!.href}"`)
    expect(source('components/platform/vnext/HandlarborsenOwnerBrief.tsx'))
      .toContain("resolveDestination('chat')")
  })

  it('reports an exact zero only when both sections were read successfully', () => {
    const result = html(model(0, 0))
    expect(result).toContain('Inga agenter eller workflows är skapade')
    expect(result).toContain('Agenter</dt><dd>0</dd>')
    expect(result).toContain('Workflows</dt><dd>0</dd>')
    expect(result).toContain('href="/projects/handlarborsen/agents"')
    expect(result).toContain('href="/projects/handlarborsen/workflows"')
  })

  it('does not say zero when source status or total is unknown', () => {
    for (const input of [model(null, null), model(0, 0, true)]) {
      const result = html(input)
      expect(result).not.toContain('Inga agenter eller workflows är skapade')
      expect(result).toContain('Agenter</dt><dd>Okänt</dd>')
      expect(result).toContain('Workflows</dt><dd>Okänt</dd>')
    }
  })

  it('uses the stored report freshness, without generating trends', () => {
    expect(html(model(), report())).toContain('Senaste rapporten är sparad')
    expect(html(model(), report('stale'))).toContain('Rapporten är äldre än 26 timmar')
    expect(html(model(), report('stale'))).toContain('data-tone="warning"')
    expect(html()).not.toContain('Ökning')
    expect(html()).not.toContain('Minskning')
  })

  it('explicitly states no snapshot, invalid snapshot or read failure', () => {
    expect(html(model(), emptyReport('no_snapshot'))).toContain('Ingen sparad rapport ännu')
    expect(html(model(), emptyReport('invalid_snapshot'))).toContain('Rapporten gick inte att verifiera')
    expect(html(model(), emptyReport('read_failed'))).toContain('Statistiken kunde inte läsas')
    expect(html(model(), emptyReport('not_enabled'))).toContain('Statistiken är inte tillgänglig')
  })

  it('is mounted only after the identity check and an allowed report read', () => {
    const page = source('app/(platform)/projects/[slug]/page.tsx')
    expect(page).toContain('isHandlarborsenProject(project)')
    expect(page).toMatch(/result.status === 'ok'[\s\S]*?<HandlarborsenOwnerBrief/)
    expect(page).toContain('<ProjectCommandCenter model={model} overview={overview} briefing={briefing} />')
    const generic = source('components/platform/vnext/ProjectCommandCenter.tsx')
    expect(generic).toContain('{briefing ?? null}')
    expect(generic).not.toContain('HandlarborsenOwnerBrief')
  })

  it('has no forms, mutations, storage, new project query or synthetic scope', () => {
    const src = source('components/platform/vnext/HandlarborsenOwnerBrief.tsx')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/)
    expect(code).not.toMatch(/from\(['"]projects['"]\)/)
    expect(code).not.toMatch(/createAdminClient|supabase|fetch\(/)
    expect(code).not.toMatch(/\bMath\.random\(/)
  })
})
