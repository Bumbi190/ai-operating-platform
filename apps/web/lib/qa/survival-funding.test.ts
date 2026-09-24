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

import { presentFundingEvidence } from '@/lib/atlas/survival/funding'

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

  it('the migration never puts the declaration on platform_config', () => {
    // The WITHDRAWN design, asserted as an absence so it cannot come back by
    // accident. Production grants `authenticated` SELECT on `platform_config`
    // through a policy whose qual is literally `true`, so a column there would
    // publish the owner's operating capital to every authenticated user — RLS
    // protects rows, and no policy can be narrowed by adding a field.
    const sql = read(MIGRATION)
    expect(sql).not.toMatch(/alter table public\.platform_config[\s\S]{0,300}declared_operating_capital_sek/)
    // …nor the owner-check trigger that design needed, since the new table's ACL
    // is already the boundary.
    expect(sql).not.toContain('survival_guard_platform_funding')
    // And the historical stop guard is untouched.
    expect(sql).not.toMatch(/create or replace function public\.stop_guard_platform_config/)
  })

  it('the migration creates the singleton SERVER-ONLY, with no write grant to anyone', () => {
    const sql = read(MIGRATION)
    expect(sql).toContain('create table if not exists public.survival_funding_config')
    expect(sql).toContain('constraint survival_funding_config_singleton check (id = 1)')
    expect(sql).toContain('alter table public.survival_funding_config enable row level security')
    expect(sql).toMatch(/revoke all on table public\.survival_funding_config\s+from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant select on table public\.survival_funding_config\s+to service_role/)
    // The absence of a write grant IS the boundary, so it is asserted rather
    // than assumed: one `grant update` here would silently reopen the bypass the
    // whole redesign exists to close.
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|truncate)[^;]*survival_funding_config/i)
  })

  it('the reader reads the singleton and NOT platform_config', () => {
    const src = codeOnly(read(READER))
    expect(src).toContain("const SURVIVAL_FUNDING_CONFIG_TABLE = 'survival_funding_config'")
    expect(src).toMatch(/\.from\(SURVIVAL_FUNDING_CONFIG_TABLE\)/)
    // Comments are stripped, so any occurrence here is real code. A reader that
    // still consulted the old table would be reading a source that no longer
    // holds the declaration — and would reintroduce the disclosure.
    expect(src).not.toContain('platform_config')
  })

  it('the presentation authorization is server-derived and fails closed', () => {
    const src = codeOnly(read(READER))
    // Operator status is an argument, resolved by the caller from the session —
    // never read from a request, a project, or anything client-supplied.
    expect(src).toContain('isPlatformOperator: boolean')
    expect(src).not.toMatch(/request|headers\(|cookies\(|searchParams/)
    // Both figures move together: withholding the amount while publishing the
    // runway would leak the same fact to anyone who can also see the burn.
    expect(src).toMatch(/return \{ declaredFundingSek: null, runwayDays: null, fundingVisibility: 'redacted' \}/)
  })

  it('the migration constrains the ledger actor to the canonical human shape', () => {
    const sql = read(MIGRATION)
    expect(sql).toContain('survival_funding_events_actor_human_identity')
    // The CANONICAL UUID family, not merely "8-4-4-4-12 hex": version nibble
    // 1–5 and variant nibble 8/9/a/b. The loose pattern would admit the nil UUID
    // and other shapes no generator in this repository produces.
    expect(sql).toContain('^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
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

// ── §9/§10 Presentation disclosure — the decision itself ────────────────────

describe('presentFundingEvidence', () => {
  const evidence = { declaredFundingSek: 120_000, runwayDays: 1445.78 }

  it('discloses BOTH figures to the platform operator', () => {
    expect(presentFundingEvidence(evidence, { isPlatformOperator: true }))
      .toEqual({ declaredFundingSek: 120_000, runwayDays: 1445.78, fundingVisibility: 'operator' })
  })

  it('withholds BOTH figures from anyone else, and says which of the two nulls this is', () => {
    const shown = presentFundingEvidence(evidence, { isPlatformOperator: false })
    expect(shown.declaredFundingSek).toBeNull()
    expect(shown.runwayDays).toBeNull()
    // The flag is what keeps "we did not establish it" distinct from "we are not
    // showing it to you" — both are null on the wire, and only one of them is a
    // statement about the platform.
    expect(shown.fundingVisibility).toBe('redacted')
  })

  it('leaves NOTHING in the serialized result from which the declaration could be recovered', () => {
    // The runway is withheld for this exact reason: for a complete observation
    // `runwayDays × burnSekPerDay` IS the declaration, so publishing the runway
    // beside the burn would disclose the same fact one multiplication away.
    const serialized = JSON.stringify(presentFundingEvidence(evidence, { isPlatformOperator: false }))
    expect(serialized).not.toContain('120000')
    expect(serialized).not.toContain('120,000')
    expect(serialized).not.toContain('1445')
  })

  it('redaction is NEVER zero — zero is a declaration, and a false one', () => {
    const shown = presentFundingEvidence(evidence, { isPlatformOperator: false })
    expect(shown.declaredFundingSek).not.toBe(0)
    expect(shown.runwayDays).not.toBe(0)
  })
})

// ── §9/§10 Presentation disclosure ──────────────────────────────────────────

describe('the funding evidence is operator-only at every serialization boundary', () => {
  const PANEL = 'components/platform/vnext/SystemHealth.tsx'

  it('the API redacts from the WORKING SESSION, and the decision wins the spread', () => {
    const src = codeOnly(read(ROUTE))
    expect(src).toContain('resolvePlatformOperator')
    expect(src).toMatch(/presentFundingEvidence\(snapshot, \{ isPlatformOperator: operator\.ok \}\)/)
    // The redacted fields are applied AFTER the snapshot spread, so the spread
    // cannot re-expose what the decision removed.
    expect(src).toMatch(/snapshot: \{ \.\.\.snapshot, \.\.\.evidence \}/)
  })

  it('the loader redacts the same way, and the panel reads the decision', () => {
    const loader = codeOnly(read(LOADER))
    expect(loader).toContain('resolvePlatformOperator')
    expect(loader).toContain('presentFundingEvidence(')
    expect(codeOnly(read(PANEL))).toContain("survival.fundingVisibility === 'operator'")
  })

  it('the panel gates BOTH the amount and the control on that one decision', () => {
    const panel = codeOnly(read(PANEL))
    // The amount…
    expect(panel).toMatch(/isOperator && fundingState === 'KNOWN' && survival\.declaredFundingSek !== null/)
    // …and the input, which is platform-operator functionality.
    expect(panel).toMatch(/\{isOperator \? \(\s*<FundingDeclarationControl/)
  })

  it('withholds the RUNWAY as well as the amount, because one multiplication recovers it', () => {
    // For a complete observation `runwayDays × burnSekPerDay` IS the declaration.
    // Redacting only the amount would publish the same fact to anyone who can
    // multiply, which is why the two figures move under one decision.
    expect(codeOnly(read(READER)))
      .toMatch(/declaredFundingSek: null, runwayDays: null, fundingVisibility: 'redacted'/)
  })

  it('hiding the control is presentation, not the boundary', () => {
    // The control's absence changes what can be SEEN. The action re-derives
    // operator identity from the session on every call whatever is drawn, so it
    // is still the thing that refuses.
    const action = codeOnly(read(ACTION))
    expect(action).toContain('resolvePlatformOperator')
    expect(action).toMatch(/if \(!operator\.ok\)/)
  })

  it('the derivation is untouched — state and ceiling still come from the true values', () => {
    // Redaction happens at SERIALIZATION. A second survival state computed from
    // redacted inputs would be a different answer to the same question, and the
    // reader would be looking at it.
    for (const f of [READER, ROUTE, LOADER]) {
      const src = codeOnly(read(f))
      expect(src, f).not.toMatch(/deriveSurvivalState|mostRestrictive/)
    }
  })
})
