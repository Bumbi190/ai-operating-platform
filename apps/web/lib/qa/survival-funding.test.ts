/**
 * Phase 2B — funding authority, wiring and inertness (structural).
 *
 * The database behaviours are proven against real PostgreSQL in
 * `survival-funding-sql.test.ts`. This suite proves the properties of the CODE,
 * and the two that matter most are dependency claims:
 *
 *   1. NO PRODUCTION CALLER CAN CHOOSE THE FUNDING OR THE COVERAGE. A caller
 *      that could supply either one would be choosing the input that governs its
 *      own autonomy ceiling — funding by naming a figure, coverage by claiming
 *      its scope is the whole platform.
 *
 *   2. THE DECLARATION AUTHORIZES NOTHING. It is a runway input. Nothing gates
 *      on it, nothing reserves against it, and no licence is derived from it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments name what a file deliberately does NOT do; scans read code. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const ROUTE = 'app/api/system/survival/route.ts'
const LOADER = 'lib/os/system-health.ts'
const RECORDER = 'lib/atlas/survival/history/principal-write.ts'
const READER = 'lib/atlas/survival/funding.ts'
const ACTION = 'app/actions/survival-funding.ts'
const SEAM = 'lib/governance/funding-declaration.ts'
const MIGRATION = 'supabase/migrations/20260924120000_survival_funding_phase2b.sql'

// ── One source of funding truth, chosen by nobody ───────────────────────────

/**
 * The ARGUMENTS of the one call that assembles a snapshot, not the whole file.
 *
 * Scanning the file would fail on two legitimate lines that have nothing to do
 * with passing an override: the `SurvivalSection` field DECLARATION
 * (`runwayCoverage: RunwayCoverage`) and the mapper reading FROM the snapshot
 * (`runwayCoverage: snapshot.runwayCoverage`). Both are the opposite direction.
 */
function snapshotCallArgs(rel: string): string {
  const src = codeOnly(read(rel))
  const start = src.indexOf('readSurvivalSnapshot(')
  expect(start, `no readSurvivalSnapshot call in ${rel}`).toBeGreaterThan(-1)
  let depth = 0, i = start + 'readSurvivalSnapshot'.length
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') { depth--; if (depth === 0) break }
  }
  return src.slice(start, i + 1)
}

describe('no production caller supplies funding or coverage', () => {
  it('the route accepts neither, and passes neither', () => {
    const args = snapshotCallArgs(ROUTE)
    expect(args).toBe('readSurvivalSnapshot(access.allowedProjectIds)')
    // Nor can it reach for one: no body, no query, no header.
    expect(codeOnly(read(ROUTE))).not.toMatch(/NextRequest|searchParams|request\./)
  })

  it('the Systemhälsa loader accepts neither, and passes neither', () => {
    const args = snapshotCallArgs(LOADER)
    expect(args).toBe('readSurvivalSnapshot(access.allowedProjectIds, { db })')
    expect(args).not.toMatch(/funding|Coverage/)
  })

  it('the recorder accepts neither, and passes neither', () => {
    const args = snapshotCallArgs(RECORDER)
    // Only the project id and any harness options — never a funding or coverage
    // override, because the recorder would then be choosing the inputs that
    // govern the ceiling it is recording.
    expect(args).toMatch(/^readSurvivalSnapshot\(\[projectId\], options\)$/)
  })

  it('the test seams are named so a production caller passing one is visible', () => {
    const src = codeOnly(read('lib/atlas/survival/snapshot.ts'))
    // `testRunwayCoverage` announces itself. `funding` is the Phase-1 name kept
    // deliberately so every existing call site stays greppable.
    expect(src).toContain('testRunwayCoverage')
    expect(src).toContain('options.funding ?? await readDeclaredOperatingCapital')
    expect(src).toContain('options.testRunwayCoverage ?? await readRunwayCoverage')
  })

  it('funding is read from exactly ONE place, and only there', () => {
    const offenders: string[] = []
    const files = [
      ROUTE, LOADER, RECORDER,
      'lib/atlas/survival/snapshot.ts', 'lib/os/system-health.ts',
      'components/platform/vnext/SystemHealth.tsx',
    ]
    for (const f of files) {
      const src = codeOnly(read(f))
      if (f === 'lib/atlas/survival/snapshot.ts') continue   // the one legitimate caller
      if (/declared_operating_capital_sek/.test(src)) offenders.push(f)
      // `platform_config` alone is NOT a funding read: the loader legitimately
      // reads it for the automation-stop state, which is a different column.
      if (/platform_config/.test(src) && /capital/i.test(src)) offenders.push(f)
    }
    expect(offenders, `a second funding source appeared in: ${offenders.join(', ')}`).toEqual([])
  })
})

