import {beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
vi.mock('@/lib/cost/governed-spend',async original=>({...await original<typeof import('@/lib/cost/governed-spend')>(),withGovernedSpend:async (_:unknown,run:()=>Promise<unknown>)=>run()}))
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const USER=id(1),PROJECT=id(2),CONVERSATION=id(3),PLAN=id(4),POST=id(5),REV=id(6),CAMPAIGN=id(7),OTHER=id(8)
let writes:any[]=[],rpcs:any[]=[],calls:any[]=[],rpcData:Record<string,unknown>={},rpcErrors:Record<string,unknown>={}
const draft={channel:'linkedin',format:'text',title:'Handlarvardagen',text:'Ett konkret underlag för svenska bilhandlare inför nästa affär.',linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:null}
const proposal=()=>({projectId:PROJECT,postId:POST,planRevisionId:PLAN,expectedRevisionId:null,idempotencyKey:'receipt-test',draft})
const postRow=(postId=POST,revisionId=REV)=>({id:postId,revision:{id:revisionId,sequence:1,sha256:'a'.repeat(64),planRevisionId:PLAN,draft,media:[],binding:null,createdAt:'2026-11-01T08:00:00Z'},decision:null,status:'proposal',requirements:[]})
const contentView=()=>({project:{id:PROJECT,name:'Handlarbörsen',slug:'handlarborsen'},posts:[postRow(),postRow(OTHER,id(9))],assets:[],hasMoreAssets:false,plannedChannels:[],currentPlanRevisionId:PLAN,planApproved:true,workspaceUrl:'/projects/handlarborsen/social#content',dispatchEnabled:false,publicationReady:false})
const campaignInput=()=>({projectId:PROJECT,campaignId:CAMPAIGN,planRevisionId:PLAN,profileRevisionId:id(10),idempotencyKey:'three-voice-posts',items:[0,1,2].map(i=>({title:'Inlägg '+i,text:'Perspektiv '+i+': '+'Vad behöver en bilhandlare före nästa affär? '.repeat(14),imagePrompt:'Fotorealistisk bilhall i mörk blå ton, naturligt sidoljus, riktiga bilar och rena material. '.repeat(8),localMinute:'2099-11-0'+(i+3)+'T08:30'}))})
const campaignView=(status='queued')=>({id:CAMPAIGN,projectId:PROJECT,conversationId:CONVERSATION,status,items:campaignInput().items.map((d,i)=>({id:id(20+i),runId:id(30+i),postId:id(40+i),state:status==='review_ready'?'review_ready':status==='uncertain'?'uncertain':'queued',unitCeilingSek:1,draft:{...d,scheduledAt:'2099-11-03T07:30:00.000Z'},assetId:status==='review_ready'?id(50+i):null,revisionId:status==='review_ready'?id(60+i):null,reason:null})),workspaceUrl:'/projects/handlarborsen/social/campaigns/'+CAMPAIGN,contentUrl:'/projects/handlarborsen/social#content',maxCostSek:3,publicationAuthority:false})
function builder(table:string):any{
 let single=false
 const b:any=new Proxy({}, {get(_t,key){
  if(key==='then')return (ok:any)=>Promise.resolve({data:single?(table==='conversations'?{id:CONVERSATION}:null):table==='projects'?[{id:PROJECT,owner_id:USER,name:'Handlarbörsen',slug:'handlarborsen'}]:[],error:null}).then(ok)
  if(key==='single'||key==='maybeSingle')return ()=>{single=true;return b}
  if(['insert','update','upsert','delete'].includes(String(key)))return (value:any)=>{writes.push({table,key,value});return b}
  return ()=>b
 }})
 return b
}
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:USER,email:'owner@example.com'}}})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:builder,rpc:(name:string,args:any)=>{rpcs.push({name,args});return Promise.resolve({data:rpcData[name]??null,error:rpcErrors[name]??null})}})}))
type Step={name?:string;input?:unknown;text?:string;stop?:string;fail?:boolean}
let steps:Step[]=[]
vi.mock('@anthropic-ai/sdk',()=>({default:class{messages={stream:(args:any)=>{
 const step=steps[calls.length]??{text:'Klart, allt är sparat. Revision: forged-revision'}
 calls.push(args)
 let onText=(s:string)=>{}
 return {on(_e:string,cb:any){onText=cb;return this},async finalMessage(){
  if(step.text)onText(step.text)
  if(step.fail)throw Error('provider interrupted')
  return {stop_reason:step.stop??(step.name?'tool_use':'end_turn'),content:[...(step.text?[{type:'text',text:step.text}]:[]),...(step.name?[{type:'tool_use',id:'tu_'+calls.length,name:step.name,input:step.input}]:[])]}
 }}
}}}}))
async function run(text='Planera tre LinkedIn-inlägg för granskning.',voice=false,history:any[]=[],extra:Record<string,unknown>={}){
 const {POST}=await import('@/app/api/chat/route')
 const res=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...extra,conversation_id:CONVERSATION,voice,messages:[...history,{role:'user',content:text}]})}) as any)
 const raw=await new Response(res.body).text()
 await new Promise(resolve=>setTimeout(resolve,0))
 const events=raw.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)))
 return {res,events,text:events.filter(e=>e.event==='text').map(e=>e.text).join(''),persisted:writes.filter(w=>w.table==='conversation_messages'&&w.value.role==='assistant').map(w=>w.value.content).filter(Boolean).join('\n')}
}
beforeEach(()=>{
 vi.resetModules();writes=[];rpcs=[];calls=[];rpcData={};rpcErrors={};steps=[]
 process.env.ANTHROPIC_API_KEY='test-key';delete process.env.ATLAS_PROVIDER
 process.env.SOCIAL_CAMPAIGN_PREPARATION='1';process.env.H1_SPEND_GATE='1';process.env.SOCIAL_CAMPAIGN_PROJECT_IDS=PROJECT;process.env.SOCIAL_CAMPAIGN_IMAGE_ORIGINS='https://ideogram.ai'
})
describe('voice social tool capacity',()=>{
 it('fits three complete campaign items in voice and retains the short voice instruction',async()=>{
  rpcData.social_campaign_replay=campaignView()
  steps=[{name:'prepare_social_campaign',input:campaignInput()}]
  const result=await run(undefined,true)
  expect(calls[0].max_tokens).toBe(4096)
  expect(calls[0].system).toContain('HÖGST 2 meningar')
  expect(rpcs.find(r=>r.name==='social_campaign_replay')?.args.p_input.items).toHaveLength(3)
  expect(result.text).toContain('kö')
 })
 it('inherits recent preparation context for a short spoken continuation',async()=>{
  await run('Okej, fortsätt.',true,[{role:'user',content:'Planera tre LinkedIn-inlägg för granskning.'},{role:'assistant',content:'Jag förbereder underlaget.'}])
  expect(calls[0].max_tokens).toBe(4096)
 })
 it('keeps ordinary speech at 150 tokens',async()=>{
  steps=[{text:'Hej!'}];await run('Hej Atlas',true)
  expect(calls[0].max_tokens).toBe(150)
 })
})
describe('trusted social response before SSE, speech and reload',()=>{
 it('never emits or persists a save claim without an actual tool receipt',async()=>{
  const r=await run()
  expect(r.text).not.toContain('Klart, allt är sparat')
  expect(r.text).not.toContain('forged-revision')
  expect(r.persisted).toBe(r.text)
  expect(r.text).toMatch(/inte.*bekräft|ingen.*bekräft/i)
 })
 it('uses only the touched post from a full-project save view and suppresses pre-tool prose',async()=>{
  rpcData.social_content_save=contentView()
  steps=[{name:'propose_social_content',input:proposal(),text:'Alla tre är sparade. forged-before-tool'},{text:'Klart, alla tre revisioner: forged-after-tool '+id(9)}]
  const r=await run()
  expect(rpcs.filter(x=>x.name==='social_content_save')).toHaveLength(1)
  expect(r.text).toContain(REV)
  expect(r.text).not.toContain(id(9))
  expect(r.text).not.toContain('forged')
  expect(r.persisted).toBe(r.text)
 })
 it('does not accept the sibling revision when the requested post is missing',async()=>{
  rpcData.social_content_save={...contentView(),posts:[postRow(OTHER,id(9))]}
  steps=[{name:'propose_social_content',input:proposal()}]
  const r=await run()
  expect(r.text).not.toContain(id(9));expect(r.text).not.toContain('Klart')
  expect(r.text).toMatch(/inte.*bekräft|ingen.*bekräft/i)
 })
 it('does not report a successful save on an RPC conflict',async()=>{
  rpcErrors.social_content_save={message:'SOCIAL_CONTENT_REVISION_CONFLICT',code:'23505'}
  steps=[{name:'propose_social_content',input:proposal()}]
  const r=await run()
  expect(r.text).not.toContain('Klart');expect(r.text).toContain('REVISION_CONFLICT')
 })
 it('a read cannot confirm a new write',async()=>{
  rpcData.social_content_read=contentView()
  steps=[{name:'get_social_content',input:{projectId:PROJECT}}]
  const r=await run()
  expect(r.text).not.toContain('forged');expect(r.text).not.toContain(REV)
  expect(r.text).toContain('2 befintliga utkast');expect(r.text).not.toContain('Sparningen av innehållsutkastet har bekräftats')
 })
 it('queued campaign receipt cannot claim completed drafts',async()=>{
  rpcData.social_campaign_replay=campaignView()
  steps=[{name:'prepare_social_campaign',input:campaignInput(),text:'Klart för granskning: forged'}]
  const r=await run()
  expect(r.text).toContain(CAMPAIGN);expect(r.text).toContain('kö')
  expect(r.text).not.toContain('Klart');expect(r.text).not.toContain('forged')
 })
 it('campaign reads describe ready and uncertain states without claiming a new preparation',async()=>{
  for(const status of ['review_ready','uncertain']){
   vi.resetModules();calls=[];writes=[];rpcs=[]
   rpcData.social_campaign_read=campaignView(status)
   steps=[{name:'get_social_campaign',input:{projectId:PROJECT,campaignId:CAMPAIGN}}]
   const r=await run('Vad är status på LinkedIn-kampanjen?')
   expect(r.text).not.toContain('forged')
   expect(r.text).toContain(status==='review_ready'?'3':'osäker')
   expect(r.text).not.toContain('ny kampanj')
  }
 })
 it('truncated partial tools execute nothing, never retry, and never leak prose',async()=>{
  steps=[{name:'propose_social_content',input:proposal(),text:'Klart, forged-truncated',stop:'max_tokens'}]
  const r=await run(undefined,true)
  expect(rpcs.filter(x=>x.name==='social_content_save')).toHaveLength(0)
  expect(calls).toHaveLength(1);expect(r.text).not.toContain('forged')
  expect(r.text).toMatch(/avbr|ofullst|längdgräns/i)
 })
 it('keeps successful save evidence when a later provider request fails',async()=>{
  rpcData.social_content_save=contentView()
  steps=[{name:'propose_social_content',input:proposal()},{text:'forged-on-failure',fail:true}]
  const r=await run()
  expect(r.text).toContain(REV);expect(r.text).not.toContain('forged')
  expect(r.persisted).toBe(r.text);expect(calls).toHaveLength(2)
 })
})

