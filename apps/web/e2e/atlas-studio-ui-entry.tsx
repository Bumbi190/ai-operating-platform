import React from 'react'
import {createRoot} from 'react-dom/client'
import {AtlasBuilderStudio} from '../components/website-build/AtlasBuilderStudio'
import {PlatformWorkspace} from '../components/platform/os/PlatformWorkspace'
import type {StudioView} from '../lib/website-build/studio/types'
import '../app/globals.css'
const model:StudioView={state:'ok',operatorId:'ui-fixture',projects:[],selected:null,conversation:null,plan:null,session:null,include:'active',canCreateProject:true}
createRoot(document.getElementById('root')!).render(<PlatformWorkspace uiGeneration="vnext">
 <div data-shell-topbar><header style={{height:66,padding:'20px 66px',background:'#09121e'}}>Omnira OS</header></div>
 <aside id="omnira-sidebar" style={{padding:24,background:'#03101a'}}><strong>OMNIRA</strong><nav aria-label="Navigation i layouttest" style={{lineHeight:2.8,marginTop:24}}>Atlas<br/>Chat<br/>Bygg med Atlas<br/>Projekt</nav></aside>
 <main className="os-stage" data-ui-generation="vnext"><div data-shell-page><AtlasBuilderStudio model={model}/></div></main>
</PlatformWorkspace>)
