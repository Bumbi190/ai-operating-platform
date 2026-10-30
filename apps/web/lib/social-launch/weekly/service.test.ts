import {it,expect,vi} from 'vitest'
import {getWeeklyContext,prepareWeeklyDrafts} from './service'
const projectId='77cda551-57c9-4dc0-b019-1bb6438777f7',id='51000000-0000-4000-8000-000000000001',p={userId:id,allowedProjectIds:[projectId]},scope={projectId,conversationId:id,weekStart:'2026-11-02'}
const raw=()=>({contextHash:'a'.repeat(64),content:{project:{id:projectId,slug:'familje-stunden'},planApproved:true,plannedChannels:[{channel:'facebook'},{channel:'instagram'}],posts:[]},profile:{revision:{sha256:'b'.repeat(64),profile:{description:'Known family activities'}}},jobs:[],history:[],bindings:[{channel:'facebook',blocked:false,verification:'provider_attested'},{channel:'instagram',blocked:false,verification:'provider_attested'}],describedAssets:[{id,description:'Owned image of leaves'}],monthlyRuleEnabled:false})
const db=(value:any)=>({rpc:vi.fn(async(_name:string,_args:unknown)=>({data:value,error:null}))})
it('returns stable week context without saving or authority',async()=>{
 const d=db(raw()),r=await getWeeklyContext(d as any,p,scope,'2026-10-26T10:00:00Z');expect(r.plan.slots).toHaveLength(2);expect(r.sourceReferences).toEqual(['profile:'+'b'.repeat(64)]);expect(d.rpc).toHaveBeenCalledTimes(1)
})
it('merges a fully occupied week and does not propose more content',async()=>{
 const r:any=raw();r.jobs=['2026-11-04T19:30:00Z','2026-11-08T19:30:00Z'].flatMap(scheduledAt=>['facebook','instagram'].map(channel=>({id:channel+scheduledAt,postId:channel+scheduledAt,kind:'ordinary',channel,scheduledAt,state:'queued',publicationId:null})))
 expect((await getWeeklyContext(db(r) as any,p,scope,'2026-10-26T10:00:00Z')).plan.slots).toEqual([])
})
it('reports missing monthly catalog and removes that slot from writable vacancies',async()=>{
 const r:any=raw();r.monthlyRuleEnabled=true
 const v=await getWeeklyContext(db(r) as any,p,{...scope,weekStart:'2026-10-26'},'2026-10-26T10:00:00Z');expect(v.missing).toContain('monthly_catalog_missing:2026-11');expect(v.plan.slots.every(s=>s.kind==='ordinary')).toBe(true)
})
it('rejects unscoped requests and forged draft times before any write',async()=>{
 const d=db(raw());await expect(getWeeklyContext(d as any,{...p,allowedProjectIds:[]},scope)).rejects.toMatchObject({code:'NOT_FOUND'});expect(d.rpc).not.toHaveBeenCalled()
 await expect(prepareWeeklyDrafts(d as any,p,{...scope,generation:1,contextHash:'a'.repeat(64),idempotencyKey:'test',drafts:[{slotKey:'forged',channel:'facebook',assetId:id,text:'test',title:'test',sourceReferences:[],scheduledAt:'2026-11-03T16:00:00Z'}]} as any)).rejects.toBeTruthy();expect(d.rpc.mock.calls.every(c=>c[0]==='social_weekly_context')).toBe(true)
})

it('counts a new intended revision even when an older revision has a cancelled reservation',async()=>{
 const r:any=raw();r.jobs=[{id:'oldjob',postId:'post',revisionId:'old',state:'cancelled',publicationId:null,scheduledAt:'2026-11-04T19:30:00Z',kind:'ordinary',channel:'facebook'}];r.content.posts=[{id:'post',revision:{id:'new',draft:{scheduledAt:'2026-11-04T19:30:00Z',channel:'facebook'}}}];
 expect((await getWeeklyContext(db(r) as any,p,scope,'2026-10-26T10:00:00Z')).plan.slots).toHaveLength(1)
});

it('saves a complete derived four-post set and preserves an identical retry',async()=>{
 const r:any=raw(),saved={preparationId:'saved',posts:['2026-11-03T17:00:ordinary','2026-11-06T20:30:ordinary'].flatMap(slotKey=>['facebook','instagram'].map(channel=>({slotKey,channel}))),status:'editorial_review_required'};
 const rpc=vi.fn(async(name:string)=>({data:name==='social_weekly_context'?r:saved,error:null}));
 const drafts=saved.posts.map(x=>({...x,assetId:id,title:'Family activity',text:'Verified project facts for this test',sourceReferences:['profile:'+'b'.repeat(64)]}));
 const input:any={...scope,generation:1,contextHash:'a'.repeat(64),idempotencyKey:'save',drafts};
 expect(await prepareWeeklyDrafts({rpc} as any,p,input)).toEqual(saved);
 const args:any=rpc.mock.calls.find(c=>c[0]==='social_weekly_save');expect(args).toBeTruthy();
 r.preparation=saved;r.content.posts=saved.posts.map((x,i)=>({id:'saved'+i,revision:{id:'rev'+i,draft:{channel:x.channel,scheduledAt:x.slotKey.startsWith('2026-11-03')?'2026-11-03T16:00:00Z':'2026-11-06T19:30:00Z'}}}));
 expect(await prepareWeeklyDrafts({rpc} as any,p,input)).toEqual(saved)
});
