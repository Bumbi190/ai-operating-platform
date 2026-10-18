import {readFileSync,readdirSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {initializeReconciliationDb} from '../publication/reconciliation/fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
export function initializeSchedulingDb(){
 const db=initializeReconciliationDb()
 if(testSql("select to_regclass('public.social_schedule_batches') is null;")==='t'){
  const dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_schedule_batches.sql'))!
  testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')
 }
 if(testSql("select to_regprocedure('public.social_schedule_recover_checkpoint(jsonb)') is null;")==='t'){const dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_schedule_checkpoint_recovery.sql'))!;testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')}
 // Separate psql processes, so Promise.all exercises real concurrent transactions.
 const original=db.rpc.bind(db)
 ;(db as any).rpc=(name:string,args:Record<string,unknown>)=>{
  if(!name.startsWith('social_schedule_'))return (original as any)(name,args)
  const database=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME
  if(!database||!/^website_test_[0-9]+$/.test(database)||!/^social_schedule_[a-z_]+$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Unowned scheduler test request')
  const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
  const call='public.'+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+literal(v)).join(',')+')'
  return new Promise(resolveResult=>{
   const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{stdio:['pipe','pipe','pipe'],windowsHide:true})
   let output='',error=''
   child.stdout.on('data',b=>{output+=b.toString();if(output.length>4194304)child.kill()})
   child.stderr.on('data',b=>{error+=b.toString();if(error.length>4194304)child.kill()})
   child.once('error',()=>resolveResult({data:null,error:{code:'XX000',message:'Local SQL fixture unavailable'}}))
   child.once('close',code=>{if(code!==0)return resolveResult({data:null,error:{message:error,code:error.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??'XX000'}});try{resolveResult({data:JSON.parse(output.trim()||'null'),error:null})}catch{resolveResult({data:null,error:{code:'XX000',message:'Invalid fixture output'}})}})
   const hold=name==='social_schedule_claim'?'select pg_sleep(0.15);':''
   child.stdin.end('\\set VERBOSITY verbose\nset role service_role;begin;select to_jsonb('+call+');'+hold+'commit;')
  })
 }
 return db
}
