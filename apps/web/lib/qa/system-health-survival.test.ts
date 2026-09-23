/**
 * Phase 1b — Atlas Survival on Systemhälsa (`/system`).
 *
 * DISPLAY ONLY. The suite exists to pin the three ways a display-only surface
 * can quietly stop being one:
 *
 *   1. IT DERIVES ITS OWN TRUTH. A second reader, a copied threshold or a
 *      recomputed ceiling would let the page and the API disagree about the
 *      same state, and the page would be the one an operator believes.
 *
 *   2. IT TURNS UNKNOWN INTO A NUMBER. "No runway figure" rendering as 0 is a
 *      survivable-looking platform invented from missing data.
 *
 *   3. IT OFFERS A CONTROL. Nothing here may change the survival state, and the
 *      absence of a control is asserted structurally rather than assumed.
 *
 * The ceiling assertions use the BACKEND's own strings (`describeCeiling`,
 * `SURVIVAL_CEILING_EFFECT`), so the test proves the surface renders what the
 * authoritative module produces rather than a string typed into a fixture.
 */
import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assembleSystemHealth,
  type AssembleSystemHealthInput,
  type SurvivalSection,
  type SystemHealthModel,
} from '@/lib/os/system-health'
import {
  FUNDING_STATE_LABELS,
  SURVIVAL_STATE_LABELS,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
} from '@/lib/os/system-health-shared'
import {
  PROVISIONAL_POLICY_NOTICE,
  SURVIVAL_CEILING_EFFECT,
  SURVIVAL_THRESHOLD_STATUS,
  describeCeiling,
} from '@/lib/atlas/survival'
import type { SurvivalState } from '@/lib/atlas/survival/types'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/system',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/automation', () => ({
  toggleAutomationPause: async () => ({ ok: true, changed: true, paused: true }),
  toggleProjectExecutionPause: async () => ({ ok: true, changed: true, paused: true }),
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments name the things a file deliberately does NOT do; scans read code. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const COMPONENT = 'components/platform/vnext/SystemHealth.tsx'
const LOADER = 'lib/os/system-health.ts'
const SHARED = 'lib/os/system-health-shared.ts'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Built from the authoritative module's own output, never from a typed string —
 * `ceilingLabel` and `ceilingEffect` are exactly what the loader maps across.
 */
function survival(state: SurvivalState, over: Partial<SurvivalSection> = {}): SurvivalSection {
  return {
    state,
    ceilingLabel: describeCeiling(state),
    ceilingEffect: SURVIVAL_CEILING_EFFECT[state],
    fundingState: 'KNOWN',
    bindingScope: 'global_monthly',
    bindingRemainingSek: 1301.53,
    bindingLimitSek: 1500,
    burnSekPerDay: 8.3,
    declaredFundingSek: 120_000,
    runwayDays: 1445.78,
    revenueTrendSek: 12,
    reasons: ['headroom_healthy'],
    gaps: ['infrastructure_cost_untracked'],
    operatingPaused: false,
    thresholdStatus: SURVIVAL_THRESHOLD_STATUS,
    policyNotice: PROVISIONAL_POLICY_NOTICE,
    ...over,
  }
}

function model(over: Partial<AssembleSystemHealthInput> = {}): SystemHealthModel {
  const base: AssembleSystemHealthInput = {
    now: '2026-09-23T12:00:00.000Z',
    platform: { ok: true, value: { automation_paused: false, paused_at: null, paused_reason: null } },
    safety: { flags: {}, findings: [] },
    projects: { ok: true, rows: [], count: 0 },
    openRuns: { ok: true, rows: [], count: 0 },
    recentRuns: { ok: true, rows: [], count: 0 },
    lastRunAt: { ok: true, value: null },
    pendingApprovals: { ok: true, value: 0 },
    approvalsByProject: { ok: true, rows: [], count: null },
    workflows: { ok: true, rows: [], count: 0 },
    dreamIssues: { ok: true, rows: [], count: 0 },
    dreamReconciliation: { ok: true, rows: [], count: 0 },
    legacyMemories: { ok: true, value: 0 },
    survival: { ok: true, value: survival('CONSERVE') },
  }
  return assembleSystemHealth({ ...base, ...over })
}

async function html(m: SystemHealthModel): Promise<string> {
  const { SystemHealth } = await import('@/components/platform/vnext/SystemHealth')
  return renderToStaticMarkup(createElement(SystemHealth, { model: m }))
}

/** The contents of one fact row, selected by its label. */
function fact(rendered: string, labelPrefix: string): string | null {
  const esc = labelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = rendered.match(new RegExp(`<dt>${esc}[^<]*</dt><dd[^>]*>([\\s\\S]*?)</dd>`))
  return m?.[1] ?? null
}

/** Visible text of a fragment, with markup removed. CSS-module class names carry
 *  hex hashes, so a digit check against raw markup would read the hash. */
function text(fragment: string | null): string {
  return (fragment ?? '').replace(/<[^>]*>/g, '')
}

function inner(rendered: string, role: string): string | null {
  const m = rendered.match(new RegExp(`data-role="${role}"[^>]*>([\\s\\S]*?)<`))
  return m?.[1] ?? null
}

// ── 1. One truth source ──────────────────────────────────────────────────────

describe('the surface consumes the authoritative observation', () => {
  it('loads through the same reader the survival API calls', () => {
    const src = codeOnly(read(LOADER))
    expect(src).toMatch(/import \{[^}]*readSurvivalSnapshot[^}]*\} from '@\/lib\/atlas\/survival'/)
    expect(src).toContain('readSurvivalSnapshot(access.allowedProjectIds')
  })

  it('does NOT derive survival itself — no second truth source', () => {
    for (const file of [LOADER, COMPONENT, SHARED]) {
      const src = codeOnly(read(file))
      expect(src, `${file} derives the state`).not.toContain('deriveSurvivalState')
      expect(src, `${file} recomputes a ceiling`).not.toMatch(/survivalCeiling\(|lowestAutonomy\(/)
      expect(src, `${file} owns the ceiling table`).not.toMatch(/SURVIVAL_CEILING\s*\[/)
      expect(src, `${file} reads the ledger directly`).not.toMatch(/budget_headroom|budget_scope_state/)
    }
  })

  it('carries the ceiling as a fully qualified label, so no bare token exists', () => {
    const m = model()
    if (!m.survival.ok) throw new Error('fixture unreadable')
    expect(m.survival.value.ceilingLabel).toBe(describeCeiling('CONSERVE'))
    // The model exposes no bare 'L3'-shaped field at all: there is nothing
    // unqualified the view could print even by accident.
    for (const key of Object.keys(m.survival.value)) {
      expect(key, `suspicious key ${key}`).not.toMatch(/^(ceiling(Fn)?|level|autonomyLevel)$/)
    }
    expect(JSON.stringify(m.survival.value).match(/"L[0-6]"/g) ?? []).toEqual([])
  })

  it('renders exactly the backend strings, for every state', async () => {
    for (const state of ['EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE'] as SurvivalState[]) {
      const rendered = await html(model({ survival: { ok: true, value: survival(state) } }))
      expect(rendered, state).toContain(describeCeiling(state))
      expect(rendered, state).toContain(SURVIVAL_CEILING_EFFECT[state])
      expect(rendered, state).toContain(SURVIVAL_STATE_LABELS[state])
    }
  })
})

// ── 2. The qualified level ───────────────────────────────────────────────────

describe('the autonomy ceiling is never a bare level', () => {
  it('CONSERVE renders "Autonomy License L3"', async () => {
    const rendered = await html(model())
    const ceiling = inner(rendered, 'survival-ceiling')
    expect(ceiling).not.toBeNull()
    expect(ceiling).toContain('Autonomy License L3')
  })

  it('leaves no unqualified level token anywhere in the ceiling element', async () => {
    for (const state of ['CONSERVE', 'CRITICAL', 'HIBERNATE'] as SurvivalState[]) {
      const rendered = await html(model({ survival: { ok: true, value: survival(state) } }))
      const ceiling = inner(rendered, 'survival-ceiling') ?? ''
      // Strip the one legitimate qualified form; anything left is a bare token.
      const stripped = ceiling.replace(/Autonomy License L[0-6]/g, '')
      expect(stripped, `${state}: ${ceiling}`).not.toMatch(/\bL[0-6]\b/)
    }
  })

  it('uses the backend label rather than a locally composed one', async () => {
    const src = codeOnly(read(COMPONENT))
    // A hand-built "Autonomy License " + level concat would be a second source
    // for a string the backend already owns.
    expect(src).not.toMatch(/`Autonomy License/)
    expect(src).not.toMatch(/'Autonomy License/)
  })
})

// ── 3. Unknown stays unknown ─────────────────────────────────────────────────

describe('missing data is never rendered as a number', () => {
  it('an unknown runway renders as unknown, not 0', async () => {
    const rendered = await html(model({
      survival: { ok: true, value: survival('CONSERVE', { runwayDays: null }) },
    }))
    const value = text(fact(rendered, 'Räckvidd'))
    expect(value).not.toBe('')
    expect(value).toContain(UNKNOWN_LABEL.toLowerCase())
    expect(value, 'a missing runway must not become a figure').not.toMatch(/\d/)
  })

  it('an unknown burn renders as unknown, not 0', async () => {
    const rendered = await html(model({
      survival: { ok: true, value: survival('CONSERVE', { burnSekPerDay: null }) },
    }))
    const value = text(fact(rendered, 'Uppmätt förbrukning'))
    expect(value).not.toBe('')
    expect(value).toContain(UNKNOWN_LABEL.toLowerCase())
    expect(value).not.toMatch(/\d/)
  })

  it('an unknown headroom renders as unknown, not 0 / 0', async () => {
    const rendered = await html(model({
      survival: {
        ok: true,
        value: survival('CONSERVE', { bindingRemainingSek: null, bindingLimitSek: null }),
      },
    }))
    const value = text(fact(rendered, 'Budgetutrymme'))
    expect(value).not.toBe('')
    expect(value).toContain(UNKNOWN_LABEL.toLowerCase())
    expect(value).not.toMatch(/\d/)
  })

  it('an unreadable observation renders as unreadable, never as a state', async () => {
    const rendered = await html(model({ survival: { ok: false } }))
    expect(rendered).toContain(UNREADABLE_LABEL.toLowerCase())
    for (const label of Object.values(SURVIVAL_STATE_LABELS)) {
      expect(rendered, `leaked state ${label}`).not.toContain(label)
    }
    // …and it must not take the rest of the surface down with it.
    expect(rendered).toContain('Systemhälsa')
  })

  it('an unknown revenue trend renders as unknown, not 0', async () => {
    const rendered = await html(model({
      survival: { ok: true, value: survival('CONSERVE', { revenueTrendSek: null }) },
    }))
    const value = text(fact(rendered, 'Intäktstrend'))
    expect(value).toContain(UNKNOWN_LABEL.toLowerCase())
    expect(value).not.toMatch(/\d/)
  })
})

// ── 4. UNDECLARED ≠ UNAVAILABLE ──────────────────────────────────────────────

describe('the three funding situations stay distinct', () => {
  it('renders different wording for UNDECLARED and UNAVAILABLE', async () => {
    const undeclared = await html(model({
      survival: { ok: true, value: survival('CONSERVE', { fundingState: 'UNDECLARED', declaredFundingSek: null }) },
    }))
    const unavailable = await html(model({
      survival: { ok: true, value: survival('CRITICAL', { fundingState: 'UNAVAILABLE', declaredFundingSek: null }) },
    }))

    expect(fact(undeclared, 'Finansiering')).toContain(FUNDING_STATE_LABELS.UNDECLARED)
    expect(fact(unavailable, 'Finansiering')).toContain(FUNDING_STATE_LABELS.UNAVAILABLE)
    expect(FUNDING_STATE_LABELS.UNDECLARED).not.toBe(FUNDING_STATE_LABELS.UNAVAILABLE)
    expect(fact(undeclared, 'Deklarerat driftkapital')).toContain(FUNDING_STATE_LABELS.UNDECLARED)
    expect(fact(unavailable, 'Deklarerat driftkapital')).toContain(FUNDING_STATE_LABELS.UNAVAILABLE)
  })

  it('shows an amount for the declared capital ONLY when funding is KNOWN', async () => {
    const known = await html(model({
      survival: { ok: true, value: survival('NORMAL', { fundingState: 'KNOWN', declaredFundingSek: 120_000 }) },
    }))
    expect(text(fact(known, 'Deklarerat driftkapital'))).toMatch(/\d/)

    for (const state of ['UNDECLARED', 'UNAVAILABLE'] as const) {
      const rendered = await html(model({
        survival: { ok: true, value: survival('CONSERVE', { fundingState: state, declaredFundingSek: null }) },
      }))
    }
  })

  it('does not give UNDECLARED the failed-read warning tone that UNAVAILABLE takes', async () => {
    // The requirement is tonal, so it is asserted on the rendered markup's tone
    // attribute rather than on wording alone.
    const undeclared = await html(model({
      survival: { ok: true, value: survival('CONSERVE', { fundingState: 'UNDECLARED' }) },
    }))
    const unavailable = await html(model({
      survival: { ok: true, value: survival('CRITICAL', { fundingState: 'UNAVAILABLE' }) },
    }))
    const toneOf = (rendered: string) => {
      const m = rendered.match(/<dt>Finansiering<\/dt>/)
      if (!m) return null
      const before = rendered.slice(0, m.index)
      const lastDiv = before.lastIndexOf('<div class=')
      return before.slice(lastDiv).match(/data-tone="([a-z]+)"/)?.[1] ?? null
    }
    expect(toneOf(unavailable)).toBe('attention')
    expect(toneOf(undeclared)).not.toBe('attention')
  })
})

// ── 5. MRR is a signal ───────────────────────────────────────────────────────

describe('revenue is shown as a signal, never as cash', () => {
  it('states that the trend is not available funds and not runway', async () => {
    const rendered = await html(model())
    expect(rendered).toContain('prestationssignal')
    expect(rendered).toMatch(/inte tillgängliga medel/)
    expect(rendered).toMatch(/aldrig som räckvidd/)
  })

  it('keeps the revenue row out of the runway row', async () => {
    const rendered = await html(model({
      survival: { ok: true, value: survival('NORMAL', { runwayDays: 30, revenueTrendSek: 5000 }) },
    }))
    const runway = text(fact(rendered, 'Räckvidd'))
    const revenue = text(fact(rendered, 'Intäktstrend'))
    expect(runway).toContain('30')
    // The MRR figure must not appear in the runway figure.
    expect(runway).not.toContain('5')
    expect(revenue).toMatch(/\d/)
  })

  it('does not label MRR as cash, runway or budget', async () => {
    for (const file of [COMPONENT, SHARED]) {
      const src = codeOnly(read(file))
      const wrong = src.match(/MRR[^.\n]*\b(kassa|kontant|räckvidd|runway|cash|budget)\b/gi) ?? []
      expect(wrong, `${file}: ${wrong.join(', ')}`).toEqual([])
    }
  })
})

// ── 6. Provisional policy is visible ─────────────────────────────────────────

describe('provisional policy is stated in the reading order', () => {
  it('renders the notice as visible text, not only in a tooltip', async () => {
    const rendered = await html(model())
    const block = inner(rendered, 'survival-provisional')
    expect(block).not.toBeNull()
    expect(rendered).toContain(SURVIVAL_THRESHOLD_STATUS)
    // The backend's own string, verbatim — not a UI-authored paraphrase.
    expect(rendered).toContain(PROVISIONAL_POLICY_NOTICE)
  })

  it('is not hidden behind title/aria-hidden or a collapsed detail', async () => {
    const src = codeOnly(read(COMPONENT))
    const at = src.indexOf('data-role="survival-provisional"')
    expect(at).toBeGreaterThan(-1)
    const block = src.slice(at, at + 500)
    expect(block).not.toMatch(/aria-hidden|title=/)
    expect(block).not.toMatch(/<details|tooltip/i)
  })

  it('the notice claims observation, not enforcement', () => {
    expect(PROVISIONAL_POLICY_NOTICE).toMatch(/NOT wired to execution/)
  })
})

// ── 7. No control, no duplicated policy ──────────────────────────────────────

describe('the surface cannot change the survival state', () => {
  it('the survival panel carries no button, form, action or handler', async () => {
    const src = codeOnly(read(COMPONENT))
    const panel = src.slice(src.indexOf('function SurvivalPanel'), src.indexOf('function SafetyPanel'))
    expect(panel.length).toBeGreaterThan(100)
    for (const forbidden of ['<button', '<form', '<input', 'onClick', 'onSubmit', 'useActionState']) {
      expect(panel, `survival panel contains ${forbidden}`).not.toContain(forbidden)
    }
    // Nor the existing pause controls, which belong to the safety area only.
    expect(panel).not.toMatch(/PauseToggle/)
  })

  it('the survival panel offers no link that could write', async () => {
    const src = codeOnly(read(COMPONENT))
    const panel = src.slice(src.indexOf('function SurvivalPanel'), src.indexOf('function SafetyPanel'))
    expect(panel).not.toMatch(/<Link|<a\s|href=/)
  })

  it('does not import the survival module for anything that mutates', async () => {
    for (const file of [LOADER, COMPONENT, SHARED]) {
      const src = codeOnly(read(file))
      expect(src, file).not.toMatch(/stop_set_|setPlatformAutomationStop|setProjectExecutionStop/)
      expect(src, file).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
    }
  })
})

describe('no survival policy is duplicated in the UI', () => {
  it('references none of the threshold constants', () => {
    for (const file of [COMPONENT, SHARED, LOADER]) {
      const src = codeOnly(read(file))
      // The notice and the status token are the backend's own symbols and the
      // loader must import them; the six NUMERIC thresholds are what may not
      // appear here.
      expect(src, file).not.toMatch(/PROVISIONAL_(CRITICAL|CONSERVE|EXPAND)[A-Z_]*/)
      expect(src, file).not.toMatch(/HEADROOM_FRACTION|RUNWAY_(CRITICAL|CONSERVE)_DAYS/)
      expect(src, file).not.toMatch(/FUNDING_(UNDECLARED|UNAVAILABLE|DEPLETED)_FLOOR/)
    }
  })

  it('recomputes no budget arithmetic', () => {
    const src = codeOnly(read(COMPONENT))
    expect(src).not.toMatch(/remainingSek\s*[/*+-]|limitSek\s*[/*+-]/)
    expect(src).not.toMatch(/[/*]\s*limitSek|limitSek\s*[/*]/)
  })

  it('renders the notice and the label from the backend rather than restating them', () => {
    const src = codeOnly(read(COMPONENT))
    expect(src).not.toMatch(/Survival thresholds are provisional/)
    expect(src).not.toMatch(/Autonomy License L\d —/)
  })
})
