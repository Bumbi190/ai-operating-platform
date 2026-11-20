// CI-only adapter. No database client or production credential; publication is owner-gated.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, lstatSync, realpathSync, openSync, closeSync, existsSync, constants, fstatSync, readSync, mkdtempSync, unlinkSync, rmSync, chmodSync } from 'node:fs'
import { resolve, relative, dirname, sep, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
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
const ownerApproval = (r, trust) => r.state === 'approved' && r.user?.type === 'User' &&
  String(r.user?.id) === CI_POLICY.ownerId && r.user?.login === 'Bumbi190' &&
  r.environments?.some(e => String(e.id) === trust.environmentId && e.name === CI_POLICY.environment)

function registeredBinding(reviews, trust) {
  requireOk(Array.isArray(reviews))
  const approvals = reviews.filter(r => ownerApproval(r, trust))
  requireOk(approvals.length === 1 && typeof approvals[0].comment === 'string')
  return parse(approvals[0].comment)
}

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
  const matches = reviews.filter(r => ownerApproval(r, trust) && r.comment === expected)
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

// Proposed GitHub journal policy; live rulesets require separate owner approval/testing.
export const JOURNAL_PREFIX = 'refs/tags/harvey-oidc-once/'
export function journalTrust(env) {
  const immutable = env.HARVEY_OIDC_JOURNAL_IMMUTABLE_RULESET_ID
  const creator = env.HARVEY_OIDC_JOURNAL_CREATION_RULESET_ID
  const app = env.HARVEY_OIDC_JOURNAL_CREATOR_APP_ID
  requireOk(env.HARVEY_OIDC_JOURNAL_MODE === 'github-tags-v1' &&
    [immutable, creator, app].every(v => ID.test(v ?? '')) && immutable !== creator)
  return { immutable, creator, app }
}
export function checkJournalPolicy(immutable, creator, trust) {
  const common = rule => rule?.target === 'tag' && rule.enforcement === 'active' &&
    rule.conditions?.ref_name?.include?.length === 1 &&
    rule.conditions.ref_name.include[0] === JOURNAL_PREFIX + '*' &&
    Array.isArray(rule.conditions.ref_name.exclude) && rule.conditions.ref_name.exclude.length === 0
  requireOk(common(immutable) && common(creator) && String(immutable.id) === trust.immutable &&
    String(creator.id) === trust.creator && immutable.bypass_actors?.length === 0 &&
    immutable.rules?.length === 2 && ['update','deletion'].every(t => immutable.rules.some(r => r.type === t)) &&
    creator.rules?.length === 1 && creator.rules[0].type === 'creation' && creator.bypass_actors?.length === 1 &&
    creator.bypass_actors[0].actor_type === 'Integration' &&
    String(creator.bypass_actors[0].actor_id) === trust.app && creator.bypass_actors[0].bypass_mode === 'always')
}

// This profile belongs only to the isolated project. Production vercel.json is an input,
// never an output. Pin its canonical content so a new cron cannot be silently discarded.
export const OIDC_BUILD_PROFILE = Object.freeze({
  schema: 'omnira-oidc-build-profile/v1', id: 'harvey-oidc-test-v1',
  projectId: CI_POLICY.targetProject, orgId: CI_POLICY.team, target: 'preview',
  sourceConfigDigest: 'dcc992fb4aee2b2efc38cb90c67661665d84e328615fcf6579fbc22740beca88',
  effectiveConfigDigest: '42536b7ec73167d20f2186d8af81af37a760d54b99cd7c68a4404c90a64176d1',
  settingsDigest: 'e372232be110b2f963d526b7dea7c25a0f9ac4c82c35da9304fa378076cc97ba',
})
export const OIDC_PROFILE_ENTRY = 'output/diagnostics/harvey-oidc-build-profile.json'
export function oidcBuildProfile(env, rawProductionConfig) {
  requireOk(env.HARVEY_OIDC_BUILD_PROFILE === OIDC_BUILD_PROFILE.id &&
    env.HARVEY_OIDC_BUILD_PROJECT_ID === CI_POLICY.targetProject &&
    env.HARVEY_OIDC_BUILD_TEAM_ID === CI_POLICY.team && env.HARVEY_OIDC_BUILD_TARGET === 'preview' &&
    (!env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID === CI_POLICY.targetProject) &&
    (!env.VERCEL_ORG_ID || env.VERCEL_ORG_ID === CI_POLICY.team) &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === 'preview') &&
    (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === 'preview'))
  const original = JSON.parse(rawProductionConfig)
  requireOk(digest(canonicalJson(original)) === OIDC_BUILD_PROFILE.sourceConfigDigest)
  const config = { ...original, crons: [] }
  const settings = { projectId: CI_POLICY.targetProject, orgId: CI_POLICY.team, settings: {
    framework: 'nextjs', rootDirectory: 'apps/web', nodeVersion: '24.x',
    buildCommand: 'node scripts/build-voice-vad.mjs && node scripts/build-design-skills.mjs && next build',
    installCommand: 'npm ci' } }
  requireOk(digest(canonicalJson(config)) === OIDC_BUILD_PROFILE.effectiveConfigDigest &&
    digest(canonicalJson(settings)) === OIDC_BUILD_PROFILE.settingsDigest)
  return { profile: OIDC_BUILD_PROFILE, config, settings, sourceRawDigest: digest(rawProductionConfig) }
}
export function prepareOidcBuild(cwd, env) {
  const plan = oidcBuildProfile(env, readEvidenceFile(resolve(cwd, 'apps/web/vercel.json')).toString('utf8'))
  const folder = resolve(cwd, '.vercel')
  mkdirSync(folder, { mode: 0o700 }) // Existing links/configuration are not adopted.
  const localConfigPath = resolve(folder, 'harvey-oidc-test.json')
  writeFileSync(localConfigPath, canonicalJson(plan.config), { flag: 'wx', mode: 0o600 })
  writeFileSync(resolve(folder, 'project.json'), canonicalJson(plan.settings), { flag: 'wx', mode: 0o600 })
  return { ...plan, localConfigPath }
}
function cronFreeOutput(config) {
  return config?.version === 3 &&
    (!Object.hasOwn(config, 'crons') || Array.isArray(config.crons) && config.crons.length === 0) &&
    (!Object.hasOwn(config, 'daemons') || config.daemons && typeof config.daemons === 'object' &&
      !Array.isArray(config.daemons) && Object.keys(config.daemons).length === 0)
}
export function sealOidcOutput(cwd, plan) {
  requireOk(canonicalJson(plan.profile) === canonicalJson(OIDC_BUILD_PROFILE) &&
    plan.localConfigPath === resolve(cwd, '.vercel/harvey-oidc-test.json') &&
    digest(readEvidenceFile(resolve(cwd, 'apps/web/vercel.json'))) === plan.sourceRawDigest &&
    digest(readEvidenceFile(plan.localConfigPath)) === OIDC_BUILD_PROFILE.effectiveConfigDigest &&
    digest(canonicalJson(JSON.parse(readEvidenceFile(resolve(cwd, '.vercel/project.json')).toString('utf8')))) === OIDC_BUILD_PROFILE.settingsDigest)
  const built = resolve(cwd, '.vercel/output')
  requireOk(cronFreeOutput(JSON.parse(readEvidenceFile(resolve(built, 'config.json')).toString('utf8'))))
  mkdirSync(resolve(built, 'diagnostics'), { recursive: true, mode: 0o700 })
  // Written BEFORE packing/hashing. No fields from a ledger, credential or token belong here.
  writeFileSync(resolve(cwd, '.vercel', OIDC_PROFILE_ENTRY), canonicalJson(OIDC_BUILD_PROFILE), { flag: 'wx', mode: 0o600 })
  return built
}

