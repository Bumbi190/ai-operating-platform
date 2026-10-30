import {expect,it,vi} from 'vitest';
import {readCalendarDetail} from './detail';
import {readSocialContent} from '../social-launch/content/store';
import {readSchedules} from '../social-launch/scheduling/store';
import type {AdminDb} from './types';
vi.mock('../social-launch/content/store',()=>({readSocialContent:vi.fn()}));vi.mock('../social-launch/scheduling/store',()=>({readSchedules:vi.fn()}));
const p='10000000-0000-4000-8000-000000000001',u='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001',rev='40000000-0000-4000-8000-000000000001',hash='a'.repeat(64),actor={userId:u,allowedProjectIds:[p]};
const media={kind:'media' as const,projectId:p,scriptId:id};
const script={id,project_id:p,hook:'AI-nyhet',script:'Hela manuset',cta:'Följ oss',hashtags:['#Nyhet'],media_news_items:{url:'https://example.se/news',source_name:'Källtidningen'},status:'approved',video_status:'ready',generated_at:'2026-10-26T08:00:00Z',reviewed_at:null,published_at:null,instagram_media_id:null,facebook_post_id:null,youtube_video_id:null,publish_channel_state:{secret:'NEVER-EXPOSE'},video_url:'https://s3.eu-north-1.amazonaws.com/remotionlambda-testbucket/renders/render123/'+id+'.mp4',render_id:'render123',render_bucket:'remotionlambda-testbucket'};
function db(options:{foreign?:boolean;badVideo?:boolean}={}){const q=(data:unknown)=>{const b:any={};for(const k of ['select','eq','in','limit','is'])b[k]=()=>b;b.maybeSingle=async()=>({data,error:null});b.then=(resolve:any)=>Promise.resolve({data,error:null}).then(resolve);return b};return {from:(table:string)=>table==='projects'?q({id:p,owner_id:options.foreign?'other':u,slug:'ai-media-automation'}):table==='media_scripts'?q({...script,video_url:options.badVideo?'https://evil.example/video.mp4':script.video_url}):table==='social_account_bindings'?q(['facebook','instagram','youtube'].map(platform=>({platform,verification:'provider_attested',blocked_at:null}))):q(null)} as unknown as AdminDb;}
it('loads only selected owned script, safe producer video and escaped source text without provider data',async()=>{
 vi.stubEnv('AWS_REGION','eu-north-1');vi.stubEnv('REMOTION_S3_BUCKET','remotionlambda-testbucket');
 const result=await readCalendarDetail({adminDb:db()},actor,media);expect(result.content).toMatchObject({kind:'media',media:[{kind:'video',src:script.video_url}]});expect(JSON.stringify(result)).not.toContain('NEVER-EXPOSE');
 for(const text of ['Manus','Hela manuset','Facebook / Instagram','AI-nyhet','Följ oss','#Nyhet','https://example.se/news','Källtidningen','YouTube','#Shorts #AI #TechNews'])expect(result.content).toHaveProperty('text',expect.stringContaining(text));
 const bad=await readCalendarDetail({adminDb:db({badVideo:true})},actor,media);expect(bad.content).toMatchObject({kind:'media',media:[]});expect(JSON.stringify(bad)).not.toContain('evil.example');vi.unstubAllEnvs();
});
it('refuses foreign scope, ownership and source overrides before returning content',async()=>{
 await expect(readCalendarDetail({adminDb:db()}, {...actor,allowedProjectIds:[]},media)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(readCalendarDetail({adminDb:db({foreign:true})},actor,media)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(readCalendarDetail({adminDb:db()},actor,{...media,url:'https://evil.example'} as any)).rejects.toMatchObject({code:'INVALID_INPUT'});
});
it('keeps pinned schedule revision instead of substituting a newer draft',async()=>{
 const pinned={id:rev,sha256:hash,draft:{title:'Gällande text',text:'Rätt sparad text',linkUrl:'https://example.se/pinned-link'},media:[]};
 vi.mocked(readSocialContent).mockResolvedValue({posts:[{id,revision:{...pinned,id:'new',draft:{text:'NEW-DRAFT'}}}]} as any);
 vi.mocked(readSchedules).mockResolvedValue({batches:[{jobs:[{id:rev,postId:id}],manifest:{items:[{postId:id,revisionId:rev,sha256:hash}]},review:[{item:{postId:id,revisionId:rev},revision:pinned}]}]} as any);
 const source={kind:'social' as const,projectId:p,postId:id,revisionId:rev,sha256:hash,jobId:rev};const result=await readCalendarDetail({adminDb:db()},actor,source);expect(result.content).toMatchObject({text:expect.stringContaining('Rätt sparad text')});expect(result.content).toHaveProperty('text',expect.stringContaining('https://example.se/pinned-link'));expect(JSON.stringify(result)).not.toContain('NEW-DRAFT');
 await expect(readCalendarDetail({adminDb:db()},actor,{...source,sha256:'b'.repeat(64)})).rejects.toMatchObject({code:'CONFLICT'});
});
