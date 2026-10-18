
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialSchedulePanel} from '../components/social-launch/SocialSchedulePanel'
import {monthlyPlanningSlots} from '../lib/social-launch/scheduling/planning'
import type {ScheduleItem,ScheduleBatchView} from '../lib/social-launch/scheduling/types'
import type {SocialContentPost} from '../lib/social-launch/content/types'
const projectId='77cda551-57c9-4dc0-b019-1bb6438777f7',id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const scenario=new URLSearchParams(location.search).get('scenario')??'normal',monthly=['missing_release','january'].includes(scenario),releaseMonth=scenario==='january'?'2027-01':'2026-11'
const time=monthly?releaseMonth+'-01T19:30:00.000Z':'2026-10-20T15:00:00.000Z',localMinute=monthly?releaseMonth+'-01T20:30':'2026-10-20T17:00'
const channels=['facebook','instagram'] as const
const posts:SocialContentPost[]=channels.map((channel,i)=>({id:id(10+i),status:'approved',requirements:['activation_required'],decision:{id:id(50+i),decision:'approve',revisionId:id(20+i),sha256:(i?'b':'a').repeat(64),decidedAt:'2026-10-18T06:00:00Z'},revision:{id:id(20+i),sequence:1,sha256:(i?'b':'a').repeat(64),planRevisionId:id(60),draft:{channel,format:'image',title:monthly?'Smygtitt för '+releaseMonth:'En liten skuggjakt',text:monthly?'Nu finns '+releaseMonth+' hos Familje-Stunden! Här är en liten smygtitt på månadens berättelse och aktiviteter med Nova och Pling.':'En ficklampa, en vägg och lite nyfikenhet. ✨\n\nVilka skuggor kan ni hitta tillsammans? Låt barnet välja vad nästa skugga ska föreställa.\n\nFler stunder tillsammans på familje-stunden.se.',linkUrl:null,mediaIds:[id(40)],mediaBrief:'Nova och Pling',scheduledAt:time},media:[{id:id(40),kind:'image',sha256:'c'.repeat(64),mimeType:'image/jpeg',width:320,height:400}],binding:{id:id(30+i),accountId:String(12345+i),label:i?'@familje_stunden (testkonto)':'Familje-Stunden (testkonto)'},createdAt:'2026-10-18T06:00:00Z'}}))
const items:ScheduleItem[]=posts.map((p,i)=>({postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decisionId:p.decision!.id,planRevisionId:p.revision.planRevisionId,bindingId:p.revision.binding!.id,accountId:p.revision.binding!.accountId,channel:channels[i],asset:{id:id(40),sha256:'c'.repeat(64)},localMinute,scheduledAt:time,expiresAt:new Date(Date.parse(time)+600000).toISOString(),occasionId:id(70),kind:monthly?'month_release':'ordinary',releaseCondition:monthly?{releaseMonth,catalogSha256:'e'.repeat(64)}:null}))
const key='social-schedule-fixture-'+scenario
const saved=JSON.parse(sessionStorage.getItem(key)??'{}')
let state={status:['missing_release','uncertain','missed','delayed'].includes(scenario)?'approved':scenario==='revoked'?'revoked':'proposal',monthlyEnabled:monthly,...saved}
function batch():ScheduleBatchView{
 const status=state.status as ScheduleBatchView['status']
 return {projectId,batchId:id(80),revisionId:id(81),sha256:'f'.repeat(64),status,reviewCurrent:scenario!=='server_stale',manifest:{projectId,items},version:status==='proposal'?1:status==='approved'?2:3,review:scenario==='no_snapshots'?[]:items.map((item,i)=>({item,revision:posts[i].revision})),approval:status==='proposal'?null:{id:id(82),approvedBy:id(83),approvedAt:'2026-10-18T06:30:00Z'},jobs:status==='proposal'?[]:items.map((item,i)=>({id:id(90+i),batchId:id(80),postId:item.postId,channel:item.channel,state:status==='revoked'?'cancelled':scenario==='missing_release'?'waiting':scenario==='uncertain'?'uncertain':scenario==='missed'?'missed':scenario==='delayed'?'waiting':'queued',scheduledAt:item.scheduledAt,expiresAt:item.expiresAt,publicationId:scenario==='uncertain'||scenario==='delayed'?id(100+i):null,reason:scenario==='missing_release'?'release_required':null,version:1}))}
}
const realFetch=window.fetch
window.fetch=async(input,init)=>{
 if(typeof input==='string'&&input.startsWith('/api/social-schedules')){
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body))
   if(body.operation==='approve')state.status='approved'
   else if(body.operation==='revoke')state.status='revoked'
   else if(body.operation==='monthly_rule_save')state.monthlyEnabled=body.rule.enabled
   else if(body.operation==='release_confirm')return Response.json({code:'CONFLICT'},{status:409})
   else if(body.operation!=='propose')return Response.json({code:'INVALID_BODY'},{status:400})
   sessionStorage.setItem(key,JSON.stringify(state));return Response.json(batch())
  }
  const b=batch()
  return Response.json({projectId,batches:[b],monthlyRule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled:state.monthlyEnabled},releaseEvidence:[],canManage:scenario!=='reader',dispatchEnabled:false,monthlySlots:monthlyPlanningSlots('2026-10-18T07:00:00.000Z',[b])})
 }
 return realFetch(input,init)
}
function Fixture(){
 const [dirty,setDirty]=useState(false)
 const current=dirty?posts.map(p=>({...p,status:'needs_review' as const,decision:null,revision:{...p.revision,id:id(120),sha256:'d'.repeat(64),draft:{...p.revision.draft,scheduledAt:'2026-10-20T16:00:00.000Z'}}})):posts
 return <main><h1>Testvy · Familje-Stundens publiceringsschema</h1><button onClick={()=>setDirty(true)}>Ändra önskad tid i utkastet</button><SocialSchedulePanel projectId={projectId} posts={current} disabled={dirty}/></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)
