import Link from 'next/link'
import type { OrganisationModel } from '@/lib/os/organisation'
import { OSPage, OSLayer, Panel } from '@/components/platform/os'

/**
 * `/organisation` for the legacy generation.
 *
 * Same scoped model, same destinations, same honesty about unknown status —
 * rendered as a nested list in legacy's own chrome rather than as the spatial
 * field. Only the presentation differs.
 */
export function OrganisationLegacy({ model }: { model: OrganisationModel }) {
  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <p className="eyebrow os-eyebrow-accent mb-3">Organisation</p>
        <h1 className="text-2xl font-bold tracking-tight">Vem gör vad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {model.operatorName} · Atlas · {model.projects.length} projekt
        </p>
      </OSLayer>

      <OSLayer layer="operational" className="space-y-4">
        {model.projects.length === 0 ? (
          <Panel className="p-5">
            <p className="text-sm text-muted-foreground">
              Inga projekt är kopplade till ditt konto ännu.
            </p>
          </Panel>
        ) : (
          model.projects.map((project) => (
            <Panel key={project.id} className="p-5">
              {project.href
                ? <Link href={project.href} className="text-sm font-semibold hover:underline">{project.name}</Link>
                : <span className="text-sm font-semibold">{project.name}</span>}
              <span className="text-xs text-muted-foreground ml-2">
                {project.agents.length} agenter
              </span>
              <ul className="mt-3 space-y-1.5">
                {project.agents.map((agent) => (
                  <li key={agent.id} className="text-xs flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {agent.working === null ? '—' : agent.working ? '●' : '○'}
                    </span>
                    {agent.href
                      ? <Link href={agent.href} className="hover:underline">{agent.name}</Link>
                      : <span>{agent.name}</span>}
                    <span className="text-muted-foreground">{agent.model}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))
        )}
      </OSLayer>
    </OSPage>
  )
}