// ── The reader's three semantics ────────────────────────────────────────────

describe('the canonical reader distinguishes three facts', () => {
  const src = codeOnly(read(READER))

  it('a failed read is UNAVAILABLE, never UNDECLARED', () => {
    // Every failure path in the reader must land on UNAVAILABLE. UNDECLARED is
    // less restrictive, so a lost reading must never be reported as one.
    const failures = src.match(/return \{ kind: '(UNAVAILABLE|UNDECLARED)' \}/g) ?? []
    expect(failures.filter(f => f.includes('UNAVAILABLE')).length).toBeGreaterThanOrEqual(3)
    // UNDECLARED appears exactly once — the successful-but-null case.
    expect(failures.filter(f => f.includes('UNDECLARED')).length).toBe(1)
  })

  it('a non-finite value is UNAVAILABLE, not a declaration of zero', () => {
    expect(src).toContain('Number.isFinite(value)')
    expect(src).toMatch(/if \(!Number\.isFinite\(value\)\) return \{ kind: 'UNAVAILABLE' \}/)
  })

  it('is server-only and reads the singleton by its fixed id', () => {
    expect(read(READER)).toContain("import 'server-only'")
    expect(src).toContain(".eq('id', 1)")
  })

  it('never infers funding from revenue, MRR, budgets or the cost ledger', () => {
    for (const forbidden of ['revenue_snapshots', 'revenue_events', 'project_budgets',
                             'budget_headroom', 'cost_events', 'spend_reservations', 'stripe']) {
      expect(src.toLowerCase(), `funding inferred from ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('carries the failure in the reading ALONE — there is no second funding-read truth', () => {
    // The owner's ruling on duplicate truth: `kind === 'UNAVAILABLE'` already
    // states whether the funding read succeeded, so a `SurvivalReads.funding`
    // boolean beside it would be one fact stored twice — and two
    // representations of one fact drift. Asserted as an ABSENCE in both
    // directions, so removing the field is not enough: nothing may consume one
    // either.
    const types = codeOnly(read('lib/atlas/survival/types.ts'))
    const at = types.indexOf('interface SurvivalReads')
    expect(at, 'SurvivalReads must exist').toBeGreaterThan(-1)
    const body = types.slice(at, types.indexOf('}', at))
    expect(body).toContain('budgets')
    expect(body, 'reads must not carry a funding flag').not.toMatch(/funding/)

    // No consumer anywhere, and the snapshot builder cannot emit one.
    expect(codeOnly(read(READER))).not.toMatch(/reads\.funding/)
    expect(codeOnly(read('lib/atlas/survival/snapshot.ts'))).not.toMatch(/funding:\s*(true|false)/)
    expect(codeOnly(read('lib/atlas/survival/derive.ts'))).not.toMatch(/reads\.funding/)
  })

  it('the coverage check asks the database for a BOOLEAN, not a table read', () => {
    expect(src).toContain("rpc('survival_scope_is_platform_complete'")
    // A client-side read of `projects` outside the caller's scope is exactly what
    // the isolation invariant forbids, so it must not appear here.
    expect(src).not.toMatch(/from\('projects'\)/)
    // Only an explicit true completes; everything else is restrictive.
    expect(src).toMatch(/data === true \? 'PLATFORM_COMPLETE' : 'PARTIAL_SCOPE'/)
  })
})

// ── Authority ───────────────────────────────────────────────────────────────

describe('only the platform operator may change the declaration', () => {
  const src = codeOnly(read(ACTION))

  it('resolves operator authority from the session, not from a parameter', () => {
    expect(src).toContain('resolvePlatformOperator')
    expect(src).toMatch(/if \(!operator\.ok\)/)
    // No actor parameter exists on any exported action, so there is nothing for
    // a caller to spoof — the same contract the stop authority has.
    // No literal actor anywhere: the only value is the server-derived one.
    expect(src).not.toMatch(/actor:\s*['"`]/)
    expect(src).toContain('actor: operator.actor')
  })

  it('takes no user id, no project id and no funding state from the caller', () => {
    expect(src).not.toMatch(/userId|projectId|isOperator|role\b/)
    // The only form field it reads is the amount.
    const fields = src.match(/formData\.get\('([^']+)'\)/g) ?? []
    expect(fields).toEqual(["formData.get('declared_sek')"])
  })

  it('validates the amount and rejects anything that is not a finite number', () => {
    expect(src).toContain('Number.isFinite(value)')
    // Blank must not become a declaration of zero.
    expect(src).toMatch(/if \(trimmed === ''\) return undefined/)
    // A strict decimal form, so '0x10', 'Infinity', '1e5' and friends never parse.
    expect(src).toContain('/^-?(\\d+)(?:\\.(\\d+))?$/')
    // …and the action mirrors the DATABASE's numeric(12,4) exactness rule
    // rather than letting the boundary refuse it, so a bad keystroke answers
    // `invalid_amount` instead of surfacing as a database error.
    expect(src).toContain('MAX_DECIMALS = 4')
    expect(src).toContain('MAX_ABS_SEK = 99_999_999.9999')
    // Trailing zeros are stripped before the precision test: 1.23000 is 1.23 as
    // a numeric and loses nothing, so both boundaries must agree it is valid.
    expect(src).toMatch(/replace\(\/0\+\$\/, ''\)/)
  })

  it('CLEAR takes no amount at all, so it cannot be expressed as a zero', () => {
    const clear = src.slice(src.indexOf('export async function clearOperatingCapital'))
    expect(clear).toContain('mutate(null)')
    expect(clear).not.toContain('formData')
  })

  it('the seam performs no authorization and cannot be reached from a client', () => {
    const seam = codeOnly(read(SEAM))
    expect(seam).not.toContain('resolvePlatformOperator')
    expect(seam).not.toMatch(/isOperator|role|session/)
    expect(seam).toContain("rpc('survival_set_declared_operating_capital'")
  })
})

