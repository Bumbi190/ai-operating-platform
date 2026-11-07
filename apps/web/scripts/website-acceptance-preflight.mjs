#!/usr/bin/env node
/**
 * READ-ONLY local preflight for the Studio live-acceptance preview.
 *
 * Reads only: process.env (secret values are never printed — presence only),
 * local `git rev-parse`, and the local supabase/migrations directory listing.
 * No network, no Supabase/Vercel API, no writes, no credentials created.
 *
 * Usage:
 *   node apps/web/scripts/website-acceptance-preflight.mjs [--expected-sha <sha>]
 * Exit 0 = no blockers; exit 2 = blockers reported. The rules mirror
 * lib/website-build/acceptance-target.ts (a vitest asserts the constants agree).
 */
import {execFileSync} from 'node:child_process'
import {readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'

export const ACCEPTANCE_BRANCH='codex/atlas-builder-references-20261017'
export const PRODUCTION_SUPABASE_REF='iboepohjwrhtgshrqaol'
const SUPABASE_REF=/^[a-z0-9]{20}$/
const SECRET_KEYS=['SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','CRON_SECRET']

function urlMatchesRef(raw,ref){
 if(!raw||!ref)return false
 let url;try{url=new URL(raw)}catch{return false}
 return url.protocol==='https:'&&url.hostname===`${ref}.supabase.co`&&!url.port&&!url.username&&!url.password&&(url.pathname===''||url.pathname==='/')&&!url.search&&!url.hash
}
function urlIsProduction(raw){try{return new URL(raw).hostname===`${PRODUCTION_SUPABASE_REF}.supabase.co`}catch{return false}}

/** Pure: env + local facts in, report out. Never echoes a secret value. */
export function evaluatePreflight(env,local={}){
 const ref=(env.WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF??'').trim()
 const guard=[]
 if(env.WEBSITE_BUILDER_ACCEPTANCE_MODE!=='1')guard.push('ACCEPTANCE_MODE_NOT_ENABLED')
 if(!ref)guard.push('ISOLATED_REF_MISSING')
 else if(ref===PRODUCTION_SUPABASE_REF)guard.push('ISOLATED_REF_IS_PRODUCTION')
 else if(!SUPABASE_REF.test(ref))guard.push('ISOLATED_REF_INVALID')
 if(!ref||ref===PRODUCTION_SUPABASE_REF||!urlMatchesRef(env.NEXT_PUBLIC_SUPABASE_URL,ref))guard.push('SUPABASE_URL_NOT_ISOLATED_REF')
 if(env.H1_SPEND_GATE!=='1')guard.push('SPEND_GATE_NOT_ENFORCED')
 const blockers=[...guard]
 // This proof must describe the actual branch preview, not an unrelated process.
 if(env.VERCEL_ENV!=='preview')blockers.push('NOT_PREVIEW_DEPLOYMENT')
 if(env.VERCEL_GIT_COMMIT_REF!==ACCEPTANCE_BRANCH)blockers.push('NOT_ACCEPTANCE_BRANCH')
 const presence=Object.fromEntries(SECRET_KEYS.map(k=>[k,env[k]?'present':'absent']))
 const targetSha=env.VERCEL_GIT_COMMIT_SHA||local.headSha||null
 if(local.expectedSha&&targetSha&&!targetSha.startsWith(local.expectedSha))blockers.push('COMMIT_SHA_MISMATCH')
 if(local.expectedSha&&!targetSha)blockers.push('COMMIT_SHA_UNKNOWN')
 if(local.branch&&!env.VERCEL_GIT_COMMIT_REF&&local.branch!==ACCEPTANCE_BRANCH)blockers.push('LOCAL_BRANCH_NOT_ACCEPTANCE_BRANCH')
 const login=[]
 if(presence.NEXT_PUBLIC_SUPABASE_ANON_KEY==='absent')login.push('ANON_KEY_ABSENT')
 if(guard.length)login.push('ISOLATED_DATABASE_NOT_PROVISIONED')
 const cron=['VERCEL_CRONS_RUN_ON_PRODUCTION_ONLY','RUNS_DRAIN_NOT_IN_VERCEL_JSON_CRONS']
 if(presence.CRON_SECRET==='absent')cron.push('CRON_SECRET_ABSENT')
 if(guard.length)cron.push('DRAIN_REFUSED_BY_ACCEPTANCE_GUARD')
 return {
  readOnly:true,
  target:{vercelEnv:env.VERCEL_ENV??null,vercelBranch:env.VERCEL_GIT_COMMIT_REF??null,localBranch:local.branch??null,commitSha:targetSha,expectedSha:local.expectedSha??null},
  database:{authorizedRef:ref&&SUPABASE_REF.test(ref)?ref:(ref?'<invalid>':null),urlPresent:Boolean(env.NEXT_PUBLIC_SUPABASE_URL),urlIsProduction:urlIsProduction(env.NEXT_PUBLIC_SUPABASE_URL),urlMatchesAuthorizedRef:urlMatchesRef(env.NEXT_PUBLIC_SUPABASE_URL,ref),expectedLatestMigration:local.latestMigration??null,expectedWebsiteMigrations:local.websiteMigrations??[]},
  flags:{acceptanceMode:env.WEBSITE_BUILDER_ACCEPTANCE_MODE==='1',spendGate:env.H1_SPEND_GATE==='1'},
  secrets:presence,
  blockers,
  realLoginBlockers:login,
  cronBlockers:cron,
  manualChecks:[
   'Isolated project has every local migration applied up to expectedLatestMigration (compare in its dashboard; not checked here).',
   'Isolated project Auth redirect allowlist includes the preview URL; a test user exists there (not checked here).',
   'Preview env vars are scoped to Preview + this branch only, never Production.',
   'Any runs/drain invocation on the preview is a live action needing separate authorization.',
  ],
 }
}

function localFacts(argv){
 const at=argv.indexOf('--expected-sha'),expectedSha=at>=0?argv[at+1]:undefined
 if(at>=0&&!/^[0-9a-f]{7,40}$/.test(expectedSha??''))throw new Error('--expected-sha must be 7-40 lowercase hex characters')
 const git=args=>{try{return execFileSync('git',args,{encoding:'utf8',timeout:5000}).trim()}catch{return null}}
 const dir=resolve(fileURLToPath(new URL('.',import.meta.url)),'../supabase/migrations')
 let files=[];try{files=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()}catch{}
 return {expectedSha,headSha:git(['rev-parse','HEAD']),branch:git(['rev-parse','--abbrev-ref','HEAD']),latestMigration:files.at(-1)??null,websiteMigrations:files.filter(f=>/website_build|website_mockup|studio_workspace|website_saved_draft|cinematic/.test(f))}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=evaluatePreflight(process.env,localFacts(process.argv.slice(2)))
 console.log(JSON.stringify(report,null,1))
 process.exitCode=report.blockers.length?2:0
}
