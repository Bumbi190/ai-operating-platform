/**
 * lib/atlas/lifecycle.ts — Atlas project lifecycle mode types and helpers.
 *
 * A project's atlas_mode determines which Atlas capabilities are active:
 *
 *   active   = full pipeline: signals → analysis → opportunities → execution
 *   observer = data collection + analysis only; no execution surface
 *   hibernate = no collection; architecture scaffolding only
 *   archived  = permanently retired; historical data preserved; no new activity
 *
 * Current assignments (2026-06-23):
 *   The Prompt       → active
 *   Familje-Stunden  → observer
 *   GainPilot        → hibernate
 *
 * Rule of thumb: if isCollectable() → run collectors.
 *                if isExecutable()  → allow recommendations + execution workflows.
 */

export const ATLAS_MODES = ['active', 'observer', 'hibernate', 'archived'] as const
export type AtlasMode = (typeof ATLAS_MODES)[number]

export const ATLAS_MODE_LABELS: Record<AtlasMode, string> = {
  active:    'Active',
  observer:  'Observer',
  hibernate: 'Hibernate',
  archived:  'Archived',
}

/** Active: full pipeline including execution workflows. */
export const isActive = (mode: AtlasMode): boolean => mode === 'active'

/**
 * Collectable: project receives scheduled collector runs.
 * Both active and observer projects collect data continuously.
 * Hibernate and archived projects do not.
 */
export const isCollectable = (mode: AtlasMode): boolean =>
  mode === 'active' || mode === 'observer'

/**
 * Executable: project may receive Atlas recommendations and
 * have automation workflows authored on its behalf.
 * Observer projects must never trigger execution — analysis only.
 */
export const isExecutable = (mode: AtlasMode): boolean => mode === 'active'

/** Retired: permanently archived; no collection, no execution. */
export const isArchived = (mode: AtlasMode): boolean => mode === 'archived'
