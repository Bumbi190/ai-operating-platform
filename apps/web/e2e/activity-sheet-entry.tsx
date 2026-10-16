import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {PlatformWorkspace} from '../components/platform/os/PlatformWorkspace'
import {MobileRailToggle} from '../components/platform/os/MobileRailToggle'
import {ActivityRail} from '../components/platform/os/ActivityRail'
import '../app/globals.css'
const events=Array.from({length:18},(_,i)=>({id:String(i),type:'agent' as const,title:i===0?'Webbpreviewn är klar':'Sparad aktivitet '+i,detail:'En händelse i projektet',project:'Testprojekt',projectSlug:'test-project',timestamp:'2026-10-16T04:00:00Z'}))
function Fixture(){const [count,setCount]=useState(0);return <PlatformWorkspace uiGeneration="vnext"><div data-shell-topbar><header style={{height:66}}>Omnira</header></div><aside id="omnira-sidebar">Projektmeny</aside><main style={{minHeight:0,overflow:'auto'}}><h1>Bygg med Atlas</h1><button onClick={()=>setCount(count+1)}>Bakgrundskontroll {count}</button><div style={{height:1600}}>Arbetsyta</div></main><MobileRailToggle uiGeneration="vnext" liveCount={4}><ActivityRail events={events}/></MobileRailToggle></PlatformWorkspace>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
