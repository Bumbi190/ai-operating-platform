/**
 * Atlas V1A: OFFLINE, READ-ONLY review inventory.
 *
 * This does NOT stage, commit, push, deploy, sign, contact GitHub, read
 * credential files, load private keys, create database rows or use an AI model.
 *
 * "ready_for_manual_review" is NOT approval to release or execute agents.
 * The V1B experimental code remains in the original local worktree.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const EXPECTED_BRANCH='codex/atlas-model-agent-router-20261022'
const V1A_FILES=Object.freeze([
  // Existing advisory router and optional read-only diagnostic.
  'apps/web/lib/atlas/model-router/catalog.ts',
  'apps/web/lib/atlas/model-router/route.ts',
  'apps/web/lib/atlas/model-router/desktop-evidence.ts',
  'apps/web/lib/atlas/model-router/windows-owner-review-preview.ts',
  'apps/web/lib/atlas/model-router/README-V1A.md',
  // Existing settings panel plus a NON-ACTIONABLE review-only section.
  'apps/web/components/platform/vnext/SettingsBrokerPanel.tsx',
  'apps/web/components/platform/vnext/OwnerSigningReview.tsx',
  'apps/web/components/platform/vnext/OwnerSigningReview.module.css',
  // Scoped regression tests (the last one fixes Windows path portability).
  'apps/web/lib/qa/atlas-model-router.test.ts',
  'apps/web/lib/qa/atlas-model-router-prime-agent.test.ts',
  'apps/web/lib/qa/atlas-model-router-desktop-evidence.test.ts',
  'apps/web/lib/qa/atlas-owner-signing-review-ui.test.ts',
  'apps/web/lib/qa/sdf1c-trusted-broker.test.ts',
  // Preflight already exists in the remote baseline, not a newly added file.
  'scripts/atlas-model-router/desktop-snapshot.ps1',
  'scripts/atlas-model-router/preview-desktop-snapshot.mts',
  // This inventory is safe to include as part of the V1A review.
  'scripts/atlas-model-router/v1a-release-audit.mts',
])
const REQUIRED_BASELINE=[
  'scripts/atlas-model-router/preflight.ps1',
  'apps/web/lib/atlas/code-broker/types.ts',
  'apps/web/lib/atlas/code-broker/operator.ts',
] as const
const PROHIBITED_RELEASE_PATHS=[
  /\/windows-signer-pilot\//,
  /\/native\/windows\//,
  /\/windows-owner-consent(-issuer-offline)?\.ts$/,
  /\/windows-owner-issuer-keyring-offline\.ts$/,
  /\/signed-desktop-evidence\.ts$/,
  /\/offline-issuer-keyring-/,
  /\/offline-owner-consent-ledger/,
  /\/provision-windows-tpm-pilot\.ps1$/,
  /\/verify-existing-windows-tpm-pilot\.ps1$/,
] as const
const HIGH_CONFIDENCE_SECRETS=[
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/,
  /\beyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\b/,
  /^\s*(?:DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY)\s*=/m,
] as const

function git(...args:string[]):string {
  return execFileSync('git',['-c','core.safecrlf=false','-C',ROOT,...args],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1000000,
    stdio:['ignore','pipe','pipe'],
  }).trim()
}
function source(path:string):Buffer {
  const absolute=join(ROOT,...path.split('/'))
  const stat=lstatSync(absolute)
  if(!stat.isFile() || stat.isSymbolicLink() ||
     stat.size<1 || stat.size>200_000) throw new Error('source outside bounds')
  const resolved=realpathSync(absolute)
  const rel=relative(realpathSync(ROOT),resolved)
  if(rel==='..' || rel.startsWith('..'+sep) || rel.startsWith(sep))
    throw new Error('source escapes repository')
  return readFileSync(absolute)
}
function sha(bytes:Buffer):string {
  return createHash('sha256').update(bytes).digest('hex')
}

const errors:string[]=[]
const FILES=[...V1A_FILES]
const current=git('branch','--show-current')
if(current!==EXPECTED_BRANCH) errors.push('wrong_existing_branch')
const head=git('rev-parse','--short','HEAD')
const changed=[
  ...git('diff','--name-only','--no-ext-diff').split('\n').filter(Boolean),
  ...git('diff','--cached','--name-only','--no-ext-diff').split('\n').filter(Boolean),
]
const upstream='origin/codex/atlas-model-agent-router-20261022'
const aheadBehind=git('rev-list','--left-right','--count',upstream+'...HEAD').split(/\s+/)
const remoteBehind=Number(aheadBehind[0]??-1)
const unpushedCount=Number(aheadBehind[1]??-1)
if(remoteBehind!==0 || unpushedCount!==1) errors.push('unexpected_unpushed_commit_history')
const unpushedPaths=git('diff','--name-only',upstream,'HEAD').split('\n').filter(Boolean)
const permittedPriorCommit=new Set([...V1A_FILES,'apps/web/lib/atlas/model-router/README.md'])
for(const path of unpushedPaths){
  if(!permittedPriorCommit.has(path)) errors.push('older_local_commit_outside_v1a_scope:'+path)
}
const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)
const stagedAdded=new Set(git('diff','--cached','--diff-filter=A','--name-only').split('\n').filter(Boolean))
const allChanges=[...new Set([...changed,...untracked])].sort()
const changes=new Set(allChanges)
const deferred=allChanges.filter(p=>!FILES.includes(p))
const entries:{
  path:string
  bytes:number
  sha256:string
  status:'modified'|'new'
}[]=[]
if(new Set(FILES).size!==FILES.length) errors.push('duplicate_candidate_path')
for(const path of FILES) {
  if(PROHIBITED_RELEASE_PATHS.some(pattern=>pattern.test('/'+path)))
    errors.push('experimental_file_selected_for_v1a')
  if(!changes.has(path)) errors.push('candidate_not_changed_or_new:'+path)
  try {
    const b=source(path)
    const s=b.toString('utf8')
    if(HIGH_CONFIDENCE_SECRETS.some(p=>p.test(s)))
      errors.push('sensitive_material_in_candidate:'+path)
    entries.push({
      path,bytes:b.byteLength,sha256:sha(b),
      status:untracked.includes(path)||stagedAdded.has(path)?'new':'modified',
    })
  } catch {errors.push('missing_or_unreadable_candidate:'+path)}
}
for(const path of REQUIRED_BASELINE) {
  try {
    source(path)
    if(git('ls-files','--error-unmatch','--',path)!==path)
      errors.push('baseline_not_tracked:'+path)
  } catch {errors.push('missing_preexisting_dependency:'+path)}
}
// Runtime modules must not import synthetic issuer, owner KMS, native signer
// or private key proof. The existing SettingsBrokerPanel has existing POST
// actions; only the NEW read-only child is checked for actionable code.
const runtime=FILES.filter(x=>x.startsWith('apps/web/lib/atlas/model-router/') &&
  x.endsWith('.ts') && !x.includes('README'))
for(const path of runtime) {
  const text=source(path).toString('utf8')
  if(/\b(?:exec|spawn|fetch)\s*\(/.test(text))
    errors.push('runtime_has_network_or_process_call:'+path)
  if(/from ['"][^'"]*(?:windows-owner-consent|windows-owner-issuer|signed-desktop-evidence)/.test(text))
    errors.push('runtime_imports_deferred_security_module:'+path)
}
const newUi=source('apps/web/components/platform/vnext/OwnerSigningReview.tsx').toString('utf8')
if(/<button\b|<form\b|<input\b|onClick=|\bfetch\s*\(|useState\s*\(/.test(newUi))
  errors.push('read_only_signing_ui_has_action')
const routed=source('apps/web/lib/atlas/model-router/route.ts').toString('utf8')
const diagnostic=source('apps/web/lib/atlas/model-router/desktop-evidence.ts').toString('utf8')
const preview=source('apps/web/lib/atlas/model-router/windows-owner-review-preview.ts').toString('utf8')
if(!routed.includes('dispatchAuthorized: false') ||
   !diagnostic.includes('dispatchAuthorized: false') ||
   !preview.includes('modelDispatchAuthorized: false'))
  errors.push('fail_closed_runtime_not_verified')
const collector=source('scripts/atlas-model-router/desktop-snapshot.ps1').toString('utf8')
if(!collector.includes("Join-Path $PSScriptRoot 'preflight.ps1'"))
  errors.push('known_baseline_preflight_dependency_changed')

console.log(JSON.stringify({
  version:'omnira.atlas-v1a-release-audit.v1',
  status:errors.length?'blocked':'ready_for_manual_review',
  branch:current,localHead:head,
  proposedReadOnlyFiles:entries.length,
  totalChangedAndUntrackedFiles:allChanges.length,
  unpushedCommitsAhead:unpushedCount,
  remoteBehindCount:remoteBehind,
  priorLocalCommitChangedFiles:unpushedPaths,
  intentionallyDeferredFiles:deferred.length,
  proposedCodeBytes:entries.reduce((n,e)=>n+e.bytes,0),
  candidateFiles:entries,
  deferredPaths:deferred,
  errors,
  fullAppBuildVerified:false,
  githubPushAuthorized:false,
  githubPushPerformed:false,
  productionDeploymentAuthorized:false,
  brokerEnrollmentAuthorized:false,
  modelDispatchAuthorized:false,
},null,2))
if(errors.length) process.exitCode=2
