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

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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
    delete process.env.ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS
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

  // ── HARDENING 2 · precedence, not union ──────────────────────────────────
  // PLATFORM_OPERATOR_EMAILS is canonical; BREVO_ADMIN_EMAIL is a compatibility
  // fallback consulted ONLY when the canonical variable is absent or blank.
  // Permanently unioning them would mean that changing an alert-email address
  // silently grants the global kill switch.

  it('PRECEDENCE 1 · neither configured → nobody is authorized', () => {
    expect(platformOperatorAllowlist()).toEqual([])
    for (const e of [OPERATOR, STRANGER, 'anyone@x.test']) {
      expect(isPlatformOperatorEmail(e)).toBe(false)
    }
  })

  it('PRECEDENCE 2 · only BREVO configured → the legacy identity works', () => {
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(platformOperatorAllowlist()).toEqual([OPERATOR])
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(true)
  })

  it('PRECEDENCE 3 · only PLATFORM_OPERATOR_EMAILS → those identities work', () => {
    process.env.PLATFORM_OPERATOR_EMAILS = `a@x.test, ${OPERATOR}`
    expect(platformOperatorAllowlist().sort()).toEqual(['a@x.test', OPERATOR].sort())
    expect(isPlatformOperatorEmail('a@x.test')).toBe(true)
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
  })

  it('PRECEDENCE 4 · BOTH configured → ONLY the explicit list is honoured', () => {
    // The cutover property. The Brevo address is deployed today and must lose
    // its authority the moment an explicit list exists — otherwise the two
    // privilege sources stay live forever.
    process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR
    process.env.BREVO_ADMIN_EMAIL = 'alerts@vendor.test'
    expect(platformOperatorAllowlist()).toEqual([OPERATOR])
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(true)
    expect(isPlatformOperatorEmail('alerts@vendor.test')).toBe(false)
  })

  it('PRECEDENCE 5 · a BREVO address absent from the explicit list is REFUSED', () => {
    // Restated as its own case because this is the exact regression that would
    // reappear if someone "helpfully" re-unioned the two variables.
    process.env.PLATFORM_OPERATOR_EMAILS = 'ops@omnira.test'
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(false)
    expect(isPlatformOperatorEmail('ops@omnira.test')).toBe(true)
  })

  it('PRECEDENCE 6 · blank/whitespace values never become a wildcard', () => {
    // A blank canonical variable must FALL BACK, not authorise nobody by
    // accident and not authorise everybody by treating '' as a match.
    process.env.PLATFORM_OPERATOR_EMAILS = ',   ,,  '
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(platformOperatorAllowlist()).toEqual([OPERATOR])
    expect(isPlatformOperatorEmail(OPERATOR)).toBe(true)
    expect(isPlatformOperatorEmail('')).toBe(false)
    expect(isPlatformOperatorEmail('   ')).toBe(false)

    process.env.PLATFORM_OPERATOR_EMAILS = '   '
    expect(platformOperatorAllowlist()).toEqual([OPERATOR])
  })

  it('PRECEDENCE 7 · the knowledge allowlist stays irrelevant either way', () => {
    process.env.ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS = STRANGER
    process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
    delete process.env.PLATFORM_OPERATOR_EMAILS
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    expect(isPlatformOperatorEmail(STRANGER)).toBe(false)
  })

  it('documents which variable is canonical and which is a fallback', () => {
    const doc = src('lib/auth/platform-operator.ts')
    expect(doc).toMatch(/CANONICAL/)
    expect(doc).toMatch(/COMPATIBILITY FALLBACK/)
    expect(doc).toMatch(/never unioned|not unioned/i)
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

describe('generated types are canonical and the temporary casts are gone', () => {
  const types = () => src('lib/supabase/database.types.ts')

  it('the generated types now KNOW the stop authority', () => {
    // Regenerated from production after the G3A migration was applied, via
    // `supabase gen types typescript --project-id <ref> --schema public`.
    const t = types()
    for (const sym of ['stop_events', 'execution_paused', 'paused_at', 'paused_reason',
                       'stop_set_platform_automation', 'stop_set_project_execution',
                       'stop_state']) {
      expect(t, `generated types must describe ${sym}`).toContain(sym)
    }
  })

  it('the retired legacy setter is NOT in the generated types', () => {
    // It was dropped by the migration, so a regenerated file that still names it
    // would mean the types were not actually regenerated from production.
    expect(types()).not.toContain('set_project_execution_paused')
  })

  it('neither temporary query-builder cast survives', () => {
    // These existed only because the generated file was stale. Now that it is
    // canonical they are dead weight, and leaving them would quietly re-disable
    // type checking on exactly the two governance surfaces that need it most.
    for (const f of ['lib/project/get-project.ts',
                     'app/api/system/stop-authority/route.ts']) {
      const body = code(f)
      expect(body, `${f} must not cast the query builder`)
        .not.toMatch(/as unknown as \{\s*from:/)
      expect(body, `${f} must not cast the query builder`)
        .not.toMatch(/as unknown as \{\s*select:/)
    }
    // ...and the files still read the columns they need, through real types.
    expect(code('lib/project/get-project.ts')).toContain('execution_paused')
    expect(code('app/api/system/stop-authority/route.ts')).toContain("from('stop_events')")
  })
})

describe('project-stop copy states the real scope', () => {
  it('the project action documents BOTH enforcing contexts', () => {
    const doc = src('app/actions/automation.ts')
    const proj = doc.slice(doc.indexOf('PROJECT EXECUTION STOP'))
    expect(proj).toContain('AUTONOMOUS')
    expect(proj).toContain('OPERATOR_EXECUTION')
    // The project scope is never relaxed by policy — unlike the global one.
    expect(proj).toMatch(/NEVER optional/i)
    expect(proj).toMatch(/does NOT stop operator assistance/i)
  })

  it('no project-facing copy claims the stop is merely "unattended"', () => {
    // The locked table refuses OPERATOR_EXECUTION for a paused project, so
    // promising only unattended work understates what the operator just did.
    const toggle = src('components/platform/ProjectPauseToggle.tsx')
    expect(toggle).not.toContain('oövervakad')
    expect(toggle).toMatch(/både automatisk och manuellt/)
    expect(src('app/actions/automation.ts'))
      .not.toMatch(/resume unattended execution for ONE project/)
    expect(src('lib/governance/execution-stop.ts'))
      .not.toMatch(/Pause or resume unattended execution for ONE project/)
  })

  it('"unattended" survives only where it correctly means AUTONOMOUS', () => {
    // The word is not banned — it is precise when describing the AUTONOMOUS
    // context itself, and the derivation evidence depends on it.
    const stop = src('lib/governance/execution-stop.ts')
    expect(stop).toMatch(/AUTONOMOUS\s+—\s+unattended execution/)
  })
})

// ── G. Repository-wide direct-writer inventory (HARDENING 4) ────────────────

describe('exactly ONE audited mutation path exists, repository-wide', () => {
  const STOP_BOOLEANS = ['automation_paused', 'execution_paused']
  const MUTATORS = ['update', 'insert', 'upsert']

  /** Every runtime source file: excludes tests, fixtures, migrations, generated types. */
  function runtimeFiles(dir = process.cwd(), acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', '.next', '.git', 'supabase'].includes(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { runtimeFiles(full, acc); continue }
      if (!/\.tsx?$/.test(entry)) continue
      const rel = relative(process.cwd(), full)
      if (rel.startsWith('lib/qa/') || rel.startsWith('tests/')) continue
      if (rel.endsWith('database.types.ts')) continue
      acc.push(rel)
    }
    return acc
  }

  /** Payload text of every `.update(/.insert(/.upsert(` call, brace-depth aware. */
  function mutationPayloads(source: string): string[] {
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const out: string[] = []
    for (const verb of MUTATORS) {
      const re = new RegExp(`\\.${verb}\\s*\\(`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(body)) !== null) {
        let depth = 1
        let i = m.index + m[0].length
        for (; i < body.length && depth > 0; i++) {
          if (body[i] === '(') depth++
          else if (body[i] === ')') depth--
        }
        out.push(body.slice(m.index, i))
      }
    }
    return out
  }

  it('no runtime file writes either stop boolean directly', () => {
    // THE INVARIANT. G3A retired two unaudited writers — a TypeScript UPDATE and
    // a SQL setter. Nothing stops a future module from quietly recreating one,
    // and it would not fail any existing test: the booleans would still change,
    // the system would still behave, and only the audit trail would be missing.
    //
    // Scoped to the whole repository on purpose. Pinning only
    // lib/media/safeguards.ts would guard the one place we already fixed and
    // miss the next one.
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8')
      if (!STOP_BOOLEANS.some(b => source.includes(b))) continue
      for (const payload of mutationPayloads(source)) {
        for (const b of STOP_BOOLEANS) {
          if (payload.includes(b)) offenders.push(`${rel} → ${payload.slice(0, 120)}`)
        }
      }
    }
    expect(offenders,
      'direct stop-boolean writes must go through stop_set_platform_automation / ' +
      'stop_set_project_execution:\n' + offenders.join('\n')).toEqual([])
  })

  it('the guard can actually see a violation (self-check)', () => {
    // A scanner that never fires is indistinguishable from a broken scanner.
    const planted = `
      await db.from('platform_config').update({
        automation_paused: true, updated_at: new Date().toISOString(),
      }).eq('id', 1)
    `
    const found = mutationPayloads(planted).filter(pl =>
      STOP_BOOLEANS.some(b => pl.includes(b)))
    expect(found.length).toBe(1)
    // ...and it does not fire on a READ of the same column.
    const read = `await db.from('projects').select('execution_paused').eq('id', x)`
    expect(mutationPayloads(read).filter(pl =>
      STOP_BOOLEANS.some(b => pl.includes(b)))).toEqual([])
  })

  it('the canonical wrappers reach the booleans only through the RPCs', () => {
    const stop = code('lib/governance/execution-stop.ts')
    expect(stop).toContain("rpc('stop_set_platform_automation'")
    expect(stop).toContain("rpc('stop_set_project_execution'")
    // No table access whatsoever in the authority module.
    expect(stop).not.toMatch(/\.from\('(platform_config|projects)'\)/)
  })

  it('the retired writers have not returned under any name', () => {
    for (const rel of runtimeFiles()) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(source, `${rel} re-exports the retired global writer`)
        .not.toContain('export async function setAutomationPaused')
      expect(source, `${rel} calls the retired SQL setter`)
        .not.toContain("rpc('set_project_execution_paused'")
    }
  })
})

