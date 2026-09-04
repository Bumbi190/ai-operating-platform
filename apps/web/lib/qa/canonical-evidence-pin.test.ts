/**
 * PR9i-0 — one canonical way to ask "is this evidence current".
 *
 * `advanceAuthorizedWorkflow` judged required evidence against
 * `gate.target.versionHash`. That is a `workflow.gate` hash — a different
 * canonical target kind from the `workflow.evidence` hash that both the executor
 * (PR9h-3) and the attested route actually write, and one that additionally
 * includes the evidence rows themselves. Correctly bound evidence could never
 * equal it, so every required check at a gated state read as STALE and the gate
 * could never be crossed.
 *
 * It hid because the only state advanced in production so far — `planning` —
 * declares ZERO required checks, so `if (required.length > 0)` skipped the whole
 * block. `content_generation`, where 2099-01 now sits, declares one.
 *
 * Three canonical target kinds exist and none of them is interchangeable:
 *   workflow.evidence   per check, stable          — what evidence is ABOUT
 *   workflow.action     includes evidence rows     — what an action may DO
 *   workflow.gate       includes evidence rows     — what a human APPROVED
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { summarizeStateEvidence } from '../workflows/evidence-consumption'
import { evidenceTargetHashFor } from '../workflows/evidence-binding'
import { computeEvidenceTargetHash, evidenceTargetPayload } from '../workflows/attestation'
import { workflowGateTargetPayload } from '../workflows/gate'
import { workflowActionTargetPayload } from '../workflows/action-target'
import { findAdapter } from '../workflows/adapters/registry'

const FS_DEF_KEY = 'familje-stunden.monthly-release'
const fsSpec = JSON.parse(readFileSync(join(process.cwd(),
  `lib/workflows/definitions/${FS_DEF_KEY}.v1.json`), 'utf8'))

const instance = {
  id: '00000000-0000-4000-8000-00000000c0de',
  def_id: '00000000-0000-4000-8000-0000000000de',
  def_key: FS_DEF_KEY, def_version: 1, def_hash: 'a'.repeat(64),
  project_id: '00000000-0000-4000-8000-0000000000b1',
  instance_key: '2099-01', current_state: 'content_generation', status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null,
  created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
}

const STATE = 'content_generation'
const CHECK = 'story_page_count'

const declared = () => findAdapter(FS_DEF_KEY)!.attestableChecks()

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'ev-1', instance_id: instance.id, state: STATE, check_key: CHECK,
    result: 'pass', source: 'attested', detail: {},
    recorded_at: '2026-01-02T00:00:00.000Z',
    producer: 'ci', producer_type: 'ci', observed_at: '2026-01-02T00:00:00.000Z',
    payload_hash: 'c'.repeat(64), target_hash: null,
    attestation: { source_commit: 'abc123', artifact_manifest_hash: 'm'.repeat(64) },
    ...over,
  }
}

/** The pin an attestation for this check must carry, given its own provenance. */
function pinFor(r: Record<string, unknown>): string {
  const meta = (r.attestation ?? {}) as { source_commit?: string; artifact_manifest_hash?: string }
  return computeEvidenceTargetHash({
    instance: instance as never, spec: fsSpec, state: STATE, checkKey: CHECK,
    sourceCommit: meta.source_commit ?? null,
    artifactManifestHash: meta.artifact_manifest_hash ?? null,
  })
}

function verdictFor(rows: Record<string, unknown>[]) {
  return summarizeStateEvidence(declared(), STATE, rows as never,
    evidenceTargetHashFor(instance as never, fsSpec, STATE, rows as never))
    .verdicts.find(v => v.check_key === CHECK)!
}

// ── The three pins are genuinely different ─────────────────────────────────

describe('the canonical target kinds are not interchangeable', () => {
  const common = { instance: instance as never, spec: fsSpec, state: STATE }
  const evidence = evidenceTargetPayload({ ...common, checkKey: CHECK,
    sourceCommit: null, artifactManifestHash: null })
  const gate = workflowGateTargetPayload({ ...common, evidence: [], declaredCheckKeys: [] } as never)
  const action = workflowActionTargetPayload({
    ...common, actionKind: 'compute_release_instant', actionClass: 'READ_ONLY',
    sideEffectTarget: null, evidence: [], declaredCheckKeys: [],
  } as never) as Record<string, unknown>

  it('each declares its own kind', () => {
    expect(evidence.kind).toBe('workflow.evidence')
    expect(gate.kind).toBe('workflow.gate')
    expect(action.kind).toBe('workflow.action')
  })

  it('only the evidence pin is stable under appended evidence', () => {
    expect(evidence).not.toHaveProperty('evidence')
    expect(gate).toHaveProperty('evidence')      // moves when a row is appended
    expect(action).toHaveProperty('evidence')
  })
})

// ── D. content_generation regression ───────────────────────────────────────