// ── Inertness: the declaration authorizes nothing ───────────────────────────

describe('the declaration enables no enforcement', () => {
  it('no survival file reaches a spend boundary, a provider, a stop or a licence', () => {
    for (const f of [READER, 'lib/atlas/survival/snapshot.ts', 'lib/atlas/survival/derive.ts',
                     SEAM, ACTION]) {
      const src = codeOnly(read(f))
      expect(src, f).not.toMatch(/withGovernedSpend|reserveSpend|settleSpend|budget_reserve/)
      expect(src, f).not.toMatch(/anthropic|openai|elevenlabs|ideogram|muapi|getAnthropic/)
      expect(src, f).not.toMatch(/stop_set_platform_automation|stop_set_project_execution/)
      expect(src, f).not.toMatch(/autonomyLicense|atlas_autonomy_licenses|grantAuthorization/)
    }
  })

  it('the migration adds no scheduler and no cron', () => {
    const sql = read(MIGRATION).replace(/--[^\n]*/g, '').toLowerCase()
    expect(sql).not.toMatch(/cron\.schedule|pg_cron|schedule\s*\(/)
  })

  it('the migration installs the funding guard as SECURITY INVOKER, not DEFINER', () => {
    // Load-bearing, and asserted on the SOURCE because it is the kind of thing
    // that gets "helpfully" added later: as SECURITY DEFINER the guard would run
    // as the table owner, `current_user` would always equal the owner, and the
    // check would pass for everyone — silently disabling the whole boundary.
    const sql = read(MIGRATION)
    const fn = sql.slice(sql.indexOf('function public.survival_guard_platform_funding()'))
    expect(fn.slice(0, fn.indexOf('$$'))).not.toMatch(/security\s+definer/i)
    expect(sql).toContain('before update on public.platform_config')
    // And it is its own concern, not folded into the historical stop guard.
    expect(sql).not.toMatch(/create or replace function public\.stop_guard_platform_config/)
  })

  it('the migration constrains the ledger actor to the canonical human shape', () => {
    const sql = read(MIGRATION)
    expect(sql).toContain('survival_funding_events_actor_human_identity')
    expect(sql).toContain('^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    // The weaker "some trimmed text" rule is REPLACED, not merely joined by a
    // stronger one — a length range beside the exact shape would be a claim that
    // is not true.
    expect(sql).not.toContain('survival_funding_events_actor_present')
  })

  it('the migration pairs provenance with the derivation version', () => {
    const sql = read(MIGRATION)
    expect(sql).toContain('atlas.survival.observation.v1')
    expect(sql).toContain('atlas.survival.observation.v2')
    // Derived in the recorder, never written as a literal in an INSERT branch.
    expect(sql).toContain("when 1 then 'atlas.survival.observation.v1'")
    expect(sql).toContain("when 2 then 'atlas.survival.observation.v2'")
  })

  it('the migration touches no budget, spend or stop object', () => {
    const sql = read(MIGRATION).replace(/--[^\n]*/g, '').toLowerCase()
    for (const forbidden of ['budget_headroom', 'budget_reserve', 'spend_reservations',
                             'project_budgets', 'automation_paused', 'stop_events',
                             'atlas_authorizations']) {
      expect(sql, `migration touches ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('the recorder stays dormant — nothing invokes it', () => {
    // Phase 2B adds no scheduler and wires no caller.
    const callers = codeOnly(read('app/actions/survival-funding.ts'))
    expect(callers).not.toMatch(/observeProjectSurvival|recordSurvivalTransition/)
  })
})

// ── The owner-facing control ────────────────────────────────────────────────

describe('the declaration control is an input, not a survival surface', () => {
  const CONTROL = 'components/platform/FundingDeclarationControl.tsx'
  const PANEL = 'components/platform/vnext/SystemHealth.tsx'
  const src = codeOnly(read(CONTROL))

  it('reaches the operator-gated actions and nothing else', () => {
    expect(src).toContain("from '@/app/actions/survival-funding'")
    expect(src).toContain('declareOperatingCapital')
    expect(src).toContain('clearOperatingCapital')
  })

  it('computes no survival state, ceiling, threshold or runway', () => {
    // The whole point of the panel comment: the UI carries values, it never
    // derives them. A second derivation here could disagree with the API.
    expect(src).not.toMatch(/deriveSurvivalState|survivalCeiling|effectiveAutonomy|mostRestrictive/)
    expect(src).not.toMatch(/@\/lib\/atlas\/survival/)
    // No arithmetic over the amount at all — no ratio, no division, no floor.
    expect(src).not.toMatch(/runwayDays|burnSekPerDay|declaredFundingSek|PROVISIONAL_/)
  })

  it('performs no authorization of its own — the server decides', () => {
    // The control is rendered for everyone; the action refuses. Hiding it would
    // make UI visibility look like a permission boundary.
    expect(src).not.toMatch(/isPlatformOperator|resolvePlatformOperator|role|allowlist/)
  })

  it('CLEAR is a distinct action that passes NO amount', () => {
    // If clearing were expressed as a zero declaration, "the owner makes no
    // claim" and "the owner claims nothing is left" would become one fact.
    expect(src).toContain('clearOperatingCapital()')
    expect(src).not.toMatch(/clearOperatingCapital\(\s*[^)]/)
  })

  it('shows the declaration it was given, so it cannot display a figure the reader did not see', () => {
    // `declaredSek` is a prop fed from the canonical snapshot, and it is the
    // only source for the field's initial value.
    expect(src).toMatch(/declaredSek\s*===\s*null\s*\?\s*''\s*:\s*String\(declaredSek\)/)
  })

  it('is rendered by the survival panel, fed from the canonical section', () => {
    const panel = codeOnly(read(PANEL))
    expect(panel).toContain('FundingDeclarationControl')
    // Fed from `survival`, not re-fetched: the control and the facts above it
    // are guaranteed to describe the same reading.
    expect(panel).toMatch(/declaredSek=\{fundingState === 'KNOWN' \? survival\.declaredFundingSek : null\}/)
    // A failed read disables the control rather than pre-filling a guess.
    expect(panel).toMatch(/readable=\{fundingState !== 'UNAVAILABLE'\}/)
  })
})
