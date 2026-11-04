import {it,expect} from 'vitest'
import {readContactTiming,saveTimingRules} from './store'
const pid='10000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000001',key='30000000-0000-4000-8000-000000000001'
const p={userId:uid,allowedProjectIds:[pid]}
it('owner reads only canonical timing RPC without mutation authority',async()=>{
 const calls:any[]=[];const report={projectId:pid,contacts:[],rules:null,customerSendingEnabled:false}
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:report,error:null}}} as never
 expect(await readContactTiming(db,p,{projectId:pid})).toEqual(report)
 expect(calls).toEqual([{name:'sales_timing_read',args:{p_principal:p,p_input:{projectId:pid}}}])
})
it('rejects foreign scope before any database access',async()=>{const db={rpc:()=>{throw Error('unexpected database access')}} as never;await expect(readContactTiming(db,{...p,allowedProjectIds:[]},{projectId:pid})).rejects.toThrow('NOT_FOUND')})
it('does not turn a failed read into an empty register',async()=>{const db={rpc:async()=>({data:null,error:{code:'XX000'}})} as never;await expect(readContactTiming(db,p,{projectId:pid})).rejects.toThrow('UNAVAILABLE')})
it('validates rules before passing them to database',async()=>{const db={rpc:()=>{throw Error('unexpected database access')}} as never;await expect(saveTimingRules(db,p,{projectId:pid,idempotencyKey:key,expectedPreviousId:null,minWaitSeconds:1,maxReminders:1,maxSourceAgeSeconds:900,confirmed:true})).rejects.toThrow('INVALID_BODY')})
