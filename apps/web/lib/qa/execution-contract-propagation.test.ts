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
  /**
   * Every module permitted to call the spend boundary. A CLOSED list of exact
   * paths, asserted with `toEqual` — a sixth caller fails here, which is the
   * only reason the list is worth having.
   *
   * The fifth entry arrived with Media Runtime Phase 5. The first four are
   * vendor adapters that own a hostname and an SDK; `governed-dispatch.ts` owns
   * neither — it wraps a `MediaProvider`, whose hostname lives in
   * `lib/media/providers/config.ts`. It is on this list for the same reason the
   * others are: it is a place where a provider call is made, and every such
   * place must be one a reviewer has looked at.
   *
   * Note what did NOT happen: `lib/media/job/*` is still absent. The durable job
   * lifecycle remains spend-free, guarded separately and exactly, and this
   * adapter sits outside that directory precisely so that stays true.
   */
  const SANCTIONED = [
    'lib/ai/anthropic.ts', 'lib/ai/openai-client.ts',
    'lib/media/image-client.ts', 'lib/media/elevenlabs.ts',
    'lib/media/dispatch/governed-dispatch.ts',
    // Phase 2B-2.5. The workflow engine's governed-effect branch: the first
    // non-media place a spend boundary is crossed, and the reason it is here is
    // the reason every other entry is — a reviewer has looked at it. It reserves
    // against the run's own idempotency key so a retry of one intent cannot take
    // a second reservation, and it releases ONLY on a positive non-dispatch
    // claim. Note what did NOT happen: no workflow module outside this branch
    // calls the boundary, and the read-only executor path still cannot.
    'lib/workflows/effect/effect-execution.ts',
    // Phase 2B-2.6. The deterministic proof handler reserves at its own dispatch
    // boundary, under the run's identity — the same shape a priced provider call
    // takes. It is here because a reviewer looked at it, and because proving the
    // runtime against a zero-cost effect is what let a vacuous reservation pass
    // for governance in the first place.
    'lib/workflows/effect/proof-handler.ts',
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
      // A default PARAMETER only. `const execution: ExecutionContract = …` in a
      // helper that DERIVES the scope from a row it owns is the correct pattern,
      // not a default — hero-image builds one from `article.project_id`.
      if (/\)\s*:\s*[\w<>\[\]| ]+\s*\{[\s\S]{0,200}execution:\s*ExecutionContract\s*=\s*\{/.test(body))
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
      // A PROJECT scope of some kind — since the scope correction these bind the
      // row's own project rather than the billing slug, which is strictly better.
      expect(body, `${rel} must carry a project scope`).toMatch(/scope:\s*projectScope\(/)
      expect(body, `${rel} must not be GLOBAL_ONLY`).not.toMatch(/scope:\s*GLOBAL_ONLY/)
    }
    // Therefore: a provenance defect (the ledger will say "autonomous" for work
    // a human asked for), deferred to G3C-2 for protocol repair. NOT a G3C-1
    // blocker, because nothing escapes an authority because of it.
  })
})

// ── F. GLOBAL_ONLY is governance-sensitive too ──────────────────────────────

