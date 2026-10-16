import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
function Fixture(){const [model,setModel]=useState(socialFixture());return <><button onClick={()=>setModel(socialFixture('10000000-0000-4000-8000-000000000002'))}>Byt testprojekt</button><SocialLaunchPanel initial={model}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