// Regular files only; build packing dereferences links. Rejects PAX/GNU extensions and traversal.
export function inspectTar(bytes) {
  requireOk(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES && bytes.length % 512 === 0)
  let at = 0, ended = false, profileSeen = false; const names = new Set(), files = []
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
        requireOk(cronFreeOutput(config))
      }
      if (name === OIDC_PROFILE_ENTRY) {
        requireOk(bytes.subarray(at + 512, at + 512 + size).toString('utf8') === canonicalJson(OIDC_BUILD_PROFILE))
        profileSeen = true
      }
      if (name.endsWith('/vercel.json')) {
        const nested = JSON.parse(bytes.subarray(at + 512, at + 512 + size).toString('utf8'))
        requireOk(!Object.hasOwn(nested, 'crons') || Array.isArray(nested.crons) && nested.crons.length === 0)
      }
      files.push({ path: name, sha256: digest(bytes.subarray(at + 512, at + 512 + size)), mode })
    }
    names.add(normalized); at += 512 + Math.ceil(size / 512) * 512
  }
  requireOk(ended && profileSeen && files.some(f => f.path === 'output/config.json'))
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export function checkArtifact(artifact, manifest, context) {
  requireOk(canonicalJson(manifest.buildProfile) === canonicalJson(OIDC_BUILD_PROFILE) &&
    manifest.buildProfileDigest === digest(canonicalJson(OIDC_BUILD_PROFILE)))
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


// Read through one descriptor: a pathname/type check must never authorize a later reopen.
function readEvidenceFile(path, allowEmpty = false, privateInput = false) {
  let fd
  try {
    requireOk(isAbsolute(path))
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    const before = fstatSync(fd), entry = lstatSync(path)
    requireOk((!privateInput || process.platform !== 'linux' || (before.mode & 0o077) === 0) &&
      before.isFile() && entry.isFile() && before.nlink === 1 &&
      before.dev === entry.dev && before.ino === entry.ino && (allowEmpty || before.size > 0) && before.size <= MAX_BYTES)
    const bytes = readFileSync(fd), after = fstatSync(fd)
    requireOk(before.size === bytes.length && after.size === before.size &&
      after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs)
    return bytes
  } catch { deny() }
  finally { if (fd !== undefined) closeSync(fd) }
}

// Resolve only Vercel's internal output links. tar sees a private regular-file
// snapshot, never source symlinks, and its bytes must match the descriptor reads.
/** @param {string} cwd
 * @param {(file: string, args: string[], options?: object) => unknown} command
 * @returns {Buffer} */
export function packOidcOutput(cwd, command = runCommand, env = cleanBuildEnv(process.env)) {
  const built = resolve(cwd, '.vercel/output'), root = realpathSync(built)
  requireOk(root === built)
  const directory = mkdtempSync(resolve(tmpdir(), 'harvey-oidc-pack-')), expected = []
  let total = 0
  const inside = path => path === root || path.startsWith(root + sep)
  const copy = (source, target, ancestors = new Set()) => {
    const actual = realpathSync(source)
    requireOk(inside(actual))
    const directoryEntries = anchor => {
      requireOk(!ancestors.has(actual))
      mkdirSync(target, { mode: 0o700 })
      const next = new Set(ancestors).add(actual)
      for (const name of readdirSync(anchor).sort()) copy(resolve(anchor, name), resolve(target, name), next)
    }
    // Windows cannot open directories with openSync; file reads below still use
    // one descriptor. The publication runner uses Linux's descriptor-anchored walk.
    if (process.platform === 'win32') {
      try { readdirSync(actual); directoryEntries(actual); return }
      catch (error) { if (error.code !== 'ENOTDIR') throw error }
    }
    let fd
    try {
      fd = openSync(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      const before = fstatSync(fd)
      const anchor = process.platform === 'linux' ? `/proc/self/fd/${fd}` : actual
      requireOk(inside(realpathSync(anchor)))
      if (before.isDirectory()) { directoryEntries(anchor); return }
      requireOk(before.isFile() && before.size <= MAX_BYTES - total && expected.length < 100000)
      const bytes = readFileSync(fd), after = fstatSync(fd)
      requireOk(bytes.length === before.size && after.size === before.size &&
        after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs)
      total += bytes.length
      const mode = before.mode & 0o111 ? 0o755 : 0o644
      writeFileSync(target, bytes, { flag: 'wx', mode }); chmodSync(target, mode)
      expected.push({ path: relative(directory, target).split(sep).join('/'), sha256: digest(bytes), mode })
    } finally { if (fd !== undefined) closeSync(fd) }
  }
  try {
    copy(built, resolve(directory, 'output'))
    // --hard-dereference is required by GNU tar; no --dereference here.
    const artifact = command('tar', ['--format=ustar', '--hard-dereference', '-cf', '-', '-C', directory, 'output'],
      { cwd, env, encoding: null })
    requireOk(canonicalJson(inspectTar(artifact)) === canonicalJson(expected.sort((a, b) => a.path.localeCompare(b.path, 'en'))))
    return artifact
  } catch { deny() }
  finally { rmSync(directory, { recursive: true, force: true }) }
}

// The approved CI runner is Linux. The subject is an inherited read-only descriptor.
// gh requires a .json bundle suffix: its separate snapshot stays in a private directory,
// read-only on Linux, and is checked through the same descriptor after verification.
// Local command doubles also consume these exact descriptors; they do not prove gh provenance.
function withAttestationFiles(subjectBytes, bundlePath, verify) {
  const subject = Buffer.from(subjectBytes), bundle = readEvidenceFile(bundlePath)
  const directory = mkdtempSync(resolve(tmpdir(), 'harvey-oidc-attest-')), descriptors = []
  const proofPath = resolve(directory, 'bundle.json')
  try {
    for (const [name, bytes] of [['subject', subject], ['bundle', bundle]]) {
      const path = name === 'bundle' ? proofPath : resolve(directory, name)
      writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 })
      const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      descriptors.push(fd)
      const stat = fstatSync(fd)
      requireOk(stat.isFile() && stat.nlink === 1 && stat.size === bytes.length)
      if (name === 'subject') unlinkSync(path)
      else if (process.platform === 'linux') chmodSync(path, 0o400)
    }
    if (process.platform === 'linux') chmodSync(directory, 0o500)
    const result = verify('/proc/self/fd/3', proofPath, ['ignore', 'pipe', 'pipe', ...descriptors])
    // A child must not be able to change either verified input in place.
    for (const [index, expected] of [subject, bundle].entries()) {
      const fd = descriptors[index], stat = fstatSync(fd), actual = Buffer.alloc(expected.length)
      requireOk(stat.isFile() && stat.nlink === (index === 0 ? 0 : 1) && stat.size === expected.length)
      if (index === 1) {
        const entry = lstatSync(proofPath)
        requireOk(entry.isFile() && entry.dev === stat.dev && entry.ino === stat.ino)
      }
      let offset = 0
      while (offset < actual.length) {
        const count = readSync(fd, actual, offset, actual.length - offset, offset)
        requireOk(count > 0); offset += count
      }
      requireOk(digest(actual) === digest(expected))
    }
    return { result, bundleBytes: bundle }
  } finally {
    for (const fd of descriptors) closeSync(fd)
    if (process.platform === 'linux') chmodSync(directory, 0o700)
    rmSync(directory, { recursive: true, force: true })
  }
}

