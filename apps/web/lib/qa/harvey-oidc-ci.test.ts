import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import {
  CI_POLICY, readTrust, checkInvocation, checkEnvironment, checkRun, ownerReview,
  checkCertificate, inspectTar, checkArtifact, cleanBuildEnv, createAdapter, main,
} from '../../scripts/harvey-oidc-ci.mjs'
import { canonicalJson, digest, LEDGER_EXPORT_QUERY } from '../../scripts/migration-guard-ledger-attestation.mjs'
import { inspectCanonicalMigrationFiles, REFERENCED_LEDGER_MIGRATIONS } from '../../scripts/migration-guard-policy.mjs'

// All GitHub API / CLI boundaries below are synthetic. No real GitHub provenance is claimed.
const now = 1_794_949_000, sha = 'a'.repeat(40), runId = '900', buildRunId = '800', artifactId = '700'
const issuer = CI_POLICY.issuer
const root = generateKeyPairSync('rsa', { modulusLength: 2048 })
const fixtureMigrations = readdirSync(resolve(__dirname, '../../supabase/migrations'))
const state = inspectCanonicalMigrationFiles(fixtureMigrations)
const temporary: string[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const p of temporary.splice(0)) rmSync(p, { recursive: true, force: true }) })
const temp = () => { const p = mkdtempSync(resolve(tmpdir(), 'harvey-ci-synthetic-')); temporary.push(p); return p }
function environment() {
  return { id: 600, name: CI_POLICY.environment, can_admins_bypass: false,
    deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
    protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: Number(CI_POLICY.ownerId) } }] }] }
}
function branches() { return { total_count: 1, branch_policies: [{ type: 'branch', name: CI_POLICY.ref.slice(11) }] } }
function env() {
  return { NODE_ENV: 'test' as const, HARVEY_OIDC_ONCE_ENABLED: 'true', HARVEY_OIDC_APPROVED_SOURCE_SHA: sha,
    HARVEY_OIDC_TRUSTED_WORKFLOW_SHA: sha, HARVEY_OIDC_ENVIRONMENT_ID: '600', HARVEY_OIDC_GH_VERSION: '2.102.0',
    HARVEY_OIDC_VERCEL_CLI_VERSION: '50.0.0', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com', GITHUB_REPOSITORY: CI_POLICY.repo,
    GITHUB_REPOSITORY_ID: CI_POLICY.repoId, GITHUB_REPOSITORY_OWNER_ID: CI_POLICY.ownerId,
    GITHUB_ACTOR_ID: CI_POLICY.ownerId, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: CI_POLICY.ref,
    GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha, GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: runId,
    GITHUB_WORKFLOW_REF: `${CI_POLICY.repo}/${CI_POLICY.workflow}@${CI_POLICY.ref}`, GH_TOKEN: 'synthetic-github-test-token',
    BUILD_RUN_ID: buildRunId, BUILD_ARTIFACT_ID: artifactId, ARTIFACT_SHA256: '', LEDGER_JSON: '',
    LEDGER_BUNDLE: '', RECEIPT_BUNDLE: '', PATH: process.env.PATH ?? '' }
}
function run(id = runId) {
  return { id: Number(id), repository: { id: Number(CI_POLICY.repoId), full_name: CI_POLICY.repo, owner: { id: Number(CI_POLICY.ownerId) } },
    head_repository: { id: Number(CI_POLICY.repoId) }, path: CI_POLICY.workflow, workflow_id: CI_POLICY.workflowId,
    head_sha: sha, head_branch: CI_POLICY.ref.slice(11), event: 'workflow_dispatch', run_attempt: 1,
    actor: { id: Number(CI_POLICY.ownerId) }, triggering_actor: { id: Number(CI_POLICY.ownerId) }, status: 'completed', conclusion: 'success' }
}
function review(binding: object) {
  return { state: 'approved', user: { id: Number(CI_POLICY.ownerId), login: 'Bumbi190', type: 'User' },
    environments: [{ id: 600, name: CI_POLICY.environment }], comment: canonicalJson({ schema: 'omnira-oidc-owner-approval/v1', ...binding }) }
}
function certificate(bytes: Buffer, id = runId) {
  const uri = `https://github.com/${CI_POLICY.repo}/${CI_POLICY.workflow}@${CI_POLICY.ref}`
  return [{ verificationResult: { signature: { certificate: { issuer, subjectAlternativeName: uri,
    buildSignerURI: uri, buildSignerDigest: sha, buildConfigURI: uri, buildConfigDigest: sha,
    sourceRepositoryURI: `https://github.com/${CI_POLICY.repo}`, sourceRepositoryIdentifier: CI_POLICY.repoId,
    sourceRepositoryOwnerIdentifier: CI_POLICY.ownerId, sourceRepositoryDigest: sha, sourceRepositoryRef: CI_POLICY.ref,
    runnerEnvironment: 'github-hosted', buildTrigger: 'workflow_dispatch',
    runInvocationURI: `https://github.com/${CI_POLICY.repo}/actions/runs/${id}/attempts/1` } },
    statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{ digest: { sha256: digest(bytes) } }],
      predicate: { verified: true, ownerApprovedDigest: 'untrusted-predicate-never-used' } },
    verifiedTimestamps: [{ timestamp: new Date((now - 1) * 1000).toISOString() }] } }]
}
function tar(name = 'output/config.json', kind = 48, content = '{"version":3}') {
  const h = Buffer.alloc(512), data = Buffer.from(content)
  const octal = (at: number, len: number, value: number) => h.write(value.toString(8).padStart(len - 1, '0') + '\0', at, len)
  h.write(name, 0, 100); octal(100, 8, 0o644); octal(108, 8, 0); octal(116, 8, 0)
  octal(124, 12, data.length); octal(136, 12, now); h.fill(32, 148, 156); h[156] = kind
  h.write('ustar\0', 257); h.write('00', 263); octal(148, 8, h.reduce((s, v) => s + v, 0))
  return Buffer.concat([h, data, Buffer.alloc((512 - data.length % 512) % 512), Buffer.alloc(1024)])
}
function fixture() {
  const cwd = temp(), output = resolve(cwd, 'evidence'), journal = temp(), e: Record<string, string> & { NODE_ENV: 'test' } = env()
  const policyPath = 'apps/web/scripts/migration-guard-policy.mjs'
  mkdirSync(dirname(resolve(cwd, policyPath)), { recursive: true }); writeFileSync(resolve(cwd, policyPath), 'synthetic policy bytes')
  const artifact = tar(), sourceDigest = digest(canonicalJson([{ path: policyPath, sha256: digest('synthetic policy bytes') }]))
  const manifest = { schema: 'omnira-oidc-build/v1', sourceSha: sha, checkoutSha: sha, sourceDigest,
    policyDigest: digest('synthetic policy bytes'), artifactDigest: digest(artifact), buildRunId, runAttempt: 1,
    targetProject: CI_POLICY.targetProject, target: 'preview', files: inspectTar(artifact) }
  const rows = state.enforcedNames.map(name => { const r = REFERENCED_LEDGER_MIGRATIONS.find(r => r.name === name)
    return { name, version: r?.ledgerVersion ?? '20260101000000', sql_sha256: r?.sqlSha256 ?? digest(name) } })
  const ledger = { schema: 'omnira-ledger-export/v1', source: 'supabase_migrations.schema_migrations', project: CI_POLICY.project,
    sourceSha: sha, queryDigest: digest(LEDGER_EXPORT_QUERY), issuedAt: now - 10, expiresAt: now + 290,
    rows, contentDigest: digest(canonicalJson(rows)) }
  const zip = Buffer.from('synthetic immutable GitHub upload ZIP; no extraction occurs')
  const binding = () => ({ kind: 'export', runId, sourceSha: sha, subjectDigest: digest(e.LEDGER_JSON),
    buildRunId, artifactId, artifactDigest: e.ARTIFACT_SHA256 })
  e.ARTIFACT_SHA256 = manifest.artifactDigest; e.LEDGER_JSON = canonicalJson(ledger)
  const reviews: Record<string, any[]> = { [runId]: [review(binding())] }
  const facts: Record<string, any> = {
    [`environments/${CI_POLICY.environment}`]: environment(),
    [`environments/${CI_POLICY.environment}/deployment-branch-policies?per_page=100`]: branches(),
    [`actions/runs/${runId}`]: run(), [`actions/runs/${buildRunId}`]: run(buildRunId),
    [`actions/runs/${buildRunId}/jobs?filter=all&per_page=100`]: { total_count: 2, jobs: [
      { name: 'Migration Guard Integrity', conclusion: 'success', run_attempt: 1 }, { name: 'oidc_build', conclusion: 'success', run_attempt: 1 }] },
    [`actions/artifacts/${artifactId}`]: { id: Number(artifactId), expired: false, size_in_bytes: zip.length,
      workflow_run: { id: Number(buildRunId), head_sha: sha }, name: `harvey-oidc-build-${sha}-${buildRunId}`, digest: 'sha256:' + digest(zip) },
  }
  let clock = now
  const command = vi.fn((file: string, args: string[], options: any = {}) => {
    if (file === 'git') return args[0] === 'rev-parse' ? sha : args[0] === 'status' ? '' : policyPath + '\0'
    if (file === 'gh' && args[0] === '--version') return 'gh version 2.102.0 (synthetic)\n'
    if (file === 'gh' && args[0] === 'api') {
      const path = args[args.length - 1].replace(`repos/${CI_POLICY.repo}/`, '')
      if (path.endsWith('/approvals')) return JSON.stringify(reviews[path.split('/')[2]] ?? [])
      if (path.endsWith('/zip')) return zip
      if (!(path in facts)) throw Error('unexpected synthetic API path')
      return JSON.stringify(facts[path])
    }
    if (file === 'gh' && args[0] === 'attestation') {
      const raw = readFileSync(args[2]), bundle = JSON.parse(readFileSync(args[args.indexOf('--bundle') + 1], 'utf8'))
      const serialized = canonicalJson(bundle.results)
      if (!verify('sha256', Buffer.from(serialized), root.publicKey, Buffer.from(bundle.signature, 'base64')) || bundle.digest !== digest(raw)) throw Error('synthetic signature rejected')
      return JSON.stringify(bundle.results)
    }
    if (file === 'unzip') return args[0] === '-Z1' ? 'manifest.json\nartifact.tar\n' : args[args.length - 1] === 'manifest.json' ? canonicalJson(manifest) : artifact
    if (file === 'npm') {
      expect(options.env.GH_TOKEN).toBeUndefined(); expect(options.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
      const built = resolve(cwd, '.vercel/output'); mkdirSync(built, { recursive: true }); writeFileSync(resolve(built, 'config.json'), '{"version":3}')
      return ''
    }
    if (file === 'tar') return artifact
    throw Error('unexpected synthetic command')
  })
  function bundle(path: string, raw: string) {
    const results = certificate(Buffer.from(raw))
    writeFileSync(path, JSON.stringify({ results, digest: digest(raw), signature: sign('sha256', Buffer.from(canonicalJson(results)), root.privateKey).toString('base64') }))
  }
  const adapter = () => createAdapter({ env: e, cwd, command, now: () => clock, readMigrations: () => fixtureMigrations })
  async function chain() {
    const a = adapter(); await a.prepare(output)
    e.LEDGER_BUNDLE = resolve(cwd, 'ledger-bundle.json'); bundle(e.LEDGER_BUNDLE, e.LEDGER_JSON)
    await a.guard(output)
    e.RECEIPT_BUNDLE = resolve(cwd, 'receipt-bundle.json'); bundle(e.RECEIPT_BUNDLE, readFileSync(resolve(output, 'receipt.json'), 'utf8'))
    await a.evidence(output)
    return a
  }
  function approveReceipt() {
    const raw = readFileSync(resolve(output, 'receipt.json'), 'utf8')
    facts['actions/runs/901'] = run('901')
    e.GITHUB_RUN_ID = '901'
    reviews['901'] = [review({ kind: 'receipt', runId: '901', receiptRunId: runId, sourceSha: sha,
      subjectDigest: digest(raw), artifactDigest: digest(artifact), targetProject: CI_POLICY.targetProject, target: 'preview' })]
  }
  return { cwd, output, journal, e, artifact, manifest, ledger, facts, reviews, command, adapter, bundle, chain, approveReceipt,
    advance: (time: number) => { clock = time }, binding }
}
const deny = /verification failed|attestation verification failed|EEXIST/
describe('Harvey CI external trust and signed identity (synthetic)', () => {
  it('accepts explicit owner-controlled trust and exact invocation', () => { const e = env(); checkInvocation(e, readTrust(e)) })
  it.each(['HARVEY_OIDC_ONCE_ENABLED','HARVEY_OIDC_APPROVED_SOURCE_SHA','HARVEY_OIDC_TRUSTED_WORKFLOW_SHA','HARVEY_OIDC_ENVIRONMENT_ID','HARVEY_OIDC_GH_VERSION'])('rejects missing trust pin %s', key => {
    const e: any = env(); delete e[key]; expect(() => readTrust(e)).toThrow(deny)
  })
  it.each(['2.97.0','2.101.0','latest','3.0.0','2.102.0-rc1'])('rejects unapproved verifier version %s', version => {
    expect(() => readTrust({ ...env(), HARVEY_OIDC_GH_VERSION: version })).toThrow(deny)
  })
  it.each(['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_SERVER_URL','GITHUB_API_URL','GITHUB_REPOSITORY','GITHUB_REPOSITORY_ID',
    'GITHUB_REPOSITORY_OWNER_ID','GITHUB_ACTOR_ID','GITHUB_EVENT_NAME','GITHUB_REF','GITHUB_SHA','GITHUB_WORKFLOW_SHA',
    'GITHUB_RUN_ATTEMPT','GITHUB_RUN_ID','GITHUB_WORKFLOW_REF'])('rejects incorrect invocation %s', key => {
    const e: any = env(); e[key] = 'wrong'; expect(() => checkInvocation(e, readTrust(e))).toThrow(deny)
  })
  it('requires real environment restrictions and exact branch', () => { checkEnvironment(environment(), branches(), readTrust(env())) })
  it.each(['id','name','can_admins_bypass','deployment_branch_policy','protection_rules'])('rejects incorrect environment %s', key => {
    const e: any = environment(); e[key] = undefined; expect(() => checkEnvironment(e, branches(), readTrust(env()))).toThrow(deny)
  })
  it('rejects extra reviewers or branch wildcard', () => {
    const e = environment(); e.protection_rules[0].reviewers.push({ type: 'User', reviewer: { id: 123 } })
    expect(() => checkEnvironment(e, branches(), readTrust(env()))).toThrow(deny)
    const b = branches(); b.branch_policies[0].name = '*'; expect(() => checkEnvironment(environment(), b, readTrust(env()))).toThrow(deny)
  })
  it.each(['id','repository','head_repository','path','workflow_id','head_sha','head_branch','event','run_attempt','actor','triggering_actor'])('rejects forged run field %s', key => {
    const r: any = run(); r[key] = null; expect(() => checkRun(r, readTrust(env()), runId)).toThrow(deny)
  })
  it('does not accept a green fabricated predicate as owner approval', () => {
    expect(() => ownerReview([], { runId, subjectDigest: 'f'.repeat(64) }, readTrust(env()))).toThrow(deny)
    const r = review({ runId }); r.user.id = 123; expect(() => ownerReview([r], { runId }, readTrust(env()))).toThrow(deny)
  })
  it('rejects any changed owner-approved digest', () => {
    expect(() => ownerReview([review({ runId, subjectDigest: 'a' })], { runId, subjectDigest: 'b' }, readTrust(env()))).toThrow(deny)
  })
  it('accepts only exact signed certificate identity and subject', () => {
    const bytes = Buffer.from('synthetic'); expect(checkCertificate(certificate(bytes), readTrust(env()), runId, bytes, now).runId).toBe(runId)
  })
  it.each(['issuer','subjectAlternativeName','buildSignerURI','buildSignerDigest','buildConfigURI','buildConfigDigest','sourceRepositoryURI',
    'sourceRepositoryIdentifier','sourceRepositoryOwnerIdentifier','sourceRepositoryDigest','sourceRepositoryRef','runnerEnvironment',
    'buildTrigger','runInvocationURI'])('rejects signed certificate mismatch %s', key => {
    const bytes = Buffer.from('synthetic'), result: any = certificate(bytes)
    result[0].verificationResult.signature.certificate[key] = 'wrong'
    expect(() => checkCertificate(result, readTrust(env()), runId, bytes, now)).toThrow(deny)
  })
  it('rejects stale signing time and swapped subject bytes', () => {
    const bytes = Buffer.from('synthetic'); expect(() => checkCertificate(certificate(bytes), readTrust(env()), runId, bytes, now + 400)).toThrow(deny)
    expect(() => checkCertificate(certificate(bytes), readTrust(env()), runId, Buffer.from('changed'), now)).toThrow(deny)
  })
})
describe('Harvey immutable artifact admission', () => {
  it('checks actual bytes and exact file manifest', () => { const f = fixture(); expect(inspectTar(f.artifact)).toHaveLength(1) })
  it.each(['../config.json','/output/config.json','output/../config.json','output/.env.local','output/key.pem','output\\config.json'])('rejects unsafe archive name %s', name => {
    expect(() => inspectTar(tar(name))).toThrow(deny)
  })
  it.each([49,50,51,52,76,120])('rejects archive link or extension type %s', kind => { expect(() => inspectTar(tar('output/config.json', kind))).toThrow(deny) })
  it('rejects tampering with archive checksums or truncation', () => {
    const a = tar(); a[10] ^= 1; expect(() => inspectTar(a)).toThrow(deny)
    expect(() => inspectTar(tar().subarray(0, 1000))).toThrow(deny)
  })
  it('rejects archive digest mismatch', () => {
    const f = fixture(); expect(() => checkArtifact(f.artifact, f.manifest, { ...f.manifest, artifactDigest: '0'.repeat(64) })).toThrow(deny)
  })
  it('rejects active crons embedded in the artifact', () => {
    expect(() => inspectTar(tar('output/config.json', 48, '{"version":3,"crons":[{"path":"/api/cron"}]}'))).toThrow(deny)
  })
  it('strips every credential from build child environments', () => {
    const clean = cleanBuildEnv({ PATH: '/bin', HOME: '/tmp', GH_TOKEN: 'synthetic', VERCEL_TOKEN: 'synthetic',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic', SCB_KEY: 'synthetic', P256_PRIVATE_KEY: 'synthetic', AWS_SECRET_ACCESS_KEY: 'synthetic' })
    expect(Object.keys(clean).sort()).toEqual(['CI','HOME','NEXT_TELEMETRY_DISABLED','PATH','VERCEL_TELEMETRY_DISABLED','npm_config_audit'].sort())
  })
})
describe('whole CI chain through real Guard and receipt model, mocked GitHub/CLI', () => {
  it('passes synthetic signed ledger through Guard to a signed receipt without publication', async () => {
    const f = fixture(); await f.chain()
    expect(JSON.parse(readFileSync(resolve(f.output, 'verification-summary.json'), 'utf8')).status).toBe('SIGNED_EVIDENCE_NOT_PUBLICATION_AUTHORIZATION')
    const calls = f.command.mock.calls.filter(c => c[0] === 'gh' && c[1][0] === 'attestation')
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const [, args] of calls) { expect(args).toContain('--cert-identity'); expect(args).not.toContain('--signer-workflow'); expect(args).toContain('--source-digest') }
  })
  it('requires a later exact receipt approval and reserves it only once', async () => {
    const f = fixture(), a = await f.chain(); f.approveReceipt()
    expect(await a.verifyPublication({ directory: f.output, approvalRunId: '901', journalDirectory: f.journal })).toMatchObject({ status: 'PASS', reserved: true, deployed: false, platformEnforced: false })
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: '901', journalDirectory: f.journal })).rejects.toThrow(deny)
  })
  it('does not treat export approval as approval of the later receipt', async () => {
    const f = fixture(), a = await f.chain()
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: runId, journalDirectory: f.journal })).rejects.toThrow(deny)
  })
  it('denies expired receipts and produces no reservation', async () => {
    const f = fixture(), a = await f.chain(); f.approveReceipt(); f.advance(now + 301)
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: '901', journalDirectory: f.journal })).rejects.toThrow(deny)
    expect(readdirSync(f.journal)).toEqual([])
  })
  it.each(['head_sha','run_attempt','conclusion','path'])('rejects wrong completed build %s', async key => {
    const f = fixture(); f.facts[`actions/runs/${buildRunId}`][key] = 'wrong'; await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it.each(['id','expired','digest','name','workflow_run'])('rejects artifact metadata mismatch %s', async key => {
    const f = fixture(); f.facts[`actions/artifacts/${artifactId}`][key] = 'wrong'; await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it('rejects a substituted inner artifact hash', async () => {
    const f = fixture(); f.e.ARTIFACT_SHA256 = '0'.repeat(64); await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it.each(['project','sourceSha','contentDigest','queryDigest','expiresAt'])('rejects ledger mismatch %s even with a synthetic signature', async key => {
    const f = fixture(), ledger: any = structuredClone(f.ledger); ledger[key] = key === 'expiresAt' ? now - 1 : 'wrong'
    f.e.LEDGER_JSON = canonicalJson(ledger); f.reviews[runId] = [review(f.binding())]
    await expect(f.chain()).rejects.toThrow(deny)
  })
  it('refuses extra ledger fields instead of uploading arbitrary owner input', async () => {
    const f = fixture(); f.e.LEDGER_JSON = canonicalJson({ ...f.ledger, privateKey: 'synthetic forbidden field' })
    f.reviews[runId] = [review(f.binding())]
    await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it('rejects owner-approved ledger SQL tampering through the actual Guard', async () => {
    const f = fixture(), ledger = structuredClone(f.ledger); ledger.rows[0].name = 'fabricated_migration'
    ledger.contentDigest = digest(canonicalJson(ledger.rows)); f.e.LEDGER_JSON = canonicalJson(ledger); f.reviews[runId] = [review(f.binding())]
    await expect(f.chain()).rejects.toThrow(deny)
  })
  it('rejects a mutated signature before returning a trusted origin', async () => {
    const f = fixture(), a = f.adapter(); await a.prepare(f.output)
    f.e.LEDGER_BUNDLE = resolve(f.cwd, 'bad.json'); f.bundle(f.e.LEDGER_BUNDLE, f.e.LEDGER_JSON)
    const b = JSON.parse(readFileSync(f.e.LEDGER_BUNDLE, 'utf8')); b.signature = Buffer.alloc(256).toString('base64'); writeFileSync(f.e.LEDGER_BUNDLE, JSON.stringify(b))
    await expect(a.guard(f.output)).rejects.toThrow()
  })
  it('fails closed on GitHub 403 without alternate credentials', async () => {
    const f = fixture(); const a = createAdapter({ env: f.e, cwd: f.cwd, command: () => { throw Error('403 synthetic') } })
    await expect(a.preflight()).rejects.toThrow()
  })
  it('runs the local build with a stripped environment and no deployment command', async () => {
    const f = fixture(); f.e.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-never-real'; f.e.SCB_KEY = 'synthetic-never-real'
    const result = await f.adapter().build(resolve(f.cwd, 'built'))
    expect(result.status).toBe('BUILT_NOT_AUTHORIZED')
    const npm = f.command.mock.calls.find(c => c[0] === 'npm')!
    expect(npm[1]).toContain('build'); expect(npm[1]).not.toContain('deploy')
    expect(npm[2].env).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY')
    expect(npm[2].env).not.toHaveProperty('SCB_KEY')
  })
  it('never calls SCB or a production database transport', async () => {
    const network = vi.fn(() => { throw Error('network forbidden') }); vi.stubGlobal('fetch', network)
    const f = fixture(); await f.chain(); expect(network).not.toHaveBeenCalled()
    const apiCalls = f.command.mock.calls.filter(c => c[0] === 'gh' && c[1][0] === 'api')
    expect(apiCalls.every(c => c[1].includes('GET'))).toBe(true)
  })
  it('rejects unauthorized command modes without reading any credential', async () => {
    await expect(main(['deploy','--output','/tmp/forbidden'])).rejects.toThrow(deny)
  })
  it('keeps the workflow and adapter restricted to CI, not product routes or deployments', () => {
    const rootPath = resolve(__dirname, '../../../..')
    const workflow = readFileSync(resolve(rootPath, '.github/workflows/migration-guard-integrity.yml'), 'utf8')
    expect(workflow).toContain('environment: harvey-oidc-owner-once')
    expect(workflow).not.toMatch(/VERCEL_TOKEN|SUPABASE_SERVICE_ROLE_KEY|vercel\s+deploy|--prod\b/)
    expect(workflow).toContain('HARVEY_OIDC_ENVIRONMENT_ID:')
    const code = readFileSync(resolve(__dirname, '../../scripts/harvey-oidc-ci.mjs'), 'utf8')
    expect(code).not.toMatch(/MIGRATION_GUARD_OVERRIDE|fetch\(|createClient\(/)
  })
})
