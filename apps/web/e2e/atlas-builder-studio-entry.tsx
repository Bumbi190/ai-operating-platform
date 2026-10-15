import {PlatformWorkspace} from '../components/platform/os/PlatformWorkspace'
import {Sidebar} from '../components/platform/Sidebar'
import {ShellTopBar} from '../components/platform/vnext/ShellTopBar'
import {Breadcrumbs} from '../components/platform/os/Breadcrumbs'
import {KeyboardHints} from '../components/platform/os/KeyboardHints'
import {AtlasMobileNav} from '../components/platform/vnext/AtlasMobileNav'
import {CommandPaletteHost} from '../components/platform/os/CommandPaletteHost'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {AtlasConversationProvider} from '../lib/atlas/conversation/provider'
import {AtlasRuntimeProvider} from '../lib/atlas/runtime'
import {AtlasBuilderStudio} from '../components/website-build/AtlasBuilderStudio'
import '../app/globals.css'
const root=createRoot(document.getElementById('root')!)
void fetch('/api/website-build/studio'+location.search).then(async r=>{if(!r.ok)throw Error('Fixture studio loader failed');return r.json()}).then(model=>root.render(<AtlasConversationProvider><AtlasRuntimeProvider>
 <PlatformWorkspace uiGeneration="vnext">
  <div data-shell-topbar><ShellTopBar pendingApprovals={null}/></div>
  <Sidebar projects={model.projects.map((p:any)=>({...p,color:'#22d3ee'}))} uiGeneration="vnext"/>
  <main className="os-stage" data-ui-generation="vnext">
   <AtlasMobileNav/><CommandPaletteHost projects={model.projects}/><Breadcrumbs uiGeneration="vnext" projects={model.projects}/>
   <div data-shell-page><AtlasBuilderStudio model={model}/></div><KeyboardHints uiGeneration="vnext"/>
  </main>
 </PlatformWorkspace>
</AtlasRuntimeProvider></AtlasConversationProvider>)).catch(error=>root.render(<p role="alert">{error.message}</p>))

