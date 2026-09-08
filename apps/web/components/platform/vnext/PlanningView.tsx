import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type {
  PlanningModel,
  PlanningProject,
  PlanningRecurring,
  PlanningRelease,
  PlanningTask,
} from '@/lib/os/planning'
import styles from './PlanningView.module.css'

/**
 * Planning — three real sources, rendered as they are.
 *
 * READ ONLY, DELIBERATELY. The surface this replaces let the operator add
 * cards, drag them between columns and delete them; none of it persisted, and
 * its eight tasks were invented. There is no write path to any of these three
 * tables from a UI, so this renders none — an inert control is a worse lie than
 * an absent one.
 *
 * VOCABULARY IS THE DATABASE'S. Status and priority are printed as stored
 * (`pending`, `in_progress`, `critical`, …), never translated into friendlier
 * words. The old board showed `backlog`/`todo`, which `manager_tasks` has never
 * had. Grouping is by the raw value, so an unrecognised status gets its own
 * lane instead of being folded into a known one.
 *
 * WHAT IS ABSENT IS ABSENT. No deadline, no due date, no progress bar, no
 * dependency, no drag order, no next-run time. None of those columns exist on
 * `manager_tasks`, `workflows` or `workflow_instances`, so there is nothing to
 * render and nothing is invented to fill the space.
 *
 * `owner` IS FREE TEXT. It is quoted, not avatared, because no task → agent
 * foreign key exists. Presenting it as a person would assert a relation the
 * schema does not have.
 *
 * A source that could not be READ renders as an explicit unavailable state, in
 * amber, distinct from the empty state — "we could not ask" and "there is
 * nothing" are opposite answers and must never share a visual.
 *
 * Server component: nothing here is interactive beyond links, so there is no
 * client bundle and no keyboard owner to invent.
 */

const READ_ONLY_NOTE =
  'Planering visar verkligt arbete från Omniras runtime. Redigering stöds ännu inte från denna vy.'

/** Lane accents by declared status. An unknown status falls back to neutral. */
const STATUS_TONE: Record<string, string> = {
  pending:     'rgb(var(--omnira-aqua-rgb) / 0.65)',
  in_progress: 'var(--omnira-cyan)',
  done:        'var(--omnira-emerald)',
  failed:      'var(--omnira-rose)',
  cancelled:   'rgb(var(--omnira-aqua-rgb) / 0.32)',
}

