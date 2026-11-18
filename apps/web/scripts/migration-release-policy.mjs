import { createHash } from 'node:crypto'
import { migrationNameFromFile } from './migration-guard-policy.mjs'

/** Complements Guard v2's name-set checks; never weakens its frozen policy.
 * This is a read-only planning boundary, NOT an apply/repair runner or token issuer.
 * The pin is reviewed code, separate from the observation. A self-declared digest,
 * source label, historical exception, or build override cannot replace that pin.
 */
export const REVIEWED_OBSERVATION_SHA256 = 'c7b96a8d7368e01af5eb5182e198235415be76a507f641d294481f64e2dc68d7'
const REPOSITORY = 'Bumbi190/ai-operating-platform'
const MAX_AGE_MS = 15 * 60 * 1000
const SHA = /^[a-f0-9]{64}$/
const HEAD = /^[a-f0-9]{40}$/
const VERSION = /^[0-9]{14}$/
const NAME = /^[a-z0-9_]+$/
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = value => createHash('sha256').update(value).digest('hex')
const sqlDigest = sql => digest(sql.replace(/\r\n/g, '\n'))

export function evaluateMigrationRelease({
  observation, trustedObservationSha256, files, target, currentHead, expectedHead,
  now = Date.now(), requestedMigrations = [],
} = {}) {
  const issues = []
  const add = (code, details = {}) => issues.push({ code, ...details })
  const finish = (pending = []) => ({ ok: issues.length === 0, allowsMutation: false, issues, pending })
  let observationDigest
  try { observationDigest = digest(JSON.stringify(observation)) } catch { /* invalid inputs fail below */ }
  if (!SHA.test(trustedObservationSha256 ?? '') || observationDigest !== trustedObservationSha256) add('UNTRUSTED_OBSERVATION')
  if (!record(observation) || observation.schemaVersion !== 1 ||
      observation.purpose !== 'read-only-audit-not-release-authority' ||
      !['ledger', 'sourceManifest', 'verifiedSqlEquivalences', 'approvedPending'].every(key =>
        Array.isArray(observation[key]) && observation[key].length <= 10000)) {
    add('INVALID_OBSERVATION'); return finish()
  }
  if (observation.repository !== REPOSITORY) add('REPOSITORY_MISMATCH')
  // Capture provenance is not the commit containing its own observation/pin.
  // An external, reviewed checkout pin avoids a self-referential Git commit.
  // No ancestry relationship is claimed; the complete SQL manifest is checked below.
  if (!HEAD.test(currentHead ?? '') || !HEAD.test(expectedHead ?? '') ||
      !HEAD.test(observation.sourceHead ?? '') || currentHead !== expectedHead) add('HEAD_MISMATCH')
  if (!record(target) || !record(observation.target) ||
      !/^[a-z]{20}$/.test(target.projectId ?? '') || !/^[a-z][a-z0-9_]{0,62}$/.test(target.databaseName ?? '') ||
      target.projectId !== observation.target.projectId || target.databaseName !== observation.target.databaseName) add('TARGET_MISMATCH')
  const provenance = observation.provenance
  if (!record(provenance) || provenance.method !== 'supabase.execute_sql/read-only' ||
      provenance.projectId !== observation.target?.projectId ||
      provenance.sqlHashFormat !== 'sha256-utf8-statements-joined-with-lf') add('UNTRUSTED_PROVENANCE')
  const capturedAt = typeof observation.observedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(observation.observedAt)
    ? Date.parse(observation.observedAt) : NaN
  if (!Number.isFinite(now)) add('INVALID_CLOCK')
  if (!Number.isFinite(capturedAt)) add('INVALID_OBSERVATION_TIME')
  else if (Number.isFinite(now)) {
    if (capturedAt > now + 5000) add('FUTURE_OBSERVATION')
    if (now - capturedAt > MAX_AGE_MS) add('STALE_OBSERVATION')
  }
  if (!Array.isArray(files) || files.length > 10000 || !Array.isArray(requestedMigrations) || requestedMigrations.length > 10000) {
    add('INVALID_INPUT'); return finish()
  }

  const source = []
  for (const entry of files) {
    if (!record(entry) || typeof entry.file !== 'string' || typeof entry.sql !== 'string' || /[\\/]/.test(entry.file)) {
      add('INVALID_SOURCE_FILE'); continue
    }
    let name
    try { name = migrationNameFromFile(entry.file) } catch { add('INVALID_SOURCE_FILE', { file: entry.file }); continue }
    const version = entry.file.slice(0, entry.file.indexOf('_'))
    if (!VERSION.test(version)) add('INVALID_SOURCE_VERSION', { file: entry.file, version })
    source.push({ file: entry.file, name, version, sha256: sqlDigest(entry.sql) })
  }
  const ledger = []
  for (const row of observation.ledger) {
    if (!record(row) || !VERSION.test(row.version ?? '') || !NAME.test(row.name ?? '') || !Number.isInteger(row.statementCount) || row.statementCount < 0) {
      add('INVALID_LEDGER_ROW'); continue
    }
    if (!SHA.test(row.rawSha256 ?? '') || row.statementCount === 0) add('MISSING_SQL_HASH', { name: row.name })
    ledger.push(row)
  }
  const unique = (rows, field, code) => {
    const groups = new Map()
    for (const row of rows) groups.set(row[field], [...(groups.get(row[field]) ?? []), row])
    for (const [value, group] of groups) if (group.length > 1) add(code, { value, files: group.map(row => row.file).filter(Boolean) })
  }
  unique(source, 'version', 'DUPLICATE_SOURCE_VERSION')
  unique(source, 'name', 'DUPLICATE_SOURCE_NAME')
  unique(ledger, 'version', 'DUPLICATE_LEDGER_VERSION')
  unique(ledger, 'name', 'DUPLICATE_LEDGER_NAME')

  const manifest = new Map()
  for (const row of observation.sourceManifest) {
    if (!record(row) || typeof row.file !== 'string' || !SHA.test(row.sha256 ?? '') || manifest.has(row.file)) {
      add('INVALID_SOURCE_MANIFEST'); continue
    }
    manifest.set(row.file, row.sha256)
  }
  for (const row of source) {
    if (!manifest.has(row.file)) add('SOURCE_UNKNOWN', { file: row.file })
    else if (manifest.get(row.file) !== row.sha256) add('SOURCE_HASH_MISMATCH', { file: row.file })
  }
  for (const file of manifest.keys()) if (!source.some(row => row.file === file)) add('SOURCE_MISSING', { file })
  const equivalents = observation.verifiedSqlEquivalences.filter(row => {
    if (!record(row) || !NAME.test(row.name ?? '') || !VERSION.test(row.version ?? '') ||
        !SHA.test(row.ledgerRawSha256 ?? '') || !SHA.test(row.sourceLfSha256 ?? '')) {
      add('INVALID_SQL_EQUIVALENCE'); return false
    }
    return true
  })
  const approved = []
  for (const row of observation.approvedPending) {
    if (!record(row) || !NAME.test(row.name ?? '') || !VERSION.test(row.version ?? '') || !SHA.test(row.sha256 ?? '')) {
      add('INVALID_PENDING_APPROVAL'); continue
    }
    approved.push(row)
  }
  unique(approved, 'version', 'DUPLICATE_PENDING_VERSION')
  unique(approved, 'name', 'DUPLICATE_PENDING_NAME')
  const latest = ledger.reduce((last, row) => row.version > last ? row.version : last, '')
  for (const row of source) {
    const remote = ledger.find(item => item.name === row.name)
    const versionOwner = ledger.find(item => item.version === row.version)
    if (versionOwner && versionOwner.name !== row.name) add('VERSION_NAME_COLLISION', { file: row.file, version: row.version, name: row.name })
    if (remote) {
      if (remote.version !== row.version) add('VERSION_MISMATCH', { file: row.file, name: row.name, sourceVersion: row.version, ledgerVersion: remote.version })
      // Only exact SQL hashes or individually reviewed, pinned byte variants count.
      if (SHA.test(remote.rawSha256 ?? '') && remote.rawSha256 !== row.sha256 && !equivalents.some(eq =>
        eq.name === row.name && eq.version === remote.version && eq.ledgerRawSha256 === remote.rawSha256 && eq.sourceLfSha256 === row.sha256)) {
        add('SQL_HASH_MISMATCH', { file: row.file, name: row.name })
      }
    } else if (!approved.some(item => item.name === row.name && item.version === row.version && item.sha256 === row.sha256)) {
      add('MISSING_LEDGER_MIGRATION', { file: row.file, name: row.name })
    }
  }
  for (const row of ledger) if (!source.some(item => item.name === row.name)) add('REMOTE_ONLY_MIGRATION', { name: row.name, version: row.version })
  for (const row of approved) {
    if (ledger.some(item => item.name === row.name || item.version === row.version)) add('ALREADY_APPLIED', { name: row.name, version: row.version })
    if (row.version <= latest) add('PENDING_NOT_APPEND_ONLY', { name: row.name, version: row.version })
    if (!source.some(item => item.name === row.name && item.version === row.version && item.sha256 === row.sha256)) add('PENDING_SOURCE_MISSING', { name: row.name })
  }
  const requested = []
  for (const row of requestedMigrations) {
    if (!record(row) || !NAME.test(row.name ?? '') || !VERSION.test(row.version ?? '')) { add('INVALID_PENDING_PLAN'); continue }
    requested.push({ name: row.name, version: row.version })
    if (ledger.some(item => item.name === row.name || item.version === row.version)) add('ALREADY_APPLIED', { name: row.name, version: row.version })
    if (!approved.some(item => item.name === row.name && item.version === row.version)) add('UNAPPROVED_PENDING', { name: row.name, version: row.version })
  }
  unique(requested, 'name', 'DUPLICATE_PLAN_NAME')
  unique(requested, 'version', 'DUPLICATE_PLAN_VERSION')
  if (requested.length !== approved.length || approved.some(row => !requested.some(item => item.name === row.name && item.version === row.version))) add('PENDING_PLAN_MISMATCH')
  return finish(approved.map(({ name, version }) => ({ name, version })))
}
