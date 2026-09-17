import Link from 'next/link'
import type { ReactNode } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import {
  ArrowRight,
  Bot,
  GitBranch,
} from 'lucide-react'
import { RunStatusBadge } from '@/components/platform/RunStatusBadge'
import { WorkflowStepGraph } from '@/components/platform/WorkflowStepGraph'
import { LogStream } from '@/components/platform/LogStream'
import { ResumeRunButton } from '@/components/platform/ResumeRunButton'
import type { RunLog, RunStatus } from '@/lib/supabase/types'
import type {
  CollectionModel,
  ProjectIdentity,
  RunDetailModel,
  WorkspaceAgent,
  WorkspaceOutputsModel,
  WorkspaceRun,
  WorkspaceWorkflow,
  WorkflowDetailModel,
  WorkflowDetailStep,
} from '@/lib/os/project-workspace'
import { OutputRunCard } from './OutputRunCard'
import styles from './ProjectWorkspace.module.css'

interface HeaderProps {
  project: ProjectIdentity
  section: string
  title: string
  description: string
  count?: number | null
  actions?: { label: string; href: string; tone?: 'primary' | 'quiet' }[]
}

function WorkspaceHeader({ project, section, title, description, count, actions = [] }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <p className={styles.context}>
          {project.href ? <Link href={project.href}>{project.name}</Link> : project.name}
          <span aria-hidden="true">/</span>
          <span>{section}</span>
        </p>
        <div className={styles.titleRow}>
          <span className={styles.projectMark} style={{ backgroundColor: project.color }} aria-hidden="true" />
          <h1>{title}</h1>
          {typeof count === 'number' ? <span className={styles.count}>{count}</span> : null}
        </div>
        <p className={styles.lede}>{description}</p>
      </div>
      {actions.length > 0 ? (
        <nav className={styles.headerActions} aria-label={`${title} åtgärder`}>
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={styles.headerAction}
              data-tone={action.tone ?? 'quiet'}
            >
              {action.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      {children}
    </main>
  )
}

function StateNote({ tone = 'empty', children }: { tone?: 'empty' | 'error' | 'warning'; children: ReactNode }) {
  return <p className={styles.stateNote} data-tone={tone} role="note">{children}</p>
}

export function WorkspaceReadError({ project, section }: { project: HeaderProps['project']; section: string }) {
  return (
    <Page>
      <WorkspaceHeader
        project={project}
        section={section}
        title={section}
        description="Den här projektbundna läsningen kunde inte slutföras. Ingen tom vy har antagits."
      />
      <StateNote tone="error">{section} kunde inte läsas just nu.</StateNote>
    </Page>
  )
}

export function ProjectAgents({ model }: { model: CollectionModel<WorkspaceAgent> }) {
  if (model.state === 'error') return <WorkspaceReadError project={model.project} section="Agenter" />
  return (
    <Page>
      <WorkspaceHeader
        project={model.project}
        section="Agenter"
        title="Agenter"
        description="Projektets deklarerade agentroller. Modell och konfigurationsnärvaro kommer från agentraden; inga verktyg, behörigheter eller arbetsbelastningar antas."
        count={model.count ?? model.items.length}
      />
      {model.items.length === 0 ? (
        <StateNote>Projektet har inga agenter.</StateNote>
      ) : (
        <ul className={styles.agentGrid}>
          {model.items.map((agent) => (
            <li key={agent.id}>
              {agent.href ? (
                <Link href={agent.href} className={styles.agentCard}>
                  <span className={styles.agentMark} aria-hidden="true"><Bot size={17} /></span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardTitle}>{agent.name}</span>
                    {agent.description ? <span className={styles.cardDescription}>{agent.description}</span> : null}
                    <span className={styles.cardMeta}>
                      <span>{agent.model ?? 'okänd modell'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{agent.hasSystemPrompt ? 'Systemprompt konfigurerad' : 'Systemprompt saknas'}</span>
                    </span>
                  </span>
                  <ArrowRight size={15} className={styles.cardArrow} aria-hidden="true" />
                </Link>
              ) : (
                <div className={styles.agentCard}><span className={styles.cardTitle}>{agent.name}</span></div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

export function ProjectWorkflows({ model }: { model: CollectionModel<WorkspaceWorkflow> }) {
  if (model.state === 'error') return <WorkspaceReadError project={model.project} section="Workflows" />
  return (
    <Page>
      <WorkspaceHeader
        project={model.project}
        section="Workflows"
        title="Workflows"
        description="Lagrade workflowdefinitioner och deras deklarerade steg. Aktiv betyder konfigurerad som aktiv — inte att workflowet kör just nu."
        count={model.count ?? model.items.length}
      />
      {model.items.length === 0 ? (
        <StateNote>Projektet har inga workflows.</StateNote>
      ) : (
        <ul className={styles.stackList}>
          {model.items.map((workflow) => (
            <li key={workflow.id} className={styles.listRow}>
              <span className={styles.rowIcon} aria-hidden="true"><GitBranch size={16} /></span>
              <span className={styles.rowBody}>
                {workflow.href
                  ? <Link href={workflow.href} className={styles.rowTitle}>{workflow.name}</Link>
                  : <span className={styles.rowTitle}>{workflow.name}</span>}
                {workflow.description ? <span className={styles.rowDescription}>{workflow.description}</span> : null}
                <span className={styles.rowMeta}>
                  <span>{workflow.stepCount === null ? 'Steg kunde inte tolkas' : `${workflow.stepCount} steg`}</span>
                  <span aria-hidden="true">·</span>
                  <span>{workflow.trigger ?? 'okänd trigger'}</span>
                  {workflow.cronExpr ? <code>{workflow.cronExpr}</code> : null}
                </span>
              </span>
              {workflow.active !== null ? (
                <span className={styles.chip} data-tone={workflow.active ? 'active' : 'muted'}>
                  {workflow.active ? 'Aktiv konfiguration' : 'Inaktiv konfiguration'}
                </span>
              ) : <span className={styles.chip} data-tone="unknown">Status okänd</span>}
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

export function WorkflowDetail({ model }: { model: WorkflowDetailModel }) {
  const { project, workflow } = model
  const actions = [
    workflow.editHref ? { label: 'Redigera workflow', href: workflow.editHref, tone: 'quiet' as const } : null,
    workflow.runHref ? { label: 'Kör workflow', href: workflow.runHref, tone: 'primary' as const } : null,
  ].filter((item): item is { label: string; href: string; tone: 'primary' | 'quiet' } => item !== null)

  return (
    <Page>
      <WorkspaceHeader
        project={project}
        section="Workflow"
        title={workflow.name}
        description={workflow.description ?? 'Ingen beskrivning är lagrad för detta workflow.'}
        actions={actions}
      />

      <dl className={styles.factGrid}>
        <Fact label="Trigger" value={workflow.trigger ?? 'Okänd'} />
        <Fact label="Konfiguration" value={workflow.active === null ? 'Okänd' : workflow.active ? 'Aktiv' : 'Inaktiv'} />
        <Fact label="Cron" value={workflow.cronExpr ?? 'Ingen'} mono />
        <Fact label="Skapad" value={workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString('sv-SE') : 'Okänt'} />
      </dl>

      <section className={styles.panel} aria-labelledby="workflow-steps-title">
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>Deklarerad sekvens</p>
            <h2 id="workflow-steps-title">Steg</h2>
          </div>
          {workflow.steps ? <span className={styles.count}>{workflow.steps.length}</span> : null}
        </div>
        {workflow.steps === null ? (
          <StateNote tone="error">Workflowets steg kunde inte tolkas.</StateNote>
        ) : workflow.steps.length === 0 ? (
          <StateNote>Workflowet deklarerar inga steg.</StateNote>
        ) : (
          <ol className={styles.stepList}>
            {workflow.steps.map((step) => <WorkflowStep key={step.position} step={step} />)}
          </ol>
        )}
        {model.agentsState === 'error' ? (
          <StateNote tone="warning">Agentidentiteter kunde inte läsas; stegens agentkopplingar visas därför som okända.</StateNote>
        ) : null}
      </section>
    </Page>
  )
}

function WorkflowStep({ step }: { step: WorkflowDetailStep }) {
  const agent = step.agent
  return (
    <li className={styles.step}>
      <span className={styles.stepIndex}>{step.position}</span>
      <span className={styles.stepBody}>
        <span className={styles.stepName}>{step.name ?? 'Namnlöst steg'}</span>
        <span className={styles.stepMeta}>
          {agent.kind === 'resolved' && agent.href ? <Link href={agent.href}>{agent.name}</Link> : null}
          {agent.kind === 'resolved' && !agent.href ? agent.name : null}
          {agent.kind === 'missing' ? 'Agenten finns inte i projektet' : null}
          {agent.kind === 'unassigned' ? 'Ingen agent tilldelad' : null}
          {agent.kind === 'unknown' ? 'Agentkoppling okänd' : null}
        </span>
      </span>
      {step.outputKey ? <code className={styles.outputKey}>{step.outputKey}</code> : null}
    </li>
  )
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd data-mono={mono || undefined}>{value}</dd>
    </div>
  )
}

export function ProjectRuns({ model }: { model: CollectionModel<WorkspaceRun> }) {
  if (model.state === 'error') return <WorkspaceReadError project={model.project} section="Körningar" />
  return (
    <Page>
      <WorkspaceHeader
        project={model.project}
        section="Körningar"
        title="Körningar"
        description="De senaste 50 projektbundna körningarna. Status och tider återges från lagrade run-rader."
        count={model.count ?? model.items.length}
      />
      {model.items.length === 0 ? (
        <StateNote>Projektet har inga körningar.</StateNote>
      ) : (
        <div className={styles.tableScroll} tabIndex={0} aria-label="Körningar, horisontellt skrollbar tabell">
          <table className={styles.runTable}>
            <thead>
              <tr><th>Workflow</th><th>Status</th><th>Startad</th><th>Varaktighet</th><th><span className={styles.srOnly}>Öppna</span></th></tr>
            </thead>
            <tbody>
              {model.items.map((run) => {
                const duration = run.startedAt && run.finishedAt
                  ? Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000))
                  : null
                return (
                  <tr key={run.id}>
                    <td>{run.workflowName ?? 'Körning utan workflow'}</td>
                    <td>{run.status
                      ? <RunStatusBadge status={run.status as RunStatus} />
                      : <span className={styles.chip} data-tone="unknown">Status okänd</span>}</td>
                    <td><time dateTime={run.createdAt}>{formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: sv })}</time></td>
                    <td>{duration === null ? '—' : `${duration}s`}</td>
                    <td>{run.href ? <Link href={run.href} className={styles.inlineLink}>Visa logg</Link> : null}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}

export function RunDetail({ model }: { model: RunDetailModel }) {
  const { project, run, logs, logsState } = model
  const duration = run.startedAt && run.finishedAt
    ? Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000))
    : null
  const totalTokens = logs.reduce((sum, log) => sum + (log.tokens_in ?? 0) + (log.tokens_out ?? 0), 0)
  const stepCount = new Set(logs.filter((log) => log.step_order !== null).map((log) => log.step_order)).size
  const actions = run.runAgainHref ? [{ label: 'Kör igen', href: run.runAgainHref, tone: 'quiet' as const }] : []

  return (
    <Page>
      <WorkspaceHeader
        project={project}
        section="Körning"
        title={run.workflowName ?? 'Körning utan workflow'}
        description={`Run ${run.id.slice(0, 8)}… · skapad ${formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: sv })}`}
        actions={actions}
      />

      <div className={styles.statusLine}>
        <RunStatusBadge status={run.status as RunStatus} />
      </div>

      <dl className={styles.factGrid}>
        <Fact label="Varaktighet" value={duration === null ? '—' : `${duration}s`} />
        <Fact label="Tokens" value={totalTokens > 0 ? totalTokens.toLocaleString('sv-SE') : '—'} />
        <Fact label="Steg" value={stepCount > 0 ? String(stepCount) : '—'} />
        <Fact label="Startad" value={run.startedAt ? format(new Date(run.startedAt), 'HH:mm:ss', { locale: sv }) : '—'} mono />
      </dl>

      {logsState === 'ready' ? (
        <WorkflowStepGraph
          logs={logs.map((log) => ({
            step_order: log.step_order,
            step_name: log.step_name,
            role: log.role,
            tokens_in: log.tokens_in,
            tokens_out: log.tokens_out,
            duration_ms: log.duration_ms,
          }))}
          runStatus={run.status}
        />
      ) : <StateNote tone="error">Den sparade körningsloggen kunde inte läsas. Run-statusen ovan kommer fortfarande från den verifierade run-raden.</StateNote>}

      <div className={styles.runLayout}>
        <section className={styles.runLog} aria-labelledby="run-log-title">
          <p className={styles.eyebrow} id="run-log-title">Körningslogg</p>
          {logsState === 'ready' || ['pending', 'running', 'awaiting_approval'].includes(run.status) ? (
            <LogStream
              runId={run.id}
              initialLogs={logs as unknown as RunLog[]}
              initialStatus={run.status}
            />
          ) : <StateNote tone="error">Körningsloggen är inte tillgänglig.</StateNote>}
        </section>

        <aside className={styles.runAside} aria-label="Körningens input och resultat">
          {run.error ? (
            <section className={styles.errorPanel}>
              <p className={styles.eyebrow}>Fel</p>
              <p>{run.error}</p>
              {run.status === 'failed' ? <ResumeRunButton runId={run.id} /> : null}
            </section>
          ) : null}
          <ObjectPanel title="Input" value={run.input} />
          <ObjectPanel title="Resultat från run context" value={run.context} />
        </aside>
      </div>
    </Page>
  )
}

function ObjectPanel({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const entries = value ? Object.entries(value) : []
  if (entries.length === 0) return null
  return (
    <section className={styles.objectPanel}>
      <p className={styles.eyebrow}>{title}</p>
      <dl>
        {entries.map(([key, raw]) => {
          const normalized = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw)
          return (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{normalized.length > 500 ? `${normalized.slice(0, 500)}…` : normalized}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

export function ProjectOutputs({ model }: { model: WorkspaceOutputsModel }) {
  const filterHref = model.project.href
    ? `${model.project.href}/outputs${model.filter === 'today' ? '' : '?all=today'}`
    : null
  if (model.state === 'error') return <WorkspaceReadError project={model.project} section="Körningsresultat" />
  return (
    <Page>
      <WorkspaceHeader
        project={model.project}
        section="Utdata"
        title="Körningsresultat"
        description={model.filter === 'today'
          ? `Färdiga körningars lagrade run context för ${model.todayLabel}. Detta är inte en läsning av outputs-tabellen.`
          : 'Färdiga körningars lagrade run context, högst 50 körningar. Detta är inte en läsning av outputs-tabellen.'}
        count={model.count ?? model.items.length}
        actions={filterHref ? [{
          label: model.filter === 'today' ? 'Visa alla' : 'Visa bara idag',
          href: filterHref,
          tone: 'quiet',
        }] : []}
      />
      {model.items.length === 0 ? (
        <StateNote>{model.filter === 'today' ? 'Inga färdiga körningar idag.' : 'Inga färdiga körningsresultat.'}</StateNote>
      ) : (
        <ul className={styles.outputGrid}>
          {model.items.map((run) => (
            <li key={run.id}><OutputRunCard run={run} /></li>
          ))}
        </ul>
      )}
    </Page>
  )
}

export function WorkspaceLoading({ project, section }: { project: HeaderProps['project']; section: string }) {
  return (
    <Page>
      <WorkspaceHeader project={project} section={section} title={section} description="Läser projektbundna data…" />
      <p className={styles.loading} role="status">Läser {section.toLowerCase()}…</p>
    </Page>
  )
}
