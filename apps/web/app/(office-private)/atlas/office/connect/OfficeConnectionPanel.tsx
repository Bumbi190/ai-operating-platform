'use client'

import { useEffect, useRef, useState } from 'react'
import {
  consumeOfficePairing, OfficeConnection, probeOfficeRelay,
  type OfficePairing, type OfficeState,
} from '@/lib/atlas/office/connection'
import type { OfficeVisitConnection } from '@/lib/atlas/office/visit-connection'

export interface OfficeProjectChoice {
  id: string
  name: string
  agents: { id: string; name: string }[]
}
interface Props { projects: OfficeProjectChoice[]; authenticated: boolean; sourceAvailable: boolean }
const SELECT_STYLE = 'mt-2 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-slate-100 disabled:opacity-50'
const BUTTON_STYLE = 'min-h-12 rounded-xl border border-cyan-700 px-5 py-3 font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300'

export function OfficeConnectionPanel({ projects, authenticated, sourceAvailable }: Props) {
  const pair = useRef<OfficePairing | null>(null)
  const consumed = useRef(false)
  const mounted = useRef(false)
  const connection = useRef<OfficeConnection | OfficeVisitConnection | null>(null)
  const starts = useRef(0)
  const probe = useRef<AbortController | null>(null)
  const running = useRef(false)
  const [hasPairing, setHasPairing] = useState(false)
  const [visitMode, setVisitMode] = useState(false)
  const [probing, setProbing] = useState(false)
  const [avatars, setAvatars] = useState<string[]>([])
  const [avatarId, setAvatarId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [state, setState] = useState<OfficeState>({ phase: 'stopped', message: 'Frånkopplad · arbetsstatus okänd' })
  const active = state.phase === 'connecting' || state.phase === 'fresh' || state.phase === 'detached'
  const project = projects.find(item => item.id === projectId)

  useEffect(() => {
    mounted.current = true
    if (!consumed.current) {
      consumed.current = true
      pair.current = consumeOfficePairing(window.location, window.history)
      setHasPairing(pair.current !== null)
      setVisitMode(pair.current?.protocol === 2)
    }
    const stop = () => {
      ++starts.current
      probe.current?.abort()
      probe.current = null
      if (mounted.current) setProbing(false)
      const current = connection.current
      if (current && 'detach' in current) current.detach()
      else if (current) void current.stop()
      else if (mounted.current) {
        running.current = false
        setState({ phase: 'stopped', message: 'Frånkopplad · arbetsstatus okänd' })
      }
    }
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', visibility)
      stop()
    }
  }, [])

  async function checkComputer() {
    if (!pair.current || probe.current || running.current) return
    const attempt = new AbortController()
    probe.current = attempt
    setProbing(true)
    try {
      const choices = pair.current.protocol === 2
        ? await (await import('@/lib/atlas/office/visit-connection')).probeOfficeVisit(pair.current, fetch, attempt.signal)
        : await probeOfficeRelay(pair.current, fetch, attempt.signal)
      if (mounted.current && probe.current === attempt && !attempt.signal.aborted) {
        setAvatars(choices)
        setState({ phase: 'stopped', message: 'Datorn är ansluten · välj figur och agent' })
      }
    } catch {
      if (mounted.current && probe.current === attempt && !attempt.signal.aborted) {
        setAvatars([])
        setState({ phase: 'unavailable', message: 'Datorn kunde inte anslutas. Öppna en ny Office-anslutning och försök igen.' })
      }
    } finally {
      if (probe.current === attempt) {
        probe.current = null
        if (mounted.current) setProbing(false)
      }
    }
  }

  async function start() {
    if (!pair.current || running.current || probe.current || !avatars.includes(avatarId)
        || !project?.agents.some(agent => agent.id === agentId)) return
    const attempt = ++starts.current
    running.current = true
    setState({ phase: 'connecting', message: 'Förbereder Office-anslutningen…' })
    try {
      const Controller = pair.current.protocol === 2
        ? (await import('@/lib/atlas/office/visit-connection')).OfficeVisitConnection : OfficeConnection
      if (!mounted.current || document.hidden || attempt !== starts.current) { running.current = false; return }
      const controller = new Controller(pair.current, {
        onState: next => {
          if (mounted.current && connection.current === controller) {
            running.current = next.phase === 'connecting' || next.phase === 'fresh' || next.phase === 'detached'
            setState(next)
          }
        },
      })
      connection.current = controller
      await controller.start({ avatarId, projectId, agentId })
    } catch {
      if (mounted.current && attempt === starts.current) {
        running.current = false
        setState({ phase: 'unavailable', message: 'Agenten kunde inte kopplas. Välj agent och försök igen.' })
      }
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-slate-100 sm:py-16">
      <a href="/atlas/office" className="inline-flex min-h-11 items-center text-cyan-300 underline underline-offset-4">← Tillbaka till Office</a>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-cyan-300">Omnira Office</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Koppla en agent till Pling</h1>
      <p className="mt-4 leading-relaxed text-slate-300">Välj vilken registrerad projektagent figuren ska representera. Arbetsstatus visas som okänd tills en faktisk körning kan verifieras.</p>

      {!authenticated ? (
        <p className="mt-6 rounded-xl border border-slate-700 p-4">Logga in i en ny flik och öppna sedan en ny Office-anslutning. <a href="/login" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">Logga in i Omnira</a></p>
      ) : !sourceAvailable ? (
        <p className="mt-6 rounded-xl border border-slate-700 p-4">Agentregistret kunde inte läsas. Försök med en ny anslutning om en stund.</p>
      ) : null}
      {!hasPairing ? <p className="mt-6 text-slate-300">Öppna sidan via Office-anslutningen på din dator.</p> : null}

      <section aria-label="Agentanslutning" className="mt-7 space-y-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 sm:p-7">
        <button type="button" onClick={() => { void checkComputer() }} disabled={!hasPairing || !authenticated || !sourceAvailable || active || probing} className={BUTTON_STYLE}>
          {probing ? 'Ansluter…' : 'Anslut till den här datorn'}
        </button>
        <div>
          <label htmlFor="office-avatar" className="font-medium">Figur i Office</label>
          <select id="office-avatar" value={avatarId} disabled={active || avatars.length === 0} className={SELECT_STYLE} onChange={event => setAvatarId(event.target.value)}>
            <option value="">Välj figur</option>
            {avatars.map(id => <option key={id} value={id}>{id === 'office-familje-pling' ? 'Pling · Familje-Stunden' : id}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="office-project" className="font-medium">Projekt</label>
          <select id="office-project" value={projectId} disabled={active || !sourceAvailable} className={SELECT_STYLE} onChange={event => { setProjectId(event.target.value); setAgentId('') }}>
            <option value="">Välj projekt</option>
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="office-agent" className="font-medium">Registrerad agent</label>
          <select id="office-agent" value={agentId} disabled={active || !projectId} className={SELECT_STYLE} onChange={event => setAgentId(event.target.value)}>
            <option value="">Välj agent</option>
            {project?.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={!authenticated || !sourceAvailable || active || probing || !avatars.includes(avatarId) || !projectId || !agentId} onClick={() => { void start() }} className={BUTTON_STYLE + ' bg-cyan-950'}>{visitMode ? 'Anslut för kontorsbesöket' : 'Koppla vald agent'}</button>
          <button type="button" disabled={!active} onClick={() => { void connection.current?.stop() }} className={BUTTON_STYLE}>Koppla från</button>
        </div>
        <p role="status" aria-live="polite" className="border-t border-slate-700 pt-5 text-sm text-cyan-100">{state.message}</p>
        <p className="text-sm leading-relaxed text-slate-400">{visitMode
          ? 'Endast vald agents identitet läses. Efter bekräftad anslutning kan sidan stängas. Anslutningen avslutas när Office stängs eller senast efter fyra timmar. Arbetsstatus är okänd; samtal och uppdrag aktiveras separat.'
          : 'Uppgifterna hålls aktuella medan sidan är öppen och synlig. Samtal och uppdrag aktiveras separat.'}</p>
      </section>
    </main>
  )
}