describe('D — content_generation, the state 2099-01 is sitting in', () => {
  it('really does declare exactly one REQUIRED check', () => {
    const req = declared().filter(c => c.state === STATE && c.required)
    expect(req.map(c => c.check_key)).toEqual([CHECK])
    expect(req[0].allowed_provenance).toEqual(['attested'])
  })

  it('a correctly bound PASS is recognised as current and satisfying', () => {
    const r = row(); const bound = { ...r, target_hash: pinFor(r) }
    const v = verdictFor([bound])
    expect(v.binding).toBe('current')
    expect(v.satisfies).toBe(true)
  })

  it('MUTATION — the same PASS judged against the GATE pin reads stale', () => {
    // Exactly the production defect: the row is perfect, the pin is the wrong kind.
    const r = row(); const bound = { ...r, target_hash: pinFor(r) }
    const gateHash = 'g'.repeat(64)
    const v = summarizeStateEvidence(declared(), STATE, [bound] as never, () => gateHash)
      .verdicts.find(x => x.check_key === CHECK)!
    expect(v.satisfaction).toBe('stale')
    expect(v.satisfies).toBe(false)
  })

  it('unbound PASS is refused', () => {
    const v = verdictFor([row({ target_hash: null })])
    expect(v.satisfaction).toBe('unbound')
    expect(v.satisfies).toBe(false)
  })

  it('stale PASS is refused', () => {
    const v = verdictFor([row({ target_hash: 'b'.repeat(64) })])
    expect(v.satisfaction).toBe('stale')
    expect(v.satisfies).toBe(false)
  })

  it('missing evidence is refused', () => {
    const v = verdictFor([])
    expect(v.satisfaction).toBe('absent')
    expect(v.satisfies).toBe(false)
  })

  it('bound BLOCKED and bound FAIL do not satisfy', () => {
    for (const [result, satisfaction] of [['blocked', 'blocked'], ['fail', 'failed']]) {
      const r = row({ result }); const bound = { ...r, target_hash: pinFor(r) }
      const v = verdictFor([bound])
      expect(v.binding).toBe('current')
      expect(v.satisfaction).toBe(satisfaction)
      expect(v.satisfies).toBe(false)
    }
  })

  it('wrong provenance is refused even when bound and passing', () => {
    // story_page_count accepts `attested` only; an automated row cannot speak.
    const r = row({ source: 'automated', producer: null, producer_type: null, payload_hash: null })
    const bound = { ...r, target_hash: pinFor(r) }
    const v = verdictFor([bound])
    expect(v.satisfaction).toBe('provenance_refused')
    expect(v.satisfies).toBe(false)
  })

  it('provenance is load-bearing in the pin itself', () => {
    // A different source_commit is a different target: rebuilding invalidates.
    const r = row()
    const other = { ...r, attestation: { ...r.attestation, source_commit: 'different' } }
    expect(pinFor(other)).not.toBe(pinFor(r))
  })

  it('planning now has exactly one required check — the brief, added in Phase 2A', () => {
    // HISTORY, unchanged: when PR9g advanced planning, the state declared no
    // required check at all, which is why that advance succeeded despite the
    // bug this file is about. Phase 2A made planning blockable for the first
    // time, so the assertion records the new shape rather than the old count.
    // The live 2099-01 instance is unaffected: it left planning long before,
    // and required checks gate only the state a workflow is advancing OUT of.
    const req = declared().filter(c => c.state === 'planning' && c.required)
    expect(req.map(c => c.check_key)).toEqual(['monthly_brief_composed'])
  })
})

// ── B. the complete reader inventory ───────────────────────────────────────

const READERS = [
  'lib/workflows/tick.ts',
  'lib/workflows/action-run.ts',
  'lib/workflows/action-scheduling.ts',
  'lib/workflows/advance.ts',
  // PR9i. Added here because the inventory guard below refused to pass without
  // it — which is precisely what that guard is for.
  'lib/workflows/advance-completed.ts',
  'app/(platform)/releases/page.tsx',
] as const

