import {it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {canonicalJson,hashTask,sha256} from '@omnira/local-text-contract'
import {fixtureDb} from './sql-fixture'
import {executeLocalTextCloudRun} from '../cloud-runs'
import {reconcileLocalTextHealth} from '../incidents'
import type {Db} from '../types'
/** Full real canonical continuation seam; no inference or provider call. */
it.skipIf(process.env.LOCAL_TEXT_SQL_E2E!=='1')('canonical claim/executor finalizes, survives apply loss, and a fresh normal maintenance recovers exactly once',async()=>{
 const container=process.env.LOCAL_TEXT_TEST_CONTAINER!,database=process.env.LOCAL_TEXT_TEST_DATABASE!
 expect(container).toBe('omnira-atlas-local-text-test-20261017');expect(database).toMatch(/^local_text_continuation_[a-z0-9]+$/)
 function sql(s:string){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
 const task={kind:'classify' as const,text:'Behöver hjälp',labels:['support','annat']},result={label:'support'},inputHash=hashTask(task),resultHash=sha256(canonicalJson(result))
 let seed=readFileSync(path.resolve('supabase/tests/local_text_review_regressions.sql'),'utf8').split(" if current_setting('omnira.review_case')")[0]
 seed=seed.replaceAll(":'review_case'","'I4'").replaceAll("repeat('d',64)","'"+inputHash+"'").replaceAll("repeat('f',64)","'"+resultHash+"'")
 seed+=" v=public.local_text_transition(c,jsonb_build_object('type','started'));v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash','"+resultHash+"'));end$$;reset role;commit;"
 sql(seed)
 const db=fixtureDb(sql),claimed=await db.rpc('claim_runs',{p_limit:1,p_lease_seconds:320});expect(claimed.error).toBeNull();const run=(claimed.data as any[])[0];expect(run?.kind).toBe('local_text_cloud')
 let lost=false;const interrupted={...db,rpc:async(n:string,args:Record<string,unknown>)=>{if(n==='local_text_cloud_operation'&&args.p_operation==='apply'&&!lost){lost=true;return {data:null,error:{message:'synthetic commit-boundary interruption'}}}return (db.rpc as any)(n,args)}} as unknown as Db
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
 await expect(executeLocalTextCloudRun(interrupted,run,run.claim_id,new Date())).rejects.toThrow('LOCAL_TEXT_APPLY_PENDING')
 expect(sql(`select status from public.runs where id='${run.id}';`)).toBe('awaiting_approval')
 expect(sql('select state from public.local_text_jobs;')).toBe('reviewing')
 // This is the same pre-claim driver used by a new drain invocation.
 await reconcileLocalTextHealth(db,new Date());await reconcileLocalTextHealth(db,new Date())
 expect(sql('select state from public.local_text_jobs;')).toBe('needs_input');expect(sql("select count(*) from public.local_text_human_reviews where status='pending';")).toBe('1')
 expect(sql('select count(*) from public.cost_events;')).toBe('0');expect((await db.rpc('claim_runs',{p_limit:1,p_lease_seconds:320})).data).toEqual([])
},30000)
