import { it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
it('real_isolated_SQL_privileges_parity_and_concurrency_no_skips', () => {
  const r = spawnSync(process.execPath, [resolve('scripts/verify-analysis-drafts-local.mjs')], {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 4 * 1024 * 1024,
  })
  expect(r.status, r.stdout + '\n' + r.stderr).toBe(0)
  expect(r.stdout).toContain('SQL GATE PASS')
  expect(r.stdout).toContain('same-evidence: 12 sessions, one created')
  expect(r.stdout).toContain('parity: 9 exact encodings')
}, 250000)
