/**
 * Server-only, single-project binding. No client-controlled PostHog project IDs.
 * All values must be provisioned by an operator in server environment config.
 * This does not grant mission capability authorization.
 */
import type { PosthogProjectBinding } from './posthog-scoped'

export type PosthogEnvironment = Readonly<{
  POSTHOG_OMNIRA_PROJECT_ID?: string
  POSTHOG_PROJECT_ID?: string
  POSTHOG_PERSONAL_API_KEY?: string
  POSTHOG_APP_HOST?: string
}>

export function loadPosthogBindings(env: PosthogEnvironment): readonly PosthogProjectBinding[] {
  const omniraProjectId = env.POSTHOG_OMNIRA_PROJECT_ID?.trim()
  const projectIdText = env.POSTHOG_PROJECT_ID?.trim()
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY?.trim()
  const appHost = env.POSTHOG_APP_HOST?.trim()
  // Missing configuration is not "all projects"; it always means unavailable.
  if (!omniraProjectId || !projectIdText || !personalApiKey || !appHost) return []
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(omniraProjectId)) return []
  if (!/^[1-9][0-9]*$/.test(projectIdText)) return []
  const projectId = Number(projectIdText)
  if (!Number.isSafeInteger(projectId)) return []
  if (appHost !== 'https://eu.posthog.com' && appHost !== 'https://us.posthog.com') return []
  return [{ omniraProjectId, posthog: { projectId, personalApiKey, appHost } }]
}