describe('preparation routing and exact multi-post results',()=>{
 it('requires a real tool for the explicit preparation request',async()=>{
  await run()
  expect(calls[0].tool_choice).toEqual({type:'any'})
 })
 it('lists the two actually saved posts without a third untouched sibling',async()=>{
  rpcData.social_content_save={...contentView(),posts:[...contentView().posts,postRow(id(11),id(12))]}
  steps=[{name:'propose_social_content',input:proposal()},{name:'propose_social_content',input:{...proposal(),postId:OTHER,idempotencyKey:'second-write'}}]
  const r=await run()
  expect(rpcs.filter(x=>x.name==='social_content_save')).toHaveLength(2)
  expect(r.text).toContain(REV);expect(r.text).toContain(id(9));expect(r.text).not.toContain(id(12))
  expect(r.persisted).toBe(r.text)
 })
 it('keeps an unrelated spoken topic at 150 even after preparation',async()=>{
  steps=[{text:'Klockan är åtta.'}]
  await run('Vad är klockan i Tokyo?',true,[{role:'user',content:'Planera tre LinkedIn-inlägg för granskning.'}])
  expect(calls[0].max_tokens).toBe(150)
 })
})

describe('fresh review regression matrix',()=>{
 it('holds early prose until a later social call determines the whole response',async()=>{
  rpcData.social_content_save=contentView()
  steps=[{name:'get_current_time',input:{timezone:'Europe/Stockholm'},text:'forged-earlier-round: allt är sparat'},{name:'propose_social_content',input:proposal()}]
  const r=await run('Fortsätt med uppgiften.')
  expect(r.text).toContain(REV);expect(r.text).not.toContain('forged');expect(r.persisted).toBe(r.text)
 })
 it('answers a new imperative topic instead of inheriting social preparation',async()=>{
  steps=[{text:'Här är mötets sammanfattning.'}]
  const r=await run('Gör en sammanfattning av mötet.',true,[{role:'user',content:'Planera tre LinkedIn-inlägg för granskning.'}])
  expect(calls[0].max_tokens).toBe(150)
  expect(r.text).toBe('Här är mötets sammanfattning.')
 })
 it('does not revive an earlier preparation across a different user topic',async()=>{
  steps=[{text:'Jag fortsätter förklaringen.'}]
  await run('Okej, fortsätt.',true,[{role:'user',content:'Planera tre LinkedIn-inlägg för granskning.'},{role:'user',content:'Förklara hur en motor fungerar.'}])
  expect(calls[0].max_tokens).toBe(150)
 })
 it('keeps a successful profile action on its existing response path',async()=>{
  const profile={description:'Marknadsplats för bilhandlare',audience:'Bilhandlare',tone:'Saklig',websiteUrl:null,callToAction:'',factualBoundaries:'',preferredMediaIds:[]}
  rpcData.social_profile_save={project:{id:PROJECT,name:'Handlarbörsen',slug:'handlarborsen'},revision:{id:REV,sequence:1,profile},assets:[],hasMoreAssets:false,workspaceUrl:'/projects/handlarborsen/social#profile'}
  steps=[{name:'propose_social_profile',input:{projectId:PROJECT,expectedRevisionId:null,idempotencyKey:'profile-test',profile}},{text:'Profilen är sparad. Öppna /projects/handlarborsen/social#profile'}]
  const r=await run('Spara målgruppen bilhandlare i vår LinkedIn-profil',true)
  expect(rpcs.some(x=>x.name==='social_profile_save')).toBe(true)
  expect(calls[0].max_tokens).toBe(150);expect(r.text).toContain('Profilen är sparad.')
  expect(r.persisted).toBe(r.text)
 })
 it('preserves an ordinary workflow answer',async()=>{
  steps=[{text:'Arbetsflödesplanen finns i arbetsytan.'}]
  const r=await run('Skapa ett workflow för granskning',true)
  expect(calls[0].max_tokens).toBe(150);expect(r.text).toContain('Arbetsflödesplanen')
 })
 it('recognizes new images and genuine continuations before content fast path',async()=>{
  for(const [text,history] of [['Ta fram tre LinkedIn-inlägg med varsin ny bild',[]],['Okej, fortsätt.',[{role:'user',content:'Planera tre LinkedIn-inlägg för granskning.'}]]] as const){
   vi.resetModules();calls=[];writes=[];steps=[{text:'Jag har sparat allt: forged'}]
   const r=await run(text,true,[...history],{mode:'content'})
   expect(calls[0].max_tokens).toBe(4096);expect(calls[0].tools.length).toBeGreaterThan(0)
   expect(r.text).not.toContain('forged')
  }
 })
 it('reports observed content on a read without confirming a new save',async()=>{
  rpcData.social_content_read=contentView()
  steps=[{name:'get_social_content',input:{projectId:PROJECT}}]
  const r=await run('Vilka inlägg har vi i våra utkast?')
  expect(r.text).toContain('2');expect(r.text).toContain('utkast')
  expect(r.text).not.toContain('Sparat innehållsutkast')
  expect(r.text).toContain('/projects/handlarborsen/social#content')
 })
 it('does not use a preparatory read to cover up a failed save',async()=>{
  rpcData.social_content_read=contentView();rpcErrors.social_content_save={message:'SOCIAL_CONTENT_REVISION_CONFLICT',code:'23505'}
  steps=[{name:'get_social_content',input:{projectId:PROJECT}},{name:'propose_social_content',input:proposal()}]
  const r=await run()
  expect(r.text).toContain('REVISION_CONFLICT');expect(r.text).not.toContain('2 befintliga')
 })
 it('speech includes unresolved image work alongside a confirmed text save',async()=>{
  rpcData.social_content_save=contentView();rpcData.social_campaign_read=campaignView('uncertain')
  steps=[{name:'propose_social_content',input:proposal()},{name:'get_social_campaign',input:{projectId:PROJECT,campaignId:CAMPAIGN}}]
  const r=await run(undefined,true)
  expect(r.text).toContain('spar');expect(r.text).toContain('osäker')
  expect(r.persisted).toBe(r.text)
 })
 it('speech retains both a tool failure and a later interruption',async()=>{
  rpcErrors.social_content_save={message:'SOCIAL_CONTENT_REVISION_CONFLICT',code:'23505'}
  steps=[{name:'propose_social_content',input:proposal()},{fail:true}]
  const r=await run(undefined,true)
  expect(r.text).toMatch(/ändringar.*inte.*bekräft/);expect(r.text).toContain('avbröts')
 })
 for(const question of ['Vad är klockan i Tokyo?','Hej Atlas']){
  it('retains text-only truncated speech and matching persistence for '+question,async()=>{
   steps=[{text:'Ett kort svar som avbröts',stop:'max_tokens'}]
   const r=await run(question,true)
   expect(r.text).toContain('Ett kort svar');expect(r.persisted).toBe(r.text);expect(calls).toHaveLength(1)
  })
 }
 it('labels a replay return as current matching revision rather than originating revision',async()=>{
  rpcData.social_content_save=contentView()
  steps=[{name:'propose_social_content',input:proposal()}]
  const r=await run()
  expect(r.text).toMatch(/aktuell matchande version/i)
 })
})
