import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {describe,it} from 'node:test'
import {fileURLToPath} from 'node:url'
import {dirname,join} from 'node:path'

const root=dirname(fileURLToPath(import.meta.url))
const launcher=join(root,'run-approved-import.cjs')
const project='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const projectArg=['--apply','--expected-project-id',project]

function run(args,override={}){
  const env={
    ...process.env,
    OMNIRA_THEPROMPT_IMPORT_APPROVED:'0',
    NEXT_PUBLIC_SUPABASE_URL:'',
    SUPABASE_SERVICE_ROLE_KEY:'',
    ...override,
  }
  return spawnSync(process.execPath,[launcher,...args],{
    env,encoding:'utf8',windowsHide:true,
  })
}

function denied(args,env,code){
  const r=run(args,env)
  assert.equal(r.status,1)
  assert.match(r.stderr,new RegExp('NO-GO: '+code))
  assert.doesNotMatch(r.stdout,/PRIVATE CANONICAL IMPORT VERIFIED/)
}

describe('The Prompt trusted Node importer operator gates',()=>{
  it('refuses apply with missing approval even when all other values are supplied',()=>{
    denied(projectArg,{
      NEXT_PUBLIC_SUPABASE_URL:'https://iboepohjwrhtgshrqaol.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key',
    },'operator_gate_off')
  })
  it('refuses wrong project ID with approval enabled',()=>{
    denied(['--apply','--expected-project-id','33333333-3333-4333-8333-333333333333'],{
      OMNIRA_THEPROMPT_IMPORT_APPROVED:'1',
      NEXT_PUBLIC_SUPABASE_URL:'https://iboepohjwrhtgshrqaol.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key',
    },'project_identity_mismatch')
  })
  it('refuses Familje-Stunden and other project databases',()=>{
    denied(projectArg,{
      OMNIRA_THEPROMPT_IMPORT_APPROVED:'1',
      NEXT_PUBLIC_SUPABASE_URL:'https://zcpnionjkacbbnamhrjk.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key',
    },'wrong_supabase_target')
  })
  it('refuses wrong query/path/credentials in an otherwise correct target URL',()=>{
    denied(projectArg,{
      OMNIRA_THEPROMPT_IMPORT_APPROVED:'1',
      NEXT_PUBLIC_SUPABASE_URL:'https://iboepohjwrhtgshrqaol.supabase.co/?hack=true',
      SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key',
    },'wrong_supabase_target')
  })
  it('refuses a missing service key without even building an importer',()=>{
    denied(projectArg,{
      OMNIRA_THEPROMPT_IMPORT_APPROVED:'1',
      NEXT_PUBLIC_SUPABASE_URL:'https://iboepohjwrhtgshrqaol.supabase.co/',
    },'supabase_not_configured')
  })
  it('will never combine a compile-only check with paid/apply mode',()=>{
    denied([...projectArg,'--link-check'],{},'conflicting_modes')
    denied(['--module-check','--link-check'],{},'conflicting_modes')
  })
  it('preserves the regular preflight from a trusted launcher',()=>{
    const originalDir=process.env.THEPROMPT_APPROVED_CLIPS_DIR
    if(!originalDir)return
    const r=run(['--source-dir',originalDir])
    assert.equal(r.status,0)
    assert.match(r.stdout,/DRY-RUN PASS; NO DATABASE/)
  })
})
