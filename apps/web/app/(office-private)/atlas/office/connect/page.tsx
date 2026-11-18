import type { Metadata } from 'next'
import { loadOrganisationModel } from '@/lib/os/organisation'
import { OfficeConnectionPanel, type OfficeProjectChoice } from './OfficeConnectionPanel'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'Anslut Office · Omnira', referrer: 'no-referrer', robots: { index: false, follow: false },
}

/** Dedicated minimal route: no platform voice/runtime/analytics providers receive the pairing fragment. */
export default async function OfficeConnectPage() {
  let authenticated = false
  let sourceAvailable = false
  let projects: OfficeProjectChoice[] = []
  try {
    const model = await loadOrganisationModel()
    authenticated = model !== null
    sourceAvailable = !!model?.availability.projects && !!model?.availability.agents
    if (model && sourceAvailable) projects = model.projects.slice(0, 25).map(project => ({
      id: project.id, name: project.name,
      agents: project.agents.slice(0, 30).map(agent => ({ id: agent.id, name: agent.name })),
    }))
  } catch { /* A failed scoped read stays unavailable; never expose database errors. */ }
  return <OfficeConnectionPanel projects={projects} authenticated={authenticated} sourceAvailable={sourceAvailable} />
}
