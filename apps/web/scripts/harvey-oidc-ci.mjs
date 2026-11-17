// CI-only adapter. No database client, deployment command or production credential.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, lstatSync, realpathSync, openSync, closeSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, sep, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson, digest, verifyLedgerAttestation, createPublicationReceipt, verifyPublicationReceipt } from './migration-guard-ledger-attestation.mjs'
import { inspectCanonicalMigrationFiles } from './migration-guard-policy.mjs'

export const CI_POLICY = Object.freeze({
  repo: 'Bumbi190/ai-operating-platform', repoId: '1244338545', ownerId: '158544361',
  ref: 'refs/heads/codex/atlas-harvey-sales-20261017',
  workflow: '.github/workflows/migration-guard-integrity.yml', workflowId: 361602445,
  environment: 'harvey-oidc-owner-once', issuer: 'https://token.actions.githubusercontent.com',
  project: 'iboepohjwrhtgshrqaol', targetProject: 'prj_WTzaRAskqTqYhJLVfoPtIVNAA1iS',
  team: 'team_NlGVrs9ZItxkK4nMgRblBCI4',
})
const SHA = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const ID = /^[1-9][0-9]*$/
const MAX_BYTES = 512 * 1024 * 1024
const deny = () => { throw Error('harvey-oidc-ci: verification failed (fail-closed)') }
const requireOk = value => { if (!value) deny() }
const parse = raw => { const obj = JSON.parse(raw); requireOk(canonicalJson(obj) === raw); return obj }
const workflowURI = () => `https://github.com/${CI_POLICY.repo}/${CI_POLICY.workflow}@${CI_POLICY.ref}`

export function readTrust(env) {
  const sha = env.HARVEY_OIDC_APPROVED_SOURCE_SHA
  requireOk(env.HARVEY_OIDC_ONCE_ENABLED === 'true' && COMMIT.test(sha ?? '') &&
    env.HARVEY_OIDC_TRUSTED_WORKFLOW_SHA === sha && ID.test(env.HARVEY_OIDC_ENVIRONMENT_ID ?? ''))
  const version = env.HARVEY_OIDC_GH_VERSION
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '')
  requireOk(match && Number(match[1]) === 2 && Number(match[2]) >= 102)
  return Object.freeze({ sha, workflowSha: sha, environmentId: env.HARVEY_OIDC_ENVIRONMENT_ID, ghVersion: version })
}

export function checkInvocation(env, trust) {
  requireOk(env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted' &&
    env.GITHUB_SERVER_URL === 'https://github.com' && env.GITHUB_API_URL === 'https://api.github.com' &&
    env.GITHUB_REPOSITORY === CI_POLICY.repo && env.GITHUB_REPOSITORY_ID === CI_POLICY.repoId &&
    env.GITHUB_REPOSITORY_OWNER_ID === CI_POLICY.ownerId && env.GITHUB_ACTOR_ID === CI_POLICY.ownerId &&
    env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === CI_POLICY.ref &&
    env.GITHUB_SHA === trust.sha && env.GITHUB_WORKFLOW_SHA === trust.workflowSha &&
    env.GITHUB_WORKFLOW_REF === `${CI_POLICY.repo}/${CI_POLICY.workflow}@${CI_POLICY.ref}` &&
    env.GITHUB_RUN_ATTEMPT === '1' && ID.test(env.GITHUB_RUN_ID ?? ''))
}

export function checkEnvironment(environment, branches, trust) {
  requireOk(String(environment.id) === trust.environmentId && environment.name === CI_POLICY.environment &&
    environment.can_admins_bypass === false && environment.deployment_branch_policy?.custom_branch_policies === true &&
    environment.deployment_branch_policy?.protected_branches === false)
  const rules = environment.protection_rules?.filter(r => r.type === 'required_reviewers') ?? []
  requireOk(rules.length === 1 && rules[0].reviewers?.length === 1 &&
    rules[0].reviewers[0].type === 'User' && String(rules[0].reviewers[0].reviewer?.id) === CI_POLICY.ownerId)
  requireOk(branches.total_count === 1 && branches.branch_policies?.length === 1 &&
    branches.branch_policies[0].type === 'branch' &&
    branches.branch_policies[0].name === CI_POLICY.ref.slice('refs/heads/'.length))
}

