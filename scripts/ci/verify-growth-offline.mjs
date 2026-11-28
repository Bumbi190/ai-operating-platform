import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

// These native Node contracts are intentionally outside the Vitest collection.
const required = {
  'creative-quality-advisory.node.test.mjs': 16,
  'growth-dashboard-advisory.node.test.mjs': 9,
  'growth-dashboard-presentation.node.test.mjs': 7,
  'instagram-observation-quality.node.test.mjs': 17,
  'manual-experiment-advisory.node.test.mjs': 11,
  'reference-format-observations.node.test.mjs': 13,
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = process.env.GROWTH_OFFLINE_RESULT_DIR
if (output) fs.mkdirSync(output, { recursive: true })
const results = []
for (const [file, floor] of Object.entries(required)) {
  const source = path.join(root, 'apps/web/lib/qa', file)
  assert(fs.existsSync(source), 'Missing native Growth contract: ' + file)
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', '--test-reporter=tap', source], {
    cwd: root, env: process.env, encoding: 'utf8', windowsHide: true,
    timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  })
  const tap = run.stdout ?? ''
  if (output) {
    fs.writeFileSync(path.join(output, file + '.tap'), tap)
    fs.writeFileSync(path.join(output, file + '.stderr.txt'), run.stderr ?? '')
  }
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const matches = [...tap.matchAll(new RegExp('^# ' + key + ' ([0-9]+)\\r?$', 'gm'))]
    return [key, matches.length === 1 ? Number(matches[0][1]) : null]
  }))
  const pass = run.status === 0 && !run.error && counts.tests >= floor &&
    counts.pass === counts.tests && ['fail', 'cancelled', 'skipped', 'todo'].every(key => counts[key] === 0)
  results.push({ file, floor, ...counts, exit: run.status, error: run.error?.code ?? null, pass })
  console.log(JSON.stringify(results.at(-1)))
  if (!pass && run.stderr) console.error(run.stderr.slice(-4000))
}
const report = { files: results.length, passed: results.reduce((n, r) => n + (r.pass ? r.tests : 0), 0), results,
  pass: results.length === 6 && results.every(r => r.pass) }
if (output) fs.writeFileSync(path.join(output, 'growth-offline-results.json'), JSON.stringify(report, null, 2) + '\n')
assert(report.pass, 'Native Growth contracts failed, skipped, timed out, or did not reach their per-file floor')
console.log('Native Growth contracts: ' + report.passed + ' passed across six files')
