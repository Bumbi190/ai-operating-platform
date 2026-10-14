import React from 'react'
import { createRoot } from 'react-dom/client'
import { BuildWorkspace } from '../components/website-build/BuildWorkspace'
async function open() {
  const id = new URL(location.href).searchParams.get('session')
  const initial = await (await fetch(id ? '/__fixture/session/' + id : '/__fixture/setup')).json()
  history.replaceState(null, '', '/?session=' + initial.session.sessionId)
  createRoot(document.getElementById('root')!).render(<BuildWorkspace key={initial.session.sessionId} initialSession={initial.session} projectSlug={initial.projectSlug} userId={initial.userId} brief={initial.brief} />)
}
void open()
