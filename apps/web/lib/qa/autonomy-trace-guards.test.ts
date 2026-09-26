/**
 * Phase 3B1A — permanent guards for the autonomy trace substrate.
 *
 * The SQL suite proves the DATABASE behaves. This suite proves the substrate
 * stays connected to its canonical sources and stays out of execution.
 *
 * Two families:
 *
 *   1. VOCABULARY SET-EQUALITY. The migration restates sets that already exist
 *      in TypeScript (levels, licence reasons, Survival states, policy reasons).
 *      A hand-copied set drifts; these guards compare the SQL text against the
 *      canonical source, so a divergence fails a test instead of shipping.
 *   2. INERTNESS. Nothing in the execution path may consume the trace, and the
 *      writer must keep the two properties Phase 3B1A was corrected for: the
 *      claim-fencing row lock, and the refusal of `bind`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { AUTONOMY_LICENSE_LEVELS } from '@/lib/atlas/autonomy-license/levels'
import { LICENSE_REASONS } from '@/lib/atlas/autonomy-license/types'
import { SURVIVAL_STATES } from '@/lib/atlas/survival/types'
import { AUTONOMY_RUNTIME_POLICY } from '@/lib/atlas/autonomy-runtime/policy'
import {
  RUN_AUTONOMY_DECISION_COLS,
  AUTONOMY_TRACE_BOUNDARIES,
  AUTONOMY_ADMISSION_REASONS,
  AUTONOMY_POLICY_MODES,
  AUTONOMY_POLICY_REASONS,
  AUTONOMY_SURVIVAL_REASONS,
  AUTONOMY_BOUNDED_BY,
} from '@/lib/atlas/autonomy-runtime/trace'

const APP = process.cwd()
const MIGRATION_DIR = join(APP, 'supabase/migrations')
const TRACE_MIGRATION = '20260925120000_autonomy_trace_decisions.sql'
const PHASE2C_MIGRATION = '20260924180000_autonomy_license_phase2c.sql'

const migrationText = readFileSync(join(MIGRATION_DIR, TRACE_MIGRATION), 'utf8')

/**
 * The quoted values of every `IN (...)` list inside one named CHECK.
 *
 * Returns a list-of-lists so a constraint that repeats one vocabulary across
 * several columns (the levels constraint does) can be checked for internal
 * agreement as well as for agreement with the canonical source.
 */
function inListsOf(constraintName: string, text = migrationText): string[][] {
  const at = text.indexOf(`constraint ${constraintName}`)
  if (at === -1) throw new Error(`no such constraint: ${constraintName}`)
  // The constraint body ends at the next `constraint ` or the closing `);`.
  const rest = text.slice(at)
  const nextConstraint = rest.indexOf('constraint ', 10)
  const body = nextConstraint === -1 ? rest : rest.slice(0, nextConstraint)
  return [...body.matchAll(/\bin\s*\(([^)]*)\)/gi)]
    .map(m => m[1]
      .split(',')
      .map(s => s.trim().replace(/^'/, '').replace(/'$/, ''))
      .filter(s => s.length > 0))
}

const sorted = (xs: readonly string[]) => [...xs].sort()

// ── Vocabulary set-equality against canonical sources ────────────────────────

