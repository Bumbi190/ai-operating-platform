import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
import {SocialContentPanel} from '../components/social-launch/SocialContentPanel'
function Fixture(){const [id,setId]=useState('10000000-0000-4000-8000-000000000001');return <><button onClick={()=>setId('10000000-0000-4000-8000-000000000002')}>Byt testprojekt</button><SocialContentPanel key={id} projectId={id} projectName={id.endsWith('1')?'Familje-Stunden':'Handlarbörsen'}/></>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('workspace')?<SocialLaunchPanel initial={socialFixture()}/>:<Fixture/>)
