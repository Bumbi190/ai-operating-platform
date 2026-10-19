import {expect} from 'vitest'
export const project='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',user='11111111-1111-4111-8111-111111111111',
 post='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333',
 planId='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555',sha='a'.repeat(64),planSha='b'.repeat(64)
const now=Date.parse('2026-10-19T06:00:00.000Z')
export function fixture(){
 const brief:any={kind:'the-prompt-film-brief-v1',source:{title:'Anthropic announces AI support fund',summary:'Anthropic proposes support for people affected by AI.',url:'https://www.anthropic.com/news/example',key:'rss_anthropic',publishedAt:'2026-10-18T16:49:35.513Z'},
 editorial:{language:'en',hook:'A PROPOSED AI FUND',script:'Anthropic has proposed a fund. Stockholder approval is still required. Follow The Prompt for AI news.',creativeVersion:'the-prompt-illustrated-smooth-v1',compositionId:'ThePromptIllustratedNews',voice:'victoria'},
 scenes:[{brief:'Five orange glass tiles in a conceptual equity diorama.'},{brief:'A conceptual approval gate with an unsigned proposal.'},{brief:'Adults learning new digital skills in a detailed workshop.'}]}
 const plan:any={project:{id:project,name:'The Prompt',slug:'ai-media-automation'},currentRevision:{id:planId,sequence:1,sha256:planSha,choices:[{channel:'youtube',format:'video',cadence:'manual',purpose:'English AI news'}],createdAt:'2026-10-19T05:00:00.000Z'},decision:{id:other,revisionId:planId,sha256:planSha,decision:'approve',decidedAt:'2026-10-19T05:01:00.000Z'},workspaceUrl:'/social'}
 const content:any={project:plan.project,posts:[{id:post,revision:{id:revision,sequence:1,sha256:sha,planRevisionId:planId,draft:{channel:'youtube',format:'video',title:'AI fund video draft',text:brief.editorial.script,linkUrl:brief.source.url,mediaIds:[],mediaBrief:'Three conceptual illustrations.',scheduledAt:null},media:[],binding:null,createdAt:'2026-10-19T05:02:00.000Z'},decision:null,status:'proposal',requirements:['MEDIA_REQUIRED']}],assets:[],hasMoreAssets:false,plannedChannels:plan.currentRevision.choices,currentPlanRevisionId:planId,planApproved:true,workspaceUrl:'/social',dispatchEnabled:false,publicationReady:false}
 const p={userId:user,allowedProjectIds:[project]},input:any={projectId:project,postId:post,revisionId:revision,sha256:sha}
 const calls:string[]=[],owners:any[]=[{id:project,owner_id:user}]
 let stopped=false,cr=0,pr=0,afterContent=(n:number)=>{},afterPlan=(n:number)=>{}
 const db:any={from(table:string){calls.push('from:'+table);if(table!=='projects')throw Error('Unexpected table '+table)
  const filters:Record<string,unknown>={},q:any={select(){return q},eq(k:string,v:unknown){filters[k]=v;return q},then(a:any,b:any){return Promise.resolve({data:owners.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),error:null}).then(a,b)}};return q},
 async rpc(name:string,args:any){calls.push('rpc:'+name)
  if(name==='social_content_active')return{data:null,error:stopped?{message:'SOCIAL_CONTENT_STOPPED'}:null}
  expect(args.p_principal).toEqual(p);expect(args.p_input).toEqual({projectId:project})
  if(name==='social_content_read'){afterContent(++cr);return{data:structuredClone(content),error:null}}
  if(name==='social_launch_plan_read'){afterPlan(++pr);return{data:structuredClone(plan),error:null}}
  throw Error('Unexpected or writing RPC '+name)}}
 return{db,p,input,brief,plan,content,calls,owners,stop(){stopped=true},onContent(fn:(n:number)=>void){afterContent=fn},onPlan(fn:(n:number)=>void){afterPlan=fn}}
}
