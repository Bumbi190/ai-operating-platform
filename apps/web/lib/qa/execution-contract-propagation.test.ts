/**
 * G3C-1 — structural guards on the execution classification surface.
 *
 * The behavioural suite proves the boundary refuses a stopped dispatch. These
 * prove the property that makes that guarantee reachable at all: that every
 * billable path DECLARES itself, that nothing invents a classification on a
 * caller's behalf, and that the one context which bypasses a stop cannot be
 * constructed anywhere new without a reviewer noticing.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comment-stripped: a pin must not be satisfiable by prose. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function runtimeFiles(dir = ROOT, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'supabase', 'scripts', 'tests'].includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { runtimeFiles(full, acc); continue }
    if (!/\.tsx?$/.test(entry)) continue
    const rel = relative(ROOT, full)
    if (rel.startsWith('lib/qa/')) continue
    acc.push(rel)
  }
  return acc
}

// ── A. Every billable dispatch declares itself ──────────────────────────────

describe('every governed spend supplies an explicit execution contract', () => {
  const SANCTIONED = [
    'lib/ai/anthropic.ts', 'lib/ai/openai-client.ts',
    'lib/media/image-client.ts', 'lib/media/elevenlabs.ts',
  ]

  it('all runtime withGovernedSpend calls pass `execution`', () => {
    // The boundary requires it at the type level, so this is belt-and-braces —
    // but a future `as never` or a loosened type would slip past the compiler
    // and not past this.
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      const body = code(rel)
      if (!body.includes('withGovernedSpend(')) continue
      if (rel === 'lib/cost/governed-spend.ts') continue
      for (const m of body.matchAll(/withGovernedSpend\(\s*\{([\s\S]{0,400}?)\}/g)) {
        if (!/execution\s*[:,]/.test(m[1])) offenders.push(`${rel}: ${m[1].slice(0, 60)}`)
      }
    }
    expect(offenders, 'every governed dispatch must declare its execution').toEqual([])
  })

  it('only the sanctioned provider modules call the boundary at all', () => {
    const callers = runtimeFiles().filter(rel =>
      rel !== 'lib/cost/governed-spend.ts' && code(rel).includes('withGovernedSpend('))
    expect(callers.sort()).toEqual([...SANCTIONED].sort())
  })

  it('nothing defaults, coalesces or invents an execution contract', () => {
    // The failure mode this prevents: `execution ?? SOMETHING`. Whatever fills
    // that blank is by definition the value that made the code compile, and the
    // value that makes code compile is the permissive one.
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      const body = code(rel)
      if (/execution\s*\?\?/.test(body)) offenders.push(`${rel}: execution ?? …`)
      if (/execution\s*\?\s*:/.test(body)) offenders.push(`${rel}: optional execution field`)
      // A default PARAMETER, not a legitimate `const execution = {…}` — the
      // dual-mode route builds one from the branch that authenticated, which is
      // exactly the behaviour we want.
      if (/execution\s*:\s*ExecutionContract\s*=/.test(body))
        offenders.push(`${rel}: default execution parameter`)
    }
    expect(offenders).toEqual([])
  })

  it('provider adapters FORWARD the contract, they never construct one', () => {
    // Policy belongs above the SDK. An adapter that could name its own context
    // could name the permissive one.
    for (const rel of SANCTIONED) {
      const body = code(rel)
      expect(body, `${rel} must forward, not construct`).not.toMatch(/context:\s*'(AUTONOMOUS|OPERATOR_\w+)'/)
      expect(body, `${rel} must not implement stop policy`).not.toMatch(/automation_paused|execution_paused|checkAutomationPaused/)
      expect(body, `${rel} must not resolve stops itself`).not.toContain('resolveExecutionStop')
    }
  })

  it('test-only fixtures never leak into runtime code', () => {
    const leaks = runtimeFiles().filter(rel => code(rel).includes('execution-fixtures'))
    expect(leaks, 'named test contracts are for tests only').toEqual([])
  })
})

// ── B. The OPERATOR_INTERACTIVE allowlist ───────────────────────────────────

describe('OPERATOR_INTERACTIVE is the only stop bypass, so its construction is allowlisted', () => {
  /**
   * The REVIEWED construction points. Each is ordinary operator assistance —
   * Atlas answering a question, Atlas reading something aloud — never a side
   * effect. A generator, publisher or cron path appearing here would mean the
   * one exemption had been handed to execution.
   */
  const ALLOWLIST = [
    'app/api/chat/route.ts',        // Atlas chat
    'app/api/chat/tts/route.ts',    // Atlas TTS
    // The stop-authority READ MODEL. It asks the resolver in the interactive
    // context because that is literally what it is: a human reading a console.
    // It dispatches nothing and spends nothing — it is not a billable path.
    'app/api/system/stop-authority/route.ts',
  ]

  it('only the allowlisted files construct it', () => {
    const constructors = runtimeFiles().filter(rel => {
      if (rel === 'lib/governance/execution-stop.ts') return false   // the vocabulary itself
      return /context:\s*'OPERATOR_INTERACTIVE'/.test(code(rel))
    })
    expect(constructors.sort(),
      'a new OPERATOR_INTERACTIVE construction must be reviewed, not merged quietly')
      .toEqual([...ALLOWLIST].sort())
  })

  it('every allowlisted construction is paired with GLOBAL_ONLY', () => {
    // Assistance belongs to no project. Giving it a project scope would make it
    // refusable by a project pause, which is the lockout we are avoiding — and
    // giving it a project it does not own would be worse.
    for (const rel of ALLOWLIST) {
      const body = code(rel)
      if (rel === 'app/api/system/stop-authority/route.ts') {
        // Read-only: it names no scope at all, which is stricter than GLOBAL_ONLY.
        expect(body).not.toMatch(/withGovernedSpend/)
        continue
      }
      for (const m of body.matchAll(/context:\s*'OPERATOR_INTERACTIVE'[^}]*\}/g)) {
        expect(m[0], `${rel}: interactive assistance must be GLOBAL_ONLY`).toContain('GLOBAL_ONLY')
      }
    }
  })

  it('no cron/unattended path constructs it', () => {
    const cronPaths = runtimeFiles().filter(rel =>
      rel.includes('/cron/') || rel.endsWith('/drain/route.ts') || rel.endsWith('/tick/route.ts'))
    for (const rel of cronPaths) {
      expect(code(rel), `${rel} is unattended and may not claim to be interactive`)
        .not.toContain("'OPERATOR_INTERACTIVE'")
    }
  })
})

