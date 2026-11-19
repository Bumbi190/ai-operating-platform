import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalJson, digest, LEDGER_EXPORT_QUERY, verifyLedgerAttestation,
  createPublicationReceipt, verifyPublicationReceipt,
} from '../../scripts/migration-guard-ledger-attestation.mjs'
import { inspectCanonicalMigrationFiles, REFERENCED_LEDGER_MIGRATIONS } from '../../scripts/migration-guard-policy.mjs'

const state = inspectCanonicalMigrationFiles(readdirSync(resolve(__dirname, '../../supabase/migrations')))
const root = generateKeyPairSync('rsa', { modulusLength: 2048 })
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 })
// Ephemeral synthetic provenance adapter. No real key, export or GitHub attestation.
const now = 1_794_943_500
const artifact = Buffer.from('synthetic pinned Harvey build; never deployed')
const context = {
  sourceSha: 'a'.repeat(40), checkoutSha: 'a'.repeat(40),
  sourceDigest: digest('synthetic approved source tree'), policyDigest: digest('synthetic approved policy'),
  artifactDigest: digest(artifact), runId: '12345', runAttempt: 1,
  project: 'iboepohjwrhtgshrqaol', targetProject: 'prj_WTzaRAskqTqYhJLVfoPtIVNAA1iS', target: 'preview',
}
const trusted = Object.freeze({
  issuer: 'https://token.actions.githubusercontent.com',
  exportApprovalId: 'synthetic-owner-approval', receiptApprovalId: 'synthetic-owner-approval',
  exportWorkflow: 'Bumbi190/ai-operating-platform/.github/workflows/owner-ledger-export.yml',
  exportWorkflowSha: 'b'.repeat(40), exportRunId: '98765',
  receiptWorkflow: 'Bumbi190/ai-operating-platform/.github/workflows/harvey-oidc-publish.yml',
  receiptWorkflowSha: 'c'.repeat(40),
})
const rows = state.enforcedNames.map(name => {
  const reference = REFERENCED_LEDGER_MIGRATIONS.find(r => r.name === name)
  return { name, version: reference?.ledgerVersion ?? '20260101000000',
    sql_sha256: reference?.sqlSha256 ?? digest('synthetic applied SQL: ' + name) }
})
function body() {
  return { schema: 'omnira-ledger-export/v1', source: 'supabase_migrations.schema_migrations',
    project: context.project, sourceSha: context.sourceSha, queryDigest: digest(LEDGER_EXPORT_QUERY),
    issuedAt: now - 10, expiresAt: now + 290, rows: structuredClone(rows), contentDigest: digest(canonicalJson(rows)) }
}
function proofFor(raw: string, kind = 'export', changes: Record<string, unknown> = {}, key = root.privateKey) {
  const message = { issuer: trusted.issuer, subjectDigest: digest(raw), event: 'workflow_dispatch',
    workflow: kind === 'export' ? trusted.exportWorkflow : trusted.receiptWorkflow,
    workflowSha: kind === 'export' ? trusted.exportWorkflowSha : trusted.receiptWorkflowSha,
    runId: kind === 'export' ? trusted.exportRunId : context.runId, runner: 'github-hosted',
    ownerApprovedDigest: digest(raw), approvalId: 'synthetic-owner-approval', ...changes }
  return { message, signature: sign('sha256', Buffer.from(canonicalJson(message)), key).toString('base64') }
}
async function verifyOrigin({ bytes, proof }: { bytes: Buffer; proof: ReturnType<typeof proofFor> }) {
  if (!proof || !verify('sha256', Buffer.from(canonicalJson(proof.message)), root.publicKey,
    Buffer.from(proof.signature, 'base64')) || proof.message.subjectDigest !== digest(bytes)) throw Error('untrusted provenance')
  return proof.message
}
function input(b = body(), changes: Record<string, unknown> = {}) {
  const raw = canonicalJson(b)
  return { raw, proof: proofFor(raw), trusted, verifyOrigin, context, repositoryState: state, now, ...changes }
}
async function receipt() {
  const verifiedGuard = await verifyLedgerAttestation(input())
  const raw = createPublicationReceipt({ verifiedGuard, context, artifact, now })
  return { raw, proof: proofFor(raw, 'receipt'), trusted, verifyOrigin, context, artifact, now }
}
const deny = /attestation verification failed/
describe('owner-attested ledger with external trust root', () => {
  it('passes a fresh, cryptographically authenticated synthetic ledger through actual Harvey Guard', async () => {
    const result = await verifyLedgerAttestation(input())
    expect(result.status).toBe('PASS')
    expect(result.result).toMatchObject({ canonicalSqlCount: 179, referencedMigrationCount: 0, enforcedCount: 165 })
  })
  it('runs without network, SCB, database clients or production credentials', async () => {
    const fetch = vi.fn(() => { throw Error('network forbidden') })
    vi.stubGlobal('fetch', fetch)
    try { await verifyLedgerAttestation(input()); expect(fetch).not.toHaveBeenCalled() } finally { vi.unstubAllGlobals() }
    const code = readFileSync(resolve(__dirname, '../../scripts/migration-guard-ledger-attestation.mjs'), 'utf8')
    expect(code).not.toMatch(/process\.env|SUPABASE_SERVICE_ROLE_KEY|SCB_API_KEY|fetch\(/)
  })
  it('rejects absent or PR-fabricated provenance', async () => {
    await expect(verifyLedgerAttestation(input(body(), { proof: undefined }))).rejects.toThrow(deny)
    const raw = canonicalJson(body())
    await expect(verifyLedgerAttestation(input(body(), { proof: proofFor(raw, 'export', {}, foreign.privateKey) }))).rejects.toThrow(deny)
  })
  it('fails closed without a trusted origin verifier', async () => {
    await expect(verifyLedgerAttestation(input(body(), { verifyOrigin: undefined }))).rejects.toThrow(deny)
  })
  it.each(['issuer','workflow','workflowSha','runId','event','runner','ownerApprovedDigest','approvalId'])('rejects wrong export provenance %s', async key => {
    const raw = canonicalJson(body())
    await expect(verifyLedgerAttestation(input(body(), { proof: proofFor(raw, 'export', { [key]: 'wrong' }) }))).rejects.toThrow(deny)
  })
  it('rejects PR data attempting to replace the external trust root', async () => {
    const b = { ...body(), trust: { issuer: 'https://attacker.invalid' } }
    const raw = canonicalJson(b)
    await expect(verifyLedgerAttestation(input(b, { proof: proofFor(raw, 'export', {}, foreign.privateKey) }))).rejects.toThrow(deny)
  })
  it.each(['project','sourceSha','queryDigest','source','schema'])('rejects trusted but wrong export %s', async key => {
    await expect(verifyLedgerAttestation(input({ ...body(), [key]: 'wrong' }))).rejects.toThrow(deny)
  })
  it.each([
    { issuedAt: now - 301, expiresAt: now - 1 },
    { issuedAt: now + 1, expiresAt: now + 300 },
    { issuedAt: now, expiresAt: now + 301 },
    { issuedAt: now, expiresAt: now },
  ])('rejects stale, future or invalid lifetime %#', async times => {
    await expect(verifyLedgerAttestation(input({ ...body(), ...times }))).rejects.toThrow(deny)
  })
  it('rejects payload replacement even with internally correct content hash', async () => {
    const i = input()
    const b = body(); b.rows[0].sql_sha256 = digest('tampered')
    b.contentDigest = digest(canonicalJson(b.rows))
    await expect(verifyLedgerAttestation({ ...i, raw: canonicalJson(b) })).rejects.toThrow(deny)
  })
  it('rejects an incorrect ledger content hash even with a valid source signature', async () => {
    await expect(verifyLedgerAttestation(input({ ...body(), contentDigest: '0'.repeat(64) }))).rejects.toThrow(deny)
  })
  it.each(REFERENCED_LEDGER_MIGRATIONS)('rejects incorrect applied SQL or historical ledger version for $name', async ref => {
    for (const changes of [{ sql_sha256: digest('wrong SQL') }, { version: '99999999999999' }]) {
      const b = body()
      Object.assign(b.rows.find(r => r.name === ref.name)!, changes)
      b.contentDigest = digest(canonicalJson(b.rows))
      await expect(verifyLedgerAttestation(input(b))).rejects.toThrow(deny)
    }
  })
  it.each(['missing','duplicate','unknown','malformed'])('retains actual Guard rejection of %s migration rows', async kind => {
    const b = body()
    if (kind === 'missing') b.rows.shift()
    if (kind === 'duplicate') b.rows.push(b.rows[0])
    if (kind === 'unknown') b.rows.push({ name: 'unknown_migration', version: '123', sql_sha256: digest('unknown') })
    if (kind === 'malformed') b.rows[0].name = 'bad-*'
    b.contentDigest = digest(canonicalJson(b.rows))
    await expect(verifyLedgerAttestation(input(b))).rejects.toThrow(deny)
  })
  it('rejects noncanonical or duplicate-key JSON', async () => {
    const raw = '{"schema":"ignored",' + canonicalJson(body()).slice(1)
    await expect(verifyLedgerAttestation({ ...input(), raw, proof: proofFor(raw) })).rejects.toThrow(deny)
  })
  it('sanitizes origin verifier errors instead of leaking credentials or tokens', async () => {
    await expect(verifyLedgerAttestation(input(body(), { verifyOrigin: async () => { throw Error('synthetic-secret-token') } })))
      .rejects.toThrow(/^migration-guard: attestation verification failed \(fail-closed\)$/)
  })
})
describe('receipt bound to reviewed code, CI run and exact artifact', () => {
  it('verifies a receipt for the exact synthetic artifact and explicitly denies platform enforcement claims', async () => {
    const result = await verifyPublicationReceipt(await receipt())
    expect(result).toMatchObject({ status: 'PASS', sourceSha: context.sourceSha, platformEnforced: false })
  })
  it('cannot mint a receipt from a fabricated or deserialized PASS object', async () => {
    const guard = await verifyLedgerAttestation(input())
    expect(() => createPublicationReceipt({ verifiedGuard: { ...guard }, context, artifact, now })).toThrow(deny)
  })
  it.each(['sourceSha','checkoutSha','sourceDigest','policyDigest','artifactDigest','runId','runAttempt','project','targetProject','target'])('rejects changed receipt context %s', async key => {
    const r = await receipt()
    await expect(verifyPublicationReceipt({ ...r, context: { ...context, [key]: 'wrong' } })).rejects.toThrow(deny)
  })
  it('rejects different artifact bytes even when metadata names the right commit', async () => {
    await expect(verifyPublicationReceipt({ ...await receipt(), artifact: Buffer.from('other build') })).rejects.toThrow(deny)
  })
  it('rejects artifact changes while minting the receipt', async () => {
    const verifiedGuard = await verifyLedgerAttestation(input())
    expect(() => createPublicationReceipt({ verifiedGuard, context, artifact: Buffer.from('changed'), now })).toThrow(deny)
  })
  it('rejects changed CI context while minting the receipt', async () => {
    const verifiedGuard = await verifyLedgerAttestation(input())
    expect(() => createPublicationReceipt({ verifiedGuard, context: { ...context, runId: '555' }, artifact, now })).toThrow(deny)
  })
  it('rejects expired receipt and repeat attempt for the same run', async () => {
    await expect(verifyPublicationReceipt({ ...await receipt(), now: now + 300 })).rejects.toThrow(deny)
    await expect(verifyPublicationReceipt({ ...await receipt(), context: { ...context, runAttempt: 2 } })).rejects.toThrow(deny)
  })
  it.each(['workflow','workflowSha','runId','ownerApprovedDigest'])('rejects wrong receipt signer identity %s', async key => {
    const r = await receipt()
    await expect(verifyPublicationReceipt({ ...r, proof: proofFor(r.raw, 'receipt', { [key]: 'wrong' }) })).rejects.toThrow(deny)
  })
  it('does not authorize manual Vercel/API publication or promise durable single-use enforcement', async () => {
    const r = await receipt()
    expect((await verifyPublicationReceipt(r)).platformEnforced).toBe(false)
    // Pure verification can repeat. A real publisher needs protected concurrency
    // and deployment-ID recording; Vercel permissions remain a separate boundary.
    expect((await verifyPublicationReceipt(r)).status).toBe('PASS')
  })
})


describe('Office applied-ledger version pins', () => {
  it.each(REFERENCED_LEDGER_MIGRATIONS.filter(reference => ['office_step_activity', 'office_workflow_state'].includes(reference.name)))('rejects the Git filename timestamp as applied version for $name', async reference => {
    const b = body()
    b.rows.find(row => row.name === reference.name)!.version = reference.sourcePath.split('/').pop()!.split('_')[0]
    b.contentDigest = digest(canonicalJson(b.rows))
    await expect(verifyLedgerAttestation(input(b))).rejects.toThrow(deny)
  })
})