export function checkRun(run, trust, runId, completed = false) {
  requireOk(String(run.id) === runId && String(run.repository?.id) === CI_POLICY.repoId &&
    String(run.repository?.owner?.id) === CI_POLICY.ownerId && run.repository?.full_name === CI_POLICY.repo &&
    String(run.head_repository?.id) === CI_POLICY.repoId && run.path === CI_POLICY.workflow &&
    run.workflow_id === CI_POLICY.workflowId && run.head_sha === trust.sha &&
    run.head_branch === CI_POLICY.ref.slice('refs/heads/'.length) && run.event === 'workflow_dispatch' &&
    run.run_attempt === 1 && String(run.actor?.id) === CI_POLICY.ownerId &&
    String(run.triggering_actor?.id) === CI_POLICY.ownerId)
  if (completed) requireOk(run.status === 'completed' && run.conclusion === 'success')
}

// The review comment is an exact canonical binding, read from GitHub, not a PR-provided boolean.
export function ownerReview(reviews, binding, trust) {
  requireOk(Array.isArray(reviews))
  const expected = canonicalJson({ schema: 'omnira-oidc-owner-approval/v1', ...binding })
  const matches = reviews.filter(r => r.state === 'approved' && r.user?.type === 'User' &&
    String(r.user?.id) === CI_POLICY.ownerId && r.user?.login === 'Bumbi190' &&
    r.environments?.some(e => String(e.id) === trust.environmentId && e.name === CI_POLICY.environment) &&
    r.comment === expected)
  requireOk(matches.length === 1 && !reviews.some(r => r.state === 'rejected'))
  return `github-review:${binding.runId}:${digest(expected)}`
}

export function checkCertificate(results, trust, runId, bytes, now) {
  requireOk(Array.isArray(results) && results.length === 1)
  const v = results[0]?.verificationResult, c = v?.signature?.certificate
  // sigstore-go v1.3.0 flattens the Fulcio extension fields into certificate.
  requireOk(c && c.issuer === CI_POLICY.issuer && c.subjectAlternativeName === workflowURI() &&
    c.buildSignerURI === workflowURI() && c.buildSignerDigest === trust.workflowSha &&
    c.buildConfigURI === workflowURI() && c.buildConfigDigest === trust.workflowSha &&
    c.sourceRepositoryURI === `https://github.com/${CI_POLICY.repo}` &&
    c.sourceRepositoryIdentifier === CI_POLICY.repoId && c.sourceRepositoryOwnerIdentifier === CI_POLICY.ownerId &&
    c.sourceRepositoryDigest === trust.sha && c.sourceRepositoryRef === CI_POLICY.ref &&
    c.runnerEnvironment === 'github-hosted' && c.buildTrigger === 'workflow_dispatch' &&
    c.runInvocationURI === `https://github.com/${CI_POLICY.repo}/actions/runs/${runId}/attempts/1`)
  requireOk(v.statement?.predicateType === 'https://slsa.dev/provenance/v1' &&
    v.statement.subject?.length === 1 && v.statement.subject[0].digest?.sha256 === digest(bytes))
  requireOk(Array.isArray(v.verifiedTimestamps) && v.verifiedTimestamps.some(t => {
    const time = Date.parse(t.timestamp) / 1000
    return Number.isFinite(time) && time <= now && now - time <= 300
  }))
  return { issuer: c.issuer, workflow: `${CI_POLICY.repo}/${CI_POLICY.workflow}`,
    workflowSha: c.buildSignerDigest, runId, event: c.buildTrigger, runner: c.runnerEnvironment,
    subjectDigest: digest(bytes) }
}

