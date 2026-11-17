import { createHash } from 'node:crypto'
import { evaluateAppliedMigrationLedger, REFERENCED_LEDGER_MIGRATIONS } from './migration-guard-policy.mjs'

// Pure verifier model. No fetch, credentials, signing, SQL execution or deployment.
// verifyOrigin MUST be supplied by a separately pinned, trusted CI verifier.
// PR-provided JSON flags or a PR-provided trust configuration are not provenance.
export const MAX_ATTESTATION_AGE_SECONDS = 300
export const LEDGER_EXPORT_QUERY = "SELECT version,name,encode(sha256(convert_to(replace(array_to_string(statements,E'\\n'),E'\\r\\n',E'\\n'),'UTF8')),'hex') AS sql_sha256 FROM supabase_migrations.schema_migrations WHERE name IS NOT NULL ORDER BY name,version;"
const mintedGuards = new WeakSet()
const SHA = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const deny = () => { throw new Error('migration-guard: attestation verification failed (fail-closed)') }
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
  deny()
}
function parse(raw) {
  if (typeof raw !== 'string' || raw.length > 250000) deny()
  const body = JSON.parse(raw)
  if (canonicalJson(body) !== raw) deny() // Includes duplicate JSON-key rejection.
  return body
}
function fresh(body, now) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(body.issuedAt) || !Number.isSafeInteger(body.expiresAt) ||
      body.issuedAt > now || body.expiresAt <= now || body.expiresAt <= body.issuedAt ||
      body.expiresAt - body.issuedAt > MAX_ATTESTATION_AGE_SECONDS ||
      now - body.issuedAt > MAX_ATTESTATION_AGE_SECONDS) deny()
}
function contextOk(c) {
  if (!c || !COMMIT.test(c.sourceSha) || c.checkoutSha !== c.sourceSha ||
      !SHA.test(c.sourceDigest) || !SHA.test(c.policyDigest) || !SHA.test(c.artifactDigest) ||
      typeof c.runId !== 'string' || !/^\d+$/.test(c.runId) || c.runAttempt !== 1 ||
      c.project !== 'iboepohjwrhtgshrqaol' || c.targetProject !== 'prj_WTzaRAskqTqYhJLVfoPtIVNAA1iS' ||
      c.target !== 'preview') deny()
}
const contextKeys = ['sourceSha','checkoutSha','sourceDigest','policyDigest','artifactDigest',
  'runId','runAttempt','project','targetProject','target']
function sameContext(body, expected) {
  contextOk(expected)
  if (contextKeys.some(k => body[k] !== expected[k])) deny()
}
async function origin(raw, proof, trusted, verifyOrigin, kind, expectedRunId) {
  if (!trusted || typeof verifyOrigin !== 'function' || !COMMIT.test(trusted[kind + 'WorkflowSha']) ||
      typeof trusted[kind + 'Workflow'] !== 'string' || !trusted[kind + 'Workflow'].endsWith('.yml') ||
      typeof trusted.issuer !== 'string' || !trusted.issuer.startsWith('https://') ||
      typeof expectedRunId !== 'string') deny()
  const result = await verifyOrigin({ bytes: Buffer.from(raw), proof, kind })
  if (!result || result.subjectDigest !== digest(raw) || result.issuer !== trusted.issuer ||
      result.workflow !== trusted[kind + 'Workflow'] || result.workflowSha !== trusted[kind + 'WorkflowSha'] ||
      result.runId !== expectedRunId || result.event !== 'workflow_dispatch' ||
      result.runner !== 'github-hosted' || result.ownerApprovedDigest !== digest(raw) ||
      typeof trusted[kind + 'ApprovalId'] !== 'string' || !trusted[kind + 'ApprovalId'] ||
      result.approvalId !== trusted[kind + 'ApprovalId']) deny()
}
export async function verifyLedgerAttestation({ raw, proof, trusted, verifyOrigin, context, repositoryState, now }) {
  try {
    contextOk(context)
    await origin(raw, proof, trusted, verifyOrigin, 'export', trusted?.exportRunId)
    const body = parse(raw)
    if (body.schema !== 'omnira-ledger-export/v1' || body.source !== 'supabase_migrations.schema_migrations' ||
        body.project !== context.project || body.sourceSha !== context.sourceSha ||
        body.queryDigest !== digest(LEDGER_EXPORT_QUERY) || !Array.isArray(body.rows) ||
        body.contentDigest !== digest(canonicalJson(body.rows))) deny()
    fresh(body, now)
    for (const row of body.rows)
      if (!row || typeof row.name !== 'string' || !/^[a-z0-9_]+$/.test(row.name) ||
          typeof row.version !== 'string' || !/^\d+$/.test(row.version) || !SHA.test(row.sql_sha256)) deny()
    for (const reference of REFERENCED_LEDGER_MIGRATIONS) {
      const rows = body.rows.filter(row => row.name === reference.name)
      if (rows.length !== 1 || rows[0].version !== reference.ledgerVersion ||
          rows[0].sql_sha256 !== reference.sqlSha256) deny()
    }
    const result = evaluateAppliedMigrationLedger(body.rows.map(row => row.name), repositoryState)
    const verified = Object.freeze({ status: 'PASS', ...context, ledgerDigest: body.contentDigest,
      exportDigest: digest(raw), issuedAt: body.issuedAt, expiresAt: body.expiresAt, result })
    mintedGuards.add(verified)
    return verified
  } catch { deny() }
}
export function createPublicationReceipt({ verifiedGuard, context, artifact, now }) {
  try {
    if (!mintedGuards.has(verifiedGuard)) deny()
    sameContext(verifiedGuard, context)
    fresh(verifiedGuard, now)
    if (!(Buffer.isBuffer(artifact) || artifact instanceof Uint8Array) || digest(artifact) !== context.artifactDigest) deny()
    return canonicalJson({ schema: 'omnira-guard-receipt/v1', status: 'PASS', ...context,
      ledgerDigest: verifiedGuard.ledgerDigest, exportDigest: verifiedGuard.exportDigest,
      issuedAt: verifiedGuard.issuedAt, expiresAt: verifiedGuard.expiresAt })
  } catch { deny() }
}
export async function verifyPublicationReceipt({ raw, proof, trusted, verifyOrigin, context, artifact, now }) {
  try {
    contextOk(context)
    await origin(raw, proof, trusted, verifyOrigin, 'receipt', context.runId)
    const body = parse(raw)
    if (body.schema !== 'omnira-guard-receipt/v1' || body.status !== 'PASS' ||
        !SHA.test(body.ledgerDigest) || !SHA.test(body.exportDigest)) deny()
    sameContext(body, context)
    fresh(body, now)
    if (!(Buffer.isBuffer(artifact) || artifact instanceof Uint8Array) || digest(artifact) !== context.artifactDigest) deny()
    return Object.freeze({ status: 'PASS', ...context, exportDigest: body.exportDigest,
      ledgerDigest: body.ledgerDigest, platformEnforced: false })
  } catch { deny() }
}