// ── H. Semantics consistency (HARDENING 3) ──────────────────────────────────

describe('what the global stop PROMISES matches what it DOES', () => {
  it('the DB column is NOT renamed — applied history keeps its name', () => {
    // The name is legacy and stays legacy. Renaming it would rewrite the
    // meaning of every applied migration and every existing reader.
    expect(src('supabase/migrations/20260831_unified_stop_authority.sql'))
      .toContain('automation_paused')
    expect(src('supabase/migrations/20260831_unified_stop_authority.sql'))
      .not.toMatch(/rename\s+column|rename\s+to/i)
    expect(src('lib/media/safeguards.ts')).toContain('automation_paused')
  })

  it('the action no longer promises merely "unattended" work', () => {
    // The contradiction this fixes: the resolver refuses OPERATOR_EXECUTION
    // under the global flag, while the documentation said the switch paused
    // "ALL unattended automation" — understating a kill switch is how someone
    // presses it expecting less than they get.
    const doc = src('app/actions/automation.ts')
    expect(doc).not.toMatch(/Pause or resume ALL unattended automation/)
    expect(doc).toContain('GLOBAL EXECUTION STOP')
    expect(doc).toContain('OPERATOR_EXECUTION')
    // ...and it still states the assistance carve-out, or the copy would now
    // overstate in the other direction.
    expect(doc).toMatch(/does NOT stop operator assistance/i)
  })

  it('the operator-facing copy says execution, not just automation', () => {
    const toggle = src('components/platform/PauseToggle.tsx')
    expect(toggle).not.toContain('Pausa all automation')
    expect(toggle).not.toContain('Återuppta automation')
    expect(toggle).toMatch(/Stoppa exekvering/)
    expect(toggle).toMatch(/Återuppta exekvering/)
    // The tooltip must name BOTH halves: what stops and what keeps working.
    expect(toggle).toMatch(/både automatisk och manuellt begärd/)
    expect(toggle).toMatch(/Atlas.*tillgängliga/)
  })

  it('the paused banner explains the real scope', () => {
    const page = src('app/(platform)/system/page.tsx')
    expect(page).not.toContain('All automation är manuellt pausad')
    expect(page).toMatch(/All exekvering är stoppad/)
    expect(page).toMatch(/Atlas och styrning är fortfarande tillgängliga/)
  })

  it('the resolver documents the legacy-name / current-semantics split', () => {
    const stop = src('lib/governance/execution-stop.ts')
    expect(stop).toContain('GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION')
    // The derivation must stay attached to the constant, not drift into a PR
    // description nobody reads at the call site.
    const seg = stop.slice(stop.indexOf('Does the GLOBAL automation pause'),
                           stop.indexOf('export const GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION'))
    expect(seg).toMatch(/hero-image/)
    expect(seg).toMatch(/Pausa ALL automation/)
  })
})

