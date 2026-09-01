/**
 * G3A — WHO may stop the platform, and WHAT each execution context may do.
 *
 * The first G3A revision proved the database authority and then handed the
 * global kill switch to anyone with a session. Identity is not authority: an
 * authenticated stranger could pause every tenant, and — far worse — could
 * RESUME after an operator stopped the platform mid-incident. Pause is
 * recoverable; an unauthorised resume re-enables unattended spend and external
 * side effects while the reason for the pause is still live.
 *
 * These are the twelve security regressions that must never come back, plus the
 * vocabulary pins that stop OPERATOR_INTERACTIVE from quietly becoming the
 * execution escape hatch.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isPlatformOperatorEmail, platformOperatorAllowlist,
} from '@/lib/auth/platform-operator'
import {
  resolveExecutionStop, GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION,
  OPERATOR_EXECUTION_PATHS_FOR_G3C, DUAL_MODE_EXECUTION_PATHS_FOR_G3C,
  type ExecutionContext,
} from '@/lib/governance/execution-stop'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ')

const OPERATOR = 'operator@omnira.test'
const STRANGER = 'stranger@example.com'
const PROJECT  = '11111111-1111-1111-1111-111111111111'
const OTHER    = '22222222-2222-2222-2222-222222222222'

type StateRow = {
  global_paused: boolean; global_paused_at: string | null
  global_paused_reason: string | null; project_requested: boolean
  project_found: boolean; project_paused: boolean | null
  project_paused_at: string | null; project_paused_reason: string | null
}
const stateRow = (o: Partial<StateRow> = {}): StateRow => ({
  global_paused: false, global_paused_at: null, global_paused_reason: null,
  project_requested: false, project_found: false, project_paused: null,
  project_paused_at: null, project_paused_reason: null, ...o,
})
const returns = (row: StateRow) =>
  ({ rpc: async () => ({ data: [row], error: null }) }) as unknown as SupabaseClient

// ── A. Platform-operator authority (regressions 1–5) ────────────────────────

describe('platform-operator authority', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    delete process.env.BREVO_ADMIN_EMAIL
  })
  afterEach(() => { process.env = { ...saved } })

  it('REGRESSION 2/3 · an authenticated NON-operator is neither pause nor resume', () => {
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    // The predicate is direction-agnostic: it gates the authority, and pause and
    // resume are the same authority. There is no path where resume is laxer.
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
    expect(isPlatformOperatorEmail('')).toBe(false)
    expect(isPlatformOperatorEmail(null)).toBe(false)
    expect(isPlatformOperatorEmail(undefined)).toBe(false)
  })

  it('REGRESSION 4/5 · the configured operator may pause AND resume', () => {
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(true)
    // Case and whitespace are normalised on both sides; an operator must not be
    // locked out of their own kill switch by a capital letter.
    expect(isPlatformOperatorEmail('  OPERATOR@OMNIRA.TEST  ')).toBe(true)
  })

  it('FAIL CLOSED · no configuration authorises NOBODY, not everybody', () => {
    expect(platformOperatorAllowlist()).toEqual([])
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(false)
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
    // An empty string in the env must not become a wildcard entry.
    process.env.PLATFORM_OPERATOR_EMAILS = ',  ,'
    expect(platformOperatorAllowlist()).toEqual([])
    expect(isPlatformOperatorEmail('')).toBe(false)
  })

  it('supports multiple operators without a second identity system', () => {
    process.env.PLATFORM_OPERATOR_EMAILS = `a@x.test, ${OPERATOR}`
    process.env.BREVO_ADMIN_EMAIL = 'seed@x.test'
    expect(platformOperatorAllowlist().sort())
      .toEqual(['a@x.test', OPERATOR, 'seed@x.test'].sort())
    expect(isPlatformOperatorEmail('a@x.test')).toBe(true)
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
  })

  it('does NOT inherit the knowledge-classification allowlist', () => {
    // Those two lists grant very different things. Sharing them would mean
    // adding someone to a document allowlist hands them the platform kill switch.
    process.env.ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS = STRANGER
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
    expect(code('lib/auth/platform-operator.ts'))
      .not.toContain('ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS')
  })
})

describe('the global mutation path is gated on authority, not identity', () => {
  const actions = code('app/actions/automation.ts')

  it('REGRESSION 1 · an unauthenticated caller never reaches the mutation', () => {
    expect(actions).toContain("redirect('/login')")
    // The redirect must precede the setter in BOTH actions.
    for (const fn of ['toggleAutomationPause', 'toggleProjectExecutionPause']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`))
      const cut = body.indexOf('export async function', 10)
      const scoped = cut > 0 ? body.slice(0, cut) : body
      expect(scoped.indexOf("redirect('/login')"))
        .toBeLessThan(scoped.indexOf('Stop(') > 0 ? scoped.indexOf('Stop(') : Infinity)
    }
  })

  it('REGRESSION 2/3 · the global action resolves PLATFORM-OPERATOR authority', () => {
    const global_ = actions.slice(actions.indexOf('export async function toggleAutomationPause'),
                                  actions.indexOf('export async function toggleProjectExecutionPause'))
    expect(global_).toContain('resolvePlatformOperator()')
    expect(global_).toContain('not_operator')
    // The authority check must come BEFORE the mutation, or it is decoration.
    expect(global_.indexOf('resolvePlatformOperator()'))
      .toBeLessThan(global_.indexOf('setPlatformAutomationStop'))
    // ...and the actor recorded is the one the authority resolved, not a
    // separately-derived id that could drift from the check.
    expect(global_).toContain('operator.actor')
  })

  it('REGRESSION 7 · project mutation stays gated on OWNERSHIP', () => {
    const proj = actions.slice(actions.indexOf('export async function toggleProjectExecutionPause'))
    expect(proj).toContain('assertProjectAllowed')
    expect(proj.indexOf('assertProjectAllowed'))
      .toBeLessThan(proj.indexOf('setProjectExecutionStop'))
    expect(proj).toContain('forbidden')
  })

  it('project ownership is NOT accepted as platform authority', () => {
    // The forbidden heuristic: "owns a project" ⇒ "may stop the platform".
    const global_ = actions.slice(actions.indexOf('export async function toggleAutomationPause'),
                                  actions.indexOf('export async function toggleProjectExecutionPause'))
    expect(global_).not.toContain('getAllowedProjectIds')
    expect(global_).not.toContain('assertProjectAllowed')
  })

  it('no scattered email comparison re-implements the authority', () => {
    // The authority must be reusable and single-sourced; an inline
    // `user.email === process.env...` in a governance action is the pattern this
    // module exists to replace.
    expect(actions).not.toMatch(/email\s*===|email\s*!==/)
    expect(actions).not.toContain('BREVO_ADMIN_EMAIL')
    expect(actions).not.toContain('process.env')
  })
})

// ── B. Read-surface privacy (regression 8) ──────────────────────────────────

describe('REGRESSION 8 · the read surface is least privilege', () => {
  const route = code('app/api/system/stop-authority/route.ts')

  it('resolves operator status and branches the ledger query on it', () => {
    expect(route).toContain('resolvePlatformOperator')
    expect(route).toContain('isOperator')
    // Non-operators are filtered IN THE QUERY, not redacted after a broad read —
    // a post-hoc redaction is one refactor away from being dropped.
    expect(route).toMatch(/isOperator[\s\S]{0,400}PLATFORM_AUTOMATION/)
  })

  it('withholds WHO and WHY from non-operators, but not THAT it is paused', () => {
    expect(route).toContain('isOperator ? platform.observed?.globalPausedAt')
    expect(route).toContain('isOperator ? platform.observed?.globalPausedReason')
    // The boolean itself stays visible: a tenant whose work is refused is
    // entitled to know the platform is stopped.
    expect(route).toContain('paused: platform.globalPaused')
  })

  it('redacts other actors from a non-operator, keeping only themselves', () => {
    expect(route).toContain('selfActor')
    expect(route).toMatch(/isOperator \|\| e\.actor === selfActor/)
  })

  it('still calls no setter and performs no write', () => {
    for (const w of ['stop_set_platform_automation', 'stop_set_project_execution',
                     'set_project_execution_paused', 'budget_reserve']) {
      expect(route).not.toContain(w)
    }
    expect(route).not.toMatch(/\.update\(|\.insert\(|\.delete\(|\.upsert\(/)
  })
})

// ── C. The three-context truth table (regressions 9–12) ─────────────────────

describe('the locked truth table', () => {
  const ctxs: ExecutionContext[] = ['AUTONOMOUS', 'OPERATOR_EXECUTION', 'OPERATOR_INTERACTIVE']

  const decide = (ctx: ExecutionContext, over: Partial<StateRow>, withProject = true) =>
    resolveExecutionStop(returns(stateRow({ project_requested: withProject, ...over })),
      { context: ctx, projectId: withProject ? PROJECT : null })

  it('REGRESSION 9 · ordinary assistance survives a global pause', async () => {
    const d = await decide('OPERATOR_INTERACTIVE',
      { global_paused: true, project_found: true, project_paused: true })
    expect(d.allowed).toBe(true)
    expect(d.reason).toBeNull()
    // ...and it still SEES the stop, so the console can say so.
    expect(d.globalPaused).toBe(true)
  })

  it('REGRESSION 10 · autonomous work is refused by a global pause', async () => {
    const d = await decide('AUTONOMOUS', { global_paused: true, project_found: true, project_paused: false })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('global_automation_paused')
  })

  it('REGRESSION 11 · OPERATOR_EXECUTION is refused by a PROJECT pause', async () => {
    // A human clicked it. It is still execution, and the project is stopped.
    const d = await decide('OPERATOR_EXECUTION', { project_found: true, project_paused: true })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('project_execution_paused')
  })

  it('REGRESSION 12 · an unknown stop state is never an execution green light', async () => {
    for (const ctx of ['AUTONOMOUS', 'OPERATOR_EXECUTION'] as ExecutionContext[]) {
      // requested-but-missing project
      const missing = await decide(ctx, { project_found: false, project_paused: null })
      expect(missing.allowed, `${ctx} must refuse a missing project`).toBe(false)
      expect(missing.reason).toBe('stop_state_unavailable')
      // total read failure
      const down = await resolveExecutionStop(
        { rpc: async () => ({ data: null, error: { message: 'down' } }) } as unknown as SupabaseClient,
        { context: ctx, projectId: PROJECT })
      expect(down.allowed, `${ctx} must refuse an unreadable state`).toBe(false)
      expect(down.reason).toBe('stop_state_unavailable')
    }
  })

  it('OPERATOR_EXECUTION obeys the locked global policy', async () => {
    const d = await decide('OPERATOR_EXECUTION',
      { global_paused: true, project_found: true, project_paused: false })
    if (GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION) {
      expect(d.allowed).toBe(false)
      expect(d.reason).toBe('global_automation_paused')
    } else {
      expect(d.allowed).toBe(true)
    }
  })

  it('the full table is exhaustive and every cell is pinned', async () => {
    const rows: [Partial<StateRow>, Record<ExecutionContext, boolean>][] = [
      [{ project_found: true, project_paused: false },
        { AUTONOMOUS: true, OPERATOR_EXECUTION: true, OPERATOR_INTERACTIVE: true }],
      [{ project_found: true, project_paused: true },
        { AUTONOMOUS: false, OPERATOR_EXECUTION: false, OPERATOR_INTERACTIVE: true }],
      [{ global_paused: true, project_found: true, project_paused: false },
        { AUTONOMOUS: false,
          OPERATOR_EXECUTION: !GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION,
          OPERATOR_INTERACTIVE: true }],
      [{ global_paused: true, project_found: true, project_paused: true },
        { AUTONOMOUS: false, OPERATOR_EXECUTION: false, OPERATOR_INTERACTIVE: true }],
      [{ project_found: false, project_paused: null },
        { AUTONOMOUS: false, OPERATOR_EXECUTION: false, OPERATOR_INTERACTIVE: true }],
    ]
    for (const [over, expected] of rows) {
      for (const ctx of ctxs) {
        const d = await decide(ctx, over)
        expect(d.allowed, `${ctx} @ ${JSON.stringify(over)}`).toBe(expected[ctx])
      }
    }
  })
})

// ── D. Vocabulary pins ──────────────────────────────────────────────────────

describe('OPERATOR_INTERACTIVE must not become the execution escape hatch', () => {
  const stop = src('lib/governance/execution-stop.ts')

  it('all three contexts exist and are named', () => {
    for (const c of ['AUTONOMOUS', 'OPERATOR_INTERACTIVE', 'OPERATOR_EXECUTION']) {
      expect(stop).toContain(`'${c}'`)
    }
  })

  it('the interactive context is documented as assistance, not execution', () => {
    const seg = stop.slice(stop.indexOf('OPERATOR_INTERACTIVE'), stop.indexOf('export type ExecutionContext'))
    expect(seg).toMatch(/NOT AN EXECUTION CONTEXT/i)
    // The named side effects it must never carry.
    for (const t of ['media generation', 'external', 'material writes',
                     'financial execution', 'workflow execution']) {
      expect(seg.toLowerCase(), `vocabulary must name ${t}`).toContain(t.toLowerCase())
    }
  })

  it('the global policy is one named constant, not a scattered condition', () => {
    expect(stop).toContain('export const GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION')
    // Exactly one place decides it: the declaration, the doc reference, and the
    // single use in the resolver.
    const uses = [...stop.matchAll(/GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION/g)].length
    expect(uses).toBeLessThanOrEqual(4)
    expect(stop).toContain('const globalBinds')
  })

  it('the LOCKED policy value is pinned, so a flip cannot be silent', () => {
    // The table test above adapts to this constant on purpose — flipping it is a
    // one-line policy change, not a rewrite. But adaptive tests would let an
    // ACCIDENTAL flip pass green, so the locked value itself is pinned here.
    // Changing product policy means changing this line deliberately, and the PR
    // that does it says so.
    expect(GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION).toBe(true)
  })

  it('the project scope is never optional for execution', () => {
    // globalBinds may relax the GLOBAL check; nothing may relax the project one.
    const body = stop.slice(stop.indexOf('const globalBinds'))
    expect(body).toMatch(/if \(globalPaused && globalBinds\)/)
    expect(body).toMatch(/else if \(projectPaused\)\s+reason = 'project_execution_paused'/)
    expect(body).not.toMatch(/projectPaused && \w*[Bb]inds/)
  })
})

// ── E. The G3C hand-off list cannot rot ─────────────────────────────────────

describe('operator-execution paths recorded for G3C', () => {
  const ALL = [...OPERATOR_EXECUTION_PATHS_FOR_G3C, ...DUAL_MODE_EXECUTION_PATHS_FOR_G3C]

  it('every listed path still exists', () => {
    // A guidance list of dead paths is worse than none: it makes the next slice
    // start from a map that no longer matches the territory.
    for (const rel of ALL) {
      expect(() => readFileSync(join(process.cwd(), rel), 'utf8'),
        `${rel} is listed for G3C but does not exist`).not.toThrow()
    }
  })

  it('every listed path authenticates a human session', () => {
    for (const rel of ALL) {
      expect(src(rel), `${rel} must authenticate a session`).toContain('getUser()')
    }
  })

  it('the two lists are correctly separated by auth mode', () => {
    // Single-mode paths are operator-only; dual-mode paths also accept the cron
    // secret and therefore cannot be classified by route at all.
    for (const rel of OPERATOR_EXECUTION_PATHS_FOR_G3C) {
      expect(src(rel), `${rel} is listed single-mode but accepts CRON_SECRET`)
        .not.toContain('CRON_SECRET')
    }
    for (const rel of DUAL_MODE_EXECUTION_PATHS_FOR_G3C) {
      expect(src(rel), `${rel} is listed dual-mode but has no cron branch`)
        .toContain('CRON_SECRET')
    }
    expect(DUAL_MODE_EXECUTION_PATHS_FOR_G3C.length).toBeGreaterThan(0)
  })

  it('names the one path that already consults a stop authority', () => {
    // The evidence behind the locked global policy. If this stops being true,
    // the derivation in execution-stop.ts needs revisiting.
    expect(src('lib/article/hero-image.ts')).toContain('checkAutomationPaused')
    expect(src('app/api/content/articles/[id]/hero-image/route.ts'))
      .toContain('generateHeroImage')
  })
})

// ── F. Mandatory post-apply cleanup ─────────────────────────────────────────

describe('generated-types cleanup is enforced, not merely intended', () => {
  const types = () => src('lib/supabase/database.types.ts')

  it('the temporary casts exist ONLY while the types are actually stale', () => {
    // The deal: two narrow casts are accepted because database.types.ts predates
    // both `projects.execution_paused` (in production since
    // 20260829_workflow_scheduler_project_pause) and `stop_events` (this
    // migration, not yet applied).
    //
    // Canonical regeneration is `supabase gen types typescript --project-id <ref>
    // --schema public` (documented in lib/supabase/types.ts). It must be run
    // AFTER this migration is applied and BEFORE final merge.
    //
    // This test is the tripwire: the moment the generated types learn either
    // symbol, the corresponding cast is dead code and this fails, so the cleanup
    // cannot be quietly skipped.
    const t = types()

    if (t.includes('execution_paused')) {
      expect(code('lib/project/get-project.ts'),
        'types now know execution_paused — remove the cast in get-project.ts')
        .not.toContain('as unknown as')
    }
    if (t.includes('stop_events')) {
      expect(code('app/api/system/stop-authority/route.ts'),
        'types now know stop_events — remove the cast in the stop-authority route')
        .not.toContain('as unknown as')
    }
  })

  it('each cast says why it exists and when it goes away', () => {
    // A cast with no stated expiry is a permanent cast.
    expect(src('lib/project/get-project.ts')).toMatch(/STALE|stale/)
    expect(src('lib/project/get-project.ts')).toContain('regenerated')
    expect(src('app/api/system/stop-authority/route.ts')).toContain('regenerated')
  })
})
