/**
 * Restricted Node-only launch point for the specifically approved The Prompt V3 master.
 *
 * Next.js resolves import 'server-only' specially in its server compilation.
 * A regular Node CLI cannot load the same canonical admission code directly.
 * This script bundles the REAL source into a temporary server-side Node CLI,
 * with only the Next.js server-only marker treated as a no-op.
 *
 * No frontend bundle, external HTTP route, publication or generator is added.
 * --link-check: offline compilation only, never reads keys or source MP4s.
 * no --apply: read and SHA-verify the exact approved 720p master, no network.
 * --apply: requires THE PROMPT master-only operator gate and exact project/host.
 * Publication is NEVER enabled by this CLI.
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {spawnSync} = require('node:child_process')

const SOURCE = path.resolve(__dirname,'approved-v3-master.mjs')
const APP_WEB = path.resolve(__dirname,'../..')
const EXPECTED_PROJECT_ID = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const EXPECTED_HOST = 'iboepohjwrhtgshrqaol.supabase.co'

function failure(code) {
  // Never log credentials, provider errors, bundle source or arbitrary URL.
  console.error('NO-GO: ' + code)
  process.exitCode = 1
}

function getArg(args,name) {
  const i = args.findIndex(a => a===name || a.startsWith(name+'='))
  return i<0?null:args[i]===name?args[i+1]??null:args[i].slice(name.length+1)
}

function operatorGate(args,env) {
  if(env.OMNIRA_THEPROMPT_MASTER_IMPORT_APPROVED !== '1') return 'operator_gate_off'
  if(getArg(args,'--expected-project-id')!==EXPECTED_PROJECT_ID) return 'project_identity_mismatch'
  let url
  try{url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || '')}catch{return 'supabase_not_configured'}
  if(url.protocol !== 'https:' || url.host!==EXPECTED_HOST ||
    url.pathname!=='/' || url.username || url.password || url.search || url.hash)
    return 'wrong_supabase_target'
  if(!env.SUPABASE_SERVICE_ROLE_KEY)return 'supabase_not_configured'
  return null
}

async function buildServerOnlyCli(outFile,write) {
  let esbuild
  try{esbuild=require('esbuild')}catch{throw new Error('DEPENDENCIES_MISSING')}
  return esbuild.build({
    entryPoints:[SOURCE],
    outfile:outFile,
    write,
    bundle:true,
    platform:'node',
    format:'esm',
    target:'node22',
    // Resolve @/* according to the actual web project, and bundle all packages
    // so that temp-directory execution has no dependency on relative node_modules.
    absWorkingDir:APP_WEB,
    tsconfig:path.join(APP_WEB,'tsconfig.json'),
    // esbuild does not automatically inherit Node's NODE_PATH fallback.
    // Honour only paths already selected by the server-side Node resolver.
    nodePaths:[...module.paths,...(process.env.NODE_PATH||'').split(path.delimiter).filter(Boolean)],
    logLevel:'silent',
    metafile:true,
    plugins:[{
      name:'node-server-only-marker',
      setup(build) {
        build.onResolve({filter:/^server-only$/},()=>{
          return {path:'server-only',namespace:'trusted-node-only'}
        })
        build.onLoad({filter:/.*/,namespace:'trusted-node-only'},()=>{
          return {contents:'export {}',loader:'js'}
        })
      }
    }],
  })
}

async function main() {
  const args=process.argv.slice(2)
  const linkCheck=args.includes('--link-check')
  const moduleCheck=args.includes('--module-check')
  const apply=args.includes('--apply')

  // Regular dry-run uses the same tested zero-dependency original CLI.
  if(!linkCheck && !apply && !moduleCheck){
    const child=spawnSync(process.execPath,[SOURCE,...args],{stdio:'inherit',windowsHide:true})
    process.exitCode=child.status===null?1:child.status
    return
  }

  // The technical-only link check can run with NO credentials, NO network
  // and NO access to any source files or database.
  if(moduleCheck || (linkCheck && apply)){
    failure('conflicting_modes');return
  }
  if(apply){
    const denied=operatorGate(args,process.env)
    if(denied){failure(denied);return}
  }

  let temp=null
  try{
    temp=fs.mkdtempSync(path.join(os.tmpdir(),'omnira-theprompt-v3-master-cli-'))
    const output=path.join(temp,'operator-v3-master.mjs')
    const result=await buildServerOnlyCli(output,!linkCheck)
    // Importing the prepared bundle is NOT required for --link-check:
    // successful compilation resolves all dependencies and @/* aliases.
    if(linkCheck){
      const count=Object.keys(result.metafile?.inputs||{}).length
      if(count < 3)throw new Error('INCOMPLETE_BUNDLE')
      console.log('LINK_CHECK_PASS: trusted Node-only canonical importer compiled; no DB, storage or API calls.')
      return
    }
    const child=spawnSync(process.execPath,[output,...args],{
      env:process.env,stdio:'inherit',windowsHide:true,
    })
    if(child.error||child.status!==0){
      // Forward the already redacted code emitted by the child.
      process.exitCode=child.status===null?1:child.status
    }
  }catch(e){
    const safe=e instanceof Error&&e.message==='DEPENDENCIES_MISSING'?'dependencies_missing':
      e instanceof Error&&e.message==='INCOMPLETE_BUNDLE'?'bundle_incomplete':'bundled_runtime_unavailable'
    failure(safe)
  }finally{
    if(temp)fs.rmSync(temp,{recursive:true,force:true})
  }
}
main().catch(()=>failure('bundled_runtime_unavailable'))
