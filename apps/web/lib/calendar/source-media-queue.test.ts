import {expect,it} from 'vitest';
import {readCalendarMediaQueue} from './source-media-queue';
import type {AdminDb} from './types';
const user='20000000-0000-4000-8000-000000000001',project='10000000-0000-4000-8000-000000000001';
const now='2026-10-26T10:00:00.000Z',actor={userId:user,allowedProjectIds:[project]};
const script=(id='s')=>({id,project_id:project,hook:'Godkänd nyhet',status:'approved',video_status:'ready',generated_at:now,instagram_media_id:null,facebook_post_id:null,youtube_video_id:null,publish_channel_state:{}});
type Options={projects?:unknown[];active?:unknown[];published?:unknown[];bindings?:unknown[];fail?:string;throw?:string};
function db(o:Options={}){
 const calls:{table:string;method:string;args:unknown[]}[]=[];
 const instance={from(table:string){let status:unknown;const q:any={};for(const method of ['select','eq','in','is','order','limit'])q[method]=(...args:unknown[])=>{calls.push({table,method,args});if(method==='in'&&args[0]==='status')status=args[1];return q};q.then=(resolve:any,reject:any)=>{if(o.throw===table)return Promise.reject(Error('SECRET')).then(resolve,reject);const data=table==='projects'?(o.projects??[{id:project,owner_id:user,slug:'ai-media-automation'}]):table==='media_scripts'?(Array.isArray(status)&&status.includes('approved')?o.active??[script()]:o.published??[]):o.bindings??['facebook','instagram','youtube'].map(platform=>({platform,verification:'provider_attested',blocked_at:null}));return Promise.resolve({data,error:o.fail===table?{message:'SECRET'}:null}).then(resolve,reject)};return q}};
 return {db:instance as AdminDb,calls};
}
it('does not query feeds for empty or unavailable scope',async()=>{
 const f=db();expect(await readCalendarMediaQueue(f.db,{...actor,allowedProjectIds:[]},now)).toMatchObject({available:true,projectId:null,items:[]});expect(f.calls).toEqual([]);
 expect(await readCalendarMediaQueue(f.db,{...actor,projectScopeAvailable:false},now)).toMatchObject({available:false,items:[]});expect(f.calls).toEqual([]);
});
it('binds ownership, allowed project IDs and canonical slug, returning only safe status DTOs',async()=>{
 const f=db(),result=await readCalendarMediaQueue(f.db,actor,now);expect(result).toMatchObject({projectId:project,available:true,readAt:now});expect(result.items).toHaveLength(1);
 for(const args of [['owner_id',user],['slug','ai-media-automation']])expect(f.calls).toContainEqual({table:'projects',method:'eq',args});
 expect(f.calls).toContainEqual({table:'projects',method:'in',args:['id',[project]]});
 expect(f.calls.filter(c=>c.table==='media_scripts'&&c.method==='eq')).toEqual([{table:'media_scripts',method:'eq',args:['project_id',project]},{table:'media_scripts',method:'eq',args:['project_id',project]}]);
 expect(JSON.stringify(result)).not.toMatch(/publish_channel_state|media_id|post_id|credential|SECRET/);
});
it('rejects foreign/malformed identity and never reads scripts for it',async()=>{
 for(const row of [{id:project,owner_id:'other',slug:'ai-media-automation'},{id:'other',owner_id:user,slug:'ai-media-automation'},{id:project,owner_id:user,slug:'other'}]){
  const f=db({projects:[row]});expect((await readCalendarMediaQueue(f.db,actor,now)).available).toBe(false);expect(f.calls.every(c=>c.table==='projects')).toBe(true);
 }
 const f=db({active:[{...script(),project_id:'other',hook:'FOREIGN-TITLE'}]});expect(await readCalendarMediaQueue(f.db,actor,now)).toMatchObject({available:false,items:[]});
});
it('distinguishes absent project, query failure and unknown bindings',async()=>{
 expect(await readCalendarMediaQueue(db({projects:[]}).db,actor,now)).toMatchObject({available:true,projectId:null});
 for(const table of ['projects','media_scripts'])for(const kind of ['fail','throw'])expect((await readCalendarMediaQueue(db({[kind]:table}).db,actor,now)).available).toBe(false);
 const result=await readCalendarMediaQueue(db({fail:'social_account_bindings'}).db,actor,now);expect(result.available).toBe(false);expect(result.items[0].channels.every(c=>c.tone==='review')).toBe(true);
});
it('caps reads, prioritizes approved films ahead of published history and marks truncation',async()=>{
 const active=Array.from({length:101},(_,i)=>script('s'+i));const f=db({active,published:Array.from({length:101},(_,i)=>({...script('p'+i),status:'published'}))});
 const result=await readCalendarMediaQueue(f.db,actor,now);expect(result.truncated).toBe(true);expect(result.items).toHaveLength(100);expect(result.items.every(i=>i.scriptId.startsWith('s'))).toBe(true);
 expect(f.calls.filter(c=>c.table==='media_scripts'&&c.method==='limit').every(c=>c.args[0]===101)).toBe(true);
});
it('fails closed on malformed/oversized observations and duplicate bindings',async()=>{
 for(const publish_channel_state of ['bad',{bad:'x'.repeat(16385)}])expect(await readCalendarMediaQueue(db({active:[{...script(),publish_channel_state}]}).db,actor,now)).toMatchObject({available:false,items:[]});
 const b={platform:'instagram',verification:'provider_attested',blocked_at:null};const result=await readCalendarMediaQueue(db({bindings:[b,b]}).db,actor,now);expect(result.available).toBe(false);expect(result.items[0].channels[0].tone).toBe('review');
});
