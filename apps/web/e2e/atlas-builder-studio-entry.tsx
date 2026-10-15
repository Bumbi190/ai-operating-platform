import React from 'react'
import {createRoot} from 'react-dom/client'
import {AtlasConversationProvider} from '../lib/atlas/conversation/provider'
import {AtlasRuntimeProvider} from '../lib/atlas/runtime'
import {AtlasBuilderStudio} from '../components/website-build/AtlasBuilderStudio'
import '../app/globals.css'
const root=createRoot(document.getElementById('root')!)
void fetch('/api/website-build/studio'+location.search).then(async r=>{if(!r.ok)throw Error('Fixture studio loader failed');return r.json()}).then(model=>root.render(<AtlasConversationProvider><AtlasRuntimeProvider><AtlasBuilderStudio model={model}/></AtlasRuntimeProvider></AtlasConversationProvider>)).catch(error=>root.render(<p role="alert">{error.message}</p>))
