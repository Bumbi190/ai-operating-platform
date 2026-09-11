import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { ProjectPauseToggle } from '@/components/platform/ProjectPauseToggle'
import { statusConfig, UNKNOWN_STATUS } from '@/components/platform/RunStatusBadge'
import type { RunStatus } from '@/lib/supabase/types'
import type {
  CommandCenterAgent,
  CommandCenterApproval,
  CommandCenterInstance,
  CommandCenterOutput,
  CommandCenterRun,
  CommandCenterStep,
  CommandCenterStepAgent,
  CommandCenterWorkflow,
  ProjectCommandCenterModel,
} from '@/lib/os/project-command-center'
import {
  PENDING_APPROVAL_LABEL,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  WAKE_LABELS,
  WORKFLOW_ACTIVE_LABELS,
} from '@/lib/os/project-command-center-shared'
import styles from './ProjectCommandCenter.module.css'

/**
 * Project Command Center — `/projects/[slug]` in vNext.
 *
 * An operational workspace, not a dashboard: the project's workflows lead, with
 * every declared step drawn from `workflows.steps[]`; its long-lived workflow
 * instances follow; review, runs, agents and stored outputs sit beside them.
 *
 * READ ONLY. The one control on this surface is the project stop, and it is the
 * existing `ProjectPauseToggle` — the same component, server action and
 * ownership gate the legacy page uses. No other write exists here.
 *
 * TRUTHFUL STATES. Each section distinguishes four answers: rows, none, not
 * readable, and — for single values — not known. "Unknown" is never rendered as
 * idle or as zero, and a failed read is never rendered as an empty list.
 */

export function ProjectCommandCenter({ model }: { model: ProjectCommandCenterModel }) {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />
      <Header model={model} />
      <div className={styles.workspace}>
        <div className={styles.primary}>
          <WorkflowsSection model={model} />
          <InstancesSection model={model} />
        </div>
        <div className={styles.secondary}>
          <ApprovalsSection model={model} />
          <RunsSection model={model} />
          <AgentsSection model={model} />
          <OutputsSection model={model} />
        </div>
      </div>
    </div>
  )
}

/**
 * Shown while the sections are read. It names the project the route has already
 * resolved and says what is being read — no placeholder figures, no skeleton
 * rows that could be mistaken for data.
 */
