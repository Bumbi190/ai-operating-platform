import {expect,it} from 'vitest';
import {readCalendarMediaEvents} from './source-media-events';
import type {AdminDb} from './types';
import {weekRange} from './time';
const p='10000000-0000-4000-8000-000000000001',u='20000000-0000-4000-8000-000000000001',actor={userId:u,allowedProjectIds:[p]},range=weekRange('2026-10-26'),now='2026-10-26T12:00:00Z';
const row=(id='s')=>({id,project_id:p,hook:'Film',status:'approved',video_status:'ready',generated_at:now,reviewed_at:now,published_at:null,instagram_media_id:null,facebook_post_id:null,youtube_video_id:null,publish_channel_state:{}});
function fixture(options:{foreign?:boolean;fail?:string;many?:boolean;undated?:boolean}={}){
 const calls:{table:string;method:string;args:unknown[]}[]=[];
 const client={from(table:string){let undated=false;const q:any={};for(const method of ['select','eq','in','is','or','order','limit'])q[method]=(...args:unknown[])=>{calls.push({table,method,args});if(method==='is'&&args[0]==='generated_at')undated=true;return q};q.then=(resolve:any)=>Promise.resolve({error:options.fail===table?{message:'SECRET'}:null,data:table==='projects'?[{id:p,owner_id:options.foreign?'other':u,slug:'ai-media-automation'}]:table==='social_account_bindings'?['facebook','instagram','youtube'].map(platform=>({platform,verification:'provider_attested',blocked_at:null})):undated?(options.undated?[{...row('unknown'),generated_at:null,reviewed_at:null}]:[]):options.many?Array.from({length:101},(_,i)=>row('s'+i)):[row()]}).then(resolve);return q}};
 return {db:client as AdminDb,calls};
}
it('applies server scope and source-date range before limiting and keeps unknown dates separate',async()=>{
 const f=fixture({undated:true}),result=await readCalendarMediaEvents(f.db,actor,range,now);expect(result.entries).toHaveLength(1);expect(result.undated).toHaveLength(1);
 const query=f.calls.find(c=>c.method==='or')?.args[0] as string;expect(query).toContain('published_at.gte.2026-10-25T23:00:00.000Z');expect(query).toContain('reviewed_at.is.null');expect(query).toContain('generated_at.lt.2026-11-01T23:00:00.000Z');
 expect(f.calls.findIndex(c=>c.method==='or')).toBeLessThan(f.calls.findIndex(c=>c.table==='media_scripts'&&c.method==='limit'));
 expect(f.calls).toContainEqual({table:'projects',method:'eq',args:['owner_id',u]});expect(JSON.stringify(result)).not.toContain('publish_channel_state');
});
it('reports source failure/truncation and never treats foreign ownership as an empty healthy feed',async()=>{
 expect(await readCalendarMediaEvents(fixture({foreign:true}).db,actor,range,now)).toMatchObject({available:false,entries:[]});
 expect(await readCalendarMediaEvents(fixture({fail:'media_scripts'}).db,actor,range,now)).toMatchObject({available:false,entries:[]});
 expect(await readCalendarMediaEvents(fixture({many:true}).db,actor,range,now)).toMatchObject({available:true,truncated:true});
 const f=fixture();expect(await readCalendarMediaEvents(f.db,{...actor,allowedProjectIds:[]},range,now)).toMatchObject({available:true,entries:[]});expect(f.calls).toEqual([]);
});