export function createAdapter({ env = process.env, cwd = process.cwd(), command = runCommand,
  now = () => Math.floor(Date.now() / 1000),
  readMigrations = () => readdirSync(resolve(cwd, 'apps/web/supabase/migrations')) } = {}) {
  const trust = readTrust(env)
  const gh = (args, options = {}) => command('gh', args, { ...options, cwd, env: { ...cleanBuildEnv(env), GH_HOST: 'github.com', GH_TOKEN: env.GH_TOKEN, GH_PROMPT_DISABLED: '1' } })
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
  function runJobs(runId) {
    const result = api(`actions/runs/${runId}/jobs?filter=all&per_page=100`)
    requireOk(result.total_count <= 100 && Array.isArray(result.jobs) && result.jobs.length === result.total_count)
    return result.jobs.filter(job => job.run_attempt === 1)
  }
  function requireGuardBefore(jobs, issuedAt) {
    const guards = jobs.filter(job => job.name === 'Migration Guard Integrity' && job.conclusion === 'success')
    requireOk(guards.length === 1 && Date.parse(guards[0].completed_at) / 1000 <= issuedAt)
  }
  const context = (artifactDigest, manifest, runId = env.GITHUB_RUN_ID) => ({
    sourceSha: trust.sha, checkoutSha: trust.sha, sourceDigest: manifest.sourceDigest,
    policyDigest: policyDigest(), artifactDigest, runId, runAttempt: 1,
    project: CI_POLICY.project, targetProject: CI_POLICY.targetProject, target: 'preview',
  })
  function verifySignature(bytes, bundle, runId) {
    return withAttestationFiles(bytes, bundle, (subject, proof, stdio) => {
      // --cert-identity and --signer-workflow are mutually exclusive in GitHub CLI.
      const args = ['attestation', 'verify', subject, '--repo', CI_POLICY.repo, '--hostname', 'github.com',
        '--bundle', proof, '--cert-identity', workflowURI(), '--cert-oidc-issuer', CI_POLICY.issuer,
        '--signer-digest', trust.workflowSha, '--source-digest', trust.sha, '--source-ref', CI_POLICY.ref,
        '--deny-self-hosted-runners', '--format', 'json']
      return checkCertificate(JSON.parse(gh(args, { stdio })), trust, runId, bytes, now())
    })
  }
  async function verifiedOrigin(bytes, bundle, runId, binding) {
    const subject = Buffer.from(bytes)
    requireOk(ID.test(runId) && isAbsolute(bundle))
    cliVersion(); checkRun(api(`actions/runs/${runId}`), trust, runId)
    const approvalId = ownerReview(reviews(binding.runId), binding, trust)
    const { result, bundleBytes } = verifySignature(subject, bundle, runId)
    return { ...result, ownerApprovedDigest: digest(subject), approvalId, bundleBytes }
  }
  function privateLedgerPath() {
    requireOk(isAbsolute(env.RUNNER_TEMP ?? '') && !env.LEDGER_JSON && !env.HARVEY_OIDC_LEDGER_EXPORT_JSON)
    const path = resolve(env.RUNNER_TEMP, 'harvey-oidc-secret/ledger.json')
    requireOk(env.LEDGER_EXPORT_FILE === path)
    return path
  }
  function purgeLedger(directory) {
    for (const name of ['ledger.json','binding.json','ledger.sigstore.json']) rmSync(resolve(directory, name), { force: true })
    rmSync(privateLedgerPath(), { force: true })
  }
  async function build(output) {
    await preflight()
    const before = sourceDigest(), pinnedCli = env.HARVEY_OIDC_VERCEL_CLI_VERSION
    requireOk(/^\d+\.\d+\.\d+$/.test(pinnedCli ?? ''))
    // Compilation remains separate from the mandatory attest-based Guard/publication gate.
    const plan = prepareOidcBuild(cwd, env)
    const childEnv = cleanBuildEnv(env)
    command('npm', ['exec', '--yes', '--package', `vercel@${pinnedCli}`, '--', 'vercel', 'build', '--yes', '--environment=preview',
      '--local-config', plan.localConfigPath], { cwd, env: childEnv, timeout: 1500000 })
    requireOk(sourceDigest() === before)
    sealOidcOutput(cwd, plan)
    const artifact = packOidcOutput(cwd, command, childEnv)
    const files = inspectTar(artifact)
    const manifest = { schema: 'omnira-oidc-build/v1', buildProfile: OIDC_BUILD_PROFILE,
      buildProfileDigest: digest(canonicalJson(OIDC_BUILD_PROFILE)), sourceSha: trust.sha, checkoutSha: trust.sha,
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
    mkdirSync(output, { recursive: true, mode: 0o700 }); const zipPath = resolve(output, 'build.zip')
    writeFileSync(zipPath, zip, { flag: 'wx', mode: 0o600 })
    const names = command('unzip', ['-Z1', zipPath], { env: cleanBuildEnv(env) }).trim().split('\n').sort()
    requireOk(canonicalJson(names) === canonicalJson(['artifact.tar','manifest.json']))
    const artifact = command('unzip', ['-p', zipPath, 'artifact.tar'], { env: cleanBuildEnv(env), encoding: null })
    const rawManifest = command('unzip', ['-p', zipPath, 'manifest.json'], { env: cleanBuildEnv(env) })
    const manifest = parse(rawManifest), ctx = context(env.ARTIFACT_SHA256, manifest)
    requireOk(manifest.buildRunId === buildRunId && manifest.sourceDigest === sourceDigest())
    checkArtifact(artifact, manifest, ctx)
    const inputPath = privateLedgerPath()
    const stat = lstatSync(inputPath)
    requireOk(process.platform !== 'linux' || (stat.mode & 0o077) === 0)
    const raw = readEvidenceFile(inputPath).toString('utf8'); requireOk(raw.length <= 65000)
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
    const handoffRunId = env.HANDOFF_RUN_ID
    if (handoffRunId) {
      requireOk(ID.test(handoffRunId) && handoffRunId !== binding.runId)
      const handoffRun = api(`actions/runs/${handoffRunId}`)
      checkRun(handoffRun, trust, handoffRunId)
      const handoffJobs = runJobs(handoffRunId)
      requireOk(handoffRun.status === 'waiting' &&
        handoffJobs.some(job => job.name === 'oidc_handoff_prepared' && job.status === 'waiting'))
      requireGuardBefore(handoffJobs, ledger.issuedAt)
      requireGuardBefore(runJobs(binding.runId), ledger.issuedAt)
      binding.handoffRunId = handoffRunId
    }
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
    writeFileSync(resolve(directory, 'ledger.sigstore.json'), origin.bundleBytes, { flag: 'wx', mode: 0o600 })
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
    const verifiedReceipt = verifySignature(bytes, env.RECEIPT_BUNDLE, body.runId)
    requireOk(body.exportDigest === digest(ledgerRaw) && body.expiresAt > now())
    writeFileSync(resolve(directory, 'receipt.sigstore.json'), verifiedReceipt.bundleBytes, { flag: 'wx', mode: 0o600 })
    const summary = { status: 'SIGNED_EVIDENCE_NOT_PUBLICATION_AUTHORIZATION', sourceSha: trust.sha,
      runId: body.runId, receiptDigest: digest(bytes), artifactDigest: body.artifactDigest, expiresAt: body.expiresAt,
      platformEnforced: false }
    writeFileSync(resolve(directory, 'verification-summary.json'), canonicalJson(summary), { flag: 'wx', mode: 0o600 })
    purgeLedger(directory)
    return summary
  }
  async function downloadProof(output, runId = env.PROOF_RUN_ID, id = env.PROOF_ARTIFACT_ID) {
    await preflight()
    requireOk(ID.test(id ?? '') && ID.test(runId ?? ''))
    checkRun(api(`actions/runs/${runId}`), trust, runId, true)
    const jobs = api(`actions/runs/${runId}/jobs?filter=all&per_page=100`)
    requireOk(jobs.total_count <= 100 && jobs.jobs?.some(j => j.name === 'oidc_attest' && j.conclusion === 'success' && j.run_attempt === 1))
    const meta = api(`actions/artifacts/${id}`)
    requireOk(String(meta.id) === id && meta.expired === false && meta.size_in_bytes <= MAX_BYTES &&
      meta.workflow_run?.id === Number(runId) && meta.workflow_run?.head_sha === trust.sha &&
      meta.name === `harvey-oidc-proof-${trust.sha}-${runId}` && /^sha256:[a-f0-9]{64}$/.test(meta.digest ?? ''))
    const zip = gh(['api','--hostname','github.com','--method','GET',`repos/${CI_POLICY.repo}/actions/artifacts/${id}/zip`], { encoding: null })
    requireOk(Buffer.isBuffer(zip) && 'sha256:' + digest(zip) === meta.digest)
    mkdirSync(output, { mode: 0o700 }); const archive = resolve(output, 'proof.zip')
    writeFileSync(archive, zip, { flag: 'wx', mode: 0o600 })
    const allowed = ['artifact.tar','manifest.json','receipt.json','receipt.sigstore.json','verification-summary.json'].sort()
    const names = command('unzip', ['-Z1', archive], { env: cleanBuildEnv(env) }).trim().split('\n').sort()
    requireOk(canonicalJson(names) === canonicalJson(allowed))
    for (const name of allowed) {
      const bytes = command('unzip', ['-p', archive, name], { env: cleanBuildEnv(env), encoding: null })
      requireOk(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES)
      writeFileSync(resolve(output, name), bytes, { flag: 'wx', mode: 0o600 })
    }
    rmSync(archive)
  }
  async function publish(output) {
    // Separate live approval/configuration is required. No credential reaches a builder/npm process.
    requireOk(env.HARVEY_OIDC_PUBLICATION_ENABLED === 'true' && typeof env.VERCEL_TOKEN === 'string' && env.VERCEL_TOKEN.length > 0)
    const version = command('vercel', ['--version'], { env: cleanBuildEnv(env) }).trim().replace(/^Vercel CLI /, '')
    requireOk(version === env.HARVEY_OIDC_VERCEL_CLI_VERSION)
    await downloadProof(output)
    // Capture the exact bytes before verification; descriptor hashes and the manifest bind this snapshot.
    const artifact = readEvidenceFile(resolve(output, 'artifact.tar'))
    const manifest = parse(readEvidenceFile(resolve(output, 'manifest.json')).toString('utf8'))
    const admitted = await verifyPublication({ directory: output, approvalRunId: env.GITHUB_RUN_ID })
    requireOk(digest(artifact) === admitted.artifactDigest && admitted.receiptRunId === env.PROOF_RUN_ID)
    checkArtifact(artifact, manifest, admitted)
    const staged = mkdtempSync(resolve(tmpdir(), 'harvey-oidc-prebuilt-'))
    try {
      const vercel = resolve(staged, '.vercel'); mkdirSync(vercel, { mode: 0o700 })
      writeFileSync(resolve(vercel, 'project.json'), canonicalJson({ orgId: CI_POLICY.team, projectId: CI_POLICY.targetProject }), { flag: 'wx', mode: 0o600 })
      // inspectTar already rejected extensions, links, traversal, duplicate names and active crons.
      inspectTar(artifact)
      for (let at = 0; at < artifact.length && !artifact.subarray(at, at + 512).every(x => x === 0);) {
        const h = artifact.subarray(at, at + 512), text = (a,b) => h.subarray(a,b).toString('utf8').replace(/\0.*$/s, '')
        const prefix = text(345,500), name = (prefix ? prefix + '/' : '') + text(0,100)
        const size = parseInt(text(124,136).trim(),8), mode = parseInt(text(100,108).trim(),8)
        const path = resolve(vercel, name)
        if (h[156] === 53) mkdirSync(path, { recursive: true, mode: 0o700 })
        else { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, artifact.subarray(at + 512,at + 512 + size), { flag: 'wx', mode }) }
        at += 512 + Math.ceil(size / 512) * 512
      }
      for (const file of manifest.files) requireOk(digest(readEvidenceFile(resolve(vercel, file.path), true)) === file.sha256)
      // One invocation only. Failure/timeout never deletes the reservation or retries publication.
      requireOk(admitted.expiresAt > now())
      const url = command('vercel', ['deploy','--prebuilt','--yes','--environment=preview','--scope','bumbi190s-projects'], {
        cwd: staged, env: { ...cleanBuildEnv(env), VERCEL_TOKEN: env.VERCEL_TOKEN }, timeout: 120000,
      }).trim()
      requireOk(/^https:\/\/harvey-oidc-test-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/.test(url))
      return { ...admitted, deployed: true, url }
    } finally { rmSync(staged, { recursive: true, force: true }) }
  }
  // Explicit verification-only handoff. No Vercel command, Git mutation or fallback.
  // The owner review binds the isolation metadata; this is an administrative
  // live-configuration attestation, not an egress sandbox or a secret scanner.
  async function handoff(output) {
    requireOk(env.HARVEY_OIDC_HANDOFF_ENABLED === 'true' &&
      env.HARVEY_OIDC_PUBLICATION_ENABLED !== 'true' && !env.VERCEL_TOKEN)
    for (const [name, value] of Object.entries(env))
      requireOk(!value || !/^(?:NEXT_PUBLIC_SUPABASE|SUPABASE|DATABASE_|DIRECT_URL$|PGHOST$|PGPASSWORD$|SCB|AWS_|CRON_SECRET$|P256|P_256)/.test(name))
    await preflight()
    oidcBuildProfile(env, readEvidenceFile(resolve(cwd, 'apps/web/vercel.json')).toString('utf8'))
    const isolationPath = resolve(env.RUNNER_TEMP, 'harvey-oidc-secret/isolation.json')
    requireOk(env.HARVEY_OIDC_ISOLATION_FILE === isolationPath)
    const isolationBytes = readEvidenceFile(isolationPath, false, true), isolation = parse(isolationBytes.toString('utf8'))
    const keys = ['schema','sourceSha','targetProject','team','target','issuedAt','expiresAt',
      'environmentVariableNames','domains','gitConnected','deploymentCount','cronCount','productionAccessReviewedAbsent']
    requireOk(canonicalJson(Object.keys(isolation).sort()) === canonicalJson(keys.sort()) &&
      isolation.schema === 'omnira-oidc-isolation-review/v1' && isolation.sourceSha === trust.sha &&
      isolation.targetProject === CI_POLICY.targetProject && isolation.team === CI_POLICY.team && isolation.target === 'preview' &&
      Number.isSafeInteger(isolation.issuedAt) && Number.isSafeInteger(isolation.expiresAt) &&
      isolation.issuedAt <= now() && isolation.expiresAt > now() && isolation.expiresAt > isolation.issuedAt &&
      isolation.expiresAt - isolation.issuedAt <= 300 && now() - isolation.issuedAt <= 300 &&
      Array.isArray(isolation.environmentVariableNames) && isolation.environmentVariableNames.length === 0 &&
      Array.isArray(isolation.domains) && isolation.domains.length === 0 && isolation.gitConnected === false &&
      isolation.deploymentCount === 0 && isolation.cronCount === 0 && isolation.productionAccessReviewedAbsent === true)
    const privateDirectory = mkdtempSync(resolve(tmpdir(), 'harvey-oidc-handoff-'))
    try {
      const prepared = env.HARVEY_OIDC_PREPARED_HANDOFF === 'true'
      const handoffReviews = prepared ? reviews(env.GITHUB_RUN_ID) : null
      const selection = prepared ? registeredBinding(handoffReviews, trust) : null
      if (prepared) requireOk(!env.PROOF_RUN_ID && !env.PROOF_ARTIFACT_ID &&
        selection?.kind === 'handoff' && selection.runId === env.GITHUB_RUN_ID &&
        selection.sourceSha === trust.sha && typeof selection.receiptRunId === 'string' &&
        ID.test(selection.receiptRunId) && selection.receiptRunId !== env.GITHUB_RUN_ID &&
        typeof selection.proofArtifactId === 'string' && ID.test(selection.proofArtifactId) &&
        typeof selection.buildArtifactId === 'string' && ID.test(selection.buildArtifactId))
      const proofRunId = prepared ? selection.receiptRunId : env.PROOF_RUN_ID
      const proofArtifactId = prepared ? selection.proofArtifactId : env.PROOF_ARTIFACT_ID
      const proof = resolve(privateDirectory, 'proof')
      await downloadProof(proof, proofRunId, proofArtifactId)
      const raw = readEvidenceFile(resolve(proof, 'receipt.json')), body = parse(raw.toString('utf8'))
      const artifact = readEvidenceFile(resolve(proof, 'artifact.tar'))
      const manifest = parse(readEvidenceFile(resolve(proof, 'manifest.json')).toString('utf8'))
      const ctx = context(digest(artifact), manifest, body.runId)
      requireOk(body.runId === proofRunId && manifest.sourceDigest === sourceDigest())
      checkArtifact(artifact, manifest, ctx)
      checkRun(api(`actions/runs/${body.runId}`), trust, body.runId, true)
      for (const value of [env.GH_TOKEN, env.LEDGER_JSON, env.HARVEY_OIDC_LEDGER_EXPORT_JSON])
        requireOk(!value || !artifact.includes(Buffer.from(value)))
      requireOk(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(artifact.toString('latin1')))
      const binding = { kind: 'handoff', runId: env.GITHUB_RUN_ID, receiptRunId: body.runId, sourceSha: trust.sha,
        subjectDigest: digest(raw), artifactDigest: ctx.artifactDigest, isolationDigest: digest(isolationBytes),
        targetProject: CI_POLICY.targetProject, target: 'preview' }
      const exportReviews = reviews(proofRunId)
      const exportSelection = registeredBinding(exportReviews, trust)
      requireOk(typeof exportSelection?.artifactId === 'string' && ID.test(exportSelection.artifactId))
      const exportBinding = { kind: 'export', runId: proofRunId, sourceSha: trust.sha, subjectDigest: body.exportDigest,
        buildRunId: manifest.buildRunId, artifactId: exportSelection.artifactId, artifactDigest: ctx.artifactDigest }
      if (prepared) {
        requireGuardBefore(runJobs(binding.runId), body.issuedAt)
        exportBinding.handoffRunId = binding.runId
        Object.assign(binding, { proofArtifactId, buildRunId: manifest.buildRunId, buildArtifactId: exportBinding.artifactId })
        ownerReview(handoffReviews, binding, trust)
      }
      ownerReview(exportReviews, exportBinding, trust)
      const origin = await verifiedOrigin(raw, resolve(proof, 'receipt.sigstore.json'), body.runId, binding)
      const trusted = { issuer: CI_POLICY.issuer, receiptWorkflow: origin.workflow,
        receiptWorkflowSha: trust.workflowSha, receiptApprovalId: origin.approvalId }
      await verifyPublicationReceipt({ raw: raw.toString('utf8'), proof: {}, trusted, verifyOrigin: async () => origin,
        context: ctx, artifact, now: now() })
      const summary = { schema: 'omnira-oidc-manual-handoff/v1', status: 'VERIFIED_HANDOFF_NOT_AUTHORIZED',
        sourceSha: trust.sha, workflowSha: trust.workflowSha, runId: env.GITHUB_RUN_ID, receiptRunId: body.runId,
        buildRunId: manifest.buildRunId, artifactDigest: ctx.artifactDigest, manifestDigest: digest(canonicalJson(manifest)),
        receiptDigest: digest(raw), isolationDigest: digest(isolationBytes), targetProject: CI_POLICY.targetProject, target: 'preview',
        issuedAt: now(), expiresAt: Math.min(body.expiresAt, isolation.expiresAt), cronDefinitions: 0,
        isolationEvidence: 'owner-reviewed-metadata', requiredPublisherId: CI_POLICY.ownerId,
        separatePublicationApprovalRequired: true, publicationAuthorized: false, deployed: false, reserved: false,
        globallySingleUse: false, ciExclusivePublication: false }
      if (prepared) summary.proofArtifactId = proofArtifactId
      requireOk(summary.expiresAt > now())
      mkdirSync(output, { mode: 0o700 })
      writeFileSync(resolve(output, 'handoff.json'), canonicalJson(summary), { flag: 'wx', mode: 0o600 })
      return summary
    } finally { rmSync(privateDirectory, { recursive: true, force: true }) }
  }
  // Create-only GitHub ref: a successful claim is never removed, even if publication fails.
  async function verifyPublication({ directory, approvalRunId }) {
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
    const pins = journalTrust(env)
    const policies = () => {
      const immutable = api(`rulesets/${pins.immutable}`), creator = api(`rulesets/${pins.creator}`)
      checkJournalPolicy(immutable, creator, pins)
      return canonicalJson([immutable, creator])
    }
    const before = policies(), ref = JOURNAL_PREFIX + digest(raw)
    // No GET-before-create and no retry/adoption of an existing claim. A lost response burns the grant.
    let response
    try { response = gh(['api', '--hostname', 'github.com', '--include', '--method', 'POST',
      '--input', '-', `repos/${CI_POLICY.repo}/git/refs`], {
      input: canonicalJson({ ref, sha: trust.sha }), stdio: ['pipe','pipe','pipe'],
    }) } catch { deny() }
    requireOk(typeof response === 'string' && /^HTTP\/[0-9.]+\s+201\b/.test(response))
    const split = response.search(/\r?\n\r?\n/); requireOk(split > 0)
    const created = JSON.parse(response.slice(split).trim())
    requireOk(created.ref === ref && created.object?.type === 'commit' && created.object.sha === trust.sha)
    const saved = api('git/ref/' + ref.slice('refs/'.length))
    requireOk(saved.ref === ref && saved.object?.type === 'commit' && saved.object.sha === trust.sha && policies() === before)
    return { ...result, reserved: true, deployed: false, reservationRef: ref, expiresAt: body.expiresAt, receiptRunId: body.runId }

  }
  return { build, prepare, guard, evidence, preflight, verifiedOrigin, verifyPublication, publish, handoff }
}

export async function main(args = process.argv.slice(2)) {
  const [mode, option, output] = args
  requireOk(args.length === 3 && ['build','prepare','guard','evidence','publish','handoff'].includes(mode) &&
    option === (['build','prepare','publish','handoff'].includes(mode) ? '--output' : '--directory') && isAbsolute(output))
  return createAdapter()[mode](resolve(output))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('harvey-oidc-ci: verification failed (fail-closed)'); process.exitCode = 1
  })
}
