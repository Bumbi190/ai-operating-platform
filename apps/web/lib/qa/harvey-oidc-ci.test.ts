import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, fstatSync, readSync, writeSync, symlinkSync, linkSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync, spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import {
  CI_POLICY, readTrust, checkInvocation, checkEnvironment, checkRun, ownerReview,
  checkCertificate, inspectTar, checkArtifact, cleanBuildEnv, createAdapter, main,
  JOURNAL_PREFIX, journalTrust, checkJournalPolicy,
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
    BUILD_RUN_ID: buildRunId, BUILD_ARTIFACT_ID: artifactId, ARTIFACT_SHA256: '', LEDGER_EXPORT_FILE: '', RUNNER_TEMP: '',
    HARVEY_OIDC_JOURNAL_MODE: 'github-tags-v1', HARVEY_OIDC_JOURNAL_IMMUTABLE_RULESET_ID: '610',
    HARVEY_OIDC_JOURNAL_CREATION_RULESET_ID: '611', HARVEY_OIDC_JOURNAL_CREATOR_APP_ID: '612',
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
function fixture(server = { refs: new Map<string, any>(), failCreate: false, loseReply: false, failPublish: false, publications: 0 }) {
  const cwd = temp(), output = resolve(cwd, 'evidence'), e: Record<string, string> & { NODE_ENV: 'test' } = env()
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
  const ledgerInput = { value: canonicalJson(ledger) }
  e.RUNNER_TEMP = cwd; e.LEDGER_EXPORT_FILE = resolve(cwd,'harvey-oidc-secret/ledger.json')
  mkdirSync(dirname(e.LEDGER_EXPORT_FILE),{mode:0o700})
  const binding = () => ({ kind: 'export', runId, sourceSha: sha, subjectDigest: digest(ledgerInput.value),
    buildRunId, artifactId, artifactDigest: e.ARTIFACT_SHA256 })
  e.ARTIFACT_SHA256 = manifest.artifactDigest; ledgerInput.value = canonicalJson(ledger)
  const reviews: Record<string, any[]> = { [runId]: [review(binding())] }
  const ruleConditions = { ref_name: { include: [JOURNAL_PREFIX + '*'], exclude: [] } }
  const facts: Record<string, any> = {
    'rulesets/610': { id:610,target:'tag',enforcement:'active',conditions:ruleConditions,rules:[{type:'update'},{type:'deletion'}],bypass_actors:[] },
    'rulesets/611': { id:611,target:'tag',enforcement:'active',conditions:ruleConditions,rules:[{type:'creation'}],bypass_actors:[{actor_type:'Integration',actor_id:612,bypass_mode:'always'}] },
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
      if (path === 'git/refs') {
        if(server.failCreate)throw Error('synthetic GitHub unavailable')
        const body=JSON.parse(options.input)
        if(server.refs.has(body.ref))throw Error('synthetic 422 duplicate ref')
        const saved={ref:body.ref,object:{type:'commit',sha:body.sha}}
        server.refs.set(body.ref,saved)
        if(server.loseReply)throw Error('synthetic lost response after server commit')
        return 'HTTP/2.0 201 Created\r\ncontent-type: application/json\r\n\r\n'+JSON.stringify(saved)
      }
      if(path.startsWith('git/ref/'))return JSON.stringify(server.refs.get('refs/'+path.slice('git/ref/'.length)))
      if (path.endsWith('/approvals')) return JSON.stringify(reviews[path.split('/')[2]] ?? [])
      if (path.endsWith('/zip')) return zip
      if (!(path in facts)) throw Error('unexpected synthetic API path')
      return JSON.stringify(facts[path])
    }
    if (file === 'gh' && args[0] === 'attestation') {
      const fromDescriptor = (index: number, fallback: string) => {
        if (!options.stdio?.[index]) return readFileSync(fallback)
        const fd = options.stdio[index], bytes = Buffer.alloc(fstatSync(fd).size)
        if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) throw Error('short descriptor read')
        return bytes
      }
      const raw = fromDescriptor(3, args[2]), bundle = JSON.parse(fromDescriptor(4, args[args.indexOf('--bundle') + 1]).toString('utf8'))
      const serialized = canonicalJson(bundle.results)
      if (!verify('sha256', Buffer.from(serialized), root.publicKey, Buffer.from(bundle.signature, 'base64')) || bundle.digest !== digest(raw)) throw Error('synthetic signature rejected')
      return JSON.stringify(bundle.results)
    }
    if(file==='vercel') {
      if(args[0]==='--version')return '50.0.0'
      expect(args).toContain('--environment=preview'); expect(args).not.toContain('--prod')
      expect(server.refs.size).toBe(1); expect(options.env.VERCEL_TOKEN).toBe('synthetic-publish-token')
      server.publications++
      if(server.failPublish)throw Error('synthetic deployment failure')
      return 'https://harvey-oidc-test-synthetic-bumbi190s-projects.vercel.app'
    }
    if(file==='unzip' && args.some(a=>a.endsWith('proof.zip'))) {
      const names=['artifact.tar','manifest.json','receipt.json','receipt.sigstore.json','verification-summary.json']
      return args[0]==='-Z1' ? names.join('\n') : readFileSync(resolve(output,args[args.length-1]))
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
  const adapter = () => { writeFileSync(e.LEDGER_EXPORT_FILE,ledgerInput.value,{mode:0o600}); return createAdapter({ env: e, cwd, command, now: () => clock, readMigrations: () => fixtureMigrations }) }
  async function chain() {
    const a = adapter(); await a.prepare(output)
    e.LEDGER_BUNDLE = resolve(cwd, 'ledger-bundle.json'); bundle(e.LEDGER_BUNDLE, ledgerInput.value)
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
  function publication() {
    e.PROOF_RUN_ID=runId; e.PROOF_ARTIFACT_ID='701'; e.HARVEY_OIDC_PUBLICATION_ENABLED='true'; e.VERCEL_TOKEN='synthetic-publish-token'
    facts[`actions/runs/${runId}/jobs?filter=all&per_page=100`]={total_count:1,jobs:[{name:'oidc_attest',conclusion:'success',run_attempt:1}]}
    facts['actions/artifacts/701']={id:701,expired:false,size_in_bytes:zip.length,workflow_run:{id:Number(runId),head_sha:sha},name:`harvey-oidc-proof-${sha}-${runId}`,digest:'sha256:'+digest(zip)}
    return resolve(cwd,'publication')
  }
  return { cwd, output, e, artifact, manifest, ledger, ledgerInput, server, facts, reviews, command, adapter, bundle, chain, approveReceipt, publication,
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
    expect(await a.verifyPublication({ directory: f.output, approvalRunId: '901' })).toMatchObject({ status: 'PASS', reserved: true, deployed: false, platformEnforced: false })
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: '901' })).rejects.toThrow(deny)
  })
  it('does not treat export approval as approval of the later receipt', async () => {
    const f = fixture(), a = await f.chain()
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: runId })).rejects.toThrow(deny)
  })
  it('denies expired receipts and produces no reservation', async () => {
    const f = fixture(), a = await f.chain(); f.approveReceipt(); f.advance(now + 301)
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: '901' })).rejects.toThrow(deny)
    expect(f.server.refs.size).toBe(0)
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
    f.ledgerInput.value = canonicalJson(ledger); f.reviews[runId] = [review(f.binding())]
    await expect(f.chain()).rejects.toThrow(deny)
  })
  it('refuses extra ledger fields instead of uploading arbitrary owner input', async () => {
    const f = fixture(); f.ledgerInput.value = canonicalJson({ ...f.ledger, privateKey: 'synthetic forbidden field' })
    f.reviews[runId] = [review(f.binding())]
    await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it('rejects owner-approved ledger SQL tampering through the actual Guard', async () => {
    const f = fixture(), ledger = structuredClone(f.ledger); ledger.rows[0].name = 'fabricated_migration'
    ledger.contentDigest = digest(canonicalJson(ledger.rows)); f.ledgerInput.value = canonicalJson(ledger); f.reviews[runId] = [review(f.binding())]
    await expect(f.chain()).rejects.toThrow(deny)
  })
  it('rejects a mutated signature before returning a trusted origin', async () => {
    const f = fixture(), a = f.adapter(); await a.prepare(f.output)
    f.e.LEDGER_BUNDLE = resolve(f.cwd, 'bad.json'); f.bundle(f.e.LEDGER_BUNDLE, f.ledgerInput.value)
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
    expect(workflow).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|--prod\b|inputs\.ledger_json/)
    expect(workflow).toContain("inputs.oidc_phase == 'publish-preview'")
    expect(workflow).toContain('HARVEY_OIDC_PUBLICATION_ENABLED:')
    expect(workflow).toContain('secrets.HARVEY_OIDC_LEDGER_EXPORT_JSON')
    const upload = workflow.slice(workflow.indexOf('name: harvey-oidc-proof-'),workflow.indexOf('name: Always remove'))
    expect(upload).not.toMatch(/\/ledger\.json|\/binding\.json|\/ledger\.sigstore\.json/)
    expect(workflow).toContain('HARVEY_OIDC_ENVIRONMENT_ID:')
    const code = readFileSync(resolve(__dirname, '../../scripts/harvey-oidc-ci.mjs'), 'utf8')
    expect(code).not.toMatch(/MIGRATION_GUARD_OVERRIDE|fetch\(|createClient\(/)
  })
})

describe('attestation file identity and immutable descriptor snapshots', () => {
  async function ready() {
    const f = fixture(), a = f.adapter(); await a.prepare(f.output)
    f.e.LEDGER_BUNDLE = resolve(f.cwd, 'ledger-bundle.json')
    f.bundle(f.e.LEDGER_BUNDLE, f.ledgerInput.value)
    return { f, a }
  }
  function intercept(f: ReturnType<typeof fixture>, action: (args: string[], options: any, result: () => string) => string) {
    const original = f.command.getMockImplementation()!
    f.command.mockImplementation((file: string, args: string[], options: any = {}) =>
      file === 'gh' && args[0] === 'attestation'
        ? action(args, options, () => original(file, args, options) as string)
        : original(file, args, options))
  }
  function fdBytes(fd: number) {
    const bytes = Buffer.alloc(fstatSync(fd).size)
    expect(readSync(fd, bytes, 0, bytes.length, 0)).toBe(bytes.length)
    return bytes
  }
  it('uses an inherited subject and private .json proof snapshot, closing both descriptors', async () => {
    const { f, a } = await ready(); let descriptors: number[] = []
    intercept(f, (args, options, result) => {
      expect(args[2]).toBe('/proc/self/fd/3')
      const proof = args[args.indexOf('--bundle') + 1]
      expect(proof).toMatch(/bundle\.json$/)
      expect(dirname(proof)).not.toBe(f.cwd)
      expect(readFileSync(proof)).toEqual(readFileSync(f.e.LEDGER_BUNDLE))
      descriptors = options.stdio.slice(3)
      expect(descriptors).toHaveLength(2)
      expect(fdBytes(descriptors[0]).toString()).toBe(f.ledgerInput.value)
      return result()
    })
    await a.guard(f.output)
    for (const fd of descriptors) expect(() => fstatSync(fd)).toThrow()
  })
  it('never reuses a preseeded predictable subject cache', async () => {
    const { f, a } = await ready()
    const oldSubject = resolve(f.cwd, '.subject-' + digest(f.ledgerInput.value) + '.json')
    writeFileSync(oldSubject, 'attacker-controlled preseed')
    await a.guard(f.output)
    expect(readFileSync(oldSubject, 'utf8')).toBe('attacker-controlled preseed')
  })
  it('does not leak a subject cache beside the supplied bundle', async () => {
    const { f, a } = await ready(); await a.guard(f.output)
    expect(readdirSync(f.cwd).filter(name => name.startsWith('.subject-'))).toEqual([])
  })
  it('rejects a symlink bundle before invoking the verifier', async () => {
    const { f, a } = await ready(), link = resolve(f.cwd, 'bundle-link.json')
    symlinkSync(f.e.LEDGER_BUNDLE, link, 'file'); f.e.LEDGER_BUNDLE = link
    await expect(a.guard(f.output)).rejects.toThrow()
    expect(f.command.mock.calls.filter(c => c[0] === 'gh' && c[1][0] === 'attestation')).toHaveLength(0)
  })
  it('rejects a directory instead of a regular bundle', async () => {
    const { f, a } = await ready(); f.e.LEDGER_BUNDLE = f.cwd
    await expect(a.guard(f.output)).rejects.toThrow()
  })
  it('rejects a hardlinked bundle', async () => {
    const { f, a } = await ready()
    linkSync(f.e.LEDGER_BUNDLE, resolve(f.cwd, 'bundle-hardlink.json'))
    await expect(a.guard(f.output)).rejects.toThrow()
  })
  it('keeps the verified bundle bytes when the original path is replaced during verification', async () => {
    const { f, a } = await ready(), original = readFileSync(f.e.LEDGER_BUNDLE)
    intercept(f, (_args, _options, result) => {
      const verified = result()
      renameSync(f.e.LEDGER_BUNDLE, f.e.LEDGER_BUNDLE + '.moved')
      writeFileSync(f.e.LEDGER_BUNDLE, 'unverified replacement')
      return verified
    })
    await a.guard(f.output)
    expect(readFileSync(resolve(f.output, 'ledger.sigstore.json'))).toEqual(original)
  })
  it('keeps the verified receipt bundle after its original path is replaced', async () => {
    const f = fixture(), a = await f.chain()
    // Reconstruct synthetic private inputs: production evidence() deliberately purges them.
    writeFileSync(resolve(f.output,'ledger.json'),f.ledgerInput.value)
    writeFileSync(resolve(f.output,'binding.json'),canonicalJson(f.binding()))
    writeFileSync(resolve(f.output,'ledger.sigstore.json'),readFileSync(f.e.LEDGER_BUNDLE))
    rmSync(resolve(f.output, 'verification-summary.json')); rmSync(resolve(f.output, 'receipt.sigstore.json'))
    const original = readFileSync(f.e.RECEIPT_BUNDLE)
    intercept(f, (args, options, result) => {
      const verified = result()
      if (args[args.indexOf('--bundle') + 1] === f.e.RECEIPT_BUNDLE || (options.stdio?.[3] && fdBytes(options.stdio[3]).toString() !== f.ledgerInput.value)) {
        writeFileSync(f.e.RECEIPT_BUNDLE, 'unverified replacement')
      }
      return verified
    })
    await a.evidence(f.output)
    expect(readFileSync(resolve(f.output, 'receipt.sigstore.json'))).toEqual(original)
  })
  it('rejects a source bundle replaced with a symlink after approval but before opening', async () => {
    const { f, a } = await ready(), original = f.command.getMockImplementation()!
    const target = resolve(f.cwd, 'other.json'); writeFileSync(target, readFileSync(f.e.LEDGER_BUNDLE))
    f.command.mockImplementation((file: string, args: string[], options: any = {}) => {
      if (file === 'gh' && args[0] === '--version') {
        rmSync(f.e.LEDGER_BUNDLE); symlinkSync(target, f.e.LEDGER_BUNDLE, 'file')
      }
      return original(file, args, options)
    })
    await expect(a.guard(f.output)).rejects.toThrow()
  })
  it('detects in-place subject tampering even if a verifier double returns the old certificate', async () => {
    const { f, a } = await ready()
    intercept(f, (args, options, result) => {
      const verified = result()
      if (options.stdio?.[3]) writeSync(options.stdio[3], Buffer.from('X'), 0, 1, 0)
      else writeFileSync(args[2], 'substituted subject')
      return verified
    })
    await expect(a.guard(f.output)).rejects.toThrow()
    expect(existsSync(resolve(f.output, 'receipt.json'))).toBe(false)
  })
  it('detects in-place bundle tampering after cryptographic verification', async () => {
    const { f, a } = await ready()
    intercept(f, (args, options, result) => {
      const verified = result()
      if (options.stdio?.[4]) writeSync(options.stdio[4], Buffer.from('X'), 0, 1, 0)
      else writeFileSync(args[args.indexOf('--bundle') + 1], 'substituted proof')
      return verified
    })
    await expect(a.guard(f.output)).rejects.toThrow()
    expect(existsSync(resolve(f.output, 'receipt.json'))).toBe(false)
  })
  it('closes descriptor snapshots when the verifier fails', async () => {
    const { f, a } = await ready(); let descriptors: number[] = []
    intercept(f, (_args, options) => { descriptors = options.stdio?.slice(3) ?? []; throw Error('synthetic verifier failure') })
    await expect(a.guard(f.output)).rejects.toThrow()
    expect(descriptors).toHaveLength(2)
    for (const fd of descriptors) expect(() => fstatSync(fd)).toThrow()
  })
  it('checks exact subject digest even when the signature verifier returns another signed subject', async () => {
    const { f, a } = await ready()
    intercept(f, (_args, _options, result) => {
      const verified = JSON.parse(result()); verified[0].verificationResult.statement.subject[0].digest.sha256 = '0'.repeat(64)
      return JSON.stringify(verified)
    })
    await expect(a.guard(f.output)).rejects.toThrow(deny)
  })
  it('refuses modified evidence before creating a publication reservation', async () => {
    const f = fixture(), a = await f.chain(); f.approveReceipt()
    writeFileSync(resolve(f.output, 'artifact.tar'), tar('output/config.json', 48, '{"version":3,"changed":true}'))
    await expect(a.verifyPublication({ directory: f.output, approvalRunId: '901' })).rejects.toThrow(deny)
    expect(f.server.refs.size).toBe(0)
  })
})

describe('private gh-compatible bundle snapshot cannot be substituted', () => {
  it.each(['regular-file','symlink'])('rejects a %s replacement after verifier returns', async kind => {
    const f = fixture(), a = f.adapter(); await a.prepare(f.output)
    f.e.LEDGER_BUNDLE = resolve(f.cwd, 'proof.json'); f.bundle(f.e.LEDGER_BUNDLE, f.ledgerInput.value)
    const original = f.command.getMockImplementation()!
    f.command.mockImplementation((file: string, args: string[], options: any = {}) => {
      const result = original(file, args, options)
      if (file === 'gh' && args[0] === 'attestation') {
        const path = args[args.indexOf('--bundle') + 1]
        renameSync(path, path + '.moved')
        if (kind === 'symlink') symlinkSync(path + '.moved', path, 'file')
        else writeFileSync(path, readFileSync(path + '.moved'))
      }
      return result
    })
    await expect(a.guard(f.output)).rejects.toThrow()
    expect(existsSync(resolve(f.output, 'receipt.json'))).toBe(false)
  })
})



describe('GitHub create-only journal and publication boundary (synthetic API)', () => {
  async function ready() { const f=fixture(); const a=await f.chain(); f.approveReceipt(); return {f,a} }
  it('purges raw ledger and binding before proof publication', async () => {
    const {f}=await ready()
    for(const name of ['ledger.json','binding.json','ledger.sigstore.json'])expect(existsSync(resolve(f.output,name))).toBe(false)
    expect(existsSync(f.e.LEDGER_EXPORT_FILE)).toBe(false)
    for(const name of readdirSync(f.output))expect(readFileSync(resolve(f.output,name)).includes(Buffer.from(f.ledgerInput.value))).toBe(false)
  })
  it('rejects the old raw ledger environment transport',async()=>{
    const f=fixture(); f.e.LEDGER_JSON=f.ledgerInput.value
    await expect(f.adapter().prepare(f.output)).rejects.toThrow(deny)
  })
  it('preserves the maximum 300 second ledger lifetime',async()=>{
    const f=fixture(); f.ledgerInput.value=canonicalJson({...f.ledger,expiresAt:now+291}); f.reviews[runId]=[review(f.binding())]
    await expect(f.chain()).rejects.toThrow(deny)
  })
  it.each(['HARVEY_OIDC_JOURNAL_MODE','HARVEY_OIDC_JOURNAL_IMMUTABLE_RULESET_ID','HARVEY_OIDC_JOURNAL_CREATION_RULESET_ID','HARVEY_OIDC_JOURNAL_CREATOR_APP_ID'])('denies missing journal trust %s',async key=>{
    const {f,a}=await ready(); delete f.e[key]
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow(deny)
    expect(f.server.refs.size).toBe(0)
  })
  it.each(['enforcement','target','conditions','bypass_actors','rules'])('rejects mutable or bypassable immutable policy %s',async key=>{
    const {f,a}=await ready(); f.facts['rulesets/610'][key]=null
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow(deny)
    expect(f.server.refs.size).toBe(0)
  })
  it('denies a creator bypass on the immutable ruleset',async()=>{
    const {f,a}=await ready(); f.facts['rulesets/610'].bypass_actors=f.facts['rulesets/611'].bypass_actors
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow(deny)
  })
  it('denies extra creator actors and wildcard exclusions',()=>{
    const f=fixture(), pins=journalTrust(f.e)
    f.facts['rulesets/611'].bypass_actors.push({actor_type:'RepositoryRole',actor_id:5,bypass_mode:'always'})
    expect(()=>checkJournalPolicy(f.facts['rulesets/610'],f.facts['rulesets/611'],pins)).toThrow(deny)
  })
  it('accepts exactly one concurrent claim, shared across separate adapters',async()=>{
    const {f}=await ready(); const a=f.adapter(),b=f.adapter()
    const results=await Promise.allSettled([a,b].map(x=>x.verifyPublication({directory:f.output,approvalRunId:'901'})))
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1)
    expect(f.server.refs.size).toBe(1)
    await expect(f.adapter().verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow()
  })
  it('fails on unavailable journal before invoking publication',async()=>{
    const {f}=await ready(); f.server.failCreate=true
    await expect(f.adapter().publish(f.publication())).rejects.toThrow()
    expect(f.server.publications).toBe(0)
  })
  it('burns an uncertain reservation and never adopts an existing reference',async()=>{
    const {f,a}=await ready(); f.server.loseReply=true
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow()
    expect(f.server.refs.size).toBe(1); f.server.loseReply=false
    await expect(f.adapter().verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow()
    expect(f.server.publications).toBe(0)
  })
  it('runs one preview command only after exact verification and reservation',async()=>{
    const {f}=await ready(); const result=await f.adapter().publish(f.publication())
    expect(result).toMatchObject({deployed:true,reserved:true,platformEnforced:false})
    expect(f.server.publications).toBe(1); expect(f.server.refs.size).toBe(1)
    const calls=f.command.mock.calls.filter(c=>c[0]==='vercel'&&c[1][0]==='deploy')
    expect(calls).toHaveLength(1)
    expect(calls[0][2].env).not.toHaveProperty('GH_TOKEN')
  })
  it('never retries or releases the claim after a failed deployment',async()=>{
    const {f}=await ready(); f.server.failPublish=true
    await expect(f.adapter().publish(f.publication())).rejects.toThrow()
    expect(f.server.refs.size).toBe(1); expect(f.server.publications).toBe(1)
    f.server.failPublish=false
    await expect(f.adapter().publish(resolve(f.cwd,'second-host'))).rejects.toThrow()
    expect(f.server.publications).toBe(1)
  })
  it('denies publication without explicit live enablement',async()=>{
    const {f}=await ready(); const output=f.publication(); delete f.e.HARVEY_OIDC_PUBLICATION_ENABLED
    await expect(f.adapter().publish(output)).rejects.toThrow(deny); expect(f.server.refs.size).toBe(0)
  })
  it.each(['head_sha','path','actor','run_attempt'])('denies wrong proof origin %s before reservation',async key=>{
    const {f}=await ready(); const output=f.publication(); f.facts[`actions/runs/${runId}`][key]='wrong'
    await expect(f.adapter().publish(output)).rejects.toThrow(deny); expect(f.server.refs.size).toBe(0)
  })
  it.each(['digest','workflow_run','name','expired'])('denies wrong proof artifact %s',async key=>{
    const {f}=await ready(); const output=f.publication(); f.facts['actions/artifacts/701'][key]='wrong'
    await expect(f.adapter().publish(output)).rejects.toThrow(deny); expect(f.server.refs.size).toBe(0)
  })
})


describe('journal cross-host failures and actual local Git CAS',()=>{
  it('retains the same claim between independent publishing hosts',async()=>{
    const first=fixture(),second=fixture(first.server)
    const a=await first.chain(),b=await second.chain();first.approveReceipt();second.approveReceipt()
    expect(first.cwd).not.toBe(second.cwd)
    await a.verifyPublication({directory:first.output,approvalRunId:'901'})
    await expect(b.verifyPublication({directory:second.output,approvalRunId:'901'})).rejects.toThrow(deny)
    expect(first.server.refs.size).toBe(1)
  })
  it('burns the grant when the saved policy changes during reservation',async()=>{
    const f=fixture(),a=await f.chain();f.approveReceipt()
    const original=f.command.getMockImplementation()!
    f.command.mockImplementation((file,args,options)=>{
      const result=original(file,args,options)
      if(file==='gh'&&args.includes('POST'))f.facts['rulesets/610'].enforcement='disabled'
      return result
    })
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow(deny)
    expect(f.server.refs.size).toBe(1);expect(f.server.publications).toBe(0)
  })
  it('does not interpret a non-201 response as permission to publish',async()=>{
    const f=fixture(),a=await f.chain();f.approveReceipt()
    const original=f.command.getMockImplementation()!
    f.command.mockImplementation((file,args,options)=>{
      const result=original(file,args,options)
      return file==='gh'&&args.includes('POST')?String(result).replace('201 Created','200 OK'):result
    })
    await expect(a.verifyPublication({directory:f.output,approvalRunId:'901'})).rejects.toThrow(deny)
    expect(f.server.publications).toBe(0)
  })
  it('actual local Git permits one concurrent zero-old-OID creation, not GitHub ruleset proof',async()=>{
    const repo=temp();execFileSync('git',['init','--bare',repo],{stdio:'ignore'})
    const oid=execFileSync('git',['--git-dir',repo,'hash-object','-w','--stdin'],{input:'non-sensitive local CAS fixture',encoding:'utf8'}).trim()
    const ref=JOURNAL_PREFIX+'b'.repeat(64),args=['--git-dir',repo,'update-ref',ref,oid,'0'.repeat(40)]
    const attempts=await Promise.all(Array.from({length:8},()=>new Promise<number|null>((ok,no)=>{
      const child=spawn('git',args,{stdio:'ignore'});child.on('error',no);child.on('exit',ok)
    })))
    expect(attempts.filter(code=>code===0)).toHaveLength(1)
    expect(attempts.filter(code=>code!==0)).toHaveLength(7)
    expect(()=>execFileSync('git',args,{stdio:'ignore'})).toThrow()
  })
})


it('rejects any proof ZIP containing raw ledger rather than sanitized evidence',async()=>{
  const f=fixture();await f.chain();f.approveReceipt();const output=f.publication()
  const original=f.command.getMockImplementation()!
  f.command.mockImplementation((file,args,options)=>{
    const result=original(file,args,options)
    return file==='unzip'&&args[0]==='-Z1'&&args[1].endsWith('proof.zip')?result+'\nledger.json':result
  })
  await expect(f.adapter().publish(output)).rejects.toThrow(deny)
  expect(f.server.refs.size).toBe(0);expect(f.server.publications).toBe(0)
})