describe('B — every workflow evidence reader, pinned', () => {
  const sources = () => READERS.map(f => [f, readFileSync(join(process.cwd(), f), 'utf8')] as const)

  it('the inventory is COMPLETE — no sixth reader exists', () => {
    // Regenerate the list from the repository rather than trusting this file.
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync(
      `grep -rln "summarizeStateEvidence(\\|evaluateCheck(" lib app --include=*.ts --include=*.tsx || true`,
      { cwd: process.cwd(), encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
      .filter(f => !f.startsWith('lib/qa/'))
      .filter(f => f !== 'lib/workflows/evidence-consumption.ts')   // the evaluator itself
      .sort()
    expect(hits).toEqual([...READERS].sort())
  })

  it('every reader uses the shared evidence-target helper', () => {
    for (const [file, src] of sources()) {
      expect(src, `${file} must use evidenceTargetHashFor`).toMatch(/evidenceTargetHashFor\(/)
    }
  })

  it('MUTATION — no reader may pin evidence to a gate or action target', () => {
    for (const [file, src] of sources()) {
      expect(src, `${file} must not use a gate hash as an evidence pin`)
        .not.toMatch(/summarizeStateEvidence\([\s\S]{0,240}gate\.target/)
      expect(src, `${file} must not use an action hash as an evidence pin`)
        .not.toMatch(/summarizeStateEvidence\([\s\S]{0,240}\(\)\s*=>\s*target\.versionHash/)
    }
  })

  it('MUTATION — no reader may invent a bespoke pin or a caller-supplied one', () => {
    for (const [file, src] of sources()) {
      // computeEvidenceTargetHash is legitimate ONLY inside the shared helper.
      expect(src, `${file} must not recompute the pin inline`)
        .not.toMatch(/computeEvidenceTargetHash\(/)
      expect(src).not.toMatch(/summarizeStateEvidence\([\s\S]{0,240}targetHash:\s*input\./)
    }
  })

  it('MUTATION — no reader may decide satisfaction from a raw column', () => {
    for (const [file, src] of sources()) {
      expect(src, `${file} must not filter evidence by raw result`)
        .not.toMatch(/\.eq\('result',\s*'pass'\)/)
    }
  })

  it('the shared helper is the only place the pin is computed', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync(
      `grep -rln "computeEvidenceTargetHash(" lib app --include=*.ts --include=*.tsx || true`,
      { cwd: process.cwd(), encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
      .filter(f => !f.startsWith('lib/qa/'))
      .sort()
    // The helper, the definition, and the attested-evidence route (which binds
    // at submission time and has no rows to read).
    expect(hits).toEqual([
      'app/api/workflows/evidence/route.ts',
      'lib/workflows/attestation.ts',
      'lib/workflows/evidence-binding.ts',
    ])
  })
})

// ── C. human gate safety: neither half substitutes for the other ───────────

describe('C — authorization and evidence are independent requirements', () => {
  const src = readFileSync(join(process.cwd(), 'lib/workflows/advance.ts'), 'utf8')

  it('a gated state still demands a live grant', () => {
    expect(src).toMatch(/systemDeriveWorkflowGate\(db, instance\.id/)
    expect(src).toMatch(/!gate\.canAdvance \|\| gate\.status !== 'authorized' \|\| !gate\.authorizationId/)
    expect(src).toMatch(/outcome: 'not_authorized'/)
  })

  it('MUTATION — authorization cannot bypass missing required evidence', () => {
    // The evidence block sits AFTER the grant check and returns before the append.
    const authIdx = src.indexOf("outcome: 'not_authorized'")
    const evidenceIdx = src.indexOf("outcome: 'evidence_incomplete'")
    const appendIdx = src.indexOf('await appendTransition(')
    expect(authIdx).toBeLessThan(evidenceIdx)
    expect(evidenceIdx).toBeLessThan(appendIdx)
    expect(src).toMatch(/A grant does not override evidence/)
    // Position alone survives `if (false)`, so pin the guard itself. Comments
    // stripped: this must fire on code, never on prose describing the rule.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).toMatch(/if \(unmet\.length > 0\) \{/)
    expect(code).not.toMatch(/if \(false\)/)
    expect(code).not.toMatch(/if \(true\)/)
  })

  it('MUTATION — unmet is derived from canonical verdicts, not a raw column', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // The exact derivation. A raw-column reimplementation replaces this line.
    expect(code).toMatch(
      /const unmet = summary\.verdicts\.filter\(v => required\.includes\(v\.check_key\) && !v\.satisfies\)/)
    // And no shape of raw result comparison may appear anywhere in the module.
    for (const raw of [/\.result === 'pass'/, /\.result == 'pass'/, /result:\s*'pass'/,
                       /\.eq\('result'/]) {
      expect(code).not.toMatch(raw)
    }
  })

  it('MUTATION — evidence cannot bypass required authorization', () => {
    expect(src).toMatch(/authorizationId: gate\.authorizationId,/)
    expect(src).not.toMatch(/authorizationId: null[\s\S]{0,80}appendTransition/)
    // And the ungated case is refused outright rather than advanced.
    expect(src).toMatch(/state\.human_gate\.required !== true/)
    expect(src).toMatch(/outcome: 'not_gated'/)
  })

  it('the system verifier is still used, and the SQL re-validates', () => {
    expect(src).toMatch(/verifyAuthorization: systemAuthorizationVerifier/)
    expect(src).toMatch(/SQL re-validates the grant independently/)
  })

  it('there is still no force flag and no caller-supplied gate state', () => {
    // Comments STRIPPED: the header explains that no force flag exists, and a
    // guard that fires on the prose describing the danger tests nothing. The
    // assertion is tightened to real code shapes rather than relaxed.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const forbidden of [
      /\bforce\b\s*[:=?]/,           // a force option or property
      /options\.force/, /input\.force/,
      /gateStatus\s*[:=]/, /skipEvidence/, /overrideEvidence/,
      /authorizationId\s*:\s*options\./,
    ]) {
      expect(code).not.toMatch(forbidden)
    }
    // The options bag admits exactly two fields, neither of them a bypass.
    const opts = code.slice(code.indexOf('options: {'), code.indexOf('} = {}') + 5)
    expect(opts).toMatch(/now\?: string/)
    expect(opts).toMatch(/ledger\?: LedgerReader/)
    expect(opts.split(';').filter(x => x.includes('?:'))).toHaveLength(2)
  })
})
