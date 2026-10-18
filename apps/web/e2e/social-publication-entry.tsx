
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialContentPanel} from '../components/social-launch/SocialContentPanel'
import {SocialPublicationPanel} from '../components/social-launch/SocialPublicationPanel'
import type {SocialContentPost} from '../lib/social-launch/content/types'
const fixturePost:SocialContentPost={id:'10000000-0000-4000-8000-000000000010',status:'approved',requirements:[],decision:{id:'10000000-0000-4000-8000-000000000011',decision:'approve',revisionId:'10000000-0000-4000-8000-000000000012',sha256:'a'.repeat(64),decidedAt:'2026-10-18T06:00:00Z'},revision:{id:'10000000-0000-4000-8000-000000000012',sequence:1,sha256:'a'.repeat(64),planRevisionId:'10000000-0000-4000-8000-000000000013',draft:{channel:'facebook',format:'image',title:'Granskat inlägg',text:'Tre saker. Ett helt nytt äventyr.',linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:null},media:[],binding:{id:'10000000-0000-4000-8000-000000000014',accountId:'12345',label:'Familje-Stunden (testkonto)'},createdAt:'2026-10-18T06:00:00Z'}}
const scenario=new URLSearchParams(location.search).get('scenario')
const uncertain=['uncertain','reconciliation','stale'].includes(scenario??'')
let fixturePublished=scenario==='reconciliation'&&sessionStorage.getItem('social-reconciliation-fixture-receipt')==='published'
if(uncertain){
 const realFetch=window.fetch
 window.fetch=async(input,init)=>{
  if(typeof input==='string'&&input==='/api/social-publication-reconciliation'){
   const body=JSON.parse(String(init?.body));if(body.operation==='complete'){if(scenario==='stale')return Response.json({code:'CONFLICT'},{status:409});fixturePublished=true;sessionStorage.setItem('social-reconciliation-fixture-receipt','published');return Response.json({state:'published'})}
   return Response.json({candidates:[{id:'10000000-0000-4000-8000-000000000016',providerId:'12345_67890',accountId:'12345',createdAt:'2026-10-18T06:17:47Z',text:fixturePost.revision.draft.text,photoId:'888',permalink:'https://www.facebook.com/12345/posts/67890',imageUrl:'/e2e/reconciliation-photo.jpg'}],receipt:{id:'10000000-0000-4000-8000-000000000015',version:3},revision:{...fixturePost.revision,media:[{id:'10000000-0000-4000-8000-000000000017',sha256:'a'.repeat(64)}]}})
  }
  if(typeof input==='string'&&input.startsWith('/api/social-publications')){
   if(init?.method==='POST') throw Error('Fixture forbids publication')
   return Response.json({projectId:'10000000-0000-4000-8000-000000000001',postId:fixturePost.id,canRequest:false,blockers:['already_requested'],target:{channel:'facebook',accountLabel:'Familje-Stunden (testkonto)'},publication:{id:'10000000-0000-4000-8000-000000000015',projectId:'10000000-0000-4000-8000-000000000001',postId:fixturePost.id,revisionId:fixturePost.revision.id,sha256:fixturePost.revision.sha256,decisionId:fixturePost.decision!.id,bindingId:fixturePost.revision.binding!.id,channel:'facebook',accountId:'12345',accountLabel:'Familje-Stunden (testkonto)',state:fixturePublished?'published':'uncertain',reconciledAt:fixturePublished?'2026-10-18T07:00:00Z':null,version:3,containerId:null,providerId:fixturePublished?'12345_67890':null,permalink:fixturePublished?'https://www.facebook.com/12345/posts/67890':null,failureCode:'provider_unavailable',confirmation:null,requestedAt:'2026-10-18T06:17:47Z',updatedAt:'2026-10-18T06:17:55Z'}})
  }
  return realFetch(input,init)
 }
}
function Fixture(){const [id,setId]=useState('10000000-0000-4000-8000-000000000001');return uncertain?<main style={{maxWidth:800,margin:'40px auto'}}><h1>Testvy: osäkert publiceringskvitto</h1><SocialPublicationPanel projectId={id} post={fixturePost} disabled={false}/></main>:<><button onClick={()=>setId('10000000-0000-4000-8000-000000000002')}>Byt testprojekt</button><SocialContentPanel projectId={id} projectName={id.endsWith('1')?'Familje-Stunden':'Handlarbörsen'}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
