import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'
import {
  pathToDestination,
  destinationLabel,
  destinationBasePath,
  resolveDestination,
  projectDisplayName,
  type DestinationId,
} from '@/lib/nav/registry'
import { vnextNavItems } from '@/lib/nav/vnext-nav'

/**
 * Global breadcrumbs — one derivation of "where am I", for the whole shell.
 *
 * WHAT THIS IS NOT. It is not a second route taxonomy. Every label and every
 * href here is derived from sources that already exist: `pathToDestination`
 * answers which destination owns a path, `VNEXT_NAV` supplies the owner-approved
 * label for that destination, and `resolveDestination` builds the href. Nothing
 * in this module decides where a concept lives — it only reads the answer.
 *
 * WHY IT IS A PURE FUNCTION. The breadcrumb has to be testable without a router,
 * a database or a React tree, and the interesting cases are all path shapes:
 * dynamic ids, project routes, unknown segments, redirect-only routes. Those are
 * cheap to assert against a string and expensive to assert against a rendered
 * page, so the decision lives here and the component only renders it.
 *
 * ORIENTATION, NOT NAVIGATION. Breadcrumbs say where you are and let you climb.
 * They deliberately do not enumerate siblings, carry filters, or duplicate the
 * sidebar — the sidebar is the map, this is the address.
 *
 * Presentation only. This grants and denies nothing: route access is enforced by
 * middleware and the server, exactly as before, and a crumb that cannot be built
 * simply is not rendered.
 */

export interface BreadcrumbItem {
  /** What the operator reads. */
  label: string
  /**
   * Where the crumb goes. ABSENT means "no real destination" — either this is
   * the current page, or the path segment has no route of its own. A crumb
   * without an href renders as plain text, never as a dead link.
   */
  href?: string
  /** The page the operator is on. Exactly one item carries this. */
  current: boolean
}

/** The minimum a caller must know about a project for it to be nameable. */
export interface BreadcrumbProject {
  slug: string
  name: string
}

export interface BuildBreadcrumbsOptions {
  /**
   * The projects this operator may see, already scoped by the platform layout.
   *
   * Supplying this list is what makes project naming respect visibility: a slug
   * that is not in it renders as the slug from the URL rather than resolving to
   * a display name. Omitting the option entirely (unit tests, callers with no
   * session) falls back to the registry's static business profiles.
   */
  projects?: readonly BreadcrumbProject[]
}

/** The root crumb. Always first, and the one fixed point in the hierarchy. */
const ROOT_LABEL = 'Omnira'

/**
 * The projects level.
 *
 * This crumb used to carry no href: `/projects` had no page, only
 * `/projects/[slug]` and `/projects/new`, so linking it would have offered a
 * dead destination. Phase 5 built the index, so it links now — and the path
 * comes from the registry rather than being restated here.
 */
const PROJECTS_SEGMENT = 'projects'
const PROJECTS_LABEL = 'Projekt'

/**
 * Labels for path segments that are not destinations of their own.
 *
 * Every entry is taken from what the page already calls itself — its `<h1>`, or
 * its panel title where the page has no heading of its own. They are not
 * translations invented here, which is why the map is a mix of Swedish and
 * English: it mirrors the product as it currently reads, and a segment whose
 * page is renamed should be updated here rather than diverging quietly.
 */
const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  agents: 'Agenter',
  workflows: 'Workflows',
  runs: 'Körningar',
  outputs: 'Utdata',
  news: 'News Feed',
  scripts: 'Script Queue',
  generate: 'Generate Video',
  operations: 'Operations Center',
  releases: 'Releases',
  run: 'Kör',
  // The media page has no stable heading of its own — it renders an empty state
  // or a pipeline dashboard depending on configuration — so the route name
  // stands in rather than a label invented to fill the gap.
  media: 'Media',
}

/**
 * `new` is the same segment under several parents and reads wrong on its own
 * ("Projekt / Ny"). The parent decides the noun.
 */
const NEW_LABELS: Readonly<Record<string, string>> = {
  projects: 'Nytt projekt',
  agents: 'Ny agent',
  workflows: 'Nytt workflow',
}

