import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
import {connectionFixture} from './social-connections-fixture'
const mode=new URLSearchParams(location.search).get('connections')
const familyAtlasMode=new URLSearchParams(location.search).has('atlas-family')
function familyAtlasFixture(){
 const id='77cda551-57c9-4dc0-b019-1bb6438777f7'
 const f=socialFixture(id)
 f.plan.project={id,name:'Familje-Stunden',slug:'familje-stunden'}
 f.plan.currentRevision={
  id:'e745041f-ad3a-493f-bd3b-025525d561b2',
  sequence:1,sha256:'a'.repeat(64),createdAt:'2026-10-17T19:17:59Z',
  choices:[
   {channel:'facebook',format:'text',cadence:'manual',purpose:'Familjeaktiviteter'},
   {channel:'instagram',format:'image',cadence:'manual',purpose:'Familjetips'},
  ],
 }
 f.plan.decision={
  id:'40000000-0000-4000-8000-000000000003',
  revisionId:f.plan.currentRevision.id,
  sha256:f.plan.currentRevision.sha256,
  decision:'approve',decidedAt:'2026-10-17T19:17:59Z',
 }
 return f
}
const fixture=(id?:string)=>mode?connectionFixture(mode,id):familyAtlasMode&&!id?familyAtlasFixture():socialFixture(id)
function Fixture(){const [model,setModel]=useState(fixture());return <><button onClick={()=>setModel(fixture('10000000-0000-4000-8000-000000000002'))}>Byt testprojekt</button><SocialLaunchPanel initial={model}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