// ── I. RPC bypass inventory (FINAL DB AUTHORITY) ────────────────────────────

describe('the canonical stop RPCs have exactly one application caller', () => {
  const CANONICAL = 'lib/governance/execution-stop.ts'
  const RPCS = ['stop_set_platform_automation', 'stop_set_project_execution']

  function runtimeSources(dir = process.cwd(), acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', '.next', '.git', 'supabase'].includes(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { runtimeSources(full, acc); continue }
      if (!/\.tsx?$/.test(entry)) continue
      const rel = relative(process.cwd(), full)
      if (rel.startsWith('lib/qa/') || rel.startsWith('tests/')) continue
      acc.push(rel)
    }
    return acc
  }

  it('no runtime module calls them except the canonical wrapper', () => {
    // The DB grant must stay service-role callable — the server action needs it.
    // So the architectural invariant is enforced here: one wrapper, so that
    // actor derivation, error mapping and the audited contract cannot be
    // re-implemented slightly differently somewhere else.
    const callers = runtimeSources().filter(rel => {
      if (rel === CANONICAL) return false
      const body = readFileSync(join(process.cwd(), rel), 'utf8')
      return RPCS.some(fn => body.includes(fn))
    })
    expect(callers, `only ${CANONICAL} may call the stop RPCs directly`).toEqual([])
  })

  it('the canonical wrapper is the one that calls them', () => {
    const body = readFileSync(join(process.cwd(), CANONICAL), 'utf8')
    for (const fn of RPCS) expect(body).toContain(`rpc('${fn}'`)
  })

  it('they are not exposed as a model-callable tool', () => {
    // A generic tool that can resume execution can resume the execution that was
    // stopped BECAUSE of the model. Scoped to files that actually declare an
    // LLM tool surface — `input_schema` is the Anthropic tool shape — and
    // excluding the operator actions module itself, which necessarily NAMES the
    // functions it defines.
    const OPERATOR_ACTIONS = 'app/actions/automation.ts'
    for (const rel of runtimeSources()) {
      if (rel === OPERATOR_ACTIONS || rel === CANONICAL) continue
      const body = readFileSync(join(process.cwd(), rel), 'utf8')
      if (!/input_schema|inputSchema/.test(body)) continue
      for (const fn of [...RPCS, 'toggleAutomationPause', 'toggleProjectExecutionPause']) {
        expect(body, `${rel} declares LLM tools and must not expose ${fn}`)
          .not.toContain(fn)
      }
    }
  })
})

