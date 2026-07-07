// ─────────────────────────────────────────────────────────────────────────────
//  Project media settings
//  ─────────────────────────────────────────────────────────────────────────────
//  Per-project media-pipeline configuration, stored in `projects.settings.media`
//  (JSONB). This replaces the hardcoded "The Prompt" branding/schedule that used
//  to live in the media dashboard. Each project that runs a media pipeline opts
//  in via `enabled: true`; projects without it get a graceful empty state.
// ─────────────────────────────────────────────────────────────────────────────

export type MediaScheduleSlot = {
  /** Human label, e.g. "Morgon" / "Kväll". */
  label: string
  /** UTC HH:mm the pipeline starts. */
  pipeline: string
  /** UTC HH:mm publication happens. */
  publish: string
}

export type ProjectMediaSettings = {
  /** When false/absent, the project has no media pipeline → empty state. */
  enabled: boolean
  /** Logo initials (1–3 chars). Falls back to initials derived from name. */
  brandInitials?: string
  /** Subtitle under the project name. */
  tagline?: string
  /** Primary social platform for the token-health card. Default: 'instagram'. */
  platform?: string
  /** Pipeline/publish schedule (UTC). Empty/absent → schedule card hidden. */
  schedule?: MediaScheduleSlot[]
}

/** Loosely-typed shape of the JSONB `settings` column. */
export type ProjectSettings = {
  media?: Partial<ProjectMediaSettings>
  [key: string]: unknown
}

/**
 * Derive brand initials from a project name when none are configured.
 * "Familje-Stunden" → "FS", "GainPilot" → "GP", "The Prompt" → "TP".
 */
export function deriveInitials(name: string): string {
  const cleaned = (name ?? '').trim()
  if (!cleaned) return '–'
  const words = cleaned.split(/[\s\-_]+/).filter(Boolean)
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return words
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Resolve the effective media settings for a project, applying defaults and
 * deriving branding from the project name/color where not explicitly set.
 */
export function resolveMediaSettings(
  project: { name: string; settings?: ProjectSettings | null },
): ProjectMediaSettings & { brandInitials: string; platform: string; schedule: MediaScheduleSlot[] } {
  const media = (project.settings?.media ?? {}) as Partial<ProjectMediaSettings>
  return {
    enabled: media.enabled === true,
    brandInitials: media.brandInitials?.trim() || deriveInitials(project.name),
    tagline: media.tagline,
    platform: media.platform?.trim() || 'instagram',
    schedule: Array.isArray(media.schedule) ? media.schedule : [],
  }
}

/**
 * Next cron time from a schedule (UTC). Returns null when no schedule is set.
 * Picks the next pipeline slot today, else the first slot tomorrow.
 */
export function getNextCronFromSchedule(
  schedule: MediaScheduleSlot[],
  now: Date = new Date(),
): Date | null {
  if (!schedule.length) return null

  const parsed = schedule
    .map((s) => {
      const [h, m] = (s.pipeline ?? '').split(':').map((n) => parseInt(n, 10))
      return Number.isFinite(h) && Number.isFinite(m) ? { hour: h, minute: m } : null
    })
    .filter((x): x is { hour: number; minute: number } => x !== null)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

  if (!parsed.length) return null

  for (const t of parsed) {
    const c = new Date(now)
    c.setUTCHours(t.hour, t.minute, 0, 0)
    if (c > now) return c
  }
  const first = parsed[0]
  const t = new Date(now)
  t.setUTCDate(t.getUTCDate() + 1)
  t.setUTCHours(first.hour, first.minute, 0, 0)
  return t
}
