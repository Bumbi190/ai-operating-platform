/**
 * First-party system workspaces on the Atlas Home rail.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The project rail renders the operator's portfolio, and that portfolio comes
 * from the `projects` table filtered through `getAllowedProjectIds`. Omnira also
 * has surfaces that are part of the product itself rather than one of the
 * operator's businesses — Trading is the first. Those belong on the same rail,
 * because that is where a workspace is opened from, but they are NOT projects.
 *
 * THE LINE THIS MODULE DRAWS
 * ──────────────────────────
 * A system workspace is never mixed into the authorization-scoped project data.
 * Concretely:
 *
 *  - `home-view-model.ts` is UNTOUCHED. The allow-list, the double filtering and
 *    the pre-serialization guard all behave exactly as before, and no entry from
 *    this registry ever passes through them.
 *  - No synthetic `projects` row exists, in the database or in memory. There is
 *    no id here that could be mistaken for a project id.
 *  - Composition happens at PRESENTATION time, in the rail, on data the server
 *    has already authorized. A system workspace grants nothing and is scoped by
 *    the route it links to — `/trading` sits under `(platform)`, so the layout's
 *    session check applies to it like any other page.
 *
 * The ids are deliberately shaped `system:<name>`. A project slug must match
 * `^[a-z0-9][a-z0-9-]{1,40}$`, which forbids a colon, so a system id can never
 * collide with a slug and `resolveProjectSlug` returns null for one rather than
 * silently resolving it to some other business.
 */

import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'

// ─── Vocabulary ───────────────────────────────────────────────────────────────

/** How finished the workspace is. */
export const WORKSPACE_STAGES = ['DEVELOPMENT', 'PREVIEW', 'GENERAL_AVAILABILITY'] as const
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number]

/**
 * What the workspace's numbers actually are.
 *
 * The same three words the trading snapshot uses for its own provenance, but a
 * deliberately separate vocabulary: this one describes a workspace on a card,
 * that one describes one market-data feed. They are not imported from each
 * other, so the Atlas rail never depends on the trading domain. A test asserts
 * the Trading card's value agrees with what its fixtures actually produce.
 */
export const WORKSPACE_DATA_MODES = ['FIXTURE', 'SIMULATION', 'LIVE'] as const
export type WorkspaceDataMode = (typeof WORKSPACE_DATA_MODES)[number]

export const WORKSPACE_ACCESS_MODES = ['READ_ONLY', 'READ_WRITE'] as const
export type WorkspaceAccessMode = (typeof WORKSPACE_ACCESS_MODES)[number]

export interface FirstPartyWorkspace {
  /** `system:<name>`. Cannot collide with a project slug. */
  readonly id: string
  readonly name: string
  /** Short form for the card face. */
  readonly shortLabel: string
  /** Accent colour, matching the `color` a project row carries. */
  readonly color: string
  readonly href: string
  readonly stage: WorkspaceStage
  readonly dataMode: WorkspaceDataMode
  readonly accessMode: WorkspaceAccessMode
  /** One line under the title. Plain language, no product copy. */
  readonly summary: string
}

// ─── The registry ─────────────────────────────────────────────────────────────

/**
 * The Trading workspace id, exported so the workspace itself can name the card
 * to reselect when the operator returns to the rail. One definition, so the id
 * on the card and the id in the return URL cannot drift apart.
 */
export const TRADING_WORKSPACE_ID = 'system:trading'

export const FIRST_PARTY_WORKSPACES: readonly FirstPartyWorkspace[] = [
  {
    id: TRADING_WORKSPACE_ID,
    name: 'Trading',
    shortLabel: 'Trading',
    // The vNext accent family. Distinct from every project colour in use.
    color: '#22d3ee',
    href: '/trading',
    stage: 'DEVELOPMENT',
    dataMode: 'FIXTURE',
    accessMode: 'READ_ONLY',
    summary: 'Atlas Market View · fixturdata, ingen marknadsanslutning',
  },
]

/** True for an id this registry owns. */
export function isFirstPartyWorkspaceId(raw: unknown): boolean {
  return typeof raw === 'string' && FIRST_PARTY_WORKSPACES.some((w) => w.id === raw)
}

export function firstPartyWorkspaceById(id: string): FirstPartyWorkspace | null {
  return FIRST_PARTY_WORKSPACES.find((w) => w.id === id) ?? null
}

// ─── Rail composition ─────────────────────────────────────────────────────────

interface RailCardBase {
  /** Unique across both kinds — a project id or a `system:` id. */
  readonly id: string
  /** What the rail writes to `?project=` to restore the selection. */
  readonly selectionKey: string
  readonly label: string
  readonly color: string
  readonly href: string
}

/**
 * One card on the rail.
 *
 * A discriminated union rather than a widened project shape: a reader of this
 * type cannot treat a system workspace as a project without narrowing first,
 * and `kind` is the thing the card renders its badges from.
 */
export type AtlasRailCard =
  | (RailCardBase & { readonly kind: 'PROJECT'; readonly project: AtlasHomeProjectSummary })
  | (RailCardBase & { readonly kind: 'SYSTEM_WORKSPACE'; readonly workspace: FirstPartyWorkspace })

/**
 * Compose the rail.
 *
 * The operator's own portfolio comes first — it is the reason the rail exists —
 * and first-party workspaces follow. Pure: no clock, no database, no auth. The
 * projects passed in have already been authorized by the server; this function
 * neither adds to that set nor filters it.
 */
export function composeAtlasRailCards(
  projects: readonly AtlasHomeProjectSummary[],
  workspaces: readonly FirstPartyWorkspace[] = FIRST_PARTY_WORKSPACES,
): AtlasRailCard[] {
  const projectCards = projects.map<AtlasRailCard>((project) => ({
    kind: 'PROJECT',
    id: project.id,
    selectionKey: project.slug,
    label: project.name,
    color: project.color,
    href: project.href,
    project,
  }))

  const workspaceCards = workspaces.map<AtlasRailCard>((workspace) => ({
    kind: 'SYSTEM_WORKSPACE',
    id: workspace.id,
    selectionKey: workspace.id,
    label: workspace.name,
    color: workspace.color,
    href: workspace.href,
    workspace,
  }))

  return [...projectCards, ...workspaceCards]
}

/**
 * Which card a rail selection token refers to.
 *
 * The rail persists its selection in `?project=`, and that parameter is a
 * PRESENTATION TOKEN, not an authorization input. Nothing on this path reads
 * the database, consults `getAllowedProjectIds`, or mutates anything: it is a
 * lookup against cards the server has already authorized and handed over.
 *
 * A project card matches on its slug; a system workspace matches on its
 * `system:` id. The two namespaces cannot collide, because a slug may not
 * contain a colon — so `resolveProjectSlug('system:trading')` returns null and
 * the DB path stays fail-closed while the rail still restores the right card.
 *
 * An unknown or absent token selects the first card rather than nothing: the
 * rail always has a selection, and a stale link should land somewhere sensible
 * instead of on an empty rail.
 */
export function resolveRailSelectionIndex(
  cards: readonly AtlasRailCard[],
  token: string | null | undefined,
): number {
  if (!token) return 0
  const index = cards.findIndex((card) => card.selectionKey === token)
  return index >= 0 ? index : 0
}
