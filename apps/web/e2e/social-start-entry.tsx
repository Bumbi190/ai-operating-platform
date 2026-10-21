import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
function Fixture(){const [id,setId]=useState('10000000-0000-4000-8000-000000000001');return <><button onClick={()=>setId('10000000-0000-4000-8000-000000000002')}>Byt testprojekt</button><SocialLaunchPanel key={id} initial={socialFixture(id)}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