// ── J. The DB write guard, pinned in source ─────────────────────────────────

describe('the stop-state write guard', () => {
  const mig = src('supabase/migrations/20260831_unified_stop_authority.sql')

  it('is NOT security definer — the property the whole guard rests on', () => {
    // Re-pinned here as well as in the SQL suite: this one line is the
    // difference between a guard and a decoration, and a source pin fails even
    // on a machine with no Postgres.
    const guards = mig.slice(mig.indexOf('create or replace function public.stop_guard_platform_config'))
    const upToTriggers = guards.slice(0, guards.indexOf('drop trigger if exists stop_guard_platform_config'))
    expect(upToTriggers).not.toMatch(/security\s+definer/i)
    expect((upToTriggers.match(/set search_path to ''/g) ?? []).length).toBe(2)
  })

  it('protects the whole state bundle, not just the booleans', () => {
    for (const col of ['automation_paused', 'execution_paused', 'paused_at', 'paused_reason']) {
      expect(mig, `${col} must be guarded`).toMatch(
        new RegExp(`new\\.${col}\\s+is distinct from\\s+old\\.${col}`))
    }
  })

  it('reasons on IS DISTINCT FROM, so a no-op stays harmless', () => {
    const guards = mig.slice(mig.indexOf('create or replace function public.stop_guard_platform_config'))
    expect(guards).toContain('is distinct from')
    // Not "did the column appear in the SET clause".
    expect(guards).not.toMatch(/tg_argv|column_name|information_schema/)
  })

  it('uses current_user, never session_user', () => {
    // session_user keeps the original login role through SECURITY DEFINER
    // execution and therefore cannot distinguish the audited path.
    const guards = mig.slice(mig.indexOf('create or replace function public.stop_guard_platform_config'))
    expect(guards).toContain('current_user')
    expect(guards).not.toContain('session_user')
  })

  it('offers no bypass the application can reach', () => {
    // Only the FUNCTION BODIES — the trigger DDL below them legitimately says
    // "for each row execute function", which is not dynamic SQL.
    const bodies = mig.slice(mig.indexOf('create or replace function public.stop_guard_platform_config'),
                             mig.indexOf('drop trigger if exists stop_guard_platform_config'))
    // No GUC/session bypass, no dynamic SQL, no opt-out parameter. The database
    // execution identity is the only boundary.
    for (const escape of ['current_setting', 'set_config', 'bypass', 'execute format', "execute '"]) {
      expect(bodies.toLowerCase(), `guard body must not contain ${escape}`)
        .not.toContain(escape.toLowerCase())
    }
    // ...and no trigger arguments, which would be a caller-supplied input.
    expect(bodies).not.toContain('tg_argv')
  })

  it('does not blanket-revoke UPDATE on the shared tables', () => {
    // The reason this is a trigger and not a REVOKE: both tables carry
    // unrelated runtime writers that must keep working.
    expect(mig).not.toMatch(/revoke[^;]*update[^;]*on table public\.(platform_config|projects)/i)
    expect(mig).not.toMatch(/revoke all on table public\.(platform_config|projects)/i)
  })
})
