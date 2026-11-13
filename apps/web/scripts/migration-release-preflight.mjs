import { readdirSync, lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateMigrationRelease, REVIEWED_OBSERVATION_SHA256 } from './migration-release-policy.mjs'

/** Deliberately has no executor callback, shell, SQL client, credentials, network,
 * apply, repair or success-token API. A successful check is not release authority.
 * A future apply integration needs its own approval and live target/ledger/source
 * revalidation at the actual mutation boundary; this snapshot cannot provide it.
 */
export function runMigrationReleasePreflight(input) {
  return { ...evaluateMigrationRelease(input), allowsMutation: false, mode: 'read-only-preflight' }
}

function parseArguments(argv) {
  const allowed = new Set(['--target-project', '--target-database', '--observation-file', '--plan-file', '--expected-head'])
  const args = new Map()
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1]
    if (!allowed.has(flag) || args.has(flag) || typeof value !== 'string' || value.startsWith('--')) throw new Error('INVALID_ARGUMENTS')
    args.set(flag, value)
  }
  if (!args.has('--target-project') || !args.has('--target-database')) throw new Error('TARGET_REQUIRED')
  if (!args.has('--expected-head')) throw new Error('EXPECTED_HEAD_REQUIRED')
  return args
}
function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}
function inputPathSnapshot(file) {
  const entries = []
  for (let current = resolve(file);;) {
    const stat = lstatSync(current, { bigint: true })
    if (stat.isSymbolicLink() || (entries.length === 0 ? !stat.isFile() : !stat.isDirectory())) throw new Error('INVALID_INPUT_FILE')
    entries.push({ path: current, stat })
    const parent = dirname(current)
    if (parent === current) return entries
    current = parent
  }
}
function readBounded(file) {
  // Open once; every byte and content check uses this descriptor, never a re-opened path.
  // O_NOFOLLOW is unavailable on Windows, so path/descriptor identity is also checked
  // before and after reading, including parent links and junctions on every platform.
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const before = fstatSync(fd, { bigint: true })
    if (!before.isFile() || before.ino === 0n || before.nlink !== 1n || before.size > 5n * 1024n * 1024n) throw new Error('INVALID_INPUT_FILE')
    const pathsBefore = inputPathSnapshot(file)
    if (!sameFile(before, pathsBefore[0].stat)) throw new Error('INVALID_INPUT_FILE')
    // One extra byte detects growth without an unbounded read or allocation.
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length)
      if (count === 0) break
      length += count
    }
    const after = fstatSync(fd, { bigint: true })
    const pathsAfter = inputPathSnapshot(file)
    if (BigInt(length) !== before.size || !sameFile(before, after) ||
        !sameFile(after, pathsAfter[0].stat) || pathsBefore.length !== pathsAfter.length ||
        pathsBefore.some((entry, i) => entry.path !== pathsAfter[i].path ||
          entry.stat.dev !== pathsAfter[i].stat.dev || entry.stat.ino !== pathsAfter[i].stat.ino)) {
      throw new Error('INVALID_INPUT_FILE')
    }
    return bytes.subarray(0, length).toString('utf8')
  } finally {
    closeSync(fd)
  }
}
function main(argv) {
  // Reject extra commands and override flags before reading any input or running Git.
  const args = parseArguments(argv)
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repoRoot = resolve(appRoot, '../..')
  const git = argv => execFileSync('git', ['-C', repoRoot, ...argv], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }).trim()
  const origin = git(['remote', 'get-url', 'origin'])
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)Bumbi190\/ai-operating-platform(?:\.git)?$/.test(origin)) throw new Error('REPOSITORY_MISMATCH')
  const observationPath = args.get('--observation-file') ?? resolve(repoRoot, 'docs/verification/web-studio/2026-11-12-migration-version-audit.json')
  const observation = JSON.parse(readBounded(resolve(observationPath)))
  const migrationsDir = resolve(appRoot, 'supabase/migrations')
  const files = readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).map(file => ({ file, sql: readBounded(resolve(migrationsDir, file)) }))
  const requestedMigrations = args.has('--plan-file') ? JSON.parse(readBounded(resolve(args.get('--plan-file')))) : []
  const result = runMigrationReleasePreflight({
    observation, trustedObservationSha256: REVIEWED_OBSERVATION_SHA256,
    files, currentHead: git(['rev-parse', 'HEAD']), expectedHead: args.get('--expected-head'), now: Date.now(), requestedMigrations,
    target: { projectId: args.get('--target-project'), databaseName: args.get('--target-database') },
  })
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exitCode = result.ok ? 0 : 1
}
const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  try { main(process.argv.slice(2)) } catch (error) {
    // Do not print input contents, command strings, credentials or environment values.
    const code = ['INVALID_ARGUMENTS', 'TARGET_REQUIRED', 'EXPECTED_HEAD_REQUIRED', 'INVALID_INPUT_FILE', 'REPOSITORY_MISMATCH'].includes(error?.message) ? error.message : 'INPUT_READ_FAILED'
    process.stdout.write(JSON.stringify({ ok: false, allowsMutation: false, issues: [{ code }], pending: [], mode: 'read-only-preflight' }) + '\n')
    process.exitCode = 2
  }
}
