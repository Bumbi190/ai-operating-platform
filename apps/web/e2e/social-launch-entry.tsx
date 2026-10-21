import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SocialLaunchPanel} from '../components/social-launch/SocialLaunchPanel'
import {socialFixture} from './social-launch-fixture'
import {connectionFixture} from './social-connections-fixture'
const mode=new URLSearchParams(location.search).get('connections')
const fixture=(id?:string)=>mode?connectionFixture(mode,id):socialFixture(id)
function Fixture(){const [model,setModel]=useState(fixture());return <><button onClick={()=>setModel(fixture('10000000-0000-4000-8000-000000000002'))}>Byt testprojekt</button><SocialLaunchPanel initial={model}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
