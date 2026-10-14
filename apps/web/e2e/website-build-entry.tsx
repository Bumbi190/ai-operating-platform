import React from 'react'
import { createRoot } from 'react-dom/client'
import { BuildWorkspace } from '../components/website-build/BuildWorkspace'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
const root = createRoot(document.getElementById('root')!)
async function open(fresh = false) {
  const id = fresh ? null : new URL(location.href).searchParams.get('session')
  const initial = await (await fetch(id ? '/__fixture/session/' + id : '/__fixture/setup')).json()
  history.replaceState(null, '', '/?session=' + initial.session.sessionId)
  window.dispatchEvent(new PopStateEvent('popstate'))
  root.render(<AtlasRuntimeProvider><BuildWorkspace key={initial.session.sessionId} initialSession={initial.session} projectSlug={initial.projectSlug} userId={initial.userId} brief={initial.brief} /></AtlasRuntimeProvider>)
}
Object.assign(window, { fixtureSwitchSession: () => open(true) })
void open()
