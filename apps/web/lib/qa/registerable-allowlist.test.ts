/**
 * PR9h-1 — which definitions an operator may register.
 *
 * The allowlist is a closed literal list rather than "anything the loader
 * knows". The loader is driven by imports, so a wildcard would mean any future
 * file added to `definitions/` becomes registerable in production the moment it
 * merges. Naming each one keeps that a decision.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadVendoredDefinitions } from '../workflows/definitions'

const route = readFileSync(join(process.cwd(), 'app/api/workflows/admin/route.ts'), 'utf8')
const routeCode = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** The predicate the route uses, reproduced from the shipped literal list. */
const REGISTERABLE = (() => {
  // Search for the terminator FROM the array's own start — `ACTIONS` above it
  // also ends in `] as const`.
  const start = routeCode.indexOf('const REGISTERABLE = [')
  const block = routeCode.slice(start, routeCode.indexOf('] as const', start))
  return [...block.matchAll(/'([^']+)'/g)].map(m => m[1])
})()

/**
 * The register branch, bounded by CODE. The `// ── create_instance ──` marker is
 * a comment, and these guards read comment-stripped source.
 */
const registerBranch = (() => {
  const start = routeCode.indexOf("if (action === 'register_definition')")
  // Bounded at the NEXT action branch — slicing to `const projectId` ran past
  // schedule_readonly_evaluation and swept in its body reads.
  const next = routeCode.indexOf('if (action ===', start + 10)
  return routeCode.slice(start, next > -1 ? next : undefined)
})()

// ── The allowlist itself ────────────────────────────────────────────────────

describe('the allowlist names exactly two definitions', () => {
  it('both, and nothing else', () => {
    expect(REGISTERABLE.sort()).toEqual([
      'familje-stunden.monthly-release', 'omnira.probe-validation',
    ])
  })

  it('MUTATION — it is a closed literal, never derived from the loader', () => {
    // `loadVendoredDefinitions().map(d => d.def_key)` would silently enrol every
    // future definition file.
    expect(routeCode).toMatch(/const REGISTERABLE = \[/)
    expect(routeCode).toMatch(/\] as const/)
    expect(routeCode).not.toMatch(/loadVendoredDefinitions\(\)[\s\S]{0,80}REGISTERABLE/)
    expect(routeCode).not.toMatch(/REGISTERABLE[^\n]*(map|filter|from|\.\.\.)/)
  })

  it('MUTATION — no wildcard or pattern match', () => {
    expect(routeCode).not.toMatch(/startsWith\(|endsWith\(|RegExp|\.test\(|includes\(defKey\)/)
    expect(routeCode).toMatch(/function isRegisterable/)
  })

  it('every allowlisted key resolves to a real vendored definition', () => {
    const known = loadVendoredDefinitions().map(d => d.def_key)
    for (const k of REGISTERABLE) expect(known, k).toContain(k)
  })
})

// ── Fail closed ─────────────────────────────────────────────────────────────

describe('anything unnamed is refused', () => {
  const isRegisterable = (v: unknown) =>
    typeof v === 'string' && REGISTERABLE.includes(v)

  it('MUTATION — arbitrary keys, paths and traversals are rejected', () => {
    for (const bad of [
      'anything.at.all',
      'omnira.probe-validation.v1',                 // near-miss
      'OMNIRA.PROBE-VALIDATION',                    // case
      ' omnira.probe-validation',                   // whitespace
      '../../etc/passwd',
      'lib/workflows/definitions/omnira.probe-validation.v1.json',
      './omnira.probe-validation',
      '*', '', 'familje-stunden',                   // prefix of a real key
    ]) {
      expect(isRegisterable(bad), bad).toBe(false)
    }
  })

  it('non-string defKey is rejected before anything else', () => {
    for (const bad of [null, undefined, 42, true, {}, ['omnira.probe-validation']]) {
      expect(isRegisterable(bad)).toBe(false)
    }
    expect(routeCode).toMatch(/if \(!isRegisterable\(body\.defKey\)\) return badRequest\('defKey'\)/)
  })

  it('the guard precedes every read and write in the branch', () => {
    expect(registerBranch.indexOf('isRegisterable(body.defKey)'))
      .toBeLessThan(registerBranch.indexOf('registerVendoredDefinition'))
  })
})

// ── The caller names a key and nothing else ─────────────────────────────────

describe('no content, path or hash may be supplied', () => {
  const branch = registerBranch

  it('MUTATION — the route reads only defKey and version from the body', () => {
    const reads = [...branch.matchAll(/body\.(\w+)/g)].map(m => m[1])
    expect([...new Set(reads)].sort()).toEqual(['defKey', 'version'])
  })

  it('MUTATION — no spec, hash, path or raw content is accepted', () => {
    for (const f of ['spec', 'def_hash', 'defHash', 'source_path', 'sourcePath',
                     'raw', 'states', 'provenance', 'content']) {
      expect(branch).not.toContain(`body.${f}`)
    }
  })

  it('registration goes through the vendored loader, not the request', () => {
    expect(branch).toMatch(/registerVendoredDefinition\(db, defKey, version\)/)
  })
})

// ── Registration side effects ───────────────────────────────────────────────

describe('registration creates a definition row and nothing else', () => {
  const branch = registerBranch

  it('MUTATION — no instance, run, evidence or schedule', () => {
    for (const f of [/instantiate\(/, /from\('runs'\)/, /recordEvidence/,
                     /scheduleWorkflowWake/, /wake_at/, /createWorkflowActionRun/]) {
      expect(branch).not.toMatch(f)
    }
  })

  it('immutability is still the store\'s, unchanged', () => {
    const store = readFileSync(join(process.cwd(), 'lib/workflows/store.ts'), 'utf8')
    // Same version + different content THROWS rather than rewriting.
    expect(store).toMatch(/is already registered with a different def_hash/)
    expect(store).toMatch(/A definition change must be registered as a NEW VERSION, never as an edit/)
    // Idempotent on an identical repeat.
    expect(store).toMatch(/return \{ def: existing, created: false \}/)
  })
})

// ── The definition it unlocks ───────────────────────────────────────────────

describe('omnira.probe-validation is what gets registered', () => {
  const def = () => loadVendoredDefinitions().find(d => d.def_key === 'omnira.probe-validation')!

  it('has the exact expected def_hash', () => {
    expect(def().def_hash)
      .toBe('1334a614bb32d9a7db513e3e1194e3c77e1f5e2cc65d01f1f54c1920b5cf9a84')
  })

  it('is authored_here, two states, no gate', () => {
    expect(def().provenance).toBe('authored_here')
    expect(def().spec.states.map(s => s.id)).toEqual(['probe', 'complete'])
    expect(def().spec.states.every(s => s.human_gate.required === false)).toBe(true)
  })

  it('the Familje-Stunden definition is untouched by this change', () => {
    const fs = loadVendoredDefinitions().find(d => d.def_key === 'familje-stunden.monthly-release')!
    expect(fs.def_hash).toBe('eef18502d2de6aa9017b63a7b174f00638fd3dbc9ae74575d13f3040b0dd5f2c')
    expect(fs.provenance).toBe('vendored_upstream')
  })
})