/**
 * The owner-approved vNext labels, indexed both ways VNEXT_NAV can be joined.
 *
 * By href as well as by id, and href is checked FIRST, because the two do not
 * always agree. `/system` is the case that proves it: the registry canonicalises
 * that route to the `health` destination, whose label is "Health", while the
 * navigation item pointing at the very same URL is labelled "System". Matching
 * on id alone put "Health" in the breadcrumb for the page the sidebar calls
 * "System" — one route wearing two names in one shell, which is exactly the
 * drift VNEXT_NAV exists to end.
 */
const VNEXT_LABEL_BY_HREF: ReadonlyMap<string, string> = new Map(
  vnextNavItems().map((item) => [normalizePath(item.href), item.label] as const),
)
const VNEXT_LABEL_BY_ID: ReadonlyMap<string, string> = new Map(
  vnextNavItems().map((item) => [item.id, item.label] as const),
)

/**
 * The label for a destination reached at `path`.
 *
 * VNEXT_NAV wins because it is the approved IA and it is written in the
 * product's language; the registry's own label is the fallback for destinations
 * the navigation does not surface (Trading, Costs, project_home).
 */
function labelForDestination(id: DestinationId, path: string): string {
  return (
    VNEXT_LABEL_BY_HREF.get(normalizePath(path))
    ?? VNEXT_LABEL_BY_ID.get(id)
    ?? destinationLabel(id)
  )
}

/** A path segment that identifies a record rather than naming a place. */
function isRecordId(segment: string): boolean {
  // UUID, or any long opaque token. Deliberately narrow: a short slug-like
  // segment is a route, and treating it as an id would hide a real label.
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-z_-]{20,}$/i.test(segment)
  )
}

/**
 * How a record id reads in a crumb.
 *
 * Truncated, in the same shape the run-detail page has always used, because the
 * shell cannot know the record's name: the layout fetches projects and nothing
 * else. Naming an agent or a run belongs to the phase that owns those pages and
 * already has the row in hand — inventing a lookup here would put a second
 * fetch behind every navigation for a label the page is about to render anyway.
 */
function recordIdLabel(segment: string): string {
  return `${segment.slice(0, 8)}…`
}

/** Title-case an unknown segment rather than inventing a translation for it. */
function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function labelForSegment(segment: string, parent: string | undefined): string {
  if (segment === 'new' && parent && NEW_LABELS[parent]) return NEW_LABELS[parent]
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (isRecordId(segment)) return recordIdLabel(segment)
  return humanizeSegment(segment)
}

function projectLabel(slug: string, options: BuildBreadcrumbsOptions): string {
  if (options.projects) {
    // A scoped list was supplied, so it is the whole truth: a slug outside it
    // renders as itself rather than resolving to a name the shell did not hand
    // us. The slug is already visible in the URL, so this reveals nothing new.
    return options.projects.find((project) => project.slug === slug)?.name ?? slug
  }
  return projectDisplayName(slug) ?? slug
}

/** Strip query/hash and any trailing slash, so `/x/` and `/x?y=1` are one path. */
function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] || '/'
  return withoutQuery.replace(/\/+$/, '') || '/'
}

/**
 * Build the trail for a pathname.
 *
 * Always starts at the root crumb, and always marks exactly one item current —
 * the last one — with its href removed, so the page you are on is never a link
 * to itself.
 */
export function buildBreadcrumbs(
  pathname: string,
  options: BuildBreadcrumbsOptions = {},
): BreadcrumbItem[] {
  const path = normalizePath(pathname ?? '/')
  const segments = path.split('/').filter(Boolean)

  const trail: Array<Omit<BreadcrumbItem, 'current'>> = [
    { label: ROOT_LABEL, href: ATLAS_HOME_PATH },
  ]

  if (segments[0] === PROJECTS_SEGMENT) {
    buildProjectTrail(segments, trail, options)
  } else if (segments.length > 0) {
    buildDestinationTrail(path, segments, trail)
  }

  return finalize(trail)
}