describe('the migration restates no vocabulary of its own', () => {
  it('level vocabulary is set-equal to the canonical Chapter 18 scale', () => {
    const lists = inListsOf('run_autonomy_decisions_levels_vocabulary')
    expect(lists.length, 'the levels constraint must state a vocabulary').toBeGreaterThan(0)
    for (const list of lists) {
      expect(sorted(list), 'levels diverged from AUTONOMY_LICENSE_LEVELS')
        .toEqual(sorted(AUTONOMY_LICENSE_LEVELS))
    }
    // NOT a regex: a diverging list is exactly what a pattern would hide.
    expect(migrationText).not.toMatch(/\^L\[0-6\]\$/)
  })

  it('licence-reason vocabulary is set-equal to LICENSE_REASONS', () => {
    const [list] = inListsOf('run_autonomy_decisions_license_reason_vocabulary')
    expect(list.length).toBe(LICENSE_REASONS.length)
    expect(sorted(list)).toEqual(sorted(LICENSE_REASONS))
  })

  it('Survival-state vocabulary is set-equal to the canonical states', () => {
    const [list] = inListsOf('run_autonomy_decisions_survival_state_vocabulary')
    expect(sorted(list)).toEqual(sorted(SURVIVAL_STATES))
  })

  it('policy-mode vocabulary is exactly the Phase 3B0 policy modes', () => {
    const [list] = inListsOf('run_autonomy_decisions_policy_mode_vocabulary')
    // Derived from the policy TABLE, not restated — a new mode must appear in
    // the table before it can appear in SQL.
    const modes = new Set(Object.values(AUTONOMY_RUNTIME_POLICY).map(p => p.mode))
    expect(sorted(list)).toEqual(sorted([...modes]))
    expect(sorted([...modes])).toEqual(sorted(AUTONOMY_POLICY_MODES))
  })

  it('policy-reason vocabulary is exactly the Phase 3B0 exemption ∪ unsupported reasons', () => {
    const [list] = inListsOf('run_autonomy_decisions_policy_reason_vocabulary')
    const reasons = new Set<string>()
    for (const p of Object.values(AUTONOMY_RUNTIME_POLICY)) {
      if (p.mode === 'license_exempt_observation') reasons.add(p.exemptionReason)
      if (p.mode === 'unsupported') reasons.add(p.unsupportedReason)
    }
    expect(reasons.size, 'the policy table must yield reasons').toBeGreaterThan(0)
    expect(sorted(list)).toEqual(sorted([...reasons]))
    expect(sorted([...reasons])).toEqual(sorted(AUTONOMY_POLICY_REASONS))
  })

  it('the durable admission vocabulary is the Phase 3B0 core narrowed to reachable states', () => {
    const [list] = inListsOf('run_autonomy_decisions_reason_vocabulary')
    const core = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/admission.ts'), 'utf8')
    const declared = [...core.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    // Every durable reason must exist in the pure core's vocabulary…
    for (const r of list) expect(declared, `${r} is not a Phase 3B0 admission reason`).toContain(r)
    // …and the two the runtime can never produce must be ABSENT.
    expect(list, 'unknown_action_kind is rejected before autonomy is evaluated').not.toContain('unknown_action_kind')
    expect(list, 'the runtime resolves the licence; it never manufactures a null one').not.toContain('licence_absent')
    expect(sorted(list)).toEqual(sorted(AUTONOMY_ADMISSION_REASONS))
  })

  /**
   * The mode → reason relation, parsed out of the migration's cross-mode CHECK.
   *
   * Returns mode → the set of reasons that mode may record, so the guard pins
   * the RELATION and not merely the two vocabularies side by side. Comparing
   * them independently is exactly what let `licensed + unsupported_action`
   * through: each value was legal, the pair was not.
   */
  function policyReasonMatrix(text = migrationText): Map<string, Set<string>> {
    const at = text.indexOf('constraint run_autonomy_decisions_policy_reason_matrix')
    if (at === -1) throw new Error('the cross-mode matrix constraint is missing')
    const rest = text.slice(at)
    const next = rest.indexOf('constraint ', 10)
    const body = next === -1 ? rest : rest.slice(0, next)

    // Split by MODE POSITION rather than by one clever alternation: find each
    // `policy_mode is not distinct from '…'`, and treat the text up to the next
    // one (or the end of the constraint) as that mode's branch. A single
    // lookahead covering both `or (...)` and the trailing `),` was fragile and
    // silently returned no branches at all.
    const modeHits = [...body.matchAll(/policy_mode\s+is not distinct from\s+'([a-z_]+)'/g)]
    const out = new Map<string, Set<string>>()
    for (let i = 0; i < modeHits.length; i++) {
      const mode = modeHits[i][1]
      const from = modeHits[i].index! + modeHits[i][0].length
      const to = i + 1 < modeHits.length ? modeHits[i + 1].index! : body.length
      const tail = body.slice(from, to)

      const reasons = new Set<string>()
      for (const m of tail.matchAll(/reason\s+is not distinct from\s+'([a-z_]+)'/g)) reasons.add(m[1])
      for (const m of tail.matchAll(/reason\s+in\s*\(([^)]*)\)/g)) {
        for (const r of m[1].split(',')) reasons.add(r.trim().replace(/^'/, '').replace(/'$/, ''))
      }
      out.set(mode, reasons)
    }
    return out
  }

  it('the mode → reason relation is pinned, not just the two vocabularies', () => {
    const matrix = policyReasonMatrix()
    // Derived from the ADMISSION vocabulary rather than a second hand-kept
    // list: everything that is not an exempt observation or an unsupported
    // refusal must belong to `licensed`.
    const licensedReasons = AUTONOMY_ADMISSION_REASONS.filter(
      r => r !== 'exempt_observation' && r !== 'unsupported_action')

    expect(matrix.get('license_exempt_observation'), 'exempt may record exactly one reason')
      .toEqual(new Set(['exempt_observation']))
    expect(matrix.get('unsupported'), 'unsupported may record exactly one reason')
      .toEqual(new Set(['unsupported_action']))
    expect(matrix.get('licensed'), 'licensed owns every remaining reason')
      .toEqual(new Set(licensedReasons))

    expect([...matrix.keys()].sort()).toEqual([...AUTONOMY_POLICY_MODES].sort())

    // No reason may be orphaned: every admission reason belongs to some mode.
    const covered = new Set([...matrix.values()].flatMap(s => [...s]))
    for (const r of AUTONOMY_ADMISSION_REASONS) {
      expect(covered, `${r} is not reachable from any policy mode`).toContain(r)
    }
    expect(covered.size, 'the matrix must not admit a reason outside the vocabulary')
      .toBe(AUTONOMY_ADMISSION_REASONS.length)
  })

  it('the impossible pairs are NOT representable', () => {
    const licensed = policyReasonMatrix().get('licensed')!
    expect(licensed).not.toContain('unsupported_action')
    expect(licensed).not.toContain('exempt_observation')
    expect(policyReasonMatrix().get('unsupported')!).not.toContain('allowed')
    expect(policyReasonMatrix().get('license_exempt_observation')!).not.toContain('allowed')
  })

  it('the writer refuses the same pairs it would otherwise append', () => {
    // The table CHECK is the backstop; the sanctioned write path must also
    // refuse, so a ledger is never one constraint away from impossible
    // provenance. The SQL suite proves the behaviour; this pins its presence.
    expect(migrationText).toMatch(
      /policy mode "%" cannot record admission reason "%"/)
    expect(migrationText).toMatch(/if not \(/)
  })

  it('bounded_by and survival-failure vocabularies match the runtime source', () => {
    const [bounded] = inListsOf('run_autonomy_decisions_bounded_by_vocabulary')
    expect(sorted(bounded)).toEqual(sorted(AUTONOMY_BOUNDED_BY))
    const [failures] = inListsOf('run_autonomy_decisions_survival_reason_vocabulary')
    expect(sorted(failures)).toEqual(sorted(AUTONOMY_SURVIVAL_REASONS))
  })

  it('boundary vocabulary matches the trace model', () => {
    const [list] = inListsOf('run_autonomy_decisions_boundary_vocabulary')
    expect(sorted(list)).toEqual(sorted(AUTONOMY_TRACE_BOUNDARIES))
  })
})

// ── Schema shape ─────────────────────────────────────────────────────────────

describe('the table shape is the reviewed shape', () => {
  it('declares exactly the 20 reviewed columns, and no forbidden one', () => {
    const block = migrationText.slice(
      migrationText.indexOf('create table public.run_autonomy_decisions'),
      migrationText.indexOf('comment on table public.run_autonomy_decisions'))
    const declared = [...block.matchAll(/^\s{2}([a-z_]+)\s+(uuid|bigint|text|integer|timestamptz)\b/gm)]
      .map(m => m[1])
    expect(declared).toEqual([...RUN_AUTONOMY_DECISION_COLS])
    for (const forbidden of ['project_id', 'workflow_instance_id', 'action_kind',
      'licensed_level', 'verdict', 'decision_id', 'decision_version', 'decision_record_id']) {
      expect(declared, `duplicated fact "${forbidden}" must not be stored`).not.toContain(forbidden)
    }
  })

  it('keeps the composite licence FK — never reduced to license_id alone', () => {
    expect(migrationText).toMatch(
      /foreign key \(license_id, license_generation\)\s*\n\s*references public\.atlas_autonomy_license_events \(license_id, license_generation\)/)
  })

  it('uses ON DELETE RESTRICT for the run FK, never CASCADE', () => {
    expect(migrationText).toMatch(/references public\.runs \(id\) on delete restrict/)
    expect(migrationText).not.toMatch(/references public\.runs \(id\) on delete cascade/)
  })

  it('is server-only: RLS on, zero policies, revoke-then-grant-select', () => {
    expect(migrationText).toMatch(/alter table public\.run_autonomy_decisions enable row level security/)
    expect(migrationText).not.toMatch(/create policy/i)
    expect(migrationText).toMatch(/revoke all on table public\.run_autonomy_decisions\s*\n\s*from public, anon, authenticated, service_role/)
    expect(migrationText).toMatch(/grant select on table public\.run_autonomy_decisions to service_role/)
    // No INSERT grant to ANY role: the RPC is the only write path.
    expect(migrationText).not.toMatch(/grant insert/i)
  })
})

// ── The two corrections that must not be undone ──────────────────────────────

describe('the corrected writer properties are structurally present', () => {
  it('the writer LOCKS the run row — fencing is a lock, not a comparison', () => {
    expect(migrationText).toMatch(/select \* into v_run from public\.runs where id = p_run_id for update;/)
  })

  it('the writer REFUSES boundary=bind', () => {
    // §31: bind provenance must arrive only through the 3B1B atomic bind RPC.
    expect(migrationText).toMatch(
      /if p_boundary is null or p_boundary not in \('readiness', 'pre_dispatch'\)/)
  })

  it('every matrix uses NULL-TOTAL comparison, never a bare nullable equality', () => {
    // The defect that got the first draft rejected: `nullable_col = 'x'` inside
    // a required branch is UNKNOWN on NULL and PostgreSQL PASSES it.
    const matrices = migrationText.slice(
      migrationText.indexOf('constraint run_autonomy_decisions_exempt_matrix'),
      migrationText.indexOf('comment on table public.run_autonomy_decisions'))
    // `\s+` throughout: the migration aligns its `is`/`in` keywords into
    // columns, so a single-space pattern matches nothing and the assertion
    // would pass or fail for the wrong reason.
    expect(matrices).toMatch(/is not distinct from 'exempt_observation'/)
    expect(matrices).toMatch(/is not distinct from 'survival_unavailable'/)
    expect(matrices).toMatch(/survival_reason\s+is not null/)
    // Membership is always guarded by an explicit IS NOT NULL, so a NULL cannot
    // make the whole branch UNKNOWN.
    expect(matrices).toMatch(/survival_reason\s+is not null\s+and survival_reason\s+in \(/)
    expect(matrices).toMatch(/bounded_by\s+is not null\s+and bounded_by\s+in \('licence', 'survival_ceiling'\)/)
    // And the specific nullable equalities that were defective are gone.
    expect(matrices).not.toMatch(/policy_reason\s*=\s*'/)
    expect(matrices).not.toMatch(/license_reason\s*=\s*'active'/)
  })
})

// ── Migration discipline ─────────────────────────────────────────────────────

describe('migration discipline', () => {
  it('Phase 2C is byte-identical to its merged form — no historical edit', () => {
    const bytes = readFileSync(join(MIGRATION_DIR, PHASE2C_MIGRATION))
    // Pinned to the merged bytes. Any edit to a historical migration fails here,
    // which is the point: migrations are applied history, not drafts.
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('22348156e1415b7137ef0aa80ecf3e10010484fe5561f4407e89875a524ebe20')
  })

  it('the new migration sorts after every pre-existing migration', () => {
    const files = readdirSync(MIGRATION_DIR).filter(f => f.endsWith('.sql')).sort()
    expect(files).toContain(TRACE_MIGRATION)
    const after = files.slice(files.indexOf(TRACE_MIGRATION) + 1)
    expect(after, `unexpected migrations after Phase 3B1A:\n${after.join('\n')}`).toEqual([])
  })
})

// ── Inertness ────────────────────────────────────────────────────────────────

describe('Phase 3B1A remains INERT', () => {
  const roots = ['lib', 'app', 'components', 'scripts']
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      if (['node_modules', '.next', '.turbo', '.git'].includes(entry)) return []
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return walk(full)
      return /\.(ts|tsx)$/.test(entry) ? [full] : []
    })
  }

  it('no execution module consumes the trace or its writer', () => {
    const offenders: string[] = []
    for (const f of roots.flatMap(r => walk(join(APP, r)))) {
      const rel = f.replace(`${APP}/`, '')
      if (rel.startsWith('lib/qa/') || rel.startsWith('lib/atlas/autonomy-runtime/')) continue
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
      if (/autonomy-runtime\/trace|record_run_autonomy_decision|run_autonomy_decisions/.test(code)) {
        offenders.push(rel)
      }
    }
    expect(offenders, `execution consumed the trace:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the execution roots named by the ruling are untouched by this phase', () => {
    for (const rel of [
      'lib/workflows/action-run.ts',
      'lib/workflows/action-executor.ts',
      'lib/workflows/action-scheduling.ts',
      'lib/workflows/effect/effect-execution.ts',
    ]) {
      const code = readFileSync(join(APP, rel), 'utf8')
      expect(code, rel).not.toMatch(/autonomy-runtime/)
    }
  })

  it('the trace model imports nothing from workflows, and exposes no writer', () => {
    const src = readFileSync(join(APP, 'lib/atlas/autonomy-runtime/trace.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
    expect(code).not.toMatch(/from '@\/lib\/workflows/)
    expect(code).not.toMatch(/\bappend\b|\binsert\b|createAdminClient/)
  })

  it('no rollout flag was created', () => {
    // The needle is BUILT, not written: a literal here would make this file
    // match itself, and the assertion would fail for a reason that has nothing
    // to do with the flag. (It did, on the first run.)
    const flag = ['H1', 'AUTONOMY', 'GATE'].join('_')
    for (const f of roots.flatMap(r => walk(join(APP, r)))) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
      expect(code, f.replace(`${APP}/`, '')).not.toContain(flag)
    }
  })
})
