'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import type { OrganisationModel } from '@/lib/os/organisation'
import styles from './OrganisationView.module.css'

/**
 * Organisation — Andre → Atlas → projects → agents.
 *
 * HIERARCHY, not relationships. Every node here answers "who belongs where and
 * who is working". Memory, skills, tools, dependencies and knowledge flow are
 * the Intelligence Graph's job and appear nowhere in this tree — that boundary
 * is what keeps the two surfaces from collapsing into one another.
 *
 * The four levels are structural, not decorative: agents render INSIDE their
 * project group, so an agent can never read as a peer of Atlas. Collapsing a
 * project removes its agents from the tree entirely rather than hiding them
 * with CSS, so the accessibility tree matches what is on screen.
 *
 * No keyboard owner is created. The tree is links and buttons — Tab reaches
 * them, Enter and Space activate them — which is what the browser already
 * provides. There is no arrow-key graph navigation to invent here.
 */
export function OrganisationView({ model }: { model: OrganisationModel }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = useCallback((projectId: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const { projects, availability } = model
  const totalAgents = projects.reduce((sum, project) => sum + project.agents.length, 0)

  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.header}>
        <p className={styles.kicker}>Organisation</p>
        <h1 className={styles.title}>Vem gör vad</h1>
        <p className={styles.summary}>
          {projects.length} projekt · {totalAgents}{' '}
          {totalAgents === 1 ? 'agent' : 'agenter'}
        </p>
        {!availability.projects || !availability.agents || !availability.activity ? (
          <p className={styles.degraded} role="status">
            {!availability.projects
              ? 'Projektlistan kunde inte läsas.'
              : !availability.agents
                ? 'Agentlistan kunde inte läsas.'
                : 'Aktivitet kunde inte läsas — agenter visas utan status.'}
          </p>
        ) : null}
      </header>

      {/* ── Level 1 · the operator ─────────────────────────────────────────── */}
      <div className={styles.operator}>
        <span className={styles.operatorAvatar} aria-hidden="true">
          {model.operatorName.slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.operatorName}>{model.operatorName}</span>
        <span className={styles.operatorRole}>Operatör</span>
      </div>

      <span className={styles.junction} aria-hidden="true" />

      {/* ── Level 2 · Atlas ────────────────────────────────────────────────── */}
      <div className={styles.atlas}>
        <span className={styles.atlasOrb} aria-hidden="true">
          <span className={styles.atlasHalo} />
          <span className={styles.atlasCore} />
          <span className={styles.atlasMark}><OmniraMark size={26} /></span>
        </span>
        <span className={styles.atlasLabel}>Atlas</span>
        <span className={styles.atlasRole}>Övervakande intelligens</span>
      </div>

      <span className={styles.junction} aria-hidden="true" />

      {/* ── Levels 3 and 4 · projects, then their agents ───────────────────── */}
      {projects.length === 0 ? (
        <p className={styles.empty}>
          {availability.projects
            ? 'Inga projekt är kopplade till ditt konto ännu.'
            : 'Kunde inte läsa organisationen just nu.'}
        </p>
      ) : (
        <ul className={styles.projects}>
          {projects.map((project) => {
            const isCollapsed = collapsed.has(project.id)
            const panelId = `org-agents-${project.id}`
            return (
              <li
                key={project.id}
                className={styles.projectGroup}
                style={{ '--node-accent': project.color } as React.CSSProperties}
              >
                <span className={styles.branch} aria-hidden="true" />

                <div className={styles.projectNode}>
                  {/* A project whose route the registry cannot build renders as
                      text — an operator is never offered a dead destination. */}
                  <ProjectFace project={project} />

                  {project.agents.length > 0 ? (
                    <button
                      type="button"
                      className={styles.toggle}
                      onClick={() => toggle(project.id)}
                      aria-expanded={!isCollapsed}
                      aria-controls={panelId}
                    >
                      <ChevronDown
                        className={styles.toggleIcon}
                        data-collapsed={isCollapsed || undefined}
                        aria-hidden="true"
                      />
                      <span className={styles.visuallyHidden}>
                        {isCollapsed ? `Visa agenter i ${project.name}` : `Dölj agenter i ${project.name}`}
                      </span>
                    </button>
                  ) : null}
                </div>

                {/* Collapsed removes the children from the tree, rather than
                    hiding them — nothing is announced that is not on screen. */}
                {!isCollapsed && project.agents.length > 0 ? (
                  <ul className={styles.agents} id={panelId}>
                    {project.agents.map((agent) => (
                      <li key={agent.id} className={styles.agentSlot}>
                        <span className={styles.agentBranch} aria-hidden="true" />
                        <AgentNode agent={agent} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The project's own face: a link when it has a route, text when it does not. */
function ProjectFace({ project }: { project: OrganisationModel['projects'][number] }) {
  const body = (
    <>
      <span className={styles.projectMark} aria-hidden="true">
        {project.name.slice(0, 2).toUpperCase()}
      </span>
      <span className={styles.projectText}>
        <span className={styles.projectName}>{project.name}</span>
        <span className={styles.projectMeta}>
          {project.agents.length}{' '}
          {project.agents.length === 1 ? 'agent' : 'agenter'}
          {project.runningRuns !== null && project.runningRuns > 0
            ? ` · ${project.runningRuns} kör`
            : ''}
        </span>
      </span>
    </>
  )
  if (!project.href) return <span className={styles.projectLink}>{body}</span>
  return <Link href={project.href} className={styles.projectLink}>{body}</Link>
}

/**
 * One agent.
 *
 * Rendered as a link when the agent route can be built and as plain text when
 * it cannot — an operator is never offered a destination that does not exist.
 */
function AgentNode({ agent }: { agent: OrganisationModel['projects'][number]['agents'][number] }) {
  const status = agent.working === null ? 'unknown' : agent.working ? 'working' : 'idle'
  const statusLabel =
    agent.working === null ? 'Status okänd' : agent.working ? 'Arbetar' : 'Inaktiv'

  const body = (
    <>
      <span className={styles.agentDot} data-status={status} aria-hidden="true" />
      <span className={styles.agentText}>
        <span className={styles.agentName}>{agent.name}</span>
        <span className={styles.agentMeta}>{agent.description ?? agent.model}</span>
      </span>
      {/* The status is text as well as a dot, so it never depends on colour or
          on animation alone. */}
      <span className={styles.agentStatus} data-status={status}>{statusLabel}</span>
    </>
  )

  if (!agent.href) {
    return <span className={styles.agentNode} data-status={status}>{body}</span>
  }
  return (
    <Link href={agent.href} className={styles.agentNode} data-status={status}>
      {body}
    </Link>
  )
}
