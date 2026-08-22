// Phase 3A Slice D — run, approval, output, and failure clarity.
// Rendered-behavior tests for NodeInspector: every assertion reads the real
// static markup produced from validated contract data, never source text.
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

import { RUNTIME_NODE_KINDS, STATIC_NODE_KINDS, type IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { NodeInspector } from './NodeInspector'

function render(node: IntelligenceGraphNode): string {
  return renderToStaticMarkup(createElement(NodeInspector, {
    node,
    edges: [],
    neighbors: [],
    onClose: () => {},
    onSelectNeighbor: () => {},
  }))
}

/** Wording the truth contract forbids anywhere in the inspector. */
const FORBIDDEN_WORDS = [
  'live', 'realtime', 'real-time', 'aktiv just nu', 'arbetar', 'väntar på dig',
  'incident', 'löst', 'återansluter', 'fräsch', 'healthy', 'degraded', 'stale',
  'executing', 'idle', 'busy', 'online', 'offline', 'heartbeat',
]

function expectNoFabrication(markup: string): void {
  const lower = markup.toLowerCase()
  for (const word of FORBIDDEN_WORDS) {
    expect(lower).not.toContain(word.toLowerCase())
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

// ─── Runs ──────────────────────────────────────────────────────────────────

describe('NodeInspector — run truth', () => {
  const RUN_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled', 'an_unrecognized_status']

  it.each(RUN_STATUSES)('renders the persisted run status "%s" literally, never reclassified', (status) => {
    const node: IntelligenceGraphNode = {
      id: `run:${status}`, kind: 'run', label: 'Test run', source: 'runtime', status,
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(markup).toContain('Körningsstatus')
    expect(markup).toContain(status)
  })

  it('renders the run status exactly once, in the Körningsstatus row only — not in the header', () => {
    const node: IntelligenceGraphNode = {
      id: 'run:once', kind: 'run', label: 'Once run', source: 'runtime', status: 'completed',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(countOccurrences(markup, '>completed<')).toBe(1)
  })

  it('renders an invalid persisted timestamp as the raw string, never "Invalid Date"', () => {
    const node: IntelligenceGraphNode = {
      id: 'run:bad-timestamp', kind: 'run', label: 'Bad timestamp run', source: 'runtime', status: 'pending',
      metadata: { createdAt: 'not-a-real-date' },
    }
    const markup = render(node)
    expect(markup).toContain('not-a-real-date')
    expect(markup).not.toContain('Invalid Date')
  })

  it('renders startedAt/finishedAt only when persisted, never inferred', () => {
    const withAll: IntelligenceGraphNode = {
      id: 'run:full', kind: 'run', label: 'Full run', source: 'runtime', status: 'completed',
      metadata: {
        createdAt: '2026-07-18T10:00:00Z',
        startedAt: '2026-07-18T10:01:00Z',
        finishedAt: '2026-07-18T10:05:00Z',
      },
    }
    const partial: IntelligenceGraphNode = {
      id: 'run:partial', kind: 'run', label: 'Partial run', source: 'runtime', status: 'running',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const fullMarkup = render(withAll)
    const partialMarkup = render(partial)

    expect(fullMarkup).toContain('Startad')
    expect(fullMarkup).toContain('Avslutad')
    expect(partialMarkup).not.toContain('Startad')
    expect(partialMarkup).not.toContain('Avslutad')
  })

  it('renders attempts only when the field is present', () => {
    const withAttempts: IntelligenceGraphNode = {
      id: 'run:attempts', kind: 'run', label: 'Retried run', source: 'runtime', status: 'failed',
      metadata: { createdAt: '2026-07-18T10:00:00Z', attempts: 3 },
    }
    const withoutAttempts: IntelligenceGraphNode = {
      id: 'run:no-attempts', kind: 'run', label: 'Fresh run', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    expect(render(withAttempts)).toContain('Försök')
    expect(render(withAttempts)).toContain('>3<')
    expect(render(withoutAttempts)).not.toContain('Försök')
  })

  it('renders attempts: 0 as a real value, not treated as absent', () => {
    const zeroAttempts: IntelligenceGraphNode = {
      id: 'run:zero-attempts', kind: 'run', label: 'Fresh run', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z', attempts: 0 },
    }
    const markup = render(zeroAttempts)
    expect(markup).toContain('Försök')
    expect(markup).toContain('>0<')
  })

  it('shows a bounded error excerpt as Felmeddelande, never as an incident', () => {
    const failed: IntelligenceGraphNode = {
      id: 'run:failed-error', kind: 'run', label: 'Broken run', source: 'runtime', status: 'failed',
      metadata: { createdAt: '2026-07-18T10:00:00Z', error: 'ECONNRESET: connection reset' },
    }
    const markup = render(failed)
    expect(markup).toContain('Felmeddelande')
    expect(markup).toContain('ECONNRESET: connection reset')
    expect(markup.toLowerCase()).not.toContain('incident')
  })

  it('omits the error block entirely when no error is persisted', () => {
    const clean: IntelligenceGraphNode = {
      id: 'run:clean', kind: 'run', label: 'Clean run', source: 'runtime', status: 'completed',
      metadata: { createdAt: '2026-07-18T10:00:00Z', error: null },
    }
    expect(render(clean)).not.toContain('Felmeddelande')
  })

  it('never uses stale/live/healthy/degraded/incident wording for any run status', () => {
    for (const status of RUN_STATUSES) {
      const node: IntelligenceGraphNode = {
        id: `run:nofab:${status}`, kind: 'run', label: 'Run', source: 'runtime', status,
        metadata: {
          createdAt: '2026-07-18T10:00:00Z',
          error: status === 'failed' ? 'boom' : null,
          attempts: 1,
        },
      }
      expectNoFabrication(render(node))
    }
  })
})

// ─── Approvals ───────────────────────────────────────────────────────────────

describe('NodeInspector — approval truth', () => {
  const APPROVAL_STATUSES = ['pending', 'awaiting_approval', 'approved', 'rejected']

  it.each(APPROVAL_STATUSES)('renders the persisted approval status "%s" literally', (status) => {
    const node: IntelligenceGraphNode = {
      id: `approval:${status}`, kind: 'approval', label: 'Approval', source: 'runtime', status,
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(markup).toContain('Godkännandestatus')
    expect(markup).toContain(status)
  })

  it('renders the approval status exactly once, in the Godkännandestatus row only — not in the header', () => {
    const node: IntelligenceGraphNode = {
      id: 'approval:once', kind: 'approval', label: 'Once approval', source: 'runtime', status: 'approved',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(countOccurrences(markup, '>approved<')).toBe(1)
  })

  it('renders created and reviewed timestamps only when persisted', () => {
    const reviewed: IntelligenceGraphNode = {
      id: 'approval:reviewed', kind: 'approval', label: 'Reviewed', source: 'runtime', status: 'approved',
      metadata: { createdAt: '2026-07-18T10:00:00Z', reviewedAt: '2026-07-18T11:00:00Z', operator: 'alice' },
    }
    const unreviewed: IntelligenceGraphNode = {
      id: 'approval:unreviewed', kind: 'approval', label: 'Unreviewed', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const reviewedMarkup = render(reviewed)
    const unreviewedMarkup = render(unreviewed)

    expect(reviewedMarkup).toContain('Granskad')
    expect(reviewedMarkup).toContain('Granskad av')
    expect(reviewedMarkup).toContain('alice')
    expect(unreviewedMarkup).not.toContain('Granskad')
  })

  it('renders read-only: no approve/reject/revise action controls', () => {
    const node: IntelligenceGraphNode = {
      id: 'approval:readonly', kind: 'approval', label: 'Pending approval', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    // Approval is not in the drill/isolate action-button kind list, so the
    // only <button> that can ever render here is the panel's close button.
    const buttonCount = (markup.match(/<button/g) ?? []).length
    expect(buttonCount).toBe(1)
  })

  it('does not claim expired or cancelled unless that status is actually persisted', () => {
    const node: IntelligenceGraphNode = {
      id: 'approval:no-expiry-claim', kind: 'approval', label: 'Pending approval', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node).toLowerCase()
    expect(markup).not.toContain('expired')
    expect(markup).not.toContain('utgången')
    expect(markup).not.toContain('cancelled')
  })
})

// ─── Outputs ──────────────────────────────────────────────────────────────────

describe('NodeInspector — output truth', () => {
  it('renders artifact type and createdAt, nothing more', () => {
    const node: IntelligenceGraphNode = {
      id: 'output:1', kind: 'output', label: 'Report.pdf', source: 'runtime',
      metadata: { type: 'pdf', createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(markup).toContain('Artefakttyp')
    expect(markup).toContain('pdf')
    expect(markup).toContain('Skapad')
  })

  it('never infers delivered, published, reviewed, approved, or sent state', () => {
    const node: IntelligenceGraphNode = {
      id: 'output:2', kind: 'output', label: 'Report.pdf', source: 'runtime',
      metadata: { type: 'pdf', createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node).toLowerCase()
    const forbidden = [
      'delivered', 'levererad', 'published', 'publicerad',
      'reviewed', 'granskad', 'approved', 'godkänd', 'customer-visible',
    ]
    for (const word of forbidden) {
      expect(markup).not.toContain(word)
    }
  })
})

// ─── Workflows ────────────────────────────────────────────────────────────────

describe('NodeInspector — workflow configuration truth', () => {
  it('shows enabled configuration without claiming the workflow is running now', () => {
    const node: IntelligenceGraphNode = {
      id: 'workflow:active', kind: 'workflow', label: 'Nightly sync', source: 'runtime', status: 'active',
      metadata: { trigger: 'cron' },
    }
    const markup = render(node)
    expect(markup).toContain('Konfiguration')
    expect(markup).toContain('aktiverad')
    expect(markup).not.toContain('· active')
    const lower = markup.toLowerCase()
    expect(lower).not.toContain('running')
    expect(lower).not.toContain('körs')
    expect(lower).not.toContain('live')
    expect(lower).not.toContain('aktiv just nu')
  })

  it('shows disabled configuration for inactive workflows', () => {
    const node: IntelligenceGraphNode = {
      id: 'workflow:inactive', kind: 'workflow', label: 'Old flow', source: 'runtime', status: 'inactive',
      metadata: { trigger: 'manual' },
    }
    expect(render(node)).toContain('inaktiverad')
  })

  it('shows an unclassified configuration state for an unrecognized status, not a stronger claim', () => {
    const node: IntelligenceGraphNode = {
      id: 'workflow:weird', kind: 'workflow', label: 'Mystery flow', source: 'runtime', status: 'weird_value',
      metadata: {},
    }
    const markup = render(node)
    expect(markup).toContain('okänd')
    expect(markup).not.toContain('aktiverad')
  })

  it('shows no Konfiguration row for a workflow with no persisted status', () => {
    const node: IntelligenceGraphNode = {
      id: 'workflow:no-status', kind: 'workflow', label: 'Undated flow', source: 'runtime',
      metadata: { trigger: 'manual' },
    }
    expect(render(node)).not.toContain('Konfiguration')
  })
})

// ─── Agents ───────────────────────────────────────────────────────────────────

describe('NodeInspector — agent definition truth', () => {
  it('renders model and description with no executing/idle/online/offline claim', () => {
    const node: IntelligenceGraphNode = {
      id: 'agent:1', kind: 'agent', label: 'Support agent', source: 'runtime',
      metadata: { model: 'claude-sonnet-5', description: 'Handles support tickets' },
    }
    const markup = render(node)
    expect(markup).toContain('Modell')
    expect(markup).toContain('claude-sonnet-5')
    expect(markup).toContain('Beskrivning')
    expect(markup).toContain('Handles support tickets')
    expectNoFabrication(markup)
  })

  it('never displays a synthetic status carried on an agent node', () => {
    const node: IntelligenceGraphNode = {
      id: 'agent:synthetic-status', kind: 'agent', label: 'Agent', source: 'runtime',
      status: 'synthetic_online',
      metadata: { model: 'claude-sonnet-5' },
    }
    const markup = render(node)
    expect(markup).not.toContain('synthetic_online')
    expect(markup).not.toContain('Körningsstatus')
  })
})

// ─── Manager tasks ────────────────────────────────────────────────────────────

describe('NodeInspector — manager task truth', () => {
  it('renders task status only, with no Manager runtime or delegation wording', () => {
    const node: IntelligenceGraphNode = {
      id: 'task:1', kind: 'task', label: 'Draft the brief', source: 'runtime', status: 'todo',
      metadata: { createdAt: '2026-07-18T10:00:00Z', priority: 'high' },
    }
    const markup = render(node)
    expect(markup).toContain('Uppgiftsstatus')
    expect(markup).toContain('todo')
    expect(markup).toContain('Prioritet')
    expect(markup).toContain('high')
    expectNoFabrication(markup)
    const lower = markup.toLowerCase()
    expect(lower).not.toContain('delegerad')
    expect(lower).not.toContain('delegation')
    expect(lower).not.toContain('manager kör')
  })

  it('renders the task status exactly once, in the Uppgiftsstatus row only — not in the header', () => {
    const node: IntelligenceGraphNode = {
      id: 'task:once', kind: 'task', label: 'Once task', source: 'runtime', status: 'done',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(countOccurrences(markup, '>done<')).toBe(1)
  })

  it('renders priority: 0 as a real value, not treated as absent', () => {
    const node: IntelligenceGraphNode = {
      id: 'task:zero-priority', kind: 'task', label: 'Zero priority task', source: 'runtime', status: 'todo',
      metadata: { createdAt: '2026-07-18T10:00:00Z', priority: 0 },
    }
    const markup = render(node)
    expect(markup).toContain('Prioritet')
    expect(markup).toContain('>0<')
  })
})

// ─── No-fabrication safeguards ─────────────────────────────────────────────

describe('NodeInspector — no-fabrication safeguards', () => {
  const REPRESENTATIVE_NODES: IntelligenceGraphNode[] = [
    {
      id: 'run:x', kind: 'run', label: 'Run', source: 'runtime', status: 'failed',
      metadata: { createdAt: '2026-07-18T10:00:00Z', error: 'boom', attempts: 2 },
    },
    {
      id: 'approval:x', kind: 'approval', label: 'Approval', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    },
    {
      id: 'output:x', kind: 'output', label: 'Output', source: 'runtime',
      metadata: { type: 'json', createdAt: '2026-07-18T10:00:00Z' },
    },
    {
      id: 'workflow:x', kind: 'workflow', label: 'Workflow', source: 'runtime', status: 'active',
      metadata: { trigger: 'manual' },
    },
    {
      id: 'agent:x', kind: 'agent', label: 'Agent', source: 'runtime',
      metadata: { model: 'x', description: 'y' },
    },
    {
      id: 'task:x', kind: 'task', label: 'Task', source: 'runtime', status: 'todo',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    },
  ]

  it('never fabricates incident, retry-lineage, or causal wording for any runtime kind', () => {
    for (const node of REPRESENTATIVE_NODES) {
      const markup = render(node).toLowerCase()
      expect(markup).not.toContain('incident')
      expect(markup).not.toContain('retry')
      expect(markup).not.toContain('återförsök')
      expect(markup).not.toContain('orsakade')
      expect(markup).not.toContain('caused')
      expect(markup).not.toContain('root cause')
    }
  })

  it('has no Atlas runtime kind in the graph contract — Atlas cannot reach this inspector', () => {
    expect(RUNTIME_NODE_KINDS).not.toContain('atlas')
    expect(STATIC_NODE_KINDS).not.toContain('atlas')
  })
})

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('NodeInspector — accessibility', () => {
  it('renders failure text as plain, screen-reader-readable text', () => {
    const node: IntelligenceGraphNode = {
      id: 'run:a11y-error', kind: 'run', label: 'Broken run', source: 'runtime', status: 'failed',
      metadata: { createdAt: '2026-07-18T10:00:00Z', error: 'Timeout after 30s' },
    }
    const markup = render(node)
    expect(markup).toMatch(/<p[^>]*>Felmeddelande<\/p>/)
    expect(markup).toContain('Timeout after 30s')
  })

  it('keeps meaningful accessible link names for runtime nodes', () => {
    const run: IntelligenceGraphNode = {
      id: 'run:link', kind: 'run', label: 'Run', source: 'runtime', status: 'completed',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const approval: IntelligenceGraphNode = {
      id: 'approval:link', kind: 'approval', label: 'Approval', source: 'runtime', status: 'pending',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const task: IntelligenceGraphNode = {
      id: 'task:link', kind: 'task', label: 'Task', source: 'runtime', status: 'todo',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    expect(render(run)).toContain('Öppna Aktivitet')
    expect(render(approval)).toContain('Öppna Granskningar')
    expect(render(task)).toContain('Öppna Manager')
  })

  it('carries status meaning as text, not color alone', () => {
    const node: IntelligenceGraphNode = {
      id: 'run:text-status', kind: 'run', label: 'Run', source: 'runtime', status: 'failed',
      metadata: { createdAt: '2026-07-18T10:00:00Z' },
    }
    const markup = render(node)
    expect(markup).toContain('Körningsstatus')
    expect(markup).toContain('failed')
  })
})
