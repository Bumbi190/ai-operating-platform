import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
import {SocialContentPanel} from '../components/social-launch/SocialContentPanel'
import {FamilyMonthSourceReviewPanel} from '../components/social-launch/FamilyMonthSourceReviewPanel'
function Fixture(){const [id,setId]=useState(new URLSearchParams(location.search).has('family-november')?
 '77cda551-57c9-4dc0-b019-1bb6438777f7':'10000000-0000-4000-8000-000000000001');return <><button onClick={()=>setId('10000000-0000-4000-8000-000000000002')}>Byt testprojekt</button><SocialContentPanel key={id} projectId={id} projectName={id.endsWith('1')?'Familje-Stunden':'Handlarbörsen'}/></>}
const query=new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(
 query.has('family-source-review')?
  <FamilyMonthSourceReviewPanel
   projectId={query.has('foreign-source')?'10000000-0000-4000-8000-000000000002':
    '77cda551-57c9-4dc0-b019-1bb6438777f7'}
   month="2026-12"/>:
 query.has('workspace')?<SocialLaunchPanel initial={socialFixture()}/>:<Fixture/>
)