export function ProjectCommandCenterLoading({ name, color }: { name: string; color: string }) {
  return (
    <div className={styles.field} aria-busy="true">
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <p className={styles.kicker}>Projekt · Command Center</p>
          <div className={styles.identity}>
            <span className={styles.swatch} style={{ backgroundColor: color }} aria-hidden />
            <h1 className={styles.title}>{name}</h1>
          </div>
        </div>
      </header>
      <p className={styles.loading} role="status">
        Läser projektets workflows, körningar och granskningar…
      </p>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({ model }: { model: ProjectCommandCenterModel }) {
  const { project, activity, links, approvals } = model
  // The exact pending count the approvals read returned. It sits in the header so
  // review stays in view on a narrow screen, where the list itself stacks below
  // the workflows.
  const pendingApprovals = approvals.state === 'ok' ? approvals.total ?? approvals.items.length : null
  const actions: { label: string; href: string | null }[] = [
    { label: 'Alla körningar', href: links.runs },
    { label: 'Workflows', href: links.workflows },
    { label: 'Agenter', href: links.agents },
    { label: 'Utdata', href: links.outputs },
    { label: 'Ny agent', href: links.newAgent },
    { label: 'Nytt workflow', href: links.newWorkflow },
    { label: 'Media Pipeline', href: links.media },
  ]

  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.kicker}>Projekt · Command Center</p>
        <div className={styles.identity}>
          <span className={styles.swatch} style={{ backgroundColor: project.color }} aria-hidden />
          <h1 className={styles.title}>{project.name}</h1>
          <span className={styles.slug}>{project.slug}</span>
        </div>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            {/* The PROJECT scope only. The platform stop is a separate authority and
                is shown by the shell; this page never claims execution is allowed. */}
            <dt>Projektstopp</dt>
            <dd data-tone={project.executionPaused ? 'stopped' : 'neutral'}>
              {project.executionPaused ? 'Aktivt' : 'Inte aktivt'}
              {project.executionPaused && project.pausedAt ? (
                <> · <Rel iso={project.pausedAt} /></>
              ) : null}
              {project.executionPaused && project.pausedReason ? (
                <span className={styles.factDetail}>{project.pausedReason}</span>
              ) : null}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Aktiva körningar</dt>
            <dd data-tone={activity.activeRuns === null ? 'unknown' : activity.activeRuns > 0 ? 'live' : 'neutral'}>
              {activity.activeRuns === null ? UNKNOWN_LABEL : activity.activeRuns}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Väntande granskningar</dt>
            <dd data-tone={pendingApprovals === null ? 'unknown' : pendingApprovals > 0 ? 'waiting' : 'neutral'}>
              {pendingApprovals === null
                ? UNKNOWN_LABEL
                : pendingApprovals > 0
                  ? <a href="#pcc-approvals" className={styles.factLink}>{pendingApprovals}</a>
                  : pendingApprovals}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Senaste körning</dt>
            <dd data-tone={activity.lastRun.state === 'error' ? 'unknown' : 'neutral'}>
              {activity.lastRun.state === 'error'
                ? UNKNOWN_LABEL
                : activity.lastRun.at
                  ? <Rel iso={activity.lastRun.at} />
                  : 'Inga körningar ännu'}
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.headerSide}>
        <ProjectPauseToggle
          projectId={project.id}
          paused={project.executionPaused}
          pausedReason={project.pausedReason}
        />
      </div>

      <nav className={styles.actions} aria-label="Projektets vyer">
        {actions.filter((action) => action.href).map((action) => (
          <Link key={action.label} href={action.href!} className={styles.action}>
            {action.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

// ── Workflows ────────────────────────────────────────────────────────────────

function WorkflowsSection({ model }: { model: ProjectCommandCenterModel }) {
  const { workflows, links } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-workflows">
      <SectionHead id="pcc-workflows" title="Workflows" total={workflows.total} state={workflows.state} />
      {workflows.state === 'error' ? (
        <Note tone="error">Projektets workflows {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : workflows.items.length === 0 ? (
        <Note>Projektet har inga workflows.</Note>
      ) : (
        <ol className={styles.workflowList}>
          {workflows.items.map((workflow) => (
            <li key={workflow.id} className={styles.workflow}>
              <WorkflowTrack workflow={workflow} />
            </li>
          ))}
        </ol>
      )}
      {workflows.truncated ? (
        <More shown={workflows.items.length} total={workflows.total} href={links.workflows} label="Alla workflows" />
      ) : null}
    </section>
  )
}

function WorkflowTrack({ workflow }: { workflow: CommandCenterWorkflow }) {
  return (
    <>
      <div className={styles.workflowHead}>
        <Named href={workflow.href} className={styles.workflowName}>{workflow.name}</Named>
        <span className={styles.chip} data-tone="config">{workflow.trigger ?? 'okänd trigger'}</span>
        {workflow.cronExpr ? <code className={styles.cron}>{workflow.cronExpr}</code> : null}
        {workflow.active !== null ? (
          <span className={styles.chip} data-tone={workflow.active ? 'config' : 'muted'} title="Workflowets konfiguration (workflows.active) — inte om det kör just nu">
            {WORKFLOW_ACTIVE_LABELS[workflow.active ? 'true' : 'false']}
          </span>
        ) : null}
      </div>
      {workflow.description ? <p className={styles.description}>{workflow.description}</p> : null}
      <WorkflowRunState workflow={workflow} />
      <StepTrack steps={workflow.steps} />
    </>
  )
}

/** What the runtime says this workflow is doing: an active run, the latest run, never, or unknown. */
function WorkflowRunState({ workflow }: { workflow: CommandCenterWorkflow }) {
  const active = workflow.activeRuns
  if (active === null) {
    return <p className={styles.runState} data-tone="unknown">Körningsläge: {UNKNOWN_LABEL.toLowerCase()}</p>
  }
  if (active.length > 0) {
    const newest = active[0]
    return (
      <p className={styles.runState} data-tone="live">
        <StatusText status={newest.status} />
        {newest.createdAt ? <> · <Rel iso={newest.createdAt} /></> : null}
        {active.length > 1 ? <> · {active.length} pågående</> : null}
        {newest.href ? <> · <Link href={newest.href} className={styles.inlineLink}>Visa körning</Link></> : null}
      </p>
    )
  }
  if (workflow.latestRun === undefined) {
    return <p className={styles.runState} data-tone="unknown">Senaste körning: {UNKNOWN_LABEL.toLowerCase()}</p>
  }
  if (workflow.latestRun === null) {
    return <p className={styles.runState} data-tone="muted">Aldrig körd</p>
  }
  const latest = workflow.latestRun
  return (
    <p className={styles.runState} data-tone="neutral">
      Senast: <StatusText status={latest.status} />
      {latest.createdAt ? <> · <Rel iso={latest.createdAt} /></> : null}
      {latest.href ? <> · <Link href={latest.href} className={styles.inlineLink}>Visa körning</Link></> : null}
    </p>
  )
}

function StepTrack({ steps }: { steps: CommandCenterStep[] | null }) {
  if (steps === null) return <Note tone="error">Workflowets steg kunde inte tolkas.</Note>
  if (steps.length === 0) return <Note>Inga steg definierade i workflowet.</Note>
  return (
    <ol className={styles.steps} aria-label={`${steps.length} steg`}>
      {steps.map((step) => (
        <li key={`${step.position}-${step.name ?? ''}`} className={styles.step}>
          <span className={styles.stepIndex} aria-hidden>{step.position}</span>
          <div className={styles.stepBody}>
            <span className={styles.stepName}>{step.name ?? 'Namnlöst steg'}</span>
            <StepAgent agent={step.agent} />
            {step.outputKey ? <code className={styles.outputKey}>{step.outputKey}</code> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

function StepAgent({ agent }: { agent: CommandCenterStepAgent }) {
  switch (agent.kind) {
    case 'resolved':
      return agent.href
        ? <Link href={agent.href} className={styles.stepAgent} data-tone="resolved">{agent.name}</Link>
        : <span className={styles.stepAgent} data-tone="resolved">{agent.name}</span>
    case 'unassigned':
      return <span className={styles.stepAgent} data-tone="muted">Ingen agent tilldelad</span>
    case 'unresolved':
      return (
        <span className={styles.stepAgent} data-tone="warning" title={agent.id}>
          Agenten finns inte i projektet
        </span>
      )
    case 'unknown':
      return (
        <span className={styles.stepAgent} data-tone="unknown" title={agent.id}>
          Agent: {UNKNOWN_LABEL.toLowerCase()}
        </span>
      )
  }
}

// ── Workflow instances ───────────────────────────────────────────────────────

function InstancesSection({ model }: { model: ProjectCommandCenterModel }) {
  const { instances } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-instances">
      <SectionHead id="pcc-instances" title="Workflow-instanser" total={instances.state === 'ok' ? instances.items.length : null} state={instances.state} />
      {instances.state === 'error' ? (
        <Note tone="error">Workflow-instanserna {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : instances.items.length === 0 ? (
        <Note>Projektet har inga långlivade workflow-instanser.</Note>
      ) : (
        <ul className={styles.instanceList}>
          {instances.items.map((instance) => (
            <li key={instance.id} className={styles.instance}>
              <InstanceCard instance={instance} />
            </li>
          ))}
        </ul>
      )}
      {instances.truncated ? <p className={styles.more}>Visar de {instances.items.length} senaste instanserna.</p> : null}
    </section>
  )
}

function InstanceCard({ instance }: { instance: CommandCenterInstance }) {
  const definition = instance.definition
  return (
    <>
      <div className={styles.instanceHead}>
        <span className={styles.instanceKey}>{instance.instanceKey}</span>
        <span className={styles.defKey}>{instance.defKey} · v{instance.defVersion}</span>
        <span className={styles.chip} data-tone="config">{instance.status}</span>
      </div>
      <dl className={styles.instanceFacts}>
        <div>
          <dt>Läge</dt>
          <dd>{instance.currentState}</dd>
        </div>
        <div>
          <dt>Väckning</dt>
          <dd>
            {instance.wake === null ? (
              // Not schedulable: a leftover wake_at on a closed instance means nothing.
              'Ej aktuell'
            ) : (
              <>
                {WAKE_LABELS[instance.wake]}
                {instance.wakeAt ? <> · <time dateTime={instance.wakeAt}>{instance.wakeAt.slice(0, 16).replace('T', ' ')}</time></> : null}
              </>
            )}
          </dd>
        </div>
        {definition.kind === 'declared' ? (
          <div>
            <dt>Nästa vid framgång</dt>
            <dd>{definition.terminal ? 'Slutläge' : definition.nextState ?? '—'}</dd>
          </div>
        ) : null}
        {instance.lastTickOutcome ? (
          <div className={styles.instanceOutcome}>
            <dt>Senaste utvärdering</dt>
            <dd>
              {instance.lastTickOutcome}
              {instance.lastTickAt ? <> · <Rel iso={instance.lastTickAt} /></> : null}
            </dd>
          </div>
        ) : null}
      </dl>
      <DeclaredStates definition={definition} currentState={instance.currentState} />
    </>
  )
}

function DeclaredStates({ definition, currentState }: { definition: CommandCenterInstance['definition']; currentState: string }) {
  switch (definition.kind) {
    case 'not_vendored':
      return <Note>Definitionen för den här instansen finns inte i den här versionen av Omnira.</Note>
    case 'hash_mismatch':
      return <Note tone="warning">Den definition som finns här har en annan hash än instansen skapades från — dess tillstånd visas inte.</Note>
    case 'unreadable':
      return <Note tone="error">Definitionen {UNREADABLE_LABEL.toLowerCase()}.</Note>
    case 'declared':
      return (
        <>
          {definition.currentIndex === -1 ? (
            <Note tone="warning">Läget “{currentState}” finns inte bland definitionens tillstånd.</Note>
          ) : null}
          <ol className={styles.states} aria-label="Definitionens tillstånd">
            {definition.states.map((state, index) => (
              <li
                key={state.id}
                className={styles.state}
                aria-current={index === definition.currentIndex ? 'step' : undefined}
                title={state.description ?? undefined}
              >
                {state.id}
                {state.humanGate ? <span className={styles.gate}>mänsklig grind</span> : null}
              </li>
            ))}
          </ol>
        </>
      )
  }
}

// ── Approvals ────────────────────────────────────────────────────────────────

function ApprovalsSection({ model }: { model: ProjectCommandCenterModel }) {
  const { approvals, links } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-approvals">
      <SectionHead id="pcc-approvals" title="Granskningar" total={approvals.total} state={approvals.state} />
      {approvals.state === 'error' ? (
        <Note tone="error">Granskningar {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : approvals.items.length === 0 ? (
        <Note>Inga väntande granskningar i projektet.</Note>
      ) : (
        <ul className={styles.rows}>
          {approvals.items.map((approval) => <ApprovalRow key={approval.id} approval={approval} />)}
        </ul>
      )}
      {links.approvals && approvals.state === 'ok' && approvals.items.length > 0 ? (
        <p className={styles.more}>
          <Link href={links.approvals} className={styles.inlineLink}>Öppna granskningskön</Link>
        </p>
      ) : null}
    </section>
  )
}

function ApprovalRow({ approval }: { approval: CommandCenterApproval }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{approval.outputKey ?? 'Utan utdatanyckel'}</span>
        <span className={styles.rowMeta}>
          {approval.workflowName ?? 'Workflow okänt'}
          {approval.createdAt ? <> · <Rel iso={approval.createdAt} /></> : null}
        </span>
      </div>
      <span className={styles.chip} data-tone="waiting">{PENDING_APPROVAL_LABEL}</span>
    </li>
  )
}

// ── Runs ─────────────────────────────────────────────────────────────────────

function RunsSection({ model }: { model: ProjectCommandCenterModel }) {
  const { runs, links } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-runs">
      <SectionHead id="pcc-runs" title="Senaste körningar" total={null} state={runs.state} />
      {runs.state === 'error' ? (
        <Note tone="error">Körningar {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : runs.items.length === 0 ? (
        <Note>Projektet har inga körningar ännu.</Note>
      ) : (
        <ul className={styles.rows}>
          {runs.items.map((run) => <RunRow key={run.id} run={run} />)}
        </ul>
      )}
      {links.runs && runs.state === 'ok' && runs.items.length > 0 ? (
        <p className={styles.more}><Link href={links.runs} className={styles.inlineLink}>Alla körningar</Link></p>
      ) : null}
    </section>
  )
}

function RunRow({ run }: { run: CommandCenterRun }) {
  const title = run.workflowName ?? run.actionKind ?? 'Körning utan workflow'
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <Named href={run.href} className={styles.rowTitle}>{title}</Named>
        <span className={styles.rowMeta}>
          {run.createdAt ? <>skapad <Rel iso={run.createdAt} /></> : 'tidpunkt saknas'}
          {run.finishedAt ? <> · klar <Rel iso={run.finishedAt} /></> : run.startedAt ? <> · startad <Rel iso={run.startedAt} /></> : null}
        </span>
      </div>
      <StatusChip status={run.status} />
    </li>
  )
}

// ── Agents ───────────────────────────────────────────────────────────────────

function AgentsSection({ model }: { model: ProjectCommandCenterModel }) {
  const { agents, links } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-agents">
      <SectionHead id="pcc-agents" title="Agenter" total={agents.total} state={agents.state} />
      {agents.state === 'error' ? (
        <Note tone="error">Agenter {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : agents.items.length === 0 ? (
        <Note>Projektet har inga agenter.</Note>
      ) : (
        <ul className={styles.agentList}>
          {agents.items.map((agent) => <AgentItem key={agent.id} agent={agent} />)}
        </ul>
      )}
      {agents.truncated ? (
        <More shown={agents.items.length} total={agents.total} href={links.agents} label="Alla agenter" />
      ) : null}
    </section>
  )
}

function AgentItem({ agent }: { agent: CommandCenterAgent }) {
  return (
    <li className={styles.agent}>
      <Named href={agent.href} className={styles.agentName}>{agent.name}</Named>
      <span className={styles.agentModel}>{agent.model ?? 'okänd modell'}</span>
    </li>
  )
}

// ── Outputs ──────────────────────────────────────────────────────────────────

function OutputsSection({ model }: { model: ProjectCommandCenterModel }) {
  const { outputs, links } = model
  return (
    <section className={styles.panel} aria-labelledby="pcc-outputs">
      <SectionHead id="pcc-outputs" title="Utdata" total={outputs.total} state={outputs.state} />
      {outputs.state === 'error' ? (
        <Note tone="error">Utdata {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : outputs.items.length === 0 ? (
        <Note>Inga lagrade utdata i projektet.</Note>
      ) : (
        <ul className={styles.rows}>
          {outputs.items.map((output) => <OutputRow key={output.id} output={output} />)}
        </ul>
      )}
      {outputs.truncated ? (
        <More shown={outputs.items.length} total={outputs.total} href={links.outputs} label="Alla utdata" />
      ) : null}
    </section>
  )
}

function OutputRow({ output }: { output: CommandCenterOutput }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{output.name ?? 'Namnlös utdata'}</span>
        <span className={styles.rowMeta}>
          {output.createdAt ? <Rel iso={output.createdAt} /> : 'tidpunkt saknas'}
          {output.runHref ? <> · <Link href={output.runHref} className={styles.inlineLink}>Körning</Link></> : null}
          {output.fileUrl ? (
            <> · <a href={output.fileUrl} className={styles.inlineLink} target="_blank" rel="noopener noreferrer">Fil</a></>
          ) : null}
        </span>
      </div>
      {output.type ? <span className={styles.chip} data-tone="config">{output.type}</span> : null}
    </li>
  )
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function SectionHead({ id, title, total, state }: { id: string; title: string; total: number | null; state: 'ok' | 'error' }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      {state === 'ok' && total !== null ? <span className={styles.count}>{total}</span> : null}
    </div>
  )
}

function Note({ children, tone }: { children: ReactNode; tone?: 'error' | 'warning' }) {
  return (
    <p className={styles.note} role="note" data-tone={tone ?? 'empty'}>
      {children}
    </p>
  )
}

function More({ shown, total, href, label }: { shown: number; total: number | null; href: string | null; label: string }) {
  return (
    <p className={styles.more}>
      Visar {shown}{total !== null ? ` av ${total}` : ''}.
      {href ? <> <Link href={href} className={styles.inlineLink}>{label}</Link></> : null}
    </p>
  )
}

function Named({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <span className={className}>{children}</span>
}

/** A stored RunStatus in its existing label. Anything else says it is unknown — and what it was. */
function statusLabel(status: string | null): { label: string; known: boolean } {
  const config = status ? statusConfig[status as RunStatus] : undefined
  if (config) return { label: config.label, known: true }
  return { label: status ? `${UNKNOWN_STATUS.label} status (${status})` : `${UNKNOWN_STATUS.label} status`, known: false }
}

function StatusText({ status }: { status: string | null }) {
  const { label } = statusLabel(status)
  return <span className={styles.statusText}>{label}</span>
}

function StatusChip({ status }: { status: string | null }) {
  const { label, known } = statusLabel(status)
  return (
    <span className={styles.chip} data-tone={known ? `run-${status}` : 'unknown'}>
      {label}
    </span>
  )
}

function Rel({ iso }: { iso: string }) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return <span>{UNKNOWN_LABEL.toLowerCase()} tidpunkt</span>
  return (
    <time dateTime={iso} title={iso}>
      {formatDistanceToNow(at, { addSuffix: true, locale: sv })}
    </time>
  )
}

