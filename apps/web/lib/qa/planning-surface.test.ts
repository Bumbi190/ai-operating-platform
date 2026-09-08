/**
 * Planning surface (Phase 8B).
 *
 * The dominant risk on this page is not layout — it is INVENTING WORK. The
 * surface it replaces shipped eight hard-coded tasks, a status vocabulary
 * (`backlog` / `todo`) that `manager_tasks` has never had, and add / drag /
 * delete controls that persisted nothing. Every one of those read as real.
 *
 * The second risk is the schema's own trap. `planning_items` and `sprints`
 * exist, are structurally valid, and are exactly shaped like what a planning
 * page seems to want — but they have no producer, no consumer and no Atlas
 * write path. Adopting them would create a second, weaker planning model. The
 * repository had already resolved this: `view-records.ts` maps the `planning`
 * destination to `manager_tasks`, and `data-registry.ts` calls that table "the
 * planning / delegated-work backlog". These tests hold the surface to that
 * decision rather than to a fresh opinion.
 *
 * The third risk is a failed query that looks like an empty backlog. "We could
 * not ask" and "there is nothing planned" are opposite answers to an operator.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assemblePlanningModel,
  MANAGER_TASK_STATUS_ORDER,
  MANAGER_TASK_PRIORITY_ORDER,
  type AssemblePlanningInput,
} from '@/lib/os/planning'
import { buildBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { DESTINATION_TO_DOMAIN } from '@/lib/atlas/view-records'
import { destinationBasePath, resolveDestination } from '@/lib/nav/registry'
import { VNEXT_NAV } from '@/lib/nav/vnext-nav'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const LOADER = read('lib/os/planning.ts')
const VIEW = read('components/platform/vnext/PlanningView.tsx')
const VIEW_CSS = read('components/platform/vnext/PlanningView.module.css')
const PAGE = read('app/(platform)/planning/page.tsx')
const LEGACY = read('app/(platform)/planning/PlanningLegacy.tsx')
const STORE = read('lib/workflows/store.ts')

/**
 * Strip comments before scanning for code. Several of these assertions look for
 * table names and field names that the prose deliberately DISCUSSES — the whole
 * point of the loader's header is to explain what it does not query — so
 * matching raw source would fail on the explanation rather than on the code.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const LOADER_CODE = codeOnly(LOADER)
const VIEW_CODE = codeOnly(VIEW)
const PAGE_CODE = codeOnly(PAGE)

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECTS = [
  { id: 'p1', name: 'The Prompt', slug: 'the-prompt', color: '#22d3ee' },
  { id: 'p2', name: 'Familje-Stunden', slug: 'familje-stunden', color: '#a78bfa' },
]

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', project_id: 'p1', title: 'Uppgift', status: 'pending', priority: 'medium',
  owner: null, source: null, workflow_id: null, run_id: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: null, ...over,
}) as AssemblePlanningInput['tasks'][number]

const workflow = (over: Record<string, unknown> = {}) => ({
  id: 'w1', project_id: 'p1', name: 'Morgonbriefing', trigger: 'cron',
  cron_expr: '30 7 * * *', active: true, ...over,
}) as AssemblePlanningInput['workflows'][number]

const release = (over: Record<string, unknown> = {}) => ({
  id: 'i1', instanceKey: '2026-11', defKey: 'familje_stunden_monthly_release',
  projectId: 'p1', currentState: 'planning', status: 'active',
  wakeAt: null, wake: 'not_scheduled' as const,
  lastTickAt: null, lastTickOutcome: null, ...over,
}) as AssemblePlanningInput['releases'][number]

const ALL_OK = { projects: true, tasks: true, recurring: true, releases: true }
const NONE_TRUNCATED = { tasks: false, recurring: false, releases: false }

const build = (over: Partial<AssemblePlanningInput> = {}) =>
  assemblePlanningModel({
    projects: PROJECTS, tasks: [], workflows: [], releases: [],
    truncated: NONE_TRUNCATED, availability: ALL_OK, ...over,
  })

// ═══ Contract ════════════════════════════════════════════════════════════════

describe('planning · contract', () => {
  it('never queries or imports planning_items', () => {
    for (const src of [LOADER_CODE, VIEW_CODE, PAGE_CODE]) {
      expect(src).not.toMatch(/planning_items/)
    }
  })

  it('never queries or imports sprints', () => {
    for (const src of [LOADER_CODE, VIEW_CODE, PAGE_CODE]) {
      expect(src).not.toMatch(/\bsprints\b/)
    }
  })

  it('reads the backlog from manager_tasks', () => {
    expect(LOADER_CODE).toMatch(/from\('manager_tasks'\)/)
  })

  it('reads recurrence from workflows, filtered to the cron trigger', () => {
    expect(LOADER_CODE).toMatch(/from\('workflows'\)/)
    expect(LOADER_CODE).toMatch(/\.eq\('trigger', 'cron'\)/)
    expect(LOADER_CODE).toMatch(/cron_expr/)
  })

  it('reads releases from workflow_instances through the scoped store reader', () => {
    expect(LOADER_CODE).toMatch(/listInstancesForProjects/)
    expect(codeOnly(STORE)).toMatch(/from\('workflow_instances'\)[\s\S]{0,200}\.in\('project_id'/)
  })

  it('honours the destination→domain mapping the repository already made', () => {
    expect(DESTINATION_TO_DOMAIN.planning?.domain).toBe('manager_tasks')
  })

  it('introduces no planning entity of its own — the model is only the three sources', () => {
    // Every exported interface names a source concept (task / recurring /
    // release / project) or the aggregate. A new abstract "PlanningItem" entity
    // with its own identity would show up here.
    const exported = [...LOADER.matchAll(/export interface (\w+)/g)].map(m => m[1])
    expect(exported).not.toContain('PlanningItem')
    expect(exported.every(n => /^(Planning|Assemble)/.test(n))).toBe(true)
  })
})

// ═══ Scoping ═════════════════════════════════════════════════════════════════

describe('planning · project scoping', () => {
  it('resolves the allow-list through the canonical isolation boundary', () => {
    expect(LOADER_CODE).toMatch(/getAllowedProjectIds/)
    expect(LOADER_CODE).toMatch(/scopeProjectFilter/)
  })

  it('scopes every one of the three sources', () => {
    // Bounded to ONE statement each. A fixed-width window around the table name
    // reaches into the NEXT query in the same allSettled array, so deleting a
    // scope clause would still match its neighbour's — the assertion would pass
    // on a genuinely unscoped read. Each source is cut at the start of the next.
    const SOURCES = ["(db.from('", 'listInstancesForProjects(']
    const statement = (anchor: string): string => {
      const from = LOADER_CODE.indexOf(anchor)
      expect(from).toBeGreaterThan(-1)
      const ends = SOURCES
        .map(s => LOADER_CODE.indexOf(s, from + anchor.length))
        .filter(i => i > -1)
      return LOADER_CODE.slice(from, ends.length ? Math.min(...ends) : undefined)
    }

    expect(statement("from('manager_tasks')")).toMatch(/\.in\('project_id', scopedIds\)/)
    expect(statement("from('workflows')")).toMatch(/\.in\('project_id', scopedIds\)/)
    expect(statement('listInstancesForProjects(')).toMatch(/^listInstancesForProjects\(db, scopedIds/)
  })

  it('never reaches for the unscoped readers', () => {
    // fetchDashboardSnapshot reads workflows through the admin client with no
    // project scope; listInstances filters by def_key only. Either would leak.
    expect(LOADER_CODE).not.toMatch(/fetchDashboardSnapshot/)
    expect(LOADER_CODE).not.toMatch(/\blistInstances\b(?!ForProjects)/)
  })

  it('drops a task whose project is outside the scoped set', () => {
    const model = build({ tasks: [task({ id: 'mine' }), task({ id: 'theirs', project_id: 'p9' })] })
    const ids = model.taskGroups.flatMap(g => g.tasks.map(t => t.id))
    expect(ids).toEqual(['mine'])
    expect(model.taskCount).toBe(1)
  })

  it('drops a task with no project at all, rather than showing it globally', () => {
    const model = build({ tasks: [task({ id: 'orphan', project_id: null })] })
    expect(model.taskGroups).toEqual([])
    expect(model.taskCount).toBe(0)
  })

  it('drops recurring workflows and releases from foreign projects', () => {
    const model = build({
      workflows: [workflow({ id: 'ours' }), workflow({ id: 'theirs', project_id: 'p9' })],
      releases: [release({ id: 'ours' }), release({ id: 'theirs', projectId: 'p9' })],
    })
    expect(model.recurring.map(w => w.id)).toEqual(['ours'])
    expect(model.releases.map(r => r.id)).toEqual(['ours'])
  })

  it('an empty allow-list yields the impossible id, never an unscoped read', () => {
    // scopeProjectFilter is the guarantee; assert the loader routes through it
    // rather than passing the raw array on.
    expect(LOADER_CODE).toMatch(/const scopedIds = scopeProjectFilter\(allowedProjectIds\)/)
    expect(LOADER_CODE).not.toMatch(/\.in\('project_id', allowedProjectIds\)/)
  })
})

// ═══ Data honesty ════════════════════════════════════════════════════════════

describe('planning · data honesty', () => {
  it('uses the real manager_tasks vocabulary, not the old board’s', () => {
    expect([...MANAGER_TASK_STATUS_ORDER])
      .toEqual(['pending', 'in_progress', 'done', 'failed', 'cancelled'])
    expect([...MANAGER_TASK_PRIORITY_ORDER])
      .toEqual(['critical', 'high', 'medium', 'low'])
    // `backlog` and `todo` were invented by the legacy board.
    expect(MANAGER_TASK_STATUS_ORDER).not.toContain('backlog')
    expect(MANAGER_TASK_STATUS_ORDER).not.toContain('todo')
  })

  it('groups by the raw status and never remaps one status onto another', () => {
    const model = build({
      tasks: [task({ id: 'a', status: 'pending' }), task({ id: 'b', status: 'in_progress' })],
    })
    expect(model.taskGroups.map(g => g.status)).toEqual(['pending', 'in_progress'])
  })

  it('keeps an unrecognised status under its own name, flagged as unknown', () => {
    const model = build({ tasks: [task({ id: 'x', status: 'triaged' })] })
    const group = model.taskGroups.find(g => g.status === 'triaged')
    expect(group).toBeDefined()
    expect(group!.known).toBe(false)
    expect(group!.tasks.map(t => t.id)).toEqual(['x'])
    // Not folded into a declared status.
    expect(model.taskGroups.find(g => g.status === 'pending')).toBeUndefined()
  })

  it('declared statuses come before unrecognised ones', () => {
    const model = build({
      tasks: [task({ id: 'x', status: 'triaged' }), task({ id: 'y', status: 'pending' })],
    })
    expect(model.taskGroups.map(g => g.status)).toEqual(['pending', 'triaged'])
  })

  it('never re-cases a stored value — only this file’s own captions', () => {
    // A stored string must read as it was saved. `.taskLink` (the "Workflow" /
    // "Körning" captions), the kickers and the column headings are text this
    // file writes, so they may be uppercased; the classes that carry a row's
    // own data may not. A workflow NAME rendered as MORGONBRIEFING, or a status
    // enum rendered as ACTIVE beside a `pending` printed lowercase, reports the
    // row differently from how it is stored.
    const DATA_CLASSES = ['cellLink', 'releaseStatus', 'laneStatus', 'taskTitle', 'releaseKey', 'cron']
    for (const cls of DATA_CLASSES) {
      const at = VIEW_CSS.indexOf(`.${cls} {`)
      expect(at, `.${cls} missing`).toBeGreaterThan(-1)
      const rule = VIEW_CSS.slice(at, VIEW_CSS.indexOf('}', at))
      expect(rule, `.${cls} re-cases stored data`).not.toMatch(/text-transform:\s*(uppercase|lowercase|capitalize)/)
    }
  })

  it('carries owner through as free text and never as an agent relation', () => {
    const model = build({ tasks: [task({ owner: '  Nova  ' })] })
    expect(model.taskGroups[0]!.tasks[0]!.owner).toBe('Nova')
    // No agent id, no agent href, no agents table anywhere in this surface.
    expect(LOADER_CODE).not.toMatch(/from\('agents'\)/)
    expect(LOADER_CODE).not.toMatch(/agent_id/)
    expect(VIEW_CODE).not.toMatch(/agent/i)
  })

  it('fabricates no deadline, progress, dependency or ordering field', () => {
    const model = build({ tasks: [task()], workflows: [workflow()], releases: [release()] })
    const shapes = [
      ...model.taskGroups.flatMap(g => g.tasks),
      ...model.recurring,
      ...model.releases,
    ]
    for (const row of shapes) {
      for (const key of Object.keys(row)) {
        expect(key).not.toMatch(/deadline|due|progress|percent|depend|blocked_by|position|rank|sort_order/i)
      }
    }
    for (const src of [LOADER_CODE, VIEW_CODE]) {
      expect(src).not.toMatch(/deadline|dueDate|due_date|progressPct|percentComplete/i)
    }
  })

  it('renders no progress figure or meter, however it is spelled', () => {
    // The field-name scan above catches a `progress` PROPERTY. It does not
    // catch a percentage written straight into the markup, which is the more
    // likely way a progress figure would appear — so the rendered output is
    // checked too. No column on any of the three tables supports one.
    expect(VIEW_CODE).not.toMatch(/\d\s*%/)
    expect(VIEW_CODE).not.toMatch(/<progress|<meter|role="progressbar"/)
    expect(VIEW_CSS).not.toMatch(/\.(progress|bar|meter|fill)\b/)
  })

  it('derives no next-run time from cron — the expression is rendered verbatim', () => {
    const model = build({ workflows: [workflow({ cron_expr: ' 30 7 * * * ' })] })
    expect(model.recurring[0]!.cronExpr).toBe('30 7 * * *')
    expect(Object.keys(model.recurring[0]!)).not.toContain('nextRun')
    // No cron parser exists in this repository; building one here would be a
    // scheduling engine, and guessing would be a fabricated timestamp.
    expect(LOADER_CODE).not.toMatch(/nextRun|next_run|cronstrue|cron-parser|parseCron/)
    expect(VIEW_CODE).not.toMatch(/nextRun|next_run|cronstrue|cron-parser|parseCron/)
  })

  it('classifies release wake through the scheduler’s own helper', () => {
    expect(LOADER_CODE).toMatch(/wakeState\(instance\.wake_at, now\)/)
  })

  it('a failed query is unavailable, never an empty backlog', () => {
    const model = build({ availability: { ...ALL_OK, tasks: false } })
    expect(model.availability.tasks).toBe(false)
    expect(model.taskGroups).toEqual([])
    // The view must branch on availability BEFORE it branches on emptiness,
    // so a read failure can never render as "inga uppgifter".
    const backlog = VIEW_CODE.slice(VIEW_CODE.indexOf('planning-backlog'))
    const unavailableAt = backlog.indexOf('!availability.tasks')
    const emptyAt = backlog.indexOf('model.taskGroups.length === 0')
    expect(unavailableAt).toBeGreaterThan(-1)
    expect(emptyAt).toBeGreaterThan(unavailableAt)
  })

  it('reports each source’s availability independently', () => {
    const model = build({ availability: { projects: true, tasks: true, recurring: false, releases: true } })
    expect(model.availability.recurring).toBe(false)
    expect(model.availability.tasks).toBe(true)
    // One failing table degrades one section, so the reads are settled, not raced.
    expect(LOADER_CODE).toMatch(/Promise\.allSettled/)
  })

  it('reports truncation instead of silently showing a partial list as complete', () => {
    const model = build({ truncated: { tasks: true, recurring: false, releases: false } })
    expect(model.truncated.tasks).toBe(true)
    expect(VIEW_CODE).toMatch(/truncated\.tasks/)
  })
})

// ═══ Interaction ═════════════════════════════════════════════════════════════

describe('planning · read-only', () => {
  it('renders no add, drag, drop or delete affordance', () => {
    expect(VIEW_CODE).not.toMatch(/draggable|onDragStart|onDragOver|onDrop|dataTransfer/)
    expect(VIEW_CODE).not.toMatch(/addItem|removeItem|moveItem|handleDrop/)
    expect(VIEW_CSS).not.toMatch(/cursor:\s*(grab|grabbing|move)/)
  })

  it('holds no local state posing as persistence', () => {
    expect(VIEW_CODE).not.toMatch(/useState|useOptimistic|useReducer/)
    expect(VIEW_CODE).not.toMatch(/SAMPLE_|MOCK_|DEMO_|PLACEHOLDER_/)
  })

  it('is a server component — no client boundary is opened for this surface', () => {
    expect(VIEW).not.toMatch(/^'use client'/m)
  })

  it('writes nothing, anywhere in the loader', () => {
    expect(LOADER_CODE).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  })

  it('creates no mutation API and no Atlas planning write path', () => {
    expect(VIEW_CODE).not.toMatch(/fetch\(|useFormState|action=\{|formAction/)
    expect(PAGE_CODE).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
    // The scoped store reader added for releases must be a SELECT only.
    const fn = codeOnly(STORE).slice(codeOnly(STORE).indexOf('listInstancesForProjects'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  })

  it('states read-only plainly, without promising a future', () => {
    expect(VIEW).toContain(
      'Planering visar verkligt arbete från Omniras runtime. Redigering stöds ännu inte från denna vy.',
    )
    expect(VIEW_CODE).not.toMatch(/kommer snart|coming soon|snart tillgänglig/i)
  })
})

// ═══ Navigation ══════════════════════════════════════════════════════════════

describe('planning · navigation', () => {
  it('stays registry-owned at /planning', () => {
    expect(destinationBasePath('planning')).toBe('/planning')
    expect(VNEXT_NAV.flatMap(g => g.items).some(i => i.href === '/planning')).toBe(true)
  })

  it('keeps its breadcrumb, derived from the registry', () => {
    const crumbs = buildBreadcrumbs('/planning')
    expect(crumbs.at(-1)?.current).toBe(true)
    expect(crumbs.length).toBeGreaterThan(0)
  })

  it('builds links only from the registry’s project route', () => {
    const home = resolveDestination('project_home', { project: 'the-prompt' })?.href
    expect(home).toBeTruthy()
    const model = build({ tasks: [task({ workflow_id: 'w1', run_id: 'r1' })] })
    const t = model.taskGroups[0]!.tasks[0]!
    expect(t.workflowHref).toBe(`${home}/workflows/w1`)
    expect(t.runHref).toBe(`${home}/runs/r1`)
  })

  it('renders no link when the registry will not vouch for the project', () => {
    const model = build({
      projects: [{ id: 'p1', name: 'Okänt', slug: 'inte en giltig slug!', color: null }],
      tasks: [task({ workflow_id: 'w1', run_id: 'r1' })],
    })
    const t = model.taskGroups[0]!.tasks[0]!
    expect(t.workflowHref).toBeNull()
    expect(t.runHref).toBeNull()
  })

  it('omits a link entirely when the row carries no workflow or run', () => {
    const model = build({ tasks: [task()] })
    const t = model.taskGroups[0]!.tasks[0]!
    expect(t.workflowHref).toBeNull()
    expect(t.runHref).toBeNull()
  })

  it('creates no route of its own', () => {
    // Every href in the view comes from the model; none is written literally.
    expect(VIEW_CODE).not.toMatch(/href="\/[a-z]/)
  })
})

// ═══ UX ══════════════════════════════════════════════════════════════════════

describe('planning · display scale, responsive, motion', () => {
  it('sizes in rem so the display-scale preference reaches it', () => {
    const px = [...VIEW_CSS.matchAll(/^\s*(?:width|height|padding|margin|font-size|gap|min-width|max-width)[^:]*:\s*([^;]+);/gm)]
      .map(m => m[1])
      .filter(v => /\d+px/.test(v))
      // Hairlines and pixel-snapped rails are intentionally absolute.
      .filter(v => !/^(0|-?1px|2px|3px)\b/.test(v.trim()))
    expect(px).toEqual([])
  })

  it('never uses CSS zoom', () => {
    expect(VIEW_CSS).not.toMatch(/(^|[^-\w])zoom\s*:/)
  })

  it('keeps lanes fluid, so Large reflows instead of clipping', () => {
    expect(VIEW_CSS).toMatch(/\.lanes\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/)
    expect(VIEW_CSS).not.toMatch(/\.lanes\s*\{[^}]*overflow-x:\s*auto/)
  })

  it('stacks sections at narrow widths rather than squeezing a kanban', () => {
    const narrow = VIEW_CSS.slice(VIEW_CSS.indexOf('@media (max-width: 40rem)'))
    expect(narrow).toMatch(/\.lanes[\s\S]{0,80}grid-template-columns:\s*1fr/)
  })

  it('never scrolls the page sideways; only the real table scrolls', () => {
    expect(VIEW_CSS).toMatch(/\.field\s*\{[^}]*overflow-x:\s*hidden/)
    expect(VIEW_CSS).toMatch(/\.tableScroll\s*\{[^}]*overflow-x:\s*auto/)
    // The min-width floor belongs to the table, never to the page.
    expect(VIEW_CSS).toMatch(/\.table\s*\{[^}]*min-width:/)
  })

  it('carries no information in animation', () => {
    // The only animation is a halo on the active dot; the state is already a
    // colour class and a word, both of which survive motion being removed.
    const keyframes = [...VIEW_CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
    expect(keyframes).toEqual(['planning-ping'])
    expect(VIEW_CODE).toMatch(/\{workflow\.active \? 'Aktiv' : 'Pausad'\}/)
  })

  it('respects the single resolved motion signal', () => {
    // The global html[data-motion='reduce'] rule only collapses durations, so a
    // keyframe would keep its first frame painted — hence the explicit removal.
    expect(VIEW_CSS).toMatch(/html\[data-motion='reduce'\][\s\S]{0,120}animation:\s*none/)
    expect(VIEW_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}:where\(html:not\(\[data-motion='full'\]\)\)/)
  })
})

// ═══ Legacy ══════════════════════════════════════════════════════════════════

describe('planning · legacy rollback', () => {
  it('keeps the route working in legacy through the generation resolver', () => {
    expect(PAGE_CODE).toMatch(/resolveUiGeneration/)
    expect(PAGE_CODE).toMatch(/if \(!isVNext\(generation\)\) return <PlanningLegacy \/>/)
  })

  it('leaves the legacy board exactly as it was — no new behaviour', () => {
    expect(LEGACY).toContain('<PlanningBoard />')
    const board = read('app/(platform)/planning/PlanningBoard.tsx')
    expect(board).toContain('const SAMPLE_ITEMS')
    // The fabricated board is legacy-only; vNext must not import it.
    expect(VIEW_CODE).not.toMatch(/PlanningBoard/)
    expect(PAGE_CODE).not.toMatch(/PlanningBoard/)
  })

  it('does not load the vNext model when rendering legacy', () => {
    // The legacy branch returns before the scoped read, so a rollback costs
    // nothing and cannot fail on a query it does not use.
    const legacyAt = PAGE_CODE.indexOf('PlanningLegacy />')
    const loadAt = PAGE_CODE.indexOf('loadPlanningModel()')
    expect(legacyAt).toBeGreaterThan(-1)
    expect(loadAt).toBeGreaterThan(legacyAt)
  })
})