/**
 * Project routes.
 *
 * `Omnira / Projekt / <project> / <section> / …`, where "Projekt" is structural
 * (no index route) and every level below the project is a real page, so each
 * one is reachable by its cumulative path.
 */
function buildProjectTrail(
  segments: readonly string[],
  trail: Array<Omit<BreadcrumbItem, 'current'>>,
  options: BuildBreadcrumbsOptions,
): void {
  trail.push({ label: PROJECTS_LABEL, href: destinationBasePath('project_home') ?? undefined })

  const [, second, ...rest] = segments
  if (!second) return

  if (second === 'new') {
    trail.push({ label: NEW_LABELS.projects })
    return
  }

  // The project's own href comes from the registry's path-mode destination, so
  // the shape of a project URL is stated in exactly one place. A slug the
  // registry will not vouch for yields no href rather than a guessed one.
  const projectHref = resolveDestination('project_home', { project: second })?.href
  trail.push({ label: projectLabel(second, options), href: projectHref })

  if (!projectHref) return

  let cumulative = projectHref
  rest.forEach((segment, index) => {
    cumulative += `/${segment}`
    trail.push({ label: labelForSegment(segment, rest[index - 1]), href: cumulative })
  })
}

/**
 * Everything else.
 *
 * The registry owns the top of the trail: `pathToDestination` collapses however
 * many segments a destination's base path covers into a single crumb, which is
 * why `/intelligence/graph` reads as one "Intelligence Graph" rather than an
 * "Intelligence" level that has no page behind it.
 */
function buildDestinationTrail(
  path: string,
  segments: readonly string[],
  trail: Array<Omit<BreadcrumbItem, 'current'>>,
): void {
  const destination = pathToDestination(path)

  if (!destination) {
    // No destination owns this path. Walk it segment by segment, linking each
    // level to its own cumulative path — the same thing the router would do.
    let cumulative = ''
    segments.forEach((segment, index) => {
      cumulative += `/${segment}`
      trail.push({ label: labelForSegment(segment, segments[index - 1]), href: cumulative })
    })
    return
  }

  // The destination's own base path is the join key — that is the URL a nav
  // item points at, not whatever deeper page the operator is currently on.
  const base = resolveDestination(destination)?.href
  trail.push({ label: labelForDestination(destination, base ?? path), href: base })

  if (!base) return

  // Whatever the destination's base path did not cover.
  const baseSegments = normalizePath(base).split('/').filter(Boolean)
  const rest = segments.slice(baseSegments.length)

  let cumulative = normalizePath(base)
  rest.forEach((segment, index) => {
    cumulative += `/${segment}`
    trail.push({
      label: labelForSegment(segment, rest[index - 1] ?? baseSegments[baseSegments.length - 1]),
      href: cumulative,
    })
  })
}

/** Mark the last crumb current and take its href away. */
function finalize(trail: Array<Omit<BreadcrumbItem, 'current'>>): BreadcrumbItem[] {
  return trail.map((item, index) => {
    const current = index === trail.length - 1
    return current ? { label: item.label, current: true } : { ...item, current: false }
  })
}

/**
 * Whether the shell should mount breadcrumbs for this route.
 *
 * Three reasons to stand down, in order:
 *
 *  - LEGACY. Legacy keeps `CommandBar`, which carries its own orientation
 *    chrome. Adding a second one there would change the rollback path, and the
 *    rollback path is supposed to stay exactly as it was.
 *  - ATLAS HOME. It is the locked visual reference and owns its whole canvas.
 *    It is also the root crumb's destination, so a breadcrumb there would read
 *    "Omnira / Atlas" while pointing at the page it is already on.
 *  - A LONE ROOT. A trail with nothing but "Omnira" orients no one.
 *
 * Layout only — this grants and denies nothing.
 */
export function shouldRenderBreadcrumbs(
  pathname: string,
  generation: OmniraUiGeneration,
): boolean {
  if (!isVNext(generation)) return false
  if (normalizePath(pathname ?? '/') === ATLAS_HOME_PATH) return false
  return buildBreadcrumbs(pathname).length > 1
}
