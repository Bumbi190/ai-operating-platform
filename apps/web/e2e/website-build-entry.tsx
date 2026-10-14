import {AtlasBuildSurface} from '../components/platform/vnext/AtlasBuildSurface'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BuildWorkspace } from '../components/website-build/BuildWorkspace'
import {AtlasConversationProvider} from '../lib/atlas/conversation/provider'
import '../app/globals.css'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
const root = createRoot(document.getElementById('root')!)
async function open(fresh = false) {
  const id = fresh ? null : new URL(location.href).searchParams.get('session')
  const initial = await (await fetch(id ? '/__fixture/session/' + id : '/__fixture/setup')).json()
  history.replaceState(null, '', '/?session=' + initial.session.sessionId)
  window.dispatchEvent(new PopStateEvent('popstate'))
  root.render(<AtlasConversationProvider><AtlasRuntimeProvider><BuildWorkspace key={initial.session.sessionId} initialSession={initial.session} projectSlug={initial.projectSlug} userId={initial.userId} brief={initial.brief} conversationModel={initial.conversationModel} plan={initial.plan} /></AtlasRuntimeProvider></AtlasConversationProvider>)
}
Object.assign(window, { fixtureSwitchSession: () => open(true) })

async function openConversation(fresh=false,existing?:string){
 const query=new URL(location.href).searchParams,id=existing??(fresh?null:query.get('conversation'))
 const preferred=!existing&&!fresh?query.get('viewSession'):null
 const initial=await (await fetch(id?'/__fixture/conversation/'+id+(preferred?'?viewSession='+preferred:''):'/__fixture/setup-conversation?builder='+query.get('builder')+'&historical='+query.get('historical')+'&multiple='+query.get('multiple'))).json()
 const viewed=initial.preferredSessionId??preferred
 history.replaceState(null,'','/?conversation='+initial.conversationModel.id+(viewed?'&viewSession='+viewed:''));window.dispatchEvent(new PopStateEvent('popstate'))
 root.render(<AtlasConversationProvider><AtlasRuntimeProvider><AtlasBuildSurface conversationModel={initial.conversationModel} plan={initial.plan} initialSession={initial.session} brief={initial.brief??undefined}/></AtlasRuntimeProvider></AtlasConversationProvider>)
}
Object.assign(window,{fixtureSwitchConversation:()=>openConversation(true),fixtureOpenConversation:(id:string)=>openConversation(false,id)})
const query=new URL(location.href).searchParams
void (query.has('fresh')||query.has('conversation')||query.has('historical')||query.has('multiple')?openConversation():open())