// Regular files only; build packing dereferences links. Rejects PAX/GNU extensions and traversal.
export function inspectTar(bytes) {
  requireOk(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES && bytes.length % 512 === 0)
  let at = 0, ended = false; const names = new Set(), files = []
  while (at < bytes.length) {
    const h = bytes.subarray(at, at + 512)
    if (h.every(x => x === 0)) { requireOk(bytes.length - at >= 1024 && bytes.subarray(at).every(x => x === 0)); ended = true; break }
    const text = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '')
    const octal = (a, b) => { const s = text(a, b).trim(); requireOk(/^[0-7]+$/.test(s)); return parseInt(s, 8) }
    const stored = octal(148, 156), sum = h.reduce((n, v, i) => n + (i >= 148 && i < 156 ? 32 : v), 0)
    requireOk(sum === stored && text(257, 263) === 'ustar')
    const prefix = text(345, 500), name = (prefix ? prefix + '/' : '') + text(0, 100), kind = h[156]
    const normalized = name.replace(/\/$/, '')
    const parts = normalized.split('/')
    requireOk(!names.has(normalized) && !/[\x00-\x1f\x7f]/.test(name) && parts.every(p => p && p !== '.' && p !== '..' && !p.includes('\\') && !p.includes(':')) &&
      parts[0] === 'output' && !parts.some(p => /^\.env(?:\.|$)/i.test(p) || /^(?:project\.json|.*\.(?:pem|key)|credentials|cookies)$/i.test(p)))
    requireOk(kind === 0 || kind === 48 || kind === 53)
    const size = octal(124, 136); requireOk(Number.isSafeInteger(size) && size >= 0 && at + 512 + size <= bytes.length)
    if (kind === 53) requireOk(size === 0)
    else {
      const mode = octal(100, 108); requireOk((mode & ~0o777) === 0)
      if (name === 'output/config.json') {
        const config = JSON.parse(bytes.subarray(at + 512, at + 512 + size).toString('utf8'))
        requireOk(config.version === 3 && !(config.crons?.length))
      }
      files.push({ path: name, sha256: digest(bytes.subarray(at + 512, at + 512 + size)), mode })
    }
    names.add(normalized); at += 512 + Math.ceil(size / 512) * 512
  }
  requireOk(ended && files.some(f => f.path === 'output/config.json'))
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export function checkArtifact(artifact, manifest, context) {
  requireOk(digest(artifact) === context.artifactDigest && manifest.schema === 'omnira-oidc-build/v1' &&
    manifest.sourceSha === context.sourceSha && manifest.checkoutSha === context.checkoutSha &&
    manifest.sourceDigest === context.sourceDigest && manifest.policyDigest === context.policyDigest &&
    manifest.artifactDigest === context.artifactDigest && manifest.targetProject === context.targetProject &&
    manifest.target === 'preview' && manifest.runAttempt === 1 && ID.test(manifest.buildRunId ?? ''))
  requireOk(canonicalJson(inspectTar(artifact)) === canonicalJson(manifest.files))
}

export function cleanBuildEnv(env) {
  const clean = {}
  for (const k of ['PATH','HOME','USERPROFILE','SystemRoot','TEMP','TMP','TMPDIR','RUNNER_TEMP'])
    if (env[k]) clean[k] = env[k]
  return { ...clean, CI: 'true', NEXT_TELEMETRY_DISABLED: '1', VERCEL_TELEMETRY_DISABLED: '1', npm_config_audit: 'false' }
}

const runCommand = (file, args, options = {}) => {
  try { return execFileSync(file, args, {
    encoding: 'utf8', maxBuffer: MAX_BYTES, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], ...options,
  }) } catch { deny() } // Never surface command stderr, credentials or tokens through thrown errors.
}

