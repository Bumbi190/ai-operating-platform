/**
 * G3C-2A — the ADMISSION inventory.
 *
 * `claim_runs` is only the authoritative run-admission boundary if it is the
 * ONLY way a pending run becomes executable. A hardcoded list of functions to
 * audit is exactly how G3C-2B let step3 slip through for a whole review round,
 * so the set is derived from source and re-derived on every run.
 *
 * The invariant: no runtime module may move a run into `running`, and no runtime
 * module may claim a due workflow instance, outside the canonical RPCs.
 */

import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const runtimeFiles = (): string[] =>
  execSync(
    "find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts' " +
    "-not -name 'database.types.ts'",
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)

const code = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ')

describe('G3C-2A · run admission has exactly one door', () => {
  it('no runtime module writes runs.status = running directly', () => {
    // Admission is a governance decision taken under lock inside claim_runs. A
    // TypeScript update that sets `running` would bypass both stop authorities
    // no matter how careful the surrounding code is.
    const offenders = runtimeFiles().filter(rel => {
      const b = code(rel)
      if (!/\.from\(\s*['"]runs['"]\s*\)/.test(b)) return false
      return /\.update\(\s*\{[^}]*status:\s*['"]running['"]/.test(b)
    })
    expect(offenders, 'only public.claim_runs may admit a run').toEqual([])
  })

  it('the drain is the only caller, and it goes through the canonical RPC', () => {
    const callers = runtimeFiles().filter(rel => /rpc\(\s*['"]claim_runs['"]/.test(code(rel)))
    expect(callers, 'run admission enters through one door')
      .toEqual(['app/api/runs/drain/route.ts'])
  })

  it('no runtime module claims a due workflow instance outside the RPC', () => {
    // Setting wake_at is CONTROL (scheduling). Taking ownership of a due
    // instance — stamping last_tick_at as part of selecting it — is admission.
    const offenders = runtimeFiles().filter(rel => {
      const b = code(rel)
      if (!/\.from\(\s*['"]workflow_instances['"]\s*\)/.test(b)) return false
      return /\.update\(\s*\{[^}]*last_tick_at/.test(b)
    })
    expect(offenders, 'only public.workflow_claim_due may claim a due instance').toEqual([])
  })

  it('queueing a run remains open — it is control-plane state, not execution', () => {
    // The counterpart invariant. If this ever returns nothing, someone has
    // gated run CREATION on a stop, which would prevent an operator staging
    // work for after the resume and is NOT what G3C-2A decided.
    const creators = runtimeFiles().filter(rel =>
      /\.from\(\s*['"]runs['"]\s*\)/.test(code(rel)) && /\.insert\(/.test(code(rel)))
    expect(creators.length, 'runs are still created by ordinary application code')
      .toBeGreaterThan(0)
  })
})
