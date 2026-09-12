import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import { PauseToggle } from '@/components/platform/PauseToggle'
import { ProjectPauseToggle } from '@/components/platform/ProjectPauseToggle'
import type {
  SystemAutomation,
  SystemComponent,
  SystemDreamIssue,
  SystemHealthModel,
  SystemProject,
  SystemWarning,
} from '@/lib/os/system-health'
import {
  AUTOMATION_LIVENESS_NOTE,
  COMPONENT_STATE_LABELS,
  DREAM_SEVERITY_LABELS,
  MEMORY_OBSERVABILITY_NOTE,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
} from '@/lib/os/system-health-shared'
import styles from './SystemHealth.module.css'

/**
 * Systemhälsa — `/system` in vNext.
 *
 * An operational surface, not a dashboard. There is no health score: the page
 * this replaces printed `100 - failRate * 2` as "Optimal", which reported a
 * platform with no runs as perfectly well. Each component states what its source
 * says, an unreadable source says so, and what Omnira does not observe — whether
 * a cron actually fired, what the M4 event log holds — says that instead.
 *
 * THE CONTROLS ARE THE EXISTING ONES. The global execution stop is the existing
 * `PauseToggle` calling the existing `toggleAutomationPause` server action
 * (platform-operator authority, refusal rendered rather than hidden), and a
 * project's stop is the existing `ProjectPauseToggle`. Neither is reimplemented,
 * rescoped or renamed here, and both sit in one explicit safety area rather than
 * beside the monitoring.
 */
export function SystemHealth({ model }: { model: SystemHealthModel }) {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Driftsyta</p>
          <h1 className={styles.title}>Systemhälsa</h1>
          <p className={styles.lede}>
            Vad körningen, stoppen, automatiseringen, Dream och minnet faktiskt säger — och vad
            Omnira inte observerar härifrån.
          </p>
        </div>
        <p className={styles.stamp}>
          Läst <Rel iso={model.generatedAt} />
        </p>
      </header>

      <WarningsLane warnings={model.warnings} />

      <section className={styles.panel} aria-labelledby="sys-status">
        <SectionHead id="sys-status" title="Systemstatus" />
        <ul className={styles.components}>
          {model.components.map((component) => (
            <ComponentTile key={component.id} component={component} />
          ))}
        </ul>
      </section>

      <div className={styles.columns}>
        <div className={styles.column}>
          <ExecutionPanel model={model} />
          <ProjectsPanel model={model} />
        </div>
        <div className={styles.column}>
          <SafetyPanel model={model} />
          <AutomationPanel model={model} />
          <DreamPanel model={model} />
          <MemoryPanel model={model} />
        </div>
      </div>

      <details className={styles.diagnostics}>
        <summary className={styles.diagnosticsSummary}>Tekniska detaljer</summary>
        <dl className={styles.diagList}>
          <Diag label="Avläst" value={model.generatedAt} />
          <Diag label="Fönster för dygnssiffror" value="24 timmar" />
          <Diag label="Projekt" value={String(model.projects.rows.length)} />
          <Diag label="Arbetsflöden visade" value={`${model.automation.rows.length}${model.automation.truncated ? ' (fler finns)' : ''}`} />
          <Diag label="Dream-fynd visade" value={`${model.dream.rows.length}${model.dream.truncated ? ' (fler finns)' : ''}`} />
          <Diag label="Stoppläge läsbart" value={model.platform.readable ? 'ja' : 'nej'} />
        </dl>
      </details>
    </div>
  )
}

/** The skeleton. Distinct from empty and from unreadable: this one says it is reading. */
export function SystemHealthLoading() {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Driftsyta</p>
          <h1 className={styles.title}>Systemhälsa</h1>
        </div>
      </header>
      <p className={styles.note} role="status">Läser systemets tillstånd …</p>
    </div>
  )
}

// ── Warnings ─────────────────────────────────────────────────────────────────

const TONE_ORDER: Record<SystemWarning['tone'], number> = { stop: 0, unreadable: 1, attention: 2 }