export function createAdapter({ env = process.env, cwd = process.cwd(), command = runCommand,
  now = () => Math.floor(Date.now() / 1000),
  readMigrations = () => readdirSync(resolve(cwd, 'apps/web/supabase/migrations')) } = {}) {
  const trust = readTrust(env)
  const gh = args => command('gh', args, { cwd, env: { ...cleanBuildEnv(env), GH_HOST: 'github.com', GH_TOKEN: env.GH_TOKEN, GH_PROMPT_DISABLED: '1' } })
  const api = path => JSON.parse(gh(['api', '--hostname', 'github.com', '--method', 'GET', `repos/${CI_POLICY.repo}/${path}`]))
  const git = args => command('git', args, { cwd, env: cleanBuildEnv(env) }).trim()
  const policyDigest = () => digest(readFileSync(resolve(cwd, 'apps/web/scripts/migration-guard-policy.mjs')))
  const sourceDigest = () => {
    const files = git(['ls-files', '-z']).split('\0').filter(Boolean).sort()
    requireOk(files.length > 0)
    return digest(canonicalJson(files.map(path => {
      const full = resolve(cwd, path); requireOk(!path.split('/').some(p => /^\.env(?:\.|$)/i.test(p)) && lstatSync(full).isFile())
      return { path, sha256: digest(readFileSync(full)) }
    })))
  }
  function cliVersion() {
    const version = gh(['--version']).match(/^gh version (\d+\.\d+\.\d+)\b/)?.[1]
    requireOk(version === trust.ghVersion)
  }
  async function preflight() {
    checkInvocation(env, trust); cliVersion()
    requireOk(git(['rev-parse', 'HEAD']) === trust.sha)
    requireOk(git(['status', '--porcelain', '--untracked-files=no']) === '')
    const base = `environments/${CI_POLICY.environment}`
    checkEnvironment(api(base), api(base + '/deployment-branch-policies?per_page=100'), trust)
    checkRun(api(`actions/runs/${env.GITHUB_RUN_ID}`), trust, env.GITHUB_RUN_ID)
  }
  const reviews = runId => api(`actions/runs/${runId}/approvals`)
  const context = (artifactDigest, manifest, runId = env.GITHUB_RUN_ID) => ({
    sourceSha: trust.sha, checkoutSha: trust.sha, sourceDigest: manifest.sourceDigest,
    policyDigest: policyDigest(), artifactDigest, runId, runAttempt: 1,
    project: CI_POLICY.project, targetProject: CI_POLICY.targetProject, target: 'preview',
  })
  async function verifiedOrigin(bytes, bundle, runId, binding) {
    requireOk(ID.test(runId) && isAbsolute(bundle) && lstatSync(bundle).isFile())
    cliVersion(); checkRun(api(`actions/runs/${runId}`), trust, runId)
    const approvalId = ownerReview(reviews(binding.runId), binding, trust)
    // --cert-identity and --signer-workflow are mutually exclusive in GitHub CLI.
    const args = ['attestation', 'verify', '-', '--repo', CI_POLICY.repo, '--hostname', 'github.com',
      '--bundle', bundle, '--cert-identity', workflowURI(), '--cert-oidc-issuer', CI_POLICY.issuer,
      '--signer-digest', trust.workflowSha, '--source-digest', trust.sha, '--source-ref', CI_POLICY.ref,
      '--deny-self-hosted-runners', '--format', 'json']
    // gh verifies a real file, not stdin; the private temporary subject file is byte-checked below.
    const subject = resolve(dirname(bundle), '.subject-' + digest(bytes) + '.json')
    if (!existsSync(subject)) writeFileSync(subject, bytes, { flag: 'wx', mode: 0o600 })
    requireOk(digest(readFileSync(subject)) === digest(bytes)); args[2] = subject
    const result = JSON.parse(gh(args))
    return { ...checkCertificate(result, trust, runId, bytes, now()), ownerApprovedDigest: digest(bytes), approvalId }
  }
  async function build(output) {
    await preflight()
    const before = sourceDigest(), pinnedCli = env.HARVEY_OIDC_VERCEL_CLI_VERSION
    requireOk(/^\d+\.\d+\.\d+$/.test(pinnedCli ?? '') && !existsSync(resolve(cwd, '.vercel')))
    // Local compilation only. The actual attest-based Guard is mandatory before any publication.
    const settings = { projectId: CI_POLICY.targetProject, orgId: CI_POLICY.team, settings: {
      framework: 'nextjs', rootDirectory: 'apps/web', nodeVersion: '24.x',
      buildCommand: 'node scripts/build-voice-vad.mjs && node scripts/build-design-skills.mjs && next build',
      installCommand: 'npm ci' } }
    mkdirSync(resolve(cwd, '.vercel')); writeFileSync(resolve(cwd, '.vercel/project.json'), JSON.stringify(settings))
    const childEnv = cleanBuildEnv(env)
    command('npm', ['exec', '--yes', '--package', `vercel@${pinnedCli}`, '--', 'vercel', 'build', '--yes', '--target=preview'],
      { cwd, env: childEnv, timeout: 1500000 })
    requireOk(sourceDigest() === before)
    const built = resolve(cwd, '.vercel/output'), config = JSON.parse(readFileSync(resolve(built, 'config.json'), 'utf8'))
    requireOk(config.version === 3 && !(config.crons?.length))
    const artifact = command('tar', ['--format=ustar', '--dereference', '-cf', '-', '-C', dirname(built), 'output'],
      { cwd, env: childEnv, encoding: null })
    const files = inspectTar(artifact)
    const manifest = { schema: 'omnira-oidc-build/v1', sourceSha: trust.sha, checkoutSha: trust.sha,
      sourceDigest: before, policyDigest: policyDigest(), artifactDigest: digest(artifact),
      buildRunId: env.GITHUB_RUN_ID, runAttempt: 1, targetProject: CI_POLICY.targetProject, target: 'preview', files }
    mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'artifact.tar'), artifact)
    writeFileSync(resolve(output, 'manifest.json'), canonicalJson(manifest))
    return { status: 'BUILT_NOT_AUTHORIZED', artifactDigest: manifest.artifactDigest }
  }
  async function prepare(output) {
    await preflight()
    const buildRunId = env.BUILD_RUN_ID, artifactId = env.BUILD_ARTIFACT_ID
    requireOk(ID.test(buildRunId ?? '') && ID.test(artifactId ?? '') && SHA.test(env.ARTIFACT_SHA256 ?? ''))
    checkRun(api(`actions/runs/${buildRunId}`), trust, buildRunId, true)
    const jobs = api(`actions/runs/${buildRunId}/jobs?filter=all&per_page=100`)
    requireOk(jobs.total_count <= 100 && ['Migration Guard Integrity', 'oidc_build'].every(name =>
      jobs.jobs?.some(j => j.name === name && j.conclusion === 'success' && j.run_attempt === 1)))
    const meta = api(`actions/artifacts/${artifactId}`)
    requireOk(String(meta.id) === artifactId && meta.expired === false && meta.size_in_bytes <= MAX_BYTES &&
      meta.workflow_run?.id === Number(buildRunId) && meta.workflow_run?.head_sha === trust.sha &&
      meta.name === `harvey-oidc-build-${trust.sha}-${buildRunId}` && /^sha256:[a-f0-9]{64}$/.test(meta.digest ?? ''))
    const zip = command('gh', ['api', '--hostname', 'github.com', '--method', 'GET', `repos/${CI_POLICY.repo}/actions/artifacts/${artifactId}/zip`],
      { cwd, env: { ...cleanBuildEnv(env), GH_TOKEN: env.GH_TOKEN, GH_HOST: 'github.com' }, encoding: null })
    requireOk(Buffer.isBuffer(zip) && `sha256:${digest(zip)}` === meta.digest)
    mkdirSync(output, { recursive: true }); const zipPath = resolve(output, 'build.zip')
    writeFileSync(zipPath, zip, { flag: 'wx', mode: 0o600 })
    const names = command('unzip', ['-Z1', zipPath], { env: cleanBuildEnv(env) }).trim().split('\n').sort()
    requireOk(canonicalJson(names) === canonicalJson(['artifact.tar','manifest.json']))
    const artifact = command('unzip', ['-p', zipPath, 'artifact.tar'], { env: cleanBuildEnv(env), encoding: null })
    const rawManifest = command('unzip', ['-p', zipPath, 'manifest.json'], { env: cleanBuildEnv(env) })
    const manifest = parse(rawManifest), ctx = context(env.ARTIFACT_SHA256, manifest)
    requireOk(manifest.buildRunId === buildRunId && manifest.sourceDigest === sourceDigest())
    checkArtifact(artifact, manifest, ctx)
    const raw = env.LEDGER_JSON; requireOk(typeof raw === 'string' && raw.length <= 65000)
    const ledger = parse(raw)
    const exactKeys = (value, keys) => canonicalJson(Object.keys(value).sort()) === canonicalJson(keys.sort())
    requireOk(exactKeys(ledger, ['schema','source','project','sourceSha','queryDigest','issuedAt','expiresAt','rows','contentDigest']) &&
      ledger.schema === 'omnira-ledger-export/v1' && ledger.source === 'supabase_migrations.schema_migrations' &&
      Array.isArray(ledger.rows) && ledger.rows.length <= 1000 &&
      ledger.rows.every(row => row && exactKeys(row, ['name','version','sql_sha256']) &&
        /^[a-z0-9_]+$/.test(row.name) && /^\d+$/.test(row.version) && SHA.test(row.sql_sha256)) &&
      Number.isSafeInteger(ledger.issuedAt) && Number.isSafeInteger(ledger.expiresAt))
    requireOk(ledger.sourceSha === trust.sha && ledger.project === CI_POLICY.project && ledger.issuedAt <= now() &&
      ledger.expiresAt > now() && ledger.expiresAt - ledger.issuedAt <= 300 && now() - ledger.issuedAt <= 300)
    const binding = { kind: 'export', runId: env.GITHUB_RUN_ID, sourceSha: trust.sha,
      subjectDigest: digest(raw), buildRunId, artifactId, artifactDigest: ctx.artifactDigest }
    ownerReview(reviews(env.GITHUB_RUN_ID), binding, trust)
    for (const [name, data] of Object.entries({ 'ledger.json': raw, 'artifact.tar': artifact,
      'manifest.json': rawManifest, 'binding.json': canonicalJson(binding) })) writeFileSync(resolve(output, name), data, { flag: 'wx', mode: 0o600 })
    return { status: 'PREPARED_NOT_AUTHORIZED' }
  }
  async function guard(directory) {
    await preflight()
    const raw = readFileSync(resolve(directory, 'ledger.json'), 'utf8'), manifest = parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
    const artifact = readFileSync(resolve(directory, 'artifact.tar')), binding = parse(readFileSync(resolve(directory, 'binding.json'), 'utf8'))
    const ctx = context(digest(artifact), manifest)
    requireOk(binding.subjectDigest === digest(raw) && binding.sourceSha === trust.sha && binding.runId === ctx.runId &&
      binding.artifactDigest === ctx.artifactDigest && manifest.sourceDigest === sourceDigest())
    checkArtifact(artifact, manifest, ctx)
    const origin = await verifiedOrigin(Buffer.from(raw), env.LEDGER_BUNDLE, ctx.runId, binding)
    const trusted = { issuer: CI_POLICY.issuer, exportWorkflow: origin.workflow, exportWorkflowSha: trust.workflowSha,
      exportRunId: ctx.runId, exportApprovalId: origin.approvalId }
    const verifiedGuard = await verifyLedgerAttestation({ raw, proof: {}, trusted, verifyOrigin: async () => origin,
      context: ctx, repositoryState: inspectCanonicalMigrationFiles(readMigrations()), now: now() })
    const receipt = createPublicationReceipt({ verifiedGuard, context: ctx, artifact, now: now() })
    writeFileSync(resolve(directory, 'receipt.json'), receipt, { flag: 'wx', mode: 0o600 })
    writeFileSync(resolve(directory, 'ledger.sigstore.json'), readFileSync(env.LEDGER_BUNDLE), { flag: 'wx', mode: 0o600 })
    return { status: 'GUARD_PASS_NOT_AUTHORIZED', receiptDigest: digest(receipt) }
  }
  async function evidence(directory) {
    await preflight()
    const bytes = readFileSync(resolve(directory, 'receipt.json')), body = parse(bytes.toString('utf8'))
    // Receipt signature is verified now; owner approval of its exact digest is STILL required later.
    const binding = parse(readFileSync(resolve(directory, 'binding.json'), 'utf8'))
    const ledgerRaw = readFileSync(resolve(directory, 'ledger.json'))
    await verifiedOrigin(ledgerRaw, resolve(directory, 'ledger.sigstore.json'), body.runId, binding)
    const version = gh(['--version']); requireOk(version.startsWith('gh version ' + trust.ghVersion + ' '))
    const results = JSON.parse(gh(['attestation','verify',resolve(directory, 'receipt.json'),'--repo',CI_POLICY.repo,
      '--hostname','github.com','--bundle',env.RECEIPT_BUNDLE,'--cert-identity',workflowURI(),
      '--cert-oidc-issuer',CI_POLICY.issuer,'--signer-digest',trust.workflowSha,'--source-digest',trust.sha,
      '--source-ref',CI_POLICY.ref,'--deny-self-hosted-runners','--format','json']))
    checkCertificate(results, trust, body.runId, bytes, now())
    requireOk(body.exportDigest === digest(ledgerRaw) && body.expiresAt > now())
    writeFileSync(resolve(directory, 'receipt.sigstore.json'), readFileSync(env.RECEIPT_BUNDLE), { flag: 'wx', mode: 0o600 })
    const summary = { status: 'SIGNED_EVIDENCE_NOT_PUBLICATION_AUTHORIZATION', sourceSha: trust.sha,
      runId: body.runId, receiptDigest: digest(bytes), artifactDigest: body.artifactDigest, expiresAt: body.expiresAt,
      platformEnforced: false }
    writeFileSync(resolve(directory, 'verification-summary.json'), canonicalJson(summary), { flag: 'wx', mode: 0o600 })
    return summary
  }
  // This verifies and reserves; it NEVER calls Vercel. The journal must persist on the trusted publisher.
  async function verifyPublication({ directory, approvalRunId, journalDirectory }) {
    await preflight(); requireOk(ID.test(approvalRunId ?? '') && approvalRunId === env.GITHUB_RUN_ID)
    checkRun(api(`actions/runs/${approvalRunId}`), trust, approvalRunId)
    const raw = readFileSync(resolve(directory, 'receipt.json'), 'utf8'), body = parse(raw)
    checkRun(api(`actions/runs/${body.runId}`), trust, body.runId, true)
    const artifact = readFileSync(resolve(directory, 'artifact.tar')), manifest = parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
    const ctx = context(digest(artifact), manifest, body.runId); checkArtifact(artifact, manifest, ctx)
    const binding = { kind: 'receipt', runId: approvalRunId, receiptRunId: body.runId, sourceSha: trust.sha,
      subjectDigest: digest(raw), artifactDigest: ctx.artifactDigest, targetProject: ctx.targetProject, target: 'preview' }
    const origin = await verifiedOrigin(Buffer.from(raw), resolve(directory, 'receipt.sigstore.json'), body.runId, binding)
    const trusted = { issuer: CI_POLICY.issuer, receiptWorkflow: origin.workflow,
      receiptWorkflowSha: trust.workflowSha, receiptApprovalId: origin.approvalId }
    const result = await verifyPublicationReceipt({ raw, proof: {}, trusted, verifyOrigin: async () => origin,
      context: ctx, artifact, now: now() })
    const journal = realpathSync(journalDirectory)
    requireOk(![cwd, directory].some(base => { const rel = relative(realpathSync(base), journal); return rel === '' || (!rel.startsWith('..' + sep) && !isAbsolute(rel)) }))
    const fd = openSync(resolve(journal, digest(raw) + '.reserved.json'), 'wx', 0o600)
    try { writeFileSync(fd, canonicalJson({ sourceSha: trust.sha, receiptDigest: digest(raw), approvalRunId, reservedAt: now() })) }
    finally { closeSync(fd) }
    return { ...result, reserved: true, deployed: false }
  }
  return { build, prepare, guard, evidence, preflight, verifiedOrigin, verifyPublication }
}

export async function main(args = process.argv.slice(2)) {
  const [mode, option, output] = args
  requireOk(args.length === 3 && ['build','prepare','guard','evidence'].includes(mode) &&
    option === (['build','prepare'].includes(mode) ? '--output' : '--directory') && isAbsolute(output))
  return createAdapter()[mode](resolve(output))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('harvey-oidc-ci: verification failed (fail-closed)'); process.exitCode = 1
  })
}
