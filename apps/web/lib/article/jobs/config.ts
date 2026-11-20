/**
 * lib/article/jobs/config.ts
 *
 * Feature flag and budgets for the website-article workflow (Workflow B).
 *
 * OFF unless THEPROMPT_ARTICLE_JOBS_ENABLED is exactly "true". Any other value,
 * including "1" or "TRUE", leaves it off: turning on paid automation must be a
 * deliberate, exact act. Even when on, only social selections created AFTER
 * THEPROMPT_ARTICLE_JOBS_SINCE are enqueued, so activation never backfills the
 * archive and never produces a surprise bill.
 */

export interface ArticleJobsConfig {
  enabled: boolean
  /** ISO lower bound for social selections that may become article jobs. null → nothing is enqueued. */
  since: string | null
  /** Max NEW jobs enqueued per rolling 24h (social runs 10:00 and 20:00 → 2). */
  dailyMax: number
  /** Attempts before a job is marked failed. */
  maxAttempts: number
  /** Lease length for one worker run, seconds. Must exceed the route's maxDuration. */
  leaseSeconds: number
  /** Back-off after a deferred (cost/stop) outcome, minutes. */
  deferMinutes: number
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function readArticleJobsConfig(env: Record<string, string | undefined> = process.env): ArticleJobsConfig {
  const sinceRaw = env.THEPROMPT_ARTICLE_JOBS_SINCE?.trim() ?? ''
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null
  return {
    enabled: env.THEPROMPT_ARTICLE_JOBS_ENABLED === 'true',
    since,
    dailyMax: intEnv(env.THEPROMPT_ARTICLE_JOBS_DAILY_MAX, 2, 0, 6),
    maxAttempts: intEnv(env.THEPROMPT_ARTICLE_JOBS_MAX_ATTEMPTS, 3, 1, 5),
    leaseSeconds: 600,
    deferMinutes: 60,
  }
}

/** Social statuses that mean "this news item was selected for social publication". */
export const SOCIAL_SELECTED_STATUSES = ['approved', 'ready', 'publishing', 'published'] as const