describe('every runtime GLOBAL_ONLY is reviewed and justified', () => {
  /**
   * THE INVERSE BUG. G3C-1 correctly separated billing from authority, and then
   * over-applied it: several callers that HAD a real project UUID in hand
   * declared GLOBAL_ONLY anyway, on the reasoning that the billing slug was a
   * compatibility artefact. That is a project-stop bypass — a paused project's
   * work would still dispatch, because nothing project-shaped ever reached the
   * authority.
   *
   * GLOBAL_ONLY must mean "no project execution authority applies to this
   * work". It must never mean "a project scope was inconvenient here".
   *
   * So it gets the same treatment as OPERATOR_INTERACTIVE: a reviewed inventory,
   * each entry stating WHY no project binds.
   */
  const REVIEWED: Record<string, string> = {
    // Ordinary Atlas assistance. Serves every project at once, belongs to none.
    'app/api/chat/route.ts':
      'Atlas chat + the manager chat it delegates to: assistance ABOUT a project '
      + 'is not that project’s execution, and the context is INTERACTIVE anyway.',
    'app/api/chat/tts/route.ts':
      'Atlas TTS: reads assistance aloud. No project owns it.',
    // Platform-wide CFO briefing: aggregates revenue and cost across ALL
    // projects, so no single project’s pause should silence it.
    'app/api/media/cron/morning-briefing/route.ts':
      'Morning briefing aggregates every project; no single project owns it.',
    // Conditional constructions — GLOBAL_ONLY only on the branch where no
    // project was supplied at all.
    'app/api/evaluate/route.ts':
      'CONDITIONAL: binds the owned projectId when present; GLOBAL_ONLY only for '
      + 'a bare platform evaluation with no project.',
    'app/api/manager/route.ts':
      'CONDITIONAL: daily_plan and chat bind the owned project when one is '
      + 'supplied; evaluate and plan_tasks always bind. GLOBAL_ONLY only where no '
      + 'project exists.',
    'lib/marketing/workflows/channel-drafter.ts':
      'CONDITIONAL: binds brief.project_id when present; a brief without a '
      + 'project is platform-level drafting.',
  }

  it('no unreviewed file constructs GLOBAL_ONLY', () => {
    const constructors = runtimeFiles().filter(rel => {
      if (rel === 'lib/governance/execution-stop.ts') return false   // the vocabulary
      return /scope:\s*GLOBAL_ONLY/.test(code(rel))
    })
    const unreviewed = constructors.filter(rel => !(rel in REVIEWED))
    expect(unreviewed,
      'a new GLOBAL_ONLY must be justified in the inventory — it is the scope '
      + 'that answers to no project').toEqual([])
  })

  it('every reviewed entry carries a stated rationale', () => {
    for (const [rel, why] of Object.entries(REVIEWED)) {
      expect(why.length, `${rel} needs a real rationale`).toBeGreaterThan(40)
    }
  })

  it('the four proven project-bound entrypoints are NOT global', () => {
    // These are the exact bypasses the review found. Each had a real project
    // UUID established by a trusted upstream boundary.
    const bound: [string, string][] = [
      ['app/api/projects/[slug]/dream/route.ts', 'projectScope({ projectId: project.id })'],
      ['app/api/media/cron/dream/route.ts',      'projectScope({ projectId: p.id })'],
      ['app/api/evaluate/route.ts',              'projectScope({ projectId })'],
    ]
    for (const [rel, expected] of bound) {
      expect(code(rel), `${rel} must bind its real project`).toContain(expected)
    }
    // The manager is asserted per OPERATION below, not per file: it dispatches
    // many operations from one module, so a file-level match proves nothing
    // about the one that was changed.
  })

  /**
   * Extract one `case 'name': { … }` body by brace balance.
   *
   * A whole-file assertion cannot survive a multi-operation route. Reverting
   * plan_tasks to GLOBAL_ONLY left `projectScope({ projectId: project_id })`
   * in the file — daily_plan still contained it — so a file-level toContain
   * passed while a real bypass was live. Operation granularity is the point.
   */
  function switchCase(body: string, name: string): string {
    const start = body.indexOf(`case '${name}': {`)
    if (start === -1) throw new Error(`manager route has no case '${name}'`)
    const open = body.indexOf('{', start)
    let depth = 0
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++
      else if (body[i] === '}' && --depth === 0) return body.slice(open, i + 1)
    }
    throw new Error(`unbalanced braces in case '${name}'`)
  }

  it('each manager operation binds or abstains for its OWN stated reason', () => {
    const body = code('app/api/manager/route.ts')

    // Ownership-gated and project-required: these must bind, unconditionally.
    // `evaluate` derives its project from the approval row; `plan_tasks`
    // requires project_id and 404s without it. Neither has a legitimate
    // no-project branch, so neither may mention GLOBAL_ONLY at all.
    for (const op of ['evaluate', 'plan_tasks']) {
      const block = switchCase(body, op)
      expect(block, `manager '${op}' must bind its ownership-checked project`)
        .toMatch(/scope: projectScope\(/)
      expect(block, `manager '${op}' has no no-project branch — GLOBAL_ONLY is a bypass`)
        .not.toMatch(/scope:\s*GLOBAL_ONLY/)
    }

    // Genuinely conditional: a project is optional here, so both scopes appear
    // — but the project branch must still exist. Losing it would make the
    // fallback unconditional, which is the same bypass wearing a ternary.
    for (const op of ['daily_plan', 'chat']) {
      const block = switchCase(body, op)
      expect(block, `manager '${op}' must still bind when a project IS supplied`)
        .toMatch(/scope: projectScope\(/)
      expect(block, `manager '${op}' abstains only on the no-project branch`)
        .toMatch(/\?[\s\S]{0,200}projectScope\([\s\S]{0,200}:[\s\S]{0,120}GLOBAL_ONLY/)
    }
  })

  it('a project-scoped operation never falls back to GLOBAL_ONLY unconditionally', () => {
    // Dream is the clearest case: both entrypoints know the exact project.
    for (const rel of ['app/api/projects/[slug]/dream/route.ts',
                       'app/api/media/cron/dream/route.ts']) {
      expect(code(rel), `${rel} must not use GLOBAL_ONLY at all`)
        .not.toMatch(/scope:\s*GLOBAL_ONLY/)
    }
  })

  it('cron dream scopes INSIDE the iteration, so one pause is not a global pause', () => {
    const body = code('app/api/media/cron/dream/route.ts')
    // The contract must be built per project, not hoisted above the map.
    expect(body).toMatch(/map\(p =>[\s\S]{0,400}projectScope\(\{ projectId: p\.id \}\)/)
  })

  it('helpers that OWN the ownership relationship derive the scope themselves', () => {
    // hero-image takes a CONTEXT, not a contract: the article's project is
    // established from the row it loads, so a caller cannot name a project the
    // article does not belong to.
    const body = code('lib/article/hero-image.ts')
    expect(body).toMatch(/context: ExecutionContext/)
    expect(body).toContain('projectScope({ projectId: article.project_id })')
    expect(code('app/api/content/articles/[id]/hero-image/route.ts'))
      .toContain("generateHeroImage('OPERATOR_EXECUTION'")
  })

  it('media routes holding a real script/article project bind THAT project', () => {
    // Billing still flows through MEDIA_PIPELINE_PROJECT; execution does not.
    for (const rel of ['app/api/media/music/generate/route.ts',
                       'app/api/media/voice/route.ts',
                       'app/api/media/scripts/[id]/regenerate/route.ts',
                       'app/api/media/images/generate/route.ts']) {
      const body = code(rel)
      expect(body, `${rel} must scope to the row's own project`)
        .toContain('projectScope({ projectId })')
      expect(body, `${rel} still BILLS the pipeline project`)
        .toContain('MEDIA_PIPELINE_PROJECT')
    }
  })
})

// ── G. Operator prose must not reach a client ───────────────────────────────

describe('ExecutionStoppedError does not leak operator-authored text', () => {
  /**
   * The error carries the full StopDecision so a caller can reason about what
   * happened. `decision.observed` may hold `paused_reason` — text an operator
   * typed during an incident ("paused: vendor breach"). That is fine internally
   * and must not reach a tenant.
   */
  it('the MESSAGE is built only from stable codes', () => {
    const src = read('lib/governance/execution-stop.ts')
    const ctor = src.slice(src.indexOf('export class ExecutionStoppedError'))
    const superCall = ctor.slice(ctor.indexOf('super('), ctor.indexOf('this.name'))
    // reason / context / scopeKind / provider / operation — all closed vocabularies.
    expect(superCall).toContain('args.reason')
    expect(superCall).toContain('args.context')
    // The prose fields must not appear in the message at all.
    expect(superCall).not.toContain('observed')
    expect(superCall).not.toContain('paused_reason')
    expect(superCall).not.toContain('decision')
  })

  it('no route serializes the error OBJECT — only its message', () => {
    // A route doing `JSON.stringify(e)` or spreading the error would carry
    // `decision.observed` out to the client.
    const offenders: string[] = []
    for (const rel of runtimeFiles().filter(r => r.startsWith('app/api/'))) {
      const body = code(rel)
      // Only names actually bound by a `catch (…)` count. A single-letter `e`
      // elsewhere is usually a row or an element — the redaction map in the
      // stop-authority route spreads `{ ...e }` where `e` is a stop_events ROW,
      // and flagging that would be noise, not a finding.
      const caught = [...body.matchAll(/catch\s*\(\s*(\w+)\s*\)/g)].map(m => m[1])
      for (const name of new Set(caught)) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`JSON\\.stringify\\(\\s*${esc}\\s*\\)`).test(body))
          offenders.push(`${rel}: stringify(${name})`)
        if (new RegExp(`\\.\\.\\.\\s*${esc}\\b`).test(body))
          offenders.push(`${rel}: spreads ${name}`)
        if (new RegExp(`error:\\s*${esc}\\s*[,}]`).test(body))
          offenders.push(`${rel}: returns the ${name} object`)
      }
    }
    expect(offenders, 'routes must surface e.message, never the error object').toEqual([])
  })

  it('nothing reads a StopDecision’s observed prose outside the authority', () => {
    // Narrow on purpose: `observedAt` / `observedPositions` all over trading and
    // workflows are unrelated fields. The prose that matters is the operator's
    // pause reason, reachable only through a StopDecision.
    const readers = runtimeFiles().filter(rel =>
      rel !== 'lib/governance/execution-stop.ts'
      && rel !== 'app/api/system/stop-authority/route.ts'   // operator-only, already tiered
      && /(decision|platform|eligibility)\.observed\b|observed\?\.(global|project)Paused/.test(code(rel)))
    expect(readers, 'a stop decision’s operator prose is operator-only').toEqual([])
  })
})