function WarningsLane({ warnings }: { warnings: SystemWarning[] }) {
  if (warnings.length === 0) {
    return (
      <p className={styles.calm} role="status">
        Inga lagrade tillstånd kräver åtgärd just nu. Det är vad källorna säger — inte ett omdöme om hälsa.
      </p>
    )
  }
  const ordered = [...warnings].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
  return (
    <section className={styles.warnings} aria-labelledby="sys-warnings">
      <SectionHead id="sys-warnings" title="Kräver uppmärksamhet" count={ordered.length} />
      <ul className={styles.warningList}>
        {ordered.map((warning) => (
          <li key={warning.id} className={styles.warning} data-tone={warning.tone}>
            <div className={styles.warningMain}>
              <span className={styles.warningTitle}>{warning.title}</span>
              {warning.detail ? <span className={styles.warningDetail}>{warning.detail}</span> : null}
            </div>
            {warning.href ? (
              <Link href={warning.href} className={styles.inlineLink}>Öppna</Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Panels ───────────────────────────────────────────────────────────────────

function ComponentTile({ component }: { component: SystemComponent }) {
  return (
    <li className={styles.component} data-state={component.state}>
      <span className={styles.componentLabel}>{component.label}</span>
      <span className={styles.componentState}>{COMPONENT_STATE_LABELS[component.state]}</span>
      <span className={styles.componentDetail}>{component.detail}</span>
    </li>
  )
}

function ExecutionPanel({ model }: { model: SystemHealthModel }) {
  const { execution } = model
  return (
    <section className={styles.panel} aria-labelledby="sys-exec">
      <SectionHead id="sys-exec" title="Körning" />
      {execution.state === 'error' ? (
        <Note tone="error">Körningarna {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : (
        <dl className={styles.facts}>
          <Fact label="Pågår nu" value={execution.running} />
          <Fact label="Väntar på granskning" value={execution.awaitingApproval} />
          <Fact label="Misslyckade (24 h)" value={execution.failed24h} tone={(execution.failed24h ?? 0) > 0 ? 'attention' : undefined} />
          <Fact label="Startade (24 h)" value={execution.started24h} />
        </dl>
      )}
      <p className={styles.meta}>
        Senaste körning: {execution.lastRunAt ? <Rel iso={execution.lastRunAt} /> : <span className={styles.absent}>{UNKNOWN_LABEL.toLowerCase()}</span>}
      </p>
    </section>
  )
}

function SafetyPanel({ model }: { model: SystemHealthModel }) {
  const { platform, safety } = model
  return (
    <section className={styles.panel} data-safety="true" aria-labelledby="sys-safety">
      <SectionHead id="sys-safety" title="Säkerhet & stopp" />

      <div className={styles.stopRow}>
        <div className={styles.stopState} data-stopped={platform.stopped ? 'true' : 'false'}>
          <span className={styles.stopLabel}>Global exekvering</span>
          <span className={styles.stopValue}>
            {!platform.readable
              ? UNREADABLE_LABEL
              : platform.stopped ? 'Stoppad' : 'Inte stoppad'}
          </span>
          {platform.stopped && platform.pausedReason ? (
            <span className={styles.stopReason}>{platform.pausedReason}</span>
          ) : null}
          {platform.stopped && platform.pausedAt ? (
            <span className={styles.stopReason}>Sedan <Rel iso={platform.pausedAt} /></span>
          ) : null}
        </div>
        {/* The existing control, unchanged: platform-operator authority, the same
            server action, and a refusal rendered rather than a hidden button. */}
        <PauseToggle paused={platform.stopped} />
      </div>

      {!platform.readable ? (
        <Note tone="error">
          Stoppläget kunde inte läsas. Okänt betyder inte “inte stoppad” — kontrollen visar ändå
          plattformens svar när den används.
        </Note>
      ) : null}

      <p className={styles.meta}>Stoppet gäller både automatisk och manuellt begärd exekvering. Atlas, statusvyer och styrning förblir tillgängliga.</p>

      <ul className={styles.flags}>
        {safety.flags.map((flag) => (
          <li key={flag.id} className={styles.flag} data-on={flag.on ? 'true' : 'false'}>
            <span className={styles.flagName}>{flag.id}</span>
            <span className={styles.flagState}>{flag.on ? 'på' : 'av'}</span>
          </li>
        ))}
      </ul>
      {safety.findings.length > 0 ? (
        <Note tone="warning">Avstängda skydd: {safety.findings.join(', ')}</Note>
      ) : null}
    </section>
  )
}

function ProjectsPanel({ model }: { model: SystemHealthModel }) {
  const { projects } = model
  return (
    <section className={styles.panel} aria-labelledby="sys-projects">
      <SectionHead id="sys-projects" title="Projekt" count={projects.state === 'ok' ? projects.rows.length : null} />
      {projects.state === 'error' ? (
        <Note tone="error">Projekten {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : projects.rows.length === 0 ? (
        <Note>Inga projekt i den här operatörens omfång.</Note>
      ) : (
        <ul className={styles.rows}>
          {projects.rows.map((project) => <ProjectRow key={project.id} project={project} />)}
        </ul>
      )}
    </section>
  )
}

function ProjectRow({ project }: { project: SystemProject }) {
  return (
    <li className={styles.row} data-paused={project.paused ? 'true' : 'false'}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          <span className={styles.dot} style={{ background: project.color }} aria-hidden />
          {project.href ? (
            <Link href={project.href} className={styles.inlineLink}>{project.name}</Link>
          ) : project.name}
        </span>
        <span className={styles.rowMeta}>
          {project.paused
            ? <span className={styles.stopChip}>Stoppat{project.pausedReason ? ` — ${project.pausedReason}` : ''}</span>
            : <span>Kör · {project.runsRunning} pågår</span>}
          {project.runsFailed24h > 0 ? <> · {project.runsFailed24h} misslyckade (24 h)</> : null}
          {project.pendingApprovals > 0 ? <> · {project.pendingApprovals} granskning(ar)</> : null}
          {project.lastRunAt ? <> · senast <Rel iso={project.lastRunAt} /></> : null}
        </span>
      </div>
      {/* The existing project stop, ownership-gated by its own server action. */}
      <ProjectPauseToggle projectId={project.id} paused={project.paused} />
    </li>
  )
}

function AutomationPanel({ model }: { model: SystemHealthModel }) {
  const { automation } = model
  return (
    <section className={styles.panel} aria-labelledby="sys-automation">
      <SectionHead id="sys-automation" title="Automatisering" count={automation.state === 'ok' ? automation.rows.length : null} />
      {automation.state === 'error' ? (
        <Note tone="error">Arbetsflödena {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : automation.rows.length === 0 ? (
        <Note>Inga arbetsflöden konfigurerade.</Note>
      ) : (
        <ul className={styles.rows}>
          {automation.rows.map((flow) => <AutomationRow key={flow.id} flow={flow} />)}
        </ul>
      )}
      <p className={styles.meta}>{AUTOMATION_LIVENESS_NOTE}</p>
    </section>
  )
}

function AutomationRow({ flow }: { flow: SystemAutomation }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{flow.name}</span>
        <span className={styles.rowMeta}>
          {flow.projectSlug ? <>{flow.projectSlug} · </> : null}
          {flow.trigger ?? UNKNOWN_LABEL.toLowerCase()}
          {flow.cronExpr ? <> · <code className={styles.code}>{flow.cronExpr}</code></> : null}
        </span>
      </div>
      <span className={styles.chip} data-on={flow.active ? 'true' : 'false'}>
        {flow.active ? 'Aktiv' : 'Pausad'}
      </span>
    </li>
  )
}

function DreamPanel({ model }: { model: SystemHealthModel }) {
  const { dream } = model
  return (
    <section className={styles.panel} aria-labelledby="sys-dream">
      <SectionHead id="sys-dream" title="Dream" count={dream.state === 'ok' ? dream.rows.length : null} />
      {dream.state === 'error' ? (
        <Note tone="error">Dream-registret {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : dream.rows.length === 0 ? (
        <Note>Inga fynd i registret.</Note>
      ) : (
        <ul className={styles.rows}>
          {dream.rows.map((issue) => <DreamRow key={issue.id} issue={issue} />)}
        </ul>
      )}
      {dream.lastSeenAt ? (
        <p className={styles.meta}>Senast sett: <Rel iso={dream.lastSeenAt} /></p>
      ) : null}
    </section>
  )
}

function DreamRow({ issue }: { issue: SystemDreamIssue }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{issue.slug}</span>
        <span className={styles.rowMeta}>
          {issue.projectSlug ? <>{issue.projectSlug} · </> : null}
          sedd {issue.occurrences} gång(er)
          {issue.lastSeenAt ? <> · <Rel iso={issue.lastSeenAt} /></> : null}
          {issue.delegated ? <> · delegerad</> : null}
        </span>
      </div>
      <span className={styles.chip} data-severity={issue.severity}>
        {DREAM_SEVERITY_LABELS[issue.severity] ?? issue.severity}
      </span>
    </li>
  )
}

function MemoryPanel({ model }: { model: SystemHealthModel }) {
  const { memory } = model
  return (
    <section className={styles.panel} aria-labelledby="sys-memory">
      <SectionHead id="sys-memory" title="Minne" />
      {memory.state === 'error' ? (
        <Note tone="error">Minnesregistret {UNREADABLE_LABEL.toLowerCase()}.</Note>
      ) : (
        <dl className={styles.facts}>
          <Fact label="Rader i äldre register" value={memory.legacyRows} />
        </dl>
      )}
      <p className={styles.meta}>{MEMORY_OBSERVABILITY_NOTE}</p>
    </section>
  )
}

// ── Small parts ──────────────────────────────────────────────────────────────

function SectionHead({ id, title, count }: { id: string; title: string; count?: number | null }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      {count != null ? <span className={styles.count}>{count}</span> : null}
    </div>
  )
}

function Fact({ label, value, tone }: { label: string; value: number | null; tone?: 'attention' }) {
  return (
    <div className={styles.fact} data-tone={tone ?? 'plain'}>
      <dt>{label}</dt>
      <dd>{value == null ? <span className={styles.absent}>{UNKNOWN_LABEL.toLowerCase()}</span> : value}</dd>
    </div>
  )
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.diagItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Note({ children, tone }: { children: ReactNode; tone?: 'error' | 'warning' }) {
  return <p className={styles.note} role="note" data-tone={tone ?? 'empty'}>{children}</p>
}

function Rel({ iso }: { iso: string }) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return <span>{UNKNOWN_LABEL.toLowerCase()} tidpunkt</span>
  return <time dateTime={iso} title={iso}>{formatDistanceToNow(at, { addSuffix: true, locale: sv })}</time>
}