// ── C. Classification matches the real authentication ───────────────────────

describe('classification follows authentication, not filenames', () => {
  /** A route has an inbound cron branch only if it COMPARES the secret. */
  const hasCronAuthBranch = (rel: string) => {
    const body = code(rel)
    // A COMPARISON against the secret, not a mention of it. `operator-generate`
    // names CRON_SECRET only in prose saying it deliberately does not use it.
    return /process\.env\.CRON_SECRET/.test(body)
        && /[!=]==\s*`Bearer \$\{/.test(body)   // === or !== — both are comparisons
  }
  const hasSessionAuth = (rel: string) => /getUser\(\)/.test(code(rel))

  it('media/breaking is genuinely dual-mode and derives context from the branch', () => {
    const rel = 'app/api/media/breaking/route.ts'
    expect(hasCronAuthBranch(rel), 'must have a real inbound cron comparison').toBe(true)
    expect(hasSessionAuth(rel), 'must also accept a session').toBe(true)
    const body = code(rel)
    // The context is chosen by which branch authenticated — not by the route.
    expect(body).toMatch(/viaCron\s*\?\s*\(?'AUTONOMOUS'/)
    expect(body).toMatch(/'OPERATOR_EXECUTION'/)
    // …and it can never be the exempt context.
    expect(body).not.toContain("'OPERATOR_INTERACTIVE'")
  })

  it('operator-generate is SESSION-ONLY — the old inventory said otherwise', () => {
    // The G3A list called this dual-mode, and the rot-guard agreed because it
    // matched the substring CRON_SECRET. That substring is a COMMENT explaining
    // that the route deliberately does NOT use cron auth. A guard that reads
    // prose proves nothing; this one reads the authentication branch.
    const rel = 'app/api/content/articles/operator-generate/route.ts'
    expect(hasCronAuthBranch(rel), 'no inbound cron comparison exists here').toBe(false)
    expect(hasSessionAuth(rel)).toBe(true)
    expect(code(rel)).toMatch(/context:\s*'OPERATOR_EXECUTION'/)
  })

  it('cron-only execution paths declare AUTONOMOUS', () => {
    const cronExecution = runtimeFiles().filter(rel =>
      rel.startsWith('app/api/') && hasCronAuthBranch(rel) && !hasSessionAuth(rel)
      && /context:\s*'(AUTONOMOUS|OPERATOR_\w+)'/.test(code(rel)))
    expect(cronExecution.length, 'expected cron paths to carry contracts').toBeGreaterThan(0)
    for (const rel of cronExecution) {
      expect(code(rel), `${rel} is cron-only and must be AUTONOMOUS`)
        .not.toMatch(/context:\s*'OPERATOR_(EXECUTION|INTERACTIVE)'/)
    }
  })
})

// ── D. The legacy pause helper is out of the billable chain ─────────────────

describe('one canonical stop policy on paid provider paths', () => {
  it('the hero-image path no longer uses the legacy helper', () => {
    // It read the raw global flag and knew nothing about project scope or
    // execution context — a second authority answering the same question
    // differently.
    const body = code('lib/article/hero-image.ts')
    expect(body, 'legacy helper must not be imported').not.toMatch(/import[^;]*checkAutomationPaused/)
    expect(body, 'legacy helper must not be called').not.toMatch(/checkAutomationPaused\s*\(/)
    // It asks the canonical authority instead.
    expect(body).toContain('resolveExecutionEligibility')
  })

  it('the early check is an optimisation, not the guarantee', () => {
    // The boundary must still re-decide: a pause can commit in the gap.
    const body = code('lib/article/hero-image.ts')
    const early = body.indexOf('resolveExecutionEligibility')
    const paid  = body.indexOf('await withRetry')
    expect(early).toBeGreaterThan(-1)
    expect(early, 'eligibility is checked before the expensive work').toBeLessThan(paid)
    expect(code('lib/cost/governed-spend.ts'),
      'the boundary owns the final decision').toContain('resolveExecutionStopForContract')
  })

  it('the preflight helper delegates to the canonical authority, and decides nothing', () => {
    const body = code('lib/governance/execution-preflight.ts')
    expect(body).toContain('resolveExecutionStopForContract')
    expect(body, 'no local truth table').not.toMatch(/automation_paused|execution_paused/)
    expect(body, 'no independent policy').not.toMatch(/if\s*\([^)]*paused/)
  })
})

// ── E. The chat → cron credential seam ──────────────────────────────────────

describe('the chat outbound CRON_SECRET seam is provenance, not a stop bypass', () => {
  it('chat calls internal cron endpoints with the machine credential', () => {
    // The finding, stated plainly: an OPERATOR-initiated chat action reaches
    // internal endpoints presenting `Bearer ${CRON_SECRET}`, so downstream they
    // authenticate as machine traffic.
    const body = code('app/api/chat/route.ts')
    expect(body).toMatch(/Authorization: `Bearer \$\{secret\}`/)
    expect(body).toContain('process.env.CRON_SECRET')
  })

  it('the downstream dispatch can NEVER become OPERATOR_INTERACTIVE', () => {
    // This is what makes the seam survivable. The endpoints reached this way are
    // cron routes, and the allowlist above already proves no cron path
    // constructs the exempt context. So the seam cannot launder a human action
    // into the one classification a stop does not refuse.
    for (const rel of runtimeFiles().filter(r => r.includes('/media/cron/'))) {
      expect(code(rel), `${rel}`).not.toContain("'OPERATOR_INTERACTIVE'")
    }
  })

  it('and it does NOT bypass a project stop — it inherits the FULL project scope', () => {
    // The important half. Misclassification would be a real problem if it
    // widened what may run. It does the opposite: these endpoints declare
    // AUTONOMOUS *with* projectScope(MEDIA_PIPELINE_PROJECT), so a chat-
    // triggered dispatch is bound by BOTH authorities — strictly more
    // restrictive than the OPERATOR_EXECUTION classification its true origin
    // would have earned.
    for (const rel of ['app/api/media/cron/step1/route.ts',
                       'app/api/media/cron/step2/route.ts',
                       'app/api/media/cron/step3/route.ts']) {
      const body = code(rel)
      expect(body, `${rel} must be AUTONOMOUS`).toMatch(/context:\s*'AUTONOMOUS'/)
      expect(body, `${rel} must carry the project scope`).toContain('projectScope(MEDIA_PIPELINE_PROJECT)')
    }
    // Therefore: a provenance defect (the ledger will say "autonomous" for work
    // a human asked for), deferred to G3C-2 for protocol repair. NOT a G3C-1
    // blocker, because nothing escapes an authority because of it.
  })
})
