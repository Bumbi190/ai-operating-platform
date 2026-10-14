'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildFetch } from '@/lib/website-build/use-build-session'
import type { BuildSessionView, CreateBuildInput } from '@/lib/website-build/types'
import styles from './BuildWorkspace.module.css'
export function BuildStart({ projectId, projectSlug, agents }: { projectId: string; projectSlug: string; agents: { id: string; name: string }[] }) {
  const [brief, setBrief] = useState(''), [agentId, setAgentId] = useState(agents[0]?.id ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const conversation = useRef<string | null>(null), pending = useRef<CreateBuildInput | null>(null), router = useRouter()
  const start = async () => {
    if (busy || !brief.trim() || !agentId) return
    setBusy(true); setError('')
    try {
      if (!conversation.current) conversation.current = (await buildFetch<{ id: string }>('/api/conversations', { project_id: projectId, title: 'Webbbygge med Atlas' })).id
      pending.current ??= { projectId, agentId, brief, conversationId: conversation.current, idempotencyKey: crypto.randomUUID() }
      const session = await buildFetch<BuildSessionView>('/api/website-builds', pending.current)
      router.push(`/projects/${encodeURIComponent(projectSlug)}/build/${session.sessionId}`)
    } catch (error) { setError((error as Error).message); setBusy(false) }
  }
  return <div className={styles.workspace}><div className={styles.header}><a href={`/projects/${encodeURIComponent(projectSlug)}`}>← Projektet</a><h1>Från idé till hemsida</h1></div><form className={styles.conversation} onSubmit={event => { event.preventDefault(); void start() }}>
    <p>Beskriv syfte, målgrupp, sidor och känsla. Atlas bygger ett statiskt webbpaket och visar preview medan du ger feedback.</p>
    <label htmlFor="build-agent">Projektets byggagent</label><select id="build-agent" value={agentId} disabled={busy || !!pending.current} onChange={event => setAgentId(event.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
    {!agents.length && <p role="alert">Projektet behöver en textagent innan ett bygge kan starta.</p>}
    <label htmlFor="build-brief">Din idé</label><textarea className={styles.message} id="build-brief" rows={8} maxLength={8000} value={brief} disabled={busy || !!pending.current} onChange={event => setBrief(event.target.value)} />
    <button disabled={busy || !agentId || !brief.trim()}>{busy ? 'Köar bygget…' : pending.current ? 'Hämta byggkvittot igen' : 'Starta bygget'}</button>
    {error && <p role="alert">{error}</p>}
    <small>Bygget använder projektets agent och befintliga kostnads- och stoppkontroller. Publicering, backend och betalningar ingår i separata steg.</small>
  </form></div>
}