const PRIORITY_TONE: Record<string, string> = {
  critical: 'var(--omnira-rose)',
  high:     'var(--omnira-amber)',
  medium:   'rgb(var(--omnira-aqua-rgb) / 0.6)',
  low:      'rgb(var(--omnira-aqua-rgb) / 0.38)',
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.unavailable} role="status">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function TaskCard({ task, project }: { task: PlanningTask; project: PlanningProject | null }) {
  return (
    <article
      className={styles.task}
      style={project ? ({ ['--task-accent' as string]: project.color }) : undefined}
    >
      <div className={styles.taskTop}>
        <span className={styles.taskAccent} aria-hidden="true" />
        <span className={styles.taskTitle}>{task.title}</span>
      </div>

      <div className={styles.taskMeta}>
        <span
          className={`${styles.chip} ${styles.chipPriority}`}
          style={{ color: PRIORITY_TONE[task.priority] ?? 'rgb(var(--omnira-aqua-rgb) / 0.5)' }}
        >
          {task.priority}
        </span>

        {project ? (
          <span className={`${styles.chip} ${styles.chipProject}`}>{project.name}</span>
        ) : null}

        {task.source ? (
          <span className={`${styles.chip} ${styles.chipSource}`}>{task.source}</span>
        ) : null}

        {/* Free text from the row. Quoted so it reads as a written note rather
            than as a resolved identity. */}
        {task.owner ? (
          <span className={`${styles.chip} ${styles.chipOwner}`} title="manager_tasks.owner — fritext">
            “{task.owner}”
          </span>
        ) : null}
      </div>

      {task.workflowHref || task.runHref ? (
        <div className={styles.taskLinks}>
          {task.workflowHref ? (
            <Link href={task.workflowHref} className={styles.taskLink}>Workflow</Link>
          ) : null}
          {task.runHref ? (
            <Link href={task.runHref} className={styles.taskLink}>Körning</Link>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function RecurringRow({ workflow, project }: { workflow: PlanningRecurring; project: PlanningProject | null }) {
  return (
    <tr>
      <td>
        <span
          className={styles.cellName}
          style={project ? ({ ['--task-accent' as string]: project.color }) : undefined}
        >
          <span className={styles.cellAccent} aria-hidden="true" />
          {/* `.cellLink`, not `.taskLink`: the name is stored data and must
              render in the case it was saved in. */}
          {workflow.href
            ? <Link href={workflow.href} className={styles.cellLink}>{workflow.name}</Link>
            : <span>{workflow.name}</span>}
        </span>
      </td>
      <td>{project?.name ?? '—'}</td>
      <td>
        {/* Verbatim. This repository has no cron parser, so the expression is
            the honest answer and a computed "next run" would be invented. */}
        {workflow.cronExpr
          ? <code className={styles.cron}>{workflow.cronExpr}</code>
          : <span className={styles.cronMissing}>saknas</span>}
      </td>
      <td>
        <span className={`${styles.state} ${workflow.active ? styles.stateActive : styles.statePaused}`}>
          <span className={styles.stateDot} aria-hidden="true" />
          {workflow.active ? 'Aktiv' : 'Pausad'}
        </span>
      </td>
    </tr>
  )
}

const WAKE_LABEL: Record<PlanningRelease['wake'], string> = {
  due:           'Förfallen',
  sleeping:      'Väntar',
  not_scheduled: 'Ej schemalagd',
}

const WAKE_CLASS: Record<PlanningRelease['wake'], string> = {
  due:           styles.wakeDue,
  sleeping:      styles.wakeSleeping,
  not_scheduled: styles.wakeNone,
}

function ReleaseCard({ release, project }: { release: PlanningRelease; project: PlanningProject | null }) {
  return (
    <article className={styles.release}>
      <div className={styles.releaseTop}>
        <span className={styles.releaseKey}>{release.instanceKey}</span>
        <span className={styles.releaseStatus}>{release.status}</span>
      </div>
      <span className={styles.releaseDef}>{release.defKey}</span>

      <div className={styles.releaseRow}>
        <span className={styles.releaseRowLabel}>Läge</span>
        <span className={styles.releaseRowValue}>{release.currentState}</span>
      </div>

      {/* `wake_at` is written by the scheduler, so this timestamp is real —
          unlike a next-run time, which nothing in this repository computes. */}
      <div className={styles.releaseRow}>
        <span className={styles.releaseRowLabel}>Väckning</span>
        <span className={`${styles.releaseRowValue} ${WAKE_CLASS[release.wake]}`}>
          {WAKE_LABEL[release.wake]}
          {release.wakeAt ? ` · ${release.wakeAt.slice(0, 16).replace('T', ' ')}` : ''}
        </span>
      </div>

      {project ? (
        <div className={styles.releaseRow}>
          <span className={styles.releaseRowLabel}>Projekt</span>
          <span className={styles.releaseRowValue}>{project.name}</span>
        </div>
      ) : null}
    </article>
  )
}

export function PlanningView({ model }: { model: PlanningModel }) {
  const { availability, truncated } = model
  const projectById = new Map(model.projects.map((project) => [project.id, project]))
  const projectFor = (id: string | null) => (id ? projectById.get(id) ?? null : null)

  const activeRecurring = model.recurring.filter((workflow) => workflow.active).length

  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.header}>
        <p className={styles.kicker}>Planering</p>
        <h1 className={styles.title}>Verkligt arbete</h1>
        <p className={styles.readOnly}>{READ_ONLY_NOTE}</p>
      </header>

      {/* Which tables this page is actually reading — stated, not implied. */}
      <div className={styles.sources}>
        <div className={styles.source}>
          {availability.tasks
            ? <span className={styles.sourceCount}>{model.taskCount}</span>
            : <span className={styles.sourceCountUnavailable}>—</span>}
          <span className={styles.sourceLabel}>Uppgifter i backlogg</span>
          <span className={styles.sourceTable}>manager_tasks</span>
        </div>
        <div className={styles.source}>
          {availability.recurring
            ? <span className={styles.sourceCount}>{activeRecurring}</span>
            : <span className={styles.sourceCountUnavailable}>—</span>}
          <span className={styles.sourceLabel}>Aktiva scheman</span>
          <span className={styles.sourceTable}>workflows · cron</span>
        </div>
        <div className={styles.source}>
          {availability.releases
            ? <span className={styles.sourceCount}>{model.releases.length}</span>
            : <span className={styles.sourceCountUnavailable}>—</span>}
          <span className={styles.sourceLabel}>Pågående releaser</span>
          <span className={styles.sourceTable}>workflow_instances</span>
        </div>
      </div>

      {!availability.projects ? (
        <Unavailable>
          Projektlistan kunde inte läsas — projektnamn och länkar saknas nedan.
        </Unavailable>
      ) : null}

      {/* ── Backlog ──────────────────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="planning-backlog">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="planning-backlog">Backlogg</h2>
          <span className={styles.sectionMeta}>manager_tasks</span>
        </div>

        {!availability.tasks ? (
          <Unavailable>
            Backloggen kunde inte läsas. Detta betyder inte att den är tom.
          </Unavailable>
        ) : model.taskGroups.length === 0 ? (
          <p className={styles.empty}>Inga uppgifter i dina projekt.</p>
        ) : (
          <>
            <div className={styles.lanes}>
              {model.taskGroups.map((group) => (
                <div className={styles.lane} key={group.status}>
                  <div
                    className={styles.laneHead}
                    style={{ color: STATUS_TONE[group.status] ?? 'rgb(var(--omnira-aqua-rgb) / 0.5)' }}
                  >
                    <span className={styles.laneDot} aria-hidden="true" />
                    <span className={styles.laneStatus}>{group.status}</span>
                    {/* A value outside the declared CHECK vocabulary is shown
                        under its own name and flagged, never silently grouped. */}
                    {!group.known ? (
                      <span className={styles.laneUnknown}>okänd status</span>
                    ) : null}
                    <span className={styles.laneCount}>{group.tasks.length}</span>
                  </div>
                  <div className={styles.laneBody}>
                    {group.tasks.map((task) => (
                      <TaskCard key={task.id} task={task} project={projectFor(task.projectId)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {truncated.tasks ? (
              <p className={styles.truncated}>Visar de senaste uppgifterna — fler finns.</p>
            ) : null}
          </>
        )}
      </section>

      {/* ── Recurring ────────────────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="planning-recurring">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="planning-recurring">Återkommande</h2>
          <span className={styles.sectionMeta}>workflows · trigger = cron</span>
        </div>

        {!availability.recurring ? (
          <Unavailable>
            Scheman kunde inte läsas. Detta betyder inte att inga är konfigurerade.
          </Unavailable>
        ) : model.recurring.length === 0 ? (
          <p className={styles.empty}>Inga cron-schemalagda workflows i dina projekt.</p>
        ) : (
          <>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Workflow</th>
                    <th scope="col">Projekt</th>
                    <th scope="col">Cron</th>
                    <th scope="col">Läge</th>
                  </tr>
                </thead>
                <tbody>
                  {model.recurring.map((workflow) => (
                    <RecurringRow
                      key={workflow.id}
                      workflow={workflow}
                      project={projectFor(workflow.projectId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {truncated.recurring ? (
              <p className={styles.truncated}>Fler scheman finns än de som visas.</p>
            ) : null}
          </>
        )}
      </section>

      {/* ── Releases ─────────────────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="planning-releases">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="planning-releases">Releaser</h2>
          <span className={styles.sectionMeta}>workflow_instances</span>
        </div>

        {!availability.releases ? (
          <Unavailable>
            Releaser kunde inte läsas. Detta betyder inte att inga pågår.
          </Unavailable>
        ) : model.releases.length === 0 ? (
          <p className={styles.empty}>Inga workflow-instanser i dina projekt.</p>
        ) : (
          <>
            <div className={styles.releases}>
              {model.releases.map((release) => (
                <ReleaseCard
                  key={release.id}
                  release={release}
                  project={projectFor(release.projectId)}
                />
              ))}
            </div>
            {truncated.releases ? (
              <p className={styles.truncated}>Fler instanser finns än de som visas.</p>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
