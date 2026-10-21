import React from 'react'
import {createRoot} from 'react-dom/client'
import {AtlasBuilderStudio} from '../components/website-build/AtlasBuilderStudio'
import {PlatformWorkspace} from '../components/platform/os/PlatformWorkspace'
import type {StudioView} from '../lib/website-build/studio/types'
import '../app/globals.css'
import {BuildPreviewPane} from '../components/website-build/BuildPreviewPane'
import {StudioLayout} from '../components/website-build/StudioLayout'
import studioStyles from '../components/website-build/AtlasBuilderStudio.module.css'
import {previewSession} from './atlas-preview-fixture'

function PreviewFixture(){
 return <section className={studioStyles.studio} aria-label="Bygg med Atlas">
  <header className={studioStyles.header}><h1>Testprojekt</h1></header>
  <StudioLayout chat={<label>Chattutkast<input aria-label="Chattutkast"/></label>}
   website={<BuildPreviewPane initialSession={previewSession} embedded onRenderedRevision={()=>{}} onSession={()=>{}}/>}
   desktop={null} files={null} tasks={null}/>
 </section>
}
const model:StudioView={state:'ok',operatorId:'ui-fixture',projects:[],selected:null,conversation:null,plan:null,session:null,include:'active',canCreateProject:true}
if(new URLSearchParams(location.search).has('costs')){
 const projects=['1','2'].map((suffix,i)=>({id:'10000000-0000-4000-8000-00000000000'+suffix,slug:'cost-project-'+suffix,name:'Kostnadsprojekt '+suffix,builderAgentId:'40000000-0000-4000-8000-000000000001',workspaceRequest:null,budget:{state:'configured' as const,monthlySek:100},lifecycle:{projectId:'10000000-0000-4000-8000-00000000000'+suffix,state:'active' as const,version:0,executionPaused:false,stopping:false}}))
 model.projects=projects;model.selected=projects[0];Object.assign(window,{__studioCostModel:model})
}
createRoot(document.getElementById('root')!).render(<PlatformWorkspace uiGeneration="vnext">
 <div data-shell-topbar><header style={{height:66,padding:'20px 66px',background:'#09121e'}}>Omnira OS</header></div>
 <aside id="omnira-sidebar" style={{padding:24,background:'#03101a'}}><strong>OMNIRA</strong><nav aria-label="Navigation i layouttest" style={{lineHeight:2.8,marginTop:24}}>Atlas<br/>Chat<br/>Bygg med Atlas<br/>Projekt</nav></aside>
 <main className="os-stage" data-ui-generation="vnext"><div data-shell-page>{new URLSearchParams(location.search).has('preview')?<PreviewFixture/>:<AtlasBuilderStudio model={model}/>}</div></main>
</PlatformWorkspace>)
